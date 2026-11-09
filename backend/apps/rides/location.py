"""Live captain positions in Redis (brief §5.6). Redis answers only "who is near?".

PostgreSQL stays the truth for who is on duty (`CaptainDutySession`). Everything here can be lost
and rebuilt from the next pings, so every key is short-lived:

- `rides:geo:{area_id}:{vehicle_type}`: a GEO set of captains who can take a ride now.
- `rides:pos:{partner_id}`: the last position (latitude, longitude, accuracy, heading,
  captured_at), gone 30 s after the last ping. Matching skips a GEO member without one.
- `rides:lastping:{partner_id}`: gone 2 minutes after the last ping; duty ends without it.
- `rides:member:{partner_id}`: which GEO set the captain is in, so they can be taken out.
- `rides:area:{partner_id}`: the captain's service area, re-checked every 10 minutes.

Every Redis failure is raised as `LocationStoreError`, never swallowed: the caller decides
whether to refuse the request or log and carry on.
"""

from collections.abc import Callable
from typing import Any, cast

import redis
from django.conf import settings

__all__ = [
    "AREA_RECHECK_SECONDS",
    "MATCHING_MAX_ACCURACY_M",
    "STALE_AFTER_SECONDS",
    "LocationStoreError",
    "cached_area",
    "forget",
    "geo_key",
    "has_recent_ping",
    "record_position",
    "remember_area",
    "sweep_stale_members",
]

POSITION_TTL_SECONDS = 30
STALE_AFTER_SECONDS = 120
AREA_RECHECK_SECONDS = 600
#: Matching ignores positions less accurate than this (brief §5.6).
MATCHING_MAX_ACCURACY_M = 100
#: Cached in place of an area id when the captain is outside every served area.
NO_AREA = "-"

_clients: dict[str, redis.Redis] = {}


class LocationStoreError(RuntimeError):
    """Redis could not be reached or refused the command."""


def _redis() -> redis.Redis:
    url = cast(str, settings.RIDES_REDIS_URL)
    client = _clients.get(url)
    if client is None:
        client = redis.Redis.from_url(
            url, decode_responses=True, socket_timeout=2, socket_connect_timeout=2
        )
        _clients[url] = client
    return client


def _run[T](action: Callable[[redis.Redis], T]) -> T:
    try:
        return action(_redis())
    except redis.RedisError as exc:
        raise LocationStoreError("The live location store is unavailable.") from exc


def geo_key(area_id: Any, vehicle_type: str) -> str:
    return f"rides:geo:{area_id}:{vehicle_type}"


def _pos(partner_id: Any) -> str:
    return f"rides:pos:{partner_id}"


def _last_ping(partner_id: Any) -> str:
    return f"rides:lastping:{partner_id}"


def _member(partner_id: Any) -> str:
    return f"rides:member:{partner_id}"


def _area(partner_id: Any) -> str:
    return f"rides:area:{partner_id}"


def _get(r: redis.Redis, key: str) -> str | None:
    return cast(str | None, r.get(key))


def record_position(
    *,
    partner_id: Any,
    latitude: float,
    longitude: float,
    accuracy_m: int,
    heading: float | None,
    captured_at: str,
    listed_in: str | None,
) -> None:
    """Store a ping. `listed_in` is the GEO set the captain belongs in now, or None for none."""
    member = str(partner_id)

    def write(r: redis.Redis) -> None:
        previous = _get(r, _member(partner_id))
        pipe = r.pipeline()
        pipe.hset(
            _pos(partner_id),
            mapping={
                "latitude": latitude,
                "longitude": longitude,
                "accuracy_m": accuracy_m,
                "heading": "" if heading is None else heading,
                "captured_at": captured_at,
            },
        )
        pipe.expire(_pos(partner_id), POSITION_TTL_SECONDS)
        pipe.set(_last_ping(partner_id), captured_at, ex=STALE_AFTER_SECONDS)
        if previous and previous != listed_in:
            pipe.zrem(previous, member)
        if listed_in:
            pipe.geoadd(listed_in, (longitude, latitude, member))
            pipe.set(_member(partner_id), listed_in)
        else:
            pipe.delete(_member(partner_id))
        pipe.execute()

    _run(write)


def forget(partner_id: Any) -> None:
    """Take a captain off the map completely (off duty)."""

    def clear(r: redis.Redis) -> None:
        previous = _get(r, _member(partner_id))
        pipe = r.pipeline()
        if previous:
            pipe.zrem(previous, str(partner_id))
        pipe.delete(
            _member(partner_id), _pos(partner_id), _last_ping(partner_id), _area(partner_id)
        )
        pipe.execute()

    _run(clear)


def has_recent_ping(partner_id: Any) -> bool:
    return bool(_run(lambda r: r.exists(_last_ping(partner_id))))


def cached_area(partner_id: Any) -> tuple[bool, str | None]:
    """(known, area_id). Known with None means "outside every served area"."""
    value = _run(lambda r: _get(r, _area(partner_id)))
    if value is None:
        return False, None
    return True, None if value == NO_AREA else value


def remember_area(partner_id: Any, area_id: Any) -> None:
    value = NO_AREA if area_id is None else str(area_id)
    _run(lambda r: r.set(_area(partner_id), value, ex=AREA_RECHECK_SECONDS))


def sweep_stale_members() -> int:
    """Remove GEO members whose position has expired. Returns how many were removed."""

    def sweep(r: redis.Redis) -> int:
        removed = 0
        for key in r.scan_iter(match="rides:geo:*", count=100):
            members = cast(list[str], r.zrange(key, 0, -1))
            if not members:
                continue
            pipe = r.pipeline()
            for member in members:
                pipe.exists(_pos(member))
            alive = cast(list[int], pipe.execute())
            stale = [m for m, ok in zip(members, alive, strict=True) if not ok]
            if stale:
                removed += cast(int, r.zrem(key, *stale))
        return removed

    return _run(sweep)
