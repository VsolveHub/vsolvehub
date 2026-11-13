"""Payment-pending and confirmed notices come only from live status, and only once each."""

from uuid import uuid4

import pytest

from apps.assistant.models import AssistantBooking, AssistantMessage, AssistantSession
from apps.assistant.progress import PHASE_FINDING, PHASE_PAYMENT
from apps.assistant.services import sync_progress
from apps.carts.models import BookingGroup, CheckoutSession
from apps.notifications.models import NotificationIntent
from tests.carts.test_booking_group_payment_entry import _confirmed_group, _hold_every_unit
from tests.fulfilment.conftest import create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)


def _linked_session(checkout: CheckoutSession, *, announced: str) -> AssistantSession:
    session = AssistantSession.objects.create(
        token_hash=uuid4().hex, customer_id=checkout.customer_id
    )
    assert checkout.booking_group is not None
    AssistantBooking.objects.create(
        session=session,
        checkout=checkout,
        booking_group=checkout.booking_group,
        announced_status=announced,
    )
    return session


def test_a_held_booking_asks_for_payment_once() -> None:
    _client, checkout_body = _confirmed_group(suffix="91", key_prefix="assistant-pay")
    checkout = CheckoutSession.objects.get(id=checkout_body["id"])
    group = BookingGroup.objects.get(id=checkout.booking_group_id)
    _hold_every_unit(group)
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.PAYMENT_PENDING
    session = _linked_session(checkout, announced=PHASE_FINDING)

    notices = sync_progress(session)

    assert len(notices) == 1
    assert notices[0].role == AssistantMessage.Role.NOTICE
    assert "Pay ₹" in notices[0].text
    assert notices[0].actions[0]["type"] == "PAY"
    assert notices[0].actions[0]["href"] == f"/bookings/{group.id}"
    assert sync_progress(session) == [], "a phase is announced once"
    link = AssistantBooking.objects.get(session=session)
    assert link.announced_status == PHASE_PAYMENT
    assert link.closed_at is None


def test_confirmation_follows_the_captured_payment_and_closes_the_chat_booking() -> None:
    booked = create_booked_group(key_prefix="assistant-booked")
    assert booked.group.status == BookingGroup.Status.BOOKED
    session = _linked_session(booked.checkout, announced=PHASE_PAYMENT)

    notices = sync_progress(session)

    assert len(notices) == 1
    assert notices[0].text.startswith("Payment received")
    link = AssistantBooking.objects.get(session=session)
    assert link.closed_at is not None, "a confirmed booking frees the chat for the next one"


def test_capture_tells_the_customer_once_per_order() -> None:
    booked = create_booked_group(key_prefix="customer-confirmed-notice")

    intents = NotificationIntent.objects.filter(
        recipient=booked.customer, template_code="customer_booking_confirmed"
    )

    assert intents.count() == 1
    intent = intents.get()
    assert intent.audience == "CUSTOMER"
    assert intent.context["target_id"] == str(booked.group.id)
