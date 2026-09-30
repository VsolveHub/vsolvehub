"""A7 deposit release/dispute must gateway-refund residual (not rental fee)."""

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
from apps.commerce.models import PaymentAttempt, Refund
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.payouts.models import PartnerLedgerEntry
from apps.rental.models import RentalBooking, RentalDeposit
from apps.rental.services import (
    create_asset,
    create_booking,
    dispute_deposit,
    handover_booking,
    mark_deposit_held,
    moderate_asset,
    release_deposit,
    return_booking,
    submit_asset,
)

User = get_user_model()


@pytest.fixture
def rental_world(db):
    category = Category.objects.create(slug="rental-deposit-refund", name="Deposit Refund")
    sub = Subcategory.objects.create(category=category, slug="cameras-refund", name="Cameras")
    service = Service.objects.create(
        subcategory=sub, slug="dslr-refund", name="DSLR", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="dslr-rental-refund",
        name="DSLR rental refund",
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
    owner = User.objects.create(phone_number="+919955550001", full_name="Refund Owner")
    partner = PartnerProfile.objects.create(
        user=owner, display_name="Refund Co", default_location_text="Pickup desk"
    )
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        status=PartnerCapability.Status.APPROVED,
    )
    customer = User.objects.create(phone_number="+919955550002", full_name="Refund Customer")
    return {
        "variant": variant,
        "partner": partner,
        "owner": owner,
        "customer": customer,
    }


def _returned_paid_booking(world, *, deposit_paise: int = 50000, daily_rate_paise: int = 25000):
    """Book → capture deposit attempt → handover → return (paid, not demo hold)."""
    asset = create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title="Refund Camera",
        daily_rate_paise=daily_rate_paise,
        deposit_paise=deposit_paise,
        quantity_available=1,
        location_text="",
    )
    submit_asset(asset=asset, partner=world["partner"])
    moderate_asset(asset=asset, actor=world["owner"], action="APPROVE", reason="ok")
    start = timezone.localdate() + timedelta(days=1)
    booking = create_booking(
        customer=world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
    )
    assert booking.status == RentalBooking.Status.PENDING_PAYMENT
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    # Combined charge: rental fee (2 days) + deposit.
    assert attempt.amount_paise == daily_rate_paise * 2 + deposit_paise

    mark_deposit_held(payment_attempt_id=attempt.id)
    attempt.status = PaymentAttempt.Status.CAPTURED
    attempt.provider_payment_id = attempt.provider_payment_id or f"pay_{attempt.id.hex[:16]}"
    attempt.save(update_fields=("status", "provider_payment_id", "updated_at"))

    booking.refresh_from_db()
    pin = booking.handover_pin_hash
    assert pin and len(pin) == 4
    handover_booking(booking=booking, partner=world["partner"], pin=pin)
    return_booking(booking=booking, partner=world["partner"])
    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.RETURNED
    return booking


@pytest.mark.django_db
def test_release_deposit_refunds_deposit_amount_only(rental_world):
    booking = _returned_paid_booking(rental_world, deposit_paise=50000, daily_rate_paise=25000)
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    rental_fee = booking.price_paise
    deposit_amount = booking.deposit.amount_paise
    assert attempt.amount_paise == rental_fee + deposit_amount

    deposit = release_deposit(booking=booking, partner=rental_world["partner"])
    assert deposit.status == RentalDeposit.Status.RELEASED

    refunds = list(attempt.refunds.exclude(status=Refund.Status.FAILED))
    assert len(refunds) == 1
    refund = refunds[0]
    assert refund.amount_paise == deposit_amount
    assert refund.reason_code == "rental_deposit_released"
    assert refund.idempotency_key == f"automatic:rental_deposit_released:{attempt.id}"


@pytest.mark.django_db
def test_release_deposit_idempotent_replay(rental_world):
    booking = _returned_paid_booking(rental_world, deposit_paise=40000)
    release_deposit(booking=booking, partner=rental_world["partner"])
    booking.refresh_from_db()
    # Second release must fail closed on status, without a second refund row.
    from apps.rental.services import RentalStateError

    with pytest.raises(RentalStateError, match="not held"):
        release_deposit(booking=booking, partner=rental_world["partner"])
    attempt = booking.deposit.payment_attempt
    assert attempt.refunds.exclude(status=Refund.Status.FAILED).count() == 1


