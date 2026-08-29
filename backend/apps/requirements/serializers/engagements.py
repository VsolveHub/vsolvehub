"""Wave C2: the two access front doors, selection, and the engagement that follows.

The A3 unlock and the A5 visit plan, the Customer's paid read of a quote, the selection that is
not yet a booking, and the engagement with its stages, evidence, events and amendments. The
boundary is the money: this is the first module in the package whose payloads cross a paywall, and
the banner below states the rule they all obey.

`partner` holds the vendor-side slot grid that fills a visit plan; `shifts` and `projects` hold
what an engagement becomes once work starts.
"""

from datetime import date, timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.commerce.providers import FakePaymentProvider
from apps.requirements import proposals, vendor_trust
from apps.requirements.models import (
    Engagement,
    EngagementAmendment,
    EngagementEvent,
    EngagementStage,
    Proposal,
    ProposalSelection,
    QuoteUnlock,
    StageEvidence,
    VisitPlan,
    VisitPlanShare,
)
from apps.requirements.selectors import access_receipt_for

from .enquiries import (
    ProposalItemLineSerializer,
    ProposalLabourLineSerializer,
    ProposalMaterialLineSerializer,
    ProposalOtherChargeSerializer,
    ProposalStageSerializer,
    RequirementQuestionSerializer,
    RevisionRequestSerializer,
    SiteVisitSerializer,
)

# ---------------------------------------------------------------------------
# Wave C2: the two front doors, selection and the engagement
#
# Every serializer below obeys the same rule the teaser obeys in the other direction: a payload
# that crosses a paywall carries what the payer bought and nothing else. A visit-plan read goes to
# a Customer who may not have paid yet, so it carries slot times and vendor *presence* — never a
# vendor's contact details, and never another vendor's price.
# ---------------------------------------------------------------------------


class AccessCheckoutSerializer(serializers.Serializer[dict[str, Any]]):
    """What a client needs to hand a charge to the payment provider, and nothing more.

    No provider payload, no key, no signature — `M2-BE-415` asks for payment status without
    leaking provider internals, and the order id plus the amount is the whole of what a checkout
    sheet needs. **The status here is never the grant.** `PROVIDER_PENDING` and `CAPTURED` describe
    the *attempt*; whether the Customer actually has an unlock or a charged plan is the `unlock` or
    `visit_plan` object beside it, and only a verified callback moves that.
    """

    payment_attempt_id = serializers.UUIDField(read_only=True)
    amount_paise = serializers.IntegerField(read_only=True)
    currency = serializers.CharField(read_only=True)
    provider = serializers.CharField(read_only=True)
    provider_order_id = serializers.CharField(read_only=True, allow_blank=True)
    status = serializers.CharField(read_only=True)
    #: When the held visit slot — and therefore this charge — lapses. Null for the A3 unlock, which
    #: holds nothing and expires with nothing.
    expires_at = serializers.DateTimeField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class QuoteUnlockSerializer(serializers.ModelSerializer[QuoteUnlock]):
    """The A3 purchase. `ACTIVE` is only ever reached from a verified provider callback."""

    class Meta:
        model = QuoteUnlock
        fields = (
            "id",
            "status",
            "price_paise",
            "non_responsive_rejection_count",
            "receipt_series",
            "receipt_sequence",
            "activated_at",
            "consumed_at",
            "refunded_at",
        )
        read_only_fields = fields


class UnlockStateSerializer(serializers.Serializer[dict[str, Any]]):
    """The A3 paywall as one read: what it costs, whether it can be bought, and whether it was."""

    #: Null while nothing has been started. A `null` unlock with `is_available: true` is the state
    #: the buy button exists for.
    unlock = QuoteUnlockSerializer(read_only=True, allow_null=True)
    #: Mirrors the command's own guard so the control can be disabled — never so the client can
    #: decide. `create_unlock_checkout` re-checks under the requirement's row lock.
    is_available = serializers.BooleanField(read_only=True)
    #: Null when Operations has loaded no effective price. The screen says we cannot offer this
    #: yet; it does not invent INR 149.
    price_paise = serializers.IntegerField(read_only=True, allow_null=True)
    usable_quote_count = serializers.IntegerField(read_only=True)
    can_read_full_quotes = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class VisitPlanShareSerializer(serializers.ModelSerializer[VisitPlanShare]):
    """One slot of the plan and the money that follows it.

    The split is published because the Customer is entitled to know what their money bought: a
    vendor visit payout and a Vsolve platform share, in paise, per slot. `REFUNDED` returns both.
    """

    class Meta:
        model = VisitPlanShare
        fields = (
            "id",
            "position",
            "status",
            "matching_status",
            "requested_start",
            "duration_minutes",
            "amount_paise",
            "vendor_payout_paise",
            "platform_share_paise",
            "settlement_reason_code",
            "committed_at",
            "earned_at",
            "refunded_at",
        )
        read_only_fields = fields


