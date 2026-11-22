"""Pick up & Drop: availability, parcel rules and parcel quotes (brief §4.2, D2, D5, D21)."""

from decimal import Decimal

import pytest
from django.conf import settings
from django.db import IntegrityError, transaction
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.rides.fares import trip_fare_paise
from apps.rides.models import FareQuote, RideKind, RideRateCard
from apps.rides.routing import get_route
from tests.rides.helpers import customer_client, make_user
from tests.rides.parcel_world import (
    AVAILABILITY,
    LIMITS,
    QUOTE_BODY,
    QUOTES,
    make_card,
    pickup_in,
    served_area,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


def parcel_quotes(client: APIClient) -> list[dict[str, object]]:
    response = client.post(QUOTES, {**QUOTE_BODY, "kind": "PARCEL"}, format="json")
    assert response.status_code == 201
    return list(response.json()["quotes"])


# --- availability -----------------------------------------------------------------------------


def test_availability_lists_parcel_vehicles_with_their_limits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pickup_in(monkeypatch)
    area = served_area()
    make_card(area, "AUTO", RideKind.PARCEL)  # created first: order comes from the code
    make_card(area, "BIKE", RideKind.PARCEL)

    body = APIClient().get(AVAILABILITY).json()

    assert body["parcel"] == [
        {"vehicle_type": "BIKE", "max_weight_grams": 10_000, "size_label": "40 x 30 x 20 cm"},
        {"vehicle_type": "AUTO", "max_weight_grams": 50_000, "size_label": "1.3 x 3.5 x 3.3 ft"},
    ]


def test_availability_sends_the_parcel_rules_from_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pickup_in(monkeypatch)
    served_area()

    rules = APIClient().get(AVAILABILITY).json()["parcel_rules"]

    assert rules["value_cap_paise"] == 500_000 == settings.RIDES_PARCEL_VALUE_CAP_PAISE
    assert rules["prohibited_items"] == settings.RIDES_PARCEL_PROHIBITED_ITEMS
    assert "Alcohol" in rules["prohibited_items"]
    assert len(rules["prohibited_items"]) == 9


def test_ride_cards_do_not_switch_on_pick_up_and_drop(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    area = served_area()
    make_card(area, "BIKE")

    body = APIClient().get(AVAILABILITY).json()

    assert body["vehicle_types"] == ["BIKE"]
    assert body["parcel"] == []


def test_parcel_cards_do_not_switch_on_rides(monkeypatch: pytest.MonkeyPatch) -> None:
    """The two products have separate off switches (D21)."""
    pickup_in(monkeypatch)
    area = served_area()
    make_card(area, "BIKE", RideKind.PARCEL)

    body = APIClient().get(AVAILABILITY).json()

    assert body["vehicle_types"] == []
    assert [item["vehicle_type"] for item in body["parcel"]] == ["BIKE"]


def test_a_parcel_card_switched_off_leaves_the_list(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    area = served_area()
    make_card(area, "BIKE", RideKind.PARCEL)
    make_card(area, "AUTO", RideKind.PARCEL, is_active=False)

    parcel = APIClient().get(AVAILABILITY).json()["parcel"]

    assert [item["vehicle_type"] for item in parcel] == ["BIKE"]


def test_availability_is_empty_for_both_outside_every_area(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pickup_in(monkeypatch, "110001")
    area = served_area()
    make_card(area, "BIKE", RideKind.PARCEL)

    body = APIClient().get(AVAILABILITY).json()

    assert body["vehicle_types"] == []
    assert body["parcel"] == []


# --- parcel quotes ----------------------------------------------------------------------------


def test_one_parcel_quote_per_vehicle_with_its_limits_priced_from_the_parcel_card(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pickup_in(monkeypatch)
    area = served_area()
    # A cheaper ride card for each: the parcel quote must use the parcel card, not this one.
    make_card(area, "BIKE", base_fare_paise=100, minimum_fare_paise=100)
    parcel_bike = make_card(area, "BIKE", RideKind.PARCEL, base_fare_paise=2500)
    parcel_auto = make_card(area, "AUTO", RideKind.PARCEL, base_fare_paise=4000)
    client = customer_client(make_user())

    quotes = parcel_quotes(client)

    assert [q["vehicle_type"] for q in quotes] == ["BIKE", "AUTO"]
    assert {q["kind"] for q in quotes} == {"PARCEL"}
    pickup = (Decimal("17.440000"), Decimal("78.348900"))
    drop = (Decimal("17.450000"), Decimal("78.380000"))
    for quote, card in zip(quotes, (parcel_bike, parcel_auto), strict=True):
        route = get_route(pickup=pickup, drop=drop, vehicle_type=card.vehicle_type)
        assert quote["fare_paise"] == trip_fare_paise(
            card, distance_m=route.distance_m, duration_s=route.duration_s
        )
        weight, size = LIMITS[card.vehicle_type]
        assert quote["max_weight_grams"] == weight
        assert quote["size_label"] == size
    saved = FareQuote.objects.filter(kind=RideKind.PARCEL)
    assert {q.rate_card_id for q in saved} == {parcel_bike.id, parcel_auto.id}


def test_a_cab_is_never_offered_a_parcel(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    area = served_area()
    make_card(area, "CAB")  # a cab ride card exists
    make_card(area, "BIKE", RideKind.PARCEL)

    quotes = parcel_quotes(customer_client(make_user()))

    assert [q["vehicle_type"] for q in quotes] == ["BIKE"]


def test_the_database_refuses_a_cab_parcel_card() -> None:
    area = served_area()

    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(area, "CAB", RideKind.PARCEL, max_parcel_weight_grams=10_000)

    assert not RideRateCard.objects.filter(kind=RideKind.PARCEL).exists()


def test_a_parcel_card_needs_its_limits_and_a_ride_card_has_none() -> None:
    area = served_area()

    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(area, "BIKE", RideKind.PARCEL, max_parcel_weight_grams=None)
    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(area, "BIKE", RideKind.PARCEL, parcel_size_label="")
    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(area, "BIKE", max_parcel_weight_grams=5000)


def test_a_ride_and_a_parcel_card_can_both_be_active_for_one_vehicle() -> None:
    area = served_area()

    make_card(area, "BIKE")
    make_card(area, "BIKE", RideKind.PARCEL)

    assert RideRateCard.objects.filter(service_area=area, is_active=True).count() == 2
    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(area, "BIKE", RideKind.PARCEL)  # a second active parcel card


def test_a_ride_quote_ignores_parcel_cards(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    area = served_area()
    make_card(area, "BIKE", RideKind.PARCEL)
    ride_card = make_card(area, "AUTO")
    client = customer_client(make_user())

    response = client.post(QUOTES, QUOTE_BODY, format="json")

    quotes = response.json()["quotes"]
    assert [q["vehicle_type"] for q in quotes] == ["AUTO"]
    assert quotes[0]["kind"] == "RIDE"
    assert quotes[0]["max_weight_grams"] is None
    assert quotes[0]["size_label"] == ""
    assert FareQuote.objects.get().rate_card_id == ride_card.id


def test_parcel_quotes_are_refused_where_only_rides_run(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_in(monkeypatch)
    make_card(served_area(), "BIKE")
    client = customer_client(make_user())

    response = client.post(QUOTES, {**QUOTE_BODY, "kind": "PARCEL"}, format="json")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "area_not_served"
    assert not FareQuote.objects.exists()


def test_an_unknown_kind_is_a_bad_request() -> None:
    client = customer_client(make_user())

    response = client.post(QUOTES, {**QUOTE_BODY, "kind": "TRUCK"}, format="json")

    assert response.status_code == 400
