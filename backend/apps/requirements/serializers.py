"""Wire shapes for the M2 requirement, enquiry and proposal surface.

Two rules run through this file and neither is negotiable:

* **A requirement is free.** Nothing in the Customer requirement serializers carries a price,
  quotes one, or hints that one is coming. `is_free` on the submit response is read from the
  server that enforces the rule rather than hardcoded in a screen that outlives it.
* **A teaser is not a quote.** `QuoteTeaserSerializer` is an explicit field list, never a
  `ModelSerializer`. Before an active unlock the response must not carry vendor identity, contact,
  scope or an exact total — not in a field the UI happens not to render, because a client cannot
  un-receive a payload and cached identity survives a refund.
"""

from datetime import datetime
from typing import Any

from rest_framework import serializers

from apps.catalog.models import ServiceVariant
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    RequirementAttachment,
    RequirementQuestion,
    SiteVisit,
    VendorInvitation,
)
from apps.requirements.selectors import (
    closure_reason,
    confirmed_teaser_count,
    lifecycle_explanation,
    missing_answer_codes,
)

# ---------------------------------------------------------------------------
# Customer: requirement capture
# ---------------------------------------------------------------------------


class RequirementCreateSerializer(serializers.Serializer[dict[str, Any]]):
    variant_id = serializers.UUIDField()
    answers = serializers.JSONField(required=False, default=dict)
    language = serializers.CharField(max_length=16, required=False, default="en-IN")


class RequirementUpdateSerializer(serializers.Serializer[dict[str, Any]]):
    """Partial update, one screen at a time, for save-and-resume.

    Every field is optional and `None` means "not sent" rather than "clear this", matching
    `services.update_draft`, which skips `None` for exactly that reason.
    """

    answers = serializers.JSONField(required=False)
    address_id = serializers.UUIDField(required=False, allow_null=True)
    requested_start = serializers.DateTimeField(required=False, allow_null=True)
    flexibility_days = serializers.IntegerField(required=False, min_value=0, max_value=365)
    service_by = serializers.DateField(required=False, allow_null=True)
    budget_min_paise = serializers.IntegerField(required=False, min_value=0, allow_null=True)
    budget_max_paise = serializers.IntegerField(required=False, min_value=0, allow_null=True)
    additional_details = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=4000,
    )
    language = serializers.CharField(required=False, max_length=16)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        low = attrs.get("budget_min_paise")
        high = attrs.get("budget_max_paise")
        if low is not None and high is not None and high < low:
            raise serializers.ValidationError(
                {"budget_max_paise": "The top of the budget cannot be below the bottom."}
            )
        return attrs


class RequirementAttachmentSerializer(serializers.ModelSerializer[RequirementAttachment]):
    scan_status = serializers.CharField(source="processing_status", read_only=True)
    language = serializers.CharField(source="transcript_language", read_only=True)
    #: Why an attachment was refused, in words the Customer can act on. Empty for every other
    #: state — a reason attached to a clean file is a warning about nothing.
    scan_failure_reason = serializers.CharField(source="failure_reason", read_only=True)

    class Meta:
        model = RequirementAttachment
        fields = (
            "id",
            "kind",
            "scan_status",
            "scan_failure_reason",
            "size_bytes",
            "language",
        )
        read_only_fields = fields


class AttachmentUploadRequestSerializer(serializers.Serializer[dict[str, Any]]):
    """What the client declares before any bytes exist.

    The checksum is required, and it is the point of the whole handshake: finalization streams the
    stored object back and compares it against these three values, so an upload that swapped the
    file after presigning is refused rather than stored. Without them "verify the upload" would mean
    "believe the client".
    """

    kind = serializers.ChoiceField(choices=RequirementAttachment.Kind.choices)
    content_type = serializers.CharField(max_length=120)
    size_bytes = serializers.IntegerField(min_value=1)
    sha256 = serializers.CharField(min_length=64, max_length=64)
    #: For a voice note, the language it was spoken in. Carried through so a vendor who cannot
    #: understand it is a matching decision rather than a silent failure at the door.
    language = serializers.CharField(max_length=16, required=False, allow_blank=True, default="")


class AttachmentUploadGrantSerializer(serializers.Serializer[dict[str, Any]]):
    """The signed-upload grant. Bytes go to storage, never through Django."""

    id = serializers.UUIDField(read_only=True)
    kind = serializers.CharField(read_only=True)
    upload_url = serializers.URLField(read_only=True)
    upload_token = serializers.CharField(read_only=True)
    upload_expires_at = serializers.DateTimeField(read_only=True)
    #: `PENDING` on arrival, always. The object does not exist yet, so nothing has been scanned.
    scan_status = serializers.CharField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class AttachmentFinalizeSerializer(serializers.Serializer[dict[str, Any]]):
    upload_id = serializers.UUIDField()


