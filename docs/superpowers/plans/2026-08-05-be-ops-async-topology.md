# BE-OPS Asynchronous Topology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make asynchronous work in this backend survive a worker crash, a broker outage and a
poison event, and prove it against real Redis with a real worker instead of `CELERY_TASK_ALWAYS_EAGER`.

**Architecture:** `OutboxEvent.available_at` becomes a visibility deadline (an SQS-style lease)
instead of a write-once creation stamp. Claiming an event pushes the deadline forward; a periodic
sweep re-drives every event whose deadline has passed and which never reached `PUBLISHED`. This
needs no migration — `available_at` already exists and is already indexed jointly with `status`,
and nothing in the codebase reads it today. A separate `config.settings.integration` module and a
`tests/integration/` suite run against the real broker with a subprocess worker that the tests can
kill.

**Tech Stack:** Django 5 / DRF, Celery on Redis, PostgreSQL 17, pytest + pytest-django, ruff, strict
mypy. Local infrastructure is `infra/compose.yaml` (PostgreSQL on 15432, Redis on 56379).

## Global Constraints

- Django owns pricing, authorization, assignment, payment and workflow. This task adds no HTTP
  surface and **must not change `contracts/openapi/v1.yaml`**. If `manage.py spectacular` output
  moves, something is wrong — stop.
- No new migration. Every field used here already exists in `apps/foundation/migrations/0001_initial.py`.
- Line length 100. `ruff format` + `ruff check` + `mypy --strict apps common config` must stay clean.
- Branch coverage gate is `fail_under = 85` in `backend/pyproject.toml`. Current actual: 86.48%.
- The default `pytest` run must remain runnable with **no Redis** present. Integration tests are
  opt-in via the `integration` marker, which is already declared in `pyproject.toml` and currently
  unused by any test.
- FE-10 landed as `56ecc22` and the contract is at 1.14.0. Confine `base.py` edits to the Celery
  block near line 288 and leave `SPECTACULAR_SETTINGS` alone.
- Stage only BE-OPS paths when committing. FE-14 work is live in the same working tree.
- No `print` (ruff `T20`). Use the `logging` module or `self.stdout.write` in management commands.

---

### Task 1: Outbox lease — claiming an event moves its visibility deadline

**The whole of `dispatch_outbox_event` runs inside one `transaction.atomic()` block, and both
failure paths write their bookkeeping and then re-raise.** The raise propagates out of the atomic
block, so PostgreSQL rolls those writes back. Verified by probe on 2026-08-05:

```
failing handler -> status=PENDING attempts=0 last_error=''   (expected FAILED / 1 / "boom")
no handler      -> status=PENDING attempts=0 last_error=''   (expected FAILED / 1 / "No handler…")
```

Three consequences, all live in production today:

1. `attempts` only ever counts *successful* deliveries, so it is 0 or 1 and can never support a cap.
2. `last_error` is always empty — an operator investigating a stuck event has no diagnostic at all.
3. After Celery exhausts its eight in-process retries the row sits at `PENDING` with its
   creation-time `available_at`, and nothing re-drives it.

So this task splits delivery into three phases, each committing independently: claim, handle,
record-failure. The claim commits before the handler runs, which is also what makes `PROCESSING`
observable from another connection — Task 4's crash test depends on that.

**Files:**
- Create: `backend/apps/foundation/recovery.py`
- Modify: `backend/apps/foundation/tasks.py:30-63`
- Modify: `backend/config/settings/base.py` (Celery block, near line 288)
- Test: `backend/tests/foundation/test_outbox_lease.py`

**Interfaces:**
- Consumes: `apps.foundation.models.OutboxEvent`, `django.conf.settings`.
- Produces:
  - `apps.foundation.recovery.retry_delay_seconds(attempts: int) -> int`
  - `apps.foundation.recovery.RECOVERABLE_STATUSES: tuple[str, ...]`
  - Settings `OUTBOX_LEASE_SECONDS`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RETRY_BACKOFF_SECONDS`,
    `OUTBOX_RETRY_BACKOFF_MAX_SECONDS`, `OUTBOX_RECOVERY_BATCH_SIZE`.
  - `recovery.py` must never import `tasks.py`. The dependency runs one way: `tasks.py` imports
    `recovery.py`. Task 2 relies on this.

- [x] **Step 1: Write the failing test**

Create `backend/tests/foundation/test_outbox_lease.py`:

```python
"""A claimed outbox event carries a deadline; an abandoned one becomes visible again."""

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


