# Partner Application Audit and Rebuild Flow

## Scope and evidence

This audit covers `C:\dev\vsolve\web\apps\partner` and the shared database/workflow code it calls.

Static inventory at the time of review:

- 156 Partner application files
- 33 route pages
- 5 Partner-owned API routes
- 12 server-action files
- 27 Partner files with direct Prisma usage
- Next.js 15, React 19, TanStack Query and Supabase Storage

This is a code-path audit, not a production load or penetration test. Runtime, accessibility and device testing remain acceptance work.

## Current Partner journey

```text
Partner marketing / become a partner
  → phone OTP
  → create or find Partner record
  → choose trade/service
  → provider-type onboarding
  → upload identity/KYC documents
  → accept terms and submit
  → wait for PENDING/REJECTED/ACTIVE gate
  → go online
  → poll for offers
  → accept or decline
  → travel and mark arrived
  → verify customer start OTP
  → run local checklist/timer
  → request parts when required
  → complete
  → view earnings
  → withdraw
```

Onboarding differs by provider type:

- Captain/Cleaner: identity → skills/location → terms → submit
- Driver: identity → vehicle → documents → terms → submit
- Crew: a separate invite/attendance/settlement flow

## What is worth retaining

These concepts are directionally correct and should be carried into the Django implementation after tests:

- OTP values are hashed and have expiry/attempt verification.
- KYC media uses signed direct uploads and upload ownership checks.
- Sensitive identity and payout values use encryption at rest.
- Work actions check booking ownership and expected status.
- Individual-service start OTP has an attempt cap.
- Timer presentation is based on backend timestamps.
- Customer-approved platform parts are distinct from arbitrary partner charges.
- Completion uses transactional protection against duplicate earning creation.
- Earnings and payout records are separate concepts.

These are useful building blocks, not proof that the whole flow is production-ready.

## Critical current-state findings

### 1. Partner business logic is embedded in Next.js

Authentication, onboarding, offers, work actions, availability and payouts write directly through Prisma or server actions. Customer and Partner therefore have separate application-layer owners for one booking lifecycle.

Why it matters:

- State transitions can disagree across applications.
- The frontend deployment becomes a business backend.
- Transactions cannot reliably span dispatch, payment and Partner actions.
- Frontend navigation and deployment remain coupled to server-side business execution.

Target:

- Django owns all Partner commands and reads.
- Partner UI consumes generated OpenAPI clients.
- No frontend application has database credentials or Prisma access.

### 2. Reassignment depends on the Customer application

A Partner release calls an internal Customer-app endpoint for reassignment. If it fails, the system can rely on customer tracking-page polling to drive recovery.

Why it matters:

- Closing the customer's browser can change operational reliability.
- Partner and Customer deployments are tightly coupled.
- A transient frontend failure can strand a paid booking.

Target:

- Django changes assignment state transactionally.
- A transactional outbox records reassignment work.
- Celery owns retries, offer expiry and escalation.
- Browsers only display state; they never drive dispatch.

### 3. Missing location becomes hardcoded Hyderabad

Going online can seed a fallback coordinate when the Partner has no location.

Why it matters:

- False distance and availability results are presented as real.
- A customer can pay based on capacity that does not exist nearby.
- Operational and safety decisions use fabricated location data.

Target:

- Going online fails clearly until a valid location or approved service area exists.
- No fallback coordinates exist.
- Location freshness and precision are recorded where instant dispatch needs them.

### 4. Online status is only a Boolean

The current action primarily toggles online/offline. The schema has schedule concepts, but the Partner does not have a complete weekly-availability and exception workflow.

Why it matters:

- A Partner who closes the app may remain online.
- Scheduled booking capacity cannot be published accurately.
- Instant presence and future availability are incorrectly treated as one concept.

Target:

- Weekly availability rules cover scheduled work.
- Date-specific exceptions cover leave and special hours.
- Instant online presence requires a heartbeat and expires automatically.
- Customer search and Partner UI read the same source of truth.

### 5. The dashboard mixes real and fabricated information

The dashboard constructs static/demo offers and can show synthetic alerts, placeholder ratings, acceptance rates, locations, tasks, surge values and materials alongside real bookings.

