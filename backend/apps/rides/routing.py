"""Road distance, time and route line for a ride (brief §4, ADR-0004).

`RIDES_ROUTING_PROVIDER` picks the source explicitly:
- "google": the Routes API, server side only. Bike asks for TWO_WHEELER, auto and cab for DRIVE.
- "fake": a deterministic estimate for laptops and tests. Production refuses to boot with it.
- anything else ("unconfigured", the default): every call is refused.

There is no straight-line fallback for a real ride: if Google fails, the caller answers
`503 routing_unavailable`. Coordinates are never logged, and the key travels in a header, never
in the URL.
"""

import hashlib
import json
import math
import re
from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import cast
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured

from apps.rides.models import VehicleType

__all__ = [
    "Route",
    "RoutingUnavailableError",
    "check_routing_provider",
    "encode_polyline",
    "get_route",
]

Point = tuple[Decimal, Decimal]

GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
_FIELD_MASK = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
_DURATION = re.compile(r"^(\d+)(?:\.\d+)?s$")
TIMEOUT_SECONDS = 3.0
ATTEMPTS = 2  # the call plus one retry
CACHE_SECONDS = 60
_SERVER_ERROR = 500
# Encoded polyline: 5-bit chunks, a continuation bit, then an ASCII offset.
_CHUNK_BITS = 5
_CHUNK_MASK = 0x1F
_CONTINUE = 0x20
_ASCII_OFFSET = 63

TRAVEL_MODES: dict[str, str] = {
    VehicleType.BIKE: "TWO_WHEELER",
    VehicleType.AUTO: "DRIVE",
    VehicleType.CAB: "DRIVE",
}

# Fake provider: roads are about 1.3x the straight line; city speeds in km/h.
_FAKE_ROAD_FACTOR = 1.3
_FAKE_SPEED_KMH: dict[str, int] = {
    VehicleType.BIKE: 25,
    VehicleType.AUTO: 20,
    VehicleType.CAB: 20,
}


class RoutingUnavailableError(RuntimeError):
    """No route could be had. The API answers `503 routing_unavailable`; nothing is guessed."""


@dataclass(frozen=True, slots=True)
class Route:
    distance_m: int
    duration_s: int
    encoded_polyline: str


def _provider() -> str:
    return cast(str, settings.RIDES_ROUTING_PROVIDER).lower()


def check_routing_provider() -> None:
    """Startup guard: a server without DEBUG must never price rides on fake distances."""
    if _provider() == "fake" and not settings.DEBUG:
        raise ImproperlyConfigured("RIDES_ROUTING_PROVIDER must not be 'fake' outside DEBUG.")


def get_route(*, pickup: Point, drop: Point, vehicle_type: str) -> Route:
    if vehicle_type not in TRAVEL_MODES:
        raise ValueError(f"Unknown vehicle type: {vehicle_type}")

    provider = _provider()
    if provider == "fake":
        return _fake_route(pickup, drop, vehicle_type)
    if provider == "google":
        return _google_route(pickup, drop, TRAVEL_MODES[vehicle_type])
    raise RoutingUnavailableError("No routing provider is configured.")


# --- Google -----------------------------------------------------------------------------------


def _cache_key(pickup: Point, drop: Point, mode: str) -> str:
    raw = f"{mode}:{pickup[0]:.6f},{pickup[1]:.6f}->{drop[0]:.6f},{drop[1]:.6f}"
    return f"rides:routing:v1:{hashlib.sha256(raw.encode()).hexdigest()}"


def _waypoint(point: Point) -> dict[str, object]:
    return {"location": {"latLng": {"latitude": float(point[0]), "longitude": float(point[1])}}}


def _google_route(pickup: Point, drop: Point, mode: str) -> Route:
    key = cast(str, settings.GOOGLE_MAPS_SERVER_KEY)
    if not key:
        raise RoutingUnavailableError("GOOGLE_MAPS_SERVER_KEY is not set.")

    cache_key = _cache_key(pickup, drop, mode)
    cached = cache.get(cache_key)
    if isinstance(cached, dict):
        return Route(**cached)

    body: dict[str, object] = {
        "origin": _waypoint(pickup),
        "destination": _waypoint(drop),
        "travelMode": mode,
        # Live traffic, so the upfront fare reflects how long the trip will really take.
        "routingPreference": "TRAFFIC_AWARE",
        "languageCode": "en-IN",
        "units": "METRIC",
    }

    route = _parse(_post_with_retry(body, key))
    cache.set(cache_key, asdict(route), timeout=CACHE_SECONDS)
    return route


def _post_with_retry(body: dict[str, object], key: str) -> object:
    request = Request(
        GOOGLE_ROUTES_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": _FIELD_MASK,
        },
        method="POST",
    )
    for attempt in range(ATTEMPTS):
        try:
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            # A 4xx is our request or our key: asking again gives the same answer.
            if exc.code < _SERVER_ERROR or attempt == ATTEMPTS - 1:
                raise RoutingUnavailableError("Routing provider request failed.") from exc
        except (URLError, TimeoutError) as exc:
            if attempt == ATTEMPTS - 1:
                raise RoutingUnavailableError("Routing provider request failed.") from exc
        except json.JSONDecodeError as exc:
            raise RoutingUnavailableError("Routing provider sent an unreadable reply.") from exc
    raise RoutingUnavailableError("Routing provider request failed.")  # pragma: no cover


def _parse(payload: object) -> Route:
    routes = payload.get("routes") if isinstance(payload, dict) else None
    if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
        raise RoutingUnavailableError("Routing provider found no route.")
    first = routes[0]
    polyline = first.get("polyline")
    encoded = polyline.get("encodedPolyline") if isinstance(polyline, dict) else None
    duration = _DURATION.match(str(first.get("duration", "")))
    if not isinstance(encoded, str) or not encoded or duration is None:
        raise RoutingUnavailableError("Routing provider returned an incomplete route.")
    return Route(
        # Google leaves `distanceMeters` out when it is zero.
        distance_m=int(first.get("distanceMeters") or 0),
        duration_s=int(duration.group(1)),
        encoded_polyline=encoded,
    )


# --- Fake -------------------------------------------------------------------------------------


def _straight_line_m(a: Point, b: Point) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (float(a[0]), float(a[1]), float(b[0]), float(b[1])))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def _fake_route(pickup: Point, drop: Point, vehicle_type: str) -> Route:
    distance_m = round(_straight_line_m(pickup, drop) * _FAKE_ROAD_FACTOR)
    metres_per_second = _FAKE_SPEED_KMH[vehicle_type] * 1000 / 3600
    return Route(
        distance_m=distance_m,
        duration_s=round(distance_m / metres_per_second),
        encoded_polyline=encode_polyline([pickup, drop]),
    )


def encode_polyline(points: list[Point]) -> str:
    """Google's encoded polyline, so the app draws a fake route just like a real one."""
    out: list[str] = []
    prev_lat = prev_lng = 0
    for lat, lng in points:
        lat_e5, lng_e5 = round(lat * 100_000), round(lng * 100_000)
        for delta in (lat_e5 - prev_lat, lng_e5 - prev_lng):
            value = ~(delta << 1) if delta < 0 else delta << 1
            while value >= _CONTINUE:
                out.append(chr((_CONTINUE | (value & _CHUNK_MASK)) + _ASCII_OFFSET))
                value >>= _CHUNK_BITS
            out.append(chr(value + _ASCII_OFFSET))
        prev_lat, prev_lng = lat_e5, lng_e5
    return "".join(out)
