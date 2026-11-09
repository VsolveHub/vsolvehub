"""VSolve Rides V1: bike, auto and cab rides.

Money is integer paise, calculated on the server. Every invariant that matters is also a database
constraint, so a bug in a service cannot write an impossible row.
"""

import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

__all__ = [
    "OPEN_RIDE_STATES",
    "RATE_FIELDS",
    "ActorKind",
    "CaptainDutySession",
    "CaptainPass",
    "CaptainPassPlan",
    "CaptainVehicle",
    "FareQuote",
    "Ride",
    "RideOffer",
    "RideRateCard",
    "RideRating",
    "RideSosEvent",
    "RideState",
    "RideTrackPoint",
    "RideTransition",
    "VehicleType",
    "normalise_registration_number",
]


def normalise_registration_number(value: str) -> str:
    """Upper-case with no spaces, so two spellings of one plate are one plate."""
    return "".join(value.split()).upper()


class VehicleType(models.TextChoices):
    BIKE = "BIKE", "Bike"
    AUTO = "AUTO", "Auto"
    CAB = "CAB", "Cab"


class CaptainVehicle(models.Model):
    """The one vehicle a ride captain drives. A captain is a partner on the `RIDE_CAPTAIN` track."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.OneToOneField(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="ride_vehicle",
    )
    vehicle_type = models.CharField(max_length=8, choices=VehicleType.choices)
    #: Stored upper-case with no spaces, so two spellings cannot be two vehicles.
    registration_number = models.CharField(max_length=16, unique=True)
    make_model = models.CharField(max_length=120)
    colour = models.CharField(max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(registration_number=""),
                name="rides_vehicle_registration_present",
            ),
        ]

    def __str__(self) -> str:
        return self.registration_number

    def save(self, *args: Any, **kwargs: Any) -> None:
        self.registration_number = normalise_registration_number(self.registration_number)
        super().save(*args, **kwargs)


#: A rate card's price fields: what Operations sets and what a new version copies.
RATE_FIELDS = (
    "base_fare_paise",
    "included_distance_m",
    "per_km_paise",
    "per_minute_paise",
    "minimum_fare_paise",
    "free_waiting_minutes",
    "waiting_per_minute_paise",
)


class RideRateCard(models.Model):
    """Operations' price list for one vehicle type in one service area.

    A vehicle type is bookable in an area only while it has an active card: that is the only
    on/off switch. An edit is a new row with the next `version`, and the old row is deactivated,
    so a quote keeps the exact numbers it was priced on.

    Every money value is integer paise. Positive integer fields make "never negative" a database
    rule, not just a serializer rule.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_area = models.ForeignKey(
        "locations.ServiceArea",
        on_delete=models.PROTECT,
        related_name="ride_rate_cards",
    )
    vehicle_type = models.CharField(max_length=8, choices=VehicleType.choices)

    base_fare_paise = models.PositiveBigIntegerField()
    #: Distance the base fare already covers, in metres. `per_km_paise` applies beyond it.
    included_distance_m = models.PositiveIntegerField()
    per_km_paise = models.PositiveBigIntegerField()
    per_minute_paise = models.PositiveBigIntegerField()
    minimum_fare_paise = models.PositiveBigIntegerField()
    free_waiting_minutes = models.PositiveSmallIntegerField()
    waiting_per_minute_paise = models.PositiveBigIntegerField()

    is_active = models.BooleanField(default=True)
    #: Starts at 1 and goes up by one per edit, per (area, vehicle type).
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ride_rate_cards_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("service_area", "vehicle_type", "-version")
        constraints = [
            # The on/off switch: at most one live price per area and vehicle type.
            models.UniqueConstraint(
                fields=("service_area", "vehicle_type"),
                condition=Q(is_active=True),
                name="rides_one_active_rate_card_per_area_vehicle",
            ),
            models.UniqueConstraint(
                fields=("service_area", "vehicle_type", "version"),
                name="rides_unique_rate_card_version",
            ),
            models.CheckConstraint(
                condition=Q(version__gte=1),
                name="rides_rate_card_version_from_one",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.service_area_id}:{self.vehicle_type}:v{self.version}"


class FareQuote(models.Model):
    """One upfront price for one vehicle type on one route, shown to a rider.

    It keeps its own copy of the route and the rate-card version, so a later price change never
    alters a fare the rider has already seen. It lives for `RIDES_QUOTE_TTL_SECONDS` and books at
    most one ride: `consumed_at` is set when it does.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="ride_quotes",
    )
    service_area = models.ForeignKey(
        "locations.ServiceArea",
        on_delete=models.PROTECT,
        related_name="ride_quotes",
    )
    vehicle_type = models.CharField(max_length=8, choices=VehicleType.choices)
    rate_card = models.ForeignKey(RideRateCard, on_delete=models.PROTECT, related_name="quotes")
    rate_card_version = models.PositiveIntegerField()

    pickup_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    pickup_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    pickup_label = models.CharField(max_length=255)
    drop_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    drop_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    drop_label = models.CharField(max_length=255)

    distance_m = models.PositiveIntegerField()
    duration_s = models.PositiveIntegerField()
    route_polyline = models.TextField()
    fare_paise = models.PositiveBigIntegerField()

    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=Q(rate_card_version__gte=1),
                name="rides_quote_rate_card_version_from_one",
            ),
            models.CheckConstraint(
                condition=Q(expires_at__gt=models.F("created_at")),
                name="rides_quote_expires_after_creation",
            ),
            models.CheckConstraint(
                condition=Q(pickup_latitude__gte=-90, pickup_latitude__lte=90)
                & Q(drop_latitude__gte=-90, drop_latitude__lte=90)
                & Q(pickup_longitude__gte=-180, pickup_longitude__lte=180)
                & Q(drop_longitude__gte=-180, drop_longitude__lte=180),
                name="rides_quote_coordinates_in_range",
            ),
        ]
        indexes = [models.Index(fields=("rider", "-created_at"), name="rides_quote_rider_recent")]

    def __str__(self) -> str:
        return f"{self.vehicle_type}:{self.fare_paise}p"


# --- Captain supply ---------------------------------------------------------------------------


class CaptainPassPlan(models.Model):
    """A pass Operations sells to captains. A captain needs an active pass to go on duty."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    price_paise = models.PositiveBigIntegerField()
    duration_hours = models.PositiveSmallIntegerField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("price_paise", "code")
        constraints = [
            models.CheckConstraint(
                condition=Q(duration_hours__gte=1), name="rides_pass_plan_lasts_an_hour_or_more"
            ),
        ]

    def __str__(self) -> str:
        return self.code


class CaptainPass(models.Model):
    """A pass one captain bought. Copies `StaySubscription`: paid through commerce, then active."""

    class Status(models.TextChoices):
        PENDING_ACTIVATION = "PENDING_ACTIVATION", "Pending activation"
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.PROTECT, related_name="ride_passes"
    )
    plan = models.ForeignKey(CaptainPassPlan, on_delete=models.PROTECT, related_name="passes")
    #: Null for a ₹0 plan, which needs no payment.
    payment_attempt = models.OneToOneField(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ride_captain_pass",
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING_ACTIVATION
    )
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("partner",),
                condition=Q(status="ACTIVE"),
                name="rides_one_active_pass_per_captain",
            ),
            # An active pass always knows exactly when it ends.
            models.CheckConstraint(
                condition=~Q(status="ACTIVE")
                | Q(starts_at__isnull=False, ends_at__gt=F("starts_at")),
                name="rides_active_pass_has_a_window",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.plan_id}:{self.status}"


