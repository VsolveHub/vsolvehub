from datetime import date
from decimal import Decimal
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import A9VariantConfiguration
from apps.locations.pins import area_of, combine_pin, latitude_field, longitude_field
from apps.stay.models import (
    Property,
    PropertyMedia,
    Room,
    RoomLook,
    StayEnquiry,
    StayReservation,
    StayReview,
    StaySubscription,
    StaySubscriptionPlan,
    StayVisit,
    Unit,
    UnitMedia,
    VisitSlot,
)


class UnitMediaSerializer(serializers.ModelSerializer[UnitMedia]):
    class Meta:
        model = UnitMedia
        fields = ("id", "url", "display_order")


class RoomLookSerializer(serializers.Serializer[dict[str, Any]]):
    """One look of a room type, as guests see it: its photos and how many of its rooms are
    available. Never the room numbers."""

    id = serializers.UUIDField()
    #: The host's label. Blank on a type's first look.
    name = serializers.CharField(allow_blank=True)
    #: "1 BHK" or "1 BHK · With balcony": the card's title.
    display_name = serializers.CharField()
    display_order = serializers.IntegerField()
    media = UnitMediaSerializer(many=True)
    available_count = serializers.IntegerField()
    room_count = serializers.IntegerField()


def _unit_and_look_name(unit: Unit | None, look: RoomLook | None, *, fallback: str) -> str:
    from apps.stay.services import look_display_name  # noqa: PLC0415

    if unit is None:
        return fallback
    return look_display_name(unit=unit, look=look)


def unit_looks(unit: Unit) -> list[dict[str, Any]]:
    """The type's looks with per-look room counts. Reads prefetched ``looks``/``rooms`` when the
    caller loaded them, so a list of properties costs no query per room type."""
    from apps.stay.services import look_display_name  # noqa: PLC0415

    rooms = list(unit.rooms.all())
    out = []
    for look in sorted(unit.looks.all(), key=lambda lk: (lk.display_order, lk.created_at)):
        mine = [r for r in rooms if r.look_id == look.id]
        out.append(
            {
                "id": look.id,
                "name": look.name,
                "display_name": look_display_name(unit=unit, look=look),
                "display_order": look.display_order,
                "media": sorted(look.media.all(), key=lambda m: (m.display_order, m.created_at)),
                "available_count": sum(1 for r in mine if r.status == Room.Status.AVAILABLE),
                "room_count": len(mine),
            }
        )
    return out


class UnitSerializer(serializers.ModelSerializer[Unit]):
    #: Photos of this room type; the property gallery shows the building.
    media = UnitMediaSerializer(many=True, read_only=True)
    #: The type's looks: one guest card each. A type made before looks has one.
    looks = serializers.SerializerMethodField()

    @extend_schema_field(RoomLookSerializer(many=True))
    def get_looks(self, obj: Unit) -> list[dict[str, Any]]:
        return [dict(RoomLookSerializer(look).data) for look in unit_looks(obj)]

    class Meta:
        model = Unit
        fields: tuple[str, ...] = (
            "id",
            "media",
            "looks",
            "name",
            "sharing_count",
            "quantity",
            #: Rooms of this type a guest can ask for right now.
            "available_count",
            "max_guests",
            "nightly_rate_paise",
            "is_active",
            "attributes",
        )


class RoomSerializer(serializers.ModelSerializer[Room]):
    """One numbered room, as the host manages it. Guests never see room numbers."""

    class Meta:
        model = Room
        fields = (
            "id",
            "look",
            "number",
            "status",
            "occupant_name",
            "booked_enquiry",
            "booked_visit",
            "booked_at",
        )


class PartnerUnitSerializer(UnitSerializer):
    """The host's view of a room type: its numbered rooms, and bookings that still have nights
    ahead."""

    upcoming_booking_count = serializers.SerializerMethodField()
    rooms = RoomSerializer(many=True, read_only=True)

    class Meta(UnitSerializer.Meta):
        fields = (*UnitSerializer.Meta.fields, "upcoming_booking_count", "rooms")

    def get_upcoming_booking_count(self, obj: Unit) -> int:
        from apps.stay.services import upcoming_booking_count  # noqa: PLC0415

        return upcoming_booking_count(unit=obj)


