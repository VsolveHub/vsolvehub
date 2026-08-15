"""Requirement capture: the request itself, its media, and its status log.

The four tables the Customer's own words land in — `CustomerRequirement`, the two rows behind an
attachment upload, and the immutable `RequirementTransition` trail. The boundary is the moment a
vendor is involved: matching, quoting and every money product live in the sibling modules.
"""

import uuid
from typing import Final

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalog.models import M2VariantConfiguration, ServiceVariant
from apps.locations.models import Address, ServiceArea

#: The six terminal requirement statuses, at module scope so the `requirements_closed_has_timestamp`
#: check constraint reads the same list `CustomerRequirement.CLOSED_STATUSES` publishes.
#:
#: Hoisted in Wave C7's constraint/tuple sweep. It was a hand-copied six-string list inside `Meta`
#: beside an identical class attribute, which is the drift `BOOKING_FEE_NON_BLOCKING_STATUSES`
#: already records the cost of: a nested `Meta` body cannot see its enclosing class's namespace, so
#: a constraint either reads a list from out here or copies one — and a copied list drifts while
#: `makemigrations --check` stays green, because model state and migration state agree with each
#: other and both disagree with the code.
REQUIREMENT_CLOSED_STATUSES: Final[tuple[str, ...]] = (
    "CLOSED_NO_SUPPLY",
    "CLOSED_SLA_BREACH",
    "CLOSED_EXPIRED",
    "CLOSED_ABANDONED",
    "CLOSED_COMPLETE",
    "CLOSED_CANCELLED",
)


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
    #: Bound from module scope so the closed-has-a-timestamp constraint and every `status__in`
    #: read in `apps.requirements` are looking at one list rather than two copies of it.
    CLOSED_STATUSES = REQUIREMENT_CLOSED_STATUSES

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
    #: Wave C7 (`M2-BE-805`). When the personal content of this request was scrubbed — the free-text
    #: description, the free-text answers, the clarification threads and any attachment bytes.
    #:
    #: A column rather than a derived guess, because a redacted request and a sparse one look
    #: identical from the outside, and the difference is the whole answer to "what happened to my
    #: data". `apps.requirements.retention` is the only writer and it is reachable only through an
    #: audited Operations command.
    #:
    #: The **money rows are untouched** by that command, which is the rule the whole module exists
    #: to enforce: a financial hold outranks an erasure request, and a ledger entry, a fee, a
    #: payment attempt and an invoice number are not personal content.
    redacted_at = models.DateTimeField(null=True, blank=True)
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
                condition=~models.Q(status__in=REQUIREMENT_CLOSED_STATUSES)
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
    #: Wave C7 (`M2-BE-805`). When the stored object behind this row was deleted, by the retention
    #: sweep or by an erasure request.
    #:
    #: The **row survives its bytes**, deliberately. A vendor was shown this attachment and a
    #: `RequirementSnapshot` records that they were; deleting the row would leave a snapshot
    #: pointing at nothing and quietly rewrite what a vendor saw when they quoted. So the metadata
    #: — kind, size, hash, scan verdict — stays as the record of what existed, and the photograph
    #: of somebody's home does not.
    purged_at = models.DateTimeField(null=True, blank=True)
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
