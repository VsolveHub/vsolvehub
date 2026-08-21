"""What a `JSONField` is allowed to receive, on the columns that take vendor input.

## The failure this file exists to prevent coming back

DRF *validated* data is not JSON. It is Python objects: `ProposalStageSerializer.ends_on` is a
`DateField`, so every stage carrying a milestone date arrived at the domain holding a
`datetime.date`. `Proposal.stages` was a plain `JSONField`, which encodes with the stdlib encoder,
and that raises `TypeError: Object of type date is not JSON serializable`.

The shape of the failure is what made it expensive to find:

* it fires **inside** `submit_proposal`'s transaction, so the quote that was just built rolls back,
* it reaches the vendor as `internal_error`, which names nothing,
* and it fires **only when a stage has a date**, so an estimate with undated stages submits
  perfectly and the endpoint looks healthy.

Any vendor who dated a milestone simply could not send a quote.

This is the second instance of one class of bug — a validated value that is not JSON reaching a
JSON column. The first was UUIDs in an idempotency response body; see
`tests/foundation/test_idempotent_response_body.py`. Both are asserted rather than remembered.
"""

from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.requirements import access, proposals
from apps.requirements.exceptions import RequirementTransitionError
from apps.requirements.models import Proposal, SiteVisit
from apps.requirements.serializers import ProposalStageSerializer
from tests.requirements.conftest import (
    M2World,
    invitation_for,
    site_visit_for,
    submitted_requirement,
)

pytestmark = pytest.mark.django_db(transaction=True)
STAGE_DURATION_DAYS = 4


def _completed_visit(world: M2World) -> tuple[object, SiteVisit]:
    requirement = submitted_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    visit = site_visit_for(invitation=invitation)
    visit.status = SiteVisit.Status.SCHEDULED
    visit.save(update_fields=("status", "updated_at"))
    arrival_code = access.issue_visit_arrival_code(
        site_visit_id=visit.id,
        customer=world.customer,
    )
    access.confirm_visit_arrival_with_code(
        site_visit_id=visit.id,
        vendor_user=world.vendor.user,
        code=arrival_code.digits or "",
    )
    access.complete_plan_visit(site_visit_id=visit.id)
    visit.refresh_from_db()
    return invitation, visit


def test_a_dated_stage_can_actually_be_submitted(world: M2World) -> None:
    """The regression itself. A `date` in a stage used to take the whole command down."""

    invitation, visit = _completed_visit(world)

    proposal = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=300_000,
        tax_basis="EXCLUSIVE",
        stages=[
            {"title": "Strip out", "amount_paise": 120_000, "ends_on": date(2026, 9, 10)},
            {"title": "Fit out", "amount_paise": 180_000, "ends_on": date(2026, 9, 30)},
        ],
        site_visit_id=visit.id,
    )

    assert proposal.status == Proposal.Status.SUBMITTED


def test_the_date_is_stored_as_the_string_the_api_publishes(world: M2World) -> None:
    """Read back from the database, not from the in-memory instance.

    `refresh_from_db` is the point of the test: the in-memory object still holds whatever was
    assigned, and only a round trip proves the *column* accepted it.
    """

    invitation, visit = _completed_visit(world)
    proposal = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=120_000,
        tax_basis="EXCLUSIVE",
        stages=[{"title": "Strip out", "amount_paise": 120_000, "ends_on": date(2026, 9, 10)}],
        site_visit_id=visit.id,
    )

    proposal.refresh_from_db()

    assert proposal.stages[0]["ends_on"] == "2026-09-10"


def test_an_undated_stage_still_works(world: M2World) -> None:
    """The path that always worked, kept honest.

    `ends_on` is optional, and an estimate of undated stages submitted perfectly throughout the
    bug — which is exactly why the endpoint looked healthy while half its callers could not use it.
    """

    invitation, visit = _completed_visit(world)
    proposal = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=120_000,
        tax_basis="EXCLUSIVE",
        stages=[{"title": "Strip out", "amount_paise": 120_000}],
        site_visit_id=visit.id,
    )

    proposal.refresh_from_db()

    assert proposal.stages[0].get("ends_on") is None


def test_stage_start_and_duration_freeze_the_same_deadline() -> None:
    serializer = ProposalStageSerializer(
        data={
            "title": "Painting",
            "amount_paise": 120_000,
            "starts_on": "2026-09-10",
            "duration_days": STAGE_DURATION_DAYS,
            "ends_on": "2026-09-13",
        }
    )

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["starts_on"] == date(2026, 9, 10)
    assert serializer.validated_data["duration_days"] == STAGE_DURATION_DAYS
    assert serializer.validated_data["ends_on"] == date(2026, 9, 13)


def test_stage_deadline_cannot_disagree_with_its_start_and_duration() -> None:
    serializer = ProposalStageSerializer(
        data={
            "title": "Painting",
            "amount_paise": 120_000,
            "starts_on": "2026-09-10",
            "duration_days": STAGE_DURATION_DAYS,
            "ends_on": "2026-09-20",
        }
    )

    assert not serializer.is_valid()
    assert "ends_on" in serializer.errors


def test_a_customer_rejected_estimate_cannot_be_revised(world: M2World) -> None:
    invitation, visit = _completed_visit(world)
    estimate = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=120_000,
        tax_basis="EXCLUSIVE",
        stages=[{"title": "Strip out", "amount_paise": 120_000}],
        site_visit_id=visit.id,
    )
    Proposal.objects.filter(pk=estimate.id).update(status=Proposal.Status.REJECTED)

    with pytest.raises(RequirementTransitionError, match="can no longer be revised"):
        proposals.submit_proposal(
            invitation_id=invitation.id,
            total_paise=125_000,
            tax_basis="EXCLUSIVE",
            stages=[{"title": "Strip out", "amount_paise": 125_000}],
            site_visit_id=visit.id,
        )


def test_a_project_estimate_revision_closes_after_five_minutes(world: M2World) -> None:
    invitation, visit = _completed_visit(world)
    estimate = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=120_000,
        tax_basis="EXCLUSIVE",
        stages=[{"title": "Strip out", "amount_paise": 120_000}],
        site_visit_id=visit.id,
    )
    Proposal.objects.filter(pk=estimate.id).update(
        submitted_at=timezone.now() - timedelta(minutes=6)
    )

    with pytest.raises(RequirementTransitionError, match="first 5 minutes"):
        proposals.submit_proposal(
            invitation_id=invitation.id,
            total_paise=125_000,
            tax_basis="EXCLUSIVE",
            stages=[{"title": "Strip out", "amount_paise": 125_000}],
            site_visit_id=visit.id,
        )
