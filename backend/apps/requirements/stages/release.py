"""Everything after approval: the payout becomes payable, the project closes, the warranty runs.

The settled end of the spine, and it is all money leaving the engagement. `_release` moves an
approved stage to `RELEASED` and is called from two directions — straight out of approval on A3,
where nothing was held, and off the sweep on A5 once the dispute window closes. When the last
stage settles, `_complete_engagement_if_finished` hands the agreement to the Customer to accept,
`accept_engagement_completion` closes it and the requirement with it, and the retention held out
of the stages runs its warranty window and is released.

`refund_stage_amount` sits at the bottom because it is the same subject read the other way: money
going back to the Customer on scope the amendment engine has already authorized away.

Where the boundary falls: nothing here decides whether work was acceptable. By the time a stage
arrives, `review` has already said yes.
"""

import uuid
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from apps.commerce.models import Refund
from apps.commerce.services import request_standalone_refund
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import payable_account
from apps.requirements import pricing, services
from apps.requirements.exceptions import (
    StageDisputedError,
    StageTransitionError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    EngagementStage,
)

from .base import _locked_stage, add_engagement_money, record_event

# ---------------------------------------------------------------------------
# Release (`M2-BE-507`)
# ---------------------------------------------------------------------------


def _release(*, stage: EngagementStage, actor: User | None, reason_code: str) -> EngagementStage:
    """`APPROVED → RELEASED`, and the money with it."""
    engagement = stage.engagement
    from_status = stage.status
    stage.status = EngagementStage.Status.RELEASED
    stage.released_at = timezone.now()
    stage.released_amount_paise = stage.approved_amount_paise
    stage.save(update_fields=("status", "released_at", "released_amount_paise", "updated_at"))
    add_engagement_money(engagement.id, released_total_paise=stage.released_amount_paise)
    record_event(
        engagement=engagement,
        stage=stage,
        from_status=from_status,
        to_status=stage.status,
        actor=actor,
        reason_code=reason_code,
    )
    _complete_engagement_if_finished(engagement)
    return stage


@transaction.atomic
def release_stage_payout(*, stage_id: uuid.UUID) -> EngagementStage:
    """Make one approved stage's held payout payable, once its dispute window closes.

    Two independent gates, and they fail differently on purpose:

    * **The dispute window.** Null `payout_release_due_at` means the owner set no hold period, so
      nothing is released on a clock and the entry waits for Operations. That is the fail-closed
      reading of an unset policy: releasing early on a guessed window is the one failure a dispute
      window exists to prevent.
    * **The progressive payout gate.** A vendor with no verified bank account has still earned the
      money; they simply cannot be paid it yet. The stage still moves to `RELEASED` — the *work*
      is settled — and the ledger entry stays `PENDING` until the account lands, which the same
      sweep picks up on its next pass.

    `payouts.release_payout_hold` cannot do this: it resolves an entry **by Booking**, and a stage
    has none. That is not an oversight in either place — the M1 rule is one earning per Booking —
    so M2 has its own release, exactly as `access.release_visit_payout_hold` does for a visit.
    """
    stage = _locked_stage(stage_id)
    if stage.status == EngagementStage.Status.RELEASED:
        _release_stage_ledger_hold(stage)
        return stage
    if stage.status != EngagementStage.Status.APPROVED:
        return stage
    if stage.payout_release_due_at is None or stage.payout_release_due_at > timezone.now():
        return stage
    released = _release(stage=stage, actor=None, reason_code="stage_payout_released")
    _release_stage_ledger_hold(released)
    return released


def _release_stage_ledger_hold(stage: EngagementStage) -> PartnerLedgerEntry | None:
    entry = stage.ledger_entry
    if entry is None or entry.status != PartnerLedgerEntry.Status.PENDING:
        return entry
    if payable_account(stage.engagement.partner) is None:
        return entry
    entry.status = PartnerLedgerEntry.Status.AVAILABLE
    entry.save(update_fields=("status", "updated_at"))
    return entry


