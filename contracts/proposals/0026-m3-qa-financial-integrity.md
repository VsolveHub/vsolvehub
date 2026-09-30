# Proposal 0026 — M3 QA Financial Integrity

**Author:** Cursor (M3 QA Tasks 1–9 contracts gate)  
**Date:** 29 September 2026  
**Status:** **Published** (backend + OpenAPI aligned; owner verification pending)  
**Consuming applications:** Customer rentals/stays, Partner rentals/listings, Operations finance & rentals  

> Documents the M3 QA financial-integrity surface that supersedes gaps left by proposal
> **0025** (UX MVP): deposit **gateway** refunds, **per-booking** handover PIN, Ops refunds
> list, stay payment-expiry hold release, A10 free-tier `listing_plan_cap`, and full-refund
> cancel + partner ledger reversal.

## 1. Product Law

1. **Deposit residual is gateway money, not a status-only flag.** After a completed rental
   return, `release-deposit` refunds the full held deposit residual via commerce
   `_request_automatic_refund` (`reason_code=rental_deposit_released`). `dispute-deposit`
   refunds `amount_paise − consume_paise` (`rental_deposit_dispute_residual`) and records
   consumed paise as a partner ledger `ADJUSTMENT` claim. Fail-closed while the attempt is
   still settling (same refusal as cancel).
2. **Handover PIN is per booking.** Each `RentalBooking` stores its own
   `handover_pin_hash` (4-digit MVP plaintext in the `*_hash` column). Generated at booking
   create. Partner `handover` verifies against the **booking** PIN only. Customer serializers
   reveal `handover_pin` only to the owning customer when status is `CONFIRMED` or
   `HANDOVER`. Partner responses never disclose the PIN. `User.rental_handover_pin_hash` is
   deprecated for new writes (compat/backfill only).
3. **Ops can list and read refunds.** `GET /api/v1/operations/refunds/` is an Operations
   cursor page of all refunds. `GET /api/v1/refunds/{id}/` allows Operations without the
   customer `order__customer` filter; customers remain scoped to their own order.
4. **Unpaid stay holds expire cleanly.** When
   `expire_abandoned_payment_attempts` marks an `A9_STAY_RESERVATION` attempt expired, the
   linked `StayReservation` cancels with `cancellation_reason=payment_attempt_expired` and
   the `UnitReservation` is `RELEASED`.
5. **A10 free tier is max 1 published listing.** Without an active vendor subscription,
   `publish_listing` refuses at free-tier cap with `listing_plan_cap` (`409`). With a
   subscription, the plan's `max_active_listings` applies under the same code (not
   `listing_state_conflict`).
6. **Full refund cancels capacity and reverses earnings.** On provider full-refund success
   (`_apply_refund_provider_result`), purpose-aware helpers cancel the linked A7 booking /
   A9 reservation / booking-group fulfilment and release holds. Settled partner earnings for
   booking-group refunds receive a ledger `REVERSAL` via `reverse_booking_earning_for_refund`.
7. **Rental cancel is 100% until handover.** Customer, Partner (`action=cancel`), and Ops
   force-cancel share `cancel_booking` for `PENDING_PAYMENT` / `CONFIRMED` only; captured
   attempts get a full automatic refund and the asset reservation is released.

## 2. New / Changed Fields

| Model | Field | Notes |
| --- | --- | --- |
| `rental.RentalBooking` | `handover_pin_hash` | Per-booking 4-digit PIN store; sole verify target for handover |
| `identity.User` | `rental_handover_pin_hash` | Deprecated for new writes; retained for forward compat |
| `commerce.Refund` | (existing) `wallet_credit_paise`, `gateway_refund_paise` | Split on automatic deposit/cancel refunds; Ops list exposes standard `Refund` schema |

## 3. Endpoints

### Deposit release / dispute (existing action path; money behaviour changed)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/partner/rentals/bookings/{booking_id}/release-deposit` | Partner | Status `RELEASED` **and** gateway refund of full deposit residual |
| `POST` | `/api/v1/partner/rentals/bookings/{booking_id}/dispute-deposit` | Partner | Body: `reason`, optional `consume_paise` (default `0`). Residual gateway-refunded; consume → ledger ADJUSTMENT |

`PartnerBookingActionRequest`: `{ pin?, reason?, consume_paise? }` — `cancel` added beside
`handover` / `return` / `release-deposit` / `dispute-deposit`.

### Per-booking PIN visibility

| Method | Path | Auth | PIN behaviour |
| --- | --- | --- | --- |
| `GET` | `/api/v1/me/rentals` | Customer | `handover_pin` string when `CONFIRMED`/`HANDOVER`; else `null` |
| `GET` | `/api/v1/partner/rentals/bookings` | Partner | `handover_pin` always `null` |
| `POST` | `/api/v1/partner/rentals/bookings/{id}/handover` | Partner | Requires matching booking PIN → `handover_pin_invalid` on mismatch |

