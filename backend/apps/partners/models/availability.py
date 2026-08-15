"""When a Partner works, where they are, and whether they are online right now.

The M1 schedule and presence slice: the weekly availability rules, the dated exceptions that
override them, the immutable audit of Operations-assisted schedule edits, the single latest
location row kept for instant matching, and the online session that presence heartbeats extend.

The boundary: this module owns the calendar and the live presence signal only. The Partner
identity these rows hang off, and the consent receipt a schedule audit cites, live in
`onboarding` and are referenced by label so the dependency arrow stays one-way.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.locations.models import ServiceArea


class PartnerAvailabilityRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
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
        "partners.PartnerProfile",
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
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="schedule_change_audits",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="partner_schedule_changes_made",
    )
    consent = models.ForeignKey(
        "partners.PartnerConsent",
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
        "partners.PartnerProfile",
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
        "partners.PartnerProfile",
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
