"""Customer cancellation: the fee ladder, one visit, and the whole booked group.

The boundary: everything that ends a booked visit at the Customer's request and moves money for
it. The fee band is read from the frozen `QuoteUnit.cancellation_policy_snapshot`, never live
config, and refunds are the existing `commerce.Refund` / `commerce.RefundAllocation` /
`commerce.PaymentAllocation` tables. The group-wide command at the bottom is deliberately not a
second implementation of any of that: it loops the identical `_cancel_locked_unit` the
unit-scoped command uses, which is why it lives in this module rather than one of its own.

Rescheduling and the group address change are the other half of the package and live in
`reschedule`; nothing here reaches for them.
"""

from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.carts.exceptions import BookingGroupConflictApiError
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking, Refund
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.gates import arrival_was_time_checked, booking_gates
from apps.fulfilment.models import BookingStatusHistory, CustomerContactAttempt, WorkSession
from apps.fulfilment.refunds import create_partial_refunds, refundable_unit_allocations
from apps.fulfilment.services import (
    TERMINAL_BOOKING_STATUSES,
    BookingCommand,
    apply_transition,
    customer_unavailable_wait_elapsed,
    guard_booking_version,
    is_partner_late,
    locked_booking_context,
)

from .base import (
    _by_unit_id,
    _guard_cancellation_reason,
    _guard_group_idempotency_key,
    _locked_group_bookings,
)

REFUND_REASON_CUSTOMER_CANCELLATION = "customer_cancellation"

_MORE_THAN_24H_HOURS = 24
_MORE_THAN_2H_HOURS = 2

#: Every Booking status a Customer may still walk away from. `RECOVERY_REQUIRED` belongs here:
#: `01-scope-and-flow.md` promises "Partner releases before start → recovery, reschedule or full
#: refund", so a Customer who does not want to wait for a replacement must be able to leave.
#: It is conditional, though — see `customer_can_cancel`.
CUSTOMER_CANCELLABLE_STATUSES = (
    Booking.Status.CONFIRMED,
    Booking.Status.EN_ROUTE,
    Booking.Status.ARRIVED,
    Booking.Status.RECOVERY_REQUIRED,
)

#: Why a fee band's amount was waived, recorded on the audit row rather than silently zeroed.
FEE_WAIVER_PARTNER_RELEASED = "partner_released"
FEE_WAIVER_PARTNER_LATE = "partner_late"


def _contact_proof_complete(booking: Booking) -> bool:
    """One recorded attempt at or after each configured offset into the Customer-unavailable wait.

    `M1_CUSTOMER_CONTACT_ATTEMPT_MINUTES` is `(0, 5)`: try at the start of the wait and again five
    minutes in. Matched greedily in time order, so two taps in the first second prove one attempt,
    not two.
    """

    started = booking.customer_unavailable_wait_started_at
    if started is None:
        return False
    attempts = iter(
        CustomerContactAttempt.objects.filter(booking=booking, attempted_at__gte=started)
        .order_by("attempted_at")
        .values_list("attempted_at", flat=True)
    )
    for offset in sorted(settings.M1_CUSTOMER_CONTACT_ATTEMPT_MINUTES):
        due = started + timedelta(minutes=offset)
        if next((at for at in attempts if at >= due), None) is None:
            return False
    return True


def after_arrival_band_applies(*, unit: FulfilmentUnit, booking: Booking) -> bool:
    """The after-arrival band's own condition: "After verified arrival and the required wait and
    contact evidence" — all three, not merely a non-null `arrived_at`.

    *Verified* means the arrival fell inside the server-clock arrival window
    (`gates.arrival_was_time_checked`). Before the gates existed a Partner could tap "Arrived" a day
    early and move a Customer who then cancelled into the highest band. A Customer who cancels at
    the door without the Partner having waited and tried to reach them pays the ordinary time band.
    """

    if not arrival_was_time_checked(booking, booking_gates(booking, unit, timezone.now())):
        return False
    return customer_unavailable_wait_elapsed(booking) and _contact_proof_complete(booking)


