"""Opening, working and closing an Operations case.

The one rule worth restating from `06-fulfilment-safety-quality-and-disputes.md`: "cases may
escalate, but they may not close merely because a notification was sent". `resolve_case` refuses
a resolution that is not in the case type's required terminal set, which is what turns that
sentence into a constraint rather than a hope.
"""

from typing import Any
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.cases.models import (
    ALLOWED_RESOLUTIONS,
    DEFAULT_TEAM,
    SUBJECTLESS_KINDS,
    TERMINAL_CASE_STATUSES,
    OperationsCase,
    OperationsCaseEvent,
    OperationsCaseEvidence,
    default_due_at,
)
from apps.identity.models import User
from apps.payouts.exceptions import CaseConflictApiError, CaseInvalidApiError
from apps.payouts.models import PartnerEarningHold
from apps.payouts.services import (
    place_earning_hold,
    release_hold_for_source,
    release_payout_hold,
)

#: Case types that hold a Partner's money until somebody decides. A dispute or a safety
#: investigation must not be paid out from under.
#:
#: Wave C6 (`M2-BE-709`) adds the four M2 kinds, and all four hold. The rule the set encodes is
#: not "money is involved" — it is **"somebody has said the work did not happen as recorded"**,
#: and every one of these says exactly that: a cancellation both sides describe differently, a
#: disputed head count, a disputed milestone, and a claim that the money went around the platform.
PAYOUT_HOLDING_KINDS = frozenset(
    {
        OperationsCase.Kind.QUALITY,
        OperationsCase.Kind.SAFETY,
        OperationsCase.Kind.PARTIAL_WORK,
        OperationsCase.Kind.PAYOUT,
        OperationsCase.Kind.CANCELLATION_CONFLICT,
        OperationsCase.Kind.ATTENDANCE,
        OperationsCase.Kind.STAGE,
        OperationsCase.Kind.OFF_PLATFORM,
        # A chargeback pulls the Customer's money back out. Any vendor earning funded from it is
        # unsafe to pay until somebody decides, which is `M2-AC-711` in one line.
        OperationsCase.Kind.CHARGEBACK,
    }
)


@transaction.atomic
def open_case(
    *,
    kind: str,
    summary: str,
    severity: str = OperationsCase.Severity.NORMAL,
    booking_id: UUID | None = None,
    order_id: UUID | None = None,
    partner_id: UUID | None = None,
    requirement_id: UUID | None = None,
    engagement_id: UUID | None = None,
    listing_id: UUID | None = None,
    application_id: UUID | None = None,
    detail: str = "",
    opened_by: User | None = None,
    response_due_at: Any | None = None,
    idempotency_key: str = "",
) -> OperationsCase:
    """Open one case, or return the one this key already opened.

    The owning team is looked up rather than passed in. A caller that could route its own case
    would eventually route a safety incident to booking support, and the ownership table exists
    precisely so that is not a judgement call at the call site.

    `response_due_at` is passed in rather than derived here because the window is **per variant**
    M2 configuration and this module has no requirement to read it from. `None` is a real answer,
    not a missing one: the variant set no window and nobody is timed out against a clock nobody
    set.
    """

    if idempotency_key:
        existing = OperationsCase.objects.filter(idempotency_key=idempotency_key).first()
        if existing is not None:
            return existing
    if not summary.strip():
        raise CaseInvalidApiError(reason="A case needs a summary.")
    subjects = [
        value
        for value in (
            booking_id,
            order_id,
            partner_id,
            requirement_id,
            engagement_id,
            listing_id,
            application_id,
        )
        if value is not None
    ]
    if kind in SUBJECTLESS_KINDS:
        if subjects:
            raise CaseInvalidApiError(reason="A Contact form message is not about a record.")
    elif len(subjects) != 1:
        raise CaseInvalidApiError(
            reason="A case is about exactly one subject.",
        )

    case = OperationsCase.objects.create(
        kind=kind,
        severity=severity,
        owner_team=DEFAULT_TEAM[kind],
        booking_id=booking_id,
        order_id=order_id,
        partner_id=partner_id,
        requirement_id=requirement_id,
        engagement_id=engagement_id,
        listing_id=listing_id,
        application_id=application_id,
        summary=summary.strip(),
        detail=detail,
        due_at=default_due_at(severity),
        response_due_at=response_due_at,
        holds_payout=kind in PAYOUT_HOLDING_KINDS,
        opened_by=opened_by,
        idempotency_key=idempotency_key,
    )
    _record(case, OperationsCaseEvent.Kind.OPENED, actor=opened_by, body=case.summary)
    if response_due_at is not None:
        _record(
            case,
            OperationsCaseEvent.Kind.DEADLINE_SET,
            actor=opened_by,
            context={"response_due_at": response_due_at.isoformat()},
        )
    if case.holds_payout:
        _hold_booking_payout(case)
        _hold_m2_payouts(case)
    return case


