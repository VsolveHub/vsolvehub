import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalog.models import A1VariantConfiguration, ServiceVariant
from apps.locations.models import Address, ServiceArea
from apps.pricing.models import PricingPolicy, TaskRate


class Cart(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE
    )
    session_key_hash = models.CharField(max_length=64, blank=True)
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
    cart = models.OneToOneField(Cart, on_delete=models.CASCADE, related_name="item")
    variant = models.ForeignKey(ServiceVariant, on_delete=models.PROTECT)
    task_rate = models.ForeignKey(TaskRate, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    configuration = models.ForeignKey(A1VariantConfiguration, on_delete=models.PROTECT)
    scope_schema_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.cart_id}:{self.variant_id}"


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


class Quote(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cart_item = models.ForeignKey(CartItem, on_delete=models.PROTECT)
    address = models.ForeignKey(Address, on_delete=models.PROTECT)
    service_area = models.ForeignKey(ServiceArea, on_delete=models.PROTECT)
    task_subtotal_paise = models.PositiveBigIntegerField()
    minimum_visit_adjustment_paise = models.PositiveBigIntegerField()
    platform_fee_paise = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()
    estimated_duration_minutes = models.PositiveIntegerField()
    requested_start = models.DateTimeField()
    arrival_window_minutes = models.PositiveSmallIntegerField(default=60)
    task_rate_snapshot = models.JSONField(default=dict)
    pricing_policy = models.ForeignKey(PricingPolicy, on_delete=models.PROTECT)
    quote_inputs_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return str(self.id)


class CheckoutSession(models.Model):
    class Status(models.TextChoices):
        CREATED = "CREATED", "Created"
        FINDING_PARTNER = "FINDING_PARTNER", "Finding partner"
        PARTNER_COMMITTED = "PARTNER_COMMITTED", "Partner committed"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        COMPLETED = "COMPLETED", "Completed"
        EXPIRED = "EXPIRED", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    quote = models.OneToOneField(Quote, on_delete=models.PROTECT)
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
