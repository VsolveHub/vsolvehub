# VSolve

## What This Is

VSolve (VSolveHub) is a local-services marketplace for Tier 2/3 Indian cities — built for customers like Priya in Warangal who need a verified electrician at 2am, and workers like Raju in Karimnagar who need steady jobs without a middleman's cut. It digitises service discovery, booking, dispatch, and tracking in one platform, replacing WhatsApp chaos and missed calls.

## Core Value

A customer can find and book any verified local service 24×7 and a worker gets assigned a job automatically — no middlemen, no manual ops in the critical path.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Phase 1 — Auto-Dispatch Core (Archetypes A & B)**

- [ ] Browse service categories on web + customer app (Home Services, Construction, Beauty & Wellness, Vehicle Services, Manpower/Event labour)
- [ ] Service detail page + booking form (< 2 minutes to complete)
- [ ] OTP phone verification gate — booking only after server-verified OTP
- [ ] Booking created with `VSH-` reference and status timeline visible to customer
- [ ] Push-Dispatch engine: build worker pool (active + online + skill-matched + in-area), rank by proximity/rating/idle-time, offer in 30-second server-side waves, first accept wins
- [ ] Captain (worker) app: registration, Aadhaar KYC via DigiLocker, verification gate, ONLINE toggle, 30s job alert with accept/decline, job status updates, earnings record
- [ ] Worker sees full customer address only after accepting
- [ ] A worker holds at most one live job offer at a time
- [ ] WhatsApp notifications + click-to-chat at every booking state change
- [ ] SMS OTP (MSG91), Email (SendGrid), Push (FCM) notifications
- [ ] Admin dashboard: monitor all leads live, verify new workers, force-assign on exception only (no manual per-booking assignment in normal flow)
- [ ] SEO-friendly slugs in all public URLs (not numeric IDs)
- [ ] Record money from day one (amounts, earnings) even though payment gateway is Phase 3

**Phase 1 — Status flows to implement**

- [ ] Archetype A/B: `SEARCHING → ASSIGNED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED`
- [ ] No-worker-found path: customer can retry, schedule, or get notified

### Out of Scope

**Phase 1 exclusions (all deferred to Phase 2+):**
- Inbox-Pull archetypes (C, D, E, F) — staffing placement, rental inventory, property listings, event quotes — different lead mechanic; designed forward-compatible in data but not wired
- Job Board (Archetype G) — no dispatch, no booking; own listing → apply → hire flow
- Partner web portal (`partner.vsolvehub.com`) and non-Captain provider modes (Professional, Rental Vendor, Property Host, Event Vendor, Employer)
- Wallet & referral, membership plans — Phase 2
- Payment gateway (Razorpay/PhonePe) and worker auto-disbursements — Phase 3; amounts are recorded now
- Multi-language content (Telugu/Hindi text entry) — Phase 3; design supports it
- Worker real-time GPS map tracking — proximity matching uses last-known location pings, not a live map
- Live auto-booking (ride-hailing / auto-rickshaw) — requires GPS metering, deferred
- B2B bulk contracts, franchise/partner onboarding portal
- In-platform video calling
- Advanced search, wallet UI, admin analytics, re-booking, push notification campaigns — Phase 2

## Context

- **Market:** Tier 2/3 Indian cities (initial focus: Telangana — Warangal, Karimnagar, Hyderabad)
- **Existing PRD:** Full PRD lives in `PRD/` — `overview.md`, `base.md`, `conventions.md`, `features.md`, `user_stories.md`, `service_catalog.md`, per-app specs, and a changelog. These are the authoritative source for detailed specs.
- **Existing code:** Next.js 15 frontend exists in `VSolveHub/`; Flutter customer app skeleton in `apps/customer_app/`; backend (`qsh-backend`) is a separate repo.
- **Booking archetype system:** Seven archetypes (A–G) govern everything downstream — booking flow, status vocabulary, dispatch mechanic, and provider type. Phase 1 ships only A (Instant/Scheduled Push) and B (Crew Push). Data schema is designed to accommodate all seven from day one.
- **Admin is a monitor, not a dispatcher:** Auto-dispatch runs without admin involvement. Admin steps in only for disputes or "no worker found" exceptions. This was an explicit pivot (see conventions.md D-20).
- **Lead = Booking:** There is no separate "leads" table. Admin flags (new/viewed/spam/closed) are columns on the booking record, not a parallel state machine.

## Constraints

- **Tech stack:** Next.js 15 (App Router) + TypeScript frontend; Django 5 + DRF backend; Flutter 3 mobile apps; PostgreSQL 16; Redis 7 (OTP, 30s timers, Celery broker); Celery for async tasks and server-side job-offer timers
- **Auth:** OTP-only (no password); server decides — never trust a phone number from the browser; JWT RS256 (15-min access / 30-day refresh)
- **30s timer:** Lives on the server (Celery + Redis). The countdown the worker sees on-screen is cosmetic only.
- **Privacy:** Customer sees worker name + skill + rating (not phone number); worker gets full address only after accepting
- **Security:** Aadhaar and bank account numbers encrypted at rest (AES-256 via pgcrypto); 2FA + IP allowlist for admin panel in production
- **SEO:** ISR/SSG for all public service/category pages; SSR for dynamic pages; CSR for auth-gated booking/profile flows
- **Scalability:** Adding a new service category must require config change only — zero code changes
- **Integrations:** WhatsApp (WATI), SMS OTP (MSG91 + DLT registered), FCM, Google Maps, SendGrid, Sentry, reCAPTCHA v3, GA4
- **Hosting:** VPS (AWS/DigitalOcean), Nginx, Gunicorn; Django Channels for real-time WebSocket (admin monitor + 30s offer)
- **Timeline:** Phase 1 target — Months 1–3; 200 bookings, 100 verified captains

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auto-dispatch instead of manual admin assignment | Admin can't scale to 100+ leads/day; removes the human bottleneck from the critical booking path | — Pending |
| Seven booking archetypes (A–G) as the core abstraction | Services aren't all booked the same way; one data model with archetype flag drives flow, status vocab, and provider type — avoids N separate systems | — Pending |
| Phase 1 ships only A & B (Push-Dispatch) | Simplest mechanic to build and validate; represents highest-demand categories (Home, Construction, Beauty, Vehicle) | — Pending |
| One lead = one booking record (no separate leads table) | Admin "lead management" flags are columns on the booking, not a parallel entity — prevents dual-write bugs and simplifies queries | — Pending |
| 30s offer timer is server-side (Celery + Redis), not client-side | The client countdown is cosmetic; server is the arbiter — prevents workers from gaming the timer | — Pending |
| Worker sees address only after accepting | Privacy requirement; prevents cherry-picking jobs by location before committing | — Pending |
| Record payment amounts from day one, gateway in Phase 3 | Avoids financial blind spots when gateway goes live; also satisfies business tracking needs immediately | — Pending |
| SEO slugs everywhere (not numeric IDs in URLs) | Service pages need to rank on Google; numeric IDs give no SEO signal | — Pending |
| Flutter for both customer and worker apps (single codebase) | Reduces mobile dev effort; both apps share most screens and API clients | — Pending |
| PostgreSQL with pgcrypto for Aadhaar encryption | Compliance requirement; AES-256 at the DB layer is simpler than application-layer encryption for this scale | — Pending |

---
*Last updated: 2026-06-22 — initial PROJECT.md created from PRD and product description*