class RequirementDraftSerializer(serializers.ModelSerializer[CustomerRequirement]):
    """The full record the four-screen flow reads after every write.

    `inferred_lifecycle` is published but is never rendered as an archetype name — `GAP-006` is
    explicit that the Customer describes what they need and the platform works out the lifecycle.
    `lifecycle_explanation` is the sentence they actually see.
    """

    category_slug = serializers.SlugField(source="variant.service.slug", read_only=True)
    inferred_lifecycle = serializers.CharField(source="archetype", read_only=True)
    lifecycle_explanation = serializers.SerializerMethodField()
    missing_required_answers = serializers.SerializerMethodField()
    address_id = serializers.UUIDField(read_only=True, allow_null=True)
    #: Derived from `flexibility_days`, which stays the source of truth. Published because the
    #: date-flexibility control is a checkbox and re-deriving the boolean per client is how two
    #: apps end up disagreeing about what zero days means.
    is_date_flexible = serializers.SerializerMethodField()
    attachments = RequirementAttachmentSerializer(many=True, read_only=True)
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = CustomerRequirement
        fields = (
            "id",
            "status",
            "category_slug",
            "inferred_lifecycle",
            "lifecycle_explanation",
            "answers",
            "missing_required_answers",
            "address_id",
            "requested_start",
            "flexibility_days",
            "is_date_flexible",
            "service_by",
            "budget_min_paise",
            "budget_max_paise",
            "language",
            "additional_details",
            "attachments",
            "server_now",
        )
        read_only_fields = fields

    def get_lifecycle_explanation(self, obj: CustomerRequirement) -> str | None:
        return lifecycle_explanation(obj.archetype)

    def get_missing_required_answers(self, obj: CustomerRequirement) -> list[str]:
        return missing_answer_codes(obj)

    def get_is_date_flexible(self, obj: CustomerRequirement) -> bool:
        return obj.flexibility_days > 0

    def get_server_now(self, _obj: CustomerRequirement) -> str:
        server_now: datetime = self.context["server_now"]
        return server_now.isoformat()


class RequirementSubmitSerializer(serializers.Serializer[dict[str, Any]]):
    #: Set only after the Customer has seen the duplicate and chosen to continue anyway. The
    #: override is explicit because a silent one turns the duplicate check into decoration.
    allow_duplicate = serializers.BooleanField(required=False, default=False)


class RequirementSubmittedSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField(read_only=True)
    status = serializers.CharField(read_only=True)
    service_by = serializers.DateField(read_only=True, allow_null=True)
    quote_delivery_deadline_at = serializers.DateTimeField(read_only=True, allow_null=True)
    #: Not decoration. `M2-FE-212` requires the submit screen to promise nothing is charged until
    #: quotes arrive, and that promise belongs to the server that enforces it.
    is_free = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class RequirementSummarySerializer(serializers.ModelSerializer[CustomerRequirement]):
    """A `My requests` row."""

    category_slug = serializers.SlugField(source="variant.service.slug", read_only=True)
    lifecycle_explanation = serializers.SerializerMethodField()
    quote_delivery_deadline_at = serializers.DateTimeField(source="quotes_due_at", read_only=True)
    teaser_count = serializers.SerializerMethodField()
    closure_reason = serializers.SerializerMethodField()
    last_activity_at = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = CustomerRequirement
        fields = (
            "id",
            "status",
            "category_slug",
            "lifecycle_explanation",
            "service_by",
            "quote_delivery_deadline_at",
            "teaser_count",
            "closure_reason",
            "last_activity_at",
        )
        read_only_fields = fields

    def get_lifecycle_explanation(self, obj: CustomerRequirement) -> str | None:
        return lifecycle_explanation(obj.archetype)

    def get_teaser_count(self, obj: CustomerRequirement) -> int:
        annotated = getattr(obj, "teaser_count", None)
        return annotated if isinstance(annotated, int) else confirmed_teaser_count(obj)

    def get_closure_reason(self, obj: CustomerRequirement) -> str | None:
        return closure_reason(obj)


class RequirementSummaryPageSerializer(serializers.Serializer[dict[str, Any]]):
    """The page envelope `My requests` has always been sent, now also declared.

    Until 13 August the operation declared a bare array and the view returned this envelope, so a
    client generated from the contract threw on its first real request and every consumer had to
    hand-write a narrowing around the generated type. The shape is
    `carts.serializers.BookingGroupPageSerializer`'s, because there is no reason for two page
    envelopes in one API.
    """

    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = RequirementSummarySerializer(many=True)


