"""The Google Routes API adapter behind the Partner map (1.96.0)."""

import io
import json
from decimal import Decimal
from typing import Any
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import override_settings

from apps.locations.routing import RoutingError, compute_route

ORIGIN = (Decimal("17.400000"), Decimal("78.340000"))
DESTINATION = (Decimal("17.414053"), Decimal("78.353554"))
URLOPEN = "apps.locations.routing.urlopen"


class _Response(io.BytesIO):
    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


def _reply(payload: dict[str, Any]) -> _Response:
    return _Response(json.dumps(payload).encode("utf-8"))


@pytest.fixture(autouse=True)
def google(settings: Any) -> None:
    cache.clear()
    settings.GEOCODING_PROVIDER = "google"
    settings.GOOGLE_MAPS_SERVER_KEY = "server-key"


def test_a_route_is_read_and_the_key_stays_out_of_the_url() -> None:
    reply = {
        "routes": [
            {"distanceMeters": 2800, "duration": "420s", "polyline": {"encodedPolyline": "abc"}}
        ]
    }
    with patch(URLOPEN, return_value=_reply(reply)) as urlopen:
        route = compute_route(origin=ORIGIN, destination=DESTINATION)

    assert (route.distance_meters, route.duration_seconds, route.encoded_polyline) == (
        2800,
        420,
        "abc",
    )
    request = urlopen.call_args.args[0]
    assert "server-key" not in request.full_url
    assert request.get_header("X-goog-api-key") == "server-key"
    assert json.loads(request.data)["travelMode"] == "TWO_WHEELER"


def test_a_repeat_from_nearly_the_same_spot_is_served_from_cache() -> None:
    reply = {"routes": [{"duration": "0s", "polyline": {"encodedPolyline": "abc"}}]}
    with patch(URLOPEN, return_value=_reply(reply)) as urlopen:
        first = compute_route(origin=ORIGIN, destination=DESTINATION)
        nearby = (Decimal("17.400200"), Decimal("78.340100"))
        second = compute_route(origin=nearby, destination=DESTINATION)

    assert urlopen.call_count == 1
    assert first == second
    assert first.distance_meters == 0, "Google omits a zero distance; it is not an error."


def test_no_route_is_a_safe_error() -> None:
    with patch(URLOPEN, return_value=_reply({})), pytest.raises(RoutingError):
        compute_route(origin=ORIGIN, destination=DESTINATION)


@override_settings(GEOCODING_PROVIDER="unconfigured")
def test_without_a_provider_nothing_is_called() -> None:
    with patch(URLOPEN) as urlopen, pytest.raises(RoutingError):
        compute_route(origin=ORIGIN, destination=DESTINATION)
    urlopen.assert_not_called()
