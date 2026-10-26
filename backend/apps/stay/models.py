"""A9 stay domain — enquiry-first Property/Unit MVP. Not Booking / FulfilmentUnit."""

from __future__ import annotations

import builtins
import uuid
from typing import Any

from django.conf import settings
from django.db import models

from apps.foundation.slugs import slug_base, unique_slug
from apps.locations.pins import pin_constraints
from apps.foundation.storage_paths import (
    stay_ad_upload_to as _unified_stay_ad_upload_to,
)
from apps.foundation.storage_paths import (
    stay_review_upload_to as _unified_stay_review_upload_to,
)


def stay_ad_upload_to(instance: models.Model, filename: str) -> str:
    return _unified_stay_ad_upload_to(instance, filename)


def stay_review_upload_to(instance: models.Model, filename: str) -> str:
    return _unified_stay_review_upload_to(instance, filename)


class Property(models.Model):
    class ModerationStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        REMOVED = "REMOVED", "Removed"

    class ListingStatus(models.TextChoices):
        """The host's own switch, independent of moderation.

        Pausing hides a property from guests without losing anything; existing bookings continue.
        Archiving is the soft delete: hidden from guests and tucked away for the host, restorable.
        Operations' ``REMOVED`` stays a separate moderation state the host cannot undo.
        """

        LIVE = "LIVE", "Live"
        PAUSED = "PAUSED", "Paused"
        ARCHIVED = "ARCHIVED", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    host = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.PROTECT, related_name="stay_properties"
    )
    variant = models.ForeignKey(
        "catalog.ServiceVariant", on_delete=models.PROTECT, related_name="stay_properties"
    )
    title = models.CharField(max_length=180)
    #: The page address: /stays/<slug>. Set once on first save; never follows title edits.
    slug = models.SlugField(max_length=100, unique=True, editable=False)
    description = models.TextField(blank=True)
    location_text = models.CharField(max_length=180, blank=True)
    #: The host's map pin. Both or neither; a property from before pins existed has neither.
    #: Guests see it only rounded to an area (`apps.locations.pins.AREA_DECIMALS`): the public
    #: listing names the area and city, never the building.
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    moderation_status = models.CharField(
        max_length=16, choices=ModerationStatus.choices, default=ModerationStatus.DRAFT
    )
    moderation_reason = models.CharField(max_length=480, blank=True)
    listing_status = models.CharField(
        max_length=12, choices=ListingStatus.choices, default=ListingStatus.LIVE
    )
    structured_fields = models.JSONField(default=dict, blank=True)
    cancellation_policy_text = models.TextField(blank=True, default="")
    house_rules = models.TextField(blank=True, default="")
    min_stay_nights = models.PositiveSmallIntegerField(default=1)
    available_from = models.DateField(null=True, blank=True)
    available_until = models.DateField(null=True, blank=True)
    #: The host's switch for "Schedule a visit". Guests can only ask for a visit when this is on
    #: and the property has at least one visiting slot.
    visits_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name_plural = "properties"
        constraints = [
            *pin_constraints(prefix="stay_property", latitude="latitude", longitude="longitude"),
        ]

    def __str__(self) -> str:
        return self.title

    def save(self, *args: Any, **kwargs: Any) -> None:
        # A readable, stable web address, set once (see apps.foundation.slugs).
        if not self.slug:
            base = slug_base(self.title, self.location_text, fallback="stay")
            self.slug = unique_slug(type(self), base, exclude_pk=self.pk)
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = {*kwargs["update_fields"], "slug"}
        super().save(*args, **kwargs)

    @property
    def public_state(self) -> str:
        """``PUBLISHED`` only when Operations allows it *and* the host has it switched on."""
        if self.moderation_status == self.ModerationStatus.APPROVED:
            hidden_by_host: dict[str, str] = {
                str(self.ListingStatus.PAUSED): "PAUSED",
                str(self.ListingStatus.ARCHIVED): "ARCHIVED",
            }
            return hidden_by_host.get(str(self.listing_status), "PUBLISHED")
        not_live: dict[str, str] = {
            str(self.ModerationStatus.PENDING): "PENDING_REVIEW",
            str(self.ModerationStatus.REJECTED): "REJECTED",
            str(self.ModerationStatus.REMOVED): "REMOVED",
        }
        return not_live.get(str(self.moderation_status), "DRAFT")


