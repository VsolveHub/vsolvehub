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

from apps.requirements import attachments, matching, proposals, services
from apps.requirements.models import (
    CustomerRequirement,
    RequirementAttachmentUpload,
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
# Attachment housekeeping
# ---------------------------------------------------------------------------


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
