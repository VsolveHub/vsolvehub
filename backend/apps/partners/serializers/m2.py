"""M2 (proposal 0013): business identity, capabilities, insurance, gates, crew.

Everything below publishes a domain function that already existed and was already tested. If a
serializer here needed new behaviour to make sense, the behaviour would be in the wrong layer.

The boundary: the M2 workforce/project contracts only — the business profile a Partner declares,
the capability request/review lifecycle, declared languages, the insurance declaration, the
advisory progressive-gate read, and the crew roster. The M1 onboarding, availability and
management-directory contracts live in their own slices.
"""

from datetime import date

from rest_framework import serializers

from apps.partners.gates import GateNextAction, ProgressiveGate
from apps.partners.models import (
    CrewAvailabilityException,
    CrewDocument,
    CrewMember,
    PartnerBusinessProfile,
    PartnerInsuranceDeclaration,
)


class PartnerBusinessProfileSerializer(serializers.ModelSerializer[PartnerBusinessProfile]):
    class Meta:
        model = PartnerBusinessProfile
        fields = (
            "business_type",
            "legal_name",
            "registration_number",
            "gst_registered",
            "gstin",
            "gstin_verified_at",
            "registered_state_code",
            "tax_profile_effective_from",
            "years_in_operation",
            "upi_vpa",
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
    #: The lead's own UPI ID, for the evening "Day settled?" convenience link (`M2-BE-536`).
    #:
    #: **This is not a payout rail and must never become one.** A3 wages are peer-to-peer: the
    #: Customer's own UPI app sends the money to this address and Vsolve never holds, routes,
    #: books or reconciles it. It is deliberately here rather than on the payout account, because
    #: that is where Vsolve pays somebody and this is where somebody else pays them. Blank is the
    #: ordinary state — the deep link is simply not offered and the published amount still is.
    upi_vpa = serializers.CharField(required=False, allow_blank=True, max_length=120, default="")


class OperationsTaxProfileVerifySerializer(serializers.Serializer[dict[str, object]]):
    registered_state_code = serializers.CharField(
        required=False, allow_blank=True, max_length=8, default=""
    )


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
    #: The category-specific registration questions for this variant, from the same versioned
    #: schema the answers are validated against. Empty is the ordinary state.
    registration_questions = serializers.ListField(
        child=serializers.JSONField(),
        read_only=True,
    )
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
    #: Optional narrowing. Omitted or empty means "every area I work in", which is what most
    #: Partners want and what the server stores as an empty set.
    service_area_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    #: Answers to the variant's registration questions. Validated server-side against the versioned
    #: schema; the client never decides what counts as a complete answer set.
    registration_answers = serializers.JSONField(required=False, default=dict)


class CapabilitySubmitSerializer(serializers.Serializer[dict[str, object]]):
    """Submit or resubmit one capability for review.

    `registration_answers` is optional so a resubmit that only fixed a document does not have to
    resend the answers. Sending them replaces the stored set and revalidates it.
    """

    registration_answers = serializers.JSONField(required=False, allow_null=True)


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
    #: Empty means every area this Partner serves. A non-empty list is an Operations narrowing and
    #: must be rendered as a restriction, never as the Partner's coverage.
    service_area_ids = serializers.ListField(child=serializers.UUIDField(), read_only=True)
    registration_answers = serializers.JSONField(read_only=True)
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


class PartnerLanguageWriteSerializer(serializers.Serializer[dict[str, object]]):
    #: The whole set, every time. An empty list is a valid answer meaning "I have not said", and it
    #: is not the same as declaring English — matching excludes only on a declaration that
    #: contradicts the requirement.
    language_tags = serializers.ListField(
        child=serializers.CharField(max_length=16),
        allow_empty=True,
    )


class PartnerLanguageListSerializer(serializers.Serializer[dict[str, object]]):
    language_tags = serializers.ListField(child=serializers.CharField(), read_only=True)


class CrewAvailabilityWriteSerializer(serializers.Serializer[dict[str, object]]):
    date = serializers.DateField()
    is_available = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True, max_length=200)


