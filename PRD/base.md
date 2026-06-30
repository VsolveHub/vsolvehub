# VSolveHub — Technical Foundation

> **Version:** 1.0 | **Last Updated:** June 2026

---

## 1. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Frontend** | Next.js | 15.x | App Router, React Server Components |
| **UI Library** | React | 19.x | Latest stable |
| **Language** | TypeScript | 5.x | Strict mode |
| **Styling** | Vanilla CSS | — | Design tokens in globals.css |
| **Package Manager** | pnpm | 11.x | Workspace support |
| **Backend** | Django | 5.x | Python 3.12+ |
| **API Framework** | Django REST Framework | 3.15+ | JWT auth, serializers |
| **Database** | PostgreSQL | 16 | Primary data store |
| **Cache / Sessions** | Redis | 7.x | OTP store, rate limiting, session cache, Celery broker, Channels layer |
| **Async tasks** | Celery + Celery-beat | 5.x | Notifications, server-side 30s job timers, sweepers, CSV exports |
| **Real-time** | Django Channels | 4.x | Admin assignment WebSocket (worker accept/decline within 30s) |
| **Mobile** | Flutter | 3.x (Dart 3) | Android + iOS; single codebase |
| **Auth** | OTP-based | — | SMS via MSG91, JWT tokens |
| **WhatsApp** | WATI (primary) | — | Fallback: Twilio WhatsApp |
| **SMS / OTP** | MSG91 (primary) | — | Fallback: Fast2SMS / Twilio |
| **Push Notifications** | Firebase FCM | — | Android + iOS, via firebase-admin |
| **Email** | SendGrid (primary) | — | Fallback: Mailgun, django-anymail |
| **Maps** | Google Maps API | — | Places, Geocoding, Embed |
| **Analytics** | Google Analytics 4 | — | gtag.js via Next.js Script |
| **File Storage** | AWS S3 / DigitalOcean Spaces | — | Worker documents, images |
| **Hosting** | VPS (AWS / DigitalOcean) | — | Nginx + PM2 / Gunicorn |
| **CI/CD** | GitHub Actions | — | Test → Build → Deploy pipeline |
| **SSL** | Let's Encrypt | — | Auto-renewing via Certbot |
| **Version Control** | Git / GitHub | — | Feature branch workflow |
| **Error Tracking** | Sentry | — | Frontend + Backend |
| **Spam Protection** | reCAPTCHA v3 | — | All public forms |

---

## 2. System Architecture

```mermaid
graph TD
    subgraph "Client Layer"
        A[Customer Browser\nNext.js 15 PWA]
        B[Customer App\nFlutter]
        C[Worker App\nFlutter]
        D[Admin Browser\nCustom Dashboard]
    end

    subgraph "API Layer"
        E[Django REST API\n/api/v1/\nGunicorn + Nginx]
    end

    subgraph "Data Layer"
        F[(PostgreSQL 16\nPrimary DB)]
        G[(Redis 7\nCache + Sessions)]
        H[AWS S3\nFile Storage]
    end

    subgraph "External Services"
        I[WhatsApp API\nWATI / Twilio]
        J[SMS OTP\nMSG91 / Fast2SMS]
        K[Firebase FCM\nPush Notifications]
        L[Google Maps API\nGeolocation]
        M[SendGrid\nEmail SMTP]
        N[Google Analytics 4]
        O[reCAPTCHA v3]
    end

    A -->|HTTPS REST| E
    B -->|HTTPS REST + FCM| E
    C -->|HTTPS REST + FCM| E
    D -->|HTTPS REST| E

    E --> F
    E --> G
    E --> H

    E -->|Booking alerts| I
    E -->|OTP dispatch| J
    E -->|Job alerts, status| K
    E -->|Geocoding| L
    E -->|Confirmation emails| M

    A -->|Events| N
    B -->|Events| N
    A -->|Token verify| O
```

---

## 3. Repository Structure

