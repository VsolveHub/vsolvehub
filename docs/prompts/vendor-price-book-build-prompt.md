# Build Prompt — Vendor Price Book (Phase A: anchor-and-band rate cards)

You are building a production feature in the VSolveHub monorepo at `c:\dev\vsolve`. Read this
whole document before writing any code. Where this document names an existing file, open and
read it before touching anything related — the codebase's conventions are the law here, and
every one of them is load-bearing.

## 1. What you are building, in one paragraph

Partners (electricians, painters, plumbers…) get a personal **rate card**: their own labour
rate for each work item in an **ops-curated catalog** ("6A switch fixing — per no."). Ops
publishes the catalog per trade with a **reference rate per city** and an allowed **band**
around it (e.g. −20%/+30%); a partner's rate must sit inside the band. When the partner
composes a quote (the existing estimate composer), lines auto-fill from their rate card. Two
new partner-facing dials — **Miscellaneous %** and **Margin %** — are capped by ops policy and
rendered as named, visible lines on the customer's breakdown. Partners may add **custom items**
(not in the catalog) but they are flagged, text-screened, capped as a share of the quote, and
queued for ops review so good ones graduate into the catalog. **Every percentage in this
feature is ops-editable at runtime — nothing is hardcoded**: band width has a global default,
an optional per-trade override, and an optional per-work-item override; the misc cap, margin
cap, and custom-share cap are policy values ops can change. All enforcement happens
**server-side at quote submission**, not just in the UI.

## 2. Repo orientation (read these first)

- `CONTRIBUTING.md` — stack, gates, contract workflow. Backend: Django + DRF + Celery +
  Postgres, mypy **strict**, ruff. Frontend: pnpm/turbo monorepo, Next.js 16 App Router +
  React 19 + TanStack Query + Tailwind v4, apps `customer` / `partner` / `admin`, shared
  packages `@vsolve/ui`, `@vsolve/query`, `@vsolve/api-client`.
- `backend/apps/requirements/models/rate_cards.py` — the existing **ops-published A3 rate
  card** (service_area × skill day rates, versioned publish lifecycle). Your catalog follows
  this pattern: same skill/service-area taxonomy, same publish-not-edit versioning.
- `backend/apps/requirements/models/financial.py` — `CommercialPolicy`: versioned,
  DRAFT→ACTIVE→RETIRED, all percentages as integer **bps** fields, activation requires an
  `approval_reference`. Your guardrail policy copies this exact shape.
- `backend/apps/requirements/financials.py` — the money engine. `ALLOWED_UNITS`,
  `ALLOWED_CHARGE_CODES`, line normalisation, and the validation that runs inside proposal
  submission. Your band/cap checks bolt into this pipeline.
- `backend/apps/requirements/proposals.py` — `submit_proposal` and friends; where
  `calculation_snapshot` is written.
- `backend/apps/requirements/models/matching.py` (~line 240–360) — the `Proposal` model:
  `item_lines` / `labour_lines` / `other_charges` JSON, the full money envelope, and the
  snapshot-everything philosophy.
- `backend/apps/requirements/serializers/enquiries.py` (~line 595–690) —
  `ProposalItemLineSerializer` etc. Your new line fields extend these.
- Backend module convention: large modules are **packages** with `__init__.py` re-exports and
  explicit `__all__` (mypy strict requires it). Follow the structure you find in
  `apps/requirements/models/` and `apps/requirements/views/`.
- Money convention: **amounts in integer paise, percentages in integer bps** (basis points,
  10000 = 100%). Never floats for money.
- `frontend/apps/partner/features/proposal/view/` — the estimate composer surfaces:
  `commercial-estimate-composer.tsx`, `item-wise-screen.tsx`, `labour-wise-screen.tsx`,
  `tap-estimate-composer.tsx`, `money-pad.tsx`. Auto-fill integrates here.
- `frontend/apps/admin/app/(operations)/operations/rate-cards/page.tsx` and
  `frontend/apps/admin/features/m2-rate-cards/` — the existing ops rate-card console. Your
  work-item console is its sibling and follows its patterns (and may use the new `@vsolve/ui`
  primitives: `DataTable`, `PageHeader`, `SplitView`, `Drawer`, `StatusChip`, `Toolbar`).
- `frontend/apps/partner/features/workspace/registry.ts` — nav registry; and
  `features/session/partner-shell.tsx` `PUSH_TITLES` for pushed-screen titles.
