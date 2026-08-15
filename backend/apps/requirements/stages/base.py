"""The vocabulary every stage command is spelled in: the audit write, the money columns, the lock.

The bottom of `apps.requirements.stages` and the only slice its siblings import from, so the
package's dependency arrows stay one-way. Nothing here decides a transition. It holds the five
things all four command slices above it need before they can decide one: the `EngagementEvent`
append that answers *who did this*, the frozen "as agreed" copy a stage is measured against, the
database-side arithmetic on the engagement's running money totals, the `select_for_update` read
every command re-reads its row through, and the closed-engagement guard.

Where the boundary falls: if a helper is read by more than one of `progress`, `review`, `release`
and `sweeps`, it lives here; if only one of them reads it, it lives with that one.
"""

import uuid
from datetime import date
from typing import Any

from django.db.models import F
from django.utils import timezone

from apps.identity.models import User
from apps.requirements.exceptions import StageTransitionError
from apps.requirements.models import (
    Engagement,
    EngagementEvent,
    EngagementStage,
)

# ---------------------------------------------------------------------------
# Shared plumbing
# ---------------------------------------------------------------------------


def record_event(
    *,
    engagement: Engagement,
    stage: EngagementStage | None,
    from_status: str,
    to_status: str,
    actor: User | None,
    reason_code: str,
    reason: str = "",
) -> EngagementEvent:
    """Append one immutable row to the agreement's audit trail.

    Public for the same reason `services.record_transition` was made public in Wave C2: every
    command that takes an actor has to be able to say *who did this* somewhere durable, and a
    private helper makes the module that owns it the only one that can.
    """
    return EngagementEvent.objects.create(
        engagement=engagement,
        stage=stage,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        reason_code=reason_code,
        reason=reason,
    )


def original_terms_of(row: dict[str, Any]) -> dict[str, Any]:
    """The frozen "as agreed" copy of one stage, written at creation and never again.

    **This is the writer for `EngagementStage.original_terms`** (`M2-BE-549`). It lives here
    rather than beside any one of its callers because there are four places that lay out a stage —
    the quote-flow engagement, the rate-card engagement, an amendment's appended stage and a
    transfer's reprice — and both `engagements` and `amendments` already import this module, so
    putting it in either of them would have closed an import cycle to save a line.

    A stage created without this is a stage whose schedule extension or reprice has nothing to be
    measured against, which is the whole of what `M2-BE-549` asks for.

    `scheduled_on` is serialized to a string because the column is JSON and a `date` is not.
    """
    scheduled = row.get("scheduled_on") or None
    return {
        "label": str(row.get("label") or "")[:200],
        "deliverable": str(row.get("deliverable") or ""),
        "amount_paise": int(row.get("amount_paise") or 0),
        "scheduled_on": (scheduled.isoformat() if isinstance(scheduled, date) else scheduled),
    }


def add_engagement_money(engagement_id: uuid.UUID, **deltas: int) -> None:
    """Move the engagement's maintained money columns by database-side arithmetic.

    `queryset.update()` with `F()` rather than read-modify-write, so two stages approving
    concurrently add rather than overwrite. It also deliberately bypasses `Engagement.save`, whose
    job is to refuse writes to the *frozen* terms — these six columns are not frozen, they are the
    running total the constraints in `M2-BE-504` are checked against.
    """
    Engagement.objects.filter(pk=engagement_id).update(
        **{field: F(field) + amount for field, amount in deltas.items() if amount},
        updated_at=timezone.now(),
    )


def _locked_stage(stage_id: uuid.UUID) -> EngagementStage:
    return (
        EngagementStage.objects.select_for_update(of=("self",))
        .select_related("engagement__requirement__configuration", "engagement__partner")
        .get(pk=stage_id)
    )


def _assert_engagement_live(engagement: Engagement) -> None:
    if engagement.status in (
        Engagement.Status.CANCELLED,
        Engagement.Status.CLOSED,
        Engagement.Status.COMPLETED,
    ):
        raise StageTransitionError("This engagement is closed.")
