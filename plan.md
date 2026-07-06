# V Solve Hub — Build Plan (Freelancer Onboarding & Roadmap)

> **Read this first.** It tells you *where to start*, *what already exists*, *what to throw away*, and *the exact order* to build the three platforms (Customer, Partner, Admin) and the 11 service categories across 3 phases.

## 0. The document map — read these in order


| Doc                                                                                                    | What it gives you                                                                                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `[project_milestones.md](project_milestones.md)`                                                       | **The contract** — 3 phases, payments, deliverables, acceptance. *If anything conflicts, this wins.*    |
| `[final_prd/PRD.md](final_prd/PRD.md)`                                                                 | **The product spec** — 11 categories, 8 booking models, all rules.                                      |
| `[final_prd/services.md](final_prd/services.md)`                                                       | **The catalog** — every service, its price, and its booking model.                                      |
| `[final_prd/updates.md](final_prd/updates.md)`                                                         | **Decision log** — *why* the model is what it is (esp. Consult-First).                                  |
| `[flows/](flows/)`                                                                                     | **UX flow screenshots** — booking journeys drawn out. **Check these before building any flow.** See §7. |
| `[V Solve Hub-Categories & Sub Categories.csv](V%20Solve%20Hub-Categories%20&%20Sub%20Categories.csv)` | The raw catalog source (prices, units).                                                                 |


**This plan supersedes the old demo blueprint.** The old prototype was built against an earlier PRD (dispatch archetypes A–G, escrow-based crew). The current PRD replaces the crew/quote design with the **Consult-First** model — see §6.

---

## 1. What already exists (the prototype)

A working **mock-data prototype** lives in `[web/](web/)` — a **pnpm + Turborepo monorepo**, Next.js 15 (App Router) + React 19 + TypeScript, some parts wired to **Supabase**. **Do not start from zero. Audit and evolve this.**

```
web/
├─ apps/
│  ├─ customer/   → Customer website (browse, book, track, profile)
│  ├─ partner/    → Partner website (onboarding, live jobs, crew, earnings)
│  └─ admin/      → Admin panel (dashboards, moderation)
├─ packages/
│  ├─ db/         → Prisma schema (packages/db/prisma/schema.prisma, ~780 lines)
│  ├─ ui/         → shared components
│  ├─ data/       → catalog/seed data
│  ├─ crypto/     → hashing/keys
│  └─ config/     → shared config
```

**What's already modeled / built (from the Prisma schema + customer APIs):**

- **Catalog** — `ServiceCategory / ServiceSubCategory / Service`, search API.
- **Auth** — `User / Session`, mock OTP (`/api/auth/otp`, `/api/auth/session`).
- **Booking spine** — `Booking / BookingStatusLog`, `/api/bookings`, `/api/bookings/[ref]`.
- **Dispatch** — `JobAssignment / JobEarning / Payout`, `/api/fulfillment/dispatch` (30s-wave engine).
- **Partner** — `Partner / Trade / Skill / Document / Vehicle / PayoutDetail / EarningRecord / PartnerAvailability`, onboarding + `/live` captain dashboard.
- **Crew (fully built, OLD model)** — `Crew / CrewMember / CrewAssignment / CrewJobDay / CrewClockEvent / CrewRoleRate / CrewJobOffer`. ⚠️ This is the **escrow-upfront** design the new PRD replaces (see §6).
- **Vehicle** — `VehicleDriver / VehicleRentalAsset / VehicleBooking`.
- **Accommodation** — `AccommodationProperty / AccommodationBooking`.
- **Admin** — `AdminUser / AdminAction`, dashboard shell (on Supabase).
- **Profile** — addresses, saved services, geocode reverse proxy.

**Known issues to resolve (details in §2–3):**

1. **Split data layer.** Customer + Partner lean on **Prisma/SQLite**; Admin uses **Supabase**. This must be unified onto **one backend** before building further.
2. **Mock data everywhere.** Seed data, mock OTP, logged-not-sent notifications. Fine for now — but the audit must catalog what's real vs faked.
3. **Old crew/quote model** is built and needs reworking to Consult-First.
4. Some booking flows were built ad-hoc; the `flows/` screenshots are the UX source of truth.

---

## 2. YOUR FIRST JOB — audit the web (before writing new features)

Do not add features until this is done and signed off. Produce an **audit report** (`web/AUDIT.md`) answering:

**A. Inventory**

