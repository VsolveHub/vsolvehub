# Quality, Security and Operations

## Testing strategy

### Backend unit tests

Cover:

- Price calculations
- Fee caps/minimums
- GST applicability
- Duration boundaries
- Provider eligibility/ranking
- Booking state transitions
- Extension/overtime calculations
- Cancellation/refund policy

### Backend integration tests

Use real PostgreSQL and Redis.

Cover:

- Transactions
- Row locking
- Reservation overlap constraints
- Idempotency
- Outbox behaviour
- Celery task retry
- Payment webhook duplication/order
- Permission boundaries

SQLite is not sufficient for booking/concurrency integration tests because it cannot validate PostgreSQL-specific reservation behaviour.

### Contract tests

- OpenAPI schema validates.
- Generated TypeScript client compiles.
- Error envelope is consistent.
- Backward-incompatible API changes fail CI unless versioned.

### Frontend tests

- Component accessibility
- Booking state-machine transitions
- Query loading/error/retry
- Login resume
- Price rendering from quote
- Timer rendering from server timestamps

### Browser E2E

Required scenarios:

1. Logged-out single-service booking
2. Logged-in scheduled booking
3. Instant unavailable
4. Slot taken during hold
5. Preferred provider unavailable
6. Payment failure
7. Duplicate payment submission
8. OTP start and timer
9. Overtime and approved extension
10. Same-service quantity two
11. Multiple services with one capacity failure
12. Refresh/back/navigation state preservation
13. Partner onboarding, KYC review and changes-required resubmission
14. Partner weekly availability and exception
15. Instant presence heartbeat expiry
16. Assignment window expiry, release, and first-valid acknowledgement
17. Arrive, start OTP, persisted tasks/evidence and completion
18. Parts request and customer-approved extension
19. Earnings ledger and payout

### Concurrency tests

- Two customers reserve the last provider/slot.
- One customer double-clicks payment.
- Duplicate webhook delivery.
- Hold expiry races payment authorization.
- Partner cancellation races job start.
- Extension request races completion.
- The assignment loop is entered twice for one booking (Celery redelivery, "keep searching" re-entry,
  stall-watchdog re-entry) — only one Partner may ever leave the booking `PAID_UNASSIGNED` (doc 11 §3.6).
- Presence heartbeat expires during an availability search.
- Two payout requests reserve the same earnings.
- KYC replacement races an operations review.
- Redis lock expiry races an acknowledgement commit (doc 11 §3.5).
- A late acknowledgement arrives after reassignment (doc 11 §3.5).
- Customer cancellation races acknowledgement, and races the EN_ROUTE transition (doc 11 §5.6).
- Payment capture succeeds while `Booking` creation fails (doc 11 edge case 13).
- Redis becomes unhealthy after capture, before assignment (doc 11 §6.2).
- A chargeback lands while a Partner is en route (doc 11 §6.1).
- Scheduled reservation claims capacity mid-assignment (doc 11 edge case 24).

## Security baseline

### Authentication

- Secure, HTTP-only cookies for web sessions.
- CSRF protection for cookie-authenticated mutations.
- OTP request/verification rate limiting.
- Hashed OTP challenges, short expiry and attempt limit.
- Session rotation after authentication/privilege change.
- MFA for privileged operations roles.

### Authorization

- Deny by default.
- Object ownership checked in selectors/services.
- Partner can access only assigned/eligible records.
- Operations actions require explicit role/permission.
- Financial actions have narrower roles and audit.

### Input and files

- Django/DRF validation on every request.
- File type, size and count limits.
- Malware scanning before trusted use.
- Private object storage with signed URLs.
- Strip/normalize unsafe filenames and metadata.
- Record Customer consent/purpose for home-interior evidence and apply a reviewed retention period.
- Support resumable direct upload, HEIC/orientation normalization and asynchronous safe derivatives.

### Payments

- Never trust client amount.
- Verify webhook signatures.
- Persist provider event identifiers.
- Idempotent create/capture/refund.
- No card data stored by Vsolve Hub.
- Financial audit entries are immutable.
- Out-of-order webhooks cannot regress state and trigger provider reconciliation when ambiguous.
- High-value refunds/manual ledger adjustments require maker-checker approval.

### Marketplace safety

