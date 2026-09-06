"""Celery background tasks for Rental Services (A7_RENTAL).

Implements:
- Sweep expired tentative asset reservations (M3-A7-04, M3-BE-322).
- Sweep vendor maintenance periods and auto-flag affected bookings to RECOVERY_REQUIRED.
"""

from datetime import date
from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.cases.models import OperationsCase
from apps.foundation.services import enqueue_outbox_event
from apps.rentals.models import AssetReservation, RentalBooking, RentalMaintenancePeriod


@shared_task
def sweep_expired_asset_reservations() -> int:
    """Releases tentative asset reservations whose TTL has elapsed without payment."""
    now = timezone.now()
    expired_reservations = AssetReservation.objects.filter(
        status=AssetReservation.Status.TENTATIVE,
        expires_at__lte=now,
    ).select_related("booking")

    count = 0
    for reservation in expired_reservations:
        with transaction.atomic():
            reservation.status = AssetReservation.Status.RELEASED
            reservation.released_at = now
            reservation.save(update_fields=("status", "released_at"))

            booking = getattr(reservation, "booking", None)
            if booking and booking.status in (
                RentalBooking.Status.HELD,
                RentalBooking.Status.DRAFT,
                RentalBooking.Status.PAYMENT_PENDING,
            ):
                booking.status = RentalBooking.Status.EXPIRED
                booking.save(update_fields=("status", "updated_at"))

                enqueue_outbox_event(
                    aggregate_type="rental_booking",
                    aggregate_id=booking.id,
                    event_type="rental_booking.expired",
                    idempotency_key=f"rental-expired:{booking.id}",
                    payload={"booking_id": str(booking.id), "reason": "Hold TTL expired"},
                )
            count += 1

    return count


@shared_task
def sweep_maintenance_asset_blocks() -> int:
    """Checks for active or upcoming vendor maintenance periods and auto-transitions
    affected confirmed/held bookings to RECOVERY_REQUIRED so Operations can reassign or refund.
    """
    today = date.today()
    active_periods = RentalMaintenancePeriod.objects.filter(end_date__gte=today).select_related(
        "asset"
    )

    flagged_count = 0
    for period in active_periods:
        affected_bookings = RentalBooking.objects.filter(
            asset=period.asset,
            status__in=(RentalBooking.Status.HELD, RentalBooking.Status.CONFIRMED),
            rental_start__lte=period.end_date,
            rental_end__gte=period.start_date,
        )

        for booking in affected_bookings:
            with transaction.atomic():
                booking.status = RentalBooking.Status.RECOVERY_REQUIRED
                booking.save(update_fields=("status", "updated_at"))

                # Open an operations recovery case if not already open
                existing_case = OperationsCase.objects.filter(
                    rental_booking=booking,
                    kind=OperationsCase.Kind.RENTAL_ASSET_RECOVERY,
                ).exists()

                if not existing_case:
                    OperationsCase.objects.create(
                        kind=OperationsCase.Kind.RENTAL_ASSET_RECOVERY,
                        owner_team=OperationsCase.Team.QUALITY_SUPPORT,
                        rental_booking=booking,
                        summary=f"Asset {period.asset.title} under maintenance for Rental #{str(booking.id)[:8]}",
                        detail=f"Vendor declared maintenance downtime ({period.start_date} to {period.end_date}): {period.reason}",
                        due_at=timezone.now() + timezone.timedelta(hours=12),
                    )

                enqueue_outbox_event(
                    aggregate_type="rental_booking",
                    aggregate_id=booking.id,
                    event_type="rental_booking.recovery_required",
                    idempotency_key=f"rental-maintenance-recovery:{booking.id}:{period.id}",
                    payload={"booking_id": str(booking.id), "maintenance_reason": period.reason},
                )
                flagged_count += 1

    return flagged_count
