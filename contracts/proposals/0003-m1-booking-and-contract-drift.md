# Proposal 0003 — M1 booking operations, and drift in published v1.2.0

**Status:** Proposed
**Raised by:** Claude (frontend)
**Supersedes:** [0002 — Booking workspace](./0002-booking-workspace.md)
**Affects:** new operations, **and a breaking revision to three schemas already published in v1.2.0**
**Consuming screen:** `/book/[service]` — customer booking workspace ([M1 F2](../../Django_Next.js_Plan/M1/03-frontend-tasks.md))

## Why 0002 is withdrawn

Proposal 0002 requested a provider-selection endpoint (*"eligible Partners, top four plus Auto
Assign"*), a provider-specific capacity hold, and an Instant eligible-pool pre-check. The
authoritative plan adopted on 31 July 2026 forbids all three at M1:

| 0002 asked for | Plan says | Reference |
|---|---|---|
| `POST /booking/providers/` — top four + Auto Assign | *"There is no Customer provider-list endpoint."* | [07 §Cart, quote and checkout](../../Django_Next.js_Plan/07-api-events-and-operations.md), ADR-014 |
| Provider-specific capacity hold before payment | Capacity is a `PartnerReservation` created by **Partner acceptance**, not by customer selection | ADR-013, [04 §Scheduled and Today assignment](../../Django_Next.js_Plan/04-availability-assignment-and-dispatch.md) |
| `POST /booking/instant/precheck/` | Instant is M4, gated on pool size, acceptance latency and background delivery | ADR-018, [09 §M4](../../Django_Next.js_Plan/09-delivery-roadmap.md) |

The frontend has deleted `features/booking/adapters/providers.ts`, `adapters/precheck.ts` and the
corresponding stages. Nothing needs to be built for them.

## The M1 ordering change

0002 assumed *choose a Partner → hold their slot → pay*. M1 inverts this: the customer's quote is
accepted first, then the platform obtains an **informed Partner acceptance**, and only then does the
customer pay ([01-scope-and-flow §Customer journey](../../Django_Next.js_Plan/M1/01-scope-and-flow.md),
ADR-012).

```text
address → scope → window → quote + cancellation policy → login
        → FINDING_PARTNER → PARTNER_COMMITTED → PAYMENT_PENDING → COMPLETED
```

This is the single most consequential difference: **payment is not reachable until a Partner has
committed**, and the customer sees a bounded, cancellable search in between.

---

## Part A — Drift in schemas already published in v1.2.0

These are published, so changing them is a breaking contract revision, not a new operation. Raising
them here because the frontend cannot build a correct A1 scope stage against the current shapes.

### A1. `ServiceVariantConfiguration.pricing_strategy` does not express the archetype

Published today:

```yaml
PricingStrategyEnum: [FIXED, DURATION, INSPECTION]
```

ADR-006 makes `fulfilment_archetype` the sole lifecycle discriminator, with ten values
(`A1_TASK_VISIT` … `A10_LISTING`). `pricing_strategy` is a different axis and does not map:
`DURATION` is A3 semantics, `INSPECTION` is A2, and neither is available at M1.

**Requested:** publish `fulfilment_archetype` on the variant. M1 activates only `A1_TASK_VISIT`, so
the enum may ship with one member and grow per milestone — ADR-029 explicitly prefers that over
speculative values.

### A2. Duration is published as a customer input; under A1 it is a derived estimate

Published today: `minimum_duration_minutes`, `maximum_duration_minutes`,
`duration_increment_minutes`, `recommended_duration_minutes`.

That shape only makes sense if the customer buys time. ADR-008 says the opposite for A1: *"A1 is
task-priced; duration is capacity estimate"*, and
[03 §A1](../../Django_Next.js_Plan/03-lifecycle-and-state-machines.md) adds that `estimated_minutes`
*"reserves capacity but does not change price"*.

The frontend currently renders a duration **picker**. Under A1 that control must not exist — it
would let the customer change a number that does not affect what they pay and cannot affect what the
Partner is asked to do.

**Requested:** for `A1_TASK_VISIT`, replace the four fields with a single server-derived
`estimated_duration_minutes` on the quote, computed from the selected task lines' marginal durations.
Keep the existing four fields available for A3 when M3 introduces it.

### A3. No task-line concept exists in the catalog

[05 §A1](../../Django_Next.js_Plan/05-pricing-payments-and-settlement.md) defines `TaskRate` — task
code, unit price, estimated marginal minutes, effective dates — and requires the minimum visit charge
to be visible from the catalog onward. v1.2.0 publishes only a scalar `starting_price`, which cannot
express *"₹199 minimum, or the task total if greater"*.

The six frozen M1 variants
([05-initial-configuration](../../Django_Next.js_Plan/M1/05-initial-configuration.md)) each carry a
unit price and a marginal duration. The frontend needs those as line-selectable items, not as one
"from" price.

**Requested:** publish task rates on the variant configuration, plus the minimum service subtotal, so
the scope stage can compose a quote request from real task codes.

---

## Part B — New operations for M1

Shapes below are a request, not an assumption. Where the domain model differs, the frontend adapter
absorbs it; the ask is only that something answers the same question.

### B1. Scheduled and Today windows

```text
POST /api/v1/booking/windows/
```

M1 sells 60-minute arrival windows: Today requires 120 minutes lead time, Scheduled runs up to 7
calendar days ahead, inside 08:00–20:00 area hours. One endpoint serves both — they are the same
product, differing only in how far ahead they start.

**Request**

```yaml
service_variant_id: 8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83
address_id: 77777777-7777-4777-8777-777777777777
task_lines:
  - { task_code: fan-installation, quantity: 1 }
```

**Response**

```yaml
server_now: "2026-08-03T09:14:22Z"
estimated_duration_minutes: 60
days:
  - date: "2026-08-03"
    is_today: true
    windows:
      - id: w_01J...              # opaque; never composed client-side
        starts_at: "2026-08-03T12:00:00Z"
        ends_at: "2026-08-03T13:00:00Z"
        is_available: true
      - id: w_01J...
        starts_at: "2026-08-03T10:00:00Z"
        ends_at: "2026-08-03T11:00:00Z"
        is_available: false
        unavailable_reason: TOO_SOON      # 120-minute Today lead time
```

`unavailable_reason` ∈ `TOO_SOON | OUTSIDE_OPERATING_WINDOW | PAST | NO_CAPACITY`. Unavailable
windows are returned and shown disabled rather than hidden, so "why can't I book 10am" has an answer
on screen.

**Note this is not a capacity promise.** Per
[04 §Availability search](../../Django_Next.js_Plan/04-availability-assignment-and-dispatch.md),
display results may be cached and only offer/reservation creation is authoritative. The response
should say so, and the frontend will treat a later `WINDOW_NO_LONGER_AVAILABLE` as normal, not as an
error state.

### B2. Quote

```text
POST /api/v1/quotes/
```

Every amount in integer paise, server-calculated, immutable, versioned
([05 §Pricing principles](../../Django_Next.js_Plan/05-pricing-payments-and-settlement.md)).

**Response**

```yaml
id: q_01J...
version: 1
expires_at: "2026-08-03T09:29:22Z"
server_now: "2026-08-03T09:14:22Z"
estimated_duration_minutes: 60
lines:
  - { code: task.fan-installation, label: "Fan installation × 1", amount: { amount_paise: 24900, currency: INR } }
  - { code: minimum_visit_topup,   label: "Minimum visit charge",  amount: { amount_paise: 0,     currency: INR } }
subtotal:     { amount_paise: 24900, currency: INR }
platform_fee: { label: "Platform fee", amount: { amount_paise: 0, currency: INR } }
tax:          { label: "GST",          amount: { amount_paise: 4482, currency: INR } }
total:        { amount_paise: 29382, currency: INR }
cancellation_policy:
  policy_version: "m1-2026-07-31"
  bands:
    - { code: GT_24H,          condition_text: "More than 24 hours before your window",  fee: { amount_paise: 0,     currency: INR } }
    - { code: LT_24H_GT_2H,    condition_text: "24 to 2 hours before your window",       fee: { amount_paise: 4900,  currency: INR } }
    - { code: LT_2H,           condition_text: "Less than 2 hours before your window",   fee: { amount_paise: 9900,  currency: INR } }
    - { code: AFTER_ARRIVAL,   condition_text: "After the professional has arrived",     fee: { amount_paise: 14900, currency: INR } }
```

`condition_text` is server-authored. The frontend must not compose policy language, and must not
derive band amounts from percentages.

**Open question for the backend — free-cancellation grace.** The frozen ladder has no grace period,
and a Today booking is created at the 2-hour boundary. A customer who books Today and cancels sixty
seconds later by mistake currently owes ₹99. If a grace band is added, it belongs here as a band with
its own `condition_text`, not as frontend special-casing.

### B3. Checkout session and the Partner search

```text
POST /api/v1/checkout-sessions/
GET  /api/v1/checkout-sessions/{reference}/
POST /api/v1/checkout-sessions/{reference}/find-partner/
POST /api/v1/checkout-sessions/{reference}/cancel/
POST /api/v1/checkout-sessions/{reference}/payments/
```

The state the frontend renders:

```yaml
reference: cs_01J...
status: FINDING_PARTNER    # CREATED|FINDING_PARTNER|PARTNER_COMMITTED|PAYMENT_PENDING|COMPLETED|EXPIRED|FAILED|CANCELLED
server_now: "2026-08-03T09:15:02Z"
search_deadline_at: "2026-08-03T09:17:22Z"   # whole-search 180s
partner: null                                 # populated only at PARTNER_COMMITTED
payment_enabled_at: null                      # undo window end; null until committed
reservation_expires_at: null                  # payment window 5min
no_partner_alternatives: []
```

Requirements the frontend depends on:

1. **Every deadline is an absolute server timestamp**, per
   [05-initial-configuration](../../Django_Next.js_Plan/M1/05-initial-configuration.md). The frontend
   calibrates against `server_now` via `ServerClock` and never counts down from a local clock.
2. **`partner` stays null until disclosure is permitted.** During `FINDING_PARTNER` the customer must
   not learn who is being offered — an offer is not a commitment, and a declined offer must not leak
   a name.
3. **`payment_enabled_at` is authoritative.** The pay action is disabled until it passes, and
   disabled again within the 30-second payment-start safety margin of `reservation_expires_at`.
4. **Cancel is available throughout the search and costs nothing.**
5. When the pool is exhausted, `status` becomes `FAILED` with honest `no_partner_alternatives` — not
   an empty success.

**Polling.** Until a real-time transport exists the frontend polls this endpoint on a bounded
interval during `FINDING_PARTNER`. Per
[01 §Frontend runtime](../../Django_Next.js_Plan/01-platform-architecture.md), browser activity must
never drive dispatch or expiry — a closed tab must not stop the search, and reopening must recover
full state from this endpoint alone.

### B4. Cart

```text
GET    /api/v1/cart/
POST   /api/v1/cart/items/
PATCH  /api/v1/cart/items/{id}/
DELETE /api/v1/cart/items/{id}/
PUT    /api/v1/cart/items/{id}/scope/
```

M1 restricts this to one item ([M1 B5](../../Django_Next.js_Plan/M1/02-backend-tasks.md)). The
frontend requests that a second `POST /cart/items/` return a stable
`409 CART_ITEM_LIMIT_REACHED` rather than silently replacing the existing item, so the customer is
told what happened to the thing they configured.

**Frontend question for the plan owners, not the backend:** M1 B5 implements a `Cart`, but F2
describes only a booking workspace and never a cart screen. The frontend is currently building
**no `/cart` route** — the cart is backend continuity for login-resume, not a customer surface.
Confirm before B4 is implemented, because a cart with a one-item cap and no UI needs no list
endpoint.

---

---

## Part C — Operations cannot find what it is allowed to act on

v1.2.0 publishes both Operations partner commands:

```text
POST /api/v1/operations/partner-applications/{application_id}/transition/
POST /api/v1/operations/partner-documents/{document_id}/review/
```

It publishes no way to **read** an application, and no way to list them. A reviewer can therefore act
on an application whose UUID they already have, and cannot discover the queue they are meant to work
through. The Operations review screen (F6) is unbuildable past the action buttons without:

```text
GET /api/v1/operations/partner-applications/            # filterable queue
GET /api/v1/operations/partner-applications/{id}/       # one application, with documents
```

The queue needs at minimum: filter by `status`, cursor pagination, and oldest-submitted-first
ordering — an onboarding queue worked newest-first strands the people who have waited longest.

This is the M1 launch path, not a nice-to-have: activation requires **at least three approved,
eligible Partners per active category and area**
([05-initial-configuration](../../Django_Next.js_Plan/M1/05-initial-configuration.md)) — nine
approvals for the three M1 trades — and none of them can happen through a UI that cannot list a
pending application.

Signed short-lived URLs for reviewing KYC media are also unpublished. Documents carry `object_key`
and `sha256` but nothing a reviewer can open, and
[08 §Files](../../Django_Next.js_Plan/08-security-quality-and-production.md) requires private storage
with short-lived signed access and an access audit — so this is a backend-issued URL, not a bucket
path the frontend composes.

---

## Errors

All operations use the published `ApiError` envelope with `retryable` (added in v1.2.0). Codes the
frontend maps to specific recovery:

| Code | Where | Recovery shown |
|---|---|---|
| `WINDOW_NO_LONGER_AVAILABLE` | checkout create | Refresh windows, reselect; nothing charged |
| `QUOTE_EXPIRED` | checkout create, payment | Requote and show the difference before continuing |
| `NO_PARTNER_AVAILABLE` | find-partner | Alternatives; explicitly "you have not been charged" |
| `PAYMENT_WINDOW_CLOSED` | payments | Reservation released; restart search |
| `CART_ITEM_LIMIT_REACHED` | cart items | Name the existing item; offer replace or keep |

## What the frontend commits to meanwhile

Unchanged from 0002's discipline, and it worked: proposed shapes live only in
`web/apps/customer/features/booking/contract-pending/`, reach components only through
`../adapters/`, and `boundary.test.ts` fails the build if a view imports one. On publication the
integration is: regenerate the client, rewrite the adapters, delete the quarantine. No component and
no component test changes.

Query keys for unpublished operations stay in the quarantine, not in `@vsolve/query`'s `keys.ts`,
whose header states that keys exist only for published endpoints.