- For each app (customer/partner/admin): which pages, routes, APIs exist and *actually work* vs stubs?
- Which parts read **real DB data** vs **mock/hardcoded** data?
- Which Prisma models are used vs orphaned?

**B. Data layer (the big decision)**

- Confirm the split: Prisma/SQLite (customer, partner) vs Supabase (admin).
  - **Recommendation: unify on  Supabase (postgres ) as the single source of truth** for all 3 apps — Postgres + Auth + Storage + Realtime, matches the milestone's "Database Design (SQL)", and Admin is already there. Keep Prisma as the ORM *pointed at Supabase Postgres* if you want typed queries + migrations, OR standardize on the Supabase client — **b`ut pick ONE** and use it everywhere. Flag your choice for approval.
- Port the existing Prisma schema into the chosen backend as the baseline SQL design.

**C. Alignment to the new PRD**

- Map every existing feature to a booking model (M1–M8 in [PRD.md §5](final_prd/PRD.md)).
- Flag anything on the **old** model (esp. crew escrow) as "rework".
- Flag anything not in the new PRD as "remove" (§3).

**D. Health**

- Does the monorepo build clean? (`pnpm install && pnpm build`.) Typecheck all three apps.
- List dead code, unused deps, broken routes.

**Deliverable:** `web/AUDIT.md` with three lists — **Keep**, **Rework**, **Remove** — plus your data-layer recommendation. We approve it, then you build.

---

## 3. Cleanup — what to remove / rework

**Remove (not in new Phase-1 scope, or superseded):**

- Any **hardcoded/fake** crew "quotes", team cards, mock team pricing.
- Duplicate/dead booking-flow components (the prototype has 1000+-line flow files with dead `steps/` code — consolidate).
- Vehicle/Accommodation **UI** if half-built — these are **Phase 2/3**; keep the schema but don't ship their UI in Phase 1 (park behind a flag).
- Anything with no home in [PRD.md](final_prd/PRD.md).

**Rework:**

- **Crew + Quotes → Consult-First** (§6). Escrow-upfront is replaced by consult-fee-first.
- **One data layer** (§2B). **One auth** across all three apps.

**Keep & harden:**

- Catalog, auth/OTP spine, booking + status-log spine, the 30s dispatch engine, partner onboarding + live dashboard, admin shell, profile/addresses.

---

## 4. Target architecture — three platforms, one backend

```
   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
   │  CUSTOMER   │   │   PARTNER   │   │    ADMIN    │   ← Phase 1–2: web · Phase 3: + apps
   │  website    │   │  website    │   │   panel     │
   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
          └──────────── one REST / Route-Handler API ───────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
         Supabase Postgres     Auth + Storage        Realtime
         (single source        (OTP, sessions,       (30s timers,
          of truth — SQL)       files, docs)          live status)
                                   │
              External: MSG91 OTP · Razorpay · WhatsApp · Maps · Email
```

- **Customer platform** — browse catalog → book (per booking model) → track on a live timeline → pay → rate. Plus profile, addresses, saved, history, wallet/coins (Phase 2).
- **Partner platform** — onboarding + KYC → the right "face" for their supply type (Technician / Contractor / Studio / Rental / Host / Employer / Driver — see [PRD.md §2](final_prd/PRD.md)) → receive work → deliver → earnings/payouts.
- **Admin platform** — catalog CRUD, partner verification, live lead monitor, disputes, dashboards & reports (Phase 2), settings.

**Non-negotiable rules** ([PRD.md §9](final_prd/PRD.md)): a lead *is* a booking; booking only after OTP; the 30s timer is server-side; one worker holds one live offer; supply-pool rule (a person is in exactly one pool); record money from day one; slugs not numeric IDs; privacy (worker sees address only after accept); catalog-driven config.

---

## 5. BUILD ORDER — where to start and what to build

> Phase boundaries and payments come from `[project_milestones.md](project_milestones.md)`. Phase 1 is **web only, no payments/OTP/apps, not public.**

### STEP 0 — Foundation (before any category)

The shared spine every category reuses.

1. **Audit + cleanup** (§2–3) and get sign-off.
2. **Unify the backend** (§2B) — one Supabase Postgres, one schema, one auth across all 3 apps.
3. **Harden the catalog** — load all 11 categories from [services.md](final_prd/services.md)/CSV; each `Service` carries its **booking model(s)** (M1–M8), unit, price range. This field drives which flow the UI renders.
4. **Booking spine** — `Booking` + `BookingStatusLog` generic enough for all models; `VSH-` reference; one reusable status-timeline component.
5. **Auth/OTP spine** — mock OTP now (real MSG91 in Phase 2); server decides new-vs-returning.
6. **Partner onboarding + "faces"** — one onboarding that branches by supply type.
7. **Admin shell** — catalog CRUD + live booking monitor + partner verification.

