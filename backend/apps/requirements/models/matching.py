"""P3 matching: what one vendor was shown, what they were invited to, and what they quoted.

`RequirementSnapshot`, `VendorInvitation`, `CapacityHold`, `Proposal` and `RequirementQuestion` —
the vendor-facing half of a request, all of it before anybody is charged. The products a quote is
read through are in `access`, and the agreement a quote becomes is in `engagements`.
"""

import uuid

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone

from apps.partners.models import PartnerProfile

# ---------------------------------------------------------------------------
# P3: matching, proposals, clarification and site visits.
#
# Two shapes here are deliberate and easy to get wrong later:
#
# * A `RequirementSnapshot` is written at invitation, not per requirement edit. The only question
#   audit and dispute ever ask is "what did this vendor quote against", and a snapshot answers it
#   without a versioning tree.
# * `Proposal` is append-only. A revision is a new row pointing at the one it supersedes, so a
#   Customer can always see what they were originally offered.
# ---------------------------------------------------------------------------


class RequirementSnapshot(models.Model):
    """Exactly what one vendor saw when they were invited. Immutable."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="snapshots",
    )
    archetype = models.CharField(max_length=24)
    answers = models.JSONField(default=dict)
    additional_details = models.TextField(blank=True)
    requested_start = models.DateTimeField(null=True, blank=True)
    service_by = models.DateField(null=True, blank=True)
    budget_min_paise = models.PositiveBigIntegerField(null=True, blank=True)
    budget_max_paise = models.PositiveBigIntegerField(null=True, blank=True)
    language = models.CharField(max_length=16)
    content_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [
            models.Index(fields=("requirement", "content_hash")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.content_hash[:8]}"


class VendorInvitation(models.Model):
    """One vendor invited to quote, holding one quote slot while accepted."""

    class Status(models.TextChoices):
        INVITED = "INVITED", "Invited"
        ACCEPTED = "ACCEPTED", "Accepted"
        QUOTED = "QUOTED", "Quoted"
        DECLINED = "DECLINED", "Declined"
        EXPIRED = "EXPIRED", "Expired"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"

    #: Statuses that occupy a quote slot. A declined or expired invitation releases it.
    SLOT_HOLDING_STATUSES = (Status.INVITED, Status.ACCEPTED, Status.QUOTED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="invitations",
    )
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="requirement_invitations",
    )
    snapshot = models.ForeignKey(
        RequirementSnapshot,
        on_delete=models.PROTECT,
        related_name="invitations",
    )
    requested_visit_share = models.ForeignKey(
        "requirements.VisitPlanShare",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="invitations",
    )
    #: Which beneficial owner this invitation belongs to. Two accounts sharing a cluster cannot
    #: both hold a slot on one requirement.
    cluster_key = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.INVITED)
    wave = models.PositiveSmallIntegerField(default=1)
    #: Computed in business hours by `requirements.sla`, never as a raw clock offset.
    responds_by = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    decline_reason_code = models.SlugField(max_length=80, blank=True)
    #: Why this Partner was chosen, in the shape `assignments.ranking` already established.
    ranking_provenance = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("requirement", "wave", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=("requirement", "partner"),
                condition=models.Q(requested_visit_share__isnull=True),
                name="requirements_one_quote_invitation_per_partner",
            ),
            models.UniqueConstraint(
                fields=("requested_visit_share", "partner", "wave"),
                condition=models.Q(requested_visit_share__isnull=False),
                name="requirements_one_visit_offer_per_partner_wave",
            ),
            # Scoped to slots actually *held*. Inviting two accounts of one owner is wasteful;
            # letting both occupy a quote slot is the harm. Covering INVITED here would also make
            # a single wave that picked two siblings fail with IntegrityError instead of simply
            # inviting one of them.
            models.UniqueConstraint(
                fields=("requirement", "cluster_key"),
                condition=models.Q(status__in=("ACCEPTED", "QUOTED")) & ~models.Q(cluster_key=""),
                name="requirements_one_live_slot_per_cluster",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="DECLINED") | ~models.Q(decline_reason_code=""),
                name="requirements_decline_needs_reason",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "status")),
            models.Index(fields=("partner", "status")),
            models.Index(fields=("status", "responds_by")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.partner_id}:{self.status}"


class CapacityHold(models.Model):
    """A vendor's soft claim on their own capacity for the dates they accepted.

    Taken at acceptance and hardened at selection. Checking capacity only at reconfirmation is
    what lets one agency accept six Saturdays, win four and staff one.
    """

    class Strength(models.TextChoices):
        SOFT = "SOFT", "Soft"
        HARD = "HARD", "Hard"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invitation = models.OneToOneField(
        VendorInvitation,
        on_delete=models.PROTECT,
        related_name="capacity_hold",
    )
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="capacity_holds",
    )
    starts_on = models.DateField()
    ends_on = models.DateField()
    crew_size = models.PositiveSmallIntegerField(default=1)
    strength = models.CharField(max_length=8, choices=Strength.choices, default=Strength.SOFT)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("starts_on", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_on__gte=models.F("starts_on")),
                name="requirements_capacity_hold_dates_ordered",
            ),
            models.CheckConstraint(
                condition=models.Q(crew_size__gt=0),
                name="requirements_capacity_hold_crew_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "status", "starts_on")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.starts_on}..{self.ends_on}:{self.strength}"


#: Maximum negotiated movement on one estimate (1500 = 15%). Shared by the immutable discount
#: snapshot and the Customer's request below, so the ask and the amount a Partner may apply cannot
#: drift into different limits.
MAX_DISCOUNT_BPS = 1500


class Proposal(models.Model):
    """A vendor's quote. Append-only: a revision supersedes rather than edits."""

    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        SUPERSEDED = "SUPERSEDED", "Superseded"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        EXPIRED = "EXPIRED", "Expired"
        SELECTED = "SELECTED", "Selected"
        REJECTED = "REJECTED", "Rejected"
        #: The two terminal ends of a selection, named by
        #: `07-state-machines-and-permissions.md` §3. `ACCEPTED` is the vendor reconfirming and is
        #: what an engagement is created from; `LAPSED` is the vendor declining or running out of
        #: time. They are separate from `REJECTED` because that is the *Customer's* refusal, and a
        #: vendor reading "rejected" for their own timeout would be told the wrong story.
        ACCEPTED = "ACCEPTED", "Accepted by the vendor"
        LAPSED = "LAPSED", "Lapsed after selection"

    class Usability(models.TextChoices):
        USABLE = "USABLE", "Usable"
        OUT_OF_BUDGET = "OUT_OF_BUDGET", "Outside the stated budget"
        INCOMPLETE = "INCOMPLETE", "Incomplete"

    class RejectionReason(models.TextChoices):
        NON_RESPONSIVE = "NON_RESPONSIVE", "Ignored the stated scope"
        NOT_CHOSEN = "NOT_CHOSEN", "Customer chose another vendor"

    class TaxBasis(models.TextChoices):
        INCLUSIVE = "INCLUSIVE", "Tax included in the total"
        EXCLUSIVE = "EXCLUSIVE", "Tax added to the total"

    class EstimateType(models.TextChoices):
        ITEM_WISE = "ITEM_WISE", "Item-wise"
        LABOUR_WISE = "LABOUR_WISE", "Labour-wise"

    class MaterialFulfilmentMode(models.TextChoices):
        NOT_APPLICABLE = "NOT_APPLICABLE", "Not applicable"
        CUSTOMER_PROCURES = "CUSTOMER_PROCURES", "Customer procures"
        PARTNER_TURNKEY = "PARTNER_TURNKEY", "Partner supplies turnkey"

    class DiscountKind(models.TextChoices):
        PERCENT = "PERCENT", "Percentage"
        FIXED = "FIXED", "Final amount"

    class DiscountSource(models.TextChoices):
        CUSTOMER_REQUEST = "CUSTOMER_REQUEST", "Customer request"
        PARTNER_OFFER = "PARTNER_OFFER", "Partner offer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="proposals",
    )
    invitation = models.ForeignKey(
        VendorInvitation,
        on_delete=models.PROTECT,
        related_name="proposals",
    )
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="proposals",
    )
    #: The snapshot this quote answers. A later requirement edit does not silently re-point it.
    snapshot = models.ForeignKey(
        RequirementSnapshot,
        on_delete=models.PROTECT,
        related_name="proposals",
    )
    supersedes = models.OneToOneField(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="superseded_by",
    )
    #: The completed visit this estimate was produced on. **Required for A5** since revision 3 —
    #: the visit is what the Customer bought, and an estimate priced from a desk is the guess the
    #: visit-first model exists to remove. Null for every A3 quote, which is remote by design.
    site_visit = models.ForeignKey(
        "SiteVisit",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="proposals",
    )
    #: Set when the Customer asked this vendor to re-validate a quote whose validity elapsed.
    #: The vendor answers by superseding it, reusing the unlock or plan already paid for — expiry
    #: must never be a dead end that forces a second purchase.
    revalidation_requested_at = models.DateTimeField(null=True, blank=True)
    revision = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SUBMITTED)
    usability = models.CharField(
        max_length=16,
        choices=Usability.choices,
        default=Usability.USABLE,
    )
    rejection_reason = models.CharField(
        max_length=16,
        choices=RejectionReason.choices,
        blank=True,
    )

    #: A3: rate per worker per day, minimum days, headcount. A5 leaves these null.
    rate_paise_per_worker_day = models.PositiveBigIntegerField(null=True, blank=True)
    minimum_days = models.PositiveSmallIntegerField(null=True, blank=True)
    worker_count = models.PositiveSmallIntegerField(null=True, blank=True)

    class MaterialBrandTier(models.TextChoices):
        STANDARD = "STANDARD", "Standard"
        PREMIUM = "PREMIUM", "Premium"

    estimate_type = models.CharField(
        max_length=16,
        choices=EstimateType.choices,
        default=EstimateType.LABOUR_WISE,
    )
    item_lines = models.JSONField(default=list, blank=True, encoder=DjangoJSONEncoder)
    labour_lines = models.JSONField(default=list, blank=True, encoder=DjangoJSONEncoder)
    other_charges = models.JSONField(default=list, blank=True, encoder=DjangoJSONEncoder)
    commercial_policy = models.ForeignKey(
        "requirements.CommercialPolicy",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="proposals",
    )
    calculation_snapshot = models.JSONField(default=dict, blank=True, encoder=DjangoJSONEncoder)
    line_subtotal_paise = models.PositiveBigIntegerField(default=0)
    authorized_charges_paise = models.PositiveBigIntegerField(default=0)
    taxable_value_paise = models.PositiveBigIntegerField(default=0)
    partner_quote_total_paise = models.PositiveBigIntegerField(default=0)
    platform_fee_paise = models.PositiveBigIntegerField(default=0)
    platform_fee_tax_paise = models.PositiveBigIntegerField(default=0)
    customer_total_paise = models.PositiveBigIntegerField(default=0)
    commission_paise = models.PositiveBigIntegerField(default=0)
    withholding_paise = models.PositiveBigIntegerField(default=0)
    partner_net_paise = models.PositiveBigIntegerField(default=0)

    #: One visible, audited overall concession. It never masquerades as a negative charge: the
    #: positive work/material/charge rows stay as authored, while this snapshot says which prior
    #: customer total the Partner reduced and by exactly how much. Null kind/source plus zero
    #: amount is the ordinary undiscounted estimate.
    discount_kind = models.CharField(
        max_length=12, choices=DiscountKind.choices, null=True, blank=True
    )
    discount_bps = models.PositiveSmallIntegerField(null=True, blank=True)
    discount_base_paise = models.PositiveBigIntegerField(default=0)
    discount_paise = models.PositiveBigIntegerField(default=0)
    discount_source = models.CharField(
        max_length=24, choices=DiscountSource.choices, null=True, blank=True
    )

    total_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField(default=0)
    #: Fixed per requirement so a GST-registered vendor and an unregistered one compare honestly.
    tax_basis = models.CharField(max_length=12, choices=TaxBasis.choices)
    #: Whether the platform's commission sits inside `total_paise` or is added on top. Displayed on
    #: every proposal; an open owner decision, so it is recorded rather than assumed.
    commission_treatment = models.CharField(max_length=24, blank=True)

    inclusions = models.JSONField(default=list, blank=True, encoder=DjangoJSONEncoder)
    exclusions = models.JSONField(default=list, blank=True, encoder=DjangoJSONEncoder)
    #: A5 stage breakdown. Stage totals plus material lines must reconcile to `total_paise`
    #: before selection.
    #:
    #: **`encoder` is load-bearing, not decoration.** These rows arrive as DRF *validated* data,
    #: and a validated value is a Python object rather than JSON: `ProposalStageSerializer.ends_on`
    #: is a `DateField`, so every stage carrying a milestone date held a `datetime.date`. A plain
    #: `JSONField` encodes with the stdlib encoder, which raises `TypeError: Object of type date is
    #: not JSON serializable` — inside `submit_proposal`'s transaction, after the quote had been
    #: built, so the write rolled back and the vendor got `internal_error` for a perfectly valid
    #: estimate. Any vendor who dated a stage simply could not submit.
    #:
    #: `DjangoJSONEncoder` stores it as the ISO string the API publishes anyway, so nothing about
    #: the contract moves and `to_representation` passes it straight through. `EngagementStage.
    #: scheduled_on` is a `DateField` and parses that string on the way in.
    stages = models.JSONField(default=list, blank=True, encoder=DjangoJSONEncoder)
    #: A5 material lines, and the reason they are **not** stages (`M2-BE-543`).
    #:
    #: Until 1.26.0 the wire carried exactly one money-carrying row type, so a vendor pricing
    #: cement sent it as a stage — which made a bag of cement a fundable milestone with an
    #: evidence cycle, an approval and a release. `README.md` is explicit that material money is
    #: *spent rather than earned*, so it cannot be recovered like an unearned work stage when a
    #: project ends early; a row type that cannot tell the two apart cannot express that rule.
    #:
    #: Each entry is `{title, quantity, unit, amount_paise}`. They still reconcile into
    #: `total_paise` — the Customer pays for the materials — and they still become
    #: `EngagementStage` rows, because there is one money spine and a second one would be the
    #: duplication this plan forbids. What changes is the *kind* of stage they become, which is
    #: what the recovery rule reads.
    #: Same encoder as `stages`, and for the same reason: this column takes validated serializer
    #: output too, and the next field added to a material line will be the one that is a date.
    material_lines = models.JSONField(default=list, blank=True, encoder=DjangoJSONEncoder)
    warranty_terms = models.TextField(blank=True)
    #: How many working days the vendor expects the work to take, from the day they start.
    #:
    #: **Days, not a date.** A vendor writing an estimate does not know when they will start —
    #: that depends on when the Customer chooses and pays — so a date entered on site is stale
    #: before it is read. "About five working days" is the thing they actually know and the thing
    #: the Customer actually asks.
    #:
    #: The figure is an estimate the *vendor* carries the risk of. `submit_proposal` refuses once
    #: the requirement is `SELECTED` or `ENGAGED`, so the total cannot move after the Customer
    #: chooses: an overrun costs them nothing. That was already true and never said; publishing
    #: this field is what lets a screen say it.
    #:
    #: Null on an estimate written before 1.65.0, and on A3 day-hire where `minimum_days` is the
    #: shape instead — a day rate is priced by the day, so an overrun is billed, not absorbed.
    completion_days = models.PositiveSmallIntegerField(null=True, blank=True)
    #: What the vendor will actually do, in their own words. The lines say what each rupee buys;
    #: this says what the job is. Blank on every quote written before it existed.
    scope_summary = models.TextField(blank=True)
    #: What the Customer should buy before work starts — **never money**. Materials are the
    #: Customer's to purchase on every project; this is the list the vendor's tapped items
    #: produced (`price_book.shopping_list_for_lines`) and then corrected after the visit. Each
    #: entry: `{title, spec, unit, quantity, note}`. Distinct from `material_lines`, which are
    #: priced advances and reconcile into `total_paise`.
    material_list = models.JSONField(default=list, blank=True, encoder=DjangoJSONEncoder)
    #: A label for the shopping list, so "1.5 sq mm wire" reads as one brand tier or the other.
    material_brand_tier = models.CharField(max_length=16, blank=True)
    #: The configuration decision this estimate was submitted under. Snapshotted rather than read
    #: from the live service so an accepted quotation never changes meaning after Operations edits
    #: the catalogue.
    material_fulfilment_mode = models.CharField(
        max_length=24,
        choices=MaterialFulfilmentMode.choices,
    )
    #: Materials/specifications the Partner includes in a turnkey rate. Quantities and notes are
    #: disclosure only: their cost is already inside `item_lines`/`labour_lines`, so this list must
    #: never be added to a total or funded as a second money rail.
    included_supply_list = models.JSONField(default=list, blank=True, encoder=DjangoJSONEncoder)
    valid_until = models.DateTimeField(null=True, blank=True)

    #: Set when Operations captured this by phone. The vendor still confirms before the Customer
    #: sees it, so Operations never becomes the vendor.
    captured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="proposals_captured",
    )
    vendor_confirmed_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("requirement", "-submitted_at")
        constraints = [
            models.UniqueConstraint(
                fields=("invitation", "revision"),
                name="requirements_unique_proposal_revision",
            ),
            models.UniqueConstraint(
                fields=("invitation",),
                condition=models.Q(status="SUBMITTED"),
                name="requirements_one_live_proposal_per_invitation",
            ),
            models.CheckConstraint(
                condition=models.Q(total_paise__gt=0),
                name="requirements_proposal_total_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(tax_paise__lte=models.F("total_paise")),
                name="requirements_proposal_tax_within_total",
            ),
            models.CheckConstraint(
                condition=models.Q(customer_total_paise=models.F("total_paise")),
                name="requirements_proposal_customer_total_is_total",
            ),
            models.CheckConstraint(
                condition=models.Q(discount_base_paise=0, discount_paise=0)
                | models.Q(
                    discount_base_paise=models.F("total_paise") + models.F("discount_paise")
                ),
                name="requirements_proposal_discount_reconciles",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    discount_kind__isnull=True,
                    discount_bps__isnull=True,
                    discount_paise=0,
                    discount_source__isnull=True,
                )
                | models.Q(
                    discount_kind="PERCENT",
                    discount_bps__gte=1,
                    discount_bps__lte=MAX_DISCOUNT_BPS,
                    discount_paise__gt=0,
                    discount_source__in=("CUSTOMER_REQUEST", "PARTNER_OFFER"),
                )
                | models.Q(
                    discount_kind="FIXED",
                    discount_bps__isnull=True,
                    discount_paise__gt=0,
                    discount_source__in=("CUSTOMER_REQUEST", "PARTNER_OFFER"),
                ),
                name="requirements_proposal_discount_shape",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    partner_quote_total_paise=models.F("partner_net_paise")
                    + models.F("commission_paise")
                    + models.F("withholding_paise")
                ),
                name="requirements_proposal_partner_settlement_reconciles",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="REJECTED") | ~models.Q(rejection_reason=""),
                name="requirements_rejection_needs_reason",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "status")),
            models.Index(fields=("requirement", "usability", "status")),
            models.Index(fields=("status", "valid_until")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.partner_id}:r{self.revision}:{self.status}"

    @property
    def is_selectable(self) -> bool:
        return self.status == self.Status.SUBMITTED and self.usability == self.Usability.USABLE


