from celery import shared_task

from apps.rides.services import expire_passes


@shared_task
def expire_captain_passes() -> int:
    """End lapsed Daily Passes and take those captains off duty (unless they are on a ride)."""
    return expire_passes()
