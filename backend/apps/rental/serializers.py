from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from apps.rental.models import (
    AssetReservation,
    RentalAsset,
    RentalAssetMedia,
    RentalBooking,
    RentalDeposit,
)


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
    reserved_ranges = serializers.SerializerMethodField()

    class Meta:
        model = RentalAsset
        fields = (
            "id",
            "slug",
            "title",
            "description",
            "location_text",
            "daily_rate_paise",
            "deposit_paise",
            "quantity_available",
            "condition_grade",
            "current_status",
            "moderation_status",
            "public_state",
            "partner_name",
            "variant",
            "structured_fields",
            "media",
            "reserved_ranges",
            "created_at",
        )
        read_only_fields = fields

    def get_reserved_ranges(self, asset: RentalAsset) -> list[dict[str, str]]:
        today = timezone.localdate()
        return [
            {
                "start_date": r.start_date.isoformat(),
                "end_date": r.end_date.isoformat(),
            }
            for r in asset.reservations.filter(
                status__in=[AssetReservation.Status.CONFIRMED, AssetReservation.Status.TENTATIVE],
                end_date__gte=today,
            )
        ]


class RentalPhotoUploadSerializer(serializers.Serializer):
    upload_id = serializers.UUIDField()
    url = serializers.URLField()
    original_name = serializers.CharField()


class CreateAssetSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    title = serializers.CharField(max_length=180)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    location_text = serializers.CharField(
        max_length=180, required=False, allow_blank=True, default=""
    )
    daily_rate_paise = serializers.IntegerField(min_value=1)
    deposit_paise = serializers.IntegerField(min_value=0)
    quantity_available = serializers.IntegerField(min_value=1, required=False, default=1)
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
    quantity = serializers.IntegerField(min_value=1, required=False, default=1)
    # Accepted for API compat; always coerced to PICKUP (OLX pickup-only model).
    pickup_or_delivery_mode = serializers.CharField(required=False, default="PICKUP")
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_pickup_or_delivery_mode(self, value: str) -> str:
        return "PICKUP"


class OpsRentalDisputeDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["APPROVE", "REJECT"])


class PartnerBookingActionSerializer(serializers.Serializer):
    pin = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    # Optional partial deposit consume for dispute-deposit. Default 0 = dispute
    # without consuming; only amounts > 0 consume held deposit (never silent full).
    consume_paise = serializers.IntegerField(min_value=0, required=False, default=0)
    photo_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
        max_length=5,
    )


class UpdateAssetSerializer(serializers.Serializer):
    """Fields the owner can edit on an existing ad. All optional — only sent fields change."""

    title = serializers.CharField(max_length=180, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    daily_rate_paise = serializers.IntegerField(min_value=1, required=False)
    deposit_paise = serializers.IntegerField(min_value=0, required=False)
    location_text = serializers.CharField(max_length=180, required=False)
    quantity_available = serializers.IntegerField(min_value=1, required=False)
    structured_fields = serializers.JSONField(required=False)


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
            "requested_consume_paise",
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
    handover_pin = serializers.SerializerMethodField()
    quantity = serializers.SerializerMethodField()

    class Meta:
        model = RentalBooking
        fields = (
            "id",
            "status",
            "start_date",
            "end_date",
            "quantity",
            "price_paise",
            "platform_fee_percent",
            "platform_fee_paise",
            "pickup_or_delivery_mode",
            "notes",
            "asset",
            "deposit",
            "handover_pin",
            "created_at",
        )

    def get_quantity(self, booking: RentalBooking) -> int:
        line = booking.lines.order_by("id").first()
        if line is None:
            return 1
        return int(line.quantity or 1)

    def get_handover_pin(self, booking: RentalBooking) -> str | None:
        """Plaintext PIN for the customer only, once the booking is paid/active."""
        request = self.context.get("request")
        if request is None or not getattr(request, "user", None):
            return None
        user = request.user
        if not user.is_authenticated or user.id != booking.customer_id:
            return None
        if booking.status not in (
            RentalBooking.Status.CONFIRMED,
            RentalBooking.Status.HANDOVER,
        ):
            return None
        return booking.handover_pin_hash or None


class PartnerRentalBookingSerializer(RentalBookingSerializer):
    """The owner's view of the booking: includes renter's name and phone to coordinate."""

    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()

    class Meta(RentalBookingSerializer.Meta):
        fields = (
            *RentalBookingSerializer.Meta.fields,
            "customer_name",
            "customer_phone",
        )

    def get_customer_name(self, booking: RentalBooking) -> str:
        customer = booking.customer
        return (
            getattr(customer, "display_name", "")
            or getattr(customer, "full_name", "")
            or getattr(customer, "first_name", "Customer")
        )

    def get_customer_phone(self, booking: RentalBooking) -> str | None:
        customer = booking.customer
        return getattr(customer, "phone", None) or getattr(customer, "phone_number", None)


class RentalPlatformFeeSerializer(serializers.Serializer):
    percent = serializers.IntegerField(min_value=0, max_value=100)


class RentalModerationSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["APPROVE", "REJECT", "REMOVE", "REINSTATE"])
    reason = serializers.CharField(max_length=480)