def _hold_booking_payout(case: OperationsCase) -> None:
    """Freeze a booking's earning while a payout-holding case about it runs.

    An explicit hold rather than a status change, so it also catches an earning that is already
    `AVAILABLE` and is lifted by this case alone when it closes.
    """

    if case.booking_id is None:
        return
    place_earning_hold(
        reason=PartnerEarningHold.Reason.OPERATIONS_CASE,
        source_id=str(case.id),
        booking_id=case.booking_id,
        actor=case.opened_by,
    )


def _record(
    case: OperationsCase,
    kind: str,
    *,
    actor: User | None,
    body: str = "",
    context: dict[str, Any] | None = None,
    idempotency_key: str = "",
) -> OperationsCaseEvent:
    return OperationsCaseEvent.objects.create(
        case=case,
        kind=kind,
        actor=actor,
        body=body,
        context=context or {},
        idempotency_key=idempotency_key,
    )


def _locked(case_id: UUID, expected_version: int) -> OperationsCase:
    case = OperationsCase.objects.select_for_update().get(id=case_id)
    if case.version != expected_version:
        raise CaseConflictApiError(current_version=case.version)
    return case


@transaction.atomic
def claim_case(*, case_id: UUID, expected_version: int, actor: User) -> OperationsCase:
    case = _locked(case_id, expected_version)
    if case.status in TERMINAL_CASE_STATUSES:
        raise CaseInvalidApiError(reason="A closed case cannot be claimed.")
    case.owner = actor
    case.status = OperationsCase.Status.IN_PROGRESS
    case.version += 1
    case.save(update_fields=("owner", "status", "version", "updated_at"))
    _record(case, OperationsCaseEvent.Kind.CLAIMED, actor=actor)
    return case


@transaction.atomic
def add_case_note(
    *, case_id: UUID, actor: User, body: str, is_communication: bool = False
) -> OperationsCaseEvent:
    """A note, or a record that something was sent to a person.

    Both are events rather than separate tables: "we told the customer" and "we changed the
    severity" are the same kind of fact to an auditor reconstructing what Operations knew, and
    when. Adding one never moves the case — sending a message is not progress.
    """

    if not body.strip():
        raise CaseInvalidApiError(reason="A note needs a body.")
    case = OperationsCase.objects.select_for_update().get(id=case_id)
    return _record(
        case,
        OperationsCaseEvent.Kind.COMMUNICATION
        if is_communication
        else OperationsCaseEvent.Kind.NOTE,
        actor=actor,
        body=body.strip(),
    )


@transaction.atomic
def escalate_case(
    *, case_id: UUID, expected_version: int, severity: str, actor: User
) -> OperationsCase:
    """Raise severity, which shortens the deadline the case is measured on."""

    case = _locked(case_id, expected_version)
    if case.status in TERMINAL_CASE_STATUSES:
        raise CaseInvalidApiError(reason="A closed case cannot be escalated.")
    previous = case.severity
    case.severity = severity
    case.due_at = default_due_at(severity)
    case.version += 1
    case.save(update_fields=("severity", "due_at", "version", "updated_at"))
    _record(
        case,
        OperationsCaseEvent.Kind.SEVERITY_CHANGED,
        actor=actor,
        context={"from": previous, "to": severity, "due_at": case.due_at.isoformat()},
    )
    return case


