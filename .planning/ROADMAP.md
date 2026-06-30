# Roadmap: VSolveHub

## Overview

Nine phases from zero to a fully observable, production-hardened auto-dispatch marketplace. Phase 1 establishes the data foundation; Phases 2–4 wire the customer-facing path from discovery to booking; Phase 5 is the core product hypothesis (ranked-wave dispatch with server-side 30s timer); Phases 6–8 close the loop with the Captain app, notifications, and admin tools; Phase 9 locks down observability and security. Every v1 requirement maps to exactly one phase.

## Phases

- [ ] **Phase 1: Foundation & Data Models** — Django project, PostgreSQL schema, pgcrypto, audit tables
- [ ] **Phase 2: Authentication** — Server-side OTP, JWT RS256, reCAPTCHA, admin 2FA gates
- [ ] **Phase 3: Service Catalog & SEO** — ISR/SSG category pages, slug routing, JSON-LD, sitemap
- [ ] **Phase 4: Booking & Status Flow** — Booking form, OTP gate, VSH- reference, status timeline
- [ ] **Phase 5: Auto-Dispatch Engine** — Ranked worker pool, 30s Celery wave timer, first-accept-wins
- [ ] **Phase 6: Worker (Captain) App** — Registration, DigiLocker KYC, online toggle, job alerts, earnings
- [ ] **Phase 7: Notifications** — WhatsApp (WATI), SMS OTP (MSG91), FCM push, email (SendGrid)
- [ ] **Phase 8: Admin Dashboard** — Real-time WebSocket monitor, force-assign, KYC queue, catalog CRUD
- [ ] **Phase 9: Observability & Hardening** — Sentry, structured logging, security hardening, error recovery

## Phase Details

### Phase 1: Foundation & Data Models
**Goal**: Establish the full PostgreSQL schema with all columns needed for all seven archetypes (even though only A/B are wired), pgcrypto for Aadhaar/bank encryption, and the two append-only audit tables that every later phase writes to.
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, LOG-01, LOG-02
**Success Criteria** (what must be TRUE):
  1. `bookings` table exists with `archetype`, `phone_verified`, `amount`, `admin_viewed_at`, `is_spam`, `closed_at` columns
  2. Partial unique index on `job_assignments` prevents a worker holding two live offers simultaneously
  3. `cities` table exists and is linked to service areas
  4. `cancellations` table records status-at-cancel and penalty flag
  5. `booking_status_history` and `job_assignments` tables exist as append-only ledgers
  6. pgcrypto extension enabled; AES-256 encrypted columns exist on workers table
**Plans**: 2 plans

Plans:
- [x] 01-01: Django project scaffold, PostgreSQL + pgcrypto setup, base models (City, ServiceCategory, ServiceSubcategory, Worker, Booking with all Day-1 columns, Cancellation) — **planned** → `.planning/plans/01-01.md`
- [x] 01-02: Audit ledger tables (BookingStatusHistory, JobAssignment), DB constraints, partial unique index, seed cities data — **planned** → `.planning/plans/01-02.md`

---

### Phase 2: Authentication
**Goal**: Phone OTP verification (server-authoritative, never leaks raw OTP), JWT RS256 sessions, reCAPTCHA v3 gate on booking form submission, and admin panel 2FA/IP-allowlist configuration.
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, SEC-01, SEC-02, SEC-04
**Success Criteria** (what must be TRUE):
  1. Customer submits phone → server generates OTP, stores bcrypt-hashed in Redis with 5-min TTL, sends via MSG91
  2. OTP value is never present in any API response body
  3. A booking cannot be created until `phone_verified = TRUE` is set server-side
  4. Worker registration uses the same OTP mechanic as customer
  5. Authenticated endpoints issue JWT RS256 (15-min access / 30-day refresh)
  6. reCAPTCHA v3 score is evaluated before OTP is sent; low-score requests are rejected
  7. Admin panel 2FA config exists in settings (enforced in Phase 9 hardening)
**Plans**: 2 plans

