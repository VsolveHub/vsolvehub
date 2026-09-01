# Wallet, V Coins & Referral — M3 Phase C

**Status:** Planning — owner decisions recorded 2026-09-01  
**Depends on:** Phase B (Razorpay on staging; MSG91 optional for referral SMS but not blocking ledger)  
**Blocks:** Checkout UX across all categories once coins/wallet are live

This document is the design authority for Phase C until an ADR (`docs/adr/0010-customer-wallet-and-loyalty-scope.md`) is merged. If they disagree, fix the defect in the same change.

---

## 1. Scope boundary (resolves PLN-01)

| In scope | Out of scope |
| --- | --- |
| Customer **prepaid INR wallet** (Razorpay top-up → spend at checkout → refund credit) | A3 worker wages (P2P UPI; platform never holds) |
| **V Coins** loyalty ledger (earn, lock, unlock, burn at checkout) | Partner earnings (`PartnerLedgerEntry` / payout batches) |
| **Referral** attribution, configurable rewards, grandfathered terms | Vendor wallet or float for marketplace settlement |
| Operations **configuration** of burn %, earn rules, referral programs | Converting coins to withdrawable cash |

Money invariants from ADR-0003 still apply: checkout produces `PaymentAllocation` rows; wallet and
Razorpay are **funding sources** for one capture, not parallel money paths.

---

## 2. Owner decisions (locked for planning)

### 2.1 V Coins — burn

| Decision | Value |
| --- | --- |
| Redemption model | **Burn-only at checkout** — coins reduce the order total; no cash-out, no transfer to bank |
| Max burn per order | **Operations-configurable** — e.g. 20% or 30% of the order’s payable total (in paise) |
| Coin value at burn | **Operations-configurable** `coin_value_paise` per coin (e.g. 1 coin = 10 paise) applied at burn time from the **active burn policy** |
| Computation | Server-only: `max_burn_paise = floor(order_payable_paise × max_burn_percent / 100)`; `burn_paise = min(spendable_coins × coin_value_paise, max_burn_paise, order_payable_paise)` |

The customer UI shows the server-computed burn cap and applied amount; it never derives percentages.

### 2.2 V Coins — earn, visibility, unlock

| Decision | Value |
| --- | --- |
| Signup / campaign promise | Customer **sees promised coins** (amount + campaign name + expiry if any) **before** they are spendable |
| Spendability | Promised coins are **locked** until unlock rules pass |
| Unlock trigger | **Operations-configurable per grant rule:** |
| | • `UNLOCK_AFTER_N_COMPLETED_BOOKINGS` — `n` configurable (1 = first completion, 3 = third, etc.) |
| | • Counter uses **platform-defined “completed booking”** (same definition as referral qualifying event unless a rule overrides) |
| Partial unlock | One grant rule may require **one** completion or **many**; each rule carries its own `completions_required` |
| Balance presentation | API publishes **promised**, **locked**, **spendable**, and **expiring_soon** separately — no single misleading “balance” |

### 2.3 V Coins — expiry

| Decision | Value |
| --- | --- |
| Per-rule expiry | **Operations-configurable** per coin grant rule |
| Festival / campaign | e.g. `expires_at` set — coins expire if not burned by deadline |
| Evergreen grants | `expires_at = null` — no expiry |
| Burn order | **FIFO by soonest expiry** among spendable coins (document in runbook; prevents customer surprise) |
| Expiry job | Celery sweep marks expired buckets; immutable `EXPIRE` ledger rows |

### 2.4 Referral — who, when, how much

| Decision | Value |
| --- | --- |
| Qualifying event (default) | **Referee’s first completed booking** on the platform |
| Who can be rewarded | **Operations-configurable per program version:** referrer only, referee only, or **both** with separate amounts |
| Reward form | Wallet credit (INR) and/or V Coins — configurable per side per program version |
| Amounts | **Configurable** per program version (e.g. referrer ₹100 + referee 500 coins) |

### 2.5 Referral — program changes & grandfathering

