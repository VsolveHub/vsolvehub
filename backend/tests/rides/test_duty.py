"""Duty on and off, with every gate (brief §5.6, §5.8)."""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from django.utils import timezone
from freezegun import freeze_time

from apps.partners.models import PartnerApplication
from apps.rides.models import (
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    CaptainVehicle,
    FareQuote,
    Ride,
    RideRateCard,
    RideState,
)
from apps.rides.services import expire_passes
from tests.rides.helpers import (
    make_user,
    partner_client,
    ready_captain,
    set_status,
    start_application,
)

pytestmark = pytest.mark.django_db

START = "/api/v1/partner/rides/duty/start/"
STOP = "/api/v1/partner/rides/duty/stop/"
ME = "/api/v1/partner/rides/me/"


def give_pass(user: Any, hours: int = 24) -> CaptainPass:
    now = timezone.now()
    plan, _ = CaptainPassPlan.objects.get_or_create(
        code="launch", defaults={"name": "Launch", "price_paise": 0, "duration_hours": hours}
    )
    return CaptainPass.objects.create(
        partner=user.partner_profile,
        plan=plan,
        status=CaptainPass.Status.ACTIVE,
        starts_at=now,
        ends_at=now + timedelta(hours=hours),
    )


def error(response: Any) -> tuple[int, str, str]:
    body = response.json()["error"]
    return response.status_code, body["code"], body["message"]


# --- going on duty ----------------------------------------------------------------------------


def test_a_ready_captain_goes_on_duty() -> None:
    user, client = ready_captain()
    give_pass(user)

    response = client.post(START)

    assert response.status_code == 200
    assert response.json()["on_duty"] is True
    assert CaptainDutySession.objects.filter(partner__user=user, ended_at__isnull=True).exists()


def test_starting_twice_keeps_one_session() -> None:
    user, client = ready_captain()
    give_pass(user)

    first = client.post(START).json()
    second = client.post(START).json()

    assert first["started_at"] == second["started_at"]
    assert first["server_now"] and second["server_now"]
    assert CaptainDutySession.objects.filter(partner__user=user).count() == 1


def test_no_pass_means_no_duty() -> None:
    assert error(ready_captain()[1].post(START))[:2] == (403, "pass_required")


def test_an_expired_pass_means_no_duty() -> None:
    user, client = ready_captain()
    with freeze_time("2026-11-09 10:00:00"):
        give_pass(user)
    with freeze_time("2026-11-10 10:00:01"):
        assert error(client.post(START))[:2] == (403, "pass_required")


@pytest.mark.parametrize(
    "status", [PartnerApplication.Status.DRAFT, PartnerApplication.Status.SUBMITTED]
)
def test_an_unapproved_captain_cannot_go_on_duty(status: str) -> None:
    user = make_user()
    set_status(start_application(user), status)
    give_pass(user)

    http_status, code, message = error(partner_client(user).post(START))

    assert (http_status, code) == (403, "captain_not_approved")
    assert "approved" in message


def test_a_suspended_captain_cannot_go_on_duty() -> None:
    user, client = ready_captain()
    give_pass(user)
    set_status(
        PartnerApplication.objects.get(partner__user=user), PartnerApplication.Status.SUSPENDED
    )

    status, code, message = error(client.post(START))

    assert (status, code) == (403, "captain_not_approved")
    assert "suspended" in message


def test_a_captain_without_a_vehicle_cannot_go_on_duty() -> None:
    user, client = ready_captain()
    give_pass(user)
    CaptainVehicle.objects.filter(partner__user=user).delete()

    status, code, message = error(client.post(START))

    assert (status, code) == (403, "captain_not_approved")
    assert "vehicle" in message


# --- going off duty ---------------------------------------------------------------------------


def test_stopping_closes_the_session_and_twice_is_harmless() -> None:
    user, client = ready_captain()
    give_pass(user)
    client.post(START)

    stopped = client.post(STOP).json()
    assert (stopped["on_duty"], stopped["started_at"]) == (False, None)
    assert client.post(STOP).status_code == 200
    session = CaptainDutySession.objects.get(partner__user=user)
    assert session.end_reason == CaptainDutySession.EndReason.CAPTAIN_OFF


