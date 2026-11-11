"""Operations APIs: rate cards (an edit is a new version) and pass plans."""

import uuid
from typing import Any

import pytest

from apps.locations.models import ServiceArea
from apps.rides.models import CaptainPassPlan, RideRateCard
from tests.rides.helpers import customer_client, make_user, operations_client, ready_captain

pytestmark = pytest.mark.django_db

CARDS = "/api/v1/operations/rides/rate-cards/"
PLANS = "/api/v1/operations/rides/pass-plans/"

RATES: dict[str, int] = {
    "base_fare_paise": 1500,
    "included_distance_m": 1000,
    "per_km_paise": 600,
    "per_minute_paise": 100,
    "minimum_fare_paise": 2500,
    "free_waiting_minutes": 3,
    "waiting_per_minute_paise": 100,
}


@pytest.fixture
def ops() -> Any:
    return operations_client(make_user("Ops Person"))


@pytest.fixture
def area() -> ServiceArea:
    return ServiceArea.objects.create(
        slug=f"area-{uuid.uuid4().hex[:6]}", name="Gachibowli", timezone="Asia/Kolkata"
    )


def create(ops: Any, area: ServiceArea, vehicle: str = "BIKE", **rates: int) -> Any:
    body = {"service_area_id": str(area.id), "vehicle_type": vehicle, **RATES, **rates}
    return ops.post(CARDS, body, format="json")


def error_code(response: Any) -> str:
    return str(response.json()["error"]["code"])


# --- rate cards -------------------------------------------------------------------------------


def test_create_a_card(ops: Any, area: ServiceArea) -> None:
    response = create(ops, area)

    assert response.status_code == 201
    body = response.json()
    assert (body["version"], body["is_active"], body["base_fare_paise"]) == (1, True, 1500)
    assert body["service_area_name"] == "Gachibowli"
    assert RideRateCard.objects.get().created_by is not None


def test_a_second_active_card_is_refused(ops: Any, area: ServiceArea) -> None:
    create(ops, area)
    response = create(ops, area)
    assert (response.status_code, error_code(response)) == (409, "rate_card_exists")


def test_a_price_edit_is_a_new_version_and_the_old_one_retires(ops: Any, area: ServiceArea) -> None:
    first = create(ops, area).json()

    response = ops.patch(f"{CARDS}{first['id']}/", {"per_km_paise": 700}, format="json")

    assert response.status_code == 200
    new = response.json()
    assert (new["version"], new["is_active"], new["per_km_paise"]) == (2, True, 700)
    assert new["base_fare_paise"] == 1500  # unchanged fields are copied
    old = RideRateCard.objects.get(id=first["id"])
    assert (old.is_active, old.per_km_paise) == (False, 600)


def test_switching_a_card_off_makes_no_new_version(ops: Any, area: ServiceArea) -> None:
    card = create(ops, area).json()

    response = ops.patch(f"{CARDS}{card['id']}/", {"is_active": False}, format="json")

    assert response.json()["is_active"] is False
    assert RideRateCard.objects.count() == 1


def test_a_vehicle_switched_off_can_be_priced_again_as_the_next_version(
    ops: Any, area: ServiceArea
) -> None:
    card = create(ops, area).json()
    ops.patch(f"{CARDS}{card['id']}/", {"is_active": False}, format="json")

    assert create(ops, area).json()["version"] == 2


def test_only_the_active_card_can_be_edited(ops: Any, area: ServiceArea) -> None:
    first = create(ops, area).json()
    ops.patch(f"{CARDS}{first['id']}/", {"per_km_paise": 700}, format="json")

    response = ops.patch(f"{CARDS}{first['id']}/", {"per_km_paise": 900}, format="json")

    assert (response.status_code, error_code(response)) == (409, "rate_card_inactive")


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"is_active": True},
        {"is_active": False, "per_km_paise": 700},
        {"per_km_paise": -1},
    ],
)
def test_bad_edits_are_rejected(ops: Any, area: ServiceArea, body: dict[str, Any]) -> None:
    card = create(ops, area).json()
    assert ops.patch(f"{CARDS}{card['id']}/", body, format="json").status_code == 400


def test_negative_or_missing_prices_are_rejected(ops: Any, area: ServiceArea) -> None:
    assert create(ops, area, base_fare_paise=-1).status_code == 400
    body = {"service_area_id": str(area.id), "vehicle_type": "BIKE"}
    assert ops.post(CARDS, body, format="json").status_code == 400


def test_unknown_area_or_card_is_404(ops: Any) -> None:
    body = {"service_area_id": str(uuid.uuid4()), "vehicle_type": "BIKE", **RATES}
    assert ops.post(CARDS, body, format="json").status_code == 404
    assert ops.patch(f"{CARDS}{uuid.uuid4()}/", RATES, format="json").status_code == 404


def test_list_filters(ops: Any, area: ServiceArea) -> None:
    create(ops, area, "BIKE")
    create(ops, area, "CAB")

    assert len(ops.get(CARDS).json()) == 2
    assert [c["vehicle_type"] for c in ops.get(f"{CARDS}?vehicle_type=CAB").json()] == ["CAB"]
    assert len(ops.get(f"{CARDS}?service_area_id={area.id}&active=true").json()) == 2
    assert ops.get(f"{CARDS}?service_area_id=not-an-id").status_code == 400


def test_only_operations_can_touch_rate_cards(area: ServiceArea) -> None:
    for client in (customer_client(make_user("A Customer")), ready_captain()[1]):
        assert client.get(CARDS).status_code == 403
        body = {"service_area_id": str(area.id), "vehicle_type": "BIKE", **RATES}
        assert client.post(CARDS, body, format="json").status_code == 403


# --- pass plans -------------------------------------------------------------------------------


PLAN = {"code": "week-pass", "name": "Week pass", "price_paise": 24900, "duration_hours": 168}


def test_create_and_list_plans(ops: Any) -> None:
    assert ops.post(PLANS, PLAN, format="json").status_code == 201
    assert [p["code"] for p in ops.get(PLANS).json()] == ["week-pass"]


def test_a_plan_code_is_unique(ops: Any) -> None:
    ops.post(PLANS, PLAN, format="json")
    assert ops.post(PLANS, PLAN, format="json").status_code == 400


@pytest.mark.parametrize(
    "bad", [{"price_paise": -1}, {"duration_hours": 0}, {"code": "Not A Slug"}]
)
def test_bad_plans_are_rejected(ops: Any, bad: dict[str, Any]) -> None:
    assert ops.post(PLANS, {**PLAN, **bad}, format="json").status_code == 400


def test_edit_a_plan_but_never_its_code(ops: Any) -> None:
    plan = ops.post(PLANS, PLAN, format="json").json()
    url = f"{PLANS}{plan['id']}/"

    assert ops.patch(url, {"price_paise": 19900}, format="json").json()["price_paise"] == 19900
    assert ops.patch(url, {"code": "other"}, format="json").status_code == 400


def test_a_switched_off_plan_leaves_the_captains_shop(ops: Any) -> None:
    plan = ops.post(PLANS, PLAN, format="json").json()
    ops.patch(f"{PLANS}{plan['id']}/", {"is_active": False}, format="json")

    shop = ready_captain()[1].get("/api/v1/partner/rides/pass-plans/").json()

    assert shop == []
    assert CaptainPassPlan.objects.get().is_active is False


def test_only_operations_can_touch_pass_plans() -> None:
    client = ready_captain()[1]
    assert client.get(PLANS).status_code == 403
    assert client.post(PLANS, PLAN, format="json").status_code == 403
