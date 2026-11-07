"""Push device registration."""

from http import HTTPStatus

import pytest
from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.test import APIClient

from apps.mobile.models import PushDevice

pytestmark = pytest.mark.django_db

TOKEN = "ExponentPushToken[partner-phone]"  # noqa: S105


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


def _bearer(phone: str = "9876543210") -> str:
    client = APIClient()
    issued = client.post(
        "/api/v1/auth/otp/request/",
        {"phone_number": phone, "device_identifier": f"install-{phone}"},
        format="json",
    )
    assert issued.status_code == HTTPStatus.ACCEPTED
    verified = client.post(
        "/api/v1/auth/mobile/otp/verify/",
        {
            "challenge_id": issued.json()["challenge_id"],
            "phone_number": f"+91{phone}",
            "code": issued.json()["development_code"],
            "device_identifier": f"install-{phone}",
        },
        format="json",
    )
    assert verified.status_code == HTTPStatus.OK
    token = verified.json()["session_token"]
    assert isinstance(token, str)
    return token


def _register(token: str, push_token: str = TOKEN) -> Response:
    client = APIClient()
    return client.post(
        "/api/v1/mobile/devices/",
        {
            "expo_push_token": push_token,
            "app": "partner",
            "platform": "android",
            "app_version": "1.0.0",
        },
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )


def test_register_is_idempotent_and_rebinds_the_token() -> None:
    first = _bearer()
    created = _register(first)
    assert created.status_code == HTTPStatus.OK
    body = created.json()
    assert body["app"] == "partner"
    assert body["platform"] == "android"
    assert body["app_version"] == "1.0.0"

    again = _register(first)
    assert again.status_code == HTTPStatus.OK
    assert again.json()["id"] == body["id"]
    assert PushDevice.objects.count() == 1

    second = _bearer("9876543211")
    rebound = _register(second)
    assert rebound.status_code == HTTPStatus.OK
    device = PushDevice.objects.get(expo_push_token=TOKEN)
    assert str(device.id) == body["id"]
    assert device.user.phone_number == "+919876543211"
    assert device.disabled_at is None


def test_unregister_disables_only_the_callers_token() -> None:
    owner = _bearer()
    _register(owner)
    other = _bearer("9876543212")
    client = APIClient()
    hidden = client.post(
        "/api/v1/mobile/devices/unregister/",
        {"expo_push_token": TOKEN},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {other}",
    )
    assert hidden.status_code == HTTPStatus.NO_CONTENT
    assert PushDevice.objects.get(expo_push_token=TOKEN).disabled_at is None

    unknown = client.post(
        "/api/v1/mobile/devices/unregister/",
        {"expo_push_token": "ExponentPushToken[missing]"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {owner}",
    )
    assert unknown.status_code == HTTPStatus.NO_CONTENT

    removed = client.post(
        "/api/v1/mobile/devices/unregister/",
        {"expo_push_token": TOKEN},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {owner}",
    )
    assert removed.status_code == HTTPStatus.NO_CONTENT
    assert PushDevice.objects.get(expo_push_token=TOKEN).disabled_at is not None


def test_device_routes_require_a_session() -> None:
    client = APIClient()
    response = client.post("/api/v1/mobile/devices/", {}, format="json")
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "not_authenticated"
