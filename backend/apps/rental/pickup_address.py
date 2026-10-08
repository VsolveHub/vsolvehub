"""The Self Pickup address of a rental item, and its Google Maps link.

The owner types the address (line, area, city, pincode). There is no map picker and no stored
latitude/longitude yet, so the link is a Google Maps *search* for the address text. The Maps URLs
API needs no key. The server builds the link so every app opens the same place.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from apps.rental.models import RentalAsset

MAPS_SEARCH_URL = "https://www.google.com/maps/search/?api=1&query="
PINCODE_RE = re.compile(r"^[1-9][0-9]{5}$")


class PickupAddressError(ValueError):
    def __init__(self, message: str, *, code: str = "pickup_address_invalid") -> None:
        super().__init__(message)
        self.code = code


def clean_pincode(value: str) -> str:
    pincode = (value or "").strip()
    if pincode and not PINCODE_RE.match(pincode):
        raise PickupAddressError("Enter a 6-digit pincode.", code="pickup_pincode_invalid")
    return pincode


def location_label(*, area: str, city: str, fallback: str) -> str:
    """The short public place name: "Kukatpally, Hyderabad"."""
    parts = [p.strip() for p in (area, city) if p and p.strip()]
    return ", ".join(parts) if parts else fallback.strip()


def missing_parts(asset: RentalAsset) -> list[str]:
    missing = []
    if not asset.pickup_address_line.strip():
        missing.append("address")
    if not asset.pickup_city.strip():
        missing.append("city")
    if not asset.pickup_pincode.strip():
        missing.append("pincode")
    return missing


def maps_url(*, line: str, area: str, city: str, pincode: str) -> str:
    """Address only. The business name is left out: a shop Google doesn't know by name would
    send the search somewhere else."""
    query = ", ".join(p.strip() for p in (line, area, city, pincode) if p and p.strip())
    return f"{MAPS_SEARCH_URL}{quote(query, safe='')}" if query else ""


def pickup_address_payload(asset: RentalAsset) -> dict[str, Any]:
    name = asset.partner.display_name if asset.partner_id else ""
    line = asset.pickup_address_line
    return {
        "partner_name": name,
        "line": line,
        "area": asset.pickup_area,
        "city": asset.pickup_city,
        "pincode": asset.pickup_pincode,
        "maps_url": maps_url(
            line=line,
            area=asset.pickup_area,
            city=asset.pickup_city,
            pincode=asset.pickup_pincode,
        ),
    }
