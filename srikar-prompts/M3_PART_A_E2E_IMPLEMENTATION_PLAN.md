# Implementation Plan: M3 Part A — Rental + Rooms/Stay + Career (E2E)

**Date:** 2026-09-15  
**Specification sources:** Client M3/M4 PDF (Part A); `Django_Next.js_Plan/M3/03-rental-stay-jobs-categories.md`; `Django_Next.js_Plan/M3/task.md` Wave D1/D2/D3; ADR-0012 (Career); live trunk `feature/m3-a10-listings`  
**Target branch:** M3 integration trunk (PRs into trunk — **not** `main` until full M3 gate)  
**Portals:** Customer + Partner + Admin/Operations — end to end  
**Status:** DRAFT v2 — cross-checked against M1/M2 planning patterns (2026-09-15).
**Notion:** Mirrored as a private draft page when connector is connected.

---

## Overview

Deliver PDF **M3 Part A** only: three new categories, fully usable on staging across Customer, Partner, and Admin portals.

| # | Category | Archetype | Current state |
| --- | --- | --- | --- |
| 1 | Career / Job Opportunities | `A10_LISTING` | **PARTIAL** on trunk (`listings/**`, FE `/listings`, seed). Finish staging/UI + ops polish |
| 2 | Rental Services | `A7_RENTAL` | **MISSING** — build per design doc Wave D1 |
| 3 | Rooms / PG / Hostel / Hotels | `A9_STAY` | **MISSING** — build per design doc Wave D2 |

**Mock / demo data:** Use **seed commands + fixtures** (same pattern as `seed_listing_catalog`), not production UI fake/fallback payloads. Screens show real seeded rows or honest empty/error states.

---



## Patterns borrowed from M1/M2 (must follow)

### Delivery / gates (M1 `04-acceptance`, M2 `task.md`)
- Build waves land as **`[~] built — owner verification pending`**. Merging to an integration trunk (or even `main`) **does not** equal acceptance.
- Acceptance = **actor-driven E2E** on staging against authoritative Django (Customer + Partner + Ops agree after refresh/new login) — unit tests alone are not DONE.
- Money paths: prefer **provider test callbacks** over live money for Part A demos (M2 acceptance rule); no Ops DB edits to recover a scenario.
- Evidence: commit IDs, actors, result, link; redact PII.

### Seeding (M1/M2 commands — do not invent client mocks)
Existing pattern to copy:
- `seed_technician_catalog` / `seed_task_catalog` / `seed_listing_catalog`
- `seed_m2_demo`, `seed_console_demo_data`, `seed_test_partner`, `seed_partner_reference_data`
New Part A seeds (management commands calling **domain services**, not raw SQL dumps):
- Extend/keep `seed_listing_catalog` for Career
- Add `seed_rental_demo` / `seed_stay_demo` (names TBD) mirroring `seed_m2_demo`
- Ops consoles get rows via real commands (M1: `seed_console_demo_data` filled consoles through domain services)

**Ban:** hardcoded FE lists, optimistic “success” without server truth, fallback catalog cards when API fails.

### Partner portal (M2 workspace registry)
- Server capability key → `WORKSPACE_REGISTRY` (`A3_TIME_BLOCK`, `A5_CUSTOM_PROJECT`, `A10_LISTING` already).
- Add **`A7_RENTAL`** and **`A9_STAY`** workspace definitions; **unknown key renders nothing** (M2-AC-012) — never fall back to generic Jobs/`/work`.
- Multi-capability partners use explicit workspace switcher; separated states.

### Customer portal (M1/M2 FE waves)
- Mount under existing shells (`(flow)` / catalog routing).
- `serviceHref` (and equivalents) must route A7/A9/A10 to their surfaces — **not** cart/`/book/`/`/requests/` unless design says so.
- Contract version bump + `pnpm contract:check` like M2 gates.

### Admin / Operations (M1 FE-16/FE-18, M2 Wave B4)
- Extend **existing** ops shell/nav — do not create `frontend/apps/operations`.
- Queues: moderate / remove / reinstate / disputes with **reason required**; maker-checker where money moves.
- Seed ops demo rows through domain services.

### Backend wave shape (M2 C-waves)
For each archetype: models → commands → HTTP/OpenAPI → FE consume → seed → smoke runbook in `docs/runbooks/m3-*-smoke.md`.

### Branching (M2 integrate pattern)
Slice PRs → **M3 trunk** only; integrate to `main` when full M3 gate passes — not after Part A alone unless owner explicitly changes policy.


## Technical approach

1. **Reuse** catalog (`Category → Subcategory → Service → Variant`), partners/capabilities, identity, ops cases, OpenAPI → generated client, admin ops shell.  
2. **Do not** force A7/A9 through `Booking` / `FulfilmentUnit` / visit OTP (design forbids). New domains: rental assets/bookings/deposits; stay properties/units/reservations or enquiry inbox.  
3. **A10** already separate `apps.listings` — complete rather than rewrite.  
4. **Contract-first:** proposal → Django → spectacular `v1.yaml` → regenerate FE client.  
5. **Agentic slices** on trunk; Manager reviews each PR.

---

## Phase 0 — Trunk + Career close-out (est. 0.5–1 day)

**Depends on:** nothing  
**Target:** trunk stable; Career E2E demoable

- [ ] Confirm M3 trunk (keep/rename `feature/m3-a10-listings`); no merge to `main`
- [ ] Owner staging: migrate + `seed_listing_catalog` + pytest `tests/listings/test_a10_flow.py`
- [ ] Owner UI pass: Customer browse/apply, Partner list/leads, Ops moderate/remove/reinstate
- [ ] Expand seed: Featured demos, employer partner, sample applications (already partially present)
- [ ] Admin: Job Listings queue complete + report abuse cases visible

