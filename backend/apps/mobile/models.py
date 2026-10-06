"""Devices that can receive a push, and one ticket per send."""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class PushDevice(models.Model):
    """One Expo installation bound to the session that registered it."""

    class App(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        PARTNER = "partner", "Partner"

    class Platform(models.TextChoices):
        IOS = "ios", "iOS"
        ANDROID = "android", "Android"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_devices",
    )
    session = models.ForeignKey(
        "identity.UserSession",
        on_delete=models.CASCADE,
        related_name="push_devices",
    )
    app = models.CharField(max_length=16, choices=App.choices)
    platform = models.CharField(max_length=16, choices=Platform.choices)
    expo_push_token = models.CharField(max_length=200, unique=True)
    app_version = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)
    last_registered_at = models.DateTimeField(default=timezone.now)
    disabled_at = models.DateTimeField(null=True, blank=True)
    disabled_reason = models.CharField(max_length=64, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("user", "disabled_at")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(expo_push_token__startswith="ExponentPushToken[")  # noqa: S106
                | Q(expo_push_token__startswith="ExpoPushToken["),  # noqa: S106
                name="mobile_push_token_prefix",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.app}:{self.platform}:{self.expo_push_token}"


class PushTicket(models.Model):
    """One Expo ticket for one device and one notification intent."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(PushDevice, on_delete=models.CASCADE, related_name="tickets")
    intent = models.ForeignKey(
        "notifications.NotificationIntent",
        on_delete=models.PROTECT,
        related_name="push_tickets",
    )
    expo_ticket_id = models.CharField(max_length=64, blank=True)
    ticket_status = models.CharField(max_length=8)
    ticket_error = models.CharField(max_length=64, blank=True)
    receipt_status = models.CharField(max_length=8, blank=True)
    receipt_error = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    receipt_checked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("device", "intent"),
                name="mobile_one_ticket_per_device",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.intent_id}:{self.device_id}:{self.ticket_status}"
