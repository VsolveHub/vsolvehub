"""Celery entry points. The decisions live in services.py."""

import logging
from uuid import UUID

from celery import shared_task

from apps.mobile import services

logger = logging.getLogger(__name__)


@shared_task(name="apps.mobile.tasks.deliver_push_intent")
def deliver_push_intent(intent_id: str) -> None:
    try:
        services.deliver_push_intent(intent_id=UUID(intent_id))
    except Exception:
        logger.exception("Push delivery task failed for %s", intent_id)


@shared_task(name="apps.mobile.tasks.mirror_in_app_notice")
def mirror_in_app_notice(intent_id: str) -> None:
    try:
        services.mirror_in_app_notice(intent_id=UUID(intent_id))
    except Exception:
        logger.exception("In-app push mirror failed for %s", intent_id)


@shared_task(name="apps.mobile.tasks.sweep_pending_push_intents")
def sweep_pending_push_intents() -> int:
    return services.sweep_pending_push_intents()


@shared_task(name="apps.mobile.tasks.check_push_receipts")
def check_push_receipts() -> int:
    return services.check_receipts()
