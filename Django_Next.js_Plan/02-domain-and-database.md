# Django Domain and Database Design

## Database environments

| Environment | Database | Rule |
|---|---|---|
| Developer | Local PostgreSQL in Docker | Fast, disposable, seeded |
| Automated tests | Isolated local PostgreSQL | Created/reset by test runner |
| Staging | Separate Supabase project | Production-like data policy |
| Production | Separate Supabase project | Backups, monitoring and restricted access |

Do not share one Supabase database between local development, staging and production.

## Migration authority

After cutover:

- Django migrations are the only schema migration system.
- Prisma migrations stop.
- Next.js/React applications have no database credentials.
- Migration commands use a direct database connection.
- Application traffic uses the supported pooled connection.
- Every schema change is reviewed and reproducible.

## Django app boundaries

### `identity`

Primary models:

- `User`
- `Role`
- `UserRole`
- `CustomerProfile`
- `OtpChallenge`
- `Session`
- `Device`
- `ConsentReceipt`
- `PrivacyRequest`

Rules:

- One identity model across Customer, Partner and Operations.
- Phone number is normalized and unique where required.
- Raw OTP values are never stored.
- OTP challenges expire, are single-use and are rate-limited.
- Admin/finance roles require stronger authentication.

### `catalog`

Primary models:

- `Category`
- `Subcategory`
- `Service`
- `ServiceVariant`
- `ServiceQuestion`
- `ServiceQuestionOption`
- `ServiceMedia`
- `ServicePolicy`

Important distinction:

- `Service` is the marketable offering.
- `ServiceVariant` is the actually priced/bookable unit.

Example:

```text
Service: Switch / Socket Repair
Variants:
  - Inspection
  - Repair one switch/socket
  - Replace switch/socket
```

Every active variant must have:

- Starting price
- Pricing strategy
- Minimum duration
- Duration increment
- Maximum duration
- Required skill
- Tax category
- Serviceability rules
- Effective date range

### `locations`

Primary models:

- `Address`
- `ServiceArea`
- `ServiceAreaOperatingWindow`
- `ServiceAreaOperatingException`
- `PostalCode`
- `GeoPoint`

Rules:

- Address belongs to a customer.
- Latitude/longitude and normalized address are stored separately.
- Customer confirms the final service address.
- No hardcoded Hyderabad fallback.
- Serviceability is checked before scope/payment.

### `partners`

Primary models:

- `PartnerProfile`
- `PartnerApplication`
- `PartnerConsent`
- `PartnerDocument`
- `PartnerSkill`
- `PartnerService`
- `PartnerServiceArea`
- `PartnerAvailabilityRule`
- `PartnerAvailabilityException`
- `PartnerPresence`
- `PartnerOnlineSession`
- `JobAssignment` (replaces the previously listed `JobOffer`; Instant is acknowledge-and-assign per
  ADR-029 — see [doc 11 §9](./11-payment-first-instant-and-cancellation-policy.md))
- `WorkTask`
- `WorkEvidence`
- `PartnerLedgerEntry`
- `PayoutAccount`
- `PayoutAttempt`
- `CustomerPreferredPartner`
- `CustomerPartnerBlock`
- `SafetyReport`
- `PartnerBackgroundCheck`

Rules:

- Partner account, application, KYC, service eligibility, scheduled availability and live presence are separate concepts.
- Application status is explicit: `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUIRED`, `APPROVED`, `SUSPENDED`, or `OFFBOARDED`.
- KYC documents are versioned; a replacement never erases the review history of an earlier upload.
- Terms and policy consent records include document version, timestamp, IP/device context and the acting partner.
- Published availability is an operational commitment.
- Instant online presence requires a recent heartbeat and expires automatically; a Boolean alone cannot keep a partner online forever.
- An assignment card shows the partner's estimated net earning, not the customer's gross order total.
- Required work tasks and evidence are persisted and enforced by the backend before completion.
- Earnings are immutable ledger entries; payout attempts reserve eligible entries and use provider idempotency.
- Partner ranking is explainable and versioned.
- Preferred/past partners are suggestions, not bypasses around eligibility.

