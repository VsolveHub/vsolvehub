from typing import Any

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsPartnerUser
from apps.rides import selectors, services
from apps.rides.serializers import (
    CaptainStatusSerializer,
    CaptainVehicleSerializer,
    CaptainVehicleWriteSerializer,
)

__all__ = ["CaptainMeView", "CaptainVehicleView"]


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
