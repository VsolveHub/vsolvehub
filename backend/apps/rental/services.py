"""A7 rental domain services. Fail-closed on capability + ACTIVE A7VariantConfiguration."""

from __future__ import annotations

import logging
import secrets
from datetime import date, timedelta
from typing import Any
from uuid import UUID

import jsonschema
from django.conf import settings
from django.db import models, transaction
from django.db.models import F, IntegerField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError

from apps.catalog.models import A7VariantConfiguration, Category, Service, Subcategory
from apps.commerce.models import FinancialException, PaymentAttempt
from apps.commerce.services import _request_automatic_refund
from apps.commerce.services.base import PAYMENT_FINAL_STATES, _open_exception
from apps.commerce.services.payments import initiate_standalone_payment_attempt
from apps.foundation.models import OutboxEvent
from apps.foundation.storage import public_stored_name
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import record_adjustment, release_payout_hold, settle_rental_earning
from apps.rental.field_options import with_suggestions
from apps.rental.models import (
    AssetReservation,
    RentalAsset,
    RentalAssetMedia,
    RentalBooking,
    RentalBookingLine,
    RentalDeposit,
    RentalDisputePhoto,
    RentalModerationEvent,
    RentalPhotoUpload,
    RentalPlatformFee,
    RentalTransportRequest,
    overlapping_reservations,
    overlapping_reserved_quantity,
)
from apps.rental.pickup_address import (
    PickupAddressError,
    clean_pincode,
    location_label,
    missing_parts,
)
from apps.rental.pickup_hours import PickupHoursError, check_open_days, hours_are_set

logger = logging.getLogger(__name__)


class RentalStateError(ValueError):
    def __init__(self, message: str, *, code: str = "rental_state_invalid") -> None:
        super().__init__(message)
        self.code = code


HANDOVER_PIN_LENGTH = 4
#: The longest magic number checked below (PNG's 8-byte signature).
IMAGE_SIGNATURE_BYTES = 8


def ensure_customer_handover_pin(*, user: Any) -> str:
    """DEPRECATED: PIN is now generated per-booking.

    Returns a dummy or existing PIN for backward compatibility.
    New code should use booking.handover_pin_hash directly.
    """
    existing = (getattr(user, "rental_handover_pin_hash", "") or "").strip()
    if existing and len(existing) == HANDOVER_PIN_LENGTH and existing.isdigit():
        return existing
    return "0000"


def verify_handover_pin(*, booking: Any, pin: str) -> bool:
    expected = (getattr(booking, "handover_pin_hash", "") or "").strip()
    provided = str(pin or "").strip()
    if not expected or not provided:
        return False
    return secrets.compare_digest(expected, provided)


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def _require_rental_capability(partner: Any) -> None:
    if not partner.capabilities.filter(archetype="A7_RENTAL", status="APPROVED").exists():
        raise PermissionError("Partner does not have an approved A7 rental capability.")


def _require_active_a7(variant_id: UUID | str) -> A7VariantConfiguration:
    config = A7VariantConfiguration.objects.filter(
        variant_id=_as_uuid(variant_id),
        status=A7VariantConfiguration.Status.ACTIVE,
    ).first()
    if config is None:
        raise RentalStateError("This rental category is not open yet.")
    return config


_RENTAL_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_RENTAL_PHOTO_MAX_BYTES = 10 * 1024 * 1024
MAX_DISPUTE_PHOTOS = 5


