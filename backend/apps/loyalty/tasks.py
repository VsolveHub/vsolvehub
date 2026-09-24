"""Periodic loyalty maintenance."""

from celery import shared_task

from apps.loyalty.services.coins import expire_due_coin_grants


@shared_task
def expire_due_coins() -> int:
    return expire_due_coin_grants()
