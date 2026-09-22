"""Focused A7 rental fail-closed + happy-path tests."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.catalog.models import (
    A7VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.rental.models import RentalBooking, RentalDeposit
from apps.rental.services import (
    RentalStateError,
    create_asset,
    create_booking,
    handover_booking,
    moderate_asset,
    release_deposit,
    return_booking,
    submit_asset,
)

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
    moderate_asset(
        asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok for test"
    )
    start = timezone.localdate() + timedelta(days=1)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
    )
    assert booking.status == RentalBooking.Status.CONFIRMED
    assert booking.deposit.status == RentalDeposit.Status.HELD
    assert booking.price_paise == 100000
    handover_booking(booking=booking, partner=rental_world["partner"])
    return_booking(booking=booking, partner=rental_world["partner"])
    deposit = release_deposit(booking=booking, partner=rental_world["partner"])
    assert deposit.status == RentalDeposit.Status.RELEASED


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


@pytest.mark.django_db
def test_no_fulfilment_unit_on_rental_models():
    from apps.rental import models as rental_models

    for name in ("RentalAsset", "RentalBooking", "RentalDeposit", "AssetReservation"):
        model = getattr(rental_models, name)
        field_names = {f.name for f in model._meta.get_fields()}
        assert "fulfilment_unit" not in field_names