@pytest.fixture(autouse=True)
def restore_handler_registry() -> Iterator[None]:
    """`_handlers` is module-global and registration raises on a duplicate event type.

    Without this, a test that registers a handler leaks it into every later test in the
    session, and a second registration of the same type fails with a confusing RuntimeError.
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
    assert event.available_at >= before + timedelta(seconds=settings.OUTBOX_LEASE_SECONDS - 5)


def test_a_failing_handler_schedules_the_next_attempt_with_backoff() -> None:
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
    assert event.available_at >= before + timedelta(seconds=retry_delay_seconds(1) - 5)


def test_an_event_with_no_handler_consumes_an_attempt() -> None:
    event = _event(event_type="test.lease.unhandled", idempotency_key="lease-unhandled")

    with pytest.raises(RuntimeError):
        dispatch_outbox_event(str(event.id))

    event.refresh_from_db()
    assert event.status == OutboxEvent.Status.FAILED
    assert event.attempts == 1, "an unhandled event must not be re-driven forever"


def test_retry_delay_grows_and_is_bounded() -> None:
    assert retry_delay_seconds(1) == settings.OUTBOX_RETRY_BACKOFF_SECONDS
    assert retry_delay_seconds(2) == settings.OUTBOX_RETRY_BACKOFF_SECONDS * 2
    assert retry_delay_seconds(50) == settings.OUTBOX_RETRY_BACKOFF_MAX_SECONDS
```

- [x] **Step 2: Run test to verify it fails**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/foundation/test_outbox_lease.py -v --no-cov
```

Expected: FAIL — `ModuleNotFoundError: No module named 'apps.foundation.recovery'`.

- [x] **Step 3: Add the settings**

In `backend/config/settings/base.py`, immediately after the
`CELERY_TASK_SOFT_TIME_LIMIT = ...` line and before `CELERY_BEAT_SCHEDULE`:

```python
# `OutboxEvent.available_at` is a visibility deadline, not a creation stamp. A worker that
# claims an event pushes the deadline out by the lease; a worker that dies without publishing
# lets the deadline lapse, and the recovery sweep re-drives the event. The lease must exceed
# CELERY_TASK_TIME_LIMIT, otherwise the sweep re-queues work that is still legitimately running.
OUTBOX_LEASE_SECONDS = env.int("OUTBOX_LEASE_SECONDS", default=120)
OUTBOX_MAX_ATTEMPTS = env.int("OUTBOX_MAX_ATTEMPTS", default=10)
OUTBOX_RETRY_BACKOFF_SECONDS = env.int("OUTBOX_RETRY_BACKOFF_SECONDS", default=30)
OUTBOX_RETRY_BACKOFF_MAX_SECONDS = env.int("OUTBOX_RETRY_BACKOFF_MAX_SECONDS", default=900)
OUTBOX_RECOVERY_BATCH_SIZE = env.int("OUTBOX_RECOVERY_BATCH_SIZE", default=200)
```

- [x] **Step 4: Create `recovery.py` with the backoff helper**

Create `backend/apps/foundation/recovery.py`:

```python
"""Re-drive outbox events that a worker crash or a broker outage left behind.

