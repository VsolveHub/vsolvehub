"""Abort, line-level outcomes, completion submission, Customer confirm/dispute and the
evidence-gated auto-finalize watchdog.

`06-fulfilment-safety-quality-and-disputes.md`: a Partner's own report of what happened is never
the final word — the Customer confirms or disputes it, and an unanswered report only ever
auto-finalizes once real evidence backs it. Money never gets a second path: the refund for
whatever was not performed is the existing `apps.fulfilment.refunds` / `commerce.Refund` /
`commerce.PaymentAllocation` machinery, exactly like cancellation.
"""

from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking, Refund
from apps.foundation.services import enqueue_outbox_event
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import (
    BookingStatusHistory,
    CompletionResponse,
    CompletionSubmission,
    WorkEvidence,
    WorkOutcome,
    WorkTask,
)
from apps.fulfilment.refunds import create_partial_refunds
from apps.fulfilment.services import (
    BookingCommand,
    apply_transition,
    guard_booking_version,
    locked_booking_context,
)
from apps.identity.models import User
from apps.payouts.services import settle_booking_earning

REFUND_REASON_PARTIAL_COMPLETION = "partial_completion"

# A Partner may only report a completion (with or without a preceding Abort) while doing the
# physical work, or having just stopped it.
COMPLETION_SUBMITTABLE_STATUSES = (Booking.Status.IN_PROGRESS, Booking.Status.ABORTED)


@dataclass(frozen=True, slots=True)
class OutcomeInput:
    work_task_id: UUID
    outcome: str
    quantity: int = 0
    reason: str = ""


@transaction.atomic
def abort_work(
    *,
    booking_id: UUID,
    partner_id: UUID,
    reason: str,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    """The Partner stops mid-job. Only moves the state machine — line-level settlement is a
    separate `submit_completion` call, so a Partner who has not yet assessed what got done is
    never forced to guess it in the same request that reports they stopped."""

    group, unit, booking = locked_booking_context(booking_id)
    if booking.partner_id != partner_id:
        raise PermissionError("This Booking belongs to another Partner.")
    if booking.status == Booking.Status.ABORTED:
        return booking
    guard_booking_version(booking, expected_version)
    if booking.status != Booking.Status.IN_PROGRESS:
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {booking.status} cannot be aborted."
        )
    if not reason.strip():
        raise BookingCommandInvalidApiError(reason="A reason is required to abort work.")
    return apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.ABORTED,
        command=BookingCommand.ABORT_WORK,
        actor=booking.partner.user,
        reason=reason,
        idempotency_key=idempotency_key,
    )


def _settlement_status(submission: CompletionSubmission) -> str:
    """What a submission's own reported outcomes resolve to, before any Customer dispute.

    A declared safety/damage concern always routes to `DISPUTED` — a payout hold is never
    skipped on the Partner's own say-so that the work was otherwise fine.
    """

    if submission.safety_damage_declared:
        return Booking.Status.DISPUTED
    outcomes = list(submission.outcomes.all())
    if outcomes and all(o.outcome == WorkOutcome.Outcome.COMPLETED for o in outcomes):
        return Booking.Status.COMPLETED
    return Booking.Status.PARTIALLY_COMPLETED


