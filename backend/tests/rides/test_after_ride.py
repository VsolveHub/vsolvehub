"""After the ride: ratings (once per side), SOS, ride history and captain earnings."""

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone
from freezegun import freeze_time

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides import engine, location
from apps.rides.models import Ride, RideOffer, RideRating, RideSosEvent
from tests.rides.helpers import customer_client, make_user, partner_client
from tests.rides.ride_world import (
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
IST = ZoneInfo("Asia/Kolkata")


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


@pytest.fixture
def ravi(area: ServiceArea) -> PartnerProfile:
    return captain(area, km=1)


def at_pickup(partner: PartnerProfile, area: ServiceArea, *, listed: bool = False) -> None:
    """A fresh ping at the pickup; `listed` puts the captain back on the map for new rides."""
    location.record_position(
        partner_id=partner.id,
        latitude=float(PICKUP[0]),
        longitude=float(PICKUP[1]),
        accuracy_m=10,
        heading=None,
        captured_at=timezone.now().isoformat(),
        listed_in=location.geo_key(area.id, "BIKE") if listed else None,
    )


def assigned_ride(rider: User, area: ServiceArea, ravi: PartnerProfile) -> Ride:
    at_pickup(ravi, area, listed=True)
    ride = dispatch(new_ride(rider, area))
    engine.accept_offer(partner=ravi, offer_id=RideOffer.objects.get(ride=ride, captain=ravi).id)
    ride.refresh_from_db()
    return ride


def completed_ride(
    rider: User, area: ServiceArea, ravi: PartnerProfile, *, paid: bool = False
) -> Ride:
    ride = assigned_ride(rider, area, ravi)
    at_pickup(ravi, area)
    engine.mark_arrived(partner=ravi, ride_id=ride.id)
    engine.start_trip(partner=ravi, ride_id=ride.id, otp=engine.ride_otp(ride.id))
    engine.complete_trip(partner=ravi, ride_id=ride.id)
    if paid:
        engine.mark_payment_received(partner=ravi, ride_id=ride.id)
    ride.refresh_from_db()
    return ride


def rate(client: Any, url: str, stars: Any) -> Any:
    return client.post(url, {"stars": stars}, format="json")


# --- Ratings ----------------------------------------------------------------------------------


def test_both_sides_rate_once_after_the_ride(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = completed_ride(rider, area, ravi)
    rider_url, captain_url = f"{RIDES}{ride.id}/rating/", f"{CAPTAIN}/{ride.id}/rating/"

    assert rate(customer_client(rider), rider_url, 5).status_code == 201
    assert rate(partner_client(ravi.user), captain_url, 4).json() == {"stars": 4}

    # Scenario 30: each side rates once only.
    again = rate(customer_client(rider), rider_url, 1)
    assert (again.status_code, error_code(again)) == (409, "invalid_transition")
    assert rate(partner_client(ravi.user), captain_url, 1).status_code == 409
    stars = dict(RideRating.objects.filter(ride=ride).values_list("rater_kind", "stars"))
    assert stars == {"RIDER": 5, "CAPTAIN": 4}


def test_each_app_knows_whether_it_has_rated(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = completed_ride(rider, area, ravi)
    assert customer_client(rider).get(f"{RIDES}{ride.id}/").json()["my_rating"] is None

    rate(customer_client(rider), f"{RIDES}{ride.id}/rating/", 5)

    assert customer_client(rider).get(f"{RIDES}{ride.id}/").json()["my_rating"] == 5
    current = partner_client(ravi.user).get(f"{CAPTAIN}/current/").json()["ride"]
    assert current["my_rating"] is None  # the captain has not rated yet


def test_no_rating_before_the_ride_is_completed(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = assigned_ride(rider, area, ravi)
    response = rate(customer_client(rider), f"{RIDES}{ride.id}/rating/", 5)
    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


@pytest.mark.parametrize("stars", [0, 6, "five", None])
def test_stars_are_one_to_five(
    rider: User, area: ServiceArea, ravi: PartnerProfile, stars: Any
) -> None:
    ride = completed_ride(rider, area, ravi)
    assert rate(customer_client(rider), f"{RIDES}{ride.id}/rating/", stars).status_code == 400


def test_nobody_rates_someone_elses_ride(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = completed_ride(rider, area, ravi)
    stranger = captain(area, km=3)

    assert (
        rate(customer_client(make_user("Other")), f"{RIDES}{ride.id}/rating/", 5).status_code == 404
    )
    assert rate(partner_client(stranger.user), f"{CAPTAIN}/{ride.id}/rating/", 5).status_code == 404


# --- SOS --------------------------------------------------------------------------------------


def sos(client: Any, url: str, body: dict[str, Any] | None = None) -> Any:
    return client.post(url, body or {}, format="json")


def test_rider_sos_records_the_place_and_shows_the_emergency_number(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = assigned_ride(rider, area, ravi)

    response = sos(
        customer_client(rider),
        f"{RIDES}{ride.id}/sos/",
        {"latitude": "17.441000", "longitude": "78.351000"},
    )

    assert response.status_code == 201
    assert response.json()["emergency_number"] == "112"
    event = RideSosEvent.objects.get(id=response.json()["sos_id"])
    assert (str(event.latitude), event.status, event.raised_by_id) == (
        "17.441000",
        "OPEN",
        rider.pk,
    )


def test_a_second_press_is_the_same_alert(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = assigned_ride(rider, area, ravi)
    url = f"{RIDES}{ride.id}/sos/"

    first, second = sos(customer_client(rider), url), sos(customer_client(rider), url)

    assert first.json()["sos_id"] == second.json()["sos_id"]
    assert RideSosEvent.objects.count() == 1


def test_an_sos_is_never_refused_for_lack_of_a_place(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = assigned_ride(rider, area, ravi)

    rider_sos = sos(customer_client(rider), f"{RIDES}{ride.id}/sos/")
    captain_sos = sos(partner_client(ravi.user), f"{CAPTAIN}/{ride.id}/sos/")

    assert rider_sos.status_code == captain_sos.status_code == 201
    # Either side's SOS without a place falls back to the captain's last ping: same vehicle.
    for response in (rider_sos, captain_sos):
        event = RideSosEvent.objects.get(id=response.json()["sos_id"])
        assert float(event.latitude or 0) == pytest.approx(float(PICKUP[0]))


def test_latitude_and_longitude_come_together(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = assigned_ride(rider, area, ravi)
    response = sos(customer_client(rider), f"{RIDES}{ride.id}/sos/", {"latitude": "17.44"})
    assert response.status_code == 400


def test_sos_is_for_a_live_ride_only(rider: User, area: ServiceArea, ravi: PartnerProfile) -> None:
    ride = completed_ride(rider, area, ravi)
    response = sos(customer_client(rider), f"{RIDES}{ride.id}/sos/")
    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


def test_nobody_raises_an_sos_on_someone_elses_ride(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = assigned_ride(rider, area, ravi)
    assert sos(customer_client(make_user("Other")), f"{RIDES}{ride.id}/sos/").status_code == 404
    assert (
        sos(partner_client(captain(area, km=3).user), f"{CAPTAIN}/{ride.id}/sos/").status_code
        == 404
    )


# --- History ----------------------------------------------------------------------------------


def test_rider_history_lists_only_my_rides_newest_first(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    older = completed_ride(rider, area, ravi)
    newer = new_ride(rider, area)
    new_ride(make_user("Someone Else"), area)

    body = customer_client(rider).get(RIDES).json()

    assert [row["id"] for row in body["results"]] == [str(newer.id), str(older.id)]
    assert body["results"][1]["final_fare_paise"] == older.final_fare_paise
    assert body["results"][1]["pickup_address"] == "Gachibowli"
    assert set(body) >= {"next", "previous", "results"}


def test_captain_history_lists_the_rides_they_did(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    ride = completed_ride(rider, area, ravi, paid=True)
    new_ride(make_user("Someone Else"), area)  # never offered to Ravi's history

    rows = partner_client(ravi.user).get(f"{CAPTAIN}/history/").json()["results"]

    assert [(r["id"], r["state"], r["payment_status"]) for r in rows] == [
        (str(ride.id), "COMPLETED", "COLLECTED")
    ]


# --- Earnings ---------------------------------------------------------------------------------


def earnings(partner: PartnerProfile, period: str) -> Any:
    return partner_client(partner.user).get(f"{CAPTAIN}/earnings/?period={period}")


def test_earnings_today_and_this_week_in_india_time(
    rider: User, area: ServiceArea, ravi: PartnerProfile
) -> None:
    today = completed_ride(rider, area, ravi, paid=True)
    monday = completed_ride(make_user("Rider Two"), area, ravi)  # not marked paid
    last_week = completed_ride(make_user("Rider Three"), area, ravi, paid=True)
    for ride, when in (
        (today, datetime(2026, 11, 11, 10, 0, tzinfo=IST)),  # Wednesday
        (monday, datetime(2026, 11, 9, 10, 0, tzinfo=IST)),
        (last_week, datetime(2026, 11, 8, 23, 0, tzinfo=IST)),  # Sunday before
    ):
        Ride.objects.filter(pk=ride.pk).update(completed_at=when)
    fare = today.final_fare_paise or 0

    with freeze_time(datetime(2026, 11, 11, 18, 0, tzinfo=IST)):
        day = earnings(ravi, "today").json()
        week = earnings(ravi, "week").json()

    assert (day["rides"], day["earned_paise"], day["cash_collected_paise"]) == (1, fare, fare)
    assert (week["rides"], week["earned_paise"], week["cash_collected_paise"]) == (
        2,
        2 * fare,
        fare,
    )
    assert week["since"].startswith("2026-11-09T00:00:00")


def test_a_new_captain_has_zero_earnings(ravi: PartnerProfile) -> None:
    body = earnings(ravi, "today").json()
    assert (body["rides"], body["earned_paise"], body["cash_collected_paise"]) == (0, 0, 0)


@pytest.mark.parametrize("query", ["?period=month", "?period=", ""])
def test_earnings_need_today_or_week(ravi: PartnerProfile, query: str) -> None:
    response = partner_client(ravi.user).get(f"{CAPTAIN}/earnings/{query}")
    assert response.status_code == 400
