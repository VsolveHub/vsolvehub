# VSolveHub Booking Engine — Design Spec

**Date:** 2026-07-19
**Scope:** Customer app (`web/apps/customer`), shared DB package (`web/packages/db`)
**Applies to:** The four Phase-1 dispatch categories — Technician, Beauty & Wellness, Home Services, Pet Services (all archetype `A`)

---

## 1. Problem

Today a customer books exactly one service at a fixed catalog price, pays *after* a
provider accepts, and each category has its own tracker component. Three gaps:

1. **One service per visit.** A customer wanting AC repair *and* a salon visit must run
   the flow twice, with two separate payments and two unrelated trackers.
2. **Fixed prices are a lie.** A "kitchen pest control" is not one price — it depends on
   area, number of bathrooms, and add-ons. The catalog needs a *"starts at"* price and
   a requirement configurator that resolves it to an exact quote.
3. **Payment happens too late.** Pay-after-accept means a provider can accept a job the
   customer never funds, and there is no way to hold money across a multi-service cart.

## 2. Goals / Non-goals

**Goals**
- One cart holding N services, one payment authorization, independent per-service dispatch.
- "Starts at ₹X" catalog pricing that resolves to an exact quote via requirement selection.
- Per-service slot + address selection, chosen in a single guided sheet at checkout.
- A single unified tracker replacing the four themed ones.
- Production hardening: idempotency, concurrency safety, stale-cart revalidation, audit trail.

**Non-goals (deliberately deferred)**
- Map tiles / live map rendering. The *data* (provider coords + ETA) lands now; the map is
  a later UI upgrade with zero schema change.
- WebSockets/SSE. Polling matches the existing 4s poller and is sufficient for MVP.
- Admin CMS for requirement options. Options live in TypeScript config; see §5.4 for why
  this costs nothing to migrate later.
- Rides (Rapido-style) and Accommodation. They slot into this same spine; see §11.

## 3. Key decisions

### 3.1 Order is the money envelope; the cart is draft Bookings

No `Cart`/`CartItem` tables. The cart is literally:

```sql
SELECT * FROM "Booking" WHERE "userId" = :me AND status = 'DRAFT'
```

`Booking` remains the unit of work (one service, one provider, one job). `Order` exists for
exactly one reason: **a single gateway authorization covers the whole cart total, and one
hold must live in exactly one row.** Without it we would copy the same gateway auth id onto
N bookings — that is the real duplication — and "how much of this order is authorized vs.
captured vs. voided" becomes unanswerable.

```
Cart      = Booking[] WHERE status = DRAFT               ← zero new tables
Checkout  = 1 Order (authorize ₹total) + Bookings → AUTHORIZED
Dispatch  = each Booking fans out to its own provider pool
Capture   = per Booking on accept; Order rolls up captured/voided
```

**Net new schema: one table (`Order`) plus columns on `Booking`.**

### 3.2 Status vocabulary is preserved, not renamed

The original sketch proposed renaming statuses (`EN_ROUTE`, `IN_PROGRESS`, `NO_PROVIDER`).
**Rejected.** The existing names are load-bearing in the partner app, the shared
fulfillment engine (`packages/db/src/fulfillment.ts`), `lib/constants.ts`, and every tracker.
Renaming buys nothing and risks a cross-app regression.

We convert `Booking.status` from `String` to a Prisma enum using the **existing names**, and
add only the two genuinely new states:

```prisma
enum JobStatus {
  DRAFT              // NEW — in cart, not yet paid
  AUTHORIZED         // NEW — hold placed, not yet dispatched
  PENDING
  SEARCHING_PROVIDER
  ASSIGNED
  PROVIDER_ARRIVING
  STARTED
  COMPLETED
  CANCELLED
  NO_WORKER_FOUND
}
```

The enum gives DB-level integrity; the preserved names mean the partner app compiles
untouched. Legacy rows are backfilled (§6.2).

### 3.3 Payment moves from after-accept to authorize-at-checkout

`markPartnerArriving` and `startJob` already gate on `paymentStatus ∈ {PAID, COD}`. Under
the new model capture happens *on accept*, so `paymentStatus` is `PAID` by the time a
partner can move — **those gates keep working unchanged.** The partner app needs no edit.

