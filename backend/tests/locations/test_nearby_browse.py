"""Browse "in this place, else nearby": `?lat=&lng=` on `/stays` and `/rentals`.

A searched point returns listings within 25 km, nearest first, with `distance_km`. A listing
with no pin is kept only when its text names the place, and sorts last. A stay's distance is
measured from its area pin, so it reveals nothing the guest cannot already see.
"""

from decimal import Decimal
from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.locations.nearby import NEARBY_RADIUS_KM, nearest_first
from apps.rental.models import RentalAsset
from apps.rental.services import create_asset, moderate_asset, submit_asset
from apps.stay.models import Property
from tests.rental.test_cancel_booking import LISTABLE_ASSET, rental_world  # noqa: F401
from tests.stay.test_host_status import _live_property
from tests.stay.test_property_units_min_stay import stay_world  # noqa: F401

pytestmark = pytest.mark.django_db

#: Kukatpally, Hyderabad.
KUKATPALLY = (17.4948, 78.3996)
#: About 1 km, 9 km and 60 km (Sangareddy) from it.
NEAR = (Decimal("17.503000"), Decimal("78.400000"))
MID = (Decimal("17.448500"), Decimal("78.330000"))
FAR = (Decimal("17.620000"), Decimal("77.950000"))


def _asset(
    world: dict[str, Any],
    *,
    title: str,
    pin: tuple[Decimal, Decimal] | None,
    location_text: str = "Hyderabad",
) -> RentalAsset:
    listable: dict[str, Any] = dict(LISTABLE_ASSET)
    asset = create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title=title,
        daily_rate_paise=50000,
        deposit_paise=100000,
        **listable,
    )
    submit_asset(asset=asset, partner=world["partner"])
    moderate_asset(asset=asset, actor=world["owner"], action="APPROVE", reason="ok")
    lat, lng = pin if pin is not None else (None, None)
    RentalAsset.objects.filter(id=asset.id).update(
        pickup_latitude=lat, pickup_longitude=lng, location_text=location_text
    )
    return asset


def _browse(path: str, point: tuple[float, float] = KUKATPALLY, **extra: Any) -> Any:
    query = {"lat": point[0], "lng": point[1], **extra}
    return APIClient().get(path, query)


# --- rentals ---------------------------------------------------------------------------------


def test_rentals_come_nearest_first_and_stop_at_the_radius(rental_world):  # noqa: F811
    mid = _asset(rental_world, title="Mid", pin=MID)
    near = _asset(rental_world, title="Near", pin=NEAR)
    _asset(rental_world, title="Far", pin=FAR)

    rows = _browse("/api/v1/rentals").json()

    assert [row["id"] for row in rows] == [str(near.id), str(mid.id)]
    assert rows[0]["distance_km"] < rows[1]["distance_km"] <= NEARBY_RADIUS_KM
    assert rows[0]["distance_km"] == pytest.approx(0.9, abs=0.3)


def test_nothing_nearby_is_an_empty_page_not_every_listing(rental_world):  # noqa: F811
    _asset(rental_world, title="Far", pin=FAR)

    assert _browse("/api/v1/rentals").json() == []


def test_an_unpinned_rental_is_kept_only_when_it_names_the_place(rental_world):  # noqa: F811
    pinned = _asset(rental_world, title="Pinned", pin=NEAR)
    named = _asset(rental_world, title="Named", pin=None, location_text="Kukatpally, Hyderabad")
    _asset(rental_world, title="Elsewhere", pin=None, location_text="Secunderabad")

    rows = _browse("/api/v1/rentals", location="Kukatpally").json()

    assert [row["id"] for row in rows] == [str(pinned.id), str(named.id)]
    assert rows[1]["distance_km"] is None


def test_without_a_point_rentals_are_newest_first_with_no_distance(rental_world):  # noqa: F811
    _asset(rental_world, title="Near", pin=NEAR)
    _asset(rental_world, title="Far", pin=FAR)

    rows = APIClient().get("/api/v1/rentals").json()

    assert len(rows) == 2
    assert {row["distance_km"] for row in rows} == {None}


def test_nearest_first_ends_in_id_so_offset_pages_are_stable() -> None:
    query = nearest_first(
        RentalAsset.objects.all(),
        KUKATPALLY,
        latitude="pickup_latitude",
        longitude="pickup_longitude",
    ).query
    assert query.order_by[-1] == "-id"


@pytest.mark.parametrize(
    "query",
    [{"lat": "17.49"}, {"lng": "78.39"}, {"lat": "95", "lng": "78.39"}, {"lat": "x", "lng": "1"}],
)
def test_a_half_or_bad_point_is_refused(query: dict[str, str]) -> None:
    response = APIClient().get("/api/v1/rentals", query)

    assert response.status_code == 400


# --- stays -----------------------------------------------------------------------------------


def _pinned_stay(world: dict[str, Any], *, title: str, pin: tuple[Decimal, Decimal]) -> Property:
    prop = _live_property(world)
    Property.objects.filter(id=prop.id).update(title=title, latitude=pin[0], longitude=pin[1])
    return prop


def test_stays_come_nearest_first(stay_world):  # noqa: F811
    mid = _pinned_stay(stay_world, title="Mid", pin=MID)
    near = _pinned_stay(stay_world, title="Near", pin=NEAR)
    _pinned_stay(stay_world, title="Far", pin=FAR)

    rows = _browse("/api/v1/stays").json()

    assert [row["id"] for row in rows] == [str(near.id), str(mid.id)]


def test_a_stays_distance_is_measured_from_its_area_pin(stay_world):  # noqa: F811
    # Two stays in the same ~1 km area square sit at the same distance: the guest cannot tell
    # the host's exact door from the number.
    _pinned_stay(stay_world, title="A", pin=(Decimal("17.501100"), Decimal("78.401100")))
    _pinned_stay(stay_world, title="B", pin=(Decimal("17.504400"), Decimal("78.404400")))

    rows = _browse("/api/v1/stays").json()

    assert rows[0]["distance_km"] == rows[1]["distance_km"]


def test_a_price_sort_still_applies_to_the_nearby_stays(stay_world):  # noqa: F811
    _pinned_stay(stay_world, title="Near", pin=NEAR)
    _pinned_stay(stay_world, title="Far", pin=FAR)

    rows = _browse("/api/v1/stays", sort="price_asc").json()

    assert [row["title"] for row in rows] == ["Near"]
