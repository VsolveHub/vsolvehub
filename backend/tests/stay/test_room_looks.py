"""Looks inside a room type: rooms that share photos, one guest card per look.

"1 BHK" rooms 101-103 share one set of photos and 104-105 another ("With balcony"). Guests see
two cards, "1 BHK" and "1 BHK · With balcony", with the same price and no room numbers.
"""

import pytest
from rest_framework import status

from apps.stay import services
from apps.stay.models import Room, RoomLook, StayEnquiry, Unit, UnitMedia
from apps.stay.serializers import UnitSerializer
from apps.stay.services import (
    StayStateError,
    add_room,
    add_unit_media,
    create_look,
    create_unit,
    delete_look,
    first_look,
    look_display_name,
    move_room,
    rename_look,
    set_room_available,
)
from tests.stay.test_publish_review_rules import _partner_client, _property
from tests.stay.test_publish_review_rules import (  # noqa: F401 — registers the `world` fixture
    world as _world_fixture,
)

PHOTO = "https://cdn.example.com/rooms/standard.jpg"
BALCONY = "https://cdn.example.com/rooms/balcony.jpg"


@pytest.fixture
def uploaded(monkeypatch):
    """Treat every URL as a photo this partner uploaded through the stay photo upload."""
    monkeypatch.setattr(services, "partner_owns_stay_photo", lambda **_: True)


@pytest.fixture
def bhk(world, uploaded):  # noqa: ARG001
    """1 BHK: 101-103 in the main look, 104-105 in "With balcony"."""
    prop = _property(world, "enquiry")
    unit = create_unit(
        prop=prop,
        host=world["host"],
        name="1 BHK",
        nightly_rate_paise=1_800_000,
        room_numbers=["101", "102", "103"],
        image_urls=[PHOTO],
    )
    balcony = create_look(unit=unit, host=world["host"], name="With balcony", image_urls=[BALCONY])
    add_room(unit=unit, host=world["host"], number="104", look_id=balcony.id)
    add_room(unit=unit, host=world["host"], number="105", look_id=balcony.id)
    return {"prop": prop, "unit": unit, "main": first_look(unit), "balcony": balcony}


def _looks(unit: Unit) -> list[dict]:
    unit = Unit.objects.prefetch_related("looks__media", "rooms").get(id=unit.id)
    return UnitSerializer(unit).data["looks"]


# --- the model ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_a_new_room_type_has_one_unnamed_look_with_its_rooms_and_photos(world, uploaded):  # noqa: ARG001
    unit = create_unit(
        prop=_property(world, "enquiry"),
        host=world["host"],
        name="Deluxe",
        nightly_rate_paise=500_000,
        room_numbers=["201", "202"],
        image_urls=[PHOTO],
    )
    look = RoomLook.objects.get(unit=unit)
    assert look.name == ""
    assert set(Room.objects.filter(unit=unit).values_list("look_id", flat=True)) == {look.id}
    assert list(UnitMedia.objects.filter(unit=unit).values_list("look_id", flat=True)) == [look.id]


@pytest.mark.django_db
def test_each_look_keeps_its_own_rooms_and_photos(bhk):
    rooms = dict(Room.objects.filter(unit=bhk["unit"]).values_list("number", "look_id"))
    assert {n for n, look in rooms.items() if look == bhk["main"].id} == {"101", "102", "103"}
    assert {n for n, look in rooms.items() if look == bhk["balcony"].id} == {"104", "105"}
    assert list(bhk["balcony"].media.values_list("url", flat=True)) == [BALCONY]


@pytest.mark.django_db
def test_card_titles(bhk):
    assert look_display_name(unit=bhk["unit"], look=bhk["main"]) == "1 BHK"
    assert look_display_name(unit=bhk["unit"], look=bhk["balcony"]) == "1 BHK · With balcony"


# --- naming ---------------------------------------------------------------------------------


@pytest.mark.django_db
def test_a_second_look_must_be_named(bhk, world):
    with pytest.raises(StayStateError) as refused:
        create_look(unit=bhk["unit"], host=world["host"], name="   ")
    assert refused.value.code == "look_name_required"