class DuplicateCheckQuerySerializer(serializers.Serializer[dict[str, Any]]):
    variant_id = serializers.UUIDField()
    address_id = serializers.UUIDField()
    requested_start = serializers.DateTimeField()


class ProbableDuplicateSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    #: Server-authored. The client never reconstructs a summary from another requirement's answers.
    summary = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    mergeable = serializers.BooleanField(read_only=True)


class ProbableDuplicateListSerializer(serializers.Serializer[dict[str, Any]]):
    probable_duplicates = ProbableDuplicateSerializer(many=True, read_only=True)


class RequirementTimelineEventSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.CharField(read_only=True)
    at = serializers.DateTimeField(read_only=True)
    type = serializers.CharField(read_only=True)
    detail = serializers.JSONField(read_only=True)


class RequirementTimelineSerializer(serializers.Serializer[dict[str, Any]]):
    events = RequirementTimelineEventSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


# ---------------------------------------------------------------------------
# Customer: teasers
# ---------------------------------------------------------------------------


class QuoteTeaserSerializer(serializers.Serializer[dict[str, Any]]):
    """**This payload goes to a Customer who has paid nothing.**

    An explicit field list rather than a `ModelSerializer`, because the difference between the two
    is one `fields` edit away from shipping a vendor's name to an unpaid Customer. The price
    *band* is the point: enough to judge whether unlocking is worth it, not enough to act on.
    """

    proposal_id = serializers.UUIDField(read_only=True)
    vendor_type = serializers.CharField(read_only=True)
    is_verified = serializers.BooleanField(read_only=True)
    price_band_low_paise = serializers.IntegerField(read_only=True)
    price_band_high_paise = serializers.IntegerField(read_only=True)
    is_out_of_budget = serializers.BooleanField(read_only=True)


class QuoteTeaserListSerializer(serializers.Serializer[dict[str, Any]]):
    teasers = QuoteTeaserSerializer(many=True, read_only=True)
    usable_quote_count = serializers.IntegerField(read_only=True)
    #: Mirrors the server's own guard so the control can be disabled, never so the client can
    #: decide. The unlock command refuses independently — a stale `true` is exactly the state a
    #: duplicate purchase lives in.
    unlock_available = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


# ---------------------------------------------------------------------------
# Clarification, shared by both roles
# ---------------------------------------------------------------------------


class RequirementQuestionSerializer(serializers.ModelSerializer[RequirementQuestion]):
    class Meta:
        model = RequirementQuestion
        fields = ("id", "invitation", "question", "answer", "asked_at", "answered_at")
        read_only_fields = fields


class QuestionCreateSerializer(serializers.Serializer[dict[str, Any]]):
    question = serializers.CharField(max_length=2000)


class QuestionAnswerSerializer(serializers.Serializer[dict[str, Any]]):
    answer = serializers.CharField(max_length=2000)


class SiteVisitSerializer(serializers.ModelSerializer[SiteVisit]):
    class Meta:
        model = SiteVisit
        fields = (
            "id",
            "status",
            "fee_paise",
            "adjusts_against_final_price",
            "scheduled_for",
            "completed_at",
        )
        read_only_fields = fields


class SiteVisitRequestSerializer(serializers.Serializer[dict[str, Any]]):
    #: No default. A free site visit gets refused by vendors who will not travel unpaid, and used
    #: by Customers as free consulting; the fee is what makes the visit real. The domain refuses
    #: a non-positive fee, and a default here would put a policy number in a serializer.
    fee_paise = serializers.IntegerField(min_value=1)
    adjusts_against_final_price = serializers.BooleanField(required=False, default=True)


class SiteVisitScheduleSerializer(serializers.Serializer[dict[str, Any]]):
    scheduled_for = serializers.DateTimeField()


class SiteVisitCompleteSerializer(serializers.Serializer[dict[str, Any]]):
    #: Optional. A visit that happened and produced nothing worth writing down is still a visit
    #: that happened, and requiring prose here would produce prose nobody reads.
    outcome_notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)


# ---------------------------------------------------------------------------
# Partner: enquiries and proposals
# ---------------------------------------------------------------------------


