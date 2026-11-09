"""Rides commands: every state change is authorised and audited here, never in a view."""

import logging
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.locations.geocoding import GeocodingError, reverse_geocode
from apps.locations.models import ServiceArea
from apps.locations.services import check_serviceability
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides.exceptions import (
    AreaNotServedError,
    CaptainNotApprovedError,
    RegistrationAlreadyUsedError,
    RoutingUnavailableApiError,
)
from apps.rides.fares import trip_fare_paise
from apps.rides.models import (
    CaptainVehicle,
    FareQuote,
    RideRateCard,
    VehicleType,
    normalise_registration_number,
)
from apps.rides.routing import RoutingUnavailableError, get_route

__all__ = [
    "VEHICLE_EDITABLE_STATUSES",
    "TripPoint",
    "create_quotes",
    "save_captain_vehicle",
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
