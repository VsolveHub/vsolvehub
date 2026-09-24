"""Inbound provider truth: the verified webhook record, and the pull-based repair sweeps.

Two directions onto the same state. The webhook half records what the provider pushed —
exactly once, content-checked — and replays it through the ordinary payment and refund commands.
The reconcile half is what runs when nothing was pushed, or what was pushed was lost: it asks the
provider for the order, the payments and the refund, and drives the local record to whatever the
answer was.

Neither half writes payment state itself. Both delegate to `payments`, `capture` and `refunds` so
that a webhook and a sweep can never disagree about what capture means.
"""

from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.commerce.models import (
    FinancialException,
    PaymentAttempt,
    PaymentWebhook,
    Refund,
)
from apps.commerce.providers import (
    FakePaymentProvider,
    PaymentProviderError,
    ProviderPayment,
    ProviderRefund,
    get_payment_provider,
)
from apps.foundation.services import enqueue_outbox_event

from .base import _open_exception
from .capture import apply_provider_payment
from .payments import create_provider_order
from .refunds import _apply_refund_provider_result, submit_refund


@transaction.atomic
def record_verified_webhook(
    *,
    provider: str,
    event_id: str,
    event_type: str,
    payload_sha256: str,
    event_data: dict[str, object],
) -> tuple[PaymentWebhook, bool]:
    webhook, created = PaymentWebhook.objects.get_or_create(
        provider=provider,
        provider_event_id=event_id,
        defaults={
            "event_type": event_type,
            "signature_verified": True,
            "payload_sha256": payload_sha256,
            "event_data": event_data,
        },
    )
    if not created and webhook.payload_sha256 != payload_sha256:
        raise ValueError("The provider event identifier was reused with different content.")
    if created:
        enqueue_outbox_event(
            aggregate_type="payment_webhook",
            aggregate_id=webhook.id,
            event_type="payment.webhook_received",
            idempotency_key=f"payment-webhook:{provider}:{event_id}",
            payload={"payment_webhook_id": str(webhook.id)},
        )
    return webhook, created


def _payment_from_event(webhook: PaymentWebhook) -> ProviderPayment:
    data = webhook.event_data
    return ProviderPayment(
        provider_payment_id=str(data["provider_payment_id"]),
        provider_order_id=str(data["provider_order_id"]),
        amount_paise=int(data["amount_paise"]),
        currency=str(data["currency"]),
        status=str(data["status"]),
    )


@transaction.atomic
def process_payment_webhook(*, webhook_id: UUID) -> PaymentWebhook:
    webhook = PaymentWebhook.objects.select_for_update().get(id=webhook_id)
    if webhook.status in (PaymentWebhook.Status.PROCESSED, PaymentWebhook.Status.IGNORED):
        return webhook
    try:
        if webhook.event_type in (
            "payment.authorized",
            "payment.captured",
            "payment.failed",
        ):
            payment = _payment_from_event(webhook)
            if webhook.provider == FakePaymentProvider.code:
                FakePaymentProvider.record_payment(
                    provider_payment_id=payment.provider_payment_id,
                    provider_order_id=payment.provider_order_id,
                    amount_paise=payment.amount_paise,
                    currency=payment.currency,
                    status=payment.status,
                )
            apply_provider_payment(payment=payment, provider_code=webhook.provider)
            webhook.status = PaymentWebhook.Status.PROCESSED
        elif webhook.event_type in ("refund.processed", "refund.failed"):
            _apply_refund_provider_result(
                ProviderRefund(
                    provider_refund_id=str(webhook.event_data["provider_refund_id"]),
                    provider_payment_id=str(webhook.event_data["provider_payment_id"]),
                    amount_paise=int(webhook.event_data["amount_paise"]),
                    currency=str(webhook.event_data["currency"]),
                    status=str(webhook.event_data["status"]),
                )
            )
            webhook.status = PaymentWebhook.Status.PROCESSED
        else:
            webhook.status = PaymentWebhook.Status.IGNORED
    except (KeyError, ValueError, PaymentAttempt.DoesNotExist, Refund.DoesNotExist) as exc:
        webhook.status = PaymentWebhook.Status.FAILED
        webhook.processing_error = str(exc)[:500]
        webhook.save(update_fields=("status", "processing_error"))
        raise
    webhook.processed_at = timezone.now()
    webhook.processing_error = ""
    webhook.save(update_fields=("status", "processed_at", "processing_error"))
    return webhook


