"""Group-wide Customer cancellation of a booked Booking Group.

The rule this file exists to pin down is `01-scope-and-flow.md`'s "without hidden partial
success": a unit that is already finished is skipped *and named in the result*, a unit that is
mid-work fails the whole command, and nothing is ever half-applied.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.carts.exceptions import BookingGroupConflictApiError
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking, PaymentAllocation, Refund
from apps.fulfilment.cancellation import (
    MAX_CANCELLATION_REASON_CHARS,
    UnitCancellationOutcome,
    cancel_booked_group,
    cancel_booking,
)
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import BookingStatusHistory
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.identity.models import User
from tests.fulfilment.conftest import BookedGroup, create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)

TWO_UNITS = 2
_operator_counter = iter(range(1, 10_000))


def _two_unit_group(key_prefix: str) -> tuple[BookedGroup, FulfilmentUnit, FulfilmentUnit]:
    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"), key_prefix=key_prefix
    )
    units = list(booked.group.units.order_by("position"))
    assert len(units) == TWO_UNITS
    return booked, units[0], units[1]


def _start_work(unit: FulfilmentUnit) -> Booking:
    booking = mark_en_route(
        booking_id=unit.booking.id,
        partner_id=unit.booking.partner_id,
        expected_version=unit.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id,
        partner_id=booking.partner_id,
        expected_version=booking.version,
    )
    operator = User.objects.create_user(phone_number=f"+91984{next(_operator_counter):07d}")
    return operations_assisted_start(
        booking_id=booking.id,
        operator=operator,
        outage_reason="Test bootstrap: put this unit mid-work.",
        expected_version=booking.version,
    )


def _unit_gross_paise(unit: FulfilmentUnit) -> int:
    return sum(
        PaymentAllocation.objects.filter(fulfilment_unit=unit).values_list(
            "amount_paise", flat=True
        )
    )


def test_group_cancel_cancels_every_unit_and_derives_a_cancelled_group() -> None:
    booked, first, second = _two_unit_group("gcancel-all")
    for unit in (first, second):
        unit.requested_start = timezone.now() + timedelta(days=3)
        unit.save(update_fields=("requested_start",))

    result = cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        reason="moving house",
        idempotency_key="gcancel-all-key",
    )

    assert {outcome.outcome for outcome in result.units} == {
        UnitCancellationOutcome.Outcome.CANCELLED
    }
    assert len(result.cancelled) == TWO_UNITS
    assert result.skipped == ()
    for unit in (first, second):
        unit.refresh_from_db()
        unit.booking.refresh_from_db()
        assert unit.status == FulfilmentUnit.Status.CANCELLED
        assert unit.booking.status == Booking.Status.CANCELLED
        assert unit.booking.cancellation_reason == "moving house"
    result.group.refresh_from_db()
    assert result.group.status == BookingGroup.Status.CANCELLED


def test_group_cancel_refunds_each_unit_separately_under_its_own_fee_band() -> None:
    """One shared PaymentAttempt, two units, two distinct Refunds — one per unit's own band."""

    booked, free_unit, fee_unit = _two_unit_group("gcancel-bands")
    free_unit.requested_start = timezone.now() + timedelta(days=3)
    free_unit.save(update_fields=("requested_start",))
    fee_unit.requested_start = timezone.now() + timedelta(minutes=30)
    fee_unit.save(update_fields=("requested_start",))

    result = cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        reason="moving house",
        idempotency_key="gcancel-bands-key",
    )

    by_unit = {outcome.fulfilment_unit_id: outcome for outcome in result.units}
    assert by_unit[free_unit.id].fee_paise == 0
    assert by_unit[fee_unit.id].fee_paise == 9900
    refund_ids = {rid for outcome in result.units for rid in outcome.refund_ids}
    assert len(refund_ids) == TWO_UNITS, "each unit must get its own Refund, not a shared one"
    free_refund = Refund.objects.get(id=by_unit[free_unit.id].refund_ids[0])
    fee_refund = Refund.objects.get(id=by_unit[fee_unit.id].refund_ids[0])
    assert free_refund.amount_paise == _unit_gross_paise(free_unit)
    assert fee_refund.amount_paise == _unit_gross_paise(fee_unit) - 9900


def test_group_cancel_skips_an_already_finished_unit_and_names_it_in_the_result() -> None:
    booked, done, pending = _two_unit_group("gcancel-skip")
    finished = done.booking
    finished.status = Booking.Status.COMPLETED
    finished.version += 1
    finished.save(update_fields=("status", "version"))
    done.status = FulfilmentUnit.Status.COMPLETED
    done.version += 1
    done.save(update_fields=("status", "version"))

    result = cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        reason="no longer needed",
        idempotency_key="gcancel-skip-key",
    )

    assert [outcome.fulfilment_unit_id for outcome in result.skipped] == [done.id]
    assert result.skipped[0].outcome == UnitCancellationOutcome.Outcome.ALREADY_TERMINAL
    assert result.skipped[0].refund_ids == ()
    assert [outcome.fulfilment_unit_id for outcome in result.cancelled] == [pending.id]
    done.booking.refresh_from_db()
    assert done.booking.status == Booking.Status.COMPLETED
    # The delivered unit still counts: the group completed, it did not cancel.
    result.group.refresh_from_db()
    assert result.group.status == BookingGroup.Status.COMPLETED


