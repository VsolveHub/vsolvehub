import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.assignments.models import DispatchOffer
from apps.assignments.tasks import send_dispatch_offer_push_task
from apps.identity.models import User
from apps.notifications.models import (
    CustomerPushSubscription,
    KillSwitch,
    NotificationDelivery,
    NotificationIntent,
)
from apps.notifications.services import (
    engage_kill_switch,
    release_kill_switch,
    request_notification,
)
from apps.notifications.tasks import reconcile_onesignal_push_delivery_status_task
from apps.notifications.transport import (
    MessageTransportError,
    OneSignalMessageTransport,
)
from apps.partners.models import PartnerProfile, PartnerPushSubscription
from tests.fulfilment.conftest import create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def customer_user() -> User:
    return User.objects.create_user(phone_number="+919876543301", full_name="Customer User")


@pytest.fixture
def partner_user() -> User:
    user = User.objects.create_user(phone_number="+919876543302", full_name="Partner User")
    PartnerProfile.objects.create(user=user, display_name="Partner Profile")
    return user


@pytest.fixture
def active_customer_subscription(customer_user: User) -> CustomerPushSubscription:
    return CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(customer_user.id),
        platform=CustomerPushSubscription.Platform.WEB,
        is_active=True,
        opted_in=True,
        permission_state="granted",
        last_verified_at=timezone.now(),
    )


@pytest.fixture
def active_partner_subscription(partner_user: User) -> PartnerPushSubscription:
    partner = partner_user.partner_profile
    return PartnerPushSubscription.objects.create(
        partner=partner,
        user=partner_user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(partner.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=True,
        opted_in=True,
        permission_state="granted",
        last_verified_at=timezone.now(),
    )


# ============================================================================
# 1. Transport Routing and Interface Tests
# ============================================================================


def test_transport_customer_routing_credentials(
    settings, customer_user: User, active_customer_subscription: CustomerPushSubscription
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "cust-app-id-1234"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "cust-rest-key-5678"
    settings.ONESIGNAL_PARTNER_APP_ID = "partner-app-id-9999"
    settings.ONESIGNAL_PARTNER_REST_API_KEY = "partner-rest-key-9999"

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": True,
            "notification_id": "cust-notif-uuid",
            "errors": [],
            "http_status": 200,
            "raw_response": {"id": "cust-notif-uuid", "recipients": 1},
        }

        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking_confirmed",
            title="Booking Confirmed",
            body="Your booking is confirmed.",
            deep_link="/bookings/123",
            idempotency_key="idemp-cust-1",
        )

        assert res.accepted is True
        assert res.provider_message_id == "cust-notif-uuid"
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args.kwargs
        assert call_kwargs["app_id"] == "cust-app-id-1234"
        assert call_kwargs["rest_api_key"] == "cust-rest-key-5678"
        assert call_kwargs["external_ids"] == [str(customer_user.id)]


def test_transport_partner_routing_credentials(
    settings, partner_user: User, active_partner_subscription: PartnerPushSubscription
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "cust-app-id-9999"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "cust-rest-key-9999"
    settings.ONESIGNAL_PARTNER_APP_ID = "partner-app-id-1234"
    settings.ONESIGNAL_PARTNER_REST_API_KEY = "partner-rest-key-5678"

    partner = partner_user.partner_profile
    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": True,
            "notification_id": "part-notif-uuid",
            "errors": [],
            "http_status": 200,
            "raw_response": {"id": "part-notif-uuid", "recipients": 1},
        }

        res = transport.send(
            recipient=partner_user,
            recipient_role="PARTNER",
            template_code="partner.instant_dispatch_offer",
            title="New Offer",
            body="Immediate visit available",
            deep_link=f"/partner/instant-offer/{partner.id}",
            idempotency_key="idemp-part-1",
        )

        assert res.accepted is True
        assert res.provider_message_id == "part-notif-uuid"
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args.kwargs
        assert call_kwargs["app_id"] == "partner-app-id-1234"
        assert call_kwargs["rest_api_key"] == "partner-rest-key-5678"
        assert call_kwargs["external_ids"] == [str(partner_user.id)]


def test_transport_missing_app_id_fails_clearly(settings, customer_user: User) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = ""
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "some-key"

    transport = OneSignalMessageTransport()
    with pytest.raises(MessageTransportError, match="Missing OneSignal credentials for CUSTOMER"):
        transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="test_template",
        )


