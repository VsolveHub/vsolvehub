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


class PartnerShift(models.Model):
    """An intentional on-duty work period for an approved partner.

    Distinct from `PartnerOnlineSession`:
    - `PartnerOnlineSession` tracks browser tab telemetry and 90-second Redis heartbeats.
    - `PartnerShift` represents commercial readiness to receive instant push dispatches,
      remaining active even when the partner's browser tab is minimized or phone is locked.
    """

    class EndReason(models.TextChoices):
        PARTNER_LOGOUT = "PARTNER_LOGOUT", "Partner ended shift"
        SHIFT_EXPIRED = "SHIFT_EXPIRED", "Shift duration completed"
        IDLE_EXPIRED = "IDLE_EXPIRED", "Shift expired due to inactivity"
        MISSED_OFFERS = "MISSED_OFFERS", "Consecutive offers missed without response"
        SUPERSEDED = "SUPERSEDED", "Superseded by new shift"
        SUSPENDED = "SUSPENDED", "Partner account suspended"
        OFFBOARDED = "OFFBOARDED", "Partner offboarded"
        ADMIN_ENDED = "ADMIN_ENDED", "Ended by Operations administrator"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="shifts",
    )
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.PROTECT,
        related_name="partner_shifts",
    )
    started_at = models.DateTimeField(default=timezone.now)
    scheduled_end_at = models.DateTimeField(
        help_text="Expected end time for this shift (e.g. started_at + default shift duration)."
    )
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=32, choices=EndReason.choices, blank=True)
    last_active_at = models.DateTimeField(
        default=timezone.now,
        help_text="Updated by heartbeats or offer responses for idle safety checks.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-started_at",)
        indexes = [
            models.Index(fields=("partner", "ended_at")),
            models.Index(fields=("service_area", "ended_at")),
            models.Index(fields=("ended_at", "scheduled_end_at")),
            models.Index(fields=("partner", "last_active_at")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("partner",),
                condition=models.Q(ended_at__isnull=True),
                name="partners_unique_active_shift",
            ),
            models.CheckConstraint(
                condition=models.Q(scheduled_end_at__gt=models.F("started_at")),
                name="partners_shift_positive_duration",
            ),
        ]

    def __str__(self) -> str:
        status = "ACTIVE" if self.ended_at is None else f"ENDED({self.end_reason})"
        return f"{self.partner_id}:{self.started_at.isoformat()}:{status}"


class PartnerPushSubscription(models.Model):
    """Stores the partner's verified OneSignal Web Push subscription state."""

    class Platform(models.TextChoices):
        WEB = "WEB", "Web Browser"
        ANDROID = "ANDROID", "Android"
        IOS = "IOS", "iOS"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="partner_push_subscriptions",
    )
    onesignal_subscription_id = models.CharField(
        max_length=64,
        unique=True,
        help_text="OneSignal Subscription ID (UUID).",
    )
    onesignal_external_id = models.CharField(
        max_length=64,
        db_index=True,
        help_text="OneSignal external_id alias (Partner ID / User ID).",
    )
    platform = models.CharField(
        max_length=16,
        choices=Platform.choices,
        default=Platform.WEB,
    )
    user_agent = models.CharField(max_length=500, blank=True)
    is_active = models.BooleanField(
        default=True,
        help_text="False if unsubscribed, permission revoked, or notification delivery bounced.",
    )
    last_verified_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        indexes = [
            models.Index(fields=("partner", "is_active")),
            models.Index(fields=("user", "is_active")),
            models.Index(fields=("onesignal_external_id", "is_active")),
        ]

    def __str__(self) -> str:
        state = "ACTIVE" if self.is_active else "INACTIVE"
        return f"{self.partner_id}:{self.onesignal_subscription_id}:{state}"
