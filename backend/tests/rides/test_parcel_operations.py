"""Operations for Pick up & Drop: list filters, the parcel block, parcel rate cards (§4.2, §7)."""

from typing import Any

import pytest
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.rides.models import RideKind, RideRateCard
from tests.rides.helpers import customer_client, make_user, operations_client, ready_captain
from tests.rides.parcel_world import (
    AVAILABILITY,
    at_drop,
    deliver,
    new_parcel,
    parcel_body,
    picked_up,
    pickup_in,
    returned,
    served_area,
    step,
)
from tests.rides.ride_world import error_code, make_area, new_ride

pytestmark = pytest.mark.django_db

OPS = "/api/v1/operations/rides"
CARDS = f"{OPS}/rate-cards/"

PRICES: dict[str, int] = {
    "base_fare_paise": 2500,
    "included_distance_m": 1000,
    "per_km_paise": 700,
    "per_minute_paise": 100,
    "minimum_fare_paise": 3000,
    "free_waiting_minutes": 3,
    "waiting_per_minute_paise": 100,
}
LIMITS: dict[str, Any] = {"max_parcel_weight_grams": 10_000, "parcel_size_label": "40 x 30 x 20 cm"}


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


@pytest.fixture
def ops() -> APIClient:
    return operations_client(make_user("Ops Person"))


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


def create_card(ops: APIClient, area: ServiceArea, vehicle: str = "BIKE", **extra: Any) -> Any:
    body = {"service_area_id": str(area.id), "vehicle_type": vehicle, **PRICES, **extra}
    return ops.post(CARDS, body, format="json")


# --- rate cards -------------------------------------------------------------------------------


def test_create_a_parcel_card_with_its_limits(ops: APIClient) -> None:
    area = served_area()

    response = create_card(ops, area, kind="PARCEL", **LIMITS)

    assert response.status_code == 201
    body = response.json()
    assert (body["kind"], body["version"], body["is_active"]) == ("PARCEL", 1, True)
    assert (body["max_parcel_weight_grams"], body["parcel_size_label"]) == (
        10_000,
        "40 x 30 x 20 cm",
    )


def test_a_ride_card_has_no_limits(ops: APIClient) -> None:
    body = create_card(ops, served_area()).json()

    assert body["kind"] == "RIDE"
    assert (body["max_parcel_weight_grams"], body["parcel_size_label"]) == (None, "")


@pytest.mark.parametrize("missing", ["max_parcel_weight_grams", "parcel_size_label"])
def test_a_parcel_card_needs_both_limits(ops: APIClient, missing: str) -> None:
    limits = {k: v for k, v in LIMITS.items() if k != missing}

    response = create_card(ops, served_area(), kind="PARCEL", **limits)

    assert response.status_code == 400
    assert not RideRateCard.objects.exists()


@pytest.mark.parametrize("field", ["max_parcel_weight_grams", "parcel_size_label"])
def test_a_ride_card_refuses_limits(ops: APIClient, field: str) -> None:
    response = create_card(ops, served_area(), **{field: LIMITS[field]})

    assert response.status_code == 400
    assert not RideRateCard.objects.exists()


@pytest.mark.parametrize("weight", [0, -5])
def test_the_weight_must_be_positive(ops: APIClient, weight: int) -> None:
    response = create_card(
        ops, served_area(), kind="PARCEL", **{**LIMITS, "max_parcel_weight_grams": weight}
    )

    assert response.status_code == 400


def test_there_is_no_cab_parcel_card(ops: APIClient) -> None:
    response = create_card(ops, served_area(), vehicle="CAB", kind="PARCEL", **LIMITS)

    assert response.status_code == 400
    assert not RideRateCard.objects.exists()


def test_an_unknown_kind_is_refused(ops: APIClient) -> None:
    assert create_card(ops, served_area(), kind="TRUCK").status_code == 400


def test_a_ride_card_and_a_parcel_card_can_both_be_live_and_both_start_at_version_one(
    ops: APIClient,
) -> None:
    area = served_area()

    ride = create_card(ops, area)
    parcel = create_card(ops, area, kind="PARCEL", **LIMITS)

    assert (ride.status_code, parcel.status_code) == (201, 201)
    assert (ride.json()["version"], parcel.json()["version"]) == (1, 1)


def test_a_second_live_card_of_the_same_kind_is_refused_per_kind(ops: APIClient) -> None:
    area = served_area()
    create_card(ops, area, kind="PARCEL", **LIMITS)

    again = create_card(ops, area, kind="PARCEL", **LIMITS)
    ride = create_card(ops, area)  # a ride card is a different kind, so allowed

    assert (again.status_code, error_code(again)) == (409, "rate_card_exists")
    assert ride.status_code == 201


