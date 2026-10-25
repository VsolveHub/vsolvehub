"""Tests for Firebase Phone Auth backend token exchange and precheck."""

import time
from collections.abc import Iterator
from http import HTTPStatus
from unittest import mock

import pytest
from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.identity.models import AccessAuditEvent, OtpChallenge, Role, User, UserRole, UserSession

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def clear_caches() -> None:
    cache.clear()


@pytest.fixture(autouse=True)
def enable_firebase() -> Iterator[None]:
    with override_settings(FIREBASE_AUTH_ENABLED=True, FIREBASE_TOKEN_MAX_AGE_SECONDS=300):
        yield


def _valid_claims(phone: str = "+919876543210", auth_time_offset: int = 0) -> dict[str, object]:
    return {
        "firebase": {"sign_in_provider": "phone"},
        "phone_number": phone,
        "auth_time": int(time.time()) + auth_time_offset,
        "sub": "firebase-uid-12345",
    }


def test_valid_token_creates_user_customer_role_session_and_fires_signup() -> None:
    client = APIClient()
    claims = _valid_claims("+919876543210")

    with (
        mock.patch("firebase_admin.auth.verify_id_token", return_value=claims) as mock_verify,
        mock.patch("apps.loyalty.services.signup.on_customer_signup") as mock_signup,
    ):
        response = client.post(
            "/api/v1/auth/firebase/verify/",
            {
                "id_token": "dummy-valid-id-token",
                "device_identifier": "device-browser-1",
                "device_label": "Chrome on Linux",
            },
            format="json",
        )

    assert response.status_code == HTTPStatus.OK
    mock_verify.assert_called_once_with("dummy-valid-id-token", clock_skew_seconds=10)
    body = response.json()
    assert body["user"]["phone_number"] == "+919876543210"
    assert body["user"]["roles"] == ["customer"]
    assert body["active_role"] == "customer"
    assert body["session_expires_at"]

    # Session cookie set
    assert settings.SESSION_COOKIE_NAME in response.cookies
    session_cookie = response.cookies[settings.SESSION_COOKIE_NAME]
    assert session_cookie.value

    # DB state verified
    assert User.objects.filter(phone_number="+919876543210").exists()
    assert UserSession.objects.filter(revoked_at__isnull=True).count() == 1

    # Signup hook fired once
    mock_signup.assert_called_once()
    assert mock_signup.call_args.kwargs["user"].phone_number == "+919876543210"

    # Audit event recorded
    assert AccessAuditEvent.objects.filter(
        action="identity.firebase_login",
        decision=AccessAuditEvent.Decision.ALLOWED,
    ).exists()


def test_second_login_of_same_phone_does_not_refire_signup_hook() -> None:
    client = APIClient()
    claims = _valid_claims("+919876543210")

    with (
        mock.patch("firebase_admin.auth.verify_id_token", return_value=claims),
        mock.patch("apps.loyalty.services.signup.on_customer_signup") as mock_signup,
    ):
        first_resp = client.post(
            "/api/v1/auth/firebase/verify/",
            {"id_token": "token-1"},
            format="json",
        )
        assert first_resp.status_code == HTTPStatus.OK
        assert mock_signup.call_count == 1

        second_client = APIClient()
        second_resp = second_client.post(
            "/api/v1/auth/firebase/verify/",
            {"id_token": "token-2"},
            format="json",
        )
        assert second_resp.status_code == HTTPStatus.OK
        # Must not re-fire on second login
        assert mock_signup.call_count == 1


def test_referral_code_passed_through_on_creation() -> None:
    client = APIClient()
    claims = _valid_claims("+919999888877")

    with (
        mock.patch("firebase_admin.auth.verify_id_token", return_value=claims),
        mock.patch("apps.loyalty.services.signup.on_customer_signup") as mock_signup,
    ):
        response = client.post(
            "/api/v1/auth/firebase/verify/",
            {
                "id_token": "dummy-token",
                "referral_code": "REFCODE123",
            },
            format="json",
        )

    assert response.status_code == HTTPStatus.OK
    mock_signup.assert_called_once_with(
        user=mock.ANY,
        referral_code="REFCODE123",
    )


@pytest.mark.parametrize(
    ("token_claims", "exception"),
    [
        (
            {
                "firebase": {"sign_in_provider": "google"},
                "phone_number": "+919876543210",
                "auth_time": int(time.time()),
            },
            None,
        ),
        ({"firebase": {"sign_in_provider": "phone"}, "auth_time": int(time.time())}, None),
        (
            {
                "firebase": {"sign_in_provider": "phone"},
                "phone_number": "+919876543210",
                "auth_time": int(time.time()) - 400,
            },
            None,
        ),
        (None, ValueError("Token signature is invalid")),
    ],
)
def test_invalid_tokens_return_uniform_400(
    token_claims: dict[str, object] | None,
    exception: Exception | None,
) -> None:
    client = APIClient()

    if exception:
        patcher = mock.patch("firebase_admin.auth.verify_id_token", side_effect=exception)
    else:
        patcher = mock.patch("firebase_admin.auth.verify_id_token", return_value=token_claims)

    with patcher:
        response = client.post(
            "/api/v1/auth/firebase/verify/",
            {"id_token": "bad-or-expired-token"},
            format="json",
        )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    error_code = response.json()["error"]["code"]
    assert error_code == "invalid_otp"


