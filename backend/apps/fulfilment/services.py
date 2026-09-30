"""Core Booking transition service: locking, the state machine and its audit trail.

Every command in this app that changes `Booking.status` goes through `_locked_booking_context`
and `_apply_transition`. Locks are acquired `BookingGroup` -> `FulfilmentUnit` -> `Booking`, the
same order `apps.assignments.group_services` and `recovery_services` already use for `BookingGroup`
-> `FulfilmentUnit` — extended one level deeper here because `Booking` is downstream of both.
"""

from datetime import timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking
from apps.fulfilment.exceptions import BookingCommandInvalidApiError, BookingVersionConflictApiError
from apps.fulfilment.models import BookingStatusHistory, CustomerContactAttempt, WorkTask
from apps.identity.models import User

# The fine-grained physical-work machine (03-lifecycle-and-state-machines.md). Payment, refund
# and assignment states are deliberately not encoded here.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    Booking.Status.CONFIRMED: frozenset(
        {Booking.Status.EN_ROUTE, Booking.Status.RECOVERY_REQUIRED, Booking.Status.CANCELLED}
    ),
    Booking.Status.EN_ROUTE: frozenset(
        {Booking.Status.ARRIVED, Booking.Status.RECOVERY_REQUIRED, Booking.Status.CANCELLED}
    ),
    Booking.Status.ARRIVED: frozenset(
        {
            Booking.Status.IN_PROGRESS,
            Booking.Status.RECOVERY_REQUIRED,
            Booking.Status.CANCELLED,
        }
    ),
    Booking.Status.IN_PROGRESS: frozenset(
        {
            Booking.Status.COMPLETION_SUBMITTED,
            Booking.Status.ABORTED,
            Booking.Status.RECOVERY_REQUIRED,
        }
    ),
    Booking.Status.COMPLETION_SUBMITTED: frozenset(
        {
            Booking.Status.COMPLETED,
            Booking.Status.PARTIALLY_COMPLETED,
            Booking.Status.DISPUTED,
        }
    ),
    Booking.Status.RECOVERY_REQUIRED: frozenset(
        {Booking.Status.CONFIRMED, Booking.Status.CANCELLED}
    ),
    Booking.Status.ABORTED: frozenset(
        {Booking.Status.PARTIALLY_COMPLETED, Booking.Status.DISPUTED}
    ),
    # Quality dispute (spec §12) re-opens a settled visit inside the 72h window —
    # only to DISPUTED, never back into the cancellation fee ladder.
    Booking.Status.COMPLETED: frozenset({Booking.Status.DISPUTED}),
    Booking.Status.PARTIALLY_COMPLETED: frozenset({Booking.Status.DISPUTED}),
    Booking.Status.DISPUTED: frozenset(),
    Booking.Status.CANCELLED: frozenset(),
}

# Settled outcomes for cancellation / group projection. COMPLETED (and partial) can still
# open a quality dispute into DISPUTED within 72h, so "terminal for cancel" is not the same
# as "no further transitions at all".
TERMINAL_BOOKING_STATUSES = frozenset(
    {
        Booking.Status.COMPLETED,
        Booking.Status.PARTIALLY_COMPLETED,
        Booking.Status.DISPUTED,
        Booking.Status.CANCELLED,
    }
)

# `carts.FulfilmentUnit.Status` stays coarse: every fine-grained "still in flight" Booking status
# reads back as `BOOKED`, every status that needs an operator decision reads back as
# `RECOVERY_REQUIRED`, and only a true fulfilment outcome reads back as its own coarse status.
UNIT_STATUS_BY_BOOKING_STATUS: dict[str, str] = {
    Booking.Status.CONFIRMED: FulfilmentUnit.Status.BOOKED,
    Booking.Status.EN_ROUTE: FulfilmentUnit.Status.BOOKED,
    Booking.Status.ARRIVED: FulfilmentUnit.Status.BOOKED,
    Booking.Status.IN_PROGRESS: FulfilmentUnit.Status.BOOKED,
    Booking.Status.COMPLETION_SUBMITTED: FulfilmentUnit.Status.BOOKED,
    Booking.Status.RECOVERY_REQUIRED: FulfilmentUnit.Status.RECOVERY_REQUIRED,
    Booking.Status.ABORTED: FulfilmentUnit.Status.RECOVERY_REQUIRED,
    Booking.Status.CANCELLED: FulfilmentUnit.Status.CANCELLED,
    Booking.Status.COMPLETED: FulfilmentUnit.Status.COMPLETED,
    Booking.Status.PARTIALLY_COMPLETED: FulfilmentUnit.Status.PARTIALLY_COMPLETED,
    Booking.Status.DISPUTED: FulfilmentUnit.Status.DISPUTED,
}