def _complete_engagement_if_finished(engagement: Engagement) -> None:
    """Every stage settled, so the work is done and the handover begins.

    `ACTIVE → COMPLETING`, not straight to `COMPLETED`. §5 draws the two separately because they
    are different facts: the vendor has finished, and the Customer has accepted that they have.
    The digital-deliverable handover that fills the gap for Event and Media is `M2-BE-547` in
    Wave C5; the state it lands in exists now so C5 adds a step rather than a status.
    """
    if engagement.status not in (Engagement.Status.ACTIVE, Engagement.Status.PENDING_START):
        return
    unsettled = EngagementStage.objects.filter(
        engagement=engagement,
        status__in=(*EngagementStage.OPEN_STATUSES, EngagementStage.Status.APPROVED),
    ).exists()
    if unsettled:
        return
    Engagement.objects.filter(pk=engagement.id).update(
        status=Engagement.Status.COMPLETING,
        updated_at=timezone.now(),
    )
    record_event(
        engagement=engagement,
        stage=None,
        from_status=engagement.status,
        to_status=Engagement.Status.COMPLETING,
        actor=None,
        reason_code="engagement_stages_complete",
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.engagement.completing",
        idempotency_key=f"engagement-completing:{engagement.id}",
        payload={"engagement_id": str(engagement.id)},
    )


@transaction.atomic
def accept_engagement_completion(
    *,
    engagement_id: uuid.UUID,
    actor: User,
    completion_code_verified: bool = False,
) -> Engagement:
    """The Customer accepts the finished work. `COMPLETING → COMPLETED`, then the warranty.

    Also closes the requirement, which is the last transition in
    `07-state-machines-and-permissions.md` §1.

    **`M2-BE-548`: three guards, and none of them approves anything on the way past.** Completion
    is the Customer saying the *whole* agreement is done, and the failure it must not have is
    sweeping an open stage into a settled one on the strength of that:

    * an **open stage** refuses outright. `_complete_engagement_if_finished` only reaches
      `COMPLETING` when nothing is open, but an accepted amendment appends a stage afterwards —
      so by the time the Customer taps, there can legitimately be work outstanding again. The
      stage keeps its own review, and this command declines rather than deciding for it.
    * a **disputed stage** refuses with `m2_stage_disputed`, which is the same rule the review
      timeout obeys, stated at the other end of the engagement.
    * an **unaccepted handover** refuses (`M2-BE-547`). That refusal is the entire mechanism that
      keeps Event and Media delivery on the platform: a vendor who hands over privately has an
      engagement that will not close and a retention that will not release.

    Then the warranty. An engagement that withheld retention or carries a configured warranty
    window moves `COMPLETED → WARRANTY` with an end date; one that does not is finished at
    `COMPLETED`. `CLOSED` therefore means "the warranty period is over" and is reachable only
    through `WARRANTY`, which is why an engagement with no warranty never reaches it — a status
    that meant two different things depending on the variant would be worse than one fewer status.
    """
    engagement = (
        # `requirement.configuration` is nullable, so PostgreSQL rejects an unrestricted
        # `FOR UPDATE` across the outer join. Completion owns the Engagement row; configuration
        # is read-only policy context and must not be included in the lock target.
        Engagement.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration")
        .get(pk=engagement_id)
    )
    if engagement.status in (Engagement.Status.COMPLETED, Engagement.Status.WARRANTY):
        return engagement
    if engagement.status != Engagement.Status.COMPLETING:
        raise StageTransitionError("This engagement is not finished yet.")
    _assert_no_stage_is_still_open(engagement)
    if (
        not completion_code_verified
        and engagement.handover_submitted_at is not None
        and engagement.handover_accepted_at is None
    ):
        raise StageTransitionError(
            "Accept the handover before closing this project, or ask the vendor to correct it.",
        )

    now = timezone.now()
    Engagement.objects.filter(pk=engagement.id).update(
        status=Engagement.Status.COMPLETED,
        completed_at=now,
        updated_at=now,
    )
    record_event(
        engagement=engagement,
        stage=None,
        from_status=Engagement.Status.COMPLETING,
        to_status=Engagement.Status.COMPLETED,
        actor=actor,
        reason_code="engagement_completed",
    )
    services.close_requirement(
        requirement_id=engagement.requirement_id,
        status=CustomerRequirement.Status.CLOSED_COMPLETE,
        reason_code="engagement_completed",
        actor=actor,
    )
    _open_warranty_window(engagement=engagement, at=now)
    engagement.refresh_from_db()
    return engagement


