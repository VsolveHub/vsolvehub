"""Return exactly one exhausted outbox event to the recovery sweep.

Deliberately single-event. A bulk replay after an incident re-drives poison events alongside
recoverable ones, and the poison ones are precisely why someone is reading a runbook.
"""

from argparse import ArgumentParser
from typing import Any
from uuid import UUID

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.foundation.models import OutboxEvent


class Command(BaseCommand):
    help = "Reset one outbox event's attempt budget so the recovery sweep re-drives it."

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument("--event-id", required=True, help="The OutboxEvent UUID to replay.")

    def handle(self, *_args: Any, **options: Any) -> None:
        raw_id = str(options["event_id"])
        try:
            event_id = UUID(raw_id)
        except ValueError as exc:
            raise CommandError(f"{raw_id!r} is not a valid UUID.") from exc

        event = OutboxEvent.objects.filter(pk=event_id).first()
        if event is None:
            raise CommandError(f"No outbox event with id {event_id}.")
        if event.published_at is not None:
            raise CommandError(f"Outbox event {event_id} is already published; nothing to replay.")

        event.status = OutboxEvent.Status.PENDING
        event.attempts = 0
        event.last_error = ""
        event.available_at = timezone.now()
        event.save(update_fields=("status", "attempts", "last_error", "available_at"))
        self.stdout.write(f"Outbox event {event_id} reset for the next recovery sweep.")
