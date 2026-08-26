"""Turning an accepted quote into an engagement: frozen terms and a stage ledger.

The other half of choosing a vendor. `selection.select_proposal` decides *whether*
the vendor may commit; this module decides *what the agreement is* once they have — the terms
snapshot a dispute reads years later, the stage rows the money hangs off, and the one place the two
commercial modes visibly diverge (A3 releases contact immediately, A5 releases nothing until the
first stage is funded).

The boundary: nothing here re-checks eligibility, and nothing here is reached from anywhere except
`selection`. The rate-card path has no proposal at all and lays its own shift-days out in
`rate_card`; funding those stages is `funding`.
"""

from typing import Any

from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.requirements import access, pricing, stages
from apps.requirements.exceptions import RequirementTransitionError
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    EngagementStage,
    Proposal,
    ProposalSelection,
)
from apps.requirements.services import record_transition

from .base import A3, shift_dates


def _proposal_terms(proposal: Proposal) -> dict[str, Any]:
    """The immutable copy a dispute reads years later."""
    return {
        "proposal_id": str(proposal.id),
        "revision": proposal.revision,
        "total_paise": proposal.total_paise,
        "tax_paise": proposal.tax_paise,
        "tax_basis": proposal.tax_basis,
        "rate_paise_per_worker_day": proposal.rate_paise_per_worker_day,
        "minimum_days": proposal.minimum_days,
        "worker_count": proposal.worker_count,
        "inclusions": proposal.inclusions,
        "exclusions": proposal.exclusions,
        "stages": proposal.stages,
        "warranty_terms": proposal.warranty_terms,
        "valid_until": proposal.valid_until.isoformat() if proposal.valid_until else None,
        "site_visit_id": str(proposal.site_visit_id) if proposal.site_visit_id else None,
        "estimate_type": proposal.estimate_type,
        "item_lines": proposal.item_lines,
        "labour_lines": proposal.labour_lines,
        "material_lines": proposal.material_lines,
        "other_charges": proposal.other_charges,
        "calculation": proposal.calculation_snapshot,
    }


def _a3_stages(proposal: Proposal, *, requirement: CustomerRequirement) -> list[dict[str, Any]]:
    """One stage per shift-day. Amounts are server-calculated from the quoted rate.

    `M2-BE-413`: the client never supplies a total. A workforce quote is a rate per worker per day
    and a number of days, so the stage amounts are arithmetic over fields the wage-floor guard has
    already validated — not a number the composer sent.

    Each row also carries the day it is (`M2-BE-521`). The fallback quote flow lays out shift-days
    exactly as the rate-card path does, so its crew, attendance and settlement work identically —
    a vendor whose customer came through the fallback still has a Thursday to assign people to.
    """
    days = proposal.minimum_days or 1
    workers = proposal.worker_count or 1
    rate = proposal.rate_paise_per_worker_day or 0
    per_day = rate * workers
    scheduled = shift_dates(requirement, days=days)
    return [
        {"label": f"Day {index}", "amount_paise": per_day, "scheduled_on": scheduled[index - 1]}
        for index in range(1, days + 1)
    ]


