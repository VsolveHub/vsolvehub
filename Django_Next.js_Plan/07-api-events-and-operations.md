# API, Events and Operations

## API conventions

- Base path `/api/v1`.
- UTC ISO-8601 timestamps and explicit service-area timezone where relevant.
- Integer paise and ISO currency.
- Cursor pagination for operational collections.
- Stable machine error code, safe message, field errors, retryability and trace ID.
- Expected version/idempotency key on retryable mutations.
- Generated OpenAPI is the only frontend contract.

Command endpoints express business actions; generic CRUD is limited to draft/configuration resources.

## Core API groups

### Identity

```text
POST /auth/otp/request
POST /auth/otp/verify
POST /auth/logout
GET  /me
GET  /me/sessions
DELETE /me/sessions/{id}
POST /me/role
```

### Catalog, address and serviceability

```text
GET  /categories
GET  /services/{slug}
GET  /services/{slug}/configuration
GET|POST /addresses
PATCH|DELETE /addresses/{id}
POST /geocoding/reverse
POST /serviceability/check
```

### Cart, quote and checkout

```text
GET  /cart
POST /cart/items
PATCH|DELETE /cart/items/{id}
PUT  /cart/items/{id}/scope
POST /fulfilment-plan-sets
GET  /fulfilment-plan-sets/{reference}
POST /fulfilment-plans/{reference}/quotes
POST /checkout-sessions
GET  /checkout-sessions/{reference}
POST /checkout-sessions/{reference}/find-partner
POST /checkout-sessions/{reference}/cancel
POST /checkout-sessions/{reference}/payments
```

Cart mutations carry expected cart version. Plan alternatives publish unit membership, visit and
professional counts, unit windows, prices, compatibility/separation reasons and expiry. The selected
quote snapshots one plan; checkout never accepts client-authored grouping, Partner IDs, time, duration
or money.

There is no Customer provider-list endpoint. Partner identity appears only after accepted assignment
and disclosure policy allow it.

### Customer bookings

```text
GET  /bookings
GET  /bookings/{reference}
POST /bookings/{reference}/cancellation-quote
POST /bookings/{reference}/cancel
POST /bookings/{reference}/reschedule
POST /bookings/{reference}/address-change
POST /bookings/{reference}/amendments/{id}/approve
POST /bookings/{reference}/amendments/{id}/payments
POST /bookings/{reference}/completion/confirm
POST /bookings/{reference}/completion/dispute
POST /bookings/{reference}/support-cases
GET  /bookings/{reference}/invoice
```

### Partner

```text
GET|PATCH /partner/application
POST /partner/application/documents
POST /partner/application/submit
GET|PUT /partner/availability
POST /partner/availability/exceptions
POST /partner/presence/online|heartbeat|offline
GET  /partner/offers
POST /partner/offers/{id}/accept
POST /partner/offers/{id}/decline
POST /partner/offers/{id}/undo
POST /partner/offers/{id}/commit
GET  /partner/jobs
POST /partner/jobs/{reference}/en-route
POST /partner/jobs/{reference}/arrived
POST /partner/jobs/{reference}/customer-unavailable
POST /partner/jobs/{reference}/start-otp
POST /partner/jobs/{reference}/amendments
POST /partner/jobs/{reference}/abort
POST /partner/jobs/{reference}/completion
GET  /partner/earnings
GET|POST /partner/payout-accounts
GET  /partner/payouts
```

Archetype APIs are added with their owning milestone and namespace/use case. They do not pre-exist as
dead endpoints.

### Operations

```text
GET  /ops/cases
GET  /ops/cases/{reference}
POST /ops/cases/{reference}/assign
POST /ops/cases/{reference}/actions/{command}
POST /ops/bookings
POST /ops/bookings/{reference}/offer-partner
POST /ops/bookings/{reference}/reschedule|cancel|correct-eta
POST /ops/refunds/{reference}/retry|resolve
POST /ops/payouts/{reference}/reconcile
```

Every high-impact command requires permission, reason, expected state and audit. Maker-checker applies
to configured financial thresholds and sensitive account changes.

## Domain events

Events describe committed facts, for example:

```text
checkout.partner_search_started
booking_group.planned|confirmed|replan_required|cancelled
fulfilment_unit.matching_started|held|released|booked|recovery_required
partner.offer_created|accepted_provisional|committed|undone|declined|expired
reservation.tentative|confirmed|released
payment.captured|failed|ambiguous|refunded
booking.confirmed|recovery_required|cancelled
partner.en_route|arrived
booking.work_started|amendment_proposed|completion_submitted
booking.completed|partially_completed|disputed|aborted
case.opened|assigned|resolved|escalated
ledger.entry_available|payout_reserved|payout_paid|payout_ambiguous
```

Events are created through the outbox in the same transaction as the business fact. Consumers are
idempotent. Events never carry unnecessary complete addresses, KYC data, OTPs or payment payloads.

## Background jobs

Required families:

- OTP/session/checkout/offer/reservation expiry;
- notification delivery and retry;
- payment/refund/payout reconciliation;
- assignment recovery and lateness watchdogs;
- Booking Group planning expiry, all-unit hold coordination and idempotent compensation;
- completion-response and dispute-window deadlines;
- milestone reminders and archetype jobs when those features launch;
- invoice/credit-note generation;
- media processing and retention deletion;
- outbox publication and dead-letter recovery;
- metrics aggregation.

Jobs use database state and server time. ETA delivery is reinforced by read-time expiry checks; an
overdue Celery task cannot keep an expired offer valid.

## Notification delivery

Store intent, template/version, channel, provider result, delivery/interaction signal where available
and retry outcome. Provider acceptance is not device delivery, and device delivery is not human action.

Transactional messages have channel fallback appropriate to urgency. A failed non-critical marketing
message never affects a booking. An actionable Partner offer that cannot be delivered expires and moves
to the next candidate without blaming the Partner.

## Real-time transport

WebSocket/SSE/push may invalidate current queries. Bounded polling provides recovery. PostgreSQL state
and server deadlines remain authoritative. No browser controls dispatch, timeout, reassignment or
financial completion.

## Operations workspace

Operations is case-oriented rather than a collection of unrelated queues. Views include:

- active/late/recovery bookings;
- payment/refund/payout ambiguity;
- Partner onboarding and eligibility;
- partial-work, quality, warranty, safety and damage cases;
- service-area/catalog/configuration controls;
- notification failures and dependency health;
- audit timeline and maker-checker approvals.

Each case view shows Customer-safe and Partner-safe communication, financial exposure, current owner,
SLA, allowed commands and command result. Operations cannot set arbitrary status strings.

## Configuration and kill switches

Versioned configuration covers rates, fees, tax, commission, cancellation, serviceability, operating
hours, offer/payment TTL, evidence policy, SLA and notification templates. Feature flags control
archetype/service/area exposure.

Kill switches exist for new bookings, Instant, payment initiation, payouts, individual service areas
and providers. Recovery/read access remains available after a kill switch activates.
