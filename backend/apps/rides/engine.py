"""The ride engine (brief §5.4, §5.6): booking, finding a captain, and the trip steps.

Every state change happens here, inside a transaction that locks the ride, and writes one
`RideTransition`. Dispatch runs in Celery and is delivered at least once, so every step re-reads
the ride first and does nothing if someone else already moved it on.
"""

import hashlib
import hmac
import logging
import math
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, models, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.foundation.services import enqueue_outbox_event
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides import location, notify, selectors
from apps.rides.exceptions import (
    InvalidTransitionError,
    LocationUnavailableError,
    NotAtPickupError,
    NotOnDutyError,
    QuoteExpiredError,
    QuoteUsedError,
    RideAlreadyOpenError,
    RideNoLongerAvailableError,
    VehicleUnavailableError,
)
from apps.rides.fares import waiting_charge_paise
from apps.rides.models import (
    OPEN_RIDE_STATES,
    ActorKind,
    CaptainDutySession,
    CaptainPass,
    CaptainVehicle,
    FareQuote,
    Ride,
    RideOffer,
    RideRateCard,
    RideRating,
    RideSosEvent,
    RideState,
    RideTransition,
)
from apps.rides.services import require_can_drive

__all__ = [
    "CAPTAIN_CANCEL_REASONS",
    "OTP_INVALID",
    "OTP_LOCKED",
    "OTP_MAX_ATTEMPTS",
    "OTP_VISIBLE_STATES",
    "RIDER_CANCEL_REASONS",
    "RIDE_REQUESTED",
    "accept_offer",
    "captain_cancel",
    "captain_current_ride",
    "complete_trip",
    "create_ride",
    "current_offer",
    "decline_offer",
    "mark_arrived",
    "mark_payment_received",
    "operations_cancel",
    "otp_fingerprint",
    "raise_sos",
    "rate_ride",
    "redrive_dispatch",
    "resolve_sos",
    "ride_otp",
    "rider_cancel",
    "run_dispatch_round",
    "searching_again",
    "start_trip",
]

logger = logging.getLogger(__name__)

#: Outbox event written when a ride is booked; its handler starts round 1.
RIDE_REQUESTED = "rides.ride_requested"


def _transition(
    ride: Ride,
    to_state: str,
    *,
    actor: Any,
    actor_kind: str,
    now: datetime,
    reason: str = "",
    first: bool = False,
) -> None:
    """Record the move and set the new state. The caller saves the ride.

    `first` marks the ride's opening row, which has no state to come from.
    """
    RideTransition.objects.create(
        ride=ride,
        from_state="" if first else ride.state,
        to_state=to_state,
        actor=actor,
        actor_kind=actor_kind,
        reason=reason,
        at=now,
    )
    ride.state = to_state


# --- Booking ----------------------------------------------------------------------------------


@transaction.atomic
def create_ride(*, rider: Any, quote_id: UUID) -> Ride:
    """Book a ride from the rider's own quote and start looking for a captain."""
    quote = (
        FareQuote.objects.select_for_update()
        .select_related("service_area")
        .filter(id=quote_id, rider=rider)
        .first()
    )
    if quote is None:
        raise NotFound("We couldn't find this price. Check the fares again.")
    if quote.consumed_at is not None:
        raise QuoteUsedError
    now = timezone.now()
    if quote.expires_at <= now:
        raise QuoteExpiredError
    vehicle_on_sale = RideRateCard.objects.filter(
        service_area=quote.service_area, vehicle_type=quote.vehicle_type, is_active=True
    ).exists()
    if not quote.service_area.is_active or not vehicle_on_sale:
        raise VehicleUnavailableError
    if Ride.objects.filter(rider=rider, state__in=OPEN_RIDE_STATES).exists():
        raise RideAlreadyOpenError

    ride = Ride(
        rider=rider,
        quote=quote,
        service_area=quote.service_area,
        vehicle_type=quote.vehicle_type,
        pickup_latitude=quote.pickup_latitude,
        pickup_longitude=quote.pickup_longitude,
        pickup_label=quote.pickup_label,
        drop_latitude=quote.drop_latitude,
        drop_longitude=quote.drop_longitude,
        drop_label=quote.drop_label,
        fare_paise=quote.fare_paise,
    )
    try:
        with transaction.atomic():
            ride.save()
    except IntegrityError as exc:
        # Two bookings raced; the one-open-ride-per-rider rule let exactly one through.
        raise RideAlreadyOpenError from exc
    _transition(
        ride, RideState.SEARCHING, actor=rider, actor_kind=ActorKind.RIDER, now=now, first=True
    )

    quote.consumed_at = now
    quote.save(update_fields=("consumed_at",))
    enqueue_outbox_event(
        aggregate_type="ride",
        aggregate_id=ride.id,
        event_type=RIDE_REQUESTED,
        idempotency_key=str(ride.id),
        payload={"ride_id": str(ride.id)},
    )
    logger.info(
        "ride_created",
        extra={
            "ride_id": str(ride.id),
            "rider_id": str(rider.pk),
            "service_area_id": str(ride.service_area_id),
            "vehicle_type": ride.vehicle_type,
        },
    )
    return ride


