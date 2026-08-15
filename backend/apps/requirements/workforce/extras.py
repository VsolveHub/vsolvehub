"""Overtime and add-ons: what a vendor may ask for on top of the day, priced by the server.

The whole slice is one refusal to let a vendor name money. The caller says *what* and *how much of
it*; the rate comes off the card frozen on the engagement, the authorisation goes through the M1
amendment engine, and an extra that has no published rate is refused rather than invented. The one
policy that only lives here is the retroactive overtime window — how long after a shift ends the
Customer may still approve work already done.

The boundary: an accepted amendment reaches the money by `settlement._stage_extras_paise` reading
the applied rows. Nothing in this module touches `DaySettlement` itself.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final

from django.db import transaction
from django.utils import timezone

from apps.identity.models import User
from apps.requirements import rate_cards
from apps.requirements.exceptions import (
    AmendmentRequiredError,
    StageTransitionError,
)
from apps.requirements.models import (
    Engagement,
    EngagementAmendment,
    ShiftAttendance,
)

from .base import _assert_workforce_stage, _locked_stage, ensure_attendance, shift_terms

#: What the two extras are called on the wire and in the amendment line snapshot (`M2-BE-531`,
#: `538`). Both are priced by the server from the card frozen on the engagement, never by the
#: caller — that is the entire point of a published rate.
EXTRA_OVERTIME: Final = "OVERTIME"
EXTRA_ADD_ON: Final = "ADD_ON"
EXTRA_KINDS: Final = (EXTRA_OVERTIME, EXTRA_ADD_ON)


# ---------------------------------------------------------------------------
# Extras: overtime and add-ons, through the M1 amendment engine (`531`, `538`)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ShiftExtra:
    """One extra a vendor is asking for, before the server has priced it.

    `hours` for overtime, `add_on_code` and `worker_days` for an add-on. The vendor names *what*
    and *how much of it*; the server names the money, every time, from the card frozen on the
    engagement. A vendor who could name the money could re-price a job the Customer has already
    booked at a published rate, which is the failure ADR-0009 exists to close.
    """

    kind: str
    hours: int = 0
    add_on_code: str = ""
    worker_days: int = 0


def _assert_overtime_is_timely(
    *,
    engagement: Engagement,
    attendance: ShiftAttendance,
    now: datetime,
) -> datetime | None:
    """Overtime worked before approval is unpaid unless it is confirmed inside the window.

    Returns the moment the Customer's approval must land by, or `None` for a request made while
    the shift is still running — which needs no window, because nothing has been worked
    unapproved yet.

    The window is applied to the **acceptance**, not to the request: `propose_shift_extra` passes
    the deadline through to the amendment, so a retroactive overtime request the Customer does not
    answer in time expires, and expired means unpaid. Applying it to the request instead would
    let a vendor file at the last second and leave the Customer with an open claim.
    """
    end = attendance.shift_ended_at
    if (
        end is None
        and attendance.arrival_confirmed_at is not None
        and attendance.standard_day_hours is not None
    ):
        end = attendance.arrival_confirmed_at + timedelta(hours=attendance.standard_day_hours)
    if end is None or now <= end:
        return None
    window = rate_cards.overtime_retroactive_window_minutes(engagement.requirement)
    deadline = end + timedelta(minutes=window)
    if now > deadline:
        raise AmendmentRequiredError(
            "This shift ended too long ago for overtime to be approved. Unapproved overtime is "
            "not charged.",
        )
    return deadline


@transaction.atomic
def propose_shift_extra(
    *,
    stage_id: uuid.UUID,
    actor: User,
    extra: ShiftExtra,
    reason: str,
) -> EngagementAmendment:
    """Ask the Customer to approve overtime or an add-on, **at the card's published rate**.

    This is a caller into `apps.requirements.amendments`, which is a caller into the M1 engine.
    There is one amendment subsystem in this codebase and this is not a second one: the line kind,
    the status machine, the expiry and the acceptance are all `fulfilment.ScopeAmendment`'s, and
    what this function contributes is the *price*, read from the frozen card.

    Refused, never guessed, when the card published no rate for it: a quote-flow engagement has no
    published overtime rate at all, and an add-on code that is not on the card is not a published
    add-on. "Extra, bhaiya" with a number the vendor chose is exactly what the published rate card
    exists to leave nowhere to live.
    """
    from apps.requirements import amendments  # noqa: PLC0415 — circular at module scope

    if extra.kind not in EXTRA_KINDS:
        raise StageTransitionError("That is not an extra this booking can carry.")
    stage = _locked_stage(stage_id)
    engagement = _assert_workforce_stage(stage)
    attendance = ensure_attendance(stage=stage)
    terms = shift_terms(engagement)
    now = timezone.now()

    if extra.kind == EXTRA_OVERTIME:
        if terms.overtime_hourly_paise is None:
            raise AmendmentRequiredError(
                "This booking has no published overtime rate, so overtime cannot be charged "
                "against it.",
            )
        if extra.hours <= 0:
            raise StageTransitionError("Say how many overtime hours were worked.")
        workers = attendance.present_count or terms.headcount
        expires_at = _assert_overtime_is_timely(
            engagement=engagement, attendance=attendance, now=now
        )
        line = amendments.AmendmentLineInput(
            label=f"Overtime: {workers} workers x {extra.hours} hours",
            quantity=workers * extra.hours,
            unit=amendments.LineUnit.OVERTIME_HOUR,
        )
    else:
        rate = terms.add_on_rates.get(extra.add_on_code)
        if rate is None:
            raise AmendmentRequiredError(
                "That extra is not on the published rate card for this booking.",
            )
        if extra.worker_days <= 0:
            raise StageTransitionError("Say how many worker-days this extra covers.")
        expires_at = None
        line = amendments.AmendmentLineInput(
            label=f"{extra.add_on_code}: {extra.worker_days} worker-days",
            quantity=extra.worker_days,
            unit=amendments.LineUnit.ADD_ON,
            code=extra.add_on_code,
        )

    return amendments.propose_engagement_amendment(
        engagement_id=engagement.id,
        actor=actor,
        kind=EngagementAmendment.Kind.TIME_EXTENSION,
        reason=reason,
        lines=[line],
        stage_id=stage.id,
        expires_at=expires_at,
    )
