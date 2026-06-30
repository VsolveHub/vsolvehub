# VSolveHub — Canonical Decisions & Reconciliation Register

> **Version:** 1.1 | **Last Updated:** 2026-06-17 | **Status:** Normative — Authoritative
>
> **Precedence rule:** This document is the single source of truth for cross-cutting
> conventions. **Where any other PRD document conflicts with this file, this file wins.**
> When you fix a conflicting doc, update it to match this register and remove the conflict.
>
> This register was produced by the v1.1 PRD audit, which found load-bearing
> contradictions and missing data models across the original 14 documents. Each entry
> below states the **decision**, the **rationale**, and the **documents it supersedes**.

---

## D-00 — Brand, Domain & Naming Canon

| Item | Canonical value |
|---|---|
| Product / platform brand | **VSolveHub** |
| Apex domain | **vsolvehub.com** |
| Marketing site | `https://www.vsolvehub.com` |
| Customer app subdomain (deep links/OG) | `https://app.vsolvehub.com` |
| Admin panel | `https://admin.vsolvehub.com` |
| API base | `https://api.vsolvehub.com` |
| Staging | `https://staging.vsolvehub.com` / `https://api-staging.vsolvehub.com` |
| CDN | `https://cdn.vsolvehub.com` |
| Booking reference prefix | `VSH-` (service), `VSH-R-` (rental/enquiry) |
| Email sender | `noreply@vsolvehub.com` / `alerts@vsolvehub.com` |

**Superseded:** every occurrence of "Quick Service Hub", `quick-service-hub.com`,
and `vsolvehub.in` is replaced by the VSolveHub / `vsolvehub.com` values above.
"Quick Service Hub" may remain **only** in `business_docs/brd_summary.md` where it
identifies the historical client/BRD origin, annotated as such.

---

## D-01 — One Booking Status Vocabulary (Lead = Booking)

A "lead" in the admin panel **is** a booking row. There is exactly **one** booking
status enum. Admin-only concepts (`NEW`, `VIEWED`, `SPAM`, `CLOSED`) become flags/
timestamps, **not** status values.

**Canonical `bookings.status`:**

```
PENDING_VERIFICATION   → created, phone not yet OTP-verified (not shown to admin)
PENDING                → verified & awaiting admin action  (admin label: "NEW")
CONFIRMED              → admin reviewed/confirmed the lead
ASSIGNED               → a worker is currently assigned (an accepted job_assignment exists)
ON_THE_WAY
ARRIVED
IN_PROGRESS
COMPLETED
CANCELLED
DISPUTED
```

**Admin-only fields on `bookings` (not status values):**
`viewed_at TIMESTAMPTZ NULL`, `is_spam BOOLEAN DEFAULT FALSE`,
`closed_at TIMESTAMPTZ NULL`, `phone_verified BOOLEAN DEFAULT FALSE`.

**Lead-machine → status mapping:** `NEW = PENDING`, `VIEWED = PENDING + viewed_at`,
`SPAM = is_spam`, `CLOSED = COMPLETED + closed_at`.

**Superseded:** the three divergent state machines in `user_flow.md` (F-01 booking,
F-03 job, F-04 lead) and the `bookings` enum in `data_models.md`.

---

## D-02 — The Job Offer Lifecycle Lives in `job_assignments` (NEW MODEL)

The 30-second accept/decline/expire/reassign mechanic is **not** part of
`bookings.status`. It is an append-only offer ledger. The booking holds the *current*
worker; `job_assignments` holds *every* offer made.

See `data_models.md → job_assignments`. Status enum:
`OFFERED → ACCEPTED | DECLINED | EXPIRED`. On `ACCEPTED`, the booking moves to
`ASSIGNED` and the assignment's `worker_id` becomes `bookings.worker_id`.
On `DECLINED`/`EXPIRED`, the booking stays `CONFIRMED` and admin re-offers
(new `job_assignments` row, `attempt_no += 1`).

**Superseded:** the implicit assumption in `data_models.md` that `bookings.worker_id` +
`bookings.status` can represent the offer lifecycle. They cannot.

