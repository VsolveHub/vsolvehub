"""Onboarding: the application a Partner submits, and the person it turns into.

Covers the applicant's own draft/submit contracts, the document upload and
finalize handshake, the consent and skill vocabularies the form offers, the
Operations review-queue and transition projections, and the profile reads that
answer *who is this Partner* as distinct from *what did they fill in to join*.

The boundary: everything here is about the application record and the profile it
belongs to. Scheduling and presence live in `availability`; the Operations
management directory lives in `directory`; the M2 capability, insurance, gate and
crew contracts live in `m2`.
"""

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerProfile,
    Skill,
)
from apps.partners.selectors import partner_has_required_consents, required_document_kinds
from apps.payouts.models import PartnerPayoutAccount

#: Serializer context value for the applicant reading their own application. Without it the
#: payload is the Operations view, with every reason and the reviewer's id.
APPLICANT_AUDIENCE = "applicant"


class PartnerConsentInputSerializer(serializers.Serializer[dict[str, object]]):
    purpose = serializers.SlugField(max_length=100)
    document_version = serializers.CharField(max_length=80)


class PartnerApplicationUpdateSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(required=False, min_value=1)
    #: ``STAY_HOST`` for partners who list their own property; they skip trades, areas and hours.
    track = serializers.ChoiceField(choices=PartnerApplication.Track.choices, required=False)
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
            PartnerApplication.Status.DECLINED,
            PartnerApplication.Status.SUSPENDED,
            PartnerApplication.Status.OFFBOARDED,
        ),
    )
    # Optional for the decisions that do not need one, so leaving it out means "no reason". The
    # default matters: the service takes ``reason`` as a required argument, and an omitted field
    # used to reach it as a missing keyword — a 500 on every Approve with the reason box empty.
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")


class OperationsDocumentReviewSerializer(serializers.Serializer[dict[str, object]]):
    decision = serializers.ChoiceField(
        choices=(PartnerDocument.Status.APPROVED, PartnerDocument.Status.REJECTED),
    )
    reason = serializers.CharField(required=False, default="", allow_blank=True, max_length=2000)


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


class PartnerDocumentDetailMetadataSerializer(serializers.ModelSerializer[PartnerDocument]):
    label = serializers.CharField(read_only=True)  # type: ignore[assignment]
    file_name = serializers.CharField(read_only=True)
    mime_type = serializers.CharField(source="content_type", read_only=True)
    file_size = serializers.IntegerField(source="size_bytes", read_only=True)
    rejection_reason = serializers.CharField(
        source="review_reason", read_only=True, allow_null=True
    )

    class Meta:
        model = PartnerDocument
        fields = (
            "id",
            "kind",
            "label",
            "status",
            "version",
            "file_name",
            "mime_type",
            "file_size",
            "uploaded_at",
            "rejection_reason",
        )
        read_only_fields = fields


class PartnerDocumentApplicantAccessSerializer(serializers.Serializer[dict[str, object]]):
    document = PartnerDocumentDetailMetadataSerializer(read_only=True)
    access_url = serializers.URLField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True, required=False)


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
    """A skill a Partner can claim — and, since Wave C7, the id a rate card is published against.

    `id` was added because of what its absence did on a different screen. `m2_rate_card_publish`
    takes `skill_id` as a uuid, and this was the only endpoint that lists skills; publishing
    `code`, `name` and `description` and withholding the id meant the form that decides **what
    every A3 customer in a city is charged** required an operator to type a uuid they had no way to
    look up. Paste the wrong one and the price is published against the wrong trade, and it is
    priced into every booking made until somebody notices.

    Read-only and additive: the applicant-onboarding chooser that already reads this list is
    unaffected by a field it does not use.
    """

    class Meta:
        model = Skill
        fields = ("id", "code", "name", "description")
        read_only_fields = fields


class PartnerDocumentSerializer(serializers.ModelSerializer[PartnerDocument]):
    file_name = serializers.CharField(read_only=True)
    can_replace = serializers.SerializerMethodField()

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
            "file_name",
            "can_replace",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.BooleanField())
    def get_can_replace(document: PartnerDocument) -> bool:
        """Whether the Partner may upload a new version of this document right now.

        Only the newest version of a kind can be replaced, and only when the application allows
        it (`PartnerApplication.allows_document_change`, the rule the upload endpoint enforces).
        Clients render a Replace action from this flag and nothing else.
        """
        application = document.application
        latest = max(
            (other for other in application.documents.all() if other.kind == document.kind),
            key=lambda other: other.version,
            default=None,
        )
        if latest is None or latest.pk != document.pk:
            return False
        return application.allows_document_change(latest)


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

    `default_location_text` is the registered pickup / address used to prefill A7
    rental ads (still editable per asset).

    **Not** `display_name`. It is the name on the application Operations checked
    against the Partner's ID, so it is fixed once the application is sent; before
    that it is edited on the application itself.

    **Not** `phone_number`. That is the login credential: changing it moves who
    can sign in, so it belongs behind an OTP challenge on the *new* number, not
    behind a field on a profile form. A `PATCH` that accepted it would either let
    a hijacked session lock the real Partner out, or let a typo do the same by
    accident.

    Skills and service areas are absent for a different reason: Operations
    reviewed them, and a field here would silently reopen a reviewed decision.
    """

    default_location_text = serializers.CharField(
        max_length=240, required=False, allow_blank=True, trim_whitespace=True
    )

    @staticmethod
    def validate_default_location_text(value: str) -> str:
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
            "default_location_text",
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
    can_edit = serializers.BooleanField(source="is_editable", read_only=True)
    required_document_kinds = serializers.SerializerMethodField()
    consents_complete = serializers.SerializerMethodField()

    class Meta:
        model = PartnerApplication
        fields = (
            "id",
            "partner_id",
            "status",
            "track",
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
            "can_edit",
            "required_document_kinds",
            "consents_complete",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(
        serializers.ListField(child=serializers.ChoiceField(choices=PartnerDocument.Kind.choices))
    )
    def get_required_document_kinds(application: PartnerApplication) -> list[str]:
        """The document kinds submission and approval require — the server's list, not a copy."""
        return list(required_document_kinds(application.track))

    @staticmethod
    @extend_schema_field(serializers.BooleanField())
    def get_consents_complete(application: PartnerApplication) -> bool:
        """Every agreement currently required for submission is accepted, at its current version."""
        return partner_has_required_consents(application.partner)

    def to_representation(self, instance: PartnerApplication) -> dict[str, Any]:
        """The applicant's own view drops what belongs to Operations.

        A reviewer's words reach the applicant only when they were written for them — a request
        for changes. Decline, suspension and approval notes stay in the audit trail, as does a
        reviewer handing the application back to the queue and who that reviewer is.
        """
        data = super().to_representation(instance)
        if self.context.get("audience") != APPLICANT_AUDIENCE:
            return data
        data["review_assigned_to_id"] = None
        data["transitions"] = [
            {
                **transition,
                "reason": transition["reason"]
                if transition["to_status"] == PartnerApplication.Status.CHANGES_REQUIRED
                else "",
            }
            for transition in data["transitions"]
            if transition["reason_code"] != "application_review_released"
        ]
        return data

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
