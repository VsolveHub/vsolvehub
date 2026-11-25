"""Cancelling a parcel: the booker, "Can't take this item", and Operations (D15, D16)."""

from typing import Any

import pytest
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides import engine, location
from apps.rides.models import Ride, RideOffer, RideState, RideTransition
from tests.rides.helpers import customer_client, make_user, operations_client, partner_client
from tests.rides.parcel_world import (
    CAPTAIN,
    accepted_parcel,
    at_drop,
    deliver,
    new_parcel,
    parcel_body,
    picked_up,
    ping_at,
    returning,
    step,
)
from tests.rides.ride_world import (
    PICKUP,
    RIDES,
    captain,
    dispatch,
    error_code,
    make_area,
    new_ride,
    offered,
)

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]

OPS = "/api/v1/operations/rides"


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


def fresh(ride: Ride) -> Ride:
    return Ride.objects.get(pk=ride.pk)


def rider_cancel(rider: User, ride: Ride, reason: str = "CHANGED_MIND") -> Any:
    return customer_client(rider).post(
        f"{RIDES}{ride.id}/cancel/", {"reason": reason}, format="json"
    )


def captain_cancel(driver: PartnerProfile, ride: Ride, reason: str) -> Any:
    return partner_client(driver.user).post(
        f"{CAPTAIN}/{ride.id}/cancel/", {"reason": reason}, format="json"
    )


def ops_cancel(ride: Ride, reason: str = "Fraud check") -> Any:
    return operations_client(make_user("Ops")).post(
        f"{OPS}/{ride.id}/cancel/", {"reason": reason}, format="json"
    )


# --- the booker: free until the pickup code (D15) ---------------------------------------------


def test_the_booker_cancels_free_while_searching(rider: User, area: ServiceArea) -> None:
    ride = new_parcel(rider, area)

    response = rider_cancel(rider, ride)

    assert (response.status_code, response.json()["state"]) == (200, "CANCELLED")
    after = fresh(ride)
    assert (after.cancelled_by, after.cancel_reason) == ("RIDER", "CHANGED_MIND")
    assert after.final_fare_paise is None  # nothing is charged


@pytest.mark.parametrize("stage", ["assigned", "arrived"])
def test_the_booker_cancels_free_until_the_pickup_code(
    rider: User, area: ServiceArea, stage: str
) -> None:
    ride, driver = accepted_parcel(rider, area)
    if stage == "arrived":
        ping_at(driver, PICKUP)
        step(driver, ride, "arrived")

    response = rider_cancel(rider, ride)

    assert (response.status_code, response.json()["state"]) == (200, "CANCELLED")
    assert fresh(ride).final_fare_paise is None


@pytest.mark.parametrize("stage", ["picked-up", "at-drop", "returning", "delivered"])
def test_the_booker_cannot_cancel_after_the_pickup_code(
    rider: User, area: ServiceArea, stage: str
) -> None:
    if stage == "picked-up":
        ride, _ = picked_up(rider, area)
    elif stage == "at-drop":
        ride, _ = at_drop(rider, area)
    elif stage == "returning":
        ride, _ = returning(rider, area)
    else:
        ride, driver = at_drop(rider, area, parcel=parcel_body(pin_required=False))
        deliver(driver, ride)
    before = fresh(ride).state

    response = rider_cancel(rider, ride)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert fresh(ride).state == before


def test_cancelling_twice_changes_nothing(rider: User, area: ServiceArea) -> None:
    ride = new_parcel(rider, area)
    rider_cancel(rider, ride)
    cancelled_at = fresh(ride).cancelled_at

    again = rider_cancel(rider, ride)

    assert again.status_code == 200
    assert fresh(ride).cancelled_at == cancelled_at


# --- the captain: no cancel after the pickup --------------------------------------------------


def test_the_captain_cannot_give_a_collected_parcel_up(rider: User, area: ServiceArea) -> None:
    ride, driver = picked_up(rider, area)

    response = captain_cancel(driver, ride, "VEHICLE_ISSUE")

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert fresh(ride).state == RideState.IN_TRIP


def test_a_captain_who_gives_up_before_the_pickup_sends_the_parcel_to_another(
    rider: User, area: ServiceArea
) -> None:
    ride, first = accepted_parcel(rider, area)
    second = captain(area, km=2)

    assert captain_cancel(first, ride, "VEHICLE_ISSUE").status_code == 204

    dispatch(fresh(ride), round_no=1)
    assert fresh(ride).state == RideState.SEARCHING
    assert offered(ride) == [second.id]  # the one who cancelled is never offered it back


# --- "Can't take this item" (D16) -------------------------------------------------------------


def arrived_at_pickup(rider: User, area: ServiceArea) -> tuple[Ride, PartnerProfile]:
    ride, driver = accepted_parcel(rider, area)
    ping_at(driver, PICKUP)
    assert step(driver, ride, "arrived").status_code == 200
    return ride, driver


def test_the_captain_refuses_an_item_at_the_pickup(rider: User, area: ServiceArea) -> None:
    ride, driver = arrived_at_pickup(rider, area)

    response = captain_cancel(driver, ride, "ITEM_NOT_ALLOWED")

    assert response.status_code == 204
    after = fresh(ride)
    assert after.state == RideState.CANCELLED
    assert (after.cancelled_by, after.cancel_reason) == ("CAPTAIN", "ITEM_NOT_ALLOWED")
    assert after.cancelled_at is not None
    assert after.final_fare_paise is None  # no charge to anyone
    assert after.payment_status == Ride.PaymentStatus.DUE and after.waiting_paise == 0
    last = RideTransition.objects.filter(ride=ride).order_by("at").last()
    assert last is not None and (last.to_state, last.actor_kind) == ("CANCELLED", "CAPTAIN")


