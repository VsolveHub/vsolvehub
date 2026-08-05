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
    TERMINAL_CASE_STATUSES,
    OperationsCase,
    OperationsCaseEvent,
    default_due_at,
)
from apps.identity.models import User
from apps.payouts.exceptions import CaseConflictApiError, CaseInvalidApiError
from apps.payouts.services import release_payout_hold

#: Case types that hold a Partner's money until somebody decides. A dispute or a safety
#: investigation must not be paid out from under.
PAYOUT_HOLDING_KINDS = frozenset(
    {
        OperationsCase.Kind.QUALITY,
        OperationsCase.Kind.SAFETY,
        OperationsCase.Kind.PARTIAL_WORK,
        OperationsCase.Kind.PAYOUT,
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
    detail: str = "",
    opened_by: User | None = None,
    idempotency_key: str = "",
) -> OperationsCase:
    """Open one case, or return the one this key already opened.

    The owning team is looked up rather than passed in. A caller that could route its own case
    would eventually route a safety incident to booking support, and the ownership table exists
    precisely so that is not a judgement call at the call site.
    """

    if idempotency_key:
        existing = OperationsCase.objects.filter(idempotency_key=idempotency_key).first()
        if existing is not None:
            return existing
    if not summary.strip():
        raise CaseInvalidApiError(reason="A case needs a summary.")
    subjects = [value for value in (booking_id, order_id, partner_id) if value is not None]
    if len(subjects) != 1:
        raise CaseInvalidApiError(reason="A case is about exactly one booking, order or partner.")

    case = OperationsCase.objects.create(
        kind=kind,
        severity=severity,
        owner_team=DEFAULT_TEAM[kind],
        booking_id=booking_id,
        order_id=order_id,
        partner_id=partner_id,
        summary=summary.strip(),
        detail=detail,
        due_at=default_due_at(severity),
        holds_payout=kind in PAYOUT_HOLDING_KINDS,
        opened_by=opened_by,
        idempotency_key=idempotency_key,
    )
    _record(case, OperationsCaseEvent.Kind.OPENED, actor=opened_by, body=case.summary)
    return case


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
    booking_id = case.booking_id
    if booking_id is not None and not _booking_has_other_holds(case, booking_id):
        release_payout_hold(booking_id=booking_id)
    return case


def _booking_has_other_holds(case: OperationsCase, booking_id: UUID) -> bool:
    """Whether another open case is still holding this booking's money.

    Two investigations can hold one visit — a quality complaint and a safety report on the same
    job. Closing the first must not release money the second is still looking at.
    """

    return (
        OperationsCase.objects.filter(booking_id=booking_id, holds_payout=True)
        .exclude(id=case.id)
        .exclude(status__in=TERMINAL_CASE_STATUSES)
        .exists()
    )
