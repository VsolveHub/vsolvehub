# Milestone 1 Authoritative Resolution

**Status:** Accepted planning baseline  
**Date:** 30 July 2026  
**Scope:** Technician Customer, Partner and Operations vertical slice

This document resolves the contradictions and missing decisions found during the second architecture
review. If an older planning document disagrees with this document, this document takes precedence
until the older text is corrected.

> **⚠ Superseded sections — do not implement from this document alone.**
> [10-instant-dispatch-and-decision-resolution.md](./10-instant-dispatch-and-decision-resolution.md)
> and [11-payment-first-instant-and-cancellation-policy.md](./11-payment-first-instant-and-cancellation-policy.md)
> take precedence over the following, in that order (doc 11 wins where 10 and 11 disagree):
>
> | Section here | Superseded by | What changed |
> |---|---|---|
> | §5 stage sequence ("choose Auto Assign or an eligible Partner" as a shared step) | doc 10 §2.1 | Instant and Scheduled are different stage sequences; Instant has no provider-selection screen |
> | §6 "Instant" steps 1–7 (offer acceptance before payment) | **doc 11 §2** | Instant captures payment **first**, then assigns. Scheduled steps 1–7 are unchanged |
> | §6.1 Instant eligibility (presence + push channel) | doc 10 §8.4 | Full 11-condition gate |
> | §8 "There is no customer map... `EN_ROUTE` is a Partner status action, not a location feed" | — | **Unchanged and reaffirmed** (ADR-030). Doc 11 §7 adds only how the estimated arrival time is presented as text |
> | §11 cancellation policy bands (model scaffolded, bands unpopulated) | **doc 11 §5** | Instant and Scheduled refund/fee/compensation ladders populated; Partner compensation is a capped dispatch fee, not a percentage of job value |
>
> Everything else in this document remains authoritative.

## 1. Fixed technology and application decisions

| Concern | Milestone 1 decision | Why |
|---|---|---|
| Business backend | Django + Django REST Framework modular monolith | One transaction, authorization and domain boundary |
| Database | PostgreSQL; local Docker for development, separately managed environments later | Correct range constraints, transactions and reproducible development |
| Background work | Celery with Redis broker/coordination | Expiry, notification and recovery survive browser closure |
| Customer | Existing Next.js App Router app | Public SEO plus React application capability |
| Partner | Existing Next.js App Router app | Avoid framework churn; make the private area a persistent React workspace |
| Operations | Existing `web/apps/admin` Next.js app, labelled **Operations** | The app already exists; do not create a duplicate `operations` app |
| Client server-state | TanStack Query through a generated Django OpenAPI client | Typed caching, mutation and recovery without client business truth |
| Schema authority | Django ORM and Django migrations only | No dual migration or write authority |
| Prisma | Not used anywhere in the new implementation | Legacy files are read-only migration reference until removal |
| Vite | Not part of Milestone 1 | It does not fix slow APIs or server-heavy page boundaries |

Next.js is React. Click-heavy screens become fast by keeping stable layouts mounted, using client-side
navigation, prefetching on intent, hydrating useful initial data, setting query freshness deliberately,
and invalidating only related query keys. Turborepo tasks remain package-owned; the root only
delegates with `turbo run`.

## 2. Physical application names

The Milestone 1 frontend applications are:

```text
web/apps/customer    # Customer product
web/apps/partner     # Partner product
web/apps/admin       # Operations product
```

Do not rename `admin` and do not create `web/apps/operations` during the vertical slice. A rename
would touch deployments, environment variables, package filters, tests and documentation without
adding customer value.

## 3. Contract collaboration

The current OpenAPI document has only foundation endpoints. That must not block frontend discovery
and must not permit invented DTOs.

```text
contracts/proposals/**    # Claude may propose required use cases and examples
contracts/openapi/v1.yaml # Generated from Django; Codex publishes
web/packages/api-client   # Generated from the published OpenAPI contract
```

A proposal contains:

- Consuming screen and user action
- Required authorization
- Example request and success response
- Validation, conflict, expiry and retry outcomes
- User-visible recovery wording

