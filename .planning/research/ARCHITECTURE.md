# Architecture Research

**Domain:** Local-services marketplace — multi-client (web + mobile), auto-dispatch engine, real-time notifications
**Researched:** 2026-06-22
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT TIER                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Next.js 15  │  │ Flutter App  │  │ Flutter App  │              │
│  │  (Web/SEO)   │  │  (Customer)  │  │  (Captain)   │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼─────────────────┼─────────────────┼────────────────────┘
          │  HTTPS/REST      │  HTTPS/REST      │  HTTPS/REST + WS
┌─────────┼─────────────────┼─────────────────┼────────────────────┐
│                       API TIER                                      │
│  ┌──────▼─────────────────▼─────────────────▼───────┐             │
│  │              Django 5 + DRF                        │             │
│  │   (Gunicorn + Nginx; Django Channels for WS)       │             │
│  └──────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
          │ ORM queries         │ Publish jobs        │ Cache
┌─────────┼─────────────────────┼─────────────────────┼────────────┐
│                      DATA + ASYNC TIER                              │
│  ┌──────▼──────┐  ┌───────────▼───────┐  ┌──────────▼──────┐    │
│  │ PostgreSQL  │  │  Celery Workers   │  │   Redis 7        │    │
│  │     16      │  │  (dispatch timer, │  │  (OTP cache,     │    │
│  │ (pgcrypto)  │  │   notifications)  │  │   30s timers,    │    │
│  └─────────────┘  └───────────────────┘  │   Celery broker) │    │
│                                           └──────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
          │
┌─────────┼────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                                 │
│  MSG91 (OTP) │ WATI (WhatsApp) │ FCM (push) │ SendGrid (email)   │
│  Google Maps │ DigiLocker (KYC)│ Sentry     │ GA4 │ reCAPTCHA    │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Next.js 15 | Public browsing, SEO, booking form (web) | App Router, ISR/SSG for catalog, SSR for dynamic pages, CSR for auth flows |
| Django 5 + DRF | REST API, business logic, auth, dispatch orchestration | Gunicorn + Nginx; Channels for WebSocket |
| Flutter Customer App | Service discovery, booking, status tracking, OTP auth | Riverpod + GoRouter + Dio/Retrofit |
| Flutter Captain App | Job alerts, accept/decline, status updates, KYC | Same stack as customer app; different feature set |
| Celery | 30s offer-timer countdown, notification dispatch, async tasks | Redis as broker; beat for scheduled tasks |
| Redis 7 | OTP store (5-min TTL), 30s timer state, Celery broker | Ephemeral; no data loss risk if flushed |
| PostgreSQL 16 | All persistent data; pgcrypto for Aadhaar/bank encryption | Single primary; AES-256 column encryption |

## Recommended Project Structure

### Backend (Django 5 — `qsh-backend/`)

```
qsh-backend/
├── config/                  # settings, urls, wsgi, asgi
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   └── production.py
│   ├── urls.py
│   └── asgi.py              # Channels entrypoint
├── apps/
│   ├── accounts/            # User, OTP, JWT auth
│   ├── catalog/             # ServiceCategory, ServiceSubCategory, Service
│   ├── bookings/            # Booking, BookingStatusLog (core models)
│   ├── dispatch/            # Push-dispatch engine, Celery tasks, offer timers
│   ├── workers/             # Captain profiles, KYC, availability, location pings
│   ├── notifications/       # WhatsApp/SMS/FCM/email dispatch
│   └── admin_portal/        # Django Channels consumers, admin views
├── common/
│   ├── encryption.py        # pgcrypto wrappers for Aadhaar/bank fields
│   ├── pagination.py
│   └── permissions.py
└── celery.py
```

### Web Frontend (Next.js 15 — `VSolveHub/`)