class VisitPlanTierSerializer(serializers.Serializer[dict[str, Any]]):
    """One row of the review screen's chooser. An empty list is the honest unpriced state."""

    plan_size = serializers.IntegerField(read_only=True)
    price_paise = serializers.IntegerField(read_only=True)


class VisitPlanSerializer(serializers.ModelSerializer[VisitPlan]):
    shares = VisitPlanShareSerializer(many=True, read_only=True)
    payment_attempt_id = serializers.UUIDField(read_only=True, allow_null=True)
    simulated_capture_available = serializers.SerializerMethodField()

    @staticmethod
    @extend_schema_field(serializers.BooleanField())
    def get_simulated_capture_available(plan: VisitPlan) -> bool:
        attempt = plan.payment_attempt
        return bool(settings.PAYMENTS_ALLOW_SIMULATED_CAPTURE) and (
            attempt is not None and attempt.provider == FakePaymentProvider.code
        )

    class Meta:
        model = VisitPlan
        fields = (
            "id",
            "status",
            "plan_size",
            "price_paise",
            #: What the Customer still owes: the tier price less any credit carried over from an
            #: A3 unlock when Operations reclassified the request. `M2-BE-427` — never charge twice.
            "credit_paise",
            "chargeable_paise",
            #: The pending checkout-free charge backing this plan, exposed so local development
            #: can drive the existing simulated-capture endpoint after a page reload. It is null
            #: before checkout, after a fully credited plan, and after a never-charged void.
            "payment_attempt_id",
            #: Server-owned dev affordance. The Customer app uses this to show "Mark as paid"
            #: only where the simulated-capture endpoint can really complete the charge.
            "simulated_capture_available",
            "shares",
            "receipt_series",
            "receipt_sequence",
            #: When every slot should be filled. Unfilled shares auto-refund past it.
            "fill_due_at",
            "chosen_at",
            "charged_at",
            "settled_at",
        )
        read_only_fields = fields


class VisitPlanStateSerializer(serializers.Serializer[dict[str, Any]]):
    """The A5 front door as one read: the chooser before, the tracker after.

    Deliberately one endpoint for both. Before a plan exists it carries the priced tiers the review
    screen offers; after one exists it carries the plan, its shares and the confirmed visits with
    their times. Two endpoints would have meant the tracker and the chooser could disagree about
    which plan the Customer has.
    """

    plan = VisitPlanSerializer(read_only=True, allow_null=True)
    available_tiers = VisitPlanTierSerializer(many=True, read_only=True)
    #: The confirmed visits, in slot order. This is what `M2-FE-421`'s tracker renders: when each
    #: professional is coming. Vendor identity is disclosed here **only** for a confirmed visit —
    #: somebody entering a home must be nameable — and never for an open slot.
    visits = SiteVisitSerializer(many=True, read_only=True)
    #: Mirrors `create_visit_plan_checkout`'s guard: true once a vendor holds a slot and the plan
    #: has not been paid for. The command re-checks.
    checkout_available = serializers.BooleanField(read_only=True)
    can_read_full_estimates = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class VisitPlanChooseSerializer(serializers.Serializer[dict[str, Any]]):
    #: 1, 2 or 3 professionals. No default: how many people come to a Customer's home is their
    #: decision, and a default would be the platform quietly making it.
    plan_size = serializers.IntegerField(min_value=1, max_value=3)


