# Project Research Summary

**Project:** VSolveHub — Local-Services Marketplace
**Domain:** On-demand home services, auto-dispatch engine, Tier 2/3 India
**Researched:** 2026-06-22
**Confidence:** HIGH — derived from locked PRD constraints, decision log (D-01–D-27), and official library documentation

---

## Executive Summary

VSolveHub is an on-demand local-services marketplace targeting Tier 2/3 Indian cities (starting Warangal, Karimnagar), built around a server-authoritative push-dispatch engine. The core mechanic — a 30-second server-side job-offer timer, ranked worker pools, and automatic re-dispatch waves — is what differentiates this from aggregator platforms like Sulekha that rely on workers calling customers back. Everything in the architecture is optimised to protect this mechanic: server-side timers prevent gaming, pgcrypto encryption satisfies compliance, and WhatsApp-native notifications meet the market where it already communicates.

The recommended stack (Next.js 15 + Django 5 + Flutter 3 + PostgreSQL 16 + Redis 7 + Celery 5) is already locked by the PRD and is the right call. Django Channels handles the real-time admin monitor without a separate process; Celery countdown tasks own the 30-second dispatch windows; Flutter single-codebase covers both Customer and Captain apps at ~40% reduced mobile effort. No alternative in any category improves on this combination for Phase 1 constraints.

The two highest risks to a successful launch are both operational, not technical: DLT registration for SMS OTP in India takes 2–6 weeks and must start on Day 1 of Phase 1, and WhatsApp template pre-approval with Meta takes 1–7 days per template and must be submitted before any notification code is written. Both are launch blockers if deferred to "before go-live."

---

## Key Findings

### Recommended Stack

See full details in [STACK.md](STACK.md).

Django 5 + DRF was chosen over FastAPI because Django ORM, Django Admin, Django Channels, and pgcrypto integration all come as a bundle — FastAPI would require assembling that same functionality from separate libraries with no benefit at Phase 1 scale (target: 0–200 bookings/day on a single 2 vCPU VPS). Next.js 15 App Router provides ISR/SSG for SEO-critical service catalog pages, SSR for dynamic pages, and CSR for auth-gated flows — all three rendering modes in one framework without a second server. Flutter's single codebase for Customer + Captain apps is the correct tradeoff: smoother animations on low-end Android (common in Tier 2/3) and better offline behaviour than React Native.

**Core technologies:**
- **Next.js 15 (App Router):** Customer web frontend — ISR/SSG for catalog SEO, CSR for booking/auth flows
- **Django 5 + DRF 3.15 + Django Channels 4:** REST API, business logic, WebSocket for admin monitor and Captain job alerts
- **Flutter 3 (stable):** Customer app + Captain app — single codebase, Riverpod state, GoRouter deep-links, FCM push
- **PostgreSQL 16 + pgcrypto:** Primary data store — AES-256 column encryption for Aadhaar/bank data, JSONB for flexible service metadata
- **Redis 7:** OTP cache (5-min TTL), Celery broker, Django Channels layer — three roles, one dependency
- **Celery 5 + django-celery-beat:** 30-second offer-timer countdown tasks, async notification dispatch, scheduled bookings
- **simplejwt RS256:** JWT access (15 min) + refresh (30 day) — RS256 so Flutter apps verify with public key only
- **WATI + MSG91 + FCM + SendGrid:** WhatsApp, SMS OTP, mobile push, email — Indian-market-optimised choices

### Expected Features

See full details in [FEATURES.md](FEATURES.md).

**Must have — Phase 1 launch (P1):**
- Service category browsing (ISR/SSG; 8 top-level categories)
- Booking form under 2 minutes (7 fields max, reCAPTCHA v3)
- OTP phone verification — server-authoritative; MSG91 + fallback
- Booking confirmation with `VSH-XXXX` human-readable reference
- Booking status tracking (30-second polling, Phase 1)
- WhatsApp notifications via WATI at every status milestone
- Auto-dispatch engine — ranked waves, 30s server-side timer, first-accept-wins
- Worker verification gate — DigiLocker Aadhaar KYC + admin approval
- 30-second job alert with server-side Celery timer for Captains
- Worker job status updates (ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED)
- Admin dispatch monitor — read-only + exception force-assign only
- FCM push notifications — HIGH priority for Captain job offers
- Worker earnings dashboard — amounts recorded from Day 1 (no gateway yet)
- Admin service catalog CRUD — config-driven; no deploy needed to add a service