def _assert_no_stage_is_still_open(engagement: Engagement) -> None:
    """Nothing is auto-approved by completing an engagement (`M2-BE-548`)."""
    open_stages = list(
        EngagementStage.objects.filter(
            engagement=engagement,
            status__in=EngagementStage.OPEN_STATUSES,
        ).values_list("position", "status")
    )
    if not open_stages:
        return
    if any(status == EngagementStage.Status.DISPUTED for _position, status in open_stages):
        raise StageDisputedError(
            "A stage on this project is disputed. It has to be decided before the project closes.",
        )
    positions = ", ".join(str(position) for position, _status in sorted(open_stages))
    raise StageTransitionError(
        f"Stage {positions} is still open. Approve or send it back before closing the project.",
    )


def _open_warranty_window(*, engagement: Engagement, at: datetime) -> None:
    """`COMPLETED → WARRANTY`, when there is a warranty to run (`M2-BE-546`, `M2-BE-548`).

    The window comes from the variant's configuration read at completion rather than from a value
    frozen at engagement creation, and the asymmetry is deliberate: the **percentage** is frozen
    because it decides how much of somebody's money is held, while the **duration** only decides
    when a hold that already exists lifts. An engagement whose configuration was retired keeps its
    retention held and waits for Operations, which is the fail-closed direction — releasing a
    warranty hold early on a window nobody can read is the one failure retention exists to
    prevent.
    """
    if engagement.retention_withheld_paise <= 0:
        return
    terms = pricing.warranty_terms_or_none(engagement.requirement)
    if terms is None:
        return
    ends_at = at + timedelta(days=terms.window_days)
    Engagement.objects.filter(pk=engagement.id).update(
        status=Engagement.Status.WARRANTY,
        warranty_ends_at=ends_at,
        updated_at=timezone.now(),
    )
    record_event(
        engagement=engagement,
        stage=None,
        from_status=Engagement.Status.COMPLETED,
        to_status=Engagement.Status.WARRANTY,
        actor=None,
        reason_code="warranty_window_opened",
        reason=f"{engagement.retention_withheld_paise} paise held until {ends_at.isoformat()}",
    )


@transaction.atomic
def close_warranty_window(*, engagement_id: uuid.UUID) -> Engagement:
    """`WARRANTY → CLOSED`, releasing the retention (`M2-BE-546`). System command.

    One ledger entry for the whole withheld amount rather than a correction against each stage's
    entry: `PartnerLedgerEntry` is immutable by `save()` and a `REVERSAL` would say the earlier
    entries were wrong, which they were not — they were correct and partly held. Commission is
    zero on it because the commission on this money was already booked when the stages it came out
    of were approved; charging it again would take Vsolve's share twice on the same rupee.

    The entry is written `PENDING` and released by the same gate every other M2 payout obeys: a
    vendor with no verified payout account has earned it and cannot yet be paid it. Idempotent on
    the engagement, so an overlapping sweep writes one entry.
    """
    engagement = (
        Engagement.objects.select_for_update()
        .select_related("partner", "requirement")
        .get(pk=engagement_id)
    )
    if engagement.status == Engagement.Status.CLOSED:
        return engagement
    if engagement.status != Engagement.Status.WARRANTY:
        raise StageTransitionError("This engagement is not in its warranty period.")
    if engagement.warranty_ends_at is None or engagement.warranty_ends_at > timezone.now():
        return engagement
    # Wave C6. A warranty claim raised inside the window holds the retention past the window's end:
    # the money is held against a promise somebody is currently calling on, and a sweep that
    # released it on the calendar would settle the claim by outlasting it. Wave C5 could not guard
    # this because there was no way for a Customer to raise the claim at all.
    from apps.requirements import disputes  # noqa: PLC0415 - avoids a module import cycle

    if disputes.engagement_has_open_warranty_claim(engagement):
        return engagement

    now = timezone.now()
    entry = engagement.retention_ledger_entry
    if entry is None and engagement.retention_withheld_paise > 0:
        entry = PartnerLedgerEntry.objects.filter(
            idempotency_key=f"m2-retention:{engagement.id}"
        ).first() or PartnerLedgerEntry.objects.create(
            partner=engagement.partner,
            booking=None,
            kind=PartnerLedgerEntry.Kind.EARNING,
            status=PartnerLedgerEntry.Status.PENDING,
            gross_paise=engagement.retention_withheld_paise,
            commission_paise=0,
            net_paise=engagement.retention_withheld_paise,
            calculation_snapshot={
                "source": "m2_warranty_retention",
                "engagement_id": str(engagement.id),
                "retention_paise": engagement.retention_paise,
                "withheld_paise": engagement.retention_withheld_paise,
                "warranty_ended_at": engagement.warranty_ends_at.isoformat(),
            },
            reason="m2 warranty retention release",
            idempotency_key=f"m2-retention:{engagement.id}",
        )
    Engagement.objects.filter(pk=engagement.id).update(
        status=Engagement.Status.CLOSED,
        retention_ledger_entry=entry,
        updated_at=now,
    )
    record_event(
        engagement=engagement,
        stage=None,
        from_status=Engagement.Status.WARRANTY,
        to_status=Engagement.Status.CLOSED,
        actor=None,
        reason_code="warranty_window_closed",
        reason=f"{engagement.retention_withheld_paise} paise released",
    )
    if entry is not None and payable_account(engagement.partner) is not None:
        entry.status = PartnerLedgerEntry.Status.AVAILABLE
        entry.save(update_fields=("status", "updated_at"))
    engagement.refresh_from_db()
    return engagement