This module must not import `apps.foundation.tasks`. The dependency runs one way — tasks
import recovery — so that the Celery task definition can use these helpers without a cycle.
"""

from datetime import datetime, timedelta
from uuid import UUID

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from apps.foundation.models import OutboxEvent

RECOVERABLE_STATUSES: tuple[str, ...] = (
    OutboxEvent.Status.PENDING,
    OutboxEvent.Status.PROCESSING,
    OutboxEvent.Status.FAILED,
)


def retry_delay_seconds(attempts: int) -> int:
    """Exponential backoff for the next attempt, bounded by the configured ceiling."""
    exponent = max(attempts - 1, 0)
    delay = settings.OUTBOX_RETRY_BACKOFF_SECONDS * (2**exponent)
    return int(min(delay, settings.OUTBOX_RETRY_BACKOFF_MAX_SECONDS))


def lease_deadline() -> datetime:
    """The moment an in-flight event becomes eligible for recovery again."""
    return timezone.now() + timedelta(seconds=settings.OUTBOX_LEASE_SECONDS)
```

- [x] **Step 5: Split delivery into three independently committed phases**

Replace `backend/apps/foundation/tasks.py:37-63` (the body of `dispatch_outbox_event`) with:

```python
def dispatch_outbox_event(_self: object, event_id: str) -> None:
    """Deliver at-least-once; consumers receive the stable event UUID for deduplication.

    Three phases, each in its own committed transaction:

      1. Claim  — mark PROCESSING, spend an attempt, take a lease. This commits before the
         handler runs, so another connection can see the event is in flight and the recovery
         sweep can tell "working" from "abandoned". Nothing raises inside this transaction.
      2. Handle — the handler's domain writes and the PUBLISHED mark commit together, so a
         published event's side effects can never be lost.
      3. Record — a failure is written in a fresh transaction, after the handler's transaction
         has already rolled back. Writing it inside the handler's transaction and then
         re-raising is the defect this replaces.
    """
    key = UUID(event_id)
    claimed = _claim_for_delivery(key)
    if claimed is None:
        return
    event, handler = claimed

    if handler is None:
        # A missing handler is a code defect, not a transient fault. The attempt is already
        # spent by the claim, so an undeployed handler exhausts the budget instead of being
        # re-queued by every sweep tick forever.
        _record_delivery_failure(key, attempts=event.attempts, error="No handler registered.")
        raise RuntimeError(f"No outbox handler registered for {event.event_type}.")

    try:
        with transaction.atomic():
            handler(event)
            OutboxEvent.objects.filter(pk=key).update(
                status=OutboxEvent.Status.PUBLISHED,
                published_at=timezone.now(),
                last_error="",
            )
    except Exception as exc:
        _record_delivery_failure(key, attempts=event.attempts, error=str(exc))
        logger.exception("Outbox delivery failed", extra={"outbox_event_id": event_id})
        raise


def _claim_for_delivery(key: UUID) -> tuple[OutboxEvent, OutboxHandler | None] | None:
    """Take the event for delivery, or return None when there is nothing to do.

    Returns `(event, None)` when the event is claimable but no handler is registered, so the
    caller can record that failure outside this transaction.
    """
    with transaction.atomic():
        event = OutboxEvent.objects.select_for_update().get(pk=key)
        if event.published_at is not None:
            return None
        if event.status == OutboxEvent.Status.PROCESSING and event.available_at > timezone.now():
            # Another worker holds a live lease. Duplicate queue entries are normal under
            # at-least-once delivery; two workers running one handler concurrently is not.
            logger.info("Outbox event %s is already in flight", key)
            return None

        event.status = OutboxEvent.Status.PROCESSING
        event.attempts += 1
        event.available_at = lease_deadline()
        event.save(update_fields=("status", "attempts", "available_at"))
        return event, _handlers.get(event.event_type)


def _record_delivery_failure(key: UUID, *, attempts: int, error: str) -> None:
    """Persist why delivery failed and when it may be retried, in its own transaction."""
    with transaction.atomic():
        OutboxEvent.objects.filter(pk=key).update(
            status=OutboxEvent.Status.FAILED,
            last_error=error[:500],
            available_at=timezone.now() + timedelta(seconds=retry_delay_seconds(attempts)),
        )
```

- [x] **Step 6: Run the test to verify it passes**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/foundation/test_outbox_lease.py -v --no-cov
```

Expected: 4 passed.

- [x] **Step 7: Run the existing outbox regressions**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/foundation tests/assignments/test_group_dispatch.py -q --no-cov
```

Expected: all pass. `test_group_dispatch.py:70` asserts `status=PUBLISHED` and must be unaffected.

- [x] **Step 8: Commit**

```bash
git add backend/apps/foundation/recovery.py backend/apps/foundation/tasks.py backend/config/settings/base.py backend/tests/foundation/test_outbox_lease.py
git commit -m "feat(foundation): give outbox events a visibility deadline"
```

---

### Task 2: The recovery sweep

A periodic task that finds events whose deadline lapsed and re-queues them. `skip_locked` is what
keeps two beat ticks, or two workers, from driving the same event twice.

**Files:**
- Modify: `backend/apps/foundation/recovery.py`
- Modify: `backend/apps/foundation/tasks.py`
- Modify: `backend/config/settings/base.py` (`CELERY_BEAT_SCHEDULE`)
- Test: `backend/tests/foundation/test_outbox_recovery.py`

**Interfaces:**
- Consumes: `retry_delay_seconds`, `RECOVERABLE_STATUSES`, `lease_deadline` from Task 1.
- Produces:
  - `apps.foundation.recovery.claim_recoverable_events(*, limit: int) -> list[UUID]`
  - `apps.foundation.recovery.dead_letter_events() -> QuerySet[OutboxEvent]`
  - `apps.foundation.tasks.recover_outbox_events() -> int` (Celery task, used by Task 4 and 6)

- [x] **Step 1: Write the failing test**

Create `backend/tests/foundation/test_outbox_recovery.py`:

```python
"""The sweep re-drives abandoned events and refuses to re-drive live or exhausted ones."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.conf import settings
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.foundation.recovery import claim_recoverable_events, dead_letter_events
from apps.foundation.tasks import recover_outbox_events

pytestmark = pytest.mark.django_db(transaction=True)


def _event(*, key: str, status: str, available_at: object, attempts: int = 0) -> OutboxEvent:
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


def test_an_abandoned_processing_event_is_claimed() -> None:
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
    # transaction.on_commit fired but .delay() raised because the broker was down, so the
    # row is still PENDING with its creation-time deadline already in the past.
    past = timezone.now() - timedelta(seconds=1)
    event = _event(key="never-queued", status=OutboxEvent.Status.PENDING, available_at=past)

    assert claim_recoverable_events(limit=10) == [event.id]


def test_the_sweep_requeues_every_event_it_claims() -> None:
    past = timezone.now() - timedelta(seconds=1)
    first = _event(key="sweep-1", status=OutboxEvent.Status.FAILED, available_at=past)
    second = _event(key="sweep-2", status=OutboxEvent.Status.PROCESSING, available_at=past)

    with patch("apps.foundation.tasks.dispatch_outbox_event.delay") as delay:
        assert recover_outbox_events() == 2

    requeued = {call.args[0] for call in delay.call_args_list}
    assert requeued == {str(first.id), str(second.id)}


def test_the_batch_size_bounds_one_sweep() -> None:
    past = timezone.now() - timedelta(seconds=1)
    for index in range(5):
        _event(key=f"batch-{index}", status=OutboxEvent.Status.FAILED, available_at=past)

    assert len(claim_recoverable_events(limit=3)) == 3
```

- [x] **Step 2: Run test to verify it fails**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/foundation/test_outbox_recovery.py -v --no-cov
```

Expected: FAIL — `ImportError: cannot import name 'claim_recoverable_events'`.

- [x] **Step 3: Implement the claim**