Plans:
- [ ] 02-01: OTP generation, bcrypt-hash Redis storage (5-min TTL), MSG91 integration, reCAPTCHA v3 evaluation endpoint
- [ ] 02-02: JWT RS256 keypair, simplejwt config, customer + worker auth endpoints (request OTP, verify OTP, refresh token)

---

### Phase 3: Service Catalog & SEO
**Goal**: SEO-friendly service discovery via ISR/SSG Next.js pages with slug routing, JSON-LD structured data, ISR revalidation on admin catalog saves, and a sitemap that excludes empty city pages.
**Depends on**: Phase 1
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07, PERF-01, PERF-02, PERF-03, PERF-04, PERF-05
**Success Criteria** (what must be TRUE):
  1. All five service categories are browsable on web and customer app
  2. Public URLs use SEO slugs (e.g., `/warangal/electrician`) — no numeric IDs
  3. Category/detail pages render via ISR and revalidate within 5 minutes of an admin catalog change
  4. Each service detail page includes name, description, price range, service area, CTA, and JSON-LD Schema.org markup
  5. City landing pages exist for active city×service combos and are excluded from sitemap when no workers serve them
  6. Adding a new service category requires only a DB config change — zero code deployments
  7. Pages load under 2 seconds on 4G (Lighthouse)
**Plans**: 2 plans

Plans:
- [ ] 03-01: Service/category/city Django models, admin CRUD API, slug field (independently editable, set-on-create only), ISR revalidation webhook endpoint
- [ ] 03-02: Next.js ISR catalog pages (`generateStaticParams`, `revalidate`), slug routing, JSON-LD, city landing pages, sitemap.xml generator

---

### Phase 4: Booking & Status Flow
**Goal**: The customer booking path end-to-end — form under 2 minutes, OTP gate, `VSH-XXXX` reference, status timeline visible at all times, and cancellation recording.
**Depends on**: Phase 2
**Requirements**: BOOK-01, BOOK-02, BOOK-03, BOOK-04, BOOK-05, BOOK-06, BOOK-07, BOOK-08, BOOK-09, FLOW-01, FLOW-02, FLOW-04, FLOW-05, TRST-01
**Success Criteria** (what must be TRUE):
  1. Customer completes booking form in ≤ 7 fields (service, name, phone, address, date/time, notes) with Google Places autocomplete
  2. Booking is created only after server-verified OTP; `phone_verified = TRUE` is stored on the record
  3. A `VSH-XXXX` sequential reference is generated and shown on the confirmation screen (stored in sessionStorage)
  4. `archetype` column is set to `A` or `B` on every Phase 1 booking
  5. Booking status timeline (with timestamps per transition) is visible to the customer at all times
  6. Status polling interval is ≤ 30 seconds on the customer status page
  7. Every status transition is appended to `booking_status_history` — no silent overwrites
  8. Customer can cancel; cancellation is recorded in `cancellations` table with status-at-cancel and penalty flag
  9. Payment `amount` is recorded on the booking record (no gateway yet)
  10. Customer sees worker name, skill, and rating — worker phone number is never exposed
**Plans**: 2 plans

Plans:
- [ ] 04-01: Booking creation API (OTP gate, VSH- reference generation, archetype assignment, amount recording), booking form Next.js component with Places autocomplete
- [ ] 04-02: Booking status timeline API + polling endpoint, customer status page (Next.js CSR), cancellation endpoint + `cancellations` table writes

---

### Phase 5: Auto-Dispatch Engine
**Goal**: The core product mechanic — build eligible worker pool, rank by proximity/rating/idle-time, send 30-second Celery-timed waves, first-accept-wins, no-worker-found path, full audit trail.
**Depends on**: Phase 4
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04, DISP-05, DISP-06, DISP-07, DISP-08, DISP-09, FLOW-03, TRST-02
**Success Criteria** (what must be TRUE):
  1. When booking enters `SEARCHING`, dispatch builds pool filtered by `ACTIVE` + `is_online` + skill match + service area
  2. Workers are ranked: proximity → average rating → idle time (single annotated queryset, no N+1)
  3. 30-second offer timer is enforced by a Celery countdown task; client countdown is cosmetic only
  4. DB partial unique index prevents a worker holding two simultaneous live offers
  5. First worker to accept wins; all other pending offers for that booking are revoked server-side
  6. On no acceptances in wave, engine advances to next-ranked workers; continues until no eligible workers remain
  7. Booking moves to `NO_WORKER_FOUND` when all waves exhausted; customer is shown retry/schedule/notify options
  8. Worker sees service area only — full address is hidden until after acceptance
  9. Every offer event (sent/accepted/declined/expired) is written to `job_assignments` ledger
