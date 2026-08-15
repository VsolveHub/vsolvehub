"""The two records a shift-day can produce that are not about the work: harm, and a cash demand.

Both are first-class records rather than flags on a booking, and neither one changes the
engagement: a safety report is never a cancellation reason, and a cash-demand report is never an
automatic finding against a vendor. Each writes an immutable account, records a standing event or
opens an Operations case, and stops there — the one exception being the removal on pattern at the
bottom, which fires only against a threshold the owner published.

The boundary: nothing here reads crew, attendance, settlement or terms. These commands take an
engagement (and optionally a stage) and can be filed at any point in its life, which is why they
share none of the shift-day guards the rest of the package opens with.
"""

import uuid
from datetime import datetime

from django.db import transaction
from django.utils import timezone

from apps.cases.models import OperationsCase
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners import standing
from apps.partners.models import PartnerStandingEvent
from apps.requirements import disputes, stages
from apps.requirements.exceptions import (
    RequirementNotFoundError,
    StageTransitionError,
)
from apps.requirements.models import (
    CashDemandReport,
    Engagement,
    EngagementStage,
    SafetyIncident,
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
