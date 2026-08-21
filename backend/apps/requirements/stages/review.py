"""The Customer's half of the spine: approve, send back, dispute — and the clock that decides.

Everything that happens to a stage sitting at `AWAITING_REVIEW`. Four ways out and one of them is
silence: `approve_stage`, `request_stage_correction`, `dispute_stage`, and `expire_stage_review`
for a review window that closed with nobody saying anything. `resolve_stage_dispute` is the
Operations tail on the third of those, and `_approve` is the single implementation all three
approving paths land on, because the money consequence is identical however approval was reached.

The commission and retention allocators live here rather than in `base` for that reason: they are
read only by `_hold_stage_payout`, which is read only by `_approve`. Approval is the moment an A5
earning is written, so the arithmetic that decides its size belongs beside the decision.

Where the boundary falls: this slice writes the vendor's earning **held**. Making it payable, and
everything downstream of that, is `release`.
"""

import uuid
from typing import Final

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.payouts.models import PartnerLedgerEntry
from apps.requirements import pricing
from apps.requirements.exceptions import (
    StageDisputedError,
    StageTransitionError,
)
from apps.requirements.models import (
    Engagement,
    EngagementStage,
)

from .base import _assert_engagement_live, _locked_stage, add_engagement_money, record_event
from .release import _release, _release_stage_ledger_hold

# ---------------------------------------------------------------------------
# Review: approve, request correction, dispute (`M2-BE-503`)
# ---------------------------------------------------------------------------


def _stage_commission_paise(*, engagement: Engagement, stage: EngagementStage) -> int:
    """This stage's share of the engagement's commission, in paise, allocated cumulatively.

    Not `commission * amount // staged_total` per stage: independent floor divisions leave a
    remainder that belongs to nobody, and a project with eleven milestones would under-book
    Vsolve's commission by up to ten paise with no row explaining where it went.

    Allocating against the cumulative approved total instead means the last stage picks up exactly
    the accumulated remainder, and `Σ stage commissions == engagement.commission_paise` when every
    stage is approved — without special-casing which stage happens to be last, which stops being
    knowable the moment an amendment appends one.
    """
    if engagement.commercial_mode == Engagement.CommercialMode.LEAD_ONLY:
        return 0
    if engagement.commission_paise <= 0 or engagement.staged_total_paise <= 0:
        return 0
    already = (
        EngagementStage.objects.filter(
            engagement=engagement,
            ledger_entry__isnull=False,
        ).aggregate(total=Sum("ledger_entry__commission_paise"))["total"]
        or 0
    )
    approved_after = engagement.approved_total_paise + stage.amount_paise
    target = engagement.commission_paise * approved_after // engagement.staged_total_paise
    return max(min(target, engagement.commission_paise) - already, 0)


def _stage_retention_paise(*, engagement: Engagement, stage: EngagementStage) -> int:
    """How much of this stage's payout is held back for the warranty window (`M2-BE-546`).

    `M2-BE-546` says the retention is held back **from the final stage**, and the obvious reading
    — "when approving the last stage, subtract the retention" — does not survive contact with the
    amendment engine: an additive amendment appends a stage, so which stage is last stops being
    knowable the moment somebody accepts one, and a retention already released out of what turned
    out not to be the final milestone cannot be un-released.

    So the retention is allocated against the **cumulative** approved total, exactly as
    `_stage_commission_paise` allocates commission and for exactly the same reason. The amount
    that should be held once `approved` of `staged` has been approved is

        max(0, retention - (staged - approved))

    which is zero for every early stage — there is plenty of work left to hold it out of — and
    reaches the full retention precisely when the last stage is approved, whichever stage that
    turns out to be. A retention larger than the final milestone simply starts biting a milestone
    earlier, which is the correct behaviour and needs no special case.
    """
    retention = engagement.retention_paise
    if retention <= 0 or engagement.staged_total_paise <= 0:
        return 0
    approved_before = engagement.approved_total_paise
    approved_after = approved_before + stage.amount_paise
    held_before = max(0, retention - (engagement.staged_total_paise - approved_before))
    held_after = max(0, retention - (engagement.staged_total_paise - approved_after))
    return max(min(held_after, retention) - held_before, 0)


