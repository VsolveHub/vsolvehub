"""Seed Safety Stories for customer home feed and operations testing.

Run with:
    python manage.py seed_safety_stories --dev-only
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from scripts.seed_safety_stories import seed_stories


class Command(BaseCommand):
    help = "Seed 14 active Safety Stories for all service categories."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--dev-only",
            action="store_true",
            help="Confirm that you understand this seeds sample safety stories.",
        )

    def handle(self, *_args: object, **options: Any) -> None:
        if not settings.DEBUG and not options["dev_only"]:
            raise CommandError("Pass --dev-only to seed demo safety stories.")

        seed_stories()
        self.stdout.write(self.style.SUCCESS("Successfully seeded safety stories across all service categories."))
