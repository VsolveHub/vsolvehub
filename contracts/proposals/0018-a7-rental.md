# Proposal 0018 — A7 Rental MVP surface

**Author:** Cursor session (M3 Part A huge chunk)
**Date:** 15 September 2026
**Status:** **Proposed.** Spectacular publication and generated-client refresh follow.
**Consuming applications:** Customer (`/rentals/**`), Partner (`A7_RENTAL` workspace),
Operations (`/operations/rentals`)

## Product law

Rental ≠ Booking / FulfilmentUnit / visit OTP. Integer paise. Fail closed without ACTIVE
`A7VariantConfiguration` and approved `A7_RENTAL` capability. Deposit money may be PARTIAL
(test/seed hold) until Part B live Razorpay.

## Endpoints (MVP)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/rentals` | public |
| GET | `/api/v1/rentals/{asset_id}` | public |
| POST | `/api/v1/rentals/book` | customer |
| GET | `/api/v1/me/rentals` | customer |
| GET/POST | `/api/v1/partner/rentals/assets` | partner |
| POST | `/api/v1/partner/rentals/assets/{id}/submit` | partner |
| GET | `/api/v1/partner/rentals/bookings` | partner |
| POST | `/api/v1/partner/rentals/bookings/{id}/handover\|return\|release-deposit` | partner |
| GET | `/api/v1/ops/rentals` | ops |
| POST | `/api/v1/ops/rentals/{id}/moderate` | ops (reason required) |

Deposit states: REQUESTED → AUTHORIZED/HELD → RELEASED | PARTIALLY_CONSUMED | FULLY_CONSUMED.