**Plans**: 3 plans

Plans:
- [ ] 05-01: Eligible worker pool query (skill match, area overlap, online/active filter), ranking annotation (proximity, avg_rating, idle_time), Django app `dispatch/`
- [ ] 05-02: Celery wave task (`send_offer_wave`), Redis `SETNX` offer lock, 30s countdown `expire_offer` task, accept/decline API endpoints with `select_for_update()` transaction
- [ ] 05-03: Dispatch state machine (SEARCHING → ASSIGNED / NO_WORKER_FOUND), multi-wave re-dispatch loop, offer revocation on acceptance, no-worker-found customer flow

---

### Phase 6: Worker (Captain) App
**Goal**: Complete worker-side journey — registration, DigiLocker Aadhaar KYC, admin approval gate, online/offline toggle, 30-second job alert, status update flow, and earnings dashboard.
**Depends on**: Phase 5
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, WORK-06, WORK-07, WORK-08, WORK-09, WORK-10, SEC-03, TRST-03, TRST-04
**Success Criteria** (what must be TRUE):
  1. Worker registers with name, phone, skill(s), and service area via Captain app
  2. DigiLocker Aadhaar OAuth verifies identity; name and last-4 digits auto-populated; full Aadhaar never stored in plaintext
  3. Aadhaar and bank account numbers are AES-256 encrypted at rest via pgcrypto
  4. Worker status must be `ACTIVE` (admin-approved post-KYC) before entering dispatch pool
  5. Worker can toggle ONLINE/OFFLINE; only ONLINE workers receive job offers
  6. 30-second FCM HIGH-priority job alert shows service type, area, and price — full address hidden
  7. Worker accepts or declines within 30 seconds; server treats no-response as decline
  8. Worker updates status through ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED
  9. Worker earnings (amount, reference, date) are recorded on COMPLETED and visible in Today/Week/Month/All-time dashboard
  10. Customer can see worker name, skill, and average rating after assignment
  11. Worker average rating is persisted and used as dispatch ranking signal
**Plans**: 3 plans

Plans:
- [ ] 06-01: Flutter Captain app — registration screens, phone OTP auth (reuses Phase 2 backend), profile setup (skills, service area), GoRouter deep-links
- [ ] 06-02: DigiLocker Aadhaar OAuth flow (Django webhook + Celery polling fallback), admin KYC verification queue, worker status (`PENDING_KYC` / `ACTIVE` / `SUSPENDED`)
- [ ] 06-03: Online/offline toggle API, job alert screen (30s accept/decline timer UI, cosmetic), status update flow, earnings dashboard (Flutter + Django aggregation), rating persistence

---

### Phase 7: Notifications
**Goal**: All notification channels wired and dispatched asynchronously via Celery — WhatsApp (WATI pre-approved templates), SMS OTP fallback (Fast2SMS), email (SendGrid), and FCM HIGH-priority Captain push.
**Depends on**: Phase 4
**Requirements**: NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05, NOTF-06, ERR-01
**Success Criteria** (what must be TRUE):
  1. WhatsApp notification sent at every major booking state change via WATI pre-approved template
  2. Every WhatsApp notification includes a click-to-chat support link
  3. SMS OTP is sent via MSG91 DLT-registered sender; Fast2SMS fallback triggers automatically within 10 seconds on MSG91 failure
  4. Email confirmation (SendGrid) is sent on booking creation
  5. FCM HIGH-priority push is sent to Captain for each job offer; standard priority for other worker updates
  6. All notification dispatches are async Celery tasks — they never block the booking or dispatch flow
**Plans**: 2 plans

