"""Operations configuration for V Coins and referral programs."""

# Request is part of the DRF signature even when a read does not use it.
# ruff: noqa: ARG002

from typing import cast
from uuid import UUID

from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.identity.phone import normalize_phone_number
from apps.loyalty.models import (
    CoinBurnPolicy,
    CoinGrant,
    CoinGrantRule,
    CoinTransaction,
    ReferralAttribution,
    ReferralCode,
    ReferralProgramVersion,
)
from apps.loyalty.serializers import (
    CoinAdjustmentSerializer,
    CoinBurnPolicyWriteSerializer,
    CoinGrantRuleSerializer,
    LoyaltySettingsSerializer,
    OpsCustomerLedgerRequestSerializer,
    OpsCustomerLedgerSerializer,
    OpsReferralAttributionSerializer,
    ReferralProgramVersionSerializer,
    ReferralProgramWriteSerializer,
    ReferralReviewSerializer,
)
from apps.loyalty.services.coins import (
    InsufficientCoinsError,
    adjust_coins,
    get_customer_coin_balances,
    get_loyalty_settings,
)
from apps.loyalty.services.referral import (
    ReferralReviewError,
    publish_referral_program,
    reject_referral,
    reverse_referral,
)
from apps.partners.permissions import HasRecentOperationsStepUp, IsOperationsUser
from apps.wallet.models import WalletTransaction
from apps.wallet.services import get_or_create_wallet

_IMMUTABLE_WHEN_USED = frozenset(
    {"earn_mode", "coins_amount", "completions_required", "grant_trigger", "tiers"}
)


class OpsCoinGrantRuleListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(tags=["operations"], responses={200: CoinGrantRuleSerializer(many=True)})
    def get(self, request: Request) -> Response:
        rules = CoinGrantRule.objects.prefetch_related("tiers").order_by("-created_at")
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
                referee_wallet_paise=data.get("referee_wallet_paise", 0),
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
    """Referral review queue. Filter with `?status=PENDING|QUALIFIED|REWARDED|INELIGIBLE|REVERSED`
    and `?phone=` (referrer or referee)."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["operations"],
        parameters=[
            OpenApiParameter("status", str, required=False),
            OpenApiParameter("phone", str, required=False),
        ],
        responses={200: OpsReferralAttributionSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = ReferralAttribution.objects.select_related(
            "referrer", "referee", "program_version", "reviewed_by"
        ).prefetch_related("rewards")
        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            rows = rows.filter(status=status_filter)
        phone = request.query_params.get("phone", "").strip()
        if phone:
            rows = rows.filter(
                Q(referrer__phone_number__icontains=phone)
                | Q(referee__phone_number__icontains=phone)
            )
        rows = rows.order_by("-attributed_at")[:200]
        return Response(OpsReferralAttributionSerializer(rows, many=True).data)


class _OpsReferralReviewView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)
    review_command = staticmethod(reject_referral)

    def _review(self, request: Request, attribution_id: UUID) -> Response:
        serializer = ReferralReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        get_object_or_404(ReferralAttribution, id=attribution_id)
        try:
            attribution = type(self).review_command(
                attribution_id=attribution_id,
                actor=cast(User, request.user),
                reason=serializer.validated_data["reason"],
            )
        except ReferralReviewError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        attribution = (
            ReferralAttribution.objects.select_related(
                "referrer", "referee", "program_version", "reviewed_by"
            )
            .prefetch_related("rewards")
            .get(id=attribution.id)
        )
        return Response(OpsReferralAttributionSerializer(attribution).data)


class OpsReferralRejectView(_OpsReferralReviewView):
    review_command = staticmethod(reject_referral)

    @extend_schema(
        tags=["operations"],
        request=ReferralReviewSerializer,
        responses={200: OpsReferralAttributionSerializer},
    )
    def post(self, request: Request, attribution_id: UUID) -> Response:
        return self._review(request, attribution_id)


class OpsReferralReverseView(_OpsReferralReviewView):
    review_command = staticmethod(reverse_referral)

    @extend_schema(
        tags=["operations"],
        request=ReferralReviewSerializer,
        responses={200: OpsReferralAttributionSerializer},
    )
    def post(self, request: Request, attribution_id: UUID) -> Response:
        return self._review(request, attribution_id)


class OpsLoyaltySettingsView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(tags=["operations"], responses={200: LoyaltySettingsSerializer})
    def get(self, request: Request) -> Response:
        return Response(LoyaltySettingsSerializer(get_loyalty_settings()).data)

    @extend_schema(
        tags=["operations"],
        request=LoyaltySettingsSerializer,
        responses={200: LoyaltySettingsSerializer},
    )
    def patch(self, request: Request) -> Response:
        row = get_loyalty_settings()
        serializer = LoyaltySettingsSerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=cast(User, request.user))
        return Response(serializer.data)


class OpsCustomerLedgerView(APIView):
    """One customer's wallet, coin and referral history for support and audit."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["operations"],
        parameters=[OpenApiParameter("phone_number", str, required=True)],
        responses={200: OpsCustomerLedgerSerializer},
    )
    def get(self, request: Request) -> Response:
        query = OpsCustomerLedgerRequestSerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            phone = normalize_phone_number(query.validated_data["phone_number"])
        except ValueError as exc:
            raise ValidationError({"phone_number": str(exc)}) from exc
        customer = get_object_or_404(User, phone_number=phone)
        wallet = get_or_create_wallet(customer)
        balances = get_customer_coin_balances(customer)
        referral_code = ReferralCode.objects.filter(user=customer).first()
        attributions = ReferralAttribution.objects.select_related(
            "referrer", "referee", "program_version", "reviewed_by"
        ).prefetch_related("rewards")
        data = {
            "customer_id": customer.id,
            "phone_number": customer.phone_number,
            "wallet_available_paise": wallet.available_balance_paise,
            "wallet_reserved_paise": wallet.reserved_paise,
            "coins": {k: v for k, v in balances.items() if isinstance(v, int)},
            "referral_code": referral_code.code if referral_code else "",
            "referred_by": attributions.filter(referee=customer).first(),
            "referrals_made": list(
                attributions.filter(referrer=customer).order_by("-attributed_at")[:100]
            ),
            "wallet_transactions": list(
                WalletTransaction.objects.filter(wallet=wallet).order_by("-created_at")[:100]
            ),
            "coin_transactions": list(
                CoinTransaction.objects.filter(customer=customer)
                .select_related("grant__rule")
                .order_by("-created_at")[:100]
            ),
        }
        return Response(OpsCustomerLedgerSerializer(data).data)


class OpsCoinAdjustmentView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=["operations"],
        request=CoinAdjustmentSerializer,
        responses={201: CoinAdjustmentSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = CoinAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = get_object_or_404(User, id=serializer.validated_data["customer_id"])
        reason = serializer.validated_data["reason"]
        try:
            adjust_coins(
                customer=customer,
                amount=serializer.validated_data["amount"],
                reason=f"{reason} (by {cast(User, request.user).phone_number})",
            )
        except (InsufficientCoinsError, ValueError) as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(serializer.data, status=status.HTTP_201_CREATED)