```
VSolveHub/
├── app/
│   ├── (public)/            # ISR/SSG — service catalog, category pages
│   │   ├── services/[category-slug]/[service-slug]/
│   │   └── page.tsx         # Homepage
│   ├── (customer)/          # CSR — auth-gated booking/profile flows
│   │   ├── booking/
│   │   ├── profile/
│   │   └── track/[ref]/
│   ├── (admin)/             # Admin dashboard (IP-allowlisted)
│   └── api/                 # Route handlers (proxy to Django or BFF)
├── components/
│   ├── customer/            # Feature-scoped UI (booking, home, services, profile)
│   ├── shared/              # AppShell, Header, Footer
│   └── ui/                  # Primitive atoms (Button, Input, Badge)
├── lib/
│   ├── api/                 # Typed fetch wrappers for Django endpoints
│   ├── catalog/             # Service catalog data fetching
│   ├── bookings/            # Booking query helpers
│   ├── auth/                # Session management
│   └── validation/          # Zod schemas for form inputs
└── public/
```

### Customer App (Flutter 3 — `apps/customer_app/`)

```
lib/
├── main.dart
├── app.dart
├── core/
│   ├── constants/           # API URLs, timeouts
│   ├── network/             # ApiClient (Dio), AuthInterceptor, RetryInterceptor
│   ├── router/              # GoRouter with auth-redirect guards
│   ├── theme/               # Colors, spacing, text styles
│   └── widgets/             # Shared atoms (AppButton, ErrorView, SkeletonCard)
└── features/
    ├── auth/
    │   ├── data/            # AuthApi (Retrofit), AuthRepository, mock
    │   ├── domain/          # UserModel, PhoneValidator, OTPResponse
    │   └── presentation/    # Screens (Login, OTP, Splash), Riverpod providers
    ├── home/                # Category grid, search
    ├── services/            # Service detail, booking form
    ├── bookings/            # Booking list, status timeline
    ├── tracking/            # Live status, messages
    └── profile/             # Profile, addresses
```

### Structure Rationale

- **Feature-first in Flutter:** Each feature owns its data/domain/presentation layers; cross-feature dependencies go through core only — makes it safe to hand features to different developers.
- **Route groups in Next.js:** `(public)` gets ISR/SSG (SEO critical); `(customer)` gets CSR (no SEO needed, auth-gated); `(admin)` stays behind IP allowlist. The group naming makes rendering strategy explicit at a glance.
- **`dispatch/` as its own Django app:** The push-dispatch engine is the most complex piece of business logic; isolating it prevents it from bleeding into `bookings/`. The `bookings/` app owns the data model; `dispatch/` owns the algorithm that operates on it.
- **`common/encryption.py`:** Centralises the pgcrypto column wrappers so Aadhaar encryption is never duplicated or accidentally skipped.

## Architectural Patterns

### Pattern 1: Archetype-Driven Booking Model

**What:** A single `Booking` table with an `archetype` column (A–G) drives the booking flow, status vocabulary, and dispatch mechanic. No separate table per service type.

**When to use:** Always — every booking goes through this model. New service types get a new archetype value, not a new table.

**Trade-offs:** One complex model vs. seven simpler ones. Worth it because shared infrastructure (status logs, payments, notifications) only has to be built once.

**Example:**
```python
class Booking(models.Model):
    archetype = models.CharField(max_length=1, choices=ArchetypeChoices)
    status = models.CharField(max_length=32)  # vocab differs per archetype
    archetype_details = models.JSONField(default=dict)  # archetype-specific fields
    booking_ref = models.CharField(unique=True)  # VSH- prefix
```

### Pattern 2: Server-Side Offer Timer (Celery + Redis)

**What:** When a booking enters `SEARCHING`, Celery creates a chain of 30-second offer tasks. Each task picks the next worker in the ranked pool, writes the offer to Redis, and sends a push notification. A follow-up task fires after 30s to handle non-response. The client countdown is cosmetic.

**When to use:** Every Archetype A/B booking that enters the dispatch queue.

**Trade-offs:** More complex than a client-side timer but prevents workers from gaming the timer or accepting stale offers. Server is the single arbiter of offer state.

