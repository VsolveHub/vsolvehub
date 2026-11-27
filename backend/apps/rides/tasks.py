from uuid import UUID

from celery import shared_task

from apps.rides.engine import redrive_dispatch as redrive_searching_rides
from apps.rides.engine import run_dispatch_round
from apps.rides.services import expire_passes, sweep_stale_captains


@shared_task
def expire_captain_passes() -> int:
    """End lapsed Daily Passes and take those captains off duty (unless they are on a ride)."""
    return expire_passes()


@shared_task
def sweep_captain_locations() -> int:
    """End duty after 2 minutes without a ping, and drop expired positions from the live map."""
    return sweep_stale_captains()


@shared_task
def dispatch_round(ride_id: str, round_no: int) -> None:
    """The next dispatch round, scheduled for when the current round's offers expire."""
    run_dispatch_round(ride_id=UUID(ride_id), round_no=round_no)


@shared_task
def redrive_dispatch() -> int:
    """Every 30 s: move on searching rides whose round ended without a next one running."""
    return redrive_searching_rides()
