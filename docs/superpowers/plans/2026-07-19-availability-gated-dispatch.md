# Availability-Gated Payment & Partner Assignment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect payment only when providers are actually available for the chosen slot; when none are, show a "No professionals available" screen (with alternative slots) *before* any money moves.

**Architecture:** One availability matcher becomes the single source of truth, called from three places: the pre-payment UI gate, the server-side booking gate, and the dispatch waves themselves. Because all three run the same function, the gate can never disagree with dispatch. The existing void-on-exhaustion path stays as the backstop for the unavoidable race (providers going offline between payment and accept) — the gate turns "charge then refund" from the common case into the rare one.

**Tech Stack:** Existing stack (Next.js 15, Prisma 6, TanStack Query 5, Vitest). No new dependencies, no schema change.

## Global Constraints

- Availability must be **snapshot-honest**: the UI may cache it for ≤30s, but the server re-checks at POST /api/bookings before creating any row or calling the gateway.
- The availability endpoint returns **counts only** — never partner names, ids, or coordinates.
- "Available" means: `status=ACTIVE`, `providerType=CAPTAIN`, `isOnline=true`, trade/skill matches the service, within 25 km of the address, and the slot passes the partner's availability windows. Online is required even for scheduled bookings because offers have a 30-second TTL — an offline partner can never see one in time.
- The matcher core is a **pure function** over already-loaded partners (one DB fetch, N in-memory evaluations), so slot suggestions cost no extra queries.
- Money rules unchanged: authorize before dispatch, capture per job on accept, void on exhaustion.

---

## Design

### The flow, end to end

```
details step ──"Continue to payment"──▶ GET /api/providers/availability
                                          │
                        ┌─────────────────┴───────────────┐
                        │ count > 0                       │ count = 0
                        ▼                                 ▼
              payment step                       NoProvidersScreen
              "N professionals                   · "No professionals available
               available near you"                  for Tue 2–4 PM"
                        │                        · up to 3 suggested slots
                     [Pay]                          (tap → jumps back to the
                        │                            slot step, preselected)
                        ▼                        · Try again · Go home
              POST /api/bookings
                        │
              server re-runs the SAME matcher   ◀── the enforcement, not the UI
                        │
        ┌───────────────┴────────────────┐
        │ providers exist                │ pool emptied since the check
        ▼                                ▼
  create DRAFT booking            409 { code: "NO_PROVIDERS",
  authorizeOrder (money moves)          suggestedSlots }
  dispatch waves                  → client shows NoProvidersScreen
        │                           (no booking row, no order row,
        ▼                            no gateway call)
  accept → capture   /   exhausted → void, ₹0 charged   ◀── unchanged backstop
```

### Partner assignment (the full picture)

**Hard gates** (eliminate, in this order — cheapest first):
1. `providerType = CAPTAIN`, `status = ACTIVE`, `isOnline = true` (SQL WHERE)
2. Trade/skill match via `partnerMatchesService` (existing shared matcher)
3. Slot fits the partner's availability windows / isn't blocked (`slotMatchesAvailability`)
4. Within `SERVICE_RADIUS_KM` (25 km) of the booking address

**Soft ranking** (order the survivors for wave composition):

```
score = 0.5 × proximity   (1 − min(distanceKm, 25)/25)
      + 0.3 × rating      (rating / 5)
      + 0.2 × freshness   (1 if never offered today, decaying with recency of last offer)
```

Freshness is the anti-starvation term: without it the closest high-rated partner absorbs
every first wave and newer partners never get a chance to build history. Deterministic,
unit-tested, and cheap (last-offer timestamps come from `JobAssignment` in one query).

**Waves** (existing mechanics, now fed a ranked list):
- Wave = top 5 ranked partners not yet offered; offer TTL 30 s; max 4 waves.
- Escalation is driven by the customer's 4 s status poll (`processExpiredOffersAndRedispatch`) — unchanged.
- First accept wins inside the existing transaction; capture joins it (built).
- Worst case ≈ 2 minutes to exhaustion → `NO_WORKER_FOUND` → void that job's share → notify + suggest alternative slots.

