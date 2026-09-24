# Proposal 0021 — V Coins Customer & Burn Preview Surface

**Author:** Cursor (M3 Lane E)  
**Date:** 23 September 2026  
**Status:** **Published**  
**Consuming applications:** Customer (`/account/coins`, `/checkout`), Operations (`/operations/coins`)  

## 1. Product Law

1. **Burn-Only:** Coins reduce the checkout payable total. They cannot be withdrawn to bank accounts.
2. **Operations Burn Policy:**
   - Active burn policy defines `max_burn_percent` (e.g. 30%) and `coin_value_paise` (e.g. 10 paise per coin).
   - Math is server-only:
     `max_burn_paise = floor(order_payable_paise * max_burn_percent / 100)`
     `burn_paise = min(spendable_coins * coin_value_paise, max_burn_paise, order_payable_paise)`
3. **Four Distinct Buckets:**
   - `promised_coins`: coins earned through signup/promotions but not yet spendable.
   - `locked_coins`: coins awaiting completion of required bookings/engagements.
   - `spendable_coins`: unlocked coins available to burn at checkout.
   - `expiring_soon_coins`: spendable coins expiring within the next 30 days.
4. **FIFO Expiry & Concurrency:**
   - Burn order consumes soonest-expiring coins first.
   - Reservation during `PaymentAttempt` creation guarantees concurrent checkouts never burn more than spendable coins.
5. **No Refund Restoration:**
   - Burned coins are never restored on order cancellation or refund.

## 2. Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/customer/coins/` | Customer | Read coin balances across the 4 buckets and upcoming grants |
| GET | `/api/v1/customer/coins/ledger/` | Customer | Immutable history of coin transactions (EARN, UNLOCK, BURN, EXPIRE) |
| POST | `/api/v1/customer/coins/preview-burn/` | Customer | Server-calculated burn cap and discount for a given order total |

## 3. Request / Response Contracts

### GET `/api/v1/customer/coins/`
Response `200 OK`:
```json
{
  "spendable_coins": 1200,
  "promised_coins": 500,
  "locked_coins": 500,
  "expiring_soon_coins": 200,
  "active_burn_policy": {
    "max_burn_percent": 30,
    "coin_value_paise": 10
  }
}
```

### POST `/api/v1/customer/coins/preview-burn/`
Request `POST`:
```json
{
  "order_payable_paise": 100000,
  "requested_coins": 500
}
```
Response `200 OK`:
```json
{
  "order_payable_paise": 100000,
  "spendable_coins": 1200,
  "max_burn_paise": 30000,
  "max_burn_coins": 3000,
  "applied_burn_coins": 500,
  "discount_paise": 5000,
  "remaining_payable_paise": 95000
}
```
