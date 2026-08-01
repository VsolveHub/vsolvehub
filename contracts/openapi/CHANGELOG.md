# API Contract Changelog

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
