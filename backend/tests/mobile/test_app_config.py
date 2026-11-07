"""The public app version gate."""

from collections.abc import Iterator
from http import HTTPStatus

import pytest
from django.test import override_settings
from rest_framework.response import Response
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def partner_version_gate() -> Iterator[None]:
    with override_settings(
        MOBILE_PARTNER_MIN_VERSION="1.2.0",
        MOBILE_PARTNER_LATEST_VERSION="1.4.0",
        MOBILE_PARTNER_ANDROID_STORE_URL="https://play.google.com/store/apps/details?id=partner",
    ):
        yield


def _config(version: str) -> Response:
    return APIClient().get(
        "/api/v1/mobile/app-config/",
        {"app": "partner", "platform": "android", "version": version},
    )


def test_a_version_below_the_minimum_must_update() -> None:
    response = _config("1.1.9")
    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["update_required"] is True
    assert body["minimum_version"] == "1.2.0"
    assert body["latest_version"] == "1.4.0"
    assert body["store_url"].startswith("https://play.google.com/")


def test_the_minimum_version_is_allowed() -> None:
    response = _config("1.2.0")
    assert response.status_code == HTTPStatus.OK
    assert response.json()["update_required"] is False


def test_a_newer_version_is_allowed() -> None:
    response = _config("1.2.10")
    assert response.status_code == HTTPStatus.OK
    assert response.json()["update_required"] is False


def test_an_invalid_version_is_rejected() -> None:
    response = _config("latest")
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "validation_error"
