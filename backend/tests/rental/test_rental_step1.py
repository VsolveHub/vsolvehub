"""Unit and integration tests for Step 1 of M3 Rentals:
- RENTAL_OWNER onboarding track and A7 capability grant
- Auto-publish asset (photo check, immediate APPROVED status)
- Asset update (PATCH endpoint and service)
- Pause and resume asset
- Delete asset (archive/RETIRED)
- Media deletion
- 10MB photo size validation
- Customer contact exposure on partner booking serializer
"""

from datetime import time, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalog.models import (
    A7VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.capabilities.eligibility import is_approved_rental_owner, workspace_grants
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.partners.services.base import _base_application_is_complete
from apps.rental.models import RentalAsset, RentalPlatformFee
from apps.rental.pickup_hours import DayHours, save_pickup_hours
from apps.rental.serializers import PartnerRentalBookingSerializer, RentalBookingSerializer
from apps.rental.services import (
    RentalStateError,
    auto_publish_asset,
    create_booking,
    delete_asset,
    initiate_rental_booking_payment,
    pause_asset,
    public_assets,
    remove_media,
    resume_asset,
    update_asset,
    validate_rental_photo,
)
from tests.helpers import force_role_client

User = get_user_model()

#: A complete Self Pickup address. Publishing needs address line, city and pincode.
PICKUP = {
    "pickup_address_line": "12 Residency Road",
    "pickup_area": "Koramangala",
    "pickup_city": "Bangalore",
    "pickup_pincode": "560034",
}


@pytest.fixture
def rental_world(db):  # noqa: ARG001
    category = Category.objects.create(slug="step1-test", name="Step 1 Test")
    sub = Subcategory.objects.create(category=category, slug="lighting", name="Lighting")
    service = Service.objects.create(
        subcategory=sub, slug="strobe", name="Strobe", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="strobe-rental",
        name="Strobe rental",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        required_skill_code="rental",
        tax_category_code="rental",
    )
    A7VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A7VariantConfiguration.Status.ACTIVE,
        default_deposit_paise=50000,
        min_rental_days=1,
    )
    owner = User.objects.create(
        phone_number="+919800000001",
        full_name="Rental Host",
    )
    partner = PartnerProfile.objects.create(
        user=owner,
        display_name="Rental Studio",
        default_location_text="Indiranagar, Bangalore",
    )
    PartnerApplication.objects.create(
        partner=partner,
        track=PartnerApplication.Track.RENTAL_OWNER,
        status=PartnerApplication.Status.APPROVED,
    )
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        status=PartnerCapability.Status.APPROVED,
    )
    customer = User.objects.create(
        phone_number="+919800000002",
        full_name="Alice Customer",
    )
    return {
        "variant": variant,
        "partner": partner,
        "owner": owner,
        "customer": customer,
    }


@pytest.fixture(autouse=True)
def _owner_has_pickup_hours(request):
    """Publishing also needs the owner's pickup hours. Set them for every test using a world."""
    if "rental_world" not in request.fixturenames:
        return
    world = request.getfixturevalue("rental_world")
    save_pickup_hours(
        partner=world["partner"],
        days=[DayHours(weekday=d, opens_at=time(9), closes_at=time(21)) for d in range(7)],
    )


@pytest.mark.django_db
def test_rental_owner_track_onboarding_and_grants(rental_world):
    partner = rental_world["partner"]
    app = partner.applications.first()
    assert app.track == PartnerApplication.Track.RENTAL_OWNER
    assert is_approved_rental_owner(partner) is True

    # Simplified completeness check — name and agreements are enough, no trades/areas
    assert _base_application_is_complete(app) is True

    # Workspace grants auto-include A7_RENTAL for approved rental owners
    grants = workspace_grants(partner)
    keys = [g.workspace_key for g in grants]
    assert ServiceVariant.BookingArchetype.A7_RENTAL in keys


@pytest.mark.django_db
def test_auto_publish_asset_success(rental_world):
    partner = rental_world["partner"]
    variant = rental_world["variant"]

    asset = auto_publish_asset(
        **PICKUP,
        partner=partner,
        variant_id=variant.id,
        title="Profoto B10X",
        daily_rate_paise=150000,
        deposit_paise=500000,
        location_text="Koramangala, Bangalore",
        image_urls=["https://storage.vsolve.in/test-image.jpg"],
    )

    assert asset.moderation_status == RentalAsset.ModerationStatus.APPROVED
    assert asset.current_status == RentalAsset.Status.ACTIVE
    assert asset.public_state == "PUBLISHED"
    assert asset.media.count() == 1


@pytest.mark.django_db
def test_auto_publish_asset_requires_photo(rental_world):
    partner = rental_world["partner"]
    variant = rental_world["variant"]

    with pytest.raises(RentalStateError, match="at least 1 photo"):
        auto_publish_asset(
            **PICKUP,
            partner=partner,
            variant_id=variant.id,
            title="Profoto B10X No Photo",
            daily_rate_paise=150000,
            location_text="Koramangala",
            image_urls=[],
            media=[],
        )


