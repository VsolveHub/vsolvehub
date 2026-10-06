"""Write missing EARNING ledger entries for already-returned RentalBookings.

Dry run by default. Re-run with --commit to write the entries.
"""

from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import settle_rental_earning
from apps.rental.models import RentalBooking

SETTLED_RENTAL_STATUSES = (
    RentalBooking.Status.RETURNED,
    RentalBooking.Status.DISPUTED,
)


class Command(BaseCommand):
    help = "Write the missing EARNING ledger entries for already-returned RentalBookings."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Actually write the entries. Without it, this only reports what it would do.",
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        commit = bool(options["commit"])
        earned_rental_booking_ids = set(
            PartnerLedgerEntry.objects.filter(
                kind=PartnerLedgerEntry.Kind.EARNING,
                rental_booking__isnull=False,
            ).values_list("rental_booking_id", flat=True)
        )
        candidates = (
            RentalBooking.objects.filter(status__in=SETTLED_RENTAL_STATUSES)
            .exclude(id__in=earned_rental_booking_ids)
            .select_related("asset__partner")
            .order_by("created_at")
        )

        written = 0
        skipped = 0
        for booking in candidates:
            partner_name = (
                booking.asset.partner.display_name
                if booking.asset and booking.asset.partner
                else str(booking.id)
            )
            if not commit:
                self.stdout.write(
                    f"would settle rental {booking.id} ({booking.status}) partner={partner_name}"
                )
                written += 1
                continue
            with transaction.atomic():
                entry = settle_rental_earning(rental_booking_id=booking.id)
            if entry is None:
                skipped += 1
                self.stdout.write(f"nothing payable for rental {booking.id} ({booking.status})")
                continue
            written += 1
            self.stdout.write(
                f"settled rental {booking.id} ({booking.status}) "
                f"partner={partner_name} net={entry.net_paise}"
            )

        verb = "would write" if not commit else "wrote"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {written} rental earning entries; {skipped} had nothing payable"
            )
        )
        if not commit:
            self.stdout.write("Dry run. Re-run with --commit to write them.")
