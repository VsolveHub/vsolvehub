"""Linked cases, evidence and the automatic payout hold (`M2-BE-703`, `704`, `709`).

**This module opens no case queue of its own.** `apps.cases` already owns the queue, the severity
SLA, the required terminal result per kind, the append-only event trail and the `holds_payout`
column the payout selector reads. Wave C6 extended that table with the two M2 subjects rather than
building a second one beside it — an operator with two inboxes has none — and everything here is
the M2 side of the same decision: which M2 events open a case, what the case is about, and what
happens to the vendor's money while it is open.

Three rules run through it:

**A case is opened by the event, not by a person noticing.** `07-state-machines-and-permissions.md`
never lets a dispute be a status somebody forgot to set. Every trigger below is called from the
command that produced the fact, in that command's transaction, with an idempotency key derived
from the causing row — so a retried webhook, a second tap and a re-driven sweep all reach one case.

**Holding money is automatic; releasing it is not.** `M2-BE-709`: a qualifying case holds the
vendor's unpaid earnings the moment it opens, and they are released only when the case closes and
no other open case is still holding them. Nothing here reverses a payout that has already left —
`04-acceptance-and-cutover.md` `M2-AC-711` is explicit that a reversal after payout is a
reconciliation exception rather than a status flip, because the money is gone and pretending
otherwise would make a ledger that does not match a bank.

**Wages are not in scope and cannot be.** A3 wages are peer-to-peer and the platform never holds
them, so no hold here can reach them: the entries this module freezes are the four M2 earnings
that exist as `PartnerLedgerEntry` rows — a stage payout, a visit share, a warranty retention and
a booking-fee travel compensation — and a shift-day's wage is none of them.
"""

import uuid
from datetime import datetime
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.cases import services as case_services
from apps.cases.models import TERMINAL_CASE_STATUSES, OperationsCase, OperationsCaseEvidence
from apps.identity.models import User
from apps.payouts.models import PartnerLedgerEntry
from apps.requirements import pricing
from apps.requirements.exceptions import (
    PolicyUnavailableError,
    RequirementNotFoundError,
    RequirementTransitionError,
)
from apps.requirements.models import (
    BookingFee,
    CustomerRequirement,
    Engagement,
    EngagementStage,
    RequirementAttachment,
    StageEvidence,
    VisitPlanShare,
)

#: Ledger statuses a case may freeze. `RESERVED` and `PAID` are deliberately absent: a reserved
#: entry is inside a payout batch that may already have been submitted to the provider, and a paid
#: one has left. Freezing either would make the ledger disagree with the bank, which is the one
#: failure reconciliation cannot repair.
FREEZABLE_LEDGER_STATUSES = (
    PartnerLedgerEntry.Status.AVAILABLE,
    PartnerLedgerEntry.Status.RELEASED,
)


# ---------------------------------------------------------------------------
# Which ledger entries belong to one M2 request
# ---------------------------------------------------------------------------


def engagement_ledger_entry_ids(
    *, requirement: CustomerRequirement | None, engagement: Engagement | None
) -> list[uuid.UUID]:
    """Every `PartnerLedgerEntry` this request has produced.

    Resolved through the relations that point at them — a stage's `ledger_entry`, an engagement's
    `retention_ledger_entry`, a visit share's, a booking fee's — rather than by matching on the
    `m2-` prefix of an idempotency key. A prefix match is a string convention that nothing
    enforces; a foreign key is a fact the database keeps.
    """
    entry_ids: list[uuid.UUID] = []
    if engagement is not None:
        entry_ids.extend(
            EngagementStage.objects.filter(
                engagement=engagement, ledger_entry__isnull=False
            ).values_list("ledger_entry_id", flat=True)
        )
        if engagement.retention_ledger_entry_id is not None:
            entry_ids.append(engagement.retention_ledger_entry_id)
        if requirement is None:
            requirement = engagement.requirement
    if requirement is not None:
        entry_ids.extend(
            VisitPlanShare.objects.filter(
                plan__requirement=requirement, ledger_entry__isnull=False
            ).values_list("ledger_entry_id", flat=True)
        )
        entry_ids.extend(
            BookingFee.objects.filter(
                requirement=requirement, ledger_entry__isnull=False
            ).values_list("ledger_entry_id", flat=True)
        )
    # `dict.fromkeys` rather than `set`, so the order a support conversation reads them in is
    # stable between two calls.
    return list(dict.fromkeys(entry_ids))


