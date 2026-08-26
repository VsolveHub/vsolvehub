# Category Re-file + Item/Labour Quote Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill "Workforce and Projects" as a customer-facing category by re-filing its services under real trade categories, and wire the already-built item-wise / labour-wise estimate composer (partner) and line-item breakdown (customer) to the live proposal API.

**Architecture:** Category placement is pure merchandising in this codebase — behaviour comes from `ServiceVariant.booking_archetype` and dispatch from `required_skill_code`, so re-filing is a seed change plus one idempotent data migration. The proposal wire contract (`estimate_type`, `item_lines`, `labour_lines`, `other_charges`) already exists end-to-end (model, calculator, serializers, generated TS schema); the work is mounting the unmounted `CommercialEstimateComposer` on the partner estimate route and mapping the three dropped arrays in the customer quote adapter.

**Tech Stack:** Django 5 / DRF / mypy strict (backend), Next.js App Router + TanStack Query + openapi-typescript generated schema (frontend, pnpm monorepo).

**Spec:** The audit + agreed direction in this session (2026-08-25/26 conversation); tracker: `task.md` on branch `M2-revamp`.

## Global Constraints

- **NO test execution.** Write/update tests; never run them. Static gates only: `ruff`/`mypy` (backend), `tsc`/`eslint` (frontend). Mark work "owner verification pending". (Owner rule, 2026-08-12.)
- **One commit at the end** of the whole plan, not per task. (Owner rule.)
- Don't launch or kill the dev server. (Owner rule.)
- No mock/placeholder data in product code; honest empty states. (Owner rule.)
- Money is integer paise everywhere; totals are server-derived — the client never sends `total_paise` on proposals (contract 1.44.0).
- Category mapping decided this session:
  - `construction-helpers` (A3) → new category `construction` ("Construction"), subcategory `construction-labour`
  - `interior-fit-out-project` → `construction` / `interior-fit-outs`
  - `full-bathroom-renovation` → `plumber` / `renovation-projects`
  - `full-home-rewiring` → `electrician` / `renovation-projects`
  - `modular-kitchen-fit-out` → `technician` / `renovation-projects`
  - `full-home-painting` → `home-services` / `renovation-projects`
  - `event-catering` → new category `events` ("Events"), subcategory `event-services`
  - Deactivate category `workforce-and-projects` (and its now-empty subcategories); never delete.
- Trade category rows must not diverge from `seed_task_catalog.py` `CATALOG` (`technician`=order 1, `electrician`=2, `plumber`=3, `home-services`=6). New categories: `construction`=8, `events`=9.

---

### Task 1: Backend — re-file seeded M2 services under trade categories

**Files:**
- Modify: `backend/apps/requirements/management/commands/seed_m2_demo.py` (constant block ~line 119, `ProjectSeed` ~line 330, `A5_PROJECT_SEEDS` ~line 350, `handle` A3 call ~line 908, `_seed_variant` ~line 1064)

**Interfaces:**
- Produces: `M2_CATEGORY_SEEDS: dict[str, tuple[str, str, str, int]]` (slug → name, description, icon_key, display_order) and `ProjectSeed.category_slug`; `_seed_variant(..., category_slug: str, ...)`. Task 2's migration mirrors the same mapping.

- [x] **Step 1:** Replace `CATEGORY_SLUG = "workforce-and-projects"` with:

```python
LEGACY_CATEGORY_SLUG = "workforce-and-projects"

#: slug -> (name, description, icon_key, display_order). The four trade rows are copies of
#: `seed_task_catalog.CATALOG` so update_or_create merges instead of diverging; the two new rows
#: are customer-comprehensible nouns replacing the retired "Workforce and projects" umbrella.
M2_CATEGORY_SEEDS: dict[str, tuple[str, str, str, int]] = {
    "technician": ("Technician", "Reviewed one-person Technician task visits.", "wrench", 1),
    "electrician": ("Electrician", "Wiring, fittings, fans and power faults, fixed in one visit.", "zap", 2),
    "plumber": ("Plumber", "Taps, leaks, drains and fittings, fixed in one visit.", "droplet", 3),
    "home-services": ("Home Services", "Cleaning, pest control and upkeep delivered at your address.", "home", 6),
    "construction": ("Construction", "Site labour and construction projects, priced on site.", "hard-hat", 8),
    "events": ("Events", "Catering and event services, priced per plate or per event.", "party-popper", 9),
}
```

