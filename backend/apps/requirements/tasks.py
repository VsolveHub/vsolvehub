"""Periodic M2 watchdogs: expiry, SLA breach, invitation replacement, quote expiry.

Until 12 August 2026 these four sweeps existed only as selectors — `expired_requirement_ids`,
`sla_breached_requirement_ids`, `expired_invitation_ids`, `expired_proposal_ids` — with no
`CELERY_BEAT_SCHEDULE` entry behind any of them. Nothing outside their own tests ever called them,
which meant an unanswered invitation wave stalled forever and a requirement whose needed-by date had
passed was never closed by anything. This module is the missing half.

Two properties every sweep here has, following `apps.fulfilment.tasks`:

**Idempotent under overlapping runs.** Every per-record task delegates to a domain command that is
idempotent by state — `close_requirement` returns early on an already-closed requirement,
`expire_proposal` on an already-expired quote, and `expire_invitation_and_replace` invites a
replacement only when this call is the one that moved the invitation. A slow tick overlapping the
next one therefore changes nothing twice, and in particular **a replay cannot double-invite**.

**The sweep decides only when to look.** Whether a record actually qualifies is the domain's
decision, re-taken under a row lock inside the per-record task. A sweep that re-derived the rule
would drift from the command, and the drift would show up as records the watchdog thinks it has
already handled.
"""

from contextlib import suppress
from uuid import UUID

from celery import shared_task

from apps.requirements import (
    access,
    attachments,
    engagements,
    matching,
    proposals,
    services,
    stages,
)
from apps.requirements.models import (
    CustomerRequirement,
    RequirementAttachmentUpload,
    StageEvidenceUpload,
)
from apps.requirements.storage import DocumentStorageError, get_attachment_storage

#: How many records one tick hands off. Bounded so a backlog is drained over several ticks rather
#: than filling the queue in one, which is how a watchdog turns into an outage.
SWEEP_BATCH_SIZE = 200


# ---------------------------------------------------------------------------
# `service_by` — the clock that outranks every other clock
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def close_one_expired_requirement(_self: object, requirement_id: str) -> None:
    services.close_requirement(
        requirement_id=UUID(requirement_id),
        status=CustomerRequirement.Status.CLOSED_EXPIRED,
        reason_code="service_by_passed",
    )


