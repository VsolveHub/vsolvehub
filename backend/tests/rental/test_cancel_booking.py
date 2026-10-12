"""Focused A7 customer cancel: pre-handover only, fail-closed after handover."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status

from apps.catalog.models import (
    A7VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.commerce.models import PaymentAttempt
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.rental.models import AssetReservation, RentalBooking, RentalDeposit
from apps.rental.services import (
    RentalStateError,
    cancel_booking,
    create_asset,
    create_booking,
    handover_booking,
    mark_deposit_held,
    moderate_asset,
    submit_asset,
)
from tests.helpers import force_role_client

User = get_user_model()


def _customer_client(user):
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="customer")


@pytest.fixture
def rental_world(db):
    category = Category.objects.create(slug="rental-cancel-test", name="Rental Cancel Test")
    sub = Subcategory.objects.create(category=category, slug="tools-cancel", name="Tools")
    service = Service.objects.create(
        subcategory=sub, slug="drill-cancel", name="Drill", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="drill-rental-cancel",
        name="Drill rental cancel",
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
    owner = User.objects.create(phone_number="+919922220001", full_name="Owner Cancel")
    partner = PartnerProfile.objects.create(user=owner, display_name="Owner Cancel Co")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        status=PartnerCapability.Status.APPROVED,
    )
    customer = User.objects.create(phone_number="+919922220002", full_name="Customer Cancel")
    return {
        "variant": variant,
        "partner": partner,
        "owner": owner,
        "customer": customer,
    }


def _booked(rental_world, *, hold_deposit_for_demo: bool = False) -> RentalBooking:
    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Cancel Drill",
        daily_rate_paise=50000,
        deposit_paise=100000,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok")
    start = timezone.localdate() + timedelta(days=1)
    return create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
        hold_deposit_for_demo=hold_deposit_for_demo,
    )


@pytest.mark.django_db
def test_cancel_pending_payment_releases_reservation(rental_world):
    booking = _booked(rental_world)
    assert booking.status == RentalBooking.Status.PENDING_PAYMENT
    cancelled = cancel_booking(booking=booking, customer=rental_world["customer"])
    assert cancelled.status == RentalBooking.Status.CANCELLED
    reservation = AssetReservation.objects.get(id=cancelled.reservation_id)
    assert reservation.status == AssetReservation.Status.RELEASED


@pytest.mark.django_db
def test_cancel_confirmed_releases_deposit_and_refunds(rental_world):
    booking = _booked(rental_world)
    mark_deposit_held(payment_attempt_id=booking.deposit.payment_attempt_id)
    booking.refresh_from_db()
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    attempt.status = PaymentAttempt.Status.CAPTURED
    attempt.save(update_fields=("status", "updated_at"))

    cancelled = cancel_booking(booking=booking, customer=rental_world["customer"])
    assert cancelled.status == RentalBooking.Status.CANCELLED
    cancelled.deposit.refresh_from_db()
    assert cancelled.deposit.status == RentalDeposit.Status.RELEASED
    assert cancelled.deposit.payment_attempt.refunds.exists()


@pytest.mark.django_db
def test_cancel_fail_closed_after_handover(rental_world):
    booking = _booked(rental_world, hold_deposit_for_demo=True)
    assert booking.status == RentalBooking.Status.CONFIRMED
    handover_booking(
        booking=booking,
        partner=rental_world["partner"],
        pin=booking.handover_pin_hash,
    )
    booking.refresh_from_db()
    with pytest.raises(RentalStateError, match="after handover"):
        cancel_booking(booking=booking, customer=rental_world["customer"])


@pytest.mark.django_db
def test_cancel_http_endpoint(rental_world):
    booking = _booked(rental_world)
    client = _customer_client(rental_world["customer"])
    response = client.post(f"/api/v1/me/rentals/{booking.id}/cancel")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == RentalBooking.Status.CANCELLED


@pytest.mark.django_db
def test_cancel_http_with_null_payment_attempt(rental_world):
    """Regression: nullable deposit.payment_attempt must not 500 under FOR UPDATE.

    PostgreSQL rejects ``SELECT … FOR UPDATE`` when Django left-joins a nullable
    FK via ``select_related("deposit__payment_attempt")``. Clearing the attempt
    forces that join path if the lock query is wrong.
    """
    booking = _booked(rental_world)
    deposit = booking.deposit
    deposit.payment_attempt = None
    deposit.save(update_fields=("payment_attempt", "updated_at"))

    client = _customer_client(rental_world["customer"])
    response = client.post(f"/api/v1/me/rentals/{booking.id}/cancel")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == RentalBooking.Status.CANCELLED
    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CANCELLED


@pytest.mark.django_db
def test_cancel_http_forbidden_after_handover(rental_world):
    booking = _booked(rental_world, hold_deposit_for_demo=True)
    handover_booking(
        booking=booking,
        partner=rental_world["partner"],
        pin=booking.handover_pin_hash,
    )
    client = _customer_client(rental_world["customer"])
    response = client.post(f"/api/v1/me/rentals/{booking.id}/cancel")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "handover" in response.data["error"]["message"].lower()


@pytest.mark.django_db
def test_partner_cancel_booking(rental_world):
    booking = _booked(rental_world)
    reservation_id = booking.reservation_id
    client = force_role_client(user=rental_world["owner"], role_code="partner")
    response = client.post(
        f"/api/v1/partner/rentals/bookings/{booking.id}/cancel",
        {"reason": "Partner unavailable"},
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == RentalBooking.Status.CANCELLED

    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CANCELLED
    reservation = AssetReservation.objects.get(id=reservation_id)
    assert reservation.status == AssetReservation.Status.RELEASED


@pytest.mark.django_db
def test_partner_cancel_confirmed_full_refunds(rental_world):
    booking = _booked(rental_world)
    mark_deposit_held(payment_attempt_id=booking.deposit.payment_attempt_id)
    booking.refresh_from_db()
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    attempt.status = PaymentAttempt.Status.CAPTURED
    attempt.save(update_fields=("status", "updated_at"))

    cancelled = cancel_booking(
        booking=booking,
        partner=rental_world["partner"],
        reason="Stock unavailable",
    )
    assert cancelled.status == RentalBooking.Status.CANCELLED
    cancelled.deposit.refresh_from_db()
    assert cancelled.deposit.status == RentalDeposit.Status.RELEASED
    assert cancelled.deposit.payment_attempt.refunds.exists()
    reservation = AssetReservation.objects.get(id=cancelled.reservation_id)
    assert reservation.status == AssetReservation.Status.RELEASED


@pytest.mark.django_db
def test_ops_force_cancel_booking(rental_world):
    booking = _booked(rental_world)
    reservation_id = booking.reservation_id
    ops_user = User.objects.create(phone_number="+919922220003", full_name="Ops Cancel")
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=ops_user, role=role, revoked_at=None)

    client = force_role_client(user=ops_user, role_code="operations")
    response = client.post(
        f"/api/v1/ops/rentals/bookings/{booking.id}/cancel",
        {"reason": "Owner reported the drill broken"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == RentalBooking.Status.CANCELLED
    assert response.data["cancellation_reason"] == "Owner reported the drill broken"

    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CANCELLED
    assert booking.cancellation_reason == "Owner reported the drill broken"
    assert booking.cancelled_at is not None
    reservation = AssetReservation.objects.get(id=reservation_id)
    assert reservation.status == AssetReservation.Status.RELEASED


@pytest.mark.django_db
def test_per_booking_handover_pins_are_unique(rental_world):
    """T7: each booking gets its own PIN; User.rental_handover_pin_hash stays unused."""
    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="PIN Drill",
        daily_rate_paise=50000,
        deposit_paise=100000,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok")
    start = timezone.localdate() + timedelta(days=1)
    first = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=1),
        hold_deposit_for_demo=True,
    )
    second = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start + timedelta(days=3),
        end_date=start + timedelta(days=4),
        hold_deposit_for_demo=True,
    )
    assert first.handover_pin_hash
    assert second.handover_pin_hash
    assert len(first.handover_pin_hash) == 4
    assert first.handover_pin_hash.isdigit()
    # Distinct bookings must not share a PIN (retry if the 1/10000 collision hits).
    if first.handover_pin_hash == second.handover_pin_hash:
        third = create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=start + timedelta(days=6),
            end_date=start + timedelta(days=7),
            hold_deposit_for_demo=True,
        )
        assert third.handover_pin_hash != first.handover_pin_hash
    else:
        assert first.handover_pin_hash != second.handover_pin_hash

    rental_world["customer"].refresh_from_db()
    assert (rental_world["customer"].rental_handover_pin_hash or "") == ""

    with pytest.raises(RentalStateError) as bad:
        handover_booking(
            booking=second,
            partner=rental_world["partner"],
            pin=first.handover_pin_hash,
        )
    assert bad.value.code == "handover_pin_invalid"

    handover_booking(
        booking=second,
        partner=rental_world["partner"],
        pin=second.handover_pin_hash,
    )
    second.refresh_from_db()
    assert second.status == RentalBooking.Status.HANDOVER


@pytest.mark.django_db
def test_ops_cancel_requires_a_reason(rental_world):
    """Regression: Operations cancels were recorded only as "Ops force-cancel"."""
    booking = _booked(rental_world)
    ops_user = User.objects.create(phone_number="+919922220013", full_name="Ops Reason")
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=ops_user, role=role, revoked_at=None)
    client = force_role_client(user=ops_user, role_code="operations")

    for body in ({}, {"reason": "   "}):
        response = client.post(
            f"/api/v1/ops/rentals/bookings/{booking.id}/cancel", body, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    booking.refresh_from_db()
    assert booking.status != RentalBooking.Status.CANCELLED


@pytest.mark.django_db
def test_customer_cancel_stamps_the_time_without_a_reason(rental_world):
    booking = _booked(rental_world)
    cancelled = cancel_booking(booking=booking, customer=rental_world["customer"])
    assert cancelled.cancelled_at is not None
    assert cancelled.cancellation_reason == ""
