# Customer App — Direction Correction

**Date:** 2026-07-29
**Scope:** `web/apps/customer` (with the `@vsolve/db` seams it depends on)
**Status:** Design — awaiting approval. No implementation started.

---

## 1. Problem

The customer app is **breadth-complete and depth-hollow**: six verticals are
clickable and none of them can take a rupee.

The signed milestone plan ([milestones.md](../../../milestones.md)) states that no
category goes live on its own — all services launch together at Milestone 4 — and
names exactly four categories for Milestone 1: **Technician, Beautician, Home,
Pet**. The app has instead grown to 36 pages across six verticals. Vehicle is
contractually Milestone 4 (Rapido). Accommodation is Phase 2. Store is not in the
milestone plan at all.

Because nothing ships until everything ships, a half-built sixth vertical carries
**zero contractual value today**, while the missing production core blocks all
four categories that are actually due.

### 1.1 Evidence

| Finding | Location |
| --- | --- |
| Payments are an in-memory demo object. `setPaymentGateway()` is never called with a real client. State dies on restart. | `web/packages/db/src/payments.ts:154` |
| Payouts are a `TODO(prod)` stub. | `web/packages/db/src/payout.ts:31` |
| OTP is the fixed string `"1234"`, and `SHOW_OTP_ON_SCREEN=true` re-enables it in production — a total authentication bypass. | `web/apps/customer/lib/auth/session.ts:26` |
| SMS delivery is a comment, not code. | `web/apps/customer/lib/auth/session.ts:81` |
| Three status simulators advance bookings on a 12-second wall clock and **write the result to the production tables**. Vehicle and accommodation are ungated; services is gated by `isMarketplaceStatus`. | `lib/bookings/queries.ts:131`, `lib/vehicle/queries.ts:139`, `lib/accommodation/queries.ts:210` |
| ~450 lines of fake drivers, vendors and `placehold.co` properties sitting in `lib/`, imported by nothing. | `lib/{accommodation/property-seed-data,vehicle/seed-data,bookings/vendor-seed-data}.ts` |
| Wallet, V Coins, Referral and Cashback — all contracted — have zero presence across 1,125 lines of schema. | `web/packages/db/prisma/schema.prisma` |
| No CI, no ESLint, no Prettier anywhere in the repo. | — |
| No error tracking. The 2026-07-08 production incident was found by a user seeing a white screen. | — |
| 1 of 52 API routes has rate limiting. | `app/api/geocode/reverse/route.ts` |
| Catalog price and booking price come from unrelated sources; 17 of 20 technician services disagree. The reconciler `getStartingPricePaise()` is exported and never called. | `lib/catalog/service-config.ts` |

### 1.2 What is already sound

This is a correction, not a rewrite. The following are good and must not be
disturbed:

- The database design — 60+ models, money invariants, partial unique indexes for
  slot races.
- The dispatch and matching engine — real, gated, ranked, and unit-tested.
- Server-authoritative pricing; a client-sent total is never trusted.
- The `Order` money envelope: authorize once, capture per job, refund the rest.
- `next/image` throughout, zero raw `<img>`.
- The `PaymentGateway` / `PayoutGateway` interfaces — the seams this plan depends on.
- The 16 existing unit test files, which are well-written as far as they go.

---

## 2. Decisions

Taken 2026-07-29.

**D1 — The four non-Milestone-1 verticals stay browsable with booking disabled.**
Vehicle, Accommodation, Store and Crew keep their pages and their demo value, but
cannot be booked. This is honest to customers, protects the four contracted
categories, and is reversible. A vertical that cannot be booked does not need a
status simulator, so this collapses into the simulator deletion as one task.

**D2 — Cycle 2 repairs the booking flow's faults but keeps its shape.**
The 14 faults from the 2026-07-29 booking audit get fixed. The three-page
structure (`/booking` → `/cart` → `/checkout`) stays. A full single-screen
redesign is deferred to post-launch, when real usage data can justify the shape.

**D3 — No infrastructure or account provisioning in this cycle.**
Staging setup and Razorpay/MSG91 account procurement are explicitly out of scope.
All gateway work is written against the existing interfaces and tested with fakes;
credentials swap in later without touching call sites.

---

## 3. Architecture

### 3.1 The gateway seam

`payments.ts` already defines a `PaymentGateway` interface with a module-level
instance and a `setPaymentGateway()` setter. This is the correct shape and needs
no change. The work is to add a second implementation beside `DemoPaymentGateway`:

```
PaymentGateway (interface)
├── DemoPaymentGateway    — existing; stays, used by tests and local dev
└── RazorpayGateway       — new; real HTTP client, no credentials required to build
```

Selection happens once at app bootstrap, driven by validated env. Absent
credentials, the demo gateway is selected and a loud warning is logged. No call
site anywhere in the app changes.

The same pattern applies to OTP delivery, which currently has no seam at all:

```
OtpDeliveryChannel (interface)     — new
├── ConsoleOtpChannel              — dev only; logs the code
└── Msg91OtpChannel                — new
```

Extracting this interface is what allows `DEV_OTP` to be deleted rather than
flagged off: the dev behaviour becomes a *channel*, not a branch inside the
verification logic.

### 3.2 Webhooks as source of truth

A new `POST /api/webhooks/razorpay` route becomes authoritative for payment state.
Inline state set during checkout is treated as provisional. The route must be
signature-verified, idempotent by event ID, and safe to replay. Where inline state
and webhook state disagree, the webhook wins.

This requires a `WebhookEvent` table (event ID, type, payload, processed-at) so
replays are cheap to detect and every state transition is auditable.

### 3.3 Booking availability gate