def _case_subjects(case: OperationsCase) -> tuple[CustomerRequirement | None, Engagement | None]:
    engagement = (
        Engagement.objects.filter(pk=case.engagement_id).select_related("requirement").first()
        if case.engagement_id is not None
        else None
    )
    requirement = (
        CustomerRequirement.objects.filter(pk=case.requirement_id).first()
        if case.requirement_id is not None
        else (engagement.requirement if engagement is not None else None)
    )
    return requirement, engagement


# ---------------------------------------------------------------------------
# The automatic hold (`M2-BE-709`)
# ---------------------------------------------------------------------------


@transaction.atomic
def hold_engagement_payouts(*, case: OperationsCase) -> list[uuid.UUID]:
    """Freeze this request's unpaid earnings, and record exactly which ones were frozen.

    Called from `cases.services.open_case` the moment a payout-holding case opens. The list is
    stored on the case because `PENDING` is overloaded: `stages._hold_stage_payout` writes every
    approved stage's earning `PENDING` to carry its own dispute window, so releasing "every
    `PENDING` entry on this engagement" at close would pay out stages whose window had not run.
    """
    requirement, engagement = _case_subjects(case)
    entry_ids = engagement_ledger_entry_ids(requirement=requirement, engagement=engagement)
    if not entry_ids:
        return []
    held: list[uuid.UUID] = []
    for entry in PartnerLedgerEntry.objects.select_for_update().filter(
        id__in=entry_ids, status__in=FREEZABLE_LEDGER_STATUSES
    ):
        entry.status = PartnerLedgerEntry.Status.PENDING
        entry.save(update_fields=("status", "updated_at"))
        held.append(entry.id)
    if held:
        case.held_ledger_entry_ids = [str(value) for value in held]
        case.save(update_fields=("held_ledger_entry_ids", "updated_at"))
    return held


@transaction.atomic
def release_engagement_payouts(*, case: OperationsCase) -> list[uuid.UUID]:
    """Unfreeze what this case froze, and nothing else.

    Only the entries recorded at hold time, only while they are still `PENDING`, and only when the
    caller has already established that no other open case is holding the same subject.
    """
    recorded = [uuid.UUID(str(value)) for value in case.held_ledger_entry_ids or []]
    if not recorded:
        return []
    released: list[uuid.UUID] = []
    for entry in PartnerLedgerEntry.objects.select_for_update().filter(
        id__in=recorded, status=PartnerLedgerEntry.Status.PENDING
    ):
        entry.status = PartnerLedgerEntry.Status.AVAILABLE
        entry.save(update_fields=("status", "updated_at"))
        released.append(entry.id)
    return released


# ---------------------------------------------------------------------------
# Opening a linked case (`M2-BE-703`)
# ---------------------------------------------------------------------------


def _response_deadline(requirement: CustomerRequirement | None) -> datetime | None:
    if requirement is None:
        return None
    try:
        return pricing.case_response_deadline(requirement)
    except PolicyUnavailableError:
        # The variant has no active configuration at all. A case still opens — refusing to record
        # a safety report because a catalog row was retired is not a trade this platform makes.
        return None


@transaction.atomic
def open_linked_case(
    *,
    kind: str,
    summary: str,
    source_kind: str,
    source_id: uuid.UUID,
    requirement: CustomerRequirement | None = None,
    engagement: Engagement | None = None,
    severity: str = OperationsCase.Severity.NORMAL,
    detail: str = "",
    opened_by: User | None = None,
) -> OperationsCase:
    """Open one case about one M2 request, once per causing row.

    The idempotency key is `{source_kind}:{source_id}`, so the second delivery of the webhook, the
    second tap and the sweep that passes over the same row all find the case the first one opened.
    That is the same rule `partners.standing.record_event` follows and for the same reason: a
    duplicate case is not merely untidy, it is a second deadline against the same event and a
    second payout hold that outlives the first one's release.

    The **engagement** is preferred as the subject when there is one, because that is what a payout
    hangs off; a requirement with no engagement yet has no vendor earnings to freeze, and its cases
    are about matching rather than money.
    """
    if requirement is None and engagement is None:
        raise RequirementNotFoundError()
    if engagement is not None and requirement is None:
        requirement = engagement.requirement
    return case_services.open_case(
        kind=kind,
        summary=summary[:240],
        severity=severity,
        detail=detail,
        requirement_id=None
        if engagement is not None
        else (requirement.id if requirement else None),
        engagement_id=engagement.id if engagement is not None else None,
        opened_by=opened_by,
        response_due_at=_response_deadline(requirement),
        idempotency_key=f"m2:{source_kind}:{source_id}",
    )