def test_partner_intended_role_without_partner_role_rejected() -> None:
    client = APIClient()
    claims = _valid_claims("+919123456789")

    # In verify endpoint
    with mock.patch("firebase_admin.auth.verify_id_token", return_value=claims):
        response = client.post(
            "/api/v1/auth/firebase/verify/",
            {
                "id_token": "token-for-non-partner",
                "intended_role": "partner",
            },
            format="json",
        )
    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.json()["error"]["code"] == "no_account_for_role"

    # In precheck endpoint
    precheck_response = client.post(
        "/api/v1/auth/firebase/precheck/",
        {
            "phone_number": "+919123456789",
            "intended_role": "partner",
        },
        format="json",
    )
    assert precheck_response.status_code == HTTPStatus.NOT_FOUND
    assert precheck_response.json()["error"]["code"] == "no_account_for_role"


def test_partner_intended_role_with_existing_partner_role_allowed() -> None:
    client = APIClient()
    phone = "+919123456780"
    user = User.objects.create(phone_number=phone)
    partner_role = Role.objects.create(code="partner", name="Partner", is_system=True)
    UserRole.objects.create(user=user, role=partner_role)

    # Precheck returns 204
    precheck_response = client.post(
        "/api/v1/auth/firebase/precheck/",
        {
            "phone_number": phone,
            "intended_role": "partner",
        },
        format="json",
    )
    assert precheck_response.status_code == HTTPStatus.NO_CONTENT

    # Verify succeeds
    claims = _valid_claims(phone)
    with mock.patch("firebase_admin.auth.verify_id_token", return_value=claims):
        verify_response = client.post(
            "/api/v1/auth/firebase/verify/",
            {
                "id_token": "valid-partner-token",
                "intended_role": "partner",
            },
            format="json",
        )
    assert verify_response.status_code == HTTPStatus.OK


def test_inactive_user_rejected() -> None:
    client = APIClient()
    phone = "+919111222333"
    User.objects.create(phone_number=phone, is_active=False)

    claims = _valid_claims(phone)
    with mock.patch("firebase_admin.auth.verify_id_token", return_value=claims):
        response = client.post(
            "/api/v1/auth/firebase/verify/",
            {"id_token": "valid-token-for-inactive-user"},
            format="json",
        )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "invalid_otp"
    assert AccessAuditEvent.objects.filter(
        decision=AccessAuditEvent.Decision.DENIED,
        action="identity.firebase_login",
    ).exists()


@override_settings(FIREBASE_AUTH_ENABLED=False)
def test_feature_flag_off_disables_endpoints() -> None:
    client = APIClient()

    precheck_resp = client.post(
        "/api/v1/auth/firebase/precheck/",
        {"phone_number": "+919876543210"},
        format="json",
    )
    assert precheck_resp.status_code == HTTPStatus.NOT_FOUND

    verify_resp = client.post(
        "/api/v1/auth/firebase/verify/",
        {"id_token": "some-token"},
        format="json",
    )
    assert verify_resp.status_code == HTTPStatus.NOT_FOUND


def test_precheck_applies_rate_limits_without_creating_challenge() -> None:
    client = APIClient()
    phone = "+919888777666"

    # Precheck returns 204
    resp = client.post(
        "/api/v1/auth/firebase/precheck/",
        {"phone_number": phone},
        format="json",
    )
    assert resp.status_code == HTTPStatus.NO_CONTENT

    # No OtpChallenge created
    assert not OtpChallenge.objects.filter(phone_number=phone).exists()

    # Exceed phone rate limit
    for _ in range(settings.OTP_PHONE_RATE_LIMIT - 1):
        client.post(
            "/api/v1/auth/firebase/precheck/",
            {"phone_number": phone},
            format="json",
        )

    throttled_resp = client.post(
        "/api/v1/auth/firebase/precheck/",
        {"phone_number": phone},
        format="json",
    )
    assert throttled_resp.status_code == HTTPStatus.TOO_MANY_REQUESTS
    assert throttled_resp.json()["error"]["code"] == "throttled"


def test_operations_intended_role_rejected_with_uniform_400() -> None:
    client = APIClient()
    claims = _valid_claims("+919876543210")

    # Precheck rejects intended_role="operations" with uniform 400 invalid_otp
    precheck_resp = client.post(
        "/api/v1/auth/firebase/precheck/",
        {
            "phone_number": "+919876543210",
            "intended_role": "operations",
        },
        format="json",
    )
    assert precheck_resp.status_code == HTTPStatus.BAD_REQUEST
    assert precheck_resp.json()["error"]["code"] == "invalid_otp"

    # Verify rejects intended_role="operations" with uniform 400 invalid_otp
    with mock.patch("firebase_admin.auth.verify_id_token", return_value=claims):
        verify_resp = client.post(
            "/api/v1/auth/firebase/verify/",
            {
                "id_token": "token-for-operations",
                "intended_role": "operations",
            },
            format="json",
        )
    assert verify_resp.status_code == HTTPStatus.BAD_REQUEST
    assert verify_resp.json()["error"]["code"] == "invalid_otp"


def test_token_cannot_be_reused_one_time_token_use() -> None:
    client = APIClient()
    claims = _valid_claims("+919876543210")

    with mock.patch("firebase_admin.auth.verify_id_token", return_value=claims):
        first_resp = client.post(
            "/api/v1/auth/firebase/verify/",
            {"id_token": "reused-token-123"},
            format="json",
        )
        assert first_resp.status_code == HTTPStatus.OK

        second_client = APIClient()
        second_resp = second_client.post(
            "/api/v1/auth/firebase/verify/",
            {"id_token": "reused-token-123"},
            format="json",
        )
        assert second_resp.status_code == HTTPStatus.BAD_REQUEST
        assert second_resp.json()["error"]["code"] == "invalid_otp"
