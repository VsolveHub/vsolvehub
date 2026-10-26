"""Who the Partner is, and everything Operations must approve before they can work.

The M1 onboarding spine: the profile itself, the reviewable application and its transition
audit, the three eligibility links (skill, service, service area) that say what a Partner may
be *considered* for, the consent receipts and the published documents those receipts point at,
and the uploaded evidence Operations reviews.

The boundary: this module ends where a Partner's *calendar* begins. Anything about when or
where they are working lives in `availability`; anything gated by the M2 capability review
lives in `capabilities`, `crew` or `standing`.
"""

import uuid
from datetime import date

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.locations.models import ServiceArea


class PartnerProfile(models.Model):
    class PhotoStatus(models.TextChoices):
        """Where a partner's photograph is in review.

        A photograph is the one field on this model a Customer sees *before* meeting the person,
        on the screen that tells them who is about to enter their home. Left unreviewed, whatever
        somebody uploads is what a Customer sees — so the field is not "is there a photo" but
        "has somebody looked at it", and only `APPROVED` is ever published.

        `NONE` and `REJECTED` are deliberately distinct even though both publish nothing. One is a
        partner who has not got round to it; the other is a partner who has been told why. The
        partner app shows different things for each, and an operator reviewing a queue needs to
        tell "not submitted" from "refused".
        """

        NONE = "NONE", "No photograph"
        PENDING = "PENDING", "Awaiting review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="partner_profile",
    )
    display_name = models.CharField(max_length=120)
    biography = models.TextField(blank=True)
    experience_years = models.PositiveSmallIntegerField(default=0)
    #: The object key in private storage, not a URL. A stored URL is a stored expiry, and the
    #: signed links this bucket issues are short-lived by design — the same reason
    #: `PartnerDocument` stores a key and signs on read.
    photo_object_key = models.CharField(max_length=500, blank=True)
    photo_status = models.CharField(
        max_length=12,
        choices=PhotoStatus.choices,
        default=PhotoStatus.NONE,
    )
    photo_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="partner_photos_reviewed",
    )
    photo_reviewed_at = models.DateTimeField(null=True, blank=True)
    #: Required by the review command when refusing, so a partner is told what to change rather
    #: than left guessing at a rejected upload.
    photo_review_reason = models.TextField(blank=True)
    #: Free-text default pickup / business address for rental autofill and similar forms.
    #: Stays still keep a per-property ``location_text``; this is the partner-level default.
    default_location_text = models.CharField(max_length=240, blank=True, default="")
    #: When Operations approved this host's first paid-booking (RESERVATION-mode) stay property.
    #: Set once a paid property passes review; later paid properties then publish without review.
    #: Cleared when Operations removes any of the host's properties, so trust must be re-earned.
    paid_stays_trusted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_name", "id")
        constraints = [
            #: An approved or pending photograph must actually have an object behind it. Without
            #: this, clearing the key while leaving the status behind publishes a partner as
            #: photographed and then signs a URL for nothing.
            models.CheckConstraint(
                condition=models.Q(photo_status__in=("NONE", "REJECTED"))
                | ~models.Q(photo_object_key=""),
                name="partners_photo_key_present_when_live",
            ),
        ]

    def __str__(self) -> str:
        return self.display_name

    @property
    def has_publishable_photo(self) -> bool:
        """Whether a Customer may be shown this photograph.

        The single place the rule lives. Every read path asks this rather than comparing the
        status itself, so "approved" can never come to mean two different things on two screens.
        """

        return bool(self.photo_object_key) and self.photo_status == self.PhotoStatus.APPROVED


