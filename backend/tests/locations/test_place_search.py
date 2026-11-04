"""Address search for the mobile apps: Google's forward geocoding, server side."""

import json
from decimal import Decimal
from http import HTTPStatus
from typing import Any
from unittest import mock

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.locations.geocoding import GeocodingError, search_places

pytestmark = pytest.mark.django_db

SEARCH_URL = "/api/v1/geocoding/search/"


@pytest.fixture(autouse=True)
def clear_cache() -> None:
    cache.clear()


class FakeUrlResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeUrlResponse":
        return self

    def __exit__(self, *args: object) -> None:
        del args

    def read(self) -> bytes:
        return json.dumps(self.payload).encode()


def _google(results: list[dict[str, Any]], status: str = "OK") -> FakeUrlResponse:
    return FakeUrlResponse({"status": status, "results": results})


def _result(label: str, lat: float, lng: float, types: list[str] | None = None) -> dict[str, Any]:
    return {
        "formatted_address": label,
        "geometry": {"location": {"lat": lat, "lng": lng}},
        "types": types or ["street_address"],
    }


@override_settings(GEOCODING_PROVIDER="google", GOOGLE_MAPS_SERVER_KEY="server-key")
def test_returns_labels_and_pins_and_skips_plus_codes() -> None:
    payload = _google(
        [
            _result("7J9W+2X Hyderabad", 17.4, 78.3, types=["plus_code"]),
            _result("Khajaguda, Hyderabad, Telangana 500008, India", 17.4140531, 78.3535541),
        ]
    )
    with mock.patch("apps.locations.geocoding.urlopen", return_value=payload) as opened:
        response = APIClient().get(SEARCH_URL, {"q": "Khajaguda"})

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {
        "results": [
            {
                "label": "Khajaguda, Hyderabad, Telangana 500008, India",
                "latitude": "17.414053",
                "longitude": "78.353554",
            }
        ]
    }
    url = opened.call_args.args[0].full_url
    assert "components=country%3AIN" in url


@override_settings(GEOCODING_PROVIDER="google", GOOGLE_MAPS_SERVER_KEY="server-key")
def test_no_match_is_an_empty_list_not_an_error() -> None:
    with mock.patch("apps.locations.geocoding.urlopen", return_value=_google([], "ZERO_RESULTS")):
        response = APIClient().get(SEARCH_URL, {"q": "nowhere at all"})

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {"results": []}


@override_settings(GEOCODING_PROVIDER="google", GOOGLE_MAPS_SERVER_KEY="server-key")
def test_the_same_query_is_answered_from_cache() -> None:
    payload = _google([_result("Gachibowli, Hyderabad", 17.44, 78.35)])
    with mock.patch("apps.locations.geocoding.urlopen", return_value=payload) as opened:
        first = search_places(query="Gachibowli")
        second = search_places(query="  gachibowli ")

    assert first == second
    assert first[0].latitude == Decimal("17.440000")
    assert opened.call_count == 1


def test_too_short_a_query_is_refused() -> None:
    response = APIClient().get(SEARCH_URL, {"q": "ab"})

    assert response.status_code == HTTPStatus.BAD_REQUEST


@override_settings(GEOCODING_PROVIDER="unconfigured")
def test_without_a_provider_it_is_unavailable() -> None:
    with pytest.raises(GeocodingError):
        search_places(query="Gachibowli")
    response = APIClient().get(SEARCH_URL, {"q": "Gachibowli"})

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "geocoding_unavailable"
