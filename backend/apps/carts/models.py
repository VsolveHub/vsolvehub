import uuid
from datetime import datetime, timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalog.models import A1VariantConfiguration, ServiceVariant
from apps.locations.models import Address, ServiceArea
from apps.pricing.models import CancellationPolicy, PricingPolicy, TaskRate


def default_quote_expiry() -> datetime:
    return timezone.now() + timedelta(minutes=15)


class Cart(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE
    )
    session_key_hash = models.CharField(max_length=64, blank=True)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("customer",),
                condition=models.Q(customer__isnull=False),
                name="carts_unique_customer_cart",
            ),
            models.UniqueConstraint(
                fields=("session_key_hash",),
                condition=~models.Q(session_key_hash=""),
                name="carts_unique_session_cart",
            ),
        ]

    def __str__(self) -> str:
        return str(self.id)


class CartItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey(ServiceVariant, on_delete=models.PROTECT)
    task_rate = models.ForeignKey(TaskRate, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    version = models.PositiveIntegerField(default=1)
    configuration = models.ForeignKey(A1VariantConfiguration, on_delete=models.PROTECT)
    scope_schema_snapshot = models.JSONField(default=dict)
    removed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.cart_id}:{self.variant_id}"


class ServiceCompatibilityRule(models.Model):
    """Effective-dated, fail-closed compatibility between two exact variants."""

    class LifecycleStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        RETIRED = "RETIRED", "Retired"
        REJECTED = "REJECTED", "Rejected"

    class Mode(models.TextChoices):
        SAME_PARTNER_SEQUENTIAL = (
            "SAME_PARTNER_SEQUENTIAL",
            "Same Partner sequential",
        )
        PARALLEL_ALLOWED = "PARALLEL_ALLOWED", "Parallel allowed"
        MUST_BE_SEPARATE = "MUST_BE_SEPARATE", "Must be separate"

    class Dependency(models.TextChoices):
        NONE = "NONE", "No ordering dependency"
        LEFT_BEFORE_RIGHT = "LEFT_BEFORE_RIGHT", "Left before right"
        RIGHT_BEFORE_LEFT = "RIGHT_BEFORE_LEFT", "Right before left"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    left_variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="compatibility_rules_as_left",
    )
    right_variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="compatibility_rules_as_right",
    )
    version = models.PositiveIntegerField(default=1)
    mode = models.CharField(max_length=32, choices=Mode.choices)
    dependency = models.CharField(
        max_length=24,
        choices=Dependency.choices,
        default=Dependency.NONE,
    )
    conditions = models.JSONField(default=dict)
    effective_from = models.DateTimeField(default=timezone.now)
    effective_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    lifecycle_status = models.CharField(
        max_length=16,
        choices=LifecycleStatus.choices,
        default=LifecycleStatus.ACTIVE,
    )
    change_reason = models.CharField(max_length=500, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="compatibility_rules_created",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="compatibility_rules_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("left_variant_id", "right_variant_id", "-version")
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(left_variant=models.F("right_variant")),
                name="carts_compatibility_variants_differ",
            ),
            models.CheckConstraint(
                condition=models.Q(effective_to__isnull=True)
                | models.Q(effective_to__gt=models.F("effective_from")),
                name="carts_compatibility_valid_window",
            ),
            models.CheckConstraint(
                condition=models.Q(left_variant_id__lt=models.F("right_variant_id")),
                name="carts_compatibility_canonical_pair",
            ),
            models.CheckConstraint(
                condition=~models.Q(mode="PARALLEL_ALLOWED") | models.Q(dependency="NONE"),
                name="carts_parallel_compatibility_no_dependency",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(lifecycle_status="ACTIVE", is_active=True)
                    | models.Q(
                        lifecycle_status__in=("DRAFT", "RETIRED", "REJECTED"),
                        is_active=False,
                    )
                ),
                name="carts_compatibility_lifecycle_active_consistent",
            ),
            models.CheckConstraint(
                condition=models.Q(reviewed_by__isnull=True)
                | models.Q(created_by__isnull=True)
                | ~models.Q(reviewed_by=models.F("created_by")),
                name="carts_compatibility_maker_checker",
            ),
            models.UniqueConstraint(
                fields=("left_variant", "right_variant", "version"),
                name="carts_unique_compatibility_version",
            ),
            models.UniqueConstraint(
                fields=("left_variant", "right_variant"),
                condition=models.Q(is_active=True, effective_to__isnull=True),
                name="carts_unique_current_compatibility",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.left_variant_id}:{self.right_variant_id}:{self.mode}:v{self.version}"


