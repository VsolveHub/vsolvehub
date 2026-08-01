# M1 Backend Tasks

Scope and exclusions are defined in [M1 README](./README.md). Frozen clocks, amounts and provider
choices are in [Initial configuration](./05-initial-configuration.md).

Task markers: `[x]` implemented and covered by the current automated suite · `[~]` partially
implemented, with the missing production behaviour named · `[ ]` not implemented. A model or happy
path alone never makes a business capability complete; its authorized HTTP contract, idempotency,
failure recovery, audit and concurrency behaviour must also exist.

## Audit snapshot — 2026-08-01

- Django system checks, Ruff formatting/lint, strict MyPy and all **76 backend tests** pass.
- Branch-aware coverage is **85.11%** and `makemigrations --check --dry-run` reports no model drift.
- A freshly generated OpenAPI document validates, and the locked base requirements have no known
  vulnerabilities according to `pip-audit`.
- The local PostgreSQL and Redis containers are healthy. The developer database still has unapplied
  migrations; that is an environment-readiness issue, not evidence that the migrations are absent.
- The test suite exercises PostgreSQL, but test settings replace Redis with locmem and run Celery
  eagerly. Real Redis, worker/beat, provider, concurrency and crash-recovery tests are still missing.
- `contracts/openapi/v1.yaml` is generated from the current code but still declares `1.2.0`; its
  changelog and the generated frontend client predate the B5/B6 surface.

## Cross-cutting blockers discovered by the audit

### R1 — Contract publication is not versioned or gated

Cut the next contract version and changelog entry, regenerate the frontend client, and make CI fail
when the committed OpenAPI or generated TypeScript differs from Django. Add representative success
and error examples, especially `401`, `403`, `409`, `429` and retryable provider failures.

### R2 — The quality command is narrower than the documented completion gate

`scripts/quality.cmd` runs Ruff, MyPy and pytest only. Extend it (or the CI job it calls) with migration
drift, OpenAPI generation/validation and diff, generated-client freshness, `pip-audit`, and explicit
PostgreSQL/Redis/Celery integration and concurrency suites.

### R3 — Operations authorization needs hardening

`IsOperationsUser` accepts any active Operations grant without requiring the session's active role,
unlike Partner and Finance permissions. Operations reviewers can also act on their own Partner
application/documents. Require the selected Operations role, forbid self-review/self-approval, record
allowed and denied sensitive access, and add regression tests.

### R4 — There is no runnable asynchronous topology or recovery sweep

Celery configuration and one presence reconciliation job exist, but local infrastructure starts only
PostgreSQL and Redis. Add worker/beat commands or services, an outbox recovery sweep for events left
`PENDING`/`PROCESSING`/`FAILED`, and runbooks for queue outage, replay and stuck commands.

## B1 — Foundation and contract

- [x] Environment-specific Django settings, PostgreSQL/Redis infrastructure, liveness/readiness,
      request IDs, JSON logging and the stable API error envelope.
- [x] Durable idempotency and transactional-outbox models plus an at-least-once Celery dispatcher.
- [~] Retry-safe command convention. Checkout creation uses it; most other state-changing endpoints
      rely only on optimistic locking or have no retry contract. Define which commands are retryable
      and apply the convention consistently.
- [~] Generate and validate `/api/v1` OpenAPI. Generation validates, but publication/versioning,
      examples and generated-client drift enforcement are incomplete (R1).
- [ ] Recover stranded outbox/idempotency records and prove crash/retry behaviour with a real worker
      and broker (R4).
- [ ] Add the missing quality gates described in R2.

**Status: partial.** The foundation is usable for development, but it is not yet a production-complete
contract and asynchronous execution platform.

## B2 — Identity, privacy and authorization

- [x] Custom phone-number user, Customer profile, roles/grants, devices, revocable sessions and
      generic OTP responses with cooldown, phone/IP limits, attempt limits and hashed secrets.
- [x] Explicit role switching, session/device listing and revocation, and finance OTP step-up.
- [x] Consent receipts, communication preferences, privacy-request records and access-audit storage.
- [x] Self-role-grant exclusion.
- [~] Partner/Operations/Finance permission matrix. Partner and Finance require the active session
      role; Operations currently does not (R3).
- [ ] Prevent an Operations actor from reviewing their own Partner application, document or related
      sensitive record; cover direct and indirect role combinations.
- [ ] Apply access-audit events to sensitive reads and denied decisions, and implement privacy/session/
      OTP retention and request fulfilment jobs. The models alone are not fulfilment.
- [ ] Implement and test the frozen MSG91 Flow/DLT production OTP adapter and delivery/fallback
      policy; only the development and deliberately-unconfigured adapters exist.

**Status: partial.** Customer OTP/session flows are integrable; privileged Operations and production
delivery/retention work remains.

