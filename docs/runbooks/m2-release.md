# M2 release — migrate, backfill, flag, roll back, reconcile

`M2-BE-811`. Five runbooks in one file because they are five parts of one evening.

**Read `m2-threat-model.md` §"What C7 did not close" before you start.** M2 ships with no
object-level authorization regression tests and no concurrency tests; that is a deliberate,
recorded gap, not an oversight, and it changes how carefully the first live hour is watched.

---

## 1. Migrate

M2 adds no destructive migration. Every column it introduced is nullable or defaulted, every M2
foreign key into an M1 table is `PROTECT`, and no M1 column changed meaning.

```
cd backend
.\.venv\Scripts\python.exe manage.py migrate
```

**Order matters in exactly one place.** `notifications/0003_m2_purchase_kill_switch` widens the
`KillSwitch.scope` choices. Django `TextChoices` are not a database enum here — the column is a
`CharField` — so this migration alters nothing but the field's declared choices and is safe to apply
before or after the app restarts.

**Before:**

```
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --noinput
```

Must print `No changes detected`. A model change with no migration behind it is the failure that
reaches production as an `IntegrityError` on the first write, not as a deploy error.

**After:** `manage.py check` and `manage.py showmigrations requirements notifications` — the last
two should be `0012_m2_retention_markers` and `0003_m2_purchase_kill_switch`.

## 2. Backfill

**There is no data backfill, and that is a design outcome rather than luck.** The two columns C7
added are both "this happened to this row" markers with a null meaning "it has not happened":

* `CustomerRequirement.redacted_at` — null means never redacted. Correct for every existing row.
* `RequirementAttachment.purged_at` — null means the bytes are still there. Correct for every
  existing row, and the daily sweep will pick up genuinely expired ones on its own.

Backfilling either would assert something about history that is not true.

**What does need loading is configuration**, and none of it has a code default. The full list is
`07-state-machines-and-permissions.md` §9. Until it is loaded the affected path **refuses with a
named `m2_*` error** rather than guessing — which is correct and unusable, so plan the load as part
of the release rather than after it:

| Unset | What refuses |
|---|---|
| `M2AccessPrice` (A3 unlock) | `m2_access_price_unavailable` — nothing can be unlocked |
| `M2AccessPrice` (A5 tiers) | The tier chooser offers **nothing**; no plan can be bought |
| `RateCard` for the city+skill | `m2_rate_card_unavailable` — A3 falls back to the quote flow |
| `MinimumWageFloor` for state+skill | `m2_wage_floor_unavailable` — no A3 quote and no rate publish |
| `crew_*` cascade columns | `m2_policy_unavailable` — instant dispatch is not open |
| `booking_fee_free_cancel_hours` | A paid booking **cannot be cancelled by the Customer** |
| `booking_fee_travel_compensation_basis_points` | The forfeit does not run; the fee stays `ACTIVE` |
| `amendment_response_hours` | **No change request can be proposed at all** |
| `case_appeal_window_hours` | A resolved case **cannot be appealed** |
| `warranty_*` | An A5 estimate promising warranty is refused at the composer |

In development, `manage.py seed_m2_demo --i-understand-this-is-dev-only` loads placeholders for all
of it. **It refuses outside `DEBUG`, and every row it writes is marked `DEV SEED — not an owner
decision` so a real value loaded later is distinguishable and is never overwritten.** See
`m2-demo-seed.md`.

**Publishing a rate card needs a `skill_id` uuid.** `GET /api/v1/partner/skills/` publishes it —
since 1.33.0. Paste the wrong uuid and the price is published against the wrong trade and priced
into every booking made until somebody notices, so read the id from that endpoint rather than from
a database console.

## 3. Feature flags

**One flag, and it gates new purchases only** (`M2-BE-810`).

```
POST /api/v1/operations/kill-switches/
  { "scope": "M2_PURCHASES", "target": "", "reason": "why" }

POST /api/v1/operations/kill-switches/release/
  { "scope": "M2_PURCHASES", "target": "" }
```

`target` blank pauses all of M2; a `ServiceVariant` id pauses one product. A reason is required by a
check constraint as well as by the serializer: an outage nobody can explain afterwards is worse than
the outage. `GET /api/v1/operations/kill-switches/` is the board.

**What it stops:** the A3 instant booking, the A3 unlock checkout, the A5 visit-plan choice. All
three run before any vendor has been asked for anything. Refused with **`m2_purchases_paused`** —
409, retryable — and the published availability reads tell the truth *before* the tap:
`m2_unlock_read.is_available` goes `false` and `m2_visit_plan_read.available_tiers` goes empty.

**What it deliberately does not stop, and this is the point of the task:**

* the booking-fee checkout and the visit-plan checkout — a vendor is already holding a slot or a
  Saturday, and the payment is what resolves that hold either way;
* every provider callback — the money has already left the Customer's account;
* stage and amendment funding on an existing engagement;
* every refund, forfeit, payout, cancellation, dispute and case path.

**A flag that strands a funded stage is worse than no flag**, and a pause must never make money
harder to give back than it was to take.

