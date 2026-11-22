"""Partner supply per service area: what Operations wants, and how it has moved.

Phase 2 of the Step 3 "Where you work" design (docs/onboarding-step3-flow/FLOW.md section 4).
The targets are Operations' own numbers. The snapshots are written weekly so the 12-week trend
does not have to be reconstructed from application history.
"""

import uuid

from django.conf import settings
from django.db import models

from apps.locations.models import ServiceArea

from .onboarding import Skill


class AreaSupplyTarget(models.Model):
    """How many approved partners Operations wants in an area, overall or for one trade.

    `skill` empty means the area as a whole. `alert_below` is an optional hard floor: below it
    the area is red whatever the ratio says.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.CASCADE,
        related_name="supply_targets",
    )
    skill = models.ForeignKey(
        Skill,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="area_supply_targets",
    )
    target_partners = models.PositiveIntegerField()
    alert_below = models.PositiveIntegerField(null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("service_area_id", "skill_id")
        constraints = [
            models.UniqueConstraint(
                fields=("service_area", "skill"),
                condition=models.Q(skill__isnull=False),
                name="partners_unique_area_trade_target",
            ),
            models.UniqueConstraint(
                fields=("service_area",),
                condition=models.Q(skill__isnull=True),
                name="partners_unique_area_overall_target",
            ),
            models.CheckConstraint(
                condition=models.Q(target_partners__gt=0),
                name="partners_area_target_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.service_area_id}:{self.skill_id or 'all'}={self.target_partners}"


class CoverageSnapshot(models.Model):
    """Approved partners covering an area in one week, overall (`skill` empty) or for one trade."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    week_start = models.DateField()
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.CASCADE,
        related_name="coverage_snapshots",
    )
    skill = models.ForeignKey(
        Skill,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="coverage_snapshots",
    )
    approved_partners = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("week_start", "service_area_id")
        constraints = [
            models.UniqueConstraint(
                fields=("week_start", "service_area", "skill"),
                condition=models.Q(skill__isnull=False),
                name="partners_unique_snapshot_area_trade_week",
            ),
            models.UniqueConstraint(
                fields=("week_start", "service_area"),
                condition=models.Q(skill__isnull=True),
                name="partners_unique_snapshot_area_week",
            ),
        ]
        indexes = [models.Index(fields=("service_area", "week_start"))]

    def __str__(self) -> str:
        return f"{self.week_start}:{self.service_area_id}:{self.approved_partners}"
