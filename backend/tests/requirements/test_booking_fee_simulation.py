"""The development payment door for an accepted A3 crew booking.

The simulator must finish the same aggregate transition as a provider callback. Merely changing
``PaymentAttempt.status`` would leave the fee pending, the crew held rather than confirmed and no
engagement for either side to open.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.commerce.providers import FakePaymentProvider
from apps.requirements.models import (
    BookingFee,
    Engagement,
    RateCard,
    RateCardBooking,
    VendorInvitation,
)

from .conftest import M2World, submitted_requirement

pytestmark = pytest.mark.django_db(transaction=True)


@override_settings(PAYMENT_PROVIDER="fake", PAYMENTS_ALLOW_SIMULATED_CAPTURE=True)
def test_one_simulated_capture_confirms_the_crew_and_opens_the_engagement(
    world: M2World,
) -> None:
    requirement = submitted_requirement(world=world)
    invitation = VendorInvitation.objects.get(requirement=requirement, partner=world.vendor)
    invitation.status = VendorInvitation.Status.ACCEPTED
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=("status", "accepted_at", "updated_at"))
    rate_card = RateCard.objects.create(
        service_area=world.area,
        skill=world.skill,
        worker_day_wage_paise=60_000,
        supervision_margin_paise=25_000,
        booking_fee_paise=5_000,
        customer_day_rate_paise=90_000,
        standard_day_hours=8,
        overtime_hourly_paise=11_250,
        add_on_rates={},
        inclusions=[],
        effective_from=timezone.localdate() - timedelta(days=1),
    )
    booking = RateCardBooking.objects.create(
        requirement=requirement,
        rate_card=rate_card,
        accepted_invitation=invitation,
        status=RateCardBooking.Status.OFFER_HELD,
        headcount=1,
        days=1,
        day_rate_paise=90_000,
        worker_day_wage_paise=60_000,
        supervision_margin_paise=25_000,
        booking_fee_component_paise=5_000,
        standard_day_hours=8,
        overtime_hourly_paise=11_250,
        add_on_rates={},
        inclusions=[],
        total_customer_paise=90_000,
        lead_receipt_paise=85_000,
        booking_fee_paise=5_000,
        wave=1,
        hold_expires_at=timezone.now() + timedelta(minutes=15),
    )
    attempt = PaymentAttempt.objects.create(
        purpose=PaymentAttempt.Purpose.M2_BOOKING_FEE,
        provider=FakePaymentProvider.code,
        amount_paise=booking.booking_fee_paise,
        currency="INR",
        status=PaymentAttempt.Status.PROVIDER_PENDING,
        expires_at=booking.hold_expires_at,
    )
    fee = BookingFee.objects.create(
        booking=booking,
        requirement=requirement,
        invitation=invitation,
        rate_card=rate_card,
        amount_paise=booking.booking_fee_paise,
        status=BookingFee.Status.PENDING,
        payment_attempt=attempt,
    )

    response = world.customer_client.post(
        f"/api/v1/payment-attempts/{attempt.id}/simulate-capture/"
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["status"] == PaymentAttempt.Status.CAPTURED
    attempt.refresh_from_db()
    fee.refresh_from_db()
    booking.refresh_from_db()
    engagement = Engagement.objects.get(requirement=requirement)
    assert attempt.provider_order_id
    assert fee.status == BookingFee.Status.ACTIVE
    assert fee.activated_at is not None
    assert booking.status == RateCardBooking.Status.CONFIRMED
    assert engagement.partner_id == world.vendor.id
    assert engagement.customer_id == world.customer.id