def _refund_unperformed_work(
    *,
    booking: Booking,
    unit: FulfilmentUnit,
    submission: CompletionSubmission,
    idempotency_key: str,
) -> list[Refund]:
    """Refund whatever the *original* scope did not get done, prorated for a `PARTIAL` outcome.

    M1 boundary, documented rather than silently incomplete: an authorized `ScopeAmendment`'s
    revision payment shares the original catalog line's `PaymentAllocation` (`amendments.py`), so
    an incomplete amendment task is not separately refundable here — Operations settles it by
    hand through the same `Refund` path if that ever happens.
    """

    outcomes = submission.outcomes.select_related("work_task").filter(
        work_task__kind=WorkTask.Kind.ORIGINAL
    )
    not_performed_paise = 0
    for outcome in outcomes:
        task = outcome.work_task
        if outcome.outcome == WorkOutcome.Outcome.COMPLETED:
            continue
        if outcome.outcome == WorkOutcome.Outcome.PARTIAL and task.quantity > 0:
            unperformed_qty = max(0, task.quantity - outcome.quantity)
            not_performed_paise += task.amount_paise * unperformed_qty // task.quantity
        else:
            not_performed_paise += task.amount_paise
    if not_performed_paise <= 0:
        return []
    return create_partial_refunds(
        booking=booking,
        unit=unit,
        refund_amount_paise=not_performed_paise,
        reason_code=REFUND_REASON_PARTIAL_COMPLETION,
        requested_by_id=booking.customer_id,
        idempotency_key=idempotency_key,
    )


@transaction.atomic
def submit_completion(
    *,
    booking_id: UUID,
    partner_id: UUID,
    notes: str,
    safety_damage_declared: bool,
    outcomes: list[OutcomeInput],
    expected_version: int,
    idempotency_key: str = "",
) -> CompletionSubmission:
    """One `CompletionSubmission` per Booking, with exactly one `WorkOutcome` per `WorkTask`.

    From `IN_PROGRESS` this waits for the Customer (`COMPLETION_SUBMITTED`). From `ABORTED` there
    is no Customer round trip in the state machine — the outcome settles immediately, matching
    `ALLOWED_TRANSITIONS[ABORTED]`.
    """

    group, unit, booking = locked_booking_context(booking_id)
    if booking.partner_id != partner_id:
        raise PermissionError("This Booking belongs to another Partner.")
    existing = CompletionSubmission.objects.filter(booking=booking).first()
    if existing is not None:
        return existing
    guard_booking_version(booking, expected_version)
    if booking.status not in COMPLETION_SUBMITTABLE_STATUSES:
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {booking.status} cannot submit a completion."
        )
    tasks = {task.id: task for task in WorkTask.objects.filter(booking=booking)}
    if not tasks:
        raise BookingCommandInvalidApiError(reason="No work tasks exist to report an outcome for.")
    provided_ids = {o.work_task_id for o in outcomes}
    if provided_ids != set(tasks.keys()):
        raise BookingCommandInvalidApiError(reason="Every work task needs exactly one outcome.")
    valid_outcomes = frozenset(WorkOutcome.Outcome.values)
    for item in outcomes:
        if item.outcome not in valid_outcomes:
            raise BookingCommandInvalidApiError(
                reason=f"'{item.outcome}' is not a recognised outcome."
            )
        if item.quantity > tasks[item.work_task_id].quantity:
            raise BookingCommandInvalidApiError(
                reason="An outcome quantity cannot exceed its task's quantity."
            )

    from_status = booking.status
    submission = CompletionSubmission.objects.create(
        booking=booking,
        submitted_by=booking.partner,
        notes=notes,
        safety_damage_declared=safety_damage_declared,
        submitted_at=timezone.now(),
    )
    WorkOutcome.objects.bulk_create(
        WorkOutcome(
            completion_submission=submission,
            work_task=tasks[item.work_task_id],
            outcome=item.outcome,
            quantity=item.quantity,
            reason=item.reason,
        )
        for item in outcomes
    )

    if from_status == Booking.Status.IN_PROGRESS:
        apply_transition(
            group=group,
            unit=unit,
            booking=booking,
            to_status=Booking.Status.COMPLETION_SUBMITTED,
            command=BookingCommand.SUBMIT_COMPLETION,
            actor=booking.partner.user,
            idempotency_key=idempotency_key,
            context={
                "submission_id": str(submission.id),
                "safety_damage_declared": safety_damage_declared,
            },
        )
    else:
        _settle_submission(
            group=group,
            unit=unit,
            booking=booking,
            submission=submission,
            actor=booking.partner.user,
            command=BookingCommand.SUBMIT_COMPLETION,
            idempotency_key=idempotency_key,
        )
    return submission