def store_rental_photo(
    *,
    partner: Any,
    upload: Any,
) -> RentalPhotoUpload:
    _require_rental_capability(partner)
    content_type = (getattr(upload, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type not in _RENTAL_PHOTO_TYPES:
        raise RentalStateError("Photo must be a JPEG, PNG, or WebP image.")
    size = int(getattr(upload, "size", 0) or 0)
    if size <= 0:
        raise RentalStateError("Photo file is empty.")
    if size > _RENTAL_PHOTO_MAX_BYTES:
        raise RentalStateError("Photo must be 10 MB or smaller.")
    # Real image header check — do not trust the Content-Type alone.
    _validate_image_header(upload)
    return RentalPhotoUpload.objects.create(
        partner=partner,
        stored_file=upload,
        original_name=str(getattr(upload, "name", "photo"))[:180],
        content_type=content_type,
        size_bytes=size,
    )


def _validate_image_header(upload: Any) -> None:
    """Read the first bytes and check for a real image magic number.

    Trusted Content-Type headers let a user upload arbitrary files that
    then live on our CDN with an image extension. This check looks at
    what the file actually starts with.
    """

    position = upload.tell() if hasattr(upload, "tell") else 0
    header = upload.read(32)
    if hasattr(upload, "seek"):
        upload.seek(position)

    if isinstance(header, str):
        header = header.encode("latin-1")
    if len(header) < IMAGE_SIGNATURE_BYTES:
        raise RentalStateError("File is too small to be an image.")

    # JPEG: FF D8 FF
    if header[:3] == b"\xff\xd8\xff":
        return
    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if header[:8] == b"\x89PNG\r\n\x1a\n":
        return
    # WebP: RIFF....WEBP
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return
    raise RentalStateError("File does not appear to be a valid JPEG, PNG or WebP image.")


def store_rental_dispute_photo(*, partner: Any, upload: Any) -> RentalDisputePhoto:
    """Same image rules as ad photos, saved as private dispute evidence."""
    _require_rental_capability(partner)
    content_type = (getattr(upload, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type not in _RENTAL_PHOTO_TYPES:
        raise RentalStateError("Photo must be a JPEG, PNG, or WebP image.")
    size = int(getattr(upload, "size", 0) or 0)
    if size <= 0:
        raise RentalStateError("Photo file is empty.")
    if size > _RENTAL_PHOTO_MAX_BYTES:
        raise RentalStateError("Photo must be 10 MB or smaller.")
    _validate_image_header(upload)
    return RentalDisputePhoto.objects.create(
        partner=partner,
        stored_file=upload,
        original_name=str(getattr(upload, "name", "photo"))[:180],
        content_type=content_type,
        size_bytes=size,
    )


def _attach_dispute_photos(
    *,
    partner: Any,
    booking: RentalBooking,
    photo_ids: list[UUID | str] | None,
) -> None:
    ids = list(dict.fromkeys(photo_ids or []))
    if len(ids) > MAX_DISPUTE_PHOTOS:
        raise RentalStateError(
            "Attach at most 5 photos.",
            code="dispute_photo_limit",
        )
    if not ids:
        return
    rows = list(RentalDisputePhoto.objects.select_for_update().filter(id__in=ids, partner=partner))
    if len(rows) != len(ids):
        raise RentalStateError(
            "One of those photos is not yours.",
            code="dispute_photo_invalid",
        )
    if any(row.booking_id is not None for row in rows):
        raise RentalStateError(
            "One of those photos is already attached to a dispute.",
            code="dispute_photo_invalid",
        )
    RentalDisputePhoto.objects.filter(id__in=ids, partner=partner).update(booking=booking)


def partner_owns_rental_photo(*, partner: Any, url: str) -> bool:
    stored_name = public_stored_name(url, folder="rental-ads/")
    if stored_name is None:
        return False
    return RentalPhotoUpload.objects.filter(partner=partner, stored_file=stored_name).exists()


def create_asset(
    *,
    partner: Any,
    variant_id: UUID | str,
    title: str,
    daily_rate_paise: int,
    deposit_paise: int = 0,
    description: str = "",
    location_text: str = "",
    asset_identifier: str = "",
    quantity_available: int = 1,
    structured_fields: dict[str, Any] | None = None,
    media: list[dict[str, Any]] | None = None,
    image_urls: list[str] | None = None,
    pickup_address_line: str = "",
    pickup_area: str = "",
    pickup_city: str = "",
    pickup_pincode: str = "",
    delivery_available: bool = False,
) -> RentalAsset:
    _require_rental_capability(partner)
    config = _require_active_a7(variant_id)
    if daily_rate_paise <= 0:
        raise RentalStateError("Daily rate must be positive paise.")
    if quantity_available < 1:
        raise RentalStateError("Quantity must be at least 1.")
    if config.asset_schema and structured_fields:
        try:
            jsonschema.validate(instance=structured_fields, schema=config.asset_schema)
        except JsonSchemaValidationError as e:
            raise RentalStateError(f"Invalid structured fields: {e.message}") from e
    deposit = deposit_paise if deposit_paise > 0 else config.default_deposit_paise
    try:
        pincode = clean_pincode(pickup_pincode)
    except PickupAddressError as exc:
        raise RentalStateError(str(exc), code=exc.code) from exc
    line = (pickup_address_line or "").strip()
    # Prefer explicit location; otherwise fall back to partner registered address.
    fallback = (
        (location_text or "").strip()
        or line
        or (getattr(partner, "default_location_text", "") or "")
    )
    location = location_label(area=pickup_area, city=pickup_city, fallback=fallback)[:180]
    asset = RentalAsset.objects.create(
        partner=partner,
        variant_id=_as_uuid(variant_id),
        title=title.strip(),
        description=description,
        location_text=location,
        pickup_address_line=line or fallback[:240],
        pickup_area=(pickup_area or "").strip(),
        pickup_city=(pickup_city or "").strip(),
        pickup_pincode=pincode,
        delivery_available=bool(delivery_available),
        asset_identifier=asset_identifier,
        quantity_available=quantity_available,
        daily_rate_paise=daily_rate_paise,
        deposit_paise=deposit,
        moderation_status="DRAFT",
        structured_fields=structured_fields or {},
    )
    items: list[dict[str, Any]] = list(media or [])
    if image_urls:
        for idx, u in enumerate(image_urls):
            items.append({"url": u, "caption": "", "display_order": idx})
    for idx, item in enumerate(items):
        url = item.get("url") or item.get("image_url", "")
        if url:
            RentalAssetMedia.objects.create(
                asset=asset,
                url=url,
                caption=item.get("caption", ""),
                display_order=item.get("display_order", item.get("sort_order", idx)),
            )
    return asset


def auto_publish_asset(
    *,
    partner: Any,
    variant_id: UUID | str,
    title: str,
    daily_rate_paise: int,
    deposit_paise: int = 0,
    description: str = "",
    location_text: str = "",
    asset_identifier: str = "",
    quantity_available: int = 1,
    structured_fields: dict[str, Any] | None = None,
    media: list[dict[str, Any]] | None = None,
    image_urls: list[str] | None = None,
    pickup_address_line: str = "",
    pickup_area: str = "",
    pickup_city: str = "",
    pickup_pincode: str = "",
    delivery_available: bool = False,
) -> RentalAsset:
    """Create and immediately publish an ad after automatic checks.

    Replaces the old submit → admin-approve flow. The ad goes live if:
    - at least 1 photo is attached
    - title is non-empty
    - daily rate > 0
    - the pickup address has an address line, city and pincode
    - the owner has set their pickup hours
    Ops keeps Remove/Reinstate for moderation after the fact.
    """
    asset = create_asset(
        partner=partner,
        variant_id=variant_id,
        title=title,
        daily_rate_paise=daily_rate_paise,
        deposit_paise=deposit_paise,
        description=description,
        location_text=location_text,
        asset_identifier=asset_identifier,
        quantity_available=quantity_available,
        structured_fields=structured_fields,
        media=media,
        image_urls=image_urls,
        pickup_address_line=pickup_address_line,
        pickup_area=pickup_area,
        pickup_city=pickup_city,
        pickup_pincode=pickup_pincode,
        delivery_available=delivery_available,
    )
    # Automatic checks for publish readiness.
    errors: list[str] = []
    if not asset.media.exists():
        errors.append("At least one photo is required.")
    if not asset.title.strip():
        errors.append("A title is required.")
    if asset.daily_rate_paise <= 0:
        errors.append("Daily rate must be positive.")
    missing = missing_parts(asset)
    if missing:
        errors.append(f"Add the pickup {', '.join(missing)}.")
    if not hours_are_set(partner.id):
        errors.append("Set your pickup hours.")
    if errors:
        # Leave as DRAFT rather than rejecting; let the partner fix and re-submit.
        asset.moderation_reason = "; ".join(errors)
        asset.save(update_fields=("moderation_reason", "updated_at"))
        return asset
    # Auto-publish: set APPROVED + ACTIVE.
    asset.moderation_status = RentalAsset.ModerationStatus.APPROVED
    asset.current_status = RentalAsset.Status.ACTIVE
    asset.moderation_reason = "Auto-published"
    asset.save(
        update_fields=("moderation_status", "current_status", "moderation_reason", "updated_at")
    )
    RentalModerationEvent.objects.create(
        asset=asset,
        actor=partner.user,
        action=RentalModerationEvent.Action.APPROVED,
        reason="Auto-published: all checks passed.",
    )
    return asset


def update_asset(  # noqa: PLR0912
    *,
    asset: RentalAsset,
    partner: Any,
    title: str | None = None,
    description: str | None = None,
    daily_rate_paise: int | None = None,
    deposit_paise: int | None = None,
    location_text: str | None = None,
    quantity_available: int | None = None,
    structured_fields: dict[str, Any] | None = None,
    pickup_address_line: str | None = None,
    pickup_area: str | None = None,
    pickup_city: str | None = None,
    pickup_pincode: str | None = None,
    delivery_available: bool | None = None,
) -> RentalAsset:
    """Edit an existing ad. Only the owner can edit, and only non-REMOVED/RETIRED ads."""
    _require_rental_capability(partner)
    if asset.partner_id != partner.id:
        raise PermissionError("Not your asset.")
    if asset.moderation_status in ("REMOVED",):
        raise RentalStateError("A removed ad cannot be edited. Contact support.")
    if asset.current_status == RentalAsset.Status.RETIRED:
        raise RentalStateError("A deleted ad cannot be edited.")

    update_fields: list[str] = ["updated_at"]
    if title is not None:
        asset.title = title.strip()
        update_fields.append("title")
    if description is not None:
        asset.description = description
        update_fields.append("description")
    if daily_rate_paise is not None:
        if daily_rate_paise <= 0:
            raise RentalStateError("Daily rate must be positive paise.")
        asset.daily_rate_paise = daily_rate_paise
        update_fields.append("daily_rate_paise")
    if deposit_paise is not None:
        if deposit_paise < 0:
            raise RentalStateError("Deposit cannot be negative.")
        asset.deposit_paise = deposit_paise
        update_fields.append("deposit_paise")
    if location_text is not None:
        asset.location_text = location_text.strip()
        update_fields.append("location_text")
    if quantity_available is not None:
        if quantity_available < 1:
            raise RentalStateError("Quantity must be at least 1.")
        asset.quantity_available = quantity_available
        update_fields.append("quantity_available")
    if structured_fields is not None:
        asset.structured_fields = structured_fields
        update_fields.append("structured_fields")
    address = {
        "pickup_address_line": pickup_address_line,
        "pickup_area": pickup_area,
        "pickup_city": pickup_city,
        "pickup_pincode": pickup_pincode,
    }
    update_fields += _apply_pickup_address(
        asset, address, keep_location_text=location_text is not None
    )
    if delivery_available is not None:
        asset.delivery_available = bool(delivery_available)
        update_fields.append("delivery_available")

    asset.save(update_fields=update_fields)
    return asset


def _apply_pickup_address(
    asset: RentalAsset, address: dict[str, str | None], *, keep_location_text: bool
) -> list[str]:
    """Set the address parts that were sent. Returns the changed field names."""
    changed: list[str] = []
    for field, value in address.items():
        if value is None:
            continue
        cleaned = value
        if field == "pickup_pincode":
            try:
                cleaned = clean_pincode(value)
            except PickupAddressError as exc:
                raise RentalStateError(str(exc), code=exc.code) from exc
        setattr(asset, field, cleaned.strip())
        changed.append(field)
    if changed and not keep_location_text:
        # The short public place name follows the address unless the owner set one.
        asset.location_text = location_label(
            area=asset.pickup_area, city=asset.pickup_city, fallback=asset.pickup_address_line
        )[:180]
        changed.append("location_text")
    return changed


def pause_asset(*, asset: RentalAsset, partner: Any) -> RentalAsset:
    """Owner temporarily hides an ad. Active bookings continue unaffected."""
    _require_rental_capability(partner)
    if asset.partner_id != partner.id:
        raise PermissionError("Not your asset.")
    if asset.moderation_status != RentalAsset.ModerationStatus.APPROVED:
        raise RentalStateError("Only published ads can be paused.")
    asset.moderation_status = RentalAsset.ModerationStatus.PAUSED
    asset.save(update_fields=("moderation_status", "updated_at"))
    return asset


def resume_asset(*, asset: RentalAsset, partner: Any) -> RentalAsset:
    """Owner un-pauses an ad. Brings it back to APPROVED (published)."""
    _require_rental_capability(partner)
    if asset.partner_id != partner.id:
        raise PermissionError("Not your asset.")
    if asset.moderation_status != RentalAsset.ModerationStatus.PAUSED:
        raise RentalStateError("Only paused ads can be resumed.")
    asset.moderation_status = RentalAsset.ModerationStatus.APPROVED
    asset.save(update_fields=("moderation_status", "updated_at"))
    return asset


def delete_asset(*, asset: RentalAsset, partner: Any) -> RentalAsset:
    """Soft-delete (archive) an ad. Existing bookings are unaffected."""
    _require_rental_capability(partner)
    if asset.partner_id != partner.id:
        raise PermissionError("Not your asset.")
    if asset.current_status == RentalAsset.Status.RETIRED:
        raise RentalStateError("Ad is already deleted.")
    asset.current_status = RentalAsset.Status.RETIRED
    asset.save(update_fields=("current_status", "updated_at"))
    return asset


def remove_media(*, asset: RentalAsset, partner: Any, media_id: UUID | str) -> None:
    """Remove one photo from an ad."""
    _require_rental_capability(partner)
    if asset.partner_id != partner.id:
        raise PermissionError("Not your asset.")
    deleted, _ = RentalAssetMedia.objects.filter(asset=asset, id=_as_uuid(media_id)).delete()
    if not deleted:
        raise RentalStateError("Photo not found on this ad.")


def _notify_rental(
    *,
    recipient_id: UUID,
    purpose: str,
    template_code: str,
    context: dict[str, Any],
    idempotency_key: str,
) -> None:
    """Fire an in-app rental notification. Best-effort: never breaks the caller."""
    try:
        request_notification(
            recipient_id=recipient_id,
            purpose=purpose,
            channel=NotificationIntent.Channel.IN_APP,
            template_code=template_code,
            context=context,
            idempotency_key=idempotency_key,
        )
    except Exception:
        # Notification failure must never block a booking or return.
        logger.warning("Failed to dispatch rental notification %s", template_code, exc_info=True)


def attach_asset_media(
    *,
    asset: RentalAsset,
    partner: Any,
    url: str,
    caption: str = "",
    display_order: int = 0,
) -> RentalAssetMedia:
    _require_rental_capability(partner)
    if asset.partner_id != partner.id:
        raise PermissionError("Not your asset.")
    if not url:
        raise RentalStateError("Image URL is required.")
    return RentalAssetMedia.objects.create(
        asset=asset,
        url=url,
        caption=caption,
        display_order=display_order,
    )


def get_rental_taxonomy() -> list[dict[str, Any]]:
    category = Category.objects.filter(slug="rental-services").first()
    if not category:
        return []
    result = []
    subcategories = Subcategory.objects.filter(category=category).prefetch_related(
        "services__variants__a7_configurations"
    )
    for sub in subcategories:
        sub_data: dict[str, Any] = {
            "id": sub.id,
            "name": sub.name,
            "slug": sub.slug,
            "services": [],
        }
        for svc in sub.services.filter(status=Service.Status.ACTIVE):
            svc_data: dict[str, Any] = {
                "id": svc.id,
                "name": svc.name,
                "slug": svc.slug,
                "variants": [],
            }
            for v in svc.variants.filter(is_active=True, booking_archetype="A7_RENTAL"):
                active_cfg = v.a7_configurations.filter(
                    status=A7VariantConfiguration.Status.ACTIVE
                ).first()
                if active_cfg:
                    svc_data["variants"].append(
                        {
                            "id": v.id,
                            "name": v.name,
                            "code": v.code,
                            # Dropdown lists for colour/material are added at serve time,
                            # so a category edited after migration 0014 still gets them.
                            "asset_schema": with_suggestions(active_cfg.asset_schema or {}),
                            "default_deposit_paise": active_cfg.default_deposit_paise,
                        }
                    )
            if svc_data["variants"]:
                sub_data["services"].append(svc_data)
        if sub_data["services"]:
            result.append(sub_data)
    return result


def submit_asset(*, asset: RentalAsset, partner: Any) -> RentalAsset:
    _require_rental_capability(partner)
    if asset.partner_id != partner.id:
        raise PermissionError("Not your asset.")
    _require_active_a7(asset.variant_id)
    if asset.moderation_status not in ("DRAFT", "REJECTED"):
        raise RentalStateError("Asset cannot be submitted from this state.")
    asset.moderation_status = "PENDING"
    asset.save(update_fields=("moderation_status", "updated_at"))
    RentalModerationEvent.objects.create(
        asset=asset, actor=partner.user, action=RentalModerationEvent.Action.SUBMITTED, reason=""
    )
    return asset


def moderate_asset(
    *,
    asset: RentalAsset,
    actor: Any,
    action: str,
    reason: str,
) -> RentalAsset:
    reason = (reason or "").strip()
    if not reason:
        raise RentalStateError("A moderation reason is required.")
    action = action.upper()
    if action == "APPROVE":
        asset.moderation_status = "APPROVED"
        asset.current_status = RentalAsset.Status.ACTIVE
        event = RentalModerationEvent.Action.APPROVED
    elif action == "REJECT":
        asset.moderation_status = "REJECTED"
        event = RentalModerationEvent.Action.REJECTED
    elif action == "REMOVE":
        asset.moderation_status = "REMOVED"
        event = RentalModerationEvent.Action.REMOVED
    elif action == "REINSTATE":
        asset.moderation_status = "APPROVED"
        asset.current_status = RentalAsset.Status.ACTIVE
        event = RentalModerationEvent.Action.REINSTATED
    else:
        raise RentalStateError("Unknown moderation action.")
    asset.moderation_reason = reason
    asset.save(
        update_fields=("moderation_status", "current_status", "moderation_reason", "updated_at")
    )
    RentalModerationEvent.objects.create(asset=asset, actor=actor, action=event, reason=reason)
    return asset


PLATFORM_FEE_PERCENT_MAX = 100


def current_platform_fee_percent() -> int:
    """The live rate. No saved row means customers are not charged a platform fee."""
    row = RentalPlatformFee.objects.filter(pk=1).only("percent").first()
    if row is None:
        return 0
    return int(row.percent)


def rental_platform_fee_paise(rental_fee_paise: int, percent: int) -> int:
    """Whole percent of the rental fee, floored to paise. The deposit is not included."""
    if percent <= 0 or rental_fee_paise <= 0:
        return 0
    return rental_fee_paise * percent // 100


def save_platform_fee(*, percent: int, actor: Any) -> RentalPlatformFee:
    if percent < 0 or percent > PLATFORM_FEE_PERCENT_MAX:
        raise RentalStateError(
            "Platform fee must be a whole number from 0 to 100.",
            code="platform_fee_invalid",
        )
    row, _created = RentalPlatformFee.objects.update_or_create(
        pk=1,
        defaults={"percent": percent, "updated_by": actor},
    )
    return row


def _check_bookable(
    asset: RentalAsset, start_date: date, end_date: date, *, is_delivery: bool
) -> int:
    """Refuse dates, modes and days this item can't be booked for. Returns the rental days."""
    config = _require_active_a7(asset.variant_id)
    if asset.public_state != "PUBLISHED":
        raise RentalStateError("Asset is not available to book.")
    if end_date <= start_date:
        raise RentalStateError("End date must be after start date.")
    days = (end_date - start_date).days
    if days < config.min_rental_days:
        raise RentalStateError(f"Minimum rental is {config.min_rental_days} day(s).")
    if is_delivery and not asset.delivery_available:
        raise RentalStateError(
            "The owner doesn't offer delivery for this item. Choose self pickup.",
            code="delivery_not_offered",
        )
    if is_delivery and start_date <= timezone.localdate():
        # The owner needs time to check the request and quote a price.
        raise RentalStateError(
            "Delivery needs at least a day to arrange. Choose a later date or self pickup.",
            code="delivery_too_soon",
        )
    try:
        check_open_days(partner_id=asset.partner_id, start_date=start_date, end_date=end_date)
    except PickupHoursError as exc:
        raise RentalStateError(str(exc), code=exc.code) from exc
    return days


def _check_stock(asset: RentalAsset, start_date: date, end_date: date, quantity: int) -> None:
    stock = int(asset.quantity_available or 0)
    if stock < 1:
        raise RentalStateError(
            "Out of stock for those dates.",
            code="out_of_stock",
        )
    # Serialize against concurrent holds on the same asset/date window.
    list(overlapping_reservations(asset.id, start_date, end_date).select_for_update())
    overlapping = overlapping_reserved_quantity(asset.id, start_date, end_date)
    remaining = stock - overlapping
    if remaining <= 0:
        raise RentalStateError(
            "Out of stock for those dates.",
            code="out_of_stock",
        )
    if quantity > remaining:
        raise RentalStateError(
            "Not enough quantity available for those dates.",
            code="insufficient_quantity",
        )


@transaction.atomic
def create_booking(
    *,
    customer: Any,
    asset_id: UUID | str,
    start_date: date,
    end_date: date,
    mode: str = "PICKUP",
    notes: str = "",
    quantity: int = 1,
    hold_deposit_for_demo: bool = False,
    delivery_address: dict[str, Any] | None = None,
    delivery_note: str = "",
) -> RentalBooking:
    """Book a rental.

    ``PICKUP``: the customer pays rent, platform fee and deposit now (``PENDING_PAYMENT``).

    ``DELIVERY``: nothing is charged yet. The booking waits for the owner's transport price
    (``AWAITING_TRANSPORT_QUOTE``) with its dates held tentatively. Once the customer accepts the
    price, rent, fee, deposit and transport are paid in one charge (``transport.accept_quote``).
    """
    # transport imports this module, so it is loaded here, not at the top.
    from apps.rental import transport as transport_service  # noqa: PLC0415

    if mode not in RentalBooking.Mode.values:
        raise RentalStateError("Choose self pickup or delivery.", code="rental_mode_invalid")
    is_delivery = mode == RentalBooking.Mode.DELIVERY
    clean_address: dict[str, str] = {}
    if is_delivery:
        clean_address = transport_service.clean_delivery_address(delivery_address or {})
    if quantity < 1:
        raise RentalStateError("Quantity must be at least 1.")
    asset = (
        RentalAsset.objects.select_for_update()
        .select_related("partner", "variant")
        .get(id=_as_uuid(asset_id))
    )
    days = _check_bookable(asset, start_date, end_date, is_delivery=is_delivery)
    _check_stock(asset, start_date, end_date, quantity)

    handover_pin = f"{secrets.randbelow(10000):04d}"

    reservation = AssetReservation.objects.create(
        asset=asset,
        # A delivery request holds the dates tentatively until the price is agreed and paid.
        status=(
            AssetReservation.Status.TENTATIVE if is_delivery else AssetReservation.Status.CONFIRMED
        ),
        start_date=start_date,
        end_date=end_date,
    )
    deposit = RentalDeposit.objects.create(
        amount_paise=asset.deposit_paise * quantity,
        status=(
            RentalDeposit.Status.HELD
            if hold_deposit_for_demo or asset.deposit_paise == 0
            else RentalDeposit.Status.REQUESTED
        ),
        provider_note="" if not hold_deposit_for_demo else "Seed hold without a live capture.",
    )
    price = asset.daily_rate_paise * days * quantity
    fee_percent = current_platform_fee_percent()
    fee_paise = rental_platform_fee_paise(price, fee_percent)
    deposit_charge = asset.deposit_paise * quantity if asset.deposit_paise > 0 else 0
    # Rental fee + platform fee + deposit. The percentage never applies to the deposit.
    amount_due = price + fee_paise + deposit_charge
    needs_payment = amount_due > 0 and not hold_deposit_for_demo and not is_delivery
    if is_delivery:
        initial_status = RentalBooking.Status.AWAITING_TRANSPORT_QUOTE
    elif needs_payment:
        initial_status = RentalBooking.Status.PENDING_PAYMENT
    else:
        initial_status = RentalBooking.Status.CONFIRMED
    booking = RentalBooking.objects.create(
        customer=customer,
        asset=asset,
        reservation=reservation,
        deposit=deposit,
        status=initial_status,
        start_date=start_date,
        end_date=end_date,
        price_paise=price,
        platform_fee_percent=fee_percent,
        platform_fee_paise=fee_paise,
        pickup_or_delivery_mode=mode,
        delivery_address=clean_address,
        notes=notes,
        handover_pin_hash=handover_pin,
    )
    RentalBookingLine.objects.create(
        booking=booking,
        asset=asset,
        quantity=quantity,
        unit_price_paise=asset.daily_rate_paise,
        deposit_paise=asset.deposit_paise * quantity,
    )
    if needs_payment:
        initiate_rental_booking_payment(booking=booking)
    if is_delivery:
        transport_service.open_transport_request(booking=booking, customer_note=delivery_note)
        # The owner hears about a delivery request from the transport service; the customer
        # gets their PIN once the booking is paid.
        return booking

    # Notify the owner of the new booking (best-effort, outside the txn lock).
    _notify_rental(
        recipient_id=asset.partner.user_id,
        purpose="rental.booking.confirmed",
        template_code="rental_new_booking",
        context={
            "customer_name": (
                getattr(customer, "display_name", "") or getattr(customer, "full_name", "Customer")
            ),
            "asset_title": asset.title,
            "start_date": str(start_date),
            "end_date": str(end_date),
        },
        idempotency_key=f"rental-new-booking:{booking.id}",
    )
    # Notify the customer with confirmation and their PIN.
    _notify_rental(
        recipient_id=customer.id,
        purpose="rental.booking.confirmed",
        template_code="rental_booking_confirmed",
        context={
            "asset_title": asset.title,
            "pin": handover_pin,
            "start_date": str(start_date),
            "end_date": str(end_date),
        },
        idempotency_key=f"rental-booking-confirmed:{booking.id}",
    )
    return booking


def mark_deposit_held(*, payment_attempt_id: UUID) -> None:
    """Capture callback. Replay is a no-op once the deposit is already held.

    Lock the deposit row alone, then the booking in a second statement.
    `RentalBooking.deposit` is a reverse OneToOne from this side, so
    `select_related("booking")` under `select_for_update()` becomes a left
    outer join — and PostgreSQL refuses `FOR UPDATE` on that nullable side.
    """
    deposit = RentalDeposit.objects.select_for_update().get(payment_attempt_id=payment_attempt_id)
    if deposit.status == RentalDeposit.Status.HELD:
        return
    deposit.status = RentalDeposit.Status.HELD
    deposit.provider_note = ""
    deposit.save(update_fields=("status", "provider_note", "updated_at"))
    booking = RentalBooking.objects.select_for_update().get(deposit_id=deposit.id)
    if booking.status == RentalBooking.Status.PENDING_PAYMENT:
        booking.status = RentalBooking.Status.CONFIRMED
        booking.save(update_fields=("status", "updated_at"))


def handover_booking(*, booking: RentalBooking, partner: Any, pin: str = "") -> RentalBooking:
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")
    if booking.status != RentalBooking.Status.CONFIRMED:
        raise RentalStateError("Booking must be CONFIRMED to handover.")
    if not verify_handover_pin(booking=booking, pin=pin):
        raise RentalStateError(
            "Incorrect handover PIN.",
            code="handover_pin_invalid",
        )
    booking.status = RentalBooking.Status.HANDOVER
    booking.save(update_fields=("status", "updated_at"))
    if booking.pickup_or_delivery_mode == RentalBooking.Mode.DELIVERY:
        # Delivery ends where the rental starts: at the customer's door, with their PIN.
        RentalTransportRequest.objects.filter(
            booking_id=booking.id,
            status__in=(
                RentalTransportRequest.Status.ACCEPTED,
                RentalTransportRequest.Status.OUT_FOR_DELIVERY,
            ),
        ).update(
            status=RentalTransportRequest.Status.DELIVERED,
            delivered_at=timezone.now(),
            updated_at=timezone.now(),
        )
    return booking


def _refund_deposit_residual(
    *,
    deposit: RentalDeposit,
    residual_paise: int,
    reason_code: str,
) -> None:
    """Gateway-refund the unconsumed deposit share of a captured A7 attempt.

    Mirrors ``cancel_booking`` captured/settling fail-closed behaviour, but
    refunds an explicit residual so the rental-fee portion of a combined
    fee+deposit charge is retained after a completed rental.
    """

    if residual_paise <= 0:
        return
    attempt = deposit.payment_attempt
    if attempt is None:
        return
    if attempt.status in PAYMENT_FINAL_STATES:
        _request_automatic_refund(
            attempt=attempt,
            reason_code=reason_code,
            amount_paise=residual_paise,
        )
        return
    if attempt.status != PaymentAttempt.Status.FAILED:
        raise RentalStateError(
            "Payment is still settling with the provider. Try again shortly, "
            "or contact support if this persists."
        )


def _record_deposit_consume_claim(
    *,
    booking: RentalBooking,
    consume_paise: int,
    reason: str,
    actor: Any,
) -> None:
    """Ledger ADJUSTMENT claiming withheld deposit after Operations approves it."""
    if consume_paise <= 0:
        return

    if actor is None:
        return
    record_adjustment(
        partner_id=booking.asset.partner_id,
        corrects_id=None,
        net_paise=consume_paise,
        reason=f"Rental deposit consumed ({booking.id}): {reason}"[:240],
        actor=actor,
        idempotency_key=f"rental-deposit-consume:{booking.deposit_id}",
    )


@transaction.atomic
def dispute_deposit(
    *,
    booking: RentalBooking,
    partner: Any,
    reason: str,
    consume_paise: int = 0,
    photo_ids: list[UUID | str] | None = None,
) -> RentalBooking:
    """Partner raises a deposit dispute after return.

    This does not move money. The requested ``consume_paise`` and the reason
    wait on the deposit until Operations approves or rejects them. Blank or
    omitted consume means the partner is asking to keep nothing; that is still
    a review, not a silent full consume and not an immediate refund.
    """
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")

    booking = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("deposit", "asset")
        .get(id=booking.id)
    )
    if booking.status != RentalBooking.Status.RETURNED:
        raise RentalStateError("Deposit dispute requires RETURNED status.")
    deposit = RentalDeposit.objects.select_for_update(of=("self",)).get(id=booking.deposit_id)
    if deposit.status not in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        raise RentalStateError("Deposit is not held.")
    note = (reason or "").strip()
    if not note:
        raise RentalStateError("A dispute reason is required.")
    amount = deposit.amount_paise
    consume = int(consume_paise)
    if consume < 0 or consume > amount:
        raise RentalStateError("Consumed amount must be between 0 and the held deposit.")
    _attach_dispute_photos(partner=partner, booking=booking, photo_ids=photo_ids)

    deposit.requested_consume_paise = consume
    deposit.provider_note = note[:240]
    deposit.save(update_fields=("requested_consume_paise", "provider_note", "updated_at"))
    booking.status = RentalBooking.Status.DISPUTED
    booking.save(update_fields=("status", "updated_at"))

    PartnerLedgerEntry.objects.filter(
        rental_booking=booking, kind=PartnerLedgerEntry.Kind.EARNING
    ).update(status=PartnerLedgerEntry.Status.PENDING)
    return booking


def _apply_deposit_decision(
    *,
    booking: RentalBooking,
    deposit: RentalDeposit,
    consume_paise: int,
    reason: str,
    actor: Any,
    reason_code: str,
) -> None:
    amount = deposit.amount_paise
    _refund_deposit_residual(
        deposit=deposit,
        residual_paise=amount - consume_paise,
        reason_code=reason_code,
    )
    _record_deposit_consume_claim(
        booking=booking,
        consume_paise=consume_paise,
        reason=reason,
        actor=actor,
    )
    deposit.consumed_paise = consume_paise
    if consume_paise <= 0:
        deposit.status = RentalDeposit.Status.RELEASED
    elif consume_paise >= amount:
        deposit.status = RentalDeposit.Status.FULLY_CONSUMED
    else:
        deposit.status = RentalDeposit.Status.PARTIALLY_CONSUMED
    deposit.save(update_fields=("consumed_paise", "status", "updated_at"))


@transaction.atomic
def decide_deposit_dispute(
    *,
    booking: RentalBooking,
    actor: Any,
    decision: str,
) -> RentalBooking:
    """Operations approves the partner's claim, or returns the full deposit."""
    booking = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("deposit", "asset", "asset__partner")
        .get(id=booking.id)
    )
    if booking.status != RentalBooking.Status.DISPUTED:
        raise RentalStateError("Only a disputed booking can be decided.")
    deposit = RentalDeposit.objects.select_for_update(of=("self",)).get(id=booking.deposit_id)
    if deposit.status not in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        raise RentalStateError("This dispute has already been decided.")
    if deposit.requested_consume_paise is None:
        raise RentalStateError("This dispute has no amount waiting for review.")
    reason = (deposit.provider_note or "").strip() or "Rental deposit dispute"
    if decision == "APPROVE":
        _apply_deposit_decision(
            booking=booking,
            deposit=deposit,
            consume_paise=int(deposit.requested_consume_paise),
            reason=reason,
            actor=actor,
            reason_code="rental_deposit_dispute_residual",
        )
    elif decision == "REJECT":
        _apply_deposit_decision(
            booking=booking,
            deposit=deposit,
            consume_paise=0,
            reason=reason,
            actor=actor,
            reason_code="rental_deposit_dispute_rejected",
        )
    else:
        raise RentalStateError("Decision must approve or reject the dispute.")

    release_payout_hold(rental_booking_id=booking.id)
    return booking


@transaction.atomic
def return_booking(*, booking: RentalBooking, partner: Any) -> RentalBooking:
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")
    booking = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("reservation")
        .get(id=booking.id)
    )
    if booking.status != RentalBooking.Status.HANDOVER:
        raise RentalStateError("Booking must be HANDOVER to mark returned.")
    booking.status = RentalBooking.Status.RETURNED
    booking.save(update_fields=("status", "updated_at"))

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.RELEASED:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))

    OutboxEvent.objects.create(
        aggregate_type="rental_booking",
        aggregate_id=booking.id,
        event_type="customer.fulfilment.completed",
        idempotency_key=f"rental-completed:{booking.id}",
        payload={
            "event_version": 1,
            "customer_id": str(booking.customer_id),
            "source_type": "RENTAL_COMPLETED",
            "source_id": str(booking.id),
            "completed_at": timezone.now().isoformat(),
        },
    )

    # Record the partner's earning in the payout ledger. The rental fee minus
    # the platform fee is what the owner is owed; the deposit is excluded.

    settle_rental_earning(rental_booking_id=booking.id)

    return booking


