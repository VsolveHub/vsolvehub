"""The Operations case surface.

Every route is `IsOperationsUser`, which audits each allowed and denied read through
`record_access_event` — a case can hold a safety report or a Customer's complaint verbatim, so
who looked at it is itself a fact worth keeping.

Commands follow the convention the rest of this codebase settled on: a required
`Idempotency-Key` through `execute_idempotent`, a required `expected_version`, and a replay that
answers with current truth rather than the frozen body.
"""

from collections.abc import Callable
from typing import Any, cast
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.models import OperationsCase
from apps.cases.serializers import (
    CaseNoteRequestSerializer,
    EscalateCaseRequestSerializer,
    OpenCaseRequestSerializer,
    OperationsCaseListSerializer,
    OperationsCasePageSerializer,
    OperationsCaseSerializer,
    ResolveCaseRequestSerializer,
    VersionedCaseCommandSerializer,
)
from apps.cases.services import add_case_note, claim_case, escalate_case, open_case, resolve_case
from apps.foundation.services import CommandResult, ResponseBody, execute_idempotent
from apps.identity.models import User
from apps.partners.permissions import IsOperationsUser
from common.errors.serializers import ApiErrorSerializer
from common.pagination import StrictCursorPagination
from common.schema import IDEMPOTENCY_KEY_HEADER

OPERATIONS_TAG = "Operations"

_ERRORS = {
    400: ApiErrorSerializer,
    403: ApiErrorSerializer,
    404: ApiErrorSerializer,
    409: ApiErrorSerializer,
}


def _required_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."}, code="idempotency_key_required"
        )
    return key


def _projection(case_id: UUID) -> ResponseBody:
    case = OperationsCase.objects.prefetch_related("events").get(id=case_id)
    return cast(ResponseBody, OperationsCaseSerializer(case).data)


def _replayable(result: CommandResult, projection: Callable[[], ResponseBody]) -> Response:
    if not result.replayed:
        return Response(result.body, status=result.status_code)
    response = Response(projection(), status=result.status_code)
    response["Idempotent-Replay"] = "true"
    return response


