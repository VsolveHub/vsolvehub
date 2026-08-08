"""Transactional-outbox consumers for post-payment Partner recovery.

The search for a replacement runs here rather than inside the release command for the reason
the outbox exists: a Partner stepping back must be recorded even if every candidate query
fails, and an event a worker retries is what keeps those two facts separate.
"""

from uuid import UUID

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler
from apps.fulfilment.replacement import attempt_booking_replacement


@register_outbox_handler(event_type="booking.replacement_requested")
def handle_booking_replacement_requested(event: OutboxEvent) -> None:
    booking_id = event.payload.get("booking_id")
    if not isinstance(booking_id, str):
        raise ValueError("booking.replacement_requested requires booking_id.")
    if UUID(booking_id) != event.aggregate_id:
        raise ValueError("Booking replacement event aggregate does not match its payload.")
    attempt_booking_replacement(booking_id=UUID(booking_id))
