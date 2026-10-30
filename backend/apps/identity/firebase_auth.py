"""Firebase Phone Auth token exchange."""

import json
import logging
import threading
import time
from typing import Any

import firebase_admin  # type: ignore[import-untyped]
import google.auth.credentials
from django.conf import settings
from django.core.cache import cache
from firebase_admin import auth, credentials

from apps.identity.hashing import keyed_hash
from apps.identity.models import AccessAuditEvent, User, UserRole
from apps.identity.phone import InvalidPhoneNumberError, normalize_phone_number
from apps.identity.services import (
    FIREBASE_INTENDED_ROLES,
    NoAccountForRoleError,
    OtpVerificationError,
    provision_login_user,
    record_access_event,
)

logger = logging.getLogger(__name__)


class _AnonymousCredential(credentials.Base):  # type: ignore[misc]
    """Fallback credential when only Google public certs are needed for ID token verification."""

    def get_credential(self) -> google.auth.credentials.Credentials:
        return google.auth.credentials.AnonymousCredentials()  # type: ignore[no-untyped-call]


# Credential fallback strategy:
# 1. If FIREBASE_CREDENTIALS_JSON is provided (as a JSON string env var), we initialize
#    the Firebase Admin SDK with credentials.Certificate(cert_data). This is used if
#    the backend needs service-account authority (e.g. administrative tasks, custom claims).
# 2. If FIREBASE_CREDENTIALS_JSON is absent, we only need to verify Firebase ID tokens.
#    Verifying ID tokens only requires Google's public X.509 certificates (fetched over HTTPS).
#    However, firebase_admin defaults to Application Default Credentials (ADC) if no credential
#    is passed, which raises DefaultCredentialsError in environments without Google Cloud ADC.
#    To prevent this, _AnonymousCredential provides a lightweight credentials.Base wrapper
#    around google.auth.credentials.AnonymousCredentials(), allowing TokenVerifier to verify
#    tokens using Google public certs without needing a service account file or ADC.
class _FirebaseAppManager:
    """Thread-safe lazy initialization of the default Firebase app."""

    _lock = threading.Lock()
    _initialized = False

    @classmethod
    def ensure_initialized(cls) -> None:
        if cls._initialized and firebase_admin._apps:
            return

        with cls._lock:
            if cls._initialized and firebase_admin._apps:
                return

            project_id = getattr(settings, "FIREBASE_PROJECT_ID", "")
            creds_json = getattr(settings, "FIREBASE_CREDENTIALS_JSON", "")

            options: dict[str, Any] = {}
            if project_id:
                options["projectId"] = project_id

            if creds_json and creds_json.strip():
                try:
                    cert_data = json.loads(creds_json)
                    cred = credentials.Certificate(cert_data)
                    firebase_admin.initialize_app(cred, options=options or None)
                except Exception as exc:
                    logger.exception(
                        "Failed to parse or initialize Firebase credentials from JSON."
                    )
                    raise OtpVerificationError(
                        "Firebase authentication initialization failed."
                    ) from exc
            else:
                # When credentials JSON is absent, Google public certs verify tokens.
                # Use anonymous credential to avoid DefaultCredentialsError when ADC is missing.
                cred = _AnonymousCredential()
                firebase_admin.initialize_app(cred, options=options or None)

            cls._initialized = True


def _extract_canonical_phone(decoded_token: dict[str, Any], max_age: int) -> str:
    """Validate token claims and freshness, returning the canonical E.164 phone number."""
    firebase_dict = decoded_token.get("firebase", {})
    sign_in_provider = (
        firebase_dict.get("sign_in_provider") if isinstance(firebase_dict, dict) else None
    )
    if sign_in_provider != "phone":
        logger.warning("Firebase token rejected: provider %r is not phone", sign_in_provider)
        raise OtpVerificationError("Invalid authentication provider.")

    raw_phone = decoded_token.get("phone_number")
    if not raw_phone or not isinstance(raw_phone, str):
        logger.warning("Firebase token rejected: missing phone_number claim")
        raise OtpVerificationError("Token missing phone number claim.")

    auth_time = decoded_token.get("auth_time")
    now_epoch = int(time.time())
    if not isinstance(auth_time, (int, float)) or (now_epoch - auth_time) > max_age:
        logger.warning(
            "Firebase token rejected: auth_time (%s) exceeded max age (%s)",
            auth_time,
            max_age,
        )
        raise OtpVerificationError("Authentication token has expired.")

    try:
        return normalize_phone_number(raw_phone)
    except InvalidPhoneNumberError as exc:
        logger.warning("Firebase token rejected: could not normalize phone number")
        raise OtpVerificationError("Invalid phone number claim in token.") from exc


class StepUpIdentityMismatchError(Exception):
    """The verified number is not the signed-in person's."""


def _verified_phone_from_token(id_token: str) -> tuple[str, int]:
    """Verify the token's signature, provider and freshness; return (canonical phone, max age)."""
    _FirebaseAppManager.ensure_initialized()

    try:
        decoded_token = auth.verify_id_token(id_token, clock_skew_seconds=10)
    except Exception as exc:
        logger.warning("Firebase ID token verification failed: %s", exc.__class__.__name__)
        raise OtpVerificationError("Invalid or expired authentication token.") from exc

    max_age = getattr(settings, "FIREBASE_TOKEN_MAX_AGE_SECONDS", 300)
    return _extract_canonical_phone(decoded_token, max_age), max_age


