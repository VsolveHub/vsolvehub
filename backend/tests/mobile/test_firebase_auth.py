"""Firebase phone sign-in for the native apps: the web check, answered with a bearer token."""

import time
from collections.abc import Iterator
from http import HTTPStatus
from unittest import mock

import pytest
from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

VERIFY_URL = "/api/v1/auth/mobile/firebase/verify/"


@pytest.fixture(autouse=True)
def clear_caches() -> None:
    cache.clear()


@pytest.fixture(autouse=True)
def enable_firebase() -> Iterator[None]:
    with override_settings(FIREBASE_AUTH_ENABLED=True, FIREBASE_TOKEN_MAX_AGE_SECONDS=300):
        yield


def _claims(phone: str = "+919876543210") -> dict[str, object]:
    return {
        "firebase": {"sign_in_provider": "phone"},
        "phone_number": phone,
        "auth_time": int(time.time()),
        "sub": "firebase-uid-mobile",
    }


def _verify(client: APIClient, **overrides: object) -> object:
    body: dict[str, object] = {
        "id_token": "dummy-valid-id-token",
        "device_identifier": "install-1",
        "device_label": "Pixel 7 · Android 14",
    }
    body.update(overrides)
    return client.post(VERIFY_URL, body, format="json")


def test_returns_a_bearer_token_that_opens_the_session_and_sets_no_cookies() -> None:
    client = APIClient()
    with mock.patch("firebase_admin.auth.verify_id_token", return_value=_claims()):
        response = _verify(client)

    assert response.status_code == HTTPStatus.OK
    token = response.json()["session_token"]
    assert isinstance(token, str) and token
    assert settings.SESSION_COOKIE_NAME not in response.cookies

    current = APIClient().get("/api/v1/auth/session/", HTTP_AUTHORIZATION=f"Bearer {token}")
    assert current.status_code == HTTPStatus.OK
    assert current.json()["user"]["phone_number"] == "+919876543210"


def test_requires_the_installation_id() -> None:
    with mock.patch("firebase_admin.auth.verify_id_token", return_value=_claims()):
        response = _verify(APIClient(), device_identifier="")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "device_identifier" in response.json()["error"]["details"]


def test_an_invalid_token_is_invalid_otp() -> None:
    with mock.patch("firebase_admin.auth.verify_id_token", side_effect=ValueError("bad token")):
        response = _verify(APIClient())

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "invalid_otp"


def test_partner_role_without_an_account_is_refused() -> None:
    with mock.patch("firebase_admin.auth.verify_id_token", return_value=_claims("+919811111111")):
        response = _verify(APIClient(), intended_role="partner")

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.json()["error"]["code"] == "no_account_for_role"


@override_settings(FIREBASE_AUTH_ENABLED=False)
def test_is_not_found_while_firebase_auth_is_off() -> None:
    response = _verify(APIClient())

    assert response.status_code == HTTPStatus.NOT_FOUND