class EnquirySummarySerializer(serializers.ModelSerializer[VendorInvitation]):
    """An enquiry list row.

    Reads the **snapshot**, not the live requirement: the snapshot is what this vendor was invited
    against, and re-reading the requirement would silently move the goalposts under a quote in
    progress. Customer identity and address are absent before acceptance by design.
    """

    requirement_id = serializers.UUIDField(read_only=True)
    category_slug = serializers.SlugField(
        source="requirement.variant.service.slug",
        read_only=True,
    )
    archetype = serializers.CharField(source="snapshot.archetype", read_only=True)
    requested_start = serializers.DateTimeField(source="snapshot.requested_start", read_only=True)
    service_by = serializers.DateField(source="snapshot.service_by", read_only=True)
    language = serializers.CharField(source="snapshot.language", read_only=True)
    #: Guidance for a countdown only. The backend owns expiry and slot ownership; a client clock
    #: that has drifted must never be what decides an enquiry is still open.
    responds_by = serializers.DateTimeField(read_only=True)

    class Meta:
        model = VendorInvitation
        #: Annotated widely so the detail subclass can extend it. Without this the inherited
        #: `Meta` fixes the tuple at its own arity and every added field is a type error.
        fields: tuple[str, ...] = (
            "id",
            "requirement_id",
            "category_slug",
            "archetype",
            "status",
            "wave",
            "requested_start",
            "service_by",
            "language",
            "responds_by",
            "created_at",
        )
        read_only_fields: tuple[str, ...] = fields


class EnquirySummaryPageSerializer(serializers.Serializer[dict[str, Any]]):
    """The Partner enquiry inbox's page envelope.

    The same correction as `RequirementSummaryPageSerializer`, and it closes a second gap Session B
    logged: no `cursor` parameter was published, so a Partner with more than twenty enquiries saw a
    silently truncated inbox with no way to page past it.
    """

    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = EnquirySummarySerializer(many=True)


class VendorAttachmentSerializer(serializers.Serializer[dict[str, Any]]):
    """One of the Customer's checked files, as a short-lived signed link.

    `download_url` is a bearer credential — anyone holding it holds the file — which is why it is
    minted per read and expires in minutes rather than being stored anywhere.
    """

    id = serializers.UUIDField(read_only=True)
    kind = serializers.CharField(read_only=True)
    size_bytes = serializers.IntegerField(read_only=True)
    #: For a voice note, the language it was spoken in — the field that decides whether this vendor
    #: can act on it at all.
    language = serializers.CharField(read_only=True, allow_blank=True)
    download_url = serializers.URLField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)


class VendorAttachmentListSerializer(serializers.Serializer[dict[str, Any]]):
    """Attachments this vendor may see, and whether they still may.

    `has_access` is `false` once the invitation was declined, expired or withdrawn and this vendor
    was not selected. It is published as a state on a `200` rather than as an error because the
    vendor is entitled to their own enquiry record either way, and because "there are no
    photographs" and "you may no longer see the photographs" are different things to render.
    """

    has_access = serializers.BooleanField(read_only=True)
    attachments = VendorAttachmentSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class EnquiryDetailSerializer(EnquirySummarySerializer):
    answers = serializers.JSONField(source="snapshot.answers", read_only=True)
    additional_details = serializers.CharField(
        source="snapshot.additional_details",
        read_only=True,
    )
    budget_min_paise = serializers.IntegerField(
        source="snapshot.budget_min_paise",
        read_only=True,
        allow_null=True,
    )
    budget_max_paise = serializers.IntegerField(
        source="snapshot.budget_max_paise",
        read_only=True,
        allow_null=True,
    )
    questions = RequirementQuestionSerializer(many=True, read_only=True)
    site_visits = SiteVisitSerializer(many=True, read_only=True)

    class Meta(EnquirySummarySerializer.Meta):
        fields = (
            *EnquirySummarySerializer.Meta.fields,
            "answers",
            "additional_details",
            "budget_min_paise",
            "budget_max_paise",
            "decline_reason_code",
            "questions",
            "site_visits",
        )
        read_only_fields = fields


class EnquiryDeclineSerializer(serializers.Serializer[dict[str, Any]]):
    #: Required, and the database agrees: `requirements_decline_needs_reason` refuses a declined
    #: invitation with an empty reason. Declines without reasons make replacement guesswork.
    reason_code = serializers.SlugField(max_length=80)


class ProposalSerializer(serializers.ModelSerializer[Proposal]):
    """A vendor's own quote, read back to that vendor.

    Not the Customer-facing quote view — that requires an active unlock and arrives with BE4.
    """

    class Meta:
        model = Proposal
        fields = (
            "id",
            "requirement",
            "invitation",
            "revision",
            "status",
            "usability",
            "rate_paise_per_worker_day",
            "minimum_days",
            "worker_count",
            "total_paise",
            "tax_paise",
            "tax_basis",
            "commission_treatment",
            "inclusions",
            "exclusions",
            "stages",
            "warranty_terms",
            "valid_until",
            "vendor_confirmed_at",
            "submitted_at",
        )
        read_only_fields = fields


