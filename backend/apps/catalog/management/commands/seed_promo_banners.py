"""Seed one demo promotional banner for the Electrician category.

The wording is a placeholder for an Operations decision, not an offer: `PromoBanner` is
display-only and nothing in pricing or checkout reads it. So, like `seed_m2_demo`, this
refuses to run unless `DEBUG` is on *and* the operator says they know it is dev-only.

    python manage.py seed_promo_banners --i-understand-this-is-dev-only

Idempotent: keyed on the category and title, so a rerun updates the one row.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.catalog.models import Category, PromoBanner

DEMO_CATEGORY = "electrician"
DEMO_TITLE = "Save 10% on electrical work"


class Command(BaseCommand):
    help = "Seed a demo promotional banner (display-only, dev only)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--i-understand-this-is-dev-only",
            action="store_true",
            dest="dev_only",
            help="Required. The banner copy is a placeholder, not an Operations decision.",
        )

    def handle(self, *_args: object, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_promo_banners only runs with DEBUG on.")
        if not options["dev_only"]:
            raise CommandError("Pass --i-understand-this-is-dev-only to seed demo banners.")

        category = Category.objects.filter(slug=DEMO_CATEGORY).first()
        if category is None:
            raise CommandError(f"Category '{DEMO_CATEGORY}' not found. Seed the catalog first.")

        banner, created = PromoBanner.objects.update_or_create(
            category=category,
            title=DEMO_TITLE,
            defaults={
                "subtitle": "Book more than one electrician service in the same visit",
                "terms": "Valid on bookings above ₹300",
                "image_url": "",
                "is_active": True,
                "display_order": 0,
            },
        )
        verb = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(f"{verb} demo banner '{banner.title}' for {category.name}.")
        )
        self.stdout.write(
            "DEV SEED — placeholder copy. Banners are display-only; checkout applies no discount."
        )