Codex reviews the proposal, designs the domain command, implements it in Django, generates OpenAPI
and records any rejected/changed behavior. A proposal is never imported by application code.

## 4. Authoritative booking concepts

| Concept | Meaning |
|---|---|
| `Cart` | Customer's editable shopping container |
| `CartItem` | One intended operational visit |
| `CheckoutSession` | Immutable item versions, quote and temporary capacity commitments |
| `CapacityHold` | Expiring right to convert specific Partner capacity |
| `PartnerReservation` | Held or confirmed occupied time range |
| `Order` | Financial grouping for one or more bookings |
| `Booking` | One confirmed operational visit |
| `WorkSession` | Server-timed work after start OTP |
| `PriceRevision` | Immutable proposed financial change after booking |
| `BookingExtension` | Requested/approved extra time tied to a paid revision |

Two identical scope units for one address, Partner and visit remain one `CartItem`, one `Booking` and
a quantity-two scope line. Two visits, addresses, Partners or independently selected slots are two
cart items and later two bookings. One order may pay for several bookings, but each booking keeps its
own capacity and lifecycle.

## 5. Customer booking flow

```text
Discover
  -> confirm address and serviceability
  -> select Instant or Scheduled (nothing preselected)
  -> answer scope questions
  -> accept/edit recommended duration
  -> choose Auto Assign or an eligible Partner
  -> obtain Partner commitment
  -> review complete quote and policy
  -> login and automatically resume the pending action
  -> pay
  -> authoritative confirmation
```

For one service, show its slot card directly. For multiple services, configure each cart item
individually. No placeholder/default slot is ever treated as consent.

Provider cards show only Partners that pass skill, KYC, service area, operating hours, full-duration
capacity, travel buffer, customer block and self-assignment gates. Past/preferred Partners are a
ranking signal, not an eligibility bypass.

## 6. Scheduled and Instant commitment

### Scheduled

Published scheduled availability is a Partner commitment.

1. Customer selects a date/window in the next seven days.
2. Backend searches the entire service interval plus travel/buffer occupancy.
3. Auto Assign ranks a candidate, or the customer selects an eligible displayed Partner.
4. Backend atomically creates a provider-specific `CapacityHold` and held reservation.
5. Customer pays before the hold's safe payment-start cutoff.
6. Authoritative payment success converts the hold to a confirmed reservation and creates the
   booking exactly once.
7. Partner is notified of the committed booking; this is not a post-payment offer to decline.

### Instant

> **⚠ Superseded by ADR-028/029 —
> [doc 11 §2 and §3](./11-payment-first-instant-and-cancellation-policy.md).** The steps below describe
> the previous offer-first model and are retained only as the record of why the ordering was reversed.
> **Do not implement them.** The current sequence is: pool pre-check → pay → assign a ranked Partner who
> must acknowledge → reassign if unacknowledged → confirmed.

Previous model (historical): Instant required affirmative Partner acceptance before payment.

1. Backend searches eligible Partners with fresh presence and a valid push channel.
2. It creates an expiring `JobOffer`; the customer sees **Finding a professional**.
3. One valid Partner acceptance wins transactionally.
4. Acceptance creates the provider-specific `CapacityHold`.
5. The customer proceeds to quote review/payment.
6. Payment success creates the booking and confirmed reservation.
7. If no Partner accepts, the customer is not charged and is offered Scheduled booking.

Do not hold Partner A, take payment, and then ask Partner A to accept. Do not call an Instant job
confirmed before an accepted offer and successful payment.

**Note on the first rule above, which the new model contradicts.** ADR-028/029 do take payment and then
require the assigned Partner to acknowledge — the shape this rule was written to forbid. The principle it
was protecting survives: *a paid customer must never be left dependent on one Partner's discretion with no
recovery path.* Acknowledge-and-assign satisfies that differently — the job is assigned rather than
offered, so declining is an exception with a consequence rather than a free choice
([doc 11 §3.4](./11-payment-first-instant-and-cancellation-policy.md)); non-acknowledgement triggers
bounded automatic reassignment; the stall watchdog (doc 11 §10) catches a Partner who acknowledges and
then does not go; and a full refund is guaranteed if nobody confirms.

