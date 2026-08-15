"""Retention, redaction and erasure for M2, with the financial hold outranking all of it.

`M2-BE-805` / `GAP-008`. One sentence carries the whole design: **a financial hold outranks a
deletion request — never delete a row a ledger or an open case depends on; redact instead, and make
the redaction auditable.**

## Why this platform redacts and never deletes

Two independent reasons, and either alone would be enough.

The first is legal. A captured charge, a refund, a forfeit split, an invoice number and a partner
ledger entry are the platform's own books. An erasure request cannot reach them, because the
obligation to keep them is not the platform's to waive — and a system that deleted them on request
would be unable to answer a chargeback six months later, which is not a privacy win for anybody.

The second is structural, and it is the one a reader can check. **Every foreign key into
`CustomerRequirement` is `on_delete=PROTECT`.** A `delete()` on a requirement with a booking fee,
an engagement or a snapshot does not cascade — it raises. That is not an obstacle to work around;
it is the schema stating the same rule the paragraph above states in prose. So there is no
"delete" command in this module to be tempted by, and `handle_erasure_request` is the only
entry point.

## What redaction actually removes

The personal content, and only that:

* the free-text description a Customer typed;
* the free-text *answers* — structured answers (a number of helpers, a floor count) are the
  commercial terms of a booking and stay, because they are what the money was priced against;
* both directions of every clarification thread, which is where a phone number or an address most
  often ends up despite `looks_like_contact_sharing` flagging it;
* the stored bytes of every attachment, and the voice-note transcript derived from them.

What it deliberately leaves: statuses, timestamps, ids, amounts, and every attachment's *metadata*.
A `RequirementSnapshot` records what a vendor was shown when they quoted, and deleting the
attachment rows underneath it would rewrite that record. The photograph goes; the fact that a
photograph existed, and its hash, stays.

## Nothing here runs on a schedule against personal content

The attachment sweep does — bytes on a long-closed request are storage nobody is reading — but
redaction of a request is only ever an **audited Operations command with an actor and a reason**.
An automatic redaction is a silent one, and "when did my description disappear" would have no
answer.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.cases.models import TERMINAL_CASE_STATUSES, OperationsCase
from apps.commerce.models import FinancialException, PaymentAttempt, Refund
from apps.identity.models import AccessAuditEvent, User
from apps.identity.services import record_access_event
from apps.payouts.models import PartnerLedgerEntry
from apps.requirements.exceptions import RequirementNotFoundError
from apps.requirements.models import (
    BookingFee,
    CustomerRequirement,
    Engagement,
    EngagementStage,
    QuoteUnlock,
    RequirementAttachment,
    RequirementQuestion,
    VisitPlan,
    VisitPlanShare,
)
from apps.requirements.services import record_transition
from apps.requirements.storage import DocumentStorageError, get_attachment_storage
from common.observability.context import get_request_id
from common.observability.metrics import M2Metric, emit

#: What a redacted free-text field is replaced with. Visible on purpose: a blank field says "they
#: typed nothing" and this says "they typed something and we removed it at their request", and an
#: operator reading a timeline six months later needs to be able to tell those apart.
REDACTION_MARKER = "[removed at the customer's request]"

#: Engagement statuses in which money can still move, so the requirement behind them is held.
#: `CLOSED` and `CANCELLED` are the only two in which nothing further can happen.
LIVE_ENGAGEMENT_STATUSES: tuple[str, ...] = tuple(
    status
    for status in Engagement.Status.values
    if status not in (Engagement.Status.CLOSED, Engagement.Status.CANCELLED)
)

#: Ledger statuses in which a vendor is still owed something, or something is still reserved for
#: them. `PAID` and `RELEASED` are settled.
UNSETTLED_LEDGER_STATUSES: tuple[str, ...] = (
    PartnerLedgerEntry.Status.PENDING,
    PartnerLedgerEntry.Status.AVAILABLE,
    PartnerLedgerEntry.Status.RESERVED,
)


@dataclass(frozen=True, slots=True)
class FinancialHold:
    """One reason this request's records may not be removed, in words an operator can relay."""

    #: A stable machine name. Alerts and the Operations screen key off this, never off `detail`.
    kind: str
    detail: str
    #: The row that holds it, so somebody can go and look at the thing rather than trust a summary.
    reference_id: uuid.UUID | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "detail": self.detail,
            "reference_id": str(self.reference_id) if self.reference_id is not None else None,
        }


