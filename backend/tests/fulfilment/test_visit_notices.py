"""The notices a booked visit never sent (5 November 2026).

The Partner heard nothing when a booking was paid for, and nothing reminded them of a visit
booked days ahead. The Customer heard nothing as their professional set off, arrived, or reported
the work done — and the last one is the only prompt to press Confirm.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.commerce.models import Booking
from apps.fulfilment.completion import submit_completion
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.fulfilment.visit_notices import send_time_to_leave_reminders
from apps.notifications.models import NotificationIntent
from apps.notifications.serializers import NotificationSerializer
from tests.fulfilment.conftest import create_booked_group
from tests.fulfilment.test_completion import _all_outcomes, _in_progress_booking

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]


def _notices(template_code: str) -> list[NotificationIntent]:
    return list(NotificationIntent.objects.filter(template_code=template_code))


def test_the_partner_is_told_once_when_the_customer_pays() -> None:
    booked = create_booked_group(key_prefix="notice-paid")

    notices = _notices("partner_booking_confirmed")
    assert len(notices) == 1
    notice = notices[0]
    assert notice.recipient_id == booked.partner.user_id
    assert notice.audience == NotificationIntent.Audience.PARTNER
    assert notice.channel == NotificationIntent.Channel.IN_APP
    assert notice.status == NotificationIntent.Status.SENT
    assert NotificationSerializer(notice).data["target"] == {
        "kind": "BOOKING",
        "id": str(booked.booking.id),
    }


def test_the_customer_is_told_once_when_their_payment_confirms_the_booking() -> None:
    booked = create_booked_group(key_prefix="notice-paid-customer")

    notices = _notices("customer_booking_confirmed")
    assert len(notices) == 1
    notice = notices[0]
    assert notice.recipient_id == booked.booking.customer_id
    assert notice.audience == NotificationIntent.Audience.CUSTOMER
    assert notice.status == NotificationIntent.Status.SENT
    assert NotificationSerializer(notice).data["target"]["kind"] == "BOOKING_GROUP"


def test_the_customer_is_told_when_the_professional_sets_off_and_arrives() -> None:
    booked = create_booked_group(key_prefix="notice-steps")
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )

    for template_code in ("customer_visit_en_route", "customer_visit_arrived"):
        notices = _notices(template_code)
        assert len(notices) == 1, template_code
        assert notices[0].recipient_id == booked.customer.id
        assert notices[0].audience == NotificationIntent.Audience.CUSTOMER
        assert NotificationSerializer(notices[0]).data["target"] == {
            "kind": "BOOKING_GROUP",
            "id": str(booked.group.id),
        }


def test_the_customer_is_asked_to_confirm_once_the_work_is_reported() -> None:
    booked = _in_progress_booking("notice-report")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )

    notices = _notices("customer_visit_work_submitted")
    assert len(notices) == 1
    assert notices[0].recipient_id == booked.customer.id


def test_an_advance_visit_reminds_the_partner_once_when_it_is_time_to_leave() -> None:
    booked = create_booked_group(key_prefix="notice-leave")
    booking = booked.booking
    # Booked a day ahead, starting in 40 minutes: inside the hour "On my way" opens.
    Booking.objects.filter(id=booking.id).update(
        created_at=timezone.now() - timedelta(days=1),
        scheduled_start=timezone.now() + timedelta(minutes=40),
    )

    assert send_time_to_leave_reminders() == 1
    send_time_to_leave_reminders()

    notices = _notices("partner_visit_time_to_leave")
    assert len(notices) == 1
    assert notices[0].recipient_id == booked.partner.user_id


def test_a_visit_booked_moments_ago_is_not_reminded() -> None:
    """A Partner who just accepted an instant job does not need telling to leave for it."""
    booked = create_booked_group(key_prefix="notice-just-booked")
    Booking.objects.filter(id=booked.booking.id).update(
        created_at=timezone.now() - timedelta(minutes=5),
        scheduled_start=timezone.now() + timedelta(minutes=40),
    )

    assert send_time_to_leave_reminders() == 0
    assert _notices("partner_visit_time_to_leave") == []
