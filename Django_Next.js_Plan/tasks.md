# Vsolve Hub Build Tasks — Codex and Claude

**Status:** Architecture decisions locked; ready for vertical-capability execution  
**Scope:** Entire platform foundation, with Technician Customer + Partner as the first production-complete vertical slice  
**Primary rule:** Build in controlled waves; do not attempt every product domain simultaneously  
**Repository rule:** Preserve `.git`. Use separate branches/worktrees so both agents can work without overwriting each other.

## 1. Delivery strategy

The platform is built as one modular system, but released through vertical slices:

```text
Wave 0 — Repository, contracts, local infrastructure and quality gates
Wave 1 — Technician Customer + Partner + Operations end to end
Wave 2 — Beauty, Home and Pet fixed-service configuration
Wave 3 — Store/products, inventory and service parts
Wave 4 — Crew/workforce engine
Wave 5 — Growth, loyalty, referrals and advanced analytics
```

Wave 1 must be genuinely complete before Wave 2 begins. “Complete” includes Customer discovery, Partner fulfilment, Operations support, payments, invoice, earnings, payout, security, observability and recovery paths.

All work follows
[09-milestone-1-authoritative-resolution.md](./09-milestone-1-authoritative-resolution.md),
[10-instant-dispatch-and-decision-resolution.md](./10-instant-dispatch-and-decision-resolution.md), and
[11-payment-first-instant-and-cancellation-policy.md](./11-payment-first-instant-and-cancellation-policy.md).
Doc 11 takes precedence over docs 09/10 wherever it explicitly supersedes them (payment-before-assignment
for Instant, cancellation ladder, EN_ROUTE position display). These together supersede older conflicting
Vite, Instant dispatch, payment and tracking language.

## 2. Agent ownership

### Task List A — Codex: Platform backend and operational correctness

Codex owns:

```text
backend/**
infra/**
contracts/openapi/**
docs/adr/**
docs/runbooks/**
```

Codex does not edit:

```text
web/apps/**
web/packages/ui/**
web/packages/query/**
```

Primary responsibilities:

- Django/DRF modular monolith
- PostgreSQL schema and migrations
- Identity, permissions and sessions
- Domain services and state machines
- Pricing, tax and quote correctness
- Availability, capacity and dispatch concurrency
- Cart, checkout, order, booking and payment integrity
- Partner application, work lifecycle, ledger and payout
- Celery, Redis and transactional outbox
- OpenAPI source contract
- Backend security, performance, observability and tests

### Task List B — Claude: Product frontend and experience quality

Claude owns:

```text
web/apps/customer/**
web/apps/partner/**
web/apps/admin/**
web/packages/ui/**
web/packages/query/**
web/packages/api-client/**
web/packages/testing/**
contracts/proposals/**
```

Claude does not edit:

```text
backend/**
infra/**
contracts/openapi/**
```

Primary responsibilities:

- Customer Next.js application
- React booking workspace
- Partner Next.js application with a persistent React workspace
- Existing Admin Next.js application, product-labelled Operations
- Design system and accessible UI primitives
- Generated API-client consumption
- TanStack Query cache architecture
- Client state and login-resume experience
- Loading, empty, error and recovery states
- Responsive behaviour and accessibility
- Frontend unit, integration and Playwright tests
- Frontend performance budgets

## 3. How both agents work independently

### Branch and worktree isolation

Recommended branches:

```text
agent/codex-platform
agent/claude-experience
integration/platform
```

Recommended worktrees:

```text
C:\dev\vsolve-codex
C:\dev\vsolve-claude
```

Do not delete `.git`; Git worktrees, reviewable commits and safe integration depend on it.

### Contract boundary

The generated `contracts/openapi/v1.yaml` is the runtime communication boundary between backend
and frontend. `contracts/proposals/**` is the design-request lane.

Rules:

1. Django code is the OpenAPI source; Codex owns its publication and versions the generated contract.
2. Claude never hand-writes backend response shapes.
3. Claude generates `web/packages/api-client` from the published contract.
4. Generated files are never manually edited.
5. Breaking contract changes require an ADR and a migration note.
6. Every endpoint defines success, validation, authorization, conflict, expiry and retry responses.
7. Until an endpoint is implemented, Claude uses contract-derived fixtures and Mock Service Worker.
8. Backend contract tests and frontend mock tests use the same examples.
9. Claude may add a proposal containing the endpoint purpose, request/response examples, errors and
   consuming screen under `contracts/proposals/**`.
10. A proposal is not an API. Codex reviews it, implements the Django behaviour, regenerates
    `v1.yaml`, and records the decision before Claude integrates the real endpoint.

This allows Codex to build real backend behaviour while Claude builds the complete UI against stable mock contracts.

### Shared-file protocol

Neither agent changes root configuration, shared planning documents or the other agent’s paths without an integration task.

Changes to these files are serialized through `integration/platform`:

```text
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
.github/**
.env.example
README.md
AGENTS.md
```

## 4. Required skills

Skills provide procedural guidance. They do not replace design review, official documentation, tests or security verification.

### Already available — use throughout

