from typing import Any

from django.conf import settings
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.rental.models import (
    RentalAsset,
    RentalAssetMedia,
    RentalBooking,
    RentalDeposit,
    RentalTransportRequest,
)
from apps.rental.pickup_address import pickup_address_payload
from apps.rental.pickup_hours import payload_from_rows
from apps.rental.services import booking_amount_due


class PickupAddressSerializer(serializers.Serializer[dict[str, Any]]):
    """Where a Self Pickup customer collects the item. ``maps_url`` opens Google Maps."""

    partner_name = serializers.CharField()
    line = serializers.CharField()
    area = serializers.CharField()
    city = serializers.CharField()
    pincode = serializers.CharField()
    maps_url = serializers.CharField(help_text="Google Maps search for the address. Empty if none.")


class PickupDaySerializer(serializers.Serializer[dict[str, Any]]):
    weekday = serializers.IntegerField(min_value=0, max_value=6, help_text="Monday = 0.")
    day_name = serializers.CharField(read_only=True)
    is_open = serializers.BooleanField()
    opens_at = serializers.CharField(allow_null=True, help_text="HH:MM, 24-hour. Null if closed.")
    closes_at = serializers.CharField(allow_null=True, help_text="HH:MM, 24-hour. Null if closed.")


class PickupHoursSerializer(serializers.Serializer[dict[str, Any]]):
    is_set = serializers.BooleanField(help_text="False until the owner saves their hours.")
    days = PickupDaySerializer(many=True)
    summary = serializers.CharField(help_text='e.g. "Mon-Sat 9 AM-9 PM · Sun 9 AM-6 PM".')


class PickupDayInputSerializer(serializers.Serializer[dict[str, Any]]):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    opens_at = serializers.TimeField()
    closes_at = serializers.TimeField()


class PickupHoursUpdateSerializer(serializers.Serializer[dict[str, Any]]):
    """The open days only. A day left out is closed."""

    days = PickupDayInputSerializer(many=True)


def _pickup_hours(asset: RentalAsset) -> dict[str, Any]:
    return payload_from_rows(list(asset.partner.rental_pickup_days.all()))


class RentalAssetMediaSerializer(serializers.ModelSerializer[RentalAssetMedia]):
    image_url = serializers.CharField(source="url", read_only=True)
    sort_order = serializers.IntegerField(source="display_order", read_only=True)

    class Meta:
        model = RentalAssetMedia
        fields = ("id", "url", "image_url", "caption", "display_order", "sort_order", "created_at")


class RentalAssetSerializer(serializers.ModelSerializer[RentalAsset]):
    public_state = serializers.CharField(read_only=True)
    partner_name = serializers.CharField(source="partner.display_name", read_only=True)
    media = RentalAssetMediaSerializer(many=True, read_only=True)
    pickup_address = serializers.SerializerMethodField()

    @extend_schema_field(PickupAddressSerializer)
    def get_pickup_address(self, asset: RentalAsset) -> dict[str, Any]:
        return pickup_address_payload(asset)

    class Meta:
        model = RentalAsset
        fields: tuple[str, ...] = (
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
            "pickup_address_line",
            "pickup_area",
            "pickup_city",
            "pickup_pincode",
            "pickup_address",
            "delivery_available",
            "created_at",
        )
        read_only_fields: tuple[str, ...] = fields


class RentalAssetDetailSerializer(RentalAssetSerializer):
    """One item's page: adds the owner's pickup hours."""

    pickup_hours = serializers.SerializerMethodField()

    class Meta(RentalAssetSerializer.Meta):
        fields = (*RentalAssetSerializer.Meta.fields, "pickup_hours")
        read_only_fields = fields

    @extend_schema_field(PickupHoursSerializer)
    def get_pickup_hours(self, asset: RentalAsset) -> dict[str, Any]:
        return _pickup_hours(asset)


class RentalPhotoUploadSerializer(serializers.Serializer[dict[str, Any]]):
    upload_id = serializers.UUIDField()
    url = serializers.URLField()
    original_name = serializers.CharField()


class CreateAssetSerializer(serializers.Serializer[dict[str, Any]]):
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
    pickup_address_line = serializers.CharField(
        max_length=240, required=False, allow_blank=True, default=""
    )
    pickup_area = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )
    pickup_city = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )
    pickup_pincode = serializers.CharField(
        max_length=6, required=False, allow_blank=True, default=""
    )
    delivery_available = serializers.BooleanField(required=False, default=False)
    media = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    image_urls = serializers.ListField(
        child=serializers.CharField(min_length=1),
        min_length=1,
        max_length=8,
    )


class RentalAssetMediaCreateSerializer(serializers.Serializer[dict[str, Any]]):
    url = serializers.URLField(max_length=1024, required=False)
    image_url = serializers.URLField(max_length=1024, required=False)
    caption = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")
    display_order = serializers.IntegerField(required=False, default=0)
    sort_order = serializers.IntegerField(required=False, default=0)


class RentalTaxonomyVariantSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    code = serializers.CharField()
    asset_schema = serializers.JSONField()
    default_deposit_paise = serializers.IntegerField()


class RentalTaxonomyServiceSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    variants = RentalTaxonomyVariantSerializer(many=True)


class RentalTaxonomySubcategorySerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    services = RentalTaxonomyServiceSerializer(many=True)