### WAVE 1 — First 4 categories (M1 Instant Fixed-Price) 🔧💄🏠🐾

**Start here.** Simplest model; proves the full loop end-to-end.


| #   | Category                   | Model | Notes                                                                                                                                                                                           |
| --- | -------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🔧 **Technician Services** | M1    | Visit ₹99–149 + per-job prices. Big installs (Full CCTV, Smart Home, Solar, Lift) flagged **M3** for later. See `[flows/electric-services-booking.jpeg](flows/electric-services-booking.jpeg)`. |
| 2   | 💄 **Beautician Services** | M1    | Visit charge + fixed service prices. Bridal → M3 later. See `[flows/beatician-service-booking.jpeg](flows/beatician-service-booking.jpeg)`.                                                     |
| 3   | 🏠 **Home Services**       | M1    | Cleaning/pest/laundry/gardening. Shifting/AMC/borewell/septic/inspection → M3 later.                                                                                                            |
| 4   | 🐾 **Pet Services**        | M1    | Grooming/vet/walking/sitting/training. Adoption/shop = listing/e-com later.                                                                                                                     |


**"Done" for Wave 1 (all three platforms):**

- **Customer:** browse these 4 → service detail → booking form → (mock) OTP → booking created → **push-dispatch** assigns a matched partner → live status timeline → complete → rate.
- **Partner:** Technician/Beauty/Home face goes online → 30s job alert → accept → sees address → status updates → completes → earnings recorded.
- **Admin:** sees these bookings live, verifies partners, CRUDs their catalog.
- Money **recorded** (paise); gateway deferred to Phase 2.

### WAVE 2 — Remaining Phase-1 categories (Consult-First + Staffing) 👷🧰🎥

Now the harder engine (§6).


| #   | Category                         | Model                          | Notes                                                                                                                                                       |
| --- | -------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | 👷 **Construction Labour**       | **M2 Crew** (+ M3 pros/finish) | Consult fee → survey → workers×days estimate → day-wise work. See `[flows/constructor-booking.jpeg](flows/constructor-booking.jpeg)`. Rework old crew code. |
| 6   | 🧰 **Man Power & Support Staff** | **M7 Placement** (+ M2 daily)  | Intent toggle: permanent → M7, daily-wage → M2.                                                                                                             |
| 7   | 🎥 **Event & Media Services**    | **M3 Quote**                   | Consult fee → assess → lump-sum quote → advance + milestones. **Photography is dual-mode — see §7.1.**                                                      |


**Phase-1 completion:** all 7 groups' booking engines working on **web**, on staging, no payments/OTP/apps, not public. Closes Phase 1 (₹25,000).

### PHASE 2 — Remaining categories + all integrations 📦🏨💼


| #   | Category                        | Model                                                               |
| --- | ------------------------------- | ------------------------------------------------------------------- |
| 8   | 📦 **Rental Services**          | M4 (inventory + availability calendar + deposits)                   |
| 9   | 🏨 **Rooms/PG/Hostel/Hotels**   | M5 (listings + enquiry inbox) — **11 flow screenshots exist, §7.2** |
| 10  | 💼 **Career/Job Opportunities** | M6 (post → apply → hire)                                            |


**Plus (whole platform):** Razorpay · MSG91 OTP · **Wallet · V Coins · Referral** · Vendor Subscriptions + Premium Listings · **full Admin dashboards & reports** (Business/Customer/Vendor/Booking/Revenue/Analytics, exports, GST/TDS, settlement). End of Phase 2 = entire web platform integrated on staging, not public. (₹25,000)

### PHASE 3 — Apps + Rapido + AI + single go-live 📱🚗🤖

- 📱 **Customer App** + 📱 **Partner App** (Play Store + App Store).
- 🚗 **Rapido / Vehicle (M8)** — real-time: live GPS, Google Maps, fare engine, driver KYC/wallet/daily-pass, trip history, ratings.
- 🤖 **AI Chatbot** + AI Search.
- 🚀 **Single combined go-live of all 11 categories**, web + apps. Full handover. (₹30,000)

---

## 6. The Consult-First engine (Wave 2's core — build carefully)

