"""Regression tests for the Stay partner-flow audit.

Each block names the audit finding it pins down.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from freezegun import freeze_time
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.capabilities import request_capability
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import Property, StayEnquiry, StayReservation, UnitReservation
from apps.stay.services import (
    StayStateError,
    calculate_stay_quote,
    check_in_reservation,
    confirm_enquiry,
    create_enquiry,
    create_property,
    create_reservation,
    create_unit,
    get_stay_taxonomy,
    host_cancel_reservation,
    mark_no_show,
    public_properties,
    set_property_listing,
    split_stay_schema,
    submit_property,
    upcoming_booking_count,
    update_unit,
)
from tests.helpers import force_role_client

User = get_user_model()

PG_SCHEMA = {
    "type": "object",
    "required": ["gender", "food", "ac", "sharing"],
    "properties": {
        "gender": {"type": "string", "enum": ["Gents", "Ladies", "Unisex"]},
        "food": {"type": "string", "enum": ["Food included", "Without food"]},
        "ac": {"type": "string", "enum": ["AC", "Non AC"]},
        "sharing": {"type": "string", "enum": ["Single", "Double"]},
    },
}


def _variant(service: Service, code: str, mode: str, schema: dict | None = None) -> ServiceVariant:
    variant = ServiceVariant.objects.create(
        service=service,
        code=code,
        name=code,
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A9VariantConfiguration.Status.ACTIVE,
        booking_mode=mode,
        price_period=A9VariantConfiguration.PricePeriod.NIGHT,
        property_schema=schema or {},
    )
    return variant


@pytest.fixture
def world(db):  # noqa: ARG001
    category, _ = Category.objects.get_or_create(
        slug="rooms-pg-hostel-hotels", defaults={"name": "Stays"}
    )
    sub = Subcategory.objects.create(category=category, slug="audit-pg", name="PG")
    service = Service.objects.create(
        subcategory=sub, slug="audit-pg-svc", name="PG", status=Service.Status.ACTIVE
    )
    enquiry = _variant(service, "audit-pg", A9VariantConfiguration.BookingMode.ENQUIRY)
    paid = _variant(service, "audit-hotel", A9VariantConfiguration.BookingMode.RESERVATION)
    schema_pg = _variant(service, "audit-pg-schema", "ENQUIRY", PG_SCHEMA)

    host_user = User.objects.create(phone_number="+919955550001", full_name="Audit Host")
    host = PartnerProfile.objects.create(user=host_user, display_name="Audit Host Stays")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    capability = PartnerCapability.objects.create(
        partner=host,
        variant=enquiry,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )
    # A host with a reviewed paid property publishes paid properties directly (Option A).
    PartnerProfile.objects.filter(id=host.id).update(paid_stays_trusted_at=timezone.now())
    host.refresh_from_db()
    guest = User.objects.create(phone_number="+919955550002", full_name="Audit Guest")
    return {
        "enquiry": enquiry,
        "paid": paid,
        "schema_pg": schema_pg,
        "host": host,
        "host_user": host_user,
        "capability": capability,
        "guest": guest,
    }


def _live(world, variant_key="enquiry", *, title="Audit stay", rate=100000, **room):
    prop = create_property(
        host=world["host"],
        variant_id=world[variant_key].id,
        title=title,
        location_text="Madhapur, Hyderabad",
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    create_unit(
        prop=prop,
        host=world["host"],
        name=room.pop("name", "Standard room"),
        nightly_rate_paise=rate,
        **room,
    )
    submit_property(prop=prop, host=world["host"])
    prop.refresh_from_db()
    assert prop.public_state == "PUBLISHED"
    return prop


def _dates(offset: int = 5, nights: int = 2):
    check_in = timezone.localdate() + timedelta(days=offset)
    return check_in, check_in + timedelta(days=nights)


def _ids(qs) -> set:
    return {p.id for p in qs}


# --- P0-1: a would-be host can ask for stay permission -----------------------------------------


@pytest.mark.django_db
def test_stay_capability_can_be_requested(world):
    newcomer = PartnerProfile.objects.create(
        user=User.objects.create(phone_number="+919955550009", full_name="New Host"),
        display_name="New Host",
    )

    capability = request_capability(partner=newcomer, variant=world["enquiry"])

    assert capability.status == PartnerCapability.Status.REQUESTED
    assert capability.archetype == ServiceVariant.BookingArchetype.A9_STAY


# --- P0-2 / section 6: pause, resume, archive, restore ------------------------------------------


@pytest.mark.django_db
def test_pause_hides_property_and_stops_new_enquiries(world):
    prop = _live(world)
    check_in, check_out = _dates()

    set_property_listing(prop=prop, host=world["host"], action="pause")

    assert prop.id not in _ids(public_properties())
    with pytest.raises(StayStateError):
        create_enquiry(
            customer=world["guest"], property_id=prop.id, check_in=check_in, check_out=check_out
        )
    resumed = set_property_listing(prop=prop, host=world["host"], action="resume")
    assert resumed.public_state == "PUBLISHED"
    assert prop.id in _ids(public_properties())


@pytest.mark.django_db
def test_paused_property_keeps_its_existing_bookings(world):
    prop = _live(world)
    check_in, check_out = _dates()
    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=check_in, check_out=check_out
    )
    confirm_enquiry(enquiry=enquiry, host=world["host"])

    set_property_listing(prop=prop, host=world["host"], action="pause")

    enquiry.refresh_from_db()
    assert enquiry.status == StayEnquiry.Status.CONFIRMED


@pytest.mark.django_db
def test_archive_refused_while_bookings_are_ahead_then_allowed(world):
    prop = _live(world)
    check_in, check_out = _dates()
    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=check_in, check_out=check_out
    )
    confirm_enquiry(enquiry=enquiry, host=world["host"])

    with pytest.raises(StayStateError) as exc:
        set_property_listing(prop=prop, host=world["host"], action="archive")
    assert exc.value.code == "has_upcoming_bookings"

    with freeze_time((check_out + timedelta(days=1)).isoformat()):
        archived = set_property_listing(prop=prop, host=world["host"], action="archive")
    assert archived.listing_status == Property.ListingStatus.ARCHIVED
    assert Property.objects.filter(id=prop.id).exists()


@pytest.mark.django_db
def test_restored_property_comes_back_paused(world):
    prop = _live(world)
    set_property_listing(prop=prop, host=world["host"], action="archive")

    restored = set_property_listing(prop=prop, host=world["host"], action="restore")

    assert restored.listing_status == Property.ListingStatus.PAUSED
    assert prop.id not in _ids(public_properties())


@pytest.mark.django_db
def test_suspended_host_disappears_from_search(world):
    prop = _live(world)
    PartnerCapability.objects.filter(id=world["capability"].id).update(
        status=PartnerCapability.Status.SUSPENDED
    )

    assert prop.id not in _ids(public_properties())


@pytest.mark.django_db
def test_partner_listing_actions_over_http(world):
    prop = _live(world)
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=world["host_user"], role=role, revoked_at=None)
    client = force_role_client(user=world["host_user"], role_code="partner")

    paused = client.post(f"/api/v1/partner/stays/properties/{prop.id}/pause")

    assert paused.status_code == status.HTTP_200_OK
    assert paused.data["listing_status"] == "PAUSED"
    assert APIClient().get(f"/api/v1/stays/{prop.id}").status_code == status.HTTP_404_NOT_FOUND


# --- P0-3 / P1-11: several rooms of one type, and confirmed enquiries count ---------------------


@pytest.mark.django_db
def test_booked_enquiries_do_not_block_new_ones(world):
    """Stays are arranged by phone: the host decides, the calendar does not refuse guests."""
    prop = _live(world, quantity=1)
    check_in, check_out = _dates()
    first = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=check_in, check_out=check_out
    )
    confirm_enquiry(enquiry=first, host=world["host"])
    other = User.objects.create(phone_number="+919955550003", full_name="Guest Two")

    second = create_enquiry(
        customer=other, property_id=prop.id, check_in=check_in, check_out=check_out
    )
    confirm_enquiry(enquiry=second, host=world["host"])

    second.refresh_from_db()
    assert second.status == StayEnquiry.Status.CONFIRMED


@pytest.mark.django_db
def test_back_to_back_stays_do_not_block_each_other(world):
    prop = _live(world, quantity=1)
    check_in, check_out = _dates(nights=2)
    first = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=check_in, check_out=check_out
    )
    confirm_enquiry(enquiry=first, host=world["host"])
    later_guest = User.objects.create(phone_number="+919955550005", full_name="Later Guest")

    following = create_enquiry(
        customer=later_guest,
        property_id=prop.id,
        check_in=check_out,
        check_out=check_out + timedelta(days=2),
    )

    assert following.status == StayEnquiry.Status.SUBMITTED


@pytest.mark.django_db
def test_host_hides_a_full_room_type_by_marking_it_full(world):
    prop = _live(world)
    create_unit(prop=prop, host=world["host"], name="Deluxe", nightly_rate_paise=150000)
    standard = prop.units.get(name="Standard room")

    update_unit(unit=standard, host=world["host"], is_active=False)

    detail = APIClient().get(f"/api/v1/stays/{prop.id}")
    assert [room["name"] for room in detail.data["units"]] == ["Deluxe"]


# --- P0-4: guest count ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_guest_count_cannot_exceed_room_capacity(world):
    prop = _live(world, max_guests=2)
    check_in, check_out = _dates()

    with pytest.raises(StayStateError) as exc:
        create_enquiry(
            customer=world["guest"],
            property_id=prop.id,
            check_in=check_in,
            check_out=check_out,
            guest_count=3,
        )
    assert exc.value.code == "too_many_guests"


@pytest.mark.django_db
def test_reservation_guest_count_is_checked(world):
    prop = _live(world, "paid", max_guests=1)
    check_in, check_out = _dates()

    with pytest.raises(StayStateError) as exc:
        create_reservation(
            customer=world["guest"],
            property_id=prop.id,
            unit_id=prop.units.get().id,
            check_in=check_in,
            check_out=check_out,
            guest_count=2,
        )
    assert exc.value.code == "too_many_guests"


# --- P0-8 / P1-12: no ₹0 quotes, no silent room guess --------------------------------------------


@pytest.mark.django_db
def test_guest_must_choose_when_there_are_several_room_types(world):
    prop = _live(world)
    create_unit(prop=prop, host=world["host"], name="Deluxe", nightly_rate_paise=250000)
    check_in, check_out = _dates()

    with pytest.raises(StayStateError) as exc:
        calculate_stay_quote(property_id=prop.id, check_in=check_in, check_out=check_out)
    assert exc.value.code == "room_required"


@pytest.mark.django_db
def test_inactive_room_cannot_be_quoted(world):
    prop = _live(world)
    spare = create_unit(prop=prop, host=world["host"], name="Spare", nightly_rate_paise=90000)
    update_unit(unit=spare, host=world["host"], is_active=False)
    check_in, check_out = _dates()

    with pytest.raises(StayStateError) as exc:
        calculate_stay_quote(
            property_id=prop.id, check_in=check_in, check_out=check_out, unit_id=spare.id
        )
    assert exc.value.code == "room_unavailable"


@pytest.mark.django_db
def test_single_room_type_is_quoted_at_its_price(world):
    prop = _live(world, rate=120000)
    check_in, check_out = _dates(nights=3)

    quote = calculate_stay_quote(property_id=prop.id, check_in=check_in, check_out=check_out)

    assert quote["total_quote_paise"] == 3 * 120000
    assert quote["unit_id"] == prop.units.get().id


@pytest.mark.django_db
def test_guests_never_see_inactive_rooms(world):
    prop = _live(world)
    spare = create_unit(prop=prop, host=world["host"], name="Closed wing", nightly_rate_paise=1)
    update_unit(unit=spare, host=world["host"], is_active=False)

    detail = APIClient().get(f"/api/v1/stays/{prop.id}")

    assert detail.status_code == status.HTTP_200_OK
    assert [room["name"] for room in detail.data["units"]] == ["Standard room"]


# --- P0-5 / P0-6 / P1-13: room facts, AC/food filters, same-room filters -------------------------


@pytest.mark.django_db
def test_ac_filter_ignores_titles(world):
    palace = _live(world, title="Palace View Rooms")

    assert palace.id not in _ids(public_properties(has_ac=True))


@pytest.mark.django_db
def test_ac_filter_matches_a_room_with_ac(world):
    prop = _live(world, "schema_pg", attributes={"ac": "AC"})
    non_ac = _live(world, "schema_pg", title="Non AC PG", attributes={"ac": "Non AC"})

    found = _ids(public_properties(has_ac=True))

    assert prop.id in found
    assert non_ac.id not in found


@pytest.mark.django_db
def test_food_filter_matches_the_stored_answer(world):
    prop = create_property(
        host=world["host"],
        variant_id=world["schema_pg"].id,
        title="Home food PG",
        location_text="Kondapur",
        structured_fields={"gender": "Unisex", "food": "Food included"},
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    create_unit(prop=prop, host=world["host"], name="Single", nightly_rate_paise=80000)
    submit_property(prop=prop, host=world["host"])
    without = _live(world, title="Just rooms")

    found = _ids(public_properties(food_included=True))

    assert prop.id in found
    assert without.id not in found


@pytest.mark.django_db
def test_room_filters_apply_to_the_same_room(world):
    prop = _live(world, name="Double", rate=200000, sharing_count=2)
    create_unit(prop=prop, host=world["host"], name="Single", nightly_rate_paise=50000)

    found = _ids(public_properties(sharing_count=2, max_price_paise=100000))

    assert prop.id not in found
    assert prop.id in _ids(public_properties(sharing_count=2, max_price_paise=250000))


@pytest.mark.django_db
def test_room_level_questions_move_off_the_property():
    property_schema, room_schema, suggestions = split_stay_schema(PG_SCHEMA)

    assert set(property_schema["properties"]) == {"gender", "food"}
    assert property_schema["required"] == ["gender", "food"]
    assert set(room_schema["properties"]) == {"ac"}
    assert suggestions == ["Single", "Double"]


@pytest.mark.django_db
@pytest.mark.usefixtures("world")
def test_taxonomy_publishes_room_questions_separately():
    variants = [
        variant
        for sub in get_stay_taxonomy()
        for svc in sub["services"]
        for variant in svc["variants"]
        if variant["code"] == "audit-pg-schema"
    ]

    assert "ac" not in variants[0]["property_schema"]["properties"]
    assert "ac" in variants[0]["room_schema"]["properties"]


@pytest.mark.django_db
def test_property_can_be_created_without_room_level_answers(world):
    prop = create_property(
        host=world["host"],
        variant_id=world["schema_pg"].id,
        title="No room answers on property",
        location_text="Kondapur",
        structured_fields={"gender": "Gents", "food": "Without food"},
    )

    assert prop.structured_fields == {"gender": "Gents", "food": "Without food"}


@pytest.mark.django_db
def test_room_answers_are_validated(world):
    prop = _live(world, "schema_pg")

    with pytest.raises(StayStateError):
        create_unit(
            prop=prop,
            host=world["host"],
            name="Odd room",
            nightly_rate_paise=90000,
            attributes={"ac": "Maybe"},
        )


@pytest.mark.django_db
def test_room_count_and_guests_must_be_positive(world):
    prop = _live(world)

    with pytest.raises(StayStateError) as exc:
        update_unit(unit=prop.units.get(), host=world["host"], quantity=0)
    assert exc.value.code == "quantity_invalid"


# --- P1-15: the host's booking controls ----------------------------------------------------------


def _paid_confirmed(world, *, offset: int = 5):
    prop = _live(world, "paid")
    check_in, check_out = _dates(offset=offset)
    res = create_reservation(
        customer=world["guest"],
        property_id=prop.id,
        unit_id=prop.units.get().id,
        check_in=check_in,
        check_out=check_out,
    )
    StayReservation.objects.filter(id=res.id).update(status=StayReservation.Status.CONFIRMED)
    UnitReservation.objects.filter(id=res.unit_reservation_id).update(
        status=UnitReservation.Status.CONFIRMED
    )
    res.refresh_from_db()
    return res


@pytest.mark.django_db
def test_guest_cannot_be_checked_in_before_the_check_in_date(world):
    res = _paid_confirmed(world)

    with pytest.raises(StayStateError) as exc:
        check_in_reservation(reservation=res, host=world["host"])
    assert exc.value.code == "check_in_too_early"

    with freeze_time(res.check_in.isoformat()):
        checked_in = check_in_reservation(reservation=res, host=world["host"])
    assert checked_in.status == StayReservation.Status.CHECKED_IN


@pytest.mark.django_db
def test_no_show_frees_the_room_from_the_check_in_date(world):
    res = _paid_confirmed(world)

    with pytest.raises(StayStateError):
        mark_no_show(reservation=res, host=world["host"])

    with freeze_time(res.check_in.isoformat()):
        marked = mark_no_show(reservation=res, host=world["host"])
    assert marked.status == StayReservation.Status.NO_SHOW
    hold = UnitReservation.objects.get(id=res.unit_reservation_id)
    assert hold.status == UnitReservation.Status.RELEASED


@pytest.mark.django_db
def test_host_cancel_needs_a_reason_and_releases_the_room(world):
    prop = _live(world, "paid")
    check_in, check_out = _dates()
    res = create_reservation(
        customer=world["guest"],
        property_id=prop.id,
        unit_id=prop.units.get().id,
        check_in=check_in,
        check_out=check_out,
    )

    with pytest.raises(StayStateError) as exc:
        host_cancel_reservation(reservation=res, host=world["host"], reason="  ")
    assert exc.value.code == "reason_required"

    cancelled = host_cancel_reservation(reservation=res, host=world["host"], reason="Flooding")

    assert cancelled.status == StayReservation.Status.CANCELLED
    assert "Flooding" in cancelled.cancellation_reason
    hold = UnitReservation.objects.get(id=res.unit_reservation_id)
    assert hold.status == UnitReservation.Status.RELEASED


# --- P1-16: the host sees bookings before deactivating a room ------------------------------------


@pytest.mark.django_db
def test_partner_room_shows_upcoming_bookings(world):
    prop = _live(world)
    room = prop.units.get()
    check_in, check_out = _dates()
    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=check_in, check_out=check_out
    )
    confirm_enquiry(enquiry=enquiry, host=world["host"])

    assert upcoming_booking_count(unit=room) == 1
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=world["host_user"], role=role, revoked_at=None)
    client = force_role_client(user=world["host_user"], role_code="partner")
    rooms = client.get(f"/api/v1/partner/stays/properties/{prop.id}/units").data
    assert rooms[0]["upcoming_booking_count"] == 1