def select_cancellation_band(*, unit: FulfilmentUnit, booking: Booking) -> dict[str, Any]:
    """The one fee band that applies right now, read from the frozen quote-time snapshot."""

    snapshot = unit.quote_unit.cancellation_policy_snapshot
    bands = {band["code"]: band for band in snapshot.get("bands", [])}
    if after_arrival_band_applies(unit=unit, booking=booking):
        code = settings.M1_CANCELLATION_BAND_VERIFIED_ARRIVAL
    else:
        hours_until_start = (unit.requested_start - timezone.now()).total_seconds() / 3600
        if hours_until_start > _MORE_THAN_24H_HOURS:
            code = settings.M1_CANCELLATION_BAND_MORE_THAN_24H
        elif hours_until_start > _MORE_THAN_2H_HOURS:
            code = settings.M1_CANCELLATION_BAND_24_TO_2H
        else:
            code = settings.M1_CANCELLATION_BAND_LESS_THAN_2H
    band = bands.get(code)
    if band is None:
        raise BookingCommandInvalidApiError(
            reason="No cancellation policy band applies to this Booking."
        )
    return {"code": code, "fee_paise": int(band["fee_paise"])}


def _apply_fee_and_refund(
    *,
    booking: Booking,
    unit: FulfilmentUnit,
    fee_paise: int,
    reason_code: str,
    requested_by_id: UUID,
    idempotency_key: str,
) -> list[Refund]:
    parts = refundable_unit_allocations(unit=unit)
    total_refundable = sum(amount for _allocation, amount in parts)
    return create_partial_refunds(
        booking=booking,
        unit=unit,
        refund_amount_paise=max(0, total_refundable - fee_paise),
        reason_code=reason_code,
        requested_by_id=requested_by_id,
        idempotency_key=idempotency_key,
    )


def _cancellation_fee(*, unit: FulfilmentUnit, booking: Booking) -> tuple[dict[str, Any], int, str]:
    """The band that applies, the fee actually charged, and why it was waived if it was.

    Two waivers, both from `01-scope-and-flow.md`'s failure-outcomes table: a Partner who has
    already released the Booking, and a Partner who is materially late. Both are platform-side
    failures, so the Customer pays nothing regardless of how close to the visit they are.
    """

    band = select_cancellation_band(unit=unit, booking=booking)
    if booking.status == Booking.Status.RECOVERY_REQUIRED:
        return band, 0, FEE_WAIVER_PARTNER_RELEASED
    if is_partner_late(booking=booking, unit=unit):
        return band, 0, FEE_WAIVER_PARTNER_LATE
    return band, int(band["fee_paise"]), ""


def customer_can_cancel(booking: Booking) -> bool:
    """Whether a Customer may still walk away from this Booking without settling it.

    `RECOVERY_REQUIRED` is the conditional one. A Partner may release before the visit, on the
    way, on site, *or mid-job* (`recovery_services.RELEASABLE_BOOKING_STATUSES`), and all four
    land in the same status — but they are not the same thing to settle. A release before work
    started leaves nothing performed, so the Customer leaves with a full refund. A release after
    work started leaves completed lines the Partner is owed for, and `01-scope-and-flow.md` is
    explicit that those settle line by line ("Partner stops mid-job → abort, site safety,
    completed-line settlement and recovery"). Cancelling one of those would refund work that
    actually happened, with no `WorkOutcome` to show for it.
    """

    if booking.status not in CUSTOMER_CANCELLABLE_STATUSES:
        return False
    if booking.status == Booking.Status.RECOVERY_REQUIRED:
        return not WorkSession.objects.filter(booking=booking).exists()
    return True


@dataclass(frozen=True, slots=True)
class CancellationPreview:
    """What cancelling this visit would cost and return, priced now, by the server.

    Exists so the Customer's confirm step can state a number instead of a warning. The client
    must never derive either figure: the fee comes from the frozen quote-time band ladder and
    the refund from live `PaymentAllocation` rows, and a browser has neither. It is a quote of
    the current moment, not a promise — crossing a band boundary between opening the sheet and
    confirming changes it, and `cancel_booking` recomputes it authoritatively either way.
    """

    band_code: str
    fee_paise: int
    #: Empty unless the fee was waived; `FEE_WAIVER_PARTNER_RELEASED` / `_PARTNER_LATE`.
    fee_waiver: str
    refund_paise: int
    currency: str


