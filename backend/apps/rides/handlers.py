"""Outbox consumers for Rides (ADR-0002). Each one is safe to run more than once."""

from uuid import UUID

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler
from apps.rides.engine import RIDE_REQUESTED, run_dispatch_round


@register_outbox_handler(event_type=RIDE_REQUESTED)
def handle_ride_requested(event: OutboxEvent) -> None:
    ride_id = event.payload.get("ride_id")
    if not isinstance(ride_id, str):
        raise ValueError(f"{RIDE_REQUESTED} requires ride_id.")
    if UUID(ride_id) != event.aggregate_id:
        raise ValueError(f"{RIDE_REQUESTED} aggregate does not match its payload.")
    run_dispatch_round(ride_id=UUID(ride_id), round_no=1)