class CartItemScope(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(CartItem, on_delete=models.CASCADE, related_name="scope_values")
    code = models.SlugField(max_length=100)
    value = models.JSONField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("item", "code"), name="carts_unique_scope_code")
        ]

    def __str__(self) -> str:
        return f"{self.item_id}:{self.code}"


class FulfilmentPlanSet(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        INVALIDATED = "INVALIDATED", "Invalidated"
        EXPIRED = "EXPIRED", "Expired"
        SELECTED = "SELECTED", "Selected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cart = models.ForeignKey(Cart, on_delete=models.PROTECT, related_name="plan_sets")
    cart_version = models.PositiveIntegerField()
    address = models.ForeignKey(Address, on_delete=models.PROTECT)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    input_fingerprint = models.CharField(max_length=64)
    planning_snapshot = models.JSONField(default=dict)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "id")
        indexes = [models.Index(fields=("cart", "status", "expires_at"))]

    def __str__(self) -> str:
        return str(self.id)


class FulfilmentPlan(models.Model):
    class Structure(models.TextChoices):
        SINGLE_PARTNER_SEQUENTIAL = (
            "SINGLE_PARTNER_SEQUENTIAL",
            "Single Partner sequential",
        )
        COORDINATED_PARALLEL = "COORDINATED_PARALLEL", "Coordinated parallel"
        INDEPENDENT_VISITS = "INDEPENDENT_VISITS", "Independent visits"
        MIXED = "MIXED", "Mixed"

    class ConfirmationPolicy(models.TextChoices):
        ALL_OR_NOTHING = "ALL_OR_NOTHING", "All or nothing"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan_set = models.ForeignKey(
        FulfilmentPlanSet,
        on_delete=models.PROTECT,
        related_name="plans",
    )
    rank = models.PositiveSmallIntegerField()
    structure = models.CharField(max_length=32, choices=Structure.choices)
    confirmation_policy = models.CharField(
        max_length=24,
        choices=ConfirmationPolicy.choices,
        default=ConfirmationPolicy.ALL_OR_NOTHING,
    )
    is_recommended = models.BooleanField(default=False)
    professional_count = models.PositiveSmallIntegerField()
    visit_count = models.PositiveSmallIntegerField()
    task_subtotal_paise = models.PositiveBigIntegerField()
    minimum_visit_adjustment_paise = models.PositiveBigIntegerField()
    platform_fee_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField(default=0)
    total_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    decisive_reasons = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("rank", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("plan_set", "rank"),
                name="carts_unique_plan_rank",
            ),
            models.UniqueConstraint(
                fields=("plan_set",),
                condition=models.Q(is_recommended=True),
                name="carts_one_recommended_plan",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    total_paise=models.F("task_subtotal_paise")
                    + models.F("minimum_visit_adjustment_paise")
                    + models.F("platform_fee_paise"),
                ),
                name="carts_plan_total_matches_lines",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.plan_set_id}:{self.rank}:{self.structure}"


class PlanUnit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.ForeignKey(FulfilmentPlan, on_delete=models.PROTECT, related_name="units")
    service_area = models.ForeignKey(ServiceArea, on_delete=models.PROTECT)
    position = models.PositiveSmallIntegerField()
    requested_start = models.DateTimeField()
    arrival_window_minutes = models.PositiveSmallIntegerField(default=60)
    estimated_duration_minutes = models.PositiveIntegerField()
    task_subtotal_paise = models.PositiveBigIntegerField()
    minimum_visit_adjustment_paise = models.PositiveBigIntegerField()
    platform_fee_allocation_paise = models.PositiveBigIntegerField(default=0)
    tax_paise = models.PositiveBigIntegerField(default=0)
    total_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    reason_codes = models.JSONField(default=list)
    eligibility_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("plan", "position"),
                name="carts_unique_plan_unit_position",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    total_paise=models.F("task_subtotal_paise")
                    + models.F("minimum_visit_adjustment_paise")
                    + models.F("platform_fee_allocation_paise"),
                ),
                name="carts_plan_unit_total_matches_lines",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.plan_id}:{self.position}"


class PlanUnitItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit = models.ForeignKey(PlanUnit, on_delete=models.PROTECT, related_name="items")
    cart_item = models.ForeignKey(CartItem, on_delete=models.PROTECT)
    cart_item_version = models.PositiveIntegerField()
    position = models.PositiveSmallIntegerField()
    quantity = models.PositiveIntegerField()
    estimated_duration_minutes = models.PositiveIntegerField()
    task_subtotal_paise = models.PositiveBigIntegerField()
    variant_snapshot = models.JSONField(default=dict)
    scope_snapshot = models.JSONField(default=dict)
    configuration_snapshot = models.JSONField(default=dict)
    rate_snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("unit", "cart_item"),
                name="carts_unique_plan_unit_item",
            ),
            models.UniqueConstraint(
                fields=("unit", "position"),
                name="carts_unique_plan_unit_item_position",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.unit_id}:{self.cart_item_id}"


class Quote(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        INVALIDATED = "INVALIDATED", "Invalidated"
        EXPIRED = "EXPIRED", "Expired"
        CONSUMED = "CONSUMED", "Consumed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version = models.PositiveIntegerField(default=1)
    cart_item = models.ForeignKey(CartItem, null=True, blank=True, on_delete=models.PROTECT)
    fulfilment_plan = models.OneToOneField(
        FulfilmentPlan,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="quote",
    )
    cart_version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    address = models.ForeignKey(Address, on_delete=models.PROTECT)
    service_area = models.ForeignKey(ServiceArea, on_delete=models.PROTECT)
    task_subtotal_paise = models.PositiveBigIntegerField()
    minimum_visit_adjustment_paise = models.PositiveBigIntegerField()
    platform_fee_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField(default=0)
    total_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    estimated_duration_minutes = models.PositiveIntegerField()
    requested_start = models.DateTimeField()
    arrival_window_minutes = models.PositiveSmallIntegerField(default=60)
    arrival_window_id = models.TextField(blank=True)
    task_rate_snapshot = models.JSONField(default=dict)
    pricing_policy = models.ForeignKey(PricingPolicy, on_delete=models.PROTECT)
    pricing_policy_snapshot = models.JSONField(default=dict)
    cancellation_policy = models.ForeignKey(
        CancellationPolicy,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
    )
    cancellation_policy_snapshot = models.JSONField(default=dict)
    quote_inputs_snapshot = models.JSONField(default=dict)
    expires_at = models.DateTimeField(default=default_quote_expiry)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(
                    total_paise=models.F("task_subtotal_paise")
                    + models.F("minimum_visit_adjustment_paise")
                    + models.F("platform_fee_paise"),
                ),
                name="carts_quote_total_matches_lines",
            ),
            models.CheckConstraint(
                condition=models.Q(tax_paise__lte=models.F("total_paise")),
                name="carts_quote_tax_lte_total",
            ),
        ]

    def __str__(self) -> str:
        return str(self.id)


class QuoteUnit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quote = models.ForeignKey(Quote, on_delete=models.PROTECT, related_name="units")
    plan_unit = models.OneToOneField(PlanUnit, on_delete=models.PROTECT)
    position = models.PositiveSmallIntegerField()
    requested_start = models.DateTimeField()
    arrival_window_minutes = models.PositiveSmallIntegerField(default=60)
    estimated_duration_minutes = models.PositiveIntegerField()
    task_subtotal_paise = models.PositiveBigIntegerField()
    minimum_visit_adjustment_paise = models.PositiveBigIntegerField()
    platform_fee_allocation_paise = models.PositiveBigIntegerField(default=0)
    tax_paise = models.PositiveBigIntegerField(default=0)
    total_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    cancellation_policy_snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("quote", "position"),
                name="carts_unique_quote_unit_position",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    total_paise=models.F("task_subtotal_paise")
                    + models.F("minimum_visit_adjustment_paise")
                    + models.F("platform_fee_allocation_paise"),
                ),
                name="carts_quote_unit_total_matches_lines",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.quote_id}:{self.position}"


class QuoteLine(models.Model):
    class Kind(models.TextChoices):
        SERVICE = "SERVICE", "Service"
        MINIMUM_VISIT_ADJUSTMENT = "MINIMUM_VISIT_ADJUSTMENT", "Minimum visit adjustment"
        PLATFORM_FEE_ALLOCATION = "PLATFORM_FEE_ALLOCATION", "Platform fee allocation"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quote_unit = models.ForeignKey(QuoteUnit, on_delete=models.PROTECT, related_name="lines")
    plan_unit_item = models.ForeignKey(
        PlanUnitItem,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
    )
    position = models.PositiveSmallIntegerField()
    kind = models.CharField(max_length=32, choices=Kind.choices)
    code = models.CharField(max_length=140)
    label = models.CharField(max_length=240)
    quantity = models.PositiveIntegerField(default=1)
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("quote_unit", "position"),
                name="carts_unique_quote_line_position",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.quote_unit_id}:{self.position}:{self.code}"


