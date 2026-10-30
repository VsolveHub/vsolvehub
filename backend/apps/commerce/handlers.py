"""Transactional-outbox consumers for browser-independent financial commands."""

from uuid import UUID

from apps.commerce.services import (
    capture_authorized_payment,
    create_provider_order,
    process_payment_webhook,
    submit_refund,
)
from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler


def _event_uuid(event: OutboxEvent, key: str) -> UUID:
    value = event.payload.get(key)
    if not isinstance(value, str):
        raise ValueError(f"{event.event_type} requires {key}.")
    value_uuid = UUID(value)
    if value_uuid != event.aggregate_id:
        raise ValueError(f"{event.event_type} aggregate does not match its payload.")
    return value_uuid


@register_outbox_handler(event_type="payment_attempt.order_requested")
def handle_payment_order_requested(event: OutboxEvent) -> None:
    create_provider_order(attempt_id=_event_uuid(event, "payment_attempt_id"))


@register_outbox_handler(event_type="payment.webhook_received")
def handle_payment_webhook_received(event: OutboxEvent) -> None:
    process_payment_webhook(webhook_id=_event_uuid(event, "payment_webhook_id"))


@register_outbox_handler(event_type="payment_attempt.capture_requested")
def handle_payment_capture_requested(event: OutboxEvent) -> None:
    capture_authorized_payment(attempt_id=_event_uuid(event, "payment_attempt_id"))


@register_outbox_handler(event_type="refund.submission_requested")
def handle_refund_submission_requested(event: OutboxEvent) -> None:
    submit_refund(refund_id=_event_uuid(event, "refund_id"))
