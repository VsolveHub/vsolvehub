"""The Partner KYC document aggregate, end to end.

One file for the whole life of a `PartnerDocument`: the Partner's signed-upload intent, the
finalization that promotes a verified upload into a versioned document, the malware scan result,
the reviewer's signed read access and approve/reject decision, and the orphan-object cleanup the
Celery beat schedule drives. Decisions on the application *row* live in `review`.
"""

import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.identity.models import User
from apps.partners.exceptions import (
    PartnerApplicationNotFoundError,
    PartnerDocumentUploadError,
    PartnerReviewOwnershipError,
    PartnerSelfReviewError,
    PartnerTransitionError,
)
from apps.partners.models import (
    PartnerApplication,
    PartnerDocument,
    PartnerDocumentUpload,
)
from apps.partners.scanning import DocumentScanner, get_document_scanner
from apps.partners.storage import (
    DocumentStorage,
    DocumentStorageError,
    SignedReview,
    get_document_storage,
)

from .base import (
    DOCUMENT_CONTENT_TYPE_SUFFIXES,
    MAX_PARTNER_DOCUMENT_SIZE_BYTES,
    SHA256_PATTERN,
    PartnerDocumentUploadGrant,
    _application_for_update,
    _assert_version,
)


def _assert_application_editable(
    application: PartnerApplication,
    kind: str | None = None,
) -> None:
    if application.status in {
        PartnerApplication.Status.DRAFT,
        PartnerApplication.Status.CHANGES_REQUIRED,
    }:
        return

    # In SUBMITTED or UNDER_REVIEW states, an applicant can replace a document
    # that was rejected by an Operations reviewer or failed scanning.
    if application.status in {
        PartnerApplication.Status.SUBMITTED,
        PartnerApplication.Status.UNDER_REVIEW,
    } and kind is not None:
        latest_doc = (
            PartnerDocument.objects.filter(application=application, kind=kind)
            .order_by("-version")
            .first()
        )
        if latest_doc is not None and (
            latest_doc.status == PartnerDocument.Status.REJECTED
            or latest_doc.scan_status == PartnerDocument.ScanStatus.REJECTED
        ):
            return

    raise PartnerTransitionError(
        "Documents cannot be changed in the current application state."
    )


@transaction.atomic
def _create_document_upload_intent(
    *,
    user: User,
    expected_version: int,
    kind: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
) -> PartnerDocumentUpload:
    application = _application_for_update(user)
    _assert_version(application, expected_version)
    _assert_application_editable(application, kind=kind)
    normalized_content_type = content_type.lower()
    suffix = DOCUMENT_CONTENT_TYPE_SUFFIXES.get(normalized_content_type)
    if suffix is None:
        raise PartnerDocumentUploadError("Choose a supported document file type.")
    if size_bytes > MAX_PARTNER_DOCUMENT_SIZE_BYTES:
        raise PartnerDocumentUploadError("The document exceeds the allowed size.")
    if not SHA256_PATTERN.fullmatch(sha256):
        raise PartnerDocumentUploadError("The document checksum is invalid.")
    object_key = f"partners/{application.partner_id}/{kind.lower()}/{uuid.uuid4().hex}{suffix}"
    return PartnerDocumentUpload.objects.create(
        application=application,
        kind=kind,
        object_key=object_key,
        content_type=normalized_content_type,
        size_bytes=size_bytes,
        sha256=sha256,
        expires_at=timezone.now() + timedelta(hours=2),
    )


def issue_partner_document_upload(
    *,
    user: User,
    expected_version: int,
    kind: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
    storage: DocumentStorage | None = None,
) -> PartnerDocumentUploadGrant:
    upload = _create_document_upload_intent(
        user=user,
        expected_version=expected_version,
        kind=kind,
        content_type=content_type,
        size_bytes=size_bytes,
        sha256=sha256,
    )
    provider = storage or get_document_storage()
    try:
        signed = provider.create_signed_upload(object_key=upload.object_key)
    except DocumentStorageError as exc:
        PartnerDocumentUpload.objects.filter(id=upload.id).update(
            status=PartnerDocumentUpload.Status.FAILED,
            failure_code="provider_unavailable",
        )
        raise PartnerDocumentUploadError(
            "Document upload is temporarily unavailable. Try again.",
            retryable=True,
        ) from exc
    upload.expires_at = signed.expires_at
    upload.save(update_fields=("expires_at", "updated_at"))
    return PartnerDocumentUploadGrant(upload=upload, signed=signed)