Why it matters:

- The Partner cannot distinguish operational truth from demo content.
- Product testing produces false confidence.
- Placeholder earnings or demand indicators can influence Partner decisions.

Target:

- Production screens render only API data.
- Empty states are honest and useful.
- Demo fixtures exist only in story/test environments.
- Unknown metrics display as unavailable, not flattering defaults.

### 6. Offer value is financially ambiguous

Offer and active-job UI can present the customer's quoted amount as the Partner fare/earning.

Why it matters:

- Customer gross price can include fees, taxes, parts and discounts.
- Partner compensation may use commissions, incentives, penalties or taxes.
- Showing gross as earnings creates financial disputes.

Target:

- Offer shows `estimated_partner_net`.
- Detail can explain service earning, incentives, commission/fee and applicable deductions.
- Final earning becomes an immutable ledger entry after the relevant settlement event.

### 7. Polling refreshes too much

Offers poll roughly every four seconds, active work roughly every three seconds, and some changes trigger a full dashboard refresh with many database reads. Crew workflows add more polling.

Why it matters:

- Database and server load grows with every online Partner.
- Full refreshes increase latency and visual instability.
- Polling is still not a durable dispatch mechanism.

Target:

- Outbox/Celery drives server workflow.
- Server-Sent Events or WebSockets deliver time-sensitive UI events where justified.
- TanStack Query updates focused cache keys.
- Bounded, backoff-enabled polling remains only as a recovery fallback.
- The countdown animates locally but reconciles against server timestamps.

### 8. Authentication is not launch-ready

The signed Partner cookie directly carries a Partner identifier for a long period. Middleware checks cookie presence rather than authoritative session and account state. OTP creation lacks a complete send-side cooldown/rolling-window policy, and development OTP output must never leak outside local mode.

Why it matters:

- Session revocation, device management and suspension enforcement are weak.
- Presence of a cookie is not proof of a valid active session.
- OTP endpoints are an abuse and cost target.

Target:

- Django owns revocable, rotated, secure sessions.
- Every protected API validates identity, role and Partner eligibility.
- OTP request and verification use per-number, per-IP and device-aware limits.
- Production never returns or logs OTP values.

### 9. KYC replacement and consent history are incomplete

Direct private uploads are a good start, but document replacement can weaken the historical review trail. A checked terms box is not a versioned legal-consent record.

Why it matters:

- Operations cannot reliably reconstruct what was reviewed.
- Legal and policy consent cannot be tied to an exact document version.

Target:

- `PartnerDocument` is append/version based.
- Review decisions reference a specific document version and reviewer.
- `PartnerConsent` stores policy version, timestamp and safe request/device context.
- Changes-required messages are structured and auditable.

### 10. Skills and location have competing representations

Onboarding can store offered services in JSON while matching uses normalized skill tables. City/location also has both free-form and relational forms.

Why it matters:

- A Partner can appear configured but fail matching.
- Admin edits and onboarding edits can overwrite different representations.

Target:

- Normalized `PartnerSkill`, `PartnerService` and `PartnerServiceArea` records are authoritative.
- Draft onboarding data maps through one application service at submission.
- Free-form display text never drives eligibility.

### 11. Work checklist and evidence are client-only

The UI can ask for tasks and before/after photos, but the visible flow does not make all required completion evidence durable and backend-enforced.

Why it matters:

- Refresh can lose progress.
- A client can call completion without satisfying the visual gate.
- Disputes lack reliable evidence.

Target:

- Required tasks are created from the booking's service snapshot.
- Task completion is persisted with actor/time.
- Required evidence is uploaded privately and linked to task/booking.
- Django rejects completion until the service policy is satisfied.

### 12. Payout concurrency can duplicate payment

The current payout flow can read pending earnings, call a gateway, then mark rows paid. Two withdrawal requests can select the same eligible earnings before either finishes.

Why it matters:

- One earning can be paid twice.
- Gateway success followed by database failure is difficult to reconcile.

Target:

1. Lock eligible ledger entries.
2. Reserve them for one `PayoutAttempt`.
3. Commit the reservation and idempotency key.
4. Call the payout provider idempotently.
5. Finalize from authoritative provider response/webhook.
6. Reconcile ambiguous outcomes with a scheduled task.