**Deliberately deferred** (no rework later, flagged now): dispatching *scheduled* bookings closer to their slot (T-2h) with push notifications instead of immediately. Zero schema change when it comes — it only moves *when* `dispatchBookingOffers` is called.

### Slot suggestions

When a slot has no providers, evaluate the other candidate slots (7 days × 6 time slots, minus past ones) **against the partners already fetched** — pure in-memory `slotMatchesAvailability` calls, no extra queries — and return the first 3 with a non-zero count. Shown on the NoProvidersScreen and returned in the 409 body.

### Why the race is acceptable

Between the UI check and the POST, and between the POST and the first accept, providers can go offline. The first gap is closed by the server re-check (409, nothing created). The second gap cannot be closed — it is the nature of dispatch — but it is exactly what the void-on-exhaustion path already handles: the customer is charged ₹0 and now gets suggested slots instead of a dead end.

---

## Task 1: Shared availability matcher

**Files:**
- Create: `web/apps/customer/lib/fulfillment/matching.ts`, `web/apps/customer/lib/fulfillment/matching.test.ts`
- Modify: `web/apps/customer/lib/fulfillment/push-dispatch.ts` (delete its private `findEligiblePartners`, `slotMatchesAvailability`, `withinServiceArea`, `haversineKm`)

**Interfaces:**
- Produces:
  - `type CandidatePartner` — the partner shape the matcher needs (id, lat/lng, rating, availability rows, trade/skills)
  - `filterEligible(partners, ctx): CandidatePartner[]` — pure hard gates
  - `rankPartners(partners, ctx, lastOfferAt: Map<string, Date>): CandidatePartner[]` — pure soft ranking
  - `findAvailablePartners({ serviceId, addressId | latLng, slot, excludePartnerIds }): Promise<{ partners; count }>` — the Prisma wrapper both dispatch and the availability check call
  - `slotMatchesAvailability(slot, availabilityRows)` — moved here, exported

- [ ] **Step 1: Write failing tests for the pure core**

```ts
// web/apps/customer/lib/fulfillment/matching.test.ts
import { describe, expect, it } from "vitest";
import { filterEligible, rankPartners, slotMatchesAvailability } from "./matching";

const ctx = { addrLat: 17.4, addrLng: 78.47, slot: new Date(Date.now() + 3600_000).toISOString(),
  service: { slug: "switch-socket-repair", subCategory: { slug: "electrician" } } };

const partner = (over = {}) => ({
  id: "p1", lat: 17.4, lng: 78.47, rating: 4.5,
  availability: [], trade: { slug: "electrician" }, skills: [], ...over,
});

describe("filterEligible", () => {
  it("keeps a matching partner in range", () => {
    expect(filterEligible([partner()], ctx)).toHaveLength(1);
  });
  it("drops a partner outside the 25 km radius", () => {
    expect(filterEligible([partner({ lat: 18.5, lng: 80.0 })], ctx)).toHaveLength(0);
  });
  it("drops a partner whose trade and skills do not match", () => {
    expect(filterEligible([partner({ trade: { slug: "pet-grooming" } })], ctx)).toHaveLength(0);
  });
  it("drops a partner whose availability blocks the slot", () => {
    const dow = new Date(ctx.slot).getDay();
    const p = partner({ availability: [{ type: "blocked", dayOfWeek: dow, date: null, startTime: null, endTime: null }] });
    expect(filterEligible([p], ctx)).toHaveLength(0);
  });
});

describe("rankPartners", () => {
  it("prefers the closer partner, all else equal", () => {
    const near = partner({ id: "near" });
    const far = partner({ id: "far", lat: 17.55 });
    const ranked = rankPartners([far, near], ctx, new Map());
    expect(ranked[0]!.id).toBe("near");
  });
  it("prefers the higher-rated partner at equal distance", () => {
    const good = partner({ id: "good", rating: 4.9 });
    const ok = partner({ id: "ok", rating: 3.5 });
    expect(rankPartners([ok, good], ctx, new Map())[0]!.id).toBe("good");
  });
  it("boosts a partner who has not been offered work recently", () => {
    const fresh = partner({ id: "fresh", rating: 4.0 });
    const busy = partner({ id: "busy", rating: 4.4 });
    const lastOffer = new Map([["busy", new Date()]]);
    expect(rankPartners([busy, fresh], ctx, lastOffer)[0]!.id).toBe("fresh");
  });
});
```

