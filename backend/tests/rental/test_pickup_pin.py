"""The owner's map pin on a rental's pickup address.

Both or neither, enforced by the serializer and by the database; an edit that does not mention the
pin keeps it; and with a pin the customer's "View Location" opens that exact point.
"""

from decimal import Decimal
from http import HTTPStatus

import pytest
from django.db import IntegrityError, transaction

from apps.rental.models import RentalAsset
from apps.rental.pickup_address import maps_url
from apps.rental.services import create_asset, moderate_asset, submit_asset, update_asset
from tests.rental.conftest import role_client

PICKUP = {
    "pickup_address_line": "Plot 12, KPHB Colony",
    "pickup_area": "Kukatpally",
    "pickup_city": "Hyderabad",
    "pickup_pincode": "500072",
}
PIN = (Decimal("17.494812"), Decimal("78.399574"))
ASSETS = "/api/v1/partner/rentals/assets"


def _asset(world, **extra):
    return create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title="Shamiana",
        daily_rate_paise=80_000,
        deposit_paise=0,
        **PICKUP,
        **extra,
    )


def _create_body(world, **extra):
    return {
        "variant_id": str(world["variant"].id),
        "title": "Shamiana",
        "daily_rate_paise": 80_000,
        "deposit_paise": 0,
        "image_urls": ["https://storage.vsolve.in/shamiana.jpg"],
        **PICKUP,
        **extra,
    }


def _owner(world):
    return role_client(world["owner"], "partner")


@pytest.fixture(autouse=True)
def _photos_are_the_owners(monkeypatch):
    # Photo ownership has its own tests; these are about the pin.
    monkeypatch.setattr("apps.rental.views.partner_owns_rental_photo", lambda **_: True)


def test_create_stores_the_pin(rental_world):
    response = _owner(rental_world).post(
        ASSETS,
        _create_body(rental_world, pickup_latitude="17.494812", pickup_longitude="78.399574"),
        format="json",
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    asset = RentalAsset.objects.get(id=response.json()["id"])
    assert (asset.pickup_latitude, asset.pickup_longitude) == PIN
    assert response.json()["pickup_latitude"] == "17.494812"
    assert response.json()["pickup_address"]["latitude"] == "17.494812"


def test_create_without_a_pin_is_still_allowed(rental_world):
    response = _owner(rental_world).post(ASSETS, _create_body(rental_world), format="json")

    assert response.status_code == HTTPStatus.CREATED, response.json()
    asset = RentalAsset.objects.get(id=response.json()["id"])
    assert asset.pickup_latitude is None
    assert asset.pickup_longitude is None


@pytest.mark.parametrize(
    "half",
    [
        {"pickup_latitude": "17.494812"},
        {"pickup_longitude": "78.399574"},
        {"pickup_latitude": "17.494812", "pickup_longitude": None},
    ],
)
def test_half_a_pin_is_refused(rental_world, half):
    response = _owner(rental_world).post(ASSETS, _create_body(rental_world, **half), format="json")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "pin_incomplete" in str(response.json()["error"]["details"])
    assert not RentalAsset.objects.exists()


@pytest.mark.parametrize(
    "pin",
    [
        {"pickup_latitude": "90.000001", "pickup_longitude": "78.399574"},
        {"pickup_latitude": "17.494812", "pickup_longitude": "-180.5"},
    ],
)
def test_out_of_range_coordinates_are_refused(rental_world, pin):
    response = _owner(rental_world).post(ASSETS, _create_body(rental_world, **pin), format="json")

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_an_edit_that_does_not_mention_the_pin_keeps_it(rental_world):
    asset = _asset(rental_world, pickup_pin=PIN)

    response = _owner(rental_world).patch(
        f"{ASSETS}/{asset.id}", {"pickup_address_line": "Plot 14, KPHB Colony"}, format="json"
    )

    assert response.status_code == HTTPStatus.OK, response.json()
    asset.refresh_from_db()
    # A typo fix in the address is not a move: the pin stays, as a Customer's address does.
    assert (asset.pickup_latitude, asset.pickup_longitude) == PIN
    assert asset.pickup_address_line == "Plot 14, KPHB Colony"


def test_an_edit_moves_the_pin(rental_world):
    asset = _asset(rental_world, pickup_pin=PIN)

    response = _owner(rental_world).patch(
        f"{ASSETS}/{asset.id}",
        {"pickup_latitude": "17.440000", "pickup_longitude": "78.380000"},
        format="json",
    )

    assert response.status_code == HTTPStatus.OK, response.json()
    asset.refresh_from_db()
    assert (asset.pickup_latitude, asset.pickup_longitude) == (
        Decimal("17.440000"),
        Decimal("78.380000"),
    )


def test_two_nulls_clear_the_pin(rental_world):
    asset = _asset(rental_world, pickup_pin=PIN)

    response = _owner(rental_world).patch(
        f"{ASSETS}/{asset.id}",
        {"pickup_latitude": None, "pickup_longitude": None},
        format="json",
    )

    assert response.status_code == HTTPStatus.OK, response.json()
    asset.refresh_from_db()
    assert asset.pickup_latitude is None
    assert asset.pickup_longitude is None


def test_the_service_keeps_the_pin_unless_told(rental_world):
    asset = _asset(rental_world, pickup_pin=PIN)

    update_asset(asset=asset, partner=rental_world["partner"], pickup_area="Ameerpet")

    asset.refresh_from_db()
    assert (asset.pickup_latitude, asset.pickup_longitude) == PIN


def test_the_database_refuses_half_a_pin(rental_world):
    asset = _asset(rental_world)

    with pytest.raises(IntegrityError), transaction.atomic():
        RentalAsset.objects.filter(id=asset.id).update(pickup_latitude=PIN[0])


def test_view_location_opens_the_pin_when_there_is_one():
    assert maps_url(
        line="Plot 12",
        area="Kukatpally",
        city="Hyderabad",
        pincode="500072",
        latitude=PIN[0],
        longitude=PIN[1],
    ) == ("https://www.google.com/maps/search/?api=1&query=17.494812,78.399574")


def test_view_location_still_searches_the_text_without_a_pin():
    url = maps_url(line="Plot 12", area="Kukatpally", city="Hyderabad", pincode="500072")

    assert url.startswith("https://www.google.com/maps/search/?api=1&query=Plot%2012")


def test_the_item_page_carries_the_pin(rental_world, client):
    asset = _asset(rental_world, pickup_pin=PIN)
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok")

    page = client.get(f"/api/v1/rentals/{asset.slug}")

    assert page.status_code == HTTPStatus.OK
    pickup = page.json()["pickup_address"]
    assert (pickup["latitude"], pickup["longitude"]) == ("17.494812", "78.399574")
    assert pickup["maps_url"].endswith("query=17.494812,78.399574")
