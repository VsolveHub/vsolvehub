# Direct Assignment (Urban-Company-Style) & Availability-Gated Payment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Supersedes** the earlier wave-dispatch version of this plan (2026-07-19). The
> offer/accept race (Rapido/Uber model) is replaced by direct assignment (Urban
> Company model): the system picks the best available professional and puts the
> job on their schedule. No accept prompt.

**Goal:** Collect payment only when a professional is genuinely available for the slot, then **assign that professional immediately** — the customer leaves checkout already knowing who is coming. Zero availability shows a "No professionals available" screen (with alternative slots) before any money moves.

**Architecture:** One availability matcher is the single source of truth, consulted three times: the pre-payment UI gate, the server-side gate inside POST /api/bookings, and the assignment itself — same function, so they can never disagree. Assignment is conflict-safe via a partial unique index on (partner, slot). The partner's schedule replaces the accept prompt as the capacity control: a partner is assignable exactly when their calendar says they're free and no other job holds that slot.

**Tech Stack:** Existing stack. One hand-authored migration (a partial unique index). No new dependencies.

## Global Constraints

- Availability is **snapshot-honest**: UI may cache ≤30 s; the server re-checks inside POST /api/bookings before any row or gateway call.
- The availability endpoint returns **counts only** — no partner PII. The assigned professional's identity is revealed only after payment, on the booking.
- **"Available" differs by schedule type** — this is what direct assignment unlocks:
  - *Instant*: `ACTIVE` + `isOnline` + skill/trade match + within 25 km + **no active job right now** (`ASSIGNED`/`PROVIDER_ARRIVING`/`STARTED`).
  - *Scheduled*: `ACTIVE` + skill/trade match + within 25 km + slot fits their availability windows + **no other booking assigned at that slot**. `isOnline` is NOT required — the job lands on their calendar like Urban Company, no 30-second accept window to catch.
- Assignment must be **race-proof at the database**: two customers grabbing the same partner+slot concurrently must collide on a constraint, not both succeed.
- Money rules: authorize at checkout (per-method strategy unchanged), **capture at assignment** (there is no accept anymore), refund/void immediately if post-payment assignment fails.
- The shared engine (`packages/db`) keeps `acceptJobOffer` untouched — the vehicle flows and any legacy offers still route through it. Archetype-A bookings simply stop creating offers.

---

## Design

### The flow

```
details ─▶ GET /api/providers/availability ─▶ count > 0 ─▶ payment step
              │                                              "N professionals available"
              │ count = 0                                        │
              ▼                                                [Pay]
      NoProvidersScreen                                          │
      · "No professionals available                              ▼
         for Tue 2–4 PM"                              POST /api/bookings
      · up to 3 suggested slots                                  │
        (tap → slot step, preselected)              server re-runs the matcher
      · Try again · Go home                                      │
                                              ┌──────────────────┴────────────┐
                                              │ available                     │ vanished since check
                                              ▼                               ▼
                                    authorizeOrder (money moves)     409 NO_PROVIDERS
                                              │                      nothing created,
                                    assignBestPartner:               nothing charged
                                      loop ranked candidates:
                                        try conflict-safe assign
                                        (unique index is the referee)
                                              │
                              ┌───────────────┴───────────────┐
                              │ assigned                      │ every candidate collided
                              ▼                               ▼
                    Booking → ASSIGNED                refund/void immediately
                    capture this job's share          → 409-shaped NO_PROVIDERS
                    startOtp generated                  response: "you have not
                              │                          been charged" + slots
                              ▼
                    response includes the professional
                    → tracker opens on "Meet your professional"
                      (name, rating, jobs done — no SEARCHING state)
```

### Why the schedule replaces the accept prompt

In the offer model, "accept" answered two questions: *can* this partner do the job (capacity) and *will* they (consent). Direct assignment answers capacity with the calendar (availability windows + the slot-conflict index) and makes consent the exception rather than the gate: the partner gets a **"Can't make it"** escape hatch that triggers automatic reassignment. This is how Urban Company keeps fill rates high — the default is assigned, not offered.

