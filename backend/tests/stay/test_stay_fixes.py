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
from apps.notifications.models import NotificationIntent
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import StayEnquiry, StayReservation, StayReview
from apps.stay.services import (
    StayStateError,
    check_in_reservation,
    check_out_reservation,
    confirm_enquiry,
    create_enquiry,
    create_property,
    create_reservation,
    create_stay_review,
    expire_stale_enquiries,
    moderate_property,
    public_properties,
    respond_enquiry,
    submit_property,
)
from tests.helpers import force_role_client

User = get_user_model()
TARGET_RATING = 5
ALTERNATIVE_RATING = 4
RATING_THREE = 3
EXPECTED_MIN_RESULTS = 2


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


@pytest.mark.django_db
def test_max_stay_nights_exceeded(stay_env):
    prop = _create_published_prop(stay_env["variant_res"], stay_env["partner"])
    unit = prop.units.first()
    check_in = timezone.localdate() + timedelta(days=1)
    check_out = check_in + timedelta(days=91)  # Exceeds MAX_STAY_NIGHTS = 90

    with pytest.raises(StayStateError) as exc_info:
        create_reservation(
            customer=stay_env["customer"],
            property_id=prop.id,
            unit_id=unit.id,
            check_in=check_in,
            check_out=check_out,
        )
    assert exc_info.value.code == "max_stay_exceeded"


@pytest.mark.django_db
def test_stay_sorting_price_and_rating(stay_env, client):
    # Prop 1: rate 3000, 1 review of rating 3
    prop1 = _create_published_prop(
        stay_env["variant_res"], stay_env["partner"], title="Stay Low Price"
    )
    unit1 = prop1.units.first()
    unit1.nightly_rate_paise = 300000
    unit1.save()

    # Prop 2: rate 8000, 1 review of rating 5
    prop2 = _create_published_prop(
        stay_env["variant_res"], stay_env["partner"], title="Stay High Price"
    )
    unit2 = prop2.units.first()
    unit2.nightly_rate_paise = 800000
    unit2.save()

    # Ratings
    StayReview.objects.create(
        property=prop1, customer=stay_env["customer"], rating=RATING_THREE, body="Average"
    )
    StayReview.objects.create(
        property=prop2, customer=stay_env["customer"], rating=TARGET_RATING, body="Superb"
    )

    # Price ASC
    resp_asc = client.get("/api/v1/stays?sort=price_asc")
    assert resp_asc.status_code == status.HTTP_200_OK
    items_asc = resp_asc.data
    assert len(items_asc) >= EXPECTED_MIN_RESULTS
    assert items_asc[0]["id"] == str(prop1.id)
    assert items_asc[1]["id"] == str(prop2.id)

    # Price DESC
    resp_desc = client.get("/api/v1/stays?sort=price_desc")
    assert resp_desc.status_code == status.HTTP_200_OK
    items_desc = resp_desc.data
    assert len(items_desc) >= EXPECTED_MIN_RESULTS
    assert items_desc[0]["id"] == str(prop2.id)
    assert items_desc[1]["id"] == str(prop1.id)

    # Rating DESC
    resp_rating = client.get("/api/v1/stays?sort=rating_desc")
    assert resp_rating.status_code == status.HTTP_200_OK
    items_rating = resp_rating.data
    assert len(items_rating) >= EXPECTED_MIN_RESULTS
    assert items_rating[0]["id"] == str(prop2.id)


@pytest.mark.django_db
def test_stay_enquiry_notifications(stay_env):
    prop = _create_published_prop(stay_env["variant_enq"], stay_env["partner"])
    unit = prop.units.first()
    check_in = timezone.localdate() + timedelta(days=2)
    check_out = check_in + timedelta(days=3)

    enq = create_enquiry(
        customer=stay_env["customer"],
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_out,
        message="Visiting soon",
    )

    # Respond to enquiry
    respond_enquiry(
        enquiry=enq,
        host=stay_env["partner"],
        response="Welcome, room is available!",
    )
    enq.refresh_from_db()
    assert enq.status == StayEnquiry.Status.RESPONDED

    # Check notification intent for responded
    notif = NotificationIntent.objects.filter(
        recipient_id=stay_env["customer"].id,
        template_code="stay_enquiry_responded",
    ).first()
    assert notif is not None
    assert notif.context["response_text"] == "Welcome, room is available!"

    # Confirm enquiry
    confirm_enquiry(enquiry=enq, host=stay_env["partner"])
    enq.refresh_from_db()
    assert enq.status == StayEnquiry.Status.CONFIRMED

    # Check notification intent for confirmed
    conf_notif = NotificationIntent.objects.filter(
        recipient_id=stay_env["customer"].id,
        template_code="stay_enquiry_confirmed",
    ).first()
    assert conf_notif is not None


@pytest.mark.django_db
def test_duplicate_stay_review_prevention(stay_env):
    prop = _create_published_prop(stay_env["variant_enq"], stay_env["partner"])
    unit = prop.units.first()
    check_in = timezone.localdate() + timedelta(days=1)
    check_out = check_in + timedelta(days=2)

    enq = create_enquiry(
        customer=stay_env["customer"],
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_out,
    )
    confirm_enquiry(enquiry=enq, host=stay_env["partner"])

    # First review succeeds
    rev = create_stay_review(
        customer=stay_env["customer"],
        property_id=prop.id,
        enquiry_id=enq.id,
        rating=TARGET_RATING,
        body="First great review!",
    )
    assert rev.id is not None

    # Duplicate review fails
    with pytest.raises(StayStateError) as exc_info:
        create_stay_review(
            customer=stay_env["customer"],
            property_id=prop.id,
            enquiry_id=enq.id,
            rating=ALTERNATIVE_RATING,
            body="Second review attempt!",
        )
    assert exc_info.value.code == "duplicate_review"
