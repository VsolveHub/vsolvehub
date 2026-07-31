"""Retry-safe Celery dispatch for the transactional outbox."""

import logging
from collections.abc import Callable
from uuid import UUID

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.foundation.models import OutboxEvent

logger = logging.getLogger(__name__)
OutboxHandler = Callable[[OutboxEvent], None]
_handlers: dict[str, OutboxHandler] = {}


def register_outbox_handler(*, event_type: str) -> Callable[[OutboxHandler], OutboxHandler]:
    """Register an idempotent event consumer during application startup."""

    def decorator(handler: OutboxHandler) -> OutboxHandler:
        if event_type in _handlers:
            raise RuntimeError(f"Outbox handler already registered for {event_type}.")
        _handlers[event_type] = handler
        return handler

    return decorator


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def dispatch_outbox_event(_self: object, event_id: str) -> None:
    """Deliver at-least-once; consumers receive the stable event UUID for deduplication."""
    with transaction.atomic():
        event = OutboxEvent.objects.select_for_update().get(pk=UUID(event_id))
        if event.published_at is not None:
            return
        handler = _handlers.get(event.event_type)
        if handler is None:
            event.status = OutboxEvent.Status.FAILED
            event.last_error = "No handler registered."
            event.save(update_fields=("status", "last_error"))
            raise RuntimeError(f"No outbox handler registered for {event.event_type}.")
        event.status = OutboxEvent.Status.PROCESSING
        event.attempts += 1
        event.save(update_fields=("status", "attempts"))
        try:
            handler(event)
        except Exception as exc:
            event.status = OutboxEvent.Status.FAILED
            event.last_error = str(exc)[:500]
            event.save(update_fields=("status", "last_error"))
            logger.exception("Outbox delivery failed", extra={"outbox_event_id": event_id})
            raise
        event.status = OutboxEvent.Status.PUBLISHED
        event.published_at = timezone.now()
        event.last_error = ""
        event.save(update_fields=("status", "published_at", "last_error"))
