"""Pick up & Drop money: who pays where, collecting, not paid, and earnings (D9, D14, §3.3)."""

from typing import Any

import pytest
from pytest_django.fixtures import SettingsWrapper

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides import engine
from apps.rides.models import ParcelDetails, Ride, RideState
from tests.rides.helpers import make_user, partner_client, ready_captain
from tests.rides.parcel_world import (
    CAPTAIN,
    DROP,
    accepted_parcel,
    after_wait,
    at_drop,
    deliver,
    hand_back,
    parcel_body,
    picked_up,
    ping_at,
    returned,
    returning,
    step,
)
from tests.rides.ride_world import error_code, make_area

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


@pytest.fixture(params=["SEND", "RECEIVE"])
def mode(request: pytest.FixtureRequest) -> str:
    """Who pays is its own choice (D9): every payer rule must hold for both modes."""
    return str(request.param)


def body(mode: str, payer: str, *, pin: bool = False) -> dict[str, Any]:
    return parcel_body(mode=mode, payer=payer, pin_required=pin)


def pay(driver: PartnerProfile, ride: Ride) -> Any:
    return step(driver, ride, "payment-received")


def refuse_to_pay(driver: PartnerProfile, ride: Ride) -> Any:
    return step(driver, ride, "payment-not-received")


def fresh(ride: Ride) -> Ride:
    return Ride.objects.get(pk=ride.pk)


def parcel_of(ride: Ride) -> ParcelDetails:
    return ParcelDetails.objects.get(ride=ride)


# --- Sender pays: collected at the pickup -----------------------------------------------------


def test_the_sender_pays_right_after_the_pickup_code(
    rider: User, area: ServiceArea, mode: str
) -> None:
    ride, driver = picked_up(rider, area, parcel=body(mode, "SENDER"))
    assert fresh(ride).payment_status == Ride.PaymentStatus.DUE

    response = pay(driver, ride)

    assert response.status_code == 200
    assert response.json()["payment_status"] == "COLLECTED"
    assert fresh(ride).payment_collected_at is not None


def test_collecting_twice_changes_nothing(rider: User, area: ServiceArea) -> None:
    ride, driver = picked_up(rider, area, parcel=body("SEND", "SENDER"))
    pay(driver, ride)
    collected_at = fresh(ride).payment_collected_at

    again = pay(driver, ride)

    assert again.status_code == 200
    assert fresh(ride).payment_collected_at == collected_at


def test_nothing_is_collected_before_the_pickup(rider: User, area: ServiceArea) -> None:
    ride, driver = accepted_parcel(rider, area, parcel=body("SEND", "SENDER"))

    response = pay(driver, ride)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert fresh(ride).payment_status == Ride.PaymentStatus.DUE


