# Outbox replay runbook

## Scope

An outbox event that has spent its whole attempt budget without publishing is a dead letter. The
recovery sweep deliberately stops re-driving it. This runbook covers returning one such event to
the sweep, and deciding whether that is the right action at all.

## Required production configuration

- `OUTBOX_MAX_ATTEMPTS` bounds the budget. Default 10.
- `OUTBOX_RETRY_BACKOFF_SECONDS` and `OUTBOX_RETRY_BACKOFF_MAX_SECONDS` bound the exponential
  delay between attempts. Defaults 30 and 900.

## Identifying dead letters

```
manage.py outbox_report
```

The final section lists every event with `attempts >= OUTBOX_MAX_ATTEMPTS` that never published,
with its `event_type` and its `last_error`. Read `last_error` before doing anything else — it is
the difference between a transient fault worth replaying and a defect that will fail identically.

## Deciding

`No handler registered.` means the consumer for that `event_type` is not deployed. Replaying
before the handler ships simply burns the budget again. Deploy first, then replay.

A domain error — a validation failure, an aggregate mismatch — means the event will fail the same
way every time. Fix the cause, or accept the event as permanently undeliverable and record why.
Replay is not a fix.

A provider timeout, a connection reset or a lock timeout is worth replaying once the underlying
dependency is healthy.

## Replaying

```
manage.py outbox_replay --event-id <uuid>
```

This resets `status` to `PENDING`, `attempts` to `0` and `available_at` to now, so the next sweep
tick picks the event up. It refuses an unknown id and refuses an already-published event.

There is deliberately no bulk mode. After an incident the dead-letter list contains recoverable
events and poison events side by side, and a bulk replay re-drives the poison ones too — which are
precisely the ones somebody is reading this runbook about.

## Why replay is safe

Every outbox consumer is idempotent and keyed by the stable event UUID. An event whose handler
partly succeeded before failing will, on replay, skip the work it already did. This is a property
the handlers must preserve: see [ADR 0002](../adr/0002-outbox-and-celery-own-dispatch.md).
