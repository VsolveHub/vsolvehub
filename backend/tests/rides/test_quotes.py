"""`POST rides/quotes/`: area by pickup postal code, one priced quote per active rate card."""

import logging
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from django.utils import timezone
from freezegun import freeze_time
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.locations.geocoding import GeocodedAddress, GeocodingError
from apps.locations.models import PostalCode, ServiceArea, ServiceAreaPostalCode
from apps.rides import services
from apps.rides.fares import trip_fare_paise
from apps.rides.models import FareQuote, RideRateCard, VehicleType
from apps.rides.routing import get_route
from tests.rides.helpers import customer_client, make_user

pytestmark = pytest.mark.django_db

URL = "/api/v1/rides/quotes/"
SERVED_PIN = "500032"

BODY: dict[str, Any] = {
    "pickup": {"latitude": "17.440000", "longitude": "78.348900", "address": "Gachibowli Stadium"},
    "drop": {"latitude": "17.450000", "longitude": "78.380000", "address": "Hitech City"},
}


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


@pytest.fixture
def area() -> ServiceArea:
    area = ServiceArea.objects.create(
        slug=f"area-{uuid.uuid4().hex[:6]}", name="Gachibowli", timezone="Asia/Kolkata"
    )
    pin, _ = PostalCode.objects.get_or_create(
        code=SERVED_PIN, defaults={"city": "Hyderabad", "state": "Telangana"}
    )
    ServiceAreaPostalCode.objects.create(service_area=area, postal_code=pin)
    return area


def pickup_pin(monkeypatch: pytest.MonkeyPatch, postal_code: str) -> None:
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


def make_card(area: ServiceArea, vehicle_type: str, **overrides: Any) -> RideRateCard:
    fields: dict[str, Any] = {
        "service_area": area,
        "vehicle_type": vehicle_type,
        "base_fare_paise": 2000,
        "included_distance_m": 1000,
        "per_km_paise": 800,
        "per_minute_paise": 100,
        "minimum_fare_paise": 3000,
        "free_waiting_minutes": 3,
        "waiting_per_minute_paise": 100,
    }
    fields.update(overrides)
    return RideRateCard.objects.create(**fields)


def all_cards(area: ServiceArea) -> dict[str, RideRateCard]:
    # Created cab first, so the response order is proven to come from the code, not the table.
    return {vt: make_card(area, vt) for vt in (VehicleType.CAB, VehicleType.BIKE, VehicleType.AUTO)}


def rider() -> tuple[User, APIClient]:
    user = make_user()
    return user, customer_client(user)


def error_code(response: Any) -> str:
    return str(response.json()["error"]["code"])


# --- success ----------------------------------------------------------------------------------