def preview_cancellation(*, unit: FulfilmentUnit, booking: Booking) -> CancellationPreview | None:
    """`None` when this visit is not the Customer's to cancel — the same answer, not zeroes.

    A visit whose Partner released mid-job is the case that matters: it is neither cancellable
    nor finished, and reporting a fee of zero and a full refund for it would describe an
    outcome the Customer cannot have.
    """

    if not customer_can_cancel(booking):
        return None
    band, fee_paise, waiver = _cancellation_fee(unit=unit, booking=booking)
    refundable = sum(
        amount for _allocation, amount in refundable_unit_allocations(unit=unit, for_update=False)
    )
    return CancellationPreview(
        band_code=band["code"],
        fee_paise=fee_paise,
        fee_waiver=waiver,
        refund_paise=max(0, refundable - fee_paise),
        currency=unit.currency,
    )


def _uncancellable_reason(booking: Booking) -> str:
    if booking.status == Booking.Status.RECOVERY_REQUIRED:
        return (
            "Work has already started on this visit. It is settled through the completion "
            "report for what was and was not done, not by cancelling it."
        )
    return f"A Booking in {booking.status} can no longer be cancelled by the Customer."


def _release_booking_reservation(booking: Booking) -> None:
    if booking.reservation_id is None:
        return
    reservation = Reservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != Reservation.Status.RELEASED:
        reservation.release()


def _cancel_locked_unit(
    *,
    group: BookingGroup,
    unit: FulfilmentUnit,
    booking: Booking,
    customer_id: UUID,
    reason: str,
    idempotency_key: str,
) -> tuple[Booking, list[Refund], int]:
    """Cancel one already-locked, already-authorized, already-validated unit Booking.

    The single place a Customer cancellation moves money and state, shared by the unit-scoped
    and group-wide commands so neither can drift into a second fee ladder or refund shape.
    """

    _guard_cancellation_reason(reason)
    band, fee_paise, waiver = _cancellation_fee(unit=unit, booking=booking)
    refunds = _apply_fee_and_refund(
        booking=booking,
        unit=unit,
        fee_paise=fee_paise,
        reason_code=REFUND_REASON_CUSTOMER_CANCELLATION,
        requested_by_id=customer_id,
        idempotency_key=idempotency_key,
    )
    booking = apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.CANCELLED,
        command=BookingCommand.CANCEL,
        actor=booking.customer,
        reason=reason,
        idempotency_key=idempotency_key,
        context={
            "band_code": band["code"],
            "fee_paise": fee_paise,
            "fee_waiver": waiver,
            "refund_ids": [str(refund.id) for refund in refunds],
        },
        extra_booking_fields={"cancelled_at": timezone.now(), "cancellation_reason": reason},
    )
    _release_booking_reservation(booking)
    return booking, refunds, fee_paise


@transaction.atomic
def cancel_booking(
    *,
    booking_id: UUID,
    customer_id: UUID,
    expected_version: int,
    reason: str,
    idempotency_key: str = "",
) -> tuple[Booking, list[Refund]]:
    """One `Refund` per `PaymentAttempt` the unit was paid on — usually exactly one."""

    group, unit, booking = locked_booking_context(booking_id)
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    guard_booking_version(booking, expected_version)
    if not customer_can_cancel(booking):
        raise BookingCommandInvalidApiError(reason=_uncancellable_reason(booking))
    booking, refunds, _fee_paise = _cancel_locked_unit(
        group=group,
        unit=unit,
        booking=booking,
        customer_id=customer_id,
        reason=reason,
        idempotency_key=idempotency_key,
    )
    return booking, refunds


@dataclass(frozen=True, slots=True)
class UnitCancellationOutcome:
    """What a group-wide cancellation did to one Fulfilment Unit, stated per unit.

    A skipped unit is reported here, never dropped from the answer — "no hidden partial success"
    means the caller can see that a unit was left alone and why, not that every unit must move.
    """

    class Outcome:
        CANCELLED = "CANCELLED"
        ALREADY_TERMINAL = "ALREADY_TERMINAL"

    fulfilment_unit_id: UUID
    booking_id: UUID
    outcome: str
    booking_status: str
    fee_paise: int
    #: One id per `PaymentAttempt` the unit's money came back through — usually exactly one, and
    #: two when an authorized scope amendment was paid for separately. Empty when nothing was
    #: refundable (a fee that consumed the whole unit, or a unit that was skipped).
    refund_ids: tuple[UUID, ...]


