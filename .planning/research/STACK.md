# Stack Research

**Domain:** Local-services marketplace — web + mobile + real-time dispatch (Indian Tier 2/3 cities)
**Researched:** 2026-06-22
**Confidence:** HIGH — stack is already locked in PRD constraints; this document captures the rationale and prescribes exact versions/packages

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 15 (App Router) | Customer-facing web frontend | ISR/SSG for SEO-critical service pages; SSR for dynamic; CSR for auth-gated flows — all three rendering modes in one framework |
| TypeScript | 5.x | Frontend type safety | Catches API shape mismatches at compile time; critical when frontend and DRF serializers must stay in sync |
| Django | 5.x | API backend | Mature ORM, admin panel, pgcrypto integration, Channels addon for WebSocket — covers all Phase 1 needs without glue code |
| Django REST Framework | 3.15+ | REST API layer | Standard serializer/view/router pattern; pairs with drf-spectacular for auto OpenAPI docs used by both web and Flutter |
| Django Channels | 4.x | WebSocket server | Admin live-monitor feed and 30s worker-offer countdown both need server-push; Channels adds ASGI WebSocket to Django without a separate process |
| Flutter | 3.x (stable) | Customer + Captain mobile apps | Single codebase for both apps; shares API client, state management, and most screens; reduces mobile dev effort by ~40% vs two native codebases |
| PostgreSQL | 16 | Primary relational database | Row-level security, pgcrypto AES-256 for Aadhaar/bank data, JSONB for flexible service metadata, PostGIS-ready if live GPS tracking added later |
| Redis | 7 | OTP store, Celery broker, channel layer | Sub-millisecond TTL-based OTP expiry; Celery uses it as broker for 30s offer timers; Django Channels uses it as channel layer for WebSocket fan-out |
| Celery | 5.x | Async task queue + server-side timers | 30s job-offer waves are Celery tasks with countdown; OTP SMS dispatch is async; keeps request cycle fast |

### Supporting Libraries — Backend

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| djangorestframework-simplejwt | 5.x | RS256 JWT access (15 min) + refresh (30 day) | Every authenticated API endpoint; RS256 so mobile apps can verify without the private key |
| django-celery-beat | 2.x | Celery periodic tasks (DB-backed schedule) | Scheduled bookings that trigger dispatch at a future time; no cron files needed |
| channels-redis | 4.x | Redis channel layer for Django Channels | Required to fan-out WebSocket messages to multiple Daphne workers |
| django-redis | 5.x | Redis as Django cache backend | OTP storage with TTL; rate-limit counters; token blacklist cache |
| psycopg2-binary | 2.9+ | PostgreSQL adapter | Required by Django ORM; binary build avoids libpq header setup on the VPS |
| drf-spectacular | 0.27+ | OpenAPI 3.1 schema generation | Generates API docs the Flutter client and Next.js fetchers are typed against; `--validate` in CI catches schema regressions |
| django-environ | 0.11+ | 12-factor env config | Reads `.env` for local, env vars in prod; avoids hardcoded secrets |
| sentry-sdk | latest | Error + performance monitoring | `integrations=[DjangoIntegration(), CeleryIntegration()]` — captures both web errors and background task failures |
| pgcrypto | PostgreSQL extension | AES-256 column encryption | `pgp_sym_encrypt` / `pgp_sym_decrypt` on Aadhaar and bank account columns; key managed via env var, not in DB |
| gunicorn | 21+ | WSGI server for Django HTTP | Sync workers for REST endpoints; run alongside Daphne for ASGI/WebSocket |
| daphne | 4.x | ASGI server for Django Channels | Handles WebSocket connections; sits behind Nginx with `upgrade` headers |

### Supporting Libraries — Frontend (Next.js)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | 3.x | Utility-first styling | All UI components; configured with custom brand tokens |
| TanStack Query | 5.x | Server state / API cache | Booking status polling, worker profile fetches — handles stale-while-revalidate without manual state |
| React Hook Form + Zod | RHF 7.x / Zod 3.x | Form state + runtime validation | Booking form (< 2 min UX target); OTP input; Zod schema doubles as TypeScript type source |
| jose | 5.x | JWT verification on the edge | Verify RS256 access tokens in Next.js middleware without a DB round-trip; blocks unauthenticated routes at the edge |
| next/image | built-in | Image optimization | Worker avatars, category banners — automatic WebP conversion and lazy load |
| @next/third-parties | built-in | GA4 + Google Maps | Official Next.js wrappers; avoids blocking the main thread |

