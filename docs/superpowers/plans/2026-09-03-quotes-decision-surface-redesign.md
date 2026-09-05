# Quotes Decision-Surface Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the customer quote screens into a *decision surface* (`/quotes`) and a *document* (`/quotes/{id}`), rebuild both for mobile and desktop, and add a non-binding customer price ask that rides the existing `RevisionRequest` spine.

**Architecture:** Frontend-first. Tasks 1–7 are pure customer-app work with no backend dependency and ship independently. Tasks 8–12 add the `PRICE` reason code and `requested_discount_bps` / `countered_discount_bps` to `RevisionRequest`, the customer sheet, and the partner accept/counter/decline surface. Desktop is an additive `lg:` layer over a complete 375px layout — never a separate component tree.

**Tech Stack:** Next.js App Router, React 19, TanStack Query, Tailwind v4 (`@theme` brand tokens), `@vsolve/ui` primitives, Django 5 + DRF + drf-spectacular, `openapi-typescript` codegen.

**Spec:** [docs/superpowers/specs/2026-09-03-quotes-decision-surface-redesign-design.md](../specs/2026-09-03-quotes-decision-surface-redesign-design.md)

## Global Constraints

- **Contract version 1.60.0.** Additive only. No existing row migrates.
- **The invariant, restated:** a customer may state what they *hope to pay*; only a vendor states what the work *costs*. The ask binds nobody. Docstrings at `backend/apps/requirements/models/matching.py:544` and `backend/apps/requirements/proposals.py:960` currently assert the opposite and MUST be rewritten, not left standing.
- **Money is integer paise everywhere.** Discounts are basis points (`5%` → `500`). No float touches money.
- **Never invent or reconcile a number.** The stage-total check *reports* a mismatch; it never adjusts a displayed figure.
- **No paywall states.** `M2-FE-423` — no part of a paid-for estimate is ever gated.
- **Price ask suppressed when `card.rateLabel !== null`** (A3 day-hire): that price comes from the ops rate card, not the vendor.
- **Trust honesty:** withhold the star below 5 completed jobs; render `New on Vsolve — N review(s) so far` instead. Never show a raw enum (`WORKFORCE_AGENCY` → "Workforce agency").
- **Mobile-first.** Every `lg:` rule is additive over a shippable 375px layout. Wide content scrolls inside its own `overflow-x-auto`; the page body never scrolls sideways.
- **Testing:** write tests, do not run them (owner runs the suite). Static gates only — `pnpm lint`, `pnpm typecheck`, `quality-static.ps1`.
- **Commits:** one commit at the very end, not per task.

---

### Task 1: Adapter derivations

**Files:**
- Modify: `frontend/apps/customer/features/quotes/adapters/index.ts`
- Test: `frontend/apps/customer/features/quotes/adapters/decision.test.ts` (create)

**Interfaces:**
- Produces: `QuoteStageView.amountPaise: number`; `stageTotalMismatchPaise(card): number | null`; `superlativeFor(card, cards): Superlative | null`; `priceSpread(cards): { lowLabel, highLabel, spreadLabel, spreadPercent } | null`; `discountPreview(payablePaise, bps): { newTotalLabel, savingLabel }`; `canAskAboutPrice(card): boolean`.

- [ ] **Step 1:** Add `amountPaise: stage.amount_paise` to `QuoteStageView` and `toStageViews`.
- [ ] **Step 2:** Add `stageTotalMismatchPaise` — `sum(stages.amountPaise) - payablePaise`, returning `null` when `stages.length === 0` or `|Δ| <= 100`.
- [ ] **Step 3:** Add `superlativeFor` returning at most one of `CHEAPEST` / `LONGEST_WARRANTY` / `SOONEST` / `null`, ranked in that order, and only when `cards.length > 1` and the card actually wins outright (ties yield `null`).
- [ ] **Step 4:** Add `priceSpread`, `discountPreview` (integer paise, `Math.round(payablePaise * bps / 10_000)`), and `canAskAboutPrice` (`isSelectable && !isExpired && rateLabel === null && revisionRequest?.status !== "OPEN"`).
- [ ] **Step 5:** Write `decision.test.ts` covering the ₹5,087 mismatch case, a balanced schedule returning `null`, a superlative tie returning `null`, and `discountPreview(22065131, 500)`.

---

### Task 2: Trust-line honesty

**Files:**
- Modify: `frontend/apps/customer/features/quotes/view/vendor-trust-line.tsx`

- [ ] **Step 1:** Add `MIN_JOBS_FOR_RATING = 5`. Below it, suppress the star and render `New on Vsolve — N review(s) so far` (or bare `New on Vsolve` at zero), keeping tenure as a separate clause.
- [ ] **Step 2:** Drop `activeSinceLabel` when `experienceYears > 0` — `6 yrs · since 2026` is self-contradictory.
- [ ] **Step 3:** Export `vendorTypeLabel(raw)` turning `WORKFORCE_AGENCY` into `Workforce agency`; use it in both the card and the detail header.