def _hold_stage_payout(*, stage: EngagementStage, engagement: Engagement) -> PartnerLedgerEntry:
    """Write the vendor's earning for an approved stage, **held** (`M2-BE-507`).

    Through the M1 ledger, as a `PartnerLedgerEntry` with no Booking — the one-earning-per-Booking
    constraint is scoped to rows that have one, so a stage earning sits beside a technician's job
    earnings in the same statement and the same payout batch. This is the same shape
    `access._earn_share` uses for a visit payout, and for the same reason.

    Written `PENDING`, always. `PENDING` here carries the dispute window: the money is earned and
    is not yet payable. `release_stage_payout` moves it to `AVAILABLE` once the window closes and
    the vendor's payout account is verified — and if it never is, the entry stays `PENDING`
    indefinitely, which is the honest record. Deleting it to tidy a queue would be writing off
    somebody else's money.
    """
    existing = PartnerLedgerEntry.objects.filter(idempotency_key=f"m2-stage:{stage.id}").first()
    if existing is not None:
        return existing
    commission = _stage_commission_paise(engagement=engagement, stage=stage)
    # `M2-BE-546`. Retention comes out of the **gross**, not the net: it is the Customer's money
    # still, held against a warranty promise, and reducing the commission with it would hand back
    # part of Vsolve's fee every time a vendor's last milestone was retained.
    retained = _stage_retention_paise(engagement=engagement, stage=stage)
    gross = stage.amount_paise - retained
    entry = PartnerLedgerEntry.objects.create(
        partner=engagement.partner,
        booking=None,
        kind=PartnerLedgerEntry.Kind.EARNING,
        status=PartnerLedgerEntry.Status.PENDING,
        gross_paise=gross,
        commission_paise=commission,
        net_paise=gross - commission,
        calculation_snapshot={
            "source": "m2_engagement_stage",
            "engagement_id": str(engagement.id),
            "engagement_stage_id": str(stage.id),
            "position": stage.position,
            "stage_amount_paise": stage.amount_paise,
            "commission_paise": commission,
            "commission_treatment": engagement.commission_treatment,
            "engagement_commission_paise": engagement.commission_paise,
            "staged_total_paise": engagement.staged_total_paise,
            # What was held out of this stage and against which promise. A vendor reading a
            # statement has to be able to see why one milestone paid less than it was worth.
            "warranty_retention_withheld_paise": retained,
            "engagement_retention_paise": engagement.retention_paise,
        },
        reason=f"m2 stage {stage.position}",
        idempotency_key=f"m2-stage:{stage.id}",
    )
    if retained:
        add_engagement_money(engagement.id, retention_withheld_paise=retained)
    return entry


def _approve(*, stage: EngagementStage, actor: User | None, reason_code: str) -> EngagementStage:
    """The approval itself, shared by the Customer command, the timeout and the dispute outcome.

    One implementation because the money consequence is identical however approval was reached.
    Three copies of "write the earning, move the totals, maybe complete the engagement" is three
    places for the arithmetic to drift.
    """
    engagement = stage.engagement
    now = timezone.now()
    from_status = stage.status
    stage.status = EngagementStage.Status.APPROVED
    stage.approved_at = now
    stage.approved_amount_paise = stage.amount_paise
    stage.payout_release_due_at = pricing.stage_payout_hold_deadline(engagement.requirement, at=now)
    updates = [
        "status",
        "approved_at",
        "approved_amount_paise",
        "payout_release_due_at",
        "updated_at",
    ]
    if engagement.commercial_mode == Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED:
        stage.ledger_entry = _hold_stage_payout(stage=stage, engagement=engagement)
        updates.append("ledger_entry")
    stage.save(update_fields=tuple(updates))
    add_engagement_money(engagement.id, approved_total_paise=stage.amount_paise)
    record_event(
        engagement=engagement,
        stage=stage,
        from_status=from_status,
        to_status=stage.status,
        actor=actor,
        reason_code=reason_code,
    )

    if engagement.commercial_mode == Engagement.CommercialMode.LEAD_ONLY:
        # Nothing is held because nothing was collected. A3's service payment is between the
        # Customer and the vendor, so a dispute window over a payout Vsolve does not make would be
        # theatre — the stage is done the moment it is approved.
        return _release(stage=stage, actor=None, reason_code="stage_released_lead_only")
    return stage


