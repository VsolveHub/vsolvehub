"""Fare engine table (brief §5.5). Pure arithmetic: the cards are unsaved, so no database."""

from typing import Any

import pytest

from apps.rides.fares import final_fare_paise, trip_fare_paise, waiting_charge_paise
from apps.rides.models import RideRateCard, VehicleType


def card(**overrides: Any) -> RideRateCard:
    fields: dict[str, Any] = {
        "vehicle_type": VehicleType.BIKE,
        "base_fare_paise": 2000,  # ₹20
        "included_distance_m": 2000,
        "per_km_paise": 800,  # ₹8 / km
        "per_minute_paise": 100,  # ₹1 / min
        "minimum_fare_paise": 3000,  # ₹30
        "free_waiting_minutes": 3,
        "waiting_per_minute_paise": 100,
    }
    fields.update(overrides)
    return RideRateCard(**fields)


@pytest.mark.parametrize(
    ("distance_m", "duration_s", "expected"),
    [
        # Minimum fare
        (0, 0, 3000),  # base alone is below the minimum
        (1500, 300, 3000),  # inside included distance: 2000 + 500 is below the minimum
        (2000, 600, 3000),  # exactly the minimum
        # Included distance: only metres beyond it are charged
        (5000, 600, 5400),  # 2000 + 3 km x 800 + 10 min x 100
        (5000, 900, 5900),
        (50_000, 3600, 46_400),  # long trip: 2000 + 48 km x 800 + 60 min x 100
        # Half-up rounding to the whole rupee
        (5000, 630, 5500),  # ₹54.50 rounds up
        (5000, 629, 5400),  # ₹54.48 rounds down
        (5000, 631, 5500),  # ₹54.52 rounds up
    ],
)
def test_trip_fare(distance_m: int, duration_s: int, expected: int) -> None:
    assert trip_fare_paise(card(), distance_m=distance_m, duration_s=duration_s) == expected


def test_fraction_of_a_paisa_is_kept_until_the_single_rounding() -> None:
    # 1 extra metre is 0.8 paise: ₹20.008 rounds to ₹20.
    assert trip_fare_paise(card(minimum_fare_paise=0), distance_m=2001, duration_s=0) == 2000


def test_rounding_happens_once_on_the_total_not_per_part() -> None:
    # 2000 + 40 + 40 = ₹20.80 → ₹21. Rounding each part first would give ₹20.
    c = card(minimum_fare_paise=0, per_km_paise=40, per_minute_paise=40)
    assert trip_fare_paise(c, distance_m=3000, duration_s=60) == 2100


def test_minimum_fare_is_applied_before_rounding() -> None:
    # A ₹30.50 minimum rounds half up to ₹31.
    assert trip_fare_paise(card(minimum_fare_paise=3050), distance_m=0, duration_s=0) == 3100


def test_fare_is_an_int() -> None:
    assert type(trip_fare_paise(card(), distance_m=5000, duration_s=629)) is int


@pytest.mark.parametrize(("distance_m", "duration_s"), [(-1, 0), (0, -1)])
def test_negative_route_values_are_rejected(distance_m: int, duration_s: int) -> None:
    with pytest.raises(ValueError):
        trip_fare_paise(card(), distance_m=distance_m, duration_s=duration_s)


@pytest.mark.parametrize(
    ("waited_s", "expected"),
    [
        (0, 0),
        (179, 0),  # inside the 3 free minutes
        (180, 0),  # exactly the free minutes
        (181, 100),  # one second over starts a charged minute
        (240, 100),  # exactly one charged minute
        (241, 200),  # into the second charged minute
        (600, 700),  # 7 minutes after the free 3
    ],
)
def test_waiting_charge(waited_s: int, expected: int) -> None:
    assert waiting_charge_paise(card(), waited_s=waited_s) == expected


def test_waiting_with_no_free_minutes_charges_from_the_first_second() -> None:
    assert waiting_charge_paise(card(free_waiting_minutes=0), waited_s=1) == 100


def test_negative_waiting_is_rejected() -> None:
    with pytest.raises(ValueError):
        waiting_charge_paise(card(), waited_s=-1)


def test_final_fare_is_the_quote_plus_waiting_only() -> None:
    # 300 s waited - 180 s free = 2 charged minutes.
    assert final_fare_paise(card(), quoted_fare_paise=5400, waited_s=300) == 5600


def test_final_fare_without_waiting_is_the_quote() -> None:
    assert final_fare_paise(card(), quoted_fare_paise=5400, waited_s=0) == 5400