class VendorCardSerializer(serializers.Serializer[dict[str, Any]]):
    """A responding vendor, as much of one as the Customer has paid to see.

    An explicit field list for the same reason `QuoteTeaserSerializer` is one. Before a visit is
    confirmed this is a badge, a rating and a type — no name, no photo, no contact. After
    confirmation the name is disclosed, because a person is entering the Customer's home and must
    be nameable; contact stays masked until the engagement.
    """

    partner_id = serializers.UUIDField(read_only=True)
    vendor_type = serializers.CharField(read_only=True)
    #: The real badge since 1.26.0: an Operations-approved `PartnerApplication`. It was hardcoded
    #: `True`, which made one of the four signals a Customer weighs meaningless.
    is_verified = serializers.BooleanField(read_only=True)
    #: Present only once this vendor has confirmed a visit slot. Null otherwise, always.
    display_name = serializers.CharField(read_only=True, allow_null=True)
    #: The 5 km band the matcher ranked on, from this invitation's own `ranking_provenance`. Null
    #: when we hold no fresh position for the vendor — published as null rather than filled with
    #: the pool median, because the median is a ranking device and printing it here would tell the
    #: Customer a distance nobody measured.
    distance_band_km = serializers.IntegerField(read_only=True, allow_null=True)


class VendorCardListSerializer(serializers.Serializer[dict[str, Any]]):
    """The A5 responding pool.

    **No rating field, and that is a decision rather than an omission.** `README.md` lists a rating
    among the four pre-confirmation signals and this platform has no review model — `carts`'
    professional card already refuses to publish one for the same reason. A star count invented
    here would be this serializer deciding what a vendor's reputation is. The field arrives when a
    review aggregate does.
    """

    vendor_cards = VendorCardSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class CustomerProposalSerializer(serializers.ModelSerializer[Proposal]):
    """A full quote or estimate, for a Customer who has paid to read it.

    The entitlement is checked in the view before this serializer is ever constructed. Vendor
    identity is present because it is exactly what the unlock or the visit plan bought; contact
    details are not, because they are released by the engagement and not by the fee.
    """

    vendor = serializers.SerializerMethodField()
    stages = ProposalStageSerializer(many=True, read_only=True)
    material_lines = ProposalMaterialLineSerializer(many=True, read_only=True)
    item_lines = ProposalItemLineSerializer(many=True, read_only=True)
    labour_lines = ProposalLabourLineSerializer(many=True, read_only=True)
    other_charges = ProposalOtherChargeSerializer(many=True, read_only=True)
    site_visit = SiteVisitSerializer(read_only=True, allow_null=True)
    #: The clarification thread between this Customer and this vendor, both directions, oldest
    #: first. Hung off the proposal because a question is addressed to the professional who wrote
    #: it, and the invitation is what links the two.
    questions = RequirementQuestionSerializer(
        many=True, read_only=True, source="invitation.questions"
    )
    #: The Customer's most recent ask for a change, or null.
    revision_request = serializers.SerializerMethodField()

    class Meta:
        model = Proposal
        fields = (
            "id",
            "status",
            "usability",
            "rejection_reason",
            "revision",
            "revalidation_requested_at",
            "revision_request",
            "questions",
            "vendor",
            "site_visit",
            "rate_paise_per_worker_day",
            "minimum_days",
            "worker_count",
            "estimate_type",
            "item_lines",
            "labour_lines",
            "other_charges",
            "total_paise",
            "tax_paise",
            "tax_basis",
            "calculation_snapshot",
            "line_subtotal_paise",
            "authorized_charges_paise",
            "taxable_value_paise",
            "partner_quote_total_paise",
            "platform_fee_paise",
            "platform_fee_tax_paise",
            "customer_total_paise",
            "inclusions",
            "exclusions",
            "scope_summary",
            "stages",
            "material_lines",
            "warranty_terms",
            "valid_until",
            "submitted_at",
        )
        read_only_fields = fields

    @extend_schema_field(RevisionRequestSerializer(allow_null=True))
    def get_revision_request(self, obj: Proposal) -> dict[str, Any] | None:
        latest = proposals.latest_revision_request_for(obj)
        return None if latest is None else dict(RevisionRequestSerializer(latest).data)

    def get_vendor(self, obj: Proposal) -> dict[str, Any]:
        """Who wrote this, and what a Customer may weigh before choosing them.

        The trust figures are read off completed engagements and Customer ratings at read time —
        never stored, never an input to matching. A vendor with no rated work publishes `null`
        rather than a number nobody gave.
        """
        business = getattr(obj.partner, "business_profile", None)
        trust = vendor_trust.trust_for(obj.partner)
        return {
            "partner_id": obj.partner_id,
            "vendor_type": business.business_type if business is not None else "INDIVIDUAL",
            "is_verified": True,
            "display_name": (
                business.legal_name if business is not None else obj.partner.display_name
            ),
            "rating_average": trust.rating_average,
            "rating_count": trust.rating_count,
            "jobs_completed": trust.jobs_completed,
            "experience_years": trust.experience_years,
            "active_since": trust.active_since.isoformat(),
        }


