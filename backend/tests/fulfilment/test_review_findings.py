"""Regressions for the seven review findings B8 shipped with, plus group-wide reschedule.

Every test here was verified failing against the code as it stood before the fix. They are
grouped by the defect rather than by the module, because that is how they were found and how a
reader checking whether one is still closed will look for it.
"""

import itertools
from datetime import timedelta

import pytest
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.carts.exceptions import BookingGroupConflictApiError
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking, PaymentAllocation, Refund, RefundAllocation
from apps.fulfilment.cancellation import (
    MAX_GROUP_IDEMPOTENCY_KEY_CHARS,
    UnitCancellationOutcome,
    cancel_booked_group,
    reschedule_booked_group,
    reschedule_booking,
)
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import BookingStatusHistory
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.refunds import _split_across, create_partial_refunds
from apps.fulfilment.services import mark_arrived, mark_en_route, sync_group_completion
from apps.identity.models import User
from tests.fulfilment.conftest import BookedGroup, create_booked_group
from tests.fulfilment.test_refund_attempt_integrity import (
    _in_progress_booking,
    _pay_for_an_amendment,
)

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Walks visits booked for tomorrow through en route and arrival; the clock gates on those
    # steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]

TWO_UNITS = 2
TWO_REFUNDS = 2
_operator_sequence = itertools.count(1)


def _two_unit_group(key_prefix: str) -> tuple[BookedGroup, FulfilmentUnit, FulfilmentUnit]:
    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"), key_prefix=key_prefix
    )
    units = list(booked.group.units.order_by("position"))
    assert len(units) == TWO_UNITS
    return booked, units[0], units[1]


def _deliver(unit: FulfilmentUnit) -> None:
    """Put a unit in a delivered terminal state without going through the work commands."""

    booking = unit.booking
    booking.status = Booking.Status.COMPLETED
    booking.version += 1
    booking.save(update_fields=("status", "version"))
    unit.status = FulfilmentUnit.Status.COMPLETED
    unit.version += 1
    unit.save(update_fields=("status", "version"))


def _deliver_whole_group(booked: BookedGroup) -> None:
    """Deliver every unit, then derive the group the way the real commands do.

    `sync_group_completion` is what turns a set of terminal units into a settled group; writing
    the unit rows alone would leave the group `BOOKED` and the test would be proving nothing.
    """

    for unit in booked.group.units.all():
        _deliver(unit)
    booked.group.refresh_from_db()
    sync_group_completion(booked.group)
    booked.group.refresh_from_db()


# --------------------------------------------------------------------------------------------
# Finding 1 — a finished group is not a replay
# --------------------------------------------------------------------------------------------


def test_cancelling_a_fully_delivered_group_is_refused_not_reported_as_success() -> None:
    """The defect in one sentence: "cancel my finished bookings" used to return success.

    A group whose every visit was delivered settles to `COMPLETED`, and the old short-circuit
    treated any settled group as a replay — so the command reported a cancellation that never
    happened, and skipped the version guard on its way to doing so.
    """

    booked, _first, _second = _two_unit_group("finding1-delivered")
    _deliver_whole_group(booked)
    assert booked.group.status == BookingGroup.Status.COMPLETED
    history_before = BookingStatusHistory.objects.count()

    with pytest.raises(BookingCommandInvalidApiError):
        cancel_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            reason="changed my mind, after the fact",
            idempotency_key="finding1-delivered-key",
        )

    assert BookingStatusHistory.objects.count() == history_before


def test_a_delivered_group_refuses_a_stale_version_rather_than_short_circuiting_past_it() -> None:
    """The version guard has to be reachable. The old order made it unreachable for any
    settled group, which is exactly the case where a client is most likely to be stale."""

    booked, _first, _second = _two_unit_group("finding1-guard")
    _deliver_whole_group(booked)

    with pytest.raises((BookingGroupConflictApiError, BookingCommandInvalidApiError)):
        cancel_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version + 99,
            reason="stale client",
            idempotency_key="finding1-guard-key",
        )


# --------------------------------------------------------------------------------------------
# Finding 2 — a replay answers with what actually happened
# --------------------------------------------------------------------------------------------