The second sentence holds unchanged and is stronger now: an Instant job is never called confirmed before a
Partner has **acknowledged** and payment has succeeded.

## 7. Capacity, travel and time correctness

Store both:

- `service_range`: the promised service start/end.
- `occupied_range`: pre-travel/buffer + service + post-travel/buffer.

PostgreSQL overlap protection applies to the active `occupied_range`, not only service time. Buffer
policy is versioned by service area/variant; route-time estimation may enlarge it but never shrink
below the configured minimum.

All ranges are timezone-aware instants stored in UTC. Availability rules are expanded in the service
area's IANA timezone, so midnight-spanning work remains valid.

`ServiceAreaOperatingWindow` and dated exceptions limit both Scheduled and Instant service hours.

Milestone 1 assigns one human Partner to one booking and consumes one unit. Multi-worker provider
organizations are a later workforce domain; a numeric `capacity_units` on one person's calendar
would hide which worker is responsible and is therefore not added as a shortcut.

### Hold/payment race

- Holds expose `expires_at`, `payment_start_deadline` and `server_now`.
- New payment is disabled before expiry using a configurable safety window.
- Payment creation locks and revalidates the hold.
- A provider success received just after expiry enters reconciliation, attempts an atomic reacquire
  of the exact capacity, and creates the booking only if that succeeds.
- If capacity cannot be reacquired, the payment is immediately voided/refunded and no booking is
  created. This rare race is monitored; it is not presented as normal booking behavior.

## 8. Fixed-service fulfilment without live tracking

Customer state:

```text
CONFIRMED
  -> PARTNER_ASSIGNED
  -> PARTNER_EN_ROUTE
  -> PARTNER_ARRIVED
  -> IN_PROGRESS
  -> OVERTIME | EXTENDED
  -> COMPLETED
```

There is no customer map, continuous GPS stream, Partner coordinate history or fake moving marker.
`EN_ROUTE` is a Partner status action, not a location feed.

### Arrived

The Partner taps **Arrived** after physically reaching the service address.

The Django command:

1. Authorizes assignment ownership and a valid state transition.
2. Records `arrived_at` using server time.
3. Appends booking history and an outbox event in the same transaction.
4. Causes in-app and configured push/SMS notification: **Your professional has arrived**.
5. Makes the start-OTP step available.

Duplicate arrival taps are idempotent. Arrival does not start paid work time.

### OTP and countdown

The Customer shares the displayed start OTP with the assigned Partner. The Partner submits it.

Successful Django verification atomically:

- Applies attempt/expiry/rate limits
- Consumes the OTP
- Creates `WorkSession.started_at`
- Sets `included_duration_minutes`
- Calculates `included_ends_at`
- Transitions the booking to `IN_PROGRESS`
- Emits `booking.work_started`

The API returns `server_now`, `started_at` and `included_ends_at`. React measures server offset and
renders the local one-second display from those timestamps. It does not call the server every
second. TanStack Query refetches on reconnect/focus and receives event-driven invalidation where
available.

At zero the UI changes to **Work exceeds booked time by HH:MM:SS**. Overtime never silently changes
the customer's bill.

## 9. Extension and parts collection

Milestone 1 is online-pay-first. COD/Pay after service is not displayed.

### Extension

1. Partner or Customer requests an allowed increment.
2. Backend rechecks the enlarged occupied range against the next reservation and operating hours.
3. Pricing creates an immutable `PriceRevision`.
4. Customer sees extra minutes, amount, tax, new end time and decline option.
5. Approval creates a separate idempotent online payment attempt.
6. Only authoritative payment success marks the extension approved and moves
   `included_ends_at`.

If capacity or payment fails, the deadline does not move. Extension approval and job completion use
row/version locks so only a valid ordering wins.

### Parts

1. Partner submits catalog part, quantity, evidence and reason.
2. Backend quotes it; free-text price never becomes chargeable directly.
3. Customer approves and pays the revision.
4. Only paid/zero-value approved parts become authorized work lines.
5. Invoice and Partner settlement reference the same revision lines.

