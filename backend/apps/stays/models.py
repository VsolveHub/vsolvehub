"""A9 Stay domain models: properties, unit types, units, availability locks,
reservations, and deposits.

Follows M3 Phase D (§5, §7.3, §8.2, §9, §11).
"""

import hashlib
import uuid
from datetime import time
from typing import Any

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, DateTimeRangeField, RangeOperators
from django.db import models
from django.utils import timezone


class Property(models.Model):
    """Physical building, hostel, PG compound, or apartment complex owned by a host."""

    class PropertyType(models.TextChoices):
        # 12 Canonical Stay Categories matching catalog
        ROOMS = "ROOMS", "Rooms"
        PG = "PG", "PG Accommodation"
        HOSTEL = "HOSTEL", "Hostel"
        BED_SPACE = "BED_SPACE", "Bed Space"
        CO_LIVING = "CO_LIVING", "Co-Living Space"
        APARTMENT = "APARTMENT", "Apartments"
        RENTAL_PROPERTY = "RENTAL_PROPERTY", "Rental Properties"
        SHORT_STAY = "SHORT_STAY", "Short Stay"
        STUDENT_ACCOMMODATION = "STUDENT_ACCOMMODATION", "Student Accommodation"
        WORKER_ACCOMMODATION = "WORKER_ACCOMMODATION", "Worker Accommodation"
        PROPERTY_LISTING = "PROPERTY_LISTING", "Property Listing"
        PREMIUM_STAYS = "PREMIUM_STAYS", "Premium Stays"

        # Legacy building aliases for existing database records
        INDEPENDENT_HOUSE = "INDEPENDENT_HOUSE", "Independent House"
        VILLA = "VILLA", "Villa"
        STUDIO_APT = "STUDIO_APT", "Studio Apartment"
        COMMERCIAL = "COMMERCIAL", "Commercial / Office"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner_id: uuid.UUID
    media: Any
    unit_types: Any
    units: Any
    policies: Any
    total_units_count: int
    get_property_type_display: Any
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="properties",
    )
    address = models.ForeignKey(
        "locations.Address",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, blank=True)
    property_type = models.CharField(
        max_length=30,
        choices=PropertyType.choices,
        default=PropertyType.INDEPENDENT_HOUSE,
    )
    description = models.TextField(blank=True)
    locality = models.CharField(max_length=100, blank=True, default="Kondapur, Hyderabad")
    rating = models.DecimalField(max_digits=3, decimal_places=1, default=0)
    reviews_count = models.PositiveIntegerField(default=0)
    service_areas = models.ManyToManyField(
        "locations.ServiceArea",
        blank=True,
        related_name="properties",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "title")

    def __str__(self) -> str:
        return f"{self.title} ({self.locality})"

    def get_active_policy(self, on_date: Any = None) -> Any:
        target_date = on_date or timezone.localdate()
        return (
            self.policies.filter(is_active=True, effective_from__lte=target_date)
            .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=target_date))
            .order_by("-version", "-effective_from")
            .first()
        )

    @property
    def policy(self) -> Any:
        """Compatibility accessor for call sites that need today's effective policy."""
        return self.get_active_policy()