### Cancel (full refund until handover)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/me/rentals/{booking_id}/cancel` | Customer | Full refund of captured attempt; release reservation |
| `POST` | `/api/v1/partner/rentals/bookings/{booking_id}/cancel` | Partner | Same service; partner-owned booking only |
| `POST` | `/api/v1/ops/rentals/bookings/{booking_id}/cancel` | Operations | Force-cancel (`is_ops=True`) |

### Ops refunds list / detail

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/operations/refunds/` | Operations | Cursor page (`next` / `previous` / `results`); query `cursor` |
| `GET` | `/api/v1/refunds/{refund_id}/` | Customer **or** Operations | Customer: own order only. Ops: any refund by id |

### Stay payment expiry (task, not a new HTTP route)

| Trigger | Effect |
| --- | --- |
| Celery `expire_abandoned_payment_attempts` on `A9_STAY_RESERVATION` | Attempt `EXPIRED` / `payment_attempt_expired` → stay reservation `CANCELLED` + unit hold `RELEASED` |

### Listing plan cap (existing publish command; error code/quota clarified)

| Method | Path | Auth | Refusal |
| --- | --- | --- | --- |
| Partner listing `publish` | existing A10 publish path | Partner/poster | `409` `listing_plan_cap` when free-tier (>0 active) or plan `max_active_listings` exceeded |

## 4. Error Codes

| Code | HTTP | When | Recovery |
| --- | --- | --- | --- |
| `handover_pin_invalid` | `400`/`409` domain | Partner PIN ≠ booking `handover_pin_hash` | Re-enter customer-provided PIN |
| `listing_plan_cap` | `409` | Publish would exceed free-tier (1) or plan max | Open Billing / upgrade; do not publish |
| `rental_state_invalid` | domain | Cancel after handover; deposit release not `RETURNED`; etc. | Honest status message |
| `cursor_invalid` | `400` | Bad Ops refunds page cursor | Restart from first page |

## 5. Example shapes

### Ops refunds page (success)

```http
GET /api/v1/operations/refunds/?cursor=
Cookie: session=…
```

```json
{
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "7c2e0a1a-1111-2222-3333-444455556666",
      "order_id": null,
      "payment_attempt_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "status": "REQUESTED",
      "reason_code": "rental_deposit_released",
      "reconciliation_state": "PENDING",
      "failure_code": "",
      "provider_refund_id": "",
      "amount": { "amount_paise": 50000, "currency": "INR" },
      "allocations": [],
      "created_at": "2026-09-29T12:00:00Z",
      "submitted_at": null,
      "completed_at": null
    }
  ]
}
```

### Customer rental booking (PIN visible)

```json
{
  "id": "…",
  "status": "CONFIRMED",
  "handover_pin": "4821",
  "price_paise": 25000,
  "deposit": { "amount_paise": 50000, "status": "HELD" }
}
```

### Deposit dispute (partial consume)

```http
POST /api/v1/partner/rentals/bookings/{id}/dispute-deposit
```

```json
{ "reason": "Scratched lens housing", "consume_paise": 15000 }
```

Residual `35000` gateway-refunded; `15000` partner ledger ADJUSTMENT; booking → `DISPUTED`.

### Listing plan cap

```json
{
  "error": {
    "code": "listing_plan_cap",
    "message": "Active listing limit reached for the free tier."
  }
}
```

## 6. Idempotency, retry, recovery

- Automatic refunds use idempotency keys `automatic:{reason_code}:{attempt_id}` — retries
  return the existing non-failed refund.
- Deposit consume ledger keys `rental-deposit-consume:{deposit_id}`.
- Booking-group earning reversal keys through `reverse_booking_earning_for_refund` (refund id).
- Cancel after handover is refused (no silent refund). Settling provider state refuses cancel /
  deposit release with a retryable user message rather than a false success.
- Stay expiry and refund-driven cancel are fail-closed per purpose; unknown purposes do not
  invent a cancel path.

## 7. Supersedes / relation

| Prior | Relation |
| --- | --- |
| **0025** Stays & Rentals UX MVP | PIN product law updated from per-customer to **per-booking**; deposit release/dispute now **move gateway money** |
| **0017** A10 careers | Free-tier cap + stable `listing_plan_cap` for publish quota |
| **0018** / **0019** A7/A9 MVP | Cancel/expiry/refund integrity layers on top of MVP surfaces |

## 8. Publication checklist

- [x] Django behaviour implemented (M3 QA T1–T9)
- [x] `manage.py spectacular --file ../contracts/openapi/v1.yaml --validate`
- [x] Ops refunds list published as cursor `RefundPage` (not bare array)
- [x] `@vsolve/api-client` regenerated (`pnpm run generate` → contract 1.66.0)
- [x] `makemigrations --check --dry-run` — no changes
- [ ] Owner runs focused pytest / FE verification
