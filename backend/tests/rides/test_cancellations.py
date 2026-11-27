"""Cancellations (brief §5.4, device scenarios 11-14): by the rider, by the captain (the ride
searches again without them), and by Operations (any open ride, even in trip)."""

from collections.abc import Callable
from typing import Any

import pytest
from django.utils import timezone

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides import engine, location
from apps.rides.models import Ride, RideOffer, RideState, RideTransition
from tests.rides.helpers import customer_client, make_user, operations_client, partner_client
from tests.rides.ride_world import (
    PICKUP,
    RIDES,
    after_offers_expire,
    book,
    captain,
    dispatch,
    error_code,
    make_area,
    new_ride,
    offered,
    quote_for,
)

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]

CAPTAIN = "/api/v1/partner/rides"
OPS = "/api/v1/operations/rides"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


def accept(ride: Ride, partner: PartnerProfile) -> Ride:
    engine.accept_offer(
        partner=partner, offer_id=RideOffer.objects.get(ride=ride, captain=partner).id
    )
    ride.refresh_from_db()
    return ride


def to_state(ride: Ride, partner: PartnerProfile, state: str) -> None:
    """Walk an assigned ride forward to `state`."""
    if state in ("CAPTAIN_ARRIVED", "IN_TRIP", "COMPLETED"):
        location.record_position(
            partner_id=partner.id,
            latitude=float(PICKUP[0]),
            longitude=float(PICKUP[1]),
            accuracy_m=10,
            heading=None,
            captured_at=timezone.now().isoformat(),
            listed_in=None,
        )
        engine.mark_arrived(partner=partner, ride_id=ride.id)
    if state in ("IN_TRIP", "COMPLETED"):
        engine.start_trip(partner=partner, ride_id=ride.id, otp=engine.ride_otp(ride.id))
    if state == "COMPLETED":
        engine.complete_trip(partner=partner, ride_id=ride.id)


def rider_cancel(rider: User, ride: Ride, reason: str = "CHANGED_MIND") -> Any:
    return customer_client(rider).post(
        f"{RIDES}{ride.id}/cancel/", {"reason": reason}, format="json"
    )


def captain_cancel(partner: PartnerProfile, ride: Ride, reason: str = "VEHICLE_ISSUE") -> Any:
    return partner_client(partner.user).post(
        f"{CAPTAIN}/{ride.id}/cancel/", {"reason": reason}, format="json"
    )


def ops_cancel(ride: Ride, reason: str = "Rider reported a safety issue") -> Any:
    client = operations_client(make_user("Ops Person"))
    return client.post(f"{OPS}/{ride.id}/cancel/", {"reason": reason}, format="json")


def state_of(ride: Ride) -> str:
    return Ride.objects.get(pk=ride.pk).state


# --- The rider cancels ------------------------------------------------------------------------


def test_cancelling_while_searching_withdraws_the_offers(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))

    response = rider_cancel(rider, ride)

    assert response.status_code == 200
    body = response.json()
    assert (body["state"], body["cancelled_by"], body["cancel_reason"]) == (
        "CANCELLED",
        "RIDER",
        "CHANGED_MIND",
    )
    assert RideOffer.objects.get(ride=ride).status == RideOffer.Status.WITHDRAWN
    # The request disappears from the captain's screen (scenario 11).
    assert partner_client(ravi.user).get(f"{CAPTAIN}/offers/current/").json()["offer"] is None