def _a5_stages(proposal: Proposal) -> list[dict[str, Any]]:
    """Milestones, then material advances, as the vendor structured them.

    `proposals._assert_a5_shape` refuses a quote whose stage **and material** amounts do not add up
    to its total, so by the time an engagement is opened the breakdown is known to reconcile.

    Material lines land **after** every work milestone and carry `kind=MATERIAL_ADVANCE`
    (`M2-BE-543`). Two consequences, and both are the reason the column exists:

    * they fund through `PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE` rather than
      `M2_STAGE_FUNDING`, so the ledger can tell an advance from a milestone payment;
    * they are **not** clawed back as unearned work when a capability is suspended — the vendor
      bought the cement, and refunding it would take money for goods that already exist.

    Placing them last is deliberate rather than cosmetic: `create_stage_funding_checkout` funds in
    position order, and a project whose first collection is a materials advance is the
    prepay-then-vanish shape staged funding exists to prevent. Work is funded first.
    """
    stage_rows: list[dict[str, Any]] = []
    for index, stage in enumerate(proposal.stages or [], start=1):
        stage_rows.append(
            {
                "label": str(stage.get("title") or stage.get("label") or f"Stage {index}"),
                # `M2-BE-541`: a milestone is what it *delivers*, not only what it costs. The
                # estimate already carried this (`ProposalStageSerializer.deliverable`, published
                # at 1.24.0) and the engagement threw it away, so the agreement a dispute reads
                # said "Stage 2, 80,000 paise" where the Customer had been shown "second coat and
                # snagging". Copied rather than read back through the proposal, because a proposal
                # is append-only and the vendor may supersede it after reconfirmation.
                "deliverable": str(stage.get("deliverable") or ""),
                "amount_paise": int(stage.get("total_due_paise") or stage.get("amount_paise", 0)),
                "partner_service_amount_paise": int(stage.get("amount_paise", 0)),
                "tax_paise": int(stage.get("tax_paise", 0)),
                "platform_fee_paise": int(stage.get("platform_fee_paise", 0)),
                "platform_fee_tax_paise": int(stage.get("platform_fee_tax_paise", 0)),
                "starts_on": stage.get("starts_on"),
                "duration_days": stage.get("duration_days"),
                "scheduled_on": stage.get("ends_on"),
                "kind": EngagementStage.Kind.WORK,
            }
        )
    for index, line in enumerate(proposal.material_lines or [], start=1):
        quantity = line.get("quantity")
        unit = str(line.get("unit") or "").strip()
        stage_rows.append(
            {
                "label": str(line.get("title") or f"Materials {index}"),
                # A material line's "deliverable" is the goods themselves, in the vendor's own
                # units. "40 bags" beside the amount is what makes an advance auditable at the
                # point somebody has to decide whether the cement exists (`M2-BE-543`).
                "deliverable": (
                    f"{quantity} {unit}".strip() if quantity and unit else str(unit or "")
                ),
                "amount_paise": int(line.get("total_due_paise") or line.get("amount_paise", 0)),
                "partner_service_amount_paise": int(line.get("amount_paise", 0)),
                "tax_paise": int(line.get("tax_paise", 0)),
                "platform_fee_paise": int(line.get("platform_fee_paise", 0)),
                "platform_fee_tax_paise": int(line.get("platform_fee_tax_paise", 0)),
                "scheduled_on": None,
                "kind": EngagementStage.Kind.MATERIAL_ADVANCE,
            }
        )
    return stage_rows


