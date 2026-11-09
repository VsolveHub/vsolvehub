"""Two captains accept the same ride at the same moment: exactly one gets it (brief §5.4).

Real transactions in two threads, so the database lock is what decides, not test ordering.
"""

import threading
from uuid import UUID

import pytest
from django.db import connection

from apps.partners.models import PartnerProfile
from apps.rides import engine
from apps.rides.exceptions import RideNoLongerAvailableError
from apps.rides.models import Ride, RideOffer, RideState
from tests.rides.helpers import make_user
from tests.rides.ride_world import captain, dispatch, make_area, new_ride

pytestmark = [pytest.mark.django_db(transaction=True), pytest.mark.usefixtures("ride_redis")]


def test_two_captains_accept_at_once_and_one_wins() -> None:
    area = make_area()
    ravi, arjun = captain(area, km=0.5), captain(area, km=1)
    ride = dispatch(new_ride(make_user("Priya Rider"), area))
    offers = {o.captain_id: o.id for o in RideOffer.objects.filter(ride=ride)}
    assert set(offers) == {ravi.id, arjun.id}

    start = threading.Barrier(2)
    results: dict[UUID, str] = {}

    def take(partner: PartnerProfile) -> None:
        try:
            start.wait()
            engine.accept_offer(partner=partner, offer_id=offers[partner.id])
            results[partner.id] = "won"
        except RideNoLongerAvailableError:
            results[partner.id] = "lost"
        finally:
            connection.close()

    threads = [threading.Thread(target=take, args=(p,)) for p in (ravi, arjun)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert sorted(results.values()) == ["lost", "won"]
    winner = next(pid for pid, outcome in results.items() if outcome == "won")
    ride = Ride.objects.get(pk=ride.pk)
    assert (ride.state, ride.captain_id) == (RideState.CAPTAIN_ASSIGNED, winner)
    assert RideOffer.objects.filter(ride=ride, status=RideOffer.Status.ACCEPTED).count() == 1
