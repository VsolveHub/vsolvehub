# Vsolve Hub — Django + Next.js Rebuild Plan

**Status:** Architecture baseline accepted; Django foundation/identity implementation exists  
**Scope:** Milestone 1, beginning with the Technician booking vertical slice  
**Implementation:** Booking, pricing, availability, payment and fulfilment vertical capabilities are
not yet implemented in the new Django system
**Last updated:** 30 July 2026

## Decision

Vsolve Hub should use:

- **Next.js + React** for the customer-facing website.
- **React client components inside Next.js** for the fast, click-heavy booking workspace.
- **Next.js + React client workspaces** for Partner and the existing Admin/Operations application
  in Milestone 1.
- **Django + Django REST Framework** as the only business backend.
- **Celery + Redis** for dispatch, expiry, notifications, retries and scheduled work.
- **Local PostgreSQL** for development and automated tests.
- **Supabase-managed PostgreSQL** for staging and production.
- **Supabase Storage or S3-compatible storage** for KYC and booking media.
- **Django ORM and Django migrations as the single database authority.**

Next.js is already a React framework. “Use React for quick navigation” means that the public catalog remains server-rendered where useful, while the booking journey is implemented as a persistent client-side React workspace rather than a chain of server-rendered pages.

## Current rebuild status

Implemented in the new foundation:

- Django project/settings and virtual environment workflow
- PostgreSQL/Redis local infrastructure
- Health, OTP/session identity APIs and generated OpenAPI
- Catalog, effective-dated starting rates, addresses, reverse geocoding and serviceability APIs
- Deterministic 19-service Technician seed and development service-area configuration
- Backend lint, typing, test and coverage gates

Not yet implemented in the new Django vertical slice:

- Cart, quote, checkout and capacity
- Scheduled/Instant commitment and Partner fulfilment
- Payment, invoice, extension/parts collection and settlement
- Operations recovery and the new Customer/Partner experiences

The legacy `web` implementation is reference material, not evidence that these new domains are
complete.

## Are we rebuilding everything?

No. We are doing a **controlled rebuild**, not blindly rewriting every file.

### Build cleanly from scratch

- Django backend and API contracts
- Django-owned database schema
- Authentication and authorization boundary
- Cart, checkout session, quote, reservation, booking, order and payment domains
- Provider availability and assignment engine
- Celery jobs and transactional outbox
- Technician booking workspace
- Generated TypeScript API client
- Automated test foundation

### Reuse after review

- Vsolve Hub logo and brand assets
- Approved color tokens and typography
- Stable navbar, shell and responsive primitives
- Accessible generic UI components
- Catalog copy, service images and valid seed data
- Existing business rules that tests prove are correct

### Do not carry forward

- `Booking(status = DRAFT)` as a shopping cart
- Next.js route handlers as the source of booking truth
- Multiple authentication systems
- Browser polling that drives dispatch or reassignment
- Hardcoded generic service pricing
- Placeholder slots treated as customer selections
- Payment before authoritative capacity reservation
- Direct Prisma access from customer, partner and admin applications
- UI quantity controls that silently create multiple bookings

The existing `C:\dev\vsolve\web` codebase remains available as a reference during the rebuild. We do not delete it or the development tables until the new Technician vertical slice passes acceptance.

## Target system

```text
Customer Next.js website
  ├── Public catalog: Server Components, SEO and caching
  └── Booking workspace: client-side React + TanStack Query

Partner Next.js ─────────┐
Admin/Operations Next.js ┼── HTTPS /api/v1 ── Django REST API
Customer Next.js ────────┘                         │
                                                  ├── PostgreSQL
                                                  ├── Redis
                                                  ├── Celery workers
                                                  ├── Celery scheduler
                                                  ├── Object storage
                                                  └── Payment / SMS providers
```

## Milestone 1 product rule

The first release is a complete Technician vertical slice:

