"""Builders for Taxi tests: rental and outstation cards and requests. Test rows only."""

from typing import Any

from apps.locations.models import ServiceArea
from apps.rides.models import RideKind, RideRateCard
from tests.rides.parcel_world import QUOTE_BODY, make_card

#: The brief's starting prices for a Cab (Taxi brief §2), in paise.
RENTAL_FIELDS: dict[str, Any] = {
    "base_fare_paise": 0,
    "included_distance_m": 0,
    "per_km_paise": 1200,
    "per_minute_paise": 200,
    "minimum_fare_paise": 0,
    "rental_2h_paise": 44900,
    "rental_4h_paise": 84900,
    "rental_8h_paise": 159900,
}
OUTSTATION_FIELDS: dict[str, Any] = {
    "base_fare_paise": 0,
    "included_distance_m": 0,
    "per_km_paise": 1500,
    "per_minute_paise": 0,
    "minimum_fare_paise": 60000,  # 40 km x the one-way rate
    "round_trip_per_km_paise": 1200,
    "round_trip_min_km_per_day": 250,
}

PICKUP_BODY = QUOTE_BODY["pickup"]
#: About 45 km north in a straight line, so well over 40 km on the fake road network.
FAR_DROP = {"latitude": "17.840000", "longitude": "78.348900", "address": "Medak"}


def rental_card(area: ServiceArea, vehicle_type: str = "CAB", **overrides: Any) -> RideRateCard:
    return make_card(area, vehicle_type, RideKind.RENTAL, **{**RENTAL_FIELDS, **overrides})


def outstation_card(area: ServiceArea, vehicle_type: str = "CAB", **overrides: Any) -> RideRateCard:
    return make_card(area, vehicle_type, RideKind.OUTSTATION, **{**OUTSTATION_FIELDS, **overrides})


def rental_body(hours: int = 4, **extra: Any) -> dict[str, Any]:
    return {"pickup": PICKUP_BODY, "kind": "RENTAL", "rental_hours": hours, **extra}


def outstation_body(**extra: Any) -> dict[str, Any]:
    return {"pickup": PICKUP_BODY, "drop": FAR_DROP, "kind": "OUTSTATION", **extra}