- [ ] **Step 2: Run, verify failure** — `pnpm test matching` → cannot resolve `./matching`.

- [ ] **Step 3: Implement** — move `haversineKm`, `slotMatchesAvailability`, `withinServiceArea` out of `push-dispatch.ts` verbatim; add `filterEligible` (gates 2–4; gate 1 stays in SQL), `rankPartners` with the documented weights, and the `findAvailablePartners` wrapper (one `partner.findMany` with the SQL gates + `partnerMatchInclude` + availability, then pure filter + rank; `lastOfferAt` from one `jobAssignment.groupBy`).

- [ ] **Step 4: Refactor `push-dispatch.ts`** — `findEligiblePartners(bookingId, exclude)` becomes a thin call to `findAvailablePartners` with the booking's service/address/slot; wave slicing (`.slice(0, WAVE_SIZE)`) now takes the **ranked** head. Delete the duplicated helpers.

- [ ] **Step 5: Tests + typecheck** — `pnpm test && pnpm typecheck` green.

- [ ] **Step 6: Commit** — `feat: extract ranked availability matcher shared by gate and dispatch`

---

## Task 2: Slot suggestions

**Files:**
- Create: `web/apps/customer/lib/fulfillment/slot-suggestions.ts`, `web/apps/customer/lib/fulfillment/slot-suggestions.test.ts`

**Interfaces:**
- Produces: `suggestSlots(partners: CandidatePartner[], ctx, { max = 3 }): { slotIso: string; label: string; count: number }[]` — pure; evaluates the 7-day × 6-time-slot grid in memory against already-fetched partners, skipping past slots and the rejected slot itself.

- [ ] **Step 1: Failing tests** — suggests the nearest future slot a partner's windows allow; returns `[]` when no partner has any window in 7 days; never suggests a past slot or the rejected slot; caps at `max`.
- [ ] **Step 2–3: Implement + green** — reuse `slotMatchesAvailability`; labels reuse the flow's `TIME_SLOTS` naming ("Tue · 02–04 PM").
- [ ] **Step 4: Commit** — `feat: suggest alternative slots from partner availability windows`

---

## Task 3: Availability endpoint

**Files:**
- Create: `web/apps/customer/app/api/providers/availability/route.ts`
- Modify: `web/apps/customer/lib/query/api.ts`, `web/apps/customer/lib/query/keys.ts`

**Interfaces:**
- Produces: `GET /api/providers/availability?serviceId&addressId&slot` → `{ available: boolean; count: number; suggestedSlots: SlotSuggestion[] }` (suggestedSlots populated only when count = 0). 400 on missing params; addressId must belong to the session user when a session exists, else falls back to the city-center default like `nearby.ts`. Counts only — no partner PII.
- Client: `api.availability(serviceId, addressId, slotIso)` + `qk.availability(serviceId, addressId, slotIso)`; consumers use `staleTime: 30_000`.

- [ ] Steps: implement route (one `findAvailablePartners` call; when zero, `suggestSlots` on the same fetched partners — the wrapper returns the pre-filter pool for this purpose), wire the client helper, typecheck, commit — `feat: add provider availability endpoint`.

---

## Task 4: UI gate + NoProvidersScreen

**Files:**
- Create: `web/apps/customer/components/customer/booking/NoProvidersScreen.tsx`
- Modify: `web/apps/customer/components/customer/booking/ServiceBookingFlow.tsx`

**Interfaces:**
- `NoProvidersScreen({ slotLabel, suggestions, onPickSlot, onRetry })` — flow-level screen (component state, not a route, so "pick another slot" keeps all entered details).