---

## D-03 — OTP: One Spec

| Parameter | Canonical value |
|---|---|
| Length | 6 digits, numeric, `secrets.randbelow` |
| Live store | **Redis** (atomic `incr`, TTL lockout) — authoritative for verification |
| Audit store | `otp_logs` table — phone, purpose, outcome, timestamps **only**; never enough to verify |
| Hashing | **bcrypt, cost 12** (the audit/Redis value is a bcrypt hash; SHA-256 is not used) |
| Validity | 10 minutes, single-use (deleted on success) |
| Max verify attempts | **3** per OTP → on 3rd failure, OTP invalidated |
| Resend cooldown | 60 seconds |
| Resend cap | **5 per phone per rolling hour** |
| Post-failure lockout | After invalidation, the phone must request a **new** OTP; a fresh send is allowed after the 60s cooldown (no separate multi-minute lockout) |
| Delivery | MSG91 → Fast2SMS → (intl) Twilio; see `integrations.md INT-002` |

**Mobile bot protection:** reCAPTCHA v3 is web-only. The Flutter apps protect
`otp/send` with **Play Integrity (Android) / App Attest (iOS)** + the per-phone
Redis throttle above. reCAPTCHA is **not** required on the OTP endpoint for app clients.

**Superseded:** the conflicting OTP specs in `base.md §6`, `non_functional.md §2.2`
(60s lockout), `integrations.md INT-002` (SHA-256, 30-min lockout, table-as-truth),
and `user_stories.md US-C006` / `features.md F-003` (10-min lockout).
The single-source-of-truth store is **Redis**; the table is audit-only.

---

## D-04 — Auth: Server-Authoritative Returning-User Fast Path

**A booking is created only after the phone is OTP-verified for this session.**
The flow is: submit form → OTP (if needed) → on verify, create booking as `PENDING`
and notify admin. A booking may exist transiently as `PENDING_VERIFICATION` for
idempotency/retry, but **admin is not notified and no worker is assignable** until
`phone_verified = TRUE`.

"Returning user skips OTP" is gated by a **valid server-issued refresh token** proving
this device previously verified this phone — **never** a `localStorage` phone string.
The server decides new-vs-returning; the client claim is untrusted.

| Token | Lifetime | Storage |
|---|---|---|
| Access (JWT, RS256) | 15 min | Web: memory only. Mobile: Keychain/Keystore |
| Refresh (JWT, RS256) | 30 days, rotated on use, blocklist on logout | Web: HttpOnly+Secure cookie. Mobile: secure enclave |

**Superseded:** `user_stories.md US-C007` and `user_flow.md F-01/F-05`
(localStorage `vsh_users` skip-OTP), and the "POST booking then OTP" ordering in
F-01. The live demo's `vsh_users`/`vsh_booking` client storage is **prototype-only**
and must not ship as the trust boundary.

---

## D-05 — User Roles on One Identity

One phone = one `users` row. A human may be both a customer and a worker. The JWT
carries a `roles` claim (`["customer"]`, `["worker"]`, or both). Worker endpoints
require the `worker` role **and** `workers.status = ACTIVE`; customer endpoints
require the `customer` role. The FCM `app_type` (customer/worker) routes pushes.

**Superseded:** the unstated role model in `data_models.md`.

---

## D-06 — API Contract: Frozen Conventions

- **Base + version:** all client/admin endpoints are under **`/api/v1/`**. No bare
  `/api/...` form. (Internal Next.js route handlers may proxy under `/api/` but call
  the Django API at `/api/v1/`.)
- **Auth refresh endpoint (canonical):** `POST /api/v1/auth/token/refresh/`.
- **Envelope:** every response uses the `{success, data, meta, error}` envelope from
  `base.md §5`. Errors carry a stable `error.code` from the Error Code Registry
  (to be authored; see Open Docs).
- **Idempotency:** mutating booking/assignment endpoints accept an `Idempotency-Key`
  header, persisted to `bookings.idempotency_key`.

