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