**Example:**
```python
# Celery task chain
@app.task
def dispatch_wave(booking_id: str, wave: int, worker_ids: list[str]):
    worker_id = worker_ids[wave]
    redis.setex(f"offer:{booking_id}", 30, worker_id)
    send_push(worker_id, booking_id)
    # schedule expiry handler
    expire_offer.apply_async((booking_id, worker_id), countdown=30)
```

### Pattern 3: ISR for Service Catalog Pages

**What:** Service category and detail pages are generated at build time (SSG) and revalidated via ISR. Dynamic booking forms use CSR with client-side auth guards.

**When to use:** All public-facing catalog URLs (`/services/[category]/[service-slug]`). Everything behind a login gate uses CSR.

**Trade-offs:** ISR needs a revalidation webhook when catalog data changes; a small ops overhead that pays for itself in Google ranking.

**Example:**
```typescript
// app/(public)/services/[slug]/page.tsx
export async function generateStaticParams() {
  const services = await getAllServiceSlugs();
  return services.map(s => ({ slug: s.slug }));
}
export const revalidate = 3600; // re-generate hourly
```

### Pattern 4: Feature-Layer Architecture (Flutter)

**What:** Each Flutter feature has three layers: `data/` (API calls, local storage), `domain/` (pure models and validators), `presentation/` (screens and Riverpod providers). The domain layer has zero Flutter imports — it is plain Dart.

**When to use:** Every feature. Do not skip layers for "simple" features; the skeleton cost is low and it prevents the app from becoming a bowl of spaghetti.

**Trade-offs:** More files than a flat structure, but each file has one responsibility and is testable in isolation.

## Data Flow

### Booking Request Flow (Archetype A)

```
Customer fills form (web/app)
    ↓ POST /api/bookings/ with JWT
Django validates + creates Booking(status=SEARCHING)
    ↓ fires Celery task
dispatch_wave.delay(booking_id, wave=0, worker_pool=[...])
    ↓
Redis: offer:{booking_id} = worker_id (TTL 30s)
    ↓ FCM push to worker app
Captain sees 30s alert → Accept
    ↓ PATCH /api/bookings/{ref}/accept/
Django: atomically claim offer (check Redis key still valid)
    ↓ on success
Booking.status = ASSIGNED; Redis key deleted
    ↓ fan-out
WhatsApp to customer + FCM to both + WebSocket to admin
```

### Auth Flow (OTP)

```
Client: POST /api/auth/otp/request/ { phone }
    ↓
Django: generate OTP → store in Redis (5-min TTL) → MSG91 SMS
    ↓
Client: POST /api/auth/otp/verify/ { phone, otp }
    ↓
Django: compare Redis value → on match → issue JWT (RS256)
    ↓ access: 15 min / refresh: 30 days
Client stores refresh token in flutter_secure_storage / httpOnly cookie (web)
```

### Admin Real-Time Monitor Flow

