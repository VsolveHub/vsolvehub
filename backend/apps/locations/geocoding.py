"""Reverse-geocoding adapters with bounded latency and cacheable normalized output."""

import json
from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Protocol, cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
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


class NominatimReverseGeocoder:
    def reverse(self, *, latitude: Decimal, longitude: Decimal) -> GeocodedAddress:
        query = urlencode(
            {
                "format": "jsonv2",
                "lat": str(latitude),
                "lon": str(longitude),
                "addressdetails": "1",
            },
        )
        endpoint = cast(str, settings.GEOCODING_NOMINATIM_URL).rstrip("/")
        if urlparse(endpoint).scheme != "https":
            raise GeocodingError("Reverse-geocoding endpoint must use HTTPS.")
        request = Request(  # noqa: S310 - endpoint is trusted server configuration.
            f"{endpoint}/reverse?{query}",
            headers={
                "Accept": "application/json",
                "Accept-Language": "en",
                "User-Agent": cast(str, settings.GEOCODING_USER_AGENT),
            },
        )
        try:
            with urlopen(request, timeout=settings.GEOCODING_TIMEOUT_SECONDS) as response:  # noqa: S310
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise GeocodingError("Reverse-geocoding provider request failed.") from exc

        if not isinstance(payload, dict) or payload.get("error"):
            raise GeocodingError("Reverse-geocoding provider returned no address.")
        address = payload.get("address")
        if not isinstance(address, dict):
            raise GeocodingError("Reverse-geocoding provider returned malformed data.")

        road = _first_text(address, "road", "pedestrian", "residential", "neighbourhood")
        house_number = _first_text(address, "house_number")
        line1 = " ".join(value for value in (house_number, road) if value).strip()
        locality = _first_text(address, "suburb", "neighbourhood", "quarter", "village")
        city = _first_text(address, "city", "town", "municipality", "county", "village")
        state = _first_text(address, "state", "state_district")
        postal_code = _first_text(address, "postcode")
        country_code = _first_text(address, "country_code").upper() or "IN"
        formatted = str(payload.get("display_name", "")).strip()
        if not formatted:
            raise GeocodingError("Reverse-geocoding provider returned no display address.")

        return GeocodedAddress(
            formatted_address=formatted,
            line1=line1 or locality or city,
            locality=locality,
            city=city,
            state=state,
            postal_code=postal_code,
            country_code=country_code,
            latitude=latitude,
            longitude=longitude,
            provider="nominatim",
        )


def _first_text(mapping: dict[object, object], *keys: str) -> str:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def get_reverse_geocoder() -> ReverseGeocoder:
    provider = cast(str, settings.GEOCODING_PROVIDER).lower()
    if provider == "nominatim":
        return NominatimReverseGeocoder()
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
