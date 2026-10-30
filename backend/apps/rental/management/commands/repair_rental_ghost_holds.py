"""One-shot repair for CANCELLED/RETURNED bookings with live AssetReservations."""

import uuid
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.rental.models import AssetReservation, RentalBooking
from apps.rental.services import repair_ghost_asset_holds


class Command(BaseCommand):
    help = (
        "Release AssetReservations still CONFIRMED/TENTATIVE under CANCELLED or "
        "RETURNED rental bookings (ghost holds that block stock)."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--asset-id",
            type=str,
            default="",
            help="Optional asset UUID to scope the repair.",
        )
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Apply updates. Without this flag, only report the count that would be repaired.",
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        asset_id = (options.get("asset_id") or "").strip() or None
        commit = bool(options.get("commit"))
        if not commit:
            qs = AssetReservation.objects.filter(
                status__in=(
                    AssetReservation.Status.TENTATIVE,
                    AssetReservation.Status.CONFIRMED,
                ),
                booking__status__in=(
                    RentalBooking.Status.CANCELLED,
                    RentalBooking.Status.RETURNED,
                ),
            )
            if asset_id:
                qs = qs.filter(asset_id=uuid.UUID(asset_id))
            count = qs.count()
            self.stdout.write(f"Would repair {count} ghost hold(s). Re-run with --commit to apply.")
            return

        with transaction.atomic():
            repaired = repair_ghost_asset_holds(asset_id=asset_id)
        self.stdout.write(self.style.SUCCESS(f"Repaired {repaired} ghost hold(s)."))
