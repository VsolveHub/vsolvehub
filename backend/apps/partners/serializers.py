"""Partner request and response contracts."""

from datetime import date, datetime

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.partners.gates import GateNextAction, ProgressiveGate
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerBusinessProfile,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerInsuranceDeclaration,
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


# ------------------------------------------------------------------------------------------
# Partner management directory
#
# Defined at the end of the module because the detail projection composes
# `PartnerApplicationTransitionSerializer` and `PartnerDocument`, both declared above.
# ------------------------------------------------------------------------------------------


class PartnerSkillChipSerializer(serializers.Serializer[dict[str, object]]):
    """A code/name pair, for the chips the directory renders."""

    code = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)


class OperationsPartnerDirectoryQuerySerializer(serializers.Serializer[dict[str, object]]):
    """The directory's filters.

    `status` accepts every application status, unlike the review queue's three. A management
    screen that could not show approved, suspended or offboarded Partners would be a screen that
    cannot answer "who works for us".
    """

    status = serializers.ChoiceField(choices=PartnerApplication.Status.choices, required=False)
    #: Repeatable: `?skill=electrical&skill=plumbing`. Read with `getlist` in the view, because
    #: a plain `Serializer` sees only the last value of a repeated query parameter.
    skill = serializers.ListField(
        child=serializers.SlugField(max_length=100), required=False, default=list
    )
    cursor = serializers.CharField(required=False, write_only=True)