### 3.4 Gateway semantics are the adapter's problem, not the engine's

The original plan leaned on "card holds last 7 days, so authorize at checkout is always
valid." This is optimistic for the Indian market: Razorpay card auths are typically
capturable for ~5 days, and **plain UPI has no hold at all** — it captures immediately.

The engine therefore speaks only four verbs against a `PaymentGateway` interface —
`authorize`, `capture`, `void`, `refund`. The *adapter* decides what each means:

| Method | `authorize` | `void` |
|---|---|---|
| Card | real auth hold | void the hold |
| UPI / wallet | capture immediately | refund |
| COD | no-op, `COD_PENDING` | no-op |

`PaymentState` already models both paths. The 7-day booking window stays as a **product**
rule (enforced in Zod + a DB check), but no correctness depends on a 7-day gateway hold.

### 3.5 "Starts at" pricing is estimated in the UI, exact in the math

Selecting requirements makes the price deterministic — "2 Bathrooms & kitchen" *is* ₹1,198.
On-site surprises already have a home in the existing revised-quote path. So the UI says
"estimate" while the arithmetic is exact, which is what lets us authorize a precise amount.

`estimatePrice()` is a **pure function** run in three places:
1. Live in the configurator footer as the customer taps.
2. Server-side at add-to-cart — the client's number is never trusted.
3. Again at checkout, to catch catalog drift (edge case 7).

## 4. Data model

### 4.1 New: `Order`

```prisma
enum OrderStatus {
  DRAFT              // the cart
  PENDING_PAYMENT    // checkout started, authorization not confirmed
  AUTHORIZED         // hold placed; jobs dispatching
  PARTIALLY_SETTLED  // some jobs terminal, others live
  SETTLED            // all jobs terminal, money reconciled
  CANCELLED
}

enum PaymentState {
  NONE
  AUTHORIZED
  PARTIALLY_CAPTURED
  CAPTURED
  VOIDED
  REFUNDED
  COD_PENDING
}

model Order {
  id              String       @id @default(cuid())
  orderRef        String       @unique
  userId          String
  status          OrderStatus  @default(DRAFT)
  paymentState    PaymentState @default(NONE)
  paymentMethod   String?
  gatewayIntentId String?
  idempotencyKey  String?      @unique   // guards double-checkout
  authorizedPaise Int          @default(0)
  capturedPaise   Int          @default(0)
  voidedPaise     Int          @default(0)
  refundedPaise   Int          @default(0)
  authorizedAt    DateTime?
  authExpiresAt   DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  user     User      @relation(fields: [userId], references: [id])
  bookings Booking[]

  @@index([userId, status])
}
```

**Money invariant (asserted in code, checked in tests):**
`capturedPaise + voidedPaise ≤ authorizedPaise` and `refundedPaise ≤ capturedPaise`.

### 4.2 `Booking` additions

| Column | Type | Purpose |
|---|---|---|
| `orderId` | `String?` | FK to `Order`; null for legacy single bookings |
| `status` | `JobStatus` | was `String` |
| `lineItems` | `String` (JSON) | price snapshot — see §5.3 |
| `capturedPaise` | `Int @default(0)` | captured for this job |
| `providerLat` / `providerLng` | `Float?` | live tracking |
| `providerLocatedAt` | `DateTime?` | staleness check |
| `etaMinutes` | `Int?` | live ETA |

Existing `quotedAmount` becomes the configurator total — no new price column.

### 4.3 `Service` reinterpretation

`Service.pricePaise` becomes the **"Starts at"** price = the cheapest variant. No column
change; a data pass sets it from each service's config, and a comment records the meaning.

## 5. Pricing configurator

### 5.1 Where options live

`lib/catalog/service-config.ts` already resolves layered config (service slug →
sub-category → category) and already drives the details step's `select` / `counter` /
`text` fields. Pricing is a **superset** of those field types, not a rewrite.

### 5.2 Field types

