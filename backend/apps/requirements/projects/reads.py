"""The read (`M2-BE-541`, `549`).

Everything the A5 project surface answers with, and nothing it changes. `project_payload` is the
one screen — milestones, money, warranty, handover and whatever recovery is in flight — and
`milestone_rows` is the part of it that publishes each milestone twice: as agreed, and as it
stands now. The three lookups below it resolve one record for a caller who is entitled to see it,
raising `404` rather than `403` when they are not.

The boundary is that **nothing in this module writes**. No row is created, no status moves, no
deadline is swept; opening the project screen changes nothing. That is also why this module
imports no sibling — a read that had to reach into a command would be a read that could.
"""

import uuid
from datetime import date
from typing import Any

from django.db.models import Q

from apps.identity.models import User
from apps.requirements.exceptions import RequirementNotFoundError
from apps.requirements.models import (
    Engagement,
    EngagementStage,
    ProjectDelayClaim,
    ProjectDeliverable,
    ProjectTransfer,
)


def milestone_rows(engagement: Engagement) -> list[dict[str, Any]]:
    """Every milestone, as agreed and as it stands now (`M2-BE-549`).

    The two readings sit side by side rather than one replacing the other, because "what did we
    agree" and "what is due" are different questions and a project screen that can only answer the
    second is useless in a dispute. `schedule_shift_days` is published rather than left to the
    client to subtract: a date difference computed in a browser is a date difference computed in
    whatever timezone the browser happens to be in.
    """
    rows: list[dict[str, Any]] = []
    for stage in EngagementStage.objects.filter(engagement=engagement).order_by("position"):
        original = stage.original_terms or {}
        original_scheduled = original.get("scheduled_on")
        shift_days: int | None = None
        if stage.scheduled_on is not None and isinstance(original_scheduled, str):
            try:
                shift_days = (stage.scheduled_on - date.fromisoformat(original_scheduled)).days
            except ValueError:
                shift_days = None
        rows.append(
            {
                "stage_id": stage.id,
                "position": stage.position,
                "milestone_label": stage.label,
                "deliverable": stage.deliverable,
                "kind": stage.kind,
                "amount_paise": stage.amount_paise,
                "scheduled_on": stage.scheduled_on,
                "status": stage.status,
                "funding_state": stage.funding_state,
                "funded_paise": stage.funded_paise,
                "refunded_amount_paise": stage.refunded_amount_paise,
                "cancellation_reason_code": stage.cancellation_reason_code,
                "original_milestone_label": str(original.get("label") or ""),
                "original_deliverable": str(original.get("deliverable") or ""),
                "original_amount_paise": int(original.get("amount_paise") or 0),
                "original_scheduled_on": original_scheduled,
                "schedule_shift_days": shift_days,
            }
        )
    return rows


def project_payload(engagement: Engagement) -> dict[str, Any]:
    """The whole A5 project as one read.

    One request rather than five, for the reason `shift_day_payload` gives on the other archetype:
    the milestone list, the money, the warranty, the handover and whatever recovery is in flight
    are the same screen at five moments of one project, and a client assembling them from five
    endpoints would render four of them against a state the fifth had already left.

    Reads only. Nothing here creates a row, so opening the screen changes nothing.
    """
    live_transfer = (
        ProjectTransfer.objects.filter(engagement=engagement)
        .order_by("-created_at")
        .select_related("to_partner", "from_partner")
        .first()
    )
    return {
        "engagement_id": engagement.id,
        "status": engagement.status,
        "commercial_mode": engagement.commercial_mode,
        "total_paise": engagement.total_paise,
        "staged_total_paise": engagement.staged_total_paise,
        "amendment_delta_paise": engagement.amendment_delta_paise,
        "funded_total_paise": engagement.funded_total_paise,
        "approved_total_paise": engagement.approved_total_paise,
        "released_total_paise": engagement.released_total_paise,
        "refunded_total_paise": engagement.refunded_total_paise,
        "retention_paise": engagement.retention_paise,
        "retention_withheld_paise": engagement.retention_withheld_paise,
        "warranty_ends_at": engagement.warranty_ends_at,
        "milestones": milestone_rows(engagement),
        "handover": {
            "submitted_at": engagement.handover_submitted_at,
            "accepted_at": engagement.handover_accepted_at,
            "note": engagement.handover_note,
            "deliverables": list(
                ProjectDeliverable.objects.filter(engagement=engagement).order_by("created_at")
            ),
        },
        "delay_claims": list(
            ProjectDelayClaim.objects.filter(engagement=engagement)
            .prefetch_related("evidence")
            .order_by("-created_at")
        ),
        "transfer": live_transfer,
    }


def live_delay_claim(stage: EngagementStage) -> ProjectDelayClaim | None:
    return ProjectDelayClaim.objects.filter(
        stage=stage,
        status__in=ProjectDelayClaim.LIVE_STATUSES,
    ).first()


def delay_claim_for_participant(*, user: User, delay_claim_id: uuid.UUID) -> ProjectDelayClaim:
    """One delay claim, if the caller is either party to its engagement. `404` otherwise."""
    claim = (
        ProjectDelayClaim.objects.select_related("engagement__partner", "stage")
        .filter(
            Q(engagement__customer=user) | Q(engagement__partner__user=user),
            id=delay_claim_id,
        )
        .first()
    )
    if claim is None:
        raise RequirementNotFoundError()
    return claim


def transfer_for_customer(*, customer: User, project_transfer_id: uuid.UUID) -> ProjectTransfer:
    """One transfer proposal, scoped to the Customer who has to decide it."""
    transfer = (
        ProjectTransfer.objects.select_related("engagement", "from_partner", "to_partner")
        .filter(engagement__customer=customer, id=project_transfer_id)
        .first()
    )
    if transfer is None:
        raise RequirementNotFoundError()
    return transfer
