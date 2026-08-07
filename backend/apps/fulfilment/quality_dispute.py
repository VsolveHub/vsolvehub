"""72-hour post-finalisation quality dispute (spec §12).

The 0-24h window after completion submission is `CompletionResponse` with
`DISPUTED`. This module is the *second* window: after auto-finalisation, within
`M1_QUALITY_DISPUTE_WINDOW_HOURS`, the Customer can still open `Booking.DISPUTED`
and hold the Partner payout. It never touches `cancel_booking`.
"""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.commerce.models import Booking
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import CompletionResponse
from apps.fulfilment.services import (
    BookingCommand,
    apply_transition,
    guard_booking_version,
    locked_booking_context,
)


@transaction.atomic
def open_quality_dispute(
    *,
    booking_id: UUID,
    customer_id: UUID,
    reason: str,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    """Open a quality dispute after auto-finalisation, within the 72-hour window."""

    group, unit, booking = locked_booking_context(booking_id)
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    if booking.status == Booking.Status.DISPUTED and booking.payout_hold:
        return booking
    guard_booking_version(booking, expected_version)
    if booking.status not in (
        Booking.Status.COMPLETED,
        Booking.Status.PARTIALLY_COMPLETED,
    ):
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {booking.status} cannot open a quality dispute."
        )
    if not reason.strip():
        raise BookingCommandInvalidApiError(
            reason="A reason is required to open a quality dispute."
        )

    response = (
        CompletionResponse.objects.filter(
            completion_submission__booking=booking,
            decision=CompletionResponse.Decision.AUTO_FINALIZED,
        )
        .order_by("-responded_at")
        .first()
    )
    if response is None:
        raise BookingCommandInvalidApiError(
            reason=(
                "A quality dispute is only available after the completion was "
                "auto-finalised. Use the completion dispute path while a response "
                "is still pending."
            )
        )
    window = timedelta(hours=settings.M1_QUALITY_DISPUTE_WINDOW_HOURS)
    if timezone.now() > response.responded_at + window:
        raise BookingCommandInvalidApiError(
            reason=(
                f"The quality dispute window ({settings.M1_QUALITY_DISPUTE_WINDOW_HOURS} "
                "hours after finalisation) has closed."
            )
        )

    return apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.DISPUTED,
        command=BookingCommand.OPEN_QUALITY_DISPUTE,
        actor=booking.customer,
        reason=reason,
        idempotency_key=idempotency_key,
        context={"completion_response_id": str(response.id)},
        extra_booking_fields={"payout_hold": True},
    )
