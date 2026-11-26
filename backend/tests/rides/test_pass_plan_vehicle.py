"""Daily Pass per vehicle and the trip limit (Taxi brief A4)."""

from datetime import timedelta
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides import engine, selectors
from apps.rides.models import (
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    Ride,
    RideOffer,
    RideState,
)
from apps.rides.services import expire_passes
from tests.rides.helpers import make_user, operations_client, ready_captain
from tests.rides.parcel_world import at_drop, deliver, ping_at, returned
from tests.rides.ride_world import PICKUP, captain, dispatch, error_code, make_area, new_ride

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]

PLANS_URL = "/api/v1/partner/rides/pass-plans/"
PASSES_URL = "/api/v1/partner/rides/passes/"
OPS_PLANS_URL = "/api/v1/operations/rides/pass-plans/"


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


def plan(code: str, **overrides: Any) -> CaptainPassPlan:
    fields: dict[str, Any] = {
        "code": code,
        "name": code.title(),
        "price_paise": 0,
        "duration_hours": 24,
    }
    fields.update(overrides)
    return CaptainPassPlan.objects.create(**fields)


def launch_pass_with(max_trips: int | None) -> None:
    """The plan `ride_world.captain` gives every captain, here with a trip limit."""
    plan("launch-pass", max_trips=max_trips)


def buy(client: Any, plan_id: Any) -> Any:
    return client.post(
        PASSES_URL, {"plan_id": str(plan_id)}, format="json", HTTP_IDEMPOTENCY_KEY="key-1"
    )


def complete_a_ride(driver: PartnerProfile, rider: User, area: ServiceArea) -> Ride:
    """`driver` takes the ride, arrives, starts and completes it."""
    ride = dispatch(new_ride(rider, area))
    engine.accept_offer(partner=driver, offer_id=RideOffer.objects.get(ride=ride).id)
    ping_at(driver, PICKUP)
    engine.mark_arrived(partner=driver, ride_id=ride.id)
    engine.start_trip(partner=driver, ride_id=ride.id, otp=engine.ride_otp(ride.id))
    return engine.complete_trip(partner=driver, ride_id=ride.id)


def pass_of(driver: PartnerProfile) -> CaptainPass:
    return CaptainPass.objects.get(partner=driver, plan__code="launch-pass")


# --- which plans a captain sees and buys ------------------------------------------------------


def test_a_captain_sees_their_vehicles_plans_and_the_every_vehicle_ones() -> None:
    plan("bike-day", vehicle_type="BIKE")
    plan("cab-day", vehicle_type="CAB")
    plan("launch")

    body = ready_captain()[1].get(PLANS_URL).json()  # a Bike captain

    assert sorted(p["code"] for p in body) == ["bike-day", "launch"]


def test_a_plan_for_another_vehicle_is_refused() -> None:
    cab_day = plan("cab-day", vehicle_type="CAB")

    response = buy(ready_captain()[1], cab_day.id)

    assert (response.status_code, error_code(response)) == (409, "plan_not_for_vehicle")
    assert not CaptainPass.objects.exists()


def test_a_plan_for_the_captains_own_vehicle_can_be_bought() -> None:
    bike_day = plan("bike-day", vehicle_type="BIKE", max_trips=10)

    response = buy(ready_captain()[1], bike_day.id)

    assert response.status_code == 201
    assert response.json()["plan"]["max_trips"] == 10


# --- the trip limit ---------------------------------------------------------------------------


def test_the_trip_that_reaches_the_limit_ends_the_pass(rider: User, area: ServiceArea) -> None:
    launch_pass_with(max_trips=1)
    driver = captain(area, km=1)

    ride = complete_a_ride(driver, rider, area)

    assert pass_of(driver).ends_at == ride.completed_at
    assert selectors.active_pass(driver) is None  # no more offers: dispatch needs one
    expire_passes()
    assert pass_of(driver).status == CaptainPass.Status.EXPIRED
    duty = CaptainDutySession.objects.get(partner=driver)
    assert duty.end_reason == CaptainDutySession.EndReason.PASS_EXPIRED


def test_a_trip_under_the_limit_leaves_the_pass_running(rider: User, area: ServiceArea) -> None:
    launch_pass_with(max_trips=2)
    driver = captain(area, km=1)

    complete_a_ride(driver, rider, area)

    assert selectors.active_pass(driver) is not None


def test_a_delivered_parcel_is_one_trip(rider: User, area: ServiceArea) -> None:
    launch_pass_with(max_trips=1)
    ride, driver = at_drop(rider, area)

    assert deliver(driver, ride, engine.parcel_delivery_pin(ride.id)).status_code == 200

    assert selectors.active_pass(driver) is None


def test_a_returned_parcel_is_one_trip_not_two(rider: User, area: ServiceArea) -> None:
    launch_pass_with(max_trips=2)
    _ride, driver = returned(rider, area)

    assert selectors.active_pass(driver) is not None


def test_trips_before_the_pass_started_do_not_count(rider: User, area: ServiceArea) -> None:
    driver = captain(area, km=1)  # a launch pass with no limit
    complete_a_ride(driver, rider, area)
    now = timezone.now()
    CaptainPass.objects.filter(partner=driver).update(status=CaptainPass.Status.EXPIRED)
    CaptainPass.objects.create(
        partner=driver,
        plan=plan("one-trip", max_trips=1),
        status=CaptainPass.Status.ACTIVE,
        starts_at=now,
        ends_at=now + timedelta(hours=24),
    )

    engine._end_pass_if_trip_limit_reached(driver, timezone.now())

    assert selectors.active_pass(driver) is not None


def test_a_queued_pass_starts_the_moment_the_limited_one_ended(
    rider: User, area: ServiceArea
) -> None:
    launch_pass_with(max_trips=1)
    driver = captain(area, km=1)
    queued = CaptainPass.objects.create(
        partner=driver, plan=plan("day", price_paise=4900), status=CaptainPass.Status.QUEUED
    )

    ride = complete_a_ride(driver, rider, area)
    expire_passes()

    queued.refresh_from_db()
    assert queued.status == CaptainPass.Status.ACTIVE
    assert queued.starts_at == ride.completed_at


# --- Operations and the database --------------------------------------------------------------


def test_operations_sets_a_vehicle_and_a_trip_limit() -> None:
    ops = operations_client(make_user("Ops Person"))
    body = {"code": "cab-launch", "name": "Cab launch", "price_paise": 0, "duration_hours": 720}

    created = ops.post(
        OPS_PLANS_URL, {**body, "vehicle_type": "CAB", "max_trips": 100}, format="json"
    )

    assert created.status_code == 201
    assert (created.json()["vehicle_type"], created.json()["max_trips"]) == ("CAB", 100)
    assert (
        ops.post(OPS_PLANS_URL, {**body, "code": "a", "max_trips": 0}, format="json").status_code
        == 400
    )
    assert (
        ops.post(
            OPS_PLANS_URL, {**body, "code": "b", "vehicle_type": ""}, format="json"
        ).status_code
        == 400
    )


def test_the_database_refuses_a_limit_of_zero_trips() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        plan("zero", max_trips=0)


def test_a_ride_still_open_is_never_counted(rider: User, area: ServiceArea) -> None:
    launch_pass_with(max_trips=1)
    driver = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    engine.accept_offer(partner=driver, offer_id=RideOffer.objects.get(ride=ride).id)

    engine._end_pass_if_trip_limit_reached(driver, timezone.now())

    assert Ride.objects.get(pk=ride.pk).state == RideState.CAPTAIN_ASSIGNED
    assert selectors.active_pass(driver) is not None
