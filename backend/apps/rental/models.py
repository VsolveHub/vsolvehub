"""A7 rental domain — temporary possession of assets. Not Booking / FulfilmentUnit."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import models
from django.db.models import Q, QuerySet

from apps.foundation.slugs import slug_base, unique_slug
from apps.foundation.storage import private_file_storage
from apps.locations.pins import pin_constraints


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
    #: Where a customer collects the item (Self Pickup).
    pickup_address_line = models.CharField(max_length=240, blank=True, default="")
    pickup_area = models.CharField(max_length=120, blank=True, default="")
    pickup_city = models.CharField(max_length=120, blank=True, default="")
    pickup_pincode = models.CharField(max_length=6, blank=True, default="")
    #: The owner's map pin for the pickup address. Both or neither; an ad from before pins
    #: existed has neither, and its link falls back to a search for the address text.
    pickup_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    pickup_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    #: The owner can arrange transport on request and quotes a price for each request.
    delivery_available = models.BooleanField(default=False)
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
            models.CheckConstraint(
                condition=models.Q(pickup_pincode="")
                | models.Q(pickup_pincode__regex=r"^[1-9][0-9]{5}$"),
                name="rental_asset_pickup_pincode_format",
            ),
            *pin_constraints(
                prefix="rental_asset_pickup",
                latitude="pickup_latitude",
                longitude="pickup_longitude",
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

    def __str__(self) -> str:
        return f"{self.asset_id}:{self.start_date}..{self.end_date}:{self.status}"


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

    def __str__(self) -> str:
        return f"deposit:{self.pk}:{self.status}"


class RentalBooking(models.Model):
    class Status(models.TextChoices):
        #: Delivery only: waiting for the owner's transport price. Nothing is charged yet.
        AWAITING_TRANSPORT_QUOTE = "AWAITING_TRANSPORT_QUOTE", "Awaiting transport quote"
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
    #: Snapshot of the platform fee at booking time. Later rate changes do not rewrite it.
    platform_fee_percent = models.PositiveSmallIntegerField(default=0)
    platform_fee_paise = models.PositiveIntegerField(default=0)

    class Mode(models.TextChoices):
        PICKUP = "PICKUP", "Self pickup"
        DELIVERY = "DELIVERY", "Partner-arranged delivery"

    pickup_or_delivery_mode = models.CharField(
        max_length=32, choices=Mode.choices, default=Mode.PICKUP
    )
    #: Delivery only. ``{line, area, city, pincode, contact_phone}``.
    delivery_address = models.JSONField(default=dict, blank=True)
    #: The owner's agreed transport price, snapshotted when the customer accepts it.
    transport_paise = models.PositiveIntegerField(default=0)
    transport_fee_percent = models.PositiveSmallIntegerField(default=0)
    transport_fee_paise = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)
    handover_pin_hash = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pickup_or_delivery_mode__in=("PICKUP", "DELIVERY")),
                name="rental_booking_mode_valid",
            ),
            models.CheckConstraint(
                condition=~models.Q(pickup_or_delivery_mode="PICKUP")
                | (models.Q(transport_paise=0) & models.Q(transport_fee_paise=0)),
                name="rental_booking_pickup_has_no_transport",
            ),
            models.CheckConstraint(
                condition=~models.Q(pickup_or_delivery_mode="DELIVERY")
                | ~models.Q(delivery_address={}),
                name="rental_booking_delivery_has_address",
            ),
            models.CheckConstraint(
                condition=models.Q(transport_fee_paise__lte=models.F("transport_paise")),
                name="rental_booking_transport_fee_lte_transport",
            ),
        ]

    def __str__(self) -> str:
        return f"rental-booking:{self.pk}"


class RentalTransportRequest(models.Model):
    """The customer's delivery request and the owner's transport price for one booking.

    The platform never prices transport. The owner checks the request, arranges a vehicle and
    quotes; the customer accepts or rejects. Nothing is charged until the customer accepts, and
    then rent, deposit and transport are paid together.
    """

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        QUOTED = "QUOTED", "Quoted"
        ACCEPTED = "ACCEPTED", "Accepted"
        OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Out for delivery"
        DELIVERED = "DELIVERED", "Delivered"
        DECLINED = "DECLINED", "Declined"
        EXPIRED = "EXPIRED", "Expired"
        CANCELLED = "CANCELLED", "Cancelled"

    class Trip(models.TextChoices):
        ONE_WAY = "ONE_WAY", "Drop only"
        ROUND_TRIP = "ROUND_TRIP", "Drop and collect"

    MAX_QUOTES = 3

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.OneToOneField(
        RentalBooking, on_delete=models.PROTECT, related_name="transport"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    #: Set with the quote. Null until the owner quotes.
    trip = models.CharField(
        max_length=12, choices=Trip.choices, null=True, blank=True, default=None
    )
    customer_note = models.CharField(max_length=480, blank=True, default="")
    reject_note = models.CharField(max_length=480, blank=True, default="")
    decline_reason = models.CharField(max_length=480, blank=True, default="")
    quote_paise = models.PositiveIntegerField(null=True, blank=True)
    quote_note = models.CharField(max_length=480, blank=True, default="")
    quote_count = models.PositiveSmallIntegerField(default=0)
    #: The owner's quote deadline while REQUESTED, the customer's answer deadline while QUOTED.
    respond_by = models.DateTimeField()
    requested_at = models.DateTimeField(auto_now_add=True)
    quoted_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=("status", "respond_by"), name="rental_transport_due_idx")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quote_count__lte=3),
                name="rental_transport_quote_count_max",
            ),
            models.CheckConstraint(
                condition=~models.Q(
                    status__in=("QUOTED", "ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED")
                )
                | (models.Q(quote_paise__gt=0) & models.Q(trip__isnull=False)),
                name="rental_transport_quoted_has_price",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.booking_id}:{self.status}"


class RentalPickupDay(models.Model):
    """One weekday the owner is open for pickups and returns. No row for a weekday = closed.

    One schedule per owner, used by all their rental items. There are no time slots: the
    customer comes any time inside that day's hours.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.CASCADE, related_name="rental_pickup_days"
    )
    #: Monday = 0 … Sunday = 6, as ``date.weekday()``.
    weekday = models.PositiveSmallIntegerField()
    opens_at = models.TimeField()
    closes_at = models.TimeField()

    class Meta:
        ordering = ("weekday",)
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "weekday"), name="rental_pickup_day_one_per_weekday"
            ),
            models.CheckConstraint(
                condition=models.Q(weekday__lte=6), name="rental_pickup_day_weekday_range"
            ),
            models.CheckConstraint(
                condition=models.Q(closes_at__gt=models.F("opens_at")),
                name="rental_pickup_day_closes_after_opens",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.weekday}"


