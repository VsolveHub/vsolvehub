from django.urls import path

from .customer_views import (
    OperationsCustomerBlockView,
    OperationsCustomerCollectionView,
    OperationsCustomerDetailView,
    OperationsPartnerActivityView,
)
from .views import (
    OpsDashboardPreferenceView,
    OpsDashboardView,
    OpsReportExportView,
    OpsReportPartnerOptionsView,
    OpsReportPresetDetailView,
    OpsReportPresetListCreateView,
    OpsReportPreviewView,
    OpsReportsCatalogView,
)

urlpatterns = [
    path(
        "operations/customers/",
        OperationsCustomerCollectionView.as_view(),
        name="operations_customers",
    ),
    path(
        "operations/customers/<uuid:customer_id>/",
        OperationsCustomerDetailView.as_view(),
        name="operations_customer",
    ),
    path(
        "operations/partners/<uuid:partner_id>/activity/",
        OperationsPartnerActivityView.as_view(),
        name="operations_partner_activity",
    ),
    path(
        "operations/customers/<uuid:customer_id>/block/",
        OperationsCustomerBlockView.as_view(),
        name="operations_customer_block",
    ),
    path("ops/reports/", OpsReportsCatalogView.as_view(), name="ops_reports_catalog"),
    path(
        "ops/reports/presets/", OpsReportPresetListCreateView.as_view(), name="ops_reports_presets"
    ),
    path(
        "ops/reports/presets/<int:pk>/",
        OpsReportPresetDetailView.as_view(),
        name="ops_reports_preset_detail",
    ),
    path(
        "ops/reports/partner-options/",
        OpsReportPartnerOptionsView.as_view(),
        name="ops_reports_partner_options",
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
