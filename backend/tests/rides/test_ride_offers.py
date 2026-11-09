"""Ride requests on the captain's phone: see the current one, accept it, or decline it."""

from collections.abc import Callable
from typing import Any

import pytest
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides.models import CaptainDutySession, Ride, RideOffer, RideState, RideTransition
from tests.rides.helpers import customer_client, make_user, partner_client
from tests.rides.ride_world import (
    RIDES,
    after_offers_expire,
    captain,
    dispatch,
    error_code,
    make_area,
    new_ride,
    offered,
)

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]

CURRENT = "/api/v1/partner/rides/offers/current/"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


def client_of(partner: PartnerProfile) -> APIClient:
    return partner_client(partner.user)


def offer_of(ride: Ride, partner: PartnerProfile) -> RideOffer:
    return RideOffer.objects.get(ride=ride, captain=partner)


def accept(partner: PartnerProfile, offer: RideOffer, key: str = "a-1") -> Any:
    return client_of(partner).post(
        f"/api/v1/partner/rides/offers/{offer.id}/accept/", HTTP_IDEMPOTENCY_KEY=key
    )


def decline(partner: PartnerProfile, offer: RideOffer) -> Any:
    return client_of(partner).post(f"/api/v1/partner/rides/offers/{offer.id}/decline/")


# --- The current offer ------------------------------------------------------------------------


def test_the_captain_sees_the_offer_with_its_deadline(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))

    body = client_of(ravi).get(CURRENT).json()

    offer = body["offer"]
    assert offer["id"] == str(offer_of(ride, ravi).id)
    assert offer["ride_id"] == str(ride.id)
    assert (offer["fare_paise"], offer["trip_distance_m"], offer["vehicle_type"]) == (
        5100,
        4200,
        "BIKE",
    )
    assert offer["pickup"]["address"] == "Gachibowli"
    assert 900 <= offer["pickup_distance_m"] <= 1100
    assert offer["expires_at"] and body["server_now"]