**Behaviour:**
- "Continue to payment" now: `validateDetails()` → fetch availability for the built slot → `count > 0` ? advance to payment : render NoProvidersScreen.
- While checking: button shows "Checking availability…" (disabled) — no spinner page.
- Payment step header gains one line of honest social proof: "⚡ N professionals available near you", from the same cached query.
- NoProvidersScreen: headline "No professionals available for {slotLabel}", suggestion chips (tap → `setDateKey`/`setTimeSlot` → back to the `when` step with the slot preselected), "Try again" (refetch), "Browse other services" (home).
- Instant bookings gate identically (slot = now+45 min).

- [ ] Steps: build screen, wire gate, verify in dev against a service with no matching online partner AND one with; commit — `feat: gate the payment step on live provider availability`.

---

## Task 5: Server-side enforcement (the real gate)

**Files:**
- Modify: `web/apps/customer/app/api/bookings/route.ts`, `web/apps/customer/lib/query/api.ts` (error shape), `web/apps/customer/components/customer/booking/ServiceBookingFlow.tsx` (409 handling)

**Behaviour:**
- Immediately after slot validation and **before** `createBooking`/`authorizeOrder`/any gateway call:

```ts
const { partners, pool } = await findAvailablePartners({
  serviceId, addressId, slot,
});
if (partners.length === 0) {
  return NextResponse.json(
    { code: "NO_PROVIDERS", error: "No professionals are available for this slot",
      suggestedSlots: suggestSlots(pool, { slot, ... }) },
    { status: 409 },
  );
}
```

- Nothing is created on this path: no DRAFT booking, no Order row, no gateway intent. (The DRAFT booking is only created after the gate passes — reorder the route accordingly.)
- Client: `createBooking` mutation's `onError` recognises `code: "NO_PROVIDERS"` and renders the same NoProvidersScreen with the returned suggestions — closing the check-to-POST race without charging anyone.
- The UI gate (Task 4) is UX; **this** is the guarantee. A crafted request that skips the UI still cannot produce a paid, undispatched booking.

- [ ] Steps: reorder route, add 409, map the error in the mutation, typecheck + tests, commit — `feat: refuse payment server-side when no provider can take the slot`.

---

## Task 6: Exhaustion UX joins the same system

**Files:**
- Modify: `web/apps/customer/components/customer/booking/BookingTracker.tsx` (NO_WORKER_FOUND state), `web/apps/customer/app/api/bookings/[ref]/status/route.ts` (attach suggestions)

**Behaviour:**
- When a paid booking exhausts its pool (the residual race), the tracker's `NO_WORKER_FOUND` state now says: "Everyone got booked up — you haven't been charged" (true: capture never happened; the hold share was voided), plus the same suggestion chips → retry re-dispatches with the new slot via the existing retry route.
- Status endpoint includes `suggestedSlots` only when status is `NO_WORKER_FOUND` (one matcher call, only on that branch).

- [ ] Steps: implement, verify the retry path end to end, commit — `feat: offer alternative slots when dispatch exhausts the pool`.

---

## Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | Zero providers at the UI check | NoProvidersScreen; nothing created, nothing charged. |
| 2 | Providers vanish between UI check and POST | Server 409 `NO_PROVIDERS`; nothing created, nothing charged. |
| 3 | Providers vanish after payment (all decline/expire) | Existing void path: ₹0 captured; tracker shows suggestions + retry. |
| 4 | Stale cached availability (≤30 s) | Harmless — the POST re-check is authoritative. |
| 5 | Address without coordinates | Falls back to city-center default (matches existing dispatch behaviour) rather than blocking the booking. |
| 6 | All suggested slots also empty | Suggestions list is empty → screen shows only "Try again / Browse services"; never fabricate a slot. |
| 7 | COD | Gated identically — an unfulfillable booking is useless regardless of payment method. |
| 8 | Crafted POST skipping the UI | Task 5 is server-side; the gate holds. |

## Testing summary

Pure-function coverage: matcher gates, ranking weights + anti-starvation, slot suggestions (Tasks 1–2). Route behaviour: 409 shape, nothing-created guarantee (Task 5, asserted via prisma call ordering in an integration test if feasible, else code review + manual). Manual E2E: one service with online partners, one without; both paths through the flow; exhaustion path via a partner declining all offers.
