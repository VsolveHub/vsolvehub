"""Kill switches: read the board, stop a capability, start it again.

Operations-only and audited by `IsOperationsUser`. No step-up on engage — the moment you need to
stop sending is the moment you cannot wait for anything, and a control that is hard to reach in
an incident is a control nobody uses. Releasing is equally light for the same reason.

The audit lives in the row itself: actor, reason and timestamp for both directions.
"""

from typing import cast

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.notifications.models import KillSwitch
from apps.notifications.serializers import (
    EngageKillSwitchRequestSerializer,
    KillSwitchSerializer,
    ReleaseKillSwitchRequestSerializer,
)
from apps.notifications.services import engage_kill_switch, release_kill_switch
from apps.partners.permissions import IsOperationsUser
from common.errors.serializers import ApiErrorSerializer

OPERATIONS_TAG = "Operations"


class KillSwitchListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_kill_switches_list",
        responses={200: KillSwitchSerializer(many=True), 403: ApiErrorSerializer},
    )
    def get(self, _request: Request) -> Response:
        switches = KillSwitch.objects.all().order_by("scope", "target")
        return Response(KillSwitchSerializer(switches, many=True).data)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_kill_switch_engage",
        request=EngageKillSwitchRequestSerializer,
        responses={200: KillSwitchSerializer, 400: ApiErrorSerializer, 403: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = EngageKillSwitchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        switch = engage_kill_switch(
            scope=serializer.validated_data["scope"],
            target=serializer.validated_data["target"],
            reason=serializer.validated_data["reason"],
            actor=cast(User, request.user),
        )
        return Response(KillSwitchSerializer(switch).data)


class KillSwitchReleaseView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_kill_switch_release",
        request=ReleaseKillSwitchRequestSerializer,
        responses={200: KillSwitchSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = ReleaseKillSwitchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        switch = release_kill_switch(
            scope=serializer.validated_data["scope"],
            target=serializer.validated_data["target"],
            actor=cast(User, request.user),
        )
        if switch is None:
            return Response({"detail": "No such kill switch."}, status=status.HTTP_404_NOT_FOUND)
        return Response(KillSwitchSerializer(switch).data)
