"""Customer fulfilment completion notification service."""

from uuid import UUID

from apps.foundation.models import OutboxEvent
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification


def notify_booking_completed(event: OutboxEvent) -> NotificationIntent | None:
    """Dispatch booking.completed notification for completed fulfilment."""
    customer_id = event.payload.get("customer_id")
    booking_id = event.payload.get("booking_id")

    source_type = event.payload.get("source_type", "BOOKING")
    if source_type != "BOOKING" and not booking_id:
        # Ignore notifications for rentals and stays for now
        return None

    if not customer_id or not booking_id:
        raise ValueError("Payload missing customer_id or booking_id.")

    return request_notification(
        recipient_id=UUID(str(customer_id)),
        purpose="booking.completed",
        channel=NotificationIntent.Channel.IN_APP,
        template_code="booking_completed",
        context={"booking_id": str(booking_id)},
        idempotency_key=f"notify-booking-completed:{booking_id}",
    )
