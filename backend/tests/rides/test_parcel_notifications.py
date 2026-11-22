"""Pick up & Drop notifications: each `parcel_*` notice once, to the right person (§4.3)."""

from collections.abc import Callable
from typing import Any

import pytest
from pytest_django.fixtures import SettingsWrapper

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.notifications.models import NotificationIntent
from apps.notifications.templates_registry import registered_template_codes, render_notification
from apps.rides import engine
from apps.rides.models import Ride, RideOffer
from tests.rides.helpers import customer_client, make_user, operations_client, partner_client
from tests.rides.parcel_world import (
    CAPTAIN,
    accepted_parcel,
    after_wait,
    at_drop,
    deliver,
    hand_back,
    new_parcel,
    parcel_body,
    picked_up,
    ping_at,
    returning,
    step,
)
from tests.rides.ride_world import PICKUP, RIDES, captain, dispatch, make_area, new_ride

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]

PARCEL_CODES = (
    "parcel_offer_new",
    "parcel_captain_assigned",
    "parcel_captain_arrived",
    "parcel_no_captain_found",
    "parcel_picked_up",
    "parcel_delivered",
    "parcel_returning",
    "parcel_returned",
    "parcel_item_not_allowed",
)


@pytest.fixture(autouse=True)
def _fake_routing(settings: SettingsWrapper) -> None:
    settings.RIDES_ROUTING_PROVIDER = "fake"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


def intents(template_code: str) -> list[NotificationIntent]:
    return list(NotificationIntent.objects.filter(template_code=template_code))


def only(template_code: str) -> NotificationIntent:
    [notice] = intents(template_code)
    return notice


def title(notice: NotificationIntent) -> str:
    return render_notification(template_code=notice.template_code, context=notice.context).title


def booker_hears(code: str, rider: User) -> None:
    notice = only(code)
    assert (notice.recipient_id, notice.audience, notice.channel) == (rider.pk, "CUSTOMER", "PUSH")


# --- the registry -----------------------------------------------------------------------------


def test_every_parcel_template_is_registered() -> None:
    assert set(PARCEL_CODES) <= registered_template_codes()


# --- before the pickup ------------------------------------------------------------------------


def test_a_new_parcel_alerts_the_captain_once(rider: User, area: ServiceArea) -> None:
    driver = captain(area, km=1)
    parcel = dispatch(new_parcel(rider, area))
    dispatch(parcel, 1)  # delivered twice

    alert = only("parcel_offer_new")

    assert (alert.recipient_id, alert.audience, alert.channel) == (
        driver.user_id,
        "PARTNER",
        "PUSH",
    )
    assert title(alert) == "New parcel request · ₹51"
    assert not intents("rides_offer_new")  # a parcel never uses the ride wording


def test_a_ride_still_uses_the_ride_wording(rider: User, area: ServiceArea) -> None:
    captain(area, km=1)
    dispatch(new_ride(rider, area))

    assert len(intents("rides_offer_new")) == 1
    assert not intents("parcel_offer_new")


def test_the_booker_hears_assigned_then_arrived(rider: User, area: ServiceArea) -> None:
    ride, driver = accepted_parcel(rider, area)
    ping_at(driver, PICKUP)
    engine.mark_arrived(partner=driver, ride_id=ride.id)
    engine.mark_arrived(partner=driver, ride_id=ride.id)  # repeated step

    booker_hears("parcel_captain_assigned", rider)
    booker_hears("parcel_captain_arrived", rider)
    assert (
        title(only("parcel_captain_assigned")) == f"{driver.display_name} is coming for your parcel"
    )
    assert title(only("parcel_captain_arrived")) == f"{driver.display_name} has arrived"
    assert not intents("rides_captain_assigned") and not intents("rides_captain_arrived")


def test_no_captain_found_tells_the_booker(rider: User, area: ServiceArea) -> None:
    dispatch(new_parcel(rider, area))

    booker_hears("parcel_no_captain_found", rider)
    assert not intents("rides_no_captain_found")


# --- the journey ------------------------------------------------------------------------------


def test_picked_up_tells_the_booker_once(rider: User, area: ServiceArea) -> None:
    ride, driver = picked_up(rider, area)
    engine.start_trip(partner=driver, ride_id=ride.id, otp=engine.ride_otp(ride.id))  # repeated

    booker_hears("parcel_picked_up", rider)
    assert title(only("parcel_picked_up")) == "Your parcel is on its way"


def test_delivered_tells_the_booker_once(rider: User, area: ServiceArea) -> None:
    ride, driver = at_drop(rider, area, parcel=parcel_body(pin_required=False))
    deliver(driver, ride, key="d-1")
    deliver(driver, ride, key="d-2")  # a repeated tap

    booker_hears("parcel_delivered", rider)


