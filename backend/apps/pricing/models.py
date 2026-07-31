"""Effective-dated server-owned service rates."""

import uuid

from django.db import models
from django.utils import timezone

from apps.catalog.models import ServiceVariant


class ServiceRate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="rates",
    )
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    effective_from = models.DateTimeField(default=timezone.now)
    effective_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-effective_from", "-created_at")
        indexes = [
            models.Index(fields=("variant", "is_active", "effective_from")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="pricing_service_rate_amount_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(effective_to__isnull=True)
                | models.Q(effective_to__gt=models.F("effective_from")),
                name="pricing_service_rate_valid_window",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.variant_id}: {self.currency} {self.amount_paise}"


class TaskRate(models.Model):
    """Effective-dated, server-owned A1 task pricing and duration inputs."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="task_rates",
    )
    task_code = models.SlugField(max_length=100)
    unit_price_paise = models.PositiveBigIntegerField()
    base_duration_minutes = models.PositiveSmallIntegerField(default=0)
    marginal_duration_minutes = models.PositiveSmallIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    effective_from = models.DateTimeField(default=timezone.now)
    effective_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-effective_from", "-created_at")
        indexes = [
            models.Index(fields=("variant", "task_code", "is_active", "effective_from")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("variant", "task_code", "effective_from"),
                name="pricing_unique_task_rate_version",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_price_paise__gt=0),
                name="pricing_task_rate_price_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(marginal_duration_minutes__gt=0),
                name="pricing_task_rate_marginal_duration_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(effective_to__isnull=True)
                | models.Q(effective_to__gt=models.F("effective_from")),
                name="pricing_task_rate_valid_window",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.variant_id}/{self.task_code}: {self.currency} {self.unit_price_paise}"


class PricingPolicy(models.Model):
    """Effective-dated Operations pricing inputs for A1 task visits."""

    class PlatformFeeMode(models.TextChoices):
        FIXED = "FIXED", "Fixed paise"
        PERCENTAGE = "PERCENTAGE", "Percentage basis points"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=100)
    version = models.PositiveIntegerField()
    minimum_service_subtotal_paise = models.PositiveBigIntegerField()
    gst_rate_basis_points = models.PositiveIntegerField()
    platform_fee_mode = models.CharField(max_length=16, choices=PlatformFeeMode.choices)
    platform_fee_value = models.PositiveBigIntegerField()
    commission_basis_points = models.PositiveIntegerField()
    commission_floor_paise = models.PositiveBigIntegerField()
    commission_cap_paise = models.PositiveBigIntegerField()
    effective_from = models.DateTimeField(default=timezone.now)
    effective_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-effective_from", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=("code", "version"),
                name="pricing_unique_policy_version",
            ),
            models.CheckConstraint(
                condition=models.Q(minimum_service_subtotal_paise__gt=0),
                name="pricing_policy_minimum_subtotal_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(gst_rate_basis_points__lte=10_000),
                name="pricing_policy_gst_rate_in_bounds",
            ),
            models.CheckConstraint(
                condition=models.Q(commission_basis_points__lte=10_000),
                name="pricing_policy_commission_rate_in_bounds",
            ),
            models.CheckConstraint(
                condition=models.Q(commission_cap_paise__gte=models.F("commission_floor_paise")),
                name="pricing_policy_commission_cap_gte_floor",
            ),
            models.CheckConstraint(
                condition=models.Q(effective_to__isnull=True)
                | models.Q(effective_to__gt=models.F("effective_from")),
                name="pricing_policy_valid_window",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code}:v{self.version}"
