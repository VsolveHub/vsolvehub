"""Offers that interrupt, waves that refill, and the visit-day contact rung (2026-09-01).

Three properties, each the inverse of a defect this build closed:

* **Every offer tells its Partner.** `m2.fixed_visit_offer.received` was emitted and consumed by
  nobody — the one offer type built around a Customer-chosen time was the only one with no notice.
* **A promise of N quotes stays N wide.** Declining released a slot that nothing ever refilled;
  a share whose last invitation died settled `NO_PROFESSIONAL_FOUND` on the spot.
* **The visit fee buys a meeting, not an anonymous address.** Name with the address; phone only
  while the meeting is operationally live.
"""

import uuid
from datetime import time, timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.foundation.models import OutboxEvent
from apps.notifications.models import NotificationIntent
from apps.partners import capabilities
from apps.partners.models import PartnerAvailabilityRule, PartnerCapability, PartnerService
from apps.requirements import access, matching, proposals, services, tasks, visit_slots
from apps.requirements.exceptions import VisitSlotUnavailableError
from apps.requirements.models import (
    CustomerRequirement,
    M2AccessPrice,
    SiteVisit,
    VendorInvitation,
    VisitPlanShare,
)
from apps.requirements.notifications import notify_for_outbox_event

from .conftest import (
    M2World,
    draft_requirement,
    invitation_for,
    site_visit_for,
    submitted_requirement,
)

pytestmark = pytest.mark.django_db

VISIT_DURATION_MINUTES = 60
FIXED_VISIT_TIMEOUT_SECONDS = 300
BOTH_PARTNERS = 2


# ---------------------------------------------------------------------------
# A5 fixtures: a dispatchable Customer-chosen visit
# ---------------------------------------------------------------------------


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