def open_attendance_case(
    *, stage: EngagementStage, opened_by: User | None, detail: str = ""
) -> OperationsCase:
    """`M2-AC-513`: conflicting attendance claims open a case and hold settlement."""
    return open_linked_case(
        kind=OperationsCase.Kind.ATTENDANCE,
        summary=f"Attendance disputed on day {stage.position}",
        source_kind="shift_attendance",
        source_id=stage.id,
        engagement=stage.engagement,
        severity=OperationsCase.Severity.HIGH,
        detail=detail,
        opened_by=opened_by,
    )


def open_stage_case(
    *, stage: EngagementStage, opened_by: User | None, detail: str = ""
) -> OperationsCase:
    """The case behind a disputed stage, which Wave C5 recorded as missing.

    `m2_stage_dispute_resolve` has been drivable since 1.25.0 and had nothing behind it: a stage
    could be disputed, and the dispute existed only as a status. Now the dispute opens a case with
    an owner, a deadline and a payout hold, and resolving the stage and closing the case are two
    decisions rather than one operator's memory.
    """
    return open_linked_case(
        kind=OperationsCase.Kind.STAGE,
        summary=f"Stage {stage.position} disputed: {stage.label}"[:240],
        source_kind="engagement_stage",
        source_id=stage.id,
        engagement=stage.engagement,
        severity=OperationsCase.Severity.HIGH,
        detail=detail,
        opened_by=opened_by,
    )


def open_off_platform_case(
    *,
    engagement: Engagement,
    source_kind: str,
    source_id: uuid.UUID,
    summary: str,
    opened_by: User | None,
    detail: str = "",
) -> OperationsCase:
    """`M2-AC-705`/`706`: either party may claim the money went around the platform.

    Symmetrical on purpose. The Customer reporting a demand for cash and the Partner claiming they
    were forced to take it off-platform open the **same kind of case with the same evidence
    process**, because a platform whose complaint machinery only ran in one direction would be
    deciding the question by whose complaint it accepted.
    """
    return open_linked_case(
        kind=OperationsCase.Kind.OFF_PLATFORM,
        summary=summary,
        source_kind=source_kind,
        source_id=source_id,
        engagement=engagement,
        severity=OperationsCase.Severity.HIGH,
        detail=detail,
        opened_by=opened_by,
    )