No reusable off-session mandate is assumed in Milestone 1. If the business later adopts one, it
requires provider/legal review and explicit customer consent.

### Unapproved overtime and abandoned sessions

- Overtime is visible but non-billable until an extension is approved.
- At configurable thresholds, notify both parties and Operations.
- Block further extension after the service-specific maximum.
- Do not auto-claim that physical work ended. Mark the session `OVERTIME_ESCALATED` for Operations
  if the Partner never completes it.
- If unapproved overrun threatens the next reservation, create an at-risk event and start
  replacement/customer-notification handling for the next booking.

## 10. Money and payment invariants

- Store integer paise only.
- Calculate percentage/tax amounts with decimal arithmetic.
- Round each persisted invoice line to the nearest paise using half-up unless the reviewed tax
  configuration requires another method.
- Invoice total is exactly the sum of persisted rounded lines.
- If an external document total requires reconciliation, use a visible `ROUNDING_ADJUSTMENT` line;
  never alter the final total invisibly.
- Capture booking payment after capacity commitment; do not rely on a long-lived authorization for
  future Scheduled work.
- Persist every provider webhook before processing.
- Dedupe by provider event ID and reduce events through allowed state transitions.
- An out-of-order event cannot regress state. Reconcile against provider truth when sequence is
  ambiguous.
- Every payment attempt has an idempotency key, purpose (`BOOKING`, `EXTENSION`, `PARTS`) and
  exactly one business target.
- The browser redirect is never payment authority.
- The checkout-resume screen can recover `PENDING`, `SUCCEEDED`, `FAILED` and `REFUNDED` after
  refresh, redirect loss or network failure.

COD/Pay after service, coupons, credits, surge pricing and chargeback self-service are deferred.
The ledger nevertheless supports signed debit/credit entries, `available_at`, reversals, statutory
deductions and a negative recoverable Partner balance so refunds after payout are not destructive
edits.

Chargebacks and disputes require immutable `Dispute`, evidence, deadline, outcome and ledger
adjustment records before live cards are enabled. Manual adjustments and high-value refunds use
maker-checker approval.

## 11. Cancellation, reschedule and amendments

### Policy model

Use versioned `CancellationPolicy` and `CancellationPolicyTier` records keyed by service, actor and
time-to-start. A cancellation quote states:

- Customer refund
- Cancellation fee and tax
- Partner compensation
- Platform adjustment
- Policy/version and reason

The accepted quote is snapshotted. Never calculate a refund from today's policy for an old booking.

### Customer cancellation

Authorize, quote, accept, transition, release capacity, initiate refund, update Partner ledger and
notify through one idempotent command/outbox flow.

### Partner cancellation

Release the assignment and immediately begin backend recovery. Notify the Customer of delay without
claiming a replacement. Use service-area policy for recovery deadline. If no replacement commits by
the deadline, cancel, fully refund applicable Customer collections, record Partner policy action and
optionally issue a separately accounted service-recovery credit.

### Reschedule

Do not mutate the existing reservation first:

1. Search and hold the new full interval.
2. Quote policy fee and price delta.
3. Customer approves and settles positive/negative delta.
4. Atomically swap booking reservation/Partner and release the old reservation.
5. Notify old/new Partner and Customer.

Failure leaves the original booking intact.

### Address change

A confirmed booking address is immutable. A requested address change is an amendment using the same
new-hold-first process as reschedule because serviceability, travel, Partner and price can all change.

## 12. Reviews, preference, blocking and reports

- Only the booking Customer can review a completed booking.
- One review per booking; configurable submission/edit windows.
- Partner may post one moderated reply.
- Cancellation does not create a normal service-quality review; use the incident/support flow.
- Rating uses a neutral prior/minimum evidence, not a zero-rating hard gate.
- Ranking includes fairness/exploration so new eligible Partners can receive work.
- `CustomerPartnerBlock` is a hard mutual matching exclusion with reason, source and audit history.
- `SafetyReport`/`Incident` supports Customer or Partner reporting, evidence, severity, restricted
  access and Operations resolution.
- A Partner is always excluded from their own Customer booking.

## 13. India tax, documents and privacy readiness