---

### Task 3: Four Facts on the card

**Files:**
- Modify: `frontend/apps/customer/features/quotes/view/quote-card.tsx`

- [ ] **Step 1:** Replace the ad-hoc price row + 2-tile grid with a fixed 2×2 `FourFacts` grid: **Total · To start · Done by · Holds for**, same slots on every card regardless of which values are null.
- [ ] **Step 2:** Render the superlative chip from `superlativeFor`, at most one.
- [ ] **Step 3:** Collapse the footer to `Read in full ›` + a `⋯` overflow menu (Ask a question · Ask about the price · Ask for a change · Not this one). Delete the four inline buttons.
- [ ] **Step 4:** Keep the radio semantics and `scopeGaps` strip exactly as they are.

---

### Task 4: List page — one estimate

**Files:**
- Modify: `frontend/apps/customer/features/quotes/view/quotes-screen.tsx`

- [ ] **Step 1:** Delete the embedded `<EstimateDetailScreen embedded>` branch. The one-estimate case renders a `QuoteCard` plus a `BeforeYouDecide` panel.
- [ ] **Step 2:** Add the stage-mismatch strip driven by `stageTotalMismatchPaise`.
- [ ] **Step 3:** `BeforeYouDecide` carries `Get another estimate — free` and `Ask about the price`, with the "nothing is charged either way" note.
- [ ] **Step 4:** Desktop `lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start`.
- [ ] **Step 5:** Remove `embedded` / `hideShoppingList` from `EstimateDetailScreen` once no caller passes them.

---

### Task 5: List page — header and progress

**Files:**
- Modify: `frontend/apps/customer/features/quotes/view/quotes-screen.tsx`

- [ ] **Step 1:** Header shows count, then `priceSpread` (`₹1,98,400 — ₹2,61,000 · spread 32%`) when more than one.
- [ ] **Step 2:** Replace the buried "N more are due" clause with `●●○ 1 of 2 visits done` dots derived from `planQuery.data.plan.plan_size` vs `cards.length`.
- [ ] **Step 3:** Delete the reassurance paragraph.

---

### Task 6: Desktop comparison matrix

**Files:**
- Modify: `frontend/apps/customer/features/quotes/view/quote-comparison.tsx`
- Modify: `frontend/apps/customer/features/quotes/view/quotes-screen.tsx`

- [ ] **Step 1:** Sticky header band (`sticky top-0 z-20`) carrying identity, trust, total, superlative and a real `Choose ›` link to `estimateConfirmHref`.
- [ ] **Step 2:** Sticky row-label gutter (`sticky left-0 z-10`) so 4+ estimates scroll horizontally without orphaning labels.
- [ ] **Step 3:** Fold the Four Facts into the top row group; keep `scopeDifferenceRows` as the second group with a `Show all ▾` toggle revealing shared rows.
- [ ] **Step 4:** In `quotes-screen.tsx`, delete the `lg:grid-cols-2 xl:grid-cols-3` duplicate card grid and the `SegmentedTrack`. Below `lg`: cards + a compact difference table. At `lg`: the matrix alone, and no sticky bottom bar.

---

### Task 7: Detail page — three bands + desktop rail

**Files:**
- Modify: `frontend/apps/customer/features/quotes/view/estimate-detail-screen.tsx`
- Create: `frontend/apps/customer/features/quotes/view/price-lines.tsx`
- Create: `frontend/apps/customer/features/quotes/view/decision-rail.tsx`

- [ ] **Step 1:** Delete the `Included (N)` list and the concatenated `scopeSummary` blob; render `scopeSummary` only when it is not a join of `itemLines`.
- [ ] **Step 2:** `price-lines.tsx` — sort by amount descending, share bar on the top three, fold sub-₹100 lines behind `▸ N line(s) under ₹100`.
- [ ] **Step 3:** `Not included (0)` becomes one line plus `Ask what's out →`.
- [ ] **Step 4:** Collapse Terms and provenance into a Band-3 `Disclosure`.
- [ ] **Step 5:** Add the stage-mismatch strip.
- [ ] **Step 6:** `decision-rail.tsx` — sticky at `lg` (`sticky top-6`), carrying the verdict card, `Choose`, the price-ask entry, jump-nav with scroll-spy, `Ask them` and `Not this one`. Hidden below `lg`; the sticky bottom bar is hidden at `lg` and up.

---

### Task 8: Backend — `PRICE` reason and discount fields

**Files:**
- Modify: `backend/apps/requirements/models/matching.py:544-620`
- Create: `backend/apps/requirements/migrations/00NN_revision_request_price_ask.py`
- Modify: `backend/apps/requirements/proposals.py:114,555-570,952-1050`
- Modify: `backend/apps/requirements/serializers/enquiries.py:85-125`
- Test: `backend/tests/requirements/test_price_ask.py` (create)

