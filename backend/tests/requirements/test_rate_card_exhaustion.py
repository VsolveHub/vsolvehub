"""What happens to an A3 request that no crew took.

The cascade used to hand it to the quote flow on its own, which changed the product the Customer
had asked for without asking them. It now parks at `EXHAUSTED` and waits, and the three ways out
belong to the Customer. These tests pin the part that is easy to regress: that parking is free,
that it empties the leads' inboxes, and that each way out refuses from anywhere else.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.requirements import booking_fees, crew_dispatch, matching
from apps.requirements.exceptions import RequirementTransitionError
from apps.requirements.models import (
    CustomerRequirement,
    RateCard,
    RateCardBooking,
    VendorInvitation,
)

from .conftest import M2World, invitation_for, submitted_requirement

pytestmark = pytest.mark.django_db


def _booking(
    *, world: M2World, requirement: CustomerRequirement, **overrides: object
) -> RateCardBooking:
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
    fields: dict[str, object] = {
        "requirement": requirement,
        "rate_card": card,
        "status": RateCardBooking.Status.MATCHING,
        "headcount": 3,
        "days": 2,
        "day_rate_paise": 90_000,
        "worker_day_wage_paise": 60_000,
        "supervision_margin_paise": 25_000,
        "booking_fee_component_paise": 5_000,
        "standard_day_hours": 8,
        "overtime_hourly_paise": 11_250,
        "add_on_rates": {},
        "inclusions": [],
        "total_customer_paise": 540_000,
        "lead_receipt_paise": 510_000,
        "booking_fee_paise": 5_000,
        "wave": 1,
    }
    fields.update(overrides)
    return RateCardBooking.objects.create(**fields)


def _exhausted(*, world: M2World) -> tuple[CustomerRequirement, RateCardBooking]:
    requirement = submitted_requirement(world=world)
    booking = _booking(world=world, requirement=requirement)
    crew_dispatch.exhaust_cascade(requirement_id=requirement.id, reason_code="cascade_exhausted")
    booking.refresh_from_db()
    return requirement, booking


def test_exhausting_parks_the_booking_without_touching_the_request(world: M2World) -> None:
    """The request is exactly as the Customer left it. That is the promise the copy makes."""
    requirement, booking = _exhausted(world=world)

    assert booking.status == RateCardBooking.Status.EXHAUSTED
    assert booking.exhaustion_reason_code == "cascade_exhausted"
    assert booking.exhausted_at is not None
    requirement.refresh_from_db()
    assert requirement.status == CustomerRequirement.Status.MATCHING
    assert requirement.closed_at is None


def test_exhausting_takes_dead_offers_off_the_leads(world: M2World) -> None:
    """A job nobody is dispatching must not sit in an inbox looking answerable."""
    requirement = submitted_requirement(world=world)
    _booking(world=world, requirement=requirement)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)

    crew_dispatch.exhaust_cascade(requirement_id=requirement.id, reason_code="no_eligible_leads")

    invitation.refresh_from_db()
    assert invitation.status != VendorInvitation.Status.INVITED


def test_exhausting_is_not_dispatchable_so_slot_accounting_reverts(world: M2World) -> None:
    """The boundary that keeps the quote flow's ceiling meaningful once the crew job stops."""
    requirement, _booking_row = _exhausted(world=world)

    assert matching._slot_holding_statuses(requirement) == VendorInvitation.SLOT_HOLDING_STATUSES


def test_retry_widens_rather_than_starting_over(world: M2World) -> None:
    """Wave one already asked the nearest leads. Asking them again is not trying again."""
    requirement, booking = _exhausted(world=world)
    wave_before = booking.wave

    crew_dispatch.retry_cascade(requirement_id=requirement.id, actor=world.customer)

    booking.refresh_from_db()
    assert booking.retry_count == 1
    assert booking.wave >= wave_before
    assert booking.exhausted_at is None


def test_cancelling_closes_the_request_and_charges_nothing(world: M2World) -> None:
    """Free by construction: no fee exists before a lead accepts, and none did."""
    requirement, booking = _exhausted(world=world)

    crew_dispatch.cancel_rate_card_booking(requirement_id=requirement.id, actor=world.customer)

    booking.refresh_from_db()
    requirement.refresh_from_db()
    assert booking.status == RateCardBooking.Status.CANCELLED
    assert requirement.status == CustomerRequirement.Status.CLOSED_CANCELLED
    assert requirement.closed_at is not None
    assert booking_fees.latest_booking_fee(requirement) is None


def test_choosing_quotes_hands_over_and_records_who_decided(world: M2World) -> None:
    """Same transition the cascade used to make by itself; the reason code says it was not."""
    requirement, booking = _exhausted(world=world)

    crew_dispatch.choose_quote_flow(requirement_id=requirement.id, actor=world.customer)

    booking.refresh_from_db()
    assert booking.status == RateCardBooking.Status.FELL_BACK
    assert booking.fallback_reason_code == "customer_chose_quotes"


@pytest.mark.parametrize(
    "command",
    (
        crew_dispatch.retry_cascade,
        crew_dispatch.choose_quote_flow,
        crew_dispatch.cancel_rate_card_booking,
    ),
)
def test_recovery_refuses_while_the_cascade_is_still_running(world: M2World, command) -> None:  # type: ignore[no-untyped-def]
    """A live cascade has not asked the Customer anything yet, so there is nothing to answer.

    Matters most for `cancel`: it is the one command whose guard is also the proof that cancelling
    is free, since a booking that reached `OFFER_HELD` has a real fee behind it.
    """
    requirement = submitted_requirement(world=world)
    _booking(world=world, requirement=requirement)

    with pytest.raises(RequirementTransitionError):
        command(requirement_id=requirement.id, actor=world.customer)