@transaction.atomic
def release_deposit(*, booking: RentalBooking, partner: Any) -> RentalDeposit:
    """Release a held deposit after return and refund the deposit residual.

    The combined A7 payment covers rental fee + deposit; only
    ``deposit.amount_paise`` is refunded (reason ``rental_deposit_released``).
    """
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")

    booking = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("deposit")
        .get(id=booking.id)
    )
    if booking.status != RentalBooking.Status.RETURNED:
        raise RentalStateError("Deposit release requires RETURNED status.")
    deposit = RentalDeposit.objects.select_for_update(of=("self",)).get(id=booking.deposit_id)
    if deposit.status not in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        raise RentalStateError("Deposit is not held.")

    _refund_deposit_residual(
        deposit=deposit,
        residual_paise=deposit.amount_paise,
        reason_code="rental_deposit_released",
    )

    deposit.status = RentalDeposit.Status.RELEASED
    deposit.save(update_fields=("status", "updated_at"))
    return deposit


@transaction.atomic
def cancel_booking(
    *,
    booking: RentalBooking,
    customer: Any = None,
    partner: Any = None,
    is_ops: bool = False,
    # Accepted from every caller, not stored: migration 0020 dropped the cancellation columns.
    reason: str = "",  # noqa: ARG001
) -> RentalBooking:
    """Customer, Partner or Ops cancels a rental booking before equipment handover.

    Allowed only on PENDING_PAYMENT or CONFIRMED bookings. The booking is
    refused once it reaches HANDOVER — at that point the equipment has left
    the partner's hands and a cancel would be operationally contradictory.

    When a captured payment exists, a full automatic refund is requested and
    any held deposit is marked RELEASED. Uncaptured pending attempts are left
    alone (nothing settled to reverse).
    """

    if not is_ops:
        if customer is not None:
            if booking.customer_id != getattr(customer, "id", None):
                raise PermissionError("Not your booking.")
        elif partner is not None:
            _require_rental_capability(partner)
            if booking.asset.partner_id != getattr(partner, "id", None):
                raise PermissionError("Not your booking.")
        else:
            raise PermissionError("Must provide customer, partner, or is_ops=True.")
    cancellable = (
        RentalBooking.Status.AWAITING_TRANSPORT_QUOTE,
        RentalBooking.Status.PENDING_PAYMENT,
        RentalBooking.Status.CONFIRMED,
    )
    if booking.status not in cancellable:
        raise RentalStateError(
            "Booking cannot be cancelled after handover. Contact support for return."
        )

    # Lock the booking row alone. `deposit.payment_attempt` is nullable, so
    # `select_related("deposit__payment_attempt")` under `select_for_update()`
    # becomes a left outer join — PostgreSQL refuses FOR UPDATE on that side
    # (same trap as `mark_deposit_held`). Load the attempt in a follow-up.
    booking = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("deposit", "reservation")
        .get(id=booking.id)
    )
    if booking.status not in cancellable:
        raise RentalStateError(
            "Booking cannot be cancelled after handover. Contact support for return."
        )

    deposit = RentalDeposit.objects.select_for_update(of=("self",)).get(id=booking.deposit_id)
    attempt = deposit.payment_attempt
    if attempt is not None and attempt.status in PAYMENT_FINAL_STATES:
        _request_automatic_refund(attempt=attempt, reason_code="customer_cancelled_rental")
    elif (
        attempt is not None
        and attempt.status not in PAYMENT_FINAL_STATES
        and attempt.status != PaymentAttempt.Status.FAILED
        and booking.status == RentalBooking.Status.CONFIRMED
        and deposit.status in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED)
    ):
        # Confirmed with money notionally held but provider not in a refundable
        # terminal state — refuse rather than promise a refund we cannot start.
        raise RentalStateError(
            "Payment is still settling with the provider. Try again shortly, "
            "or contact support if this persists."
        )

    if deposit.status in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        deposit.status = RentalDeposit.Status.RELEASED
        deposit.save(update_fields=("status", "updated_at"))

    booking.status = RentalBooking.Status.CANCELLED
    booking.save(update_fields=("status", "updated_at"))
    _close_transport(booking_id=booking.id)

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.RELEASED:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))

    return booking


