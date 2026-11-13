"""Copying notices onto WhatsApp and SMS (`notifications.channel_router`, `whatsapp`, `sms`).

The properties this file protects:

1. **One notice, at most one message.** However often the task runs, and however often the
   notice is saved again (marked read), a person gets one WhatsApp or SMS for it.
2. **Every gate holds.** A channel switched off sends nothing and records nothing; a kill switch, a
   missing opt-in, a stale notice or a missing value is recorded with its reason, never sent.
3. **A provider's answer is recorded truthfully.** Accepted is `SENT`; a temporary refusal is
   retried; anything else settles the copy instead of leaving it `PENDING`.

Meta is never called: `requests.post` is replaced. SMS goes through the fake transport the test
settings select.
"""

import uuid
from datetime import timedelta
from typing import Any

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.identity.models import CommunicationPreference, User
from apps.notifications import whatsapp
from apps.notifications.channel_router import copy_notice, is_copy_source, send_copy
from apps.notifications.feed import mark_read
from apps.notifications.models import KillSwitch, NotificationDelivery, NotificationIntent
from apps.notifications.outcomes import RETRY, SENT, SKIPPED, clean_value
from apps.notifications.services import request_notification

pytestmark = pytest.mark.django_db(transaction=True)

Channel = NotificationIntent.Channel
Status = NotificationIntent.Status

#: Routed to WhatsApp; its copy needs `partner_name` and `service`.
WHATSAPP_CODE = "customer_visit_work_submitted"
#: Routed to SMS; its copy needs `partner_name`.
SMS_CODE = "customer_visit_arrived"
CONTEXT = {"partner_name": "Ravi", "service": "AC service"}

WHATSAPP_ON = {
    "WHATSAPP_ENABLED": True,
    "WHATSAPP_ACCESS_TOKEN": "test-token",
    "WHATSAPP_PHONE_NUMBER_ID": "1234567890",
}
SMS_ON = {"SMS_NOTIFICATIONS_ENABLED": True, "MSG91_TEMPLATE_IDS": {SMS_CODE: "msg91-tmpl-1"}}

HTTP_OK = 200
HTTP_BAD_REQUEST = 400
HTTP_SERVER_ERROR = 503


class _MetaResponse:
    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        self.status_code = status_code
        self._body = body

    def json(self) -> dict[str, Any]:
        return self._body


