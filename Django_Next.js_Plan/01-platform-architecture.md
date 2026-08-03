# Platform Architecture

## System shape

```text
Customer Next.js ─┐
Partner Next.js  ─┼── HTTPS /api/v1 ── Django/DRF modular monolith
Operations Next.js┘                         │
                                            ├── PostgreSQL: business truth
                                            ├── Redis: cache/presence/coordination
                                            ├── Celery workers and scheduler
                                            ├── Private object storage
                                            └── payment, messaging, maps and verification adapters
```

- `frontend/apps/admin` remains the physical application and is labelled Operations.
- Public pages may use Server Components; authenticated workspaces use React client components and
  TanStack Query.
- Django publishes OpenAPI. `frontend/packages/api-client` is generated and never hand-edited.
- The system remains a modular monolith until scale or organization boundaries justify an ADR.

## Stable domain boundaries

Logical domains are:

- identity and access
- catalog and geography
- Partner onboarding and eligibility
- marketplace intent, availability and assignment
- fulfilment and evidence
- pricing, orders, payments, documents, ledger and payout
- communications
- safety, support, disputes, Operations and audit

Existing Django apps may remain physically more granular. Do not reorganize working code only to make
folder names match this list; enforce ownership through services, selectors and transaction boundaries.

## Data authority

- PostgreSQL owns users, configuration, quotes, reservations, offers, assignments, bookings, work,
  payments, ledgers, documents, cases and audit.
- Redis owns expiring presence, cache entries, rate-limit counters and optional short coordination
  hints. Loss of Redis may pause dispatch but cannot permit double assignment or duplicate money.
- Object storage owns private evidence and KYC blobs. PostgreSQL owns metadata, purpose, consent,
  retention and access audit.
- Celery is at-least-once. Every task must be retry-safe and must re-check authoritative state.

## Correctness primitives

- PostgreSQL exclusion constraints prevent overlapping active Partner reservations.
- Partial unique constraints prevent multiple active accepted assignments for one booking and multiple
  active payouts for one ledger entry.
- Conditional updates or `select_for_update` resolve competing transitions.
- Transactional outbox rows are committed with business state and published afterward.
- Provider webhooks are stored before reduction and deduplicated by provider event identity.
- Public references are high-entropy and never substitute for object authorization.
- Multi-unit confirmation uses a durable group coordinator and idempotent compensations. Database
  transactions protect each local transition; asynchronous Partner decisions are never described as
  one distributed atomic transaction.

Redis locks may reduce duplicate work, but correctness must survive their expiry or loss.

## External adapters

Every external service sits behind a typed interface with timeout, retry classification, idempotency
where supported, reconciliation and a kill switch:

- payment and refund
- Partner payout
- SMS/OTP and transactional messaging
- email/push
- geocoding/routing
- KYC/background verification
- masked calling
- malware/media processing

No provider-specific payload becomes a domain model. Raw payload access is restricted and retention is
bounded.

## Repository and ownership

```text
backend/                 Django, Celery and migrations
contracts/openapi/       generated public API contract
frontend/apps/customer/  Customer Next.js
frontend/apps/partner/   Partner Next.js
frontend/apps/admin/     Operations Next.js
frontend/packages/       UI, query, generated client and testing
infra/                   local and deployment infrastructure
docs/adr/                accepted architecture decisions
docs/runbooks/           production recovery
Django_Next.js_Plan/     product and delivery plan
```

During migration, legacy Prisma/Next.js business routes remain read-only reference. Cutover is by a
complete vertical slice. Prisma and Django must never write the same production domain concurrently.

## Deployment

- Frontend, API, worker and scheduler deploy independently using backward-compatible contracts.
- API, PostgreSQL and Redis are regionally co-located.
- Static assets use CDN caching; authenticated responses are private/no-store.
- Migrations deploy before code that requires them. Destructive removals wait until old readers are
  gone and rollback has been rehearsed.
- Environments have separate databases, object buckets, queues, credentials and payment accounts.

## Frontend runtime

- Client cache is a projection, never business truth.
- Mutations show pending/error/retry and invalidate only related keys.
- Payment, assignment, arrival, OTP and completion are never optimistically claimed.
- Server time accompanies expiring/time-sensitive resources.
- Cross-tab session and checkout coordination improves UX; backend idempotency remains authoritative.
- Bounded polling is acceptable as transport recovery. Browser activity never drives dispatch or
  expiry.
