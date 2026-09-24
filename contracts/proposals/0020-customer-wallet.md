# Proposal 0020 — Customer Wallet (INR) Surface

**Author:** Cursor (M3 Lane E)  
**Date:** 23 September 2026  
**Status:** **Published**  
**Consuming applications:** Customer (`/account/wallet`, `/checkout`), Operations (`/operations/wallet`)  

## 1. Product Law

1. **Prepaid INR Liability:** Customer wallet holds customer funds in integer paise (`PositiveBigIntegerField`).
2. **ADR-0003 Integration:** Wallet is a funding source for checkout captures, not a second money path. Checkout allocations split across wallet and provider gateways.
3. **Operations Top-Up Policy:** Min and max top-up limits are server-enforced and operations-configurable.
4. **Concurrency & Non-Negative Invariant:** `SUM(credits) - SUM(reserved_debits) - SUM(captured_debits) >= 0` enforced with `SELECT FOR UPDATE` on `WalletAccount`.
5. **Refunds:** Captured wallet allocations are restored to wallet on order cancellation or refund; provider shares return via Razorpay.

## 2. Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/customer/wallet/` | Customer | Read wallet balance, available balance, active top-up policy limits |
| GET | `/api/v1/customer/wallet/transactions/` | Customer | Paginated transaction ledger (kind, amount_paise, status, created_at) |
| POST | `/api/v1/customer/wallet/top-up/` | Customer | Create top-up intent (`PaymentAttempt` with purpose `WALLET_TOP_UP`) |
| GET | `/api/v1/ops/wallet/liability/` | Operations | Total platform customer wallet liability report |

## 3. Request / Response Contracts

### GET `/api/v1/customer/wallet/`
Response `200 OK`:
```json
{
  "wallet_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "currency": "INR",
  "balance_paise": 50000,
  "available_balance_paise": 50000,
  "reserved_paise": 0,
  "top_up_policy": {
    "min_top_up_paise": 10000,
    "max_top_up_paise": 1000000
  }
}
```

### POST `/api/v1/customer/wallet/top-up/`
Request `POST`:
```json
{
  "amount_paise": 50000,
  "idempotency_key": "top-up:usr-123:req-456"
}
```
Response `202 Accepted`:
```json
{
  "payment_attempt_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "purpose": "WALLET_TOP_UP",
  "amount_paise": 50000,
  "currency": "INR",
  "provider": "razorpay",
  "provider_order_id": "order_xyz123",
  "status": "CREATED"
}
```
