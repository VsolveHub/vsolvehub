# M1 — Single-Provider Booking Engine (Production Rebuild)

**Scope:** Build the entire single-provider lifecycle, production-ready, replacing all mock/simulated data, on a clean unified DB design.
**Lifecycle (both sides):**
`Customer books → dispatch → Partner accepts → en route → arrived → start (OTP) → working → complete → payment/escrow settle → partner withdraw → feedback (both sides)`

---

## Locked decisions (2026-07-01)

1. **Identity:** Merge onto **`Partner`** as the single provider identity. Delete `Provider`/`Worker`/`ProviderKycDocument`/`ProviderAvailability`; fold their dispatch fields (`isOnline`, `lat/lng`, availability) and offer/earning relations onto `Partner`.
2. **DB cleanup:** **DISCONNECT, do not delete** M3 (`Accommodation*`) and M4 (`Vehicle*`) — keep their models, routes, and UI intact for reuse in those milestones; just unwire their customer entry points so M1 stays focused. **Keep `Crew*`** (M2 reuses it). Slim `Booking` to the single-provider core.
   - **Scope:** build single-provider only for the **4 M1 services** — 🔧 Technician, 💄 Beautician, 🏠 Home Services, 🐾 Pet Services — all on archetype A (on-demand fixed-price, push-dispatch to a CAPTAIN partner).
3. **Payments:** Build a clean payment/escrow **service interface** with a working stub now; integrate **Razorpay/PhonePe** in the productionize phase.

---

## Root problem found in audit

- **Two disconnected provider identities:** partner app runs on `Partner`/`Crew` with a **hardcoded mock offer** (`offerFor()` in `app/live/page.tsx`); the real **push-dispatch engine** (`apps/customer/lib/fulfillment/push-dispatch.ts`) writes offers to `Provider` rows.
- `acceptOffer`/`declineOffer` are exported but **never called by any UI** — provider-accept path is dead code.
- Customer status advances via a **time-based simulation** (`syncBookingStatus`/`getSimulatedStatus`); `status/route.ts` grabs a `findFirst` demo provider on ASSIGNED and fabricates a revised quote on STARTED.
- `Booking` (~50 cols) overloads single-provider + crew + dispute/extension concerns; assignment exists three ways (`assignedProviderId`, `crewId`, `vendorId`).

What's good and kept: the push-dispatch algorithm, the `Partner` onboarding/KYC/status machine, the booking status vocabulary.

---

## Execution phases

### Phase 0 — Unify identity & DB cleanup
- Add to `Partner`: `isOnline`, `lat`, `lng`, availability relation, `jobAssignments`, `jobEarnings`.
- Repoint `JobAssignment.providerId` and `JobEarning.providerId` → `Partner`. Repoint `Booking.assignedProviderId` → `Partner`.
- Delete models: `Provider`, `Worker`, `ProviderKycDocument`, `ProviderAvailability`, `Vendor`, `VehicleDriver`, `VehicleRentalAsset`, `VehicleBooking`, `VehicleBookingStatusLog`, `PropertyOwner`, `AccommodationProperty`, `AccommodationBooking`, `AccommodationBookingStatusLog`, `Trip`.
- New `PartnerAvailability` (from `ProviderAvailability`).
- Migration + regen client. Fix all customer-app references (`prisma.provider/worker/jobAssignment`) to the unified model.

### Phase 1 — Clean single-provider Booking schema
- Slim `Booking` to single-provider core (move crew-only fields out / behind crew tables).
- `BookingStatusLog` is the authoritative timeline. Remove simulation helpers.

### Phase 2 — Real customer booking → dispatch
- Booking create → `dispatchBookingOffers` (real, on Partner) → `SEARCHING_PROVIDER`.
- Delete `getSimulatedStatus`, demo-provider assignment, fabricated revised quote.
- Customer tracker reads real status from `BookingStatusLog`.

### Phase 3 — Real partner accept → work loop
- Wire `/live` to real `JobAssignment` offers (replace `offerFor()` mock).
- Actions: Accept/Decline (`acceptOffer`) → En route → Arrived → **Start OTP** → Working → Complete, each writing status logs.

### Phase 4 — Completion → payment → withdraw
- On COMPLETE: settle escrow → `JobEarning` (commission split) → partner wallet → **withdraw** to `PayoutDetail`.
- Payment/escrow service interface (Razorpay impl later).

### Phase 5 — Feedback both sides
- Customer rates partner → recompute `Partner.rating`; partner rates job/customer. Close loop.

### Phase 6 — Productionize
- Real OTP SMS (replace `console.log`), real payment gateway, file storage, remove seed/mock providers, state-machine tests.

---

## Status

- [x] **Phase 0a — Identity merge (DONE, verified green).** `Provider`/`Worker`/`ProviderKycDocument`/`ProviderAvailability` deleted; their dispatch fields (`isOnline`, `lat/lng`, `acceptanceRate`, availability) folded onto `Partner`; `JobAssignment`/`JobEarning`/`Booking.assignedPartner` repointed to `Partner`; dead `provider` query+notification scaffolding removed; seeds repointed (1 dispatch-ready ACTIVE online CAPTAIN near demo address); DB reset + reseeded; **customer + partner apps typecheck with 0 errors**.
- [ ] Phase 0b — Delete M3/M4 (`Vehicle*`/`Accommodation*`) models + routes/components/seeds + mock `Vendor`/`VehicleDriver`
- [ ] Phase 1 — Clean Booking schema
- [ ] Phase 2 — Customer booking → dispatch
- [ ] Phase 3 — Partner accept → work loop
- [ ] Phase 4 — Payment → withdraw
- [ ] Phase 5 — Feedback both sides
- [ ] Phase 6 — Productionize