class PartnerApplication(models.Model):
    class Track(models.TextChoices):
        """What the partner signs up to do, chosen on the first screen of the application.

        ``STAY_HOST`` lists their own property. They are asked who they are, agree to the terms
        and upload identity documents — not trades, service areas or working hours, which only
        matter for people who travel to a customer. Approving a stay-host application is what
        lets them list stays: one review, not a second capability review.

        ``RENTAL_OWNER`` rents out items. Same simplified onboarding as ``STAY_HOST``: name,
        agreements and identity documents. Approving the application grants A7_RENTAL capability
        — one review, not a separate capability review and per-ad approval.
        """

        SERVICES = "SERVICES", "Offer services"
        STAY_HOST = "STAY_HOST", "List my property"
        RENTAL_OWNER = "RENTAL_OWNER", "Rent out items"
        #: A shop, clinic or office hiring staff. Same short onboarding as ``STAY_HOST``;
        #: approval grants job posting (A10) without a separate capability review.
        EMPLOYER = "EMPLOYER", "Hire staff"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        CHANGES_REQUIRED = "CHANGES_REQUIRED", "Changes required"
        APPROVED = "APPROVED", "Approved"
        #: Final: Operations will not approve this applicant (a fake ID, an unsuitable fit). The
        #: reason is kept on the transition for the audit trail, not shown to the applicant.
        DECLINED = "DECLINED", "Declined"
        SUSPENDED = "SUSPENDED", "Suspended"
        OFFBOARDED = "OFFBOARDED", "Offboarded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.OneToOneField(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="application",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT)
    track = models.CharField(max_length=16, choices=Track.choices, default=Track.SERVICES)
    version = models.PositiveIntegerField(default=1)
    change_request_message = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="partner_applications_reviewed",
    )
    review_assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="partner_applications_assigned",
    )
    review_assigned_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        indexes = [
            models.Index(
                fields=("status", "submitted_at", "id"),
                name="partners_review_queue_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.status}"


class PartnerApplicationTransition(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        PartnerApplication,
        on_delete=models.PROTECT,
        related_name="transitions",
    )
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="partner_application_transitions_made",
    )
    reason_code = models.SlugField(max_length=80)
    reason = models.TextField(blank=True)
    application_version = models.PositiveIntegerField()
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("occurred_at", "id")
        indexes = [
            models.Index(fields=("application", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.application_id}:{self.from_status}->{self.to_status}"


class Skill(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=100, unique=True)
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name", "code")

    def __str__(self) -> str:
        return self.name


class PartnerSkill(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="skill_links",
    )
    skill = models.ForeignKey(Skill, on_delete=models.PROTECT, related_name="partner_links")
    is_active = models.BooleanField(default=True)
    enabled_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "skill"),
                name="partners_unique_partner_skill",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "is_active")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.skill.code}"


class PartnerService(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="service_links",
    )
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="partner_links",
    )
    is_active = models.BooleanField(default=True)
    enabled_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "variant"),
                name="partners_unique_partner_service",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "is_active")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.variant_id}"


class PartnerServiceArea(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="service_area_links",
    )
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.PROTECT,
        related_name="partner_links",
    )
    is_active = models.BooleanField(default=True)
    enabled_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "service_area"),
                name="partners_unique_partner_service_area",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "is_active")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.service_area_id}"


class PartnerConsent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="consents",
    )
    document = models.ForeignKey(
        "PartnerConsentDocument",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="receipts",
    )
    purpose = models.SlugField(max_length=100)
    document_version = models.CharField(max_length=80)
    request_ip_hash = models.CharField(max_length=64, blank=True)
    device_hash = models.CharField(max_length=64, blank=True)
    accepted_at = models.DateTimeField(default=timezone.now)
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "purpose", "document_version"),
                name="partners_unique_consent_version",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "purpose", "withdrawn_at")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.purpose}:{self.document_version}"


