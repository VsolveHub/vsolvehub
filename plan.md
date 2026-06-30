# VSolveHub — Build Plan (Customer + Provider Websites)

> **Scope of this doc:** the engineering blueprint for the **demo** — folder structure,
> what tech to use for the frontend and backend, the database layout, and how we make
> finding & booking a service feel seamless.
>
> We are building **two websites in one Next.js app**: the **Customer Website** (browse,
> book, track) and the **Provider Website** (captain dashboard, jobs, earnings).
>
> **Companion doc:** [`services.md`](services.md) — the exact service catalog we ship.

---

## 0. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + React 19 + TypeScript** | Already in repo; one stack for UI **and** backend (Route Handlers / Server Actions). |
| Database | **SQLite** (single file) | Zero-setup, fast, perfect for a demo with mock data. Replaces `localStorage`. |
| Data layer | **Prisma ORM** | Type-safe queries, real migrations, and a near-free `sqlite → postgresql` swap when we move to the real PRD stack. |
| App structure | **One app, route groups** | `(customer)` + `(provider)` share one DB and one component library. No second repo to maintain. |
| Build scope | **Phase 1 only** (per PRD `conventions.md` D-27) | Direct worker booking: dispatch archetypes A/B, provider type **Captain**. Other archetypes are *designed in the schema, not built*. |
| Styling | **Vanilla CSS** (existing `globals.css`) | Keep the current design system; don't introduce a CSS framework mid-flight. |
| State | **Server is the source of truth** | Browser holds only a session cookie. No more `localStorage` as the database. |

> **Why SQLite + Prisma is "prod-shaped" even for a demo:** the PRD's real target is
> PostgreSQL + Django. Prisma models map 1:1 to that schema, so this DB is a faithful
> subset — migrating later is a config change + data export, not a rewrite.

---

## 1. Tech stack — what we use for what

### Frontend (both websites)

| Concern | Tool / approach |
|---|---|
| Pages & routing | Next.js App Router with **route groups**: `(marketing)`, `(customer)`, `(provider)` |
| Rendering | **Server Components** for data pages (catalog, lists); **Client Components** only where there's interactivity (forms, toggles, timers) |
| Catalog pages | Static/ISR — categories & services rarely change |
| Booking / track / dashboards | Client components reading from API routes (live data) |
| Styling | Vanilla CSS + the existing design tokens in `globals.css` |
| Icons | The inline SVG set already in the project |
| Forms & validation | Native forms + **Zod** schemas shared with the backend |
| Mobile-first | Existing responsive CSS; bottom-nav on mobile, header nav on desktop |

### Backend (inside the same Next.js app)

| Concern | Tool / approach |
|---|---|
| API endpoints | **Route Handlers** (`app/api/**/route.ts`) — the "server" |
| Mutations from UI | **Server Actions** where it's a simple form post; Route Handlers for anything the provider portal also calls |
| DB access | **Prisma Client** (server-only, singleton in `lib/db`) |
| Schema & migrations | `prisma/schema.prisma` + `prisma migrate` |
| Seeding mock data | `prisma/seed.ts` (catalog from `services.md` + mock users, captains, bookings) |
| Auth (mock) | Cookie **session** + **mock OTP** (fixed/dev code). Server decides new-vs-returning (per D-04) — never trust a client string |
| Booking dispatch | **Mock dispatch engine** in `lib/dispatch` — builds eligible-captain pool, offers in 30s waves, expires stale offers |
| 30s timer | A lightweight server tick (a `setTimeout`-style expiry job, or an `/api/dispatch/tick` route polled by the client). The countdown in the UI is cosmetic; the server is authoritative |
| Notifications | **Logged, not sent** — write rows to `notification_logs` so the flow is visible (no real WhatsApp/SMS in the demo) |
| Money | Stored as **integer paise**; formatted to ₹ in the UI. No floats |
| Validation | **Zod** schemas in `lib/validation`, reused by client and server |

---

## 2. Folder structure

> One Next.js app at `VSolveHub/`. Customer + Provider live side by side as route groups;
> `app/api` is the shared backend; `prisma` + `lib/db` are the shared data layer.