def warranty_close_due_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Engagements whose warranty period has run out, and released retentions still unpaid.

    Two halves in one selector because one command handles both, exactly as
    `stage_payout_release_due_ids` does: the engagement closes when its window passes, and the
    retention entry becomes `AVAILABLE` when the vendor's payout account lands — which may be
    months later and is nobody's fault.
    """
    moment = at or timezone.now()
    due = Engagement.objects.filter(
        status=Engagement.Status.WARRANTY,
        warranty_ends_at__isnull=False,
        warranty_ends_at__lt=moment,
    ).values_list("id", flat=True)
    held = Engagement.objects.filter(
        status=Engagement.Status.CLOSED,
        retention_ledger_entry__isnull=False,
        retention_ledger_entry__status=PartnerLedgerEntry.Status.PENDING,
    ).values_list("id", flat=True)
    return list(dict.fromkeys([*due, *held]))


@transaction.atomic
def release_retention_hold(*, engagement_id: uuid.UUID) -> Engagement:
    """Move an already-written retention entry to `AVAILABLE` once the account is verified."""
    engagement = (
        Engagement.objects.select_for_update()
        .select_related("partner", "retention_ledger_entry")
        .get(pk=engagement_id)
    )
    entry = engagement.retention_ledger_entry
    if entry is None or entry.status != PartnerLedgerEntry.Status.PENDING:
        return engagement
    if payable_account(engagement.partner) is None:
        return engagement
    entry.status = PartnerLedgerEntry.Status.AVAILABLE
    entry.save(update_fields=("status", "updated_at"))
    return engagement


# ---------------------------------------------------------------------------
# Refund adjustment (`M2-BE-506`, used by the amendment engine)
# ---------------------------------------------------------------------------


@transaction.atomic
def refund_stage_amount(
    *, stage_id: uuid.UUID, amount_paise: int, reason_code: str
) -> Refund | None:
    """Give back funded money on a stage whose scope was reduced.

    Called only by `apps.requirements.amendments` after an amendment is authorized, which is what
    makes it a *settlement* rather than a unilateral write-down. Bounded twice: the stage cannot
    refund more than it was funded less what it has already refunded, and the ledger-level bound
    is the `requirements_stage_settled_within_amount` constraint behind it.

    Returns `None` when there is nothing collected to give back — an A3 stage, or an A5 stage the
    Customer had not funded yet. That is not a failure: reducing unfunded scope costs nobody
    anything, and issuing a refund against a payment that was never taken would be the failure.
    """
    stage = _locked_stage(stage_id)
    attempt_id = stage.payment_attempt_id
    refundable = stage.funded_paise - stage.refunded_amount_paise - stage.released_amount_paise
    if attempt_id is None or amount_paise <= 0 or refundable <= 0:
        return None
    amount = min(amount_paise, refundable)
    refund = request_standalone_refund(
        payment_attempt_id=attempt_id,
        amount_paise=amount,
        reason_code=reason_code,
        idempotency_key=f"m2-stage-refund:{stage.id}:{amount}",
    )
    stage.refund = refund
    stage.refunded_amount_paise += amount
    stage.save(update_fields=("refund", "refunded_amount_paise", "updated_at"))
    add_engagement_money(stage.engagement_id, refunded_total_paise=amount)
    record_event(
        engagement=stage.engagement,
        stage=stage,
        from_status=stage.status,
        to_status=stage.status,
        actor=None,
        reason_code="stage_refunded",
        reason=f"{amount} paise: {reason_code}",
    )
    return refund
