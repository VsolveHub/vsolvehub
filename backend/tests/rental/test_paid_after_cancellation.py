"""A rental payment that lands after its booking was cancelled is refunded, never kept.

Reproduced locally on 22 November 2026: a customer paid at 00:18:07, cancelled at 00:18:51 before
the capture was recorded, and when it was recorded the deposit was held, the reservation was
re-confirmed for dates nobody had booked, and no refund was asked for.

The rules asserted here:

* a capture on a cancelled booking asks for a full refund, keeps the deposit released, leaves the
  reservation released and opens a financial exception for Operations;
* replaying that capture asks for nothing more;
* a booking cancelled after its payment was recorded is not refunded a second time by a replay;
* cancelling asks the provider about an open payment first, so a paid booking is cancelled as a
  paid one, and a provider failure there does not stop the cancel.
"""

from typing import Any
from uuid import UUID

import pytest

from apps.commerce.models import FinancialException, PaymentAttempt, Refund
from apps.rental.models import AssetReservation, RentalBooking, RentalDeposit
from apps.rental.services import (
    PAID_AFTER_CANCELLATION,
    cancel_booking,
    complete_rental_booking_payment,
    mark_deposit_held,
)
from tests.rental.test_cancel_booking import _booked, rental_world  # noqa: F401


def _attempt(booking: RentalBooking) -> PaymentAttempt:
    booking.refresh_from_db()
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    return attempt


def _capture(attempt: PaymentAttempt) -> None:
    """What `apply_provider_payment` does before it hands the capture to the rental app."""

    attempt.status = PaymentAttempt.Status.CAPTURED
    attempt.save(update_fields=("status", "updated_at"))


def _refunds(attempt: PaymentAttempt) -> list[Refund]:
    return list(attempt.refunds.exclude(status=Refund.Status.FAILED))


@pytest.mark.django_db
@pytest.mark.parametrize("record", [complete_rental_booking_payment, mark_deposit_held])
def test_a_payment_after_cancellation_is_refunded_and_holds_nothing(
    rental_world: dict[str, Any],  # noqa: F811
    record: Any,
) -> None:
    booking = _booked(rental_world)
    attempt = _attempt(booking)
    cancel_booking(booking=booking, customer=rental_world["customer"])

    _capture(attempt)
    record(payment_attempt_id=attempt.id)

    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CANCELLED
    deposit = RentalDeposit.objects.get(id=booking.deposit_id)
    assert deposit.status != RentalDeposit.Status.HELD
    reservation = AssetReservation.objects.get(id=booking.reservation_id)
    assert reservation.status == AssetReservation.Status.RELEASED
    [refund] = _refunds(attempt)
    assert refund.reason_code == PAID_AFTER_CANCELLATION
    assert refund.amount_paise == attempt.amount_paise
    assert FinancialException.objects.filter(
        kind=FinancialException.Kind.CAPTURE_WITHOUT_CAPACITY,
        payment_attempt=attempt,
        status=FinancialException.Status.OPEN,
    ).exists()


