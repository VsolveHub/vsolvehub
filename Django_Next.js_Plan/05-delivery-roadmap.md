# Delivery and Migration Roadmap

## Strategy

Use a vertical-slice strangler migration:

1. Keep current applications running for reference.
2. Build Django and local infrastructure beside them.
3. Implement one complete Technician service.
4. Route only the new Technician flow to Django.
5. Pass functional, financial, race-condition and UX acceptance.
6. Reset/cut over development data after approval.
7. Expand through configuration, not duplicated flows.

## Phase 0 — Freeze decisions and baseline

Deliverables:

- Approve this architecture plan.
- Freeze Milestone 1 scope.
- Select payment and SMS sandbox providers.
- Confirm Supabase production/staging regions.
- Inventory reusable assets/components.
- Record existing production-like flows and data.
- Measure current route, API and query latency.
- Export current development database for reference.

Acceptance:

- Decision register signed off.
- No unresolved ownership between Django, Next.js and Supabase.
- Technician happy path and failure paths agreed.

## Phase 1 — Local platform foundation

Deliverables:

- `backend/` Django project
- Django settings by environment
- Local Docker PostgreSQL and Redis
- Django REST Framework
- Celery worker and scheduler
- Health/readiness endpoints
- Structured logging and trace IDs
- OpenAPI generation
- Frontend generated API-client package
- CI for backend and frontend checks

Acceptance:

- One command starts database, Redis, API, worker and web locally.
- API health verifies database and Redis separately.
- Test database is isolated.
- OpenAPI client generation is deterministic.

## Phase 2 — Identity, catalog and location

Deliverables:

- Unified user/role model
- Customer OTP sandbox flow
- Partner and operations roles
- Partner application, KYC document versions and versioned consent
- Catalog/service/variant configuration
- Explicit Technician rates
- Address CRUD
- Reverse-geocode adapter
- Serviceability check
- Seed data

Acceptance:

- Catalog card “starts at” equals the quote engine minimum.
- Every active Technician service has an explicit configuration.
- No hidden/default address is created.
- Auth rate-limit and expiry tests pass.

## Phase 3 — Pricing and availability

Deliverables:

- Quote engine
- Fee and GST rules
- Provider schedule model
- Partner weekly availability and exception management
- Expiring online presence with heartbeat
- Duration-aware availability
- Database overlap protection
- Instant and scheduled search
- Capacity hold and expiry
- Top providers and preferred provider query

Acceptance:

- Concurrent requests cannot reserve one partner twice.
- A three-hour job blocks the whole interval.
- Expired holds are safely released.
- Cart/review/invoice all consume one quote snapshot.
- No availability means the customer cannot proceed.

## Phase 4 — Customer Technician booking workspace

Deliverables:

- Single `/book/[service-slug]` workspace
- Address/serviceability stage
- Explicit Instant/Scheduled selection
- Seven-day scheduled strip
- Scope/quantity questions
- Duration selection
- Provider selection/auto assign — **Scheduled only**; Instant has no provider step (ADR-029)
- Sticky itemized quote
- Real Cart/CartItem persistence
- Pending add-to-cart action through login
- Login/resume without second confirmation
- Dedicated payment review stage

Acceptance:

- No slot is auto-selected.
- Single-service flow displays the slot card directly.
- Same-service quantity produces one visit.
- Back/refresh/login preserve safe draft state.
- All async buttons provide loading/error recovery.
- Keyboard and mobile accessibility checks pass.

## Phase 5 — Order, payment and confirmation

Deliverables:

- Pending order creation
- Idempotent payment attempt
- Sandbox gateway adapter
- Webhook persistence and processing
- Hold conversion on payment (Scheduled); post-payment acknowledge-and-assign (Instant, ADR-028/029)
- `PAID_UNASSIGNED` state with every exit path implemented (doc 11 §6)
- Post-ACK stall/no-show watchdog and reassignment (doc 11 §10)
- Graduated cancellation ladder, visit fee and refund paths (doc 11 §5)
- Estimated arrival as text only — no map or marker (ADR-030, doc 11 §7)
- Failure/expiry release
- Honest confirmation states
- Invoice data contract with Vsolve Hub logo

