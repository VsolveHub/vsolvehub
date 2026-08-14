"""The A3 shift-day: crew, arrival, attendance, the evening settlement, safety and cash demands.

Wave C4 (`M2-BE-521..539`). `07-state-machines-and-permissions.md` §5 maps an A3 stage to a
shift-day and says funding is not required because A3 is `LEAD_ONLY`, so this module is a **thin
tail on the C3 spine** rather than a second lifecycle. Every state change a shift-day makes is one
of the C3 stage commands, called from here with the shift-day's own facts attached:

| The shift-day's act | The spine command it is |
|---|---|
| The crew arrived | `stages.start_stage` (plus the booking fee earning on day one) |
| The supervisor recorded "n of m" | `stages.submit_stage_evidence` — the count *is* the evidence |
| The Customer confirmed the count | `stages.approve_stage`, which for `LEAD_ONLY` also releases |
| The Customer disputed the count | `stages.dispute_stage`, carrying the per-worker detail |

That mapping is the whole design, and it is what keeps the review timeout, the audit trail, the
dispute path and the Operations decision working on A3 without a line of new lifecycle code. Two
things are genuinely new because the spine has no equivalent: the assignment of named people to a
day, and the evening settlement of money **this platform never touches**.

**Nothing here moves wage money.** ADR-0009: wages are direct, daily, peer-to-peer at day end. The
settlement below records an amount and two taps; there is no `PaymentAttempt`, no ledger entry and
no payout in this file, and adding one would make the platform a party to a payment it has always
said it is not. The only online charge on this path is the booking fee, in `booking_fees.py`.

**Owner-blocked values fail closed, and each one fails in the direction that does least damage.**
The retroactive overtime window refuses a retroactive request (`m2_policy_unavailable`) because it
decides whether work already done is paid for. The standing thresholds do *not* refuse anything:
they gate a background consequence, so an unset one means no demotion and no removal fires while
the events accumulate — the same asymmetry `rate_cards.decline_alarm_policy` draws, for the same
reason.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Final

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.cases.models import OperationsCase
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners import standing
from apps.partners.capabilities import assert_crew_available, assert_crew_roster_present
from apps.partners.exceptions import CrewConflictError
from apps.partners.models import PartnerCrewMembership, PartnerStandingEvent
from apps.requirements import booking_fees, disputes, rate_cards, stages
from apps.requirements.exceptions import (
    AmendmentRequiredError,
    RequirementNotFoundError,
    StageTransitionError,
)
from apps.requirements.models import (
    BookingFee,
    CashDemandReport,
    DaySettlement,
    Engagement,
    EngagementAmendment,
    EngagementStage,
    SafetyIncident,
    ShiftAttendance,
    StageCrewAssignment,
)

#: How the Customer answers the supervisor's count. Two answers, one tap each — `SIM-02` is
#: explicit that anything more is a form nobody fills in on a site at seven in the evening.
ATTENDANCE_CONFIRM: Final = "CONFIRM"
ATTENDANCE_DISPUTE: Final = "DISPUTE"
ATTENDANCE_RESPONSES: Final = (ATTENDANCE_CONFIRM, ATTENDANCE_DISPUTE)

#: The most named workers a dispute may itemise. Bounded like every other list on the wire; a
#: dispute naming forty people is not a shift-day.
MAXIMUM_DISPUTED_WORKERS: Final = 40

#: What the two extras are called on the wire and in the amendment line snapshot (`M2-BE-531`,
#: `538`). Both are priced by the server from the card frozen on the engagement, never by the
#: caller — that is the entire point of a published rate.
EXTRA_OVERTIME: Final = "OVERTIME"
EXTRA_ADD_ON: Final = "ADD_ON"
EXTRA_KINDS: Final = (EXTRA_OVERTIME, EXTRA_ADD_ON)


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


# ---------------------------------------------------------------------------
# Crew assignment, per stage (`M2-BE-522`)
# ---------------------------------------------------------------------------


def assigned_crew(stage: EngagementStage) -> list[StageCrewAssignment]:
    return list(
        StageCrewAssignment.objects.filter(
            stage=stage,
            status=StageCrewAssignment.Status.ASSIGNED,
        )
        .select_related("crew_member", "membership")
        .order_by("-is_supervisor", "assigned_at")
    )


def _busy_crew_member_ids(*, shift_date: date, stage: EngagementStage) -> set[uuid.UUID]:
    """Everyone already promised to somebody on this date, through any agency.

    The global half of `m2_crew_conflict`. `partners.assert_crew_available` takes this set and owns
    the rest of the rules — roster ownership, archived memberships and declared days off — which is
    where they already lived before this wave; this module owns the assignment table, so it owns
    the query over it.
    """
    return set(
        StageCrewAssignment.objects.filter(
            shift_date=shift_date,
            status=StageCrewAssignment.Status.ASSIGNED,
        )
        .exclude(stage_id=stage.id)
        .values_list("crew_member_id", flat=True)
    )


@transaction.atomic
def assign_crew(
    *,
    stage_id: uuid.UUID,
    actor: User,
    membership_ids: Sequence[uuid.UUID],
    reason_code: str = "",
) -> list[StageCrewAssignment]:
    """Name the workers coming to one shift-day. Partner command (`assign_crew` in §6).

    **The whole intended crew, every time.** The command takes the set the supervisor means to have
    on site and reconciles the day to it: names that are gone are released with a reason, names
    that are new are assigned. That makes a substitution one call rather than a delete-then-add
    a client can half-perform, and it makes the command idempotent — re-sending the same set is a
    no-op, which is what a retried tap needs.

    Four refusals, in this order, and each one is a different failure:

    1. **The roster gate** (`m2_crew_roster_required`) — a progressive gate at the *first
       assignment*, not at registration, which is `capabilities.assert_crew_roster_present`'s whole
       design.
    2. **Verified people only.** An unverified membership is a name somebody typed. `M2-BE-522`
       asks for verified identity, `crew_dispatch.verified_roster_size` already sizes the offer
       against verified members, and the plan's rule that "named crew cannot be replaced by
       unverified workers" is meaningless if the first assignment may be unverified.
    3. **Ownership, archives and declared days off** — `assert_crew_available`, unchanged.
    4. **The global conflict** (`m2_crew_conflict`) — the same person promised through two
       agencies on one date. Raised here with the person and the date in the message, and held by
       `requirements_crew_member_one_shift_a_day` when two supervisors tap at the same instant.

    The crew may not exceed the headcount the Customer booked. More workers than were agreed is a
    scope amendment at the published rate (`M2-BE-538`), not a longer list on an assignment screen.
    """
    stage = _locked_stage(stage_id)
    engagement = _assert_workforce_stage(stage)
    if stage.status in (EngagementStage.Status.APPROVED, EngagementStage.Status.RELEASED):
        raise StageTransitionError("This shift-day is settled; its crew can no longer change.")
    shift_date = shift_date_of(stage)
    partner = engagement.partner
    assert_crew_roster_present(partner)

    attendance = ensure_attendance(stage=stage)
    wanted_ids = list(dict.fromkeys(membership_ids))
    if not wanted_ids:
        raise StageTransitionError("Name at least one worker for this shift-day.")
    if len(wanted_ids) > attendance.expected_count:
        raise StageTransitionError(
            f"This day was booked for {attendance.expected_count} workers. Extra workers need a "
            "change request at the published rate.",
        )

    memberships = list(
        PartnerCrewMembership.objects.select_related("crew_member").filter(id__in=wanted_ids)
    )
    if len(memberships) != len(wanted_ids):
        raise RequirementNotFoundError()
    for membership in memberships:
        if membership.documents_verified_at is None:
            raise CrewConflictError(
                f"{membership.crew_member.display_name} is not verified yet, so they cannot be "
                "put on a shift.",
            )
    assert_crew_available(
        partner=partner,
        memberships=memberships,
        on_day=shift_date,
        busy_crew_member_ids=_busy_crew_member_ids(shift_date=shift_date, stage=stage),
    )

    current = {
        assignment.membership_id: assignment
        for assignment in StageCrewAssignment.objects.select_for_update()
        .filter(stage=stage, status=StageCrewAssignment.Status.ASSIGNED)
        .select_related("crew_member")
    }
    now = timezone.now()
    for membership_id, assignment in current.items():
        if membership_id in set(wanted_ids):
            continue
        assignment.status = StageCrewAssignment.Status.RELEASED
        assignment.released_at = now
        assignment.released_reason_code = reason_code or "substituted"
        assignment.save(
            update_fields=("status", "released_at", "released_reason_code", "updated_at")
        )
        stages.record_event(
            engagement=engagement,
            stage=stage,
            from_status=stage.status,
            to_status=stage.status,
            actor=actor,
            reason_code="crew_released",
            reason=f"{assignment.crew_member.display_name} off {shift_date.isoformat()}",
        )

    for membership in memberships:
        if membership.id in current:
            continue
        StageCrewAssignment.objects.create(
            stage=stage,
            partner=partner,
            membership=membership,
            crew_member=membership.crew_member,
            shift_date=shift_date,
            is_supervisor=membership.is_supervisor,
            assigned_by=actor,
        )
        stages.record_event(
            engagement=engagement,
            stage=stage,
            from_status=stage.status,
            to_status=stage.status,
            actor=actor,
            reason_code="crew_assigned",
            reason=f"{membership.crew_member.display_name} on {shift_date.isoformat()}",
        )

    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.shift.crew_assigned",
        idempotency_key=f"shift-crew:{stage.id}:{now.isoformat()}",
        payload={
            "engagement_id": str(engagement.id),
            "stage_id": str(stage.id),
            "shift_date": shift_date.isoformat(),
            "crew_size": len(memberships),
        },
    )
    return assigned_crew(stage)


def future_assignment_dates(*, membership: PartnerCrewMembership) -> list[date]:
    """Shift-days this worker is still promised to, from today forward.

    Read by `capabilities.archive_crew_member`, which until this wave could take a name off a
    roster while the person was booked on Thursday — proposal 0013's acceptance criterion 9, left
    open in `M2-BE-111` because the table it needed did not exist yet.
    """
    return list(
        StageCrewAssignment.objects.filter(
            membership=membership,
            status=StageCrewAssignment.Status.ASSIGNED,
            shift_date__gte=timezone.localdate(),
        )
        .order_by("shift_date")
        .values_list("shift_date", flat=True)
    )


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


# ---------------------------------------------------------------------------
# The evening settlement (`M2-BE-536`, `537`)
# ---------------------------------------------------------------------------


def _stage_extras_paise(stage: EngagementStage) -> int:
    """Overtime and add-ons both sides accepted against this shift-day, in paise.

    Read from the applied `EngagementAmendment` rows pointing at this stage, so the settlement
    amount can only include an extra that went through the amendment engine and was authorized.
    An extra agreed over the phone contributes nothing here, which is the point of `M2-BE-538`.
    """
    total = EngagementAmendment.objects.filter(
        stage=stage,
        applied_at__isnull=False,
        delta_paise__gt=0,
    ).aggregate(total=Sum("delta_paise"))["total"]
    return int(total or 0)


def _refresh_settlement(
    *,
    stage: EngagementStage,
    engagement: Engagement,
    attendance: ShiftAttendance,
) -> DaySettlement:
    """Compute what this day is worth, and stop computing it once both sides have agreed.

    Recomputed on every attendance move so a corrected count and a late-approved overtime both
    reach the amount before anybody taps. **Frozen at `SETTLED`**: an amount that could still move
    after both parties confirmed it would make the tap trail evidence of nothing.
    """
    terms = shift_terms(engagement)
    present = attendance.present_count or 0
    extras = _stage_extras_paise(stage)
    amount = terms.per_worker_paise * present + extras

    settlement = DaySettlement.objects.select_for_update().filter(stage=stage).first()
    if settlement is None:
        return DaySettlement.objects.create(
            stage=stage,
            engagement=engagement,
            per_worker_paise=terms.per_worker_paise,
            workers_present=present,
            workers_expected=attendance.expected_count,
            extras_paise=extras,
            amount_paise=amount,
        )
    if settlement.status == DaySettlement.Status.SETTLED:
        return settlement
    settlement.per_worker_paise = terms.per_worker_paise
    settlement.workers_present = present
    settlement.workers_expected = attendance.expected_count
    settlement.extras_paise = extras
    settlement.amount_paise = amount
    settlement.save(
        update_fields=(
            "per_worker_paise",
            "workers_present",
            "workers_expected",
            "extras_paise",
            "amount_paise",
            "updated_at",
        )
    )
    return settlement


def upi_payment_link(settlement: DaySettlement) -> str | None:
    """A UPI deep link to the lead's own VPA at the exact published amount — a **convenience**.

    `None` whenever the lead has not published a VPA, and that is an ordinary state rather than an
    error: the amount is still shown, the crew is still paid, and the platform's absence from the
    transaction is the design rather than a gap in it.

    The amount is written in rupees because that is what the UPI specification takes, derived from
    integer paise by a division that is exact by construction — every component of the card is
    stored in paise and no rounding happens anywhere in this file.
    """
    business = getattr(settlement.engagement.partner, "business_profile", None)
    vpa = getattr(business, "upi_vpa", "") if business is not None else ""
    if not vpa:
        return None
    rupees = f"{settlement.amount_paise // 100}.{settlement.amount_paise % 100:02d}"
    payee = settlement.engagement.partner.display_name.replace("&", " ")[:60]
    return (
        f"upi://pay?pa={vpa}&pn={payee}&am={rupees}&cu=INR"
        f"&tn=Vsolve%20day%20settlement%20{settlement.stage.position}"
    )


@transaction.atomic
def confirm_day_settled(*, stage_id: uuid.UUID, actor: User) -> DaySettlement:
    """The "Day settled?" tap — one, from either side, from either side (`M2-BE-536`).

    The command records **who tapped**, and nothing else. It moves no money, because the money is
    peer-to-peer; it does not gate the next day, because a lead who has not been paid still turns
    up or does not on their own terms; and it does not decide anything when only one side taps.

    A one-sided claim is left standing as `SUPERVISOR_CLAIMED` or `CUSTOMER_CLAIMED`, which is what
    Operations reads as **unproven**. That is the honest state: one person says they settled and
    the other has not answered. The alternative — treating the first tap as the fact — would make
    the trail worthless in the one argument it exists for.
    """
    stage = _locked_stage(stage_id)
    engagement = _assert_workforce_stage(stage)
    attendance = ensure_attendance(stage=stage)
    if attendance.present_count is None:
        raise StageTransitionError(
            "The day has not been recorded yet, so there is no amount to settle.",
        )
    settlement = _refresh_settlement(stage=stage, engagement=engagement, attendance=attendance)
    is_customer = engagement.customer_id == actor.id
    is_partner = engagement.partner.user_id == actor.id
    if not (is_customer or is_partner):
        raise RequirementNotFoundError()

    now = timezone.now()
    fields: list[str] = ["status", "updated_at"]
    if is_customer and settlement.customer_confirmed_at is None:
        settlement.customer_confirmed_at = now
        settlement.customer_confirmed_by = actor
        fields += ["customer_confirmed_at", "customer_confirmed_by"]
    if is_partner and settlement.supervisor_confirmed_at is None:
        settlement.supervisor_confirmed_at = now
        settlement.supervisor_confirmed_by = actor
        fields += ["supervisor_confirmed_at", "supervisor_confirmed_by"]

    both = (
        settlement.customer_confirmed_at is not None
        and settlement.supervisor_confirmed_at is not None
    )
    if both:
        settlement.status = DaySettlement.Status.SETTLED
        settlement.settled_at = settlement.settled_at or now
        fields.append("settled_at")
    elif settlement.customer_confirmed_at is not None:
        settlement.status = DaySettlement.Status.CUSTOMER_CLAIMED
    elif settlement.supervisor_confirmed_at is not None:
        settlement.status = DaySettlement.Status.SUPERVISOR_CLAIMED
    settlement.save(update_fields=tuple(dict.fromkeys(fields)))

    stages.record_event(
        engagement=engagement,
        stage=stage,
        from_status=stage.status,
        to_status=stage.status,
        actor=actor,
        reason_code="day_settled_confirmed",
        reason=f"{settlement.amount_paise} paise, {settlement.status}",
    )
    if both:
        enqueue_outbox_event(
            aggregate_type="engagement",
            aggregate_id=engagement.id,
            event_type="m2.shift.day_settled",
            idempotency_key=f"day-settled:{settlement.id}",
            payload={
                "engagement_id": str(engagement.id),
                "stage_id": str(stage.id),
                "amount_paise": settlement.amount_paise,
            },
        )
    return settlement


def unproven_settlement_ids(*, older_than_hours: int = 24) -> list[uuid.UUID]:
    """One-sided settlement claims old enough for Operations to look at.

    A selector, not a sweep that decides anything. There is no command behind it that could settle
    a day on one person's word — the whole point is that nothing can — so this exists to put the
    rows in front of a human, which is the only thing that can resolve them.
    """
    cutoff = timezone.now() - timedelta(hours=older_than_hours)
    return list(
        DaySettlement.objects.filter(
            Q(status=DaySettlement.Status.SUPERVISOR_CLAIMED)
            | Q(status=DaySettlement.Status.CUSTOMER_CLAIMED),
            updated_at__lt=cutoff,
        ).values_list("id", flat=True)
    )


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


# ---------------------------------------------------------------------------
# Safety (`M2-BE-530`) and cash demands (`M2-BE-539`)
# ---------------------------------------------------------------------------


@transaction.atomic
def report_safety_incident(
    *,
    engagement: Engagement,
    actor: User | None,
    reporter_role: str,
    severity: str,
    category_code: str,
    description: str,
    occurred_at: datetime | None = None,
    stage_id: uuid.UUID | None = None,
) -> SafetyIncident:
    """File a safety incident. Both parties and Operations (`M2-BE-530`).

    **Never a cancellation reason.** Nothing here cancels, suspends or refunds anything, and the
    engagement carries on exactly as it was: a report is a record, and a job that has to end
    because a site is unsafe ends through cancellation with a safety report beside it, so that both
    facts exist separately and either can be read without the other.

    Routed to Operations by outbox event rather than by an email somebody wrote — `GAP-022` asks
    for routing, and the outbox is what already guarantees at-least-once delivery for every other
    thing this platform must not lose.
    """
    if severity not in SafetyIncident.Severity.values:
        raise StageTransitionError("That is not a severity we record.")
    if not description.strip():
        raise StageTransitionError("Say what happened.")
    stage = None
    if stage_id is not None:
        stage = EngagementStage.objects.filter(pk=stage_id, engagement=engagement).first()
        if stage is None:
            raise RequirementNotFoundError()

    incident = SafetyIncident.objects.create(
        engagement=engagement,
        stage=stage,
        reported_by=actor,
        reporter_role=reporter_role,
        severity=severity,
        category_code=category_code[:80],
        description=description.strip()[:8000],
        occurred_at=occurred_at or timezone.now(),
    )
    stages.record_event(
        engagement=engagement,
        stage=stage,
        from_status=engagement.status,
        to_status=engagement.status,
        actor=actor,
        reason_code="safety_incident_reported",
        reason=f"{severity}:{incident.category_code}",
    )
    # Wave C6 (`M2-BE-703`). The outbox event routes it; the case is what somebody *works*, with an
    # owner, a one-hour SLA at `URGENT` and a payout hold. Both are needed and neither replaces the
    # other: an event with no case is a notification nobody is accountable for, and this is the one
    # report type where "we told somebody" was already called out as insufficient.
    disputes.open_linked_case(
        kind=OperationsCase.Kind.SAFETY,
        summary=f"Safety incident: {incident.category_code}"[:240],
        source_kind="safety_incident",
        source_id=incident.id,
        engagement=engagement,
        severity=(
            OperationsCase.Severity.URGENT
            if severity in (SafetyIncident.Severity.SERIOUS, SafetyIncident.Severity.CRITICAL)
            else OperationsCase.Severity.HIGH
        ),
        detail=incident.description[:4000],
        opened_by=actor,
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.safety.incident_reported",
        idempotency_key=f"safety-incident:{incident.id}",
        payload={
            "engagement_id": str(engagement.id),
            "safety_incident_id": str(incident.id),
            "severity": severity,
            "reporter_role": reporter_role,
        },
    )
    return incident


@transaction.atomic
def decide_safety_incident(
    *,
    incident_id: uuid.UUID,
    actor: User,
    status_value: str,
    resolution_note: str,
) -> SafetyIncident:
    """Operations moves a report through review to a close. Auditable, never a database edit.

    The report body is frozen by `SafetyIncident.save`, so this can only ever add a status and a
    resolution — an operator cannot revise what somebody said happened, which is the property that
    makes the record worth keeping.
    """
    if status_value not in (SafetyIncident.Status.UNDER_REVIEW, SafetyIncident.Status.RESOLVED):
        raise StageTransitionError("That is not a decision a safety report can take.")
    if status_value == SafetyIncident.Status.RESOLVED and not resolution_note.strip():
        raise StageTransitionError("Closing a safety report needs an account of what was done.")

    incident = SafetyIncident.objects.select_for_update(of=("self",)).get(pk=incident_id)
    if incident.status == status_value:
        return incident
    if incident.status == SafetyIncident.Status.RESOLVED:
        raise StageTransitionError("This safety report is already closed.")

    incident.status = status_value
    incident.resolution_note = resolution_note.strip()[:8000]
    fields = ["status", "resolution_note", "updated_at"]
    if status_value == SafetyIncident.Status.RESOLVED:
        incident.resolved_at = timezone.now()
        incident.resolved_by = actor
        fields += ["resolved_at", "resolved_by"]
    incident.save(update_fields=tuple(fields))
    stages.record_event(
        engagement=incident.engagement,
        stage=incident.stage,
        from_status=SafetyIncident.Status.REPORTED,
        to_status=incident.status,
        actor=actor,
        reason_code="safety_incident_decided",
        reason=incident.resolution_note[:200],
    )
    return incident


@transaction.atomic
def report_cash_demand(
    *,
    engagement: Engagement,
    actor: User,
    amount_claimed_paise: int | None = None,
    note: str = "",
    stage_id: uuid.UUID | None = None,
) -> CashDemandReport:
    """Report "they asked for extra in cash". One tap from the Customer (`M2-BE-539`).

    Three things happen and the third is the one worth being careful about:

    1. The report is written, immutably. It is the Customer's account and it stays readable.
    2. A **standing event** is recorded against the lead. Not a penalty — a fact with a date.
    3. If the owner has configured a threshold and a window, and this vendor has crossed it, the
       A3 capability is **suspended** through the existing capability command, which routes their
       live engagements exactly as an Operations suspension does.

    While the threshold is unset, step three does nothing at all and the reports still accumulate.
    That is deliberate: refusing a Customer's report because a policy is unconfigured would punish
    them for an Operations gap, and removing a vendor's livelihood on a number nobody approved is
    not a decision code may take. The gap is reported rather than papered over.
    """
    stage = None
    if stage_id is not None:
        stage = EngagementStage.objects.filter(pk=stage_id, engagement=engagement).first()
        if stage is None:
            raise RequirementNotFoundError()
    if amount_claimed_paise is not None and amount_claimed_paise <= 0:
        raise StageTransitionError("An amount, if you give one, has to be more than nothing.")

    report = CashDemandReport.objects.create(
        engagement=engagement,
        stage=stage,
        reported_by=actor,
        amount_claimed_paise=amount_claimed_paise,
        note=note.strip()[:4000],
    )
    standing.record_event(
        partner=engagement.partner,
        kind=PartnerStandingEvent.Kind.CASH_DEMAND_REPORTED,
        source_kind="cash_demand_report",
        source_id=report.id,
        reason=f"engagement {engagement.id}",
    )
    stages.record_event(
        engagement=engagement,
        stage=stage,
        from_status=engagement.status,
        to_status=engagement.status,
        actor=actor,
        reason_code="cash_demand_reported",
        reason=f"cash_demand_report:{report.id}",
    )
    # `M2-AC-705`/`706`: an off-platform money claim reaches Operations as a neutral evidence
    # review rather than an automatic finding. Opening the case also freezes the vendor's unpaid
    # earnings on this engagement, which is the point — a cash extra demanded on site is a claim
    # about money, and settling the platform side of it while the claim is open would decide it.
    disputes.open_off_platform_case(
        engagement=engagement,
        source_kind="cash_demand_report",
        source_id=report.id,
        summary="Customer reports an extra demanded in cash on site",
        opened_by=actor,
        detail=report.note,
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.vendor.cash_demand_reported",
        idempotency_key=f"cash-demand:{report.id}",
        payload={
            "engagement_id": str(engagement.id),
            "cash_demand_report_id": str(report.id),
            "partner_id": str(engagement.partner_id),
        },
    )
    _suspend_on_cash_demand_pattern(engagement=engagement)
    return report


def _suspend_on_cash_demand_pattern(*, engagement: Engagement) -> None:
    """Removal on pattern, through the capability command Operations already uses.

    Imported here rather than at module scope because `capabilities` reaches into this module for
    the archive guard, and one of the two has to be the late import. This is the one that runs on a
    rare path.
    """
    from apps.partners.capabilities import (  # noqa: PLC0415 — mutual import with this module
        suspend_partner_a3_capabilities,
    )

    policy = standing.standing_policy(engagement.requirement.configuration)
    if not standing.pattern_reached(
        partner=engagement.partner,
        kind=PartnerStandingEvent.Kind.CASH_DEMAND_REPORTED,
        threshold=None if policy is None else policy.cash_demand_threshold,
        policy=policy,
    ):
        return
    suspend_partner_a3_capabilities(
        partner=engagement.partner,
        reason_code="cash_demand_pattern",
    )