## B3 — Catalog, rates and geography

- [x] A1 configuration, `TaskRate`, effective pricing policy, base/marginal duration, minimum service
      subtotal, platform-fee, GST and commission input models.
- [x] Address ownership/archive, reverse geocoding with timeout/cache, serviceability, area operating
      windows/exceptions and fail-closed no-fallback behaviour.
- [x] Deterministic reviewed M1 catalog, pricing, Hyderabad service-area and Partner-density seed
      commands; out-of-scope legacy catalog is retained but deactivated.
- [~] Server quote calculation consumes task rate, derived duration, minimum adjustment and platform
      fee. It does **not** calculate or expose a tax line, and commission is not snapshotted for later
      Partner settlement.
- [~] Public catalog contract. It still exposes legacy `pricing_strategy` and duration-picker fields,
      omits the A1 archetype/task definition, and does not expose `TaskRate` or minimum-visit policy.
- [ ] Add authorized, audited Operations APIs for catalog, task-rate, pricing-policy and service-area
      lifecycle with effective-date and activation validation.
- [ ] Add overlap/uniqueness protection for simultaneously effective rates/policies and concurrency
      tests for activation and quote selection.

**Status: partial.** Core A1 data and serviceability work; public/Operations contracts and complete
money snapshots do not.

## B4 — Partner onboarding and explicit availability

- [x] Versioned Partner application, consent, normalized skills/services/areas, document metadata,
      submit/review/change-required/approve/suspend/offboard transitions and transition history.
- [x] Explicit weekly and dated availability, overnight/overlap validation, empty-by-default policy,
      and audited Operations-assisted schedule changes requiring active Partner consent.
- [x] Eligibility and presence checks fail closed for unapproved/incomplete Partners and stale or
      unavailable Redis/location state.
- [ ] Implement the frozen Supabase Storage private-bucket adapter: issue short-lived signed upload
      URLs, verify uploaded object metadata/checksum before accepting it, issue short-lived masked
      review URLs, and define deletion/retention/malware handling.
- [ ] Add Operations application queue and detail selectors/endpoints with bounded filters,
      pagination, assignment/ownership and masked sensitive data.
- [ ] Apply the Operations active-role and self-review protections from R3.

**Status: partial.** Partner-authored application and schedule APIs are the strongest completed
surface; document transport and the Operations review read path block end-to-end onboarding.

## B5 — Cart, quote and checkout

- [x] Anonymous/customer singleton cart, explicit login merge conflict, `CartItemScope`, schema
      snapshot and one-item M1 restriction.
- [x] Server-owned A1 quote using address ownership, serviceability, current task rate/policy and
      derived duration; client-supplied price/duration is rejected by construction.
- [x] Versioned/expiring checkout creation with idempotency and an Operations-assisted command that
      requires persisted Customer consent and uses the same quote.
- [ ] Publish server-authored Today/Scheduled arrival windows with opaque IDs and revalidate the
      selected window during quote/checkout creation.
- [ ] Add quote expiry/server time, item/task lines, tax and cancellation-policy bands with exact
      server-authored condition text and amounts.
- [ ] Add customer checkout retrieval/recovery, free search cancellation, explicit failed/cancelled
      terminal states and a bounded state projection containing authoritative deadlines and safe
      Partner disclosure.
- [ ] Decide and enforce whether replacing a different singleton cart item is deliberate. If not,
      return an explicit conflict rather than silently replacing it.
- [ ] Add quote/checkout expiry, stale-version, duplicate-submit and concurrent-create tests.

**Status: partial.** Cart and checkout creation exist; the recovery-safe contract required by the
booking workspace does not.

## B6 — Availability, offer and reservation

- [x] PostgreSQL range reservation with a conditional GiST exclusion constraint for tentative and
      confirmed overlaps.
- [~] Eligibility checks include approved application, active service/area and explicit schedule.
      Adjacent travel buffers, area operating hours during matching, presence policy and the planned
      deterministic business ranking are not implemented; current order is Partner UUID.
- [x] Sequential offer model and commands for start, accept, commit, decline and undo, including the
      120-second tentative reservation and payment window.
- [~] Assignment-attempt audit records basic eligibility inputs, but does not record ranking factors,
      exclusion reasons or the bounded privacy policy required to explain assignment decisions.
- [ ] Move offer expiry, undo expiry, payment-hold expiry and candidate advance to Celery/beat so a
      closed browser cannot stop dispatch. Replace the customer `search/advance` command with a read
      projection.
- [ ] Split customer checkout/search responses from the Partner offer serializer. Publish only safe
      customer disclosure and enrich the Partner offer with scope, approximate area, timing,
      occupied estimate, requirements and net earnings.
- [ ] Decide and implement Partner offer delivery for the 45-second deadline, with reconnect/replay
      semantics and no assumption that a browser tab remains open.
