"""When a rental can be collected and returned, and what the time span costs.

A rental partner sets one schedule for all their items: open days, opening
hours, how much notice a customer must give, and how far ahead a pickup can be
booked. Pickup and return must both fall inside those hours.

Price is per started 24 hours with one hour's grace, so 10:00 to 10:45 the next
day is one day and 10:00 to 14:00 the next day is two.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone

from apps.rental.models import RentalPickupHours

#: A late return within this window is not charged another day.
RETURN_GRACE = timedelta(hours=1)
DAY = timedelta(hours=24)
#: Pickup and return slots the customer chooses from.
SLOT_MINUTES = 30
NOTICE_CHOICES_MINUTES = (0, 60, 120, 240, 720, 1440, 2880)
MAX_ADVANCE_CHOICES_DAYS = (7, 14, 30, 60, 90, 180)
DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


class PickupWindowError(ValueError):
    def __init__(self, message: str, *, code: str = "pickup_window_invalid") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class HoursInput:
    open_days: list[int]
    opens_at: time
    closes_at: time
    min_notice_minutes: int
    max_advance_days: int


def rental_days(pickup_at: datetime, return_at: datetime) -> int:
    """Started 24-hour periods, after the grace hour. Never less than one."""
    span = return_at - pickup_at
    billable = max(span - RETURN_GRACE, timedelta(0))
    return max(1, math.ceil(billable / DAY))


def _clock(value: time) -> str:
    return value.strftime("%I:%M %p").lstrip("0")


def _local(value: datetime) -> datetime:
    return timezone.localtime(value) if timezone.is_aware(value) else value


def at_local(day: date, clock: time) -> datetime:
    return timezone.make_aware(datetime.combine(day, clock))


def check_open(hours: RentalPickupHours, when: datetime, *, what: str) -> None:
    local = _local(when)
    if local.weekday() not in set(hours.open_days or []):
        raise PickupWindowError(
            f"The owner is closed on {DAY_NAMES[local.weekday()]}. Choose another {what} day.",
            code="pickup_day_closed",
        )
    if not (hours.opens_at <= local.time() <= hours.closes_at):
        raise PickupWindowError(
            f"Choose a {what} time between {_clock(hours.opens_at)} and {_clock(hours.closes_at)}.",
            code="pickup_time_closed",
        )


def check_booking_window(
    hours: RentalPickupHours,
    pickup_at: datetime,
    return_at: datetime,
    *,
    now: datetime | None = None,
) -> None:
    """Refuse a pickup/return the owner cannot honour. Raises ``PickupWindowError``."""
    now = now or timezone.now()
    if return_at <= pickup_at:
        raise PickupWindowError(
            "Return time must be after pickup time.", code="return_before_pickup"
        )
    if pickup_at < now:
        raise PickupWindowError("Pickup time has already passed.", code="pickup_in_past")
    notice = timedelta(minutes=hours.min_notice_minutes)
    if pickup_at < now + notice:
        raise PickupWindowError(
            f"This owner needs at least {notice_label(hours.min_notice_minutes)} notice. "
            "Choose a later pickup time.",
            code="pickup_notice_too_short",
        )
    last_day = timezone.localdate(now) + timedelta(days=hours.max_advance_days)
    if _local(pickup_at).date() > last_day:
        raise PickupWindowError(
            f"Pickups can be booked up to {hours.max_advance_days} days ahead.",
            code="pickup_too_far",
        )
    check_open(hours, pickup_at, what="pickup")
    check_open(hours, return_at, what="return")


def notice_label(minutes: int) -> str:
    if minutes <= 0:
        return "no"
    if minutes % 1440 == 0:
        days = minutes // 1440
        return f"{days} day" if days == 1 else f"{days} days"
    if minutes % 60 == 0:
        h = minutes // 60
        return f"{h} hour" if h == 1 else f"{h} hours"
    return f"{minutes} minutes"


def validate_hours(data: HoursInput) -> HoursInput:
    days = sorted({int(d) for d in data.open_days})
    if not days or any(d < 0 or d > 6 for d in days):  # noqa: PLR2004
        raise PickupWindowError("Choose at least one open day.", code="hours_no_days")
    if data.closes_at <= data.opens_at:
        raise PickupWindowError("Closing time must be after opening time.", code="hours_order")
    if data.min_notice_minutes not in NOTICE_CHOICES_MINUTES:
        raise PickupWindowError("Choose a notice period from the list.", code="hours_notice")
    if data.max_advance_days not in MAX_ADVANCE_CHOICES_DAYS:
        raise PickupWindowError("Choose how far ahead from the list.", code="hours_advance")
    return HoursInput(
        open_days=days,
        opens_at=data.opens_at.replace(second=0, microsecond=0),
        closes_at=data.closes_at.replace(second=0, microsecond=0),
        min_notice_minutes=data.min_notice_minutes,
        max_advance_days=data.max_advance_days,
    )


def save_hours(*, partner: Any, data: HoursInput) -> RentalPickupHours:
    clean = validate_hours(data)
    row, _ = RentalPickupHours.objects.update_or_create(
        partner=partner,
        defaults={
            "open_days": clean.open_days,
            "opens_at": clean.opens_at,
            "closes_at": clean.closes_at,
            "min_notice_minutes": clean.min_notice_minutes,
            "max_advance_days": clean.max_advance_days,
        },
    )
    return row


def hours_payload(hours: RentalPickupHours) -> dict[str, Any]:
    """What the booking screen needs to draw the slots, and what the owner edits."""
    return {
        "open_days": sorted(int(d) for d in hours.open_days or []),
        "opens_at": hours.opens_at.strftime("%H:%M"),
        "closes_at": hours.closes_at.strftime("%H:%M"),
        "min_notice_minutes": hours.min_notice_minutes,
        "max_advance_days": hours.max_advance_days,
        "slot_minutes": SLOT_MINUTES,
        "summary": hours_summary(hours),
    }


def hours_summary(hours: RentalPickupHours) -> str:
    """ "Mon-Sat, 9:00 AM - 8:00 PM" — for the item page and the owner's card."""
    days = sorted(int(d) for d in hours.open_days or [])
    if days == list(range(7)):
        day_text = "Every day"
    elif days and days == list(range(days[0], days[-1] + 1)):
        day_text = f"{DAY_NAMES[days[0]]}-{DAY_NAMES[days[-1]]}"
    else:
        day_text = ", ".join(DAY_NAMES[d] for d in days) or "Closed"
    return f"{day_text}, {_clock(hours.opens_at)} - {_clock(hours.closes_at)}"
