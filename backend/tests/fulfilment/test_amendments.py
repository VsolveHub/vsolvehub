"""Scope amendment: propose -> Customer decide -> revision payment -> authorized WorkTasks."""

import itertools

import pytest

from apps.commerce.models import PaymentAllocation, PaymentAttempt
from apps.commerce.providers import ProviderPayment
from apps.commerce.services import create_provider_order
from apps.fulfilment.amendments import (
    approve_scope_amendment,
    confirm_scope_amendment_payment,
    decline_scope_amendment,
    propose_scope_amendment,
)
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import ScopeAmendment, WorkTask
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.identity.models import User
from tests.fulfilment.conftest import create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)
_operator_sequence = itertools.count(1)


def _in_progress_booking(key_prefix: str) -> object:
    booked = create_booked_group(key_prefix=key_prefix)
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    operator = User.objects.create_user(phone_number=f"+91982{next(_operator_sequence):07d}")
    operations_assisted_start(
        booking_id=booking.id,
        operator=operator,
        outage_reason="Test bootstrap: skip OTP for amendment tests.",
        expected_version=booking.version,
    )
    booked.booking.refresh_from_db()
    return booked


def test_propose_scope_amendment_prices_from_the_active_catalog() -> None:
    booked = _in_progress_booking("amend-propose")
    amendment = propose_scope_amendment(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Found a second faulty switch while working.",
        task_quantity=1,
        expected_version=booked.booking.version,
    )
    assert amendment.status == ScopeAmendment.Status.PROPOSED
    assert amendment.total_paise > 0
    line = amendment.lines.get()
    assert line.quantity == 1
    assert line.amount_paise == amendment.total_paise


def test_only_one_active_amendment_at_a_time() -> None:
    booked = _in_progress_booking("amend-one-active")
    propose_scope_amendment(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="First amendment.",
        task_quantity=1,
        expected_version=booked.booking.version,
    )
    with pytest.raises(BookingCommandInvalidApiError):
        propose_scope_amendment(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            reason="Second amendment while first is undecided.",
            task_quantity=1,
            expected_version=booked.booking.version,
        )


def test_customer_can_decline_a_proposed_amendment() -> None:
    booked = _in_progress_booking("amend-decline")
    amendment = propose_scope_amendment(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Optional extra work.",
        task_quantity=1,
        expected_version=booked.booking.version,
    )
    declined = decline_scope_amendment(amendment_id=amendment.id, customer_id=booked.customer.id)
    assert declined.status == ScopeAmendment.Status.CUSTOMER_DECLINED

    replay = decline_scope_amendment(amendment_id=amendment.id, customer_id=booked.customer.id)
    assert replay.status == ScopeAmendment.Status.CUSTOMER_DECLINED


def test_full_approve_pay_authorize_flow_creates_amendment_work_tasks() -> None:
    booked = _in_progress_booking("amend-full-flow")
    amendment = propose_scope_amendment(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Customer asked for one more unit of work.",
        task_quantity=2,
        expected_version=booked.booking.version,
    )

    approved, attempt = approve_scope_amendment(
        amendment_id=amendment.id, customer_id=booked.customer.id, idempotency_key="amend-pay-1"
    )
    assert approved.status == ScopeAmendment.Status.PAYMENT_PENDING
    assert attempt.purpose == PaymentAttempt.Purpose.SCOPE_AMENDMENT_REVISION
    assert attempt.amount_paise == amendment.total_paise
    assert attempt.checkout_id is None

    attempt = create_provider_order(attempt_id=attempt.id)
    assert attempt.provider_order_id

    outcome = confirm_scope_amendment_payment(
        payment_attempt_id=attempt.id,
        payment=ProviderPayment(
            provider_payment_id="fake_amendment_payment_1",
            provider_order_id=attempt.provider_order_id,
            amount_paise=attempt.amount_paise,
            currency=attempt.currency,
            status="captured",
        ),
    )
    assert outcome is not None
    assert outcome.amendment.status == ScopeAmendment.Status.AUTHORIZED
    assert outcome.price_revision.authorized_at is not None
    assert len(outcome.work_tasks) == 1
    assert outcome.work_tasks[0].kind == WorkTask.Kind.AMENDMENT

    allocation = PaymentAllocation.objects.get(payment_attempt=attempt)
    assert allocation.amount_paise == amendment.total_paise
    assert allocation.fulfilment_unit_id == booked.unit.id


def test_confirming_payment_twice_is_idempotent() -> None:
    booked = _in_progress_booking("amend-idempotent-confirm")
    amendment = propose_scope_amendment(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Extra work.",
        task_quantity=1,
        expected_version=booked.booking.version,
    )
    _approved, attempt = approve_scope_amendment(
        amendment_id=amendment.id, customer_id=booked.customer.id
    )
    attempt = create_provider_order(attempt_id=attempt.id)
    payment = ProviderPayment(
        provider_payment_id="fake_amendment_payment_2",
        provider_order_id=attempt.provider_order_id,
        amount_paise=attempt.amount_paise,
        currency=attempt.currency,
        status="captured",
    )
    first = confirm_scope_amendment_payment(payment_attempt_id=attempt.id, payment=payment)
    second = confirm_scope_amendment_payment(payment_attempt_id=attempt.id, payment=payment)
    assert first is not None
    assert second is not None
    assert first.amendment.id == second.amendment.id
    assert PaymentAllocation.objects.filter(payment_attempt=attempt).count() == 1
    assert WorkTask.objects.filter(kind=WorkTask.Kind.AMENDMENT).count() == 1
