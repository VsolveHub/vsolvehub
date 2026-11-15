"""The trip after a captain accepts (brief §5.4): arrived, start, complete, payment received,
the captain's current ride, and the rider's live view (start code, position, ETA)."""

from datetime import timedelta
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides import engine, location
from apps.rides.models import Ride, RideOffer, RideState, RideTransition
from tests.rides.helpers import customer_client, make_user, partner_client
from tests.rides.ride_world import (
    KM,
    PICKUP,
    RIDES,
    captain,
    dispatch,
    error_code,
    make_area,
    new_ride,
)

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]

CAPTAIN = "/api/v1/partner/rides"


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


@pytest.fixture
def trip(rider: User, area: ServiceArea) -> tuple[Ride, PartnerProfile]:
    """A ride Ravi accepted; Ravi is 1 km from the pickup."""
    ravi = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    engine.accept_offer(partner=ravi, offer_id=RideOffer.objects.get(ride=ride).id)
    ride.refresh_from_db()
    return ride, ravi


def ping(partner: PartnerProfile, *, km: float, age_s: int = 0) -> None:
    """The captain's latest GPS ping, `km` north of the pickup, taken `age_s` seconds ago."""
    location.record_position(
        partner_id=partner.id,
        latitude=float(PICKUP[0]) + km * KM,
        longitude=float(PICKUP[1]),
        accuracy_m=10,
        heading=None,
        captured_at=(timezone.now() - timedelta(seconds=age_s)).isoformat(),
        listed_in=None,
    )


def step(partner: PartnerProfile, ride: Ride, name: str) -> Any:
    return partner_client(partner.user).post(f"{CAPTAIN}/{ride.id}/{name}/")


def start(partner: PartnerProfile, ride: Ride, otp: str, key: str = "s-1") -> Any:
    return partner_client(partner.user).post(
        f"{CAPTAIN}/{ride.id}/start/", {"otp": otp}, format="json", HTTP_IDEMPOTENCY_KEY=key
    )


def arrive(partner: PartnerProfile, ride: Ride) -> None:
    ping(partner, km=0.05)
    assert step(partner, ride, "arrived").status_code == 200


def begin(partner: PartnerProfile, ride: Ride) -> None:
    arrive(partner, ride)
    assert start(partner, ride, engine.ride_otp(ride.id)).status_code == 200


def state_of(ride: Ride) -> str:
    return Ride.objects.get(pk=ride.pk).state


# --- Arrived (the 200 m geofence) -------------------------------------------------------------


def test_arrived_within_200_m_of_the_pickup(trip: tuple[Ride, PartnerProfile]) -> None:
    ride, ravi = trip
    ping(ravi, km=0.15)

    response = step(ravi, ride, "arrived")

    assert (response.status_code, response.json()["state"]) == (200, "CAPTAIN_ARRIVED")
    assert response.json()["captain_arrived_at"] is not None
    last = RideTransition.objects.filter(ride=ride).order_by("at").last()
    assert last is not None and (last.to_state, last.actor_kind) == ("CAPTAIN_ARRIVED", "CAPTAIN")


@pytest.mark.parametrize(
    "where",
    [
        pytest.param({"km": 1}, id="1-km-away"),
        pytest.param({"km": 0.05, "age_s": 40}, id="ping-older-than-30-s"),
    ],
)
def test_arrived_is_refused_away_from_the_pickup(
    trip: tuple[Ride, PartnerProfile], where: dict[str, Any]
) -> None:
    ride, ravi = trip
    ping(ravi, **where)

    response = step(ravi, ride, "arrived")

    assert (response.status_code, error_code(response)) == (409, "not_at_pickup")
    assert state_of(ride) == RideState.CAPTAIN_ASSIGNED


def test_arrived_with_no_live_position_is_refused(
    trip: tuple[Ride, PartnerProfile], ride_redis: Any
) -> None:
    ride, ravi = trip
    ride_redis.delete(f"rides:pos:{ravi.id}")  # the 30 s position has expired

    assert error_code(step(ravi, ride, "arrived")) == "not_at_pickup"


