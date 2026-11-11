"""Rides commands: every state change is authorised and audited here, never in a view."""

import logging
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import IntegrityError, models, transaction
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.commerce.services.payments import initiate_standalone_payment_attempt
from apps.locations.geocoding import GeocodingError, reverse_geocode
from apps.locations.models import ServiceArea
from apps.locations.services import check_serviceability
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides import location, selectors
from apps.rides.exceptions import (
    AreaNotServedError,
    CaptainNotApprovedError,
    LocationStaleError,
    LocationUnavailableError,
    NotOnDutyError,
    PassAlreadyActiveError,
    PassPurchasePendingError,
    PassRequiredError,
    RateCardExistsError,
    RateCardInactiveError,
    RegistrationAlreadyUsedError,
    RoutingUnavailableApiError,
)
from apps.rides.fares import trip_fare_paise
from apps.rides.models import (
    OPEN_RIDE_STATES,
    RATE_FIELDS,
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    CaptainVehicle,
    FareQuote,
    Ride,
    RideRateCard,
    RideState,
    RideTrackPoint,
    VehicleType,
    normalise_registration_number,
)
from apps.rides.routing import RoutingUnavailableError, get_route

__all__ = [
    "VEHICLE_EDITABLE_STATUSES",
    "LocationPing",
    "TripPoint",
    "available_vehicle_types",
    "buy_pass",
    "complete_pass_payment",
    "create_quotes",
    "create_rate_card",
    "expire_passes",
    "record_location",
    "save_captain_vehicle",
    "start_duty",
    "stop_duty",
    "sweep_stale_captains",
    "update_rate_card",
]

logger = logging.getLogger(__name__)

#: A captain can change the vehicle only while the application is still theirs to edit. Once it is
#: submitted the reviewer is looking at documents for that vehicle, and an approved captain who
#: could swap it would bypass the review. Operations changes it after that.
VEHICLE_EDITABLE_STATUSES = (
    PartnerApplication.Status.DRAFT,
    PartnerApplication.Status.CHANGES_REQUIRED,
)


def _plate_taken_by_another(*, partner: PartnerProfile, registration_number: str) -> bool:
    return (
        CaptainVehicle.objects.filter(registration_number=registration_number)
        .exclude(partner=partner)
        .exists()
    )


def save_captain_vehicle(
    *,
    partner: PartnerProfile,
    vehicle_type: str,
    registration_number: str,
    make_model: str,
    colour: str,
) -> CaptainVehicle:
    """Create or replace the partner's vehicle. Repeating the same call changes nothing."""
    application = PartnerApplication.objects.filter(
        partner=partner, track=PartnerApplication.Track.RIDE_CAPTAIN
    ).first()
    if application is None or application.status not in VEHICLE_EDITABLE_STATUSES:
        raise CaptainNotApprovedError

    plate = normalise_registration_number(registration_number)
    # A friendly early answer. The unique constraint below is what actually decides a race.
    if _plate_taken_by_another(partner=partner, registration_number=plate):
        raise RegistrationAlreadyUsedError

    try:
        with transaction.atomic():
            vehicle, created = CaptainVehicle.objects.update_or_create(
                partner=partner,
                defaults={
                    "vehicle_type": vehicle_type,
                    "registration_number": plate,
                    "make_model": make_model,
                    "colour": colour,
                },
            )
    except IntegrityError as exc:
        # Only a plate lost in a race is a duplicate. Anything else is a real fault, so it surfaces.
        if _plate_taken_by_another(partner=partner, registration_number=plate):
            raise RegistrationAlreadyUsedError from exc
        raise

    logger.info(
        "ride_captain_vehicle_saved",
        # Not "created": that name is reserved on LogRecord and logging raises KeyError for it.
        extra={
            "partner_id": str(partner.id),
            "vehicle_type": vehicle_type,
            "vehicle_created": created,
        },
    )
    return vehicle


# --- Fare quotes ------------------------------------------------------------------------------

#: The order the rider sees: cheapest kind of vehicle first.
_VEHICLE_ORDER = {VehicleType.BIKE: 0, VehicleType.AUTO: 1, VehicleType.CAB: 2}


@dataclass(frozen=True, slots=True)
class TripPoint:
    latitude: Decimal
    longitude: Decimal
    label: str

    @property
    def point(self) -> tuple[Decimal, Decimal]:
        return (self.latitude, self.longitude)