def test_a_group_cancel_replay_reports_the_fee_and_refunds_the_first_call_charged() -> None:
    """Reporting zeroes told the Customer their money was coming back in full.

    It is the same money the first call kept as a cancellation fee. The real values are in the
    `BookingStatusHistory` context and are read back from there.
    """

    booked, near, _far = _two_unit_group("finding2-replay")
    # Drag one unit inside the fee-bearing band so the first call charges something.
    near.requested_start = timezone.now() + timedelta(hours=1)
    near.save(update_fields=("requested_start",))

    first = cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        reason="moving house",
        idempotency_key="finding2-replay-key",
    )
    charged = {outcome.fulfilment_unit_id: outcome for outcome in first.cancelled}
    assert any(outcome.fee_paise > 0 for outcome in charged.values()), (
        "the fixture did not produce a fee-bearing unit, so this test proves nothing"
    )

    replay = cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        reason="moving house",
        idempotency_key="finding2-replay-key",
    )

    replayed = {outcome.fulfilment_unit_id: outcome for outcome in replay.units}
    for unit_id, original in charged.items():
        assert replayed[unit_id].outcome == UnitCancellationOutcome.Outcome.CANCELLED
        assert replayed[unit_id].fee_paise == original.fee_paise
        assert set(replayed[unit_id].refund_ids) == set(original.refund_ids)


def test_a_group_cancel_replay_still_creates_nothing_the_second_time() -> None:
    booked, _first, _second = _two_unit_group("finding2-once")
    cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        reason="moving house",
        idempotency_key="finding2-once-key",
    )
    refunds_after_first = Refund.objects.count()
    history_after_first = BookingStatusHistory.objects.count()

    cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        reason="moving house",
        idempotency_key="finding2-once-key",
    )

    assert Refund.objects.count() == refunds_after_first
    assert BookingStatusHistory.objects.count() == history_after_first


# --------------------------------------------------------------------------------------------
# Finding 3 — an over-long key is a typed refusal, not a DataError
# --------------------------------------------------------------------------------------------


def test_the_group_key_limit_leaves_room_for_the_per_unit_suffix() -> None:
    """The limit is not a taste judgement; it is arithmetic against a column width."""

    column = Refund._meta.get_field("idempotency_key").max_length
    longest_derived = MAX_GROUP_IDEMPOTENCY_KEY_CHARS + len(":") + 36 + len(":r99")
    assert longest_derived <= column


def test_an_over_long_group_idempotency_key_is_refused_by_the_command() -> None:
    booked, _first, _second = _two_unit_group("finding3-key")

    with pytest.raises(BookingCommandInvalidApiError):
        cancel_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            reason="moving house",
            idempotency_key="k" * (MAX_GROUP_IDEMPOTENCY_KEY_CHARS + 1),
        )

    assert not Refund.objects.exists(), "a refusal must not have written a refund first"


# --------------------------------------------------------------------------------------------
# Finding 4 — minimum notice, not merely a future time
# --------------------------------------------------------------------------------------------


def test_a_reschedule_cannot_manufacture_a_late_partner_forwards() -> None:
    """The exploit the old future-time guard allowed.

    A Customer comfortably outside the fee window passes the notice check, moves the visit to
    twenty minutes from now, and no Partner can be there — so lateness is declared and every
    cancellation fee is waived. The visit time is in the future, so the old guard let it through.
    """

    booked = create_booked_group(key_prefix="finding4-forward")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(days=3)
    unit.save(update_fields=("requested_start",))

    with pytest.raises(BookingCommandInvalidApiError):
        reschedule_booking(
            booking_id=booked.booking.id,
            customer_id=booked.customer.id,
            expected_version=booked.booking.version,
            new_requested_start=timezone.now() + timedelta(minutes=20),
        )

    unit.refresh_from_db()
    assert unit.requested_start > timezone.now() + timedelta(days=2)


def test_a_reschedule_backwards_is_still_refused() -> None:
    booked = create_booked_group(key_prefix="finding4-backward")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(days=3)
    unit.save(update_fields=("requested_start",))

    with pytest.raises(BookingCommandInvalidApiError):
        reschedule_booking(
            booking_id=booked.booking.id,
            customer_id=booked.customer.id,
            expected_version=booked.booking.version,
            new_requested_start=timezone.now() - timedelta(days=7),
        )


# --------------------------------------------------------------------------------------------
# Findings 6 and 7 — rejected refunds, and one call producing two
# --------------------------------------------------------------------------------------------