| Decision | Value |
| --- | --- |
| Program versioning | Every change creates a new **`ReferralProgramVersion`** with `effective_from` |
| At attribution | When a referee **signs up** via referral link/code, store **`program_version_id`** on the attribution |
| Pending rewards | Pay out using the **snapshotted version** attached to that attribution |
| Retroactivity | **Forbidden** — raising or lowering rewards globally does **not** change amounts for users already attributed under an older version |
| Completed rewards | Immutable; corrections only via Operations adjustment with audit |

**Example:** Program v1 gives referrer ₹100. User B signs up with A’s code on Monday. On Friday owner changes to ₹200 for **new** attributions only. A still receives ₹100 when B completes first booking; a new referee C on Saturday earns A ₹200.

### 2.6 Referral — link, code & signup-only apply

| Decision | Value |
| --- | --- |
| Apply window | **Signup only** — no applying a code later from account settings |
| Per customer | Every customer gets a **unique referral code** and a **unique shareable link** |
| Share link shape (planning) | `https://vsolvehub.com/signup?ref={code}` (exact host/path configurable per env) |
| Click → signup | Link carries `ref` query param → signup form **auto-fills** the referral field (read-only or pre-filled) |
| Server truth | Attribution is created only when signup **completes** with a valid code; auto-fill alone is not enough |
| Already registered | Logged-in users or existing accounts **cannot** attach a referral retroactively |

### 2.7 Wallet — top-up limits

| Decision | Value |
| --- | --- |
| Min / max top-up | **Operations-configurable** (`WalletTopUpPolicy` or platform settings) — not hard-coded |
| Validation | Server rejects top-up below min or above max; customer sees the configured limits on the top-up screen |
| Effective dating | Optional `effective_from` if limits change over time (same pattern as burn policy) |

### 2.8 Refunds — wallet, payment, coins

| Decision | Value |
| --- | --- |
| Wallet-funded portion | **Restored to customer wallet** on refund |
| Razorpay-funded portion | **Refunded through Razorpay** (existing refund path) |
| Coins burned at checkout | **Not restored** — burn is final; customer keeps INR refund only |
| Allocation | Refund still uses `RefundAllocation` per ADR-0003; funding source split is auditable |

---

## 3. Domain model (planning)

### 3.1 Customer wallet (INR)

```text
WalletAccount          1:1 Customer (User)
WalletTransaction      append-only; signed amount_paise; never UPDATE balance column
```

| Field / concept | Notes |
| --- | --- |
| `kind` | `TOP_UP`, `CHECKOUT_DEBIT`, `CHECKOUT_RELEASE`, `REFUND_CREDIT`, `REFERRAL_CREDIT`, `ADJUSTMENT` |
| `status` (for debits) | `RESERVED` at attempt create → `CAPTURED` or `RELEASED` on outcome |
| Balance | `SUM(amount_paise)` — no stored balance column |
| Top-up | `PaymentAttempt` purpose `WALLET_TOP_UP`; credit only on verified capture |

```text
WalletTopUpPolicy      Operations-configurable min_paise, max_paise, effective_from
```

### 3.2 V Coins

```text
CoinGrantRule          Operations-authored; versioned; effective-dated
CoinGrant              one row per customer per rule application (promised bucket)
CoinTransaction        append-only: EARN_PROMISE, UNLOCK, BURN, EXPIRE, ADJUSTMENT
```

| `CoinGrantRule` fields (planning) | |
| --- | --- |
| `name` | e.g. "Diwali 2026", "Signup welcome" |
| `coins_amount` | integer ≥ 1 |
| `completions_required` | 0 = immediate on grant event, 1+ = locked until N completions |
| `grant_trigger` | `SIGNUP`, `REFERRAL_QUALIFIED`, `BOOKING_COMPLETED`, `MANUAL_OPS` |
| `expires_at` | nullable |
| `effective_from` / `effective_until` | rule visibility |
| `is_active` | soft off without deleting history |

| `CoinBurnPolicy` fields (planning) | |
| --- | --- |
| `max_burn_percent` | 1–100 (e.g. 20 or 30) |
| `coin_value_paise` | paise per coin at burn |
| `effective_from` | only one active policy per instant |

### 3.3 Referral

```text
ReferralProgramVersion   effective_from, referrer_reward_*, referee_reward_*, qualifying_event
ReferralCode             per referrer; unique code + canonical share_url
ReferralAttribution      referee + program_version_id (frozen at signup)
ReferralReward           per side; links to wallet/coin grant when paid
```

