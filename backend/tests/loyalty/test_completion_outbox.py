"""Tests for customer fulfilment completion outbox emission and loyalty dispatch.

M3-BE-207:
T1: Settlement -> COMPLETED emits exactly one customer.fulfilment.completed outbox row
T2: Repeated settlement / retry / duplicate confirm does not duplicate outbox row
T3: Settlement -> PARTIALLY_COMPLETED emits NO outbox row
T4: Settlement -> DISPUTED emits NO outbox row
T5: Partner submit_completion only (COMPLETION_SUBMITTED) emits NO outbox row
T6: Handler dispatch: request_notification for booking.completed invoked once per event
T7: Transaction coupling: After successful settle commit: COMPLETED and outbox row both visible
T8: Rollback: Force settlement failure mid-transaction: booking not COMPLETED, outbox row absent
T9: completed_at in payload equals BookingStatusHistory.created_at for the COMPLETED transition
T10: event_version in payload is always 1; handler validates version before processing
"""

from unittest.mock import patch

import pytest

from apps.commerce.models import Booking
from apps.foundation.models import OutboxEvent
from apps.fulfilment.completion import (
    confirm_completion,
    dispute_completion,
    submit_completion,
)
from apps.fulfilment.models import BookingStatusHistory
from apps.loyalty.handlers import handle_customer_fulfilment_completed
from apps.notifications.models import NotificationIntent
from tests.fulfilment.test_completion import _all_outcomes, _in_progress_booking

pytestmark = pytest.mark.django_db(transaction=True)


def test_t1_settlement_completed_emits_one_outbox_event() -> None:
    booked = _in_progress_booking("t1-completed")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="All done.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    assert booking.status == Booking.Status.COMPLETED

    events = list(
        OutboxEvent.objects.filter(
            event_type="customer.fulfilment.completed",
            aggregate_id=booking.id,
        )
    )
    assert len(events) == 1
    event = events[0]
    assert event.aggregate_type == "booking"
    assert event.idempotency_key == f"customer-fulfilment-completed:{booking.id}"
    payload = event.payload
    assert payload["event_version"] == 1
    assert payload["booking_id"] == str(booking.id)
    assert payload["customer_id"] == str(booking.customer_id)
    assert payload["booking_group_id"] == str(booked.group.id)
    assert payload["fulfilment_unit_id"] == str(booked.unit.id)
    assert payload["partner_id"] == str(booked.partner.id)
    assert "status_history_id" in payload
    assert "completed_at" in payload


def test_t2_repeated_settlement_does_not_duplicate_outbox_event() -> None:
    booked = _in_progress_booking("t2-duplicate")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Done",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )
    # Duplicate confirm attempt
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )
    assert (
        OutboxEvent.objects.filter(
            event_type="customer.fulfilment.completed",
            aggregate_id=booking.id,
        ).count()
        == 1
    )


def test_t3_partially_completed_settlement_emits_no_outbox_event() -> None:
    booked = _in_progress_booking("t3-partial")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Partial work only.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "PARTIAL", quantity=0),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    assert booking.status == Booking.Status.PARTIALLY_COMPLETED
    assert not OutboxEvent.objects.filter(
        event_type="customer.fulfilment.completed",
        aggregate_id=booking.id,
    ).exists()


def test_t4_disputed_settlement_emits_no_outbox_event() -> None:
    booked = _in_progress_booking("t4-dispute")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Done",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    dispute_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        dispute_reason="Work was unsatisfactory.",
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    assert booking.status == Booking.Status.DISPUTED
    assert not OutboxEvent.objects.filter(
        event_type="customer.fulfilment.completed",
        aggregate_id=booking.id,
    ).exists()


def test_t5_completion_submitted_only_emits_no_outbox_event() -> None:
    booked = _in_progress_booking("t5-submitted")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Submitted awaiting confirmation",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    assert booking.status == Booking.Status.COMPLETION_SUBMITTED
    assert not OutboxEvent.objects.filter(
        event_type="customer.fulfilment.completed",
        aggregate_id=booking.id,
    ).exists()


def test_t6_handler_dispatch_notifies_booking_completed_once() -> None:
    booked = _in_progress_booking("t6-dispatch")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="All done.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )
    event = OutboxEvent.objects.get(
        event_type="customer.fulfilment.completed",
        aggregate_id=booking.id,
    )
    # First dispatch
    handle_customer_fulfilment_completed(event)
    intents = NotificationIntent.objects.filter(
        recipient=booking.customer,
        purpose="booking.completed",
    )
    assert intents.count() == 1
    intent = intents.first()
    assert intent.context["booking_id"] == str(booking.id)

    # Replay dispatch (idempotency check)
    handle_customer_fulfilment_completed(event)
    assert (
        NotificationIntent.objects.filter(
            recipient=booking.customer,
            purpose="booking.completed",
        ).count()
        == 1
    )


def test_t7_transaction_coupling_completed_and_event_both_visible() -> None:
    booked = _in_progress_booking("t7-coupling")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="All done.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    assert booking.status == Booking.Status.COMPLETED
    assert OutboxEvent.objects.filter(
        event_type="customer.fulfilment.completed",
        aggregate_id=booking.id,
    ).exists()


def test_t8_transaction_rollback_neither_completed_nor_event_remains() -> None:
    booked = _in_progress_booking("t8-rollback")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Done",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()

    with (
        patch(
            "apps.fulfilment.completion.settle_booking_earning",
            side_effect=RuntimeError("Forced failure after outbox enqueue"),
        ),
        pytest.raises(RuntimeError, match="Forced failure"),
    ):
        confirm_completion(
            booking_id=booking.id,
            customer_id=booking.customer_id,
            expected_version=booking.version,
        )

    booking.refresh_from_db()
    assert booking.status == Booking.Status.COMPLETION_SUBMITTED
    assert not OutboxEvent.objects.filter(
        event_type="customer.fulfilment.completed",
        aggregate_id=booking.id,
    ).exists()


def test_t9_completed_at_matches_status_history_created_at() -> None:
    booked = _in_progress_booking("t9-timestamp")
    booking = booked.booking
    submission = submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Done",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )
    event = OutboxEvent.objects.get(
        event_type="customer.fulfilment.completed",
        aggregate_id=booking.id,
    )
    history = (
        BookingStatusHistory.objects.filter(
            booking=booking,
            to_status=Booking.Status.COMPLETED,
        )
        .order_by("-created_at")
        .first()
    )

    assert history is not None
    assert event.payload["completed_at"] == history.created_at.isoformat()
    # Explicitly ensure it's not the partner's submission time
    assert event.payload["completed_at"] != submission.submitted_at.isoformat()
    assert event.payload["status_history_id"] == str(history.id)


def test_t10_event_version_validated_by_handler() -> None:
    booked = _in_progress_booking("t10-version")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Done",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )
    event = OutboxEvent.objects.get(
        event_type="customer.fulfilment.completed",
        aggregate_id=booking.id,
    )
    assert event.payload["event_version"] == 1

    # Unsupported version raises ValueError
    bad_payload = dict(event.payload)
    bad_payload["event_version"] = 2
    bad_event = OutboxEvent(
        aggregate_type="booking",
        aggregate_id=booking.id,
        event_type="customer.fulfilment.completed",
        payload=bad_payload,
    )
    with pytest.raises(ValueError, match=r"Unsupported event_version 2; expected 1\."):
        handle_customer_fulfilment_completed(bad_event)
