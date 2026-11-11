"""Start OTP (proposal 0030, "Start OTP"): wrong codes are counted once each, never per network
retry; five lock the ride; the idempotency table never holds the code."""

import hashlib
import json
from typing import Any

import pytest
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper

from apps.foundation.models import IdempotencyRecord
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from apps.rides import engine, location
from apps.rides.models import Ride, RideOffer, RideState, RideTransition
from tests.rides.helpers import make_user, partner_client
from tests.rides.ride_world import PICKUP, captain, dispatch, error_code, make_area, new_ride

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("ride_redis")]


@pytest.fixture
def arrived() -> tuple[Ride, PartnerProfile]:
    """A ride whose captain is at the pickup, waiting for the code."""
    area = make_area()
    ravi = captain(area, km=1)
    rider: User = make_user("Priya Rider")
    ride = dispatch(new_ride(rider, area))
    engine.accept_offer(partner=ravi, offer_id=RideOffer.objects.get(ride=ride).id)
    location.record_position(
        partner_id=ravi.id,
        latitude=float(PICKUP[0]),
        longitude=float(PICKUP[1]),
        accuracy_m=10,
        heading=None,
        captured_at=timezone.now().isoformat(),
        listed_in=None,
    )
    engine.mark_arrived(partner=ravi, ride_id=ride.id)
    ride.refresh_from_db()
    return ride, ravi


def wrong_code(ride: Ride) -> str:
    """A code that is not this ride's."""
    right = engine.ride_otp(ride.id)
    return "0000" if right != "0000" else "1111"


def start(partner: PartnerProfile, ride: Ride, otp: str, key: str) -> Any:
    return partner_client(partner.user).post(
        f"/api/v1/partner/rides/{ride.id}/start/",
        {"otp": otp},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


def attempts(ride: Ride) -> int:
    return Ride.objects.get(pk=ride.pk).otp_attempts


def test_a_wrong_code_counts_once_and_is_stored_with_its_refusal(
    arrived: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = arrived

    response = start(ravi, ride, wrong_code(ride), "k-1")

    assert (response.status_code, error_code(response)) == (400, "otp_invalid")
    assert response.json()["error"]["details"] == {"attempts_left": 4}
    assert attempts(ride) == 1
    record = IdempotencyRecord.objects.get(key="k-1")
    assert record.response_body is not None
    assert (record.response_status, record.response_body["error"]["code"]) == (400, "otp_invalid")


def test_a_network_retry_replays_the_refusal_without_counting_again(
    arrived: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = arrived
    code = wrong_code(ride)
    start(ravi, ride, code, "k-1")

    replay = start(ravi, ride, code, "k-1")

    assert (replay.status_code, error_code(replay)) == (400, "otp_invalid")
    assert replay["Idempotent-Replay"] == "true"
    assert attempts(ride) == 1


def test_the_same_key_with_another_code_is_refused_and_not_counted(
    arrived: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = arrived
    start(ravi, ride, wrong_code(ride), "k-1")

    response = start(ravi, ride, engine.ride_otp(ride.id), "k-1")

    assert (response.status_code, error_code(response)) == (409, "idempotency_key_reused")
    assert attempts(ride) == 1
    assert Ride.objects.get(pk=ride.pk).state == RideState.CAPTAIN_ARRIVED


def test_five_wrong_codes_lock_the_ride_even_for_the_right_code(
    arrived: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = arrived
    answers = [start(ravi, ride, wrong_code(ride), f"k-{n}") for n in range(1, 6)]

    assert [a.status_code for a in answers] == [400, 400, 400, 400, 423]
    assert error_code(answers[-1]) == "otp_locked"
    locked = start(ravi, ride, engine.ride_otp(ride.id), "k-6")
    assert (locked.status_code, error_code(locked)) == (423, "otp_locked")
    assert attempts(ride) == 5
    assert Ride.objects.get(pk=ride.pk).state == RideState.CAPTAIN_ARRIVED


def test_the_right_code_starts_the_trip_exactly_once(
    arrived: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = arrived
    code = engine.ride_otp(ride.id)

    first = start(ravi, ride, code, "k-1")
    replay = start(ravi, ride, code, "k-1")

    assert first.json()["state"] == replay.json()["state"] == "IN_TRIP"
    assert RideTransition.objects.filter(ride=ride, to_state="IN_TRIP").count() == 1
    assert attempts(ride) == 0


def test_the_stored_fingerprint_is_an_hmac_not_a_hash_of_the_code(
    arrived: tuple[Ride, PartnerProfile], settings: SettingsWrapper
) -> None:
    ride, ravi = arrived
    code = wrong_code(ride)
    start(ravi, ride, code, "k-1")
    stored = IdempotencyRecord.objects.get(key="k-1").request_fingerprint

    for payload in ({"otp": code}, {"ride_id": str(ride.id), "otp": code}):
        plain = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        assert stored != hashlib.sha256(plain).hexdigest()
    first_mac = engine.otp_fingerprint(ride.id, code)
    settings.RIDES_OTP_SECRET = "a-different-secret"  # noqa: S105 - a test value
    assert engine.otp_fingerprint(ride.id, code) != first_mac


def test_the_code_must_be_four_digits(arrived: tuple[Ride, PartnerProfile]) -> None:
    ride, ravi = arrived
    # Other scripts' digits pass a plain \d and used to break the comparison (a 500).
    for bad in (
        "123",
        "12345",
        "abcd",
        "",
        "\u0661\u0662\u0663\u0664",
        "\u0967\u0968\u0969\u096a",
    ):
        assert start(ravi, ride, bad, f"k-{bad}").status_code == 400
    assert attempts(ride) == 0


def test_a_new_captain_does_not_get_fresh_guesses_at_the_same_code(
    arrived: tuple[Ride, PartnerProfile],
) -> None:
    ride, ravi = arrived
    for n in range(4):
        start(ravi, ride, wrong_code(ride), f"w-{n}")

    engine.captain_cancel(partner=ravi, ride_id=ride.id, reason="VEHICLE_ISSUE")

    # The code is the ride's, so the count stays with the ride for whoever comes next.
    assert attempts(ride) == 4
