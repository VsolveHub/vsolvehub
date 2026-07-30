import uuid
from http import HTTPStatus

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.identity.models import OtpChallenge, User, UserSession

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
    assert verify_response.json()["user"]["roles"] == ["customer"]
    assert User.objects.filter(phone_number="+919876543210").exists()
    assert UserSession.objects.filter(revoked_at__isnull=True).count() == 1

    session_response = client.get("/api/v1/auth/session/")
    assert session_response.status_code == HTTPStatus.OK
    assert session_response.json()["phone_number"] == "+919876543210"

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
    assert expired_response.status_code in {HTTPStatus.FORBIDDEN, HTTPStatus.UNAUTHORIZED}


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
    assert int(response.headers["Retry-After"]) > 0


@override_settings(OTP_DEVELOPMENT_CODE_ENABLED=False)
def test_code_is_not_exposed_when_development_flag_is_disabled() -> None:
    response = APIClient().post(
        "/api/v1/auth/otp/request/",
        {"phone_number": "9876543210"},
        format="json",
    )

    assert response.status_code == HTTPStatus.ACCEPTED
    assert "development_code" not in response.json()


def test_invalid_phone_uses_validation_error_envelope() -> None:
    response = APIClient().post(
        "/api/v1/auth/otp/request/",
        {"phone_number": "123"},
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "validation_error"
