"""Builders for ride-engine tests: an area with a bike price, quotes, rides and captains on the map.

Test rows only; nothing here reaches production code. Captains are put on the live map in the
local Docker Redis, database 15 (see the `ride_redis` fixture in conftest.py).
"""

import itertools
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.utils import timezone
from freezegun import freeze_time

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides import engine, location
from apps.rides.models import (
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    CaptainVehicle,
    FareQuote,
    Ride,
    RideOffer,
    RideRateCard,
)
from tests.rides.helpers import ready_captain

TEST_REDIS = "redis://127.0.0.1:56379/15"
RIDES = "/api/v1/rides/"
PICKUP = (Decimal("17.440000"), Decimal("78.350000"))
#: Degrees of latitude per kilometre, near enough for placing test captains.
KM = 0.009

_captains = itertools.count(1)


def make_area() -> ServiceArea:
    """A service area where bikes can be booked."""
    area = ServiceArea.objects.create(
        slug=f"area-{uuid.uuid4().hex[:6]}", name="Gachibowli", timezone="Asia/Kolkata"
    )
    RideRateCard.objects.create(
        service_area=area,
        vehicle_type="BIKE",
        base_fare_paise=1500,
        included_distance_m=1000,
        per_km_paise=600,
        per_minute_paise=100,
        minimum_fare_paise=2500,
        free_waiting_minutes=3,
        waiting_per_minute_paise=100,
    )
    return area


def quote_for(rider: User, area: ServiceArea, *, expires_in: int = 300) -> FareQuote:
    card = RideRateCard.objects.get(service_area=area, vehicle_type="BIKE", is_active=True)
    now = timezone.now()
    quote = FareQuote.objects.create(
        rider=rider,
        service_area=area,
        vehicle_type="BIKE",
        rate_card=card,
        rate_card_version=card.version,
        pickup_latitude=PICKUP[0],
        pickup_longitude=PICKUP[1],
        pickup_label="Gachibowli",
        drop_latitude=Decimal("17.450000"),
        drop_longitude=Decimal("78.380000"),
        drop_label="Hitec City",
        distance_m=4200,
        duration_s=900,
        route_polyline="abc",
        fare_paise=5100,
        expires_at=now + timedelta(seconds=300),
    )
    if expires_in != 300:
        # created_at is set on insert, so an expired quote is made by moving created_at back too.
        FareQuote.objects.filter(pk=quote.pk).update(
            created_at=now - timedelta(seconds=600), expires_at=now + timedelta(seconds=expires_in)
        )
        quote.refresh_from_db()
    return quote


def book(client: Any, quote: FareQuote, key: str = "k-1") -> Any:
    return client.post(RIDES, {"quote_id": str(quote.id)}, format="json", HTTP_IDEMPOTENCY_KEY=key)


def error_code(response: Any) -> str:
    return str(response.json()["error"]["code"])


def captain(
    area: ServiceArea, *, km: float, accuracy_m: int = 10, vehicle: str = "BIKE"
) -> PartnerProfile:
    """A captain on duty with a pass, on the live map `km` north of the pickup."""
    user, _ = ready_captain(f"Captain {next(_captains)}")
    partner = PartnerProfile.objects.get(user=user)
    CaptainVehicle.objects.filter(partner=partner).update(vehicle_type=vehicle)
    plan, _ = CaptainPassPlan.objects.get_or_create(
        code="launch-pass", defaults={"name": "Launch", "price_paise": 0, "duration_hours": 24}
    )
    now = timezone.now()
    CaptainPass.objects.create(
        partner=partner,
        plan=plan,
        status=CaptainPass.Status.ACTIVE,
        starts_at=now,
        ends_at=now + timedelta(hours=24),
    )
    CaptainDutySession.objects.create(partner=partner)
    location.record_position(
        partner_id=partner.id,
        latitude=float(PICKUP[0]) + km * KM,
        longitude=float(PICKUP[1]),
        accuracy_m=accuracy_m,
        heading=None,
        captured_at=now.isoformat(),
        listed_in=location.geo_key(area.id, vehicle),
    )
    return partner


def new_ride(rider: User, area: ServiceArea) -> Ride:
    return engine.create_ride(rider=rider, quote_id=quote_for(rider, area).id)


def dispatch(ride: Ride, round_no: int = 1) -> Ride:
    engine.run_dispatch_round(ride_id=ride.id, round_no=round_no)
    ride.refresh_from_db()
    return ride


def offered(ride: Ride) -> list[uuid.UUID]:
    """The captains still deciding on this ride, nearest first."""
    return list(
        RideOffer.objects.filter(ride=ride, status=RideOffer.Status.PENDING)
        .order_by("pickup_distance_m")
        .values_list("captain_id", flat=True)
    )


def after_offers_expire() -> Any:
    return freeze_time(timezone.now() + timedelta(seconds=16))