```ts
type PricedDetailField =
  // Sets the base price. Exactly one per service; required.
  | { type: "variant"; key; label; options: { value: string; pricePaise: number; description?: string }[] }
  // Existing select, optionally with a price delta per option.
  | { type: "select";  key; label; options: { value: string; priceDeltaPaise?: number }[]; ... }
  // Quantity × unit price.
  | { type: "counter"; key; label; perUnitPaise?: number; min?; max?; ... }
  // Multi-select add-ons, each additive.
  | { type: "addons";  key; label; options: { value: string; pricePaise: number; description?: string }[] }
  // Unpriced free text, as today.
  | { type: "text";    key; label; ... }
```

`estimatePrice(fields, selections) → { basePaise, addOnsPaise, totalPaise, lineItems[] }`
is pure, total (never throws on unknown keys), and lives in
`lib/catalog/pricing.ts` with unit tests.

### 5.3 The `lineItems` snapshot

At add-to-cart the server recomputes the price and **snapshots** the result onto the
booking:

```json
[{ "label": "Select area", "value": "2 Bathrooms & kitchen", "qty": 1,
   "unitPaise": 119800, "totalPaise": 119800, "kind": "variant" }]
```

A later catalog price change never silently mutates a live cart — checkout revalidation
surfaces it as a diff the customer must accept.

### 5.4 Why TS config now, DB tables later is free

Because the price is snapshotted onto the booking, all payment and booking code reads
`lineItems` / `quotedAmount`, never the catalog. Moving options into DB tables for an admin
CMS later changes only the *source* of `estimatePrice`'s input — zero booking or payment
code changes. Building option tables today would be speculative schema.

## 6. Migration strategy

### 6.1 Ordering (each step independently deployable)

1. Add `Order`, `OrderStatus`, `PaymentState`, and all new `Booking` columns as **nullable /
   defaulted**. Nothing reads them yet.
2. Backfill `Booking.status` legacy values (§6.2) **while still `String`**.
3. Convert `Booking.status` to `JobStatus` via `USING status::"JobStatus"`.
4. Add the partial index and the 7-day check constraint.

### 6.2 Legacy status backfill

| Legacy value | Becomes |
|---|---|
| `REQUESTED` | `PENDING` |
| `SEARCHING` | `SEARCHING_PROVIDER` |
| `ACCEPTED` | `ASSIGNED` |
| `ON_THE_WAY`, `ARRIVED` | `PROVIDER_ARRIVING` |
| `IN_PROGRESS` | `STARTED` |

Any unrecognised value → `PENDING`, logged. The migration **fails loudly** if unmapped
values remain, rather than silently coercing.

### 6.3 DB-level guards

```sql
-- A user may hold at most one open order at a time.
CREATE UNIQUE INDEX order_one_open_per_user ON "Order"("userId")
  WHERE status IN ('DRAFT','PENDING_PAYMENT');

-- Bookings must be scheduled inside the 7-day window.
ALTER TABLE "Booking" ADD CONSTRAINT booking_slot_within_window
  CHECK (slot <= "createdAt" + INTERVAL '7 days' + INTERVAL '1 day');
```

## 7. DRAFT containment (the biggest practical risk)

The moment carts are `Booking WHERE status='DRAFT'`, every existing query that reads
bookings will surface cart items as real bookings. Confirmed leak sites:

- `lib/bookings/queries.ts` → `getUserBookings`
- `lib/bookings/user-bookings.ts` → `getAllUserBookings`, `getUserBookingCount`
- `lib/fulfillment/push-dispatch.ts` → dispatch entry points
- `packages/db/src/fulfillment.ts` → partner offer/active/history read models
- Admin booking lists

This is fixed **structurally, not by vigilance**:

1. A single exported `ACTIVE_BOOKING_WHERE = { status: { notIn: ["DRAFT"] } }` in
   `packages/db`, used by every list/count/dispatch query.
2. `dispatchBookingOffers` and `dispatchDirectOffer` hard-refuse a `DRAFT` or
   `PENDING_PAYMENT` booking — a defensive assert, not a filter.
3. A test that asserts a DRAFT booking appears in **no** customer-facing list and in **no**
   partner feed.

## 8. Checkout flow

