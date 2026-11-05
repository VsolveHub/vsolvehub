"""Tests for Instant Booking Celery dispatch, expiry and reassignment tasks."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.assignments.models import DispatchOffer
from apps.assignments.tasks import (
    expire_dispatch_offer_task,
    reassignment_or_downgrade_task,
    send_dispatch_offer_task,
)
from apps.carts.models import BookingGroup
from apps.notifications.models import NotificationIntent
from apps.notifications.templates_registry import render_notification
from tests.fulfilment.conftest import create_booked_group

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]


def test_send_dispatch_offer_task_sends_targeted_push() -> None:
    booked = create_booked_group(key_prefix="cel-send")
    booking = booked.booking
    partner = booked.partner

    now = timezone.now()
    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send_push:
        mock_send_push.return_value = {
            "success": True,
            "notification_id": "push-test-123",
            "errors": [],
            "raw_response": {},
        }

        result = send_dispatch_offer_task(str(offer.id))

        assert result["success"] is True
        assert result["notification_id"] == "push-test-123"

        mock_send_push.assert_called_once()
        call_kwargs = mock_send_push.call_args.kwargs
        assert str(partner.user_id) in call_kwargs["external_ids"]
        assert call_kwargs["heading"] == "New Instant job nearby"
        assert "ASAP" in call_kwargs["body"]
        assert call_kwargs["data"]["type"] == "DISPATCH_OFFER"
        assert call_kwargs["data"]["offer_id"] == str(offer.id)
        assert f"/dispatch/{offer.id}" in call_kwargs["url"]
        assert call_kwargs["collapse_id"] == f"dispatch_offer_{offer.id}"
        assert call_kwargs["web_push_topic"] == f"dispatch_{offer.id}"
        assert call_kwargs["ttl"] > 0
        assert call_kwargs["priority"] == 10

        offer.refresh_from_db()
        assert offer.onesignal_notification_id == "push-test-123"


def test_send_dispatch_offer_task_celery_retry_duplicate_suppression() -> None:
    booked = create_booked_group(key_prefix="cel-dup")
    booking = booked.booking
    partner = booked.partner

    now = timezone.now()
    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
        onesignal_notification_id="already-sent-push-id-456",
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send_push:
        result = send_dispatch_offer_task(str(offer.id))

        assert result["skipped"] is True
        assert result["reason"] == "Push already sent"
        assert result["notification_id"] == "already-sent-push-id-456"
        mock_send_push.assert_not_called()


def test_expire_dispatch_offer_task_expires_and_triggers_reassignment() -> None:
    booked = create_booked_group(key_prefix="cel-exp")
    booking = booked.booking
    partner = booked.partner

    now = timezone.now()
    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now - timedelta(seconds=120),
        expires_at=now - timedelta(seconds=10),
    )

    with patch("apps.assignments.tasks.reassignment_or_downgrade_task.delay") as mock_reassign:
        expired = expire_dispatch_offer_task(str(offer.id))
        assert expired is True

        offer.refresh_from_db()
        assert offer.status == DispatchOffer.Status.EXPIRED
        assert offer.responded_at is not None

        mock_reassign.assert_called_once_with(str(booking.id))


def test_reassignment_or_downgrade_task_downgrades_when_no_partner_available() -> None:

    booked = create_booked_group(key_prefix="cel-down")
    booking = booked.booking
    partner = booked.partner

    # Mark the only partner as already attempted
    now = timezone.now()
    DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.EXPIRED,
        offered_at=now - timedelta(seconds=120),
        expires_at=now - timedelta(seconds=60),
    )

    if booked.unit and booked.unit.booking_group:
        booked.unit.booking_group.booking_mode = BookingGroup.BookingMode.INSTANT
        booked.unit.booking_group.save(update_fields=["booking_mode"])

    reassignment_or_downgrade_task(str(booking.id))

    if booked.unit and booked.unit.booking_group:
        booked.unit.booking_group.refresh_from_db()
        assert booked.unit.booking_group.booking_mode == BookingGroup.BookingMode.SCHEDULED

    # Verify customer received the downgrade notification with valid template
    intent = NotificationIntent.objects.filter(
        recipient_id=booking.customer_id,
        purpose="booking.downgraded_to_scheduled",
    ).first()
    assert intent is not None
    assert intent.template_code == "booking_downgraded_to_scheduled"
    assert intent.status == NotificationIntent.Status.SENT
    assert intent.deliveries.filter(provider="in_app").exists()

    rendered = render_notification(template_code=intent.template_code, context=intent.context)
    assert str(booking.id) in rendered.body
    assert "Instant booking moved to scheduled" in rendered.title
