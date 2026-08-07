"""Release future work when a Partner is suspended or offboarded.

Eligibility filtering already stops new work. This module sweeps work already
assigned: a Partner offboarded on Monday must not keep Thursday's booking, start
OTP, or held reservation (spec §18).
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.commerce.models import Booking
from apps.fulfilment.models import BookingOtp
from apps.fulfilment.services import BookingCommand, apply_transition, locked_booking_context
from apps.partners.models import PartnerProfile

# Future, unstarted work only. ARRIVED / IN_PROGRESS settle through completion —
# auto-releasing an on-site visit would strand a half-finished job.
FUTURE_RELEASABLE_STATUSES = (
    Booking.Status.CONFIRMED,
    Booking.Status.EN_ROUTE,
)


@transaction.atomic
def release_future_work(*, partner: PartnerProfile, reason: str) -> tuple[Booking, ...]:
    """Release this Partner's future pre-start bookings into recovery."""

    now = timezone.now()
    booking_ids = list(
        Booking.objects.filter(
            partner=partner,
            status__in=FUTURE_RELEASABLE_STATUSES,
            scheduled_start__gt=now,
        )
        .order_by("scheduled_start")
        .values_list("id", flat=True)
    )
    released: list[Booking] = []
    for booking_id in booking_ids:
        group, unit, booking = locked_booking_context(booking_id)
        if booking.status not in FUTURE_RELEASABLE_STATUSES:
            continue
        if booking.scheduled_start <= timezone.now():
            continue
        booking = apply_transition(
            group=group,
            unit=unit,
            booking=booking,
            to_status=Booking.Status.RECOVERY_REQUIRED,
            command=BookingCommand.PARTNER_RELEASE,
            actor=partner.user,
            reason=reason,
            context={"trigger": "partner_suspension_or_offboard"},
        )
        reservation = Reservation.objects.select_for_update().get(id=booking.reservation_id)
        if reservation.status != Reservation.Status.RELEASED:
            reservation.release()
        BookingOtp.objects.filter(booking=booking, consumed_at__isnull=True).update(
            expires_at=timezone.now()
        )
        released.append(booking)
    return tuple(released)
