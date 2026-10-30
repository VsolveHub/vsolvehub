"""When a Partner works, and whether they are online right now.

Two related but separate things share this slice. The *schedule* is the standing
answer — weekly rules plus dated exceptions, per service area — written by the
Partner or, with a recorded consent, by Operations on their behalf. *Presence* is
the live answer: going online with a located consent, heartbeating, and going off.

The boundary: nothing here reads or writes the application record. Onboarding and
profile contracts live in `onboarding`.
"""

from datetime import datetime

from django.utils import timezone
from rest_framework import serializers

from apps.partners.models import (
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerOnlineSession,
    PartnerPushSubscription,
)


class PartnerAvailabilityRuleInputSerializer(serializers.Serializer[dict[str, object]]):
    service_area_id = serializers.UUIDField()
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    starts_at = serializers.TimeField()
    ends_at = serializers.TimeField()
    ends_next_day = serializers.BooleanField(required=False, default=False)


class PartnerAvailabilityExceptionInputSerializer(serializers.Serializer[dict[str, object]]):
    service_area_id = serializers.UUIDField()
    date = serializers.DateField()
    is_available = serializers.BooleanField()
    starts_at = serializers.TimeField(required=False, allow_null=True)
    ends_at = serializers.TimeField(required=False, allow_null=True)
    ends_next_day = serializers.BooleanField(required=False, default=False)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        if attrs["is_available"] and (
            attrs.get("starts_at") is None or attrs.get("ends_at") is None
        ):
            raise serializers.ValidationError(
                "Available exceptions require a start and end time.",
            )
        return attrs


class PartnerScheduleUpdateSerializer(serializers.Serializer[dict[str, object]]):
    rules = PartnerAvailabilityRuleInputSerializer(many=True)
    exceptions = PartnerAvailabilityExceptionInputSerializer(many=True)


class OperationsPartnerScheduleUpdateSerializer(PartnerScheduleUpdateSerializer):
    consent_purpose = serializers.SlugField(max_length=100)
    consent_document_version = serializers.CharField(max_length=80)


class PartnerAvailabilityRuleSerializer(
    serializers.ModelSerializer[PartnerAvailabilityRule],
):
    service_area_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = PartnerAvailabilityRule
        fields = (
            "id",
            "service_area_id",
            "weekday",
            "starts_at",
            "ends_at",
            "ends_next_day",
            "is_active",
        )
        read_only_fields = fields


class PartnerAvailabilityExceptionSerializer(
    serializers.ModelSerializer[PartnerAvailabilityException],
):
    service_area_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = PartnerAvailabilityException
        fields = (
            "id",
            "service_area_id",
            "date",
            "is_available",
            "starts_at",
            "ends_at",
            "ends_next_day",
            "reason",
        )
        read_only_fields = fields


class PartnerScheduleSerializer(serializers.Serializer[dict[str, object]]):
    rules = PartnerAvailabilityRuleSerializer(many=True, read_only=True)
    exceptions = PartnerAvailabilityExceptionSerializer(many=True, read_only=True)


class PartnerGoOnlineSerializer(serializers.Serializer[dict[str, object]]):
    service_area_id = serializers.UUIDField()
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-90, max_value=90)
    longitude = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        min_value=-180,
        max_value=180,
    )
    accuracy_m = serializers.IntegerField(min_value=1, max_value=10_000)
    consent_version = serializers.CharField(max_length=80)


class PartnerPresenceHeartbeatSerializer(serializers.Serializer[dict[str, object]]):
    session_id = serializers.UUIDField()
    latitude = serializers.DecimalField(
        required=False,
        max_digits=9,
        decimal_places=6,
        min_value=-90,
        max_value=90,
    )
    longitude = serializers.DecimalField(
        required=False,
        max_digits=9,
        decimal_places=6,
        min_value=-180,
        max_value=180,
    )
    accuracy_m = serializers.IntegerField(required=False, min_value=1, max_value=10_000)
    consent_version = serializers.CharField(required=False, max_length=80)

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        location_fields = {"latitude", "longitude", "accuracy_m", "consent_version"}
        supplied_fields = location_fields.intersection(attrs)
        if supplied_fields and supplied_fields != location_fields:
            raise serializers.ValidationError(
                "A location refresh requires latitude, longitude, accuracy_m, and consent_version.",
            )
        return attrs


class PartnerPresenceSessionRequestSerializer(serializers.Serializer[dict[str, object]]):
    session_id = serializers.UUIDField()


class PartnerPresenceSerializer(serializers.ModelSerializer[PartnerOnlineSession]):
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = PartnerOnlineSession
        fields = (
            "id",
            "service_area_id",
            "started_at",
            "last_persisted_heartbeat_at",
            "server_now",
        )
        read_only_fields = fields

    def get_server_now(self, _session: PartnerOnlineSession) -> datetime:
        return timezone.now()


class PartnerPushSubscriptionSyncSerializer(serializers.Serializer[dict[str, object]]):
    onesignal_subscription_id = serializers.CharField(max_length=64)
    platform = serializers.ChoiceField(
        choices=PartnerPushSubscription.Platform.choices,
        default=PartnerPushSubscription.Platform.WEB,
        required=False,
    )
    user_agent = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(default=True)
