"""Wave C6 (`M2-BE-701..719`): cancellation, cases, and the Operations workspace.

Cancellation and its counterparty confirmation, the party-sized view of a case, the assisted
capture shapes, the crew verification queue, and the queue-depth, touch-count and reconciliation
reads Operations runs the product from. The boundary is the audience, and the banner below says
why there are two projections of the same case rather than one wide one.
"""

from typing import Any

from rest_framework import serializers

from apps.catalog.models import ServiceVariant
from apps.partners.models import CrewDocument, CrewMember
from apps.requirements.models import CommercialPolicy

from .enquiries import ProposalCreateSerializer


class CommercialPolicySerializer(serializers.ModelSerializer[CommercialPolicy]):
    class Meta:
        model = CommercialPolicy
        fields = (
            "id",
            "version",
            "status",
            "approval_reference",
            "effective_from",
            "effective_until",
            "approved_at",
            "supplier_of_record",
            "material_supplier_of_record",
            "visit_supplier_of_record",
            "tax_basis",
            "tax_rates_bps",
            "material_tax_category",
            "charge_tax_categories",
            "platform_fee_treatment",
            "platform_fee_bps",
            "platform_fee_tax_bps",
            "commission_bps",
            "commission_basis",
            "withholding_bps",
            "withholding_basis",
        )
        read_only_fields = fields


class CommercialPolicyActivateSerializer(serializers.Serializer[dict[str, Any]]):
    version = serializers.IntegerField(min_value=1)
    approval_reference = serializers.CharField(max_length=120)
    effective_from = serializers.DateTimeField()
    effective_until = serializers.DateTimeField(required=False, allow_null=True, default=None)
    supplier_of_record = serializers.ChoiceField(choices=CommercialPolicy.SupplierOfRecord.choices)
    material_supplier_of_record = serializers.ChoiceField(
        choices=CommercialPolicy.SupplierOfRecord.choices
    )
    visit_supplier_of_record = serializers.ChoiceField(
        choices=CommercialPolicy.SupplierOfRecord.choices
    )
    tax_basis = serializers.ChoiceField(choices=CommercialPolicy.TaxBasis.choices)
    tax_rates_bps = serializers.DictField(
        child=serializers.IntegerField(min_value=0, max_value=10_000), allow_empty=False
    )
    material_tax_category = serializers.SlugField(max_length=100)
    charge_tax_categories = serializers.DictField(
        child=serializers.SlugField(max_length=100), required=False, default=dict
    )
    platform_fee_treatment = serializers.ChoiceField(
        choices=CommercialPolicy.PlatformFeeTreatment.choices
    )
    platform_fee_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    platform_fee_tax_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    commission_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    commission_basis = serializers.ChoiceField(choices=CommercialPolicy.AmountBasis.choices)
    withholding_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    withholding_basis = serializers.ChoiceField(choices=CommercialPolicy.AmountBasis.choices)


# ---------------------------------------------------------------------------
# Wave C6: cancellation, cases, and the Operations workspace (`M2-BE-701..719`)
#
# Two audiences and two projections, kept apart on purpose. A **party** reads their own view of a
# cancellation or a case: what it is, what it means for their money, when they have to answer.
# **Operations** reads the whole thing, vendor identities included. The M1 `OperationsCase`
# serializers are documented as having exactly one audience for exactly this reason, and Wave C6
# does not widen them — it publishes a separate, smaller party view beside them.
# ---------------------------------------------------------------------------


class CancellationRequestSerializer(serializers.Serializer[dict[str, Any]]):
    """Ask what calling this job off would mean, and start it."""

    reason_code = serializers.SlugField(max_length=80)
    reason = serializers.CharField(max_length=2000, allow_blank=True, default="")
    #: References into rails that already hold evidence — attachment ids, stage-evidence ids —
    #: never bytes. A cancellation is not an upload surface.
    evidence = serializers.ListField(
        child=serializers.DictField(), required=False, default=list, max_length=20
    )


class CancellationDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    """The counterparty confirms or disputes (`M2-BE-702`)."""

    confirm = serializers.BooleanField()
    reason = serializers.CharField(max_length=2000, allow_blank=True, default="")