| `ReferralAttribution.status` | |
| --- | --- |
| `PENDING` | Referee registered; qualifying event not yet met |
| `QUALIFIED` | Event met; reward issuance in progress |
| `REWARDED` | All configured sides paid per snapshot |
| `EXPIRED` | Optional TTL if program defines attribution expiry |
| `INELIGIBLE` | Fraud block, self-referral, etc. |

### 3.4 Customer completion ledger (C2 — idempotency for `record_completion_for_customer`)

Do **not** maintain a mutable `completed_booking_count` column on the customer profile. Outbox
delivery is at-least-once; an outbox retry must **never** increment a completion count twice.

**Idempotency rule (locked):** one row per logical completion, keyed by:

```text
(customer_id, source_type, source_id)
```

That triple is the natural key. There is no separate idempotency string — the unique constraint
*is* the idempotency model.

Instead, record each qualifying completion as an append-only fact:

```text
CustomerCompletion
------------------
customer_id
source_type          BOOKING | ENGAGEMENT   (M1 vs M2 — not a generic catch-all event)
source_id            UUID of booking or engagement
completed_at         see §3.5.1 — copied from outbox payload at insert time
outbox_event_id      UUID — audit link to the outbox row that caused this record
created_at
```

| Constraint | Purpose |
| --- | --- |
| `UNIQUE(customer_id, source_type, source_id)` | Second handler delivery for the same booking/engagement is a no-op (`get_or_create`) |

**Service contract (C2):**

```text
record_completion_for_customer(
    customer_id,
    source_type,       # BOOKING for M1; ENGAGEMENT for M2 later
    source_id,         # booking_id or engagement_id from event payload
    completed_at,      # from payload — must match §3.5.1
    outbox_event_id,   # event.id for audit
) -> RecordCompletionResult   # created: bool — False means replay, no unlock side-effect re-run
```

Implementation: `CustomerCompletion.objects.get_or_create(defaults={...}, customer_id=..., source_type=..., source_id=...)`. Coin unlock runs **only** when `created is True`.

Flow:

```text
Booking 123 → COMPLETED
        ↓
customer.fulfilment.completed (outbox, at-least-once)
        ↓
record_completion_for_customer(customer=42, source_type=BOOKING, source_id=123, …)
        ↓
get_or_create → CustomerCompletion row
        ↓
UNIQUE(customer_id, source_type, source_id) → replay returns existing row, created=False
        ↓
unlock / count logic uses row existence or COUNT(*) — never +=
```

| Wave | `CustomerCompletion` |
| --- | --- |
| C0b (`M3-BE-207`) | **Not created** — `record_completion_for_customer` is a stub with the signature locked |
| C2 (`M3-BE-224`) | Model + migration; handler calls real `get_or_create` before coin unlock |

M2 later uses the same table with `source_type=ENGAGEMENT` from `customer.engagement.completed`.
Do **not** introduce a generic `customer.anything.completed` event type to avoid two source tables.

---

## 3.5 Completion hook — `customer.fulfilment.completed` (M1)

Loyalty and referral must not run inside `_settle_submission()` directly. That function already
settles money, refunds and partner earnings; adding coin unlock and referral payout there would
couple fulfilment to marketing and make retries dangerous.

The existing platform pattern is **transactional outbox** (`enqueue_outbox_event` in
`apps/foundation/services.py`, consumers via `register_outbox_handler` in
`apps/fulfilment/handlers.py`, `apps/requirements/handlers.py`, etc.). Phase C follows the same
shape.

### Architecture (owner-approved)

**Emit side (M1 fulfilment):**

```text
M1 completion
      │
      ▼
_settle_submission()
      │
      ├── Booking → COMPLETED
      │
      └── Outbox event (same transaction)
              │
              ▼
      customer.fulfilment.completed
```

**Consume side (`apps/loyalty/`):**

```text
apps/loyalty/
│
├── handlers.py
│
└── services/
    ├── completion.py
    ├── referral.py
    └── notifications.py

customer.fulfilment.completed
              │
              ▼
       loyalty handler
        ┌─────┼─────┐
        ▼     ▼     ▼
   completion referral notification
     service   service   service
```

