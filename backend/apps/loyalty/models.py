"""Loyalty models: V Coins, Customer Completions, and Referral Programs (ADR-0010)."""

import uuid

from django.conf import settings
from django.db import models

from apps.commerce.models import PaymentAttempt
from apps.wallet.models import WalletTransaction


class CustomerCompletion(models.Model):
    """Append-only completion facts. Unique on customer, source type, and source id."""

    class SourceType(models.TextChoices):
        BOOKING = "BOOKING", "Booking"
        ENGAGEMENT = "ENGAGEMENT", "Engagement"
        RENTAL_COMPLETED = "RENTAL_COMPLETED", "Rental completed"
        STAY_CHECKED_OUT = "STAY_CHECKED_OUT", "Stay checked out"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="completions",
    )
    source_type = models.CharField(
        max_length=20,
        choices=SourceType.choices,
        default=SourceType.BOOKING,
    )
    source_id = models.UUIDField()
    completed_at = models.DateTimeField()
    outbox_event_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("customer", "source_type", "source_id"),
                name="loyalty_unique_customer_completion",
            )
        ]
        ordering = ("-completed_at", "-id")

    def __str__(self) -> str:
        return f"{self.customer_id}:{self.source_type}:{self.source_id}"


class LoyaltySettings(models.Model):
    """Single row of Operations settings shared by V Coins and referrals."""

    SINGLETON_ID = 1

    id = models.PositiveSmallIntegerField(primary_key=True, default=SINGLETON_ID, editable=False)
    #: Days after a booking completes before coins earned on it, or a referral it qualified,
    #: become usable. A refund inside the window cancels them. 0 pays immediately.
    reward_hold_days = models.PositiveSmallIntegerField(default=7)
    #: Most referral rewards one referrer can receive per calendar month. 0 means no limit.
    #: Rewards above the cap wait and are paid in a later month.
    referral_monthly_cap = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(id=1),
                name="loyalty_settings_singleton",
            ),
            models.CheckConstraint(
                condition=models.Q(reward_hold_days__lte=90),
                name="loyalty_settings_hold_days_range",
            ),
        ]

    def __str__(self) -> str:
        return f"LoyaltySettings(hold={self.reward_hold_days}d, cap={self.referral_monthly_cap})"