@transaction.atomic
def raise_warranty_claim(
    *, engagement_id: uuid.UUID, actor: User, summary: str, detail: str = ""
) -> OperationsCase:
    """The Customer says something the vendor delivered has gone wrong inside the warranty window.

    **This closes a hole the Customer column found while building `M2-FE-611`, and it was a real
    one.** `M2-BE-546` holds a retention back out of the vendor's payout against a warranty
    promise, and until now there was no way for the Customer to call on that promise: `m2_stage_
    dispute` accepts only a stage in `AWAITING_REVIEW`, and by warranty time every stage is settled
    by definition, so it refused by construction; `/operations/cases/` is staff-only, so the
    Customer could not open a case themselves. Money was being held for a promise the product could
    not accept a call against.

    `QUALITY` rather than a new kind, because the M1 case type already means exactly this and
    already carries the three terminal results a warranty claim can have — a callback was booked,
    it was settled, or it was denied with a reason. It is also already a payout-holding kind, which
    is the second half of the fix: **opening the claim freezes the retention**, since
    `engagement_ledger_entry_ids` includes `Engagement.retention_ledger_entry`. Before this, a
    retention could be released by the warranty sweep while a Customer was on the phone about the
    very defect it was held for.

    The window is the engagement's own `warranty_ends_at`, which `_open_warranty_window` stamped
    from the variant's configured days. No new clock, no new owner-blocked value.
    """
    engagement = (
        Engagement.objects.select_for_update(of=("self",))
        .select_related("requirement", "partner")
        .filter(pk=engagement_id)
        .first()
    )
    if engagement is None or engagement.customer_id != actor.id:
        raise RequirementNotFoundError()
    if not summary.strip():
        raise RequirementTransitionError("A warranty claim needs a description.")
    if engagement.warranty_ends_at is None:
        raise RequirementTransitionError(
            "This job carries no warranty period, so there is nothing to claim against.",
        )
    if engagement.status not in (
        Engagement.Status.WARRANTY,
        Engagement.Status.COMPLETED,
        Engagement.Status.CLOSED,
    ):
        raise RequirementTransitionError(
            "The warranty starts when the job is complete. Raise a stage dispute instead.",
        )
    if timezone.now() > engagement.warranty_ends_at:
        raise RequirementTransitionError("The warranty period on this job has ended.")

    # Keyed on the engagement **and the claim's own text**, so a Customer with two genuinely
    # different defects gets two cases, while a double tap on one gets one. The alternative — one
    # case per engagement forever — would fold a second problem into a resolved first one.
    return open_linked_case(
        kind=OperationsCase.Kind.QUALITY,
        summary=f"Warranty claim: {summary.strip()}",
        source_kind="warranty_claim",
        source_id=uuid.uuid5(uuid.UUID(str(engagement.id)), summary.strip()[:200]),
        engagement=engagement,
        severity=OperationsCase.Severity.HIGH,
        detail=detail.strip(),
        opened_by=actor,
    )


def engagement_has_open_warranty_claim(engagement: Engagement) -> bool:
    """Whether a warranty claim is still being worked on this engagement.

    Read by `stages.close_warranty_window`: a retention released while somebody is disputing the
    work it was held against is the one failure retention exists to prevent, and Wave C5 could not
    guard it because there was no way to raise the claim.
    """
    return (
        OperationsCase.objects.filter(
            engagement=engagement,
            kind=OperationsCase.Kind.QUALITY,
            holds_payout=True,
        )
        .exclude(status__in=tuple(TERMINAL_CASE_STATUSES))
        .exists()
    )


def open_no_show_case(
    *,
    requirement: CustomerRequirement,
    engagement: Engagement | None,
    party: str,
    source_kind: str,
    source_id: uuid.UUID,
    opened_by: User | None = None,
) -> OperationsCase:
    """A crew or a Customer was not there on day one.

    Opened even though the money settles automatically, because the money is not the whole of it:
    a vendor no-show costs the Customer a day and a Customer no-show costs a lead one, and both
    need somebody to ring somebody. `LATE_NO_SHOW` rather than a new kind — the M1 case type
    already means exactly this and already has its required terminal results.
    """
    label = "Crew did not arrive" if party == "VENDOR" else "Customer was not there"
    return open_linked_case(
        kind=OperationsCase.Kind.LATE_NO_SHOW,
        summary=f"{label} on day one",
        source_kind=source_kind,
        source_id=source_id,
        requirement=requirement,
        engagement=engagement,
        severity=OperationsCase.Severity.URGENT,
        opened_by=opened_by,
    )


# ---------------------------------------------------------------------------
# Evidence, deadlines and appeals (`M2-BE-704`)
# ---------------------------------------------------------------------------


def case_for_participant(*, user: User, case_id: uuid.UUID) -> OperationsCase:
    """The case, if this person is one of the two parties to it.

    `404` rather than `403` where existence itself is private, per
    `07-state-machines-and-permissions.md` §7: telling a stranger that a case exists about a
    request they have nothing to do with is itself the leak.
    """
    case = (
        OperationsCase.objects.select_related("requirement", "engagement__partner")
        .filter(pk=case_id)
        .first()
    )
    if case is None:
        raise RequirementNotFoundError()
    if _party_for(case=case, user=user) is None:
        raise RequirementNotFoundError()
    return case


