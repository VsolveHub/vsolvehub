"""Transactional-outbox consumers for autonomous assignment."""

from uuid import UUID

from apps.assignments.group_services import start_group_dispatch
from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler


@register_outbox_handler(event_type="booking_group.confirmed")
def handle_booking_group_confirmed(event: OutboxEvent) -> None:
    group_id = event.payload.get("booking_group_id")
    if not isinstance(group_id, str):
        raise ValueError("booking_group.confirmed requires booking_group_id.")
    if UUID(group_id) != event.aggregate_id:
        raise ValueError("Booking Group event aggregate does not match its payload.")
    start_group_dispatch(group_id=UUID(group_id))
