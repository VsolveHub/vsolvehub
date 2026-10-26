from typing import Any

from rest_framework import serializers

from .models import OpsDashboardPreference, OpsReportPreset


class OpsReportPresetSerializer(serializers.ModelSerializer[OpsReportPreset]):
    class Meta:
        model = OpsReportPreset
        fields = (
            "id",
            "name",
            "report_id",
            "filters_json",
            "columns_json",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
        )


class OpsDashboardPreferenceSerializer(serializers.ModelSerializer[OpsDashboardPreference]):
    class Meta:
        model = OpsDashboardPreference
        fields = (
            "pinned_tiles",
            "updated_at",
        )
        read_only_fields = ("updated_at",)


class OpsReportCatalogItemSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.CharField()
    name = serializers.CharField()
    filters = serializers.ListField(child=serializers.CharField())
    columns = serializers.ListField(child=serializers.CharField())


class OpsReportPreviewResponseSerializer(serializers.Serializer[dict[str, Any]]):
    report_id = serializers.CharField()
    name = serializers.CharField()
    filters_applied = serializers.DictField()
    columns = serializers.ListField(child=serializers.CharField())
    totals = serializers.DictField()
    rows = serializers.ListField(child=serializers.DictField())
    total_rows_count = serializers.IntegerField()
