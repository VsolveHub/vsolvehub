"""The Self Pickup address and its Google Maps link."""

from urllib.parse import parse_qs, urlparse

import pytest
from rest_framework import status

from apps.rental.pickup_address import maps_url, pickup_address_payload
from apps.rental.services import (
    RentalStateError,
    create_asset,
    moderate_asset,
    submit_asset,
    update_asset,
)


def _asset(world, **address):
    return create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title="Shamiana",
        daily_rate_paise=80_000,
        deposit_paise=0,
        **address,
    )


def _query(url: str) -> str:
    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "www.google.com"
    assert parsed.path == "/maps/search/"
    params = parse_qs(parsed.query)
    assert params["api"] == ["1"]
    return params["query"][0]


def test_address_is_stored_and_the_place_name_follows_it(rental_world):
    asset = _asset(
        rental_world,
        pickup_address_line="Plot 12, KPHB Colony",
        pickup_area="Kukatpally",
        pickup_city="Hyderabad",
        pickup_pincode="500072",
    )
    assert asset.pickup_address_line == "Plot 12, KPHB Colony"
    assert asset.location_text == "Kukatpally, Hyderabad"


def test_without_an_address_the_profile_location_is_used(rental_world):
    asset = _asset(rental_world)
    assert asset.pickup_address_line == "Madhapur, Hyderabad"
    assert asset.location_text == "Madhapur, Hyderabad"


@pytest.mark.parametrize("pincode", ["5000", "050007", "50007A", "5000721"])
def test_bad_pincode_is_refused(rental_world, pincode):
    with pytest.raises(RentalStateError) as refused:
        _asset(rental_world, pickup_address_line="Shop 1", pickup_pincode=pincode)
    assert refused.value.code == "pickup_pincode_invalid"


def test_editing_the_address_updates_the_place_name(rental_world):
    asset = _asset(rental_world, pickup_address_line="Shop 1", pickup_city="Hyderabad")
    updated = update_asset(
        asset=asset,
        partner=rental_world["partner"],
        pickup_area="Ameerpet",
        pickup_pincode="500016",
    )
    assert updated.location_text == "Ameerpet, Hyderabad"
    assert updated.pickup_pincode == "500016"


def test_an_explicit_place_name_is_kept_on_edit(rental_world):
    asset = _asset(rental_world, pickup_address_line="Shop 1", pickup_city="Hyderabad")
    updated = update_asset(
        asset=asset,
        partner=rental_world["partner"],
        pickup_area="Ameerpet",
        location_text="Near Ameerpet metro",
    )
    assert updated.location_text == "Near Ameerpet metro"


def test_maps_link_searches_the_full_address(rental_world):
    asset = _asset(
        rental_world,
        pickup_address_line="Plot 12, KPHB Colony",
        pickup_area="Kukatpally",
        pickup_city="Hyderabad",
        pickup_pincode="500072",
    )
    payload = pickup_address_payload(asset)
    assert payload["partner_name"] == "Owner Co"
    assert _query(payload["maps_url"]) == "Plot 12, KPHB Colony, Kukatpally, Hyderabad, 500072"


def test_maps_link_encodes_awkward_characters():
    url = maps_url(line="Shop #4 & 5, Sai Nagar", area="Kūkatpally", city="", pincode="")
    assert "#" not in url
    assert "&query" not in url.split("query=", 1)[1]
    assert _query(url) == "Shop #4 & 5, Sai Nagar, Kūkatpally"


def test_maps_link_is_empty_without_an_address():
    assert maps_url(line="", area=" ", city="", pincode="") == ""


def test_item_page_carries_the_address_and_link(rental_world, client):
    asset = _asset(
        rental_world,
        pickup_address_line="Plot 12, KPHB Colony",
        pickup_area="Kukatpally",
        pickup_city="Hyderabad",
        pickup_pincode="500072",
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok")
    page = client.get(f"/api/v1/rentals/{asset.slug}")
    assert page.status_code == status.HTTP_200_OK
    pickup = page.json()["pickup_address"]
    assert pickup["city"] == "Hyderabad"
    assert pickup["maps_url"].startswith("https://www.google.com/maps/search/?api=1&query=")