class CrewAvailabilitySerializer(serializers.ModelSerializer[CrewAvailabilityException]):
    class Meta:
        model = CrewAvailabilityException
        fields = ("id", "date", "is_available", "reason", "recorded_at")
        read_only_fields = fields


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


class CrewDocumentStateSerializer(serializers.Serializer[dict[str, object]]):
    """Where one kind of identity document stands, as the Partner is allowed to see it.

    No reviewer name and no link to the file. A Partner is entitled to know whether their worker
    is cleared and, on a rejection, why; who inside Operations decided is not theirs, and the
    stored object is reachable only through a reviewer's short-lived signed link.
    """

    kind = serializers.ChoiceField(choices=CrewDocument.Kind.choices, read_only=True)
    status = serializers.ChoiceField(choices=CrewDocument.Status.choices, read_only=True)
    #: Populated on a rejection only. An approval needs no reason and inventing one would be noise
    #: on a screen whose whole job is to show what still needs doing.
    reason = serializers.CharField(read_only=True, allow_blank=True)
    updated_at = serializers.DateTimeField(read_only=True)


class CrewDocumentUploadRequestSerializer(serializers.Serializer[dict[str, object]]):
    """What the Partner declares before a byte is sent.

    Declared up front so the stored object can be checked against it afterwards. A client that
    says "a 2 MB PDF with this digest" and uploads something else fails at `submit`, not at a
    reviewer's desk.
    """

    kind = serializers.ChoiceField(choices=CrewDocument.Kind.choices)
    content_type = serializers.CharField(max_length=120)
    size_bytes = serializers.IntegerField(min_value=1)
    sha256 = serializers.RegexField(r"^[0-9a-f]{64}$", max_length=64)


class CrewDocumentUploadGrantSerializer(serializers.Serializer[dict[str, object]]):
    """Where to PUT the file, and the row that is waiting for it."""

    document_id = serializers.UUIDField(read_only=True)
    kind = serializers.ChoiceField(choices=CrewDocument.Kind.choices, read_only=True)
    upload_url = serializers.CharField(read_only=True)
    upload_token = serializers.CharField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)
    #: The bucket refuses anything larger, so the app should refuse it first -- a Partner on a
    #: metered connection should not upload ten megabytes to be told no at the end.
    max_bytes = serializers.IntegerField(read_only=True)


class CrewDocumentSubmitSerializer(serializers.Serializer[dict[str, object]]):
    document_id = serializers.UUIDField()


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
    #: Blank until somebody records it. Blank is the state that costs the Partner work -- a
    #: Customer booking women cannot be matched with a roster whose genders are unknown at the
    #: strict gates -- so the roster screen shows the gap rather than hiding it.
    gender = serializers.ChoiceField(
        choices=CrewMember.Gender.choices, read_only=True, allow_blank=True
    )
    documents = CrewDocumentStateSerializer(many=True, read_only=True)


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
    gender = serializers.ChoiceField(
        choices=CrewMember.Gender.choices, required=False, allow_blank=True, default=""
    )


class CrewMemberUpdateSerializer(serializers.Serializer[dict[str, object]]):
    """The name this agency uses, their skills, the supervisor flag, and gender.

    `display_name` writes `PartnerCrewMembership.display_name` -- a per-roster label -- and never
    the global `CrewMember`. That is what makes it safe to edit: the shared row keeps whatever the
    first agency registered, and one agency correcting a typo cannot rename the person on another
    agency's screen. Blank is allowed and means "use the global name", which is where every row
    starts.
    """

    display_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    skill_codes = serializers.ListField(
        child=serializers.SlugField(max_length=100),
        required=False,
    )
    is_supervisor = serializers.BooleanField(required=False)
    #: Fills a blank; a value contradicting another agency's is refused, never overwritten
    #: (`m2_crew_gender_conflict`). Omitting it changes nothing -- there is no way to clear one.
    gender = serializers.ChoiceField(
        choices=CrewMember.Gender.choices, required=False, allow_blank=True, default=""
    )