| Skill | Owner | Use |
|---|---|---|
| `turborepo` / `turborepo-monorepo` | Both | Workspace boundaries, task pipelines, caching and CI |
| `typescript-expert` | Claude | Strict types, generated-client integration and clean component APIs |
| `nextjs-app-router-patterns` | Claude | Customer App Router, caching and server/client boundaries |
| `tanstack-query-best-practices` | Claude | Server-state cache, mutations, invalidation and recovery |
| `vercel-react-best-practices` | Claude | React/Next.js performance and rendering discipline |
| `vercel-composition-patterns` | Claude | Reusable components without Boolean-prop sprawl |
| `frontend-design` | Claude | Deliberate visual direction using Vsolve Hub branding |
| `ui-ux-pro-max` | Claude | Interaction, responsive layout, accessibility and design-system decisions |
| `performance` | Both | Measured frontend and API performance work |
| `webapp-testing` | Claude | Playwright E2E, screenshots and browser-console validation |

### Recommended additions — inspect before installation

These candidates have relevant provenance or meaningful adoption in the public skills ecosystem. Read each `SKILL.md` before allowing it to influence the repository.

| Skill | Why | Install command |
|---|---|---|
| `supabase-postgres-best-practices` | Production Supabase PostgreSQL indexing, query and operational guidance | `npx skills add supabase/agent-skills@supabase-postgres-best-practices` |
| `domain-modeling` | Explicit bounded contexts, invariants and ubiquitous language | `npx skills add mattpocock/skills@domain-modeling` |
| `improve-codebase-architecture` | Dependency direction, cohesion and architecture review | `npx skills add mattpocock/skills@improve-codebase-architecture` |
| `tdd` | Red/green/refactor discipline and behavioural acceptance | `npx skills add mattpocock/skills@tdd` |
| `code-review` | Independent correctness and maintainability review | `npx skills add mattpocock/skills@code-review` |
| `web-security-review` | OWASP-sourced security review playbook | `npx skills add owasp/secure-agent-playbook@web-security-review` |
| `git-guardrails-claude-code` | Prevent destructive or cross-scope Claude changes | `npx skills add mattpocock/skills@git-guardrails-claude-code` |
| `claude-handoff` | Structured handoff and integration notes | `npx skills add mattpocock/skills@claude-handoff` |

### Provisional backend candidate

`jeffallan/claude-skills@django-expert` currently has more adoption than the other Django-specific search results, but it is not an official Django Software Foundation skill. Audit its instructions and repository before installation:

```text
npx skills add jeffallan/claude-skills@django-expert
```

If it does not match this architecture, create a repository-owned `vsolve-django-platform` skill based on:

- Official Django documentation
- Official Django REST Framework documentation
- Official Celery documentation
- PostgreSQL documentation
- OWASP ASVS/API Security guidance
- The approved Vsolve Hub ADRs

### Skills that should not be generic substitutes

- Payments: use the selected payment provider’s official API/webhook documentation.
- Tax/GST: use reviewed business/legal requirements, not an AI skill.
- KYC: use the selected verification provider’s official requirements.
- Infrastructure: use the actual hosting/Supabase/Redis provider documentation.
- Security approval: require human review and automated scanning in addition to skills.

## 5. Task List A — Codex

### A0 — Repository and engineering foundation

- [ ] Preserve the legacy repository and create the Codex worktree.
- [ ] Add `backend/`, `infra/`, `contracts/openapi/`, `docs/adr/` and `docs/runbooks/`.
- [ ] Create root development commands without breaking the legacy app.
- [ ] Configure Python formatting, linting, typing and tests.
- [ ] Configure pre-commit checks.
- [ ] Provide `.env.example` with names only—no secrets.
- [ ] Create Docker Compose services for PostgreSQL and Redis.
- [ ] Add health checks and deterministic startup.

Acceptance:

- [ ] A new developer can start dependencies with one documented command.
- [ ] Backend lint, typecheck and tests run with one command.
- [ ] No credential is committed.
- [ ] Existing frontend still starts unchanged.

### A1 — Django architecture and API contract

- [ ] Scaffold Django settings for local, test, staging and production.
- [ ] Add DRF, OpenAPI generation and the standard error envelope.
- [ ] Implement request IDs, structured logs and health/readiness endpoints.
- [ ] Define service-layer and selector conventions.
- [ ] Define transaction and idempotency conventions.
- [ ] Publish the initial `v1` OpenAPI contract with examples.

Acceptance:

- [ ] Domain apps do not import frontend or Prisma code.
- [ ] Views remain thin; business transitions live in domain services.
- [ ] OpenAPI validates and generated TypeScript types compile.

### A2 — Identity, sessions and authorization

- [ ] Implement custom `User`, roles and Customer/Partner/Operations profiles.
- [ ] Implement hashed, expiring, single-use OTP challenges.
- [ ] Add phone/IP/device rate limits and resend cooldown.
- [ ] Implement revocable, rotated secure sessions.
- [ ] Implement CSRF protection and deny-by-default permissions.
- [ ] Add device/session listing and revocation.
- [ ] Ensure production never returns or logs OTP codes.
- [ ] Add dual-role switching, self-assignment exclusion and step-up recovery for phone/device risk.
- [ ] Add consent receipts, privacy requests and audited support-view authorization.