def test_a_delivered_parcel_stays_with_the_captain_until_the_sender_has_paid(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = at_drop(rider, area, parcel=body("SEND", "SENDER"))
    deliver(driver, ride)
    client = partner_client(driver.user)

    shown = client.get(f"{CAPTAIN}/current/").json()["ride"]
    assert (shown["id"], shown["state"], shown["payment_status"]) == (
        str(ride.id),
        "COMPLETED",
        "DUE",
    )
    assert pay(driver, ride).status_code == 200
    assert client.get(f"{CAPTAIN}/current/").json()["ride"] is None


# --- Receiver pays: collected at the drop, before the handover --------------------------------


def test_the_receiver_pays_only_once_the_captain_is_at_the_drop(
    rider: User, area: ServiceArea, mode: str
) -> None:
    ride, driver = picked_up(rider, area, parcel=body(mode, "RECEIVER"))

    early = pay(driver, ride)

    assert (early.status_code, error_code(early)) == (409, "invalid_transition")
    assert fresh(ride).payment_status == Ride.PaymentStatus.DUE


def test_the_receiver_pays_and_then_gets_the_parcel(
    rider: User, area: ServiceArea, mode: str
) -> None:
    ride, driver = at_drop(rider, area, parcel=body(mode, "RECEIVER"))

    refused = deliver(driver, ride)
    paid = pay(driver, ride)
    delivered = deliver(driver, ride, key="d-2")

    assert (refused.status_code, error_code(refused)) == (409, "payment_not_collected")
    assert paid.json()["payment_status"] == "COLLECTED"
    assert (delivered.status_code, delivered.json()["state"]) == (200, "COMPLETED")


def test_the_receivers_money_is_checked_before_the_pin(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area, parcel=body("SEND", "RECEIVER", pin=True))
    pay(driver, ride)

    wrong = deliver(
        driver, ride, "0000" if engine.parcel_delivery_pin(ride.id) != "0000" else "1111"
    )
    right = deliver(driver, ride, engine.parcel_delivery_pin(ride.id), key="d-2")

    assert error_code(wrong) == "pin_invalid"
    assert right.status_code == 200


# --- the return: everything still due is collected at the pickup ------------------------------


@pytest.mark.parametrize("payer", ["SENDER", "RECEIVER"])
def test_nothing_is_collected_while_the_parcel_is_on_its_way_back(
    rider: User, area: ServiceArea, payer: str
) -> None:
    ride, driver = returning(rider, area, parcel=body("SEND", payer))

    response = pay(driver, ride)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert parcel_of(ride).return_payment_status == "DUE"


def test_the_sender_who_paid_at_pickup_now_pays_the_return_leg(
    rider: User, area: ServiceArea, mode: str
) -> None:
    ride, driver = picked_up(rider, area, parcel=body(mode, "SENDER"))
    pay(driver, ride)  # the fare, at the pickup
    ride, driver = _send_back(ride, driver)

    assert fresh(ride).payment_status == Ride.PaymentStatus.COLLECTED
    assert parcel_of(ride).return_payment_status == "DUE"
    paid = pay(driver, ride)

    assert paid.status_code == 200
    assert parcel_of(ride).return_payment_status == "COLLECTED"
    assert fresh(ride).payment_status == Ride.PaymentStatus.COLLECTED
    assert paid.json()["final_fare_paise"] == (
        ride.fare_paise + ride.waiting_paise + (parcel_of(ride).return_fare_paise or 0)
    )


def _send_back(ride: Ride, driver: PartnerProfile) -> tuple[Ride, PartnerProfile]:
    """Take a collected parcel through the drop, the wait and the return."""
    ping_at(driver, DROP)
    assert step(driver, ride, "arrived-at-drop").status_code == 200
    with after_wait():
        assert step(driver, ride, "receiver-unavailable").status_code == 200
    assert hand_back(driver, ride).status_code == 200
    ride.refresh_from_db()
    return ride, driver


def test_the_sender_who_refuses_the_return_leg_leaves_it_unpaid(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = picked_up(rider, area, parcel=body("SEND", "SENDER"))
    pay(driver, ride)
    ride, driver = _send_back(ride, driver)

    response = refuse_to_pay(driver, ride)

    assert response.status_code == 200
    assert parcel_of(ride).return_payment_status == "UNPAID"
    assert fresh(ride).payment_status == Ride.PaymentStatus.COLLECTED  # the fare was paid


def test_when_the_receiver_was_to_pay_everything_is_collected_at_the_pickup(
    rider: User, area: ServiceArea, mode: str
) -> None:
    ride, driver = returned(rider, area, parcel=body(mode, "RECEIVER"))
    assert fresh(ride).payment_status == Ride.PaymentStatus.DUE
    assert parcel_of(ride).return_payment_status == "DUE"

    response = pay(driver, ride)

    assert response.status_code == 200
    assert fresh(ride).payment_status == Ride.PaymentStatus.COLLECTED
    assert parcel_of(ride).return_payment_status == "COLLECTED"


def test_when_the_sender_will_not_pay_everything_due_becomes_unpaid(
    rider: User, area: ServiceArea, mode: str
) -> None:
    ride, driver = returned(rider, area, parcel=body(mode, "RECEIVER"))

    response = refuse_to_pay(driver, ride)

    assert response.status_code == 200
    assert fresh(ride).payment_status == Ride.PaymentStatus.UNPAID
    assert parcel_of(ride).return_payment_status == "UNPAID"


def test_a_sender_pays_parcel_returned_with_the_fare_never_collected(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returned(rider, area, parcel=body("SEND", "SENDER"))

    refuse_to_pay(driver, ride)

    assert fresh(ride).payment_status == Ride.PaymentStatus.UNPAID
    assert parcel_of(ride).return_payment_status == "UNPAID"


def test_not_paid_twice_and_paid_after_not_paid_change_nothing(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returned(rider, area, parcel=body("SEND", "RECEIVER"))
    refuse_to_pay(driver, ride)

    again = refuse_to_pay(driver, ride)
    late = pay(driver, ride)

    assert again.status_code == late.status_code == 200
    assert fresh(ride).payment_status == Ride.PaymentStatus.UNPAID
    assert parcel_of(ride).return_payment_status == "UNPAID"


def test_a_returned_parcel_with_money_due_stays_until_it_is_settled(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returned(rider, area, parcel=body("SEND", "RECEIVER"))
    client = partner_client(driver.user)

    shown = client.get(f"{CAPTAIN}/current/").json()["ride"]
    assert (shown["id"], shown["state"]) == (str(ride.id), "RETURNED")
    assert shown["parcel"]["pickup"] is None  # no longer open: no contacts (D20)
    pay(driver, ride)

    assert client.get(f"{CAPTAIN}/current/").json()["ride"] is None


def test_an_unpaid_parcel_leaves_the_captains_screen(rider: User, area: ServiceArea) -> None:
    ride, driver = returned(rider, area, parcel=body("SEND", "RECEIVER"))
    refuse_to_pay(driver, ride)

    assert partner_client(driver.user).get(f"{CAPTAIN}/current/").json()["ride"] is None


# --- who may say "not paid" -------------------------------------------------------------------


@pytest.mark.parametrize("when", ["in-trip", "returning", "delivered"])
def test_not_paid_is_only_for_a_returned_parcel(rider: User, area: ServiceArea, when: str) -> None:
    if when == "in-trip":
        ride, driver = picked_up(rider, area, parcel=body("SEND", "SENDER"))
    elif when == "returning":
        ride, driver = returning(rider, area, parcel=body("SEND", "SENDER"))
    else:
        ride, driver = at_drop(rider, area, parcel=body("SEND", "SENDER"))
        deliver(driver, ride)

    response = refuse_to_pay(driver, ride)

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")
    assert fresh(ride).payment_status == Ride.PaymentStatus.DUE


def test_another_captain_cannot_settle_the_parcel(rider: User, area: ServiceArea) -> None:
    ride, _driver = returned(rider, area, parcel=body("SEND", "RECEIVER"))
    other_user, _ = ready_captain("Other")
    other = PartnerProfile.objects.get(user=other_user)

    assert pay(other, ride).status_code == 404
    assert refuse_to_pay(other, ride).status_code == 404
    assert fresh(ride).payment_status == Ride.PaymentStatus.DUE


# --- earnings count what was collected --------------------------------------------------------


def earned(driver: PartnerProfile) -> dict[str, Any]:
    response = partner_client(driver.user).get(f"{CAPTAIN}/earnings/?period=today")
    assert response.status_code == 200
    return dict(response.json())


def test_a_delivered_parcel_earns_its_fare_once_collected(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area, parcel=body("SEND", "SENDER"))
    deliver(driver, ride)
    assert earned(driver)["earned_paise"] == 0  # delivered, but the fare is not in hand yet

    pay(driver, ride)

    totals = earned(driver)
    assert totals["rides"] == 1
    assert totals["earned_paise"] == totals["cash_collected_paise"] == fresh(ride).final_fare_paise


def test_a_returned_parcel_earns_the_fare_and_return_leg_collected(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returned(rider, area, parcel=body("SEND", "RECEIVER"))
    pay(driver, ride)

    totals = earned(driver)

    assert totals["rides"] == 1
    assert totals["earned_paise"] == fresh(ride).final_fare_paise
    assert totals["earned_paise"] == (
        ride.fare_paise + ride.waiting_paise + (parcel_of(ride).return_fare_paise or 0)
    )


def test_an_unpaid_parcel_earns_nothing(rider: User, area: ServiceArea) -> None:
    ride, driver = returned(rider, area, parcel=body("SEND", "RECEIVER"))
    refuse_to_pay(driver, ride)

    totals = earned(driver)

    assert (totals["rides"], totals["earned_paise"], totals["cash_collected_paise"]) == (1, 0, 0)


def test_only_the_collected_part_of_a_returned_parcel_is_earned(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = picked_up(rider, area, parcel=body("SEND", "SENDER"))
    pay(driver, ride)  # the fare is collected at pickup
    ride, driver = _send_back(ride, driver)
    refuse_to_pay(driver, ride)  # but the sender will not pay for the return

    assert earned(driver)["earned_paise"] == ride.fare_paise + ride.waiting_paise


def test_a_parcel_in_history_says_what_it_is_and_hides_the_contacts(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returned(rider, area, parcel=body("SEND", "SENDER"))

    page = partner_client(driver.user).get(f"{CAPTAIN}/history/").json()

    item = page["results"][0]
    assert (item["id"], item["kind"], item["state"]) == (str(ride.id), "PARCEL", "RETURNED")
    assert "Asha" not in str(page) and "9876543210" not in str(page)
    assert fresh(ride).state == RideState.RETURNED