- [x] **Step 2:** Add `category_slug: str` to the `ProjectSeed` dataclass; set it per the Global Constraints mapping on all six `A5_PROJECT_SEEDS`; pass `category_slug="construction"` in the A3 `_seed_variant` call and thread `category_slug=project.category_slug` in the A5 loop.
- [x] **Step 3:** `_seed_variant` gains `category_slug` parameter; category creation becomes lookup into `M2_CATEGORY_SEEDS` (raise `CommandError` on unknown slug so a typo fails loudly). Keep subcategory/service/variant `update_or_create` unchanged — `Service.subcategory` in defaults is what re-points an existing dev row.
- [x] **Step 4:** Static gates: run backend lint/mypy per repo tooling. Do NOT run the seed or tests.

### Task 2: Backend — data migration to re-file existing rows and retire the old category

**Files:**
- Create: `backend/apps/catalog/migrations/00XX_refile_workforce_projects_services.py` (next number after current head)

**Interfaces:**
- Consumes: the same slug mapping as Task 1 (duplicated literally in the migration — migrations never import live code).

- [x] **Step 1:** `RunPython` forward:

```python
SERVICE_TO_HOME = {
    "construction-helpers": ("construction", "construction-labour", "Construction labour", 10),
    "interior-fit-out-project": ("construction", "interior-fit-outs", "Interior fit-outs", 20),
    "full-bathroom-renovation": ("plumber", "renovation-projects", "Renovation projects", 30),
    "full-home-rewiring": ("electrician", "renovation-projects", "Renovation projects", 30),
    "modular-kitchen-fit-out": ("technician", "renovation-projects", "Renovation projects", 30),
    "full-home-painting": ("home-services", "renovation-projects", "Renovation projects", 30),
    "event-catering": ("events", "event-services", "Event services", 40),
}
CATEGORY_DEFAULTS = {  # same tuples as M2_CATEGORY_SEEDS
    ...
}

def refile(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Subcategory = apps.get_model("catalog", "Subcategory")
    Service = apps.get_model("catalog", "Service")
    for service_slug, (category_slug, sub_slug, sub_name, sub_order) in SERVICE_TO_HOME.items():
        service = Service.objects.filter(slug=service_slug).first()
        if service is None:
            continue  # this environment never seeded it
        name, description, icon_key, order = CATEGORY_DEFAULTS[category_slug]
        category, _ = Category.objects.update_or_create(
            slug=category_slug,
            defaults={"name": name, "description": description, "icon_key": icon_key,
                      "display_order": order, "is_active": True},
        )
        subcategory, _ = Subcategory.objects.update_or_create(
            category=category, slug=sub_slug,
            defaults={"name": sub_name, "display_order": sub_order, "is_active": True},
        )
        if service.subcategory_id != subcategory.id:
            service.subcategory = subcategory
            service.save(update_fields=["subcategory", "updated_at"])
    legacy = Category.objects.filter(slug="workforce-and-projects").first()
    if legacy is not None:
        Subcategory.objects.filter(category=legacy).exclude(services__isnull=False).update(is_active=False)
        if not Service.objects.filter(subcategory__category=legacy, status="ACTIVE").exists():
            legacy.is_active = False
            legacy.save(update_fields=["is_active", "updated_at"])
```

Reverse: `migrations.RunPython.noop` (deactivation is not destructive; the seed can rebuild dev data).
- [x] **Step 2:** `python manage.py makemigrations --check --dry-run` must NOT want further migrations (schema unchanged — data-only). Static gates only; do not run `migrate` (owner runs it).

### Task 3: Partner — mount the commercial (item/labour) composer on the estimate route

**Files:**
- Create: `frontend/apps/partner/features/proposal/view/commercial-estimate-flow.tsx`
- Modify: `frontend/apps/partner/features/proposal/view/onsite-screen.tsx` (`OnsiteComposerWithRevision`, ~line 151)
- Modify: `frontend/apps/partner/features/proposal/view/commercial-estimate-composer.tsx` (docblock only — it is no longer unmounted)

