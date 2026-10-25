import json
from decimal import Decimal
from http import HTTPStatus
from typing import Any
from urllib.request import Request

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.locations.geocoding import (
    GeocodedAddress,
    GeocodingError,
    GoogleReverseGeocoder,
    UnconfiguredReverseGeocoder,
    get_reverse_geocoder,
)
from apps.locations.pins import directions_url

pytestmark = pytest.mark.django_db


class FakeGeocoder:
    calls = 0

    def reverse(self, *, latitude: Decimal, longitude: Decimal) -> GeocodedAddress:
        self.calls += 1
        return GeocodedAddress(
            formatted_address="Khajaguda, Hyderabad, Telangana 500032",
            line1="Vsolve Street",
            locality="Khajaguda",
            city="Hyderabad",
            state="Telangana",
            postal_code="500032",
            country_code="IN",
            latitude=latitude,
            longitude=longitude,
            provider="fake",
        )


class FailingGeocoder:
    def reverse(self, *, latitude: Decimal, longitude: Decimal) -> GeocodedAddress:
        del latitude, longitude
        raise GeocodingError("provider timeout")


class FakeUrlResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeUrlResponse":
        return self

    def __exit__(self, *args: object) -> None:
        del args

    def read(self) -> bytes:
        return json.dumps(self.payload).encode()


def test_reverse_geocode_normalizes_and_caches(monkeypatch: pytest.MonkeyPatch) -> None:
    cache.clear()
    fake = FakeGeocoder()
    monkeypatch.setattr("apps.locations.geocoding.get_reverse_geocoder", lambda: fake)
    payload = {"latitude": "17.414053", "longitude": "78.353554"}

    first = APIClient().post("/api/v1/geocoding/reverse/", payload, format="json")
    second = APIClient().post("/api/v1/geocoding/reverse/", payload, format="json")

    assert first.status_code == HTTPStatus.OK
    assert first.json()["postal_code"] == "500032"
    assert first.json()["city"] == "Hyderabad"
    assert second.status_code == HTTPStatus.OK
    assert fake.calls == 1


def test_reverse_geocode_failure_is_fast_recoverable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache.clear()
    monkeypatch.setattr(
        "apps.locations.geocoding.get_reverse_geocoder",
        FailingGeocoder,
    )

    response = APIClient().post(
        "/api/v1/geocoding/reverse/",
        {"latitude": "17.414053", "longitude": "78.353554"},
        format="json",
    )

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "geocoding_unavailable"
    assert "manually" in response.json()["error"]["details"]["message"].lower()


GOOGLE_OK = {
    "status": "OK",
    "results": [
        {
            "types": ["plus_code"],
            "formatted_address": "9WG3+2X Hyderabad, Telangana",
            "address_components": [],
        },
        {
            "types": ["street_address"],
            "formatted_address": "10, Vsolve Road, Khajaguda, Hyderabad, Telangana 500032, India",
            "address_components": [
                {"long_name": "10", "short_name": "10", "types": ["street_number"]},
                {"long_name": "Vsolve Road", "short_name": "Vsolve Rd", "types": ["route"]},
                {
                    "long_name": "Khajaguda",
                    "short_name": "Khajaguda",
                    "types": ["sublocality_level_1", "sublocality", "political"],
                },
                {"long_name": "Hyderabad", "short_name": "Hyderabad", "types": ["locality"]},
                {
                    "long_name": "Telangana",
                    "short_name": "TG",
                    "types": ["administrative_area_level_1", "political"],
                },
                {"long_name": "India", "short_name": "IN", "types": ["country", "political"]},
                {"long_name": "500032", "short_name": "500032", "types": ["postal_code"]},
            ],
        },
    ],
}


def _serve(monkeypatch: pytest.MonkeyPatch, payload: dict[str, object]) -> list[str]:
    """Answers every provider request with ``payload`` and records the URLs asked for."""
    urls: list[str] = []

    def fake_urlopen(request: Request, **_kwargs: object) -> FakeUrlResponse:
        urls.append(request.full_url)
        return FakeUrlResponse(payload)

    monkeypatch.setattr("apps.locations.geocoding.urlopen", fake_urlopen)
    return urls


@pytest.fixture
def google_key(settings: Any) -> None:
    settings.GOOGLE_MAPS_SERVER_KEY = "server-key"