Consequences worth naming:
- **Scheduled bookings no longer require the partner to be online at booking time.** The 30-second offer TTL was why online-ness leaked into scheduled availability; that whole constraint dissolves.
- **The customer knows their professional at checkout.** No "searching…" anxiety state for the happy path; `SEARCHING_PROVIDER` survives only as a transient state during reassignment.
- **Partner discipline becomes a policy problem, not an engine problem.** No-show/late-cancel penalties are deferred (flagged), but the reassignment path is built now.

### Assignment ranking

Same scored ranking as before, now selecting who *gets* the job rather than who gets asked first:

```
score = 0.5 × proximity (1 − min(distanceKm,25)/25)
      + 0.3 × rating (rating/5)
      + 0.2 × fairness (fewest jobs assigned in the last 7 days → higher)
```

Fairness switches from "least recently offered" to "fewest recent assignments" — with direct assignment, offers no longer exist to measure. Deterministic, pure, unit-tested.

### The race, and the referee

Between matcher and write, another checkout can take the same partner+slot. The referee is a hand-authored partial unique index:

```sql
CREATE UNIQUE INDEX "Booking_partner_slot_active"
  ON "Booking" ("assignedPartnerId", "slot")
  WHERE "assignedPartnerId" IS NOT NULL
    AND "status" IN ('ASSIGNED','PROVIDER_ARRIVING','STARTED');
```

