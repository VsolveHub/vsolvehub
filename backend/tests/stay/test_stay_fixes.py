"""Tests for Stays module P0 and P1 fixes."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
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
from apps.stay.models import StayEnquiry, StayReservation
from apps.stay.services import (
    StayStateError,
    check_in_reservation,
    check_out_reservation,
    create_enquiry,
    create_property,
    create_reservation,
    create_stay_review,
    expire_stale_enquiries,
    moderate_property,
    public_properties,
    submit_property,
)
from tests.helpers import force_role_client

User = get_user_model()
TARGET_RATING = 5
ALTERNATIVE_RATING = 4


@pytest.fixture
def stay_env(db):  # noqa: ARG001
    category = Category.objects.create(slug="stay-fix-cat", name="Stay Fix Category")
    sub = Subcategory.objects.create(category=category, slug="pg-fix", name="PG Fix")
    service = Service.objects.create(
        subcategory=sub, slug="room-fix", name="Room Fix", status=Service.Status.ACTIVE
    )
    variant_res = ServiceVariant.objects.create(
        service=service,
        code="res-stay-code",
        name="Reservation Stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant_res,
        version=1,
        status=A9VariantConfiguration.Status.ACTIVE,
        booking_mode=A9VariantConfiguration.BookingMode.RESERVATION,
    )
    variant_enq = ServiceVariant.objects.create(
        service=service,
        code="enq-stay-code",
        name="Enquiry Stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant_enq,
        version=1,
        status=A9VariantConfiguration.Status.ACTIVE,
        booking_mode=A9VariantConfiguration.BookingMode.ENQUIRY,
    )

    host_user = User.objects.create_user(
        phone_number="+919876543210", email="host@example.com", full_name="Host User"
    )
    app = PartnerApplication.objects.create(
        user=host_user,
        business_name="Host Stays",
        experience_years=3,
        aadhaar_hash="host123",
        status=PartnerApplication.Status.APPROVED,
    )
    partner = PartnerProfile.objects.create(
        user=host_user,
        application=app,
        display_name="Host Stays",
        operating_city="Bengaluru",
        rating=5.0,
    )
    PartnerCapability.objects.create(
        partner=partner,
        archetype="A9_STAY",
        status="APPROVED",
    )
    UserRole.objects.create(user=host_user, role=Role.PARTNER)

    cust_user = User.objects.create_user(
        phone_number="+919876543211", email="guest@example.com", full_name="Guest User"
    )
    UserRole.objects.create(user=cust_user, role=Role.CUSTOMER)

    ops_user = User.objects.create_user(
        phone_number="+919876543212", email="ops@example.com", full_name="Ops User"
    )
    UserRole.objects.create(user=ops_user, role=Role.OPERATIONS)

    return {
        "variant_res": variant_res,
        "variant_enq": variant_enq,
        "partner": partner,
        "guest": cust_user,
        "ops": ops_user,
    }


def _create_published_prop(variant, partner, title="Test Prop", nightly_rate_paise=100000):
    prop = create_property(
        host=partner,
        variant_id=variant.id,
        title=title,
        description="A great place",
        location_text="Koramangala, Bengaluru",
        nightly_rate_paise=nightly_rate_paise,
    )
    submit_property(prop=prop, host=partner)
    moderate_property(prop=prop, actor=partner.user, action="APPROVE", reason="Looks good")
    prop.refresh_from_db()
    return prop


@pytest.mark.django_db
def test_past_date_reservation_rejected(stay_env):
    prop = _create_published_prop(stay_env["variant_res"], stay_env["partner"])
    unit = prop.units.first()
    yesterday = timezone.localdate() - timedelta(days=1)
    tomorrow = timezone.localdate() + timedelta(days=1)

    with pytest.raises(StayStateError) as exc:
        create_reservation(
            customer=stay_env["guest"],
            property_id=prop.id,
            unit_id=unit.id,
            check_in=yesterday,
            check_out=tomorrow,
        )
    assert exc.value.code == "check_in_in_past"


@pytest.mark.django_db
def test_past_date_enquiry_rejected(stay_env):
    prop = _create_published_prop(stay_env["variant_enq"], stay_env["partner"])
    yesterday = timezone.localdate() - timedelta(days=1)
    tomorrow = timezone.localdate() + timedelta(days=1)

    with pytest.raises(StayStateError) as exc:
        create_enquiry(
            customer=stay_env["guest"],
            property_id=prop.id,
            check_in=yesterday,
            check_out=tomorrow,
        )
    assert exc.value.code == "check_in_in_past"


@pytest.mark.django_db
def test_duplicate_enquiry_spam_rejected(stay_env):
    prop = _create_published_prop(stay_env["variant_enq"], stay_env["partner"])
    check_in = timezone.localdate() + timedelta(days=5)
    check_out = check_in + timedelta(days=3)

    create_enquiry(
        customer=stay_env["guest"],
        property_id=prop.id,
        check_in=check_in,
        check_out=check_out,
    )

    with pytest.raises(StayStateError) as exc:
        create_enquiry(
            customer=stay_env["guest"],
            property_id=prop.id,
            check_in=check_in + timedelta(days=1),
            check_out=check_out + timedelta(days=1),
        )
    assert exc.value.code == "duplicate_enquiry"


@pytest.mark.django_db
def test_expire_stale_enquiries(stay_env):
    prop = _create_published_prop(stay_env["variant_enq"], stay_env["partner"])
    check_in = timezone.localdate() + timedelta(days=5)
    check_out = check_in + timedelta(days=3)

    enq = create_enquiry(
        customer=stay_env["guest"],
        property_id=prop.id,
        check_in=check_in,
        check_out=check_out,
    )
    # Stale by created_at
    StayEnquiry.objects.filter(id=enq.id).update(created_at=timezone.now() - timedelta(days=10))

    expired = expire_stale_enquiries(older_than_days=7)
    assert expired >= 1

    enq.refresh_from_db()
    assert enq.status == StayEnquiry.Status.EXPIRED


@pytest.mark.django_db
def test_stay_review_for_reservation_customer(stay_env, client):
    prop = _create_published_prop(stay_env["variant_res"], stay_env["partner"])
    unit = prop.units.first()
    check_in = timezone.localdate() + timedelta(days=2)
    check_out = check_in + timedelta(days=2)

    res = create_reservation(
        customer=stay_env["guest"],
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_out,
    )
    res.status = StayReservation.Status.CONFIRMED
    res.save(update_fields=("status",))

    check_in_reservation(reservation=res, host=stay_env["partner"])
    check_out_reservation(reservation=res, host=stay_env["partner"])

    # Create review via service
    review = create_stay_review(
        customer=stay_env["guest"],
        property_id=prop.id,
        reservation_id=res.id,
        rating=TARGET_RATING,
        body="Outstanding hospitality!",
    )
    assert review.rating == TARGET_RATING
    assert review.body == "Outstanding hospitality!"

    # Duplicate review should be rejected
    with pytest.raises(StayStateError) as exc:
        create_stay_review(
            customer=stay_env["guest"],
            property_id=prop.id,
            reservation_id=res.id,
            rating=ALTERNATIVE_RATING,
            body="Another review attempt",
        )
    assert exc.value.code == "duplicate_review"

    # API endpoint test
    force_role_client(client, stay_env["guest"], Role.CUSTOMER)
    resp = client.post(
        "/api/v1/stays/reviews",
        data={
            "property_id": str(prop.id),
            "reservation_id": str(res.id),
            "rating": 5,
            "comment": "Super clean stay!",
        },
        content_type="application/json",
    )
    # Since guest already submitted a review above, endpoint should reject duplicate
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["code"] == "duplicate_review"


@pytest.mark.django_db
def test_public_properties_date_filtering(stay_env):
    prop1 = _create_published_prop(
        stay_env["variant_res"], stay_env["partner"], title="Prop Available"
    )
    prop2 = _create_published_prop(
        stay_env["variant_res"], stay_env["partner"], title="Prop Booked"
    )

    check_in = timezone.localdate() + timedelta(days=10)
    check_out = check_in + timedelta(days=3)

    unit2 = prop2.units.first()
    create_reservation(
        customer=stay_env["guest"],
        property_id=prop2.id,
        unit_id=unit2.id,
        check_in=check_in,
        check_out=check_out,
    )

    # Filter with dates
    available = public_properties(check_in=check_in, check_out=check_out)
    available_ids = [p.id for p in available]
    assert prop1.id in available_ids
    assert prop2.id not in available_ids


@pytest.mark.django_db
def test_ops_cancel_reservation(stay_env, client):
    prop = _create_published_prop(stay_env["variant_res"], stay_env["partner"])
    unit = prop.units.first()
    check_in = timezone.localdate() + timedelta(days=7)
    check_out = check_in + timedelta(days=2)

    res = create_reservation(
        customer=stay_env["guest"],
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_out,
    )

    force_role_client(client, stay_env["ops"], Role.OPERATIONS)
    resp = client.post(
        f"/api/v1/ops/stays/reservations/{res.id}/cancel",
        data={"reason": "Emergency site closure"},
        content_type="application/json",
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["status"] == "CANCELLED"
    res.refresh_from_db()
    assert res.status == StayReservation.Status.CANCELLED
    assert "Emergency site closure" in res.cancellation_reason


@pytest.mark.django_db
def test_partner_property_media_management(stay_env, client):
    prop = _create_published_prop(stay_env["variant_res"], stay_env["partner"])

    force_role_client(client, stay_env["partner"].user, Role.PARTNER)

    # Add photo
    add_resp = client.post(
        f"/api/v1/partner/stays/properties/{prop.id}/media",
        data={"url": "https://example.com/photo1.jpg", "caption": "Balcony view"},
        content_type="application/json",
    )
    assert add_resp.status_code == status.HTTP_201_CREATED
    media_id = add_resp.data["id"]

    prop.refresh_from_db()
    assert prop.media.filter(id=media_id).exists()

    # Delete photo
    del_resp = client.delete(
        f"/api/v1/partner/stays/properties/{prop.id}/media/{media_id}",
    )
    assert del_resp.status_code == status.HTTP_204_NO_CONTENT
    assert not prop.media.filter(id=media_id).exists()
