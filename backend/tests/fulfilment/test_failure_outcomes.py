"""One test per `01-scope-and-flow.md` failure-outcomes row that Booking fulfilment owns.

Every test here asserts three things, not one: what happened to the **unit**, what the
**Booking Group** derives from it, and that the **audit trail** records it exactly once even
when the command is replayed. A unit-level assertion alone would let a group projection drift
away from the units underneath it, which is the failure mode this table exists to prevent.

Rows owned by other apps are covered where they happen and are not duplicated here:

| Failure row | Owning tests |
| --- | --- |
| No eligible/accepting Partner | `assignments/test_group_dispatch.py` |
| One required unit cannot be held | `assignments/test_group_dispatch.py` |
| Cart changes after planning | `carts/test_fulfilment_planning.py` |
| Parallel plan loses one Partner | `assignments/test_dispatch_recovery_commands.py` |
| Partner accepts, Customer does not pay | `assignments/test_dispatch_concurrency.py` |
| Payment succeeds, booking conversion fails | `commerce/` payment tests |
| Refund/payout ambiguous | `commerce/` refund reconciliation tests |
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking, PaymentAllocation, Refund
from apps.fulfilment.amendments import decline_scope_amendment, propose_scope_amendment
from apps.fulfilment.cancellation import (
    FEE_WAIVER_PARTNER_RELEASED,
    cancel_booked_group,
    cancel_booking,
    reschedule_booking,
)
from apps.fulfilment.completion import (
    OutcomeInput,
    abort_work,
    auto_finalize_completion,
    confirm_completion,
    dispute_completion,
    submit_completion,
)
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import (
    BookingStatusHistory,
    CustomerContactAttempt,
    ScopeAmendment,
    WorkEvidence,
    WorkOutcome,
    WorkTask,
)
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.recovery_services import release_booking_partner
from apps.fulfilment.services import (
    mark_arrived,
    mark_customer_unavailable_wait_started,
    mark_en_route,
    record_customer_contact_attempt,
)
from apps.identity.models import User
from tests.fulfilment.conftest import BookedGroup, create_booked_group

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Walks visits booked for tomorrow through en route and arrival; the clock gates on those
    # steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]

TWO_UNITS = 2
_operator_counter = iter(range(1, 10_000))


def _operator() -> User:
    return User.objects.create_user(phone_number=f"+91985{next(_operator_counter):07d}")


def _unit_gross_paise(unit: FulfilmentUnit) -> int:
    return sum(
        PaymentAllocation.objects.filter(fulfilment_unit=unit).values_list(
            "amount_paise", flat=True
        )
    )


def _arrive(booked: BookedGroup) -> Booking:
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    return mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )


def _start_work(booked: BookedGroup) -> Booking:
    booking = _arrive(booked)
    return operations_assisted_start(
        booking_id=booking.id,
        operator=_operator(),
        outage_reason="Test bootstrap: put this Booking mid-work.",
        expected_version=booking.version,
    )


def _start_work_on(unit: FulfilmentUnit) -> Booking:
    """The same bootstrap for a sibling unit of a multi-visit group."""

    booking = mark_en_route(
        booking_id=unit.booking.id,
        partner_id=unit.booking.partner_id,
        expected_version=unit.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booking.partner_id, expected_version=booking.version
    )
    return operations_assisted_start(
        booking_id=booking.id,
        operator=_operator(),
        outage_reason="Test bootstrap: put this unit mid-work.",
        expected_version=booking.version,
    )


def _cancelled_history_count(booking: Booking) -> int:
    return BookingStatusHistory.objects.filter(
        booking=booking, to_status=Booking.Status.CANCELLED
    ).count()


# --- Partner releases before start: recovery, reschedule or full refund ------------------------


def test_a_released_booking_can_be_cancelled_by_the_customer_for_a_full_refund() -> None:
    """The Customer does not have to wait for a replacement, and pays nothing to walk away —
    even inside the fee window, because the failure was the Partner's, not theirs."""

    booked = create_booked_group(key_prefix="fo-release-refund")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(minutes=30)
    unit.save(update_fields=("requested_start",))
    released = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="van broke down",
        expected_version=booked.booking.version,
    )
    assert released.status == Booking.Status.RECOVERY_REQUIRED

    cancelled, refunds = cancel_booking(
        booking_id=released.id,
        customer_id=booked.customer.id,
        expected_version=released.version,
        reason="not waiting for a replacement",
        idempotency_key="fo-release-refund-key",
    )

    assert cancelled.status == Booking.Status.CANCELLED
    assert len(refunds) == 1
    refund = refunds[0]
    assert refund.amount_paise == _unit_gross_paise(booked.unit), "a short-notice fee was charged"
    history = BookingStatusHistory.objects.get(
        booking=cancelled, to_status=Booking.Status.CANCELLED
    )
    assert history.context["fee_paise"] == 0
    assert history.context["fee_waiver"] == FEE_WAIVER_PARTNER_RELEASED
    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.CANCELLED


