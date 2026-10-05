from celery import shared_task

from apps.listings.services import expire_listings, expire_subscriptions


@shared_task
def expire_published_listings() -> int:
    return expire_listings()


@shared_task
def expire_vendor_subscriptions() -> int:
    return expire_subscriptions()


@shared_task
def send_job_candidate_digests() -> int:
    """Once a day: tell employers how many new job seekers match their live jobs."""
    from apps.listings.seekers import send_candidate_digests  # noqa: PLC0415

    return send_candidate_digests()
