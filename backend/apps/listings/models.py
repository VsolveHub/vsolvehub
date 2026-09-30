import uuid
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.foundation.slugs import slug_base, unique_slug
from apps.foundation.storage import private_file_storage


class Listing(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        CLOSED = "CLOSED", "Closed"
        EXPIRED = "EXPIRED", "Expired"
        REMOVED = "REMOVED", "Removed"
        ARCHIVED = "ARCHIVED", "Archived"

    class ModerationStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING = "PENDING", "Pending review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        REMOVED = "REMOVED", "Removed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    poster = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.PROTECT, related_name="listings"
    )
    variant = models.ForeignKey(
        "catalog.ServiceVariant", on_delete=models.PROTECT, related_name="listings"
    )
    title = models.CharField(max_length=180)
    #: The page address: /listings/<slug>. Set once on first save; never follows title edits.
    slug = models.SlugField(max_length=100, unique=True, editable=False)
    description = models.TextField()
    structured_fields = models.JSONField(default=dict, blank=True)
    salary_min_paise = models.PositiveIntegerField(default=0)
    salary_max_paise = models.PositiveIntegerField(default=0)
    salary_period = models.CharField(max_length=16, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    moderation_status = models.CharField(
        max_length=16, choices=ModerationStatus.choices, default=ModerationStatus.DRAFT
    )
    moderation_reason = models.CharField(max_length=480, blank=True)
    location_text = models.CharField(max_length=180, blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    contact_email = models.EmailField(blank=True)
    is_premium = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    removed_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    payment_attempt = models.OneToOneField(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="premium_listing",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-published_at", "-created_at")
        indexes = [
            models.Index(fields=("poster", "status"), name="listings_poster_status_idx"),
            models.Index(fields=("status", "moderation_status"), name="listings_public_status_idx"),
        ]

    def __str__(self) -> str:
        return self.title

    def save(self, *args: Any, **kwargs: Any) -> None:
        # A readable, stable web address, set once (see apps.foundation.slugs).
        if not self.slug:
            base = slug_base(self.title, self.location_text, fallback="listing")
            self.slug = unique_slug(type(self), base, exclude_pk=self.pk)
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = {*kwargs["update_fields"], "slug"}
        super().save(*args, **kwargs)

    @property
    def public_state(self) -> str:
        """One FE-renderable state. Plan names SUBMITTED_FOR_MODERATION / MODERATION_APPROVED
        are not stored and are not emitted.
        """
        if self.status in (
            self.Status.CLOSED,
            self.Status.EXPIRED,
            self.Status.REMOVED,
            self.Status.ARCHIVED,
        ):
            return self.status
        if self.status == self.Status.PUBLISHED:
            return self.Status.PUBLISHED
        if self.moderation_status == self.ModerationStatus.PENDING:
            return "PENDING_REVIEW"
        if self.moderation_status == self.ModerationStatus.REJECTED:
            return "REJECTED"
        return self.Status.DRAFT


class ListingMedia(models.Model):
    class Kind(models.TextChoices):
        IMAGE = "IMAGE", "Image"
        ATTACHMENT = "ATTACHMENT", "Attachment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="media")
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.IMAGE)
    url = models.URLField(max_length=500)
    alt_text = models.CharField(max_length=200, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "id")

    def __str__(self) -> str:
        return f"{self.listing_id}:{self.kind}:{self.display_order}"


class ListingModerationEvent(models.Model):
    class Action(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        PUBLISHED = "PUBLISHED", "Published"
        CLOSED = "CLOSED", "Closed"
        REMOVED = "REMOVED", "Removed"
        REINSTATED = "REINSTATED", "Reinstated"
        EDITED = "EDITED", "Edited"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT, related_name="moderation_events")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    reason = models.CharField(max_length=480, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.listing_id}:{self.action}"


class Application(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        SHORTLISTED = "SHORTLISTED", "Shortlisted"
        CONTACTED = "CONTACTED", "Contacted"
        REJECTED = "REJECTED", "Rejected"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        EXPIRED = "EXPIRED", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT, related_name="applications")
    applicant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="listing_applications"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SUBMITTED)
    applicant_snapshot = models.JSONField(default=dict)
    cover_note = models.TextField(blank=True)
    resume_url = models.URLField(max_length=500, blank=True)
    contact_revealed_at = models.DateTimeField(null=True, blank=True)
    contact_revealed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    duplicate_of = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="duplicates"
    )
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("listing", "applicant"),
                condition=~models.Q(status__in=("WITHDRAWN", "EXPIRED")),
                name="listings_unique_active_application",
            )
        ]
        indexes = [
            models.Index(fields=("listing", "status"), name="listings_app_status_idx"),
            models.Index(fields=("applicant", "status"), name="listings_app_actor_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.listing_id}:{self.applicant_id}:{self.status}"


class ApplicationAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="attachments"
    )
    file_url = models.URLField(max_length=500)
    file_name = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self) -> str:
        return f"{self.application_id}:{self.file_name}"


class ApplicationStatusEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        Application, on_delete=models.PROTECT, related_name="status_events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    kind = models.CharField(max_length=32, blank=True)
    note = models.CharField(max_length=480, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "id")

    def __str__(self) -> str:
        return f"{self.application_id}:{self.from_status}->{self.to_status}"


class ListingReport(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT, related_name="reports")
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="listing_reports"
    )
    reason = models.CharField(max_length=80)
    detail = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    operations_case = models.ForeignKey(
        "cases.OperationsCase",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="listing_reports",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.listing_id}:{self.reason}"


class ApplicationReport(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.PROTECT, related_name="reports")
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="application_reports"
    )
    reason = models.CharField(max_length=80)
    detail = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    operations_case = models.ForeignKey(
        "cases.OperationsCase",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="application_reports",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.application_id}:{self.reason}"


class VendorSubscriptionPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(
        "catalog.Service",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="vendor_subscription_plans",
    )
    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    price_paise = models.PositiveBigIntegerField()
    duration_days = models.PositiveSmallIntegerField(default=30)
    max_active_listings = models.PositiveSmallIntegerField(default=3)
    premium_capabilities = models.JSONField(default=list, blank=True)
    premium_price_paise = models.PositiveBigIntegerField(default=49900)
    details = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.name


class VendorSubscription(models.Model):
    class Status(models.TextChoices):
        PENDING_ACTIVATION = "PENDING_ACTIVATION", "Pending activation"
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    poster = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.PROTECT, related_name="listing_subscriptions"
    )
    plan = models.ForeignKey(
        VendorSubscriptionPlan, on_delete=models.PROTECT, related_name="subscriptions"
    )
    payment_attempt = models.OneToOneField(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="listing_subscription",
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING_ACTIVATION
    )
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.poster_id}:{self.plan_id}:{self.status}"

    @property
    def would_end_at(self) -> datetime:
        return timezone.now() + timedelta(days=self.plan.duration_days)


class ListingResumeUpload(models.Model):
    """Applicant resume stored by the platform. Apply still records `resume_url`."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT, related_name="resume_uploads")
    applicant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="listing_resume_uploads"
    )
    original_name = models.CharField(max_length=180)
    content_type = models.CharField(max_length=80)
    size_bytes = models.PositiveIntegerField()
    # Private: never on the public photo bucket. Opened through a signed link only.
    stored_file = models.FileField(upload_to="listing-resumes/", storage=private_file_storage)
    created_at = models.DateTimeField(auto_now_add=True)