```
Admin browser connects WebSocket (Django Channels)
    ↓ authenticated via JWT query param
New Booking created → Django signals → Channel layer broadcast
    ↓
Admin sees new lead appear without page refresh
Worker status change → same broadcast path
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–200 bookings/day | Single VPS (2 vCPU / 4 GB): Nginx + Gunicorn + Celery on same machine. One Redis instance. One Postgres primary. This is Phase 1 target. |
| 200–5k bookings/day | Separate Celery worker VPS; add read replica to Postgres for catalog queries; Redis Sentinel for HA. |
| 5k–50k bookings/day | Horizontal Gunicorn workers behind load balancer; Celery autoscaling; Postgres connection pooler (PgBouncer); consider Redis Cluster. |
| 50k+ bookings/day | Break off dispatch engine to a dedicated service; split catalog reads to ElasticSearch; consider event-driven architecture (Kafka) for notification fan-out. |

### Scaling Priorities

1. **First bottleneck — Celery dispatch queue:** At peak, every booking fires multiple Celery tasks. A single underpowered Celery worker causes 30s offer windows to overrun. Fix: dedicated worker process with `--concurrency` set to CPU count × 2.
2. **Second bottleneck — Postgres connection exhaustion:** Django opens one connection per worker thread. At 20+ Gunicorn workers, connections pile up. Fix: PgBouncer in transaction-pooling mode before the database.

## Anti-Patterns

### Anti-Pattern 1: Client-Side Offer Timers

**What people do:** Start a JavaScript countdown on the worker's device; when it reaches zero, the client sends "offer expired."

**Why it's wrong:** A device that's backgrounded, offline, or manipulated never sends the expiry. Two workers can hold the same offer simultaneously, causing double-assignment.

**Do this instead:** Server Celery task owns the 30s window. Client countdown is cosmetic. The server writes the assignment atomically using Redis `SET NX` — only the first accept wins.

### Anti-Pattern 2: Separate Leads Table

**What people do:** Create a `Lead` model for admin "pipeline management" that mirrors booking data, then sync the two.

**Why it's wrong:** Dual-write bugs; state machine splits across two models; queries get expensive joins.

**Do this instead:** Admin flags (`is_new`, `is_viewed`, `admin_note`) are nullable columns on `Booking`. A `Booking` IS the lead.

### Anti-Pattern 3: Storing Full Address Before Offer Accept

**What people do:** Include the full customer address in the push notification payload to the worker app.

**Why it's wrong:** Worker sees the address before committing — enables cherry-picking high-value or nearby jobs and declining the rest, degrading dispatch reliability.

**Do this instead:** Push notification contains only service type, area/neighbourhood, and price. Full address arrives via a separate API call that only succeeds after the booking is in `ASSIGNED` state.

### Anti-Pattern 4: One Service = One Django App

**What people do:** Create a new Django app (`electrical`, `plumbing`, `beauty`) for each service category.

**Why it's wrong:** Every category gets its own models, migrations, API views, and tests. Adding a category requires code changes.

**Do this instead:** Service categories are data rows in `ServiceCategory`, not code. All category-specific logic is driven by the `archetype` column and a service catalog config.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| MSG91 (OTP/SMS) | Celery task → HTTP POST to MSG91 API | DLT template ID required for transactional SMS in India; register templates before launch |
| WATI (WhatsApp) | Celery task → WATI webhook API at every booking status change | Template messages only until business account approved; approval takes 1–2 weeks |
| FCM (push) | Celery task → Firebase Admin SDK | Captain app needs foreground + background handlers; 30s alert must wake a locked device |
| DigiLocker (Aadhaar KYC) | Redirect flow in Captain app → DigiLocker OAuth → webhook delivers XML | Requires DigiLocker API partner registration; use sandbox for dev |
| Google Maps | Server-side Distance Matrix API for proximity ranking; Maps JS SDK in web for address picker | Cache distance results in Redis (TTL 1h) to avoid per-request costs |
| SendGrid (email) | Celery task → SendGrid SDK | Transactional only in Phase 1; marketing campaigns are Phase 2 |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Next.js ↔ Django | HTTPS REST (JSON) | Next.js route handlers proxy to Django; never expose Django URL directly to browser except API subdomain |
| Flutter ↔ Django | HTTPS REST + WebSocket | JWT in Authorization header; refresh handled by AuthInterceptor |
| Django ↔ Celery | Redis task queue | Use `task.apply_async(countdown=...)` for deferred tasks; never `task.delay()` inside a DB transaction |
| Django ↔ Django Channels | In-process Channel layer (Redis backend) | Admin dashboard and Captain app both connect via WS; keep WS messages small — IDs and status codes, not full objects |
| Celery ↔ Postgres | Django ORM (same models) | Celery tasks import from `apps/`; use `select_for_update()` on offer-claim to prevent race conditions |

## Sources

- Django Channels docs — ASGI + Channel layers
- Celery best practices — `apply_async` + `select_for_update` for distributed timers
- Next.js App Router — ISR revalidation patterns
- Flutter feature-layer architecture — Official Flutter very good core template
- MSG91 + DLT registration — TRAI guidelines for transactional SMS in India
- DigiLocker API partner documentation

---
*Architecture research for: VSolve — local-services marketplace (Next.js 15 + Django 5 + Flutter 3)*
*Researched: 2026-06-22*