class PropertyMediaSerializer(serializers.ModelSerializer[PropertyMedia]):
    class Meta:
        model = PropertyMedia
        fields = ("id", "url", "caption", "display_order", "created_at")


class StayReviewSerializer(serializers.ModelSerializer[StayReview]):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)

    class Meta:
        model = StayReview
        fields = ("id", "rating", "comment", "image_urls", "customer_name", "created_at")


def _active_config(obj: Property) -> A9VariantConfiguration | None:
    variant = obj.variant
    prefetch_cache = getattr(variant, "_prefetched_objects_cache", {})
    if "a9_configurations" in prefetch_cache:
        for cfg in variant.a9_configurations.all():
            if cfg.status == A9VariantConfiguration.Status.ACTIVE:
                return cfg
        return None
    return (
        A9VariantConfiguration.objects.filter(
            variant_id=obj.variant_id, status=A9VariantConfiguration.Status.ACTIVE
        )
        .order_by("-version")
        .first()
    )


def _extract_booking_mode(obj: Property) -> str:
    config = _active_config(obj)
    if config is None:
        return str(A9VariantConfiguration.BookingMode.ENQUIRY)
    return str(config.booking_mode)


def _extract_price_period(obj: Property) -> str:
    """What room rates are quoted per: ``NIGHT`` or ``MONTH``."""
    config = _active_config(obj)
    if config is None:
        return str(A9VariantConfiguration.PricePeriod.MONTH)
    return str(config.price_period)


class StayAmenitySerializer(serializers.Serializer[dict[str, object]]):
    #: Stable key ("wifi", "ac") the app maps to an icon; ``label`` is what guests read.
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]


class StayHighlightSerializer(serializers.Serializer[dict[str, object]]):
    label = serializers.CharField()  # type: ignore[assignment]
    value = serializers.CharField()


def _extract_amenities(obj: Property) -> list[dict[str, str]]:
    from apps.stay.services import property_amenities  # noqa: PLC0415

    return property_amenities(obj)


def _extract_room_style(obj: Property) -> str:
    """``SHARED`` (beds), ``PRIVATE`` (whole room) or ``MIXED`` — see ``ROOM_STYLE_*``."""
    from apps.stay.services import room_style_for_property  # noqa: PLC0415

    return room_style_for_property(obj)


class PropertySummarySerializer(serializers.ModelSerializer[Property]):
    public_state = serializers.CharField(read_only=True)
    host_name = serializers.CharField(source="host.display_name", read_only=True)
    media = PropertyMediaSerializer(many=True, read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    booking_mode = serializers.SerializerMethodField()
    price_period = serializers.SerializerMethodField()
    room_style = serializers.SerializerMethodField()
    amenities = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = (
            "id",
            "slug",
            "title",
            "description",
            "location_text",
            "moderation_status",
            "public_state",
            "host_name",
            "variant",
            "structured_fields",
            "min_stay_nights",
            "media",
            "units",
            "booking_mode",
            "price_period",
            "room_style",
            "amenities",
            "review_count",
            "average_rating",
            "created_at",
        )

    def get_booking_mode(self, obj: Property) -> str:
        return _extract_booking_mode(obj)

    def get_price_period(self, obj: Property) -> str:
        return _extract_price_period(obj)

    def get_room_style(self, obj: Property) -> str:
        return _extract_room_style(obj)

    @extend_schema_field(StayAmenitySerializer(many=True))
    def get_amenities(self, obj: Property) -> list[dict[str, str]]:
        return _extract_amenities(obj)

    def get_review_count(self, obj: Property) -> int:
        reviews = getattr(obj, "_prefetched_objects_cache", {}).get("reviews")
        if reviews is not None:
            return len(reviews)
        return obj.reviews.count()

    def get_average_rating(self, obj: Property) -> float | None:
        reviews = getattr(obj, "_prefetched_objects_cache", {}).get("reviews")
        items = list(reviews) if reviews is not None else list(obj.reviews.all())
        if not items:
            return None
        total = sum(int(r.rating) for r in items)
        return round(total / len(items), 1)


AREA_COORDINATE = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)


