"""Operations views for Service Areas, Area Requests, Partner Add Area, and Coverage Lite."""

from __future__ import annotations

import csv
import uuid
from typing import Any, cast

from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsOperationsUser
from apps.partners.serializers.operations_areas import (
    OperationsAreaRequestDismissSerializer,
    OperationsAreaRequestGroupSerializer,
    OperationsAreaRequestNotifyResultSerializer,
    OperationsAreaTargetsSerializer,
    OperationsAreaTargetsUpdateSerializer,
    OperationsBulkPinApplyResultSerializer,
    OperationsBulkPinApplySerializer,
    OperationsBulkPinPreviewResultSerializer,
    OperationsCoverageLiteSerializer,
    OperationsPartnerAddAreaSerializer,
    OperationsRecruitmentNeedSerializer,
    OperationsServiceAreaAddPinSerializer,
    OperationsServiceAreaCreateSerializer,
    OperationsServiceAreaDetailSerializer,
    OperationsServiceAreaListSerializer,
    OperationsServiceAreaToggleServiceSerializer,
    OperationsServiceAreaUpdateSerializer,
)
from apps.partners.services.operations_areas import (
    add_area_to_approved_partner,
    add_pin_to_service_area,
    apply_bulk_pins,
    create_service_area,
    dismiss_area_requests,
    get_operations_area_requests,
    get_operations_coverage_lite,
    get_operations_service_area_detail,
    get_operations_service_areas,
    notify_area_requests,
    preview_bulk_pins,
    remove_pin_from_service_area,
    toggle_service_area_service,
    update_service_area,
)
from apps.partners.services.supply import get_area_targets, recruitment_needs, set_area_targets
from apps.partners.views.base import _raise_api_error


class OperationsServiceAreaListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="List all service areas for operations",
        responses={200: OperationsServiceAreaListSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        del request
        areas = get_operations_service_areas()
        serializer = OperationsServiceAreaListSerializer(areas, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Create a new service area",
        request=OperationsServiceAreaCreateSerializer,
        responses={201: OperationsServiceAreaListSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = OperationsServiceAreaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            area = create_service_area(
                slug=serializer.validated_data["slug"],
                name=serializer.validated_data["name"],
                zone=serializer.validated_data.get("zone", ""),
                state_code=serializer.validated_data.get("state_code", ""),
                timezone_name=serializer.validated_data.get("timezone", "Asia/Kolkata"),
                is_accepting_partners=serializer.validated_data.get("is_accepting_partners", True),
                is_active=serializer.validated_data.get("is_active", True),
                actor=cast(User, request.user),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        detail = get_operations_service_area_detail(area.id)
        return Response(
            OperationsServiceAreaListSerializer(detail).data, status=status.HTTP_201_CREATED
        )


class OperationsServiceAreaDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Get service area detail including PINs and services",
        responses={200: OperationsServiceAreaDetailSerializer},
    )
    def get(self, request: Request, area_id: uuid.UUID) -> Response:
        del request
        try:
            area = get_operations_service_area_detail(area_id)
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(OperationsServiceAreaDetailSerializer(area).data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Update service area attributes",
        request=OperationsServiceAreaUpdateSerializer,
        responses={200: OperationsServiceAreaDetailSerializer},
    )
    def patch(self, request: Request, area_id: uuid.UUID) -> Response:
        serializer = OperationsServiceAreaUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            area = update_service_area(
                area_id=area_id,
                name=serializer.validated_data.get("name"),
                zone=serializer.validated_data.get("zone"),
                state_code=serializer.validated_data.get("state_code"),
                timezone_name=serializer.validated_data.get("timezone"),
                is_accepting_partners=serializer.validated_data.get("is_accepting_partners"),
                is_active=serializer.validated_data.get("is_active"),
                actor=cast(User, request.user),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(OperationsServiceAreaDetailSerializer(area).data, status=status.HTTP_200_OK)


class OperationsServiceAreaAddPinView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Add a postal code to a service area",
        request=OperationsServiceAreaAddPinSerializer,
        responses={201: OpenApiResponse(description="PIN linked successfully")},
    )
    def post(self, request: Request, area_id: uuid.UUID) -> Response:
        serializer = OperationsServiceAreaAddPinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            add_pin_to_service_area(
                area_id=area_id,
                postal_code=serializer.validated_data["postal_code"],
                city=serializer.validated_data.get("city", ""),
                state=serializer.validated_data.get("state", ""),
                actor=cast(User, request.user),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response({"status": "added"}, status=status.HTTP_201_CREATED)


class OperationsServiceAreaRemovePinView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Remove a postal code from a service area",
        responses={200: OpenApiResponse(description="PIN unlinked successfully")},
    )
    def delete(self, request: Request, area_id: uuid.UUID, postal_code: str) -> Response:
        del request
        try:
            removed = remove_pin_from_service_area(
                area_id=area_id,
                postal_code=postal_code,
                actor=None,
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response({"status": "removed", "unlinked": removed}, status=status.HTTP_200_OK)


class OperationsServiceAreaServiceToggleView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Toggle active status of a service variant in a service area",
        request=OperationsServiceAreaToggleServiceSerializer,
        responses={200: OpenApiResponse(description="Service variant status updated")},
    )
    def post(self, request: Request, area_id: uuid.UUID) -> Response:
        serializer = OperationsServiceAreaToggleServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            toggle_service_area_service(
                area_id=area_id,
                variant_id=serializer.validated_data.get("variant_id"),
                variant_ids=serializer.validated_data.get("variant_ids"),
                is_active=serializer.validated_data["is_active"],
                actor=cast(User, request.user),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response({"status": "updated"}, status=status.HTTP_200_OK)


class OperationsServiceAreaBulkPinPreviewView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Preview bulk PIN CSV upload",
        request=OperationsBulkPinApplySerializer,
        responses={200: OperationsBulkPinPreviewResultSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = OperationsBulkPinApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        csv_content = serializer.validated_data.get("csv_content", "")
        rows = serializer.validated_data.get("rows", [])
        result = preview_bulk_pins(csv_content=csv_content, rows=rows)
        return Response(
            OperationsBulkPinPreviewResultSerializer(result).data, status=status.HTTP_200_OK
        )


class OperationsServiceAreaBulkPinApplyView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Apply bulk PIN CSV upload with conflict resolutions",
        request=OperationsBulkPinApplySerializer,
        responses={200: OperationsBulkPinApplyResultSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = OperationsBulkPinApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        csv_content = serializer.validated_data.get("csv_content", "")
        rows = serializer.validated_data.get("rows", [])
        conflict_resolutions = serializer.validated_data.get("conflict_resolutions", {})
        result = apply_bulk_pins(
            csv_content=csv_content,
            rows=rows,
            conflict_resolutions=conflict_resolutions,
            actor=cast(User, request.user),
        )
        return Response(
            OperationsBulkPinApplyResultSerializer(result).data, status=status.HTTP_200_OK
        )


# --- Area Requests Views ---


class OperationsAreaRequestListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="List area requests grouped by PIN code",
        parameters=[
            OpenApiParameter(
                name="status",
                description="Status filter: WAITING, AREA_FULL, READY, DONE, NOT_VALID, ALL",
                required=False,
                type=str,
            ),
            OpenApiParameter(
                name="trade", description="Trade name filter", required=False, type=str
            ),
            OpenApiParameter(
                name="search", description="PIN or place search query", required=False, type=str
            ),
        ],
        responses={200: OperationsAreaRequestGroupSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        status_filter = request.query_params.get("status")
        trade_filter = request.query_params.get("trade")
        search = request.query_params.get("search", "")

        requests = get_operations_area_requests(
            status_filter=status_filter,
            trade_filter=trade_filter,
            search=search,
        )
        return Response(
            OperationsAreaRequestGroupSerializer(requests, many=True).data,
            status=status.HTTP_200_OK,
        )


class OperationsAreaRequestNotifyView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Notify partners who asked for a postal code",
        request=None,
        responses={200: OperationsAreaRequestNotifyResultSerializer},
    )
    def post(self, request: Request, postal_code: str) -> Response:
        try:
            result = notify_area_requests(
                postal_code=postal_code,
                actor=cast(User, request.user),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(
            OperationsAreaRequestNotifyResultSerializer(result).data, status=status.HTTP_200_OK
        )


class OperationsAreaRequestDismissView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Dismiss area request(s) ('Mark not valid')",
        request=OperationsAreaRequestDismissSerializer,
        responses={200: OpenApiResponse(description="Requests dismissed")},
    )
    def post(self, request: Request, postal_code: str) -> Response:
        serializer = OperationsAreaRequestDismissSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dismissed_count = dismiss_area_requests(
            postal_code=postal_code,
            application_id=serializer.validated_data.get("application_id"),
            actor=cast(User, request.user),
        )
        return Response(
            {"status": "dismissed", "count": dismissed_count}, status=status.HTTP_200_OK
        )


# --- Add Area to Approved Partner View ---


class OperationsPartnerAddAreaView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Add an area to an approved partner and copy their usual hours",
        request=OperationsPartnerAddAreaSerializer,
        responses={200: OpenApiResponse(description="Area added and schedule copied")},
    )
    def post(self, request: Request, partner_id: uuid.UUID) -> Response:
        serializer = OperationsPartnerAddAreaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = add_area_to_approved_partner(
                partner_id=partner_id,
                service_area_id=serializer.validated_data["service_area_id"],
                reason=serializer.validated_data.get("reason", "Area opened for partner"),
                actor=cast(User, request.user),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(result, status=status.HTTP_200_OK)


# --- Coverage Lite View ---


class CoverageCSVRenderer(BaseRenderer):
    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"

    def render(
        self,
        data: Any,
        accepted_media_type: str | None = None,
        renderer_context: Any = None,
    ) -> bytes | str:
        del accepted_media_type, renderer_context
        if isinstance(data, (bytes, str)):
            return data
        return ""


class OperationsCoverageLiteView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)
    renderer_classes = (JSONRenderer, CoverageCSVRenderer)

    @extend_schema(
        summary="Coverage lite report across areas, zones and trades",
        parameters=[
            OpenApiParameter(name="zone", description="Zone filter", required=False, type=str),
            OpenApiParameter(name="trade", description="Trade filter", required=False, type=str),
            OpenApiParameter(
                name="format", description="Export format: json or csv", required=False, type=str
            ),
        ],
        responses={200: OperationsCoverageLiteSerializer},
    )
    def get(self, request: Request) -> Response | HttpResponse:
        zone_filter = request.query_params.get("zone")
        trade_filter = request.query_params.get("trade")
        renderer_format = getattr(getattr(request, "accepted_renderer", None), "format", None)
        fmt = (
            renderer_format
            or request.query_params.get("format")
            or request.query_params.get("export")
            or "json"
        ).lower()

        data = get_operations_coverage_lite(
            zone_filter=zone_filter,
            trade_filter=trade_filter,
        )

        if fmt == "csv":
            response = HttpResponse(content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = 'attachment; filename="coverage-lite.csv"'
            writer = csv.writer(response)
            writer.writerow(
                [
                    "Zone",
                    "Area Name",
                    "Slug",
                    "Active",
                    "Accepting",
                    "PINs Count",
                    "PINs",
                    "Approved Partners",
                    "Target",
                    "Flag",
                    "Open Asked PINs",
                    "Customers Turned Away 28d",
                    "Bookings 28d",
                    "Expired Offers 28d",
                ]
            )
            for area in data["areas"]:
                approved_count = area["partner_counts"].get("APPROVED", 0)
                writer.writerow(
                    [
                        area["zone"] or "-",
                        area["name"],
                        area["slug"],
                        "Yes" if area["is_active"] else "No",
                        "Yes" if area["is_accepting_partners"] else "No",
                        len(area["postal_codes"]),
                        " ".join(area["postal_codes"]),
                        approved_count,
                        area["target_partners"] if area["target_partners"] is not None else "",
                        area["flag"],
                        area["open_asked_pins_count"],
                        area["turned_away_28d_count"],
                        area["bookings_28d_count"],
                        area["offer_expiries_28d_count"],
                    ]
                )
            return response

        return Response(OperationsCoverageLiteSerializer(data).data, status=status.HTTP_200_OK)


# --- Supply targets and recruitment (Phase 2) ---


class OperationsServiceAreaTargetsView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="An area's supply targets and how many approved partners it has against them",
        responses={200: OperationsAreaTargetsSerializer},
    )
    def get(self, _request: Request, area_id: uuid.UUID) -> Response:
        try:
            result = get_area_targets(area_id)
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(OperationsAreaTargetsSerializer(result).data)

    @extend_schema(
        summary="Replace an area's supply targets (empty or zero removes one)",
        request=OperationsAreaTargetsUpdateSerializer,
        responses={200: OperationsAreaTargetsSerializer},
    )
    def put(self, request: Request, area_id: uuid.UUID) -> Response:
        serializer = OperationsAreaTargetsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = set_area_targets(
                area_id=area_id,
                overall=serializer.validated_data.get("overall"),
                trades=serializer.validated_data.get("trades", []),
                actor=cast(User, request.user),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(OperationsAreaTargetsSerializer(result).data)


class OperationsRecruitmentPushView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)
    renderer_classes = (JSONRenderer, CoverageCSVRenderer)

    @extend_schema(
        summary="Red and amber areas to recruit for, with a tagged apply link each",
        parameters=[
            OpenApiParameter(name="zone", description="Zone filter", required=False, type=str),
            OpenApiParameter(
                name="format", description="Export format: json or csv", required=False, type=str
            ),
        ],
        responses={200: OperationsRecruitmentNeedSerializer(many=True)},
    )
    def get(self, request: Request) -> Response | HttpResponse:
        needs = recruitment_needs(zone=request.query_params.get("zone"))
        renderer_format = getattr(getattr(request, "accepted_renderer", None), "format", None)
        fmt = (renderer_format or request.query_params.get("format") or "json").lower()
        if fmt == "csv":
            response = HttpResponse(content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = 'attachment; filename="recruitment-push.csv"'
            writer = csv.writer(response)
            writer.writerow(
                [
                    "Zone",
                    "Area",
                    "Flag",
                    "Approved",
                    "Target",
                    "Shortfall",
                    "Trades short",
                    "Open asked PINs",
                    "Customers turned away (28d)",
                    "Apply link",
                ]
            )
            for need in needs:
                gaps = "; ".join(
                    f"{gap['skill_name']} {gap['approved_partners']}/{gap['target_partners']}"
                    for gap in need["trade_gaps"]
                )
                writer.writerow(
                    [
                        need["zone"] or "-",
                        need["name"],
                        need["flag"],
                        need["approved_partners"],
                        need["target_partners"] if need["target_partners"] is not None else "",
                        need["shortfall"],
                        gaps,
                        need["open_asked_pins_count"],
                        need["turned_away_28d_count"],
                        need["apply_link"],
                    ]
                )
            return response
        return Response(OperationsRecruitmentNeedSerializer(needs, many=True).data)
