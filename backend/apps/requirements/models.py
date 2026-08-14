"""Customer requirements for M2 workforce and project work.

A requirement is free to submit and free to match. Nothing here charges anybody: the money
moment is the quote unlock in P4, after a usable quote exists. See
docs/adr/0007-m2-engagement-spine-and-fee-after-value.md.
"""

import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalog.models import M2VariantConfiguration, ServiceVariant
from apps.locations.models import Address, ServiceArea
from apps.partners.models import PartnerProfile


class CustomerRequirement(models.Model):
    """One thing a Customer needs done, captured in four screens and priced by nobody yet."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        MATCHING = "MATCHING", "Matching"
        #: A5 only. A vendor has confirmed a visit slot, so the plan is charged and visits are
        #: booked, but no estimate has landed yet. Unreachable for A3 — the archetype is the guard.
        VISITS_BOOKED = "VISITS_BOOKED", "Visits booked"
        QUOTES_READY = "QUOTES_READY", "Quotes ready"
        #: A3 only. `QUOTES_READY` plus a paid unlock. Unreachable for A5, which has no paywall
        #: between a delivered estimate and the Customer reading it.
        UNLOCKED = "UNLOCKED", "Unlocked"
        SELECTED = "SELECTED", "Selected"
        ENGAGED = "ENGAGED", "Engaged"
        CLOSED_NO_SUPPLY = "CLOSED_NO_SUPPLY", "Closed: no supply"
        CLOSED_SLA_BREACH = "CLOSED_SLA_BREACH", "Closed: delivery promise missed"
        CLOSED_EXPIRED = "CLOSED_EXPIRED", "Closed: needed-by date passed"
        CLOSED_ABANDONED = "CLOSED_ABANDONED", "Closed: abandoned"
        CLOSED_COMPLETE = "CLOSED_COMPLETE", "Closed: complete"
        CLOSED_CANCELLED = "CLOSED_CANCELLED", "Closed: cancelled"

    #: Statuses after which a vendor has seen the requirement, so edits stop being free.
    LIVE_STATUSES = (
        Status.MATCHING,
        Status.VISITS_BOOKED,
        Status.QUOTES_READY,
        Status.UNLOCKED,
    )
    CLOSED_STATUSES = (
        Status.CLOSED_NO_SUPPLY,
        Status.CLOSED_SLA_BREACH,
        Status.CLOSED_EXPIRED,
        Status.CLOSED_ABANDONED,
        Status.CLOSED_COMPLETE,
        Status.CLOSED_CANCELLED,
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requirements",
    )
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="requirements",
    )
    #: The exact configuration version whose schema these answers were validated against.
    configuration = models.ForeignKey(
        M2VariantConfiguration,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="requirements",
    )
    #: Inferred from the answers, never from the category name. Denormalised for matching.
    archetype = models.CharField(
        max_length=24,
        choices=ServiceVariant.BookingArchetype.choices,
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT)

    address = models.ForeignKey(
        Address,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="requirements",
    )
    service_area = models.ForeignKey(
        ServiceArea,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="requirements",
    )

    requested_start = models.DateTimeField(null=True, blank=True)
    flexibility_days = models.PositiveSmallIntegerField(default=0)
    #: The hard one. A quote delivered after this is worthless, so it outranks every other clock.
    service_by = models.DateField(null=True, blank=True)

    budget_min_paise = models.PositiveBigIntegerField(null=True, blank=True)
    budget_max_paise = models.PositiveBigIntegerField(null=True, blank=True)

    #: BCP-47-ish tag for the answers and any voice note. An eligibility input, not decoration:
    #: a vendor who cannot understand the note is a silent matching failure.
    language = models.CharField(max_length=16, default="en-IN")

    answers = models.JSONField(default=dict)
    additional_details = models.TextField(blank=True)

    #: Set when this requirement was created by merging or superseding another.
    supersedes = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="superseded_by",
    )

    first_quote_due_at = models.DateTimeField(null=True, blank=True)
    quotes_due_at = models.DateTimeField(null=True, blank=True)

    submitted_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_reason_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(budget_max_paise__isnull=True)
                | models.Q(budget_min_paise__isnull=True)
                | models.Q(budget_max_paise__gte=models.F("budget_min_paise")),
                name="requirements_budget_band_ordered",
            ),
            models.CheckConstraint(
                condition=models.Q(status="DRAFT") | models.Q(submitted_at__isnull=False),
                name="requirements_submitted_has_timestamp",
            ),
            models.CheckConstraint(
                condition=~models.Q(
                    status__in=(
                        "CLOSED_NO_SUPPLY",
                        "CLOSED_SLA_BREACH",
                        "CLOSED_EXPIRED",
                        "CLOSED_ABANDONED",
                        "CLOSED_COMPLETE",
                        "CLOSED_CANCELLED",
                    )
                )
                | models.Q(closed_at__isnull=False),
                name="requirements_closed_has_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("customer", "status")),
            models.Index(fields=("status", "archetype"), name="requirements_matching_idx"),
            models.Index(fields=("status", "quotes_due_at")),
            models.Index(fields=("status", "service_by")),
        ]

    def __str__(self) -> str:
        return f"{self.id}:{self.archetype}:{self.status}"

    @property
    def is_editable_freely(self) -> bool:
        """Before any vendor has seen it, an edit costs nothing and creates no version."""
        return self.status == self.Status.DRAFT


class RequirementAttachment(models.Model):
    """Media a Customer attached. Storage is `apps.foundation.storage` with an M2 bucket."""

    class Kind(models.TextChoices):
        IMAGE = "IMAGE", "Image"
        VIDEO = "VIDEO", "Video"
        AUDIO = "AUDIO", "Audio"
        VOICE_NOTE = "VOICE_NOTE", "Voice note"
        DOCUMENT = "DOCUMENT", "Document"

    class ProcessingStatus(models.TextChoices):
        """One pipeline: the object is fetched back, measured, hashed and scanned.

        `INFECTED` and `FAILED` are deliberately not one value. A mismatched checksum is the
        Customer's upload going wrong and the recovery is "try again"; malware is not, and the
        recovery is "this file is gone and no vendor ever saw it". A single `FAILED` would have
        offered a retry button for the second case.
        """

        PENDING = "PENDING", "Pending"
        VERIFIED = "VERIFIED", "Verified"
        INFECTED = "INFECTED", "Rejected by the malware scan"
        FAILED = "FAILED", "Failed"

    #: Attachments a vendor may be shown. Everything else is either still being checked or has
    #: been refused, and neither belongs in a snapshot.
    SHAREABLE_STATUSES = (ProcessingStatus.VERIFIED,)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="attachments",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    object_key = models.CharField(max_length=400, unique=True)
    content_type = models.CharField(max_length=120)
    size_bytes = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    processing_status = models.CharField(
        max_length=16,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.PENDING,
    )
    failure_reason = models.CharField(max_length=200, blank=True)
    #: Populated for voice notes so a vendor who does not speak the language can still be matched.
    transcript = models.TextField(blank=True)
    transcript_language = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [
            models.Index(fields=("requirement", "processing_status")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.kind}"


class RequirementAttachmentUpload(models.Model):
    """One signed-upload intent, issued before any bytes exist.

    The same shape as `partners.PartnerDocumentUpload`, and for the same reason: the server names
    the object key and records what it expects, so finalization can compare the object that
    actually arrived against the file the client said it was sending. Without the intent row there
    is nothing to compare against, and "verify the upload" degrades to "trust the client".
    """

    class Status(models.TextChoices):
        ISSUED = "ISSUED", "Issued"
        VERIFIED = "VERIFIED", "Verified"
        EXPIRED = "EXPIRED", "Expired"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="attachment_uploads",
    )
    kind = models.CharField(max_length=16, choices=RequirementAttachment.Kind.choices)
    object_key = models.CharField(max_length=400, unique=True)
    content_type = models.CharField(max_length=120)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    #: Carried through to the attachment so a voice note in Telugu is routable the moment it is
    #: finalized, rather than after a transcription adapter that does not exist yet.
    language = models.CharField(max_length=16, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ISSUED)
    expires_at = models.DateTimeField()
    finalized_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(size_bytes__gt=0),
                name="requirements_attachment_upload_size_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "status", "expires_at")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.kind}:{self.status}"


class RequirementTransition(models.Model):
    """Immutable record of every requirement status change and who caused it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="transitions",
    )
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="requirement_transitions_made",
    )
    reason_code = models.SlugField(max_length=80)
    reason = models.TextField(blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("occurred_at", "id")
        indexes = [
            models.Index(fields=("requirement", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.from_status}->{self.to_status}"


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
        CustomerRequirement,
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
        CustomerRequirement,
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
                name="requirements_one_invitation_per_partner",
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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        CustomerRequirement,
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

    total_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField(default=0)
    #: Fixed per requirement so a GST-registered vendor and an unregistered one compare honestly.
    tax_basis = models.CharField(max_length=12, choices=TaxBasis.choices)
    #: Whether the platform's commission sits inside `total_paise` or is added on top. Displayed on
    #: every proposal; an open owner decision, so it is recorded rather than assumed.
    commission_treatment = models.CharField(max_length=24, blank=True)

    inclusions = models.JSONField(default=list, blank=True)
    exclusions = models.JSONField(default=list, blank=True)
    #: A5 stage breakdown. Stage totals plus material lines must reconcile to `total_paise`
    #: before selection.
    stages = models.JSONField(default=list, blank=True)
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
    material_lines = models.JSONField(default=list, blank=True)
    warranty_terms = models.TextField(blank=True)
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
        CustomerRequirement,
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
    asked_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("asked_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(answered_at__isnull=True) | ~models.Q(answer=""),
                name="requirements_answered_question_has_an_answer",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "asked_at")),
            models.Index(fields=("contact_sharing_flagged",)),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.id}"


# ---------------------------------------------------------------------------
# P4 / revision 3: the two front doors and the money behind them.
#
# A3 sells access to delivered remote quotes (`QuoteUnlock`). A5 sells professional visits that
# produce on-site estimates (`VisitPlan` + `VisitPlanShare`). Both are charged only against a real
# accepted commitment, both price server-side from `M2AccessPrice`, and both snapshot the price
# they were bought at so a later price change cannot rewrite a completed purchase.
# ---------------------------------------------------------------------------


class M2AccessPrice(models.Model):
    """Operations-owned, effective-dated price for one M2 access product.

    The same shape as `partners.MinimumWageFloor`, and for the same reason: money values are
    reference data an operator loads and supersedes with a newer effective-dated row, never a
    constant in code. **Nothing here has a default.** Tier prices and the per-slot split are
    blocking owner decision 1, so `apps.requirements.pricing` refuses with
    `m2_access_price_unavailable` while no row is effective rather than inventing INR 149 or a
    50/50 split. A guessed price is indistinguishable from an approved one once it has been
    charged.
    """

    class Kind(models.TextChoices):
        A3_QUOTE_UNLOCK = "A3_QUOTE_UNLOCK", "A3 quote unlock"
        A5_VISIT_PLAN = "A5_VISIT_PLAN", "A5 visit plan"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    #: How many vendor visits this tier buys. Zero for the unlock, which is not a tiered product.
    plan_size = models.PositiveSmallIntegerField(default=0)
    amount_paise = models.PositiveBigIntegerField()
    #: The vendor visit payout's share of one slot, in basis points; the remainder is the Vsolve
    #: platform share. A5 only — an unlock pays no vendor, so it carries no split.
    vendor_payout_basis_points = models.PositiveIntegerField(null=True, blank=True)
    effective_from = models.DateField()
    source_reference = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("kind", "plan_size", "-effective_from")
        constraints = [
            models.UniqueConstraint(
                fields=("kind", "plan_size", "effective_from"),
                name="requirements_unique_access_price_version",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="requirements_access_price_positive",
            ),
            # The two products have genuinely different shapes, and mixing them is the error that
            # would silently produce an unlock with a vendor payout or a tier that buys no visits.
            models.CheckConstraint(
                condition=(
                    models.Q(
                        kind="A3_QUOTE_UNLOCK",
                        plan_size=0,
                        vendor_payout_basis_points__isnull=True,
                    )
                    | models.Q(kind="A5_VISIT_PLAN", vendor_payout_basis_points__isnull=False)
                    & models.Q(plan_size__gt=0)
                ),
                name="requirements_access_price_shape_matches_kind",
            ),
            models.CheckConstraint(
                condition=models.Q(vendor_payout_basis_points__isnull=True)
                | models.Q(vendor_payout_basis_points__lte=10000),
                name="requirements_access_price_split_within_range",
            ),
        ]
        indexes = [
            models.Index(fields=("kind", "plan_size", "effective_from")),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.plan_size}:{self.amount_paise}"


class QuoteUnlock(models.Model):
    """A3 only. What the Customer bought when they paid to read the delivered quotes.

    `ACTIVE` is reachable **only** from a verified provider callback. A client redirect saying
    "payment succeeded" is a claim by the party that benefits from it, and an unlock granted on it
    is an unlock granted for free.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Awaiting the provider"
        ACTIVE = "ACTIVE", "Active"
        CONSUMED = "CONSUMED", "Consumed by an engagement"
        REFUNDED = "REFUNDED", "Refunded"
        FAILED = "FAILED", "Failed"

    #: Statuses in which the Customer may read full quotes.
    READABLE_STATUSES = (Status.ACTIVE, Status.CONSUMED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="quote_unlocks",
    )
    #: The reference row this purchase was priced from, and the paise it was priced at. Both are
    #: kept: the FK explains *which policy* applied, the integer is the immutable purchase amount
    #: that a refund has to reconcile against even after the policy is superseded.
    price = models.ForeignKey(M2AccessPrice, on_delete=models.PROTECT, related_name="unlocks")
    price_paise = models.PositiveBigIntegerField()
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_quote_unlocks",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    #: The proposals this unlock actually bought, frozen when it activated. A quote submitted
    #: afterwards is still readable — the promise is "up to three" — but the audit needs to know
    #: what was on the table at the moment money moved.
    unlocked_proposal_ids = models.JSONField(default=list, blank=True)
    non_responsive_rejection_count = models.PositiveSmallIntegerField(default=0)
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_quote_unlocks",
    )
    receipt_series = models.CharField(max_length=24, blank=True)
    receipt_sequence = models.PositiveBigIntegerField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # One unlock per requirement, scoped to the ones that still mean something. A failed
            # attempt must not block a retry, and this is what makes "one successful payment
            # grants exactly one unlock" a database fact rather than a code convention.
            models.UniqueConstraint(
                fields=("requirement",),
                condition=~models.Q(status="FAILED"),
                name="requirements_one_live_unlock_per_requirement",
            ),
            models.CheckConstraint(
                condition=~models.Q(status__in=("ACTIVE", "CONSUMED"))
                | models.Q(activated_at__isnull=False),
                name="requirements_active_unlock_has_a_timestamp",
            ),
            models.CheckConstraint(
                condition=models.Q(price_paise__gt=0),
                name="requirements_unlock_price_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.status}"


class VisitPlan(models.Model):
    """A5 only. One, two or three professionals visit and estimate on site.

    `CHOSEN` charges nothing — it bounds the invitation wave. The **whole plan** is charged once,
    at the first confirmed visit slot, and only on a verified provider callback. Later slots book
    free. `SETTLED` means every share is `EARNED` or `REFUNDED` and the arithmetic closes:
    `price_paise = Σ vendor payouts + Σ platform shares + Σ refunds`.
    """

    class Status(models.TextChoices):
        CHOSEN = "CHOSEN", "Chosen, nothing charged"
        PENDING = "PENDING", "Awaiting the provider"
        ACTIVE = "ACTIVE", "Charged"
        FAILED = "FAILED", "Payment failed"
        VOID = "VOID", "Closed before any visit was confirmed"
        SETTLED = "SETTLED", "Every share earned or refunded"

    #: Statuses in which the plan has been paid for and its shares are live.
    CHARGED_STATUSES = (Status.ACTIVE, Status.SETTLED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.OneToOneField(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="visit_plan",
    )
    plan_size = models.PositiveSmallIntegerField()
    price = models.ForeignKey(M2AccessPrice, on_delete=models.PROTECT, related_name="visit_plans")
    price_paise = models.PositiveBigIntegerField()
    #: Value carried over from an A3 unlock when Operations reclassified the requirement to A5.
    #: `M2-BE-427`: reclassification never charges twice, so the plan checkout collects
    #: `price_paise - credit_paise` and a fully credited plan activates with no payment at all.
    credit_paise = models.PositiveBigIntegerField(default=0)
    credit_unlock = models.ForeignKey(
        QuoteUnlock,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="credited_visit_plans",
    )
    #: Snapshotted alongside the price, because the split decides a vendor's income and must not
    #: move under a visit that has already been promised.
    vendor_payout_basis_points = models.PositiveIntegerField()
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_visit_plans",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.CHOSEN)
    receipt_series = models.CharField(max_length=24, blank=True)
    receipt_sequence = models.PositiveBigIntegerField(null=True, blank=True)
    #: The visit-delivery SLA, stamped when the plan is charged. Stored rather than recomputed so
    #: the unfilled-share sweep can find due plans with an indexed comparison instead of resolving
    #: a business-hours calendar per row.
    fill_due_at = models.DateTimeField(null=True, blank=True)
    chosen_at = models.DateTimeField(default=timezone.now)
    charged_at = models.DateTimeField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(plan_size__gt=0),
                name="requirements_visit_plan_size_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(price_paise__gt=0),
                name="requirements_visit_plan_price_positive",
            ),
            models.CheckConstraint(
                condition=~models.Q(status__in=("ACTIVE", "SETTLED"))
                | models.Q(charged_at__isnull=False),
                name="requirements_charged_plan_has_a_timestamp",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.plan_size}:{self.status}"

    @property
    def chargeable_paise(self) -> int:
        """What the Customer still owes: the tier price less any carried-over unlock credit."""
        return max(self.price_paise - self.credit_paise, 0)

    @property
    def charge_required(self) -> bool:
        """False when a reclassification credit already covers the whole plan."""
        return self.chargeable_paise > 0


class VisitPlanShare(models.Model):
    """One slot of a visit plan, and the money that follows it.

    Shares exist from the moment the plan is `CHOSEN`, before anything is charged, because the
    first vendor commits to a slot *before* the Customer pays and the commitment has to attach
    somewhere. Their arithmetic is fixed then: `price / size` in integer paise with the remainder
    on the first share, so the parts always add back to the whole.

    `REPLACED` is transient, not terminal. It means this share's visit fell through — a vendor
    no-show, or a completed visit that produced no estimate — and a **free replacement visit** is
    owed. Confirming that replacement returns the share to `COMMITTED`; the visit SLA sweeping past
    it turns it into `REFUNDED`. `SETTLED` at plan level therefore only ever sees `EARNED` and
    `REFUNDED`, exactly as the state machine says.
    """

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        COMMITTED = "COMMITTED", "A vendor confirmed a visit"
        EARNED = "EARNED", "Visit completed and estimate delivered"
        REFUNDED = "REFUNDED", "Refunded to the Customer"
        REPLACED = "REPLACED", "Awaiting a free replacement visit"

    #: Statuses from which a settlement sweep may still move a share.
    OPEN_STATUSES = (Status.OPEN, Status.COMMITTED, Status.REPLACED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.ForeignKey(VisitPlan, on_delete=models.PROTECT, related_name="shares")
    position = models.PositiveSmallIntegerField()
    amount_paise = models.PositiveBigIntegerField()
    #: The split, computed once from the plan's snapshotted basis points. Stored rather than
    #: derived so a share can be audited without re-running arithmetic against a moving policy.
    vendor_payout_paise = models.PositiveBigIntegerField()
    platform_share_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    partner = models.ForeignKey(
        PartnerProfile,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="visit_plan_shares",
    )
    #: Written when the share is `EARNED`: the vendor's visit payout, on the M1 payout rails.
    ledger_entry = models.ForeignKey(
        "payouts.PartnerLedgerEntry",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_visit_plan_shares",
    )
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_visit_plan_shares",
    )
    settlement_reason_code = models.SlugField(max_length=80, blank=True)
    committed_at = models.DateTimeField(null=True, blank=True)
    earned_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("plan", "position")
        constraints = [
            models.UniqueConstraint(
                fields=("plan", "position"),
                name="requirements_unique_visit_plan_share_position",
            ),
            # The split has to close, in paise, on every row. Without this a rounding change in
            # one caller would silently pay a vendor out of the platform's share.
            models.CheckConstraint(
                condition=models.Q(
                    amount_paise=models.F("vendor_payout_paise") + models.F("platform_share_paise")
                ),
                name="requirements_visit_share_split_reconciles",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="requirements_visit_share_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("plan", "status")),
            models.Index(fields=("status", "partner")),
        ]

    def __str__(self) -> str:
        return f"{self.plan_id}:{self.position}:{self.status}"

    @property
    def is_settled(self) -> bool:
        return self.status in (self.Status.EARNED, self.Status.REFUNDED)


class SiteVisit(models.Model):
    """A paid, scheduled visit whose fee adjusts against the final price.

    Free site visits get refused by vendors, who will not travel unpaid, and used by Customers as
    free consulting. Charging for it also compensates the vendor when a Customer goes silent after.

    Two shapes, one model, since revision 3. Under **A5** a visit occupies one `VisitPlanShare`,
    its fee is that share, and its slot is a real hold on the M1 availability grid. Under **A3**
    (and for a second look on A5) it is still the ad-hoc visit with a vendor-priced fee.
    """

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        SCHEDULED = "SCHEDULED", "Scheduled"
        IN_PROGRESS = "IN_PROGRESS", "Vendor has arrived"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"
        VENDOR_NO_SHOW = "VENDOR_NO_SHOW", "Vendor did not arrive"
        CUSTOMER_NO_SHOW = "CUSTOMER_NO_SHOW", "Nobody was on site"

    #: Statuses in which a visit still occupies its plan share. A cancelled or no-show visit
    #: releases the share so a free replacement can be booked onto it.
    SHARE_HOLDING_STATUSES = (
        Status.REQUESTED,
        Status.SCHEDULED,
        Status.IN_PROGRESS,
        Status.COMPLETED,
    )

    class ArrivalMethod(models.TextChoices):
        """How arrival was proved. `START_OTP` is M3 activation and is never written in M2."""

        NON_OTP_FALLBACK = "NON_OTP_FALLBACK", "Confirmed without an OTP"
        START_OTP = "START_OTP", "Confirmed with a start OTP"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="site_visits",
    )
    invitation = models.ForeignKey(
        VendorInvitation,
        on_delete=models.PROTECT,
        related_name="site_visits",
    )
    #: Set for an A5 plan visit, null for the ad-hoc paid visit. A share holds at most one live
    #: visit, enforced below rather than by a `OneToOneField`, because a replacement visit has to
    #: be able to take the share a cancelled one gave back.
    plan_share = models.ForeignKey(
        VisitPlanShare,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="site_visits",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    fee_paise = models.PositiveBigIntegerField()
    #: Whether the fee comes off the final price if this vendor is chosen.
    adjusts_against_final_price = models.BooleanField(default=True)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    #: How long the slot occupies the vendor on the shared grid. Stored because the reservation was
    #: written from it, and a reschedule has to reproduce the same width.
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    arrival_confirmed_at = models.DateTimeField(null=True, blank=True)
    arrival_method = models.CharField(max_length=20, choices=ArrivalMethod.choices, blank=True)
    arrival_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_visit_arrivals_confirmed",
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    #: When a completed visit stops being allowed to produce an estimate. Business hours, from the
    #: variant's `post_visit_estimate_window_hours`; null when the owner has set no window.
    estimate_due_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason_code = models.SlugField(max_length=80, blank=True)
    outcome_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(status="SCHEDULED") | models.Q(scheduled_for__isnull=False),
                name="requirements_scheduled_visit_has_a_time",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="COMPLETED") | models.Q(completed_at__isnull=False),
                name="requirements_completed_visit_has_a_timestamp",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="IN_PROGRESS")
                | models.Q(arrival_confirmed_at__isnull=False),
                name="requirements_visit_in_progress_has_an_arrival",
            ),
            models.UniqueConstraint(
                fields=("plan_share",),
                condition=models.Q(plan_share__isnull=False)
                & models.Q(status__in=("REQUESTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED")),
                name="requirements_one_live_visit_per_plan_share",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "status")),
            models.Index(fields=("status", "scheduled_for")),
            models.Index(fields=("status", "estimate_due_at")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.invitation_id}:{self.status}"


class ProposalSelection(models.Model):
    """The Customer chose a proposal; the vendor has not yet reconfirmed.

    Selection is not a booking. This row is the gap between the two, and it exists as its own
    record rather than as two timestamps on `Proposal` because the gap has a history: a vendor who
    declines or times out closes one selection, the Customer's unlock or visit-plan entitlement
    survives it, and the next selection is a new row against a different proposal.
    """

    class Status(models.TextChoices):
        PENDING_RECONFIRMATION = "PENDING_RECONFIRMATION", "Awaiting the vendor"
        CONFIRMED = "CONFIRMED", "Vendor reconfirmed"
        DECLINED = "DECLINED", "Vendor declined"
        EXPIRED = "EXPIRED", "Vendor did not answer in time"
        WITHDRAWN = "WITHDRAWN", "Customer withdrew the selection"

    #: Statuses that occupy the requirement's one selection slot.
    LIVE_STATUSES = (Status.PENDING_RECONFIRMATION, Status.CONFIRMED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="selections",
    )
    proposal = models.ForeignKey(Proposal, on_delete=models.PROTECT, related_name="selections")
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="requirement_selections",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.PENDING_RECONFIRMATION,
    )
    #: Business hours, like every other M2 clock. Null when the area carries no operating windows.
    reconfirm_by = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decline_reason_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # "Multiple simultaneous selections are not supported" as a database fact. The
            # multiple-lots allowance was withdrawn because it was an undefined branch in the most
            # safety-critical command in the system.
            models.UniqueConstraint(
                fields=("requirement",),
                condition=models.Q(status__in=("PENDING_RECONFIRMATION", "CONFIRMED")),
                name="requirements_one_live_selection_per_requirement",
            ),
        ]
        indexes = [
            models.Index(fields=("status", "reconfirm_by")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.proposal_id}:{self.status}"


class Engagement(models.Model):
    """One agreement, both archetypes. Created only after the vendor reconfirms.

    The commercial mode is **fixed by archetype** and copied here rather than configured: A3 is
    `LEAD_ONLY` (the Customer pays the vendor directly and Vsolve's revenue is the unlock fee), A5
    is `MANAGED_PAYMENT_REQUIRED` (staged funding through Vsolve). Neither the vendor nor
    Operations can change it on a live engagement, which is why it is a stored, frozen term.

    C2 creates this aggregate and freezes its terms. The stage command spine — evidence, approval,
    correction, dispute, release — is Wave C3 and deliberately absent here.
    """

    class CommercialMode(models.TextChoices):
        LEAD_ONLY = "LEAD_ONLY", "Customer pays the vendor directly"
        MANAGED_PAYMENT_REQUIRED = "MANAGED_PAYMENT_REQUIRED", "Paid through Vsolve"

    class Status(models.TextChoices):
        PENDING_START = "PENDING_START", "Pending start"
        ACTIVE = "ACTIVE", "Active"
        COMPLETING = "COMPLETING", "Completing"
        COMPLETED = "COMPLETED", "Completed"
        WARRANTY = "WARRANTY", "In warranty"
        CLOSED = "CLOSED", "Closed"
        DISPUTED = "DISPUTED", "Disputed"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.OneToOneField(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="engagement",
    )
    #: Null on the **rate-card A3 path** (revision 4, ADR-0009). There is no proposal and no
    #: selection there: the first accepting lead is the crew and the verified booking fee is the
    #: confirmation, so `07-state-machines-and-permissions.md` §1 never passes such a requirement
    #: through `QUOTES_READY`, `UNLOCKED` or `SELECTED`. Nullable rather than fabricated — a
    #: synthetic `Proposal` row would put a quote nobody wrote into the table a dispute reads.
    #: The same shape C3 gave `fulfilment.ScopeAmendment.booking`, for the same reason.
    selection = models.OneToOneField(
        ProposalSelection,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="engagement",
    )
    proposal = models.ForeignKey(
        Proposal,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="engagements",
    )
    partner = models.ForeignKey(
        PartnerProfile, on_delete=models.PROTECT, related_name="engagements"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="m2_engagements",
    )
    archetype = models.CharField(max_length=24)
    commercial_mode = models.CharField(max_length=24, choices=CommercialMode.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING_START)

    #: Frozen from the selected proposal. A later supersession cannot move an agreed price, and
    #: neither can an amendment: an accepted amendment moves `amendment_delta_paise`, so the
    #: number both parties originally agreed to stays readable next to the number they now owe.
    total_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField(default=0)
    tax_basis = models.CharField(max_length=12)
    #: Server-calculated, never client-supplied. Zero for `LEAD_ONLY`: Vsolve does not collect the
    #: A3 service payment, so recording a commission against it would book revenue that does not
    #: exist.
    commission_paise = models.PositiveBigIntegerField(default=0)
    commission_treatment = models.CharField(max_length=24, blank=True)
    #: The whole proposal as it stood at reconfirmation, so a dispute years later reads the terms
    #: both parties actually agreed to rather than the current row.
    terms_snapshot = models.JSONField(default=dict)

    # --- Wave C3: the money envelope, as columns so it can be a database constraint -----------
    #
    # `M2-BE-504` asks that stage amounts reconcile to the engagement total and that funded,
    # approved, paid and refunded amounts cannot exceed their legal bounds — **as database
    # constraints, not only as application validation**. A sum across stage rows cannot be a
    # row-level `CHECK`, so the sums live here as maintained columns and the reconciliation
    # becomes a check between two columns of one row. Every writer updates them with `F()`
    # arithmetic inside the transaction that moved the stage, so two concurrent approvals add
    # rather than overwrite.

    #: Σ of this engagement's stage amounts. Equal to `total_paise + amendment_delta_paise` by
    #: constraint — which is the reconciliation `M2-BE-504` names, expressed where the database
    #: can refuse a violation instead of a report noticing one.
    staged_total_paise = models.PositiveBigIntegerField(default=0)
    #: Net of every **authorized** amendment, signed. Positive for extra work, negative for scope
    #: taken out. `total_paise` never moves; this is what moved.
    amendment_delta_paise = models.BigIntegerField(default=0)
    funded_total_paise = models.PositiveBigIntegerField(default=0)
    approved_total_paise = models.PositiveBigIntegerField(default=0)
    released_total_paise = models.PositiveBigIntegerField(default=0)
    refunded_total_paise = models.PositiveBigIntegerField(default=0)

    #: When the counterparties may see each other's contact details, and when work may begin. A3
    #: releases both at creation — a connection *is* the product. A5 releases both only once the
    #: first stage is funded, because managed work that starts unfunded has no protection behind
    #: it.
    contact_released_at = models.DateTimeField(null=True, blank=True)
    work_may_start_at = models.DateTimeField(null=True, blank=True)
    disputed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    #: Terms frozen at reconfirmation. Written once, at creation, and refused afterwards by
    #: `save()` — `M2-BE-508` in the one place no caller can route around.
    FROZEN_TERM_FIELDS = (
        "archetype",
        "commercial_mode",
        "total_paise",
        "tax_paise",
        "tax_basis",
        "commission_paise",
        "commission_treatment",
        "terms_snapshot",
    )

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total_paise__gt=0),
                name="requirements_engagement_total_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(tax_paise__lte=models.F("total_paise")),
                name="requirements_engagement_tax_within_total",
            ),
            models.CheckConstraint(
                condition=models.Q(commission_paise__lte=models.F("total_paise")),
                name="requirements_engagement_commission_within_total",
            ),
            # `LEAD_ONLY` earns no commission, by product rule rather than by configuration.
            models.CheckConstraint(
                condition=~models.Q(commercial_mode="LEAD_ONLY") | models.Q(commission_paise=0),
                name="requirements_lead_only_engagement_has_no_commission",
            ),
            # `M2-BE-504`, the reconciliation itself. The stages are the agreement: their amounts
            # add to the agreed total plus whatever amendments both parties authorized, and
            # nothing else. A stage created without moving the delta, or an amendment applied
            # without creating a stage, is refused by the database rather than discovered in a
            # month of unexplained variance.
            models.CheckConstraint(
                condition=models.Q(
                    staged_total_paise=models.F("total_paise") + models.F("amendment_delta_paise")
                ),
                name="requirements_engagement_stages_reconcile_to_total",
            ),
            # **Vsolve never holds more of a Customer's money than there is agreed work.** The
            # live exposure is what was collected less what has been given back, and it is bounded
            # by the staged scope — which is what makes a scope reduction sound: the refund runs
            # first, then the scope shrinks, and this holds at both steps.
            models.CheckConstraint(
                condition=models.Q(
                    funded_total_paise__lte=models.F("staged_total_paise")
                    + models.F("refunded_total_paise")
                ),
                name="requirements_engagement_exposure_within_scope",
            ),
            models.CheckConstraint(
                condition=models.Q(refunded_total_paise__lte=models.F("funded_total_paise")),
                name="requirements_engagement_refund_within_funding",
            ),
            models.CheckConstraint(
                condition=models.Q(approved_total_paise__lte=models.F("staged_total_paise")),
                name="requirements_engagement_approved_within_scope",
            ),
            models.CheckConstraint(
                condition=models.Q(released_total_paise__lte=models.F("approved_total_paise")),
                name="requirements_engagement_released_within_approved",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "status")),
            models.Index(fields=("customer", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.commercial_mode}:{self.status}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Frozen commercial terms are frozen (`M2-BE-508`).

        The rule "no scope, amount or completion change through clarification, callback or any
        unilateral UI action" is only worth as much as the narrowest place it is enforced. A
        service that forgets it is a bug; a model that permits it is an invitation. Following
        `payouts.PartnerLedgerEntry.save`, which refuses the same class of edit for the same
        reason: this is the table where "someone will remember not to" is not good enough.

        An amendment moves `amendment_delta_paise` and `staged_total_paise`, never these eight.
        """
        if not self._state.adding:
            update_fields = set(kwargs.get("update_fields") or ())
            frozen = update_fields.intersection(self.FROZEN_TERM_FIELDS)
            if frozen or not update_fields:
                raise ValueError(
                    "An engagement's agreed terms are frozen at reconfirmation. Change scope or "
                    "price through an accepted scope amendment, never by writing the engagement."
                )
        super().save(*args, **kwargs)


class EngagementStage(models.Model):
    """One shift-day (A3) or one milestone (A5), with the same money semantics either way.

    A5 stages fund **at face value**. There is no stage credit: the visit-plan money was spent on
    the visits themselves and settles per share, so discounting a stage by it would pay for the
    visits twice.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        AWAITING_REVIEW = "AWAITING_REVIEW", "Awaiting review"
        APPROVED = "APPROVED", "Approved"
        CORRECTION_REQUESTED = "CORRECTION_REQUESTED", "Correction requested"
        DISPUTED = "DISPUTED", "Disputed"
        RELEASED = "RELEASED", "Released"

    class FundingState(models.TextChoices):
        NOT_REQUIRED = "NOT_REQUIRED", "Not required"
        REQUIRED = "REQUIRED", "Funding required"
        PENDING = "PENDING", "Awaiting the provider"
        FUNDED = "FUNDED", "Funded"

    class Kind(models.TextChoices):
        """What this row's money buys, and therefore how it can be recovered (`M2-BE-543`).

        There is still exactly **one** money spine — a second table for materials would be the
        duplication this plan forbids — but "a milestone of work" and "an advance against
        materials" are not the same promise and cannot share a recovery rule. `README.md`:
        *material money is spent, not earned, so it cannot be recovered like an unearned work
        stage when a project ends early.* Without this column that sentence has nothing to read,
        and `route_suspended_capability_engagements` would refund a Customer for cement the
        vendor has already bought.
        """

        WORK = "WORK", "Work"
        MATERIAL_ADVANCE = "MATERIAL_ADVANCE", "Material advance"

    #: Statuses in which the vendor still owes work on this stage.
    OPEN_STATUSES = (
        Status.PENDING,
        Status.IN_PROGRESS,
        Status.AWAITING_REVIEW,
        Status.CORRECTION_REQUESTED,
        Status.DISPUTED,
    )
    #: Statuses in which the money for this stage is decided.
    SETTLED_STATUSES = (Status.RELEASED,)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(Engagement, on_delete=models.PROTECT, related_name="stages")
    position = models.PositiveSmallIntegerField()
    label = models.CharField(max_length=200)
    amount_paise = models.PositiveBigIntegerField()
    #: `WORK` for every A3 shift-day and every A5 milestone; `MATERIAL_ADVANCE` for a material
    #: line the vendor priced on their estimate. Defaulted rather than nullable so every row
    #: written before 1.26.0 reads as what it was.
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.WORK)
    scheduled_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING)
    funding_state = models.CharField(
        max_length=16,
        choices=FundingState.choices,
        default=FundingState.NOT_REQUIRED,
    )
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_stages",
    )
    #: The four money numbers `M2-BE-504` bounds, per stage. Stored rather than derived because a
    #: bound the database can enforce has to be a column, and because a stage that was funded at
    #: one amount and amended to another must still reconcile against what was actually taken.
    funded_paise = models.PositiveBigIntegerField(default=0)
    approved_amount_paise = models.PositiveBigIntegerField(default=0)
    released_amount_paise = models.PositiveBigIntegerField(default=0)
    refunded_amount_paise = models.PositiveBigIntegerField(default=0)
    #: The vendor's earning for this stage, on the M1 payout rails. Written `PENDING` at approval
    #: — held for the dispute window — and moved to `AVAILABLE` by the release sweep. Null for a
    #: `LEAD_ONLY` stage, where Vsolve collects nothing and therefore owes nothing.
    ledger_entry = models.ForeignKey(
        "payouts.PartnerLedgerEntry",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_stages",
    )
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_stages",
    )
    #: When silence becomes approval. Business hours, stamped when evidence lands; null when the
    #: owner has set no review window, and those stages are deliberately never auto-approved.
    review_due_at = models.DateTimeField(null=True, blank=True)
    #: When an approved stage's held payout becomes payable. Business hours from approval; null
    #: when the hold window is unset, and those payouts wait for Operations rather than for a
    #: clock nobody configured.
    payout_release_due_at = models.DateTimeField(null=True, blank=True)
    correction_note = models.TextField(blank=True)
    dispute_reason_code = models.SlugField(max_length=80, blank=True)
    #: The amendment that created this stage, if it was not part of the original agreement.
    source_amendment = models.ForeignKey(
        "EngagementAmendment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="created_stages",
    )
    funded_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    evidence_submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    disputed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("engagement", "position")
        constraints = [
            models.UniqueConstraint(
                fields=("engagement", "position"),
                name="requirements_unique_engagement_stage_position",
            ),
            models.CheckConstraint(
                condition=~models.Q(funding_state="FUNDED") | models.Q(funded_at__isnull=False),
                name="requirements_funded_stage_has_a_timestamp",
            ),
            # `M2-BE-504`, per stage. Four bounds, four constraints, because collapsing them would
            # tell an operator that *something* about the money is wrong without saying which.
            #
            # **At face value or not at all.** A partly funded A5 stage is the state in which work
            # starts against money that does not cover it, and `complete_stage_funding` already
            # refuses a short payment — this is the same rule where no caller can miss it. Written
            # `>=` rather than `=` so that a stage whose scope was later *reduced* by an accepted
            # amendment stays legal: the excess is refunded, and funding that once covered a
            # larger stage still covers the smaller one.
            models.CheckConstraint(
                condition=~models.Q(funding_state="FUNDED")
                | models.Q(funded_paise__gte=models.F("amount_paise")),
                name="requirements_stage_funding_covers_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(refunded_amount_paise__lte=models.F("funded_paise")),
                name="requirements_stage_refund_within_funding",
            ),
            # The per-stage twin of the engagement's exposure bound: never hold more of the
            # Customer's money for this stage than the stage is worth.
            models.CheckConstraint(
                condition=models.Q(
                    funded_paise__lte=models.F("amount_paise") + models.F("refunded_amount_paise")
                ),
                name="requirements_stage_exposure_within_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(approved_amount_paise__lte=models.F("amount_paise")),
                name="requirements_stage_approved_within_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    released_amount_paise__lte=models.F("approved_amount_paise"),
                ),
                name="requirements_stage_released_within_approved",
            ),
            models.CheckConstraint(
                condition=~models.Q(status__in=("APPROVED", "RELEASED"))
                | models.Q(approved_at__isnull=False),
                name="requirements_approved_stage_has_a_timestamp",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="RELEASED") | models.Q(released_at__isnull=False),
                name="requirements_released_stage_has_a_timestamp",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="DISPUTED") | models.Q(disputed_at__isnull=False),
                name="requirements_disputed_stage_has_a_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "review_due_at")),
            models.Index(fields=("status", "payout_release_due_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.position}:{self.status}"

    #: Opt-in for the one write below that is allowed to move `amount_paise`. Not a field — it
    #: exists only for the lifetime of the instance applying an amendment.
    applying_authorized_amendment = False

    def save(self, *args: Any, **kwargs: Any) -> None:
        """`amount_paise` moves only through an authorized amendment (`M2-BE-508`).

        The stage amount is the agreed price of one shift-day or one milestone. Everything that
        touches a stage after the agreement opens — evidence, approval, correction, dispute,
        release — has a legitimate reason to write this row and no reason at all to write that
        column, so the column is refused unless the caller has said it is applying an amendment.

        `apply_amendment_amount` below is the only way to say that, and
        `apps.requirements.amendments` is its only caller — after the amendment reached
        `AUTHORIZED`, which for an A5 engagement means a verified provider callback moved it
        there.

        `kind` is refused outright rather than gated on the amendment, because there is no
        legitimate write at all: whether a row is work or a material advance is decided by the
        estimate the Customer selected, and changing it afterwards would move a stage between two
        different recovery rules with nobody's agreement.
        """
        if not self._state.adding:
            update_fields = set(kwargs.get("update_fields") or ())
            touches_everything = not update_fields
            if "kind" in update_fields or touches_everything:
                stored_kind = (
                    EngagementStage.objects.filter(pk=self.pk)
                    .values_list("kind", flat=True)
                    .first()
                )
                if stored_kind is not None and stored_kind != self.kind:
                    raise ValueError("A stage's kind is fixed by the selected estimate.")
            changes_amount = "amount_paise" in update_fields or touches_everything
            if changes_amount and not self.applying_authorized_amendment:
                raise ValueError(
                    "A stage amount changes only through an authorized scope amendment."
                )
        super().save(*args, **kwargs)

    def apply_amendment_amount(self, amount_paise: int) -> None:
        """Set the agreed amount of this stage from an authorized amendment.

        A named operation rather than a flag the caller sets by hand, so the one legitimate write
        to a frozen column reads as what it is at the call site — and so nothing has to reach into
        a private attribute to perform it.
        """
        self.amount_paise = amount_paise
        self.applying_authorized_amendment = True
        try:
            self.save(update_fields=("amount_paise", "updated_at"))
        finally:
            self.applying_authorized_amendment = False


# ---------------------------------------------------------------------------
# Wave C3: the stage spine's own records.
#
# Three models, and each exists because the alternative was a lie in a record somebody will read
# years later:
#
# * `EngagementEvent` — one audit trail for the agreement and its stages. The requirement's own
#   `RequirementTransition` log ends at `ENGAGED`, and pushing forty shift-day approvals into it
#   would bury the six status changes it exists to show a Customer.
# * `StageEvidence` — what the vendor actually showed. A stage approved on nothing is an approval
#   nobody can defend in a dispute.
# * `EngagementAmendment` — the M2 side of the **M1** scope-amendment engine. It carries no
#   status, no lines and no expiry of its own: `fulfilment.ScopeAmendment` owns all three.
# ---------------------------------------------------------------------------


class EngagementEvent(models.Model):
    """Immutable record of every engagement or stage move, and who caused it.

    `stage` is null for an engagement-level move and set for a stage-level one, so one query
    reads the whole agreement's history in order. A row where `from_status == to_status` is
    deliberate and follows the precedent `services.record_transition` established in Wave C2: not
    every auditable act is a state change, and "this Partner submitted evidence at this moment"
    is exactly what a dispute asks for.

    A system-driven move — a review timeout, a payout-hold release — records `actor=None`.
    Signing it with the Customer's name would be a lie in the record that exists to prove who
    made which decision.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(Engagement, on_delete=models.PROTECT, related_name="events")
    stage = models.ForeignKey(
        EngagementStage,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="events",
    )
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_events",
    )
    reason_code = models.SlugField(max_length=80)
    reason = models.TextField(blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("occurred_at", "id")
        indexes = [
            models.Index(fields=("engagement", "occurred_at")),
            models.Index(fields=("stage", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.reason_code}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Engagement events are immutable.")
        super().save(*args, **kwargs)


class StageEvidenceUpload(models.Model):
    """One signed-upload intent for stage evidence, issued before any bytes exist.

    The same shape as `RequirementAttachmentUpload` and `partners.PartnerDocumentUpload`, and for
    the same reason: the server names the object key and records what it expects, so finalization
    can compare the object that actually arrived against the file the client said it was sending.
    Without the intent row there is nothing to compare against, and "verify the upload" degrades
    to "trust the client".
    """

    class Status(models.TextChoices):
        ISSUED = "ISSUED", "Issued"
        VERIFIED = "VERIFIED", "Verified"
        EXPIRED = "EXPIRED", "Expired"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.ForeignKey(
        EngagementStage,
        on_delete=models.PROTECT,
        related_name="evidence_uploads",
    )
    kind = models.CharField(max_length=16)
    object_key = models.CharField(max_length=400, unique=True)
    content_type = models.CharField(max_length=120)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ISSUED)
    expires_at = models.DateTimeField()
    finalized_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(size_bytes__gt=0),
                name="requirements_stage_evidence_upload_size_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("stage", "status", "expires_at")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.kind}:{self.status}"


class StageEvidence(models.Model):
    """What the vendor showed for one stage. Append-only.

    Evidence is never edited or deleted, only added: a correction cycle produces a second row
    rather than replacing the first, so a dispute reads what was originally offered as well as
    what was offered after the Customer pushed back.

    A `NOTE` carries no object. Everything else carries a verified object key and a scan verdict,
    following `fulfilment.evidence`'s rule that a failed upload is never represented as completed
    evidence.
    """

    class Kind(models.TextChoices):
        NOTE = "NOTE", "Written note"
        PHOTO = "PHOTO", "Photo"
        VIDEO = "VIDEO", "Video"
        DOCUMENT = "DOCUMENT", "Document"

    #: Media kinds. A `NOTE` is the one kind with no bytes behind it.
    MEDIA_KINDS = (Kind.PHOTO, Kind.VIDEO, Kind.DOCUMENT)

    #: **The same choice set as `RequirementAttachment`, deliberately aliased rather than copied.**
    #: One scan pipeline produces one vocabulary, and a second identical `TextChoices` would have
    #: published a second identical OpenAPI component — which the generator resolves by renaming
    #: *both*, silently breaking the `ScanStatusEnum` an already-generated client imports. The
    #: 1.24.0 `ReasonEnum` note in the contract CHANGELOG is this exact failure; aliasing avoids
    #: it at the source rather than papering over it with an override.
    ProcessingStatus = RequirementAttachment.ProcessingStatus

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.ForeignKey(EngagementStage, on_delete=models.PROTECT, related_name="evidence")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    note = models.TextField(blank=True)
    object_key = models.CharField(max_length=400, blank=True)
    content_type = models.CharField(max_length=120, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    processing_status = models.CharField(
        max_length=16,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.PENDING,
    )
    failure_reason = models.CharField(max_length=200, blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="m2_stage_evidence_submitted",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("object_key",),
                condition=~models.Q(object_key=""),
                name="requirements_unique_stage_evidence_object",
            ),
            # A note with no text and a photograph with no object are both "evidence" that shows
            # nothing. Refused here because an approval defends itself with these rows.
            models.CheckConstraint(
                condition=(
                    models.Q(kind="NOTE", object_key="") & ~models.Q(note="")
                    | ~models.Q(kind="NOTE") & ~models.Q(object_key="")
                ),
                name="requirements_stage_evidence_kind_matches_payload",
            ),
        ]
        indexes = [
            models.Index(fields=("stage", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.kind}"


class EngagementAmendment(models.Model):
    """The M2 half of one `fulfilment.ScopeAmendment` (`M2-BE-505`).

    **There is one amendment subsystem in this codebase and it is `apps.fulfilment`.** This row
    adds the two things an M2 amendment has and an M1 one does not — an `Engagement` instead of a
    `Booking`, and a signed delta against a stage list — and borrows everything else:
    `ScopeAmendment` owns the status machine, the expiry rule and the reason; `ScopeAmendmentLine`
    owns the priced lines. Nothing here duplicates a column that lives there.

    `kind` names the two shapes the flow document calls out. A **time extension** is A3's: more
    worker-days at the rate the Customer already agreed to, priced by the server from the frozen
    engagement terms. A **change order** is A5's: additional or reduced project work, priced by
    the vendor line by line, because an A5 outcome has no catalog to price from — which is the
    documented M1 boundary (`fulfilment.amendments` prices only catalog `TASK` lines) stated as an
    extension rather than worked around.
    """

    class Kind(models.TextChoices):
        TIME_EXTENSION = "TIME_EXTENSION", "Extra time on a workforce engagement"
        CHANGE_ORDER = "CHANGE_ORDER", "Changed scope on a project engagement"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        Engagement,
        on_delete=models.PROTECT,
        related_name="amendments",
    )
    #: The stage this amendment changes. Null for an addition, which creates a stage rather than
    #: altering one.
    stage = models.ForeignKey(
        EngagementStage,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="amendments",
    )
    amendment = models.OneToOneField(
        "fulfilment.ScopeAmendment",
        on_delete=models.PROTECT,
        related_name="m2_engagement_amendment",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    #: Signed, in paise. Positive is extra work the Customer pays for; negative is scope taken out
    #: and refunded. Server-calculated from the lines in both directions — a client never states a
    #: total.
    delta_paise = models.BigIntegerField()
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_amendments",
    )
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_amendments",
    )
    applied_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # A zero-delta amendment changes nothing and would still ask a Customer to decide
            # something. Refused where it cannot be argued with.
            models.CheckConstraint(
                condition=~models.Q(delta_paise=0),
                name="requirements_engagement_amendment_moves_money",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.kind}:{self.delta_paise}"


# ---------------------------------------------------------------------------
# Wave C2R / revision 4 (ADR-0009): the rate-card A3 front door.
#
# A3 stops being quote-first. Operations publishes a price per city and skill, the request is a
# preset, the offer cascade sends it to leads, and the only online charge is the booking fee. The
# wage money never touches this platform: it is paid direct, daily, at day end, and the tables
# below deliberately contain no column that could hold it.
#
# Three shapes, and each reuses a pattern that already exists rather than inventing one:
#
# * `RateCard` is `M2AccessPrice` for a per-city-per-skill day rate — effective-dated, superseded
#   rather than edited, fail-closed when nothing is published.
# * `RateCardBooking` is the purchase snapshot the whole cascade and the fee reconcile against,
#   the same job `QuoteUnlock.price_paise` and `VisitPlan.price_paise` do for their products.
# * `BookingFee` is the A3 mirror of `VisitPlan` on the same rails: one charge, `ACTIVE` only from
#   a verified provider callback, and a configured split when it forfeits.
# ---------------------------------------------------------------------------


class RateCard(models.Model):
    """Operations' published all-inclusive day rate for one city and one statutory skill.

    Effective-dated on the `M2AccessPrice` pattern: a rate is **loaded, never edited**, so a
    booking made last week still reconciles against the number it was made at, and raising a rate
    in wedding season is one insert. `07-state-machines-and-permissions.md` section 7 forbids
    Operations backdating a card under a live booking, and `rate_cards.publish_rate_card` enforces
    it.

    The three components are stored separately and the customer-facing rate is their sum, checked
    by a database constraint rather than by the command that writes it. That is what makes the
    disclosure honest in both directions: the lead's offer screen shows
    `worker_day_wage + supervision_margin` — what they actually receive per worker per day, paid
    directly by the Customer at day end — and the Customer's screen shows the whole number. Neither
    is derived from the other by a subtraction somebody could get wrong.

    **The wage component clears the statutory floor at publish**, through the same fail-closed
    `partners.assert_rate_meets_wage_floor` guard vendor quotes pass. The platform sets prices now,
    so it obeys the rule it enforces on everybody else.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.PROTECT,
        related_name="m2_rate_cards",
    )
    #: The **statutory wage classification**, not the dispatch trade slug — the same key
    #: `M2VariantConfiguration.wage_floor_skill` carries and the same one `MinimumWageFloor` is
    #: loaded under. ADR-0009 names this reuse explicitly: a rate card needs exactly the key the
    #: wage floor already has, and a second skill notion would let a legal floor and a published
    #: price drift apart.
    skill = models.ForeignKey(
        "partners.Skill",
        on_delete=models.PROTECT,
        related_name="m2_rate_cards",
    )

    #: The three configured parts, per worker per standard day, in integer paise.
    worker_day_wage_paise = models.PositiveBigIntegerField()
    supervision_margin_paise = models.PositiveBigIntegerField()
    #: Vsolve's revenue in A3 and the **only** money this platform collects on the rate-card path.
    #: Per worker-day because it is one of three parts of a per-worker-day price; the booking fee
    #: actually charged is this component over the whole booking, taken once.
    booking_fee_paise = models.PositiveBigIntegerField()
    #: Their sum, stored so the published number is a column rather than an expression every
    #: reader has to recompute, and constrained so the two can never disagree.
    customer_day_rate_paise = models.PositiveBigIntegerField()

    #: What counts as a day, and when overtime starts. No default: "eight hours" is ADR-0009's
    #: product definition, but the card is what a Customer and a lead are held to, so Operations
    #: publishes it rather than inheriting it from a constant that could change under live work.
    standard_day_hours = models.PositiveSmallIntegerField()
    #: The published overtime rate per worker per hour beyond `standard_day_hours`. Overtime counts
    #: only after the Customer's one-tap approval (`M2-BE-531`); this is what it costs when it does.
    overtime_hourly_paise = models.PositiveBigIntegerField()
    #: Published add-on rates, keyed by add-on code. Any genuine extra is a scope amendment at
    #: these numbers, which is what leaves the on-site renegotiation nowhere to live.
    add_on_rates = models.JSONField(default=dict, blank=True)
    #: The printed inclusion list: what the preset's scope covers, in the Customer's words. A list
    #: of strings, shown before booking and frozen onto the booking.
    inclusions = models.JSONField(default=list, blank=True)

    effective_from = models.DateField()
    #: Where the number came from — the phone survey, the gazette, the review meeting. On a real
    #: card this is the citation; on a seeded one it carries the dev-seed marker.
    source_reference = models.CharField(max_length=200, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="m2_rate_cards_published",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("service_area", "skill", "-effective_from")
        constraints = [
            models.UniqueConstraint(
                fields=("service_area", "skill", "effective_from"),
                name="requirements_unique_rate_card_version",
            ),
            models.CheckConstraint(
                condition=models.Q(worker_day_wage_paise__gt=0)
                & models.Q(supervision_margin_paise__gt=0)
                & models.Q(booking_fee_paise__gt=0),
                name="requirements_rate_card_components_positive",
            ),
            # The disclosure invariant. A card whose parts do not add to its published price is a
            # card that tells the lead and the Customer two different stories about the same job.
            models.CheckConstraint(
                condition=models.Q(
                    customer_day_rate_paise=models.F("worker_day_wage_paise")
                    + models.F("supervision_margin_paise")
                    + models.F("booking_fee_paise")
                ),
                name="requirements_rate_card_components_reconcile",
            ),
            models.CheckConstraint(
                condition=models.Q(standard_day_hours__gt=0) & models.Q(standard_day_hours__lte=24),
                name="requirements_rate_card_day_within_a_day",
            ),
            models.CheckConstraint(
                condition=models.Q(overtime_hourly_paise__gt=0),
                name="requirements_rate_card_overtime_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("service_area", "skill", "effective_from")),
        ]

    def __str__(self) -> str:
        return f"{self.service_area_id}:{self.skill_id}:{self.customer_day_rate_paise}"

    @property
    def lead_day_receipt_paise(self) -> int:
        """What the lead receives per worker per day, paid directly by the Customer at day end.

        The number on the offer screen. ADR-0009 requires it to be the vendor's *own* number
        rather than the Customer's, because accepting a job is accepting that rate for that job.
        """
        return self.worker_day_wage_paise + self.supervision_margin_paise


class RateCardAcceptance(models.Model):
    """A lead accepted a published rate card as part of their A3 capability (`M2-BE-435`).

    Append-only. ADR-0009: "accepting the rate card is part of A3 capability approval", and an
    acceptance that could be edited afterwards would be worth nothing in the argument it exists to
    settle — whether this vendor agreed to this number before they took work at it.

    Recorded per `(capability, rate_card)` rather than per Partner, because a card is superseded
    every time a rate moves and the question is always "which card did they agree to".
    """

    class Source(models.TextChoices):
        CAPABILITY_APPROVAL = "CAPABILITY_APPROVAL", "Recorded when the capability was approved"
        OFFER_ACCEPT = "OFFER_ACCEPT", "Recorded when a job at this rate was accepted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="m2_rate_card_acceptances",
    )
    capability = models.ForeignKey(
        "partners.PartnerCapability",
        on_delete=models.PROTECT,
        related_name="m2_rate_card_acceptances",
    )
    rate_card = models.ForeignKey(
        RateCard,
        on_delete=models.PROTECT,
        related_name="acceptances",
    )
    source = models.CharField(max_length=24, choices=Source.choices)
    #: The lead's own number at the moment they agreed to it, frozen. The card is the authority on
    #: what was published; this is the authority on what they were shown.
    lead_day_receipt_paise = models.PositiveBigIntegerField()
    accepted_at = models.DateTimeField(default=timezone.now)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="m2_rate_card_acceptances",
    )

    class Meta:
        ordering = ("-accepted_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("capability", "rate_card"),
                name="requirements_unique_rate_card_acceptance",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.capability_id}:{self.rate_card_id}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Refuse any write that is not the original insert.

        The same rule `assignments.DispatchCommandAudit` applies for the same reason: consent
        evidence that can be edited is not evidence.
        """
        if not self._state.adding:
            raise ValueError("A rate-card acceptance is immutable.")
        super().save(*args, **kwargs)


class RateCardBooking(models.Model):
    """One A3 request booked at a published rate, and the arithmetic it was booked at.

    Created by `book_at_published_rate` in the same transaction that submits the requirement, so
    there is no window in which an A3 requirement is matching with no published price behind it.
    Every number is snapshotted from the card: a rate loaded tomorrow does not move a booking made
    today, which is the whole reason cards are effective-dated rather than edited.

    The three money columns reconcile in integer paise:
    `total_customer_paise = lead_receipt_paise + booking_fee_paise`, and the constraint below says
    so. `lead_receipt_paise` is **peer-to-peer money this platform never holds** — it is recorded
    because the daily settlement, the evidence pack and the UPI deep-link all need the exact
    published amount, not because Vsolve is a party to it.
    """

    class Status(models.TextChoices):
        MATCHING = "MATCHING", "Looking for a crew"
        #: A lead accepted and is holding the job while the Customer pays the booking fee.
        OFFER_HELD = "OFFER_HELD", "A lead is holding this job"
        CONFIRMED = "CONFIRMED", "Crew confirmed and the booking fee is paid"
        #: The cascade exhausted its widening steps. The requirement is back on the quote flow and
        #: nothing was charged.
        FELL_BACK = "FELL_BACK", "Fell back to the quote flow"
        CANCELLED = "CANCELLED", "Cancelled"

    #: Statuses in which the cascade may still send offers.
    DISPATCHABLE_STATUSES = (Status.MATCHING, Status.OFFER_HELD)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.OneToOneField(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="rate_card_booking",
    )
    rate_card = models.ForeignKey(RateCard, on_delete=models.PROTECT, related_name="bookings")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.MATCHING)

    headcount = models.PositiveSmallIntegerField()
    days = models.PositiveSmallIntegerField()

    #: The card's three components and its published terms, frozen at booking.
    day_rate_paise = models.PositiveBigIntegerField()
    worker_day_wage_paise = models.PositiveBigIntegerField()
    supervision_margin_paise = models.PositiveBigIntegerField()
    booking_fee_component_paise = models.PositiveBigIntegerField()
    standard_day_hours = models.PositiveSmallIntegerField()
    overtime_hourly_paise = models.PositiveBigIntegerField()
    add_on_rates = models.JSONField(default=dict, blank=True)
    inclusions = models.JSONField(default=list, blank=True)

    #: The whole job at the published rate, and how it splits.
    total_customer_paise = models.PositiveBigIntegerField()
    #: Paid direct, daily, at day end. Never held by Vsolve.
    lead_receipt_paise = models.PositiveBigIntegerField()
    #: The one online charge. `booking_fee_component_paise * headcount * days`.
    booking_fee_paise = models.PositiveBigIntegerField()

    #: How many cascade waves have gone out, and the offer currently holding the job.
    wave = models.PositiveSmallIntegerField(default=0)
    accepted_invitation = models.OneToOneField(
        VendorInvitation,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="rate_card_booking",
    )
    #: When the holding offer stops holding. A Customer who never pays lets it lapse harmlessly and
    #: the next offer or wave proceeds — `07-state-machines-and-permissions.md` section 4c.
    hold_expires_at = models.DateTimeField(null=True, blank=True)
    fallback_reason_code = models.SlugField(max_length=80, blank=True)
    fell_back_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(headcount__gt=0) & models.Q(days__gt=0),
                name="requirements_rate_card_booking_size_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    total_customer_paise=models.F("lead_receipt_paise")
                    + models.F("booking_fee_paise")
                ),
                name="requirements_rate_card_booking_reconciles",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="CONFIRMED") | models.Q(confirmed_at__isnull=False),
                name="requirements_confirmed_booking_has_a_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("status", "hold_expires_at")),
            models.Index(fields=("rate_card", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.headcount}x{self.days}:{self.status}"

    @property
    def lead_day_receipt_paise(self) -> int:
        """What the lead receives per day for the whole requested crew. The offer's headline."""
        return (self.worker_day_wage_paise + self.supervision_margin_paise) * self.headcount


class BookingFee(models.Model):
    """A3 rate-card only. The commitment device, and Vsolve's only revenue on this path.

    `07-state-machines-and-permissions.md` section 4c, exactly::

        OFFER_ACCEPTED -> PENDING -> ACTIVE -> EARNED | FORFEIT_SPLIT | REFUNDED | FAILED

    `ACTIVE` is reachable **only** from a verified provider callback, and that same callback
    creates the engagement — the A3 mirror of `VisitPlan`, on the same rails. `EARNED` at first-day
    crew arrival. `FORFEIT_SPLIT` pays the lead a configured travel-compensation share through the
    M1 payout rails and books the remainder as the platform share, reconciling in integer paise as
    `amount = travel compensation + platform share`. A **vendor** no-show refunds the whole fee and
    pays no travel compensation — neither party earns from an undelivered crew.
    """

    class Status(models.TextChoices):
        OFFER_ACCEPTED = "OFFER_ACCEPTED", "A lead accepted; the Customer has not paid yet"
        PENDING = "PENDING", "Awaiting the provider"
        ACTIVE = "ACTIVE", "Paid; the crew is confirmed"
        EARNED = "EARNED", "The crew arrived on day one"
        FORFEIT_SPLIT = "FORFEIT_SPLIT", "Forfeited and split with the lead"
        REFUNDED = "REFUNDED", "Refunded in full"
        FAILED = "FAILED", "Payment failed"

    #: Statuses in which the Customer's money has actually been collected.
    CHARGED_STATUSES = (Status.ACTIVE, Status.EARNED, Status.FORFEIT_SPLIT)
    #: Statuses in which nothing further can happen to this fee.
    SETTLED_STATUSES = (Status.EARNED, Status.FORFEIT_SPLIT, Status.REFUNDED, Status.FAILED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(
        RateCardBooking,
        on_delete=models.PROTECT,
        related_name="booking_fees",
    )
    #: Denormalised so ownership of a checkout-free `PaymentAttempt` resolves in one query, the
    #: same job `QuoteUnlock.requirement` does for `commerce._standalone_attempt_belongs_to`.
    requirement = models.ForeignKey(
        CustomerRequirement,
        on_delete=models.PROTECT,
        related_name="booking_fees",
    )
    #: The accepted crew offer this fee confirms. The fee cannot exist without one — that is what
    #: `m2_booking_fee_not_chargeable` protects.
    invitation = models.ForeignKey(
        VendorInvitation,
        on_delete=models.PROTECT,
        related_name="booking_fees",
    )
    rate_card = models.ForeignKey(RateCard, on_delete=models.PROTECT, related_name="booking_fees")
    amount_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OFFER_ACCEPTED)

    #: The forfeit split, both zero until `FORFEIT_SPLIT`. Stored rather than recomputed because
    #: the split percentage is effective-dated policy and a settled fee must reconcile against the
    #: percentage it was settled at.
    travel_compensation_paise = models.PositiveBigIntegerField(default=0)
    platform_share_paise = models.PositiveBigIntegerField(default=0)

    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_booking_fees",
    )
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_booking_fees",
    )
    #: The lead's travel compensation as an M1 ledger earning. Written even when the vendor has no
    #: payout account, `PENDING` — they earned it, they simply cannot be paid it yet.
    ledger_entry = models.ForeignKey(
        "payouts.PartnerLedgerEntry",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_booking_fees",
    )
    receipt_series = models.CharField(max_length=24, blank=True)
    receipt_sequence = models.PositiveBigIntegerField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    earned_at = models.DateTimeField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    settlement_reason_code = models.SlugField(max_length=80, blank=True)
    failure_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # One live fee per booking, scoped to the statuses that still mean something. A failed
            # attempt must not block a retry, and this is what makes "exactly one charge per
            # booking under duplicate webhooks" a database fact rather than a code convention —
            # the same shape `requirements_one_live_unlock_per_requirement` uses.
            models.UniqueConstraint(
                fields=("booking",),
                condition=~models.Q(status="FAILED"),
                name="requirements_one_live_booking_fee",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="requirements_booking_fee_positive",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="ACTIVE") | models.Q(activated_at__isnull=False),
                name="requirements_active_booking_fee_has_a_timestamp",
            ),
            # The forfeit reconciliation, where the database can refuse a violation rather than a
            # report noticing one a month later.
            models.CheckConstraint(
                condition=~models.Q(status="FORFEIT_SPLIT")
                | models.Q(
                    amount_paise=models.F("travel_compensation_paise")
                    + models.F("platform_share_paise")
                ),
                name="requirements_forfeit_split_reconciles",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "status")),
            models.Index(fields=("status", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.booking_id}:{self.amount_paise}:{self.status}"


# ---------------------------------------------------------------------------
# Wave C4 (`M2-BE-521..539`): the shift-day.
#
# A3 maps a stage to a shift-day (`07-state-machines-and-permissions.md` §5), and everything below
# hangs off that one sentence. Five models, and the split between them is the split between three
# different kinds of claim:
#
# * `StageCrewAssignment` — who was promised, per **stage**, because multi-day labour rotates faces
#   legitimately and a per-engagement roster cannot say who is coming on Thursday.
# * `ShiftAttendance` — what the supervisor says happened, and the Customer's one-tap answer. One
#   row per shift-day, never one per worker: the workers do not carry the app, the supervisor does.
# * `DaySettlement` — the evening dual tap. Its money columns are a **record of a peer-to-peer
#   payment this platform never touches**, kept because the settlement evidence pack and the UPI
#   deep-link both need the exact published amount.
# * `SafetyIncident` — a first-class report, never a cancellation reason.
# * `CashDemandReport` — a Customer's one-tap account of an extra demanded in cash on site.
#
# Nothing here holds, moves or books wage money, and nothing here may be extended to. The one
# online charge on this path is the booking fee, and it lives in `BookingFee` above.
# ---------------------------------------------------------------------------


class StageCrewAssignment(models.Model):
    """One named worker on one shift-day (`M2-BE-522`).

    **Per stage, not per engagement.** A four-day shifting job is four shift-days and the gang that
    turns up on day three is legitimately not the gang from day one; a roster hung off the
    engagement would either forbid that or record a lie about who was there.

    The cross-agency conflict rule is a **database constraint**, not a check in a service. Crew
    identity is global — `partners.CrewMember` resolves one person from a keyed hash of their
    number, so the same worker promised through two agencies is one row — and
    `requirements_crew_member_one_shift_a_day` makes promising them twice on one date impossible
    rather than unlikely. `assign_crew` raises `m2_crew_conflict` first, with the name and the date
    in the message, because a `409` a supervisor can act on beats an `IntegrityError`; the
    constraint is what holds when two supervisors tap at the same moment.

    `shift_date` is denormalised from `EngagementStage.scheduled_on` for exactly that constraint —
    a unique index cannot reach across a join. `assign_crew` refuses a stage with no scheduled date
    rather than defaulting one, because "which day is this crew for" is not a question the server
    may answer on the supervisor's behalf.
    """

    class Status(models.TextChoices):
        ASSIGNED = "ASSIGNED", "Assigned"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.ForeignKey(
        EngagementStage,
        on_delete=models.PROTECT,
        related_name="crew_assignments",
    )
    #: Denormalised from `stage.engagement`, so "is this worker double-booked" is one query
    #: against this table instead of a join through two aggregates on every assignment.
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="m2_stage_crew_assignments",
    )
    membership = models.ForeignKey(
        "partners.PartnerCrewMembership",
        on_delete=models.PROTECT,
        related_name="stage_assignments",
    )
    #: The global person. Denormalised from the membership because the conflict rule is about the
    #: **person**, not about one agency's row for them.
    crew_member = models.ForeignKey(
        "partners.CrewMember",
        on_delete=models.PROTECT,
        related_name="stage_assignments",
    )
    shift_date = models.DateField()
    is_supervisor = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ASSIGNED)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_crew_assignments_made",
    )
    assigned_at = models.DateTimeField(default=timezone.now)
    released_at = models.DateTimeField(null=True, blank=True)
    #: Why a name came off the shift. A substitution is a release plus an assignment, and the
    #: reason is what tells the Customer's notification which of the two it was.
    released_reason_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("stage", "assigned_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("stage", "membership"),
                condition=models.Q(status="ASSIGNED"),
                name="requirements_unique_active_stage_crew",
            ),
            # `m2_crew_conflict`, as a fact the database holds. Scoped to `ASSIGNED` so a released
            # name can be re-assigned, and so a substitution is not blocked by the person it
            # replaced.
            models.UniqueConstraint(
                fields=("crew_member", "shift_date"),
                condition=models.Q(status="ASSIGNED"),
                name="requirements_crew_member_one_shift_a_day",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="RELEASED") | models.Q(released_at__isnull=False),
                name="requirements_released_assignment_has_a_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("stage", "status")),
            models.Index(fields=("partner", "shift_date")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.crew_member_id}:{self.status}"


