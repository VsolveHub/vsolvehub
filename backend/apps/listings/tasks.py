from celery import shared_task

from apps.listings.services import expire_listings, expire_subscriptions


@shared_task
def expire_published_listings() -> int:
    return expire_listings()


@shared_task
def expire_vendor_subscriptions() -> int:
    return expire_subscriptions()

