"""A9 stay domain — enquiry-first Property/Unit MVP. Not Booking / FulfilmentUnit."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="enquiries")
    unit = models.ForeignKey(
        Unit, null=True, blank=True, on_delete=models.PROTECT, related_name="enquiries"
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
