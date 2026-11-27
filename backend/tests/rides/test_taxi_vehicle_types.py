"""Taxi vehicle types and kinds (D2, D3, §4.1): the database rules, and quotes for the new
vehicles."""

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.rides.models import (
    KIND_VEHICLE_TYPES,
    FareQuote,
    Ride,
    RideKind,
    RideRateCard,
    RideState,
    VehicleType,
)
from tests.rides.helpers import customer_client, make_user
from tests.rides.parcel_world import QUOTE_BODY, QUOTES, pickup_in, served_area
from tests.rides.parcel_world import make_card as parcel_card

pytestmark = pytest.mark.django_db

#: A valid card of each kind (the §4.1 field table); a test overrides one field to break it.
CARD_FIELDS: dict[str, dict[str, Any]] = {
    RideKind.RIDE: {
        "base_fare_paise": 2000,
        "included_distance_m": 2000,
        "per_km_paise": 800,
        "per_minute_paise": 100,
        "minimum_fare_paise": 3000,
    },
    RideKind.PARCEL: {
        "base_fare_paise": 2000,
        "included_distance_m": 2000,
        "per_km_paise": 800,
        "per_minute_paise": 100,
        "minimum_fare_paise": 3000,
        "max_parcel_weight_grams": 10_000,
        "parcel_size_label": "40 x 30 x 20 cm",
    },
    RideKind.RENTAL: {
        "base_fare_paise": 0,
        "included_distance_m": 0,
        "per_km_paise": 1200,
        "per_minute_paise": 200,
        "minimum_fare_paise": 0,
        "rental_2h_paise": 44900,
        "rental_4h_paise": 84900,
        "rental_8h_paise": 159900,
    },
    RideKind.OUTSTATION: {
        "base_fare_paise": 0,
        "included_distance_m": 0,
        "per_km_paise": 1500,
        "per_minute_paise": 0,
        "minimum_fare_paise": 60000,
        "round_trip_per_km_paise": 1200,
        "round_trip_min_km_per_day": 250,
    },
}


def make_area() -> ServiceArea:
    return ServiceArea.objects.create(
        slug=f"area-{uuid.uuid4().hex[:6]}", name="Gachibowli", timezone="Asia/Kolkata"
    )


def make_card(
    kind: str,
    vehicle_type: str = VehicleType.CAB,
    area: ServiceArea | None = None,
    **overrides: Any,
) -> RideRateCard:
    fields: dict[str, Any] = {
        "service_area": area or make_area(),
        "vehicle_type": vehicle_type,
        "kind": kind,
        "free_waiting_minutes": 3,
        "waiting_per_minute_paise": 100,
        **CARD_FIELDS[kind],
    }
    fields.update(overrides)
    return RideRateCard.objects.create(**fields)


def make_quote(kind: str = RideKind.RIDE, rider: User | None = None, **overrides: Any) -> FareQuote:
    card = make_card(kind, VehicleType.BIKE if kind == RideKind.PARCEL else VehicleType.CAB)
    fields: dict[str, Any] = {
        "rider": rider or make_user("Priya Rider"),
        "service_area": card.service_area,
        "vehicle_type": card.vehicle_type,
        "kind": kind,
        "rate_card": card,
        "rate_card_version": card.version,
        "pickup_latitude": Decimal("17.44"),
        "pickup_longitude": Decimal("78.35"),
        "pickup_label": "Gachibowli",
        "distance_m": 40000,
        "duration_s": 14400,
        "route_polyline": "",
        "fare_paise": 84900,
        "expires_at": timezone.now() + timedelta(minutes=5),
    }
    if kind == RideKind.RENTAL:
        fields["rental_hours"] = 4
    else:
        fields.update(
            drop_latitude=Decimal("17.45"),
            drop_longitude=Decimal("78.38"),
            drop_label="Hitech City",
        )
    fields.update(overrides)
    return FareQuote.objects.create(**fields)


def make_ride(quote: FareQuote | None = None, **overrides: Any) -> Ride:
    quote = quote or make_quote()
    fields: dict[str, Any] = {
        "rider": quote.rider,
        "quote": quote,
        "kind": quote.kind,
        "service_area": quote.service_area,
        "vehicle_type": quote.vehicle_type,
        "pickup_latitude": quote.pickup_latitude,
        "pickup_longitude": quote.pickup_longitude,
        "pickup_label": quote.pickup_label,
        "drop_latitude": quote.drop_latitude,
        "drop_longitude": quote.drop_longitude,
        "drop_label": quote.drop_label,
        "pickup_at": quote.pickup_at,
        "rental_hours": quote.rental_hours,
        "round_trip": quote.round_trip,
        "return_at": quote.return_at,
        "fare_paise": quote.fare_paise,
    }
    fields.update(overrides)
    return Ride.objects.create(**fields)