```
VSolveHub/
├── app/
│   ├── layout.tsx                 # root shell (fonts, providers)
│   ├── globals.css                # design system (existing)
│   │
│   ├── (marketing)/               # public SEO pages
│   │   ├── about/page.tsx
│   │   ├── contact/page.tsx
│   │   ├── faq/page.tsx
│   │   └── gallery/page.tsx
│   │
│   ├── (customer)/                # ───── CUSTOMER WEBSITE ─────
│   │   ├── page.tsx               # home: search, categories, popular
│   │   ├── services/
│   │   │   ├── page.tsx           # all categories hub
│   │   │   └── [cat]/
│   │   │       ├── page.tsx       # category → sub-categories + services
│   │   │       └── [slug]/page.tsx# service detail + fast booking
│   │   ├── booking/
│   │   │   ├── otp/page.tsx       # first-time verify (returning users skip)
│   │   │   ├── confirm/page.tsx   # booking ref + success
│   │   │   └── track/page.tsx     # live status timeline
│   │   └── profile/
│   │       ├── page.tsx           # profile home
│   │       ├── bookings/page.tsx
│   │       ├── saved/page.tsx
│   │       └── addresses/page.tsx
│   │
│   ├── (provider)/                # ───── PROVIDER WEBSITE ─────
│   │   └── partner/
│   │       ├── layout.tsx         # SHELL: detects provider_type → mounts the matching MODE
│   │       ├── login/page.tsx     # phone + OTP (provider)
│   │       ├── onboarding/page.tsx# pick provider_type + per-type KYC doc set
│   │       ├── dashboard/page.tsx # mode-aware home (renders the mode's dashboard)
│   │       ├── leads/page.tsx     # mode-aware: 30s alerts (Captain) OR requests inbox (others)
│   │       ├── work/              # mode-aware management surface
│   │       │   ├── page.tsx       #   jobs (Captain) · inventory (Vendor) · listings (Host) · packages (Studio)
│   │       │   └── [id]/page.tsx  #   item detail + lifecycle buttons for that mode
│   │       ├── calendar/page.tsx  # availability primitive (toggle · schedule · stock · beds · blackout)
│   │       ├── earnings/page.tsx  # per-mode earnings computation
│   │       └── profile/page.tsx   # profile + per-type KYC status
│   │
│   └── api/                       # ───── BACKEND (Route Handlers) ─────
│       ├── auth/
│       │   ├── otp/route.ts       # send + verify (mock)
│       │   └── session/route.ts   # who-am-i, logout
│       ├── catalog/route.ts       # categories / services / search
│       ├── bookings/
│       │   ├── route.ts           # CREATE: resolve archetype → validate fields → route to fulfillment
│       │   └── [ref]/route.ts     # get one, status (per-archetype machine), cancel, rate
│       ├── fulfillment/
│       │   ├── dispatch/route.ts  # A/B: build eligible pool, offer waves     [BUILT]
│       │   ├── dispatch/tick/route.ts  # expire stale 30s offers (server timer)
│       │   └── requests/route.ts  # C–F: provider_requests inbox (hours SLA)  [Phase-2 stub]
│       ├── provider/
│       │   ├── online/route.ts    # Captain: toggle is_online
│       │   ├── offers/route.ts    # Captain: current 30s offer, accept/decline
│       │   ├── requests/route.ts  # other modes: inbox accept/confirm/quote   [Phase-2 stub]
│       │   ├── work/route.ts      # mode-aware lifecycle transitions
│       │   └── earnings/route.ts
│       └── profile/
│           ├── addresses/route.ts
│           └── saved/route.ts
│
├── components/
│   ├── customer/
│   │   ├── home/ services/ profile/   # discovery & account UI
│   │   └── booking/
│   │       ├── BookingRouter.tsx  # reads service.archetype → renders the matching flow
│   │       ├── flows/             # ONE form component per archetype
│   │       │   ├── DispatchForm.tsx   # A  slot + address              [BUILT]
│   │       │   ├── CrewForm.tsx       # B  + headcount, days           [BUILT]
│   │       │   ├── StaffingForm.tsx   # C  role, schedule, pay         [enquiry]
│   │       │   ├── RentalForm.tsx     # D  qty, date range, deposit    [enquiry]
│   │       │   ├── PropertyForm.tsx   # E  sharing, move-in, viewing   [enquiry]
│   │       │   └── QuoteForm.tsx      # F  date, venue, guest count    [enquiry]
│   │       └── StatusTimeline.tsx # renders ANY archetype's status machine
│   ├── provider/
│   │   └── modes/                 # ONE folder per provider_type (adaptive UI)
│   │       ├── captain/           # online toggle, 30s alert, job lifecycle    [BUILT]
│   │       ├── professional/      # availability + requests inbox + engagements [Phase 2]
│   │       ├── vendor/            # inventory + stock calendar + request inbox   [Phase 2]
│   │       ├── host/              # listings + occupancy + booking inbox         [Phase 2]
│   │       └── studio/            # packages/portfolio + calendar + quote inbox  [Phase 2]
│   ├── shared/                    # header, footer, nav, whatsapp FAB
│   └── ui/                        # buttons, inputs, icons, badges
│
├── lib/
│   ├── db/
│   │   ├── client.ts              # Prisma singleton (server-only)
│   │   └── queries/               # typed query functions per domain
│   ├── booking/
│   │   ├── archetypes/            # ◀ BOOKING REGISTRY — one config per archetype
│   │   │   ├── index.ts           #   code (A–F) → flow config
│   │   │   ├── types.ts           #   BookingFlow interface: fields, statuses, mechanic
│   │   │   ├── a-dispatch.ts  b-crew.ts  c-staffing.ts
│   │   │   └── d-rental.ts    e-property.ts  f-quote.ts
│   │   └── resolve.ts             # service → archetype → flow config
│   ├── fulfillment/
│   │   ├── index.ts               # mechanic registry (push-dispatch | inbox-pull)
│   │   ├── push-dispatch.ts       # A/B: eligible pool, 30s waves, expiry  [BUILT]
│   │   └── inbox-pull.ts          # C–F: provider_requests + SLA           [Phase-2 stub]
│   ├── provider/
│   │   └── modes/                 # ◀ PROVIDER REGISTRY — one config per provider_type
│   │       ├── index.ts           #   provider_type → mode config
│   │       └── types.ts           #   ProviderMode: home, surface, lead, KYC, availability, earnings
│   ├── auth/                      # session cookie + mock OTP helpers
│   ├── catalog/                   # category/service/search helpers
│   ├── validation/                # Zod schemas (shared client+server)
│   └── format.ts                  # money (paise→₹), dates, phone
│
├── prisma/
│   ├── schema.prisma              # single source of truth for tables
│   ├── seed.ts                    # catalog + mock data loader
│   └── migrations/
│
├── data/
│   └── dev.db                     # the SQLite file (gitignored)
│
├── legacy/                        # old static prototype (kept for reference)
├── package.json
└── plan.md / services.md          # (these live in repo root)
```

