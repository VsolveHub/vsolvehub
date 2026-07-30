# Repository and System Architecture

## Start on top of the current code or from scratch?

Use a hybrid approach:

- Build the **Django backend and database domain from scratch**.
- Build the **Technician booking feature from scratch** within the existing frontend workspace.
- Reuse reviewed visual primitives, branding and content.
- Keep legacy Next.js APIs and Prisma code isolated until cutover.
- Replace one complete vertical slice, then remove the replaced legacy path.

This avoids patching the existing domain model indefinitely and avoids wasting stable frontend work.

## Transition repository structure

During the rebuild:

```text
C:\dev\vsolve
├── web\                              # Existing pnpm/Turborepo frontend
│   ├── apps\
│   │   ├── customer\                 # Next.js customer app
│   │   ├── partner\                  # Existing app; migrate to API client
│   │   └── admin\                    # Existing app; migrate to API client
│   └── packages\
│       ├── ui\
│       ├── query\
│       └── api-client\               # Generated from Django OpenAPI
├── backend\                          # New Django system of record
├── infra\                            # Docker and environment configuration
├── Django_Next.js_Plan\              # Architecture plan
└── docs\
```

We do not initially move the existing `web` folder. That would create unrelated churn before the new backend is working.

## Target repository structure

```text
C:\dev\vsolve
├── web\
│   ├── apps\
│   │   ├── customer\                 # Next.js App Router
│   │   ├── partner\                  # Next.js; private React workspace
│   │   └── admin\                    # Next.js; product label is Operations
│   ├── packages\
│   │   ├── ui\                       # Brand tokens and accessible primitives
│   │   ├── api-client\               # Generated API client and types
│   │   ├── query\                    # TanStack Query setup/query keys
│   │   ├── config\                   # Shared TypeScript/config
│   │   └── testing\                  # Frontend test helpers
│   ├── package.json
│   ├── pnpm-workspace.yaml
│   └── turbo.json
├── backend\
│   ├── manage.py
│   ├── pyproject.toml
│   ├── config\
│   │   ├── settings\
│   │   │   ├── base.py
│   │   │   ├── local.py
│   │   │   ├── test.py
│   │   │   ├── staging.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   ├── api.py
│   │   ├── celery.py
│   │   ├── asgi.py
│   │   └── wsgi.py
│   ├── apps\
│   │   ├── identity\
│   │   ├── catalog\
│   │   ├── locations\
│   │   ├── partners\
│   │   ├── availability\
│   │   ├── pricing\
│   │   ├── carts\
│   │   ├── bookings\
│   │   ├── orders\
│   │   ├── payments\
│   │   ├── notifications\
│   │   ├── reviews\
│   │   └── audit\
│   ├── common\
│   │   ├── errors\
│   │   ├── idempotency\
│   │   ├── observability\
│   ├── tests\
│   │   ├── integration\
│   │   ├── contract\
│   │   └── e2e\
│   └── scripts\
├── infra\
│   ├── compose.yaml
│   ├── docker\
│   │   ├── backend.Dockerfile
│   │   ├── web.Dockerfile
│   │   └── nginx.conf
│   ├── monitoring\
│   └── deployment\
├── docs\
│   ├── adr\
│   ├── api\
│   ├── runbooks\
│   └── diagrams\
├── .env.example
└── README.md
```

## Application responsibilities

### Customer Next.js

Owns:

- Search-engine-visible pages
- Catalog presentation
- Metadata, structured data and shareable routes
- Customer application shell
- Booking workspace UI
- Client cache and optimistic presentation
- Accessibility and responsive behaviour

Does not own:

- Business price calculations
- Provider assignment
- Booking state transitions
- Payment truth
- Database connections
- OTP validation

### React booking workspace

This is not a separate framework. It is a client component feature within the customer Next.js app.

Suggested frontend feature structure:

```text
apps/customer/src/features/booking/
├── api/
├── components/
├── machine/
├── queries/
├── screens/
├── state/
├── validation/
└── __tests__/
```

It should:

- Mount once for the booking journey.
- Change stages without route remounting.
- Keep the navbar and price rail stable.
- Preserve a pending add-to-cart action through login.
- Hydrate the authenticated cart through the API.
- Use URL state only for safe/deep-linkable identifiers.
- Never store authoritative prices or booking states only in the browser.

### Partner and Operations applications

Milestone 1 keeps the existing `partner` and `admin` Next.js applications. Their authenticated
areas are long-lived React client workspaces backed by TanStack Query. The physical `admin` folder
is retained and the product is labelled **Operations** in the UI.

There is no Vite migration and no new `web/apps/operations` application in Milestone 1. A build
framework change would add route, authentication, deployment and test churn without fixing the
actual latency causes. Navigation performance is addressed with persistent layouts, client-side
transitions, route/data prefetching, granular loading boundaries and measured bundle/API budgets.
A later framework change requires profiling evidence and an ADR.

Public partner-acquisition content remains in the customer Next.js application under routes such
as `/partners`, where SEO and shareable pages matter.

### Django API

Django is the sole authority for:

- Identity, roles and permissions
- Catalog and service configuration
- Address ownership and serviceability
- Quotes and price snapshots
- Provider schedules and capacity
- Cart, checkout session, booking and reservation
- Orders, payments, refunds and invoices
- Booking state machines
- OTP and timer state
- Extensions and price revisions
- Reviews and audit trails

### Celery

Celery handles work that must survive browser closure or request failure:

- Reservation expiry
- Assignment acknowledgement-window expiry
- Assignment retry and post-acknowledgement stall watchdog
- Notification delivery
- Invoice generation
- Payment reconciliation
- Refund retry
- Scheduled reminders
- Abandoned-cart and expired-checkout cleanup
- Outbox publication

## Service boundaries

For Milestone 1 use a **modular monolith**, not microservices.

Each Django app has:

- Models
- Domain services
- Selectors/read services
- API serializers
- API views
- Tasks
- Tests

Cross-domain writes go through application services and explicit transactions. We avoid importing another app’s internal models throughout the codebase.

Microservices are deferred until measured scaling or organizational constraints justify them.

## Network and deployment

Production components should be located in the same or nearby region:

```text
CDN / edge
  → Next.js frontend
  → Django API
  → Redis and Supabase PostgreSQL
```

Rules:

- Browser calls one public API origin.
- TLS everywhere.
- Django and PostgreSQL must be regionally co-located.
- Static assets use CDN caching.
- API responses containing customer data are private/no-store.
- Catalog APIs may use bounded caching and explicit invalidation.
- Web and API deploy independently.
- Worker and scheduler deploy independently from the HTTP API.

## API contract ownership

Django publishes OpenAPI. TypeScript clients are generated into `web/packages/api-client`.

This prevents:

- Hand-maintained duplicate request types
- Frontend/backend validation drift
- Guessing error response formats
- Direct database model exposure

Generated code is not manually edited.
