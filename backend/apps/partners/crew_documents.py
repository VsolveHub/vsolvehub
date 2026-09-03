"""A crew member's identity evidence, end to end: upload, review, and the timestamp it decides.

## What was missing

`PartnerCrewMembership.documents_verified_at` gates real money and real doorsteps —
`verified_roster_size` counts only verified memberships when sizing a lead against a headcount,
and `assign_crew` refuses an unverified worker outright. It had an Operations writer with an actor
and an audit event, and **nothing behind it**: no upload path existed anywhere in the codebase for
a crew member, so a reviewer pressed "documents checked" with no document on the screen.

This module is the evidence. `PartnerDocument` is the agency's own KYC and hangs off a
`PartnerApplication`; it could not be reused, because a worker has no application.

## The flow, and why it is two phases

1. `start_crew_document_upload` — the Partner declares kind, media type, size and SHA-256. A
   `CrewDocument` row is written at `AWAITING_UPLOAD` (the row *is* the upload intent) and a
   short-lived signed PUT is returned. Nothing is visible to a reviewer yet.
2. The browser PUTs the bytes straight to private storage. They never pass through Django.
3. `submit_crew_document` — the stored object is streamed back through the storage boundary and
   its real size, media type and digest are compared against what was declared. On a match the row
   becomes `PENDING` and supersedes the previous version of its kind; on a mismatch it becomes
   `FAILED` and the Partner starts again.

Verified rather than trusted, for the same reason `submit_partner_photo` verifies: the party
claiming the upload succeeded is the party that benefits from the claim.

## Why approving the last required document stamps the membership

The alternative — a reviewer approving every document and then separately remembering to press
"verified" — has a failure mode where a fully-approved worker is still excluded from every crew
offer, which is precisely the silent state Wave C5 spent an audit finding. So approval recomputes,
and rejection of a required document withdraws verification with the rejection's own reason.
`verify_crew_documents` stays as it was: an Operations override for the offline path, unchanged
and still available.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.foundation.storage import (
    DocumentStorage,
    DocumentStorageError,
    SignedUpload,
    get_document_storage,
)
from apps.identity.models import User
from apps.partners.exceptions import CrewDocumentError
from apps.partners.models import CrewDocument, PartnerCrewMembership
from apps.partners.services.base import DOCUMENT_CONTENT_TYPE_SUFFIXES, SHA256_PATTERN

__all__ = [
    "CrewDocumentUploadGrant",
    "cleanup_stale_crew_documents",
    "crew_document_review_url",
    "current_crew_documents",
    "missing_required_crew_document_kinds",
    "review_crew_document",
    "start_crew_document_upload",
    "submit_crew_document",
]

#: How long a reviewer's link to the stored object stays valid. Short, because it is signed per
#: render on a screen read in the moment; nothing stores it, since a stored URL is a stored expiry.
CREW_DOCUMENT_REVIEW_URL_TTL_SECONDS = 10 * 60

#: How long the Partner has to actually PUT the bytes after declaring them.
CREW_DOCUMENT_UPLOAD_LIFETIME = timedelta(hours=2)

#: Statuses a reviewer or the roster should still be looking at. `SUPERSEDED`, `FAILED` and an
#: abandoned `AWAITING_UPLOAD` are history, not evidence.
LIVE_STATUSES = (
    CrewDocument.Status.PENDING,
    CrewDocument.Status.APPROVED,
    CrewDocument.Status.REJECTED,
)


@dataclass(frozen=True, slots=True)
class CrewDocumentUploadGrant:
    """Where the partner app should PUT the file, and the row waiting for it."""

    document: CrewDocument
    signed: SignedUpload


def _storage() -> DocumentStorage:
    return get_document_storage(bucket=settings.CREW_DOCUMENT_BUCKET)


def _object_key(*, membership: PartnerCrewMembership, kind: str, suffix: str) -> str:
    """Scoped by partner *and* membership, and random per version.

    The partner segment is what makes "everything one agency uploaded" a prefix — the shape a
    deletion request arrives in. The random tail is what stops a replacement being served from a
    signed link issued against the version it replaced.
    """
    return f"crew/{membership.partner_id}/{membership.id}/{kind.lower()}/{uuid.uuid4().hex}{suffix}"


def start_crew_document_upload(
    *,
    membership: PartnerCrewMembership,
    kind: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
    storage: DocumentStorage | None = None,
) -> CrewDocumentUploadGrant:
    """Declare a file and get somewhere to put it.

    Writes an intent; publishes nothing to a reviewer.

    **Deliberately not one transaction around the whole function.** The row is written in its own
    atomic block and the storage call happens after it commits, because a `FAILED` row recorded
    inside a block that then raises is a `FAILED` row that never existed -- the rollback takes the
    record of the failure with it. Two consequences, both wanted: an outage leaves a visible dead
    row for `cleanup_stale_crew_documents` rather than a silent nothing, and a network call is not
    holding a row lock open while it waits.
    """
    if membership.status != PartnerCrewMembership.Status.ACTIVE:
        raise CrewDocumentError("Documents cannot be uploaded for an archived crew member.")
    if kind not in CrewDocument.Kind.values:
        raise CrewDocumentError("Choose a supported document type.")
    normalized_content_type = content_type.strip().lower()
    suffix = DOCUMENT_CONTENT_TYPE_SUFFIXES.get(normalized_content_type)
    if suffix is None:
        raise CrewDocumentError("Upload a PDF, JPEG or PNG.")
    if size_bytes <= 0:
        raise CrewDocumentError("The file is empty.")
    if size_bytes > settings.MAX_CREW_DOCUMENT_SIZE_BYTES:
        raise CrewDocumentError("The document exceeds the allowed size.")
    if not SHA256_PATTERN.fullmatch(sha256):
        raise CrewDocumentError("The document checksum is invalid.")

    with transaction.atomic():
        previous = (
            CrewDocument.objects.select_for_update()
            .filter(membership=membership, kind=kind)
            .order_by("-version")
            .first()
        )
        document = CrewDocument.objects.create(
            membership=membership,
            kind=kind,
            version=(previous.version if previous else 0) + 1,
            object_key=_object_key(membership=membership, kind=kind, suffix=suffix),
            content_type=normalized_content_type,
            size_bytes=size_bytes,
            sha256=sha256,
            upload_expires_at=timezone.now() + CREW_DOCUMENT_UPLOAD_LIFETIME,
        )

    provider = storage or _storage()
    try:
        signed = provider.create_signed_upload(object_key=document.object_key)
    except DocumentStorageError as exc:
        # Marked rather than deleted, and outside the block above so the mark survives. A `FAILED`
        # row keeps its version number spent, so a retry cannot collide with the unique
        # `(membership, kind, version)` index while the first attempt is still being cleaned up.
        CrewDocument.objects.filter(id=document.id).update(
            status=CrewDocument.Status.FAILED,
            failure_code="provider_unavailable",
        )
        raise CrewDocumentError(
            "Document upload is temporarily unavailable. Try again.",
        ) from exc

    document.upload_expires_at = signed.expires_at
    document.save(update_fields=("upload_expires_at", "updated_at"))
    return CrewDocumentUploadGrant(document=document, signed=signed)


def submit_crew_document(
    *,
    membership: PartnerCrewMembership,
    document_id: uuid.UUID,
    storage: DocumentStorage | None = None,
) -> CrewDocument:
    """The Partner says the bytes landed. Check the object, then queue it for review."""
    document = CrewDocument.objects.filter(id=document_id, membership=membership).first()
    if document is None:
        raise CrewDocumentError("This upload was not found.")
    if document.status != CrewDocument.Status.AWAITING_UPLOAD:
        raise CrewDocumentError("This upload has already been submitted.")
    if document.upload_expires_at <= timezone.now():
        CrewDocument.objects.filter(id=document.id).update(
            status=CrewDocument.Status.FAILED,
            failure_code="upload_expired",
        )
        raise CrewDocumentError("The upload expired. Start a new one.")

    provider = storage or _storage()
    try:
        verified = provider.verify_object(
            object_key=document.object_key,
            maximum_size_bytes=settings.MAX_CREW_DOCUMENT_SIZE_BYTES,
        )
    except DocumentStorageError as exc:
        raise CrewDocumentError(
            "The uploaded document could not be verified. Try again.",
        ) from exc

    mismatch = (
        verified.size_bytes != document.size_bytes
        or verified.content_type != document.content_type
        or verified.sha256 != document.sha256
    )
    # The failure is recorded inside the block and raised *after* it, the same shape
    # `finalize_partner_document_upload` uses. Raising inside would roll the `FAILED` status back
    # with the transaction, leaving the row `AWAITING_UPLOAD` — so the Partner could re-submit the
    # same rejected object indefinitely and nothing would ever say why it was refused.
    failure: str | None = None
    with transaction.atomic():
        locked = CrewDocument.objects.select_for_update().get(id=document.id)
        if locked.status != CrewDocument.Status.AWAITING_UPLOAD:
            raise CrewDocumentError("This upload has already been submitted.")
        if mismatch:
            locked.status = CrewDocument.Status.FAILED
            locked.failure_code = "metadata_mismatch"
            locked.save(update_fields=("status", "failure_code", "updated_at"))
            failure = "The uploaded file did not match the one selected. Start a new upload."
        else:
            # Only *unreviewed* earlier versions are superseded. An approved one stays approved
            # until this replacement is itself approved, so re-uploading does not silently
            # un-verify a worker who is already on next Tuesday's shift.
            CrewDocument.objects.filter(
                membership=locked.membership_id,
                kind=locked.kind,
                status=CrewDocument.Status.PENDING,
            ).exclude(id=locked.id).update(
                status=CrewDocument.Status.SUPERSEDED,
                updated_at=timezone.now(),
            )
            locked.status = CrewDocument.Status.PENDING
            locked.failure_code = ""
            locked.save(update_fields=("status", "failure_code", "updated_at"))

    if failure is not None:
        raise CrewDocumentError(failure)
    return locked


def current_crew_documents(*, membership: PartnerCrewMembership) -> list[CrewDocument]:
    """The latest live version of each kind, newest kind-version first.

    Abandoned intents and superseded history are excluded: what a Partner and a reviewer both need
    is "where does each kind stand today", and a list that also contains three failed attempts is
    a list nobody reads to the end.
    """
    documents = (
        CrewDocument.objects.filter(membership=membership, status__in=LIVE_STATUSES)
        .select_related("reviewed_by")
        .order_by("kind", "-version")
    )
    latest: dict[str, CrewDocument] = {}
    for document in documents:
        latest.setdefault(document.kind, document)
    return [latest[kind] for kind in sorted(latest)]


def missing_required_crew_document_kinds(
    *, membership: PartnerCrewMembership, on_day: object = None
) -> list[str]:
    """Required kinds with no approved, unexpired document. Empty means "may be verified"."""
    del on_day
    today = timezone.localdate()
    approved = {
        document.kind
        for document in CrewDocument.objects.filter(
            membership=membership, status=CrewDocument.Status.APPROVED
        )
        if not document.is_expired_on(today)
    }
    return [kind for kind in settings.CREW_REQUIRED_DOCUMENT_KINDS if kind not in approved]


def crew_document_review_url(
    *, document: CrewDocument, storage: DocumentStorage | None = None
) -> str | None:
    """A short-lived signed link for a reviewer, or `None` when storage cannot produce one.

    `None` rather than a raise, for the same reason `partner_photo_url` degrades: a storage outage
    should leave the reviewer looking at a queue with one missing preview, not at an error page
    that hides the other nine people waiting.
    """
    provider = storage or _storage()
    try:
        signed = provider.create_signed_review(
            object_key=document.object_key,
            expires_in_seconds=CREW_DOCUMENT_REVIEW_URL_TTL_SECONDS,
        )
    except DocumentStorageError:
        return None
    return signed.review_url


@transaction.atomic
def review_crew_document(
    *,
    document_id: uuid.UUID,
    actor: User,
    approved: bool,
    reason: str = "",
) -> CrewDocument:
    """An Operations decision on one document, and its consequence for the membership.

    Approving needs no reason — the document was seen. **Rejecting does**, and so does the
    withdrawal of verification it can cause: the Partner is about to lose a worker off jobs they
    may already be assigned to, and "why" is the first thing they will ask. The check constraint
    on the model enforces the same rule one layer down.
    """
    document = (
        CrewDocument.objects.select_for_update(of=("self",))
        .select_related("membership__crew_member", "membership__partner")
        .filter(id=document_id)
        .first()
    )
    if document is None:
        raise CrewDocumentError("This document was not found.")
    if document.status not in {CrewDocument.Status.PENDING, CrewDocument.Status.APPROVED}:
        raise CrewDocumentError("This document is not waiting for a decision.")
    if not approved and not reason.strip():
        raise CrewDocumentError("Rejecting a document needs a reason.")

    document.status = CrewDocument.Status.APPROVED if approved else CrewDocument.Status.REJECTED
    document.reviewed_by = actor
    document.reviewed_at = timezone.now()
    document.review_reason = reason.strip()[:480]
    document.save(
        update_fields=("status", "reviewed_by", "reviewed_at", "review_reason", "updated_at")
    )
    _apply_verification_consequence(document=document, actor=actor)
    return document


def _apply_verification_consequence(*, document: CrewDocument, actor: User) -> None:
    """Recompute `documents_verified_at` from what is approved right now.

    Imported late: `apps.requirements` imports `apps.partners`, and the reverse at module scope
    closes a cycle. This is the branch that runs once, when a reviewer decides.
    """
    from apps.requirements.operations import (  # noqa: PLC0415 — mutual import with requirements
        verify_crew_documents,
    )

    membership = document.membership
    if membership.status != PartnerCrewMembership.Status.ACTIVE:
        return
    outstanding = missing_required_crew_document_kinds(membership=membership)
    if not outstanding and membership.documents_verified_at is None:
        verify_crew_documents(membership_id=membership.id, actor=actor, verified=True)
        return
    if outstanding and membership.documents_verified_at is not None:
        kinds = ", ".join(CrewDocument.Kind(kind).label.lower() for kind in outstanding)
        verify_crew_documents(
            membership_id=membership.id,
            actor=actor,
            verified=False,
            reason=(document.review_reason or f"No approved {kinds} on file.")[:480],
        )


def cleanup_stale_crew_documents(
    *,
    storage: DocumentStorage | None = None,
    batch_size: int = 100,
) -> int:
    """Delete the objects behind abandoned or failed uploads. Never touches a reviewed document.

    Mirrors `cleanup_stale_partner_document_uploads`, including its exclusion: what a reviewer has
    approved or rejected is a record, and its retention policy is not this function's to decide.
    """
    cutoff = timezone.now() - timedelta(hours=settings.PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS)
    candidates = list(
        CrewDocument.objects.filter(
            object_deleted_at__isnull=True,
            status__in=(CrewDocument.Status.AWAITING_UPLOAD, CrewDocument.Status.FAILED),
            upload_expires_at__lte=cutoff,
        )
        .order_by("upload_expires_at", "id")
        .values_list("id", flat=True)[:batch_size]
    )
    provider = storage or _storage()
    deleted = 0
    for document_id in candidates:
        document = CrewDocument.objects.get(id=document_id)
        try:
            provider.delete_object(object_key=document.object_key)
        except DocumentStorageError:
            # Left for the next sweep. A storage blip must not mark an object gone that is still
            # there, which is how an orphan becomes invisible and permanent.
            continue
        deleted += CrewDocument.objects.filter(
            id=document.id, object_deleted_at__isnull=True
        ).update(
            status=CrewDocument.Status.FAILED,
            failure_code=document.failure_code or "upload_abandoned",
            object_deleted_at=timezone.now(),
        )
    return deleted
