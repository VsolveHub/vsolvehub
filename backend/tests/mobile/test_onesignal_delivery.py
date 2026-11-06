"""Push through OneSignal (`MOBILE_PUSH_PROVIDER=onesignal`).

The defect this replaces: since the apps moved to OneSignal they register no Expo token, and the
only code that delivered PUSH intents sent to Expo tokens. Job offers, assignments and every
in-app notice therefore never reached a phone; the Partner saw an offer only by opening the app.
"""

from collections.abc import Iterator
from datetime import timedelta
from typing import Any
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.identity.models import User
from apps.notifications.models import NotificationDelivery, NotificationIntent
from apps.notifications.services import request_notification

pytestmark = pytest.mark.django_db(transaction=True)

SEND = "apps.notifications.onesignal.send_push_to_external_ids"
OFFER_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(autouse=True)
def onesignal_channel() -> Iterator[None]:
    with override_settings(
        MOBILE_PUSH_PROVIDER="onesignal",
        ONESIGNAL_PARTNER_APP_ID="partner-app",
        ONESIGNAL_PARTNER_REST_API_KEY="partner-key",
        ONESIGNAL_CUSTOMER_APP_ID="customer-app",
        ONESIGNAL_CUSTOMER_REST_API_KEY="customer-key",
        ONESIGNAL_PARTNER_OFFER_CHANNEL_ID="offers-channel",
        PARTNER_PORTAL_BASE_URL="https://partner.example",
    ):
        yield


def _accepted(**_kwargs: Any) -> dict[str, Any]:
    return {
        "success": True,
        "notification_id": "os-notification-1",
        "errors": [],
        "raw_response": {"id": "os-notification-1"},
        "http_status": 200,
    }


def _user(phone: str = "+919800000001") -> User:
    return User.objects.create_user(phone_number=phone)


def _offer_intent(user: User, *, expires_in: timedelta) -> NotificationIntent:
    return request_notification(
        recipient_id=user.id,
        purpose="partner.offer_created",
        channel=NotificationIntent.Channel.PUSH,
        audience=NotificationIntent.Audience.PARTNER,
        template_code="partner_offer_created",
        context={
            "offer_id": OFFER_ID,
            "expires_at": (timezone.now() + expires_in).isoformat(),
        },
        idempotency_key=f"offer-created:{OFFER_ID}",
    )


def test_a_job_offer_rings_the_partner_through_onesignal() -> None:
    user = _user()
    with patch(SEND, side_effect=_accepted) as send:
        intent = _offer_intent(user, expires_in=timedelta(seconds=45))

    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.SENT
    kwargs = send.call_args.kwargs
    assert kwargs["external_ids"] == [str(user.id)]
    assert kwargs["app_id"] == "partner-app"
    assert kwargs["android_channel_id"] == "offers-channel"
    assert 0 < kwargs["ttl"] <= 45
    assert kwargs["collapse_id"] == f"offer-{OFFER_ID}"
    assert kwargs["data"]["target"] == {"kind": "PARTNER_OFFERS", "id": OFFER_ID}
    # Not the dispatch screen's key: a unit offer opened /dispatch/{id}, a screen for another
    # kind of offer, when the Expo path set it.
    assert "dispatch_offer_id" not in kwargs["data"]
    delivery = NotificationDelivery.objects.get(intent=intent)
    assert delivery.provider == "onesignal"
    assert delivery.provider_message_id == "os-notification-1"


def test_an_offer_that_already_lapsed_is_not_pushed() -> None:
    user = _user()
    with patch(SEND, side_effect=_accepted) as send:
        intent = _offer_intent(user, expires_in=timedelta(seconds=-5))

    send.assert_not_called()
    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.FAILED
    assert NotificationDelivery.objects.get(intent=intent).failure_code == "offer_expired"


def test_nobody_subscribed_settles_the_intent_instead_of_retrying() -> None:
    user = _user()

    def no_device(**_kwargs: Any) -> dict[str, Any]:
        return {
            "success": False,
            "notification_id": "",
            "errors": ["All included players are not subscribed"],
            "raw_response": {},
            "http_status": 200,
        }

    with patch(SEND, side_effect=no_device):
        intent = _offer_intent(user, expires_in=timedelta(seconds=45))

    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.FAILED
    assert NotificationDelivery.objects.get(intent=intent).failure_code == "no_subscribed_device"


def test_a_push_the_transport_writes_itself_is_not_sent_twice() -> None:
    """`OneSignalMessageTransport` creates its own PUSH intents and sends them itself."""
    user = _user()
    with patch(SEND, side_effect=_accepted) as send:
        request_notification(
            recipient_id=user.id,
            purpose="partner.offer",
            channel=NotificationIntent.Channel.PUSH,
            audience=NotificationIntent.Audience.PARTNER,
            template_code="partner.instant_dispatch_offer",
            context={},
        )

    send.assert_not_called()


def test_an_in_app_notice_is_copied_to_the_devices_once() -> None:
    user = _user()
    with patch(SEND, side_effect=_accepted) as send:
        notice = request_notification(
            recipient_id=user.id,
            purpose="partner.presence_ended",
            channel=NotificationIntent.Channel.IN_APP,
            audience=NotificationIntent.Audience.PARTNER,
            template_code="partner_went_offline",
            context={"reason": "You missed 2 job offers in a row."},
        )
        # Marking it read saves the row again, which fires the same signal.
        notice.read_at = timezone.now()
        notice.save(update_fields=("read_at",))

    assert send.call_count == 1
    assert send.call_args.kwargs["heading"] == "You are offline now"
    notice.refresh_from_db()
    assert notice.attempts == 1, "The copy is not a second delivery attempt."
    assert NotificationDelivery.objects.filter(intent=notice, provider="onesignal").count() == 1


def test_a_customer_notice_goes_to_the_customer_app() -> None:
    user = _user("+919800000002")
    with patch(SEND, side_effect=_accepted) as send:
        request_notification(
            recipient_id=user.id,
            purpose="booking.visit_progress",
            channel=NotificationIntent.Channel.IN_APP,
            audience=NotificationIntent.Audience.CUSTOMER,
            template_code="customer_visit_en_route",
            context={"partner_name": "Rohith", "service": "Door Repair"},
        )

    assert send.call_args.kwargs["app_id"] == "customer-app"