class PartnerConsentDocument(models.Model):
    """Published, versioned legal text that a Partner can explicitly accept."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purpose = models.SlugField(max_length=100)
    title = models.CharField(max_length=160)
    document_version = models.CharField(max_length=80)
    document_url = models.URLField(max_length=500)
    is_required_for_submission = models.BooleanField(default=True)
    is_current = models.BooleanField(default=True)
    published_at = models.DateTimeField(default=timezone.now)
    retired_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("purpose", "title", "document_version")
        constraints = [
            models.UniqueConstraint(
                fields=("purpose", "document_version"),
                name="partners_unique_consent_document_version",
            ),
            models.UniqueConstraint(
                fields=("purpose",),
                condition=models.Q(is_current=True),
                name="partners_unique_current_consent_document",
            ),
            models.CheckConstraint(
                condition=models.Q(is_current=False) | models.Q(retired_at__isnull=True),
                name="partners_current_consent_not_retired",
            ),
            models.CheckConstraint(
                condition=models.Q(document_url__startswith="https://"),
                name="partners_consent_document_https",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.purpose}:{self.document_version}"


class PartnerDocument(models.Model):
    class Kind(models.TextChoices):
        GOVERNMENT_ID = "GOVERNMENT_ID", "Government identity"
        ADDRESS_PROOF = "ADDRESS_PROOF", "Address proof"
        TAX = "TAX", "Tax document"
        BANK = "BANK", "Bank document"
        BACKGROUND_CHECK = "BACKGROUND_CHECK", "Background check"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        SUPERSEDED = "SUPERSEDED", "Superseded"

    class ScanStatus(models.TextChoices):
        PENDING = "PENDING", "Pending scan"
        CLEAN = "CLEAN", "Clean"
        REJECTED = "REJECTED", "Rejected"
        FAILED = "FAILED", "Scan failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        PartnerApplication,
        on_delete=models.PROTECT,
        related_name="documents",
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    version = models.PositiveIntegerField()
    object_key = models.CharField(max_length=500)
    content_type = models.CharField(max_length=120)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    scan_status = models.CharField(
        max_length=16,
        choices=ScanStatus.choices,
        default=ScanStatus.PENDING,
    )
    scanned_at = models.DateTimeField(null=True, blank=True)
    scan_failure_code = models.CharField(max_length=64, blank=True)
    #: The day this document stops being valid, or nothing.
    #:
    #: Nullable, and that is the answer rather than an omission: a photograph of a government ID
    #: has no expiry the platform tracks, while a police verification or a trade licence does. A
    #: non-null default would be a policy guess about which kinds expire, and which kinds each
    #: capability requires is an open owner decision (7). See proposal 0013 §Answered.
    expires_on = models.DateField(null=True, blank=True)
    replaces = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="replacement_versions",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="partner_documents_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_reason = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("kind", "-version")
        constraints = [
            models.UniqueConstraint(
                fields=("application", "kind", "version"),
                name="partners_unique_document_version",
            ),
            models.CheckConstraint(
                condition=models.Q(size_bytes__gt=0),
                name="partners_document_size_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("application", "kind", "status")),
            models.Index(fields=("kind", "expires_on")),
        ]

    def __str__(self) -> str:
        return f"{self.application_id}:{self.kind}:v{self.version}"

    def is_expired_on(self, day: date) -> bool:
        """A document with no recorded expiry never expires. Absence is not staleness."""
        return self.expires_on is not None and self.expires_on < day


class PartnerDocumentUpload(models.Model):
    class Status(models.TextChoices):
        ISSUED = "ISSUED", "Issued"
        VERIFIED = "VERIFIED", "Verified"
        EXPIRED = "EXPIRED", "Expired"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        PartnerApplication,
        on_delete=models.PROTECT,
        related_name="document_uploads",
    )
    kind = models.CharField(max_length=32, choices=PartnerDocument.Kind.choices)
    object_key = models.CharField(max_length=500, unique=True)
    content_type = models.CharField(max_length=120)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ISSUED)
    expires_at = models.DateTimeField()
    finalized_at = models.DateTimeField(null=True, blank=True)
    object_deleted_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(size_bytes__gt=0),
                name="partners_document_upload_size_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=("application", "status", "expires_at"),
                name="partners_upload_state_exp_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.application_id}:{self.kind}:{self.status}"
