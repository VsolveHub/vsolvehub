"""The two role-scoped halves of project completion-code verification."""

import uuid
from typing import cast

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.permissions import IsPartnerUser
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.projects import completion
from apps.requirements.selectors import engagement_for_participant
from apps.requirements.serializers import (
    EngagementSerializer,
    ProjectCompletionCodeEntrySerializer,
    ProjectCompletionCodeSerializer,
)
from apps.requirements.views.base import _idempotency_key, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


class ProjectCompletionCodeView(APIView):
    """Customer-only read/issue; the Partner can never fetch the digits."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_completion_code_read",
        responses={200: ProjectCompletionCodeSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, engagement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        try:
            engagement = engagement_for_participant(user=customer, engagement_id=engagement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        if engagement.customer_id != customer.id:
            _raise_api_error(RequirementNotFoundError())
        live = completion.live_project_completion_code(engagement)
        return Response(
            ProjectCompletionCodeSerializer(
                {
                    "code": None if live is None else live.digits,
                    "expires_at": None if live is None else live.expires_at,
                    "can_issue": completion.project_completion_code_can_issue(engagement),
                    "code_length": settings.OTP_CODE_LENGTH,
                    "server_now": timezone.now(),
                }
            ).data
        )

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_completion_code_issue",
        request=None,
        responses={
            201: ProjectCompletionCodeSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
            429: OpenApiResponse(
                response=ApiErrorSerializer,
                description="A still-live completion code was issued moments ago.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        try:
            issued = completion.issue_project_completion_code(
                engagement_id=engagement_id, customer=customer
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            ProjectCompletionCodeSerializer(
                {
                    "code": issued.digits,
                    "expires_at": issued.expires_at,
                    "can_issue": True,
                    "code_length": settings.OTP_CODE_LENGTH,
                    "server_now": timezone.now(),
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerProjectCompletionView(APIView):
    """The only ordinary A5 close-out command: enter the Customer's code."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_complete_with_code",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProjectCompletionCodeEntrySerializer,
        responses={
            200: EngagementSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
            422: OpenApiResponse(
                response=ApiErrorSerializer,
                description="Wrong, expired, consumed or exhausted completion code.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        serializer = ProjectCompletionCodeEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = str(serializer.validated_data["code"])

        def command() -> tuple[int, dict[str, object]]:
            try:
                engagement = completion.confirm_project_completion_with_code(
                    engagement_id=engagement_id,
                    partner_user=actor,
                    code=code,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], EngagementSerializer(engagement).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.complete_with_code",
            key=_idempotency_key(request),
            # Never persist the OTP in an idempotency fingerprint or audit payload.
            request_payload={"engagement_id": str(engagement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)
