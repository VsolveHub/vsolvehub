"""Receiver not available and the return to the pickup (D12, D13, §4.2)."""

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from freezegun import freeze_time
from pytest_django.fixtures import SettingsWrapper

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides import engine
from apps.rides.fares import trip_fare_paise
from apps.rides.models import ParcelDetails, Ride, RideState, RideTrackPoint, RideTransition
from apps.rides.routing import RoutingUnavailableError, get_route
from tests.rides.helpers import customer_client, make_user, partner_client, ready_captain
from tests.rides.parcel_world import (
    CAPTAIN,
    DROP,
    after_wait,
    at_drop,
    deliver,
    hand_back,
    parcel_body,
    picked_up,
    ping_at,
    returning,
    step,
    wrong_code,
)
from tests.rides.ride_world import PICKUP, RIDES, captain, dispatch, error_code, make_area, new_ride

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]

FREE_WAIT = timedelta(minutes=3)  # the parcel rate card's free waiting minutes


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


def parcel_of(ride: Ride) -> ParcelDetails:
    return ParcelDetails.objects.get(ride=ride)


def state_of(ride: Ride) -> str:
    return Ride.objects.get(pk=ride.pk).state


# --- Receiver not available -------------------------------------------------------------------


def test_it_is_refused_while_the_free_wait_runs(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)

    response = step(driver, ride, "receiver-unavailable")

    assert (response.status_code, error_code(response)) == (409, "wait_not_over")
    assert state_of(ride) == RideState.IN_TRIP
    assert parcel_of(ride).return_fare_paise is None


def test_it_is_refused_before_arriving_at_the_drop(rider: User, area: ServiceArea) -> None:
    ride, driver = picked_up(rider, area)

    with after_wait():
        response = step(driver, ride, "receiver-unavailable")

    assert (response.status_code, error_code(response)) == (409, "wait_not_over")


def test_it_opens_exactly_when_the_free_minutes_are_over(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)
    arrived = parcel_of(ride).arrived_at_drop_at
    assert arrived is not None

    with freeze_time(arrived + FREE_WAIT - timedelta(seconds=1)):
        too_early = step(driver, ride, "receiver-unavailable")
    with freeze_time(arrived + FREE_WAIT):
        on_time = step(driver, ride, "receiver-unavailable")

    assert error_code(too_early) == "wait_not_over"
    assert (on_time.status_code, on_time.json()["state"]) == (200, "RETURNING")


