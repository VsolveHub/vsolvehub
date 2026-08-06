"""Partner request and response contracts."""

from datetime import datetime

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerOnlineSession,
    PartnerProfile,
    Skill,
)
from apps.payouts.models import PartnerPayoutAccount


class PartnerConsentInputSerializer(serializers.Serializer[dict[str, object]]):
    purpose = serializers.SlugField(max_length=100)
    document_version = serializers.CharField(max_length=80)


class PartnerApplicationUpdateSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(required=False, min_value=1)
    display_name = serializers.CharField(required=False, max_length=120, trim_whitespace=True)
    biography = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    experience_years = serializers.IntegerField(required=False, min_value=0, max_value=80)
    skill_codes = serializers.ListField(
        child=serializers.SlugField(max_length=100),
        required=False,
    )
    service_variant_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
    )
    service_area_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
    )
    consents = PartnerConsentInputSerializer(many=True, required=False)
    device_identifier = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=128,
        write_only=True,
    )

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        for field in ("skill_codes", "service_variant_ids", "service_area_ids"):
            values = attrs.get(field)
            if isinstance(values, list) and len(values) != len(set(values)):
                raise serializers.ValidationError({field: "Duplicate values are not allowed."})
        consents = attrs.get("consents")
        if isinstance(consents, list):
            purposes = [consent["purpose"] for consent in consents]
            if len(purposes) != len(set(purposes)):
                raise serializers.ValidationError(
                    {"consents": "Only one acceptance per consent purpose is allowed."},
                )
        mutable_fields = set(attrs) - {"expected_version", "device_identifier"}
        if not mutable_fields:
            raise serializers.ValidationError(
                "Supply at least one application field to update.",
            )
        return attrs


class PartnerDocumentUploadRequestSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(min_value=1)
    kind = serializers.ChoiceField(choices=PartnerDocument.Kind.choices)
    content_type = serializers.ChoiceField(
        choices=("image/jpeg", "image/png", "application/pdf"),
    )
    size_bytes = serializers.IntegerField(min_value=1, max_value=20 * 1024 * 1024)
    sha256 = serializers.RegexField(regex=r"^[0-9a-f]{64}$", max_length=64)


class PartnerDocumentUploadSerializer(serializers.Serializer[dict[str, object]]):
    id = serializers.UUIDField(read_only=True)
    kind = serializers.ChoiceField(choices=PartnerDocument.Kind.choices, read_only=True)
    object_key = serializers.CharField(read_only=True)
    content_type = serializers.CharField(read_only=True)
    size_bytes = serializers.IntegerField(read_only=True)
    sha256 = serializers.CharField(read_only=True)
    upload_url = serializers.URLField(read_only=True)
    upload_token = serializers.CharField(read_only=True)
    resumable_url = serializers.URLField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)


class PartnerDocumentFinalizeSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(min_value=1)
    upload_id = serializers.UUIDField()


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


class OperationsApplicationQueueQuerySerializer(serializers.Serializer[dict[str, object]]):
    status = serializers.ChoiceField(
        choices=(
            PartnerApplication.Status.SUBMITTED,
            PartnerApplication.Status.UNDER_REVIEW,
            PartnerApplication.Status.CHANGES_REQUIRED,
        ),
        required=False,
    )
    assigned_to_me = serializers.BooleanField(required=False, default=False)
    unassigned = serializers.BooleanField(required=False, default=False)
    cursor = serializers.CharField(required=False, write_only=True)

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        if attrs.get("assigned_to_me") and attrs.get("unassigned"):
            raise serializers.ValidationError(
                "Choose either assigned_to_me or unassigned, not both.",
            )
        return attrs


class PartnerDocumentReviewAccessSerializer(serializers.Serializer[dict[str, object]]):
    review_url = serializers.URLField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)


class PartnerConsentSerializer(serializers.ModelSerializer[PartnerConsent]):
    class Meta:
        model = PartnerConsent
        fields = ("id", "purpose", "document_version", "accepted_at", "withdrawn_at")
        read_only_fields = fields


class PartnerConsentDocumentSerializer(serializers.ModelSerializer[PartnerConsentDocument]):
    class Meta:
        model = PartnerConsentDocument
        fields = (
            "purpose",
            "title",
            "document_version",
            "document_url",
            "is_required_for_submission",
            "published_at",
        )
        read_only_fields = fields


