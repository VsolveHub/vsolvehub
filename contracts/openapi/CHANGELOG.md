# API Contract Changelog

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
