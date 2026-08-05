"""Read-only outbox health summary for the queue-outage and stuck-command runbooks."""

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.foundation.recovery import RECOVERABLE_STATUSES, dead_letter_events

DEAD_LETTER_DISPLAY_LIMIT = 50
ERROR_DISPLAY_LENGTH = 120


class Command(BaseCommand):
    help = "Summarise outbox event health and list events the sweep has given up on."

    def handle(self, *_args: Any, **_options: Any) -> None:
        counts = OutboxEvent.objects.values("status").annotate(total=Count("id")).order_by("status")
        self.stdout.write("Outbox event counts by status:")
        for row in counts:
            self.stdout.write(f"  {row['status']}: {row['total']}")

        # Mirror claim_recoverable_events exactly, including the attempt cap. Counting dead
        # letters here would promise a recovery the sweep is never going to perform.
        due = OutboxEvent.objects.filter(
            status__in=RECOVERABLE_STATUSES,
            published_at__isnull=True,
            available_at__lte=timezone.now(),
            attempts__lt=settings.OUTBOX_MAX_ATTEMPTS,
        ).count()
        self.stdout.write(f"Events due for recovery now: {due}")

        dead = list(dead_letter_events()[:DEAD_LETTER_DISPLAY_LIMIT])
        self.stdout.write(f"Dead-letter events (attempts exhausted): {len(dead)}")
        for event in dead:
            self.stdout.write(
                f"  {event.id} {event.event_type} attempts={event.attempts} "
                f"last_error={event.last_error[:ERROR_DISPLAY_LENGTH]!r}"
            )
