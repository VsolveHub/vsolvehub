"""Transactional identity commands."""

import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import login, logout
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone

from apps.identity.delivery import OtpDeliveryError, get_otp_sender, mark_delivery_failed
from apps.identity.hashing import keyed_hash
from apps.identity.models import (
    CustomerProfile,
    Device,
    OtpChallenge,
    Role,
    User,
    UserRole,
    UserSession,
)
from apps.identity.phone import normalize_phone_number


class OtpRateLimitError(RuntimeError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many OTP requests.")
        self.retry_after_seconds = retry_after_seconds


class OtpVerificationError(RuntimeError):
    """Generic error that does not reveal which OTP condition failed."""


@dataclass(frozen=True)
class IssuedOtp:
    challenge: OtpChallenge
    development_code: str | None


def _increment_rate_counter(key: str, limit: int) -> None:
    window_seconds = settings.OTP_RATE_WINDOW_SECONDS
    try:
        count = 1 if cache.add(key, 1, timeout=window_seconds) else cache.incr(key)
    except Exception as exc:
        raise OtpDeliveryError("OTP rate limiter is unavailable.") from exc

    if count > limit:
        raise OtpRateLimitError(window_seconds)


def issue_login_otp(
    *,
    phone_number: str,
    request_ip: str,
    device_identifier: str = "",
) -> IssuedOtp:
    canonical_phone = normalize_phone_number(phone_number)
    phone_hash = keyed_hash(canonical_phone)
    ip_hash = keyed_hash(request_ip)
    device_hash = keyed_hash(device_identifier) if device_identifier else ""

    cooldown_key = f"otp:cooldown:{phone_hash}"
    try:
        cooldown_acquired = cache.add(
            cooldown_key,
            "1",
            timeout=settings.OTP_RESEND_COOLDOWN_SECONDS,
        )
    except Exception as exc:
        raise OtpDeliveryError("OTP rate limiter is unavailable.") from exc
    if not cooldown_acquired:
        raise OtpRateLimitError(settings.OTP_RESEND_COOLDOWN_SECONDS)

    _increment_rate_counter(
        f"otp:phone:{phone_hash}",
        settings.OTP_PHONE_RATE_LIMIT,
    )
    _increment_rate_counter(
        f"otp:ip:{ip_hash}",
        settings.OTP_IP_RATE_LIMIT,
    )

    maximum_code = 10**settings.OTP_CODE_LENGTH
    code = f"{secrets.randbelow(maximum_code):0{settings.OTP_CODE_LENGTH}d}"
    now = timezone.now()
    challenge = OtpChallenge.objects.create(
        phone_number=canonical_phone,
        purpose=OtpChallenge.Purpose.LOGIN,
        code_hash=make_password(code),
        request_ip_hash=ip_hash,
        device_hash=device_hash,
        expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS),
    )

    try:
        get_otp_sender().send(canonical_phone, code, OtpChallenge.Purpose.LOGIN)
    except OtpDeliveryError as exc:
        mark_delivery_failed(challenge, exc.__class__.__name__)
        raise

    challenge.delivery_status = OtpChallenge.DeliveryStatus.SENT
    challenge.delivered_at = now
    challenge.save(update_fields=("delivery_status", "delivered_at"))

    development_code = code if settings.OTP_DEVELOPMENT_CODE_ENABLED else None
    return IssuedOtp(challenge=challenge, development_code=development_code)


def verify_login_otp(
    *,
    challenge_id: uuid.UUID,
    phone_number: str,
    code: str,
) -> User:
    canonical_phone = normalize_phone_number(phone_number)
    verification_failed = False

    with transaction.atomic():
        challenge = (
            OtpChallenge.objects.select_for_update()
            .filter(
                id=challenge_id,
                phone_number=canonical_phone,
                purpose=OtpChallenge.Purpose.LOGIN,
            )
            .first()
        )

        if (
            challenge is None
            or challenge.delivery_status != OtpChallenge.DeliveryStatus.SENT
            or challenge.is_consumed
            or challenge.is_expired
            or challenge.is_locked
        ):
            verification_failed = True
        elif not check_password(code, challenge.code_hash):
            challenge.failed_attempts += 1
            challenge.save(update_fields=("failed_attempts",))
            verification_failed = True
        else:
            challenge.consumed_at = timezone.now()
            challenge.save(update_fields=("consumed_at",))

            user, _created = User.objects.get_or_create(phone_number=canonical_phone)
            CustomerProfile.objects.get_or_create(user=user)
            customer_role, _created = Role.objects.get_or_create(
                code="customer",
                defaults={"name": "Customer", "is_system": True},
            )
            UserRole.objects.get_or_create(
                user=user,
                role=customer_role,
                revoked_at__isnull=True,
            )
            return user

    if verification_failed:
        raise OtpVerificationError("The code is invalid or expired.")

    raise RuntimeError("OTP verification reached an impossible state.")


def create_authenticated_session(
    *,
    request: HttpRequest,
    user: User,
    device_identifier: str = "",
    device_label: str = "",
) -> UserSession:
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session.save()
    session_key = request.session.session_key
    if not session_key:
        raise RuntimeError("Django did not create a session key.")

    device = None
    if device_identifier:
        device, _created = Device.objects.update_or_create(
            user=user,
            fingerprint_hash=keyed_hash(device_identifier),
            defaults={
                "label": device_label[:100],
                "last_seen_at": timezone.now(),
                "revoked_at": None,
            },
        )

    session = UserSession.objects.create(
        user=user,
        device=device,
        session_key_hash=keyed_hash(session_key),
        expires_at=request.session.get_expiry_date(),
    )
    return session


@transaction.atomic
def revoke_current_session(request: HttpRequest) -> None:
    session_key = request.session.session_key
    if session_key:
        UserSession.objects.filter(
            session_key_hash=keyed_hash(session_key),
            revoked_at__isnull=True,
        ).update(revoked_at=timezone.now())
    logout(request)
