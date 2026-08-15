# M2 adapter reliability — timeouts, retries, breakers and reconciliation

`M2-BE-809`. What each external adapter does when the far side is slow, wrong or absent; what
retries and what must not; and how the money gets back in agreement afterwards.

**The rule every row below is an instance of:** *a read may be retried freely; a write that moves
money is retried only through an idempotency key; and anything ambiguous is reported to a person
rather than resolved by a guess.*

---

## Payments — `apps.commerce.providers`

| | |
|---|---|
| Connect / read timeout | `PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS`, `PAYMENT_PROVIDER_READ_TIMEOUT_SECONDS` |
| Retry | **Not inline.** `reconcile-payments`, every 30s |
| Breaker | None. See below |
| Reconciliation | `commerce.reconcile_payments` (30s), `commerce.reconcile_refunds` (60s), `requirements.reconcile_m2_money` (hourly) |
| Alarm | `m2.async.work_stuck{kind=m2_payment_unresolved}` > 0 |

**There is no inline retry on a capture, and there must not be.** A timed-out capture is
*ambiguous* — the money may have moved — and retrying it is how a Customer gets charged twice. The
attempt stays `CREATED`/`PENDING` and the reconciliation sweep **reads** the provider until the
answer is definite. `PAYMENT_FINAL_STATES` is the set that stops it being re-read.

**No circuit breaker, deliberately.** A breaker on payments would refuse checkouts the provider is
still capable of serving, and the failure it protects against — a slow provider — is already handled
by the timeout plus the sweep. What exists instead is a **manual breaker**: `KillSwitch` scope
`PAYMENTS`, which since 1.33.0 stops new M2 purchases while leaving every in-flight one payable and
refundable (see `apps/requirements/purchase_gates.py`).

**Refunds are slower than everything else on purpose.** A real bank refund takes days;
`M2_STUCK_REFUND_SECONDS` is six hours, matching `reconciliation.refunds_awaiting_provider`'s own
cutoff so the alarm and the operator's queue describe the same rows.

**Reconciliation reports, it never corrects.** A job that could fix what it found would rewrite
history whenever its arithmetic was wrong, and the first sign of trouble would be books that always
balanced. It opens a `FinancialException`; a person decides.

**Since C7 it is bounded.** `reconcile_m2_money` walks a per-product keyset cursor
(`M2_RECONCILIATION_BATCH_SIZE`, default 500) and wraps at the end of each product, so one tick is
bounded and the whole book is covered over a few laps. Losing the cursor (a cache flush) restarts
each product from the beginning — harmless, since it reads only and exceptions deduplicate per
`(record, code)`.

## Payouts — `apps.payouts.providers`

| | |
|---|---|
| Retry | `reconcile-payouts`, hourly |
| Reconciliation | Reads the provider and settles an item only once it is **definite** |
| Alarm | Open `FinancialException` of kind `PAYOUT_AMBIGUOUS` |

**An ambiguous payout is never re-submitted.** The sweep only reads, which is why an hourly cadence
costs nothing. Money that has already left is gone, and the honest record of that is an open
exception rather than a status flip that makes the ledger disagree with the bank.

`KillSwitch` scope `PAYOUTS` exists and **is read by nothing** — see `m2-threat-model.md`.

## Notifications — `apps.notifications.transport`

| | |
|---|---|
| Transport | `MESSAGE_TRANSPORT`, default `unconfigured` |
| Retry | Per intent, budget-bounded; `FAILED` only once the budget is spent |
| Breaker | `KillSwitch` scopes `NOTIFICATIONS`, `SMS`, `WHATSAPP`, `VOICE` — **real, and read** |
| Alarm | `m2.async.work_stuck{kind=m2_notification_failed}` > 0 |

**The transport is a fail-closed seam and MSG91 has not landed.** `unconfigured` raises; production
refuses the fake outright. `escalation.unreachable_channels` reports the gap instead of letting the
ladder degrade silently. **Do not wire a caller to it expecting delivery** — `M2-BE-807` is `[~]`
for exactly this reason, and a sweep that called a raising transport would turn a missed promise
into a retry storm.

