"""Money going back: requesting a refund, submitting it, and applying the provider's answer.

The two request commands are the two shapes a refund can have — allocated against
`PaymentAllocation` rows for a cart payment, or a bare amount for a checkout-free charge that has
no allocations at all. Below them, `submit_refund` talks to the provider and
`_apply_refund_provider_result` is the single place a refund's terminal state, the attempt's
refunded total, the Order status and the credit note are written.

The boundary: asking the provider what it thinks (the reconciliation sweeps) lives in
`reconciliation`, which calls into here.
"""

from uuid import UUID

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.carts.models import FulfilmentUnit
from apps.commerce.models import (
    FinancialException,
    Order,
    PaymentAllocation,
    PaymentAttempt,
    Refund,
    RefundAllocation,
    TaxDocument,
)
from apps.commerce.providers import (
    PaymentProviderAmbiguousError,
    PaymentProviderRejectedError,
    ProviderRefund,
    get_payment_provider,
)
from apps.foundation.services import enqueue_outbox_event

from .base import PAYMENT_FINAL_STATES, _issue_document, _open_exception


@transaction.atomic
def request_unit_refund(
    *,
    order_id: UUID,
    unit_ids: list[UUID],
    reason_code: str,
    idempotency_key: str,
    requested_by_id: UUID,
) -> Refund:
    order = (
        Order.objects.select_for_update(of=("self",))
        .select_related("booking_group")
        .get(id=order_id)
    )
    if order.booking_group_id is None:
        raise ValueError("Legacy singleton Orders cannot use unit refunds.")
    attempt = (
        PaymentAttempt.objects.select_for_update()
        .filter(checkout=order.checkout, status__in=PAYMENT_FINAL_STATES)
        .order_by("-captured_at")
        .first()
    )
    if attempt is None:
        raise ValueError("The Order has no captured payment to refund.")
    existing = attempt.refunds.filter(idempotency_key=idempotency_key).first()
    if existing is not None:
        return existing
    requested_units = set(unit_ids)
    owned_units = set(
        FulfilmentUnit.objects.filter(
            booking_group_id=order.booking_group_id,
            id__in=requested_units,
        ).values_list("id", flat=True)
    )
    if not requested_units or owned_units != requested_units:
        raise ValueError("Every requested refund unit must belong to the Order's Booking Group.")
    allocations = list(
        PaymentAllocation.objects.select_for_update()
        .filter(payment_attempt=attempt, fulfilment_unit_id__in=requested_units)
        .order_by("fulfilment_unit__position", "position")
    )
    refund_parts: list[tuple[PaymentAllocation, int]] = []
    for allocation in allocations:
        pending = (
            RefundAllocation.objects.filter(
                payment_allocation=allocation,
                refund__status__in=(
                    Refund.Status.REQUESTED,
                    Refund.Status.SUBMITTED,
                    Refund.Status.PROCESSING,
                    Refund.Status.UNDER_REVIEW,
                ),
            ).aggregate(total=Sum("amount_paise"))["total"]
            or 0
        )
        available = allocation.amount_paise - allocation.refunded_paise - pending
        if available > 0:
            refund_parts.append((allocation, available))
    amount_paise = sum(amount for _allocation, amount in refund_parts)
    if amount_paise <= 0:
        raise ValueError("The selected Fulfilment Units have no refundable balance.")
    refund = Refund.objects.create(
        order=order,
        payment_attempt=attempt,
        amount_paise=amount_paise,
        currency=attempt.currency,
        reason_code=reason_code,
        idempotency_key=idempotency_key,
        requested_by_id=requested_by_id,
    )
    for allocation, amount in refund_parts:
        RefundAllocation.objects.create(
            refund=refund,
            payment_allocation=allocation,
            amount_paise=amount,
        )
    order.status = Order.Status.REFUNDING
    order.version += 1
    order.save(update_fields=("status", "version", "updated_at"))
    enqueue_outbox_event(
        aggregate_type="refund",
        aggregate_id=refund.id,
        event_type="refund.submission_requested",
        idempotency_key=f"refund-submit:{refund.id}",
        payload={"refund_id": str(refund.id)},
    )
    return refund