# --- Dispatch ---------------------------------------------------------------------------------


def _search_started_at(ride: Ride) -> datetime:
    """When the current search began: booking, or the last time a captain cancelled."""
    started = (
        RideTransition.objects.filter(ride=ride, to_state=RideState.SEARCHING)
        .order_by("-at")
        .values_list("at", flat=True)
        .first()
    )
    return started or ride.created_at


def _eligible_captains(ride: Ride, *, candidate_ids: list[str], now: datetime) -> set[UUID]:
    """Which of these nearby captains may get this ride now, locked so no other round takes them.

    Locked rows another dispatch is holding are skipped: that captain is about to get an offer.
    A captain is offered a ride once per search; after a captain cancels, a new search may offer
    it again to the others, but never to a captain who cancelled it.
    """
    cancelled_by = RideTransition.objects.filter(
        ride=ride, actor_kind=ActorKind.CAPTAIN, to_state=RideState.SEARCHING
    ).values("actor_id")
    partner = models.OuterRef("pk")
    eligible = (
        PartnerProfile.objects.select_for_update(skip_locked=True)
        .filter(id__in=candidate_ids)
        .exclude(user_id=ride.rider_id)
        .filter(
            models.Exists(
                CaptainDutySession.objects.filter(partner=partner, ended_at__isnull=True)
            ),
            models.Exists(
                CaptainPass.objects.filter(
                    partner=partner, status=CaptainPass.Status.ACTIVE, ends_at__gt=now
                )
            ),
            models.Exists(
                PartnerApplication.objects.filter(
                    partner=partner,
                    track=PartnerApplication.Track.RIDE_CAPTAIN,
                    status=PartnerApplication.Status.APPROVED,
                )
            ),
            models.Exists(
                CaptainVehicle.objects.filter(partner=partner, vehicle_type=ride.vehicle_type)
            ),
        )
        .exclude(models.Exists(Ride.objects.filter(captain=partner, state__in=OPEN_RIDE_STATES)))
        .exclude(
            models.Exists(
                RideOffer.objects.filter(
                    captain=partner, status=RideOffer.Status.PENDING, expires_at__gt=now
                )
            )
        )
        .exclude(
            models.Exists(
                RideOffer.objects.filter(
                    captain=partner, ride=ride, offered_at__gte=_search_started_at(ride)
                )
            )
        )
        .exclude(user_id__in=cancelled_by)
    )
    return set(eligible.values_list("id", flat=True))