class OperationsPartnerDirectoryItemSerializer(serializers.ModelSerializer[PartnerProfile]):
    """One directory row.

    Carries the application's *status* but none of its contents. Deciding on an application is
    the review surface's job, behind its own audit; this row exists so somebody can find a
    Partner.
    """

    application_id = serializers.UUIDField(source="application.id", read_only=True)
    application_status = serializers.CharField(source="application.status", read_only=True)
    submitted_at = serializers.DateTimeField(source="application.submitted_at", read_only=True)
    reviewed_at = serializers.DateTimeField(source="application.reviewed_at", read_only=True)
    skills = serializers.SerializerMethodField()
    service_count = serializers.IntegerField(read_only=True)
    service_area_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PartnerProfile
        fields = (
            "id",
            "display_name",
            "experience_years",
            "application_id",
            "application_status",
            "submitted_at",
            "reviewed_at",
            "skills",
            "service_count",
            "service_area_count",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(PartnerSkillChipSerializer(many=True))
    def get_skills(self, partner: PartnerProfile) -> list[dict[str, object]]:
        return [
            {"code": link.skill.code, "name": link.skill.name} for link in partner.skill_links.all()
        ]


class OperationsPartnerDirectoryPageSerializer(serializers.Serializer[dict[str, object]]):
    next = serializers.URLField(read_only=True, allow_null=True)
    previous = serializers.URLField(read_only=True, allow_null=True)
    results = OperationsPartnerDirectoryItemSerializer(many=True, read_only=True)


class OperationsPartnerDocumentStateSerializer(serializers.ModelSerializer[PartnerDocument]):
    """A document's existence and verdict — never its contents.

    No URL and no storage key, by design. Revealing a document goes through
    `OperationsPartnerDocumentAccessView`, which mints a short-lived link and records who
    looked; publishing one here would route around that audit.
    """

    class Meta:
        model = PartnerDocument
        fields = ("id", "kind", "status", "reviewed_at", "uploaded_at")
        read_only_fields = fields


class OperationsPartnerDetailSerializer(serializers.ModelSerializer[PartnerProfile]):
    """One Partner, for the management screen."""

    application_id = serializers.UUIDField(source="application.id", read_only=True)
    application_status = serializers.CharField(source="application.status", read_only=True)
    application_version = serializers.IntegerField(source="application.version", read_only=True)
    change_request_message = serializers.CharField(
        source="application.change_request_message", read_only=True
    )
    submitted_at = serializers.DateTimeField(source="application.submitted_at", read_only=True)
    reviewed_at = serializers.DateTimeField(source="application.reviewed_at", read_only=True)
    skills = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()
    service_areas = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    transitions = serializers.SerializerMethodField()

    class Meta:
        model = PartnerProfile
        fields = (
            "id",
            "display_name",
            "biography",
            "experience_years",
            "application_id",
            "application_status",
            "application_version",
            "change_request_message",
            "submitted_at",
            "reviewed_at",
            "skills",
            "services",
            "service_areas",
            "documents",
            "transitions",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(PartnerSkillChipSerializer(many=True))
    def get_skills(self, partner: PartnerProfile) -> list[dict[str, object]]:
        return [
            {"code": link.skill.code, "name": link.skill.name} for link in partner.skill_links.all()
        ]

    @extend_schema_field(PartnerSkillChipSerializer(many=True))
    def get_services(self, partner: PartnerProfile) -> list[dict[str, object]]:
        return [
            {
                "code": link.variant.service.slug,
                "name": f"{link.variant.service.name} - {link.variant.name}",
            }
            for link in partner.service_links.all()
        ]

    @extend_schema_field(PartnerSkillChipSerializer(many=True))
    def get_service_areas(self, partner: PartnerProfile) -> list[dict[str, object]]:
        return [
            {"code": link.service_area.slug, "name": link.service_area.name}
            for link in partner.service_area_links.all()
        ]

    @extend_schema_field(OperationsPartnerDocumentStateSerializer(many=True))
    def get_documents(self, partner: PartnerProfile) -> list[dict[str, object]]:
        application = getattr(partner, "application", None)
        if application is None:
            return []
        data = OperationsPartnerDocumentStateSerializer(application.documents.all(), many=True).data
        return list(data)

    @extend_schema_field(PartnerApplicationTransitionSerializer(many=True))
    def get_transitions(self, partner: PartnerProfile) -> list[dict[str, object]]:
        application = getattr(partner, "application", None)
        if application is None:
            return []
        ordered = sorted(application.transitions.all(), key=lambda row: row.occurred_at)
        return list(PartnerApplicationTransitionSerializer(ordered, many=True).data)


# ---------------------------------------------------------------------------
# M2 (proposal 0013): business identity, capabilities, insurance, gates, crew
#
# Everything below publishes a domain function that already existed and was already tested. If a
# serializer here needed new behaviour to make sense, the behaviour would be in the wrong layer.
# ---------------------------------------------------------------------------


class PartnerBusinessProfileSerializer(serializers.ModelSerializer[PartnerBusinessProfile]):
    class Meta:
        model = PartnerBusinessProfile
        fields = (
            "business_type",
            "legal_name",
            "registration_number",
            "gst_registered",
            "gstin",
            "years_in_operation",
            "updated_at",
        )
        read_only_fields = fields


class PartnerBusinessProfileWriteSerializer(serializers.Serializer[dict[str, object]]):
    """A full replace, not a merge.

    `business_type` is required and is **read, never inferred** - not from the capability requested,
    not from the services selected. The three types carry different tax, liability and payout
    consequences, so the Partner states which one they are and the platform does not guess.
    """

    business_type = serializers.ChoiceField(choices=PartnerBusinessProfile.BusinessType.choices)
    legal_name = serializers.CharField(required=False, allow_blank=True, max_length=200)
    registration_number = serializers.CharField(required=False, allow_blank=True, max_length=64)
    gst_registered = serializers.BooleanField(required=False, default=False)
    gstin = serializers.CharField(required=False, allow_blank=True, max_length=15)
    years_in_operation = serializers.IntegerField(required=False, min_value=0, max_value=200)


class BusinessTypeOptionSerializer(serializers.Serializer[dict[str, object]]):
    value = serializers.CharField(read_only=True)
    #: Shadows `Field.label`, exactly as `carts.serializers` and `catalog.serializers` already do.
    label = serializers.CharField(read_only=True)  # type: ignore[assignment]
    #: The useful half. "I supply a team" means nothing on its own; "the customer pays you
    #: directly" is the sentence that decides whether somebody picks it.
    consequence = serializers.CharField(read_only=True)


class CapabilityOptionSerializer(serializers.Serializer[dict[str, object]]):
    variant_id = serializers.UUIDField(read_only=True)
    variant_name = serializers.CharField(read_only=True)
    category_name = serializers.CharField(read_only=True)
    #: Opaque, exactly as in the workspace grant. Never parsed, never derived.
    workspace_key = serializers.CharField(read_only=True)
    commercial_mode = serializers.CharField(read_only=True)
    lifecycle_explanation = serializers.CharField(read_only=True)
    #: Server-authored. A client that inferred "A3 means insurance" would keep inferring it through
    #: the policy change that made it false for one variant.
    requires_insurance = serializers.BooleanField(read_only=True)
    #: Which request fields this archetype needs. One form serves both archetypes because the
    #: server names the fields, rather than the client branching on the archetype.
    asks_for = serializers.ListField(child=serializers.CharField(), read_only=True)
    already_requested = serializers.BooleanField(read_only=True)


class CapabilityOptionsSerializer(serializers.Serializer[dict[str, object]]):
    business_types = BusinessTypeOptionSerializer(many=True, read_only=True)
    capabilities = CapabilityOptionSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class CapabilityRequestSerializer(serializers.Serializer[dict[str, object]]):
    variant_id = serializers.UUIDField()
    max_crew_size = serializers.IntegerField(required=False, min_value=1, allow_null=True)
    max_project_value_paise = serializers.IntegerField(
        required=False,
        min_value=1,
        allow_null=True,
    )


class CapabilityTransitionSummarySerializer(serializers.Serializer[dict[str, object]]):
    """The last decision on a capability, with its date and reason.

    Published without an `actor_kind`, deliberately. `PartnerCapabilityTransition.actor` is null
    both for a Partner's own action and for a system job, so a computed actor would confidently
    mislabel the case the client most needs to get right. The **status** now answers who:
    `REJECTED` is Operations and `WITHDRAWN` is the Partner. See proposal 0013 section "Answered".
    """

    to_status = serializers.CharField(read_only=True)
    reason_code = serializers.CharField(read_only=True)
    reason = serializers.CharField(read_only=True)
    occurred_at = serializers.DateTimeField(read_only=True)


class PartnerCapabilitySerializer(serializers.Serializer[dict[str, object]]):
    """One capability in any status. The read that distinguishes the navigation states.

    `/partner/workspaces/` answers *what may I do* and stays empty and cheap for the great majority
    of Partners who hold no capability at all. This answers *where does my application stand*, which
    is why the two are separate reads: an empty grant list cannot tell "not applied" from "under
    review" from "suspended", and inferring a review banner from it would show one to every existing
    M1 Partner.
    """

    id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    variant_name = serializers.CharField(read_only=True)
    workspace_key = serializers.CharField(read_only=True)
    commercial_mode = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    #: Guaranteed non-empty when `status` is `CHANGES_REQUIRED` or `REJECTED`, by
    #: `partners_capability_review_state_needs_notes` and by the transition guard.
    review_notes = serializers.CharField(read_only=True)
    suspension_reason_code = serializers.CharField(read_only=True)
    requires_insurance = serializers.BooleanField(read_only=True)
    max_crew_size = serializers.IntegerField(read_only=True, allow_null=True)
    max_project_value_paise = serializers.IntegerField(read_only=True, allow_null=True)
    #: Raw, and not projected into the status. A computed `EXPIRED` would be a status the model does
    #: not have, which is a second source of truth that will drift from the first.
    expires_at = serializers.DateTimeField(read_only=True, allow_null=True)
    #: Required document kinds whose recorded expiry has passed. Non-empty means this capability is
    #: not authorized right now even at `APPROVED` - `assert_capability_active` refuses on it.
    expired_document_kinds = serializers.ListField(child=serializers.CharField(), read_only=True)
    #: The next required document to expire, so the Partner is warned before an enquiry is refused
    #: rather than after.
    documents_expiring_on = serializers.DateField(read_only=True, allow_null=True)
    last_transition = CapabilityTransitionSummarySerializer(read_only=True, allow_null=True)
    reviewed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    updated_at = serializers.DateTimeField(read_only=True)


class PartnerCapabilityListSerializer(serializers.Serializer[dict[str, object]]):
    capabilities = PartnerCapabilitySerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class PartnerInsuranceSerializer(serializers.ModelSerializer[PartnerInsuranceDeclaration]):
    class Meta:
        model = PartnerInsuranceDeclaration
        #: `verified_at` is read-only and only Operations sets it. A client must render an
        #: unverified declaration as *declared*, never as *insured*: the difference is who carries
        #: the liability if a worker is hurt.
        fields = (
            "insurer_name",
            "policy_reference",
            "coverage_paise",
            "covers_workmen_compensation",
            "valid_from",
            "valid_to",
            "verified_at",
        )
        read_only_fields = fields


class PartnerInsuranceWriteSerializer(serializers.Serializer[dict[str, object]]):
    insurer_name = serializers.CharField(max_length=160)
    policy_reference = serializers.CharField(max_length=120)
    coverage_paise = serializers.IntegerField(min_value=1)
    covers_workmen_compensation = serializers.BooleanField(required=False, default=False)
    valid_from = serializers.DateField()
    valid_to = serializers.DateField()

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        valid_from = attrs["valid_from"]
        valid_to = attrs["valid_to"]
        if isinstance(valid_from, date) and isinstance(valid_to, date) and valid_to <= valid_from:
            raise serializers.ValidationError(
                {"valid_to": "The policy end date must be after the start date."}
            )
        return attrs


class ProgressiveGateSerializer(serializers.Serializer[dict[str, object]]):
    gate = serializers.ChoiceField(choices=ProgressiveGate.choices, read_only=True)
    is_satisfied = serializers.BooleanField(read_only=True)
    #: Actions, never screens. An unsatisfied gate never hides demand; it explains the one control
    #: it stands in front of.
    blocks = serializers.ListField(child=serializers.CharField(), read_only=True)
    reason = serializers.CharField(read_only=True)
    next_action = serializers.ChoiceField(
        choices=GateNextAction.choices,
        read_only=True,
        allow_null=True,
    )


class ProgressiveGateListSerializer(serializers.Serializer[dict[str, object]]):
    """**Advisory.** The commands enforce these; this read only decides what the UI explains first.

    A client treating it as authoritative would block somebody whose KYC completed thirty seconds
    ago and admit somebody suspended thirty seconds ago.
    """

    gates = ProgressiveGateSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class CrewMemberSerializer(serializers.Serializer[dict[str, object]]):
    """One worker on this Partner's roster.

    **`crew_member_id` is deliberately absent.** Identity is global - `CrewMember.identity_hash` -
    and publishing the global id to one agency would let two agencies correlate rosters and discover
    that a worker is on both. `membership_id` is per-Partner and is what every command takes.

    `phone_masked` rather than the number. The Partner supplied it, so this is not a leak in the
    quote-teaser sense, but the roster is read on a shared site phone and an unmasked list is a
    contact export waiting to happen. The Partner who needs the full number already has it.
    """

    membership_id = serializers.UUIDField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    phone_masked = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    is_supervisor = serializers.BooleanField(read_only=True)
    skill_codes = serializers.ListField(child=serializers.CharField(), read_only=True)
    documents_verified_at = serializers.DateTimeField(read_only=True, allow_null=True)
    added_at = serializers.DateTimeField(read_only=True)


class CrewListSerializer(serializers.Serializer[dict[str, object]]):
    members = CrewMemberSerializer(many=True, read_only=True)


class CrewMemberCreateSerializer(serializers.Serializer[dict[str, object]]):
    display_name = serializers.CharField(max_length=120)
    phone_e164 = serializers.RegexField(r"^\+[1-9]\d{7,14}$", max_length=16)
    skill_codes = serializers.ListField(
        child=serializers.SlugField(max_length=100),
        required=False,
        default=list,
    )
    is_supervisor = serializers.BooleanField(required=False, default=False)


class CrewMemberUpdateSerializer(serializers.Serializer[dict[str, object]]):
    """Skills and the supervisor flag only.

    `display_name` is **not** editable here. It belongs to the global `CrewMember`, which several
    agencies may share, so one agency renaming a person would rename them on every other roster.
    Read-only with the reason stated beats editable-and-scoped, which a later caller can forget.
    """

    skill_codes = serializers.ListField(
        child=serializers.SlugField(max_length=100),
        required=False,
    )
    is_supervisor = serializers.BooleanField(required=False)
