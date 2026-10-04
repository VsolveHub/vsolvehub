"""Owner's number after enquiring, numbered rooms with availability, and scheduled visits.

- After enquiring, the guest sees the owner's name and number to call.
- Guests see room *types*; the owner manages each numbered room under a type. Booking or
  switching off rooms lowers the type's available count, and a type (or property) with nothing
  available stops appearing to guests.
- Owners set non-overlapping weekly visiting slots per property. Several guests may pick the
  same slot. The owner accepts or declines (reason optional) and the guest is told.
"""

from datetime import date, time, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.notifications.models import NotificationIntent
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import Room, StayEnquiry, StayVisit, Unit
from apps.stay.serializers import StayEnquirySerializer, StayVisitSerializer
from apps.stay.services import (
    StayStateError,
    add_room,
    cancel_enquiry,
    confirm_enquiry,
    create_enquiry,
    create_property,
    create_unit,
    delete_room,
    host_stay_summary,
    mark_room_booked,
    public_properties,
    release_room,
    set_room_available,
    submit_property,
    update_unit,
)
from apps.stay.visits import (
    accept_visit,
    cancel_visit,
    decline_visit,
    expire_stale_visits,
    request_visit,
    set_visiting_hours,
    visit_availability,
)
from tests.helpers import force_role_client

User = get_user_model()

RENT = 850000
HOST_PHONE = "+919955550001"
TWO_ROOMS = 2
THREE_ROOMS = 3


@pytest.fixture
def world(db):  # noqa: ARG001
    category, _ = Category.objects.get_or_create(
        slug="rooms-pg-hostel-hotels", defaults={"name": "Stays"}
    )
    sub = Subcategory.objects.create(category=category, slug="rooms-visits", name="PG")
    service = Service.objects.create(
        subcategory=sub, slug="rooms-visits-svc", name="PG", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="rooms-visits-pg",
        name="PG",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A9VariantConfiguration.Status.ACTIVE,
        booking_mode=A9VariantConfiguration.BookingMode.ENQUIRY,
        price_period=A9VariantConfiguration.PricePeriod.MONTH,
    )
    host_user = User.objects.create(phone_number=HOST_PHONE, full_name="Sai Owner")
    host = PartnerProfile.objects.create(user=host_user, display_name="Sri Sai PG")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=host,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )
    guest = User.objects.create(phone_number="+919955550002", full_name="Priya Guest")
    other_guest = User.objects.create(phone_number="+919955550003", full_name="Ravi Guest")
    return {
        "variant": variant,
        "host": host,
        "host_user": host_user,
        "guest": guest,
        "other_guest": other_guest,
    }


def _live(world):
    """A live PG whose only room type is "Single" with rooms 101-103."""
    prop = create_property(
        host=world["host"],
        variant_id=world["variant"].id,
        title="Sri Sai PG",
        location_text="Madhapur, Hyderabad",
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    unit = create_unit(
        prop=prop,
        host=world["host"],
        name="Single",
        nightly_rate_paise=RENT,
        room_numbers=["101", "102", "103"],
    )
    submit_property(prop=prop, host=world["host"])
    prop.refresh_from_db()
    return prop, unit


def _room(unit: Unit, number: str) -> Room:
    return Room.objects.get(unit=unit, number=number)


def _client(user, role_code: str):
    role, _ = Role.objects.get_or_create(code=role_code, defaults={"name": role_code.title()})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code=role_code)


def _enquire(world, prop, guest_key: str = "guest") -> StayEnquiry:
    return create_enquiry(
        customer=world[guest_key],
        property_id=prop.id,
        check_in=timezone.localdate() + timedelta(days=7),
        length=3,
    )


# --- the owner's number, right after enquiring ----------------------------------------------