class RequirementQuestion(models.Model):
    """Structured clarification. One question, one answer, both on the timeline.

    Deliberately not a chat: no threads, no participants table, no read receipts and no moderation
    queue. Contact-sharing detection stays tractable because the surface is two text fields.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="questions",
    )
    invitation = models.ForeignKey(
        VendorInvitation,
        on_delete=models.PROTECT,
        related_name="questions",
    )
    asked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requirement_questions_asked",
    )
    question = models.TextField()
    answer = models.TextField(blank=True)
    answered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="requirement_questions_answered",
    )
    answered_at = models.DateTimeField(null=True, blank=True)
    #: Raised when the text looks like a phone number or an off-platform handle. A review signal,
    #: never an automatic penalty.
    contact_sharing_flagged = models.BooleanField(default=False)
    #: Wave C6 (`M2-BE-713`). The operator who wrote down a clarification that happened on the
    #: phone, and the moment the other party's consent to that was recorded. The same shape
    #: `Proposal.captured_by` already uses, and beside it for the same reason: `M2-AC-802` asks
    #: that assisted capture "record consent and the named Customer/Partner actor", and a capture
    #: that stored who typed it but not whether anybody agreed would answer half the question.
    #:
    #: `asked_by` remains the **named actor on whose behalf** it was captured, so attribution on
    #: the timeline is unchanged and the operator is visible beside it rather than instead of it.
    captured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="requirement_questions_captured",
    )
    consent_recorded_at = models.DateTimeField(null=True, blank=True)
    asked_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("asked_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(answered_at__isnull=True) | ~models.Q(answer=""),
                name="requirements_answered_question_has_an_answer",
            ),
            # An assisted capture without recorded consent is the one row this table must not be
            # able to hold: it is the evidence that somebody agreed, and evidence that can be
            # written without the thing it evidences is not evidence.
            models.CheckConstraint(
                condition=models.Q(captured_by__isnull=True)
                | models.Q(consent_recorded_at__isnull=False),
                name="requirements_assisted_question_records_consent",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "asked_at")),
            models.Index(fields=("contact_sharing_flagged",)),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.id}"


class RevisionRequest(models.Model):
    """A Customer asking a vendor to send a different estimate.

    **The invariant, stated exactly.** A Customer may say what they *hope to pay*. Only a vendor
    says what the work *costs*. Those are different sentences and this model holds the first one:
    ``requested_discount_bps`` is an ask, not a price. It is not applied to anything, it does not
    change ``Proposal.total_paise``, and a vendor who ignores it has an estimate that still stands
    exactly as sent. The answer to any request here — priced or not — is an ordinary superseding
    proposal the Customer reads in full.

    What this records is the *reason*: leave the false ceiling out, use a cheaper tile, split it
    into phases, or "this is more than I can spend — can you move 5%". The vendor knows what to
    change, and a revision arriving after the five-minute correction window has a Customer's
    request behind it rather than a quietly replaced price.

    One open request per proposal. Answering it (a new revision) or declining it closes it. The
    Customer's ability to *choose the estimate as it stands* is untouched throughout: asking about
    a price costs nothing and forfeits nothing.
    """

    class Status(models.TextChoices):
        OPEN = "OPEN", "Waiting for the vendor"
        ANSWERED = "ANSWERED", "Answered with a revised estimate"
        DECLINED = "DECLINED", "Declined by the vendor"

    class ReasonCode(models.TextChoices):
        LEAVE_OUT = "LEAVE_OUT", "Leave something out"
        CHANGE_MATERIALS = "CHANGE_MATERIALS", "Change materials or finish"
        PHASE_WORK = "PHASE_WORK", "Split the work into phases"
        PRICE = "PRICE", "Asked about the price"
        OTHER = "OTHER", "Something else"

    #: Re-exposed on the model so callers read it as ``RevisionRequest.MAX_DISCOUNT_BPS``.
    MAX_DISCOUNT_BPS = MAX_DISCOUNT_BPS

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="revision_requests",
    )
    proposal = models.ForeignKey(
        Proposal,
        on_delete=models.PROTECT,
        related_name="revision_requests",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="revision_requests_made",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    reason_code = models.CharField(max_length=20, choices=ReasonCode.choices)
    #: The priced lines the Customer wants left out, by the title the vendor gave them. Titles
    #: rather than indexes because a vendor reads "false ceiling", not "line 4".
    excluded_items = models.JSONField(default=list, blank=True)
    note = models.TextField(blank=True)
    #: What the Customer hoped for, in basis points — 5% is 500. Set only on a ``PRICE`` ask and
    #: null on every other reason. Basis points rather than a percentage or an amount because
    #: money is integer paise everywhere and a float discount would eventually round somebody's
    #: estimate to a figure neither side agreed to.
    #:
    #: **This is never a price.** Nothing reads it to compute what is owed.
    requested_discount_bps = models.PositiveIntegerField(null=True, blank=True)
    #: What the vendor actually granted, when they answered a ``PRICE`` ask by moving. Equal to
    #: ``requested_discount_bps`` when they agreed outright, lower when they countered. Still the
    #: vendor's own number: the superseding proposal is what sets the price, and this records what
    #: they said they were doing so the Customer reads "they came back at 2%, not 5%".
    countered_discount_bps = models.PositiveIntegerField(null=True, blank=True)
    #: The vendor's reason for declining, when they did.
    decline_note = models.TextField(blank=True)
    #: The revision that answered this, once one has.
    answered_by_proposal = models.ForeignKey(
        Proposal,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="answers_revision_requests",
    )
    created_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("proposal",),
                condition=models.Q(status="OPEN"),
                name="requirements_one_open_revision_request_per_proposal",
            ),
            models.CheckConstraint(
                condition=models.Q(status="OPEN", resolved_at__isnull=True)
                | ~models.Q(status="OPEN") & models.Q(resolved_at__isnull=False),
                name="requirements_revision_request_resolved_when_closed",
            ),
            # A discount figure exists on a price ask and nowhere else. Without this a
            # "leave the ceiling out" request could carry a number, and a number on a
            # request nobody reads as priced is how an ask silently becomes an offer.
            models.CheckConstraint(
                condition=models.Q(
                    reason_code="PRICE",
                    requested_discount_bps__gte=1,
                    requested_discount_bps__lte=MAX_DISCOUNT_BPS,
                )
                | ~models.Q(reason_code="PRICE") & models.Q(requested_discount_bps__isnull=True),
                name="requirements_revision_request_discount_only_on_price_ask",
            ),
            models.CheckConstraint(
                condition=models.Q(countered_discount_bps__isnull=True)
                | models.Q(
                    countered_discount_bps__gte=0,
                    countered_discount_bps__lte=MAX_DISCOUNT_BPS,
                ),
                name="requirements_revision_request_counter_within_cap",
            ),
        ]
        indexes = [models.Index(fields=("requirement", "status"))]

    def __str__(self) -> str:
        return f"{self.proposal_id}:{self.status}"
