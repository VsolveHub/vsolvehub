"""Pick up & Drop codes: who sees the pickup code and the delivery PIN, and when (§3.2, D10)."""

import logging
import re
import uuid
from typing import Any

import pytest
from pytest_django.fixtures import SettingsWrapper

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.rides import engine
from apps.rides.models import Ride
from tests.rides.helpers import customer_client, make_user, partner_client
from tests.rides.parcel_world import (
    CAPTAIN,
    DROP,
    accepted_parcel,
    at_drop,
    deliver,
    new_parcel,
    parcel_body,
    picked_up,
    ping_at,
    step,
)
from tests.rides.ride_world import RIDES, make_area

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


def booker_sees(rider: User, ride: Ride) -> dict[str, Any]:
    response = customer_client(rider).get(f"{RIDES}{ride.id}/")
    assert response.status_code == 200
    return dict(response.json())


def has_value(payload: Any, value: str) -> bool:
    """Whether this exact value appears anywhere in the JSON (not as part of another value)."""
    if isinstance(payload, dict):
        return any(has_value(item, value) for item in payload.values())
    if isinstance(payload, list):
        return any(has_value(item, value) for item in payload)
    return bool(payload == value)


# --- the booker's windows ---------------------------------------------------------------------


def test_the_pickup_code_and_the_pin_show_from_assignment(rider: User, area: ServiceArea) -> None:
    ride, _driver = accepted_parcel(rider, area)

    body = booker_sees(rider, ride)

    assert body["otp"] == engine.ride_otp(ride.id)
    assert body["parcel"]["delivery_pin"] == engine.parcel_delivery_pin(ride.id)


def test_the_two_codes_have_their_own_message_prefix() -> None:
    """The receiver's PIN is not the pickup code: they are derived from different messages."""
    ride_ids = [uuid.uuid4() for _ in range(50)]

    assert any(engine.ride_otp(i) != engine.parcel_delivery_pin(i) for i in ride_ids)
    assert len({engine.parcel_delivery_pin(i) for i in ride_ids}) > 10  # spread over 10,000 PINs
    assert all(re.fullmatch(r"\d{4}", engine.parcel_delivery_pin(i)) for i in ride_ids)


def test_the_pin_stays_visible_at_arrival_and_in_the_trip(rider: User, area: ServiceArea) -> None:
    ride, driver = picked_up(rider, area)

    body = booker_sees(rider, ride)

    assert body["state"] == "IN_TRIP"
    assert body["parcel"]["delivery_pin"] == engine.parcel_delivery_pin(ride.id)
    assert body["otp"] is None  # the pickup code is spent once the parcel is collected
    del driver


def test_the_pin_is_gone_once_the_parcel_is_delivered(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area)
    deliver(driver, ride, engine.parcel_delivery_pin(ride.id))

    body = booker_sees(rider, ride)

    assert body["state"] == "COMPLETED"
    assert body["parcel"]["delivery_pin"] is None


def test_there_is_no_pin_while_still_searching(rider: User, area: ServiceArea) -> None:
    ride = new_parcel(rider, area)

    assert booker_sees(rider, ride)["parcel"]["delivery_pin"] is None


def test_with_pin_confirmation_off_there_is_never_a_pin(rider: User, area: ServiceArea) -> None:
    ride, driver = accepted_parcel(rider, area, parcel=parcel_body(pin_required=False))

    assigned = booker_sees(rider, ride)
    ping_at(driver, DROP)  # nothing to unlock: the captain just taps Delivered at the drop

    assert assigned["parcel"]["pin_required"] is False
    assert assigned["parcel"]["delivery_pin"] is None
    assert assigned["otp"] == engine.ride_otp(ride.id)  # the pickup code is always used (D10)


# --- never in a captain's hands ---------------------------------------------------------------


def test_the_captain_never_receives_the_delivery_pin(rider: User, area: ServiceArea) -> None:
    ride, driver = picked_up(rider, area)
    pin = engine.parcel_delivery_pin(ride.id)
    client = partner_client(driver.user)
    ping_at(driver, DROP)

    payloads = [
        client.get(f"{CAPTAIN}/current/").json(),
        client.post(f"{CAPTAIN}/{ride.id}/arrived-at-drop/").json(),
        client.get(f"{CAPTAIN}/history/").json(),
    ]

    for payload in payloads:
        assert not has_value(payload, pin)
        assert "delivery_pin" not in str(payload)


def test_the_captain_never_receives_the_pickup_code_of_a_parcel_either(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = accepted_parcel(rider, area)

    payload = partner_client(driver.user).get(f"{CAPTAIN}/current/").json()

    assert not has_value(payload, engine.ride_otp(ride.id))
    assert "otp" not in payload["ride"]


def test_a_stranger_cannot_read_the_parcel_or_its_pin(rider: User, area: ServiceArea) -> None:
    ride, _driver = accepted_parcel(rider, area)

    stranger = customer_client(make_user("Someone Else")).get(f"{RIDES}{ride.id}/")

    assert stranger.status_code == 404
    assert not has_value(stranger.json(), engine.parcel_delivery_pin(ride.id))


# --- never logged -----------------------------------------------------------------------------


def test_no_code_is_ever_logged(
    rider: User, area: ServiceArea, caplog: pytest.LogCaptureFixture
) -> None:
    ride, driver = accepted_parcel(rider, area)
    pin = engine.parcel_delivery_pin(ride.id)
    otp = engine.ride_otp(ride.id)
    wrong = "0000" if pin != "0000" else "1111"
    with caplog.at_level(logging.DEBUG):
        ping_at(driver, (ride.pickup_latitude, ride.pickup_longitude))
        step(driver, ride, "arrived")
        partner_client(driver.user).post(
            f"{CAPTAIN}/{ride.id}/start/",
            {"otp": otp},
            format="json",
            HTTP_IDEMPOTENCY_KEY="s-1",
        )
        ping_at(driver, DROP)
        step(driver, ride, "arrived-at-drop")
        deliver(driver, ride, wrong, key="d-1")
        deliver(driver, ride, pin, key="d-2")
        booker_sees(rider, ride)

    assert caplog.records  # the steps do log, and they name ids only
    text = "\n".join(f"{r.getMessage()} {sorted(r.__dict__.items())}" for r in caplog.records)
    for code in (pin, otp, wrong):
        assert not re.search(rf"(?<![\w-]){code}(?![\w-])", text)