Plans:
- [ ] 07-01: `notifications/` Django app, WATI WhatsApp template integration (all 6+ status-change templates), MSG91 OTP + Fast2SMS fallback, SendGrid email, Celery task fan-out
- [ ] 07-02: FCM HIGH-priority push (firebase-admin SDK), token lifecycle management (deactivate on `NotRegistered`), notification retry/backoff configuration

---

### Phase 8: Admin Dashboard
**Goal**: Real-time dispatch monitor (Django Channels WebSocket), exception force-assign, KYC verification queue, and service catalog CRUD — all behind the admin auth gate established in Phase 2.
**Depends on**: Phase 5
**Requirements**: ADMN-01, ADMN-02, ADMN-03, ADMN-04, ADMN-05, ADMN-06
**Success Criteria** (what must be TRUE):
  1. Admin can view all bookings in real time (status, reference, customer area, assigned worker) via WebSocket-powered dispatch monitor
  2. Admin can force-assign a specific worker to a booking as an exception (only manual dispatch path)
  3. Admin can view pending KYC submissions and approve or reject workers
  4. Admin can create, edit, and deactivate service categories/sub-categories; changes trigger ISR revalidation within 5 minutes
  5. Admin panel requires 2FA and is IP-allowlisted (config enforced from Phase 9 hardening)
  6. Admin can flag bookings with `viewed_at`, `is_spam`, `closed_at` — no separate leads table
**Plans**: 2 plans

Plans:
- [ ] 08-01: Django Channels WebSocket consumer for admin booking feed, real-time dispatch monitor Next.js page (admin route group), booking flag endpoints (`viewed_at`, `is_spam`, `closed_at`)
- [ ] 08-02: Worker KYC verification queue UI, force-assign endpoint, service catalog CRUD admin interface with ISR revalidation webhook trigger

---

### Phase 9: Observability & Hardening
**Goal**: Production-ready error visibility, structured logging, security hardening (2FA enforcement, IP allowlist, Sentry PII scrubbing), and resilience for Celery task loss and dispatch failures.
**Depends on**: Phase 8
**Requirements**: ERR-02, ERR-03, ERR-04, ERR-05, LOG-03, LOG-04, SEC-05, SEC-06, SEC-07
**Success Criteria** (what must be TRUE):
  1. When dispatch finds no eligible workers, booking moves to `NO_WORKER_FOUND` and customer is notified (WhatsApp + in-app options)
  2. Failed Celery tasks retry with exponential backoff; a beat scan recovers stuck `OFFER_SENT` bookings older than 60s
  3. All unhandled Django exceptions are reported to Sentry with booking/worker context; Aadhaar/phone fields are scrubbed before Sentry receives them
  4. API errors return structured JSON (`code` + `message`); 4xx responses never leak stack traces
  5. Structured JSON logs are emitted for OTP requests, booking creation, dispatch wave events, worker status changes, and notification sends
  6. Sentry is wired to both Django backend and Flutter apps
  7. Admin panel enforces 2FA and IP allowlist in production (env-gated)
  8. Worker phone number is masked in all worker-facing API responses before job acceptance
  9. All Django ORM queries use parameterised statements (no raw string interpolation)
**Plans**: 2 plans

Plans:
- [ ] 09-01: Sentry SDK (Django + Flutter), `before_send` PII scrubber, structured JSON logging (OTP/booking/dispatch/notification events), Celery beat recovery scan for stuck offers
- [ ] 09-02: Security hardening — admin 2FA enforcement (django-otp), IP allowlist middleware, worker phone masking in serializers, API error response standardisation, Celery exponential backoff config

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Data Models | 0/2 | Not started | - |
| 2. Authentication | 0/2 | Not started | - |
| 3. Service Catalog & SEO | 0/2 | Not started | - |
| 4. Booking & Status Flow | 0/2 | Not started | - |
| 5. Auto-Dispatch Engine | 0/3 | Not started | - |
| 6. Worker (Captain) App | 0/3 | Not started | - |
| 7. Notifications | 0/2 | Not started | - |
| 8. Admin Dashboard | 0/2 | Not started | - |
| 9. Observability & Hardening | 0/2 | Not started | - |
