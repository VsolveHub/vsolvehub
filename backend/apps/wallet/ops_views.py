"""Operations wallet policy and audited adjustments."""

# ruff: noqa: ARG002

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.partners.permissions import HasRecentOperationsStepUp, IsOperationsUser
from apps.wallet.models import WalletTopUpPolicy
from apps.wallet.serializers import (
    OpsWalletTopUpPolicySerializer,
    WalletAdjustmentSerializer,
    WalletTransactionSerializer,
)
from apps.wallet.services import InsufficientWalletBalanceError, adjust_wallet


class OpsWalletPolicyListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(tags=["operations"], responses={200: OpsWalletTopUpPolicySerializer(many=True)})
    def get(self, request: Request) -> Response:
        policies = WalletTopUpPolicy.objects.all().order_by("-effective_from")
        return Response(OpsWalletTopUpPolicySerializer(policies, many=True).data)

    @extend_schema(
        tags=["operations"],
        request=OpsWalletTopUpPolicySerializer,
        responses={201: OpsWalletTopUpPolicySerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = OpsWalletTopUpPolicySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        WalletTopUpPolicy.objects.filter(is_active=True).update(is_active=False)
        policy = serializer.save(is_active=True)
        return Response(OpsWalletTopUpPolicySerializer(policy).data, status=status.HTTP_201_CREATED)


class OpsWalletAdjustmentView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=["operations"],
        request=WalletAdjustmentSerializer,
        responses={201: WalletTransactionSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = WalletAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = get_object_or_404(User, id=serializer.validated_data["customer_id"])
        try:
            txn = adjust_wallet(
                user=customer,
                amount_paise=serializer.validated_data["amount_paise"],
                reason=serializer.validated_data["reason"],
                idempotency_key=serializer.validated_data["idempotency_key"],
            )
        except (InsufficientWalletBalanceError, ValueError) as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(WalletTransactionSerializer(txn).data, status=status.HTTP_201_CREATED)