# A unit's fulfilment lifecycle is over once it reaches one of these. An open dispute does not
# block the *group's* projection from completing — `06-fulfilment-safety-quality-and-disputes.md`
# is explicit that a disputed unit's detail lives underneath a completed group, not the reverse.
UNIT_FULFILMENT_TERMINAL_STATUSES = frozenset(
    {
        FulfilmentUnit.Status.CANCELLED,
        FulfilmentUnit.Status.FAILED,
        FulfilmentUnit.Status.COMPLETED,
        FulfilmentUnit.Status.PARTIALLY_COMPLETED,
        FulfilmentUnit.Status.DISPUTED,
    }
)

# Of those terminal outcomes, the ones where a Partner actually turned up and did something the
# Customer was billed for. A group needs at least one of them before it may read back as
# `COMPLETED`; a group where every unit was cancelled delivered nothing and says so.
UNIT_DELIVERED_STATUSES = frozenset(
    {
        FulfilmentUnit.Status.COMPLETED,
        FulfilmentUnit.Status.PARTIALLY_COMPLETED,
        FulfilmentUnit.Status.DISPUTED,
    }
)


class BookingCommand:
    MARK_EN_ROUTE = "MARK_EN_ROUTE"
    MARK_ARRIVED = "MARK_ARRIVED"
    CUSTOMER_UNAVAILABLE_WAIT_STARTED = "CUSTOMER_UNAVAILABLE_WAIT_STARTED"
    DECLARE_LATE = "DECLARE_LATE"
    START_WORK = "START_WORK"
    ABORT_WORK = "ABORT_WORK"
    SUBMIT_COMPLETION = "SUBMIT_COMPLETION"
    CONFIRM_COMPLETION = "CONFIRM_COMPLETION"
    DISPUTE_COMPLETION = "DISPUTE_COMPLETION"
    AUTO_FINALIZE_COMPLETION = "AUTO_FINALIZE_COMPLETION"
    OPEN_QUALITY_DISPUTE = "OPEN_QUALITY_DISPUTE"
    CANCEL = "CANCEL"
    RESCHEDULE = "RESCHEDULE"
    ADDRESS_CHANGE = "ADDRESS_CHANGE"
    PARTNER_RELEASE = "PARTNER_RELEASE"
    RECOVER_PARTNER = "RECOVER_PARTNER"
    SCOPE_AMENDMENT_PROPOSED = "SCOPE_AMENDMENT_PROPOSED"
    SCOPE_AMENDMENT_APPROVED = "SCOPE_AMENDMENT_APPROVED"
    SCOPE_AMENDMENT_DECLINED = "SCOPE_AMENDMENT_DECLINED"
    SCOPE_AMENDMENT_AUTHORIZED = "SCOPE_AMENDMENT_AUTHORIZED"


def locked_booking_context(booking_id: UUID) -> tuple[BookingGroup, FulfilmentUnit, Booking]:
    """Lock a Booking's ancestry in the deadlock-safe order: group, then unit, then booking."""

    row = (
        Booking.objects.select_related("fulfilment_unit")
        .values_list("fulfilment_unit_id", "fulfilment_unit__booking_group_id")
        .get(id=booking_id)
    )
    unit_id, group_id = row
    if unit_id is None:
        raise BookingCommandInvalidApiError(
            reason="This Booking has no Fulfilment Unit and cannot use fulfilment commands."
        )
    group = BookingGroup.objects.select_for_update().get(id=group_id)
    unit = (
        FulfilmentUnit.objects.select_for_update()
        .select_related("service_area", "quote_unit__quote")
        .get(id=unit_id)
    )
    booking = (
        Booking.objects.select_for_update()
        .select_related("partner", "reservation")
        .get(id=booking_id)
    )
    return group, unit, booking


def guard_booking_version(booking: Booking, expected_version: int) -> None:
    if booking.version != expected_version:
        raise BookingVersionConflictApiError(current_version=booking.version)


