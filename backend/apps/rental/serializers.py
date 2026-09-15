from rest_framework import serializers

from apps.rental.models import RentalAsset, RentalBooking, RentalDeposit


class RentalAssetSerializer(serializers.ModelSerializer):
    public_state = serializers.CharField(read_only=True)
    partner_name = serializers.CharField(source="partner.display_name", read_only=True)

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
            "created_at",
        )
        read_only_fields = fields


class CreateAssetSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    title = serializers.CharField(max_length=180)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    location_text = serializers.CharField(required=False, allow_blank=True, default="")
    daily_rate_paise = serializers.IntegerField(min_value=1)
    deposit_paise = serializers.IntegerField(min_value=0, required=False, default=0)
    asset_identifier = serializers.CharField(required=False, allow_blank=True, default="")


class CreateBookingSerializer(serializers.Serializer):
    asset_id = serializers.UUIDField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    pickup_or_delivery_mode = serializers.CharField(required=False, default="PICKUP")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class RentalDepositSerializer(serializers.ModelSerializer):
    class Meta:
        model = RentalDeposit
        fields = ("id", "amount_paise", "status", "consumed_paise", "provider_note")


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