class CaptainDutySession(models.Model):
    """One stretch of a captain being on duty. Open while `ended_at` is null."""

    class EndReason(models.TextChoices):
        CAPTAIN_OFF = "CAPTAIN_OFF", "Captain went off duty"
        LOCATION_STALE = "LOCATION_STALE", "Location stopped arriving"
        PASS_EXPIRED = "PASS_EXPIRED", "Pass expired"
        SUSPENDED = "SUSPENDED", "Captain suspended"
        OPERATIONS = "OPERATIONS", "Operations"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.PROTECT, related_name="ride_duty_sessions"
    )
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=16, choices=EndReason.choices, blank=True)

    class Meta:
        ordering = ("-started_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("partner",),
                condition=Q(ended_at__isnull=True),
                name="rides_one_open_duty_session_per_captain",
            ),
            # Open with no reason, or closed after it started and with a reason.
            models.CheckConstraint(
                condition=Q(ended_at__isnull=True, end_reason="")
                | (Q(ended_at__gte=F("started_at")) & ~Q(end_reason="")),
                name="rides_duty_session_end_is_consistent",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.started_at:%Y-%m-%d %H:%M}"


# --- Rides ------------------------------------------------------------------------------------


class RideState(models.TextChoices):
    SEARCHING = "SEARCHING", "Searching"
    CAPTAIN_ASSIGNED = "CAPTAIN_ASSIGNED", "Captain assigned"
    CAPTAIN_ARRIVED = "CAPTAIN_ARRIVED", "Captain arrived"
    IN_TRIP = "IN_TRIP", "In trip"
    COMPLETED = "COMPLETED", "Completed"
    NO_CAPTAIN_FOUND = "NO_CAPTAIN_FOUND", "No captain found"
    CANCELLED = "CANCELLED", "Cancelled"


