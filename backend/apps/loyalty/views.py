"""Customer V Coins and Referral DRF views (Proposals 0021 & 0022)."""

from typing import cast

from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.loyalty.models import CoinTransaction, ReferralAttribution, ReferralReward
from apps.loyalty.serializers import (
    CoinBurnPreviewRequestSerializer,
    CoinBurnPreviewResponseSerializer,
    CoinTransactionSerializer,
    CustomerCoinsSummarySerializer,
    CustomerReferralSummarySerializer,
    ReferralAttributionSerializer,
    ReferralValidateRequestSerializer,
    ReferralValidateResponseSerializer,
)
from apps.loyalty.services.coins import (
    calculate_coin_burn,
    get_active_burn_policy,
    get_customer_coin_balances,
)
from apps.loyalty.services.referral import (
    ReferralValidationError,
    apply_referral_at_signup,
    get_active_referral_program,
    get_or_create_referral_code,
    validate_referral_code,
)


class CustomerCoinsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Customer V Coins balances across buckets",
        responses={200: CustomerCoinsSummarySerializer},
        tags=["loyalty"],
    )
    def get(self, request: Request) -> Response:
        balances = get_customer_coin_balances(cast(User, request.user))
        policy = get_active_burn_policy()
        data = {
            **balances,
            "active_burn_policy": policy,
        }
        serializer = CustomerCoinsSummarySerializer(data)
        return Response(serializer.data)


class CustomerCoinTransactionsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Customer V Coins activity transactions",
        responses={200: CoinTransactionSerializer(many=True)},
        tags=["loyalty"],
    )
    def get(self, request: Request) -> Response:
        customer = cast(User, request.user)
        txns = CoinTransaction.objects.filter(customer=customer).order_by("-created_at")
        return Response(CoinTransactionSerializer(txns, many=True).data)


class CustomerCoinsBurnPreviewView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Server preview of coin burn math and caps",
        request=CoinBurnPreviewRequestSerializer,
        responses={200: CoinBurnPreviewResponseSerializer},
        tags=["loyalty"],
    )
    def post(self, request: Request) -> Response:
        serializer = CoinBurnPreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order_paise = serializer.validated_data["order_payable_paise"]
        requested_coins = serializer.validated_data["requested_coins"]

        balances = get_customer_coin_balances(cast(User, request.user))
        spendable = balances["spendable_coins"]

        result = calculate_coin_burn(
            order_payable_paise=order_paise,
            requested_coins=requested_coins,
            spendable_coins=spendable,
        )
        return Response(result)


class CustomerReferralView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Customer referral code, share link, and active tier schedule",
        responses={200: CustomerReferralSummarySerializer},
        tags=["referral"],
    )
    def get(self, request: Request) -> Response:
        ref_code = get_or_create_referral_code(cast(User, request.user))
        program = get_active_referral_program()

        # Total earned from referral rewards
        rewards = ReferralReward.objects.filter(
            recipient=cast(User, request.user),
            reward_side=ReferralReward.RewardSide.REFERRER,
        )
        total_earned = sum(r.wallet_paise for r in rewards)
        successful_count = ReferralAttribution.objects.filter(
            referrer=cast(User, request.user),
            status=ReferralAttribution.Status.REWARDED,
        ).count()

        data = {
            "code": ref_code.code,
            "share_url": ref_code.share_url,
            "total_earned_paise": total_earned,
            "successful_referral_count": successful_count,
            "active_program": program,
        }
        serializer = CustomerReferralSummarySerializer(data)
        return Response(serializer.data)


class CustomerReferralAttributionsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Customer's referrals list",
        responses={200: ReferralAttributionSerializer(many=True)},
        tags=["referral"],
    )
    def get(self, request: Request) -> Response:
        attributions = (
            ReferralAttribution.objects.filter(referrer=cast(User, request.user))
            .select_related("referee")
            .order_by("-attributed_at")[:100]  # Hard cap at 100 — most customers have < 20
        )
        return Response(ReferralAttributionSerializer(attributions, many=True).data)


class PublicReferralValidateView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(
        summary="Validate referral code during registration",
        request=ReferralValidateRequestSerializer,
        responses={200: ReferralValidateResponseSerializer},
        tags=["referral"],
    )
    def post(self, request: Request) -> Response:
        serializer = ReferralValidateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        try:
            result = validate_referral_code(code)
            return Response(result)
        except ReferralValidationError as exc:
            raise ValidationError({"code": str(exc)}) from exc


class CustomerReferralApplyView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Apply referral code for the current customer at signup",
        request=ReferralValidateRequestSerializer,
        responses={201: ReferralAttributionSerializer},
        tags=["referral"],
    )
    def post(self, request: Request) -> Response:
        serializer = ReferralValidateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        try:
            attribution = apply_referral_at_signup(referee=cast(User, request.user), code_str=code)
            return Response(
                ReferralAttributionSerializer(attribution).data,
                status=status.HTTP_201_CREATED,
            )
        except ReferralValidationError as exc:
            raise ValidationError({"code": str(exc)}) from exc
