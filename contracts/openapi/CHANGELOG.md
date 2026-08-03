# API Contract Changelog

## 1.10.0 - Booking Group payments, unit refunds and financial documents

- Added idempotent Customer payment-attempt creation after all required Fulfilment Units have live
  Partner holds, plus Customer-owned attempt and checkout-payment recovery projections.
- Added immutable Payment Allocations for every Fulfilment Unit line. Provider capture, unit refund,
  invoice and credit-note totals reconcile to the selected group quote in integer paise.
- Added raw-body signed Razorpay webhook ingestion using provider event IDs, monotonic payment-state
  reduction and explicit reconciliation for duplicate, out-of-order and browser-redirect-loss cases.
- Added Finance-step-up unit refund creation/reconciliation and Customer-authorized refund reads.
  Failed or ambiguous provider commands remain visible as financial exceptions instead of becoming
  false success states.
- Added Customer-authorized group Order, per-unit Booking, invoice and credit-note retrieval. Live
  collections remain fail-closed until Razorpay credentials, webhook secret and CA/legal approval are
  explicitly configured.

## 1.9.0 - Booking Group recovery and unit-scoped dispatch

- Added Customer-authorized, cursor-paginated Booking Group list/detail projections and a versioned,
  idempotent pre-booking cancellation command with explicit server recovery actions.
- Re-keyed assignment attempts, Partner offers and PostgreSQL range reservations to individual
  Fulfilment Units while retaining nullable legacy Checkout references during migration.
- Partner offer polling is bounded and unit-scoped; each offer exposes only that unit's service
  lines, window and duration and never exposes sibling units or Customer data.
- Booking Group dispatch starts from a transactional outbox event and is reconciled by Celery. Offer,
  undo, group-search and payment-hold deadlines progress without an open browser; partial holds are
  released when any all-or-nothing unit cannot be fulfilled.
- Added Operations manual-offer recovery at Fulfilment Unit scope.

## 1.8.0 - Reviewed compatibility-rule lifecycle

- Added Operations-only compatibility-rule list/detail and draft, independent activation,
  rejection and retirement commands.
- Compatibility responses publish canonical exact-variant pairs, immutable configuration versions,
  effective windows, lifecycle state, maker/checker references and non-secret review reasons.
- Activation fails closed for inactive variants, overlapping windows, self-review, unsupported
  conditions and ordering dependencies on parallel rules.

## 1.7.0 - Multi-item fulfilment planning and Booking Groups

- Replaced the singleton Cart integration target with an optimistic-versioned Cart containing up to
  five independently scoped items. Explicit add/update/remove commands preserve stable item identity;
  a stale cart version fails without applying a partial mutation.
- Added immutable, expiring fulfilment Plan Sets with server-authored sequential, coordinated-parallel,
  independent-visit or mixed alternatives. Each alternative partitions every active Cart Item exactly
  once and exposes visit/professional counts, unit windows, reasons and server-calculated Money.
- Added selected-plan quotes with immutable Quote Units and Lines. Minimum-visit pricing applies per
  unit, the platform fee is charged once per group and allocated deterministically in paise.
- Checkout confirmation now materializes one Booking Group and one Fulfilment Unit per selected Plan
  Unit under the `ALL_OR_NOTHING` policy. Historical invalidated/expired/consumed quotes remain readable.
- Added effective-dated exact-variant compatibility rules. Missing rules fail safely to separate visits;
  same-category membership never proves grouping, and parallel plans require distinct eligible capacity.

Migration note: Customer clients must move from singleton `PUT /cart/`, `/booking/windows/` and
`POST /quotes/` integration to `/cart/items/`, `/fulfilment-plan-sets/` and `/plan-quotes/`. The old
paths remain an expand-phase compatibility surface only. Generate clients from 1.7.0 and do not infer
grouping, schedules, Partner counts, prices or allocations in the frontend.

## 1.6.0 - A1 catalog, arrival windows and complete quotes

- Replaced legacy public duration-picker metadata with the A1 fulfilment archetype, current task
  lines and the effective minimum service subtotal. Displayed starting prices now include the
  minimum-visit floor.
- Added authenticated, server-authored Today/Scheduled arrival windows. Window IDs are signed,
  short-lived and bound to the current cart item and address; availability is explicitly marked as
  preliminary until checkout revalidation.
- Quote creation now accepts only an address and opaque window ID. Responses include server time,
  expiry, immutable task/minimum/platform-fee lines, tax included in the total, the arrival window
  and versioned cancellation-policy bands.
- Singleton-cart replacement now returns `409 cart_item_limit_reached` with safe existing-item
  context and requires an explicit `replace_existing` confirmation.
