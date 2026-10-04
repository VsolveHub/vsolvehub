from celery import shared_task

from apps.stay.services import expire_stale_enquiries
from apps.stay.visits import expire_stale_visits


@shared_task
def expire_stale_stay_enquiries() -> int:
    return expire_stale_enquiries()


@shared_task
def expire_stale_stay_visits() -> int:
    """Visit requests the host never answered, once their time is over."""
    return expire_stale_visits()