Acceptance:

- [ ] Authentication abuse and authorization tests pass.
- [ ] Suspended Partner sessions lose operational access.
- [ ] Customer login resumes an existing server-side cart.

### A3 — Catalog, locations and serviceability

- [x] Build Category, Service, ServiceVariant, question, media and policy models.
- [x] Add effective-dated service pricing configuration.
- [x] Build Address, PostalCode and ServiceArea models.
- [x] Add geocoding adapter with bounded timeout, cache and recoverable retry policy.
- [x] Require customer confirmation of normalized address.
- [x] Remove every hardcoded location fallback.
- [x] Model service-area operating hours/exceptions and timezone-aware midnight-spanning work.
- [x] Create deterministic Technician seed data.

Acceptance:

- [ ] Catalog “starts at” equals the minimum valid quote.
- [x] Every active Technician variant has explicit pricing and duration rules.
- [x] Geocoder failure produces a recoverable error, not fake location data.

### A4 — Partner application, eligibility and presence

- [ ] Implement PartnerApplication and explicit review states.
- [ ] Add versioned PartnerDocument and PartnerConsent.
- [ ] Implement normalized skills, services and service areas.
- [ ] Add weekly availability and date exceptions.
- [ ] Add online sessions, heartbeat and automatic presence expiry.
- [ ] Add Operations review/change-request/approve/suspend commands.
- [ ] Audit every transition.

Acceptance:

- [ ] Unapproved Partners cannot publish presence or receive work.
- [ ] Missing/stale coordinates never create availability.
- [ ] KYC replacement preserves prior versions and decisions.

### A5 — Pricing, cart and checkout

- [ ] Implement ServiceRate, FeeRule, TaxRule and immutable PriceQuote lines.
- [ ] Store money as integer paise.
- [ ] Implement Cart, CartItem and CartItemScope.
- [ ] Merge anonymous/login-resumed selections safely.
- [ ] Treat same-visit quantity as one CartItem scope quantity.
- [ ] Implement CheckoutSession snapshots and expiry.
- [ ] Reprice every mutation on the server.

Acceptance:

- [ ] Client-sent totals are ignored.
- [ ] Catalog, cart, checkout, invoice and refund use traceable quote lines.
- [ ] Duplicate add/checkout requests are idempotent.

### A6 — Availability, capacity and provider selection

- [ ] Implement duration-aware eligibility search.
- [ ] Support explicit Instant and Scheduled search.
- [ ] Search scheduled availability across the next seven days.
- [ ] Implement CapacityHold and PartnerReservation with separate service/occupied ranges.
- [ ] Include configured travel/service buffers in database overlap protection.
- [ ] Add PostgreSQL database-level overlap protection.
- [ ] Implement Auto Assign and ranked top-four eligible providers.
- [ ] Add preferred/past Partner signal without bypassing hard gates.
- [ ] For Scheduled, create a commitment hold directly from published eligible availability.
- [ ] For Instant, capture payment first, then run the acknowledge-and-assign loop; acknowledgement
      makes the Partner-specific hold firm (see
      [11-payment-first-instant-and-cancellation-policy.md](./11-payment-first-instant-and-cancellation-policy.md)).
- [ ] Implement the Instant pre-payment eligible-pool existence check (doc 11 §2 step 3): a fast
      lock-free existence query, never a reservation, run before the payment screen renders.
- [ ] Implement the acknowledge-and-assign loop (doc 11 §3): rank, acquire Redis lock, create
      `JobAssignment(ASSIGNED_PENDING_ACK)`, push, 20s ACK window, exclude tried Partners, re-rank and
      widen per doc 10 §4.3, 75s hard ceiling.
- [ ] Record `provider_accepted_at`, `client_acked_at` and `partner_acked_at` as three distinct signals;
      only `partner_acked_at` (an explicit human action) validates an assignment (doc 11 §3.3).
- [ ] Distinguish `UNACKED`, `RELEASED` and `RELEASED_AFTER_ACK` with their separate consequences
      (doc 11 §3.4); `RELEASED_AFTER_ACK` routes to the doc 09 §11 Partner-cancellation path.
- [ ] Reject late ACKs after reassignment via conditional update; never revive a superseded assignment.
- [ ] Add the booking-scoped assignment lock `instant:assign:{booking_id}` so a redelivered task, a
      "keep searching" retry or the stall watchdog cannot start a second concurrent loop (doc 11 §3.6).
- [ ] Make the ACK transaction update **both** the assignment row and the booking conditionally
      (`WHERE booking.status = 'PAID_UNASSIGNED'`); commit only if both affect exactly one row. This is
      the backstop that guarantees one paid booking commits exactly one Partner.
- [ ] Require a successful foreground channel challenge this online session before assignment
      (doc 10 §8.4).
- [ ] Enforce `max_concurrent_instant_per_customer` (1).
- [ ] Re-run ranking at assignment time; never trust the pre-check's pool as still valid.
- [ ] Implement bounded "keep searching" retries (doc 11 §4.1): max 2 additional attempts, each a new
      bounded assignment run; never an open-ended wait.

Acceptance:

- [ ] Two customers cannot reserve the same capacity.
- [ ] Assignment is strictly sequential: at most one Partner holds a live assignment per booking.
- [ ] Concurrent assignment loops for one booking commit exactly one Partner (doc 11 §3.6).
- [ ] A three-hour service reserves the full interval.
- [ ] Physically impossible back-to-back jobs fail because occupied travel ranges overlap.
- [ ] Known-empty eligible pool prevents payment (Instant pre-check fails closed before checkout).
- [ ] A Partner with a stale/unproven notification channel is never assigned.
- [ ] An assignment is valid only with an explicit human acknowledgement, never a device-level ack.
- [ ] The assignment loop always terminates within its ceiling; no unbounded search exists.

### A7 — Order, booking and payment

- [ ] Implement Order, OrderLine, Booking and immutable booking scope snapshots.
- [ ] Create one Booking per operational visit.
- [ ] Convert checkout exactly once with an idempotency key.
- [ ] Implement payment-provider adapter and sandbox implementation.
- [ ] Persist and verify webhook events before processing.
- [ ] Implement capture, failure, refund and reconciliation states.
- [ ] Handle multi-booking partial operational outcomes truthfully.
- [ ] Implement monotonic out-of-order webhook handling and provider reconciliation.
- [ ] Implement idempotent checkout/payment resume after redirect or network loss.
- [ ] Apply documented per-line paise rounding and explicit rounding adjustment.
- [ ] Add versioned cancellation quote, reschedule and address-amendment commands.
- [ ] Use high-entropy public references; never authorize by sequential/internal IDs.
- [ ] Add `Booking.PAID_UNASSIGNED` and implement every exit path from it (doc 11 §6) — no silent
      expiry is permitted from this state.
- [ ] Implement `JobAssignment` (replaces `JobOffer`) with the six states in doc 11 §9; no `JobOffer`
      table ships.
- [ ] Implement the post-payment coordination-failure hold (doc 11 §6.2): a captured booking is held and
      retried for the retry window, never fail-closed into an immediate refund.
- [ ] Implement the chargeback-after-assignment path (doc 11 §6.1): never auto-cancel attended work; pay
      the Partner from platform funds; pursue the receivable via account hold.
- [ ] Implement `free_reschedule_limit` and treat a reschedule inside a no-refund band as
      cancellation + rebook, so the fee ladder cannot be reset indefinitely (doc 11 §5.4).
- [ ] Compute a rescheduled booking's cancellation band from the new slot time.
- [ ] Add `Booking.payment_mode` enum with `PAY_NOW` only populated; `PAY_LATER` reserved and unused.
- [ ] Populate `CancellationPolicyTier` bands for Instant and Scheduled (doc 11 §5.1, §5.3).
- [ ] Implement Partner compensation as a capped dispatch fee (`partner_compensation_cap_paise`), not a
      percentage of job value, and enforce `fee <= booking_total` (doc 11 §5.2, §5.4).
- [ ] Implement the `NO_PARTNER_CONFIRMED` post-payment refund path with recovery ordering:
      reschedule offer first, bounded retry second, refund last (doc 11 §4).
- [ ] Route failed refunds to the Operations maker-checker queue; never present an unconfirmed refund
      as completed.
- [ ] Implement the chargeback/reversal-after-assignment incident path (doc 11 §6 final row).

Acceptance:

- [ ] Browser redirect is never payment authority.
- [ ] Duplicate submits/webhooks do not duplicate orders or charges.
- [ ] Known capacity failure never reaches payment.
- [ ] Financial state can be reconciled after process failure.
- [ ] A `PAID_UNASSIGNED` booking cannot expire silently; every path ends in assignment, reschedule or
      an initiated refund.
- [ ] Post-payment assignment failure never displays "you have not been charged".
- [ ] A cancellation fee can never exceed the booking total, and compensation never exceeds the fee.
- [ ] Refund + fee reconcile exactly to the captured amount; no paise are created or lost.
- [ ] Supply-side and platform-side failures are never attributed to the customer (doc 10 §12.1).
- [ ] Redis loss after capture holds and retries the booking; it never triggers an immediate refund.
- [ ] The fee ladder cannot be reset indefinitely by repeated reschedules.
- [ ] Every case in doc 11 §11's edge-case register has a test.

### A8 — Partner work lifecycle

- [ ] Implement assignment, en-route, explicit Arrived command and ownership checks.
- [ ] Publish customer notification from the Arrived transaction. Collect **no** location data for
      fulfilment: no position pings, no stream, no history (ADR-013/ADR-030). There is no
      `PartnerPositionPing` model.
- [ ] Set `Booking.estimated_arrival` once at assignment; update it only on explicit Partner status
      transitions or an Operations correction — never infer, extrapolate or animate it (doc 11 §7).
- [ ] Implement the customer-unavailable flow (doc 11 §5.5): wait window, recorded contact attempt,
      `WorkEvidence` requirement, band E visit fee. Never charge a visit fee on an unevidenced claim.
