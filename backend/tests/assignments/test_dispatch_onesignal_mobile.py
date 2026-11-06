"""Job offers once the partner app is a OneSignal subscriber.

With ``MOBILE_PUSH_PROVIDER=onesignal`` the one OneSignal send reaches the partner's phone as
well as their browser, so the Expo path must stay off (or the offer would arrive twice), and the
offer rides the partner app's "Job offers" Android channel.
"""

from datetime import timedelta
from typing import Any
from unittest.mock import patch

import pytest
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper

from apps.assignments.models import DispatchOffer
from apps.assignments.tasks import send_dispatch_offer_task
from tests.fulfilment.conftest import create_booked_group

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]

SENT = {"success": True, "notification_id": "push-1", "errors": [], "raw_response": {}}


def _offer(key: str) -> DispatchOffer:
    booked = create_booked_group(key_prefix=key)
    now = timezone.now()
    return DispatchOffer.objects.create(
        booking=booked.booking,
        partner=booked.partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )


def _send(offer: DispatchOffer) -> tuple[Any, Any]:
    with (
        patch("apps.notifications.onesignal.send_push_to_external_ids", return_value=SENT) as push,
        patch("apps.mobile.services.active_devices_for", return_value=[]) as devices,
    ):
        send_dispatch_offer_task(str(offer.id))
    return push, devices


def test_onesignal_mode_leaves_the_expo_path_off(settings: SettingsWrapper) -> None:
    settings.MOBILE_PUSH_PROVIDER = "onesignal"
    offer = _offer("os-mode")

    push, devices = _send(offer)

    devices.assert_not_called()
    push.assert_called_once()


def test_offer_rides_the_job_offers_channel(settings: SettingsWrapper) -> None:
    settings.MOBILE_PUSH_PROVIDER = "onesignal"
    settings.ONESIGNAL_PARTNER_OFFER_CHANNEL_ID = "offer-channel-uuid"
    offer = _offer("os-channel")

    push, _devices = _send(offer)

    assert push.call_args.kwargs["android_channel_id"] == "offer-channel-uuid"


def test_expo_mode_still_looks_up_the_phone(settings: SettingsWrapper) -> None:
    settings.MOBILE_PUSH_PROVIDER = "expo"
    offer = _offer("expo-mode")

    _push, devices = _send(offer)

    devices.assert_called_once()