@transaction.atomic
def approve_stage(*, stage_id: uuid.UUID, actor: User) -> EngagementStage:
    """The Customer accepts the work on one stage. `AWAITING_REVIEW → APPROVED`."""
    stage = _locked_stage(stage_id)
    _assert_engagement_live(stage.engagement)
    if stage.status in (EngagementStage.Status.APPROVED, EngagementStage.Status.RELEASED):
        return stage
    if stage.status == EngagementStage.Status.DISPUTED:
        raise StageDisputedError(
            "This stage is disputed. Withdraw the dispute or wait for the decision.",
        )
    if stage.status != EngagementStage.Status.AWAITING_REVIEW:
        raise StageTransitionError("This stage has nothing submitted to approve.")
    return _approve(stage=stage, actor=actor, reason_code="stage_approved")


@transaction.atomic
def settle_stage_with_project_completion_code(
    *, stage_id: uuid.UUID, customer: User
) -> EngagementStage:
    """Settle one funded A5 stage after the Customer shares the project-end code.

    The code is whole-project acceptance, so evidence and the ordinary review window are not
    prerequisites on this path. The money arithmetic remains the ordinary approval arithmetic;
    only the proof of acceptance changed. Release is immediate because the Customer has just
    explicitly signed off the whole project rather than entering a passive dispute window.
    """

    stage = _locked_stage(stage_id)
    _assert_engagement_live(stage.engagement)
    if stage.status == EngagementStage.Status.RELEASED:
        return stage
    if stage.status == EngagementStage.Status.DISPUTED:
        raise StageDisputedError("Resolve the disputed stage before completing this project.")
    if (
        stage.engagement.commercial_mode == Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED
        and stage.funding_state != EngagementStage.FundingState.FUNDED
    ):
        from apps.requirements.exceptions import StageNotFundedError  # noqa: PLC0415

        raise StageNotFundedError("Fund every agreed stage before completing this project.")

    approved = stage
    if stage.status != EngagementStage.Status.APPROVED:
        if stage.status not in (
            EngagementStage.Status.PENDING,
            EngagementStage.Status.IN_PROGRESS,
            EngagementStage.Status.AWAITING_REVIEW,
            EngagementStage.Status.CORRECTION_REQUESTED,
        ):
            raise StageTransitionError("This stage cannot be completed from its current state.")
        approved = _approve(
            stage=stage,
            actor=customer,
            reason_code="stage_approved_by_project_completion_code",
        )

    if approved.status == EngagementStage.Status.RELEASED:
        return approved
    released = _release(
        stage=approved,
        actor=customer,
        reason_code="stage_released_by_project_completion_code",
    )
    _release_stage_ledger_hold(released)
    return released


