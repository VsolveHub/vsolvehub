"""DRF serializers for customer wallet and top-up operations."""

from rest_framework import serializers

from apps.wallet.models import WalletAccount, WalletTopUpPolicy, WalletTransaction


class WalletTopUpPolicySerializer(serializers.ModelSerializer[WalletTopUpPolicy]):
    min_top_up_paise = serializers.IntegerField(source="min_paise")
    max_top_up_paise = serializers.IntegerField(source="max_paise")

    class Meta:
        model = WalletTopUpPolicy
        fields = ("min_top_up_paise", "max_top_up_paise")


class WalletAccountSerializer(serializers.ModelSerializer[WalletAccount]):
    wallet_id = serializers.UUIDField(source="id")
    currency = serializers.CharField(default="INR")
    balance_paise = serializers.IntegerField(read_only=True)
    available_balance_paise = serializers.IntegerField(read_only=True)
    reserved_paise = serializers.IntegerField(read_only=True)
    top_up_policy = serializers.SerializerMethodField()

    class Meta:
        model = WalletAccount
        fields = (
            "wallet_id",
            "currency",
            "balance_paise",
            "available_balance_paise",
            "reserved_paise",
            "top_up_policy",
        )

    def get_top_up_policy(self, obj: WalletAccount) -> dict[str, int]:  # noqa: ARG002
        policy = (
            WalletTopUpPolicy.objects.filter(is_active=True).order_by("-effective_from").first()
        )
        if policy is None:
            return {"min_top_up_paise": 10000, "max_top_up_paise": 1000000}
        return {
            "min_top_up_paise": policy.min_paise,
            "max_top_up_paise": policy.max_paise,
        }


class WalletTransactionSerializer(serializers.ModelSerializer[WalletTransaction]):
    class Meta:
        model = WalletTransaction
        fields = (
            "id",
            "amount_paise",
            "kind",
            "status",
            "idempotency_key",
            "notes",
            "created_at",
        )


class WalletTopUpRequestSerializer(serializers.Serializer[dict[str, object]]):
    amount_paise = serializers.IntegerField(min_value=1)
    idempotency_key = serializers.CharField(max_length=128, required=False, default="")


class WalletTopUpResponseSerializer(serializers.Serializer[dict[str, object]]):
    payment_attempt_id = serializers.UUIDField()
    purpose = serializers.CharField()
    amount_paise = serializers.IntegerField()
    currency = serializers.CharField()
    provider = serializers.CharField()
    provider_order_id = serializers.CharField(allow_blank=True)
    status = serializers.CharField()


class WalletLiabilityReportSerializer(serializers.Serializer[dict[str, object]]):
    total_liability_paise = serializers.IntegerField()
    currency = serializers.CharField(default="INR")
    active_wallets_count = serializers.IntegerField()


class OpsWalletTopUpPolicySerializer(serializers.ModelSerializer[WalletTopUpPolicy]):
    class Meta:
        model = WalletTopUpPolicy
        fields = ("id", "min_paise", "max_paise", "is_active", "effective_from")
        read_only_fields = ("id", "is_active", "effective_from")


class WalletAdjustmentSerializer(serializers.Serializer[dict[str, object]]):
    customer_id = serializers.UUIDField()
    amount_paise = serializers.IntegerField()
    reason = serializers.CharField(max_length=240)
    idempotency_key = serializers.CharField(max_length=128)
