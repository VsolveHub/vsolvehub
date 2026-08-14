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
"""

import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Final

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from apps.commerce.models import Refund
from apps.commerce.services import request_standalone_refund
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import payable_account
from apps.requirements import pricing, services
from apps.requirements.exceptions import (
    AttachmentRejectedError,
    StageDisputedError,
    StageNotFundedError,
    StageTransitionError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    EngagementEvent,
    EngagementStage,
    StageEvidence,
    StageEvidenceUpload,
)
from apps.requirements.storage import (
    DocumentStorage,
    DocumentStorageError,
    get_attachment_storage,
)

SHA256_PATTERN: Final = re.compile(r"^[0-9a-f]{64}$")

#: How long a signed evidence-upload URL is good for, before the provider's own expiry replaces
#: it on the row. Matches the requirement-attachment intent for the same reason.
EVIDENCE_UPLOAD_LIFETIME: Final = timedelta(hours=2)

#: Media types accepted per evidence kind, with the suffix the object key gets. An allow-list, and
#: keyed by kind: a "document" that is really an `image/svg+xml` is a script.
ACCEPTED_EVIDENCE_MEDIA_TYPES: Final[dict[str, dict[str, str]]] = {
    StageEvidence.Kind.PHOTO: {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
    },
    StageEvidence.Kind.VIDEO: {
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/webm": ".webm",
    },
    StageEvidence.Kind.DOCUMENT: {
        "application/pdf": ".pdf",
    },
}

MAXIMUM_EVIDENCE_SIZE_BYTES: Final[dict[str, int]] = {
    StageEvidence.Kind.PHOTO: 12 * 1024 * 1024,
    StageEvidence.Kind.VIDEO: 80 * 1024 * 1024,
    StageEvidence.Kind.DOCUMENT: 20 * 1024 * 1024,
}

#: How many evidence rows one stage may carry. A dispute reads these; forty photographs of one
#: shift-day are read by nobody.
MAXIMUM_EVIDENCE_PER_STAGE: Final = 20


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


# ---------------------------------------------------------------------------
# Start (`M2-BE-503`)
# ---------------------------------------------------------------------------


@transaction.atomic
def start_stage(*, stage_id: uuid.UUID, actor: User) -> EngagementStage:
    """Begin work on one stage. Partner command.

    `PENDING → IN_PROGRESS`, and `CORRECTION_REQUESTED → IN_PROGRESS` — the second arrow is the
    one `07-state-machines-and-permissions.md` §5 draws out of a correction, and it exists as its
    own move rather than being folded into the next evidence submission so the record says when
    the vendor actually went back to work.

    **A5 requires verified funding at face value.** `complete_stage_funding` already moves a funded
    stage to `IN_PROGRESS` on the provider callback, so on a well-behaved A5 flow this command is
    an idempotent no-op; reaching it on an unfunded stage is a vendor starting managed work with
    nothing behind it, which is exactly what `m2_stage_not_funded` is for.
    """
    stage = _locked_stage(stage_id)
    engagement = stage.engagement
    _assert_engagement_live(engagement)
    if stage.status == EngagementStage.Status.IN_PROGRESS:
        return stage
    if stage.status not in (
        EngagementStage.Status.PENDING,
        EngagementStage.Status.CORRECTION_REQUESTED,
    ):
        raise StageTransitionError("This stage is not waiting to be started.")

    if engagement.commercial_mode == Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED and (
        stage.funding_state != EngagementStage.FundingState.FUNDED
    ):
        raise StageNotFundedError()
    if engagement.work_may_start_at is None:
        raise StageTransitionError("Work has not been cleared to start on this engagement yet.")

    from_status = stage.status
    stage.status = EngagementStage.Status.IN_PROGRESS
    stage.started_at = stage.started_at or timezone.now()
    stage.correction_note = ""
    stage.save(update_fields=("status", "started_at", "correction_note", "updated_at"))
    record_event(
        engagement=engagement,
        stage=stage,
        from_status=from_status,
        to_status=stage.status,
        actor=actor,
        reason_code="stage_started",
    )
    return stage


# ---------------------------------------------------------------------------
# Evidence (`M2-BE-503`)
#
# The presign/finalize shape is `apps.requirements.attachments`', which is
# `apps.foundation.storage`'s, which is what `02-backend-tasks.md` §"Reuse before building" names
# against stage evidence: **a bucket, not an adapter**. Bytes never pass through Django, the server
# names the object key, and finalization compares the object that arrived against the intent.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class StageEvidenceUploadGrant:
    upload: StageEvidenceUpload
    upload_url: str
    upload_token: str
    expires_at: datetime


def _assert_evidence_may_be_added(stage: EngagementStage) -> None:
    """Evidence attaches while the stage is the vendor's to work on or to defend.

    `DISPUTED` is deliberately included: a vendor answering a dispute needs to be able to add the
    photograph that answers it, and a dispute process where only one side may file is not one.

    `PENDING` was added in Wave C5 for `M2-BE-544`. A customer-caused delay claim is evidence
    about work that has **not** started — a locked gate, an occupied site, materials the Customer
    was supplying that never arrived — so refusing evidence until the stage starts would make the
    one claim that most needs a photograph the one claim that cannot carry one. The bound on
    volume (`MAXIMUM_EVIDENCE_PER_STAGE`) is unchanged and is what stops this being an open
    upload endpoint.
    """
    if stage.status not in (
        EngagementStage.Status.PENDING,
        EngagementStage.Status.IN_PROGRESS,
        EngagementStage.Status.AWAITING_REVIEW,
        EngagementStage.Status.CORRECTION_REQUESTED,
        EngagementStage.Status.DISPUTED,
    ):
        raise StageTransitionError("This stage no longer accepts evidence.")


@transaction.atomic
def _create_evidence_upload_intent(
    *,
    stage_id: uuid.UUID,
    kind: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
) -> StageEvidenceUpload:
    stage = _locked_stage(stage_id)
    _assert_evidence_may_be_added(stage)

    accepted = ACCEPTED_EVIDENCE_MEDIA_TYPES.get(kind)
    if accepted is None:
        raise AttachmentRejectedError("That evidence type is not supported.")
    normalized = content_type.lower().partition(";")[0].strip()
    suffix = accepted.get(normalized)
    if suffix is None:
        raise AttachmentRejectedError("That file type cannot be attached as evidence.")
    if size_bytes <= 0:
        raise AttachmentRejectedError("That file is empty.")
    if size_bytes > MAXIMUM_EVIDENCE_SIZE_BYTES[kind]:
        allowed_mb = MAXIMUM_EVIDENCE_SIZE_BYTES[kind] // (1024 * 1024)
        raise AttachmentRejectedError(f"That file is larger than {allowed_mb} MB.")
    if not SHA256_PATTERN.fullmatch(sha256):
        raise AttachmentRejectedError("That file's checksum is invalid.")
    if StageEvidence.objects.filter(stage=stage).count() >= MAXIMUM_EVIDENCE_PER_STAGE:
        raise AttachmentRejectedError(
            f"You can attach up to {MAXIMUM_EVIDENCE_PER_STAGE} files to one stage.",
        )

    # Server-generated, and it names no person. The stage id is already an unguessable UUID, and
    # putting a Partner's name in an object key is how a storage listing becomes a contact export.
    object_key = f"engagement-stages/{stage.id}/{kind.lower()}/{uuid.uuid4().hex}{suffix}"
    return StageEvidenceUpload.objects.create(
        stage=stage,
        kind=kind,
        object_key=object_key,
        content_type=normalized,
        size_bytes=size_bytes,
        sha256=sha256,
        expires_at=timezone.now() + EVIDENCE_UPLOAD_LIFETIME,
    )


def issue_stage_evidence_upload(
    *,
    stage_id: uuid.UUID,
    kind: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
    storage: DocumentStorage | None = None,
) -> StageEvidenceUploadGrant:
    """Record the intent, then ask storage for a signed URL."""
    upload = _create_evidence_upload_intent(
        stage_id=stage_id,
        kind=kind,
        content_type=content_type,
        size_bytes=size_bytes,
        sha256=sha256,
    )
    provider = storage or get_attachment_storage()
    try:
        signed = provider.create_signed_upload(object_key=upload.object_key)
    except DocumentStorageError as exc:
        # `FAILED`, not left `ISSUED`. An intent nothing can ever be uploaded against is not
        # pending, and leaving it pending makes the orphan sweep the only thing that knows.
        StageEvidenceUpload.objects.filter(id=upload.id).update(
            status=StageEvidenceUpload.Status.FAILED,
            failure_code="provider_unavailable",
        )
        raise AttachmentRejectedError(
            "Evidence uploads are temporarily unavailable. Try again.",
            retryable=True,
        ) from exc

    upload.expires_at = signed.expires_at
    upload.save(update_fields=("expires_at", "updated_at"))
    return StageEvidenceUploadGrant(
        upload=upload,
        upload_url=signed.upload_url,
        upload_token=signed.upload_token,
        expires_at=signed.expires_at,
    )


def finalize_stage_evidence_upload(
    *,
    stage_id: uuid.UUID,
    upload_id: uuid.UUID,
    actor: User,
    storage: DocumentStorage | None = None,
) -> StageEvidence:
    """Verify the object that arrived and turn the intent into evidence.

    The verification is a network round trip and happens outside the transaction; the decision it
    feeds is taken inside one, under a row lock, so two concurrent finalizes of the same intent
    produce one evidence row.
    """
    upload = StageEvidenceUpload.objects.filter(id=upload_id, stage_id=stage_id).first()
    if upload is None:
        raise AttachmentRejectedError("We could not find that upload.")
    if upload.status != StageEvidenceUpload.Status.ISSUED:
        raise AttachmentRejectedError("This upload cannot be finalized again.")
    if upload.expires_at <= timezone.now():
        StageEvidenceUpload.objects.filter(id=upload.id).update(
            status=StageEvidenceUpload.Status.EXPIRED,
            failure_code="upload_expired",
        )
        raise AttachmentRejectedError("That upload expired. Attach the file again.")

    provider = storage or get_attachment_storage()
    try:
        verified = provider.verify_object(
            object_key=upload.object_key,
            maximum_size_bytes=MAXIMUM_EVIDENCE_SIZE_BYTES[upload.kind],
        )
    except DocumentStorageError as exc:
        raise AttachmentRejectedError(
            "We could not check that file. Try again.",
            retryable=True,
        ) from exc

    mismatch = (
        verified.size_bytes != upload.size_bytes
        or verified.content_type != upload.content_type
        or verified.sha256 != upload.sha256
    )

    evidence: StageEvidence | None = None
    failure_message: str | None = None
    with transaction.atomic():
        locked = StageEvidenceUpload.objects.select_for_update().get(id=upload.id)
        if locked.status != StageEvidenceUpload.Status.ISSUED:
            raise AttachmentRejectedError("This upload cannot be finalized again.")
        if mismatch:
            locked.status = StageEvidenceUpload.Status.FAILED
            locked.failure_code = "metadata_mismatch"
            locked.save(update_fields=("status", "failure_code", "updated_at"))
            failure_message = "That file did not match what your device sent. Attach it again."
        else:
            evidence = StageEvidence.objects.create(
                stage_id=stage_id,
                kind=locked.kind,
                object_key=locked.object_key,
                content_type=locked.content_type,
                size_bytes=locked.size_bytes,
                sha256=locked.sha256,
                # `PENDING`, not `VERIFIED`. The bytes are the ones the client promised; whether
                # they are safe is a separate question a scanner answers, and conflating the two
                # is how a scanner becomes decoration.
                processing_status=StageEvidence.ProcessingStatus.PENDING,
                submitted_by=actor,
            )
            locked.status = StageEvidenceUpload.Status.VERIFIED
            locked.finalized_at = timezone.now()
            locked.failure_code = ""
            locked.save(update_fields=("status", "finalized_at", "failure_code", "updated_at"))

    if failure_message is not None:
        raise AttachmentRejectedError(failure_message)
    if evidence is None:  # pragma: no cover - the branches above are exhaustive
        raise AttachmentRejectedError("We could not attach that file.")
    return evidence


@transaction.atomic
def submit_stage_evidence(*, stage_id: uuid.UUID, actor: User, note: str) -> EngagementStage:
    """Hand the stage to the Customer for review. Partner command.

    `IN_PROGRESS → AWAITING_REVIEW`, and it is the moment the review clock starts. The note is
    required and is stored as its own append-only `NOTE` evidence row rather than as a column on
    the stage, so a correction cycle leaves both accounts readable: what the vendor said the first
    time and what they said after the Customer pushed back.
    """
    stage = _locked_stage(stage_id)
    engagement = stage.engagement
    _assert_engagement_live(engagement)
    if stage.status not in (
        EngagementStage.Status.IN_PROGRESS,
        EngagementStage.Status.AWAITING_REVIEW,
    ):
        raise StageTransitionError("Start this stage before submitting what was done.")
    if not note.strip():
        raise AttachmentRejectedError("Say what was done on this stage before submitting it.")

    StageEvidence.objects.create(
        stage=stage,
        kind=StageEvidence.Kind.NOTE,
        note=note.strip(),
        processing_status=StageEvidence.ProcessingStatus.VERIFIED,
        submitted_by=actor,
    )
    from_status = stage.status
    now = timezone.now()
    stage.status = EngagementStage.Status.AWAITING_REVIEW
    stage.evidence_submitted_at = now
    # Re-stamped on every submission, including a resubmission after a correction. The Customer
    # gets a full review window against the evidence they are actually looking at, not the
    # remainder of a clock that started against evidence they already rejected.
    stage.review_due_at = pricing.stage_review_deadline(engagement.requirement, at=now)
    stage.save(
        update_fields=("status", "evidence_submitted_at", "review_due_at", "updated_at"),
    )
    record_event(
        engagement=engagement,
        stage=stage,
        from_status=from_status,
        to_status=stage.status,
        actor=actor,
        reason_code="stage_evidence_submitted",
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.stage.awaiting_review",
        idempotency_key=f"stage-awaiting-review:{stage.id}:{now.isoformat()}",
        payload={"engagement_id": str(engagement.id), "stage_id": str(stage.id)},
    )
    return stage


# ---------------------------------------------------------------------------
# Review: approve, request correction, dispute (`M2-BE-503`)
# ---------------------------------------------------------------------------


def _stage_commission_paise(*, engagement: Engagement, stage: EngagementStage) -> int:
    """This stage's share of the engagement's commission, in paise, allocated cumulatively.

    Not `commission * amount // staged_total` per stage: independent floor divisions leave a
    remainder that belongs to nobody, and a project with eleven milestones would under-book
    Vsolve's commission by up to ten paise with no row explaining where it went.

    Allocating against the cumulative approved total instead means the last stage picks up exactly
    the accumulated remainder, and `Σ stage commissions == engagement.commission_paise` when every
    stage is approved — without special-casing which stage happens to be last, which stops being
    knowable the moment an amendment appends one.
    """
    if engagement.commercial_mode == Engagement.CommercialMode.LEAD_ONLY:
        return 0
    if engagement.commission_paise <= 0 or engagement.staged_total_paise <= 0:
        return 0
    already = (
        EngagementStage.objects.filter(
            engagement=engagement,
            ledger_entry__isnull=False,
        ).aggregate(total=Sum("ledger_entry__commission_paise"))["total"]
        or 0
    )
    approved_after = engagement.approved_total_paise + stage.amount_paise
    target = engagement.commission_paise * approved_after // engagement.staged_total_paise
    return max(min(target, engagement.commission_paise) - already, 0)


def _stage_retention_paise(*, engagement: Engagement, stage: EngagementStage) -> int:
    """How much of this stage's payout is held back for the warranty window (`M2-BE-546`).

    `M2-BE-546` says the retention is held back **from the final stage**, and the obvious reading
    — "when approving the last stage, subtract the retention" — does not survive contact with the
    amendment engine: an additive amendment appends a stage, so which stage is last stops being
    knowable the moment somebody accepts one, and a retention already released out of what turned
    out not to be the final milestone cannot be un-released.

    So the retention is allocated against the **cumulative** approved total, exactly as
    `_stage_commission_paise` allocates commission and for exactly the same reason. The amount
    that should be held once `approved` of `staged` has been approved is

        max(0, retention - (staged - approved))

    which is zero for every early stage — there is plenty of work left to hold it out of — and
    reaches the full retention precisely when the last stage is approved, whichever stage that
    turns out to be. A retention larger than the final milestone simply starts biting a milestone
    earlier, which is the correct behaviour and needs no special case.
    """
    retention = engagement.retention_paise
    if retention <= 0 or engagement.staged_total_paise <= 0:
        return 0
    approved_before = engagement.approved_total_paise
    approved_after = approved_before + stage.amount_paise
    held_before = max(0, retention - (engagement.staged_total_paise - approved_before))
    held_after = max(0, retention - (engagement.staged_total_paise - approved_after))
    return max(min(held_after, retention) - held_before, 0)


def _hold_stage_payout(*, stage: EngagementStage, engagement: Engagement) -> PartnerLedgerEntry:
    """Write the vendor's earning for an approved stage, **held** (`M2-BE-507`).

    Through the M1 ledger, as a `PartnerLedgerEntry` with no Booking — the one-earning-per-Booking
    constraint is scoped to rows that have one, so a stage earning sits beside a technician's job
    earnings in the same statement and the same payout batch. This is the same shape
    `access._earn_share` uses for a visit payout, and for the same reason.

    Written `PENDING`, always. `PENDING` here carries the dispute window: the money is earned and
    is not yet payable. `release_stage_payout` moves it to `AVAILABLE` once the window closes and
    the vendor's payout account is verified — and if it never is, the entry stays `PENDING`
    indefinitely, which is the honest record. Deleting it to tidy a queue would be writing off
    somebody else's money.
    """
    existing = PartnerLedgerEntry.objects.filter(idempotency_key=f"m2-stage:{stage.id}").first()
    if existing is not None:
        return existing
    commission = _stage_commission_paise(engagement=engagement, stage=stage)
    # `M2-BE-546`. Retention comes out of the **gross**, not the net: it is the Customer's money
    # still, held against a warranty promise, and reducing the commission with it would hand back
    # part of Vsolve's fee every time a vendor's last milestone was retained.
    retained = _stage_retention_paise(engagement=engagement, stage=stage)
    gross = stage.amount_paise - retained
    entry = PartnerLedgerEntry.objects.create(
        partner=engagement.partner,
        booking=None,
        kind=PartnerLedgerEntry.Kind.EARNING,
        status=PartnerLedgerEntry.Status.PENDING,
        gross_paise=gross,
        commission_paise=commission,
        net_paise=gross - commission,
        calculation_snapshot={
            "source": "m2_engagement_stage",
            "engagement_id": str(engagement.id),
            "engagement_stage_id": str(stage.id),
            "position": stage.position,
            "stage_amount_paise": stage.amount_paise,
            "commission_paise": commission,
            "commission_treatment": engagement.commission_treatment,
            "engagement_commission_paise": engagement.commission_paise,
            "staged_total_paise": engagement.staged_total_paise,
            # What was held out of this stage and against which promise. A vendor reading a
            # statement has to be able to see why one milestone paid less than it was worth.
            "warranty_retention_withheld_paise": retained,
            "engagement_retention_paise": engagement.retention_paise,
        },
        reason=f"m2 stage {stage.position}",
        idempotency_key=f"m2-stage:{stage.id}",
    )
    if retained:
        add_engagement_money(engagement.id, retention_withheld_paise=retained)
    return entry


def _approve(*, stage: EngagementStage, actor: User | None, reason_code: str) -> EngagementStage:
    """The approval itself, shared by the Customer command, the timeout and the dispute outcome.

    One implementation because the money consequence is identical however approval was reached.
    Three copies of "write the earning, move the totals, maybe complete the engagement" is three
    places for the arithmetic to drift.
    """
    engagement = stage.engagement
    now = timezone.now()
    from_status = stage.status
    stage.status = EngagementStage.Status.APPROVED
    stage.approved_at = now
    stage.approved_amount_paise = stage.amount_paise
    stage.payout_release_due_at = pricing.stage_payout_hold_deadline(engagement.requirement, at=now)
    updates = [
        "status",
        "approved_at",
        "approved_amount_paise",
        "payout_release_due_at",
        "updated_at",
    ]
    if engagement.commercial_mode == Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED:
        stage.ledger_entry = _hold_stage_payout(stage=stage, engagement=engagement)
        updates.append("ledger_entry")
    stage.save(update_fields=tuple(updates))
    add_engagement_money(engagement.id, approved_total_paise=stage.amount_paise)
    record_event(
        engagement=engagement,
        stage=stage,
        from_status=from_status,
        to_status=stage.status,
        actor=actor,
        reason_code=reason_code,
    )

    if engagement.commercial_mode == Engagement.CommercialMode.LEAD_ONLY:
        # Nothing is held because nothing was collected. A3's service payment is between the
        # Customer and the vendor, so a dispute window over a payout Vsolve does not make would be
        # theatre — the stage is done the moment it is approved.
        return _release(stage=stage, actor=None, reason_code="stage_released_lead_only")
    return stage


@transaction.atomic
def approve_stage(*, stage_id: uuid.UUID, actor: User) -> EngagementStage:
    """The Customer accepts the work on one stage. `AWAITING_REVIEW → APPROVED`."""
    stage = _locked_stage(stage_id)
    _assert_engagement_live(stage.engagement)
    if stage.status in (EngagementStage.Status.APPROVED, EngagementStage.Status.RELEASED):
        return stage
    if stage.status == EngagementStage.Status.DISPUTED:
        raise StageDisputedError(
            "This stage is disputed. Withdraw the dispute or wait for the decision.",
        )
    if stage.status != EngagementStage.Status.AWAITING_REVIEW:
        raise StageTransitionError("This stage has nothing submitted to approve.")
    return _approve(stage=stage, actor=actor, reason_code="stage_approved")


@transaction.atomic
def request_stage_correction(*, stage_id: uuid.UUID, actor: User, note: str) -> EngagementStage:
    """The Customer sends a stage back. `AWAITING_REVIEW → CORRECTION_REQUESTED`.

    **A correction is not an amendment.** It asks for the agreed work to be done properly; it does
    not change what the agreed work is, and it moves no money. A Customer who wants something
    different is asking for a change order, which is `apps.requirements.amendments` and needs the
    vendor's agreement (`M2-BE-508`).
    """
    stage = _locked_stage(stage_id)
    _assert_engagement_live(stage.engagement)
    if stage.status == EngagementStage.Status.CORRECTION_REQUESTED:
        return stage
    if stage.status != EngagementStage.Status.AWAITING_REVIEW:
        raise StageTransitionError("This stage has nothing submitted to send back.")
    if not note.strip():
        raise StageTransitionError("Say what needs correcting.")

    from_status = stage.status
    stage.status = EngagementStage.Status.CORRECTION_REQUESTED
    stage.correction_note = note.strip()
    # The review clock stops. It restarts from zero when the vendor resubmits, because the
    # Customer will be looking at different evidence.
    stage.review_due_at = None
    stage.save(update_fields=("status", "correction_note", "review_due_at", "updated_at"))
    record_event(
        engagement=stage.engagement,
        stage=stage,
        from_status=from_status,
        to_status=stage.status,
        actor=actor,
        reason_code="stage_correction_requested",
        reason=stage.correction_note,
    )
    return stage


@transaction.atomic
def dispute_stage(
    *, stage_id: uuid.UUID, actor: User, reason_code: str, note: str = ""
) -> EngagementStage:
    """The Customer formally objects. `AWAITING_REVIEW → DISPUTED`.

    A dispute stops **only the disputed allocation**. Every other stage of the engagement carries
    on, and any payout already released stays released — `README.md` is explicit that a stage
    disagreement blocks the disputed allocation where safe, not the whole agreement. The
    engagement moves to `DISPUTED` so both parties and Operations can see that something is open;
    it returns to `ACTIVE` when the last disputed stage is resolved.
    """
    stage = _locked_stage(stage_id)
    engagement = stage.engagement
    _assert_engagement_live(engagement)
    if stage.status == EngagementStage.Status.DISPUTED:
        return stage
    if stage.status != EngagementStage.Status.AWAITING_REVIEW:
        raise StageTransitionError("Only submitted work can be disputed.")
    if not reason_code:
        raise StageTransitionError("A dispute needs a reason.")

    now = timezone.now()
    from_status = stage.status
    stage.status = EngagementStage.Status.DISPUTED
    stage.disputed_at = now
    stage.dispute_reason_code = reason_code
    # The review clock is cleared, which is how the "`AWAITING_REVIEW → APPROVED` on timeout
    # **except while `DISPUTED`**" rule holds structurally as well as by the guard in
    # `expire_stage_review`. Two independent expressions of one rule, because auto-approving a
    # stage somebody has objected to would settle the objection by ignoring it.
    stage.review_due_at = None
    stage.save(
        update_fields=(
            "status",
            "disputed_at",
            "dispute_reason_code",
            "review_due_at",
            "updated_at",
        )
    )
    record_event(
        engagement=engagement,
        stage=stage,
        from_status=from_status,
        to_status=stage.status,
        actor=actor,
        reason_code="stage_disputed",
        reason=note or reason_code,
    )

    if engagement.status == Engagement.Status.ACTIVE:
        Engagement.objects.filter(pk=engagement.id).update(
            status=Engagement.Status.DISPUTED,
            disputed_at=now,
            updated_at=now,
        )
        record_event(
            engagement=engagement,
            stage=None,
            from_status=Engagement.Status.ACTIVE,
            to_status=Engagement.Status.DISPUTED,
            actor=None,
            reason_code="engagement_disputed",
            reason=f"stage:{stage.id}",
        )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.stage.disputed",
        idempotency_key=f"stage-disputed:{stage.id}",
        payload={
            "engagement_id": str(engagement.id),
            "stage_id": str(stage.id),
            "reason_code": reason_code,
        },
    )
    return stage


#: What Operations may decide about a disputed stage. Deliberately two outcomes and not three:
#: "the Customer was right" sends the work back, "the vendor was right" approves it, and a partial
#: outcome is a scope amendment both sides accept rather than an operator quietly repricing a
#: stage (`M2-BE-508`).
DISPUTE_OUTCOMES: Final = ("APPROVE", "REQUEST_CORRECTION")


@transaction.atomic
def resolve_stage_dispute(
    *, stage_id: uuid.UUID, actor: User, outcome: str, note: str
) -> EngagementStage:
    """Operations decides a disputed stage. `DISPUTED → APPROVED | CORRECTION_REQUESTED`.

    An auditable domain command rather than a database edit, which is the rule `README.md` states
    for every Operations recovery. The full case machinery — evidence, deadlines, appeals — is
    `apps.cases` and Wave C6; this is the transition that command will drive, published now so a
    disputed stage is not a dead end for the whole of C4 and C5.
    """
    stage = _locked_stage(stage_id)
    engagement = stage.engagement
    if outcome not in DISPUTE_OUTCOMES:
        raise StageTransitionError("That is not a decision this stage can take.")
    if stage.status != EngagementStage.Status.DISPUTED:
        raise StageTransitionError("This stage is not disputed.")
    if not note.strip():
        raise StageTransitionError("A dispute decision needs a reason.")

    if outcome == "APPROVE":
        resolved = _approve(stage=stage, actor=actor, reason_code="stage_dispute_resolved_approved")
    else:
        from_status = stage.status
        stage.status = EngagementStage.Status.CORRECTION_REQUESTED
        stage.correction_note = note.strip()
        stage.save(update_fields=("status", "correction_note", "updated_at"))
        record_event(
            engagement=engagement,
            stage=stage,
            from_status=from_status,
            to_status=stage.status,
            actor=actor,
            reason_code="stage_dispute_resolved_correction",
            reason=note.strip(),
        )
        resolved = stage

    _clear_engagement_dispute(engagement)
    return resolved


def _clear_engagement_dispute(engagement: Engagement) -> None:
    """Return the engagement to `ACTIVE` once no stage is still disputed."""
    if engagement.status != Engagement.Status.DISPUTED:
        return
    if EngagementStage.objects.filter(
        engagement=engagement,
        status=EngagementStage.Status.DISPUTED,
    ).exists():
        return
    Engagement.objects.filter(pk=engagement.id).update(
        status=Engagement.Status.ACTIVE,
        updated_at=timezone.now(),
    )
    record_event(
        engagement=engagement,
        stage=None,
        from_status=Engagement.Status.DISPUTED,
        to_status=Engagement.Status.ACTIVE,
        actor=None,
        reason_code="engagement_dispute_cleared",
    )


@transaction.atomic
def expire_stage_review(*, stage_id: uuid.UUID) -> EngagementStage:
    """Silence becomes approval, once the review window closes. System command.

    `07-state-machines-and-permissions.md` §5: `AWAITING_REVIEW → APPROVED` may occur on review
    timeout **except while the stage is `DISPUTED`**. That exception is checked here under the row
    lock rather than trusted from the selector, because the state can change between the sweep
    reading a list and the task acting on one of its entries — which is precisely the window a
    Customer disputes in.

    `actor=None`: a clock approved this, not the Customer, and the record says so.
    """
    stage = _locked_stage(stage_id)
    if stage.status == EngagementStage.Status.DISPUTED:
        raise StageDisputedError()
    if stage.status != EngagementStage.Status.AWAITING_REVIEW:
        return stage
    if stage.review_due_at is None or stage.review_due_at > timezone.now():
        return stage
    return _approve(stage=stage, actor=None, reason_code="stage_review_timed_out")


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
def accept_engagement_completion(*, engagement_id: uuid.UUID, actor: User) -> Engagement:
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
        Engagement.objects.select_for_update()
        .select_related("requirement__configuration")
        .get(pk=engagement_id)
    )
    if engagement.status in (Engagement.Status.COMPLETED, Engagement.Status.WARRANTY):
        return engagement
    if engagement.status != Engagement.Status.COMPLETING:
        raise StageTransitionError("This engagement is not finished yet.")
    _assert_no_stage_is_still_open(engagement)
    if engagement.handover_submitted_at is not None and engagement.handover_accepted_at is None:
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