The development payout stub must be impossible to enable in production.

## Additional high-priority issues

- Assignment acknowledgement must use a conditional transactional update so only one Partner wins.
- The acknowledgement window must be enforced by backend time, not UI countdown alone.
- Work actions require optimistic version/state checks for racing mutations.
- Full address and customer contact are withheld until acknowledgement.
- Payout-account ownership and bank/IFSC verification need an explicit policy.
- Rating, acceptance and completion metrics require defined denominators and minimum sample rules.
- Hardcoded commission, tier and incentive thresholds belong in versioned configuration.
- Notification delivery must be recorded and retryable.
- Partner release/cancellation requires reason codes, policy evaluation and audit history.

## Crew engine assessment

The crew flow is not just another Partner screen; it is a workforce-management domain.

Current risks include:

- Simultaneous crew acceptance can race.
- Invite links act as long-lived bearer credentials until regenerated.
- Attendance endpoints rely on invite token plus short OTP.
- Crew OTP attempts need stronger throttling.
- OTP generation must use a cryptographically secure generator.
- One member action can end attendance for a wider group.
- Crew settlement spans multiple calls and uses hardcoded commercial rules.

Decision:

- Do not mix crew migration into the fixed-service Technician milestone.
- Design crew later around organizations, memberships, shifts, attendance events, approvals, wage/commission rules and settlement ledgers.
- Fix any immediately exploitable legacy issue separately if the current development app is exposed.

## Target Partner product flow

### 1. Public acquisition

Location: Customer Next.js app.

- SEO-friendly `/partners` pages
- Clear eligibility, earning model and document requirements
- “Start application” moves into authenticated Partner flow
- No private operational dashboard code in public pages

### 2. Authentication and application

Location: Partner private application backed by Django.

```text
Phone OTP
  → profile
  → identity/KYC
  → skills and supported services
  → service areas
  → weekly availability
  → payout/tax profile
  → versioned consent
  → review
  → submit
```

Application gate:

```text
DRAFT
  → SUBMITTED
  → UNDER_REVIEW
  → CHANGES_REQUIRED → resubmit
  → APPROVED
  → SUSPENDED / OFFBOARDED when necessary
```

The Partner may edit drafts and resolve requested changes, but cannot go online or receive work without approved eligibility for that service.

### 3. Private application shell

Recommended primary navigation:

- Home
- Jobs
- Earnings
- Alerts
- Profile

Design requirements:

- Mobile-first, full-viewport operational UI
- Existing Vsolve Hub brand palette with high-contrast states
- 44×44px minimum touch targets
- Immediate pressed/loading/success/error feedback
- Persistent bottom navigation on narrow screens
- No decorative phone frame
- No emoji used as structural icons
- Clear offline, online, busy and action-required states

### 4. Availability and presence

Scheduled availability:

- Weekly working rules
- Breaks
- Date exceptions/leave
- Service-specific eligibility where required
- Existing reservation visibility

Instant presence:

- Explicit “Go online”
- Current operating location/service area confirmation
- Periodic heartbeat
- Automatic expiry when stale
- “Busy” derived from active assignment, not manually faked

### 5. Assignment experience

An assigned-job card should show:

- Service and scope summary
- Approximate area before acknowledgement
- Instant ETA or scheduled start
- Estimated duration
- Distance/arrival estimate when reliable
- Estimated Partner net earning
- Acknowledgement window expiry
- **Acknowledge** as the primary action, with Release as a secondary action

It must not show:

- Customer gross total as Partner income
- Fake surge/demand/rating information
- Exact private address/contact before acknowledgement
  ([doc 11 §2](./11-payment-first-instant-and-cancellation-policy.md) step 9)
- An acknowledge action after the window has expired
- Accept/Decline framing — the job is assigned, not offered (ADR-029)

For preselected scheduled Partners, a reservation/assignment may already exist under the commitment policy. Instant uses acknowledge-and-assign per ADR-029: a ranked Partner is assigned and must explicitly acknowledge within a bounded window, with a single-winner conditional-update transaction ([doc 11 §3](./11-payment-first-instant-and-cancellation-policy.md)).

