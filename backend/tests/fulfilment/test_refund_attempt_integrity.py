"""A Refund may only be allocated against the PaymentAttempt it was raised on.

A Fulfilment Unit can carry `PaymentAllocation` rows on more than one `PaymentAttempt`: the
checkout capture pays for the original scope, and an authorized `ScopeAmendment`'s revision
payment adds a second allocation for the same unit on its own attempt. `Refund` names exactly
one `payment_attempt`, and that is the provider payment the money is actually returned through
— so a `RefundAllocation` pointing at an allocation from a *different* attempt either asks the
provider to refund more than that payment was worth, or marks money returned that never moved.
"""

import itertools

import pytest

from apps.commerce.models import PaymentAllocation, PaymentAttempt, Refund, RefundAllocation
from apps.commerce.providers import ProviderPayment
from apps.commerce.services import create_provider_order
from apps.fulfilment.amendments import (
    approve_scope_amendment,
    confirm_scope_amendment_payment,
    propose_scope_amendment,
)
from apps.fulfilment.completion import OutcomeInput, confirm_completion, submit_completion
from apps.fulfilment.models import WorkOutcome, WorkTask
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.identity.models import User
from tests.fulfilment.conftest import BookedGroup, create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)

TWO_ATTEMPTS = 2
_operator_sequence = itertools.count(1)


def _in_progress_booking(key_prefix: str) -> BookedGroup:
    booked = create_booked_group(key_prefix=key_prefix)
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    operator = User.objects.create_user(phone_number=f"+91987{next(_operator_sequence):07d}")
    operations_assisted_start(
        booking_id=booking.id,
        operator=operator,
        outage_reason="Test bootstrap: skip OTP.",
        expected_version=booking.version,
    )
    booked.booking.refresh_from_db()
    return booked


def _settle_nothing_done(booked: BookedGroup, *, key: str) -> None:
    """Report every task as not started, then have the Customer accept that report.

    The refund is raised at settlement, not at submission — `submit_completion` from
    `IN_PROGRESS` only moves the Booking to `COMPLETION_SUBMITTED` and waits for the Customer.
    """

    booking = booked.booking
    tasks = list(WorkTask.objects.filter(booking=booking))
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Nothing got done.",
        safety_damage_declared=False,
        outcomes=[
            OutcomeInput(work_task_id=task.id, outcome=WorkOutcome.Outcome.NOT_STARTED)
            for task in tasks
        ],
        expected_version=booking.version,
        idempotency_key=key,
    )
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        expected_version=booking.version,
        idempotency_key=key,
    )


def _pay_for_an_amendment(booked: BookedGroup, *, key: str) -> PaymentAttempt:
    amendment = propose_scope_amendment(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Customer asked for more work.",
        task_quantity=1,
        expected_version=booked.booking.version,
    )
    _approved, attempt = approve_scope_amendment(
        amendment_id=amendment.id, customer_id=booked.customer.id, idempotency_key=key
    )
    attempt = create_provider_order(attempt_id=attempt.id)
    confirm_scope_amendment_payment(
        payment_attempt_id=attempt.id,
        payment=ProviderPayment(
            provider_payment_id=f"fake_{key}",
            provider_order_id=attempt.provider_order_id,
            amount_paise=attempt.amount_paise,
            currency=attempt.currency,
            status="captured",
        ),
    )
    booked.booking.refresh_from_db()
    return attempt


def test_a_partial_work_refund_never_crosses_a_payment_attempt_boundary() -> None:
    booked = _in_progress_booking("refund-attempt-partial")
    amendment_attempt = _pay_for_an_amendment(booked, key="refund-attempt-partial-amend")
    unit_attempts = set(
        PaymentAllocation.objects.filter(fulfilment_unit=booked.unit).values_list(
            "payment_attempt_id", flat=True
        )
    )
    assert amendment_attempt.id in unit_attempts
    assert len(unit_attempts) == TWO_ATTEMPTS, "the fixture did not produce a second attempt"

    _settle_nothing_done(booked, key="refund-attempt-partial-key")

    allocations = RefundAllocation.objects.select_related("refund", "payment_allocation").filter(
        payment_allocation__fulfilment_unit=booked.unit
    )
    assert allocations.exists(), "no refund was raised at all"
    for allocation in allocations:
        assert (
            allocation.refund.payment_attempt_id == allocation.payment_allocation.payment_attempt_id
        ), (
            "a Refund on one PaymentAttempt was allocated against another attempt's payment: "
            f"refund {allocation.refund_id} -> allocation {allocation.payment_allocation_id}"
        )


def test_no_refund_exceeds_the_payment_attempt_it_is_raised_against() -> None:
    booked = _in_progress_booking("refund-attempt-amount")
    _pay_for_an_amendment(booked, key="refund-attempt-amount-amend")

    _settle_nothing_done(booked, key="refund-attempt-amount-key")

    refunds = list(Refund.objects.filter(order=booked.booking.order))
    assert refunds, "no refund was raised at all"
    for refund in refunds:
        assert refund.amount_paise <= refund.payment_attempt.amount_paise, (
            "a refund asks the provider to return more than that payment was worth"
        )
