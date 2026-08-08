"""Shared refund computation for cancellation, reschedule and partial-work settlement.

Money never gets a second path: every refund here is the existing `commerce.Refund` /
`commerce.RefundAllocation` / `commerce.PaymentAllocation` machinery, sized against whatever
amount the caller has already computed (a fee-ladder deduction, or an unperformed-work amount)
and split across a Fulfilment Unit's live allocations the same way regardless of which command
triggered it.

One Fulfilment Unit can hold allocations on more than one `PaymentAttempt` — the checkout
capture pays for the original scope, and an authorized `ScopeAmendment`'s revision payment adds
its own. A `Refund` names exactly one attempt, because that attempt is the provider payment the
money is physically returned through, so refunds are raised **per attempt**: never one Refund
allocated across two payments, which would either ask a provider to return more than its payment
was worth or mark money returned that never moved.
"""

from uuid import UUID

from django.db.models import Sum

from apps.carts.models import FulfilmentUnit
from apps.commerce.models import (
    Booking,
    PaymentAllocation,
    PaymentAttempt,
    Refund,
    RefundAllocation,
)
from apps.foundation.services import enqueue_outbox_event

RefundableParts = list[tuple[PaymentAllocation, int]]


def refundable_unit_allocations(
    *, unit: FulfilmentUnit, for_update: bool = True
) -> RefundableParts:
    """Every live `PaymentAllocation` for this unit, with how much of each is still refundable.

    Ordered oldest attempt first, so a refund smaller than the unit's total comes out of the
    original capture before it touches a later amendment payment.

    `for_update=False` is for *reading* the number — the cancellation preview a Customer is
    shown before they decide. A read has no transaction to hold a lock in (Django refuses
    `SELECT ... FOR UPDATE` in autocommit), and locking a payment row because somebody opened a
    sheet would block the refund that sheet might be about to cause. Every path that goes on to
    write a `Refund` keeps the default and takes the lock.
    """

    queryset = PaymentAllocation.objects.all()
    if for_update:
        queryset = queryset.select_for_update()
    allocations = list(
        queryset.select_related("payment_attempt")
        .filter(fulfilment_unit=unit)
        .order_by("payment_attempt__created_at", "payment_attempt_id", "position", "id")
    )
    parts: RefundableParts = []
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
            parts.append((allocation, available))
    return parts


def _group_by_attempt(parts: RefundableParts) -> list[tuple[PaymentAttempt, RefundableParts]]:
    """Preserve `refundable_unit_allocations`' oldest-attempt-first order."""

    grouped: dict[UUID, tuple[PaymentAttempt, RefundableParts]] = {}
    for allocation, available in parts:
        attempt = allocation.payment_attempt
        _found, bucket = grouped.setdefault(attempt.id, (attempt, []))
        bucket.append((allocation, available))
    return list(grouped.values())


