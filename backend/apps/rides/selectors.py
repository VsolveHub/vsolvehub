"""Rides reads. No writes here."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from django.core.cache import cache
from django.db.models import Avg, Count, Exists, F, OuterRef, Q, Subquery, Sum
from django.utils import timezone

from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides import location
from apps.rides.models import (
    CaptainDutySession,
    CaptainPass,
    CaptainVehicle,
    Ride,
    RideRating,
    RideState,
    RideTransition,
)
from apps.rides.routing import RoutingUnavailableError, get_route

__all__ = [
    "EARNINGS_PERIODS",
    "CaptainLive",
    "CaptainStatus",
    "Earnings",
    "active_pass",
    "captain_earnings",
    "captain_live",
    "captain_status",
    "captains_for_operations",
    "open_duty_session",
    "queued_pass",
]

#: What `approval` says when the partner has not started a captain application.
NOT_STARTED = "NOT_STARTED"


@dataclass(frozen=True, slots=True)
class CaptainStatus:
    approval: str
    is_approved: bool
    vehicle: CaptainVehicle | None
    active_pass: CaptainPass | None
    #: A paid pass waiting for the active one to end (brief §5.8).
    queued_pass: CaptainPass | None
    on_duty: bool
    duty_started_at: datetime | None
    #: Why the captain cannot go on duty, in the order the app should explain them.
    blocked_reasons: list[str]
    server_now: datetime
    #: The last duty session, while off duty: why and when it ended, so the app can say so.
    last_duty_end: CaptainDutySession | None = None


def queued_pass(partner: PartnerProfile) -> CaptainPass | None:
    return (
        CaptainPass.objects.select_related("plan")
        .filter(partner=partner, status=CaptainPass.Status.QUEUED)
        .first()
    )


def active_pass(partner: PartnerProfile, *, now: datetime | None = None) -> CaptainPass | None:
    """The pass that lets this captain drive right now.

    A pass past its end is not active, even before the expiry task has caught up with it.
    """
    return (
        CaptainPass.objects.select_related("plan")
        .filter(
            partner=partner,
            status=CaptainPass.Status.ACTIVE,
            ends_at__gt=now or timezone.now(),
        )
        .first()
    )


def open_duty_session(partner: PartnerProfile) -> CaptainDutySession | None:
    return CaptainDutySession.objects.filter(partner=partner, ended_at__isnull=True).first()


def captain_status(partner: PartnerProfile) -> CaptainStatus:
    """Where this partner stands as a ride captain, and why they cannot go on duty yet."""
    application = PartnerApplication.objects.filter(
        partner=partner, track=PartnerApplication.Track.RIDE_CAPTAIN
    ).first()
    vehicle = CaptainVehicle.objects.filter(partner=partner).first()
    current_pass = active_pass(partner)
    session = open_duty_session(partner)
    approval = application.status if application else NOT_STARTED
    is_approved = approval == PartnerApplication.Status.APPROVED

    blocked: list[str] = []
    if approval == PartnerApplication.Status.SUSPENDED:
        blocked.append("suspended")
    elif not is_approved:
        blocked.append("not_approved")
    if vehicle is None:
        blocked.append("vehicle_missing")
    if current_pass is None:
        blocked.append("pass_required")

    return CaptainStatus(
        approval=approval,
        is_approved=is_approved,
        vehicle=vehicle,
        active_pass=current_pass,
        queued_pass=queued_pass(partner),
        on_duty=session is not None,
        duty_started_at=session.started_at if session else None,
        blocked_reasons=blocked,
        server_now=timezone.now(),
        last_duty_end=None
        if session is not None
        else CaptainDutySession.objects.filter(partner=partner, ended_at__isnull=False)
        .order_by("-ended_at")
        .first(),
    )


# --- The rider's live ride (brief §5.7) -------------------------------------------------------

#: While the ride is in these states, the rider sees where the captain is.
_TRACKED_STATES = (RideState.CAPTAIN_ASSIGNED, RideState.CAPTAIN_ARRIVED, RideState.IN_TRIP)
#: The pickup ETA is a Routes call, so it is worked out at most this often per ride.
ETA_CACHE_SECONDS = 30


@dataclass(frozen=True, slots=True)
class CaptainLive:
    position: dict[str, Any] | None
    eta_s: int | None


def captain_live(ride: Ride) -> CaptainLive:
    """Where the captain is, and how long to the pickup, if the server honestly knows.

    Either is None rather than guessed: no fresh ping, Redis down, or Routes down. The ETA is
    only for a captain still on the way.
    """
    if ride.captain_id is None or ride.state not in _TRACKED_STATES:
        return CaptainLive(position=None, eta_s=None)
    try:
        ping = location.last_position(ride.captain_id)
    except location.LocationStoreError:
        ping = None
    if ping is None:
        return CaptainLive(position=None, eta_s=None)
    position = {
        "latitude": float(ping["latitude"]),
        "longitude": float(ping["longitude"]),
        "heading": float(ping["heading"]) if ping.get("heading") else None,
        "captured_at": ping["captured_at"],
    }
    eta = _pickup_eta_s(ride, position) if ride.state == RideState.CAPTAIN_ASSIGNED else None
    return CaptainLive(position=position, eta_s=eta)


def captain_rating(partner_id: Any) -> float | None:
    """The captain's average stars from riders, to one decimal; None until the first rating."""
    stars = RideRating.objects.filter(ride__captain_id=partner_id, rater_kind="RIDER").aggregate(
        value=Avg("stars")
    )["value"]
    return None if stars is None else round(float(stars), 1)