def test_a_rejected_refund_does_not_swallow_a_later_refund_of_the_same_money() -> None:
    """`FAILED` means the provider refused and no money moved.

    `refundable_unit_allocations` therefore counts the allocation as refundable again — so
    reaching the key lookup with a rejected refund means money is still genuinely owed. Handing
    the rejected row back reported a refund that will never pay and raised nothing to replace it.
    """

    booked = create_booked_group(key_prefix="finding6-failed")
    unit = booked.unit
    # `refundable_unit_allocations` locks the allocations it reads, so these calls need the same
    # transaction the real commands give them.
    with transaction.atomic():
        first = create_partial_refunds(
            booking=booked.booking,
            unit=unit,
            refund_amount_paise=5000,
            reason_code="customer_cancellation",
            requested_by_id=booked.customer.id,
            idempotency_key="finding6-key",
        )
    assert len(first) == 1
    rejected = first[0]
    rejected.status = Refund.Status.FAILED
    rejected.completed_at = timezone.now()
    rejected.save(update_fields=("status", "completed_at"))

    with transaction.atomic():
        second = create_partial_refunds(
            booking=booked.booking,
            unit=unit,
            refund_amount_paise=5000,
            reason_code="customer_cancellation",
            requested_by_id=booked.customer.id,
            idempotency_key="finding6-key",
        )

    assert len(second) == 1
    assert second[0].id != rejected.id, "the rejected refund was handed back instead of retried"
    assert second[0].status == Refund.Status.REQUESTED
    assert second[0].idempotency_key != rejected.idempotency_key, (
        "a retry must carry a new provider key; the old one was already rejected"
    )


def test_an_ambiguous_refund_is_still_returned_as_live_and_never_duplicated() -> None:
    """`UNDER_REVIEW` is the ambiguous case and is deliberately NOT retried — a second provider
    call could refund the same money twice. Finance owns it."""

    booked = create_booked_group(key_prefix="finding6-ambiguous")
    with transaction.atomic():
        first = create_partial_refunds(
            booking=booked.booking,
            unit=booked.unit,
            refund_amount_paise=5000,
            reason_code="customer_cancellation",
            requested_by_id=booked.customer.id,
            idempotency_key="finding6-ambiguous-key",
        )
    ambiguous = first[0]
    ambiguous.status = Refund.Status.UNDER_REVIEW
    ambiguous.save(update_fields=("status",))

    # The unit is worth more than the 5000 paise above, so there is still money refundable and
    # the key lookup is genuinely reached — this is the same path the rejected-refund test takes,
    # arriving at the opposite answer.
    with transaction.atomic():
        second = create_partial_refunds(
            booking=booked.booking,
            unit=booked.unit,
            refund_amount_paise=5000,
            reason_code="customer_cancellation",
            requested_by_id=booked.customer.id,
            idempotency_key="finding6-ambiguous-key",
        )

    assert [refund.id for refund in second] == [ambiguous.id], (
        "an ambiguous refund must never be duplicated by a retry"
    )
    assert Refund.objects.filter(idempotency_key__startswith="finding6-ambiguous-key").count() == 1


def test_one_call_raises_two_refunds_when_a_unit_spans_two_payment_attempts() -> None:
    """The existing suite only ever reached the single-attempt path."""

    booked = _in_progress_booking("finding7-two-attempts")
    _pay_for_an_amendment(booked, key="finding7-amend")
    attempts = set(
        PaymentAllocation.objects.filter(fulfilment_unit=booked.unit).values_list(
            "payment_attempt_id", flat=True
        )
    )
    assert len(attempts) == TWO_REFUNDS, "the fixture did not produce a second attempt"
    refundable = sum(
        allocation.amount_paise - allocation.refunded_paise
        for allocation in PaymentAllocation.objects.filter(fulfilment_unit=booked.unit)
    )

    with transaction.atomic():
        refunds = create_partial_refunds(
            booking=booked.booking,
            unit=booked.unit,
            refund_amount_paise=refundable,
            reason_code="customer_cancellation",
            requested_by_id=booked.customer.id,
            idempotency_key="finding7-key",
        )

    assert len(refunds) == TWO_REFUNDS
    assert {refund.payment_attempt_id for refund in refunds} == attempts
    assert sum(refund.amount_paise for refund in refunds) == refundable
    for refund in refunds:
        allocated = sum(
            allocation.amount_paise for allocation in RefundAllocation.objects.filter(refund=refund)
        )
        assert allocated == refund.amount_paise


@pytest.mark.parametrize(
    ("available", "amount"),
    [
        ((100, 100, 100), 100),
        ((100, 100, 100), 1),
        ((33, 33, 34), 50),
        ((1, 1, 1), 2),
        ((7,), 7),
        ((10, 1), 10),
    ],
)
def test_split_across_hands_out_every_paise_and_never_exceeds_an_allocation(
    available: tuple[int, ...], amount: int
) -> None:
    """`_split_across`' remainder loop had no direct test. Proportional shares truncate, so the
    remainder is always handed back out — and never past what an allocation can absorb."""

    parts = [(None, value) for value in available]  # type: ignore[list-item]
    shares = _split_across(parts, amount)  # type: ignore[arg-type]

    assert sum(shares) == amount
    for share, capacity in zip(shares, available, strict=True):
        assert 0 <= share <= capacity