@pytest.mark.django_db
def test_enquiry_response_carries_the_owners_name_and_number(world):
    prop, _unit = _live(world)
    client = _client(world["guest"], "customer")

    response = client.post(
        "/api/v1/stays/enquire",
        {
            "property_id": str(prop.id),
            "check_in": str(timezone.localdate() + timedelta(days=7)),
            "length": 3,
        },
        format="json",
    )

    assert response.status_code == 201  # noqa: PLR2004
    assert response.data["host_name"] == "Sri Sai PG"
    assert response.data["host_phone"] == HOST_PHONE
    assert response.data["property_slug"] == prop.slug
    mine = client.get("/api/v1/me/stay-enquiries").data
    assert mine[0]["host_phone"] == HOST_PHONE


@pytest.mark.django_db
def test_owners_number_is_hidden_once_the_guest_withdraws(world):
    prop, _unit = _live(world)
    enquiry = _enquire(world, prop)

    cancel_enquiry(enquiry=enquiry, actor=world["guest"])
    enquiry.refresh_from_db()

    assert StayEnquirySerializer(enquiry).data["host_phone"] == ""


# --- numbered rooms -------------------------------------------------------------------------


@pytest.mark.django_db
def test_room_type_counts_follow_its_numbered_rooms(world):
    _prop, unit = _live(world)

    assert list(unit.rooms.order_by("number").values_list("number", flat=True)) == [
        "101",
        "102",
        "103",
    ]
    assert unit.quantity == THREE_ROOMS
    assert unit.available_count == THREE_ROOMS


@pytest.mark.django_db
def test_room_numbers_are_unique_within_a_property_ignoring_case(world):
    prop, unit = _live(world)
    add_room(unit=unit, host=world["host"], number="A1")

    with pytest.raises(StayStateError) as exc:
        add_room(unit=unit, host=world["host"], number="a1")
    assert exc.value.code == "room_number_taken"

    with pytest.raises(StayStateError) as other_type:
        create_unit(
            prop=prop,
            host=world["host"],
            name="Double",
            nightly_rate_paise=RENT,
            room_numbers=["101"],
        )
    assert other_type.value.code == "room_number_taken"


@pytest.mark.django_db
def test_booking_room_101_lowers_the_available_count_and_release_restores_it(world):
    _prop, unit = _live(world)
    room = _room(unit, "101")

    mark_room_booked(room=room, host=world["host"], occupant_name="Walk-in tenant")
    unit.refresh_from_db()
    room.refresh_from_db()

    assert room.status == Room.Status.BOOKED
    assert room.occupant_name == "Walk-in tenant"
    assert unit.available_count == TWO_ROOMS
    assert unit.quantity == THREE_ROOMS

    release_room(room=room, host=world["host"])
    unit.refresh_from_db()
    assert unit.available_count == THREE_ROOMS


@pytest.mark.django_db
def test_switching_a_room_off_hides_it_and_booked_rooms_cannot_be_switched(world):
    _prop, unit = _live(world)

    set_room_available(room=_room(unit, "102"), host=world["host"], available=False)
    unit.refresh_from_db()
    assert unit.available_count == TWO_ROOMS

    booked = mark_room_booked(room=_room(unit, "101"), host=world["host"])
    with pytest.raises(StayStateError) as exc:
        set_room_available(room=booked, host=world["host"], available=False)
    assert exc.value.code == "room_booked"


@pytest.mark.django_db
def test_a_fully_booked_property_leaves_guest_search_and_refuses_enquiries(world):
    prop, unit = _live(world)
    for number in ("101", "102", "103"):
        mark_room_booked(room=_room(unit, number), host=world["host"])
    unit.refresh_from_db()

    assert unit.is_active is False
    assert not public_properties().filter(id=prop.id).exists()

    release_room(room=_room(unit, "102"), host=world["host"])
    assert public_properties().filter(id=prop.id).exists()


@pytest.mark.django_db
def test_guests_cannot_enquire_about_a_booked_out_room_type(world):
    prop, unit = _live(world)
    create_unit(
        prop=prop, host=world["host"], name="Double", nightly_rate_paise=RENT, room_numbers=["201"]
    )
    for number in ("101", "102", "103"):
        mark_room_booked(room=_room(unit, number), host=world["host"])

    with pytest.raises(StayStateError) as exc:
        create_enquiry(
            customer=world["guest"],
            property_id=prop.id,
            unit_id=unit.id,
            check_in=timezone.localdate() + timedelta(days=7),
            length=3,
        )
    assert exc.value.code == "room_unavailable"