class CoinBurnPolicy(models.Model):
    """Operations-configurable coin burn rules for checkout."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    max_burn_percent = models.PositiveSmallIntegerField(default=20)  # e.g. 20% max
    coin_value_paise = models.PositiveIntegerField(default=10)  # 1 coin = 10 paise (₹0.10)
    is_active = models.BooleanField(default=True)
    effective_from = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(max_burn_percent__gte=1) & models.Q(max_burn_percent__lte=100),
                name="loyalty_burn_percent_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(coin_value_paise__gt=0),
                name="loyalty_coin_value_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"BurnPolicy:{self.max_burn_percent}%@{self.coin_value_paise}p"


class CoinGrantRule(models.Model):
    """Operations-configurable rules for granting V Coins."""

    class EarnMode(models.TextChoices):
        FLAT = "FLAT", "Flat"
        TIERED_ORDER_VALUE = "TIERED_ORDER_VALUE", "Tiered order value"
        TIERED_BOOKING_SEQUENCE = "TIERED_BOOKING_SEQUENCE", "Tiered booking sequence"

    class GrantTrigger(models.TextChoices):
        SIGNUP = "SIGNUP", "Signup"
        REFERRAL_QUALIFIED = "REFERRAL_QUALIFIED", "Referral qualified"
        BOOKING_COMPLETED = "BOOKING_COMPLETED", "Booking completed"
        MANUAL_OPS = "MANUAL_OPS", "Manual operations"

    class CustomerEligibility(models.TextChoices):
        ALL_CUSTOMERS = "ALL_CUSTOMERS", "All customers"
        NEW_CUSTOMER = "NEW_CUSTOMER", "New customer (0 completions)"
        EXISTING_CUSTOMER = "EXISTING_CUSTOMER", "Existing customer (1+ completions)"
        REACTIVATED_CUSTOMER = "REACTIVATED_CUSTOMER", "Reactivated customer (>N days inactive)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    earn_mode = models.CharField(max_length=32, choices=EarnMode.choices, default=EarnMode.FLAT)
    coins_amount = models.PositiveIntegerField(default=0)
    completions_required = models.PositiveIntegerField(default=0)  # 0 = immediate, 1+ = locked
    grant_trigger = models.CharField(
        max_length=32,
        choices=GrantTrigger.choices,
        default=GrantTrigger.SIGNUP,
    )
    customer_eligibility = models.CharField(
        max_length=32,
        choices=CustomerEligibility.choices,
        default=CustomerEligibility.ALL_CUSTOMERS,
    )
    reactivation_inactive_days = models.PositiveIntegerField(default=90)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.grant_trigger})"


class CoinEarnTier(models.Model):
    """Earn tiers for rules using TIERED_ORDER_VALUE or TIERED_BOOKING_SEQUENCE."""

    class TierKind(models.TextChoices):
        ORDER_VALUE = "ORDER_VALUE", "Order value"
        BOOKING_SEQUENCE = "BOOKING_SEQUENCE", "Booking sequence"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    grant_rule = models.ForeignKey(CoinGrantRule, on_delete=models.CASCADE, related_name="tiers")
    tier_kind = models.CharField(max_length=24, choices=TierKind.choices)
    min_order_paise = models.PositiveBigIntegerField(null=True, blank=True)
    max_order_paise = models.PositiveBigIntegerField(null=True, blank=True)
    min_booking_sequence = models.PositiveIntegerField(null=True, blank=True)
    max_booking_sequence = models.PositiveIntegerField(null=True, blank=True)
    coins_amount = models.PositiveIntegerField()
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self) -> str:
        return f"{self.grant_rule_id}:{self.coins_amount}"


class CoinGrant(models.Model):
    """Promised bucket of V Coins granted to a specific customer."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending (waiting period)"
        PROMISED = "PROMISED", "Promised (locked)"
        UNLOCKED = "UNLOCKED", "Unlocked (spendable)"
        EXPIRED = "EXPIRED", "Expired"
        EXHAUSTED = "EXHAUSTED", "Exhausted"
        CANCELLED = "CANCELLED", "Cancelled"
        REVERSED = "REVERSED", "Reversed"

    class SourceType(models.TextChoices):
        SIGNUP = "SIGNUP", "Signup"
        BOOKING = "BOOKING", "Booking"
        ENGAGEMENT = "ENGAGEMENT", "Engagement"
        RENTAL_COMPLETED = "RENTAL_COMPLETED", "Rental completed"
        STAY_CHECKED_OUT = "STAY_CHECKED_OUT", "Stay checked out"
        REFERRAL = "REFERRAL", "Referral"
        MANUAL_OPS = "MANUAL_OPS", "Manual operations"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="coin_grants",
    )
    rule = models.ForeignKey(
        CoinGrantRule,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="grants",
    )
    coins_amount = models.PositiveIntegerField()
    locked_coins = models.PositiveIntegerField()
    spendable_coins = models.PositiveIntegerField()
    burned_coins = models.PositiveIntegerField(default=0)
    expired_coins = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROMISED)
    #: What earned these coins: the booking, referral or Operations action. Blank for legacy rows.
    source_type = models.CharField(max_length=20, choices=SourceType.choices, blank=True)
    source_id = models.UUIDField(null=True, blank=True)
    #: When a PENDING grant leaves its waiting period. Null for every other status.
    available_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("expires_at", "created_at")
        indexes = [
            models.Index(fields=("status", "available_at")),
            models.Index(fields=("source_type", "source_id")),
        ]

    def __str__(self) -> str:
        return f"{self.customer_id}:{self.spendable_coins} spendable / {self.locked_coins} locked"


