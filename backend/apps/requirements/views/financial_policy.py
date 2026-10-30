"""Operations activation of Finance/legal-approved commercial policy versions."""

from typing import cast

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

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
