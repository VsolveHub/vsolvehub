"""Photos for each room type, shown to guests on that room's card."""

import pytest
from rest_framework import status

from apps.stay import services
from apps.stay.models import UnitMedia
from apps.stay.services import (
    MAX_UNIT_PHOTOS,
    StayStateError,
    add_unit_media,
    create_unit,
    public_properties,
    remove_unit_media,
)
from tests.stay.test_publish_review_rules import _partner_client, _property
from tests.stay.test_publish_review_rules import (  # noqa: F401 — registers the `world` fixture
    world as _world_fixture,
)

ROOM_PHOTO = "https://cdn.example.com/rooms/deluxe.jpg"


@pytest.fixture
def uploaded(monkeypatch):
    """Treat every URL as a photo this partner uploaded through the stay photo upload."""
    monkeypatch.setattr(services, "partner_owns_stay_photo", lambda **_: True)


@pytest.mark.django_db
def test_room_type_created_with_its_photos(world, uploaded):  # noqa: ARG001
    prop = _property(world, "enquiry")

    unit = create_unit(
        prop=prop,
        host=world["host"],
        name="Deluxe room",
        nightly_rate_paise=888800,
        image_urls=[ROOM_PHOTO, ROOM_PHOTO + "?2"],
    )

    assert list(unit.media.values_list("url", flat=True)) == [ROOM_PHOTO, ROOM_PHOTO + "?2"]


@pytest.mark.django_db
def test_pasted_link_cannot_be_a_room_photo(world):
    prop = _property(world, "enquiry")
    unit = prop.units.get()

    with pytest.raises(StayStateError) as exc:
        add_unit_media(unit=unit, host=world["host"], url="https://elsewhere.example/x.jpg")

    assert exc.value.code == "photo_not_uploaded"


@pytest.mark.django_db
def test_room_type_photo_limit(world, uploaded):  # noqa: ARG001
    unit = _property(world, "enquiry").units.get()
    for i in range(MAX_UNIT_PHOTOS):
        add_unit_media(unit=unit, host=world["host"], url=f"{ROOM_PHOTO}?{i}")

    with pytest.raises(StayStateError) as exc:
        add_unit_media(unit=unit, host=world["host"], url=ROOM_PHOTO)

    assert exc.value.code == "too_many_photos"


@pytest.mark.django_db
def test_remove_room_photo(world, uploaded):  # noqa: ARG001
    unit = _property(world, "enquiry").units.get()
    photo = add_unit_media(unit=unit, host=world["host"], url=ROOM_PHOTO)

    remove_unit_media(unit=unit, host=world["host"], media_id=photo.id)

    assert not UnitMedia.objects.filter(id=photo.id).exists()


@pytest.mark.django_db
def test_partner_adds_and_removes_room_photos_over_http(world, uploaded):  # noqa: ARG001
    unit = _property(world, "enquiry").units.get()
    client = _partner_client(world["host_user"])

    added = client.post(
        f"/api/v1/partner/stays/units/{unit.id}/media", {"url": ROOM_PHOTO}, format="json"
    )
    assert added.status_code == status.HTTP_201_CREATED, added.data

    listed = client.get("/api/v1/partner/stays/properties").data
    media = listed[0]["units"][0]["media"]
    assert [m["url"] for m in media] == [ROOM_PHOTO]

    gone = client.delete(f"/api/v1/partner/stays/units/{unit.id}/media/{added.data['id']}")
    assert gone.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.django_db
def test_guests_see_room_photos(world, uploaded):  # noqa: ARG001
    prop = _property(world, "enquiry")
    services.submit_property(prop=prop, host=world["host"])
    unit = prop.units.get()
    add_unit_media(unit=unit, host=world["host"], url=ROOM_PHOTO)

    live = public_properties().get(id=prop.id)

    assert [m.url for m in live.units.all()[0].media.all()] == [ROOM_PHOTO]


# --- room photos replace building photos as the requirement --------------------------------


@pytest.mark.django_db
def test_property_with_only_a_room_photo_can_publish(world, uploaded):  # noqa: ARG001
    prop = services.create_property(
        host=world["host"],
        variant_id=world["enquiry"].id,
        title="Rooms only",
        location_text="Madhapur",
        nightly_rate_paise=90000,
    )
    add_unit_media(unit=prop.units.get(), host=world["host"], url=ROOM_PHOTO)

    services.submit_property(prop=prop, host=world["host"])

    prop.refresh_from_db()
    assert prop.public_state == "PUBLISHED"


@pytest.mark.django_db
def test_live_property_may_drop_its_building_photo_when_rooms_have_photos(world, uploaded):  # noqa: ARG001
    prop = _property(world, "enquiry")
    add_unit_media(unit=prop.units.get(), host=world["host"], url=ROOM_PHOTO)
    services.submit_property(prop=prop, host=world["host"])
    cover = prop.media.get()

    services.remove_property_media(prop=prop, host=world["host"], media_id=cover.id)

    assert not prop.media.exists()


@pytest.mark.django_db
def test_property_can_be_created_without_building_photos(world):
    client = _partner_client(world["host_user"])

    response = client.post(
        "/api/v1/partner/stays/properties",
        {
            "variant_id": str(world["enquiry"].id),
            "title": "No building photos",
            "location_text": "Madhapur",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED, response.data
