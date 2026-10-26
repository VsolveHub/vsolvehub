import logging
from typing import cast

from django.db.models import QuerySet
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.views import APIView

from apps.identity.models import User
from apps.partners.permissions import IsOperationsUser

from .dashboards import DASHBOARDS
from .exports import export_csv, export_pdf, export_xlsx
from .models import OpsDashboardPreference, OpsReportPreset, OpsReportSettings
from .reports import REPORTS_CATALOG, SettlementReport, get_report
from .serializers import (
    OpsDashboardPreferenceSerializer,
    OpsReportCatalogItemSerializer,
    OpsReportPresetSerializer,
    OpsReportPreviewResponseSerializer,
)

logger = logging.getLogger(__name__)


class OpsReportsCatalogView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="List available operations reports",
        responses={200: OpsReportCatalogItemSerializer(many=True)},
        tags=["operations"],
    )
    def get(self, _request: Request) -> Response:
        settings = OpsReportSettings.objects.first()
        tds_rate = settings.tds_rate_percent if settings and settings.tds_rate_percent else None

        catalog = []
        for r in REPORTS_CATALOG.values():
            cols = r.columns
            if isinstance(r, SettlementReport) and tds_rate is None:
                cols = [c for c in cols if c != "tds_paise"]

            catalog.append({"id": r.id, "name": r.name, "filters": r.filters, "columns": cols})
        return Response(catalog)


class OpsReportPreviewView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Preview operations report data",
        responses={200: OpsReportPreviewResponseSerializer},
        tags=["operations"],
    )
    def get(self, request: Request, report_id: str) -> Response:
        try:
            report = get_report(report_id)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_404_NOT_FOUND)

        filters = {
            f: request.query_params.get(f) for f in report.filters if request.query_params.get(f)
        }
        rows, totals = report.execute(filters)

        settings = OpsReportSettings.objects.first()
        tds_rate = settings.tds_rate_percent if settings and settings.tds_rate_percent else None
        cols = report.columns
        if isinstance(report, SettlementReport) and tds_rate is None:
            cols = [c for c in cols if c != "tds_paise"]

        page = rows[:50]

        return Response(
            {
                "report_id": report.id,
                "name": report.name,
                "filters_applied": filters,
                "columns": cols,
                "totals": totals,
                "rows": page,
                "total_rows_count": len(rows),
            }
        )


class OpsReportExportView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)
    export_format = "csv"  # Overridden in urls.py

    @extend_schema(exclude=True)
    def get(self, request: Request, report_id: str) -> HttpResponse:
        try:
            report = get_report(report_id)
        except ValueError as e:
            return HttpResponse(str(e), status=status.HTTP_404_NOT_FOUND)

        filters = {
            f: request.query_params.get(f) for f in report.filters if request.query_params.get(f)
        }
        rows, totals = report.execute(filters)

        operator_name = getattr(request.user, "full_name", str(request.user))

        settings = OpsReportSettings.objects.first()
        tds_rate = settings.tds_rate_percent if settings and settings.tds_rate_percent else None
        cols = report.columns
        if isinstance(report, SettlementReport) and tds_rate is None:
            cols = [c for c in cols if c != "tds_paise"]

        logger.info(
            f"Operator {request.user.id} exported report {report_id} as {self.export_format}"
        )

        if self.export_format == "csv":
            content = export_csv(report.name, cols, rows)
            content_type = "text/csv"
            filename = f"{report.id}.csv"
        elif self.export_format == "xlsx":
            content = export_xlsx(report.name, cols, rows)
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = f"{report.id}.xlsx"
        elif self.export_format == "pdf":
            content = export_pdf(
                report.name,
                cols,
                rows,
                filters=filters,
                totals=totals,
                operator_name=operator_name,
            )
            content_type = "application/pdf"
            filename = f"{report.id}.pdf"
        else:
            return HttpResponse("Invalid format", status=400)

        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class OpsDashboardView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Get dashboard aggregates",
        parameters=[
            OpenApiParameter(
                "date_start", OpenApiTypes.DATE, OpenApiParameter.QUERY, description="Inclusive."
            ),
            OpenApiParameter(
                "date_end", OpenApiTypes.DATE, OpenApiParameter.QUERY, description="Inclusive."
            ),
        ],
        responses={200: dict},
        tags=["operations"],
        description=(
            "Totals for the range. The overview and customer kinds add `series`, one point per"
            " day (or per week past 62 days, capped at 366 days; the last 30 days when no range"
            " is given), with `series_granularity` saying which."
        ),
    )
    def get(self, request: Request, kind: str) -> Response:
        if kind not in DASHBOARDS:
            raise NotFound("Dashboard kind not found")

        filters = {
            "date_start": request.query_params.get("date_start"),
            "date_end": request.query_params.get("date_end"),
            "service": request.query_params.get("service"),
        }
        data = DASHBOARDS[kind](filters)
        return Response(data)


class OpsReportPresetListCreateView(generics.ListCreateAPIView[OpsReportPreset]):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)
    serializer_class = OpsReportPresetSerializer

    def get_queryset(self) -> QuerySet[OpsReportPreset]:
        return OpsReportPreset.objects.filter(operator=cast(User, self.request.user))

    def perform_create(self, serializer: BaseSerializer[OpsReportPreset]) -> None:
        serializer.save(operator=self.request.user)


class OpsReportPresetDetailView(generics.RetrieveUpdateDestroyAPIView[OpsReportPreset]):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)
    serializer_class = OpsReportPresetSerializer

    def get_queryset(self) -> QuerySet[OpsReportPreset]:
        return OpsReportPreset.objects.filter(operator=cast(User, self.request.user))


class OpsDashboardPreferenceView(generics.RetrieveUpdateAPIView[OpsDashboardPreference]):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)
    serializer_class = OpsDashboardPreferenceSerializer

    def get_object(self) -> OpsDashboardPreference:
        obj, _created = OpsDashboardPreference.objects.get_or_create(
            operator=cast(User, self.request.user)
        )
        return obj
