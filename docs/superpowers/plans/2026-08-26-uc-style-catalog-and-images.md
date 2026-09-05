# UC-Style Catalog: Tile Subcategories, Images, Full A1/A3/A5 Seeds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild catalog browsing as the approved Urban-Company-style flow — category page shows image tile subcategories ("Select a service"), a tile shows only its services (image cards), every category carries Fixed (A1) + Quote (A5) + Day-hire (A3) services — with real image fields in the DB and properly ideated seed data.

**Architecture:** Tiles ARE subcategories (no 4th hierarchy level). Dispatch stays decoupled: `required_skill_code` on the variant keeps the trade while subcategories become merchandising tiles. Images are first-class columns on Category/Subcategory/ServiceVariant plus the existing `ServiceMedia` COVER channel for services. Contract bumps to 1.45.0.

**Tech Stack:** Django/DRF + drf-spectacular contract, Next.js customer app, seeds as management commands.

**Spec:** Approved audit in this session (2026-08-26): tiles=subcategories; enrich Construction & Events; images instead of icons everywhere.

## Global Constraints

- NO test execution; static gates only (`quality-static.ps1`, `pnpm typecheck`, `pnpm lint`). Owner verification pending. One commit at the end. Don't touch the dev server.
- Real data only: every seeded image URL must be **verified live** (downloaded and visually checked) before it ships. No invented URLs left unchecked.
- Dispatch invariant: splitting a trade into tiles must NOT change any variant's `required_skill_code`, and cart same-partner pairing must keep working across tiles (group by skill, not subcategory).
- Money and archetype models unchanged. Contract version: `config/settings/base.py:312` `1.44.0` → `1.45.0`; regenerate `contracts/openapi/v1.yaml` and the frontend client (`pnpm contract:generate`).
- task.md product-decision line "Service-list images are removed" is REVERSED by the owner today — update the line, don't silently contradict it.

---

### Task 1: DB image fields (catalog migration 0016)

**Files:** Modify `backend/apps/catalog/models.py`; generate `backend/apps/catalog/migrations/0016_*.py`.

- [x] `Category.image_url = models.URLField(max_length=500, blank=True, default="")`
- [x] `Subcategory.icon_key = models.CharField(max_length=80, blank=True, default="")` and `Subcategory.image_url = models.URLField(max_length=500, blank=True, default="")`
- [x] `ServiceVariant.image_url = models.URLField(max_length=500, blank=True, default="")` (variant-level imagery; blank falls back to the service cover in the UI)
- [x] Services keep `ServiceMedia` (kind COVER) as their image channel — no new Service column.
- [x] `python manage.py makemigrations catalog` → 0016. No data migration needed (fields are additive).

### Task 2: Serializers + contract 1.45.0

**Files:** Modify `backend/apps/catalog/serializers.py`, `backend/apps/catalog/selectors.py` (if annotation needed), `backend/config/settings/base.py`; regenerate `contracts/openapi/v1.yaml`; run `frontend: pnpm contract:generate`.

- [x] `CategorySerializer`: add `image_url`; subcategory rows gain `icon_key`, `image_url`, `service_count` (count of ACTIVE services, annotated in `public_categories()`).
- [x] `ServiceCardSerializer`: already exposes `cover`; no change needed. `ServiceIndexItemSerializer`: unchanged.
- [x] `ServiceVariantConfigurationSerializer` and `RequirementVariantSerializer`: add `image_url`.
- [x] Bump VERSION to `1.45.0`; regenerate the OpenAPI file the same way `quality-static.ps1` does (spectacular → `contracts/openapi/v1.yaml`); regenerate the TS client.

### Task 3: Tile regroup in `seed_task_catalog` (+ shared maps)

**Files:** Modify `backend/apps/catalog/management/commands/seed_task_catalog.py`, `backend/apps/catalog/icons.py`, `backend/apps/catalog/seed_content.py`, `backend/apps/catalog/management/commands/seed_technician_catalog.py`.

