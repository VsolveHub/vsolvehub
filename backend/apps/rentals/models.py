"""A7 Rental domain models: inventory, availability, booking lifecycle, deposits and allocations.

Follows M3 Phase D (§4, §6.1, §7.1-§7.2, §8.1, §9, §11).
"""

import uuid
from typing import Any

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.db import models
from django.utils import timezone


class RentalAsset(models.Model):
    """Owned physical inventory: serialized asset or fungible pool."""

    class ConditionGrade(models.TextChoices):
        EXCELLENT = "EXCELLENT", "Excellent"
        GOOD = "GOOD", "Good"
        FAIR = "FAIR", "Fair"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        UNDER_MAINTENANCE = "UNDER_MAINTENANCE", "Under maintenance"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner_id: uuid.UUID
    variant_id: uuid.UUID
    media: Any
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="rental_assets",
    )
    variant = models.ForeignKey(
        "catalog.ServiceVariant",
        on_delete=models.PROTECT,
        related_name="rental_assets",
    )
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    asset_identifier = models.CharField(
        max_length=80,
        blank=True,
        help_text="Serial, plate number, or barcode. Blank for fungible pooled assets.",
    )
    is_serialized = models.BooleanField(default=True)
    quantity_available = models.PositiveIntegerField(
        default=1,
        help_text="Tracked quantity for fungible pooled assets (is_serialized=False).",
    )
    daily_price_paise = models.PositiveBigIntegerField()
    deposit_paise = models.PositiveBigIntegerField(default=0)
    condition_grade = models.CharField(
        max_length=24,
        choices=ConditionGrade.choices,
        default=ConditionGrade.EXCELLENT,
    )
    current_status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    pickup_address = models.ForeignKey(
        "locations.Address",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    service_areas = models.ManyToManyField(
        "locations.ServiceArea",
        blank=True,
        related_name="rental_assets",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(
                fields=("variant", "partner", "daily_price_paise", "condition_grade"),
                name="rentals_asset_browse_idx",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "asset_identifier"),
                condition=models.Q(is_serialized=True) & ~models.Q(asset_identifier=""),
                name="rentals_unique_partner_serialized_asset",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.partner_id})"


class RentalMaintenancePeriod(models.Model):
    """Vendor-declared downtime (service, repair, inspection) that blocks availability."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        RentalAsset,
        on_delete=models.CASCADE,
        related_name="maintenance_periods",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("start_date", "id")

    def __str__(self) -> str:
        return f"{self.asset_id}:{self.start_date} to {self.end_date}"


class RentalAssetMedia(models.Model):
    """Condition photos and visual records for an asset."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        RentalAsset,
        on_delete=models.CASCADE,
        related_name="media",
    )
    url = models.URLField(max_length=500)
    caption = models.CharField(max_length=140, blank=True)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-is_primary", "created_at")

    def __str__(self) -> str:
        return f"Media for {self.asset_id}"