Crew (M2) and Quotes (M3) are **two outcomes of one engine**, not two engines. Full spec in [PRD.md §6](final_prd/PRD.md). Short version:

```
Customer describes job + pays SMALL CONSULT/SURVEY FEE (not full payment)
  → pro assesses (call or site visit)
  → pro sends a STRUCTURED ESTIMATE:
       • CREW (M2):  roles × count × day-rate × days + materials list (who buys)
       • QUOTE (M3): lump sum (materials in/out) + timeline + milestones
  → customer Accepts / Negotiates (1–2 rounds) / Declines
       → consult fee CREDITED to the bill on accept
  → CREW → day-wise work, attendance-based pay · QUOTE → advance → milestones → balance
  → complete → rate → (M3) warranty window
```

**Locked defaults:** consult fee **credited on booking / forfeited to provider if customer walks / refunded if provider no-shows**. Labour: **up to 3 contractors** may return competing estimates. **Materials** are first-class on every estimate with a per-line who-supplies toggle.

**This replaces the built escrow-upfront crew flow.** Rework, don't extend, the old `Crew`* code.

The milestone's named deliverables *are* this engine: **Smart Inspection Booking** (consult/survey step) · **Digital Estimation Engine** (estimate builder) · **Vendor Quote System** · **Additional Work Approval** (mid-job scope delta) · **Vendor Dashboard** · **Warranty System**.

---

## 7. Special notes

### 7.1 Photography is dual-mode (instant AND event)

A single service can carry **two booking models**, and the customer picks the mode at booking:

- **Instant (M1)** — studio/portfolio sessions with a listed price (Baby Shoot, Portfolio, Product, Passport-style) → book a slot directly, like any fixed-price service.
- **Event (M3 Quote)** — Weddings, Pre-Wedding, big events → consult → package quote → advance + milestones.

Build the catalog so a `Service` can hold **more than one booking model**, and the booking form shows a **"Book instantly / Get a quote for an event"** choice. Reuse this dual-mode pattern anywhere a service is both a simple session and a big event (some Decoration, Makeup, Catering entries).

### 7.2 The `flows/` folder — check before building any flow

UX journeys are drawn as screenshots in `[flows/](flows/)`. **Match these.** They cover:

- **Accommodation (Phase 2, 11 images):** rooms, PG/hostel, apartment, rental property, short stay, student, worker, **property contact-unlock**, premium, resort.
- **Services (Phase 1):** `[beatician-service-booking.jpeg](flows/beatician-service-booking.jpeg)`, `[constructor-booking.jpeg](flows/constructor-booking.jpeg)`, `[electric-services-booking.jpeg](flows/electric-services-booking.jpeg)`.

If a flow you're building has a screenshot here, that screenshot is the spec. If not, follow [PRD.md §5](final_prd/PRD.md) and ask.

### 7.3 Mock now, real later

The prototype uses mock OTP, seed data, and logged (not sent) notifications — correct for Phase 1. Razorpay + MSG91 arrive in Phase 2. **Structure the code so swapping mock→real is a config change, not a rewrite** (adapter interfaces for OTP, payments, notifications).

---

## 8. Definition of done — per stage


| Stage          | Done when…                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Audit**      | `web/AUDIT.md` approved (Keep/Rework/Remove + data-layer decision).                                               |
| **Foundation** | One backend, one auth, catalog carries booking models, booking spine + admin shell work.                          |
| **Wave 1**     | 4 fixed-price categories: full loop across Customer + Partner + Admin, on staging.                                |
| **Wave 2**     | Consult-First engine + 3 workforce/project categories working. **Phase 1 complete.**                              |
| **Phase 2**    | Rental + Accommodation + Jobs + Razorpay + OTP + Wallet/Coins/Referral + Admin dashboards, integrated on staging. |
| **Phase 3**    | Apps published + Rapido live + AI + single go-live of all 11 + handover.                                          |


Each stage: Development → Internal test → UAT → fixes → (deploy where applicable) → written approval. See `[project_milestones.md](project_milestones.md)` for payment gates.

---

## 9. First-week checklist (start here)

- Clone, `pnpm install`, run all three apps, confirm they boot.
- Read PRD.md, services.md, updates.md, and open every image in `flows/`.
- Produce `web/AUDIT.md` (Keep / Rework / Remove + data-layer recommendation).
- Propose the unified backend + auth plan for approval.
- Once approved: Foundation (Step 0), then Wave 1 starting with 🔧 Technician.

