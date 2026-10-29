import logging
from typing import Any, cast

from django.db.models import QuerySet
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, permissions
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.views import APIView

from apps.identity.models import User
from apps.partners.permissions import IsOperationsUser

from .dashboards import DASHBOARDS
from .exports import export_csv, export_pdf, export_xlsx
from .models import OpsDashboardPreference, OpsReportPreset
from .reports import (
    EXPORT_ROW_LIMIT,
    PREVIEW_MAX_PAGE_SIZE,
    PREVIEW_PAGE_SIZE,
    REPORTS_CATALOG,
    Report,
    get_report,
    partner_options,
)
from .serializers import (
    OpsDashboardPreferenceSerializer,
    OpsReportCatalogItemSerializer,
    OpsReportOptionSerializer,
    OpsReportPresetSerializer,
    OpsReportPreviewResponseSerializer,
)

logger = logging.getLogger(__name__)


REPORT_QUERY_PARAMETERS = [
    OpenApiParameter("date_start", OpenApiTypes.DATE, OpenApiParameter.QUERY),
    OpenApiParameter(
        "date_end", OpenApiTypes.DATE, OpenApiParameter.QUERY, description="Includes the whole day."
    ),
    OpenApiParameter(
        "q", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Search names and references."
    ),
    OpenApiParameter(
        "sort",
        OpenApiTypes.STR,
        OpenApiParameter.QUERY,
        description="A sortable column key; prefix `-` for descending. Default newest first.",
    ),
]


def _catalog_item(report: Report) -> dict[str, Any]:
    return {
        "id": report.id,
        "name": report.name,
        "group": report.group,
        "description": report.description,
        "filters": [
            {
                "key": f.key,
                "label": f.label,
                "kind": f.kind,
                "options": [vars(o) for o in f.choices()],
            }
            for f in report.filters
        ],
        "columns": _columns(report),
    }


def _columns(report: Report) -> list[dict[str, Any]]:
    return [
        {"key": c.key, "label": c.label, "kind": c.kind, "sortable": bool(c.sort)}
        for c in report.visible_columns()
    ]


def _report_or_404(report_id: str) -> Report:
    try:
        return get_report(report_id)
    except ValueError as exc:
        raise NotFound("No such report.") from exc


def _params(request: Request, report: Report) -> dict[str, str]:
    """The query values this report understands; anything else (an old preset key) is ignored."""
    keys = [*report.filter_keys(), "q", "sort"]
    return {key: request.query_params[key] for key in keys if request.query_params.get(key)}


def _window(request: Request) -> tuple[int, int]:
    def number(name: str, default: int) -> int:
        raw = (request.query_params.get(name) or "").strip()
        return int(raw) if raw.isdigit() else default

    limit = min(max(number("limit", PREVIEW_PAGE_SIZE), 1), PREVIEW_MAX_PAGE_SIZE)
    return limit, number("offset", 0)


class OpsReportsCatalogView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="List available operations reports",
        responses={200: OpsReportCatalogItemSerializer(many=True)},
        tags=["operations"],
    )
    def get(self, _request: Request) -> Response:
        items = [_catalog_item(report) for report in REPORTS_CATALOG.values()]
        return Response(items)


class OpsReportPartnerOptionsView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Partners for a report's partner filter",
        parameters=[
            OpenApiParameter(
                "q", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Name or phone."
            ),
            OpenApiParameter(
                "id",
                OpenApiTypes.UUID,
                OpenApiParameter.QUERY,
                description="Name an already chosen partner (from a link or saved filter).",
            ),
        ],
        responses={200: OpsReportOptionSerializer(many=True)},
        tags=["operations"],
    )
    def get(self, request: Request) -> Response:
        ids = request.query_params.getlist("id")
        options = partner_options(term=request.query_params.get("q", ""), ids=ids or None)
        return Response([vars(o) for o in options])


class OpsReportPreviewView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Preview operations report data",
        parameters=[
            *REPORT_QUERY_PARAMETERS,
            OpenApiParameter("limit", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("offset", OpenApiTypes.INT, OpenApiParameter.QUERY),
        ],
        responses={200: OpsReportPreviewResponseSerializer},
        tags=["operations"],
        description=(
            "One page of the report. Filters are the catalog's filter keys; a `choice` value"
            " outside its options is refused (`invalid_filter`)."
        ),
    )
    def get(self, request: Request, report_id: str) -> Response:
        report = _report_or_404(report_id)
        limit, offset = _window(request)
        rows, count, totals = report.page(_params(request, report), limit=limit, offset=offset)
        return Response(
            {
                "report_id": report.id,
                "name": report.name,
                "columns": _columns(report),
                "totals": totals,
                "rows": rows,
                "total_rows_count": count,
                "offset": offset,
                "limit": limit,
                "export_row_limit": EXPORT_ROW_LIMIT,
            }
        )


class OpsReportExportView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)
    export_format = "csv"  # Overridden in urls.py

    @extend_schema(exclude=True)
    def get(self, request: Request, report_id: str) -> HttpResponse:
        report = _report_or_404(report_id)
        params = _params(request, report)
        qs = report.query(params)
        count = qs.count()
        if count > EXPORT_ROW_LIMIT:
            # Refused, not cut short: a silently partial file reads as the whole period.
            raise ValidationError(
                {
                    "detail": [
                        f"This export has {count:,} rows; the most a file can hold is"
                        f" {EXPORT_ROW_LIMIT:,}. Choose a shorter date range."
                    ]
                },
                code="export_too_large",
            )
        rows = [report.row(obj) for obj in qs]
        columns = report.visible_columns()
        logger.info(
            "Operator %s exported report %s as %s", request.user.id, report.id, self.export_format
        )

        filename = _filename(report, params, self.export_format)
        if self.export_format == "csv":
            content, content_type = export_csv(columns, rows), "text/csv; charset=utf-8"
        elif self.export_format == "xlsx":
            content = export_xlsx(report.name, columns, rows)
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif self.export_format == "pdf":
            content = export_pdf(
                report.name,
                columns,
                rows,
                filters=_readable_filters(report, params),
                totals=report.totals(qs),
                operator_name=getattr(request.user, "full_name", "") or str(request.user),
            )
            content_type = "application/pdf"
        else:
            return HttpResponse("Invalid format", status=400)

        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


def _filename(report: Report, params: dict[str, str], extension: str) -> str:
    """`bookings_2026-10-01_to_2026-10-29.csv`: which report, which days."""
    start, end = params.get("date_start"), params.get("date_end")
    span = f"_{start or 'start'}_to_{end or 'today'}" if start or end else "_all_time"
    return f"{report.id}{span}.{extension}"


def _readable_filters(report: Report, params: dict[str, str]) -> dict[str, str]:
    """The filters in words for the PDF header: "Status: Confirmed", not `status=CONFIRMED`."""
    readable = {}
    for spec in report.filters:
        value = params.get(spec.key)
        if not value:
            continue
        if spec.kind == "choice":
            value = next((o.label for o in spec.choices() if o.value == value), value)
        elif spec.kind == "partner":
            value = next((o.label for o in partner_options(ids=[value])), value)
        readable[spec.label] = value
    if params.get("q"):
        readable["Search"] = params["q"]
    return readable


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