def _pickup_area(pickup: TripPoint) -> ServiceArea:
    """The service area the pickup is in, found from its postal code.

    Only the pickup has to be served: the drop can be anywhere a road goes.
    """
    try:
        address = reverse_geocode(latitude=pickup.latitude, longitude=pickup.longitude)
    except GeocodingError as exc:
        # We cannot tell where the rider is, so we cannot price the trip honestly.
        raise RoutingUnavailableApiError from exc
    if not address.postal_code:
        raise AreaNotServedError
    decision = check_serviceability(postal_code=address.postal_code)
    if not decision.is_serviceable or decision.service_area is None:
        raise AreaNotServedError
    return decision.service_area


def available_vehicle_types(*, latitude: Decimal, longitude: Decimal) -> list[str]:
    """Which vehicle types can be booked from here, cheapest first. Empty when none can.

    Drives the Rides entry on the customer Home screen (brief §5.11), so "not served here" is an
    empty answer, not an error. A geocoder failure still raises: the app hides the entry then.
    """
    try:
        area = _pickup_area(TripPoint(latitude, longitude, ""))
    except AreaNotServedError:
        return []
    types = RideRateCard.objects.filter(service_area=area, is_active=True).values_list(
        "vehicle_type", flat=True
    )
    return sorted(types, key=lambda vehicle: _VEHICLE_ORDER[VehicleType(vehicle)])


def create_quotes(*, rider: Any, pickup: TripPoint, drop: TripPoint) -> list[FareQuote]:
    """One quote per bookable vehicle type, priced on the server from the road route.

    A vehicle type is bookable only while its area has an active rate card. If any route cannot be
    had, no quote is made: a partial list would hide a vehicle the rider could have booked.
    """
    area = _pickup_area(pickup)
    cards = sorted(
        RideRateCard.objects.filter(service_area=area, is_active=True),
        key=lambda card: _VEHICLE_ORDER[VehicleType(card.vehicle_type)],
    )
    if not cards:
        raise AreaNotServedError

    expires_at = timezone.now() + timedelta(seconds=settings.RIDES_QUOTE_TTL_SECONDS)
    quotes: list[FareQuote] = []
    for card in cards:
        try:
            route = get_route(pickup=pickup.point, drop=drop.point, vehicle_type=card.vehicle_type)
        except RoutingUnavailableError as exc:
            raise RoutingUnavailableApiError from exc
        quotes.append(
            FareQuote(
                rider=rider,
                service_area=area,
                vehicle_type=card.vehicle_type,
                rate_card=card,
                rate_card_version=card.version,
                pickup_latitude=pickup.latitude,
                pickup_longitude=pickup.longitude,
                pickup_label=pickup.label,
                drop_latitude=drop.latitude,
                drop_longitude=drop.longitude,
                drop_label=drop.label,
                distance_m=route.distance_m,
                duration_s=route.duration_s,
                route_polyline=route.encoded_polyline,
                fare_paise=trip_fare_paise(
                    card, distance_m=route.distance_m, duration_s=route.duration_s
                ),
                expires_at=expires_at,
            )
        )

    created = FareQuote.objects.bulk_create(quotes)
    # No coordinates or labels in the log: they are the rider's exact whereabouts.
    logger.info(
        "ride_quotes_created",
        extra={
            "rider_id": str(rider.pk),
            "service_area_id": str(area.id),
            "quote_count": len(created),
        },
    )
    return created


# --- Daily Pass (brief §5.8; the Stay subscription pattern) -----------------------------------

#: A pending pass whose payment can still succeed. A retry returns it instead of charging again.
_LIVE_PAYMENT_STATUSES = (
    PaymentAttempt.Status.CREATED,
    PaymentAttempt.Status.PROVIDER_PENDING,
    PaymentAttempt.Status.AUTHORIZED,
)


def _purchase_window() -> timedelta:
    """A pending purchase older than this stops blocking a new one (brief §5.8, Revision 2)."""
    return timedelta(minutes=int(settings.RIDES_PASS_PURCHASE_WINDOW_MINUTES))


