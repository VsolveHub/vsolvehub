from datetime import datetime, timedelta
from typing import Any, cast

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.carts.models import (
    BookingGroup,
    Cart,
    CartItem,
    CheckoutSession,
    FulfilmentPlan,
    FulfilmentPlanSet,
    FulfilmentUnit,
    FulfilmentUnitLine,
    PlanUnit,
    PlanUnitItem,
    Quote,
    QuoteLine,
    QuoteUnit,
    ServiceCompatibilityRule,
)
from apps.carts.services import BookingWindow, BookingWindowDay, BookingWindows
from common.serializers import MoneySerializer


class CartItemInputSerializer(serializers.Serializer[dict[str, object]]):
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    scope = serializers.DictField(child=serializers.JSONField(), required=False, default=dict)
    replace_existing = serializers.BooleanField(required=False, default=False)


class CartItemSerializer(serializers.ModelSerializer[CartItem]):
    class Meta:
        model = CartItem
        fields = ("id", "variant_id", "quantity", "scope_schema_snapshot")
        read_only_fields = fields


class CartItemDetailSerializer(serializers.ModelSerializer[CartItem]):
    service_slug = serializers.CharField(source="variant.service.slug", read_only=True)
    service_name = serializers.CharField(source="variant.service.name", read_only=True)
    variant_name = serializers.CharField(source="variant.name", read_only=True)
    scope = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = (
            "id",
            "version",
            "variant_id",
            "service_slug",
            "service_name",
            "variant_name",
            "quantity",
            "scope",
            "scope_schema_snapshot",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.DictField(child=serializers.JSONField()))
    def get_scope(item: CartItem) -> dict[str, object]:
        return {entry.code: entry.value for entry in item.scope_values.all()}


class CartSerializer(serializers.ModelSerializer[Cart]):
    items = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ("id", "version", "items", "updated_at")
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(CartItemDetailSerializer(many=True))
    def get_items(cart: Cart) -> list[dict[str, object]]:
        items = (
            cart.items.filter(removed_at__isnull=True)
            .select_related("variant__service")
            .prefetch_related("scope_values")
        )
        return cast(list[dict[str, object]], CartItemDetailSerializer(items, many=True).data)


class CartItemCreateSerializer(serializers.Serializer[dict[str, object]]):
    expected_cart_version = serializers.IntegerField(min_value=1)
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    scope = serializers.DictField(child=serializers.JSONField(), required=False, default=dict)


class CartItemUpdateSerializer(serializers.Serializer[dict[str, object]]):
    expected_cart_version = serializers.IntegerField(min_value=1)
    expected_item_version = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)
    scope = serializers.DictField(child=serializers.JSONField(), required=False, default=dict)


class CartItemRemoveSerializer(serializers.Serializer[dict[str, object]]):
    expected_cart_version = serializers.IntegerField(min_value=1)
    expected_item_version = serializers.IntegerField(min_value=1)


class CartMergeDecisionSerializer(serializers.Serializer[dict[str, object]]):
    session_item_id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=("KEEP_CUSTOMER", "KEEP_SESSION", "KEEP_BOTH"))


class CartMergeSerializer(serializers.Serializer[dict[str, object]]):
    expected_customer_cart_version = serializers.IntegerField(min_value=1)
    expected_session_cart_version = serializers.IntegerField(min_value=1)
    decisions = CartMergeDecisionSerializer(many=True)


class CompatibilityRuleSerializer(serializers.ModelSerializer[ServiceCompatibilityRule]):
    left_service_name = serializers.CharField(source="left_variant.service.name", read_only=True)
    left_variant_name = serializers.CharField(source="left_variant.name", read_only=True)
    right_service_name = serializers.CharField(source="right_variant.service.name", read_only=True)
    right_variant_name = serializers.CharField(source="right_variant.name", read_only=True)
    created_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    reviewed_by_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = ServiceCompatibilityRule
        fields = (
            "id",
            "left_variant_id",
            "left_service_name",
            "left_variant_name",
            "right_variant_id",
            "right_service_name",
            "right_variant_name",
            "version",
            "mode",
            "dependency",
            "conditions",
            "effective_from",
            "effective_to",
            "lifecycle_status",
            "change_reason",
            "created_by_id",
            "reviewed_by_id",
            "reviewed_at",
            "review_reason",
            "created_at",
        )
        read_only_fields = fields


