"""Booking a crew when no lead can field it.

`advance_cascade` already settles an empty wave, and says why in its own comment: the Customer
"decides what happens to their request rather than watching a holding state that will never
resolve". That rule was written for the second wave onward and never applied to the first.

The consequence is worse for the first wave than for any later one. Every recovery in this cascade
is driven by an **invitation expiring** -- the sweep finds a lapsed offer and calls
`advance_cascade`. A first wave that invites nobody leaves no invitation, so no sweep can ever fire
and nothing can ever advance it. The booking sits `MATCHING` at wave 0 and the Customer watches
"Finding your crew" until they give up.

This is not a rare edge: it is what every request larger than the biggest roster in the city does.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.partners.models import Skill
from apps.requirements import crew_dispatch, rate_cards
from apps.requirements.models import RateCard, RateCardBooking, VendorInvitation

from .conftest import M2World, draft_requirement

pytestmark = pytest.mark.django_db(transaction=True)


def _published_card(world: M2World, skill: Skill) -> RateCard:
    return RateCard.objects.create(
        service_area=world.area,
        skill=skill,
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


def _booked_with_nobody_in_reach(world: M2World) -> RateCardBooking:
    """A booking whose pool is empty: no partner in this world holds a crew roster at all."""
    requirement = draft_requirement(world=world)
    # The card is keyed on the configuration's wage classification, not on the dispatch trade --
    # `rate_card_skill` is explicit that reusing the trade slug would tie a published price to a
    # merchandising decision. So the fixture maps the variant, then publishes against that.
    configuration = requirement.configuration
    assert configuration is not None
    if configuration.wage_floor_skill is None:
        configuration.wage_floor_skill = world.skill
    # The cascade policy is owner configuration and the world does not set it. Named here rather
    # than defaulted in the code under test: `cascade_policy` refuses an unset policy on purpose,
    # so a test that relied on a default would be testing a fallback the product does not have.
    configuration.crew_wave_size = 3
    configuration.crew_wave_widening_step = 2
    configuration.crew_offer_timeout_seconds = 120
    configuration.crew_cascade_max_waves = 4
    configuration.crew_offer_hold_seconds = 900
    # The preset scope. Refused when empty on purpose -- booking instantly against a preset whose
    # scope was never pinned down is the platform publishing a price for work it did not describe.
    if not configuration.a3_preset_question_schema:
        configuration.a3_preset_question_schema = {
            "version": 1,
            "questions": [
                {"code": "worker_count", "label": "People", "kind": "INTEGER"},
                {"code": "duration_days", "label": "Days", "kind": "INTEGER"},
            ],
        }
    configuration.save()
    _published_card(world, rate_cards.rate_card_skill(configuration))
    result = crew_dispatch.book_at_published_rate(
        requirement_id=requirement.id, actor=world.customer, allow_duplicate=True
    )
    assert result.invitations == [], "the fixture must find nobody, or this proves nothing"
    result.booking.refresh_from_db()
    return result.booking


def test_a_booking_nobody_can_take_is_parked_immediately(world: M2World) -> None:
    booking = _booked_with_nobody_in_reach(world)

    assert booking.status == RateCardBooking.Status.EXHAUSTED
    assert booking.exhausted_at is not None


def test_the_customer_is_told_rather_than_left_watching(world: M2World) -> None:
    """The event their screen and their notifications both hang off."""
    booking = _booked_with_nobody_in_reach(world)

    assert OutboxEvent.objects.filter(
        event_type="m2.rate_card.exhausted",
        aggregate_id=booking.requirement_id,
    ).exists()


def test_nothing_is_charged_for_a_search_that_found_nobody(world: M2World) -> None:
    """Free by construction -- no money exists on a rate-card booking before `OFFER_HELD`."""
    booking = _booked_with_nobody_in_reach(world)

    assert booking.status == RateCardBooking.Status.EXHAUSTED
    assert not VendorInvitation.objects.filter(requirement_id=booking.requirement_id).exists()


def test_the_customer_can_still_choose_what_happens_next(world: M2World) -> None:
    """`EXHAUSTED` is a decision point, not a dead end: retry, quotes or cancel.

    Asserted through the cancel path because it is the one that must always be available -- a
    Customer who is told nobody is available must be able to close the request.
    """
    booking = _booked_with_nobody_in_reach(world)

    cancelled = crew_dispatch.cancel_rate_card_booking(
        requirement_id=booking.requirement_id, actor=world.customer
    )

    assert cancelled.status == RateCardBooking.Status.CANCELLED