def test_arrived_when_redis_is_down_is_a_retryable_503(
    trip: tuple[Ride, PartnerProfile], settings: SettingsWrapper
) -> None:
    ride, ravi = trip
    settings.RIDES_REDIS_URL = "redis://127.0.0.1:1/0"

    response = step(ravi, ride, "arrived")

    assert (response.status_code, error_code(response)) == (503, "location_unavailable")


# --- Start: the waiting charge (the OTP rules are in test_otp.py) -----------------------------


def test_start_moves_to_in_trip_with_no_charge_inside_the_free_wait(
    trip: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = trip
    arrive(ravi, ride)

    response = start(ravi, ride, engine.ride_otp(ride.id))

    assert (response.status_code, response.json()["state"]) == (200, "IN_TRIP")
    assert response.json()["waiting_paise"] == 0


def test_waiting_past_the_free_minutes_is_charged_per_started_minute(
    trip: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = trip
    arrive(ravi, ride)
    # Waited 5 min 10 s: 3 free minutes, then 2 min 10 s, which is 3 started minutes at ₹1.
    Ride.objects.filter(pk=ride.pk).update(
        captain_arrived_at=timezone.now() - timedelta(minutes=5, seconds=10)
    )

    response = start(ravi, ride, engine.ride_otp(ride.id))

    assert response.json()["waiting_paise"] == 300


# --- Complete and payment received ------------------------------------------------------------


def test_complete_fixes_the_final_fare_and_payment_is_due(
    trip: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = trip
    begin(ravi, ride)
    Ride.objects.filter(pk=ride.pk).update(waiting_paise=200)

    body = step(ravi, ride, "complete").json()

    assert (body["state"], body["final_fare_paise"], body["payment_status"]) == (
        "COMPLETED",
        5100 + 200,
        "DUE",
    )
    assert body["completed_at"] is not None
    assert body["rider"]["phone_number"] is None  # phones are hidden once the trip is over


def test_payment_received_once_and_again_harmlessly(trip: tuple[Ride, PartnerProfile]) -> None:
    ride, ravi = trip
    begin(ravi, ride)
    step(ravi, ride, "complete")

    first, again = step(ravi, ride, "payment-received"), step(ravi, ride, "payment-received")

    assert first.json()["payment_status"] == again.json()["payment_status"] == "COLLECTED"
    assert Ride.objects.get(pk=ride.pk).payment_collected_at is not None


def test_each_step_repeated_returns_the_ride_unchanged(trip: tuple[Ride, PartnerProfile]) -> None:
    ride, ravi = trip
    code = engine.ride_otp(ride.id)

    arrive(ravi, ride)
    assert step(ravi, ride, "arrived").json()["state"] == "CAPTAIN_ARRIVED"
    start(ravi, ride, code, "s-1")
    assert start(ravi, ride, code, "s-2").json()["state"] == "IN_TRIP"  # a new key, already started
    step(ravi, ride, "complete")
    assert step(ravi, ride, "complete").json()["state"] == "COMPLETED"

    for state in ("CAPTAIN_ARRIVED", "IN_TRIP", "COMPLETED"):
        assert RideTransition.objects.filter(ride=ride, to_state=state).count() == 1


# --- Steps out of order -----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("done", "attempt"),
    [
        ([], "complete"),
        ([], "payment-received"),
        (["arrived"], "complete"),
        (["arrived", "start"], "arrived"),
        (["arrived", "start", "complete"], "arrived"),
    ],
)
def test_a_step_from_the_wrong_state_is_an_invalid_transition(
    trip: tuple[Ride, PartnerProfile], done: list[str], attempt: str
) -> None:
    ride, ravi = trip
    for name in done:
        if name == "arrived":
            arrive(ravi, ride)
        elif name == "start":
            start(ravi, ride, engine.ride_otp(ride.id))
        else:
            step(ravi, ride, name)

    response = step(ravi, ride, attempt)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


def test_start_before_arriving_is_an_invalid_transition(trip: tuple[Ride, PartnerProfile]) -> None:
    ride, ravi = trip
    response = start(ravi, ride, engine.ride_otp(ride.id))
    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


# --- Who may act on a ride --------------------------------------------------------------------


def test_another_captain_cannot_touch_the_ride(
    trip: tuple[Ride, PartnerProfile], area: ServiceArea
) -> None:
    ride, _ = trip
    stranger = captain(area, km=3)

    for name in ("arrived", "complete", "payment-received"):
        assert step(stranger, ride, name).status_code == 404
    assert start(stranger, ride, "0000").status_code == 404


def test_a_customer_cannot_use_captain_trip_urls(
    trip: tuple[Ride, PartnerProfile], rider: User
) -> None:
    ride, _ = trip
    assert customer_client(rider).post(f"{CAPTAIN}/{ride.id}/arrived/").status_code == 403
    assert APIClient().get(f"{CAPTAIN}/current/").status_code == 403


# --- The captain's current ride ---------------------------------------------------------------


def test_current_ride_follows_the_trip_until_it_is_paid(
    trip: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = trip
    client = partner_client(ravi.user)

    assert client.get(f"{CAPTAIN}/current/").json()["ride"]["id"] == str(ride.id)
    begin(ravi, ride)
    step(ravi, ride, "complete")
    assert client.get(f"{CAPTAIN}/current/").json()["ride"]["state"] == "COMPLETED"  # Collect
    step(ravi, ride, "payment-received")
    assert client.get(f"{CAPTAIN}/current/").json()["ride"] is None


def test_a_captain_with_no_ride_has_none(area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    assert partner_client(ravi.user).get(f"{CAPTAIN}/current/").json() == {"ride": None}


# --- The rider's live view --------------------------------------------------------------------


def rider_view(rider: User, ride: Ride) -> dict[str, Any]:
    return dict(customer_client(rider).get(f"{RIDES}{ride.id}/").json())


def test_the_rider_sees_the_code_position_and_eta_while_the_captain_comes(
    trip: tuple[Ride, PartnerProfile], rider: User
) -> None:
    ride, _ = trip

    body = rider_view(rider, ride)

    assert body["otp"] == engine.ride_otp(ride.id)
    assert len(body["otp"]) == 4
    assert body["captain"]["position"]["latitude"] == pytest.approx(float(PICKUP[0]) + KM)
    assert isinstance(body["captain"]["eta_s"], int) and body["captain"]["eta_s"] > 0
    assert body["emergency_number"] == "112"


def test_the_code_disappears_once_the_trip_starts(
    trip: tuple[Ride, PartnerProfile], rider: User
) -> None:
    ride, ravi = trip
    begin(ravi, ride)

    body = rider_view(rider, ride)

    assert body["otp"] is None
    assert body["captain"]["eta_s"] is None  # only while on the way to the pickup
    assert body["captain"]["position"] is not None  # still tracked during the trip


def test_no_position_or_eta_is_invented(
    trip: tuple[Ride, PartnerProfile], rider: User, ride_redis: Any
) -> None:
    ride, ravi = trip
    ride_redis.delete(f"rides:pos:{ravi.id}")

    captain_card = rider_view(rider, ride)["captain"]

    assert (captain_card["position"], captain_card["eta_s"]) == (None, None)


def test_no_code_is_shown_while_searching(rider: User, area: ServiceArea) -> None:
    ride = new_ride(rider, area)
    assert rider_view(rider, ride)["otp"] is None


def test_without_an_otp_secret_no_code_can_exist(
    trip: tuple[Ride, PartnerProfile], settings: SettingsWrapper
) -> None:
    ride, _ = trip
    settings.RIDES_OTP_SECRET = ""

    with pytest.raises(ImproperlyConfigured):
        engine.ride_otp(ride.id)