Append to `backend/apps/foundation/recovery.py`:

```python
def claim_recoverable_events(*, limit: int) -> list[UUID]:
    """Take a batch of due events and push their visibility deadline forward.

    Moving `available_at` inside the same transaction that selects the row is what stops two
    beat ticks, or two workers, from re-queuing one event twice. `skip_locked` makes a
    concurrent sweep step over rows this one already holds rather than block behind them.
    """
    now = timezone.now()
    deadline = now + timedelta(seconds=settings.OUTBOX_LEASE_SECONDS)
    claimed: list[UUID] = []
    with transaction.atomic():
        events = list(
            OutboxEvent.objects.select_for_update(skip_locked=True)
            .filter(
                status__in=RECOVERABLE_STATUSES,
                published_at__isnull=True,
                available_at__lte=now,
                attempts__lt=settings.OUTBOX_MAX_ATTEMPTS,
            )
            .order_by("available_at")[:limit]
        )
        for event in events:
            # Reset to PENDING, not just re-lease. `_claim_for_delivery` refuses an event that
            # is PROCESSING with a live lease, so leaving the status alone would make the very
            # worker this sweep is about to wake decline the work.
            event.status = OutboxEvent.Status.PENDING
            event.available_at = deadline
            event.save(update_fields=("status", "available_at"))
            claimed.append(event.id)
    return claimed


def dead_letter_events() -> models.QuerySet[OutboxEvent]:
    """Events the sweep has given up on. Operations replays these deliberately, never in bulk."""
    return OutboxEvent.objects.filter(
        status__in=RECOVERABLE_STATUSES,
        published_at__isnull=True,
        attempts__gte=settings.OUTBOX_MAX_ATTEMPTS,
    ).order_by("created_at")
```

- [x] **Step 4: Implement the sweep task**

Append to `backend/apps/foundation/tasks.py`:

```python
@shared_task
def recover_outbox_events() -> int:
    """Re-drive every event a worker crash, broker outage or transient failure left behind."""
    event_ids = claim_recoverable_events(limit=settings.OUTBOX_RECOVERY_BATCH_SIZE)
    for event_id in event_ids:
        dispatch_outbox_event.delay(str(event_id))
    if event_ids:
        logger.info("Outbox recovery re-queued %d event(s)", len(event_ids))
    return len(event_ids)
```

Extend the `recovery` import in `tasks.py` and add the settings import:

```python
from django.conf import settings
from apps.foundation.recovery import claim_recoverable_events, lease_deadline, retry_delay_seconds
```

- [x] **Step 5: Schedule it**

In `backend/config/settings/base.py`, add to `CELERY_BEAT_SCHEDULE` as the **first** entry:

```python
    "recover-outbox-events": {
        "task": "apps.foundation.tasks.recover_outbox_events",
        "schedule": 30.0,
    },
```

- [x] **Step 6: Run the test to verify it passes**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/foundation/test_outbox_recovery.py -v --no-cov
```

Expected: 7 passed.

- [x] **Step 7: Commit**

```bash
git add backend/apps/foundation/recovery.py backend/apps/foundation/tasks.py backend/config/settings/base.py backend/tests/foundation/test_outbox_recovery.py
git commit -m "feat(foundation): add the outbox recovery sweep"
```

---

### Task 3: Operations visibility into stuck and dead events

The runbooks in Task 6 need something to tell an operator to run. Read-only reporting plus a
single-event replay that requires an explicit id — never a bulk "replay everything" button.

**Files:**
- Create: `backend/apps/foundation/management/__init__.py`
- Create: `backend/apps/foundation/management/commands/__init__.py`
- Create: `backend/apps/foundation/management/commands/outbox_report.py`
- Create: `backend/apps/foundation/management/commands/outbox_replay.py`
- Test: `backend/tests/foundation/test_outbox_commands.py`

**Interfaces:**
- Consumes: `dead_letter_events`, `RECOVERABLE_STATUSES` from Task 2.
- Produces: `manage.py outbox_report`, `manage.py outbox_replay --event-id <uuid>`.

- [x] **Step 1: Write the failing test**

Create `backend/tests/foundation/test_outbox_commands.py`:

```python
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
        call_command("outbox_replay", "--event-id", "0f4d7f7a-0000-0000-0000-1c1b6a2c3d4e")
```

- [x] **Step 2: Run test to verify it fails**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/foundation/test_outbox_commands.py -v --no-cov
```

Expected: FAIL — `CommandError: Unknown command: 'outbox_report'`.

- [x] **Step 3: Create the package files**

`backend/apps/foundation/management/__init__.py` and
`backend/apps/foundation/management/commands/__init__.py` are both empty files.

- [x] **Step 4: Implement `outbox_report`**

Create `backend/apps/foundation/management/commands/outbox_report.py`:

```python
"""Read-only outbox health summary for the queue-outage and stuck-command runbooks."""

from typing import Any

from django.core.management.base import BaseCommand
from django.db.models import Count

from apps.foundation.models import OutboxEvent
from apps.foundation.recovery import dead_letter_events


class Command(BaseCommand):
    help = "Summarise outbox event health and list events the sweep has given up on."

    def handle(self, *_args: Any, **_options: Any) -> None:
        counts = (
            OutboxEvent.objects.values("status").annotate(total=Count("id")).order_by("status")
        )
        self.stdout.write("Outbox event counts by status:")
        for row in counts:
            self.stdout.write(f"  {row['status']}: {row['total']}")

        dead = list(dead_letter_events()[:50])
        self.stdout.write(f"Dead-letter events (attempts exhausted): {len(dead)}")
        for event in dead:
            self.stdout.write(
                f"  {event.id} {event.event_type} attempts={event.attempts} "
                f"last_error={event.last_error[:120]!r}"
            )
```

- [x] **Step 5: Implement `outbox_replay`**

Create `backend/apps/foundation/management/commands/outbox_replay.py`:

```python
"""Return exactly one exhausted outbox event to the recovery sweep.

Deliberately single-event. A bulk replay after an incident re-drives poison events alongside
recoverable ones, and the poison ones are precisely the reason someone is reading a runbook.
"""

from argparse import ArgumentParser
from typing import Any
from uuid import UUID

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.foundation.models import OutboxEvent


class Command(BaseCommand):
    help = "Reset one outbox event's attempt budget so the recovery sweep re-drives it."

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument("--event-id", required=True, help="The OutboxEvent UUID to replay.")

    def handle(self, *_args: Any, **options: Any) -> None:
        raw_id = str(options["event_id"])
        try:
            event_id = UUID(raw_id)
        except ValueError as exc:
            raise CommandError(f"{raw_id!r} is not a valid UUID.") from exc

        event = OutboxEvent.objects.filter(pk=event_id).first()
        if event is None:
            raise CommandError(f"No outbox event with id {event_id}.")
        if event.published_at is not None:
            raise CommandError(f"Outbox event {event_id} is already published; nothing to replay.")

        event.status = OutboxEvent.Status.PENDING
        event.attempts = 0
        event.last_error = ""
        event.available_at = timezone.now()
        event.save(update_fields=("status", "attempts", "last_error", "available_at"))
        self.stdout.write(f"Outbox event {event_id} reset for the next recovery sweep.")
```

- [x] **Step 6: Run the test to verify it passes**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/foundation/test_outbox_commands.py -v --no-cov
```

Expected: 4 passed.

- [x] **Step 7: Commit**

```bash
git add backend/apps/foundation/management backend/tests/foundation/test_outbox_commands.py
git commit -m "feat(foundation): add outbox report and single-event replay commands"
```

---

### Task 4: Real Redis, a real worker, and a killed worker

Everything above is proven under `CELERY_TASK_ALWAYS_EAGER`, which executes tasks inline and has
never demonstrated anything about ordering, retries or crash recovery. This task adds an opt-in
suite that runs against the broker in `infra/compose.yaml` with a worker in a real subprocess.

**Files:**
- Create: `backend/config/settings/integration.py`
- Create: `backend/tests/integration/__init__.py`
- Create: `backend/tests/integration/conftest.py`
- Create: `backend/tests/integration/test_worker_recovery.py`
- Modify: `backend/pyproject.toml` (`addopts`)
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `recover_outbox_events`, `dispatch_outbox_event` from Tasks 1–2.
- Produces: pytest fixtures `celery_worker_process` and `integration_settings`; the
  `pytest -m integration` entry point used by Task 5's script.

- [x] **Step 1: Exclude the marker from the default run**

In `backend/pyproject.toml`, change `addopts` to:

```toml
addopts = [
  "--strict-config",
  "--strict-markers",
  "--cov=apps",
  "--cov=common",
  "--cov-report=term-missing",
  "-ra",
  "-m",
  "not integration",
]
```

Verify the default run is unchanged:

```bash
backend/.venv/Scripts/python.exe -m pytest -q
```

Expected: 218 passed (or 229 after Tasks 1–3), coverage still at or above 85%.

- [x] **Step 2: Write the integration settings**

Create `backend/config/settings/integration.py`:

```python
"""Settings for the real-Redis, real-worker integration suite.

Deliberately NOT derived from config.settings.test: the entire value of this suite is that
CELERY_TASK_ALWAYS_EAGER is off and a separate process does the work.
"""

from config.settings.base import *

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = False
CELERY_BROKER_URL = env(
    "CELERY_INTEGRATION_BROKER_URL",
    default="redis://127.0.0.1:56379/11",
)
CELERY_RESULT_BACKEND = env(
    "CELERY_INTEGRATION_RESULT_BACKEND",
    default="redis://127.0.0.1:56379/12",
)

OTP_PROVIDER = "development"
OTP_DEVELOPMENT_CODE_ENABLED = True
GEOCODING_PROVIDER = "unconfigured"
PAYMENT_PROVIDER = "fake"
PAYMENT_WEBHOOK_SECRET = SECRET_KEY
PAYMENT_LEGAL_ENTITY_CODE = "vsolve-integration"
PAYMENT_LIVE_COLLECTIONS_APPROVED = False

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
```

- [x] **Step 3: Write the worker fixture**

Create `backend/tests/integration/__init__.py` (empty) and
`backend/tests/integration/conftest.py`:

```python
"""A real Celery worker in a real subprocess, pointed at pytest-django's test database."""