**M1 vs M2 — do not generalize:**

| Path | Event | Shared service |
| --- | --- | --- |
| M1 booking settle | `customer.fulfilment.completed` | `record_completion_for_customer(source_type=BOOKING, …)` |
| M2 engagement (later) | `customer.engagement.completed` | same service, `source_type=ENGAGEMENT` |

No `customer.anything.completed`, no unified generic completion event. Two explicit event types,
one shared `CustomerCompletion` ledger (C2).

### 3.5.1 `completed_at` — single definition (no alternatives)

`completed_at` has **one** meaning everywhere (outbox payload, `CustomerCompletion` row, referral
qualify timestamp, coin-unlock audit):

> The timestamp of the **successful `COMPLETED` transition** — i.e. when settlement commits the
> booking into `Booking.Status.COMPLETED`.

| | |
| --- | --- |
| **Canonical source** | `BookingStatusHistory.created_at` on the history row that `record_transition` writes inside `apply_transition` for `to_status=COMPLETED` |
| **How to obtain at emit time** | Read from that history row in the same transaction, immediately after `apply_transition` returns — either from a returned `BookingStatusHistory` reference or by querying the row just created for this settle (`booking`, `to_status=COMPLETED`, matching settle `command` / `idempotency_key`) |
| **Payload field** | `completed_at` — ISO-8601 copy of that `created_at` value |
| **Forbidden** | `CompletionSubmission.submitted_at`, `timezone.now()` at emit, or any other proxy |

There is no `submission.submitted_at` vs `timezone.now()` choice. Partner submit time is not
completion time:

```text
Partner submits completion     10:00   ← forbidden as completed_at
Customer confirms              15:00   ← BookingStatusHistory.created_at ≈ 15:00 → completed_at
```

### 3.5.2 Event payload contract — `customer.fulfilment.completed` v1

Every emitted event includes `event_version: 1`. Handlers must reject or dead-letter unknown
versions rather than guess field meaning.

| Field | Required | Notes |
| --- | --- | --- |
| `event_version` | yes | **Always `1` for this schema.** Bump on breaking payload changes. |
| `booking_id` | yes | Aggregate identity |
| `customer_id` | yes | Loyalty subject |
| `booking_group_id` | yes | Context for notifications / future analytics |
| `fulfilment_unit_id` | yes | Context |
| `partner_id` | yes | Context |
| `status_history_id` | yes | Pointer to authoritative `BookingStatusHistory` row |
| `completed_at` | yes | ISO-8601; must equal that history row's `created_at` (§3.5.1) |

Outbox row metadata (outside JSON payload, set by `enqueue_outbox_event`):

| Field | Value |
| --- | --- |
| `event_type` | `customer.fulfilment.completed` |
| `idempotency_key` | `customer-fulfilment-completed:{booking_id}` |
| `aggregate_type` | `booking` |
| `aggregate_id` | `booking_id` |

Future `customer.engagement.completed` gets its own `event_version` starting at `1` when defined.

### Emission point

Inside `_settle_submission()` in `apps/fulfilment/completion.py`, **after** `apply_transition`
succeeds and **only when** `to_status == Booking.Status.COMPLETED`. Obtain `completed_at` per
§3.5.1 from the `BookingStatusHistory` row for this transition; emit payload per §3.5.2:

```python
# history = BookingStatusHistory row for this COMPLETED transition (§3.5.1)
enqueue_outbox_event(
    aggregate_type="booking",
    aggregate_id=booking.id,
    event_type="customer.fulfilment.completed",
    idempotency_key=f"customer-fulfilment-completed:{booking.id}",
    payload={
        "event_version": 1,
        "booking_id": str(booking.id),
        "customer_id": str(booking.customer_id),
        "booking_group_id": str(group.id),
        "fulfilment_unit_id": str(unit.id),
        "partner_id": str(booking.partner_id),
        "status_history_id": str(history.id),
        "completed_at": history.created_at.isoformat(),
    },
)
```

Properties:

| Property | Rule |
| --- | --- |
| Same DB transaction | Event row commits with the booking status change |
| Idempotency | One event per booking — replays of confirm/auto-finalize are safe |
| Not emitted for | `PARTIALLY_COMPLETED`, `DISPUTED`, `ABORTED` paths |
| Not emitted from | Partner-only `submit_completion` while still `COMPLETION_SUBMITTED` |