#: States in which the ride still needs someone: the rider or captain cannot start another one.
OPEN_RIDE_STATES = (
    RideState.SEARCHING,
    RideState.CAPTAIN_ASSIGNED,
    RideState.CAPTAIN_ARRIVED,
    RideState.IN_TRIP,
)

#: States that must name the captain doing the ride.
_CAPTAIN_STATES = (
    RideState.CAPTAIN_ASSIGNED,
    RideState.CAPTAIN_ARRIVED,
    RideState.IN_TRIP,
    RideState.COMPLETED,
)


class ActorKind(models.TextChoices):
    RIDER = "RIDER", "Rider"
    CAPTAIN = "CAPTAIN", "Captain"
    OPERATIONS = "OPERATIONS", "Operations"
    SYSTEM = "SYSTEM", "System"


class Ride(models.Model):
    """A booked ride, from searching for a captain to payment.

    The pickup, drop and fare are copied from the quote, so the ride stands on its own. The OTP is
    never stored: it is derived from the ride id with `RIDES_OTP_SECRET`.
    """

    class PaymentMethod(models.TextChoices):
        CASH_OR_UPI = "CASH_OR_UPI", "Cash or UPI to the captain"

    class PaymentStatus(models.TextChoices):
        DUE = "DUE", "Due"
        COLLECTED = "COLLECTED", "Collected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="rides"
    )
    #: One-to-one: a quote books at most one ride.
    quote = models.OneToOneField(FareQuote, on_delete=models.PROTECT, related_name="ride")
    service_area = models.ForeignKey(
        "locations.ServiceArea", on_delete=models.PROTECT, related_name="rides"
    )
    vehicle_type = models.CharField(max_length=8, choices=VehicleType.choices)

    pickup_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    pickup_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    pickup_label = models.CharField(max_length=255)
    drop_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    drop_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    drop_label = models.CharField(max_length=255)

    state = models.CharField(max_length=20, choices=RideState.choices, default=RideState.SEARCHING)
    captain = models.ForeignKey(
        "partners.PartnerProfile",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="rides_as_captain",
    )

    fare_paise = models.PositiveBigIntegerField()
    waiting_paise = models.PositiveBigIntegerField(default=0)
    #: Set when the trip completes: always `fare_paise + waiting_paise`.
    final_fare_paise = models.PositiveBigIntegerField(null=True, blank=True)
    payment_method = models.CharField(
        max_length=16, choices=PaymentMethod.choices, default=PaymentMethod.CASH_OR_UPI
    )
    payment_status = models.CharField(
        max_length=12, choices=PaymentStatus.choices, default=PaymentStatus.DUE
    )
    otp_attempts = models.PositiveSmallIntegerField(default=0)
    dispatch_round = models.PositiveSmallIntegerField(default=0)

    #: `created_at` is when the ride started searching; one timestamp per later state.
    created_at = models.DateTimeField(auto_now_add=True)
    captain_assigned_at = models.DateTimeField(null=True, blank=True)
    captain_arrived_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    payment_collected_at = models.DateTimeField(null=True, blank=True)
    no_captain_found_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.CharField(max_length=12, choices=ActorKind.choices, blank=True)
    cancel_reason = models.CharField(max_length=64, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("rider",),
                condition=Q(state__in=OPEN_RIDE_STATES),
                name="rides_one_open_ride_per_rider",
            ),
            models.UniqueConstraint(
                fields=("captain",),
                condition=Q(state__in=OPEN_RIDE_STATES, captain__isnull=False),
                name="rides_one_open_ride_per_captain",
            ),
            models.CheckConstraint(
                condition=~Q(state__in=_CAPTAIN_STATES) | Q(captain__isnull=False),
                name="rides_assigned_ride_has_a_captain",
            ),
            models.CheckConstraint(
                condition=Q(final_fare_paise__isnull=True)
                | Q(final_fare_paise=F("fare_paise") + F("waiting_paise")),
                name="rides_final_fare_is_fare_plus_waiting",
            ),
            models.CheckConstraint(
                condition=~Q(state=RideState.COMPLETED) | Q(final_fare_paise__isnull=False),
                name="rides_completed_ride_has_a_final_fare",
            ),
            models.CheckConstraint(
                condition=~Q(state=RideState.CANCELLED)
                | (~Q(cancelled_by="") & ~Q(cancel_reason="") & Q(cancelled_at__isnull=False)),
                name="rides_cancelled_ride_says_who_and_why",
            ),
            models.CheckConstraint(
                condition=Q(otp_attempts__lte=5), name="rides_otp_attempts_at_most_five"
            ),
        ]
        indexes = [
            models.Index(fields=("state", "-created_at"), name="rides_ride_state_recent"),
            models.Index(fields=("rider", "-created_at"), name="rides_ride_rider_recent"),
        ]

    def __str__(self) -> str:
        return f"{self.id}:{self.state}"


