"""Regression: unpaid A9 holds must expire; ghost holds must be repairable."""

from datetime import timedelta

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.commerce.tasks import expire_abandoned_payment_attempts
from apps.stay.models import StayReservation, UnitReservation
from apps.stay.services import (
    create_reservation,
    initiate_reservation_payment,
    repair_stay_ghost_holds,
)
from tests.stay.test_cancel import _seed

User = get_user_model()

pytestmark = pytest.mark.django_db


def test_expired_payment_releases_stay_reservation():
    prop, unit, _partner, _seed_customer = _seed(
        booking_mode="RESERVATION", slug="expiry-test-stay"
    )
    customer = User.objects.create_user(phone_number="+919933330005")

    start = timezone.localdate() + timedelta(days=1)
    res = create_reservation(
        customer=customer,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=start,
        check_out=start + timedelta(days=2),
    )
    initiate_reservation_payment(res.id)
    res.refresh_from_db()

    attempt = res.payment_attempt
    assert attempt is not None
    assert attempt.expires_at is not None
    assert attempt.purpose == PaymentAttempt.Purpose.A9_STAY_RESERVATION

    # Standalone A9 attempts start PROVIDER_PENDING without an order id; the
    # expire task skips those during the order-create grace window. Backdate
    # created_at so expires_at stays after created_at (corrupt-window guard)
    # while still being in the past, and attach an order id to leave grace.
    created = timezone.now() - timedelta(minutes=5)
    PaymentAttempt.objects.filter(id=attempt.id).update(
        created_at=created,
        expires_at=timezone.now() - timedelta(seconds=1),
        provider_order_id="order_test_stay_expire",
    )

    expired = expire_abandoned_payment_attempts()
    assert expired == 1

    res.refresh_from_db()
    attempt.refresh_from_db()
    unit_res = res.unit_reservation
    assert attempt.status == PaymentAttempt.Status.EXPIRED
    assert res.status == StayReservation.Status.CANCELLED
    assert res.cancellation_reason == "payment_attempt_expired"
    assert unit_res.status == UnitReservation.Status.RELEASED

    # Same dates are bookable again after the unpaid hold expires.
    again = create_reservation(
        customer=customer,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=start,
        check_out=start + timedelta(days=2),
    )
    assert again.status == StayReservation.Status.HELD
    initiate_reservation_payment(again.id)
    again.refresh_from_db()
    assert again.status == StayReservation.Status.PAYMENT_PENDING
    window = timedelta(seconds=settings.M1_PAYMENT_WINDOW_SECONDS)
    assert again.payment_attempt.expires_at <= timezone.now() + window


def test_repair_stay_ghost_hold_releases_cancelled_unit_reservation():
    """CANCELLED stay with a still-HELD UnitReservation must be repairable."""
    prop, unit, _partner, _seed_customer = _seed(
        booking_mode="RESERVATION", slug="ghost-repair-cancelled"
    )
    customer = User.objects.create_user(phone_number="+919933330006")
    start = timezone.localdate() + timedelta(days=3)
    res = create_reservation(
        customer=customer,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=start,
        check_out=start + timedelta(days=2),
    )
    unit_res = res.unit_reservation
    assert unit_res.status == UnitReservation.Status.HELD

    # Simulate historical ghost: stay CANCELLED, unit hold still HELD.
    res.status = StayReservation.Status.CANCELLED
    res.cancelled_at = timezone.now()
    res.cancellation_reason = "simulated_ghost"
    res.save(update_fields=("status", "cancelled_at", "cancellation_reason", "updated_at"))

    repaired = repair_stay_ghost_holds()
    assert repaired >= 1
    unit_res.refresh_from_db()
    assert unit_res.status == UnitReservation.Status.RELEASED


def test_repair_stay_ghost_hold_releases_expired_payment_pending():
    """PAYMENT_PENDING stay with EXPIRED PaymentAttempt must cancel + release."""
    prop, unit, _partner, _seed_customer = _seed(
        booking_mode="RESERVATION", slug="ghost-repair-expired-pay"
    )
    customer = User.objects.create_user(phone_number="+919933330007")
    start = timezone.localdate() + timedelta(days=5)
    res = create_reservation(
        customer=customer,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=start,
        check_out=start + timedelta(days=2),
    )
    initiate_reservation_payment(res.id)
    res.refresh_from_db()
    attempt = res.payment_attempt
    assert attempt is not None

    # Leave the stay PAYMENT_PENDING with a HELD unit, but mark the attempt
    # EXPIRED without running the expire sweeper (historical gap).
    PaymentAttempt.objects.filter(id=attempt.id).update(
        status=PaymentAttempt.Status.EXPIRED,
        failure_code="payment_attempt_expired",
    )
    unit_res = res.unit_reservation
    assert unit_res.status == UnitReservation.Status.HELD
    assert res.status == StayReservation.Status.PAYMENT_PENDING

    repaired = repair_stay_ghost_holds()
    assert repaired >= 1

    unit_res.refresh_from_db()
    res.refresh_from_db()
    assert unit_res.status == UnitReservation.Status.RELEASED
    assert res.status == StayReservation.Status.CANCELLED
    assert res.cancellation_reason == "ghost_hold_repair"

    # Dates must be bookable again after repair.
    again = create_reservation(
        customer=customer,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=start,
        check_out=start + timedelta(days=2),
    )
    assert again.status == StayReservation.Status.HELD