**Superseded:** the `/api/...` (no v1) paths in `integrations.md` and
`non_functional.md`, and the `/auth/refresh/` variant.

---

## D-07 — Worker Schema: One Column, One Vocabulary

The worker lifecycle column is **`workers.status`** with values
`UNVERIFIED | PENDING_VERIFICATION | ACTIVE | REJECTED | SUSPENDED`
(plus `PARTIAL_REVIEW`, see D-13). The value for an approved worker is **`ACTIVE`**.

**Superseded:** `non_functional.md` SQL using `approval_status = 'APPROVED'`.
All indexes/queries use `status = 'ACTIVE'`.

---

## D-08 — Money Model Is Recorded From Day One (gateway deferred, amounts are not)

Even though the payment **gateway** is Phase 3, all **amounts** are persisted from
launch, or earnings/reports are fiction.

- `bookings.quoted_amount` and `final_amount` (price **snapshotted** at booking time so
  later catalog edits never rewrite history), `currency` (default `INR`).
- `job_earnings` / `payouts` table: gross, `commission_rate`, `commission_amount`,
  `net_payable`, `payout_status (PENDING|PROCESSING|PAID)`.
- `platform_config` holds the default `commission_rate` (overridable per category).

**Superseded:** the absence of any price/earnings field in `data_models.md`, while
`worker_app.md` / `features.md F-015` display earnings and payment status.

---

## D-09 — URLs & SEO: Slugs, Not Numeric IDs

- `services` gains a unique **`slug`**. Canonical service URL: `/services/[cat]/[slug]`.
  Legacy numeric `/services/[cat]/[id]` issues a **301** to the slug URL.
- Local-SEO city landing pages `/[city]/[cat]` are **in scope**: add a `cities` table
  and `getServicedCities()`. If a city has no active workers/services it is excluded
  from the sitemap (no thin/empty pages).
- Canonical, sitemap, JSON-LD, and OG all use the slug URL on `vsolvehub.com`.

**Superseded:** the numeric-`id` routing in `web_app.md` / live code vs. the
slug-based SEO in `non_functional.md §4`, and the missing `cities` model.

---

## D-10 — Real-Time Strategy

- **Admin assignment screen** uses **WebSocket (Django Channels)** — it must reflect a
  worker's accept/decline within the 30-second window; 60-second polling is too slow.
- **Customer track screen** uses 30-second polling at launch (WebSocket optional later).
- **Stack additions (mandatory):** Celery + Celery-beat (async notifications, timers,
  sweepers, exports) and Django Channels + Redis channel layer. These are load-bearing
  and must appear in `base.md`'s stack and repo structure.

**Superseded:** `base.md` omitting Celery/Channels; the "polling vs WebSocket"
ambivalence in `features.md F-005/F-007` and `admin_panel.md`.

---

## D-11 — The 30-Second Timer Is Server-Authoritative

When the **dispatch engine offers** a job (D-20 — not an admin), the server writes
`job_assignments(status=OFFERED, expires_at=now()+30s)` and schedules a Celery task at
`expires_at`. If no `ACCEPTED` by then, the server flips the row to `EXPIRED` and the
engine moves to the next wave. The client countdown is **cosmetic**; the client
`/timeout` call is an optimization, not the source of truth. Handles offline workers and
clock skew.

**Single-active-job invariant:** a worker may hold at most one assignment in
`OFFERED` or an `ASSIGNED` booking at a time. Enforced by a partial unique index +
`SELECT … FOR UPDATE` on assign, so two admins cannot double-assign.

**Superseded:** the client-driven `/timeout` in `integrations.md INT-003 §4c` as the
authority, and the unenforced "max 1 active job" note in `worker_app.md`.

---

## D-12 — Enquiry vs. Dispatch Categories

The marketplace has **two** fulfilment shapes:

| Shape | Categories | Path |
|---|---|---|
| **Dispatch** (worker assigned) | Construction, Technician, Beautician, Manpower, Vehicle | booking → assignment → status flow |
| **Enquiry** (admin confirms manually, often no worker) | Equipment Rental, Events, Accommodation (PG/rooms viewing & referral) | booking_type carries `enquiry_details JSONB`; no 30s timer; admin confirms |

