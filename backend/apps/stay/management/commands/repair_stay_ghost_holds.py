"""One-shot repair for ghost UnitReservations under invalid or terminal StayReservations."""

from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.stay.services import repair_stay_ghost_holds


class Command(BaseCommand):
    help = (
        "Release UnitReservations still HELD under CANCELLED stay reservations, "
        "or under PAYMENT_PENDING/HELD reservations with missing/failed/expired payments."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Apply updates. Without this flag, only report the count that would be repaired.",
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        commit = bool(options.get("commit"))
        if not commit:
            from django.db.models import Q

            from apps.commerce.models import PaymentAttempt
            from apps.stay.models import StayReservation, UnitReservation

            qs = UnitReservation.objects.filter(
                status=UnitReservation.Status.HELD,
                stay_reservation__isnull=False,
            ).filter(
                Q(stay_reservation__status=StayReservation.Status.CANCELLED)
                | Q(
                    stay_reservation__status__in=(
                        StayReservation.Status.HELD,
                        StayReservation.Status.PAYMENT_PENDING,
                    ),
                    stay_reservation__payment_attempt__isnull=True,
                )
                | Q(
                    stay_reservation__status__in=(
                        StayReservation.Status.HELD,
                        StayReservation.Status.PAYMENT_PENDING,
                    ),
                    stay_reservation__payment_attempt__status__in=(
                        PaymentAttempt.Status.FAILED,
                        PaymentAttempt.Status.EXPIRED,
                    ),
                )
            )
            count = qs.count()
            self.stdout.write(f"Would repair {count} ghost hold(s). Re-run with --commit to apply.")
            return

        with transaction.atomic():
            repaired = repair_stay_ghost_holds()
        self.stdout.write(self.style.SUCCESS(f"Repaired {repaired} ghost hold(s)."))
