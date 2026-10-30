"""Regression: unpaid A7 holds must expire, and overlap refusals use the API envelope."""

from datetime import timedelta

import pytest
from django.conf import settings
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
from apps.commerce.tasks import expire_abandoned_payment_attempts
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.rental.models import AssetReservation, RentalBooking
from apps.rental.services import (
    create_asset,
    create_booking,
    moderate_asset,
    submit_asset,
)
from tests.helpers import force_role_client

User = get_user_model()


@pytest.fixture
def rental_world(db):  # noqa: ARG001 - requested so the test database exists
    category = Category.objects.create(slug="rental-expire-test", name="Rental Expire Test")
    sub = Subcategory.objects.create(category=category, slug="tools-expire", name="Tools")
    service = Service.objects.create(
        subcategory=sub, slug="drill-expire", name="Drill", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="drill-rental-expire",
        name="Drill rental expire",
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
    owner = User.objects.create(phone_number="+919933330001", full_name="Owner Expire")
    partner = PartnerProfile.objects.create(user=owner, display_name="Owner Expire Co")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        status=PartnerCapability.Status.APPROVED,
    )
    customer = User.objects.create(phone_number="+919933330002", full_name="Customer Expire")
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=customer, role=role, revoked_at=None)
    return {
        "variant": variant,
        "partner": partner,
        "owner": owner,
        "customer": customer,
    }


def _published_asset(rental_world):
    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Expire Drill",
        daily_rate_paise=50000,
        deposit_paise=100000,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok")
    return asset


@pytest.mark.django_db
def test_overlap_book_returns_contract_error_envelope(rental_world):
    asset = _published_asset(rental_world)
    start = timezone.localdate() + timedelta(days=1)
    end = start + timedelta(days=2)
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
    )
    client = force_role_client(user=rental_world["customer"], role_code="customer")
    response = client.post(
        "/api/v1/rentals/book",
        {
            "asset_id": str(asset.id),
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "pickup_or_delivery_mode": "PICKUP",
            "notes": "",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert "error" in body
    # Stock exhaustion surfaces the domain code (out_of_stock), not a generic
    # rental_state_invalid, so FE can map choose_again recovery.
    assert body["error"]["code"] == "out_of_stock"
    assert "out of stock" in body["error"]["message"].lower()
    # Bare DRF {"detail": "..."} must not leak — customer client treats it as
    # ApiContractError ("unexpected response").
    assert "detail" not in body


@pytest.mark.django_db
def test_expired_payment_releases_rental_reservation(rental_world):
    asset = _published_asset(rental_world)
    start = timezone.localdate() + timedelta(days=1)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
    )
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    assert attempt.expires_at is not None
    # Standalone A7 attempts start PROVIDER_PENDING without an order id; the
    # expire task skips those during the order-create grace window. Backdate
    # created_at so expires_at stays after created_at (corrupt-window guard)
    # while still being in the past, and attach an order id to leave grace.
    created = timezone.now() - timedelta(minutes=5)
    PaymentAttempt.objects.filter(id=attempt.id).update(
        created_at=created,
        expires_at=timezone.now() - timedelta(seconds=1),
        provider_order_id="order_test_rental_expire",
    )

    expired = expire_abandoned_payment_attempts()
    assert expired == 1

    booking.refresh_from_db()
    attempt.refresh_from_db()
    reservation = AssetReservation.objects.get(id=booking.reservation_id)
    assert attempt.status == PaymentAttempt.Status.EXPIRED
    assert booking.status == RentalBooking.Status.CANCELLED
    assert reservation.status == AssetReservation.Status.RELEASED

    # Same dates are bookable again after the unpaid hold expires.
    again = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
    )
    assert again.status == RentalBooking.Status.PENDING_PAYMENT
    assert again.deposit.payment_attempt.expires_at is not None
    window = timedelta(seconds=settings.M1_PAYMENT_WINDOW_SECONDS)
    assert again.deposit.payment_attempt.expires_at <= timezone.now() + window


@pytest.mark.django_db
def test_expire_skips_corrupt_window_and_provider_pending_grace(rental_world):
    """An expires_at that lands at/before created_at must not kill order create."""
    asset = _published_asset(rental_world)
    start = timezone.localdate() + timedelta(days=1)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
    )
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    # Simulate the bad window that previously raced outbox create_provider_order.
    PaymentAttempt.objects.filter(id=attempt.id).update(
        status=PaymentAttempt.Status.PROVIDER_PENDING,
        provider_order_id="",
        expires_at=attempt.created_at - timedelta(seconds=1),
    )

    assert expire_abandoned_payment_attempts() == 0
    attempt.refresh_from_db()
    assert attempt.status == PaymentAttempt.Status.PROVIDER_PENDING
    assert booking.status == RentalBooking.Status.PENDING_PAYMENT