@pytest.mark.django_db
def test_a_non_first_look_cannot_be_renamed_to_blank(bhk, world):
    with pytest.raises(StayStateError) as refused:
        rename_look(look=bhk["balcony"], host=world["host"], name="")
    assert refused.value.code == "look_name_required"
    # The first look may stay unnamed.
    assert rename_look(look=bhk["main"], host=world["host"], name="").name == ""


@pytest.mark.django_db
def test_look_names_are_unique_within_a_type(bhk, world):
    with pytest.raises(StayStateError) as refused:
        create_look(unit=bhk["unit"], host=world["host"], name="with  BALCONY")
    assert refused.value.code == "look_name_taken"


# --- adding and moving rooms ----------------------------------------------------------------


@pytest.mark.django_db
def test_add_room_reusing_a_look(bhk, world):
    room = add_room(unit=bhk["unit"], host=world["host"], number="106", look_id=bhk["balcony"].id)
    assert room.look_id == bhk["balcony"].id
    assert RoomLook.objects.filter(unit=bhk["unit"]).count() == 2


@pytest.mark.django_db
def test_add_room_with_a_new_look_and_photos(bhk, world):
    room = add_room(
        unit=bhk["unit"],
        host=world["host"],
        number="107",
        new_look_name="Corner room",
        new_look_image_urls=[PHOTO + "?corner"],
    )
    look = room.look
    assert look.name == "Corner room"
    assert look.display_order == 2
    assert list(look.media.values_list("url", flat=True)) == [PHOTO + "?corner"]


@pytest.mark.django_db
def test_add_room_without_a_look_joins_the_first(bhk, world):
    room = add_room(unit=bhk["unit"], host=world["host"], number="108")
    assert room.look_id == bhk["main"].id


@pytest.mark.django_db
def test_a_look_of_another_type_is_refused(bhk, world, uploaded):  # noqa: ARG001
    other = create_unit(
        prop=bhk["prop"], host=world["host"], name="2 BHK", nightly_rate_paise=2_500_000
    )
    with pytest.raises(StayStateError) as refused:
        add_room(unit=other, host=world["host"], number="301", look_id=bhk["balcony"].id)
    assert refused.value.code == "look_mismatch"
    room = Room.objects.get(unit=bhk["unit"], number="101")
    with pytest.raises(StayStateError):
        move_room(room=room, host=world["host"], look_id=first_look(other).id)


@pytest.mark.django_db
def test_move_room_keeps_its_status(bhk, world):
    room = Room.objects.get(unit=bhk["unit"], number="103")
    set_room_available(room=room, host=world["host"], available=False)
    moved = move_room(room=room, host=world["host"], look_id=bhk["balcony"].id)
    assert moved.look_id == bhk["balcony"].id
    assert moved.status == Room.Status.UNAVAILABLE


# --- removing looks -------------------------------------------------------------------------


@pytest.mark.django_db
def test_a_look_with_rooms_cannot_be_removed(bhk, world):
    with pytest.raises(StayStateError) as refused:
        delete_look(look=bhk["balcony"], host=world["host"])
    assert refused.value.code == "look_has_rooms"


@pytest.mark.django_db
def test_an_empty_look_is_removed_with_its_photos(bhk, world):
    for number in ("104", "105"):
        move_room(
            room=Room.objects.get(unit=bhk["unit"], number=number),
            host=world["host"],
            look_id=bhk["main"].id,
        )
    delete_look(look=bhk["balcony"], host=world["host"])
    assert not RoomLook.objects.filter(id=bhk["balcony"].id).exists()
    assert not UnitMedia.objects.filter(url=BALCONY).exists()


@pytest.mark.django_db
def test_the_last_look_cannot_be_removed(world, uploaded):  # noqa: ARG001
    unit = _property(world, "enquiry").units.get()
    look = first_look(unit)
    Room.objects.filter(unit=unit).delete()
    with pytest.raises(StayStateError) as refused:
        delete_look(look=look, host=world["host"])
    assert refused.value.code == "last_look_of_type"


# --- what guests see ------------------------------------------------------------------------


@pytest.mark.django_db
def test_guest_payload_has_one_entry_per_look_with_its_counts(bhk, world):
    set_room_available(
        room=Room.objects.get(unit=bhk["unit"], number="103"), host=world["host"], available=False
    )
    looks = _looks(bhk["unit"])
    assert [lk["display_name"] for lk in looks] == ["1 BHK", "1 BHK · With balcony"]
    assert [lk["available_count"] for lk in looks] == [2, 2]
    assert [lk["room_count"] for lk in looks] == [3, 2]
    assert [[m["url"] for m in lk["media"]] for lk in looks] == [[PHOTO], [BALCONY]]


