import uuid
from http import HTTPStatus

import pytest
from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.identity.models import AccessAuditEvent, OtpChallenge, User, UserSession

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


def _issue_otp(client: APIClient) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/otp/request/",
        {
            "phone_number": "9876543210",
            "device_identifier": "browser-device-1",
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.ACCEPTED
    return response.json()


def test_customer_can_request_verify_and_revoke_session() -> None:
    client = APIClient()
    issued = _issue_otp(client)

    verify_response = client.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": issued["challenge_id"],
            "phone_number": "+919876543210",
            "code": issued["development_code"],
            "device_identifier": "browser-device-1",
            "device_label": "Chrome on Windows",
        },
        format="json",
    )

    assert verify_response.status_code == HTTPStatus.OK
    assert verify_response.json()["user"]["phone_number"] == "+919876543210"
    assert verify_response.json()["user"]["display_name"] == ""
    assert verify_response.json()["user"]["date_joined"]
    assert verify_response.json()["user"]["roles"] == ["customer"]
    assert verify_response.json()["active_role"] == "customer"
    assert verify_response.json()["session_expires_at"]
    assert User.objects.filter(phone_number="+919876543210").exists()
    assert UserSession.objects.filter(revoked_at__isnull=True).count() == 1

    user = User.objects.get(phone_number="+919876543210")
    user.full_name = "Gopal Rao"
    user.email = "gopal@example.test"
    user.save(update_fields=("full_name", "email", "updated_at"))
    user.customer_profile.display_name = "Gopal"
    user.customer_profile.save(update_fields=("display_name", "updated_at"))

    session_response = client.get("/api/v1/auth/session/")
    assert session_response.status_code == HTTPStatus.OK
    assert session_response.json()["user"]["phone_number"] == "+919876543210"
    assert session_response.json()["user"]["display_name"] == "Gopal"
    assert session_response.json()["user"]["full_name"] == "Gopal Rao"
    assert session_response.json()["user"]["email"] == "gopal@example.test"
    assert session_response.json()["user"]["date_joined"]
    assert session_response.json()["active_role"] == "customer"
    assert session_response.json()["session_expires_at"]

    sessions_response = client.get("/api/v1/auth/sessions/")
    assert sessions_response.status_code == HTTPStatus.OK
    assert len(sessions_response.json()) == 1
    assert sessions_response.json()[0]["is_current"] is True
    assert sessions_response.json()[0]["device_label"] == "Chrome on Windows"

    missing_session_response = client.delete(f"/api/v1/auth/sessions/{uuid.uuid4()}/")
    assert missing_session_response.status_code == HTTPStatus.NOT_FOUND

    logout_response = client.post("/api/v1/auth/logout/", format="json")
    assert logout_response.status_code == HTTPStatus.NO_CONTENT
    assert UserSession.objects.filter(revoked_at__isnull=False).count() == 1

    expired_response = client.get("/api/v1/auth/session/")
    assert expired_response.status_code == HTTPStatus.OK
    assert expired_response.json() == {
        "user": None,
        "active_role": None,
        "session_expires_at": None,
    }


def test_anonymous_session_read_is_explicit_and_side_effect_free() -> None:
    response = APIClient().get("/api/v1/auth/session/")

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {
        "user": None,
        "active_role": None,
        "session_expires_at": None,
    }


def test_customer_can_read_and_update_personal_profile() -> None:
    client = APIClient()
    issued = _issue_otp(client)
    verified = client.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": issued["challenge_id"],
            "phone_number": "+919876543210",
            "code": issued["development_code"],
        },
        format="json",
    )
    assert verified.status_code == HTTPStatus.OK

    empty_profile = client.get("/api/v1/auth/profile/")
    assert empty_profile.status_code == HTTPStatus.OK
    assert empty_profile.json()["display_name"] == ""
    assert empty_profile.json()["full_name"] == ""

    updated = client.patch(
        "/api/v1/auth/profile/",
        {
            "display_name": "  Gopal  ",
            "full_name": "  Gopal   Rao  ",
            "email": "gopal@example.test",
        },
        format="json",
    )
    assert updated.status_code == HTTPStatus.OK
    assert updated.json()["display_name"] == "Gopal"
    assert updated.json()["full_name"] == "Gopal Rao"
    assert updated.json()["email"] == "gopal@example.test"
    assert updated.json()["phone_number"] == "+919876543210"

    event = AccessAuditEvent.objects.get(action="identity.customer_profile_updated")
    assert event.metadata == {"fields": ["display_name", "full_name", "email"]}
    assert "Gopal" not in str(event.metadata)


