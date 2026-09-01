# M3 — Listings, Marketplace & Money Platform

**Status:** Planning — no implementation started  
**Commercial reference:** [`milestones.md`](../../milestones.md) Milestone 3 (₹75,000)  
**Effective date:** 2026-09-01

Milestone 3 completes the **web platform on staging**: the last three service categories, live
Razorpay and MSG91, customer wallet, V Coins, referral, subscription/premium listing products, and
the full Operations analytics layer. **Nothing goes public until Milestone 4.**

This folder is the authoritative execution plan for M3. Global product rules remain in the parent
[`Django_Next.js_Plan/`](../README.md) documents; this folder translates them into phased build
work without redefining platform invariants.

## Documents

**Start here**

| Document | Purpose |
| --- | --- |
| [Master task board](task.md) | Phase status, task ids, dependencies, gates |
| [Wallet, V Coins & Referral](01-wallet-vcoins-referral.md) | Owner decisions, domain model, configuration, APIs, acceptance |

**Planned (not written yet)**

| Document | Purpose |
| --- | --- |
| `02-real-payments-and-otp.md` | Razorpay live + MSG91 activation across existing flows |
| `03-rental-stay-jobs-categories.md` | A7 rental, A9 stay, A10 listing/careers engines |
| `04-operations-analytics.md` | Dashboards, exports, GST/TDS, report builder |
| `05-acceptance-and-cutover.md` | Staging gates before M4 go-live |

## M3 scope summary (commercial)

From `milestones.md`:

1. **Three new web categories** — Rental, Rooms/PG/Hotels, Career/Jobs  
2. **Razorpay** — live/test across all services  
3. **MSG91 OTP** — production delivery  
4. **Customer wallet** — prepaid INR balance (top-up via Razorpay, spend at checkout)  
5. **V Coins** — loyalty ledger, burn-only at checkout  
6. **Referral** — configurable rewards, grandfathered terms  
7. **Vendor subscriptions & premium listings**  
8. **Admin dashboards & data management** — reports, exports, settlement views  

**Explicitly not M3:** mobile apps, Rapido, AI chatbot, public go-live (all M4).

## Build order (recommended)

```text
Phase A — Procurement & staging env          (Razorpay + MSG91 accounts)
Phase B — Real payments & OTP on M1/M2 flows
Phase C — Wallet, V Coins, Referral          ← 01-wallet-vcoins-referral.md
Phase D — Rental, Stay, Jobs categories
Phase E — Operations analytics & exports
Phase F — M3 acceptance on staging
```

Phase C depends on Phase B: wallet top-up and checkout split require a real (or consistently
faked-but-complete) payment provider path. Schema and Operations configuration UIs can be drafted in
parallel with Phase B.

**First code slice (owner, 2026-09-01):** [`M3-BE-207`](task.md) — M1 completion outbox hook
(`customer.fulfilment.completed`) lands in Wave C0b **before** wallet/coin models. See
[01-wallet-vcoins-referral.md §3.5](01-wallet-vcoins-referral.md).

## Resolved cross-plan contradiction

`M2/README.md` forbids an **unregulated internal wallet** for vendor wages and P2P A3 settlement.
`milestones.md` M3 promises **Wallet, V Coins, Referral**.

**Resolution (owner, 2026-09-01):** M3 “wallet” means **customer prepaid INR balance** only — top-up
through Razorpay, spend at platform checkout, refund back to wallet. It does **not** hold partner
wages, A3 day-end UPI flows, or replace `PartnerLedgerEntry` / payout batches. See
[01-wallet-vcoins-referral.md §1](01-wallet-vcoins-referral.md).

## Branch policy

Feature work on `feature/m3-*` branches. Do not commit directly to `main` without owner approval.
Contract changes flow: `contracts/proposals/` → Django implementation → generated `v1.yaml`.

## Relationship to M1/M2

| Already built | M3 extends |
| --- | --- |
| `PaymentAttempt` + `PaymentAllocation` (ADR-0003) | Wallet split at checkout, `WALLET_TOP_UP` purpose |
| `PartnerLedgerEntry` (partner earnings) | Unchanged — not customer wallet |
| Fake Razorpay + dev OTP | Live providers on staging |
| 7/11 category engines | +3 categories; coins/referral on all checkout paths |