@transaction.atomic
def request_standalone_refund(
    *,
    payment_attempt_id: UUID,
    amount_paise: int,
    reason_code: str,
    idempotency_key: str,
    requested_by_id: UUID | None = None,
) -> Refund:
    """Refund part or all of a charge that has no Order or Fulfilment Units behind it.

    The counterpart to `request_unit_refund` for the standalone purposes. It cannot reuse that
    function for a structural reason rather than a stylistic one: unit refunds allocate against
    `PaymentAllocation` rows, and an M2 access charge has none — an allocation points at a
    `FulfilmentUnitLine`, which an unlock or a visit share does not have.

    Idempotent on `(payment_attempt, idempotency_key)`, which is the constraint
    `commerce_unique_payment_refund_key` already enforces, so an overlapping settlement sweep
    returns the refund it already asked for instead of asking twice. The remaining balance is
    checked against every refund that is not `FAILED`, so two shares of one plan can each refund
    their own amount and neither can overdraw the plan.
    """
    attempt = PaymentAttempt.objects.select_for_update().get(id=payment_attempt_id)
    existing = attempt.refunds.filter(idempotency_key=idempotency_key).first()
    if existing is not None:
        return existing
    if attempt.status not in PAYMENT_FINAL_STATES:
        raise ValueError("Only a captured payment can be refunded.")
    committed = (
        attempt.refunds.exclude(status=Refund.Status.FAILED).aggregate(total=Sum("amount_paise"))[
            "total"
        ]
        or 0
    )
    if amount_paise <= 0 or committed + amount_paise > attempt.amount_paise:
        raise ValueError("The refund exceeds the remaining refundable balance.")
    refund = Refund.objects.create(
        payment_attempt=attempt,
        amount_paise=amount_paise,
        currency=attempt.currency,
        reason_code=reason_code,
        idempotency_key=idempotency_key,
        requested_by_id=requested_by_id,
    )
    enqueue_outbox_event(
        aggregate_type="refund",
        aggregate_id=refund.id,
        event_type="refund.submission_requested",
        idempotency_key=f"refund-submit:{refund.id}",
        payload={"refund_id": str(refund.id)},
    )
    return refund


def submit_refund(*, refund_id: UUID) -> Refund:
    refund = Refund.objects.select_related("payment_attempt").get(id=refund_id)
    if refund.status != Refund.Status.REQUESTED:
        return refund
    attempt = refund.payment_attempt
    if attempt is None or not attempt.provider_payment_id:
        with transaction.atomic():
            locked = Refund.objects.select_for_update().get(id=refund.id)
            locked.status = Refund.Status.UNDER_REVIEW
            locked.failure_code = "provider_payment_reference_missing"
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.save(update_fields=("status", "failure_code", "reconciliation_state"))
            _open_exception(
                kind=FinancialException.Kind.REFUND_FAILED,
                code="provider_payment_reference_missing",
                attempt=attempt,
                refund=locked,
            )
            return locked
    provider = get_payment_provider(provider_code=attempt.provider)
    try:
        provider_refund = provider.create_refund(
            provider_payment_id=attempt.provider_payment_id,
            amount_paise=refund.amount_paise,
            receipt=str(refund.id),
            idempotency_key=refund.idempotency_key,
        )
    except PaymentProviderAmbiguousError:
        with transaction.atomic():
            locked = Refund.objects.select_for_update().get(id=refund.id)
            locked.status = Refund.Status.UNDER_REVIEW
            locked.failure_code = "provider_refund_ambiguous"
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.save(update_fields=("status", "failure_code", "reconciliation_state"))
            _open_exception(
                kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                code="provider_refund_ambiguous",
                attempt=attempt,
                refund=locked,
            )
            return locked
    except PaymentProviderRejectedError:
        with transaction.atomic():
            locked = Refund.objects.select_for_update().get(id=refund.id)
            locked.status = Refund.Status.FAILED
            locked.failure_code = "provider_refund_rejected"
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
            locked.completed_at = timezone.now()
            locked.save(
                update_fields=(
                    "status",
                    "failure_code",
                    "reconciliation_state",
                    "completed_at",
                )
            )
            _open_exception(
                kind=FinancialException.Kind.REFUND_FAILED,
                code="provider_refund_rejected",
                attempt=attempt,
                refund=locked,
            )
            return locked
    return _apply_refund_provider_result(provider_refund, refund_id=refund.id)


def _apply_archetype_refund_allocations(*, attempt: PaymentAttempt, amount_paise: int) -> None:
    """Apply a succeeded standalone refund to A7/A9 immutable allocations."""
    remaining = amount_paise
    for related_name in ("rental_allocations", "stay_allocations"):
        manager = getattr(attempt, related_name, None)
        if manager is None:
            continue
        for allocation in manager.select_for_update().order_by("created_at", "id"):
            available = allocation.amount_paise - allocation.refunded_paise
            applied = min(available, remaining)
            if applied <= 0:
                continue
            allocation.refunded_paise += applied
            allocation.save(update_fields=("refunded_paise",))
            remaining -= applied
            if remaining == 0:
                return