@pytest.mark.usefixtures("google_key")
def test_google_adapter_maps_provider_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    urls = _serve(monkeypatch, GOOGLE_OK)

    result = GoogleReverseGeocoder().reverse(
        latitude=Decimal("17.414053"),
        longitude=Decimal("78.353554"),
    )

    assert result.line1 == "10 Vsolve Road"
    assert result.locality == "Khajaguda"
    assert result.city == "Hyderabad"
    # The full state name, not Google's short code: `Address.state` holds a name.
    assert result.state == "Telangana"
    assert result.postal_code == "500032"
    assert result.country_code == "IN"
    assert result.provider == "google"
    assert "latlng=17.414053%2C78.353554" in urls[0]
    assert urls[0].startswith("https://maps.googleapis.com/maps/api/geocode/json?")


@pytest.mark.usefixtures("google_key")
def test_google_adapter_skips_a_bare_plus_code(monkeypatch: pytest.MonkeyPatch) -> None:
    _serve(monkeypatch, GOOGLE_OK)

    result = GoogleReverseGeocoder().reverse(
        latitude=Decimal("17.414053"),
        longitude=Decimal("78.353554"),
    )

    assert result.formatted_address.startswith("10, Vsolve Road")


@pytest.mark.usefixtures("google_key")
def test_google_adapter_returns_the_pin_not_the_result_geometry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(monkeypatch, GOOGLE_OK)

    result = GoogleReverseGeocoder().reverse(
        latitude=Decimal("17.414053"),
        longitude=Decimal("78.353554"),
    )

    assert (result.latitude, result.longitude) == (Decimal("17.414053"), Decimal("78.353554"))


@pytest.mark.usefixtures("google_key")
@pytest.mark.parametrize(
    "payload",
    [
        {"status": "ZERO_RESULTS", "results": []},
        {"status": "REQUEST_DENIED", "error_message": "The provided API key is invalid."},
        {"status": "OVER_QUERY_LIMIT", "results": []},
        {"status": "OK", "results": [{"types": ["plus_code"], "formatted_address": "x"}]},
        {"status": "OK", "results": "not a list"},
    ],
)
def test_google_adapter_failures_are_recoverable_errors(
    monkeypatch: pytest.MonkeyPatch,
    payload: dict[str, object],
) -> None:
    _serve(monkeypatch, payload)

    with pytest.raises(GeocodingError) as raised:
        GoogleReverseGeocoder().reverse(
            latitude=Decimal("17.414053"),
            longitude=Decimal("78.353554"),
        )

    # Google's own message can echo the request; it is never passed on.
    assert "API key" not in str(raised.value)


def test_google_adapter_without_a_key_refuses_before_calling_out(
    monkeypatch: pytest.MonkeyPatch,
    settings: Any,
) -> None:
    settings.GOOGLE_MAPS_SERVER_KEY = ""
    urls = _serve(monkeypatch, GOOGLE_OK)

    with pytest.raises(GeocodingError):
        GoogleReverseGeocoder().reverse(
            latitude=Decimal("17.414053"),
            longitude=Decimal("78.353554"),
        )

    assert urls == []


@pytest.mark.parametrize(
    ("provider", "expected"),
    [
        ("google", GoogleReverseGeocoder),
        ("unconfigured", UnconfiguredReverseGeocoder),
        # The retired provider is not quietly kept alive under its old name.
        ("nominatim", UnconfiguredReverseGeocoder),
    ],
)
def test_provider_selection_fails_closed(
    settings: Any,
    provider: str,
    expected: type,
) -> None:
    settings.GEOCODING_PROVIDER = provider

    assert isinstance(get_reverse_geocoder(), expected)


def test_unconfigured_geocoder_never_invents_an_address() -> None:
    with pytest.raises(GeocodingError):
        UnconfiguredReverseGeocoder().reverse(
            latitude=Decimal("17.414053"),
            longitude=Decimal("78.353554"),
        )


def test_directions_route_to_the_pin() -> None:
    assert directions_url(Decimal("17.494500"), Decimal("78.399200")) == (
        "https://www.google.com/maps/dir/?api=1&destination=17.494500,78.399200"
    )


def test_no_route_without_a_pin() -> None:
    assert directions_url(None, None) == ""
    assert directions_url(Decimal("17.4945"), None) == ""
