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
from apps.rides import selectors
from apps.rides.exceptions import (
    AreaNotServedError,
    CaptainNotApprovedError,
    PassAlreadyActiveError,
    PassRequiredError,
    RegistrationAlreadyUsedError,
    RoutingUnavailableApiError,
)
from apps.rides.fares import trip_fare_paise
from apps.rides.models import (
    OPEN_RIDE_STATES,
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    CaptainVehicle,
    FareQuote,
    Ride,
    RideRateCard,
    VehicleType,
    normalise_registration_number,
)
from apps.rides.routing import RoutingUnavailableError, get_route

__all__ = [
    "VEHICLE_EDITABLE_STATUSES",
    "TripPoint",
    "buy_pass",
    "complete_pass_payment",
    "create_quotes",
    "expire_passes",
    "save_captain_vehicle",
    "start_duty",
    "stop_duty",
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


def _lock_partner(partner: PartnerProfile) -> None:
    """Serialise a captain's pass and duty commands, so two taps cannot both pass a check."""
    PartnerProfile.objects.select_for_update().filter(pk=partner.pk).first()


def _expire_lapsed_passes(*, partner: PartnerProfile, now: Any) -> None:
    CaptainPass.objects.filter(
        partner=partner, status=CaptainPass.Status.ACTIVE, ends_at__lte=now
    ).update(status=CaptainPass.Status.EXPIRED, updated_at=now)


def _activate(captain_pass: CaptainPass, *, now: Any) -> None:
    captain_pass.status = CaptainPass.Status.ACTIVE
    captain_pass.starts_at = now
    captain_pass.ends_at = now + timedelta(hours=captain_pass.plan.duration_hours)
    captain_pass.save(update_fields=("status", "starts_at", "ends_at", "updated_at"))


@transaction.atomic
def buy_pass(
    *, partner: PartnerProfile, plan: CaptainPassPlan, idempotency_key: str
) -> CaptainPass:
    """Start buying a pass. A ₹0 plan is active at once; a paid plan waits for its payment.

    Refused while the captain already has an active pass. A pending purchase of the same plan
    whose payment can still succeed is returned instead of starting a second charge.
    """
    _lock_partner(partner)
    now = timezone.now()
    _expire_lapsed_passes(partner=partner, now=now)
    if selectors.active_pass(partner, now=now) is not None:
        raise PassAlreadyActiveError

    if plan.price_paise == 0:
        captain_pass = CaptainPass.objects.create(partner=partner, plan=plan)
        _activate(captain_pass, now=now)
        logger.info(
            "ride_pass_activated",
            extra={"partner_id": str(partner.id), "plan": plan.code, "paid": False},
        )
        return captain_pass

    pending = CaptainPass.objects.filter(
        partner=partner,
        plan=plan,
        status=CaptainPass.Status.PENDING_ACTIVATION,
        payment_attempt__status__in=_LIVE_PAYMENT_STATUSES,
    ).first()
    if pending is not None:
        return pending

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.RIDE_CAPTAIN_PASS,
        amount_paise=plan.price_paise,
        idempotency_key=f"ride-pass:{partner.id}:{idempotency_key}",
    )
    return CaptainPass.objects.create(partner=partner, plan=plan, payment_attempt=attempt)


@transaction.atomic
def complete_pass_payment(*, payment_attempt_id: Any) -> None:
    """Commerce calls this when a pass payment is captured. Running it twice changes nothing.

    As in Stay: if the captain somehow has another active pass (a free one taken while this
    payment was pending), that one ends and the paid pass starts now.
    """
    captain_pass = (
        CaptainPass.objects.select_for_update()
        .select_related("plan")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if captain_pass is None or captain_pass.status != CaptainPass.Status.PENDING_ACTIVATION:
        return
    now = timezone.now()
    CaptainPass.objects.filter(
        partner_id=captain_pass.partner_id, status=CaptainPass.Status.ACTIVE
    ).update(status=CaptainPass.Status.EXPIRED, updated_at=now)
    _activate(captain_pass, now=now)
    logger.info(
        "ride_pass_activated",
        extra={
            "partner_id": str(captain_pass.partner_id),
            "plan": captain_pass.plan.code,
            "paid": True,
        },
    )


@transaction.atomic
def expire_passes() -> int:
    """Run every minute. Ends lapsed passes, then takes their captains off duty.

    A captain on an open ride stays on duty until the ride ends; the next run after that takes
    them off (brief §5.8: a ride already in progress finishes).
    """
    now = timezone.now()
    expired = CaptainPass.objects.filter(status=CaptainPass.Status.ACTIVE, ends_at__lte=now).update(
        status=CaptainPass.Status.EXPIRED, updated_at=now
    )

    has_pass = CaptainPass.objects.filter(
        partner_id=models.OuterRef("partner_id"),
        status=CaptainPass.Status.ACTIVE,
        ends_at__gt=now,
    )
    on_a_ride = Ride.objects.filter(
        captain_id=models.OuterRef("partner_id"), state__in=OPEN_RIDE_STATES
    )
    ended = (
        CaptainDutySession.objects.filter(ended_at__isnull=True)
        .exclude(models.Exists(has_pass))
        .exclude(models.Exists(on_a_ride))
        .update(ended_at=now, end_reason=CaptainDutySession.EndReason.PASS_EXPIRED)
    )
    if expired or ended:
        logger.info("ride_passes_expired", extra={"passes_expired": expired, "duty_ended": ended})
    return expired


# --- Duty -------------------------------------------------------------------------------------

_NOT_APPROVED_MESSAGES = {
    "suspended": "Your captain account is suspended. Contact support.",
    "not_approved": "You can go on duty once your captain application is approved.",
    "vehicle_missing": "Add your vehicle details before going on duty.",
}


@transaction.atomic
def start_duty(*, partner: PartnerProfile) -> CaptainDutySession:
    """Go on duty, if every gate passes. Already on duty: the open session is returned."""
    _lock_partner(partner)
    existing = selectors.open_duty_session(partner)
    if existing is not None:
        return existing

    for reason in selectors.captain_status(partner).blocked_reasons:
        if reason == "pass_required":
            raise PassRequiredError
        raise CaptainNotApprovedError(_NOT_APPROVED_MESSAGES[reason])

    session = CaptainDutySession.objects.create(partner=partner)
    logger.info("ride_duty_started", extra={"partner_id": str(partner.id)})
    return session


@transaction.atomic
def stop_duty(*, partner: PartnerProfile) -> None:
    """Go off duty. Allowed during a ride: the ride goes on, only new requests stop."""
    _lock_partner(partner)
    closed = CaptainDutySession.objects.filter(partner=partner, ended_at__isnull=True).update(
        ended_at=timezone.now(), end_reason=CaptainDutySession.EndReason.CAPTAIN_OFF
    )
    if closed:
        logger.info("ride_duty_stopped", extra={"partner_id": str(partner.id)})