def _document_upload_for_finalization(
    *,
    user: User,
    upload_id: uuid.UUID,
    expected_version: int,
) -> PartnerDocumentUpload:
    upload = (
        PartnerDocumentUpload.objects.select_related("application__partner")
        .filter(id=upload_id, application__partner__user=user)
        .first()
    )
    if upload is None:
        raise PartnerApplicationNotFoundError
    if upload.status != PartnerDocumentUpload.Status.ISSUED:
        raise PartnerDocumentUploadError("This upload cannot be finalized again.")
    if upload.expires_at <= timezone.now():
        PartnerDocumentUpload.objects.filter(id=upload.id).update(
            status=PartnerDocumentUpload.Status.EXPIRED,
            failure_code="upload_expired",
        )
        raise PartnerDocumentUploadError("The upload expired. Start a new upload.")
    _assert_version(upload.application, expected_version)
    return upload


def finalize_partner_document_upload(
    *,
    user: User,
    expected_version: int,
    upload_id: uuid.UUID,
    storage: DocumentStorage | None = None,
) -> PartnerDocument:
    upload = _document_upload_for_finalization(
        user=user,
        upload_id=upload_id,
        expected_version=expected_version,
    )
    provider = storage or get_document_storage()
    try:
        verified = provider.verify_object(
            object_key=upload.object_key,
            maximum_size_bytes=MAX_PARTNER_DOCUMENT_SIZE_BYTES,
        )
    except DocumentStorageError as exc:
        raise PartnerDocumentUploadError(
            "The uploaded document could not be verified. Try again.",
            retryable=True,
        ) from exc

    mismatch = (
        verified.size_bytes != upload.size_bytes
        or verified.content_type != upload.content_type
        or verified.sha256 != upload.sha256
    )
    failure_message: str | None = None
    document: PartnerDocument | None = None
    with transaction.atomic():
        locked_upload = PartnerDocumentUpload.objects.select_for_update().get(id=upload.id)
        application = PartnerApplication.objects.select_for_update().get(
            id=locked_upload.application_id,
        )
        _assert_version(application, expected_version)
        _assert_application_editable(application, kind=locked_upload.kind)
        if locked_upload.status != PartnerDocumentUpload.Status.ISSUED:
            raise PartnerDocumentUploadError("This upload cannot be finalized again.")
        if locked_upload.expires_at <= timezone.now():
            locked_upload.status = PartnerDocumentUpload.Status.EXPIRED
            locked_upload.failure_code = "upload_expired"
            locked_upload.save(update_fields=("status", "failure_code", "updated_at"))
            failure_message = "The upload expired. Start a new upload."
        elif mismatch:
            locked_upload.status = PartnerDocumentUpload.Status.FAILED
            locked_upload.failure_code = "metadata_mismatch"
            locked_upload.save(update_fields=("status", "failure_code", "updated_at"))
            failure_message = (
                "The uploaded document did not match the selected file. Start a new upload."
            )
        else:
            previous = (
                PartnerDocument.objects.select_for_update()
                .filter(application=application, kind=locked_upload.kind)
                .order_by("-version")
                .first()
            )
            next_version = (previous.version if previous else 0) + 1
            document = PartnerDocument.objects.create(
                application=application,
                kind=locked_upload.kind,
                version=next_version,
                object_key=locked_upload.object_key,
                content_type=locked_upload.content_type,
                size_bytes=locked_upload.size_bytes,
                sha256=locked_upload.sha256,
                scan_status=PartnerDocument.ScanStatus.CLEAN,
                scanned_at=timezone.now(),
                replaces=previous,
            )
            if previous is not None and previous.status != PartnerDocument.Status.APPROVED:
                previous.status = PartnerDocument.Status.SUPERSEDED
                previous.save(update_fields=("status",))
            locked_upload.status = PartnerDocumentUpload.Status.VERIFIED
            locked_upload.finalized_at = timezone.now()
            locked_upload.failure_code = ""
            locked_upload.save(
                update_fields=("status", "finalized_at", "failure_code", "updated_at"),
            )
            application.version += 1
            application.save(update_fields=("version", "updated_at"))
    if failure_message is not None:
        raise PartnerDocumentUploadError(failure_message)
    if document is None:
        raise PartnerDocumentUploadError("The uploaded document could not be finalized.")
    return document


