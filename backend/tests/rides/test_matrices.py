"""The two matrices the brief asks for (Day 5): every ride step from every state, and who may call
what. Each row is one rule, so a reviewer can read the whole state machine and the whole access
policy from this file."""

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides import engine, location
from apps.rides.models import Ride, RideState
from tests.rides.helpers import (
    customer_client,
    make_user,
    operations_client,
    partner_client,
    start_application,
)
from tests.rides.ride_world import PICKUP, RIDES, captain, make_area, new_ride

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]

CAPTAIN = "/api/v1/partner/rides"
OPS = "/api/v1/operations/rides"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


#: States in which a captain is on the ride (in the others there is none to act).
_WITH_CAPTAIN = {
    RideState.CAPTAIN_ASSIGNED,
    RideState.CAPTAIN_ARRIVED,
    RideState.IN_TRIP,
    RideState.COMPLETED,
    RideState.CANCELLED,
}


def ride_in(state: str, rider: User, area: ServiceArea, ravi: PartnerProfile) -> Ride:
    """A ride standing in `state`, with Ravi on it where a captain belongs and Ravi's last ping at
    the pickup (so Arrived would pass its 200 m check)."""
    ride = new_ride(rider, area)
    now = timezone.now()
    fields: dict[str, Any] = {"state": state}
    if state in _WITH_CAPTAIN:
        fields.update(captain=ravi, captain_assigned_at=now)
    if state in (RideState.IN_TRIP, RideState.COMPLETED):
        fields.update(captain_arrived_at=now, started_at=now)
    if state == RideState.COMPLETED:
        fields.update(completed_at=now, final_fare_paise=ride.fare_paise)
    if state == RideState.CANCELLED:
        fields.update(cancelled_at=now, cancelled_by="RIDER", cancel_reason="CHANGED_MIND")
    if state == RideState.NO_CAPTAIN_FOUND:
        fields.update(no_captain_found_at=now)
    Ride.objects.filter(pk=ride.pk).update(**fields)
    location.record_position(
        partner_id=ravi.id,
        latitude=float(PICKUP[0]),
        longitude=float(PICKUP[1]),
        accuracy_m=10,
        heading=None,
        captured_at=now.isoformat(),
        listed_in=None,
    )
    return Ride.objects.get(pk=ride.pk)


# --- The state machine ------------------------------------------------------------------------

S = RideState
ALL_STATES = [
    S.SEARCHING,
    S.CAPTAIN_ASSIGNED,
    S.CAPTAIN_ARRIVED,
    S.IN_TRIP,
    S.COMPLETED,
    S.CANCELLED,
    S.NO_CAPTAIN_FOUND,
]

#: action -> {state the action is allowed from (or a no-op repeat in): the state it leaves}.
#: Every state not listed must answer 409 invalid_transition, or 404 where the captain is not on
#: the ride (a captain can only act on their own ride).
ALLOWED: dict[str, dict[str, str]] = {
    "arrived": {S.CAPTAIN_ASSIGNED: S.CAPTAIN_ARRIVED, S.CAPTAIN_ARRIVED: S.CAPTAIN_ARRIVED},
    "start": {S.CAPTAIN_ARRIVED: S.IN_TRIP, S.IN_TRIP: S.IN_TRIP},
    "complete": {S.IN_TRIP: S.COMPLETED, S.COMPLETED: S.COMPLETED},
    "payment-received": {S.COMPLETED: S.COMPLETED},
    "captain-cancel": {S.CAPTAIN_ASSIGNED: S.SEARCHING, S.CAPTAIN_ARRIVED: S.SEARCHING},
    "rider-cancel": {
        S.SEARCHING: S.CANCELLED,
        S.CAPTAIN_ASSIGNED: S.CANCELLED,
        S.CAPTAIN_ARRIVED: S.CANCELLED,
        S.CANCELLED: S.CANCELLED,
    },
    "operations-cancel": {
        S.SEARCHING: S.CANCELLED,
        S.CAPTAIN_ASSIGNED: S.CANCELLED,
        S.CAPTAIN_ARRIVED: S.CANCELLED,
        S.IN_TRIP: S.CANCELLED,
        S.CANCELLED: S.CANCELLED,
    },
    "rider-rating": {S.COMPLETED: S.COMPLETED},
}
_CAPTAIN_ACTIONS = {"arrived", "start", "complete", "payment-received", "captain-cancel"}