Scheduled slots are block-start ISO strings (identical for the same block), so a
double-book collides at the database. `assignBestPartner` loops the ranked
candidates: on a unique-violation it simply tries the next one. Instant bookings
are additionally guarded by the "no active job" filter (their timestamps differ,
so the index alone wouldn't catch overlap).

### Post-payment assignment failure

The gate makes this rare (checked ≤ seconds earlier), but if every ranked candidate collides after money moved: refund (UPI/wallet, already captured at authorize) or void (card hold) **immediately and in full**, mark the booking `NO_WORKER_FOUND`, and return the same NO_PROVIDERS shape with `refunded: true` so the UI says "you have not been charged" with suggested slots. The customer never has to chase money.

---

## Task 1: Availability matcher (shared, pure core)

**Files:**
- Create: `web/apps/customer/lib/fulfillment/matching.ts`, `web/apps/customer/lib/fulfillment/matching.test.ts`
- Modify: `web/apps/customer/lib/fulfillment/push-dispatch.ts` (its private helpers move here)

**Interfaces:**
- Produces:
  - `type CandidatePartner` — id, lat/lng, rating, availability rows, trade/skills
  - `type MatchContext` — `{ addrLat, addrLng, slot, scheduleType, service }`
  - `filterEligible(partners, ctx, busyPartnerIds: Set<string>): CandidatePartner[]` — pure hard gates (skill, radius, windows; for instant also excludes `busyPartnerIds`; online-ness is a SQL-level gate applied only for instant)
  - `rankPartners(partners, ctx, recentAssignments: Map<string, number>): CandidatePartner[]`
  - `findAvailablePartners({ serviceId, addressId?, latLng?, slot, scheduleType, excludeIds? })` → `{ ranked, pool }` — Prisma wrapper; `pool` (pre-slot-filter matches) feeds slot suggestions with zero extra queries
  - `slotMatchesAvailability` — moved here verbatim, exported

- [ ] **Step 1: Failing tests for the pure core**

```ts
// matching.test.ts — the shape; full gates + ranking coverage
import { describe, expect, it } from "vitest";
import { filterEligible, rankPartners } from "./matching";

const scheduledCtx = {
  addrLat: 17.4, addrLng: 78.47, scheduleType: "scheduled" as const,
  slot: new Date(Date.now() + 26 * 3600_000).toISOString(),
  service: { slug: "switch-socket-repair", subCategory: { slug: "electrician" } },
};
const partner = (over = {}) => ({
  id: "p1", lat: 17.4, lng: 78.47, rating: 4.5,
  availability: [], trade: { slug: "electrician" }, skills: [], ...over,
});

describe("filterEligible — scheduled", () => {
  it("keeps a matching partner with open windows", () =>
    expect(filterEligible([partner()], scheduledCtx, new Set())).toHaveLength(1));
  it("drops a partner outside 25 km", () =>
    expect(filterEligible([partner({ lat: 18.5, lng: 80 })], scheduledCtx, new Set())).toHaveLength(0));
  it("drops a mismatched trade with no matching skill", () =>
    expect(filterEligible([partner({ trade: { slug: "pet-grooming" } })], scheduledCtx, new Set())).toHaveLength(0));
  it("drops a partner whose windows block the slot", () => {
    const dow = new Date(scheduledCtx.slot).getDay();
    const p = partner({ availability: [{ type: "blocked", dayOfWeek: dow, date: null, startTime: null, endTime: null }] });
    expect(filterEligible([p], scheduledCtx, new Set())).toHaveLength(0);
  });
  it("does NOT drop a scheduled candidate for being busy right now", () =>
    expect(filterEligible([partner()], scheduledCtx, new Set(["p1"]))).toHaveLength(1));
});

describe("filterEligible — instant", () => {
  const instantCtx = { ...scheduledCtx, scheduleType: "instant" as const,
    slot: new Date(Date.now() + 45 * 60_000).toISOString() };
  it("drops a partner who is on an active job", () =>
    expect(filterEligible([partner()], instantCtx, new Set(["p1"]))).toHaveLength(0));
});

describe("rankPartners", () => {
  it("prefers closer, then higher-rated", () => {
    const near = partner({ id: "near" });
    const far = partner({ id: "far", lat: 17.55 });
    expect(rankPartners([far, near], scheduledCtx, new Map())[0]!.id).toBe("near");
  });
  it("boosts the partner with fewer recent assignments", () => {
    const fresh = partner({ id: "fresh", rating: 4.0 });
    const loaded = partner({ id: "loaded", rating: 4.4 });
    expect(rankPartners([loaded, fresh], scheduledCtx, new Map([["loaded", 6]]))[0]!.id).toBe("fresh");
  });
});
```

- [ ] **Step 2:** `pnpm test matching` → fails (module missing).
- [ ] **Step 3:** Implement. SQL gates: `providerType=CAPTAIN, status=ACTIVE` always; `isOnline=true` only when `scheduleType="instant"`. `busyPartnerIds` from one query over active-status bookings; `recentAssignments` from one `groupBy(assignedPartnerId)` over the last 7 days.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` green.
- [ ] **Step 5:** Commit — `feat: add ranked availability matcher for direct assignment`

---

## Task 2: Slot suggestions

**Files:** `web/apps/customer/lib/fulfillment/slot-suggestions.ts` + test

**Interfaces:** `suggestSlots(pool: CandidatePartner[], ctx, { max = 3 })` → `{ slotIso, label, count }[]` — pure; walks the 7-day × 6-block grid in memory, skips past blocks and the rejected slot, returns the first `max` with count > 0.

- [ ] Failing tests (nearest future block wins; empty when no windows anywhere; never past; caps at max) → implement → green → commit — `feat: suggest alternative slots from availability windows`

---

## Task 3: Conflict-safe assignment engine + migration

**Files:**
- Create: `web/packages/db/prisma/migrations/20260720090000_partner_slot_unique/migration.sql`
- Modify: `web/packages/db/src/fulfillment.ts`, `web/packages/db/prisma/schema.prisma` (doc comment for the unmappable partial index)

**Migration:**

```sql
-- One partner cannot hold two active bookings for the same slot. This index is
-- the referee for concurrent checkouts: the loser gets a unique violation and
-- assignment moves to the next ranked candidate. Partial + expression-free so
-- it stays cheap; Prisma cannot express it — do not let migrate dev drop it.
CREATE UNIQUE INDEX "Booking_partner_slot_active"
  ON "Booking" ("assignedPartnerId", "slot")
  WHERE "assignedPartnerId" IS NOT NULL
    AND "status" IN ('ASSIGNED','PROVIDER_ARRIVING','STARTED');
```

**Engine — `assignPartnerDirect` (new, beside the untouched `acceptJobOffer`):**

```ts
export async function assignPartnerDirect(
  bookingId: string,
  partnerId: string,
): Promise<EngineResult<{ startOtp: string }>> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found" };
  if (booking.assignedPartnerId) return { ok: false, error: "Already assigned" };
  if (!isDispatchable(booking.status)) return { ok: false, error: "Not assignable" };

  const startOtp = genOtp();
  const isPrepaid = booking.paymentStatus !== "COD";
  const capturePaise = isPrepaid && booking.capturedPaise === 0 ? booking.quotedAmount : 0;

  try {
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          assignedPartnerId: partnerId,
          status: "ASSIGNED",
          startOtp,
          ...(capturePaise > 0 ? { capturedPaise: capturePaise, paymentStatus: "PAID" } : {}),
        },
      }),
      prisma.bookingStatusLog.create({ data: { bookingId, status: "ASSIGNED" } }),
      // Audit trail: a pre-accepted assignment row, so partner history/earnings
      // queries and admin views keep one consistent shape across both models.
      prisma.jobAssignment.create({
        data: { bookingId, partnerId, status: "ACCEPTED", respondedAt: new Date(),
                expiresAt: new Date() },
      }),
      ...(booking.orderId && capturePaise > 0
        ? [prisma.order.update({ where: { id: booking.orderId },
            data: { capturedPaise: { increment: capturePaise } } })]
        : []),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "SLOT_TAKEN" };
    throw e;
  }
  if (booking.orderId) await recomputeOrderStatus(booking.orderId);
  return { ok: true, startOtp };
}
```

**Engine — `releasePartnerAssignment(bookingId, partnerId, reason)`:** partner's "Can't make it". Clears `assignedPartnerId`/`startOtp`, reverts status to `SEARCHING_PROVIDER`, logs it, marks the audit `jobAssignment` row `DECLINED`. Reassignment itself happens in the customer lib (Task 4) because it needs the matcher. Money note: the captured amount stays captured across a successful reassignment; it is refunded only if reassignment exhausts (same terminal path as Task 5).

- [ ] Failing test for the pure part (`isUniqueViolation` on Prisma P2002) + engine compiles; migration reviewed; `pnpm db:generate && pnpm typecheck` green; **do not apply the migration — hand it to the user** (`pnpm db:migrate:deploy`).
- [ ] Commit — `feat: add conflict-safe direct assignment engine and partner-slot unique index`

---

## Task 4: `assignBestPartner` + reassignment loop

**Files:**
- Create: `web/apps/customer/lib/fulfillment/assign.ts`, `web/apps/customer/lib/fulfillment/assign.test.ts` (pure parts)
- Modify: `web/apps/customer/lib/fulfillment/push-dispatch.ts` (archetype-A entry points route here; wave machinery deleted for A)

**Interfaces:**

```ts
/** Ranked-candidate loop over conflict-safe assignment. */
export async function assignBestPartner(bookingId: string): Promise<
  | { ok: true; partner: PublicPartner; startOtp: string }
  | { ok: false; code: "NO_PROVIDERS" }
