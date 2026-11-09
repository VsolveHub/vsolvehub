"""Booking a ride and finding it a captain (brief §5.4, §5.6).

Captains are put on the live map in the local Docker Redis, database 15, emptied around each test.
"""

import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper

from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides import engine
from apps.rides.models import (
    CaptainDutySession,
    CaptainPass,
    CaptainVehicle,
    Ride,
    RideOffer,
    RideRateCard,
    RideState,
    RideTransition,
)
from tests.rides.helpers import customer_client, make_user, set_status
from tests.rides.ride_world import (
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


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


# --- Booking ----------------------------------------------------------------------------------


def test_booking_starts_a_search_and_uses_the_quote(rider: User, area: ServiceArea) -> None:
    quote = quote_for(rider, area)

    response = book(customer_client(rider), quote)

    assert response.status_code == 201
    body = response.json()
    assert (body["state"], body["fare_paise"], body["vehicle_type"]) == ("SEARCHING", 5100, "BIKE")
    assert body["pickup"]["address"] == "Gachibowli"
    ride = Ride.objects.get()
    quote.refresh_from_db()
    assert quote.consumed_at is not None
    first = RideTransition.objects.get(ride=ride)
    assert (first.from_state, first.to_state, first.actor_kind) == ("", "SEARCHING", "RIDER")
    event = OutboxEvent.objects.get(event_type=engine.RIDE_REQUESTED)
    assert event.aggregate_id == ride.id


def test_the_same_idempotency_key_returns_the_same_ride(rider: User, area: ServiceArea) -> None:
    client, quote = customer_client(rider), quote_for(rider, area)

    first, second = book(client, quote), book(client, quote)

    assert first.json()["id"] == second.json()["id"]
    assert second["Idempotent-Replay"] == "true"
    assert Ride.objects.count() == 1


def test_booking_needs_an_idempotency_key(rider: User, area: ServiceArea) -> None:
    client = customer_client(rider)
    response = client.post(RIDES, {"quote_id": str(quote_for(rider, area).id)}, format="json")
    assert response.status_code == 400


def test_a_quote_used_once_cannot_book_again(rider: User, area: ServiceArea) -> None:
    client, quote = customer_client(rider), quote_for(rider, area)
    book(client, quote, "k-1")

    response = book(client, quote, "k-2")

    assert (response.status_code, error_code(response)) == (409, "quote_used")


def test_an_expired_quote_is_refused(rider: User, area: ServiceArea) -> None:
    response = book(customer_client(rider), quote_for(rider, area, expires_in=-1))
    assert (response.status_code, error_code(response)) == (422, "quote_expired")


def test_only_one_open_ride_per_rider(rider: User, area: ServiceArea) -> None:
    client = customer_client(rider)
    book(client, quote_for(rider, area), "k-1")

    response = book(client, quote_for(rider, area), "k-2")

    assert (response.status_code, error_code(response)) == (409, "ride_already_open")


def test_a_vehicle_switched_off_since_the_quote_cannot_be_booked(
    rider: User, area: ServiceArea
) -> None:
    quote = quote_for(rider, area)
    RideRateCard.objects.update(is_active=False)

    response = book(customer_client(rider), quote)

    assert (response.status_code, error_code(response)) == (422, "vehicle_unavailable")


def test_someone_elses_or_an_unknown_quote_is_not_found(rider: User, area: ServiceArea) -> None:
    client = customer_client(rider)
    other = quote_for(make_user("Someone Else"), area)

    assert book(client, other, "k-1").status_code == 404
    unknown = client.post(
        RIDES, {"quote_id": str(uuid.uuid4())}, format="json", HTTP_IDEMPOTENCY_KEY="k-2"
    )
    assert unknown.status_code == 404


def test_a_rider_sees_only_their_own_ride(rider: User, area: ServiceArea) -> None:
    ride = new_ride(rider, area)

    mine = customer_client(rider).get(f"{RIDES}{ride.id}/")
    theirs = customer_client(make_user("Someone Else")).get(f"{RIDES}{ride.id}/")

    assert (mine.status_code, mine.json()["state"]) == (200, "SEARCHING")
    assert mine.json()["route_polyline"] == "abc"
    assert theirs.status_code == 404


def test_booking_needs_a_signed_in_user(rider: User, area: ServiceArea) -> None:
    from rest_framework.test import APIClient  # noqa: PLC0415

    assert book(APIClient(), quote_for(rider, area)).status_code in (401, 403)


# --- Dispatch ---------------------------------------------------------------------------------


def test_booking_offers_the_ride_through_the_outbox(
    rider: User,
    area: ServiceArea,
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    near = captain(area, km=1)

    with django_capture_on_commit_callbacks(execute=True):
        response = book(customer_client(rider), quote_for(rider, area))

    ride = Ride.objects.get(id=response.json()["id"])
    assert (ride.state, ride.dispatch_round) == (RideState.SEARCHING, 1)
    assert offered(ride) == [near.id]


def test_round_one_offers_the_three_nearest_captains(rider: User, area: ServiceArea) -> None:
    a, b, c = captain(area, km=0.5), captain(area, km=1), captain(area, km=1.5)
    captain(area, km=1.8)  # fourth nearest: left out

    ride = dispatch(new_ride(rider, area))

    assert offered(ride) == [a.id, b.id, c.id]
    offer = RideOffer.objects.get(ride=ride, captain=a)
    assert offer.round == 1
    assert 400 <= offer.pickup_distance_m <= 600
    assert offer.expires_at == offer.offered_at + timedelta(seconds=15)


def test_an_empty_round_widens_the_search_at_once(rider: User, area: ServiceArea) -> None:
    far = captain(area, km=3)

    ride = dispatch(new_ride(rider, area))

    assert ride.dispatch_round == 2
    assert offered(ride) == [far.id]


def test_nobody_in_any_radius_means_no_captain_found(rider: User, area: ServiceArea) -> None:
    captain(area, km=7)  # beyond the last radius

    ride = dispatch(new_ride(rider, area))

    assert ride.state == RideState.NO_CAPTAIN_FOUND
    assert ride.no_captain_found_at is not None
    last = RideTransition.objects.filter(ride=ride).order_by("at").last()
    assert last is not None
    assert (last.from_state, last.to_state, last.actor_kind) == (
        "SEARCHING",
        "NO_CAPTAIN_FOUND",
        "SYSTEM",
    )


def _off_duty(p: PartnerProfile) -> None:
    CaptainDutySession.objects.filter(partner=p).update(
        ended_at=timezone.now(), end_reason="CAPTAIN_OFF"
    )


def _no_pass(p: PartnerProfile) -> None:
    CaptainPass.objects.filter(partner=p).update(status=CaptainPass.Status.EXPIRED)


def _suspended(p: PartnerProfile) -> None:
    set_status(PartnerApplication.objects.get(partner=p), PartnerApplication.Status.SUSPENDED)


def _other_vehicle(p: PartnerProfile) -> None:
    CaptainVehicle.objects.filter(partner=p).update(vehicle_type="CAB")


def _on_a_ride(p: PartnerProfile) -> None:
    other = new_ride(make_user("Other Rider"), RideRateCard.objects.get().service_area)
    Ride.objects.filter(pk=other.pk).update(
        state=RideState.CAPTAIN_ASSIGNED, captain=p, captain_assigned_at=timezone.now()
    )


def _offer_elsewhere(p: PartnerProfile) -> None:
    other = new_ride(make_user("Other Rider"), RideRateCard.objects.get().service_area)
    RideOffer.objects.create(
        ride=other,
        captain=p,
        round=1,
        pickup_distance_m=100,
        expires_at=timezone.now() + timedelta(seconds=15),
    )


@pytest.mark.parametrize(
    "exclude",
    [_off_duty, _no_pass, _suspended, _other_vehicle, _on_a_ride, _offer_elsewhere],
    ids=["off-duty", "no-pass", "suspended", "other-vehicle", "on-a-ride", "offer-elsewhere"],
)
def test_ineligible_captains_get_no_offer(
    rider: User, area: ServiceArea, exclude: Callable[[PartnerProfile], None]
) -> None:
    excluded = captain(area, km=0.5)
    exclude(excluded)

    ride = dispatch(new_ride(rider, area))

    assert excluded.id not in offered(ride)


def test_an_inaccurate_or_expired_position_gets_no_offer(
    rider: User, area: ServiceArea, ride_redis: Any
) -> None:
    captain(area, km=0.5, accuracy_m=150)
    gone = captain(area, km=1)
    ride_redis.delete(f"rides:pos:{gone.id}")  # its 30 s TTL ran out

    ride = dispatch(new_ride(rider, area))

    assert ride.state == RideState.NO_CAPTAIN_FOUND


def test_a_captain_is_never_offered_their_own_ride(area: ServiceArea) -> None:
    me = captain(area, km=0.5)

    ride = dispatch(new_ride(me.user, area))

    assert ride.state == RideState.NO_CAPTAIN_FOUND


def test_the_next_round_expires_old_offers_and_tries_new_captains(
    rider: User, area: ServiceArea
) -> None:
    first = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    second = captain(area, km=3)

    with after_offers_expire():
        ride = dispatch(ride, 2)

    assert RideOffer.objects.get(ride=ride, captain=first).status == RideOffer.Status.EXPIRED
    assert offered(ride) == [second.id]
    assert ride.dispatch_round == 2


def test_after_the_last_round_the_ride_has_no_captain(rider: User, area: ServiceArea) -> None:
    captain(area, km=5)  # only reachable in round 3
    ride = dispatch(new_ride(rider, area))
    assert ride.dispatch_round == 3

    with after_offers_expire():
        ride = dispatch(ride, 4)

    assert ride.state == RideState.NO_CAPTAIN_FOUND
    assert not RideOffer.objects.filter(status=RideOffer.Status.PENDING).exists()


def test_a_repeated_or_early_round_changes_nothing(rider: User, area: ServiceArea) -> None:
    captain(area, km=1)
    ride = dispatch(new_ride(rider, area))

    dispatch(ride, 1)  # delivered twice
    dispatch(ride, 2)  # too early: the round-1 offer is still live

    assert RideOffer.objects.count() == 1
    assert ride.dispatch_round == 1


def test_redis_down_leaves_the_ride_searching_for_the_sweep(
    rider: User, area: ServiceArea, settings: SettingsWrapper
) -> None:
    ride = new_ride(rider, area)
    settings.RIDES_REDIS_URL = "redis://127.0.0.1:1/0"

    ride = dispatch(ride)

    assert (ride.state, ride.dispatch_round) == (RideState.SEARCHING, 0)


def test_the_sweep_moves_on_only_rides_whose_round_ended(rider: User, area: ServiceArea) -> None:
    stuck = new_ride(rider, area)  # the outbox message was lost: round 1 never ran
    near = captain(area, km=1)
    busy_rider = make_user("Busy Rider")
    busy = dispatch(new_ride(busy_rider, area))  # round 1 sent; its offer is live
    captain(area, km=1.2)

    moved = engine.redrive_dispatch()

    assert moved == 1
    stuck.refresh_from_db()
    assert stuck.dispatch_round == 1
    assert offered(busy) == [near.id]


def test_a_ride_no_longer_searching_is_left_alone(rider: User, area: ServiceArea) -> None:
    captain(area, km=1)
    ride = new_ride(rider, area)
    Ride.objects.filter(pk=ride.pk).update(
        state=RideState.CANCELLED,
        cancelled_at=timezone.now(),
        cancelled_by="RIDER",
        cancel_reason="CHANGED_MIND",
    )

    dispatch(ride)

    assert not RideOffer.objects.exists()
