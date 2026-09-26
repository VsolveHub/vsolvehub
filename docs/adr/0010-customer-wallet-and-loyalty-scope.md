# 10. Customer Wallet and Loyalty Scope

- Status: Accepted
- Date: 2026-09-23

## Context

Milestone 3 introduces customer prepaid wallet, V Coins loyalty rewards, and a multi-tiered referral program.
Without strict architectural boundaries, loyalty and wallet mechanics frequently degrade platform financial integrity:
1. Parallel money paths that bypass the single-source capture and allocation engine established in ADR-0003.
2. Mutable counters on customer profiles subject to outbox replay race conditions.
3. Uncontrolled concurrent checkouts driving wallet balances below zero or overspending locked coin grants.
4. Referral programs modified in place, retroactively reducing promised rewards to existing referrers.
5. Client-calculated burn rates, coin conversions, or discounts causing reconciliation drift.

## Decision

1. **ADR-0003 Compliance (One Money Path):**
   Checkout produces `PaymentAllocation` rows. Wallet and Razorpay are funding sources for one capture; they are not parallel money systems. Checkout takes `wallet_amount_paise` and `coin_burn_amount` as modifiers on `PaymentAttempt`.

2. **Integer Paise & Server-Authoritative Math:**
   All monetary amounts are stored as non-negative integer paise (`PositiveBigIntegerField` or signed `BigIntegerField` for ledger deltas). All burn calculations are computed exclusively by Django:
   `max_burn_paise = floor(order_payable_paise * max_burn_percent / 100)`
   `burn_paise = min(spendable_coins * coin_value_paise, max_burn_paise, order_payable_paise)`
   Frontend displays server values; it never derives percentages or balances.

3. **Customer Prepaid INR Wallet:**
   Each customer has one `WalletAccount`. Balances are derived from append-only `WalletTransaction` rows (`TOP_UP`, `CHECKOUT_DEBIT`, `CHECKOUT_RELEASE`, `REFUND_CREDIT`, `REFERRAL_CREDIT`, `ADJUSTMENT`). Concurrency is enforced via `SELECT FOR UPDATE` locking on `WalletAccount`; `available_balance >= 0` is an invariant. Top-up limits (`min_paise`, `max_paise`) are operations-configurable.

4. **V Coins Loyalty Ledger & Granular Buckets:**
   Coins are burn-only at checkout (reducing payable total) and never convertible to withdrawable cash. The API publishes distinct buckets: `promised`, `locked`, `spendable`, and `expiring_soon`. Coins are promised on campaign triggers (e.g. signup) and locked until required completions are met. Expiry is FIFO. Concurrency reservations lock coins at attempt creation and release them on failure or timeout.

5. **Idempotent Customer Completion Ledger:**
   Completion counts are never stored as mutable integer columns on customer profiles. Completions are recorded as append-only `CustomerCompletion` facts with natural key constraint `UNIQUE(customer_id, source_type, source_id)`. Outbox retries of `customer.fulfilment.completed` or future `customer.engagement.completed` execute `get_or_create`; coin unlock triggers only when `created=True`.

6. **Grandfathered, Versioned Referral System:**
   - Every customer receives a unique referral code and share URL (`/signup?ref=CODE`).
   - Referral codes apply strictly at signup. Logged-in accounts cannot attach referral codes retroactively.
   - Lifetime uniqueness: `UNIQUE(referee_id)` on `ReferralAttribution` prevents multiple referrers.
   - Operations changes rewards by publishing a new `ReferralProgramVersion` with immutable `ReferralProgramRewardTier` rows.
   - At signup, `ReferralAttribution` snapshots `program_version_id` and copies full tier metadata into `terms_snapshot`. Payouts evaluate against the snapshotted version, ensuring earlier promises remain immutable.
   - `ReferralReward` records are append-only and immutable.

7. **Refund Policy:**
   The wallet is **spend-only**: customers top up and purchase; there is **no cash-out / withdrawal** from wallet balance. Provider-funded (Razorpay / cash) payments are refunded via **Operations using Razorpay refund + reconcile hooks**. Wallet-funded checkout portions, when reversed, return only as `REFUND_CREDIT` back into the same spend-only wallet (never as bank cash-out). Burned V Coins are never restored.

## Consequences

- The platform ledger remains strictly auditable and reconcilable to the paisa.
- All checkout workflows remain unified on the single `PaymentAttempt` and `PaymentAllocation` engine.
- Outbox event delivery retries cannot double-credit completions, unlock coins twice, or duplicate referral payouts.
- Operations can adjust marketing campaigns, burn caps, and referral tiers at any time without risking data corruption or breaking legal commitments to past referrers.