class OperationsCaseListView(APIView):
    """The queue, filtered the way somebody actually works it.

    Cursor-paginated rather than offset: a queue is inserted into constantly, and an offset page
    two skips whatever arrived while page one was being read. Same `StrictCursorPagination` the
    Partner application queue and offer inbox use.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_cases_list",
        parameters=[
            OpenApiParameter("status", str, description="Filter by case status."),
            OpenApiParameter("owner_team", str, description="Filter by owning team."),
            OpenApiParameter("kind", str, description="Filter by case kind."),
            OpenApiParameter("overdue", bool, description="Only cases past their SLA deadline."),
            OpenApiParameter("cursor", str, description="Opaque page cursor."),
        ],
        responses={200: OperationsCasePageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        queryset = OperationsCase.objects.all()
        params = request.query_params
        if value := params.get("status"):
            queryset = queryset.filter(status=value)
        if value := params.get("owner_team"):
            queryset = queryset.filter(owner_team=value)
        if value := params.get("kind"):
            queryset = queryset.filter(kind=value)
        if params.get("overdue") in ("true", "1"):
            queryset = queryset.filter(due_at__lt=timezone.now()).exclude(
                status__in=(OperationsCase.Status.RESOLVED, OperationsCase.Status.CANCELLED)
            )

        paginator = StrictCursorPagination()
        page = paginator.paginate_queryset(queryset.order_by("-created_at", "id"), request, self)
        return paginator.get_paginated_response(
            OperationsCaseListSerializer(page or [], many=True).data
        )

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_cases_open",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=OpenCaseRequestSerializer,
        responses={201: OperationsCaseSerializer, **_ERRORS},
    )
    def post(self, request: Request) -> Response:
        serializer = OpenCaseRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _required_key(request)
        data = serializer.validated_data

        def command() -> tuple[int, ResponseBody]:
            case = open_case(
                kind=data["kind"],
                summary=data["summary"],
                severity=data["severity"],
                detail=data["detail"],
                booking_id=data.get("booking_id"),
                order_id=data.get("order_id"),
                partner_id=data.get("partner_id"),
                opened_by=actor,
                idempotency_key=key,
            )
            return status.HTTP_201_CREATED, _projection(case.id)

        result = execute_idempotent(
            actor=actor,
            operation="cases.open",
            key=key,
            request_payload=dict(data),
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsCaseDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_case_retrieve",
        responses={200: OperationsCaseSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def get(self, _request: Request, case_id: UUID) -> Response:
        case = get_object_or_404(OperationsCase.objects.prefetch_related("events"), id=case_id)
        return Response(OperationsCaseSerializer(case).data)


class _CaseCommandView(APIView):
    """Shared plumbing: version guard, idempotency key, projection."""

    permission_classes = (IsAuthenticated, IsOperationsUser)
    operation = ""
    request_serializer: type[VersionedCaseCommandSerializer] = VersionedCaseCommandSerializer

    def run(self, *, case: OperationsCase, actor: User, data: dict[str, Any]) -> None:
        raise NotImplementedError

    def post(self, request: Request, case_id: UUID) -> Response:
        serializer = self.request_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        case = get_object_or_404(OperationsCase, id=case_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            self.run(case=case, actor=actor, data=serializer.validated_data)
            return status.HTTP_200_OK, _projection(case.id)

        result = execute_idempotent(
            actor=actor,
            operation=self.operation,
            key=key,
            request_payload={"case_id": str(case.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _projection(case.id))


class OperationsCaseClaimView(_CaseCommandView):
    operation = "cases.claim"

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_case_claim",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedCaseCommandSerializer,
        responses={200: OperationsCaseSerializer, **_ERRORS},
    )
    def post(self, request: Request, case_id: UUID) -> Response:
        return super().post(request, case_id)

    def run(self, *, case: OperationsCase, actor: User, data: dict[str, Any]) -> None:
        claim_case(case_id=case.id, expected_version=data["expected_version"], actor=actor)


class OperationsCaseEscalateView(_CaseCommandView):
    operation = "cases.escalate"
    request_serializer = EscalateCaseRequestSerializer

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_case_escalate",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=EscalateCaseRequestSerializer,
        responses={200: OperationsCaseSerializer, **_ERRORS},
    )
    def post(self, request: Request, case_id: UUID) -> Response:
        return super().post(request, case_id)

    def run(self, *, case: OperationsCase, actor: User, data: dict[str, Any]) -> None:
        escalate_case(
            case_id=case.id,
            expected_version=data["expected_version"],
            severity=data["severity"],
            actor=actor,
        )


class OperationsCaseResolveView(_CaseCommandView):
    """Closing a case names what happened.

    The resolution must be one of the case kind's required terminal results — published on the
    detail projection as `allowed_resolutions`, so a console never has to carry its own copy of
    a rule that differs per kind.
    """

    operation = "cases.resolve"
    request_serializer = ResolveCaseRequestSerializer

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_case_resolve",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ResolveCaseRequestSerializer,
        responses={200: OperationsCaseSerializer, **_ERRORS},
    )
    def post(self, request: Request, case_id: UUID) -> Response:
        return super().post(request, case_id)

    def run(self, *, case: OperationsCase, actor: User, data: dict[str, Any]) -> None:
        resolve_case(
            case_id=case.id,
            expected_version=data["expected_version"],
            resolution=data["resolution"],
            note=data["note"],
            actor=actor,
        )


class OperationsCaseNoteView(APIView):
    """A note or a record of something sent. Never moves the case — sending is not progress."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_case_add_note",
        request=CaseNoteRequestSerializer,
        responses={201: OperationsCaseSerializer, **_ERRORS},
    )
    def post(self, request: Request, case_id: UUID) -> Response:
        serializer = CaseNoteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        case = get_object_or_404(OperationsCase, id=case_id)
        add_case_note(
            case_id=case.id,
            actor=cast(User, request.user),
            body=serializer.validated_data["body"],
            is_communication=serializer.validated_data["is_communication"],
        )
        return Response(_projection(case.id), status=status.HTTP_201_CREATED)