### `availability`

Primary models:

- `CapacityHold`
- `PartnerReservation`
- `AvailabilitySearchLog`

`PartnerReservation` includes:

- `partner_id`
- `checkout_session_id` and `cart_item_id` while held
- `booking_id` after conversion
- `starts_at`
- `ends_at`
- `service_range`
- `occupied_range`
- `buffer_policy_version`
- `status`
- `expires_at`
- `reservation_token`

PostgreSQL must prevent overlapping active `occupied_range` values for one Partner. The occupied
range includes travel/service buffers around `service_range`; protecting only service start/end
would permit physically impossible consecutive jobs. Use a database-level exclusion constraint or
an equivalent transactional constraint, not only an application-side check.

Milestone 1 models one human Partner as one capacity unit. Provider organizations/crews require
named worker resources and are deferred; do not represent an unidentified firm by increasing a
person's capacity integer.

### `pricing`

Primary models:

- `ServiceRate`
- `FeeRule`
- `TaxRule`
- `PriceQuote`
- `PriceQuoteLine`
- `PriceRevision`
- `CancellationPolicy`
- `CancellationPolicyTier`

Rules:

- Money is stored as integer paise.
- Percentage calculations use decimal arithmetic and each persisted line is rounded half-up to one
  paise unless an approved tax configuration requires another rule.
- The payable total is the exact sum of persisted lines; any required reconciliation is an explicit
  `ROUNDING_ADJUSTMENT` line.
- The server returns an itemized quote.
- Quotes have a version and expiry.
- Quote lines are immutable after booking confirmation.
- Displayed totals use the same quote snapshot everywhere.
- GST applicability and invoice breakdown come from tax configuration, not UI constants.

Typical quote lines:

- Base service
- Duration adjustment
- Scope/quantity adjustment
- Add-on products
- Platform fee
- GST on applicable components
- Discount/credit
- Final payable

`Discount/credit` is a reserved line kind. Coupons, wallet credits and promotion funding are
deferred and cannot be emitted until their funding/refund policy models are approved.

### `carts`

Primary models:

- `Cart`
- `CartItem`
- `CartItemScope`
- `CheckoutSession`

`Cart` is the only container for unfinished customer selections.

Suggested `Cart` fields:

- `customer_id`
- `status`
- `currency`
- `created_at`
- `updated_at`
- `expires_at`
- `version`

Suggested `CartItem` fields:

- `cart_id`
- `service_variant_id`
- `address_id`
- `fulfilment_type`
- `scheduled_start`
- `duration_minutes`
- `preferred_partner_id`
- `customer_note`
- `status`

`CartItemScope` stores selected requirements, quantities and option references. It is editable until checkout begins.

Recommended cart statuses:

```text
ACTIVE
CHECKOUT_LOCKED
CONVERTED
ABANDONED
EXPIRED
```

`CheckoutSession` is a short-lived immutable snapshot of the cart items being purchased. It owns:

- Accepted quote/version
- Capacity holds
- Checkout expiry
- Selected payment method
- Idempotency key
- Conversion result

Recommended checkout statuses:

```text
CREATED
CAPACITY_HELD
PAYMENT_PENDING
COMPLETED
EXPIRED
FAILED
```

Rules:

- An authenticated customer has at most one active cart per currency/channel.
- A single-service customer may skip a visible cart page, but the selection is still stored as a `CartItem`.
- Starting checkout locks the selected cart-item versions.
- Editing a locked item invalidates the checkout session and creates a new quote/hold.
- Converted cart items cannot be converted again.
- Cart rows may expire; financial and booking rows may not be deleted as cleanup.

### `bookings`

Primary models:

- `Booking`
- `BookingScopeItem`
- `BookingStatusHistory`
- `BookingOtp`
- `WorkSession`
- `BookingExtension`
- `BookingNote`
- `BookingMedia`
- `CancellationCase`
- `BookingAmendment`

`Booking` represents one operational visit:

- One address
- One service/variant
- One slot
- One assigned partner
- One OTP start contract
- One work timer
- One lifecycle

### `orders`

Primary models:

- `Order`
- `OrderBooking`
- `OrderLine`
- `Invoice`
- `InvoiceLine`
- `DocumentSeries`
- `CreditNote`
- `CreditNoteLine`

An order is financial grouping. A booking is operational work.

One order can contain multiple bookings, but each booking keeps its own:

- Provider
- Slot
- Status
- Cancellation result
- Service completion

### `payments`

Primary models:

- `PaymentAttempt`
- `PaymentEvent`
- `Refund`
- `ReconciliationRecord`
- `Dispute`

Rules:

- Idempotency key is mandatory for payment creation.
- Provider webhook events are persisted before processing.
- Duplicate webhooks are safe.
- Browser redirect is not proof of payment.
- Captures/refunds are traceable to order and booking.
- Financial rows are not hard-deleted.
- Out-of-order provider events are reduced through allowed monotonic transitions and reconciled
  against provider truth; event de-duplication alone is insufficient.

### `compliance`

Primary models:

- `TaxRegistration`
- `StatutoryDeductionRule`
- `RetentionPolicy`
- `NotificationTemplateRegistration`

Tax rules include supplier of record, tax-liable party, service classification, place of supply,
registration facts, effective dates and document issuer. Marketplace GST/TCS/TDS applicability and
rates are configuration approved by qualified Indian tax/legal reviewers, never UI constants.

### `notifications` and `audit`

Primary models:

- `OutboxEvent`
- `Notification`
- `NotificationDelivery`
- `AuditEntry`

The transactional outbox records an event in the same database transaction as the business change. Celery publishes/delivers it afterward.

## Same service added twice

### Same visit

Customer wants two switches repaired at the same address and time:

```text
Booking
  service = Switch / Socket Repair
  slot = 10:00
  partner = Partner A

BookingScopeItem
  code = switch_repair
  quantity = 2
  unit_price = ₹199
  line_total = ₹398
```

Result:

- One booking
- One provider
- One slot
- One OTP
- One timer
- One invoice grouping

### Separate visits

If the customer explicitly wants different times, addresses or providers, create separate cart items that convert into separate bookings.

### Different services

Different services may be grouped in one order, but they remain separate bookings and require individual capacity holds.

## Booking lifecycle

Recommended status values:

```text
CONFIRMED
PARTNER_ARRIVING
READY_TO_START
IN_PROGRESS
OVERTIME
COMPLETED
CANCELLED
EXPIRED
FAILED
```

Do not use one status field to represent payment, provider and work state simultaneously.

Separate state dimensions:

- `booking_status`
- `payment_status`
- `reservation_status`
- `assignment_status`

State changes are performed by named domain commands and appended to history.

Pre-booking states such as cart, quote, hold and payment pending belong to `Cart`, `CheckoutSession`, `PriceQuote`, `CapacityHold` and `PaymentAttempt`. They are deliberately excluded from the booking lifecycle.

## Duration and overtime

Each variant defines:

- Default/recommended duration
- Minimum duration
- Increment, normally 30 minutes
- Maximum duration
- Rate calculation policy

Customer sees the recommended value and may select a supported duration. The backend recalculates the quote.

After start OTP verification:

- `WorkSession.started_at` is set by the backend clock.
- Remaining time is derived from timestamps, not trusted browser intervals.
- The UI may animate a local countdown but regularly reconciles with server time.
- At zero, state becomes overtime.
- Overtime does not silently charge.
- Customer-approved extension creates `BookingExtension` and `PriceRevision`.

## Database reset plan

Because the system is in development, the existing tables may be removed only after:

1. New Django migrations can create the database from zero.
2. Deterministic seeds create users, partners, catalog, availability and test addresses.
3. Technician API contract tests pass.
4. Technician browser E2E passes.
5. The current database is exported for reference.
6. The user explicitly authorizes the reset.

The reset is a cutover operation, not the first implementation step.