- Mask Customer/Partner phone numbers by default.
- Provide SOS/report actions for both parties during an active visit.
- Version KYC/background-verification decisions and payout-account changes.
- Notify the old channel and apply a cooling period after payout-account replacement.
- Public booking/order/invoice references are cryptographically random and object authorization is
  still enforced.

### Privacy and compliance

- Version privacy notices, purpose-specific consent and communication preferences.
- Maintain data inventory, retention rules and audited access/correction/erasure/grievance requests.
- Anonymize operational PII where permitted instead of deleting legally retained financial records.
- Maintain a breach response runbook.
- Tax, invoice, credit-note and Partner statutory-deduction configuration requires qualified
  Indian CA/legal sign-off before production.
- Register SMS sender/header/templates and validate provider/TRAI requirements before production.

### Secrets

- No secrets in browser bundles.
- Separate secrets per environment.
- Rotate exposed/developer credentials before launch.
- Restrict database access by application/environment.

## Performance budgets

The authoritative workload and latency gates are in
[09-milestone-1-authoritative-resolution.md](./09-milestone-1-authoritative-resolution.md).

Customer targets:

- Cached public navigation feels immediate.
- Input/tap feedback under 100ms.
- API p95 for normal reads under 500ms from the deployment region.
- Quote/availability p95 under 1 second.
- LCP under 2.5 seconds on representative mobile conditions.
- CLS below 0.1.
- Compressed route JavaScript kept within an agreed budget.

Practices:

- Local PostgreSQL for development.
- Co-locate API, Redis and production database.
- Index actual query patterns.
- Avoid N+1 ORM queries.
- Use `select_related`/`prefetch_related`.
- Cache stable catalog reads.
- Do not cache mutable reservation truth.
- Stream/defer non-critical public content.
- React Query stale times based on data volatility.
- Prefetch likely next public routes and booking queries.
- Use responsive AVIF/WebP images.

Performance must be measured using a production build. `next dev` route compilation is not a production benchmark.

## Observability

### Logs

Structured fields:

- Trace ID
- User/partner ID where safe
- Booking/order/payment references
- Endpoint/task name
- Duration
- Result/error code

Never log OTPs, tokens, complete payment payloads or sensitive KYC data.

### Metrics

- API latency/error rate
- Quote and availability latency
- Capacity hold success/expiry
- Booking conversion funnel
- Payment success/failure/reconciliation
- Assignment/confirmation time
- Celery queue depth and task failure
- Notification delivery rate
- Database connections and slow queries

### Alerts

Critical:

- Payment webhook failures
- Reconciliation mismatch
- Reservation constraint errors above baseline
- Queue backlog
- Database/Redis unavailable
- Booking confirmation failure after payment

## CI/CD

Pull-request checks:

- Backend formatting/lint/type checks
- Django migration drift check
- Backend unit/integration tests
- Frontend lint/typecheck/tests
- Generated API client up to date
- E2E smoke for affected flow
- Dependency/security scan

Deployment order:

1. Backward-compatible database migration
2. Django API
3. Celery workers/scheduler
4. Frontend applications
5. Post-deploy smoke tests

Destructive schema removal occurs only in a later deployment after old code no longer reads the fields.

## Backups and recovery

Before staging/production:

- Automated database backups
- Tested restore procedure
- Point-in-time recovery appropriate to plan
- Object-storage lifecycle/backup policy
- Payment reconciliation runbook
- Queue replay/dead-letter runbook
- Incident contacts and severity levels

## Operational runbooks

Create runbooks for:

- Payment succeeded but booking not confirmed
- Capacity hold stuck
- Partner unavailable after confirmation
- Duplicate/late webhook
- OTP/SMS provider outage
- Geocoding outage
- Redis/Celery outage
- Refund retry
- Database restore
- Disable service/partner/region safely

## UI quality gate

Every customer-facing booking stage must pass:

- Keyboard-only use
- Screen-reader labels and logical focus
- 4.5:1 normal-text contrast
- 44×44px minimum touch targets
- Visible loading, success and error states
- Reduced motion
- Mobile sizes 375/768 and desktop 1024/1440
- No emoji as structural icons
- No horizontal overflow
- No fixed controls covering content
- Predictable back behaviour and preserved state
