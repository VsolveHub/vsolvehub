"""Routing adapter: provider selection, the fake estimate, and Google's reply, retry and failures.

Google is never called: `urlopen` is replaced for every Google test.
"""

import io
import json
from collections.abc import Iterator
from decimal import Decimal
from typing import Any
from urllib.error import HTTPError, URLError

import pytest
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from pytest_django.fixtures import SettingsWrapper

from apps.rides import routing
from apps.rides.models import VehicleType
from apps.rides.routing import (
    Route,
    RoutingUnavailableError,
    check_routing_provider,
    encode_polyline,
    get_route,
)

PICKUP = (Decimal("17.385000"), Decimal("78.486700"))
DROP = (Decimal("17.395000"), Decimal("78.486700"))  # about 1.1 km north

GOOGLE_REPLY = {
    "routes": [{"distanceMeters": 2700, "duration": "420s", "polyline": {"encodedPolyline": "abc"}}]
}


@pytest.fixture(autouse=True)
def _clear_cache() -> Iterator[None]:
    cache.clear()
    yield
    cache.clear()


class FakeUrlopen:
    """Plays back replies in order. Each reply is a dict (sent as JSON) or an exception."""

    def __init__(self, *replies: object) -> None:
        self.replies = list(replies)
        self.requests: list[Any] = []

    def __call__(self, request: Any, timeout: float) -> io.BytesIO:
        self.requests.append(request)
        self.timeout = timeout
        reply = self.replies.pop(0)
        if isinstance(reply, BaseException):
            raise reply
        return io.BytesIO(json.dumps(reply).encode())


def use_google(
    settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch, *replies: object
) -> FakeUrlopen:
    settings.RIDES_ROUTING_PROVIDER = "google"
    settings.GOOGLE_MAPS_SERVER_KEY = "test-key"
    fake = FakeUrlopen(*replies)
    monkeypatch.setattr(routing, "urlopen", fake)
    return fake


def http_error(code: int) -> HTTPError:
    return HTTPError(routing.GOOGLE_ROUTES_URL, code, "error", {}, None)  # type: ignore[arg-type]


# --- provider selection -----------------------------------------------------------------------


def test_unconfigured_refuses_every_call(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "unconfigured"
    with pytest.raises(RoutingUnavailableError):
        get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)


def test_unknown_vehicle_type_is_rejected(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"
    with pytest.raises(ValueError):
        get_route(pickup=PICKUP, drop=DROP, vehicle_type="TRUCK")


def test_fake_is_refused_without_debug(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"
    settings.DEBUG = False
    with pytest.raises(ImproperlyConfigured):
        check_routing_provider()


def test_fake_is_allowed_with_debug(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"
    settings.DEBUG = True
    check_routing_provider()


def test_google_is_allowed_without_debug(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "google"
    settings.DEBUG = False
    check_routing_provider()


# --- fake provider ----------------------------------------------------------------------------


def test_fake_route_is_road_distance_at_city_speed(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"
    route = get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    # 1112 m straight x 1.3 = about 1446 m; at 25 km/h that is about 208 s.
    assert 1440 <= route.distance_m <= 1450
    assert 205 <= route.duration_s <= 210
    assert route.encoded_polyline == encode_polyline([PICKUP, DROP])


def test_fake_route_is_the_same_every_time(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"
    first = get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.CAB)
    assert get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.CAB) == first


def test_fake_bike_is_faster_than_cab(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"
    bike = get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    cab = get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.CAB)
    assert bike.distance_m == cab.distance_m
    assert bike.duration_s < cab.duration_s


def test_fake_route_for_the_same_point_is_zero(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"
    route = get_route(pickup=PICKUP, drop=PICKUP, vehicle_type=VehicleType.AUTO)
    assert (route.distance_m, route.duration_s) == (0, 0)


def test_polyline_encoder_matches_googles_documented_example() -> None:
    points = [
        (Decimal("38.5"), Decimal("-120.2")),
        (Decimal("40.7"), Decimal("-120.95")),
        (Decimal("43.252"), Decimal("-126.453")),
    ]
    assert encode_polyline(points) == "_p~iF~ps|U_ulLnnqC_mqNvxq`@"


# --- Google -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("vehicle_type", "mode"),
    [(VehicleType.BIKE, "TWO_WHEELER"), (VehicleType.AUTO, "DRIVE"), (VehicleType.CAB, "DRIVE")],
)
def test_google_travel_mode_per_vehicle(
    settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch, vehicle_type: str, mode: str
) -> None:
    fake = use_google(settings, monkeypatch, GOOGLE_REPLY)
    get_route(pickup=PICKUP, drop=DROP, vehicle_type=vehicle_type)
    assert json.loads(fake.requests[0].data)["travelMode"] == mode


def test_google_reply_is_read_into_a_route(
    settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_google(settings, monkeypatch, GOOGLE_REPLY)
    route = get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    assert route == Route(distance_m=2700, duration_s=420, encoded_polyline="abc")


def test_google_key_is_sent_in_a_header_not_the_url(
    settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = use_google(settings, monkeypatch, GOOGLE_REPLY)
    get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    request = fake.requests[0]
    assert request.get_header("X-goog-api-key") == "test-key"
    assert "test-key" not in request.full_url
    assert fake.timeout == 3.0


def test_google_route_is_cached(settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = use_google(settings, monkeypatch, GOOGLE_REPLY)
    get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    assert len(fake.requests) == 1


def test_google_cache_is_per_travel_mode(
    settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = use_google(settings, monkeypatch, GOOGLE_REPLY, GOOGLE_REPLY)
    get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.CAB)
    assert len(fake.requests) == 2


@pytest.mark.parametrize("failure", [URLError("down"), TimeoutError(), http_error(503)])
def test_google_retries_once_after_a_passing_failure(
    settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch, failure: Exception
) -> None:
    fake = use_google(settings, monkeypatch, failure, GOOGLE_REPLY)
    route = get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    assert route.distance_m == 2700
    assert len(fake.requests) == 2


def test_google_gives_up_after_the_retry(
    settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = use_google(settings, monkeypatch, URLError("down"), URLError("still down"))
    with pytest.raises(RoutingUnavailableError):
        get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    assert len(fake.requests) == 2


def test_google_does_not_retry_a_client_error(
    settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = use_google(settings, monkeypatch, http_error(403))
    with pytest.raises(RoutingUnavailableError):
        get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
    assert len(fake.requests) == 1


@pytest.mark.parametrize(
    "reply",
    [
        {},
        {"routes": []},
        {"routes": [{"distanceMeters": 10, "duration": "5s"}]},  # no polyline
        {"routes": [{"distanceMeters": 10, "polyline": {"encodedPolyline": "x"}}]},  # no duration
    ],
)
def test_google_incomplete_reply_is_unavailable(
    settings: SettingsWrapper, monkeypatch: pytest.MonkeyPatch, reply: dict[str, Any]
) -> None:
    use_google(settings, monkeypatch, reply)
    with pytest.raises(RoutingUnavailableError):
        get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)


def test_google_without_a_key_is_unavailable(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "google"
    settings.GOOGLE_MAPS_SERVER_KEY = ""
    with pytest.raises(RoutingUnavailableError):
        get_route(pickup=PICKUP, drop=DROP, vehicle_type=VehicleType.BIKE)
