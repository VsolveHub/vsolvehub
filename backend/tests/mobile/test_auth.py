"""Bearer session sign-in for the native apps."""

from http import HTTPStatus

import pytest
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.test import APIClient

from apps.identity.models import UserSession

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


def _issue_otp(client: APIClient, phone: str = "9876543210") -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/otp/request/",
        {"phone_number": phone, "device_identifier": "install-1"},
        format="json",
    )
    assert response.status_code == HTTPStatus.ACCEPTED
    return response.json()


def _verify_mobile(client: APIClient, issued: dict[str, object], **overrides: object) -> Response:
    body = {
        "challenge_id": issued["challenge_id"],
        "phone_number": "+919876543210",
        "code": issued["development_code"],
        "device_identifier": "install-1",
        "device_label": "Pixel 7 · Android 14",
    }
    body.update(overrides)
    return client.post("/api/v1/auth/mobile/otp/verify/", body, format="json")


def test_mobile_verify_returns_a_bearer_token_and_no_cookies() -> None:
    client = APIClient()
    issued = _issue_otp(client)

    response = _verify_mobile(client, issued)

    assert response.status_code == HTTPStatus.OK
    token = response.json()["session_token"]
    assert isinstance(token, str) and token
    assert settings.SESSION_COOKIE_NAME not in response.cookies
    assert settings.CSRF_COOKIE_NAME not in response.cookies

    session = APIClient()
    current = session.get("/api/v1/auth/session/", HTTP_AUTHORIZATION=f"Bearer {token}")
    assert current.status_code == HTTPStatus.OK
    assert current.json()["user"]["phone_number"] == "+919876543210"
    assert settings.SESSION_COOKIE_NAME not in current.cookies
    assert settings.CSRF_COOKIE_NAME not in current.cookies


def test_mobile_verify_rejects_a_wrong_code() -> None:
    client = APIClient()
    issued = _issue_otp(client)

    response = _verify_mobile(client, issued, code="000000")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "invalid_otp"


def test_mobile_verify_requires_a_device_identifier() -> None:
    client = APIClient()
    issued = _issue_otp(client)

    response = _verify_mobile(client, issued, device_identifier="  ")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "validation_error"


def test_revoked_bearer_session_is_rejected() -> None:
    client = APIClient()
    issued = _issue_otp(client)
    token = _verify_mobile(client, issued).json()["session_token"]
    UserSession.objects.update(revoked_at=timezone.now())

    response = APIClient().get("/api/v1/auth/session/", HTTP_AUTHORIZATION=f"Bearer {token}")

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "session_expired"


def test_unknown_bearer_token_is_not_authenticated() -> None:
    response = APIClient().get(
        "/api/v1/auth/session/",
        HTTP_AUTHORIZATION="Bearer not-a-session",
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "not_authenticated"


def test_bearer_post_does_not_need_csrf_and_cookie_post_still_does() -> None:
    setup = APIClient()
    issued = _issue_otp(setup)
    token = _verify_mobile(setup, issued).json()["session_token"]

    bearer = APIClient(enforce_csrf_checks=True)
    logout = bearer.post(
        "/api/v1/auth/logout/",
        {},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )
    assert logout.status_code == HTTPStatus.NO_CONTENT

    cookie_setup = APIClient()
    cookie_issued = _issue_otp(cookie_setup, phone="9876543211")
    verified = cookie_setup.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": cookie_issued["challenge_id"],
            "phone_number": "+919876543211",
            "code": cookie_issued["development_code"],
            "device_identifier": "browser-1",
        },
        format="json",
    )
    assert verified.status_code == HTTPStatus.OK

    cookie_client = APIClient(enforce_csrf_checks=True)
    cookie_client.cookies[settings.SESSION_COOKIE_NAME] = cookie_setup.cookies[
        settings.SESSION_COOKIE_NAME
    ].value
    denied = cookie_client.post("/api/v1/auth/logout/", {}, format="json")
    assert denied.status_code == HTTPStatus.FORBIDDEN
    assert denied.json()["error"]["code"] == "csrf_failed"
