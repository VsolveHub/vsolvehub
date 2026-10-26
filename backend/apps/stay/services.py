import calendar
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any
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
from apps.foundation.storage import public_stored_name
from apps.locations.pins import KeepPin, Pin, apply_pin
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.partners.capabilities import is_approved_stay_host
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import (
    Property,
    PropertyMedia,
    Room,
    RoomLook,
    StayEnquiry,
    StayModerationEvent,
    StayPhotoUpload,
    StayReservation,
    StayReview,
    StayReviewPhoto,
    StaySubscription,
    StaySubscriptionPlan,
    StayVisit,
    Unit,
    UnitMedia,
    UnitReservation,
)

logger = logging.getLogger(__name__)

_MAX_STAY_REVIEW_RATING = 5
_AC_YES = ("AC", True)
_FOOD_YES = ("Food included", True)


class StayStateError(ValueError):
    """Domain refusal. ``code`` is a stable machine token for the API envelope."""

    def __init__(self, message: str, *, code: str = "stay_state_invalid") -> None:
        super().__init__(message)
        self.code = code


class StayPlanCapError(StayStateError):
    def __init__(self, message: str, *, code: str = "stay_plan_cap_reached") -> None:
        super().__init__(message, code=code)


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


_ACTIVE_HOLD_STATUSES = (UnitReservation.Status.HELD, UnitReservation.Status.CONFIRMED)


def _unit_bookings_query(
    *,
    unit_ref: Any,
    check_in: date,
    check_out: date,
) -> tuple[models.QuerySet[UnitReservation], models.QuerySet[StayEnquiry]]:
    """Everything occupying a room type across the dates.

    Calendar holds, plus confirmed enquiries that never created a hold (enquiry mode). A confirmed
    enquiry that did create a hold is counted once, through its hold.
    """
    holds = UnitReservation.objects.filter(
        unit=unit_ref,
        status__in=_ACTIVE_HOLD_STATUSES,
        check_in__lt=check_out,
        check_out__gt=check_in,
    )
    enquiries = StayEnquiry.objects.filter(
        unit=unit_ref,
        status=StayEnquiry.Status.CONFIRMED,
        unit_reservation__isnull=True,
        check_in__lt=check_out,
        check_out__gt=check_in,
    )
    return holds, enquiries


def _peak_nightly_occupancy(
    intervals: list[tuple[date, date]], *, check_in: date, check_out: date
) -> int:
    peak = 0
    night = check_in
    while night < check_out:
        booked = sum(1 for start, end in intervals if start <= night < end)
        peak = max(peak, booked)
        night += timedelta(days=1)
    return peak


def _verify_unit_availability(
    *,
    unit: Any,
    check_in: date,
    check_out: date,
    exclude_enquiry_id: Any = None,
    exclude_reservation_id: Any = None,
    for_update: bool = False,
) -> None:
    """Refuse when every room of this type is taken on any night of the stay."""
    if for_update:
        # Lock the room type itself: with several rooms per type, row locks on existing bookings
        # cannot stop two new bookings from both taking "the last room".
        Unit.objects.select_for_update().filter(id=unit.id).first()
    holds, enquiries = _unit_bookings_query(unit_ref=unit, check_in=check_in, check_out=check_out)
    if exclude_reservation_id:
        holds = holds.exclude(id=exclude_reservation_id)
    if exclude_enquiry_id:
        enquiries = enquiries.exclude(id=exclude_enquiry_id)
    intervals = [
        *holds.values_list("check_in", "check_out"),
        *enquiries.values_list("check_in", "check_out"),
    ]
    quantity = max(int(getattr(unit, "quantity", 1) or 1), 1)
    if _peak_nightly_occupancy(intervals, check_in=check_in, check_out=check_out) >= quantity:
        raise StayStateError(
            "These dates are already booked or held.",
            code="dates_unavailable",
        )


def _resolve_bookable_unit(*, prop: Property, unit_id: UUID | str | None) -> Unit:
    """The room a guest is asking about. Never a silent guess, never a ₹0 room.

    With one active room type there is nothing to choose; with several the guest must pick.
    """
    active = prop.units.filter(is_active=True)
    if unit_id is not None:
        unit = active.filter(id=_as_uuid(unit_id)).first()
        if unit is None:
            raise StayStateError("This room is not available.", code="room_unavailable")
        return unit
    candidates = list(active[:2])
    if not candidates:
        raise StayStateError("This property has no rooms open for booking.", code="no_rooms")
    if len(candidates) > 1:
        raise StayStateError("Choose a room.", code="room_required")
    return candidates[0]


