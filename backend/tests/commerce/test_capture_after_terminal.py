"""P0-3: money that lands after a group stopped being payable is refunded, never booked.

A Customer can still complete Razorpay Checkout after they cancelled the booking in another tab, or
after the five-minute payment window ran out and compensation released every Partner hold and told
each Partner the job was gone. Capture used to re-confirm those *released* holds and book the visit
anyway. Now a capture on a group that is not `PAYMENT_PENDING` is refunded in full, opens a
`FinancialException`, and leaves every hold released.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.assignments.group_services import cancel_booking_group, reconcile_group_dispatch
from apps.assignments.models import Reservation
from apps.carts.models import BookingGroup, CheckoutSession
from apps.commerce.models import (
    Booking,
    FinancialException,
    Order,
    PaymentAttempt,
    Refund,
)
from apps.commerce.providers import ProviderPayment
from apps.commerce.services import apply_provider_payment
from tests.commerce.test_payment_capture import _create_attempt, _payment_ready_group

pytestmark = pytest.mark.django_db(transaction=True)


def _captured(attempt: PaymentAttempt, *, payment_id: str) -> ProviderPayment:
    return ProviderPayment(
        provider_payment_id=payment_id,
        provider_order_id=attempt.provider_order_id,
        amount_paise=attempt.amount_paise,
        currency=attempt.currency,
        status="captured",
    )


def _assert_refunded_not_booked(group: BookingGroup, attempt: PaymentAttempt) -> None:
    attempt.refresh_from_db()
    assert not Order.objects.filter(booking_group=group).exists()
    assert not Booking.objects.filter(fulfilment_unit__booking_group=group).exists()
    refund = Refund.objects.get(payment_attempt=attempt)
    assert refund.reason_code == "capture_after_terminal"
    assert refund.amount_paise == attempt.amount_paise
    assert refund.status == Refund.Status.SUCCEEDED
    assert attempt.status == PaymentAttempt.Status.REFUNDED
    assert attempt.failure_code == "capture_after_terminal"
    exception = FinancialException.objects.get(
        payment_attempt=attempt, code="capture_after_terminal"
    )
    assert exception.status == FinancialException.Status.OPEN
    assert exception.context["booking_group_id"] == str(group.id)
    # The released holds stay released: no Partner is re-booked onto a job they were told is gone.
    assert not Reservation.objects.filter(
        fulfilment_unit__booking_group=group,
        status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
    ).exists()


def test_customer_cancelling_while_checkout_is_open_voids_the_payment_attempt() -> None:
    client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="cancel-open-checkout")
    assert attempt.status == PaymentAttempt.Status.CREATED

    response = client.post(
        f"/api/v1/booking-groups/{group.id}/cancel/",
        {"expected_version": group.version},
        format="json",
        HTTP_IDEMPOTENCY_KEY="cancel-open-checkout-group",
    )

    assert response.status_code == HTTPStatus.OK, response.json()
    attempt.refresh_from_db()
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.CANCELLED
    assert attempt.status == PaymentAttempt.Status.EXPIRED
    assert attempt.failure_code == "booking_group_cancelled"
    assert CheckoutSession.objects.get(id=checkout.id).status == CheckoutSession.Status.CANCELLED


def test_payment_captured_after_customer_cancellation_is_refunded() -> None:
    client, customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="capture-after-cancel")
    cancel_booking_group(customer_id=customer.id, group_id=group.id, expected_version=group.version)

    result = apply_provider_payment(
        provider_code="fake", payment=_captured(attempt, payment_id="fake_after_cancel")
    )

    assert result is None
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.CANCELLED
    _assert_refunded_not_booked(group, attempt)


def test_payment_captured_after_group_expiry_is_refunded() -> None:
    client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="capture-after-expiry")
    Reservation.objects.filter(fulfilment_unit__booking_group=group).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    reconcile_group_dispatch(group_id=group.id)
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.EXPIRED

    result = apply_provider_payment(
        provider_code="fake", payment=_captured(attempt, payment_id="fake_after_expiry")
    )

    assert result is None
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.EXPIRED
    _assert_refunded_not_booked(group, attempt)


def test_duplicate_capture_on_a_terminal_group_refunds_exactly_once() -> None:
    client, customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="capture-twice-terminal")
    cancel_booking_group(customer_id=customer.id, group_id=group.id, expected_version=group.version)
    payment = _captured(attempt, payment_id="fake_twice_terminal")

    apply_provider_payment(provider_code="fake", payment=payment)
    apply_provider_payment(provider_code="fake", payment=payment)

    assert Refund.objects.filter(payment_attempt=attempt).count() == 1
    assert FinancialException.objects.filter(payment_attempt=attempt).count() == 1
    _assert_refunded_not_booked(group, attempt)


def test_duplicate_capture_on_a_payable_group_books_exactly_once() -> None:
    client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="capture-twice-payable")
    payment = _captured(attempt, payment_id="fake_twice_payable")

    first = apply_provider_payment(provider_code="fake", payment=payment)
    second = apply_provider_payment(provider_code="fake", payment=payment)

    assert first is not None
    assert second == first
    assert Order.objects.filter(booking_group=group).count() == 1
    assert Booking.objects.filter(order=first).count() == group.units.count()
    assert not Refund.objects.filter(payment_attempt=attempt).exists()
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.BOOKED
