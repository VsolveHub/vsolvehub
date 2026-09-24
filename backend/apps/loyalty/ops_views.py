"""Operations configuration for V Coins and referral programs."""

# Request is part of the DRF signature even when a read does not use it.
# ruff: noqa: ARG002

from uuid import UUID

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.loyalty.models import (
    CoinBurnPolicy,
    CoinEarnTier,
    CoinGrant,
    CoinGrantRule,
    ReferralAttribution,
    ReferralProgramVersion,
)
from apps.loyalty.serializers import (
    CoinBurnPolicyWriteSerializer,
    CoinEarnTierSerializer,
    CoinGrantRuleSerializer,
    ReferralAttributionSerializer,
    ReferralProgramVersionSerializer,
    ReferralProgramWriteSerializer,
)
from apps.loyalty.services.referral import publish_referral_program
from apps.partners.permissions import IsOperationsUser

_IMMUTABLE_WHEN_USED = frozenset(
    {"earn_mode", "coins_amount", "completions_required", "grant_trigger"}
)


class OpsCoinGrantRuleListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(tags=["operations"], responses={200: CoinGrantRuleSerializer(many=True)})
    def get(self, request: Request) -> Response:
        rules = CoinGrantRule.objects.all().order_by("-created_at")
        return Response(CoinGrantRuleSerializer(rules, many=True).data)

    @extend_schema(
        tags=["operations"],
        request=CoinGrantRuleSerializer,
        responses={201: CoinGrantRuleSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = CoinGrantRuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = serializer.save()
        return Response(CoinGrantRuleSerializer(rule).data, status=status.HTTP_201_CREATED)


class OpsCoinGrantRuleDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(tags=["operations"], responses={200: CoinGrantRuleSerializer})
    def get(self, request: Request, rule_id: UUID) -> Response:
        rule = get_object_or_404(CoinGrantRule, id=rule_id)
        return Response(CoinGrantRuleSerializer(rule).data)

    @extend_schema(
        tags=["operations"],
        request=CoinGrantRuleSerializer,
        responses={200: CoinGrantRuleSerializer},
    )
    def patch(self, request: Request, rule_id: UUID) -> Response:
        rule = get_object_or_404(CoinGrantRule, id=rule_id)
        if CoinGrant.objects.filter(rule=rule).exists():
            blocked = _IMMUTABLE_WHEN_USED.intersection(request.data.keys())
            if blocked:
                raise ValidationError(
                    {"detail": "This rule has already granted coins. Publish a new rule instead."}
                )
        serializer = CoinGrantRuleSerializer(rule, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class OpsCoinEarnTierListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(tags=["operations"], responses={200: CoinEarnTierSerializer(many=True)})
    def get(self, request: Request, rule_id: UUID) -> Response:
        tiers = CoinEarnTier.objects.filter(grant_rule_id=rule_id)
        return Response(CoinEarnTierSerializer(tiers, many=True).data)

    @extend_schema(
        tags=["operations"], request=CoinEarnTierSerializer, responses={201: CoinEarnTierSerializer}
    )
    def post(self, request: Request, rule_id: UUID) -> Response:
        rule = get_object_or_404(CoinGrantRule, id=rule_id)
        serializer = CoinEarnTierSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tier = serializer.save(grant_rule=rule)
        return Response(CoinEarnTierSerializer(tier).data, status=status.HTTP_201_CREATED)


class OpsCoinBurnPolicyListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(tags=["operations"], responses={200: CoinBurnPolicyWriteSerializer(many=True)})
    def get(self, request: Request) -> Response:
        policies = CoinBurnPolicy.objects.all().order_by("-effective_from")
        return Response(CoinBurnPolicyWriteSerializer(policies, many=True).data)

    @extend_schema(
        tags=["operations"],
        request=CoinBurnPolicyWriteSerializer,
        responses={201: CoinBurnPolicyWriteSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = CoinBurnPolicyWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        CoinBurnPolicy.objects.filter(is_active=True).update(is_active=False)
        policy = serializer.save(is_active=True)
        return Response(CoinBurnPolicyWriteSerializer(policy).data, status=status.HTTP_201_CREATED)


class OpsReferralProgramListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["operations"], responses={200: ReferralProgramVersionSerializer(many=True)}
    )
    def get(self, request: Request) -> Response:
        programs = ReferralProgramVersion.objects.prefetch_related("tiers").order_by(
            "-effective_from"
        )
        return Response(ReferralProgramVersionSerializer(programs, many=True).data)

    @extend_schema(
        tags=["operations"],
        request=ReferralProgramWriteSerializer,
        responses={201: ReferralProgramVersionSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = ReferralProgramWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            program = publish_referral_program(
                version_code=data["version_code"],
                reward_sides=data["reward_sides"],
                referee_wallet_paise=data["referee_wallet_paise"],
                referee_coins_amount=data["referee_coins_amount"],
                tiers=list(data["tiers"]),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        program = ReferralProgramVersion.objects.prefetch_related("tiers").get(id=program.id)
        return Response(
            ReferralProgramVersionSerializer(program).data, status=status.HTTP_201_CREATED
        )


class OpsReferralAttributionListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(tags=["operations"], responses={200: ReferralAttributionSerializer(many=True)})
    def get(self, request: Request) -> Response:
        rows = ReferralAttribution.objects.select_related("referee", "program_version").order_by(
            "-attributed_at"
        )[:200]
        return Response(ReferralAttributionSerializer(rows, many=True).data)
