"""Fare engine (brief §5.5). Server only, integer paise, exact arithmetic.

Fractions of a paisa are carried as `Fraction` and rounded once, to the nearest whole rupee,
half up. No float touches a price.
"""

import math
from fractions import Fraction

from apps.rides.models import RideRateCard

__all__ = ["final_fare_paise", "trip_fare_paise", "waiting_charge_paise"]

PAISE_PER_RUPEE = 100


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