def open_ride_for(captain_user: Any) -> Ride:
    rider = make_user("Priya")
    card = RideRateCard.objects.create(
        service_area_id=_area().id,
        vehicle_type="BIKE",
        base_fare_paise=2000,
        included_distance_m=1000,
        per_km_paise=800,
        per_minute_paise=100,
        minimum_fare_paise=3000,
        free_waiting_minutes=3,
        waiting_per_minute_paise=100,
    )
    point = {"latitude": Decimal("17.44"), "longitude": Decimal("78.35")}
    quote = FareQuote.objects.create(
        rider=rider,
        service_area=card.service_area,
        vehicle_type="BIKE",
        rate_card=card,
        rate_card_version=1,
        pickup_latitude=point["latitude"],
        pickup_longitude=point["longitude"],
        pickup_label="A",
        drop_latitude=Decimal("17.45"),
        drop_longitude=Decimal("78.38"),
        drop_label="B",
        distance_m=3000,
        duration_s=600,
        route_polyline="x",
        fare_paise=5000,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    return Ride.objects.create(
        rider=rider,
        quote=quote,
        service_area=card.service_area,
        vehicle_type="BIKE",
        pickup_latitude=quote.pickup_latitude,
        pickup_longitude=quote.pickup_longitude,
        pickup_label="A",
        drop_latitude=quote.drop_latitude,
        drop_longitude=quote.drop_longitude,
        drop_label="B",
        fare_paise=5000,
        state=RideState.IN_TRIP,
        captain=captain_user.partner_profile,
    )


def _area() -> Any:
    from apps.locations.models import ServiceArea  # noqa: PLC0415

    return ServiceArea.objects.create(slug="duty-test", name="Duty test", timezone="Asia/Kolkata")


def test_going_off_duty_during_a_ride_leaves_the_ride_alone() -> None:
    user, client = ready_captain()
    give_pass(user)
    client.post(START)
    ride = open_ride_for(user)

    assert client.post(STOP).status_code == 200
    ride.refresh_from_db()
    assert ride.state == RideState.IN_TRIP


def test_a_pass_expiring_mid_ride_keeps_the_captain_on_duty_until_the_ride_ends() -> None:
    user, client = ready_captain()
    with freeze_time("2026-11-09 10:00:00"):
        give_pass(user)
        client.post(START)
        ride = open_ride_for(user)
    with freeze_time("2026-11-10 10:00:01"):
        expire_passes()
        assert CaptainDutySession.objects.get(partner__user=user).ended_at is None

        Ride.objects.filter(id=ride.id).update(
            state=RideState.COMPLETED, final_fare_paise=5000, completed_at=timezone.now()
        )
        expire_passes()
        session = CaptainDutySession.objects.get(partner__user=user)
        assert session.end_reason == CaptainDutySession.EndReason.PASS_EXPIRED


# --- me ---------------------------------------------------------------------------------------


def test_me_shows_the_pass_and_duty() -> None:
    user, client = ready_captain()
    give_pass(user)
    client.post(START)

    body = client.get(ME).json()

    assert body["on_duty"] is True
    assert body["duty_started_at"] is not None
    assert body["active_pass"]["status"] == "ACTIVE"
    assert body["blocked_reasons"] == []


def test_me_explains_a_missing_pass() -> None:
    body = ready_captain()[1].get(ME).json()

    assert body["active_pass"] is None
    assert body["on_duty"] is False
    assert body["blocked_reasons"] == ["pass_required"]


def test_duty_answers_carry_the_server_clock() -> None:
    user, client = ready_captain()
    give_pass(user)

    for body in (client.post(START).json(), client.get("/api/v1/partner/rides/me/").json()):
        server_now = datetime.fromisoformat(body["server_now"])
        assert abs((server_now - timezone.now()).total_seconds()) < 5


def test_me_says_why_the_last_duty_ended_while_off_duty() -> None:
    user, client = ready_captain()
    give_pass(user)
    client.post(START)
    assert client.get("/api/v1/partner/rides/me/").json()["last_duty_end"] is None  # on duty

    client.post(STOP)

    ended = client.get("/api/v1/partner/rides/me/").json()["last_duty_end"]
    assert ended["reason"] == "CAPTAIN_OFF"
    assert ended["ended_at"]