@dataclass(frozen=True, slots=True)
class RedactionResult:
    """What a redaction removed, and what stopped it removing more."""

    requirement_id: uuid.UUID
    redacted_at: Any
    questions_redacted: int
    attachments_purged: int
    attachments_left_in_storage: int
    holds: tuple[FinancialHold, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "requirement_id": str(self.requirement_id),
            "redacted_at": self.redacted_at,
            "questions_redacted": self.questions_redacted,
            "attachments_purged": self.attachments_purged,
            "attachments_left_in_storage": self.attachments_left_in_storage,
            "holds": [hold.as_dict() for hold in self.holds],
        }


# ---------------------------------------------------------------------------
# The holds
# ---------------------------------------------------------------------------


def _payment_attempt_ids(requirement: CustomerRequirement) -> set[uuid.UUID]:
    """Every standalone M2 charge on this request, through the three product tables.

    Three lookups rather than a denormalised `requirement_id` on `PaymentAttempt`, for exactly the
    reason `reconciliation._requirement_for_attempt` gives: the products genuinely hang off three
    different tables and a fourth copy of that fact is a fourth thing that can drift.
    """
    ids: set[uuid.UUID] = set()
    for model in (BookingFee, QuoteUnlock, VisitPlan):
        ids |= {
            attempt_id
            for attempt_id in model.objects.filter(requirement=requirement).values_list(
                "payment_attempt_id", flat=True
            )
            if attempt_id is not None
        }
    return ids


def _statutory_hold(requirement: CustomerRequirement) -> FinancialHold | None:
    """The books' own retention schedule, which the owner has not set.

    `M2_FINANCIAL_RECORD_RETENTION_DAYS` defaults to `0`, and `0` means **unset, so the hold never
    lapses** — not "no retention". That direction is the only defensible one: the schedule is a
    legal question (`apps.identity.retention` records the same gap for verified KYC and refuses to
    guess it too), and a code default here would decide how long this business keeps its financial
    records, on the day somebody asks for their data to be removed.
    """
    if not _payment_attempt_ids(requirement):
        return None
    days = int(getattr(settings, "M2_FINANCIAL_RECORD_RETENTION_DAYS", 0) or 0)
    if days <= 0:
        return FinancialHold(
            kind="statutory_retention_unset",
            detail=(
                "This request carries a payment record. The financial retention schedule has not "
                "been approved yet, so the record is kept and only the personal content is removed."
            ),
            reference_id=requirement.id,
        )
    settled_before = timezone.now() - timedelta(days=days)
    if PaymentAttempt.objects.filter(
        id__in=_payment_attempt_ids(requirement), created_at__gte=settled_before
    ).exists():
        return FinancialHold(
            kind="statutory_retention",
            detail=(
                f"This request carries a payment record inside the {days}-day financial "
                "retention window."
            ),
            reference_id=requirement.id,
        )
    return None


def _has_unsettled_payout(
    *, requirement: CustomerRequirement, engagement: Engagement | None
) -> bool:
    """Whether any vendor is still owed money that this request earned them.

    Reached through the **four M2 rows that hold a `ledger_entry` foreign key** — the visit share,
    the shift-day or milestone stage, the booking fee's travel compensation, and the engagement's
    warranty retention — rather than through a `source_id` on `PartnerLedgerEntry`, because there is
    no such column: M2 entries are keyed by an `idempotency_key` string (`m2-visit-share:{id}`), and
    parsing money out of a string key is not a thing to build a retention decision on.

    All four are checked. Missing one would mean an erasure request could purge the evidence behind
    a payout somebody has not received, and the warranty retention in particular is the one held
    longest — for months after the work finished, which is exactly when an erasure request arrives.
    """
    if VisitPlanShare.objects.filter(
        plan__requirement=requirement,
        ledger_entry__status__in=UNSETTLED_LEDGER_STATUSES,
    ).exists():
        return True
    if BookingFee.objects.filter(
        requirement=requirement,
        ledger_entry__status__in=UNSETTLED_LEDGER_STATUSES,
    ).exists():
        return True
    if engagement is None:
        return False
    retention_entry = engagement.retention_ledger_entry
    if retention_entry is not None and retention_entry.status in UNSETTLED_LEDGER_STATUSES:
        return True
    return EngagementStage.objects.filter(
        engagement=engagement,
        ledger_entry__status__in=UNSETTLED_LEDGER_STATUSES,
    ).exists()