@pytest.mark.django_db
def test_update_asset_service(rental_world):
    partner = rental_world["partner"]
    variant = rental_world["variant"]

    asset = auto_publish_asset(
        **PICKUP,
        partner=partner,
        variant_id=variant.id,
        title="Original Title",
        daily_rate_paise=100000,
        image_urls=["https://storage.vsolve.in/img1.jpg"],
    )

    updated = update_asset(
        asset=asset,
        partner=partner,
        title="Updated Title",
        daily_rate_paise=120000,
        description="Brand new strobe",
    )
    assert updated.title == "Updated Title"
    assert updated.daily_rate_paise == 120000  # noqa: PLR2004
    assert updated.description == "Brand new strobe"


@pytest.mark.django_db
def test_pause_and_resume_asset(rental_world):
    partner = rental_world["partner"]
    variant = rental_world["variant"]

    asset = auto_publish_asset(
        **PICKUP,
        partner=partner,
        variant_id=variant.id,
        title="Pausable Item",
        daily_rate_paise=100000,
        image_urls=["https://storage.vsolve.in/img1.jpg"],
    )
    assert asset.public_state == "PUBLISHED"
    assert public_assets().filter(id=asset.id).exists() is True

    # Pause
    paused = pause_asset(asset=asset, partner=partner)
    assert paused.moderation_status == RentalAsset.ModerationStatus.PAUSED
    assert paused.public_state == "PAUSED"
    # Paused item is hidden from public browse
    assert public_assets().filter(id=asset.id).exists() is False

    # Resume
    resumed = resume_asset(asset=paused, partner=partner)
    assert resumed.moderation_status == RentalAsset.ModerationStatus.APPROVED
    assert resumed.public_state == "PUBLISHED"
    assert public_assets().filter(id=asset.id).exists() is True


@pytest.mark.django_db
def test_delete_asset_archives_item(rental_world):
    partner = rental_world["partner"]
    variant = rental_world["variant"]

    asset = auto_publish_asset(
        **PICKUP,
        partner=partner,
        variant_id=variant.id,
        title="Deletable Item",
        daily_rate_paise=100000,
        image_urls=["https://storage.vsolve.in/img1.jpg"],
    )

    deleted = delete_asset(asset=asset, partner=partner)
    assert deleted.current_status == RentalAsset.Status.RETIRED
    assert deleted.public_state == "RETIRED"
    assert public_assets().filter(id=asset.id).exists() is False


@pytest.mark.django_db
def test_remove_media(rental_world):
    partner = rental_world["partner"]
    variant = rental_world["variant"]

    asset = auto_publish_asset(
        **PICKUP,
        partner=partner,
        variant_id=variant.id,
        title="Multi Photo Item",
        daily_rate_paise=100000,
        image_urls=[
            "https://storage.vsolve.in/img1.jpg",
            "https://storage.vsolve.in/img2.jpg",
        ],
    )
    assert asset.media.count() == 2  # noqa: PLR2004
    media_item = asset.media.first()

    remove_media(asset=asset, partner=partner, media_id=media_item.id)
    assert asset.media.count() == 1


def test_validate_rental_photo_size_limit():
    small_file = SimpleUploadedFile("test.jpg", b"x" * 1024, content_type="image/jpeg")
    assert validate_rental_photo(small_file) == small_file

    oversized_file = SimpleUploadedFile(
        "huge.jpg", b"x" * (11 * 1024 * 1024), content_type="image/jpeg"
    )
    with pytest.raises(RentalStateError, match="10 MB"):
        validate_rental_photo(oversized_file)


@pytest.mark.django_db
def test_partner_booking_serializer_customer_contact(rental_world):
    partner = rental_world["partner"]
    owner = rental_world["owner"]
    customer = rental_world["customer"]
    variant = rental_world["variant"]

    asset = auto_publish_asset(
        **PICKUP,
        partner=partner,
        variant_id=variant.id,
        title="Booking Test Item",
        daily_rate_paise=50000,
        image_urls=["https://storage.vsolve.in/img1.jpg"],
    )

    today = pytest.importorskip("django.utils.timezone").localdate()
    booking = create_booking(
        customer=customer,
        asset_id=asset.id,
        start_date=today,
        end_date=today,
        quantity=1,
    )

    # When owner requests the booking, customer name and phone are returned
    rf = pytest.importorskip("rest_framework.test").APIRequestFactory()
    owner_request = rf.get("/")
    owner_request.user = owner
    owner_serializer = PartnerRentalBookingSerializer(booking, context={"request": owner_request})
    data = owner_serializer.data
    assert data["customer_name"] == customer.full_name
    assert data["customer_phone"] == customer.phone_number

    # When customer requests the booking, contact info is not exposed on customer serializer
    customer_request = rf.get("/")
    customer_request.user = customer
    cust_serializer = RentalBookingSerializer(booking, context={"request": customer_request})
    assert "customer_phone" not in cust_serializer.data