class Unit(models.Model):
    """A room type in a property: identical rooms (or beds) sold at one rate.

    Guests see one card per room type. The host manages each physical room under it as a
    :class:`Room` with its own number ("Room 101") and status. ``quantity``, ``available_count``
    and ``is_active`` are kept in step with those rooms by ``services.sync_unit_rooms``: a type
    with no available room is inactive and drops out of guest search on its own.
    ``max_guests`` is how many guests one booking of this room may bring; ``sharing_count``
    describes how many people share the room.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="units")
    name = models.CharField(max_length=120)
    sharing_count = models.PositiveSmallIntegerField(default=1)
    quantity = models.PositiveSmallIntegerField(default=1)
    #: Rooms of this type a guest can ask for right now (status AVAILABLE).
    available_count = models.PositiveSmallIntegerField(default=1)
    max_guests = models.PositiveSmallIntegerField(default=1)
    nightly_rate_paise = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)
    attributes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1), name="stay_unit_quantity_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(max_guests__gte=1), name="stay_unit_max_guests_positive"
            ),
        ]

    def __str__(self) -> str:
        return self.name


class RoomLook(models.Model):
    """A look of a room type: the photos some of its rooms share.

    "1 BHK" may have rooms 101-103 that look one way and 104-105 that look another. Each look
    has its own photos and is shown to guests as its own card ("1 BHK", "1 BHK · With balcony"),
    with the type's price. Every room belongs to exactly one look. The first look of a type may
    be unnamed; every other look needs a name, so guests can tell the cards apart.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="looks")
    name = models.CharField(max_length=60, blank=True, default="")
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "created_at")

    def __str__(self) -> str:
        return self.name or "Main look"


class Room(models.Model):
    """One physical room (or bed) of a room type, numbered by the host: "Room 101".

    Guests never see room numbers; they see the type and how many are available. The host turns
    each room on or off, and marks it Booked once a guest has agreed. Booking a room takes it out
    of the type's available count; when none is left the type stops appearing to guests.
    """

    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        #: The host switched it off (repairs, kept for family, ...). Not shown to guests.
        UNAVAILABLE = "UNAVAILABLE", "Not available"
        BOOKED = "BOOKED", "Booked"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    #: Denormalised from ``unit`` so room numbers can be unique per property.
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="rooms")
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="rooms")
    #: Which of the type's looks (photo sets) this room has. Always one of ``unit``'s looks.
    look = models.ForeignKey(RoomLook, on_delete=models.PROTECT, related_name="rooms")
    number = models.CharField(max_length=40)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.AVAILABLE)
    #: Who is in the room, for the host's own reference. Filled from the enquiry or visit.
    occupant_name = models.CharField(max_length=120, blank=True, default="")
    booked_enquiry = models.ForeignKey(
        "StayEnquiry",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="booked_rooms",
    )
    booked_visit = models.ForeignKey(
        "StayVisit",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="booked_rooms",
    )
    booked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("created_at", "number")
        constraints = [
            models.UniqueConstraint(
                fields=("property", "number"), name="stay_room_number_unique_per_property"
            ),
        ]

    def __str__(self) -> str:
        return self.number