class PropertyMedia(models.Model):
    """Photos, floor plans, and condition media for a property."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property_id: uuid.UUID
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name="media",
    )
    url = models.URLField(max_length=500)
    caption = models.CharField(max_length=140, blank=True)
    is_primary = models.BooleanField(default=False)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-is_primary", "display_order", "created_at")

    def __str__(self) -> str:
        return f"Media for {self.property.title}"


class PropertyPolicy(models.Model):
    """Configurable house rules, ID verification requirements, and cancellation terms."""

    class CancellationPolicy(models.TextChoices):
        FLEXIBLE = "FLEXIBLE", "Flexible (Full refund up to 24h before check-in)"
        MODERATE = "MODERATE", "Moderate (Full refund up to 5 days before check-in)"
        STRICT = "STRICT", "Strict (50% refund up to 7 days before check-in)"
        NON_REFUNDABLE = "NON_REFUNDABLE", "Non-refundable"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property_id: uuid.UUID
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name="policies",
    )
    check_in_time = models.TimeField(default=time(12, 0))
    check_out_time = models.TimeField(default=time(11, 0))
    max_guests_per_unit = models.PositiveSmallIntegerField(default=2)
    id_verification_required = models.BooleanField(default=True)
    cancellation_policy = models.CharField(
        max_length=24,
        choices=CancellationPolicy.choices,
        default=CancellationPolicy.MODERATE,
    )
    notice_period_days = models.PositiveSmallIntegerField(
        default=30,
        help_text="Notice period in days for monthly lease departures.",
    )
    no_show_grace_minutes = models.PositiveSmallIntegerField(default=120)
    no_show_first_night_charge_basis_points = models.PositiveSmallIntegerField(default=10000)
    no_show_deposit_forfeit_basis_points = models.PositiveSmallIntegerField(default=0)
    house_rules = models.JSONField(default=list, blank=True)
    version = models.PositiveIntegerField(default=1)
    effective_from = models.DateField(default=timezone.now)
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(no_show_first_night_charge_basis_points__lte=10000),
                name="stays_no_show_night_bps_lte_10000",
            ),
            models.CheckConstraint(
                condition=models.Q(no_show_deposit_forfeit_basis_points__lte=10000),
                name="stays_no_show_deposit_bps_lte_10000",
            ),
            models.UniqueConstraint(
                fields=("property", "version"),
                name="stays_unique_property_policy_version",
            ),
            models.UniqueConstraint(
                fields=("property", "effective_from"),
                condition=models.Q(is_active=True),
                name="stays_one_active_property_policy",
            ),
        ]

    def __str__(self) -> str:
        return f"Policy for {self.property.title}"


class UnitType(models.Model):
    """Room-configuration group within a property.

    This is the customer-facing browse/selection and pricing-attachment layer.
    """

    class SharingType(models.TextChoices):
        PRIVATE = "PRIVATE", "Private Room / 1-Sharing"
        DOUBLE = "DOUBLE", "2-Sharing"
        TRIPLE = "TRIPLE", "3-Sharing"
        FOUR_PLUS = "FOUR_PLUS", "4+ Sharing / Dormitory"
        ENTIRE_PLACE = "ENTIRE_PLACE", "Entire House / Apartment"

    class BathroomType(models.TextChoices):
        ATTACHED = "ATTACHED", "Attached"
        SHARED = "SHARED", "Shared"

    class FurnishingStatus(models.TextChoices):
        UNFURNISHED = "UNFURNISHED", "Unfurnished"
        SEMI_FURNISHED = "SEMI_FURNISHED", "Semi-Furnished"
        FULLY_FURNISHED = "FULLY_FURNISHED", "Fully Furnished"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property_id: uuid.UUID
    variant_id: uuid.UUID | None
    pricing_rules: Any
    units: Any
    get_sharing_type_display: Any
    get_furnishing_status_display: Any
    property = models.ForeignKey(
        Property,
        on_delete=models.PROTECT,
        related_name="unit_types",
    )
    variant = models.ForeignKey(
        "catalog.ServiceVariant",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="unit_types",
    )
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    sharing_type = models.CharField(
        max_length=24,
        choices=SharingType.choices,
        default=SharingType.PRIVATE,
    )
    sharing_count = models.PositiveSmallIntegerField(default=1)
    is_ac = models.BooleanField(default=False)
    bathroom_type = models.CharField(
        max_length=24,
        choices=BathroomType.choices,
        default=BathroomType.ATTACHED,
    )
    furnishing_status = models.CharField(
        max_length=24,
        choices=FurnishingStatus.choices,
        default=FurnishingStatus.SEMI_FURNISHED,
    )
    food_included = models.BooleanField(default=False)
    bhk = models.CharField(max_length=20, blank=True, default="1 BHK")
    bathrooms = models.PositiveSmallIntegerField(default=1)
    built_up_sqft = models.PositiveIntegerField(default=250)
    facing = models.CharField(max_length=30, blank=True, default="East")
    floor = models.CharField(max_length=30, blank=True, default="1st Floor")
    amenities = models.JSONField(default=list, blank=True)
    image_url = models.URLField(max_length=500, blank=True)
    config_hash = models.CharField(max_length=64, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("property", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("property", "config_hash"),
                condition=~models.Q(config_hash=""),
                name="stays_unique_property_config_hash",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.property.title} — {self.name}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        raw = "|".join(
            str(value)
            for value in (
                self.sharing_type,
                self.sharing_count,
                self.is_ac,
                self.bathroom_type,
                self.furnishing_status,
                self.food_included,
                self.bhk,
                self.bathrooms,
                self.built_up_sqft,
            )
        )
        self.config_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
        super().save(*args, **kwargs)


class Unit(models.Model):
    """Concrete physical room, bed, or flat belonging to exactly one UnitType."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        MAINTENANCE = "MAINTENANCE", "Under Maintenance"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property_id: uuid.UUID
    unit_type_id: uuid.UUID
    reservations: Any
    stay_reservations: Any
    property = models.ForeignKey(
        Property,
        on_delete=models.PROTECT,
        related_name="units",
    )
    unit_type = models.ForeignKey(
        UnitType,
        on_delete=models.PROTECT,
        related_name="units",
    )
    unit_code = models.CharField(
        max_length=60,
        help_text="Room number, bed code, or flat identifier (e.g. 'Room 101', 'Bed 2A').",
    )
    floor = models.CharField(max_length=30, blank=True, default="1st Floor")
    current_status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("property", "unit_code")
        constraints = [
            models.UniqueConstraint(
                fields=("property", "unit_code"),
                name="stays_unique_property_unit_code",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.property.title} [{self.unit_code}] ({self.unit_type.name})"


class UnitPricingRule(models.Model):
    """Rate configuration for a UnitType, keyed to duration mode."""

    class DurationMode(models.TextChoices):
        DAILY = "DAILY", "Daily"
        NIGHTLY = "NIGHTLY", "Nightly"
        WEEKLY = "WEEKLY", "Weekly"
        MONTHLY = "MONTHLY", "Monthly"
        HOURLY = "HOURLY", "Hourly"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit_type_id: uuid.UUID
    overrides: Any
    unit_type = models.ForeignKey(
        UnitType,
        on_delete=models.CASCADE,
        related_name="pricing_rules",
    )
    duration_mode = models.CharField(
        max_length=16,
        choices=DurationMode.choices,
        default=DurationMode.MONTHLY,
    )
    base_rate_paise = models.PositiveBigIntegerField(
        help_text="Rate in paise for the duration unit (e.g. per month or per night)",
    )
    deposit_paise = models.PositiveBigIntegerField(
        default=0,
        help_text="Required refundable security deposit in paise",
    )
    maintenance_paise = models.PositiveBigIntegerField(
        default=0,
        help_text="Monthly/periodic maintenance charges in paise",
    )
    effective_from = models.DateField(default=timezone.now)
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("unit_type", "duration_mode", "-effective_from")
        constraints = [
            ExclusionConstraint(
                name="stays_pricing_rule_no_effective_overlap",
                expressions=[
                    ("unit_type", RangeOperators.EQUAL),
                    ("duration_mode", RangeOperators.EQUAL),
                    (
                        models.Func(
                            models.F("effective_from"),
                            models.F("effective_to"),
                            models.Value("[]"),
                            function="DATERANGE",
                            output_field=DateRangeField(),
                        ),
                        RangeOperators.OVERLAPS,
                    ),
                ],
                condition=models.Q(is_active=True),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.unit_type.name} - {self.duration_mode}: ₹{self.base_rate_paise // 100}"


class UnitPricingOverride(models.Model):
    """Surge/seasonal/weekend rate overrides on NIGHTLY pricing rules."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pricing_rule_id: uuid.UUID
    pricing_rule = models.ForeignKey(
        UnitPricingRule,
        on_delete=models.CASCADE,
        related_name="overrides",
    )
    date = models.DateField()
    rate_paise = models.PositiveBigIntegerField()
    reason = models.CharField(max_length=140, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("date", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("pricing_rule", "date"),
                name="stays_unique_pricing_rule_date_override",
            ),
        ]

    def __str__(self) -> str:
        return f"Override({self.pricing_rule_id}:{self.date}:{self.rate_paise})"


class UnitReservation(models.Model):
    """PostgreSQL ExclusionConstraint calendar hold on a physical Unit."""

    class Status(models.TextChoices):
        TENTATIVE = "TENTATIVE", "Tentative hold"
        CONFIRMED = "CONFIRMED", "Confirmed hold"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit_id: uuid.UUID
    unit = models.ForeignKey(
        Unit,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    occupied_range = DateTimeRangeField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.TENTATIVE,
    )
    expires_at = models.DateTimeField()
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            ExclusionConstraint(
                name="stays_active_unit_reservation_no_overlap",
                expressions=[
                    ("unit", RangeOperators.EQUAL),
                    ("occupied_range", RangeOperators.OVERLAPS),
                ],
                condition=models.Q(status__in=("TENTATIVE", "CONFIRMED")),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.unit.unit_code}:{self.status}"


class StayReservation(models.Model):
    """Primary confirmed stay reservation across a date range."""

    class Status(models.TextChoices):
        HELD = "HELD", "Held"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        CONFIRMED = "CONFIRMED", "Confirmed"
        CHECKED_IN = "CHECKED_IN", "Checked in"
        IN_STAY = "IN_STAY", "In stay"
        CHECKED_OUT = "CHECKED_OUT", "Checked out"
        INSPECTED = "INSPECTED", "Inspected"
        SETTLED = "SETTLED", "Settled"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"
        NO_SHOW = "NO_SHOW", "No show"
        EARLY_CHECKOUT = "EARLY_CHECKOUT", "Early checkout"
        DISPUTED = "DISPUTED", "Disputed"
        RECOVERY_REQUIRED = "RECOVERY_REQUIRED", "Recovery required"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer_id: uuid.UUID
    unit_id: uuid.UUID
    unit_type_id: uuid.UUID
    lines: Any
    deposit: Any
    check_in_record: Any
    check_out_record: Any
    extensions: Any
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stay_reservations",
    )
    unit = models.ForeignKey(
        Unit,
        on_delete=models.PROTECT,
        related_name="stay_reservations",
    )
    unit_type = models.ForeignKey(
        UnitType,
        on_delete=models.PROTECT,
        related_name="stay_reservations",
    )
    calendar_hold = models.OneToOneField(
        UnitReservation,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stay_reservation",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.HELD,
    )
    duration_mode = models.CharField(
        max_length=16,
        choices=UnitPricingRule.DurationMode.choices,
        default=UnitPricingRule.DurationMode.MONTHLY,
    )
    lease_duration_months = models.PositiveSmallIntegerField(
        default=11,
        help_text="Lease duration in months (e.g. 11, 12, 24, 36) for monthly rentals.",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    guest_count = models.PositiveSmallIntegerField(default=1)
    primary_tenant_name = models.CharField(max_length=160, blank=True)
    guest_phone_snapshot = models.CharField(max_length=32, blank=True)
    guest_email_snapshot = models.EmailField(blank=True)
    emergency_contact_name = models.CharField(max_length=160, blank=True)
    emergency_contact_phone = models.CharField(max_length=32, blank=True)
    agreement_version = models.CharField(max_length=40, blank=True)
    agreement_accepted_at = models.DateTimeField(null=True, blank=True)
    kyc_document = models.FileField(upload_to="private/stays/kyc/", blank=True)
    total_nights = models.PositiveIntegerField(default=1)

    base_amount_paise = models.PositiveBigIntegerField(default=0)
    maintenance_amount_paise = models.PositiveBigIntegerField(default=0)
    deposit_amount_paise = models.PositiveBigIntegerField(default=0)
    one_time_charges_paise = models.PositiveBigIntegerField(default=0)
    tax_amount_paise = models.PositiveBigIntegerField(default=0)
    total_amount_paise = models.PositiveBigIntegerField(default=0)

    policy_snapshot = models.JSONField(default=dict, blank=True)
    cancellation_reason = models.CharField(max_length=240, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")

    def __str__(self) -> str:
        return f"Stay #{str(self.id)[:8]} - {self.unit.property.title} ({self.status})"


class StayReservationLine(models.Model):
    """Itemized financial breakdown lines for a stay reservation."""

    class Kind(models.TextChoices):
        ROOM_CHARGE = "ROOM_CHARGE", "Room charge"
        MAINTENANCE_FEE = "MAINTENANCE_FEE", "Maintenance fee"
        SECURITY_DEPOSIT = "SECURITY_DEPOSIT", "Refundable security deposit"
        ONE_TIME_CHARGE = "ONE_TIME_CHARGE", "One-time agreement / verification fee"
        TAX = "TAX", "Tax"
        DISCOUNT = "DISCOUNT", "Discount"
        DAMAGE_SETTLEMENT = "DAMAGE_SETTLEMENT", "Damage settlement recovery"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stay_reservation_id: uuid.UUID
    payment_allocations: Any
    stay_reservation = models.ForeignKey(
        StayReservation,
        on_delete=models.PROTECT,
        related_name="lines",
    )
    kind = models.CharField(max_length=24, choices=Kind.choices, default=Kind.ROOM_CHARGE)
    description = models.CharField(max_length=160)
    amount_paise = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self) -> str:
        return f"{self.kind}: {self.amount_paise} paise"


class StayDeposit(models.Model):
    """Refundable security deposit sub-lifecycle."""

    class Status(models.TextChoices):
        REQUIRED = "REQUIRED", "Required"
        NOT_REQUIRED = "NOT_REQUIRED", "Not required"
        AUTHORIZED = "AUTHORIZED", "Authorized"
        HELD = "HELD", "Held"
        PARTIALLY_CONSUMED = "PARTIALLY_CONSUMED", "Partially consumed"
        FULLY_CONSUMED = "FULLY_CONSUMED", "Fully consumed"
        RELEASED = "RELEASED", "Released"
        DISPUTED = "DISPUTED", "Disputed"
        RESOLVED = "RESOLVED", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stay_reservation_id: uuid.UUID
    transactions: Any
    stay_reservation = models.OneToOneField(
        StayReservation,
        on_delete=models.PROTECT,
        related_name="deposit",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.REQUIRED,
    )
    authorized_amount_paise = models.PositiveBigIntegerField(default=0)
    consumed_amount_paise = models.PositiveBigIntegerField(default=0)
    refunded_amount_paise = models.PositiveBigIntegerField(default=0)
    dispute_reason = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Deposit {self.status} (Auth: ₹{self.authorized_amount_paise // 100})"


class StayDepositTransaction(models.Model):
    """Immutable transaction ledger for stay deposits."""

    class Kind(models.TextChoices):
        HOLD = "HOLD", "Hold"
        CONSUMPTION = "CONSUMPTION", "Consumption"
        REFUND = "REFUND", "Refund"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    deposit_id: uuid.UUID
    deposit = models.ForeignKey(
        StayDeposit,
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
        return f"{self.kind}: {self.amount_paise} paise"


class StayCheckIn(models.Model):
    """Guest arrival record with mandatory ID verification."""

    class IdDocumentType(models.TextChoices):
        AADHAAR = "AADHAAR", "Aadhaar Card"
        PASSPORT = "PASSPORT", "Passport"
        DRIVING_LICENSE = "DRIVING_LICENSE", "Driving License"
        VOTER_ID = "VOTER_ID", "Voter ID"
        OTHER = "OTHER", "Government Photo ID"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stay_reservation_id: uuid.UUID
    stay_reservation = models.OneToOneField(
        StayReservation,
        on_delete=models.PROTECT,
        related_name="check_in_record",
    )
    actual_check_in_time = models.DateTimeField(default=timezone.now)
    id_document_type = models.CharField(
        max_length=30,
        choices=IdDocumentType.choices,
        default=IdDocumentType.AADHAAR,
    )
    id_document_number = models.CharField(max_length=80, blank=True)
    id_document_hash = models.CharField(max_length=64, blank=True)
    id_verified = models.BooleanField(default=True)
    condition_photo_urls = models.JSONField(default=list, blank=True)
    guest_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"CheckIn({self.stay_reservation_id}:{self.id_document_type})"


class StayCheckOut(models.Model):
    """Guest departure record with condition check."""

    class ConditionGrade(models.TextChoices):
        EXCELLENT = "EXCELLENT", "Clean & Pristine"
        GOOD = "GOOD", "Normal Wear & Tear"
        FAIR = "FAIR", "Minor Cleaning Needed"
        DAMAGED = "DAMAGED", "Damage Found"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stay_reservation_id: uuid.UUID
    stay_reservation = models.OneToOneField(
        StayReservation,
        on_delete=models.PROTECT,
        related_name="check_out_record",
    )
    actual_check_out_time = models.DateTimeField(default=timezone.now)
    condition_grade = models.CharField(
        max_length=24,
        choices=ConditionGrade.choices,
        default=ConditionGrade.EXCELLENT,
    )
    damage_found = models.BooleanField(default=False)
    damage_estimate_paise = models.PositiveBigIntegerField(default=0)
    inspection_notes = models.TextField(blank=True)
    condition_photo_urls = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"CheckOut({self.stay_reservation_id}:{self.condition_grade})"


class StayExtension(models.Model):
    """Immutable revision for late checkouts or extended stays."""

    class Status(models.TextChoices):
        PENDING_PAYMENT = "PENDING_PAYMENT", "Pending payment"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stay_reservation_id: uuid.UUID
    stay_reservation = models.ForeignKey(
        StayReservation,
        on_delete=models.PROTECT,
        related_name="extensions",
    )
    original_end_date = models.DateField()
    extended_end_date = models.DateField()
    additional_nights = models.PositiveIntegerField(default=1)
    additional_amount_paise = models.PositiveBigIntegerField()
    additional_deposit_paise = models.PositiveBigIntegerField(default=0)
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.PENDING_PAYMENT,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Extension({self.stay_reservation_id}:{self.extended_end_date})"


class StayPaymentAllocation(models.Model):
    """ADR-0003 parallel money-to-work allocation model."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment_attempt_id: uuid.UUID
    stay_reservation_line_id: uuid.UUID
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        on_delete=models.PROTECT,
        related_name="stay_allocations",
    )
    stay_reservation_line = models.ForeignKey(
        StayReservationLine,
        on_delete=models.PROTECT,
        related_name="payment_allocations",
    )
    amount_paise = models.PositiveBigIntegerField()
    refunded_paise = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("payment_attempt", "stay_reservation_line"),
                name="stays_unique_allocation_per_payment_line",
            ),
            models.CheckConstraint(
                condition=models.Q(refunded_paise__lte=models.F("amount_paise")),
                name="stays_allocation_refund_lte_amount",
            ),
        ]

    def __str__(self) -> str:
        return f"StayAllocation({self.id}:{self.amount_paise})"


class PropertyVisitRequest(models.Model):
    """In-person visit request scheduled by a prospective tenant."""

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        CONFIRMED = "CONFIRMED", "Confirmed"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name="visit_requests",
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="stay_visit_requests",
        null=True,
        blank=True,
    )
    visitor_name = models.CharField(max_length=120)
    visitor_phone = models.CharField(max_length=20)
    visitor_email = models.EmailField(blank=True)
    preferred_date = models.DateField()
    time_slot = models.CharField(max_length=60)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.REQUESTED,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-preferred_date", "-created_at")

    def __str__(self) -> str:
        return f"Visit to {self.property.title} on {self.preferred_date} ({self.time_slot})"
