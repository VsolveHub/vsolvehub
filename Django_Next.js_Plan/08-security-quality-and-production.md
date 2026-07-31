# Security, Privacy, Quality and Production

## Authentication and authorization

- Secure HTTP-only sessions with CSRF protection.
- Hashed, expiring, single-use OTP challenges with number/IP/device limits and resend cooldown.
- Revocation, session listing and rotation after authentication or privilege change.
- MFA/step-up for Operations finance, payout-account changes and sensitive recovery.
- Deny-by-default permissions plus object ownership and current role/eligibility checks.
- Time-limited, reason-bound support view; no hidden impersonation.

## Marketplace abuse controls

Risk signals and cases cover:

- self-booking and linked Customer/Partner accounts;
- repeated payment abandonment after Partner acceptance;
- address harvesting or unusual PII access;
- false arrival, forged evidence and receipt inflation;
- collusion, off-platform payment solicitation and review coercion;
- recycled phone/account recovery;
- payout-account takeover and rapid withdrawal;
- listing spam and unsafe content in A10.

Pilot policy is review-first. Automated restrictions require minimum evidence, attributable causes,
plain explanation, dispute and recovery. Do not use hidden ranking changes as punishment.

## Files and sensitive data

- Signed direct/resumable uploads with type, size and count limits.
- Malware scanning, safe derivatives, HEIC/orientation handling and EXIF stripping.
- Private storage and short-lived signed access.
- Purpose, consent, retention and access audit for KYC, home interiors, receipts and incidents.
- No OTPs, session tokens, full payment payloads or complete KYC content in logs/events.

## Privacy

- Versioned notices and purpose/channel-specific consent.
- Data inventory and retention policy by record/media type.
- Access, correction, erasure and grievance workflows.
- Minimize/anonymize operational PII when allowed while retaining required financial records.
- Breach incident and notification runbook.
- Location collected only for declared purpose: latest coarse Instant matching for home services;
  purpose-bound trip tracking for A8.

## Payment and financial security

- Verify webhook signatures and provider identity.
- Do not store card credentials.
- Idempotent provider commands and monotonic event reduction.
- Immutable audit and ledger records.
- Maker-checker for high-risk refunds, adjustments and payout-account recovery.
- Development adapters fail startup in production configuration.

## Compliance gates

Before live operation, qualified advisers approve current India requirements for:

- supplier of record and marketplace GST treatment;
- place of supply and invoice/credit-note issuance;
- Partner TDS/TCS/statutory deductions and statements;
- KYC/background-check scope;
- DPDP notice, consent, retention and rights handling;
- TRAI/DLT sender, header and transactional templates;
- payment aggregation, deposits/milestones and any use of the word escrow;
- workforce, rental, transport and accommodation obligations before those archetypes launch.

Configuration is effective-dated. The plan does not freeze legal rates or interpretations.

## Test strategy

### Unit and property tests

- price/tax/commission/refund line reconciliation;
- allowed state transitions and actor permissions;
- archetype configuration validation;
- cancellation and partial-work outcomes;
- idempotency and retry decisions.

### PostgreSQL/Redis integration

- overlap and partial-unique constraints;
- offer acceptance versus expiry/revocation;
- payment capture versus reservation expiry;
- cancellation versus arrival/start/completion;
- duplicate/out-of-order webhooks;
- payout reservation concurrency;
- outbox and task redelivery;
- Redis loss without database invariant loss.

### Contract and frontend

- OpenAPI validation and generated-client compilation;
- error envelope and compatibility checks;
- loading, offline, resume and conflict UX;
- accessibility, keyboard, screen reader, 200% zoom and reduced motion;
- mobile 375/768 and desktop 1024/1440;
- no optimistic claims for payment/assignment/arrival/completion.

### End-to-end lifecycle

Every milestone tests happy paths and at least:

- no serviceability/availability;
- Partner decline/expiry/accidental undo;
- payment failure, ambiguous webhook and refund failure;
- Partner cancellation, delay and no-show;
- Customer unavailable;
- wrong scope, amendment decline/payment failure;
- offline/upload/OTP failure;
- partial work, abort, completion dispute and silence timeout;
- duplicate actions and racing transitions;
- Operations recovery and audit.

## Quality gates

- Ruff, strict MyPy, migration check, PostgreSQL tests and OpenAPI validation.
- Backend branch-aware coverage at or above the repository requirement.
- Frontend lint, typecheck, tests, accessibility and production bundle checks.
- Regression test with every bug fix.
- No unresolved critical/high security issue.
- Runbooks and observability exist before a dependency becomes production-critical.

## Performance and scale

Budgets are milestone-specific and measured on production-like data. Initial global goals:

- ordinary API p95 under 500 ms excluding external-provider latency;
- availability/quote p95 under 1 second at milestone target load;
- transactional outbox pickup p95 under 5 seconds;
- customer-visible state convergence p95 under 5 seconds;
- public LCP under 2.5 seconds on representative mobile conditions.

Do not build Redis-first optimizations or scheduling optimizers merely to satisfy speculative scale.
Profile query plans, add real indexes and cache stable reads first.

## Observability

Structured logs include trace, safe actor/reference, command/task, duration and result code. Metrics
cover conversion, assignment, fulfilment, dependency health, money reconciliation, case SLA, queue
depth and database health. Alerts focus on actionable failures rather than every business fluctuation.

Critical alerts include:

- captured payment without valid target;
- overdue assignment/recovery or refund case;
- duplicate-capacity/financial constraint anomaly;
- reconciliation mismatch;
- queue/database/provider outage;
- safety-case SLA breach;
- payout ambiguity.

## Deployment and recovery

- Backward-compatible expand/migrate/contract deployments.
- Tested backup, point-in-time restore and object retention.
- Migration and rollback rehearsal.
- Dead-letter/outbox replay and payment/refund/payout reconciliation runbooks.
- Service/area/provider kill-switch rehearsal.
- Legacy cutover only after a complete vertical slice passes acceptance and data export exists.

