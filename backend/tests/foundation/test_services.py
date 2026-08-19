from typing import Any
from uuid import uuid4

import pytest

from apps.foundation.exceptions import IdempotencyKeyReuseError
from apps.foundation.models import OutboxEvent
from apps.foundation.services import enqueue_outbox_event, execute_idempotent

pytestmark = pytest.mark.django_db(transaction=True)
CREATED_STATUS = 201


def test_idempotent_command_replays_its_original_result() -> None:
    calls = 0

    def command() -> tuple[int, dict[str, object]]:
        nonlocal calls
        calls += 1
        return CREATED_STATUS, {"booking_id": "book_123"}

    first = execute_idempotent(
        actor=None,
        operation="checkout.create",
        key="request-123",
        request_payload={"variant_id": "variant-123", "quantity": 2},
        command=command,
    )
    replay = execute_idempotent(
        actor=None,
        operation="checkout.create",
        key="request-123",
        request_payload={"quantity": 2, "variant_id": "variant-123"},
        command=command,
    )

    assert first.status_code == CREATED_STATUS
    assert first.replayed is False
    assert replay.status_code == CREATED_STATUS
    assert replay.body == {"booking_id": "book_123"}
    assert replay.replayed is True
    assert calls == 1


def test_idempotency_key_cannot_be_reused_for_a_different_request() -> None:
    execute_idempotent(
        actor=None,
        operation="checkout.create",
        key="request-123",
        request_payload={"quantity": 1},
        command=lambda: (CREATED_STATUS, {"booking_id": "book_123"}),
    )

    with pytest.raises(IdempotencyKeyReuseError):
        execute_idempotent(
            actor=None,
            operation="checkout.create",
            key="request-123",
            request_payload={"quantity": 2},
            command=lambda: (CREATED_STATUS, {"booking_id": "book_456"}),
        )


def test_outbox_event_is_idempotent_and_queued_only_after_commit(
    django_capture_on_commit_callbacks: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queued: list[str] = []

    def queue(event_id: str) -> None:
        queued.append(event_id)

    monkeypatch.setattr("apps.foundation.services.dispatch_outbox_event.delay", queue)

    with django_capture_on_commit_callbacks(execute=True):
        first = enqueue_outbox_event(
            aggregate_type="checkout",
            aggregate_id=uuid4(),
            event_type="checkout.search_started",
            idempotency_key="checkout-123:search-started",
            payload={"checkout_id": "checkout-123"},
        )
    with django_capture_on_commit_callbacks(execute=True):
        second = enqueue_outbox_event(
            aggregate_type="checkout",
            aggregate_id=first.aggregate_id,
            event_type="checkout.search_started",
            idempotency_key="checkout-123:search-started",
            payload={"checkout_id": "checkout-123"},
        )

    assert first.id == second.id
    assert OutboxEvent.objects.count() == 1
    assert queued == [str(first.id)]


def test_outbox_broker_failure_does_not_break_committed_command(
    django_capture_on_commit_callbacks: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable(_event_id: str) -> None:
        raise OSError("broker unavailable")

    monkeypatch.setattr("apps.foundation.services.dispatch_outbox_event.delay", unavailable)

    with django_capture_on_commit_callbacks(execute=True):
        event = enqueue_outbox_event(
            aggregate_type="payment_attempt",
            aggregate_id=uuid4(),
            event_type="m2.visit_plan.charged",
            idempotency_key="visit-plan-charged:broker-down",
            payload={"requirement_id": str(uuid4())},
        )

    event.refresh_from_db()
    assert event.status == OutboxEvent.Status.PENDING
    assert event.attempts == 0
    assert event.published_at is None