class RideTransition(models.Model):
    """Append-only history: every state change, with who made it and why."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ride = models.ForeignKey(Ride, on_delete=models.PROTECT, related_name="transitions")
    #: Blank for the ride's first row, when it is created.
    from_state = models.CharField(max_length=20, choices=RideState.choices, blank=True)
    to_state = models.CharField(max_length=20, choices=RideState.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ride_transitions",
    )
    actor_kind = models.CharField(max_length=12, choices=ActorKind.choices)
    reason = models.CharField(max_length=255, blank=True)
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("ride", "at")
        constraints = [
            # Only the system acts without a user.
            models.CheckConstraint(
                condition=Q(actor_kind=ActorKind.SYSTEM) | Q(actor__isnull=False),
                name="rides_transition_actor_is_named",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.ride_id}:{self.from_state or '-'}->{self.to_state}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Ride transitions are append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        del args, kwargs
        raise ValueError("Ride transitions are append-only.")


class RideOffer(models.Model):
    """A ride offered to one captain in one dispatch round, with a server deadline."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"
        EXPIRED = "EXPIRED", "Expired"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ride = models.ForeignKey(Ride, on_delete=models.PROTECT, related_name="offers")
    captain = models.ForeignKey(
        "partners.PartnerProfile", on_delete=models.PROTECT, related_name="ride_offers"
    )
    round = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    pickup_distance_m = models.PositiveIntegerField()
    offered_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("ride", "round", "offered_at")
        constraints = [
            models.UniqueConstraint(fields=("ride", "captain"), name="rides_one_offer_per_captain"),
            models.UniqueConstraint(
                fields=("ride",),
                condition=Q(status="ACCEPTED"),
                name="rides_one_accepted_offer_per_ride",
            ),
            models.CheckConstraint(condition=Q(round__gte=1), name="rides_offer_round_from_one"),
            models.CheckConstraint(
                condition=Q(expires_at__gt=F("offered_at")), name="rides_offer_expires_after_offer"
            ),
        ]
        indexes = [
            models.Index(fields=("captain", "status"), name="rides_offer_captain_status"),
        ]

    def __str__(self) -> str:
        return f"{self.ride_id}:{self.captain_id}:{self.status}"