def act(action: str, ride: Ride, rider: User, ravi: PartnerProfile) -> Any:
    captain_client = partner_client(ravi.user)
    base = f"{CAPTAIN}/{ride.id}"
    if action == "start":
        return captain_client.post(
            f"{base}/start/",
            {"otp": engine.ride_otp(ride.id)},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"start-{ride.id}",
        )
    if action == "captain-cancel":
        return captain_client.post(f"{base}/cancel/", {"reason": "OTHER"}, format="json")
    if action in _CAPTAIN_ACTIONS:
        return captain_client.post(f"{base}/{action}/")
    if action == "rider-cancel":
        return customer_client(rider).post(
            f"{RIDES}{ride.id}/cancel/", {"reason": "OTHER"}, format="json"
        )
    if action == "rider-rating":
        return customer_client(rider).post(f"{RIDES}{ride.id}/rating/", {"stars": 5}, format="json")
    return operations_client(make_user("Ops Person")).post(
        f"{OPS}/{ride.id}/cancel/", {"reason": "Matrix"}, format="json"
    )


@pytest.mark.parametrize("state", ALL_STATES)
@pytest.mark.parametrize("action", list(ALLOWED))
def test_every_step_from_every_state(
    rider: User, area: ServiceArea, action: str, state: str
) -> None:
    ravi = captain(area, km=1)
    ride = ride_in(state, rider, area, ravi)

    response = act(action, ride, rider, ravi)

    ride.refresh_from_db()
    if state in ALLOWED[action]:
        assert response.status_code in (200, 201, 204), response.content
        assert ride.state == ALLOWED[action][state]
    elif action in _CAPTAIN_ACTIONS and state not in _WITH_CAPTAIN:
        assert response.status_code == 404  # not Ravi's ride: no captain is on it
        assert ride.state == state
    else:
        assert (response.status_code, response.json()["error"]["code"]) == (
            409,
            "invalid_transition",
        )
        assert ride.state == state


# --- Who may call what ------------------------------------------------------------------------

#: (method, path template, body). `{ride}` is a ride of Priya's that Ravi is on.
Url = tuple[str, str, Any]
RIDER_URLS: list[Url] = [
    ("get", "/api/v1/rides/{ride}/", None),
    ("post", "/api/v1/rides/{ride}/cancel/", {"reason": "OTHER"}),
    ("post", "/api/v1/rides/{ride}/rating/", {"stars": 5}),
    ("post", "/api/v1/rides/{ride}/sos/", {}),
]
CAPTAIN_RIDE_URLS: list[Url] = [
    ("post", f"{CAPTAIN}/{{ride}}/arrived/", None),
    ("post", f"{CAPTAIN}/{{ride}}/complete/", None),
    ("post", f"{CAPTAIN}/{{ride}}/payment-received/", None),
    ("post", f"{CAPTAIN}/{{ride}}/cancel/", {"reason": "OTHER"}),
    ("post", f"{CAPTAIN}/{{ride}}/rating/", {"stars": 5}),
    ("post", f"{CAPTAIN}/{{ride}}/sos/", {}),
]
CAPTAIN_URLS: list[Url] = [
    ("get", f"{CAPTAIN}/current/", None),
    ("get", f"{CAPTAIN}/history/", None),
    ("get", f"{CAPTAIN}/earnings/?period=today", None),
    ("get", f"{CAPTAIN}/offers/current/", None),
    ("post", f"{CAPTAIN}/duty/start/", None),
    *CAPTAIN_RIDE_URLS,
]
OPS_URLS: list[Url] = [
    ("get", f"{OPS}/", None),
    ("get", f"{OPS}/{{ride}}/", None),
    ("post", f"{OPS}/{{ride}}/cancel/", {"reason": "x"}),
    ("get", f"{OPS}/captains/", None),
    ("get", f"{OPS}/sos/", None),
    ("get", f"{OPS}/rate-cards/", None),
    ("get", f"{OPS}/pass-plans/", None),
]


