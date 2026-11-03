"""The Workforce & projects list: every crew (A3) and project (A5) request, not only stuck ones.

The queue board shows requests already past a deadline. Operations also needs to find any one
request — a customer on the phone, a vendor asking about a job — so this is the plain list with
search and filters, and the row says who is engaged and what it is worth.
"""

import uuid
from typing import Any, cast

from django.db.models import Q, QuerySet
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant
from apps.partners.permissions import IsOperationsUser
from apps.requirements.models import CustomerRequirement
from common.errors.serializers import ApiErrorSerializer
from common.pagination import (
    CURSOR_PARAMETER,
    STATUS_PARAMETER,
    OperationsNewestFirstPagination,
    filter_statuses,
    page_serializer,
    paginated,
)

ARCHETYPES = (
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
)
#: Statuses that are finished, so the list can offer "open" as one filter.
CLOSED_STATUSES = tuple(
    value for value in CustomerRequirement.Status.values if value.startswith("CLOSED_")
)


class OperationsRequestRowSerializer(serializers.ModelSerializer[CustomerRequirement]):
    service_name = serializers.SerializerMethodField()
    area = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    engagement_id = serializers.SerializerMethodField()
    engagement_status = serializers.SerializerMethodField()
    vendor_display_name = serializers.SerializerMethodField()
    engagement_total_paise = serializers.SerializerMethodField()

    class Meta:
        model = CustomerRequirement
        fields = (
            "id",
            "status",
            "archetype",
            "service_name",
            "area",
            "customer_name",
            "customer_phone",
            "requested_start",
            "submitted_at",
            "quotes_due_at",
            "closed_at",
            "created_at",
            "engagement_id",
            "engagement_status",
            "vendor_display_name",
            "engagement_total_paise",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.CharField())
    def get_service_name(self, instance: CustomerRequirement) -> str:
        variant = instance.variant
        return f"{variant.service.name} · {variant.name}" if variant.name else variant.service.name

    @extend_schema_field(serializers.CharField())
    def get_area(self, instance: CustomerRequirement) -> str:
        return instance.service_area.name if instance.service_area is not None else ""

    @extend_schema_field(serializers.CharField())
    def get_customer_name(self, instance: CustomerRequirement) -> str:
        return instance.customer.full_name

    @extend_schema_field(serializers.CharField())
    def get_customer_phone(self, instance: CustomerRequirement) -> str:
        return instance.customer.phone_number

    def _engagement(self, instance: CustomerRequirement) -> Any:
        return getattr(instance, "engagement", None)

    @extend_schema_field(serializers.UUIDField(allow_null=True))
    def get_engagement_id(self, instance: CustomerRequirement) -> Any:
        engagement = self._engagement(instance)
        return engagement.id if engagement is not None else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_engagement_status(self, instance: CustomerRequirement) -> str | None:
        engagement = self._engagement(instance)
        return engagement.status if engagement is not None else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_vendor_display_name(self, instance: CustomerRequirement) -> str | None:
        engagement = self._engagement(instance)
        return engagement.partner.display_name if engagement is not None else None

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_engagement_total_paise(self, instance: CustomerRequirement) -> int | None:
        engagement = self._engagement(instance)
        return int(engagement.total_paise) if engagement is not None else None


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def operations_request_rows(request: Request) -> QuerySet[CustomerRequirement]:
    """Every crew and project request, narrowed by the list's filters. Exported for tests.

    `?status=` one state or several; `?open=true` everything not closed; `?archetype=` crew
    (`A3_TIME_BLOCK`) or project (`A5_CUSTOM_PROJECT`); `?q=` the customer's name or phone, the
    engaged vendor's name, or a request id.
    """
    rows = CustomerRequirement.objects.filter(archetype__in=ARCHETYPES).select_related(
        "customer",
        "variant__service",
        "service_area",
        "engagement__partner",
    )
    rows = cast(
        QuerySet[CustomerRequirement],
        filter_statuses(rows, request, CustomerRequirement.Status.values),
    )
    if (request.query_params.get("open") or "").strip().lower() == "true":
        rows = rows.exclude(status__in=CLOSED_STATUSES)
    archetype = (request.query_params.get("archetype") or "").strip().upper()
    if archetype:
        if archetype not in ARCHETYPES:
            raise serializers.ValidationError(
                {"archetype": [f"Choose one of: {', '.join(ARCHETYPES)}."]}
            )
        rows = rows.filter(archetype=archetype)
    query = (request.query_params.get("q") or "").strip()
    if query:
        match = (
            Q(customer__full_name__icontains=query)
            | Q(customer__phone_number__icontains=query)
            | Q(engagement__partner__display_name__icontains=query)
        )
        if _is_uuid(query):
            match |= Q(id=query) | Q(engagement__id=query)
        rows = rows.filter(match)
    return rows


class OperationsRequestCollectionView(APIView):
    """Every crew and project request, newest first."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_requests_list",
        parameters=[
            STATUS_PARAMETER,
            OpenApiParameter(
                "open",
                OpenApiTypes.BOOL,
                OpenApiParameter.QUERY,
                description="Only requests that are not closed.",
            ),
            OpenApiParameter(
                "archetype",
                OpenApiTypes.STR,
                OpenApiParameter.QUERY,
                enum=list(ARCHETYPES),
                description="Crew hire (A3_TIME_BLOCK) or custom project (A5_CUSTOM_PROJECT).",
            ),
            OpenApiParameter("q", OpenApiTypes.STR, OpenApiParameter.QUERY),
            CURSOR_PARAMETER,
        ],
        responses={
            200: page_serializer(OperationsRequestRowSerializer, "OperationsRequestPage"),
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        return paginated(
            request,
            self,
            operations_request_rows(request),
            OperationsRequestRowSerializer,
            pagination=OperationsNewestFirstPagination,
        )