def test_group_cancel_refuses_a_mid_work_unit_and_leaves_every_unit_untouched() -> None:
    booked, working, pending = _two_unit_group("gcancel-inflight")
    _start_work(working)
    history_before = BookingStatusHistory.objects.count()
    refunds_before = Refund.objects.count()

    with pytest.raises(BookingCommandInvalidApiError):
        cancel_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            reason="too late",
            idempotency_key="gcancel-inflight-key",
        )

    working.booking.refresh_from_db()
    pending.booking.refresh_from_db()
    assert working.booking.status == Booking.Status.IN_PROGRESS
    assert pending.booking.status == Booking.Status.CONFIRMED
    assert BookingStatusHistory.objects.count() == history_before
    assert Refund.objects.count() == refunds_before
    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.BOOKED


def test_group_cancel_replay_under_the_same_key_refunds_and_audits_exactly_once() -> None:
    booked, first, second = _two_unit_group("gcancel-replay")
    original_version = booked.group.version

    first_result = cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=original_version,
        reason="moving house",
        idempotency_key="gcancel-replay-key",
    )
    refunds_after_first = Refund.objects.count()

    replay = cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=original_version,
        reason="moving house",
        idempotency_key="gcancel-replay-key",
    )

    assert len(first_result.cancelled) == TWO_UNITS
    # A replay reports what the first call did, not zeroes. Reporting these as skipped with no
    # fee and no refund ids was the defect: for a fee-bearing unit it told the Customer their
    # money was coming back in full, when the first call had kept part of it.
    assert len(replay.cancelled) == TWO_UNITS
    assert replay.skipped == ()
    assert Refund.objects.count() == refunds_after_first
    for unit in (first, second):
        assert (
            BookingStatusHistory.objects.filter(
                booking=unit.booking, to_status=Booking.Status.CANCELLED
            ).count()
            == 1
        )


def test_group_cancel_with_a_stale_group_version_is_a_typed_conflict() -> None:
    booked, _first, _second = _two_unit_group("gcancel-version")

    with pytest.raises(BookingGroupConflictApiError):
        cancel_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version + 5,
            reason="moving house",
            idempotency_key="gcancel-version-key",
        )

    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.BOOKED


def test_group_cancel_by_another_customer_finds_nothing() -> None:
    booked, _first, _second = _two_unit_group("gcancel-owner")
    intruder = User.objects.create_user(phone_number="+919000000042")

    with pytest.raises(BookingGroup.DoesNotExist):
        cancel_booked_group(
            group_id=booked.group.id,
            customer_id=intruder.id,
            expected_version=booked.group.version,
            reason="not mine",
            idempotency_key="gcancel-owner-key",
        )


def test_group_cancel_before_payment_points_at_the_pre_payment_command() -> None:
    booked, _first, _second = _two_unit_group("gcancel-prepay")
    booked.group.status = BookingGroup.Status.PAYMENT_PENDING
    booked.group.version += 1
    booked.group.save(update_fields=("status", "version"))

    with pytest.raises(BookingCommandInvalidApiError):
        cancel_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            reason="changed my mind",
            idempotency_key="gcancel-prepay-key",
        )


def test_group_cancel_releases_every_units_reservation() -> None:
    booked, first, second = _two_unit_group("gcancel-reservations")

    cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        reason="moving house",
        idempotency_key="gcancel-reservations-key",
    )

    for unit in (first, second):
        unit.booking.refresh_from_db()
        reservation = Reservation.objects.get(id=unit.booking.reservation_id)
        assert reservation.status == Reservation.Status.RELEASED


def test_the_reason_limit_matches_the_column_it_is_written_to() -> None:
    """A drift guard: the command's limit and the column's width must not diverge."""

    field = Booking._meta.get_field("cancellation_reason")
    assert getattr(field, "max_length", None) == MAX_CANCELLATION_REASON_CHARS


def test_an_over_long_reason_is_refused_by_the_command_not_by_the_database() -> None:
    booked, _first, _second = _two_unit_group("gcancel-long-reason")

    with pytest.raises(BookingCommandInvalidApiError):
        cancel_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            reason="x" * (MAX_CANCELLATION_REASON_CHARS + 1),
            idempotency_key="gcancel-long-reason-key",
        )

    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.BOOKED


def test_an_over_long_reason_is_refused_for_a_single_unit_too() -> None:
    booked, first, _second = _two_unit_group("gcancel-long-reason-unit")

    with pytest.raises(BookingCommandInvalidApiError):
        cancel_booking(
            booking_id=first.booking.id,
            customer_id=booked.customer.id,
            expected_version=first.booking.version,
            reason="x" * (MAX_CANCELLATION_REASON_CHARS + 1),
            idempotency_key="gcancel-long-reason-unit-key",
        )

    first.booking.refresh_from_db()
    assert first.booking.status == Booking.Status.CONFIRMED
