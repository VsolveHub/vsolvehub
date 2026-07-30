import json
from decimal import Decimal
from http import HTTPStatus

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.locations.geocoding import (
    GeocodedAddress,
    GeocodingError,
    NominatimReverseGeocoder,
    UnconfiguredReverseGeocoder,
)

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


def test_nominatim_adapter_maps_provider_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "apps.locations.geocoding.urlopen",
        lambda *_args, **_kwargs: FakeUrlResponse(
            {
                "display_name": "10 Vsolve Road, Khajaguda, Hyderabad",
                "address": {
                    "house_number": "10",
                    "road": "Vsolve Road",
                    "suburb": "Khajaguda",
                    "city": "Hyderabad",
                    "state": "Telangana",
                    "postcode": "500032",
                    "country_code": "in",
                },
            },
        ),
    )

    result = NominatimReverseGeocoder().reverse(
        latitude=Decimal("17.414053"),
        longitude=Decimal("78.353554"),
    )

    assert result.line1 == "10 Vsolve Road"
    assert result.locality == "Khajaguda"
    assert result.postal_code == "500032"
    assert result.country_code == "IN"


def test_unconfigured_geocoder_never_invents_an_address() -> None:
    with pytest.raises(GeocodingError):
        UnconfiguredReverseGeocoder().reverse(
            latitude=Decimal("17.414053"),
            longitude=Decimal("78.353554"),
        )