def _settle_submission(
    *,
    group: BookingGroup,
    unit: FulfilmentUnit,
    booking: Booking,
    submission: CompletionSubmission,
    actor: User | None,
    command: str,
    idempotency_key: str,
) -> Booking:
    to_status = _settlement_status(submission)
    extra_fields = {"payout_hold": True} if to_status == Booking.Status.DISPUTED else None
    booking = apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=to_status,
        command=command,
        actor=actor,
        idempotency_key=idempotency_key,
        context={"submission_id": str(submission.id)},
        extra_booking_fields=extra_fields,
    )
    if to_status == Booking.Status.COMPLETED:
        history = (
            BookingStatusHistory.objects.filter(
                booking=booking,
                to_status=Booking.Status.COMPLETED,
            )
            .order_by("-created_at")
            .first()
        )
        if history is not None:
            enqueue_outbox_event(
                aggregate_type="booking",
                aggregate_id=booking.id,
                event_type="customer.fulfilment.completed",
                idempotency_key=f"customer-fulfilment-completed:{booking.id}",
                payload={
                    "event_version": 1,
                    "booking_id": str(booking.id),
                    "customer_id": str(booking.customer_id),
                    "booking_group_id": str(group.id),
                    "fulfilment_unit_id": str(unit.id),
                    "partner_id": str(booking.partner_id),
                    "status_history_id": str(history.id),
                    "completed_at": history.created_at.isoformat(),
                },
            )
    if to_status == Booking.Status.PARTIALLY_COMPLETED:
        _refund_unperformed_work(
            booking=booking, unit=unit, submission=submission, idempotency_key=idempotency_key
        )
    # Delivered work earns money. `settle_booking_earning` existed but was called only by the
    # demo seed, so every job completed through the app paid the Partner nothing and their
    # earnings screen showed a balance that stopped moving while they kept working.
    #
    # Called here and again in `dispute_completion`, which reaches `DISPUTED` through its own
    # `apply_transition` rather than through this function. Two call sites is the honest count;
    # they are the two places a Booking reaches a terminal settlement.
    #
    # After the transition, not before: the settlement re-reads the Booking's status and
    # `payout_hold` to decide whether the money is `AVAILABLE` or held `PENDING`, and before the
    # transition both still say what they said a moment ago. Idempotent by database constraint
    # (`payouts_one_earning_per_booking`), so a replayed command cannot pay twice.
    settle_booking_earning(booking_id=booking.id, actor=actor)
    return booking


@transaction.atomic
def confirm_completion(
    *,
    booking_id: UUID,
    customer_id: UUID,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    """The Customer accepts the Partner's reported outcomes at face value."""

    group, unit, booking = locked_booking_context(booking_id)
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    submission = CompletionSubmission.objects.select_for_update().filter(booking=booking).first()
    if submission is None:
        raise BookingCommandInvalidApiError(
            reason="No completion has been submitted for this Booking."
        )
    existing_response = CompletionResponse.objects.filter(completion_submission=submission).first()
    if existing_response is not None:
        if existing_response.decision == CompletionResponse.Decision.CONFIRMED:
            return booking
        raise BookingCommandInvalidApiError(reason="This completion already has a decision.")
    guard_booking_version(booking, expected_version)
    if booking.status != Booking.Status.COMPLETION_SUBMITTED:
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {booking.status} has no pending completion to confirm."
        )
    CompletionResponse.objects.create(
        completion_submission=submission,
        responded_by=booking.customer,
        decision=CompletionResponse.Decision.CONFIRMED,
        responded_at=timezone.now(),
    )
    return _settle_submission(
        group=group,
        unit=unit,
        booking=booking,
        submission=submission,
        actor=booking.customer,
        command=BookingCommand.CONFIRM_COMPLETION,
        idempotency_key=idempotency_key,
    )


