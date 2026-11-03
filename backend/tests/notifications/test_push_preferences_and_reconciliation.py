"""Tests for PushNotificationPreference, OneSignal transport suppression, and subscription reconciliation."""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.notifications.models import (
    CustomerPushSubscription,
    NotificationDelivery,
    NotificationIntent,
    PushNotificationPreference,
)
from apps.notifications.tasks import reconcile_stale_push_subscriptions
from apps.notifications.transport import OneSignalMessageTransport
from apps.partners.models import PartnerProfile, PartnerPushSubscription

pytestmark = pytest.mark.django_db


@pytest.fixture
def customer_user() -> User:
    return User.objects.create_user(
        phone_number="+919876543290",
        full_name="Test Customer",
    )


@pytest.fixture
def partner_user() -> User:
    user = User.objects.create_user(
        phone_number="+919876543291",
        full_name="Test Partner",
    )
    PartnerProfile.objects.create(user=user, display_name="Test Partner Profile")
    return user


def test_unauthenticated_requests_fail():
    client = APIClient()
    res = client.get("/api/v1/customer/notification-preferences/")
    assert res.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    res = client.patch("/api/v1/partner/notification-preferences/", {}, format="json")
    assert res.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


def test_customer_preferences_defaults_and_get(customer_user):
    client = APIClient()
    client.force_authenticate(user=customer_user)
    res = client.get("/api/v1/customer/notification-preferences/")
    assert res.status_code == status.HTTP_200_OK

    data = res.json()
    assert data["role"] == "CUSTOMER"
    prefs = {p["category"]: p for p in data["preferences"]}

    assert len(prefs) == 5
    assert prefs["BOOKING_UPDATES"]["is_enabled"] is True
    assert prefs["DISPATCH_AND_ASSIGNMENT_UPDATES"]["is_enabled"] is True
    assert prefs["ARRIVAL_AND_OTP_ALERTS"]["is_enabled"] is True
    assert prefs["ACCOUNT_SECURITY"]["is_enabled"] is True
    assert prefs["ACCOUNT_SECURITY"]["is_mutable"] is False
    assert prefs["OFFERS_AND_PROMOTIONS"]["is_enabled"] is False


def test_customer_preferences_patch_and_immutable_enforcement(customer_user):
    client = APIClient()
    client.force_authenticate(user=customer_user)

    # Update mutable category
    res = client.patch(
        "/api/v1/customer/notification-preferences/",
        {"BOOKING_UPDATES": False, "OFFERS_AND_PROMOTIONS": True},
        format="json",
    )
    assert res.status_code == status.HTTP_200_OK
    prefs = {p["category"]: p for p in res.json()["preferences"]}
    assert prefs["BOOKING_UPDATES"]["is_enabled"] is False
    assert prefs["OFFERS_AND_PROMOTIONS"]["is_enabled"] is True

    # Attempt to disable immutable category
    res = client.patch(
        "/api/v1/customer/notification-preferences/",
        {"ACCOUNT_SECURITY": False},
        format="json",
    )
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert "cannot be disabled" in res.json()["error"]


def test_partner_preferences_defaults_and_patch(partner_user):
    client = APIClient()
    client.force_authenticate(user=partner_user)
    res = client.get("/api/v1/partner/notification-preferences/")
    assert res.status_code == status.HTTP_200_OK

    data = res.json()
    assert data["role"] == "PARTNER"
    prefs = {p["category"]: p for p in data["preferences"]}
    assert len(prefs) == 4
    assert prefs["JOB_AND_DISPATCH_ALERTS"]["is_enabled"] is True
    assert prefs["ACCOUNT_SECURITY"]["is_mutable"] is False

    # Update partner preference
    res = client.patch(
        "/api/v1/partner/notification-preferences/",
        {"category": "JOB_AND_DISPATCH_ALERTS", "is_enabled": False},
        format="json",
    )
    assert res.status_code == status.HTTP_200_OK
    updated_prefs = {p["category"]: p for p in res.json()["preferences"]}
    assert updated_prefs["JOB_AND_DISPATCH_ALERTS"]["is_enabled"] is False


