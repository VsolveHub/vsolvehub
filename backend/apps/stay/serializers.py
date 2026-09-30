from rest_framework import serializers

from apps.catalog.models import A9VariantConfiguration
from apps.stay.models import Property, PropertyMedia, StayEnquiry, StayReservation, StayReview, Unit


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields: tuple[str, ...] = (
            "id",
            "name",
            "sharing_count",
            "quantity",
            "max_guests",
            "nightly_rate_paise",
            "is_active",
            "attributes",
        )


class PartnerUnitSerializer(UnitSerializer):
    """The host's view of a room: adds how many bookings still have nights ahead."""

    upcoming_booking_count = serializers.SerializerMethodField()

    class Meta(UnitSerializer.Meta):
        fields = (*UnitSerializer.Meta.fields, "upcoming_booking_count")

    def get_upcoming_booking_count(self, obj: Unit) -> int:
        from apps.stay.services import upcoming_booking_count  # noqa: PLC0415

        return upcoming_booking_count(unit=obj)


class PropertyMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyMedia
        fields = ("id", "url", "caption", "display_order", "created_at")


class StayReviewSerializer(serializers.ModelSerializer):
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


class PropertySummarySerializer(serializers.ModelSerializer):
    public_state = serializers.CharField(read_only=True)
    host_name = serializers.CharField(source="host.display_name", read_only=True)
    media = PropertyMediaSerializer(many=True, read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    booking_mode = serializers.SerializerMethodField()
    price_period = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = (
            "id",
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
            "review_count",
            "average_rating",
            "created_at",
        )

    def get_booking_mode(self, obj: Property) -> str:
        return _extract_booking_mode(obj)

    def get_price_period(self, obj: Property) -> str:
        return _extract_price_period(obj)

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
        return round(sum(r.rating for r in items) / len(items), 1)


class PropertySerializer(serializers.ModelSerializer):
    public_state = serializers.CharField(read_only=True)
    host_name = serializers.CharField(source="host.display_name", read_only=True)
    media = PropertyMediaSerializer(many=True, read_only=True)
    reviews = StayReviewSerializer(many=True, read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    booking_mode = serializers.SerializerMethodField()
    price_period = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields: tuple[str, ...] = (
            "id",
            "title",
            "description",
            "location_text",
            "moderation_status",
            "public_state",
            "host_name",
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
            "created_at",
        )

    def get_booking_mode(self, obj: Property) -> str:
        return _extract_booking_mode(obj)

    def get_price_period(self, obj: Property) -> str:
        return _extract_price_period(obj)


class PartnerPropertySerializer(PropertySerializer):
    """The host's own view: every room (inactive too), the Operations note and the listing switch.

    Guests never see the note, inactive rooms or a paused/archived property.
    """

    units = PartnerUnitSerializer(many=True, read_only=True)

    class Meta(PropertySerializer.Meta):
        fields = (*PropertySerializer.Meta.fields, "moderation_reason", "listing_status")


class StayPhotoUploadSerializer(serializers.Serializer):
    upload_id = serializers.UUIDField()
    url = serializers.URLField()
    original_name = serializers.CharField()


class StayTaxonomyVariantSerializer(serializers.Serializer):
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


class StayTaxonomyServiceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    variants = StayTaxonomyVariantSerializer(many=True)


class StayTaxonomySubcategorySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    services = StayTaxonomyServiceSerializer(many=True)


class CreatePropertySerializer(serializers.Serializer):
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
    image_urls = serializers.ListField(
        child=serializers.CharField(min_length=1),
        min_length=1,
        max_length=8,
    )


class UpdatePropertySerializer(serializers.Serializer):
    title = serializers.CharField(max_length=180, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    location_text = serializers.CharField(max_length=180, required=False)
    structured_fields = serializers.JSONField(required=False)
    cancellation_policy_text = serializers.CharField(required=False, allow_blank=True)
    house_rules = serializers.CharField(required=False, allow_blank=True)
    min_stay_nights = serializers.IntegerField(min_value=1, required=False)


class CreateUnitSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    nightly_rate_paise = serializers.IntegerField(min_value=1)
    sharing_count = serializers.IntegerField(min_value=1, required=False, default=1)
    quantity = serializers.IntegerField(min_value=1, max_value=500, required=False, default=1)
    #: Defaults to the sharing count when omitted.
    max_guests = serializers.IntegerField(min_value=1, max_value=50, required=False)
    attributes = serializers.JSONField(required=False, default=dict)
    is_active = serializers.BooleanField(required=False, default=True)


class UpdateUnitSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    nightly_rate_paise = serializers.IntegerField(min_value=1, required=False)
    sharing_count = serializers.IntegerField(min_value=1, required=False)
    quantity = serializers.IntegerField(min_value=1, max_value=500, required=False)
    max_guests = serializers.IntegerField(min_value=1, max_value=50, required=False)
    attributes = serializers.JSONField(required=False)
    is_active = serializers.BooleanField(required=False)


class PartnerReservationActionSerializer(serializers.Serializer):
    #: Required when cancelling: it is the explanation the guest receives.
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class CreateEnquirySerializer(serializers.Serializer):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField(required=False, allow_null=True)
    check_in = serializers.DateField()
    #: How long, in the property's ``price_period`` (nights or months). Send this or check_out.
    length = serializers.IntegerField(min_value=1, max_value=366, required=False, allow_null=True)
    check_out = serializers.DateField(required=False, allow_null=True)
    guest_count = serializers.IntegerField(min_value=1, required=False, default=1)
    message = serializers.CharField(required=False, allow_blank=True, default="")


class StayQuoteRequestSerializer(serializers.Serializer):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField(required=False, allow_null=True)
    check_in = serializers.DateField()
    length = serializers.IntegerField(min_value=1, max_value=366, required=False, allow_null=True)
    check_out = serializers.DateField(required=False, allow_null=True)


class StayQuoteResponseSerializer(serializers.Serializer):
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


class StayEnquirySerializer(serializers.ModelSerializer):
    property_title = serializers.CharField(source="property.title", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True, default="Standard room")
    nightly_rate_paise = serializers.IntegerField(
        source="unit.nightly_rate_paise", read_only=True, default=0
    )

    class Meta:
        model = StayEnquiry
        fields: tuple[str, ...] = (
            "id",
            "property",
            "property_title",
            "unit",
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
        )


class PartnerStayEnquirySerializer(StayEnquirySerializer):
    """The host's view: the guest's name and number, so the host can call them.

    The guest is told on the enquiry form that these are shared with the host.
    """

    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone_number", read_only=True)

    class Meta(StayEnquirySerializer.Meta):
        fields = (*StayEnquirySerializer.Meta.fields, "customer_name", "customer_phone")


class RespondEnquirySerializer(serializers.Serializer):
    #: Required for a reply; optional when marking the enquiry "Not available" (decline).
    response = serializers.CharField(max_length=4000, required=False, allow_blank=True, default="")
    decline = serializers.BooleanField(required=False, default=False)


class StayModerationSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["APPROVE", "REJECT", "REMOVE", "REINSTATE"])
    reason = serializers.CharField(max_length=480)


class StayReservationSerializer(serializers.ModelSerializer):
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


class CreateReservationSerializer(serializers.Serializer):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField()
    check_in = serializers.DateField()
    check_out = serializers.DateField()
    guest_count = serializers.IntegerField(min_value=1, required=False, default=1)


class CreateStayReviewSerializer(serializers.Serializer):
    property_id = serializers.UUIDField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    body = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    enquiry_id = serializers.UUIDField(required=False, allow_null=True)
    reservation_id = serializers.UUIDField(required=False, allow_null=True)
    image_urls = serializers.ListField(child=serializers.URLField(), required=False, default=list)


class AddPropertyMediaSerializer(serializers.Serializer):
    url = serializers.URLField()
    caption = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")
    display_order = serializers.IntegerField(min_value=0, required=False, default=0)


class OpsCancelStayReservationSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")