def _spend_token(id_token: str, max_age: int) -> bool:
    """Mark the token used (SET NX with TTL). False when it was already spent.

    Login and step-up share the key space, so a token spent on one can never be replayed
    against the other.
    """
    return bool(cache.add(f"firebase:token:{keyed_hash(id_token)}", "1", timeout=max_age))


def verify_firebase_login(
    *,
    id_token: str,
    intended_role: str = "",
    referral_code: str = "",
    request_ip: str = "",
    request_id: str = "",
) -> User:
    """Verify a Firebase ID token, enforce business rules, and provision the session user.

    Never logs secrets or raw tokens. Maps token verification errors to OtpVerificationError.
    """
    canonical_phone, max_age = _verified_phone_from_token(id_token)

    phone_hash = keyed_hash(canonical_phone)
    ip_hash = keyed_hash(request_ip) if request_ip else ""

    if intended_role and intended_role not in FIREBASE_INTENDED_ROLES:
        logger.warning("Firebase login rejected: role %r not permitted via Firebase", intended_role)
        raise OtpVerificationError("Invalid intended role for Firebase auth.")

    # Intended role gate (same authoritative gate as issue_login_otp)
    if intended_role and not (
        UserRole.objects.filter(
            user__phone_number=canonical_phone,
            role__code=intended_role,
            revoked_at__isnull=True,
        ).exists()
    ):
        record_access_event(
            actor=None,
            subject_user=None,
            action="identity.firebase_login",
            decision=AccessAuditEvent.Decision.DENIED,
            request_id=request_id,
            metadata={
                "phone_hash": phone_hash,
                "request_ip_hash": ip_hash,
                "reason": "no_account_for_role",
                "intended_role": intended_role,
            },
        )
        raise NoAccountForRoleError(intended_role)

    # Reject inactive users
    existing_user = User.objects.filter(phone_number=canonical_phone).first()
    if existing_user is not None and not existing_user.is_active:
        logger.warning("Firebase login rejected: user account is inactive")
        record_access_event(
            actor=existing_user,
            subject_user=existing_user,
            action="identity.firebase_login",
            decision=AccessAuditEvent.Decision.DENIED,
            request_id=request_id,
            metadata={
                "phone_hash": phone_hash,
                "request_ip_hash": ip_hash,
                "reason": "user_inactive",
            },
        )
        raise OtpVerificationError("User account is inactive.")

    # One-time token use: record token hash in cache with SET NX and TTL
    if not _spend_token(id_token, max_age):
        logger.warning("Firebase token rejected: token already used")
        record_access_event(
            actor=None,
            subject_user=None,
            action="identity.firebase_login",
            decision=AccessAuditEvent.Decision.DENIED,
            request_id=request_id,
            metadata={
                "phone_hash": phone_hash,
                "request_ip_hash": ip_hash,
                "reason": "token_already_used",
            },
        )
        raise OtpVerificationError("Authentication token has already been used.")

    # Provision user and related profiles/roles
    user, _user_created = provision_login_user(
        canonical_phone=canonical_phone,
        referral_code=referral_code,
    )

    # Audit trail (never stores raw phone or token)
    record_access_event(
        actor=user,
        subject_user=user,
        action="identity.firebase_login",
        decision=AccessAuditEvent.Decision.ALLOWED,
        request_id=request_id,
        metadata={
            "phone_hash": phone_hash,
            "request_ip_hash": ip_hash,
        },
    )

    return user


def verify_firebase_step_up(
    *,
    id_token: str,
    user: User,
    request_ip: str = "",
    request_id: str = "",
) -> None:
    """Re-prove the signed-in person with a fresh Firebase phone verification.

    The Firebase counterpart of the OTP check `FinanceStepUpView` runs: the token must be
    valid, issued for a phone sign-in within `FIREBASE_TOKEN_MAX_AGE_SECONDS`, unspent, and
    for the number of the user whose session is being stepped up. Stamping the session is
    the caller's job, so both step-up paths record the same `stepped_up_at`.
    """
    canonical_phone, max_age = _verified_phone_from_token(id_token)

    metadata: dict[str, object] = {
        "phone_hash": keyed_hash(canonical_phone),
        "request_ip_hash": keyed_hash(request_ip) if request_ip else "",
    }

    if canonical_phone != user.phone_number:
        logger.warning("Firebase step-up rejected: verified number is not the session user's")
        record_access_event(
            actor=user,
            subject_user=user,
            action="identity.firebase_step_up",
            decision=AccessAuditEvent.Decision.DENIED,
            request_id=request_id,
            metadata={**metadata, "reason": "phone_mismatch"},
        )
        raise StepUpIdentityMismatchError

    if not _spend_token(id_token, max_age):
        logger.warning("Firebase step-up rejected: token already used")
        record_access_event(
            actor=user,
            subject_user=user,
            action="identity.firebase_step_up",
            decision=AccessAuditEvent.Decision.DENIED,
            request_id=request_id,
            metadata={**metadata, "reason": "token_already_used"},
        )
        raise OtpVerificationError("Authentication token has already been used.")

    record_access_event(
        actor=user,
        subject_user=user,
        action="identity.firebase_step_up",
        decision=AccessAuditEvent.Decision.ALLOWED,
        request_id=request_id,
        metadata=metadata,
    )
