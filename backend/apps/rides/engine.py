"""The ride engine (brief §5.4, §5.6): booking a ride and finding it a captain.

Every state change happens here, inside a transaction that locks the ride, and writes one
`RideTransition`. Dispatch runs in Celery and is delivered at least once, so every step re-reads
the ride first and does nothing if someone else already moved it on.
"""

import logging
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError, models, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.foundation.services import enqueue_outbox_event
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides import location, selectors
from apps.rides.exceptions import (
    NotOnDutyError,
    QuoteExpiredError,
    QuoteUsedError,
    RideAlreadyOpenError,
    RideNoLongerAvailableError,
    VehicleUnavailableError,
)
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
    RideState,
    RideTransition,
)

__all__ = [
    "RIDE_REQUESTED",
    "accept_offer",
    "create_ride",
    "current_offer",
    "decline_offer",
    "redrive_dispatch",
    "run_dispatch_round",
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


def _eligible_captains(ride: Ride, *, candidate_ids: list[str], now: datetime) -> set[UUID]:
    """Which of these nearby captains may get this ride now, locked so no other round takes them.

    Locked rows another dispatch is holding are skipped: that captain is about to get an offer.
    """
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
        .exclude(models.Exists(RideOffer.objects.filter(captain=partner, ride=ride)))
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
    expires_at = now + timedelta(seconds=settings.RIDES_OFFER_SECONDS)
    return RideOffer.objects.bulk_create(
        RideOffer(
            ride=ride,
            captain_id=captain_id,
            round=round_no,
            pickup_distance_m=metres,
            offered_at=now,
            expires_at=expires_at,
        )
        for captain_id, metres in chosen[: settings.RIDES_OFFERS_PER_ROUND]
    )


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