**Interfaces:**
- Consumes: `CommercialEstimateComposer` props `{invitationId, siteVisitId, serviceName, archetype, isSubmitting, onSend(request), notice}`; `useSubmitProposal().mutate({body, supersedesRevision, requirementId, invitationId})`; `clearSavedCommercialEstimate(invitationId)`; `planVisitOf`, `isVisitNotCompleted`, `isProposalWindowClosed`, `EstimateClosedDialog` (exported from `tap-estimate-composer.tsx`).
- Produces: `CommercialEstimateFlow({enquiry, visit, enquiryHref, supersedesRevision, onSubmitted})` — same prop shape as `TapEstimateComposer`.

- [x] **Step 1:** `CommercialEstimateFlow` mirrors `TapEstimateComposer` exactly: null-visit card ("No visit on this job yet"), `visitIsOpen || refusedForVisit` warning notice, `windowClosed` → `EstimateClosedDialog`, other errors → inline `ErrorState` with retry via `submit.reset()`. `onSend(request)` → `submit.mutate({body: request, supersedesRevision, requirementId: enquiry.requirementId, invitationId: enquiry.id}, {onSuccess: (proposal) => { clearSavedCommercialEstimate(enquiry.id); onSubmitted(proposal); }})`. The request body already carries `invitation_id`/`site_visit_id` (the composer builds it from the server-previewed draft).
- [x] **Step 2:** In `OnsiteComposerWithRevision`, add `const [composer, setComposer] = useState<"tap" | "detailed">("tap")` and a two-option segmented control above the composer ("Quick tap estimate" / "Detailed line items" with a one-line description: item-wise or labour-wise pricing, named charges, installments). Mount `TapEstimateComposer` or `CommercialEstimateFlow` accordingly.
- [x] **Step 3:** Update the composer docblock ("Not mounted" paragraphs) and `onsite-screen.tsx` header copy so the file no longer claims the tap flow is the only mounted path.
- [x] **Step 4:** `tsc`/`eslint` for the partner app. No test runs.

### Task 4: Customer — map and render item/labour/charge lines on the live quote card

**Files:**
- Modify: `frontend/packages/query/src/m2-quotes.ts` (~line 71) and `frontend/packages/query/src/index.ts` (~line 189): export `ProposalItemLine`, `ProposalLabourLine`, `ProposalOtherCharge`, `EstimateType` (= `Schemas["EstimateTypeEnum"]`).
- Modify: `frontend/apps/customer/features/quotes/adapters/index.ts`
- Modify: `frontend/apps/customer/features/quotes/view/quote-card.tsx`
- Test: `frontend/apps/customer/features/quotes/adapters/comparison.test.ts` (extend; write only, never run)

**Interfaces:**
- Consumes wire shapes: `ProposalItemLine {category, title, unit, quantity: string, rate_paise, amount_paise}`, `ProposalLabourLine {role, team, member_count, day_count, rate_paise_per_day, amount_paise}`, `ProposalOtherCharge {code, label, amount_paise}`, `CustomerProposal.estimate_type`.
- Produces on `QuoteCardView`: `estimateType: "ITEM_WISE" | "LABOUR_WISE"`, `itemLines: readonly QuoteItemLineView[]`, `labourLines: readonly QuoteLabourLineView[]`, `otherCharges: readonly QuoteChargeView[]`.

- [x] **Step 1:** Adapter views:

```ts
export interface QuoteItemLineView {
  category: string; title: string;
  quantityLabel: string | null;  // "5 Nos × ₹80" style: qty + unit label + rate
  amountLabel: string;
}
export interface QuoteLabourLineView {
  role: string; team: string | null;
  crewLabel: string;             // "2 people × 3 days × ₹900/day"
  amountLabel: string;
}
export interface QuoteChargeView { label: string; amountLabel: string; }
```