def test_transport_unknown_role_fails_clearly(customer_user: User) -> None:
    transport = OneSignalMessageTransport()
    with pytest.raises(MessageTransportError, match="Unknown or missing recipient role"):
        transport.send(
            recipient=customer_user,
            recipient_role="ADMIN_ROLE",
            template_code="test_template",
        )


def test_transport_no_active_subscription_skips_without_onesignal_call(
    settings, customer_user: User
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-id"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "rest-key"

    # User has no subscriptions at all
    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="test_template",
            idempotency_key="no-sub-key",
        )

        assert res.accepted is False
        assert res.status == NotificationDelivery.Status.SKIPPED
        assert res.failure_code == "NO_ACTIVE_SUBSCRIPTION"
        mock_send.assert_not_called()

        # Check audit trail
        delivery = NotificationDelivery.objects.get(id=res.delivery_id)
        assert delivery.status == NotificationDelivery.Status.SKIPPED
        assert delivery.failure_code == "NO_ACTIVE_SUBSCRIPTION"
        intent = delivery.intent
        assert intent.status == NotificationIntent.Status.SUPPRESSED
        assert intent.suppressed_reason == "NO_ACTIVE_SUBSCRIPTION"


def test_transport_stale_subscription_skips(settings, customer_user: User) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-id"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "rest-key"
    settings.PUSH_SUBSCRIPTION_FRESHNESS_DAYS = 30
    now = timezone.now()

    CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(customer_user.id),
        is_active=True,
        opted_in=True,
        permission_state="granted",
        last_verified_at=now - timedelta(days=35),
    )

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="test_template",
            idempotency_key="stale-sub-key",
        )

        assert res.accepted is False
        assert res.status == NotificationDelivery.Status.SKIPPED
        assert res.failure_code == "STALE_SUBSCRIPTION"
        mock_send.assert_not_called()


def test_transport_opted_out_subscription_skips(settings, customer_user: User) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-id"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "rest-key"

    CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(customer_user.id),
        is_active=True,
        opted_in=False,  # Opted out
        permission_state="granted",
        last_verified_at=timezone.now(),
    )

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="test_template",
        )

        assert res.accepted is False
        assert res.status == NotificationDelivery.Status.SKIPPED
        assert res.failure_code == "OPTED_OUT"
        mock_send.assert_not_called()


def test_transport_permission_denied_subscription_skips(settings, customer_user: User) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-id"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "rest-key"

    CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(customer_user.id),
        is_active=False,
        opted_in=True,
        permission_state="denied",
        last_verified_at=timezone.now(),
    )

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="test_template",
        )

        assert res.accepted is False
        assert res.status == NotificationDelivery.Status.SKIPPED
        assert res.failure_code == "PERMISSION_DENIED"
        mock_send.assert_not_called()


# ============================================================================
# 2. Auditability and Idempotency Tests
# ============================================================================


def test_audit_intent_and_delivery_created_on_success(
    settings, customer_user: User, active_customer_subscription: CustomerPushSubscription
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-123"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "key-123"

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": True,
            "notification_id": "onesignal-nid-8888",
            "errors": [],
            "http_status": 200,
            "raw_response": {"id": "onesignal-nid-8888", "recipients": 1},
        }

        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking.confirmed",
            title="Booking Confirmed",
            body="Technician will arrive at 10 AM",
            deep_link="/bookings/444",
            idempotency_key="audit-test-key-1",
            ttl=3600,
            priority=10,
        )

        assert res.accepted is True
        assert res.provider_message_id == "onesignal-nid-8888"

        # Verify Intent
        intent = NotificationIntent.objects.get(idempotency_key="audit-test-key-1")
        assert intent.recipient == customer_user
        assert intent.channel == NotificationIntent.Channel.PUSH
        assert intent.status == NotificationIntent.Status.SENT
        assert intent.template_code == "booking.confirmed"
        assert intent.deep_link == "/bookings/444"

        # Verify Delivery
        delivery = NotificationDelivery.objects.get(intent=intent)
        assert delivery.provider == "onesignal"
        assert delivery.provider_message_id == "onesignal-nid-8888"
        assert delivery.status == NotificationDelivery.Status.ACCEPTED
        assert delivery.app_id == "app-123"
        assert delivery.response_status == 200
        assert delivery.completed_at is not None


