"""DRF serializers for V Coins and Referral endpoints."""

from itertools import pairwise
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.loyalty.models import (
    CoinBurnPolicy,
    CoinEarnTier,
    CoinGrantRule,
    CoinTransaction,
    LoyaltySettings,
    ReferralAttribution,
    ReferralProgramRewardTier,
    ReferralProgramVersion,
    ReferralReward,
)


class CoinBurnPolicySerializer(serializers.ModelSerializer[CoinBurnPolicy]):
    class Meta:
        model = CoinBurnPolicy
        fields = ("max_burn_percent", "coin_value_paise")


class CustomerCoinsSummarySerializer(serializers.Serializer[dict[str, object]]):
    spendable_coins = serializers.IntegerField()
    promised_coins = serializers.IntegerField()
    locked_coins = serializers.IntegerField()
    pending_coins = serializers.IntegerField()
    next_pending_available_at = serializers.DateTimeField(allow_null=True)
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
            "status",
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


class WelcomeRewardSerializer(serializers.Serializer[dict[str, object]]):
    """The new customer's own reward for joining with a code, while it is on its way."""

    status = serializers.ChoiceField(
        choices=[ReferralAttribution.Status.PENDING, ReferralAttribution.Status.QUALIFIED]
    )
    wallet_paise = serializers.IntegerField()
    coins = serializers.IntegerField()
    reward_available_at = serializers.DateTimeField(allow_null=True)


class CustomerReferralSummarySerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.CharField()
    share_url = serializers.CharField()
    share_message = serializers.CharField()
    total_earned_paise = serializers.IntegerField()
    total_earned_coins = serializers.IntegerField()
    invited_count = serializers.IntegerField()
    successful_referral_count = serializers.IntegerField()
    pending_referral_count = serializers.IntegerField()
    #: Friends who joined but have not completed a booking yet.
    waiting_booking_count = serializers.IntegerField()
    #: Friends who booked; their reward is waiting out the hold.
    reward_on_the_way_count = serializers.IntegerField()
    on_the_way_paise = serializers.IntegerField()
    on_the_way_coins = serializers.IntegerField()
    #: Days a reward is held after the friend's booking, in case it is cancelled.
    reward_hold_days = serializers.IntegerField()
    welcome_reward = WelcomeRewardSerializer(allow_null=True)
    current_tier_min = serializers.IntegerField(allow_null=True)
    next_tier_min = serializers.IntegerField(allow_null=True)
    referrals_to_next_tier = serializers.IntegerField(allow_null=True)
    active_program = ReferralProgramSummarySerializer()


class ReferralAttributionSerializer(serializers.ModelSerializer[ReferralAttribution]):
    referee_display = serializers.SerializerMethodField()
    reward_wallet_paise = serializers.SerializerMethodField()
    reward_coins = serializers.SerializerMethodField()
    reward_is_estimate = serializers.SerializerMethodField()

    class Meta:
        model = ReferralAttribution
        fields = (
            "id",
            "referee_display",
            "status",
            "attributed_at",
            "qualified_at",
            "reward_available_at",
            "rewarded_at",
            "reward_wallet_paise",
            "reward_coins",
            "reward_is_estimate",
        )

    def _shown(self, obj: ReferralAttribution) -> Any:
        return self.context.get("rewards", {}).get(obj.id)

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_reward_wallet_paise(self, obj: ReferralAttribution) -> int | None:
        """Your reward for this friend: paid, or expected. `null` when there is none."""
        shown = self._shown(obj)
        return None if shown is None else int(shown.wallet_paise)

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_reward_coins(self, obj: ReferralAttribution) -> int | None:
        shown = self._shown(obj)
        return None if shown is None else int(shown.coins)

    @extend_schema_field(serializers.BooleanField())
    def get_reward_is_estimate(self, obj: ReferralAttribution) -> bool:
        """True until paid: a tier, the monthly cap or a refund can still change it."""
        shown = self._shown(obj)
        return True if shown is None else bool(shown.is_estimate)

    def get_referee_display(self, obj: ReferralAttribution) -> str:
        return _mask_phone(obj.referee.phone_number, obj.referee_id)


def _mask_phone(phone: str | None, user_id: object) -> str:
    minimum_phone_digits = 10
    if phone and len(phone) >= minimum_phone_digits:
        return f"{phone[:3]}***{phone[-4:]}"
    return f"User {str(user_id)[:6]}"


class OpsReferralRewardSerializer(serializers.ModelSerializer[ReferralReward]):
    class Meta:
        model = ReferralReward
        fields = ("reward_side", "payout_sequence_n", "wallet_paise", "coins_amount", "paid_at")