@transaction.atomic
def record_partner_document_scan_result(
    *,
    document_id: uuid.UUID,
    is_clean: bool,
    failure_code: str = "",
) -> PartnerDocument:
    document = PartnerDocument.objects.select_for_update().get(id=document_id)
    document.scan_status = (
        PartnerDocument.ScanStatus.CLEAN if is_clean else PartnerDocument.ScanStatus.REJECTED
    )
    document.scanned_at = timezone.now()
    document.scan_failure_code = "" if is_clean else failure_code[:64]
    document.save(
        update_fields=("scan_status", "scanned_at", "scan_failure_code"),
    )
    return document


def scan_partner_document(
    document_id: uuid.UUID,
    *,
    scanner: DocumentScanner | None = None,
) -> PartnerDocument:
    """Run the configured scanner on one document and record its verdict, if it gave one.

    A document that already has a verdict is left alone: a scan result is recorded once.
    """
    document = PartnerDocument.objects.get(id=document_id)
    if document.scan_status != PartnerDocument.ScanStatus.PENDING:
        return document
    verdict = (scanner or get_document_scanner()).scan(document)
    if verdict is None:
        return document
    return record_partner_document_scan_result(
        document_id=document.id,
        is_clean=verdict.is_clean,
        failure_code=verdict.failure_code,
    )


def scan_pending_partner_documents(*, scanner: DocumentScanner | None = None) -> int:
    """Scan every document still ``PENDING``. Returns how many received a verdict."""
    chosen = scanner or get_document_scanner()
    scanned = 0
    pending = PartnerDocument.objects.filter(scan_status=PartnerDocument.ScanStatus.PENDING)
    for document_id in pending.values_list("id", flat=True):
        document = scan_partner_document(document_id, scanner=chosen)
        if document.scan_status != PartnerDocument.ScanStatus.PENDING:
            scanned += 1
    return scanned


def cleanup_stale_partner_document_uploads(
    *,
    storage: DocumentStorage | None = None,
    batch_size: int = 100,
) -> int:
    """Delete only unaccepted upload objects after the configured recovery window.

    Verified uploads are intentionally excluded because the legal retention policy for accepted
    KYC records must be approved separately. Missing objects are treated as already deleted by the
    storage adapter, making retries safe after a worker crash.
    """

    now = timezone.now()
    cutoff = now - timedelta(hours=settings.PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS)
    candidate_ids = list(
        PartnerDocumentUpload.objects.filter(object_deleted_at__isnull=True)
        .filter(
            Q(
                status__in=(
                    PartnerDocumentUpload.Status.ISSUED,
                    PartnerDocumentUpload.Status.EXPIRED,
                ),
                expires_at__lte=cutoff,
            )
            | Q(
                status=PartnerDocumentUpload.Status.FAILED,
                updated_at__lte=cutoff,
            ),
        )
        .order_by("expires_at", "id")
        .values_list("id", flat=True)[:batch_size]
    )
    provider = storage or get_document_storage()
    deleted_count = 0
    for upload_id in candidate_ids:
        upload = PartnerDocumentUpload.objects.get(id=upload_id)
        if upload.status == PartnerDocumentUpload.Status.ISSUED:
            PartnerDocumentUpload.objects.filter(
                id=upload.id,
                status=PartnerDocumentUpload.Status.ISSUED,
            ).update(
                status=PartnerDocumentUpload.Status.EXPIRED,
                failure_code="upload_expired",
            )
        provider.delete_object(object_key=upload.object_key)
        updated = (
            PartnerDocumentUpload.objects.filter(
                id=upload.id,
                object_deleted_at__isnull=True,
            )
            .exclude(status=PartnerDocumentUpload.Status.VERIFIED)
            .update(
                object_deleted_at=timezone.now(),
            )
        )
        deleted_count += updated
    return deleted_count


