"""Operations.

The old `views.py` banner of the same name: the full-history Booking read, the audited
channel-outage assisted start, and partner recovery from a chosen offer.

The boundary is the audience, and it is the reason these three sit apart from the Customer and
Partner slices rather than beside the commands they resemble. They are the only views in this
package tagged `Operations` instead of `Fulfilment`, the only ones that reach a Booking without
an ownership check — `IsOperationsUser` is the check — and the only ones that project through
`OperationsBookingSerializer`, which carries the status history the other two audiences never
see. `OperationsAssistedStartView` is also the one place in the package where a recent step-up
is mandatory.
"""

from datetime import date
from typing import cast
from uuid import UUID

from django.db.models import Q, QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commerce.models import Booking
from apps.foundation.services import ResponseBody, execute_idempotent
from apps.fulfilment import recovery_services
from apps.fulfilment.cancellation import operations_cancel_booking
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.serializers import (
    LATE_STATUSES,
    AssistedStartRequestSerializer,
    OperationsBookingRowSerializer,
    OperationsBookingSerializer,
    OperationsCancelRequestSerializer,
    RecoverBookingRequestSerializer,
)
from apps.identity.models import User
from apps.partners.permissions import HasRecentOperationsStepUp, IsOperationsUser
from common.errors.serializers import ApiErrorSerializer
from common.pagination import (
    CURSOR_PARAMETER,
    STATUS_PARAMETER,
    OperationsNewestFirstPagination,
    filter_statuses,
    page_serializer,
    paginated,
)
from common.schema import IDEMPOTENCY_KEY_HEADER

from .base import (
    _ERRORS_4XX,
    _booking_queryset,
    _operations_projection,
    _replayable,
    _required_key,
)


def _is_uuid(value: str) -> bool:
    try:
        UUID(value)
    except ValueError:
        return False
    return True


def _day(request: Request, name: str) -> date | None:
    raw = (request.query_params.get(name) or "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise serializers.ValidationError({name: ["Use YYYY-MM-DD."]}) from exc


def operations_booking_rows(request: Request) -> QuerySet[Booking]:
    """Every home-service visit, narrowed by the list's filters. Exported for tests.

    `?status=` one state or several; `?q=` the customer's or partner's name or phone, or a booking
    id; `?late=true` only visits whose start passed without the professional starting;
    `?date_from=` / `?date_to=` the visit day, inclusive, in local time.
    """
    rows = Booking.objects.select_related(
        "customer",
        "partner",
        "partner__user",
        "fulfilment_unit",
        "fulfilment_unit__service_area",
    ).prefetch_related("fulfilment_unit__lines")
    rows = cast(QuerySet[Booking], filter_statuses(rows, request, Booking.Status.values))
    query = (request.query_params.get("q") or "").strip()
    if query:
        match = (
            Q(customer__full_name__icontains=query)
            | Q(customer__phone_number__icontains=query)
            | Q(partner__display_name__icontains=query)
            | Q(partner__user__phone_number__icontains=query)
        )
        if _is_uuid(query):
            match |= Q(id=query) | Q(order_id=query) | Q(fulfilment_unit__booking_group_id=query)
        rows = rows.filter(match)
    if (request.query_params.get("late") or "").strip().lower() == "true":
        rows = rows.filter(status__in=LATE_STATUSES, scheduled_start__lt=timezone.now())
    start, end = _day(request, "date_from"), _day(request, "date_to")
    if start is not None:
        rows = rows.filter(scheduled_start__date__gte=start)
    if end is not None:
        rows = rows.filter(scheduled_start__date__lte=end)
    return rows


class OperationsBookingCollectionView(APIView):
    """Every home-service visit, newest first, so Operations can find one without its id."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_bookings_list",
        parameters=[
            STATUS_PARAMETER,
            OpenApiParameter("q", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter(
                "late",
                OpenApiTypes.BOOL,
                OpenApiParameter.QUERY,
                description="Only visits past their start time that have not started.",
            ),
            OpenApiParameter("date_from", OpenApiTypes.DATE, OpenApiParameter.QUERY),
            OpenApiParameter("date_to", OpenApiTypes.DATE, OpenApiParameter.QUERY),
            CURSOR_PARAMETER,
        ],
        responses={
            200: page_serializer(OperationsBookingRowSerializer, "OperationsBookingPage"),
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        return paginated(
            request,
            self,
            operations_booking_rows(request),
            OperationsBookingRowSerializer,
            pagination=OperationsNewestFirstPagination,
        )


class OperationsBookingDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_booking_retrieve",
        responses={200: OperationsBookingSerializer, 403: ApiErrorSerializer},
    )
    def get(self, _request: Request, booking_id: UUID) -> Response:
        booking = get_object_or_404(
            _booking_queryset().prefetch_related("status_history"), id=booking_id
        )
        return Response(OperationsBookingSerializer(booking).data)


class OperationsAssistedStartView(APIView):
    """The audited channel-outage workaround, and the one place step-up is mandatory.

    `operations_assisted_start` refuses a blank outage reason on its own, but the
    re-verification it describes has never been enforced anywhere, because until this release
    there was no view to enforce it in. `HasRecentOperationsStepUp` — already written, already
    documented as gating exactly this — is that enforcement. It is not a general-purpose OTP
    bypass: it starts work without the Customer's code and says so, loudly, in the audit trail.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_booking_assisted_start",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=AssistedStartRequestSerializer,
        responses={200: OperationsBookingSerializer, 401: ApiErrorSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = AssistedStartRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operator = cast(User, request.user)
        booking = get_object_or_404(Booking, id=booking_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            operations_assisted_start(
                booking_id=booking.id,
                operator=operator,
                outage_reason=serializer.validated_data["outage_reason"],
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _operations_projection(booking.id)

        result = execute_idempotent(
            actor=operator,
            operation="fulfilment.operations_assisted_start",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _operations_projection(booking.id))


class OperationsCancelBookingView(APIView):
    """Operations cancels a visit for the customer and refunds it, from the visit page.

    Moves money, so it sits behind the same step-up as refunds. Refunding used to mean copying the
    order id into the Refunds page and typing the visit's fulfilment-unit id by hand.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_booking_cancel",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=OperationsCancelRequestSerializer,
        responses={200: OperationsBookingSerializer, 401: ApiErrorSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = OperationsCancelRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operator = cast(User, request.user)
        booking = get_object_or_404(Booking, id=booking_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            operations_cancel_booking(
                booking_id=booking.id,
                operator=operator,
                expected_version=serializer.validated_data["expected_version"],
                reason=serializer.validated_data["reason"],
                full_refund=serializer.validated_data["full_refund"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _operations_projection(booking.id)

        result = execute_idempotent(
            actor=operator,
            operation="fulfilment.operations_cancel",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _operations_projection(booking.id))


class OperationsRecoverBookingView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_booking_recover_partner",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RecoverBookingRequestSerializer,
        responses={200: OperationsBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = RecoverBookingRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operator = cast(User, request.user)
        booking = get_object_or_404(Booking, id=booking_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            recovery_services.recover_booking_partner(
                booking_id=booking.id,
                offer_id=serializer.validated_data["offer_id"],
                operator=operator,
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _operations_projection(booking.id)

        result = execute_idempotent(
            actor=operator,
            operation="fulfilment.operations_recover_partner",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _operations_projection(booking.id))
