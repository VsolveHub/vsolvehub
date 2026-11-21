"""Operations activation of Finance/legal-approved commercial policy versions."""

from collections import defaultdict
from typing import Any, cast

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.partners.permissions import IsOperationsUser
from apps.requirements import financials
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import CommercialPolicy
from apps.requirements.serializers import (
    CommercialPolicyActivateSerializer,
    CommercialPolicySerializer,
)
from apps.requirements.views.base import _raise_api_error
from common.errors.serializers import ApiErrorSerializer


class OperationsCommercialPolicyActivateView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_commercial_policy_activate",
        request=CommercialPolicyActivateSerializer,
        responses={
            200: CommercialPolicySerializer,
            400: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = CommercialPolicyActivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            policy = financials.activate_policy(
                actor=cast(User, request.user), **serializer.validated_data
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(CommercialPolicySerializer(policy).data)


#: Every version is kept (retired ones too) so Finance can see what changed; there are few.
COMMERCIAL_POLICY_HISTORY_LIMIT = 50


class OperationsCommercialPolicyListView(APIView):
    """The active policy and its history, newest version first.

    Read-only. The console shows what is in force and prefills the next version from it, so
    activating a change does not mean retyping eighteen numbers from memory.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_commercial_policy_list",
        responses={200: CommercialPolicySerializer(many=True)},
    )
    def get(self, _request: Request) -> Response:
        rows = CommercialPolicy.objects.order_by("-version")[:COMMERCIAL_POLICY_HISTORY_LIMIT]
        return Response(CommercialPolicySerializer(rows, many=True).data)


#: Archetypes priced by the commercial policy above (workforce time blocks and custom projects).
CREW_AND_PROJECT_ARCHETYPES = frozenset(
    {
        ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
        ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    }
)
#: Service names returned per category: enough to recognise it, not a catalogue dump.
TAX_CATEGORY_EXAMPLES = 4


class TaxCategoryUsageSerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.CharField(help_text="The `tax_category_code` services carry.")
    service_count = serializers.IntegerField(help_text="Active services using this category.")
    crew_and_project_service_count = serializers.IntegerField(
        help_text="Of those, crew (A3) and project (A5) services: the ones this policy prices."
    )
    example_services = serializers.ListField(
        child=serializers.CharField(), help_text="A few of their names, alphabetical."
    )


class OperationsTaxCategoryListView(APIView):
    """Every tax category the catalogue's active services use, with the services under it.

    Read-only. The policy form offers these instead of asking Operations to type category codes,
    which had to match a service's code exactly and failed silently when they did not.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_tax_categories_list",
        responses={200: TaxCategoryUsageSerializer(many=True)},
    )
    def get(self, _request: Request) -> Response:
        services: dict[str, set[str]] = defaultdict(set)
        crew_and_project: dict[str, set[str]] = defaultdict(set)
        variants = (
            ServiceVariant.objects.filter(is_active=True)
            .exclude(tax_category_code="")
            .values_list("tax_category_code", "booking_archetype", "service__name")
        )
        for code, archetype, service_name in variants:
            services[code].add(service_name)
            if archetype in CREW_AND_PROJECT_ARCHETYPES:
                crew_and_project[code].add(service_name)
        rows = [
            {
                "code": code,
                "service_count": len(names),
                "crew_and_project_service_count": len(crew_and_project[code]),
                "example_services": sorted(names)[:TAX_CATEGORY_EXAMPLES],
            }
            for code, names in sorted(services.items())
        ]
        return Response(TaxCategoryUsageSerializer(cast(Any, rows), many=True).data)
