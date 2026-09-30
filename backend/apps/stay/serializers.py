from rest_framework import serializers

from apps.catalog.models import A9VariantConfiguration
from apps.stay.models import Property, PropertyMedia, StayEnquiry, StayReservation, StayReview, Unit


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = (
            "id",
            "name",
            "sharing_count",
            "nightly_rate_paise",
            "is_active",
            "attributes",
        )


class PropertyMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyMedia
        fields = ("id", "url", "caption", "display_order", "created_at")


class StayReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)

    class Meta:
        model = StayReview
        fields = ("id", "rating", "comment", "image_urls", "customer_name", "created_at")


def _extract_booking_mode(obj: Property) -> str:
    variant = getattr(obj, "variant", None)
    prefetch_cache = getattr(variant, "_prefetched_objects_cache", {})
    if variant and "a9_configurations" in prefetch_cache:
        for cfg in variant.a9_configurations.all():
            if cfg.status == A9VariantConfiguration.Status.ACTIVE:
                return str(cfg.booking_mode)
        return str(A9VariantConfiguration.BookingMode.ENQUIRY)

    config = (
        A9VariantConfiguration.objects.filter(
            variant_id=obj.variant_id, status=A9VariantConfiguration.Status.ACTIVE
        )
        .order_by("-version")
        .first()
    )
    if config is None:
        return str(A9VariantConfiguration.BookingMode.ENQUIRY)
    return str(config.booking_mode)


class PropertySummarySerializer(serializers.ModelSerializer):
    public_state = serializers.CharField(read_only=True)
    host_name = serializers.CharField(source="host.display_name", read_only=True)
    media = PropertyMediaSerializer(many=True, read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    booking_mode = serializers.SerializerMethodField()
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
            "available_from",
            "available_until",
            "media",
            "units",
            "booking_mode",
            "review_count",
            "average_rating",
            "created_at",
        )

    def get_booking_mode(self, obj: Property) -> str:
        return _extract_booking_mode(obj)

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
            "available_from",
            "available_until",
            "media",
            "reviews",
            "units",
            "booking_mode",
            "created_at",
        )

    def get_booking_mode(self, obj: Property) -> str:
        return _extract_booking_mode(obj)


class PartnerPropertySerializer(PropertySerializer):
    """The host's own view: adds the Operations note, which guests never see."""

    class Meta(PropertySerializer.Meta):
        fields = (*PropertySerializer.Meta.fields, "moderation_reason")


class StayPhotoUploadSerializer(serializers.Serializer):
    upload_id = serializers.UUIDField()
    url = serializers.URLField()
    original_name = serializers.CharField()


class StayTaxonomyVariantSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    code = serializers.CharField()
    property_schema = serializers.JSONField()
    booking_mode = serializers.CharField()


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
    available_from = serializers.DateField(required=False, allow_null=True)
    available_until = serializers.DateField(required=False, allow_null=True)
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
    available_from = serializers.DateField(required=False, allow_null=True)
    available_until = serializers.DateField(required=False, allow_null=True)


class CreateUnitSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    nightly_rate_paise = serializers.IntegerField(min_value=1)
    sharing_count = serializers.IntegerField(min_value=1, required=False, default=1)
    attributes = serializers.JSONField(required=False, default=dict)
    is_active = serializers.BooleanField(required=False, default=True)


class UpdateUnitSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    nightly_rate_paise = serializers.IntegerField(min_value=1, required=False)
    sharing_count = serializers.IntegerField(min_value=1, required=False)
    attributes = serializers.JSONField(required=False)
    is_active = serializers.BooleanField(required=False)


class CreateEnquirySerializer(serializers.Serializer):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField(required=False, allow_null=True)
    check_in = serializers.DateField()
    check_out = serializers.DateField()
    guest_count = serializers.IntegerField(min_value=1, required=False, default=1)
    message = serializers.CharField(required=False, allow_blank=True, default="")


class StayQuoteRequestSerializer(serializers.Serializer):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField(required=False, allow_null=True)
    check_in = serializers.DateField()
    check_out = serializers.DateField()


class StayQuoteResponseSerializer(serializers.Serializer):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField(allow_null=True)
    unit_name = serializers.CharField()
    nights = serializers.IntegerField()
    nightly_rate_paise = serializers.IntegerField()
    total_quote_paise = serializers.IntegerField()
    booking_mode = serializers.CharField(required=False)
    min_stay_nights = serializers.IntegerField(required=False)
    available_from = serializers.DateField(required=False, allow_null=True)
    available_until = serializers.DateField(required=False, allow_null=True)


class StayEnquirySerializer(serializers.ModelSerializer):
    property_title = serializers.CharField(source="property.title", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True, default="Standard room")
    nightly_rate_paise = serializers.IntegerField(
        source="unit.nightly_rate_paise", read_only=True, default=0
    )

    class Meta:
        model = StayEnquiry
        fields = (
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
            "total_quote_paise",
            "guest_count",
            "message",
            "host_response",
            "responded_at",
            "created_at",
        )


class RespondEnquirySerializer(serializers.Serializer):
    response = serializers.CharField(max_length=4000)
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