class RentalAssetCategoryProfile(models.Model):
    """Category-specific attributes for a rental asset, driven by A7VariantConfiguration."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.OneToOneField(
        RentalAsset,
        on_delete=models.CASCADE,
        related_name="category_profile",
    )
    attributes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"CategoryProfile for {self.asset_id}"


class AssetReservation(models.Model):
    """Calendar lock on a serialized asset using PostgreSQL ExclusionConstraint."""

    class Status(models.TextChoices):
        TENTATIVE = "TENTATIVE", "Tentative hold"
        CONFIRMED = "CONFIRMED", "Confirmed hold"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        RentalAsset,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    occupied_range = DateTimeRangeField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.TENTATIVE,
    )
    is_serialized = models.BooleanField(
        default=True,
        help_text=(
            "Copied from asset to enforce PostgreSQL exclusion constraint only on "
            "serialized assets."
        ),
    )
    reserved_quantity = models.PositiveIntegerField(
        default=1,
        help_text=(
            "Number of physical units held from a fungible pool; always 1 for serialized assets."
        ),
    )
    expires_at = models.DateTimeField()
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(reserved_quantity__gt=0),
                name="rentals_reservation_quantity_positive",
            ),
            ExclusionConstraint(
                name="rentals_active_asset_reservation_no_overlap",
                expressions=[
                    ("asset", RangeOperators.EQUAL),
                    ("occupied_range", RangeOperators.OVERLAPS),
                ],
                condition=models.Q(status__in=("TENTATIVE", "CONFIRMED"), is_serialized=True),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.asset_id}:{self.status}"


class RentalBooking(models.Model):
    """One confirmed rental across a date range."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        HELD = "HELD", "Held"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        CONFIRMED = "CONFIRMED", "Confirmed"
        HANDED_OVER = "HANDED_OVER", "Handed over"
        ACTIVE = "ACTIVE", "Active"
        EXTENDED = "EXTENDED", "Extended"
        RETURN_PENDING = "RETURN_PENDING", "Return pending"
        RETURNED = "RETURNED", "Returned"
        INSPECTED = "INSPECTED", "Inspected"
        SETTLED = "SETTLED", "Settled"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"
        DISPUTED = "DISPUTED", "Disputed"
        RECOVERY_REQUIRED = "RECOVERY_REQUIRED", "Recovery required"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired"

    class DeliveryMode(models.TextChoices):
        PICKUP = "PICKUP", "Customer store pickup"
        DELIVERY = "DELIVERY", "Vendor delivery"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer_id: uuid.UUID
    asset_id: uuid.UUID
    lines: Any
    deposit: Any
    handover: Any
    return_inspection: Any
    extensions: Any
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="rental_bookings",
    )
    asset = models.ForeignKey(
        RentalAsset,
        on_delete=models.PROTECT,
        related_name="bookings",
    )
    reservation = models.OneToOneField(
        AssetReservation,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="booking",
    )
    assigned_serial = models.CharField(
        max_length=80,
        blank=True,
        help_text="Assigned unit serial at handover for fungible pooled rentals.",
    )
    rental_start = models.DateField()
    rental_end = models.DateField()
    quantity = models.PositiveIntegerField(default=1)
    delivery_mode = models.CharField(
        max_length=16,
        choices=DeliveryMode.choices,
        default=DeliveryMode.PICKUP,
    )
    delivery_address = models.ForeignKey(
        "locations.Address",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    cancellation_reason = models.CharField(max_length=240, blank=True)
    policy_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")

    def __str__(self) -> str:
        return f"RentalBooking({self.id}) - {self.status}"


class RentalBookingLine(models.Model):
    """Granular price component (base, delivery, deposit, tax)."""

    class LineType(models.TextChoices):
        BASE_RENTAL = "BASE_RENTAL", "Base rental fee"
        DELIVERY_FEE = "DELIVERY_FEE", "Delivery fee"
        DEPOSIT_HOLD = "DEPOSIT_HOLD", "Security deposit hold"
        TAX = "TAX", "Tax"
        EXTENSION = "EXTENSION", "Extension fee"
        DAMAGE_SETTLEMENT = "DAMAGE_SETTLEMENT", "Damage settlement recovery"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rental_booking_id: uuid.UUID
    allocations: Any
    rental_booking = models.ForeignKey(
        RentalBooking,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    line_type = models.CharField(max_length=24, choices=LineType.choices)
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    description = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("rental_booking", "id")

    def __str__(self) -> str:
        return f"{self.rental_booking_id}:{self.line_type}:{self.amount_paise}"


class RentalHandover(models.Model):
    """Custody transfer event with condition verification photos."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rental_booking = models.OneToOneField(
        RentalBooking,
        on_delete=models.PROTECT,
        related_name="handover",
    )
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="rental_handovers",
    )
    assigned_serial = models.CharField(max_length=80, blank=True)
    condition_notes = models.TextField(blank=True)
    photo_urls = models.JSONField(default=list)
    checklist = models.JSONField(default=dict)
    handed_over_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Handover for {self.rental_booking_id}"


class RentalReturnInspection(models.Model):
    """Inbound inspection record driving settlement matrix."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rental_booking = models.OneToOneField(
        RentalBooking,
        on_delete=models.PROTECT,
        related_name="return_inspection",
    )
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="rental_inspections",
    )
    returned_at = models.DateTimeField(default=timezone.now)
    condition_notes = models.TextField(blank=True)
    photo_urls = models.JSONField(default=list)
    damage_found = models.BooleanField(default=False)
    damage_estimated_paise = models.PositiveBigIntegerField(default=0)
    damage_details = models.JSONField(default=dict)
    late_days = models.PositiveSmallIntegerField(default=0)
    late_fee_paise = models.PositiveBigIntegerField(default=0)
    settlement_matrix_outcome = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"ReturnInspection for {self.rental_booking_id}"