- Checkout creation now rejects expired quotes and revalidates address, service area, operating
  hours, duration and arrival-window timing before creating the checkout.

Migration note: Customer clients must fetch `POST /booking/windows/` before creating a quote and
must stop sending `requested_start`, price, duration or total fields. Handle cart replacement as an
explicit confirmation flow, refresh windows on `window_no_longer_available`, and refresh the quote
on `quote_expired`.

## 1.5.0 — Private Partner documents and Operations review queue

- Replaced client-supplied document object metadata with a two-step private upload contract:
  Django issues a server-owned random object key and short-lived Supabase upload grant, then accepts
  only an upload ID plus the current application version for finalization.
- Finalization now verifies authoritative byte count, content type and SHA-256 before publishing a
  document. Documents expose fail-closed scan state and cannot be revealed or reviewed until clean.
- Added the bounded, cursor-paginated Operations Partner-application queue and masked detail read,
  including status/assignment filters and optimistic-concurrency claim ownership.
- Added assigned-reviewer-only, short-lived document review access. Application reads, document
  reveals and self-review denials are audited; permanent storage paths are not exposed by detail.
- Added explicit retryable storage failures and stable invalid/expired/replayed upload behavior.

Migration note: Partner clients must first call `POST /partner/application/documents/uploads/`,
upload directly with the returned signed grant, and finalize with
`POST /partner/application/documents/`. Remove any client-authored `object_key` request. Operations
clients must claim an application before revealing or reviewing documents and must treat review URLs
as ephemeral secrets.

## 1.4.0 — Step-wise Partner onboarding

- Added authenticated applicant reference endpoints for accepting service areas, active canonical
  Partner skills and current required consent documents.
- Added explicit Partner-area intake control and skill descriptions without exposing capacity or
  ranking inputs.
- Changed Partner application `PATCH` into a genuine partial optimistic-concurrency command:
  omitted fields are preserved, supplied selection sets are validated together and the complete
  updated application is returned.
- Linked new consent receipts to canonical versioned HTTPS legal-document records. Submission now
  fails closed when required consent configuration is missing, withdrawn or superseded.

Migration note: Partner onboarding clients should replace catalog-derived skill labels and any
locally supplied area/consent identifiers with the three reference endpoints. Existing application
updates must continue sending `expected_version`; only initial draft creation omits it.

## 1.3.0 — Browser session security and role-aware Operations

- Added a typed JSON CSRF bootstrap token for credentialed browser clients while retaining HttpOnly,
  Secure production cookies and explicit origin allowlists.
- Added OTP `code_length` and machine-readable throttle wait details.
- Changed `GET /auth/session/` to an anonymous-safe session projection containing nullable `user`,
  `active_role` and `session_expires_at` fields.
- Added `active_role` to OTP verification responses and kept backend-authored error/role codes in
  lowercase `snake_case`.
- Added representative OTP/session/conflict examples and typed required `Idempotency-Key` headers to
  the Customer and Operations-assisted checkout commands.
- Made customer-safe API exception messages authoritative and added the stable `csrf_failed` recovery
  code.
- Operations APIs now require the session's active Operations role as well as an unrevoked grant;
  authorization decisions are audited and Partner application/document self-review is forbidden.
- Backend quality now fails on migration drift, invalid OpenAPI or Django-to-committed-schema drift.

Migration note: consumers of the old current-session response must read user fields from `user` and
treat `user: null` as the ordinary signed-out state. Browser clients must retain the CSRF response
token in memory and refresh it after login or a `csrf_failed` response.

## 1.2.0 — Partner onboarding, eligibility and presence

- Added Partner application create/update/read and optimistic-version submission endpoints.
- Added versioned KYC document upload metadata and Operations review/state-transition commands.
- Added normalized Partner skill, service and service-area eligibility.
- Added weekly schedules, date exceptions and Redis-first online/heartbeat/offline presence.
- Added `retryable` to the standard API error envelope.

## 1.1.0 — Catalog and locations

- Added public Category, Service list/detail and booking-configuration endpoints.
- Added effective-dated authoritative “starts at” pricing.
- Added authenticated Customer address list/create/read/update/archive endpoints.
- Added reverse-geocoding with normalized response and recoverable provider failure.
- Added serviceability checks for PIN, service variant, full duration and operating hours.

## 1.0.0 — Foundation

- Added liveness endpoint.
- Added database/cache readiness endpoint.
- Added stable request-correlation header.
- Added standard API error-envelope policy.
- Added CSRF bootstrap endpoint.
- Added OTP request and verification endpoints.
- Added current-session and logout endpoints.
- Documented revocable cookie-session authentication.
