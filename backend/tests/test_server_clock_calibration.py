"""Proposal 0010 — the browser must be able to read the server's clock.

Every deadline this product renders is measured against a server instant. A browser can
only read a response header the server names in `Access-Control-Expose-Headers`, and
`Date` is not CORS-safelisted, so an unexposed `Date` makes each countdown fall back to
the device clock with no error, no log and no visible difference.

These tests assert the two facts a cross-origin browser depends on: the header is on the
wire, and an allowed credentialed origin is told it may read it. A rejected origin must
receive neither.
"""

import importlib
import os
import sys
from collections.abc import Callable, Iterator
from email.utils import parsedate_to_datetime
from http import HTTPStatus
from types import ModuleType
from typing import Any

import pytest
import requests
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings
from rest_framework.test import APIClient

ALLOWED_ORIGIN = "https://partner.example.test"
REJECTED_ORIGIN = "https://attacker.example.test"
LIVE_SERVER_TIMEOUT_SECONDS = 10

PRODUCTION_ENVIRONMENT = {
    "DJANGO_SECRET_KEY": "p" * 64,
    "DJANGO_ALLOWED_HOSTS": "api.example.test",
    "CORS_ALLOWED_ORIGINS": "https://partner.example.test",
    "DJANGO_CSRF_TRUSTED_ORIGINS": "https://partner.example.test",
    "CORS_EXPOSE_HEADERS": "Date",
    "OTP_PROVIDER": "msg91",
    "OTP_DEVELOPMENT_CODE_ENABLED": "false",
    "GEOCODING_PROVIDER": "google",
    "GOOGLE_MAPS_SERVER_KEY": "google-server-key",
    "PARTNER_LEGAL_BASE_URL": "https://partner.example.test",
    "DOCUMENT_STORAGE_PROVIDER": "supabase",
    "SUPABASE_STORAGE_URL": "https://project.storage.supabase.co/storage/v1",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
    "PARTNER_DOCUMENT_BUCKET": "partner-kyc",
    "R2_ACCOUNT_ID": "account",
    "R2_ACCESS_KEY_ID": "r2-key",
    "R2_SECRET_ACCESS_KEY": "r2-secret",
    "R2_PUBLIC_BUCKET": "vsolve-public",
    "R2_PUBLIC_BASE_URL": "https://media.example.test",
    "R2_PRIVATE_BUCKET": "vsolve-private",
    "PAYMENT_PROVIDER": "razorpay",
    "RAZORPAY_KEY_ID": "rzp_live_key",
    "RAZORPAY_KEY_SECRET": "rzp_live_secret",
    "PAYMENT_WEBHOOK_SECRET": "w" * 40,
    "PAYMENT_LIVE_COLLECTIONS_APPROVED": "true",
}

ProductionSettingsLoader = Callable[..., ModuleType]


def _exposed_headers(response: Any) -> set[str]:
    """The exposed-header list, lowercased.

    Header names are case-insensitive per RFC 9110, and a browser's
    `Headers.get("date")` is case-insensitive too, so the assertion must be as well.
    """
    raw = response.headers.get("Access-Control-Expose-Headers", "")
    return {name.strip().lower() for name in raw.split(",") if name.strip()}


@pytest.fixture
def production_settings() -> Iterator[ProductionSettingsLoader]:
    """Loads `config.settings.production` under a controlled environment.

    Production settings validate at import time, so the only way to exercise the guard
    is to import the module again. The original modules and environment are restored
    afterwards so no other test observes a re-imported settings object.
    """
    preserved_modules = {
        name: sys.modules[name]
        for name in ("config.settings.base", "config.settings.production")
        if name in sys.modules
    }
    preserved_environment = dict(os.environ)

    def load(**overrides: str) -> ModuleType:
        os.environ.update({**PRODUCTION_ENVIRONMENT, **overrides})
        for name in ("config.settings.base", "config.settings.production"):
            sys.modules.pop(name, None)
        return importlib.import_module("config.settings.production")

    try:
        yield load
    finally:
        os.environ.clear()
        os.environ.update(preserved_environment)
        for name in ("config.settings.base", "config.settings.production"):
            sys.modules.pop(name, None)
        sys.modules.update(preserved_modules)


@override_settings(
    CORS_ALLOWED_ORIGINS=[ALLOWED_ORIGIN],
    CSRF_TRUSTED_ORIGINS=[ALLOWED_ORIGIN],
)
def test_allowed_credentialed_origin_may_read_the_date_header() -> None:
    response = APIClient().get("/api/v1/auth/csrf/", HTTP_ORIGIN=ALLOWED_ORIGIN)

    assert response.status_code == HTTPStatus.OK
    assert response.headers["Access-Control-Allow-Origin"] == ALLOWED_ORIGIN
    assert response.headers["Access-Control-Allow-Credentials"] == "true"
    assert "Access-Control-Expose-Headers" in response.headers
    assert "date" in _exposed_headers(response)


@override_settings(
    CORS_ALLOWED_ORIGINS=[ALLOWED_ORIGIN],
    CSRF_TRUSTED_ORIGINS=[ALLOWED_ORIGIN],
)
def test_exposed_header_list_matches_date_case_insensitively() -> None:
    """`Date` is published in canonical casing; a browser lookup is case-insensitive."""
    response = APIClient().get("/api/v1/auth/csrf/", HTTP_ORIGIN=ALLOWED_ORIGIN)

    exposed = _exposed_headers(response)
    assert "Date" in response.headers["Access-Control-Expose-Headers"]
    assert "date" in exposed
    assert "DATE" in {name.upper() for name in exposed}