### Supporting Libraries — Flutter

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dio | 5.x | HTTP client | All API calls; interceptors add JWT bearer header and handle 401→refresh automatically |
| flutter_riverpod | 2.x | State management | App-wide state (auth, active booking, online toggle); preferred over Provider for its compile-time safety |
| flutter_secure_storage | 9.x | JWT storage | Access + refresh tokens stored in Keychain (iOS) / EncryptedSharedPreferences (Android) |
| firebase_messaging | 14.x | FCM push notifications | 30s job alert for Captains; booking-state change alerts for customers |
| geolocator | 13.x | Location pings | Captain app sends last-known location on ONLINE toggle and periodically while online; not a live map |
| go_router | 13.x | Declarative routing | Deep links for notification taps (e.g., tap alert → open job offer screen) |
| intl | 0.19+ | Date/number formatting | Indian date formats, rupee symbol formatting |
| cached_network_image | 3.x | Image cache | Worker avatars, category images loaded from CDN |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker + Docker Compose | Local dev environment | One `compose.yml` starts Postgres, Redis, Celery worker, Daphne, Next.js dev server; eliminates "works on my machine" |
| Nginx | Reverse proxy | Routes `/api/` to Gunicorn, `/ws/` to Daphne, everything else to Next.js; handles SSL termination |
| celery-flower | 5.x | Celery task monitor | Visual dashboard for 30s offer timers during dev; not deployed to prod |
| drf-spectacular + Redoc | API docs | `GET /api/schema/redoc/` — living docs auto-generated from DRF serializers |
| black + ruff | Python formatter/linter | Enforced in pre-commit; ruff replaces flake8+isort+pyupgrade in one tool |
| eslint + prettier | JS/TS formatter/linter | Next.js default config + Tailwind plugin |
| flutter_lints | Dart linting | Official Flutter lint rules |

---

## Installation

### Backend

```bash
# Core
pip install django==5.0.* djangorestframework==3.15.* \
  channels==4.* channels-redis==4.* \
  celery==5.* django-celery-beat==2.* \
  djangorestframework-simplejwt==5.* \
  psycopg2-binary==2.9.* redis==5.* django-redis==5.*

# API docs + config + monitoring
pip install drf-spectacular==0.27.* django-environ==0.11.* \
  gunicorn==21.* daphne==4.* sentry-sdk==2.*

# Dev
pip install black ruff celery[flower]
```

### Frontend

```bash
# Next.js project (already bootstrapped)
npm install @tanstack/react-query zod react-hook-form \
  jose @hookform/resolvers

npm install -D tailwindcss postcss autoprefixer

# Third-party (GA4, Maps via @next/third-parties built into Next.js 14+)
```

### Flutter

```bash
# In pubspec.yaml dependencies:
# dio: ^5.0.0
# flutter_riverpod: ^2.0.0
# flutter_secure_storage: ^9.0.0
# firebase_messaging: ^14.0.0
# geolocator: ^13.0.0
# go_router: ^13.0.0
# intl: ^0.19.0
# cached_network_image: ^3.0.0
flutter pub get
```

---

## External Integrations

| Service | Purpose | Notes |
|---------|---------|-------|
| WATI | WhatsApp notifications | Template messages at every booking state change; click-to-chat links |
| MSG91 | SMS OTP | DLT-registered sender; use transactional route; fallback voice OTP for delivery failures |
| SendGrid | Email | Booking confirmation, worker onboarding; use dynamic templates |
| FCM (Firebase) | Mobile push | Job alerts (Captain), booking updates (Customer); high-priority messages for 30s offer |
| Google Maps API | Geocoding + distance | Address → lat/lng on booking submit; haversine distance for worker pool ranking |
| DigiLocker API | Aadhaar KYC | Captain registration flow; pull Aadhaar XML, verify name match, store encrypted |
| Sentry | Error + performance | Both Django and Next.js and Flutter; source maps for JS; `SENTRY_DSN` in env |
| reCAPTCHA v3 | Bot protection | Booking form submit + OTP request; score threshold 0.5 |
| GA4 | Web analytics | Page views, booking funnel events via `@next/third-parties` |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 15 App Router | Remix | Remix if team is strong on web fundamentals and wants simpler data loading; App Router chosen for ISR/SSG mix and existing codebase |
| Django + DRF | FastAPI | FastAPI if team is Python-async-native and you need sub-5ms API latency; Django chosen for ORM, admin panel, Channels, and pgcrypto integration |
| Flutter (single codebase) | React Native | React Native if team is JS-only; Flutter chosen for smoother animations on low-end Android (common in Tier 2/3) and better offline behavior |
| PostgreSQL | MySQL 8 | MySQL if existing hosting is MySQL-only; Postgres chosen for pgcrypto, JSONB, and PostGIS future-proofing |
| Celery + Redis | Django Q2 | Django Q2 for simpler single-process deployments; Celery chosen for reliable 30s countdown tasks and battle-tested retry logic |
| Redis 7 | Memcached | Memcached for pure cache; Redis chosen because it doubles as Celery broker and Channels layer — one less infra dependency |
| JWT RS256 | JWT HS256 | HS256 if all consumers are internal; RS256 chosen so Flutter apps can verify tokens with the public key only |
| WATI | Twilio WhatsApp | Twilio for global scale; WATI chosen for simpler Indian BSP onboarding and lower per-message cost for this volume |
| MSG91 | Twilio SMS | Twilio for global; MSG91 chosen for DLT compliance (mandatory in India for transactional SMS) and lower latency within India |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Django's built-in session auth | Stateful sessions don't work across Flutter apps and Next.js API routes | JWT RS256 via simplejwt |
| Client-side OTP verification | Phone number from browser is untrustworthy; a worker could spoof their number | Server-side OTP: generate, store in Redis with TTL, verify on server |
| Client-side 30s dispatch timer | Workers could game by freezing the timer; server is the single source of truth | Celery countdown task with Redis lock |
| Numeric IDs in public URLs | Zero SEO value; `/electrician-warangal` ranks, `/services/42` does not | Slug fields on all public-facing models |
| `application-layer` Aadhaar encryption | App-layer encryption means the plaintext exists in Python memory and logs | pgcrypto `pgp_sym_encrypt` — encrypt before it reaches the app layer |
| SQLite | Not safe for concurrent writes; no pgcrypto; no PostGIS | PostgreSQL 16 |
| `npm run start` in production | No process supervision; single thread | Gunicorn (Django) + `next start` behind Nginx; systemd unit files |
| Channels `InMemoryChannelLayer` | Not shareable across multiple Daphne workers; messages lost on restart | `channels-redis` with Redis 7 |
| GetX (Flutter state) | Overloaded, mixes routing/state/DI; harder to test | Riverpod 2 — compile-time safety, testable providers |

