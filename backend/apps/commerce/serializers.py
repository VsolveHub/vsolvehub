"""Typed public projections for group payments, refunds and financial documents."""

from typing import cast

from django.conf import settings
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.commerce.models import (
    Booking,
    Order,
    PaymentAllocation,
    PaymentAttempt,
    Refund,
    RefundAllocation,
    TaxDocument,
    TaxDocumentLine,
)
from apps.commerce.providers import FakePaymentProvider
from common.serializers import MoneySerializer


class PaymentAttemptCreateSerializer(serializers.Serializer[dict[str, object]]):
    checkout_id = serializers.UUIDField()
    expected_checkout_version = serializers.IntegerField(min_value=1)


class PaymentAllocationSerializer(serializers.ModelSerializer[PaymentAllocation]):
    fulfilment_unit_id = serializers.UUIDField(read_only=True)
    fulfilment_line_id = serializers.UUIDField(read_only=True)
    amount = serializers.SerializerMethodField()
    refunded = serializers.SerializerMethodField()

    class Meta:
        model = PaymentAllocation
        fields = (
            "id",
            "fulfilment_unit_id",
            "fulfilment_line_id",
            "position",
            "amount",
            "refunded",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_amount(allocation: PaymentAllocation) -> dict[str, object]:
        return {"amount_paise": allocation.amount_paise, "currency": allocation.currency}

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_refunded(allocation: PaymentAllocation) -> dict[str, object]:
        return {"amount_paise": allocation.refunded_paise, "currency": allocation.currency}


class PaymentAttemptSerializer(serializers.ModelSerializer[PaymentAttempt]):
    checkout_id = serializers.UUIDField(read_only=True)
    booking_group_id = serializers.UUIDField(read_only=True)
    quote_id = serializers.UUIDField(read_only=True)
    amount = serializers.SerializerMethodField()
    allocations = PaymentAllocationSerializer(many=True, read_only=True)
    provider_public_key = serializers.SerializerMethodField()
    simulated_capture_available = serializers.SerializerMethodField()

    class Meta:
        model = PaymentAttempt
        fields = (
            "id",
            "checkout_id",
            "booking_group_id",
            "quote_id",
            "purpose",
            "provider",
            "provider_public_key",
            "simulated_capture_available",
            "provider_order_id",
            "status",
            "reconciliation_state",
            "failure_code",
            "version",
            "amount",
            "expires_at",
            "allocations",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.BooleanField())
    def get_simulated_capture_available(attempt: PaymentAttempt) -> bool:
        """Whether this attempt can be marked captured without a provider.

        Published rather than inferred. The alternative is a client that renders
        a "mark as paid" control everywhere and discovers by 404 that it does not
        apply — which means the control appears, briefly, on production. The
        server already knows both halves of the answer; saying so is the same
        reasoning that publishes `recovery_action` instead of deriving it from a
        status.
        """
        return bool(settings.PAYMENTS_ALLOW_SIMULATED_CAPTURE) and (
            attempt.provider == FakePaymentProvider.code
        )

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_amount(attempt: PaymentAttempt) -> dict[str, object]:
        return {"amount_paise": attempt.amount_paise, "currency": attempt.currency}

    @staticmethod
    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_provider_public_key(attempt: PaymentAttempt) -> str | None:
        if attempt.provider == "razorpay":
            return cast(str, settings.RAZORPAY_KEY_ID)
        return None


class RefundCreateSerializer(serializers.Serializer[dict[str, object]]):
    order_id = serializers.UUIDField()
    fulfilment_unit_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        max_length=20,
    )
    reason_code = serializers.SlugField(max_length=80)

    def validate_fulfilment_unit_ids(self, values: list[object]) -> list[object]:
        if len(values) != len(set(values)):
            raise serializers.ValidationError("Fulfilment Unit identifiers must be unique.")
        return values