class RequirementCancellationSerializer(serializers.Serializer[dict[str, Any]]):
    """One cancellation, as either party may read it. Both sides see the same numbers."""

    id = serializers.UUIDField()
    status = serializers.CharField()
    actor_role = serializers.CharField()
    reason_code = serializers.SlugField()
    reason = serializers.CharField(allow_blank=True)
    remedy_code = serializers.SlugField(allow_blank=True)
    #: The per-product arithmetic. A free-form object rather than four optional typed blocks,
    #: because a cancelled A5 request genuinely has three simultaneous outcomes — an earned visit
    #: share, a refunded one and a milestone coming back — and collapsing them into one shape
    #: would either lie or be four nulls.
    remedy = serializers.DictField()
    contact_disclosed = serializers.BooleanField()
    work_reported_started = serializers.BooleanField()
    requires_counterparty_confirmation = serializers.BooleanField()
    confirmation_due_at = serializers.DateTimeField(allow_null=True)
    confirmed_at = serializers.DateTimeField(allow_null=True)
    disputed_at = serializers.DateTimeField(allow_null=True)
    executed_at = serializers.DateTimeField(allow_null=True)
    operations_case_id = serializers.UUIDField(allow_null=True)
    created_at = serializers.DateTimeField()
    server_now = serializers.DateTimeField()


class PartyCaseSerializer(serializers.Serializer[dict[str, Any]]):
    """A case as one of its two parties may read it.

    Deliberately **not** `OperationsCaseSerializer`. That projection carries the owning team, the
    internal notes and the full event trail, and its own docstring says it has one audience — a
    case can quote a Customer's complaint verbatim and name a Partner in a safety report. What a
    party gets is their own view: what it is, when they must answer, and what was decided.
    """

    id = serializers.UUIDField()
    kind = serializers.CharField()
    status = serializers.CharField()
    summary = serializers.CharField()
    opened_at = serializers.DateTimeField()
    response_due_at = serializers.DateTimeField(allow_null=True)
    resolution = serializers.CharField(allow_blank=True)
    resolved_at = serializers.DateTimeField(allow_null=True)
    appeal_requested_at = serializers.DateTimeField(allow_null=True)
    appeal_outcome = serializers.CharField(allow_blank=True)
    holds_payout = serializers.BooleanField()
    server_now = serializers.DateTimeField()


class PartyCaseListSerializer(serializers.Serializer[dict[str, Any]]):
    cases = PartyCaseSerializer(many=True)
    server_now = serializers.DateTimeField()


class WarrantyClaimSerializer(serializers.Serializer[dict[str, Any]]):
    """The Customer calls on a warranty the retention was held against."""

    summary = serializers.CharField(max_length=240)
    detail = serializers.CharField(max_length=4000, allow_blank=True, default="")


class CaseEvidenceSerializer(serializers.Serializer[dict[str, Any]]):
    """Point at something already uploaded, and say what it proves.

    There is no file field here and there is not going to be one: `M2-BE-704`'s evidence reuses the
    two verified rails M2 already has — the requirement-attachment presign and the stage-evidence
    presign — rather than adding a third place a malware verdict could be forgotten.
    """

    statement = serializers.CharField(max_length=1000, allow_blank=True, default="")
    requirement_attachment_id = serializers.UUIDField(required=False, allow_null=True)
    stage_evidence_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        artifacts = [attrs.get("requirement_attachment_id"), attrs.get("stage_evidence_id")]
        present = [value for value in artifacts if value is not None]
        if len(present) > 1:
            raise serializers.ValidationError("One piece of evidence points at one file.")
        if not present and not str(attrs.get("statement", "")).strip():
            raise serializers.ValidationError("Evidence needs a statement or a file.")
        return attrs


class CaseEvidenceRecordSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    party = serializers.CharField()
    statement = serializers.CharField(allow_blank=True)
    requirement_attachment_id = serializers.UUIDField(allow_null=True)
    stage_evidence_id = serializers.UUIDField(allow_null=True)
    created_at = serializers.DateTimeField()


class CaseAppealRequestSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(max_length=480)


class CaseAppealDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    expected_version = serializers.IntegerField(min_value=1)
    outcome = serializers.ChoiceField(choices=(("UPHELD", "Upheld"), ("OVERTURNED", "Overturned")))
    note = serializers.CharField(max_length=480)


class CaseOverrideSerializer(serializers.Serializer[dict[str, Any]]):
    expected_version = serializers.IntegerField(min_value=1)
    resolution = serializers.CharField(max_length=48)
    note = serializers.CharField(max_length=480)


class CaseResponseDeadlineSerializer(serializers.Serializer[dict[str, Any]]):
    expected_version = serializers.IntegerField(min_value=1)
    response_due_at = serializers.DateTimeField()
    reason = serializers.CharField(max_length=480)


class TimelineEventSerializer(serializers.Serializer[dict[str, Any]]):
    at = serializers.DateTimeField()
    type = serializers.CharField()
    detail = serializers.DictField()


class RequestTimelineSerializer(serializers.Serializer[dict[str, Any]]):
    """`M2-BE-711`: everything that happened to one request, in order."""

    requirement_id = serializers.UUIDField()
    archetype = serializers.CharField()
    status = serializers.CharField()
    events = TimelineEventSerializer(many=True)
    server_now = serializers.DateTimeField()


