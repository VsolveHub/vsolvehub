"""Customer-owned visit times and fixed-time Partner dispatch."""

from datetime import time, timedelta
from http import HTTPStatus

import pytest
from django.core import signing
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.catalog.models import ServiceVariant
from apps.partners import capabilities
from apps.partners.models import PartnerAvailabilityRule, PartnerCapability, PartnerService
from apps.requirements import access, matching, services, visit_slots
from apps.requirements.exceptions import VisitPlanNotChargeableError, VisitSlotExpiredError
from apps.requirements.models import (
    CustomerRequirement,
    M2AccessPrice,
    VendorInvitation,
    VisitPlanShare,
)

from .conftest import M2World, draft_requirement

pytestmark = pytest.mark.django_db
VISIT_DURATION_MINUTES = 60


def _approve_second_project_partner(world: M2World) -> None:
    capability = capabilities.request_capability(
        partner=world.other_vendor,
        variant=world.project_variant,
    )
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.UNDER_REVIEW,
        actor=None,
        reason_code="queued",
    )
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.APPROVED,
        actor=None,
        reason_code="approved",
    )


def _make_partners_available(world: M2World) -> None:
    for partner in (world.vendor, world.other_vendor):
        PartnerService.objects.update_or_create(
            partner=partner,
            variant=world.project_variant,
            defaults={"is_active": True},
        )
        for weekday in range(7):
            PartnerAvailabilityRule.objects.create(
                partner=partner,
                service_area=world.area,
                weekday=weekday,
                starts_at=time(9),
                ends_at=time(18),
            )


def _draft_with_plan(world: M2World, *, size: int = 2) -> CustomerRequirement:
    _approve_second_project_partner(world)
    _make_partners_available(world)
    M2AccessPrice.objects.create(
        kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
        plan_size=size,
        amount_paise=9_900,
        vendor_payout_basis_points=8_000,
        effective_from=timezone.localdate() - timedelta(days=1),
    )
    requirement = draft_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    configuration = requirement.configuration
    assert configuration is not None
    configuration.visit_duration_minutes = VISIT_DURATION_MINUTES
    configuration.save(update_fields=("visit_duration_minutes",))
    access.choose_visit_plan(
        requirement_id=requirement.id,
        plan_size=size,
        actor=world.customer,
    )
    return requirement


def _available_slot_ids(requirement: CustomerRequirement, *, count: int) -> list[str]:
    grid = visit_slots.candidate_customer_visit_starts(requirement=requirement)
    available = [slot.id for day in grid.days for slot in day.windows if slot.is_available]
    non_overlapping = available[::3]
    assert len(non_overlapping) >= count
    return non_overlapping[:count]


def _choose_and_submit(world: M2World, *, size: int = 2) -> CustomerRequirement:
    requirement = _draft_with_plan(world, size=size)
    slot_ids = _available_slot_ids(requirement, count=size)
    visit_slots.choose_customer_visit_slots(
        requirement_id=requirement.id,
        actor=world.customer,
        slot_ids=slot_ids,
    )
    services.submit_requirement(
        requirement=requirement,
        actor=world.customer,
        allow_duplicate=True,
    )
    matching.open_matching_on_submission(requirement_id=requirement.id)
    requirement.refresh_from_db()
    return requirement


