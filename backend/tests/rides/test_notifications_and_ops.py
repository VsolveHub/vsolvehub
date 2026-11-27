"""Notifications (queued once per event, to the right audience) and the Operations rides APIs:
rides list and detail, captains, and the SOS queue."""

from collections.abc import Callable
from typing import Any

import pytest
from django.utils import timezone

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.notifications.models import NotificationIntent
from apps.notifications.templates_registry import render_notification
from apps.partners.models import PartnerProfile
from apps.rides import engine, location
from apps.rides.models import Ride, RideOffer, RideRating, RideSosEvent
from tests.rides.helpers import customer_client, make_user, operations_client, partner_client
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

OPS = "/api/v1/operations/rides"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


@pytest.fixture
def ops() -> Any:
    return operations_client(make_user("Ops Person"))


def intents(template_code: str) -> list[NotificationIntent]:
    return list(NotificationIntent.objects.filter(template_code=template_code))


def at_pickup(partner: PartnerProfile) -> None:
    location.record_position(
        partner_id=partner.id,
        latitude=float(PICKUP[0]),
        longitude=float(PICKUP[1]),
        accuracy_m=10,
        heading=None,
        captured_at=timezone.now().isoformat(),
        listed_in=None,
    )


def accepted(rider: User, area: ServiceArea, partner: PartnerProfile) -> Ride:
    ride = dispatch(new_ride(rider, area))
    engine.accept_offer(
        partner=partner, offer_id=RideOffer.objects.get(ride=ride, captain=partner).id
    )
    ride.refresh_from_db()
    return ride


# --- Notifications ----------------------------------------------------------------------------


