"""Taxi rentals: packages, quotes with no drop, and extras from the GPS track (D10, D11)."""

from decimal import Decimal

import pytest
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper

from apps.rides.fares import rental_extras, rental_fare_paise, rental_included_km, track_metres
from apps.rides.models import FareQuote, Ride, RideKind, RideRateCard, RideTrackPoint
from tests.rides.helpers import customer_client, make_user
from tests.rides.parcel_world import QUOTES, make_card, pickup_in, served_area
from tests.rides.ride_world import book, error_code
from tests.rides.taxi_world import RENTAL_FIELDS, rental_body, rental_card

#: One km north, in degrees of latitude (1 / 111.195 km).
KM_NORTH = Decimal("0.008993")


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


def card(**overrides: object) -> RideRateCard:
    """An unsaved rental card, for the fare rules that need no database."""
    return RideRateCard(vehicle_type="CAB", kind=RideKind.RENTAL, **{**RENTAL_FIELDS, **overrides})


def point(km_north: int, accuracy_m: int = 10) -> RideTrackPoint:
    return RideTrackPoint(
        latitude=Decimal("17.000000") + KM_NORTH * km_north,
        longitude=Decimal("78.000000"),
        accuracy_m=accuracy_m,
        captured_at=timezone.now(),
    )


# --- packages and extras (no database) --------------------------------------------------------


@pytest.mark.parametrize(("hours", "km"), [(2, 20), (4, 40), (8, 80)])
def test_each_package_includes_ten_km_an_hour(hours: int, km: int) -> None:
    assert rental_included_km(hours) == km


def test_the_package_price_comes_from_the_card() -> None:
    assert [rental_fare_paise(card(), hours) for hours in (2, 4, 8)] == [44900, 84900, 159900]


def test_a_package_the_card_leaves_out_has_no_price() -> None:
    assert rental_fare_paise(card(rental_2h_paise=None), 2) is None


def test_there_is_no_three_hour_package() -> None:
    with pytest.raises(ValueError, match="No 3 h rental package"):
        rental_fare_paise(card(), 3)


def test_no_extras_inside_the_package() -> None:
    assert rental_extras(card(), hours=4, used_seconds=4 * 3600, used_metres=40_999) == (0, 0, 0)


def test_extra_km_are_whole_km_rounded_down() -> None:
    # 47.9 km on a 40 km package: 7 extra km, never 8.
    extra_km, _, extras = rental_extras(card(), hours=4, used_seconds=3600, used_metres=47_900)
    assert (extra_km, extras) == (7, 7 * 1200)


def test_every_started_minute_past_the_package_is_charged() -> None:
    _, extra_minutes, extras = rental_extras(
        card(), hours=2, used_seconds=2 * 3600 + 61, used_metres=0
    )
    assert (extra_minutes, extras) == (2, 2 * 200)


def test_extras_add_km_and_minutes() -> None:
    assert rental_extras(card(), hours=2, used_seconds=2 * 3600 + 600, used_metres=23_500) == (
        3,
        10,
        3 * 1200 + 10 * 200,
    )


def test_extras_refuse_negative_use() -> None:
    with pytest.raises(ValueError, match="must not be negative"):
        rental_extras(card(), hours=2, used_seconds=-1, used_metres=0)


def test_track_metres_adds_up_the_track() -> None:
    assert track_metres([point(0), point(1), point(3)]) == pytest.approx(3000, abs=2)


def test_track_metres_skips_inaccurate_points() -> None:
    """A bad fix 50 km away is left out, so it is never billed."""
    track = [point(0), point(50, accuracy_m=51), point(1)]
    assert track_metres(track) == pytest.approx(1000, abs=1)


def test_track_metres_keeps_a_point_at_the_accuracy_limit() -> None:
    assert track_metres([point(0), point(1, accuracy_m=50)]) == pytest.approx(1000, abs=1)


def test_track_metres_is_whole_metres() -> None:
    metres = track_metres([point(0), point(1)])
    assert isinstance(metres, int)


def test_an_empty_or_single_point_track_is_zero() -> None:
    assert track_metres([]) == 0
    assert track_metres([point(0)]) == 0


