"""The two archetype aliases, and the calendar an A3 shift-day is laid out against.

The bottom of this package's dependency arrow: this module imports from the rest of
`apps.requirements` but never from a sibling submodule, so nothing here can close an import cycle.

`shift_dates` lives here rather than beside either of its callers because **both**
engagement-opening paths need it — the quote flow in `opening` (`_a3_stages`) and the rate-card
flow in `rate_card` (`open_rate_card_engagement`) — and it is the single writer for
`EngagementStage.scheduled_on` on the workforce path.
"""

from datetime import date, timedelta

from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.requirements.models import CustomerRequirement

A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK
A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT


def shift_dates(requirement: CustomerRequirement, *, days: int) -> list[date | None]:
    """Which calendar day each A3 shift-day falls on (`M2-BE-521`).

    **This is the writer for `EngagementStage.scheduled_on` on the workforce path**, and it exists
    because the column had a reader and no writer: `workforce.shift_date_of` refuses to assign crew
    to an undated shift-day, and every A3 engagement was opened with `scheduled_on` null — so the
    whole per-stage assignment, conflict and attendance surface was unreachable in every
    environment. Consecutive days from the date the Customer asked for, which is the shape ADR-0009
    describes ("four helpers for two days of shifting") and the only one the preset collects.

    `None` — every entry — when the requirement carries no `requested_start`. Not today's date:
    a server-chosen working day would make the cross-agency conflict guard check a day nobody is
    working, which is a check that reads as passing while protecting nothing. An undated shift-day
    refuses crew assignment with a message Operations can act on instead.
    """
    start = requirement.requested_start
    if start is None:
        return [None] * days
    first = timezone.localtime(start).date()
    return [first + timedelta(days=offset) for offset in range(days)]