class CompatibilityRuleListQuerySerializer(serializers.Serializer[dict[str, object]]):
    lifecycle_status = serializers.ChoiceField(
        choices=ServiceCompatibilityRule.LifecycleStatus.choices,
        required=False,
    )
    variant_id = serializers.UUIDField(required=False)


class CompatibilityRuleDraftSerializer(serializers.Serializer[dict[str, object]]):
    left_variant_id = serializers.UUIDField()
    right_variant_id = serializers.UUIDField()
    mode = serializers.ChoiceField(choices=ServiceCompatibilityRule.Mode.choices)
    dependency = serializers.ChoiceField(
        choices=ServiceCompatibilityRule.Dependency.choices,
        default=ServiceCompatibilityRule.Dependency.NONE,
    )
    conditions = serializers.DictField(child=serializers.JSONField(), required=False, default=dict)
    effective_from = serializers.DateTimeField()
    effective_to = serializers.DateTimeField(required=False, allow_null=True, default=None)
    change_reason = serializers.CharField(min_length=10, max_length=500)

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        if attrs["left_variant_id"] == attrs["right_variant_id"]:
            raise serializers.ValidationError("Choose two different variants.")
        effective_to = attrs.get("effective_to")
        effective_from = cast(datetime, attrs["effective_from"])
        if effective_to is not None and cast(datetime, effective_to) <= effective_from:
            raise serializers.ValidationError(
                {"effective_to": "Must be later than effective_from."}
            )
        if (
            attrs["mode"] == ServiceCompatibilityRule.Mode.PARALLEL_ALLOWED
            and attrs["dependency"] != ServiceCompatibilityRule.Dependency.NONE
        ):
            raise serializers.ValidationError(
                {"dependency": "Parallel rules cannot declare an ordering dependency."}
            )
        return attrs


class CompatibilityRuleReviewSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(min_value=1)
    review_reason = serializers.CharField(min_length=10, max_length=500)


class CompatibilityRuleRetireSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(min_length=10, max_length=500)