class RentalPickupClosedDate(models.Model):
    """A date the owner takes no pickups or returns (a holiday), whatever the weekly hours say.

    The rental twin of ``stay.VisitBlockedDate``: one list per owner, used by all their items.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.CASCADE,
        related_name="rental_pickup_closed_dates",
    )
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("date",)
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "date"), name="rental_pickup_closed_date_unique"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.date}"


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


class RentalBookingLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(RentalBooking, on_delete=models.CASCADE, related_name="lines")
    asset = models.ForeignKey(RentalAsset, on_delete=models.PROTECT, related_name="booking_lines")
    quantity = models.PositiveIntegerField(default=1)
    unit_price_paise = models.PositiveIntegerField()
    deposit_paise = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.booking_id}:{self.asset_id}x{self.quantity}"


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

    def __str__(self) -> str:
        return f"rental-moderation:{self.asset_id}:{self.pk}"


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


def rental_dispute_upload_to(instance: models.Model, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    partner_key = getattr(instance, "partner_id", None) or "anon"
    return f"rental-disputes/{partner_key}/{uuid.uuid4().hex}{ext}"


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

    def __str__(self) -> str:
        return self.caption or f"media:{self.pk}"

    @property
    def image_url(self) -> str:
        return self.url

    @property
    def sort_order(self) -> int:
        return self.display_order