def test_the_return_leg_is_priced_by_the_fare_engine_on_the_quotes_rate_card(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = at_drop(rider, area)
    fare_before = Ride.objects.get(pk=ride.pk).final_fare_paise
    assert fare_before == ride.fare_paise + ride.waiting_paise

    with after_wait():
        response = step(driver, ride, "receiver-unavailable")

    assert response.status_code == 200
    route = get_route(pickup=DROP, drop=PICKUP, vehicle_type="BIKE")  # drop back to pickup
    expected = trip_fare_paise(
        ride.quote.rate_card, distance_m=route.distance_m, duration_s=route.duration_s
    )
    parcel = parcel_of(ride)
    assert parcel.return_fare_paise == expected > 0
    assert parcel.return_payment_status == "DUE"
    assert parcel.receiver_unavailable_at is not None
    ride.refresh_from_db()
    assert ride.state == RideState.RETURNING
    assert ride.final_fare_paise == (fare_before or 0) + expected
    last = RideTransition.objects.filter(ride=ride).order_by("at").last()
    assert last is not None and (last.to_state, last.actor_kind) == ("RETURNING", "CAPTAIN")


def test_a_locked_pin_opens_it_at_once(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)
    wrong = wrong_code(engine.parcel_delivery_pin(ride.id))
    for n in range(5):
        deliver(driver, ride, wrong, key=f"k{n}")
    assert parcel_of(ride).pin_attempts == 5

    response = step(driver, ride, "receiver-unavailable")  # no waiting needed

    assert (response.status_code, response.json()["state"]) == (200, "RETURNING")


def test_wrong_pins_below_the_lock_do_not_open_it(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)
    deliver(driver, ride, wrong_code(engine.parcel_delivery_pin(ride.id)))

    assert error_code(step(driver, ride, "receiver-unavailable")) == "wait_not_over"


def test_the_captain_sees_when_the_button_opens(rider: User, area: ServiceArea) -> None:
    ride, driver = picked_up(rider, area)
    client = partner_client(driver.user)
    before = client.get(f"{CAPTAIN}/current/").json()["ride"]["parcel"]
    ping_at(driver, DROP)
    step(driver, ride, "arrived-at-drop")

    after = client.get(f"{CAPTAIN}/current/").json()["ride"]["parcel"]

    assert before["receiver_unavailable_allowed_at"] is None
    arrived = parcel_of(ride).arrived_at_drop_at
    assert arrived is not None
    assert parse_datetime(after["receiver_unavailable_allowed_at"]) == arrived + FREE_WAIT


def test_a_locked_pin_makes_the_button_open_now(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)
    wrong = wrong_code(engine.parcel_delivery_pin(ride.id))
    for n in range(5):
        deliver(driver, ride, wrong, key=f"k{n}")

    shown = partner_client(driver.user).get(f"{CAPTAIN}/current/").json()["ride"]["parcel"]

    arrived = parcel_of(ride).arrived_at_drop_at
    assert arrived is not None
    assert parse_datetime(shown["receiver_unavailable_allowed_at"]) == arrived


def test_routing_down_changes_nothing_and_is_retryable(
    rider: User, area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    ride, driver = at_drop(rider, area)

    def down(**_: Any) -> Any:
        raise RoutingUnavailableError("down")

    monkeypatch.setattr(engine, "get_route", down)
    with after_wait():
        response = step(driver, ride, "receiver-unavailable")

    assert (response.status_code, error_code(response)) == (503, "routing_unavailable")
    assert response.json()["error"]["retryable"] is True
    assert state_of(ride) == RideState.IN_TRIP
    parcel = parcel_of(ride)
    assert parcel.return_fare_paise is None and parcel.return_payment_status is None
    monkeypatch.undo()  # routing is back
    with after_wait():
        assert step(driver, ride, "receiver-unavailable").status_code == 200  # the retry works


def test_repeating_it_returns_the_ride_and_prices_nothing_twice(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returning(rider, area)
    first = parcel_of(ride).return_fare_paise
    total = Ride.objects.get(pk=ride.pk).final_fare_paise

    with after_wait():
        again = step(driver, ride, "receiver-unavailable")

    assert (again.status_code, again.json()["state"]) == (200, "RETURNING")
    assert parcel_of(ride).return_fare_paise == first
    assert Ride.objects.get(pk=ride.pk).final_fare_paise == total


def test_it_is_for_parcels_only(rider: User, area: ServiceArea) -> None:
    driver = captain(area, km=1)
    plain = dispatch(new_ride(rider, area))
    engine.accept_offer(partner=driver, offer_id=plain.offers.get(captain=driver).id)

    with after_wait():
        response = step(driver, plain, "receiver-unavailable")

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


def test_the_delivered_parcel_cannot_be_sent_back(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area, parcel=parcel_body(pin_required=False))
    deliver(driver, ride)

    with after_wait():
        response = step(driver, ride, "receiver-unavailable")

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


def test_only_the_parcels_captain_can_send_it_back(rider: User, area: ServiceArea) -> None:
    ride, _driver = at_drop(rider, area)
    other_user, _ = ready_captain("Other")
    other = PartnerProfile.objects.get(user=other_user)

    with after_wait():
        assert step(other, ride, "receiver-unavailable").status_code == 404
        assert (
            customer_client(rider).post(f"{CAPTAIN}/{ride.id}/receiver-unavailable/").status_code
            == 403
        )


# --- Returned ---------------------------------------------------------------------------------


def test_the_pickup_code_hands_the_parcel_back(rider: User, area: ServiceArea) -> None:
    ride, driver = returning(rider, area)

    response = hand_back(driver, ride)

    assert response.status_code == 200
    assert response.json()["state"] == "RETURNED"
    assert parcel_of(ride).returned_at is not None
    # Looked up by state, not by time: the test clock jumped ahead for the earlier step.
    assert RideTransition.objects.filter(
        ride=ride, to_state="RETURNED", actor_kind="CAPTAIN"
    ).exists()


def test_the_return_needs_the_captain_to_be_back_at_the_pickup(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returning(rider, area)
    ping_at(driver, DROP)  # still at the drop

    response = partner_client(driver.user).post(
        f"{CAPTAIN}/{ride.id}/returned/",
        {"otp": engine.ride_otp(ride.id)},
        format="json",
        HTTP_IDEMPOTENCY_KEY="r-1",
    )

    assert (response.status_code, error_code(response)) == (409, "not_at_pickup")
    ride.refresh_from_db()
    assert (ride.state, ride.otp_attempts) == (RideState.RETURNING, 0)  # nothing counted


def test_a_wrong_code_is_counted_once_per_key_and_five_lock_it(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returning(rider, area)
    right = engine.ride_otp(ride.id)
    wrong = wrong_code(right)

    first = hand_back(driver, ride, wrong, key="same")
    retry = hand_back(driver, ride, wrong, key="same")
    rest = [hand_back(driver, ride, wrong, key=f"k{n}") for n in range(4)]
    after_lock = hand_back(driver, ride, right, key="late")

    assert (first.status_code, error_code(first)) == (400, "otp_invalid")
    assert first.json()["error"]["details"] == {"attempts_left": 4}
    assert retry.json() == first.json() and retry["Idempotent-Replay"] == "true"
    assert [r.status_code for r in rest] == [400, 400, 400, 423]
    assert (after_lock.status_code, error_code(after_lock)) == (423, "otp_locked")
    ride.refresh_from_db()
    assert (ride.state, ride.otp_attempts) == (RideState.RETURNING, 5)


def test_the_delivery_pin_is_not_the_pickup_code(rider: User, area: ServiceArea) -> None:
    ride, driver = returning(rider, area)
    pin = engine.parcel_delivery_pin(ride.id)
    if pin == engine.ride_otp(ride.id):
        pytest.skip("the two codes happen to match for this ride id")

    response = hand_back(driver, ride, pin)

    assert (response.status_code, error_code(response)) == (400, "otp_invalid")
    assert state_of(ride) == RideState.RETURNING


def test_repeating_the_return_returns_the_ride(rider: User, area: ServiceArea) -> None:
    ride, driver = returning(rider, area)
    hand_back(driver, ride, key="a")
    returned_at = parcel_of(ride).returned_at

    again = hand_back(driver, ride, key="b")

    assert (again.status_code, again.json()["state"]) == (200, "RETURNED")
    assert parcel_of(ride).returned_at == returned_at


def test_the_return_needs_an_idempotency_key(rider: User, area: ServiceArea) -> None:
    ride, driver = returning(rider, area)
    ping_at(driver, PICKUP)

    response = partner_client(driver.user).post(
        f"{CAPTAIN}/{ride.id}/returned/", {"otp": engine.ride_otp(ride.id)}, format="json"
    )

    assert response.status_code == 400


def test_a_parcel_that_is_not_coming_back_cannot_be_marked_returned(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = picked_up(rider, area)

    response = hand_back(driver, ride)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


# --- what everyone sees while it comes back ---------------------------------------------------


def test_the_booker_sees_the_pickup_code_again_and_no_pin(rider: User, area: ServiceArea) -> None:
    ride, _driver = returning(rider, area)

    body = customer_client(rider).get(f"{RIDES}{ride.id}/").json()

    assert body["state"] == "RETURNING"
    assert body["otp"] == engine.ride_otp(ride.id)
    assert body["parcel"]["delivery_pin"] is None
    assert body["parcel"]["return_fare_paise"] == parcel_of(ride).return_fare_paise
    assert body["parcel"]["return_payment_status"] == "DUE"


def test_the_pickup_code_is_gone_again_once_it_is_handed_back(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returning(rider, area)
    hand_back(driver, ride)

    body = customer_client(rider).get(f"{RIDES}{ride.id}/").json()

    assert (body["state"], body["otp"]) == ("RETURNED", None)
    assert body["parcel"]["returned_at"] is not None


def test_the_returning_parcel_is_the_captains_current_ride(rider: User, area: ServiceArea) -> None:
    ride, driver = returning(rider, area)

    current = partner_client(driver.user).get(f"{CAPTAIN}/current/").json()["ride"]

    assert (current["id"], current["state"]) == (str(ride.id), "RETURNING")
    assert current["parcel"]["pickup"]["name"] == "Ravi Kumar"  # still open: contacts shown


def test_the_captain_stays_busy_until_the_parcel_is_back(rider: User, area: ServiceArea) -> None:
    ride, driver = returning(rider, area)
    other_rider = make_user("Second Rider")

    second = dispatch(new_ride(other_rider, area))

    assert ride.captain_id == driver.id
    assert not second.offers.filter(captain=driver).exists()  # a returning captain gets no offer


# --- the captain is tracked on the way back ---------------------------------------------------


def send_ping(driver: PartnerProfile, point: tuple[Any, Any]) -> Any:
    """The phone's GPS ping through the real endpoint, as the app sends it."""
    return partner_client(driver.user).post(
        f"{CAPTAIN}/location/",
        {
            "latitude": str(point[0]),
            "longitude": str(point[1]),
            "accuracy_m": 8,
            "captured_at": timezone.now().isoformat(),
        },
        format="json",
    )


def test_the_way_back_is_recorded_and_the_booker_sees_the_captain(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returning(rider, area)
    assert RideTrackPoint.objects.filter(ride=ride).count() == 0

    assert send_ping(driver, DROP).status_code == 204

    assert RideTrackPoint.objects.filter(ride=ride).count() == 1  # proof of the paid return leg
    seen = customer_client(rider).get(f"{RIDES}{ride.id}/").json()["captain"]["position"]
    assert seen is not None and float(seen["latitude"]) == pytest.approx(float(DROP[0]))


def test_tracking_stops_once_the_parcel_is_back(rider: User, area: ServiceArea) -> None:
    ride, driver = returning(rider, area)
    send_ping(driver, DROP)
    hand_back(driver, ride)
    recorded = RideTrackPoint.objects.filter(ride=ride).count()

    send_ping(driver, PICKUP)

    assert RideTrackPoint.objects.filter(ride=ride).count() == recorded
    assert customer_client(rider).get(f"{RIDES}{ride.id}/").json()["captain"]["position"] is None