def _offer_round(ride: Ride, *, round_no: int, now: datetime) -> list[RideOffer]:
    """Offer the ride to the nearest eligible captains within this round's radius."""
    nearby = location.nearby(
        key=location.geo_key(ride.service_area_id, ride.vehicle_type),
        latitude=float(ride.pickup_latitude),
        longitude=float(ride.pickup_longitude),
        radius_m=settings.RIDES_DISPATCH_RADII_M[round_no - 1],
    )
    if not nearby:
        return []
    eligible = _eligible_captains(ride, candidate_ids=[pid for pid, _ in nearby], now=now)
    chosen = [(UUID(pid), metres) for pid, metres in nearby if UUID(pid) in eligible]
    chosen = chosen[: settings.RIDES_OFFERS_PER_ROUND]
    expires_at = now + timedelta(seconds=settings.RIDES_OFFER_SECONDS)
    earlier = {
        offer.captain_id: offer
        for offer in RideOffer.objects.filter(ride=ride, captain_id__in=[c for c, _ in chosen])
    }
    offers: list[RideOffer] = []
    for captain_id, metres in chosen:
        offer = earlier.get(captain_id) or RideOffer(ride=ride, captain_id=captain_id)
        offer.round = round_no
        offer.status = RideOffer.Status.PENDING
        offer.pickup_distance_m = metres
        offer.offered_at = now
        offer.expires_at = expires_at
        offer.responded_at = None
        offer.save()
        notify.new_offer(offer, ride)
        offers.append(offer)
    return offers


def _schedule_round(ride_id: UUID, round_no: int, *, countdown: int | None = None) -> None:
    """Run round `round_no` once this transaction commits: when the offers expire, or sooner."""
    from apps.rides.tasks import dispatch_round  # noqa: PLC0415 - tasks imports this module

    wait = settings.RIDES_OFFER_SECONDS if countdown is None else countdown

    def send() -> None:
        try:
            dispatch_round.apply_async(args=[str(ride_id), round_no], countdown=wait)
        except Exception:
            # The broker is down. The ride stays SEARCHING and the 30 s sweep moves it on.
            logger.exception("ride_dispatch_schedule_failed", extra={"ride_id": str(ride_id)})

    transaction.on_commit(send)


def run_dispatch_round(*, ride_id: UUID, round_no: int) -> None:
    """Run dispatch round `round_no` for a ride. Safe to call twice, late, or out of order.

    Nothing happens unless the ride is still searching, the previous round was the last one run,
    and none of its offers is still waiting for an answer. A round with nobody to offer moves
    straight to the next; after the last round the ride ends as NO_CAPTAIN_FOUND.
    """
    with transaction.atomic():
        ride = Ride.objects.select_for_update().filter(id=ride_id).first()
        if ride is None or ride.state != RideState.SEARCHING:
            return
        if ride.dispatch_round != round_no - 1:
            return
        now = timezone.now()
        if ride.offers.filter(status=RideOffer.Status.PENDING, expires_at__gt=now).exists():
            return
        ride.offers.filter(status=RideOffer.Status.PENDING).update(status=RideOffer.Status.EXPIRED)

        last_round = len(settings.RIDES_DISPATCH_RADII_M)
        for number in range(round_no, last_round + 1):
            try:
                offers = _offer_round(ride, round_no=number, now=now)
            except location.LocationStoreError:
                # Redis is down: keep the progress so far and let the sweep retry this round.
                logger.warning("ride_dispatch_round_skipped", extra={"ride_id": str(ride.id)})
                ride.save(update_fields=("dispatch_round", "updated_at"))
                return
            ride.dispatch_round = number
            if offers:
                ride.save(update_fields=("dispatch_round", "updated_at"))
                _schedule_round(ride.id, number + 1)
                logger.info(
                    "ride_offers_sent",
                    extra={"ride_id": str(ride.id), "round": number, "offers": len(offers)},
                )
                return

        ride.no_captain_found_at = now
        _transition(
            ride, RideState.NO_CAPTAIN_FOUND, actor=None, actor_kind=ActorKind.SYSTEM, now=now
        )
        ride.save(update_fields=("state", "dispatch_round", "no_captain_found_at", "updated_at"))
        notify.no_captain_found(ride)
        logger.info("ride_no_captain_found", extra={"ride_id": str(ride.id)})


#: At most this many stuck rides are moved on per sweep; the next sweep takes the rest.
_REDRIVE_BATCH = 100