def _pickup_eta_s(ride: Ride, position: dict[str, Any]) -> int | None:
    key = f"rides:eta:{ride.id}"
    cached = cache.get(key)
    if isinstance(cached, int):
        return cached
    try:
        route = get_route(
            pickup=(Decimal(str(position["latitude"])), Decimal(str(position["longitude"]))),
            drop=(ride.pickup_latitude, ride.pickup_longitude),
            vehicle_type=ride.vehicle_type,
        )
    except RoutingUnavailableError:
        return None
    cache.set(key, route.duration_s, ETA_CACHE_SECONDS)
    return route.duration_s


# --- Captain earnings (brief §5.8: computed, never stored) ------------------------------------

EARNINGS_PERIODS = ("today", "week")


@dataclass(frozen=True, slots=True)
class Earnings:
    period: str
    since: datetime
    rides: int
    earned_paise: int
    cash_collected_paise: int


def captain_earnings(partner: PartnerProfile, *, period: str) -> Earnings:
    """Completed rides since local midnight (`today`) or since Monday (`week`), in India time.

    `earned_paise` is what riders owed for those rides; `cash_collected_paise` is the part the
    captain marked as received.
    """
    local_now = timezone.localtime()
    since = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        since -= timedelta(days=local_now.weekday())
    rides = Ride.objects.filter(captain=partner, state=RideState.COMPLETED, completed_at__gte=since)
    totals = rides.aggregate(
        count=Count("id"),
        earned=Sum("final_fare_paise"),
        collected=Sum("final_fare_paise", filter=Q(payment_status=Ride.PaymentStatus.COLLECTED)),
    )
    return Earnings(
        period=period,
        since=since,
        rides=int(totals["count"]),
        earned_paise=int(totals["earned"] or 0),
        cash_collected_paise=int(totals["collected"] or 0),
    )


# --- Operations: the captains list ------------------------------------------------------------


def _scalar(queryset: Any, value: Any) -> Subquery:
    """One aggregate per captain as a subquery, so the list is one query however long it is."""
    return Subquery(queryset.order_by().annotate(value=value).values("value")[:1])


def captains_for_operations() -> Any:
    """Every partner on the captain track, with what Operations checks first."""
    partner = OuterRef("pk")
    return (
        PartnerProfile.objects.filter(application__track=PartnerApplication.Track.RIDE_CAPTAIN)
        .select_related("user", "ride_vehicle")
        .annotate(
            approval=F("application__status"),
            pass_ends_at=Subquery(
                CaptainPass.objects.filter(
                    partner=partner, status=CaptainPass.Status.ACTIVE, ends_at__gt=timezone.now()
                ).values("ends_at")[:1]
            ),
            on_duty=Exists(
                CaptainDutySession.objects.filter(partner=partner, ended_at__isnull=True)
            ),
            rides_completed=_scalar(
                Ride.objects.filter(captain=partner, state=RideState.COMPLETED).values("captain"),
                Count("id"),
            ),
            rating=_scalar(
                RideRating.objects.filter(ride__captain=partner, rater_kind="RIDER").values(
                    "ride__captain"
                ),
                Avg("stars"),
            ),
            cancels=_scalar(
                RideTransition.objects.filter(
                    actor=OuterRef("user_id"),
                    actor_kind="CAPTAIN",
                    to_state=RideState.SEARCHING,
                ).values("actor"),
                Count("id"),
            ),
        )
    )