Tax is a versioned rule engine, not frontend arithmetic. It must represent:

- Supplier of record and tax-liable party
- Customer, Partner and platform registrations
- Service classification and effective period
- Place of supply and intra/inter-state split
- Tax component lines
- Marketplace TCS/TDS/statutory deductions where applicable
- Partner settlement statements
- Invoice and credit-note issuer/series

Do not hardcode percentages copied from an audit. Rates and scope change. For example, the current
official Income Tax text for section 194-O differs from the one-percent figure in the review report.

Use `DocumentSeries` with financial year, document type, legal entity and locked next number.
Allocate a number only when issuing inside a transaction. Issued documents are immutable; voids are
retained. Refund tax adjustment produces a credit note when the reviewed tax policy requires it.

Before production payments/invoices, a qualified Indian CA/legal reviewer must approve:

- Which Technician services fall under e-commerce-operator GST treatment
- Supplier/invoice shape for registered and unregistered Partners
- Place-of-supply and CGST/SGST/IGST logic
- TCS/TDS bases, rates, exemptions, returns and statements
- Invoice/credit-note numbering and retention

Privacy foundation:

- Versioned notice and `ConsentReceipt` by purpose/channel
- Data inventory and `RetentionPolicy`
- `PrivacyRequest` for access, correction, erasure and grievance handling
- Field-level access control and audit for KYC, addresses and home evidence
- Erase/anonymize operational PII when allowed; retain legally required financial documents with
  minimized or tokenized identity links
- Breach incident workflow and notification runbook
- Evidence-media consent, signed access, EXIF stripping and scheduled deletion

SMS uses a registered sender/header/template registry and records the exact template/channel used.
OTP has a configured fallback channel and provider failover; fallback must preserve OTP rate limits
and purpose. Production readiness follows current TRAI and provider requirements.

Official references to re-check during compliance sign-off:

- CBIC e-commerce FAQ and section 9(5)/section 52 material
- Income Tax Department section 194-O current text
- MeitY DPDP Act 2023 and DPDP Rules 2025/effective dates
- TRAI sender, header, content-template and consent guidance

## 14. Safety and identity controls

Milestone 1 includes:

- Customer and Partner SOS/report action during an active visit
- Emergency/support contact with booking context and audit trail
- Masked calling/relay; raw phone numbers are not exchanged by default
- Versioned identity, address, bank and required background-verification records
- Cooling period, step-up verification and old-channel notification for payout-account changes
- Customer consent and least-privilege access for home/interior evidence
- Phone-change and account-recovery workflow
- Step-up/risk review after long dormancy or device change to reduce recycled-number account takeover
- One User may hold Customer and Partner roles, with explicit role switching and self-booking
  exclusion
- No hidden support impersonation. Use audited, reason-bound, time-limited support view; mutations
  require normal privileged commands.

## 15. Frontend runtime rules

### Partner backgrounding

Browser heartbeat alone cannot prove an app can receive an Instant offer while backgrounded.
Instant availability requires:

- Fresh server presence
- Valid Web Push subscription/device capability
- Notification permission
- Recent Partner activity

If these are absent, the UI must state that Instant jobs cannot be received reliably; Scheduled
work remains available. Wake Lock is optional foreground assistance, never the guarantee.

### Multiple tabs

- Broadcast logout, active checkout and mutation completion through `BroadcastChannel` with a
  storage-event fallback.
- Server idempotency and version checks remain authoritative.
- A second tab must resume or reject the same checkout; it cannot create a parallel conversion.

### Server time

Every time-sensitive payload includes `server_now`. The client calculates offset from request
midpoint/response and periodically re-synchronizes. Holds, offers, OTP and work countdowns use the
adjusted clock.

### Localization and content

- Add message keys/localization plumbing in the design-system wave.
- English may be the only Milestone 1 translation; Telugu/Hindi can follow without component
  rewrites.
- Milestone 1 is explicitly light theme; dark mode is deferred.
- Test long addresses, long service names, large Indian-formatted totals and 200% text zoom.

### Uploads and OTP