def test_the_list_shows_the_kind_and_can_be_filtered(ops: APIClient) -> None:
    area = served_area()
    create_card(ops, area)
    create_card(ops, area, kind="PARCEL", **LIMITS)

    everything = ops.get(CARDS).json()
    parcels = ops.get(f"{CARDS}?kind=PARCEL").json()
    rides = ops.get(f"{CARDS}?kind=RIDE").json()

    assert sorted(card["kind"] for card in everything) == ["PARCEL", "RIDE"]
    assert [card["kind"] for card in parcels] == ["PARCEL"]
    assert [card["kind"] for card in rides] == ["RIDE"]
    assert ops.get(f"{CARDS}?kind=TRUCK").status_code == 400


def test_a_price_edit_keeps_the_kind_and_the_limits(ops: APIClient) -> None:
    card = create_card(ops, served_area(), kind="PARCEL", **LIMITS).json()

    response = ops.patch(f"{CARDS}{card['id']}/", {"base_fare_paise": 3100}, format="json")

    assert response.status_code == 200
    new = response.json()
    assert (new["kind"], new["version"], new["base_fare_paise"]) == ("PARCEL", 2, 3100)
    assert (new["max_parcel_weight_grams"], new["parcel_size_label"]) == (10_000, "40 x 30 x 20 cm")
    assert RideRateCard.objects.get(pk=card["id"]).is_active is False
    assert RideRateCard.objects.filter(kind=RideKind.PARCEL, is_active=True).count() == 1
    assert RideRateCard.objects.filter(kind=RideKind.RIDE).count() == 0  # never turned into a ride


def test_the_limits_can_be_changed_on_their_own(ops: APIClient) -> None:
    card = create_card(ops, served_area(), kind="PARCEL", **LIMITS).json()

    response = ops.patch(
        f"{CARDS}{card['id']}/",
        {"max_parcel_weight_grams": 15_000, "parcel_size_label": "50 x 40 x 30 cm"},
        format="json",
    )

    assert response.status_code == 200
    new = response.json()
    assert (new["version"], new["base_fare_paise"]) == (2, 2500)  # prices carried over
    assert (new["max_parcel_weight_grams"], new["parcel_size_label"]) == (
        15_000,
        "50 x 40 x 30 cm",
    )


def test_a_ride_card_refuses_a_limit_edit(ops: APIClient) -> None:
    card = create_card(ops, served_area()).json()

    response = ops.patch(
        f"{CARDS}{card['id']}/", {"max_parcel_weight_grams": 15_000}, format="json"
    )

    assert response.status_code == 400
    assert RideRateCard.objects.get(pk=card["id"]).is_active is True  # nothing was retired


def test_a_ride_price_edit_stays_a_ride_card(ops: APIClient) -> None:
    card = create_card(ops, served_area()).json()

    new = ops.patch(f"{CARDS}{card['id']}/", {"base_fare_paise": 2800}, format="json").json()

    assert (new["kind"], new["version"], new["max_parcel_weight_grams"]) == ("RIDE", 2, None)


def test_an_empty_edit_is_refused(ops: APIClient) -> None:
    card = create_card(ops, served_area(), kind="PARCEL", **LIMITS).json()

    assert ops.patch(f"{CARDS}{card['id']}/", {}, format="json").status_code == 400


