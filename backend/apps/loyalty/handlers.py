"""Transactional-outbox consumers for loyalty and completions."""

import logging

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler
from apps.loyalty.services.completion import record_completion_for_customer
from apps.loyalty.services.notifications import notify_booking_completed
from apps.loyalty.services.referral import evaluate_referral_qualification

logger = logging.getLogger(__name__)


@register_outbox_handler(event_type="customer.fulfilment.completed")
def handle_customer_fulfilment_completed(event: OutboxEvent) -> None:
    """Orchestrator for customer fulfilment completions."""
    event_version = event.payload.get("event_version")
    if event_version != 1:
        raise ValueError(f"Unsupported event_version {event_version}; expected 1.")

    record_completion_for_customer(event)
    evaluate_referral_qualification(event)
    notify_booking_completed(event)