### Consumer (one handler, three services)

`register_outbox_handler` allows **exactly one consumer per `event_type`** (see
`apps/requirements/handlers.py`). Register one orchestrator in `handlers.py`; delegate to services:

```text
@register_outbox_handler(event_type="customer.fulfilment.completed")
def handle_customer_fulfilment_completed(event: OutboxEvent) -> None:
    record_completion_for_customer(event)      # C0b stub → C2 CustomerCompletion get_or_create
    evaluate_referral_qualification(event)    # C0b stub → C4
    notify_booking_completed(event)            # C0b real
```

| Step | Idempotency (how, not just “must be”) |
| --- | --- |
| Outbox emit | `UNIQUE(event_type, idempotency_key)` on `OutboxEvent` |
| `record_completion_for_customer` | C2: `get_or_create` on `CustomerCompletion` with `UNIQUE(customer_id, source_type, source_id)` — replay returns `created=False`, unlock must not re-run (§3.4) |
| Referral qualify | C4: idempotency on `ReferralReward` / attribution state machine (separate spec) |
| Notification | `request_notification` idempotency key derived from `customer-fulfilment-completed:{booking_id}` |

### What counts as “a completion” for coins / referral

| Status | Counts toward N completions / referral qualify? |
| --- | --- |
| `COMPLETED` | **Yes** — emits event |
| `PARTIALLY_COMPLETED` | **No** — work was partial; refund already issued |
| `DISPUTED` | **No** — payout held; not a clean completion |
| M2 `Engagement.COMPLETED` | **Separate event** — `customer.engagement.completed` in a later wave (not M1 hook) |

### Notification gap today

`booking.completed` is listed in `TRANSACTIONAL_PURPOSES` (`apps/notifications/services.py`) but
**nothing calls `request_notification` with that purpose** when a booking completes. The outbox
handler is the correct place to wire it.

### M2 follow-up (not Phase C Wave C0)

Workforce/project completions use `Engagement`, not M1 `Booking`. Plan a sibling event:

```text
customer.engagement.completed   → emitted from accept_engagement_completion()
```

Same loyalty handler module can subscribe to both event types with shared
`record_completion_for_customer(customer_id, source_type, source_id, completed_at, outbox_event_id)`.

### M3-BE-207 — implementation spec (next step; planning locked)

**Scope:** Establish the M1 completion outbox boundary only. Do **not** add wallet/coin/referral
models, checkout changes, or M2 `customer.engagement.completed` generalization in this task.

#### 207.1 Emit from `_settle_submission()`

| Rule | Detail |
| --- | --- |
| When | Only after `apply_transition` resolves to `Booking.Status.COMPLETED` |
| Never emit | `PARTIALLY_COMPLETED`, `DISPUTED`, `COMPLETION_SUBMITTED` (partner submit alone) |
| Transaction | `enqueue_outbox_event` in the **same** `atomic()` block as the status transition |
| Idempotency key | Exactly `customer-fulfilment-completed:{booking_id}` |
| Uniqueness | `OutboxEvent` constraint on `(event_type, idempotency_key)` — retries cannot create a second row |

#### 207.2 `apps/loyalty/` scaffold (minimal for C0b)

Final C0b tree — no extra packages, no models in this wave:

```text
apps/loyalty/
│
├── handlers.py
│
└── services/
    ├── completion.py
    ├── referral.py
    └── notifications.py
```

Handler stays thin — **no business logic in the handler body**:

```text
customer.fulfilment.completed
            │
            ▼
     loyalty handler (handlers.py)
        ├── record_completion_for_customer()     # C0b: stub (signature locked for C2)
        ├── evaluate_referral_qualification()    # C0b: stub until C4
        └── notify_booking_completed()           # C0b: real — wire booking.completed purpose
```

| Service (C0b) | Behaviour |
| --- | --- |
| `record_completion_for_customer` | Callable exists with locked signature; **no** `CustomerCompletion` table until C2; no counter increment |
| `evaluate_referral_qualification` | Stub until `ReferralAttribution` exists in C4 |
| `notify_booking_completed` | **Real** — `request_notification(..., purpose="booking.completed")`, idempotent on booking key |