def test_no_offer_means_null(area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    assert client_of(ravi).get(CURRENT).json()["offer"] is None


def test_an_expired_offer_is_no_longer_shown(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    dispatch(new_ride(rider, area))

    with after_offers_expire():
        assert client_of(ravi).get(CURRENT).json()["offer"] is None


def test_customers_cannot_use_captain_offer_urls(rider: User) -> None:
    assert customer_client(rider).get(CURRENT).status_code == 403


# --- Accept -----------------------------------------------------------------------------------


def test_accepting_assigns_the_captain_and_withdraws_the_other_offers(
    rider: User, area: ServiceArea
) -> None:
    ravi, other = captain(area, km=0.5), captain(area, km=1)
    ride = dispatch(new_ride(rider, area))

    response = accept(ravi, offer_of(ride, ravi))

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "CAPTAIN_ASSIGNED"
    assert body["rider"] == {"name": "Priya Rider", "phone_number": str(rider.phone_number)}
    ride.refresh_from_db()
    assert (ride.state, ride.captain_id) == (RideState.CAPTAIN_ASSIGNED, ravi.id)
    assert ride.captain_assigned_at is not None
    assert offer_of(ride, ravi).status == RideOffer.Status.ACCEPTED
    assert offer_of(ride, other).status == RideOffer.Status.WITHDRAWN
    last = RideTransition.objects.filter(ride=ride).order_by("at").last()
    assert last is not None
    assert (last.to_state, last.actor_kind, last.actor_id) == (
        "CAPTAIN_ASSIGNED",
        "CAPTAIN",
        ravi.user_id,
    )


def test_the_rider_then_sees_who_is_coming(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=0.5)
    ride = dispatch(new_ride(rider, area))
    assert customer_client(rider).get(f"{RIDES}{ride.id}/").json()["captain"] is None

    accept(ravi, offer_of(ride, ravi))

    card = customer_client(rider).get(f"{RIDES}{ride.id}/").json()["captain"]
    assert card["name"] == ravi.display_name
    assert card["phone_number"] == str(ravi.user.phone_number)
    assert card["vehicle"]["registration_number"].startswith("TS09AB")
    assert card["photo_url"] is None  # no reviewed photo yet


def test_the_second_captain_to_accept_is_told_it_is_gone(rider: User, area: ServiceArea) -> None:
    ravi, late = captain(area, km=0.5), captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    accept(ravi, offer_of(ride, ravi))

    response = accept(late, offer_of(ride, late))

    assert (response.status_code, error_code(response)) == (409, "ride_no_longer_available")


def test_an_expired_offer_cannot_be_accepted(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=0.5)
    ride = dispatch(new_ride(rider, area))

    with after_offers_expire():
        response = accept(ravi, offer_of(ride, ravi))

    assert (response.status_code, error_code(response)) == (409, "ride_no_longer_available")


def test_accepting_again_returns_the_same_ride(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=0.5)
    ride = dispatch(new_ride(rider, area))
    offer = offer_of(ride, ravi)

    first = accept(ravi, offer, "a-1")
    replay = accept(ravi, offer, "a-1")
    new_key = accept(ravi, offer, "a-2")

    assert first.json()["id"] == replay.json()["id"] == new_key.json()["id"]
    assert replay["Idempotent-Replay"] == "true"
    assert new_key.status_code == 200
    assert RideTransition.objects.filter(ride=ride, to_state="CAPTAIN_ASSIGNED").count() == 1


def test_accept_needs_an_idempotency_key(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=0.5)
    ride = dispatch(new_ride(rider, area))
    url = f"/api/v1/partner/rides/offers/{offer_of(ride, ravi).id}/accept/"
    assert client_of(ravi).post(url).status_code == 400


def test_someone_elses_offer_is_not_found(rider: User, area: ServiceArea) -> None:
    ravi, stranger = captain(area, km=0.5), captain(area, km=8)
    ride = dispatch(new_ride(rider, area))

    assert accept(stranger, offer_of(ride, ravi)).status_code == 404
    assert decline(stranger, offer_of(ride, ravi)).status_code == 404


def test_a_captain_who_went_off_duty_cannot_accept(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=0.5)
    ride = dispatch(new_ride(rider, area))
    CaptainDutySession.objects.filter(partner=ravi).update(
        ended_at=timezone.now(), end_reason="CAPTAIN_OFF"
    )

    response = accept(ravi, offer_of(ride, ravi))

    assert (response.status_code, error_code(response)) == (409, "not_on_duty")


def test_a_late_round_does_nothing_once_a_captain_accepted(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=0.5)
    ride = dispatch(new_ride(rider, area))
    accept(ravi, offer_of(ride, ravi))
    captain(area, km=3)

    with after_offers_expire():
        ride = dispatch(ride, 2)

    assert ride.state == RideState.CAPTAIN_ASSIGNED
    assert RideOffer.objects.filter(ride=ride).count() == 1


# --- Decline ----------------------------------------------------------------------------------


def test_declining_offers_the_ride_to_the_next_captain_at_once(
    rider: User,
    area: ServiceArea,
    settings: SettingsWrapper,
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    settings.RIDES_OFFERS_PER_ROUND = 1
    first, second = captain(area, km=0.5), captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    assert offered(ride) == [first.id]

    with django_capture_on_commit_callbacks(execute=True):
        response = decline(first, offer_of(ride, first))

    assert response.status_code == 204
    assert offer_of(ride, first).status == RideOffer.Status.DECLINED
    ride.refresh_from_db()
    assert (ride.dispatch_round, offered(ride)) == (2, [second.id])


def test_one_decline_waits_while_others_are_still_deciding(
    rider: User,
    area: ServiceArea,
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    first, second = captain(area, km=0.5), captain(area, km=1)
    ride = dispatch(new_ride(rider, area))

    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        decline(first, offer_of(ride, first))

    assert callbacks == []
    assert offered(ride) == [second.id]


def test_declining_twice_changes_nothing(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=0.5)
    ride = dispatch(new_ride(rider, area))
    offer = offer_of(ride, ravi)

    assert decline(ravi, offer).status_code == 204
    assert decline(ravi, offer).status_code == 204
    assert offer_of(ride, ravi).status == RideOffer.Status.DECLINED


def test_declining_after_the_deadline_changes_nothing(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=0.5)
    ride = dispatch(new_ride(rider, area))

    with after_offers_expire():
        assert decline(ravi, offer_of(ride, ravi)).status_code == 204

    # Left for the next round to mark EXPIRED; a decline after the deadline is not a decline.
    assert offer_of(ride, ravi).status == RideOffer.Status.PENDING