- Contract workflow: the OpenAPI contract `contracts/openapi/v1.yaml` (currently 1.45.x) is
  **generated** from DRF via drf-spectacular — never hand-edit it. After backend API changes:
  regenerate, run `pnpm contract:generate` for the TS client, update
  `contracts/openapi/CHANGELOG.md` with a minor version bump and a summary, commit generated
  artifacts. `pnpm contract:check` must pass.

## 3. Data model (backend — new module `apps/requirements/models/price_book.py`, re-exported from the models package)

### 3.1 `WorkItem` — the ops-curated catalog entry
- `id` UUID pk; `skill` FK → the same skill model `RateCard` uses; `name` (CharField 120,
  customer-visible, ops-authored); `unit` — choice constrained to
  `financials.ALLOWED_UNITS`; `description` (blank ok); `status` ACTIVE / RETIRED;
  `sort_order`; timestamps.
- Unique on (`skill`, `name`) for active items.
- **Per-item band override**: `band_below_bps` / `band_above_bps`, both **nullable** —
  `null` means "inherit" (see resolution order in 3.4).

### 3.2 `WorkItemRate` — the reference rate per city, published not edited
- FK `work_item`, FK `service_area`, `reference_rate_paise` (PositiveBigIntegerField),
  `version` (per work_item+area), `status` DRAFT / PUBLISHED / RETIRED, `published_at`,
  `published_by`. Publishing a new version retires the previous — copy the publish
  lifecycle and constraint style from `rate_cards.RateCard` (including its CheckConstraints).
- Only one PUBLISHED row per (work_item, service_area) — partial unique constraint.

### 3.3 `QuoteGuardrailPolicy` — every ops-flexible percentage, versioned
Copy the `CommercialPolicy` shape exactly (versioned, DRAFT→ACTIVE→RETIRED, unique
`version`, `approval_reference`, `effective_from`, one ACTIVE at a time):
- `default_band_below_bps` (seed 2000 = −20%), `default_band_above_bps` (seed 3000 = +30%)
- `misc_cap_bps` (seed 1000 = 10%), `margin_cap_bps` (seed 2500 = 25%)
- `custom_share_cap_bps` (seed 2000 = 20% of the work subtotal)
- `per_skill_bands` JSONField: `{skill_id: {"below_bps": int, "above_bps": int}}` — optional
  per-trade override layer. Validate keys/values in the serializer.
All are integers 0..10000 with DB CheckConstraints.

### 3.4 Band resolution order (write this as one pure function, unit-tested)
For a work item in a service area:
1. `WorkItem.band_below_bps/band_above_bps` if both set (per-item override), else
2. the active policy's `per_skill_bands[skill_id]` if present (per-trade), else
3. the active policy's `default_band_*_bps`.
Floor = `reference_rate_paise × (10000 − below_bps) / 10000` (round up),
Ceiling = `reference_rate_paise × (10000 + above_bps) / 10000` (round down). Integer math.

### 3.5 `PartnerRateItem` — the partner's saved rate
- FK `partner` (PartnerProfile), FK `work_item`, `rate_paise`, `is_active`, timestamps.
- Unique (`partner`, `work_item`).
- Validated against the band **for the partner's service area** on write; re-validated at
  quote submission (bands may have moved since the save — submission is the authority).

### 3.6 `CustomWorkItemReview` — the ops review queue
- FK `partner`, `proposal` (nullable — the quote it appeared on), `title`, `unit`,
  `rate_paise`, `status` PENDING / APPROVED / REJECTED, `resolved_by`, `resolved_at`,
  optional FK `promoted_work_item` set when ops approves it into the catalog.

### 3.7 `Proposal` additions (migration on the existing model)
- `misc_bps`, `margin_bps` (PositiveSmallIntegerField, default 0) — what the partner chose.
- Item lines (JSON rows, so serializer-level): each row gains optional `work_item_id` and
  boolean `is_custom` (default false). A row with `work_item_id` is a catalog line; a row
  with `is_custom: true` and no `work_item_id` is a custom line. Reject rows that are
  neither, and reject `work_item_id`s that don't resolve to an ACTIVE item the partner has.
- `calculation_snapshot` gains: `guardrail_policy_version`, per-line
  `{reference_rate_paise, band_floor_paise, band_ceiling_paise, rate_version}` for catalog
  lines, and computed `misc_amount_paise` / `margin_amount_paise`.

