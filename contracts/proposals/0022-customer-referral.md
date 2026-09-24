# Proposal 0022 — Customer Referral Surface

**Author:** Cursor (M3 Lane E)  
**Date:** 23 September 2026  
**Status:** **Published**  
**Consuming applications:** Customer (`/account/referral`, `/login`), Operations (`/operations/referrals`)  

## 1. Product Law

1. **Signup Only:** Referral codes apply exclusively during customer signup via URL `?ref=CODE` or manual code entry on the registration form. No retroactive application from account settings.
2. **Lifetime Single Attribution:** `UNIQUE(referee_id)` ensures a referee can be attributed at most once in their lifetime.
3. **Grandfathered Program Versions:**
   - Changing rewards creates a new `ReferralProgramVersion`.
   - At signup, `ReferralAttribution` snapshots `program_version_id` and full tier metadata into `terms_snapshot`.
   - Attributions are evaluated against their snapshot, preventing retroactive reward devaluation.
4. **Volume Tiers:** Referrer payouts scale based on how many successful (rewarded) referrals the referrer has completed.
5. **Qualifying Event:** Default is referee's first completed booking (`customer.fulfilment.completed`).
6. **Immutable Rewards:** `ReferralReward` records the version, tier, sequence number, and credited wallet/coins amounts.

## 2. Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/customer/referral/` | Customer | Fetch referrer's unique code, canonical share link, active tier schedule |
| GET | `/api/v1/customer/referral/attributions/` | Customer | List referred friends (status: PENDING vs REWARDED, rewards earned) |
| POST | `/api/v1/customer/referral/validate/` | Public | Validate a referral code during signup form pre-check |

## 3. Request / Response Contracts

### GET `/api/v1/customer/referral/`
Response `200 OK`:
```json
{
  "code": "SRIKAR88",
  "share_url": "https://vsolvehub.com/signup?ref=SRIKAR88",
  "total_earned_paise": 60000,
  "successful_referral_count": 4,
  "active_program": {
    "version_code": "v1",
    "tiers": [
      {
        "min_qualified_referrals": 1,
        "referrer_wallet_paise": 10000,
        "referrer_coins_amount": 0,
        "referee_wallet_paise": 5000,
        "referee_coins_amount": 100
      },
      {
        "min_qualified_referrals": 5,
        "referrer_wallet_paise": 20000,
        "referrer_coins_amount": 0,
        "referee_wallet_paise": 5000,
        "referee_coins_amount": 100
      }
    ]
  }
}
```

### POST `/api/v1/customer/referral/validate/`
Request `POST`:
```json
{
  "code": "SRIKAR88"
}
```
Response `200 OK`:
```json
{
  "valid": true,
  "referrer_first_name": "Srikar",
  "referee_reward_summary": "₹50 wallet credit + 100 V Coins on your first completed booking"
}
```
