"""Partner onboarding, eligibility, availability, and presence persistence."""

import uuid

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
        ]

    def __str__(self) -> str:
        return f"{self.application_id}:{self.kind}:v{self.version}"


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
