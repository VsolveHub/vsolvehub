"""Serializers for Rental Services endpoints."""

from typing import Any

from rest_framework import serializers
from jsonschema import ValidationError as JSONSchemaValidationError
from jsonschema import validate as validate_json_schema

from apps.catalog.models import A7VariantConfiguration, ServiceVariant
from apps.commerce.serializers import PaymentAttemptSerializer
from apps.rentals.models import (
    RentalAsset,
    RentalAssetCategoryProfile,
    RentalAssetMedia,
    RentalBooking,
    RentalBookingLine,
    RentalDeposit,
    RentalExtension,
    RentalHandover,
    RentalMaintenancePeriod,
    RentalReturnInspection,
)


class RentalPaymentAttemptsSerializer(serializers.Serializer):
    payment_attempts = PaymentAttemptSerializer(many=True)


class RentalExtensionSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore[override]
        model = RentalExtension
        fields = (
            "id",
            "previous_end",
            "new_end",
            "price_delta_paise",
            "deposit_delta_paise",
            "status",
            "created_at",
            "approved_at",
        )


class RentalVariantOptionSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    variant_name = serializers.CharField()
    service_id = serializers.UUIDField()
    service_name = serializers.CharField()
    subcategory_name = serializers.CharField()
    category_name = serializers.CharField()


class RentalListingGroupSerializer(serializers.Serializer):
    asset_id = serializers.UUIDField()
    partner_id = serializers.UUIDField()
    vendor_name = serializers.CharField()
    variant_id = serializers.UUIDField()
    service_name = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    daily_price_paise = serializers.IntegerField()
    deposit_paise = serializers.IntegerField()
    condition_grade = serializers.CharField()
    image_url = serializers.CharField(allow_blank=True)
    pickup_address = serializers.DictField(allow_null=True)
    quantity_available = serializers.IntegerField()


class RentalAssetMediaSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore[override]
        model = RentalAssetMedia
        fields = ("id", "url", "caption", "is_primary", "created_at")


class RentalMaintenancePeriodSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore[override]
        model = RentalMaintenancePeriod
        fields = ("id", "start_date", "end_date", "reason", "created_at")


