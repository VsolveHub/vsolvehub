"""Identity persistence models.

Authentication policy belongs in services. Models enforce durable shape and uniqueness.
"""

import uuid
from typing import ClassVar

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

    objects = UserManager()

    USERNAME_FIELD = "phone_number"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    class Meta:
        ordering = ("-date_joined",)

    def clean(self) -> None:
        super().clean()
        self.phone_number = normalize_phone_number(self.phone_number)
        if self.email:
            self.email = self.__class__.objects.normalize_email(self.email)

    def __str__(self) -> str:
        return self.phone_number


class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("code",)

    def __str__(self) -> str:
        return self.code


class UserRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_profile",
    )
    display_name = models.CharField(max_length=100, blank=True)
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
    session_key_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    last_seen_at = models.DateTimeField(default=timezone.now)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("user", "revoked_at", "expires_at")),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.id}"