class OpsReferralAttributionSerializer(serializers.ModelSerializer[ReferralAttribution]):
    """Operations view: full phone numbers, program version, terms and review trail."""

    referrer_id = serializers.UUIDField(read_only=True)
    referrer_phone = serializers.CharField(source="referrer.phone_number", read_only=True)
    referee_id = serializers.UUIDField(read_only=True)
    referee_phone = serializers.CharField(source="referee.phone_number", read_only=True)
    program_version_code = serializers.CharField(
        source="program_version.version_code", read_only=True
    )
    reviewed_by_phone = serializers.CharField(
        source="reviewed_by.phone_number", read_only=True, allow_null=True, default=None
    )
    rewards = OpsReferralRewardSerializer(many=True, read_only=True)

    class Meta:
        model = ReferralAttribution
        fields = (
            "id",
            "referrer_id",
            "referrer_phone",
            "referee_id",
            "referee_phone",
            "program_version_code",
            "terms_snapshot",
            "status",
            "attributed_at",
            "qualified_at",
            "qualifying_source_type",
            "qualifying_source_id",
            "reward_available_at",
            "rewarded_at",
            "reviewed_by_phone",
            "reviewed_at",
            "review_reason",
            "rewards",
        )


class ReferralReviewSerializer(serializers.Serializer[dict[str, object]]):
    reason = serializers.CharField(max_length=240)


class LoyaltySettingsSerializer(serializers.ModelSerializer[LoyaltySettings]):
    reward_hold_days = serializers.IntegerField(min_value=0, max_value=90, required=False)

    class Meta:
        model = LoyaltySettings
        fields = ("reward_hold_days", "referral_monthly_cap", "updated_at")
        read_only_fields = ("updated_at",)


class CoinAdjustmentSerializer(serializers.Serializer[dict[str, object]]):
    customer_id = serializers.UUIDField()
    amount = serializers.IntegerField(help_text="Positive adds coins, negative deducts.")
    reason = serializers.CharField(max_length=240)

    def validate_amount(self, value: int) -> int:
        if value == 0:
            raise serializers.ValidationError("Enter a non-zero amount.")
        return value


class OpsCustomerLedgerRequestSerializer(serializers.Serializer[dict[str, object]]):
    phone_number = serializers.CharField(max_length=32)


class OpsCoinTransactionSerializer(serializers.ModelSerializer[CoinTransaction]):
    source_type = serializers.CharField(source="grant.source_type", default="", read_only=True)
    source_id = serializers.UUIDField(source="grant.source_id", default=None, read_only=True)
    rule_name = serializers.CharField(source="grant.rule.name", default="", read_only=True)

    class Meta:
        model = CoinTransaction
        fields = (
            "id",
            "kind",
            "status",
            "amount",
            "notes",
            "source_type",
            "source_id",
            "rule_name",
            "payment_attempt",
            "created_at",
        )


class OpsWalletTransactionSerializer(serializers.Serializer[dict[str, object]]):
    id = serializers.UUIDField()
    amount_paise = serializers.IntegerField()
    kind = serializers.CharField()
    status = serializers.CharField()
    notes = serializers.CharField()
    order_id = serializers.UUIDField(allow_null=True)
    created_at = serializers.DateTimeField()


class OpsCustomerLedgerSerializer(serializers.Serializer[dict[str, object]]):
    customer_id = serializers.UUIDField()
    phone_number = serializers.CharField()
    wallet_available_paise = serializers.IntegerField()
    wallet_reserved_paise = serializers.IntegerField()
    coins = serializers.DictField(child=serializers.IntegerField(allow_null=True))
    referral_code = serializers.CharField(allow_blank=True)
    referred_by = OpsReferralAttributionSerializer(allow_null=True)
    referrals_made = OpsReferralAttributionSerializer(many=True)
    wallet_transactions = OpsWalletTransactionSerializer(many=True)
    coin_transactions = OpsCoinTransactionSerializer(many=True)


class ReferralValidateRequestSerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.CharField(max_length=32)


class ReferralValidateResponseSerializer(serializers.Serializer[dict[str, object]]):
    valid = serializers.BooleanField()
    code = serializers.CharField()
    referrer_id = serializers.CharField()
    referee_reward_summary = serializers.CharField()


class CoinEarnTierSerializer(serializers.ModelSerializer[CoinEarnTier]):
    tier_kind = serializers.ChoiceField(choices=CoinEarnTier.TierKind.choices, required=False)
    coins_amount = serializers.IntegerField(min_value=1)

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


