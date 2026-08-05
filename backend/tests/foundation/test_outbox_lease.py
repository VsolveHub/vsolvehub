"""A claimed outbox event carries a deadline, and its failures actually persist."""

from collections.abc import Iterator
from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone

from apps.foundation import tasks as foundation_tasks
from apps.foundation.models import OutboxEvent
from apps.foundation.recovery import retry_delay_seconds
from apps.foundation.tasks import dispatch_outbox_event, register_outbox_handler

pytestmark = pytest.mark.django_db

CLOCK_TOLERANCE_SECONDS = 5


@pytest.fixture(autouse=True)
def restore_handler_registry() -> Iterator[None]:
    """Registration mutates a module-global dict and raises on a duplicate event type.

    Without this, a test that registers a handler leaks it into every later test in the
    session, and re-registering the same type fails with a confusing RuntimeError.
    """
    original = dict(foundation_tasks._handlers)
    try:
        yield
    finally:
        foundation_tasks._handlers.clear()
        foundation_tasks._handlers.update(original)


def _event(**overrides: object) -> OutboxEvent:
    values: dict[str, object] = {
        "aggregate_type": "BookingGroup",
        "aggregate_id": "0f4d7f7a-1a0f-4f8e-9f1e-1c1b6a2c3d4e",
        "event_type": "test.lease.claimed",
        "idempotency_key": "lease-1",
        "payload": {},
    }
    values.update(overrides)
    return OutboxEvent.objects.create(**values)


def test_claiming_an_event_pushes_its_visibility_deadline_forward() -> None:
    event = _event(event_type="test.lease.claimed", idempotency_key="lease-claimed")

    @register_outbox_handler(event_type="test.lease.claimed")
    def _handler(_event: OutboxEvent) -> None:
        return None

    before = timezone.now()
    dispatch_outbox_event(str(event.id))

    event.refresh_from_db()
    assert event.status == OutboxEvent.Status.PUBLISHED
    assert event.attempts == 1
    assert event.available_at >= before + timedelta(
        seconds=settings.OUTBOX_LEASE_SECONDS - CLOCK_TOLERANCE_SECONDS
    )


def test_a_failing_handler_persists_the_failure_and_backs_off() -> None:
    event = _event(event_type="test.lease.failing", idempotency_key="lease-failing")

    @register_outbox_handler(event_type="test.lease.failing")
    def _handler(_event: OutboxEvent) -> None:
        raise RuntimeError("handler exploded")

    before = timezone.now()
    with pytest.raises(RuntimeError):
        dispatch_outbox_event(str(event.id))

    event.refresh_from_db()
    assert event.status == OutboxEvent.Status.FAILED
    assert event.attempts == 1
    assert event.last_error == "handler exploded"
    assert event.available_at >= before + timedelta(
        seconds=retry_delay_seconds(1) - CLOCK_TOLERANCE_SECONDS
    )


def test_an_event_with_no_handler_consumes_an_attempt() -> None:
    event = _event(event_type="test.lease.unhandled", idempotency_key="lease-unhandled")

    with pytest.raises(RuntimeError):
        dispatch_outbox_event(str(event.id))

    event.refresh_from_db()
    assert event.status == OutboxEvent.Status.FAILED
    assert event.attempts == 1, "an unhandled event must not be re-driven forever"
    assert event.last_error == "No handler registered."


def test_an_event_held_under_a_live_lease_is_not_delivered_twice() -> None:
    calls: list[str] = []
    event = _event(
        event_type="test.lease.inflight",
        idempotency_key="lease-inflight",
        status=OutboxEvent.Status.PROCESSING,
        attempts=1,
        available_at=timezone.now() + timedelta(seconds=settings.OUTBOX_LEASE_SECONDS),
    )

    @register_outbox_handler(event_type="test.lease.inflight")
    def _handler(_event: OutboxEvent) -> None:
        calls.append("ran")

    dispatch_outbox_event(str(event.id))

    assert calls == [], "a duplicate queue entry must not run the handler concurrently"
    event.refresh_from_db()
    assert event.attempts == 1


def test_a_published_event_is_never_delivered_again() -> None:
    calls: list[str] = []
    event = _event(event_type="test.lease.published", idempotency_key="lease-published")
    event.status = OutboxEvent.Status.PUBLISHED
    event.published_at = timezone.now()
    event.save(update_fields=("status", "published_at"))

    @register_outbox_handler(event_type="test.lease.published")
    def _handler(_event: OutboxEvent) -> None:
        calls.append("ran")

    dispatch_outbox_event(str(event.id))

    assert calls == []


def test_retry_delay_grows_and_is_bounded() -> None:
    assert retry_delay_seconds(1) == settings.OUTBOX_RETRY_BACKOFF_SECONDS
    assert retry_delay_seconds(2) == settings.OUTBOX_RETRY_BACKOFF_SECONDS * 2
    assert retry_delay_seconds(50) == settings.OUTBOX_RETRY_BACKOFF_MAX_SECONDS