def _enforce_guest_count(*, unit: Unit, guest_count: int) -> None:
    if guest_count > unit.max_guests:
        raise StayStateError(
            f"{unit.name} fits up to {unit.max_guests} guest{'s' if unit.max_guests != 1 else ''}.",
            code="too_many_guests",
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
    return nights


MAX_STAY_MONTHS = 24


def _add_months(start: date, months: int) -> date:
    """``start`` moved ``months`` calendar months on, clamped to the month's last day."""
    month_index = start.month - 1 + months
    year, month = start.year + month_index // 12, month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return start.replace(year=year, month=month, day=min(start.day, last_day))


def _stay_period(
    *,
    prop: Property,
    price_period: str,
    check_in: date,
    check_out: date | None,
    length: int | None,
) -> tuple[date, int]:
    """Validate an enquiry's dates. Returns (check_out, length in the property's price unit).

    A monthly stay is asked as "move in on X for N months"; a nightly one as "arrive on X for N
    nights". Either may also arrive as an explicit check-out date. The host confirms by phone,
    so this only checks the request is sensible — it does not hold the room.
    """
    monthly = price_period == A9VariantConfiguration.PricePeriod.MONTH
    unit, limit = ("month", MAX_STAY_MONTHS) if monthly else ("night", MAX_STAY_NIGHTS)
    if check_in < timezone.localdate():
        raise StayStateError("The start date cannot be in the past.", code="check_in_in_past")
    if length is None:
        if check_out is None or check_out <= check_in:
            raise StayStateError("Tell the host how long you want to stay.", code="length_required")
        days = (check_out - check_in).days
        length = max(1, -(-days // 30)) if monthly else days
    elif length < 1:
        raise StayStateError("Tell the host how long you want to stay.", code="length_required")
    else:
        check_out = _add_months(check_in, length) if monthly else check_in + timedelta(days=length)
    minimum = int(prop.min_stay_nights or 1)
    if length < minimum:
        raise StayStateError(
            f"Minimum stay is {minimum} {unit}{'s' if minimum != 1 else ''}.",
            code="min_stay_not_met",
        )
    if length > limit:
        raise StayStateError(f"Maximum stay is {limit} {unit}s.", code="max_stay_exceeded")
    # No "open from / until" window: a host who is not taking guests pauses the property or
    # marks the room full. Old window values on existing rows are ignored.
    return check_out, length


def _require_stay_capability(partner: Any) -> None:
    """Approved as a stay host (the short sign-up) or holding an approved A9 capability."""
    if is_approved_stay_host(partner):
        return
    if not partner.capabilities.filter(archetype="A9_STAY", status="APPROVED").exists():
        raise PermissionError("Partner does not have an approved A9 stay capability.")


_STAY_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
#: The most one photo may weigh, for property photos and review photos alike.
STAY_PHOTO_MAX_BYTES = 10 * 1024 * 1024
#: How many photos one review may attach.
MAX_REVIEW_PHOTOS = 5
_WEBP_TAG_END = 12


def _looks_like_image(head: bytes) -> bool:
    """The file's first bytes, not its claimed type: a renamed document is not a photo."""
    return head.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")) or (
        head[:4] == b"RIFF" and head[8:_WEBP_TAG_END] == b"WEBP"
    )


def _check_stay_image(upload: Any) -> tuple[str, int]:
    """Validate an uploaded photo; returns (content_type, size_bytes)."""
    content_type = (getattr(upload, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type not in _STAY_PHOTO_TYPES:
        raise StayStateError("Photo must be a JPEG, PNG, or WebP image.", code="photo_type")
    size = int(getattr(upload, "size", 0) or 0)
    if size <= 0:
        raise StayStateError("Photo file is empty.", code="photo_empty")
    if size > STAY_PHOTO_MAX_BYTES:
        raise StayStateError("Each photo must be 10 MB or smaller.", code="photo_too_large")
    upload.seek(0)
    head = upload.read(_WEBP_TAG_END)
    upload.seek(0)
    if not _looks_like_image(head):
        raise StayStateError("Photo must be a JPEG, PNG, or WebP image.", code="photo_type")
    return content_type, size


def store_stay_photo(*, partner: Any, upload: Any) -> StayPhotoUpload:
    _require_stay_capability(partner)
    content_type, size = _check_stay_image(upload)
    return StayPhotoUpload.objects.create(
        partner=partner,
        stored_file=upload,
        original_name=str(getattr(upload, "name", "photo"))[:180],
        content_type=content_type,
        size_bytes=size,
    )


def store_stay_review_photo(*, customer: Any, upload: Any) -> StayReviewPhoto:
    content_type, size = _check_stay_image(upload)
    return StayReviewPhoto.objects.create(
        customer=customer,
        stored_file=upload,
        original_name=str(getattr(upload, "name", "photo"))[:180],
        content_type=content_type,
        size_bytes=size,
    )


def _stored_name_from_url(url: str, folder: str | tuple[str, ...]) -> str | None:
    return public_stored_name(url, folder=folder)


def customer_owns_review_photo(*, customer: Any, url: str) -> bool:
    stored_name = _stored_name_from_url(url, ("images/reviews/stays/", "stay-reviews/"))
    if stored_name is None:
        return False
    return StayReviewPhoto.objects.filter(customer=customer, stored_file=stored_name).exists()


def partner_owns_stay_photo(*, partner: Any, url: str) -> bool:
    stored_name = _stored_name_from_url(url, ("images/stays/properties/", "stay-ads/"))
    if stored_name is None:
        return False
    return StayPhotoUpload.objects.filter(partner=partner, stored_file=stored_name).exists()


#: Facts that differ from room to room. The category schemas publish them once per property, which
#: cannot describe a property with both AC and non-AC rooms, so they are asked per room instead.
ROOM_ATTRIBUTE_KEYS = ("ac", "bathroom")
#: Carried by the room itself — its name ("Double sharing", "Deluxe") and ``sharing_count`` — so
#: asking for them again on the property would be the same question twice.
ROOM_DESCRIBED_KEYS = ("occupancy", "sharing", "room_type")

#: How a stay type's rooms are let, which decides the one number a host gives per room:
#: - ``SHARED``: guests rent a bed, so the host says how many people share the room
#:   (1 = single, 2 = double sharing). One enquiry may bring up to that many people.
#: - ``PRIVATE``: one booking takes the whole room, so the host says how many guests it fits.
#:   "Sharing" means nothing here and is kept at 1.
#: - ``MIXED``: a type not listed below; the host fills both numbers.
#: Facilities any host can tick, whatever the stay type, stored as true/false in
#: ``Property.structured_fields`` under these keys. A category that already asks one of them
#: (a PG's "Food" question, a hotel's "Breakfast") keeps its own question for it.
STAY_AMENITIES: tuple[tuple[str, str], ...] = (
    ("wifi", "WiFi"),
    ("power_backup", "Power backup"),
    ("cctv", "CCTV / security"),
    ("housekeeping", "Housekeeping"),
    ("laundry", "Laundry"),
    ("hot_water", "Hot water"),
    ("parking", "Parking"),
    ("lift", "Lift"),
    ("food", "Meals included"),
    ("breakfast", "Breakfast included"),
)
_AMENITY_KEYS = frozenset(key for key, _label in STAY_AMENITIES)
#: What guests see for each category question, as "For: Ladies" or "Furnishing: Semi furnished".
_HIGHLIGHT_LABELS = {
    "furnishing": "Furnishing",
    "tier": "Tier",
    "gender": "For",
    "occupant": "Suited to",
    "hostel_type": "Hostel type",
    "layout": "Layout",
    "property_type": "Property type",
    "duration": "Duration",
    "stay_type": "Stay type",
    "capacity": "Capacity",
    "listing_type": "Listing type",
    "star_rating": "Star rating",
}


def _is_yes(value: Any) -> bool:
    """An answer that means "has it": true, or the yes choice ("AC", "Food included")."""
    return value is True or value in _AC_YES or value in _FOOD_YES


def amenity_options(property_schema: dict[str, Any]) -> list[dict[str, str]]:
    """The amenity checkboxes for a stay type: the platform list minus what the category asks."""
    asked = property_schema.get("properties") or {}
    return [{"key": key, "label": label} for key, label in STAY_AMENITIES if key not in asked]


def _validate_amenity_answers(fields: dict[str, Any], property_schema: dict[str, Any]) -> None:
    asked = property_schema.get("properties") or {}
    for key in _AMENITY_KEYS:
        if key in fields and key not in asked and not isinstance(fields[key], bool):
            raise StayStateError(f"Amenity '{key}' must be true or false.", code="amenity_invalid")


def property_amenities(prop: Property) -> list[dict[str, str]]:
    """What a guest sees under "Amenities": only what the host actually said yes to."""
    fields = prop.structured_fields if isinstance(prop.structured_fields, dict) else {}
    rooms = [unit for unit in prop.units.all() if unit.is_active]
    shown: list[dict[str, str]] = []
    room_has_ac = any(
        isinstance(unit.attributes, dict) and unit.attributes.get("ac") in _AC_YES for unit in rooms
    )
    if room_has_ac or fields.get("ac") in _AC_YES:
        shown.append({"key": "ac", "label": "AC rooms"})
    shown.extend(
        {"key": key, "label": label} for key, label in STAY_AMENITIES if _is_yes(fields.get(key))
    )
    return shown


def property_highlights(prop: Property, property_schema: dict[str, Any]) -> list[dict[str, str]]:
    """The host's answers to the category questions, in the category's order, for guests."""
    fields = prop.structured_fields if isinstance(prop.structured_fields, dict) else {}
    asked = property_schema.get("properties") or {}
    rows: list[dict[str, str]] = []
    for key in asked:
        value = fields.get(key)
        if key in _AMENITY_KEYS or isinstance(value, bool) or value in (None, ""):
            continue
        label = _HIGHLIGHT_LABELS.get(key) or key.replace("_", " ").capitalize()
        rows.append({"label": label, "value": str(value)})
    return rows


def customer_can_review(*, customer: Any, prop: Property) -> bool:
    """A signed-in guest with a confirmed stay here who has not reviewed it yet."""
    if customer is None or not getattr(customer, "is_authenticated", False):
        return False
    if StayReview.objects.filter(customer=customer, property=prop).exists():
        return False
    confirmed_enquiry = StayEnquiry.objects.filter(
        customer=customer, property=prop, status=StayEnquiry.Status.CONFIRMED
    ).exists()
    return (
        confirmed_enquiry
        or StayReservation.objects.filter(
            customer=customer,
            property=prop,
            status__in=[StayReservation.Status.CHECKED_OUT, StayReservation.Status.CONFIRMED],
        ).exists()
    )


ROOM_STYLE_SHARED = "SHARED"
ROOM_STYLE_PRIVATE = "PRIVATE"
ROOM_STYLE_MIXED = "MIXED"
SHARED_ROOM_SUBCATEGORIES = frozenset(
    {
        "rooms",
        "pg-accommodation",
        "hostels",
        "bed-space",
        "co-living-spaces",
        "student-accommodation",
        "worker-accommodation",
    }
)
PRIVATE_ROOM_SUBCATEGORIES = frozenset(
    {
        "hotels",
        "short-stay",
        "apartments",
        "rental-properties",
        "property-listing",
        "premium-stays",
    }
)


def room_style_for_subcategory(slug: str | None) -> str:
    if slug in SHARED_ROOM_SUBCATEGORIES:
        return ROOM_STYLE_SHARED
    if slug in PRIVATE_ROOM_SUBCATEGORIES:
        return ROOM_STYLE_PRIVATE
    return ROOM_STYLE_MIXED


def room_style_for_property(prop: Property) -> str:
    """``SHARED``, ``PRIVATE`` or ``MIXED`` for this property's stay type."""
    return room_style_for_subcategory(prop.variant.service.subcategory.slug)


def _normalize_room_numbers(*, style: str, sharing_count: int, max_guests: int) -> tuple[int, int]:
    """Keep (sharing_count, max_guests) consistent with how the stay type lets its rooms."""
    if style == ROOM_STYLE_SHARED:
        return sharing_count, sharing_count
    if style == ROOM_STYLE_PRIVATE:
        return 1, max_guests
    return sharing_count, max_guests


def split_stay_schema(
    schema: dict[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    """Split a category schema into (property questions, room questions, room name suggestions)."""
    if not isinstance(schema, dict) or not schema:
        return {}, {}, []
    props = schema.get("properties")
    props = props if isinstance(props, dict) else {}
    required = schema.get("required")
    required = required if isinstance(required, list) else []
    moved = set(ROOM_ATTRIBUTE_KEYS) | set(ROOM_DESCRIBED_KEYS)
    property_schema = {
        **schema,
        "properties": {key: value for key, value in props.items() if key not in moved},
        "required": [key for key in required if key not in moved],
    }
    room_properties = {key: props[key] for key in ROOM_ATTRIBUTE_KEYS if key in props}
    room_schema = {"type": "object", "properties": room_properties} if room_properties else {}
    suggestions: list[str] = []
    for key in ROOM_DESCRIBED_KEYS:
        enum = props.get(key, {}).get("enum") if isinstance(props.get(key), dict) else None
        if isinstance(enum, list):
            suggestions.extend(str(value) for value in enum if str(value) not in suggestions)
    return property_schema, room_schema, suggestions


def _validate_against(schema: dict[str, Any], instance: dict[str, Any], *, label: str) -> None:
    if not schema or not instance:
        return
    try:
        jsonschema.validate(instance=instance, schema=schema)
    except JsonSchemaValidationError as e:
        raise StayStateError(f"Invalid {label}: {e.message}") from e


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
                    property_schema, room_schema, room_names = split_stay_schema(
                        active_cfg.property_schema
                    )
                    svc_data["variants"].append(
                        {
                            "id": variant.id,
                            "name": variant.name,
                            "code": variant.code,
                            "property_schema": property_schema,
                            "room_schema": room_schema,
                            "room_name_suggestions": room_names,
                            "booking_mode": active_cfg.booking_mode,
                            "price_period": active_cfg.price_period,
                            "room_style": room_style_for_subcategory(sub.slug),
                            "amenity_options": amenity_options(property_schema),
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
    media: list[dict[str, Any]] | None = None,
    image_urls: list[str] | None = None,
    pin: tuple[Decimal, Decimal] | None = None,
) -> Property:
    """Create a property. Units are optional — pass ``nightly_rate_paise`` to seed one."""
    _require_stay_capability(host)
    config = _require_active_a9(variant_id)
    if min_stay_nights < 1:
        raise StayStateError("Minimum stay must be at least 1 night.")
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
    property_schema, _room_schema, _names = split_stay_schema(config.property_schema)
    _validate_against(property_schema, fields, label="structured fields")
    _validate_amenity_answers(fields, property_schema)
    prop = Property.objects.create(
        host=host,
        variant_id=_as_uuid(variant_id),
        title=title.strip(),
        description=description,
        location_text=resolved_location,
        latitude=pin[0] if pin else None,
        longitude=pin[1] if pin else None,
        moderation_status=Property.ModerationStatus.DRAFT,
        structured_fields=fields,
        cancellation_policy_text=cancellation_policy_text,
        house_rules=house_rules,
        min_stay_nights=min_stay_nights,
    )
    if nightly_rate_paise is not None:
        seeded_sharing, seeded_guests = _normalize_room_numbers(
            style=room_style_for_property(prop),
            sharing_count=sharing_count,
            max_guests=max(sharing_count, 1),
        )
        seeded = Unit.objects.create(
            property=prop,
            name=(unit_name or "Standard room").strip() or "Standard room",
            sharing_count=seeded_sharing,
            max_guests=seeded_guests,
            nightly_rate_paise=nightly_rate_paise,
        )
        _create_rooms(unit=seeded, numbers=_next_room_numbers(prop, 1))
        sync_unit_rooms(seeded)
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
    quantity: int = 1,
    max_guests: int | None = None,
    attributes: dict[str, Any] | None = None,
    is_active: bool = True,
    room_numbers: list[str] | None = None,
    image_urls: list[str] | None = None,
) -> Unit:
    """A new room type, its numbered rooms, and photos of the room (``image_urls``).

    ``room_numbers`` ("101", "102") name each room; without them the type gets ``quantity``
    rooms numbered "Room N" for the host to rename.
    """
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    config = _require_active_a9(prop.variant_id)
    numbers = _clean_new_room_numbers(prop=prop, numbers=room_numbers or [])
    if numbers:
        quantity = len(numbers)
    if nightly_rate_paise <= 0:
        raise StayStateError("Nightly rate must be positive paise.")
    name = (name or "").strip()
    if not name:
        raise StayStateError("Unit name is required.")
    resolved_max_guests = max(sharing_count, 1) if max_guests is None else max_guests
    _validate_room_numbers(
        sharing_count=sharing_count, quantity=quantity, max_guests=resolved_max_guests
    )
    sharing_count, resolved_max_guests = _normalize_room_numbers(
        style=room_style_for_property(prop),
        sharing_count=sharing_count,
        max_guests=resolved_max_guests,
    )
    _property_schema, room_schema, _names = split_stay_schema(config.property_schema)
    _validate_against(room_schema, attributes or {}, label="room details")
    unit = Unit.objects.create(
        property=prop,
        name=name,
        sharing_count=sharing_count,
        quantity=quantity,
        max_guests=resolved_max_guests,
        nightly_rate_paise=nightly_rate_paise,
        attributes=attributes or {},
        is_active=is_active,
    )
    look = RoomLook.objects.create(unit=unit, name="", display_order=0)
    _create_rooms(
        unit=unit,
        numbers=numbers or _next_room_numbers(prop, quantity),
        status=Room.Status.AVAILABLE if is_active else Room.Status.UNAVAILABLE,
        look=look,
    )
    for url in image_urls or []:
        add_unit_media(unit=unit, host=host, url=url, look=look)
    return sync_unit_rooms(unit)


def _validate_room_numbers(
    *, sharing_count: int | None, quantity: int | None, max_guests: int | None
) -> None:
    if sharing_count is not None and sharing_count < 1:
        raise StayStateError("Sharing count must be at least 1.")
    if quantity is not None and quantity < 1:
        raise StayStateError("Number of rooms must be at least 1.", code="quantity_invalid")
    if max_guests is not None and max_guests < 1:
        raise StayStateError("A room must fit at least 1 guest.", code="max_guests_invalid")


@transaction.atomic
def update_unit(  # noqa: PLR0912
    *,
    unit: Unit,
    host: Any,
    name: str | None = None,
    nightly_rate_paise: int | None = None,
    sharing_count: int | None = None,
    quantity: int | None = None,
    max_guests: int | None = None,
    attributes: dict[str, Any] | None = None,
    is_active: bool | None = None,
) -> Unit:
    """Edit a room type. Price and count changes apply to new bookings; existing ones keep theirs.

    ``quantity`` adds or removes numbered rooms (never a booked one). ``is_active`` switches every
    room that is not booked on or off. When no room of a live property is available it simply
    stops appearing to guests.
    """
    _require_stay_capability(host)
    if unit.property.host_id != host.id:
        raise PermissionError("Not your property.")
    _validate_room_numbers(sharing_count=sharing_count, quantity=quantity, max_guests=max_guests)
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
    for field, value in (
        ("sharing_count", sharing_count),
        ("max_guests", max_guests),
    ):
        if value is not None:
            setattr(unit, field, value)
            updates.append(field)
    if sharing_count is not None or max_guests is not None:
        unit.sharing_count, unit.max_guests = _normalize_room_numbers(
            style=room_style_for_property(unit.property),
            sharing_count=unit.sharing_count,
            max_guests=unit.max_guests,
        )
        updates.extend(f for f in ("sharing_count", "max_guests") if f not in updates)
    if attributes is not None:
        config = _require_active_a9(unit.property.variant_id)
        _property_schema, room_schema, _names = split_stay_schema(config.property_schema)
        _validate_against(room_schema, attributes, label="room details")
        unit.attributes = attributes
        updates.append("attributes")
    if updates:
        updates.append("updated_at")
        unit.save(update_fields=updates)
    # Counts and the on/off switch live on the numbered rooms; the type follows them.
    if quantity is not None:
        _resize_unit_rooms(unit=unit, quantity=quantity)
    if is_active is not None:
        _switch_unit_rooms(unit=unit, on=is_active)
    if quantity is not None or is_active is not None:
        sync_unit_rooms(unit)
    return unit


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
    min_stay_nights: int | None = None,
    pin: Pin = KeepPin.KEEP,
) -> Property:
    """Partner updates the published/draft Ad in place (no live event sync)."""
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    config = _require_active_a9(prop.variant_id)
    updates: list[str] = []
    if title is not None:
        if not title.strip():
            raise StayStateError("Property title is required.", code="title_required")
        prop.title = title.strip()
        updates.append("title")
    if description is not None:
        prop.description = description
        updates.append("description")
    if location_text is not None:
        if not location_text.strip():
            raise StayStateError("Property location is required.", code="location_required")
        prop.location_text = location_text.strip()
        updates.append("location_text")
    updates += apply_pin(prop, pin, latitude="latitude", longitude="longitude")
    if structured_fields is not None:
        property_schema, _room_schema, _names = split_stay_schema(config.property_schema)
        _validate_against(property_schema, structured_fields, label="structured fields")
        _validate_amenity_answers(structured_fields, property_schema)
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
    if updates:
        updates.append("updated_at")
        prop.save(update_fields=updates)
    return prop


_UPCOMING_RESERVATION_STATUSES = (
    StayReservation.Status.HELD,
    StayReservation.Status.PAYMENT_PENDING,
    StayReservation.Status.CONFIRMED,
    StayReservation.Status.CHECKED_IN,
)


def upcoming_booking_count(*, unit: Unit | None = None, prop: Property | None = None) -> int:
    """Bookings that still have nights ahead, for one room type or a whole property."""
    today = timezone.localdate()
    scope: dict[str, Any] = {"unit": unit} if unit is not None else {"property": prop}
    reservations = StayReservation.objects.filter(
        **scope, status__in=_UPCOMING_RESERVATION_STATUSES, check_out__gt=today
    ).count()
    enquiries = StayEnquiry.objects.filter(
        **scope, status=StayEnquiry.Status.CONFIRMED, check_out__gt=today
    ).count()
    return reservations + enquiries


@transaction.atomic
def set_property_listing(*, prop: Property, host: Any, action: str) -> Property:
    """The host's own visibility switch: pause, resume, archive or restore.

    Nothing is deleted. Pausing hides the property from guests and stops new enquiries and
    bookings; existing bookings carry on. Archiving is the soft delete and is refused while
    bookings are still ahead, so a guest's stay is never orphaned.
    """
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    prop = Property.objects.select_for_update().get(id=prop.id)
    status = Property.ListingStatus
    approved = prop.moderation_status == Property.ModerationStatus.APPROVED
    if action == "pause":
        if not approved or prop.listing_status != status.LIVE:
            raise StayStateError("Only a live property can be paused.")
        prop.listing_status = status.PAUSED
    elif action == "resume":
        if not approved or prop.listing_status != status.PAUSED:
            raise StayStateError("Only a paused property can be resumed.")
        _assert_publishable(prop)
        assert_stay_subscription_capacity(prop)
        prop.listing_status = status.LIVE
    elif action == "archive":
        if prop.listing_status == status.ARCHIVED:
            raise StayStateError("This property is already archived.")
        if upcoming_booking_count(prop=prop):
            raise StayStateError(
                "This property still has upcoming bookings. Pause it instead, and archive it "
                "once those stays are over.",
                code="has_upcoming_bookings",
            )
        prop.listing_status = status.ARCHIVED
    elif action == "restore":
        if prop.listing_status != status.ARCHIVED:
            raise StayStateError("Only an archived property can be restored.")
        # A restored live listing comes back paused, so it only reappears when the host says so.
        prop.listing_status = status.PAUSED if approved else status.LIVE
    else:
        raise StayStateError("Unknown action.")
    prop.save(update_fields=("listing_status", "updated_at"))
    return prop


@transaction.atomic
def confirm_enquiry(  # noqa: PLR0912, PLR0915
    *, enquiry: StayEnquiry, host: Any, room_id: UUID | str | None = None
) -> StayEnquiry:
    """Host marks an enquiry as booked after speaking to the guest.

    With ``room_id`` the chosen numbered room is marked Booked as well, which takes it out of
    its type's available count. The room may be of another type in the same property (the guest
    settled on a different room on the call); the enquiry then follows that room.
    """
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

    room: Room | None = None
    if room_id is not None:
        room = (
            Room.objects.select_for_update()
            .filter(id=_as_uuid(room_id), property_id=enquiry.property_id)
            .first()
        )
        if room is None:
            raise StayStateError("Choose a room in this property.", code="room_not_found")
        if room.status == Room.Status.BOOKED:
            raise StayStateError(f"{room.number} is already booked.", code="room_already_booked")
        enquiry.unit_id = room.unit_id

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

    # Enquiry stays are arranged on the phone: the host knows whether the room is free, so
    # "Booked" records their decision rather than checking a calendar. Only the legacy paid
    # mode holds the room and must refuse an overlap.
    if needs_hold:
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
    if room is not None:
        _book_room(
            room=room,
            occupant_name=str(getattr(enquiry.customer, "full_name", "") or ""),
            enquiry=enquiry,
        )

    _notify_enquiry(
        enquiry,
        to_host=False,
        template_code="stay_enquiry_confirmed",
        purpose="stay.enquiry.confirmed",
    )
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
    # A booking that falls through frees the room it had taken.
    for booked in Room.objects.select_for_update().filter(
        booked_enquiry=enquiry, status=Room.Status.BOOKED
    ):
        _free_room(booked)
    if enquiry.unit_reservation_id is not None:
        unit_res = UnitReservation.objects.select_for_update().get(id=enquiry.unit_reservation_id)
        if unit_res.status != UnitReservation.Status.RELEASED:
            unit_res.status = UnitReservation.Status.RELEASED
            unit_res.save(update_fields=("status", "updated_at"))
    if as_host:
        _notify_enquiry(
            enquiry,
            to_host=False,
            template_code="stay_enquiry_declined",
            purpose="stay.enquiry.cancelled_by_host",
            context={"host_note": ""},
        )
    else:
        _notify_enquiry(
            enquiry,
            to_host=True,
            template_code="stay_enquiry_withdrawn",
            purpose="stay.enquiry.withdrawn",
        )
    return enquiry


def _notify_enquiry(
    enquiry: StayEnquiry,
    *,
    to_host: bool,
    template_code: str,
    purpose: str,
    context: dict[str, Any] | None = None,
) -> None:
    """One in-app notice about an enquiry. Never blocks the action it reports on."""
    prop = enquiry.property
    recipient_id = prop.host.user_id if to_host else enquiry.customer_id
    guest_name = str(getattr(enquiry.customer, "full_name", "") or "A guest")
    try:
        request_notification(
            recipient_id=recipient_id,
            purpose=purpose,
            channel=NotificationIntent.Channel.IN_APP,
            template_code=template_code,
            context={
                "property_title": prop.title,
                "host_name": str(getattr(prop.host, "display_name", "") or "The host"),
                "guest_name": guest_name,
                "check_in": enquiry.check_in.strftime("%d %b %Y"),
                **(context or {}),
            },
            idempotency_key=f"{purpose}:{enquiry.id}",
        )
    except Exception:
        logger.exception("Failed to dispatch stay enquiry notification %s", template_code)


def _checked_review_photos(*, customer: Any, image_urls: list[str] | None) -> list[str]:
    photos = list(image_urls or [])
    if len(photos) > MAX_REVIEW_PHOTOS:
        raise StayStateError(
            f"A review can have up to {MAX_REVIEW_PHOTOS} photos.", code="too_many_review_photos"
        )
    # Only photos this guest uploaded here: no outside links, no one else's pictures.
    if any(not customer_owns_review_photo(customer=customer, url=url) for url in photos):
        raise StayStateError(
            "Upload review photos from the review form.", code="review_photo_not_uploaded"
        )
    return photos


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
    photos = _checked_review_photos(customer=customer, image_urls=image_urls)
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
        image_urls=photos,
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
    # Guests choose by the room, so a room photo is enough; building photos are optional.
    if not prop.media.exists() and not UnitMedia.objects.filter(unit__property=prop).exists():
        raise StayStateError(
            "Add at least one room photo before publishing.", code="photo_required"
        )
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
    if prop.listing_status == Property.ListingStatus.ARCHIVED:
        raise StayStateError("Restore this property before publishing it.")
    _assert_publishable(prop)
    assert_stay_subscription_capacity(prop)

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
    check_out: date | None = None,
    length: int | None = None,
    guest_count: int = 1,
    message: str = "",
    unit_id: UUID | str | None = None,
    look_id: UUID | str | None = None,
) -> StayEnquiry:
    """A guest asks to stay. The host sees their name and number and calls them.

    ``length`` is in the property's price unit (nights or months); ``check_out`` may be sent
    instead. No room is held — the host confirms on the phone and marks the outcome.
    """
    prop = Property.objects.select_related("variant", "host").get(id=_as_uuid(property_id))
    config = _require_active_a9(prop.variant_id)
    if config.booking_mode != A9VariantConfiguration.BookingMode.ENQUIRY:
        raise StayStateError("This property requires a reservation, not an enquiry.")
    if prop.public_state != "PUBLISHED":
        raise StayStateError("Property is not open for enquiries.")
    check_out, length = _stay_period(
        prop=prop,
        price_period=config.price_period,
        check_in=check_in,
        check_out=check_out,
        length=length,
    )

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

    unit = _resolve_bookable_unit(prop=prop, unit_id=unit_id)
    _enforce_guest_count(unit=unit, guest_count=guest_count)
    look = resolve_look(unit=unit, look_id=look_id)

    enquiry = StayEnquiry.objects.create(
        property=prop,
        unit=unit,
        look=look,
        customer=customer,
        check_in=check_in,
        check_out=check_out,
        guest_count=guest_count,
        nights=(check_out - check_in).days,
        stay_length=length,
        price_period=config.price_period,
        total_quote_paise=length * unit.nightly_rate_paise,
        message=message,
        status=StayEnquiry.Status.SUBMITTED,
    )
    _notify_enquiry(
        enquiry,
        to_host=True,
        template_code="stay_enquiry_received",
        purpose="stay.enquiry.received",
    )
    return enquiry


def calculate_stay_quote(
    *,
    property_id: UUID | str,
    check_in: date,
    check_out: date | None = None,
    length: int | None = None,
    unit_id: UUID | str | None = None,
) -> dict[str, Any]:
    """An estimate for the guest: the room's rate times the length. Nothing is charged."""
    prop = Property.objects.select_related("variant").get(id=_as_uuid(property_id))
    config = _require_active_a9(prop.variant_id)
    if prop.public_state != "PUBLISHED":
        raise StayStateError("Property is not open.")
    check_out, length = _stay_period(
        prop=prop,
        price_period=config.price_period,
        check_in=check_in,
        check_out=check_out,
        length=length,
    )
    unit = _resolve_bookable_unit(prop=prop, unit_id=unit_id)

    return {
        "property_id": prop.id,
        "unit_id": unit.id,
        "unit_name": unit.name,
        "check_out": check_out,
        "nights": (check_out - check_in).days,
        "stay_length": length,
        "price_period": config.price_period,
        "nightly_rate_paise": unit.nightly_rate_paise,
        "total_quote_paise": length * unit.nightly_rate_paise,
        "max_guests": unit.max_guests,
        "booking_mode": config.booking_mode,
        "min_stay_nights": prop.min_stay_nights,
    }


def respond_enquiry(
    *, enquiry: StayEnquiry, host: Any, response: str, decline: bool = False
) -> StayEnquiry:
    """Host replies, or marks the enquiry "Not available" (``decline``, note optional)."""
    _require_stay_capability(host)
    if enquiry.property.host_id != host.id:
        raise PermissionError("Not your enquiry.")
    open_statuses = (
        (StayEnquiry.Status.SUBMITTED, StayEnquiry.Status.RESPONDED)
        if decline
        else (StayEnquiry.Status.SUBMITTED,)
    )
    if enquiry.status not in open_statuses:
        raise StayStateError("Enquiry is not awaiting a response.")
    response = (response or "").strip()
    if not response and not decline:
        raise StayStateError("A response message is required.")
    enquiry.host_response = response
    enquiry.responded_at = timezone.now()
    enquiry.status = StayEnquiry.Status.DECLINED if decline else StayEnquiry.Status.RESPONDED
    enquiry.save(update_fields=("host_response", "responded_at", "status", "updated_at"))

    if decline:
        _notify_enquiry(
            enquiry,
            to_host=False,
            template_code="stay_enquiry_declined",
            purpose="stay.enquiry.declined",
            context={"host_note": f" {response}" if response else ""},
        )
    elif enquiry.customer_id:
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
    sort: str = "newest",
    limit: int | None = None,
    offset: int = 0,
) -> models.QuerySet[Property]:
    """Properties a guest can see: approved, live, with a bookable room, host still approved.

    Every room-level filter is applied to the *same* room through one ``Exists`` subquery, so
    "2 sharing under ₹1,000" cannot be satisfied by one room that shares and another that is
    cheap. Guests are only ever shown active rooms.
    """
    rooms = Unit.objects.filter(property=models.OuterRef("pk"), is_active=True)
    if sharing_count is not None:
        rooms = rooms.filter(sharing_count=sharing_count)
    if min_price_paise is not None:
        rooms = rooms.filter(nightly_rate_paise__gte=min_price_paise)
    if max_price_paise is not None:
        rooms = rooms.filter(nightly_rate_paise__lte=max_price_paise)
    # No per-date "sold out" filter: stays are arranged by phone, and the host keeps a room
    # type out of search by marking it full (inactive) or pausing the property.

    host_capability = PartnerCapability.objects.filter(
        partner=models.OuterRef("host"),
        archetype="A9_STAY",
        status=PartnerCapability.Status.APPROVED,
    )
    host_application = PartnerApplication.objects.filter(
        partner=models.OuterRef("host"),
        status=PartnerApplication.Status.APPROVED,
        track=PartnerApplication.Track.STAY_HOST,
    )
    host_approved = models.Exists(host_capability) | models.Exists(host_application)
    qs = (
        Property.objects.filter(
            moderation_status=Property.ModerationStatus.APPROVED,
            listing_status=Property.ListingStatus.LIVE,
        )
        .filter(models.Exists(rooms), host_approved)
        .prefetch_related(
            models.Prefetch(
                "units",
                queryset=Unit.objects.filter(is_active=True).prefetch_related(
                    "media", "looks__media", "rooms"
                ),
            ),
            "media",
            "reviews",
            "variant__a9_configurations",
        )
        .select_related("host", "variant__service__subcategory")
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
    # The category schemas store these as text ("AC", "Food included"); older rows and room
    # attributes may hold booleans. Titles and descriptions are never searched for them: "ac"
    # matches "Palace", and "Non AC" contains "AC".
    if has_ac is True:
        qs = qs.filter(
            models.Q(structured_fields__ac__in=_AC_YES)
            | models.Exists(rooms.filter(attributes__ac__in=_AC_YES))
        )
    if food_included is True:
        qs = qs.filter(
            models.Q(structured_fields__food__in=_FOOD_YES)
            | models.Exists(rooms.filter(attributes__food__in=_FOOD_YES))
        )
    if sort in ("price_asc", "price_desc"):
        cheapest = (
            Unit.objects.filter(property=models.OuterRef("pk"), is_active=True)
            .order_by("nightly_rate_paise")
            .values("nightly_rate_paise")[:1]
        )
        price = models.F("sort_price")
        qs = qs.annotate(sort_price=models.Subquery(cheapest)).order_by(
            price.asc(nulls_last=True) if sort == "price_asc" else price.desc(nulls_last=True),
            "-created_at",
            "-id",
        )
    elif sort == "rating_desc":
        average = (
            StayReview.objects.filter(property=models.OuterRef("pk"))
            .order_by()
            .values("property")
            .annotate(avg=models.Avg("rating"))
            .values("avg")
        )
        qs = qs.annotate(sort_rating=models.Subquery(average)).order_by(
            models.F("sort_rating").desc(nulls_last=True), "-created_at", "-id"
        )
    else:
        qs = qs.order_by("-created_at", "-id")
    # Every sort ends in `id`: browse pages by offset, and rows created in the same instant (a
    # bulk import) would otherwise swap places between requests and repeat or vanish.

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

    unit = _resolve_bookable_unit(prop=prop, unit_id=unit_id)
    _enforce_guest_count(unit=unit, guest_count=guest_count)
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
def host_cancel_reservation(
    *, reservation: StayReservation, host: Any, reason: str
) -> StayReservation:
    """The host cancels a paid stay before check-in. The guest always gets a full refund.

    A reason is required: it is the only explanation the guest receives.
    """
    _require_stay_capability(host)
    if reservation.property.host_id != host.id:
        raise PermissionError("Not your reservation.")
    reason = (reason or "").strip()
    if not reason:
        raise StayStateError("Tell the guest why you are cancelling.", code="reason_required")
    reservation = (
        StayReservation.objects.select_for_update()
        .select_related("unit_reservation", "payment_attempt")
        .get(id=reservation.id)
    )
    if reservation.status not in (
        StayReservation.Status.HELD,
        StayReservation.Status.PAYMENT_PENDING,
        StayReservation.Status.CONFIRMED,
    ):
        raise StayStateError("Only a booking that has not started can be cancelled.")

    attempt = reservation.payment_attempt
    if attempt is not None and attempt.status in PAYMENT_FINAL_STATES:
        _request_automatic_refund(attempt=attempt, reason_code="host_cancelled_stay_reservation")
    elif (
        attempt is not None
        and reservation.status == StayReservation.Status.CONFIRMED
        and attempt.status != PaymentAttempt.Status.FAILED
    ):
        raise StayStateError(
            "The guest's payment is still settling, so a refund cannot be started yet. "
            "Try again shortly."
        )

    reservation.status = StayReservation.Status.CANCELLED
    reservation.cancelled_at = timezone.now()
    reservation.cancellation_reason = f"Cancelled by host: {reason}"[:240]
    reservation.save(update_fields=("status", "cancelled_at", "cancellation_reason", "updated_at"))
    _release_unit_hold(reservation)
    return reservation


@transaction.atomic
def mark_no_show(*, reservation: StayReservation, host: Any) -> StayReservation:
    """The guest never arrived. Frees the room for the remaining nights; no refund is started."""
    _require_stay_capability(host)
    if reservation.property.host_id != host.id:
        raise PermissionError("Not your reservation.")
    reservation = (
        StayReservation.objects.select_for_update()
        .select_related("unit_reservation")
        .get(id=reservation.id)
    )
    if reservation.status != StayReservation.Status.CONFIRMED:
        raise StayStateError("Only a confirmed booking can be marked as a no-show.")
    if timezone.localdate() < reservation.check_in:
        raise StayStateError(
            "A guest can only be marked as a no-show from the check-in date.",
            code="no_show_too_early",
        )
    reservation.status = StayReservation.Status.NO_SHOW
    reservation.save(update_fields=("status", "updated_at"))
    _release_unit_hold(reservation)
    return reservation


def _release_unit_hold(reservation: StayReservation) -> None:
    unit_res = reservation.unit_reservation
    if unit_res is not None and unit_res.status != UnitReservation.Status.RELEASED:
        unit_res.status = UnitReservation.Status.RELEASED
        unit_res.save(update_fields=("status", "updated_at"))


@transaction.atomic
def check_in_reservation(*, reservation: Any, host: Any) -> Any:
    _require_stay_capability(host)
    if reservation.property.host_id != host.id:
        raise PermissionError("Not your reservation.")
    if reservation.status != StayReservation.Status.CONFIRMED:
        raise StayStateError("Reservation is not confirmed.")
    if timezone.localdate() < reservation.check_in:
        raise StayStateError(
            f"Guests can be checked in from {reservation.check_in:%d %b %Y}.",
            code="check_in_too_early",
        )

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


#: What Operations may cancel with a full refund: nothing a guest has started staying in.
OPS_CANCELLABLE_RESERVATION_STATUSES = frozenset(
    {
        StayReservation.Status.HELD,
        StayReservation.Status.PAYMENT_PENDING,
        StayReservation.Status.CONFIRMED,
    }
)


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
    # Same rule the guest has: a full refund is only honest before anyone has stayed. After
    # check-in the money is for nights already given, and that is a refund decision, not a cancel.
    if reservation.status not in OPS_CANCELLABLE_RESERVATION_STATUSES:
        raise StayStateError("Reservation cannot be cancelled after check-in. Contact support.")

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


#: Photos per room type. The property's own gallery holds the building and common areas.
MAX_UNIT_PHOTOS = 8


def add_unit_media(*, unit: Unit, host: Any, url: str, look: RoomLook | None = None) -> UnitMedia:
    """Attach a photo this partner uploaded to one look of their room type.

    Without ``look`` the photo goes to the type's first look, which is what the one-look
    screens (and older clients) mean by "this room type's photos".
    """
    _require_stay_capability(host)
    if unit.property.host_id != host.id:
        raise PermissionError("Not your property.")
    look = look or first_look(unit)
    if look.unit_id != unit.id:
        raise StayStateError("That look belongs to another room type.", code="look_mismatch")
    cleaned_url = url.strip()
    if not cleaned_url:
        raise StayStateError("Image URL is required.")
    if not partner_owns_stay_photo(partner=host, url=cleaned_url):
        raise StayStateError(
            "Upload photos from this form instead of pasting links.",
            code="photo_not_uploaded",
        )
    count = look.media.count()
    if count >= MAX_UNIT_PHOTOS:
        raise StayStateError(
            f"A look can have up to {MAX_UNIT_PHOTOS} photos.", code="too_many_photos"
        )
    return UnitMedia.objects.create(unit=unit, look=look, url=cleaned_url, display_order=count)


def remove_unit_media(*, unit: Unit, host: Any, media_id: UUID | str) -> None:
    _require_stay_capability(host)
    if unit.property.host_id != host.id:
        raise PermissionError("Not your property.")
    deleted, _ = UnitMedia.objects.filter(id=_as_uuid(media_id), unit=unit).delete()
    if not deleted:
        raise StayStateError("Photo not found on this room type.", code="media_not_found")


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
        prop.public_state == "PUBLISHED"
        and not prop.media.exclude(id=media.id).exists()
        and not UnitMedia.objects.filter(unit__property=prop).exists()
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


# --- numbered rooms -------------------------------------------------------------------------
#
# Guests see room *types* ("Single room · ₹8,500/month · 2 available"). The host manages each
# physical room under a type by its own number and marks it Available, Not available or Booked.
# The type's ``quantity``, ``available_count`` and ``is_active`` always follow its rooms, so a
# booked-out type drops out of guest search without anyone touching it.

ROOM_NUMBER_MAX_LENGTH = 40
MAX_ROOMS_PER_TYPE = 500


def _clean_room_number(number: str) -> str:
    cleaned = " ".join((number or "").split())
    if not cleaned:
        raise StayStateError(
            "Give the room a number or name, for example 101.", code="room_number_required"
        )
    if len(cleaned) > ROOM_NUMBER_MAX_LENGTH:
        raise StayStateError(
            f"Keep room numbers under {ROOM_NUMBER_MAX_LENGTH} characters.",
            code="room_number_too_long",
        )
    return cleaned


def _assert_room_number_free(
    *, prop: Property, number: str, exclude_room_id: UUID | None = None
) -> None:
    taken = Room.objects.filter(property=prop, number__iexact=number)
    if exclude_room_id is not None:
        taken = taken.exclude(id=exclude_room_id)
    if taken.exists():
        raise StayStateError(
            f"{number} is already used in this property.", code="room_number_taken"
        )


def _clean_new_room_numbers(*, prop: Property, numbers: list[str]) -> list[str]:
    """Clean, de-duplicate (ignoring case) and check numbers are not already used here."""
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in numbers:
        number = _clean_room_number(raw)
        if number.lower() in seen:
            raise StayStateError(f"{number} is listed twice.", code="room_number_taken")
        seen.add(number.lower())
        _assert_room_number_free(prop=prop, number=number)
        cleaned.append(number)
    if len(cleaned) > MAX_ROOMS_PER_TYPE:
        raise StayStateError("That is too many rooms for one type.", code="quantity_invalid")
    return cleaned


def _next_room_numbers(prop: Property, count: int) -> list[str]:
    """Placeholder numbers ("Room 4", "Room 5") not yet used in the property."""
    taken = {n.lower() for n in Room.objects.filter(property=prop).values_list("number", flat=True)}
    result: list[str] = []
    candidate = 1
    while len(result) < count:
        number = f"Room {candidate}"
        if number.lower() not in taken:
            result.append(number)
            taken.add(number.lower())
        candidate += 1
    return result


def _create_rooms(
    *,
    unit: Unit,
    numbers: list[str],
    status: str = Room.Status.AVAILABLE,
    look: RoomLook | None = None,
) -> list[Room]:
    look = look or first_look(unit)
    return Room.objects.bulk_create(
        [
            Room(property_id=unit.property_id, unit=unit, look=look, number=number, status=status)
            for number in numbers
        ]
    )


def sync_unit_rooms(unit: Unit) -> Unit:
    """Make the room type's counts and switch match its numbered rooms."""
    counts = Room.objects.filter(unit=unit).aggregate(
        total=models.Count("id"),
        available=models.Count("id", filter=models.Q(status=Room.Status.AVAILABLE)),
    )
    total = int(counts["total"] or 0)
    available = int(counts["available"] or 0)
    # A type always keeps at least one room (``delete_room`` refuses the last one).
    unit.quantity = max(total, 1)
    unit.available_count = available
    unit.is_active = available > 0
    unit.save(update_fields=("quantity", "available_count", "is_active", "updated_at"))
    return unit


def _resize_unit_rooms(*, unit: Unit, quantity: int) -> None:
    """Add placeholder rooms, or remove rooms that are not booked (newest first)."""
    Unit.objects.select_for_update().filter(id=unit.id).first()
    rooms = list(Room.objects.select_for_update().filter(unit=unit).order_by("-created_at"))
    if quantity > len(rooms):
        status = Room.Status.AVAILABLE if unit.is_active else Room.Status.UNAVAILABLE
        _create_rooms(
            unit=unit,
            numbers=_next_room_numbers(unit.property, quantity - len(rooms)),
            status=status,
        )
        return
    surplus = len(rooms) - quantity
    removable = [room for room in rooms if room.status != Room.Status.BOOKED][:surplus]
    if len(removable) < surplus:
        raise StayStateError(
            "Some of these rooms are booked. Mark them available before removing them.",
            code="quantity_below_booked",
        )
    Room.objects.filter(id__in=[room.id for room in removable]).delete()


def _switch_unit_rooms(*, unit: Unit, on: bool) -> None:
    """Switch every room of the type that is not booked on or off."""
    Unit.objects.select_for_update().filter(id=unit.id).first()
    source, target = (
        (Room.Status.UNAVAILABLE, Room.Status.AVAILABLE)
        if on
        else (Room.Status.AVAILABLE, Room.Status.UNAVAILABLE)
    )
    Room.objects.filter(unit=unit, status=source).update(status=target, updated_at=timezone.now())


def _own_room(*, room: Room, host: Any) -> None:
    _require_stay_capability(host)
    if room.property.host_id != host.id:
        raise PermissionError("Not your property.")


def _locked_room(room: Room) -> Room:
    # Lock the type first, then the room, so every change to a type's counts queues in one order.
    Unit.objects.select_for_update().filter(id=room.unit_id).first()
    return Room.objects.select_for_update().select_related("property", "unit").get(id=room.id)


def _book_room(
    *,
    room: Room,
    occupant_name: str = "",
    enquiry: StayEnquiry | None = None,
    visit: StayVisit | None = None,
) -> Room:
    room.status = Room.Status.BOOKED
    room.occupant_name = occupant_name.strip()[:120]
    room.booked_enquiry = enquiry
    room.booked_visit = visit
    room.booked_at = timezone.now()
    room.save(
        update_fields=(
            "status",
            "occupant_name",
            "booked_enquiry",
            "booked_visit",
            "booked_at",
            "updated_at",
        )
    )
    sync_unit_rooms(room.unit)
    return room


def _free_room(room: Room) -> Room:
    room.status = Room.Status.AVAILABLE
    room.occupant_name = ""
    room.booked_enquiry = None
    room.booked_visit = None
    room.booked_at = None
    room.save(
        update_fields=(
            "status",
            "occupant_name",
            "booked_enquiry",
            "booked_visit",
            "booked_at",
            "updated_at",
        )
    )
    sync_unit_rooms(room.unit)
    return room


@transaction.atomic
def add_room(
    *,
    unit: Unit,
    host: Any,
    number: str,
    available: bool = True,
    look_id: UUID | str | None = None,
    new_look_name: str | None = None,
    new_look_image_urls: list[str] | None = None,
) -> Room:
    """The host adds one numbered room to a room type.

    The room either shares an existing look's photos (``look_id``; the type's first look when
    neither is given) or starts a new look with new photos (``new_look_name`` and
    ``new_look_image_urls``), which guests will see as its own card.
    """
    _require_stay_capability(host)
    if unit.property.host_id != host.id:
        raise PermissionError("Not your property.")
    Unit.objects.select_for_update().filter(id=unit.id).first()
    if Room.objects.filter(unit=unit).count() >= MAX_ROOMS_PER_TYPE:
        raise StayStateError("That is too many rooms for one type.", code="quantity_invalid")
    cleaned = _clean_room_number(number)
    _assert_room_number_free(prop=unit.property, number=cleaned)
    if new_look_name is not None:
        look = create_look(
            unit=unit, host=host, name=new_look_name, image_urls=new_look_image_urls or []
        )
    elif look_id is not None:
        look = _look_of(unit=unit, look_id=look_id)
    else:
        look = first_look(unit)
    room = Room.objects.create(
        property_id=unit.property_id,
        unit=unit,
        look=look,
        number=cleaned,
        status=Room.Status.AVAILABLE if available else Room.Status.UNAVAILABLE,
    )
    sync_unit_rooms(unit)
    return room


# --- looks ----------------------------------------------------------------------------------

LOOK_NAME_MAX_LENGTH = 60


def first_look(unit: Unit) -> RoomLook:
    """The type's first look, created when the type has none yet (rows made before looks)."""
    look = RoomLook.objects.filter(unit=unit).order_by("display_order", "created_at").first()
    if look is None:
        look = RoomLook.objects.create(unit=unit, name="", display_order=0)
    return look


def _look_of(*, unit: Unit, look_id: UUID | str) -> RoomLook:
    look = RoomLook.objects.filter(id=_as_uuid(look_id), unit=unit).first()
    if look is None:
        raise StayStateError("That look isn't part of this room type.", code="look_mismatch")
    return look


def _clean_look_name(*, unit: Unit, name: str, exclude_id: UUID | None = None) -> str:
    cleaned = " ".join((name or "").split())
    if len(cleaned) > LOOK_NAME_MAX_LENGTH:
        raise StayStateError(
            f"Keep the look's name under {LOOK_NAME_MAX_LENGTH} characters.",
            code="look_name_too_long",
        )
    if cleaned:
        clash = RoomLook.objects.filter(unit=unit, name__iexact=cleaned)
        if exclude_id is not None:
            clash = clash.exclude(id=exclude_id)
        if clash.exists():
            raise StayStateError(
                f"This room type already has a look called {cleaned}.", code="look_name_taken"
            )
    return cleaned


def _own_unit(*, unit: Unit, host: Any) -> None:
    _require_stay_capability(host)
    if unit.property.host_id != host.id:
        raise PermissionError("Not your property.")


@transaction.atomic
def create_look(
    *, unit: Unit, host: Any, name: str, image_urls: list[str] | None = None
) -> RoomLook:
    """A new look for a room type, with its own photos.

    Every look after the first must be named: guests see "1 BHK" and "1 BHK · With balcony",
    and two cards both called "1 BHK" would leave them guessing.
    """
    _own_unit(unit=unit, host=host)
    Unit.objects.select_for_update().filter(id=unit.id).first()
    cleaned = _clean_look_name(unit=unit, name=name)
    existing = RoomLook.objects.filter(unit=unit).count()
    if existing == 0:
        # A type made before looks: its rooms and photos form the first look.
        first_look(unit)
        existing = 1
    if not cleaned:
        raise StayStateError(
            "Name this look so guests can tell it apart, for example With balcony.",
            code="look_name_required",
        )
    look = RoomLook.objects.create(unit=unit, name=cleaned, display_order=existing)
    for url in image_urls or []:
        add_unit_media(unit=unit, host=host, url=url, look=look)
    return look


@transaction.atomic
def rename_look(*, look: RoomLook, host: Any, name: str) -> RoomLook:
    unit = look.unit
    _own_unit(unit=unit, host=host)
    cleaned = _clean_look_name(unit=unit, name=name, exclude_id=look.id)
    if not cleaned and first_look(unit).id != look.id:
        raise StayStateError(
            "Name this look so guests can tell it apart, for example With balcony.",
            code="look_name_required",
        )
    look.name = cleaned
    look.save(update_fields=("name",))
    return look


@transaction.atomic
def delete_look(*, look: RoomLook, host: Any) -> None:
    """Remove an empty look and its photos. Move its rooms to another look first."""
    unit = look.unit
    _own_unit(unit=unit, host=host)
    Unit.objects.select_for_update().filter(id=unit.id).first()
    if Room.objects.filter(look=look).exists():
        raise StayStateError(
            "Move this look's rooms to another look before removing it.", code="look_has_rooms"
        )
    if RoomLook.objects.filter(unit=unit).count() <= 1:
        raise StayStateError("A room type needs at least one look.", code="last_look_of_type")
    look.delete()
    # The new first look may still be named; that is allowed. Renumber to keep order dense.
    for index, rest in enumerate(RoomLook.objects.filter(unit=unit).order_by("display_order")):
        if rest.display_order != index:
            rest.display_order = index
            rest.save(update_fields=("display_order",))


@transaction.atomic
def move_room(*, room: Room, host: Any, look_id: UUID | str) -> Room:
    """Give a room another look of its own type. Its status and booking are unchanged."""
    _own_room(room=room, host=host)
    room = _locked_room(room)
    room.look = _look_of(unit=room.unit, look_id=look_id)
    room.save(update_fields=("look", "updated_at"))
    return room


def look_display_name(*, unit: Unit, look: RoomLook | None) -> str:
    """ "1 BHK" for the first or only look, "1 BHK · With balcony" for a named other look."""
    if look is None or not look.name:
        return unit.name
    return f"{unit.name} · {look.name}"


def resolve_look(*, unit: Unit, look_id: UUID | str | None) -> RoomLook | None:
    """The guest's chosen look, checked to belong to the room type. ``None`` if not given."""
    if look_id is None:
        return None
    return _look_of(unit=unit, look_id=look_id)


@transaction.atomic
def rename_room(*, room: Room, host: Any, number: str) -> Room:
    _own_room(room=room, host=host)
    room = _locked_room(room)
    cleaned = _clean_room_number(number)
    _assert_room_number_free(prop=room.property, number=cleaned, exclude_room_id=room.id)
    room.number = cleaned
    room.save(update_fields=("number", "updated_at"))
    return room


@transaction.atomic
def set_room_available(*, room: Room, host: Any, available: bool) -> Room:
    """The ON / OFF switch. Off hides the room from guests; a booked room uses ``release_room``."""
    _own_room(room=room, host=host)
    room = _locked_room(room)
    if room.status == Room.Status.BOOKED:
        raise StayStateError(
            f"{room.number} is booked. Mark it available when the guest moves out.",
            code="room_booked",
        )
    room.status = Room.Status.AVAILABLE if available else Room.Status.UNAVAILABLE
    room.save(update_fields=("status", "updated_at"))
    sync_unit_rooms(room.unit)
    return room


@transaction.atomic
def mark_room_booked(
    *,
    room: Room,
    host: Any,
    occupant_name: str = "",
    visit: StayVisit | None = None,
) -> Room:
    """The host confirms a booking agreed directly with a guest (a walk-in, or after a visit).

    Bookings that came through an enquiry go through ``confirm_enquiry(room_id=...)`` instead,
    so the guest is told and the enquiry is closed as booked.
    """
    _own_room(room=room, host=host)
    room = _locked_room(room)
    if room.status == Room.Status.BOOKED:
        raise StayStateError(f"{room.number} is already booked.", code="room_already_booked")
    if visit is not None:
        if visit.property_id != room.property_id:
            raise StayStateError("This visit is for another property.", code="visit_mismatch")
        if not occupant_name:
            occupant_name = str(getattr(visit.customer, "full_name", "") or "")
    return _book_room(room=room, occupant_name=occupant_name, visit=visit)


@transaction.atomic
def release_room(*, room: Room, host: Any) -> Room:
    """The guest moved out (or the booking fell through): the room is available again."""
    _own_room(room=room, host=host)
    room = _locked_room(room)
    if room.status != Room.Status.BOOKED:
        raise StayStateError(f"{room.number} is not booked.", code="room_not_booked")
    return _free_room(room)


@transaction.atomic
def delete_room(*, room: Room, host: Any) -> None:
    _own_room(room=room, host=host)
    room = _locked_room(room)
    if room.status == Room.Status.BOOKED:
        raise StayStateError(
            f"{room.number} is booked. Mark it available before removing it.",
            code="room_booked",
        )
    if Room.objects.filter(unit_id=room.unit_id).count() <= 1:
        raise StayStateError(
            "A room type needs at least one room. Switch it off instead.",
            code="last_room_of_type",
        )
    unit = room.unit
    room.delete()
    sync_unit_rooms(unit)


def host_stay_summary(*, host: Any) -> dict[str, Any]:
    """The numbers at the top of the host's stays dashboard. Archived properties are left out."""
    today = timezone.localdate()
    properties = Property.objects.filter(host=host).exclude(
        listing_status=Property.ListingStatus.ARCHIVED
    )
    rooms = Room.objects.filter(property__in=properties).aggregate(
        total=models.Count("id"),
        available=models.Count("id", filter=models.Q(status=Room.Status.AVAILABLE)),
        booked=models.Count("id", filter=models.Q(status=Room.Status.BOOKED)),
        unavailable=models.Count("id", filter=models.Q(status=Room.Status.UNAVAILABLE)),
    )
    reviews = StayReview.objects.filter(property__in=properties).aggregate(
        count=models.Count("id"), average=models.Avg("rating")
    )
    average = reviews["average"]
    return {
        "total_properties": properties.count(),
        "live_properties": properties.filter(
            moderation_status=Property.ModerationStatus.APPROVED,
            listing_status=Property.ListingStatus.LIVE,
        ).count(),
        "total_rooms": int(rooms["total"] or 0),
        "available_rooms": int(rooms["available"] or 0),
        "booked_rooms": int(rooms["booked"] or 0),
        "unavailable_rooms": int(rooms["unavailable"] or 0),
        "review_count": int(reviews["count"] or 0),
        "average_rating": round(float(average), 1) if average is not None else None,
        "new_enquiries": StayEnquiry.objects.filter(
            property__host=host, status=StayEnquiry.Status.SUBMITTED
        ).count(),
        "pending_visits": StayVisit.objects.filter(
            property__host=host, status=StayVisit.Status.REQUESTED, visit_date__gte=today
        ).count(),
        "upcoming_visits": StayVisit.objects.filter(
            property__host=host, status=StayVisit.Status.ACCEPTED, visit_date__gte=today
        ).count(),
    }


def active_stay_subscription(host: Any) -> StaySubscription | None:
    now = timezone.now()
    return (
        StaySubscription.objects.select_related("plan")
        .filter(
            host=host,
            status__in=(StaySubscription.Status.ACTIVE, StaySubscription.Status.GRACE),
            starts_at__lte=now,
        )
        .filter(models.Q(ends_at__gt=now) | models.Q(grace_ends_at__gt=now))
        .order_by("-ends_at")
        .first()
    )


_active_stay_subscription = active_stay_subscription


def assert_stay_subscription_capacity(prop: Property) -> None:
    """Enforce plan limits on live properties if subscription plans are defined."""
    if not StaySubscriptionPlan.objects.filter(is_active=True).exists():
        return
    sub = _active_stay_subscription(prop.host)
    if sub is None:
        raise StayPlanCapError(
            "An active subscription plan is required to publish a property.",
            code="subscription_required",
        )
    max_props = sub.plan.max_properties
    if max_props > 0:
        live_count = (
            Property.objects.filter(
                host=prop.host,
                moderation_status=Property.ModerationStatus.APPROVED,
                listing_status=Property.ListingStatus.LIVE,
            )
            .exclude(id=prop.id)
            .count()
        )
        if live_count >= max_props:
            raise StayPlanCapError(
                f"Your {sub.plan.name} allows at most {max_props} live properties. "
                "Upgrade your plan to publish more.",
                code="plan_property_limit_reached",
            )


@transaction.atomic
def start_stay_subscription_purchase(
    *, host: PartnerProfile, plan: StaySubscriptionPlan, idempotency_key: str
) -> StaySubscription:
    _require_stay_capability(host)
    existing = StaySubscription.objects.filter(
        host=host,
        plan=plan,
        status=StaySubscription.Status.PENDING_ACTIVATION,
        payment_attempt__status__in=(
            PaymentAttempt.Status.PROVIDER_PENDING,
            PaymentAttempt.Status.CREATED,
            PaymentAttempt.Status.AUTHORIZED,
        ),
    ).first()
    if existing is not None:
        return existing
    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.A9_STAY_SUBSCRIPTION,
        amount_paise=plan.price_paise,
        idempotency_key=idempotency_key,
    )
    return StaySubscription.objects.create(host=host, plan=plan, payment_attempt=attempt)


@transaction.atomic
def complete_stay_subscription_payment(*, payment_attempt_id: UUID | str) -> None:
    sub = (
        StaySubscription.objects.select_for_update()
        .select_related("plan")
        .filter(payment_attempt_id=_as_uuid(payment_attempt_id))
        .first()
    )
    if sub is None or sub.status != StaySubscription.Status.PENDING_ACTIVATION:
        return
    now = timezone.now()
    StaySubscription.objects.filter(
        host_id=sub.host_id,
        status__in=(StaySubscription.Status.ACTIVE, StaySubscription.Status.GRACE),
    ).exclude(id=sub.id).update(
        status=StaySubscription.Status.EXPIRED,
        updated_at=now,
    )
    sub.status = StaySubscription.Status.ACTIVE
    sub.starts_at = now
    sub.ends_at = now + timedelta(days=sub.plan.duration_days)
    sub.grace_ends_at = sub.ends_at + timedelta(days=3)
    sub.save(update_fields=("status", "starts_at", "ends_at", "grace_ends_at", "updated_at"))


@transaction.atomic
def expire_stay_subscriptions() -> int:
    now = timezone.now()
    # 1. ACTIVE -> GRACE when ends_at passes
    grace_subs = list(
        StaySubscription.objects.select_for_update().filter(
            status=StaySubscription.Status.ACTIVE,
            ends_at__lte=now,
        )
    )
    for sub in grace_subs:
        sub.status = StaySubscription.Status.GRACE
        if not sub.grace_ends_at:
            sub.grace_ends_at = (sub.ends_at or now) + timedelta(days=3)
        sub.save(update_fields=("status", "grace_ends_at", "updated_at"))

    # 2. GRACE -> EXPIRED when grace_ends_at passes
    expired_subs = list(
        StaySubscription.objects.select_for_update().filter(
            status=StaySubscription.Status.GRACE,
            grace_ends_at__lte=now,
        )
    )
    for sub in expired_subs:
        sub.status = StaySubscription.Status.EXPIRED
        sub.save(update_fields=("status", "updated_at"))
        Property.objects.filter(
            host_id=sub.host_id,
            listing_status=Property.ListingStatus.LIVE,
        ).update(
            listing_status=Property.ListingStatus.PAUSED,
            updated_at=now,
        )
    return len(grace_subs) + len(expired_subs)
