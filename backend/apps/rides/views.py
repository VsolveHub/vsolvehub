import logging
import uuid
from typing import Any

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status as http_status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.rides import engine, selectors, services
from apps.rides.models import CaptainPass, CaptainPassPlan, Ride, RideRateCard
from apps.rides.serializers import (
    BuyPassSerializer,
    CaptainPassPlanOpsSerializer,
    CaptainPassPlanSerializer,
    CaptainPassSerializer,
    CaptainRideSerializer,
    CaptainStatusSerializer,
    CaptainVehicleSerializer,
    CaptainVehicleWriteSerializer,
    CurrentOfferSerializer,
    DutyStatusSerializer,
    FareQuoteListSerializer,
    FareQuoteRequestSerializer,
    LocationPingSerializer,
    RateCardCreateSerializer,
    RateCardUpdateSerializer,
    RideCreateSerializer,
    RideRateCardSerializer,
    RideSerializer,
)
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin

__all__ = [
    "CaptainLocationView",
    "CaptainMeView",
    "CaptainPassPlansView",
    "CaptainPassesView",
    "CaptainVehicleView",
    "CurrentOfferView",
    "DutyStartView",
    "DutyStopView",
    "FareQuotesView",
    "OfferAcceptView",
    "OfferDeclineView",
    "OpsPassPlanDetailView",
    "OpsPassPlansView",
    "OpsRateCardDetailView",
    "OpsRateCardsView",
    "RideDetailView",
    "RidesView",
]


logger = logging.getLogger(__name__)


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


class CaptainLocationView(APIView):
    """A GPS ping, every 5 seconds while on duty (also during a ride)."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rides_location_create",
        request=LocationPingSerializer,
        responses={204: None},
    )
    def post(self, request: Any) -> Response:
        serializer = LocationPingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.record_location(
            partner=_partner(request.user), ping=services.LocationPing(**serializer.validated_data)
        )
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class OpsRateCardsView(APIView):
    """Every rate card version, newest first; and a new card for an area and vehicle."""

    permission_classes = (IsOperationsUser,)

    @extend_schema(
        operation_id="operations_rides_rate_cards_list",
        parameters=[
            OpenApiParameter("service_area_id", OpenApiTypes.UUID, required=False),
            OpenApiParameter("vehicle_type", OpenApiTypes.STR, required=False),
            OpenApiParameter("active", OpenApiTypes.BOOL, required=False),
        ],
        responses=RideRateCardSerializer(many=True),
    )
    def get(self, request: Any) -> Response:
        cards = RideRateCard.objects.order_by("service_area_id", "vehicle_type", "-version")
        params = request.query_params
        if params.get("service_area_id"):
            try:
                area_id = uuid.UUID(params["service_area_id"])
            except ValueError as exc:
                raise ValidationError({"service_area_id": "Not a valid id."}) from exc
            cards = cards.filter(service_area_id=area_id)
        if params.get("vehicle_type"):
            cards = cards.filter(vehicle_type=params["vehicle_type"])
        if params.get("active") in ("true", "false"):
            cards = cards.filter(is_active=params["active"] == "true")
        return Response(RideRateCardSerializer(cards, many=True).data)

    @extend_schema(
        operation_id="operations_rides_rate_cards_create",
        request=RateCardCreateSerializer,
        responses={201: RideRateCardSerializer},
    )
    def post(self, request: Any) -> Response:
        serializer = RateCardCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        area = get_object_or_404(ServiceArea, id=data.pop("service_area_id"))
        card = services.create_rate_card(
            created_by=request.user,
            service_area=area,
            vehicle_type=data.pop("vehicle_type"),
            rates=data,
        )
        return Response(RideRateCardSerializer(card).data, status=http_status.HTTP_201_CREATED)


class OpsRateCardDetailView(APIView):
    """Edit the active card (a new version) or switch it off."""

    permission_classes = (IsOperationsUser,)

    @extend_schema(
        operation_id="operations_rides_rate_cards_partial_update",
        request=RateCardUpdateSerializer,
        responses=RideRateCardSerializer,
    )
    def patch(self, request: Any, card_id: Any) -> Response:
        card = get_object_or_404(RideRateCard, id=card_id)
        serializer = RateCardUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        deactivate = data.pop("is_active", None) is False
        updated = services.update_rate_card(
            card=card, updated_by=request.user, rates=data, deactivate=deactivate
        )
        return Response(RideRateCardSerializer(updated).data)


class OpsPassPlansView(APIView):
    """Every pass plan, and a new one."""

    permission_classes = (IsOperationsUser,)

    @extend_schema(
        operation_id="operations_rides_pass_plans_list",
        responses=CaptainPassPlanOpsSerializer(many=True),
    )
    def get(self, request: Any) -> Response:
        del request
        plans = CaptainPassPlan.objects.order_by("-is_active", "price_paise", "code")
        return Response(CaptainPassPlanOpsSerializer(plans, many=True).data)

    @extend_schema(
        operation_id="operations_rides_pass_plans_create",
        request=CaptainPassPlanOpsSerializer,
        responses={201: CaptainPassPlanOpsSerializer},
    )
    def post(self, request: Any) -> Response:
        serializer = CaptainPassPlanOpsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        logger.info(
            "ride_pass_plan_created", extra={"plan": plan.code, "actor_id": str(request.user.pk)}
        )
        return Response(
            CaptainPassPlanOpsSerializer(plan).data, status=http_status.HTTP_201_CREATED
        )


class OpsPassPlanDetailView(APIView):
    """Edit a plan. Passes already bought keep their own dates; only new purchases change."""

    permission_classes = (IsOperationsUser,)

    @extend_schema(
        operation_id="operations_rides_pass_plans_partial_update",
        request=CaptainPassPlanOpsSerializer,
        responses=CaptainPassPlanOpsSerializer,
    )
    def patch(self, request: Any, plan_id: Any) -> Response:
        plan = get_object_or_404(CaptainPassPlan, id=plan_id)
        serializer = CaptainPassPlanOpsSerializer(plan, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        logger.info(
            "ride_pass_plan_updated", extra={"plan": plan.code, "actor_id": str(request.user.pk)}
        )
        return Response(CaptainPassPlanOpsSerializer(plan).data)


class RidesView(APIView):
    """Book a ride from a quote. The server then looks for a captain in the background."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        operation_id="rides_create",
        request=RideCreateSerializer,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={201: RideSerializer},
    )
    def post(self, request: Any) -> Response:
        serializer = RideCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = _required_idempotency_key(request)

        def command() -> tuple[int, dict[str, Any]]:
            ride = engine.create_ride(
                rider=request.user, quote_id=serializer.validated_data["quote_id"]
            )
            return http_status.HTTP_201_CREATED, dict(RideSerializer(ride).data)

        result = execute_idempotent(
            actor=request.user,
            operation="rides.ride.create",
            key=key,
            request_payload=serializer.validated_data,
            command=command,
        )
        response = Response(result.body, status=result.status_code)
        if result.replayed:
            response["Idempotent-Replay"] = "true"
        return response


