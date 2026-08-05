"""A killed worker must leave the system in a state the sweep can finish.

These run against the Redis and PostgreSQL in infra/compose.yaml with a worker in a real
subprocess. Nothing here is eager, and nothing here is mocked.
"""

import subprocess
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path

import pytest
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.foundation.recovery import claim_recoverable_events
from apps.foundation.tasks import dispatch_outbox_event, recover_outbox_events
from tests.integration.conftest import await_condition

pytestmark = [pytest.mark.integration, pytest.mark.django_db(transaction=True)]

DELIVERY_TIMEOUT_SECONDS = 60
HANDLER_START_TIMEOUT_SECONDS = 60
ATTEMPTS_AFTER_RECOVERY = 2

WorkerFactory = Callable[[], subprocess.Popen[bytes]]


def _event(*, key: str, event_type: str, payload: dict[str, object] | None = None) -> OutboxEvent:
    return OutboxEvent.objects.create(
        aggregate_type="BookingGroup",
        aggregate_id="0f4d7f7a-1a0f-4f8e-9f1e-1c1b6a2c3d4e",
        event_type=event_type,
        idempotency_key=key,
        payload=payload or {},
    )


def _status_is(event: OutboxEvent, status: str) -> Callable[[], bool]:
    def predicate() -> bool:
        event.refresh_from_db()
        return bool(event.status == status)

    return predicate


def test_a_real_worker_delivers_a_real_queued_event(worker_factory: WorkerFactory) -> None:
    worker_factory()
    event = _event(key="integration-delivery", event_type="integration.noop")

    dispatch_outbox_event.delay(str(event.id))

    delivered = await_condition(
        _status_is(event, OutboxEvent.Status.PUBLISHED),
        timeout=DELIVERY_TIMEOUT_SECONDS,
    )
    assert delivered, f"event stayed {event.status} with last_error={event.last_error!r}"
    assert event.attempts == 1


def test_an_event_abandoned_by_a_killed_worker_is_recovered_and_completed(
    worker_factory: WorkerFactory,
    marker_dir: Path,
) -> None:
    marker = marker_dir / "handler-started"
    worker = worker_factory()
    event = _event(
        key="integration-killed",
        event_type="integration.slow",
        payload={"marker_path": str(marker)},
    )

    dispatch_outbox_event.delay(str(event.id))

    # The claim commits before the handler runs, so this row is visible from here while the
    # worker is still working. That visibility is the whole point of the three-phase split.
    assert await_condition(
        _status_is(event, OutboxEvent.Status.PROCESSING),
        timeout=HANDLER_START_TIMEOUT_SECONDS,
    ), "the worker never claimed the event"
    assert await_condition(
        marker.exists,
        timeout=HANDLER_START_TIMEOUT_SECONDS,
    ), "the handler never started"

    worker.kill()
    worker.wait(timeout=15)

    event.refresh_from_db()
    assert event.status == OutboxEvent.Status.PROCESSING, "a killed worker leaves the claim behind"
    assert event.published_at is None
    assert claim_recoverable_events(limit=10) == [], "a live lease must not be recovered early"

    # Let the lease lapse the way wall-clock time would, then sweep.
    event.available_at = timezone.now() - timedelta(seconds=1)
    event.save(update_fields=("available_at",))
    assert claim_recoverable_events(limit=10) == [event.id]

    event.refresh_from_db()
    assert event.status == OutboxEvent.Status.PENDING, "recovery must hand the event back as due"


def test_a_recovered_event_reaches_a_correct_terminal_state_on_a_new_worker(
    worker_factory: WorkerFactory,
) -> None:
    worker = worker_factory()
    event = _event(key="integration-terminal", event_type="integration.noop")

    # Simulate the wreckage of a crash: claimed, attempt spent, lease already lapsed.
    OutboxEvent.objects.filter(pk=event.id).update(
        status=OutboxEvent.Status.PROCESSING,
        attempts=1,
        available_at=timezone.now() - timedelta(seconds=1),
    )
    worker.kill()
    worker.wait(timeout=15)

    worker_factory()

    assert recover_outbox_events() == 1

    delivered = await_condition(
        _status_is(event, OutboxEvent.Status.PUBLISHED),
        timeout=DELIVERY_TIMEOUT_SECONDS,
    )
    assert delivered, f"event stayed {event.status} with last_error={event.last_error!r}"
    assert event.attempts == ATTEMPTS_AFTER_RECOVERY, "recovery spends a second attempt"
