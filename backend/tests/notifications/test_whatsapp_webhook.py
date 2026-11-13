"""Meta's WhatsApp status callbacks (`notifications.whatsapp_webhook`).

Protects: **only Meta can report a status, and a report moves a delivery forward, never back.** An
unsigned callback is refused before it is read; `failed` settles the delivery and its intent;
`delivered` and `read` mark it delivered; a late `delivered` after `failed` changes nothing.
"""

import hashlib
import hmac
import json
import uuid
from typing import Any

import pytest
from django.test import Client, override_settings

from apps.identity.models import User
from apps.notifications.models import NotificationDelivery, NotificationIntent
from apps.notifications.services import record_delivery_attempt, request_notification
from apps.notifications.whatsapp import PROVIDER

pytestmark = pytest.mark.django_db(transaction=True)

URL = "/api/v1/notification-webhooks/whatsapp/"
SECRET = "test-app-secret"  # noqa: S105 - a test value, not a credential
VERIFY_TOKEN = "test-verify-token"  # noqa: S105 - a test value
MESSAGE_ID = "wamid.TEST"

HTTP_OK = 200
HTTP_FORBIDDEN = 403


def _sent_whatsapp() -> NotificationDelivery:
    user = User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")
    intent = request_notification(
        recipient_id=user.id,
        purpose="booking.visit_progress",
        channel=NotificationIntent.Channel.WHATSAPP,
        audience=NotificationIntent.Audience.CUSTOMER,
        template_code="customer_visit_work_submitted",
        context={"partner_name": "Ravi", "service": "AC service"},
    )
    record_delivery_attempt(
        intent_id=intent.id,
        provider=PROVIDER,
        status=NotificationDelivery.Status.ACCEPTED,
        provider_message_id=MESSAGE_ID,
    )
    return NotificationDelivery.objects.get(intent=intent)


def _payload(status: str, **extra: Any) -> bytes:
    return json.dumps(
        {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "changes": [
                        {"value": {"statuses": [{"id": MESSAGE_ID, "status": status, **extra}]}}
                    ]
                }
            ],
        }
    ).encode()


def _post(body: bytes, *, secret: str = SECRET) -> int:
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    response = Client().post(
        URL, data=body, content_type="application/json", HTTP_X_HUB_SIGNATURE_256=signature
    )
    return response.status_code


@override_settings(WHATSAPP_WEBHOOK_VERIFY_TOKEN=VERIFY_TOKEN)
def test_meta_verification_echoes_the_challenge() -> None:
    response = Client().get(
        URL, {"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "42"}
    )

    assert response.status_code == HTTP_OK
    assert response.content == b"42"


@override_settings(WHATSAPP_WEBHOOK_VERIFY_TOKEN=VERIFY_TOKEN)
def test_verification_with_the_wrong_token_is_refused() -> None:
    response = Client().get(
        URL, {"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "42"}
    )

    assert response.status_code == HTTP_FORBIDDEN


@override_settings(WHATSAPP_WEBHOOK_VERIFY_TOKEN="")
def test_verification_with_no_token_configured_is_refused() -> None:
    response = Client().get(
        URL, {"hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1"}
    )

    assert response.status_code == HTTP_FORBIDDEN


@override_settings(WHATSAPP_APP_SECRET=SECRET)
def test_a_wrongly_signed_callback_is_refused_and_changes_nothing() -> None:
    delivery = _sent_whatsapp()

    assert _post(_payload("failed"), secret="someone-else")  # noqa: S106 == HTTP_FORBIDDEN

    delivery.refresh_from_db()
    assert delivery.status == NotificationDelivery.Status.ACCEPTED


@override_settings(WHATSAPP_APP_SECRET="")
def test_with_no_secret_configured_every_callback_is_refused() -> None:
    assert _post(_payload("delivered"), secret="") == HTTP_FORBIDDEN


@override_settings(WHATSAPP_APP_SECRET=SECRET)
def test_delivered_marks_the_delivery_delivered() -> None:
    delivery = _sent_whatsapp()

    assert _post(_payload("delivered")) == HTTP_OK

    delivery.refresh_from_db()
    assert delivery.status == NotificationDelivery.Status.DELIVERED
    assert delivery.completed_at is not None


@override_settings(WHATSAPP_APP_SECRET=SECRET)
def test_read_records_when() -> None:
    delivery = _sent_whatsapp()

    _post(_payload("read"))

    delivery.refresh_from_db()
    assert delivery.status == NotificationDelivery.Status.DELIVERED
    assert "read_at" in delivery.metrics


@override_settings(WHATSAPP_APP_SECRET=SECRET)
def test_failed_settles_the_delivery_and_its_intent() -> None:
    delivery = _sent_whatsapp()

    _post(_payload("failed", errors=[{"code": 131026, "title": "Message undeliverable"}]))

    delivery.refresh_from_db()
    assert delivery.status == NotificationDelivery.Status.FAILED
    assert delivery.failure_code == "meta_131026"
    assert delivery.intent.status == NotificationIntent.Status.FAILED


@override_settings(WHATSAPP_APP_SECRET=SECRET)
def test_a_late_delivered_does_not_undo_failed() -> None:
    delivery = _sent_whatsapp()
    _post(_payload("failed", errors=[{"code": 131026}]))

    _post(_payload("delivered"))

    delivery.refresh_from_db()
    assert delivery.status == NotificationDelivery.Status.FAILED


@override_settings(WHATSAPP_APP_SECRET=SECRET)
def test_a_status_for_an_unknown_message_is_acknowledged() -> None:
    # Meta retries anything but a 200 for days.
    assert _post(_payload("delivered")) == HTTP_OK