class StayEnquiry(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        RESPONDED = "RESPONDED", "Responded"
        DECLINED = "DECLINED", "Declined"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        EXPIRED = "EXPIRED", "Expired"
        CONFIRMED = "CONFIRMED", "Confirmed"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="enquiries")
    unit = models.ForeignKey(
        Unit, null=True, blank=True, on_delete=models.PROTECT, related_name="enquiries"
    )
    #: The look the guest picked, when the type has several. Tells the host which kind of room.
    look = models.ForeignKey(
        RoomLook, null=True, blank=True, on_delete=models.SET_NULL, related_name="enquiries"
    )
    unit_reservation = models.OneToOneField(
        "UnitReservation",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="enquiry",
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stay_enquiries"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SUBMITTED)
    check_in = models.DateField()
    check_out = models.DateField()
    guest_count = models.PositiveSmallIntegerField(default=1)
    nights = models.PositiveIntegerField(default=1)
    #: How long the guest asked for, in ``price_period`` units ("3" months or "4" nights).
    #: Recorded on the enquiry so the host sees what the guest asked even if the category's
    #: pricing unit changes later. 0 on enquiries made before this was asked.
    stay_length = models.PositiveSmallIntegerField(default=0)
    price_period = models.CharField(max_length=8, blank=True, default="")
    #: An estimate for the guest (rate times length). Stays take no payment.
    total_quote_paise = models.PositiveIntegerField(default=0)
    message = models.TextField(blank=True)
    host_response = models.TextField(blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name_plural = "stay enquiries"
        indexes = [models.Index(fields=("-created_at",), name="stay_enquiry_created_idx")]

    def __str__(self) -> str:
        return f"stay-enquiry:{self.pk}"


class VisitSlot(models.Model):
    """A weekly visiting window the host offers for one property, e.g. Saturday 5 to 6 PM.

    Slots of one property never overlap on the same weekday (enforced in services). Several
    guests may ask for the same slot; the host accepts or declines each one.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="visit_slots")
    #: 0 = Monday ... 6 = Sunday, matching ``date.weekday()``.
    weekday = models.PositiveSmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("weekday", "start_time")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(weekday__lte=6), name="stay_visit_slot_weekday_range"
            ),
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="stay_visit_slot_ends_after_start",
            ),
            models.UniqueConstraint(
                fields=("property", "weekday", "start_time"),
                name="stay_visit_slot_unique_start",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.weekday} {self.start_time}-{self.end_time}"


class VisitBlockedDate(models.Model):
    """A day the host takes no visits (a holiday), whatever the weekly slots say."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(
        Property, on_delete=models.CASCADE, related_name="visit_blocked_dates"
    )
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("date",)
        constraints = [
            models.UniqueConstraint(
                fields=("property", "date"), name="stay_visit_blocked_date_unique"
            ),
        ]

    def __str__(self) -> str:
        return str(self.date)


class StayVisit(models.Model):
    """A guest asks to see a property in one of the host's visiting slots.

    The slot's day and times are copied onto the visit, so a host editing their hours later
    never moves a visit somebody already asked for.
    """

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Not accepted"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"

    class DeclineReason(models.TextChoices):
        ROOM_UNAVAILABLE = "ROOM_UNAVAILABLE", "Room unavailable"
        DATE_MISMATCH = "DATE_MISMATCH", "Date doesn't match"
        ALREADY_OCCUPIED = "ALREADY_OCCUPIED", "Already occupied"
        OTHER = "OTHER", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="visits")
    unit = models.ForeignKey(
        Unit, null=True, blank=True, on_delete=models.SET_NULL, related_name="visits"
    )
    look = models.ForeignKey(
        RoomLook, null=True, blank=True, on_delete=models.SET_NULL, related_name="visits"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stay_visits"
    )
    slot = models.ForeignKey(
        VisitSlot, null=True, blank=True, on_delete=models.SET_NULL, related_name="visits"
    )
    visit_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    message = models.TextField(blank=True, default="")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.REQUESTED)
    #: Optional. Guests see a reason only when the host chose one.
    decline_reason = models.CharField(
        max_length=20, choices=DeclineReason.choices, blank=True, default=""
    )
    decline_note = models.CharField(max_length=240, blank=True, default="")
    responded_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("property", "visit_date", "status"))]
        constraints = [
            # One open visit per guest, property and day; a declined or cancelled one may be
            # asked again.
            models.UniqueConstraint(
                fields=("customer", "property", "visit_date"),
                condition=models.Q(status__in=("REQUESTED", "ACCEPTED")),
                name="stay_visit_one_open_per_day",
            ),
        ]

    def __str__(self) -> str:
        return str(self.id)


class StayModerationEvent(models.Model):
    class Action(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        #: Went live on publish without review (enquiry mode, or a trusted paid-stays host).
        PUBLISHED = "PUBLISHED", "Published"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        REMOVED = "REMOVED", "Removed"
        REINSTATED = "REINSTATED", "Reinstated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(
        Property, on_delete=models.PROTECT, related_name="moderation_events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    reason = models.CharField(max_length=480, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"stay-moderation:{self.property_id}:{self.pk}"


class PropertyMedia(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="media")
    url = models.URLField(max_length=1024)
    caption = models.CharField(max_length=240, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "created_at")

    def __str__(self) -> str:
        return self.caption or f"media:{self.pk}"

    @builtins.property
    def image_url(self) -> str:
        return self.url

    @builtins.property
    def sort_order(self) -> int:
        return self.display_order


class UnitMedia(models.Model):
    """A photo of one room type ("Deluxe room", "2-sharing"), shown on that room's card.

    The property's own photos (``PropertyMedia``) show the building and common areas;
    these show what the guest's room looks like.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="media")
    #: The look these photos show. Guests see each look's photos on its own card.
    look = models.ForeignKey(RoomLook, on_delete=models.CASCADE, related_name="media")
    url = models.URLField(max_length=1024)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "created_at")

    def __str__(self) -> str:
        return self.url


class StayPhotoUpload(models.Model):
    """Partner-uploaded stay photo stored on the platform before it is attached."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.CASCADE,
        related_name="stay_photo_uploads",
    )
    stored_file = models.FileField(upload_to=stay_ad_upload_to)
    original_name = models.CharField(max_length=180)
    content_type = models.CharField(max_length=80)
    size_bytes = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.original_name