def create_partner_document_review_access(
    *,
    reviewer: User,
    document_id: uuid.UUID,
    storage: DocumentStorage | None = None,
) -> SignedReview:
    document = (
        PartnerDocument.objects.select_related(
            "application__partner",
            "application__review_assigned_to",
        )
        .filter(id=document_id)
        .first()
    )
    if document is None:
        raise PartnerApplicationNotFoundError
    if document.application.partner.user_id == reviewer.id:
        raise PartnerSelfReviewError(object_type="partner_document", object_id=document.id)
    if document.application.review_assigned_to_id != reviewer.id:
        raise PartnerReviewOwnershipError(
            "Claim this Partner application before reviewing its documents.",
        )
    if document.status != PartnerDocument.Status.PENDING:
        raise PartnerTransitionError("This document is not pending review.")
    provider = storage or get_document_storage()
    try:
        return provider.create_signed_review(
            object_key=document.object_key,
            expires_in_seconds=settings.PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS,
        )
    except DocumentStorageError as exc:
        raise PartnerDocumentUploadError(
            "Document review access is temporarily unavailable. Try again.",
            retryable=True,
        ) from exc


def create_partner_document_applicant_access(
    *,
    user: User,
    document_id: uuid.UUID,
    storage: DocumentStorage | None = None,
) -> tuple[PartnerDocument, SignedReview]:
    """A signed preview link for the applicant to inspect their own uploaded document."""
    document = (
        PartnerDocument.objects.select_related("application__partner")
        .filter(id=document_id, application__partner__user=user)
        .first()
    )
    if document is None:
        raise PartnerApplicationNotFoundError
    provider = storage or get_document_storage()
    try:
        signed = provider.create_signed_review(
            object_key=document.object_key,
            expires_in_seconds=settings.PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS,
        )
    except DocumentStorageError as exc:
        raise PartnerDocumentUploadError(
            "Document preview is temporarily unavailable. Try again.",
            retryable=True,
        ) from exc
    return document, signed


@transaction.atomic
def review_partner_document(
    *,
    reviewer: User,
    document_id: uuid.UUID,
    decision: str,
    reason: str = "",
) -> PartnerDocument:
    document = (
        PartnerDocument.objects.select_for_update(of=("self",))
        .select_related("application__partner", "application__review_assigned_to")
        .filter(id=document_id)
        .first()
    )
    if document is None:
        raise PartnerApplicationNotFoundError
    if document.application.partner.user_id == reviewer.id:
        raise PartnerSelfReviewError(object_type="partner_document", object_id=document.id)
    if document.application.review_assigned_to_id != reviewer.id:
        raise PartnerReviewOwnershipError(
            "Claim this Partner application before reviewing its documents.",
        )
    if document.status != PartnerDocument.Status.PENDING:
        raise PartnerTransitionError("This document has already been reviewed.")
    if decision not in {PartnerDocument.Status.APPROVED, PartnerDocument.Status.REJECTED}:
        raise PartnerTransitionError("Choose an approved or rejected document decision.")
    if decision == PartnerDocument.Status.REJECTED and not reason.strip():
        raise PartnerTransitionError("A rejection reason is required.")

    if decision == PartnerDocument.Status.APPROVED:
        PartnerDocument.objects.filter(
            application=document.application,
            kind=document.kind,
            status=PartnerDocument.Status.APPROVED,
        ).exclude(pk=document.pk).update(status=PartnerDocument.Status.SUPERSEDED)
    document.status = decision
    document.reviewed_by = reviewer
    document.reviewed_at = timezone.now()
    document.review_reason = reason
    document.save(
        update_fields=("status", "reviewed_by", "reviewed_at", "review_reason"),
    )
    PartnerApplication.objects.filter(pk=document.application_id).update(
        version=document.application.version + 1,
        updated_at=timezone.now(),
    )
    return document