Intent and delivery are separate rows so "we decided to tell them" and "a provider accepted it" can
disagree, which they will. A `FAILED` intent on an `m2_*` purpose means a party was not warned before
a clock ran out on them.

## Document storage — `apps.foundation.storage`

| | |
|---|---|
| Timeouts | `DOCUMENT_STORAGE_CONNECT_TIMEOUT_SECONDS`, `DOCUMENT_STORAGE_READ_TIMEOUT_SECONDS` |
| Retry | Client-side, through a fresh presign |
| Reconciliation | `sweep-orphaned-attachment-uploads`, `sweep-orphaned-stage-evidence-uploads`, `cleanup-partner-document-uploads` — hourly |
| Alarm | None specific. An orphan costs storage and nothing else |

A `DocumentStorageError` on a *read* surfaces as `m2_attachment_unavailable` — **503, retryable** —
rather than as a `400`, because the Customer's file is fine and ours is the thing that failed.

**Deletion tolerates failure.** `retention._purge_attachments` counts an object it could not delete
and leaves `purged_at` null, so the daily sweep retries. Failing a whole redaction because one object
was unreachable would leave the Customer's *description* intact as well, which is the worse outcome.

## Geocoding — `apps.locations.geocoding`

| | |
|---|---|
| Timeout | `GEOCODING_TIMEOUT_SECONDS`, 3s |
| Cache | `GEOCODING_CACHE_SECONDS`, 7 days, coordinate-rounded |
| Throttle | `geocoding` 30/min, `serviceability` 60/min |

Fail-closed on serviceability: an area we cannot resolve is not served.

## The cache (Redis)

Used by throttles, the reconciliation cursor and geocoding. **Every M2 use of it fails open**, and
each says so where it happens:

* `ScopedWriteThrottle` allows the request and emits `m2.abuse.throttle_cache_unavailable`.
* `reconciliation._read_cursor` returns `None`, which restarts the lap.

Refusing every M2 write because the cache blinked would convert a cache incident into a total outage
of the product. **Alert on `m2.abuse.throttle_cache_unavailable` > 0** — an unenforced rate limiter
that is silent is indistinguishable from a working one.

---

## Alert thresholds

`report_stuck_async_work` runs every 5 minutes and emits `m2.async.work_stuck` **including zeros**,
so an alert can also be written on the *absence* of the series — which is the failure most likely to
hide all the others.

| `kind` | Page when | Because |
|---|---|---|
| `outbox_dead_lettered` | `> 0` | Retry budget spent. Nothing will pick these up. `docs/runbooks/outbox-replay.md` |
| `outbox_overdue` | `> 0` | Still has retries and the recovery sweep did not take it — the **worker or beat** is the problem |
| `m2_payment_unresolved` | `> 0` | A Customer's money may have moved with no entitlement granted |
| `m2_purchase_pending` | `> 0` | They believe they paid and have nothing |
| `m2_cascade_stalled` | `> 0` | An *instant* product in a holding state for half an hour |
| `m2_refund_unsettled` | `> 5` | Bank refunds are genuinely slow; a standing backlog is not |
| `m2_notification_failed` | `> 0` | Somebody was not warned before a deadline passed |
| *series absent for 15 min* | always | The watchdog itself has stopped |

Also worth an alert: `m2.abuse.throttle_cache_unavailable > 0` (limits unenforced), and
`FinancialException` open count rising (`open_exception_summary`, published at
`GET /api/v1/operations/reconciliation/`).

---

## Correlation

Every HTTP log line carries `request_id` (`RequestIdMiddleware`, honouring a safe upstream
`X-Request-ID`). Since C7 it **crosses the queue**: `common/observability/tasks.py` copies it into
Celery message headers on publish and binds it for the task run, so "everything that happened
because that Customer tapped pay" is one query. A task published by beat rather than by a request
gets a fresh `task:<uuid>` id, so scheduled work is correlatable too and is visibly *not* the tail of
a request.
