"""The day itself: the crew arrives, the supervisor counts, the Customer answers.

The three acts that carry one shift-day across the C3 spine, kept in one file because they are one
conversation and reading any of them alone would hide what the next one does. Arrival starts the
stage (and earns the booking fee on day one), the supervisor's "n of m" *is* the stage evidence,
and the Customer's single tap is either `approve_stage` or `dispute_stage` — plus, on a shortfall,
the one question `M2-BE-537` asks about the workers who did not come.

The boundary: this module decides *what happened*. What that is worth is `settlement`'s, which it
calls after every move; who was expected is `crew`'s, which it only reads.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Final

from django.db import transaction
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners import standing
from apps.partners.models import PartnerStandingEvent
from apps.requirements import booking_fees, disputes, stages
from apps.requirements.exceptions import StageTransitionError
from apps.requirements.models import (
    BookingFee,
    DaySettlement,
    Engagement,
    EngagementStage,
    ShiftAttendance,
)

from .base import _assert_workforce_stage, _locked_stage, ensure_attendance
from .crew import assigned_crew
from .settlement import _refresh_settlement

#: How the Customer answers the supervisor's count. Two answers, one tap each — `SIM-02` is
#: explicit that anything more is a form nobody fills in on a site at seven in the evening.
ATTENDANCE_CONFIRM: Final = "CONFIRM"
ATTENDANCE_DISPUTE: Final = "DISPUTE"
ATTENDANCE_RESPONSES: Final = (ATTENDANCE_CONFIRM, ATTENDANCE_DISPUTE)

#: The most named workers a dispute may itemise. Bounded like every other list on the wire; a
#: dispute naming forty people is not a shift-day.
MAXIMUM_DISPUTED_WORKERS: Final = 40


# ---------------------------------------------------------------------------
# Arrival (`M2-BE-524`)
# ---------------------------------------------------------------------------


@transaction.atomic
def confirm_shift_arrival(*, stage_id: uuid.UUID, actor: User) -> ShiftAttendance:
    """The crew is on site. Either party, **non-OTP**, and that is the default path in M2.

    `milestones.md` defers the start OTP to M3, so arrival here is confirmed by a person who was
    at the site rather than by a code — and it is deliberately not a degraded mode with a banner:
    on this platform, today, this *is* how a shift starts.

    Three things happen at once, and they are one transaction because a half-started day is a
    support ticket: the arrival is stamped, the stage starts on the C3 spine, and on **day one**
    the booking fee is earned. That last one is §4c's `ACTIVE → EARNED` and it is idempotent by
    state in `booking_fees`, so a second tap from the other party settles on the same outcome.
    """
    stage = _locked_stage(stage_id)
    engagement = _assert_workforce_stage(stage)
    attendance = ensure_attendance(stage=stage)
    if attendance.arrival_confirmed_at is not None:
        return attendance
    if not assigned_crew(stage):
        raise StageTransitionError(
            "Name the workers coming to this shift before confirming they arrived.",
        )

    now = timezone.now()
    attendance.arrival_confirmed_at = now
    attendance.arrival_confirmed_by = actor
    attendance.save(update_fields=("arrival_confirmed_at", "arrival_confirmed_by", "updated_at"))
    if stage.status in (
        EngagementStage.Status.PENDING,
        EngagementStage.Status.CORRECTION_REQUESTED,
    ):
        stages.start_stage(stage_id=stage.id, actor=actor)
    _earn_booking_fee_on_first_day(engagement=engagement, stage=stage, actor=actor)
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.shift.arrival_confirmed",
        idempotency_key=f"shift-arrival:{stage.id}",
        payload={"engagement_id": str(engagement.id), "stage_id": str(stage.id)},
    )
    attendance.refresh_from_db()
    return attendance


def _earn_booking_fee_on_first_day(
    *, engagement: Engagement, stage: EngagementStage, actor: User
) -> None:
    """§4c: `ACTIVE → EARNED` at first-day arrival, and only there.

    Guarded on `position == 1` and on a fee actually being `ACTIVE`: a quote-flow A3 engagement has
    no booking fee at all, and calling the command there would raise `m2_booking_fee_not_chargeable`
    at a Customer who is simply confirming their crew turned up.
    """
    if stage.position != 1:
        return
    fee = booking_fees.live_booking_fee(engagement.requirement)
    if fee is None or fee.status != BookingFee.Status.ACTIVE:
        return
    booking_fees.earn_booking_fee(requirement_id=engagement.requirement_id, actor=actor)


# ---------------------------------------------------------------------------
# Attendance: the supervisor's count and the Customer's answer (`525`, `526`, `527`)
# ---------------------------------------------------------------------------


@transaction.atomic
def confirm_attendance(
    *,
    stage_id: uuid.UUID,
    actor: User,
    present_count: int,
    shift_ended_at: datetime | None = None,
) -> ShiftAttendance:
    """Record "n of m present today". One action, from the supervisor (`M2-BE-525`).

    The count **is** the evidence, so this hands the stage to the Customer through the ordinary
    spine: `submit_stage_evidence` writes the note, moves the stage to `AWAITING_REVIEW` and starts
    the review clock the C3 timeout already runs on. There is no second review mechanism for A3.

    A **missing check-out** settles at the agreed shift length and is flagged (`M2-BE-527`). It is
    not a dispute and does not become one on its own: a supervisor whose crew left at six and who
    closed the day at nine has done nothing wrong, and the amount does not depend on the end time —
    only overtime does, and overtime needs the Customer's approval either way. The flag is what
    puts the day in front of Operations if anybody asks later.
    """
    stage = _locked_stage(stage_id)
    engagement = _assert_workforce_stage(stage)
    attendance = ensure_attendance(stage=stage)
    if attendance.arrival_confirmed_at is None:
        raise StageTransitionError("Confirm the crew arrived before recording the day.")
    if attendance.status in (
        ShiftAttendance.Status.CUSTOMER_CONFIRMED,
        ShiftAttendance.Status.DISPUTED,
    ):
        raise StageTransitionError("This day has already been answered by the customer.")
    if present_count < 0 or present_count > attendance.expected_count:
        raise StageTransitionError(
            f"Between 0 and {attendance.expected_count} workers were booked for this day.",
        )

    now = timezone.now()
    attendance.present_count = present_count
    attendance.status = ShiftAttendance.Status.SUPERVISOR_CONFIRMED
    attendance.confirmed_at = now
    attendance.confirmed_by = actor
    attendance.shift_ended_at = shift_ended_at
    attendance.checkout_missing = shift_ended_at is None
    if shift_ended_at is None:
        attendance.flagged_for_review = True
        attendance.flag_reason_code = "checkout_missing"
    attendance.save(
        update_fields=(
            "present_count",
            "status",
            "confirmed_at",
            "confirmed_by",
            "shift_ended_at",
            "checkout_missing",
            "flagged_for_review",
            "flag_reason_code",
            "updated_at",
        )
    )
    _refresh_settlement(stage=stage, engagement=engagement, attendance=attendance)

    note = f"{present_count} of {attendance.expected_count} workers present."
    if attendance.checkout_missing and attendance.standard_day_hours is not None:
        note += (
            f" No end time was recorded, so the day is settled at the agreed "
            f"{attendance.standard_day_hours}-hour shift."
        )
    elif attendance.checkout_missing:
        note += " No end time was recorded and this booking has no published shift length."
    if stage.status in (
        EngagementStage.Status.IN_PROGRESS,
        EngagementStage.Status.AWAITING_REVIEW,
    ):
        stages.submit_stage_evidence(stage_id=stage.id, actor=actor, note=note)
    attendance.refresh_from_db()
    return attendance


@transaction.atomic
def respond_attendance(
    *,
    stage_id: uuid.UUID,
    actor: User,
    response: str,
    shortfall_choice: str = "",
    worker_details: Sequence[dict[str, Any]] = (),
    note: str = "",
) -> ShiftAttendance:
    """The Customer's one tap: confirm the count, or dispute it (`M2-BE-525`, `526`).

    **Confirm** approves the shift-day on the spine, which for `LEAD_ONLY` also releases it — there
    is no payout to hold because Vsolve collected nothing. On a shortfall the Customer must also
    say what they want to do about it (`M2-BE-537`); the day settles at the present workers' rate
    whichever they choose, and the choice decides what happens to the missing worker-days rather
    than to the money for the ones who came.

    **Dispute** is the only place per-worker detail is captured (`M2-BE-526`). It goes to
    `dispute_stage`, which stops the review clock and opens the Operations path; the settlement
    stays unconfirmed, because a count nobody agrees on is not an amount either.
    """
    if response not in ATTENDANCE_RESPONSES:
        raise StageTransitionError("Confirm the day or dispute it.")
    stage = _locked_stage(stage_id)
    engagement = _assert_workforce_stage(stage)
    attendance = ensure_attendance(stage=stage)
    if attendance.status == ShiftAttendance.Status.PENDING:
        raise StageTransitionError("The supervisor has not recorded this day yet.")
    if attendance.status in (
        ShiftAttendance.Status.CUSTOMER_CONFIRMED,
        ShiftAttendance.Status.DISPUTED,
    ):
        return attendance

    now = timezone.now()
    if response == ATTENDANCE_DISPUTE:
        return _dispute_attendance(
            stage=stage,
            attendance=attendance,
            actor=actor,
            worker_details=worker_details,
            note=note,
            now=now,
        )

    shortfall = attendance.shortfall_count
    if shortfall and shortfall_choice not in DaySettlement.ShortfallChoice.values:
        raise StageTransitionError(
            f"{shortfall} of the workers you booked did not come. Tell us whether to carry on "
            "short, ask for an extra day, or cancel the missing workers.",
        )
    attendance.status = ShiftAttendance.Status.CUSTOMER_CONFIRMED
    attendance.responded_at = now
    attendance.responded_by = actor
    attendance.save(update_fields=("status", "responded_at", "responded_by", "updated_at"))

    settlement = _refresh_settlement(stage=stage, engagement=engagement, attendance=attendance)
    if shortfall:
        _apply_shortfall_choice(
            settlement=settlement,
            attendance=attendance,
            engagement=engagement,
            choice=shortfall_choice,
            actor=actor,
            now=now,
        )
    if stage.status == EngagementStage.Status.AWAITING_REVIEW:
        stages.approve_stage(stage_id=stage.id, actor=actor)
    attendance.refresh_from_db()
    return attendance


def _dispute_attendance(
    *,
    stage: EngagementStage,
    attendance: ShiftAttendance,
    actor: User,
    worker_details: Sequence[dict[str, Any]],
    note: str,
    now: datetime,
) -> ShiftAttendance:
    """`M2-BE-526`: the only moment per-worker detail is collected, and it is the Customer's.

    The detail is stored as the Customer's account — "who do you say was not here" — and never as
    an attendance record. Nothing derives a count from it: the supervisor's number is the
    supervisor's, this is the Customer's objection to it, and a case decides between them. Deriving
    a third number from the dispute would invent a fact neither party stated.
    """
    if len(worker_details) > MAXIMUM_DISPUTED_WORKERS:
        raise StageTransitionError("That is more workers than this shift was booked for.")
    detail = [
        {
            "name": str(entry.get("name", ""))[:120],
            "was_present": bool(entry.get("was_present", False)),
            "note": str(entry.get("note", ""))[:400],
        }
        for entry in worker_details
    ]
    attendance.status = ShiftAttendance.Status.DISPUTED
    attendance.responded_at = now
    attendance.responded_by = actor
    attendance.dispute_note = note.strip()[:2000]
    attendance.disputed_worker_details = detail
    attendance.flagged_for_review = True
    attendance.flag_reason_code = "attendance_disputed"
    attendance.save(
        update_fields=(
            "status",
            "responded_at",
            "responded_by",
            "dispute_note",
            "disputed_worker_details",
            "flagged_for_review",
            "flag_reason_code",
            "updated_at",
        )
    )
    if stage.status == EngagementStage.Status.AWAITING_REVIEW:
        stages.dispute_stage(
            stage_id=stage.id,
            actor=actor,
            reason_code="ATTENDANCE_DISPUTED",
            note=attendance.dispute_note or "The customer disputed the attendance count.",
        )
    else:
        # `M2-AC-513`: "conflicting attendance claims open a case and hold settlement." When the
        # stage was already `AWAITING_REVIEW` the stage dispute above opens a `STAGE` case and the
        # hold comes with it; when it was not — a dispute raised the morning after, on a day that
        # already settled — nothing else would have opened one, and the Customer's objection would
        # have existed only as a flag on a row.
        disputes.open_attendance_case(
            stage=stage,
            opened_by=actor,
            detail=attendance.dispute_note or "The customer disputed the attendance count.",
        )
    attendance.refresh_from_db()
    return attendance


def _apply_shortfall_choice(
    *,
    settlement: DaySettlement,
    attendance: ShiftAttendance,
    engagement: Engagement,
    choice: str,
    actor: User,
    now: datetime,
) -> None:
    """Record what the Customer chose, and do exactly that much (`M2-BE-537`).

    * `CONTINUE_SHORT` — the day settles short and tomorrow is unchanged.
    * `ADD_DAY` — the request is recorded and the lead is told. The extra day is **theirs to
      offer**, through the amendment engine at the published rate: appending a shift-day to
      somebody's week without their agreement would be the platform committing a vendor's labour.
    * `CANCEL_SHORTFALL` — the missing worker-days are cancelled free. Nothing further is owed by
      either side for them, which under per-worker-day settlement is already what the amount says;
      the choice is recorded so a later argument reads the Customer's decision rather than infers
      it from an amount.

    The shortfall itself is a **standing event** in every case, including a dispute-free confirm.
    That is the "repeated shortfall is a matching-priority hit" half of the row: one short day is
    ordinary, and only a pattern inside the owner's window demotes anybody.
    """
    settlement.shortfall_choice = choice
    fields = ["shortfall_choice", "updated_at"]
    if choice == DaySettlement.ShortfallChoice.ADD_DAY:
        settlement.make_good_requested_at = now
        fields.append("make_good_requested_at")
    settlement.save(update_fields=tuple(fields))

    standing.record_event(
        partner=engagement.partner,
        kind=PartnerStandingEvent.Kind.CREW_SHORTFALL,
        source_kind="day_settlement",
        source_id=settlement.id,
        reason=(
            f"{attendance.present_count} of {attendance.expected_count} workers on "
            f"{settlement.stage.scheduled_on or settlement.created_at.date()}"
        ),
        occurred_at=now,
    )
    stages.record_event(
        engagement=engagement,
        stage=settlement.stage,
        from_status=settlement.stage.status,
        to_status=settlement.stage.status,
        actor=actor,
        reason_code="shift_shortfall_choice",
        reason=f"{attendance.shortfall_count} short: {choice}",
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.shift.shortfall",
        idempotency_key=f"shift-shortfall:{settlement.id}",
        payload={
            "engagement_id": str(engagement.id),
            "stage_id": str(settlement.stage_id),
            "workers_present": attendance.present_count,
            "workers_expected": attendance.expected_count,
            "choice": choice,
        },
    )
