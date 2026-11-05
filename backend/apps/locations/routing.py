"""The road route from a Partner to a visit, from Google's Routes API (server side only).

The Partner app draws this on its map: the line, the distance and the time. The key never
leaves the server — the app sends where the Partner is, and gets back a route — and the request
carries it in a header rather than the URL, so it cannot end up in a log line.

A route is cached for a minute per (rounded) origin and destination. The app asks again as the
Partner moves; a Partner standing still, or a screen re-rendering, costs one request a minute.
"""

import hashlib
import json
import re
from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import cast
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache

__all__ = ["RoutingError", "VisitRoute", "compute_route"]

GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
_FIELD_MASK = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
_DURATION = re.compile(r"^(\d+)(?:\.\d+)?s$")


class RoutingError(RuntimeError):
    """A safe adapter failure: the app falls back to the Google Maps hand-off."""


@dataclass(frozen=True, slots=True)
class VisitRoute:
    distance_meters: int
    duration_seconds: int
    encoded_polyline: str


def _cache_key(origin: tuple[Decimal, Decimal], destination: tuple[Decimal, Decimal]) -> str:
    # Three decimals is about 110 m: close enough that the line still starts at the Partner.
    raw = (
        f"{round(origin[0], 3)},{round(origin[1], 3)}"
        f"->{round(destination[0], 6)},{round(destination[1], 6)}"
    )
    return f"routing:v1:{hashlib.sha256(raw.encode()).hexdigest()}"


def _point(latitude: Decimal, longitude: Decimal) -> dict[str, object]:
    return {"location": {"latLng": {"latitude": float(latitude), "longitude": float(longitude)}}}


def compute_route(
    *, origin: tuple[Decimal, Decimal], destination: tuple[Decimal, Decimal]
) -> VisitRoute:
    """Two-wheeler route with live traffic, origin to destination."""

    provider = cast(str, settings.GEOCODING_PROVIDER).lower()
    key = cast(str, settings.GOOGLE_MAPS_SERVER_KEY)
    if provider != "google" or not key:
        raise RoutingError("No routing provider is configured.")

    cache_key = _cache_key(origin, destination)
    cached = cache.get(cache_key)
    if isinstance(cached, dict):
        return VisitRoute(**cached)

    body = {
        "origin": _point(*origin),
        "destination": _point(*destination),
        "travelMode": "TWO_WHEELER",
        "routingPreference": "TRAFFIC_AWARE",
        "languageCode": "en-IN",
        "units": "METRIC",
    }
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
    try:
        with urlopen(request, timeout=settings.GEOCODING_TIMEOUT_SECONDS) as response:  # noqa: S310
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RoutingError("Routing provider request failed.") from exc

    routes = payload.get("routes") if isinstance(payload, dict) else None
    if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
        raise RoutingError("Routing provider found no route.")
    first = routes[0]
    polyline = first.get("polyline")
    encoded = polyline.get("encodedPolyline") if isinstance(polyline, dict) else None
    duration_match = _DURATION.match(str(first.get("duration", "")))
    if not isinstance(encoded, str) or not encoded or duration_match is None:
        raise RoutingError("Routing provider returned an incomplete route.")
    route = VisitRoute(
        # Google leaves `distanceMeters` out when it is zero: the Partner is already there.
        distance_meters=int(first.get("distanceMeters") or 0),
        duration_seconds=int(duration_match.group(1)),
        encoded_polyline=encoded,
    )
    cache.set(cache_key, asdict(route), timeout=settings.ROUTING_CACHE_SECONDS)
    return route