```
quickservicehub/                  ← Organization root
├── VSolveHub/                    ← Next.js 15 Frontend (this repo)
│   ├── app/                      # App Router pages
│   ├── components/               # React components
│   ├── lib/                      # Data, utilities, client helpers
│   ├── hooks/                    # Custom React hooks
│   ├── PRD/                      # Product Requirements Documents
│   └── legacy/                   # Archived static HTML site
│
├── qsh-backend/                  ← Django 5 API (separate repo)
│   ├── config/                   # Django settings (base, dev, prod)
│   ├── apps/
│   │   ├── users/                # CustomUser, OTP, sessions
│   │   ├── workers/              # Worker profile, documents, skills
│   │   ├── services/             # Category, SubCategory, Service
│   │   ├── bookings/             # Booking, status log, cancellation
│   │   ├── notifications/        # WhatsApp, FCM, Email dispatch
│   │   └── admin_panel/          # Admin-specific APIs
│   ├── requirements/
│   │   ├── base.txt
│   │   ├── dev.txt
│   │   └── prod.txt
│   └── manage.py
│
├── qsh-customer-app/             ← Flutter Customer App
│   ├── lib/
│   │   ├── screens/
│   │   ├── widgets/
│   │   ├── navigation/
│   │   ├── services/             # API calls
│   │   └── providers/            # Riverpod / BLoC state
│   ├── android/
│   ├── ios/
│   └── pubspec.yaml
│
└── qsh-worker-app/               ← Flutter Worker App
    ├── lib/
    │   ├── screens/
    │   ├── widgets/
    │   ├── navigation/
    │   └── services/
    ├── android/
    ├── ios/
    └── pubspec.yaml
```

---

## 4. Environments

| Environment | Frontend URL | Backend URL | Purpose |
|-------------|-------------|-------------|---------|
| **Local** | `http://localhost:3000` | `http://localhost:8000` | Development |
| **Staging** | `https://staging.vsolvehub.com` | `https://api-staging.vsolvehub.com` | QA, UAT |
| **Production** | `https://www.vsolvehub.com` | `https://api.vsolvehub.com` | Live |

### Environment Variables

**Next.js Frontend (.env.local)**
```bash
NEXT_PUBLIC_API_BASE_URL=https://api.vsolvehub.com
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lc...
NEXT_PUBLIC_WHATSAPP_NUMBER=919000000000
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
```

**Django Backend (.env)**
```bash
SECRET_KEY=your-django-secret-key
DEBUG=False
ALLOWED_HOSTS=api.vsolvehub.com,api-staging.vsolvehub.com
DATABASE_URL=postgresql://user:pass@localhost:5432/qsh_prod
REDIS_URL=redis://localhost:6379/0

# Auth (RS256 asymmetric signing — see conventions.md D-04 / non_functional.md §2.1)
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=15
JWT_REFRESH_TOKEN_LIFETIME_DAYS=30
JWT_PRIVATE_KEY=/etc/secrets/jwt_rs256_private.pem
JWT_PUBLIC_KEY=/etc/secrets/jwt_rs256_public.pem

# Notifications
MSG91_AUTH_KEY=...
MSG91_TEMPLATE_ID=...
WATI_API_URL=https://live-server-XXXXX.wati.io
WATI_ACCESS_TOKEN=...
FIREBASE_CREDENTIALS_JSON=/etc/secrets/firebase_credentials.json
SENDGRID_API_KEY=SG...

# Storage
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_STORAGE_BUCKET_NAME=qsh-uploads-prod
AWS_S3_REGION_NAME=ap-south-1

# Google
GOOGLE_RECAPTCHA_SECRET_KEY=...

# Sentry
SENTRY_DSN=https://...@sentry.io/...
```

---

## 5. API Design Principles

### Base URL & Versioning
```
https://api.vsolvehub.com/api/v1/
```

