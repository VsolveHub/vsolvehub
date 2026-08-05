# Stuck command runbook

## Scope

Diagnosing an asynchronous command that appears not to be progressing: a Booking Group that stays
un-dispatched, a payment that never reconciles, a partner presence session that never closes.

## Required production configuration

- `OUTBOX_LEASE_SECONDS` strictly greater than `CELERY_TASK_TIME_LIMIT`. This is the single most
  important invariant here. A lease shorter than the time limit lets the sweep re-queue a command
  that is still running, and the handler executes twice concurrently.
- One `celery beat`, at least one `celery worker`, both reachable from the broker.

## Reading a status

`OutboxEvent.available_at` is a visibility deadline, not a creation stamp. Combined with `status`
it tells you what is actually happening:

| status | available_at | Meaning | Action |
| --- | --- | --- | --- |
| `PROCESSING` | in the future | A worker holds a live lease and is working on it. | None. Wait. |
| `PROCESSING` | in the past | The worker died. The lease lapsed. | None. The sweep re-drives it within 30 seconds. |
| `PENDING` | in the past | Queued but never delivered, or reset by the sweep. | None, unless it persists across several sweep ticks. |
| `FAILED` | in the future | Failed; inside its backoff window. | Read `last_error`. |
| `FAILED` | in the past, attempts exhausted | A dead letter. | [outbox-replay.md](./outbox-replay.md). |
| `PUBLISHED` | any | Delivered. Terminal. | None. |

The important row is the second one: a crashed worker needs no human intervention. Recovery is
automatic and bounded.

## Diagnostic sequence

1. `manage.py outbox_report` — counts by status, the number genuinely due for recovery, and the
   dead-letter list with errors.
2. `celery -A config inspect active` — what the workers are running right now. An event that is
   `PROCESSING` with a live lease should appear here. If it does not, the worker that claimed it
   is gone and the lease simply has not lapsed yet.
3. `celery -A config inspect scheduled` — retries waiting to fire.
4. Worker logs for `Outbox delivery failed`, which carries the `outbox_event_id`.

## If a command is genuinely stuck

An event that stays `PENDING` with a past `available_at` across several sweep ticks means the
sweep itself is not running. Check that exactly one `celery beat` process is alive and that
`recover-outbox-events` is in `CELERY_BEAT_SCHEDULE`.

An event that cycles `PROCESSING` → `FAILED` → `PROCESSING` is failing repeatedly. Read
`last_error`; the attempt budget will terminate the cycle and hand it to the dead-letter path.

Never change `status` or `attempts` by hand. `manage.py outbox_replay` is the supported control
and it preserves the audit trail that a manual `UPDATE` destroys.
