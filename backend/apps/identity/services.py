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
    AccessAuditEvent,
    CommunicationPreference,
    ConsentReceipt,
    CustomerProfile,
    Device,
    OtpChallenge,
    PrivacyRequest,
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


class NoAccountForRoleError(RuntimeError):
    """Raised when an OTP is requested for a role the phone number does not hold.

    Only ever raised when the caller opted in with `intended_role` — e.g. the
    Partner app, where signing in requires an application to already exist.
    The Customer app never passes it, since self-service signup is the point.
    """


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
    intended_role: str = "",
) -> IssuedOtp:
    canonical_phone = normalize_phone_number(phone_number)
    phone_hash = keyed_hash(canonical_phone)
    ip_hash = keyed_hash(request_ip)
    device_hash = keyed_hash(device_identifier) if device_identifier else ""

    # Counted before the role check so probing phone numbers for a role costs the same
    # budget as requesting real codes for them — the check is not a free-standing oracle.
    _increment_rate_counter(
        f"otp:phone:{phone_hash}",
        settings.OTP_PHONE_RATE_LIMIT,
    )
    _increment_rate_counter(
        f"otp:ip:{ip_hash}",
        settings.OTP_IP_RATE_LIMIT,
    )

    if intended_role and not (
        UserRole.objects.filter(
            user__phone_number=canonical_phone,
            role__code=intended_role,
            revoked_at__isnull=True,
        ).exists()
    ):
        raise NoAccountForRoleError(intended_role)

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

    active_role = (
        UserRole.objects.filter(user=user, revoked_at__isnull=True)
        .select_related("role")
        .order_by("role__code")
        .values_list("role", flat=True)
        .first()
    )
    session = UserSession.objects.create(
        user=user,
        device=device,
        active_role_id=active_role,
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


@transaction.atomic
def update_customer_profile(
    *,
    user: User,
    display_name: str | None = None,
    full_name: str | None = None,
    email: str | None = None,
) -> User:
    """Update customer-owned identity fields without changing sign-in identity."""
    locked_user = User.objects.select_for_update().get(pk=user.pk)
    profile, _created = CustomerProfile.objects.select_for_update().get_or_create(user=locked_user)
    changed_fields: list[str] = []

    if display_name is not None:
        profile.display_name = " ".join(display_name.split())
        profile.save(update_fields=("display_name", "updated_at"))
        changed_fields.append("display_name")

    user_fields: list[str] = []
    if full_name is not None:
        locked_user.full_name = " ".join(full_name.split())
        user_fields.append("full_name")
        changed_fields.append("full_name")
    if email is not None:
        locked_user.email = email.strip()
        user_fields.append("email")
        changed_fields.append("email")
    if user_fields:
        locked_user.save(update_fields=(*user_fields, "updated_at"))

    if changed_fields:
        record_access_event(
            actor=locked_user,
            subject_user=locked_user,
            action="identity.customer_profile_updated",
            object_type="customer_profile",
            object_id=profile.id,
            metadata={"fields": changed_fields},
        )
    return locked_user


@transaction.atomic
def switch_active_role(*, user: User, session_key: str, role_code: str) -> UserSession:
    """Switch one session to an already granted role; role grants are never implicit."""
    role = Role.objects.filter(code=role_code).first()
    if (
        role is None
        or not UserRole.objects.filter(
            user=user,
            role=role,
            revoked_at__isnull=True,
        ).exists()
    ):
        raise PermissionError("The requested role has not been granted.")
    session = UserSession.objects.select_for_update().get(
        user=user,
        session_key_hash=keyed_hash(session_key),
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    )
    session.active_role = role
    session.save(update_fields=("active_role",))
    record_access_event(
        actor=user,
        subject_user=user,
        action="identity.role_switched",
        object_type="role",
        object_id=role.id,
    )
    return session


@transaction.atomic
def grant_role(*, actor: User, user: User, role: Role) -> UserRole:
    """Grant a role with attribution; no actor may grant their own privilege."""
    if actor.pk == user.pk:
        raise PermissionError("Users cannot grant themselves a role.")
    grant, _created = UserRole.objects.get_or_create(
        user=user,
        role=role,
        revoked_at__isnull=True,
        defaults={"granted_by": actor},
    )
    record_access_event(
        actor=actor,
        subject_user=user,
        action="identity.role_granted",
        object_type="role",
        object_id=role.id,
    )
    return grant


def mark_session_step_up(*, user: User, session_key: str) -> UserSession:
    session = UserSession.objects.get(
        user=user,
        session_key_hash=keyed_hash(session_key),
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    )
    session.stepped_up_at = timezone.now()
    session.save(update_fields=("stepped_up_at",))
    record_access_event(actor=user, subject_user=user, action="identity.finance_step_up")
    return session


def record_consent(
    *, user: User, purpose: str, policy_version: str, source: str = "api"
) -> ConsentReceipt:
    receipt, _created = ConsentReceipt.objects.get_or_create(
        user=user,
        purpose=purpose,
        policy_version=policy_version,
        defaults={"source": source},
    )
    return receipt


def set_communication_preference(
    *,
    user: User,
    channel: str,
    purpose: str,
    is_enabled: bool,
) -> CommunicationPreference:
    preference, _created = CommunicationPreference.objects.update_or_create(
        user=user,
        channel=channel,
        purpose=purpose,
        defaults={"is_enabled": is_enabled},
    )
    return preference


def create_privacy_request(*, user: User, kind: str) -> PrivacyRequest:
    request = PrivacyRequest.objects.create(user=user, kind=kind)
    record_access_event(
        actor=user,
        subject_user=user,
        action="identity.privacy_request_created",
        object_type="privacy_request",
        object_id=request.id,
    )
    return request


def record_access_event(
    *,
    actor: User | None,
    subject_user: User | None,
    action: str,
    object_type: str = "",
    object_id: uuid.UUID | None = None,
    decision: str = AccessAuditEvent.Decision.ALLOWED,
    request_id: str = "",
    metadata: dict[str, object] | None = None,
) -> AccessAuditEvent:
    """Persist minimal, non-secret authorization evidence for sensitive actions."""
    return AccessAuditEvent.objects.create(
        actor=actor,
        subject_user=subject_user,
        action=action,
        object_type=object_type,
        object_id=object_id,
        decision=decision,
        request_id=request_id,
        metadata=metadata or {},
    )
