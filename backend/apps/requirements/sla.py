"""Business-hours deadline arithmetic for the quote-delivery promise.

A deadline that runs through the night and through Diwali is a deadline vendors lose to a clock
nobody was awake for. This module advances a deadline only across hours a service area is actually
open.

The calendar is **not new**. `locations.ServiceAreaOperatingWindow` (weekday, opens/closes,
`closes_next_day`) and `locations.ServiceAreaOperatingException` (dated, closed or replacement
hours) already drive the A1 slot grid in `carts.services` and the reschedule grid in
`fulfilment.cancellation`. Introducing a second calendar here would let the two disagree about
whether Sunday counts.

Every function is pure over the rows it is handed, so a caller may prefetch once and compute many
deadlines without re-querying.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings

from apps.locations.models import (
    ServiceArea,
    ServiceAreaOperatingException,
    ServiceAreaOperatingWindow,
)

#: How far ahead to look before deciding an area is effectively never open. An area closed for a
#: fortnight is a configuration error, and looping forever would hide it.
MAX_LOOKAHEAD_DAYS = 60


class ServiceAreaNeverOpenError(RuntimeError):
    """The area has no open hours within the lookahead, so no deadline can be computed."""


@dataclass(frozen=True, slots=True)
class OpenPeriod:
    """One continuous stretch of open time, in the area's local timezone."""

    starts_at: datetime
    ends_at: datetime

    @property
    def duration(self) -> timedelta:
        return self.ends_at - self.starts_at


def _local_timezone() -> ZoneInfo:
    return ZoneInfo(settings.TIME_ZONE)


def _combine(day: date, at: time, *, next_day: bool, tz: ZoneInfo) -> datetime:
    moment = datetime.combine(day + timedelta(days=1) if next_day else day, at)
    return moment.replace(tzinfo=tz)


def open_periods_for_day(
    *,
    day: date,
    windows: Iterable[ServiceAreaOperatingWindow],
    exceptions: Iterable[ServiceAreaOperatingException],
    tz: ZoneInfo,
) -> list[OpenPeriod]:
    """Open stretches on one day, with a dated exception overriding the weekly pattern."""
    override = next((e for e in exceptions if e.date == day), None)
    if override is not None:
        if override.is_closed or override.opens_at is None or override.closes_at is None:
            return []
        return [
            OpenPeriod(
                starts_at=_combine(day, override.opens_at, next_day=False, tz=tz),
                ends_at=_combine(day, override.closes_at, next_day=override.closes_next_day, tz=tz),
            )
        ]

    periods = [
        OpenPeriod(
            starts_at=_combine(day, window.opens_at, next_day=False, tz=tz),
            ends_at=_combine(day, window.closes_at, next_day=window.closes_next_day, tz=tz),
        )
        for window in windows
        if window.weekday == day.weekday()
    ]
    return sorted(periods, key=lambda period: period.starts_at)


def add_business_hours(
    *,
    start: datetime,
    hours: int,
    windows: Sequence[ServiceAreaOperatingWindow],
    exceptions: Sequence[ServiceAreaOperatingException],
) -> datetime:
    """Advance `start` by `hours` of open time.

    A start outside open hours does not begin consuming the budget until the area next opens, so a
    requirement submitted at 11pm gets its full promise rather than a head start it never had.
    """
    if hours <= 0:
        raise ValueError("A deadline must consume a positive number of hours.")

    tz = _local_timezone()
    cursor = start.astimezone(tz)
    remaining = timedelta(hours=hours)
    day = cursor.date()

    for _ in range(MAX_LOOKAHEAD_DAYS):
        for period in open_periods_for_day(day=day, windows=windows, exceptions=exceptions, tz=tz):
            if period.ends_at <= cursor:
                continue
            entered_at = max(period.starts_at, cursor)
            available = period.ends_at - entered_at
            if available >= remaining:
                return (entered_at + remaining).astimezone(start.tzinfo)
            remaining -= available
            cursor = period.ends_at
        day += timedelta(days=1)
        cursor = min(cursor, _combine(day, time.min, next_day=False, tz=tz))

    raise ServiceAreaNeverOpenError(
        f"No open hours found within {MAX_LOOKAHEAD_DAYS} days of {start.isoformat()}.",
    )


def quote_deadlines(
    *,
    area: ServiceArea,
    submitted_at: datetime,
    first_quote_sla_hours: int | None,
    quote_delivery_sla_hours: int | None,
) -> tuple[datetime | None, datetime | None]:
    """The two promise deadlines, or `(None, None)` when the owner has set no SLA.

    Returning `None` rather than inventing a default is deliberate: the SLA per category is an open
    decision, and a made-up promise shown to a Customer is worse than an honest absence of one.
    """
    if first_quote_sla_hours is None and quote_delivery_sla_hours is None:
        return None, None

    windows = list(area.operating_windows.all())
    exceptions = list(area.operating_exceptions.all())
    if not windows and not exceptions:
        raise ServiceAreaNeverOpenError(f"{area.slug} has no operating windows configured.")

    first_due = (
        add_business_hours(
            start=submitted_at,
            hours=first_quote_sla_hours,
            windows=windows,
            exceptions=exceptions,
        )
        if first_quote_sla_hours is not None
        else None
    )
    all_due = (
        add_business_hours(
            start=submitted_at,
            hours=quote_delivery_sla_hours,
            windows=windows,
            exceptions=exceptions,
        )
        if quote_delivery_sla_hours is not None
        else None
    )
    return first_due, all_due