class DeliveryAddressSerializer(serializers.Serializer[dict[str, Any]]):
    line = serializers.CharField(max_length=240)
    area = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    city = serializers.CharField(max_length=120)
    pincode = serializers.CharField(max_length=6)
    contact_phone = serializers.CharField(max_length=20)


class CreateBookingSerializer(serializers.Serializer[dict[str, Any]]):
    asset_id = serializers.UUIDField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    quantity = serializers.IntegerField(min_value=1, required=False, default=1)
    pickup_or_delivery_mode = serializers.ChoiceField(
        choices=RentalBooking.Mode.choices, required=False, default=RentalBooking.Mode.PICKUP
    )
    #: Required for DELIVERY; ignored for PICKUP.
    delivery_address = DeliveryAddressSerializer(required=False)
    delivery_note = serializers.CharField(
        max_length=480, required=False, allow_blank=True, default=""
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class RentalTransportSerializer(serializers.ModelSerializer[RentalTransportRequest]):
    max_quotes = serializers.SerializerMethodField()

    class Meta:
        model = RentalTransportRequest
        fields = (
            "id",
            "status",
            "trip",
            "customer_note",
            "reject_note",
            "decline_reason",
            "quote_paise",
            "quote_note",
            "quote_count",
            "max_quotes",
            "respond_by",
            "requested_at",
            "quoted_at",
            "accepted_at",
            "delivered_at",
        )
        read_only_fields = fields

    def get_max_quotes(self, _request: RentalTransportRequest) -> int:
        return RentalTransportRequest.MAX_QUOTES


class TransportQuoteSerializer(serializers.Serializer[dict[str, Any]]):
    amount_paise = serializers.IntegerField(min_value=1)
    trip = serializers.ChoiceField(choices=RentalTransportRequest.Trip.choices)
    note = serializers.CharField(max_length=480, required=False, allow_blank=True, default="")


class TransportNoteSerializer(serializers.Serializer[dict[str, Any]]):
    note = serializers.CharField(max_length=480, required=False, allow_blank=True, default="")


class OpsRentalDisputeDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    decision = serializers.ChoiceField(choices=["APPROVE", "REJECT"])


class PartnerBookingActionSerializer(serializers.Serializer[dict[str, Any]]):
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


class UpdateAssetSerializer(serializers.Serializer[dict[str, Any]]):
    """Fields the owner can edit on an existing ad. All optional — only sent fields change."""

    title = serializers.CharField(max_length=180, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    daily_rate_paise = serializers.IntegerField(min_value=1, required=False)
    deposit_paise = serializers.IntegerField(min_value=0, required=False)
    location_text = serializers.CharField(max_length=180, required=False)
    quantity_available = serializers.IntegerField(min_value=1, required=False)
    structured_fields = serializers.JSONField(required=False)
    pickup_address_line = serializers.CharField(max_length=240, required=False, allow_blank=True)
    pickup_area = serializers.CharField(max_length=120, required=False, allow_blank=True)
    pickup_city = serializers.CharField(max_length=120, required=False, allow_blank=True)
    pickup_pincode = serializers.CharField(max_length=6, required=False, allow_blank=True)
    delivery_available = serializers.BooleanField(required=False)


class RentalDepositSerializer(serializers.ModelSerializer[RentalDeposit]):
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


class RentalBookingSerializer(serializers.ModelSerializer[RentalBooking]):
    asset = RentalAssetSerializer(read_only=True)
    deposit = RentalDepositSerializer(read_only=True)
    handover_pin = serializers.SerializerMethodField()
    quantity = serializers.SerializerMethodField()
    transport = serializers.SerializerMethodField()
    pickup_hours = serializers.SerializerMethodField()
    amount_due_paise = serializers.SerializerMethodField()

    class Meta:
        model = RentalBooking
        fields: tuple[str, ...] = (
            "id",
            "status",
            "start_date",
            "end_date",
            "quantity",
            "price_paise",
            "platform_fee_percent",
            "platform_fee_paise",
            "pickup_or_delivery_mode",
            "delivery_address",
            "transport_paise",
            "transport_fee_percent",
            "transport_fee_paise",
            "amount_due_paise",
            "transport",
            "pickup_hours",
            "notes",
            "asset",
            "deposit",
            "handover_pin",
            "created_at",
        )

    @extend_schema_field(RentalTransportSerializer(allow_null=True))
    def get_transport(self, booking: RentalBooking) -> dict[str, Any] | None:
        try:
            request = booking.transport
        except RentalTransportRequest.DoesNotExist:
            return None
        return dict(RentalTransportSerializer(request).data)

    @extend_schema_field(PickupHoursSerializer)
    def get_pickup_hours(self, booking: RentalBooking) -> dict[str, Any]:
        return _pickup_hours(booking.asset)

    @extend_schema_field(serializers.IntegerField())
    def get_amount_due_paise(self, booking: RentalBooking) -> int:
        """Rent + platform fee + deposit + agreed transport: the one charge for this booking."""
        return booking_amount_due(booking)

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


class RentalPlatformFeeSerializer(serializers.Serializer[dict[str, Any]]):
    percent = serializers.IntegerField(min_value=0, max_value=100)
    transport_fee_percent = serializers.IntegerField(
        read_only=True,
        help_text="Commission on an owner's transport price. 0 means the owner keeps all of it.",
    )


class RentalModerationSerializer(serializers.Serializer[dict[str, Any]]):
    action = serializers.ChoiceField(choices=["APPROVE", "REJECT", "REMOVE", "REINSTATE"])
    reason = serializers.CharField(max_length=480)