- [x] `TradeSeed` gains `skill_code: str | None = None` (+ `image_url: str = ""`, `icon_key: str = ""`); effective skill = `skill_code or slug`. `_seed_variant` line ~1165 uses it. **The docstring comment "It is the subcategory slug" becomes wrong — rewrite it.**
- [x] `_seed_within_trade_compatibility`: group by `variant.required_skill_code`, NOT `service.subcategory_id` — one electrician still does a fan job and a switch job in one visit across tiles.
- [x] Electrician → 7 tiles (all `skill_code="electrician"`): `switch-socket` (Switch Board Repair/Replacement, Plug Point Fixing, Junction Box Fixing), `fans` (Wall/Exhaust Fan Installation, Fan Repair), `lighting` (Decorative Light, Chandelier), `mcb-fuse-inverter` (DB Board Install/Repair, MCB, Fuse, Main Board, Load Distribution, Inverter, UPS, Generator), `motors-pumps` (Water Motor Wiring, Pump/Bore Motor Connection, Starter Panel), `doorbell-security` (Door Bell Installation), `power-problems` (Power Issue Check, Short Circuit, Voltage, Trip, General Electrical Works).
- [x] Plumber → 5 tiles (all `skill_code="plumber"`): `taps-showers` (Tap Replacement/Installation, Shower Repair/Installation, Health Faucet), `bathroom-fittings` (WC, Basin, Sink, Bathroom Fitting Setup, Full Bathroom Plumbing), `blockage-drainage` (Drain Block Removal, Chamber Cleaning), `leaks-pressure` (Pipe Leakage, Pipe Joint, Water Pressure, Tank Overflow, General Check), `tanks-motors` (Overhead Tank, Bore Connection, Geyser Pipe, Motor Install/Repair).
- [x] AC → 3 tiles (`skill_code="ac-technician"`), split its task list into service/cleaning, repair/gas, install/uninstall on reading it.
- [x] Technician, Beautician, Home Services, Pet Services: keep existing trade subcategories (already tile-shaped); add icon/image per tile.
- [x] Seed writes `Subcategory.icon_key`/`image_url` and `Category.image_url`; new `_seed_service_cover()` writes one `ServiceMedia` COVER row per service from a per-tile image pool. `SERVICE_ICON_BY_SUBCATEGORY` in icons.py gains the new tile slugs.
- [x] Shared map `TILE_FOR_M1_SERVICE` in `seed_content.py` for the six M1 services (switch-socket-repair→electrician/switch-socket, fan-installation→electrician/fans, light-led-installation→electrician/lighting, tap-repair→plumber/taps-showers, wc-flush-repair→plumber/bathroom-fittings, cupboard-hinge-repair stays carpenter). Both `seed_technician_catalog` (subcategory choice) and `seed_task_catalog` (adoption re-file) read it, per the existing one-map convention. `_retire_empty_subcategories` then retires the emptied flat trade buckets on rerun.

### Task 4: A5/A3 across every category in `seed_m2_demo`

**Files:** Modify `backend/apps/requirements/management/commands/seed_m2_demo.py`.

- [x] `ProjectSeed` gains `image_url`; `M2_CATEGORY_SEEDS` entries gain image urls; `_seed_variant` writes subcategory icon/image + service COVER media.
- [x] New A5 services (visit-first quote; icon-tile questions only, 2–3 per service):
  - electrician: keep `full-home-rewiring`; + `electrician-consultation` (tile `consultation`)
  - plumber: keep `full-bathroom-renovation`; + `plumber-consultation` (tile `consultation`)
  - technician: keep `modular-kitchen-fit-out`; + `custom-furniture-work`
  - ac-services: + `central-ac-ducting` (Central AC & ducting project)
  - home-services: keep `full-home-painting`; + `home-deep-makeover` or consultation (pick one)
  - beautician: + `bridal-event-makeup` (Bridal & event makeup package)
  - construction: keep `interior-fit-out-project`; + `home-demolition`, `tiling-flooring-work`, `terrace-waterproofing`
  - events: keep `event-catering`; + `event-lighting-decor`
- [x] Per-category `consultation` tile = its own subcategory holding the one consultation A5 service (this is the screenshot's "Book a consultation" tile, purely data-driven — no frontend slug convention).
- [x] New A3 day-hire services (each = A3 variant + skill + `MinimumWageFloor` + `RateCard` + `_seed_a3_configuration`, mirroring construction-helpers): `electrician-by-the-day` (skill electrician), `plumber-by-the-day` (skill plumber), `painter-by-the-day` (skill painter — new Skill row), `event-staff-by-the-day` (events; skill event-staff — new Skill row). Tile `hire-by-the-day` per category.
- [x] Vendors: the existing `_seed_vendors(variants=…)` loop receives the expanded variant tuple so demo vendors hold capabilities for everything.

### Task 5: Verified image curation

**Files:** image URL constants inside the two seed commands.

- [x] Curate Unsplash URLs (w=800 crop) per category (9), per tile (~35), pool of 2–4 per tile for service covers. Download each with curl into the scratchpad and **view each one** (Read renders images); replace any 404/mismatch. Only verified URLs enter the seeds.

### Task 6: Customer UI

**Files:** `frontend/apps/customer/app/(shop)/catalog/[category]/page.tsx` + new `features/catalog/category-screen/*`; modify `features/catalog/service-href.ts`, `app/(shop)/catalog/[category]/[service]/page.tsx` (dual CTA), `app/page.tsx` (API-driven category tiles).

- [x] Load `frontend-design` skill before building the screen.
- [x] Category page: header; "Select a service" grid of tile cards (image, name, service_count) from `/categories/` + `/categories/<slug>/services/`; no `?tile` → grid; `?tile=<slug>` → only that tile's services as image cards (cover, name, "starts at ₹X" / "Free quote after site visit" / "₹X per day") with a back-to-tiles link. Consultation tile routes straight into its single service's brief.
- [x] `serviceHref` hybrid fix: a service with BOTH a priced bookable variant and request archetypes routes to the service detail page; detail page shows both CTAs (Book at fixed price / Get a free quote after a site visit).
- [x] Home page: category tiles driven by the API (image_url with graceful fallback), desktop + mobile; delete the hardcoded 3-slug filter and Unsplash JSX.
- [x] Plain `<img>` with object-cover + alt; no next/image config dependency.

### Task 7: Gates, trackers, single commit

- [x] Backend `quality-static.ps1` (includes contract drift — must be green after regen); frontend `pnpm typecheck` + `pnpm lint`.
- [x] task.md: flip the "icon + text / images removed" product decision line (owner reversed it 2026-08-26); append dated entry with what shipped + owner verification steps (re-run all three seeds, migrate, walk the flows).
- [x] Memory file update. ONE commit; no push.
