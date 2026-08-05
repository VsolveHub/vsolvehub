"""Operations can see stuck events and replay exactly one of them."""

from datetime import timedelta
from io import StringIO

import pytest
from django.conf import settings
from django.core.management import CommandError, call_command
from django.utils import timezone

from apps.foundation.models import OutboxEvent

pytestmark = pytest.mark.django_db


def _event(*, key: str, status: str, attempts: int = 0) -> OutboxEvent:
    return OutboxEvent.objects.create(
        aggregate_type="BookingGroup",
        aggregate_id="0f4d7f7a-1a0f-4f8e-9f1e-1c1b6a2c3d4e",
        event_type="test.commands",
        idempotency_key=key,
        payload={},
        status=status,
        attempts=attempts,
        available_at=timezone.now() - timedelta(seconds=1),
    )


def test_report_counts_each_status_and_names_dead_letters() -> None:
    _event(key="pending", status=OutboxEvent.Status.PENDING)
    dead = _event(
        key="dead",
        status=OutboxEvent.Status.FAILED,
        attempts=settings.OUTBOX_MAX_ATTEMPTS,
    )

    out = StringIO()
    call_command("outbox_report", stdout=out)
    output = out.getvalue()

    assert "PENDING: 1" in output
    assert "FAILED: 1" in output
    assert "Events due for recovery now: 1" in output
    assert str(dead.id) in output


def test_replay_resets_one_dead_letter_for_the_next_sweep() -> None:
    dead = _event(
        key="replayable",
        status=OutboxEvent.Status.FAILED,
        attempts=settings.OUTBOX_MAX_ATTEMPTS,
    )

    out = StringIO()
    call_command("outbox_replay", "--event-id", str(dead.id), stdout=out)

    dead.refresh_from_db()
    assert dead.attempts == 0
    assert dead.status == OutboxEvent.Status.PENDING
    assert dead.available_at <= timezone.now()


def test_replay_refuses_an_already_published_event() -> None:
    event = _event(key="published", status=OutboxEvent.Status.PUBLISHED)
    event.published_at = timezone.now()
    event.save(update_fields=("published_at",))

    with pytest.raises(CommandError, match="already published"):
        call_command("outbox_replay", "--event-id", str(event.id))


def test_replay_refuses_an_unknown_event() -> None:
    with pytest.raises(CommandError, match="No outbox event"):
        call_command("outbox_replay", "--event-id", "0f4d7f7a-0000-4000-8000-1c1b6a2c3d4e")


def test_replay_refuses_a_malformed_identifier() -> None:
    with pytest.raises(CommandError, match="not a valid UUID"):
        call_command("outbox_replay", "--event-id", "not-a-uuid")
