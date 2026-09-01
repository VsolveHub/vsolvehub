"""A Customer project cannot host two Partner visits at the same time."""

from datetime import datetime, time, timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.partners import capabilities
from apps.partners.models import PartnerAvailabilityRule, PartnerCapability, PartnerService
from apps.requirements import access, services, visit_slots
from apps.requirements.exceptions import VisitSlotUnavailableError
from apps.requirements.models import M2AccessPrice, VendorInvitation

from .conftest import M2World, draft_requirement, invitation_for

pytestmark = pytest.mark.django_db


def _approve_project_capability(world: M2World) -> None:
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


def _two_partner_project(world: M2World) -> tuple[VendorInvitation, VendorInvitation]:
    _approve_project_capability(world)
    _make_partners_available(world)
    M2AccessPrice.objects.create(
        kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
        plan_size=2,
        amount_paise=9900,
        vendor_payout_basis_points=8000,
        effective_from=timezone.localdate() - timedelta(days=1),
    )
    requirement = draft_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    configuration = requirement.configuration
    assert configuration is not None
    configuration.visit_duration_minutes = 60
    configuration.save(update_fields=("visit_duration_minutes",))
    access.choose_visit_plan(
        requirement_id=requirement.id,
        plan_size=2,
        actor=world.customer,
    )
    # Submission has required customer-chosen slot times since BE-2, so choose two.
    grid = visit_slots.candidate_customer_visit_starts(requirement=requirement)
    available = [window.id for day in grid.days for window in day.windows if window.is_available]
    visit_slots.choose_customer_visit_slots(
        requirement_id=requirement.id,
        actor=world.customer,
        slot_ids=available[::3][:2],
    )
    services.submit_requirement(
        requirement=requirement,
        actor=world.customer,
        allow_duplicate=True,
    )
    # These tests exercise the second-look picker (`confirm_visit_slot` against a
    # Partner-signed slot), not the fixed-time broadcast — clear the opening wave's
    # share-linked invitations and mint the share-free shape the picker predates.
    VendorInvitation.objects.filter(requirement=requirement).delete()
    return (
        invitation_for(requirement=requirement, partner=world.vendor),
        invitation_for(requirement=requirement, partner=world.other_vendor),
    )


def _common_available_slot(
    first: VendorInvitation,
    second: VendorInvitation,
) -> tuple[str, str, datetime]:
    first_windows = visit_slots.candidate_visit_starts(invitation=first)
    second_windows = visit_slots.candidate_visit_starts(invitation=second)
    first_available = {
        window.starts_at: window.id
        for day in first_windows.days
        for window in day.windows
        if window.is_available
    }
    second_available = {
        window.starts_at: window.id
        for day in second_windows.days
        for window in day.windows
        if window.is_available
    }
    starts_at = next(iter(first_available.keys() & second_available.keys()))
    return first_available[starts_at], second_available[starts_at], starts_at


def test_another_partner_cannot_confirm_a_project_time_already_held(
    world: M2World,
) -> None:
    first, second = _two_partner_project(world)
    first_slot_id, stale_second_slot_id, starts_at = _common_available_slot(first, second)

    access.confirm_visit_slot(invitation_id=first.id, slot_id=first_slot_id)

    with pytest.raises(VisitSlotUnavailableError):
        access.confirm_visit_slot(invitation_id=second.id, slot_id=stale_second_slot_id)

    second.refresh_from_db()
    assert second.status == VendorInvitation.Status.INVITED
    assert second.site_visits.count() == 0

    refreshed = visit_slots.candidate_visit_starts(invitation=second)
    occupied = next(
        window for day in refreshed.days for window in day.windows if window.starts_at == starts_at
    )
    assert occupied.is_available is False
    assert occupied.unavailable_reason == "NO_CAPACITY"


def test_project_enquiry_reveals_only_locality_until_the_paid_visit_is_scheduled(
    world: M2World,
) -> None:
    invitation, _other = _two_partner_project(world)
    grid = visit_slots.candidate_visit_starts(invitation=invitation)
    slot = next(window for day in grid.days for window in day.windows if window.is_available)

    confirmation = access.confirm_visit_slot(invitation_id=invitation.id, slot_id=slot.id)

    listing = world.vendor_client.get("/api/v1/partner/enquiries/")
    assert listing.status_code == HTTPStatus.OK
    row = next(item for item in listing.json()["results"] if item["id"] == str(invitation.id))
    assert row["approximate_area"] == "Kukatpally, Hyderabad"
    assert "site_address" not in row

    held = world.vendor_client.get(f"/api/v1/partner/enquiries/{invitation.id}/")
    assert held.status_code == HTTPStatus.OK
    assert held.json()["site_address"] is None

    confirmation.visit.status = confirmation.visit.Status.SCHEDULED
    confirmation.visit.save(update_fields=("status", "updated_at"))

    scheduled = world.vendor_client.get(f"/api/v1/partner/enquiries/{invitation.id}/")
    assert scheduled.status_code == HTTPStatus.OK
    assert scheduled.json()["site_address"] == {
        "line1": "Plot 14",
        "line2": "",
        "landmark": "",
        "locality": "Kukatpally",
        "city": "Hyderabad",
        "state": "Telangana",
        "postal_code": "500072",
    }