def _split_across(parts: RefundableParts, amount_paise: int) -> list[int]:
    """Proportional shares that sum to exactly `amount_paise`, remainder handed out in order."""

    total = sum(available for _allocation, available in parts)
    shares = [amount_paise * available // total for _allocation, available in parts]
    remainder = amount_paise - sum(shares)
    index = 0
    while remainder > 0 and index < len(parts):
        _allocation, available = parts[index]
        add = min(available - shares[index], remainder)
        shares[index] += add
        remainder -= add
        index += 1
    return shares


def _retry_key(*, attempt: PaymentAttempt, idempotency_key: str) -> str:
    """A fresh key for a refund the provider definitively rejected.

    Two constraints have to hold at once. `commerce_unique_payment_refund_key` allows one row
    per (attempt, key), so a retry cannot reuse the key. And `submit_refund` hands
    `refund.idempotency_key` straight to `provider.create_refund` — replaying the rejected key
    at the provider would simply be rejected again. Both are solved by suffixing the attempt's
    rejection count, which is stable for a given number of failures and so still de-duplicates
    a replayed retry.
    """

    failed = attempt.refunds.filter(
        idempotency_key__startswith=idempotency_key, status=Refund.Status.FAILED
    ).count()
    return f"{idempotency_key}:r{failed}"


def _refund_one_attempt(
    *,
    booking: Booking,
    attempt: PaymentAttempt,
    parts: RefundableParts,
    amount_paise: int,
    reason_code: str,
    requested_by_id: UUID,
    idempotency_key: str,
) -> Refund:
    key = idempotency_key
    if key:
        # `FAILED` is deliberately excluded, and it is the only status excluded. It means
        # `PaymentProviderRejectedError` — the provider refused outright, `reconciliation_state`
        # settled `IN_SYNC`, and no money moved. `refundable_unit_allocations` therefore counts
        # the allocation as refundable again, so reaching this line with a rejected refund on the
        # key means money is still genuinely owed. Handing that row back would report a refund
        # that will never pay and raise nothing to replace it. An *ambiguous* provider result is
        # `UNDER_REVIEW`, not `FAILED`, and is returned as live on purpose: Finance owns it and a
        # second provider call could double-refund.
        existing = (
            attempt.refunds.filter(idempotency_key=key).exclude(status=Refund.Status.FAILED).first()
        )
        if existing is not None:
            return existing
        if attempt.refunds.filter(idempotency_key=key, status=Refund.Status.FAILED).exists():
            key = _retry_key(attempt=attempt, idempotency_key=idempotency_key)
    refund = Refund.objects.create(
        order=booking.order,
        payment_attempt=attempt,
        amount_paise=amount_paise,
        currency=attempt.currency,
        reason_code=reason_code,
        idempotency_key=key,
        requested_by_id=requested_by_id,
    )
    for (allocation, _available), share in zip(
        parts, _split_across(parts, amount_paise), strict=True
    ):
        if share <= 0:
            continue
        RefundAllocation.objects.create(
            refund=refund, payment_allocation=allocation, amount_paise=share
        )
    enqueue_outbox_event(
        aggregate_type="refund",
        aggregate_id=refund.id,
        event_type="refund.submission_requested",
        idempotency_key=f"refund-submit:{refund.id}",
        payload={"refund_id": str(refund.id)},
    )
    return refund


def create_partial_refunds(
    *,
    booking: Booking,
    unit: FulfilmentUnit,
    refund_amount_paise: int,
    reason_code: str,
    requested_by_id: UUID,
    idempotency_key: str,
) -> list[Refund]:
    """Cap the request at what remains refundable and return it, one `Refund` per attempt.

    Returns an empty list rather than a zero-amount `Refund` row.

    **A replay returns `[]`, not the refunds the first call raised.** The de-duplication happens
    a step earlier than it looks: `refundable_unit_allocations` subtracts refunds that are
    already in flight, so once the first call's rows exist there is nothing left refundable,
    `parts` is empty and this returns immediately. `_refund_one_attempt`'s key lookup is the
    second line of defence, reached only when a rejected refund has freed its allocation again.
    Either way no double refund is possible — but a caller must not read `[]` as "nothing was
    ever refunded". Read the `BookingStatusHistory` context for that; it holds the real ids.

    The same idempotency key is safe across attempts: `commerce_unique_payment_refund_key`
    scopes it to one attempt, so two attempts each get their own refund rather than colliding.
    """

    parts = refundable_unit_allocations(unit=unit)
    if not parts or refund_amount_paise <= 0:
        return []
    remaining = min(refund_amount_paise, sum(available for _allocation, available in parts))
    refunds: list[Refund] = []
    for attempt, attempt_parts in _group_by_attempt(parts):
        if remaining <= 0:
            break
        attempt_total = sum(available for _allocation, available in attempt_parts)
        take = min(remaining, attempt_total)
        if take <= 0:
            continue
        refunds.append(
            _refund_one_attempt(
                booking=booking,
                attempt=attempt,
                parts=attempt_parts,
                amount_paise=take,
                reason_code=reason_code,
                requested_by_id=requested_by_id,
                idempotency_key=idempotency_key,
            )
        )
        remaining -= take
    return refunds