**Should have — Phase 1 release cycle / Phase 2 (P2):**
- Rating & review (needed before worker pool grows large enough for ranking to matter)
- Google Maps / Places autocomplete (improves address quality for dispatch proximity)
- Customer profile & history (add when repeat-booking rate > 20%)
- City SEO landing pages `/warangal/electrician` (high organic growth potential)
- Advanced search, gallery, FAQ

**Defer — Phase 2+ (P3):**
- Payment gateway (Razorpay/PhonePe) — amounts recorded now; gateway after dispatch validated
- Multi-language Telugu/Hindi — design for i18n from Day 1; ship content in Phase 3
- Real-time GPS worker map — validate dispatch mechanic first
- Wallet, referral, membership plans, admin analytics dashboard
- Inbox-Pull archetypes C–F (staffing, rental, property, events)

**Anti-features to avoid:**
- Manual admin assignment as the normal flow (doesn't scale past ~50 bookings/day)
- Client-side 30-second offer timer (workers can game it; clock skew causes disputes)
- Worker phone number visible to customer (enables off-platform work)
- Separate "leads" table (dual-write bugs; admin flags on `Booking` is correct, per D-01)
- Payment gateway at launch (delays by 4–6 weeks before dispatch is validated)

### Architecture Approach

See full details in [ARCHITECTURE.md](ARCHITECTURE.md).

Three-tier architecture: client tier (Next.js web + Flutter Customer + Flutter Captain), API tier (Django + DRF + Channels behind Nginx, Gunicorn for HTTP + Daphne for WebSocket), data/async tier (PostgreSQL primary, Celery workers, Redis). All external services (MSG91, WATI, FCM, DigiLocker, Google Maps, Sentry) are reached via Celery async tasks, never in the request cycle. Phase 1 target is a single 2 vCPU / 4 GB VPS — all components co-hosted. The first scaling bottleneck is the Celery dispatch queue; the second is PostgreSQL connection exhaustion (fix with PgBouncer in transaction-pooling mode).

**Major components:**
1. **`dispatch/` Django app** — push-dispatch engine, Celery wave tasks, Redis offer locks; isolated from `bookings/` which owns the data model
2. **`bookings/` Django app** — `Booking` model with `archetype` column (A–G), single-table design; `BookingStatusLog` for timeline; enforced state machine transitions
3. **`workers/` Django app** — Captain profiles, DigiLocker KYC, online/offline toggle, location pings with `location_updated_at` staleness guard
4. **`notifications/` Django app** — fan-out hub for WhatsApp/SMS/FCM/email, all dispatched as Celery tasks
5. **`admin_portal/` Django app** — Django Channels consumers for real-time admin WebSocket feed
6. **Next.js route groups** — `(public)` ISR/SSG catalog, `(customer)` CSR booking/auth, `(admin)` IP-allowlisted
7. **Flutter feature layers** — each feature has `data/` → `domain/` → `presentation/`; domain layer is pure Dart with zero Flutter imports

### Critical Pitfalls

See full details in [PITFALLS.md](PITFALLS.md).

1. **Dispatch race condition** — Two workers accepting the same offer simultaneously. Fix: `select_for_update()` inside a transaction + atomic `UPDATE ... WHERE status='PENDING'`; Redis `SETNX` lock as second guard. Never check-then-update in two round-trips.

2. **DLT registration blocks OTP at launch** — India requires TRAI DLT registration for transactional SMS. Takes 2–6 weeks. Must start Day 1 of Phase 1, not "before go-live."

3. **WhatsApp template approval delay** — Meta pre-approves all outbound templates; 1–7 days per template, can be rejected. Submit all 6+ templates in Week 1. Build code against template IDs, not hard-coded body text.

4. **Client-side OTP trust** — Booking endpoint must never accept a phone number from the request body. OTP verification issues a signed token embedding the verified phone server-side; booking creation reads the phone from that token only.

5. **Celery task loss on Redis restart** — Enable Redis AOF persistence (`appendonly yes`). Add a Celery beat periodic task to scan for stuck `OFFER_SENT` bookings older than 60 seconds and re-trigger expiry.

6. **JWT refresh token in localStorage** — Store refresh tokens in `HttpOnly; Secure; SameSite=Strict` cookies only. Access tokens (15 min) live in memory. Never `localStorage.setItem('refresh_token', ...)`.

7. **N+1 queries in worker pool ranking** — The entire dispatch candidate query, scoring, and sorting must be a single annotated queryset (`annotate(avg_rating=Avg(...))`). Verify with Django Debug Toolbar: zero queries inside the dispatch loop.

8. **Aadhaar/PII in Sentry error context** — Add a `before_send` hook that scrubs phone, Aadhaar, and bank fields before any event reaches Sentry. DPDP Act 2023 compliance.

9. **SEO slug collision on rename** — Never auto-regenerate slugs on name change. Store slug as an independently editable field that defaults on creation only. Add a redirect table for old slugs → 301.

10. **FCM push token staleness** — On every FCM send, inspect the response for `messaging/registration-token-not-registered` and immediately deactivate that token. Re-register on every cold start.

---

## Implications for Roadmap

### Phase 1: Dispatch Core — Validate the Mechanic

**Rationale:** The auto-dispatch engine (30s timer, ranked pool, first-accept-wins) is the entire product hypothesis. Nothing in Phase 2 or Phase 3 makes sense if Phase 1 dispatch doesn't work reliably. Everything in Phase 1 is the minimum needed to run one real booking end-to-end.

**Delivers:** Working booking flow from discovery → OTP → dispatch → Captain accept → status updates → completion; admin monitor with read-only view + exception force-assign.

**Addresses (from FEATURES.md):** F-001 through F-011, F-015, F-016, F-017 (all P1 features)

**Avoids (from PITFALLS.md):** Dispatch race condition, client-side OTP trust, Celery task loss, JWT token storage, N+1 dispatch queries, phone normalization

**Parallel non-code work (must start Week 1):**
- DLT entity + sender header + OTP template registration with MSG91
- WhatsApp template submission to Meta via WATI (all 6+ status-change templates)
- DigiLocker API partner registration for sandbox access

### Phase 2: Trust & Retention

**Rationale:** Once dispatch is validated (target: 50+ successful bookings), add the features that turn a first-time user into a repeat customer and a hesitant Captain into a loyal one. Rating/review feeds back into dispatch ranking quality.

**Delivers:** Rating & review system (feeds dispatch ranking), customer profile & history, city SEO landing pages, Google Maps / Places autocomplete for address quality, advanced search.

**Uses (from STACK.md):** PostGIS-ready PostgreSQL for `ST_DWithin` proximity queries once location density grows; ISR on-demand revalidation webhook for city pages

**Implements (from ARCHITECTURE.md):** On-demand ISR revalidation webhook from Django → Next.js `revalidatePath()`; sitemap exclusion for cities with no active workers (D-09)

### Phase 3: Scale & Monetise

**Rationale:** Payment gateway, multi-language content, analytics, and advanced archetypes all require validated GMV and user volumes to justify their complexity and compliance overhead.

**Delivers:** Payment gateway (Razorpay/PhonePe), Telugu/Hindi UI content, admin analytics dashboard, wallet & referral system, inbox-pull archetypes C–F (staffing, rental, property, events).

**Uses (from STACK.md):** `next-intl` for i18n (designed for from Day 1, shipped in Phase 3); Razorpay/PhonePe SDK; ElasticSearch if catalog queries are a bottleneck at 5k+ bookings/day

### Phase Ordering Rationale

- **Dispatch before retention:** Worker supply and customer trust both depend on reliable dispatch. A broken dispatch engine with a great rating system is still a broken product.
- **DLT/WhatsApp registration before code:** These are the only launch blockers outside of code. They gate OTP auth and the entire notification system. They are sequenced as parallel Week-1 work in Phase 1, not afterthoughts.
- **Payment in Phase 3:** Razorpay/PhonePe integration, UPI failure handling, refund flows, RBI compliance, and settlement logic add 4–6 weeks before dispatch is even proven. `job_earnings` amounts are recorded from Day 1 (D-08); the gateway is a Phase 3 addition.
- **Archetype schema from Day 1, wiring incremental:** `bookings.archetype` column and schema for C–F must be in the DB from Phase 1 even though only A (on-demand dispatch) and B (scheduled dispatch) are wired. Retrofitting the schema later is expensive (D-27).
- **i18n designed in, shipped later:** String keys and RTL-safe layouts from Day 1; actual Telugu/Hindi translation content deferred to Phase 3 when it becomes the growth bottleneck (D-24 equivalent).

### Research Flags

Phases likely needing closer attention during implementation planning:

- **DigiLocker KYC flow (Phase 1):** Async webhook + polling fallback is non-obvious. Sandbox access requires DigiLocker partner registration. Build webhook idempotency and the Celery beat recovery scan before connecting to production API.
- **Django Channels WebSocket + Celery fan-out (Phase 1):** The `channels-redis` channel layer must be verified to fan-out correctly across multiple Daphne workers. Test with two Daphne processes before deploying.
- **City SEO landing pages vs. thin-page penalty (Phase 2):** A city page with no active workers harms SEO. The sitemap exclusion logic (D-09) must be implemented and verified before Phase 2 pages go live.
- **FCM HIGH-priority wake on locked Android (Phase 1):** Background delivery on Tier 2/3 Android devices (MIUI, ColorOS, low-RAM) is not guaranteed. Test on physical low-end devices (2GB RAM, Android 10+), not emulators.

Phases with standard patterns (research already sufficient):

- **Celery + Redis broker setup:** Well-documented; AOF persistence and separate queues (`dispatch`, `notifications`, `reports`) are straightforward config.
- **Next.js ISR catalog pages:** `generateStaticParams` + `revalidate = 3600` is a standard pattern; no surprises expected.
- **Flutter Riverpod + GoRouter + Dio auth interceptor:** All three are well-documented and the pattern (interceptor catches 401, calls refresh, retries original request) is canonical.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Locked by PRD; all package versions verified for compatibility |
| Features | HIGH | Derived directly from PRD v1.4 + decisions D-01–D-27; MVP scope is clear |
| Architecture | HIGH | Standard Django + Celery + Channels patterns; Phase 1 scale is modest |
| Pitfalls | HIGH | All pitfalls are well-documented failure modes with known fixes; Indian-market-specific pitfalls (DLT, DigiLocker) drawn from real regulatory requirements |

**Overall confidence:** HIGH

### Gaps to Address

- **DigiLocker sandbox credentials:** Partner registration required before any KYC code can be tested end-to-end. Unblock in Week 1 of Phase 1.
- **WATI template rejection risk:** Meta can reject templates for policy reasons without clear explanation. Have SMS fallback text for every WhatsApp notification from day one; never treat WhatsApp as the only channel.
- **Low-end Android FCM reliability:** Cannot be verified in emulator. Reserve a physical test device (2GB RAM, MIUI or ColorOS) for Phase 1 Captain app testing.
- **DLT approval timeline uncertainty:** Buffer 3–4 weeks from submission to approval. If delayed, use WhatsApp OTP (WATI) as the interim delivery path.

---

## Sources

### Primary (HIGH confidence)
- `PRD/features.md`, `PRD/conventions.md` (D-01–D-27), `PRD/overview.md`, `PRD/data_models.md` — authoritative; all decisions locked
- Django Channels docs — ASGI + Redis channel layer setup
- Celery docs — `apply_async`, `select_for_update`, task acknowledgement patterns
- Flutter pub.dev — package compatibility matrix (firebase_messaging 14.x FCM v1 API)
- MSG91 docs — DLT compliance requirements for transactional SMS in India

### Secondary (MEDIUM confidence)
- WATI documentation — WhatsApp Business API template approval process and timelines
- DigiLocker API partner documentation — OAuth flow, XML response format, webhook delivery
- Firebase documentation — FCM token lifecycle, `NotRegistered` error handling

### Tertiary (field knowledge, validated)
- Urban Company, Sulekha, Rapido — competitive feature benchmarks
- TRAI DLT registration guidelines 2018 — registration timelines based on reported industry experience
- DPDP Act 2023 — PII handling requirements for Aadhaar data

---

*Research completed: 2026-06-22*
*Ready for roadmap: yes*