class CustomerQuoteListSerializer(serializers.Serializer[dict[str, Any]]):
    quotes = CustomerProposalSerializer(many=True, read_only=True)
    #: How many free non-responsive replacements are left. Read from configuration and **null when
    #: the owner has not set the cap** — the screen must not offer a replacement on a policy that
    #: does not exist yet.
    non_responsive_rejections_remaining = serializers.IntegerField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class ProposalRejectSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.ChoiceField(choices=Proposal.RejectionReason.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")


class ProposalSelectionSerializer(serializers.ModelSerializer[ProposalSelection]):
    """The Customer's persisted choice and the engagement it opened.

    Legacy pending rows may still carry a reconfirmation deadline. New selections are confirmed
    and carry `engagement_id` in the create response.
    """

    engagement_id = serializers.SerializerMethodField()

    class Meta:
        model = ProposalSelection
        fields = (
            "id",
            "requirement",
            "proposal",
            "partner",
            "status",
            "reconfirm_by",
            "decided_at",
            "decline_reason_code",
            "engagement_id",
            "created_at",
        )
        read_only_fields = fields

    def get_engagement_id(self, obj: ProposalSelection) -> str | None:
        engagement = getattr(obj, "engagement", None)
        return str(engagement.id) if engagement is not None else None


class SelectionCreateSerializer(serializers.Serializer[dict[str, Any]]):
    proposal_id = serializers.UUIDField()


class SelectionDeclineSerializer(serializers.Serializer[dict[str, Any]]):
    reason_code = serializers.SlugField(max_length=80)


class StageEvidenceSerializer(serializers.ModelSerializer[StageEvidence]):
    """What the vendor showed, as both parties read it.

    `object_key` is **not** published. It is a storage path, and publishing one turns every
    evidence read into an enumeration surface; a short-lived signed link is issued by the download
    endpoint instead, the same way `vendor_attachments` issues them for a Customer's site photos.
    """

    class Meta:
        model = StageEvidence
        fields = (
            "id",
            "kind",
            "note",
            "content_type",
            "size_bytes",
            "processing_status",
            "failure_reason",
            "created_at",
        )
        read_only_fields = fields


class StageEvidenceUploadRequestSerializer(serializers.Serializer[dict[str, Any]]):
    kind = serializers.ChoiceField(choices=StageEvidence.Kind.choices)
    content_type = serializers.CharField(max_length=120)
    size_bytes = serializers.IntegerField(min_value=1)
    sha256 = serializers.RegexField(r"^[0-9a-f]{64}$")

    def validate_kind(self, value: str) -> str:
        if value == StageEvidence.Kind.NOTE:
            raise serializers.ValidationError("A note carries no file; submit it with the stage.")
        return value


class StageEvidenceUploadGrantSerializer(serializers.Serializer[dict[str, Any]]):
    upload_id = serializers.UUIDField(read_only=True)
    upload_url = serializers.URLField(read_only=True)
    upload_token = serializers.CharField(read_only=True, allow_blank=True)
    expires_at = serializers.DateTimeField(read_only=True)


class StageEvidenceFinalizeSerializer(serializers.Serializer[dict[str, Any]]):
    upload_id = serializers.UUIDField()


class StageEvidenceSubmitSerializer(serializers.Serializer[dict[str, Any]]):
    #: Required. A stage handed over with no account of what was done is a stage nobody can review
    #: and nobody can defend in a dispute.
    note = serializers.CharField(max_length=4000)


class StageCorrectionSerializer(serializers.Serializer[dict[str, Any]]):
    note = serializers.CharField(max_length=2000)


#: Why a Customer disputed a stage. Published on the serializer rather than the column for the
#: reason the decline vocabulary is: the same column is written by system paths too.
STAGE_DISPUTE_REASONS = (
    ("NOT_DONE", "The work was not done"),
    ("PARTIALLY_DONE", "Only part of the work was done"),
    ("POOR_QUALITY", "The work was done badly"),
    ("WRONG_SCOPE", "This is not what was agreed"),
    ("OTHER", "Another reason"),
)

#: What Operations may decide about a disputed stage.
STAGE_DISPUTE_OUTCOMES = (
    ("APPROVE", "Approve the stage as submitted"),
    ("REQUEST_CORRECTION", "Send it back for correction"),
)


class StageDisputeSerializer(serializers.Serializer[dict[str, Any]]):
    reason_code = serializers.ChoiceField(choices=STAGE_DISPUTE_REASONS)
    note = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")


class StageDisputeDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    outcome = serializers.ChoiceField(choices=STAGE_DISPUTE_OUTCOMES)
    note = serializers.CharField(max_length=2000)


class ProjectCompletionCodeSerializer(serializers.Serializer[dict[str, Any]]):
    """The Customer-only display copy of a project completion challenge."""

    code = serializers.CharField(allow_null=True)
    expires_at = serializers.DateTimeField(allow_null=True)
    can_issue = serializers.BooleanField()
    code_length = serializers.IntegerField()
    server_now = serializers.DateTimeField()


class ProjectCompletionCodeEntrySerializer(serializers.Serializer[dict[str, Any]]):
    code = serializers.CharField(min_length=4, max_length=12, trim_whitespace=True)


def _as_date(value: object) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def _stage_schedule(stage: EngagementStage) -> tuple[date | None, int | None]:
    """Read the frozen schedule, with a legacy fallback for pre-contract projects."""

    requested = stage.engagement.requirement.requested_start
    cursor = requested.date() if requested is not None else None
    rows = sorted(stage.engagement.stages.all(), key=lambda row: row.position)

    for row in rows:
        terms = row.original_terms if isinstance(row.original_terms, dict) else {}
        starts_on = _as_date(terms.get("starts_on")) or cursor
        duration_value = terms.get("duration_days")
        duration_days = (
            int(duration_value)
            if isinstance(duration_value, int) and not isinstance(duration_value, bool)
            else None
        )
        deadline = row.scheduled_on

        if starts_on is None and deadline is not None and duration_days is not None:
            starts_on = deadline - timedelta(days=duration_days - 1)
        if duration_days is None and starts_on is not None and deadline is not None:
            derived = (deadline - starts_on).days + 1
            duration_days = derived if derived > 0 else None

        if row.id == stage.id:
            return (
                starts_on if deadline is not None or duration_days is not None else None,
                duration_days,
            )
        if deadline is not None:
            cursor = deadline + timedelta(days=1)
        elif starts_on is not None and duration_days is not None:
            cursor = starts_on + timedelta(days=duration_days)

    return None, None


class EngagementStageSerializer(serializers.ModelSerializer[EngagementStage]):
    """One shift-day or one milestone, with its money and its clocks.

    The four money fields are published because they are what the Customer's and the vendor's
    screens are both asking about, and because a client that only ever sees `amount_paise` cannot
    tell a funded stage from an approved one from a paid one.

    Both `*_due_at` fields are nullable and their nulls mean something specific: no review window
    is configured, so this stage will never auto-approve; no payout hold is configured, so its
    payout does not release on a clock. A screen must render nothing there rather than a countdown
    to a deadline nobody set.
    """

    evidence = StageEvidenceSerializer(many=True, read_only=True)
    starts_on = serializers.SerializerMethodField()
    duration_days = serializers.SerializerMethodField()
    funding_breakdown = serializers.SerializerMethodField()

    class Meta:
        model = EngagementStage
        fields = (
            "id",
            "position",
            "label",
            "amount_paise",
            "funding_breakdown",
            #: `WORK` or `MATERIAL_ADVANCE`. Read it before rendering a stage: a material advance
            #: is money spent on goods, not a milestone somebody performs, and it does not refund
            #: like unearned work.
            "kind",
            "starts_on",
            "duration_days",
            "scheduled_on",
            "status",
            "funding_state",
            "funded_paise",
            "approved_amount_paise",
            "released_amount_paise",
            "refunded_amount_paise",
            "correction_note",
            "dispute_reason_code",
            "review_due_at",
            "payout_release_due_at",
            "evidence",
            "funded_at",
            "started_at",
            "evidence_submitted_at",
            "approved_at",
            "released_at",
            "disputed_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.DateField(allow_null=True))
    def get_starts_on(self, obj: EngagementStage) -> date | None:
        return _stage_schedule(obj)[0]

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_duration_days(self, obj: EngagementStage) -> int | None:
        return _stage_schedule(obj)[1]

    @extend_schema_field(serializers.JSONField())
    def get_funding_breakdown(self, obj: EngagementStage) -> dict[str, int]:
        terms = obj.original_terms if isinstance(obj.original_terms, dict) else {}
        return {
            "partner_service_amount_paise": int(
                terms.get("partner_service_amount_paise") or obj.amount_paise
            ),
            "tax_paise": int(terms.get("tax_paise") or 0),
            "platform_fee_paise": int(terms.get("platform_fee_paise") or 0),
            "platform_fee_tax_paise": int(terms.get("platform_fee_tax_paise") or 0),
            "total_due_paise": obj.amount_paise,
        }


class AccessReceiptSerializer(serializers.Serializer[dict[str, Any]]):
    """The durable reference for the access fee Vsolve actually collected (`M2-BE-415`).

    Not an invoice. `TaxDocument.order` is not nullable and an access fee has no `Order`, so making
    it nullable to fit one would weaken the invariant every M1 invoice depends on; the number comes
    from the same `commerce.DocumentSequence` under an `M2A-` series, which is gapless and is the
    one numbering authority. GST treatment of the unlock and the visit-plan fee is blocking owner
    decision 5, so this is a receipt reference and says so.

    `number` is formatted server-side in the `series-sequence` shape
    `commerce.TaxDocumentSerializer.get_number` already publishes, because the string a Customer
    quotes to support should not be assembled differently by each app that renders it.
    """

    kind = serializers.CharField(read_only=True)
    number = serializers.CharField(read_only=True)
    series = serializers.CharField(read_only=True)
    sequence = serializers.IntegerField(read_only=True)
    amount_paise = serializers.IntegerField(read_only=True)
    #: When the money was **verified**, not when the Customer pressed pay — the two differ by
    #: however long the provider callback took, and a receipt dated before the payment cleared is
    #: a receipt for something that had not happened yet. Null on a row that predates the stamp.
    paid_at = serializers.DateTimeField(read_only=True, allow_null=True)


class EngagementSerializer(serializers.ModelSerializer[Engagement]):
    """The agreement, frozen at reconfirmation.

    `commercial_mode` is the field the UI must read before it promises anything. `LEAD_ONLY` means
    the Customer pays the vendor directly and Vsolve's protection is matching and replacement;
    calling that a protected booking is the promise this platform cannot keep.

    The six money columns are the running total `M2-BE-504` reconciles: `staged_total_paise` always
    equals `total_paise + amendment_delta_paise`, by database constraint, so a client can show
    "agreed, then changed by, now" without doing arithmetic the server has not already checked.
    """

    stages = EngagementStageSerializer(many=True, read_only=True)
    #: The access fee this agreement came out of — the A3 unlock or the A5 visit plan — with its
    #: durable receipt number. `M2-FE-418` asks the agreement screen for a receipt and there was
    #: nothing to link to: `Engagement` published no order id and no document id, so the screen
    #: could only say where the record lives. Null when the fee was never charged, which is real:
    #: a plan whose whole price was covered by a reclassification credit takes no payment.
    access_receipt = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = Engagement
        fields = (
            "id",
            "requirement",
            "proposal",
            "partner",
            "archetype",
            "commercial_mode",
            "status",
            "total_paise",
            "tax_paise",
            "tax_basis",
            "commission_paise",
            "commission_treatment",
            "staged_total_paise",
            "amendment_delta_paise",
            "funded_total_paise",
            "approved_total_paise",
            "released_total_paise",
            "refunded_total_paise",
            "contact_released_at",
            "work_may_start_at",
            "disputed_at",
            "completed_at",
            "access_receipt",
            "server_now",
            "stages",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(AccessReceiptSerializer(allow_null=True))
    def get_access_receipt(self, obj: Engagement) -> dict[str, Any] | None:
        return access_receipt_for(obj)

    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(self, _obj: Engagement) -> Any:
        return timezone.now()


class EngagementPageSerializer(serializers.Serializer[dict[str, Any]]):
    next = serializers.CharField(read_only=True, allow_null=True)
    previous = serializers.CharField(read_only=True, allow_null=True)
    results = EngagementSerializer(many=True, read_only=True)


class EngagementEventSerializer(serializers.ModelSerializer[EngagementEvent]):
    """One line of the agreement's history.

    `actor_is_system` rather than an actor id: who a Customer or a vendor was is not the other
    party's business, but *whether a person or a clock* moved something is exactly what a timeline
    has to say — "approved by you" and "approved because the review window closed" are different
    sentences.
    """

    actor_is_system = serializers.SerializerMethodField()

    class Meta:
        model = EngagementEvent
        fields = (
            "id",
            "stage",
            "from_status",
            "to_status",
            "reason_code",
            "reason",
            "actor_is_system",
            "occurred_at",
        )
        read_only_fields = fields

    def get_actor_is_system(self, obj: EngagementEvent) -> bool:
        return obj.actor_id is None


class EngagementEventListSerializer(serializers.Serializer[dict[str, Any]]):
    events = EngagementEventSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class AmendmentLineSerializer(serializers.Serializer[dict[str, Any]]):
    """One line of a change request, priced.

    `amount_paise` is signed on the wire even though the stored column is not: the M1
    `ScopeAmendmentLine` was built for additions only, so it holds an absolute value and the sign
    lives in the line's snapshot. Publishing the signed number is what lets one screen render both
    an addition and a reduction without knowing which table the sign came from.
    """

    position = serializers.IntegerField(read_only=True)
    kind = serializers.CharField(read_only=True)
    #: The line's own description. Named `title` rather than `label` for the reason
    #: `ProposalStageSerializer.title` is: `label` is an attribute of every DRF `Field`, and a
    #: serializer field of that name shadows it.
    title = serializers.CharField(read_only=True)
    quantity = serializers.IntegerField(read_only=True)
    amount_paise = serializers.IntegerField(read_only=True)


class EngagementAmendmentSerializer(serializers.Serializer[dict[str, Any]]):
    """A change request, as both parties read it.

    Flattened across `EngagementAmendment` and the M1 `ScopeAmendment` deliberately. The split is
    a storage fact — one amendment engine, two aggregates — and pushing it onto the wire would ask
    every client to know which half of the row holds the status.
    """

    id = serializers.UUIDField(read_only=True)
    engagement_id = serializers.UUIDField(read_only=True)
    stage_id = serializers.UUIDField(read_only=True, allow_null=True)
    kind = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    reason = serializers.CharField(read_only=True)
    #: Signed. Positive is extra work the Customer pays for; negative is scope taken out.
    delta_paise = serializers.IntegerField(read_only=True)
    lines = AmendmentLineSerializer(many=True, read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)
    responded_at = serializers.DateTimeField(read_only=True, allow_null=True)
    applied_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class EngagementAmendmentListSerializer(serializers.Serializer[dict[str, Any]]):
    amendments = EngagementAmendmentSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class AmendmentLineInputSerializer(serializers.Serializer[dict[str, Any]]):
    title = serializers.CharField(max_length=240)
    quantity = serializers.IntegerField(min_value=1, max_value=999)
    #: A5 change orders only, and signed. Ignored on an A3 time extension, where the server prices
    #: from the rate frozen on the engagement — a vendor who could restate that rate could
    #: re-price a job the Customer has already committed to.
    amount_paise = serializers.IntegerField(required=False, allow_null=True, default=None)


class EngagementAmendmentCreateSerializer(serializers.Serializer[dict[str, Any]]):
    kind = serializers.ChoiceField(choices=EngagementAmendment.Kind.choices)
    reason = serializers.CharField(max_length=240)
    stage_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    lines = AmendmentLineInputSerializer(many=True)

    def validate_lines(self, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not value:
            raise serializers.ValidationError("A change request needs at least one line.")
        return value


class EngagementAmendmentDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    """What an acceptance returned.

    `checkout` is present only when the amendment needs a verified payment before it changes
    anything — a managed (A5) engagement taking on extra work. `null` means it is already
    authorized and applied: an A3 extension, or a reduction that refunded rather than charged.
    """

    amendment = EngagementAmendmentSerializer(read_only=True)
    checkout = AccessCheckoutSerializer(read_only=True, allow_null=True)