Later waves plug into the same services:

| Wave | Plugs into |
| --- | --- |
| C2 (`M3-BE-224`) | `CustomerCompletion` model + `get_or_create`; then coin unlock from completion count |
| C4 | `evaluate_referral_qualification` → qualify + pay per snapshotted program |
| M2 (future) | `customer.engagement.completed` handler → same `record_completion_for_customer` with `ENGAGEMENT` |

#### 207.3 Core invariant (what tests must prove)

Do **not** treat status and outbox as independent assertions. The valuable guarantee is:

> **A committed `COMPLETED` booking must have its corresponding completion event, and a rolled-back settlement must have neither.**

#### 207.4 Test matrix (minimum)

| # | Scenario | Expected |
| --- | --- | --- |
| T1 | Settlement → `COMPLETED` | Exactly **one** `customer.fulfilment.completed` outbox row |
| T2 | Repeated settlement / retry / duplicate confirm | Still **one** row (idempotency key) |
| T3 | Settlement → `PARTIALLY_COMPLETED` | **No** outbox row |
| T4 | Settlement → `DISPUTED` | **No** outbox row |
| T5 | Partner `submit_completion` only → `COMPLETION_SUBMITTED` | **No** outbox row |
| T6 | Handler dispatch | `request_notification` for `booking.completed` invoked **once** per event |
| T7 | Transaction coupling | After successful settle commit: `COMPLETED` **and** outbox row both visible |
| T8 | Rollback | Force settlement failure mid-transaction: booking **not** `COMPLETED`, outbox row **absent** |
| T9 | `completed_at` in payload | Equals `BookingStatusHistory.created_at` for the `COMPLETED` transition — never partner `submitted_at` or ad-hoc `now()` |
| T10 | `event_version` in payload | Always `1`; handler validates version before processing |

T7/T8 are the transactional-boundary tests — prefer exercising `_settle_submission()` (or its
caller) inside `transaction.atomic()` with a deliberate failure after enqueue, or use
`CaptureQueriesContext` / `assertNumQueries` patterns only as helpers; the assertion is always
**paired commit state**, not isolated `exists()` checks.

#### 207.5 Explicitly out of scope for M3-BE-207

- Wallet / coin / referral Django models and migrations
- `CustomerCompletion` model (C2 — `M3-BE-224`)
- Checkout wallet or coin burn
- `customer.engagement.completed` (M2 path)
- Generic `customer.*.completed` abstraction
- Operations loyalty CRUD
- HTTP endpoints

---

## 4. Checkout integration (ADR-0003 compliant)

### 4.1 Payment attempt creation (extended)

Customer sends (server validates everything):

```json
{
  "checkout_id": "...",
  "wallet_amount_paise": 0,
  "coin_burn_amount": 0,
  "idempotency_key": "..."
}
```

Server response includes:

- `razorpay_amount_paise` — remainder after wallet + coin burn
- `wallet_reserved_paise`, `coins_burned`, `coin_discount_paise`
- `allocations[]` — unchanged shape; total funded = full order

### 4.2 Failure paths & refunds

| Event | Wallet | Razorpay | Coins |
| --- | --- | --- | --- |
| Payment attempt expires | Release reservation | — | Release burn reservation |
| Payment fails | Release | — | Release |
| **Refund after capture** | **Credit wallet** for wallet-funded share | **Provider refund** for card/UPI share | **No restore** — burned coins stay burned |
| Partial refund | Per `RefundAllocation` split by original funding source | Same | Coins never re-minted |

Refund routing follows how the order was paid. Example: ₹500 order paid as ₹200 wallet + 100 coins (₹100 discount) + ₹300 Razorpay → refund returns ₹200 to wallet and ₹300 via Razorpay; coins are not returned.

### 4.3 Purposes

Add to `PaymentAttempt.Purpose` (planning):

- `WALLET_TOP_UP`

Checkout continues to use `BOOKING_GROUP` and existing M2 purposes; wallet/coins are **modifiers** on the same attempt, not separate orders.

---

## 5. Operations configuration (admin)

All marketing levers live in Operations — **no hard-coded percentages in frontend**.