import os
import signal
import subprocess
import sys
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
import redis
from django.conf import settings
from django.db import connection

BACKEND_DIR = Path(__file__).resolve().parents[2]
WORKER_BOOT_TIMEOUT_SECONDS = 30


def _test_database_url() -> str:
    """The URL of the database pytest-django created, not the developer's own database."""
    config = connection.settings_dict
    name = config["NAME"]
    return (
        f"postgresql://{config['USER']}:{config['PASSWORD']}"
        f"@{config['HOST']}:{config['PORT']}/{name}"
    )


@pytest.fixture(scope="session", autouse=True)
def require_redis() -> None:
    """Fail loudly rather than silently degrading to a suite that proves nothing."""
    try:
        redis.Redis.from_url(settings.CELERY_BROKER_URL).ping()
    except Exception as exc:  # noqa: BLE001 - any connection fault is the same answer here
        pytest.fail(
            "The integration suite requires the Redis in infra/compose.yaml. "
            f"Could not reach {settings.CELERY_BROKER_URL}: {exc}"
        )


@pytest.fixture
def celery_worker_process(db: None) -> Iterator[subprocess.Popen[bytes]]:
    """Start a worker bound to the test database, and always reap it."""
    environment = {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": "config.settings.integration",
        "DATABASE_URL": _test_database_url(),
    }
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "celery",
            "-A",
            "config",
            "worker",
            "--loglevel=info",
            "--concurrency=1",
            "--pool=solo",
        ],
        cwd=BACKEND_DIR,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    deadline = time.monotonic() + WORKER_BOOT_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if process.poll() is not None:
            output = process.stdout.read().decode() if process.stdout else ""
            pytest.fail(f"The Celery worker exited during boot:\n{output}")
        time.sleep(0.5)
        break
    try:
        yield process
    finally:
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
```

- [x] **Step 4: Write the crash-recovery test**

Create `backend/tests/integration/test_worker_recovery.py`:

```python
"""A killed worker must leave the system in a state the sweep can finish."""

import subprocess
import time
from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.foundation.recovery import claim_recoverable_events

pytestmark = [pytest.mark.integration, pytest.mark.django_db(transaction=True)]

DELIVERY_TIMEOUT_SECONDS = 30


def _await_status(event: OutboxEvent, status: str, *, timeout: int) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        event.refresh_from_db()
        if event.status == status:
            return True
        time.sleep(0.25)
    return False


def _event(*, key: str, event_type: str, **overrides: object) -> OutboxEvent:
    values: dict[str, object] = {
        "aggregate_type": "BookingGroup",
        "aggregate_id": "0f4d7f7a-1a0f-4f8e-9f1e-1c1b6a2c3d4e",
        "event_type": event_type,
        "idempotency_key": key,
        "payload": {},
    }
    values.update(overrides)
    return OutboxEvent.objects.create(**values)


def test_a_real_worker_delivers_a_real_queued_event(
    celery_worker_process: subprocess.Popen[bytes],
) -> None:
    from apps.foundation.tasks import dispatch_outbox_event

    event = _event(key="integration-delivery", event_type="booking_group.confirmed")
    dispatch_outbox_event.delay(str(event.id))

    assert _await_status(event, OutboxEvent.Status.PUBLISHED, timeout=DELIVERY_TIMEOUT_SECONDS), (
        f"event stayed {event.status} with last_error={event.last_error!r}"
    )


def test_an_event_abandoned_by_a_killed_worker_is_recovered(
    celery_worker_process: subprocess.Popen[bytes],
) -> None:
    # Simulate the exact wreckage a SIGKILL leaves: claimed, attempts spent, never published.
    event = _event(
        key="integration-abandoned",
        event_type="booking_group.confirmed",
        status=OutboxEvent.Status.PROCESSING,
        attempts=1,
        available_at=timezone.now() + timedelta(seconds=settings.OUTBOX_LEASE_SECONDS),
    )
    celery_worker_process.kill()
    celery_worker_process.wait(timeout=10)

    event.refresh_from_db()
    assert event.status == OutboxEvent.Status.PROCESSING
    assert claim_recoverable_events(limit=10) == [], "a live lease must not be recovered early"

    # Let the lease lapse the way wall-clock time would.
    event.available_at = timezone.now() - timedelta(seconds=1)
    event.save(update_fields=("available_at",))

    assert claim_recoverable_events(limit=10) == [event.id]