@transaction.atomic
def request_stage_correction(*, stage_id: uuid.UUID, actor: User, note: str) -> EngagementStage:
    """The Customer sends a stage back. `AWAITING_REVIEW → CORRECTION_REQUESTED`.

    **A correction is not an amendment.** It asks for the agreed work to be done properly; it does
    not change what the agreed work is, and it moves no money. A Customer who wants something
    different is asking for a change order, which is `apps.requirements.amendments` and needs the
    vendor's agreement (`M2-BE-508`).
    """
    stage = _locked_stage(stage_id)
    _assert_engagement_live(stage.engagement)
    if stage.status == EngagementStage.Status.CORRECTION_REQUESTED:
        return stage
    if stage.status != EngagementStage.Status.AWAITING_REVIEW:
        raise StageTransitionError("This stage has nothing submitted to send back.")
    if not note.strip():
        raise StageTransitionError("Say what needs correcting.")

    from_status = stage.status
    stage.status = EngagementStage.Status.CORRECTION_REQUESTED
    stage.correction_note = note.strip()
    # The review clock stops. It restarts from zero when the vendor resubmits, because the
    # Customer will be looking at different evidence.
    stage.review_due_at = None
    stage.save(update_fields=("status", "correction_note", "review_due_at", "updated_at"))
    record_event(
        engagement=stage.engagement,
        stage=stage,
        from_status=from_status,
        to_status=stage.status,
        actor=actor,
        reason_code="stage_correction_requested",
        reason=stage.correction_note,
    )
    return stage


@transaction.atomic
def dispute_stage(
    *, stage_id: uuid.UUID, actor: User, reason_code: str, note: str = ""
) -> EngagementStage:
    """The Customer formally objects. `AWAITING_REVIEW → DISPUTED`.

    A dispute stops **only the disputed allocation**. Every other stage of the engagement carries
    on, and any payout already released stays released — `README.md` is explicit that a stage
    disagreement blocks the disputed allocation where safe, not the whole agreement. The
    engagement moves to `DISPUTED` so both parties and Operations can see that something is open;
    it returns to `ACTIVE` when the last disputed stage is resolved.
    """
    stage = _locked_stage(stage_id)
    engagement = stage.engagement
    _assert_engagement_live(engagement)
    if stage.status == EngagementStage.Status.DISPUTED:
        return stage
    if stage.status != EngagementStage.Status.AWAITING_REVIEW:
        raise StageTransitionError("Only submitted work can be disputed.")
    if not reason_code:
        raise StageTransitionError("A dispute needs a reason.")

    now = timezone.now()
    from_status = stage.status
    stage.status = EngagementStage.Status.DISPUTED
    stage.disputed_at = now
    stage.dispute_reason_code = reason_code
    # The review clock is cleared, which is how the "`AWAITING_REVIEW → APPROVED` on timeout
    # **except while `DISPUTED`**" rule holds structurally as well as by the guard in
    # `expire_stage_review`. Two independent expressions of one rule, because auto-approving a
    # stage somebody has objected to would settle the objection by ignoring it.
    stage.review_due_at = None
    stage.save(
        update_fields=(
            "status",
            "disputed_at",
            "dispute_reason_code",
            "review_due_at",
            "updated_at",
        )
    )
    record_event(
        engagement=engagement,
        stage=stage,
        from_status=from_status,
        to_status=stage.status,
        actor=actor,
        reason_code="stage_disputed",
        reason=note or reason_code,
    )

    if engagement.status == Engagement.Status.ACTIVE:
        Engagement.objects.filter(pk=engagement.id).update(
            status=Engagement.Status.DISPUTED,
            disputed_at=now,
            updated_at=now,
        )
        record_event(
            engagement=engagement,
            stage=None,
            from_status=Engagement.Status.ACTIVE,
            to_status=Engagement.Status.DISPUTED,
            actor=None,
            reason_code="engagement_disputed",
            reason=f"stage:{stage.id}",
        )
    # Wave C6 (`M2-BE-703`). Until now a dispute was a status and nothing else: `m2_stage_dispute_
    # resolve` was drivable, but there was no owner, no deadline and no payout hold behind it, and
    # C5 recorded that as a gap. `STAGE` is a payout-holding kind, so opening the case *is* the
    # hold — the vendor's unpaid earnings on this engagement freeze here and thaw when it closes.
    from apps.requirements import disputes  # noqa: PLC0415 - avoids a module import cycle

    disputes.open_stage_case(stage=stage, opened_by=actor, detail=note or reason_code)
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.stage.disputed",
        idempotency_key=f"stage-disputed:{stage.id}",
        payload={
            "engagement_id": str(engagement.id),
            "stage_id": str(stage.id),
            "reason_code": reason_code,
        },
    )
    return stage