`PAYMENTS` is the broader manual breaker: it stops the same three doors and is the one to reach for
when the provider, not the product, is the problem. `PAYOUTS`, `DISPATCH`, `SERVICE_AREA` and
`SERVICE` are engageable and **read by nothing** — see `m2-threat-model.md`.

**Watch `m2.purchase.paused`**, labelled `door` and `scope`. A pause with no counter is a switch
nobody knows the cost of.

## 4. Roll back

**Decide which of three things is wrong**, because the answer is different for each.

**(a) The product is misbehaving — bad rate, bad supply, a screen doing damage.**
Engage `M2_PURCHASES`. Do not roll back code. In-flight work continues, refunds still run, and you
can release it in seconds when the rate is fixed. **This is the intended first move and it needs no
deploy.**

**(b) The provider is misbehaving.** Engage `PAYMENTS`. Same shape, wider blast radius.

**(c) The code is wrong.** Deploy the previous image. **Do not reverse the migrations.**

Reversing is unnecessary and dangerous, in that order.

*Unnecessary:* both C7 columns are additive and nullable, and old code that has never heard of
`redacted_at` writes rows with it null — which is exactly what a never-redacted requirement should
carry. `KillSwitch.scope` is a `CharField`; old code cannot *create* an `M2_PURCHASES` row through
its serializer's choices, and an existing one is an unrecognised string it ignores. Nothing breaks.

*Dangerous:* reversing `0012` drops `purged_at`, and `purged_at` is the only record of which
attachment objects have already been deleted from storage. Drop it and the sweep re-deletes objects
that are already gone (harmless) while the metadata says bytes exist that do not (not harmless: it
is the difference between "we deleted this at the Customer's request" and "we have no idea").

**If you must reverse anyway:**

```
.\.venv\Scripts\python.exe manage.py migrate requirements 0011
.\.venv\Scripts\python.exe manage.py migrate notifications 0002
```

Release any engaged `M2_PURCHASES` switch **first**. Rolling back to code that cannot read the scope
leaves a row that pauses nothing, and the board will show a switch that is lying.

## 5. Reconcile

**After any rollback, any incident, and any migration that touched money.**

```
# What Finance is currently carrying — the fast read, no scan.
GET /api/v1/operations/reconciliation/

# The full scan, unbounded, from a shell. Reads only; opens exceptions; moves nothing.
.\.venv\Scripts\python.exe manage.py shell -c ^
  "from apps.requirements import reconciliation as r; print(len(r.find_mismatches()))"
```

`find_mismatches()` is the **whole book**; the hourly `reconcile_m2_money` task is the same checks
behind a cursor. Use the unbounded one at a cutover, when "a few laps from now" is not good enough.

Each product is checked **independently, per row, in integer paise** — `M2-AC-712`, and
*independently* is load-bearing: one grand total that balances can hide two errors that cancel. Codes
you may see:

| Code | Means |
|---|---|
| `charged_fee_without_a_capture` | A booking fee says paid; no captured attempt behind it |
| `waived_fee_has_a_capture` | A free re-dispatch collected money |
| `forfeit_split_does_not_reconcile` | `travel + platform ≠ amount` |
| `refunded_fee_without_a_settled_refund` | Marked refunded; no succeeded refund and none pending |
| `unlock_without_a_capture` | An active unlock with no captured attempt |
| `visit_plan_does_not_reconcile` | `payouts + platform + refunds ≠ price` |
| `staged_total_does_not_reconcile` | `staged ≠ total + amendment delta` |
| `refunded_more_than_funded` | Exactly what it says |

**Nothing here corrects anything.** Each opens one `FinancialException` per `(record, code)`, so a
mismatch that persists for a week is one row somebody is working on rather than a hundred and
sixty-eight — and, since the sweep wraps, one row rather than one per lap.

Also check the watchdog, which answers a different question ("is work stuck?" rather than "do the
books agree?"):

```
.\.venv\Scripts\python.exe manage.py shell -c ^
  "from apps.requirements import watchdog; print(watchdog.report_stuck_async_work())"
```

Every count should be zero. See `m2-adapter-reliability.md` for what each non-zero one means.

---

## Data-subject erasure

Not part of a release, but it lives with the other irreversible operations.

```
# Read-only. Run this first: it answers "what can we actually remove".
manage.py redact_m2_requirement <uuid> --actor-phone +91... --reason "..." --holds-only

# Redacts. Never deletes a money row.
manage.py redact_m2_requirement <uuid> --actor-phone +91... --reason "DSR-1234"
```

Requires the operations role, records an actor and a reason on both a `RequirementTransition` and an
`AccessAuditEvent`, and **prints every financial hold that made it keep something** — that list is
what you relay to the person who asked.

**It always redacts and never refuses on a hold.** A hold outranks *deletion*, not the Customer's
right to have their personal content removed; collapsing the two into one refusal would give them
nothing when they could have had most of it. The financial retention schedule
(`M2_FINANCIAL_RECORD_RETENTION_DAYS`) is **unset**, and `0` means the hold never lapses — it is a
legal question and a code default would decide how long this business keeps its books.