- [ ] Treat OTP refusal/absence as customer-unavailable after the same wait window (doc 11 edge case 33).
- [ ] Implement start OTP attempt limits and backend timestamp.
- [ ] Create persisted WorkTask and WorkEvidence requirements.
- [ ] Implement customer-approved parts requests with a paid PriceRevision before authorization.
- [ ] Implement extension request, capacity recheck, quote revision, payment and approval.
- [ ] Derive countdown/overtime from backend timestamps.
- [ ] Implement completion with exactly-once financial effects.
- [ ] Implement completed-booking review eligibility, edit window, moderated reply and cold-start
  ranking prior.
- [ ] Implement release/reassignment through outbox + Celery.
- [ ] Implement the post-ACK stall watchdog (doc 11 §10): Celery-owned departure and arrival grace
      timers, one bounded Partner nudge, then Partner-side release and reassignment.
- [ ] Attribute stall/no-show outcomes to Partner or platform, never to the customer; apply the
      capability consequence (Instant-pool removal), never a rating or ranking penalty.

Acceptance:

- [ ] Browsers do not drive reassignment.
- [ ] An assigned Partner who never departs is detected by the server, not by a customer complaint.
- [ ] A stalled assignment never leaves a paid customer in a silently-correct-looking state.
- [ ] No-show recovery never charges the customer a cancellation fee.
- [ ] Refresh cannot reset timer or work proof.
- [ ] Completion fails when mandatory evidence is missing.
- [ ] Overtime never silently charges the customer.
- [ ] Extension cannot overlap the Partner's next occupied reservation.
- [ ] Abandoned/overtime sessions escalate without falsely auto-completing physical work.

### A9 — Earnings, ledger, payout and invoice

- [ ] Implement immutable PartnerLedgerEntry.
- [ ] Separate estimated, pending, available, reserved, paid and reversed amounts.
- [ ] Implement verified/versioned payout accounts.
- [ ] Lock and reserve ledger entries before payout.
- [ ] Use provider idempotency and webhook/reconciliation.
- [ ] Generate tax-aware invoices with the Vsolve Hub brand asset.
- [ ] Add supplier/tax-liable-party, place-of-supply, statutory-deduction and document-series models.
- [ ] Add credit notes, negative recoverable Partner balance and maker-checker adjustments.
- [ ] Require cooling period, re-verification and old-channel notification for payout account change.
- [ ] Prevent development payout/payment adapters in production settings.

Acceptance:

- [ ] Assignment card shows estimated Partner net—not customer gross.
- [ ] Two withdrawals cannot pay one earning twice.
- [ ] Gateway success plus database ambiguity is recoverable.
- [ ] Every financial change has an immutable audit path.

### A10 — Events, notifications and operations

- [ ] Implement transactional OutboxEvent.
- [ ] Configure Celery workers and scheduler.
- [ ] Add reservation/assignment-round/session expiry tasks.
- [ ] Add SMS/email/push adapters with delivery records and retries.
- [ ] Add Web Push subscription/readiness for Instant Partner assignment notifications.
- [ ] Add the three-stage delivery model (provider_accepted / client_acked / outcome) and the three
      failure classes from doc 10 §7.2–§7.3; generic 4xx handling is forbidden.
- [ ] Add DLT sender/header/template registry and configurable OTP fallback adapters.
- [ ] Add service/region, payment and payout kill switches with audited feature flags.
- [ ] Add Customer/Partner block, safety report, masked-contact and SOS workflows.
- [ ] Implement Operations APIs for catalog, Partner review, booking support and financial reconciliation.
- [ ] Add manual recovery commands with permission and audit.
- [ ] Instrument the residual-risk metrics from doc 10 §17 and doc 11 §11 with their alert thresholds —
      an accepted trade-off without an owning metric is a defect, not a decision.
- [ ] Give Operations a `PAID_UNASSIGNED` queue view: every booking with money captured and no Partner,
      visible from the first moment it exists.

Acceptance:

- [ ] Closing all browsers does not stop workflows.
- [ ] Tasks are retry-safe and idempotent.
- [ ] Operations can understand and recover stuck states.
- [ ] Every accepted trade-off in docs 10 §17 and 11 §11 has a live metric and threshold.

### A11 — Backend production gate

- [ ] Unit tests for domain rules.
- [ ] PostgreSQL integration and concurrency tests.
- [ ] API contract tests.
- [ ] Payment/reconciliation failure tests.
- [ ] Authorization matrix tests.
- [ ] Query-count and slow-query tests for critical endpoints.
- [ ] Security review and dependency scan.
- [ ] Backup, restore and migration rehearsal.
- [ ] Qualified Indian CA/legal sign-off for tax, invoice, credit-note and settlement configuration.
- [ ] Privacy retention/anonymization and data-principal request rehearsal.
- [ ] Load gates from the authoritative Milestone 1 resolution.
- [ ] Runbooks for payment, OTP, geocoder, Redis/Celery and database incidents.

Acceptance:

- [ ] No critical/high security finding remains unexplained.
- [ ] Migration from zero and rollback rehearsal pass.
- [ ] Critical endpoint latency budgets pass with production-like seed volume.

## 6. Task List B — Claude

### B0 — Frontend foundation and contract mocks