def test_switching_a_parcel_card_off_hides_only_pick_up_and_drop(
    ops: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The one off switch per product (D21): rides keep running."""
    pickup_in(monkeypatch)
    area = served_area()
    create_card(ops, area)
    parcel = create_card(ops, area, kind="PARCEL", **LIMITS).json()
    before = APIClient().get(AVAILABILITY).json()
    assert before["vehicle_types"] == ["BIKE"] and len(before["parcel"]) == 1

    ops.patch(f"{CARDS}{parcel['id']}/", {"is_active": False}, format="json")

    after = APIClient().get(AVAILABILITY).json()
    assert after["vehicle_types"] == ["BIKE"]
    assert after["parcel"] == []


def test_only_operations_can_manage_parcel_cards() -> None:
    area = served_area()
    body = {"service_area_id": str(area.id), "vehicle_type": "BIKE", "kind": "PARCEL"}

    assert customer_client(make_user()).post(CARDS, body, format="json").status_code == 403
    _captain, partner = ready_captain()
    assert partner.post(CARDS, body, format="json").status_code == 403


# --- the rides list ---------------------------------------------------------------------------


def listing(ops: APIClient, query: str = "") -> list[dict[str, Any]]:
    response = ops.get(f"{OPS}/{query}")
    assert response.status_code == 200
    return list(response.json()["results"])


def test_the_list_shows_the_kind(ops: APIClient, rider: User) -> None:
    area = make_area()
    new_parcel(rider, area)

    [row] = listing(ops)

    assert row["kind"] == "PARCEL"


def test_the_kind_filter(ops: APIClient, rider: User) -> None:
    area = make_area()
    parcel = new_parcel(rider, area)
    ride = new_ride(make_user("Other Rider"), area)

    assert [r["id"] for r in listing(ops, "?kind=PARCEL")] == [str(parcel.id)]
    assert [r["id"] for r in listing(ops, "?kind=RIDE")] == [str(ride.id)]
    assert {r["id"] for r in listing(ops, "?kind=RIDE,PARCEL")} == {str(parcel.id), str(ride.id)}
    assert {r["id"] for r in listing(ops)} == {str(parcel.id), str(ride.id)}


@pytest.mark.usefixtures("ride_redis")
def test_the_unpaid_filter_finds_the_parcels_to_follow_up(ops: APIClient, rider: User) -> None:
    area = make_area()
    unpaid, driver = returned(rider, area, parcel=parcel_body(payer="RECEIVER"))
    step(driver, unpaid, "payment-not-received")
    paid_up, driver2 = returned(make_user("Rider Two"), area, parcel=parcel_body(payer="SENDER"))
    step(driver2, paid_up, "payment-received")

    rows = listing(ops, "?payment_status=UNPAID")

    assert [row["id"] for row in rows] == [str(unpaid.id)]
    assert rows[0]["payment_status"] == "UNPAID"
    assert listing(ops, "?payment_status=UNPAID&kind=RIDE") == []


@pytest.mark.parametrize("query", ["?kind=TRUCK", "?payment_status=PAID", "?state=NOPE"])
def test_an_unknown_filter_value_is_refused(ops: APIClient, query: str) -> None:
    response = ops.get(f"{OPS}/{query}")

    assert response.status_code == 400


def test_only_operations_can_list_rides(rider: User) -> None:
    assert customer_client(rider).get(f"{OPS}/").status_code == 403


# --- the ride detail --------------------------------------------------------------------------


@pytest.mark.usefixtures("ride_redis")
def test_the_detail_has_the_whole_parcel_block(ops: APIClient, rider: User) -> None:
    ride, _driver = picked_up(rider, make_area(), parcel=parcel_body(payer="RECEIVER"))

    body = ops.get(f"{OPS}/{ride.id}/").json()

    parcel = body["parcel"]
    assert body["kind"] == "PARCEL"
    assert (parcel["mode"], parcel["payer"], parcel["pin_required"]) == ("SEND", "RECEIVER", True)
    assert parcel["payment_point"] == "DROP"
    assert parcel["pickup"] == {
        "name": "Ravi Kumar",
        "phone": "9123456780",
        "building": "Sky Towers",
        "unit": "4B",
        "meet_at": "CURB",
        "instructions": "Ring twice",
    }
    assert parcel["drop"]["name"] == "Asha Rao" and parcel["drop"]["phone"] == "9876543210"
    assert parcel["pin_attempts"] == 0
    assert parcel["arrived_at_drop_at"] is None and parcel["delivered_at"] is None
    assert "delivery_pin" not in parcel  # Operations see the tries, never the PIN


@pytest.mark.usefixtures("ride_redis")
def test_the_detail_shows_the_return_and_the_money(ops: APIClient, rider: User) -> None:
    ride, _driver = returned(rider, make_area(), parcel=parcel_body(payer="RECEIVER"))

    parcel = ops.get(f"{OPS}/{ride.id}/").json()["parcel"]

    assert parcel["receiver_unavailable_at"] and parcel["returned_at"]
    assert parcel["return_fare_paise"] > 0
    assert parcel["return_payment_status"] == "DUE"


@pytest.mark.usefixtures("ride_redis")
def test_operations_still_see_the_contacts_after_the_parcel_is_finished(
    ops: APIClient, rider: User
) -> None:
    ride, driver = at_drop(rider, make_area(), parcel=parcel_body(pin_required=False))
    deliver(driver, ride)

    body = ops.get(f"{OPS}/{ride.id}/").json()

    assert body["state"] == "COMPLETED"
    assert body["parcel"]["drop"]["phone"] == "9876543210"  # D20: Operations always can
    assert body["parcel"]["delivered_at"] is not None


def test_a_normal_ride_has_no_parcel_block(ops: APIClient, rider: User) -> None:
    ride = new_ride(rider, make_area())

    body = ops.get(f"{OPS}/{ride.id}/").json()

    assert (body["kind"], body["parcel"]) == ("RIDE", None)


def test_the_parcel_detail_does_not_query_per_field(
    ops: APIClient, rider: User, django_assert_max_num_queries: Any
) -> None:
    ride = new_parcel(rider, make_area())

    with django_assert_max_num_queries(20):
        assert ops.get(f"{OPS}/{ride.id}/").status_code == 200