def _close_transport(*, booking_id: UUID) -> None:
    """A cancelled booking's open delivery request is cancelled with it. A delivered one stays."""
    RentalTransportRequest.objects.filter(booking_id=booking_id).exclude(
        status__in=(
            RentalTransportRequest.Status.DELIVERED,
            RentalTransportRequest.Status.DECLINED,
            RentalTransportRequest.Status.EXPIRED,
            RentalTransportRequest.Status.CANCELLED,
        )
    ).update(status=RentalTransportRequest.Status.CANCELLED, updated_at=timezone.now())


@transaction.atomic
def repair_ghost_asset_holds(*, asset_id: UUID | str | None = None) -> int:
    """Release AssetReservations still CONFIRMED/TENTATIVE under terminal bookings.

    Historical cancel/return paths could leave a ghost hold that blocked stock.
    Repairs CANCELLED and RETURNED bookings whose reservation was never RELEASED.
    Returns the number of reservation rows repaired.
    """
    qs = AssetReservation.objects.select_for_update().filter(
        status__in=(AssetReservation.Status.TENTATIVE, AssetReservation.Status.CONFIRMED),
        booking__status__in=(
            RentalBooking.Status.CANCELLED,
            RentalBooking.Status.RETURNED,
        ),
    )
    if asset_id is not None:
        qs = qs.filter(asset_id=_as_uuid(asset_id))
    repaired = 0
    for reservation in qs:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))
        repaired += 1
    return repaired