def test_a_refused_item_is_never_offered_to_another_captain(rider: User, area: ServiceArea) -> None:
    ride, driver = arrived_at_pickup(rider, area)
    other = captain(area, km=1.5)
    captain_cancel(driver, ride, "ITEM_NOT_ALLOWED")

    engine.run_dispatch_round(ride_id=ride.id, round_no=1)  # a late dispatch task changes nothing

    assert fresh(ride).state == RideState.CANCELLED
    assert not RideOffer.objects.filter(ride=ride, captain=other).exists()
    assert not RideOffer.objects.filter(ride=ride, status=RideOffer.Status.PENDING).exists()


def test_the_booker_is_told_it_was_cancelled(rider: User, area: ServiceArea) -> None:
    ride, driver = arrived_at_pickup(rider, area)
    captain_cancel(driver, ride, "ITEM_NOT_ALLOWED")

    body = customer_client(rider).get(f"{RIDES}{ride.id}/").json()

    assert (body["state"], body["cancelled_by"], body["cancel_reason"]) == (
        "CANCELLED",
        "CAPTAIN",
        "ITEM_NOT_ALLOWED",
    )
    assert body["otp"] is None and body["parcel"]["delivery_pin"] is None


def test_the_captain_is_free_for_the_next_job(rider: User, area: ServiceArea) -> None:
    ride, driver = arrived_at_pickup(rider, area)
    captain_cancel(driver, ride, "ITEM_NOT_ALLOWED")

    assert partner_client(driver.user).get(f"{CAPTAIN}/current/").json()["ride"] is None
    # The phone's next GPS ping puts a free captain back on the map.
    location.record_position(
        partner_id=driver.id,
        latitude=float(PICKUP[0]),
        longitude=float(PICKUP[1]),
        accuracy_m=10,
        heading=None,
        captured_at=timezone.now().isoformat(),
        listed_in=location.geo_key(area.id, "BIKE"),
    )
    second = dispatch(new_ride(make_user("Next Rider"), area))
    assert offered(second) == [driver.id]


def test_refusing_twice_changes_nothing(rider: User, area: ServiceArea) -> None:
    ride, driver = arrived_at_pickup(rider, area)
    captain_cancel(driver, ride, "ITEM_NOT_ALLOWED")

    again = captain_cancel(driver, ride, "ITEM_NOT_ALLOWED")

    # The ride is no longer the captain's to act on: a plain refusal, not a second cancel.
    assert again.status_code == 409
    assert fresh(ride).state == RideState.CANCELLED


@pytest.mark.parametrize("stage", ["assigned", "picked-up"])
def test_the_refusal_is_only_at_the_pickup_before_the_code(
    rider: User, area: ServiceArea, stage: str
) -> None:
    ride, driver = accepted_parcel(rider, area) if stage == "assigned" else picked_up(rider, area)
    before = fresh(ride).state

    response = captain_cancel(driver, ride, "ITEM_NOT_ALLOWED")

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert fresh(ride).state == before


def test_the_refusal_is_for_parcels_only(rider: User, area: ServiceArea) -> None:
    driver = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    engine.accept_offer(partner=driver, offer_id=RideOffer.objects.get(ride=ride).id)
    ping_at(driver, PICKUP)
    step(driver, ride, "arrived")

    response = captain_cancel(driver, ride, "ITEM_NOT_ALLOWED")

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert fresh(ride).state == RideState.CAPTAIN_ARRIVED


# --- Operations -------------------------------------------------------------------------------


def test_operations_can_cancel_a_parcel_that_is_in_trip(rider: User, area: ServiceArea) -> None:
    ride, _driver = picked_up(rider, area)

    response = ops_cancel(ride)

    assert response.status_code == 204
    after = fresh(ride)
    assert (after.state, after.cancelled_by, after.cancel_reason) == (
        RideState.CANCELLED,
        "OPERATIONS",
        "Fraud check",
    )


def test_operations_can_cancel_a_parcel_that_is_returning(rider: User, area: ServiceArea) -> None:
    ride, driver = returning(rider, area)

    response = ops_cancel(ride)

    assert response.status_code == 204
    assert fresh(ride).state == RideState.CANCELLED
    assert partner_client(driver.user).get(f"{CAPTAIN}/current/").json()["ride"] is None


def test_operations_cannot_cancel_a_parcel_that_is_already_finished(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = at_drop(rider, area, parcel=parcel_body(pin_required=False))
    deliver(driver, ride)

    response = ops_cancel(ride)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert fresh(ride).state == RideState.COMPLETED


def test_only_operations_can_use_the_operations_cancel(rider: User, area: ServiceArea) -> None:
    ride, driver = picked_up(rider, area)
    body = {"reason": "x"}
    url = f"{OPS}/{ride.id}/cancel/"

    assert customer_client(rider).post(url, body, format="json").status_code == 403
    assert partner_client(driver.user).post(url, body, format="json").status_code == 403
    assert fresh(ride).state == RideState.IN_TRIP