class RentalDeposit(models.Model):
    """Dedicated deposit hold state machine."""

    class Status(models.TextChoices):
        REQUIRED = "REQUIRED", "Required"
        AUTHORIZED = "AUTHORIZED", "Authorized"
        HELD = "HELD", "Held"
        PARTIALLY_CONSUMED = "PARTIALLY_CONSUMED", "Partially consumed"
        FULLY_CONSUMED = "FULLY_CONSUMED", "Fully consumed"
        RELEASED = "RELEASED", "Released"
        DISPUTED = "DISPUTED", "Disputed"
        RESOLVED = "RESOLVED", "Resolved"

    class CaptureMode(models.TextChoices):
        AUTH_ONLY = "AUTH_ONLY", "Pre-authorization hold"
        IMMEDIATE_CAPTURE = "IMMEDIATE_CAPTURE", "Immediate capture and partial refund"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transactions: Any
    rental_booking = models.OneToOneField(
        RentalBooking,
        on_delete=models.PROTECT,
        related_name="deposit",
    )
    amount_paise = models.PositiveBigIntegerField()
    authorized_amount_paise = models.PositiveBigIntegerField(default=0)
    captured_amount_paise = models.PositiveBigIntegerField(default=0)
    consumed_amount_paise = models.PositiveBigIntegerField(default=0)
    refunded_amount_paise = models.PositiveBigIntegerField(default=0)
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.REQUIRED,
    )
    capture_mode = models.CharField(
        max_length=24,
        choices=CaptureMode.choices,
        default=CaptureMode.AUTH_ONLY,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(refunded_amount_paise__lte=models.F("amount_paise")),
                name="rentals_deposit_refund_lte_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(consumed_amount_paise__lte=models.F("amount_paise")),
                name="rentals_deposit_consumed_lte_amount",
            ),
        ]

    def __str__(self) -> str:
        return f"Deposit for {self.rental_booking_id} ({self.status})"


class RentalDepositTransaction(models.Model):
    """Append-only audit ledger of deposit operations."""

    class Kind(models.TextChoices):
        AUTHORIZATION = "AUTHORIZATION", "Authorization"
        CAPTURE = "CAPTURE", "Capture"
        CONSUMPTION = "CONSUMPTION", "Consumption"
        REFUND = "REFUND", "Refund"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rental_deposit = models.ForeignKey(
        RentalDeposit,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    kind = models.CharField(max_length=24, choices=Kind.choices)
    amount_paise = models.PositiveBigIntegerField()
    reason = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self) -> str:
        return f"{self.rental_deposit_id}:{self.kind}:{self.amount_paise}"


class RentalExtension(models.Model):
    """Immutable revision for extending an active rental period."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending payment & approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rental_booking = models.ForeignKey(
        RentalBooking,
        on_delete=models.PROTECT,
        related_name="extensions",
    )
    previous_end = models.DateField()
    new_end = models.DateField()
    price_delta_paise = models.PositiveBigIntegerField()
    deposit_delta_paise = models.PositiveBigIntegerField(default=0)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at", "id")

    def __str__(self) -> str:
        return f"Extension for {self.rental_booking_id} to {self.new_end}"


class RentalPaymentAllocation(models.Model):
    """ADR-0003 pattern money-to-work allocation connecting PaymentAttempt to RentalBookingLine."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment_attempt_id: uuid.UUID
    rental_booking_line_id: uuid.UUID
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        on_delete=models.PROTECT,
        related_name="rental_allocations",
    )
    rental_booking_line = models.ForeignKey(
        RentalBookingLine,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    amount_paise = models.PositiveBigIntegerField()
    refunded_paise = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="INR")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("rental_booking_line", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("payment_attempt", "rental_booking_line"),
                name="rentals_unique_payment_line_allocation",
            ),
            models.CheckConstraint(
                condition=models.Q(refunded_paise__lte=models.F("amount_paise")),
                name="rentals_allocation_refund_lte_amount",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.payment_attempt_id}:{self.rental_booking_line_id}:{self.amount_paise}"
