"""Requirement attachment upload: presign, finalize, scan result, remove.

Three rules shape this module.

**Bytes never pass through Django.** The client is handed a signed URL, uploads directly, and then
asks the server to finalize. The server names the object key, records what it was told to expect,
and on finalize streams the object back to compare size, media type and SHA-256 against that
record. The
intent row is the whole point: without something to compare against, "verify the upload" degrades to
"believe the client", and the client is the party whose file we are suspicious of.

**`INFECTED` is not `FAILED`.** A checksum mismatch is an upload going wrong, and the recovery is to
try again. Malware is not, and the recovery is that the file is gone and no vendor ever saw it. One
status for both would have offered a retry button for the second case.

**An attachment is shareable only at `VERIFIED`.** `matching.snapshot_requirement` freezes what a
vendor saw; a `PENDING` attachment has not been checked and an `INFECTED` one never will be, so
neither is something to show anybody. Nothing here blocks *submission* on a pending scan, though —
the requirement is free and time-critical, and holding it behind a virus scanner would trade the
Customer's delivery promise for a check that usually passes.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final

from django.db import transaction
from django.utils import timezone

from apps.requirements.exceptions import (
    AttachmentRejectedError,
    RequirementLockedError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    RequirementAttachment,
    RequirementAttachmentUpload,
    VendorInvitation,
)
from apps.requirements.storage import (
    DocumentStorage,
    DocumentStorageError,
    get_attachment_storage,
)

SHA256_PATTERN: Final = re.compile(r"^[0-9a-f]{64}$")

#: How long a signed upload URL is good for. Matches `foundation.storage.SIGNED_UPLOAD_LIFETIME`;
#: the provider's own expiry replaces this value on the row once it is known.
UPLOAD_INTENT_LIFETIME: Final = timedelta(hours=2)

#: Media types accepted per attachment kind, with the file suffix the object key gets.
#:
#: An allow-list rather than a deny-list, and keyed by kind rather than global: a "document" that is
#: really an `image/svg+xml` is a script, and a "voice note" that is really a PDF is a client bug
#: worth refusing rather than storing.
ACCEPTED_MEDIA_TYPES: Final[dict[str, dict[str, str]]] = {
    RequirementAttachment.Kind.IMAGE: {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
    },
    RequirementAttachment.Kind.VIDEO: {
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/webm": ".webm",
    },
    RequirementAttachment.Kind.AUDIO: {
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
    },
    RequirementAttachment.Kind.VOICE_NOTE: {
        "audio/mp4": ".m4a",
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
    },
    RequirementAttachment.Kind.DOCUMENT: {
        "application/pdf": ".pdf",
    },
}

#: Size ceilings per kind, in bytes. Different because the reasons differ: a photograph is
#: compressible and a 25 MB one is an unresized camera dump, while a 60-second site video genuinely
#: is tens of megabytes and refusing it would push the Customer to describe the leak in prose.
MAXIMUM_SIZE_BYTES: Final[dict[str, int]] = {
    RequirementAttachment.Kind.IMAGE: 12 * 1024 * 1024,
    RequirementAttachment.Kind.VIDEO: 80 * 1024 * 1024,
    RequirementAttachment.Kind.AUDIO: 20 * 1024 * 1024,
    RequirementAttachment.Kind.VOICE_NOTE: 8 * 1024 * 1024,
    RequirementAttachment.Kind.DOCUMENT: 20 * 1024 * 1024,
}

#: How many attachments one requirement may carry. Bounded because every attachment is storage the
#: platform pays for on a free requirement, and because a vendor reading forty photographs on a
#: phone reads none of them.
MAXIMUM_ATTACHMENTS_PER_REQUIREMENT: Final = 12


@dataclass(frozen=True, slots=True)
class AttachmentUploadGrant:
    upload: RequirementAttachmentUpload
    upload_url: str
    upload_token: str
    expires_at: datetime


def _assert_attachable(requirement: CustomerRequirement) -> None:
    """Attachments may be added while the requirement is still the Customer's own.

    After submission a vendor has been shown a snapshot, and a photograph appearing afterwards is a
    scope change arriving through the back door. `M2-BE-209`'s post-acceptance edit path is where
    that belongs, and it is not built.
    """
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementLockedError("This request is closed.")
    if requirement.status != CustomerRequirement.Status.DRAFT:
        raise RequirementLockedError(
            "This request has already gone to vendors, so its attachments are fixed.",
        )


def _object_suffix(*, kind: str, content_type: str) -> str:
    accepted = ACCEPTED_MEDIA_TYPES.get(kind)
    if accepted is None:
        raise AttachmentRejectedError("That attachment type is not supported.")
    suffix = accepted.get(content_type)
    if suffix is None:
        raise AttachmentRejectedError(
            "That file type cannot be attached here. Try a different file.",
        )
    return suffix


@transaction.atomic
def _create_upload_intent(
    *,
    requirement: CustomerRequirement,
    kind: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
    language: str = "",
) -> RequirementAttachmentUpload:
    locked = CustomerRequirement.objects.select_for_update().get(pk=requirement.pk)
    _assert_attachable(locked)

    normalized = content_type.lower().partition(";")[0].strip()
    suffix = _object_suffix(kind=kind, content_type=normalized)
    if size_bytes <= 0:
        raise AttachmentRejectedError("That file is empty.")
    if size_bytes > MAXIMUM_SIZE_BYTES[kind]:
        allowed_mb = MAXIMUM_SIZE_BYTES[kind] // (1024 * 1024)
        raise AttachmentRejectedError(f"That file is larger than {allowed_mb} MB.")
    if not SHA256_PATTERN.fullmatch(sha256):
        raise AttachmentRejectedError("That file's checksum is invalid.")
    if (
        RequirementAttachment.objects.filter(requirement=locked).count()
        >= MAXIMUM_ATTACHMENTS_PER_REQUIREMENT
    ):
        raise AttachmentRejectedError(
            f"You can attach up to {MAXIMUM_ATTACHMENTS_PER_REQUIREMENT} files.",
        )

    # Server-generated, and it carries no Customer identifier. The requirement id is already a
    # UUID nobody can enumerate, and putting a phone number or a name in an object key is how
    # storage listings become a contact export.
    object_key = f"requirements/{locked.id}/{kind.lower()}/{uuid.uuid4().hex}{suffix}"
    return RequirementAttachmentUpload.objects.create(
        requirement=locked,
        kind=kind,
        object_key=object_key,
        content_type=normalized,
        size_bytes=size_bytes,
        sha256=sha256,
        language=language,
        expires_at=timezone.now() + UPLOAD_INTENT_LIFETIME,
    )


def issue_attachment_upload(
    *,
    requirement: CustomerRequirement,
    kind: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
    language: str = "",
    storage: DocumentStorage | None = None,
) -> AttachmentUploadGrant:
    """Record the intent, then ask storage for a signed URL."""
    upload = _create_upload_intent(
        requirement=requirement,
        kind=kind,
        content_type=content_type,
        size_bytes=size_bytes,
        sha256=sha256,
        language=language,
    )
    provider = storage or get_attachment_storage()
    try:
        signed = provider.create_signed_upload(object_key=upload.object_key)
    except DocumentStorageError as exc:
        # Marked FAILED rather than left ISSUED. An intent nothing can ever be uploaded against is
        # not pending, and leaving it pending makes the orphan sweep the only thing that knows.
        RequirementAttachmentUpload.objects.filter(id=upload.id).update(
            status=RequirementAttachmentUpload.Status.FAILED,
            failure_code="provider_unavailable",
        )
        raise AttachmentRejectedError(
            "Attachments are temporarily unavailable. Try again.",
            retryable=True,
        ) from exc

    upload.expires_at = signed.expires_at
    upload.save(update_fields=("expires_at", "updated_at"))
    return AttachmentUploadGrant(
        upload=upload,
        upload_url=signed.upload_url,
        upload_token=signed.upload_token,
        expires_at=signed.expires_at,
    )


def finalize_attachment_upload(
    *,
    requirement: CustomerRequirement,
    upload_id: uuid.UUID,
    storage: DocumentStorage | None = None,
) -> RequirementAttachment:
    """Verify the object that arrived and turn the intent into an attachment.

    Scoped to `requirement` by the caller, so an upload id belonging to somebody else's requirement
    is a `404` and not a cross-tenant finalize. The verification happens *outside* the transaction
    because it is a network round trip; the decision it feeds is taken inside one, under a row lock,
    so two concurrent finalizes of the same intent produce one attachment.
    """
    upload = RequirementAttachmentUpload.objects.filter(
        id=upload_id,
        requirement=requirement,
    ).first()
    if upload is None:
        raise AttachmentRejectedError("We could not find that upload.")
    if upload.status != RequirementAttachmentUpload.Status.ISSUED:
        raise AttachmentRejectedError("This upload cannot be finalized again.")
    if upload.expires_at <= timezone.now():
        RequirementAttachmentUpload.objects.filter(id=upload.id).update(
            status=RequirementAttachmentUpload.Status.EXPIRED,
            failure_code="upload_expired",
        )
        raise AttachmentRejectedError("That upload expired. Attach the file again.")

    provider = storage or get_attachment_storage()
    try:
        verified = provider.verify_object(
            object_key=upload.object_key,
            maximum_size_bytes=MAXIMUM_SIZE_BYTES[upload.kind],
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

    attachment: RequirementAttachment | None = None
    failure_message: str | None = None
    with transaction.atomic():
        locked = RequirementAttachmentUpload.objects.select_for_update().get(id=upload.id)
        if locked.status != RequirementAttachmentUpload.Status.ISSUED:
            raise AttachmentRejectedError("This upload cannot be finalized again.")
        if locked.expires_at <= timezone.now():
            locked.status = RequirementAttachmentUpload.Status.EXPIRED
            locked.failure_code = "upload_expired"
            locked.save(update_fields=("status", "failure_code", "updated_at"))
            failure_message = "That upload expired. Attach the file again."
        elif mismatch:
            locked.status = RequirementAttachmentUpload.Status.FAILED
            locked.failure_code = "metadata_mismatch"
            locked.save(update_fields=("status", "failure_code", "updated_at"))
            failure_message = "That file did not match what your device sent. Attach it again."
        else:
            attachment = RequirementAttachment.objects.create(
                requirement=locked.requirement,
                kind=locked.kind,
                object_key=locked.object_key,
                content_type=locked.content_type,
                size_bytes=locked.size_bytes,
                sha256=locked.sha256,
                # PENDING, not VERIFIED. The bytes are the ones the client promised; whether they
                # are safe is a separate question the scanner answers, and conflating "matches the
                # checksum" with "clean" is how a scanner becomes decoration.
                processing_status=RequirementAttachment.ProcessingStatus.PENDING,
                transcript_language=locked.language,
            )
            locked.status = RequirementAttachmentUpload.Status.VERIFIED
            locked.finalized_at = timezone.now()
            locked.failure_code = ""
            locked.save(update_fields=("status", "finalized_at", "failure_code", "updated_at"))

    if failure_message is not None:
        raise AttachmentRejectedError(failure_message)
    if attachment is None:  # pragma: no cover - the branches above are exhaustive
        raise AttachmentRejectedError("We could not attach that file.")
    return attachment


@transaction.atomic
def record_attachment_scan_result(
    *,
    attachment_id: uuid.UUID,
    is_clean: bool,
    failure_reason: str = "",
) -> RequirementAttachment:
    """The scanner's verdict. Idempotent: a repeated verdict is a no-op, not a re-decision.

    Naturally idempotent rather than idempotency-keyed, because the caller is a scanner webhook and
    the natural key is the attachment. A second callback carrying the same verdict must not flip a
    file back to `PENDING` and re-open a vendor's access to it.
    """
    attachment = RequirementAttachment.objects.select_for_update().get(pk=attachment_id)
    decided = (
        RequirementAttachment.ProcessingStatus.VERIFIED
        if is_clean
        else RequirementAttachment.ProcessingStatus.INFECTED
    )
    if attachment.processing_status == decided:
        return attachment
    if attachment.processing_status != RequirementAttachment.ProcessingStatus.PENDING:
        raise AttachmentRejectedError("This attachment has already been decided.")

    attachment.processing_status = decided
    attachment.failure_reason = "" if is_clean else failure_reason[:200]
    attachment.save(update_fields=("processing_status", "failure_reason"))
    return attachment


@transaction.atomic
def remove_attachment(
    *,
    requirement: CustomerRequirement,
    attachment_id: uuid.UUID,
    storage: DocumentStorage | None = None,
) -> None:
    """Delete an attachment and its stored object while the requirement is still a draft.

    Refused after submission for the same reason editing is: a vendor was invited against a
    snapshot, and removing a photograph they already quoted on rewrites the question after the
    answer. An `INFECTED` attachment is removable in any state — leaving one attached to a live
    requirement would be keeping malware for the sake of an audit trail the transition log covers.
    """
    attachment = (
        RequirementAttachment.objects.select_for_update()
        .filter(
            id=attachment_id,
            requirement=requirement,
        )
        .first()
    )
    if attachment is None:
        raise AttachmentRejectedError("We could not find that attachment.")
    if attachment.processing_status != RequirementAttachment.ProcessingStatus.INFECTED:
        _assert_attachable(requirement)

    object_key = attachment.object_key
    attachment.delete()

    provider = storage or get_attachment_storage()
    try:
        provider.delete_object(object_key=object_key)
    except DocumentStorageError:
        # The row is gone, so nothing reads or serves this object any more. A storage object the
        # provider would not delete is an orphan for the housekeeping sweep to collect, not a
        # reason to put the attachment back in front of the Customer.
        return


# ---------------------------------------------------------------------------
# Vendor access, and when it ends (`M2-BE-310`)
# ---------------------------------------------------------------------------

#: How long a vendor's signed link to a Customer's site photograph is good for. Short, because the
#: link is a bearer credential the moment it exists: anyone holding the URL is holding the file, and
#: revoking access has to mean something more than "we stopped rendering the button".
ATTACHMENT_REVIEW_LIFETIME_SECONDS: Final = 15 * 60


@dataclass(frozen=True, slots=True)
class VendorAttachment:
    attachment: RequirementAttachment
    download_url: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class VendorAttachmentAccess:
    """What one vendor may see of a Customer's files right now, and whether they still may.

    Expiry is published as a **state on a successful read**, not as an error. Two reasons. The
    vendor is entitled to their own enquiry record either way, so a refusal would be refusing them
    their own row; and "there are no photographs" and "you may no longer see the photographs" are
    different facts that a Partner staring at an empty list deserves told apart. It also keeps M2
    inside the error vocabulary `07-state-machines-and-permissions.md` §8 fixes, instead of adding
    a code that would reach the frontend's error table as an unrecognised string.
    """

    has_access: bool
    attachments: tuple[VendorAttachment, ...]


def invitation_may_read_attachments(invitation: VendorInvitation) -> bool:
    """Whether this vendor still has a reason to see the Customer's files.

    **The coupled decision, settled 13 August: `RequirementSnapshot` does not copy attachments.**
    It freezes the *answers* — the text a vendor quoted against — and attachment access is resolved
    live from the invitation's state each time it is asked for. Two reasons, and the second is the
    one that decides it:

    * A copied attachment set would be a second grant of the file that survives the invitation it
      came from. "Access expires with the invitation" cannot be implemented against a frozen copy
      without also expiring the copy, at which point the copy was never the grant.
    * It answers the open question about a file added or scanned *after* an invitation. A vendor
      sees the requirement's currently-`VERIFIED` attachments, so a photograph that finished its
      malware scan an hour after they were invited becomes visible, and one that came back
      `INFECTED` never does. The alternative — freezing the list at invitation time — would show a
      vendor a `PENDING` file that later turned out to be malware, or hide a clean file from the
      only person who needed it. Attachments cannot be *added* after `DRAFT` anyway
      (`_assert_attachable`), so the live list can only ever gain scan verdicts on files the
      snapshot's own answers already described. Nothing a vendor quoted against changes underneath
      them.

    Access holds while the invitation holds a quote slot — `INVITED`, `ACCEPTED` or `QUOTED` — and
    ends the moment it is declined, expired or withdrawn. A vendor who was not selected loses the
    Customer's site photographs; only the selected vendor keeps them, which is expressed here as
    "their invitation is still `QUOTED` and their proposal is `SELECTED`", and hardens into the
    engagement in Wave C3.
    """
    if invitation.status in VendorInvitation.SLOT_HOLDING_STATUSES:
        return True
    return Proposal.objects.filter(
        invitation=invitation,
        status=Proposal.Status.SELECTED,
    ).exists()


def vendor_attachments(
    *,
    invitation: VendorInvitation,
    storage: DocumentStorage | None = None,
) -> VendorAttachmentAccess:
    """Signed, short-lived links to the requirement's checked attachments, for one vendor.

    **No link is minted once access has lapsed.** That is the substance of `M2-BE-310`: a signed
    URL is a bearer credential, so revoking access has to mean not issuing one, not hiding a
    button. Existing links die on their own within `ATTACHMENT_REVIEW_LIFETIME_SECONDS`, which is
    why that value is minutes rather than days.
    """
    if not invitation_may_read_attachments(invitation):
        return VendorAttachmentAccess(has_access=False, attachments=())

    records = list(
        RequirementAttachment.objects.filter(
            requirement_id=invitation.requirement_id,
            processing_status__in=RequirementAttachment.SHAREABLE_STATUSES,
        ).order_by("created_at", "id")
    )
    if not records:
        return VendorAttachmentAccess(has_access=True, attachments=())

    provider = storage or get_attachment_storage()
    granted: list[VendorAttachment] = []
    for attachment in records:
        try:
            review = provider.create_signed_review(
                object_key=attachment.object_key,
                expires_in_seconds=ATTACHMENT_REVIEW_LIFETIME_SECONDS,
            )
        except DocumentStorageError as exc:
            raise AttachmentRejectedError(
                "We could not open the Customer's files just now. Try again shortly.",
                retryable=True,
            ) from exc
        granted.append(
            VendorAttachment(
                attachment=attachment,
                download_url=review.review_url,
                expires_at=review.expires_at,
            )
        )
    return VendorAttachmentAccess(has_access=True, attachments=tuple(granted))


def orphaned_upload_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Upload intents that expired without ever being finalized.

    Read by `tasks.sweep_orphaned_attachment_uploads`, which marks them and deletes any bytes that
    did arrive. An intent whose object was uploaded and never finalized is storage nobody owns.
    """
    moment = at or timezone.now()
    return list(
        RequirementAttachmentUpload.objects.filter(
            status=RequirementAttachmentUpload.Status.ISSUED,
            expires_at__lt=moment,
        ).values_list("id", flat=True)
    )