def test_idempotency_prevents_duplicate_intent_and_send(
    settings, customer_user: User, active_customer_subscription: CustomerPushSubscription
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-123"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "key-123"

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": True,
            "notification_id": "nid-idempotent-first",
            "errors": [],
            "http_status": 200,
            "raw_response": {"id": "nid-idempotent-first"},
        }

        # First call
        res1 = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking.confirmed",
            idempotency_key="shared-idemp-key",
        )
        assert res1.accepted is True
        assert mock_send.call_count == 1

        # Second call with the same idempotency key
        res2 = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking.confirmed",
            idempotency_key="shared-idemp-key",
        )
        assert res2.accepted is True
        assert res2.provider_message_id == "nid-idempotent-first"
        # Must not call OneSignal a second time
        assert mock_send.call_count == 1

        # Verify only 1 NotificationIntent exists for this key
        assert NotificationIntent.objects.filter(idempotency_key="shared-idemp-key").count() == 1


# ============================================================================
# 3. Response Handling Tests (200 without ID, 429, 5xx, 400)
# ============================================================================


def test_onesignal_200_without_id_recorded_as_no_valid_recipients(
    settings, customer_user: User, active_customer_subscription: CustomerPushSubscription
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-123"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "key-123"

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": False,
            "notification_id": None,
            "errors": ["All included players are not subscribed"],
            "http_status": 200,
            "raw_response": {"id": "", "recipients": 0},
        }

        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking.confirmed",
        )

        assert res.accepted is False
        assert res.status == NotificationDelivery.Status.FAILED
        assert res.failure_code == "NO_VALID_RECIPIENTS"

        delivery = NotificationDelivery.objects.get(id=res.delivery_id)
        assert delivery.status == NotificationDelivery.Status.FAILED
        assert delivery.failure_code == "NO_VALID_RECIPIENTS"

        # Subscription deactivated when unsubscribed
        active_customer_subscription.refresh_from_db()
        assert active_customer_subscription.is_active is False


def test_onesignal_429_recorded_as_rate_limited(
    settings, customer_user: User, active_customer_subscription: CustomerPushSubscription
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-123"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "key-123"

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": False,
            "notification_id": None,
            "errors": ["Rate limit exceeded"],
            "http_status": 429,
            "raw_response": {},
        }

        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking.confirmed",
        )

        assert res.accepted is False
        assert res.status == NotificationDelivery.Status.RATE_LIMITED
        assert res.failure_code == "RATE_LIMITED_429"


def test_onesignal_5xx_recorded_as_retryable(
    settings, customer_user: User, active_customer_subscription: CustomerPushSubscription
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-123"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "key-123"

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": False,
            "notification_id": None,
            "errors": ["Internal Server Error"],
            "http_status": 502,
            "raw_response": {},
        }

        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking.confirmed",
        )

        assert res.accepted is False
        assert res.status == NotificationDelivery.Status.RETRYABLE
        assert res.failure_code == "SERVER_ERROR_502"


def test_onesignal_400_recorded_as_failed_and_deactivates_on_invalid(
    settings, customer_user: User, active_customer_subscription: CustomerPushSubscription
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-123"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "key-123"

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": False,
            "notification_id": None,
            "errors": ["Invalid player identifier"],
            "http_status": 400,
            "raw_response": {"errors": ["Invalid player identifier"]},
        }

        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking.confirmed",
        )

        assert res.accepted is False
        assert res.status == NotificationDelivery.Status.FAILED
        assert res.failure_code == "CLIENT_ERROR_400"

        active_customer_subscription.refresh_from_db()
        assert active_customer_subscription.is_active is False


# ============================================================================
# 4. Kill Switch Tests
# ============================================================================


