"""A push intent with no Expo copy fails at once and never stops the sweep (Taxi brief A3)."""

import logging
from collections.abc import Iterator
from types import SimpleNamespace

import pytest
from django.core.cache import cache
from django.test import override_settings

from apps.identity.models import User
from apps.mobile import signals
from apps.mobile.models import PushTicket
from apps.mobile.services import deliver_push_intent, sweep_pending_push_intents
from apps.notifications.models import NotificationDelivery, NotificationIntent
from tests.mobile.test_push import _user_from_bearer

pytestmark = pytest.mark.django_db(transaction=True)

UNKNOWN_CODE = "rides_cancelled_captain"


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


@pytest.fixture(autouse=True)
def expo_fake_provider() -> Iterator[None]:
    with override_settings(MOBILE_PUSH_PROVIDER="fake", MOBILE_PUSH_ALLOW_FAKE=True):
        yield


def _pending_intent(
    *, user: User, template_code: str, context: dict[str, object]
) -> NotificationIntent:
    return NotificationIntent.objects.create(
        recipient=user,
        purpose="partner.test",
        channel=NotificationIntent.Channel.PUSH,
        audience=NotificationIntent.Audience.PARTNER,
        template_code=template_code,
        context=context,
    )


def test_an_unknown_template_is_failed_once_and_logged_once(
    caplog: pytest.LogCaptureFixture,
) -> None:
    intent = _pending_intent(
        user=_user_from_bearer(), template_code=UNKNOWN_CODE, context={"ride_id": "secret-context"}
    )

    with caplog.at_level(logging.WARNING, logger="apps.mobile.services"):
        deliver_push_intent(intent_id=intent.id)
        deliver_push_intent(intent_id=intent.id)

    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.FAILED
    assert intent.attempts == 1
    delivery = NotificationDelivery.objects.get(intent=intent)
    assert delivery.failure_code == "unknown_template"
    assert not PushTicket.objects.filter(intent=intent).exists()
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert UNKNOWN_CODE in warnings[0]
    assert "secret-context" not in warnings[0]


def test_the_sweep_goes_on_past_an_unknown_template(monkeypatch: pytest.MonkeyPatch) -> None:
    user = _user_from_bearer()
    # No send on creation: both intents wait, as they do when the worker missed them.
    monkeypatch.setattr(signals, "deliver_push_intent", SimpleNamespace(delay=lambda _id: None))
    unknown = _pending_intent(user=user, template_code=UNKNOWN_CODE, context={})
    known = _pending_intent(
        user=user,
        template_code="partner_offer_created",
        context={"offer_id": "11111111-1111-1111-1111-111111111111"},
    )

    assert sweep_pending_push_intents() == 2

    unknown.refresh_from_db()
    known.refresh_from_db()
    assert unknown.status == NotificationIntent.Status.FAILED
    assert known.status == NotificationIntent.Status.SENT
    assert PushTicket.objects.filter(intent=known).count() == 1