class RideDetailView(APIView):
    """One of the rider's own rides. The app polls this while the ride is live."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(operation_id="rides_retrieve", responses=RideSerializer)
    def get(self, request: Any, ride_id: Any) -> Response:
        ride = get_object_or_404(
            Ride.objects.select_related("quote", "captain__user", "captain__ride_vehicle"),
            id=ride_id,
            rider=request.user,
        )
        return Response(RideSerializer(ride).data)


class CurrentOfferView(APIView):
    """The ride request to show the captain now, or none. The app polls this every 2 s."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rides_offers_current_retrieve", responses=CurrentOfferSerializer
    )
    def get(self, request: Any) -> Response:
        offer = engine.current_offer(_partner(request.user))
        return Response(CurrentOfferSerializer({"offer": offer, "server_now": timezone.now()}).data)


class OfferAcceptView(APIView):
    """Take the ride. The first captain to accept gets it; the others get 409."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rides_offers_accept",
        request=None,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses=CaptainRideSerializer,
    )
    def post(self, request: Any, offer_id: Any) -> Response:
        key = _required_idempotency_key(request)
        partner = _partner(request.user)

        def command() -> tuple[int, dict[str, Any]]:
            ride = engine.accept_offer(partner=partner, offer_id=offer_id)
            return http_status.HTTP_200_OK, dict(CaptainRideSerializer(ride).data)

        result = execute_idempotent(
            actor=request.user,
            operation="rides.offer.accept",
            key=key,
            request_payload={"offer_id": str(offer_id)},
            command=command,
        )
        response = Response(result.body, status=result.status_code)
        if result.replayed:
            response["Idempotent-Replay"] = "true"
        return response


class OfferDeclineView(APIView):
    """Say no to a ride request. Saying no twice, or after it expired, changes nothing."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(operation_id="partner_rides_offers_decline", request=None, responses={204: None})
    def post(self, request: Any, offer_id: Any) -> Response:
        engine.decline_offer(partner=_partner(request.user), offer_id=offer_id)
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class FareQuotesView(ThrottledWriteMixin, APIView):
    """Upfront fares for a trip: one per vehicle type that can be booked at the pickup."""

    permission_classes = (IsAuthenticated,)
    # Each call costs Google money: 20 a minute per user (brief §5.5), then 429.
    throttle_scope = "rides_quotes"

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
