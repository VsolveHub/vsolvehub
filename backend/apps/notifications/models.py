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
        PUSH = "PUSH", "Push channel"
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
        #: Rung zero, added for the M2 feed. It costs nothing and reaches nobody who is not
        #: already looking, which is precisely why it is the bottom of the ladder and never the
        #: whole of it — `escalation.DEFAULT_LADDER` still climbs away from here as a deadline
        #: nears. A notice that exists only in the app is a notice a Customer asleep at 7am
        #: never got.
        IN_APP = "IN_APP", "In-app"
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

    class Audience(models.TextChoices):
        """Which side of the platform the notice speaks to.

        One person can be both a Customer and a Partner. Their customer notices belong in the
        customer app and site, their partner notices in the partner app and site, and the recipient
        alone cannot tell the two apart. Recorded when the notice is created, by the code that
        knows which side the recipient is on in that moment.
        """

        CUSTOMER = "CUSTOMER", "Customer"
        PARTNER = "PARTNER", "Partner"
        OPERATIONS = "OPERATIONS", "Operations"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="notification_intents"
    )
    #: What this message is *for*. Communication preferences and consent are recorded per purpose,
    #: so a Partner who muted marketing still gets told their job was cancelled.
    purpose = models.CharField(max_length=64)
    channel = models.CharField(max_length=8, choices=Channel.choices)
    #: Blank only on rows written before audiences were recorded; every new row has one.
    audience = models.CharField(max_length=10, choices=Audience.choices, blank=True, default="")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    template_code = models.CharField(max_length=80)
    #: The values a template needs. Never the rendered message — a rendered body would freeze
    #: today's copy into a row that outlives it, and would store PII this table has no need for.
    context = models.JSONField(default=dict)
    attempts = models.PositiveSmallIntegerField(default=0)
    suppressed_reason = models.CharField(max_length=140, blank=True)
    #: When the recipient opened this notice in the app.
    #:
    #: Only an in-app notice can be read. An SMS has no such fact — a provider reports that it
    #: accepted a message, never that a person looked at it — so a column carrying a meaning on
    #: one channel out of five is a column that eventually gets filled in on the other four. The
    #: check constraint below refuses that rather than trusting every future caller to remember.
    read_at = models.DateTimeField(null=True, blank=True)
    deep_link = models.CharField(max_length=255, blank=True, default="")
    idempotency_key = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        indexes = [
            models.Index(fields=("status", "created_at")),
            models.Index(fields=("recipient", "purpose")),
            #: The feed read and the unread badge, which is polled on every authenticated screen
            #: in both apps. Ordering is `-created_at` from `Meta.ordering`, so this covers the
            #: filter and leaves only the sort.
            models.Index(fields=("recipient", "channel", "read_at")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("idempotency_key",),
                condition=~models.Q(idempotency_key=""),
                name="notifications_unique_intent_key",
            ),
            #: `Channel.IN_APP` is spelled literally because a nested `Meta` cannot see the
            #: enclosing class's own attributes, and the literal is what the migration records
            #: either way.
            models.CheckConstraint(
                condition=models.Q(read_at__isnull=True) | models.Q(channel="IN_APP"),
                name="notifications_only_in_app_is_read",
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
        SKIPPED = "SKIPPED", "Skipped"
        BLOCKED = "BLOCKED", "Blocked by kill switch"
        RATE_LIMITED = "RATE_LIMITED", "Rate limited"
        RETRYABLE = "RETRYABLE", "Retryable failure"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    intent = models.ForeignKey(
        NotificationIntent, on_delete=models.PROTECT, related_name="deliveries"
    )
    provider = models.CharField(max_length=40)
    status = models.CharField(max_length=20, choices=Status.choices)
    provider_message_id = models.CharField(max_length=140, blank=True)
    failure_code = models.SlugField(max_length=80, blank=True)
    app_id = models.CharField(max_length=64, blank=True, default="")
    request_payload = models.JSONField(default=dict, blank=True)
    response_status = models.IntegerField(null=True, blank=True)
    response_body = models.JSONField(default=dict, blank=True)
    metrics = models.JSONField(default=dict, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
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


class CustomerPushSubscription(models.Model):
    """Stores the verified OneSignal Web Push subscription state for customers."""

    class Platform(models.TextChoices):
        WEB = "WEB", "Web Browser"
        ANDROID = "ANDROID", "Android"
        IOS = "IOS", "iOS"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_push_subscriptions",
    )
    onesignal_subscription_id = models.CharField(
        max_length=64,
        unique=True,
        help_text="OneSignal Subscription ID (UUID).",
    )
    onesignal_external_id = models.CharField(
        max_length=64,
        db_index=True,
        help_text="OneSignal external_id alias (Customer User ID).",
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
    opted_in = models.BooleanField(
        default=True,
        help_text="OneSignal push subscription opt-in state.",
    )
    permission_state = models.CharField(
        max_length=16,
        blank=True,
        default="",
        help_text="Browser notification permission (granted, denied, default).",
    )
    last_verified_at = models.DateTimeField(default=timezone.now)
    last_sync_attempt_at = models.DateTimeField(default=timezone.now)
    last_sync_status = models.CharField(
        max_length=20,
        default="SUCCESS",
        help_text="Status of the last sync attempt (SUCCESS, FAILED).",
    )
    last_sync_error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        indexes = [
            models.Index(fields=("user", "is_active")),
            models.Index(fields=("onesignal_external_id", "is_active")),
            models.Index(fields=("user", "is_active", "opted_in", "last_verified_at")),
        ]

    def __str__(self) -> str:
        state = "ACTIVE" if self.is_active else "INACTIVE"
        return f"{self.user_id}:{self.onesignal_subscription_id}:{state}"


class PushNotificationPreference(models.Model):
    """User preference per push notification category.

    Maintains whether a Customer or Partner has opted in or out of specific push categories.
    Critical operational/security categories (e.g. ACCOUNT_SECURITY) are marked immutable
    and cannot be suppressed by the user.
    """

    class Role(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Customer"
        PARTNER = "PARTNER", "Partner"

    class Category(models.TextChoices):
        # Customer categories
        BOOKING_UPDATES = "BOOKING_UPDATES", "Booking Updates"
        DISPATCH_AND_ASSIGNMENT_UPDATES = (
            "DISPATCH_AND_ASSIGNMENT_UPDATES",
            "Dispatch & Assignment Updates",
        )
        ARRIVAL_AND_OTP_ALERTS = "ARRIVAL_AND_OTP_ALERTS", "Arrival & OTP Alerts"
        ACCOUNT_SECURITY = "ACCOUNT_SECURITY", "Account Security"
        OFFERS_AND_PROMOTIONS = "OFFERS_AND_PROMOTIONS", "Offers & Promotions"

        # Partner categories
        JOB_AND_DISPATCH_ALERTS = "JOB_AND_DISPATCH_ALERTS", "Job & Dispatch Alerts"
        SHIFT_AND_AVAILABILITY_REMINDERS = (
            "SHIFT_AND_AVAILABILITY_REMINDERS",
            "Shift & Availability Reminders",
        )
        PRODUCT_UPDATES = "PRODUCT_UPDATES", "Product Updates"

    CATEGORY_METADATA = {
        "CUSTOMER": {
            "BOOKING_UPDATES": {
                "label": "Booking Updates",
                "description": (
                    "Confirmations, rescheduling, and status changes for your active bookings."
                ),
                "is_mutable": True,
                "default_enabled": True,
            },
            "DISPATCH_AND_ASSIGNMENT_UPDATES": {
                "label": "Dispatch & Assignment Updates",
                "description": (
                    "Real-time alerts when a professional accepts and is assigned to your job."
                ),
                "is_mutable": True,
                "default_enabled": True,
            },
            "ARRIVAL_AND_OTP_ALERTS": {
                "label": "Arrival & OTP Alerts",
                "description": (
                    "Immediate notifications when your professional arrives with the start-work "
                    "code."
                ),
                "is_mutable": True,
                "default_enabled": True,
            },
            "ACCOUNT_SECURITY": {
                "label": "Account Security",
                "description": "Critical login alerts, password changes, and security notices.",
                "is_mutable": False,
                "default_enabled": True,
            },
            "OFFERS_AND_PROMOTIONS": {
                "label": "Offers & Promotions",
                "description": "Discounts, seasonal deals, and service recommendations.",
                "is_mutable": True,
                "default_enabled": False,
            },
        },
        "PARTNER": {
            "JOB_AND_DISPATCH_ALERTS": {
                "label": "Job & Dispatch Alerts",
                "description": (
                    "Instant booking dispatch offers nearby. Disabling may make you ineligible "
                    "for Instant dispatch."
                ),
                "is_mutable": True,
                "default_enabled": True,
            },
            "SHIFT_AND_AVAILABILITY_REMINDERS": {
                "label": "Shift & Availability Reminders",
                "description": "Reminders to go online before peak demand windows.",
                "is_mutable": True,
                "default_enabled": True,
            },
            "ACCOUNT_SECURITY": {
                "label": "Account Security",
                "description": (
                    "Critical login alerts, bank detail updates, and account verification notices."
                ),
                "is_mutable": False,
                "default_enabled": True,
            },
            "PRODUCT_UPDATES": {
                "label": "Product Updates",
                "description": (
                    "New partner features, app improvements, and operational guidelines."
                ),
                "is_mutable": True,
                "default_enabled": True,
            },
        },
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_preferences",
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    category = models.CharField(max_length=64, choices=Category.choices)
    is_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user", "role", "category"),
                name="unique_user_role_push_preference",
            ),
        ]
        indexes = [
            models.Index(fields=("user", "role", "category")),
        ]

    def __str__(self) -> str:
        state = "ENABLED" if self.is_enabled else "DISABLED"
        return f"{self.user_id}:{self.role}:{self.category}:{state}"

    @classmethod
    def is_category_enabled(cls, user: Any, role: str, category: str) -> bool:
        """Return whether a category is enabled for a user and role.

        ACCOUNT_SECURITY cannot be disabled.
        If a record does not exist, return the default for that category.
        """
        if category == cls.Category.ACCOUNT_SECURITY:
            return True

        role_meta = cls.CATEGORY_METADATA.get(role, {})
        cat_meta = role_meta.get(category, {})
        default_val = bool(cat_meta.get("default_enabled", True))

        pref = cls.objects.filter(user=user, role=role, category=category).first()
        if pref is not None:
            return pref.is_enabled
        return default_val
