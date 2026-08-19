"""Slot accounting on the A3 rate-card path, where an offer is a broadcast rather than a claim.

The cascade invites `wave_size` leads at once and lets the first answer win. Counting `INVITED`
against a ceiling of one therefore refused **every** lead in a wave with
`m2_invitation_slots_exhausted` — "another lead answered first" when nobody had answered at all,
and a wave of three that no one could accept. `matching._slot_holding_statuses` narrows the count
to committing statuses on this path only; the quote flow keeps the broad tuple, where an invited
vendor genuinely does occupy one of `max_quotes` working slots.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.requirements import matching
from apps.requirements.exceptions import QuoteSlotsExhaustedError
from apps.requirements.models import (
    CustomerRequirement,
    RateCard,
    RateCardBooking,
    VendorInvitation,
)

from .conftest import M2World, invitation_for, submitted_requirement

pytestmark = pytest.mark.django_db


def _rate_card_booking(*, world: M2World, requirement: CustomerRequirement) -> RateCardBooking:
    """A dispatchable rate-card booking, built directly.

    Deliberately not through `publish_rate_card` / `book_at_published_rate`: this file is about
    slot accounting, and routing through the wage-floor guard and the cascade would make a
    published-price policy change able to fail these tests for an unrelated reason.
    """
    card = RateCard.objects.create(
        service_area=world.area,
        skill=world.skill,
        worker_day_wage_paise=60_000,
        supervision_margin_paise=25_000,
        booking_fee_paise=5_000,
        customer_day_rate_paise=90_000,
        standard_day_hours=8,
        overtime_hourly_paise=11_250,
        add_on_rates={},
        inclusions=[],
        effective_from=timezone.localdate() - timedelta(days=1),
    )
    return RateCardBooking.objects.create(
        requirement=requirement,
        rate_card=card,
        status=RateCardBooking.Status.MATCHING,
        headcount=3,
        days=2,
        day_rate_paise=90_000,
        worker_day_wage_paise=60_000,
        supervision_margin_paise=25_000,
        booking_fee_component_paise=5_000,
        standard_day_hours=8,
        overtime_hourly_paise=11_250,
        add_on_rates={},
        inclusions=[],
        total_customer_paise=540_000,
        lead_receipt_paise=510_000,
        booking_fee_paise=5_000,
        wave=1,
    )


def test_a_lead_can_accept_while_other_leads_are_still_invited(world: M2World) -> None:
    """The regression. Two leads invited, neither has answered, so the first may take the job."""
    requirement = submitted_requirement(world=world)
    _rate_card_booking(world=world, requirement=requirement)
    first = invitation_for(requirement=requirement, partner=world.vendor)
    invitation_for(requirement=requirement, partner=world.other_vendor)

    accepted = matching.accept_invitation(invitation_id=first.id)

    assert accepted.status == VendorInvitation.Status.ACCEPTED


def test_the_second_lead_is_refused_once_the_first_has_answered(world: M2World) -> None:
    """One crew per rate-card job survives the narrowing — and now the refusal is *true*."""
    requirement = submitted_requirement(world=world)
    _rate_card_booking(world=world, requirement=requirement)
    first = invitation_for(requirement=requirement, partner=world.vendor)
    second = invitation_for(requirement=requirement, partner=world.other_vendor)

    matching.accept_invitation(invitation_id=first.id)

    with pytest.raises(QuoteSlotsExhaustedError):
        matching.accept_invitation(invitation_id=second.id)


def test_the_quote_flow_still_counts_an_invitation_as_holding_a_slot(world: M2World) -> None:
    """The narrowing is rate-card only.

    Without a dispatchable `RateCardBooking` this is an ordinary quote requirement, where being
    invited *does* occupy one of `max_quotes` slots. Pinned so a future tidy-up cannot quietly
    apply the rate-card rule everywhere and let more vendors quote than the ceiling allows.
    """
    requirement = submitted_requirement(
        world=world, archetype=ServiceVariant.BookingArchetype.A3_TIME_BLOCK
    )
    assert not RateCardBooking.objects.filter(requirement=requirement).exists()

    assert matching._slot_holding_statuses(requirement) == VendorInvitation.SLOT_HOLDING_STATUSES


def test_a_fell_back_booking_returns_to_quote_slot_accounting(world: M2World) -> None:
    """`FELL_BACK` is not dispatchable, so the requirement is back on the quote flow's rules.

    This is the boundary that makes `fall_back_to_quote_flow` safe: the moment it stops being a
    crew job, an invited vendor holds a quote slot again.
    """
    requirement = submitted_requirement(world=world)
    booking = _rate_card_booking(world=world, requirement=requirement)
    assert matching._slot_holding_statuses(requirement) == (
        VendorInvitation.Status.ACCEPTED,
        VendorInvitation.Status.QUOTED,
    )

    booking.status = RateCardBooking.Status.FELL_BACK
    booking.save(update_fields=("status",))

    assert matching._slot_holding_statuses(requirement) == VendorInvitation.SLOT_HOLDING_STATUSES


def _live_offer_ids(world: M2World) -> set[str]:
    response = world.vendor_client.get("/api/v1/partner/crew-offers/")
    assert response.status_code == HTTPStatus.OK
    return {offer["invitation_id"] for offer in response.json()["offers"]}


def test_a_lapsed_offer_is_gone_before_the_sweep_reaches_it(world: M2World) -> None:
    """`INVITED` is not the same question as "can this still be answered".

    The offer timeout is wall-clock minutes and the expiry sweep runs on its own schedule, so
    between the two there is a window where a dead offer still carries `INVITED`. A lead who opens
    one inside it is told another lead answered first, which did not happen. The list filters on
    the deadline itself so the window never reaches a screen.
    """
    requirement = submitted_requirement(world=world)
    _rate_card_booking(world=world, requirement=requirement)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    assert str(invitation.id) in _live_offer_ids(world)

    VendorInvitation.objects.filter(pk=invitation.pk).update(
        responds_by=timezone.now() - timedelta(seconds=1)
    )

    invitation.refresh_from_db()
    assert invitation.status == VendorInvitation.Status.INVITED, "the sweep has not run yet"
    assert str(invitation.id) not in _live_offer_ids(world)


def test_an_offer_for_a_parked_job_is_gone_too(world: M2World) -> None:
    """Exhaust withdraws outstanding offers; this makes a missed withdrawal invisible anyway.

    Belt and braces on purpose. The withdrawal is the mechanism, but it runs in the same
    transaction as a state change that could grow more branches later, and an offer for a job
    nobody is dispatching must never be answerable whichever way it survived.
    """
    requirement = submitted_requirement(world=world)
    booking = _rate_card_booking(world=world, requirement=requirement)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    assert str(invitation.id) in _live_offer_ids(world)

    # The status write alone, deliberately skipping `exhaust_cascade`'s withdrawal.
    booking.status = RateCardBooking.Status.EXHAUSTED
    booking.save(update_fields=("status",))

    assert str(invitation.id) not in _live_offer_ids(world)
