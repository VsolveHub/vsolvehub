from celery import shared_task

from apps.rides.services import expire_passes, sweep_stale_captains


@shared_task
def expire_captain_passes() -> int:
    """End lapsed Daily Passes and take those captains off duty (unless they are on a ride)."""
    return expire_passes()


@shared_task
def sweep_captain_locations() -> int:
    """End duty after 2 minutes without a ping, and drop expired positions from the live map."""
    return sweep_stale_captains()
