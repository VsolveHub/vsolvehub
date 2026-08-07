"""Repair earnings for visits that settled while nothing was writing them.

`settle_booking_earning` was wired only to the demo seed, so every Booking that reached a
terminal settlement through the app between that gap opening and its fix has no `EARNING` ledger
line: the work was delivered, the Partner was never credited, and their earnings screen showed a
balance that stopped moving.

Fixing the write path does not repair the rows already missed. This does, and only that — it
writes exactly what settlement would have written at the time, through the same domain service,
so there is one implementation of what a visit earns and no second opinion about it.

Dry run by default. This creates financial records, so making somebody type `--commit` is the
point: an accidental shell-history re-run should print a report, not move money.
"""

from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.commerce.models import Booking
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import settle_booking_earning

#: The statuses settlement writes an earning for. `DISPUTED` is included deliberately — the
#: Partner did the work and reported it, and `settle_booking_earning` files it `PENDING` behind
#: the payout hold rather than paying it. Excluding it here would decide the dispute by omission.
SETTLED_STATUSES = (
    Booking.Status.COMPLETED,
    Booking.Status.PARTIALLY_COMPLETED,
    Booking.Status.DISPUTED,
)


class Command(BaseCommand):
    help = "Write the missing EARNING ledger entries for already-settled Bookings."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Actually write the entries. Without it, this only reports what it would do.",
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        commit = bool(options["commit"])
        earned_booking_ids = set(
            PartnerLedgerEntry.objects.filter(
                kind=PartnerLedgerEntry.Kind.EARNING
            ).values_list("booking_id", flat=True)
        )
        candidates = (
            Booking.objects.filter(status__in=SETTLED_STATUSES)
            .exclude(id__in=earned_booking_ids)
            .select_related("partner")
            .order_by("created_at")
        )

        written = 0
        skipped = 0
        for booking in candidates:
            if not commit:
                self.stdout.write(
                    f"would settle {booking.id} ({booking.status}) "
                    f"partner={booking.partner.display_name}"
                )
                written += 1
                continue
            with transaction.atomic():
                entry = settle_booking_earning(booking_id=booking.id)
            if entry is None:
                # A visit that delivered nothing, or one with no fulfilment unit. Reported
                # rather than silently passed over — "nothing to pay" is an answer somebody
                # reading this output needs to be able to see.
                skipped += 1
                self.stdout.write(f"nothing payable for {booking.id} ({booking.status})")
                continue
            written += 1
            self.stdout.write(
                f"settled {booking.id} ({booking.status}) "
                f"partner={booking.partner.display_name} net={entry.net_paise}"
            )

        verb = "would write" if not commit else "wrote"
        self.stdout.write(
            self.style.SUCCESS(f"{verb} {written} earning entries; {skipped} had nothing payable")
        )
        if not commit:
            self.stdout.write("Dry run. Re-run with --commit to write them.")