- [ ] Create Claude worktree without modifying Codex-owned paths.
- [ ] Establish customer, partner and operations application boundaries.
- [ ] Configure strict TypeScript and shared lint/test commands.
- [ ] Generate the API client from `contracts/openapi/v1.yaml`.
- [ ] Submit missing use-case proposals under `contracts/proposals/**`; never invent runtime DTOs.
- [ ] Configure TanStack Query keys, retry policy and error mapping.
- [ ] Configure Mock Service Worker from contract examples.
- [ ] Add frontend error boundary and application-level recovery.
- [ ] Add cross-tab logout/checkout coordination and server-time offset utility.

Acceptance:

- [ ] No application imports database or Prisma code.
- [ ] No handwritten duplicate API DTOs exist.
- [ ] All screens can run against contract mocks.

### B1 — Vsolve Hub design system

- [ ] Inventory approved logo, colors, typography and icons.
- [ ] Define semantic tokens for background, surface, text, brand, success, warning and danger.
- [ ] Replace inaccessible blue/loading combinations.
- [ ] Build accessible Button, Input, Select, Dialog, Sheet, Card, Stepper, Toast, Skeleton and EmptyState.
- [ ] Standardize focus, loading, pressed, disabled, success and error states.
- [ ] Add Storybook or equivalent isolated component documentation.
- [ ] Add visual regression coverage for primitives.
- [ ] Add localization/message-key plumbing; English is the initial translation.
- [ ] Keep Milestone 1 light-theme only and test long content/large totals/200% text zoom.

Acceptance:

- [ ] Normal text meets WCAG 4.5:1 contrast.
- [ ] Touch targets are at least 44×44px.
- [ ] Native/custom selects remain readable in every state.
- [ ] No emoji is used as a structural icon.

### B2 — Customer public application

- [ ] Build SEO-ready home, category, service-list and service-detail pages.
- [ ] Use Server Components only where they improve public delivery.
- [ ] Use stable navigation shell and responsive address control.
- [ ] Display authoritative “starts at” and recommended duration.
- [ ] Add honest loading, unavailable and recoverable error states.
- [ ] Preserve Vsolve Hub branding without generic template appearance.

Acceptance:

- [ ] Service cards and detail pages use API prices.
- [ ] Navigation is responsive and avoids unnecessary full-page remounts.
- [ ] Core public pages meet performance and accessibility budgets.

### B3 — Customer booking workspace

- [ ] Build one persistent React workspace for the booking journey.
- [ ] Ask location/serviceability early.
- [ ] Require explicit Instant or Scheduled selection.
- [ ] Show the next seven days only for Scheduled.
- [ ] For one service, display the slot card directly.
- [ ] For multiple services, configure each CartItem separately.
- [ ] Build scope, quantity and recommended/editable duration.
- [ ] Build the two distinct stage sequences (doc 10 §2.1, doc 11 §2) — they are not one shared flow:
      - [ ] **Scheduled:** slot → Auto Assign or a customer-selected eligible Partner (top four plus
            Auto Assign) → hold → quote → login → pay.
      - [ ] **Instant:** no provider-selection step at any point → login → pool pre-check → quote →
            pay → ASSIGNING → confirmed.
- [ ] Require a geocoded serviceable address before the Instant quote/payment screen; it is not
      deferrable for Instant (doc 11 §2.1).
- [ ] Enforce one Instant item per checkout; never mix Instant and Scheduled items (doc 10 §14), with
      copy: "Book this now — your other items stay in your cart."
- [ ] Maintain a stable, itemized price summary.

Acceptance:

- [ ] No slot is automatically selected.
- [ ] No unavailable slot allows progression.
- [ ] Duration selection is readable and keyboard accessible.
- [ ] UI never fabricates availability or price.
- [ ] No provider-selection UI is reachable in the Instant flow.
- [ ] Instant cannot reach checkout without a geocoded serviceable address.

### B4 — Authentication and cart continuity

- [ ] Show “Log in to add items” before protected cart mutation.
- [ ] Preserve the exact pending action through OTP login.
- [ ] Automatically resume and add the item after successful login.
- [ ] Build real Cart/CartItem UI terminology.
- [ ] Treat quantity as same-visit scope quantity.
- [ ] Avoid a visible cart page when a single-service direct checkout is clearer.
- [ ] Handle merge/conflict/expired-cart responses explicitly.

Acceptance:

- [ ] User never clicks “Confirm and continue” twice after login.
- [ ] Refresh/back preserves safe workspace state.
- [ ] Client never treats local state as authoritative cart success.

### B5 — Checkout and payment experience

- [ ] Build detailed checkout/payment page.
- [ ] Display confirmed address with edit action.
- [ ] Display explicit slot(s) and selected assignment preference.
- [ ] Display service, platform fee, tax and final total consistently.
- [ ] Explain cancellation, reschedule, refund and extension policies.
- [ ] Display the full graduated cancellation ladder (doc 11 §5.1/§5.3) **before** payment, with the
      concrete fee amounts for this booking — never disclosed only after money is taken.
- [ ] For Instant, state plainly that payment is taken before a professional is assigned, and what
      happens if none is found (reschedule options, or refund in 3–5 business days).