def _set_unit_status_for_booking(unit: FulfilmentUnit, booking_status: str) -> None:
    target = UNIT_STATUS_BY_BOOKING_STATUS[booking_status]
    if unit.status == target:
        return
    unit.status = target
    unit.version += 1
    unit.save(update_fields=("status", "version", "updated_at"))


def sync_group_completion(group: BookingGroup) -> None:
    """Derive a `BOOKED` group's outcome once every one of its units has reached a terminal one.

    `COMPLETED` is not the only possible ending: a group whose every unit was cancelled delivered
    nothing, and publishing that to the Customer as "completed" would be exactly the hidden
    success state the quality rules forbid. It reads `CANCELLED` instead. One delivered unit is
    enough to make the group `COMPLETED` — the cancelled sibling keeps its own independent truth.
    """

    if group.status != BookingGroup.Status.BOOKED:
        return
    units = list(group.units.all())
    if not units or not all(unit.status in UNIT_FULFILMENT_TERMINAL_STATUSES for unit in units):
        return
    delivered = any(unit.status in UNIT_DELIVERED_STATUSES for unit in units)
    group.status = BookingGroup.Status.COMPLETED if delivered else BookingGroup.Status.CANCELLED
    group.version += 1
    group.save(update_fields=("status", "version", "updated_at"))


def record_transition(
    *,
    booking: Booking,
    actor: User | None,
    command: str,
    from_status: str,
    to_status: str,
    reason: str = "",
    idempotency_key: str = "",
    request_trace_id: str = "",
    context: dict[str, Any] | None = None,
) -> BookingStatusHistory:
    return BookingStatusHistory.objects.create(
        booking=booking,
        actor=actor,
        command=command,
        from_status=from_status,
        to_status=to_status,
        reason=reason,
        idempotency_key=idempotency_key,
        request_trace_id=request_trace_id,
        context=context or {},
    )


def apply_transition(
    *,
    group: BookingGroup,
    unit: FulfilmentUnit,
    booking: Booking,
    to_status: str,
    command: str,
    actor: User | None,
    reason: str = "",
    idempotency_key: str = "",
    request_trace_id: str = "",
    context: dict[str, Any] | None = None,
    extra_booking_fields: dict[str, Any] | None = None,
) -> Booking:
    """Move a locked Booking to `to_status`, keep the unit projection in step, and audit it.

    Callers already hold the group/unit/booking locks via `locked_booking_context`.
    """

    from_status = booking.status
    if to_status not in ALLOWED_TRANSITIONS.get(from_status, frozenset()):
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {from_status} cannot move to {to_status}."
        )
    booking.status = to_status
    booking.version += 1
    for field, value in (extra_booking_fields or {}).items():
        setattr(booking, field, value)
    update_fields = {"status", "version", "updated_at", *(extra_booking_fields or {}).keys()}
    booking.save(update_fields=tuple(update_fields))
    _set_unit_status_for_booking(unit, to_status)
    sync_group_completion(group)
    record_transition(
        booking=booking,
        actor=actor,
        command=command,
        from_status=from_status,
        to_status=to_status,
        reason=reason,
        idempotency_key=idempotency_key,
        request_trace_id=request_trace_id,
        context=context,
    )
    return booking


@transaction.atomic
def mark_en_route(
    *,
    booking_id: UUID,
    partner_id: UUID,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    group, unit, booking = locked_booking_context(booking_id)
    if booking.partner_id != partner_id:
        raise PermissionError("This Booking belongs to another Partner.")
    guard_booking_version(booking, expected_version)
    return apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.EN_ROUTE,
        command=BookingCommand.MARK_EN_ROUTE,
        actor=booking.partner.user,
        idempotency_key=idempotency_key,
        extra_booking_fields={"en_route_at": timezone.now()},
    )


@transaction.atomic
def mark_arrived(
    *,
    booking_id: UUID,
    partner_id: UUID,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    group, unit, booking = locked_booking_context(booking_id)
    if booking.partner_id != partner_id:
        raise PermissionError("This Booking belongs to another Partner.")
    guard_booking_version(booking, expected_version)
    return apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.ARRIVED,
        command=BookingCommand.MARK_ARRIVED,
        actor=booking.partner.user,
        idempotency_key=idempotency_key,
        extra_booking_fields={"arrived_at": timezone.now()},
    )