def test_anonymous_customer_profile_is_not_disclosed() -> None:
    response = APIClient().get("/api/v1/auth/profile/")

    assert response.status_code in {HTTPStatus.FORBIDDEN, HTTPStatus.UNAUTHORIZED}


def test_wrong_code_increments_attempts_and_does_not_create_user() -> None:
    client = APIClient()
    issued = _issue_otp(client)
    wrong_code = "000000" if issued["development_code"] != "000000" else "000001"

    response = client.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": issued["challenge_id"],
            "phone_number": "9876543210",
            "code": wrong_code,
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "invalid_otp"
    challenge = OtpChallenge.objects.get(id=issued["challenge_id"])
    assert challenge.failed_attempts == 1
    assert User.objects.count() == 0


def test_code_cannot_be_reused() -> None:
    client = APIClient()
    issued = _issue_otp(client)
    payload = {
        "challenge_id": issued["challenge_id"],
        "phone_number": "9876543210",
        "code": issued["development_code"],
    }

    assert (
        client.post("/api/v1/auth/otp/verify/", payload, format="json").status_code == HTTPStatus.OK
    )
    reused_response = APIClient().post("/api/v1/auth/otp/verify/", payload, format="json")

    assert reused_response.status_code == HTTPStatus.BAD_REQUEST
    assert reused_response.json()["error"]["code"] == "invalid_otp"


def test_resend_cooldown_returns_retryable_error() -> None:
    client = APIClient()
    _issue_otp(client)

    response = client.post(
        "/api/v1/auth/otp/request/",
        {"phone_number": "9876543210"},
        format="json",
    )

    assert response.status_code == HTTPStatus.TOO_MANY_REQUESTS
    assert response.json()["error"]["code"] == "throttled"
    retry_after = int(response.headers["Retry-After"])
    assert retry_after > 0
    assert response.json()["error"]["message"] == (
        "Too many code requests. Try again when the countdown ends."
    )
    assert response.json()["error"]["details"] == {"retry_after_seconds": retry_after}


def test_otp_request_is_unavailable_when_rate_limiter_is_down(monkeypatch) -> None:
    def redis_down(*args: object, **kwargs: object) -> bool:
        raise ConnectionError("redis down")

    monkeypatch.setattr("apps.identity.services.cache.add", redis_down)

    response = APIClient().post(
        "/api/v1/auth/otp/request/",
        {"phone_number": "9876543210"},
        format="json",
    )

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "otp_unavailable"
    assert response.json()["error"]["retryable"] is True


@override_settings(OTP_DEVELOPMENT_CODE_ENABLED=False)
def test_code_is_not_exposed_when_development_flag_is_disabled() -> None:
    response = APIClient().post(
        "/api/v1/auth/otp/request/",
        {"phone_number": "9876543210"},
        format="json",
    )

    assert response.status_code == HTTPStatus.ACCEPTED
    assert response.json()["development_code"] is None
    assert response.json()["code_length"] == settings.OTP_CODE_LENGTH


