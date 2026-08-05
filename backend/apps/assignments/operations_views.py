"""Operations dispatch surfaces: explain a decision, then correct it.

These four operations are the human override on autonomous dispatch. Each is scoped to
`IsOperationsUser`, guarded by the Fulfilment Unit's optimistic `version`, replayable
under a stable `Idempotency-Key`, and leaves one immutable audit row behind. The
idempotency and replay handling is the same helper the Partner offer command uses —
there is one way to do this in the repo (proposal 0009) and this is it.
"""

from collections.abc import Callable
from typing import Any, cast
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assignments.models import AssignmentAttempt, PartnerOffer, Reservation
from apps.assignments.ranking import RANKING_POLICY, RANKING_POLICY_VERSION
from apps.assignments.recovery_services import (
    recover_fulfilment_unit,
    release_unit_reservation,
    revoke_unit_offer,
)
from apps.assignments.serializers import (
    DispatchCommandRequestSerializer,
    DispatchExplanationSerializer,
    DispatchReservationSerializer,
    FulfilmentUnitDispatchSerializer,
    OfferSerializer,
)
from apps.assignments.views import _offer_projection
from apps.carts.models import FulfilmentUnit
from apps.foundation.services import CommandResult, ResponseBody, execute_idempotent
from apps.identity.models import User
from apps.partners.permissions import IsOperationsUser
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


def _attempt_projection(attempt: AssignmentAttempt) -> dict[str, Any]:
    snapshot = attempt.ranking_snapshot
    offer = getattr(attempt, "offer", None)
    return {
        "attempt_id": attempt.id,
        "rank": attempt.rank,
        "partner_id": attempt.candidate_id,
        "created_at": attempt.created_at,
        "offer_status": offer.status if offer is not None else None,
        "eligibility": attempt.eligibility_snapshot,
        "ranked": snapshot.get("ranked", []),
        "excluded": snapshot.get("excluded", []),
    }


class OperationsDispatchExplanationView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_fulfilment_unit_dispatch_explanation",
        responses={
            200: DispatchExplanationSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, _request: Request, unit_id: UUID) -> Response:
        unit = get_object_or_404(FulfilmentUnit, id=unit_id)
        attempts = (
            AssignmentAttempt.objects.filter(fulfilment_unit=unit)
            .select_related("offer")
            .order_by("rank")
        )
        return Response(
            DispatchExplanationSerializer(
                {
                    "fulfilment_unit_id": unit.id,
                    "unit_status": unit.status,
                    "unit_version": unit.version,
                    "policy": RANKING_POLICY,
                    "policy_version": RANKING_POLICY_VERSION,
                    "attempts": [_attempt_projection(item) for item in attempts],
                    "server_now": timezone.now(),
                }
            ).data
        )


DISPATCH_REVOKE_OPERATION = "dispatch.offer_revoke"
DISPATCH_RELEASE_OPERATION = "dispatch.reservation_release"
DISPATCH_RECOVER_OPERATION = "dispatch.unit_recover"


def _required_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."},
            code="idempotency_key_required",
        )
    return key


def _unit_dispatch_projection(unit_id: UUID) -> dict[str, Any]:
    unit = FulfilmentUnit.objects.select_related("booking_group").get(id=unit_id)
    offer = (
        PartnerOffer.objects.filter(
            fulfilment_unit=unit,
            status__in=(PartnerOffer.Status.OFFERED, PartnerOffer.Status.ACCEPTED_PENDING_UNDO),
        )
        .order_by("-created_at")
        .first()
    )
    reservation = Reservation.objects.filter(fulfilment_unit=unit).order_by("-created_at").first()
    return cast(
        dict[str, Any],
        FulfilmentUnitDispatchSerializer(
            {
                "id": unit.id,
                "position": unit.position,
                "status": unit.status,
                "version": unit.version,
                "group_status": unit.booking_group.status,
                "live_offer_id": offer.id if offer is not None else None,
                "live_offer_status": offer.status if offer is not None else None,
                "reservation_status": reservation.status if reservation is not None else None,
                "server_now": timezone.now(),
            }
        ).data,
    )


def _replayable(result: CommandResult, projection: Callable[[], ResponseBody]) -> Response:
    """Answer a replay with current truth, not the frozen body.

    Every one of these projections carries `server_now` and live deadlines. Republishing
    the stored body would hand a console a stale clock and a state that has since moved.
    """
    if not result.replayed:
        return Response(result.body, status=result.status_code)
    response = Response(projection(), status=result.status_code)
    response["Idempotent-Replay"] = "true"
    return response


class OperationsOfferRevokeView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_offer_revoke",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DispatchCommandRequestSerializer,
        responses={
            200: OfferSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, offer_id: UUID) -> Response:
        serializer = DispatchCommandRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        offer = get_object_or_404(PartnerOffer, id=offer_id, fulfilment_unit__isnull=False)
        user = cast(User, request.user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            revoke_unit_offer(
                actor=user,
                offer_id=offer.id,
                expected_unit_version=serializer.validated_data["expected_unit_version"],
                reason=serializer.validated_data["reason"],
                note=serializer.validated_data["note"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _offer_projection(offer.id)

        result = execute_idempotent(
            actor=user,
            operation=DISPATCH_REVOKE_OPERATION,
            key=key,
            request_payload={"offer_id": str(offer.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _offer_projection(offer.id))


class OperationsReservationReleaseView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_reservation_release",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DispatchCommandRequestSerializer,
        responses={
            200: DispatchReservationSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, reservation_id: UUID) -> Response:
        serializer = DispatchCommandRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation = get_object_or_404(
            Reservation, id=reservation_id, fulfilment_unit__isnull=False
        )
        user = cast(User, request.user)
        key = _required_key(request)

        def projection() -> dict[str, Any]:
            reservation.refresh_from_db()
            return cast(dict[str, Any], DispatchReservationSerializer(reservation).data)

        def command() -> tuple[int, ResponseBody]:
            release_unit_reservation(
                actor=user,
                reservation_id=reservation.id,
                expected_unit_version=serializer.validated_data["expected_unit_version"],
                reason=serializer.validated_data["reason"],
                note=serializer.validated_data["note"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, projection()

        result = execute_idempotent(
            actor=user,
            operation=DISPATCH_RELEASE_OPERATION,
            key=key,
            request_payload={"reservation_id": str(reservation.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, projection)


class OperationsUnitRecoverView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_fulfilment_unit_recover",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DispatchCommandRequestSerializer,
        responses={
            200: FulfilmentUnitDispatchSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, unit_id: UUID) -> Response:
        serializer = DispatchCommandRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        unit = get_object_or_404(FulfilmentUnit, id=unit_id)
        user = cast(User, request.user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            recover_fulfilment_unit(
                actor=user,
                unit_id=unit.id,
                expected_unit_version=serializer.validated_data["expected_unit_version"],
                reason=serializer.validated_data["reason"],
                note=serializer.validated_data["note"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _unit_dispatch_projection(unit.id)

        result = execute_idempotent(
            actor=user,
            operation=DISPATCH_RECOVER_OPERATION,
            key=key,
            request_payload={"unit_id": str(unit.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _unit_dispatch_projection(unit.id))