```text
Discover service
  → confirm service location
  → choose Instant or Scheduled
  → confirm provider capacity
  → answer relevant scope questions
  → confirm recommended/editable duration
  → choose Auto Assign or a provider
  → review exact price
  → log in without losing progress
  → review payment
  → reserve + place booking
  → view status, OTP, timer and invoice
```

After Technician passes acceptance, the same fixed-service engine can be configured for Beauty, Home and Pet services. We should not implement all service groups simultaneously before the core engine is proven.

## Non-negotiable domain rules

1. The server calculates every price.
2. The customer sees the same fees everywhere.
3. Provider capacity is checked before payment. For Instant this means an eligible-pool existence
   check, not a specific Partner hold — see rule 4.
4. Scheduled creates a short-lived, Partner-specific capacity hold before payment. Instant reverses
   this: payment is captured first, and the Partner-specific hold is created immediately after by an
   automated assignment step. See
   [11-payment-first-instant-and-cancellation-policy.md](./11-payment-first-instant-and-cancellation-policy.md).
5. Payment webhooks are authoritative.
6. Booking creation and partner reservation are idempotent.
7. One visit has one booking, one slot, one partner, one OTP and one timer.
8. Two units of the same scope in one visit are line-item quantity, not two bookings.
9. Different visits or independently scheduled services are separate bookings.
10. Multiple bookings may share one order, but each retains its own operational lifecycle.
11. Background workers—not browser polling—drive dispatch, timeouts and retries.
12. Customer UI never claims “confirmed” unless the backend state supports it.
13. Fixed home services do not expose live-map tracking. No map, marker, position ping or location
    history exists for any fixed service. The customer sees a status timeline and an estimated arrival
    time as text, updated only by explicit Partner status transitions (ADR-030,
    [doc 11 §7](./11-payment-first-instant-and-cancellation-policy.md)).
14. The service timer begins only after successful start-OTP confirmation.
15. Overtime and extensions create auditable price revisions.
16. `Cart` and `CartItem` own every pre-checkout customer selection.
17. A `CheckoutSession` freezes the cart snapshot, quote and temporary capacity holds.
18. A `Booking` is created only from a successful checkout; it is never a draft/cart row.
19. No new Prisma model, query, migration or business write is permitted.
20. Partner arrival is an explicit audited action that notifies the customer; it is not a GPS event.
21. Start-OTP verification creates the server-timed work session and is the only timer start.

## Documentation index

1. [Current state and target comparison](./00-current-to-target.md)
2. [Repository and system architecture](./01-repository-and-architecture.md)
3. [Django domain and database design](./02-domain-and-database.md)
4. [Customer booking flow and UX](./03-customer-booking-flow.md)
5. [API, events and background jobs](./04-api-events-and-jobs.md)
6. [Delivery and migration roadmap](./05-delivery-roadmap.md)
7. [Quality, security and operations](./06-quality-security-and-operations.md)
8. [Decision register and implementation gates](./07-decision-register.md)
9. [Partner application audit and rebuild flow](./08-partner-audit-and-rebuild.md)
10. [Authoritative Milestone 1 resolution](./09-milestone-1-authoritative-resolution.md)
11. [Instant dispatch and decision resolution](./10-instant-dispatch-and-decision-resolution.md)
12. [Payment-first Instant dispatch and cancellation policy](./11-payment-first-instant-and-cancellation-policy.md)
13. [Codex and Claude implementation tasks](./tasks.md)

## Implementation gate

No implementation should begin until these decisions are accepted:

- Django is the only backend and migration owner.
- Technician is the first complete vertical slice.
- Customer remains Next.js; booking behaves like a React SPA within it.
- Cart, CheckoutSession and Booking remain separate domain concepts.
- Local PostgreSQL is used for development.
- Supabase PostgreSQL is used for staging/production.
- Existing development data may be reset only after deterministic seed data exists.
- The old flow remains available until the new vertical slice passes its acceptance suite.
- The Partner fixed-service work loop ships with the Technician slice; a customer booking is not complete until a real eligible partner can accept, perform and settle it.