@transaction.atomic
def resolve_case(
    *,
    case_id: UUID,
    expected_version: int,
    resolution: str,
    note: str,
    actor: User,
) -> OperationsCase:
    """Close a case by naming what actually happened.

    The resolution must be one of the terminal results the ownership table requires for this
    case type. A free-text close would let "customer was emailed" stand in for "the money was
    reconciled", which is exactly the failure the plan calls out.

    Releasing the payout hold is part of closing, not a follow-up: a resolved quality case that
    left a Partner's earnings frozen would be a case that closed without finishing.
    """

    case = _locked(case_id, expected_version)
    if case.status in TERMINAL_CASE_STATUSES:
        return case
    allowed = ALLOWED_RESOLUTIONS[case.kind]
    if resolution not in allowed:
        raise CaseInvalidApiError(
            reason=(
                f"A {case.kind} case resolves to one of {', '.join(sorted(allowed))} — "
                f"not {resolution!r}."
            )
        )
    if not note.strip():
        raise CaseInvalidApiError(reason="A resolution needs a documented outcome.")

    case.status = OperationsCase.Status.RESOLVED
    case.resolution = resolution
    case.resolution_note = note.strip()
    case.resolved_at = timezone.now()
    case.holds_payout = False
    case.version += 1
    case.save(
        update_fields=(
            "status",
            "resolution",
            "resolution_note",
            "resolved_at",
            "holds_payout",
            "version",
            "updated_at",
        )
    )
    _record(
        case,
        OperationsCaseEvent.Kind.RESOLVED,
        actor=actor,
        body=case.resolution_note,
        context={"resolution": resolution},
    )
    # Every hold this case placed — on its booking, or on each M2 entry it froze — and only those.
    # Another open case on the same subject placed its own holds under its own id, so lifting
    # these never frees money that case is still looking at.
    release_hold_for_source(
        reason=PartnerEarningHold.Reason.OPERATIONS_CASE,
        source_id=str(case.id),
        actor=actor,
        note=resolution,
    )
    booking_id = case.booking_id
    if booking_id is not None and not _subject_has_other_holds(case, booking_id=booking_id):
        release_payout_hold(booking_id=booking_id, actor=actor, note=resolution)
    _release_m2_payouts(case)
    return case


def _subject_has_other_holds(
    case: OperationsCase,
    *,
    booking_id: UUID | None = None,
    requirement_id: UUID | None = None,
    engagement_id: UUID | None = None,
) -> bool:
    """Whether another open case is still holding this subject's money.

    Two investigations can hold one visit — a quality complaint and a safety report on the same
    job. Closing the first must not release money the second is still looking at. Wave C6 widened
    this from Bookings to the M2 subjects for exactly the same reason, which is why it takes the
    subject as a keyword rather than growing a second copy of the query.
    """

    subject: dict[str, UUID] = {
        key: value
        for key, value in (
            ("booking_id", booking_id),
            ("requirement_id", requirement_id),
            ("engagement_id", engagement_id),
        )
        if value is not None
    }
    if not subject:  # pragma: no cover - every caller passes exactly one
        return False
    return (
        OperationsCase.objects.filter(holds_payout=True, **subject)
        .exclude(id=case.id)
        .exclude(status__in=TERMINAL_CASE_STATUSES)
        .exists()
    )


def _hold_m2_payouts(case: OperationsCase) -> None:
    """Freeze this engagement's unpaid earnings while the case runs (`M2-BE-709`).

    Imported inside the function for the reason `commerce._apply_m2_capture` records:
    `apps.requirements` imports this module, and this is the one call that goes the other way.
    A case with no M2 subject does nothing here at all.
    """

    if case.requirement_id is None and case.engagement_id is None:
        return
    from apps.requirements import disputes  # noqa: PLC0415 - avoids a module import cycle

    held = disputes.hold_engagement_payouts(case=case)
    if held:
        _record(
            case,
            OperationsCaseEvent.Kind.PAYOUT_HOLD_CHANGED,
            actor=case.opened_by,
            context={"held_ledger_entry_ids": [str(value) for value in held], "holding": True},
        )


def _release_m2_payouts(case: OperationsCase) -> None:
    """Unfreeze what this case was holding, unless another open case still is."""

    if case.requirement_id is None and case.engagement_id is None:
        return
    if _subject_has_other_holds(
        case,
        requirement_id=case.requirement_id,
        engagement_id=case.engagement_id,
    ):
        return
    from apps.requirements import disputes  # noqa: PLC0415 - avoids a module import cycle

    released = disputes.release_engagement_payouts(case=case)
    if released:
        _record(
            case,
            OperationsCaseEvent.Kind.PAYOUT_HOLD_CHANGED,
            actor=None,
            context={
                "released_ledger_entry_ids": [str(value) for value in released],
                "holding": False,
            },
        )


# ---------------------------------------------------------------------------
# Wave C6 (`M2-BE-704`): evidence, response deadlines, appeals and audited overrides.
#
# Four commands, and what they have in common is that none of them decides anything. A case is
# still closed by `resolve_case` naming a required terminal result; what these add is the record
# of how the parties got heard, which is what `04-acceptance-and-cutover.md` §H means by "the same
# neutral evidence process applies" in both directions.
# ---------------------------------------------------------------------------