```

- [x] **Step 5: Run the integration suite**

Start infrastructure first:

```bash
docker compose -f infra/compose.yaml --env-file infra/.env.example up -d
```

Then:

```bash
backend/.venv/Scripts/python.exe -m pytest tests/integration -m integration -v --no-cov -p no:cacheprovider
```

Expected: 2 passed. If `redis` is not an installed dependency, add it to
`backend/requirements/dev.in`, recompile, and reinstall before rerunning.

- [x] **Step 6: Document the integration variables**

Append to `backend/.env.example`:

```
CELERY_INTEGRATION_BROKER_URL=redis://127.0.0.1:56379/11
CELERY_INTEGRATION_RESULT_BACKEND=redis://127.0.0.1:56379/12
OUTBOX_LEASE_SECONDS=120
OUTBOX_MAX_ATTEMPTS=10
OUTBOX_RETRY_BACKOFF_SECONDS=30
OUTBOX_RETRY_BACKOFF_MAX_SECONDS=900
OUTBOX_RECOVERY_BATCH_SIZE=200
```

- [x] **Step 7: Commit**

```bash
git add backend/config/settings/integration.py backend/tests/integration backend/pyproject.toml backend/.env.example
git commit -m "test(foundation): prove outbox recovery against real Redis and a real worker"
```

---

### Task 5: Runnable worker and beat topology

`scripts/` already establishes the `.ps1` + `.cmd` pair pattern with a `.venv` guard. Match it
exactly; do not invent a second launcher style.

**Files:**
- Create: `backend/scripts/worker.ps1`, `backend/scripts/worker.cmd`
- Create: `backend/scripts/beat.ps1`, `backend/scripts/beat.cmd`
- Create: `backend/scripts/integration-tests.ps1`, `backend/scripts/integration-tests.cmd`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: the `integration` marker from Task 4.
- Produces: `scripts\worker.cmd`, `scripts\beat.cmd`, `scripts\integration-tests.cmd`, referenced
  by the runbooks in Task 6.

- [x] **Step 1: Write `worker.ps1`**

Create `backend/scripts/worker.ps1`:

```powershell
$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "backend\.venv is missing. Run .\scripts\bootstrap.cmd first."
}

Push-Location $backendRoot
try {
    & $venvPython -m celery -A config worker --loglevel=info --concurrency=4 --pool=solo
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
```

- [x] **Step 2: Write `beat.ps1`**

Create `backend/scripts/beat.ps1`:

```powershell
$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "backend\.venv is missing. Run .\scripts\bootstrap.cmd first."
}

Push-Location $backendRoot
try {
    & $venvPython -m celery -A config beat --loglevel=info
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
```

- [x] **Step 3: Write `integration-tests.ps1`**

Create `backend/scripts/integration-tests.ps1`:

```powershell
$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "backend\.venv is missing. Run .\scripts\bootstrap.cmd first."
}