Unit labels reuse the vendor vocabulary: `{each: "Nos", job: "Job", hour: "Hours", day: "Days", sq_ft: "Sq ft", running_ft: "Running ft", metre: "Metre", kg: "Kg", litre: "Litre", set: "Set"}`. Trim trailing zeros off `quantity` the same way `toMaterialViews` does. Quantity of exactly "1" with unit "job" renders `quantityLabel: null` (a one-job line's rate is its amount).
- [x] **Step 2:** `toQuoteCard` maps the three arrays + `estimateType`; A3 quotes have empty arrays and nothing renders.
- [x] **Step 3:** `quote-card.tsx`: inside the Disclosure, above the stages section, render "How the price is built" — item rows (title + category, quantityLabel, amount) when `itemLines.length > 0`, labour rows when `labourLines.length > 0`, then a "Named charges" list when `otherCharges.length > 0`, with the note that these are inside the total. Keep the M2-FE-423 rule: no gating, everything renders once entitled.
- [x] **Step 4:** `toComparisonRows`: add an equivalent row `"How it is priced"` with values `Item-wise (N items)` / `Labour-wise (N roles)` / null (A3), placed after "Stages".
- [x] **Step 5:** Extend `comparison.test.ts` with adapter cases: item-wise proposal maps lines and labels; labour-wise maps crewLabel; A3 maps empty arrays. WRITE ONLY.
- [x] **Step 6:** `tsc`/`eslint` for customer app + packages/query.

### Task 5: Customer — hygiene wiring fixes

**Files:**
- Modify: `frontend/apps/customer/features/crew/view/book-crew-screen.tsx:727`
- Modify: `frontend/apps/customer/features/session/view/site-header.tsx` (~lines 244–320)
- Modify: `frontend/apps/customer/features/session/view/site-nav.test.ts`
- Modify: `frontend/apps/customer/features/project-request/view/what-screen.tsx` (docblock line 15)
- Modify: `frontend/apps/customer/features/project-request/view/parts/visit-plan-chooser.tsx` (docblock lines 11–17)

- [x] **Step 1:** `book-crew-screen.tsx:727`: `href="/catalog/workforce-and-projects"` → `href="/catalog"` (the category is retired; the flat catalog is the honest fallback).
- [x] **Step 2:** `site-header.tsx`: add `import type { ReactNode } from "react";` and type `PATHS: Record<NavTarget["icon"], ReactNode>` (fixes the `React is not defined` collection error). Remove the orphaned `basket` icon member and its `PATHS` entry IF nothing else references it (grep `"basket"` in apps/customer first; if referenced, leave the glyph and only fix the import). Add `"/catalog": ["/catalog", "/book", "/cart", "/checkout"]` to `OWNED` so checkout keeps answering "where am I".
- [x] **Step 3:** `site-nav.test.ts`: `toHaveLength(3)` → `toHaveLength(2)`; keep `/cart` in the mutual-exclusivity list (now owned by `/catalog`); update the comment about "three main targets". WRITE ONLY.
- [x] **Step 4:** Fix stale docblocks: "Step 1 of 2" → "Step 1 of 3"; visit-plan-chooser "budgeted at four screens" paragraph rewritten to match HEAD (the chooser lives on the third screen, `visits_send`) — read `visits-send-screen.tsx` first and describe what is true.
- [x] **Step 5:** `tsc`/`eslint`.

### Task 6: Trackers, gates, single commit

**Files:**
- Modify: `task.md` (repo root tracker on M2-revamp)

- [x] **Step 1:** Run every static gate available for both stacks (backend ruff/mypy; frontend turbo lint + typecheck or per-app equivalents). Fix fallout.
- [x] **Step 2:** Update `task.md`: what shipped, category mapping table, "owner verification pending" (manual walkthrough: re-run `seed_m2_demo`, `migrate`, browse /catalog, submit a detailed estimate, read it on the customer quote card).
- [x] **Step 3:** ONE commit for the whole plan (Task 1–6 files + this plan doc). Message: `feat(m2): re-file workforce/projects services under trade categories; wire item/labour estimates end to end`. Do not push.

## Self-Review Notes

- Coverage: category re-file (Tasks 1–2 + fallback link in Task 5), item/labour partner composer (Task 3), customer breakdown (Task 4), audit hygiene (Task 5). The mixed item+labour estimate stays refused (server rule, deliberately unchanged — owner did not ask to change it).
- Not in scope (noted for the owner): home-page hardcoded 3 tiles; `MobileBottomNav` `/bookings`-vs-`/activity` divergence; the design-gallery screens stay as galleries.
