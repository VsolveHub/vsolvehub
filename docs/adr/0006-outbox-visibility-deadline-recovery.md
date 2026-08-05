# 6. Outbox visibility deadline and recovery

- Status: Accepted
- Date: 2026-08-05

## Context

ADR-0002 made the outbox durable: an event commits with the domain state that produced it, so an
event can never be lost. It did not make **delivery** durable. Three states were terminal in
practice, each leaving a committed event that nothing would ever deliver:

`PROCESSING` on worker death. A worker that claimed an event and was then killed — deploy, OOM,
host failure — left the row marked in flight with no process behind it. Nothing distinguished that
row from one being actively worked, so nothing re-drove it.

`FAILED` after retry exhaustion. Celery's eight in-process retries are bounded and in-memory. Once
spent, the row sat at its final status and no further attempt was made.

`PENDING` when the broker was unreachable. `transaction.on_commit` fired and `.delay()` raised
because Redis was down. The domain state was committed, the outbox row was written, and the queue
entry never existed.

A probe on 2026-08-05 found a fourth problem underneath these. The whole of `dispatch_outbox_event`
ran inside one `transaction.atomic()` block, and both failure paths wrote their bookkeeping and
then re-raised — so the raise propagated out of the atomic block and PostgreSQL rolled the
bookkeeping back:

```
failing handler -> status=PENDING attempts=0 last_error=''   (expected FAILED / 1 / "boom")
no handler      -> status=PENDING attempts=0 last_error=''   (expected FAILED / 1 / "No handler…")
```

`attempts` therefore counted only *successful* deliveries and could never support a cap, and
`last_error` was always empty, leaving an operator investigating a stuck event with no diagnostic
at all.

## Decision

`OutboxEvent.available_at` becomes a **visibility deadline** — an SQS-style lease — instead of a
write-once creation stamp. Claiming an event pushes the deadline forward by `OUTBOX_LEASE_SECONDS`;
a worker that dies without publishing lets the deadline lapse.

Delivery splits into three independently committed phases. **Claim** marks `PROCESSING`, spends an
attempt and takes the lease, and commits before the handler runs — which is what makes an in-flight
event observable from another connection. **Handle** commits the handler's domain writes and the
`PUBLISHED` mark together, so a published event's side effects cannot be lost. **Record** writes a
failure in a fresh transaction, after the handler's transaction has already rolled back.

A beat-scheduled sweep, `recover_outbox_events`, runs every 30 seconds and re-drives every event
whose deadline has lapsed and which never reached `PUBLISHED`, bounded by `OUTBOX_MAX_ATTEMPTS`
and `OUTBOX_RECOVERY_BATCH_SIZE`. It selects with `select_for_update(skip_locked=True)` and moves
`available_at` in the same transaction, so two beat ticks or two workers cannot re-drive one event
twice. It resets the status to `PENDING` rather than merely re-leasing, because the claim path
refuses an event that is `PROCESSING` under a live lease.

This needs no migration. `available_at` already exists and is already indexed jointly with
`status`, and nothing in the codebase read it before this change.

## Consequences

**`OUTBOX_LEASE_SECONDS` must exceed `CELERY_TASK_TIME_LIMIT`.** If the lease is shorter, the
sweep re-queues work that is still legitimately running and the handler executes concurrently with
itself. The defaults — a 120-second lease against a 60-second task time limit — satisfy this;
raising the task time limit without raising the lease breaks it silently.

Events that exhaust `OUTBOX_MAX_ATTEMPTS` stop being swept and become **dead letters**. This is
deliberate: an event that has failed ten times is usually poison, and re-driving it forever costs
worker capacity and fills logs while never succeeding. Recovery from that state is a human
decision — `manage.py outbox_report` to see them, `manage.py outbox_replay --event-id <uuid>` to
return exactly one to the sweep. There is deliberately no bulk replay, because a bulk replay after
an incident re-drives the poison events alongside the recoverable ones.

**Handler idempotency is now load-bearing rather than merely advisable.** ADR-0002 already
required it; before this change the practical redelivery rate was low enough that a non-idempotent
handler could survive unnoticed. The sweep re-drives events routinely, so a handler that is not
idempotent will now double-execute in normal operation, not just in an edge case.

A missing handler consumes an attempt rather than being re-queued forever. An undeployed handler
therefore exhausts its budget and becomes a dead letter with a diagnostic, instead of being retried
by every sweep tick indefinitely — and replaying it before the handler ships merely burns the
budget again.

Correctness here cannot be demonstrated under `CELERY_TASK_ALWAYS_EAGER`, which executes tasks
inline and proves nothing about crash recovery. `config.settings.integration` and
`backend/tests/integration/` exist for this reason: a real worker in a real subprocess, against
the real broker, killed mid-handler.
