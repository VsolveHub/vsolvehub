"""Vendor abandonment: transfer, and the material-advance recovery rule.

(`M2-BE-545`, and the half of `M2-BE-543` Wave C3.5 left open)

The two ways a project survives a vendor who walks away, and the settlement machinery both of them
share. `propose_project_transfer` / `decide_project_transfer` / `expire_project_transfer` move the
remaining milestones to a replacement at a price the Customer accepted;
`terminate_project_early` ends the project with nobody replacing them. Underneath both sit
`_return_unearned_funding` and `_cancel_stage`, which are the only reason these two commands live
in one module: they are the same settlement read twice, and separating them would put the rule
that a funded material advance is never clawed back in two places that could drift apart.

The boundary is "the vendor changed or stopped". A milestone that is simply late is a delay claim;
a milestone that is worth more is an M1 amendment. Nothing here decides a remedy — no penalty, no
forfeit, no compensation — because that is the Wave C6 cancellation policy engine.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Final

from django.db import transaction
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners import standing
from apps.partners.capabilities import assert_capability_active
from apps.partners.models import PartnerProfile, PartnerStandingEvent
from apps.requirements import pricing, services, stages
from apps.requirements.exceptions import (
    AmendmentNotActionableError,
    RequirementNotFoundError,
    StageDisputedError,
    StageTransitionError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    EngagementStage,
    ProjectTransfer,
)
from apps.requirements.projects.base import (
    _assert_engagement_open,
    _locked_engagement,
    assert_project_engagement,
)

#: Reason codes a cancelled stage can carry, so an Operations reader never has to infer which
#: recovery took a stage out. Statuses answer "is this live"; these answer "settled how".
#:
#: There is deliberately no `transferred_to_replacement_vendor`: a transferred milestone is
#: **repriced and kept**, not cancelled and recreated, so that its evidence, its delay claims and
#: its original terms all stay attached to the work rather than to whoever was doing it.
CANCELLED_MATERIAL_OUTSTANDING: Final = "material_advance_left_with_vendor"
CANCELLED_BY_TERMINATION: Final = "project_terminated_early"


@dataclass(frozen=True, slots=True)
class TransferQuote:
    """What the replacement vendor wants for one milestone that is left."""

    stage_id: uuid.UUID
    amount_paise: int


def transferable_stages(engagement: Engagement) -> list[EngagementStage]:
    """The milestones a replacement vendor would take on.

    Two exclusions, and each is a rule rather than a filter:

    * **A settled stage is not transferable.** Approved and released work happened; a replacement
      is not doing it again and the Customer is not paying for it again.
    * **A funded material advance is not transferable** (`M2-BE-543`). The abandoning vendor spent
      that money on goods. Handing the line to a replacement would buy the same cement twice, and
      refunding it would be Vsolve deciding a goods dispute with a background job. It is cancelled
      and recorded as outstanding instead, which is where a human decides where the goods went.

    A **disputed** stage is excluded by `TRANSFERABLE_STATUSES` and blocks the whole transfer in
    `propose_project_transfer` rather than being quietly left behind — see there.
    """
    return [
        stage
        for stage in EngagementStage.objects.filter(
            engagement=engagement,
            status__in=EngagementStage.TRANSFERABLE_STATUSES,
        ).order_by("position")
        if not (
            stage.kind == EngagementStage.Kind.MATERIAL_ADVANCE
            and stage.funded_paise > stage.refunded_amount_paise
        )
    ]


def outstanding_material_advances(engagement: Engagement) -> list[EngagementStage]:
    """Funded material advances that a recovery leaves exactly where they are."""
    return list(
        EngagementStage.objects.filter(
            engagement=engagement,
            kind=EngagementStage.Kind.MATERIAL_ADVANCE,
            status__in=EngagementStage.OPEN_STATUSES,
        )
        .filter(funded_paise__gt=0)
        .order_by("position")
    )


@transaction.atomic
def propose_project_transfer(
    *,
    engagement_id: uuid.UUID,
    actor: User,
    to_partner_id: uuid.UUID,
    quotes: list[TransferQuote],
    reason_code: str,
    note: str = "",
) -> ProjectTransfer:
    """Operations proposes moving the remaining milestones to a replacement vendor.

    **Priced per remaining milestone, never as a lump.** A replacement who names one number for
    "the rest of it" has not said which of the agreed milestones they are doing, and the Customer
    would be accepting a total against a scope nobody restated. Every transferable stage must
    appear exactly once and every price must be positive, so the two numbers the Customer is shown
    — what the old vendor was owed, and what the new one wants — are sums over the same list of
    work.

    **A disputed milestone blocks the whole transfer.** A dispute is a live objection about work
    somebody says was done; transferring around it would close that objection by moving it out of
    the agreement, and transferring *it* would ask a replacement to price a question. Operations
    decides the dispute first — `resolve_stage_dispute` exists precisely so that is not a dead
    end — and then transfers.

    Nothing moves here. The proposal is a proposal until the Customer accepts it, because their
    remaining cost changes and `07-state-machines-and-permissions.md` §7 does not let Operations
    change somebody's agreement for them.
    """
    engagement = _locked_engagement(engagement_id)
    assert_project_engagement(engagement)
    _assert_engagement_open(engagement)
    if engagement.commercial_mode != Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED:
        raise StageTransitionError("This engagement is paid directly to the vendor.")
    if not reason_code:
        raise StageTransitionError("A transfer needs a reason code.")
    if ProjectTransfer.objects.filter(
        engagement=engagement,
        status__in=ProjectTransfer.LIVE_STATUSES,
    ).exists():
        raise AmendmentNotActionableError(
            "A transfer is already waiting for the Customer on this project.",
        )
    if EngagementStage.objects.filter(
        engagement=engagement,
        status=EngagementStage.Status.DISPUTED,
    ).exists():
        raise StageDisputedError(
            "A milestone on this project is disputed. Decide it before transferring the rest.",
        )

    replacement = PartnerProfile.objects.filter(pk=to_partner_id).first()
    if replacement is None:
        raise RequirementNotFoundError()
    if replacement.id == engagement.partner_id:
        raise StageTransitionError("The replacement has to be a different vendor.")
    requirement = engagement.requirement
    # The same check `reconfirm_selection` makes, for the same reason: a replacement whose
    # capability is not approved for this variant and this area on the day the work restarts would
    # be authorized work nobody approved.
    assert_capability_active(
        partner=replacement,
        variant=requirement.variant,
        service_area=requirement.service_area,
        on_day=(
            requirement.requested_start.date() if requirement.requested_start is not None else None
        ),
    )

    remaining = transferable_stages(engagement)
    if not remaining:
        raise StageTransitionError(
            "There is no unfinished work on this project to transfer.",
        )
    priced = {quote.stage_id: quote.amount_paise for quote in quotes}
    if len(priced) != len(quotes):
        raise StageTransitionError("Each milestone can be priced only once.")
    expected = {stage.id for stage in remaining}
    if set(priced) != expected:
        raise StageTransitionError(
            "Price every unfinished milestone exactly once, and no others.",
        )
    if any(amount <= 0 for amount in priced.values()):
        raise StageTransitionError("Every milestone needs a price above zero.")

    previous_remaining = sum(stage.amount_paise for stage in remaining)
    replacement_remaining = sum(priced.values())
    outstanding = sum(
        stage.funded_paise - stage.refunded_amount_paise
        for stage in outstanding_material_advances(engagement)
    )
    transfer = ProjectTransfer.objects.create(
        engagement=engagement,
        from_partner=engagement.partner,
        to_partner=replacement,
        reason_code=reason_code[:80],
        note=note.strip()[:2000],
        previous_remaining_paise=previous_remaining,
        replacement_remaining_paise=replacement_remaining,
        delta_paise=replacement_remaining - previous_remaining,
        material_advance_outstanding_paise=max(outstanding, 0),
        stage_prices={str(stage_id): amount for stage_id, amount in priced.items()},
        proposed_by=actor,
        # The same clock the amendment engine runs on, and raising `m2_policy_unavailable` when
        # the owner has set none. A transfer proposal with no deadline is a replacement vendor's
        # diary held open indefinitely.
        expires_at=pricing.amendment_response_deadline(requirement),
    )
    stages.record_event(
        engagement=engagement,
        stage=None,
        from_status=engagement.status,
        to_status=engagement.status,
        actor=actor,
        reason_code="project_transfer_proposed",
        reason=(
            f"{previous_remaining} -> {replacement_remaining} paise across "
            f"{len(remaining)} milestone(s)"
        ),
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.transfer_proposed",
        idempotency_key=f"project-transfer:{transfer.id}",
        payload={
            "engagement_id": str(engagement.id),
            "project_transfer_id": str(transfer.id),
            "delta_paise": transfer.delta_paise,
        },
    )
    return transfer


@transaction.atomic
def decide_project_transfer(
    *, project_transfer_id: uuid.UUID, actor: User, accept: bool
) -> ProjectTransfer:
    """The Customer answers a proposed transfer. Accepting settles the delta and repoints the job.

    **The settlement is structural rather than a number in a report**, which is what stops anybody
    paying twice:

    1. every transferable milestone **refunds** what the Customer funded and the abandoning vendor
       did not earn, through the M1 refund rail, and drops back to `REQUIRED`;
    2. every transferable milestone is then **repriced** to the replacement's own number, and the
       engagement's `amendment_delta_paise` moves by exactly the difference — so
       `staged_total = total + amendment_delta` still holds by database constraint;
    3. the Customer funds the replacement's milestones as they reach them, at the price they just
       accepted.

    So there is **no transfer checkout and no new payment purpose**. The money asked for after a
    transfer is the ordinary stage funding that was always going to be asked for, at a number the
    Customer agreed to before any of it moved.

    The order inside step 1 and 2 is load-bearing rather than tidy: `requirements_stage_exposure_
    within_amount` is checked on every statement, so repricing a funded milestone downwards before
    returning the money would be the one instant in which the platform holds more of the
    Customer's money than the milestone is worth, and the database would refuse it.
    """
    transfer = (
        ProjectTransfer.objects.select_for_update(of=("self",))
        .select_related("engagement__requirement__configuration", "from_partner", "to_partner")
        .get(pk=project_transfer_id)
    )
    if transfer.status != ProjectTransfer.Status.PROPOSED:
        raise AmendmentNotActionableError("This transfer has already been decided.")
    if transfer.expires_at <= timezone.now():
        expire_project_transfer(project_transfer_id=transfer.id)
        raise AmendmentNotActionableError("This transfer expired before it was answered.")

    now = timezone.now()
    transfer.decided_by = actor
    transfer.decided_at = now
    if not accept:
        transfer.status = ProjectTransfer.Status.DECLINED
        transfer.save(update_fields=("status", "decided_by", "decided_at", "updated_at"))
        stages.record_event(
            engagement=transfer.engagement,
            stage=None,
            from_status=ProjectTransfer.Status.PROPOSED,
            to_status=transfer.status,
            actor=actor,
            reason_code="project_transfer_declined",
        )
        return transfer

    engagement = Engagement.objects.select_for_update().get(pk=transfer.engagement_id)
    _assert_engagement_open(engagement)
    if EngagementStage.objects.filter(
        engagement=engagement,
        status=EngagementStage.Status.DISPUTED,
    ).exists():
        # Re-checked at acceptance, not only at proposal: a Customer can dispute a milestone in
        # the window between Operations proposing a transfer and the Customer accepting it, and
        # that is exactly the moment a transfer would move the objection out of the agreement.
        raise StageDisputedError(
            "A milestone was disputed after this transfer was proposed. It has to be decided "
            "first.",
        )

    priced: dict[str, int] = {str(key): int(value) for key, value in transfer.stage_prices.items()}
    remaining = transferable_stages(engagement)
    if {str(stage.id) for stage in remaining} != set(priced):
        # The unfinished work moved after the proposal was priced — a milestone was approved, or
        # an amendment appended one. The Customer would be accepting a price for a list of work
        # that no longer exists, so the transfer is refused rather than re-derived on their
        # behalf.
        raise AmendmentNotActionableError(
            "The unfinished work on this project changed after this transfer was priced. Ask "
            "Operations to propose it again.",
        )

    refunded_total = 0
    for stage in remaining:
        refunded_total += _return_unearned_funding(
            stage=stage,
            reason_code="m2_project_transferred",
        )
        locked = EngagementStage.objects.select_for_update().get(pk=stage.id)
        # `apply_transfer_amount` is one of the two doors in `EngagementStage` that may move an
        # agreed amount, and this is its only caller — `M2-BE-508` held at the narrowest point
        # rather than by everybody remembering.
        locked.apply_transfer_amount(priced[str(stage.id)])

    material_outstanding = 0
    for advance in outstanding_material_advances(engagement):
        material_outstanding += advance.funded_paise - advance.refunded_amount_paise
        _cancel_stage(
            stage=advance,
            reason_code=CANCELLED_MATERIAL_OUTSTANDING,
            actor=None,
        )

    stages.add_engagement_money(
        engagement.id,
        staged_total_paise=transfer.delta_paise,
        amendment_delta_paise=transfer.delta_paise,
    )
    Engagement.objects.filter(pk=engagement.id).update(
        partner=transfer.to_partner,
        # Work stops until the replacement's first milestone is funded, exactly as it did when the
        # project opened. `PENDING_START` rather than `ACTIVE` is the honest state: the new vendor
        # has nothing funded and no clearance, and leaving `work_may_start_at` standing would say
        # otherwise.
        status=Engagement.Status.PENDING_START,
        work_may_start_at=None,
        updated_at=now,
    )
    transfer.status = ProjectTransfer.Status.ACCEPTED
    transfer.refunded_paise = refunded_total
    transfer.material_advance_outstanding_paise = material_outstanding
    transfer.applied_at = now
    transfer.save(
        update_fields=(
            "status",
            "refunded_paise",
            "material_advance_outstanding_paise",
            "decided_by",
            "decided_at",
            "applied_at",
            "updated_at",
        )
    )
    standing.record_event(
        partner=transfer.from_partner,
        kind=PartnerStandingEvent.Kind.PROJECT_ABANDONED,
        source_kind="project_transfer",
        source_id=transfer.id,
        reason=f"remaining milestones transferred: {transfer.reason_code}",
    )
    stages.record_event(
        engagement=engagement,
        stage=None,
        from_status=ProjectTransfer.Status.PROPOSED,
        to_status=transfer.status,
        actor=actor,
        reason_code="project_transfer_accepted",
        reason=(
            f"delta {transfer.delta_paise} paise; refunded {refunded_total} paise; "
            f"material advance outstanding {material_outstanding} paise"
        ),
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.transferred",
        idempotency_key=f"project-transferred:{transfer.id}",
        payload={
            "engagement_id": str(engagement.id),
            "project_transfer_id": str(transfer.id),
            "from_partner_id": str(transfer.from_partner_id),
            "to_partner_id": str(transfer.to_partner_id),
            "delta_paise": transfer.delta_paise,
            "refunded_paise": refunded_total,
            "material_advance_outstanding_paise": material_outstanding,
        },
    )
    return transfer


@transaction.atomic
def expire_project_transfer(*, project_transfer_id: uuid.UUID) -> ProjectTransfer:
    """Nobody answered. The vendor, the prices and the agreement all stay as they were."""
    transfer = ProjectTransfer.objects.select_for_update(of=("self",)).get(pk=project_transfer_id)
    if transfer.status != ProjectTransfer.Status.PROPOSED:
        return transfer
    if transfer.expires_at > timezone.now():
        return transfer
    transfer.status = ProjectTransfer.Status.EXPIRED
    transfer.save(update_fields=("status", "updated_at"))
    stages.record_event(
        engagement=transfer.engagement,
        stage=None,
        from_status=ProjectTransfer.Status.PROPOSED,
        to_status=transfer.status,
        actor=None,
        reason_code="project_transfer_expired",
    )
    return transfer


def expired_project_transfer_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    moment = at or timezone.now()
    return list(
        ProjectTransfer.objects.filter(
            status=ProjectTransfer.Status.PROPOSED,
            expires_at__lt=moment,
        ).values_list("id", flat=True)
    )


@transaction.atomic
def terminate_project_early(
    *, engagement_id: uuid.UUID, actor: User, reason_code: str, note: str = ""
) -> Engagement:
    """The project ends with work outstanding and no replacement. Operations command.

    **This is the second half of `M2-BE-543`** — the recovery rule a material advance needs and a
    work milestone must not share:

    * a funded, unearned **work** milestone is **refunded**. Vsolve is holding the Customer's
      money for work that is not going to happen, and there is no policy decision in giving it
      back — the absence of one is why this is safe to do without the owner's cancellation
      remedies;
    * a funded **material advance** is **not** refunded and not clawed back. The vendor spent it
      on goods. It is recorded on the cancelled stage with its own reason code and reaches
      Operations as an outstanding balance somebody has to resolve against the physical world.

    **What this command deliberately does not do is decide a remedy.** No penalty, no forfeit, no
    compensation, no standing consequence beyond recording that the project was abandoned. Who
    owes whom what when a project ends early is the cancellation policy engine, which is Wave C6
    (`M2-BE-701`, `706`), and guessing it inside a wave about milestones would put an unreviewed
    money branch where nobody would look for one. Returning money nobody earned is not a remedy;
    it is the absence of one.
    """
    engagement = _locked_engagement(engagement_id)
    assert_project_engagement(engagement)
    _assert_engagement_open(engagement)
    if not reason_code:
        raise StageTransitionError("Ending a project early needs a reason code.")

    now = timezone.now()
    refunded_total = 0
    material_outstanding = 0
    for stage in EngagementStage.objects.select_for_update().filter(
        engagement=engagement,
        status__in=EngagementStage.OPEN_STATUSES,
    ):
        is_material = stage.kind == EngagementStage.Kind.MATERIAL_ADVANCE
        held = stage.funded_paise - stage.refunded_amount_paise
        if is_material and held > 0:
            material_outstanding += held
            _cancel_stage(stage=stage, reason_code=CANCELLED_MATERIAL_OUTSTANDING, actor=actor)
            continue
        refunded_total += _return_unearned_funding(
            stage=stage,
            reason_code="m2_project_terminated",
        )
        _cancel_stage(stage=stage, reason_code=CANCELLED_BY_TERMINATION, actor=actor)

    Engagement.objects.filter(pk=engagement.id).update(
        status=Engagement.Status.CANCELLED,
        work_may_start_at=None,
        updated_at=now,
    )
    stages.record_event(
        engagement=engagement,
        stage=None,
        from_status=engagement.status,
        to_status=Engagement.Status.CANCELLED,
        actor=actor,
        reason_code="project_terminated_early",
        reason=(
            f"{reason_code}: refunded {refunded_total} paise; material advance outstanding "
            f"{material_outstanding} paise. {note.strip()}"
        )[:2000],
    )
    standing.record_event(
        partner=engagement.partner,
        kind=PartnerStandingEvent.Kind.PROJECT_ABANDONED,
        source_kind="engagement",
        source_id=engagement.id,
        reason=f"project ended early: {reason_code}",
    )
    services.close_requirement(
        requirement_id=engagement.requirement_id,
        status=CustomerRequirement.Status.CLOSED_CANCELLED,
        reason_code=reason_code[:80],
        actor=actor,
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.terminated",
        idempotency_key=f"project-terminated:{engagement.id}",
        payload={
            "engagement_id": str(engagement.id),
            "reason_code": reason_code,
            "refunded_paise": refunded_total,
            "material_advance_outstanding_paise": material_outstanding,
        },
    )
    engagement.refresh_from_db()
    return engagement


def _return_unearned_funding(*, stage: EngagementStage, reason_code: str) -> int:
    """Give back everything the Customer funded on this stage that nobody has earned.

    Returns the amount refunded, which is zero on an unfunded stage — the ordinary case, and not a
    failure: taking scope out of work nobody has paid for costs nobody anything.

    The stage drops back to `REQUIRED` afterwards, and that is what makes it safe to reprice: the
    `requirements_stage_funding_covers_amount` constraint only binds a stage that says it is
    `FUNDED`, and a stage whose funding has just been returned is not.
    """
    refundable = stage.funded_paise - stage.refunded_amount_paise - stage.released_amount_paise
    refunded = 0
    if refundable > 0:
        refund = stages.refund_stage_amount(
            stage_id=stage.id,
            amount_paise=refundable,
            reason_code=reason_code[:80],
        )
        if refund is not None:
            refunded = refundable
    locked = EngagementStage.objects.select_for_update().get(pk=stage.id)
    if locked.funding_state in (
        EngagementStage.FundingState.FUNDED,
        EngagementStage.FundingState.PENDING,
    ):
        locked.funding_state = EngagementStage.FundingState.REQUIRED
        locked.payment_attempt = None
        locked.funded_at = None
        locked.save(
            update_fields=("funding_state", "payment_attempt", "funded_at", "updated_at"),
        )
    return refunded


def _cancel_stage(
    *, stage: EngagementStage, reason_code: str, actor: User | None
) -> EngagementStage:
    """Take one milestone out of the live agreement, keeping every number it carries.

    `amount_paise`, `funded_paise` and `refunded_amount_paise` are all left exactly as they are,
    and the engagement's `staged_total_paise` does not move. That is deliberate: the agreement
    **was** that big, the money **was** collected, and shrinking the totals to make a cancelled
    project look tidy would erase the record a dispute reads. What changes is only that nobody
    owes work on this row any more.
    """
    locked = EngagementStage.objects.select_for_update().get(pk=stage.id)
    if locked.status == EngagementStage.Status.CANCELLED:
        return locked
    from_status = locked.status
    locked.status = EngagementStage.Status.CANCELLED
    locked.cancelled_at = timezone.now()
    locked.cancellation_reason_code = reason_code[:80]
    locked.save(
        update_fields=("status", "cancelled_at", "cancellation_reason_code", "updated_at"),
    )
    stages.record_event(
        engagement=locked.engagement,
        stage=locked,
        from_status=from_status,
        to_status=locked.status,
        actor=actor,
        reason_code="stage_cancelled",
        reason=reason_code,
    )
    return locked
