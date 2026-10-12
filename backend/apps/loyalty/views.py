"""Customer V Coins and Referral DRF views (Proposals 0021 & 0022)."""

from typing import cast

from django.db.models import Sum
from drf_spectacular.utils import extend_schema
from rest_framework import permissions
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
    get_loyalty_settings,
)
from apps.loyalty.services.referral import (
    ReferralValidationError,
    get_active_referral_program,
    get_or_create_referral_code,
    referee_reward_summary,
    referrer_rewards_for,
    validate_referral_code,
    welcome_reward_for,
)
from common.pagination import (
    CURSOR_PARAMETER,
    OPERATIONS_PAGE_SIZE,
    NewestFirstPagination,
    page_serializer,
    paginated,
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


class ReferralPagination(NewestFirstPagination):
    """Referrals carry `attributed_at` rather than `created_at`."""

    ordering = ("-attributed_at", "-id")


class OpsReferralPagination(ReferralPagination):
    page_size = OPERATIONS_PAGE_SIZE


class CustomerCoinTransactionsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Customer V Coins activity transactions",
        parameters=[CURSOR_PARAMETER],
        responses={200: page_serializer(CoinTransactionSerializer, "CoinTransactionPage")},
        tags=["loyalty"],
    )
    def get(self, request: Request) -> Response:
        customer = cast(User, request.user)
        txns = CoinTransaction.objects.filter(customer=customer)
        return paginated(request, self, txns, CoinTransactionSerializer)


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
        user = cast(User, request.user)
        ref_code = get_or_create_referral_code(user)
        program = get_active_referral_program()

        made = ReferralAttribution.objects.filter(referrer=user)
        successful = made.filter(status=ReferralAttribution.Status.REWARDED).count()
        waiting_booking = made.filter(status=ReferralAttribution.Status.PENDING).count()
        # Booked friends whose reward is waiting out the hold, priced as the sweep will pay them.
        on_the_way = list(
            made.filter(status=ReferralAttribution.Status.QUALIFIED)
            .select_related("program_version")
            .prefetch_related("program_version__tiers")
        )
        on_the_way_rewards = [
            shown for shown in referrer_rewards_for(user, on_the_way).values() if shown is not None
        ]
        pending = made.filter(
            status__in=(
                ReferralAttribution.Status.PENDING,
                ReferralAttribution.Status.QUALIFIED,
            )
        ).count()
        # Rewards from referrals Operations later reversed do not count as earned.
        earned = ReferralReward.objects.filter(
            recipient=user,
            reward_side=ReferralReward.RewardSide.REFERRER,
            attribution__status=ReferralAttribution.Status.REWARDED,
        ).aggregate(coins=Sum("coins_amount"), paise=Sum("wallet_paise"))

        # Tier for the referrer's *next* payout, and how many more until a better one.
        tier_minimums = sorted(t.min_qualified_referrals for t in program.tiers.all())
        next_payout = successful + 1
        current = max((m for m in tier_minimums if m <= next_payout), default=None)
        upcoming = min((m for m in tier_minimums if m > next_payout), default=None)

        data = {
            "code": ref_code.code,
            "share_url": ref_code.share_url,
            "share_message": (
                "Join V Solve Hub using my link. "
                f"{referee_reward_summary(program)} {ref_code.share_url}"
            ),
            "total_earned_paise": earned["paise"] or 0,
            "total_earned_coins": earned["coins"] or 0,
            "invited_count": made.count(),
            "successful_referral_count": successful,
            "pending_referral_count": pending,
            "waiting_booking_count": waiting_booking,
            "reward_on_the_way_count": len(on_the_way),
            "on_the_way_paise": sum(shown.wallet_paise for shown in on_the_way_rewards),
            "on_the_way_coins": sum(shown.coins for shown in on_the_way_rewards),
            "reward_hold_days": get_loyalty_settings().reward_hold_days,
            "welcome_reward": welcome_reward_for(user),
            "current_tier_min": current,
            "next_tier_min": upcoming,
            "referrals_to_next_tier": (upcoming - successful) if upcoming else None,
            "active_program": program,
        }
        serializer = CustomerReferralSummarySerializer(data)
        return Response(serializer.data)


class CustomerReferralAttributionsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Customer's referrals list",
        parameters=[CURSOR_PARAMETER],
        responses={200: page_serializer(ReferralAttributionSerializer, "ReferralAttributionPage")},
        tags=["referral"],
    )
    def get(self, request: Request) -> Response:
        user = cast(User, request.user)
        attributions = (
            ReferralAttribution.objects.filter(referrer=user)
            .select_related("referee", "program_version")
            .prefetch_related("rewards", "program_version__tiers")
        )
        paginator = ReferralPagination()
        page = list(paginator.paginate_queryset(attributions, request, self) or [])
        rewards = referrer_rewards_for(user, page)
        return paginator.get_paginated_response(
            ReferralAttributionSerializer(
                page, many=True, context={"request": request, "rewards": rewards}
            ).data
        )


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
