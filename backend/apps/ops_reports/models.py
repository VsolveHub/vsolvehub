from django.conf import settings
from django.db import models


class OpsReportSettings(models.Model):
    """Singleton settings for operations reports."""

    id = models.CharField(primary_key=True, max_length=32, default="default")
    tds_rate_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="TDS rate (e.g. 1.00 for 1%) to apply on settlement reports. If unset, column is omitted.",
    )

    class Meta:
        verbose_name_plural = "Ops report settings"


class OpsReportPreset(models.Model):
    """Saved report preset for a specific operator."""

    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="report_presets"
    )
    name = models.CharField(max_length=255)
    report_id = models.CharField(max_length=64)
    filters_json = models.JSONField(default=dict)
    columns_json = models.JSONField(default=list, blank=True, help_text="Allow-list of columns")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)


class OpsDashboardPreference(models.Model):
    """Operator preference for pinned tiles on the home dashboard."""

    operator = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="dashboard_preference"
    )
    pinned_tiles = models.JSONField(
        default=list,
        help_text="List of tile IDs pinned by the operator. e.g. ['open_cases', 'overdue_bookings', 'captured_today', 'wallet_liability']",
    )
    updated_at = models.DateTimeField(auto_now=True)
