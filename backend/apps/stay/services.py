"""A9 stay enquiry-first services. Fail-closed on capability + ACTIVE A9VariantConfiguration."""

from __future__ import annotations

from datetime import date
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import jsonschema
from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError

from apps.catalog.models import A9VariantConfiguration, Category, Service, Subcategory
from apps.stay.models import (
    Property,
    PropertyMedia,
    StayEnquiry,
    StayModerationEvent,
    StayPhotoUpload,
    StayReview,
    Unit,
)

_MAX_STAY_REVIEW_RATING = 5


class StayStateError(ValueError):
    pass


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def _require_stay_capability(partner: Any) -> None:
    if not partner.capabilities.filter(archetype="A9_STAY", status="APPROVED").exists():
        raise PermissionError("Partner does not have an approved A9 stay capability.")


_STAY_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_STAY_PHOTO_MAX_BYTES = 8 * 1024 * 1024


def store_stay_photo(*, partner: Any, upload: Any) -> StayPhotoUpload:
    _require_stay_capability(partner)
    content_type = (getattr(upload, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type not in _STAY_PHOTO_TYPES:
        raise StayStateError("Photo must be a JPEG, PNG, or WebP image.")
    size = int(getattr(upload, "size", 0) or 0)
    if size <= 0:
        raise StayStateError("Photo file is empty.")
    if size > _STAY_PHOTO_MAX_BYTES:
        raise StayStateError("Photo must be 8 MB or smaller.")
    return StayPhotoUpload.objects.create(
        partner=partner,
        stored_file=upload,
        original_name=str(getattr(upload, "name", "photo"))[:180],
        content_type=content_type,
        size_bytes=size,
    )


def partner_owns_stay_photo(*, partner: Any, url: str) -> bool:
    path = urlparse(url).path
    media_prefix = settings.MEDIA_URL.rstrip("/") + "/"
    if not path.startswith(media_prefix + "stay-ads/"):
        return False
    stored_name = path[len(media_prefix) :] if path.startswith(media_prefix) else path.lstrip("/")
    return StayPhotoUpload.objects.filter(partner=partner, stored_file=stored_name).exists()


def get_stay_taxonomy() -> list[dict[str, Any]]:
    category = Category.objects.filter(slug="rooms-pg-hostel-hotels").first()
    if not category:
        return []
    result: list[dict[str, Any]] = []
    subcategories = Subcategory.objects.filter(category=category).prefetch_related(
        "services__variants__a9_configurations"
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
            for variant in svc.variants.filter(is_active=True, booking_archetype="A9_STAY"):
                active_cfg = variant.a9_configurations.filter(
                    status=A9VariantConfiguration.Status.ACTIVE
                ).first()
                if active_cfg:
                    svc_data["variants"].append(
                        {
                            "id": variant.id,
                            "name": variant.name,
                            "code": variant.code,
                            "property_schema": active_cfg.property_schema or {},
                        }
                    )
            if svc_data["variants"]:
                sub_data["services"].append(svc_data)
        if sub_data["services"]:
            result.append(sub_data)
    return result


def _require_active_a9(variant_id: UUID | str) -> A9VariantConfiguration:
    config = A9VariantConfiguration.objects.filter(
        variant_id=_as_uuid(variant_id),
        status=A9VariantConfiguration.Status.ACTIVE,
    ).first()
    if config is None:
        raise StayStateError("This stay category is not open yet.")
    return config


@transaction.atomic
def create_property(
    *,
    host: Any,
    variant_id: UUID | str,
    title: str,
    description: str = "",
    location_text: str = "",
    unit_name: str = "Standard room",
    nightly_rate_paise: int = 100000,
    sharing_count: int = 1,
    structured_fields: dict[str, Any] | None = None,
    cancellation_policy_text: str = "",
    house_rules: str = "",
    media: list[dict[str, Any]] | None = None,
    image_urls: list[str] | None = None,
) -> Property:
    _require_stay_capability(host)
    config = _require_active_a9(variant_id)
    if nightly_rate_paise <= 0:
        raise StayStateError("Nightly rate must be positive paise.")
    fields = structured_fields or {}
    if config.property_schema and fields:
        try:
            jsonschema.validate(instance=fields, schema=config.property_schema)
        except JsonSchemaValidationError as e:
            raise StayStateError(f"Invalid structured fields: {e.message}") from e
    prop = Property.objects.create(
        host=host,
        variant_id=_as_uuid(variant_id),
        title=title.strip(),
        description=description,
        location_text=location_text,
        moderation_status=Property.ModerationStatus.DRAFT,
        structured_fields=fields,
        cancellation_policy_text=cancellation_policy_text,
        house_rules=house_rules,
    )
    Unit.objects.create(
        property=prop,
        name=unit_name,
        sharing_count=sharing_count,
        nightly_rate_paise=nightly_rate_paise,
    )
    items: list[dict[str, Any]] = list(media or [])
    if image_urls:
        for idx, url in enumerate(image_urls):
            items.append({"url": url, "display_order": idx})
    for idx, item in enumerate(items):
        url = str(item.get("url") or item.get("image_url") or "").strip()
        if not url:
            continue
        PropertyMedia.objects.create(
            property=prop,
            url=url,
            caption=str(item.get("caption") or ""),
            display_order=int(item.get("display_order") or item.get("sort_order") or idx),
        )
    return prop


@transaction.atomic
def update_property_ad(
    *,
    prop: Property,
    host: Any,
    title: str | None = None,
    description: str | None = None,
    location_text: str | None = None,
    structured_fields: dict[str, Any] | None = None,
    cancellation_policy_text: str | None = None,
    house_rules: str | None = None,
) -> Property:
    """Partner updates the published/draft Ad in place (no live event sync)."""
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    config = _require_active_a9(prop.variant_id)
    updates: list[str] = []
    if title is not None:
        prop.title = title.strip()
        updates.append("title")
    if description is not None:
        prop.description = description
        updates.append("description")
    if location_text is not None:
        prop.location_text = location_text
        updates.append("location_text")
    if structured_fields is not None:
        if config.property_schema:
            try:
                jsonschema.validate(instance=structured_fields, schema=config.property_schema)
            except JsonSchemaValidationError as e:
                raise StayStateError(f"Invalid structured fields: {e.message}") from e
        prop.structured_fields = structured_fields
        updates.append("structured_fields")
    if cancellation_policy_text is not None:
        prop.cancellation_policy_text = cancellation_policy_text
        updates.append("cancellation_policy_text")
    if house_rules is not None:
        prop.house_rules = house_rules
        updates.append("house_rules")
    if updates:
        updates.append("updated_at")
        prop.save(update_fields=updates)
    return prop


@transaction.atomic
def confirm_enquiry(*, enquiry: StayEnquiry, host: Any) -> StayEnquiry:
    _require_stay_capability(host)
    if enquiry.property.host_id != host.id:
        raise PermissionError("Not your enquiry.")
    if enquiry.status not in (
        StayEnquiry.Status.SUBMITTED,
        StayEnquiry.Status.RESPONDED,
    ):
        raise StayStateError("Enquiry cannot be confirmed from this state.")
    enquiry.status = StayEnquiry.Status.CONFIRMED
    enquiry.save(update_fields=("status", "updated_at"))
    return enquiry


@transaction.atomic
def cancel_enquiry(*, enquiry: StayEnquiry, actor: Any, as_host: bool = False) -> StayEnquiry:
    if as_host:
        _require_stay_capability(actor)
        if enquiry.property.host_id != actor.id:
            raise PermissionError("Not your enquiry.")
    elif enquiry.customer_id != getattr(actor, "id", None):
        raise PermissionError("Not your enquiry.")
    if enquiry.status in (StayEnquiry.Status.CANCELLED, StayEnquiry.Status.EXPIRED):
        raise StayStateError("Enquiry is already closed.")
    enquiry.status = StayEnquiry.Status.CANCELLED
    enquiry.save(update_fields=("status", "updated_at"))
    return enquiry


@transaction.atomic
def create_stay_review(
    *,
    customer: Any,
    property_id: UUID | str,
    rating: int,
    body: str = "",
    image_urls: list[str] | None = None,
    enquiry_id: UUID | str | None = None,
) -> Any:
    if rating < 1 or rating > _MAX_STAY_REVIEW_RATING:
        raise StayStateError("Rating must be between 1 and 5.")
    prop = Property.objects.get(id=_as_uuid(property_id))
    enquiry = None
    if enquiry_id:
        enquiry = StayEnquiry.objects.get(id=_as_uuid(enquiry_id), customer=customer)
        if enquiry.property_id != prop.id:
            raise StayStateError("Enquiry does not match property.")
        if enquiry.status != StayEnquiry.Status.CONFIRMED:
            raise StayStateError("Reviews require a confirmed stay.")
    else:
        # Allow review when customer has at least one confirmed enquiry on property.
        enquiry = (
            StayEnquiry.objects.filter(
                customer=customer,
                property=prop,
                status=StayEnquiry.Status.CONFIRMED,
            )
            .order_by("-created_at")
            .first()
        )
        if enquiry is None:
            raise StayStateError("Reviews require a confirmed stay.")
    return StayReview.objects.create(
        property=prop,
        enquiry=enquiry,
        customer=customer,
        rating=rating,
        body=body,
        comment=body,
        image_urls=list(image_urls or []),
    )


def submit_property(*, prop: Property, host: Any) -> Property:
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    _require_active_a9(prop.variant_id)
    if prop.moderation_status not in (
        Property.ModerationStatus.DRAFT,
        Property.ModerationStatus.REJECTED,
    ):
        raise StayStateError("Property cannot be submitted from this state.")
    prop.moderation_status = Property.ModerationStatus.PENDING
    prop.save(update_fields=("moderation_status", "updated_at"))
    StayModerationEvent.objects.create(
        property=prop,
        actor=host.user,
        action=StayModerationEvent.Action.SUBMITTED,
        reason="",
    )
    return prop


def moderate_property(*, prop: Property, actor: Any, action: str, reason: str) -> Property:
    reason = (reason or "").strip()
    if not reason:
        raise StayStateError("A moderation reason is required.")
    action = action.upper()
    if action == "APPROVE":
        prop.moderation_status = Property.ModerationStatus.APPROVED
        event = StayModerationEvent.Action.APPROVED
    elif action == "REJECT":
        prop.moderation_status = Property.ModerationStatus.REJECTED
        event = StayModerationEvent.Action.REJECTED
    elif action == "REMOVE":
        prop.moderation_status = Property.ModerationStatus.REMOVED
        event = StayModerationEvent.Action.REMOVED
    elif action == "REINSTATE":
        prop.moderation_status = Property.ModerationStatus.APPROVED
        event = StayModerationEvent.Action.REINSTATED
    else:
        raise StayStateError("Unknown moderation action.")
    prop.moderation_reason = reason
    prop.save(update_fields=("moderation_status", "moderation_reason", "updated_at"))
    StayModerationEvent.objects.create(property=prop, actor=actor, action=event, reason=reason)
    return prop


def create_enquiry(
    *,
    customer: Any,
    property_id: UUID | str,
    check_in: date,
    check_out: date,
    guest_count: int = 1,
    message: str = "",
    unit_id: UUID | str | None = None,
) -> StayEnquiry:
    prop = Property.objects.select_related("variant").get(id=_as_uuid(property_id))
    _require_active_a9(prop.variant_id)
    if prop.public_state != "PUBLISHED":
        raise StayStateError("Property is not open for enquiries.")
    if check_out <= check_in:
        raise StayStateError("Check-out must be after check-in.")
    unit = None
    if unit_id is not None:
        unit = Unit.objects.get(id=_as_uuid(unit_id), property=prop, is_active=True)
    elif prop.units.filter(is_active=True).exists():
        unit = prop.units.filter(is_active=True).first()

    nights = max(1, (check_out - check_in).days)
    nightly_rate_paise = unit.nightly_rate_paise if unit else 0
    total_quote_paise = nights * nightly_rate_paise

    return StayEnquiry.objects.create(
        property=prop,
        unit=unit,
        customer=customer,
        check_in=check_in,
        check_out=check_out,
        guest_count=guest_count,
        nights=nights,
        total_quote_paise=total_quote_paise,
        message=message,
        status=StayEnquiry.Status.SUBMITTED,
    )


def calculate_stay_quote(
    *,
    property_id: UUID | str,
    check_in: date,
    check_out: date,
    unit_id: UUID | str | None = None,
) -> dict[str, Any]:
    prop = Property.objects.select_related("variant").get(id=_as_uuid(property_id))
    _require_active_a9(prop.variant_id)
    if prop.public_state != "PUBLISHED":
        raise StayStateError("Property is not open.")
    if check_out <= check_in:
        raise StayStateError("Check-out must be after check-in.")
    unit = None
    if unit_id is not None:
        unit = Unit.objects.get(id=_as_uuid(unit_id), property=prop, is_active=True)
    elif prop.units.filter(is_active=True).exists():
        unit = prop.units.filter(is_active=True).first()

    nights = max(1, (check_out - check_in).days)
    nightly_rate_paise = unit.nightly_rate_paise if unit else 0
    total_quote_paise = nights * nightly_rate_paise

    return {
        "property_id": prop.id,
        "unit_id": unit.id if unit else None,
        "unit_name": unit.name if unit else "Standard room",
        "nights": nights,
        "nightly_rate_paise": nightly_rate_paise,
        "total_quote_paise": total_quote_paise,
    }


def respond_enquiry(
    *, enquiry: StayEnquiry, host: Any, response: str, decline: bool = False
) -> StayEnquiry:
    _require_stay_capability(host)
    if enquiry.property.host_id != host.id:
        raise PermissionError("Not your enquiry.")
    if enquiry.status != StayEnquiry.Status.SUBMITTED:
        raise StayStateError("Enquiry is not awaiting a response.")
    response = (response or "").strip()
    if not response:
        raise StayStateError("A response message is required.")
    enquiry.host_response = response
    enquiry.responded_at = timezone.now()
    enquiry.status = StayEnquiry.Status.DECLINED if decline else StayEnquiry.Status.RESPONDED
    enquiry.save(update_fields=("host_response", "responded_at", "status", "updated_at"))
    return enquiry


def public_properties(
    *,
    query: str = "",
    location: str = "",
    sharing_count: int | None = None,
    has_ac: bool | None = None,
    food_included: bool | None = None,
    min_price_paise: int | None = None,
    max_price_paise: int | None = None,
    variant_code: str = "",
    limit: int | None = None,
    offset: int = 0,
):
    qs = (
        Property.objects.filter(moderation_status=Property.ModerationStatus.APPROVED)
        .prefetch_related("units")
        .select_related("host", "variant")
    )

    if query:
        q = query.strip()
        qs = qs.filter(
            models.Q(title__icontains=q)
            | models.Q(description__icontains=q)
            | models.Q(location_text__icontains=q)
            | models.Q(host__display_name__icontains=q)
        )
    if location:
        qs = qs.filter(location_text__icontains=location.strip())
    if variant_code:
        qs = qs.filter(
            models.Q(variant__code__icontains=variant_code)
            | models.Q(variant__service__slug__icontains=variant_code)
        )
    if sharing_count is not None:
        qs = qs.filter(units__sharing_count=sharing_count, units__is_active=True)
    if min_price_paise is not None:
        qs = qs.filter(units__nightly_rate_paise__gte=min_price_paise, units__is_active=True)
    if max_price_paise is not None:
        qs = qs.filter(units__nightly_rate_paise__lte=max_price_paise, units__is_active=True)
    if has_ac is True:
        qs = qs.filter(
            models.Q(structured_fields__ac=True)
            | models.Q(units__attributes__ac=True)
            | models.Q(title__icontains="ac")
            | models.Q(description__icontains="ac")
        )
    if food_included is True:
        qs = qs.filter(
            models.Q(structured_fields__food=True)
            | models.Q(units__attributes__food=True)
            | models.Q(title__icontains="food")
            | models.Q(title__icontains="meal")
            | models.Q(description__icontains="food")
            | models.Q(description__icontains="meal")
        )

    qs = qs.distinct().order_by("-created_at")
    if offset:
        qs = qs[offset:]
    if limit is not None:
        qs = qs[:limit]
    return qs