def refused(build: Any, *args: Any, **kwargs: Any) -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        build(*args, **kwargs)


# --- rate cards: vehicles per kind (D3) -------------------------------------------------------


@pytest.mark.parametrize(
    ("kind", "vehicle_type"),
    [(kind, vehicle) for kind, vehicles in KIND_VEHICLE_TYPES.items() for vehicle in vehicles],
)
def test_every_d3_vehicle_and_kind_pair_has_a_card(kind: str, vehicle_type: str) -> None:
    assert make_card(kind, vehicle_type).kind == kind


@pytest.mark.parametrize(
    ("kind", "vehicle_type"),
    [
        (RideKind.RIDE, VehicleType.TEMPO),
        (RideKind.RENTAL, VehicleType.BIKE),
        (RideKind.RENTAL, VehicleType.AUTO),
        (RideKind.OUTSTATION, VehicleType.EV_CAB),
        (RideKind.OUTSTATION, VehicleType.AUTO),
        (RideKind.PARCEL, VehicleType.CAB),
    ],
)
def test_a_vehicle_outside_d3_has_no_card_of_that_kind(kind: str, vehicle_type: str) -> None:
    refused(make_card, kind, vehicle_type)


def test_d3_is_the_brief_list() -> None:
    assert {kind: set(vehicles) for kind, vehicles in KIND_VEHICLE_TYPES.items()} == {
        "RIDE": {"BIKE", "AUTO", "CAB", "EV_CAB", "PREMIUM", "SUV", "INNOVA"},
        "PARCEL": {"BIKE", "AUTO"},
        "RENTAL": {"CAB", "EV_CAB", "PREMIUM", "SUV", "INNOVA", "TEMPO"},
        "OUTSTATION": {"CAB", "PREMIUM", "SUV", "INNOVA", "TEMPO"},
    }


# --- rate cards: the fields each kind uses (§4.1) ---------------------------------------------


def test_a_rental_card_may_leave_packages_out() -> None:
    card = make_card(RideKind.RENTAL, VehicleType.TEMPO, rental_2h_paise=None)
    assert card.rental_2h_paise is None


@pytest.mark.parametrize(
    ("kind", "overrides"),
    [
        # A rental offers at least one package, and has no base fare, distance or minimum.
        (
            RideKind.RENTAL,
            {"rental_2h_paise": None, "rental_4h_paise": None, "rental_8h_paise": None},
        ),
        (RideKind.RENTAL, {"base_fare_paise": 1000}),
        (RideKind.RENTAL, {"included_distance_m": 2000}),
        (RideKind.RENTAL, {"minimum_fare_paise": 3000}),
        (RideKind.RENTAL, {"round_trip_per_km_paise": 1200, "round_trip_min_km_per_day": 250}),
        (RideKind.RENTAL, {"max_parcel_weight_grams": 10_000, "parcel_size_label": "Small"}),
        # Outstation needs both round-trip fields, and has no base, distance, minutes or packages.
        (RideKind.OUTSTATION, {"round_trip_per_km_paise": None}),
        (RideKind.OUTSTATION, {"round_trip_min_km_per_day": None}),
        (RideKind.OUTSTATION, {"base_fare_paise": 1000}),
        (RideKind.OUTSTATION, {"included_distance_m": 2000}),
        (RideKind.OUTSTATION, {"per_minute_paise": 100}),
        (RideKind.OUTSTATION, {"rental_4h_paise": 84900}),
        # A ride or parcel card has neither.
        (RideKind.RIDE, {"rental_2h_paise": 44900}),
        (RideKind.RIDE, {"round_trip_per_km_paise": 1200, "round_trip_min_km_per_day": 250}),
        (RideKind.PARCEL, {"rental_8h_paise": 159900}),
    ],
)
def test_a_card_has_only_its_kinds_fields(kind: str, overrides: dict[str, Any]) -> None:
    vehicle = VehicleType.BIKE if kind == RideKind.PARCEL else VehicleType.CAB
    refused(make_card, kind, vehicle, **overrides)


# --- quotes and rides: drop, rental hours, round trip -----------------------------------------


def test_a_rental_has_no_drop() -> None:
    ride = make_ride(make_quote(RideKind.RENTAL))
    assert ride.drop_latitude is None
    assert ride.drop_label == ""