| Screen (planning) | Actions |
| --- | --- |
| **Coin grant rules** | CRUD rules; set amount, unlock completions, expiry, trigger, schedule |
| **Coin burn policy** | Set max % and coin value; effective dating; preview on sample order |
| **Wallet top-up policy** | Set min/max top-up in paise; effective dating |
| **Referral programs** | New version; set referrer/referee rewards; qualifying event; effective_from |
| **Referral attributions** | Read-only queue; fraud mark; manual qualify/deny with reason |
| **Wallet liability** | Sum of customer balances; top-ups vs debits report |
| **Adjustments** | Maker-checker wallet/coin adjustments with reason |

---

## 6. Customer & Partner UX (planning)

### Customer

| Surface | Behaviour |
| --- | --- |
| Signup | `?ref=` **auto-fills** referral field; attribution on OTP signup; show **promised coins** from active rules |
| Account → Wallet | Balance, top-up (shows configured min/max), transaction history |
| Account → Coins | Promised / locked / spendable / expiring buckets |
| Account → Referral | My code, **copy link**, pending vs earned rewards (no “enter code” — signup only) |
| Checkout | Toggle use wallet; toggle use coins; server shows cap (“Max 30% of this order”) |

### Partner

No customer wallet or coin surfaces on Partner app in Phase C unless a future rule pays partners in coins (default: **no**).

---

## 7. API proposals (write before implementation)

Create under `contracts/proposals/`:

| Proposal | Endpoints (draft) |
| --- | --- |
| `00XX-customer-wallet.md` | `GET /customer/wallet/`, `POST /customer/wallet/top-up/`, transactions list |
| `00XX-customer-coins.md` | `GET /customer/coins/`, checkout burn preview |
| `00XX-customer-referral.md` | `GET /customer/referral/` (code + share URL); attribution at signup via `ref` param |
| `00XX-operations-loyalty.md` | CRUD grant rules, burn policy, referral program versions |
| Extend payment attempt | `wallet_amount_paise`, `coin_burn_amount` on create |

---

## 8. Phased build (Phase C detail)

### Wave C0 — ADR + proposals + schema

- [ ] ADR-0010 customer wallet & loyalty scope
- [ ] Contract proposals reviewed by owner
- [ ] Django models + migrations (wallet, coins, referral)
- [ ] Plan `apps/loyalty/` module (or `apps/commerce/loyalty/`) for coins + referral commands
- [ ] No HTTP until proposals approved

### Wave C0b — M1 completion outbox hook (`M3-BE-207`; no wallet/coin models)

- [ ] `apps/loyalty/` minimal scaffold (`handlers.py`, `services/completion.py`, `referral.py`, `notifications.py`)
- [ ] Emit `customer.fulfilment.completed` from `_settle_submission()` when `to_status == COMPLETED` only
- [ ] Idempotency key exactly `customer-fulfilment-completed:{booking_id}`
- [ ] Orchestrator handler — services only, no inline business logic
- [ ] `record_completion_for_customer` boundary (stub until C2); `evaluate_referral_qualification` stub until C4
- [ ] `notify_booking_completed` — real `booking.completed` notification wiring
- [ ] Tests T1–T10 (§3.5 / 207.4): including transactional commit/rollback invariant

### Wave C1 — Wallet core

- [ ] `credit_wallet`, `reserve_wallet`, `capture_wallet`, `release_wallet` commands
- [ ] `WALLET_TOP_UP` payment flow
- [ ] Customer wallet read API
- [ ] Operations liability report (read-only)

### Wave C2 — Coin rules engine

- [ ] `CoinGrantRule` + `CoinBurnPolicy` Operations CRUD
- [ ] Grant on signup (promised + locked)
- [ ] `CustomerCompletion` model + `UNIQUE(customer_id, source_type, source_id)` (§3.4)
- [ ] `record_completion_for_customer` — real `get_or_create`; **no** mutable counter column
- [ ] Unlock on booking completion (configurable N) — driven by `CustomerCompletion` count
- [ ] Expiry sweep task
- [ ] Customer coins read API

### Wave C3 — Checkout integration