def test_a_plain_ride_does_not_send_parcel_notices(rider: User, area: ServiceArea) -> None:
    driver = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    engine.accept_offer(partner=driver, offer_id=RideOffer.objects.get(ride=ride).id)
    ping_at(driver, PICKUP)
    engine.mark_arrived(partner=driver, ride_id=ride.id)
    engine.start_trip(partner=driver, ride_id=ride.id, otp=engine.ride_otp(ride.id))

    assert not NotificationIntent.objects.filter(template_code__startswith="parcel_").exists()


def test_a_returning_parcel_tells_the_booker_with_the_captains_name(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returning(rider, area)
    with after_wait():
        step(driver, ride, "receiver-unavailable")  # a repeated tap

    booker_hears("parcel_returning", rider)
    assert (
        driver.display_name
        in render_notification(
            template_code="parcel_returning", context=only("parcel_returning").context
        ).body
    )


def test_a_returned_parcel_tells_the_booker_once(rider: User, area: ServiceArea) -> None:
    ride, driver = returning(rider, area)
    hand_back(driver, ride, key="a")
    hand_back(driver, ride, key="b")

    booker_hears("parcel_returned", rider)


# --- a refused item and cancels (the Rides codes are reused) ----------------------------------


def test_a_refused_item_tells_the_booker_and_not_the_captain(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = accepted_parcel(rider, area)
    ping_at(driver, PICKUP)
    step(driver, ride, "arrived")

    partner_client(driver.user).post(
        f"{CAPTAIN}/{ride.id}/cancel/", {"reason": "ITEM_NOT_ALLOWED"}, format="json"
    )

    booker_hears("parcel_item_not_allowed", rider)
    assert (
        "not been charged"
        in render_notification(template_code="parcel_item_not_allowed", context={}).body
    )
    assert not intents("rides_cancelled_captain")  # the captain did this themselves


def test_a_booker_cancel_tells_the_captain_with_the_ride_code(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = accepted_parcel(rider, area)

    customer_client(rider).post(
        f"{RIDES}{ride.id}/cancel/", {"reason": "CHANGED_MIND"}, format="json"
    )

    assert [n.recipient_id for n in intents("rides_cancelled_captain")] == [driver.user_id]


def test_an_operations_cancel_tells_both_with_the_ride_codes(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = picked_up(rider, area)

    operations_client(make_user("Ops")).post(
        f"/api/v1/operations/rides/{ride.id}/cancel/", {"reason": "Fraud check"}, format="json"
    )

    assert [n.recipient_id for n in intents("rides_cancelled_captain")] == [driver.user_id]
    assert [n.recipient_id for n in intents("rides_cancelled_by_operations")] == [rider.pk]


def test_a_captain_cancel_before_pickup_uses_the_finding_another_code(
    rider: User,
    area: ServiceArea,
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    ride, driver = accepted_parcel(rider, area)

    with django_capture_on_commit_callbacks(execute=True):
        engine.captain_cancel(partner=driver, ride_id=ride.id, reason="VEHICLE_ISSUE")

    assert [n.recipient_id for n in intents("rides_finding_another_captain")] == [rider.pk]


# --- what a notice may carry ------------------------------------------------------------------


def test_every_parcel_notice_renders_and_carries_no_personal_details(
    rider: User, area: ServiceArea
) -> None:
    ride, driver = returning(rider, area)
    hand_back(driver, ride)
    new_parcel_ride = Ride.objects.get(pk=ride.pk)
    codes = {engine.ride_otp(new_parcel_ride.id), engine.parcel_delivery_pin(new_parcel_ride.id)}
    personal = {"9876543210", "9123456780", "Asha Rao", "Sky Towers"}

    notices = NotificationIntent.objects.filter(template_code__startswith="parcel_")

    assert notices.count() >= 5
    for notice in notices:
        rendered = render_notification(template_code=notice.template_code, context=notice.context)
        text = f"{rendered.title} {rendered.body}"
        assert not any(item in text for item in personal | codes)
        # Compared whole, so a code that happens to sit inside an id is not a false alarm.
        assert not {str(value) for value in notice.context.values()} & codes
        assert set(notice.context) <= {
            "ride_id",
            "offer_id",
            "amount",
            "partner_name",
            "pickup_distance_m",
        }


def test_the_booker_notices_go_to_the_booker_even_when_receiving(
    rider: User, area: ServiceArea
) -> None:
    """Who is at the drop does not matter: the app user who booked is the one told (D7)."""
    ride, driver = accepted_parcel(rider, area, parcel=parcel_body(mode="RECEIVE"))
    ping_at(driver, PICKUP)
    engine.mark_arrived(partner=driver, ride_id=ride.id)

    assert {n.recipient_id for n in intents("parcel_captain_arrived")} == {rider.pk}