class RideTrackPoint(models.Model):
    """The captain's position during a ride, from assignment to the end of the trip.

    A beat task deletes points older than 90 days.
    """

    id = models.BigAutoField(primary_key=True)
    ride = models.ForeignKey(Ride, on_delete=models.CASCADE, related_name="track_points")
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    accuracy_m = models.PositiveIntegerField()
    captured_at = models.DateTimeField()

    class Meta:
        ordering = ("ride", "captured_at")
        constraints = [
            models.CheckConstraint(
                condition=Q(latitude__gte=-90, latitude__lte=90)
                & Q(longitude__gte=-180, longitude__lte=180),
                name="rides_track_point_in_range",
            ),
            models.CheckConstraint(
                condition=Q(accuracy_m__gt=0), name="rides_track_point_accuracy_positive"
            ),
        ]
        indexes = [models.Index(fields=("ride", "captured_at"), name="rides_track_ride_time")]

    def __str__(self) -> str:
        return f"{self.ride_id}@{self.captured_at:%H:%M:%S}"


class RideRating(models.Model):
    """Stars one side gave the other after a ride."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ride = models.ForeignKey(Ride, on_delete=models.PROTECT, related_name="ratings")
    rater_kind = models.CharField(
        max_length=12,
        choices=[(ActorKind.RIDER, "Rider"), (ActorKind.CAPTAIN, "Captain")],
    )
    stars = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("ride", "rater_kind"), name="rides_one_rating_per_side"
            ),
            models.CheckConstraint(
                condition=Q(stars__gte=1, stars__lte=5), name="rides_rating_one_to_five_stars"
            ),
            models.CheckConstraint(
                condition=Q(rater_kind__in=(ActorKind.RIDER, ActorKind.CAPTAIN)),
                name="rides_rating_by_rider_or_captain",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.ride_id}:{self.rater_kind}:{self.stars}"


class RideSosEvent(models.Model):
    """An SOS raised during a ride, until Operations resolves it."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ride = models.ForeignKey(Ride, on_delete=models.PROTECT, related_name="sos_events")
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ride_sos_raised"
    )
    #: Where the phone was, if it knew. An SOS is never refused for lack of a location.
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ride_sos_resolved",
    )
    resolution_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=Q(status="OPEN", resolved_at__isnull=True, resolved_by__isnull=True)
                | Q(status="RESOLVED", resolved_at__isnull=False, resolved_by__isnull=False),
                name="rides_sos_resolution_is_consistent",
            ),
            models.CheckConstraint(
                condition=Q(latitude__isnull=True, longitude__isnull=True)
                | Q(latitude__gte=-90, latitude__lte=90, longitude__gte=-180, longitude__lte=180),
                name="rides_sos_location_in_range",
            ),
        ]
        indexes = [models.Index(fields=("status", "-created_at"), name="rides_sos_status_recent")]

    def __str__(self) -> str:
        return f"{self.ride_id}:{self.status}"