Enquiry-only fields (event type, duration, quantity, venue, guest count, viewing date)
live in `bookings.enquiry_details JSONB`, validated per `booking_type`.

**Superseded:** the single dispatch-only model in `data_models.md` that forced
`service_id` + worker assignment onto rental/accommodation enquiries.

---

## D-13 — Re-Verification State

Editing identity-significant fields (skills that change category, service area to an
unsupported city) moves the worker to **`PARTIAL_REVIEW`** (added to D-07's enum):
they keep their `ACTIVE` history but cannot receive new jobs until an admin re-confirms.
Aadhaar/phone changes require support intervention (full re-KYC).

**Superseded:** `user_stories.md US-W014`'s "may trigger partial re-review" with no
state, and the missing `PARTIAL_REVIEW` value.

---

## D-14 — KYC / Aadhaar Depth

Worker onboarding captures the **Aadhaar number** (text) in addition to front/back
photos. The number is stored **AES-256-GCM encrypted** with `aadhaar_last4` for display
(`XXXX XXXX 4321`); raw number never appears in logs, API responses, or analytics.
Document **images** stay in a private S3 bucket (pre-signed, 15-min URLs).
`worker_documents` (images) and `worker_kyc` (encrypted number + bank, see D-08) are
distinct tables.

**Superseded:** the contradiction between `worker_app.md §4a` (photo-only) and
`non_functional.md §7.5` (stores an encrypted number + last4), and the divergent
`worker_documents` vs. `WorkerDocument` shapes.

---

## D-15 — Contact-Sharing & Privacy Policy

- Customer sees the worker's **name + skill + rating** on assignment, **not** a raw
  phone number. In-app/WhatsApp contact is via a **masked proxy number** (or in-app
  chat). The `worker_assigned` WhatsApp template therefore links to a proxy/chat,
  not `worker_phone`.
- Worker sees the **full customer address only after acceptance**; before acceptance,
  only the area is shown.

**Superseded:** `integrations.md WA-T02` exposing `worker_phone` directly, which
contradicts the "name + skill only" rule in `user_stories.md US-C009` /
`worker_app.md` critical UX rules.

---

## D-16 — Cancellation, Dispute & Notification-Receipt Models

- **Cancellations:** `cancellations` table (booking_id, cancelled_by, reason, penalty,
  refund_txn). Penalty policy keyed by the status at cancel time.
- **Disputes:** `disputes` table (booking_id, raised_by, issue_type, notes, resolution,
  resolved_by) backs the `DISPUTED` status + "raise an issue" types.
- **Notification receipts:** the notification log carries `provider`,
  `external_message_id`, and `delivered_at` so WhatsApp/email delivery webhooks can
  update it. There is **one** model — see D-17.

---

## D-17 — One Notification Model + One FCM Device Model

- Notifications use a **single** model (merge `notification_logs` and the
  `MessageLog`/`FCMDevice` shapes from `integrations.md`):
  `notification_logs(id, recipient_type, recipient_id, channel, provider, template_id,
  payload JSONB, status, external_message_id, error_message, sent_at, delivered_at,
  created_at)`.
- Device tokens use **one** `fcm_devices` table (added to the data model):
  `(id, user_id FK→users, fcm_token UNIQUE, platform, app_type, is_active, created_at,
  updated_at)`. Registration endpoint (canonical):
  `POST /api/v1/devices/fcm/register/ { fcm_token, platform, app_type }`.

**Superseded:** the two notification model names and two FCM endpoint/field shapes
across `data_models.md`, `features.md F-017`, and `integrations.md INT-003`.

---

## D-18 — Skill ↔ Service Taxonomy

A canonical **`skills`** table links worker capability to bookable services so admin's
"auto-filter workers by skill match" is a real join, not free-text matching.
`skills` ⇄ `service_sub_categories` (a skill maps to the sub-categories it can fulfil),
and `worker_skills.skill_id` → `skills.id` (replacing free-text `skill_name`).

**Superseded:** free-text `worker_skills.skill_name` with no link to services in
`data_models.md`.

---

## D-19 — Misc. Frozen Values

| Topic | Decision | Supersedes |
|---|---|---|
| Booking max advance date | **90 days** | `features.md F-002` (30 days) |
| Home page ISR revalidate | **1800s (30 min)** | `base.md §7` (3600) vs `non_functional.md §1.2` (1800) |
| Catalog size (canonical) | **849 services / 51 sub-categories / 8 categories** | "850"/"850+"/94 drift in README & home |
| Booking time | capture **time slot** (`MORNING/AFTERNOON/EVENING`) + optional exact time; "urgent < 2h" only when exact time given | slot vs `TimeField` split |
| SMS auto-read (Android) | use a **separate DLT-approved OTP template variant** containing the 11-char SMS-Retriever app hash | not previously addressed |
| Catalog source of truth | Postgres `services` (seeded from `lib/data.ts` once); frontend stops reading `data.ts` after cutover | migration path unspecified |
| Catalog scope | **superseded by D-22** (11 categories, phased) | the 8-category / 849-service set |

---

## D-20 — Direct Booking, No Admin Assignment (the Rapido model)

> **This is a core architecture change (v1.2). It supersedes every "admin assigns a
> worker" step in the original PRD.**

Customers book a service (now or for a slot) and the platform **auto-dispatches** to
eligible verified workers. **No admin is in the assignment path.** The 30-second
accept mechanic (D-02/D-11) is now triggered **by the booking**, not by an admin click.

**Dispatch engine (auto-matching):**
1. On a verified booking, the server builds the **eligible-worker pool**:
   `workers.status = ACTIVE`, `is_online = TRUE`, skill matches the service's
   sub-category (D-18), within `service_area` of the booking location, no live
   assignment (D-11 single-active-job invariant).
2. Workers are **ranked** by distance → rating → idle-time (fairness), and offered the
   job via `job_assignments` (`OFFERED`, `expires_at = now()+30s`) in **waves**
   (default wave size + count are in `platform_config`; e.g. offer top 3, 30s, then
   next 3).
3. First `ACCEPTED` wins → booking → `ASSIGNED`. `DECLINED`/`EXPIRED` → next wave.
4. If all waves exhaust with no acceptance → `NO_WORKER_FOUND`; the customer is offered
   **retry / schedule later / notify-me-when-available** (no silent failure).

**New canonical `bookings.status` for dispatch archetypes (A/B):**
```
PENDING_VERIFICATION → SEARCHING → ASSIGNED → ON_THE_WAY → ARRIVED
                     → IN_PROGRESS → COMPLETED
              (also) → NO_WORKER_FOUND | CANCELLED | DISPUTED
```
`SEARCHING` replaces the admin-review `PENDING`/`CONFIRMED` states for dispatch
bookings. (`PENDING`/`CONFIRMED` remain only for non-dispatch archetypes that need a
manual confirm — see D-21.) This refines the D-01 enum.

**Admin's new role (NOT assignment):** worker verification/KYC approval, catalog
management, **dispute & complaint resolution**, monitoring/health, customer & worker
support, finance/payouts, fraud review, and **manual override only as an exception**
(e.g. force-assign when auto-dispatch repeatedly fails). The admin dashboard becomes an
operations/monitoring console, not a dispatch console.

**Superseded:** `user_flow.md` F-04 (admin lead-assignment) and the
"admin reviews lead → assigns worker" steps in F-01/F-03; `user_stories.md` US-A003
(admin assigns), and the admin "Assign Worker" panel in `admin_panel.md`. The
`job_assignments` ledger and 30s timer (D-02/D-11) are unchanged — only the **trigger**
moves from admin to the auto-dispatch engine.

---

## D-21 — Booking Archetypes (one of these per category)

"Direct booking" is not one flow. Every category maps to exactly one archetype, which
determines its booking flow, status set, and whether the dispatch engine (D-20) runs.
`bookings.archetype` (new column) stores it.

| Code | Archetype | Dispatch engine? | Status set | Categories |
|---|---|---|---|---|
| **A** | Instant / Scheduled Dispatch | **Yes** (D-20) | `…→SEARCHING→ASSIGNED→ON_THE_WAY→ARRIVED→IN_PROGRESS→COMPLETED` | Home Repair & Appliances, Cleaning & Pest, Beauty at Home, Vehicle service/wash, Goods transport |
| **B** | Crew / Daily-wage Dispatch | **Yes** (headcount > 1) | same as A, but per-crew; `headcount` field | Construction & Labour, Agriculture & Farm, event helpers |
| **C** | Staffing / Placement | No (browse + apply + trial) | `REQUESTED→SHORTLISTED→TRIAL→ENGAGED→CLOSED` | Domestic Help & Staffing (maid, cook, nanny, security, permanent driver) |
| **D** | Rental / Inventory | No (availability + deposit) | `REQUESTED→CONFIRMED→OUT_FOR_DELIVERY→IN_USE→RETURNED→CLOSED` | Equipment & Furniture Rental, vehicles-for-rent, tools |
| **E** | Property / Accommodation | No (listing + viewing/token) | `ENQUIRY→VIEWING_SCHEDULED→TOKEN_PAID→BOOKED→CLOSED` | Rooms, PG & Rentals |
| **F** | Quote / Project | No (site visit → quote → advance) | `ENQUIRY→QUOTED→ADVANCE_PAID→IN_PROGRESS→COMPLETED` | Events & Media, full-home painting, large construction projects |

Non-dispatch archetypes (C–F) do **not** use the 30s engine and may retain a light
human/admin or provider confirmation step. Archetype-specific fields live in
`bookings.archetype_details JSONB` (rename of `enquiry_details`, D-12), validated per
archetype. Data models for D (inventory) and E (property listings) are added in
`data_models.md` (see D-22 follow-ups).

**Supersedes:** D-12's binary "dispatch vs enquiry" split — now a 6-way archetype model.

---

## D-22 — Master Catalog Scope (11 categories, phased internally)

The platform is an "everything local services" super-app. **All 10 core categories are
in scope, delivered in internal phases; Tutors & Classes is the one expansion vertical
(Phase 2).** Full taxonomy in `business_docs/service_catalog.md`.

| ID range | Category | Archetype | Delivery phase |
|---|---|---|---|
| 1000–1999 | Home Repair & Appliances | A | **Phase 1** |
| 2000–2999 | Home Cleaning & Pest Control | A | **Phase 1** |
| 3000–3999 | Beauty & Salon at Home | A | **Phase 1** |
| 4000–4999 | Construction & Labour | B | **Phase 1** |
| 5000–5999 | Domestic Help & Staffing | C | Phase 2 |
| 6000–6999 | Vehicle & Goods Transport | A/D | **Phase 1** (transport/wash) · Phase 2 (rental) |
| 7000–7999 | Events & Media | F | Phase 2 |
| 8000–8999 | Equipment & Furniture Rental | D | Phase 2 |
| 9000–9999 | Rooms, PG & Rentals | E | Phase 2 |
| 10000–10999 | Agriculture & Farm | B | **Phase 1** |
| 11000–11999 | Tutors & Classes | A | Phase 2 |

Phasing is governed by **D-27** (Phase 1 = dispatch/Captain only).
**Supersedes:** the 8-category taxonomy in `service_catalog.md`, `data_models.md` §6
ID ranges, `overview.md` scope, and the BRD's module list.

---

## D-23 — Mobile Stack = Flutter

The Customer App and Worker App are built in **Flutter** (Dart), not React Native/Expo.
Push via `firebase_messaging`; secure token storage via `flutter_secure_storage`
(Keychain/Keystore); live selfie via `camera`; maps via `google_maps_flutter`.

**Superseded:** "React Native (Expo Managed Workflow)" in `base.md §1`/repo structure,
`apps/customer_app.md`, `apps/worker_app.md`, and the RN code samples in
`integrations.md INT-003`. These must be reconciled to Flutter (RN code samples become
illustrative pseudo-code until rewritten).

---

## D-24 — Provider Model: One Adaptive Provider App, Five Provider Types

The supply side is as archetype-dependent as the demand side. "Worker App" is renamed
the **Provider App** — **one** app that renders a different experience based on
`providers.provider_type`. A captain, a maid, a generator-rental business, a PG owner,
and a wedding studio supply in fundamentally different ways and must NOT share one
captain-style "go online → 30s accept" UI.

| `provider_type` | Serves archetype | App "home" / mode | Manages |
|---|---|---|---|
| `CAPTAIN` | A, B (dispatch/crew) | Online toggle + job alerts (current `worker_app.md`) | skills, service area, active job, earnings |
| `PROFESSIONAL` | C (staffing) | Profile + availability + **requests inbox** | profile, availability schedule, engagements |
| `RENTAL_VENDOR` | D (rental) | **Inventory dashboard** + request inbox | inventory items, stock, availability calendar, deliveries/returns |
| `PROPERTY_HOST` | E (property) | **Listings dashboard** + request inbox | property listings, rooms/beds occupancy, bookings |
| `EVENT_VENDOR` | F (quote) | **Portfolio/packages** + calendar + enquiry inbox | packages, portfolio, booked-date calendar, quotes |

A provider has **one primary type** in v1 (multi-type deferred). The shared spine
(auth/OTP, KYC gate, ratings, notifications, earnings/payouts) is common; only the home
experience, lead mechanic (D-25), management surface (D-26), and KYC document set differ.

**Superseded:** the single captain-only "Worker App" in `apps/worker_app.md` and the
assumption that every supplier is an individual dispatched worker.

---

## D-25 — Lead Routing: Push-Dispatch vs Inbox-Pull

There are **two** ways a booking reaches a provider. The booking's archetype (D-21)
decides which:

| Routing | How the provider is chosen | Mechanic | Archetypes |
|---|---|---|---|
| **Push-Dispatch** (system-picks) | The engine (D-20) selects eligible providers | 30-second `job_assignments` offer waves; FCM HIGH push | **A, B**; and C *when the customer submits a requirement* (offered to several professionals) |
| **Inbox-Pull** (customer-picks) | The customer browsed and chose *this* provider's item/listing/studio | A `provider_requests` row lands in the provider's inbox; respond within an **hours-scale SLA** (not 30s); accept/confirm/quote | **D, E, F**; and C *when the customer picks a specific profile* |

`provider_requests` (new model) is the inbox analog of `job_assignments`:
`(id, booking_id, provider_id, request_type, status[PENDING|ACCEPTED|CONFIRMED|QUOTED|DECLINED|EXPIRED], response_sla_at, responded_at, quote_amount, notes)`.
SLA expiry (e.g. 2–4h, per-type in `platform_config`) auto-`EXPIRED` via Celery, and for
customer-picked items the customer is then shown the next-best alternative.

**Why this matters:** rental/property/event providers must NOT get blind 30s pushes for a
product the customer specifically chose from *their* catalog — they need an inbox they
manage against their inventory/calendar.

**Superseded:** the implication in D-20 that *all* leads flow through the 30s dispatch
engine. Only A/B (and requirement-based C) do.

---

## D-26 — Partner Web Portal + Per-Type Verification, Availability & Catalog

**Partner Web Portal** (`partner.vsolvehub.com`): a responsive web console for the
inventory/listing-heavy provider types (`RENTAL_VENDOR`, `PROPERTY_HOST`, `EVENT_VENDOR`)
where phone data-entry is impractical (managing 80 chairs' stock, 30 PG beds, a photo
portfolio, a multi-week calendar). `CAPTAIN`/`PROFESSIONAL` are **app-first** (field
workers); vendors get **web for management + the app for on-the-go** confirm/deliver/quote.

**Per-type verification (KYC gate stays; document set differs):**

| Type | Required documents |
|---|---|
| `CAPTAIN` / `PROFESSIONAL` | Aadhaar (front/back) + **live selfie** + optional skill certificate |
| `RENTAL_VENDOR` / `EVENT_VENDOR` | Owner Aadhaar + business proof (shop/GST optional) + sample inventory/portfolio photos |
| `PROPERTY_HOST` | Owner Aadhaar + **property ownership/authorisation proof** + property photos |

**Per-type "availability" means different things:**

| Type | Availability primitive |
|---|---|
| `CAPTAIN` | real-time `is_online` toggle + location ping |
| `PROFESSIONAL` | weekly availability schedule |
| `RENTAL_VENDOR` | per-item stock calendar (units booked per date range) |
| `PROPERTY_HOST` | per-listing free-beds / available-from |
| `EVENT_VENDOR` | booked-date / blackout calendar |

**Per-type earnings/payout (all flow into `job_earnings`/`payouts`, D-08, but compute
differently):** captain = per-job net; rental = rent − commission + deposit settlement;
property = token/commission; event = advance + final − commission.

**New data models (added to `data_models.md`):** `providers` (umbrella w/ `provider_type`),
`vendor_profiles`, `rental_items`, `property_listings`, `provider_requests`,
`provider_blackout_dates`. `workers` becomes the `CAPTAIN`/`PROFESSIONAL` profile.

---

## D-27 — Phasing: Phase 1 = Direct Worker Booking Only

> **Scope lock (v1.4).** Phase 1 ships **only the direct booking of workers** — the
> dispatch model (Captain mode, Archetypes **A & B**, Push-Dispatch). **Everything that
> needs the Partner Web Portal or the Inbox-Pull mechanic is Phase 2.**

| | **Phase 1 (launch)** | **Phase 2** |
|---|---|---|
| Booking archetypes | **A** (Instant/Scheduled Dispatch), **B** (Crew Dispatch) | C (Staffing), D (Rental), E (Property), F (Quote) |
| Provider types | **CAPTAIN** only | PROFESSIONAL, RENTAL_VENDOR, PROPERTY_HOST, EVENT_VENDOR |
| Lead mechanic | **Push-Dispatch** (30s, `job_assignments`) | Inbox-Pull (`provider_requests`) |
| Categories | Home Repair (1), Cleaning & Pest (2), Beauty at Home (3), Construction & Labour (4), Vehicle service/wash + goods transport (6, A/B parts), Agriculture & Farm (10) | Domestic Staffing (5), Vehicle rental (6-D), Events (7), Equipment Rental (8), Rooms/PG (9), Tutors (11) |
| Apps | Customer App, **Provider App = Captain mode only**, Admin (monitoring/verification/disputes) | + Provider App modes 2–5, **Partner Web Portal** (`partner.vsolvehub.com`) |
| Data models live at launch | `providers` (CAPTAIN), `workers`, `job_assignments`, dispatch statuses | `vendor_profiles`, `rental_items`, `property_listings`, `provider_requests`, `provider_blackout_dates` |

**Implication:** the Phase-2 tables are **designed now** (schema stays forward-compatible)
but **not built or wired** in Phase 1. The Phase-1 booking flow uses only Archetype A/B +
`job_assignments`.

**Effect on D-21/D-22/D-24/D-25/D-26:** those remain the canonical *design*; D-27 only
governs **what ships when**. Archetypes C–F, Inbox-Pull, and the Partner Web Portal are
all **Phase 2**.

---

## Open Docs (still to author for full prod-readiness)

These were listed as "Upcoming" in `updates/changelog.md` and remain required:

1. **API contract spec** — endpoint-by-endpoint request/response/error, using D-06.
2. **Error code registry** — stable `error.code` catalog for the envelope.
3. **Test scenarios & QA checklist** — incl. the edge cases in this register.
4. **Go-live & security checklist** — pen-test scope, DLT/SPF/DKIM/DMARC, secrets,
   backups, rollback.
5. **Catalog seed/migration plan** — `lib/data.ts` → `services`/`skills`/`cities`.

---

*Maintainer: Product & Engineering. This register is updated whenever a cross-cutting
decision is made or a new contradiction is found. Bump the PRD version in `changelog.md`.*