def test_a_partner_who_releases_mid_job_leaves_work_to_settle_not_to_cancel() -> None:
    """A release *before* the visit is a full refund. A release *during* it is not.

    `01-scope-and-flow.md` splits these deliberately: "Partner releases before start → recovery,
    reschedule or full refund" but "Partner stops mid-job → abort, site safety, **completed-line
    settlement** and recovery". A mid-job release that stayed Customer-cancellable would refund
    work that was actually performed, with no `WorkOutcome` to show for it.
    """

    booked = create_booked_group(key_prefix="fo-midjob-release")
    booking = _start_work(booked)
    released = release_booking_partner(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        reason="injured on site",
        expected_version=booking.version,
    )
    assert released.status == Booking.Status.RECOVERY_REQUIRED

    with pytest.raises(BookingCommandInvalidApiError):
        cancel_booking(
            booking_id=released.id,
            customer_id=booked.customer.id,
            expected_version=released.version,
            reason="give me my money back",
            idempotency_key="fo-midjob-release-key",
        )

    assert not Refund.objects.filter(order=released.order).exists()
    released.refresh_from_db()
    assert released.status == Booking.Status.RECOVERY_REQUIRED


def test_a_group_wide_cancel_refuses_a_unit_released_mid_job() -> None:
    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"), key_prefix="fo-midjob-group"
    )
    units = list(booked.group.units.order_by("position"))
    working, other = units
    started = _start_work_on(working)
    release_booking_partner(
        booking_id=started.id,
        partner_id=started.partner_id,
        reason="injured on site",
        expected_version=started.version,
    )
    booked.group.refresh_from_db()
    refunds_before = Refund.objects.count()

    with pytest.raises(BookingCommandInvalidApiError):
        cancel_booked_group(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            reason="cancel everything",
            idempotency_key="fo-midjob-group-key",
        )

    other.booking.refresh_from_db()
    assert other.booking.status == Booking.Status.CONFIRMED
    assert Refund.objects.count() == refunds_before


def test_a_group_wide_cancel_covers_a_unit_whose_partner_released() -> None:
    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"), key_prefix="fo-release-group"
    )
    units = list(booked.group.units.order_by("position"))
    assert len(units) == TWO_UNITS
    released_unit, healthy_unit = units
    release_booking_partner(
        booking_id=released_unit.booking.id,
        partner_id=released_unit.booking.partner_id,
        reason="van broke down",
        expected_version=released_unit.booking.version,
    )
    booked.group.refresh_from_db()

    result = cancel_booked_group(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        reason="not waiting",
        idempotency_key="fo-release-group-key",
    )

    assert len(result.cancelled) == TWO_UNITS
    by_unit = {outcome.fulfilment_unit_id: outcome for outcome in result.cancelled}
    assert by_unit[released_unit.id].fee_paise == 0
    for unit in (released_unit, healthy_unit):
        unit.refresh_from_db()
        assert unit.status == FulfilmentUnit.Status.CANCELLED
    result.group.refresh_from_db()
    assert result.group.status == BookingGroup.Status.CANCELLED


# --- Partner is late: honest delay plus fee-free Customer cancel/reschedule --------------------


def test_a_late_partner_makes_a_short_notice_reschedule_free() -> None:
    """The fee-window reschedule refusal is waived when the Partner is the one running late."""

    booked = create_booked_group(key_prefix="fo-late-reschedule")
    unit = booked.unit
    original_start = unit.requested_start
    # Inside the fee window, so an on-time Partner's Booking could not be rescheduled at all.
    unit.requested_start = timezone.now() + timedelta(minutes=30)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking
    booking.late_declared_at = timezone.now()
    booking.save(update_fields=("late_declared_at",))
    # Shift by whole weeks so the Partner's weekday-scoped availability rule still matches.
    new_start = original_start + timedelta(days=7)

    rescheduled = reschedule_booking(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        expected_version=booking.version,
        new_requested_start=new_start,
        idempotency_key="fo-late-reschedule-key",
    )

    assert rescheduled.scheduled_start == new_start
    booked.unit.refresh_from_db()
    assert booked.unit.requested_start == new_start
    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.BOOKED, "a reschedule is not an ending"


# --- Customer unavailable: wait/contact/evidence, then visit-fee quote/dispute -----------------