def redrive_dispatch() -> int:
    """Every 30 s: move on any searching ride whose round has ended (ADR-0006 recovery).

    This covers a lost Celery message, a broker outage and a Redis outage alike.
    """
    now = timezone.now()
    waiting = RideOffer.objects.filter(
        ride=models.OuterRef("pk"), status=RideOffer.Status.PENDING, expires_at__gt=now
    )
    stuck = list(
        Ride.objects.filter(state=RideState.SEARCHING)
        .exclude(models.Exists(waiting))
        .order_by("created_at")
        .values_list("id", "dispatch_round")[:_REDRIVE_BATCH]
    )
    for ride_id, dispatch_round in stuck:
        run_dispatch_round(ride_id=ride_id, round_no=dispatch_round + 1)
    if stuck:
        logger.info("ride_dispatch_redriven", extra={"rides": len(stuck)})
    return len(stuck)


# --- Offers -----------------------------------------------------------------------------------


def current_offer(partner: PartnerProfile) -> RideOffer | None:
    """The offer to show the captain now: unanswered, in time, on a ride still searching."""
    return (
        RideOffer.objects.select_related("ride__quote")
        .filter(
            captain=partner,
            status=RideOffer.Status.PENDING,
            expires_at__gt=timezone.now(),
            ride__state=RideState.SEARCHING,
        )
        .order_by("-offered_at")
        .first()
    )


@transaction.atomic
def accept_offer(*, partner: PartnerProfile, offer_id: UUID) -> Ride:
    """The captain takes the ride. The first accept wins; every other offer is withdrawn.

    The ride row is locked first, so two captains accepting at once are served one after the
    other, and the second finds the ride already taken. Accepting the same offer again returns
    the ride.
    """
    ride_id = (
        RideOffer.objects.filter(id=offer_id, captain=partner).values_list("ride_id", flat=True)
    ).first()
    if ride_id is None:
        raise NotFound("We couldn't find this ride request.")
    ride = Ride.objects.select_for_update().get(pk=ride_id)
    offer = RideOffer.objects.select_for_update().get(pk=offer_id)
    if offer.status == RideOffer.Status.ACCEPTED and ride.captain_id == partner.id:
        return ride

    now = timezone.now()
    live = offer.status == RideOffer.Status.PENDING and offer.expires_at > now
    if ride.state != RideState.SEARCHING or not live:
        raise RideNoLongerAvailableError
    if selectors.open_duty_session(partner) is None:
        raise NotOnDutyError
    # Suspended, or the pass ran out, while the offer was on screen: the same gate as duty.
    require_can_drive(partner)

    offer.status = RideOffer.Status.ACCEPTED
    offer.responded_at = now
    offer.save(update_fields=("status", "responded_at"))
    ride.offers.filter(status=RideOffer.Status.PENDING).update(
        status=RideOffer.Status.WITHDRAWN, responded_at=now
    )
    ride.captain = partner
    ride.captain_assigned_at = now
    _transition(
        ride,
        RideState.CAPTAIN_ASSIGNED,
        actor=partner.user,
        actor_kind=ActorKind.CAPTAIN,
        now=now,
    )
    try:
        with transaction.atomic():
            ride.save(update_fields=("state", "captain", "captain_assigned_at", "updated_at"))
    except IntegrityError as exc:
        # The captain already has another open ride; the database refused a second one.
        raise RideNoLongerAvailableError from exc
    notify.captain_assigned(ride)
    logger.info(
        "ride_offer_accepted",
        extra={"ride_id": str(ride.id), "partner_id": str(partner.id), "round": offer.round},
    )
    return ride


def decline_offer(*, partner: PartnerProfile, offer_id: UUID) -> None:
    """The captain says no. Saying no twice, or too late, changes nothing.

    When nobody in the round is still deciding, the next round starts now instead of waiting for
    the timer.
    """
    with transaction.atomic():
        offer = (
            RideOffer.objects.select_for_update()
            .select_related("ride")
            .filter(id=offer_id, captain=partner)
            .first()
        )
        if offer is None:
            raise NotFound("We couldn't find this ride request.")
        now = timezone.now()
        if offer.status != RideOffer.Status.PENDING or offer.expires_at <= now:
            return
        offer.status = RideOffer.Status.DECLINED
        offer.responded_at = now
        offer.save(update_fields=("status", "responded_at"))
        ride = offer.ride
        still_deciding = RideOffer.objects.filter(
            ride=ride, status=RideOffer.Status.PENDING, expires_at__gt=now
        ).exists()
        if ride.state == RideState.SEARCHING and not still_deciding:
            _schedule_round(ride.id, ride.dispatch_round + 1, countdown=0)
    logger.info(
        "ride_offer_declined", extra={"ride_id": str(offer.ride_id), "partner_id": str(partner.id)}
    )