- [ ] **Step 1:** Add `PRICE = "PRICE", "Asked about the price"` to `ReasonCode`; add `requested_discount_bps` and `countered_discount_bps` (`PositiveIntegerField(null=True, blank=True)`).
- [ ] **Step 2:** Add `CheckConstraint` — `requested_discount_bps` non-null **iff** `reason_code = "PRICE"`, and `1 <= bps <= 1500`.
- [ ] **Step 3:** Rewrite both docstrings to the restated invariant.
- [ ] **Step 4:** `request_revision()` gains `requested_discount_bps`; validate the range, refuse a second resolved `PRICE` ask on the same proposal (`409`), refuse when the proposal is rate-card priced (`409`).
- [ ] **Step 5:** Add `accept_price_ask(request_id, partner_id, granted_bps)` producing a superseding proposal with a single named `Negotiated discount` charge line — never pro-rated across item lines.
- [ ] **Step 6:** Serializers expose both bps fields; `RevisionRequestCreateSerializer` accepts `requested_discount_bps`.
- [ ] **Step 7:** Write `test_price_ask.py` — range rejection, non-PRICE with bps rejected, second ask 409, rate-card 409, accept produces the discount line, estimate stays selectable while OPEN.

---

### Task 9: Contract regeneration

**Files:**
- Modify: `frontend/packages/api-client/src/generated/schema.d.ts`
- Modify: `frontend/packages/query/src/m2-quotes.ts`

- [ ] **Step 1:** Add `"PRICE"` to `RevisionRequestReasonCodeEnum`; add both bps fields to `RevisionRequest` and `requested_discount_bps` to `RevisionRequestCreateRequest`.
- [ ] **Step 2:** Extend `RequestRevisionInput` with `requestedDiscountBps: number | null` and send it in the body.
- [ ] **Step 3:** Include the bps in the idempotency key so a 3% ask and a 5% ask are distinct.

---

### Task 10: The price-ask sheet

**Files:**
- Create: `frontend/apps/customer/features/quotes/view/price-ask-sheet.tsx`
- Delete: `frontend/apps/customer/features/quotes/view/revision-request-dialog.tsx`
- Modify: `frontend/apps/customer/features/quotes/view/quotes-screen.tsx`, `estimate-detail-screen.tsx`

- [ ] **Step 1:** One sheet replacing `RevisionRequestDialog`. Options in order: **It works for me** (routes to confirm, writes nothing) · **3% off** · **5% off** · **Name your own figure** · **It is not about the price** (revealing the four existing reason codes).
- [ ] **Step 2:** Live rupee arithmetic on every chip from `discountPreview`.
- [ ] **Step 3:** Custom input capped at 15%, soft warning above 10% steering to "leave something out".
- [ ] **Step 4:** Footer states the estimate stays live and choosable, and that the price may be asked about once.
- [ ] **Step 5:** Wire both screens to the new sheet; delete every `RevisionRequestDialog` import.

---

### Task 11: Pending and resolution states

**Files:**
- Modify: `frontend/apps/customer/features/quotes/view/estimate-detail-screen.tsx` (`RevisionRequestNotice`)

- [ ] **Step 1:** `OPEN` + `PRICE` → "You asked for N% off — ₹X", sent-at, and an explicit "you can still choose at ₹Y while you wait".
- [ ] **Step 2:** `ANSWERED` with `countered_discount_bps === requested_discount_bps` → "They agreed"; with a lower non-null value → "They came back at N%, not M%".
- [ ] **Step 3:** `DECLINED` → their note plus `Choose` / `Not this one`.
- [ ] **Step 4:** `Choose` stays enabled in every one of these states.

---

### Task 12: Partner side

**Files:**
- Modify: `frontend/apps/partner/features/proposal/view/proposal-status.tsx:222,349`
- Modify: `frontend/apps/partner/features/proposal/queries.ts`

- [ ] **Step 1:** Render the price ask with quoted total, asked total, and the rupee difference.
- [ ] **Step 2:** Three actions — `Agree — re-issue at ₹X` · `Offer a different figure` · `Cannot move — say why`.
- [ ] **Step 3:** State that the estimate stays live and the customer can still choose it at the original price.

---

## Verification

Static gates only. `pnpm lint`, `pnpm typecheck`, `pnpm contract:check`, `backend/quality-static.ps1`. Tests are written, not run — the owner runs them.

## Self-review notes

- Spec §1.1–1.10 each map to a task: 1.1→T4, 1.2→T7, 1.3→T7.1, 1.4→T7.1, 1.5→T7.3, 1.6→T1.2/T4.2/T7.5, 1.7→T7.2, 1.8→T2, 1.9→T3.3/T7.6, 1.10→T6.
- Spec §5A desktop maps to T4.4 (one-estimate two-column), T6 (matrix), T7.6 (rail).
- Spec §6 maps to T8–T12. §7.1 fields are named identically in T8, T9 and T11.
- §10 open questions are resolved in-plan by the Global Constraints (5 jobs, 15% cap); the 24h auto-close and the composer block remain owner decisions and are **not** implemented.