@pytest.mark.django_db
def test_no_room_number_in_the_guest_payload(bhk):
    data = UnitSerializer(Unit.objects.get(id=bhk["unit"].id)).data
    assert "rooms" not in data
    for look in data["looks"]:
        assert "number" not in look
        assert "rooms" not in look


@pytest.mark.django_db
def test_a_type_saved_before_looks_gets_one_when_needed(world, uploaded):  # noqa: ARG001
    prop = _property(world, "enquiry", with_room=False)
    unit = Unit.objects.create(property=prop, name="Old type", nightly_rate_paise=100_000)
    assert not RoomLook.objects.filter(unit=unit).exists()
    photo = add_unit_media(unit=unit, host=world["host"], url=PHOTO)
    assert photo.look_id == first_look(unit).id
    assert RoomLook.objects.filter(unit=unit).count() == 1


# --- enquiries ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_enquiry_records_the_chosen_look(bhk, world, django_user_model):
    services.submit_property(prop=bhk["prop"], host=world["host"])
    guest = django_user_model.objects.create(phone_number="+919811100077", full_name="Guest")
    enquiry = services.create_enquiry(
        customer=guest,
        property_id=bhk["prop"].id,
        unit_id=bhk["unit"].id,
        look_id=bhk["balcony"].id,
        check_in=services.timezone.localdate() + services.timedelta(days=3),
        length=1,
    )
    assert StayEnquiry.objects.get(id=enquiry.id).look_id == bhk["balcony"].id
    from apps.stay.serializers import StayEnquirySerializer  # noqa: PLC0415

    assert StayEnquirySerializer(enquiry).data["unit_name"] == "1 BHK · With balcony"


@pytest.mark.django_db
def test_enquiry_refuses_a_look_from_another_room_type(bhk, world, uploaded):  # noqa: ARG001
    other = create_unit(
        prop=bhk["prop"], host=world["host"], name="2 BHK", nightly_rate_paise=2_500_000
    )
    with pytest.raises(StayStateError) as refused:
        services.resolve_look(unit=other, look_id=bhk["balcony"].id)
    assert refused.value.code == "look_mismatch"


# --- over HTTP ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_partner_manages_looks_over_http(bhk, world):
    client = _partner_client(world["host_user"])
    unit = bhk["unit"]

    created = client.post(
        f"/api/v1/partner/stays/units/{unit.id}/looks",
        {"name": "Garden view", "image_urls": [PHOTO + "?garden"]},
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED, created.data
    look_id = created.data["id"]
    assert created.data["display_name"] == "1 BHK · Garden view"

    room = client.post(
        f"/api/v1/partner/stays/units/{unit.id}/rooms",
        {"number": "109", "look_id": look_id},
        format="json",
    )
    assert room.status_code == status.HTTP_201_CREATED, room.data
    assert str(room.data["look"]) == look_id

    renamed = client.patch(
        f"/api/v1/partner/stays/looks/{look_id}", {"name": "Garden-facing"}, format="json"
    )
    assert renamed.status_code == status.HTTP_200_OK
    assert renamed.data["name"] == "Garden-facing"

    blank = client.patch(f"/api/v1/partner/stays/looks/{look_id}", {"name": ""}, format="json")
    assert blank.status_code == status.HTTP_400_BAD_REQUEST
    assert blank.json()["error"]["code"] == "look_name_required"

    listed = client.get("/api/v1/partner/stays/properties").data
    names = [lk["display_name"] for lk in listed[0]["units"][-1]["looks"]]
    assert "1 BHK · Garden-facing" in names


@pytest.mark.django_db
def test_add_room_with_new_look_over_http(bhk, world):
    client = _partner_client(world["host_user"])
    response = client.post(
        f"/api/v1/partner/stays/units/{bhk['unit'].id}/rooms",
        {"number": "110", "new_look": {"name": "Corner room", "image_urls": [PHOTO]}},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.data
    assert RoomLook.objects.get(id=response.data["look"]).name == "Corner room"