def _open_engagement(
    *,
    requirement: CustomerRequirement,
    selection: ProposalSelection,
    proposal: Proposal,
) -> Engagement:
    """Freeze the agreement and lay out its stages (`M2-BE-411`, `412`, `413`, `416`)."""
    now = timezone.now()
    is_lead_only = requirement.archetype == A3
    commission_paise = 0
    commission_treatment = ""
    retention_paise = 0
    if not is_lead_only:
        commission_paise = proposal.commission_paise
        commission_treatment = proposal.commission_treatment
        # `M2-BE-546`. Frozen here, from the configuration that was live when the agreement was
        # made, so a percentage Operations changes next month does not move a hold-back on a
        # project already under way. Zero when the estimate advertised no warranty — retention
        # secures a promise, and there is nothing to secure when none was made.
        #
        # `warranty_terms_or_none` rather than `warranty_terms`: `submit_proposal` already refused
        # an estimate that promises warranty a variant cannot fund, so reaching a missing
        # configuration here means Operations retired it in between — and stranding a Customer who
        # has paid for site visits, at the moment their chosen vendor commits, is the wrong place
        # to fail closed. The absence is recorded in the terms snapshot below.
        terms = pricing.warranty_terms_or_none(requirement)
        if terms is not None and proposal.warranty_terms.strip():
            retention_paise = terms.retention_paise(total_paise=proposal.total_paise)

    rows = _a3_stages(proposal, requirement=requirement) if is_lead_only else _a5_stages(proposal)
    staged_total = sum(int(row["amount_paise"]) for row in rows)
    if staged_total != proposal.total_paise:
        # `M2-BE-504` at the one moment it can still be prevented rather than reported. The stage
        # breakdown *is* the agreement, so a breakdown that does not add up to the agreed total is
        # an engagement whose money can never reconcile — and the database constraint below would
        # refuse it anyway, as a 500 rather than as a sentence anybody can act on.
        raise RequirementTransitionError(
            "This quote's stage amounts no longer add up to its total. Ask the vendor to "
            "re-submit it.",
        )

    engagement = Engagement.objects.create(
        requirement=requirement,
        selection=selection,
        proposal=proposal,
        partner=selection.partner,
        customer=requirement.customer,
        archetype=requirement.archetype,
        commercial_mode=(
            Engagement.CommercialMode.LEAD_ONLY
            if is_lead_only
            else Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED
        ),
        status=Engagement.Status.ACTIVE if is_lead_only else Engagement.Status.PENDING_START,
        total_paise=proposal.total_paise,
        tax_paise=proposal.tax_paise,
        tax_basis=proposal.tax_basis,
        commission_paise=commission_paise,
        commission_treatment=commission_treatment,
        retention_paise=retention_paise,
        # The reconciliation column `M2-BE-504` checks against. Equal to `total_paise` at
        # creation, because no amendment has moved anything yet.
        staged_total_paise=staged_total,
        terms_snapshot=_proposal_terms(proposal),
        # `M2-BE-416`, and the one place the two commercial modes visibly diverge. A3 *is* a
        # connection, so contact and work start the moment it opens. A5 releases neither until the
        # first stage is funded — managed work that starts unfunded has no protection behind it,
        # and telling a Customer otherwise is the promise this platform cannot keep.
        contact_released_at=now if is_lead_only else None,
        work_may_start_at=now if is_lead_only else None,
    )

    EngagementStage.objects.bulk_create(
        [
            EngagementStage(
                engagement=engagement,
                position=position,
                label=row["label"][:200],
                deliverable=str(row.get("deliverable") or ""),
                amount_paise=int(row["amount_paise"]),
                kind=str(row.get("kind") or EngagementStage.Kind.WORK),
                scheduled_on=row.get("scheduled_on") or None,
                original_terms=stages.original_terms_of(row),
                funding_state=(
                    EngagementStage.FundingState.NOT_REQUIRED
                    if is_lead_only
                    else EngagementStage.FundingState.REQUIRED
                ),
            )
            for position, row in enumerate(rows, start=1)
        ]
    )

    from_status = requirement.status
    requirement.status = CustomerRequirement.Status.ENGAGED
    requirement.save(update_fields=("status", "updated_at"))
    record_transition(
        requirement=requirement,
        from_status=from_status,
        to_status=requirement.status,
        actor=None,
        # Renamed with the handshake it described. A timeline reading "vendor
        # reconfirmed" against a job no vendor confirmed is a record that lies
        # about who did what — and the timeline is what a dispute reads.
        reason_code="selection_confirmed",
        reason=f"engagement:{engagement.id} mode:{engagement.commercial_mode}",
    )
    if is_lead_only:
        # The A3 fee is earned from this point. It is not refunded for a change of mind afterwards,
        # which the Customer was told before they paid it.
        access.consume_unlock(requirement=requirement)
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.engagement.opened",
        idempotency_key=f"engagement-opened:{engagement.id}",
        payload={
            "requirement_id": str(requirement.id),
            "engagement_id": str(engagement.id),
            "commercial_mode": engagement.commercial_mode,
        },
    )
    return engagement