def test_push_kill_switch_blocks_send_and_records_blocked(
    settings, customer_user: User, active_customer_subscription: CustomerPushSubscription
) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "app-123"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "key-123"

    # Engage PUSH kill switch
    engage_kill_switch(
        scope=KillSwitch.Scope.PUSH,
        reason="Emergency push shutoff for testing",
        actor=customer_user,
    )

    transport = OneSignalMessageTransport()
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        res = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking.confirmed",
            idempotency_key="kill-switch-test-1",
        )

        assert res.accepted is False
        assert res.status == NotificationDelivery.Status.BLOCKED
        assert res.failure_code == "PUSH_KILL_SWITCH_ENABLED"
        mock_send.assert_not_called()

        # Verify Intent suppressed reason
        intent = NotificationIntent.objects.get(id=res.intent_id)
        assert intent.status == NotificationIntent.Status.SUPPRESSED
        assert intent.suppressed_reason == "PUSH_KILL_SWITCH_ENABLED"

        # Verify Delivery record
        delivery = NotificationDelivery.objects.get(id=res.delivery_id)
        assert delivery.status == NotificationDelivery.Status.BLOCKED
        assert delivery.failure_code == "PUSH_KILL_SWITCH_ENABLED"

    # Release kill switch
    release_kill_switch(scope=KillSwitch.Scope.PUSH, actor=customer_user)

    # Now sending succeeds
    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": True,
            "notification_id": "nid-after-release",
            "errors": [],
            "http_status": 200,
            "raw_response": {"id": "nid-after-release"},
        }
        res2 = transport.send(
            recipient=customer_user,
            recipient_role="CUSTOMER",
            template_code="booking.confirmed",
            idempotency_key="kill-switch-test-2",
        )
        assert res2.accepted is True
        assert res2.provider_message_id == "nid-after-release"


def test_push_kill_switch_does_not_affect_sms_or_in_app(customer_user: User) -> None:
    # Engage PUSH kill switch
    engage_kill_switch(
        scope=KillSwitch.Scope.PUSH,
        reason="Emergency push shutoff",
        actor=customer_user,
    )

    # In-app notification should proceed normally
    intent = request_notification(
        recipient_id=customer_user.id,
        purpose="booking.downgraded_to_scheduled",
        channel=NotificationIntent.Channel.IN_APP,
        template_code="booking_downgraded_to_scheduled",
        context={"booking_id": "123"},
        idempotency_key="in-app-ks-test",
    )
    assert intent.status == NotificationIntent.Status.SENT
    assert intent.suppressed_reason == ""

    release_kill_switch(scope=KillSwitch.Scope.PUSH, actor=customer_user)


# ============================================================================
# 5. Delivery Status Reconciliation Tests
# ============================================================================


def test_reconciliation_updates_delivery_metrics(settings, customer_user: User) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "cust-app-rec"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "cust-key-rec"

    intent = NotificationIntent.objects.create(
        recipient=customer_user,
        purpose="booking.confirmed",
        channel=NotificationIntent.Channel.PUSH,
        template_code="booking_confirmed",
        status=NotificationIntent.Status.SENT,
    )
    delivery = NotificationDelivery.objects.create(
        intent=intent,
        provider="onesignal",
        status=NotificationDelivery.Status.ACCEPTED,
        provider_message_id="os-reconcile-nid",
        app_id="cust-app-rec",
    )

    with patch("apps.notifications.tasks.get_notification_view_metrics") as mock_view:
        mock_view.return_value = {
            "success": True,
            "http_status": 200,
            "successful": 1,
            "failed": 0,
            "errored": 0,
            "converted": 1,
            "received": 1,
            "remaining": 0,
        }

        res = reconcile_onesignal_push_delivery_status_task()
        assert res["reconciled"] == 1
        assert res["errored"] == 0

        delivery.refresh_from_db()
        assert delivery.status == NotificationDelivery.Status.DELIVERED
        assert delivery.metrics["converted"] == 1
        assert delivery.metrics["received"] == 1
        assert delivery.metrics["successful"] == 1


def test_reconciliation_429_does_not_crash(settings, customer_user: User) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "cust-app-rec"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "cust-key-rec"

    intent = NotificationIntent.objects.create(
        recipient=customer_user,
        purpose="booking.confirmed",
        channel=NotificationIntent.Channel.PUSH,
        template_code="booking_confirmed",
        status=NotificationIntent.Status.SENT,
    )
    NotificationDelivery.objects.create(
        intent=intent,
        provider="onesignal",
        status=NotificationDelivery.Status.ACCEPTED,
        provider_message_id="os-nid-429",
        app_id="cust-app-rec",
    )

    with patch("apps.notifications.tasks.get_notification_view_metrics") as mock_view:
        mock_view.return_value = {
            "success": False,
            "http_status": 429,
            "error": "Rate limit exceeded",
        }

        res = reconcile_onesignal_push_delivery_status_task()
        assert res["rate_limited"] == 1
        assert res["reconciled"] == 0