class ProposalCreateSerializer(serializers.Serializer[dict[str, Any]]):
    """Both composers in one shape; the domain validates which fields the archetype requires.

    Deliberately not two serializers. `proposals.submit_proposal` already runs `_assert_a3_shape`
    or `_assert_a5_shape` against the requirement's own archetype, and a second archetype check
    here would be a copy of that rule which could disagree with it. A vendor sending A5 stages on
    an A3 requirement gets one refusal, from the layer that knows.
    """

    invitation_id = serializers.UUIDField()
    total_paise = serializers.IntegerField(min_value=1)
    tax_basis = serializers.ChoiceField(choices=Proposal.TaxBasis.choices)
    tax_paise = serializers.IntegerField(min_value=0, required=False, default=0)

    rate_paise_per_worker_day = serializers.IntegerField(
        min_value=1, required=False, allow_null=True
    )
    minimum_days = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    worker_count = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    stages = serializers.ListField(child=serializers.JSONField(), required=False)
    inclusions = serializers.ListField(child=serializers.CharField(max_length=200), required=False)
    exclusions = serializers.ListField(child=serializers.CharField(max_length=200), required=False)
    warranty_terms = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    valid_until = serializers.DateTimeField(required=False, allow_null=True)
    commission_treatment = serializers.CharField(required=False, allow_blank=True, max_length=24)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("tax_paise", 0) > attrs["total_paise"]:
            raise serializers.ValidationError(
                {"tax_paise": "Tax cannot be more than the quoted total."}
            )
        return attrs


# ---------------------------------------------------------------------------
# Partner: workspace grants
# ---------------------------------------------------------------------------


class WorkspaceGrantSerializer(serializers.Serializer[dict[str, Any]]):
    """`{workspace_key, commercial_mode, actions[]}` and nothing else.

    No routes, no labels, no icons: the backend authorises, the frontend owns presentation. The
    key is opaque — a client that does not recognise one renders nothing rather than a generic
    tab, because a tab whose screens are not in the bundle is an unrecoverable dead end.
    """

    workspace_key = serializers.ChoiceField(
        choices=ServiceVariant.BookingArchetype.choices,
        read_only=True,
    )
    #: Read, never derived. ADR-0007 fixes A3 as LEAD_ONLY and A5 as MANAGED_PAYMENT_REQUIRED,
    #: which makes inferring it from the key tempting and wrong: this is the field that decides
    #: whether the UI promises Vsolve protection or tells a Partner to collect directly, and a
    #: client that computes it keeps promising protection straight through a policy change.
    commercial_mode = serializers.CharField(read_only=True)
    actions = serializers.ListField(child=serializers.CharField(), read_only=True)


class WorkspaceGrantListSerializer(serializers.Serializer[dict[str, Any]]):
    #: An empty list is a real, common state — registered but not yet reviewed — and must reach
    #: the client as `200 {"workspaces": []}` rather than a 403 that renders as an error.
    workspaces = WorkspaceGrantSerializer(many=True, read_only=True)


# ---------------------------------------------------------------------------
# Partner: masked demand preview
# ---------------------------------------------------------------------------


class DemandSummarySerializer(serializers.Serializer[dict[str, Any]]):
    """**This payload goes to a Partner who has completed no KYC.**

    An explicit field list, like `QuoteTeaserSerializer` and for the mirrored reason. Absent by
    requirement, not by omission: customer name, phone, full address, building number, the exact
    budget, and any identifier that resolves to a requirement this Partner was not invited to.

    `id` is a keyed hash rather than the requirement's primary key. An unapproved account holding
    real requirement ids is one lookup away from the record the moment any endpoint accepts one, and
    "no endpoint accepts one today" is not a property that survives the next endpoint.
    """

    id = serializers.CharField(read_only=True)
    headline = serializers.CharField(read_only=True)
    area_label = serializers.CharField(read_only=True)
    starts_on = serializers.DateField(read_only=True, allow_null=True)
    workspace_key = serializers.CharField(read_only=True)
    is_eligible = serializers.BooleanField(read_only=True)
    eligibility_hint = serializers.CharField(read_only=True)


class DemandPreviewSerializer(serializers.Serializer[dict[str, Any]]):
    #: Empty is a real answer. No demand in a Partner's city is `200` with `[]`, never a `404`.
    summaries = DemandSummarySerializer(many=True, read_only=True)
    matched_service_count = serializers.IntegerField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)
