"""Reverse-geocoding adapters with bounded latency and cacheable normalized output."""

import json
from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Protocol, cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache


class GeocodingError(RuntimeError):
    """A safe adapter failure which callers may expose as a recoverable error."""


@dataclass(frozen=True, slots=True)
class GeocodedAddress:
    formatted_address: str
    line1: str
    locality: str
    city: str
    state: str
    postal_code: str
    country_code: str
    latitude: Decimal
    longitude: Decimal
    provider: str


class ReverseGeocoder(Protocol):
    def reverse(self, *, latitude: Decimal, longitude: Decimal) -> GeocodedAddress: ...


class UnconfiguredReverseGeocoder:
    def reverse(self, *, latitude: Decimal, longitude: Decimal) -> GeocodedAddress:
        del latitude, longitude
        raise GeocodingError("No reverse-geocoding provider is configured.")


GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

#: Component types whose short name is the useful one ("IN", not "India").
_SHORT_NAME_TYPES = frozenset({"country"})


class GoogleReverseGeocoder:
    """Google Geocoding API, server side only.

    The key travels in the query string because that is how the API takes it, so the request URL
    is never logged and failures carry a generic message. Google's own ``error_message`` is not
    passed on either: it can echo the request.

    The coordinates returned are the ones asked about, not the result's geometry. The caller's pin
    is the truth; the address text is a description of it.
    """

    def reverse(self, *, latitude: Decimal, longitude: Decimal) -> GeocodedAddress:
        key = cast(str, settings.GOOGLE_MAPS_SERVER_KEY)
        if not key:
            raise GeocodingError("Reverse-geocoding provider key is not configured.")
        query = urlencode(
            {
                "latlng": f"{latitude},{longitude}",
                "key": key,
                "language": "en",
                "region": "in",
            },
        )
        request = Request(  # noqa: S310 - fixed HTTPS endpoint.
            f"{GOOGLE_GEOCODE_URL}?{query}",
            headers={"Accept": "application/json"},
        )
        try:
            with urlopen(request, timeout=settings.GEOCODING_TIMEOUT_SECONDS) as response:  # noqa: S310
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise GeocodingError("Reverse-geocoding provider request failed.") from exc

        if not isinstance(payload, dict):
            raise GeocodingError("Reverse-geocoding provider returned malformed data.")
        status = payload.get("status")
        if status == "ZERO_RESULTS":
            raise GeocodingError("Reverse-geocoding provider returned no address.")
        if status != "OK":
            raise GeocodingError(f"Reverse-geocoding provider refused the request ({status}).")

        result = _best_result(payload.get("results"))
        components = _components(result.get("address_components"))
        street = " ".join(
            value for value in (components.get("street_number"), components.get("route")) if value
        ).strip()
        line1 = street or components.get("premise", "")
        locality = _first_component(
            components,
            "sublocality_level_1",
            "sublocality",
            "neighborhood",
            "sublocality_level_2",
        )
        city = _first_component(
            components,
            "locality",
            "administrative_area_level_3",
            "administrative_area_level_2",
        )
        formatted = str(result.get("formatted_address", "")).strip()
        if not formatted:
            raise GeocodingError("Reverse-geocoding provider returned no display address.")

        return GeocodedAddress(
            formatted_address=formatted,
            line1=line1 or locality or city,
            locality=locality,
            city=city,
            state=components.get("administrative_area_level_1", ""),
            postal_code=components.get("postal_code", ""),
            country_code=components.get("country", "").upper() or "IN",
            latitude=latitude,
            longitude=longitude,
            provider="google",
        )


def _best_result(results: object) -> dict[str, object]:
    """The first result describing a place, skipping bare plus codes ("7J9W+2X Hyderabad")."""
    if not isinstance(results, list):
        raise GeocodingError("Reverse-geocoding provider returned malformed data.")
    candidates = [result for result in results if isinstance(result, dict)]
    for result in candidates:
        types = result.get("types")
        if not (isinstance(types, list) and "plus_code" in types):
            return result
    raise GeocodingError("Reverse-geocoding provider returned no address.")


def _components(raw: object) -> dict[str, str]:
    """``address_components`` keyed by type; the first component of a type wins."""
    mapped: dict[str, str] = {}
    if not isinstance(raw, list):
        return mapped
    for component in raw:
        if not isinstance(component, dict):
            continue
        types = component.get("types")
        if not isinstance(types, list):
            continue
        for kind in types:
            if not isinstance(kind, str) or kind in mapped:
                continue
            name = component.get("short_name" if kind in _SHORT_NAME_TYPES else "long_name")
            if isinstance(name, str) and name.strip():
                mapped[kind] = name.strip()
    return mapped


def _first_component(components: dict[str, str], *kinds: str) -> str:
    for kind in kinds:
        value = components.get(kind)
        if value:
            return value
    return ""


def get_reverse_geocoder() -> ReverseGeocoder:
    provider = cast(str, settings.GEOCODING_PROVIDER).lower()
    if provider == "google":
        return GoogleReverseGeocoder()
    return UnconfiguredReverseGeocoder()


def reverse_geocode(*, latitude: Decimal, longitude: Decimal) -> GeocodedAddress:
    precision = cast(int, settings.GEOCODING_CACHE_COORDINATE_PRECISION)
    cache_key = (
        "geocoding:reverse:"
        f"{round(latitude, precision)}:{round(longitude, precision)}:"
        f"{settings.GEOCODING_PROVIDER}"
    )
    cached = cache.get(cache_key)
    if isinstance(cached, dict):
        return GeocodedAddress(
            **{
                **cached,
                "latitude": Decimal(cached["latitude"]),
                "longitude": Decimal(cached["longitude"]),
            },
        )

    result = get_reverse_geocoder().reverse(latitude=latitude, longitude=longitude)
    payload = asdict(result)
    payload["latitude"] = str(result.latitude)
    payload["longitude"] = str(result.longitude)
    cache.set(cache_key, payload, timeout=settings.GEOCODING_CACHE_SECONDS)
    return result