def test_preference_disabled_suppresses_push(customer_user, settings):
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app_cust"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "key_cust"

    CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id="sub_pref_test_1",
        onesignal_external_id=str(customer_user.id),
        is_active=True,
        opted_in=True,
        permission_state="granted",
        last_verified_at=timezone.now(),
    )

    PushNotificationPreference.objects.create(
        user=customer_user,
        role=PushNotificationPreference.Role.CUSTOMER,
        category=PushNotificationPreference.Category.BOOKING_UPDATES,
        is_enabled=False,
    )

    transport = OneSignalMessageTransport()
    res = transport.send(
        channel=NotificationIntent.Channel.PUSH,
        destination=str(customer_user.id),
        template_code="booking_update_sample",
        context={"title": "Booking Update", "category": "BOOKING_UPDATES"},
        recipient_role="CUSTOMER",
        recipient=customer_user,
    )

    assert res.accepted is False
    assert res.failure_code == "USER_PREFERENCE_DISABLED"
    assert res.status == NotificationDelivery.Status.SKIPPED

    intent = NotificationIntent.objects.get(id=res.intent_id)
    assert intent.status == NotificationIntent.Status.SUPPRESSED
    assert intent.suppressed_reason == "USER_PREFERENCE_DISABLED"

    delivery = NotificationDelivery.objects.get(id=res.delivery_id)
    assert delivery.status == NotificationDelivery.Status.SKIPPED
    assert delivery.failure_code == "USER_PREFERENCE_DISABLED"


def test_account_security_bypasses_suppression(customer_user, settings):
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app_cust"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "key_cust"

    CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id="sub_sec_test_1",
        onesignal_external_id=str(customer_user.id),
        is_active=True,
        opted_in=True,
        permission_state="granted",
        last_verified_at=timezone.now(),
    )

    mock_send_push = MagicMock(
        return_value={"notification_id": "onesignal_sec_123", "http_status": 200, "recipients": 1}
    )
    transport = OneSignalMessageTransport()

    with patch("apps.notifications.transport._get_send_push_fn", return_value=mock_send_push):
        res = transport.send(
            channel=NotificationIntent.Channel.PUSH,
            destination=str(customer_user.id),
            template_code="auth_security_alert",
            context={"title": "Login Alert", "category": "ACCOUNT_SECURITY"},
            recipient_role="CUSTOMER",
            recipient=customer_user,
        )

    assert res.accepted is True
    assert res.provider_message_id == "onesignal_sec_123"
    mock_send_push.assert_called_once()


def test_reconcile_deactivates_stale_and_duplicate_subscriptions(customer_user, partner_user):
    now = timezone.now()
    stale_date = now - timedelta(days=35)
    fresh_date = now - timedelta(days=5)

    # 1. Stale Customer Sub
    stale_sub = CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id="sub_stale_1",
        platform="WEB",
        is_active=True,
        opted_in=True,
        last_verified_at=stale_date,
    )

    # 2. Duplicate active Web Subs for Partner
    partner_profile = partner_user.partner_profile
    p_sub_older = PartnerPushSubscription.objects.create(
        partner=partner_profile,
        user=partner_user,
        onesignal_subscription_id="sub_part_old",
        platform="WEB",
        is_active=True,
        opted_in=True,
        last_verified_at=fresh_date - timedelta(days=2),
    )
    p_sub_newer = PartnerPushSubscription.objects.create(
        partner=partner_profile,
        user=partner_user,
        onesignal_subscription_id="sub_part_new",
        platform="WEB",
        is_active=True,
        opted_in=True,
        last_verified_at=fresh_date,
    )

    result = reconcile_stale_push_subscriptions()

    stale_sub.refresh_from_db()
    assert stale_sub.is_active is False
    assert result["stale_customer_deactivated"] >= 1

    p_sub_older.refresh_from_db()
    p_sub_newer.refresh_from_db()
    assert p_sub_older.is_active is False
    assert p_sub_newer.is_active is True
    assert result["duplicate_partner_deactivated"] >= 1


def test_reconcile_deactivates_on_invalid_delivery_error(customer_user):
    sub = CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id="sub_inv_1",
        platform="WEB",
        is_active=True,
        opted_in=True,
        last_verified_at=timezone.now(),
    )

    intent = NotificationIntent.objects.create(
        recipient=customer_user,
        purpose="test",
        channel=NotificationIntent.Channel.PUSH,
        template_code="test",
    )
    NotificationDelivery.objects.create(
        intent=intent,
        provider="onesignal",
        status=NotificationDelivery.Status.FAILED,
        failure_code="UNSUBSCRIBED",
        response_body={"errors": ["All included players are unsubscribed"]},
    )

    result = reconcile_stale_push_subscriptions()
    sub.refresh_from_db()
    assert sub.is_active is False
    assert sub.opted_in is False
    assert result["invalid_delivery_deactivated"] >= 1


def test_push_observability_report_runs_cleanly():
    call_command("push_observability_report", hours=24)
    call_command("push_observability_report", hours=24, json=True)
