from django.conf import settings
from rest_framework import serializers

from apps.rental.models import RentalAsset, RentalAssetMedia, RentalBooking, RentalDeposit


class RentalAssetMediaSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(source="url", read_only=True)
    sort_order = serializers.IntegerField(source="display_order", read_only=True)

    class Meta:
        model = RentalAssetMedia
        fields = ("id", "url", "image_url", "caption", "display_order", "sort_order", "created_at")


class RentalAssetSerializer(serializers.ModelSerializer):
    public_state = serializers.CharField(read_only=True)
    partner_name = serializers.CharField(source="partner.display_name", read_only=True)
    media = RentalAssetMediaSerializer(many=True, read_only=True)

    class Meta:
        model = RentalAsset
        fields = (
            "id",
            "title",
            "description",
            "location_text",
            "daily_rate_paise",
            "deposit_paise",
            "condition_grade",
            "current_status",
            "moderation_status",
            "public_state",
            "partner_name",
            "variant",
            "structured_fields",
            "media",
            "created_at",
        )
        read_only_fields = fields


class RentalPhotoUploadSerializer(serializers.Serializer):
    upload_id = serializers.UUIDField()
    url = serializers.URLField()
    original_name = serializers.CharField()


class CreateAssetSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    title = serializers.CharField(max_length=180)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    location_text = serializers.CharField(max_length=180)
    daily_rate_paise = serializers.IntegerField(min_value=1)
    deposit_paise = serializers.IntegerField(min_value=0)
    asset_identifier = serializers.CharField(required=False, allow_blank=True, default="")
    structured_fields = serializers.JSONField(required=False, default=dict)
    media = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    image_urls = serializers.ListField(
        child=serializers.CharField(min_length=1),
        min_length=1,
        max_length=8,
    )


class RentalAssetMediaCreateSerializer(serializers.Serializer):
    url = serializers.URLField(max_length=1024, required=False)
    image_url = serializers.URLField(max_length=1024, required=False)
    caption = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")
    display_order = serializers.IntegerField(required=False, default=0)
    sort_order = serializers.IntegerField(required=False, default=0)


class RentalTaxonomyVariantSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    code = serializers.CharField()
    asset_schema = serializers.JSONField()
    default_deposit_paise = serializers.IntegerField()


class RentalTaxonomyServiceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    variants = RentalTaxonomyVariantSerializer(many=True)


class RentalTaxonomySubcategorySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    services = RentalTaxonomyServiceSerializer(many=True)


class CreateBookingSerializer(serializers.Serializer):
    asset_id = serializers.UUIDField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    # Accepted for API compat; always coerced to PICKUP (OLX pickup-only model).
    pickup_or_delivery_mode = serializers.CharField(required=False, default="PICKUP")
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_pickup_or_delivery_mode(self, value: str) -> str:
        return "PICKUP"


class RentalDepositSerializer(serializers.ModelSerializer):
    payment_attempt_id = serializers.UUIDField(read_only=True, allow_null=True)
    simulated_capture_available = serializers.SerializerMethodField()

    class Meta:
        model = RentalDeposit
        fields = (
            "id",
            "amount_paise",
            "status",
            "consumed_paise",
            "provider_note",
            "payment_attempt_id",
            "simulated_capture_available",
        )

    def get_simulated_capture_available(self, deposit: RentalDeposit) -> bool:

        attempt = deposit.payment_attempt
        if attempt is None:
            return False
        return bool(settings.PAYMENTS_ALLOW_SIMULATED_CAPTURE) and attempt.provider == "fake"


class RentalBookingSerializer(serializers.ModelSerializer):
    asset = RentalAssetSerializer(read_only=True)
    deposit = RentalDepositSerializer(read_only=True)

    class Meta:
        model = RentalBooking
        fields = (
            "id",
            "status",
            "start_date",
            "end_date",
            "price_paise",
            "pickup_or_delivery_mode",
            "notes",
            "asset",
            "deposit",
            "created_at",
        )


class RentalModerationSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["APPROVE", "REJECT", "REMOVE", "REINSTATE"])
    reason = serializers.CharField(max_length=480)