@pytest.mark.django_db
def test_mark_as_booked_from_an_enquiry_books_the_chosen_room(world):
    prop, unit = _live(world)
    enquiry = _enquire(world, prop)
    room = _room(unit, "103")

    confirm_enquiry(enquiry=enquiry, host=world["host"], room_id=room.id)
    room.refresh_from_db()
    unit.refresh_from_db()
    enquiry.refresh_from_db()

    assert enquiry.status == StayEnquiry.Status.CONFIRMED
    assert room.status == Room.Status.BOOKED
    assert room.booked_enquiry_id == enquiry.id
    assert room.occupant_name == "Priya Guest"
    assert unit.available_count == TWO_ROOMS
    assert NotificationIntent.objects.filter(template_code="stay_enquiry_confirmed").exists()


@pytest.mark.django_db
def test_a_booked_room_cannot_be_given_to_a_second_enquiry(world):
    prop, unit = _live(world)
    room = _room(unit, "101")
    confirm_enquiry(enquiry=_enquire(world, prop), host=world["host"], room_id=room.id)

    with pytest.raises(StayStateError) as exc:
        confirm_enquiry(
            enquiry=_enquire(world, prop, "other_guest"), host=world["host"], room_id=room.id
        )
    assert exc.value.code == "room_already_booked"


@pytest.mark.django_db
def test_cancelling_a_booked_enquiry_frees_its_room(world):
    prop, unit = _live(world)
    enquiry = _enquire(world, prop)
    room = _room(unit, "101")
    confirm_enquiry(enquiry=enquiry, host=world["host"], room_id=room.id)

    cancel_enquiry(enquiry=enquiry, actor=world["host"], as_host=True)
    room.refresh_from_db()
    unit.refresh_from_db()

    assert room.status == Room.Status.AVAILABLE
    assert room.booked_enquiry_id is None
    assert unit.available_count == THREE_ROOMS


@pytest.mark.django_db
def test_rooms_that_are_booked_or_last_cannot_be_removed(world):
    prop, unit = _live(world)
    booked = mark_room_booked(room=_room(unit, "101"), host=world["host"])
    with pytest.raises(StayStateError) as exc:
        delete_room(room=booked, host=world["host"])
    assert exc.value.code == "room_booked"

    single = create_unit(
        prop=prop, host=world["host"], name="Suite", nightly_rate_paise=RENT, room_numbers=["301"]
    )
    with pytest.raises(StayStateError) as last:
        delete_room(room=_room(single, "301"), host=world["host"])
    assert last.value.code == "last_room_of_type"

    delete_room(room=_room(unit, "102"), host=world["host"])
    unit.refresh_from_db()
    assert unit.quantity == TWO_ROOMS


@pytest.mark.django_db
def test_changing_the_count_adds_or_removes_free_rooms_only(world):
    _prop, unit = _live(world)
    for number in ("101", "102"):
        mark_room_booked(room=_room(unit, number), host=world["host"])

    with pytest.raises(StayStateError) as exc:
        update_unit(unit=unit, host=world["host"], quantity=1)
    assert exc.value.code == "quantity_below_booked"

    update_unit(unit=unit, host=world["host"], quantity=5)
    unit.refresh_from_db()
    assert unit.quantity == 5  # noqa: PLR2004
    assert unit.available_count == THREE_ROOMS


@pytest.mark.django_db
def test_owner_summary_counts_rooms_reviews_and_open_requests(world):
    prop, unit = _live(world)
    mark_room_booked(room=_room(unit, "101"), host=world["host"])
    set_room_available(room=_room(unit, "102"), host=world["host"], available=False)
    _enquire(world, prop)

    summary = host_stay_summary(host=world["host"])

    assert summary["total_properties"] == 1
    assert summary["total_rooms"] == THREE_ROOMS
    assert summary["available_rooms"] == 1
    assert summary["booked_rooms"] == 1
    assert summary["unavailable_rooms"] == 1
    assert summary["new_enquiries"] == 1
    assert summary["review_count"] == 0


