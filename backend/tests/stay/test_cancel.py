"""Focused A9 customer cancel: enquiry + pre-check-in reservation."""

from datetime import date, timedelta

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
from apps.commerce.models import PaymentAttempt
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerCapability, PartnerProfile
from apps.stay.models import Property, StayEnquiry, StayReservation, Unit, UnitReservation
from apps.stay.services import (
    StayStateError,
    cancel_enquiry,
    cancel_reservation,
    check_in_reservation,
    confirm_reservation_payment,
    create_enquiry,
    create_reservation,
    initiate_reservation_payment,
)
from tests.helpers import force_role_client

User = get_user_model()

pytestmark = pytest.mark.django_db


def _role_client(user, role_code: str):
    role, _ = Role.objects.get_or_create(code=role_code, defaults={"name": role_code.title()})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code=role_code)


def _seed(*, booking_mode: str, slug: str) -> tuple[Property, Unit, PartnerProfile, object]:
    category, _ = Category.objects.get_or_create(
        slug="rooms-pg-cancel",
        defaults={"name": "Rooms Cancel", "display_order": 91},
    )
    sub, _ = Subcategory.objects.get_or_create(
        category=category,
        slug=slug,
        defaults={"name": slug.replace("-", " ").title(), "display_order": 1},
    )
    service, _ = Service.objects.get_or_create(
        subcategory=sub,
        slug=f"{slug}-svc",
        defaults={"name": f"{slug} service", "status": Service.Status.ACTIVE},
    )
    variant, _ = ServiceVariant.objects.get_or_create(
        service=service,
        code=f"A9_CANCEL_{slug.upper().replace('-', '_')}",
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
    host_user = User.objects.create_user(phone_number=f"+91993344{abs(hash(slug)) % 10000:04d}")
    partner, _ = PartnerProfile.objects.get_or_create(
        user=host_user,
        defaults={"display_name": f"Host {slug}"},
    )
    PartnerCapability.objects.get_or_create(
        partner=partner,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        variant=variant,
        defaults={"status": PartnerCapability.Status.APPROVED},
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
        nightly_rate_paise=200000,
        is_active=True,
    )
    customer = User.objects.create_user(phone_number=f"+91995566{abs(hash(slug)) % 10000:04d}")
    return prop, unit, partner, customer


def test_cancel_enquiry_http():
    prop, _unit, _partner, customer = _seed(
        booking_mode=A9VariantConfiguration.BookingMode.ENQUIRY, slug="enq-cancel"
    )
    check_in = date.today() + timedelta(days=3)
    enquiry = create_enquiry(
        customer=customer,
        property_id=prop.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=2),
    )
    client = _role_client(customer, "customer")
    response = client.post(f"/api/v1/me/stay-enquiries/{enquiry.id}/cancel")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == StayEnquiry.Status.CANCELLED


def test_cancel_reservation_pre_checkin_and_refund():
    prop, unit, partner, customer = _seed(
        booking_mode=A9VariantConfiguration.BookingMode.RESERVATION, slug="res-cancel"
    )
    check_in = date.today() + timedelta(days=5)
    res = create_reservation(
        customer=customer,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=2),
    )
    initiate_reservation_payment(res.id)
    res.refresh_from_db()
    attempt = res.payment_attempt
    assert attempt is not None
    attempt.status = PaymentAttempt.Status.CAPTURED
    attempt.save(update_fields=("status", "updated_at"))
    confirm_reservation_payment(attempt.id)
    res.refresh_from_db()
    assert res.status == StayReservation.Status.CONFIRMED

    cancelled = cancel_reservation(reservation=res, customer=customer, reason="plans changed")
    assert cancelled.status == StayReservation.Status.CANCELLED
    unit_res = UnitReservation.objects.get(id=cancelled.unit_reservation_id)
    assert unit_res.status == UnitReservation.Status.RELEASED
    assert attempt.refunds.exists()


def test_cancel_reservation_fail_closed_after_checkin():
    prop, unit, partner, customer = _seed(
        booking_mode=A9VariantConfiguration.BookingMode.RESERVATION, slug="res-ci"
    )
    check_in = date.today() + timedelta(days=7)
    res = create_reservation(
        customer=customer,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=1),
    )
    # Skip payment: force CONFIRMED so check-in can proceed in isolation.
    res.status = StayReservation.Status.CONFIRMED
    res.save(update_fields=("status", "updated_at"))
    unit_res = res.unit_reservation
    unit_res.status = UnitReservation.Status.CONFIRMED
    unit_res.save(update_fields=("status", "updated_at"))
    check_in_reservation(reservation=res, host=partner)
    res.refresh_from_db()
    with pytest.raises(StayStateError, match="after check-in"):
        cancel_reservation(reservation=res, customer=customer)


def test_cancel_reservation_http():
    prop, unit, _partner, customer = _seed(
        booking_mode=A9VariantConfiguration.BookingMode.RESERVATION, slug="res-http"
    )
    check_in = date.today() + timedelta(days=9)
    res = create_reservation(
        customer=customer,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=1),
    )
    client = _role_client(customer, "customer")
    response = client.post(f"/api/v1/me/stay-reservations/{res.id}/cancel")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == StayReservation.Status.CANCELLED


def test_partner_cancel_enquiry_http():
    prop, _unit, partner, customer = _seed(
        booking_mode=A9VariantConfiguration.BookingMode.ENQUIRY, slug="host-cancel"
    )
    check_in = date.today() + timedelta(days=4)
    enquiry = create_enquiry(
        customer=customer,
        property_id=prop.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=2),
    )
    client = _role_client(partner.user, "partner")
    response = client.post(f"/api/v1/partner/stays/enquiries/{enquiry.id}/cancel")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == StayEnquiry.Status.CANCELLED


def test_cancel_enquiry_service_idempotent_closed():
    prop, _unit, _partner, customer = _seed(
        booking_mode=A9VariantConfiguration.BookingMode.ENQUIRY, slug="enq-closed"
    )
    check_in = date.today() + timedelta(days=2)
    enquiry = create_enquiry(
        customer=customer,
        property_id=prop.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=1),
    )
    cancel_enquiry(enquiry=enquiry, actor=customer)
    enquiry.refresh_from_db()
    with pytest.raises(StayStateError, match="already closed"):
        cancel_enquiry(enquiry=enquiry, actor=customer)
