"""Work evidence upload boundary: signed upload, then server-side verify before it counts.

Reuses `apps.foundation.storage`'s signed-upload/verify boundary — the same one
`apps.partners` uses for KYC documents — with its own bucket. A failed verification is
recorded as a `WorkEvidence` row with `processing_status=FAILED`, never silently dropped and
never represented as completed evidence (see `apps.fulfilment.models.WorkEvidence`).
"""

import re
import uuid
from dataclasses import dataclass

from django.conf import settings
from django.db import transaction

from apps.commerce.models import Booking
from apps.foundation.storage import DocumentStorage, DocumentStorageError, SignedUpload
from apps.foundation.storage import get_document_storage as _get_document_storage
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import WorkEvidence, WorkTask
from apps.fulfilment.services import locked_booking_context
from apps.identity.models import User

SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
MAX_WORK_EVIDENCE_SIZE_BYTES = 20 * 1024 * 1024
EVIDENCE_CONTENT_TYPE_SUFFIXES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}


class WorkEvidenceUploadError(RuntimeError):
    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


def _fulfilment_document_storage() -> DocumentStorage:
    return _get_document_storage(bucket=settings.FULFILMENT_EVIDENCE_BUCKET)


def _object_key_prefix(booking: Booking) -> str:
    return f"fulfilment/{booking.id}/"


def _guard_evidence_actor(*, booking: Booking, actor: User) -> None:
    """Only the two people who were actually at the visit may attach evidence to it.

    The Partner uploads before/after/safety evidence; the Customer uploads damage and dispute
    evidence. Anyone else is refused here rather than at a view that does not exist yet — this
    boundary mints signed upload URLs and writes the rows that gate auto-finalization, so it
    cannot rely on a caller remembering to check.
    """

    if actor.id == booking.customer_id:
        return
    if booking.partner_id is not None and actor.id == booking.partner.user_id:
        return
    raise PermissionError("This Booking belongs to someone else.")


@dataclass(frozen=True, slots=True)
class EvidenceUploadGrant:
    object_key: str
    signed: SignedUpload


def request_work_evidence_upload(
    *,
    booking_id: uuid.UUID,
    requested_by: User,
    kind: str,
    content_type: str,
    size_bytes: int,
    storage: DocumentStorage | None = None,
) -> EvidenceUploadGrant:
    # A read, not a write: no row is locked here, only the object key is minted. The write
    # (`record_work_evidence`) is what needs the transactional lock.
    try:
        booking = Booking.objects.select_related("partner").get(id=booking_id)
    except Booking.DoesNotExist:
        raise BookingCommandInvalidApiError(reason="This Booking does not exist.") from None
    _guard_evidence_actor(booking=booking, actor=requested_by)
    if kind not in WorkEvidence.Kind.values:
        raise BookingCommandInvalidApiError(reason="Unknown evidence kind.")
    normalized_content_type = content_type.lower()
    suffix = EVIDENCE_CONTENT_TYPE_SUFFIXES.get(normalized_content_type)
    if suffix is None:
        raise WorkEvidenceUploadError("Choose a supported evidence file type.")
    if size_bytes > MAX_WORK_EVIDENCE_SIZE_BYTES:
        raise WorkEvidenceUploadError("The evidence file exceeds the allowed size.")
    object_key = f"{_object_key_prefix(booking)}{kind.lower()}/{uuid.uuid4().hex}{suffix}"
    provider = storage or _fulfilment_document_storage()
    try:
        signed = provider.create_signed_upload(object_key=object_key)
    except DocumentStorageError as exc:
        raise WorkEvidenceUploadError(
            "Evidence upload is temporarily unavailable. Try again.", retryable=True
        ) from exc
    return EvidenceUploadGrant(object_key=object_key, signed=signed)


@transaction.atomic
def record_work_evidence(
    *,
    booking_id: uuid.UUID,
    uploaded_by: User,
    kind: str,
    object_key: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
    work_task_id: uuid.UUID | None = None,
    storage: DocumentStorage | None = None,
) -> WorkEvidence:
    _group, _unit, booking = locked_booking_context(booking_id)
    _guard_evidence_actor(booking=booking, actor=uploaded_by)
    if kind not in WorkEvidence.Kind.values:
        raise BookingCommandInvalidApiError(reason="Unknown evidence kind.")
    if not SHA256_PATTERN.fullmatch(sha256):
        raise WorkEvidenceUploadError("The evidence checksum is invalid.")
    if not object_key.startswith(_object_key_prefix(booking)):
        # The key is server-minted and carries the Booking id. Accepting a foreign one would let
        # a caller attach another visit's photographs to this one's evidence-gated finalization.
        raise WorkEvidenceUploadError("This upload does not belong to this Booking.")
    work_task = None
    if work_task_id is not None:
        try:
            work_task = WorkTask.objects.get(id=work_task_id, booking=booking)
        except WorkTask.DoesNotExist:
            raise BookingCommandInvalidApiError(
                reason="This work task does not belong to this Booking."
            ) from None

    provider = storage or _fulfilment_document_storage()
    try:
        verified = provider.verify_object(
            object_key=object_key, maximum_size_bytes=MAX_WORK_EVIDENCE_SIZE_BYTES
        )
    except DocumentStorageError as exc:
        raise WorkEvidenceUploadError(
            "The uploaded evidence could not be verified. Try again.", retryable=True
        ) from exc

    mismatch = (
        verified.size_bytes != size_bytes
        or verified.content_type != content_type.lower()
        or verified.sha256 != sha256
    )
    return WorkEvidence.objects.create(
        booking=booking,
        work_task=work_task,
        kind=kind,
        uploaded_by=uploaded_by,
        object_key=object_key,
        content_type=content_type.lower(),
        size_bytes=size_bytes,
        sha256=sha256,
        processing_status=(
            WorkEvidence.ProcessingStatus.FAILED
            if mismatch
            else WorkEvidence.ProcessingStatus.CLEAN
        ),
    )
