"""WhatsApp booking updates: the gates, the exact Meta payload, and every delivery outcome."""

from http import HTTPStatus
from typing import Any

import pytest
import requests
from celery.exceptions import Retry
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.identity.models import CommunicationPreference, User
from apps.notifications.models import NotificationDelivery, NotificationIntent
from apps.notifications.services import MAX_DELIVERY_ATTEMPTS
from apps.notifications.tasks import send_whatsapp_notice
from apps.notifications.whatsapp import (
    OPT_IN_PURPOSE,
    PROVIDER,
    RETRY,
    deliver_whatsapp_intent,
    queue_whatsapp_copy,
)
from tests.fulfilment.conftest import create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)

EN_ROUTE = {"partner_name": "Ravi", "service": "AC Repair", "target_id": "group-123"}


class _Response:
    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        self.status_code = status_code
        self._body = body
        self.content = b"{}"

    def json(self) -> dict[str, Any]:
        return self._body


@pytest.fixture
def whatsapp_on(settings: SettingsWrapper) -> None:
    settings.WHATSAPP_ENABLED = True
    settings.WHATSAPP_ACCESS_TOKEN = "test-token"  # noqa: S105 - a test value
    settings.WHATSAPP_PHONE_NUMBER_ID = "1234567890"
    settings.WHATSAPP_GRAPH_API_VERSION = "v23.0"
    settings.WHATSAPP_TEMPLATE_LANGUAGE = "en"


def _meta(monkeypatch: pytest.MonkeyPatch, *responses: _Response) -> list[dict[str, Any]]:
    """Stand in for Meta. Records every call; the last response repeats."""

    calls: list[dict[str, Any]] = []

    def post(url: str, **kwargs: Any) -> _Response:
        calls.append({"url": url, **kwargs})
        return responses[min(len(calls), len(responses)) - 1]

    monkeypatch.setattr(requests, "post", post)
    return calls


def _customer(*, opted_in: bool, full_name: str = "Priya Sharma") -> User:
    user = User.objects.create_user(phone_number="+919811100001")
    user.full_name = full_name
    user.save(update_fields=("full_name",))
    if opted_in:
        CommunicationPreference.objects.create(
            user=user,
            channel=CommunicationPreference.Channel.WHATSAPP,
            purpose=OPT_IN_PURPOSE,
            is_enabled=True,
        )
    return user


def _queue(user: User, template_code: str = "customer_visit_en_route", key: str = "k-1") -> None:
    queue_whatsapp_copy(
        recipient_id=user.id,
        purpose="booking.partner_en_route",
        template_code=template_code,
        context=EN_ROUTE,
        idempotency_key=key,
    )


def _whatsapp_intent(user: User) -> NotificationIntent:
    return NotificationIntent.objects.get(
        recipient=user, channel=NotificationIntent.Channel.WHATSAPP
    )


@pytest.mark.usefixtures("whatsapp_on")
def test_an_opted_in_customer_gets_the_exact_approved_template(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _meta(monkeypatch, _Response(200, {"messages": [{"id": "wamid.ABC"}]}))
    user = _customer(opted_in=True)

    _queue(user)

    assert len(calls) == 1
    assert calls[0]["url"] == "https://graph.facebook.com/v23.0/1234567890/messages"
    assert calls[0]["headers"] == {"Authorization": "Bearer test-token"}
    assert calls[0]["json"] == {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": "+919811100001",
        "type": "template",
        "template": {
            "name": "professional_on_the_way",
            "language": {"code": "en"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": "Ravi"},
                        {"type": "text", "text": "AC Repair"},
                    ],
                },
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [{"type": "text", "text": "group-123"}],
                },
            ],
        },
    }
    intent = _whatsapp_intent(user)
    assert intent.status == NotificationIntent.Status.SENT
    delivery = NotificationDelivery.objects.get(intent=intent)
    assert delivery.provider == PROVIDER
    assert delivery.provider_message_id == "wamid.ABC"
    assert delivery.request_payload == {"template": "professional_on_the_way"}, "no phone stored"