#: What Operations may decide about a disputed stage. Deliberately two outcomes and not three:
#: "the Customer was right" sends the work back, "the vendor was right" approves it, and a partial
#: outcome is a scope amendment both sides accept rather than an operator quietly repricing a
#: stage (`M2-BE-508`).
DISPUTE_OUTCOMES: Final = ("APPROVE", "REQUEST_CORRECTION")


@transaction.atomic
def resolve_stage_dispute(
    *, stage_id: uuid.UUID, actor: User, outcome: str, note: str
) -> EngagementStage:
    """Operations decides a disputed stage. `DISPUTED → APPROVED | CORRECTION_REQUESTED`.

    An auditable domain command rather than a database edit, which is the rule `README.md` states
    for every Operations recovery. The full case machinery — evidence, deadlines, appeals — is
    `apps.cases` and Wave C6; this is the transition that command will drive, published now so a
    disputed stage is not a dead end for the whole of C4 and C5.
    """
    stage = _locked_stage(stage_id)
    engagement = stage.engagement
    if outcome not in DISPUTE_OUTCOMES:
        raise StageTransitionError("That is not a decision this stage can take.")
    if stage.status != EngagementStage.Status.DISPUTED:
        raise StageTransitionError("This stage is not disputed.")
    if not note.strip():
        raise StageTransitionError("A dispute decision needs a reason.")

    if outcome == "APPROVE":
        resolved = _approve(stage=stage, actor=actor, reason_code="stage_dispute_resolved_approved")
    else:
        from_status = stage.status
        stage.status = EngagementStage.Status.CORRECTION_REQUESTED
        stage.correction_note = note.strip()
        stage.save(update_fields=("status", "correction_note", "updated_at"))
        record_event(
            engagement=engagement,
            stage=stage,
            from_status=from_status,
            to_status=stage.status,
            actor=actor,
            reason_code="stage_dispute_resolved_correction",
            reason=note.strip(),
        )
        resolved = stage

    _clear_engagement_dispute(engagement)
    return resolved


def _clear_engagement_dispute(engagement: Engagement) -> None:
    """Return the engagement to `ACTIVE` once no stage is still disputed."""
    if engagement.status != Engagement.Status.DISPUTED:
        return
    if EngagementStage.objects.filter(
        engagement=engagement,
        status=EngagementStage.Status.DISPUTED,
    ).exists():
        return
    Engagement.objects.filter(pk=engagement.id).update(
        status=Engagement.Status.ACTIVE,
        updated_at=timezone.now(),
    )
    record_event(
        engagement=engagement,
        stage=None,
        from_status=Engagement.Status.DISPUTED,
        to_status=Engagement.Status.ACTIVE,
        actor=None,
        reason_code="engagement_dispute_cleared",
    )


@transaction.atomic
def expire_stage_review(*, stage_id: uuid.UUID) -> EngagementStage:
    """Silence becomes approval, once the review window closes. System command.

    `07-state-machines-and-permissions.md` §5: `AWAITING_REVIEW → APPROVED` may occur on review
    timeout **except while the stage is `DISPUTED`**. That exception is checked here under the row
    lock rather than trusted from the selector, because the state can change between the sweep
    reading a list and the task acting on one of its entries — which is precisely the window a
    Customer disputes in.

    `actor=None`: a clock approved this, not the Customer, and the record says so.
    """
    stage = _locked_stage(stage_id)
    if stage.status == EngagementStage.Status.DISPUTED:
        raise StageDisputedError()
    if stage.status != EngagementStage.Status.AWAITING_REVIEW:
        return stage
    if stage.review_due_at is None or stage.review_due_at > timezone.now():
        return stage
    return _approve(stage=stage, actor=None, reason_code="stage_review_timed_out")
