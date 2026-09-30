from celery import shared_task

from apps.stay.services import expire_stale_enquiries


@shared_task
def expire_stale_stay_enquiries() -> int:
    return expire_stale_enquiries()
