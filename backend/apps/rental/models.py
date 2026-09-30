"""A7 rental domain — temporary possession of assets. Not Booking / FulfilmentUnit."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

from django.conf import settings
from django.db import models
from django.db.models import Q, QuerySet


def rental_ad_upload_to(instance: models.Model, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    partner_key = getattr(instance, "partner_id", None) or "anon"
    return f"rental-ads/{partner_key}/{uuid.uuid4().hex}{ext}"


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

    @property
    def public_state(self) -> str:
        if self.current_status == self.Status.RETIRED:
            return "RETIRED"
        if self.moderation_status == "PENDING":
            return "PENDING_REVIEW"
        if self.moderation_status == "REJECTED":
            return "REJECTED"
        if self.moderation_status == "REMOVED":
            return "REMOVED"
        if self.moderation_status == "APPROVED" and self.current_status == self.Status.ACTIVE:
            return "PUBLISHED"
        return "DRAFT"


class AssetReservation(models.Model):
    """Day-granular hold on an asset. MVP overlap enforced in services (select_for_update)."""

    class Status(models.TextChoices):
        TENTATIVE = "TENTATIVE", "Tentative"
        CONFIRMED = "CONFIRMED", "Confirmed"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(RentalAsset, on_delete=models.PROTECT, related_name="reservations")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.TENTATIVE)
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("asset", "status", "start_date", "end_date")),
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
    start_date = models.DateField()
    end_date = models.DateField()
    price_paise = models.PositiveIntegerField()
    pickup_or_delivery_mode = models.CharField(max_length=32, default="PICKUP")
    notes = models.TextField(blank=True)
    handover_pin_hash = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)


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
    asset_id: uuid.UUID, start: date, end: date
) -> QuerySet[AssetReservation]:
    return AssetReservation.objects.filter(
        asset_id=asset_id,
        status__in=(AssetReservation.Status.TENTATIVE, AssetReservation.Status.CONFIRMED),
    ).filter(Q(start_date__lt=end) & Q(end_date__gt=start))


def overlapping_reserved_quantity(asset_id: uuid.UUID, start: date, end: date) -> int:
    """Sum booking-line quantities held by overlapping tentative/confirmed reservations.

    Counting reservation *rows* under-counts multi-unit bookings (quantity > 1 on a
    line still creates one ``AssetReservation``), which let stock be oversold.

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
            booking__reservation__start_date__lt=end,
            booking__reservation__end_date__gt=start,
        )
        .exclude(
            booking__status__in=(
                RentalBooking.Status.CANCELLED,
                RentalBooking.Status.RETURNED,
            )
        )
        .select_related("booking__reservation")
    )

    events = []
    for line in lines:
        r_start = line.booking.reservation.start_date
        r_end = line.booking.reservation.end_date
        act_start = max(r_start, start)
        act_end = min(r_end, end)
        if act_start < act_end:
            events.append((act_start, line.quantity))
            events.append((act_end, -line.quantity))

    if not events:
        return 0

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
