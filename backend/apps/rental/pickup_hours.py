"""When an owner is open for rental pickups and returns.

An owner sets one schedule for all their items: which weekdays they are open, and the hours for
each day (Sat 9 AM-9 PM, Sun 9 AM-6 PM, ...). There are no time slots. The customer chooses dates,
and comes any time inside that day's hours.

No row for a weekday means closed that day. An owner with no rows has not set hours yet, which is
not the same as closed every day: their items stay bookable, the page says the hours are not set,
and a new item cannot be published until they are.

On top of the weekly hours an owner can close single dates — a holiday, a wedding in the family.
No pickup or return is booked on one, whatever the weekday's hours say. Only pickup and return
days matter: an item can be out with the customer across a closed date.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.rental.models import RentalPickupClosedDate, RentalPickupDay

DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
FULL_DAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
#: The hours the form starts with, for the owner to adjust.
DEFAULT_OPENS_AT = time(9, 0)
DEFAULT_CLOSES_AT = time(21, 0)
STEP_MINUTES = 30
#: A year of holidays is more than anyone sets; the cap keeps one request from writing thousands.
MAX_CLOSED_DATES = 366


class PickupHoursError(ValueError):
    def __init__(self, message: str, *, code: str = "pickup_hours_invalid") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class DayHours:
    weekday: int
    opens_at: time
    closes_at: time


def clock(value: time) -> str:
    """ "9 AM", "6:30 PM"."""
    text = value.strftime("%I:%M %p").lstrip("0")
    return text.replace(":00 ", " ")


def _on_step(value: time) -> bool:
    return value.second == 0 and value.microsecond == 0 and value.minute % STEP_MINUTES == 0


def validate_days(days: list[DayHours]) -> list[DayHours]:
    if not days:
        raise PickupHoursError("Open at least one day.", code="pickup_hours_no_days")
    seen: set[int] = set()
    for day in days:
        if day.weekday < 0 or day.weekday > 6:  # noqa: PLR2004
            raise PickupHoursError("Choose a day from Monday to Sunday.", code="pickup_hours_day")
        if day.weekday in seen:
            raise PickupHoursError(
                f"{FULL_DAY_NAMES[day.weekday]} is listed twice.", code="pickup_hours_duplicate"
            )
        seen.add(day.weekday)
        if not (_on_step(day.opens_at) and _on_step(day.closes_at)):
            raise PickupHoursError(
                "Choose times on the hour or half hour.", code="pickup_hours_step"
            )
        if day.closes_at <= day.opens_at:
            raise PickupHoursError(
                f"On {FULL_DAY_NAMES[day.weekday]}, closing time must be after opening time.",
                code="pickup_hours_order",
            )
    return sorted(days, key=lambda d: d.weekday)


@transaction.atomic
def save_pickup_hours(
    *,
    partner: Any,
    days: list[DayHours],
    closed_dates: list[date] | None = None,
) -> list[RentalPickupDay]:
    """Replace the owner's whole schedule. Days left out are closed.

    ``closed_dates`` replaces the list of closed dates when given. ``None`` leaves it as it is, so
    a client that only edits the weekly hours cannot wipe the owner's holidays.
    """
    clean = validate_days(days)
    if closed_dates is not None:
        _replace_closed_dates(partner=partner, closed_dates=closed_dates)
    RentalPickupDay.objects.filter(partner=partner).delete()
    return [
        RentalPickupDay.objects.create(
            partner=partner, weekday=d.weekday, opens_at=d.opens_at, closes_at=d.closes_at
        )
        for d in clean
    ]


def _replace_closed_dates(*, partner: Any, closed_dates: list[date]) -> None:
    # Dates already past are dropped rather than refused: they can no longer stop a booking, and a
    # form opened yesterday that still lists yesterday's holiday should save, not fail.
    today = timezone.localdate()
    upcoming = sorted({day for day in closed_dates if day >= today})
    if len(upcoming) > MAX_CLOSED_DATES:
        raise PickupHoursError(
            f"Close at most {MAX_CLOSED_DATES} dates.", code="pickup_closed_dates_too_many"
        )
    RentalPickupClosedDate.objects.filter(partner=partner).delete()
    RentalPickupClosedDate.objects.bulk_create(
        RentalPickupClosedDate(partner=partner, date=day) for day in upcoming
    )


def _rows(partner_id: Any) -> list[RentalPickupDay]:
    return list(RentalPickupDay.objects.filter(partner_id=partner_id).order_by("weekday"))


def hours_are_set(partner_id: Any) -> bool:
    return RentalPickupDay.objects.filter(partner_id=partner_id).exists()


def _closed_day_error(day: date, rows: list[RentalPickupDay], *, what: str, code: str) -> None:
    open_days = ", ".join(DAY_NAMES[r.weekday] for r in rows)
    raise PickupHoursError(
        f"The owner is closed on {FULL_DAY_NAMES[day.weekday()]}s. "
        f"Choose a {what} day they are open: {open_days}.",
        code=code,
    )


def _closed_date_error(day: date, *, what: str, code: str) -> None:
    raise PickupHoursError(
        f"The owner is closed on {day.strftime('%a %d %b')}. Choose another {what} day.",
        code=code,
    )


def check_open_days(*, partner_id: Any, start_date: date, end_date: date) -> None:
    """Refuse a pickup or return date the owner is closed on — a closed date or a closed weekday.

    An owner who has not set hours is not checked against weekdays: their items stay bookable
    (R-11). A closed date is always honoured.
    """
    closed = set(
        RentalPickupClosedDate.objects.filter(
            partner_id=partner_id, date__in=(start_date, end_date)
        ).values_list("date", flat=True)
    )
    if start_date in closed:
        _closed_date_error(start_date, what="pickup", code="pickup_date_closed")
    if end_date in closed:
        _closed_date_error(end_date, what="return", code="return_date_closed")
    rows = _rows(partner_id)
    if not rows:
        return
    open_weekdays = {r.weekday for r in rows}
    if start_date.weekday() not in open_weekdays:
        _closed_day_error(start_date, rows, what="pickup", code="pickup_day_closed")
    if end_date.weekday() not in open_weekdays:
        _closed_day_error(end_date, rows, what="return", code="return_day_closed")


def summary(rows: list[RentalPickupDay]) -> str:
    """ "Mon-Sat 9 AM-9 PM · Sun 9 AM-6 PM". Consecutive days with equal hours are grouped."""
    groups: list[tuple[int, int, time, time]] = []
    for row in rows:
        last = groups[-1] if groups else None
        if (
            last is not None
            and last[1] == row.weekday - 1
            and (last[2], last[3]) == (row.opens_at, row.closes_at)
        ):
            groups[-1] = (last[0], row.weekday, last[2], last[3])
        else:
            groups.append((row.weekday, row.weekday, row.opens_at, row.closes_at))
    parts = []
    for first, last_day, opens, closes in groups:
        days = (
            DAY_NAMES[first] if first == last_day else f"{DAY_NAMES[first]}-{DAY_NAMES[last_day]}"
        )
        parts.append(f"{days} {clock(opens)}-{clock(closes)}")
    return " · ".join(parts)


def pickup_hours_payload(partner_id: Any) -> dict[str, Any]:
    """Seven rows, Monday first, and the upcoming closed dates, for the item page and the form."""
    return payload_from_rows(
        _rows(partner_id),
        list(RentalPickupClosedDate.objects.filter(partner_id=partner_id)),
    )


def payload_from_rows(
    rows: list[RentalPickupDay],
    closed: list[RentalPickupClosedDate] | None = None,
) -> dict[str, Any]:
    """Same as ``pickup_hours_payload`` from rows already loaded (a prefetch)."""
    rows = sorted(rows, key=lambda r: r.weekday)
    today = timezone.localdate()
    closed_dates = sorted(c.date for c in closed or [] if c.date >= today)
    by_day = {r.weekday: r for r in rows}
    days = []
    for weekday in range(7):
        row = by_day.get(weekday)
        days.append(
            {
                "weekday": weekday,
                "day_name": FULL_DAY_NAMES[weekday],
                "is_open": row is not None,
                "opens_at": row.opens_at.strftime("%H:%M") if row else None,
                "closes_at": row.closes_at.strftime("%H:%M") if row else None,
            }
        )
    return {
        "is_set": bool(rows),
        "days": days,
        "summary": summary(rows),
        "closed_dates": [day.isoformat() for day in closed_dates],
    }
