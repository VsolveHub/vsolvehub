"""Builders for Pick up & Drop tests. Test rows only; nothing here reaches production code."""

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from django.utils import timezone

from apps.identity.models import User
from apps.locations.geocoding import GeocodedAddress
from apps.locations.models import PostalCode, ServiceArea, ServiceAreaPostalCode
from apps.rides import engine, services
from apps.rides.models import FareQuote, Ride, RideKind, RideRateCard
from tests.rides.ride_world import PICKUP

SERVED_PIN = "500032"
RIDES = "/api/v1/rides/"
QUOTES = "/api/v1/rides/quotes/"
AVAILABILITY = "/api/v1/rides/availability/?latitude=17.440000&longitude=78.348900"

#: D5 defaults.
LIMITS = {
    "BIKE": (10_000, "40 x 30 x 20 cm"),
    "AUTO": (50_000, "1.3 x 3.5 x 3.3 ft"),
}

QUOTE_BODY: dict[str, Any] = {
    "pickup": {"latitude": "17.440000", "longitude": "78.348900", "address": "Gachibowli Stadium"},
    "drop": {"latitude": "17.450000", "longitude": "78.380000", "address": "Hitech City"},
}


def served_area() -> ServiceArea:
    """A service area that owns the postal code the fake geocoder returns."""
    area = ServiceArea.objects.create(
        slug=f"area-{uuid.uuid4().hex[:6]}", name="Gachibowli", timezone="Asia/Kolkata"
    )
    pin, _ = PostalCode.objects.get_or_create(
        code=SERVED_PIN, defaults={"city": "Hyderabad", "state": "Telangana"}
    )
    ServiceAreaPostalCode.objects.create(service_area=area, postal_code=pin)
    return area


def pickup_in(monkeypatch: pytest.MonkeyPatch, postal_code: str = SERVED_PIN) -> None:
    """Make every pickup resolve to this postal code, so no real geocoder is called."""

    def reverse(*, latitude: Decimal, longitude: Decimal) -> GeocodedAddress:
        return GeocodedAddress(
            formatted_address="Somewhere",
            line1="",
            locality="",
            city="Hyderabad",
            state="Telangana",
            postal_code=postal_code,
            country_code="IN",
            latitude=latitude,
            longitude=longitude,
            provider="test",
        )

    monkeypatch.setattr(services, "reverse_geocode", reverse)


def make_card(
    area: ServiceArea, vehicle_type: str, kind: str = RideKind.RIDE, **overrides: Any
) -> RideRateCard:
    """A rate card. A parcel card gets the D5 limits unless the test says otherwise."""
    fields: dict[str, Any] = {
        "service_area": area,
        "vehicle_type": vehicle_type,
        "kind": kind,
        "base_fare_paise": 2000,
        "included_distance_m": 1000,
        "per_km_paise": 800,
        "per_minute_paise": 100,
        "minimum_fare_paise": 3000,
        "free_waiting_minutes": 3,
        "waiting_per_minute_paise": 100,
    }
    if kind == RideKind.PARCEL:
        weight, size = LIMITS.get(vehicle_type, (10_000, "any size"))
        fields["max_parcel_weight_grams"], fields["parcel_size_label"] = weight, size
    fields.update(overrides)
    return RideRateCard.objects.create(**fields)


def parcel_quote(rider: User, card: RideRateCard) -> FareQuote:
    """A parcel quote straight from the database, for tests that start at booking."""
    return FareQuote.objects.create(
        rider=rider,
        service_area=card.service_area,
        vehicle_type=card.vehicle_type,
        kind=RideKind.PARCEL,
        rate_card=card,
        rate_card_version=card.version,
        pickup_latitude=PICKUP[0],
        pickup_longitude=PICKUP[1],
        pickup_label="Gachibowli",
        drop_latitude=Decimal("17.450000"),
        drop_longitude=Decimal("78.380000"),
        drop_label="Hitec City",
        distance_m=4200,
        duration_s=900,
        route_polyline="abc",
        fare_paise=5100,
        expires_at=timezone.now() + timedelta(seconds=300),
    )


def end(**overrides: Any) -> dict[str, Any]:
    """One end of a parcel, complete unless the test blanks something."""
    fields: dict[str, Any] = {
        "name": "Asha Rao",
        "phone": "9876543210",
        "building": "Sky Towers",
        "unit": "4B",
        "meet_at": "DOOR",
        "instructions": "Ring twice",
    }
    fields.update(overrides)
    return fields


def parcel_body(**overrides: Any) -> dict[str, Any]:
    """The `parcel` object of POST /rides/: sending, Sender pays, PIN on."""
    body: dict[str, Any] = {
        "mode": "SEND",
        "payer": "SENDER",
        "pin_required": True,
        "pickup": end(name="Ravi Kumar", phone="9123456780", meet_at="CURB"),
        "drop": end(),
    }
    body.update(overrides)
    return body


def book_parcel(client: Any, quote: FareQuote, parcel: Any = None, key: str = "k-1") -> Any:
    body: dict[str, Any] = {"quote_id": str(quote.id)}
    if parcel is not None:
        body["parcel"] = parcel
    return client.post(RIDES, body, format="json", HTTP_IDEMPOTENCY_KEY=key)


def new_parcel(
    rider: User, area: ServiceArea, *, vehicle: str = "BIKE", parcel: dict[str, Any] | None = None
) -> Ride:
    """Book a parcel straight through the engine, making the area's parcel card if it has none."""
    card = RideRateCard.objects.filter(
        service_area=area, vehicle_type=vehicle, kind=RideKind.PARCEL, is_active=True
    ).first() or make_card(area, vehicle, RideKind.PARCEL)
    quote = parcel_quote(rider, card)
    return engine.create_ride(rider=rider, quote_id=quote.id, parcel=parcel or parcel_body())
