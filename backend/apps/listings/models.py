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
    # --- Jobs: picked from options, not typed (see ``apps.listings.jobs``) -------------------
    #: The template the employer started from. The job keeps its own copy of every detail.
    role_template = models.ForeignKey(
        "JobRoleTemplate",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="listings",
    )
    job_category = models.CharField(max_length=80, blank=True, default="")
    vacancies = models.PositiveSmallIntegerField(default=1)
    job_type = models.CharField(max_length=20, blank=True, default="")
    experience_band = models.CharField(max_length=12, blank=True, default="")
    #: Must-have skills drive matching; nice-to-have skills only add to a score.
    required_skills = models.JSONField(default=list, blank=True)
    preferred_skills = models.JSONField(default=list, blank=True)
    responsibilities = models.JSONField(default=list, blank=True)
    benefits = models.JSONField(default=list, blank=True)
    languages = models.JSONField(default=list, blank=True)
    min_qualification = models.CharField(max_length=20, blank=True, default="")
    shift = models.CharField(max_length=12, blank=True, default="")
    work_mode = models.CharField(max_length=16, blank=True, default="")
    timing_start = models.TimeField(null=True, blank=True)
    timing_end = models.TimeField(null=True, blank=True)
    weekly_off = models.CharField(max_length=12, blank=True, default="")
    urgency = models.CharField(max_length=12, blank=True, default="")
    city = models.CharField(max_length=80, blank=True, default="")
    area = models.CharField(max_length=120, blank=True, default="")
    #: Times the public job page was opened. A rough count for the employer's job card.
    view_count = models.PositiveIntegerField(default=0)
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
        #: An interview is being arranged or has been agreed.
        INTERVIEW = "INTERVIEW", "Interview"
        #: Employer and candidate are in touch directly; V Solve Hub's part is done.
        CONNECTED = "CONNECTED", "Connected"
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
            models.Index(fields=("-created_at",), name="listings_app_created_idx"),
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


class JobRoleTemplate(models.Model):
    """A common job ("Sales Executive") with what it usually needs, so employers and job seekers
    tap instead of type. Operations can edit these; a job keeps its own copy once posted.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.CharField(max_length=80)
    name = models.CharField(max_length=80)
    skills = models.JSONField(default=list, blank=True)
    responsibilities = models.JSONField(default=list, blank=True)
    job_type = models.CharField(max_length=20, blank=True, default="")
    shift = models.CharField(max_length=12, blank=True, default="")
    work_mode = models.CharField(max_length=16, blank=True, default="")
    #: A typical monthly pay range in rupees, offered as the starting point.
    salary_min_rupees = models.PositiveIntegerField(default=0)
    salary_max_rupees = models.PositiveIntegerField(default=0)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("category", "display_order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("category", "name"), name="listings_job_template_unique_name"
            )
        ]

    def __str__(self) -> str:
        return f"{self.category} / {self.name}"


class JobSeekerProfile(models.Model):
    """A job seeker's profile, filled once mostly by tapping. Applying sends it in one tap, and
    it is what jobs are matched against.
    """

    class Visibility(models.TextChoices):
        #: Matching employers can see the profile summary (never the phone) and invite them.
        OPEN = "OPEN", "Matching employers can find me"
        #: Only employers they apply to see it.
        APPLIED_ONLY = "APPLIED_ONLY", "Only employers I apply to"

    class Availability(models.TextChoices):
        IMMEDIATE = "IMMEDIATE", "Immediately"
        WEEK = "WEEK", "Within 7 days"
        FORTNIGHT = "FORTNIGHT", "Within 15 days"
        MONTH = "MONTH", "Within 30 days"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="job_profile"
    )
    full_name = models.CharField(max_length=120, blank=True, default="")
    #: Up to three job titles they want ("Sales Executive", "Cashier").
    roles = models.JSONField(default=list, blank=True)
    #: Every skill the seeker has, from their own edits and every job they applied for. Matching
    #: reads this flat list; applying adds to it and never replaces it.
    skills = models.JSONField(default=list, blank=True)
    #: The same skills grouped by the job category they came from, for the seeker's own profile
    #: page: ``[{"category", "role", "skills": [...], "added_at"}]``. Employers never see this.
    skill_groups = models.JSONField(default=list, blank=True)
    experience_band = models.CharField(max_length=12, blank=True, default="")
    qualification = models.CharField(max_length=20, blank=True, default="")
    languages = models.JSONField(default=list, blank=True)
    city = models.CharField(max_length=80, blank=True, default="")
    area = models.CharField(max_length=120, blank=True, default="")
    expected_salary_rupees = models.PositiveIntegerField(default=0)
    job_types = models.JSONField(default=list, blank=True)
    available_from = models.CharField(
        max_length=12, choices=Availability.choices, blank=True, default=""
    )
    visibility = models.CharField(
        max_length=16, choices=Visibility.choices, default=Visibility.OPEN
    )
    resume_name = models.CharField(max_length=180, blank=True, default="")
    resume_content_type = models.CharField(max_length=80, blank=True, default="")
    resume_file = models.FileField(
        upload_to="job-profile-resumes/", storage=private_file_storage, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=("city", "visibility"), name="listings_profile_city_idx")]

    def __str__(self) -> str:
        return self.full_name or str(self.user_id)


class SavedJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_jobs"
    )
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="saves")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(fields=("user", "listing"), name="listings_saved_job_unique")
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.listing_id}"


class Interview(models.Model):
    """An interview the employer proposes for one application. The candidate accepts, asks for
    another time, or declines. Phone numbers are shared both ways once it is accepted."""

    class Mode(models.TextChoices):
        IN_PERSON = "IN_PERSON", "In person"
        PHONE = "PHONE", "Phone call"
        VIDEO = "VIDEO", "Video call"

    class Status(models.TextChoices):
        PROPOSED = "PROPOSED", "Waiting for the candidate"
        ACCEPTED = "ACCEPTED", "Accepted"
        RESCHEDULE_REQUESTED = "RESCHEDULE_REQUESTED", "Asked for another time"
        DECLINED = "DECLINED", "Declined"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="interviews"
    )
    scheduled_date = models.DateField()
    start_time = models.TimeField()
    mode = models.CharField(max_length=12, choices=Mode.choices, default=Mode.IN_PERSON)
    location_text = models.CharField(max_length=240, blank=True, default="")
    note = models.CharField(max_length=480, blank=True, default="")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PROPOSED)
    #: What the candidate wrote when asking for another time or declining.
    candidate_note = models.CharField(max_length=480, blank=True, default="")
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("application",),
                condition=models.Q(status__in=("PROPOSED", "ACCEPTED", "RESCHEDULE_REQUESTED")),
                name="listings_one_open_interview",
            )
        ]

    def __str__(self) -> str:
        return f"{self.application_id}:{self.scheduled_date}:{self.status}"
