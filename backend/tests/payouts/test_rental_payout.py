"""Tests for rental booking payout settlement, deposit disputes, and backfill."""

import uuid
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.catalog.models import (
    A7VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import User
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import release_payout_hold, settle_rental_earning
from apps.rental.models import RentalAsset, RentalBooking, RentalDeposit
from apps.rental.services import decide_deposit_dispute, raise_deposit_dispute

pytestmark = pytest.mark.django_db

GROSS_PAISE = 400000
COMMISSION_PAISE = 40000
NET_PAISE = 360000
DEPOSIT_PAISE = 50000
DISPUTE_CONSUME_PAISE = 20000


@pytest.fixture
def rental_payout_setup():
    cat = Category.objects.create(slug=f"rental-cat-{uuid.uuid4().hex[:6]}", name="Rentals")
    sub = Subcategory.objects.create(
        category=cat, slug=f"tools-{uuid.uuid4().hex[:6]}", name="Tools"
    )
    svc = Service.objects.create(
        subcategory=sub,
        slug=f"generator-{uuid.uuid4().hex[:6]}",
        name="Generator",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=svc,
        code=f"gen-rent-{uuid.uuid4().hex[:6]}",
        name="Generator Rental",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        required_skill_code="rental",
        tax_category_code="rental",
    )
    A7VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A7VariantConfiguration.Status.ACTIVE,
        default_deposit_paise=DEPOSIT_PAISE,
    )

    owner_user = User.objects.create_user(phone_number=f"+9198{uuid.uuid4().int % 10**8:08d}")
    partner = PartnerProfile.objects.create(
        user=owner_user, display_name="Rental Boss", default_location_text="Kondapur"
    )
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        status=PartnerCapability.Status.APPROVED,
    )

    customer_user = User.objects.create_user(phone_number=f"+9197{uuid.uuid4().int % 10**8:08d}")

    asset = RentalAsset.objects.create(
        partner=partner,
        variant=variant,
        title="5kVA Silent Generator",
        daily_rate_paise=200000,
        deposit_paise=DEPOSIT_PAISE,
        total_quantity=2,
        available_quantity=2,
        is_active=True,
    )

    deposit = RentalDeposit.objects.create(
        amount_paise=DEPOSIT_PAISE,
        status=RentalDeposit.Status.HELD,
    )

    start_date = timezone.localdate() + timedelta(days=1)
    end_date = start_date + timedelta(days=2)

    booking = RentalBooking.objects.create(
        asset=asset,
        customer=customer_user,
        deposit=deposit,
        quantity=1,
        start_date=start_date,
        end_date=end_date,
        price_paise=GROSS_PAISE,
        platform_fee_percent=10,
        platform_fee_paise=COMMISSION_PAISE,
        status=RentalBooking.Status.CONFIRMED,
    )

    return {
        "partner": partner,
        "owner_user": owner_user,
        "customer": customer_user,
        "asset": asset,
        "booking": booking,
        "deposit": deposit,
    }


def test_settle_rental_earning_ignores_unreturned_booking(rental_payout_setup):
    booking = rental_payout_setup["booking"]
    entry = settle_rental_earning(rental_booking_id=booking.id)
    assert entry is None
    assert not PartnerLedgerEntry.objects.filter(rental_booking=booking).exists()


def test_settle_rental_earning_creates_available_earning_on_returned(rental_payout_setup):
    booking = rental_payout_setup["booking"]
    booking.status = RentalBooking.Status.RETURNED
    booking.save(update_fields=("status",))

    entry = settle_rental_earning(rental_booking_id=booking.id)
    assert entry is not None
    assert entry.kind == PartnerLedgerEntry.Kind.EARNING
    assert entry.status == PartnerLedgerEntry.Status.AVAILABLE
    assert entry.gross_paise == GROSS_PAISE
    assert entry.commission_paise == COMMISSION_PAISE
    assert entry.net_paise == NET_PAISE
    assert entry.partner == rental_payout_setup["partner"]
    assert entry.rental_booking == booking
    assert entry.idempotency_key == f"rental-earning:{booking.id}"

    # Idempotent re-run
    second_entry = settle_rental_earning(rental_booking_id=booking.id)
    assert second_entry.id == entry.id
    assert PartnerLedgerEntry.objects.filter(rental_booking=booking).count() == 1


def test_settle_rental_earning_disputed_starts_pending(rental_payout_setup):
    booking = rental_payout_setup["booking"]
    booking.status = RentalBooking.Status.DISPUTED
    booking.save(update_fields=("status",))

    entry = settle_rental_earning(rental_booking_id=booking.id)
    assert entry is not None
    assert entry.status == PartnerLedgerEntry.Status.PENDING

    # Release hold
    released = release_payout_hold(rental_booking_id=booking.id)
    assert released is not None
    assert released.status == PartnerLedgerEntry.Status.AVAILABLE


def test_deposit_dispute_flow_holds_and_releases_earning(rental_payout_setup):
    booking = rental_payout_setup["booking"]
    partner = rental_payout_setup["partner"]
    booking.status = RentalBooking.Status.RETURNED
    booking.save(update_fields=("status",))

    # Earning settled on return
    entry = settle_rental_earning(rental_booking_id=booking.id)
    assert entry.status == PartnerLedgerEntry.Status.AVAILABLE

    # Partner raises dispute over deposit damage
    raise_deposit_dispute(
        booking=booking,
        partner=partner,
        consume_paise=DISPUTE_CONSUME_PAISE,
        reason="Generator dented during return",
    )
    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.PENDING

    # Ops decides dispute
    ops_user = User.objects.create_user(phone_number="+919600000001", is_staff=True)
    decide_deposit_dispute(booking=booking, actor=ops_user, decision="APPROVE")

    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.AVAILABLE


def test_backfill_rental_earnings_command(rental_payout_setup):
    booking = rental_payout_setup["booking"]
    booking.status = RentalBooking.Status.RETURNED
    booking.save(update_fields=("status",))

    # Dry run does not write
    call_command("backfill_rental_earnings")
    assert not PartnerLedgerEntry.objects.filter(rental_booking=booking).exists()

    # Commit writes earning
    call_command("backfill_rental_earnings", commit=True)
    assert PartnerLedgerEntry.objects.filter(rental_booking=booking).exists()
    entry = PartnerLedgerEntry.objects.get(rental_booking=booking)
    assert entry.net_paise == NET_PAISE