@transaction.atomic
def _apply_refund_provider_result(
    provider_refund: ProviderRefund, *, refund_id: UUID | None = None
) -> Refund:
    refunds = Refund.objects.select_for_update(of=("self",)).select_related(
        "payment_attempt", "order"
    )
    refund = (
        refunds.filter(id=refund_id).first()
        if refund_id is not None
        else refunds.filter(
            payment_attempt__provider_payment_id=provider_refund.provider_payment_id,
            provider_refund_id=provider_refund.provider_refund_id,
        ).first()
    )
    if refund is None:
        raise Refund.DoesNotExist("No local refund matches the provider refund.")
    if (
        refund.provider_refund_id
        and refund.provider_refund_id != provider_refund.provider_refund_id
    ):
        raise ValueError("The provider refund identifier does not match the local command.")
    refund.provider_refund_id = provider_refund.provider_refund_id
    refund.submitted_at = refund.submitted_at or timezone.now()
    normalized = provider_refund.status.lower()
    if normalized in ("processed", "succeeded"):
        if refund.status != Refund.Status.SUCCEEDED:
            attempt = refund.payment_attempt
            if attempt is None:
                raise ValueError("The provider refund has no payment attempt.")
            allocations = list(
                refund.allocations.select_for_update().select_related("payment_allocation")
            )
            for refund_allocation in allocations:
                payment_allocation = refund_allocation.payment_allocation
                next_refunded = payment_allocation.refunded_paise + refund_allocation.amount_paise
                if next_refunded > payment_allocation.amount_paise:
                    raise ValueError("The provider refund exceeds its immutable allocation.")
                payment_allocation.refunded_paise = next_refunded
                payment_allocation.save(update_fields=("refunded_paise",))
            _apply_archetype_refund_allocations(attempt=attempt, amount_paise=refund.amount_paise)
            refund.status = Refund.Status.SUCCEEDED
            refund.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
            refund.failure_code = ""
            refund.completed_at = timezone.now()
            # A cart payment owns `PaymentAllocation` rows and its refunded total is their sum.
            # A standalone charge — a scope-amendment revision, an M2 unlock, a visit plan, a
            # stage — has none, because an allocation points at a `FulfilmentUnitLine` that does
            # not exist for it. `aggregate` answers `None` (not `0`) when there are no rows, which
            # is exactly the signal that distinguishes the two, so the fallback sums the succeeded
            # refunds themselves. Without it a fully refunded unlock would settle as
            # `PARTIALLY_REFUNDED` and sit in the reconciliation report forever.
            allocated_refunds = attempt.allocations.aggregate(total=Sum("refunded_paise"))["total"]
            refunded_total = (
                allocated_refunds
                if allocated_refunds is not None
                else refund.amount_paise
                + (
                    Refund.objects.filter(
                        payment_attempt=attempt,
                        status=Refund.Status.SUCCEEDED,
                    )
                    .exclude(id=refund.id)
                    .aggregate(total=Sum("amount_paise"))["total"]
                    or 0
                )
            )
            attempt.status = (
                PaymentAttempt.Status.REFUNDED
                if refunded_total == attempt.amount_paise
                else PaymentAttempt.Status.PARTIALLY_REFUNDED
            )
            attempt.version += 1
            attempt.save(update_fields=("status", "version", "updated_at"))
            if refund.order is not None:
                refund.order.status = (
                    Order.Status.REFUNDED
                    if refunded_total == attempt.amount_paise
                    else Order.Status.CONFIRMED
                )
                refund.order.version += 1
                refund.order.save(update_fields=("status", "version", "updated_at"))
                _issue_document(
                    order=refund.order,
                    attempt=attempt,
                    kind=TaxDocument.Kind.CREDIT_NOTE,
                    allocations=[item.payment_allocation for item in allocations],
                    total_paise=refund.amount_paise,
                    allocation_amounts={
                        item.payment_allocation_id: item.amount_paise for item in allocations
                    },
                )
    elif normalized in ("failed", "rejected"):
        refund.status = Refund.Status.FAILED
        refund.failure_code = "provider_refund_failed"
        refund.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
        refund.completed_at = timezone.now()
        _open_exception(
            kind=FinancialException.Kind.REFUND_FAILED,
            code="provider_refund_failed",
            attempt=refund.payment_attempt,
            refund=refund,
        )
    else:
        refund.status = Refund.Status.PROCESSING
        refund.reconciliation_state = PaymentAttempt.ReconciliationState.PENDING
    refund.save(
        update_fields=(
            "provider_refund_id",
            "submitted_at",
            "status",
            "reconciliation_state",
            "failure_code",
            "completed_at",
        )
    )
    return refund