class CoinTransaction(models.Model):
    """Append-only transaction ledger for V Coins movements."""

    class Kind(models.TextChoices):
        EARN_PROMISE = "EARN_PROMISE", "Earn promise"
        UNLOCK = "UNLOCK", "Unlock"
        RESERVE = "RESERVE", "Reserve"
        BURN = "BURN", "Burn"
        RELEASE = "RELEASE", "Release"
        EXPIRE = "EXPIRE", "Expire"
        CANCEL = "CANCEL", "Cancel"
        REVERSE = "REVERSE", "Reverse"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"

    class Status(models.TextChoices):
        RESERVED = "RESERVED", "Reserved"
        CAPTURED = "CAPTURED", "Captured"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="coin_transactions",
    )
    grant = models.ForeignKey(
        CoinGrant,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    amount = models.IntegerField()  # signed: positive for credit, negative for debit
    kind = models.CharField(max_length=24, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CAPTURED)
    payment_attempt = models.ForeignKey(
        PaymentAttempt,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    notes = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self) -> str:
        return f"{self.customer_id}:{self.kind}:{self.amount}"


class ReferralProgramVersion(models.Model):
    """Immutable, versioned referral program specification."""

    class QualifyingEvent(models.TextChoices):
        REFEREE_FIRST_COMPLETED_BOOKING = (
            "REFEREE_FIRST_COMPLETED_BOOKING",
            "Referee first completed booking",
        )

    class RewardSides(models.TextChoices):
        REFERRER_ONLY = "REFERRER_ONLY", "Referrer only"
        REFEREE_ONLY = "REFEREE_ONLY", "Referee only"
        BOTH = "BOTH", "Both referrer and referee"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version_code = models.CharField(max_length=32, unique=True)
    qualifying_event = models.CharField(
        max_length=40,
        choices=QualifyingEvent.choices,
        default=QualifyingEvent.REFEREE_FIRST_COMPLETED_BOOKING,
    )
    reward_sides = models.CharField(
        max_length=24,
        choices=RewardSides.choices,
        default=RewardSides.BOTH,
    )
    referee_wallet_paise = models.PositiveBigIntegerField(default=0)
    referee_coins_amount = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    effective_from = models.DateTimeField(auto_now_add=True)
    effective_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"ReferralProgram:{self.version_code}"


class ReferralProgramRewardTier(models.Model):
    """Volume tiers for referrer payouts based on count of successful rewarded referrals."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program_version = models.ForeignKey(
        ReferralProgramVersion,
        on_delete=models.CASCADE,
        related_name="tiers",
    )
    min_qualified_referrals = models.PositiveIntegerField(default=1)
    referrer_wallet_paise = models.PositiveBigIntegerField(default=0)
    referrer_coins_amount = models.PositiveIntegerField(default=100)
    referee_wallet_paise = models.PositiveBigIntegerField(null=True, blank=True)
    referee_coins_amount = models.PositiveIntegerField(null=True, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("min_qualified_referrals", "sort_order")

    def __str__(self) -> str:
        return f"{self.program_version_id}:{self.min_qualified_referrals}"


class ReferralCode(models.Model):
    """Unique referral code and canonical share URL per customer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="referral_code",
    )
    code = models.CharField(max_length=32, unique=True)
    share_url = models.CharField(max_length=256, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.code


class ReferralAttribution(models.Model):
    """Attribution established strictly at signup. UNIQUE(referee) prevents multiple referrers."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        QUALIFIED = "QUALIFIED", "Qualified"
        REWARDED = "REWARDED", "Rewarded"
        EXPIRED = "EXPIRED", "Expired"
        INELIGIBLE = "INELIGIBLE", "Rejected"
        REVERSED = "REVERSED", "Reversed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="referrals_made",
    )
    referee = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="referral_attribution",
    )
    program_version = models.ForeignKey(
        ReferralProgramVersion,
        on_delete=models.PROTECT,
        related_name="attributions",
    )
    terms_snapshot = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    attributed_at = models.DateTimeField(auto_now_add=True)
    qualified_at = models.DateTimeField(null=True, blank=True)
    #: The completion that qualified this referral. A refund on it inside the waiting period
    #: sends the referral back to PENDING so a later booking can qualify instead.
    qualifying_source_type = models.CharField(max_length=20, blank=True)
    qualifying_source_id = models.UUIDField(null=True, blank=True)
    reward_available_at = models.DateTimeField(null=True, blank=True)
    rewarded_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_reason = models.CharField(max_length=240, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("status", "reward_available_at")),
            models.Index(fields=("referrer", "status", "rewarded_at")),
        ]

    def __str__(self) -> str:
        return f"{self.referrer_id} -> {self.referee_id} ({self.status})"


class ReferralReward(models.Model):
    """Immutable audit record of a paid referral reward."""

    class RewardSide(models.TextChoices):
        REFERRER = "REFERRER", "Referrer"
        REFEREE = "REFEREE", "Referee"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attribution = models.ForeignKey(
        ReferralAttribution,
        on_delete=models.PROTECT,
        related_name="rewards",
    )
    program_version = models.ForeignKey(
        ReferralProgramVersion,
        on_delete=models.PROTECT,
        related_name="+",
    )
    tier = models.ForeignKey(
        ReferralProgramRewardTier,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    payout_sequence_n = models.PositiveIntegerField()
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="referral_rewards",
    )
    reward_side = models.CharField(max_length=16, choices=RewardSide.choices)
    wallet_paise = models.PositiveBigIntegerField(default=0)
    coins_amount = models.PositiveIntegerField(default=0)
    wallet_transaction = models.ForeignKey(
        WalletTransaction,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    coin_grant = models.ForeignKey(
        CoinGrant,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    paid_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return (
            f"Reward:{self.recipient_id}:{self.reward_side}:"
            f"{self.wallet_paise}p/{self.coins_amount}c"
        )
