from rest_framework import serializers

from apps.stay.models import Property, StayEnquiry, Unit


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


class PropertySerializer(serializers.ModelSerializer):
    public_state = serializers.CharField(read_only=True)
    host_name = serializers.CharField(source="host.display_name", read_only=True)
    units = UnitSerializer(many=True, read_only=True)

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
            "units",
            "created_at",
        )


class CreatePropertySerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    title = serializers.CharField(max_length=180)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    location_text = serializers.CharField(required=False, allow_blank=True, default="")
    unit_name = serializers.CharField(required=False, default="Standard room")
    nightly_rate_paise = serializers.IntegerField(min_value=1, required=False, default=100000)
    sharing_count = serializers.IntegerField(min_value=1, required=False, default=1)


class CreateEnquirySerializer(serializers.Serializer):
    property_id = serializers.UUIDField()
    unit_id = serializers.UUIDField(required=False, allow_null=True)
    check_in = serializers.DateField()
    check_out = serializers.DateField()
    guest_count = serializers.IntegerField(min_value=1, required=False, default=1)
    message = serializers.CharField(required=False, allow_blank=True, default="")


class StayEnquirySerializer(serializers.ModelSerializer):
    property_title = serializers.CharField(source="property.title", read_only=True)

    class Meta:
        model = StayEnquiry
        fields = (
            "id",
            "property",
            "property_title",
            "unit",
            "status",
            "check_in",
            "check_out",
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