class StayReviewPhoto(models.Model):
    """A photo a guest uploaded for a review. Reviews may attach only their author's uploads."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="stay_review_photos",
    )
    stored_file = models.FileField(upload_to=stay_review_upload_to)
    original_name = models.CharField(max_length=180)
    content_type = models.CharField(max_length=80)
    size_bytes = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.original_name


class StayReview(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="reviews")
    enquiry = models.ForeignKey(
        StayEnquiry, null=True, blank=True, on_delete=models.SET_NULL, related_name="reviews"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stay_reviews"
    )
    rating = models.PositiveSmallIntegerField()
    body = models.TextField(blank=True)
    comment = models.TextField(blank=True)
    image_urls = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "enquiry"],
                condition=models.Q(enquiry__isnull=False),
                name="unique_customer_enquiry_stay_review",
            ),
        ]

    def __str__(self) -> str:
        return str(self.id)

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self.body and self.comment:
            self.body = self.comment
        elif not self.comment and self.body:
            self.comment = self.body
        super().save(*args, **kwargs)


class UnitReservation(models.Model):
    """Day-granular hold on a unit. Overlap enforced via select_for_update in services."""

    class Status(models.TextChoices):
        HELD = "HELD", "Held"
        CONFIRMED = "CONFIRMED", "Confirmed"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="reservations")
    check_in = models.DateField()
    check_out = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.HELD)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("unit", "status", "check_in", "check_out")),
        ]

    def __str__(self) -> str:
        return str(self.id)


class StayReservation(models.Model):
    """Paid reservation on a property unit. Created after payment capture."""

    class Status(models.TextChoices):
        HELD = "HELD", "Held (awaiting payment)"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        CONFIRMED = "CONFIRMED", "Confirmed"
        CHECKED_IN = "CHECKED_IN", "Checked in"
        CHECKED_OUT = "CHECKED_OUT", "Checked out"
        CANCELLED = "CANCELLED", "Cancelled"
        NO_SHOW = "NO_SHOW", "No show"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="reservations")
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="stay_reservations")
    unit_reservation = models.OneToOneField(
        UnitReservation, on_delete=models.PROTECT, related_name="stay_reservation"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stay_reservations"
    )
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stay_reservations",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.HELD)
    check_in = models.DateField()
    check_out = models.DateField()
    guest_count = models.PositiveSmallIntegerField(default=1)
    nights = models.PositiveIntegerField(default=1)
    total_paise = models.PositiveIntegerField(default=0)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total_paise__gt=0),
                name="stay_reservation_positive_total",
            ),
        ]
        indexes = [models.Index(fields=("-created_at",), name="stay_reservation_created_idx")]

    def __str__(self) -> str:
        return str(self.id)


class StaySubscriptionPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    price_paise = models.PositiveBigIntegerField()
    duration_days = models.PositiveSmallIntegerField(default=30)
    max_properties = models.PositiveSmallIntegerField(default=2)  # 0 = unlimited
    capabilities = models.JSONField(default=list, blank=True)
    details = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("price_paise", "id")

    def __str__(self) -> str:
        return self.name


class StaySubscription(models.Model):
    class Status(models.TextChoices):
        PENDING_ACTIVATION = "PENDING_ACTIVATION", "Pending activation"
        ACTIVE = "ACTIVE", "Active"
        GRACE = "GRACE", "Grace period"
        EXPIRED = "EXPIRED", "Expired"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    host = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.PROTECT, related_name="stay_subscriptions"
    )
    plan = models.ForeignKey(
        StaySubscriptionPlan, on_delete=models.PROTECT, related_name="subscriptions"
    )
    payment_attempt = models.OneToOneField(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stay_subscription",
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING_ACTIVATION
    )
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    grace_ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")

    def __str__(self) -> str:
        return f"{self.host_id}:{self.plan_id}:{self.status}"