# --------------------------------------------------------------------------------------------
# Group-wide reschedule
# --------------------------------------------------------------------------------------------


#: Every reschedule in this file moves by whole weeks.
#:
#: `partner_available_during` asks only about weekday and time of day, so a Partner whose
#: explicit schedule covers Tuesday morning is unavailable on Wednesday. Shifting by seven days
#: keeps both, which isolates these tests to the behaviour they are actually about — a Partner
#: who genuinely cannot make the new time is `test_group_reschedule_refuses_as_a_whole`'s job.
ONE_WEEK = timedelta(days=7)


def _shift_group_out(booked: BookedGroup, *, by: timedelta = ONE_WEEK) -> None:
    """Move every unit out far enough to sit in the free cancellation band."""

    for unit in booked.group.units.all():
        unit.requested_start = unit.requested_start + by
        unit.save(update_fields=("requested_start",))
        booking = unit.booking
        booking.scheduled_start = unit.requested_start
        booking.save(update_fields=("scheduled_start",))


def test_group_reschedule_shifts_every_unit_by_one_offset_and_keeps_the_gaps() -> None:
    """The planner owns the relationships between units. Moving the group by one offset is the
    only shape that cannot dissolve them."""

    booked, first, second = _two_unit_group("greschedule-happy")
    _shift_group_out(booked)
    first.refresh_from_db()
    second.refresh_from_db()
    original_gap = second.requested_start - first.requested_start
    booked.group.refresh_from_db()
    new_start = first.requested_start + ONE_WEEK

    result = reschedule_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        new_group_start=new_start,
        idempotency_key="greschedule-happy-key",
    )

    assert result.shift == ONE_WEEK
    first.refresh_from_db()
    second.refresh_from_db()
    assert first.requested_start == new_start
    assert second.requested_start - first.requested_start == original_gap
    for unit in (first, second):
        unit.booking.refresh_from_db()
        assert unit.booking.scheduled_start == unit.requested_start
        assert BookingStatusHistory.objects.filter(
            booking=unit.booking, command="RESCHEDULE"
        ).exists()


def test_group_reschedule_refuses_as_a_whole_when_one_visit_cannot_move() -> None:
    """A group reschedule that moved three of four visits would leave a Customer with a split
    appointment nobody agreed to and no single command to undo it with."""

    booked, movable, working = _two_unit_group("greschedule-refuse")
    _shift_group_out(booked)
    booking = mark_en_route(
        booking_id=working.booking.id,
        partner_id=working.booking.partner_id,
        expected_version=working.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booking.partner_id, expected_version=booking.version
    )
    operator = User.objects.create_user(phone_number=f"+91983{next(_operator_sequence):07d}")
    operations_assisted_start(
        booking_id=booking.id,
        operator=operator,
        outage_reason="Test bootstrap: put this unit mid-work.",
        expected_version=booking.version,
    )
    movable.refresh_from_db()
    original_start = movable.requested_start
    booked.group.refresh_from_db()
    earliest = min(unit.requested_start for unit in booked.group.units.all())

    with pytest.raises(BookingCommandInvalidApiError):
        reschedule_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            new_group_start=earliest + ONE_WEEK,
            idempotency_key="greschedule-refuse-key",
        )

    movable.refresh_from_db()
    assert movable.requested_start == original_start, "a refused command moved a visit anyway"


def test_group_reschedule_refuses_short_notice_for_every_unit() -> None:
    booked, _first, _second = _two_unit_group("greschedule-notice")
    _shift_group_out(booked)
    booked.group.refresh_from_db()

    with pytest.raises(BookingCommandInvalidApiError):
        reschedule_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            new_group_start=timezone.now()
            + timedelta(minutes=settings.M1_RESCHEDULE_MIN_NOTICE_MINUTES - 5),
            idempotency_key="greschedule-notice-key",
        )


def test_group_reschedule_with_a_stale_group_version_is_a_typed_conflict() -> None:
    booked, first, _second = _two_unit_group("greschedule-version")
    _shift_group_out(booked)
    first.refresh_from_db()
    booked.group.refresh_from_db()

    with pytest.raises(BookingGroupConflictApiError):
        reschedule_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version + 99,
            new_group_start=first.requested_start + ONE_WEEK,
            idempotency_key="greschedule-version-key",
        )
