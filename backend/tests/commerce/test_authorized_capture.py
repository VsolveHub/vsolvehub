"""P0-7: an authorized-only booking payment is captured by the platform, not left to the dashboard.

`RazorpayPaymentProvider` never called the capture API, so booking payments settled only if the
Razorpay dashboard's automatic capture happened to be on. With it off, `payment.authorized` moved
the attempt to `AUTHORIZED` and nothing else ever happened: the Customer's money was blocked, no
booking was created, and the attempt expired. Now `payment.authorized` on a group payment queues
`payment_attempt.capture_requested`, which captures while the group is still `PAYMENT_PENDING`.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.assignments.group_services import reconcile_group_dispatch
from apps.assignments.models import Reservation
from apps.carts.models import BookingGroup
from apps.commerce.models import FinancialException, Order, PaymentAttempt, Refund
from apps.commerce.providers import FakePaymentProvider, ProviderPayment
from apps.commerce.services import apply_provider_payment
from apps.foundation.models import OutboxEvent
from tests.commerce.test_payment_capture import _create_attempt, _payment_ready_group

pytestmark = pytest.mark.django_db(transaction=True)


def _authorized(attempt: PaymentAttempt, *, payment_id: str) -> ProviderPayment:
    return ProviderPayment(
        provider_payment_id=payment_id,
        provider_order_id=attempt.provider_order_id,
        amount_paise=attempt.amount_paise,
        currency=attempt.currency,
        status="authorized",
    )


def test_an_authorized_only_payment_is_captured_and_books_the_group() -> None:
    client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="authorized-only")
    FakePaymentProvider.record_payment(
        provider_payment_id="pay_authorized_only",
        provider_order_id=attempt.provider_order_id,
        amount_paise=attempt.amount_paise,
        status="authorized",
    )

    apply_provider_payment(
        provider_code="fake", payment=_authorized(attempt, payment_id="pay_authorized_only")
    )

    attempt.refresh_from_db()
    group.refresh_from_db()
    assert OutboxEvent.objects.get(
        event_type="payment_attempt.capture_requested", aggregate_id=attempt.id
    ).status == (OutboxEvent.Status.PUBLISHED)
    assert FakePaymentProvider().fetch_payment(
        provider_payment_id="pay_authorized_only"
    ).status == ("captured")
    assert attempt.status == PaymentAttempt.Status.CAPTURED
    assert Order.objects.filter(booking_group=group).count() == 1
    assert group.status == BookingGroup.Status.BOOKED


def test_a_payment_the_gateway_already_captured_is_read_back_not_captured_twice() -> None:
    """Dashboard automatic capture won the race: the capture call is refused, the truth applied."""

    client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="authorized-already-captured")
    FakePaymentProvider.record_payment(
        provider_payment_id="pay_already_captured",
        provider_order_id=attempt.provider_order_id,
        amount_paise=attempt.amount_paise,
        status="captured",
    )

    apply_provider_payment(
        provider_code="fake", payment=_authorized(attempt, payment_id="pay_already_captured")
    )

    attempt.refresh_from_db()
    assert attempt.status == PaymentAttempt.Status.CAPTURED
    assert Order.objects.filter(booking_group=group).count() == 1


def test_an_authorization_for_a_group_that_is_no_longer_payable_is_left_uncaptured() -> None:
    client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="authorized-after-expiry")
    Reservation.objects.filter(fulfilment_unit__booking_group=group).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    reconcile_group_dispatch(group_id=group.id)
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.EXPIRED
    FakePaymentProvider.record_payment(
        provider_payment_id="pay_authorized_late",
        provider_order_id=attempt.provider_order_id,
        amount_paise=attempt.amount_paise,
        status="authorized",
    )

    apply_provider_payment(
        provider_code="fake", payment=_authorized(attempt, payment_id="pay_authorized_late")
    )

    attempt.refresh_from_db()
    # Never captured: the gateway releases an uncaptured authorization back to the Customer.
    assert FakePaymentProvider().fetch_payment(
        provider_payment_id="pay_authorized_late"
    ).status == ("authorized")
    assert attempt.status == PaymentAttempt.Status.EXPIRED
    assert attempt.failure_code == "authorized_after_terminal"
    assert not Order.objects.filter(booking_group=group).exists()
    assert not Refund.objects.filter(payment_attempt=attempt).exists()
    assert FinancialException.objects.get(
        payment_attempt=attempt, code="authorized_not_captured"
    ).context["amount_paise"] == (attempt.amount_paise)
