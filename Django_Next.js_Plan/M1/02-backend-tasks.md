# M1 Backend Tasks

## B1 — Foundation and contract

- Preserve legacy paths until cutover.
- Complete environment settings, PostgreSQL/Redis infrastructure, health/readiness and structured logs.
- Enforce service/selector/transaction/idempotency conventions.
- Generate and validate `/api/v1` OpenAPI with examples and stable error codes.
- Configure transactional outbox and retry-safe Celery execution.

## B2 — Identity, privacy and authorization

- Complete custom user/roles/profiles, OTP abuse controls and revocable sessions.
- Add explicit role switching and self-assignment exclusion.
- Add Partner/Operations permission matrix and step-up for sensitive finance actions.
- Add consent receipts, communication preferences, privacy request and access audit foundations.

## B3 — Catalog, rates and geography

- Implement/validate A1 variant activation requirements.
- Implement TaskRate, base/marginal duration, minimum visit charge, fee, tax and commission rules.
- Complete Address, geocoding, serviceability, area hours/exceptions and no-fallback behaviour.
- Seed only reviewed M1 one-person variants and density fixtures.

## B4 — Partner onboarding and explicit availability

- Complete application/document/consent/skills/service-area lifecycle.
- Implement explicit weekly/dated availability and exceptions.
- Prevent suspended/unapproved/ineligible Partners from offers/work.
- Add audited Operations-assisted schedule management with Partner consent.

## B5 — Cart, quote and checkout

- Implement Cart/CartItem/CartItemScope and login merge/resume.
- Snapshot question/schema version and every quote input.
- Implement A1 quote and derived estimated duration; reject client price/duration truth.
- Implement CheckoutSession expiry/versioning and one-item M1 restriction.
- Implement an explicit `CreateAssistedBooking` Operations command. It records the assisting actor and
  Customer consent, uses the same address, serviceability, quote, availability, Partner acceptance and
  payment-link flow as self-service, and grants no price, assignment or payment bypass.

## B6 — Availability, offer and reservation

- Query full occupied range against eligibility, explicit availability, area hours and adjacent travel.
- Add GiST/exclusion constraint for active reservations.
- Implement deterministic ranking and privacy-limited AssignmentAttempt audit.
- Implement sequential PartnerOffer delivery, expiry, provisional accept, commit/undo, decline/revoke
  and candidate retry.
- On provisional acceptance, create TENTATIVE reservation and a 120-second undo deadline.
- Enable payment/address disclosure only after explicit Commit now or undo expiry; an undo releases and
  continues search before money moves.
- Implement manual Operations offer command through the same service.
- Do not implement default-on availability, soft multi-day reservation, repacking, day-roster
  confirmation, automatic reliability index or Redis correctness locks.

## B7 — Orders, payment, refund and documents

- Create provider adapters plus fake implementations and the frozen live-provider integrations in
  [Initial configuration](./05-initial-configuration.md).
- Implement payment attempt, verified persisted webhook, monotonic reduction and reconciliation.
- Convert accepted checkout exactly once into Order, Booking, confirmed reservation and assignment.
- Handle reservation-expiry/capture race with atomic reacquire or refund.
- Implement line-level/fixed cancellation quote, refund states and failed-refund Finance cases.
- Implement invoice/credit-note series and paise reconciliation.
- Complete CA/legal configuration sign-off before live collections.

## B8 — Booking fulfilment

- Implement fulfilment state machine, history and expected-version commands.
- Implement an idempotent `CustomerCancelBooking` quote-and-confirm command. The server calculates the
  applicable fee/refund, resolves cancellation races atomically and opens recovery for ambiguous
  payment/refund outcomes.
- Implement an idempotent `CustomerRescheduleBooking` command. It revalidates serviceability, price,
  capacity and Partner eligibility; requires fresh Partner acceptance; and keeps the original
  appointment authoritative until the replacement reservation is confirmed or the Customer accepts
  cancellation/refund. It never drops both reservations during a failed attempt.
- Implement an idempotent `CustomerChangeBookingAddress` command. Before Partner commitment it
  requotes and restarts search when eligibility changes. After commitment and before `EN_ROUTE`, it
  revalidates serviceability/travel and requires Partner reacceptance without exposing the new exact
  address early. From `EN_ROUTE` onward it routes to Operations recovery or cancel/rebook; it never
  silently mutates the work location, and it is unavailable after work starts.
- Implement En route, Arrived, Customer unavailable and lateness watchdogs.
- Implement start OTP and restricted Operations-assisted outage start.
- Persist WorkTask and WorkEvidence and enforce completion policy.
- Implement catalog ScopeAmendment with evidence, capacity-risk check, approval and payment.
- Implement Abort, line-level WorkOutcome, CompletionSubmission and Customer confirm/dispute.
- Implement evidence-gated completion timeout and partial-work refund/ledger calculation.
- Implement Partner release/recovery and Customer fee-free delay cancellation.

## B9 — Cases, ledger and payout

- Implement typed OperationsCase with owner, severity, SLA, actions and audit.
- Cover assignment, late/no-show, unavailable Customer, partial/abort, quality, safety, payment, refund
  and payout case types.
- Implement PartnerLedgerEntry states and immutable adjustments.
- Implement Operations-reviewed payout batch, ledger reservation and idempotent sandbox payout.
- Add payout-account verification/change cooling before live payout.

## B10 — Events, messaging and observability

- Implement notification intent/delivery/failure records and bounded retry.
- Implement SMS/OTP and transaction-message fallback policy.
- Add expiry, lateness, completion deadline, reconciliation and retention jobs.
- Add service/area/payment/payout kill switches.
- Add metrics and alerts for conversion, assignment, late/no-show, partial/dispute, money ambiguity,
  case SLA and queues.
- Write runbooks for every critical dependency and stuck state.

## Backend completion gate

All code passes Ruff, strict MyPy, unit/property tests, real PostgreSQL/Redis integration and concurrency
tests, migration drift check, branch-aware coverage requirement and OpenAPI validation. No backend task
is complete without its authorization, idempotency, failure and recovery tests.