- [ ] Integrate provider checkout without trusting browser success.
- [ ] Handle hold expiry, payment retry and ambiguous processing states.
- [ ] Build idempotent checkout-resume UI for lost redirects, refresh and reconnect.
- [ ] Do not display COD/Pay after service in Milestone 1. Do not render a Pay Later toggle at all —
      a visible option that does nothing is worse than no option (doc 11 §8).

Acceptance:

- [ ] Cart and checkout never disagree about fees.
- [ ] **Scheduled:** payment cannot start without a valid capacity hold.
- [ ] **Instant:** payment cannot start without a passing eligible-pool pre-check; no Partner-specific
      hold exists at payment time and the UI must not imply one does.
- [ ] Cancellation fees are visible before the pay action, not after.
- [ ] Double-clicking does not create duplicate payment action.

### B6 — Customer post-booking

- [ ] Build confirmation from authoritative booking/order state.
- [ ] Build the post-payment ASSIGNING state ("Finding your professional…") bounded by the server
      deadline, driven by backend state and never by a browser timer.
- [ ] Build the `NO_PARTNER_CONFIRMED` recovery screen: reschedule slots first, bounded "keep
      searching" second, refund last — with the real refund timeline, never "you have not been charged".
- [ ] Build honest refund states: initiated, in progress and failed-under-review are distinct; never
      show an unconfirmed refund as completed.
- [ ] Build the fixed-service status timeline with estimated arrival as **text** — no map, marker or
      moving dot for Instant or Scheduled (ADR-013/ADR-030, doc 11 §7).
- [ ] When the estimate passes with no arrival, degrade to "Running late — we're checking with
      <Partner>"; never keep counting or silently re-project a new time.
- [ ] Show “Your professional has arrived” only from the backend Arrived event/booking state.
- [ ] Display Partner details only when policy allows.
- [ ] Display start OTP securely.
- [ ] Display server-reconciled countdown after OTP verification.
- [ ] Display overtime and extension approval clearly.
- [ ] Collect extension/parts revision payment before showing it as approved.
- [ ] Build detailed branded invoice view/download.
- [ ] Fill navbar-to-content space with useful booking context, not decoration.

Acceptance:

- [ ] “Confirmed” appears only for a confirmed backend state.
- [ ] Timer survives refresh/backgrounding.
- [ ] Provider failure is represented truthfully with recovery state.

### B7 — Public Partner acquisition

- [ ] Build SEO-ready Partner landing pages in Customer Next.js.
- [ ] Explain eligibility, process, required documents and earning model.
- [ ] Route authenticated application into the private Partner app.
- [ ] Keep marketing content separate from operations UI.

Acceptance:

- [ ] Public Partner pages are shareable, responsive and accessible.
- [ ] No private Partner data is rendered in public routes.

### B8 — Partner application workspace

- [ ] Build a mobile-first persistent workspace in the existing Partner Next.js application.
- [ ] Build OTP authentication and session recovery.
- [ ] Build profile, KYC upload, skills, service areas, availability, payout/tax and consent steps.
- [ ] Build draft autosave through API mutations.
- [ ] Build Submitted, Under Review, Changes Required, Approved and Suspended states.
- [ ] Preserve document upload progress and recover errors.

Acceptance:

- [ ] UI never bypasses eligibility state.
- [ ] Changes-required feedback maps to exact fields/documents.
- [ ] Private documents use signed URLs and are never cached publicly.

### B9 — Partner fulfilment workspace

- [ ] Build Home, Jobs, Earnings, Alerts and Profile navigation.
- [ ] Build weekly availability and exception editor.
- [ ] Build online/offline/presence freshness UI.
- [ ] Gate Instant readiness on fresh presence, a valid Web Push subscription, and a successful
      foreground channel challenge this session; state which gate is unmet (doc 10 §8.2, §8.4).
- [ ] Build the assigned-job card with net earning and a single primary **Acknowledge** action
      ("Confirm you're on it") plus a secondary Release; never Accept/Decline framing (doc 11 §3).
- [ ] Show exact address and customer contact only from acknowledgement onward (doc 11 §2 step 9).
- [ ] Build assignment, route/status, arrival and OTP screens.
- [ ] Build the Release flow with a reason, and a distinct post-ACK release path that states it is a
      cancellation with a policy consequence (doc 11 §3.4).
- [ ] Build the customer-unavailable action with the wait window and evidence capture (doc 11 §5.5).
- [ ] Render TENTATIVE holds with a server-derived expiry, distinct from CONFIRMED work (doc 10 §16.2).
- [ ] Make Arrived an explicit idempotent action. Send **no** location data at any point.
- [ ] Build persisted work checklist and evidence uploads.
- [ ] Build parts and extension request UI.
- [ ] Build timer/overtime/completion experience.
- [ ] Build earnings ledger, payout account and payout-status screens.

Acceptance:

- [ ] No fake jobs, ratings, surge, distance or earnings exist.
- [ ] Full dashboard refresh is not used for one job-state update.
- [ ] Expired job cards cannot appear actionable.
- [ ] A Partner is never shown as Instant-ready when any eligibility gate is unmet.
- [ ] No customer address or contact detail is visible before assignment.
- [ ] Partner sees estimated and final net earnings distinctly.

### B10 — Admin/Operations application

