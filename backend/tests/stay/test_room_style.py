"""One number per room, chosen by how the stay type lets its rooms.

A hotel room is taken whole, so the host says how many guests it fits and "sharing" stays 1.
A PG room is let by the bed, so the host says how many people share it and that is also the
most one enquiry can bring. A type not in either list keeps both numbers as the host gave them.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.services import (
    ROOM_STYLE_MIXED,
    ROOM_STYLE_PRIVATE,
    ROOM_STYLE_SHARED,
    create_property,
    create_unit,
    update_unit,
)
from tests.helpers import force_role_client

User = get_user_model()

RATE = 150000
FAMILY_GUESTS = 4
DOUBLE_SHARING = 2
TRIPLE_SHARING = 3


def _variant(category: Category, sub_slug: str) -> ServiceVariant:
    sub = Subcategory.objects.create(category=category, slug=sub_slug, name=sub_slug.title())
    service = Service.objects.create(
        subcategory=sub, slug=f"{sub_slug}-svc", name=sub_slug, status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code=f"{sub_slug}-stay",
        name=f"{sub_slug} stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant, version=1, status=A9VariantConfiguration.Status.ACTIVE
    )
    return variant


@pytest.fixture
def world(db):  # noqa: ARG001 — requests database access for the fixture
    category = Category.objects.create(slug="room-style-test", name="Room style test")
    variants = {
        "hotel": _variant(category, "hotels"),
        "pg": _variant(category, "pg-accommodation"),
        "other": _variant(category, "something-new"),
    }
    host_user = User.objects.create(phone_number="+919944440001", full_name="Style Host")
    host = PartnerProfile.objects.create(user=host_user, display_name="Style Host")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    for variant in variants.values():
        PartnerCapability.objects.create(
            partner=host,
            variant=variant,
            archetype=ServiceVariant.BookingArchetype.A9_STAY,
            status=PartnerCapability.Status.APPROVED,
        )
    return {"variants": variants, "host": host, "host_user": host_user}


def _property(world, kind: str, **kwargs):
    return create_property(
        host=world["host"],
        variant_id=world["variants"][kind].id,
        title=f"{kind} property",
        location_text="Madhapur",
        **kwargs,
    )


@pytest.mark.django_db
def test_hotel_room_keeps_guests_and_drops_sharing(world):
    prop = _property(world, "hotel")
    room = create_unit(
        prop=prop,
        host=world["host"],
        name="Family room",
        nightly_rate_paise=RATE,
        sharing_count=TRIPLE_SHARING,
        max_guests=FAMILY_GUESTS,
    )
    assert (room.sharing_count, room.max_guests) == (1, FAMILY_GUESTS)

    edited = update_unit(unit=room, host=world["host"], sharing_count=DOUBLE_SHARING)
    edited.refresh_from_db()
    assert (edited.sharing_count, edited.max_guests) == (1, FAMILY_GUESTS)


@pytest.mark.django_db
def test_hotel_seeded_room_fits_the_guests_it_was_given(world):
    # The one-step create passes a head count as ``sharing_count``; for a hotel that is guests.
    prop = _property(world, "hotel", nightly_rate_paise=RATE, sharing_count=DOUBLE_SHARING)
    room = prop.units.get()
    assert (room.sharing_count, room.max_guests) == (1, DOUBLE_SHARING)


@pytest.mark.django_db
def test_pg_room_guests_follow_the_sharing(world):
    prop = _property(world, "pg")
    room = create_unit(
        prop=prop,
        host=world["host"],
        name="Triple sharing",
        nightly_rate_paise=RATE,
        sharing_count=TRIPLE_SHARING,
        max_guests=1,
    )
    assert (room.sharing_count, room.max_guests) == (TRIPLE_SHARING, TRIPLE_SHARING)

    edited = update_unit(unit=room, host=world["host"], sharing_count=DOUBLE_SHARING)
    edited.refresh_from_db()
    assert (edited.sharing_count, edited.max_guests) == (DOUBLE_SHARING, DOUBLE_SHARING)


@pytest.mark.django_db
def test_unlisted_type_keeps_both_numbers(world):
    prop = _property(world, "other")
    room = create_unit(
        prop=prop,
        host=world["host"],
        name="Room",
        nightly_rate_paise=RATE,
        sharing_count=DOUBLE_SHARING,
        max_guests=FAMILY_GUESTS,
    )
    assert (room.sharing_count, room.max_guests) == (DOUBLE_SHARING, FAMILY_GUESTS)


@pytest.mark.django_db
def test_partner_api_reports_room_style_and_applies_it(world):
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=world["host_user"], role=role, revoked_at=None)
    client = force_role_client(user=world["host_user"], role_code="partner")
    hotel = _property(world, "hotel")
    pg = _property(world, "pg")
    other = _property(world, "other")

    created = client.post(
        f"/api/v1/partner/stays/properties/{hotel.id}/units",
        {"name": "Deluxe", "nightly_rate_paise": RATE, "max_guests": DOUBLE_SHARING},
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED
    assert (created.data["sharing_count"], created.data["max_guests"]) == (1, DOUBLE_SHARING)

    listed = client.get("/api/v1/partner/stays/properties")
    assert listed.status_code == status.HTTP_200_OK
    styles = {row["id"]: row["room_style"] for row in listed.data}
    assert styles[str(hotel.id)] == ROOM_STYLE_PRIVATE
    assert styles[str(pg.id)] == ROOM_STYLE_SHARED
    assert styles[str(other.id)] == ROOM_STYLE_MIXED