@freeze_time("2026-11-09 10:00:00")
def test_one_priced_quote_per_vehicle_bike_auto_cab(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    cards = all_cards(area)
    _user, client = rider()

    response = client.post(URL, BODY, format="json")

    assert response.status_code == 201
    quotes = response.json()["quotes"]
    assert [q["vehicle_type"] for q in quotes] == ["BIKE", "AUTO", "CAB"]
    pickup = (Decimal("17.440000"), Decimal("78.348900"))
    drop = (Decimal("17.450000"), Decimal("78.380000"))
    for quote in quotes:
        route = get_route(pickup=pickup, drop=drop, vehicle_type=quote["vehicle_type"])
        card = cards[quote["vehicle_type"]]
        assert quote["fare_paise"] == trip_fare_paise(
            card, distance_m=route.distance_m, duration_s=route.duration_s
        )
        assert quote["distance_m"] == route.distance_m
        assert quote["duration_s"] == route.duration_s
        assert quote["route_polyline"] == route.encoded_polyline


@freeze_time("2026-11-09 10:00:00")
def test_quotes_are_saved_for_the_rider_and_expire_in_five_minutes(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    cards = all_cards(area)
    user, client = rider()

    client.post(URL, BODY, format="json")

    saved = FareQuote.objects.filter(rider=user)
    assert saved.count() == 3
    for quote in saved:
        assert quote.service_area == area
        assert quote.rate_card == cards[quote.vehicle_type]
        assert quote.rate_card_version == 1
        assert quote.pickup_label == "Gachibowli Stadium"
        assert quote.drop_label == "Hitech City"
        assert quote.expires_at == timezone.now() + timedelta(seconds=300)
        assert quote.consumed_at is None


def test_only_vehicles_with_an_active_card_are_quoted(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    make_card(area, VehicleType.BIKE)
    make_card(area, VehicleType.CAB, is_active=False)

    response = rider()[1].post(URL, BODY, format="json")

    assert [q["vehicle_type"] for q in response.json()["quotes"]] == ["BIKE"]


def test_the_quote_keeps_the_version_it_was_priced_on(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    make_card(area, VehicleType.BIKE, is_active=False)
    make_card(area, VehicleType.BIKE, version=2, base_fare_paise=9000)

    rider()[1].post(URL, BODY, format="json")

    assert FareQuote.objects.get().rate_card_version == 2


def test_the_drop_may_be_outside_the_area(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    make_card(area, VehicleType.BIKE)
    far_drop = {
        **BODY,
        "drop": {"latitude": "17.800000", "longitude": "78.900000", "address": "Far"},
    }

    assert rider()[1].post(URL, far_drop, format="json").status_code == 201


# --- refusals ---------------------------------------------------------------------------------


def test_pickup_outside_every_area_is_not_served(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, "560001")
    all_cards(area)

    response = rider()[1].post(URL, BODY, format="json")

    assert response.status_code == 422
    assert error_code(response) == "area_not_served"
    assert not FareQuote.objects.exists()


def test_pickup_without_a_postal_code_is_not_served(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, "")
    all_cards(area)

    assert error_code(rider()[1].post(URL, BODY, format="json")) == "area_not_served"


@pytest.mark.usefixtures("area")
def test_an_area_without_active_cards_is_not_served(monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)

    assert error_code(rider()[1].post(URL, BODY, format="json")) == "area_not_served"


def test_an_inactive_area_is_not_served(area: ServiceArea, monkeypatch: pytest.MonkeyPatch) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    all_cards(area)
    area.is_active = False
    area.save(update_fields=("is_active",))

    assert error_code(rider()[1].post(URL, BODY, format="json")) == "area_not_served"


def test_routing_failure_is_503_and_saves_nothing(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch, settings: SettingsWrapper
) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    all_cards(area)
    settings.RIDES_ROUTING_PROVIDER = "unconfigured"

    response = rider()[1].post(URL, BODY, format="json")

    assert response.status_code == 503
    assert error_code(response) == "routing_unavailable"
    assert not FareQuote.objects.exists()


def test_geocoding_failure_is_503(area: ServiceArea, monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(**_: Any) -> GeocodedAddress:
        raise GeocodingError("down")

    monkeypatch.setattr(services, "reverse_geocode", broken)
    all_cards(area)

    response = rider()[1].post(URL, BODY, format="json")

    assert response.status_code == 503
    assert error_code(response) == "routing_unavailable"


def test_anonymous_callers_are_refused() -> None:
    assert APIClient().post(URL, BODY, format="json").status_code in (401, 403)


def test_pickup_and_drop_must_differ() -> None:
    same = {**BODY, "drop": {**BODY["pickup"], "address": "Same"}}
    assert rider()[1].post(URL, same, format="json").status_code == 400


@pytest.mark.parametrize(
    "pickup",
    [
        {"latitude": "91.000000", "longitude": "78.0", "address": "x"},
        {"latitude": "17.0", "longitude": "181.000000", "address": "x"},
        {"latitude": "17.0", "longitude": "78.0", "address": ""},
        {"latitude": "17.0", "longitude": "78.0"},
    ],
)
def test_invalid_points_are_rejected(pickup: dict[str, str]) -> None:
    assert rider()[1].post(URL, {**BODY, "pickup": pickup}, format="json").status_code == 400


def test_the_log_never_carries_the_riders_whereabouts(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    all_cards(area)

    with caplog.at_level(logging.INFO, logger="apps.rides.services"):
        rider()[1].post(URL, BODY, format="json")

    record = next(r for r in caplog.records if r.getMessage() == "ride_quotes_created")
    logged = str(record.__dict__)
    assert "17.44" not in logged
    assert "Gachibowli Stadium" not in logged


def test_price_checks_are_limited_to_20_a_minute() -> None:
    client = customer_client(make_user("Busy Rider"))

    # The limit counts every call, so empty bodies (400) are enough to reach it cheaply.
    answers = [client.post(URL, {}, format="json").status_code for _ in range(21)]

    assert answers[:20] == [400] * 20
    assert answers[20] == 429


# --- availability: the Rides entry on Home (Revision 2, R1) -----------------------------------

AVAILABILITY = "/api/v1/rides/availability/?latitude=17.440000&longitude=78.348900"


def test_availability_lists_bookable_vehicles_cheapest_first(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    all_cards(area)

    response = APIClient().get(AVAILABILITY)  # Home is open to signed-out visitors

    assert response.status_code == 200
    assert response.json() == {"vehicle_types": ["BIKE", "AUTO", "CAB"]}


def test_availability_leaves_out_a_vehicle_switched_off(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, SERVED_PIN)
    make_card(area, VehicleType.BIKE)
    make_card(area, VehicleType.CAB, is_active=False)

    assert APIClient().get(AVAILABILITY).json() == {"vehicle_types": ["BIKE"]}


def test_availability_is_empty_outside_every_area(
    area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    pickup_pin(monkeypatch, "110001")
    all_cards(area)

    assert APIClient().get(AVAILABILITY).json() == {"vehicle_types": []}


def test_availability_is_503_when_the_place_cannot_be_looked_up(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken(**_: Any) -> GeocodedAddress:
        raise GeocodingError("down")

    monkeypatch.setattr(services, "reverse_geocode", broken)

    response = APIClient().get(AVAILABILITY)

    assert (response.status_code, error_code(response)) == (503, "routing_unavailable")


def test_availability_needs_a_valid_place() -> None:
    assert APIClient().get("/api/v1/rides/availability/?latitude=91&longitude=0").status_code == 400
    assert APIClient().get("/api/v1/rides/availability/").status_code == 400


def test_no_migration_creates_a_rides_catalogue_category() -> None:
    from apps.catalog.models import Category  # noqa: PLC0415

    assert not Category.objects.filter(slug="rides").exists()