**Two things to delete/repoint during the build:**
- `lib/profile-store.ts` (localStorage) → replaced by `lib/db/queries` + `app/api/profile/*`.
- `lib/data.ts` becomes the **seed source only**; runtime reads come from the DB.

---

## 3. Database tables (Phase 1)

> Defined in `prisma/schema.prisma`. SQLite mappings: UUID→`String` (cuid), JSONB→`String`
> (JSON), money→`Int` (paise), enums→Prisma enums (stored as TEXT). Phase-2 archetype
> tables are **not built**, but their foreign-key columns exist on `bookings` for
> forward-compatibility.

**Identity & customer**
- `users` — one identity (customer and/or provider), phone-unique, `roles`
- `sessions` — cookie session (replaces localStorage session)
- `addresses` — address book, one default per user
- `saved_services` — wishlist (replaces `savedServiceIds`)
- `wallets` + `wallet_transactions` — wallet balance + ledger

**Catalog**
- `service_categories` — top level (slug, name, tagline, icon, order)
- `service_sub_categories` — mid level
- `services` — bookable items (slug, price, archetype, tags, unit)
- `skills` + `skill_sub_categories` — match captains ↔ services (real join, not free text)

**Supply (Captain only in Phase 1)**
- `providers` — supply umbrella (`provider_type = CAPTAIN`)
- `workers` — captain profile (status, skills, `is_online`, location, service area, rating)
- `worker_skills` — captain ↔ skill
- `worker_documents` + `worker_kyc` — KYC (mock: status + last4 only)

**Bookings & dispatch (the core)**
- `bookings` — booking_ref, **`archetype` (A–F)**, **`archetype_details` (JSON)** for the
  per-flow fields, customer, service, worker, status, slot, address, snapshotted amounts,
  idempotency_key