@override_settings(
    CORS_ALLOWED_ORIGINS=[ALLOWED_ORIGIN],
    CSRF_TRUSTED_ORIGINS=[ALLOWED_ORIGIN],
)
def test_rejected_origin_receives_no_credentialed_cors_access() -> None:
    """Exposing a header must not widen who is allowed to read the response."""
    response = APIClient().get("/api/v1/auth/csrf/", HTTP_ORIGIN=REJECTED_ORIGIN)

    assert "Access-Control-Allow-Origin" not in response.headers
    assert "Access-Control-Allow-Credentials" not in response.headers
    assert "Access-Control-Expose-Headers" not in response.headers

    preflight = APIClient().options(
        "/api/v1/partner/offers/",
        HTTP_ORIGIN=REJECTED_ORIGIN,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
    )
    assert "Access-Control-Allow-Origin" not in preflight.headers
    assert "Access-Control-Expose-Headers" not in preflight.headers


@pytest.mark.django_db
@override_settings(
    CORS_ALLOWED_ORIGINS=[ALLOWED_ORIGIN],
    CSRF_TRUSTED_ORIGINS=[ALLOWED_ORIGIN],
)
def test_exposing_date_does_not_change_csrf_or_session_behaviour() -> None:
    """The BE-01 CSRF bootstrap and anonymous session contract must be untouched."""
    cache.clear()
    client = APIClient(enforce_csrf_checks=True)

    bootstrap = client.get("/api/v1/auth/csrf/", HTTP_ORIGIN=ALLOWED_ORIGIN)
    assert bootstrap.status_code == HTTPStatus.OK
    csrf_token = bootstrap.json()["csrf_token"]
    assert csrf_token
    assert client.cookies[settings.CSRF_COOKIE_NAME]["httponly"] is True

    issued = client.post(
        "/api/v1/auth/otp/request/",
        {"phone_number": "9876543210"},
        format="json",
    ).json()
    verified = client.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": issued["challenge_id"],
            "phone_number": "+919876543210",
            "code": issued["development_code"],
        },
        format="json",
        HTTP_ORIGIN=ALLOWED_ORIGIN,
    )
    assert verified.status_code == HTTPStatus.OK

    # A session cookie is not sufficient on its own: the CSRF token is still required.
    without_token = client.post(
        "/api/v1/auth/privacy/consents/",
        {"purpose": "privacy-notice", "policy_version": "v1"},
        format="json",
        HTTP_ORIGIN=ALLOWED_ORIGIN,
    )
    assert without_token.status_code == HTTPStatus.FORBIDDEN
    assert without_token.json()["error"]["code"] == "csrf_failed"

    refreshed = client.get("/api/v1/auth/csrf/", HTTP_ORIGIN=ALLOWED_ORIGIN)
    accepted = client.post(
        "/api/v1/auth/privacy/consents/",
        {"purpose": "privacy-notice", "policy_version": "v1"},
        format="json",
        HTTP_ORIGIN=ALLOWED_ORIGIN,
        HTTP_X_CSRFTOKEN=refreshed.json()["csrf_token"],
    )
    assert accepted.status_code == HTTPStatus.CREATED

    anonymous_session = APIClient().get("/api/v1/auth/session/", HTTP_ORIGIN=ALLOWED_ORIGIN)
    assert anonymous_session.status_code == HTTPStatus.OK
    assert anonymous_session.json()["user"] is None


@pytest.mark.django_db(transaction=True)
def test_real_cross_origin_response_carries_a_readable_date_header(live_server: Any) -> None:
    """End-to-end proof over real HTTP, which is where `Date` is actually written.

    The Django test client never passes through a WSGI server, so it can only prove the
    browser would be permitted to read the header. This runs a real server and asserts
    both halves of what a cross-origin `fetch` needs: a parseable `Date` on the wire and
    an expose list that names it.
    """
    with override_settings(
        CORS_ALLOWED_ORIGINS=[ALLOWED_ORIGIN],
        CSRF_TRUSTED_ORIGINS=[ALLOWED_ORIGIN],
    ):
        response = requests.get(
            f"{live_server.url}/api/v1/auth/csrf/",
            headers={"Origin": ALLOWED_ORIGIN},
            timeout=LIVE_SERVER_TIMEOUT_SECONDS,
        )

    assert response.status_code == HTTPStatus.OK
    assert response.headers["Access-Control-Allow-Origin"] == ALLOWED_ORIGIN
    assert response.headers["Access-Control-Allow-Credentials"] == "true"
    assert "date" in _exposed_headers(response)
    assert parsedate_to_datetime(response.headers["Date"]) is not None


def test_production_requires_date_to_stay_exposed(
    production_settings: ProductionSettingsLoader,
) -> None:
    assert "Date" in production_settings().CORS_EXPOSE_HEADERS

    with pytest.raises(ImproperlyConfigured, match="CORS_EXPOSE_HEADERS must include Date"):
        production_settings(CORS_EXPOSE_HEADERS="X-Request-Id")


def test_production_accepts_additional_exposed_headers_alongside_date(
    production_settings: ProductionSettingsLoader,
) -> None:
    loaded = production_settings(CORS_EXPOSE_HEADERS="x-request-id,date")

    assert loaded.CORS_EXPOSE_HEADERS == ["x-request-id", "date"]
