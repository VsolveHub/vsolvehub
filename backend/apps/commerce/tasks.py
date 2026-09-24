"""Periodic reconciliation for provider ambiguity and in-flight refunds."""

from uuid import UUID

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.commerce.models import PaymentAttempt, Refund
from apps.commerce.services import reconcile_payment_attempt, reconcile_refund
from apps.commerce.services.loyalty_funding import release_checkout_funding


@shared_task
def reconcile_payments() -> int:
    attempt_ids = PaymentAttempt.objects.filter(
        reconciliation_state__in=(
            PaymentAttempt.ReconciliationState.PENDING,
            PaymentAttempt.ReconciliationState.NEEDS_ATTENTION,
        ),
        status__in=(
            PaymentAttempt.Status.PROVIDER_PENDING,
            PaymentAttempt.Status.CREATED,
            PaymentAttempt.Status.AUTHORIZED,
        ),
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


@shared_task
def expire_abandoned_payment_attempts() -> int:
    """Release wallet and coin reservations when a payment attempt times out."""
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
            release_checkout_funding(attempt=attempt)
            attempt.status = PaymentAttempt.Status.EXPIRED
            attempt.failure_code = "payment_attempt_expired"
            attempt.version += 1
            attempt.save(update_fields=("status", "failure_code", "version", "updated_at"))
            expired += 1
    return expired
