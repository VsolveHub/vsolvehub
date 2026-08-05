"""Start OTP: single-use, rate-limited, hashed challenge that gates the first paid work minute.

`WorkSession.started_at` is created atomically with the `IN_PROGRESS` transition — the one
instant `03-lifecycle-and-state-machines.md` treats as authoritative "work has begun". The
Operations-assisted path exists for the documented outage case only; it is never a universal
bypass — every use is audited with a non-empty reason and a named actor.
"""

import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.commerce.models import Booking
from apps.fulfilment.exceptions import BookingCommandInvalidApiError, OtpInvalidApiError
from apps.fulfilment.models import BookingOtp, WorkSession
from apps.fulfilment.services import (
    BookingCommand,
    apply_transition,
    guard_booking_version,
    locked_booking_context,
    materialize_original_work_tasks,
)
from apps.identity.delivery import get_otp_sender
from apps.identity.models import User


class OtpRateLimitError(RuntimeError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many Start OTP requests.")
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True)
class IssuedStartOtp:
    otp: BookingOtp
    development_code: str | None


def _ensure_not_started(booking: Booking) -> None:
    if booking.status != Booking.Status.ARRIVED:
        raise BookingCommandInvalidApiError(
            reason="Start OTP can only be requested once the Partner has arrived."
        )
    if WorkSession.objects.filter(booking=booking).exists():
        raise BookingCommandInvalidApiError(reason="Work has already started for this Booking.")


@transaction.atomic
def request_start_otp(
    *, booking_id: UUID, customer_id: UUID, expected_version: int
) -> IssuedStartOtp:
    _group, _unit, booking = locked_booking_context(booking_id)
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    guard_booking_version(booking, expected_version)
    _ensure_not_started(booking)

    cooldown_key = f"booking-otp:cooldown:{booking.id}"
    if not cache.add(cooldown_key, "1", timeout=settings.OTP_RESEND_COOLDOWN_SECONDS):
        raise OtpRateLimitError(settings.OTP_RESEND_COOLDOWN_SECONDS)

    # Single active challenge at a time: a fresh request retires any still-live predecessor.
    BookingOtp.objects.filter(booking=booking, consumed_at__isnull=True).update(
        expires_at=timezone.now()
    )
    maximum_code = 10**settings.OTP_CODE_LENGTH
    code = f"{secrets.randbelow(maximum_code):0{settings.OTP_CODE_LENGTH}d}"
    otp = BookingOtp.objects.create(
        booking=booking,
        code_hash=make_password(code),
        expires_at=timezone.now() + timedelta(seconds=settings.M1_START_OTP_TTL_SECONDS),
        max_attempts=settings.M1_START_OTP_MAX_ATTEMPTS,
    )
    # A delivery failure here (`OtpDeliveryError`) is the documented "OTP/message outage" —
    # callers surface it so Customer/Partner can fall back to `operations_assisted_start`.
    get_otp_sender().send(booking.customer.phone_number, code, "booking_start")
    development_code = code if settings.OTP_DEVELOPMENT_CODE_ENABLED else None
    return IssuedStartOtp(otp=otp, development_code=development_code)


def verify_start_otp(
    *,
    booking_id: UUID,
    partner_id: UUID,
    expected_version: int,
    code: str,
    idempotency_key: str = "",
) -> Booking:
    """A failed attempt must survive even though the overall command fails — the same
    "record inside the transaction, raise after it commits" shape `identity.verify_login_otp`
    uses, so a wrong code is never lost to an all-or-nothing rollback."""

    verification_failed = False
    booking: Booking
    with transaction.atomic():
        group, unit, booking = locked_booking_context(booking_id)
        if booking.partner_id != partner_id:
            raise PermissionError("This Booking belongs to another Partner.")
        guard_booking_version(booking, expected_version)
        _ensure_not_started(booking)

        otp = (
            BookingOtp.objects.select_for_update()
            .filter(booking=booking, consumed_at__isnull=True)
            .order_by("-created_at")
            .first()
        )
        if otp is None or otp.is_expired or otp.is_locked:
            verification_failed = True
        elif not check_password(code, otp.code_hash):
            otp.failed_attempts += 1
            otp.save(update_fields=("failed_attempts",))
            verification_failed = True
        else:
            otp.consumed_at = timezone.now()
            otp.save(update_fields=("consumed_at",))
            WorkSession.objects.create(
                booking=booking,
                started_at=timezone.now(),
                started_via=WorkSession.StartedVia.CUSTOMER_OTP,
            )
            booking = apply_transition(
                group=group,
                unit=unit,
                booking=booking,
                to_status=Booking.Status.IN_PROGRESS,
                command=BookingCommand.START_WORK,
                actor=booking.partner.user,
                idempotency_key=idempotency_key,
            )
            materialize_original_work_tasks(booking=booking, unit=unit)

    if verification_failed:
        raise OtpInvalidApiError
    return booking


@transaction.atomic
def operations_assisted_start(
    *,
    booking_id: UUID,
    operator: User,
    outage_reason: str,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    """Step-up verification is enforced by the caller (view-layer permission); this command
    still refuses a blank reason so a missing audit trail can never happen even if a caller
    forgets the check."""

    group, unit, booking = locked_booking_context(booking_id)
    guard_booking_version(booking, expected_version)
    _ensure_not_started(booking)
    if not outage_reason.strip():
        raise BookingCommandInvalidApiError(
            reason="An outage reason is required for an Operations-assisted start."
        )

    WorkSession.objects.create(
        booking=booking,
        started_at=timezone.now(),
        started_via=WorkSession.StartedVia.OPERATIONS_ASSISTED,
        assisted_by=operator,
        assisted_reason=outage_reason,
    )
    context: dict[str, Any] = {"assisted": True, "outage_reason": outage_reason}
    booking = apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.IN_PROGRESS,
        command=BookingCommand.START_WORK,
        actor=operator,
        reason=outage_reason,
        idempotency_key=idempotency_key,
        context=context,
    )
    materialize_original_work_tasks(booking=booking, unit=unit)
    return booking