```
Cart (N draft bookings)
  └─ "Schedule your services" sheet
       ├─ service 1 → date × time grid → (optional) address override
       ├─ service 2 → …
       └─ Continue enabled only when every service has a slot
  └─ Review: per-service line items + order total
  └─ Pay
       ├─ revalidate every draft booking (price, availability, slot, address)   [edge 7]
       ├─ create/reuse Order by idempotency key                                 [edge 8]
       ├─ gateway.authorize(total)
       │    ├─ declined → Order stays PENDING_PAYMENT, cart intact, no dispatch [edge 9]
       │    └─ ok → Order AUTHORIZED, all bookings DRAFT → AUTHORIZED
       └─ fan-out: each booking dispatches to its own pool independently
```

### 8.1 The slot sheet

```
┌─ Schedule your services ─────────────┐
│ ● Home — Kitchen cleaning    ✓ Tue 2pm│  ← done
│ ○ Beautician — Salon at home   Pick → │  ← tap to open grid
├──────────────────────────────────────┤
│ [date strip × time-slot grid]         │
├──────────────────────────────────────┤
│ Address: Home (default) · change      │
│ 1 of 2 scheduled          [Continue]  │
└──────────────────────────────────────┘
```

Slot and address are already per-`Booking` columns — this is pure UI, no schema change.
One default address applies to all services with a per-service override.

## 9. Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | No provider accepts | Void that job's share → `NO_WORKER_FOUND`; notify + offer retry. Charged ₹0. |
| 2 | Partial cart match | Capture matched, void unmatched → Order `PARTIALLY_SETTLED`. Pay only for fulfilled. |
| 3 | Provider accepts then no-shows | Re-dispatch on the same authorization; re-capture on new accept; void if pool exhausted. |
| 4 | Cancel before assignment | Void that job's share, ₹0. |
| 5 | Cancel after en route | Capture the ₹99 visit fee (existing `VISIT_FEE_PAISE`), void remainder. |
| 6 | Revised quote exceeds authorization | Incremental auth for the delta; customer approves; then capture. |
| 7 | Stale cart at checkout | Revalidate every draft booking; flag the changed item, keep the rest. |
| 8 | Double checkout / retry | Idempotency key on `Order` + partial unique index; re-POST returns the existing order. |
| 9 | Auth declined | Order stays `PENDING_PAYMENT`, no dispatch, cart intact. |
| 10 | Wallet / COD | Wallet debits at checkout, refunds to wallet on void. COD places no hold → `COD_PENDING`, settles on completion. |
| 11 | Concurrent accept | Existing first-to-accept transaction in `acceptJobOffer` already handles it; capture joins that transaction. |

## 10. Sequencing

| Phase | Scope | Ships value |
|---|---|---|
| 0 | `Order` + enums + `Booking` columns + backfill migration; `PaymentGateway` interface with per-method strategy (demo adapter). No UI change. | Foundation |
| 1 | Pricing configurator: priced field types, `estimatePrice()`, live footer total, "Starts at" on cards/detail, `lineItems` snapshot. | Yes — improves today's single-service flow immediately |
| 2 | Cart (DRAFT bookings + DRAFT-containment sweep), login-gated add-to-cart, slot sheet, checkout → authorize → fan-out → capture-on-accept. | The core feature |
| 3 | Unified `JobTracker` + `OrderTracker`, provider live location ping + ETA; delete the four themed trackers. | Yes |
| 4 | Edge-case hardening; delete dead flows (`ConstructionBookingFlow`, `PaymentSheet`, legacy pay route). | Hardening |

Phase 1 precedes the cart deliberately: add-to-cart needs a configured price to snapshot,
and the configurator improves the existing flow standalone.

## 11. Forward compatibility

A **ride** is a `Booking` with a live-tracking-heavy lifecycle. **Accommodation** is an
`Order` whose single job is a reservation captured upfront rather than on accept. Both
differ only in *when money is captured* — a `paymentTiming` discriminator on the order,
not a new engine.

## 12. Testing

- **Unit:** `estimatePrice` (every field type, empty selections, unknown keys, add-on
  combinatorics); the money invariant on `Order`.
- **Integration:** checkout idempotency (double POST → one order); partial fan-out
  (one accept + one exhaustion → `PARTIALLY_SETTLED` with correct captured/voided);
  auth decline leaves the cart intact.
- **Containment:** a DRAFT booking appears in no customer list, no partner feed, no
  dispatch wave.
- **Migration:** every legacy status value maps; unmapped values fail the migration.