D1 needs a single, declarative place that answers "can this vertical be booked?"
— not scattered conditionals. A `BOOKABLE_VERTICALS` constant, consulted by both
the UI (to render a disabled state) and the API routes (to reject writes). The
server check is the real one; the UI check is a courtesy.

---

## 4. Plan

Ten and a half weeks remain to the 10 October target.

This is a programme, not a single implementation plan. Each cycle below gets its
own detailed plan written at the point it starts, so that later cycles can absorb
what earlier ones learn. Only Cycle 0 and Cycle 1 are firm; Cycles 2–5 are
sequenced and scoped but not yet decomposed.

### Cycle 0 — Freeze and triage (3 days)

1. Stop all new vertical work.
2. Delete the three dead seed-data modules and the unreferenced `BookingForm.tsx`.
3. CI: typecheck → lint → test → build, gating every PR.
4. ESLint + Prettier at workspace root.
5. Sentry on all three apps, with release tagging.
6. Zod env validation at boot; refuse to start on a missing or default-valued
   `AUTH_SECRET`.

**Exit:** every commit is gated, and production errors are visible.

### Cycle 1 — Money and identity (weeks 1–2)

1. `BOOKABLE_VERTICALS` gate; disable booking on Vehicle, Accommodation, Store,
   Crew, with an honest UI state.
2. Delete all three status simulators and their call sites.
3. `RazorpayGateway` implementing the existing interface.
4. `POST /api/webhooks/razorpay` + `WebhookEvent` table, idempotent and
   signature-verified.
5. Extract `OtpDeliveryChannel`; add `Msg91OtpChannel`; delete `DEV_OTP` and the
   `SHOW_OTP_ON_SCREEN` branch.
6. Reconciliation job comparing local orders against gateway settlements.
7. Rate limiting on auth, checkout, cart and media routes.
8. Security headers and CSP.

**Exit:** the full money path runs end to end against a fake gateway in tests,
with nothing simulated and no auth bypass. Credentials are the only missing piece.

### Cycle 2 — Technician to production depth (weeks 3–4)

The reference implementation every other category copies.

1. One price source — resolve the catalog/config split (fault F-01).
2. Honest partial-failure reporting at checkout (F-02).
3. Pass duration to the availability check (F-03).
4. Correct the cart's fee copy (F-04).
5. Remaining audit faults F-05 through F-14.
6. Notification delivery on booking events, behind a `NotificationChannel`
   interface mirroring §3.1 — real adapters written and tested against fakes,
   credentials swapped in later per D3.
7. Playwright E2E: browse → book → pay → assign → complete → invoice.
8. Accessibility and metadata on the booking path.

**Exit:** Technician is shippable; nothing on its path is simulated.

### Cycle 3 — Beauty, Home, Pet to parity (weeks 5–6)

These already share `ServiceBookingFlow`; this is configuration and content, not
new code. Beauty and Pet currently have zero service-level config — every service
prices identically. Home has the deepest.

1. Per-service pricing config across all four categories.
2. Category-specific requirement fields and guidelines.
3. Real content: images, inclusions, durations.
4. E2E per category.

**Exit:** all four Milestone 1 categories at Technician's depth.

### Cycle 4 — Wallet, Coins, Referral, Cashback (weeks 7–8)

Schema-first; none of this exists. Sequenced after Cycle 1 deliberately — building
a wallet against the demo gateway would mean building it twice.

1. `Wallet` + `WalletTransaction`, under the same money invariants as `Order`.
2. V Coins ledger with earn and burn rules.
3. Referral attribution and payout trigger.
4. Cashback rules engine.
5. Invoice sharing over WhatsApp and email.
6. Admin reports.

**Exit:** the Milestone 3 feature list is complete.

### Cycle 5 — Hardening and rehearsal (weeks 9–10)

1. Load testing on the booking and checkout paths.
2. Security review.
3. Credential swap-in and staging rehearsal, if infrastructure exists by then (D3).
4. Rollback plan and go-live runbook.

---

## 5. Non-goals

- Redesigning the database. It is sound.
- The single-screen booking flow redesign (D2) — post-launch.
- Building Vehicle, Accommodation, Store or Crew to production depth (D1).
- Staging environment or payment account provisioning (D3).
- AI chatbot and AI search — Milestone 4.
- Mobile apps — Milestone 4.

---

## 6. Testing strategy

Current coverage is 16 unit test files over pure functions, with no integration
or end-to-end tests. The money path is the one place a regression costs real
rupees, so that is where the new coverage goes.

- **Unit** — extend the existing pattern to new pricing, wallet and coin logic.
- **Integration** — every payment and webhook route, including replay, signature
  failure, and partial-assignment cases.
- **E2E (Playwright)** — one full journey per Milestone 1 category, plus a
  booking-disabled assertion for each of the four gated verticals.

CI runs all three tiers on every PR.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Credentials arrive late and Cycle 1 cannot be verified against the real gateway. | Everything is built and tested against the interface. Swap-in is a config change, scheduled into Cycle 5. |
| Deleting the simulators makes several verticals visibly inert. | That is the intent of D1, and it is honest. The UI states the vertical is not yet bookable rather than faking progress. |
| The Cycle 4 feature set is large and entirely new. | It is sequenced last among build work and depends only on Cycle 1. If the date slips, this is the cycle to renegotiate — not the production core. |
| Deleting `DEV_OTP` blocks local development. | `ConsoleOtpChannel` replaces it, selected by env, and cannot be enabled in production. |

---

## 8. Success criteria

1. A real customer completes a real payment to a real partner, in production, in
   any Milestone 1 category.
2. No code path writes a fabricated status to any bookings table.
3. No authentication path accepts a code that was not issued.
4. CI blocks merges on typecheck, lint, test or build failure.
5. Production errors reach Sentry before they reach a customer.
6. All four Milestone 1 categories pass the same E2E journey.
