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


class OpsReportOptionSerializer(serializers.Serializer[dict[str, Any]]):
    value = serializers.CharField()
    #: Shadows `Field.label`; harmless for a read-only response shape.
    label = serializers.CharField()  # type: ignore[assignment]
    #: Heading the option sits under in a dropdown (a service's category); may be empty.
    group = serializers.CharField(allow_blank=True)


class OpsReportFilterSerializer(serializers.Serializer[dict[str, Any]]):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    #: `date`, `choice` (pick from `options`) or `partner` (search `partner-options`).
    kind = serializers.ChoiceField(choices=("date", "choice", "partner"))
    options = OpsReportOptionSerializer(many=True)


class OpsReportColumnSerializer(serializers.Serializer[dict[str, Any]]):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    #: How to show the value: money is integer paise, dates are ISO 8601.
    kind = serializers.ChoiceField(choices=("text", "ref", "date", "money", "number", "status"))
    sortable = serializers.BooleanField()


class OpsReportTotalSerializer(serializers.Serializer[dict[str, Any]]):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    kind = serializers.ChoiceField(choices=("money", "number"))
    value = serializers.IntegerField()


class OpsReportCatalogItemSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.CharField()
    name = serializers.CharField()
    #: `Money`, `Services` or `Marketplace`: the heading the report sits under.
    group = serializers.CharField()
    description = serializers.CharField()
    filters = OpsReportFilterSerializer(many=True)
    columns = OpsReportColumnSerializer(many=True)


class OpsReportPreviewResponseSerializer(serializers.Serializer[dict[str, Any]]):
    report_id = serializers.CharField()
    name = serializers.CharField()
    columns = OpsReportColumnSerializer(many=True)
    #: Over every matching row, not just this page.
    totals = OpsReportTotalSerializer(many=True)
    #: Keyed by column `key`, plus `id`. Ready to show; money in paise.
    rows = serializers.ListField(child=serializers.DictField())
    total_rows_count = serializers.IntegerField()
    offset = serializers.IntegerField()
    limit = serializers.IntegerField()
    #: An export of more rows than this is refused (`export_too_large`).
    export_row_limit = serializers.IntegerField()