def _lock_partner(partner: PartnerProfile) -> None:
    """Serialise a captain's pass and duty commands, so two taps cannot both pass a check."""
    PartnerProfile.objects.select_for_update().filter(pk=partner.pk).first()


def _expire_lapsed_passes(*, partner_id: Any, now: Any) -> None:
    CaptainPass.objects.filter(
        partner_id=partner_id, status=CaptainPass.Status.ACTIVE, ends_at__lte=now
    ).update(status=CaptainPass.Status.EXPIRED, updated_at=now)


def _activate(captain_pass: CaptainPass, *, starts_at: Any) -> None:
    captain_pass.status = CaptainPass.Status.ACTIVE
    captain_pass.starts_at = starts_at
    captain_pass.ends_at = starts_at + timedelta(hours=captain_pass.plan.duration_hours)
    captain_pass.save(update_fields=("status", "starts_at", "ends_at", "updated_at"))


@transaction.atomic
def buy_pass(
    *, partner: PartnerProfile, plan: CaptainPassPlan, idempotency_key: str
) -> CaptainPass:
    """Start buying a pass. A ₹0 plan is active at once; a paid plan waits for its payment.

    Refused while the captain has an active pass. Only one purchase is in flight at a time:
    buying the same plan again returns the pending purchase, and any other plan is refused until
    that payment settles or is 30 minutes old.
    """
    _lock_partner(partner)
    # A pass is only worth buying to drive: never take money from a partner who cannot.
    if not PartnerApplication.objects.filter(
        partner=partner,
        track=PartnerApplication.Track.RIDE_CAPTAIN,
        status=PartnerApplication.Status.APPROVED,
    ).exists():
        raise CaptainNotApprovedError(
            "You can buy a pass once your captain application is approved."
        )
    now = timezone.now()
    _expire_lapsed_passes(partner_id=partner.id, now=now)
    # A queued pass is a paid pass waiting its turn. One in line is the most we can hold, so a
    # second paid one would be captured with nowhere to go.
    if (
        selectors.active_pass(partner, now=now) is not None
        or selectors.queued_pass(partner) is not None
    ):
        raise PassAlreadyActiveError

    in_flight = CaptainPass.objects.filter(
        partner=partner,
        status=CaptainPass.Status.PENDING_ACTIVATION,
        payment_attempt__status__in=_LIVE_PAYMENT_STATUSES,
        created_at__gt=now - _purchase_window(),
    )
    same_plan = in_flight.filter(plan=plan).first()
    if same_plan is not None:
        return same_plan
    if in_flight.exists():
        raise PassPurchasePendingError

    if plan.price_paise == 0:
        captain_pass = CaptainPass.objects.create(partner=partner, plan=plan)
        _activate(captain_pass, starts_at=now)
        logger.info(
            "ride_pass_activated",
            extra={"partner_id": str(partner.id), "plan": plan.code, "paid": False},
        )
        return captain_pass

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.RIDE_CAPTAIN_PASS,
        amount_paise=plan.price_paise,
        idempotency_key=f"ride-pass:{partner.id}:{idempotency_key}",
    )
    return CaptainPass.objects.create(partner=partner, plan=plan, payment_attempt=attempt)


