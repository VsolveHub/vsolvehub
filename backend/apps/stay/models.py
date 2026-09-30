"""A9 stay domain — enquiry-first Property/Unit MVP. Not Booking / FulfilmentUnit."""

from __future__ import annotations

import builtins
import uuid
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import models


def stay_ad_upload_to(instance: models.Model, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    partner_key = getattr(instance, "partner_id", None) or "anon"
    return f"stay-ads/{partner_key}/{uuid.uuid4().hex}{ext}"


class Property(models.Model):
    class ModerationStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        REMOVED = "REMOVED", "Removed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    host = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.PROTECT, related_name="stay_properties"
    )
    variant = models.ForeignKey(
        "catalog.ServiceVariant", on_delete=models.PROTECT, related_name="stay_properties"
    )
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    location_text = models.CharField(max_length=180, blank=True)
    moderation_status = models.CharField(
        max_length=16, choices=ModerationStatus.choices, default=ModerationStatus.DRAFT
    )
    moderation_reason = models.CharField(max_length=480, blank=True)
    structured_fields = models.JSONField(default=dict, blank=True)
    cancellation_policy_text = models.TextField(blank=True, default="")
    house_rules = models.TextField(blank=True, default="")
    min_stay_nights = models.PositiveSmallIntegerField(default=1)
    available_from = models.DateField(null=True, blank=True)
    available_until = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name_plural = "properties"

    def __str__(self) -> str:
        return self.title

    @property
    def public_state(self) -> str:
        if self.moderation_status == self.ModerationStatus.PENDING:
            return "PENDING_REVIEW"
        if self.moderation_status == self.ModerationStatus.REJECTED:
            return "REJECTED"
        if self.moderation_status == self.ModerationStatus.REMOVED:
            return "REMOVED"
        if self.moderation_status == self.ModerationStatus.APPROVED:
            return "PUBLISHED"
        return "DRAFT"


class Unit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="units")
    name = models.CharField(max_length=120)
    sharing_count = models.PositiveSmallIntegerField(default=1)
    nightly_rate_paise = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)
    attributes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)


class StayEnquiry(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        RESPONDED = "RESPONDED", "Responded"
        DECLINED = "DECLINED", "Declined"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        EXPIRED = "EXPIRED", "Expired"
        CONFIRMED = "CONFIRMED", "Confirmed"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="enquiries")
    unit = models.ForeignKey(
        Unit, null=True, blank=True, on_delete=models.PROTECT, related_name="enquiries"
    )
    unit_reservation = models.OneToOneField(
        "UnitReservation",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="enquiry",
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stay_enquiries"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SUBMITTED)
    check_in = models.DateField()
    check_out = models.DateField()
    guest_count = models.PositiveSmallIntegerField(default=1)
    nights = models.PositiveIntegerField(default=1)
    total_quote_paise = models.PositiveIntegerField(default=0)
    message = models.TextField(blank=True)
    host_response = models.TextField(blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name_plural = "stay enquiries"


class StayModerationEvent(models.Model):
    class Action(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        #: Went live on publish without review (enquiry mode, or a trusted paid-stays host).
        PUBLISHED = "PUBLISHED", "Published"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        REMOVED = "REMOVED", "Removed"
        REINSTATED = "REINSTATED", "Reinstated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(
        Property, on_delete=models.PROTECT, related_name="moderation_events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    reason = models.CharField(max_length=480, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class PropertyMedia(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="media")
    url = models.URLField(max_length=1024)
    caption = models.CharField(max_length=240, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "created_at")

    @builtins.property
    def image_url(self) -> str:
        return self.url

    @builtins.property
    def sort_order(self) -> int:
        return self.display_order


class StayPhotoUpload(models.Model):
    """Partner-uploaded stay photo stored on the platform before it is attached."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.CASCADE,
        related_name="stay_photo_uploads",
    )
    stored_file = models.FileField(upload_to=stay_ad_upload_to)
    original_name = models.CharField(max_length=180)
    content_type = models.CharField(max_length=80)
    size_bytes = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.original_name


class StayReview(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="reviews")
    enquiry = models.ForeignKey(
        StayEnquiry, null=True, blank=True, on_delete=models.SET_NULL, related_name="reviews"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stay_reviews"
    )
    rating = models.PositiveSmallIntegerField()
    body = models.TextField(blank=True)
    comment = models.TextField(blank=True)
    image_urls = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "enquiry"],
                condition=models.Q(enquiry__isnull=False),
                name="unique_customer_enquiry_stay_review",
            ),
        ]

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self.body and self.comment:
            self.body = self.comment
        elif not self.comment and self.body:
            self.comment = self.body
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return str(self.id)


class UnitReservation(models.Model):
    """Day-granular hold on a unit. Overlap enforced via select_for_update in services."""

    class Status(models.TextChoices):
        HELD = "HELD", "Held"
        CONFIRMED = "CONFIRMED", "Confirmed"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="reservations")
    check_in = models.DateField()
    check_out = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.HELD)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("unit", "status", "check_in", "check_out")),
        ]

    def __str__(self) -> str:
        return str(self.id)


class StayReservation(models.Model):
    """Paid reservation on a property unit. Created after payment capture."""

    class Status(models.TextChoices):
        HELD = "HELD", "Held (awaiting payment)"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        CONFIRMED = "CONFIRMED", "Confirmed"
        CHECKED_IN = "CHECKED_IN", "Checked in"
        CHECKED_OUT = "CHECKED_OUT", "Checked out"
        CANCELLED = "CANCELLED", "Cancelled"
        NO_SHOW = "NO_SHOW", "No show"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="reservations")
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="stay_reservations")
    unit_reservation = models.OneToOneField(
        UnitReservation, on_delete=models.PROTECT, related_name="stay_reservation"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stay_reservations"
    )
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stay_reservations",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.HELD)
    check_in = models.DateField()
    check_out = models.DateField()
    guest_count = models.PositiveSmallIntegerField(default=1)
    nights = models.PositiveIntegerField(default=1)
    total_paise = models.PositiveIntegerField(default=0)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total_paise__gt=0),
                name="stay_reservation_positive_total",
            ),
        ]

    def __str__(self) -> str:
        return str(self.id)
