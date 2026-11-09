from typing import Any

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status as http_status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsPartnerUser
from apps.rides import selectors, services
from apps.rides.models import CaptainPass, CaptainPassPlan
from apps.rides.serializers import (
    BuyPassSerializer,
    CaptainPassPlanSerializer,
    CaptainPassSerializer,
    CaptainStatusSerializer,
    CaptainVehicleSerializer,
    CaptainVehicleWriteSerializer,
    DutyStatusSerializer,
    FareQuoteListSerializer,
    FareQuoteRequestSerializer,
)
from common.schema import IDEMPOTENCY_KEY_HEADER

__all__ = [
    "CaptainMeView",
    "CaptainPassPlansView",
    "CaptainPassesView",
    "CaptainVehicleView",
    "DutyStartView",
    "DutyStopView",
    "FareQuotesView",
]


def _partner(user: Any) -> PartnerProfile:
    return get_object_or_404(PartnerProfile, user=user)


class CaptainMeView(APIView):
    """Where the signed-in partner stands as a ride captain."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(operation_id="partner_rides_me_retrieve", responses=CaptainStatusSerializer)
    def get(self, request: Any) -> Response:
        status = selectors.captain_status(_partner(request.user))
        return Response(CaptainStatusSerializer(status).data)


class CaptainVehicleView(APIView):
    """Save the captain's vehicle. Allowed only while the application is still editable."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rides_vehicle_update",
        request=CaptainVehicleWriteSerializer,
        responses=CaptainVehicleSerializer,
    )
    def put(self, request: Any) -> Response:
        serializer = CaptainVehicleWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        vehicle = services.save_captain_vehicle(
            partner=_partner(request.user),
            vehicle_type=data["vehicle_type"],
            registration_number=data["registration_number"],
            make_model=data["make_model"],
            colour=data["colour"],
        )
        return Response(CaptainVehicleSerializer(vehicle).data)


def _required_idempotency_key(request: Any) -> str:
    key = str(request.headers.get("Idempotency-Key", "")).strip()
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."}, code="idempotency_key_required"
        )
    return key


class CaptainPassPlansView(APIView):
    """The passes on sale."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rides_pass_plans_list",
        responses=CaptainPassPlanSerializer(many=True),
    )
    def get(self, request: Any) -> Response:
        del request
        plans = CaptainPassPlan.objects.filter(is_active=True).order_by("price_paise", "code")
        return Response(CaptainPassPlanSerializer(plans, many=True).data)


class CaptainPassesView(APIView):
    """Buy a pass, and the captain's pass history."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rides_passes_list", responses=CaptainPassSerializer(many=True)
    )
    def get(self, request: Any) -> Response:
        passes = CaptainPass.objects.filter(partner=_partner(request.user)).select_related("plan")
        return Response(CaptainPassSerializer(passes, many=True).data)

    @extend_schema(
        operation_id="partner_rides_passes_create",
        request=BuyPassSerializer,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={201: CaptainPassSerializer},
    )
    def post(self, request: Any) -> Response:
        serializer = BuyPassSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = _required_idempotency_key(request)
        partner = _partner(request.user)
        plan = get_object_or_404(
            CaptainPassPlan, id=serializer.validated_data["plan_id"], is_active=True
        )

        def command() -> tuple[int, dict[str, Any]]:
            captain_pass = services.buy_pass(partner=partner, plan=plan, idempotency_key=key)
            return http_status.HTTP_201_CREATED, dict(CaptainPassSerializer(captain_pass).data)

        result = execute_idempotent(
            actor=request.user,
            operation="rides.pass.buy",
            key=key,
            request_payload=serializer.validated_data,
            command=command,
        )
        response = Response(result.body, status=result.status_code)
        if result.replayed:
            response["Idempotent-Replay"] = "true"
        return response


class DutyStartView(APIView):
    """Go on duty. Refused with the first reason the captain cannot drive."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rides_duty_start", request=None, responses=DutyStatusSerializer
    )
    def post(self, request: Any) -> Response:
        session = services.start_duty(partner=_partner(request.user))
        return Response(DutyStatusSerializer(DutyStatusSerializer.of(session)).data)


class DutyStopView(APIView):
    """Go off duty. Already off: nothing changes."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rides_duty_stop", request=None, responses=DutyStatusSerializer
    )
    def post(self, request: Any) -> Response:
        services.stop_duty(partner=_partner(request.user))
        return Response(DutyStatusSerializer(DutyStatusSerializer.of(None)).data)


class FareQuotesView(APIView):
    """Upfront fares for a trip: one per vehicle type that can be booked at the pickup."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        operation_id="rides_quotes_create",
        request=FareQuoteRequestSerializer,
        responses={201: FareQuoteListSerializer},
    )
    def post(self, request: Any) -> Response:
        serializer = FareQuoteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        pickup, drop = data["pickup"], data["drop"]
        quotes = services.create_quotes(
            rider=request.user,
            pickup=services.TripPoint(pickup["latitude"], pickup["longitude"], pickup["address"]),
            drop=services.TripPoint(drop["latitude"], drop["longitude"], drop["address"]),
        )
        return Response(
            FareQuoteListSerializer({"quotes": quotes}).data, status=http_status.HTTP_201_CREATED
        )