class OperationsReasonSerializer(serializers.Serializer[dict[str, Any]]):
    """Every safe Operations action takes a reason. `M2-AC-804` requires it."""

    reason = serializers.CharField(max_length=2000)


class OperationsDeadlineExtensionSerializer(OperationsReasonSerializer):
    extra_hours = serializers.IntegerField(min_value=1, max_value=24 * 30)


class OperationsReclassificationSerializer(OperationsReasonSerializer):
    to_archetype = serializers.ChoiceField(
        choices=(
            (ServiceVariant.BookingArchetype.A3_TIME_BLOCK, "Workforce"),
            (ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT, "Project"),
        )
    )


class OperationsRefundReviewSerializer(OperationsReasonSerializer):
    decision = serializers.ChoiceField(choices=(("APPROVED", "Approved"), ("DECLINED", "Declined")))


class OperationsTouchSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    action = serializers.SlugField()
    reason = serializers.CharField(allow_blank=True)
    occurred_at = serializers.DateTimeField()


class AssistedProposalSerializer(ProposalCreateSerializer):
    """A quote captured over the phone: the vendor's own shape, plus the consent that permits it.

    Wave C7 closed a hole here. `capture_assisted_proposal` has always refused without
    `consent_recorded` — its docstring, the endpoint's published description and `M2-AC-802` all say
    so — but the view passed `True` unconditionally, so the refusal could not fire and every
    assisted quote wrote an audit row asserting a consent nobody had recorded. That is worse than
    having no consent field: it puts a false statement in the record of a real vendor's price.

    A subclass rather than a field on `ProposalCreateSerializer`, because a vendor submitting their
    own quote is not consenting to anything on anybody's behalf and asking them to tick a box would
    be meaningless.

    **`default=False` rather than `required=True`**, and that is the deliberate half. A required
    field would be a breaking change to a published request body; an optional one that defaults to
    the refusing value is additive on the wire and fails closed in behaviour — a client that has
    not been updated gets a clear `409` telling it consent was not recorded, rather than silently
    continuing to write the false row this change exists to stop.
    """

    consent_recorded = serializers.BooleanField(default=False)


class AssistedClarificationSerializer(serializers.Serializer[dict[str, Any]]):
    """Write down a clarification that happened on the phone. Consent is a refusal, not a flag."""

    question = serializers.CharField(max_length=4000)
    answer = serializers.CharField(max_length=4000)
    consent_recorded = serializers.BooleanField()


class CrewVerificationSerializer(serializers.Serializer[dict[str, Any]]):
    """Verify, or un-verify, one worker's documents.

    `reason` is optional on the way in and required by the command on the way down when `verified`
    is false — the refusal lives in the domain rather than here, so a second caller cannot reach a
    different rule.
    """

    verified = serializers.BooleanField()
    reason = serializers.CharField(max_length=480, allow_blank=True, default="")


class CrewGenderCorrectionSerializer(serializers.Serializer[dict[str, Any]]):
    """Settle a disputed crew gender. `reason` is required, and blank is not a gender.

    The domain refuses both a blank value and a blank reason, so this only has to accept the
    shape; the rule lives in `operations.correct_crew_gender` where a second caller reaches it too.
    """

    gender = serializers.ChoiceField(choices=CrewMember.Gender.choices)
    reason = serializers.CharField(max_length=480)


class CrewMembershipVerificationRowSerializer(serializers.Serializer[dict[str, Any]]):
    membership_id = serializers.UUIDField()
    partner_id = serializers.UUIDField()
    partner_name = serializers.CharField()
    crew_member_name = serializers.CharField()
    is_supervisor = serializers.BooleanField()
    added_at = serializers.DateTimeField()
    documents_verified_at = serializers.DateTimeField(allow_null=True)
    #: What the worker is recorded as, so a reviewer can see the value they are being asked to
    #: correct without opening a second screen. Blank when nobody has recorded it.
    gender = serializers.ChoiceField(choices=CrewMember.Gender.choices, allow_blank=True)
    #: How many identity documents are waiting for this reviewer's decision. Published on the row
    #: so the queue can distinguish "nobody has uploaded anything" from "there is a file to open",
    #: which is the difference between chasing the Partner and doing the review.
    documents_pending = serializers.IntegerField()
    documents_approved = serializers.IntegerField()