@pytest.mark.django_db
def test_partner_asset_api_actions(rental_world):
    partner = rental_world["partner"]
    owner = rental_world["owner"]
    variant = rental_world["variant"]

    asset = auto_publish_asset(
        **PICKUP,
        partner=partner,
        variant_id=variant.id,
        title="API Action Item",
        daily_rate_paise=100000,
        image_urls=["https://storage.vsolve.in/img1.jpg"],
    )

    client = force_role_client(owner, Role.Kind.PARTNER)

    # Pause via API
    resp = client.post(f"/api/v1/partner/rentals/assets/{asset.id}/pause")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["moderation_status"] == "PAUSED"

    # Resume via API
    resp = client.post(f"/api/v1/partner/rentals/assets/{asset.id}/resume")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["moderation_status"] == "APPROVED"

    # Patch via API
    resp = client.patch(
        f"/api/v1/partner/rentals/assets/{asset.id}",
        {"title": "API Renamed Item", "daily_rate_paise": 140000},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["title"] == "API Renamed Item"
    assert resp.data["daily_rate_paise"] == 140000  # noqa: PLR2004

    # Delete via API
    resp = client.delete(f"/api/v1/partner/rentals/assets/{asset.id}")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["public_state"] == "RETIRED"


def _fee_asset(rental_world):
    return auto_publish_asset(
        **PICKUP,
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Fee Drill",
        daily_rate_paise=100_000,
        deposit_paise=50_000,
        image_urls=["https://storage.vsolve.in/fee.jpg"],
    )


def _book_two_days(rental_world, asset):
    start = timezone.localdate() + timedelta(days=4)
    return create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
    )


@pytest.mark.django_db
def test_platform_fee_is_added_on_top_of_the_rental_and_not_the_deposit(rental_world):
    RentalPlatformFee.objects.create(pk=1, percent=10, updated_by=rental_world["owner"])
    booking = _book_two_days(rental_world, _fee_asset(rental_world))
    rental_fee = 100_000 * 2
    deposit = 50_000
    assert booking.price_paise == rental_fee
    assert booking.platform_fee_percent == 10  # noqa: PLR2004
    assert booking.platform_fee_paise == 20_000  # noqa: PLR2004
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    assert attempt.amount_paise == rental_fee + 20_000 + deposit


@pytest.mark.django_db
def test_missing_platform_fee_leaves_the_charge_unchanged(rental_world):
    booking = _book_two_days(rental_world, _fee_asset(rental_world))
    assert booking.platform_fee_percent == 0
    assert booking.platform_fee_paise == 0
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    assert attempt.amount_paise == booking.price_paise + booking.deposit.amount_paise


@pytest.mark.django_db
def test_changing_the_platform_fee_does_not_rewrite_an_existing_booking(rental_world):
    RentalPlatformFee.objects.create(pk=1, percent=10, updated_by=rental_world["owner"])
    booking = _book_two_days(rental_world, _fee_asset(rental_world))
    RentalPlatformFee.objects.filter(pk=1).update(percent=25)
    booking.refresh_from_db()
    assert booking.platform_fee_percent == 10  # noqa: PLR2004
    assert booking.platform_fee_paise == 20_000  # noqa: PLR2004
    attempt = initiate_rental_booking_payment(booking=booking)
    assert attempt.amount_paise == booking.price_paise + booking.platform_fee_paise + 50_000


@pytest.mark.django_db
def test_operations_sets_the_platform_fee_and_rejects_an_out_of_range_percent():
    role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    ops = User.objects.create(phone_number="+919800000099", full_name="Ops Fee")
    UserRole.objects.create(user=ops, role=role)
    client = force_role_client(user=ops, role_code="operations")

    public = APIClient().get("/api/v1/rentals/platform-fee")
    assert public.status_code == status.HTTP_200_OK
    assert public.json() == {"percent": 0}

    saved = client.put("/api/v1/ops/rentals/platform-fee", {"percent": 10}, format="json")
    assert saved.status_code == status.HTTP_200_OK
    assert saved.json() == {"percent": 10}
    assert RentalPlatformFee.objects.get(pk=1).updated_by_id == ops.id

    rejected = client.put("/api/v1/ops/rentals/platform-fee", {"percent": 101}, format="json")
    assert rejected.status_code == status.HTTP_400_BAD_REQUEST
    assert RentalPlatformFee.objects.get(pk=1).percent == 10  # noqa: PLR2004

    again = APIClient().get("/api/v1/rentals/platform-fee")
    assert again.json() == {"percent": 10}
