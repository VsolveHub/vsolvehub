"""Partner onboarding, eligibility, availability, and presence persistence."""

import uuid
from datetime import date
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.locations.models import ServiceArea


class PartnerProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="partner_profile",
    )
    display_name = models.CharField(max_length=120)
    biography = models.TextField(blank=True)
    experience_years = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_name", "id")

    def __str__(self) -> str:
        return self.display_name


class PartnerApplication(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        CHANGES_REQUIRED = "CHANGES_REQUIRED", "Changes required"
        APPROVED = "APPROVED", "Approved"
        SUSPENDED = "SUSPENDED", "Suspended"
        OFFBOARDED = "OFFBOARDED", "Offboarded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.OneToOneField(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="application",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT)
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


class PartnerAvailabilityRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.CASCADE,
        related_name="availability_rules",
    )
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.PROTECT,
        related_name="partner_availability_rules",
    )
    weekday = models.PositiveSmallIntegerField(help_text="Monday is 0 and Sunday is 6.")
    starts_at = models.TimeField()
    ends_at = models.TimeField()
    ends_next_day = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("weekday", "starts_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(weekday__gte=0, weekday__lte=6),
                name="partners_availability_valid_weekday",
            ),
            models.CheckConstraint(
                condition=~models.Q(starts_at=models.F("ends_at")),
                name="partners_availability_nonzero",
            ),
            models.UniqueConstraint(
                fields=("partner", "service_area", "weekday", "starts_at"),
                name="partners_unique_availability_start",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.weekday}:{self.starts_at}-{self.ends_at}"


class PartnerAvailabilityException(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.CASCADE,
        related_name="availability_exceptions",
    )
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.PROTECT,
        related_name="partner_availability_exceptions",
    )
    date = models.DateField()
    is_available = models.BooleanField(default=False)
    starts_at = models.TimeField(null=True, blank=True)
    ends_at = models.TimeField(null=True, blank=True)
    ends_next_day = models.BooleanField(default=False)
    reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("date", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "service_area", "date"),
                name="partners_unique_availability_exception",
            ),
            models.CheckConstraint(
                condition=models.Q(is_available=False)
                | (
                    models.Q(starts_at__isnull=False, ends_at__isnull=False)
                    & ~models.Q(starts_at=models.F("ends_at"))
                ),
                name="partners_available_exception_has_window",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.date}"