class RefundAllocationSerializer(serializers.ModelSerializer[RefundAllocation]):
    payment_allocation_id = serializers.UUIDField(read_only=True)
    fulfilment_unit_id = serializers.UUIDField(
        source="payment_allocation.fulfilment_unit_id",
        read_only=True,
    )
    amount = serializers.SerializerMethodField()

    class Meta:
        model = RefundAllocation
        fields = ("id", "payment_allocation_id", "fulfilment_unit_id", "amount")
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_amount(allocation: RefundAllocation) -> dict[str, object]:
        return {
            "amount_paise": allocation.amount_paise,
            "currency": allocation.refund.currency,
        }


class RefundSerializer(serializers.ModelSerializer[Refund]):
    order_id = serializers.UUIDField(read_only=True, allow_null=True)
    payment_attempt_id = serializers.UUIDField(read_only=True, allow_null=True)
    amount = serializers.SerializerMethodField()
    allocations = RefundAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = Refund
        fields = (
            "id",
            "order_id",
            "payment_attempt_id",
            "status",
            "reason_code",
            "reconciliation_state",
            "failure_code",
            "provider_refund_id",
            "amount",
            "allocations",
            "created_at",
            "submitted_at",
            "completed_at",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_amount(refund: Refund) -> dict[str, object]:
        return {"amount_paise": refund.amount_paise, "currency": refund.currency}


class BookingSerializer(serializers.ModelSerializer[Booking]):
    fulfilment_unit_id = serializers.UUIDField(read_only=True, allow_null=True)
    reservation_id = serializers.UUIDField(read_only=True)
    partner_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Booking
        fields = (
            "id",
            "fulfilment_unit_id",
            "reservation_id",
            "partner_id",
            "scheduled_start",
            "estimated_duration_minutes",
            "created_at",
        )
        read_only_fields = fields


class TaxDocumentLineSerializer(serializers.ModelSerializer[TaxDocumentLine]):
    total = serializers.SerializerMethodField()
    tax = serializers.SerializerMethodField()

    class Meta:
        model = TaxDocumentLine
        fields = ("id", "position", "code", "label", "quantity", "total", "tax")
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_total(line: TaxDocumentLine) -> dict[str, object]:
        return {"amount_paise": line.total_paise, "currency": line.currency}

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_tax(line: TaxDocumentLine) -> dict[str, object]:
        return {"amount_paise": line.tax_paise, "currency": line.currency}


class TaxDocumentSerializer(serializers.ModelSerializer[TaxDocument]):
    number = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    lines = TaxDocumentLineSerializer(many=True, read_only=True)

    class Meta:
        model = TaxDocument
        fields = (
            "id",
            "kind",
            "number",
            "legal_entity_code",
            "financial_year",
            "is_test",
            "issued_at",
            "total",
            "tax_snapshot",
            "lines",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.CharField())
    def get_number(document: TaxDocument) -> str:
        return f"{document.series}-{document.sequence}"

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_total(document: TaxDocument) -> dict[str, object]:
        return {
            "amount_paise": document.total_paise,
            "currency": str(document.tax_snapshot.get("currency", "INR")),
        }


class OrderSerializer(serializers.ModelSerializer[Order]):
    checkout_id = serializers.UUIDField(read_only=True)
    booking_group_id = serializers.UUIDField(read_only=True, allow_null=True)
    quote_id = serializers.UUIDField(read_only=True)
    total = serializers.SerializerMethodField()
    bookings = BookingSerializer(many=True, read_only=True)
    tax_documents = TaxDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "checkout_id",
            "booking_group_id",
            "quote_id",
            "status",
            "version",
            "total",
            "bookings",
            "tax_documents",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_total(order: Order) -> dict[str, object]:
        return {"amount_paise": order.total_paise, "currency": order.currency}


class WebhookAcceptedSerializer(serializers.Serializer[dict[str, object]]):
    accepted = serializers.BooleanField(read_only=True)
    duplicate = serializers.BooleanField(read_only=True)