@pytest.mark.django_db
def test_dispute_partial_refunds_residual_and_ledgers_consume(rental_world):
    booking = _returned_paid_booking(rental_world, deposit_paise=80000)
    attempt = booking.deposit.payment_attempt
    consume = 30000
    residual = 50000

    disputed = dispute_deposit(
        booking=booking,
        partner=rental_world["partner"],
        reason="Scratched barrel",
        consume_paise=consume,
    )
    assert disputed.status == RentalBooking.Status.DISPUTED
    disputed.deposit.refresh_from_db()
    assert disputed.deposit.status == RentalDeposit.Status.PARTIALLY_CONSUMED
    assert disputed.deposit.consumed_paise == consume

    refunds = list(attempt.refunds.exclude(status=Refund.Status.FAILED))
    assert len(refunds) == 1
    assert refunds[0].amount_paise == residual
    assert refunds[0].reason_code == "rental_deposit_dispute_residual"

    entry = PartnerLedgerEntry.objects.get(
        idempotency_key=f"rental-deposit-consume:{booking.deposit_id}"
    )
    assert entry.kind == PartnerLedgerEntry.Kind.ADJUSTMENT
    assert entry.net_paise == consume
    assert entry.partner_id == rental_world["partner"].id


@pytest.mark.django_db
def test_dispute_zero_consume_refunds_full_deposit(rental_world):
    booking = _returned_paid_booking(rental_world, deposit_paise=45000)
    attempt = booking.deposit.payment_attempt

    disputed = dispute_deposit(
        booking=booking,
        partner=rental_world["partner"],
        reason="Flag only",
        consume_paise=0,
    )
    disputed.deposit.refresh_from_db()
    assert disputed.deposit.status == RentalDeposit.Status.RELEASED
    assert disputed.deposit.consumed_paise == 0

    refund = attempt.refunds.exclude(status=Refund.Status.FAILED).get()
    assert refund.amount_paise == 45000
    assert refund.reason_code == "rental_deposit_dispute_residual"
    assert not PartnerLedgerEntry.objects.filter(
        idempotency_key=f"rental-deposit-consume:{booking.deposit_id}"
    ).exists()


@pytest.mark.django_db
def test_dispute_full_consume_no_gateway_refund(rental_world):
    booking = _returned_paid_booking(rental_world, deposit_paise=60000)
    attempt = booking.deposit.payment_attempt

    disputed = dispute_deposit(
        booking=booking,
        partner=rental_world["partner"],
        reason="Lost charger and hood",
        consume_paise=60000,
    )
    disputed.deposit.refresh_from_db()
    assert disputed.deposit.status == RentalDeposit.Status.FULLY_CONSUMED
    assert not attempt.refunds.exclude(status=Refund.Status.FAILED).exists()

    entry = PartnerLedgerEntry.objects.get(
        idempotency_key=f"rental-deposit-consume:{booking.deposit_id}"
    )
    assert entry.net_paise == 60000


@pytest.mark.django_db
def test_release_without_payment_attempt_still_releases(rental_world):
    """Demo holds have no attempt — status moves without inventing a refund."""
    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Demo Hold Cam",
        daily_rate_paise=20000,
        deposit_paise=30000,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok")
    start = timezone.localdate() + timedelta(days=2)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=1),
        hold_deposit_for_demo=True,
    )
    pin = booking.handover_pin_hash
    handover_booking(booking=booking, partner=rental_world["partner"], pin=pin)
    return_booking(booking=booking, partner=rental_world["partner"])
    deposit = release_deposit(booking=booking, partner=rental_world["partner"])
    assert deposit.status == RentalDeposit.Status.RELEASED
    assert deposit.payment_attempt_id is None
    assert Refund.objects.count() == 0