- [ ] Evolve `web/apps/admin` into the role-based Operations shell; do not create a second app.
- [ ] Build Partner application/KYC review.
- [ ] Build catalog, rate, duration, fee and service-area management.
- [ ] Build booking/assignment support timeline.
- [ ] Build payment/refund/payout reconciliation screens.
- [ ] Build notification delivery and audit-event views.
- [ ] Build cancellation/reschedule/reassignment, stuck-session, safety and kill-switch recovery.
- [ ] Require confirmation and reason for high-impact actions.

Acceptance:

- [ ] Unauthorized roles never see or invoke protected actions.
- [ ] Every mutation shows outcome and audit reference.
- [ ] Sensitive KYC/financial values are masked by default.

### B11 — Frontend production gate

- [ ] Component and accessibility tests.
- [ ] Query/mutation/error integration tests.
- [ ] Playwright Customer, Partner and Operations E2E.
- [ ] Mobile 375/768 and desktop 1024/1440 validation.
- [ ] Keyboard-only and screen-reader checks.
- [ ] Visual regression checks.
- [ ] Bundle analysis and route performance budgets.
- [ ] Slow-network, offline/reconnect and API-failure tests.
- [ ] Test HEIC/large resumable uploads, OTP paste/autocomplete and permission-denied Push states.
- [ ] Browser-console must be clean in acceptance flows.

Acceptance:

- [ ] No horizontal overflow or fixed-control content overlap.
- [ ] No inaccessible loading or select-option text.
- [ ] Core Web Vitals and bundle budgets pass agreed thresholds.
- [ ] Every important mutation has visible pending, success and failure feedback.

## 7. Integration tasks

Integration is performed after each bounded milestone, not after both agents finish everything.

### I1 — Foundation integration

- [ ] Merge repository structure and shared commands.
- [ ] Validate OpenAPI generation and frontend-client generation.
- [ ] Run backend and mock frontend in one local environment.

### I2 — Technician happy path

- [ ] Customer discovers and books a Technician.
- [ ] Eligible Partner accepts/performs the job.
- [ ] Operations can inspect the complete timeline.
- [ ] Invoice, earning and payout records reconcile.

### I3 — Failure and concurrency paths

- [ ] No availability.
- [ ] Hold expires during checkout.
- [ ] Duplicate payment submission/webhook.
- [ ] Two Partners accept concurrently.
- [ ] Partner releases/cancels.
- [ ] OTP abuse/expiry.
- [ ] Extension races completion.
- [ ] Extension overlaps next travel-aware reservation.
- [ ] Out-of-order payment webhook and lost payment redirect.
- [ ] Arrived notification retries without duplicate state.
- [ ] Partner backgrounded without Web Push cannot claim Instant readiness.
- [ ] Long/midnight-spanning work and client clock skew.
- [ ] Duplicate payout request.
- [ ] Redis/Celery/provider outage and recovery.

### I4 — Production-readiness review

- [ ] Independent Codex review of Claude-owned frontend.
- [ ] Independent Claude review of Codex-owned API contract and user-visible behaviour.
- [ ] Security and privacy review.
- [ ] Accessibility review.
- [ ] Performance/load review.
- [ ] Migration, backup and restore rehearsal.
- [ ] Product acceptance sign-off.

## 8. Clean-code requirements

Both task lists follow these rules:

- Domain language is explicit and consistent.
- Files have one clear responsibility.
- Business rules are not duplicated between client and server.
- Functions remain small enough to understand and test.
- Names explain intent; comments explain non-obvious reasons.
- No `any`, silent exception, swallowed promise or unexplained type suppression.
- No hidden fallback price, address, status, provider or success state.
- No premature abstraction; extract only proven repetition or domain concepts.
- External providers sit behind interfaces/adapters.
- Time, randomness and provider calls are injectable in tests.
- State transitions are explicit, authorized, idempotent and audited.
- Financial values use integer paise and immutable history.
- Database constraints protect invariants in addition to application validation.
- Queries are bounded, indexed and checked for N+1 behaviour.
- Logs contain references and trace IDs, never OTPs, tokens or complete KYC/payment payloads.
- Every bug fix adds a regression test.
- Generated files are generated, never manually patched.

## 9. Definition of done

A task is complete only when:

1. Implementation matches an approved contract/ADR.
2. Unit and relevant integration tests pass.
3. Static analysis, formatting and type checks pass.
4. Authorization, validation, error and retry paths are covered.
5. Observability exists for operationally important behaviour.
6. Accessibility applies to every changed UI.
7. Performance impact is measured where relevant.
8. Documentation and examples are updated.
9. No secrets, demo data or debug bypasses can reach production.
10. The other agent can consume the result without reading implementation internals.

## 10. First execution sequence

Start both agents after worktrees exist:

```text
Codex:
  A0 → A1 → publish initial OpenAPI → A2/A3

Claude:
  B0 → B1 → B2 and booking workspace against mocks

First integration:
  I1

Then:
  Codex A4–A9
  Claude B3–B10 against versioned contracts

Continuous:
  A11 + B11 + I2/I3 after each vertical capability
```

The initial OpenAPI publication is the only early synchronization point. After it, both agents work independently inside their ownership boundaries and integrate through reviewed contracts.