def _party_for(*, case: OperationsCase, user: User) -> str | None:
    """Which side of this case the caller is on, or `None` if they are on neither."""
    engagement = case.engagement
    if engagement is not None:
        if engagement.customer_id == user.id:
            return OperationsCaseEvidence.Party.CUSTOMER
        partner = engagement.partner
        if partner is not None and partner.user_id == user.id:
            return OperationsCaseEvidence.Party.PARTNER
    requirement = case.requirement
    if requirement is not None and requirement.customer_id == user.id:
        return OperationsCaseEvidence.Party.CUSTOMER
    return None


@transaction.atomic
def submit_evidence(
    *,
    case_id: uuid.UUID,
    actor: User,
    statement: str = "",
    requirement_attachment_id: uuid.UUID | None = None,
    stage_evidence_id: uuid.UUID | None = None,
) -> OperationsCaseEvidence:
    """A party puts something in front of the decision.

    Both artifact references are re-checked against **this** case's request before the row is
    written. Without that check a case id plus a guessed attachment id would let one Customer pull
    another Customer's photograph into a case they can read — the object-level rule 07 §7 states,
    applied to the join rather than only to the endpoint.
    """
    case = case_for_participant(user=actor, case_id=case_id)
    party = _party_for(case=case, user=actor)
    if party is None:  # pragma: no cover - `case_for_participant` already refused
        raise RequirementNotFoundError()
    requirement, engagement = _case_subjects(case)
    if requirement_attachment_id is not None:
        owned = RequirementAttachment.objects.filter(
            pk=requirement_attachment_id, requirement=requirement
        ).exists()
        if not owned:
            raise RequirementNotFoundError()
    if stage_evidence_id is not None:
        owned = StageEvidence.objects.filter(
            pk=stage_evidence_id, stage__engagement=engagement
        ).exists()
        if not owned:
            raise RequirementNotFoundError()
    return case_services.submit_case_evidence(
        case_id=case.id,
        party=party,
        actor=actor,
        statement=statement,
        requirement_attachment_id=requirement_attachment_id,
        stage_evidence_id=stage_evidence_id,
    )


@transaction.atomic
def request_appeal(*, case_id: uuid.UUID, actor: User, reason: str) -> OperationsCase:
    """A party challenges a decision. Reads the window fail-closed on a resolved case."""
    case = case_for_participant(user=actor, case_id=case_id)
    deadline: datetime | None = None
    if case.status == OperationsCase.Status.RESOLVED:
        requirement, _engagement = _case_subjects(case)
        if requirement is None:  # pragma: no cover - an M2 case always has one
            raise RequirementTransitionError("This case cannot be appealed.")
        if case.resolved_at is None:  # pragma: no cover - RESOLVED always stamps it
            raise RequirementTransitionError("This case cannot be appealed.")
        deadline = pricing.case_appeal_deadline(requirement, resolved_at=case.resolved_at)
    return case_services.request_case_appeal(
        case_id=case.id,
        actor=actor,
        reason=reason,
        appeal_deadline=deadline,
    )


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def request_cases(requirement: CustomerRequirement) -> list[OperationsCase]:
    """Every case about this request, whichever subject it was opened against.

    Both halves of the `Q` matter: a case opened before the engagement existed is about the
    requirement, and one opened afterwards is about the engagement. A timeline that read only the
    second would lose every matching-stage dispute the moment work started.
    """
    return list(
        OperationsCase.objects.filter(
            Q(requirement=requirement) | Q(engagement__requirement=requirement)
        ).order_by("-created_at")
    )


def case_payload(case: OperationsCase) -> dict[str, Any]:
    """One case, as a party may read it.

    Deliberately **not** `OperationsCaseSerializer`: that projection has exactly one audience and
    is documented as such — it can quote a Customer's complaint verbatim and name a Partner in a
    safety report. What a party gets is their own view of a case about them: what it is, when they
    have to answer, what they showed, and what was decided. Never the internal notes, never the
    owning team, never the other side's statements.
    """
    return {
        "id": str(case.id),
        "kind": case.kind,
        "status": case.status,
        "summary": case.summary,
        "opened_at": case.created_at,
        "response_due_at": case.response_due_at,
        "resolution": case.resolution,
        "resolved_at": case.resolved_at,
        "appeal_requested_at": case.appeal_requested_at,
        "appeal_outcome": case.appeal_outcome,
        "holds_payout": case.holds_payout,
        "server_now": timezone.now(),
    }
