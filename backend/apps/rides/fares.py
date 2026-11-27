"""Fare engine (Rides brief §5.5, Taxi brief §4.2). Server only, integer paise, exact arithmetic.

Fractions of a paisa are carried as `Fraction` and rounded once, to the nearest whole rupee,
half up. No float touches a price; a float only measures GPS distance, before it is whole km.
"""

import math
from collections.abc import Iterable
from datetime import datetime
from fractions import Fraction
from zoneinfo import ZoneInfo

from django.conf import settings

from apps.rides.models import RENTAL_HOURS, RideRateCard, RideTrackPoint

__all__ = [
    "final_fare_paise",
    "metres_between",
    "outstation_billed_km",
    "outstation_days",
    "outstation_fare_paise",
    "rental_extras",
    "rental_fare_paise",
    "rental_included_km",
    "track_metres",
    "trip_fare_paise",
    "waiting_charge_paise",
]

PAISE_PER_RUPEE = 100
METRES_PER_KM = 1000
#: Outstation days are calendar days here (D13), wherever the server runs.
OUTSTATION_TIMEZONE = ZoneInfo("Asia/Kolkata")


def _round_half_up_to_rupee(paise: Fraction) -> int:
    return math.floor(paise / PAISE_PER_RUPEE + Fraction(1, 2)) * PAISE_PER_RUPEE


def trip_fare_paise(card: RideRateCard, *, distance_m: int, duration_s: int) -> int:
    """The upfront fare for a route: what the quote shows and the rider pays, before waiting."""
    if distance_m < 0 or duration_s < 0:
        raise ValueError("distance_m and duration_s must not be negative")

    extra_m = max(0, distance_m - card.included_distance_m)
    distance_fee = Fraction(card.per_km_paise * extra_m, 1000)
    time_fee = Fraction(card.per_minute_paise * duration_s, 60)
    fare = max(Fraction(card.minimum_fare_paise), card.base_fare_paise + distance_fee + time_fee)
    return _round_half_up_to_rupee(fare)


def waiting_charge_paise(card: RideRateCard, *, waited_s: int) -> int:
    """Charge for the time between the captain arriving and the trip starting.

    Free minutes come first; every started minute after that is charged in full.
    """
    if waited_s < 0:
        raise ValueError("waited_s must not be negative")

    chargeable_s = max(0, waited_s - card.free_waiting_minutes * 60)
    started_minutes = -(-chargeable_s // 60)  # ceiling division, integers only
    return card.waiting_per_minute_paise * started_minutes


def final_fare_paise(card: RideRateCard, *, quoted_fare_paise: int, waited_s: int) -> int:
    """What the rider pays at the end: the upfront quote plus waiting. Never re-priced by GPS."""
    return quoted_fare_paise + waiting_charge_paise(card, waited_s=waited_s)


def metres_between(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance (haversine); plenty precise for a 200 m check or a GPS track."""
    earth_m = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * earth_m * math.asin(math.sqrt(a))


# --- Rental (D10, D11) ------------------------------------------------------------------------


def rental_included_km(hours: int) -> int:
    """The km a package includes: 10 a hour (`RIDES_RENTAL_KM_PER_HOUR`)."""
    return hours * int(settings.RIDES_RENTAL_KM_PER_HOUR)


def rental_fare_paise(card: RideRateCard, hours: int) -> int | None:
    """The package price on a rental card, or None when the card does not offer that package."""
    if hours not in RENTAL_HOURS:
        raise ValueError(f"No {hours} h rental package")
    prices = {2: card.rental_2h_paise, 4: card.rental_4h_paise, 8: card.rental_8h_paise}
    return prices[hours]


def rental_extras(
    card: RideRateCard, *, hours: int, used_seconds: int, used_metres: int
) -> tuple[int, int, int]:
    """Use beyond the package and its price: `(extra_km, extra_minutes, extras_paise)`.

    Km are whole km, rounded down; minutes are every started minute past the package hours. On a
    rental card `per_km_paise` and `per_minute_paise` are the extra-km and extra-minute rates.
    """
    if used_seconds < 0 or used_metres < 0:
        raise ValueError("used_seconds and used_metres must not be negative")

    extra_km = max(0, used_metres // METRES_PER_KM - rental_included_km(hours))
    extra_s = max(0, used_seconds - hours * 3600)
    extra_minutes = -(-extra_s // 60)  # ceiling division, integers only
    extras = extra_km * card.per_km_paise + extra_minutes * card.per_minute_paise
    return extra_km, extra_minutes, extras


def track_metres(points: Iterable[RideTrackPoint]) -> int:
    """Metres driven along a GPS track, in time order, skipping inaccurate points (D11).

    A point less accurate than `RIDES_TRACK_MAX_ACCURACY_M` is left out, so a jump from a bad fix
    is never billed. Rounded down to whole metres.
    """
    max_accuracy = int(settings.RIDES_TRACK_MAX_ACCURACY_M)
    total = 0.0
    previous: RideTrackPoint | None = None
    for point in points:
        if point.accuracy_m > max_accuracy:
            continue
        if previous is not None:
            total += metres_between(
                float(previous.latitude),
                float(previous.longitude),
                float(point.latitude),
                float(point.longitude),
            )
        previous = point
    return math.floor(total)


# --- Outstation (D12, D13) --------------------------------------------------------------------


def outstation_days(leave: datetime, return_at: datetime) -> int:
    """Calendar days from the leaving date to the return date, both counted (Asia/Kolkata)."""
    leave_date = leave.astimezone(OUTSTATION_TIMEZONE).date()
    return_date = return_at.astimezone(OUTSTATION_TIMEZONE).date()
    return (return_date - leave_date).days + 1


def _road_km(road_metres: int) -> int:
    """Road distance in whole km, half up, so `billed_km x rate` is the price the rider sees."""
    if road_metres < 0:
        raise ValueError("road_metres must not be negative")
    return (road_metres + METRES_PER_KM // 2) // METRES_PER_KM


def outstation_billed_km(
    card: RideRateCard, *, road_metres: int, round_trip: bool, days: int
) -> int:
    """The km an outstation trip is priced on: the road km one way, or for a round trip
    max(2 x road km, the card's km a day x days)."""
    km = _road_km(road_metres)
    if not round_trip:
        return km
    if card.round_trip_min_km_per_day is None:
        raise ValueError("A round trip needs an outstation card")
    return max(2 * km, card.round_trip_min_km_per_day * days)


def outstation_fare_paise(
    card: RideRateCard, *, road_metres: int, round_trip: bool, days: int
) -> int:
    """The fixed outstation price (D13). The driver allowance is inside the rates.

    One way: max(card minimum, road km x one-way rate). Round trip: billed km x round-trip rate.
    Rounded half up to the rupee, like `trip_fare_paise`. Never re-priced by GPS.
    """
    billed_km = outstation_billed_km(
        card, road_metres=road_metres, round_trip=round_trip, days=days
    )
    if round_trip:
        if card.round_trip_per_km_paise is None:
            raise ValueError("A round trip needs an outstation card")
        fare = billed_km * card.round_trip_per_km_paise
    else:
        fare = max(card.minimum_fare_paise, billed_km * card.per_km_paise)
    return _round_half_up_to_rupee(Fraction(fare))
