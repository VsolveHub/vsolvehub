from collections.abc import Iterator
from typing import Any

import pytest
import redis

# Imported before any test freezes the clock: DRF's throttle keeps `time.time` as a class attribute,
# and if this module were first imported under freezegun it would keep the fake clock for the rest
# of the run (every later throttled request then fails with a TypeError).
import rest_framework.throttling  # noqa: F401
from pytest_django.fixtures import SettingsWrapper

from tests.rides.ride_world import TEST_REDIS


@pytest.fixture(autouse=True)
def _ride_otp_secret(settings: SettingsWrapper) -> None:
    """Every rides test has an OTP secret, as every real server must (there is no default)."""
    settings.RIDES_OTP_SECRET = "test-only-otp-secret"  # noqa: S105 - a test value, not a secret


@pytest.fixture
def ride_redis(settings: SettingsWrapper) -> Iterator[Any]:
    """The local Docker Redis (database 15), empty, with the brief's dispatch numbers."""
    settings.RIDES_REDIS_URL = TEST_REDIS
    settings.RIDES_DISPATCH_RADII_M = [2000, 4000, 6000]
    settings.RIDES_OFFERS_PER_ROUND = 3
    settings.RIDES_OFFER_SECONDS = 15
    r = redis.Redis.from_url(TEST_REDIS, decode_responses=True, socket_connect_timeout=1)
    try:
        r.ping()
    except redis.RedisError:
        pytest.fail("These tests need the local Redis. Start Docker (start-dev.cmd) and retry.")
    r.flushdb()
    yield r
    r.flushdb()