# --- rental quotes ----------------------------------------------------------------------------


@pytest.mark.django_db
def test_one_rental_quote_per_vehicle_priced_as_the_package(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pickup_in(monkeypatch)
    area = served_area()
    rental_card(area, "SUV", rental_4h_paise=109900, per_km_paise=1500, per_minute_paise=300)
    rental_card(area, "CAB")
    client = customer_client(make_user())

    response = client.post(QUOTES, rental_body(4), format="json")

    assert response.status_code == 201
    quotes = response.json()["quotes"]
    assert [q["vehicle_type"] for q in quotes] == ["CAB", "SUV"]  # cheapest first
    cab, suv = quotes
    assert (cab["fare_paise"], suv["fare_paise"]) == (84900, 109900)
    assert cab["kind"] == "RENTAL"
    assert cab["rental_hours"] == 4
    assert cab["included_km"] == 40
    assert (cab["extra_km_paise"], cab["extra_minute_paise"]) == (1200, 200)
    assert (suv["extra_km_paise"], suv["extra_minute_paise"]) == (1500, 300)
    assert (cab["distance_m"], cab["duration_s"], cab["route_polyline"]) == (40_000, 14_400, "")
    assert (cab["billed_km"], cab["days"], cab["round_trip"], cab["return_at"]) == (
        None,
        None,
        False,
        None,
    )


@pytest.mark.django_db
def test_a_rental_quote_has_no_drop(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    rental_card(served_area())

    customer_client(make_user()).post(QUOTES, rental_body(2), format="json")

    quote = FareQuote.objects.get()
    assert (quote.drop_latitude, quote.drop_longitude, quote.drop_label) == (None, None, "")


@pytest.mark.django_db
def test_a_vehicle_without_the_package_is_left_out(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    area = served_area()
    rental_card(area, "CAB")
    rental_card(area, "TEMPO", rental_2h_paise=None)  # Tempo Traveller: no 2 h package

    quotes = customer_client(make_user()).post(QUOTES, rental_body(2), format="json").json()

    assert [q["vehicle_type"] for q in quotes["quotes"]] == ["CAB"]


@pytest.mark.django_db
def test_a_package_no_vehicle_offers_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    rental_card(served_area(), "TEMPO", rental_2h_paise=None)

    response = customer_client(make_user()).post(QUOTES, rental_body(2), format="json")

    assert response.status_code == 422
    assert error_code(response) == "rental_package_unavailable"
    assert not FareQuote.objects.exists()


@pytest.mark.django_db
def test_no_rental_card_means_no_rental_here(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    make_card(served_area(), "CAB")  # a ride card only

    response = customer_client(make_user()).post(QUOTES, rental_body(4), format="json")

    assert response.status_code == 422
    assert error_code(response) == "area_not_served"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("body", "field"),
    [
        (rental_body(4, drop={"latitude": "17.45", "longitude": "78.38", "address": "X"}), "drop"),
        ({"pickup": rental_body()["pickup"], "kind": "RENTAL"}, "rental_hours"),
        (rental_body(3), "rental_hours"),
        (rental_body(4, round_trip=True), "round_trip"),
    ],
)
def test_a_rental_request_in_the_wrong_shape_is_refused(
    monkeypatch: pytest.MonkeyPatch, body: dict[str, object], field: str
) -> None:
    pickup_in(monkeypatch)
    rental_card(served_area())

    response = customer_client(make_user()).post(QUOTES, body, format="json")

    assert response.status_code == 400
    assert field in str(response.json())


@pytest.mark.django_db
def test_booking_a_rental_quote_keeps_its_package(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    rental_card(served_area())
    client = customer_client(make_user())
    client.post(QUOTES, rental_body(8), format="json")
    quote = FareQuote.objects.get()

    response = book(client, quote)

    assert response.status_code == 201, response.json()
    ride = Ride.objects.get()
    assert (ride.kind, ride.rental_hours, ride.fare_paise) == ("RENTAL", 8, 159900)
    assert ride.drop_latitude is None