@transaction.atomic
def mark_customer_unavailable_wait_started(
    *,
    booking_id: UUID,
    partner_id: UUID,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    """Start the wait/contact workflow. Does not change `Booking.status` — the Partner has
    arrived and is simply waiting; the eventual outcome (customer returns, or a fee-free/
    fee-bearing cancellation) is recorded by the commands that follow."""

    _group, _unit, booking = locked_booking_context(booking_id)
    if booking.partner_id != partner_id:
        raise PermissionError("This Booking belongs to another Partner.")
    guard_booking_version(booking, expected_version)
    if booking.status != Booking.Status.ARRIVED:
        raise BookingCommandInvalidApiError(
            reason="Customer-unavailable wait can only start after the Partner has arrived."
        )
    if booking.customer_unavailable_wait_started_at is not None:
        return booking
    booking.customer_unavailable_wait_started_at = timezone.now()
    booking.version += 1
    booking.save(update_fields=("customer_unavailable_wait_started_at", "version", "updated_at"))
    record_transition(
        booking=booking,
        actor=booking.partner.user,
        command=BookingCommand.CUSTOMER_UNAVAILABLE_WAIT_STARTED,
        from_status=booking.status,
        to_status=booking.status,
        idempotency_key=idempotency_key,
    )
    return booking


@transaction.atomic
def record_customer_contact_attempt(
    *,
    booking_id: UUID,
    partner_id: UUID,
    outcome: str,
) -> CustomerContactAttempt:
    _group, _unit, booking = locked_booking_context(booking_id)
    if booking.partner_id != partner_id:
        raise PermissionError("This Booking belongs to another Partner.")
    if booking.customer_unavailable_wait_started_at is None:
        raise BookingCommandInvalidApiError(
            reason="Start the customer-unavailable wait before recording a contact attempt."
        )
    return CustomerContactAttempt.objects.create(
        booking=booking,
        attempted_at=timezone.now(),
        outcome=outcome,
    )


def customer_unavailable_wait_elapsed(booking: Booking) -> bool:
    if booking.customer_unavailable_wait_started_at is None:
        return False
    deadline = booking.customer_unavailable_wait_started_at + timedelta(
        minutes=settings.M1_CUSTOMER_WAIT_MINUTES
    )
    return timezone.now() >= deadline


def is_partner_late(*, booking: Booking, unit: FulfilmentUnit) -> bool:
    if booking.late_declared_at is not None:
        return True
    if booking.status not in (Booking.Status.CONFIRMED, Booking.Status.EN_ROUTE):
        return False
    deadline = unit.requested_start + timedelta(
        minutes=unit.arrival_window_minutes + settings.M1_LATE_ARRIVAL_GRACE_MINUTES
    )
    return timezone.now() >= deadline


def materialize_original_work_tasks(*, booking: Booking, unit: FulfilmentUnit) -> list[WorkTask]:
    """One `WorkTask` per original scope line, created exactly once at the first IN_PROGRESS.

    Idempotent by construction: a replayed start command finds the tasks already there and
    returns them unchanged rather than raising the unique-position constraint.
    """

    existing = list(WorkTask.objects.filter(booking=booking, kind=WorkTask.Kind.ORIGINAL))
    if existing:
        return existing
    tasks = [
        WorkTask(
            booking=booking,
            fulfilment_unit_line=line,
            kind=WorkTask.Kind.ORIGINAL,
            position=line.position,
            code=line.code,
            label=line.label,
            quantity=line.quantity,
            amount_paise=line.amount_paise,
            currency=line.currency,
        )
        for line in unit.lines.all()
    ]
    return list(WorkTask.objects.bulk_create(tasks))


#: Transitions an Operations-assisted outage start may perform. Restricted deliberately —
#: this is a channel-outage workaround for the Partner's own en-route/arrived statement, never
#: a general-purpose override of the state machine (`06-fulfilment-safety-quality-and-disputes.md`).
ASSISTED_OUTAGE_START_TRANSITIONS: dict[str, str] = {
    Booking.Status.CONFIRMED: Booking.Status.EN_ROUTE,
    Booking.Status.EN_ROUTE: Booking.Status.ARRIVED,
}


@transaction.atomic
def operations_assisted_outage_start(
    *,
    booking_id: UUID,
    operator: User,
    outage_reason: str,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    """Operations records a Partner's en-route/arrived statement when their own channel is down.

    Restricted to the one step a Partner could not report themselves, always requires a
    non-empty audited reason, and is never a substitute for the Partner's own commands once
    their channel recovers — it does not touch IN_PROGRESS or anything past it.
    """

    group, unit, booking = locked_booking_context(booking_id)
    guard_booking_version(booking, expected_version)
    if not outage_reason.strip():
        raise BookingCommandInvalidApiError(
            reason="An outage reason is required for an Operations-assisted transition."
        )
    to_status = ASSISTED_OUTAGE_START_TRANSITIONS.get(booking.status)
    if to_status is None:
        raise BookingCommandInvalidApiError(
            reason=(
                f"An Operations-assisted outage start cannot apply to a Booking in "
                f"{booking.status}."
            )
        )
    extra_fields = (
        {"en_route_at": timezone.now()}
        if to_status == Booking.Status.EN_ROUTE
        else {"arrived_at": timezone.now()}
    )
    command = (
        BookingCommand.MARK_EN_ROUTE
        if to_status == Booking.Status.EN_ROUTE
        else BookingCommand.MARK_ARRIVED
    )
    return apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=to_status,
        command=command,
        actor=operator,
        reason=outage_reason,
        idempotency_key=idempotency_key,
        context={"assisted": True, "outage_reason": outage_reason},
        extra_booking_fields=extra_fields,
    )


@transaction.atomic
def declare_booking_late(*, booking_id: UUID) -> Booking | None:
    """Watchdog step: flag an overdue Partner once. Never cancels or reschedules by itself —
    it only unlocks the fee-free cancel/reschedule path for the Customer."""

    _group, unit, booking = locked_booking_context(booking_id)
    if booking.late_declared_at is not None:
        return None
    if not is_partner_late(booking=booking, unit=unit):
        return None
    booking.late_declared_at = timezone.now()
    booking.version += 1
    booking.save(update_fields=("late_declared_at", "version", "updated_at"))
    record_transition(
        booking=booking,
        actor=None,
        command=BookingCommand.DECLARE_LATE,
        from_status=booking.status,
        to_status=booking.status,
        reason="partner_overdue",
    )
    return booking


def cancel_booking_group_on_refund(*, payment_attempt: Any, refund: Any) -> None:
    """Cancel FulfilmentUnit bookings after a full BOOKING_GROUP refund — no new Refund rows."""
    from apps.carts.models import FulfilmentUnit
    from apps.commerce.models import Booking, FinancialException
    from apps.commerce.services.base import _open_exception
    from apps.fulfilment.cancellation.cancel import _release_booking_reservation

    unit_ids = set(payment_attempt.allocations.values_list("fulfilment_unit_id", flat=True))
    if not unit_ids:
        group_id = payment_attempt.booking_group_id
        if group_id is None and getattr(refund, "order_id", None):
            group_id = refund.order.booking_group_id
        if group_id is not None:
            unit_ids = set(
                FulfilmentUnit.objects.filter(booking_group_id=group_id).values_list(
                    "id", flat=True
                )
            )

    for unit_id in unit_ids:
        booking = (
            Booking.objects.filter(fulfilment_unit_id=unit_id).order_by("-version").first()
        )
        if booking is None:
            continue

        group, unit, booking = locked_booking_context(booking.id)

        if booking.status == Booking.Status.CANCELLED:
            _release_booking_reservation(booking)
            continue

        if Booking.Status.CANCELLED not in ALLOWED_TRANSITIONS.get(booking.status, frozenset()):
            # Completed / in-progress / disputed: do not force an illegal transition.
            # Ledger REVERSAL (T6) still runs from the commerce hook when earnings exist.
            if booking.status not in TERMINAL_BOOKING_STATUSES:
                _open_exception(
                    kind=FinancialException.Kind.REFUND_FAILED,
                    code="booking_not_cancellable_after_refund",
                    attempt=payment_attempt,
                    refund=refund,
                    context={"booking_id": str(booking.id), "status": booking.status},
                )
            continue

        apply_transition(
            group=group,
            unit=unit,
            booking=booking,
            to_status=Booking.Status.CANCELLED,
            command=BookingCommand.CANCEL,
            actor=None,
            reason=f"Payment {payment_attempt.id} was fully refunded.",
            idempotency_key=f"refund-cancel:{refund.id}:{booking.id}",
            extra_booking_fields={
                "cancelled_at": timezone.now(),
                "cancellation_reason": "full_refund",
            },
        )
        _release_booking_reservation(booking)