- [ ] Extend payment attempt for wallet + coin burn
- [ ] Checkout preview endpoint (max burn, spendable)
- [ ] Customer payment UI (`payment-workspace.tsx` pattern)
- [ ] Refund-to-wallet path

### Wave C4 — Referral

- [ ] Program versioning + attribution snapshot
- [ ] Apply referral at **signup only** (`?ref=` auto-fill → attribution on account create)
- [ ] Qualify on first completed booking (configurable event hook)
- [ ] Issue rewards per snapshotted version
- [ ] Customer referral page

### Wave C5 — Hardening

- [ ] Idempotency + concurrency tests (owner runs)
- [ ] Fraud: self-referral, duplicate device (minimum rules)
- [ ] `docs/runbooks/m3-wallet-coins-referral-smoke.md`
- [ ] M3 Phase C acceptance scenarios (below)

---

## 9. Acceptance scenarios (Phase C gate)

| # | Scenario |
| --- | --- |
| C-01 | Top-up ₹500 via Razorpay → wallet balance +500 |
| C-02 | Order ₹1000, burn policy 30%, coin value 10p → max burn ₹300 |
| C-03 | Signup shows 500 promised coins, 0 spendable until 1st completion |
| C-04 | Rule requires 3 completions → unlocks only after third |
| C-05 | Festival coins expire; evergreen coins do not |
| C-06 | Referrer ₹100 under v1; program changes to ₹200; v1 attribution still pays ₹100 |
| C-07 | Both sides rewarded when configured |
| C-08 | Checkout: ₹200 wallet + ₹300 Razorpay + allocations sum to ₹500 |
| C-09 | Failed payment releases wallet reservation |
| C-10 | Operations adjustment appears in audit trail |
| C-11 | `?ref=CODE` on signup URL auto-fills referral; attribution after OTP signup |
| C-12 | Refund restores wallet + Razorpay portions; burned coins not restored |
| C-13 | Top-up below min or above max rejected per Operations policy |
| C-14 | `COMPLETED` booking enqueues exactly one `customer.fulfilment.completed` outbox event |
| C-15 | Replay of confirm/auto-finalize does not double-enqueue (idempotency key) |
| C-16 | `PARTIALLY_COMPLETED` / `DISPUTED` / `COMPLETION_SUBMITTED` do **not** enqueue |
| C-17 | Committed settle: `COMPLETED` status and outbox row appear together |
| C-18 | Rolled-back settle: neither `COMPLETED` nor outbox row remains |
| C-19 | Handler dispatches `booking.completed` notification once per event |
| C-20 | Outbox `completed_at` equals `BookingStatusHistory.created_at` for the `COMPLETED` transition |
| C-21 | (C2) Outbox retry cannot insert duplicate `CustomerCompletion` — `(customer_id, source_type, source_id)` unique |
| C-22 | (C2) Coin unlock runs only when `get_or_create` returns `created=True` |
| C-23 | Payload includes `event_version: 1` |

---

## 10. Decisions log & remaining questions

### Resolved (owner, 2026-09-01)

| ID | Decision |
| --- | --- |
| **OQ-02** | Referral **signup only**; unique code + share link; `?ref=` auto-fills signup form |
| **OQ-03** | Refund restores **wallet + Razorpay**; **does not** restore burned coins |
| **OQ-04** | Wallet top-up **min/max configurable** in Operations |

### Still open — need your call

| ID | Plain English | Options |
| --- | --- | --- |
| **OQ-01** | **When a customer spends coins at checkout, how many rupees is each coin worth?** | **A)** One platform-wide rate in Operations (e.g. 1 coin = ₹0.10 everywhere). **B)** Each campaign sets its own rate when coins are granted (Diwali coins worth more than signup coins). *Planning default: A — simpler; pick B only if you need different coin “brands”.* |
| **OQ-05** | **Do you want automatic “cashback” (e.g. “5% back on every booking”) in M3?** | `milestones.md` lists **Wallet, V Coins, Referral** — not cashback. An old design doc mentioned cashback separately. **Defer** = skip for M3; **Include** = add cashback rules engine (extra scope). *Planning default: defer unless you add it to the commercial milestone.* |

---

## 11. Testing note

Per `AGENTS.md`, agents **write** tests; owner **runs** them. Every wave above lists test files in
`task.md` when implementation starts.