@transaction.atomic
def dispute_completion(
    *,
    booking_id: UUID,
    customer_id: UUID,
    dispute_reason: str,
    disputed_outcome_ids: list[UUID] | None = None,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    """The Customer disagrees with what the Partner reported — always `DISPUTED`, regardless of
    what the outcomes themselves said, with a payout hold Operations' future ledger will read."""

    group, unit, booking = locked_booking_context(booking_id)
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    submission = CompletionSubmission.objects.select_for_update().filter(booking=booking).first()
    if submission is None:
        raise BookingCommandInvalidApiError(
            reason="No completion has been submitted for this Booking."
        )
    existing_response = CompletionResponse.objects.filter(completion_submission=submission).first()
    if existing_response is not None:
        if existing_response.decision == CompletionResponse.Decision.DISPUTED:
            return booking
        raise BookingCommandInvalidApiError(reason="This completion already has a decision.")
    guard_booking_version(booking, expected_version)
    if booking.status != Booking.Status.COMPLETION_SUBMITTED:
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {booking.status} has no pending completion to dispute."
        )
    if not dispute_reason.strip():
        raise BookingCommandInvalidApiError(reason="A reason is required to dispute a completion.")
    response = CompletionResponse.objects.create(
        completion_submission=submission,
        responded_by=booking.customer,
        decision=CompletionResponse.Decision.DISPUTED,
        dispute_reason=dispute_reason,
        responded_at=timezone.now(),
    )
    if disputed_outcome_ids:
        response.disputed_outcomes.set(
            WorkOutcome.objects.filter(
                id__in=disputed_outcome_ids, completion_submission=submission
            )
        )
    booking = apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.DISPUTED,
        command=BookingCommand.DISPUTE_COMPLETION,
        actor=booking.customer,
        reason=dispute_reason,
        idempotency_key=idempotency_key,
        context={"submission_id": str(submission.id)},
        extra_booking_fields={"payout_hold": True},
    )
    # A disputed visit still earns. The Partner did the work and reported it; whether the
    # Customer is right is what the dispute decides, and refusing to record the earning would
    # pre-judge that. `settle_booking_earning` reads the hold and files it `PENDING`, so the
    # money is visible to the Partner as owed-but-not-payable rather than missing.
    settle_booking_earning(booking_id=booking.id, actor=booking.customer)
    return booking


def _has_completion_evidence(booking: Booking) -> bool:
    return WorkEvidence.objects.filter(
        booking=booking,
        kind__in=(WorkEvidence.Kind.AFTER, WorkEvidence.Kind.COMPLETION),
        processing_status=WorkEvidence.ProcessingStatus.CLEAN,
    ).exists()


@transaction.atomic
def auto_finalize_completion(*, booking_id: UUID) -> Booking | None:
    """Watchdog step: finalize a silent Customer's completion, but only with real evidence behind
    it — a missing or failed-scan upload leaves the Booking pending for Operations, never a
    blind finalize on the Partner's word alone."""

    group, unit, booking = locked_booking_context(booking_id)
    if booking.status != Booking.Status.COMPLETION_SUBMITTED:
        return None
    submission = CompletionSubmission.objects.select_for_update().filter(booking=booking).first()
    if submission is None:
        return None
    if CompletionResponse.objects.filter(completion_submission=submission).exists():
        return None
    deadline = submission.submitted_at + timedelta(hours=settings.M1_COMPLETION_RESPONSE_HOURS)
    if timezone.now() < deadline:
        return None
    if not submission.safety_damage_declared and not _has_completion_evidence(booking):
        return None
    CompletionResponse.objects.create(
        completion_submission=submission,
        responded_by=None,
        decision=CompletionResponse.Decision.AUTO_FINALIZED,
        responded_at=timezone.now(),
    )
    return _settle_submission(
        group=group,
        unit=unit,
        booking=booking,
        submission=submission,
        actor=None,
        command=BookingCommand.AUTO_FINALIZE_COMPLETION,
        idempotency_key=f"auto-finalize:{submission.id}",
    )
