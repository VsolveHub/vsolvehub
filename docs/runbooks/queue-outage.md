# Queue outage runbook

## Scope

Redis carries Celery's broker and result backend. It is a transport, not a system of record.
Every asynchronous command in this backend is first written to `foundation_outboxevent` in the
same PostgreSQL transaction as the domain state that justifies it, and only then queued. A broker
outage therefore delays work; it does not lose it.

## Required production configuration

- `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` point at a durable Redis with `appendonly yes`
  and `maxmemory-policy noeviction`. An evicting Redis silently drops queued task messages.
- Exactly one `celery beat` process per deployment. Two schedulers double-fire every periodic
  task, including the recovery sweep.
- `OUTBOX_LEASE_SECONDS` must remain greater than `CELERY_TASK_TIME_LIMIT`. If the lease is
  shorter, the sweep re-queues work that is still legitimately running.

## Symptoms

- `manage.py outbox_report` shows a climbing `PENDING` count and a non-zero
  "Events due for recovery now".
- Worker or beat logs show broker connection errors.
- Customer-visible effect: confirmed Booking Groups stop progressing to dispatch, payment
  reconciliation stalls, partner presence stops reconciling.

## Recovery

1. Restore Redis. Do not restart workers first — they reconnect on their own.
2. Confirm the broker is reachable and the workers have reattached.
3. Run `manage.py outbox_report`. The "due for recovery" figure is the real backlog.
4. Wait. The `recover-outbox-events` beat task runs every 30 seconds and re-queues up to
   `OUTBOX_RECOVERY_BATCH_SIZE` events per tick. Watch `PENDING` and `PROCESSING` fall and
   `PUBLISHED` rise.
5. Anything still listed as a dead letter after the backlog drains is not an outage symptom.
   Follow [outbox-replay.md](./outbox-replay.md).

Never edit `foundation_outboxevent` by hand. The sweep, the lease and the attempt budget are the
supported controls, and a manual status change discards the diagnostic in `last_error`.

## What an outage costs

A broker restart loses in-flight queue entries. It does not lose outbox rows, because those
committed with the domain transaction. Every lost queue entry is reconstructed by the sweep from
the row, which is the entire reason the pattern exists. The cost of an outage is latency and a
burst of retries afterwards, not lost commands.
