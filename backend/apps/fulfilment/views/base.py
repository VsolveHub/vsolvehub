"""The spine every fulfilment view stands on: guards, actor resolution and projections.

This is the shared half of the old `views.py` import header — the tag and error map the
`@extend_schema` decorators reuse, the idempotency-key and actor-resolution helpers, the
`PermissionDenied` translator, the three actor-scoped projections, and the Partner command base
class. Nothing here is specific to one audience, and nothing here imports a sibling: the
dependency arrows in this package point at `base`, never out of it.

## Why `PermissionError` is translated here

The domain layer raises plain `PermissionError` for "this Booking belongs to someone else",
because it is not an HTTP layer and should not import DRF exceptions. `_forbidden` turns that
into a `403` with safe copy at the boundary.
"""

from collections.abc import Callable
from typing import Any, cast
from uuid import UUID

from django.db.models import QuerySet
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commerce.models import Booking
from apps.foundation.services import CommandResult, ResponseBody, execute_idempotent
from apps.fulfilment.models import ScopeAmendment
from apps.fulfilment.serializers import (
    CustomerBookingSerializer,
    OperationsBookingSerializer,
    PartnerBookingSerializer,
    ScopeAmendmentSerializer,
    VersionedCommandSerializer,
)
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsPartnerUser
from common.errors.serializers import ApiErrorSerializer

FULFILMENT_TAG = "Fulfilment"

_ERRORS_4XX = {
    400: ApiErrorSerializer,
    403: ApiErrorSerializer,
    404: ApiErrorSerializer,
    409: ApiErrorSerializer,
}


def _required_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."},
            code="idempotency_key_required",
        )
    return key


def _forbidden() -> PermissionDenied:
    """One message for "not yours", regardless of whether the row exists.

    A distinct 404 for an unknown id and a 403 for someone else's id would make this an
    existence oracle: a caller could enumerate Booking ids by the status code alone. The cart
    removal command settled the same question the same way in 1.13.0.
    """

    return PermissionDenied("This booking is not available to you.")


def _replayable(result: CommandResult, projection: Callable[[], ResponseBody]) -> Response:
    if not result.replayed:
        return Response(result.body, status=result.status_code)
    response = Response(projection(), status=result.status_code)
    response["Idempotent-Replay"] = "true"
    return response


def _booking_queryset() -> QuerySet[Booking]:
    return Booking.objects.select_related(
        "partner",
        "fulfilment_unit",
        "fulfilment_unit__booking_group",
        "fulfilment_unit__service_area",
        "fulfilment_unit__quote_unit__quote",
    ).prefetch_related("fulfilment_unit__lines", "work_tasks", "evidence")


def _customer_booking(booking_id: UUID, customer: User) -> Booking:
    booking = _booking_queryset().filter(id=booking_id).first()
    if booking is None or booking.customer_id != customer.id:
        raise _forbidden()
    return booking


def _partner_profile(user: User) -> PartnerProfile:
    profile = PartnerProfile.objects.filter(user=user).first()
    if profile is None:
        raise _forbidden()
    return profile


def _partner_booking(booking_id: UUID, profile: PartnerProfile) -> Booking:
    booking = _booking_queryset().filter(id=booking_id).first()
    if booking is None or booking.partner_id != profile.id:
        raise _forbidden()
    return booking


def _customer_projection(booking_id: UUID) -> ResponseBody:
    booking = _booking_queryset().get(id=booking_id)
    return cast(ResponseBody, CustomerBookingSerializer(booking).data)


def _partner_projection(booking_id: UUID) -> ResponseBody:
    booking = _booking_queryset().get(id=booking_id)
    return cast(ResponseBody, PartnerBookingSerializer(booking).data)


def _operations_projection(booking_id: UUID) -> ResponseBody:
    booking = _booking_queryset().prefetch_related("status_history").get(id=booking_id)
    return cast(ResponseBody, OperationsBookingSerializer(booking).data)


def _amendment_projection(amendment_id: UUID) -> ResponseBody:
    amendment = ScopeAmendment.objects.prefetch_related("lines").get(id=amendment_id)
    return cast(ResponseBody, ScopeAmendmentSerializer(amendment).data)


class _PartnerCommandView(APIView):
    """Shared plumbing for the Partner's physical-work commands.

    They differ only in which service they call and what they read from the body, so the
    version guard, idempotency key, actor resolution and projection live here once. A command
    that needed to opt out of any of those would be a command that should not be on this base
    class.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)
    operation: str = ""
    request_serializer: type[VersionedCommandSerializer] = VersionedCommandSerializer

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        raise NotImplementedError

    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = self.request_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            self.run(
                booking=booking,
                profile=profile,
                data=serializer.validated_data,
                key=key,
            )
            return status.HTTP_200_OK, _partner_projection(booking.id)

        result = execute_idempotent(
            actor=user,
            operation=self.operation,
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _partner_projection(booking.id))
