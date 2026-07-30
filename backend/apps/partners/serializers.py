"""Partner request and response contracts."""

from datetime import datetime

from django.utils import timezone
from rest_framework import serializers

from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerConsent,
    PartnerDocument,
    PartnerOnlineSession,
)


class PartnerConsentInputSerializer(serializers.Serializer[dict[str, object]]):
    purpose = serializers.SlugField(max_length=100)
    document_version = serializers.CharField(max_length=80)


class PartnerApplicationUpdateSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(required=False, min_value=1)
    display_name = serializers.CharField(max_length=120, trim_whitespace=True)
    biography = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    experience_years = serializers.IntegerField(required=False, min_value=0, max_value=80)
    skill_codes = serializers.ListField(
        child=serializers.SlugField(max_length=100),
        allow_empty=False,
    )
    service_variant_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
    )
    service_area_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
    )
    consents = PartnerConsentInputSerializer(many=True)
    device_identifier = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=128,
        write_only=True,
    )

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        for field in ("skill_codes", "service_variant_ids", "service_area_ids"):
            values = attrs[field]
            if isinstance(values, list) and len(values) != len(set(values)):
                raise serializers.ValidationError({field: "Duplicate values are not allowed."})
        return attrs


class PartnerDocumentCreateSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(min_value=1)
    kind = serializers.ChoiceField(choices=PartnerDocument.Kind.choices)
    object_key = serializers.CharField(max_length=500)
    content_type = serializers.CharField(max_length=120)
    size_bytes = serializers.IntegerField(min_value=1, max_value=20 * 1024 * 1024)
    sha256 = serializers.RegexField(regex=r"^[0-9a-f]{64}$", max_length=64)


class ExpectedVersionSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(min_value=1)


class OperationsTransitionSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(min_value=1)
    target_status = serializers.ChoiceField(
        choices=(
            PartnerApplication.Status.UNDER_REVIEW,
            PartnerApplication.Status.CHANGES_REQUIRED,
            PartnerApplication.Status.APPROVED,
            PartnerApplication.Status.SUSPENDED,
            PartnerApplication.Status.OFFBOARDED,
        ),
    )
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class OperationsDocumentReviewSerializer(serializers.Serializer[dict[str, object]]):
    decision = serializers.ChoiceField(
        choices=(PartnerDocument.Status.APPROVED, PartnerDocument.Status.REJECTED),
    )
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class PartnerConsentSerializer(serializers.ModelSerializer[PartnerConsent]):
    class Meta:
        model = PartnerConsent
        fields = ("id", "purpose", "document_version", "accepted_at", "withdrawn_at")
        read_only_fields = fields


class PartnerDocumentSerializer(serializers.ModelSerializer[PartnerDocument]):
    class Meta:
        model = PartnerDocument
        fields = (
            "id",
            "kind",
            "version",
            "content_type",
            "size_bytes",
            "sha256",
            "status",
            "review_reason",
            "uploaded_at",
            "reviewed_at",
        )
        read_only_fields = fields


class PartnerApplicationTransitionSerializer(
    serializers.ModelSerializer[PartnerApplicationTransition],
):
    class Meta:
        model = PartnerApplicationTransition
        fields = (
            "id",
            "from_status",
            "to_status",
            "reason_code",
            "reason",
            "application_version",
            "occurred_at",
        )
        read_only_fields = fields


class PartnerApplicationSerializer(serializers.ModelSerializer[PartnerApplication]):
    partner_id = serializers.UUIDField(source="partner.id", read_only=True)
    display_name = serializers.CharField(source="partner.display_name", read_only=True)
    biography = serializers.CharField(source="partner.biography", read_only=True)
    experience_years = serializers.IntegerField(
        source="partner.experience_years",
        read_only=True,
    )
    skill_codes = serializers.SerializerMethodField()
    service_variant_ids = serializers.SerializerMethodField()
    service_area_ids = serializers.SerializerMethodField()
    consents = PartnerConsentSerializer(source="partner.consents", many=True, read_only=True)
    documents = PartnerDocumentSerializer(many=True, read_only=True)
    transitions = PartnerApplicationTransitionSerializer(many=True, read_only=True)

    class Meta:
        model = PartnerApplication
        fields = (
            "id",
            "partner_id",
            "status",
            "version",
            "display_name",
            "biography",
            "experience_years",
            "skill_codes",
            "service_variant_ids",
            "service_area_ids",
            "change_request_message",
            "submitted_at",
            "reviewed_at",
            "consents",
            "documents",
            "transitions",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_skill_codes(self, application: PartnerApplication) -> list[str]:
        return [link.skill.code for link in application.partner.skill_links.all() if link.is_active]

    def get_service_variant_ids(self, application: PartnerApplication) -> list[str]:
        return [
            str(link.variant_id)
            for link in application.partner.service_links.all()
            if link.is_active
        ]

    def get_service_area_ids(self, application: PartnerApplication) -> list[str]:
        return [
            str(link.service_area_id)
            for link in application.partner.service_area_links.all()
            if link.is_active
        ]


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
