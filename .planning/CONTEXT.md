# Phase 1 Discussion — Architecture & Scope Decisions

**Phase:** 1 — Foundation & Data Models
**Status:** Pre-implementation
**Date:** 2026-06-22
**Purpose:** Resolve ambiguities and lock in architectural decisions before any code is written.

---

## Gray Areas Resolved

### 1. Address privacy rule (conflict between `missed.md` and REQUIREMENTS.md)

**Conflict:** `missed.md` (written against an older plan) states "Worker sees the full address BEFORE accepting" as a deliberate override of PRD §9. REQUIREMENTS.md DISP-09 and TRST-02 state the opposite: worker sees only the service area until after accepting.

**Decision: REQUIREMENTS.md is authoritative. Address is hidden until post-accept.**

Reasoning: REQUIREMENTS.md was written after `missed.md` and represents the current Phase 1 spec. The ROADMAP also echoes this (Phase 5 success criterion #8: "Worker sees service area only — full address is hidden until after acceptance"). The `missed.md` note reads like an exploratory product consideration, not a final decision. Implement address masking at the serializer layer: booking serializer returns `area` to unassigned workers, `address` only after `booking.assigned_worker == request.user`.

Schema impact: None. `address` column on `bookings` is stored in full; masking is applied in the API layer.

---

### 2. Type G archetype in Phase 1 schema

**Conflict:** ROADMAP goal says "all seven archetype schemas in the DB from Phase 1." `missed.md` notes G (Job Board) is absent from the plan's enum and archetype config. The `archetype` enum in BOOK-06 only mentions A or B being *set* for Phase 1 bookings.

**Decision: G is added to the DB enum and archetype config stub in Phase 1. No booking flow is wired.**

Reasoning: The whole point of the archetype system (D-27) is forward-compatibility. Adding G to the enum costs nothing now; retrofitting it after 1000 bookings exists with A–F only is expensive. The `bookings.archetype` column accepts `A|B|C|D|E|F|G` from Day 1. No `booking_type_g` Celery task, status machine, or form exists yet. The `services` seed will include one "Job Opportunities" category tagged `archetype=G` so the slug routing is ready.

Status machine stub for G: `POSTED → APPLIED → SHORTLISTED → HIRED → CLOSED` — defined as a Python enum in `core/enums.py` but not connected to any view or Celery task.

---

### 3. Monorepo layout

**Conflict:** PROJECT.md references `qsh-backend` as a "separate repo" and `VSolveHub/` as the Next.js frontend. There is no existing code in `C:\dev\vsolve` — only planning docs.

**Decision: This repo (`C:\dev\vsolve`) is the monorepo. All code lives here.**

Directory layout:
```
C:\dev\vsolve\
├── backend/          # Django 5 project (was "qsh-backend")
│   ├── core/         # Base models, enums, shared utilities
│   ├── bookings/     # Booking, Cancellation, BookingStatusHistory
│   ├── workers/      # Worker, JobAssignment
│   ├── services/     # ServiceCategory, ServiceSubcategory, City, ServiceArea
│   └── dispatch/     # Dispatch engine (Phase 5; app scaffold only in Phase 1)
├── web/              # Next.js 15 App Router frontend
├── apps/
│   ├── customer_app/ # Flutter customer app
│   └── captain_app/  # Flutter Captain (worker) app
└── .planning/        # Planning docs (this folder)
```

The `backend/` name replaces `qsh-backend`; no external reference to the old name is required.

---

### 4. Seed data shipped with Phase 1 migrations

**Conflict:** No explicit seed specification exists. The ROADMAP says "seed cities data" in plan 01-02. `missed.md` says "seed captains as ACTIVE." Cities, services, and worker seeding must be decided before writing the migration.

**Decision: Three seed fixtures ship with Phase 1.**

**Fixture 1 — Cities** (`backend/services/fixtures/cities.json`):
- Warangal (slug: `warangal`)
- Karimnagar (slug: `karimnagar`)
- Hyderabad (slug: `hyderabad`)

**Fixture 2 — Service categories** (`backend/services/fixtures/categories.json`):
- Home Services (slug: `home-services`, archetype: `A`)
- Construction (slug: `construction`, archetype: `A`)
- Beauty & Wellness (slug: `beauty-wellness`, archetype: `B`)
- Vehicle Services (slug: `vehicle-services`, archetype: `A`)
- Manpower & Event Labour (slug: `manpower-events`, archetype: `B`, resolve_rule: `MANPOWER_INTENT`)
- Job Opportunities (slug: `job-opportunities`, archetype: `G`) — stub only; no booking flow

Sub-categories are seeded from `services.md` for the five active categories. Job Opportunities sub-categories are included so slug routing is ready.

**Fixture 3 — Dev workers** (`backend/workers/fixtures/dev_workers.json`):
- 5 workers, one per core service, all `status=ACTIVE`, `is_online=True`
- Aadhaar fields: placeholder encrypted values (not real Aadhaar numbers)
- Only loaded in `development` environment (`./manage.py loaddata dev_workers` — not in production migrations)
- Rationale: Admin KYC approval queue (Phase 8) does not exist yet; seeded-ACTIVE workers are required for dispatch to function during Phase 1–4 development.

---

### 5. pgcrypto key management

**Conflict:** Phase 1 schema must include AES-256 encrypted columns for Aadhaar and bank numbers. The encryption key source must be decided before the migration is written; changing it later requires a data migration.

**Decision: `PGCRYPTO_ENCRYPTION_KEY` env variable, read via `django-environ`. Never hardcoded.**

`.env.example` ships a placeholder:
```
PGCRYPTO_ENCRYPTION_KEY=CHANGE_ME_32_CHAR_SECRET_KEY_HERE
```

Schema pattern: Django model fields store the raw ciphertext as `TextField`. Encryption/decryption happens via pgcrypto SQL functions called from custom Django model methods:
```python
# Encrypt on save
cursor.execute(
    "UPDATE workers_worker SET aadhaar_encrypted = pgp_sym_encrypt(%s, %s) WHERE id = %s",
    [aadhaar_number, settings.PGCRYPTO_ENCRYPTION_KEY, self.id]
)
# Decrypt on read (admin-only)
cursor.execute(
    "SELECT pgp_sym_decrypt(aadhaar_encrypted::bytea, %s) FROM workers_worker WHERE id = %s",
    [settings.PGCRYPTO_ENCRYPTION_KEY, self.id]
)
```

The encryption key is NOT stored in the database. It is NOT logged. `sentry-sdk` `before_send` (Phase 9) explicitly scrubs this field from error context.

---

## Canonical Decisions (Carry Forward to All Phases)

These decisions are locked and must not be revisited without a documented override.

| ID | Decision | Phase | Impact |
|----|----------|-------|--------|
| D-01 | No separate leads table; admin flags (`viewed_at`, `is_spam`, `closed_at`) are columns on `bookings` | Phase 1 | Schema |
| D-08 | `amount` column on `bookings` from Day 1; no payment gateway yet | Phase 1 | Schema |
| D-11 | Partial unique index on `job_assignments` enforces single-active-offer per worker | Phase 1 | Schema |
| D-15 | Worker phone never exposed to customer; address hidden from worker until post-accept | Phase 1 | API layer |
| D-20 | Auto-dispatch is the normal path; admin force-assign is an exception only | Phase 5 | Dispatch |
| D-27 | All seven archetype schemas in DB from Phase 1; only A & B wired in code | Phase 1 | Schema |
| D-timer | 30s offer timer is server-side (Celery); Flutter countdown is cosmetic | Phase 5 | Celery |
| D-addr | Address shown to worker ONLY after job acceptance (REQUIREMENTS.md DISP-09) | Phase 1 | API layer |
| D-seed | Dev workers seeded as `ACTIVE` to enable dispatch testing before admin KYC queue exists | Phase 1 | Dev data |

---

## Phase 1 Scope — What Is and Is Not Built

### IN scope (plans 01-01 and 01-02)

- Django project scaffold (`backend/`) with settings for dev/prod, `django-environ`, Docker Compose
- `pgcrypto` extension enabled via `0001_enable_pgcrypto.sql` run before first migration
- All Django app skeletons: `core`, `bookings`, `workers`, `services`, `dispatch`
- Models: `City`, `ServiceArea`, `ServiceCategory`, `ServiceSubcategory`, `Worker`, `Booking`, `Cancellation`, `BookingStatusHistory`, `JobAssignment`
- Full column set on `bookings`: `archetype`, `phone_verified`, `amount`, `admin_viewed_at`, `is_spam`, `closed_at`, `reference` (VSH-XXXX), `address`, `area`, `preferred_datetime`, `notes`
- `archetype` Django `TextChoices` enum: A, B, C, D, E, F, G (all seven; only A/B wired in booking views)
- `JobAssignment.status` partial unique index: `UNIQUE WHERE status = 'OFFER_SENT'` per worker
- AES-256 encrypted columns on `Worker`: `aadhaar_encrypted`, `bank_account_encrypted`
- Seed fixtures: cities, service categories + sub-categories, dev workers (dev env only)
- `BookingStatusHistory` and `JobAssignment` as append-only ledgers (no `UPDATE` path in application code)

### NOT in scope for Phase 1

- Any Django view, serializer, or URL route (those belong to Phases 2–5)
- Celery configuration or task definitions
- Authentication middleware
- Next.js or Flutter code
- The actual dispatch logic
- Admin dashboard UI

---

## Dependency Notes

- Phase 2 (Auth) depends on the `Worker` and `Booking` models existing with the `phone_verified` flag
- Phase 3 (SEO) depends on `City`, `ServiceCategory`, `ServiceSubcategory` models with slug fields
- Phase 5 (Dispatch) depends on the `JobAssignment` partial unique index and `BookingStatusHistory` ledger
- The pgcrypto extension must exist before any migration that creates encrypted columns runs

---

*Discussion complete. Ready to begin plan 01-01.*
