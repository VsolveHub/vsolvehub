"""Prepaid customer INR wallet models (ADR-0010)."""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Sum

from apps.commerce.models import Order, PaymentAttempt


class WalletAccount(models.Model):
    """Customer prepaid INR wallet liability account (1:1 with User)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="wallet",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Wallet:{self.customer_id}"

    @property
    def balance_paise(self) -> int:
        """Total settled/captured balance."""
        val = (
            self.transactions.filter(status=WalletTransaction.Status.CAPTURED).aggregate(
                total=Sum("amount_paise")
            )["total"]
            or 0
        )
        return max(0, int(val))

    @property
    def available_balance_paise(self) -> int:
        """Balance available to spend (credits minus reserved and captured debits)."""
        captured_credits = (
            self.transactions.filter(
                status=WalletTransaction.Status.CAPTURED,
                amount_paise__gt=0,
            ).aggregate(total=Sum("amount_paise"))["total"]
            or 0
        )
        debits = (
            self.transactions.filter(
                status__in=(
                    WalletTransaction.Status.RESERVED,
                    WalletTransaction.Status.CAPTURED,
                ),
                amount_paise__lt=0,
            ).aggregate(total=Sum("amount_paise"))["total"]
            or 0
        )
        # debits is negative, so credits + debits is the available amount
        return max(0, captured_credits + debits)

    @property
    def reserved_paise(self) -> int:
        """Debits currently reserved for in-flight checkout attempts."""
        val = (
            self.transactions.filter(
                status=WalletTransaction.Status.RESERVED,
                amount_paise__lt=0,
            ).aggregate(total=Sum("amount_paise"))["total"]
            or 0
        )
        return abs(int(val))


class WalletTransaction(models.Model):
    """Append-only transaction ledger for customer wallet movements."""

    class Kind(models.TextChoices):
        TOP_UP = "TOP_UP", "Top up"
        CHECKOUT_DEBIT = "CHECKOUT_DEBIT", "Checkout debit"
        CHECKOUT_RELEASE = "CHECKOUT_RELEASE", "Checkout release"
        REFUND_CREDIT = "REFUND_CREDIT", "Refund credit"
        REFERRAL_CREDIT = "REFERRAL_CREDIT", "Referral credit"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"

    class Status(models.TextChoices):
        RESERVED = "RESERVED", "Reserved"
        CAPTURED = "CAPTURED", "Captured"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wallet = models.ForeignKey(
        WalletAccount,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    # Signed integer: positive for credits, negative for debits
    amount_paise = models.BigIntegerField()
    kind = models.CharField(max_length=24, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CAPTURED)
    payment_attempt = models.ForeignKey(
        PaymentAttempt,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    order = models.ForeignKey(
        Order,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    idempotency_key = models.CharField(max_length=128, blank=True)
    notes = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")
        constraints = [
            models.UniqueConstraint(
                fields=("wallet", "idempotency_key"),
                condition=~models.Q(idempotency_key=""),
                name="wallet_unique_transaction_key",
            )
        ]

    def __str__(self) -> str:
        return f"{self.wallet_id}:{self.kind}:{self.amount_paise}"


class WalletTopUpPolicy(models.Model):
    """Operations-configurable top-up limits (paise)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    min_paise = models.PositiveBigIntegerField(default=10000)  # default ₹100
    max_paise = models.PositiveBigIntegerField(default=1000000)  # default ₹10,000
    is_active = models.BooleanField(default=True)
    effective_from = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(min_paise__lte=models.F("max_paise")),
                name="wallet_min_lte_max_top_up",
            )
        ]

    def __str__(self) -> str:
        return f"Policy:{self.min_paise}-{self.max_paise}"
