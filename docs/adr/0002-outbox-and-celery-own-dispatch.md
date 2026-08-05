# 2. The outbox and Celery own dispatch

- Status: Accepted
- Date: 2026-08-01

## Context

Partner dispatch is a sequence that outlives a single HTTP request: offer a unit to a candidate
partner, wait out the acceptance window, escalate to the next candidate on expiry or rejection,
and repeat until the unit is assigned or the candidate pool is exhausted. That sequence can take
minutes.

Driving it from the browser — a polling tab that advances the state machine, or a request that
holds open while the timer runs — makes correctness depend on a client staying alive. A closed
tab, a locked phone, a dropped connection or a backgrounded browser all silently stop dispatch,
leaving a paid booking with no partner and no process to fix it. It also makes the client
authoritative over assignment, which contradicts the rule that the backend owns pricing,
authorization, assignment, payment and workflow.

Publishing events directly from request handlers instead — enqueueing a task inline, or calling
the consumer straight — introduces a different fault. The domain write and the publish are then
two separate operations that can fail independently: the transaction commits and the publish
fails, so the event is lost; or the publish succeeds and the transaction rolls back, so consumers
act on a booking that does not exist.

## Decision

Events are written to `OutboxEvent` **inside the same database transaction as the domain state
that produced them**. The row and the state it describes commit together or not at all, which
removes the possibility of one existing without the other.

Delivery is a separate concern, performed after commit by Celery. A `transaction.on_commit` hook
queues `apps.foundation.tasks.dispatch_outbox_event` with the event's UUID; the worker loads the
row and calls the registered handler. Handlers are registered by event type through
`register_outbox_handler` and receive the stable event UUID.

Handlers must be idempotent, keyed on that UUID.

## Consequences

Delivery is **at-least-once, never exactly-once**. The broker can redeliver, a queue entry can be
duplicated, and the recovery sweep in ADR-0006 can re-drive an event whose handler already ran.
Every consumer must therefore deduplicate on the event UUID. This is not advisory: a handler that
is not idempotent is a defect, and it will eventually double-charge, double-assign or
double-notify in production.

Dispatch survives the client entirely. Closing the tab, losing the network or killing the app has
no effect on a booking already committed, because nothing about the sequence depends on a browser.

The cost is that the queue is now on the critical path for anything a customer expects to happen
promptly. A worker that is not running means events accumulate as `PENDING` rows and nothing
visible occurs — the data is safe, but the system appears frozen. Running the web server without
`scripts\worker.cmd` is not a valid deployment.

Observability moves into the database. An operator asks `manage.py outbox_report`, not the broker,
what the system is behind on, because the outbox rows are the durable record and the queue entries
are not.