def reconcile_payment_attempt(*, attempt_id: UUID) -> PaymentAttempt:
    attempt = PaymentAttempt.objects.get(id=attempt_id)
    if not attempt.provider_order_id:
        provider = get_payment_provider(provider_code=attempt.provider)
        try:
            matching_orders = provider.find_orders_by_receipt(receipt=str(attempt.id))
        except PaymentProviderError:
            matching_orders = ()
        if len(matching_orders) > 1:
            with transaction.atomic():
                locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
                locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
                locked.failure_code = "multiple_provider_orders"
                locked.version += 1
                locked.save(
                    update_fields=(
                        "reconciliation_state",
                        "failure_code",
                        "version",
                        "updated_at",
                    )
                )
                _open_exception(
                    kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                    code="multiple_provider_orders",
                    attempt=locked,
                )
                return locked
        if matching_orders:
            provider_order = matching_orders[0]
            if (
                provider_order.amount_paise != attempt.gateway_amount_paise
                or provider_order.currency != attempt.currency
            ):
                with transaction.atomic():
                    locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
                    locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
                    locked.failure_code = "reconciled_order_amount_mismatch"
                    locked.version += 1
                    locked.save(
                        update_fields=(
                            "reconciliation_state",
                            "failure_code",
                            "version",
                            "updated_at",
                        )
                    )
                    _open_exception(
                        kind=FinancialException.Kind.AMOUNT_MISMATCH,
                        code="reconciled_order_amount_mismatch",
                        attempt=locked,
                    )
                    return locked
            with transaction.atomic():
                locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
                locked.provider_order_id = provider_order.provider_order_id
                locked.status = PaymentAttempt.Status.CREATED
                locked.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
                locked.failure_code = ""
                locked.version += 1
                locked.save(
                    update_fields=(
                        "provider_order_id",
                        "status",
                        "reconciliation_state",
                        "failure_code",
                        "version",
                        "updated_at",
                    )
                )
                attempt = locked
        else:
            return create_provider_order(attempt_id=attempt.id)
    provider = get_payment_provider(provider_code=attempt.provider)
    try:
        payments = provider.fetch_order_payments(provider_order_id=attempt.provider_order_id)
    except PaymentProviderError:
        with transaction.atomic():
            locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.version += 1
            locked.save(update_fields=("reconciliation_state", "version", "updated_at"))
            _open_exception(
                kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                code="payment_reconciliation_failed",
                attempt=locked,
            )
            return locked
    priority = {"failed": 0, "authorized": 1, "captured": 2}
    if payments:
        payment = max(payments, key=lambda item: priority.get(item.status, -1))
        apply_provider_payment(payment=payment, provider_code=attempt.provider)
    return PaymentAttempt.objects.get(id=attempt.id)


def reconcile_refund(*, refund_id: UUID) -> Refund:
    refund = Refund.objects.select_related("payment_attempt").get(id=refund_id)
    if not refund.provider_refund_id:
        return submit_refund(refund_id=refund.id)
    attempt = refund.payment_attempt
    if attempt is None:
        raise ValueError("The refund has no payment attempt.")
    provider = get_payment_provider(provider_code=attempt.provider)
    try:
        provider_refund = provider.fetch_refund(provider_refund_id=refund.provider_refund_id)
    except PaymentProviderError:
        with transaction.atomic():
            locked = Refund.objects.select_for_update().get(id=refund.id)
            locked.status = Refund.Status.UNDER_REVIEW
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.failure_code = "refund_reconciliation_failed"
            locked.save(update_fields=("status", "reconciliation_state", "failure_code"))
            _open_exception(
                kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                code="refund_reconciliation_failed",
                attempt=attempt,
                refund=locked,
            )
            return locked
    return _apply_refund_provider_result(provider_refund, refund_id=refund.id)
