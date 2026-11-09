"""Live location (brief §5.6): ping checks, the "who is near" map, ride track, stale sweeper.

These use the local Docker Redis, database 15, emptied around every test.
"""

import uuid
from collections.abc import Callable, Iterator
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
import redis
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper

from apps.identity.models import User
from apps.locations.geocoding import GeocodedAddress, GeocodingError
from apps.locations.models import PostalCode, ServiceArea, ServiceAreaPostalCode
from apps.partners.models import PartnerApplication
from apps.rides import services
from apps.rides.models import (
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    FareQuote,
    Ride,
    RideRateCard,
    RideState,
    RideTrackPoint,
)
from apps.rides.services import expire_passes, sweep_stale_captains
from tests.rides.helpers import make_user, ready_captain, set_status

pytestmark = pytest.mark.django_db

URL = "/api/v1/partner/rides/location/"
TEST_REDIS = "redis://127.0.0.1:56379/15"
PIN = "500032"


@pytest.fixture(autouse=True)
def live_redis(settings: SettingsWrapper) -> Iterator[Any]:
    settings.RIDES_REDIS_URL = TEST_REDIS
    r = redis.Redis.from_url(TEST_REDIS, decode_responses=True, socket_connect_timeout=1)
    try:
        r.ping()
    except redis.RedisError:
        pytest.fail("These tests need the local Redis. Start Docker (start-dev.cmd) and retry.")
    r.flushdb()
    yield r
    r.flushdb()


@pytest.fixture
def area() -> ServiceArea:
    area = ServiceArea.objects.create(
        slug=f"area-{uuid.uuid4().hex[:6]}", name="Gachibowli", timezone="Asia/Kolkata"
    )
    pin, _ = PostalCode.objects.get_or_create(
        code=PIN, defaults={"city": "Hyderabad", "state": "Telangana"}
    )
    ServiceAreaPostalCode.objects.create(service_area=area, postal_code=pin)
    return area


@pytest.fixture
def geocoder(monkeypatch: pytest.MonkeyPatch) -> Callable[[str], list[int]]:
    """Point the pincode lookup at a fixed pincode; returns a call counter."""
    calls: list[int] = []

    def use(postal_code: str) -> list[int]:
        def reverse(*, latitude: Decimal, longitude: Decimal) -> GeocodedAddress:
            calls.append(1)
            return GeocodedAddress(
                formatted_address="x",
                line1="",
                locality="",
                city="Hyderabad",
                state="Telangana",
                postal_code=postal_code,
                country_code="IN",
                latitude=latitude,
                longitude=longitude,
                provider="test",
            )

        monkeypatch.setattr(services, "reverse_geocode", reverse)
        return calls

    return use


def on_duty_captain() -> tuple[User, Any]:
    user, client = ready_captain()
    now = timezone.now()
    plan, _ = CaptainPassPlan.objects.get_or_create(
        code="launch", defaults={"name": "Launch", "price_paise": 0, "duration_hours": 24}
    )
    CaptainPass.objects.create(
        partner=user.partner_profile,
        plan=plan,
        status=CaptainPass.Status.ACTIVE,
        starts_at=now,
        ends_at=now + timedelta(hours=24),
    )
    assert client.post("/api/v1/partner/rides/duty/start/").status_code == 200
    return user, client


def ping(client: Any, **overrides: Any) -> Any:
    body: dict[str, Any] = {
        "latitude": 17.4401234567,
        "longitude": 78.3489,
        "accuracy_m": 8.4,
        "heading": 90,
        "captured_at": timezone.now().isoformat(),
    }
    body.update(overrides)
    return client.post(URL, body, format="json")


def geo_members(r: Any, area: ServiceArea, vehicle: str = "BIKE") -> list[str]:
    return list(r.zrange(f"rides:geo:{area.id}:{vehicle}", 0, -1))


def error_code(response: Any) -> str:
    return str(response.json()["error"]["code"])


# --- a good ping ------------------------------------------------------------------------------


def test_an_eligible_captain_is_put_on_the_map(
    live_redis: Any, area: ServiceArea, geocoder: Callable[[str], list[int]]
) -> None:
    geocoder(PIN)
    user, client = on_duty_captain()
    partner_id = str(user.partner_profile.id)

    assert ping(client).status_code == 204

    assert geo_members(live_redis, area) == [partner_id]
    position = live_redis.hgetall(f"rides:pos:{partner_id}")
    assert position["latitude"] == "17.440123"
    assert position["accuracy_m"] == "8"
    assert 0 < live_redis.ttl(f"rides:pos:{partner_id}") <= 30
    assert live_redis.exists(f"rides:lastping:{partner_id}")