**Exit gate:** Career DONE on trunk/staging for three portals with seed data.

---

## Phase 1 — Shared D0 catalog wiring (est. 0.5 day)

**Depends on:** Phase 0  
- [ ] Seed/extend spreadsheet categories for Rental + Rooms/PG into catalog
- [ ] Add `A7_RENTAL` / `A9_STAY` to `BookingArchetype` + PartnerCapability options
- [ ] `A7VariantConfiguration` / `A9VariantConfiguration` (ACTIVE fail-closed, mirror A10)
- [ ] OpenAPI + client regen for archetype enums

**Exit gate:** Variants exist; create commands fail closed without ACTIVE config.

---

## Phase 2 — A7 Rental E2E (est. 2–3 days)

**Depends on:** Phase 1  
**Backend**
- [ ] Models: `RentalAsset`, media, maintenance; `RentalBooking` + lines; `RentalDeposit`; handover/return (MVP subset per design)
- [ ] Commands: list/create asset, set availability, create booking, capture/hold deposit, handover, return, cancel
- [ ] Money: checkout-free or booking payment purposes as designed; **no** FulfilmentUnit allocation — parallel allocation pattern if needed
- [ ] Ops cases: rental abuse / damage dispute (minimal)
- [ ] Tests: happy path + fail-closed + deposit idempotency + authz isolation

**Customer portal**
- [ ] Browse rental services → listing groups → asset detail → date range → book/pay deposit
- [ ] My rentals list/detail (status, deposit state)

**Partner portal**
- [ ] Inventory CRUD, availability/blocks, booking inbox, handover/return actions
- [ ] Capability onboarding for rental owner type

**Admin portal**
- [ ] Ops queue: rentals needing moderation/dispute; reinstate/remove with reason
- [ ] Read-only booking/deposit inspection

**Seed / mock**
- [ ] `seed_rental_catalog` (or extend seed): N assets across subcategories, one demo partner, 2–3 bookings in varied statuses, one deposit held/released

**Exit gate:** Customer books seeded asset; Partner completes handover; Admin sees case; tests green.

---

## Phase 3 — A9 Stay / Rooms E2E (est. 2–3 days)

**Depends on:** Phase 1 (can parallel Phase 2 with second agent if file ownership split)  
**Backend**
- [ ] Models: `Property`, `Unit`/`UnitType`, media, policies; enquiry inbox **or** `StayReservation` (pick per design §5 — prefer enquiry-first MVP if faster, document choice)
- [ ] Commands: property CRUD, unit CRUD, publish, enquiry create/respond **or** reserve + deposit
- [ ] Fail-closed ACTIVE `A9VariantConfiguration` + partner capability
- [ ] Tests: authz, duplicate enquiry, status machine

**Customer portal**
- [ ] Browse stay types → property/unit detail → filters → enquiry or book
- [ ] My enquiries / stays

**Partner portal**
- [ ] Property/unit management, enquiry inbox, respond/accept

**Admin portal**
- [ ] Moderation for listings; dispute/abuse cases

**Seed / mock**
- [ ] `seed_stay_catalog`: PG/hostel/hotel samples, units with AC/sharing attributes, open enquiries

**Exit gate:** Customer submits enquiry (or books); Partner responds; Admin can moderate; tests green.

---

## Phase 4 — Cross-portal polish + Part A acceptance (est. 1 day)

**Depends on:** Phases 0–3  
- [ ] Nav/workspace registry: A7/A9/A10 keys render correct shells (unknown key → empty)
- [ ] `serviceHref` / catalog routing: no accidental `/book/` or cart for these archetypes
- [ ] One smoke runbook: `docs/runbooks/m3-part-a-smoke.md`
- [ ] Owner acceptance checklist (three portals × three categories)
- [ ] Still **no** integrate to `main` until broader M3 gate

**Exit gate:** Written Part A DONE on trunk; DEFER list for non-MVP rental/stay edges.

---

## Dependencies

| Need | Status |
| --- | --- |
| M3 trunk (not `main`) | In use |
| Design doc A7/A9/A10 | Exists |
| Career code | PARTIAL on trunk |
| Live Razorpay for A7/A9 deposits | **Part B** — may use test provider / simulation for Part A demo if owner accepts; flag as PARTIAL money until Phase B |
| Wallet | Not required for Part A MVP if deposits go through PaymentAttempt |

---

## Risks

| Risk | Mitigation |
| --- | --- |
| A7/A9 larger than A10 | MVP cut: rental without full maintenance ML; stay enquiry-first |
| Mock data becomes production fake UI | Seeds only; ban client hardcoded lists |
| Parallel agents file thrash | Codex owns `backend/**`+openapi; Claude owns `frontend/**`+proposals |
| Early `main` merge | Forbidden until M3 integrate gate |
| Deposit money bugs | HIGH ALERT review; idempotent webhooks |

---

## Estimates (agentic days)

| Phase | Days |
| --- | --- |
| 0 Career close | 0.5–1 |
| 1 Shared D0 | 0.5 |
| 2 A7 Rental | 2–3 |
| 3 A9 Stay | 2–3 |
| 4 Polish + accept | 1 |
| **Total Part A** | **~6–8.5** |

---

## Cursor session order (suggested)

1. Career staging/UI + seed polish (trunk)  
2. D0 archetypes + configs + seeds  
3. A7 backend + tests + OpenAPI  
4. A7 FE customer/partner/admin + seed  
5. A9 backend + tests + OpenAPI  
6. A9 FE three portals + seed  
7. Cross-portal smoke runbook  

Use `/next` for a paste-ready prompt per session.
