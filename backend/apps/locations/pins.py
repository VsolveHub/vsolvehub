"""Map pins on listings: a latitude/longitude pair that is both set or both empty.

Used by rental pickup addresses and stay properties. A Customer ``Address`` always has a pin and
does not use this; a listing may predate pins, so here the pair is optional.
"""

from decimal import Decimal
from enum import Enum
from typing import Any

from django.db import models
from rest_framework import serializers


class KeepPin(Enum):
    """An edit that did not mention the pin leaves it where it is."""

    KEEP = "keep"


#: A pin to set, ``None`` to clear it, or ``KeepPin.KEEP`` to leave it alone.
Pin = tuple[Decimal, Decimal] | None | KeepPin

#: Two decimals is about 1.1 km: an area, never a building. What a guest sees of a pin the host
#: has not chosen to disclose.
AREA_DECIMALS = 2


def latitude_field(**kwargs: Any) -> serializers.DecimalField:
    return serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        min_value=Decimal("-90"),
        max_value=Decimal("90"),
        required=False,
        allow_null=True,
        **kwargs,
    )


def longitude_field(**kwargs: Any) -> serializers.DecimalField:
    return serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        min_value=Decimal("-180"),
        max_value=Decimal("180"),
        required=False,
        allow_null=True,
        **kwargs,
    )


def combine_pin(attrs: dict[str, Any], *, latitude: str, longitude: str, into: str) -> None:
    """Replace the two sent fields with one ``into`` pin, in place.

    Neither sent: nothing changes, so an edit keeps the pin. Both null: the pin is cleared. One
    without the other is refused rather than half-stored.
    """
    sent = [key for key in (latitude, longitude) if key in attrs]
    if not sent:
        return
    lat = attrs.pop(latitude, None)
    lng = attrs.pop(longitude, None)
    if len(sent) == 1 or (lat is None) != (lng is None):
        raise serializers.ValidationError(
            {latitude: "Send the pin's latitude and longitude together."},
            code="pin_incomplete",
        )
    attrs[into] = None if lat is None else (lat, lng)


def apply_pin(instance: models.Model, pin: Pin, *, latitude: str, longitude: str) -> list[str]:
    """Set or clear the pin on ``instance``. Returns the changed field names; none for ``KEEP``."""
    if isinstance(pin, KeepPin):
        return []
    lat, lng = pin if pin is not None else (None, None)
    setattr(instance, latitude, lat)
    setattr(instance, longitude, lng)
    return [latitude, longitude]


DIRECTIONS_URL = "https://www.google.com/maps/dir/?api=1&destination="


def directions_url(latitude: Decimal | None, longitude: Decimal | None) -> str:
    """A route to the pin: the installed maps app on a phone, the Maps site on a desktop.

    Empty without a pin. The Maps URLs API needs no key.
    """
    if latitude is None or longitude is None:
        return ""
    return f"{DIRECTIONS_URL}{latitude},{longitude}"


def area_of(value: Decimal | None) -> Decimal | None:
    return None if value is None else round(value, AREA_DECIMALS)


def pin_constraints(*, prefix: str, latitude: str, longitude: str) -> list[models.CheckConstraint]:
    """Both-or-neither and range checks, enforced by the database as well as the serializer."""
    return [
        models.CheckConstraint(
            condition=models.Q(**{f"{latitude}__isnull": True, f"{longitude}__isnull": True})
            | models.Q(**{f"{latitude}__isnull": False, f"{longitude}__isnull": False}),
            name=f"{prefix}_pin_complete",
        ),
        models.CheckConstraint(
            condition=models.Q(**{f"{latitude}__isnull": True})
            | models.Q(**{f"{latitude}__gte": -90, f"{latitude}__lte": 90}),
            name=f"{prefix}_valid_latitude",
        ),
        models.CheckConstraint(
            condition=models.Q(**{f"{longitude}__isnull": True})
            | models.Q(**{f"{longitude}__gte": -180, f"{longitude}__lte": 180}),
            name=f"{prefix}_valid_longitude",
        ),
    ]