def test_a_rental_with_a_drop_is_refused() -> None:
    refused(make_quote, RideKind.RENTAL, drop_latitude=Decimal("17.45"))
    refused(make_ride, make_quote(RideKind.RENTAL), drop_longitude=Decimal("78.38"))


@pytest.mark.parametrize("kind", [RideKind.RIDE, RideKind.PARCEL, RideKind.OUTSTATION])
def test_every_other_kind_needs_a_drop(kind: str) -> None:
    refused(make_quote, kind, drop_latitude=None, drop_longitude=None, drop_label="")
    refused(make_ride, make_quote(kind), drop_latitude=None)


@pytest.mark.parametrize("hours", [None, 1, 3, 6, 12])
def test_a_rental_is_two_four_or_eight_hours(hours: int | None) -> None:
    refused(make_quote, RideKind.RENTAL, rental_hours=hours)


@pytest.mark.parametrize("hours", [2, 4, 8])
def test_each_rental_package_is_allowed(hours: int) -> None:
    assert make_ride(make_quote(RideKind.RENTAL, rental_hours=hours)).rental_hours == hours


def test_only_a_rental_has_rental_hours() -> None:
    refused(make_quote, RideKind.RIDE, rental_hours=4)
    refused(make_ride, make_quote(RideKind.OUTSTATION), rental_hours=4)


def test_an_outstation_round_trip_has_a_return_time() -> None:
    leave = timezone.now() + timedelta(days=1)
    quote = make_quote(
        RideKind.OUTSTATION, pickup_at=leave, round_trip=True, return_at=leave + timedelta(days=2)
    )
    assert make_ride(quote, state=RideState.BOOKED).round_trip is True


@pytest.mark.parametrize(
    ("kind", "round_trip", "has_return"),
    [
        (RideKind.OUTSTATION, True, False),  # a round trip without its return time
        (RideKind.OUTSTATION, False, True),  # a one-way trip with a return time
        (RideKind.RIDE, True, True),  # only outstation has round trips
        (RideKind.RENTAL, True, True),
    ],
)
def test_round_trip_and_return_time_go_together(
    kind: str, round_trip: bool, has_return: bool
) -> None:
    return_at = timezone.now() + timedelta(days=2) if has_return else None
    refused(make_quote, kind, round_trip=round_trip, return_at=return_at)


# --- rides: booked for later and rental extras ------------------------------------------------


def test_a_booked_ride_needs_a_pickup_time() -> None:
    refused(make_ride, state=RideState.BOOKED)


def test_a_booked_ride_does_not_stop_the_rider_riding_now() -> None:
    rider = make_user("Priya Rider")
    later = timezone.now() + timedelta(hours=3)
    make_ride(make_quote(rider=rider, pickup_at=later), state=RideState.BOOKED)
    make_ride(make_quote(rider=rider, pickup_at=later), state=RideState.BOOKED)

    now = make_ride(make_quote(rider=rider))

    assert now.state == RideState.SEARCHING
    assert Ride.objects.filter(rider=rider).count() == 3


@pytest.mark.parametrize("kind", [RideKind.RIDE, RideKind.OUTSTATION, RideKind.PARCEL])
def test_only_a_rental_has_extras(kind: str) -> None:
    refused(make_ride, make_quote(kind), extra_km=3, extra_minutes=0, extras_paise=3600)


def test_a_rental_records_its_extras() -> None:
    ride = make_ride(make_quote(RideKind.RENTAL), extra_km=3, extra_minutes=10, extras_paise=5600)
    assert ride.extras_paise == 5600


# --- the new vehicles can be quoted -----------------------------------------------------------


def test_ride_quotes_include_the_new_vehicles_cheapest_first(
    monkeypatch: pytest.MonkeyPatch, settings: SettingsWrapper
) -> None:
    """Every new type routes as a car and sorts after the cab (it used to raise KeyError)."""
    settings.RIDES_ROUTING_PROVIDER = "fake"
    pickup_in(monkeypatch)
    area = served_area()
    for vehicle in ("SUV", "EV_CAB", "INNOVA", "CAB", "PREMIUM"):
        parcel_card(area, vehicle)

    response = customer_client(make_user()).post(QUOTES, QUOTE_BODY, format="json")

    assert response.status_code == 201
    assert [q["vehicle_type"] for q in response.json()["quotes"]] == [
        "CAB",
        "EV_CAB",
        "PREMIUM",
        "SUV",
        "INNOVA",
    ]