# --- Trip steps (brief §5.4) ------------------------------------------------------------------

#: Wrong start codes allowed before the ride is locked (also a database constraint).
OTP_MAX_ATTEMPTS = 5
#: The rider sees the start code only while the captain is on the way or at the pickup.
OTP_VISIBLE_STATES = (RideState.CAPTAIN_ASSIGNED, RideState.CAPTAIN_ARRIVED)
#: Refusals `start_trip` returns instead of raising, so the counted attempt is kept.
OTP_INVALID = "otp_invalid"
OTP_LOCKED = "otp_locked"


def _otp_secret() -> bytes:
    secret = str(settings.RIDES_OTP_SECRET)
    if not secret:
        raise ImproperlyConfigured("RIDES_OTP_SECRET is not set, so no ride can start.")
    return secret.encode()


def ride_otp(ride_id: UUID) -> str:
    """The ride's 4-digit start code: derived from its id, never stored, never logged."""
    digest = hmac.new(_otp_secret(), str(ride_id).encode(), hashlib.sha256).digest()
    return f"{int.from_bytes(digest[:8], 'big') % 10_000:04d}"


def otp_fingerprint(ride_id: UUID, otp: str) -> str:
    """What the idempotency record stores for a typed code: an HMAC, so the table cannot be
    searched for the 10,000 possible codes."""
    message = f"rides.start-otp.v1:{ride_id}:{otp}".encode()
    return hmac.new(_otp_secret(), message, hashlib.sha256).hexdigest()


def _captain_ride(partner: PartnerProfile, ride_id: UUID) -> Ride:
    """The captain's own ride, locked. Anyone else's ride is a 404, so ids cannot be probed."""
    ride = Ride.objects.select_for_update().filter(id=ride_id, captain=partner).first()
    if ride is None:
        raise NotFound("We couldn't find this ride.")
    return ride


