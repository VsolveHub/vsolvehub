"""Identity persistence models.

Authentication policy belongs in services. Models enforce durable shape and uniqueness.
"""

import uuid
from typing import Any, ClassVar

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.identity.managers import UserManager
from apps.identity.phone import normalize_phone_number


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_number = models.CharField(max_length=16, unique=True)
    email = models.EmailField(blank=True)
    full_name = models.CharField(max_length=150, blank=True)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    customer_profile: Any
    communication_preferences: Any
    privacy_requests: Any

    objects: UserManager = UserManager()

    USERNAME_FIELD = "phone_number"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    class Meta:
        ordering = ("-date_joined",)

    def clean(self) -> None:
        super().clean()
        self.phone_number = normalize_phone_number(self.phone_number)
        if self.email:
            self.email = self.__class__.objects.normalize_email(self.email)

    def save(self, *args: Any, **kwargs: Any) -> None:
        # `clean()` only runs via `full_clean()`, which `update_or_create()` and other raw
        # `save()` callers skip. Normalizing here too means no code path — seed scripts
        # included — can persist a phone number libphonenumber wouldn't accept.
        self.phone_number = normalize_phone_number(self.phone_number)
        if self.email:
            self.email = self.__class__.objects.normalize_email(self.email)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.phone_number


class AdminPermission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=100, unique=True)
    name = models.CharField(max_length=150)
    category = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("category", "code")

    def __str__(self) -> str:
        return f"{self.category}:{self.code}"


class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False)
    permissions = models.ManyToManyField(AdminPermission, blank=True, related_name="roles")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("code",)

    def __str__(self) -> str:
        return self.code


class UserRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id: uuid.UUID
    role_id: uuid.UUID
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.ForeignKey(Role, on_delete=models.PROTECT)
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="role_grants_made",
    )
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user", "role"),
                condition=models.Q(revoked_at__isnull=True),
                name="identity_unique_active_user_role",
            ),
        ]
        indexes = [
            models.Index(fields=("user", "revoked_at")),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.role_id}"


class CustomerProfile(models.Model):
    class AccountStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        BLACKLISTED = "BLACKLISTED", "Blacklisted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id: uuid.UUID
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_profile",
    )
    display_name = models.CharField(max_length=100, blank=True)
    is_student_verified = models.BooleanField(default=False)
    referral_code = models.CharField(max_length=20, blank=True)
    v_coins_balance = models.PositiveIntegerField(default=100)
    account_status = models.CharField(
        max_length=20,
        choices=AccountStatus.choices,
        default=AccountStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.display_name or str(self.user_id)


class OtpChallenge(models.Model):
    class Purpose(models.TextChoices):
        LOGIN = "LOGIN", "Login"
        PHONE_VERIFICATION = "PHONE_VERIFICATION", "Phone verification"

    class DeliveryStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_number = models.CharField(max_length=16)
    purpose = models.CharField(max_length=32, choices=Purpose.choices)
    code_hash = models.CharField(max_length=255)
    request_ip_hash = models.CharField(max_length=64)
    device_hash = models.CharField(max_length=64, blank=True)
    delivery_status = models.CharField(
        max_length=16,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.PENDING,
    )
    delivered_at = models.DateTimeField(null=True, blank=True)
    delivery_failure_code = models.CharField(max_length=64, blank=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("phone_number", "purpose", "created_at")),
            models.Index(fields=("request_ip_hash", "created_at")),
            models.Index(fields=("expires_at", "consumed_at")),
        ]

    def __str__(self) -> str:
        return f"{self.phone_number}:{self.purpose}:{self.created_at.isoformat()}"

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    @property
    def is_locked(self) -> bool:
        return self.failed_attempts >= self.max_attempts


class Device(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="devices",
    )
    fingerprint_hash = models.CharField(max_length=64)
    label = models.CharField(max_length=100, blank=True)
    last_seen_at = models.DateTimeField(default=timezone.now)
    trusted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user", "fingerprint_hash"),
                name="identity_unique_user_device",
            ),
        ]
        indexes = [
            models.Index(fields=("user", "revoked_at")),
        ]

    def __str__(self) -> str:
        return self.label or f"Device {self.id}"


class UserSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id: uuid.UUID
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="auth_sessions",
    )
    device = models.ForeignKey(
        Device,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sessions",
    )
    active_role = models.ForeignKey(
        Role,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="active_sessions",
    )
    session_key_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    last_seen_at = models.DateTimeField(default=timezone.now)
    stepped_up_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("user", "revoked_at", "expires_at")),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.id}"


class ConsentReceipt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id: uuid.UUID
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="consent_receipts",
    )
    purpose = models.SlugField(max_length=100)
    policy_version = models.CharField(max_length=100)
    accepted_at = models.DateTimeField(default=timezone.now)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=64, default="api")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-accepted_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("user", "purpose", "policy_version"),
                name="identity_unique_consent_receipt_version",
            ),
        ]
        indexes = [models.Index(fields=("user", "purpose", "withdrawn_at"))]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.purpose}:{self.policy_version}"


class CommunicationPreference(models.Model):
    class Channel(models.TextChoices):
        SMS = "SMS", "SMS"
        EMAIL = "EMAIL", "Email"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id: uuid.UUID
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="communication_preferences",
    )
    channel = models.CharField(max_length=16, choices=Channel.choices)
    purpose = models.SlugField(max_length=100)
    is_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user", "channel", "purpose"),
                name="identity_unique_communication_preference",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.channel}:{self.purpose}"


class PrivacyRequest(models.Model):
    class Kind(models.TextChoices):
        ACCESS = "ACCESS", "Access"
        ERASURE = "ERASURE", "Erasure"

    class Status(models.TextChoices):
        RECEIVED = "RECEIVED", "Received"
        IN_REVIEW = "IN_REVIEW", "In review"
        COMPLETED = "COMPLETED", "Completed"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id: uuid.UUID
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="privacy_requests",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RECEIVED)
    requested_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ("-requested_at",)
        indexes = [models.Index(fields=("status", "requested_at"))]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.kind}:{self.status}"


class AccessAuditEvent(models.Model):
    class Decision(models.TextChoices):
        ALLOWED = "ALLOWED", "Allowed"
        DENIED = "DENIED", "Denied"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="access_audit_events",
    )
    subject_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="access_events_about",
    )
    action = models.CharField(max_length=120)
    object_type = models.CharField(max_length=100, blank=True)
    object_id = models.UUIDField(null=True, blank=True)
    decision = models.CharField(max_length=16, choices=Decision.choices)
    request_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("actor", "created_at")),
            models.Index(fields=("subject_user", "created_at")),
            models.Index(fields=("action", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.action}:{self.decision}:{self.id}"


class AdminAuditLog(models.Model):
    class ActionType(models.TextChoices):
        CREATE = "CREATE", "Create"
        UPDATE = "UPDATE", "Update"
        DELETE = "DELETE", "Delete"
        APPROVE = "APPROVE", "Approve"
        REJECT = "REJECT", "Reject"
        OVERRIDE = "OVERRIDE", "Override"
        EXPORT = "EXPORT", "Export"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="admin_audit_logs",
    )
    actor_phone = models.CharField(max_length=16, blank=True)
    actor_role = models.CharField(max_length=64, blank=True)
    target_entity_type = models.CharField(max_length=100, db_index=True)
    target_entity_id = models.CharField(max_length=120, blank=True, db_index=True)
    action_type = models.CharField(max_length=20, choices=ActionType.choices, default=ActionType.UPDATE)
    summary = models.CharField(max_length=255, blank=True)
    old_value_json = models.JSONField(default=dict, blank=True)
    new_value_json = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ("-timestamp",)
        indexes = [
            models.Index(fields=("target_entity_type", "target_entity_id")),
            models.Index(fields=("actor", "timestamp")),
            models.Index(fields=("action_type", "timestamp")),
        ]

    def __str__(self) -> str:
        return f"{self.timestamp.isoformat()}:{self.actor_role}:{self.action_type}:{self.target_entity_type}"


class DualAuthorizationRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        EXPIRED = "EXPIRED", "Expired"
        EXECUTED = "EXECUTED", "Executed"

    class ActionType(models.TextChoices):
        REFUND_OVER_LIMIT = "REFUND_OVER_LIMIT", "High-Value Refund (>₹10,000)"
        FEE_RESTRUCTURE = "FEE_RESTRUCTURE", "Platform Fee / Commission Restructure"
        MASS_SUSPENSION = "MASS_SUSPENSION", "Mass Account Suspension"
        KILL_SWITCH = "KILL_SWITCH", "System Kill Switch Activation"
        OTHER = "OTHER", "Sensitive Operational Override"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="dual_auth_requested",
    )
    action_type = models.CharField(max_length=32, choices=ActionType.choices)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    first_approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="dual_auth_first_approvals",
    )
    first_approved_at = models.DateTimeField(null=True, blank=True)
    second_approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="dual_auth_second_approvals",
    )
    second_approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="dual_auth_rejections",
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("status", "created_at")),
            models.Index(fields=("action_type", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"


class ConfigVersionHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    config_key = models.SlugField(max_length=100, db_index=True)
    version_number = models.PositiveIntegerField()
    schema_snapshot = models.JSONField(default=dict)
    change_summary = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="config_versions_authored",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("-version_number",)
        constraints = [
            models.UniqueConstraint(
                fields=("config_key", "version_number"),
                name="identity_unique_config_version",
            ),
        ]
        indexes = [
            models.Index(fields=("config_key", "is_active")),
        ]

    def __str__(self) -> str:
        return f"{self.config_key}:v{self.version_number}"


class PricingModelConfig(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    name = models.CharField(max_length=128)
    formula = models.CharField(max_length=256)
    applicable_to = models.CharField(max_length=256)
    base_rate_inr = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    surge_multiplier = models.DecimalField(max_digits=5, decimal_places=2, default=1.0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("id",)

    def __str__(self) -> str:
        return self.name


class CommissionRule(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    category = models.CharField(max_length=128)
    type = models.CharField(max_length=32, default="PERCENTAGE")
    rate = models.CharField(max_length=64)
    slab_notes = models.TextField(blank=True)
    gst_applicable = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("category",)

    def __str__(self) -> str:
        return f"{self.category} ({self.rate})"


class PartnerRankingConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    weights_json = models.JSONField(default=dict)
    decay_factor_days = models.PositiveIntegerField(default=30)
    min_jobs_for_ranking = models.PositiveIntegerField(default=5)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)


class VCoinsTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        CustomerProfile,
        on_delete=models.CASCADE,
        related_name="v_coins_ledger",
    )
    amount = models.IntegerField()
    transaction_type = models.CharField(max_length=32, default="MANUAL_ADJUSTMENT")
    balance_after = models.PositiveIntegerField()
    reason = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class MarketingCoupon(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=32, unique=True)
    discount_type = models.CharField(max_length=16, default="PERCENTAGE")
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    min_order_inr = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    budget_cap_inr = models.DecimalField(max_digits=12, decimal_places=2, default=50000.0)
    used_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.code


class NotificationTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    channel = models.CharField(max_length=16, default="PUSH")
    name = models.CharField(max_length=128, unique=True)
    title = models.CharField(max_length=256, blank=True)
    body = models.TextField()
    variables_json = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("channel", "name")

    def __str__(self) -> str:
        return f"[{self.channel}] {self.name}"


class CMSBanner(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=128)
    surface = models.CharField(max_length=32, default="CUSTOMER_APP")
    image_url = models.CharField(max_length=512)
    target_url = models.CharField(max_length=256, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("surface", "display_order", "-created_at")

    def __str__(self) -> str:
        return f"{self.surface}: {self.title}"


class RiskAnomaly(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    target_type = models.CharField(max_length=32, default="CUSTOMER")
    target_identifier = models.CharField(max_length=128)
    anomaly_type = models.CharField(max_length=64)
    severity = models.CharField(max_length=16, default="HIGH")
    details = models.TextField()
    status = models.CharField(max_length=16, default="OPEN")
    detected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-detected_at",)

    def __str__(self) -> str:
        return f"{self.severity}: {self.anomaly_type} ({self.target_identifier})"


class FeatureFlagConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=64, unique=True)
    description = models.TextField()
    is_enabled = models.BooleanField(default=True)
    rollout_percentage = models.PositiveIntegerField(default=100)
    target_city = models.CharField(max_length=64, default="ALL")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("key",)

    def __str__(self) -> str:
        return f"{self.key}: {'ON' if self.is_enabled else 'OFF'}"


class AppVersionPolicy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_platform = models.CharField(max_length=32, unique=True)
    current_version = models.CharField(max_length=32)
    min_supported_version = models.CharField(max_length=32)
    force_update = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("client_platform",)

    def __str__(self) -> str:
        return f"{self.client_platform}: {self.current_version}"