- [ ] Complete revoke/release/manual-recovery commands with authorization, idempotency and audit, and
      add real concurrent-accept/expiry/payment-hold tests.

**Status: partial.** The database reservation invariant and core state transitions exist; autonomous
dispatch, ranking, projections, delivery and recovery do not.

## B7 — Orders, payment, refund and documents

- [x] Initial persistence models for Order, Booking, PaymentAttempt, verified webhook record, Refund
      and TaxDocument.
- [x] Fake-provider order creation and one tested `payment.captured` happy path that converts a
      checkout once into Order, Booking, confirmed Reservation and invoice.
- [~] Reservation-expiry/capture race is detected and creates an unlinked refund placeholder, but it
      does not execute, reconcile or raise the required Finance case.
- [ ] Define provider protocols and implement Razorpay Orders/Checkout, automatic capture and
      full/partial refund adapters with explicit timeouts, retry policy, credential isolation and
      provider idempotency keys.
- [ ] Add authorized HTTP endpoints for payment-attempt creation, provider webhook ingestion with
      raw-body signature verification, checkout/payment retrieval and reconciliation.
- [ ] Implement monotonic payment-state reduction for authorized/captured/failed/expired/refunded
      events, duplicate/out-of-order webhooks and redirect-loss recovery.
- [ ] Implement atomic reservation reacquisition after late capture or automatically execute and
      reconcile a refund; never leave only a `Refund(PROCESSING)` row.
- [ ] Implement server-authored cancellation quote/confirm, partial/full refund state machines,
      failed-refund Finance cases and idempotent provider refund commands.
- [ ] Implement tax calculation/reconciliation, concurrency-safe invoice and credit-note numbering,
      immutable document snapshots and authorized document retrieval.
- [ ] Complete CA/legal configuration sign-off before live collections.

**Status: initial skeleton only.** B7 is not an API capability and must not be described as complete.

## B8 — Booking fulfilment

- [ ] Implement fulfilment state machine, history and expected-version commands.
- [ ] Implement idempotent Customer cancel, reschedule and address-change commands with the frozen
      revalidation, reacceptance, recovery and no-silent-mutation rules.
- [ ] Implement En route, Arrived, Customer unavailable, lateness watchdogs and restricted
      Operations-assisted outage start.
- [ ] Implement start OTP, WorkTask, WorkEvidence, scope amendment and revision payment.
- [ ] Implement Abort, line-level outcomes, completion submission, Customer confirmation/dispute,
      evidence-gated timeout, partial-work refund/ledger and Partner release/recovery.

**Status: not started.**

## B9 — Cases, ledger and payout

- [ ] Implement typed OperationsCase with owner, severity, SLA, evidence, communication, allowed
      commands and immutable audit.
- [ ] Cover assignment, late/no-show, unavailable Customer, partial/abort, quality, safety, payment,
      refund and payout case types.
- [ ] Implement immutable Partner ledger entries/adjustments and Operations-reviewed payout batches.
- [ ] Implement ledger reservation, the frozen RazorpayX payout adapter, idempotent sandbox payout,
      payout-account verification and account-change cooling.

**Status: not started.**

## B10 — Events, messaging and observability

- [ ] Implement notification intent/delivery/failure records, bounded retry and SMS/transactional
      fallback policy.
- [ ] Implement offer, checkout, reservation, lateness, completion, reconciliation and retention jobs.
- [ ] Implement service/area/payment/payout kill switches and maker-checker controls where required.
- [ ] Add metrics/alerts for conversion, assignment, lateness/no-show, partial/dispute, money
      ambiguity, case SLA, outbox and worker queues.
- [ ] Create `docs/adr/**` and `docs/runbooks/**`; document every critical dependency, replay process
      and stuck state. Those required directories currently do not exist.

**Status: not started, apart from request logging and the Partner-presence reconciliation task.**

## Backend completion gate

- [x] Ruff format/check, strict MyPy and current unit/API tests pass.
- [x] Current branch-aware coverage threshold passes: **85.11%**.
- [x] Migration model-drift check and generated OpenAPI validation pass.
- [x] Locked base dependencies currently pass `pip-audit`.
- [~] PostgreSQL is exercised by the current suite; dedicated constraint/concurrency/race suites are
      still missing.
- [ ] Real Redis, Celery worker/beat, outbox crash recovery and provider integration tests pass.
- [ ] `scripts/quality.cmd` or CI enforces every gate above, including committed contract and generated
      frontend-client freshness.
- [ ] All local/staging migrations are applied and readiness is green before acceptance testing.
- [ ] Authorization, idempotency, failure, audit and recovery tests exist for every state-changing
      business command.
- [ ] Required ADRs, runbooks, dashboards and alerts exist before production handoff.