def _metres_between(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance (haversine); plenty precise for a 200 m check."""
    earth_m = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * earth_m * math.asin(math.sqrt(a))


def _at_pickup(ride: Ride, position: dict[str, str] | None, now: datetime) -> bool:
    if position is None:
        return False
    captured_at = datetime.fromisoformat(position["captured_at"])
    if now - captured_at > timedelta(seconds=int(settings.RIDES_PING_MAX_AGE_SECONDS)):
        return False
    distance = _metres_between(
        float(position["latitude"]),
        float(position["longitude"]),
        float(ride.pickup_latitude),
        float(ride.pickup_longitude),
    )
    return distance <= int(settings.RIDES_ARRIVAL_RADIUS_M)


def _log_step(event: str, ride: Ride) -> None:
    logger.info(event, extra={"ride_id": str(ride.id), "partner_id": str(ride.captain_id)})


@transaction.atomic
def mark_arrived(*, partner: PartnerProfile, ride_id: UUID) -> Ride:
    """The captain is at the pickup: their last ping is under 30 s old and within 200 m."""
    ride = _captain_ride(partner, ride_id)
    if ride.state == RideState.CAPTAIN_ARRIVED:
        return ride
    if ride.state != RideState.CAPTAIN_ASSIGNED:
        raise InvalidTransitionError
    try:
        position = location.last_position(partner.id)
    except location.LocationStoreError as exc:
        raise LocationUnavailableError from exc
    now = timezone.now()
    if not _at_pickup(ride, position, now):
        raise NotAtPickupError

    ride.captain_arrived_at = now
    _transition(
        ride, RideState.CAPTAIN_ARRIVED, actor=partner.user, actor_kind=ActorKind.CAPTAIN, now=now
    )
    ride.save(update_fields=("state", "captain_arrived_at", "updated_at"))
    notify.captain_arrived(ride)
    _log_step("ride_captain_arrived", ride)
    return ride


@transaction.atomic
def start_trip(*, partner: PartnerProfile, ride_id: UUID, otp: str) -> tuple[Ride, str | None]:
    """Start the trip with the rider's code. Returns (ride, refusal).

    A wrong code is counted and *returned* as `otp_invalid` (or `otp_locked` on the fifth),
    never raised: raising would roll the count back. The waiting charge is fixed here, from the
    time between arriving and starting.
    """
    ride = _captain_ride(partner, ride_id)
    if ride.state == RideState.IN_TRIP:
        return ride, None
    if ride.state != RideState.CAPTAIN_ARRIVED:
        raise InvalidTransitionError
    if ride.otp_attempts >= OTP_MAX_ATTEMPTS:
        return ride, OTP_LOCKED
    if not hmac.compare_digest(otp, ride_otp(ride.id)):
        ride.otp_attempts += 1
        ride.save(update_fields=("otp_attempts", "updated_at"))
        logger.info(
            "ride_otp_wrong", extra={"ride_id": str(ride.id), "attempts": ride.otp_attempts}
        )
        return ride, OTP_LOCKED if ride.otp_attempts >= OTP_MAX_ATTEMPTS else OTP_INVALID

    now = timezone.now()
    card = FareQuote.objects.select_related("rate_card").get(pk=ride.quote_id).rate_card
    arrived_at = ride.captain_arrived_at or now
    ride.waiting_paise = waiting_charge_paise(
        card, waited_s=int((now - arrived_at).total_seconds())
    )
    ride.started_at = now
    _transition(ride, RideState.IN_TRIP, actor=partner.user, actor_kind=ActorKind.CAPTAIN, now=now)
    ride.save(update_fields=("state", "started_at", "waiting_paise", "updated_at"))
    _log_step("ride_started", ride)
    return ride, None


@transaction.atomic
def complete_trip(*, partner: PartnerProfile, ride_id: UUID) -> Ride:
    """End the trip. The rider pays the upfront fare plus waiting; GPS never re-prices it."""
    ride = _captain_ride(partner, ride_id)
    if ride.state == RideState.COMPLETED:
        return ride
    if ride.state != RideState.IN_TRIP:
        raise InvalidTransitionError
    now = timezone.now()
    ride.completed_at = now
    ride.final_fare_paise = ride.fare_paise + ride.waiting_paise
    ride.payment_status = Ride.PaymentStatus.DUE
    _transition(
        ride, RideState.COMPLETED, actor=partner.user, actor_kind=ActorKind.CAPTAIN, now=now
    )
    ride.save(
        update_fields=("state", "completed_at", "final_fare_paise", "payment_status", "updated_at")
    )
    _log_step("ride_completed", ride)
    return ride


@transaction.atomic
def mark_payment_received(*, partner: PartnerProfile, ride_id: UUID) -> Ride:
    """The captain got the cash or UPI. Saying so twice changes nothing."""
    ride = _captain_ride(partner, ride_id)
    if ride.state != RideState.COMPLETED:
        raise InvalidTransitionError
    if ride.payment_status == Ride.PaymentStatus.COLLECTED:
        return ride
    ride.payment_status = Ride.PaymentStatus.COLLECTED
    ride.payment_collected_at = timezone.now()
    ride.save(update_fields=("payment_status", "payment_collected_at", "updated_at"))
    _log_step("ride_payment_collected", ride)
    return ride


def captain_current_ride(partner: PartnerProfile) -> Ride | None:
    """The ride the captain's app should show: the open one, else a finished one still unpaid
    (so the Collect screen survives an app restart)."""
    rides = Ride.objects.select_related("quote", "rider").filter(captain=partner)
    return (
        rides.filter(state__in=OPEN_RIDE_STATES).first()
        or rides.filter(state=RideState.COMPLETED, payment_status=Ride.PaymentStatus.DUE)
        .order_by("-completed_at")
        .first()
    )


# --- Cancellations (brief §5.4) ---------------------------------------------------------------

RIDER_CANCEL_REASONS = ("CHANGED_MIND", "CAPTAIN_DELAYED", "WRONG_PICKUP", "OTHER")
CAPTAIN_CANCEL_REASONS = ("RIDER_NOT_REACHABLE", "VEHICLE_ISSUE", "PICKUP_TOO_FAR", "OTHER")
#: The rider may cancel until the trip starts; after that only Operations can.
_RIDER_CANCELLABLE = (
    RideState.SEARCHING,
    RideState.CAPTAIN_ASSIGNED,
    RideState.CAPTAIN_ARRIVED,
)
_CAPTAIN_CANCELLABLE = (RideState.CAPTAIN_ASSIGNED, RideState.CAPTAIN_ARRIVED)


def _cancel(ride: Ride, *, actor: Any, actor_kind: str, reason: str, now: datetime) -> None:
    """Close the ride as cancelled and withdraw any offer still on a captain's screen."""
    ride.offers.filter(status=RideOffer.Status.PENDING).update(
        status=RideOffer.Status.WITHDRAWN, responded_at=now
    )
    ride.cancelled_at = now
    ride.cancelled_by = actor_kind
    ride.cancel_reason = reason
    _transition(
        ride, RideState.CANCELLED, actor=actor, actor_kind=actor_kind, now=now, reason=reason
    )
    ride.save(
        update_fields=("state", "cancelled_at", "cancelled_by", "cancel_reason", "updated_at")
    )
    captain_user_id = (
        PartnerProfile.objects.filter(pk=ride.captain_id).values_list("user_id", flat=True).first()
        if ride.captain_id is not None
        else None
    )
    notify.ride_cancelled(ride, captain_user_id=captain_user_id)
    logger.info(
        "ride_cancelled",
        extra={"ride_id": str(ride.id), "cancelled_by": actor_kind, "reason": reason},
    )


@transaction.atomic
def rider_cancel(*, rider: Any, ride_id: UUID, reason: str) -> Ride:
    """The rider cancels, free in V1, until the trip starts. Cancelling twice changes nothing."""
    ride = Ride.objects.select_for_update().filter(id=ride_id, rider=rider).first()
    if ride is None:
        raise NotFound("We couldn't find this ride.")
    if ride.state == RideState.CANCELLED:
        return ride
    if ride.state not in _RIDER_CANCELLABLE:
        raise InvalidTransitionError
    _cancel(ride, actor=rider, actor_kind=ActorKind.RIDER, reason=reason, now=timezone.now())
    return ride


@transaction.atomic
def captain_cancel(*, partner: PartnerProfile, ride_id: UUID, reason: str) -> None:
    """The captain gives the ride up before the trip. The ride searches again from round 1,
    never offering it back to this captain, and the cancel counts against them in Operations."""
    ride = _captain_ride(partner, ride_id)
    if ride.state not in _CAPTAIN_CANCELLABLE:
        raise InvalidTransitionError
    now = timezone.now()
    # Frees the ride's single ACCEPTED slot for whoever takes it next.
    ride.offers.filter(captain=partner, status=RideOffer.Status.ACCEPTED).update(
        status=RideOffer.Status.WITHDRAWN, responded_at=now
    )
    ride.captain = None
    ride.captain_assigned_at = None
    ride.captain_arrived_at = None
    # otp_attempts stays: the start code belongs to the ride, so a new captain must not get
    # five fresh guesses at the same code.
    ride.dispatch_round = 0
    _transition(
        ride,
        RideState.SEARCHING,
        actor=partner.user,
        actor_kind=ActorKind.CAPTAIN,
        now=now,
        reason=reason,
    )
    ride.save(
        update_fields=(
            "state",
            "captain",
            "captain_assigned_at",
            "captain_arrived_at",
            "dispatch_round",
            "updated_at",
        )
    )
    _schedule_round(ride.id, 1, countdown=0)
    notify.captain_cancelled(ride, now)
    logger.info(
        "ride_captain_cancelled",
        extra={"ride_id": str(ride.id), "partner_id": str(partner.id), "reason": reason},
    )


@transaction.atomic
def operations_cancel(*, operator: Any, ride_id: UUID, reason: str) -> Ride:
    """Operations closes any open ride, including one in trip. Cancelling twice changes nothing."""
    ride = Ride.objects.select_for_update().filter(id=ride_id).first()
    if ride is None:
        raise NotFound("We couldn't find this ride.")
    if ride.state == RideState.CANCELLED:
        return ride
    if ride.state not in OPEN_RIDE_STATES:
        raise InvalidTransitionError
    _cancel(
        ride, actor=operator, actor_kind=ActorKind.OPERATIONS, reason=reason, now=timezone.now()
    )
    return ride


def searching_again(ride: Ride) -> bool:
    """A captain cancelled and the ride is looking for another: the rider sees
    "Finding another captain" instead of "Finding your captain"."""
    return (
        ride.state == RideState.SEARCHING
        and RideTransition.objects.filter(
            ride=ride, actor_kind=ActorKind.CAPTAIN, to_state=RideState.SEARCHING
        ).exists()
    )


# --- After the ride: ratings and SOS (brief §5.9) ---------------------------------------------


@transaction.atomic
def rate_ride(*, ride_id: UUID, rides: Any, rater_kind: str, stars: int) -> RideRating:
    """One side rates the other, once, after a completed ride. `rides` is the caller's own rides,
    so anyone else's ride is a 404."""
    ride = rides.select_for_update().filter(id=ride_id).first()
    if ride is None:
        raise NotFound("We couldn't find this ride.")
    if ride.state != RideState.COMPLETED:
        raise InvalidTransitionError
    try:
        with transaction.atomic():
            rating = RideRating.objects.create(ride=ride, rater_kind=rater_kind, stars=stars)
    except IntegrityError as exc:
        # One rating per side: the database refuses the second.
        raise InvalidTransitionError from exc
    logger.info("ride_rated", extra={"ride_id": str(ride.id), "rater": rater_kind, "stars": stars})
    return rating


@transaction.atomic
def raise_sos(
    *,
    ride_id: UUID,
    rides: Any,
    raised_by: Any,
    latitude: Any | None,
    longitude: Any | None,
) -> RideSosEvent:
    """An SOS on a live ride. Never refused for lack of a location. Pressing it again while one is
    open returns that one, so a panicked double tap is one alert, not two.

    Where the phone sent no position, the ride's captain's last ping is used if there is one:
    rider and captain are in the same place from pickup on.
    """
    ride = rides.select_for_update().filter(id=ride_id).first()
    if ride is None:
        raise NotFound("We couldn't find this ride.")
    if ride.state not in OPEN_RIDE_STATES:
        raise InvalidTransitionError
    open_sos = RideSosEvent.objects.filter(
        ride=ride, raised_by=raised_by, status=RideSosEvent.Status.OPEN
    ).first()
    if open_sos is not None:
        return open_sos

    if latitude is None and ride.captain_id is not None:
        try:
            ping = location.last_position(ride.captain_id)
        except location.LocationStoreError:
            ping = None
        if ping is not None:
            latitude = Decimal(ping["latitude"]).quantize(Decimal("0.000001"))
            longitude = Decimal(ping["longitude"]).quantize(Decimal("0.000001"))
    sos = RideSosEvent.objects.create(
        ride=ride, raised_by=raised_by, latitude=latitude, longitude=longitude
    )
    notify.sos_raised(sos, raised_by_kind="rider" if raised_by.pk == ride.rider_id else "captain")
    # No coordinates in the log: they are someone's exact whereabouts.
    logger.warning(
        "ride_sos_raised",
        extra={"ride_id": str(ride.id), "sos_id": str(sos.id), "raised_by": str(raised_by.pk)},
    )
    return sos


@transaction.atomic
def resolve_sos(*, operator: Any, sos_id: UUID, note: str) -> RideSosEvent:
    """Operations closes an SOS with what they did. Resolving it again changes nothing."""
    sos = RideSosEvent.objects.select_for_update().filter(id=sos_id).first()
    if sos is None:
        raise NotFound("We couldn't find this SOS.")
    if sos.status == RideSosEvent.Status.RESOLVED:
        return sos
    sos.status = RideSosEvent.Status.RESOLVED
    sos.resolved_by = operator
    sos.resolved_at = timezone.now()
    sos.resolution_note = note
    sos.save(update_fields=("status", "resolved_by", "resolved_at", "resolution_note"))
    logger.info("ride_sos_resolved", extra={"sos_id": str(sos.id), "actor_id": str(operator.pk)})
    return sos