def _submitted_fixed_visit(world: M2World) -> CustomerRequirement:
    """One submitted A5 requirement with one dispatched Customer-chosen slot."""
    _approve_second_project_partner(world)
    _make_partners_available(world)
    M2AccessPrice.objects.create(
        kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
        plan_size=1,
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
    configuration.fixed_visit_offer_timeout_seconds = FIXED_VISIT_TIMEOUT_SECONDS
    configuration.save(
        update_fields=("visit_duration_minutes", "fixed_visit_offer_timeout_seconds")
    )
    access.choose_visit_plan(requirement_id=requirement.id, plan_size=1, actor=world.customer)
    grid = visit_slots.candidate_customer_visit_starts(requirement=requirement)
    available = [slot.id for day in grid.days for slot in day.windows if slot.is_available]
    assert available
    visit_slots.choose_customer_visit_slots(
        requirement_id=requirement.id,
        actor=world.customer,
        slot_ids=[available[0]],
    )
    services.submit_requirement(
        requirement=requirement,
        actor=world.customer,
        allow_duplicate=True,
    )
    matching.open_matching_on_submission(requirement_id=requirement.id)
    requirement.refresh_from_db()
    return requirement


def _the_share(requirement: CustomerRequirement) -> VisitPlanShare:
    return requirement.visit_plan.shares.get()


# ---------------------------------------------------------------------------
# The fixed-visit offer notifies its Partner
# ---------------------------------------------------------------------------


def test_fixed_visit_offer_route_targets_the_enquiry(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    event = OutboxEvent.objects.create(
        event_type="m2.fixed_visit_offer.received",
        idempotency_key=f"test-fixed-visit-offer:{uuid.uuid4()}",
        aggregate_type="vendor_invitation",
        aggregate_id=invitation.id,
        payload={
            "requirement_id": str(requirement.id),
            "vendor_invitation_id": str(invitation.id),
            "visit_earning_paise": 2_940,
        },
    )

    intents = notify_for_outbox_event(event)

    assert len(intents) == 1
    intent = intents[0]
    assert intent.recipient_id == world.vendor.user_id
    assert intent.purpose == "m2.fixed_visit_offer.received"
    assert intent.channel == NotificationIntent.Channel.IN_APP
    assert intent.context["target_id"] == str(invitation.id)
    # The A3-default world requirement resolves WORKFORCE/PROJECT by archetype; what matters is
    # that the target opens the enquiry door the take-or-pass card lives behind.
    assert intent.context["target_kind"] in ("PROJECT_INVITATION", "WORKFORCE_INVITATION")


def test_fixed_visit_dispatch_caps_responds_by_on_the_wall_clock(world: M2World) -> None:
    """A 30-second decision no longer inherits a two-day quote-writing deadline."""
    before = timezone.now()
    requirement = _submitted_fixed_visit(world)

    invitations = list(VendorInvitation.objects.filter(requirement=requirement))

    assert invitations, "the opening dispatch found both available partners"
    ceiling = before + timedelta(seconds=FIXED_VISIT_TIMEOUT_SECONDS + 30)
    for invitation in invitations:
        assert invitation.responds_by is not None
        assert invitation.responds_by <= ceiling, (
            "responds_by must be capped by the wall-clock window, not the business-hours SLA"
        )


# ---------------------------------------------------------------------------
# The searching share: re-dispatch, not a dead end
# ---------------------------------------------------------------------------


def test_a_dead_wave_keeps_searching_instead_of_settling(world: M2World) -> None:
    """The headline change: expiry of the last live offer no longer means giving up."""
    requirement = _submitted_fixed_visit(world)
    share = _the_share(requirement)
    invitations = list(VendorInvitation.objects.filter(requested_visit_share=share))
    assert len(invitations) == BOTH_PARTNERS
    VendorInvitation.objects.filter(requested_visit_share=share).update(
        responds_by=timezone.now() - timedelta(seconds=1),
    )

    for invitation in invitations:
        matching.expire_invitation_and_replace(invitation_id=invitation.id)

    share.refresh_from_db()
    assert share.matching_status == VisitPlanShare.MatchingStatus.SEARCHING, (
        "the visit is two days out; nobody new is free *yet* is not NO_PROFESSIONAL_FOUND"
    )


def test_a_searching_share_settles_once_the_visit_is_too_close(world: M2World) -> None:
    requirement = _submitted_fixed_visit(world)
    share = _the_share(requirement)
    VendorInvitation.objects.filter(requested_visit_share=share).update(
        status=VendorInvitation.Status.EXPIRED,
    )
    VisitPlanShare.objects.filter(id=share.id).update(
        requested_start=timezone.now() + timedelta(minutes=10),
    )

    invited = matching.retry_or_settle_customer_visit_share(share_id=share.id)

    share.refresh_from_db()
    assert invited == []
    assert share.matching_status == VisitPlanShare.MatchingStatus.NO_PROFESSIONAL_FOUND


def test_the_share_sweep_redispatches_to_a_newly_free_partner(world: M2World) -> None:
    """A Partner who becomes eligible after the wave still gets the offer."""
    requirement = _submitted_fixed_visit(world)
    share = _the_share(requirement)
    # Only the first vendor was ever asked; the second's invitation is removed to model a
    # Partner who was ineligible at dispatch time and freed up later.
    VendorInvitation.objects.filter(
        requested_visit_share=share, partner=world.other_vendor
    ).delete()
    VendorInvitation.objects.filter(requested_visit_share=share).update(
        status=VendorInvitation.Status.EXPIRED,
    )

    swept = tasks.sweep_searching_visit_shares()

    share.refresh_from_db()
    assert swept == 1
    assert share.matching_status == VisitPlanShare.MatchingStatus.SEARCHING
    assert VendorInvitation.objects.filter(
        requested_visit_share=share,
        partner=world.other_vendor,
        status=VendorInvitation.Status.INVITED,
    ).exists(), "the re-dispatch reached the newly free partner"


def test_the_share_sweep_is_idempotent(world: M2World) -> None:
    requirement = _submitted_fixed_visit(world)
    share = _the_share(requirement)
    VendorInvitation.objects.filter(requested_visit_share=share).update(
        status=VendorInvitation.Status.EXPIRED,
    )
    VisitPlanShare.objects.filter(id=share.id).update(
        requested_start=timezone.now() + timedelta(minutes=10),
    )

    tasks.sweep_searching_visit_shares()
    swept_again = tasks.sweep_searching_visit_shares()

    share.refresh_from_db()
    assert share.matching_status == VisitPlanShare.MatchingStatus.NO_PROFESSIONAL_FOUND
    assert swept_again == 0


# ---------------------------------------------------------------------------
# The quote wave refills itself
# ---------------------------------------------------------------------------


def test_declining_through_the_api_refills_the_slot(world: M2World) -> None:
    """The exit with buttons in the UI now behaves like every other slot release."""
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)

    response = world.vendor_client.post(
        f"/api/v1/partner/enquiries/{invitation.id}/decline/",
        {"reason_code": "TOO_FAR"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="decline-refills-slot",
    )

    assert response.status_code == HTTPStatus.OK
    replacement = VendorInvitation.objects.filter(requirement=requirement).exclude(id=invitation.id)
    assert replacement.count() == 1
    assert replacement.get().partner_id == world.other_vendor.id


def test_declining_with_nobody_left_still_succeeds(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    first = invitation_for(requirement=requirement, partner=world.vendor)
    world.vendor_client.post(
        f"/api/v1/partner/enquiries/{first.id}/decline/",
        {"reason_code": "TOO_FAR"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="decline-first-of-two",
    )
    second = VendorInvitation.objects.get(requirement=requirement, partner=world.other_vendor)

    response = world.other_vendor_client.post(
        f"/api/v1/partner/enquiries/{second.id}/decline/",
        {"reason_code": "NO_CAPACITY"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="decline-second-of-two",
    )

    assert response.status_code == HTTPStatus.OK, (
        "an empty candidate pool must not turn a decline into an error"
    )
    assert VendorInvitation.objects.filter(requirement=requirement).count() == BOTH_PARTNERS


def test_top_up_refills_and_reports_thin_supply_exactly_once(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    matching.decline_invitation(invitation_id=invitation.id, reason_code="too-far")

    invited = matching.top_up_quote_wave(requirement_id=requirement.id)
    assert len(invited) >= 1
    assert invited[0].partner_id == world.other_vendor.id

    matching.decline_invitation(invitation_id=invited[0].id, reason_code="too-far")
    assert matching.top_up_quote_wave(requirement_id=requirement.id) == []
    assert matching.top_up_quote_wave(requirement_id=requirement.id) == []
    thin_supply = OutboxEvent.objects.filter(
        event_type="m2.quote_wave.thin_supply",
        aggregate_id=requirement.id,
    )
    assert thin_supply.count() == 1, "asked-everyone is said once, not once per tick"


def test_the_underfilled_selector_scopes_to_the_quote_flow(world: M2World) -> None:
    quote_requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=quote_requirement, partner=world.vendor)
    matching.decline_invitation(invitation_id=invitation.id, reason_code="too-far")
    a5_requirement = _submitted_fixed_visit(world)

    underfilled = matching.underfilled_quote_requirement_ids()

    assert quote_requirement.id in underfilled
    assert a5_requirement.id not in underfilled, "A5 shares have their own re-dispatch sweep"


def test_the_top_up_sweep_is_idempotent(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    matching.decline_invitation(invitation_id=invitation.id, reason_code="too-far")

    tasks.sweep_underfilled_quote_waves()
    tasks.sweep_underfilled_quote_waves()

    assert (
        VendorInvitation.objects.filter(requirement=requirement, partner=world.other_vendor).count()
        == 1
    ), "an overlapping tick found the slot already filled and invited nobody"


# ---------------------------------------------------------------------------
# The visit-day contact rung
# ---------------------------------------------------------------------------


def _scheduled_visit(world: M2World, *, starts_in: timedelta) -> tuple[VendorInvitation, SiteVisit]:
    requirement = _submitted_fixed_visit(world)
    share = _the_share(requirement)
    invitation = VendorInvitation.objects.get(requested_visit_share=share, partner=world.vendor)
    visit = SiteVisit.objects.create(
        requirement=requirement,
        invitation=invitation,
        plan_share=share,
        status=SiteVisit.Status.SCHEDULED,
        fee_paise=9_900,
        scheduled_for=timezone.now() + starts_in,
        duration_minutes=VISIT_DURATION_MINUTES,
    )
    return invitation, visit


def test_name_discloses_with_the_address_but_phone_waits_for_the_window(world: M2World) -> None:
    invitation, _visit = _scheduled_visit(world, starts_in=timedelta(hours=6))

    response = world.vendor_client.get(f"/api/v1/partner/enquiries/{invitation.id}/")

    assert response.status_code == HTTPStatus.OK
    payload = response.json()
    assert payload["site_address"] is not None
    assert payload["customer_name"] is not None
    assert payload["customer_phone"] is None, "six hours out is not the visit-day window"


def test_phone_discloses_inside_the_arrival_window(world: M2World) -> None:
    invitation, _visit = _scheduled_visit(world, starts_in=timedelta(hours=1))

    response = world.vendor_client.get(f"/api/v1/partner/enquiries/{invitation.id}/")

    payload = response.json()
    assert payload["customer_phone"] == world.customer.phone_number


# ---------------------------------------------------------------------------
# The event-date ceiling: no visit after the day the work is needed
# ---------------------------------------------------------------------------


def _draft_a5_needing(world: M2World, *, days_out: int) -> CustomerRequirement:
    """A draft A5 with a chosen plan whose event is `days_out` days away."""
    _approve_second_project_partner(world)
    _make_partners_available(world)
    M2AccessPrice.objects.create(
        kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
        plan_size=1,
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
    CustomerRequirement.objects.filter(id=requirement.id).update(
        requested_start=timezone.now() + timedelta(days=days_out),
    )
    requirement.refresh_from_db()
    access.choose_visit_plan(requirement_id=requirement.id, plan_size=1, actor=world.customer)
    return requirement


def test_the_slot_grid_stops_at_the_event_date(world: M2World) -> None:
    """An event on the 5th offers visit days up to the 5th — never the 6th."""
    requirement = _draft_a5_needing(world, days_out=3)

    grid = visit_slots.candidate_customer_visit_starts(requirement=requirement)

    ceiling = timezone.localtime(requirement.requested_start).date()
    assert grid.days, "the days before the event still exist"
    for day in grid.days:
        for window in day.windows:
            assert timezone.localtime(window.starts_at).date() <= ceiling, (
                "the grid offered a visit after the event date"
            )
    # Three days out means at most four grid days; the default week must not leak back in.
    assert len(grid.days) <= days_until_ceiling_inclusive(3)


def days_until_ceiling_inclusive(days_out: int) -> int:
    return days_out + 1


def test_choosing_a_slot_after_the_event_date_is_refused(world: M2World) -> None:
    """A signed token from before the deadline moved must not slip past the shortened grid."""
    requirement = _draft_a5_needing(world, days_out=2)
    late = (timezone.localtime(timezone.now()) + timedelta(days=4)).replace(
        hour=11, minute=0, second=0, microsecond=0
    )
    slot_id = visit_slots.sign_customer_visit_slot(
        requirement_id=requirement.id,
        starts_at=late,
        duration_minutes=VISIT_DURATION_MINUTES,
    )

    with pytest.raises(VisitSlotUnavailableError):
        visit_slots.choose_customer_visit_slots(
            requirement_id=requirement.id,
            actor=world.customer,
            slot_ids=[slot_id],
        )


def test_a_reschedule_cannot_push_a_visit_past_the_event_date(world: M2World) -> None:
    """The one move the clamped pickers cannot bound: an existing visit nudged later."""
    _invitation, visit = _scheduled_visit(world, starts_in=timedelta(hours=6))

    with pytest.raises(VisitSlotUnavailableError):
        proposals.schedule_site_visit(
            site_visit_id=visit.id,
            scheduled_for=timezone.now() + timedelta(days=12),
        )


def test_an_adhoc_visit_cannot_be_scheduled_past_the_event_date(world: M2World) -> None:
    """Quote-flow ad-hoc visits arrive as bare timestamps and obey the same ceiling."""
    requirement = submitted_requirement(world=world)
    VendorInvitation.objects.filter(requirement=requirement).delete()
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    visit = site_visit_for(invitation=invitation)

    with pytest.raises(VisitSlotUnavailableError):
        proposals.schedule_site_visit(
            site_visit_id=visit.id,
            scheduled_for=timezone.now() + timedelta(days=12),
        )


def test_contact_disappears_after_completion(world: M2World) -> None:
    invitation, visit = _scheduled_visit(world, starts_in=timedelta(hours=1))
    SiteVisit.objects.filter(id=visit.id).update(
        status=SiteVisit.Status.COMPLETED,
        completed_at=timezone.now(),
    )

    response = world.vendor_client.get(f"/api/v1/partner/enquiries/{invitation.id}/")

    payload = response.json()
    assert payload["customer_name"] is None
    assert payload["customer_phone"] is None, (
        "post-visit contact belongs to the engagement, not the fee"
    )
