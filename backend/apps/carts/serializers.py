from rest_framework import serializers

from apps.carts.models import CartItem, CheckoutSession, Quote


class CartItemInputSerializer(serializers.Serializer[dict[str, object]]):
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    scope = serializers.DictField(child=serializers.JSONField(), required=False, default=dict)


class CartItemSerializer(serializers.ModelSerializer[CartItem]):
    class Meta:
        model = CartItem
        fields = ("id", "variant_id", "quantity", "scope_schema_snapshot")
        read_only_fields = fields


class QuoteCreateSerializer(serializers.Serializer[dict[str, object]]):
    address_id = serializers.UUIDField()
    requested_start = serializers.DateTimeField()


class QuoteSerializer(serializers.ModelSerializer[Quote]):
    class Meta:
        model = Quote
        fields = (
            "id",
            "task_subtotal_paise",
            "minimum_visit_adjustment_paise",
            "platform_fee_paise",
            "total_paise",
            "estimated_duration_minutes",
            "requested_start",
            "arrival_window_minutes",
            "quote_inputs_snapshot",
            "created_at",
        )
        read_only_fields = fields


class CheckoutCreateSerializer(serializers.Serializer[dict[str, object]]):
    quote_id = serializers.UUIDField()


class AssistedCheckoutCreateSerializer(serializers.Serializer[dict[str, object]]):
    customer_id = serializers.UUIDField()
    quote_id = serializers.UUIDField()
    consent_purpose = serializers.SlugField(max_length=100)
    consent_version = serializers.CharField(max_length=100)


class CheckoutSerializer(serializers.ModelSerializer[CheckoutSession]):
    class Meta:
        model = CheckoutSession
        fields = ("id", "status", "version", "expires_at", "created_at")
        read_only_fields = fields