def test_reconciliation_5xx_does_not_crash(settings, customer_user: User) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "cust-app-rec"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "cust-key-rec"

    intent = NotificationIntent.objects.create(
        recipient=customer_user,
        purpose="booking.confirmed",
        channel=NotificationIntent.Channel.PUSH,
        template_code="booking_confirmed",
        status=NotificationIntent.Status.SENT,
    )
    NotificationDelivery.objects.create(
        intent=intent,
        provider="onesignal",
        status=NotificationDelivery.Status.ACCEPTED,
        provider_message_id="os-nid-500",
        app_id="cust-app-rec",
    )

    with patch("apps.notifications.tasks.get_notification_view_metrics") as mock_view:
        mock_view.return_value = {
            "success": False,
            "http_status": 500,
            "error": "Internal Server Error",
        }

        res = reconcile_onesignal_push_delivery_status_task()
        assert res["errored"] == 1
        assert res["reconciled"] == 0


def test_reconciliation_skips_older_than_7_days(settings, customer_user: User) -> None:
    settings.ONESIGNAL_CUSTOMER_APP_ID = "cust-app-rec"
    settings.ONESIGNAL_CUSTOMER_REST_API_KEY = "cust-key-rec"
    now = timezone.now()

    intent = NotificationIntent.objects.create(
        recipient=customer_user,
        purpose="booking.confirmed",
        channel=NotificationIntent.Channel.PUSH,
        template_code="booking_confirmed",
        status=NotificationIntent.Status.SENT,
    )
    delivery = NotificationDelivery.objects.create(
        intent=intent,
        provider="onesignal",
        status=NotificationDelivery.Status.ACCEPTED,
        provider_message_id="os-old-nid",
        app_id="cust-app-rec",
    )
    # Set created_at to 10 days ago
    NotificationDelivery.objects.filter(id=delivery.id).update(created_at=now - timedelta(days=10))

    with patch("apps.notifications.tasks.get_notification_view_metrics") as mock_view:
        res = reconcile_onesignal_push_delivery_status_task()
        mock_view.assert_not_called()
        assert res["reconciled"] == 0


# ============================================================================
# 6. Dispatch Send Migration Tests
# ============================================================================


def test_dispatch_task_uses_transport_and_creates_intent_delivery(
    settings, partner_user: User, active_partner_subscription: PartnerPushSubscription
) -> None:
    settings.ONESIGNAL_PARTNER_APP_ID = "partner-app-dispatch"
    settings.ONESIGNAL_PARTNER_REST_API_KEY = "partner-key-dispatch"

    booked = create_booked_group(key_prefix="m4-dispatch")
    booking = booked.booking
    partner = partner_user.partner_profile
    now = timezone.now()

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.transport.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": True,
            "notification_id": "dispatch-onesignal-nid-999",
            "errors": [],
            "http_status": 200,
            "raw_response": {"id": "dispatch-onesignal-nid-999", "recipients": 1},
        }

        res = send_dispatch_offer_push_task(str(offer.id))
        assert res["success"] is True
        assert res["notification_id"] == "dispatch-onesignal-nid-999"

        offer.refresh_from_db()
        assert offer.status == DispatchOffer.Status.SENT
        assert offer.onesignal_notification_id == "dispatch-onesignal-nid-999"
        assert offer.sent_at is not None

        # Verify that NotificationIntent and NotificationDelivery were created!
        intent = NotificationIntent.objects.filter(
            recipient=partner.user,
            purpose="partner.offer",
            channel=NotificationIntent.Channel.PUSH,
        ).first()
        assert intent is not None
        assert intent.status == NotificationIntent.Status.SENT

        delivery = NotificationDelivery.objects.filter(intent=intent).first()
        assert delivery is not None
        assert delivery.provider == "onesignal"
        assert delivery.provider_message_id == "dispatch-onesignal-nid-999"
        assert delivery.status == NotificationDelivery.Status.ACCEPTED
        assert delivery.app_id == "partner-app-dispatch"