class RentalAssetSerializer(serializers.ModelSerializer):
    # Declared explicitly: `Meta.fields` naming these "<relation>_id" does not
    # make DRF map input to the `partner`/`variant` FKs on its own — without
    # this, `variant_id` from the request body was silently dropped and every
    # create failed a NOT NULL constraint at the database. `partner_id` stays
    # read-only; the view always sets the real `partner` via `.save(partner=partner)`.
    partner_id = serializers.UUIDField(read_only=True)
    variant_id = serializers.PrimaryKeyRelatedField(
        source="variant", queryset=ServiceVariant.objects.all()
    )
    media = RentalAssetMediaSerializer(many=True, read_only=True)
    maintenance_periods = RentalMaintenancePeriodSerializer(many=True, read_only=True)
    category_attributes = serializers.JSONField(required=False, default=dict)

    class Meta:  # type: ignore[override]
        model = RentalAsset
        fields = (
            "id",
            "partner_id",
            "variant_id",
            "title",
            "description",
            "asset_identifier",
            "is_serialized",
            "quantity_available",
            "daily_price_paise",
            "deposit_paise",
            "condition_grade",
            "current_status",
            "media",
            "maintenance_periods",
            "category_attributes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs: dict) -> dict:
        variant = attrs.get("variant") or (self.instance.variant if self.instance else None)
        if variant is None:
            raise serializers.ValidationError({"variant_id": "A rental variant is required."})
        config = A7VariantConfiguration.objects.filter(
            variant=variant,
            status=A7VariantConfiguration.Status.ACTIVE,
        ).first()
        if config is None:
            raise serializers.ValidationError({"variant_id": "No active A7 policy is configured."})
        is_serialized = attrs.get(
            "is_serialized", self.instance.is_serialized if self.instance else True
        )
        quantity = attrs.get(
            "quantity_available", self.instance.quantity_available if self.instance else 1
        )
        identifier = attrs.get(
            "asset_identifier", self.instance.asset_identifier if self.instance else ""
        )
        if is_serialized and quantity != 1:
            raise serializers.ValidationError(
                {"quantity_available": "Serialized assets must have quantity 1."}
            )
        if is_serialized and not identifier.strip():
            raise serializers.ValidationError(
                {"asset_identifier": "A serial, plate, or asset identifier is required."}
            )
        if not is_serialized and quantity < 1:
            raise serializers.ValidationError(
                {"quantity_available": "Pooled inventory must contain at least one unit."}
            )
        attributes = attrs.get("category_attributes")
        if attributes is not None and config.asset_profile_schema:
            try:
                validate_json_schema(attributes, config.asset_profile_schema)
            except JSONSchemaValidationError as exc:
                raise serializers.ValidationError({"category_attributes": exc.message}) from None
        return attrs

    def create(self, validated_data: dict) -> RentalAsset:
        attributes = validated_data.pop("category_attributes", {})
        asset = super().create(validated_data)
        RentalAssetCategoryProfile.objects.create(asset=asset, attributes=attributes)
        return asset

    def update(self, instance: RentalAsset, validated_data: dict) -> RentalAsset:
        attributes = validated_data.pop("category_attributes", None)
        asset = super().update(instance, validated_data)
        if attributes is not None:
            RentalAssetCategoryProfile.objects.update_or_create(
                asset=asset,
                defaults={"attributes": attributes},
            )
        return asset

    def to_representation(self, instance: RentalAsset) -> dict:
        data = super().to_representation(instance)
        profile = getattr(instance, "category_profile", None)
        data["category_attributes"] = profile.attributes if profile else {}
        return data


class RentalHoldCreateSerializer(serializers.Serializer):
    asset_id = serializers.UUIDField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    quantity = serializers.IntegerField(default=1, min_value=1)
    delivery_mode = serializers.ChoiceField(
        choices=RentalBooking.DeliveryMode.choices,
        default=RentalBooking.DeliveryMode.PICKUP,
    )
    delivery_address_id = serializers.UUIDField(required=False, allow_null=True)


class RentalBookingLineSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore[override]
        model = RentalBookingLine
        fields = ("id", "line_type", "amount_paise", "currency", "description")


class RentalDepositSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore[override]
        model = RentalDeposit
        fields = (
            "id",
            "amount_paise",
            "authorized_amount_paise",
            "captured_amount_paise",
            "consumed_amount_paise",
            "refunded_amount_paise",
            "status",
            "capture_mode",
            "updated_at",
        )


class RentalHandoverSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore[override]
        model = RentalHandover
        fields = (
            "id",
            "assigned_serial",
            "condition_notes",
            "photo_urls",
            "checklist",
            "handed_over_at",
        )


class RentalReturnInspectionSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore[override]
        model = RentalReturnInspection
        fields = (
            "id",
            "returned_at",
            "condition_notes",
            "photo_urls",
            "damage_found",
            "damage_estimated_paise",
            "damage_details",
            "late_days",
            "late_fee_paise",
            "settlement_matrix_outcome",
        )


class RentalBookingDetailSerializer(serializers.ModelSerializer):
    lines = RentalBookingLineSerializer(many=True, read_only=True)
    deposit = RentalDepositSerializer(read_only=True)
    handover = RentalHandoverSerializer(read_only=True)
    return_inspection = RentalReturnInspectionSerializer(read_only=True)
    extensions = RentalExtensionSerializer(many=True, read_only=True)
    asset_title = serializers.CharField(source="asset.title", read_only=True)
    daily_price_paise = serializers.IntegerField(source="asset.daily_price_paise", read_only=True)
    deposit_paise = serializers.IntegerField(source="asset.deposit_paise", read_only=True)
    vendor_name = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    delivery_address = serializers.SerializerMethodField()

    class Meta:  # type: ignore[override]
        model = RentalBooking
        fields = (
            "id",
            "customer_id",
            "customer_name",
            "customer_phone",
            "delivery_address",
            "asset_id",
            "asset_title",
            "daily_price_paise",
            "deposit_paise",
            "vendor_name",
            "assigned_serial",
            "rental_start",
            "rental_end",
            "quantity",
            "delivery_mode",
            "status",
            "lines",
            "deposit",
            "handover",
            "return_inspection",
            "extensions",
            "created_at",
            "updated_at",
        )

    def get_vendor_name(self, obj: RentalBooking) -> str:
        partner = getattr(obj.asset, "partner", None)
        partner_id = getattr(partner, "id", None)
        return (
            getattr(getattr(partner, "business_profile", None), "legal_name", None)
            or (partner.user.get_full_name() if partner and hasattr(partner, "user") else "")
            or f"Partner #{str(partner_id)[:8] if partner_id else ''}"
        )

    def get_customer_name(self, obj: RentalBooking) -> str:
        cust = getattr(obj, "customer", None)
        if not cust:
            return "Customer"
        return getattr(cust, "full_name", "") or getattr(cust, "phone_number", "") or "Customer"

    def get_customer_phone(self, obj: RentalBooking) -> str:
        cust = getattr(obj, "customer", None)
        return getattr(cust, "phone_number", "") if cust else ""

    def get_delivery_address(self, obj: RentalBooking) -> dict[str, Any] | None:
        addr = obj.delivery_address
        if not addr:
            return None
        return {
            "line1": addr.line1,
            "line2": addr.line2,
            "locality": addr.locality,
            "city": addr.city,
            "state": addr.state,
            "postal_code": addr.postal_code,
        }


class RecordHandoverInputSerializer(serializers.Serializer[dict[str, Any]]):
    photo_urls = serializers.ListField(child=serializers.URLField(), allow_empty=False)
    condition_notes = serializers.CharField(required=False, allow_blank=True, default="")
    checklist = serializers.DictField(required=False, default=dict)
    assigned_serial = serializers.CharField(required=False, allow_blank=True, default="")


class RecordReturnInspectionInputSerializer(serializers.Serializer[dict[str, Any]]):
    photo_urls = serializers.ListField(child=serializers.URLField(), allow_empty=True, default=list)
    condition_notes = serializers.CharField(required=False, allow_blank=True, default="")
    damage_found = serializers.BooleanField(default=False)
    damage_estimated_paise = serializers.IntegerField(default=0, min_value=0)
    damage_details = serializers.DictField(required=False, default=dict)
    late_days = serializers.IntegerField(default=0, min_value=0)


class RequestExtensionInputSerializer(serializers.Serializer[dict[str, Any]]):
    new_end_date = serializers.DateField()


class DisputeDepositInputSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(max_length=500)


class OperationsReassignInputSerializer(serializers.Serializer[dict[str, Any]]):
    new_asset_id = serializers.UUIDField()


class OperationsResolveDisputeInputSerializer(serializers.Serializer[dict[str, Any]]):
    refund_customer_paise = serializers.IntegerField(min_value=0)
    vendor_payout_paise = serializers.IntegerField(min_value=0)
    resolution_note = serializers.CharField(max_length=500)


class CancelRentalBookingInputSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")


class ConfirmExtensionPaymentInputSerializer(serializers.Serializer[dict[str, Any]]):
    payment_attempt_id = serializers.UUIDField(required=False, allow_null=True)


class RentalMaintenancePeriodCreateSerializer(serializers.Serializer[dict[str, Any]]):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    reason = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")

    def validate(self, attrs: dict) -> dict:
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError(
                {"end_date": "Maintenance end cannot be earlier than its start."}
            )
        return attrs


class RentalAssetMediaCreateSerializer(serializers.Serializer[dict[str, Any]]):
    url = serializers.URLField(max_length=500)
    caption = serializers.CharField(max_length=140, required=False, allow_blank=True, default="")
    is_primary = serializers.BooleanField(default=False)
