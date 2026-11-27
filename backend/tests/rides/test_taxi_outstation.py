"""Taxi outstation: at least 40 km, a fixed price, round trip days and return times (D12-D14)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from freezegun import freeze_time
from pytest_django.fixtures import SettingsWrapper

from apps.rides.fares import outstation_billed_km, outstation_days, outstation_fare_paise
from apps.rides.models import FareQuote, Ride, RideKind, RideRateCard
from apps.rides.routing import get_route
from tests.rides.helpers import customer_client, make_user
from tests.rides.parcel_world import QUOTE_BODY, QUOTES, pickup_in, served_area
from tests.rides.ride_world import book, error_code
from tests.rides.taxi_world import (
    FAR_DROP,
    OUTSTATION_FIELDS,
    PICKUP_BODY,
    outstation_body,
    outstation_card,
)

#: 10:00 in Hyderabad on 1 December 2026.
NOW = datetime(2026, 12, 1, 4, 30, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


def card(**overrides: object) -> RideRateCard:
    """An unsaved outstation card, for the fare rules that need no database."""
    return RideRateCard(
        vehicle_type="CAB", kind=RideKind.OUTSTATION, **{**OUTSTATION_FIELDS, **overrides}
    )


def road_metres() -> int:
    """The fake road distance from the pickup to `FAR_DROP`."""
    pickup = (Decimal(PICKUP_BODY["latitude"]), Decimal(PICKUP_BODY["longitude"]))
    drop = (Decimal(FAR_DROP["latitude"]), Decimal(FAR_DROP["longitude"]))
    return get_route(pickup=pickup, drop=drop, vehicle_type="CAB").distance_m


# --- prices (no database) ---------------------------------------------------------------------


def test_one_way_is_road_km_times_the_one_way_rate() -> None:
    assert outstation_fare_paise(card(), road_metres=60_000, round_trip=False, days=1) == 60 * 1500


def test_one_way_never_costs_less_than_the_card_minimum() -> None:
    assert outstation_fare_paise(card(), road_metres=30_000, round_trip=False, days=1) == 60000


@pytest.mark.parametrize(("metres", "km"), [(40_499, 40), (40_500, 41), (40_999, 41)])
def test_road_km_are_whole_km_rounded_half_up(metres: int, km: int) -> None:
    assert outstation_billed_km(card(), road_metres=metres, round_trip=False, days=1) == km


def test_the_price_is_rounded_half_up_to_the_rupee() -> None:
    # 41 km x 15.50 = 635.50 -> 636.
    priced = outstation_fare_paise(
        card(per_km_paise=1550), road_metres=41_000, round_trip=False, days=1
    )
    assert priced == 63600


@pytest.mark.parametrize(
    ("road_km", "days", "billed_km"),
    [
        (60, 1, 250),  # 120 km out and back is under a day's 250 km
        (200, 1, 400),  # 2 x 200 km is over 250
        (200, 2, 500),  # two days: at least 500 km
        (300, 3, 750),
    ],
)
def test_a_round_trip_bills_twice_the_road_or_250_km_a_day(
    road_km: int, days: int, billed_km: int
) -> None:
    metres = road_km * 1000
    assert outstation_billed_km(card(), road_metres=metres, round_trip=True, days=days) == billed_km
    fare = outstation_fare_paise(card(), road_metres=metres, round_trip=True, days=days)
    assert fare == billed_km * 1200


def test_a_round_trip_ignores_the_one_way_minimum() -> None:
    priced = outstation_fare_paise(
        card(minimum_fare_paise=10_000_000), road_metres=60_000, round_trip=True, days=1
    )
    assert priced == 250 * 1200


@pytest.mark.parametrize(
    ("leave", "back", "days"),
    [
        ("2026-12-01T04:30:00+00:00", "2026-12-01T14:00:00+00:00", 1),  # same day in Hyderabad
        ("2026-12-01T04:30:00+00:00", "2026-12-02T04:30:00+00:00", 2),
        # 23:30 to 00:30 Hyderabad time is two calendar days, though only an hour.
        ("2026-12-01T18:00:00+00:00", "2026-12-01T19:00:00+00:00", 2),
        ("2026-12-01T04:30:00+00:00", "2026-12-08T04:30:00+00:00", 8),
    ],
)
def test_days_are_calendar_days_in_asia_kolkata(leave: str, back: str, days: int) -> None:
    assert outstation_days(datetime.fromisoformat(leave), datetime.fromisoformat(back)) == days


# --- outstation quotes ------------------------------------------------------------------------


def post(body: dict[str, object]) -> Any:
    return customer_client(make_user()).post(QUOTES, body, format="json")


@pytest.mark.django_db
def test_a_trip_under_40_km_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    outstation_card(served_area())

    response = post({**QUOTE_BODY, "kind": "OUTSTATION"})

    assert response.status_code == 422
    assert error_code(response) == "outstation_too_short"
    assert response.json()["error"]["message"] == "For trips under 40 km, use Ride."
    assert not FareQuote.objects.exists()


@pytest.mark.django_db
def test_a_one_way_quote_is_a_fixed_price_from_the_road(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    area = served_area()
    outstation_card(area, "INNOVA", per_km_paise=2300, round_trip_per_km_paise=1900)
    cab = outstation_card(area, "CAB")

    response = post(outstation_body())

    assert response.status_code == 201
    quotes = response.json()["quotes"]
    assert [q["vehicle_type"] for q in quotes] == ["CAB", "INNOVA"]
    metres = road_metres()
    assert metres >= 40_000
    assert quotes[0]["fare_paise"] == outstation_fare_paise(
        cab, road_metres=metres, round_trip=False, days=1
    )
    assert quotes[0]["billed_km"] == (metres + 500) // 1000
    assert (quotes[0]["round_trip"], quotes[0]["return_at"], quotes[0]["days"]) == (
        False,
        None,
        None,
    )
    assert quotes[0]["included_km"] is None


@pytest.mark.django_db
@freeze_time(NOW)
def test_a_round_trip_quote_counts_the_days(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    outstation_card(served_area())
    back = NOW + timedelta(days=1, hours=8)  # 18:00 the next day in Hyderabad

    response = post(outstation_body(round_trip=True, return_at=back.isoformat()))

    assert response.status_code == 201
    quote = response.json()["quotes"][0]
    assert (quote["round_trip"], quote["days"]) == (True, 2)
    billed = max(2 * ((road_metres() + 500) // 1000), 2 * 250)
    assert quote["billed_km"] == billed
    assert quote["fare_paise"] == billed * 1200


@pytest.mark.django_db
@freeze_time(NOW)
@pytest.mark.parametrize(
    "back",
    [
        NOW,  # not after the pickup
        NOW - timedelta(hours=1),
        NOW + timedelta(days=7, minutes=1),  # more than 7 days
    ],
)
def test_a_return_time_outside_the_limits_is_refused(
    monkeypatch: pytest.MonkeyPatch, back: datetime
) -> None:
    pickup_in(monkeypatch)
    outstation_card(served_area())

    response = post(outstation_body(round_trip=True, return_at=back.isoformat()))

    assert response.status_code == 422
    assert error_code(response) == "invalid_return_time"


@pytest.mark.django_db
@freeze_time(NOW)
def test_a_return_exactly_seven_days_later_is_allowed(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    outstation_card(served_area())
    back = NOW + timedelta(days=7)

    response = post(outstation_body(round_trip=True, return_at=back.isoformat()))

    assert response.status_code == 201
    assert response.json()["quotes"][0]["days"] == 8


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("body", "field"),
    [
        (outstation_body(round_trip=True), "return_at"),
        (outstation_body(return_at="2026-12-02T10:00:00+05:30"), "return_at"),
        ({"pickup": PICKUP_BODY, "kind": "OUTSTATION"}, "drop"),
        ({**QUOTE_BODY, "round_trip": True}, "round_trip"),
        ({**QUOTE_BODY, "kind": "OUTSTATION", "rental_hours": 4}, "rental_hours"),
    ],
)
def test_an_outstation_request_in_the_wrong_shape_is_refused(
    monkeypatch: pytest.MonkeyPatch, body: dict[str, object], field: str
) -> None:
    pickup_in(monkeypatch)
    outstation_card(served_area())

    response = post(body)

    assert response.status_code == 400
    assert field in str(response.json())


@pytest.mark.django_db
@freeze_time(NOW)
def test_booking_keeps_the_fixed_price_and_the_return_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The price is the quote's: booking copies it, and nothing re-prices it from GPS."""
    pickup_in(monkeypatch)
    outstation_card(served_area())
    client = customer_client(make_user())
    back = NOW + timedelta(days=2)
    client.post(QUOTES, outstation_body(round_trip=True, return_at=back.isoformat()), format="json")
    quote = FareQuote.objects.get()

    response = book(client, quote)

    assert response.status_code == 201, response.json()
    ride = Ride.objects.get()
    assert (ride.kind, ride.round_trip, ride.return_at) == ("OUTSTATION", True, back)
    assert ride.fare_paise == quote.fare_paise