def financial_holds(requirement: CustomerRequirement) -> list[FinancialHold]:
    """Every reason this request's records outrank an erasure request. Empty means none apply.

    Read-only, and deliberately exhaustive rather than short-circuiting on the first hit: an
    operator answering a Customer needs to be able to say *everything* that is holding their data,
    because clearing one and being told about the next one is a worse conversation twice.
    """
    holds: list[FinancialHold] = []

    engagement = Engagement.objects.filter(
        requirement=requirement, status__in=LIVE_ENGAGEMENT_STATUSES
    ).first()
    if engagement is not None:
        holds.append(
            FinancialHold(
                kind="live_engagement",
                detail=f"An engagement on this request is {engagement.status}.",
                reference_id=engagement.id,
            )
        )

    unsettled_fee = (
        BookingFee.objects.filter(requirement=requirement)
        .exclude(status__in=BookingFee.SETTLED_STATUSES)
        .first()
    )
    if unsettled_fee is not None:
        holds.append(
            FinancialHold(
                kind="unsettled_booking_fee",
                detail=f"The booking fee is {unsettled_fee.status} and has not settled.",
                reference_id=unsettled_fee.id,
            )
        )

    attempt_ids = _payment_attempt_ids(requirement)
    if attempt_ids:
        exception = FinancialException.objects.filter(
            payment_attempt_id__in=attempt_ids, status=FinancialException.Status.OPEN
        ).first()
        if exception is not None:
            holds.append(
                FinancialHold(
                    kind="open_financial_exception",
                    detail=f"An unresolved money exception ({exception.code}) is open.",
                    reference_id=exception.id,
                )
            )
        refund = Refund.objects.filter(
            payment_attempt_id__in=attempt_ids,
            status__in=(
                Refund.Status.REQUESTED,
                Refund.Status.PROCESSING,
                Refund.Status.FAILED,
                Refund.Status.UNDER_REVIEW,
            ),
        ).first()
        if refund is not None:
            holds.append(
                FinancialHold(
                    kind="refund_in_flight",
                    detail=f"A refund on this request is {refund.status}.",
                    reference_id=refund.id,
                )
            )

    case = (
        OperationsCase.objects.filter(requirement=requirement)
        .exclude(status__in=TERMINAL_CASE_STATUSES)
        .first()
    )
    if case is not None:
        holds.append(
            FinancialHold(
                kind="open_case",
                detail=f"An open {case.kind} case is being worked on.",
                reference_id=case.id,
            )
        )

    if _has_unsettled_payout(requirement=requirement, engagement=engagement):
        holds.append(
            FinancialHold(
                kind="unsettled_payout",
                detail="A vendor is still owed money earned on this request.",
                reference_id=engagement.id if engagement is not None else requirement.id,
            )
        )

    statutory = _statutory_hold(requirement)
    if statutory is not None:
        holds.append(statutory)
    return holds


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------


def _redact_answers(answers: dict[str, Any]) -> dict[str, Any]:
    """Replace free-text answers; keep everything a price was calculated from.

    Type is the test, not the key name. A string answer is prose somebody typed; a number, a
    boolean and a list of choice codes are the structured facts the A3 preset priced and the A5
    estimate was written against, and removing those would make a settled booking unauditable.
    """
    return {
        key: (REDACTION_MARKER if isinstance(value, str) and value.strip() else value)
        for key, value in answers.items()
    }


def _purge_attachments(requirement: CustomerRequirement) -> tuple[int, int]:
    """Delete the stored objects. Returns `(purged, left in storage)`.

    A storage failure is **not** an error here. The row is left unpurged and counted, so the sweep
    picks it up again on its next pass — the alternative is failing the whole redaction because one
    object could not be reached, which would leave the Customer's description intact as well.
    """
    purged = 0
    failed = 0
    provider = None
    attachments = list(
        RequirementAttachment.objects.filter(requirement=requirement, purged_at__isnull=True)
    )
    if not attachments:
        return 0, 0
    try:
        provider = get_attachment_storage()
    except Exception:
        return 0, len(attachments)
    now = timezone.now()
    for attachment in attachments:
        try:
            provider.delete_object(object_key=attachment.object_key)
        except DocumentStorageError:
            failed += 1
            continue
        attachment.purged_at = now
        attachment.transcript = ""
        attachment.save(update_fields=("purged_at", "transcript"))
        purged += 1
    return purged, failed