class CompatibilityRulePageSerializer(serializers.Serializer[dict[str, object]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = CompatibilityRuleSerializer(many=True)


class FulfilmentPlanSetCreateSerializer(serializers.Serializer[dict[str, object]]):
    address_id = serializers.UUIDField()
    expected_cart_version = serializers.IntegerField(min_value=1)
    preferred_start = serializers.DateTimeField()


class PlanUnitItemSerializer(serializers.ModelSerializer[PlanUnitItem]):
    cart_item_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = PlanUnitItem
        fields = (
            "id",
            "cart_item_id",
            "cart_item_version",
            "position",
            "quantity",
            "estimated_duration_minutes",
            "variant_snapshot",
            "scope_snapshot",
            "configuration_snapshot",
        )
        read_only_fields = fields


class PlanUnitSerializer(serializers.ModelSerializer[PlanUnit]):
    items = PlanUnitItemSerializer(many=True, read_only=True)
    starts_at = serializers.DateTimeField(source="requested_start", read_only=True)
    ends_at = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    minimum_visit_adjustment = serializers.SerializerMethodField()
    platform_fee_allocation = serializers.SerializerMethodField()
    tax = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = PlanUnit
        fields = (
            "id",
            "position",
            "starts_at",
            "ends_at",
            "arrival_window_minutes",
            "estimated_duration_minutes",
            "items",
            "reason_codes",
            "subtotal",
            "minimum_visit_adjustment",
            "platform_fee_allocation",
            "tax",
            "total",
        )
        read_only_fields = fields

    @staticmethod
    def _money(unit: PlanUnit, amount_paise: int) -> dict[str, object]:
        return {"amount_paise": amount_paise, "currency": unit.currency}

    @staticmethod
    @extend_schema_field(serializers.DateTimeField())
    def get_ends_at(unit: PlanUnit) -> str:
        return (unit.requested_start + timedelta(minutes=unit.arrival_window_minutes)).isoformat()

    @extend_schema_field(MoneySerializer)
    def get_subtotal(self, unit: PlanUnit) -> dict[str, object]:
        return self._money(unit, unit.task_subtotal_paise + unit.minimum_visit_adjustment_paise)

    @extend_schema_field(MoneySerializer)
    def get_minimum_visit_adjustment(self, unit: PlanUnit) -> dict[str, object]:
        return self._money(unit, unit.minimum_visit_adjustment_paise)

    @extend_schema_field(MoneySerializer)
    def get_platform_fee_allocation(self, unit: PlanUnit) -> dict[str, object]:
        return self._money(unit, unit.platform_fee_allocation_paise)

    @extend_schema_field(MoneySerializer)
    def get_tax(self, unit: PlanUnit) -> dict[str, object]:
        return self._money(unit, unit.tax_paise)

    @extend_schema_field(MoneySerializer)
    def get_total(self, unit: PlanUnit) -> dict[str, object]:
        return self._money(unit, unit.total_paise)


class FulfilmentPlanSerializer(serializers.ModelSerializer[FulfilmentPlan]):
    units = PlanUnitSerializer(many=True, read_only=True)
    subtotal = serializers.SerializerMethodField()
    platform_fee = serializers.SerializerMethodField()
    tax = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = FulfilmentPlan
        fields = (
            "id",
            "rank",
            "structure",
            "confirmation_policy",
            "is_recommended",
            "professional_count",
            "visit_count",
            "decisive_reasons",
            "units",
            "subtotal",
            "platform_fee",
            "tax",
            "total",
        )
        read_only_fields = fields

    @staticmethod
    def _money(plan: FulfilmentPlan, amount_paise: int) -> dict[str, object]:
        return {"amount_paise": amount_paise, "currency": plan.currency}

    @extend_schema_field(MoneySerializer)
    def get_subtotal(self, plan: FulfilmentPlan) -> dict[str, object]:
        return self._money(
            plan,
            plan.task_subtotal_paise + plan.minimum_visit_adjustment_paise,
        )

    @extend_schema_field(MoneySerializer)
    def get_platform_fee(self, plan: FulfilmentPlan) -> dict[str, object]:
        return self._money(plan, plan.platform_fee_paise)

    @extend_schema_field(MoneySerializer)
    def get_tax(self, plan: FulfilmentPlan) -> dict[str, object]:
        return self._money(plan, plan.tax_paise)

    @extend_schema_field(MoneySerializer)
    def get_total(self, plan: FulfilmentPlan) -> dict[str, object]:
        return self._money(plan, plan.total_paise)


class FulfilmentPlanSetSerializer(serializers.ModelSerializer[FulfilmentPlanSet]):
    server_now = serializers.SerializerMethodField()
    plans = FulfilmentPlanSerializer(many=True, read_only=True)

    class Meta:
        model = FulfilmentPlanSet
        fields = (
            "id",
            "cart_version",
            "status",
            "server_now",
            "expires_at",
            "plans",
            "created_at",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(_plan_set: FulfilmentPlanSet) -> str:
        return timezone.now().isoformat()


class PlanQuoteCreateSerializer(serializers.Serializer[dict[str, object]]):
    plan_id = serializers.UUIDField()


class GroupQuoteLineSerializer(serializers.ModelSerializer[QuoteLine]):
    amount = serializers.SerializerMethodField()
    cart_item_id = serializers.UUIDField(source="plan_unit_item.cart_item_id", read_only=True)

    class Meta:
        model = QuoteLine
        fields = (
            "id",
            "position",
            "kind",
            "code",
            "label",
            "quantity",
            "cart_item_id",
            "amount",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_amount(line: QuoteLine) -> dict[str, object]:
        return {"amount_paise": line.amount_paise, "currency": line.currency}


class GroupQuoteUnitSerializer(serializers.ModelSerializer[QuoteUnit]):
    lines = GroupQuoteLineSerializer(many=True, read_only=True)
    starts_at = serializers.DateTimeField(source="requested_start", read_only=True)
    ends_at = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = QuoteUnit
        fields = (
            "id",
            "position",
            "starts_at",
            "ends_at",
            "arrival_window_minutes",
            "estimated_duration_minutes",
            "lines",
            "total",
            "cancellation_policy_snapshot",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.DateTimeField())
    def get_ends_at(unit: QuoteUnit) -> str:
        return (unit.requested_start + timedelta(minutes=unit.arrival_window_minutes)).isoformat()

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_total(unit: QuoteUnit) -> dict[str, object]:
        return {"amount_paise": unit.total_paise, "currency": unit.currency}


class GroupQuoteSerializer(serializers.ModelSerializer[Quote]):
    server_now = serializers.SerializerMethodField()
    plan_id = serializers.UUIDField(source="fulfilment_plan_id", read_only=True)
    plan_set_id = serializers.UUIDField(source="fulfilment_plan.plan_set_id", read_only=True)
    structure = serializers.CharField(source="fulfilment_plan.structure", read_only=True)
    confirmation_policy = serializers.CharField(
        source="fulfilment_plan.confirmation_policy",
        read_only=True,
    )
    units = GroupQuoteUnitSerializer(many=True, read_only=True)
    total = serializers.SerializerMethodField()

    class Meta:
        model = Quote
        fields = (
            "id",
            "version",
            "status",
            "cart_version",
            "plan_set_id",
            "plan_id",
            "structure",
            "confirmation_policy",
            "server_now",
            "expires_at",
            "units",
            "total",
            "created_at",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(_quote: Quote) -> str:
        return timezone.now().isoformat()

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_total(quote: Quote) -> dict[str, object]:
        return {"amount_paise": quote.total_paise, "currency": quote.currency}


class QuoteCreateSerializer(serializers.Serializer[dict[str, object]]):
    address_id = serializers.UUIDField()
    window_id = serializers.CharField(max_length=1000)


class BookingWindowsRequestSerializer(serializers.Serializer[dict[str, object]]):
    address_id = serializers.UUIDField()


class BookingWindowSerializer(serializers.Serializer[BookingWindow]):
    id = serializers.CharField(read_only=True)
    starts_at = serializers.DateTimeField(read_only=True)
    ends_at = serializers.DateTimeField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)
    unavailable_reason = serializers.ChoiceField(
        choices=("PAST", "TOO_SOON", "OUTSIDE_OPERATING_WINDOW", "NO_CAPACITY"),
        read_only=True,
        allow_null=True,
    )


class BookingWindowDaySerializer(serializers.Serializer[BookingWindowDay]):
    date = serializers.DateField(read_only=True)
    is_today = serializers.BooleanField(read_only=True)
    windows = BookingWindowSerializer(many=True, read_only=True)


class BookingWindowsSerializer(serializers.Serializer[BookingWindows]):
    server_now = serializers.DateTimeField(read_only=True)
    estimated_duration_minutes = serializers.IntegerField(read_only=True)
    availability_is_preliminary = serializers.BooleanField(read_only=True)
    days = BookingWindowDaySerializer(many=True, read_only=True)


class QuoteLineSerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)  # type: ignore[assignment]
    amount = MoneySerializer(read_only=True)


class QuoteTaxSerializer(QuoteLineSerializer):
    included_in_total = serializers.BooleanField(read_only=True)


class CancellationBandSerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.CharField(read_only=True)
    condition_text = serializers.CharField(read_only=True)
    fee = MoneySerializer(read_only=True)


class CancellationPolicySerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.CharField(read_only=True)
    version = serializers.IntegerField(read_only=True)
    bands = CancellationBandSerializer(many=True, read_only=True)


class QuoteArrivalWindowSerializer(serializers.Serializer[dict[str, object]]):
    id = serializers.CharField(read_only=True)
    starts_at = serializers.DateTimeField(read_only=True)
    ends_at = serializers.DateTimeField(read_only=True)


class QuoteSerializer(serializers.ModelSerializer[Quote]):
    server_now = serializers.SerializerMethodField()
    lines = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    platform_fee = serializers.SerializerMethodField()
    tax = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    arrival_window = serializers.SerializerMethodField()
    cancellation_policy = serializers.SerializerMethodField()

    class Meta:
        model = Quote
        fields = (
            "id",
            "version",
            "server_now",
            "expires_at",
            "estimated_duration_minutes",
            "arrival_window",
            "lines",
            "subtotal",
            "platform_fee",
            "tax",
            "total",
            "cancellation_policy",
            "created_at",
        )
        read_only_fields = fields

    @staticmethod
    def _money(quote: Quote, amount_paise: int) -> dict[str, object]:
        return {"amount_paise": amount_paise, "currency": quote.currency}

    @staticmethod
    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(_quote: Quote) -> str:
        return timezone.now().isoformat()

    @extend_schema_field(QuoteLineSerializer(many=True))
    def get_lines(self, quote: Quote) -> list[dict[str, object]]:
        rate = cast(dict[str, Any], quote.task_rate_snapshot)
        inputs = cast(dict[str, Any], quote.quote_inputs_snapshot)
        quantity = int(inputs["quantity"])
        task_code = str(rate["task_code"])
        label = str(rate["label"])
        return [
            {
                "code": f"task.{task_code}",
                "label": f"{label} x {quantity}",
                "amount": self._money(quote, quote.task_subtotal_paise),
            },
            {
                "code": "minimum_visit_topup",
                "label": "Minimum visit charge top-up",
                "amount": self._money(quote, quote.minimum_visit_adjustment_paise),
            },
        ]

    @extend_schema_field(MoneySerializer)
    def get_subtotal(self, quote: Quote) -> dict[str, object]:
        return self._money(
            quote,
            quote.task_subtotal_paise + quote.minimum_visit_adjustment_paise,
        )

    @extend_schema_field(QuoteLineSerializer)
    def get_platform_fee(self, quote: Quote) -> dict[str, object]:
        return {
            "code": "platform_fee",
            "label": "Platform fee",
            "amount": self._money(quote, quote.platform_fee_paise),
        }

    @extend_schema_field(QuoteTaxSerializer)
    def get_tax(self, quote: Quote) -> dict[str, object]:
        return {
            "code": "tax.gst",
            "label": "GST (included in total)",
            "amount": self._money(quote, quote.tax_paise),
            "included_in_total": True,
        }

    @extend_schema_field(MoneySerializer)
    def get_total(self, quote: Quote) -> dict[str, object]:
        return self._money(quote, quote.total_paise)

    @extend_schema_field(QuoteArrivalWindowSerializer)
    def get_arrival_window(self, quote: Quote) -> dict[str, object]:
        return {
            "id": quote.arrival_window_id,
            "starts_at": quote.requested_start,
            "ends_at": quote.requested_start + timedelta(minutes=quote.arrival_window_minutes),
        }

    @extend_schema_field(CancellationPolicySerializer)
    def get_cancellation_policy(self, quote: Quote) -> dict[str, object]:
        snapshot = cast(dict[str, Any], quote.cancellation_policy_snapshot)
        return {
            "code": snapshot["code"],
            "version": snapshot["version"],
            "bands": [
                {
                    "code": band["code"],
                    "condition_text": band["condition_text"],
                    "fee": self._money(quote, int(band["fee_paise"])),
                }
                for band in cast(list[dict[str, Any]], snapshot["bands"])
            ],
        }


class CheckoutCreateSerializer(serializers.Serializer[dict[str, object]]):
    quote_id = serializers.UUIDField()


class AssistedCheckoutCreateSerializer(serializers.Serializer[dict[str, object]]):
    customer_id = serializers.UUIDField()
    quote_id = serializers.UUIDField()
    consent_purpose = serializers.SlugField(max_length=100)
    consent_version = serializers.CharField(max_length=100)


class FulfilmentUnitLineSerializer(serializers.ModelSerializer[FulfilmentUnitLine]):
    amount = serializers.SerializerMethodField()

    class Meta:
        model = FulfilmentUnitLine
        fields = ("id", "position", "kind", "code", "label", "quantity", "amount")
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_amount(line: FulfilmentUnitLine) -> dict[str, object]:
        return {"amount_paise": line.amount_paise, "currency": line.currency}


class FulfilmentUnitSerializer(serializers.ModelSerializer[FulfilmentUnit]):
    lines = FulfilmentUnitLineSerializer(many=True, read_only=True)
    starts_at = serializers.DateTimeField(source="requested_start", read_only=True)
    total = serializers.SerializerMethodField()
    state_deadline = serializers.SerializerMethodField()

    class Meta:
        model = FulfilmentUnit
        fields = (
            "id",
            "position",
            "status",
            "version",
            "starts_at",
            "arrival_window_minutes",
            "estimated_duration_minutes",
            "state_deadline",
            "lines",
            "total",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_total(unit: FulfilmentUnit) -> dict[str, object]:
        return {"amount_paise": unit.total_paise, "currency": unit.currency}

    @staticmethod
    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_state_deadline(unit: FulfilmentUnit) -> str | None:
        live_offers = [
            offer
            for offer in unit.offers.all()
            if offer.status in ("OFFERED", "ACCEPTED_PENDING_UNDO")
        ]
        deadlines: list[datetime] = []
        for offer in live_offers:
            deadline = (
                offer.undo_deadline if offer.status == "ACCEPTED_PENDING_UNDO" else offer.expires_at
            )
            if deadline is not None:
                deadlines.append(deadline)
        reservation = next(
            (r for r in unit.reservations.all() if r.status in ("TENTATIVE", "CONFIRMED")),
            None,
        )
        if reservation is not None:
            deadlines.append(reservation.expires_at)
        return min(deadlines).isoformat() if deadlines else None


class BookingGroupSerializer(serializers.ModelSerializer[BookingGroup]):
    units = FulfilmentUnitSerializer(many=True, read_only=True)
    server_now = serializers.SerializerMethodField()
    recovery_action = serializers.SerializerMethodField()
    next_transition_at = serializers.SerializerMethodField()
    checkout_id = serializers.SerializerMethodField()
    checkout_version = serializers.SerializerMethodField()
    order_id = serializers.SerializerMethodField()

    class Meta:
        model = BookingGroup
        fields = (
            "id",
            "status",
            "version",
            "confirmation_policy",
            "expires_at",
            "server_now",
            "recovery_action",
            "next_transition_at",
            "checkout_id",
            "checkout_version",
            "order_id",
            "units",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(_group: BookingGroup) -> str:
        return timezone.now().isoformat()

    @staticmethod
    @extend_schema_field(
        serializers.ChoiceField(choices=("WAIT", "PAYMENT_REQUIRED", "REPLAN", "NONE"))
    )
    def get_recovery_action(group: BookingGroup) -> str:
        if group.status in (
            BookingGroup.Status.CONFIRMED,
            BookingGroup.Status.MATCHING,
            BookingGroup.Status.PARTIALLY_HELD,
            BookingGroup.Status.ALL_UNITS_HELD,
        ):
            return "WAIT"
        if group.status == BookingGroup.Status.PAYMENT_PENDING:
            return "PAYMENT_REQUIRED"
        if group.status == BookingGroup.Status.REPLAN_REQUIRED:
            return "REPLAN"
        return "NONE"

    @staticmethod
    @extend_schema_field(serializers.UUIDField(allow_null=True))
    def get_checkout_id(group: BookingGroup) -> str | None:
        """The CheckoutSession to pay against (proposal 0011).

        `recovery_action` can say `PAYMENT_REQUIRED`, but the command it points at
        needs a checkout id and there is no `GET /checkouts/{id}/` to look one up.
        Without this the instruction is unexecutable outside the tab that created
        the checkout, and the reservation expires while the client holds nothing.

        Django's reverse one-to-one descriptor raises a `DoesNotExist` that also
        subclasses `AttributeError`, so `getattr(..., None)` is the supported way
        to say "there may not be one" without a try/except.
        """
        checkout = getattr(group, "checkout", None)
        return None if checkout is None else str(checkout.id)

    @staticmethod
    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_checkout_version(group: BookingGroup) -> int | None:
        """Sent back as `expected_checkout_version`.

        Travels with the id deliberately. Publishing one without the other would
        force clients to guess a version, which defeats the guard that stops a
        payment being raised against a checkout that has since moved.
        """
        checkout = getattr(group, "checkout", None)
        return None if checkout is None else int(checkout.version)

    @staticmethod
    @extend_schema_field(serializers.UUIDField(allow_null=True))
    def get_order_id(group: BookingGroup) -> str | None:
        """The Order created at capture, or null before it.

        A pointer only — `GET /orders/{id}/` remains the read and keeps its own
        ownership check. Without it a Customer who has paid cannot reach their own
        allocations, invoice or credit note, because orders are retrievable by id
        alone with no list and no filter.
        """
        order = getattr(group, "order", None)
        return None if order is None else str(order.id)

    @staticmethod
    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_next_transition_at(group: BookingGroup) -> str | None:
        deadlines = [
            value
            for unit in group.units.all()
            if (value := FulfilmentUnitSerializer.get_state_deadline(unit)) is not None
        ]
        if group.status in (
            BookingGroup.Status.CONFIRMED,
            BookingGroup.Status.MATCHING,
            BookingGroup.Status.PARTIALLY_HELD,
            BookingGroup.Status.ALL_UNITS_HELD,
        ):
            deadlines.append(group.expires_at.isoformat())
        return min(deadlines) if deadlines else None


class BookingGroupPageSerializer(serializers.Serializer[dict[str, object]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = BookingGroupSerializer(many=True)


class BookingGroupCancelSerializer(serializers.Serializer[dict[str, object]]):
    expected_version = serializers.IntegerField(min_value=1)


class CheckoutSerializer(serializers.ModelSerializer[CheckoutSession]):
    booking_group = BookingGroupSerializer(read_only=True, allow_null=True)

    class Meta:
        model = CheckoutSession
        fields = (
            "id",
            "status",
            "version",
            "expires_at",
            "booking_group",
            "created_at",
        )
        read_only_fields = fields