def test_a_new_offer_alerts_the_captain_once(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = dispatch(new_ride(rider, area))
    dispatch(ride, 1)  # delivered twice

    [alert] = intents("rides_offer_new")

    assert (alert.recipient_id, alert.audience, alert.channel) == (
        ravi.user_id,
        "PARTNER",
        "PUSH",
    )
    assert render_notification(template_code=alert.template_code, context=alert.context).title == (
        "New ride request · ₹51"
    )


def test_the_rider_hears_assigned_then_arrived(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = accepted(rider, area, ravi)
    at_pickup(ravi)
    engine.mark_arrived(partner=ravi, ride_id=ride.id)
    engine.mark_arrived(partner=ravi, ride_id=ride.id)  # repeated step

    for code in ("rides_captain_assigned", "rides_captain_arrived"):
        [notice] = intents(code)
        assert (notice.recipient_id, notice.audience) == (rider.pk, "CUSTOMER")
    assigned = intents("rides_captain_assigned")[0]
    title = render_notification(template_code=assigned.template_code, context=assigned.context)
    assert title.title == f"{ravi.display_name} is coming"


def test_no_captain_found_tells_the_rider(rider: User, area: ServiceArea) -> None:
    dispatch(new_ride(rider, area))

    [notice] = intents("rides_no_captain_found")

    assert (notice.recipient_id, notice.audience) == (rider.pk, "CUSTOMER")


def test_a_captain_cancel_tells_the_rider_another_is_coming(
    rider: User,
    area: ServiceArea,
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    ravi, arjun = captain(area, km=0.5), captain(area, km=1)
    ride = accepted(rider, area, ravi)

    with django_capture_on_commit_callbacks(execute=True):
        engine.captain_cancel(partner=ravi, ride_id=ride.id, reason="VEHICLE_ISSUE")

    assert [n.recipient_id for n in intents("rides_finding_another_captain")] == [rider.pk]
    # Arjun is offered the ride again in the new search: a second alert for him.
    arjun_alerts = [n for n in intents("rides_offer_new") if n.recipient_id == arjun.user_id]
    assert len(arjun_alerts) == 2


def test_a_rider_cancel_tells_only_the_assigned_captain(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    searching = dispatch(new_ride(make_user("Early Rider"), area))
    engine.rider_cancel(rider=searching.rider, ride_id=searching.id, reason="CHANGED_MIND")
    assert intents("rides_cancelled_captain") == []  # nobody was assigned

    ride = accepted(rider, area, ravi)
    engine.rider_cancel(rider=rider, ride_id=ride.id, reason="CHANGED_MIND")

    [notice] = intents("rides_cancelled_captain")
    assert (notice.recipient_id, notice.audience) == (ravi.user_id, "PARTNER")
    assert intents("rides_cancelled_by_operations") == []


def test_an_operations_cancel_tells_both(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = accepted(rider, area, ravi)

    engine.operations_cancel(operator=make_user("Ops"), ride_id=ride.id, reason="Safety")

    assert [n.recipient_id for n in intents("rides_cancelled_captain")] == [ravi.user_id]
    assert [n.recipient_id for n in intents("rides_cancelled_by_operations")] == [rider.pk]


def test_an_sos_reaches_every_operations_user_once(rider: User, area: ServiceArea) -> None:
    first_ops, second_ops = make_user("Ops One"), make_user("Ops Two")
    operations_client(first_ops)
    operations_client(second_ops)
    ride = accepted(rider, area, captain(area, km=1))

    for _ in range(2):  # a double press
        customer_client(rider).post(f"{RIDES}{ride.id}/sos/", {}, format="json")

    alerts = intents("rides_sos_raised")
    assert sorted(str(n.recipient_id) for n in alerts) == sorted(
        [str(first_ops.pk), str(second_ops.pk)]
    )
    assert {(n.audience, n.channel) for n in alerts} == {("OPERATIONS", "IN_APP")}
    assert render_notification(
        template_code="rides_sos_raised", context=alerts[0].context
    ).title == ("SOS on a ride")


def test_notices_never_carry_the_code_or_a_position(rider: User, area: ServiceArea) -> None:
    ravi = captain(area, km=1)
    ride = accepted(rider, area, ravi)
    at_pickup(ravi)
    engine.mark_arrived(partner=ravi, ride_id=ride.id)
    customer_client(rider).post(
        f"{RIDES}{ride.id}/sos/", {"latitude": "17.44", "longitude": "78.35"}, format="json"
    )
    code = engine.ride_otp(ride.id)

    for notice in NotificationIntent.objects.filter(template_code__startswith="rides_"):
        flat = str(notice.context)
        assert code not in flat
        assert "latitude" not in flat and "17.44" not in flat


# --- Operations: rides list and detail --------------------------------------------------------


def test_rides_list_newest_first_with_a_state_filter(
    rider: User, area: ServiceArea, ops: Any
) -> None:
    older = new_ride(rider, area)
    engine.rider_cancel(rider=rider, ride_id=older.id, reason="OTHER")
    newer = new_ride(make_user("Second Rider"), area)

    everything = ops.get(f"{OPS}/").json()["results"]
    searching = ops.get(f"{OPS}/?state=SEARCHING").json()["results"]
    both = ops.get(f"{OPS}/?state=searching,cancelled").json()["results"]

    assert [r["id"] for r in everything] == [str(newer.id), str(older.id)]
    assert [r["id"] for r in searching] == [str(newer.id)]
    assert len(both) == 2
    assert everything[0]["rider_name"] == "Second Rider"
    assert everything[0]["captain_name"] is None
    assert ops.get(f"{OPS}/?state=FLYING").status_code == 400


def test_ride_detail_shows_people_history_offers_and_ratings(
    rider: User, area: ServiceArea, ops: Any
) -> None:
    ravi = captain(area, km=1)
    ride = accepted(rider, area, ravi)
    RideRating.objects.create(ride=ride, rater_kind="RIDER", stars=5)

    body = ops.get(f"{OPS}/{ride.id}/").json()

    assert body["rider"] == {"name": "Priya Rider", "phone_number": str(rider.phone_number)}
    assert body["captain"]["phone_number"] == str(ravi.user.phone_number)
    assert body["vehicle"]["registration_number"].startswith("TS09AB")
    assert [(t["from_state"], t["to_state"]) for t in body["transitions"]] == [
        ("", "SEARCHING"),
        ("SEARCHING", "CAPTAIN_ASSIGNED"),
    ]
    assert body["transitions"][1]["actor_name"] == ravi.user.full_name
    assert [(o["captain_id"], o["status"]) for o in body["offers"]] == [(str(ravi.id), "ACCEPTED")]
    assert body["ratings"] == {"RIDER": 5}
    assert ops.get(f"{OPS}/{RideOffer.objects.get().id}/").status_code == 404


def test_only_operations_reads_rides(rider: User, area: ServiceArea) -> None:
    ride = new_ride(rider, area)
    for client in (customer_client(rider), partner_client(captain(area, km=1).user)):
        assert client.get(f"{OPS}/").status_code == 403
        assert client.get(f"{OPS}/{ride.id}/").status_code == 403
        assert client.get(f"{OPS}/captains/").status_code == 403
        assert client.get(f"{OPS}/sos/").status_code == 403


# --- Operations: captains ---------------------------------------------------------------------


def test_captains_list_shows_duty_pass_rides_rating_and_cancels(
    rider: User, area: ServiceArea, ops: Any
) -> None:
    ravi = captain(area, km=1)
    # One cancelled ride, then one completed and rated 4.
    first = accepted(make_user("First Rider"), area, ravi)
    engine.captain_cancel(partner=ravi, ride_id=first.id, reason="OTHER")
    location.record_position(
        partner_id=ravi.id,
        latitude=float(PICKUP[0]),
        longitude=float(PICKUP[1]),
        accuracy_m=10,
        heading=None,
        captured_at=timezone.now().isoformat(),
        listed_in=location.geo_key(area.id, "BIKE"),
    )
    ride = accepted(rider, area, ravi)
    at_pickup(ravi)
    engine.mark_arrived(partner=ravi, ride_id=ride.id)
    engine.start_trip(partner=ravi, ride_id=ride.id, otp=engine.ride_otp(ride.id))
    engine.complete_trip(partner=ravi, ride_id=ride.id)
    RideRating.objects.create(ride=ride, rater_kind="RIDER", stars=4)

    [row] = [
        c for c in ops.get(f"{OPS}/captains/").json()["results"] if c["partner_id"] == str(ravi.id)
    ]

    assert (row["approval"], row["on_duty"], row["rides_completed"], row["cancels"]) == (
        "APPROVED",
        True,
        1,
        1,
    )
    assert row["rating"] == 4.0
    assert row["pass_ends_at"] is not None
    assert row["vehicle"]["vehicle_type"] == "BIKE"


def test_a_new_captain_has_zero_counts_and_no_rating(area: ServiceArea, ops: Any) -> None:
    captain(area, km=1)
    [row] = ops.get(f"{OPS}/captains/").json()["results"]
    assert (row["rides_completed"], row["cancels"], row["rating"]) == (0, 0, None)


# --- Operations: the SOS queue ----------------------------------------------------------------


def raise_sos(rider: User, ride: Ride) -> str:
    response = customer_client(rider).post(f"{RIDES}{ride.id}/sos/", {}, format="json")
    return str(response.json()["sos_id"])


def test_sos_queue_oldest_first_and_resolve(rider: User, area: ServiceArea, ops: Any) -> None:
    older = raise_sos(rider, accepted(rider, area, captain(area, km=1)))
    second_rider = make_user("Second Rider")
    newer = raise_sos(second_rider, accepted(second_rider, area, captain(area, km=1.5)))

    queue = ops.get(f"{OPS}/sos/?status=OPEN").json()["results"]
    assert [row["id"] for row in queue] == [older, newer]
    assert queue[0]["raised_by_kind"] == "rider"
    assert queue[0]["raised_by_name"] == "Priya Rider"

    resolved = ops.post(
        f"{OPS}/sos/{older}/resolve/", {"resolution_note": "Called, all fine"}, format="json"
    )
    again = ops.post(
        f"{OPS}/sos/{older}/resolve/", {"resolution_note": "Second note"}, format="json"
    )

    assert (resolved.json()["status"], resolved.json()["resolved_by_name"]) == (
        "RESOLVED",
        "Ops Person",
    )
    assert again.json()["resolution_note"] == "Called, all fine"  # resolving again changes nothing
    assert [row["id"] for row in ops.get(f"{OPS}/sos/?status=OPEN").json()["results"]] == [newer]


def test_resolving_needs_a_note_and_a_real_sos(rider: User, area: ServiceArea, ops: Any) -> None:
    sos_id = raise_sos(rider, accepted(rider, area, captain(area, km=1)))

    assert ops.post(f"{OPS}/sos/{sos_id}/resolve/", {}, format="json").status_code == 400
    missing = ops.post(
        f"{OPS}/sos/{RideSosEvent.objects.get().ride_id}/resolve/",
        {"resolution_note": "x"},
        format="json",
    )
    assert missing.status_code == 404
    assert ops.get(f"{OPS}/sos/?status=LOST").status_code == 400
    assert error_code(ops.get(f"{OPS}/sos/?status=LOST")) == "validation_error"
