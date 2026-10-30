"""Start OTP: single-use, rate-limited, hashed challenge that gates the first paid work minute.

`WorkSession.started_at` is created atomically with the `IN_PROGRESS` transition — the one
instant `03-lifecycle-and-state-machines.md` treats as authoritative "work has begun". The
Operations-assisted path exists for the documented outage case only; it is never a universal
bypass — every use is audited with a non-empty reason and a named actor.
"""

import logging
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

logger = logging.getLogger(__name__)


class OtpRateLimitError(RuntimeError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many Start OTP requests.")
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True)
class IssuedStartOtp:
    """The live challenge and its plaintext, for the one Customer allowed to read it out.

    `code` is returned to the signed-in Customer who owns the Booking and to nobody else: the
    Customer reads it out to the Partner standing in front of them, which is what proves the
    Partner is there. Job start never depends on an SMS arriving. `development_code` keeps its
    original meaning — the same digits, published only where `OTP_DEVELOPMENT_CODE_ENABLED`.
    """

    otp: BookingOtp
    code: str

    @property
    def development_code(self) -> str | None:
        return self.code if settings.OTP_DEVELOPMENT_CODE_ENABLED else None


def _active_code_key(booking_id: UUID) -> str:
    return f"booking-otp:active-code:{booking_id}"


def live_start_code(*, booking_id: UUID, customer_id: UUID) -> IssuedStartOtp | None:
    """The still-usable code from the Customer's last request, if its plaintext is still held.

    For the resend cooldown: `request_start_otp` refuses a second challenge inside it, and a
    Customer who refreshed the page would otherwise get a 429 and nothing to read out. This hands
    back the code they were already given. Same ownership rule as the request — the Booking's own
    Customer or nobody. The plaintext lives only in the cache, for the challenge's own lifetime,
    and is dropped the moment work starts.
    """

    booking = Booking.objects.get(id=booking_id)
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    if booking.status != Booking.Status.ARRIVED:
        return None
    code = cache.get(_active_code_key(booking.id))
    otp = (
        BookingOtp.objects.filter(booking=booking, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if not isinstance(code, str) or otp is None or otp.is_expired or otp.is_locked:
        return None
    return IssuedStartOtp(otp=otp, code=code)


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
    cache.set(_active_code_key(booking.id), code, timeout=settings.M1_START_OTP_TTL_SECONDS)
    # The SMS is a courtesy copy. The code is returned to the signed-in Customer on screen, so an
    # unconfigured or failing SMS provider must never stop a job from starting. Never log the code.
    try:
        get_otp_sender().send(booking.customer.phone_number, code, "booking_start")
    except Exception:
        logger.warning("Start code SMS was not delivered for booking %s.", booking.id)
    return IssuedStartOtp(otp=otp, code=code)


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
            cache.delete(_active_code_key(booking.id))
            cache.delete(f"booking-otp:cooldown:{booking.id}")
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

    cache.delete(_active_code_key(booking.id))
    cache.delete(f"booking-otp:cooldown:{booking.id}")
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
