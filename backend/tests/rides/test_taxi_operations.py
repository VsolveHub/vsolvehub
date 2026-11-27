"""Taxi for Operations: rental and outstation rate cards (Taxi brief §4.4, §7)."""

from collections.abc import Callable

import pytest

from apps.rides.models import TAXI_RATE_FIELDS, RideRateCard
from apps.rides.services import update_rate_card
from tests.rides.helpers import make_user
from tests.rides.parcel_world import served_area
from tests.rides.taxi_world import outstation_card, rental_card

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("build", [rental_card, outstation_card])
def test_a_price_edit_keeps_the_rental_and_round_trip_prices(
    build: Callable[..., RideRateCard],
) -> None:
    """Regression: the new version used to drop them, and the database refused it (500)."""
    old = build(served_area(), "SUV")

    new = update_rate_card(
        card=old, updated_by=make_user("Ops"), rates={"per_km_paise": 1300}, deactivate=False
    )

    assert (new.version, new.per_km_paise, new.is_active) == (2, 1300, True)
    assert {name: getattr(new, name) for name in TAXI_RATE_FIELDS} == {
        name: getattr(old, name) for name in TAXI_RATE_FIELDS
    }
    assert not RideRateCard.objects.get(pk=old.pk).is_active