def test_the_area_is_looked_up_once_not_on_every_ping(
    area: ServiceArea, geocoder: Callable[[str], list[int]]
) -> None:
    del area
    calls = geocoder(PIN)
    _, client = on_duty_captain()

    ping(client)
    ping(client)
    ping(client)

    assert len(calls) == 1


def test_a_captain_outside_every_area_is_not_listed_but_their_position_is_kept(
    live_redis: Any, area: ServiceArea, geocoder: Callable[[str], list[int]]
) -> None:
    geocoder("560001")
    user, client = on_duty_captain()

    assert ping(client).status_code == 204

    assert geo_members(live_redis, area) == []
    assert live_redis.exists(f"rides:pos:{user.partner_profile.id}")


def test_a_geocoder_failure_lists_nobody_and_tries_again_next_ping(
    live_redis: Any, area: ServiceArea, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken(**_: Any) -> GeocodedAddress:
        raise GeocodingError("down")

    monkeypatch.setattr(services, "reverse_geocode", broken)
    user, client = on_duty_captain()

    assert ping(client).status_code == 204
    assert geo_members(live_redis, area) == []
    assert not live_redis.exists(f"rides:area:{user.partner_profile.id}")


def test_a_captain_suspended_mid_duty_drops_off_the_map(
    live_redis: Any, area: ServiceArea, geocoder: Callable[[str], list[int]]
) -> None:
    geocoder(PIN)
    user, client = on_duty_captain()
    ping(client)
    set_status(
        PartnerApplication.objects.get(partner__user=user), PartnerApplication.Status.SUSPENDED
    )

    ping(client)

    assert geo_members(live_redis, area) == []


# --- refused pings ----------------------------------------------------------------------------


def test_a_captain_off_duty_is_told_so() -> None:
    _, client = ready_captain()
    response = ping(client)
    assert (response.status_code, error_code(response)) == (409, "not_on_duty")


@pytest.mark.parametrize(("offset_s", "expected"), [(-31, 422), (6, 422), (-29, 204), (4, 204)])
def test_ping_age_limits(
    area: ServiceArea, geocoder: Callable[[str], list[int]], offset_s: int, expected: int
) -> None:
    del area
    geocoder(PIN)
    _, client = on_duty_captain()
    captured = timezone.now() + timedelta(seconds=offset_s)

    response = ping(client, captured_at=captured.isoformat())

    assert response.status_code == expected
    if expected == 422:
        assert error_code(response) == "location_stale"


@pytest.mark.parametrize(
    "bad",
    [
        {"latitude": 91},
        {"longitude": -181},
        {"accuracy_m": 0},
        {"accuracy_m": -3},
        {"heading": 361},
        {"captured_at": "yesterday"},
    ],
)
def test_impossible_values_are_rejected(bad: dict[str, Any]) -> None:
    _, client = on_duty_captain()
    assert ping(client, **bad).status_code == 400


def test_customers_cannot_send_pings() -> None:
    from tests.rides.helpers import customer_client  # noqa: PLC0415

    assert ping(customer_client(make_user("A Customer"))).status_code == 403


def test_redis_down_is_a_clear_503(
    settings: SettingsWrapper, area: ServiceArea, geocoder: Callable[[str], list[int]]
) -> None:
    del area
    geocoder(PIN)
    _, client = on_duty_captain()
    settings.RIDES_REDIS_URL = "redis://127.0.0.1:1/0"

    response = ping(client)

    assert (response.status_code, error_code(response)) == (503, "location_unavailable")


# --- during a ride ----------------------------------------------------------------------------


def give_ride(user: User, area: ServiceArea, state: str = RideState.CAPTAIN_ASSIGNED) -> Ride:
    rider = make_user("Priya")
    card = RideRateCard.objects.create(
        service_area=area,
        vehicle_type="BIKE",
        base_fare_paise=2000,
        included_distance_m=1000,
        per_km_paise=800,
        per_minute_paise=100,
        minimum_fare_paise=3000,
        free_waiting_minutes=3,
        waiting_per_minute_paise=100,
    )
    quote = FareQuote.objects.create(
        rider=rider,
        service_area=area,
        vehicle_type="BIKE",
        rate_card=card,
        rate_card_version=1,
        pickup_latitude=Decimal("17.44"),
        pickup_longitude=Decimal("78.35"),
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
        service_area=area,
        vehicle_type="BIKE",
        pickup_latitude=quote.pickup_latitude,
        pickup_longitude=quote.pickup_longitude,
        pickup_label="A",
        drop_latitude=quote.drop_latitude,
        drop_longitude=quote.drop_longitude,
        drop_label="B",
        fare_paise=5000,
        state=state,
        captain=user.partner_profile,
    )


def test_on_a_ride_the_ping_feeds_the_track_and_leaves_the_map(
    live_redis: Any, area: ServiceArea, geocoder: Callable[[str], list[int]]
) -> None:
    geocoder(PIN)
    user, client = on_duty_captain()
    ping(client)
    ride = give_ride(user, area)

    assert ping(client).status_code == 204

    assert geo_members(live_redis, area) == []
    point = RideTrackPoint.objects.get(ride=ride)
    assert point.latitude == Decimal("17.440123")
    assert point.accuracy_m == 8


# --- leaving the map --------------------------------------------------------------------------


def test_going_off_duty_clears_the_map(
    live_redis: Any,
    area: ServiceArea,
    geocoder: Callable[[str], list[int]],
    django_capture_on_commit_callbacks: Any,
) -> None:
    geocoder(PIN)
    user, client = on_duty_captain()
    ping(client)

    with django_capture_on_commit_callbacks(execute=True):
        client.post("/api/v1/partner/rides/duty/stop/")

    assert geo_members(live_redis, area) == []
    assert not live_redis.exists(f"rides:pos:{user.partner_profile.id}")


def test_an_expired_pass_clears_the_map(
    live_redis: Any,
    area: ServiceArea,
    geocoder: Callable[[str], list[int]],
    django_capture_on_commit_callbacks: Any,
) -> None:
    geocoder(PIN)
    user, client = on_duty_captain()
    ping(client)
    CaptainPass.objects.filter(partner__user=user).update(ends_at=timezone.now())

    with django_capture_on_commit_callbacks(execute=True):
        expire_passes()

    assert geo_members(live_redis, area) == []


def test_the_sweeper_ends_duty_after_two_silent_minutes(
    live_redis: Any,
    area: ServiceArea,
    geocoder: Callable[[str], list[int]],
    django_capture_on_commit_callbacks: Any,
) -> None:
    geocoder(PIN)
    user, client = on_duty_captain()
    ping(client)
    partner_id = user.partner_profile.id
    # Two minutes of silence: the ping record has expired.
    live_redis.delete(f"rides:lastping:{partner_id}")
    CaptainDutySession.objects.update(started_at=timezone.now() - timedelta(minutes=3))

    with django_capture_on_commit_callbacks(execute=True):
        assert sweep_stale_captains() == 1

    session = CaptainDutySession.objects.get(partner__user=user)
    assert session.end_reason == CaptainDutySession.EndReason.LOCATION_STALE
    assert geo_members(live_redis, area) == []


def test_the_sweeper_keeps_a_captain_who_is_pinging(
    area: ServiceArea, geocoder: Callable[[str], list[int]]
) -> None:
    del area
    geocoder(PIN)
    _, client = on_duty_captain()
    ping(client)
    CaptainDutySession.objects.update(started_at=timezone.now() - timedelta(minutes=3))

    assert sweep_stale_captains() == 0
    assert CaptainDutySession.objects.get().ended_at is None


def test_the_sweeper_gives_a_new_session_two_minutes_before_judging(
    area: ServiceArea, geocoder: Callable[[str], list[int]]
) -> None:
    del area
    geocoder(PIN)
    on_duty_captain()  # on duty, has not pinged yet

    assert sweep_stale_captains() == 0


def test_the_sweeper_drops_map_members_whose_position_expired(
    live_redis: Any, area: ServiceArea, geocoder: Callable[[str], list[int]]
) -> None:
    geocoder(PIN)
    user, client = on_duty_captain()
    ping(client)
    live_redis.delete(f"rides:pos:{user.partner_profile.id}")

    sweep_stale_captains()

    assert geo_members(live_redis, area) == []


def test_redis_down_never_takes_anyone_off_duty(settings: SettingsWrapper) -> None:
    on_duty_captain()
    CaptainDutySession.objects.update(started_at=timezone.now() - timedelta(minutes=3))
    settings.RIDES_REDIS_URL = "redis://127.0.0.1:1/0"

    assert sweep_stale_captains() == 0
    assert CaptainDutySession.objects.get().ended_at is None