def public_assets(
    *,
    query: str = "",
    location: str = "",
    min_daily_rate_paise: int | None = None,
    max_daily_rate_paise: int | None = None,
    max_deposit_paise: int | None = None,
    variant_code: str = "",
    category_slug: str = "",
    start_date: date | None = None,
    end_date: date | None = None,
) -> models.QuerySet[RentalAsset]:
    qs = (
        RentalAsset.objects.filter(
            moderation_status="APPROVED",
            current_status=RentalAsset.Status.ACTIVE,
        )
        .select_related("partner", "variant")
        .prefetch_related("media")
    )

    if query:
        q = query.strip()
        qs = qs.filter(
            models.Q(title__icontains=q)
            | models.Q(description__icontains=q)
            | models.Q(location_text__icontains=q)
            | models.Q(partner__display_name__icontains=q)
        )
    if location:
        qs = qs.filter(location_text__icontains=location.strip())
    if category_slug:
        qs = qs.filter(variant__service__subcategory__category__slug__iexact=category_slug.strip())
    if variant_code:
        qs = qs.filter(
            models.Q(variant__code__iexact=variant_code)
            | models.Q(variant__service__slug__iexact=variant_code)
            | models.Q(variant__service__subcategory__slug__iexact=variant_code)
        )
    if min_daily_rate_paise is not None:
        qs = qs.filter(daily_rate_paise__gte=min_daily_rate_paise)
    if max_daily_rate_paise is not None:
        qs = qs.filter(daily_rate_paise__lte=max_daily_rate_paise)
    if max_deposit_paise is not None:
        qs = qs.filter(deposit_paise__lte=max_deposit_paise)
    # Fail-closed: never browse zero-stock assets.
    qs = qs.filter(quantity_available__gte=1)
    if start_date is not None and end_date is not None and end_date > start_date:
        # Hide only when overlapping reserved quantity already fills stock.

        reserved = (
            RentalBookingLine.objects.filter(
                asset_id=OuterRef("pk"),
                booking__reservation__status__in=(
                    AssetReservation.Status.TENTATIVE,
                    AssetReservation.Status.CONFIRMED,
                ),
                booking__reservation__start_date__lt=end_date,
                booking__reservation__end_date__gt=start_date,
            )
            .exclude(
                booking__status__in=(
                    RentalBooking.Status.CANCELLED,
                    RentalBooking.Status.RETURNED,
                )
            )
            .values("asset_id")
            .annotate(q=Sum("quantity"))
            .values("q")[:1]
        )
        qs = qs.annotate(
            reserved_qty=Coalesce(
                Subquery(reserved, output_field=IntegerField()),
                Value(0),
            )
        ).filter(reserved_qty__lt=F("quantity_available"))

    return qs


