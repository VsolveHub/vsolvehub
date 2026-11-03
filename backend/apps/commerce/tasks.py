"""Periodic reconciliation for provider ambiguity and in-flight refunds."""

import logging
from datetime import timedelta
from uuid import UUID

from celery import shared_task
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.commerce.models import PaymentAttempt, Refund
from apps.commerce.services import reconcile_payment_attempt, reconcile_refund
from apps.commerce.services.loyalty_funding import release_checkout_funding
from apps.rental.services import release_booking_for_expired_payment
from apps.stay.services import release_reservation_for_expired_payment

logger = logging.getLogger(__name__)


#: A payment the customer may still be paying, or may already have paid without our hearing.
_OPEN_PAYMENT_STATUSES = (
    PaymentAttempt.Status.PROVIDER_PENDING,
    PaymentAttempt.Status.CREATED,
    PaymentAttempt.Status.AUTHORIZED,
)


@shared_task
def reconcile_payments() -> int:
    """Ask the provider about every open payment, not only the ones already flagged.

    An attempt whose order was created is `IN_SYNC`, but that only says the order exists. If the
    capture webhook never arrives (a local stack Razorpay cannot reach, a dropped delivery), the
    provider is the only place the capture is recorded, so open attempts with an order are asked
    too. Open attempts live minutes (the payment window), so this stays a short list.
    """
    attempt_ids = PaymentAttempt.objects.filter(
        Q(
            reconciliation_state__in=(
                PaymentAttempt.ReconciliationState.PENDING,
                PaymentAttempt.ReconciliationState.NEEDS_ATTENTION,
            )
        )
        | ~Q(provider_order_id=""),
        status__in=_OPEN_PAYMENT_STATUSES,
    ).values_list("id", flat=True)
    count = 0
    for attempt_id in attempt_ids.iterator(chunk_size=100):
        reconcile_one_payment.delay(str(attempt_id))
        count += 1
    return count


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def reconcile_one_payment(_self: object, attempt_id: str) -> None:
    reconcile_payment_attempt(attempt_id=UUID(attempt_id))


@shared_task
def reconcile_refunds() -> int:
    refund_ids = Refund.objects.filter(
        status__in=(Refund.Status.REQUESTED, Refund.Status.PROCESSING, Refund.Status.UNDER_REVIEW)
    ).values_list("id", flat=True)
    count = 0
    for refund_id in refund_ids.iterator(chunk_size=100):
        reconcile_one_refund.delay(str(refund_id))
        count += 1
    return count


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def reconcile_one_refund(_self: object, refund_id: str) -> None:
    reconcile_refund(refund_id=UUID(refund_id))


# Give create_provider_order / outbox a chance before an already-past expires_at
# (corrupt or forced) can mark PROVIDER_PENDING attempts EXPIRED with no order_id.
_PROVIDER_ORDER_CREATE_GRACE_SECONDS = 120


@shared_task
def expire_abandoned_payment_attempts() -> int:
    """Release wallet/coin funding and domain holds when a payment attempt times out."""
    now = timezone.now()
    attempt_ids = list(
        PaymentAttempt.objects.filter(
            expires_at__lt=now,
            status__in=(
                PaymentAttempt.Status.PROVIDER_PENDING,
                PaymentAttempt.Status.CREATED,
                PaymentAttempt.Status.AUTHORIZED,
            ),
        ).values_list("id", flat=True)[:200]
    )
    expired = 0
    for attempt_id in attempt_ids:
        # Never expire a payment the customer has paid. Ask the provider first; a capture found
        # here confirms the booking and the status check below then leaves it alone. If the
        # provider cannot be reached, skip it this round rather than cancel what may be paid.
        if PaymentAttempt.objects.filter(id=attempt_id).exclude(provider_order_id="").exists():
            try:
                reconcile_payment_attempt(attempt_id=attempt_id)
            except Exception:
                # Any failure means "unknown", and unknown is not expired. Only the id is logged.
                logger.warning("Skipped expiring payment %s: provider check failed", attempt_id)
                continue
        with transaction.atomic():
            attempt = PaymentAttempt.objects.select_for_update().get(id=attempt_id)
            if attempt.status not in (
                PaymentAttempt.Status.PROVIDER_PENDING,
                PaymentAttempt.Status.CREATED,
                PaymentAttempt.Status.AUTHORIZED,
            ):
                continue
            if attempt.expires_at is None or attempt.expires_at >= timezone.now():
                continue
            # Corrupt window (expires_at <= created_at) must not kill handoff.
            if attempt.expires_at <= attempt.created_at:
                continue
            # Still waiting on Razorpay order create — do not expire during grace.
            if (
                attempt.status == PaymentAttempt.Status.PROVIDER_PENDING
                and not attempt.provider_order_id
                and attempt.created_at
                > timezone.now() - timedelta(seconds=_PROVIDER_ORDER_CREATE_GRACE_SECONDS)
            ):
                continue
            release_checkout_funding(attempt=attempt)
            attempt.status = PaymentAttempt.Status.EXPIRED
            attempt.failure_code = "payment_attempt_expired"
            attempt.version += 1
            attempt.save(update_fields=("status", "failure_code", "version", "updated_at"))
            if attempt.purpose == PaymentAttempt.Purpose.A7_RENTAL_BOOKING:
                release_booking_for_expired_payment(payment_attempt_id=attempt.id)
            elif attempt.purpose == PaymentAttempt.Purpose.A9_STAY_RESERVATION:
                release_reservation_for_expired_payment(payment_attempt_id=attempt.id)
            expired += 1
    return expired
