"""Taxi availability: which tabs show, the rental packages and the book-ahead limits (D6, D19)."""

from typing import Any

import pytest
from django.conf import settings
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.rides.models import RideKind
from tests.rides.parcel_world import AVAILABILITY, make_card, pickup_in, served_area
from tests.rides.taxi_world import outstation_card, rental_card

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


def availability(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    pickup_in(monkeypatch)
    body = APIClient().get(AVAILABILITY).json()
    assert isinstance(body, dict)
    return body


def test_rental_lists_each_vehicle_with_the_packages_it_offers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    area = served_area()
    rental_card(area, "TEMPO", rental_2h_paise=None, rental_4h_paise=229900, rental_8h_paise=399900)
    rental_card(area, "CAB")

    body = availability(monkeypatch)

    assert body["rental"] == [
        {
            "vehicle_type": "CAB",
            "packages": [
                {"hours": 2, "km": 20, "price_paise": 44900},
                {"hours": 4, "km": 40, "price_paise": 84900},
                {"hours": 8, "km": 80, "price_paise": 159900},
            ],
        },
        {
            "vehicle_type": "TEMPO",
            "packages": [
                {"hours": 4, "km": 40, "price_paise": 229900},
                {"hours": 8, "km": 80, "price_paise": 399900},
            ],
        },
    ]


def test_outstation_lists_its_vehicles_cheapest_first(monkeypatch: pytest.MonkeyPatch) -> None:
    area = served_area()
    for vehicle in ("TEMPO", "SUV", "CAB", "INNOVA", "PREMIUM"):
        outstation_card(area, vehicle)

    assert availability(monkeypatch)["outstation"] == ["CAB", "PREMIUM", "SUV", "INNOVA", "TEMPO"]


def test_ride_lists_the_new_vehicles_cheapest_first(monkeypatch: pytest.MonkeyPatch) -> None:
    area = served_area()
    for vehicle in ("INNOVA", "BIKE", "SUV", "EV_CAB", "CAB", "PREMIUM", "AUTO"):
        make_card(area, vehicle)

    assert availability(monkeypatch)["vehicle_types"] == [
        "BIKE",
        "AUTO",
        "CAB",
        "EV_CAB",
        "PREMIUM",
        "SUV",
        "INNOVA",
    ]


def test_book_ahead_limits_come_from_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    served_area()

    assert availability(monkeypatch)["book_ahead"] == {
        "min_minutes": settings.RIDES_BOOKED_LEAD_MINUTES,
        "max_days": settings.RIDES_BOOK_AHEAD_MAX_DAYS,
        "step_minutes": settings.RIDES_BOOK_AHEAD_STEP_MINUTES,
    }
    assert (settings.RIDES_BOOKED_LEAD_MINUTES, settings.RIDES_BOOK_AHEAD_MAX_DAYS) == (60, 7)
    assert settings.RIDES_BOOK_AHEAD_STEP_MINUTES == 15


def test_tabs_are_empty_where_no_card_of_their_kind_is_active(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    area = served_area()
    make_card(area, "CAB")  # rides only
    rental_card(area, "SUV", is_active=False)
    outstation_card(area, "SUV", is_active=False)

    body = availability(monkeypatch)

    assert body["vehicle_types"] == ["CAB"]
    assert (body["rental"], body["outstation"]) == ([], [])


def test_a_rental_card_does_not_switch_on_the_other_tabs(monkeypatch: pytest.MonkeyPatch) -> None:
    rental_card(served_area(), "INNOVA")

    body = availability(monkeypatch)

    assert [item["vehicle_type"] for item in body["rental"]] == ["INNOVA"]
    assert (body["vehicle_types"], body["outstation"], body["parcel"]) == ([], [], [])


def test_everything_is_empty_outside_every_area(monkeypatch: pytest.MonkeyPatch) -> None:
    area = served_area()
    rental_card(area)
    outstation_card(area)
    make_card(area, "BIKE", RideKind.PARCEL)
    pickup_in(monkeypatch, "110001")

    body = APIClient().get(AVAILABILITY).json()

    assert (body["vehicle_types"], body["parcel"], body["rental"], body["outstation"]) == (
        [],
        [],
        [],
        [],
    )