def test_invalid_phone_uses_validation_error_envelope() -> None:
    response = APIClient().post(
        "/api/v1/auth/otp/request/",
        {"phone_number": "123"},
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "validation_error"


@override_settings(
    CORS_ALLOWED_ORIGINS=["https://customer.example.test"],
    CSRF_TRUSTED_ORIGINS=["https://customer.example.test"],
    CSRF_COOKIE_SECURE=True,
    SESSION_COOKIE_SECURE=True,
)
def test_credentialed_browser_csrf_bootstrap_rotation_and_revoke() -> None:
    origin = "https://customer.example.test"
    client = APIClient(enforce_csrf_checks=True)

    bootstrap = client.get("/api/v1/auth/csrf/", HTTP_ORIGIN=origin)
    assert bootstrap.status_code == HTTPStatus.OK
    initial_token = bootstrap.json()["csrf_token"]
    assert initial_token
    assert bootstrap.headers["Access-Control-Allow-Origin"] == origin
    assert bootstrap.headers["Access-Control-Allow-Credentials"] == "true"
    csrf_cookie = client.cookies[settings.CSRF_COOKIE_NAME]
    assert csrf_cookie["httponly"] is True
    assert csrf_cookie["secure"] is True
    assert csrf_cookie["samesite"] == "Lax"

    issued = _issue_otp(client)
    verified = client.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": issued["challenge_id"],
            "phone_number": "+919876543210",
            "code": issued["development_code"],
        },
        format="json",
        HTTP_ORIGIN=origin,
    )
    assert verified.status_code == HTTPStatus.OK
    session_cookie = client.cookies[settings.SESSION_COOKIE_NAME]
    assert session_cookie["httponly"] is True
    assert session_cookie["secure"] is True

    stale_token = client.post(
        "/api/v1/auth/privacy/consents/",
        {"purpose": "privacy-notice", "policy_version": "v1"},
        format="json",
        HTTP_ORIGIN=origin,
        HTTP_X_CSRFTOKEN=initial_token,
    )
    assert stale_token.status_code == HTTPStatus.FORBIDDEN
    assert stale_token.json()["error"]["code"] == "csrf_failed"

    refreshed = client.get("/api/v1/auth/csrf/", HTTP_ORIGIN=origin)
    refreshed_token = refreshed.json()["csrf_token"]
    assert refreshed_token != initial_token
    created = client.post(
        "/api/v1/auth/privacy/consents/",
        {"purpose": "privacy-notice", "policy_version": "v1"},
        format="json",
        HTTP_ORIGIN=origin,
        HTTP_X_CSRFTOKEN=refreshed_token,
    )
    assert created.status_code == HTTPStatus.CREATED

    logged_out = client.post(
        "/api/v1/auth/logout/",
        format="json",
        HTTP_ORIGIN=origin,
        HTTP_X_CSRFTOKEN=refreshed_token,
    )
    assert logged_out.status_code == HTTPStatus.NO_CONTENT
    rejected = client.post(
        "/api/v1/auth/privacy/consents/",
        {"purpose": "privacy-notice", "policy_version": "v2"},
        format="json",
        HTTP_ORIGIN=origin,
        HTTP_X_CSRFTOKEN=refreshed_token,
    )
    assert rejected.status_code in {HTTPStatus.FORBIDDEN, HTTPStatus.UNAUTHORIZED}


@override_settings(
    CORS_ALLOWED_ORIGINS=["https://customer.example.test"],
    CSRF_TRUSTED_ORIGINS=["https://customer.example.test"],
)
def test_cors_preflight_allows_only_configured_credentialed_origin() -> None:
    client = APIClient()
    allowed = client.options(
        "/api/v1/auth/logout/",
        HTTP_ORIGIN="https://customer.example.test",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,x-csrftoken",
    )
    rejected = client.options(
        "/api/v1/auth/logout/",
        HTTP_ORIGIN="https://attacker.example.test",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,x-csrftoken",
    )

    assert allowed.status_code == HTTPStatus.OK
    assert allowed.headers["Access-Control-Allow-Origin"] == "https://customer.example.test"
    assert allowed.headers["Access-Control-Allow-Credentials"] == "true"
    assert "x-csrftoken" in allowed.headers["Access-Control-Allow-Headers"]
    assert "Access-Control-Allow-Origin" not in rejected.headers


@override_settings(
    CORS_ALLOWED_ORIGINS=["https://customer.example.test"],
    CSRF_TRUSTED_ORIGINS=["https://customer.example.test"],
)
def test_cors_preflight_allows_idempotency_header_for_browser_commands() -> None:
    origin = "https://customer.example.test"

    response = APIClient().options(
        "/api/v1/fulfilment-plan-sets/",
        HTTP_ORIGIN=origin,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,idempotency-key,x-csrftoken",
    )

    allowed_headers = {
        header.strip().lower()
        for header in response.headers["Access-Control-Allow-Headers"].split(",")
    }
    assert response.status_code == HTTPStatus.OK
    assert response.headers["Access-Control-Allow-Origin"] == origin
    assert response.headers["Access-Control-Allow-Credentials"] == "true"
    assert {"content-type", "idempotency-key", "x-csrftoken"}.issubset(allowed_headers)
