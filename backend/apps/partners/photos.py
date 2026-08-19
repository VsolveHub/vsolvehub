"""A partner's photograph: uploading it, reviewing it, and publishing it to a Customer.

## Why a photograph is treated as a reviewed document rather than as a profile field

It is the one thing on a partner's record a Customer sees *before* meeting them, on the screen
that says who is about to enter their home. Left unreviewed, whatever somebody uploads is what a
Customer sees. So this reuses the shape `PartnerDocument` already established — signed upload into
private storage, a verify step that checks the object is really there and within size, then a human
decision — rather than treating the photograph as a string somebody can PATCH.

The costs of that are real and worth naming: a partner is unphotographed until an operator looks,
and the review queue grows with the roster. The alternative is publishing on upload and removing
on complaint, which means the first Customer to see a bad photograph is the moderation system.

## Why only a signed URL is ever published

The bucket is private, the same one the KYC documents live in. Nothing stores a URL, because a
stored URL is a stored expiry; the link is signed per read and is short-lived. A storage outage
therefore degrades to "no photograph" rather than to a broken image, which is why every read path
here returns `None` instead of raising.
"""

import contextlib
import uuid
from dataclasses import dataclass

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.foundation.storage import (
    DocumentStorage,
    DocumentStorageError,
    get_document_storage,
)
from apps.identity.models import User
from apps.partners.models import PartnerProfile

__all__ = [
    "PhotoUploadTicket",
    "approve_partner_photo",
    "partner_photo_url",
    "photo_object_key",
    "reject_partner_photo",
    "start_partner_photo_upload",
    "submit_partner_photo",
]

#: How long a published photograph link stays valid.
#:
#: Short, because the link is signed per render and the page that shows it is read in the moment.
#: Long enough that a Customer who leaves the visit page open through the vendor's arrival window
#: does not watch the face disappear.
PHOTO_URL_TTL_SECONDS = 15 * 60

#: What a profile photograph may weigh. Generous for a phone camera, small enough that the review
#: queue is not a gallery of ten-megabyte originals.
MAX_PHOTO_BYTES = 5 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class PhotoUploadTicket:
    """Where the partner app should PUT the image, and under what key."""

    object_key: str
    upload_url: str
    upload_token: str
    #: The bucket refuses anything larger, so the app should refuse it first — a partner on a
    #: metered connection should not upload eight megabytes to be told no at the end.
    max_bytes: int


def _storage() -> DocumentStorage:
    return get_document_storage(bucket=settings.PARTNER_DOCUMENT_BUCKET)


def photo_object_key(partner: PartnerProfile) -> str:
    """A fresh key per upload.

    Never reused, so a replacement photograph cannot be served from a cache or a signed link
    issued against the previous one — which is how a rejected image comes back after it was
    supposedly gone.
    """

    return f"partner-photos/{partner.id}/{uuid.uuid4()}.jpg"


def start_partner_photo_upload(*, partner: PartnerProfile) -> PhotoUploadTicket:
    """Issue a signed upload. Writes nothing to the partner until the bytes land."""

    key = photo_object_key(partner)
    signed = _storage().create_signed_upload(object_key=key)
    return PhotoUploadTicket(
        object_key=key,
        upload_url=signed.upload_url,
        upload_token=signed.upload_token,
        max_bytes=MAX_PHOTO_BYTES,
    )


@transaction.atomic
def submit_partner_photo(*, partner_id: uuid.UUID, object_key: str) -> PartnerProfile:
    """The partner says the upload finished. Verify the object, then queue it for review.

    Verified rather than trusted: the client claiming an upload succeeded is the party that
    benefits from the claim, and an unverified key would let a partner move to `PENDING` with
    nothing behind it — which the model's own check constraint would then enforce as a lie.
    """

    partner = PartnerProfile.objects.select_for_update().get(pk=partner_id)
    _storage().verify_object(
        object_key=object_key,
        maximum_size_bytes=MAX_PHOTO_BYTES,
    )
    previous_key = partner.photo_object_key
    partner.photo_object_key = object_key
    partner.photo_status = PartnerProfile.PhotoStatus.PENDING
    partner.photo_reviewed_by = None
    partner.photo_reviewed_at = None
    partner.photo_review_reason = ""
    partner.save(
        update_fields=(
            "photo_object_key",
            "photo_status",
            "photo_reviewed_by",
            "photo_reviewed_at",
            "photo_review_reason",
            "updated_at",
        )
    )
    if previous_key and previous_key != object_key:
        # Best effort, and outside the decision. A superseded image that survives storage is
        # clutter; a submission that fails because the *old* file could not be deleted is a
        # partner blocked by housekeeping.
        with contextlib.suppress(DocumentStorageError):
            _storage().delete_object(object_key=previous_key)
    return partner


@transaction.atomic
def approve_partner_photo(*, partner_id: uuid.UUID, reviewer: User) -> PartnerProfile:
    """An operator has looked at it. From here a Customer may see it."""

    partner = PartnerProfile.objects.select_for_update().get(pk=partner_id)
    if not partner.photo_object_key:
        raise ValueError("There is no photograph to approve.")
    partner.photo_status = PartnerProfile.PhotoStatus.APPROVED
    partner.photo_reviewed_by = reviewer
    partner.photo_reviewed_at = timezone.now()
    partner.photo_review_reason = ""
    partner.save(
        update_fields=(
            "photo_status",
            "photo_reviewed_by",
            "photo_reviewed_at",
            "photo_review_reason",
            "updated_at",
        )
    )
    return partner


@transaction.atomic
def reject_partner_photo(
    *,
    partner_id: uuid.UUID,
    reviewer: User,
    reason: str,
) -> PartnerProfile:
    """Refuse it, with a reason the partner is shown.

    The reason is required. A refusal a partner cannot act on produces a re-upload of the same
    image and a second refusal, which is the loop this argument exists to prevent.
    """

    if not reason.strip():
        raise ValueError("A rejected photograph needs a reason the partner can act on.")
    partner = PartnerProfile.objects.select_for_update().get(pk=partner_id)
    partner.photo_status = PartnerProfile.PhotoStatus.REJECTED
    partner.photo_reviewed_by = reviewer
    partner.photo_reviewed_at = timezone.now()
    partner.photo_review_reason = reason.strip()
    partner.save(
        update_fields=(
            "photo_status",
            "photo_reviewed_by",
            "photo_reviewed_at",
            "photo_review_reason",
            "updated_at",
        )
    )
    return partner


def partner_photo_url(partner: PartnerProfile) -> str | None:
    """A short-lived link a Customer may be shown, or None.

    None covers four different situations — no photograph, one awaiting review, one refused, and
    storage being unreachable — and collapsing them is deliberate: the client renders all four
    identically, as the vendor's initials, and a read that raised on the fourth would take the
    whole visit page down over a decoration.
    """

    if not partner.has_publishable_photo:
        return None
    try:
        signed = _storage().create_signed_review(
            object_key=partner.photo_object_key,
            expires_in_seconds=PHOTO_URL_TTL_SECONDS,
        )
    except DocumentStorageError:
        return None
    return str(signed.review_url)
