"""Centralized object storage path taxonomy for Cloudflare R2 and local media.

Organizes all platform files into a clean, predictable hierarchy:
- Top-level `images/` vs `documents/`.
- Scoped by business domain (e.g. `partner-kyc`, `stays`, `rentals`, `resumes`).
- Scoped by resource identifier (partner ID, property ID, booking ID).
- Subdivided by purpose (e.g. `government-id`, `gallery`, `damage-evidence`).
- Collision-proof UUID file names with validated extensions.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any
from uuid import UUID

SAFE_IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})
SAFE_DOCUMENT_EXTENSIONS = frozenset({".pdf", ".jpg", ".jpeg", ".png", ".docx"})


def _sanitize_extension(filename: str, *, allowed: frozenset[str], default: str) -> str:
    ext = Path(filename).suffix.lower()
    return ext if ext in allowed else default


def _as_key(identifier: UUID | str | None, default: str = "general") -> str:
    if identifier is None:
        return default
    return str(identifier).strip() or default


# -----------------------------------------------------------------------------
# Public Images Taxonomy
# -----------------------------------------------------------------------------


def catalog_image_path(category_slug: str, entity_slug: str, filename: str) -> str:
    """Public catalog imagery: images/catalog/{category_slug}/{entity_slug}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_IMAGE_EXTENSIONS, default=".webp")
    cat = category_slug.strip().lower() or "general"
    slug = entity_slug.strip().lower() or "item"
    return f"images/catalog/{cat}/{slug}/{uuid.uuid4().hex}{ext}"


def partner_avatar_path(partner_id: UUID | str | None, filename: str) -> str:
    """Public partner profile avatar: images/partners/avatars/{partner_id}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_IMAGE_EXTENSIONS, default=".jpg")
    pkey = _as_key(partner_id, "anon")
    return f"images/partners/avatars/{pkey}/{uuid.uuid4().hex}{ext}"


def stay_property_image_path(
    property_id: UUID | str | None,
    category: str,
    filename: str,
) -> str:
    """Public stay imagery: images/stays/properties/{property_id}/{category}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_IMAGE_EXTENSIONS, default=".jpg")
    prop_key = _as_key(property_id, "unassigned")
    cat = category.strip().lower() or "gallery"
    return f"images/stays/properties/{prop_key}/{cat}/{uuid.uuid4().hex}{ext}"


def rental_asset_image_path(
    asset_id: UUID | str | None,
    category: str,
    filename: str,
) -> str:
    """Public rental asset imagery: images/rentals/assets/{asset_id}/{category}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_IMAGE_EXTENSIONS, default=".jpg")
    asset_key = _as_key(asset_id, "unassigned")
    cat = category.strip().lower() or "gallery"
    return f"images/rentals/assets/{asset_key}/{cat}/{uuid.uuid4().hex}{ext}"


def stay_review_image_path(
    property_id: UUID | str | None,
    customer_id: UUID | str | None,
    filename: str,
) -> str:
    """Public stay review photo: images/reviews/stays/{prop_id}/{cust_id}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_IMAGE_EXTENSIONS, default=".jpg")
    prop_key = _as_key(property_id, "general")
    cust_key = _as_key(customer_id, "anon")
    return f"images/reviews/stays/{prop_key}/{cust_key}/{uuid.uuid4().hex}{ext}"


# -----------------------------------------------------------------------------
# Private Documents Taxonomy (KYC, Resumes, Legal, Identity)
# -----------------------------------------------------------------------------


def partner_kyc_document_path(
    partner_id: UUID | str,
    kind: str,
    ext: str,
) -> str:
    """Private partner KYC document: documents/partner-kyc/{partner_id}/{kind}/{uuid}{ext}."""
    clean_ext = ext.lower() if ext.startswith(".") else f".{ext.lower()}"
    if clean_ext not in SAFE_DOCUMENT_EXTENSIONS:
        clean_ext = ".pdf"
    clean_kind = kind.strip().lower() or "other"
    return f"documents/partner-kyc/{partner_id}/{clean_kind}/{uuid.uuid4().hex}{clean_ext}"


def crew_document_path(
    partner_id: UUID | str,
    crew_id: UUID | str,
    kind: str,
    ext: str,
) -> str:
    """Private crew document: documents/crew-identity/{p_id}/{c_id}/{kind}/{uuid}{ext}."""
    clean_ext = ext.lower() if ext.startswith(".") else f".{ext.lower()}"
    if clean_ext not in SAFE_DOCUMENT_EXTENSIONS:
        clean_ext = ".pdf"
    clean_kind = kind.strip().lower() or "identity"
    uid = uuid.uuid4().hex
    return f"documents/crew-identity/{partner_id}/{crew_id}/{clean_kind}/{uid}{clean_ext}"