Acceptance:

- Repeated payment submission creates one attempt/order.
- Duplicate webhook is harmless.
- Failed capacity revalidation prevents payment initiation.
- Failed payment does not create a confirmed booking.
- Customer never sees success without authoritative confirmation.

For legacy Milestone 1 where live Razorpay is deferred, use a contract-compatible fake/sandbox gateway. Do not hardcode “paid” directly into booking endpoints.

## Phase 6 — Partner actions and post-booking

Deliverables:

- Mobile-first Partner operations console
- Application/approval eligibility gate
- Weekly availability and instant online-presence controls
- Real assigned-job cards with acknowledge/release (ADR-029; not accept/decline)
- Partner assignment and job-detail views
- Customer-unavailable action with wait window and evidence (doc 11 §5.5)
- Arrival/status actions
- Start OTP verification
- Persisted work checklist and required evidence
- Customer-approved parts requests
- Server-derived countdown
- Overtime state
- Extension request/approval and price revision
- Completion
- Estimated net earning and immutable earnings ledger
- Payout account and idempotent payout workflow
- Cancellation/reschedule policy
- Review and invoice
- Fixed-service status timeline without live map

Acceptance:

- The Partner dashboard contains no fabricated jobs, ratings, distances or alerts.
- Missing partner coordinates never fall back to a hardcoded city.
- Customer availability uses the same partner schedule and presence state shown in the Partner app.
- Instant presence expires when heartbeat stops.
- Expired assignment cards cannot be acknowledged; concurrent transitions have exactly one winner.
- A late acknowledgement never revives a reassigned job.
- Timer starts only after OTP confirmation.
- Refresh/backgrounding does not reset timer.
- Required tasks/evidence survive refresh and are enforced before completion.
- Overtime is visible and not silently charged.
- Approved extension changes the deadline and financial history.
- Assignment cards distinguish customer price from estimated partner net earning.
- Concurrent withdrawal requests cannot pay one earning twice.
- Browser closure does not stop backend workflow.

## Phase 7 — Multiple services and order grouping

Deliverables:

- Multi-service cart
- One booking per independent visit
- One order containing multiple bookings
- Capacity hold for every Scheduled booking before payment (Instant is single-item and payment-first
  per ADR-028; it is never part of a grouped multi-booking checkout)
- Per-booking status and cancellation result
- Clear all-or-nothing pre-payment capacity gate for grouped Scheduled bookings

Acceptance:

- Two quantities in one visit use one provider.
- Independently scheduled services use separate providers/slots.
- No partial hidden success.
- Order summary explains every booking state.

## Phase 8 — Cutover and development reset

Preconditions:

- Technician E2E suite passes.
- Financial reconciliation tests pass.
- Concurrency tests pass.
- Seeds reproduce the required demo.
- Current database export exists.
- User explicitly approves destructive reset.

Actions:

1. Stop writes to legacy Technician endpoints.
2. Reset the development database to Django schema.
3. Apply Django migrations.
4. Load deterministic seeds.
5. Point customer/partner/operations apps to Django.
6. Run smoke and E2E suites.
7. Remove or archive replaced Prisma/Next API paths.

Rollback:

- Restore exported development database.
- Re-enable legacy feature flag.
- Do not mix writes from Prisma and Django during rollback.

## Expansion after Technician

Order:

1. Other Technician variants
2. Beauty fixed services
3. Home fixed services
4. Pet fixed services
5. Workforce/crew engine
6. Quote/milestone project engine
7. Rentals/accommodation/jobs

New fixed services should be configuration and seed work unless they introduce a genuinely different operational lifecycle.

## Definition of complete for each phase

A phase is complete only when:

- Code and migration reviewed
- Unit/integration tests pass
- Contract client regenerated
- E2E happy and failure paths pass
- Accessibility checks pass for UI work
- Logs/metrics exist for critical actions
- Documentation/runbook updated
- UAT scenario demonstrated
- No unresolved critical/high defects