# --- visiting hours -------------------------------------------------------------------------


def _visit_day(days_ahead: int = 3) -> date:
    return timezone.localdate() + timedelta(days=days_ahead)


def _hours(world, prop, *, day: date, blocked: list[date] | None = None):
    """Two slots on ``day``'s weekday: 10-11 AM and 5-6 PM."""
    set_visiting_hours(
        prop=prop,
        host=world["host"],
        visits_enabled=True,
        slots=[
            {"weekday": day.weekday(), "start_time": time(10), "end_time": time(11)},
            {"weekday": day.weekday(), "start_time": time(17), "end_time": time(18)},
        ],
        blocked_dates=blocked or [],
    )
    return list(prop.visit_slots.order_by("start_time"))


@pytest.mark.django_db
def test_overlapping_slots_on_the_same_day_are_refused(world):
    prop, _unit = _live(world)

    with pytest.raises(StayStateError) as exc:
        set_visiting_hours(
            prop=prop,
            host=world["host"],
            visits_enabled=True,
            slots=[
                {"weekday": 5, "start_time": time(10), "end_time": time(11)},
                {"weekday": 5, "start_time": time(10, 30), "end_time": time(11, 30)},
            ],
        )
    assert exc.value.code == "slots_overlap"

    # Back to back is fine, and the same hours on another day are fine.
    set_visiting_hours(
        prop=prop,
        host=world["host"],
        visits_enabled=True,
        slots=[
            {"weekday": 5, "start_time": time(10), "end_time": time(11)},
            {"weekday": 5, "start_time": time(11), "end_time": time(12)},
            {"weekday": 6, "start_time": time(10, 30), "end_time": time(11, 30)},
        ],
    )
    assert prop.visit_slots.count() == 3  # noqa: PLR2004


@pytest.mark.django_db
def test_unchanged_slots_keep_their_identity_when_hours_are_saved_again(world):
    prop, _unit = _live(world)
    day = _visit_day()
    morning, _evening = _hours(world, prop, day=day)

    set_visiting_hours(
        prop=prop,
        host=world["host"],
        visits_enabled=True,
        slots=[{"weekday": day.weekday(), "start_time": time(10), "end_time": time(11)}],
    )

    assert list(prop.visit_slots.values_list("id", flat=True)) == [morning.id]


@pytest.mark.django_db
def test_availability_lists_only_slot_days_and_skips_blocked_ones(world):
    prop, _unit = _live(world)
    day = _visit_day()
    _hours(world, prop, day=day, blocked=[day + timedelta(days=7)])

    days = visit_availability(prop=prop, days=14)

    offered = [row["date"] for row in days]
    assert day in offered
    assert day + timedelta(days=7) not in offered
    assert all(row["date"].weekday() == day.weekday() for row in days)
    assert len(days[0]["slots"]) == 2  # noqa: PLR2004


@pytest.mark.django_db
def test_property_page_offers_visits_only_with_slots(world):
    prop, _unit = _live(world)
    client = _client(world["guest"], "customer")
    assert client.get(f"/api/v1/stays/{prop.slug}").data["visits_offered"] is False

    _hours(world, prop, day=_visit_day())
    assert client.get(f"/api/v1/stays/{prop.slug}").data["visits_offered"] is True


# --- visit requests -------------------------------------------------------------------------


