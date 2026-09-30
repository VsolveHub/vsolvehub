"""A9 dual-mode stay: enquiry vs paid reservation (M3 freeze)."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.partners.models import PartnerCapability, PartnerProfile
from apps.stay.models import Property, StayEnquiry, StayReservation, Unit
from apps.stay.services import StayStateError, create_enquiry, create_reservation

User = get_user_model()

pytestmark = pytest.mark.django_db


def _seed_stay(*, booking_mode: str, slug: str) -> tuple[Property, Unit, PartnerProfile]:
    category, _ = Category.objects.get_or_create(
        slug="rooms-pg-hostel-hotels",
        defaults={"name": "Rooms / PG / Hostel / Hotels", "display_order": 90},
    )
    sub, _ = Subcategory.objects.get_or_create(
        category=category,
        slug=slug,
        defaults={"name": slug.replace("-", " ").title(), "display_order": 1},
    )
    service, _ = Service.objects.get_or_create(
        subcategory=sub,
        slug=f"{slug}-service",
        defaults={"name": f"{slug} service", "status": Service.Status.ACTIVE},
    )
    variant, _ = ServiceVariant.objects.get_or_create(
        service=service,
        code=f"A9_{slug.upper().replace('-', '_')}",
        defaults={
            "name": f"{slug} variant",
            "is_active": True,
            "booking_archetype": ServiceVariant.BookingArchetype.A9_STAY,
        },
    )
    A9VariantConfiguration.objects.filter(variant=variant, status="ACTIVE").update(
        status=A9VariantConfiguration.Status.RETIRED
    )
    A9VariantConfiguration.objects.create(
        variant=variant,
        version=A9VariantConfiguration.objects.filter(variant=variant).count() + 1,
        status=A9VariantConfiguration.Status.ACTIVE,
        booking_mode=booking_mode,
        property_schema={},
        enquiry_schema={},
    )
    host_user = User.objects.create_user(phone_number=f"+91991122{abs(hash(slug)) % 10000:04d}")
    partner, _ = PartnerProfile.objects.get_or_create(
        user=host_user,
        defaults={"display_name": f"Host {slug}"},
    )
    PartnerCapability.objects.get_or_create(
        partner=partner,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        variant=variant,
        defaults={
            "status": PartnerCapability.Status.APPROVED,
        },
    )
    prop = Property.objects.create(
        host=partner,
        variant=variant,
        title=f"{slug} property",
        location_text="Hyderabad",
        moderation_status=Property.ModerationStatus.APPROVED,
    )
    unit = Unit.objects.create(
        property=prop,
        name="Room 1",
        sharing_count=1,
        nightly_rate_paise=150000,
        is_active=True,
    )
    return prop, unit, partner


def test_enquiry_mode_rejects_reservation():
    prop, unit, _ = _seed_stay(booking_mode="ENQUIRY", slug="pg-accommodation")
    customer = User.objects.create_user(phone_number="+919900003301")
    check_in = date.today() + timedelta(days=7)
    check_out = check_in + timedelta(days=3)
    with pytest.raises(StayStateError, match="does not support reservations"):
        create_reservation(
            customer=customer,
            property_id=prop.id,
            unit_id=unit.id,
            check_in=check_in,
            check_out=check_out,
        )


def test_reservation_mode_rejects_enquiry():
    prop, unit, _ = _seed_stay(booking_mode="RESERVATION", slug="hotels")
    customer = User.objects.create_user(phone_number="+919900003302")
    check_in = date.today() + timedelta(days=7)
    check_out = check_in + timedelta(days=3)
    with pytest.raises(StayStateError, match="requires a reservation"):
        create_enquiry(
            customer=customer,
            property_id=prop.id,
            check_in=check_in,
            check_out=check_out,
            unit_id=unit.id,
        )


def test_reservation_creates_held_stay():
    prop, unit, _ = _seed_stay(booking_mode="RESERVATION", slug="short-stay")
    customer = User.objects.create_user(phone_number="+919900003303")
    check_in = date.today() + timedelta(days=7)
    check_out = check_in + timedelta(days=2)
    res = create_reservation(
        customer=customer,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_out,
    )
    assert res.status == StayReservation.Status.HELD
    assert res.nights == 2
    assert res.total_paise == 300000
    assert StayReservation.objects.filter(id=res.id).exists()


def test_enquiry_creates_submitted_row():
    prop, unit, _ = _seed_stay(booking_mode="ENQUIRY", slug="rooms")
    customer = User.objects.create_user(phone_number="+919900003304")
    check_in = date.today() + timedelta(days=7)
    check_out = check_in + timedelta(days=3)
    enquiry = create_enquiry(
        customer=customer,
        property_id=prop.id,
        check_in=check_in,
        check_out=check_out,
        unit_id=unit.id,
    )
    assert enquiry.status == StayEnquiry.Status.SUBMITTED
    assert enquiry.nights == 3