@dataclass(frozen=True, slots=True)
class GroupCancellationResult:
    group: BookingGroup
    units: tuple[UnitCancellationOutcome, ...]

    @property
    def cancelled(self) -> tuple[UnitCancellationOutcome, ...]:
        return tuple(
            outcome
            for outcome in self.units
            if outcome.outcome == UnitCancellationOutcome.Outcome.CANCELLED
        )

    @property
    def skipped(self) -> tuple[UnitCancellationOutcome, ...]:
        return tuple(
            outcome
            for outcome in self.units
            if outcome.outcome == UnitCancellationOutcome.Outcome.ALREADY_TERMINAL
        )


#: A group-wide cancellation has nothing left to do once the group itself is finished. Both of
#: these are legitimate endings of a cancellation — see `sync_group_completion`.
_SETTLED_GROUP_STATUSES = (BookingGroup.Status.CANCELLED, BookingGroup.Status.COMPLETED)


def _recorded_cancellation(booking: Booking) -> BookingStatusHistory | None:
    """The audit row the original cancellation wrote for this Booking, if it wrote one."""

    return (
        BookingStatusHistory.objects.filter(
            booking=booking,
            command=BookingCommand.CANCEL,
            to_status=Booking.Status.CANCELLED,
        )
        .order_by("-created_at")
        .first()
    )


def _replayed_unit_outcome(*, unit: FulfilmentUnit, booking: Booking) -> UnitCancellationOutcome:
    """Reconstruct one unit's outcome from the audit trail rather than reporting zeroes.

    A replay has to answer with what actually happened, not with a shape that merely looks
    harmless. Reporting `fee_paise=0` and no refund ids for a unit the first call charged a fee
    on tells the Customer their money is coming back in full — the same money the first call
    kept. The real values were written into the `BookingStatusHistory` context by
    `_cancel_locked_unit`, so they are read back from there.
    """

    history = (
        _recorded_cancellation(booking) if booking.status == Booking.Status.CANCELLED else None
    )
    if history is None:
        return UnitCancellationOutcome(
            fulfilment_unit_id=unit.id,
            booking_id=booking.id,
            outcome=UnitCancellationOutcome.Outcome.ALREADY_TERMINAL,
            booking_status=booking.status,
            fee_paise=0,
            refund_ids=(),
        )
    context = history.context or {}
    return UnitCancellationOutcome(
        fulfilment_unit_id=unit.id,
        booking_id=booking.id,
        outcome=UnitCancellationOutcome.Outcome.CANCELLED,
        booking_status=booking.status,
        fee_paise=int(context.get("fee_paise", 0)),
        refund_ids=tuple(UUID(value) for value in context.get("refund_ids", ())),
    )


def _settled_group_result(group: BookingGroup) -> GroupCancellationResult:
    units = list(group.units.order_by("position"))
    bookings = _by_unit_id(Booking.objects.filter(fulfilment_unit__in=units))
    outcomes = tuple(
        _replayed_unit_outcome(unit=unit, booking=bookings[unit.id])
        for unit in units
        if unit.id in bookings
    )
    return GroupCancellationResult(group=group, units=outcomes)


def _group_already_cancelled(group: BookingGroup) -> bool:
    """Whether a cancellation actually happened here, as opposed to the group merely being over.

    The distinction is the whole point. A settled group is not evidence of a replay: a group
    every visit of which was *delivered* also settles, and answering "cancel my finished
    bookings" with a success for a command that never ran — skipping the version guard on the
    way — is precisely the hidden success state the quality rules forbid. Only a group with at
    least one cancelled unit can be the second call of a cancellation.
    """

    if group.status not in _SETTLED_GROUP_STATUSES:
        return False
    return group.units.filter(status=FulfilmentUnit.Status.CANCELLED).exists()


def _ungroupcancellable_reason(group: BookingGroup) -> str:
    if group.status in _SETTLED_GROUP_STATUSES:
        return (
            "This Booking Group has already finished. Its visits are settled through their own "
            "completion or cancellation records and cannot be cancelled again."
        )
    return (
        "This Booking Group has not been paid for yet. Cancel it through the pre-payment "
        "Booking Group cancellation instead."
    )


