"""A Customer project cannot host two Partner visits at the same time."""

from datetime import datetime, timedelta

import pytest
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.partners import capabilities
from apps.partners.models import PartnerCapability
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


def _two_partner_project(world: M2World) -> tuple[VendorInvitation, VendorInvitation]:
    _approve_project_capability(world)
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
    services.submit_requirement(
        requirement=requirement,
        actor=world.customer,
        allow_duplicate=True,
    )
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