@shared_task
def sweep_expired_requirements() -> int:
    """Close every live requirement whose needed-by date has passed.

    A quote delivered after the work date is worthless, so this clock outranks the delivery SLA and
    every other transition. Refunding an unlock against a closed requirement is `M2-BE-705` and
    arrives with the unlock itself in Wave C2; `close_requirement` emits `m2.requirement.closed`,
    which is the event that refund path will consume, so nothing has to be re-plumbed here later.
    """
    swept = 0
    for requirement_id in services.expired_requirement_ids()[:SWEEP_BATCH_SIZE]:
        close_one_expired_requirement.delay(str(requirement_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Quote-delivery SLA
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def close_one_sla_breached_requirement(_self: object, requirement_id: str) -> None:
    services.close_requirement(
        requirement_id=UUID(requirement_id),
        status=CustomerRequirement.Status.CLOSED_SLA_BREACH,
        reason_code="quote_delivery_sla_missed",
    )


@shared_task
def sweep_sla_breached_requirements() -> int:
    """Close requirements still matching past the delivery promise, with no quote yet.

    Nothing was charged, so this is an explanation rather than a refund — and the explanation is the
    point. `CLOSED_SLA_BREACH` is a distinct status precisely so "nobody covers this yet" and "we
    ran out of time" reach the Customer as different sentences with different next actions.

    **The Customer notification is not sent from here and is not sent at all yet.** The escalation
    ladder in `apps.notifications.escalation` is built and its transport is a fail-closed seam
    waiting on MSG91 (`M2-BE-807`). Emitting `m2.requirement.closed` and leaving the delivery
    unwired is honest; calling a transport that raises would turn a missed promise into a retry
    storm.
    """
    swept = 0
    for requirement_id in services.sla_breached_requirement_ids()[:SWEEP_BATCH_SIZE]:
        close_one_sla_breached_requirement.delay(str(requirement_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Invitations — the sweep the delivery promise actually depends on
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def expire_one_invitation(_self: object, invitation_id: str) -> int:
    """Expire one invitation and invite its replacement. Returns how many were invited.

    The replacement is taken inside `expire_invitation_and_replace`, in the same transaction and
    under the same requirement lock as the expiry, so a retried task cannot expire once and invite
    twice.
    """
    replacements = matching.expire_invitation_and_replace(invitation_id=UUID(invitation_id))
    return len(replacements)


@shared_task
def sweep_expired_invitations() -> int:
    """Expire unanswered invitations, release their slots and invite replacements.

    This is the sweep whose absence stalled M2: without it a wave that nobody answered sat holding
    every quote slot until the requirement's delivery promise elapsed, and the Customer's only
    signal was silence followed by `CLOSED_SLA_BREACH`.
    """
    swept = 0
    for invitation_id in matching.expired_invitation_ids()[:SWEEP_BATCH_SIZE]:
        expire_one_invitation.delay(str(invitation_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Proposal validity
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def expire_one_proposal(_self: object, proposal_id: str) -> None:
    proposals.expire_proposal(proposal_id=UUID(proposal_id))


@shared_task
def sweep_expired_proposals() -> int:
    """Retire quotes past their own validity date, so nobody unlocks one that is already dead."""
    swept = 0
    for proposal_id in proposals.expired_proposal_ids()[:SWEEP_BATCH_SIZE]:
        expire_one_proposal.delay(str(proposal_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Visit-plan share settlement (`M2-BE-425`)
#
# Four clocks, four sweeps, and they are separate because their outcomes are. A slot nobody took
# refunds; a slot somebody took and abandoned refunds *or* buys a replacement; a hold nobody paid
# for simply lapses. Collapsing them would make one policy decision stand for three.
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def refund_one_unfilled_share(_self: object, share_id: str) -> None:
    access.refund_share(share_id=UUID(share_id), reason_code="m2_visit_slot_never_filled")


@shared_task
def sweep_unfilled_visit_shares() -> int:
    """Refund every plan slot no vendor ever took, once the visit-delivery SLA passes.

    This is the promise that makes the A5 front door honest: a Customer who paid for three visits
    and received two gets the third one's share back **without a support ticket**. `refund_share`
    is idempotent by state, so two overlapping ticks issue one refund.
    """
    swept = 0
    for share_id in access.unfilled_share_ids()[:SWEEP_BATCH_SIZE]:
        refund_one_unfilled_share.delay(str(share_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def settle_one_missed_estimate(_self: object, site_visit_id: str) -> None:
    access.settle_missed_estimate(site_visit_id=UUID(site_visit_id))


@shared_task
def sweep_missed_estimate_windows() -> int:
    """A vendor visited, produced nothing, and the post-visit window closed.

    The visit-side analogue of a non-responsive quote. The share refunds or buys a free replacement
    visit depending on whether the plan still has time to run — `settle_missed_estimate` decides,
    because that is a policy question and this only decides when to ask it.
    """
    swept = 0
    for visit_id in access.missed_estimate_visit_ids()[:SWEEP_BATCH_SIZE]:
        settle_one_missed_estimate.delay(str(visit_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def release_one_expired_visit_hold(_self: object, site_visit_id: str) -> None:
    access.release_expired_visit_hold(site_visit_id=UUID(site_visit_id))


@shared_task
def sweep_expired_visit_holds() -> int:
    """Hand back the grid slot of a first visit the Customer never paid for.

    Nothing was charged, so nothing is refunded — the hold lapses, the share returns to `OPEN` and
    the vendor's time goes back on the availability grid. Without this sweep "the hold expires
    harmlessly if they never pay" would be a sentence with no code behind it, and a vendor's diary
    would carry a dead reservation forever.
    """
    swept = 0
    for visit_id in access.expired_visit_hold_ids()[:SWEEP_BATCH_SIZE]:
        release_one_expired_visit_hold.delay(str(visit_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def release_one_visit_payout_hold(_self: object, share_id: str) -> None:
    access.release_visit_payout_hold(share_id=UUID(share_id))


@shared_task
def sweep_visit_payout_holds() -> int:
    """Make earned visit payouts payable once the vendor's bank details land.

    The progressive gate holds the money, it does not cancel it: a vendor who completed a visit and
    delivered an estimate is owed regardless of when they get round to onboarding their account.
    `payouts.release_payout_hold` cannot do this — it resolves by Booking, and a visit has none.
    """
    swept = 0
    for share_id in access.held_visit_payout_share_ids()[:SWEEP_BATCH_SIZE]:
        release_one_visit_payout_hold.delay(str(share_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Vendor reconfirmation (`M2-BE-408`, `409`)
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def expire_one_selection(_self: object, selection_id: str) -> None:
    engagements.expire_selection(selection_id=UUID(selection_id))


@shared_task
def sweep_expired_selections() -> int:
    """Release a selection the chosen vendor never answered.

    The Customer's unlock or visit plan survives it untouched — that is the whole point of the
    command this calls — so the requirement returns to the state it was selectable from and the
    next quote costs nothing more. Without the sweep a silent vendor would freeze a requirement in
    `SELECTED` until its needed-by date.
    """
    swept = 0
    for selection_id in engagements.expired_selection_ids()[:SWEEP_BATCH_SIZE]:
        expire_one_selection.delay(str(selection_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Attachment housekeeping
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# The engagement stage spine (`M2-BE-503`, `M2-BE-507`)
#
# Two clocks, two sweeps, and their cadences differ for the reason the C1 and C2 cadences differ:
# one of them decides that silence was consent, and the other only moves money that is already
# earned.
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def expire_one_stage_review(_self: object, stage_id: str) -> None:
    stages.expire_stage_review(stage_id=UUID(stage_id))


@shared_task
def sweep_stage_reviews() -> int:
    """Approve stages whose review window closed with no decision.

    `07-state-machines-and-permissions.md` §5 permits `AWAITING_REVIEW → APPROVED` on review
    timeout **except while the stage is `DISPUTED`**. That exception is enforced twice on purpose:
    a disputed stage has its `review_due_at` cleared so it cannot appear in the selector at all,
    and `expire_stage_review` re-checks the status under the row lock — because a Customer can
    dispute in the window between this sweep reading a list and the task acting on one entry, and
    that is exactly the moment auto-approval would settle an objection by ignoring it.

    A stage whose variant has no configured review window is never swept, because
    `pricing.stage_review_deadline` answers `None` and this selector requires a real deadline.
    Releasing a vendor's money against a clock nobody set is the failure that would be worse than
    waiting.
    """
    swept = 0
    for stage_id in stages.stage_review_due_ids()[:SWEEP_BATCH_SIZE]:
        expire_one_stage_review.delay(str(stage_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def release_one_stage_payout(_self: object, stage_id: str) -> None:
    stages.release_stage_payout(stage_id=UUID(stage_id))


@shared_task
def sweep_stage_payout_holds() -> int:
    """Release approved stages past their dispute window, and held earnings past their gate.

    One sweep for both halves because one command handles both, and each half is idempotent on its
    own: the stage moves to `RELEASED` when its window closes, and the ledger entry moves to
    `AVAILABLE` when the vendor's payout account is verified. A vendor who never adds bank details
    keeps a `PENDING` entry indefinitely, which is the honest record — the debt is real and unpaid.

    `payouts.release_payout_hold` cannot do this: it resolves an entry **by Booking**, and a stage
    has none. The same reason `access.release_visit_payout_hold` exists for a visit payout.
    """
    swept = 0
    for stage_id in stages.stage_payout_release_due_ids()[:SWEEP_BATCH_SIZE]:
        release_one_stage_payout.delay(str(stage_id))
        swept += 1
    return swept


@shared_task
def sweep_orphaned_stage_evidence_uploads() -> int:
    """Mark expired evidence-upload intents and delete any bytes that arrived against them.

    The stage twin of `sweep_orphaned_attachment_uploads`, and the same problem: an intent whose
    signed URL was used and never finalized is storage nobody owns and no record points at.
    """
    swept = 0
    for upload_id in stages.orphaned_stage_evidence_upload_ids()[:SWEEP_BATCH_SIZE]:
        upload = StageEvidenceUpload.objects.filter(
            id=upload_id,
            status=StageEvidenceUpload.Status.ISSUED,
        ).first()
        if upload is None:
            continue
        StageEvidenceUpload.objects.filter(id=upload.id).update(
            status=StageEvidenceUpload.Status.EXPIRED,
            failure_code="upload_expired",
        )
        with suppress(DocumentStorageError):
            get_attachment_storage().delete_object(object_key=upload.object_key)
        swept += 1
    return swept


@shared_task
def sweep_orphaned_attachment_uploads() -> int:
    """Mark expired upload intents and delete any bytes that arrived against them.

    An intent whose signed URL was used and never finalized is storage nobody owns and no record
    points at. Following `apps.partners.tasks.cleanup_partner_document_uploads`, which solves the
    same problem for KYC documents.
    """
    swept = 0
    for upload_id in attachments.orphaned_upload_ids()[:SWEEP_BATCH_SIZE]:
        upload = RequirementAttachmentUpload.objects.filter(
            id=upload_id,
            status=RequirementAttachmentUpload.Status.ISSUED,
        ).first()
        if upload is None:
            continue
        RequirementAttachmentUpload.objects.filter(id=upload.id).update(
            status=RequirementAttachmentUpload.Status.EXPIRED,
            failure_code="upload_expired",
        )
        # The intent is already marked expired, so nothing will finalize against it. A byte range
        # the provider would not delete is a storage-side orphan and not a reason to leave a live
        # intent behind, so a failure here is suppressed rather than retried.
        with suppress(DocumentStorageError):
            get_attachment_storage().delete_object(object_key=upload.object_key)
        swept += 1
    return swept
