"""The vendor's half of the spine: starting a stage, attaching evidence, handing it over.

Three commands and one bucket, in the order a shift-day or a milestone actually runs.
`start_stage` opens the work (and is where A5's funding gate bites). The presign/finalize pair
puts photographs, video and documents in object storage without the bytes ever passing through
Django. `submit_stage_evidence` closes the vendor's side and starts the Customer's review clock.

The evidence constants live here rather than in `base` because nothing else in the package reads
them: they are the allow-list, the size ceiling and the per-stage bound this slice enforces.

Where the boundary falls: nothing here approves, disputes, releases or moves money. The moment the
stage reaches `AWAITING_REVIEW` it belongs to `review`.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final

from django.db import transaction
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.requirements import pricing
from apps.requirements.exceptions import (
    AttachmentRejectedError,
    StageNotFundedError,
    StageTransitionError,
)
from apps.requirements.models import (
    Engagement,
    EngagementStage,
    StageEvidence,
    StageEvidenceUpload,
)
from apps.requirements.storage import (
    DocumentStorage,
    DocumentStorageError,
    get_attachment_storage,
)

from .base import _assert_engagement_live, _locked_stage, record_event

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