class BookingGroup(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "CONFIRMED", "Confirmed"
        MATCHING = "MATCHING", "Matching"
        PARTIALLY_HELD = "PARTIALLY_HELD", "Partially held"
        ALL_UNITS_HELD = "ALL_UNITS_HELD", "All units held"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        BOOKED = "BOOKED", "Booked"
        COMPLETED = "COMPLETED", "Completed"
        REPLAN_REQUIRED = "REPLAN_REQUIRED", "Replan required"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="booking_groups",
    )
    quote = models.OneToOneField(Quote, on_delete=models.PROTECT, related_name="booking_group")
    address = models.ForeignKey(Address, on_delete=models.PROTECT)
    confirmation_policy = models.CharField(
        max_length=24,
        choices=FulfilmentPlan.ConfirmationPolicy.choices,
        default=FulfilmentPlan.ConfirmationPolicy.ALL_OR_NOTHING,
    )
    class BookingMode(models.TextChoices):
        INSTANT = "INSTANT", "Instant"
        SCHEDULED = "SCHEDULED", "Scheduled"

    status = models.CharField(max_length=24, choices=Status.choices, default=Status.CONFIRMED)
    booking_mode = models.CharField(
        max_length=16,
        choices=BookingMode.choices,
        default=BookingMode.SCHEDULED,
    )
    version = models.PositiveIntegerField(default=1)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        indexes = [models.Index(fields=("customer", "status", "created_at"))]

    def __str__(self) -> str:
        return str(self.id)


class FulfilmentUnit(models.Model):
    class Status(models.TextChoices):
        PLANNED = "PLANNED", "Planned"
        MATCHING = "MATCHING", "Matching"
        HELD = "HELD", "Held"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        BOOKED = "BOOKED", "Booked"
        RECOVERY_REQUIRED = "RECOVERY_REQUIRED", "Recovery required"
        CANCELLED = "CANCELLED", "Cancelled"
        FAILED = "FAILED", "Failed"
        COMPLETED = "COMPLETED", "Completed"
        PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED", "Partially completed"
        DISPUTED = "DISPUTED", "Disputed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_group = models.ForeignKey(
        BookingGroup,
        on_delete=models.PROTECT,
        related_name="units",
    )
    quote_unit = models.OneToOneField(QuoteUnit, on_delete=models.PROTECT)
    service_area = models.ForeignKey(ServiceArea, on_delete=models.PROTECT)
    position = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PLANNED)
    version = models.PositiveIntegerField(default=1)
    requested_start = models.DateTimeField()
    arrival_window_minutes = models.PositiveSmallIntegerField(default=60)
    estimated_duration_minutes = models.PositiveIntegerField()
    total_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("booking_group", "position"),
                name="carts_unique_fulfilment_unit_position",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.booking_group_id}:{self.position}"


class FulfilmentUnitLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit = models.ForeignKey(FulfilmentUnit, on_delete=models.PROTECT, related_name="lines")
    quote_line = models.OneToOneField(QuoteLine, on_delete=models.PROTECT)
    cart_item = models.ForeignKey(CartItem, null=True, blank=True, on_delete=models.PROTECT)
    position = models.PositiveSmallIntegerField()
    kind = models.CharField(max_length=32, choices=QuoteLine.Kind.choices)
    code = models.CharField(max_length=140)
    label = models.CharField(max_length=240)
    quantity = models.PositiveIntegerField(default=1)
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("unit", "position"),
                name="carts_unique_fulfilment_line_position",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.unit_id}:{self.position}:{self.code}"


class CheckoutSession(models.Model):
    class Status(models.TextChoices):
        CREATED = "CREATED", "Created"
        FINDING_PARTNER = "FINDING_PARTNER", "Finding partner"
        PARTNER_COMMITTED = "PARTNER_COMMITTED", "Partner committed"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        COMPLETED = "COMPLETED", "Completed"
        REPLAN_REQUIRED = "REPLAN_REQUIRED", "Replan required"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    quote = models.OneToOneField(Quote, on_delete=models.PROTECT)
    booking_group = models.OneToOneField(
        BookingGroup,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="checkout",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.CREATED)
    version = models.PositiveIntegerField(default=1)
    expires_at = models.DateTimeField()
    assisted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="assisted_checkouts",
    )
    customer_consent_purpose = models.SlugField(max_length=100, blank=True)
    customer_consent_version = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return str(self.id)

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()