def booking_amount_due(booking: RentalBooking) -> int:
    """The one charge for a booking: rent + platform fee + deposit + agreed transport.

    Stored amounts, not the live rate: a retry must not change what the customer was shown.
    ``transport_paise`` is 0 for self pickup, and for delivery it is the owner's quote the
    customer accepted. Transport carries no platform fee (``transport_fee_paise``, 0 today) on
    top: the fee is the platform's share *of* the transport amount, not added to it.
    """
    deposit_amount = int(booking.deposit.amount_paise) if booking.deposit_id else 0
    return (
        int(booking.price_paise)
        + int(booking.platform_fee_paise)
        + deposit_amount
        + int(booking.transport_paise)
    )


def initiate_rental_booking_payment(*, booking: RentalBooking) -> Any:
    amount_paise = booking_amount_due(booking)
    # A delivery booking is charged once per accepted quote, so the key carries the quote
    # number: a re-quote after an abandoned payment gets a fresh attempt.
    key = f"a7-booking:{booking.id}"
    transport = RentalTransportRequest.objects.filter(booking_id=booking.id).first()
    if transport is not None:
        key = f"{key}:quote-{transport.quote_count}"

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
        amount_paise=amount_paise,
        idempotency_key=key,
        expires_at=timezone.now() + timedelta(seconds=settings.M1_PAYMENT_WINDOW_SECONDS),
    )
    if booking.deposit:
        booking.deposit.payment_attempt = attempt
        booking.deposit.save(update_fields=("payment_attempt", "updated_at"))
    return attempt