@pytest.mark.django_db
def test_two_guests_may_pick_the_same_slot_but_not_twice_the_same_day(world):
    prop, _unit = _live(world)
    day = _visit_day()
    _morning, evening = _hours(world, prop, day=day)

    first = request_visit(
        customer=world["guest"], property_id=prop.id, slot_id=evening.id, visit_date=day
    )
    second = request_visit(
        customer=world["other_guest"], property_id=prop.id, slot_id=evening.id, visit_date=day
    )

    assert first.start_time == time(17)
    assert second.status == StayVisit.Status.REQUESTED
    assert NotificationIntent.objects.filter(template_code="stay_visit_requested").count() == 2  # noqa: PLR2004
    with pytest.raises(StayStateError) as exc:
        request_visit(
            customer=world["guest"], property_id=prop.id, slot_id=evening.id, visit_date=day
        )
    assert exc.value.code == "duplicate_visit"


@pytest.mark.django_db
def test_visit_must_fall_on_an_offered_open_day(world):
    prop, _unit = _live(world)
    day = _visit_day()
    blocked = day + timedelta(days=7)
    morning, _evening = _hours(world, prop, day=day, blocked=[blocked])

    with pytest.raises(StayStateError) as wrong_day:
        request_visit(
            customer=world["guest"],
            property_id=prop.id,
            slot_id=morning.id,
            visit_date=day + timedelta(days=1),
        )
    assert wrong_day.value.code == "slot_unavailable"

    with pytest.raises(StayStateError) as closed:
        request_visit(
            customer=world["guest"], property_id=prop.id, slot_id=morning.id, visit_date=blocked
        )
    assert closed.value.code == "visit_date_blocked"

    set_visiting_hours(
        prop=prop,
        host=world["host"],
        visits_enabled=False,
        slots=[{"weekday": day.weekday(), "start_time": time(10), "end_time": time(11)}],
    )
    with pytest.raises(StayStateError) as off:
        request_visit(
            customer=world["guest"], property_id=prop.id, slot_id=morning.id, visit_date=day
        )
    assert off.value.code == "visits_off"


@pytest.mark.django_db
def test_accepting_a_visit_tells_the_guest_and_shows_the_owners_number(world):
    prop, _unit = _live(world)
    day = _visit_day()
    morning, _evening = _hours(world, prop, day=day)
    visit = request_visit(
        customer=world["guest"], property_id=prop.id, slot_id=morning.id, visit_date=day
    )
    assert StayVisitSerializer(visit).data["host_phone"] == ""

    visit = accept_visit(visit=visit, host=world["host"])

    assert visit.status == StayVisit.Status.ACCEPTED
    assert StayVisitSerializer(visit).data["host_phone"] == HOST_PHONE
    assert NotificationIntent.objects.filter(
        template_code="stay_visit_accepted", recipient_id=world["guest"].id
    ).exists()


@pytest.mark.django_db
def test_declined_visit_shows_a_reason_only_when_the_owner_chose_one(world):
    prop, _unit = _live(world)
    day = _visit_day()
    morning, evening = _hours(world, prop, day=day)
    quiet = request_visit(
        customer=world["guest"], property_id=prop.id, slot_id=morning.id, visit_date=day
    )
    with_reason = request_visit(
        customer=world["other_guest"], property_id=prop.id, slot_id=evening.id, visit_date=day
    )

    quiet = decline_visit(visit=quiet, host=world["host"])
    with_reason = decline_visit(
        visit=with_reason, host=world["host"], reason=StayVisit.DeclineReason.ALREADY_OCCUPIED
    )

    assert StayVisitSerializer(quiet).data["reason_text"] == ""
    assert StayVisitSerializer(with_reason).data["reason_text"] == "Already occupied"
    contexts = {
        intent.recipient_id: intent.context["reason_text"]
        for intent in NotificationIntent.objects.filter(template_code="stay_visit_declined")
    }
    assert contexts[world["guest"].id] == ""
    assert contexts[world["other_guest"].id] == " Reason: Already occupied."

    with pytest.raises(StayStateError) as exc:
        decline_visit(visit=quiet, host=world["host"])
    assert exc.value.code == "visit_closed"


