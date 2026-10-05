"""A7 rental domain — temporary possession of assets. Not Booking / FulfilmentUnit."""

from __future__ import annotations

import uuid
from datetime import datetime, time
from typing import Any

from django.conf import settings
from django.db import models
from django.db.models import Q, QuerySet

from apps.foundation.slugs import slug_base, unique_slug
from apps.foundation.storage import private_file_storage
from apps.foundation.storage_paths import (
    rental_ad_upload_to as _unified_rental_ad_upload_to,
)
from apps.foundation.storage_paths import (
    rental_dispute_upload_to as _unified_rental_dispute_upload_to,
)


def rental_ad_upload_to(instance: models.Model, filename: str) -> str:
    return _unified_rental_ad_upload_to(instance, filename)


class RentalAsset(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        UNDER_MAINTENANCE = "UNDER_MAINTENANCE", "Under maintenance"
        RETIRED = "RETIRED", "Retired"

    class ConditionGrade(models.TextChoices):
        NEW = "NEW", "New"
        GOOD = "GOOD", "Good"
        FAIR = "FAIR", "Fair"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.PROTECT, related_name="rental_assets"
    )
    variant = models.ForeignKey(
        "catalog.ServiceVariant", on_delete=models.PROTECT, related_name="rental_assets"
    )
    title = models.CharField(max_length=180)
    #: The page address: /rentals/<slug>. Set once on first save; never follows title edits.
    slug = models.SlugField(max_length=100, unique=True, editable=False)
    description = models.TextField(blank=True)
    asset_identifier = models.CharField(max_length=80, blank=True)
    is_serialized = models.BooleanField(default=True)
    quantity_available = models.PositiveIntegerField(default=1)

    class ModerationStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        REMOVED = "REMOVED", "Removed"
        PAUSED = "PAUSED", "Paused"

    condition_grade = models.CharField(
        max_length=16, choices=ConditionGrade.choices, default=ConditionGrade.GOOD
    )
    current_status = models.CharField(max_length=24, choices=Status.choices, default=Status.ACTIVE)
    daily_rate_paise = models.PositiveIntegerField()
    deposit_paise = models.PositiveIntegerField(default=0)
    location_text = models.CharField(max_length=180, blank=True)
    moderation_status = models.CharField(
        max_length=16,
        choices=ModerationStatus.choices,
        default=ModerationStatus.DRAFT,
    )
    moderation_reason = models.CharField(max_length=480, blank=True)
    structured_fields = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("partner", "current_status"), name="rental_asset_partner_idx"),
            models.Index(
                fields=("moderation_status", "current_status"), name="rental_asset_public_idx"
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_available__gte=1),
                name="rental_asset_quantity_available_gte_1",
            ),
        ]

    def __str__(self) -> str:
        return self.title

    def save(self, *args: Any, **kwargs: Any) -> None:
        # A readable, stable web address, set once (see apps.foundation.slugs).
        if not self.slug:
            base = slug_base(self.title, self.location_text, fallback="rental")
            self.slug = unique_slug(type(self), base, exclude_pk=self.pk)
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = {*kwargs["update_fields"], "slug"}
        super().save(*args, **kwargs)

    @property
    def public_state(self) -> str:
        if self.current_status == self.Status.RETIRED:
            return "RETIRED"
        status_map = {
            "PENDING": "PENDING_REVIEW",
            "REJECTED": "REJECTED",
            "REMOVED": "REMOVED",
            "PAUSED": "PAUSED",
        }
        if self.moderation_status in status_map:
            return status_map[self.moderation_status]
        if self.moderation_status == "APPROVED" and self.current_status == self.Status.ACTIVE:
            return "PUBLISHED"
        return "DRAFT"


class AssetReservation(models.Model):
    """Stock held from pickup to return. Overlap is checked in services under a row lock."""

    class Status(models.TextChoices):
        TENTATIVE = "TENTATIVE", "Tentative"
        CONFIRMED = "CONFIRMED", "Confirmed"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(RentalAsset, on_delete=models.PROTECT, related_name="reservations")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.TENTATIVE)
    start_date = models.DateField()
    end_date = models.DateField()
    #: When the customer collects and returns the item. Stock is held between the two, so an
    #: item returned at 10:00 can go out again at 14:00 the same day.
    pickup_at = models.DateTimeField()
    return_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("asset", "status", "start_date", "end_date")),
            models.Index(fields=("asset", "status", "pickup_at", "return_at")),
        ]