@transaction.atomic
def release_booking_for_expired_payment(*, payment_attempt_id: UUID) -> None:
    """Free the asset hold when an unpaid rental payment attempt times out.

    Abandoned Razorpay checkouts used to leave CONFIRMED reservations forever
    (``expires_at`` was never set on standalone A7 attempts), so default
    browse→book dates kept failing with "not available for those dates".
    """
    deposit = (
        RentalDeposit.objects.select_for_update()
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if deposit is None:
        return
    try:
        booking = (
            RentalBooking.objects.select_for_update()
            .select_related("reservation")
            .get(deposit_id=deposit.id)
        )
    except RentalBooking.DoesNotExist:
        return
    if booking.status != RentalBooking.Status.PENDING_PAYMENT:
        return

    # Same for both modes: an abandoned checkout cancels the booking and frees the dates. A
    # delivery customer who walks away from an accepted quote books again.
    booking.status = RentalBooking.Status.CANCELLED
    booking.save(update_fields=("status", "updated_at"))
    _close_transport(booking_id=booking.id)

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.RELEASED:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))


def complete_rental_booking_payment(*, payment_attempt_id: UUID) -> None:
    deposit = RentalDeposit.objects.select_for_update().get(payment_attempt_id=payment_attempt_id)
    if deposit.status == RentalDeposit.Status.HELD:
        return
    deposit.status = RentalDeposit.Status.HELD
    deposit.provider_note = ""
    deposit.save(update_fields=("status", "provider_note", "updated_at"))

    booking = RentalBooking.objects.select_for_update().get(deposit_id=deposit.id)
    if booking.status == RentalBooking.Status.PENDING_PAYMENT:
        booking.status = RentalBooking.Status.CONFIRMED
        booking.save(update_fields=("status", "updated_at"))

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.CONFIRMED:
        reservation.status = AssetReservation.Status.CONFIRMED
        reservation.save(update_fields=("status", "updated_at"))