@transaction.atomic
def complete_pass_payment(*, payment_attempt_id: Any) -> None:
    """Commerce calls this when a pass payment is captured. Running it twice changes nothing.

    A paid pass never shortens one that is running: if the captain already has an active pass
    (a free one taken while this payment was slow), the new one is QUEUED and starts the moment
    the active one ends.
    """
    captain_pass = (
        CaptainPass.objects.select_for_update()
        .select_related("plan")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if captain_pass is None or captain_pass.status != CaptainPass.Status.PENDING_ACTIVATION:
        return
    PartnerProfile.objects.select_for_update().filter(pk=captain_pass.partner_id).first()
    now = timezone.now()
    _expire_lapsed_passes(partner_id=captain_pass.partner_id, now=now)
    log = {"partner_id": str(captain_pass.partner_id), "plan": captain_pass.plan.code}

    holding = CaptainPass.objects.filter(
        partner_id=captain_pass.partner_id,
        status__in=(CaptainPass.Status.ACTIVE, CaptainPass.Status.QUEUED),
    ).values_list("status", flat=True)
    if CaptainPass.Status.QUEUED in holding:
        # Two late payments for one captain: only one pass can wait in line. The money is
        # captured, so Operations must settle it by hand; never drop it silently.
        logger.error("ride_pass_payment_needs_review", extra=log)
        return
    if CaptainPass.Status.ACTIVE in holding:
        captain_pass.status = CaptainPass.Status.QUEUED
        captain_pass.save(update_fields=("status", "updated_at"))
        logger.info("ride_pass_queued", extra=log)
        return
    _activate(captain_pass, starts_at=now)
    logger.info("ride_pass_activated", extra={**log, "paid": True})


@transaction.atomic
def expire_passes() -> int:
    """Run every minute. Ends lapsed passes, starts queued ones, then ends duty without a pass.

    A queued pass starts exactly when the one before it ended, so no paid time is lost even if
    this task runs late. A captain on an open ride stays on duty until the ride ends; the next run
    after that takes them off (brief §5.8: a ride already in progress finishes).
    """
    now = timezone.now()
    lapsed = CaptainPass.objects.select_for_update().filter(
        status=CaptainPass.Status.ACTIVE, ends_at__lte=now
    )
    ended_at = dict(lapsed.values_list("partner_id", "ends_at"))
    expired = lapsed.update(status=CaptainPass.Status.EXPIRED, updated_at=now)

    still_active = CaptainPass.objects.filter(
        partner_id=models.OuterRef("partner_id"), status=CaptainPass.Status.ACTIVE
    )
    waiting = (
        CaptainPass.objects.select_for_update()
        .select_related("plan")
        .filter(status=CaptainPass.Status.QUEUED)
        .exclude(models.Exists(still_active))
    )
    started = 0
    for queued in waiting:
        _activate(queued, starts_at=ended_at.get(queued.partner_id, now))
        started += 1

    has_pass = CaptainPass.objects.filter(
        partner_id=models.OuterRef("partner_id"),
        status=CaptainPass.Status.ACTIVE,
        ends_at__gt=now,
    )
    on_a_ride = Ride.objects.filter(
        captain_id=models.OuterRef("partner_id"), state__in=OPEN_RIDE_STATES
    )
    ended = _end_duty(
        CaptainDutySession.objects.filter(ended_at__isnull=True)
        .exclude(models.Exists(has_pass))
        .exclude(models.Exists(on_a_ride)),
        reason=CaptainDutySession.EndReason.PASS_EXPIRED,
        now=now,
    )
    if expired or started or ended:
        logger.info(
            "ride_passes_expired",
            extra={"passes_expired": expired, "queued_started": started, "duty_ended": ended},
        )
    return expired


# --- Duty -------------------------------------------------------------------------------------


def _end_duty(sessions: Any, *, reason: str, now: Any) -> int:
    """Close these open sessions, then take those captains off the live map once committed.

    The map is only a cache: if Redis is down the cleanup is logged and skipped, and the
    captain's position expires there on its own within 30 seconds.
    """
    partner_ids = list(sessions.values_list("partner_id", flat=True))
    if not partner_ids:
        return 0
    closed = CaptainDutySession.objects.filter(
        partner_id__in=partner_ids, ended_at__isnull=True
    ).update(ended_at=now, end_reason=reason)

    def clear_map() -> None:
        for partner_id in partner_ids:
            try:
                location.forget(partner_id)
            except location.LocationStoreError:
                logger.warning("ride_location_forget_failed", extra={"partner_id": str(partner_id)})

    transaction.on_commit(clear_map)
    return int(closed)


_NOT_APPROVED_MESSAGES = {
    "suspended": "Your captain account is suspended. Contact support.",
    "not_approved": "You can go on duty once your captain application is approved.",
    "vehicle_missing": "Add your vehicle details before going on duty.",
}


def require_can_drive(partner: PartnerProfile) -> None:
    """Approved, not suspended, with a vehicle and an active pass; else the honest refusal."""
    for reason in selectors.captain_status(partner).blocked_reasons:
        if reason == "pass_required":
            raise PassRequiredError
        raise CaptainNotApprovedError(_NOT_APPROVED_MESSAGES[reason])


@transaction.atomic
def start_duty(*, partner: PartnerProfile) -> CaptainDutySession:
    """Go on duty, if every gate passes. Already on duty: the open session is returned."""
    _lock_partner(partner)
    existing = selectors.open_duty_session(partner)
    if existing is not None:
        return existing

    require_can_drive(partner)

    session = CaptainDutySession.objects.create(partner=partner)
    logger.info("ride_duty_started", extra={"partner_id": str(partner.id)})
    return session


@transaction.atomic
def stop_duty(*, partner: PartnerProfile) -> None:
    """Go off duty. Allowed during a ride: the ride goes on, only new requests stop."""
    _lock_partner(partner)
    closed = _end_duty(
        CaptainDutySession.objects.filter(partner=partner, ended_at__isnull=True),
        reason=CaptainDutySession.EndReason.CAPTAIN_OFF,
        now=timezone.now(),
    )
    if closed:
        logger.info("ride_duty_stopped", extra={"partner_id": str(partner.id)})


# --- Live location (brief §5.6) ---------------------------------------------------------------

#: A ping this far in the future means a wrong phone clock (too old: RIDES_PING_MAX_AGE_SECONDS).
PING_MAX_AHEAD = timedelta(seconds=5)

#: Ride states in which each ping also becomes a point on the ride's GPS trail.
_TRACKED_STATES = (RideState.CAPTAIN_ASSIGNED, RideState.CAPTAIN_ARRIVED, RideState.IN_TRIP)


@dataclass(frozen=True, slots=True)
class LocationPing:
    latitude: Decimal
    longitude: Decimal
    accuracy_m: int
    heading: float | None
    captured_at: Any


#: Returned when the geocoder fails: keep whatever listing the captain already has.
AREA_UNKNOWN = "?"


def _captain_area_id(partner: PartnerProfile, ping: LocationPing) -> str | None:
    """The served area the captain is in, re-checked from the pincode every 10 minutes.

    If the geocoder fails, AREA_UNKNOWN says to keep the last known membership rather than
    guess, and nothing is cached, so the next ping tries again.
    """
    known, area_id = location.cached_area(partner.id)
    if known:
        return area_id
    try:
        address = reverse_geocode(latitude=ping.latitude, longitude=ping.longitude)
    except GeocodingError:
        logger.warning("ride_captain_area_unknown", extra={"partner_id": str(partner.id)})
        return AREA_UNKNOWN
    decision = (
        check_serviceability(postal_code=address.postal_code) if address.postal_code else None
    )
    area = decision.service_area if decision and decision.is_serviceable else None
    location.remember_area(partner.id, area.id if area else None)
    return str(area.id) if area else None


def record_location(*, partner: PartnerProfile, ping: LocationPing) -> None:
    """Take one GPS ping from a captain on duty.

    The captain is listed for matching only while they could take a ride now: approved, with a
    vehicle and an active pass, in a served area and not on a ride. During a ride the ping is
    written to the ride's track instead.
    """
    now = timezone.now()
    if ping.captured_at < now - timedelta(seconds=int(settings.RIDES_PING_MAX_AGE_SECONDS)):
        raise LocationStaleError
    if ping.captured_at > now + PING_MAX_AHEAD:
        raise LocationStaleError("Your phone's clock looks wrong. Set it to automatic time.")
    ride = Ride.objects.filter(captain=partner, state__in=OPEN_RIDE_STATES).first()
    # A ride in progress keeps its captain tracked even off duty: the pickup check and the
    # rider's map need the position. Off duty with no ride, the phone should stop sending.
    if ride is None and selectors.open_duty_session(partner) is None:
        raise NotOnDutyError
    listed_in: str | None = None
    keep_listing = False
    if ride is not None and ride.state in _TRACKED_STATES:
        RideTrackPoint.objects.create(
            ride=ride,
            latitude=ping.latitude,
            longitude=ping.longitude,
            accuracy_m=ping.accuracy_m,
            captured_at=ping.captured_at,
        )
    # Every Redis touch below (the cached area, then the position) fails the same honest way.
    try:
        if ride is None and not selectors.captain_status(partner).blocked_reasons:
            vehicle = CaptainVehicle.objects.get(partner=partner)
            area_id = _captain_area_id(partner, ping)
            if area_id == AREA_UNKNOWN:
                keep_listing = True
            elif area_id is not None:
                listed_in = location.geo_key(area_id, vehicle.vehicle_type)
        location.record_position(
            partner_id=partner.id,
            latitude=float(ping.latitude),
            longitude=float(ping.longitude),
            accuracy_m=ping.accuracy_m,
            heading=ping.heading,
            captured_at=ping.captured_at.isoformat(),
            listed_in=listed_in,
            keep_listing=keep_listing,
        )
    except location.LocationStoreError as exc:
        raise LocationUnavailableError from exc


def sweep_stale_captains() -> int:
    """Run every minute. Ends duty after 2 minutes without a ping, and tidies the live map.

    If Redis cannot be read, nobody is taken off duty: a missing ping record would then mean
    "Redis is down", not "the phone went quiet".
    """
    try:
        location.sweep_stale_members()
        cutoff = timezone.now() - timedelta(seconds=location.STALE_AFTER_SECONDS)
        on_a_ride = Ride.objects.filter(
            captain_id=models.OuterRef("partner_id"), state__in=OPEN_RIDE_STATES
        )
        # A captain on a ride stays on duty until it ends, as with an expired pass (brief §5.8).
        candidates = list(
            CaptainDutySession.objects.filter(ended_at__isnull=True, started_at__lte=cutoff)
            .exclude(models.Exists(on_a_ride))
            .values_list("partner_id", flat=True)
        )
        recent = location.have_recent_pings(candidates)
        silent = [pid for pid, pinged in zip(candidates, recent, strict=True) if not pinged]
    except location.LocationStoreError:
        logger.warning("ride_location_sweep_skipped")
        return 0
    with transaction.atomic():
        ended = _end_duty(
            CaptainDutySession.objects.filter(partner_id__in=silent, ended_at__isnull=True),
            reason=CaptainDutySession.EndReason.LOCATION_STALE,
            now=timezone.now(),
        )
    if ended:
        logger.info("ride_duty_ended_stale", extra={"duty_ended": ended})
    return ended


# --- Operations: rate cards and pass plans ----------------------------------------------------


@transaction.atomic
def create_rate_card(
    *, created_by: Any, service_area: ServiceArea, vehicle_type: str, rates: dict[str, int]
) -> RideRateCard:
    """A first (or renewed) price for a vehicle in an area. Refused while one is active."""
    if RideRateCard.objects.filter(
        service_area=service_area, vehicle_type=vehicle_type, is_active=True
    ).exists():
        raise RateCardExistsError
    last = (
        RideRateCard.objects.filter(service_area=service_area, vehicle_type=vehicle_type)
        .order_by("-version")
        .first()
    )
    try:
        with transaction.atomic():
            card = RideRateCard.objects.create(
                service_area=service_area,
                vehicle_type=vehicle_type,
                version=(last.version + 1) if last else 1,
                created_by=created_by,
                **rates,
            )
    except IntegrityError as exc:
        # Two people created the same card at once; the database let exactly one through.
        raise RateCardExistsError from exc
    logger.info("ride_rate_card_created", extra=_card_log(card, created_by))
    return card


@transaction.atomic
def update_rate_card(
    *, card: RideRateCard, updated_by: Any, rates: dict[str, int], deactivate: bool
) -> RideRateCard:
    """Edit the active card. A price edit is a new version; old quotes keep the old one.

    `deactivate` switches that vehicle off in that area (the only on/off switch).
    """
    card = RideRateCard.objects.select_for_update().get(pk=card.pk)
    if not card.is_active:
        raise RateCardInactiveError
    card.is_active = False
    card.save(update_fields=("is_active", "updated_at"))
    if deactivate:
        logger.info("ride_rate_card_deactivated", extra=_card_log(card, updated_by))
        return card

    fields = {name: getattr(card, name) for name in RATE_FIELDS}
    fields.update(rates)
    new_card = RideRateCard.objects.create(
        service_area_id=card.service_area_id,
        vehicle_type=card.vehicle_type,
        version=card.version + 1,
        created_by=updated_by,
        **fields,
    )
    logger.info("ride_rate_card_versioned", extra=_card_log(new_card, updated_by))
    return new_card


def _card_log(card: RideRateCard, user: Any) -> dict[str, str]:
    return {
        "rate_card_id": str(card.id),
        "service_area_id": str(card.service_area_id),
        "vehicle_type": card.vehicle_type,
        "version": str(card.version),
        "actor_id": str(getattr(user, "pk", "")),
    }
