"""The engagement stage spine: start, evidence, approval, correction, dispute, release.

**One spine, both archetypes** (`M2-BE-503`). A stage is a shift-day on A3 and a milestone on A5,
and every command below is the same command for both. The two archetypes differ in exactly two
places, and both differences are money rather than lifecycle:

* **Starting.** A3 is `LEAD_ONLY`, so a stage starts when the vendor says work has begun. A5 is
  `MANAGED_PAYMENT_REQUIRED`, so `PENDING → IN_PROGRESS` requires **verified stage funding at face
  value** — the visit-plan money was spent on the visits and settles per share, and discounting a
  stage by it would pay for those visits twice out of the vendor's work.
* **Releasing.** An approved A5 stage writes a held `PartnerLedgerEntry` on the M1 payout rails
  and releases it when the dispute window closes. An approved A3 stage writes nothing, because
  Vsolve never collected the service payment and booking an earning against money it does not hold
  would be fiction.

Everything else — evidence, review, correction, dispute, the review timeout — is identical, which
is the whole point of `07-state-machines-and-permissions.md` §5 and the reason C4 and C5 are thin
tails rather than parallel families.

Three rules run through the module:

**Every actor-bearing command writes an `EngagementEvent`.** Wave C2 found five money-moving
commands that took an actor and recorded nothing with it; that is not repeated here. A
system-driven move — a review timeout, a hold release — records `actor=None`, because the party
that moved it is a clock and signing it with the Customer's name would be a lie in the record that
exists to prove who decided what.

**Idempotent by state.** Every command re-reads its row under `select_for_update` and returns
unchanged when the move has already happened, so an overlapping sweep, a retried task and a
double-tapped button all settle on one outcome. The HTTP layer wraps the actor-bearing ones in
`execute_idempotent` on top of that.

**Nothing here changes an amount.** `M2-BE-508`: scope, amount and completion move only through an
accepted scope amendment, which lives in `apps.requirements.amendments` and delegates its lifecycle
to the M1 engine. `EngagementStage.save` refuses an amount change from anywhere else.

The package follows the stage's own life, in dependency order:

* `base` — the shared vocabulary: the audit append, the frozen original terms, the money-column
  arithmetic, the locked read and the closed-engagement guard. Imports no sibling.
* `progress` — the vendor's half: starting a stage, the evidence bucket, submitting for review.
* `review` — the Customer's half: approve, send back, dispute, the Operations decision and the
  review timeout, with the commission and retention allocation behind an approval.
* `release` — after approval: the payout becomes payable, the engagement completes, the warranty
  runs and closes, and scope taken back out is refunded.
* `sweeps` — the id selectors the periodic tasks read.
"""

from .base import (
    _assert_engagement_live,
    _locked_stage,
    add_engagement_money,
    original_terms_of,
    record_event,
)
from .progress import (
    ACCEPTED_EVIDENCE_MEDIA_TYPES,
    EVIDENCE_UPLOAD_LIFETIME,
    MAXIMUM_EVIDENCE_PER_STAGE,
    MAXIMUM_EVIDENCE_SIZE_BYTES,
    SHA256_PATTERN,
    StageEvidenceUploadGrant,
    _assert_evidence_may_be_added,
    _create_evidence_upload_intent,
    finalize_stage_evidence_upload,
    issue_stage_evidence_upload,
    start_stage,
    submit_stage_evidence,
)
from .release import (
    _assert_no_stage_is_still_open,
    _complete_engagement_if_finished,
    _open_warranty_window,
    _release,
    _release_stage_ledger_hold,
    accept_engagement_completion,
    close_warranty_window,
    refund_stage_amount,
    release_retention_hold,
    release_stage_payout,
    warranty_close_due_ids,
)
from .review import (
    DISPUTE_OUTCOMES,
    _approve,
    _clear_engagement_dispute,
    _hold_stage_payout,
    _stage_commission_paise,
    _stage_retention_paise,
    approve_stage,
    dispute_stage,
    expire_stage_review,
    request_stage_correction,
    resolve_stage_dispute,
    settle_stage_with_project_completion_code,
)
from .sweeps import (
    orphaned_stage_evidence_upload_ids,
    stage_payout_release_due_ids,
    stage_review_due_ids,
)

__all__ = [
    "ACCEPTED_EVIDENCE_MEDIA_TYPES",
    "DISPUTE_OUTCOMES",
    "EVIDENCE_UPLOAD_LIFETIME",
    "MAXIMUM_EVIDENCE_PER_STAGE",
    "MAXIMUM_EVIDENCE_SIZE_BYTES",
    "SHA256_PATTERN",
    "StageEvidenceUploadGrant",
    "_approve",
    "_assert_engagement_live",
    "_assert_evidence_may_be_added",
    "_assert_no_stage_is_still_open",
    "_clear_engagement_dispute",
    "_complete_engagement_if_finished",
    "_create_evidence_upload_intent",
    "_hold_stage_payout",
    "_locked_stage",
    "_open_warranty_window",
    "_release",
    "_release_stage_ledger_hold",
    "_stage_commission_paise",
    "_stage_retention_paise",
    "accept_engagement_completion",
    "add_engagement_money",
    "approve_stage",
    "close_warranty_window",
    "dispute_stage",
    "expire_stage_review",
    "finalize_stage_evidence_upload",
    "issue_stage_evidence_upload",
    "original_terms_of",
    "orphaned_stage_evidence_upload_ids",
    "record_event",
    "refund_stage_amount",
    "release_retention_hold",
    "release_stage_payout",
    "request_stage_correction",
    "resolve_stage_dispute",
    "settle_stage_with_project_completion_code",
    "stage_payout_release_due_ids",
    "stage_review_due_ids",
    "start_stage",
    "submit_stage_evidence",
    "warranty_close_due_ids",
]