@pytest.mark.usefixtures("whatsapp_on")
def test_work_done_greets_the_customer_by_first_name(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _meta(monkeypatch, _Response(200, {"messages": [{"id": "wamid.DEF"}]}))
    user = _customer(opted_in=True)

    _queue(user, template_code="customer_visit_work_submitted")

    body = calls[0]["json"]["template"]["components"][0]["parameters"]
    assert [p["text"] for p in body] == ["Priya", "Ravi", "AC Repair"]
    assert calls[0]["json"]["template"]["name"] == "work_done_please_confirm"


@pytest.mark.usefixtures("whatsapp_on")
def test_a_missing_name_is_skipped_rather_than_sent_blank(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _meta(monkeypatch, _Response(200, {"messages": [{"id": "x"}]}))
    user = _customer(opted_in=True, full_name="")

    _queue(user, template_code="customer_visit_work_submitted")

    assert calls == []
    intent = _whatsapp_intent(user)
    assert intent.status == NotificationIntent.Status.FAILED
    assert NotificationDelivery.objects.get(intent=intent).failure_code == "missing_value"


@pytest.mark.usefixtures("whatsapp_on")
def test_nobody_is_messaged_without_opting_in(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _meta(monkeypatch, _Response(200, {}))
    user = _customer(opted_in=False)

    _queue(user)

    assert calls == []
    intent = _whatsapp_intent(user)
    assert intent.status == NotificationIntent.Status.SUPPRESSED
    assert intent.suppressed_reason == "whatsapp_not_opted_in"


@pytest.mark.usefixtures("whatsapp_on")
def test_turning_it_off_stops_messages(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _meta(monkeypatch, _Response(200, {}))
    user = _customer(opted_in=True)
    CommunicationPreference.objects.filter(user=user).update(is_enabled=False)

    _queue(user)

    assert calls == []
    assert _whatsapp_intent(user).status == NotificationIntent.Status.SUPPRESSED


@pytest.mark.usefixtures("whatsapp_on")
def test_one_event_is_one_message(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _meta(monkeypatch, _Response(200, {"messages": [{"id": "wamid.1"}]}))
    user = _customer(opted_in=True)

    _queue(user, key="same-event")
    _queue(user, key="same-event")

    assert len(calls) == 1
    assert NotificationIntent.objects.filter(recipient=user, channel="WHATSAPP").count() == 1


@pytest.mark.usefixtures("whatsapp_on")
def test_a_meta_rejection_fails_at_once_and_keeps_meta_s_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _meta(
        monkeypatch,
        _Response(400, {"error": {"code": 132000, "message": "Number of parameters mismatch"}}),
    )
    user = _customer(opted_in=True)

    _queue(user)

    assert len(calls) == 1, "a 4xx is not retried"
    intent = _whatsapp_intent(user)
    assert intent.status == NotificationIntent.Status.FAILED
    delivery = NotificationDelivery.objects.get(intent=intent)
    assert delivery.failure_code == "meta_132000"
    assert delivery.response_body["message"] == "Number of parameters mismatch"


@pytest.mark.usefixtures("whatsapp_on")
def test_a_temporary_meta_error_schedules_a_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    """The worker retries on a widening schedule; here the first attempt asks for one."""

    _meta(monkeypatch, _Response(503, {"error": {"code": 2, "message": "down"}}))
    user = _customer(opted_in=True)

    with pytest.raises(Retry):
        _queue(user)

    intent = _whatsapp_intent(user)
    assert intent.status == NotificationIntent.Status.PENDING, "still worth another attempt"
    delivery = NotificationDelivery.objects.get(intent=intent)
    assert delivery.status == NotificationDelivery.Status.RETRYABLE
    assert delivery.failure_code == "provider_temporary_error"


@pytest.mark.usefixtures("whatsapp_on")
def test_repeated_temporary_errors_end_as_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _meta(monkeypatch, _Response(503, {"error": {"code": 2, "message": "down"}}))
    monkeypatch.setattr(send_whatsapp_notice, "delay", lambda *_args: None)
    user = _customer(opted_in=True)
    _queue(user)
    intent = _whatsapp_intent(user)

    outcomes = [deliver_whatsapp_intent(intent_id=intent.id) for _ in range(MAX_DELIVERY_ATTEMPTS)]

    assert outcomes == [RETRY] * MAX_DELIVERY_ATTEMPTS
    assert len(calls) == MAX_DELIVERY_ATTEMPTS
    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.FAILED
    assert deliver_whatsapp_intent(intent_id=intent.id) == "skipped", (
        "a settled intent is left alone"
    )


def test_nothing_is_recorded_while_whatsapp_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _meta(monkeypatch, _Response(200, {}))
    user = _customer(opted_in=True)

    _queue(user)

    assert calls == []
    assert not NotificationIntent.objects.filter(channel="WHATSAPP").exists()


@pytest.mark.usefixtures("whatsapp_on")
def test_a_captured_payment_records_the_whatsapp_confirmation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _meta(monkeypatch, _Response(200, {"messages": [{"id": "wamid.X"}]}))

    booked = create_booked_group(key_prefix="whatsapp-confirmed")

    intent = NotificationIntent.objects.get(
        recipient=booked.customer, channel="WHATSAPP", template_code="customer_booking_confirmed"
    )
    # The fixture's customer never opted in, so the confirmation is recorded and held back.
    assert intent.status == NotificationIntent.Status.SUPPRESSED
    assert intent.suppressed_reason == "whatsapp_not_opted_in"
    assert calls == []


def test_the_preferences_api_accepts_the_whatsapp_opt_in() -> None:
    user = User.objects.create_user(phone_number="+919811100002")
    client = APIClient()
    client.force_authenticate(user)

    response = client.put(
        "/api/v1/auth/privacy/preferences/",
        {"channel": "WHATSAPP", "purpose": OPT_IN_PURPOSE, "is_enabled": True},
        format="json",
    )

    assert response.status_code == HTTPStatus.OK, response.json()
    assert CommunicationPreference.objects.get(user=user).channel == "WHATSAPP"