- Use signed direct/resumable uploads, progress and retry.
- Validate type/size server-side; handle HEIC/orientation, strip EXIF and generate safe derivatives
  asynchronously.
- Do not trust client compression as the only control.
- OTP input supports `autocomplete="one-time-code"`, paste, mobile numeric keyboard, Android
  retrieval where supported, and a screen-reader-correct semantic input.

### Query behavior

- Use hierarchical query-key factories.
- Include every input affecting availability/quote in the key.
- Catalog can have longer freshness; offer, hold and active booking state is short-lived.
- Mutations invalidate/update only related entities and provide rollback for truly optimistic UI.
- Do not optimistically claim payment, capacity, arrival, OTP or completion success.
- Event delivery invalidates cached state; bounded polling is a recovery mechanism only.

## 16. Feature flags, kill switches, references and load targets

- Public Order/Booking/Invoice references use at least 128 bits of cryptographic randomness encoded
  in a URL-safe form. Internal database IDs are never accepted as public authorization.
- `FeatureFlag` and `FeatureFlagOverride` are PostgreSQL truth with audited changes and cached reads.
- `ServiceAvailabilityOverride` can disable a service/area/fulfilment type without deployment.
- Payment and payout kill switches fail closed and preserve recovery access.
- Rollback instructions may mention a flag only after that flag exists and is tested.

Initial production-like test assumptions—not sales promises:

| Workload | Gate |
|---|---|
| 1,000 online Partners, 30-second foreground heartbeat | Sustain about 34 heartbeats/second plus burst with bounded DB writes |
| Availability search | p95 under 500 ms at 100 requests/second on production-like indexed data |
| Core non-provider API | p95 under 400 ms; p99 under 1 second |
| Booking/payment command excluding gateway latency | p95 under 800 ms |
| Notification/outbox pickup | p95 under 5 seconds |
| Customer status convergence after Arrived/work start | p95 under 5 seconds |

Heartbeat state should be Redis-first with periodic/audited session persistence, not an unbounded
PostgreSQL row update every 30 seconds. Capacity and booking truth remain PostgreSQL-only.

## 17. Milestone classification

### Must be designed and built in Milestone 1

- Fixed stack/app boundaries and contract proposal lane
- Scheduled hold and Instant accept-before-pay
- Travel-aware full-duration capacity
- Online booking and revision collection/reconciliation
- Arrival notification, OTP timer, overtime and paid extension
- Cancellation, Partner recovery, reschedule and address amendment
- Review cold start, block/report and self-assignment exclusion
- Tax/document/ledger schema plus professional compliance sign-off
- Privacy retention/rights foundation, masked contact and SOS
- Web Push requirement for background Instant offers
- Payment resume, multi-tab and server-clock behavior
- Random public references, feature flags, kill switches and load tests

### Schema-ready but later product UI

- Gender preference as a typed future matching preference
- Chargeback/dispute Operations UI if live cards are not yet enabled
- Additional languages after localization plumbing
- More advanced Partner risk and background-verification integrations

### Explicitly deferred

- Vite migration
- COD/Pay after service and Partner cash collection
- Coupons, wallet and promotions
- Dynamic/surge pricing
- Provider firms/crews and capacity greater than one
- Native apps and continuous GPS
- Dark mode

## 18. No remaining product blocker

The Booking engine now has one consistent route:

- Scheduled capacity is committed before payment.
- Instant captures payment first, then assigns automatically (ADR-028; this line reverses the original
  "Instant Partner acceptance happens before payment").
- Payment creates, rather than precedes, an authoritative Booking. For Instant that Booking begins in
  `PAID_UNASSIGNED` and must reach assignment, reschedule or refund — never silent expiry.
- Arrival is an audited notification action.
- OTP verification starts the server timer.
- Countdown, overtime, extension and parts are timestamped and financially auditable.
- No customer-facing live tracking exists — no map, marker, position ping or location history. Status
  timeline plus an estimated arrival time as text (ADR-013, ADR-030).

Implementation can proceed in vertical capabilities after the OpenAPI proposal/publication loop is
in place. Compliance configuration and live provider credentials remain production gates, not
blockers to building the sandboxed vertical slice.