- `booking_status_logs` — append-only audit trail of every status change (any archetype's machine)
- `job_assignments` — the 30-second offer ledger for **A/B** (OFFERED→ACCEPTED/DECLINED/EXPIRED) with a **partial-unique index** so a captain holds at most one live offer
- `provider_requests` — the **inbox-pull** analog for **C–F** (PENDING→ACCEPTED/CONFIRMED/QUOTED/DECLINED/EXPIRED, hours SLA) — *table created, wiring is Phase 2*
- `job_earnings` — gross, commission, net, payout status (money from day one)
- `ratings` — one per booking; updates the provider's avg rating
- `cancellations` + `disputes` — back CANCELLED / DISPUTED statuses

**Platform & logs**
- `otp_logs` — OTP audit (mock)
- `notification_logs` — outbound notifications (logged, not sent)
- `cities` — serviced cities for local discovery/SEO
- `platform_config` — commission rate, dispatch wave size/count
- `contact_enquiries` + `worker_applicants` — web lead forms

---

## 4. Seamless service discovery (the #1 UX priority)

> Goal: a customer finds the right service in **seconds**, from anywhere on the site.

**Find a service — multiple fast paths, all leading to one place:**
1. **Always-present smart search** in the header (sticky on mobile). Searches across
   service name, sub-category, and tags. Typo-tolerant (fuzzy) and shows results as you
   type, grouped by category.
2. **Popular searches & quick chips** under the search box — one tap to the most-booked
   services ("AC service", "Plumber", "Bridal makeup", "House shifting").
3. **Category grid** → **sub-category pills** → **service cards**. Never more than
   3 taps from home to a bookable service.
4. **Recently viewed** + **saved (hearted)** services surfaced on the home screen for
   returning users.
5. **Deep links** — every service has a clean slug URL (`/services/[cat]/[slug]`), so a
   shared link lands directly on the booking screen.

**Make the result obvious:** each service card shows icon, name, sub-category tag, price
range, and a single **Book Now** CTA. No dead ends — an empty category still offers a
"Request this service" path.

**Search implementation (demo):** a server search endpoint over the `services` table
(name + tags), with results debounced on the client. Small enough to be instant; mirrors
the real full-text/trigram search the PRD specifies for Postgres.

---

## 5. Booking is NOT one flow — it's archetype-driven (the key design)

> **Yes — each service "hits different."** A plumber, a crew of masons, a maid placement,
> a generator rental, a PG room, and a wedding shoot are fundamentally different
> transactions. They differ in: **what we ask the customer**, **the status machine**, and
> **how the booking reaches a provider**. We model this once and let every service pick its
> lane.

### 5.1 The principle: `service → archetype → flow`

Every service row carries an **`archetype`** (A–F). One column drives everything:

```
Customer taps "Book"
   │
   ▼
resolve(service)  →  archetype (A–F)
   │
   ├─▶ which FORM to show         (fields differ per archetype)
   ├─▶ which STATUS MACHINE runs  (lifecycle differs per archetype)
   └─▶ which FULFILLMENT mechanic (push-dispatch vs inbox-pull)
```

This is a **registry / strategy pattern**: there is **one** booking route and **one**
booking page; they look up the archetype's config from `lib/booking/archetypes` and render
the matching `flows/*Form.tsx`. Adding/changing a flow = editing one config file, not the
routing. (This mirrors the PRD principle "adding a category needs config, not code.")

### 5.2 The six archetypes (what differs per service)

| Code | Used by | Customer is asked… | Status machine | Reaches provider via | Phase-1 build |
|---|---|---|---|---|---|
| **A** — Instant/Scheduled Dispatch | Technician, Beauty, Cleaning, Vehicle service/wash | slot + address | `SEARCHING → ASSIGNED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED` | **Push-dispatch (30s waves)** | ✅ **Full** |
| **B** — Crew / Daily-wage | Construction, Agri, event labour | A + **headcount** + days | same as A, tracked per-crew (`filled/required`) | **Push-dispatch** (per slot) | ✅ **Full** |
| **C** — Staffing / Placement | Maids, cooks, drivers, security | role, schedule, expected pay, start date | `REQUESTED → SHORTLISTED → TRIAL → ENGAGED → CLOSED` | Inbox-pull / broadcast | ◐ tailored enquiry form |
| **D** — Rental / Inventory | Furniture, tents, tools, appliances | item, **qty**, **date range**, delivery addr (deposit shown) | `REQUESTED → CONFIRMED → OUT_FOR_DELIVERY → IN_USE → RETURNED → CLOSED` | Inbox-pull (vendor) | ◐ tailored enquiry form |
| **E** — Property / Accommodation | Rooms, PG, hostels | sharing/gender filter, **move-in / viewing date** | `ENQUIRY → VIEWING_SCHEDULED → TOKEN_PAID → BOOKED → CLOSED` | Inbox-pull (host) | ◐ tailored enquiry form |
| **F** — Quote / Project | Events, media, full-home painting | **event date, venue, guest count**, package | `ENQUIRY → QUOTED → ADVANCE_PAID → IN_PROGRESS → COMPLETED` | Inbox-pull (studio quotes) | ◐ tailored enquiry form |

**What "tailored enquiry form" means for C–F in the demo:** the customer genuinely sees a
*different* form per archetype (a rental asks date-range + qty; an event asks
date/venue/guests; a PG asks sharing/move-in) and a booking is created with the correct
archetype + status. The provider-side **inbox fulfillment loop** for C–F is the Phase-2
piece — so the demo proves "each service hits different" end-to-end on the customer side,
without building five provider modes at once.

### 5.3 How a booking is guaranteed & routed (the pipeline)

The `POST /api/bookings` handler runs the same safe pipeline for every service — only the
plug-ins differ:

1. **Resolve** — load the service, read its `archetype`, pull that archetype's config.
2. **Validate** — run the archetype's **Zod schema** (dispatch needs a slot; rental needs a
   valid date range; event needs a date) — archetype-specific fields land in
   `bookings.archetype_details` (JSON).