class RentalDeposit(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        AUTHORIZED = "AUTHORIZED", "Authorized"
        HELD = "HELD", "Held"
        RELEASED = "RELEASED", "Released"
        PARTIALLY_CONSUMED = "PARTIALLY_CONSUMED", "Partially consumed"
        FULLY_CONSUMED = "FULLY_CONSUMED", "Fully consumed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    amount_paise = models.PositiveIntegerField()
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.REQUESTED)
    consumed_paise = models.PositiveIntegerField(default=0)
    requested_consume_paise = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Partner claim, in paise. Empty until a dispute is raised.",
    )
    provider_note = models.CharField(
        max_length=240,
        blank=True,
        help_text="Operator note. A live hold is recorded only after payment capture.",
    )
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="rental_deposits",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class RentalBooking(models.Model):
    class Status(models.TextChoices):
        PENDING_PAYMENT = "PENDING_PAYMENT", "Pending payment"
        CONFIRMED = "CONFIRMED", "Confirmed"
        HANDOVER = "HANDOVER", "Handed over"
        RETURNED = "RETURNED", "Returned"
        CANCELLED = "CANCELLED", "Cancelled"
        DISPUTED = "DISPUTED", "Disputed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="rental_bookings"
    )
    asset = models.ForeignKey(RentalAsset, on_delete=models.PROTECT, related_name="bookings")
    reservation = models.OneToOneField(
        AssetReservation, on_delete=models.PROTECT, related_name="booking"
    )
    deposit = models.OneToOneField(RentalDeposit, on_delete=models.PROTECT, related_name="booking")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.CONFIRMED)
    #: Pickup and return dates, kept for lists and reports. ``pickup_at``/``return_at`` decide.
    start_date = models.DateField()
    end_date = models.DateField()
    pickup_at = models.DateTimeField()
    return_at = models.DateTimeField()
    price_paise = models.PositiveIntegerField()
    #: Snapshot of the platform fee at booking time. Later rate changes do not rewrite it.
    platform_fee_percent = models.PositiveSmallIntegerField(default=0)
    platform_fee_paise = models.PositiveIntegerField(default=0)
    pickup_or_delivery_mode = models.CharField(max_length=32, default="PICKUP")
    notes = models.TextField(blank=True)
    handover_pin_hash = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)