### Standard Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 150,
      "has_next": true
    }
  },
  "error": null
}
```

**Error Response:**
```json
{
  "success": false,
  "data": null,
  "meta": {},
  "error": {
    "code": "INVALID_OTP",
    "message": "The OTP you entered is incorrect. 2 attempts remaining.",
    "field": "otp"
  }
}
```

### Auth
- All protected endpoints require: `Authorization: Bearer <access_token>`
- Access token: 15-minute JWT
- Refresh token: 30-day JWT (stored in HttpOnly cookie)
- Token refresh: `POST /api/v1/auth/token/refresh/`

### Pagination
- List endpoints: `?page=1&page_size=20`
- Admin feeds: cursor-based with `?cursor=...` for real-time lists

### Rate Limiting
| Type | Limit |
|------|-------|
| Public endpoints | 60 req / min per IP |
| Authenticated endpoints | 300 req / min per user |
| OTP send | 3 OTPs / 10 min per phone |
| OTP verify | 3 attempts per OTP |
| File upload | 10 uploads / hour per user |

### HTTP Status Codes
| Code | Usage |
|------|-------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (delete) |
| 400 | Bad Request / Validation Error |
| 401 | Unauthenticated |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 422 | Unprocessable Entity |
| 429 | Rate Limited |
| 500 | Server Error |

---

## 6. Security Baseline

| Concern | Implementation |
|---------|---------------|
| **Transport** | TLS 1.2+ everywhere; HSTS header with 1-year max-age |
| **Auth** | JWT with 15-min access + 30-day refresh; refresh token rotation |
| **OTP** | bcrypt-hashed (cost 12), single-use, 10-min expiry, 3 attempts; **Redis is the live store, `otp_logs` is audit-only** (see `conventions.md` D-03) |
| **CORS** | Strict whitelist: `vsolvehub.com`, `staging.vsolvehub.com` |
| **Rate Limiting** | Django `django-ratelimit` + Redis backend |
| **Input Validation** | DRF serializer validation server-side; client-side as UX only |
| **SQL Injection** | Django ORM only; raw queries parameterized; no `.raw()` with user input |
| **XSS** | `Content-Security-Policy` header; no `dangerouslySetInnerHTML` |
| **File Uploads** | MIME type whitelist (JPEG, PNG, PDF); max 5MB; stored in private S3 bucket |
| **Sensitive Data** | Aadhaar numbers + bank account numbers encrypted at rest (AES-256) |
| **Admin Access** | 2FA required; IP allowlist for admin panel in production |
| **Dependency Scanning** | `pip-audit` (Python) + `pnpm audit` (Node) in CI pipeline |

---

## 7. Rendering Strategy (Next.js)

| Route | Strategy | Why |
|-------|----------|-----|
| `/` | ISR (revalidate: 1800) | SEO + fresh stats (30 min — see `conventions.md` D-19) |
| `/services` | SSG | Static category list |
| `/services/[cat]` | ISR (revalidate: 3600) | Category pages for SEO |
| `/services/[cat]/[id]` | SSR | Dynamic pricing/availability |
| `/booking/*` | CSR | Auth-gated, no SEO needed |
| `/profile/*` | CSR | Auth-gated |
| `/about`, `/contact`, `/faq`, `/gallery` | SSG | Static content |

---

## 8. Database Design Principles

- **Soft deletes:** All major entities have `deleted_at TIMESTAMPTZ NULL` — never hard delete
- **Audit fields:** `created_at`, `updated_at` (auto-managed) on every table
- **Primary keys:** UUID (`gen_random_uuid()`) for all externally-referenced entities; integer sequences for internal-only tables
- **Status enums:** All state machine fields use PostgreSQL `ENUM` or `VARCHAR` with Django `TextChoices`
- **Indexes:** On all FK columns, `phone`, `booking_ref`, `status` columns used in WHERE clauses
- **Encryption:** `pgcrypto` extension for encrypting Aadhaar and bank account fields
- **Full-text search:** `pg_trgm` extension for service name search
- **Time zones:** All timestamps stored as UTC; display in IST (`Asia/Kolkata`) in UI
- **Migrations:** Django migrations only; no manual schema changes in production

---

## 9. CI/CD Pipeline (GitHub Actions)

```mermaid
flowchart LR
    A[Push to feature branch] --> B[Lint + Type Check]
    B --> C[Unit Tests]
    C --> D[Build]
    D --> E{Branch?}
    E -->|main| F[Deploy to Staging]
    E -->|release/*| G[Deploy to Production]
    F --> H[Smoke Tests]
    G --> I[Health Check]
```

**Pipeline steps:**
1. `pnpm lint` + TypeScript type-check
2. `python manage.py test` (Django)
3. `pnpm build` (Next.js)
4. Docker build + push to registry
5. SSH deploy to VPS via `rsync` / Docker Compose
6. Run `manage.py migrate` (zero-downtime with `--check` first)
7. Smoke test: hit `/api/v1/health/` + `/{homepage}`
8. Notify via WhatsApp / Slack on success or failure
