"""Resolve postal codes mapped to more than one service area (FLOW.md Q2: one PIN, one area).

Dry run by default: it prints what it would keep and what it would drop. Pass ``--apply`` to
remove the extra links. For each PIN it keeps the area with the most active approved partners,
then the area that is accepting partners, then the first by name, so the area customers and
partners already rely on stays.

Run ``report_postal_code_overlaps`` first. Once this reports nothing left to resolve in every
environment, a database unique rule on the PIN can be added safely.
"""

from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Q

from apps.locations.models import ServiceArea, ServiceAreaPostalCode


def plan_overlap_resolution() -> list[dict[str, Any]]:
    """Per overlapping PIN: the area to keep and the links to drop."""
    pins = list(
        ServiceAreaPostalCode.objects.values("postal_code_id")
        .annotate(area_count=Count("service_area_id", distinct=True))
        .filter(area_count__gt=1)
        .values_list("postal_code_id", flat=True)
    )
    plan: list[dict[str, Any]] = []
    for postal_code_id in pins:
        links = list(
            ServiceAreaPostalCode.objects.filter(postal_code_id=postal_code_id)
            .select_related("service_area", "postal_code")
            .annotate(
                approved=Count(
                    "service_area__partner_links",
                    filter=Q(
                        service_area__partner_links__is_active=True,
                        service_area__partner_links__partner__application__status="APPROVED",
                    ),
                    distinct=True,
                )
            )
        )
        links.sort(
            key=lambda link: (
                -int(getattr(link, "approved", 0)),
                not link.service_area.is_accepting_partners,
                link.service_area.name,
            )
        )
        keep, drop = links[0], links[1:]
        plan.append(
            {
                "pin": keep.postal_code.code,
                "keep": keep.service_area,
                "drop": list(drop),
            }
        )
    return sorted(plan, key=lambda item: item["pin"])


def _label(area: ServiceArea) -> str:
    return f"{area.name} ({area.slug})"


class Command(BaseCommand):
    help = "Keep each postal code in one service area (dry run unless --apply is given)."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Remove the extra links. Without it nothing is changed.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        del args
        plan = plan_overlap_resolution()
        if not plan:
            self.stdout.write(self.style.SUCCESS("No postal code overlaps to resolve."))
            return

        for item in plan:
            dropped = ", ".join(_label(link.service_area) for link in item["drop"])
            self.stdout.write(f"- PIN {item['pin']}: keep {_label(item['keep'])}; drop {dropped}")

        if not options["apply"]:
            self.stdout.write(
                self.style.WARNING(f"\n{len(plan)} PIN(s) would change. Re-run with --apply.")
            )
            return

        with transaction.atomic():
            removed = 0
            for item in plan:
                for link in item["drop"]:
                    link.delete()
                    removed += 1
        self.stdout.write(
            self.style.SUCCESS(f"Resolved {len(plan)} PIN(s); removed {removed} extra link(s).")
        )