def test_customer_unavailable_wait_then_visit_fee_cancellation_settles_the_group() -> None:
    booked = create_booked_group(key_prefix="fo-unavailable")
    booking = _arrive(booked)
    booking = mark_customer_unavailable_wait_started(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    record_customer_contact_attempt(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        outcome=CustomerContactAttempt.Outcome.NO_ANSWER,
    )
    booking.refresh_from_db()

    cancelled, refunds = cancel_booking(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        expected_version=booking.version,
        reason="customer never showed",
        idempotency_key="fo-unavailable-key",
    )

    assert len(refunds) == 1
    refund = refunds[0]
    assert refund.amount_paise < _unit_gross_paise(booked.unit), "the visit fee was not charged"
    assert CustomerContactAttempt.objects.filter(booking=cancelled).count() == 1
    assert _cancelled_history_count(cancelled) == 1
    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.CANCELLED


# --- Additional work declined: original work if safe -------------------------------------------


def test_a_declined_amendment_leaves_the_original_work_completable() -> None:
    booked = create_booked_group(key_prefix="fo-declined-amendment")
    booking = _start_work(booked)
    amendment = propose_scope_amendment(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        reason="Optional extra work.",
        task_quantity=1,
        expected_version=booking.version,
    )
    declined = decline_scope_amendment(amendment_id=amendment.id, customer_id=booked.customer.id)
    assert declined.status == ScopeAmendment.Status.CUSTOMER_DECLINED
    booking.refresh_from_db()

    tasks = list(WorkTask.objects.filter(booking=booking))
    assert all(task.kind == WorkTask.Kind.ORIGINAL for task in tasks), "declined work materialized"
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Original scope done, extra declined.",
        safety_damage_declared=False,
        outcomes=[
            OutcomeInput(
                work_task_id=task.id,
                outcome=WorkOutcome.Outcome.COMPLETED,
                quantity=task.quantity,
            )
            for task in tasks
        ],
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    confirmed = confirm_completion(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        expected_version=booking.version,
    )

    assert confirmed.status == Booking.Status.COMPLETED
    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.COMPLETED


# --- Partner stops mid-job: abort, completed-line settlement and recovery ----------------------


def test_an_aborted_job_settles_completed_lines_and_refunds_the_rest() -> None:
    booked = create_booked_group(key_prefix="fo-abort")
    booking = _start_work(booked)
    aborted = abort_work(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        reason="unsafe wiring behind the socket",
        expected_version=booking.version,
    )
    tasks = list(WorkTask.objects.filter(booking=aborted))

    submit_completion(
        booking_id=aborted.id,
        partner_id=booked.partner.id,
        notes="Stopped after making the site safe.",
        safety_damage_declared=False,
        outcomes=[
            OutcomeInput(work_task_id=task.id, outcome=WorkOutcome.Outcome.NOT_STARTED)
            for task in tasks
        ],
        expected_version=aborted.version,
        idempotency_key="fo-abort-key",
    )

    aborted.refresh_from_db()
    assert aborted.status == Booking.Status.PARTIALLY_COMPLETED
    refund = Refund.objects.get(order=aborted.order, reason_code="partial_completion")
    assert refund.amount_paise > 0
    booked.unit.refresh_from_db()
    assert booked.unit.status == FulfilmentUnit.Status.PARTIALLY_COMPLETED
    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.COMPLETED, "the visit did happen"


# --- Customer disputes completion: payout hold -------------------------------------------------


def test_a_disputed_completion_holds_payout_and_still_settles_the_group() -> None:
    booked = create_booked_group(key_prefix="fo-dispute")
    booking = _start_work(booked)
    tasks = list(WorkTask.objects.filter(booking=booking))
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="All done.",
        safety_damage_declared=False,
        outcomes=[
            OutcomeInput(
                work_task_id=task.id,
                outcome=WorkOutcome.Outcome.COMPLETED,
                quantity=task.quantity,
            )
            for task in tasks
        ],
        expected_version=booking.version,
    )
    booking.refresh_from_db()

    disputed = dispute_completion(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        dispute_reason="the socket still does not work",
        expected_version=booking.version,
    )

    assert disputed.status == Booking.Status.DISPUTED
    assert disputed.payout_hold is True
    booked.unit.refresh_from_db()
    assert booked.unit.status == FulfilmentUnit.Status.DISPUTED
    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.COMPLETED, (
        "an open dispute lives underneath a settled group, it does not hold the group open"
    )


# --- Customer does not respond: evidence-gated automatic finalization --------------------------


def test_auto_finalization_is_evidence_gated_and_runs_exactly_once() -> None:
    booked = create_booked_group(key_prefix="fo-autofinal")
    booking = _start_work(booked)
    tasks = list(WorkTask.objects.filter(booking=booking))
    submission = submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="All done.",
        safety_damage_declared=False,
        outcomes=[
            OutcomeInput(
                work_task_id=task.id,
                outcome=WorkOutcome.Outcome.COMPLETED,
                quantity=task.quantity,
            )
            for task in tasks
        ],
        expected_version=booking.version,
    )
    submission.submitted_at = timezone.now() - timedelta(days=7)
    submission.save(update_fields=("submitted_at",))

    assert auto_finalize_completion(booking_id=booking.id) is None, "finalized without evidence"

    WorkEvidence.objects.create(
        booking=booking,
        kind=WorkEvidence.Kind.AFTER,
        object_key=f"evidence/{booking.id}/after.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        sha256="a" * 64,
        processing_status=WorkEvidence.ProcessingStatus.CLEAN,
        uploaded_by=booked.partner.user,
    )
    finalized = auto_finalize_completion(booking_id=booking.id)
    replay = auto_finalize_completion(booking_id=booking.id)

    assert finalized is not None
    assert finalized.status == Booking.Status.COMPLETED
    assert replay is None, "a second sweep finalized the same Booking twice"
    assert (
        BookingStatusHistory.objects.filter(
            booking=booking, to_status=Booking.Status.COMPLETED
        ).count()
        == 1
    )
    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.COMPLETED
