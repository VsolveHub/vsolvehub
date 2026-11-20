"""Report postal codes mapped to more than one service area — read-only.

Used by Operations to audit postal code overlaps across service areas ahead of
enforcing single-area coverage invariants.
"""

from typing import Any

from django.core.management.base import BaseCommand
from django.db.models import Count

from apps.locations.models import ServiceAreaPostalCode


class Command(BaseCommand):
    help = "Report postal codes that belong to more than one service area."

    def handle(self, *args: Any, **options: Any) -> None:
        del args, options
        overlapping_codes = list(
            ServiceAreaPostalCode.objects.values("postal_code__code")
            .annotate(area_count=Count("service_area_id", distinct=True))
            .filter(area_count__gt=1)
            .order_by("postal_code__code"),
        )

        if not overlapping_codes:
            self.stdout.write(
                self.style.SUCCESS("No postal code overlaps found across service areas."),
            )
            return

        self.stdout.write(
            self.style.WARNING(
                f"Found {len(overlapping_codes)} postal code(s) belonging to multiple service "
                "areas:\n",
            ),
        )

        for item in overlapping_codes:
            code = item["postal_code__code"]
            links = (
                ServiceAreaPostalCode.objects.filter(postal_code__code=code)
                .select_related("service_area")
                .order_by("service_area__name")
            )
            area_names = [f"{link.service_area.name} ({link.service_area.slug})" for link in links]
            self.stdout.write(f"- PIN {code}: {', '.join(area_names)}")
