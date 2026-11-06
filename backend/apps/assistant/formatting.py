"""Money and time as a Customer in India reads them. Pure functions; no database access."""

from datetime import datetime
from zoneinfo import ZoneInfo

from django.utils import timezone

_NOON = 12
_LAKH_GROUP = 3


def _indian_grouping(value: int) -> str:
    digits = str(value)
    if len(digits) <= _LAKH_GROUP:
        return digits
    head, tail = digits[:-_LAKH_GROUP], digits[-_LAKH_GROUP:]
    groups: list[str] = []
    while len(head) > 2:  # noqa: PLR2004 - Indian grouping is pairs above the thousands
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ",".join([*groups, tail])


def format_inr(paise: int) -> str:
    """`149900` -> `₹1,499`; `12345050` -> `₹1,23,450.50`."""

    rupees, remainder = divmod(int(paise), 100)
    text = f"₹{_indian_grouping(rupees)}"
    return f"{text}.{remainder:02d}" if remainder else text


def _clock(at: datetime) -> str:
    hour = at.hour % _NOON or _NOON
    return f"{hour}:{at.minute:02d} {'am' if at.hour < _NOON else 'pm'}"


def local(at: datetime, tz_name: str) -> datetime:
    return timezone.localtime(at, ZoneInfo(tz_name))


def format_day(at: datetime, tz_name: str) -> str:
    moment = local(at, tz_name)
    return f"{moment:%a} {moment.day} {moment:%b}"


def format_when(at: datetime, tz_name: str) -> str:
    """`Fri 7 Nov, 6:00 pm`."""

    return f"{format_day(at, tz_name)}, {_clock(local(at, tz_name))}"


def format_window(starts_at: datetime, ends_at: datetime, tz_name: str) -> str:
    """`Fri 7 Nov, 6:00 pm to 7:00 pm`: an arrival window, not a promise of a minute."""

    return f"{format_when(starts_at, tz_name)} to {_clock(local(ends_at, tz_name))}"