@transaction.atomic
def redact_requirement(*, requirement_id: uuid.UUID, actor: User, reason: str) -> RedactionResult:
    """Scrub the personal content of one request. Never touches a money row.

    Idempotent: a second call on an already-redacted request re-runs the attachment purge (a
    storage failure may have left objects behind) and rewrites nothing else, because there is
    nothing left to rewrite.
    """
    requirement = CustomerRequirement.objects.select_for_update().filter(pk=requirement_id).first()
    if requirement is None:
        raise RequirementNotFoundError()

    holds = tuple(financial_holds(requirement))
    now = timezone.now()

    requirement.additional_details = REDACTION_MARKER if requirement.additional_details else ""
    requirement.answers = _redact_answers(requirement.answers or {})
    requirement.redacted_at = now
    requirement.save(update_fields=("additional_details", "answers", "redacted_at", "updated_at"))

    questions = 0
    for question in RequirementQuestion.objects.filter(requirement=requirement):
        question.question = REDACTION_MARKER if question.question else ""
        question.answer = REDACTION_MARKER if question.answer else ""
        question.save(update_fields=("question", "answer"))
        questions += 1

    purged, left = _purge_attachments(requirement)

    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="retention_redacted",
        reason=reason.strip()[:480],
    )
    record_access_event(
        actor=actor,
        subject_user=requirement.customer,
        action="retention.requirement_redacted",
        object_type="CustomerRequirement",
        object_id=requirement.id,
        decision=AccessAuditEvent.Decision.ALLOWED,
        request_id=get_request_id() or "",
        metadata={
            "questions_redacted": questions,
            "attachments_purged": purged,
            "attachments_left_in_storage": left,
            "holds": [hold.kind for hold in holds],
        },
    )
    emit(
        M2Metric.SUBJECT_REDACTED,
        archetype=requirement.archetype,
        questions_redacted=questions,
        attachments_purged=purged,
        attachments_left_in_storage=left,
        holds=len(holds),
    )
    return RedactionResult(
        requirement_id=requirement.id,
        redacted_at=now,
        questions_redacted=questions,
        attachments_purged=purged,
        attachments_left_in_storage=left,
        holds=holds,
    )


def handle_erasure_request(
    *, requirement_id: uuid.UUID, actor: User, reason: str
) -> RedactionResult:
    """The one entry point for "remove my data about this request".

    Always redacts, and **reports** the holds rather than refusing on them. That asymmetry is the
    task's own instruction turned into behaviour: a hold outranks *deletion*, not the Customer's
    right to have their personal content removed, and the two are different asks that a single
    refusal would have collapsed into one.

    So the Customer always gets what can be given, and the operator gets a list of exactly what is
    being kept and why, in words they can relay.
    """
    result = redact_requirement(requirement_id=requirement_id, actor=actor, reason=reason)
    if result.holds:
        emit(
            M2Metric.DELETION_BLOCKED_BY_HOLD,
            value=len(result.holds),
            kinds=[hold.kind for hold in result.holds],
        )
    return result


# ---------------------------------------------------------------------------
# The scheduled half: attachment bytes on long-closed requests
# ---------------------------------------------------------------------------


def attachments_due_for_purge(*, at: Any = None) -> list[uuid.UUID]:
    """Requirements whose attachment bytes have outlived their purpose. Ids, not rows.

    Bounded by `M2_ATTACHMENT_RETENTION_DAYS` after **close**, not after upload: an attachment is
    read by vendors for as long as the request is live, and a request can legitimately stay open
    for weeks. Anything under a financial hold is skipped by `purge_expired_attachments`, which is
    what stops this from destroying the evidence in an open dispute.
    """
    days = int(getattr(settings, "M2_ATTACHMENT_RETENTION_DAYS", 0) or 0)
    if days <= 0:
        return []
    cutoff = (at or timezone.now()) - timedelta(days=days)
    return list(
        CustomerRequirement.objects.filter(
            status__in=CustomerRequirement.CLOSED_STATUSES,
            closed_at__lt=cutoff,
            attachments__purged_at__isnull=True,
        )
        .distinct()
        .values_list("id", flat=True)
    )


def purge_expired_attachments(*, limit: int = 200) -> dict[str, int]:
    """Delete stored objects for long-closed requests. Skips anything under a financial hold.

    Deliberately not `redact_requirement`: this removes **bytes only** and leaves the Customer's
    own description and answers alone. A retention sweep is not an erasure request, and quietly
    scrubbing a Customer's words because time passed is not something a schedule should do.
    """
    purged = 0
    skipped = 0
    left = 0
    for requirement_id in attachments_due_for_purge()[:limit]:
        requirement = CustomerRequirement.objects.filter(pk=requirement_id).first()
        if requirement is None:
            continue
        if financial_holds(requirement):
            skipped += 1
            continue
        one_purged, one_left = _purge_attachments(requirement)
        purged += one_purged
        left += one_left
    if purged:
        emit(M2Metric.ATTACHMENT_ACCESS_EXPIRED, value=purged, held_back=skipped, failed=left)
    return {"purged": purged, "held": skipped, "failed": left}
