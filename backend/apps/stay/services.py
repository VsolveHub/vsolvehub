import logging
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import jsonschema
from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError

from apps.catalog.models import A9VariantConfiguration, Category, Service, Subcategory
from apps.commerce.models import FinancialException, PaymentAttempt
from apps.commerce.services import _request_automatic_refund
from apps.commerce.services.base import PAYMENT_FINAL_STATES, _open_exception
from apps.commerce.services.payments import initiate_standalone_payment_attempt
from apps.foundation.models import OutboxEvent
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.partners.models import PartnerProfile
from apps.stay.models import (
    Property,
    PropertyMedia,
    StayEnquiry,
    StayModerationEvent,
    StayPhotoUpload,
    StayReservation,
    StayReview,
    Unit,
    UnitReservation,
)

logger = logging.getLogger(__name__)

_MAX_STAY_REVIEW_RATING = 5


class StayStateError(ValueError):
    """Domain refusal. ``code`` is a stable machine token for the API envelope."""

    def __init__(self, message: str, *, code: str = "stay_state_invalid") -> None:
        super().__init__(message)
        self.code = code


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def _validate_availability_bounds(
    *,
    available_from: date | None,
    available_until: date | None,
) -> None:
    if (
        available_from is not None
        and available_until is not None
        and available_until < available_from
    ):
        raise StayStateError(
            "available_until must be on or after available_from.",
            code="stay_state_invalid",
        )


def _verify_unit_availability(
    *,
    unit: Any,
    check_in: date,
    check_out: date,
    exclude_enquiry_id: Any = None,
    exclude_reservation_id: Any = None,
    for_update: bool = False,
) -> None:
    res_qs = UnitReservation.objects.filter(
        unit=unit,
        check_in__lt=check_out,
        check_out__gt=check_in,
        status__in=[UnitReservation.Status.HELD, UnitReservation.Status.CONFIRMED],
    )
    if exclude_reservation_id:
        res_qs = res_qs.exclude(id=exclude_reservation_id)

    enq_qs = StayEnquiry.objects.filter(
        unit=unit,
        status=StayEnquiry.Status.CONFIRMED,
        check_in__lt=check_out,
        check_out__gt=check_in,
    )
    if exclude_enquiry_id:
        enq_qs = enq_qs.exclude(id=exclude_enquiry_id)

    if for_update:
        res_qs = res_qs.select_for_update()
        enq_qs = enq_qs.select_for_update()

    if res_qs.exists() or enq_qs.exists():
        raise StayStateError(
            "These dates are already booked or held.",
            code="dates_unavailable",
        )


MAX_STAY_NIGHTS = 90