---

## Stack Patterns by Variant

**Public service/category pages (`/services/electrician-warangal`):**
- Use Next.js `generateStaticParams` + ISR (`revalidate: 3600`)
- Fetch from Django at build time; revalidate on demand when admin publishes changes
- Rationale: Google indexes static HTML; ISR keeps content fresh without full rebuilds

**Auth-gated pages (booking form, customer dashboard, captain job list):**
- Use Next.js client components with TanStack Query
- Verify JWT in middleware; redirect to OTP screen if missing/expired
- Rationale: No SEO value; CSR avoids flashing authenticated content to crawlers

**Real-time admin monitor + 30s worker offer countdown:**
- Django Channels consumer + `channels-redis` channel layer
- One WebSocket connection per admin session; one per active Captain
- Rationale: HTTP polling would add 1–2s latency to the 30s offer window

**Worker dispatch wave:**
1. Booking created → Celery task queued immediately
2. Task builds ranked worker pool (PostGIS distance or haversine from last-known location)
3. Sends offer to top N workers via FCM (high-priority) + Django Channels WebSocket
4. Redis `SETNX` lock per worker prevents double-offers
5. First accept wins → all others get `EXPIRED` signal → next wave if no accept in 30s

**OTP flow:**
1. Customer submits phone → server generates 6-digit OTP, stores `otp:{phone}` in Redis with 5-min TTL
2. MSG91 sends SMS (async Celery task)
3. Customer submits OTP → server reads from Redis, compares, deletes key on match
4. Server issues JWT; client stores in `flutter_secure_storage` or httpOnly cookie (web)

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Django 5.0 | channels 4.x | Channels 4 supports Django 4.2+ and 5.x |
| Django 5.0 | celery 5.x | Celery 5.3+ required for Django 5 compatibility |
| channels 4.x | channels-redis 4.x | Must match major versions; channels-redis 3.x drops ASGI support |
| Flutter 3.x | firebase_messaging 14.x | FCM v1 API; legacy FCM API deprecated June 2024 — use v1 |
| Next.js 15 | React 19 | Next.js 15 ships with React 19; do not pin React 18 |
| simplejwt 5.x | DRF 3.15 | Fully compatible; `SIMPLE_JWT` settings block unchanged |
| psycopg2-binary 2.9 | PostgreSQL 16 | Compatible; psycopg3 (`psycopg`) is the future but psycopg2-binary is stable for Phase 1 |

---

## Security Notes

| Concern | Implementation |
|---------|---------------|
| Aadhaar / bank number at rest | `pgcrypto` `pgp_sym_encrypt(value, $KEY)` — key from env var, never in DB |
| Admin panel access | Django admin behind `/staff-only/` path; production: IP allowlist + 2FA (django-otp) |
| OTP brute-force | Rate-limit OTP verify to 5 attempts per phone per 10 min (Redis counter) |
| JWT leakage on web | Access token in memory (not localStorage); refresh token in httpOnly Secure SameSite=Strict cookie |
| Captain phone privacy | Never exposed to customer via API; DRF serializer field explicitly excluded |
| Customer address privacy | Booking serializer returns address only when `booking.worker == request.user` (i.e., the assigned captain) |

---

## Sources

- PROJECT.md constraints section — authoritative stack decisions locked by the team
- PRD/conventions.md — decision log (D-20 admin pivot, dispatch mechanics)
- Django Channels docs — ASGI + Redis channel layer setup
- Flutter pub.dev — package compatibility matrix
- MSG91 docs — DLT compliance requirements for Indian transactional SMS

---

*Stack research for: VSolve (VSolveHub) — local-services marketplace*
*Researched: 2026-06-22*