@pytest.mark.django_db
def test_a_replayed_late_capture_asks_for_no_second_refund(
    rental_world: dict[str, Any],  # noqa: F811
) -> None:
    booking = _booked(rental_world)
    attempt = _attempt(booking)
    cancel_booking(booking=booking, customer=rental_world["customer"])
    _capture(attempt)

    complete_rental_booking_payment(payment_attempt_id=attempt.id)
    complete_rental_booking_payment(payment_attempt_id=attempt.id)

    assert len(_refunds(attempt)) == 1
    assert (
        FinancialException.objects.filter(
            payment_attempt=attempt, status=FinancialException.Status.OPEN
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_a_capture_replayed_after_a_paid_cancel_is_not_refunded_twice(
    rental_world: dict[str, Any],  # noqa: F811
) -> None:
    booking = _booked(rental_world)
    attempt = _attempt(booking)
    _capture(attempt)
    complete_rental_booking_payment(payment_attempt_id=attempt.id)
    cancel_booking(booking=booking, customer=rental_world["customer"])
    assert len(_refunds(attempt)) == 1

    complete_rental_booking_payment(payment_attempt_id=attempt.id)

    [refund] = _refunds(attempt)
    assert refund.reason_code != PAID_AFTER_CANCELLATION
    deposit = RentalDeposit.objects.get(id=booking.deposit_id)
    assert deposit.status == RentalDeposit.Status.RELEASED
    assert not FinancialException.objects.filter(
        code=PAID_AFTER_CANCELLATION, payment_attempt=attempt
    ).exists()


@pytest.mark.django_db
def test_a_capture_on_a_live_booking_still_confirms_it(
    rental_world: dict[str, Any],  # noqa: F811
) -> None:
    booking = _booked(rental_world)
    attempt = _attempt(booking)
    _capture(attempt)

    complete_rental_booking_payment(payment_attempt_id=attempt.id)

    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CONFIRMED
    assert RentalDeposit.objects.get(id=booking.deposit_id).status == RentalDeposit.Status.HELD
    assert _refunds(attempt) == []


@pytest.mark.django_db
def test_cancelling_records_a_payment_the_provider_took_and_refunds_it(
    rental_world: dict[str, Any],  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    booking = _booked(rental_world)
    attempt = _attempt(booking)
    attempt.provider_order_id = "order_paid_but_unrecorded"
    attempt.status = PaymentAttempt.Status.CREATED
    attempt.save(update_fields=("provider_order_id", "status", "updated_at"))
    asked: list[UUID] = []

    def provider_says_paid(*, attempt_id: UUID) -> PaymentAttempt:
        # What `reconcile_payment_attempt` does when the provider reports a capture.
        asked.append(attempt_id)
        paid = PaymentAttempt.objects.get(id=attempt_id)
        _capture(paid)
        complete_rental_booking_payment(payment_attempt_id=attempt_id)
        return paid

    monkeypatch.setattr("apps.commerce.services.reconcile_payment_attempt", provider_says_paid)

    cancelled = cancel_booking(booking=booking, customer=rental_world["customer"])

    assert asked == [attempt.id]
    assert cancelled.status == RentalBooking.Status.CANCELLED
    # Cancelled as a paid booking: the ordinary cancel refund, not a late-capture one.
    [refund] = _refunds(attempt)
    assert refund.reason_code != PAID_AFTER_CANCELLATION
    assert RentalDeposit.objects.get(id=booking.deposit_id).status == RentalDeposit.Status.RELEASED


@pytest.mark.django_db
def test_a_provider_failure_before_cancelling_does_not_stop_the_cancel(
    rental_world: dict[str, Any],  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    booking = _booked(rental_world)
    attempt = _attempt(booking)
    attempt.provider_order_id = "order_provider_down"
    attempt.status = PaymentAttempt.Status.CREATED
    attempt.save(update_fields=("provider_order_id", "status", "updated_at"))

    def provider_down(*, attempt_id: UUID) -> PaymentAttempt:  # noqa: ARG001
        raise RuntimeError("provider unreachable")

    monkeypatch.setattr("apps.commerce.services.reconcile_payment_attempt", provider_down)

    cancelled = cancel_booking(booking=booking, customer=rental_world["customer"])

    assert cancelled.status == RentalBooking.Status.CANCELLED
    assert _refunds(attempt) == []


@pytest.mark.django_db
def test_an_unpaid_booking_without_a_provider_order_is_not_looked_up(
    rental_world: dict[str, Any],  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    booking = _booked(rental_world)
    attempt = _attempt(booking)
    attempt.provider_order_id = ""
    attempt.status = PaymentAttempt.Status.CREATED
    attempt.save(update_fields=("provider_order_id", "status", "updated_at"))

    def must_not_be_called(*, attempt_id: UUID) -> PaymentAttempt:  # noqa: ARG001
        raise AssertionError("no order to ask about")

    monkeypatch.setattr("apps.commerce.services.reconcile_payment_attempt", must_not_be_called)

    assert (
        cancel_booking(booking=booking, customer=rental_world["customer"]).status
        == RentalBooking.Status.CANCELLED
    )