def call(client: APIClient, method: str, path: str, body: Any, ride: Ride) -> Any:
    url = path.format(ride=ride.id)
    if method == "get":
        return client.get(url)
    return client.post(url, body or {}, format="json")


@pytest.fixture
def assigned(rider: User, area: ServiceArea) -> tuple[Ride, PartnerProfile]:
    ravi = captain(area, km=1)
    return ride_in(RideState.CAPTAIN_ASSIGNED, rider, area, ravi), ravi


@pytest.mark.parametrize(("method", "path", "body"), RIDER_URLS + CAPTAIN_URLS + OPS_URLS)
def test_anonymous_callers_are_refused_everywhere(
    assigned: tuple[Ride, PartnerProfile], method: str, path: str, body: Any
) -> None:
    ride, _ = assigned
    assert call(APIClient(), method, path, body, ride).status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), RIDER_URLS)
def test_another_rider_cannot_see_or_touch_the_ride(
    assigned: tuple[Ride, PartnerProfile], method: str, path: str, body: Any
) -> None:
    ride, _ = assigned
    stranger = customer_client(make_user("Another Rider"))
    assert call(stranger, method, path, body, ride).status_code == 404


@pytest.mark.parametrize(("method", "path", "body"), CAPTAIN_RIDE_URLS)
def test_another_captain_cannot_touch_the_ride(
    assigned: tuple[Ride, PartnerProfile], area: ServiceArea, method: str, path: str, body: Any
) -> None:
    ride, _ = assigned
    stranger = partner_client(captain(area, km=3).user)
    assert call(stranger, method, path, body, ride).status_code == 404
    assert Ride.objects.get(pk=ride.pk).state == RideState.CAPTAIN_ASSIGNED


@pytest.mark.parametrize(("method", "path", "body"), CAPTAIN_URLS + OPS_URLS)
def test_a_customer_cannot_use_captain_or_operations_urls(
    assigned: tuple[Ride, PartnerProfile], rider: User, method: str, path: str, body: Any
) -> None:
    ride, _ = assigned
    assert call(customer_client(rider), method, path, body, ride).status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), OPS_URLS)
def test_a_captain_cannot_use_operations_urls(
    assigned: tuple[Ride, PartnerProfile], method: str, path: str, body: Any
) -> None:
    ride, ravi = assigned
    assert call(partner_client(ravi.user), method, path, body, ride).status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), CAPTAIN_RIDE_URLS)
def test_a_partner_who_is_not_a_captain_cannot_act_on_rides(
    assigned: tuple[Ride, PartnerProfile], method: str, path: str, body: Any
) -> None:
    ride, _ = assigned
    electrician = make_user("Suresh Electrician")
    start_application(electrician, track=PartnerApplication.Track.SERVICES)

    response = call(partner_client(electrician), method, path, body, ride)

    assert response.status_code == 404
    assert Ride.objects.get(pk=ride.pk).state == RideState.CAPTAIN_ASSIGNED


def test_a_partner_who_is_not_a_captain_cannot_go_on_duty() -> None:
    electrician = make_user("Suresh Electrician")
    start_application(electrician, track=PartnerApplication.Track.SERVICES)
    client = partner_client(electrician)

    assert client.post(f"{CAPTAIN}/duty/start/").status_code == 403
    assert client.get(f"{CAPTAIN}/offers/current/").json()["offer"] is None
    me = client.get(f"{CAPTAIN}/me/").json()
    assert (me["approval"], me["is_approved"]) == ("NOT_STARTED", False)


def test_a_stale_ping_does_not_let_a_captain_arrive(
    assigned: tuple[Ride, PartnerProfile],
) -> None:
    """The matrix gives Ravi a fresh ping; the geofence still rules when it is old."""
    ride, ravi = assigned
    location.record_position(
        partner_id=ravi.id,
        latitude=float(PICKUP[0]),
        longitude=float(PICKUP[1]),
        accuracy_m=10,
        heading=None,
        captured_at=(timezone.now() - timedelta(seconds=45)).isoformat(),
        listed_in=None,
    )
    response = partner_client(ravi.user).post(f"{CAPTAIN}/{ride.id}/arrived/")
    assert response.json()["error"]["code"] == "not_at_pickup"
