"""Re-drive outbox events that a worker crash or a broker outage left behind.

This module must not import `apps.foundation.tasks`. The dependency runs one way — tasks
import recovery — so the Celery task definitions can use these helpers without a cycle.
"""

from datetime import datetime, timedelta
from uuid import UUID

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from apps.foundation.models import OutboxEvent

RECOVERABLE_STATUSES: tuple[str, ...] = (
    OutboxEvent.Status.PENDING,
    OutboxEvent.Status.PROCESSING,
    OutboxEvent.Status.FAILED,
)


def retry_delay_seconds(attempts: int) -> int:
    """Exponential backoff for the next attempt, bounded by the configured ceiling."""
    exponent = max(attempts - 1, 0)
    delay = settings.OUTBOX_RETRY_BACKOFF_SECONDS * (2**exponent)
    return int(min(delay, settings.OUTBOX_RETRY_BACKOFF_MAX_SECONDS))


def lease_deadline() -> datetime:
    """The moment an in-flight event becomes eligible for recovery again."""
    return timezone.now() + timedelta(seconds=settings.OUTBOX_LEASE_SECONDS)


def claim_recoverable_events(*, limit: int) -> list[UUID]:
    """Take a batch of due events and push their visibility deadline forward.

    Moving `available_at` inside the same transaction that selects the row is what stops two
    beat ticks, or two workers, from re-queuing one event twice. `skip_locked` makes a
    concurrent sweep step over rows this one already holds rather than block behind them.
    """
    now = timezone.now()
    deadline = now + timedelta(seconds=settings.OUTBOX_LEASE_SECONDS)
    claimed: list[UUID] = []
    with transaction.atomic():
        events = list(
            OutboxEvent.objects.select_for_update(skip_locked=True)
            .filter(
                status__in=RECOVERABLE_STATUSES,
                published_at__isnull=True,
                available_at__lte=now,
                attempts__lt=settings.OUTBOX_MAX_ATTEMPTS,
            )
            .order_by("available_at")[:limit]
        )
        for event in events:
            # Reset to PENDING, not just re-lease. `_claim_for_delivery` refuses an event that
            # is PROCESSING under a live lease, so leaving the status alone would make the very
            # worker this sweep is about to wake decline the work.
            event.status = OutboxEvent.Status.PENDING
            event.available_at = deadline
            event.save(update_fields=("status", "available_at"))
            claimed.append(event.id)
    return claimed


def dead_letter_events() -> models.QuerySet[OutboxEvent]:
    """Events the sweep has given up on. Operations replays these deliberately, never in bulk."""
    return OutboxEvent.objects.filter(
        status__in=RECOVERABLE_STATUSES,
        published_at__isnull=True,
        attempts__gte=settings.OUTBOX_MAX_ATTEMPTS,
    ).order_by("created_at")
