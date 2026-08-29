"""A Customer asks for a different estimate; the vendor answers with a revision or declines."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.requirements import proposals
from apps.requirements.exceptions import ProposalNotSelectableError, RequirementTransitionError
from apps.requirements.models import Proposal, RevisionRequest

from .conftest import M2World, invitation_for, proposal_for, submitted_requirement

pytestmark = pytest.mark.django_db


def _live_proposal(world: M2World) -> Proposal:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    return proposal_for(invitation=invitation)


def _open_request(world: M2World, proposal: Proposal) -> RevisionRequest:
    return RevisionRequest.objects.create(
        requirement=proposal.requirement,
        proposal=proposal,
        requested_by=world.customer,
        reason_code=RevisionRequest.ReasonCode.LEAVE_OUT,
        excluded_items=["False ceiling"],
        note="We will do the ceiling later.",
    )


def test_an_open_request_reopens_the_project_revision_window(world: M2World) -> None:
    """Five minutes have passed, but the Customer asked — so the vendor may still revise."""
    proposal = _live_proposal(world)
    proposal.submitted_at = timezone.now() - timedelta(minutes=30)
    proposal.save(update_fields=("submitted_at",))
    requirement = proposal.requirement
    requirement.archetype = "A5_CUSTOM_PROJECT"

    with pytest.raises(RequirementTransitionError):
        proposals._assert_project_revision_allowed(previous=proposal, requirement=requirement)

    _open_request(world, proposal)
    proposals._assert_project_revision_allowed(previous=proposal, requirement=requirement)


def test_a_revalidation_ask_on_an_expired_estimate_is_revisable(world: M2World) -> None:
    proposal = _live_proposal(world)
    proposal.status = Proposal.Status.EXPIRED
    proposal.revalidation_requested_at = timezone.now()
    proposal.save(update_fields=("status", "revalidation_requested_at"))
    requirement = proposal.requirement
    requirement.archetype = "A5_CUSTOM_PROJECT"

    proposals._assert_project_revision_allowed(previous=proposal, requirement=requirement)


def test_the_vendor_can_decline_and_only_once(world: M2World) -> None:
    proposal = _live_proposal(world)
    request = _open_request(world, proposal)

    declined = proposals.decline_revision_request(
        request_id=request.id, partner_id=world.vendor.id, note="The ceiling holds the lights."
    )

    assert declined.status == RevisionRequest.Status.DECLINED
    assert declined.resolved_at is not None
    with pytest.raises(RequirementTransitionError):
        proposals.decline_revision_request(
            request_id=request.id, partner_id=world.vendor.id, note=""
        )


def test_another_vendor_cannot_decline_it(world: M2World) -> None:
    proposal = _live_proposal(world)
    request = _open_request(world, proposal)

    with pytest.raises(Exception):  # noqa: B017 - the not-found refusal is the only outcome wanted
        proposals.decline_revision_request(
            request_id=request.id, partner_id=world.other_vendor.id, note=""
        )


def test_a_customer_cannot_ask_before_they_can_read_the_quotes(world: M2World) -> None:
    """The same entitlement that lets them read an A3 quote lets them ask about it."""
    proposal = _live_proposal(world)

    with pytest.raises(ProposalNotSelectableError):
        proposals.request_revision(
            requirement_id=proposal.requirement_id,
            proposal_id=proposal.id,
            actor=world.customer,
            reason_code=RevisionRequest.ReasonCode.OTHER,
            excluded_items=[],
            note="Cheaper tiles please.",
        )