def cancel_booking_on_refund(*, payment_attempt_id: UUID) -> None:
    """Cancel rental capacity after a full gateway refund — never requests another refund."""
    try:
        booking = (
            RentalBooking.objects.select_for_update(of=("self",))
            .select_related("deposit", "reservation")
            .get(deposit__payment_attempt_id=payment_attempt_id)
        )
    except RentalBooking.DoesNotExist:
        return

    if booking.status in (
        RentalBooking.Status.CANCELLED,
        RentalBooking.Status.RETURNED,
        RentalBooking.Status.DISPUTED,
    ):
        return

    # Fail-closed after handover: equipment has left the partner; Ops must intervene.
    if booking.status not in (
        RentalBooking.Status.PENDING_PAYMENT,
        RentalBooking.Status.CONFIRMED,
    ):
        attempt = PaymentAttempt.objects.filter(id=payment_attempt_id).first()
        _open_exception(
            kind=FinancialException.Kind.REFUND_FAILED,
            code="rental_booking_not_cancellable_after_refund",
            attempt=attempt,
            context={"booking_id": str(booking.id), "status": booking.status},
        )
        return

    booking.status = RentalBooking.Status.CANCELLED
    booking.save(update_fields=("status", "updated_at"))
    _close_transport(booking_id=booking.id)

    deposit = RentalDeposit.objects.select_for_update(of=("self",)).get(id=booking.deposit_id)
    if deposit.status in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        deposit.status = RentalDeposit.Status.RELEASED
        deposit.save(update_fields=("status", "updated_at"))

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.RELEASED:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))