3. **Auth gate** — booking is created only after the phone is verified for this session
   (returning users skip OTP; server decides — never a client string).
4. **Create atomically** — one row with a unique `booking_ref`, the resolved `archetype`,
   price **snapshotted** into `quoted_amount`, and an **`idempotency_key`** so a double-tap
   can't create two bookings.
5. **Log** — append the first `booking_status_logs` row.
6. **Route to fulfillment** — the archetype's mechanic fires:
   - **A/B → push-dispatch:** build the eligible captain pool, offer top-N for 30s, first
     ACCEPT wins (§6). Customer lands on the **live track screen** immediately.
   - **C–F → inbox-pull:** create a `provider_requests` row for the chosen/eligible
     provider with an hours-scale SLA *(Phase-2 wiring; Phase-1 records the enquiry and
     confirms receipt)*.
7. **Confirm** — return the booking ref + the correct first status for that archetype.

### 5.4 Fast path for the common case (Archetype A — "don't make the user spend time")

For the dispatch services that dominate the demo, the form collapses to **~2 taps**:
service is pre-filled & locked, name/phone/address auto-fill from the session, and the
only inputs are **time-slot chips** + a **one-tap saved address**. Submit → `SEARCHING` →
the customer watches the timeline animate while the engine matches a captain. No spinner,
no waiting.

---

## 6. The provider website is ALSO adaptive — one app, five modes

> **Yes — the provider site customizes itself to what they supply.** A captain, a maid, a
> generator-rental business, a PG owner, and a wedding studio supply in completely different
> ways and must NOT share one "go online → accept in 30s" screen (PRD D-24). So the
> provider site is **one shell** that detects `providers.provider_type` after login and
> **mounts the matching mode** — same pattern as the booking registry, on the supply side.

### 6.1 How it adapts (no separate apps, no forked routes)

```
Provider logs in
   │
   ▼
read providers.provider_type
   │
   └─▶ lib/provider/modes[type]  →  mode config
           ├─▶ home dashboard        (components/provider/modes/<mode>)
           ├─▶ lead mechanic         (30s alerts  vs  requests inbox)
           ├─▶ management surface    (jobs · inventory · listings · packages · engagements)
           ├─▶ availability primitive(toggle · schedule · stock · beds · blackout)
           ├─▶ KYC document set      (differs per type)
           └─▶ earnings computation  (per-job · rent−commission · token · advance+final)
```

The routes (`/partner/dashboard`, `/partner/leads`, `/partner/work`, `/partner/calendar`,
`/partner/earnings`) **stay the same**; their *content* is whatever the active mode renders.
`partner/layout.tsx` is the shell that resolves the mode. This is why the folder is
`components/provider/modes/<mode>/` and `lib/provider/modes/` — adding a provider type =
adding one mode module, not new pages.

### 6.2 The five modes