class PartnerSkillOptionSerializer(serializers.ModelSerializer[Skill]):
    class Meta:
        model = Skill
        fields = ("code", "name", "description")
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
            "scan_status",
            "scanned_at",
            "status",
            "review_reason",
            "uploaded_at",
            "reviewed_at",
        )
        read_only_fields = fields


class OperationsApplicationQueueItemSerializer(
    serializers.ModelSerializer[PartnerApplication],
):
    display_name = serializers.CharField(source="partner.display_name", read_only=True)
    review_assigned_to_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = PartnerApplication
        fields = (
            "id",
            "status",
            "version",
            "display_name",
            "submitted_at",
            "review_assigned_to_id",
            "review_assigned_at",
            "updated_at",
        )
        read_only_fields = fields


class OperationsApplicationQueuePageSerializer(serializers.Serializer[dict[str, object]]):
    next = serializers.URLField(read_only=True, allow_null=True)
    previous = serializers.URLField(read_only=True, allow_null=True)
    results = OperationsApplicationQueueItemSerializer(many=True, read_only=True)


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


class PartnerProfileUpdateSerializer(serializers.Serializer[dict[str, object]]):
    """What a Partner may change about themselves without a review.

    `display_name` only. It is the name Customers see, so it is theirs to get
    right, and nothing downstream depends on its value.

    **Not** `phone_number`. That is the login credential: changing it moves who
    can sign in, so it belongs behind an OTP challenge on the *new* number, not
    behind a field on a profile form. A `PATCH` that accepted it would either let
    a hijacked session lock the real Partner out, or let a typo do the same by
    accident.

    Skills and service areas are absent for a different reason: Operations
    reviewed them, and a field here would silently reopen a reviewed decision.
    """

    display_name = serializers.CharField(max_length=120, trim_whitespace=True)

    @staticmethod
    def validate_display_name(value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Enter the name Customers should see.")
        return value.strip()


class PartnerProfileSerializer(serializers.ModelSerializer[PartnerProfile]):
    """Who the Partner is, as distinct from the form they filled in to join.

    `GET /partner/me/` used to return the application, which is why the app had no
    profile screen worth the name: opening "Profile" showed a half-finished
    onboarding draft. An application is a *submission* with a review lifecycle; a
    profile is a standing record of a person who works here. Those stop being the
    same thing the moment onboarding is approved.

    Carries what a Partner would expect to see about themselves and nothing about
    anyone else: no reviewer, no internal review notes, no other Partner's areas.
    `approval_status` is published because it decides whether they can work at
    all, and a Partner is entitled to know that without reading it off a rejected
    request.
    """

    phone_number = serializers.CharField(source="user.phone_number", read_only=True)
    approval_status = serializers.SerializerMethodField()
    skills = serializers.SerializerMethodField()
    service_areas = serializers.SerializerMethodField()
    member_since = serializers.DateTimeField(source="created_at", read_only=True)
    has_payout_account = serializers.SerializerMethodField()

    class Meta:
        model = PartnerProfile
        fields = (
            "id",
            "display_name",
            "phone_number",
            "biography",
            "experience_years",
            "approval_status",
            "skills",
            "service_areas",
            "member_since",
            "has_payout_account",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_approval_status(profile: PartnerProfile) -> str | None:
        application = getattr(profile, "application", None)
        return None if application is None else str(application.status)

    @staticmethod
    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_skills(profile: PartnerProfile) -> list[str]:
        """The work this Partner is approved to do, named the way a customer sees it."""
        return sorted(
            {link.variant.service.name for link in profile.service_links.all() if link.is_active}
        )

    @staticmethod
    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_service_areas(profile: PartnerProfile) -> list[str]:
        return sorted(
            {link.service_area.name for link in profile.service_area_links.all() if link.is_active}
        )

    @staticmethod
    @extend_schema_field(serializers.BooleanField())
    def get_has_payout_account(profile: PartnerProfile) -> bool:
        """Whether money has somewhere to go.

        Verified only: a pending or rejected account cannot be paid to, so
        reporting it as "set up" would tell a Partner their earnings are on the
        way when nothing can leave. No account details are published here.
        """
        return PartnerPayoutAccount.objects.filter(
            partner=profile,
            status=PartnerPayoutAccount.Status.VERIFIED,
        ).exists()


class PartnerApplicationSerializer(serializers.ModelSerializer[PartnerApplication]):
    partner_id = serializers.UUIDField(source="partner.id", read_only=True)
    review_assigned_to_id = serializers.UUIDField(read_only=True, allow_null=True)
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
            "review_assigned_to_id",
            "review_assigned_at",
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