### 6. Fixed-service work lifecycle

```text
ASSIGNED
  → PARTNER_EN_ROUTE
  → ARRIVED
  → START_OTP_VERIFIED
  → IN_PROGRESS
  → OVERTIME or EXTENDED
  → COMPLETION_SUBMITTED
  → COMPLETED
```

Rules:

- Fixed services use status and ETA, not continuous live-map tracking.
- The backend records arrival and validates allowed transitions.
- Work time starts only when start OTP is confirmed.
- Remaining time derives from `started_at + approved_duration`.
- Overtime never creates a silent charge.
- Extra parts and time require a customer-visible request and explicit approval.
- Work checklist and required evidence persist across refresh/device reconnect.
- Completion creates financial effects exactly once.

### 7. Earnings and payout

Earnings UI separates:

- Estimated earning on an active offer/job
- Pending settlement
- Available balance
- Reserved for payout
- Paid
- Reversed/adjusted with reason

The immutable ledger is authoritative. A mutable wallet balance may be cached for display but cannot be the audit source.

Payout flow:

```text
Verified payout account
  → select available amount
  → reserve ledger entries
  → create idempotent payout attempt
  → provider processing
  → webhook/reconciliation
  → paid or safely released/failed
```

## Current to target summary

| Area | Current | Target |
|---|---|---|
| Backend ownership | Next actions/routes + shared Prisma | Django domain services and API |
| Session | Long-lived signed Partner-ID cookie | Revocable Django session with rotation |
| Onboarding | Provider-specific forms with drift | Versioned application, KYC and consent |
| Skills | JSON and normalized records coexist | Normalized authoritative eligibility |
| Availability | Boolean online plus incomplete schedule UX | Weekly schedule, exceptions and expiring presence |
| Dashboard | Real and mock data mixed | Only authoritative API state |
| Dispatch | Polling and cross-app reassignment | Celery/outbox with push UI updates |
| Offer amount | Customer quote can appear as earning | Estimated Partner net breakdown |
| Work proof | UI-local checklist/evidence | Persisted and backend-enforced |
| Timer | Backend timestamp foundation | Same foundation with explicit lifecycle |
| Payout | Read-pay-update race | Reserved ledger + idempotent attempt/reconciliation |
| Crew | Mixed into Partner product | Deferred workforce module |

## Partner Milestone 1 acceptance

The Technician vertical slice is not complete until all are true:

1. An approved Technician publishes scheduled availability.
2. Instant presence expires when heartbeat stops.
3. Customer availability uses the exact same source of truth.
4. A real assignment contains no fabricated operational data.
5. Concurrent acknowledgement or reservation cannot double-assign capacity.
6. A Partner can arrive, verify OTP and begin a server-timed session.
7. Required tasks/evidence persist and block invalid completion.
8. Parts and extensions require customer approval and price revision.
9. Completion creates one immutable earning.
10. Partner sees estimated/final net earning, not customer gross.
11. Two withdrawals cannot pay one ledger entry twice.
12. Dispatch and recovery continue when every browser is closed.
13. Customer and Partner see consistent booking state.
14. Fixed service has no continuous live-map tracking.
15. Partner API authorization and OTP abuse tests pass.

## Migration order

1. Build Django identity, Partner application, document and consent models.
2. Migrate normalized skills, services and service areas.
3. Build weekly availability, exceptions and expiring presence.
4. Build duration-aware capacity, assignment/acknowledgement and reservation services.
5. Move arrival, OTP, task, evidence, parts, extension and completion commands.
6. Build earnings ledger, payout accounts, payout attempts and reconciliation.
7. Publish OpenAPI and connect the existing Partner frontend through generated clients.
8. Remove Partner direct Prisma/server-action business writes.
9. Rebuild the authenticated experience inside the existing Partner Next.js app as a persistent
   React/TanStack Query workspace after API cutover.
10. Delete replaced legacy paths only after Partner and Customer acceptance suites pass.
11. Design and migrate crew as a later workforce milestone.

This order separates backend correctness from frontend presentation work. A framework migration is
not part of Milestone 1; measured runtime or developer-experience evidence would be required for a
later ADR.