class _FakeMeta:
    """Stands in for `requests.post` inside `notifications.whatsapp`."""

    def __init__(self, status_code: int = HTTP_OK, body: dict[str, Any] | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self.status_code = status_code
        self.body = body if body is not None else {"messages": [{"id": "wamid.TEST"}]}

    def __call__(self, url: str, **kwargs: Any) -> _MetaResponse:
        self.calls.append({"url": url, **kwargs})
        return _MetaResponse(self.status_code, self.body)


@pytest.fixture
def meta(monkeypatch: pytest.MonkeyPatch) -> _FakeMeta:
    fake = _FakeMeta()
    monkeypatch.setattr(whatsapp.requests, "post", fake)
    return fake


def _user() -> User:
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _opt_in(user: User) -> None:
    CommunicationPreference.objects.create(
        user=user,
        channel=CommunicationPreference.Channel.WHATSAPP,
        purpose=whatsapp.OPT_IN_PURPOSE,
        is_enabled=True,
    )


def _notice(
    user: User,
    *,
    code: str = WHATSAPP_CODE,
    audience: str = NotificationIntent.Audience.CUSTOMER,
    context: dict[str, Any] | None = None,
) -> NotificationIntent:
    return request_notification(
        recipient_id=user.id,
        purpose="booking.visit_progress",
        channel=Channel.IN_APP,
        audience=audience,
        template_code=code,
        context=CONTEXT if context is None else context,
        idempotency_key=f"test-notice:{uuid.uuid4()}",
    )


def _copies(user: User, channel: str = Channel.WHATSAPP) -> list[NotificationIntent]:
    return list(NotificationIntent.objects.filter(recipient=user, channel=channel))


# --- The end-to-end path: a notice written in-app reaches WhatsApp --------------------------------


@override_settings(**WHATSAPP_ON)
def test_an_opted_in_customer_gets_the_notice_on_whatsapp(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)

    _notice(user)

    [copy] = _copies(user)
    assert copy.status == Status.SENT
    assert copy.template_code == WHATSAPP_CODE
    [call] = meta.calls
    template = call["json"]["template"]
    assert template["name"] == WHATSAPP_CODE
    values = [p["text"] for p in template["components"][0]["parameters"]]
    assert values == ["Ravi", "AC service"]
    assert call["json"]["to"] == user.phone_number.removeprefix("+")
    delivery = copy.deliveries.get()
    assert delivery.status == NotificationDelivery.Status.ACCEPTED
    assert delivery.provider_message_id == "wamid.TEST"
    # Nothing personal in the delivery record.
    assert delivery.request_payload == {"template": WHATSAPP_CODE}


@override_settings(**WHATSAPP_ON)
def test_without_opt_in_the_copy_is_recorded_and_never_sent(meta: _FakeMeta) -> None:
    user = _user()

    _notice(user)

    [copy] = _copies(user)
    assert copy.status == Status.SUPPRESSED
    assert copy.suppressed_reason == "whatsapp_not_opted_in"
    assert meta.calls == []


@override_settings(**WHATSAPP_ON)
def test_an_opt_in_that_was_turned_off_counts_as_none(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)
    CommunicationPreference.objects.filter(user=user).update(is_enabled=False)

    _notice(user)

    assert _copies(user)[0].suppressed_reason == "whatsapp_not_opted_in"
    assert meta.calls == []


def test_with_the_channel_off_nothing_is_recorded_at_all(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)

    _notice(user)

    assert _copies(user) == []
    assert meta.calls == []


@override_settings(**WHATSAPP_ON)
def test_a_notice_not_in_the_plan_is_never_copied(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)

    _notice(user, code="m2_requirement_submitted", context={})

    assert _copies(user) == []
    assert meta.calls == []


@pytest.mark.usefixtures("meta")
@override_settings(**WHATSAPP_ON)
def test_operations_notices_stay_in_the_console() -> None:
    user = _user()
    _opt_in(user)

    _notice(user, audience=NotificationIntent.Audience.OPERATIONS)

    assert _copies(user) == []


@override_settings(**WHATSAPP_ON)
def test_the_whatsapp_kill_switch_suppresses_the_copy(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)
    KillSwitch.objects.create(scope=KillSwitch.Scope.WHATSAPP, is_engaged=True, reason="test")

    _notice(user)

    [copy] = _copies(user)
    assert copy.status == Status.SUPPRESSED
    assert copy.suppressed_reason == "kill_switch_engaged"
    assert meta.calls == []


# --- One notice, at most one message -------------------------------------------------------------


@override_settings(**WHATSAPP_ON)
def test_marking_the_notice_read_sends_nothing_more(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)
    notice = _notice(user)

    mark_read(recipient=user, audience=notice.audience, notification_id=notice.id)

    assert len(_copies(user)) == 1
    assert len(meta.calls) == 1


@override_settings(**WHATSAPP_ON)
def test_running_the_send_again_sends_nothing_more(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)
    notice = _notice(user)

    assert send_copy(source_intent_id=notice.id) == SKIPPED

    assert len(_copies(user)) == 1
    assert len(meta.calls) == 1


def test_a_notice_is_copied_from_one_channel_only() -> None:
    in_app_code_as_push = NotificationIntent(template_code=WHATSAPP_CODE, channel=Channel.PUSH)
    push_only = NotificationIntent(
        template_code="customer_booking_unstaffable", channel=Channel.PUSH
    )
    push_only_in_app = NotificationIntent(
        template_code="customer_booking_unstaffable", channel=Channel.IN_APP
    )

    assert not is_copy_source(in_app_code_as_push)
    assert is_copy_source(push_only)
    assert not is_copy_source(push_only_in_app)


# --- Provider answers and late or incomplete notices ---------------------------------------------


def _notice_written_before_the_channel_was_on(user: User) -> NotificationIntent:
    """A notice with no copy scheduled, so a test can drive `send_copy` itself."""

    return _notice(user)


def test_a_temporary_meta_refusal_is_retried_not_settled(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)
    notice = _notice_written_before_the_channel_was_on(user)
    meta.status_code = HTTP_SERVER_ERROR
    meta.body = {"error": {"code": 131000, "message": "Something went wrong"}}

    with override_settings(**WHATSAPP_ON):
        outcome = send_copy(source_intent_id=notice.id)

    assert outcome == RETRY
    [copy] = _copies(user)
    assert copy.status == Status.PENDING
    assert copy.deliveries.get().status == NotificationDelivery.Status.RETRYABLE


def test_a_permanent_meta_refusal_settles_the_copy_failed(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)
    notice = _notice_written_before_the_channel_was_on(user)
    meta.status_code = HTTP_BAD_REQUEST
    meta.body = {"error": {"code": 132001, "message": "Template name does not exist"}}

    with override_settings(**WHATSAPP_ON):
        send_copy(source_intent_id=notice.id)

    [copy] = _copies(user)
    assert copy.status == Status.FAILED
    delivery = copy.deliveries.get()
    assert delivery.failure_code == "meta_132001"


def test_a_late_copy_is_skipped_as_stale(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)
    notice = _notice_written_before_the_channel_was_on(user)
    NotificationIntent.objects.filter(id=notice.id).update(
        created_at=timezone.now() - timedelta(hours=25)
    )

    with override_settings(**WHATSAPP_ON):
        assert send_copy(source_intent_id=notice.id) == SKIPPED

    [copy] = _copies(user)
    assert copy.deliveries.get().failure_code == "stale"
    assert meta.calls == []


def test_a_missing_value_skips_rather_than_sends_a_blank(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)
    notice = _notice(user, context={"partner_name": "Ravi"})  # no `service`

    with override_settings(**WHATSAPP_ON):
        assert send_copy(source_intent_id=notice.id) == SKIPPED

    [copy] = _copies(user)
    assert copy.status == Status.FAILED
    assert copy.deliveries.get().failure_code == "missing_value"
    assert meta.calls == []


def test_whatsapp_switched_on_without_credentials_sends_nothing(meta: _FakeMeta) -> None:
    user = _user()
    _opt_in(user)
    notice = _notice_written_before_the_channel_was_on(user)

    with override_settings(WHATSAPP_ENABLED=True, WHATSAPP_ACCESS_TOKEN=""):
        assert send_copy(source_intent_id=notice.id) == SKIPPED

    assert _copies(user)[0].deliveries.get().failure_code == "not_configured"
    assert meta.calls == []


# --- SMS -----------------------------------------------------------------------------------------


@override_settings(**SMS_ON)
def test_an_sms_notice_goes_out_without_any_opt_in() -> None:
    user = _user()

    notice = _notice(user, code=SMS_CODE, context={"partner_name": "Ravi"})

    [copy] = _copies(user, Channel.SMS)
    assert copy.status == Status.SENT
    assert copy.deliveries.get().status == NotificationDelivery.Status.ACCEPTED
    assert send_copy(source_intent_id=notice.id) == SKIPPED  # still one message


@override_settings(SMS_NOTIFICATIONS_ENABLED=True, MSG91_TEMPLATE_IDS={})
def test_an_sms_with_no_registered_template_is_skipped() -> None:
    user = _user()

    _notice(user, code=SMS_CODE, context={"partner_name": "Ravi"})

    [copy] = _copies(user, Channel.SMS)
    assert copy.status == Status.FAILED
    assert copy.deliveries.get().failure_code == "no_provider_template"


def test_sms_outcome_is_sent_when_called_directly() -> None:
    user = _user()
    notice = _notice(user, code=SMS_CODE, context={"partner_name": "Ravi"})

    with override_settings(**SMS_ON):
        assert send_copy(source_intent_id=notice.id) == SENT


@pytest.mark.usefixtures("meta")
@override_settings(**WHATSAPP_ON)
def test_copy_notice_returns_the_existing_copy() -> None:
    user = _user()
    _opt_in(user)
    notice = _notice(user)

    first = _copies(user)[0]

    assert copy_notice(notice) == first


# --- Values --------------------------------------------------------------------------------------


def test_values_are_one_line_and_bounded() -> None:
    assert clean_value("Ravi\n\tKumar   Reddy", max_length=100) == "Ravi Kumar Reddy"
    assert clean_value("A" * 40, max_length=30) == "A" * 30
    assert clean_value(None, max_length=30) == ""
    assert clean_value(1500, max_length=30) == "1500"
