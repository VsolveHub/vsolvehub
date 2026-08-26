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
