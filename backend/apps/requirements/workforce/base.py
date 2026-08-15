"""The frozen terms a shift-day is read against, and the three guards every command opens with.

The floor of this package: `shift_terms` reads what a day is worth from the engagement's snapshot,
`_locked_stage` and `_assert_workforce_stage` are the two lines every A3 command starts with,
`shift_date_of` answers which day a stage is, and `ensure_attendance` creates the row the rest of
the day writes to. Nothing here knows about crew, settlement or extras — this module imports no
sibling, which is what keeps every dependency arrow in the package pointing at it.
"""

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any

from django.db import transaction

from apps.requirements.exceptions import StageTransitionError
from apps.requirements.models import (
    Engagement,
    EngagementStage,
    ShiftAttendance,
)

# ---------------------------------------------------------------------------
# Reading the shift-day's frozen terms
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ShiftTerms:
    """The published terms this engagement's shift-days are settled against.

    Read from `Engagement.terms_snapshot` and never from the live `RateCard`. The card is
    effective-dated precisely so a rate loaded on Tuesday does not move a booking made on Monday,
    and a settlement that read today's card would undo that on the one screen where it matters
    most — the one showing a lead what they are owed tonight.
    """

    per_worker_paise: int
    headcount: int
    #: `None` on the quote-flow fallback: the vendor was asked for a rate per worker per day and
    #: was never asked what a day is. Not eight — an assumed shift length decides when overtime
    #: starts, and inventing it here would be this platform doing the thing the published rate card
    #: exists to stop somebody doing on site.
    standard_day_hours: int | None
    #: `None` on the quote-flow fallback, where a vendor quoted a day rate and nobody published an
    #: overtime rate. Overtime is refused there rather than invented.
    overtime_hourly_paise: int | None
    add_on_rates: dict[str, int]
    is_rate_card: bool


def shift_terms(engagement: Engagement) -> ShiftTerms:
    """The two A3 shapes, read into one, with the differences kept rather than smoothed over.

    A **rate-card** engagement carries the card's three components, the published day length, the
    overtime rate and the add-on table (`engagements.open_rate_card_engagement`). A **quote-flow**
    engagement carries the vendor's own rate and worker count and nothing else, because a vendor
    quote has no published overtime or add-on rates — so `overtime_hourly_paise` is `None` there
    and `propose_shift_extra` refuses instead of guessing a multiplier.
    """
    if engagement.commercial_mode != Engagement.CommercialMode.LEAD_ONLY:
        raise StageTransitionError("Shift-day attendance is a workforce engagement's own record.")
    terms: dict[str, Any] = engagement.terms_snapshot or {}
    if terms.get("source") == "rate_card":
        headcount = int(terms.get("headcount") or 0)
        per_worker = int(terms.get("worker_day_wage_paise") or 0) + int(
            terms.get("supervision_margin_paise") or 0
        )
        overtime = terms.get("overtime_hourly_paise")
        hours = terms.get("standard_day_hours")
        add_on_rates = terms.get("add_on_rates") or {}
        return ShiftTerms(
            per_worker_paise=per_worker,
            headcount=headcount,
            standard_day_hours=int(hours) if hours else None,
            overtime_hourly_paise=int(overtime) if overtime else None,
            add_on_rates={str(code): int(rate) for code, rate in add_on_rates.items()},
            is_rate_card=True,
        )
    rate = int(terms.get("rate_paise_per_worker_day") or 0)
    workers = int(terms.get("worker_count") or 0)
    if rate <= 0 or workers <= 0:
        raise StageTransitionError(
            "This engagement has no agreed crew size or day rate, so a shift-day cannot be "
            "settled against it.",
        )
    return ShiftTerms(
        per_worker_paise=rate,
        headcount=workers,
        # The quote flow never asked the vendor how long a day is. Eight hours is ADR-0009's
        # product definition of a day and is *not* assumed here: the missing check-out rule needs
        # a published number, so the fallback records the day length as unknown by refusing to
        # invent one, and `M2-BE-527`'s flag carries the reason instead.
        standard_day_hours=None,
        overtime_hourly_paise=None,
        add_on_rates={},
        is_rate_card=False,
    )


def _locked_stage(stage_id: uuid.UUID) -> EngagementStage:
    return (
        EngagementStage.objects.select_for_update(of=("self",))
        .select_related("engagement__requirement__configuration", "engagement__partner")
        .get(pk=stage_id)
    )


def _assert_workforce_stage(stage: EngagementStage) -> Engagement:
    engagement = stage.engagement
    if engagement.status in (
        Engagement.Status.CANCELLED,
        Engagement.Status.CLOSED,
        Engagement.Status.COMPLETED,
    ):
        raise StageTransitionError("This engagement is closed.")
    if engagement.commercial_mode != Engagement.CommercialMode.LEAD_ONLY:
        raise StageTransitionError("Only a workforce shift-day has crew and attendance.")
    if stage.kind != EngagementStage.Kind.WORK:
        raise StageTransitionError("This is not a shift-day.")
    return engagement


def shift_date_of(stage: EngagementStage) -> date:
    """Which day this stage is. Refused rather than derived when nobody said.

    `engagements` stamps `scheduled_on` on every A3 shift-day it lays out, from the date the
    Customer asked for. A stage without one is an engagement opened before that existed or a
    requirement with no requested start, and the honest answer is a refusal: the whole
    cross-agency conflict rule is "this person, on this date", and a date the server picked would
    make the guard check a day nobody is working.
    """
    if stage.scheduled_on is None:
        raise StageTransitionError(
            "This shift-day has no date on it yet, so crew cannot be assigned to it. Support can "
            "set the working dates for this booking.",
        )
    return stage.scheduled_on


@transaction.atomic
def ensure_attendance(*, stage: EngagementStage) -> ShiftAttendance:
    """The shift-day's attendance row, created on first use.

    Created lazily rather than with the engagement, and deliberately: `open_rate_card_engagement`
    runs inside a **payment callback**, and adding four more inserts to the transaction that
    confirms a Customer's money is four more ways for that transaction to fail. Nothing reads an
    attendance row before somebody touches the day.
    """
    existing = ShiftAttendance.objects.filter(stage=stage).first()
    if existing is not None:
        return existing
    engagement = stage.engagement
    terms = shift_terms(engagement)
    unpublished_day = terms.standard_day_hours is None
    return ShiftAttendance.objects.create(
        stage=stage,
        engagement=engagement,
        expected_count=max(terms.headcount, 1),
        standard_day_hours=terms.standard_day_hours,
        flagged_for_review=unpublished_day,
        flag_reason_code="day_length_not_published" if unpublished_day else "",
    )