APPEAL_UPHELD = "UPHELD"
APPEAL_OVERTURNED = "OVERTURNED"
APPEAL_OUTCOMES = (APPEAL_UPHELD, APPEAL_OVERTURNED)


@transaction.atomic
def submit_case_evidence(
    *,
    case_id: UUID,
    party: str,
    actor: User,
    statement: str = "",
    requirement_attachment_id: UUID | None = None,
    stage_evidence_id: UUID | None = None,
) -> OperationsCaseEvidence:
    """Put something in front of the decision. Never moves the case.

    Submitting evidence is not progress, for the same reason `add_case_note` is not: a case that
    advanced because somebody uploaded a photograph would be a case that could be closed by
    uploading photographs.
    """

    case = OperationsCase.objects.select_for_update().get(id=case_id)
    if case.status in TERMINAL_CASE_STATUSES and case.appeal_requested_at is None:
        raise CaseInvalidApiError(
            reason="This case is closed. Ask for an appeal before adding anything to it.",
        )
    artifacts = [
        value for value in (requirement_attachment_id, stage_evidence_id) if value is not None
    ]
    if len(artifacts) > 1:
        raise CaseInvalidApiError(reason="One piece of evidence points at one file.")
    if not statement.strip() and not artifacts:
        raise CaseInvalidApiError(reason="Evidence needs a statement or a file.")

    evidence = OperationsCaseEvidence.objects.create(
        case=case,
        party=party,
        submitted_by=actor,
        statement=statement.strip(),
        requirement_attachment_id=requirement_attachment_id,
        stage_evidence_id=stage_evidence_id,
    )
    _record(
        case,
        OperationsCaseEvent.Kind.EVIDENCE,
        actor=actor,
        body=evidence.statement[:1000],
        context={"case_evidence_id": str(evidence.id), "party": party},
    )
    return evidence


@transaction.atomic
def set_case_response_deadline(
    *, case_id: UUID, expected_version: int, response_due_at: Any, actor: User, reason: str
) -> OperationsCase:
    """Extend or set the window the parties answer in. `M2-BE-712`'s deadline extension.

    Only ever forward. Moving a deadline **backwards** would retroactively time somebody out of a
    window they were still inside, which is the one thing a deadline extension must not be able to
    do — and it is why this is a command with a reason rather than a writable field.
    """

    case = _locked(case_id, expected_version)
    if case.status in TERMINAL_CASE_STATUSES:
        raise CaseInvalidApiError(reason="A closed case has nobody left to answer it.")
    if not reason.strip():
        raise CaseInvalidApiError(reason="Moving a deadline needs a reason.")
    if case.response_due_at is not None and response_due_at <= case.response_due_at:
        raise CaseInvalidApiError(reason="A response deadline may only move forward.")
    previous = case.response_due_at
    case.response_due_at = response_due_at
    case.version += 1
    case.save(update_fields=("response_due_at", "version", "updated_at"))
    _record(
        case,
        OperationsCaseEvent.Kind.DEADLINE_SET,
        actor=actor,
        body=reason.strip(),
        context={
            "from": previous.isoformat() if previous is not None else None,
            "to": response_due_at.isoformat(),
        },
    )
    return case


@transaction.atomic
def request_case_appeal(
    *, case_id: UUID, actor: User, reason: str, appeal_deadline: Any | None
) -> OperationsCase:
    """A party challenges a decision that already went against them.

    `appeal_deadline` is the **latest moment an appeal was allowed**, computed by the caller from
    the variant's window. An **open** case needs no window, because nothing has been decided yet;
    a resolved case with no configured window cannot be appealed at all, and the caller refuses
    with `m2_policy_unavailable` before reaching here — an appeal window with no bound is an
    open-ended claim to reverse a decision that already moved money.
    """

    case = OperationsCase.objects.select_for_update().get(id=case_id)
    if not reason.strip():
        raise CaseInvalidApiError(reason="An appeal needs a reason.")
    if case.appeal_requested_at is not None:
        raise CaseInvalidApiError(reason="This case has already been appealed once.")
    if (
        case.status in TERMINAL_CASE_STATUSES
        and appeal_deadline is not None
        and timezone.now() > appeal_deadline
    ):
        raise CaseInvalidApiError(reason="The window to appeal this decision has passed.")
    case.appeal_requested_at = timezone.now()
    case.appeal_requested_by = actor
    case.appeal_reason = reason.strip()[:480]
    case.version += 1
    case.save(
        update_fields=(
            "appeal_requested_at",
            "appeal_requested_by",
            "appeal_reason",
            "version",
            "updated_at",
        )
    )
    _record(
        case,
        OperationsCaseEvent.Kind.APPEAL_REQUESTED,
        actor=actor,
        body=case.appeal_reason,
    )
    return case