class ShiftAttendance(models.Model):
    """How many of the booked crew turned up, once per shift-day (`M2-BE-524` to `527`).

    **Supervisor-level, deliberately.** ADR-0009 and `SIM-02` both refuse per-worker check-in and
    check-out with offline sync: the workers mostly do not carry smartphones, the supervisor does,
    and a per-worker attendance product would be a device dependency the market cannot meet
    pretending to be rigour. So the supervisor states a count, the Customer confirms or disputes it
    in one tap, and that is the whole mechanism.

    Per-worker detail exists in exactly one place — `disputed_worker_details`, written **only** by
    a Customer dispute (`M2-BE-526`). Collecting it up front would be collecting four names a day
    from a supervisor to answer a question nobody had asked.

    Arrival lives here too (`M2-BE-524`) and is the **non-OTP fallback as the default path**: M2
    proves arrival by either party confirming it, and the start OTP is M3. Nothing here waits for
    a code that does not exist yet.

    A missing check-out settles at the agreed shift length and says so (`M2-BE-527`). It is
    `flagged_for_review`, not disputed — the crew leaving without the supervisor closing the day is
    ordinary, and treating it as a dispute would open a case against a vendor for a missed tap.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Nothing recorded yet"
        SUPERVISOR_CONFIRMED = "SUPERVISOR_CONFIRMED", "The supervisor recorded the day"
        CUSTOMER_CONFIRMED = "CUSTOMER_CONFIRMED", "The Customer agreed"
        DISPUTED = "DISPUTED", "The Customer disputed the count"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.OneToOneField(
        EngagementStage,
        on_delete=models.PROTECT,
        related_name="attendance",
    )
    engagement = models.ForeignKey(
        Engagement,
        on_delete=models.PROTECT,
        related_name="shift_attendances",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING)

    #: The crew this day was booked for, snapshotted from the booking so a later amendment cannot
    #: quietly change what "full attendance" meant on a day that has already been settled.
    expected_count = models.PositiveSmallIntegerField()
    #: What the supervisor says turned up. Null until they say.
    present_count = models.PositiveSmallIntegerField(null=True, blank=True)

    #: Arrival, on the non-OTP path. Either party may confirm it — both were at the site.
    arrival_confirmed_at = models.DateTimeField(null=True, blank=True)
    arrival_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_shift_arrivals_confirmed",
    )
    #: The published length of a day on this booking's card, frozen. `M2-BE-527` settles a missing
    #: check-out at this, so it must be the number that was published rather than today's card.
    #:
    #: **Null on the quote-flow fallback**, where nobody ever published a day length: the vendor
    #: quoted a rate per worker per day and was never asked what a day is. Nullable rather than
    #: eight — an assumed shift length is the number that decides when overtime starts, and this
    #: platform inventing it is the on-site renegotiation with a server behind it. A null row is
    #: `flagged_for_review` with `day_length_not_published` instead, and overtime against it is
    #: refused rather than measured from a made-up clock.
    standard_day_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    shift_ended_at = models.DateTimeField(null=True, blank=True)
    #: True when the day closed without anybody recording an end time. The settlement still runs —
    #: the amount never depended on the end time, only overtime does — and this is what puts the
    #: row in front of Operations.
    checkout_missing = models.BooleanField(default=False)
    flagged_for_review = models.BooleanField(default=False)
    flag_reason_code = models.SlugField(max_length=80, blank=True)

    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_shift_attendances_confirmed",
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    responded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_shift_attendances_answered",
    )
    dispute_note = models.TextField(blank=True)
    #: `[{"name": ..., "was_present": bool, "note": ...}]`, and **only** on a dispute. The list is
    #: the Customer's account of which named workers they say were not there; it is evidence in a
    #: case, never an attendance record of its own.
    disputed_worker_details = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(expected_count__gt=0),
                name="requirements_attendance_expects_somebody",
            ),
            # Nobody may record more workers than the day was booked for. An extra worker is a
            # scope amendment at the published rate, which is `M2-BE-538` — not a number typed
            # into an attendance box, which is how a settlement grows without an agreement.
            models.CheckConstraint(
                condition=models.Q(present_count__isnull=True)
                | models.Q(present_count__lte=models.F("expected_count")),
                name="requirements_attendance_within_booked_crew",
            ),
            models.CheckConstraint(
                condition=models.Q(status="PENDING") | models.Q(present_count__isnull=False),
                name="requirements_confirmed_attendance_has_a_count",
            ),
            models.CheckConstraint(
                condition=models.Q(standard_day_hours__isnull=True)
                | (models.Q(standard_day_hours__gt=0) & models.Q(standard_day_hours__lte=24)),
                name="requirements_attendance_day_within_a_day",
            ),
            # A day whose length nobody published has to say so. The pair is the whole of
            # `M2-BE-527`'s honesty: either there is a published shift length to settle a missing
            # check-out against, or the row is flagged and a human reads it.
            models.CheckConstraint(
                condition=models.Q(standard_day_hours__isnull=False)
                | models.Q(flagged_for_review=True),
                name="requirements_unpublished_day_length_is_flagged",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "flagged_for_review")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.present_count}/{self.expected_count}"

    @property
    def shortfall_count(self) -> int:
        """How many booked workers did not turn up. Zero until a day has been recorded."""
        if self.present_count is None:
            return 0
        return max(self.expected_count - self.present_count, 0)


class DaySettlement(models.Model):
    """The evening "Day settled?" dual tap (`M2-BE-536`, `537`).

    **The platform never holds this money.** ADR-0009: wages are direct, daily, peer-to-peer at day
    end, and that norm is encoded here rather than fought. Every column below is a *record*: the
    published amount the two sides should have exchanged, and two timestamps saying who agreed they
    did. No `PaymentAttempt`, no ledger entry, no refund, no payout — and none may be added.

    **Settlement is per worker-day present, never per job.** `amount_paise` is
    `workers_present x per_worker_paise` plus whatever extras both sides agreed through the
    amendment engine, and the database constraint says so. A 3-of-4 day settles at three workers'
    published rate because that is what was delivered; billing the fourth would be charging for a
    person who was not there, and discounting the three would be repricing a rate both sides
    accepted.

    **A one-sided claim is unproven, not false.** Either party may tap first; the fee, the crew and
    the engagement all carry on either way. Only both taps make `SETTLED`, and Operations reading a
    `SUPERVISOR_CLAIMED` row a week later is reading exactly what happened — one person says they
    were paid and the other has not said anything — which is a different sentence from "they were
    paid" and from "they were not". A cash dispute where both sides lie remains unadjudicable, as
    the plan accepted for `LEAD_ONLY`; the tap trail is the mitigation, not a proof machine.
    """

    class Status(models.TextChoices):
        AWAITING_BOTH = "AWAITING_BOTH", "Neither side has confirmed"
        SUPERVISOR_CLAIMED = "SUPERVISOR_CLAIMED", "Only the supervisor has confirmed"
        CUSTOMER_CLAIMED = "CUSTOMER_CLAIMED", "Only the Customer has confirmed"
        SETTLED = "SETTLED", "Both sides confirmed"

    class ShortfallChoice(models.TextChoices):
        """What the Customer chose to do about workers who did not arrive (`M2-BE-537`).

        `CANCEL_SHORTFALL` is read narrowly and deliberately: it cancels **the missing part of this
        day**, free — no charge for the absent workers and no make-good owed. Cancelling the
        remaining days of an engagement is a different act with different money behind it
        (`M2-BE-545`, Wave C5), and quietly folding it in here would let one tap end a booking.
        """

        CONTINUE_SHORT = "CONTINUE_SHORT", "Carry on with the crew that came"
        ADD_DAY = "ADD_DAY", "Ask the lead for an extra day to make it up"
        CANCEL_SHORTFALL = "CANCEL_SHORTFALL", "Cancel the missing workers, free"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.OneToOneField(
        EngagementStage,
        on_delete=models.PROTECT,
        related_name="day_settlement",
    )
    engagement = models.ForeignKey(
        Engagement,
        on_delete=models.PROTECT,
        related_name="day_settlements",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.AWAITING_BOTH,
    )

    #: What the lead receives for one worker for one day, frozen from the booking. The wage
    #: component plus the supervision margin — never the Customer's all-in rate, which includes
    #: Vsolve's booking fee and is not owed to anybody at day end.
    per_worker_paise = models.PositiveBigIntegerField()
    workers_present = models.PositiveSmallIntegerField()
    workers_expected = models.PositiveSmallIntegerField()
    #: Overtime and add-ons accepted through the M1 amendment engine against this shift-day, at the
    #: card's published rates. Zero unless both sides agreed to something (`M2-BE-531`, `538`).
    extras_paise = models.PositiveBigIntegerField(default=0)
    #: The exact published amount the UPI link carries. Server-calculated, in integer paise.
    amount_paise = models.PositiveBigIntegerField()

    shortfall_choice = models.CharField(
        max_length=20,
        choices=ShortfallChoice.choices,
        blank=True,
    )
    #: Set when the Customer chose `ADD_DAY`. The extra day is the lead's to offer through the
    #: amendment engine — the platform records the request and does not extend somebody's
    #: commitment on their behalf.
    make_good_requested_at = models.DateTimeField(null=True, blank=True)

    supervisor_confirmed_at = models.DateTimeField(null=True, blank=True)
    supervisor_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_day_settlements_confirmed_as_supervisor",
    )
    customer_confirmed_at = models.DateTimeField(null=True, blank=True)
    customer_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_day_settlements_confirmed_as_customer",
    )
    settled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # Per worker-day present, never per job — the arithmetic of `M2-BE-537` where the
            # database can refuse a violation instead of a reconciliation report finding one.
            models.CheckConstraint(
                condition=models.Q(
                    amount_paise=models.F("per_worker_paise") * models.F("workers_present")
                    + models.F("extras_paise")
                ),
                name="requirements_day_settlement_reconciles",
            ),
            models.CheckConstraint(
                condition=models.Q(workers_present__lte=models.F("workers_expected")),
                name="requirements_day_settlement_within_booked_crew",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="SETTLED")
                | (
                    models.Q(supervisor_confirmed_at__isnull=False)
                    & models.Q(customer_confirmed_at__isnull=False)
                    & models.Q(settled_at__isnull=False)
                ),
                name="requirements_settled_day_has_both_taps",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.amount_paise}:{self.status}"


class SafetyIncident(models.Model):
    """Something went wrong on site, reported as its own record (`M2-BE-530`).

    **Never a cancellation reason**, which is the whole reason this table exists rather than a
    reason code on a cancellation. Construction labour carries real liability, and a platform that
    filed "a worker fell" as "job cancelled — site unsafe" would have no way, two years later, to
    say what was reported, when, by whom, and what was done about it. `GAP-022` is that sentence.

    Reportable by **both parties and Operations**: the Customer who saw it, the lead whose worker
    it was, and the operator a phone call reaches. `reporter_role` records which, and is derived
    from the caller rather than sent by them.

    The report body is frozen after it is written. A safety report that can be edited afterwards is
    not evidence, and the fields Operations adds — status, the resolution note — are deliberately
    the only ones that move. This follows `Engagement.save`'s frozen-terms rule, in the one other
    table where "somebody will remember not to" is not good enough.
    """

    class Severity(models.TextChoices):
        NEAR_MISS = "NEAR_MISS", "A near miss"
        MINOR = "MINOR", "Minor injury or damage"
        SERIOUS = "SERIOUS", "Serious injury or damage"
        CRITICAL = "CRITICAL", "Critical: life-threatening or fatal"

    class Status(models.TextChoices):
        REPORTED = "REPORTED", "Reported"
        UNDER_REVIEW = "UNDER_REVIEW", "Operations is reviewing it"
        RESOLVED = "RESOLVED", "Closed by Operations"

    class ReporterRole(models.TextChoices):
        CUSTOMER = "CUSTOMER", "The Customer"
        PARTNER = "PARTNER", "The vendor or their supervisor"
        OPERATIONS = "OPERATIONS", "Operations"

    #: Written once and then frozen. The record of what was reported may not be rewritten by the
    #: party it reflects on — or by the party who filed it, once Operations has read it.
    FROZEN_REPORT_FIELDS = (
        "engagement",
        "stage",
        "reported_by",
        "reporter_role",
        "severity",
        "category_code",
        "description",
        "occurred_at",
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        Engagement,
        on_delete=models.PROTECT,
        related_name="safety_incidents",
    )
    #: The shift-day it happened on, when it is known. Null for something reported about the
    #: engagement as a whole, or after the day it belongs to has closed.
    stage = models.ForeignKey(
        EngagementStage,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="safety_incidents",
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_safety_incidents_reported",
    )
    reporter_role = models.CharField(max_length=16, choices=ReporterRole.choices)
    severity = models.CharField(max_length=16, choices=Severity.choices)
    #: What kind of thing happened, as a slug: `fall`, `electrical`, `vehicle`, `abuse`. Open
    #: rather than an enum, because publishing a fixed list of the ways a site can hurt somebody
    #: guarantees the one that happens is not on it.
    category_code = models.SlugField(max_length=80)
    description = models.TextField()
    occurred_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REPORTED)
    resolution_note = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_safety_incidents_resolved",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-occurred_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(status="RESOLVED") | models.Q(resolved_at__isnull=False),
                name="requirements_resolved_incident_has_a_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "severity", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.severity}:{self.status}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            update_fields = set(kwargs.get("update_fields") or ())
            if not update_fields or update_fields.intersection(self.FROZEN_REPORT_FIELDS):
                raise ValueError(
                    "A safety report is frozen once filed. Operations may change its status and "
                    "add a resolution; nobody may rewrite what was reported."
                )
        super().save(*args, **kwargs)


class CashDemandReport(models.Model):
    """A Customer's one-tap report that a cash extra was demanded on site (`M2-BE-539`).

    ADR-0009 makes the on-site renegotiation the failure A3 is designed against: the preset asks
    the price-moving facts, the card publishes the number, and every genuine extra goes through the
    amendment engine at a published rate. This is what the Customer taps when it happens anyway.

    **It is never proof on its own**, and the model is shaped to keep that true. There is no
    verdict column, no admission, no vendor response and no money: the report is one party's
    account, it is recorded immutably, and `apps.partners.standing` counts it towards a pattern
    against a threshold the owner sets. One report changes nothing at all.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        Engagement,
        on_delete=models.PROTECT,
        related_name="cash_demand_reports",
    )
    stage = models.ForeignKey(
        EngagementStage,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="cash_demand_reports",
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="m2_cash_demand_reports",
    )
    #: What they say they were asked for, if they said. Optional because the report has to be one
    #: tap, and a required amount would turn "they demanded extra" into a form.
    amount_claimed_paise = models.PositiveBigIntegerField(null=True, blank=True)
    note = models.TextField(blank=True)
    reported_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-reported_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_claimed_paise__isnull=True)
                | models.Q(amount_claimed_paise__gt=0),
                name="requirements_cash_demand_amount_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "reported_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.reported_at:%Y-%m-%d}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("A cash-demand report is immutable.")
        super().save(*args, **kwargs)