@transaction.atomic
def cancel_booked_group(
    *,
    group_id: UUID,
    customer_id: UUID,
    expected_version: int,
    reason: str,
    idempotency_key: str = "",
) -> GroupCancellationResult:
    """Cancel every still-cancellable unit of a booked Booking Group, atomically.

    Three outcomes per unit, and only three, decided before anything is written:

    * still cancellable — cancelled, refunded under *its own* fee band, reported;
    * already finished (cancelled, completed, partially completed, disputed) — left exactly as
      it is and reported as skipped, because a finished visit is not something a later
      cancellation may rewrite;
    * anything in between (mid-work, awaiting a completion decision, aborted) — the **whole**
      command is refused and no unit moves. A group cancel is never allowed to half-land.

    Locks follow the same order as `locked_booking_context`: group, then units, then Bookings.

    Idempotent by evidence, not by mood: a replay is recognised only when the group has settled
    **and** at least one unit is actually `CANCELLED`. A group that simply finished — every visit
    delivered — is not a replay, and answering it with a success would report a command that
    never ran and skip the version guard on the way. It is refused instead. A genuine replay
    reconstructs each unit's fee and refund ids from the audit trail rather than reporting
    zeroes, so the second answer is the same as the first.
    """

    group = BookingGroup.objects.select_for_update().get(id=group_id, customer_id=customer_id)
    if _group_already_cancelled(group):
        return _settled_group_result(group)
    if group.version != expected_version:
        raise BookingGroupConflictApiError(reason="version_changed", current_version=group.version)
    if group.status != BookingGroup.Status.BOOKED:
        raise BookingCommandInvalidApiError(reason=_ungroupcancellable_reason(group))

    # Checked up front, not per unit: a group with nothing left to cancel must still refuse a
    # reason or a key the audit trail and the refund rows could not hold.
    _guard_cancellation_reason(reason)
    _guard_group_idempotency_key(idempotency_key)

    units = list(group.units.select_for_update().order_by("position"))
    bookings_by_unit_id = _locked_group_bookings(units)

    # Classify every unit before touching any of them, so a refusal is a refusal rather than a
    # rollback of work already done.
    cancellable: list[tuple[FulfilmentUnit, Booking]] = []
    skipped: list[tuple[FulfilmentUnit, Booking]] = []
    for unit in units:
        booking = bookings_by_unit_id.get(unit.id)
        if booking is None:
            raise BookingCommandInvalidApiError(
                reason=(
                    "This Booking Group has a Fulfilment Unit with no Booking and cannot be "
                    "cancelled as a group."
                )
            )
        if customer_can_cancel(booking):
            cancellable.append((unit, booking))
        elif booking.status in TERMINAL_BOOKING_STATUSES:
            skipped.append((unit, booking))
        else:
            # Includes a visit whose Partner released mid-job: it is not finished, and it is not
            # cancellable either, because there is performed work to settle first.
            raise BookingCommandInvalidApiError(
                reason=(
                    f"Visit {unit.position} is {booking.status} and cannot be cancelled, so this "
                    f"Booking Group cannot be cancelled as a whole. Resolve that visit first."
                )
            )

    outcomes = [
        UnitCancellationOutcome(
            fulfilment_unit_id=unit.id,
            booking_id=booking.id,
            outcome=UnitCancellationOutcome.Outcome.ALREADY_TERMINAL,
            booking_status=booking.status,
            fee_paise=0,
            refund_ids=(),
        )
        for unit, booking in skipped
    ]
    for unit, booking in cancellable:
        # Per-unit keys are load-bearing, not cosmetic: sibling units share one PaymentAttempt,
        # and `create_partial_refund` de-duplicates on (attempt, key) — one key for the whole
        # group would silently hand the second unit the first unit's Refund.
        unit_key = f"{idempotency_key}:{unit.id}" if idempotency_key else ""
        cancelled_booking, refunds, fee_paise = _cancel_locked_unit(
            group=group,
            unit=unit,
            booking=booking,
            customer_id=customer_id,
            reason=reason,
            idempotency_key=unit_key,
        )
        outcomes.append(
            UnitCancellationOutcome(
                fulfilment_unit_id=unit.id,
                booking_id=cancelled_booking.id,
                outcome=UnitCancellationOutcome.Outcome.CANCELLED,
                booking_status=cancelled_booking.status,
                fee_paise=fee_paise,
                refund_ids=tuple(refund.id for refund in refunds),
            )
        )
    return GroupCancellationResult(group=group, units=tuple(outcomes))
