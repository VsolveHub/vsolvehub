# Proposal 0023 — Operations Loyalty, Wallet & Referral Management

**Author:** Cursor (M3 Lane E)  
**Date:** 23 September 2026  
**Status:** **Published**  
**Consuming applications:** Operations (`/operations/**`)  

## 1. Product Law

1. **Operations Controls:** All marketing levers (coin burn caps, coin value, top-up limits, earn tiers, and referral programs) are admin-configurable without deploying code changes.
2. **Grandfathering Guard:** Existing referral program versions with attributions cannot be mutated in place; operations creates a new version with an `effective_from` timestamp.
3. **Manual Adjustments:** Maker-checker adjustments to wallet and coin ledgers require audit reasons.

## 2. Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/api/v1/ops/loyalty/grant-rules/` | Ops | List / create coin grant rules |
| GET/PATCH | `/api/v1/ops/loyalty/grant-rules/{id}/` | Ops | Retrieve / toggle / configure coin grant rule |
| GET/POST | `/api/v1/ops/loyalty/burn-policies/` | Ops | List / create coin burn policies |
| GET/POST | `/api/v1/ops/wallet/policies/` | Ops | List / create wallet top-up policies |
| GET/POST | `/api/v1/ops/referral/programs/` | Ops | List / publish referral program versions |
| GET | `/api/v1/ops/referral/attributions/` | Ops | Audit queue of all attributions and status |
| POST | `/api/v1/ops/wallet/adjustments/` | Ops | Issue auditable administrative credit or debit |