def listing_resume_path(
    listing_id: UUID | str | None,
    application_id: UUID | str | None,
    filename: str,
) -> str:
    """Private resume: documents/resumes/applications/{listing_id}/{app_id}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_DOCUMENT_EXTENSIONS, default=".pdf")
    l_key = _as_key(listing_id, "general")
    a_key = _as_key(application_id, "direct")
    return f"documents/resumes/applications/{l_key}/{a_key}/{uuid.uuid4().hex}{ext}"


def job_seeker_resume_path(
    user_id: UUID | str | None,
    filename: str,
) -> str:
    """Private resume: documents/resumes/job-seeker-profiles/{user_id}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_DOCUMENT_EXTENSIONS, default=".pdf")
    u_key = _as_key(user_id, "anon")
    return f"documents/resumes/job-seeker-profiles/{u_key}/{uuid.uuid4().hex}{ext}"


# -----------------------------------------------------------------------------
# Private Images Taxonomy (Fulfilment Evidence, Rental Disputes)
# -----------------------------------------------------------------------------


def fulfilment_evidence_path(
    booking_id: UUID | str | None,
    stage: str,
    filename: str,
) -> str:
    """Private evidence: images/fulfilment-evidence/{booking_id}/{stage}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_IMAGE_EXTENSIONS, default=".jpg")
    b_key = _as_key(booking_id, "unlinked")
    s_key = stage.strip().lower() or "progress"
    return f"images/fulfilment-evidence/{b_key}/{s_key}/{uuid.uuid4().hex}{ext}"


def rental_dispute_image_path(
    booking_id: UUID | str | None,
    partner_id: UUID | str | None,
    filename: str,
) -> str:
    """Private damage evidence: images/rental-disputes/{booking_id}/{partner_id}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_IMAGE_EXTENSIONS, default=".jpg")
    b_key = _as_key(booking_id, "general")
    p_key = _as_key(partner_id, "partner")
    return f"images/rental-disputes/{b_key}/{p_key}/{uuid.uuid4().hex}{ext}"


def requirement_attachment_path(
    requirement_id: UUID | str | None,
    filename: str,
) -> str:
    """Private attachment: images/requirement-attachments/{requirement_id}/{uuid}{ext}."""
    ext = _sanitize_extension(filename, allowed=SAFE_IMAGE_EXTENSIONS, default=".jpg")
    r_key = _as_key(requirement_id, "general")
    return f"images/requirement-attachments/{r_key}/{uuid.uuid4().hex}{ext}"


# -----------------------------------------------------------------------------
# Django Model upload_to Callables
# -----------------------------------------------------------------------------


def stay_ad_upload_to(instance: Any, filename: str) -> str:
    partner_id = getattr(instance, "partner_id", None)
    return stay_property_image_path(
        property_id=None,
        category=f"partner-{partner_id or 'anon'}",
        filename=filename,
    )


def stay_review_upload_to(instance: Any, filename: str) -> str:
    customer_id = getattr(instance, "customer_id", None)
    property_id = getattr(instance, "property_id", None)
    return stay_review_image_path(
        property_id=property_id,
        customer_id=customer_id,
        filename=filename,
    )


def rental_ad_upload_to(instance: Any, filename: str) -> str:
    partner_id = getattr(instance, "partner_id", None)
    return rental_asset_image_path(
        asset_id=None,
        category=f"partner-{partner_id or 'anon'}",
        filename=filename,
    )


def rental_dispute_upload_to(instance: Any, filename: str) -> str:
    partner_id = getattr(instance, "partner_id", None)
    booking_id = getattr(instance, "booking_id", None)
    return rental_dispute_image_path(
        booking_id=booking_id,
        partner_id=partner_id,
        filename=filename,
    )


def listing_resume_upload_to(instance: Any, filename: str) -> str:
    listing_id = getattr(instance, "listing_id", None)
    application_id = getattr(instance, "application_id", None)
    return listing_resume_path(
        listing_id=listing_id,
        application_id=application_id,
        filename=filename,
    )


def job_seeker_resume_upload_to(instance: Any, filename: str) -> str:
    user_id = getattr(instance, "user_id", None)
    return job_seeker_resume_path(user_id=user_id, filename=filename)
