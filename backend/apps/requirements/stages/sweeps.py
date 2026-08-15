"""The id lists the periodic tasks read, and nothing else.

Three read-only selectors, one per sweep in `apps.requirements.tasks`: reviews that timed out,
payouts whose dispute window has passed, upload intents nobody ever finalized. They answer *which
rows are due*; the commands in `review`, `release` and `progress` answer what happens to one, and
each re-checks its own precondition under a row lock rather than trusting a list that was true a
moment ago.

Where the boundary falls: nothing here writes, and nothing here takes an actor. The warranty's own
selector, `warranty_close_due_ids`, stays beside `close_warranty_window` in `release`, because the
two-halves-in-one-selector reasoning only reads next to the command it feeds.
"""

import uuid
from datetime import datetime

from django.utils import timezone

from apps.payouts.models import PartnerLedgerEntry
from apps.requirements.models import (
    EngagementStage,
    StageEvidenceUpload,
)

# ---------------------------------------------------------------------------
# Sweep selectors. The tasks decide only *when* to look.
# ---------------------------------------------------------------------------


def stage_review_due_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Stages whose review window has closed with no decision.

    `DISPUTED` stages cannot appear here twice over: their status is not `AWAITING_REVIEW`, and
    `dispute_stage` clears `review_due_at` outright. The command re-checks anyway.
    """
    moment = at or timezone.now()
    return list(
        EngagementStage.objects.filter(
            status=EngagementStage.Status.AWAITING_REVIEW,
            review_due_at__isnull=False,
            review_due_at__lt=moment,
        ).values_list("id", flat=True)
    )


def stage_payout_release_due_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Approved stages past their dispute window, and released ones still waiting on an account.

    One selector for both because one command handles both: `release_stage_payout` moves the stage
    if it can and the ledger entry if it can, and each half is idempotent on its own.
    """
    moment = at or timezone.now()
    due = EngagementStage.objects.filter(
        status=EngagementStage.Status.APPROVED,
        payout_release_due_at__isnull=False,
        payout_release_due_at__lt=moment,
    ).values_list("id", flat=True)
    held = EngagementStage.objects.filter(
        status=EngagementStage.Status.RELEASED,
        ledger_entry__isnull=False,
        ledger_entry__status=PartnerLedgerEntry.Status.PENDING,
    ).values_list("id", flat=True)
    return list(dict.fromkeys([*due, *held]))


def orphaned_stage_evidence_upload_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Evidence upload intents that expired without ever being finalized."""
    moment = at or timezone.now()
    return list(
        StageEvidenceUpload.objects.filter(
            status=StageEvidenceUpload.Status.ISSUED,
            expires_at__lt=moment,
        ).values_list("id", flat=True)
    )