class CrewDocumentReviewRowSerializer(serializers.Serializer[dict[str, Any]]):
    """One identity document as a reviewer sees it, including the link to the file itself.

    `review_url` is signed, short-lived and **nullable**: a storage outage degrades this screen to
    a queue with one missing preview rather than to an error page that hides the other nine people
    waiting. Nothing stores the URL, because a stored URL is a stored expiry.
    """

    document_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=CrewDocument.Kind.choices)
    kind_label = serializers.CharField()
    status = serializers.ChoiceField(choices=CrewDocument.Status.choices)
    version = serializers.IntegerField()
    content_type = serializers.CharField()
    size_bytes = serializers.IntegerField()
    uploaded_at = serializers.DateTimeField()
    reviewed_at = serializers.DateTimeField(allow_null=True)
    review_reason = serializers.CharField(allow_blank=True)
    expires_on = serializers.DateField(allow_null=True)
    review_url = serializers.CharField(allow_null=True)


class CrewDocumentReviewListSerializer(serializers.Serializer[dict[str, Any]]):
    membership_id = serializers.UUIDField()
    crew_member_name = serializers.CharField()
    partner_name = serializers.CharField()
    documents_verified_at = serializers.DateTimeField(allow_null=True)
    #: Required kinds with no approved document on file. Empty means verification is earned rather
    #: than asserted, which is what the reviewer's button is now allowed to depend on.
    missing_required_kinds = serializers.ListField(child=serializers.CharField())
    documents = CrewDocumentReviewRowSerializer(many=True)
    server_now = serializers.DateTimeField()


class CrewDocumentDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    """Approve or reject one document. A rejection's reason reaches the Partner verbatim."""

    approved = serializers.BooleanField()
    reason = serializers.CharField(max_length=480, allow_blank=True, default="")


class CrewVerificationQueueSerializer(serializers.Serializer[dict[str, Any]]):
    memberships = CrewMembershipVerificationRowSerializer(many=True)
    server_now = serializers.DateTimeField()


class StuckQueueSerializer(serializers.Serializer[dict[str, Any]]):
    #: `queue_label`, not `label`. `label` is DRF's own `Serializer` attribute and a field of that
    #: name shadows it — mypy refuses the assignment and DRF resolves it at random. This is the
    #: **third** wave to hit it (`ShiftDay.day_label` was C4's, `ProjectMilestone.milestone_label`
    #: was C5's), which is why the rule is now mechanical: a human-readable name on any M2 shape is
    #: `<thing>_label`.
    code = serializers.SlugField()
    queue_label = serializers.CharField()
    depth = serializers.IntegerField()
    oldest_at = serializers.DateTimeField(allow_null=True)
    recovery_action = serializers.CharField(allow_blank=True)


class StuckQueueListSerializer(serializers.Serializer[dict[str, Any]]):
    queues = StuckQueueSerializer(many=True)
    server_now = serializers.DateTimeField()


class TouchMetricSerializer(serializers.Serializer[dict[str, Any]]):
    """`M2-BE-715`. `within_budget` is nullable, and null is the honest answer while the owner has
    not set a budget — `false` would read as a breach and `true` as a pass, and neither is known."""

    requirement_id = serializers.UUIDField()
    archetype = serializers.CharField()
    touches = serializers.IntegerField()
    budget = serializers.IntegerField(allow_null=True)
    within_budget = serializers.BooleanField(allow_null=True)
    platform_revenue_paise = serializers.IntegerField()
    touches_detail = OperationsTouchSerializer(many=True)
    server_now = serializers.DateTimeField()


class TouchActionCountSerializer(serializers.Serializer[dict[str, Any]]):
    action = serializers.SlugField()
    count = serializers.IntegerField()


class TouchRollupSerializer(serializers.Serializer[dict[str, Any]]):
    since = serializers.DateTimeField()
    requests_touched = serializers.IntegerField()
    total_touches = serializers.IntegerField()
    mean_touches_per_touched_request = serializers.FloatField()
    by_action = TouchActionCountSerializer(many=True)
    server_now = serializers.DateTimeField()


class ChargebackSerializer(serializers.Serializer[dict[str, Any]]):
    """`M2-BE-708`. The provider reference is required: a chargeback with no bank reference cannot
    be represented or reconciled, and recording one would be recording a rumour."""

    amount_paise = serializers.IntegerField(min_value=1)
    provider_reference = serializers.CharField(max_length=120)
    reason_code = serializers.SlugField(max_length=80)


class ExceptionCountSerializer(serializers.Serializer[dict[str, Any]]):
    kind = serializers.CharField()
    count = serializers.IntegerField()


class ReconciliationSummarySerializer(serializers.Serializer[dict[str, Any]]):
    """What Finance is carrying right now (`M2-BE-710`)."""

    server_now = serializers.DateTimeField()
    open_by_kind = ExceptionCountSerializer(many=True)
    refunds_awaiting_provider = serializers.IntegerField()
    failed_refunds = serializers.IntegerField()
