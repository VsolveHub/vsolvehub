"""Customer requirements for M2 workforce and project work.

A requirement is free to submit and free to match. Nothing here charges anybody: the money
moment is the quote unlock in P4, after a usable quote exists. See
docs/adr/0007-m2-engagement-spine-and-fee-after-value.md.
"""

import uuid

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
    #: A5 stage breakdown. Stage totals must reconcile to `total_paise` before selection.
    stages = models.JSONField(default=list, blank=True)
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
    selection = models.OneToOneField(
        ProposalSelection,
        on_delete=models.PROTECT,
        related_name="engagement",
    )
    proposal = models.ForeignKey(Proposal, on_delete=models.PROTECT, related_name="engagements")
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

    #: Frozen from the selected proposal. A later supersession cannot move an agreed price.
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

    #: When the counterparties may see each other's contact details, and when work may begin. A3
    #: releases both at creation — a connection *is* the product. A5 releases both only once the
    #: first stage is funded, because managed work that starts unfunded has no protection behind
    #: it.
    contact_released_at = models.DateTimeField(null=True, blank=True)
    work_may_start_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
        ]
        indexes = [
            models.Index(fields=("partner", "status")),
            models.Index(fields=("customer", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.commercial_mode}:{self.status}"


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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(Engagement, on_delete=models.PROTECT, related_name="stages")
    position = models.PositiveSmallIntegerField()
    label = models.CharField(max_length=200)
    amount_paise = models.PositiveBigIntegerField()
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
    funded_at = models.DateTimeField(null=True, blank=True)
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
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.position}:{self.status}"