_TIER_KIND_FOR_MODE = {
    CoinGrantRule.EarnMode.TIERED_ORDER_VALUE: CoinEarnTier.TierKind.ORDER_VALUE,
    CoinGrantRule.EarnMode.TIERED_BOOKING_SEQUENCE: CoinEarnTier.TierKind.BOOKING_SEQUENCE,
}


class CoinGrantRuleSerializer(serializers.ModelSerializer[CoinGrantRule]):
    """An earn campaign. Tiered modes carry their bands inline in `tiers`."""

    tiers = CoinEarnTierSerializer(many=True, required=False)

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
            "tiers",
        )
        read_only_fields = ("id", "created_at")

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = self.instance
        mode = attrs.get("earn_mode", getattr(instance, "earn_mode", CoinGrantRule.EarnMode.FLAT))
        tiers = attrs.get("tiers")
        if mode == CoinGrantRule.EarnMode.FLAT:
            amount = attrs.get("coins_amount", getattr(instance, "coins_amount", 0))
            if amount <= 0:
                raise serializers.ValidationError({"coins_amount": "Enter the coins to give."})
            if tiers:
                raise serializers.ValidationError({"tiers": "A flat rule has no tiers."})
        elif tiers is not None or instance is None:
            if not tiers:
                raise serializers.ValidationError({"tiers": "Add at least one tier."})
            self._validate_bands(mode, tiers)
        return attrs

    @staticmethod
    def _validate_bands(mode: str, tiers: list[dict[str, Any]]) -> None:
        if mode == CoinGrantRule.EarnMode.TIERED_ORDER_VALUE:
            low_key, high_key = "min_order_paise", "max_order_paise"
        else:
            low_key, high_key = "min_booking_sequence", "max_booking_sequence"
        bands = sorted(((t.get(low_key) or 0), t.get(high_key)) for t in tiers)
        for low, high in bands:
            if high is not None and high < low:
                raise serializers.ValidationError({"tiers": "A tier ends before it starts."})
        for (_low, high), (next_low, _next_high) in pairwise(bands):
            if high is None or high >= next_low:
                raise serializers.ValidationError({"tiers": "Tiers overlap."})

    def _write_tiers(self, rule: CoinGrantRule, tiers: list[dict[str, Any]]) -> None:
        rule.tiers.all().delete()
        kind = _TIER_KIND_FOR_MODE.get(CoinGrantRule.EarnMode(rule.earn_mode))
        if kind is None:
            return
        for index, tier in enumerate(tiers):
            tier.pop("tier_kind", None)
            tier.setdefault("sort_order", index)
            CoinEarnTier.objects.create(grant_rule=rule, tier_kind=kind, **tier)

    def create(self, validated_data: dict[str, Any]) -> CoinGrantRule:
        tiers = validated_data.pop("tiers", [])
        rule = CoinGrantRule.objects.create(**validated_data)
        self._write_tiers(rule, tiers)
        return rule

    def update(self, instance: CoinGrantRule, validated_data: dict[str, Any]) -> CoinGrantRule:
        tiers = validated_data.pop("tiers", None)
        rule = super().update(instance, validated_data)
        if tiers is not None:
            self._write_tiers(rule, tiers)
        return rule


class CoinBurnPolicyWriteSerializer(serializers.ModelSerializer[CoinBurnPolicy]):
    class Meta:
        model = CoinBurnPolicy
        fields = ("id", "max_burn_percent", "coin_value_paise", "is_active", "effective_from")
        read_only_fields = ("id", "is_active", "effective_from")


class ReferralTierWriteSerializer(serializers.Serializer[dict[str, object]]):
    min_qualified_referrals = serializers.IntegerField(min_value=1)
    referrer_coins_amount = serializers.IntegerField(min_value=0, required=False, default=0)
    #: Cash wallet rewards are optional and off unless Operations sets an amount.
    referrer_wallet_paise = serializers.IntegerField(min_value=0, required=False, default=0)


class ReferralProgramWriteSerializer(serializers.Serializer[dict[str, object]]):
    version_code = serializers.CharField(max_length=32)
    reward_sides = serializers.ChoiceField(choices=ReferralProgramVersion.RewardSides.choices)
    referee_wallet_paise = serializers.IntegerField(min_value=0, required=False, default=0)
    referee_coins_amount = serializers.IntegerField(min_value=0)
    tiers = ReferralTierWriteSerializer(many=True, allow_empty=False)


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
