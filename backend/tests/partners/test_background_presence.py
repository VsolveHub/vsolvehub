"""Staying online with the app closed (owner decision, 5 November 2026).

The defect: heartbeats are only sent while the app is on screen, and presence lapsed 90 seconds
after the last one. Locking the phone, or switching to Google Maps, took a Partner offline without
a word. A Partner whose phone push can reach now stays online until they go offline, miss two
offers in a row, or do not open the app for two hours — and is told when it ends.
"""

from collections.abc import Iterator
from datetime import timedelta
from typing import Any
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from freezegun import freeze_time

from apps.assignments.group_services import reconcile_group_dispatch
from apps.assignments.models import PartnerOffer
from apps.notifications.models import NotificationIntent
from apps.partners.models import PartnerOnlineSession, PartnerProfile, PartnerPushSubscription
from apps.partners.services.presence import (
    _presence_ttl_seconds,
    expire_missing_presence_sessions,
)
from tests.assignments.same_day_offers import FROZEN_NOW, online_partner, same_day_offer

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def onesignal_phone_channel() -> Iterator[None]:
    cache.clear()
    with (
        override_settings(MOBILE_PUSH_PROVIDER="onesignal"),
        patch(
            "apps.notifications.onesignal.send_push_to_external_ids",
            side_effect=lambda **_kwargs: _accepted(),
        ),
    ):
        yield


def _accepted() -> dict[str, Any]:
    return {"success": True, "notification_id": "n", "errors": [], "http_status": 200}


def _phone(partner: PartnerProfile) -> PartnerPushSubscription:
    return PartnerPushSubscription.objects.create(
        partner=partner,
        user=partner.user,
        onesignal_subscription_id=f"sub-{partner.id}",
        onesignal_external_id=str(partner.user_id),
        platform=PartnerPushSubscription.Platform.ANDROID,
        is_active=True,
        opted_in=True,
        permission_state="granted",
    )


@freeze_time(FROZEN_NOW)
def test_a_phone_push_can_reach_keeps_presence_for_the_background_ttl() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="301", variant_slugs=("switch-socket-repair",))
    assert _presence_ttl_seconds(partner.id) == 90

    _phone(partner)
    assert _presence_ttl_seconds(partner.id) == 7200

    with override_settings(MOBILE_PUSH_PROVIDER="expo"):
        assert _presence_ttl_seconds(partner.id) == 90, "Expo cannot ring a OneSignal phone."


@freeze_time(FROZEN_NOW)
def test_two_lapsed_offers_in_a_row_take_the_partner_offline_and_say_so() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="302", variant_slugs=("switch-socket-repair",))
    lapsed = FROZEN_NOW - timedelta(seconds=1)

    # One offer at a time, as a Partner gets them: the first lapses, then the second.
    first = same_day_offer(phone="+919876500302", key="missed-first")
    assert first.partner_id == partner.id
    PartnerOffer.objects.filter(id=first.id).update(expires_at=lapsed)
    reconcile_group_dispatch(group_id=first.fulfilment_unit.booking_group_id)
    assert PartnerOnlineSession.objects.filter(partner=partner, ended_at__isnull=True).exists()

    second = same_day_offer(phone="+919876500303", key="missed-second")
    assert second.partner_id == partner.id
    PartnerOffer.objects.filter(id=second.id).update(expires_at=lapsed)
    reconcile_group_dispatch(group_id=second.fulfilment_unit.booking_group_id)

    session = PartnerOnlineSession.objects.get(partner=partner)
    assert session.ended_at is not None
    assert session.end_reason == PartnerOnlineSession.EndReason.MISSED_OFFERS
    notice = NotificationIntent.objects.get(template_code="partner_went_offline")
    assert notice.recipient_id == partner.user_id
    assert notice.context == {"reason": "You missed 2 job offers in a row."}


@freeze_time(FROZEN_NOW)
def test_only_a_phone_partner_is_told_their_presence_lapsed() -> None:
    """A browser Partner closed the tab themselves; telling them would be noise."""
    call_command("seed_technician_catalog")
    phone_partner = online_partner(suffix="304", variant_slugs=("switch-socket-repair",))
    browser_partner = online_partner(suffix="305", variant_slugs=("switch-socket-repair",))
    _phone(phone_partner)

    # Neither has a live presence key, so both sessions lapse.
    assert expire_missing_presence_sessions() == 2

    notices = NotificationIntent.objects.filter(template_code="partner_went_offline")
    assert [notice.recipient_id for notice in notices] == [phone_partner.user_id]
    assert not notices.filter(recipient_id=browser_partner.user_id).exists()
