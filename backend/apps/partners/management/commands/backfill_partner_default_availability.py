"""Backfill default weekly availability for approved partners with zero active rules.

This command is safe, idempotent, and non-destructive:
- It only targets PartnerProfile instances whose application is APPROVED.
- For each active service area linked to the partner, it checks whether any active
  PartnerAvailabilityRule exists.
- If active rules already exist for an area, it skips that area (never modifies custom
  availability).
- If zero active rules exist, it seeds default Monday-Sunday 09:00-19:00 availability rules
  using get_or_create to guarantee idempotency.
- Supports --dry-run for operator verification before applying changes.
"""

from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.partners.models import PartnerApplication, PartnerProfile
from apps.partners.services.review import _seed_default_availability_if_missing


class Command(BaseCommand):
    help = (
        "Idempotently backfill default Mon-Sun 09:00-19:00 availability rules for "
        "APPROVED partners that have zero active rules in their active service areas."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Simulate the backfill and report actions without writing to the database.",
        )
        parser.add_argument(
            "--partner-phone",
            type=str,
            help=(
                "Optionally target a single partner by phone number instead of all approved "
                "partners."
            ),
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        dry_run: bool = options["dry_run"]
        partner_phone: str | None = options.get("partner_phone")

        queryset = PartnerProfile.objects.filter(
            application__status=PartnerApplication.Status.APPROVED
        ).select_related("user", "application")

        if partner_phone:
            queryset = queryset.filter(user__phone_number=partner_phone)

        approved_partners = list(queryset.order_by("created_at"))
        self.stdout.write(
            f"Found {len(approved_partners)} approved partner(s) to inspect (dry_run={dry_run})."
        )

        total_seeded_rules = 0
        partners_backfilled = 0

        for partner in approved_partners:
            active_links = list(
                partner.service_area_links.filter(is_active=True).select_related("service_area")
            )
            if not active_links:
                self.stdout.write(
                    self.style.WARNING(
                        f"Partner {partner.user.phone_number} (ID: {partner.id}) has NO active "
                        "service areas. Skipping."
                    )
                )
                continue

            areas_needing_backfill = []
            for link in active_links:
                area = link.service_area
                has_rules = partner.availability_rules.filter(
                    service_area=area,
                    is_active=True,
                ).exists()
                if not has_rules:
                    areas_needing_backfill.append(area)

            if not areas_needing_backfill:
                continue

            partners_backfilled += 1
            area_names = ", ".join(a.name for a in areas_needing_backfill)
            self.stdout.write(
                f"Partner {partner.user.phone_number} (ID: {partner.id}) needs availability "
                f"for {len(areas_needing_backfill)} area(s): [{area_names}]"
            )

            if dry_run:
                total_seeded_rules += len(areas_needing_backfill) * 7
                self.stdout.write(
                    self.style.NOTICE(
                        f"  [DRY-RUN] Would create {len(areas_needing_backfill) * 7} rules "
                        "(Mon-Sun 09:00-19:00)"
                    )
                )
            else:
                with transaction.atomic():
                    seeded = _seed_default_availability_if_missing(partner=partner)
                    total_seeded_rules += len(seeded)
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  Successfully created {len(seeded)} rule(s) for Partner "
                            f"{partner.user.phone_number}."
                        )
                    )

        summary_msg = (
            f"\nFinished: backfilled {partners_backfilled} partner(s) with "
            f"{total_seeded_rules} rules total. (dry_run={dry_run})"
        )
        if dry_run:
            self.stdout.write(self.style.WARNING(summary_msg))
        else:
            self.stdout.write(self.style.SUCCESS(summary_msg))