Push-Location $backendRoot
try {
    & $venvPython -m pytest tests/integration -m integration --no-cov -v
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
```

- [x] **Step 4: Write the three `.cmd` shims**

Each is the two-line pattern already used by `server.cmd`. `backend/scripts/worker.cmd`:

```bat
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0worker.ps1" %*
```

`backend/scripts/beat.cmd`:

```bat
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0beat.ps1" %*
```

`backend/scripts/integration-tests.cmd`:

```bat
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0integration-tests.ps1" %*
```

- [x] **Step 5: Verify beat loads the schedule**

```bash
backend/.venv/Scripts/python.exe -m celery -A config inspect registered --timeout 5 || true
backend/.venv/Scripts/python.exe -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.local'); django.setup(); from django.conf import settings; print(sorted(settings.CELERY_BEAT_SCHEDULE))"
```

Expected: the printed list contains `recover-outbox-events`.

- [x] **Step 6: Document the topology in `backend/README.md`**

Add a section describing: `scripts\worker.cmd` and `scripts\beat.cmd` as separate processes,
exactly one beat process per deployment (two schedulers double every periodic task), the
`OUTBOX_LEASE_SECONDS > CELERY_TASK_TIME_LIMIT` invariant, and
`scripts\integration-tests.cmd` requiring `infra/compose.yaml` to be up.

- [x] **Step 7: Commit**

```bash
git add backend/scripts backend/README.md
git commit -m "chore(backend): add runnable worker, beat and integration-test entry points"
```

---

### Task 6: Runbooks

Match the house style in `docs/runbooks/payment-reconciliation.md`: `# Title`, `## Scope`,
`## Required production configuration`, then flow, invariants and handling. Plain declarative
prose, no bullet-point padding.

**Files:**
- Create: `docs/runbooks/queue-outage.md`
- Create: `docs/runbooks/outbox-replay.md`
- Create: `docs/runbooks/stuck-command.md`
- Modify: `docs/runbooks/payment-reconciliation.md`

**Interfaces:**
- Consumes: the commands from Task 3 and the scripts from Task 5.
- Produces: nothing code-level.

- [x] **Step 1: Write `queue-outage.md`**

Cover: symptoms (outbox `PENDING` count climbing, beat logging connection errors); that the outbox
is the safety net because events commit with domain state and delivery is a separate concern; that
no manual database edits are permitted; recovery order (restore Redis, confirm with
`manage.py outbox_report`, let the 30-second sweep drain the backlog, watch the `PENDING` count
fall); and that a broker restart loses in-flight queue entries but **not** outbox rows, which is
the entire point of the pattern.

- [x] **Step 2: Write `outbox-replay.md`**

Cover: what a dead letter is (`attempts >= OUTBOX_MAX_ATTEMPTS`, never published); that
`manage.py outbox_replay --event-id <uuid>` handles exactly one event and there is deliberately no
bulk mode; that handlers are idempotent, so a replay of an event that partly succeeded is safe;
and that a dead letter caused by a missing handler is a deploy problem, not a replay problem —
replaying before the handler ships just burns the attempt budget again.

- [x] **Step 3: Write `stuck-command.md`**

Cover: `PROCESSING` with a future `available_at` means a worker is genuinely working; `PROCESSING`
with a past `available_at` means the sweep will re-drive it within 30 seconds and no human action
is needed; the diagnostic sequence (`manage.py outbox_report`, then
`celery -A config inspect active`); and that `OUTBOX_LEASE_SECONDS` must stay above
`CELERY_TASK_TIME_LIMIT` or the sweep will duplicate live work.

- [x] **Step 4: Correct the stale interval in the payment runbook**

`docs/runbooks/payment-reconciliation.md` states that `reconcile_payments` and `reconcile_refunds`
run "every two minutes". `CELERY_BEAT_SCHEDULE` actually runs them at 30 and 60 seconds. Change
the sentence to name the real intervals.

- [x] **Step 5: Commit**

```bash
git add docs/runbooks
git commit -m "docs(runbooks): add queue outage, outbox replay and stuck command procedures"
```

---

### Task 7: `docs/adr/`

The directory does not exist. Backfill the decisions that are already load-bearing, so BE-09 and
BE-10 inherit written rationale instead of re-deriving it from code.

**Files:**
- Create: `docs/adr/README.md`
- Create: `docs/adr/0001-booking-group-over-singleton-cart.md`
- Create: `docs/adr/0002-outbox-and-celery-own-dispatch.md`
- Create: `docs/adr/0003-allocation-based-money-model.md`
- Create: `docs/adr/0004-fail-closed-provider-selection.md`
- Create: `docs/adr/0005-server-clock-calibration.md`
- Create: `docs/adr/0006-outbox-visibility-deadline-recovery.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the ADR numbering convention BE-09/BE-10 continue from (next free number: 0007).

- [x] **Step 1: Write `README.md`**

State the format (Status / Context / Decision / Consequences), that ADRs are immutable once
Accepted and are superseded by a new ADR rather than edited, and that the number is allocated at
merge time.

- [x] **Step 2: Write ADRs 0001–0005 (backfill)**

Each uses this structure, with `Status: Accepted` and the date the decision actually landed:

```markdown
# N. Title

- Status: Accepted
- Date: YYYY-MM-DD

## Context

## Decision

## Consequences
```

Content anchors, one per ADR:

- **0001** — Proposal 0003's singleton cart could not express multi-service visits sharing one
  address and window. Superseded by Cart → PlanSet → Plan → Quote → BookingGroup → FulfilmentUnit.
  Consequence: every downstream command is unit-scoped, and group state is derived, never written.
- **0002** — Browser-driven dispatch stops when a tab closes. Events commit with domain state in
  `OutboxEvent`; Celery delivers after commit; handlers are idempotent and keyed by event UUID.
  Consequence: at-least-once delivery, so every consumer must deduplicate.
- **0003** — Money is allocated across immutable unit lines (`PaymentAllocation`,
  `RefundAllocation`) rather than held as a group total. Consequence: partial refunds and
  per-unit outcomes need no second money path, and BE-09 must not add one.
- **0004** — Provider adapters (`fake` vs `razorpay`, storage, OTP, geocoding) are selected
  explicitly and `config.settings.production` raises `ImproperlyConfigured` when a real provider
  is unconfigured. Consequence: no silent fallback to a development provider in production.
- **0005** — Countdowns calibrate against the response `Date` header, exposed through
  `CORS_EXPOSE_HEADERS`, because a device clock is not trustworthy for a deadline. Consequence:
  production startup fails if `Date` is not exposed.

- [x] **Step 3: Write ADR 0006 for this task's own decision**

Context: `PROCESSING` was terminal on worker death; `FAILED` was terminal after retry exhaustion;
`PENDING` was terminal if the broker was unreachable at `on_commit`. Decision: `available_at`
becomes a visibility deadline and a beat-scheduled sweep re-drives lapsed events with bounded
attempts. Consequences: `OUTBOX_LEASE_SECONDS` must exceed `CELERY_TASK_TIME_LIMIT`; exhausted
events become dead letters requiring deliberate single-event replay; handler idempotency is now
load-bearing, not merely advisable.

- [x] **Step 4: Commit**

```bash
git add docs/adr
git commit -m "docs(adr): create the decision record tree and backfill six decisions"
```

---

## Final gate

Run in `backend/`, and paste real output — do not summarise:

```bash
backend/.venv/Scripts/python.exe -m ruff format --check .
backend/.venv/Scripts/python.exe -m ruff check .
backend/.venv/Scripts/python.exe -m mypy apps common config
backend/.venv/Scripts/python.exe -m pytest
backend/.venv/Scripts/python.exe manage.py makemigrations --check --dry-run --noinput
```

Then, with `infra/compose.yaml` up:

```bash
backend/scripts/integration-tests.cmd
```

Pass conditions:

- `makemigrations --check` reports no changes. This task must add no migration.
- `git diff --stat contracts/openapi/v1.yaml` shows only FE-10's changes. BE-OPS adds no HTTP surface.
- Branch coverage at or above 85%.
- The integration suite passes against real Redis with a real worker.
- `git status` shows no BE-OPS file left unstaged, and no FE-10 file staged.
