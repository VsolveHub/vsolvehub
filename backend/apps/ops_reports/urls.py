from django.urls import path

from .views import (
    OpsDashboardPreferenceView,
    OpsDashboardView,
    OpsReportExportView,
    OpsReportPresetDetailView,
    OpsReportPresetListCreateView,
    OpsReportPreviewView,
    OpsReportsCatalogView,
)

urlpatterns = [
    path("ops/reports/", OpsReportsCatalogView.as_view(), name="ops_reports_catalog"),
    path(
        "ops/reports/presets/", OpsReportPresetListCreateView.as_view(), name="ops_reports_presets"
    ),
    path(
        "ops/reports/presets/<int:pk>/",
        OpsReportPresetDetailView.as_view(),
        name="ops_reports_preset_detail",
    ),
    path("ops/reports/<str:report_id>/", OpsReportPreviewView.as_view(), name="ops_report_preview"),
    path(
        "ops/reports/<str:report_id>.csv",
        OpsReportExportView.as_view(export_format="csv"),
        name="ops_report_export_csv",
    ),
    path(
        "ops/reports/<str:report_id>.xlsx",
        OpsReportExportView.as_view(export_format="xlsx"),
        name="ops_report_export_xlsx",
    ),
    path(
        "ops/reports/<str:report_id>.pdf",
        OpsReportExportView.as_view(export_format="pdf"),
        name="ops_report_export_pdf",
    ),
    path("ops/dashboards/<str:kind>/", OpsDashboardView.as_view(), name="ops_dashboard_aggregates"),
    path(
        "ops/dashboard-preferences/",
        OpsDashboardPreferenceView.as_view(),
        name="ops_dashboard_preferences",
    ),
]