## 4. Money semantics for the dials

In `financials.py`, after the item/labour/other-charge subtotal (`line_subtotal_paise`):
- `misc_amount_paise = line_subtotal × misc_bps / 10000` (round half up, document it)
- `margin_amount_paise = line_subtotal × margin_bps / 10000`
- Both join the taxable value the same way `other_charges` do today — study how
  `authorized_charges_paise` flows into `taxable_value_paise` and mirror it, so tax,
  platform fee, commission and withholding all keep reconciling. **Do not invent a parallel
  money path.** Every downstream field (`customer_total_paise`, `partner_net_paise`, …)
  must still reconcile; extend the existing reconciliation tests.

## 5. Server-side validation (the actual guarantee — all inside proposal submission)

Add a validation stage in the `financials`/`proposals` pipeline that, for the submitting
partner's service area and the current ACTIVE policy + PUBLISHED rates:
1. Every catalog line's rate is within its resolved band → else refuse with error code
   `rate_outside_band`, message naming the floor and ceiling in rupees.
2. `misc_bps ≤ misc_cap_bps`, `margin_bps ≤ margin_cap_bps` → `dial_over_cap`.
3. Sum of custom-line amounts ≤ `custom_share_cap_bps` of the catalog-line subtotal →
   `custom_share_exceeded`. A quote with **only** custom lines is refused (`custom_only_quote`)
   — at least one catalog line anchors every quote.
4. Custom-line titles pass text screening: reject anything matching phone numbers (7+ digit
   runs, with or without separators), email addresses, or URLs → `custom_title_screened`.
   Look for an existing server-side contact-screening helper before writing one; if none
   exists, write it as a small pure module with tests.
5. On success, write the snapshot fields from §3.7.
Failure uses the codebase's existing typed API error classes (see
`apps/requirements/exceptions.py` for the pattern — subclass, register, document).
If no policy is ACTIVE or no rate is PUBLISHED for an item, **fail closed** with a clear
error — never invent a default (this is the codebase's stated philosophy; see the
`CascadePolicy` docstring in `rate_cards.py`).

## 6. API surface (DRF views following the package/view conventions)

Ops (reuse the operations auth/permission pattern from the existing rate-card views in
`apps/requirements/views/rate_card.py` / `crew_offers.py`):
- `GET/POST /api/v1/operations/work-items/` — list (filter by skill, status), create.
- `PATCH /api/v1/operations/work-items/{id}/` — edit name/description/sort/status/band overrides.
- `POST /api/v1/operations/work-items/{id}/rates/` — publish a reference rate for an area
  (creates the new PUBLISHED version, retires the old).
- `GET/POST /api/v1/operations/quote-guardrails/` + `POST .../activate/` — mirror the
  CommercialPolicy operations endpoints exactly.
- `GET /api/v1/operations/custom-item-reviews/` + `POST .../{id}/resolve/`
  (approve → optionally create the WorkItem + rate in one transaction; or reject).

Partner:
- `GET /api/v1/partner/price-book/` — the catalog for the partner's skill + area, each item
  carrying: unit, reference rate, resolved floor/ceiling, and the partner's saved rate/active
  flag if any. One endpoint, one round trip — the rate-card screen and the composer both read it.
- `PUT /api/v1/partner/price-book/items/{work_item_id}/` — upsert `{rate_paise, is_active}`,
  band-validated.
- Extend the proposal submission serializers for the new line fields and `misc_bps`/`margin_bps`.

Throttle writes with the existing `ThrottledWriteMixin`. Every endpoint gets drf-spectacular
annotations so the generated contract is complete.

## 7. Frontend — partner app

### 7.1 "My Rate Card" screen (new)
- Route `/me/rate-card`, pushed from the Me screen; add the `PUSH_TITLES` entry
  ("Your rate card") and a row on `me-home.tsx`.
- Lists the catalog grouped by category: item name, unit, the allowed range rendered
  plainly ("₹120 – ₹195"), the partner's rate in an editable money field (reuse
  `money-pad.tsx` patterns), and an active toggle. Out-of-band input is blocked inline with
  the range named. Server errors surface via the existing `describeError` + `ErrorState`
  pattern. TanStack Query with keys following `@vsolve/query`'s `queryKeys`/`m2QueryKeys`
  conventions; optimistic updates are NOT required — plain invalidate-on-success is fine.

