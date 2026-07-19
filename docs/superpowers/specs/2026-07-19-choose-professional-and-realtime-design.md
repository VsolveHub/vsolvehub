# Choose-Your-Professional, Silent Fallback & Reload-Free Realtime

**Status:** approved 2026-07-19. Builds on the direct-assignment engine
(`2026-07-19-availability-gated-dispatch.md`).

## Goal

Give the customer a real choice of professional before paying — top ≤4 real,
available pros ranked by the assignment matcher, or "Auto-assign" (the
recommended default) — then pay, get assigned, and share the start OTP. Make the
partner dashboard and customer tracker update live (no page reloads), using
polling only so the data layer stays portable to a future Django backend (no
Supabase Realtime).

## Product decisions (locked)

- **Show full profiles pre-payment** (name, rating, jobs done, distance, ETA).
  This deliberately reverses the earlier "counts only, no PII" stance — the
  customer is choosing, so they see who they're choosing.
- **Cap at 4** real professionals. Show however many are actually available
  (2 available → show 2); never pad with mock/fake entries.
- **Auto-assign is pre-selected and recommended.**
- **Silent fallback:** if the picked pro is taken by the time payment completes,
  assign the next best automatically and tell the customer who they got.
- **Polling** for realtime, everywhere. No Supabase Realtime.
- **No mock data anywhere** in this feature — every professional, distance, and
  ETA is derived from real partner rows.

## Non-negotiable: one matcher

The choose list, the pre-payment gate, and assignment all read the SAME
`findAvailablePartners` (`lib/fulfillment/matching.ts`). What the customer sees
is exactly who can be assigned for that slot — the list can never promise a pro
assignment can't produce. The legacy second matcher (`lib/provider/matching.ts`,
`lib/provider/nearby.ts`, `/api/providers/nearby`) is dead (no consumer) and is
retired to prevent drift.

## Flow

```
service → guidelines → when → details → CHOOSE → payment → tracker (start OTP)
                                          │
                     GET /api/providers/availability (now returns
                        { count, professionals[≤4], suggestedSlots })
                                          │
                     ┌────────────────────┴───────────────────┐
                     │ count > 0                               │ count = 0
                     ▼                                         ▼
        ⚡ Auto-assign (recommended, preselected)      NoProvidersScreen
        ── or choose yourself ──                       (existing component)
        [ ● Raju K.  ⭐4.9 · ~25m ]  (≤4 cards)
                     │
                     ▼  preferredPartnerId = "" (auto) | partnerId
                  payment ─▶ POST /api/bookings (+ preferredPartnerId)
                                          │
                     gate → DRAFT → authorize → assignBestPartner(id,{preferredPartnerId})
                                          │  preferred tried first; taken → next best
                                          ▼
                     response { partner, preferredHonored } → tracker
                         preferredHonored=false → one-time "you got X instead" note
```

## Components & interfaces

### 1. Professional list (data) — reuse the matcher, enrich to a profile
- New pure helper `toPublicProfiles(ranked, pool, ctx, { max=4 })` → reuses the
  existing `NearbyProvider` shape `{ id, name, rating, jobsCompleted,
  distanceKm, etaMins }`. Distance from partner lat/lng → address via the
  existing haversine; ETA from distance (`AVG_KMPH`). Cap at `max`, preserve
  matcher rank order. Pure and unit-tested.
- Names/jobsCompleted come from one `partner.findMany` over the top-N ids
  (the matcher's `CandidatePartner` intentionally carries no PII).
- `GET /api/providers/availability` returns `{ count, professionals,
  suggestedSlots }` (was counts-only). One endpoint feeds both the choose list
  and the empty-state suggestions.

### 2. Assignment with preference + silent fallback
- `assignBestPartner(bookingId, { preferredPartnerId?, excludePartnerIds? })`:
  if `preferredPartnerId` is in the ranked set, move it to the front; walk as
  today (conflict-safe, SLOT_TAKEN → next). Returns
  `{ ok, partner, startOtp, preferredHonored }` where `preferredHonored` is
  `assignedId === preferredPartnerId`.
- `bookingSchema` gains `preferredPartnerId: z.string().optional()`.
- `POST /api/bookings` passes it through and returns `partner` +
  `preferredHonored`.
- The ordering (preferred-first, fallback, honored flag) is factored into the
  pure `assignFirstAvailable`/an order helper and unit-tested.

### 3. Choose step (UI) — reuse existing markup
- New `"choose"` step in `ServiceBookingFlow` between `details` and `payment`.
- On entering `choose`, fetch `/api/providers/availability`; empty →
  `NoProvidersScreen` (existing); else render Auto-assign card (preselected) +
  ≤4 pro cards, reusing the flow's existing `provider-card-v3` / radio markup
  (already used by the payment step) — no new component.
- Selection state `preferredPartnerId: "" | partnerId` ("" = auto).
- Remove the "N professionals available" banner from the payment step
  (superseded by this page).
- `createBooking` sends `preferredPartnerId`. On success with
  `preferredHonored === false`, show a one-time inline note ("You picked X — just
  booked, so you've got Y") before redirecting to the tracker.
- The pre-payment count gate on the details step's "Continue" is replaced by
  navigating to `choose` (which does the real availability fetch).

### 4. Reload-free realtime (polling + router.refresh)
- **Partner:** `GET /api/jobs/active` → `{ token }` where token =
  `bookingId:status` of the current active job (or `"idle"`), from
  `getPartnerActiveJobs`. A small client poller (reusing the `JobOfferPoller`
  placement/pattern) polls every 3s while ACTIVE; when the token changes it
  calls `router.refresh()`. This re-runs the existing server serialization
  (`ActiveJob`/`displayOffer`) and feeds fresh props to `captain-live`, whose
  existing stage-sync effect advances the work loop — so a directly-assigned job
  and its status changes render with no reload and zero serialization
  duplication.
- **Customer tracker:** already polls every 4s — unchanged.

### 5. Start OTP
- Already returned by the booking detail API for a paid `ASSIGNED` booking and
  rendered by `ElectricianTracker` ("Start code — share with your technician").
  It was invisible only because assignment used to 500 on UPI (fixed). Verified
  end-to-end here; no code change expected.

## Error handling
- Choose fetch fails → don't hard-block; allow continue (server gate in POST is
  authoritative) — mirrors the existing continue-to-payment fallback.
- Preferred pro taken → silent fallback (never dead-ends).
- Zero available at any check → `NoProvidersScreen` with suggested slots.
- Poller endpoint failure → last token stands; next poll retries.

## Testing
- Pure: `toPublicProfiles` (cap, order, distance/eta, no-geo fallback);
  preferred-first ordering + `preferredHonored` in the assignment loop.
- Manual E2E: pick-a-pro happy, pick-a-taken-pro fallback note, auto-assign,
  no-providers, start-OTP visible, and partner dashboard receiving a job live
  with no reload.

## Out of scope / deferred
- Reserving a picked pro during checkout (we chose silent fallback instead).
- Supabase Realtime / websockets (polling now; Django backend later).
- Removing the now-fully-dead legacy offer/wave machinery beyond the nearby
  matcher retired here.
```
