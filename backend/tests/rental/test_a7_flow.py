"""Focused A7 rental fail-closed + happy-path tests."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status

from apps.catalog.models import (
    A7VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.rental.models import RentalAssetMedia, RentalBooking, RentalDeposit, RentalPhotoUpload
from apps.rental.services import (
    RentalStateError,
    create_asset,
    create_booking,
    handover_booking,
    moderate_asset,
    release_deposit,
    return_booking,
    store_rental_photo,
    submit_asset,
)
from tests.helpers import force_role_client

User = get_user_model()


@pytest.fixture
def rental_world(db):
    category = Category.objects.create(slug="rental-test", name="Rental Test")
    sub = Subcategory.objects.create(category=category, slug="tools", name="Tools")
    service = Service.objects.create(
        subcategory=sub, slug="drill", name="Drill", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="drill-rental",
        name="Drill rental",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        required_skill_code="rental",
        tax_category_code="rental",
    )
    A7VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A7VariantConfiguration.Status.ACTIVE,
        default_deposit_paise=100000,
    )
    owner = User.objects.create(phone_number="+919911110001", full_name="Owner")
    partner = PartnerProfile.objects.create(user=owner, display_name="Owner Co")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        status=PartnerCapability.Status.APPROVED,
    )
    customer = User.objects.create(phone_number="+919911110002", full_name="Customer")
    return {
        "variant": variant,
        "partner": partner,
        "owner": owner,
        "customer": customer,
    }


@pytest.mark.django_db
def test_create_asset_fail_closed_without_active_config(rental_world):
    A7VariantConfiguration.objects.filter(variant=rental_world["variant"]).update(
        status=A7VariantConfiguration.Status.RETIRED
    )
    with pytest.raises(RentalStateError, match="not open"):
        create_asset(
            partner=rental_world["partner"],
            variant_id=rental_world["variant"].id,
            title="X",
            daily_rate_paise=100,
        )


@pytest.mark.django_db
def test_rental_happy_path_handover_return_release(rental_world):
    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Demo Drill",
        daily_rate_paise=50000,
        deposit_paise=100000,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok for test")
    start = timezone.localdate() + timedelta(days=1)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
    )
    assert booking.status == RentalBooking.Status.PENDING_PAYMENT
    assert booking.deposit.status == RentalDeposit.Status.REQUESTED
    assert booking.deposit.payment_attempt_id is not None
    assert booking.deposit.payment_attempt.expires_at is not None
    assert booking.price_paise == 100000
    from apps.rental.services import mark_deposit_held

    mark_deposit_held(payment_attempt_id=booking.deposit.payment_attempt_id)
    booking.refresh_from_db()
    booking.deposit.refresh_from_db()
    assert booking.status == RentalBooking.Status.CONFIRMED
    assert booking.deposit.status == RentalDeposit.Status.HELD
    handover_booking(
        booking=booking,
        partner=rental_world["partner"],
        pin=booking.handover_pin_hash,
    )
    return_booking(booking=booking, partner=rental_world["partner"])
    deposit = release_deposit(booking=booking, partner=rental_world["partner"])
    assert deposit.status == RentalDeposit.Status.RELEASED


@pytest.mark.django_db
def test_mark_deposit_held_avoids_for_update_on_outer_join(rental_world):
    """Regression: Postgres rejects FOR UPDATE on the nullable side of an outer join.

    `RentalBooking.deposit` is a reverse OneToOne from RentalDeposit, so locking the
    deposit with `select_related("booking")` produced a left outer join under
    `FOR UPDATE` and blew up simulate-capture for A7 deposits. Lock rows in separate
    statements instead; assert no single statement mixes FOR UPDATE with a left join.
    """
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    from apps.rental.services import mark_deposit_held

    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Deposit Lock Drill",
        daily_rate_paise=50000,
        deposit_paise=100000,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok for test")
    start = timezone.localdate() + timedelta(days=3)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=1),
    )
    attempt_id = booking.deposit.payment_attempt_id
    assert attempt_id is not None

    with CaptureQueriesContext(connection) as captured:
        mark_deposit_held(payment_attempt_id=attempt_id)

    for query in captured.captured_queries:
        sql = query["sql"].upper()
        if "FOR UPDATE" in sql:
            assert "LEFT OUTER JOIN" not in sql, sql
            assert "LEFT JOIN" not in sql, sql

    booking.refresh_from_db()
    booking.deposit.refresh_from_db()
    assert booking.status == RentalBooking.Status.CONFIRMED
    assert booking.deposit.status == RentalDeposit.Status.HELD

    # Replay after hold is a no-op (idempotent capture callback).
    mark_deposit_held(payment_attempt_id=attempt_id)
    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CONFIRMED
    assert booking.deposit.status == RentalDeposit.Status.HELD


@pytest.mark.django_db
def test_rental_filters(rental_world):
    from apps.rental.services import public_assets

    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Heavy Duty Wood Router",
        location_text="Kondapur, Hyderabad",
        daily_rate_paise=35000,
        deposit_paise=80000,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(
        asset=asset, actor=rental_world["owner"], action="APPROVE", reason="test approve"
    )

    results = public_assets(query="Wood Router", location="Hyderabad")
    assert any(a.id == asset.id for a in results)

    results_rate = public_assets(min_daily_rate_paise=30000, max_daily_rate_paise=40000)
    assert any(a.id == asset.id for a in results_rate)

    results_deposit = public_assets(max_deposit_paise=50000)
    assert not any(a.id == asset.id for a in results_deposit)

    start = timezone.localdate() + timedelta(days=10)
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
        hold_deposit_for_demo=True,
    )
    blocked = public_assets(start_date=start, end_date=start + timedelta(days=1))
    assert not any(a.id == asset.id for a in blocked)


@pytest.mark.django_db
def test_delivery_is_refused_when_the_owner_does_not_offer_it(rental_world):
    """Delivery is now a real option, but only on items whose owner offers it.

    Replaces the old "always forced to PICKUP" rule: a DELIVERY request is no longer silently
    rewritten, it is refused with a reason the customer can act on.
    """
    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Pickup Only Saw",
        daily_rate_paise=25000,
        deposit_paise=0,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok for test")
    start = timezone.localdate() + timedelta(days=5)
    with pytest.raises(RentalStateError) as refused:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=start,
            end_date=start + timedelta(days=1),
            mode="DELIVERY",
            delivery_address={
                "line": "4 Lake View",
                "city": "Hyderabad",
                "pincode": "500081",
                "contact_phone": "9876543210",
            },
            hold_deposit_for_demo=True,
        )
    assert refused.value.code == "delivery_not_offered"
    assert not RentalBooking.objects.filter(asset=asset).exists()


@pytest.mark.django_db
def test_no_fulfilment_unit_on_rental_models():
    from apps.rental import models as rental_models

    for name in ("RentalAsset", "RentalBooking", "RentalDeposit", "AssetReservation"):
        model = getattr(rental_models, name)
        field_names = {f.name for f in model._meta.get_fields()}
        assert "fulfilment_unit" not in field_names


def _tiny_jpeg() -> SimpleUploadedFile:
    return SimpleUploadedFile("drill.jpg", b"\xff\xd8\xff\xd9fake-jpeg", content_type="image/jpeg")


def _partner_client(user):
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="partner")


@pytest.mark.django_db
def test_store_rental_photo_rejects_non_image(rental_world):
    upload = SimpleUploadedFile("notes.txt", b"not-an-image", content_type="text/plain")
    with pytest.raises(RentalStateError, match="JPEG, PNG, or WebP"):
        store_rental_photo(partner=rental_world["partner"], upload=upload)


@pytest.mark.django_db
def test_partner_must_upload_photos_not_paste_urls(rental_world):
    client = _partner_client(rental_world["owner"])
    pasted = client.post(
        "/api/v1/partner/rentals/assets",
        {
            "variant_id": str(rental_world["variant"].id),
            "title": "Pasted URL drill",
            "location_text": "Madhapur",
            "daily_rate_paise": 50000,
            "deposit_paise": 100000,
            "image_urls": ["https://cdn.example.com/drill.jpg"],
        },
        format="json",
    )
    assert pasted.status_code == status.HTTP_400_BAD_REQUEST
    assert "Upload photos" in pasted.json()["error"]["message"]

    uploaded = client.post(
        "/api/v1/partner/rentals/photos",
        {"file": _tiny_jpeg()},
        format="multipart",
    )
    assert uploaded.status_code == status.HTTP_201_CREATED
    body = uploaded.json()
    assert body["url"]
    assert RentalPhotoUpload.objects.filter(partner=rental_world["partner"]).exists()
    stored = RentalPhotoUpload.objects.get(id=body["upload_id"])
    assert stored.stored_file.name.startswith("rental-ads/")
    assert stored.stored_file.storage.exists(stored.stored_file.name)

    created = client.post(
        "/api/v1/partner/rentals/assets",
        {
            "variant_id": str(rental_world["variant"].id),
            "title": "Uploaded photo drill",
            "location_text": "Madhapur",
            "daily_rate_paise": 50000,
            "deposit_paise": 100000,
            "image_urls": [body["url"]],
        },
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED
    media = RentalAssetMedia.objects.filter(asset_id=created.json()["id"])
    assert media.count() == 1
    assert media.get().url == body["url"]