| `provider_type` | Mode | Home / lead mechanic | Manages | Availability | Phase-1 |
|---|---|---|---|---|---|
| `CAPTAIN` | Captain | online toggle + **30s job alert** | active job → completed | real-time `is_online` | ✅ **Full** |
| `PROFESSIONAL` | Professional | profile + **requests inbox** (hrs SLA) | engagements (maid/cook/driver) | weekly schedule | Phase 2 |
| `RENTAL_VENDOR` | Vendor | **inventory** + request inbox | items, stock, deliveries/returns | per-item stock calendar | Phase 2 |
| `PROPERTY_HOST` | Host | **listings** + booking inbox | rooms/beds, viewings | free-beds / available-from | Phase 2 |
| `EVENT_VENDOR` | Studio | **portfolio/packages** + enquiry inbox | quotes, booked dates | booked-date / blackout calendar | Phase 2 |

**Per-type KYC (the gate is shared; the documents differ):** Captain/Professional = Aadhaar
+ live selfie (+ optional skill cert); Vendor/Studio = owner Aadhaar + business proof +
inventory/portfolio photos; Host = owner Aadhaar + property ownership proof + photos. The
onboarding step reads the mode's `kyc` config to render the right uploader. *(Mock: we store
status + last4 only.)*

### 6.3 How a booking reaches a Captain (the one mode we build fully)

Customer books an A/B service → server builds the **eligible pool** (`status=ACTIVE`,
`is_online=true`, skill matches the service's sub-category, within service area) → **ranks**
by distance → rating → idle-time (fairness) → offers the **top N via `job_assignments`** for
30s. First **ACCEPT** wins → booking → `ASSIGNED`. Declined/expired → **next wave**. All
waves exhausted → `NO_WORKER_FOUND` (customer gets retry / schedule-later / notify-me). The
30s timer is **server-authoritative**; the captain's on-screen countdown is cosmetic.

> **Phase 2 (designed now, not built):** Professional/Vendor/Host/Studio modes + the
> **Inbox-Pull** mechanic (`provider_requests`, hours SLA) + the heavier management surfaces
> (which is why those types are **web-portal-first** — `partner.vsolvehub.com`). The schema
> and the mode registry already make room for them; only the mode modules are unbuilt.

---

## 7. Build sequence

1. **Foundation** — add Prisma + SQLite; write `schema.prisma` (incl. `archetype`,
   `archetype_details`, `provider_type`); enable WAL + foreign keys; add the
   partial-unique-index migration for the single-live-offer rule.
2. **Registries** — define the **booking registry** (`lib/booking/archetypes`, the
   `BookingFlow` interface + 6 configs) and the **provider mode registry**
   (`lib/provider/modes`, the `ProviderMode` interface). These are the backbone everything
   else plugs into.
3. **Seed** — turn the catalog in `services.md` into `prisma/seed.ts` (each service tagged
   with its archetype); generate mock customers, ~20–30 captains across skills/cities, and
   sample bookings in every status.
4. **Data layer + auth** — `lib/db/queries`; cookie session + mock OTP; remove
   `localStorage` from the profile store.
5. **Customer site** — wire catalog + search to the DB; build `BookingRouter` + the
   **Archetype A** fast flow fully, and the **C–F tailored enquiry forms**;
   `SEARCHING`/status → track.
6. **Fulfillment + Captain mode** — push-dispatch engine (eligible pool, wave offers,
   expiry tick) + the Captain provider mode (online toggle, 30s alert, lifecycle, earnings).
7. **Polish** — seed-reset script, Zod validation everywhere, a Postgres-swap checklist.

> **Phase-2 (scaffolded, not built):** the Inbox-Pull mechanic + the four non-Captain
> provider modes. The registries already reserve their slots, so they're additive.

---

## 8. Conventions & best practices

- **Server is the source of truth.** The browser stores only a session cookie.
- **Money in integer paise**, formatted at the edge. Never floats.
- **All timestamps UTC** in the DB, displayed as IST in the UI.
- **Append-only audit** for `booking_status_logs` and `job_assignments` — never update or
  delete; insert a new row.
- **Validation once, shared** — Zod schemas imported by both the form and the API.
- **Forward-compatible schema** — snake_case column mapping + nullable Phase-2 columns, so
  the move to PostgreSQL is mechanical.
- **Seed is reproducible** — `prisma migrate reset` rebuilds an identical demo every time.
```