>;
/** Partner bailed: release, then try to reassign; exhausted → terminal path. */
export async function reassignAfterRelease(bookingId: string): Promise<void>;
```

- `assignBestPartner`: `findAvailablePartners` → loop `ranked`, call `assignPartnerDirect`; `SLOT_TAKEN` → next candidate; success → return the partner's public shape (name, rating, jobsCompleted — nothing else).
- `reassignAfterRelease`: same loop with the bailing partner excluded; exhaustion → the Task-5 terminal path (refund + `NO_WORKER_FOUND` + notification "We're finding you a new professional" → "…couldn't — you've been refunded").
- `dispatchBookingOffers`/waves/`processExpiredOffersAndRedispatch` stop being called for archetype A (they remain for anything still on offers). The status poll no longer triggers redispatch for A.

- [ ] Tests for the loop logic (first candidate taken → second assigned; all taken → NO_PROVIDERS) with the engine call stubbed; green; commit — `feat: assign the best available professional at booking time`

---

## Task 5: Booking route — gate, pay, assign, reveal

**Files:** `web/apps/customer/app/api/bookings/route.ts`, `web/apps/customer/lib/query/api.ts`

**Order of operations (replaces the current post-payment fan-out):**

1. Validate (Zod, service, address, slot window) — unchanged.
2. **Gate:** `findAvailablePartners`; zero → `409 { code: "NO_PROVIDERS", suggestedSlots }`. Nothing created.
3. Create DRAFT booking (unchanged).
4. `authorizeOrder` (unchanged). Decline → 402, booking stays DRAFT.
5. `assignBestPartner(booking.id)`.
   - Success → response gains `partner: { name, rating, jobsCompleted }` and `status: "ASSIGNED"`.
   - `NO_PROVIDERS` (gate-to-assign race lost) → **refund/void in full immediately** (UPI/wallet: `gateway.refund`; card: `gateway.void`; ledger + `recomputeOrderStatus`), booking → `NO_WORKER_FOUND`, respond `409 { code: "NO_PROVIDERS", refunded: true, suggestedSlots }`.
6. COD: identical flow; step 5's capture is skipped by the engine (`paymentStatus === "COD"`), money settles on completion as today.

- [ ] Implement; manual E2E both branches; commit — `feat: pay-then-assign with full refund when assignment races out`

---

## Task 6: UI — gate screen, "Meet your professional", partner bail-out

**Files:**
- Create: `web/apps/customer/components/customer/booking/NoProvidersScreen.tsx`
- Modify: `web/apps/customer/components/customer/booking/ServiceBookingFlow.tsx`, `BookingTracker.tsx`, `web/apps/partner/app/dashboard/page.tsx` (job card gains "Can't make it"), new partner route `web/apps/partner/app/api/jobs/[id]/release/route.ts`

**Customer:**
- "Continue to payment" → availability query (staleTime 30 s); zero → `NoProvidersScreen` (headline with the slot label, suggestion chips that jump back to the slot step preselected, Try again, Go home). Payment header: "⚡ N professionals available near you".
- `createBooking.onError` maps `NO_PROVIDERS` (incl. `refunded: true` copy: "You have not been charged") to the same screen.
- Tracker: booking arrives `ASSIGNED` → opens directly on **"Meet your professional"** (name, rating, jobs completed, start OTP when en route). `SEARCHING_PROVIDER` renders only during reassignment, labelled "Finding you a new professional".

**Partner:**
- Assigned job card gains **"Can't make it"** → confirm dialog → `POST /api/jobs/[id]/release` → `releasePartnerAssignment` + `reassignAfterRelease`. (Penalty policy deferred — flagged, not built.)

- [ ] Implement; verify in dev: assign path, no-providers path, release → reassign path; commit — `feat: meet-your-professional flow with no-providers gate and partner release`

---

## Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | Zero providers at the UI check | NoProvidersScreen; nothing created or charged. |
| 2 | Providers vanish between check and POST | Server gate 409; nothing created or charged. |
| 3 | All candidates collide after payment | Full refund/void in the same request; `refunded: true` in the 409; suggested slots. |
| 4 | Two checkouts race for the last partner+slot | Partial unique index — one wins, the other moves to the next candidate or hits case 3. |
| 5 | Partner "can't make it" | Release → auto-reassign (bailer excluded) → customer sees "finding you a new professional"; exhausted → refund + terminal, capture returned. |
| 6 | Instant booking, partner mid-job | Excluded by the busy filter; index can't catch differing instant timestamps, the filter does. |
| 7 | Scheduled partner offline at booking time | Assignable — the job goes on their calendar; online-ness only gates instant. |
| 8 | COD | Same gate and assignment; no capture; settles on completion. |
| 9 | Stale UI cache (≤30 s) | POST re-check is authoritative. |
| 10 | Crafted POST skipping the UI | Server gate + index hold regardless. |

## Deferred, deliberately (no rework when they come)

- Partner no-show/late-release penalties and reliability scoring (policy layer over the audit `JobAssignment` rows this plan already writes).
- T-2h day-of reminders to partner and customer (a cron over `ASSIGNED` bookings).
- Capacity > 1 per slot for partners with teams (the unique index becomes a counted constraint — schema change isolated to that index).
- Removing the now-dormant wave machinery once nothing references it (deletion, not design).

## Testing summary

Pure: matcher gates per schedule type, ranking + fairness, slot suggestions, assignment-loop ordering. Engine: unique-violation → next candidate (P2002 detection unit-tested; the full race manually provoked with two rapid checkouts). E2E manual: happy assign, no-providers pre-pay, refund-after-race, partner release → reassign, COD.
