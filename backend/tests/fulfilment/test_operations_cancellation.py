"""Operations cancels and refunds a home-service visit from the visit page.

Refunding a visit used to mean copying its order id into the Refunds page and typing its
fulfilment-unit id; cancelling one for the customer was not possible from the console at all.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.commerce.models import Booking, PaymentAllocation
from apps.fulfilment.cancellation import (
    FEE_WAIVER_OPERATIONS,
    REFUND_REASON_OPERATIONS_CANCELLATION,
    operations_cancel_booking,
    preview_operations_cancellation,
)
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import BookingStatusHistory
from apps.identity.models import Role, User, UserRole
from tests.fulfilment.conftest import create_booked_group
from tests.helpers import force_role_client

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]

SHORT_NOTICE_FEE_PAISE = 9900


def _operator(phone: str = "+919840000001") -> User:
    user = User.objects.create_user(phone_number=phone, full_name="Ops Person")
    role, _created = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.create(user=user, role=role)
    return user


def _paid(booking: Booking) -> int:
    return sum(
        PaymentAllocation.objects.filter(fulfilment_unit=booking.fulfilment_unit).values_list(
            "amount_paise", flat=True
        )
    )


def test_a_full_refund_waives_the_short_notice_fee() -> None:
    booked = create_booked_group(key_prefix="ops-cancel-full")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(minutes=30)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking
    operator = _operator()

    cancelled, refunds = operations_cancel_booking(
        booking_id=booking.id,
        operator=operator,
        expected_version=booking.version,
        reason="Partner unavailable, customer agreed to cancel",
        full_refund=True,
        idempotency_key="ops-cancel-full-key",
    )

    assert cancelled.status == Booking.Status.CANCELLED
    assert sum(refund.amount_paise for refund in refunds) == _paid(booking)
    assert {refund.reason_code for refund in refunds} == {REFUND_REASON_OPERATIONS_CANCELLATION}
    history = BookingStatusHistory.objects.filter(
        booking=booking, to_status=Booking.Status.CANCELLED
    ).first()
    assert history is not None
    assert history.actor == operator
    assert history.context["fee_waiver"] == FEE_WAIVER_OPERATIONS
    assert history.context["cancelled_by"] == "operations"


def test_keeping_the_fee_applies_the_customers_fee_ladder() -> None:
    booked = create_booked_group(key_prefix="ops-cancel-fee")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(minutes=30)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking

    preview = preview_operations_cancellation(unit=unit, booking=booking)
    assert preview is not None
    assert preview.refundable_paise == _paid(booking)
    assert preview.policy_fee_paise == SHORT_NOTICE_FEE_PAISE

    _cancelled, refunds = operations_cancel_booking(
        booking_id=booking.id,
        operator=_operator(),
        expected_version=booking.version,
        reason="Customer changed their mind at the last minute",
        full_refund=False,
        idempotency_key="ops-cancel-fee-key",
    )

    assert sum(refund.amount_paise for refund in refunds) == _paid(booking) - SHORT_NOTICE_FEE_PAISE


def test_a_reason_is_required() -> None:
    booked = create_booked_group(key_prefix="ops-cancel-reason")

    with pytest.raises(BookingCommandInvalidApiError):
        operations_cancel_booking(
            booking_id=booked.booking.id,
            operator=_operator(),
            expected_version=booked.booking.version,
            reason="   ",
            full_refund=True,
        )

    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.CONFIRMED


def test_the_visit_read_offers_the_two_amounts_and_none_once_cancelled() -> None:
    booked = create_booked_group(key_prefix="ops-cancel-read")
    operator = _operator()
    client = force_role_client(user=operator, role_code="operations")
    url = f"/api/v1/operations/bookings/{booked.booking.id}/"

    before = client.get(url).json()["operations_cancellation"]
    assert before["refundable_paise"] == _paid(booked.booking)

    operations_cancel_booking(
        booking_id=booked.booking.id,
        operator=operator,
        expected_version=booked.booking.version,
        reason="Duplicate booking",
        full_refund=True,
    )

    assert client.get(url).json()["operations_cancellation"] is None


def test_the_endpoint_needs_a_fresh_step_up() -> None:
    booked = create_booked_group(key_prefix="ops-cancel-stepup")
    client = force_role_client(user=_operator(), role_code="operations")

    response = client.post(
        f"/api/v1/operations/bookings/{booked.booking.id}/cancel/",
        {"expected_version": booked.booking.version, "reason": "Test", "full_refund": True},
        format="json",
        HTTP_IDEMPOTENCY_KEY="ops-cancel-stepup-key",
    )

    assert response.status_code in {HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN}
    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.CONFIRMED
