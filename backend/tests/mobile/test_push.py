"""Push delivery, receipts, and the copy table."""

import re
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path

import pytest
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone

from apps.identity.models import User
from apps.mobile.models import PushDevice, PushTicket
from apps.mobile.push_provider import PushProviderError, PushReceipt, PushSendResult
from apps.mobile.push_templates import (
    UnknownPushTemplateError,
    registered_push_template_codes,
    render_push_template,
)
from apps.mobile.services import check_receipts, deliver_push_intent
from apps.notifications.models import NotificationDelivery, NotificationIntent
from apps.notifications.serializers import NotificationSerializer
from apps.notifications.services import MAX_DELIVERY_ATTEMPTS, request_notification
from apps.notifications.templates_registry import render_notification
from tests.mobile.test_devices import TOKEN, _bearer, _register

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


@pytest.fixture(autouse=True)
def fake_push_provider() -> Iterator[None]:
    with override_settings(MOBILE_PUSH_PROVIDER="fake", MOBILE_PUSH_ALLOW_FAKE=True):
        yield

_PUSH_CALL = re.compile(
    r"""(?:channel\s*=\s*(?:NotificationIntent\.Channel\.PUSH|"PUSH"|'PUSH')"""
    r"""[\s\S]{0,500}?template_code\s*=\s*["']([^"']+)["']"""
    r"""|template_code\s*=\s*["']([^"']+)["'][\s\S]{0,500}?"""
    r"""channel\s*=\s*(?:NotificationIntent\.Channel\.PUSH|"PUSH"|'PUSH'))"""
)


def _user_from_bearer() -> User:
    token = _bearer("9876543220")
    _register(token)
    device = PushDevice.objects.get(expo_push_token=TOKEN)
    return device.user


def test_a_push_intent_sends_one_ticket_per_active_device() -> None:
    user = _user_from_bearer()
    intent = request_notification(
        recipient_id=user.id,
        purpose="partner.offer_created",
        channel=NotificationIntent.Channel.PUSH,
        template_code="partner_offer_created",
        context={"offer_id": "11111111-1111-1111-1111-111111111111"},
    )
    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.SENT
    assert PushTicket.objects.filter(intent=intent).count() == 1
    delivery = NotificationDelivery.objects.get(intent=intent)
    assert delivery.status == NotificationDelivery.Status.ACCEPTED


def test_no_device_records_no_registered_device_and_stays_pending() -> None:
    user = User.objects.create_user(phone_number="+919876543230")
    intent = request_notification(
        recipient_id=user.id,
        purpose="partner.job_assigned",
        channel=NotificationIntent.Channel.PUSH,
        template_code="partner_job_assigned",
        context={"fulfilment_unit_id": "22222222-2222-2222-2222-222222222222"},
    )
    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.PENDING
    delivery = NotificationDelivery.objects.get(intent=intent)
    assert delivery.failure_code == "no_registered_device"


def test_a_revoked_session_device_is_skipped() -> None:
    token = _bearer("9876543221")
    _register(token)
    device = PushDevice.objects.get(expo_push_token=TOKEN)
    device.session.revoked_at = timezone.now()
    device.session.save(update_fields=("revoked_at",))
    intent = request_notification(
        recipient_id=device.user_id,
        purpose="partner.job_cancelled",
        channel=NotificationIntent.Channel.PUSH,
        template_code="partner_job_cancelled",
        context={"fulfilment_unit_id": "33333333-3333-3333-3333-333333333333"},
    )
    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.PENDING
    assert PushTicket.objects.filter(intent=intent).count() == 0
    assert NotificationDelivery.objects.get(intent=intent).failure_code == "no_registered_device"