@pytest.mark.parametrize("state", ["CAPTAIN_ASSIGNED", "CAPTAIN_ARRIVED"])
def test_cancelling_after_assignment_frees_the_captain(
    rider: User, area: ServiceArea, state: str
) -> None:
    ravi = captain(area, km=1)
    ride = accept(dispatch(new_ride(rider, area)), ravi)
    to_state(ride, ravi, state)

    assert rider_cancel(rider, ride, "CAPTAIN_DELAYED").json()["state"] == "CANCELLED"

    # The captain is told (no current ride) and, from their next ping, can take the next one
    # (scenario 12).
    assert partner_client(ravi.user).get(f"{CAPTAIN}/current/").json()["ride"] is None
    location.record_position(
        partner_id=ravi.id,
        latitude=float(PICKUP[0]),
        longitude=float(PICKUP[1]),
        accuracy_m=10,
        heading=None,
        captured_at=timezone.now().isoformat(),
        listed_in=location.geo_key(area.id, "BIKE"),
    )
    next_ride = dispatch(new_ride(make_user("Next Rider"), area))
    assert offered(next_ride) == [ravi.id]


def test_the_rider_cannot_cancel_once_the_trip_started(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = accept(dispatch(new_ride(rider, area)), ravi)
    to_state(ride, ravi, "IN_TRIP")

    response = rider_cancel(rider, ride)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert state_of(ride) == RideState.IN_TRIP


def test_cancelling_twice_changes_nothing(rider: User, area: ServiceArea) -> None:
    ride = new_ride(rider, area)
    rider_cancel(rider, ride)

    assert rider_cancel(rider, ride, "OTHER").json()["cancel_reason"] == "CHANGED_MIND"
    assert RideTransition.objects.filter(ride=ride, to_state="CANCELLED").count() == 1


@pytest.mark.parametrize("body", [{}, {"reason": "BORED"}, {"reason": "VEHICLE_ISSUE"}])
def test_the_rider_must_give_one_of_their_reasons(
    rider: User, area: ServiceArea, body: dict[str, str]
) -> None:
    ride = new_ride(rider, area)
    response = customer_client(rider).post(f"{RIDES}{ride.id}/cancel/", body, format="json")
    assert response.status_code == 400
    assert state_of(ride) == RideState.SEARCHING


def test_only_the_rider_can_cancel_their_ride(rider: User, area: ServiceArea) -> None:
    ride = new_ride(rider, area)
    assert rider_cancel(make_user("Someone Else"), ride).status_code == 404


def test_after_cancelling_the_rider_can_book_again(rider: User, area: ServiceArea) -> None:
    rider_cancel(rider, new_ride(rider, area))

    response = book(customer_client(rider), quote_for(rider, area), "k-again")

    assert response.status_code == 201


# --- The captain cancels: the ride searches again ---------------------------------------------


def test_a_captain_cancel_finds_another_captain_but_never_them_again(
    rider: User,
    area: ServiceArea,
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    ravi, arjun = captain(area, km=0.5), captain(area, km=1)
    ride = accept(dispatch(new_ride(rider, area)), ravi)
    assert RideOffer.objects.get(ride=ride, captain=arjun).status == RideOffer.Status.WITHDRAWN

    with django_capture_on_commit_callbacks(execute=True):
        response = captain_cancel(ravi, ride, "PICKUP_TOO_FAR")

    assert response.status_code == 204
    ride.refresh_from_db()
    assert (ride.state, ride.captain_id, ride.dispatch_round) == (RideState.SEARCHING, None, 1)
    # The other captain is offered the ride again; the one who cancelled is not (scenario 13).
    assert offered(ride) == [arjun.id]
    last = RideTransition.objects.filter(ride=ride).order_by("at").last()
    assert last is not None
    assert (last.from_state, last.to_state, last.actor_kind, last.reason) == (
        "CAPTAIN_ASSIGNED",
        "SEARCHING",
        "CAPTAIN",
        "PICKUP_TOO_FAR",
    )


def test_the_rider_sees_finding_another_captain(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=0.5)
    ride = accept(dispatch(new_ride(rider, area)), ravi)
    rider_view = customer_client(rider).get(f"{RIDES}{ride.id}/")
    assert rider_view.json()["searching_again"] is False

    captain_cancel(ravi, ride)

    body = customer_client(rider).get(f"{RIDES}{ride.id}/").json()
    assert (body["state"], body["searching_again"], body["captain"]) == ("SEARCHING", True, None)


def test_the_next_captain_can_accept_after_a_cancel(rider: User, area: ServiceArea) -> None:
    ravi, arjun = captain(area, km=0.5), captain(area, km=1)
    ride = accept(dispatch(new_ride(rider, area)), ravi)
    captain_cancel(ravi, ride)
    dispatch(ride)

    ride = accept(ride, arjun)

    assert (ride.state, ride.captain_id) == (RideState.CAPTAIN_ASSIGNED, arjun.id)
    assert RideOffer.objects.filter(ride=ride, status=RideOffer.Status.ACCEPTED).count() == 1


def test_within_one_search_a_captain_is_still_offered_only_once(
    rider: User, area: ServiceArea
) -> None:
    captain(area, km=1)
    ride = dispatch(new_ride(rider, area))

    with after_offers_expire():
        ride = dispatch(ride, 2)

    assert ride.state == RideState.NO_CAPTAIN_FOUND  # Ravi let it expire; not offered again


def test_a_captain_cannot_cancel_during_the_trip(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = accept(dispatch(new_ride(rider, area)), ravi)
    to_state(ride, ravi, "IN_TRIP")

    response = captain_cancel(ravi, ride)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


def test_the_captain_must_give_one_of_their_reasons(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = accept(dispatch(new_ride(rider, area)), ravi)

    assert captain_cancel(ravi, ride, "CHANGED_MIND").status_code == 400
    assert state_of(ride) == RideState.CAPTAIN_ASSIGNED


def test_another_captain_cannot_cancel_the_ride(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = accept(dispatch(new_ride(rider, area)), ravi)

    assert captain_cancel(captain(area, km=3), ride).status_code == 404


# --- Operations cancels -----------------------------------------------------------------------


@pytest.mark.parametrize("state", ["SEARCHING", "CAPTAIN_ASSIGNED", "IN_TRIP"])
def test_operations_can_cancel_any_open_ride(rider: User, area: ServiceArea, state: str) -> None:
    ravi = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    if state != "SEARCHING":
        ride = accept(ride, ravi)
        to_state(ride, ravi, state)

    response = ops_cancel(ride)

    assert response.status_code == 204
    ride.refresh_from_db()
    assert (ride.state, ride.cancelled_by) == (RideState.CANCELLED, "OPERATIONS")
    assert ride.cancel_reason == "Rider reported a safety issue"


def test_a_locked_otp_ride_can_still_be_cancelled(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = accept(dispatch(new_ride(rider, area)), ravi)
    to_state(ride, ravi, "CAPTAIN_ARRIVED")
    Ride.objects.filter(pk=ride.pk).update(otp_attempts=engine.OTP_MAX_ATTEMPTS)

    # Scenario 14: locked, and both the rider and Operations can still cancel.
    assert rider_cancel(rider, ride).json()["state"] == "CANCELLED"


def test_operations_cannot_cancel_a_finished_ride(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = accept(dispatch(new_ride(rider, area)), ravi)
    to_state(ride, ravi, "COMPLETED")

    response = ops_cancel(ride)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


def test_operations_must_give_a_reason(rider: User, area: ServiceArea) -> None:
    ride = new_ride(rider, area)
    assert ops_cancel(ride, "").status_code == 400
    assert ops_cancel(ride, "x" * 65).status_code == 400


def test_only_operations_can_force_cancel(rider: User, area: ServiceArea) -> None:
    ride = new_ride(rider, area)
    body = {"reason": "x"}
    assert (
        customer_client(rider).post(f"{OPS}/{ride.id}/cancel/", body, format="json").status_code
        == 403
    )
    ravi = captain(area, km=1)
    assert (
        partner_client(ravi.user).post(f"{OPS}/{ride.id}/cancel/", body, format="json").status_code
        == 403
    )