class PartnerScheduleChangeAudit(models.Model):
    """Immutable audit evidence for Operations-assisted schedule changes."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="schedule_change_audits",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="partner_schedule_changes_made",
    )
    consent = models.ForeignKey(
        PartnerConsent,
        on_delete=models.PROTECT,
        related_name="schedule_change_audits",
    )
    previous_schedule = models.JSONField(default=dict)
    updated_schedule = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("partner", "created_at"))]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.actor_id}:{self.created_at.isoformat()}"


class PartnerLocation(models.Model):
    class Purpose(models.TextChoices):
        INSTANT_MATCHING = "INSTANT_MATCHING", "Instant matching"

    partner = models.OneToOneField(
        PartnerProfile,
        primary_key=True,
        on_delete=models.CASCADE,
        related_name="latest_location",
    )
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.PROTECT,
        related_name="latest_partner_locations",
    )
    latitude = models.DecimalField(max_digits=6, decimal_places=3)
    longitude = models.DecimalField(max_digits=6, decimal_places=3)
    accuracy_m = models.PositiveIntegerField()
    purpose = models.CharField(
        max_length=32,
        choices=Purpose.choices,
        default=Purpose.INSTANT_MATCHING,
    )
    consent_version = models.CharField(max_length=80)
    captured_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(latitude__gte=-90, latitude__lte=90),
                name="partners_location_valid_latitude",
            ),
            models.CheckConstraint(
                condition=models.Q(longitude__gte=-180, longitude__lte=180),
                name="partners_location_valid_longitude",
            ),
            models.CheckConstraint(
                condition=models.Q(accuracy_m__gt=0),
                name="partners_location_accuracy_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.captured_at.isoformat()}"


class PartnerOnlineSession(models.Model):
    class EndReason(models.TextChoices):
        PARTNER_OFFLINE = "PARTNER_OFFLINE", "Partner went offline"
        REPLACED = "REPLACED", "Replaced by another session"
        PRESENCE_EXPIRED = "PRESENCE_EXPIRED", "Presence expired"
        SUSPENDED = "SUSPENDED", "Partner suspended"
        OFFBOARDED = "OFFBOARDED", "Partner offboarded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="online_sessions",
    )
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.PROTECT,
        related_name="partner_online_sessions",
    )
    started_at = models.DateTimeField(default=timezone.now)
    last_persisted_heartbeat_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=32, choices=EndReason.choices, blank=True)

    class Meta:
        ordering = ("-started_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("partner",),
                condition=models.Q(ended_at__isnull=True),
                name="partners_unique_active_online_session",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "ended_at")),
            models.Index(fields=("ended_at", "last_persisted_heartbeat_at")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.started_at.isoformat()}"


# ---------------------------------------------------------------------------
# M2 capability foundation (A3_TIME_BLOCK and A5_CUSTOM_PROJECT)
#
# See docs/adr/0007-m2-engagement-spine-and-fee-after-value.md. Commercial mode
# is a property of the archetype and is deliberately not stored here: a field
# Operations could edit would reintroduce the per-variant mode matrix ADR-0007
# removes.
# ---------------------------------------------------------------------------


def commercial_mode_for_archetype(archetype: str) -> str:
    """Derive the commercial mode. A3 is always lead-only; A5 always managed."""
    if archetype == ServiceVariant.BookingArchetype.A3_TIME_BLOCK:
        return PartnerCapability.CommercialMode.LEAD_ONLY
    if archetype == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT:
        return PartnerCapability.CommercialMode.MANAGED_PAYMENT_REQUIRED
    return PartnerCapability.CommercialMode.NOT_APPLICABLE


class PartnerBusinessProfile(models.Model):
    """Business identity for a Partner operating as an agency or project vendor."""

    class BusinessType(models.TextChoices):
        INDIVIDUAL = "INDIVIDUAL", "Individual"
        WORKFORCE_AGENCY = "WORKFORCE_AGENCY", "Workforce agency"
        PROJECT_VENDOR = "PROJECT_VENDOR", "Project vendor"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.OneToOneField(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="business_profile",
    )
    business_type = models.CharField(
        max_length=24,
        choices=BusinessType.choices,
        default=BusinessType.INDIVIDUAL,
    )
    legal_name = models.CharField(max_length=200, blank=True)
    registration_number = models.CharField(max_length=64, blank=True)
    gst_registered = models.BooleanField(default=False)
    gstin = models.CharField(max_length=15, blank=True)
    years_in_operation = models.PositiveSmallIntegerField(default=0)
    #: The lead's own UPI handle, for the evening "Day settled?" convenience link (`M2-BE-536`).
    #:
    #: **This is not a payout rail and must never become one.** A3 wages are peer-to-peer: the
    #: Customer's own UPI app sends the money to this address and the platform never holds, routes,
    #: books or reconciles it. It lives here rather than on `payouts.PartnerPayoutAccount` for
    #: exactly that reason — that table is where Vsolve pays somebody, this is where somebody else
    #: pays them, and putting a collection handle in the payout table is the first step to a
    #: settlement job finding it. Blank is the ordinary state: the deep link is simply not offered,
    #: the published amount still is, and the crew is paid the way they were paid before the app.
    upi_vpa = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(gst_registered=False, gstin="") | models.Q(gst_registered=True),
                name="partners_gstin_requires_gst_registered",
            ),
            models.CheckConstraint(
                condition=~models.Q(business_type="INDIVIDUAL") | models.Q(registration_number=""),
                name="partners_individual_has_no_registration_number",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.business_type}"


class PartnerCapability(models.Model):
    """One approved lifecycle capability. Authorises a workspace and its actions.

    A skill supports eligibility; only an approved capability authorises work.
    """

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        CHANGES_REQUIRED = "CHANGES_REQUIRED", "Changes required"
        APPROVED = "APPROVED", "Approved"
        SUSPENDED = "SUSPENDED", "Suspended"
        #: Operations refused. Distinct from WITHDRAWN on purpose — see proposal 0013 §Answered.
        #: "We said no" needs a reason and a support path; "you closed this" needs an obvious way
        #: to ask again. Collapsing them, as this model did until 12 August, left the Partner app
        #: unable to say either honestly.
        REJECTED = "REJECTED", "Rejected"
        #: The Partner's own exit, and nothing else.
        WITHDRAWN = "WITHDRAWN", "Withdrawn"

    class CommercialMode(models.TextChoices):
        LEAD_ONLY = "LEAD_ONLY", "Lead only"
        MANAGED_PAYMENT_REQUIRED = "MANAGED_PAYMENT_REQUIRED", "Managed payment required"
        NOT_APPLICABLE = "NOT_APPLICABLE", "Not applicable"

    ACTIVE_STATUSES = (
        Status.REQUESTED,
        Status.UNDER_REVIEW,
        Status.CHANGES_REQUIRED,
        Status.APPROVED,
    )
    #: Statuses a reviewer cannot reach without saying what is wrong. `CHANGES_REQUIRED` is here
    #: for the same reason `SUSPENDED` needs a reason code: the Partner's only next action is to
    #: fix something, and "we need a correction" without naming it sends them back to re-upload
    #: the document that was already right.
    REVIEW_STATUSES_NEEDING_NOTES = (Status.CHANGES_REQUIRED, Status.REJECTED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="capabilities",
    )
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="partner_capabilities",
    )
    archetype = models.CharField(
        max_length=24,
        choices=ServiceVariant.BookingArchetype.choices,
    )
    #: Where this capability is approved to operate (`M2-BE-102`). **Empty means every area the
    #: Partner serves**, which is the common case and keeps the M1 `PartnerServiceArea` link the
    #: single source of coverage. A non-empty set narrows it: a workforce agency approved for
    #: construction labour in one city but not the next is a real Operations decision, and before
    #: this field the only way to express it was to remove the whole service area — which also
    #: removed their A1 work. `PartnerServiceArea` still gates first; this can only subtract.
    service_areas = models.ManyToManyField(
        ServiceArea,
        blank=True,
        related_name="partner_capabilities",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.REQUESTED)
    #: Category-specific registration answers (`M2-BE-106`), validated at request time against
    #: `M2VariantConfiguration.registration_question_schema` through the same
    #: `carts.item_inputs.validate_scope` the Customer's answers use. Kept on the capability rather
    #: than the profile because the questions are per variant: "how many scaffolders can you field"
    #: is not a question about the business, it is a question about this capability.
    registration_answers = models.JSONField(default=dict, blank=True)
    max_crew_size = models.PositiveSmallIntegerField(null=True, blank=True)
    max_concurrent_engagements = models.PositiveSmallIntegerField(null=True, blank=True)
    max_project_value_paise = models.PositiveBigIntegerField(null=True, blank=True)
    requires_insurance = models.BooleanField(default=False)
    review_notes = models.TextField(blank=True)
    suspension_reason_code = models.SlugField(max_length=80, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="partner_capabilities_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("partner", "archetype", "-updated_at")
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "variant"),
                condition=models.Q(
                    status__in=("REQUESTED", "UNDER_REVIEW", "CHANGES_REQUIRED", "APPROVED")
                ),
                name="partners_unique_live_capability_per_variant",
            ),
            models.CheckConstraint(
                condition=models.Q(max_crew_size__isnull=True) | models.Q(max_crew_size__gt=0),
                name="partners_capability_crew_size_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(max_project_value_paise__isnull=True)
                | models.Q(max_project_value_paise__gt=0),
                name="partners_capability_project_value_positive",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="SUSPENDED") | ~models.Q(suspension_reason_code=""),
                name="partners_capability_suspension_needs_reason",
            ),
            models.CheckConstraint(
                condition=~models.Q(status__in=("CHANGES_REQUIRED", "REJECTED"))
                | ~models.Q(review_notes=""),
                name="partners_capability_review_state_needs_notes",
            ),
        ]
        indexes = [
            models.Index(fields=("archetype", "status"), name="partners_capability_lookup_idx"),
            models.Index(fields=("partner", "status")),
            models.Index(fields=("status", "expires_at")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.archetype}:{self.status}"

    @property
    def commercial_mode(self) -> str:
        return commercial_mode_for_archetype(self.archetype)

    @property
    def workspace_key(self) -> str:
        return self.archetype


class PartnerCapabilityTransition(models.Model):
    """Immutable audit of every capability review decision."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    capability = models.ForeignKey(
        PartnerCapability,
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
        related_name="partner_capability_transitions_made",
    )
    reason_code = models.SlugField(max_length=80)
    reason = models.TextField(blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("occurred_at", "id")
        indexes = [
            models.Index(fields=("capability", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.capability_id}:{self.from_status}->{self.to_status}"


class PartnerInsuranceDeclaration(models.Model):
    """Worker insurance and liability declaration required for workforce capability.

    Blocking for construction labour. The policy reference is stored for Operations
    verification; the document itself lives behind the M1 document storage adapter.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="insurance_declarations",
    )
    insurer_name = models.CharField(max_length=160)
    policy_reference = models.CharField(max_length=120)
    coverage_paise = models.PositiveBigIntegerField()
    covers_workmen_compensation = models.BooleanField(default=False)
    valid_from = models.DateField()
    valid_to = models.DateField()
    declared_at = models.DateTimeField(default=timezone.now)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="partner_insurance_verified",
    )

    class Meta:
        ordering = ("-valid_to", "-declared_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(valid_to__gt=models.F("valid_from")),
                name="partners_insurance_valid_range",
            ),
            models.CheckConstraint(
                condition=models.Q(coverage_paise__gt=0),
                name="partners_insurance_coverage_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "valid_to")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.insurer_name}"


class CrewMember(models.Model):
    """A worker as a global person, not a per-agency row.

    Identity is a keyed hash so the same person registered by two agencies resolves
    to one record and cannot be double-booked on one day.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    identity_hash = models.CharField(max_length=64, unique=True)
    display_name = models.CharField(max_length=120)
    #: The last four digits of the phone number, and nothing else.
    #:
    #: `identity_hash` is not reversible, so without this a roster of two people called Ramesh is
    #: two identical rows and the Partner cannot tell which one they archived. Four digits are what
    #: makes the list usable; the number itself stays out of the database, so a dump of this
    #: table is not a contact list.
    phone_suffix = models.CharField(max_length=4, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_name", "id")

    def __str__(self) -> str:
        return self.display_name


class PartnerCrewMembership(models.Model):
    """A crew member on one Partner's roster. One person may appear on several."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="crew_memberships",
    )
    crew_member = models.ForeignKey(
        CrewMember,
        on_delete=models.PROTECT,
        related_name="partner_memberships",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    is_supervisor = models.BooleanField(default=False)
    documents_verified_at = models.DateTimeField(null=True, blank=True)
    added_at = models.DateTimeField(default=timezone.now)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("partner", "-added_at")
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "crew_member"),
                name="partners_unique_crew_membership",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="ARCHIVED") | models.Q(archived_at__isnull=False),
                name="partners_archived_membership_has_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "status")),
            models.Index(fields=("crew_member", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.crew_member_id}"


class CrewAvailabilityException(models.Model):
    """A dated statement that one crew member is, or is not, available (`M2-BE-107`).

    Deliberately exception-shaped rather than a weekly rule set. A day labourer's default is
    "available"; what a supervisor actually knows is "Ramesh is at a wedding on the 14th". A weekly
    grid would demand a schedule nobody maintains and would silently mark everyone unavailable the
    day it shipped.

    Scoped to the *membership*, not the global `CrewMember`: one agency must not be able to publish
    another agency's worker as unavailable. Cross-agency conflict is settled by assignment, which
    `assert_crew_available` already reads.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey(
        PartnerCrewMembership,
        on_delete=models.PROTECT,
        related_name="availability_exceptions",
    )
    date = models.DateField()
    is_available = models.BooleanField(default=False)
    reason = models.CharField(max_length=200, blank=True)
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("date", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("membership", "date"),
                name="partners_unique_crew_availability_exception",
            ),
        ]
        indexes = [
            models.Index(fields=("membership", "date")),
        ]

    def __str__(self) -> str:
        return f"{self.membership_id}:{self.date}:{self.is_available}"


class PartnerLanguage(models.Model):
    """A language this vendor can actually work in (`M2-BE-301`).

    Matching reads it as hard eligibility: a voice note in Telugu sent to a vendor who reads only
    Hindi is a silent failure that looks like an unresponsive vendor. **A Partner who has declared
    no language is never excluded** — absence of a declaration is not a mismatch, and treating it as
    one would empty the candidate pool for every Partner registered before this field existed.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="languages",
    )
    #: BCP-47-ish, matching `CustomerRequirement.language`. Compared on the primary subtag, so
    #: `te-IN` and `te` are one language and a regional tag never fails to match itself.
    language_tag = models.CharField(max_length=16)
    is_active = models.BooleanField(default=True)
    declared_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("partner", "language_tag")
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "language_tag"),
                name="partners_unique_partner_language",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "is_active")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.language_tag}"


class CrewSkill(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey(
        PartnerCrewMembership,
        on_delete=models.PROTECT,
        related_name="skills",
    )
    skill = models.ForeignKey(Skill, on_delete=models.PROTECT, related_name="crew_links")
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("membership", "skill"),
                name="partners_unique_crew_skill",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.membership_id}:{self.skill_id}"


class PartnerIdentityCluster(models.Model):
    """Partner accounts that share a real-world identity signal.

    A cluster counts as one Partner for quote-slot purposes, so one beneficial owner
    cannot occupy two competing slots on the same requirement.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"cluster:{self.id}"


class PartnerClusterMembership(models.Model):
    class Signal(models.TextChoices):
        PHONE = "PHONE", "Shared phone"
        PAN = "PAN", "Shared PAN"
        BANK_ACCOUNT = "BANK_ACCOUNT", "Shared bank account"
        DEVICE = "DEVICE", "Shared device"
        OPERATIONS = "OPERATIONS", "Operations decision"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cluster = models.ForeignKey(
        PartnerIdentityCluster,
        on_delete=models.PROTECT,
        related_name="memberships",
    )
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="cluster_memberships",
    )
    signal = models.CharField(max_length=16, choices=Signal.choices)
    signal_hash = models.CharField(max_length=64)
    linked_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("cluster", "linked_at")
        constraints = [
            models.UniqueConstraint(
                fields=("cluster", "partner"),
                name="partners_unique_cluster_membership",
            ),
        ]
        indexes = [
            models.Index(fields=("partner",)),
            models.Index(fields=("signal", "signal_hash")),
        ]

    def __str__(self) -> str:
        return f"{self.cluster_id}:{self.partner_id}:{self.signal}"


class MinimumWageFloor(models.Model):
    """Statutory daily wage floor by state and skill.

    Values are Operations-loaded reference data. An A3 proposal below the live floor
    is rejected server-side; the platform, not only the vendor, carries that exposure.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    state_code = models.CharField(max_length=8)
    skill = models.ForeignKey(
        Skill,
        on_delete=models.PROTECT,
        related_name="wage_floors",
    )
    floor_paise_per_day = models.PositiveBigIntegerField()
    effective_from = models.DateField()
    source_reference = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("state_code", "skill", "-effective_from")
        constraints = [
            models.UniqueConstraint(
                fields=("state_code", "skill", "effective_from"),
                name="partners_unique_wage_floor_version",
            ),
            models.CheckConstraint(
                condition=models.Q(floor_paise_per_day__gt=0),
                name="partners_wage_floor_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("state_code", "skill", "effective_from")),
        ]

    def __str__(self) -> str:
        return f"{self.state_code}:{self.skill_id}:{self.floor_paise_per_day}"


class PartnerStandingEvent(models.Model):
    """One recorded fact about how a vendor behaved, and nothing more (Wave C4).

    ADR-0009 asks three separate things to "hit standing": a short crew day, a cash extra demanded
    on site, and a vendor no-show. Until this table there was nowhere to put any of them, so all
    three were sentences in docstrings — `booking_fees.report_crew_no_show` says the standing takes
    the hit and then does not take it.

    Three properties, each of which is the point:

    * **It is an event, not a score.** No number is stored, decayed or displayed. A score invites
      the question "what is mine?" from vendors and "why did it move?" from Operations, and neither
      has an answer this platform can defend. A count of named events inside a named window does.
    * **It is immutable, and one event per source row.** `source_id` is the row that caused it — a
      settlement, a report, a booking — and the partial unique index makes a re-driven command find
      its own event instead of writing a second one. Standing that can be edited, or double-counted
      by a retry, is not evidence.
    * **It carries no FK into `apps.requirements`.** That app imports this one; the reverse would
      be a cycle. `source_kind` plus `source_id` is the honest shape for a reference across that
      boundary, and it is deliberately not a `GenericForeignKey` — nothing here needs to *follow*
      the reference, only to prove which row it came from.

    A report is never proof on its own. `apps.partners.standing` reads these to answer "is there a
    pattern", against thresholds the owner has not set yet; while they are unset nothing at all
    happens to the vendor and the events simply accumulate, which is the fail-closed direction.
    """

    class Kind(models.TextChoices):
        CREW_SHORTFALL = "CREW_SHORTFALL", "Fewer workers arrived than were booked"
        CASH_DEMAND_REPORTED = "CASH_DEMAND_REPORTED", "A Customer reported a cash extra demanded"
        VENDOR_NO_SHOW = "VENDOR_NO_SHOW", "The crew did not arrive at all"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="standing_events",
    )
    kind = models.CharField(max_length=24, choices=Kind.choices)
    #: Which table the causing row lives in, as a slug. Written by the command that records the
    #: event so an Operations reader can find it without guessing.
    source_kind = models.SlugField(max_length=40)
    source_id = models.UUIDField(null=True, blank=True)
    #: What happened, in one line, for the Operations queue. Never a judgement.
    reason = models.CharField(max_length=240, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-occurred_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("kind", "source_id"),
                condition=models.Q(source_id__isnull=False),
                name="partners_one_standing_event_per_source",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "kind", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.kind}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("A standing event is immutable.")
        super().save(*args, **kwargs)