### 7.2 Composer auto-fill
- In the item-wise composer (`item-wise-screen.tsx` / `tap-estimate-composer.tsx`): an
  "Add from my rate card" path listing the partner's active items; tapping one adds a line
  with title/unit/rate pre-filled and `work_item_id` attached; quantity is the only input.
  Manually-added lines get `is_custom: true` and show a "Custom item" chip; show remaining
  custom-share headroom when at least one custom line exists.
- Dials: two bounded steppers/sliders for Miscellaneous % and Margin %, max values read
  from the API (never hardcoded); computed amounts render as named rows above the total,
  matching the existing breakdown row components.

### 7.3 Customer app
- The customer estimate breakdown (find the component that renders `item_lines` today)
  renders the "Custom item" chip on custom lines and the Miscellaneous/Margin rows with
  their percentages, e.g. "Miscellaneous (5%)". No other customer-side changes.

## 8. Frontend — admin ops console

New route `(operations)/operations/work-items/` in the redesigned console (sidebar entry
beside Rate cards), using `frontend/apps/admin/features/m2-rate-cards/` as the pattern and
the new `@vsolve/ui` primitives:
- Work-item table per skill (DataTable): name, unit, status, band (inherited vs overridden —
  show which layer resolved, e.g. "default", "trade", "item"), reference rate per selected city.
- Create/edit item drawer; publish-rate drawer (city + rate, shows the resulting band).
- Guardrail policy screen: current ACTIVE values, draft/activate flow mirroring the
  CommercialPolicy console UX, per-skill band override editor.
- Custom-item review queue: pending items with partner, title, rate, count of times quoted;
  approve (pre-filled promote-to-catalog form) / reject.

## 9. Seed data

Extend the existing seed command family (see `apps/catalog/management/commands/` and
`seed_m2_demo.py`) with an electrical + painting work-item catalog (~15 items each, the
items from the flow specs in `flows/electrical.jpeg`: light/fan point wiring, 6A/16A
sockets, PVC conduit per rft, DB/MCB installation, etc.), Hyderabad reference rates, one
ACTIVE `QuoteGuardrailPolicy` with the seed values from §3.3, and saved rates for the demo
partners so the composer auto-fill is demonstrable immediately.

## 10. Tests — write them, do NOT run them

Repo policy: **never execute the test suites** (unit, integration, Playwright). Write:
- Band-resolution pure-function tests (all three override layers, rounding edges).
- Proposal-submission tests: in-band accept; each refusal code from §5; snapshot content;
  money reconciliation with dials.
- Serializer tests for the new ops endpoints (policy activation validation).
- Vitest for: rate-card screen model logic, composer autofill line building, dial caps.
Mark the work "owner verification pending" in your final report. The gates you DO run:
`backend/scripts/quality-static.ps1` (ruff + mypy strict + schema checks), and in
`frontend/`: `pnpm typecheck`, `pnpm lint`, `pnpm contract:check`. All must pass.
Never start dev servers; the owner runs them.

## 11. Non-goals (do not build, do not scaffold)

- No customer↔vendor negotiation of any kind (deliberate product stance).
- No vendor-created walk-in customers or off-platform quotes.
- No PDF generation, no WhatsApp/SMS share (Phase C).
- No painter measurement wizard (Phase B).
- No changes to A3 day-rate `RateCard`, dispatch, or the booking lifecycle.

## 12. Build order

1. Read every file named in §2. Then models + migrations + band-resolution function (+ tests).
2. Financials integration: dials in the money envelope, validation stage, snapshot (+ tests).
3. API: partner price-book endpoints, ops endpoints, proposal serializer extension
   (+ tests); regenerate the contract, bump the changelog, `pnpm contract:generate`.
4. Partner app: rate-card screen → composer autofill → dials.
5. Admin console: work-items, guardrail policy, review queue.
6. Customer breakdown chips/rows.
7. Seed data. Run all static gates. Fix everything they raise.
8. One commit series at the end (logical commits: backend, contract, partner FE, admin FE,
   seeds), messages in the repo's existing style. Do not push unless told.

Work autonomously through the whole list. Where this spec is silent, copy the nearest
existing pattern in the codebase rather than inventing one; where two patterns conflict,
prefer the one in `apps/requirements` (it is the newest). Report at the end: what was
built, every gate's result, and what awaits owner verification.
