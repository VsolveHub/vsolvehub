"""The parcel trip: picked up, arrived at drop, delivered with or without the PIN (§3, §4.2)."""

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone
from freezegun import freeze_time
from pytest_django.fixtures import SettingsWrapper

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides import engine
from apps.rides.fares import waiting_charge_paise
from apps.rides.models import ParcelDetails, Ride, RideOffer, RideState, RideTransition
from tests.rides.helpers import customer_client, make_user, partner_client, ready_captain
from tests.rides.parcel_world import (
    CAPTAIN,
    DROP,
    accepted_parcel,
    at_drop,
    deliver,
    parcel_body,
    picked_up,
    ping_at,
    step,
)
from tests.rides.ride_world import PICKUP, captain, dispatch, error_code, make_area, new_ride

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]


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


# --- picked up (the Rides start step) ---------------------------------------------------------


def test_the_pickup_code_picks_the_parcel_up_and_fixes_the_fare(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = accepted_parcel(rider, area)
    ping_at(driver, PICKUP)
    assert step(driver, ride, "arrived").status_code == 200

    with freeze_time(timezone.now() + timedelta(minutes=6)):  # 3 free minutes, then charged
        response = partner_client(driver.user).post(
            f"{CAPTAIN}/{ride.id}/start/",
            {"otp": engine.ride_otp(ride.id)},
            format="json",
            HTTP_IDEMPOTENCY_KEY="s-1",
        )

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "IN_TRIP"
    waiting = waiting_charge_paise(ride.quote.rate_card, waited_s=360)
    assert waiting > 0
    assert body["waiting_paise"] == waiting
    # Fixed now, not at the end: the fare is collected here or at the drop (§3.3).
    assert body["final_fare_paise"] == ride.fare_paise + waiting
    assert body["parcel"]["arrived_at_drop_at"] is None


def test_a_parcel_cannot_be_completed_like_a_ride(rider: User, area: ServiceArea) -> None:
    """Only `deliver` ends a parcel: `complete` would skip the PIN and the payment."""
    ride, driver = picked_up(rider, area)

    response = step(driver, ride, "complete")

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert state_of(ride) == RideState.IN_TRIP


# --- arrived at drop --------------------------------------------------------------------------


def test_arrived_at_drop_within_200_m_sets_a_timestamp_and_no_new_state(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = picked_up(rider, area)
    ping_at(driver, DROP)
    transitions = RideTransition.objects.filter(ride=ride).count()

    response = step(driver, ride, "arrived-at-drop")

    assert response.status_code == 200
    assert response.json()["state"] == "IN_TRIP"
    assert response.json()["parcel"]["arrived_at_drop_at"] is not None
    assert parcel_of(ride).arrived_at_drop_at is not None
    assert RideTransition.objects.filter(ride=ride).count() == transitions


def test_repeating_arrived_at_drop_keeps_the_first_time(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)
    first = parcel_of(ride).arrived_at_drop_at

    with freeze_time(timezone.now() + timedelta(minutes=5)):
        again = step(driver, ride, "arrived-at-drop")

    assert again.status_code == 200
    assert parcel_of(ride).arrived_at_drop_at == first  # the free waiting minutes keep counting


@pytest.mark.parametrize(
    "where",
    [
        pytest.param("pickup", id="still-at-the-pickup"),
        pytest.param("stale", id="ping-older-than-30-s"),
    ],
)
def test_arrived_at_drop_is_refused_away_from_the_drop(
    rider: User, area: ServiceArea, where: str
) -> None:
    ride, driver = picked_up(rider, area)
    if where == "pickup":
        ping_at(driver, PICKUP)
    else:
        ping_at(driver, DROP, age_s=40)

    response = step(driver, ride, "arrived-at-drop")

    assert (response.status_code, error_code(response)) == (409, "not_at_drop")
    assert parcel_of(ride).arrived_at_drop_at is None


def test_arrived_at_drop_with_no_live_position_is_refused(
    rider: User, area: ServiceArea, ride_redis: Any
) -> None:
    ride, driver = picked_up(rider, area)
    ride_redis.delete(f"rides:pos:{driver.id}")

    assert error_code(step(driver, ride, "arrived-at-drop")) == "not_at_drop"


def test_arrived_at_drop_needs_the_parcel_to_be_picked_up(rider: User, area: ServiceArea) -> None:
    ride, driver = accepted_parcel(rider, area)
    ping_at(driver, DROP)

    response = step(driver, ride, "arrived-at-drop")

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


def test_the_parcel_steps_refuse_a_normal_ride(rider: User, area: ServiceArea) -> None:
    driver = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    engine.accept_offer(partner=driver, offer_id=RideOffer.objects.get(ride=ride).id)
    ping_at(driver, PICKUP)
    engine.mark_arrived(partner=driver, ride_id=ride.id)
    engine.start_trip(partner=driver, ride_id=ride.id, otp=engine.ride_otp(ride.id))
    ping_at(driver, DROP)

    at_drop = step(driver, ride, "arrived-at-drop")
    delivered = deliver(driver, ride)

    assert (at_drop.status_code, error_code(at_drop)) == (409, "invalid_transition")
    assert (delivered.status_code, error_code(delivered)) == (409, "invalid_transition")
    assert state_of(ride) == RideState.IN_TRIP


def test_another_captain_cannot_touch_the_parcel(rider: User, area: ServiceArea) -> None:
    ride, _driver = picked_up(rider, area)
    other_user, _ = ready_captain("Other Captain")
    other = PartnerProfile.objects.get(user=other_user)

    assert step(other, ride, "arrived-at-drop").status_code == 404
    assert deliver(other, ride).status_code == 404


# --- deliver: the PIN is on ------------------------------------------------------------------


def test_the_right_pin_delivers_the_parcel(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)

    response = deliver(driver, ride, engine.parcel_delivery_pin(ride.id))

    assert response.status_code == 200
    assert response.json()["state"] == "COMPLETED"
    ride.refresh_from_db()
    assert ride.completed_at is not None
    assert parcel_of(ride).delivered_at == ride.completed_at
    last = RideTransition.objects.filter(ride=ride).order_by("at").last()
    assert last is not None and (last.to_state, last.actor_kind) == ("COMPLETED", "CAPTAIN")


def test_delivering_again_returns_the_delivered_parcel(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)
    pin = engine.parcel_delivery_pin(ride.id)
    deliver(driver, ride, pin, key="d-1")
    delivered_at = parcel_of(ride).delivered_at

    again = deliver(driver, ride, pin, key="d-2")

    assert (again.status_code, again.json()["state"]) == (200, "COMPLETED")
    assert parcel_of(ride).delivered_at == delivered_at


def test_delivery_needs_the_captain_to_have_arrived_at_the_drop(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = picked_up(rider, area)

    response = deliver(driver, ride, engine.parcel_delivery_pin(ride.id))

    assert (response.status_code, error_code(response)) == (409, "not_at_drop")
    assert state_of(ride) == RideState.IN_TRIP


def test_a_wrong_pin_is_counted_once_per_key(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)
    wrong = "0000" if engine.parcel_delivery_pin(ride.id) != "0000" else "1111"

    first = deliver(driver, ride, wrong, key="same")
    retry = deliver(driver, ride, wrong, key="same")  # a network retry
    second = deliver(driver, ride, wrong, key="new")

    assert (first.status_code, error_code(first)) == (400, "pin_invalid")
    assert first.json()["error"]["details"] == {"attempts_left": 4}
    assert retry.json() == first.json()
    assert retry["Idempotent-Replay"] == "true"
    assert second.json()["error"]["details"] == {"attempts_left": 3}
    assert parcel_of(ride).pin_attempts == 2
    assert state_of(ride) == RideState.IN_TRIP


def test_five_wrong_pins_lock_delivery_even_for_the_right_one(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = at_drop(rider, area)
    right = engine.parcel_delivery_pin(ride.id)
    wrong = "0000" if right != "0000" else "1111"

    results = [deliver(driver, ride, wrong, key=f"k{n}") for n in range(5)]
    sixth = deliver(driver, ride, right, key="k6")

    assert [r.status_code for r in results] == [400, 400, 400, 400, 423]
    assert error_code(results[-1]) == "pin_locked"
    assert (sixth.status_code, error_code(sixth)) == (423, "pin_locked")
    assert parcel_of(ride).pin_attempts == 5  # the sixth try is not counted
    assert state_of(ride) == RideState.IN_TRIP


def test_the_wrong_pins_do_not_touch_the_pickup_code_counter(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = at_drop(rider, area)
    deliver(driver, ride, "0000" if engine.parcel_delivery_pin(ride.id) != "0000" else "1111")

    ride.refresh_from_db()
    assert ride.otp_attempts == 0


def test_a_missing_pin_is_a_bad_request_and_not_counted(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)

    response = deliver(driver, ride)

    assert response.status_code == 400
    assert parcel_of(ride).pin_attempts == 0


@pytest.mark.parametrize("pin", ["12", "12345", "abcd", "12 4"])
def test_a_pin_that_is_not_four_digits_is_a_bad_request(
    rider: User, area: ServiceArea, pin: str
) -> None:
    ride, driver = at_drop(rider, area)

    assert deliver(driver, ride, pin).status_code == 400
    assert parcel_of(ride).pin_attempts == 0


def test_deliver_needs_an_idempotency_key(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)

    response = partner_client(driver.user).post(
        f"{CAPTAIN}/{ride.id}/deliver/",
        {"pin": engine.parcel_delivery_pin(ride.id)},
        format="json",
    )

    assert response.status_code == 400
    assert state_of(ride) == RideState.IN_TRIP


# --- deliver: the PIN is off ------------------------------------------------------------------


def test_with_pin_confirmation_off_the_captain_just_taps_delivered(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = at_drop(rider, area, parcel=parcel_body(pin_required=False))

    response = deliver(driver, ride)

    assert (response.status_code, response.json()["state"]) == (200, "COMPLETED")
    assert parcel_of(ride).pin_attempts == 0


def test_with_pin_confirmation_off_a_typed_pin_is_ignored(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area, parcel=parcel_body(pin_required=False))

    response = deliver(driver, ride, "0000")

    assert response.status_code == 200
    assert parcel_of(ride).pin_attempts == 0


def test_with_pin_confirmation_off_delivery_still_needs_the_drop(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = picked_up(rider, area, parcel=parcel_body(pin_required=False))

    assert error_code(deliver(driver, ride)) == "not_at_drop"


# --- deliver: who pays ------------------------------------------------------------------------


def test_a_receiver_pays_parcel_is_not_handed_over_before_the_money(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = at_drop(rider, area, parcel=parcel_body(payer="RECEIVER", pin_required=False))

    refused = deliver(driver, ride)

    assert (refused.status_code, error_code(refused)) == (409, "payment_not_collected")
    assert state_of(ride) == RideState.IN_TRIP
    Ride.objects.filter(pk=ride.pk).update(payment_status=Ride.PaymentStatus.COLLECTED)
    assert deliver(driver, ride, key="d-2").status_code == 200


def test_the_payment_is_checked_before_the_pin_is_counted(rider: User, area: ServiceArea) -> None:
    """A receiver who has not paid cannot burn PIN attempts."""
    ride, driver = at_drop(rider, area, parcel=parcel_body(payer="RECEIVER"))

    response = deliver(driver, ride, "0000")

    assert error_code(response) == "payment_not_collected"
    assert parcel_of(ride).pin_attempts == 0


def test_a_sender_pays_parcel_can_be_delivered_with_the_fare_still_due(
    rider: User, area: ServiceArea
) -> None:
    """The captain may collect after delivery; the parcel stays on their screen until paid."""
    ride, driver = at_drop(rider, area, parcel=parcel_body(pin_required=False))

    assert deliver(driver, ride).status_code == 200
    ride.refresh_from_db()
    assert ride.payment_status == Ride.PaymentStatus.DUE


# --- who may use these steps ------------------------------------------------------------------


def test_a_customer_cannot_deliver_or_arrive(rider: User, area: ServiceArea) -> None:
    ride, _driver = at_drop(rider, area)
    client = customer_client(rider)

    assert client.post(f"{CAPTAIN}/{ride.id}/arrived-at-drop/").status_code == 403
    assert (
        client.post(
            f"{CAPTAIN}/{ride.id}/deliver/", {}, format="json", HTTP_IDEMPOTENCY_KEY="x"
        ).status_code
        == 403
    )
