"""Retry-safe Celery dispatch and recovery for the transactional outbox."""

import logging
from collections.abc import Callable
from datetime import timedelta
from uuid import UUID

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.foundation.recovery import (
    claim_recoverable_events,
    lease_deadline,
    retry_delay_seconds,
)

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


def _claim_for_delivery(key: UUID) -> tuple[OutboxEvent, OutboxHandler | None] | None:
    """Take the event for delivery, or return None when there is nothing to do.

    Returns `(event, None)` when the event is claimable but no handler is registered, so the
    caller can record that failure outside this transaction.
    """
    with transaction.atomic():
        event = OutboxEvent.objects.select_for_update().get(pk=key)
        if event.published_at is not None:
            return None
        if event.status == OutboxEvent.Status.PROCESSING and event.available_at > timezone.now():
            # Another worker holds a live lease. Duplicate queue entries are normal under
            # at-least-once delivery; two workers running one handler concurrently is not.
            logger.info("Outbox event %s is already in flight", key)
            return None

        event.status = OutboxEvent.Status.PROCESSING
        event.attempts += 1
        event.available_at = lease_deadline()
        event.save(update_fields=("status", "attempts", "available_at"))
        return event, _handlers.get(event.event_type)


def _record_delivery_failure(key: UUID, *, attempts: int, error: str) -> None:
    """Persist why delivery failed and when it may be retried, in its own transaction."""
    with transaction.atomic():
        OutboxEvent.objects.filter(pk=key).update(
            status=OutboxEvent.Status.FAILED,
            last_error=error[:500],
            available_at=timezone.now() + timedelta(seconds=retry_delay_seconds(attempts)),
        )


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def dispatch_outbox_event(_self: object, event_id: str) -> None:
    """Deliver at-least-once; consumers receive the stable event UUID for deduplication.

    Three phases, each in its own committed transaction:

      1. Claim  — mark PROCESSING, spend an attempt, take a lease. This commits before the
         handler runs, so another connection can see the event is in flight and the recovery
         sweep can tell "working" from "abandoned". Nothing raises inside this transaction.
      2. Handle — the handler's domain writes and the PUBLISHED mark commit together, so a
         published event's side effects can never be lost.
      3. Record — a failure is written in a fresh transaction, after the handler's transaction
         has already rolled back. Writing it inside the handler's transaction and then
         re-raising rolls the record straight back out again.
    """
    key = UUID(event_id)
    claimed = _claim_for_delivery(key)
    if claimed is None:
        return
    event, handler = claimed

    if handler is None:
        # A missing handler is a code defect, not a transient fault. The attempt is already
        # spent by the claim, so an undeployed handler exhausts the budget instead of being
        # re-queued by every sweep tick forever.
        _record_delivery_failure(key, attempts=event.attempts, error="No handler registered.")
        raise RuntimeError(f"No outbox handler registered for {event.event_type}.")

    try:
        with transaction.atomic():
            handler(event)
            OutboxEvent.objects.filter(pk=key).update(
                status=OutboxEvent.Status.PUBLISHED,
                published_at=timezone.now(),
                last_error="",
            )
    except Exception as exc:
        _record_delivery_failure(key, attempts=event.attempts, error=str(exc))
        logger.exception("Outbox delivery failed", extra={"outbox_event_id": event_id})
        raise


@shared_task
def recover_outbox_events() -> int:
    """Re-drive every event a worker crash, broker outage or transient failure left behind."""
    event_ids = claim_recoverable_events(limit=settings.OUTBOX_RECOVERY_BATCH_SIZE)
    for event_id in event_ids:
        dispatch_outbox_event.delay(str(event_id))
    if event_ids:
        logger.info("Outbox recovery re-queued %d event(s)", len(event_ids))
    return len(event_ids)