@transaction.atomic
def decide_case_appeal(
    *, case_id: UUID, expected_version: int, outcome: str, note: str, actor: User
) -> OperationsCase:
    """Uphold the original decision, or overturn it and reopen the case.

    Overturning **reopens** rather than re-deciding: the second decision is a real decision with
    its own required terminal result, taken by somebody looking at the case again. A command that
    could both overturn and re-resolve in one step would be a command that closed a case without
    anybody working it.

    Reopening also puts the payout hold back, because the reason the money was released — "the
    case is finished" — has just stopped being true.
    """

    case = _locked(case_id, expected_version)
    if case.appeal_requested_at is None:
        raise CaseInvalidApiError(reason="Nobody has appealed this case.")
    if case.appeal_decided_at is not None:
        return case
    if outcome not in APPEAL_OUTCOMES:
        raise CaseInvalidApiError(
            reason=f"An appeal is {' or '.join(APPEAL_OUTCOMES)} - not {outcome!r}.",
        )
    if not note.strip():
        raise CaseInvalidApiError(reason="An appeal decision needs a documented outcome.")

    case.appeal_decided_at = timezone.now()
    case.appeal_decided_by = actor
    case.appeal_outcome = outcome
    updates = [
        "appeal_decided_at",
        "appeal_decided_by",
        "appeal_outcome",
        "version",
        "updated_at",
    ]
    if outcome == APPEAL_OVERTURNED:
        case.status = OperationsCase.Status.IN_PROGRESS
        case.resolution = ""
        case.resolution_note = ""
        case.resolved_at = None
        case.holds_payout = case.kind in PAYOUT_HOLDING_KINDS
        case.due_at = default_due_at(case.severity)
        updates += [
            "status",
            "resolution",
            "resolution_note",
            "resolved_at",
            "holds_payout",
            "due_at",
        ]
    case.version += 1
    case.save(update_fields=tuple(updates))
    _record(
        case,
        OperationsCaseEvent.Kind.APPEAL_DECIDED,
        actor=actor,
        body=note.strip(),
        context={"outcome": outcome},
    )
    if outcome == APPEAL_OVERTURNED and case.holds_payout:
        _hold_booking_payout(case)
        _hold_m2_payouts(case)
    return case


@transaction.atomic
def override_case_outcome(
    *, case_id: UUID, expected_version: int, resolution: str, note: str, actor: User
) -> OperationsCase:
    """Replace a resolved case's terminal result by hand, with the override recorded as one.

    `M2-BE-704`'s "audited manual overrides", and the audit is the whole of it. The resolution is
    still checked against the case type's required terminal set — an override is permission to
    reach a *different* documented outcome, never permission to reach an undocumented one — and
    the previous result is kept in the event context, so the trail reads "we said X, then we said
    Y, and here is who and why" rather than only ever showing Y.
    """

    case = _locked(case_id, expected_version)
    if case.status != OperationsCase.Status.RESOLVED:
        raise CaseInvalidApiError(reason="Only a resolved case has an outcome to override.")
    allowed = ALLOWED_RESOLUTIONS[case.kind]
    if resolution not in allowed:
        raise CaseInvalidApiError(
            reason=(
                f"A {case.kind} case resolves to one of {', '.join(sorted(allowed))} - "
                f"not {resolution!r}."
            )
        )
    if not note.strip():
        raise CaseInvalidApiError(reason="An override needs a documented reason.")
    previous = case.resolution
    case.resolution = resolution
    case.resolution_note = note.strip()
    case.resolved_at = timezone.now()
    case.version += 1
    case.save(
        update_fields=("resolution", "resolution_note", "resolved_at", "version", "updated_at")
    )
    _record(
        case,
        OperationsCaseEvent.Kind.OVERRIDE,
        actor=actor,
        body=case.resolution_note,
        context={"from": previous, "to": resolution},
    )
    return case
