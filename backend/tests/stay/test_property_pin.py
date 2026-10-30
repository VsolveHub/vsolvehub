"""The host's map pin on a stay property.

The host sets it and sees it exactly. Guests only ever see it rounded to an area: the public
listing names the area and city, never the building, and a precise pin would undo that.
"""

from decimal import Decimal
from http import HTTPStatus

import pytest
from django.db import IntegrityError, transaction

from apps.stay.models import Property
from apps.stay.serializers import PartnerPropertySerializer, PropertySerializer
from apps.stay.services import create_property, update_property_ad
from tests.stay.test_property_units_min_stay import _partner_client, stay_world  # noqa: F401

PROPERTIES = "/api/v1/partner/stays/properties"
PIN = (Decimal("17.448312"), Decimal("78.391489"))

pytestmark = pytest.mark.django_db


def _property(world, **extra):
    return create_property(
        host=world["host"],
        variant_id=world["variant"].id,
        title="Lakeview PG",
        location_text="Madhapur, Hyderabad",
        **extra,
    )


def _create_body(world, **extra):
    return {
        "variant_id": str(world["variant"].id),
        "title": "Lakeview PG",
        "location_text": "Madhapur, Hyderabad",
        **extra,
    }


def test_create_stores_the_pin_and_the_host_sees_it_exactly(stay_world):  # noqa: F811
    client = _partner_client(stay_world["host_user"])

    response = client.post(
        PROPERTIES,
        _create_body(stay_world, latitude="17.448312", longitude="78.391489"),
        format="json",
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    prop = Property.objects.get(id=response.json()["id"])
    assert (prop.latitude, prop.longitude) == PIN
    assert (response.json()["latitude"], response.json()["longitude"]) == (
        "17.448312",
        "78.391489",
    )


def test_create_without_a_pin_is_still_allowed(stay_world):  # noqa: F811
    client = _partner_client(stay_world["host_user"])

    response = client.post(PROPERTIES, _create_body(stay_world), format="json")

    assert response.status_code == HTTPStatus.CREATED, response.json()
    prop = Property.objects.get(id=response.json()["id"])
    assert prop.latitude is None
    assert prop.longitude is None


def test_half_a_pin_is_refused(stay_world):  # noqa: F811
    client = _partner_client(stay_world["host_user"])

    response = client.post(PROPERTIES, _create_body(stay_world, latitude="17.4"), format="json")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "pin_incomplete" in str(response.json()["error"]["details"])
    assert not Property.objects.exists()


def test_guests_see_only_the_area(stay_world):  # noqa: F811
    prop = _property(stay_world, pin=PIN)

    guest_view = PropertySerializer(prop).data

    assert (guest_view["area_latitude"], guest_view["area_longitude"]) == ("17.45", "78.39")
    # The exact pin is not in the guest's payload under any name.
    assert "latitude" not in guest_view
    assert "longitude" not in guest_view
    assert "17.448312" not in str(guest_view)


def test_guests_see_no_area_when_the_host_has_not_pinned(stay_world):  # noqa: F811
    guest_view = PropertySerializer(_property(stay_world)).data

    assert guest_view["area_latitude"] is None
    assert guest_view["area_longitude"] is None


def test_the_host_view_has_both(stay_world):  # noqa: F811
    host_view = PartnerPropertySerializer(_property(stay_world, pin=PIN)).data

    assert (host_view["latitude"], host_view["longitude"]) == ("17.448312", "78.391489")
    assert host_view["area_latitude"] == "17.45"


def test_an_edit_that_does_not_mention_the_pin_keeps_it(stay_world):  # noqa: F811
    prop = _property(stay_world, pin=PIN)
    client = _partner_client(stay_world["host_user"])

    response = client.patch(f"{PROPERTIES}/{prop.id}", {"title": "Lakeview PG II"}, format="json")

    assert response.status_code == HTTPStatus.OK, response.json()
    prop.refresh_from_db()
    assert (prop.latitude, prop.longitude) == PIN


def test_an_edit_moves_or_clears_the_pin(stay_world):  # noqa: F811
    prop = _property(stay_world, pin=PIN)

    update_property_ad(prop=prop, host=stay_world["host"], pin=(Decimal("17.5"), Decimal("78.4")))
    prop.refresh_from_db()
    assert (prop.latitude, prop.longitude) == (Decimal("17.5"), Decimal("78.4"))

    update_property_ad(prop=prop, host=stay_world["host"], pin=None)
    prop.refresh_from_db()
    assert prop.latitude is None
    assert prop.longitude is None


def test_the_database_refuses_half_a_pin(stay_world):  # noqa: F811
    prop = _property(stay_world)

    with pytest.raises(IntegrityError), transaction.atomic():
        Property.objects.filter(id=prop.id).update(longitude=PIN[1])