def _enforce_stay_dates(*, prop: Property, check_in: date, check_out: date) -> int:
    """Validate date order, min nights, and availability window. Returns nights count."""
    today = timezone.localdate()
    if check_in < today:
        raise StayStateError("Check-in date cannot be in the past.", code="check_in_in_past")
    if check_out <= check_in:
        raise StayStateError("Check-out must be after check-in.")
    nights = (check_out - check_in).days
    min_nights = int(prop.min_stay_nights or 1)
    if nights < min_nights:
        raise StayStateError(
            f"Minimum stay is {min_nights} night{'s' if min_nights != 1 else ''}.",
            code="min_stay_not_met",
        )
    if nights > MAX_STAY_NIGHTS:
        raise StayStateError(
            f"Maximum stay is {MAX_STAY_NIGHTS} nights.",
            code="max_stay_exceeded",
        )
    if prop.available_from is not None and check_in < prop.available_from:
        raise StayStateError(
            "Not available for these dates.",
            code="dates_unavailable",
        )
    if prop.available_until is not None and check_out > prop.available_until:
        raise StayStateError(
            "Not available for these dates.",
            code="dates_unavailable",
        )
    return nights


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
                            "booking_mode": active_cfg.booking_mode,
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
    unit_name: str | None = None,
    nightly_rate_paise: int | None = None,
    sharing_count: int = 1,
    structured_fields: dict[str, Any] | None = None,
    cancellation_policy_text: str = "",
    house_rules: str = "",
    min_stay_nights: int = 1,
    available_from: date | None = None,
    available_until: date | None = None,
    media: list[dict[str, Any]] | None = None,
    image_urls: list[str] | None = None,
) -> Property:
    """Create a property. Units are optional — pass ``nightly_rate_paise`` to seed one."""
    _require_stay_capability(host)
    config = _require_active_a9(variant_id)
    if min_stay_nights < 1:
        raise StayStateError("Minimum stay must be at least 1 night.")
    _validate_availability_bounds(
        available_from=available_from,
        available_until=available_until,
    )
    if nightly_rate_paise is not None and nightly_rate_paise <= 0:
        raise StayStateError("Nightly rate must be positive paise.")
    resolved_location = (location_text or "").strip()
    if not resolved_location:
        resolved_location = (getattr(host, "default_location_text", "") or "").strip()
    if not resolved_location:
        raise StayStateError(
            "Property location is required.",
            code="location_required",
        )
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
        location_text=resolved_location,
        moderation_status=Property.ModerationStatus.DRAFT,
        structured_fields=fields,
        cancellation_policy_text=cancellation_policy_text,
        house_rules=house_rules,
        min_stay_nights=min_stay_nights,
        available_from=available_from,
        available_until=available_until,
    )
    if nightly_rate_paise is not None:
        Unit.objects.create(
            property=prop,
            name=(unit_name or "Standard room").strip() or "Standard room",
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
def create_unit(
    *,
    prop: Property,
    host: Any,
    name: str,
    nightly_rate_paise: int,
    sharing_count: int = 1,
    attributes: dict[str, Any] | None = None,
    is_active: bool = True,
) -> Unit:
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    _require_active_a9(prop.variant_id)
    if nightly_rate_paise <= 0:
        raise StayStateError("Nightly rate must be positive paise.")
    name = (name or "").strip()
    if not name:
        raise StayStateError("Unit name is required.")
    return Unit.objects.create(
        property=prop,
        name=name,
        sharing_count=sharing_count,
        nightly_rate_paise=nightly_rate_paise,
        attributes=attributes or {},
        is_active=is_active,
    )


@transaction.atomic
def update_unit(
    *,
    unit: Unit,
    host: Any,
    name: str | None = None,
    nightly_rate_paise: int | None = None,
    sharing_count: int | None = None,
    attributes: dict[str, Any] | None = None,
    is_active: bool | None = None,
) -> Unit:
    _require_stay_capability(host)
    if unit.property.host_id != host.id:
        raise PermissionError("Not your property.")
    updates: list[str] = []
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise StayStateError("Unit name is required.")
        unit.name = cleaned
        updates.append("name")
    if nightly_rate_paise is not None:
        if nightly_rate_paise <= 0:
            raise StayStateError("Nightly rate must be positive paise.")
        unit.nightly_rate_paise = nightly_rate_paise
        updates.append("nightly_rate_paise")
    if sharing_count is not None:
        if sharing_count < 1:
            raise StayStateError("Sharing count must be at least 1.")
        unit.sharing_count = sharing_count
        updates.append("sharing_count")
    if attributes is not None:
        unit.attributes = attributes
        updates.append("attributes")
    if is_active is not None:
        if (
            not is_active
            and unit.is_active
            and unit.property.moderation_status == Property.ModerationStatus.APPROVED
            and not unit.property.units.filter(is_active=True).exclude(id=unit.id).exists()
        ):
            raise StayStateError(
                "A live property needs at least one active room. Add another room first.",
                code="last_active_room",
            )
        unit.is_active = is_active
        updates.append("is_active")
    if updates:
        updates.append("updated_at")
        unit.save(update_fields=updates)
    return unit


@transaction.atomic
def update_property_ad(  # noqa: PLR0912
    *,
    prop: Property,
    host: Any,
    title: str | None = None,
    description: str | None = None,
    location_text: str | None = None,
    structured_fields: dict[str, Any] | None = None,
    cancellation_policy_text: str | None = None,
    house_rules: str | None = None,
    min_stay_nights: int | None = None,
    available_from: date | None = None,
    available_until: date | None = None,
    clear_available_from: bool = False,
    clear_available_until: bool = False,
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
    if min_stay_nights is not None:
        if min_stay_nights < 1:
            raise StayStateError("Minimum stay must be at least 1 night.")
        prop.min_stay_nights = min_stay_nights
        updates.append("min_stay_nights")
    next_from = (
        None
        if clear_available_from
        else (available_from if available_from is not None else prop.available_from)
    )
    next_until = (
        None
        if clear_available_until
        else (available_until if available_until is not None else prop.available_until)
    )
    if (
        clear_available_from
        or clear_available_until
        or available_from is not None
        or available_until is not None
    ):
        _validate_availability_bounds(available_from=next_from, available_until=next_until)
        if clear_available_from or available_from is not None:
            prop.available_from = next_from
            updates.append("available_from")
        if clear_available_until or available_until is not None:
            prop.available_until = next_until
            updates.append("available_until")
    if updates:
        updates.append("updated_at")
        prop.save(update_fields=updates)
    return prop


@transaction.atomic
def confirm_enquiry(*, enquiry: StayEnquiry, host: Any) -> StayEnquiry:  # noqa: PLR0912
    """Host confirms an enquiry and holds the unit calendar for those nights."""
    _require_stay_capability(host)
    if enquiry.property.host_id != host.id:
        raise PermissionError("Not your enquiry.")
    if enquiry.status not in (
        StayEnquiry.Status.SUBMITTED,
        StayEnquiry.Status.RESPONDED,
    ):
        raise StayStateError("Enquiry cannot be confirmed from this state.")
    # Lock enquiry alone. ``unit`` / ``unit_reservation`` are nullable, so
    # ``select_related`` under ``select_for_update()`` becomes a left outer join
    # — PostgreSQL refuses FOR UPDATE on that side.
    enquiry = (
        StayEnquiry.objects.select_for_update(of=("self",))
        .select_related("property")
        .get(id=enquiry.id)
    )
    if enquiry.status not in (
        StayEnquiry.Status.SUBMITTED,
        StayEnquiry.Status.RESPONDED,
    ):
        raise StayStateError("Enquiry cannot be confirmed from this state.")

    unit = None
    if enquiry.unit_id is not None:
        unit = Unit.objects.select_for_update().get(id=enquiry.unit_id)
    else:
        unit = (
            Unit.objects.select_for_update()
            .filter(property_id=enquiry.property_id, is_active=True)
            .order_by("created_at")
            .first()
        )
        if unit is None:
            raise StayStateError("Property has no active unit to hold.")
        enquiry.unit = unit

    config = _require_active_a9(enquiry.property.variant_id)
    needs_hold = config.booking_mode == A9VariantConfiguration.BookingMode.RESERVATION

    _verify_unit_availability(
        unit=unit,
        check_in=enquiry.check_in,
        check_out=enquiry.check_out,
        exclude_enquiry_id=enquiry.id,
        exclude_reservation_id=enquiry.unit_reservation_id,
        for_update=True,
    )

    if needs_hold:
        if enquiry.unit_reservation_id is None:
            unit_res = UnitReservation.objects.create(
                unit=unit,
                check_in=enquiry.check_in,
                check_out=enquiry.check_out,
                status=UnitReservation.Status.CONFIRMED,
            )
            enquiry.unit_reservation = unit_res
        else:
            unit_res = UnitReservation.objects.select_for_update().get(
                id=enquiry.unit_reservation_id
            )
            if unit_res.status in (
                UnitReservation.Status.RELEASED,
                UnitReservation.Status.HELD,
            ):
                unit_res.status = UnitReservation.Status.CONFIRMED
                unit_res.check_in = enquiry.check_in
                unit_res.check_out = enquiry.check_out
                unit_res.unit = unit
                unit_res.save(
                    update_fields=("status", "check_in", "check_out", "unit", "updated_at")
                )
    # ENQUIRY mode does not need a hold. Document clearly and prevent conflicting double-book
    # by verifying availability (done above via _verify_unit_availability).
    elif enquiry.unit_reservation_id is not None:
        unit_res = UnitReservation.objects.select_for_update().get(id=enquiry.unit_reservation_id)
        if unit_res.status != UnitReservation.Status.RELEASED:
            unit_res.status = UnitReservation.Status.RELEASED
            unit_res.save(update_fields=("status", "updated_at"))
        enquiry.unit_reservation = None

    enquiry.status = StayEnquiry.Status.CONFIRMED
    enquiry.save(update_fields=("status", "unit", "unit_reservation", "updated_at"))

    try:
        request_notification(
            recipient_id=enquiry.customer_id,
            purpose="stay.enquiry.confirmed",
            channel=NotificationIntent.Channel.IN_APP,
            template_code="stay_enquiry_confirmed",
            context={
                "property_title": enquiry.property.title,
                "host_name": str(getattr(enquiry.property.host, "display_name", "Host")),
            },
            idempotency_key=f"stay-enq-conf:{enquiry.id}",
        )
    except Exception:
        logger.exception("Failed to dispatch stay enquiry confirmed notification")

    return enquiry


@transaction.atomic
def cancel_enquiry(*, enquiry: StayEnquiry, actor: Any, as_host: bool = False) -> StayEnquiry:
    if as_host:
        _require_stay_capability(actor)
        if enquiry.property.host_id != actor.id:
            raise PermissionError("Not your enquiry.")
    elif enquiry.customer_id != getattr(actor, "id", None):
        raise PermissionError("Not your enquiry.")
    enquiry = StayEnquiry.objects.select_for_update(of=("self",)).get(id=enquiry.id)
    if enquiry.status in (StayEnquiry.Status.CANCELLED, StayEnquiry.Status.EXPIRED):
        raise StayStateError("Enquiry is already closed.")
    enquiry.status = StayEnquiry.Status.CANCELLED
    enquiry.save(update_fields=("status", "updated_at"))
    if enquiry.unit_reservation_id is not None:
        unit_res = UnitReservation.objects.select_for_update().get(id=enquiry.unit_reservation_id)
        if unit_res.status != UnitReservation.Status.RELEASED:
            unit_res.status = UnitReservation.Status.RELEASED
            unit_res.save(update_fields=("status", "updated_at"))
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
    reservation_id: UUID | str | None = None,
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
    elif reservation_id:
        reservation = StayReservation.objects.get(id=_as_uuid(reservation_id), customer=customer)
        if reservation.property_id != prop.id:
            raise StayStateError("Reservation does not match property.")
        if reservation.status not in (
            StayReservation.Status.CHECKED_OUT,
            StayReservation.Status.CONFIRMED,
        ):
            raise StayStateError("Reviews require a completed stay.")
    else:
        # Check if customer has either a confirmed enquiry or a completed/confirmed reservation
        enquiry = (
            StayEnquiry.objects.filter(
                customer=customer,
                property=prop,
                status=StayEnquiry.Status.CONFIRMED,
            )
            .order_by("-created_at")
            .first()
        )
        has_reservation = StayReservation.objects.filter(
            customer=customer,
            property=prop,
            status__in=[
                StayReservation.Status.CHECKED_OUT,
                StayReservation.Status.CONFIRMED,
            ],
        ).exists()
        if enquiry is None and not has_reservation:
            raise StayStateError(
                "Reviews require a confirmed or completed stay.",
                code="stay_not_completed",
            )

    # Prevent duplicate reviews from the same customer on this property
    existing_review = StayReview.objects.filter(customer=customer, property=prop)
    if enquiry:
        existing_review = existing_review.filter(enquiry=enquiry)
    if existing_review.exists():
        raise StayStateError(
            "You have already submitted a review for this stay.",
            code="duplicate_review",
        )

    return StayReview.objects.create(
        property=prop,
        enquiry=enquiry,
        customer=customer,
        rating=rating,
        body=body,
        comment=body,
        image_urls=list(image_urls or []),
    )


def _property_booking_mode(prop: Property) -> str | None:
    """The ACTIVE booking mode for a property's variant, or None when the variant is closed."""
    config = A9VariantConfiguration.objects.filter(
        variant_id=prop.variant_id,
        status=A9VariantConfiguration.Status.ACTIVE,
    ).first()
    return None if config is None else str(config.booking_mode)


def _assert_publishable(prop: Property) -> None:
    """Automatic checks every property passes before it can go live, reviewed or not."""
    if not prop.title.strip():
        raise StayStateError("Add a property title before publishing.", code="title_required")
    if not prop.location_text.strip():
        raise StayStateError(
            "Add the property location before publishing.", code="location_required"
        )
    if not prop.media.exists():
        raise StayStateError("Add at least one photo before publishing.", code="photo_required")
    if not prop.units.filter(is_active=True).exists():
        raise StayStateError("Add at least one room before publishing.", code="room_required")


@transaction.atomic
def submit_property(*, prop: Property, host: Any) -> Property:
    """Partner publishes a property.

    The partner was verified when their application was approved, so most properties go live at
    once. The exception is a host's first paid-booking (RESERVATION-mode) property: guests pay the
    platform upfront there, so Operations reviews it once. Approving it trusts the host
    (``PartnerProfile.paid_stays_trusted_at``) and their later paid properties publish directly.
    """
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    config = _require_active_a9(prop.variant_id)
    prop = Property.objects.select_for_update().get(id=prop.id)
    if prop.moderation_status not in (
        Property.ModerationStatus.DRAFT,
        Property.ModerationStatus.REJECTED,
    ):
        raise StayStateError("Property cannot be published from this state.")
    _assert_publishable(prop)

    trusted_at = (
        PartnerProfile.objects.filter(id=host.id)
        .values_list("paid_stays_trusted_at", flat=True)
        .first()
    )
    needs_review = (
        config.booking_mode == A9VariantConfiguration.BookingMode.RESERVATION and trusted_at is None
    )
    if needs_review:
        prop.moderation_status = Property.ModerationStatus.PENDING
        event = StayModerationEvent.Action.SUBMITTED
    else:
        prop.moderation_status = Property.ModerationStatus.APPROVED
        event = StayModerationEvent.Action.PUBLISHED
    # A fresh publish clears the previous rejection note; the event log keeps the history.
    prop.moderation_reason = ""
    prop.save(update_fields=("moderation_status", "moderation_reason", "updated_at"))
    StayModerationEvent.objects.create(property=prop, actor=host.user, action=event, reason="")
    return prop


@transaction.atomic
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

    if (
        action == "APPROVE"
        and _property_booking_mode(prop) == A9VariantConfiguration.BookingMode.RESERVATION
    ):
        # First paid property passed review: later paid properties from this host skip review.
        PartnerProfile.objects.filter(id=prop.host_id, paid_stays_trusted_at__isnull=True).update(
            paid_stays_trusted_at=timezone.now()
        )
    elif action == "REMOVE":
        # A takedown withdraws trust; the host's next paid property is reviewed again.
        PartnerProfile.objects.filter(id=prop.host_id).update(paid_stays_trusted_at=None)
    return prop


def get_booking_mode(variant_id: UUID | str) -> str:
    config = _require_active_a9(variant_id)
    return config.booking_mode


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
    config = _require_active_a9(prop.variant_id)
    if config.booking_mode != A9VariantConfiguration.BookingMode.ENQUIRY:
        raise StayStateError("This property requires a reservation, not an enquiry.")
    if prop.public_state != "PUBLISHED":
        raise StayStateError("Property is not open for enquiries.")
    nights = _enforce_stay_dates(prop=prop, check_in=check_in, check_out=check_out)

    duplicate_enquiry = StayEnquiry.objects.filter(
        customer=customer,
        property=prop,
        status__in=[StayEnquiry.Status.SUBMITTED, StayEnquiry.Status.RESPONDED],
        check_in__lt=check_out,
        check_out__gt=check_in,
    ).first()
    if duplicate_enquiry is not None:
        raise StayStateError(
            "An active enquiry already exists for this property and dates.",
            code="duplicate_enquiry",
        )

    unit = None
    if unit_id is not None:
        unit = Unit.objects.get(id=_as_uuid(unit_id), property=prop, is_active=True)
    elif prop.units.filter(is_active=True).exists():
        unit = prop.units.filter(is_active=True).first()

    if unit:
        _verify_unit_availability(unit=unit, check_in=check_in, check_out=check_out)

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
    config = _require_active_a9(prop.variant_id)
    if prop.public_state != "PUBLISHED":
        raise StayStateError("Property is not open.")
    nights = _enforce_stay_dates(prop=prop, check_in=check_in, check_out=check_out)
    unit = None
    if unit_id is not None:
        unit = Unit.objects.get(id=_as_uuid(unit_id), property=prop, is_active=True)
    elif prop.units.filter(is_active=True).exists():
        unit = prop.units.filter(is_active=True).first()

    if unit:
        _verify_unit_availability(unit=unit, check_in=check_in, check_out=check_out)

    nightly_rate_paise = unit.nightly_rate_paise if unit else 0
    total_quote_paise = nights * nightly_rate_paise

    return {
        "property_id": prop.id,
        "unit_id": unit.id if unit else None,
        "unit_name": unit.name if unit else "Standard room",
        "nights": nights,
        "nightly_rate_paise": nightly_rate_paise,
        "total_quote_paise": total_quote_paise,
        "booking_mode": config.booking_mode,
        "min_stay_nights": prop.min_stay_nights,
        "available_from": prop.available_from,
        "available_until": prop.available_until,
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

    if not decline and enquiry.customer_id:
        try:
            resp_time = enquiry.responded_at.isoformat() if enquiry.responded_at else "1"
            request_notification(
                recipient_id=enquiry.customer_id,
                purpose="stay.enquiry.responded",
                channel=NotificationIntent.Channel.IN_APP,
                template_code="stay_enquiry_responded",
                context={
                    "property_title": enquiry.property.title,
                    "host_name": str(getattr(enquiry.property.host, "display_name", "Host")),
                    "response_text": (enquiry.host_response or "")[:120],
                },
                idempotency_key=f"stay-enq-resp:{enquiry.id}:{resp_time}",
            )
        except Exception:
            logger.exception("Failed to dispatch stay enquiry responded notification")

    return enquiry


def public_properties(  # noqa: PLR0912
    *,
    query: str = "",
    location: str = "",
    sharing_count: int | None = None,
    has_ac: bool | None = None,
    food_included: bool | None = None,
    min_price_paise: int | None = None,
    max_price_paise: int | None = None,
    variant_code: str = "",
    check_in: date | None = None,
    check_out: date | None = None,
    sort: str = "newest",
    limit: int | None = None,
    offset: int = 0,
) -> models.QuerySet[Property]:
    qs = (
        Property.objects.filter(moderation_status=Property.ModerationStatus.APPROVED)
        .prefetch_related("units", "media", "reviews", "variant__a9_configurations")
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
            | models.Q(variant__service__subcategory__slug__icontains=variant_code)
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
    if check_in is not None:
        qs = qs.filter(
            models.Q(available_from__isnull=True) | models.Q(available_from__lte=check_in)
        )
    if check_out is not None:
        qs = qs.filter(
            models.Q(available_until__isnull=True) | models.Q(available_until__gte=check_out)
        )
    if check_in is not None and check_out is not None and check_out > check_in:
        booked_unit_ids = UnitReservation.objects.filter(
            status__in=[UnitReservation.Status.HELD, UnitReservation.Status.CONFIRMED],
            check_in__lt=check_out,
            check_out__gt=check_in,
        ).values_list("unit_id", flat=True)
        available_property_ids = (
            Unit.objects.filter(is_active=True)
            .exclude(id__in=booked_unit_ids)
            .values_list("property_id", flat=True)
        )
        qs = qs.filter(id__in=available_property_ids)

    if sort == "price_asc":
        qs = qs.annotate(
            sort_price=models.Min(
                "units__nightly_rate_paise", filter=models.Q(units__is_active=True)
            )
        ).order_by(models.F("sort_price").asc(nulls_last=True), "-created_at")
    elif sort == "price_desc":
        qs = qs.annotate(
            sort_price=models.Min(
                "units__nightly_rate_paise", filter=models.Q(units__is_active=True)
            )
        ).order_by(models.F("sort_price").desc(nulls_last=True), "-created_at")
    elif sort == "rating_desc":
        qs = qs.annotate(sort_rating=models.Avg("reviews__rating")).order_by(
            models.F("sort_rating").desc(nulls_last=True), "-created_at"
        )
    else:
        qs = qs.distinct().order_by("-created_at")

    if offset:
        qs = qs[offset:]
    if limit is not None:
        qs = qs[:limit]
    return qs


@transaction.atomic
def create_reservation(
    *,
    customer: Any,
    property_id: UUID | str,
    unit_id: UUID | str,
    check_in: date,
    check_out: date,
    guest_count: int = 1,
) -> Any:
    prop = Property.objects.select_related("variant").get(id=_as_uuid(property_id))
    config = _require_active_a9(prop.variant_id)
    if config.booking_mode != A9VariantConfiguration.BookingMode.RESERVATION:
        raise StayStateError("Property does not support reservations.")
    if prop.public_state != "PUBLISHED":
        raise StayStateError("Property is not published.")
    nights = _enforce_stay_dates(prop=prop, check_in=check_in, check_out=check_out)

    unit = Unit.objects.get(id=_as_uuid(unit_id), property=prop, is_active=True)

    _verify_unit_availability(unit=unit, check_in=check_in, check_out=check_out, for_update=True)

    total_paise = nights * unit.nightly_rate_paise

    unit_res = UnitReservation.objects.create(
        unit=unit,
        check_in=check_in,
        check_out=check_out,
        status=UnitReservation.Status.HELD,
    )

    return StayReservation.objects.create(
        property=prop,
        unit=unit,
        unit_reservation=unit_res,
        customer=customer,
        check_in=check_in,
        check_out=check_out,
        guest_count=guest_count,
        nights=nights,
        total_paise=total_paise,
        status=StayReservation.Status.HELD,
    )


@transaction.atomic
def initiate_reservation_payment(reservation_id: UUID | str) -> Any:
    res = StayReservation.objects.get(id=_as_uuid(reservation_id))
    if res.status != StayReservation.Status.HELD:
        raise StayStateError("Reservation is not in HELD state.")

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.A9_STAY_RESERVATION,
        amount_paise=res.total_paise,
        idempotency_key=f"a9-reservation:{res.id}",
        expires_at=timezone.now() + timedelta(seconds=settings.M1_PAYMENT_WINDOW_SECONDS),
    )
    res.payment_attempt = attempt
    res.status = StayReservation.Status.PAYMENT_PENDING
    res.save(update_fields=("payment_attempt", "status", "updated_at"))
    return attempt


@transaction.atomic
def confirm_reservation_payment(payment_attempt_id: UUID | str) -> Any:
    attempt = PaymentAttempt.objects.get(id=_as_uuid(payment_attempt_id))
    res = StayReservation.objects.get(payment_attempt=attempt)

    if res.status != StayReservation.Status.PAYMENT_PENDING:
        return res

    res.status = StayReservation.Status.CONFIRMED
    res.save(update_fields=("status", "updated_at"))

    unit_res = res.unit_reservation
    unit_res.status = UnitReservation.Status.CONFIRMED
    unit_res.save(update_fields=("status", "updated_at"))
    return res


@transaction.atomic
def cancel_reservation(
    *,
    reservation: Any,
    customer: Any,
    reason: str = "",
) -> Any:
    """Customer cancels a stay reservation before check-in.

    Allowed on HELD, PAYMENT_PENDING, or CONFIRMED. Fail-closed once CHECKED_IN.
    When a captured payment exists, requests a full automatic refund; otherwise
    cancels without promising money movement.
    """
    if reservation.customer_id != getattr(customer, "id", None):
        raise PermissionError("Not your reservation.")

    reservation = (
        StayReservation.objects.select_for_update()
        .select_related("unit_reservation", "payment_attempt", "property")
        .get(id=reservation.id)
    )
    cancellable = (
        StayReservation.Status.HELD,
        StayReservation.Status.PAYMENT_PENDING,
        StayReservation.Status.CONFIRMED,
    )
    if reservation.status not in cancellable:
        raise StayStateError("Reservation cannot be cancelled after check-in. Contact support.")

    attempt = reservation.payment_attempt
    if attempt is not None and attempt.status in PAYMENT_FINAL_STATES:
        _request_automatic_refund(
            attempt=attempt,
            reason_code="customer_cancelled_stay_reservation",
        )
    elif (
        attempt is not None
        and reservation.status == StayReservation.Status.CONFIRMED
        and attempt.status not in PAYMENT_FINAL_STATES
        and attempt.status != PaymentAttempt.Status.FAILED
    ):
        raise StayStateError(
            "Payment is still settling with the provider, so a refund cannot be "
            "started yet. Try again shortly, or contact support if this persists."
        )

    reservation.status = StayReservation.Status.CANCELLED
    reservation.cancelled_at = timezone.now()
    reservation.cancellation_reason = (reason or "").strip()[:240]
    reservation.save(update_fields=("status", "cancelled_at", "cancellation_reason", "updated_at"))

    unit_res = reservation.unit_reservation
    unit_res.status = UnitReservation.Status.RELEASED
    unit_res.save(update_fields=("status", "updated_at"))
    return reservation


@transaction.atomic
def check_in_reservation(*, reservation: Any, host: Any) -> Any:
    _require_stay_capability(host)
    if reservation.property.host_id != host.id:
        raise PermissionError("Not your reservation.")
    if reservation.status != StayReservation.Status.CONFIRMED:
        raise StayStateError("Reservation is not confirmed.")

    reservation.status = StayReservation.Status.CHECKED_IN
    reservation.checked_in_at = timezone.now()
    reservation.save(update_fields=("status", "checked_in_at", "updated_at"))
    return reservation


@transaction.atomic
def check_out_reservation(*, reservation: Any, host: Any) -> Any:
    _require_stay_capability(host)
    if reservation.property.host_id != host.id:
        raise PermissionError("Not your reservation.")
    if reservation.status != StayReservation.Status.CHECKED_IN:
        raise StayStateError("Reservation is not checked in.")

    reservation.status = StayReservation.Status.CHECKED_OUT
    reservation.checked_out_at = timezone.now()
    reservation.save(update_fields=("status", "checked_out_at", "updated_at"))

    unit_res = reservation.unit_reservation
    unit_res.status = UnitReservation.Status.RELEASED
    unit_res.save(update_fields=("status", "updated_at"))

    OutboxEvent.objects.get_or_create(
        event_type="customer.fulfilment.completed",
        idempotency_key=f"stay-checked-out:{reservation.id}",
        defaults={
            "aggregate_type": "stay_reservation",
            "aggregate_id": reservation.id,
            "payload": {
                "event_version": 1,
                "customer_id": str(reservation.customer_id),
                "source_type": "STAY_CHECKED_OUT",
                "source_id": str(reservation.id),
                "completed_at": timezone.now().isoformat(),
            },
        },
    )
    return reservation


@transaction.atomic
def cancel_reservation_ops(
    *,
    reservation_id: UUID | str,
    actor: Any,
    reason: str = "",
) -> StayReservation:
    """Operations cancels a stay reservation with full automatic refund and releases unit hold."""
    from apps.commerce.services import _request_automatic_refund  # noqa: PLC0415
    from apps.commerce.services.base import PAYMENT_FINAL_STATES  # noqa: PLC0415

    reservation = (
        StayReservation.objects.select_for_update()
        .select_related("unit_reservation", "payment_attempt", "property")
        .get(id=_as_uuid(reservation_id))
    )

    if reservation.status == StayReservation.Status.CANCELLED:
        return reservation

    attempt = reservation.payment_attempt
    if attempt is not None and attempt.status in PAYMENT_FINAL_STATES:
        _request_automatic_refund(
            attempt=attempt,
            reason_code="ops_cancelled_stay_reservation",
        )

    actor_name = getattr(actor, "username", "operations")
    reservation.status = StayReservation.Status.CANCELLED
    reservation.cancelled_at = timezone.now()
    reservation.cancellation_reason = f"Cancelled by {actor_name}: {(reason or '').strip()}"[:240]
    reservation.save(update_fields=("status", "cancelled_at", "cancellation_reason", "updated_at"))

    unit_res = reservation.unit_reservation
    if unit_res:
        unit_res.status = UnitReservation.Status.RELEASED
        unit_res.save(update_fields=("status", "updated_at"))

    return reservation


@transaction.atomic
def expire_stale_enquiries(*, older_than_days: int = 7) -> int:
    """Expire unconfirmed enquiries whose check_in has passed or are older than older_than_days.

    Releases any held UnitReservation.
    """
    now = timezone.now()
    today = timezone.localdate()
    cutoff = now - timedelta(days=older_than_days)

    stale_qs = StayEnquiry.objects.filter(
        status__in=[StayEnquiry.Status.SUBMITTED, StayEnquiry.Status.RESPONDED],
    ).filter(models.Q(check_in__lt=today) | models.Q(created_at__lt=cutoff))

    expired_count = 0
    for enq in stale_qs.select_for_update():
        enq.status = StayEnquiry.Status.EXPIRED
        enq.save(update_fields=("status", "updated_at"))
        if enq.unit_reservation_id:
            unit_res = enq.unit_reservation
            if unit_res and unit_res.status == UnitReservation.Status.HELD:
                unit_res.status = UnitReservation.Status.RELEASED
                unit_res.save(update_fields=("status", "updated_at"))
        expired_count += 1
    return expired_count


def add_property_media(
    *,
    prop: Property,
    host: Any,
    url: str,
    caption: str = "",
    display_order: int = 0,
) -> PropertyMedia:
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    cleaned_url = url.strip()
    if not cleaned_url:
        raise StayStateError("Image URL is required.")
    # Listings go live without review, so only photos this partner uploaded may be attached.
    if not partner_owns_stay_photo(partner=host, url=cleaned_url):
        raise StayStateError(
            "Upload photos from this form instead of pasting links.",
            code="photo_not_uploaded",
        )
    return PropertyMedia.objects.create(
        property=prop,
        url=cleaned_url,
        caption=caption.strip(),
        display_order=display_order,
    )


def remove_property_media(
    *,
    prop: Property,
    host: Any,
    media_id: UUID | str,
) -> None:
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    media = PropertyMedia.objects.filter(id=_as_uuid(media_id), property=prop).first()
    if not media:
        raise StayStateError("Photo not found on this property.", code="media_not_found")
    if (
        prop.moderation_status == Property.ModerationStatus.APPROVED
        and not prop.media.exclude(id=media.id).exists()
    ):
        raise StayStateError(
            "A live property needs at least one photo. Add another photo first.",
            code="last_photo",
        )
    media.delete()


@transaction.atomic
def release_reservation_for_expired_payment(*, payment_attempt_id: UUID) -> None:
    """Free the unit hold when an unpaid stay reservation payment attempt times out.

    Mirrors A7 ``release_booking_for_expired_payment``: cancel the stay reservation
    and release the UnitReservation so the dates become bookable again.
    """
    res = (
        StayReservation.objects.select_for_update()
        .select_related("unit_reservation")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if res is None:
        return

    if res.status not in (StayReservation.Status.HELD, StayReservation.Status.PAYMENT_PENDING):
        return

    res.status = StayReservation.Status.CANCELLED
    res.cancelled_at = timezone.now()
    res.cancellation_reason = "payment_attempt_expired"
    res.save(update_fields=("status", "cancelled_at", "cancellation_reason", "updated_at"))

    if res.unit_reservation_id:
        unit_res = res.unit_reservation
        if unit_res.status != UnitReservation.Status.RELEASED:
            unit_res.status = UnitReservation.Status.RELEASED
            unit_res.save(update_fields=("status", "updated_at"))


def cancel_reservation_on_refund(*, payment_attempt_id: UUID) -> None:
    """Cancel stay capacity after a full gateway refund — never requests another refund."""
    try:
        reservation = (
            StayReservation.objects.select_for_update()
            .select_related("unit_reservation")
            .get(payment_attempt_id=payment_attempt_id)
        )
    except StayReservation.DoesNotExist:
        return

    if reservation.status in (
        StayReservation.Status.CANCELLED,
        StayReservation.Status.NO_SHOW,
        StayReservation.Status.CHECKED_OUT,
    ):
        return

    cancellable = (
        StayReservation.Status.HELD,
        StayReservation.Status.PAYMENT_PENDING,
        StayReservation.Status.CONFIRMED,
    )
    if reservation.status not in cancellable:
        attempt = PaymentAttempt.objects.filter(id=payment_attempt_id).first()
        _open_exception(
            kind=FinancialException.Kind.REFUND_FAILED,
            code="stay_reservation_not_cancellable_after_refund",
            attempt=attempt,
            context={"reservation_id": str(reservation.id), "status": reservation.status},
        )
        return

    reservation.status = StayReservation.Status.CANCELLED
    reservation.cancelled_at = timezone.now()
    reservation.cancellation_reason = "full_refund"
    reservation.save(update_fields=("status", "cancelled_at", "cancellation_reason", "updated_at"))

    unit_reservation = UnitReservation.objects.select_for_update().get(
        id=reservation.unit_reservation_id
    )
    if unit_reservation.status != UnitReservation.Status.RELEASED:
        unit_reservation.status = UnitReservation.Status.RELEASED
        unit_reservation.save(update_fields=("status", "updated_at"))


@transaction.atomic
def repair_stay_ghost_holds() -> int:
    """Release UnitReservations still HELD under terminal or unpaid stay reservations.

    Mirrors A7 ``repair_ghost_asset_holds`` for stale A9 unit holds that block
    rebooking after cancelled / failed / expired payment attempts.

    Candidate ids are collected without ``select_for_update`` first — the reverse
    OneToOne ``stay_reservation`` is a LEFT OUTER JOIN, and Postgres rejects
    ``FOR UPDATE`` on the nullable side of an outer join.
    """
    ghost_filter = (
        models.Q(stay_reservation__status=StayReservation.Status.CANCELLED)
        | models.Q(
            stay_reservation__status__in=(
                StayReservation.Status.HELD,
                StayReservation.Status.PAYMENT_PENDING,
            ),
            stay_reservation__payment_attempt__isnull=True,
        )
        | models.Q(
            stay_reservation__status__in=(
                StayReservation.Status.HELD,
                StayReservation.Status.PAYMENT_PENDING,
            ),
            stay_reservation__payment_attempt__status__in=(
                PaymentAttempt.Status.FAILED,
                PaymentAttempt.Status.EXPIRED,
            ),
        )
    )
    candidate_ids = list(
        UnitReservation.objects.filter(
            status=UnitReservation.Status.HELD,
            stay_reservation__isnull=False,
        )
        .filter(ghost_filter)
        .values_list("id", flat=True)[:500]
    )

    repaired = 0
    now = timezone.now()
    for unit_res_id in candidate_ids:
        unit_res = UnitReservation.objects.select_for_update().get(id=unit_res_id)
        if unit_res.status != UnitReservation.Status.HELD:
            continue
        stay_res = (
            StayReservation.objects.select_for_update()
            .filter(unit_reservation_id=unit_res.id)
            .first()
        )
        if stay_res is None:
            continue

        unit_res.status = UnitReservation.Status.RELEASED
        unit_res.save(update_fields=("status", "updated_at"))

        if stay_res.status in (
            StayReservation.Status.HELD,
            StayReservation.Status.PAYMENT_PENDING,
        ):
            stay_res.status = StayReservation.Status.CANCELLED
            stay_res.cancelled_at = now
            stay_res.cancellation_reason = "ghost_hold_repair"
            stay_res.save(
                update_fields=("status", "cancelled_at", "cancellation_reason", "updated_at")
            )

        repaired += 1
    return repaired
