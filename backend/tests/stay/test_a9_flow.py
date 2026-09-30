"""Focused A9 stay enquiry-first fail-closed + happy-path tests."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
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
from apps.stay.models import PropertyMedia, StayEnquiry, StayPhotoUpload
from apps.stay.services import (
    StayStateError,
    create_enquiry,
    create_property,
    moderate_property,
    respond_enquiry,
    store_stay_photo,
    submit_property,
)
from tests.helpers import force_role_client

User = get_user_model()


@pytest.fixture
def stay_world(db):
    category = Category.objects.create(slug="stay-test", name="Stay Test")
    sub = Subcategory.objects.create(category=category, slug="pg", name="PG")
    service = Service.objects.create(
        subcategory=sub, slug="double-pg", name="Double PG", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="double-pg-stay",
        name="Double PG stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant, version=1, status=A9VariantConfiguration.Status.ACTIVE
    )
    host_user = User.objects.create(phone_number="+919922220001", full_name="Host")
    host = PartnerProfile.objects.create(user=host_user, display_name="Host PG")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=host,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )
    guest = User.objects.create(phone_number="+919922220002", full_name="Guest")
    return {"variant": variant, "host": host, "host_user": host_user, "guest": guest}


@pytest.mark.django_db
def test_create_property_fail_closed_without_active_config(stay_world):
    A9VariantConfiguration.objects.filter(variant=stay_world["variant"]).update(
        status=A9VariantConfiguration.Status.RETIRED
    )
    with pytest.raises(StayStateError, match="not open"):
        create_property(
            host=stay_world["host"],
            variant_id=stay_world["variant"].id,
            title="X",
        )


@pytest.mark.django_db
def test_enquiry_happy_path(stay_world):
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Demo PG",
        nightly_rate_paise=90000,
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    submit_property(prop=prop, host=stay_world["host"])
    moderate_property(
        prop=prop, actor=stay_world["host_user"], action="APPROVE", reason="ok for test"
    )
    check_in = timezone.localdate() + timedelta(days=3)
    enquiry = create_enquiry(
        customer=stay_world["guest"],
        property_id=prop.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=10),
        message="Interested",
    )
    assert enquiry.status == StayEnquiry.Status.SUBMITTED
    assert enquiry.nights == 10
    assert enquiry.total_quote_paise == 900000
    respond_enquiry(
        enquiry=enquiry, host=stay_world["host"], response="Yes, available.", decline=False
    )
    enquiry.refresh_from_db()
    assert enquiry.status == StayEnquiry.Status.RESPONDED


@pytest.mark.django_db
def test_stay_quote_calculation_and_filters(stay_world):
    from apps.stay.services import calculate_stay_quote, public_properties

    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Luxury AC Studio Stay",
        location_text="Banjara Hills, Hyderabad",
        nightly_rate_paise=150000,
        sharing_count=1,
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    submit_property(prop=prop, host=stay_world["host"])
    moderate_property(
        prop=prop, actor=stay_world["host_user"], action="APPROVE", reason="demo approved"
    )

    check_in = timezone.localdate() + timedelta(days=5)
    check_out = check_in + timedelta(days=3)
    quote = calculate_stay_quote(
        property_id=prop.id,
        check_in=check_in,
        check_out=check_out,
    )
    assert quote["nights"] == 3
    assert quote["nightly_rate_paise"] == 150000
    assert quote["total_quote_paise"] == 450000

    # Structured filters testing
    results = public_properties(query="Luxury", location="Hyderabad")
    assert any(p.id == prop.id for p in results)

    # AC is a room fact now; the title is never searched for it ("ac" matches "Palace").
    assert not any(p.id == prop.id for p in public_properties(has_ac=True))
    prop.units.update(attributes={"ac": "AC"})
    results_ac = public_properties(has_ac=True)
    assert any(p.id == prop.id for p in results_ac)

    results_single = public_properties(sharing_count=1)
    assert any(p.id == prop.id for p in results_single)

    results_expensive = public_properties(min_price_paise=100000)
    assert any(p.id == prop.id for p in results_expensive)

    results_cheap = public_properties(max_price_paise=50000)
    assert not any(p.id == prop.id for p in results_cheap)
    page = list(public_properties(limit=1, offset=0))
    assert len(page) <= 1


@pytest.mark.django_db
def test_no_fulfilment_unit_on_stay_models():
    from apps.stay import models as stay_models

    for name in ("Property", "Unit", "StayEnquiry"):
        model = getattr(stay_models, name)
        field_names = {f.name for f in model._meta.get_fields()}
        assert "fulfilment_unit" not in field_names


def _tiny_jpeg() -> SimpleUploadedFile:
    return SimpleUploadedFile("room.jpg", b"\xff\xd8\xff\xd9fake-jpeg", content_type="image/jpeg")


def _partner_client(user):
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="partner")


@pytest.mark.django_db
def test_store_stay_photo_rejects_non_image(stay_world):
    upload = SimpleUploadedFile("notes.txt", b"not-an-image", content_type="text/plain")
    with pytest.raises(StayStateError, match="JPEG, PNG, or WebP"):
        store_stay_photo(partner=stay_world["host"], upload=upload)


@pytest.mark.django_db
def test_partner_must_upload_stay_photos_not_paste_urls(stay_world):
    client = _partner_client(stay_world["host_user"])
    pasted = client.post(
        "/api/v1/partner/stays/properties",
        {
            "variant_id": str(stay_world["variant"].id),
            "title": "Pasted URL room",
            "location_text": "Gachibowli",
            "nightly_rate_paise": 85000,
            "image_urls": ["https://cdn.example.com/room.jpg"],
        },
        format="json",
    )
    assert pasted.status_code == status.HTTP_400_BAD_REQUEST
    assert "Upload photos" in pasted.json()["detail"]

    uploaded = client.post(
        "/api/v1/partner/stays/photos",
        {"file": _tiny_jpeg()},
        format="multipart",
    )
    assert uploaded.status_code == status.HTTP_201_CREATED
    body = uploaded.json()
    stored = StayPhotoUpload.objects.get(id=body["upload_id"])
    assert stored.stored_file.storage.exists(stored.stored_file.name)

    created = client.post(
        "/api/v1/partner/stays/properties",
        {
            "variant_id": str(stay_world["variant"].id),
            "title": "Uploaded photo room",
            "location_text": "Gachibowli",
            "nightly_rate_paise": 85000,
            "image_urls": [body["url"]],
        },
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED
    media = PropertyMedia.objects.filter(property_id=created.json()["id"])
    assert media.count() == 1
    assert media.get().url == body["url"]


@pytest.mark.django_db(transaction=True)
def test_stay_reservation_simulated_capture(stay_world, client):
    from datetime import timedelta

    from django.utils import timezone

    from apps.commerce.models import PaymentAttempt
    from apps.commerce.services.simulation import simulate_capture
    from apps.stay.services import (
        create_property,
        initiate_reservation_payment,
        moderate_property,
        submit_property,
    )

    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Demo PG",
        nightly_rate_paise=90000,
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    submit_property(prop=prop, host=stay_world["host"])
    moderate_property(
        prop=prop, actor=stay_world["host_user"], action="APPROVE", reason="ok for test"
    )

    check_in = timezone.localdate() + timedelta(days=3)

    # We can create reservation directly
    from apps.stay.services import create_reservation

    unit = prop.units.first()
    res = create_reservation(
        customer=stay_world["guest"],
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=10),
        guest_count=1,
    )

    attempt = initiate_reservation_payment(res.id)
    assert attempt.status == PaymentAttempt.Status.PROVIDER_PENDING

    # Needs simulate_capture
    simulate_capture(attempt_id=attempt.id, customer_id=stay_world["guest"].id)

    attempt.refresh_from_db()
    assert attempt.status == PaymentAttempt.Status.CAPTURED
