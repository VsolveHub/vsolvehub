"""DRF serializers for V Coins and Referral endpoints."""

from rest_framework import serializers

from apps.loyalty.models import (
    CoinBurnPolicy,
    CoinEarnTier,
    CoinGrantRule,
    CoinTransaction,
    ReferralAttribution,
    ReferralProgramRewardTier,
    ReferralProgramVersion,
)


class CoinBurnPolicySerializer(serializers.ModelSerializer[CoinBurnPolicy]):
    class Meta:
        model = CoinBurnPolicy
        fields = ("max_burn_percent", "coin_value_paise")


class CustomerCoinsSummarySerializer(serializers.Serializer[dict[str, object]]):
    spendable_coins = serializers.IntegerField()
    promised_coins = serializers.IntegerField()
    locked_coins = serializers.IntegerField()
    expiring_soon_coins = serializers.IntegerField()
    active_burn_policy = CoinBurnPolicySerializer()


class CoinBurnPreviewRequestSerializer(serializers.Serializer[dict[str, object]]):
    order_payable_paise = serializers.IntegerField(min_value=1)
    requested_coins = serializers.IntegerField(min_value=0)


class CoinBurnPreviewResponseSerializer(serializers.Serializer[dict[str, object]]):
    order_payable_paise = serializers.IntegerField()
    spendable_coins = serializers.IntegerField()
    max_burn_paise = serializers.IntegerField()
    max_burn_coins = serializers.IntegerField()
    applied_burn_coins = serializers.IntegerField()
    discount_paise = serializers.IntegerField()
    remaining_payable_paise = serializers.IntegerField()


class CoinTransactionSerializer(serializers.ModelSerializer[CoinTransaction]):
    class Meta:
        model = CoinTransaction
        fields = (
            "id",
            "kind",
            "amount",
            "notes",
            "created_at",
        )


class ReferralRewardTierSerializer(serializers.ModelSerializer[ReferralProgramRewardTier]):
    class Meta:
        model = ReferralProgramRewardTier
        fields = (
            "min_qualified_referrals",
            "referrer_wallet_paise",
            "referrer_coins_amount",
            "referee_wallet_paise",
            "referee_coins_amount",
        )


class ReferralProgramSummarySerializer(serializers.ModelSerializer[ReferralProgramVersion]):
    tiers = ReferralRewardTierSerializer(many=True, read_only=True)

    class Meta:
        model = ReferralProgramVersion
        fields = (
            "version_code",
            "reward_sides",
            "referee_wallet_paise",
            "referee_coins_amount",
            "tiers",
        )


class CustomerReferralSummarySerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.CharField()
    share_url = serializers.CharField()
    total_earned_paise = serializers.IntegerField()
    successful_referral_count = serializers.IntegerField()
    active_program = ReferralProgramSummarySerializer()


class ReferralAttributionSerializer(serializers.ModelSerializer[ReferralAttribution]):
    referee_display = serializers.SerializerMethodField()

    class Meta:
        model = ReferralAttribution
        fields = (
            "id",
            "referee_display",
            "status",
            "attributed_at",
            "qualified_at",
            "rewarded_at",
        )

    def get_referee_display(self, obj: ReferralAttribution) -> str:
        phone = obj.referee.phone_number
        minimum_phone_digits = 10
        if phone and len(phone) >= minimum_phone_digits:
            return f"{phone[:3]}***{phone[-4:]}"
        return f"User {str(obj.referee_id)[:6]}"


class ReferralValidateRequestSerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.CharField(max_length=32)


class ReferralValidateResponseSerializer(serializers.Serializer[dict[str, object]]):
    valid = serializers.BooleanField()
    code = serializers.CharField()
    referrer_id = serializers.CharField()
    referee_reward_summary = serializers.CharField()


class CoinGrantRuleSerializer(serializers.ModelSerializer[CoinGrantRule]):
    class Meta:
        model = CoinGrantRule
        fields = (
            "id",
            "name",
            "earn_mode",
            "coins_amount",
            "completions_required",
            "grant_trigger",
            "customer_eligibility",
            "reactivation_inactive_days",
            "expires_at",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "created_at")


class CoinEarnTierSerializer(serializers.ModelSerializer[CoinEarnTier]):
    class Meta:
        model = CoinEarnTier
        fields = (
            "id",
            "tier_kind",
            "min_order_paise",
            "max_order_paise",
            "min_booking_sequence",
            "max_booking_sequence",
            "coins_amount",
            "sort_order",
        )
        read_only_fields = ("id",)


class CoinBurnPolicyWriteSerializer(serializers.ModelSerializer[CoinBurnPolicy]):
    class Meta:
        model = CoinBurnPolicy
        fields = ("id", "max_burn_percent", "coin_value_paise", "is_active", "effective_from")
        read_only_fields = ("id", "is_active", "effective_from")


class ReferralTierWriteSerializer(serializers.Serializer[dict[str, object]]):
    min_qualified_referrals = serializers.IntegerField(min_value=1)
    referrer_wallet_paise = serializers.IntegerField(min_value=0)
    referrer_coins_amount = serializers.IntegerField(min_value=0, required=False, default=0)


class ReferralProgramWriteSerializer(serializers.Serializer[dict[str, object]]):
    version_code = serializers.CharField(max_length=32)
    reward_sides = serializers.ChoiceField(choices=ReferralProgramVersion.RewardSides.choices)
    referee_wallet_paise = serializers.IntegerField(min_value=0)
    referee_coins_amount = serializers.IntegerField(min_value=0)
    tiers = ReferralTierWriteSerializer(many=True)


class ReferralProgramVersionSerializer(serializers.ModelSerializer[ReferralProgramVersion]):
    tiers = ReferralRewardTierSerializer(many=True, read_only=True)

    class Meta:
        model = ReferralProgramVersion
        fields = (
            "id",
            "version_code",
            "reward_sides",
            "referee_wallet_paise",
            "referee_coins_amount",
            "is_active",
            "effective_from",
            "effective_until",
            "tiers",
        )