def test_legacy_capture_fields_are_accepted_but_not_processed(world: M2World) -> None:
    response = world.customer_client.post(
        "/api/v1/requirements/",
        {
            "variant_id": str(world.project_variant.id),
            "answers": {"deliverable": "Repaint the first floor"},
            "language": "te-IN",
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.CREATED
    requirement = CustomerRequirement.objects.get(pk=response.json()["id"])
    assert requirement.language == "en-IN"

    updated = world.customer_client.patch(
        f"/api/v1/requirements/{requirement.id}/",
        {"additional_details": "Old client narrative", "language": "hi-IN"},
        format="json",
    )
    assert updated.status_code == HTTPStatus.OK
    requirement.refresh_from_db()
    assert requirement.additional_details == ""
    assert requirement.language == "en-IN"


def test_customer_must_choose_one_signed_slot_per_requested_estimate(world: M2World) -> None:
    requirement = _draft_with_plan(world, size=2)
    slot_ids = _available_slot_ids(requirement, count=2)

    response = world.customer_client.post(
        f"/api/v1/requirements/{requirement.id}/visit-slots/",
        {"slot_ids": slot_ids},
        format="json",
        HTTP_IDEMPOTENCY_KEY="choose-two-slots",
    )

    assert response.status_code == HTTPStatus.OK
    assert [row["matching_status"] for row in response.json()["slots"]] == [
        "SEARCHING",
        "SEARCHING",
    ]
    assert all(row["requested_start"] for row in response.json()["slots"])


def test_expired_customer_slot_token_has_a_stable_error_code(
    world: M2World, monkeypatch: pytest.MonkeyPatch
) -> None:
    requirement = _draft_with_plan(world, size=1)

    def expired(*_args: object, **_kwargs: object) -> object:
        raise signing.SignatureExpired

    monkeypatch.setattr(signing, "loads", expired)
    with pytest.raises(VisitSlotExpiredError) as excinfo:
        visit_slots.read_customer_visit_slot(slot_id="expired", requirement_id=requirement.id)
    assert excinfo.value.code == "slot_expired"


def test_fixed_visit_offer_contains_the_customer_time_and_earning(world: M2World) -> None:
    requirement = _choose_and_submit(world)
    invitation = VendorInvitation.objects.filter(
        requirement=requirement,
        partner=world.vendor,
    ).first()
    assert invitation is not None

    response = world.vendor_client.get(f"/api/v1/partner/enquiries/{invitation.id}/")

    assert response.status_code == HTTPStatus.OK
    payload = response.json()
    assert payload["fixed_visit_start"] is not None
    assert payload["fixed_visit_duration_minutes"] == VISIT_DURATION_MINUTES
    assert payload["fixed_visit_earning_paise"] > 0
    assert "language" not in payload
    assert "additional_details" not in payload


def test_first_partner_acceptance_wins_the_customer_slot(world: M2World) -> None:
    requirement = _choose_and_submit(world)
    share = requirement.visit_plan.shares.order_by("position").first()
    assert share is not None
    first = VendorInvitation.objects.get(requested_visit_share=share, partner=world.vendor)
    second = VendorInvitation.objects.get(requested_visit_share=share, partner=world.other_vendor)

    won = world.vendor_client.post(
        f"/api/v1/partner/enquiries/{first.id}/accept/",
        format="json",
        HTTP_IDEMPOTENCY_KEY="accept-fixed-slot-first",
    )
    lost = world.other_vendor_client.post(
        f"/api/v1/partner/enquiries/{second.id}/accept/",
        format="json",
        HTTP_IDEMPOTENCY_KEY="accept-fixed-slot-second",
    )

    assert won.status_code == HTTPStatus.OK
    assert lost.status_code == HTTPStatus.CONFLICT
    assert lost.json()["error"]["code"] == "slot_taken"
    share.refresh_from_db()
    assert share.matching_status == VisitPlanShare.MatchingStatus.HELD
    assert share.partner == world.vendor


def test_matching_exhaustion_is_explicit_and_charges_nothing(world: M2World) -> None:
    requirement = _draft_with_plan(world, size=1)
    slot_id = _available_slot_ids(requirement, count=1)[0]
    visit_slots.choose_customer_visit_slots(
        requirement_id=requirement.id,
        actor=world.customer,
        slot_ids=[slot_id],
    )
    PartnerAvailabilityRule.objects.all().delete()
    services.submit_requirement(
        requirement=requirement,
        actor=world.customer,
        allow_duplicate=True,
    )

    invitations = matching.open_matching_on_submission(requirement_id=requirement.id)

    assert invitations == []
    share = requirement.visit_plan.shares.get()
    assert share.matching_status == VisitPlanShare.MatchingStatus.NO_PROFESSIONAL_FOUND
    assert requirement.visit_plan.payment_attempt_id is None


def test_visit_plan_checkout_is_refused_until_a_partner_holds_a_slot(world: M2World) -> None:
    requirement = _draft_with_plan(world, size=1)

    with pytest.raises(VisitPlanNotChargeableError):
        access.create_visit_plan_checkout(
            requirement_id=requirement.id,
            actor=world.customer,
            idempotency_key="cannot-charge-without-supply",
        )


def test_unpaid_hold_expiry_releases_capacity_and_reopens_matching(world: M2World) -> None:
    requirement = _choose_and_submit(world, size=1)
    share = requirement.visit_plan.shares.get()
    invitation = VendorInvitation.objects.get(requested_visit_share=share, partner=world.vendor)
    confirmation = access.accept_fixed_visit_offer(invitation_id=invitation.id)
    Reservation.objects.filter(site_visit_id=confirmation.visit.id).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )

    access.release_expired_visit_hold(site_visit_id=confirmation.visit.id)

    share.refresh_from_db()
    invitation.refresh_from_db()
    assert share.status == VisitPlanShare.Status.OPEN
    assert share.matching_status == VisitPlanShare.MatchingStatus.SEARCHING
    assert share.partner_id is None
    assert invitation.status == VendorInvitation.Status.WITHDRAWN
    assert VendorInvitation.objects.filter(
        requested_visit_share=share,
        status=VendorInvitation.Status.INVITED,
        wave=2,
    ).exists()
