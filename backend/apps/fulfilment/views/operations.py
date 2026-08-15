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

from typing import cast
from uuid import UUID

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commerce.models import Booking
from apps.foundation.services import ResponseBody, execute_idempotent
from apps.fulfilment import recovery_services
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.serializers import (
    AssistedStartRequestSerializer,
    OperationsBookingSerializer,
    RecoverBookingRequestSerializer,
)
from apps.identity.models import User
from apps.partners.permissions import HasRecentOperationsStepUp, IsOperationsUser
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER

from .base import (
    _ERRORS_4XX,
    _booking_queryset,
    _operations_projection,
    _replayable,
    _required_key,
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
