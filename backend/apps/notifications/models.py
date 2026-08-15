"""Notification intent, delivery attempts, and the kill switches that can stop them.

## Intent and delivery are separate rows on purpose

"We decided to tell this person something" and "a provider accepted it" are different facts, and
conflating them is how a system starts reporting that a Customer was notified when the SMS
gateway was down. `NotificationIntent` is the decision; `NotificationDelivery` is one attempt at
carrying it out. An intent with three failed deliveries is a real and visible state — the plan's
"cases may not close merely because a notification was sent" cuts both ways, and this is the
table that shows whether it was sent at all.

## Why a kill switch is a row rather than a setting

An environment variable needs a deploy to change. The moment you need to stop sending — a
provider is misbehaving, a template is wrong, a service area is in trouble — is exactly the
moment you cannot wait for a release. `KillSwitch` is data, checked on every send, with an
audited actor and reason so "why did notifications stop at 3am" has an answer.
"""

import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone


class KillSwitch(models.Model):
    """A named, audited off-switch for one capability.

    Deliberately blunt: engaged or not, with a reason. A switch with a policy engine behind it is
    a thing people have to reason about under pressure, which is when reasoning is worst.
    """

    class Scope(models.TextChoices):
        NOTIFICATIONS = "NOTIFICATIONS", "All outbound notifications"
        SMS = "SMS", "SMS channel"
        WHATSAPP = "WHATSAPP", "WhatsApp channel"
        VOICE = "VOICE", "Voice call channel"
        PAYMENTS = "PAYMENTS", "Payment collection"
        PAYOUTS = "PAYOUTS", "Partner payouts"
        DISPATCH = "DISPATCH", "Partner dispatch"
        SERVICE_AREA = "SERVICE_AREA", "One service area"
        SERVICE = "SERVICE", "One service"
        #: Wave C7 (`M2-BE-810`). Stops M2 from taking **new** commercial commitments — the A3
        #: instant booking, the A3 unlock checkout and the A5 visit-plan choice and checkout —
        #: while every in-flight requirement, funded stage, refund, forfeit and payout continues.
        #: `target` is a `ServiceVariant` id when the pause is for one product, blank for all M2.
        #:
        #: A separate scope rather than reusing `PAYMENTS`, because they answer different
        #: questions: `PAYMENTS` is "the provider is down, take no money at all", and this is "stop
        #: selling this, the money rails are fine". `apps.requirements.purchase_gates` reads both.
        M2_PURCHASES = "M2_PURCHASES", "New M2 purchases"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope = models.CharField(max_length=20, choices=Scope.choices)
    #: Empty for a global scope; a service-area or service slug for a targeted one. Keeping the
    #: target as an opaque string means adding a new scope needs no migration.
    target = models.CharField(max_length=140, blank=True)
    is_engaged = models.BooleanField(default=False)
    reason = models.CharField(max_length=240, blank=True)
    engaged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    engaged_at = models.DateTimeField(null=True, blank=True)
    released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    released_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("scope", "target")
        constraints = [
            models.UniqueConstraint(
                fields=("scope", "target"), name="notifications_one_switch_per_target"
            ),
            models.CheckConstraint(
                # An engaged switch without a reason is an outage nobody can explain later.
                condition=models.Q(is_engaged=False) | ~models.Q(reason=""),
                name="notifications_engaged_switch_has_a_reason",
            ),
        ]

    def __str__(self) -> str:
        state = "engaged" if self.is_engaged else "released"
        return f"{self.scope}:{self.target or '*'}:{state}"


class NotificationIntent(models.Model):
    """We decided to tell somebody something. Whether it arrived is `deliveries`."""

    class Channel(models.TextChoices):
        SMS = "SMS", "SMS"
        EMAIL = "EMAIL", "Email"
        PUSH = "PUSH", "Push"
        #: Added for M2. A workforce deadline that only ever rings an unread in-app notice is a
        #: deadline the vendor loses to silence, so the ladder must be able to leave the app.
        WHATSAPP = "WHATSAPP", "WhatsApp"
        VOICE = "VOICE", "Voice call"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        #: Every attempt failed and the retry budget is spent. Visible, not silent.
        FAILED = "FAILED", "Failed"
        #: A kill switch was engaged, or the recipient opted out of this purpose.
        SUPPRESSED = "SUPPRESSED", "Suppressed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="notification_intents"
    )
    #: What this message is *for*. Communication preferences and consent are recorded per purpose,
    #: so a Partner who muted marketing still gets told their job was cancelled.
    purpose = models.CharField(max_length=64)
    channel = models.CharField(max_length=8, choices=Channel.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    template_code = models.CharField(max_length=80)
    #: The values a template needs. Never the rendered message — a rendered body would freeze
    #: today's copy into a row that outlives it, and would store PII this table has no need for.
    context = models.JSONField(default=dict)
    attempts = models.PositiveSmallIntegerField(default=0)
    suppressed_reason = models.CharField(max_length=140, blank=True)
    idempotency_key = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        indexes = [
            models.Index(fields=("status", "created_at")),
            models.Index(fields=("recipient", "purpose")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("idempotency_key",),
                condition=~models.Q(idempotency_key=""),
                name="notifications_unique_intent_key",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.purpose}:{self.channel}:{self.status}"


class NotificationDelivery(models.Model):
    """One attempt to carry out an intent, and what the provider said about it."""

    class Status(models.TextChoices):
        ACCEPTED = "ACCEPTED", "Accepted by provider"
        DELIVERED = "DELIVERED", "Delivered"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    intent = models.ForeignKey(
        NotificationIntent, on_delete=models.PROTECT, related_name="deliveries"
    )
    provider = models.CharField(max_length=40)
    status = models.CharField(max_length=12, choices=Status.choices)
    provider_message_id = models.CharField(max_length=140, blank=True)
    failure_code = models.SlugField(max_length=80, blank=True)
    attempted_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("attempted_at", "id")
        indexes = [models.Index(fields=("intent", "attempted_at"))]

    def __str__(self) -> str:
        return f"{self.intent_id}:{self.provider}:{self.status}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Notification delivery attempts are immutable.")
        super().save(*args, **kwargs)