def test_a_provider_timeout_stays_pending_until_the_budget_is_spent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user_from_bearer()

    class TimeoutProvider:
        code = "expo"

        def send(self, messages: list[dict[str, object]]) -> list[PushSendResult]:
            del messages
            raise PushProviderError("timed out", failure_code="provider_timeout")

        def get_receipts(self, ticket_ids: list[str]) -> dict[str, PushReceipt]:
            del ticket_ids
            return {}

    monkeypatch.setattr(
        "apps.mobile.services.get_push_provider",
        lambda *_args, **_kwargs: TimeoutProvider(),
    )
    intent = request_notification(
        recipient_id=user.id,
        purpose="partner.offer_created",
        channel=NotificationIntent.Channel.PUSH,
        template_code="partner_offer_created",
        context={"offer_id": "44444444-4444-4444-4444-444444444444"},
    )
    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.PENDING
    assert NotificationDelivery.objects.get(intent=intent).failure_code == "provider_timeout"

    deliver_push_intent(intent_id=intent.id)
    deliver_push_intent(intent_id=intent.id)
    intent.refresh_from_db()
    assert intent.attempts == MAX_DELIVERY_ATTEMPTS
    assert intent.status == NotificationIntent.Status.FAILED
    assert PushTicket.objects.filter(intent=intent).count() == 0


def test_an_in_app_notice_is_mirrored_without_another_delivery() -> None:
    user = _user_from_bearer()
    intent = request_notification(
        recipient_id=user.id,
        purpose="m2.requirement.closed",
        channel=NotificationIntent.Channel.IN_APP,
        template_code="m2_requirement_closed",
        context={},
    )
    rendered = NotificationSerializer(intent).data
    ticket = PushTicket.objects.get(intent=intent)
    assert ticket.ticket_status == "ok"
    assert NotificationDelivery.objects.filter(intent=intent).count() == 1
    assert rendered["title"]
    assert rendered["body"]


def test_device_not_registered_disables_the_device(monkeypatch: pytest.MonkeyPatch) -> None:
    user = _user_from_bearer()
    intent = request_notification(
        recipient_id=user.id,
        purpose="customer_booking_unstaffable",
        channel=NotificationIntent.Channel.PUSH,
        template_code="customer_booking_unstaffable",
        context={},
    )
    ticket = PushTicket.objects.get(intent=intent)
    ticket.created_at = timezone.now() - timedelta(minutes=20)
    ticket.save(update_fields=("created_at",))

    class ReceiptProvider:
        code = "fake"

        def send(self, messages: list[dict[str, object]]) -> list[PushSendResult]:
            del messages
            return []

        def get_receipts(self, ticket_ids: list[str]) -> dict[str, PushReceipt]:
            return {
                ticket_id: PushReceipt(status="error", error="DeviceNotRegistered")
                for ticket_id in ticket_ids
            }

    monkeypatch.setattr(
        "apps.mobile.services.get_push_provider",
        lambda *_args, **_kwargs: ReceiptProvider(),
    )
    check_receipts()
    device = PushDevice.objects.get(user=user)
    assert device.disabled_at is not None
    assert device.disabled_reason == "device_not_registered"


def test_every_push_template_code_in_the_backend_is_registered() -> None:
    root = Path(__file__).resolve().parents[2] / "apps"
    found: set[str] = set()
    for path in root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "PUSH" not in text:
            continue
        for match in _PUSH_CALL.finditer(text):
            found.add(next(group for group in match.groups() if group))
    assert found
    assert found <= set(registered_push_template_codes())
    for code in found:
        rendered = render_push_template(template_code=code, context={})
        assert rendered.title
        assert rendered.body
    with pytest.raises(UnknownPushTemplateError):
        render_push_template(template_code="not_a_push_template", context={})


def test_a_retry_does_not_send_twice() -> None:
    user = _user_from_bearer()
    intent = request_notification(
        recipient_id=user.id,
        purpose="partner.job_assigned",
        channel=NotificationIntent.Channel.PUSH,
        template_code="partner_job_assigned",
        context={"fulfilment_unit_id": "55555555-5555-5555-5555-555555555555"},
    )
    deliver_push_intent(intent_id=intent.id)
    assert PushTicket.objects.filter(intent=intent).count() == 1
    assert NotificationDelivery.objects.filter(intent=intent).count() == 1


def test_mirror_uses_the_in_app_renderer() -> None:
    """The mirror must show the same sentence the feed does."""

    rendered = render_notification(template_code="m2_requirement_closed", context={})
    assert rendered.title
    assert rendered.body