@pytest.mark.django_db
def test_guest_can_cancel_and_the_owner_is_told(world):
    prop, _unit = _live(world)
    day = _visit_day()
    morning, _evening = _hours(world, prop, day=day)
    visit = request_visit(
        customer=world["guest"], property_id=prop.id, slot_id=morning.id, visit_date=day
    )

    visit = cancel_visit(visit=visit, customer=world["guest"])

    assert visit.status == StayVisit.Status.CANCELLED
    assert NotificationIntent.objects.filter(
        template_code="stay_visit_cancelled", recipient_id=world["host_user"].id
    ).exists()


@pytest.mark.django_db
def test_unanswered_requests_expire_once_their_time_is_over(world):
    prop, _unit = _live(world)
    past = timezone.localdate() - timedelta(days=1)
    stale = StayVisit.objects.create(
        property=prop,
        customer=world["guest"],
        visit_date=past,
        start_time=time(10),
        end_time=time(11),
    )
    answered = StayVisit.objects.create(
        property=prop,
        customer=world["other_guest"],
        visit_date=past,
        start_time=time(10),
        end_time=time(11),
        status=StayVisit.Status.ACCEPTED,
    )

    assert expire_stale_visits() == 1
    stale.refresh_from_db()
    answered.refresh_from_db()
    assert stale.status == StayVisit.Status.EXPIRED
    assert answered.status == StayVisit.Status.ACCEPTED


@pytest.mark.django_db
def test_mark_booked_after_a_visit_records_the_visitor(world):
    prop, unit = _live(world)
    day = _visit_day()
    morning, _evening = _hours(world, prop, day=day)
    visit = request_visit(
        customer=world["guest"], property_id=prop.id, slot_id=morning.id, visit_date=day
    )
    accept_visit(visit=visit, host=world["host"])

    room = mark_room_booked(room=_room(unit, "102"), host=world["host"], visit=visit)

    assert room.booked_visit_id == visit.id
    assert room.occupant_name == "Priya Guest"


# --- the API routes -------------------------------------------------------------------------


@pytest.mark.django_db
def test_owner_api_sets_hours_manages_rooms_and_answers_visits(world):
    prop, unit = _live(world)
    owner = _client(world["host_user"], "partner")
    day = _visit_day()

    hours = owner.put(
        f"/api/v1/partner/stays/properties/{prop.id}/visiting-hours",
        {
            "visits_enabled": True,
            "slots": [{"weekday": day.weekday(), "start_time": "17:00", "end_time": "18:00"}],
            "blocked_dates": [],
        },
        format="json",
    )
    assert hours.status_code == 200  # noqa: PLR2004
    assert len(hours.data["visit_slots"]) == 1

    room_id = _room(unit, "101").id
    booked = owner.post(
        f"/api/v1/partner/stays/rooms/{room_id}/book", {"occupant_name": "Anil"}, format="json"
    )
    assert booked.data["status"] == "BOOKED"
    off = owner.patch(
        f"/api/v1/partner/stays/rooms/{_room(unit, '102').id}", {"available": False}, format="json"
    )
    assert off.data["status"] == "UNAVAILABLE"
    added = owner.post(f"/api/v1/partner/stays/units/{unit.id}/rooms", {"number": "104"})
    assert added.status_code == 201  # noqa: PLR2004

    summary = owner.get("/api/v1/partner/stays/summary").data
    assert summary["booked_rooms"] == 1
    assert summary["available_rooms"] == TWO_ROOMS

    guest = _client(world["guest"], "customer")
    slots = guest.get(f"/api/v1/stays/{prop.id}/visit-slots").data
    created = guest.post(
        "/api/v1/stays/visits",
        {
            "property_id": str(prop.id),
            "slot_id": slots[0]["slots"][0]["id"],
            "visit_date": str(day),
        },
        format="json",
    )
    assert created.status_code == 201  # noqa: PLR2004

    declined = owner.post(
        f"/api/v1/partner/stays/visits/{created.data['id']}/decline",
        {"reason": "DATE_MISMATCH"},
        format="json",
    )
    assert declined.data["status"] == "DECLINED"
    mine = guest.get("/api/v1/me/stay-visits").data
    assert mine[0]["reason_text"] == "Date doesn't match"
