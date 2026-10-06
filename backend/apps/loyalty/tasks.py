"""Periodic loyalty maintenance."""

from celery import shared_task

from apps.loyalty.services.coins import expire_due_coin_grants
from apps.loyalty.services.holds import release_due_rewards


@shared_task
def expire_due_coins() -> int:
    return expire_due_coin_grants()


@shared_task
def release_due_loyalty_rewards() -> dict[str, int]:
    return release_due_rewards()