class RentalPlatformFee(models.Model):
    """The one percentage added on top of every rental fee. The deposit is excluded."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    percent = models.PositiveSmallIntegerField(default=0)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(id=1),
                name="rental_platform_fee_singleton",
            ),
            models.CheckConstraint(
                condition=models.Q(percent__lte=100),
                name="rental_platform_fee_percent_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.percent}%"


class RentalPickupHours(models.Model):
    """When a rental partner hands items over and takes them back.

    One row per partner and it covers all their items. A partner without a row
    gets ``RentalPickupHours.defaults_for(partner)`` (every day, 09:00-20:00).
    """

    #: Monday = 0 … Sunday = 6, as ``date.weekday()``.
    ALL_DAYS = (0, 1, 2, 3, 4, 5, 6)
    DEFAULT_OPENS = time(9, 0)
    DEFAULT_CLOSES = time(20, 0)
    DEFAULT_NOTICE_MINUTES = 120
    DEFAULT_MAX_ADVANCE_DAYS = 60

    partner = models.OneToOneField(
        "partners.PartnerProfile", on_delete=models.CASCADE, related_name="rental_pickup_hours"
    )
    open_days = models.JSONField(default=list)
    opens_at = models.TimeField(default=DEFAULT_OPENS)
    closes_at = models.TimeField(default=DEFAULT_CLOSES)
    #: The customer must book at least this long before pickup.
    min_notice_minutes = models.PositiveIntegerField(default=DEFAULT_NOTICE_MINUTES)
    #: The furthest ahead a pickup can be booked.
    max_advance_days = models.PositiveSmallIntegerField(default=DEFAULT_MAX_ADVANCE_DAYS)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Pickup hours for {self.partner_id}"

    @classmethod
    def defaults_for(cls, partner: Any) -> RentalPickupHours:
        return cls(partner=partner, open_days=list(cls.ALL_DAYS))

    @classmethod
    def for_partner(cls, partner: Any) -> RentalPickupHours:
        row = cls.objects.filter(partner=partner).first()
        return row if row is not None else cls.defaults_for(partner)


class RentalBookingLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(RentalBooking, on_delete=models.CASCADE, related_name="lines")
    asset = models.ForeignKey(RentalAsset, on_delete=models.PROTECT, related_name="booking_lines")
    quantity = models.PositiveIntegerField(default=1)
    unit_price_paise = models.PositiveIntegerField()
    deposit_paise = models.PositiveIntegerField(default=0)


class RentalModerationEvent(models.Model):
    class Action(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        REMOVED = "REMOVED", "Removed"
        REINSTATED = "REINSTATED", "Reinstated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        RentalAsset, on_delete=models.PROTECT, related_name="moderation_events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    reason = models.CharField(max_length=480, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


def overlapping_reservations(
    asset_id: uuid.UUID, start: datetime, end: datetime
) -> QuerySet[AssetReservation]:
    return AssetReservation.objects.filter(
        asset_id=asset_id,
        status__in=(AssetReservation.Status.TENTATIVE, AssetReservation.Status.CONFIRMED),
    ).filter(Q(pickup_at__lt=end) & Q(return_at__gt=start))


def overlapping_reserved_quantity(asset_id: uuid.UUID, start: datetime, end: datetime) -> int:
    """Most pieces held at any one moment between ``start`` and ``end``.

    Sums booking-line quantities, because counting reservation *rows* under-counts
    multi-unit bookings (one ``AssetReservation`` per booking whatever its quantity),
    which let stock be oversold.

    CANCELLED/RETURNED bookings are excluded even if a leaked CONFIRMED
    reservation row remains (ghost hold); callers should still repair those rows.
    """
    lines = (
        RentalBookingLine.objects.filter(
            asset_id=asset_id,
            booking__reservation__status__in=(
                AssetReservation.Status.TENTATIVE,
                AssetReservation.Status.CONFIRMED,
            ),
            booking__reservation__pickup_at__lt=end,
            booking__reservation__return_at__gt=start,
        )
        .exclude(
            booking__status__in=(
                RentalBooking.Status.CANCELLED,
                RentalBooking.Status.RETURNED,
            )
        )
        .select_related("booking__reservation")
    )

    events: list[tuple[datetime, int]] = []
    for line in lines:
        act_start = max(line.booking.reservation.pickup_at, start)
        act_end = min(line.booking.reservation.return_at, end)
        if act_start < act_end:
            events.append((act_start, line.quantity))
            events.append((act_end, -line.quantity))

    if not events:
        return 0

    # A return and a pickup at the same moment do not overlap: apply returns first.
    events.sort(key=lambda x: (x[0], x[1]))
    max_q = 0
    cur_q = 0
    for _, delta in events:
        cur_q += delta
        max_q = max(max_q, cur_q)

    return max_q


class RentalPhotoUpload(models.Model):
    """Partner-uploaded ad photo stored on the platform before it is attached to an asset."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.CASCADE,
        related_name="rental_photo_uploads",
    )
    stored_file = models.FileField(upload_to=rental_ad_upload_to)
    original_name = models.CharField(max_length=180)
    content_type = models.CharField(max_length=80)
    size_bytes = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.original_name


def rental_dispute_upload_to(instance: models.Model, filename: str) -> str:
    return _unified_rental_dispute_upload_to(instance, filename)


class RentalDisputePhoto(models.Model):
    """Damage evidence attached when a partner raises a deposit dispute.

    Stored with the private file backend, so it lands in the Cloudflare R2
    private bucket once R2 is configured, and on local disk until then.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.CASCADE,
        related_name="rental_dispute_photos",
    )
    booking = models.ForeignKey(
        RentalBooking,
        on_delete=models.CASCADE,
        related_name="dispute_photos",
        null=True,
        blank=True,
    )
    stored_file = models.FileField(
        upload_to=rental_dispute_upload_to,
        storage=private_file_storage,
    )
    original_name = models.CharField(max_length=180)
    content_type = models.CharField(max_length=80)
    size_bytes = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at",)

    def __str__(self) -> str:
        return self.original_name


class RentalAssetMedia(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(RentalAsset, on_delete=models.CASCADE, related_name="media")
    url = models.URLField(max_length=1024)
    caption = models.CharField(max_length=240, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "created_at")

    @property
    def image_url(self) -> str:
        return self.url

    @property
    def sort_order(self) -> int:
        return self.display_order
