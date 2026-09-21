# Implementation Plan: M3 Part A — HUGE CHUNK (one Cursor session)

**Date:** 2026-09-15  
**Mode:** Single agentic mega-session (user request: plan a huge change chunk in one go)  
**Specification link:** [Implementation Plan: M3 Part A — Rental + Stay + Career E2E](https://app.notion.com/p/3dcde648d339814a8de1f7c1ff5f2979)  
**Local parent plan:** `srikar-prompts/M3_PART_A_E2E_IMPLEMENTATION_PLAN.md`  
**Design authority:** `Django_Next.js_Plan/M3/03-rental-stay-jobs-categories.md` (Waves D0/D1/D2)  
**Trunk tip at plan time:** `feature/m3-a10-listings` @ `a0cbd90`  
**Target branch:** M3 integration trunk only — **never merge to `main`** in this chunk

---

## Overview

Land the **remaining Part A surface** in **one Cursor session**: shared D0 wiring + A7 Rental MVP + A9 Stay MVP across Customer, Partner, and Admin/Operations, plus demo seeds and a combined smoke runbook. Career (A10) already exists on trunk — **do not rewrite**; only extend registry/routing if A7/A9 shells need the same patterns.

This is intentionally larger than a normal `/next` slice. Prefer **2–4 logical commits** at the end (or one commit if the tree stays reviewable), then push and leave a **draft PR into the trunk** (or update draft PR #1 vs `main` without requesting merge).

**Estimate if sequential slices:** ~5–7 agentic days. **Mega-session risk:** HIGH file thrash / partial money paths — enforce MVP cuts below.

---

## Current state (facts)

| Area | Status |
| --- | --- |
| A10 Career | On trunk (`apps/listings`, FE `/listings`, `seed_listing_catalog`, Partner chrome gate `a0cbd90`). Owner smoke still pending. |
| `BookingArchetype` | Has `A10_LISTING`; **missing** `A7_RENTAL` / `A9_STAY` |
| `apps/rental`, `apps/stay` | **Do not exist** |
| Wallet / live Razorpay | **OUT of this chunk** (Part B). Use fail-closed / test-provider / simulated deposit holds labeled PARTIAL if needed. |
| AI chatbot/search | **OUT OF SCOPE** |

---

## Technical approach

1. **Contract-first:** short proposals under `contracts/proposals/` for A7 + A9 → Django models/commands → `manage.py spectacular` → regenerate FE client. No hand-edit of `contracts/openapi/v1.yaml` or `frontend/packages/api-client/src/generated/`.
2. **Ownership:** Codex patterns for `backend/**` + OpenAPI publication; Claude patterns for `frontend/**` + proposals. One Cursor session may touch both — keep boundaries in file layout and commit messages.
3. **Do NOT reuse** `Booking` / `FulfilmentUnit` / visit OTP for A7/A9 (design §2.1).
4. **Fail-closed:** every create/publish/book path requires ACTIVE `A7VariantConfiguration` / `A9VariantConfiguration` + approved partner capability.
5. **Seeds only:** `seed_rental_demo` / `seed_stay_demo` via domain services — ban FE hardcoded catalogs.
6. **Partner nav:** register `A7_RENTAL` / `A9_STAY` in `WORKSPACE_REGISTRY`; unknown keys render nothing; extend `primaryShellNavFor` / listing-style chrome so A7-only / A9-only partners do not live on A1 `/work/all` unless mixed grants require Work.
7. **Admin:** extend existing `frontend/apps/admin` ops shell — never create `frontend/apps/operations`.

### MVP cuts (mandatory — keeps the huge chunk shippable)

**A7 Rental MVP**
- Models: `RentalAsset`, availability/block, `RentalBooking` (+ line), `RentalDeposit` (simple state machine: REQUESTED → AUTHORIZED/HELD → RELEASED | PARTIALLY_CONSUMED | FULLY_CONSUMED).
- Skip for later: full extension revisions, accessory catalog ML, third-party damage estimates, Celery expiry sweeps beyond a minimal stub comment.
- Happy path: browse → book → (test) deposit hold → partner handover → return → deposit release. Ops: one dispute/moderation queue with required reason.

**A9 Stay MVP**
- Prefer **enquiry-first** if faster: `Property`, `Unit`/`UnitType`, `StayEnquiry` inbox (customer create → partner respond). Optional thin `StayReservation` only if enquiry alone is insufficient for PDF “usable”.
- Skip for later: full UnitReservation locking matrix, no-show automation, multi-room cart.
- Ops: property moderation + abuse case with reason.

**Money**
- Integer paise; purposes named distinctly (`A7_DEPOSIT_HOLD`, etc.) if wired.
- If `PAYMENT_PROVIDER` is unconfigured, fail closed on live capture; seed can create HELD deposits via **domain test helpers / management command** for demo — document as PARTIAL money.

---

## Phases inside the one session (execute in order)

### Phase A — Guardrails + D0 shared wiring
- [ ] Read `AGENTS.md`, design §2–§5, existing A10 patterns (`listings`, `A10VariantConfiguration`, `seed_listing_catalog`, Partner registry).
- [ ] Add `A7_RENTAL` / `A9_STAY` to `BookingArchetype` (+ PartnerCapability / business-type adapters as needed).
- [ ] Add `A7VariantConfiguration` / `A9VariantConfiguration` (mirror A10 ACTIVE fail-closed).
- [ ] Seed catalog categories/services/variants for Rental + Rooms/PG/Hostel/Hotels.
- [ ] Proposal docs + OpenAPI publish + client regen for new enums/endpoints as they land.
- [ ] Partner `WORKSPACE_REGISTRY` entries + shell chrome for A7-only / A9-only.
- [ ] Customer `serviceHref` (and catalog routing) → A7/A9 surfaces, never accidental cart/`/book/`/`/requests/` unless design explicitly says so for paid rental/stay checkout.

### Phase B — A7 Rental E2E MVP
- [ ] New backend app (e.g. `backend/apps/rental/`) models, services/commands, serializers, urls, tests under `backend/tests/rental/`.
- [ ] Customer: browse → asset detail → date range → book → My rentals.
- [ ] Partner: inventory CRUD, availability, booking inbox, handover/return.
- [ ] Admin: rental queue/disputes with required reason.
- [ ] `seed_rental_demo` management command.

### Phase C — A9 Stay E2E MVP
- [ ] New backend app (e.g. `backend/apps/stay/`) models, services, HTTP, tests under `backend/tests/stay/`.
- [ ] Customer: browse/filter → property/unit → enquiry (or book) → My enquiries/stays.
- [ ] Partner: property/unit management + enquiry inbox.
- [ ] Admin: stay listing moderation + abuse.
- [ ] `seed_stay_demo` management command.

### Phase D — Cross-portal polish (still same session)
- [ ] `docs/runbooks/m3-part-a-smoke.md` (Career + Rental + Stay demo phones/paths).
- [ ] Registry + href regression tests.
- [ ] Do **not** mark `Django_Next.js_Plan/M3/task.md` Wave D1/D2/D3 `[x]`.
- [ ] Do **not** Accept ADR-0012 or invent A7/A9 ADRs as Accepted without owner.
- [ ] Do **not** merge `origin/m3-changes` or cherry-pick `3fa3016`.
- [ ] Leave `srikar-prompts/` **untracked**.

---

## Dependencies

| Need | Status |
| --- | --- |
| Trunk `feature/m3-a10-listings` | Present @ `a0cbd90` |
| A10 patterns to copy | Present |
| Design doc D0/D1/D2 | Present |
| Owner smoke for A10 | Optional before/after — not a code blocker for starting A7/A9 |
| Part B wallet/Razorpay live | Deferred |

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Mega-diff unreviewable | MVP cuts; 2–4 commits; Manager `/review` before any main talk |
| Deposit money bugs | HIGH ALERT; idempotent commands; fail-closed provider |
| Booking reuse by mistake | Explicit ban list in PR; tests assert no FulfilmentUnit FK |
| FE fake data | Seeds only |
| `git add -A` | Forbidden — stage explicit paths |

---

## Acceptance (built — owner verification pending)

- [ ] A7: customer books seeded asset; partner handover/return; admin sees queue
- [ ] A9: customer enquiry (or reservation); partner responds; admin moderates
- [ ] A10 unchanged in product law; still no Work chrome for A10-only
- [ ] Seeds: `seed_listing_catalog` + `seed_rental_demo` + `seed_stay_demo`
- [ ] Focused pytest for rental + stay (+ existing listings) with `--no-cov` as needed
- [ ] FE vitest for registry/serviceHref/shell
- [ ] Smoke runbook written
- [ ] Draft PR updated; **no** merge to `main`

---

## Commit instruction (REQUIRED — end of session)

After the implementation work above is complete and focused tests you can run are green (or failures documented):

1. `git status` — confirm `srikar-prompts/` is **not** staged.
2. Stage **explicit paths only** (never `git add -A`). Prefer logical commits, for example:
   - `feat(m3): D0 A7/A9 archetypes, configs, catalog seeds`
   - `feat(a7): rental MVP domain + portals + seed_rental_demo`
   - `feat(a9): stay MVP domain + portals + seed_stay_demo`
   - `docs(m3): Part A combined smoke runbook`
3. Each commit message: what + why; include `Co-authored-by: Cursor <cursoragent@cursor.com>` if that is the repo convention.
4. `git push -u origin HEAD` (or push existing trunk branch).
5. Update/open **draft** PR targeting the integration story (do **not** request merge to `main`; do **not** mark ready-for-merge).
6. Report back: SHAs, file summary, how to run seeds/tests, known PARTIAL money items.

If blocked mid-session, still commit whatever is coherent on a WIP branch message (`wip(m3): …`) rather than leaving a dirty unrecoverable tree — still no `git add -A`, still no `main` merge.

---

## Cursor paste prompt (entire huge chunk)

```text
You are implementing ONE huge M3 Part A chunk on the integration trunk. Do not merge to main.

Repo: VsolveHub/vsolvehub
Worktree: /home/srikar/vsolvehub/vsolvehub
Branch: feature/m3-a10-listings (continue from current tip). Never merge origin/m3-changes. Never cherry-pick 3fa3016.
Leave srikar-prompts/ untracked. Never git add -A. Stage explicit paths only.

## Spec
Follow Django_Next.js_Plan/M3/03-rental-stay-jobs-categories.md (A7/A9) and the Part A plan patterns already used for A10.
Also see local: srikar-prompts/M3_PART_A_HUGE_CHUNK_CURSOR_PLAN.md and Notion Part A plan.

## Goal (one session)
1) D0: add A7_RENTAL + A9_STAY to BookingArchetype; A7VariantConfiguration + A9VariantConfiguration (ACTIVE fail-closed); catalog seeds; Partner WORKSPACE_REGISTRY + shell chrome so A7-only/A9-only are not stuck on A1 Work; customer serviceHref routing.
2) A7 Rental MVP E2E: new backend app, Customer/Partner/Admin surfaces, seed_rental_demo, tests. No Booking/FulfilmentUnit reuse. Deposit state machine MVP; money may be PARTIAL with test/fail-closed provider.
3) A9 Stay MVP E2E: prefer enquiry-first Property/Unit + StayEnquiry inbox if faster; three portals; seed_stay_demo; tests. Document MVP choice in a short proposal.
4) docs/runbooks/m3-part-a-smoke.md covering Career + Rental + Stay.
5) Do not rewrite A10. Do not mark task.md [x]. Do not Accept ADRs. Do not implement wallet/AI/Rapido.

## Product law
- Django owns pricing/permissions/status/money. Integer paise. Fail-closed providers.
- Listing≠Booking; A7/A9 ≠ Booking/FulfilmentUnit/visit OTP.
- Contract-first: proposal → Django → spectacular → regenerate client. No hand-edit of openapi yaml or generated schema.d.ts.
- Codex-shaped backend/** + openapi; Claude-shaped frontend/** + proposals.
- Admin = frontend/apps/admin only.

## REQUIRED: commit after completing the task
When the chunk is done (or a coherent WIP stopping point):
1. git status — ensure srikar-prompts/ untracked and unstaged.
2. Stage explicit paths only (never git add -A).
3. Prefer 2–4 logical commits (D0 / A7 / A9 / docs) with clear messages + Co-authored-by: Cursor <cursoragent@cursor.com> if conventional.
4. Push to origin on feature/m3-a10-listings.
5. Update draft PR; do NOT merge to main; do NOT mark Wave D1/D2/D3 [x].
6. Reply with SHAs, how to migrate/seed/test, and PARTIAL items.

## Out of scope
main integrate, live Razorpay activation, wallet/coins/referral, Rapido, AI search/chatbot, full damage ML, full stay locking matrix.
```

---

## Optional next (after this chunk)

Owner: `/review` on the resulting SHA(s) → smoke → then Part B money / M4 Rapido per 30-day plan. Still no `main` until full M3 gate.
