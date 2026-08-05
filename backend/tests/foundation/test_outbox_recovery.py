"""The sweep re-drives abandoned events and refuses to re-drive live or exhausted ones."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.conf import settings
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.foundation.recovery import claim_recoverable_events, dead_letter_events
from apps.foundation.tasks import recover_outbox_events

pytestmark = pytest.mark.django_db

BATCH_LIMIT = 3
DUE_EVENT_COUNT = 5
SWEEPABLE_EVENT_COUNT = 2


def _event(
    *,
    key: str,
    status: str,
    available_at: object,
    attempts: int = 0,
) -> OutboxEvent:
    return OutboxEvent.objects.create(
        aggregate_type="BookingGroup",
        aggregate_id="0f4d7f7a-1a0f-4f8e-9f1e-1c1b6a2c3d4e",
        event_type="test.recovery",
        idempotency_key=key,
        payload={},
        status=status,
        attempts=attempts,
        available_at=available_at,
    )


def test_an_abandoned_processing_event_is_claimed_and_reset_to_pending() -> None:
    past = timezone.now() - timedelta(seconds=1)
    event = _event(key="abandoned", status=OutboxEvent.Status.PROCESSING, available_at=past)

    claimed = claim_recoverable_events(limit=10)

    assert claimed == [event.id]
    event.refresh_from_db()
    assert event.status == OutboxEvent.Status.PENDING
    assert event.available_at > timezone.now()


def test_a_live_lease_is_not_claimed() -> None:
    future = timezone.now() + timedelta(seconds=settings.OUTBOX_LEASE_SECONDS)
    _event(key="live", status=OutboxEvent.Status.PROCESSING, available_at=future)

    assert claim_recoverable_events(limit=10) == []


def test_a_published_event_is_never_claimed() -> None:
    past = timezone.now() - timedelta(seconds=1)
    event = _event(key="published", status=OutboxEvent.Status.PUBLISHED, available_at=past)
    event.published_at = timezone.now()
    event.save(update_fields=("published_at",))

    assert claim_recoverable_events(limit=10) == []


def test_an_exhausted_event_becomes_a_dead_letter_instead_of_a_claim() -> None:
    past = timezone.now() - timedelta(seconds=1)
    event = _event(
        key="exhausted",
        status=OutboxEvent.Status.FAILED,
        available_at=past,
        attempts=settings.OUTBOX_MAX_ATTEMPTS,
    )

    assert claim_recoverable_events(limit=10) == []
    assert list(dead_letter_events().values_list("id", flat=True)) == [event.id]


def test_a_pending_event_the_broker_never_received_is_claimed() -> None:
    # transaction.on_commit fired but .delay() raised because the broker was down, so the row
    # is still PENDING with its creation-time deadline already in the past.
    past = timezone.now() - timedelta(seconds=1)
    event = _event(key="never-queued", status=OutboxEvent.Status.PENDING, available_at=past)

    assert claim_recoverable_events(limit=10) == [event.id]


def test_a_failed_event_still_inside_its_backoff_is_not_claimed() -> None:
    future = timezone.now() + timedelta(seconds=settings.OUTBOX_RETRY_BACKOFF_SECONDS)
    _event(key="backing-off", status=OutboxEvent.Status.FAILED, available_at=future, attempts=1)

    assert claim_recoverable_events(limit=10) == []


def test_the_sweep_requeues_every_event_it_claims() -> None:
    past = timezone.now() - timedelta(seconds=1)
    first = _event(key="sweep-1", status=OutboxEvent.Status.FAILED, available_at=past)
    second = _event(key="sweep-2", status=OutboxEvent.Status.PROCESSING, available_at=past)

    with patch("apps.foundation.tasks.dispatch_outbox_event.delay") as delay:
        assert recover_outbox_events() == SWEEPABLE_EVENT_COUNT

    requeued = {call.args[0] for call in delay.call_args_list}
    assert requeued == {str(first.id), str(second.id)}


def test_the_batch_size_bounds_one_sweep() -> None:
    past = timezone.now() - timedelta(seconds=1)
    for index in range(DUE_EVENT_COUNT):
        _event(key=f"batch-{index}", status=OutboxEvent.Status.FAILED, available_at=past)

    assert len(claim_recoverable_events(limit=BATCH_LIMIT)) == BATCH_LIMIT