def _area_text(value: Decimal | None) -> str | None:
    area = area_of(value)
    return None if area is None else f"{area:.2f}"


class PropertySerializer(serializers.ModelSerializer[Property]):
    public_state = serializers.CharField(read_only=True)
    host_name = serializers.CharField(source="host.display_name", read_only=True)
    host_id = serializers.UUIDField(source="host.id", read_only=True)
    partner_id = serializers.UUIDField(source="host.id", read_only=True)
    host_phone = serializers.CharField(source="host.user.phone_number", read_only=True)
    media = PropertyMediaSerializer(many=True, read_only=True)
    reviews = StayReviewSerializer(many=True, read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    booking_mode = serializers.SerializerMethodField()
    price_period = serializers.SerializerMethodField()
    room_style = serializers.SerializerMethodField()
    amenities = serializers.SerializerMethodField()
    highlights = serializers.SerializerMethodField()
    #: True only for the signed-in guest with a confirmed stay here and no review yet.
    can_review = serializers.SerializerMethodField()
    #: Whether guests can "Schedule a visit": the host switched visits on and set slots.
    visits_offered = serializers.SerializerMethodField()
    #: The host's pin rounded to an area (about 1 km), for a map of where the property is.
    #: Null when the host has not pinned it. The exact pin is the host's only.
    area_latitude = serializers.SerializerMethodField()
    area_longitude = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields: tuple[str, ...] = (
            "id",
            "slug",
            "title",
            "description",
            "location_text",
            "moderation_status",
            "public_state",
            "host_id",
            "partner_id",
            "host_name",
            "host_phone",
            "variant",
            "structured_fields",
            "cancellation_policy_text",
            "house_rules",
            "min_stay_nights",
            "media",
            "reviews",
            "units",
            "booking_mode",
            "price_period",
            "room_style",
            "amenities",
            "highlights",
            "can_review",
            "visits_offered",
            "area_latitude",
            "area_longitude",
            "created_at",
        )

    def get_booking_mode(self, obj: Property) -> str:
        return _extract_booking_mode(obj)

    def get_price_period(self, obj: Property) -> str:
        return _extract_price_period(obj)

    def get_room_style(self, obj: Property) -> str:
        return _extract_room_style(obj)

    @extend_schema_field(StayAmenitySerializer(many=True))
    def get_amenities(self, obj: Property) -> list[dict[str, str]]:
        return _extract_amenities(obj)

    @extend_schema_field(StayHighlightSerializer(many=True))
    def get_highlights(self, obj: Property) -> list[dict[str, str]]:
        from apps.stay.services import property_highlights, split_stay_schema  # noqa: PLC0415

        config = _active_config(obj)
        property_schema, _room_schema, _names = split_stay_schema(
            config.property_schema if config else None
        )
        return property_highlights(obj, property_schema)

    def get_can_review(self, obj: Property) -> bool:
        from apps.stay.services import customer_can_review  # noqa: PLC0415

        request = self.context.get("request")
        return customer_can_review(customer=getattr(request, "user", None), prop=obj)

    @extend_schema_field(AREA_COORDINATE)
    def get_area_latitude(self, obj: Property) -> str | None:
        return _area_text(obj.latitude)

    @extend_schema_field(AREA_COORDINATE)
    def get_area_longitude(self, obj: Property) -> str | None:
        return _area_text(obj.longitude)

    def get_visits_offered(self, obj: Property) -> bool:
        from apps.stay.visits import visits_offered  # noqa: PLC0415

        return visits_offered(obj)


class StayVisitSlotSerializer(serializers.ModelSerializer[VisitSlot]):
    class Meta:
        model = VisitSlot
        fields = ("id", "weekday", "start_time", "end_time")


class PropertyPinFields(serializers.Serializer[dict[str, Any]]):
    """The host's map pin for the property.

    Send ``latitude`` and ``longitude`` together. Two nulls clear the pin; leaving both out of an
    edit keeps it. One without the other is a 400 (``pin_incomplete``). Guests only ever see it
    rounded to an area (``area_latitude`` / ``area_longitude``).
    """

    latitude = latitude_field()
    longitude = longitude_field()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        attrs = super().validate(attrs)
        combine_pin(attrs, latitude="latitude", longitude="longitude", into="pin")
        return attrs


class PartnerPropertySerializer(PropertySerializer):
    """The host's own view: every room (inactive too), the Operations note and the listing switch.

    Guests never see the note, inactive rooms or a paused/archived property.
    """

    units = PartnerUnitSerializer(many=True, read_only=True)
    visit_slots = serializers.SerializerMethodField()
    visit_blocked_dates = serializers.SerializerMethodField()

    class Meta(PropertySerializer.Meta):
        fields = (
            *PropertySerializer.Meta.fields,
            # The exact pin, for the host only. Guests get `area_latitude`/`area_longitude`.
            "latitude",
            "longitude",
            "moderation_reason",
            "listing_status",
            "visits_enabled",
            "visit_slots",
            "visit_blocked_dates",
        )

    @extend_schema_field(StayVisitSlotSerializer(many=True))
    def get_visit_slots(self, obj: Property) -> list[dict[str, Any]]:
        return list(StayVisitSlotSerializer(obj.visit_slots.all(), many=True).data)

    @extend_schema_field(serializers.ListField(child=serializers.DateField()))
    def get_visit_blocked_dates(self, obj: Property) -> list[date]:
        today = timezone.localdate()
        return list(obj.visit_blocked_dates.filter(date__gte=today).values_list("date", flat=True))


class StayReviewPhotoUploadSerializer(serializers.Serializer[dict[str, object]]):
    upload_id = serializers.UUIDField()
    url = serializers.URLField()


class StayPhotoUploadSerializer(serializers.Serializer[dict[str, Any]]):
    upload_id = serializers.UUIDField()
    url = serializers.URLField()
    original_name = serializers.CharField()


class StayTaxonomyVariantSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    code = serializers.CharField()
    #: Questions asked once per property. Room-level facts are split out into ``room_schema``.
    property_schema = serializers.JSONField()
    #: Questions asked per room (for example AC, bathroom), stored in ``Unit.attributes``.
    room_schema = serializers.JSONField()
    #: Room names the category suggests ("Double sharing", "Deluxe"); the host may type any name.
    room_name_suggestions = serializers.ListField(child=serializers.CharField())
    booking_mode = serializers.CharField()
    #: ``NIGHT`` or ``MONTH`` — what room rates for this type are quoted per.
    price_period = serializers.CharField()
    #: ``SHARED`` (host gives people sharing each room), ``PRIVATE`` (host gives guests per
    #: room) or ``MIXED`` (host gives both).
    room_style = serializers.CharField()
    #: Amenity checkboxes for this type: the platform list minus what the category already asks.
    amenity_options = StayAmenitySerializer(many=True)


class StayTaxonomyServiceSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    variants = StayTaxonomyVariantSerializer(many=True)


class StayTaxonomySubcategorySerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    services = StayTaxonomyServiceSerializer(many=True)


class CreatePropertySerializer(PropertyPinFields):
    variant_id = serializers.UUIDField()
    title = serializers.CharField(max_length=180)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    location_text = serializers.CharField(
        max_length=180, required=False, allow_blank=True, default=""
    )
    unit_name = serializers.CharField(required=False, allow_blank=True, default="")
    nightly_rate_paise = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    sharing_count = serializers.IntegerField(min_value=1, required=False, default=1)
    structured_fields = serializers.JSONField(required=False, default=dict)
    cancellation_policy_text = serializers.CharField(required=False, allow_blank=True, default="")
    house_rules = serializers.CharField(required=False, allow_blank=True, default="")
    min_stay_nights = serializers.IntegerField(min_value=1, required=False, default=1)
    #: Building and common-area photos. Optional: guests choose by the room photos.
    image_urls = serializers.ListField(
        child=serializers.CharField(min_length=1),
        required=False,
        default=list,
        max_length=8,
    )


class UpdatePropertySerializer(PropertyPinFields):
    title = serializers.CharField(max_length=180, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    location_text = serializers.CharField(max_length=180, required=False)
    structured_fields = serializers.JSONField(required=False)
    cancellation_policy_text = serializers.CharField(required=False, allow_blank=True)
    house_rules = serializers.CharField(required=False, allow_blank=True)
    min_stay_nights = serializers.IntegerField(min_value=1, required=False)


class CreateUnitSerializer(serializers.Serializer[dict[str, Any]]):
    name = serializers.CharField(max_length=120)
    nightly_rate_paise = serializers.IntegerField(min_value=1)
    sharing_count = serializers.IntegerField(min_value=1, required=False, default=1)
    quantity = serializers.IntegerField(min_value=1, max_value=500, required=False, default=1)
    #: Defaults to the sharing count when omitted.
    max_guests = serializers.IntegerField(min_value=1, max_value=50, required=False)
    attributes = serializers.JSONField(required=False, default=dict)
    is_active = serializers.BooleanField(required=False, default=True)
    #: Numbers for each room ("101", "102"). When given, ``quantity`` is their count.
    room_numbers = serializers.ListField(
        child=serializers.CharField(max_length=40),
        required=False,
        default=list,
        max_length=500,
    )
    #: Photos of this room type, uploaded first through the stay photo upload.
    image_urls = serializers.ListField(
        child=serializers.CharField(max_length=1024),
        required=False,
        default=list,
        max_length=8,
    )


class AddUnitMediaSerializer(serializers.Serializer[dict[str, Any]]):
    url = serializers.CharField(max_length=1024)


class CreateLookSerializer(serializers.Serializer[dict[str, Any]]):
    #: Required: a second look needs a name guests can tell apart.
    name = serializers.CharField(max_length=60)
    image_urls = serializers.ListField(
        child=serializers.CharField(max_length=1024), required=False, default=list, max_length=8
    )


class UpdateLookSerializer(serializers.Serializer[dict[str, Any]]):
    name = serializers.CharField(max_length=60, allow_blank=True)


class AddLookMediaSerializer(serializers.Serializer[dict[str, Any]]):
    url = serializers.CharField(max_length=1024)


class UpdateUnitSerializer(serializers.Serializer[dict[str, Any]]):
    name = serializers.CharField(max_length=120, required=False)
    nightly_rate_paise = serializers.IntegerField(min_value=1, required=False)
    sharing_count = serializers.IntegerField(min_value=1, required=False)
    quantity = serializers.IntegerField(min_value=1, max_value=500, required=False)
    max_guests = serializers.IntegerField(min_value=1, max_value=50, required=False)
    attributes = serializers.JSONField(required=False)
    is_active = serializers.BooleanField(required=False)


class PartnerReservationActionSerializer(serializers.Serializer[dict[str, Any]]):
    #: Required when cancelling: it is the explanation the guest receives.
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class CreateEnquirySerializer(serializers.Serializer[dict[str, Any]]):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField(required=False, allow_null=True)
    #: The look the guest picked on the room page, when the type has several.
    look_id = serializers.UUIDField(required=False, allow_null=True)
    check_in = serializers.DateField()
    #: How long, in the property's ``price_period`` (nights or months). Send this or check_out.
    length = serializers.IntegerField(min_value=1, max_value=366, required=False, allow_null=True)
    check_out = serializers.DateField(required=False, allow_null=True)
    guest_count = serializers.IntegerField(min_value=1, required=False, default=1)
    message = serializers.CharField(required=False, allow_blank=True, default="")


class StayQuoteRequestSerializer(serializers.Serializer[dict[str, Any]]):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField(required=False, allow_null=True)
    check_in = serializers.DateField()
    length = serializers.IntegerField(min_value=1, max_value=366, required=False, allow_null=True)
    check_out = serializers.DateField(required=False, allow_null=True)


class StayQuoteResponseSerializer(serializers.Serializer[dict[str, Any]]):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField(allow_null=True)
    unit_name = serializers.CharField()
    check_out = serializers.DateField(required=False)
    nights = serializers.IntegerField()
    stay_length = serializers.IntegerField(required=False)
    price_period = serializers.CharField(required=False)
    nightly_rate_paise = serializers.IntegerField()
    total_quote_paise = serializers.IntegerField()
    booking_mode = serializers.CharField(required=False)
    min_stay_nights = serializers.IntegerField(required=False)
    max_guests = serializers.IntegerField(required=False)


#: Enquiries the guest walked away from: the owner's number is no longer shown on them.
_HOST_CONTACT_HIDDEN = frozenset(
    {StayEnquiry.Status.CANCELLED, StayEnquiry.Status.WITHDRAWN, StayEnquiry.Status.EXPIRED}
)


class StayEnquirySerializer(serializers.ModelSerializer[StayEnquiry]):
    """The guest's view of their enquiry, with the owner's name and number to call.

    The guest's details go to the owner the moment they enquire; the owner's number comes back
    the same way, so either side can make the call.
    """

    property_title = serializers.CharField(source="property.title", read_only=True)
    property_slug = serializers.CharField(source="property.slug", read_only=True)
    #: "1 BHK · With balcony" when the guest picked a named look, so the host knows which room.
    unit_name = serializers.SerializerMethodField()
    nightly_rate_paise = serializers.IntegerField(
        source="unit.nightly_rate_paise", read_only=True, default=0
    )
    host_name = serializers.CharField(source="property.host.display_name", read_only=True)
    host_phone = serializers.SerializerMethodField()

    class Meta:
        model = StayEnquiry
        fields: tuple[str, ...] = (
            "id",
            "property",
            "property_title",
            "unit",
            "look",
            "unit_name",
            "nightly_rate_paise",
            "status",
            "check_in",
            "check_out",
            "nights",
            "stay_length",
            "price_period",
            "total_quote_paise",
            "guest_count",
            "message",
            "host_response",
            "responded_at",
            "created_at",
            "property_slug",
            "host_name",
            "host_phone",
        )

    def get_unit_name(self, obj: StayEnquiry) -> str:
        return _unit_and_look_name(obj.unit, obj.look, fallback="Standard room")

    def get_host_phone(self, obj: StayEnquiry) -> str:
        if obj.status in _HOST_CONTACT_HIDDEN:
            return ""
        return str(obj.property.host.user.phone_number or "")


class PartnerStayEnquirySerializer(StayEnquirySerializer):
    """The host's view: the guest's name and number, so the host can call them.

    The guest is told on the enquiry form that these are shared with the host.
    """

    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone_number", read_only=True)

    class Meta(StayEnquirySerializer.Meta):
        fields = (*StayEnquirySerializer.Meta.fields, "customer_name", "customer_phone")


class ConfirmEnquirySerializer(serializers.Serializer[dict[str, Any]]):
    #: The numbered room the guest is taking; it is marked Booked. Optional.
    room_id = serializers.UUIDField(required=False, allow_null=True)


class RespondEnquirySerializer(serializers.Serializer[dict[str, Any]]):
    #: Required for a reply; optional when marking the enquiry "Not available" (decline).
    response = serializers.CharField(max_length=4000, required=False, allow_blank=True, default="")
    decline = serializers.BooleanField(required=False, default=False)


class StayModerationSerializer(serializers.Serializer[dict[str, Any]]):
    action = serializers.ChoiceField(choices=["APPROVE", "REJECT", "REMOVE", "REINSTATE"])
    reason = serializers.CharField(max_length=480)


class StayReservationSerializer(serializers.ModelSerializer[StayReservation]):
    property_title = serializers.CharField(source="property.title", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True, default="Standard room")
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone_number", read_only=True)

    class Meta:
        model = StayReservation
        fields = (
            "id",
            "property",
            "property_title",
            "unit",
            "unit_name",
            "customer",
            "customer_name",
            "customer_phone",
            "payment_attempt",
            "status",
            "check_in",
            "check_out",
            "guest_count",
            "nights",
            "total_paise",
            "checked_in_at",
            "checked_out_at",
            "cancelled_at",
            "cancellation_reason",
            "created_at",
        )


class CreateReservationSerializer(serializers.Serializer[dict[str, Any]]):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField()
    check_in = serializers.DateField()
    check_out = serializers.DateField()
    guest_count = serializers.IntegerField(min_value=1, required=False, default=1)


class CreateStayReviewSerializer(serializers.Serializer[dict[str, Any]]):
    property_id = serializers.UUIDField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    body = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    enquiry_id = serializers.UUIDField(required=False, allow_null=True)
    reservation_id = serializers.UUIDField(required=False, allow_null=True)
    #: Links returned by ``POST /stays/reviews/photos`` for this guest; at most 5.
    image_urls = serializers.ListField(
        child=serializers.URLField(), required=False, default=list, max_length=5
    )


class AddPropertyMediaSerializer(serializers.Serializer[dict[str, Any]]):
    url = serializers.URLField()
    caption = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")
    display_order = serializers.IntegerField(min_value=0, required=False, default=0)


class OpsCancelStayReservationSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")


# --- numbered rooms -------------------------------------------------------------------------


class AddRoomSerializer(serializers.Serializer[dict[str, Any]]):
    number = serializers.CharField(max_length=40)
    available = serializers.BooleanField(required=False, default=True)
    #: Share this existing look's photos. Omit (and omit ``new_look``) for the first look.
    look_id = serializers.UUIDField(required=False, allow_null=True)
    #: Or start a new look with its own name and photos.
    new_look = CreateLookSerializer(required=False)


class UpdateRoomSerializer(serializers.Serializer[dict[str, Any]]):
    number = serializers.CharField(max_length=40, required=False)
    #: Move the room to another look of its type.
    look_id = serializers.UUIDField(required=False)
    #: The ON / OFF switch. Not for booked rooms: use the "release" action.
    available = serializers.BooleanField(required=False)


class MarkRoomBookedSerializer(serializers.Serializer[dict[str, Any]]):
    occupant_name = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )
    #: The accepted visit this booking came from, if any.
    visit_id = serializers.UUIDField(required=False, allow_null=True)


class HostStaySummarySerializer(serializers.Serializer[dict[str, Any]]):
    total_properties = serializers.IntegerField()
    live_properties = serializers.IntegerField()
    total_rooms = serializers.IntegerField()
    available_rooms = serializers.IntegerField()
    booked_rooms = serializers.IntegerField()
    unavailable_rooms = serializers.IntegerField()
    review_count = serializers.IntegerField()
    average_rating = serializers.FloatField(allow_null=True)
    new_enquiries = serializers.IntegerField()
    pending_visits = serializers.IntegerField()
    upcoming_visits = serializers.IntegerField()


# --- visits ---------------------------------------------------------------------------------


class VisitSlotInputSerializer(serializers.Serializer[dict[str, Any]]):
    #: 0 = Monday ... 6 = Sunday.
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()


class SetVisitingHoursSerializer(serializers.Serializer[dict[str, Any]]):
    visits_enabled = serializers.BooleanField()
    slots = VisitSlotInputSerializer(many=True)
    blocked_dates = serializers.ListField(
        child=serializers.DateField(), required=False, default=list
    )


class VisitAvailabilitySlotSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()


class VisitAvailabilityDaySerializer(serializers.Serializer[dict[str, Any]]):
    date = serializers.DateField()
    slots = VisitAvailabilitySlotSerializer(many=True)


class CreateVisitSerializer(serializers.Serializer[dict[str, Any]]):
    property_id = serializers.UUIDField()
    slot_id = serializers.UUIDField()
    visit_date = serializers.DateField()
    unit_id = serializers.UUIDField(required=False, allow_null=True)
    look_id = serializers.UUIDField(required=False, allow_null=True)
    message = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class DeclineVisitSerializer(serializers.Serializer[dict[str, Any]]):
    #: Optional. ROOM_UNAVAILABLE, DATE_MISMATCH, ALREADY_OCCUPIED or OTHER.
    reason = serializers.ChoiceField(
        choices=StayVisit.DeclineReason.choices, required=False, allow_blank=True, default=""
    )
    #: Shown to the guest only with OTHER.
    note = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")


class StayVisitSerializer(serializers.ModelSerializer[StayVisit]):
    """The guest's view of a visit. The owner's number appears once the visit is accepted;
    a reason for a declined visit appears only when the owner chose one."""

    property_title = serializers.CharField(source="property.title", read_only=True)
    property_slug = serializers.CharField(source="property.slug", read_only=True)
    unit_name = serializers.SerializerMethodField()
    host_name = serializers.CharField(source="property.host.display_name", read_only=True)
    host_phone = serializers.SerializerMethodField()
    reason_text = serializers.SerializerMethodField()

    class Meta:
        model = StayVisit
        fields: tuple[str, ...] = (
            "id",
            "property",
            "property_title",
            "property_slug",
            "unit",
            "look",
            "unit_name",
            "visit_date",
            "start_time",
            "end_time",
            "message",
            "status",
            "reason_text",
            "host_name",
            "host_phone",
            "responded_at",
            "created_at",
        )

    def get_unit_name(self, obj: StayVisit) -> str:
        return _unit_and_look_name(obj.unit, obj.look, fallback="")

    def get_host_phone(self, obj: StayVisit) -> str:
        if obj.status != StayVisit.Status.ACCEPTED:
            return ""
        return str(obj.property.host.user.phone_number or "")

    def get_reason_text(self, obj: StayVisit) -> str:
        from apps.stay.visits import guest_reason_text  # noqa: PLC0415

        return guest_reason_text(obj) if obj.status == StayVisit.Status.DECLINED else ""


class PartnerStayVisitSerializer(StayVisitSerializer):
    """The host's view: who is coming, with their number, and the reason the host gave."""

    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone_number", read_only=True)

    class Meta(StayVisitSerializer.Meta):
        fields = (
            *StayVisitSerializer.Meta.fields,
            "customer_name",
            "customer_phone",
            "decline_reason",
            "decline_note",
        )


class StaySubscriptionPlanSerializer(serializers.ModelSerializer[StaySubscriptionPlan]):
    class Meta:
        model = StaySubscriptionPlan
        fields = (
            "id",
            "code",
            "name",
            "price_paise",
            "duration_days",
            "max_properties",
            "capabilities",
            "details",
            "is_active",
            "created_at",
            "updated_at",
        )


class OpsCreateStaySubscriptionPlanSerializer(serializers.ModelSerializer[StaySubscriptionPlan]):
    class Meta:
        model = StaySubscriptionPlan
        fields = (
            "code",
            "name",
            "price_paise",
            "duration_days",
            "max_properties",
            "capabilities",
            "details",
            "is_active",
        )


class OpsUpdateStaySubscriptionPlanSerializer(serializers.ModelSerializer[StaySubscriptionPlan]):
    class Meta:
        model = StaySubscriptionPlan
        fields = (
            "name",
            "price_paise",
            "duration_days",
            "max_properties",
            "capabilities",
            "details",
            "is_active",
        )


class StaySubscriptionSerializer(serializers.ModelSerializer[StaySubscription]):
    plan = StaySubscriptionPlanSerializer(read_only=True)

    class Meta:
        model = StaySubscription
        fields = (
            "id",
            "plan",
            "status",
            "starts_at",
            "ends_at",
            "grace_ends_at",
            "created_at",
        )


class HostSubscriptionStatusSerializer(serializers.Serializer[dict[str, Any]]):
    subscription = StaySubscriptionSerializer(allow_null=True)
    available_plans = StaySubscriptionPlanSerializer(many=True)
    live_properties_count = serializers.IntegerField()
    max_properties = serializers.IntegerField()


class StartStaySubscriptionPurchaseSerializer(serializers.Serializer[dict[str, Any]]):
    plan_id = serializers.UUIDField()
