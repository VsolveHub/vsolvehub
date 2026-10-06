# Wallet, V Coins & Referral — M3 Phase C

**Status:** Built — owner verification pending. Client spec update applied 2026-10-06 (see §0).  
**Depends on:** Phase B (Razorpay on staging; MSG91 optional for referral SMS but not blocking ledger)  
**Blocks:** Checkout UX across all categories once coins/wallet are live

This document is the design authority for Phase C until an ADR (`docs/adr/0010-customer-wallet-and-loyalty-scope.md`) is merged. If they disagree, fix the defect in the same change.

---

## 0. Client spec update — 2026-10-06 (supersedes conflicting rules below)

The client's "Developer Functional Specification" changed these rules. Where §1–§10 disagree,
this section wins.

| Topic | Final rule |
| --- | --- |
| Referral reward form | **V Coins by default.** Wallet cash stays possible per tier/side but is off unless Operations sets an amount |
| Referral reward amount | **Flat tiers** by the referrer's count of successful referrals. Launch tiers: #1–3 100 coins, #4–9 150, #10–24 250, #25–49 350, #50+ 500; new customer 100 coins. "% of platform fee" formula was **dropped** (fee differs per category; stays have none) |
| Coin value | 100 coins = ₹10 (`coin_value_paise = 10`) |
| Max coins per order | Operations-configurable; launch default **20%** |
| Waiting period | `LoyaltySettings.reward_hold_days` (default **7**, 0–90). Coins earned on a completed booking and referral rewards stay **PENDING** until `completed_at + hold`. Celery `release_due_loyalty_rewards` (every 15 min) releases them |
| Refund in waiting period | Cancels that booking's pending coins (`CANCEL` ledger row) and sends a QUALIFIED referral back to PENDING so the friend's next booking can qualify |
| Signup only | Referral code travels in `POST /auth/otp/verify/` (`referral_code`) and is applied only when that verification **creates** the account; the server also refuses accounts older than 30 min or with any order/completion. `POST /customer/referral/apply/` was **removed** |
| Signup coins | `SIGNUP` earn rules now actually fire, once, at account creation |
| Fraud | Self-referral blocked; one referrer per customer; optional `referral_monthly_cap` (0 = none, over-cap rewards wait for next month); Operations **reject** (before payment) and **reverse** (after) with a required reason, reviewer and timestamp stored on the attribution |
| Statuses (UI) | Pending · Qualified (waiting) · Approved (`REWARDED`) · Rejected (`INELIGIBLE`) · Reversed |
| Ledger | Every `CoinGrant` stores `source_type` / `source_id` (booking, engagement, rental, stay, signup, referral, manual) and its rule; Operations customer lookup shows wallet + coin + referral history |
| M2 | `accept_engagement_completion` now emits `customer.fulfilment.completed` (`source_type=ENGAGEMENT`) |
| Dropped | Cashback (OQ-05), per-campaign coin value (OQ-01 → platform-wide rate), attribution expiry, device fingerprinting, manual approval of every referral, `REFERRAL_QUALIFIED`/`MANUAL_OPS` earn triggers in the admin UI |

---

## 1. Scope boundary (resolves PLN-01)

| In scope | Out of scope |
| --- | --- |
| Customer **prepaid INR wallet** (Razorpay top-up → spend at checkout → refund credit) | A3 worker wages (P2P UPI; platform never holds) |
| **V Coins** loyalty ledger (earn, lock, unlock, burn at checkout) | Partner earnings (`PartnerLedgerEntry` / payout batches) |
| **Referral** attribution, configurable rewards, grandfathered terms | Vendor wallet or float for marketplace settlement |
| Operations **configuration** of burn %, earn rules, referral programs | Converting coins to withdrawable cash |

Money invariants from ADR-0003 still apply: checkout produces `PaymentAllocation` rows; wallet and
Razorpay are **funding sources** for one capture, not parallel money paths.

---

## 2. Owner decisions (locked for planning)

### 2.1 V Coins — burn

| Decision | Value |
| --- | --- |
| Redemption model | **Burn-only at checkout** — coins reduce the order total; no cash-out, no transfer to bank |
| Max burn per order | **Operations-configurable** — e.g. 20% or 30% of the order’s payable total (in paise) |
| Coin value at burn | **Operations-configurable** `coin_value_paise` per coin (e.g. 1 coin = 10 paise) applied at burn time from the **active burn policy** |
| Computation | Server-only: `max_burn_paise = floor(order_payable_paise × max_burn_percent / 100)`; `burn_paise = min(spendable_coins × coin_value_paise, max_burn_paise, order_payable_paise)` |

The customer UI shows the server-computed burn cap and applied amount; it never derives percentages.

### 2.2 V Coins — earn, visibility, unlock

| Decision | Value |
| --- | --- |
| Signup / campaign promise | Customer **sees promised coins** (amount + campaign name + expiry if any) **before** they are spendable |
| Spendability | Promised coins are **locked** until unlock rules pass |
| Unlock trigger | **Operations-configurable per grant rule:** |
| | • `UNLOCK_AFTER_N_COMPLETED_BOOKINGS` — `n` configurable (1 = first completion, 3 = third, etc.) |
| | • Counter uses **platform-defined “completed booking”** (same definition as referral qualifying event unless a rule overrides) |
| Partial unlock | One grant rule may require **one** completion or **many**; each rule carries its own `completions_required` |
| Balance presentation | API publishes **promised**, **locked**, **spendable**, and **expiring_soon** separately — no single misleading “balance” |

### 2.2.1 V Coins — earn tiers (order value & booking sequence)

Flat `coins_amount` on a rule is not enough for real campaigns. Operations configures **one or more
`CoinEarnTier` rows** per `CoinGrantRule` when the rule uses tiered earning.

| `earn_mode` (on rule) | When to use |
| --- | --- |
| `FLAT` | Single `coins_amount` on the rule (signup welcome, simple promos) |
| `TIERED_ORDER_VALUE` | Coins depend on **order payable paise** at earn time (e.g. booking completed) |
| `TIERED_BOOKING_SEQUENCE` | Coins depend on **which numbered completion** this is for the customer (1st, 2nd, 3rd…) |

```text
CoinEarnTier
------------
grant_rule_id
tier_kind                 ORDER_VALUE | BOOKING_SEQUENCE  (must match rule earn_mode)
min_order_paise           nullable — for ORDER_VALUE (inclusive lower bound)
max_order_paise           nullable — for ORDER_VALUE; null = no upper bound (₹2,000+)
min_booking_sequence      nullable — for BOOKING_SEQUENCE (inclusive; 1 = first booking)
max_booking_sequence      nullable — inclusive upper bound; null = no upper bound
coins_amount              integer ≥ 1
sort_order                Operations display
```

**Order-value example** (admin-configured bands):

| Order payable | Coins earned |
| --- | --- |
| ₹0–499 | 10 |
| ₹500–999 | 25 |
| ₹1,000–1,999 | 60 |
| ₹2,000+ | 100 |

Implemented as tier rows: `(0, 49999)`, `(50000, 99999)`, `(100000, 199999)`, `(200000, null)` paise.

**Booking-sequence example**:

| Customer's completion # | Coins earned |
| --- | --- |
| 1st booking | 500 |
| 2nd booking | 200 |
| 3rd booking | 300 |

Implemented as tier rows: `min_booking_sequence` 1–1 → 500, 2–2 → 200, 3–3 → 300. Uses
`CustomerCompletion` count + 1 at earn time (same completion definition as §3.4).

| Rule | Detail |
| --- | --- |
| Tier selection | Pick the single tier whose bounds contain the order paise or sequence `n`; non-overlapping bands enforced in Operations validation |
| Snapshot | Tier table copied into `CoinGrant` / grant metadata at promise time when rule is versioned |
| Versioning | Changing earn tiers publishes a new rule version or `effective_from` — same grandfathering pattern as referral (no retroactive change to promised grants) |

### 2.2.2 V Coins — customer eligibility (campaign audience)

Signup-triggered coins are not enough. Each `CoinGrantRule` declares **who** may receive it:

| `customer_eligibility` | Meaning |
| --- | --- |
| `ALL_CUSTOMERS` | No audience filter |
| `NEW_CUSTOMER` | Customer has **zero** platform completions (`CustomerCompletion` count = 0) at trigger time |
| `EXISTING_CUSTOMER` | Customer has **≥ 1** completion at trigger time |
| `REACTIVATED_CUSTOMER` | Customer's **last completion** is older than `reactivation_inactive_days` (admin-configured on the rule) |

**Example:** “Get 1,000 V Coins on your first booking after 90 days inactive”:

```text
grant_trigger          = BOOKING_COMPLETED
customer_eligibility   = REACTIVATED_CUSTOMER
reactivation_inactive_days = 90
earn_mode              = FLAT (or tiered)
coins_amount / tiers   = 1000
```

| Field (on `CoinGrantRule`) | Notes |
| --- | --- |
| `customer_eligibility` | required; default `ALL_CUSTOMERS` |
| `reactivation_inactive_days` | required when eligibility = `REACTIVATED_CUSTOMER`; ignored otherwise |

Eligibility is evaluated **server-side at grant time**; UI may show campaign copy but never decides audience.

### 2.3 V Coins — expiry

| Decision | Value |
| --- | --- |
| Per-rule expiry | **Operations-configurable** per coin grant rule |
| Festival / campaign | e.g. `expires_at` set — coins expire if not burned by deadline |
| Evergreen grants | `expires_at = null` — no expiry |
| Burn order | **FIFO by soonest expiry** among spendable coins (document in runbook; prevents customer surprise) |
| Expiry job | Celery sweep marks expired buckets; immutable `EXPIRE` ledger rows |

### 2.3.1 V Coins — burn reservation & concurrency (hard invariant)

Burning coins at checkout must survive **concurrent payment attempts**, same as wallet.

| Invariant | |
| --- | --- |
| **Spendable coins** | `promised_unlocked_spendable - reserved_for_attempts - already_burned >= 0` at all times |
| **Reservation** | On `PaymentAttempt` create with `coin_burn_amount`, **reserve** coins (append-only `RESERVED` ledger rows or bucket lock) inside the same transaction as validation |
| **Capture / release** | Success → `BURN`; failure/timeout → `RELEASE` reservation |
| **Concurrency** | `SELECT FOR UPDATE` on `WalletAccount` / coin balance aggregate (or per-customer coin lock row) before reserve |

**Failure scenario (must not happen):**

```text
Customer has 1,000 spendable coins
Checkout A → burns 700   ┐
Checkout B → burns 600   ┘  both must NOT succeed — only 1,000 consumable total
```

Second concurrent attempt must fail validation or block until the first attempt releases or captures.
C5 concurrency tests are **mandatory** for this path (§2.7.1, Wave C5).

### 2.4 Referral — who, when, how much

| Decision | Value |
| --- | --- |
| Qualifying event (default) | **Referee’s first completed booking** on the platform |
| Who can be rewarded | **Operations-configurable per program version:** referrer only, referee only, or **both** with separate amounts |
| Reward form | Wallet credit (INR) and/or V Coins — configurable per side |
| Base amounts | **Volume tiers** per program version (§2.4.1) — not a single flat rate only |
| Referee side | Flat per program version **or** per-tier overrides where Operations configures them |

### 2.4.1 Referral — volume tiers (referrer reward by successful referral count)

Operations configures **tiered referrer rewards** based on how many **successful referrals** the
referrer has already been **paid for**. The threshold for each tier (e.g. 5) and the reward amount
(e.g. ₹200) are **both admin-configurable** — nothing is hard-coded.

#### What counts as a “successful referral”

| Counts toward tier | Does **not** count |
| --- | --- |
| Referee signed up via referrer's link **and** met the qualifying event (default: **first completed booking**) **and** referrer reward was **issued** (`ReferralAttribution.status = REWARDED`) | Signup alone |
| | Pending attributions (referee has not completed yet) |
| | Qualified but not yet paid |
| | Failed / fraud / ineligible attributions |

Tier progression uses **rewarded successful referrals only** — not signups, not clicks.

#### Admin-configurable tiers (example only — `5` is not fixed)

Operations sets one or more rows on each `ReferralProgramVersion`. **Every number is configurable:**

| Field (admin sets) | Example value | Meaning |
| --- | --- | --- |
| `min_qualified_referrals` | `1` | From the **1st** successful referral onward, pay this amount until a higher tier applies |
| `referrer_wallet_paise` | `10000` | ₹100 per successful referral at this tier |
| `min_qualified_referrals` | `5` | From the **5th** successful referral onward, pay this amount |
| `referrer_wallet_paise` | `20000` | ₹200 per successful referral at this tier |

The owner example “₹100 each, ₹200 after 5 successful referrals” is implemented as **two tier rows**
with `min=1` and `min=5`. Operations could instead set `min=3`, `min=10`, or any other thresholds.

| Referrer's successful referral # (this payout) | Reward (example tiers min=1 ₹100, min=5 ₹200) |
| --- | --- |
| 1st–4th successful referral | ₹100 each |
| 5th successful referral onward | ₹200 each |

**Admin configures tiers** on each `ReferralProgramVersion`:

```text
ReferralProgramRewardTier
----------------------------
program_version_id
min_qualified_referrals     inclusive threshold — admin-configured integer ≥ 1 (not a platform constant)
referrer_wallet_paise       nullable
referrer_coins_amount       nullable
referee_wallet_paise        nullable — optional per-tier override
referee_coins_amount        nullable — optional per-tier override
sort_order                  display order in Operations UI
```

| Rule | Detail |
| --- | --- |
| Tier meaning | `min_qualified_referrals = N` (admin-set) applies when this payout is the referrer's **Nth** (or later) **successful, rewarded** referral |
| Tier selection | At payout: `n = referrer_successful_rewarded_count + 1`. Pick the tier with the **highest** `min_qualified_referrals` where `n >= min_qualified_referrals` |
| Minimum tiers | Every program version must have at least one tier with `min_qualified_referrals = 1` |
| No gaps required | Tiers need not cover every integer — unmatched `n` falls back to the tier with `min_qualified_referrals = 1` |
| **Unlimited tiers** | Operations may add **as many tier rows as needed** per version (e.g. min=1, 5, 10, 25, 50…) — no platform cap on tier count |
| **Future higher payouts** | Raising pay after more successful referrals = add a new tier row with a higher `min_qualified_referrals` and higher amount — no code change |
| Snapshot | Full tier table is part of the program version; attributions store `program_version_id` at signup — payout uses **that version's tiers**, not the live program |
| Immutability | `ReferralReward` stores the **computed** amounts at issuance (tier id + paise/coins applied) — corrections only via Operations adjustment |

**Worked example** (illustrative thresholds — admin could change `5` to any value):

```text
Program v1 tiers (Operations-configured):
  min=1  → referrer ₹100   # every successful referral from #1 until a higher tier applies
  min=5  → referrer ₹200   # from the 5th successful referral onward

Referrer A — only REWARDED attributions count:
  successful rewarded count → this payout n → tier → paid
  0 → 1 → min=1  → ₹100   (referee #1 completed booking; referrer paid)
  1 → 2 → min=1  → ₹100
  3 → 4 → min=1  → ₹100
  4 → 5 → min=5  → ₹200   (5th successful referral)
  9 → 10 → min=5 → ₹200
```

**Future extensibility example** (same program version — admin adds tiers in Operations):

```text
Program v1 tiers (updated by publishing v2 — old attributions unchanged):
  min=1   → ₹100
  min=5   → ₹200
  min=10  → ₹300    # more money after 10 successful referrals
  min=25  → ₹500    # more again after 25
```

Each threshold and amount is a separate admin-configured row. No deploy required to add tiers —
only a new `ReferralProgramVersion` (see §2.5).

**Grandfathering with tiers:** User B signs up under v1 (tiers min=1 ₹100, min=5 ₹200). Owner
publishes v2 (e.g. min=1 ₹150, min=3 ₹250) on Friday. A's pending attribution for B still pays v1
tier rates when B **completes their first booking**; a new referee C on Saturday uses v2 tiers.

**Customer visibility:** Referral page shows the **active program's** tier schedule from Operations
(e.g. “₹100 per successful referral · ₹200 after **5** successful referrals” — the **5** comes from
admin config, not code). Pending referrals show separately; they do not advance tier count until
successful.

### 2.5 Referral — program changes, grandfathering & clear history

**Owner requirement (locked):** Operations must be able to **change referral rewards at any time**
(for new signups) and **add higher payouts after more successful referrals** in the future — **without
recalculating or reducing amounts already promised or paid** on earlier attributions. All terms must
be **stored clearly** for audit and support.

| Decision | Value |
| --- | --- |
| Program versioning | Every reward change creates a new **`ReferralProgramVersion`** with `effective_from` — **never edit tiers in place** on a version that already has attributions |
| At attribution | When a referee **signs up**, store **`program_version_id`** on `ReferralAttribution` plus a **`terms_snapshot`** JSON copy of that version's tier table at signup time |
| Pending rewards | Pay out using the **snapshotted version** on the attribution — not the currently active program |
| Retroactivity | **Forbidden** — changing the live program does **not** change amounts for attributions already created (pending or rewarded) |
| Completed rewards | **Immutable** — `ReferralReward` rows are never rewritten; corrections only via Operations adjustment with audit |
| Version archive | Old program versions remain **read-only** in Operations with full tier table and effective dates — never deleted while attributions reference them |
| Active vs historical | Customer referral page shows **active** program tiers; Operations shows **version history** and per-attribution which version applies |

#### 2.5.1 Changing rewards safely (what Operations does)

```text
Owner wants higher rewards / new tier after 10 referrals
        │
        ▼
Create ReferralProgramVersion v2 (effective_from = now)
  └── copy or redefine ReferralProgramRewardTier rows
        │
        ▼
New signups after effective_from → attribution stores program_version_id = v2
Existing pending attributions   → still program_version_id = v1 (unchanged)
Already REWARDED attributions   → ReferralReward rows unchanged forever
```

| State of attribution | After owner publishes v2 |
| --- | --- |
| Referee signed up under v1, still pending | Pays **v1** tiers when they complete |
| Referee signs up after v2 effective | Pays **v2** tiers |
| Already REWARDED under v1 | **No change** — historical `ReferralReward` is the record of truth |

#### 2.5.2 Data saved clearly (audit trail)

Every referral leaves a reconstructable paper trail:

| Record | What it preserves |
| --- | --- |
| `ReferralProgramVersion` | Version label, `effective_from`, qualifying event, reward sides |
| `ReferralProgramRewardTier` | Immutable rows per version — full tier table at publish time |
| `ReferralAttribution` | `program_version_id`, `terms_snapshot` (JSON tier table at signup), referrer, referee, status, timestamps |
| `ReferralReward` | `program_version_id`, `tier_id`, `payout_sequence_n`, wallet/coins amounts actually paid, `paid_at`, link to wallet/coin ledger |

`terms_snapshot` on attribution ensures support can answer “what was promised when this user signed up?”
even if tier rows are later archived. `ReferralReward` answers “what was actually paid and under
which tier?”

**Example:** Program v1 tiers: referrer ₹100 (1–4 referrals), ₹200 from 5th. User B signs up with A’s code on Monday. On Friday owner publishes v2 with higher tiers for **new** attributions only. A still receives v1 tier amounts when B completes; a new referee C on Saturday earns under v2 tiers. Operations can open B's attribution and see `program_version_id=v1` and the snapshotted tier table from Monday.

### 2.6 Referral — link, code & signup-only apply

| Decision | Value |
| --- | --- |
| Apply window | **Signup only** — no applying a code later from account settings |
| Per customer | Every customer gets a **unique referral code** and a **unique shareable link** |
| Share link shape (planning) | `https://vsolvehub.com/signup?ref={code}` (exact host/path configurable per env) |
| Click → signup | Link carries `ref` query param → signup form **auto-fills** the referral field (read-only or pre-filled) |
| Server truth | Attribution is created only when signup **completes** with a valid code; auto-fill alone is not enough |
| Already registered | Logged-in users or existing accounts **cannot** attach a referral retroactively |

### 2.6.1 Referral — one attribution per referee (uniqueness)

A customer (referee) may be referred **at most once** in their lifetime.

| Rule | Detail |
| --- | --- |
| Database | `UNIQUE(referee_id)` on `ReferralAttribution` |
| Behaviour | First valid signup with a referral code **wins**; later codes at signup are **rejected** (or silently ignored — pick reject with clear error in API; document in contract proposal) |
| Impossible state | Customer B referred by A **and** C **and** D — **forbidden** |
| Ops override | Fraud merge / manual correction only via Operations adjustment with audit — not a second attribution row |

Signup-only apply (§2.6) plus this constraint closes the “stack referrers” loophole.

### 2.7 Wallet — top-up limits

| Decision | Value |
| --- | --- |
| Min / max top-up | **Operations-configurable** (`WalletTopUpPolicy` or platform settings) — not hard-coded |
| Validation | Server rejects top-up below min or above max; customer sees the configured limits on the top-up screen |
| Effective dating | Optional `effective_from` if limits change over time (same pattern as burn policy) |

### 2.7.1 Wallet — balance invariant & concurrency (hard invariant)

| Invariant | |
| --- | --- |
| **Available balance** | `SUM(credits) - SUM(reserved_debits) - SUM(captured_debits) >= 0` — never negative |
| **Reservation** | `reserve_wallet` runs inside payment-attempt create; writes `RESERVED` `WalletTransaction` rows |
| **Concurrency** | Lock `WalletAccount` (`SELECT FOR UPDATE`) before reading balance and reserving |

**Failure scenario (must not happen):**

```text
Wallet = ₹500
Request A → spends ₹400   ┐
Request B → spends ₹300   ┘  both must NOT succeed
```

Second concurrent checkout must fail with insufficient wallet balance (or queue behind lock). C5
concurrency tests are **mandatory** (Wave C5, `M3-BE-252`).

### 2.8 Refunds — wallet, payment, coins

| Decision | Value |
| --- | --- |
| Wallet-funded portion | **Restored to customer wallet** on refund |
| Razorpay-funded portion | **Refunded through Razorpay** (existing refund path) |
| Coins burned at checkout | **Not restored** — burn is final; customer keeps INR refund only |
| Allocation | Refund still uses `RefundAllocation` per ADR-0003; funding source split is auditable |

---

## 3. Domain model (planning)

### 3.1 Customer wallet (INR)

```text
WalletAccount          1:1 Customer (User)
WalletTransaction      append-only; signed amount_paise; never UPDATE balance column
```

| Field / concept | Notes |
| --- | --- |
| `kind` | `TOP_UP`, `CHECKOUT_DEBIT`, `CHECKOUT_RELEASE`, `REFUND_CREDIT`, `REFERRAL_CREDIT`, `ADJUSTMENT` |
| `status` (for debits) | `RESERVED` at attempt create → `CAPTURED` or `RELEASED` on outcome |
| Balance | `SUM(amount_paise)` — no stored balance column; **available ≥ 0** invariant (§2.7.1) |
| Top-up | `PaymentAttempt` purpose `WALLET_TOP_UP`; credit only on verified capture |

```text
WalletTopUpPolicy      Operations-configurable min_paise, max_paise, effective_from
```

### 3.2 V Coins

```text
CoinGrantRule          Operations-authored; versioned; effective-dated; earn_mode; customer_eligibility
CoinEarnTier           optional tier rows per rule (order value or booking sequence)
CoinGrant              one row per customer per rule application (promised bucket)
CoinTransaction        append-only: EARN_PROMISE, UNLOCK, BURN, EXPIRE, RESERVE, RELEASE, ADJUSTMENT
```

| `CoinGrantRule` fields (planning) | |
| --- | --- |
| `name` | e.g. "Diwali 2026", "Signup welcome", "Reactivation 90-day" |
| `earn_mode` | `FLAT`, `TIERED_ORDER_VALUE`, `TIERED_BOOKING_SEQUENCE` |
| `coins_amount` | used when `earn_mode=FLAT`; ignored when tiered |
| `completions_required` | 0 = immediate on grant event, 1+ = locked until N completions |
| `grant_trigger` | `SIGNUP`, `REFERRAL_QUALIFIED`, `BOOKING_COMPLETED`, `MANUAL_OPS` |
| `customer_eligibility` | `ALL_CUSTOMERS`, `NEW_CUSTOMER`, `EXISTING_CUSTOMER`, `REACTIVATED_CUSTOMER` |
| `reactivation_inactive_days` | required when `REACTIVATED_CUSTOMER` |
| `expires_at` | nullable |
| `effective_from` / `effective_until` | rule visibility |
| `is_active` | soft off without deleting history |

| `CoinEarnTier` fields (planning) | |
| --- | --- |
| `tier_kind` | `ORDER_VALUE` or `BOOKING_SEQUENCE` |
| `min_order_paise` / `max_order_paise` | order-value bands (paise); `max` null = unlimited upper |
| `min_booking_sequence` / `max_booking_sequence` | completion # bands; `max` null = unlimited upper |
| `coins_amount` | coins earned when band matches |

| `CoinBurnPolicy` fields (planning) | |
| --- | --- |
| `max_burn_percent` | 1–100 (e.g. 20 or 30) |
| `coin_value_paise` | paise per coin at burn |
| `effective_from` | only one active policy per instant |

### 3.3 Referral

```text
ReferralProgramVersion     effective_from, qualifying_event, reward_sides (referrer/referee/both)
ReferralProgramRewardTier  volume tiers per version — unlimited rows; admin-configured thresholds (§2.4.1)
ReferralCode               per referrer; unique code + canonical share_url
ReferralAttribution        referee + program_version_id + terms_snapshot (frozen at signup)
ReferralReward             per side; version + tier + payout_sequence_n + computed amounts; immutable after pay
```

| `ReferralProgramVersion` fields (planning) | |
| --- | --- |
| `qualifying_event` | default: `REFEREE_FIRST_COMPLETED_BOOKING` |
| `reward_sides` | `REFERRER_ONLY`, `REFEREE_ONLY`, `BOTH` |
| `referee_wallet_paise` | optional flat referee amount when not tiered per side |
| `referee_coins_amount` | optional flat referee coins when not tiered per side |
| `effective_from` / `effective_until` | version visibility |
| `is_active` | soft off without deleting history |

| `ReferralProgramRewardTier` fields (planning) | |
| --- | --- |
| `min_qualified_referrals` | **Admin-configured** inclusive threshold — successful rewarded referrals required before this tier applies (e.g. 1, 5, 10 — not hard-coded) |
| `referrer_wallet_paise` | nullable INR credit to referrer |
| `referrer_coins_amount` | nullable coins to referrer |
| `referee_wallet_paise` | nullable — overrides version flat for this tier when set |
| `referee_coins_amount` | nullable — overrides version flat for this tier when set |

**Payout algorithm (server-only):**

```text
successful_rewarded_count = count(ReferralAttribution where referrer=A, status=REWARDED)
  # only attributions where referee met qualifying event and referrer was paid
n = successful_rewarded_count + 1
tier = max tier in attribution's snapshotted version (terms_snapshot / program_version_id) where min_qualified_referrals <= n
write ReferralReward rows: program_version_id, tier_id, payout_sequence_n=n, amounts — immutable after insert
```

| `ReferralAttribution` fields (planning) | |
| --- | --- |
| `referrer_id` / `referee_id` | parties — **`UNIQUE(referee_id)`** one attribution per referee lifetime (§2.6.1) |
| `program_version_id` | FK — version active at signup |
| `terms_snapshot` | JSON copy of full tier table + version metadata at signup (§2.5.2) |
| `attributed_at` | signup timestamp |
| `status` | see below |

| `ReferralReward` fields (planning) | |
| --- | --- |
| `attribution_id` | which referral |
| `program_version_id` | version used at payout (matches attribution) |
| `tier_id` | which tier row applied |
| `payout_sequence_n` | referrer's nth successful payout (the `n` used in tier selection) |
| `wallet_paise` / `coins_amount` | actual amounts paid per side |
| `paid_at` | issuance timestamp |
| `wallet_transaction_id` / `coin_grant_id` | link to ledger — auditable |

| `ReferralAttribution.status` | |
| --- | --- |
| `PENDING` | Referee registered; qualifying event not yet met |
| `QUALIFIED` | Event met; reward issuance in progress |
| `REWARDED` | All configured sides paid per snapshot |
| `EXPIRED` | Optional TTL if program defines attribution expiry |
| `INELIGIBLE` | Fraud block, self-referral, etc. |

### 3.4 Customer completion ledger (C2 — idempotency for `record_completion_for_customer`)

Do **not** maintain a mutable `completed_booking_count` column on the customer profile. Outbox
delivery is at-least-once; an outbox retry must **never** increment a completion count twice.

**Idempotency rule (locked):** one row per logical completion, keyed by:

```text
(customer_id, source_type, source_id)
```

That triple is the natural key. There is no separate idempotency string — the unique constraint
*is* the idempotency model.

Instead, record each qualifying completion as an append-only fact:

```text
CustomerCompletion
------------------
customer_id
source_type          BOOKING | ENGAGEMENT   (M1 vs M2 — not a generic catch-all event)
source_id            UUID of booking or engagement
completed_at         see §3.5.1 — copied from outbox payload at insert time
outbox_event_id      UUID — audit link to the outbox row that caused this record
created_at
```

| Constraint | Purpose |
| --- | --- |
| `UNIQUE(customer_id, source_type, source_id)` | Second handler delivery for the same booking/engagement is a no-op (`get_or_create`) |

**Service contract (C2):**

```text
record_completion_for_customer(
    customer_id,
    source_type,       # BOOKING for M1; ENGAGEMENT for M2 later
    source_id,         # booking_id or engagement_id from event payload
    completed_at,      # from payload — must match §3.5.1
    outbox_event_id,   # event.id for audit
) -> RecordCompletionResult   # created: bool — False means replay, no unlock side-effect re-run
```

Implementation: `CustomerCompletion.objects.get_or_create(defaults={...}, customer_id=..., source_type=..., source_id=...)`. Coin unlock runs **only** when `created is True`.

Flow:

```text
Booking 123 → COMPLETED
        ↓
customer.fulfilment.completed (outbox, at-least-once)
        ↓
record_completion_for_customer(customer=42, source_type=BOOKING, source_id=123, …)
        ↓
get_or_create → CustomerCompletion row
        ↓
UNIQUE(customer_id, source_type, source_id) → replay returns existing row, created=False
        ↓
unlock / count logic uses row existence or COUNT(*) — never +=
```

| Wave | `CustomerCompletion` |
| --- | --- |
| C0b (`M3-BE-207`) | **Not created** — `record_completion_for_customer` is a stub with the signature locked |
| C2 (`M3-BE-224`) | Model + migration; handler calls real `get_or_create` before coin unlock |

M2 later uses the same table with `source_type=ENGAGEMENT` from `customer.engagement.completed`.
Do **not** introduce a generic `customer.anything.completed` event type to avoid two source tables.

---

## 3.5 Completion hook — `customer.fulfilment.completed` (M1)

Loyalty and referral must not run inside `_settle_submission()` directly. That function already
settles money, refunds and partner earnings; adding coin unlock and referral payout there would
couple fulfilment to marketing and make retries dangerous.

The existing platform pattern is **transactional outbox** (`enqueue_outbox_event` in
`apps/foundation/services.py`, consumers via `register_outbox_handler` in
`apps/fulfilment/handlers.py`, `apps/requirements/handlers.py`, etc.). Phase C follows the same
shape.

### Architecture (owner-approved)

**Emit side (M1 fulfilment):**

```text
M1 completion
      │
      ▼
_settle_submission()
      │
      ├── Booking → COMPLETED
      │
      └── Outbox event (same transaction)
              │
              ▼
      customer.fulfilment.completed
```

**Consume side (`apps/loyalty/`):**

```text
apps/loyalty/
│
├── handlers.py
│
└── services/
    ├── completion.py
    ├── referral.py
    └── notifications.py

customer.fulfilment.completed
              │
              ▼
       loyalty handler
        ┌─────┼─────┐
        ▼     ▼     ▼
   completion referral notification
     service   service   service
```

**M1 vs M2 — do not generalize:**

| Path | Event | Shared service |
| --- | --- | --- |
| M1 booking settle | `customer.fulfilment.completed` | `record_completion_for_customer(source_type=BOOKING, …)` |
| M2 engagement (later) | `customer.engagement.completed` | same service, `source_type=ENGAGEMENT` |

No `customer.anything.completed`, no unified generic completion event. Two explicit event types,
one shared `CustomerCompletion` ledger (C2).

### 3.5.1 `completed_at` — single definition (no alternatives)

`completed_at` has **one** meaning everywhere (outbox payload, `CustomerCompletion` row, referral
qualify timestamp, coin-unlock audit):

> The timestamp of the **successful `COMPLETED` transition** — i.e. when settlement commits the
> booking into `Booking.Status.COMPLETED`.

| | |
| --- | --- |
| **Canonical source** | `BookingStatusHistory.created_at` on the history row that `record_transition` writes inside `apply_transition` for `to_status=COMPLETED` |
| **How to obtain at emit time** | Read from that history row in the same transaction, immediately after `apply_transition` returns — either from a returned `BookingStatusHistory` reference or by querying the row just created for this settle (`booking`, `to_status=COMPLETED`, matching settle `command` / `idempotency_key`) |
| **Payload field** | `completed_at` — ISO-8601 copy of that `created_at` value |
| **Forbidden** | `CompletionSubmission.submitted_at`, `timezone.now()` at emit, or any other proxy |

There is no `submission.submitted_at` vs `timezone.now()` choice. Partner submit time is not
completion time:

```text
Partner submits completion     10:00   ← forbidden as completed_at
Customer confirms              15:00   ← BookingStatusHistory.created_at ≈ 15:00 → completed_at
```

### 3.5.2 Event payload contract — `customer.fulfilment.completed` v1

Every emitted event includes `event_version: 1`. Handlers must reject or dead-letter unknown
versions rather than guess field meaning.

| Field | Required | Notes |
| --- | --- | --- |
| `event_version` | yes | **Always `1` for this schema.** Bump on breaking payload changes. |
| `booking_id` | yes | Aggregate identity |
| `customer_id` | yes | Loyalty subject |
| `booking_group_id` | yes | Context for notifications / future analytics |
| `fulfilment_unit_id` | yes | Context |
| `partner_id` | yes | Context |
| `status_history_id` | yes | Pointer to authoritative `BookingStatusHistory` row |
| `completed_at` | yes | ISO-8601; must equal that history row's `created_at` (§3.5.1) |

Outbox row metadata (outside JSON payload, set by `enqueue_outbox_event`):

| Field | Value |
| --- | --- |
| `event_type` | `customer.fulfilment.completed` |
| `idempotency_key` | `customer-fulfilment-completed:{booking_id}` |
| `aggregate_type` | `booking` |
| `aggregate_id` | `booking_id` |

Future `customer.engagement.completed` gets its own `event_version` starting at `1` when defined.

### Emission point

Inside `_settle_submission()` in `apps/fulfilment/completion.py`, **after** `apply_transition`
succeeds and **only when** `to_status == Booking.Status.COMPLETED`. Obtain `completed_at` per
§3.5.1 from the `BookingStatusHistory` row for this transition; emit payload per §3.5.2:

```python
# history = BookingStatusHistory row for this COMPLETED transition (§3.5.1)
enqueue_outbox_event(
    aggregate_type="booking",
    aggregate_id=booking.id,
    event_type="customer.fulfilment.completed",
    idempotency_key=f"customer-fulfilment-completed:{booking.id}",
    payload={
        "event_version": 1,
        "booking_id": str(booking.id),
        "customer_id": str(booking.customer_id),
        "booking_group_id": str(group.id),
        "fulfilment_unit_id": str(unit.id),
        "partner_id": str(booking.partner_id),
        "status_history_id": str(history.id),
        "completed_at": history.created_at.isoformat(),
    },
)
```

Properties:

| Property | Rule |
| --- | --- |
| Same DB transaction | Event row commits with the booking status change |
| Idempotency | One event per booking — replays of confirm/auto-finalize are safe |
| Not emitted for | `PARTIALLY_COMPLETED`, `DISPUTED`, `ABORTED` paths |
| Not emitted from | Partner-only `submit_completion` while still `COMPLETION_SUBMITTED` |

### Consumer (one handler, three services)

`register_outbox_handler` allows **exactly one consumer per `event_type`** (see
`apps/requirements/handlers.py`). Register one orchestrator in `handlers.py`; delegate to services:

```text
@register_outbox_handler(event_type="customer.fulfilment.completed")
def handle_customer_fulfilment_completed(event: OutboxEvent) -> None:
    record_completion_for_customer(event)      # C0b stub → C2 CustomerCompletion get_or_create
    evaluate_referral_qualification(event)    # C0b stub → C4
    notify_booking_completed(event)            # C0b real
```

| Step | Idempotency (how, not just “must be”) |
| --- | --- |
| Outbox emit | `UNIQUE(event_type, idempotency_key)` on `OutboxEvent` |
| `record_completion_for_customer` | C2: `get_or_create` on `CustomerCompletion` with `UNIQUE(customer_id, source_type, source_id)` — replay returns `created=False`, unlock must not re-run (§3.4) |
| Referral qualify | C4: idempotency on `ReferralReward` / attribution state machine (separate spec) |
| Notification | `request_notification` idempotency key derived from `customer-fulfilment-completed:{booking_id}` |

### What counts as “a completion” for coins / referral

| Status | Counts toward N completions / referral qualify? |
| --- | --- |
| `COMPLETED` | **Yes** — emits event |
| `PARTIALLY_COMPLETED` | **No** — work was partial; refund already issued |
| `DISPUTED` | **No** — payout held; not a clean completion |
| M2 `Engagement.COMPLETED` | **Separate event** — `customer.engagement.completed` in a later wave (not M1 hook) |

### Notification gap today

`booking.completed` is listed in `TRANSACTIONAL_PURPOSES` (`apps/notifications/services.py`) but
**nothing calls `request_notification` with that purpose** when a booking completes. The outbox
handler is the correct place to wire it.

### M2 follow-up (not Phase C Wave C0)

Workforce/project completions use `Engagement`, not M1 `Booking`. Plan a sibling event:

```text
customer.engagement.completed   → emitted from accept_engagement_completion()
```

Same loyalty handler module can subscribe to both event types with shared
`record_completion_for_customer(customer_id, source_type, source_id, completed_at, outbox_event_id)`.

### M3-BE-207 — implementation spec (next step; planning locked)

**Scope:** Establish the M1 completion outbox boundary only. Do **not** add wallet/coin/referral
models, checkout changes, or M2 `customer.engagement.completed` generalization in this task.

#### 207.1 Emit from `_settle_submission()`

| Rule | Detail |
| --- | --- |
| When | Only after `apply_transition` resolves to `Booking.Status.COMPLETED` |
| Never emit | `PARTIALLY_COMPLETED`, `DISPUTED`, `COMPLETION_SUBMITTED` (partner submit alone) |
| Transaction | `enqueue_outbox_event` in the **same** `atomic()` block as the status transition |
| Idempotency key | Exactly `customer-fulfilment-completed:{booking_id}` |
| Uniqueness | `OutboxEvent` constraint on `(event_type, idempotency_key)` — retries cannot create a second row |

#### 207.2 `apps/loyalty/` scaffold (minimal for C0b)

Final C0b tree — no extra packages, no models in this wave:

```text
apps/loyalty/
│
├── handlers.py
│
└── services/
    ├── completion.py
    ├── referral.py
    └── notifications.py
```

Handler stays thin — **no business logic in the handler body**:

```text
customer.fulfilment.completed
            │
            ▼
     loyalty handler (handlers.py)
        ├── record_completion_for_customer()     # C0b: stub (signature locked for C2)
        ├── evaluate_referral_qualification()    # C0b: stub until C4
        └── notify_booking_completed()           # C0b: real — wire booking.completed purpose
```

| Service (C0b) | Behaviour |
| --- | --- |
| `record_completion_for_customer` | Callable exists with locked signature; **no** `CustomerCompletion` table until C2; no counter increment |
| `evaluate_referral_qualification` | Stub until `ReferralAttribution` exists in C4 |
| `notify_booking_completed` | **Real** — `request_notification(..., purpose="booking.completed")`, idempotent on booking key |

Later waves plug into the same services:

| Wave | Plugs into |
| --- | --- |
| C2 (`M3-BE-224`) | `CustomerCompletion` model + `get_or_create`; then coin unlock from completion count |
| C4 | `evaluate_referral_qualification` → qualify + pay per snapshotted program |
| M2 (future) | `customer.engagement.completed` handler → same `record_completion_for_customer` with `ENGAGEMENT` |

#### 207.3 Core invariant (what tests must prove)

Do **not** treat status and outbox as independent assertions. The valuable guarantee is:

> **A committed `COMPLETED` booking must have its corresponding completion event, and a rolled-back settlement must have neither.**

#### 207.4 Test matrix (minimum)

| # | Scenario | Expected |
| --- | --- | --- |
| T1 | Settlement → `COMPLETED` | Exactly **one** `customer.fulfilment.completed` outbox row |
| T2 | Repeated settlement / retry / duplicate confirm | Still **one** row (idempotency key) |
| T3 | Settlement → `PARTIALLY_COMPLETED` | **No** outbox row |
| T4 | Settlement → `DISPUTED` | **No** outbox row |
| T5 | Partner `submit_completion` only → `COMPLETION_SUBMITTED` | **No** outbox row |
| T6 | Handler dispatch | `request_notification` for `booking.completed` invoked **once** per event |
| T7 | Transaction coupling | After successful settle commit: `COMPLETED` **and** outbox row both visible |
| T8 | Rollback | Force settlement failure mid-transaction: booking **not** `COMPLETED`, outbox row **absent** |
| T9 | `completed_at` in payload | Equals `BookingStatusHistory.created_at` for the `COMPLETED` transition — never partner `submitted_at` or ad-hoc `now()` |
| T10 | `event_version` in payload | Always `1`; handler validates version before processing |

T7/T8 are the transactional-boundary tests — prefer exercising `_settle_submission()` (or its
caller) inside `transaction.atomic()` with a deliberate failure after enqueue, or use
`CaptureQueriesContext` / `assertNumQueries` patterns only as helpers; the assertion is always
**paired commit state**, not isolated `exists()` checks.

#### 207.5 Explicitly out of scope for M3-BE-207

- Wallet / coin / referral Django models and migrations
- `CustomerCompletion` model (C2 — `M3-BE-224`)
- Checkout wallet or coin burn
- `customer.engagement.completed` (M2 path)
- Generic `customer.*.completed` abstraction
- Operations loyalty CRUD
- HTTP endpoints

---

## 4. Checkout integration (ADR-0003 compliant)

### 4.1 Payment attempt creation (extended)

Customer sends (server validates everything):

```json
{
  "checkout_id": "...",
  "wallet_amount_paise": 0,
  "coin_burn_amount": 0,
  "idempotency_key": "..."
}
```

Server response includes:

- `razorpay_amount_paise` — remainder after wallet + coin burn
- `wallet_reserved_paise`, `coins_burned`, `coin_discount_paise`
- `allocations[]` — unchanged shape; total funded = full order

### 4.2 Failure paths & refunds

| Event | Wallet | Razorpay | Coins |
| --- | --- | --- | --- |
| Payment attempt expires | Release reservation | — | Release burn reservation |
| Payment fails | Release | — | Release |
| **Refund after capture** | **Credit wallet** for wallet-funded share | **Provider refund** for card/UPI share | **No restore** — burned coins stay burned |
| Partial refund | Per `RefundAllocation` split by original funding source | Same | Coins never re-minted |

Refund routing follows how the order was paid. Example: ₹500 order paid as ₹200 wallet + 100 coins (₹100 discount) + ₹300 Razorpay → refund returns ₹200 to wallet and ₹300 via Razorpay; coins are not returned.

### 4.3 Purposes

Add to `PaymentAttempt.Purpose` (planning):

- `WALLET_TOP_UP`

Checkout continues to use `BOOKING_GROUP` and existing M2 purposes; wallet/coins are **modifiers** on the same attempt, not separate orders.

---

## 5. Operations configuration (admin)

All marketing levers live in Operations — **no hard-coded percentages in frontend**.

| Screen (planning) | Actions |
| --- | --- |
| **Coin grant rules** | CRUD rules; **earn tiers** editor; eligibility audience; unlock N; expiry; trigger; effective dates |
| **Coin burn policy** | Set max % and coin value; effective dating; preview on sample order |
| **Wallet top-up policy** | Set min/max top-up in paise; effective dating |
| **Referral programs** | Create **new version** (never edit in-place if attributions exist); **tier table** with unlimited rows; version **history** read-only; tier preview |
| **Referral attributions** | Read-only queue; show `program_version_id` + **terms_snapshot**; fraud mark; manual qualify/deny with reason |
| **Wallet liability** | Sum of customer balances; top-ups vs debits report |
| **Adjustments** | Maker-checker wallet/coin adjustments with reason |

---

## 6. Customer & Partner UX (planning)

### Customer

| Surface | Behaviour |
| --- | --- |
| Signup | `?ref=` **auto-fills** referral field; attribution on OTP signup; show **promised coins** from active rules |
| Account → Wallet | Balance, top-up (shows configured min/max), transaction history |
| Account → Coins | Promised / locked / spendable / expiring buckets |
| Account → Referral | My code, **copy link**, **tier schedule** (e.g. ₹100 each · ₹200 after 5), pending vs earned per referral |
| Checkout | Toggle use wallet; toggle use coins; server shows cap (“Max 30% of this order”) |

### Partner

No customer wallet or coin surfaces on Partner app in Phase C unless a future rule pays partners in coins (default: **no**).

---

## 7. API proposals (write before implementation)

Create under `contracts/proposals/`:

| Proposal | Endpoints (draft) |
| --- | --- |
| `00XX-customer-wallet.md` | `GET /customer/wallet/`, `POST /customer/wallet/top-up/`, transactions list |
| `00XX-customer-coins.md` | `GET /customer/coins/`, checkout burn preview |
| `00XX-customer-referral.md` | `GET /customer/referral/` (code + share URL); attribution at signup via `ref` param |
| `00XX-operations-loyalty.md` | CRUD grant rules, burn policy, referral program versions |
| Extend payment attempt | `wallet_amount_paise`, `coin_burn_amount` on create |

---

## 8. Phased build (Phase C detail)

### Wave C0 — ADR + proposals + schema

- [ ] ADR-0010 customer wallet & loyalty scope
- [ ] Contract proposals reviewed by owner
- [ ] Django models + migrations (wallet, coins, referral)
- [ ] Plan `apps/loyalty/` module (or `apps/commerce/loyalty/`) for coins + referral commands
- [ ] No HTTP until proposals approved

### Wave C0b — M1 completion outbox hook (`M3-BE-207`; no wallet/coin models)

- [ ] `apps/loyalty/` minimal scaffold (`handlers.py`, `services/completion.py`, `referral.py`, `notifications.py`)
- [ ] Emit `customer.fulfilment.completed` from `_settle_submission()` when `to_status == COMPLETED` only
- [ ] Idempotency key exactly `customer-fulfilment-completed:{booking_id}`
- [ ] Orchestrator handler — services only, no inline business logic
- [ ] `record_completion_for_customer` boundary (stub until C2); `evaluate_referral_qualification` stub until C4
- [ ] `notify_booking_completed` — real `booking.completed` notification wiring
- [ ] Tests T1–T10 (§3.5 / 207.4): including transactional commit/rollback invariant

### Wave C1 — Wallet core

- [ ] `credit_wallet`, `reserve_wallet`, `capture_wallet`, `release_wallet` commands
- [ ] `WALLET_TOP_UP` payment flow
- [ ] Customer wallet read API
- [ ] Operations liability report (read-only)

### Wave C2 — Coin rules engine

- [ ] `CoinGrantRule` + `CoinEarnTier` + `CoinBurnPolicy` Operations CRUD
- [ ] Grant on signup (promised + locked) with eligibility filters
- [ ] Earn on `BOOKING_COMPLETED` — tier selection by order value or booking sequence
- [ ] `CustomerCompletion` model + `UNIQUE(customer_id, source_type, source_id)` (§3.4)
- [ ] `record_completion_for_customer` — real `get_or_create`; **no** mutable counter column
- [ ] Unlock on booking completion (configurable N) — driven by `CustomerCompletion` count
- [ ] Expiry sweep task
- [ ] Customer coins read API

### Wave C3 — Checkout integration

- [ ] Extend payment attempt for wallet + coin burn
- [ ] Checkout preview endpoint (max burn, spendable)
- [ ] Customer payment UI (`payment-workspace.tsx` pattern)
- [ ] Refund-to-wallet path

### Wave C4 — Referral

- [ ] `ReferralProgramVersion` + `ReferralProgramRewardTier` Operations CRUD (volume tiers §2.4.1)
- [ ] Program versioning + attribution snapshot at signup
- [ ] Apply referral at **signup only** (`?ref=` auto-fill → attribution on account create)
- [ ] Qualify on first completed booking (configurable event hook)
- [ ] Tier selection at payout: `n = successful_rewarded_count + 1` → highest matching tier (thresholds admin-configured per tier row)
- [ ] Issue rewards — store `tier_id` + computed amounts on `ReferralReward` (immutable)
- [ ] Customer referral page — tier schedule + earned history per referral

### Wave C5 — Hardening

- [ ] Idempotency tests (owner runs)
- [ ] **Wallet concurrency** — two parallel checkouts cannot spend more than available balance (§2.7.1)
- [ ] **Coin concurrency** — two parallel checkouts cannot reserve/burn more than spendable coins (§2.3.1)
- [ ] Referral `UNIQUE(referee_id)` — second code at signup rejected
- [ ] Fraud: self-referral, duplicate device (minimum rules)
- [ ] `docs/runbooks/m3-wallet-coins-referral-smoke.md`
- [ ] M3 Phase C acceptance scenarios (below)

---

## 9. Acceptance scenarios (Phase C gate)

| # | Scenario |
| --- | --- |
| C-01 | Top-up ₹500 via Razorpay → wallet balance +500 |
| C-02 | Order ₹1000, burn policy 30%, coin value 10p → max burn ₹300 |
| C-03 | Signup shows 500 promised coins, 0 spendable until 1st completion |
| C-04 | Rule requires 3 completions → unlocks only after third |
| C-05 | Festival coins expire; evergreen coins do not |
| C-05a | Order-value earn tiers: ₹500 order → 25 coins per configured bands |
| C-05b | Booking-sequence earn tiers: 1st completion 500 coins, 2nd 200, 3rd 300 |
| C-05c | `REACTIVATED_CUSTOMER` rule: 1,000 coins only when last completion > 90 days ago |
| C-05d | `NEW_CUSTOMER` rule does not fire for customer with prior completion |
| C-06 | Referrer under v1 tiers (₹100 / ₹200@5); program changes to v2; v1 attribution still pays v1 tier amounts |
| C-07 | Both sides rewarded when configured |
| C-07a | Admin-configured tiers: e.g. 1st–4th **successful** referral ₹100, 5th+ ₹200 — threshold `5` is Operations config, not code |
| C-07b | Tier count uses **REWARDED** attributions only (qualifying event met + paid); signups/pending do not advance tier |
| C-07c | Tier selection uses `successful_rewarded_count + 1`; replay cannot pay twice at a different tier |
| C-07d | Admin adds tier min=10 ₹300 in **new program version** — pending v1 attributions still pay v1; new signups pay v2 |
| C-07e | Attribution stores `terms_snapshot`; `ReferralReward` stores version + tier + `payout_sequence_n` — Operations can audit promised vs paid |
| C-07f | Referee B attributed to A only — signup with C's code after B exists → rejected (`UNIQUE(referee_id)`) |
| C-08 | Checkout: ₹200 wallet + ₹300 Razorpay + allocations sum to ₹500 |
| C-09 | Failed payment releases wallet reservation |
| C-09a | **Concurrency:** wallet ₹500; parallel ₹400 + ₹300 attempts — at most one succeeds; balance never negative |
| C-09b | **Concurrency:** 1,000 spendable coins; parallel 700 + 600 burn attempts — at most 1,000 coins consumed total |
| C-10 | Operations adjustment appears in audit trail |
| C-11 | `?ref=CODE` on signup URL auto-fills referral; attribution after OTP signup |
| C-12 | Refund restores wallet + Razorpay portions; burned coins not restored |
| C-13 | Top-up below min or above max rejected per Operations policy |
| C-14 | `COMPLETED` booking enqueues exactly one `customer.fulfilment.completed` outbox event |
| C-15 | Replay of confirm/auto-finalize does not double-enqueue (idempotency key) |
| C-16 | `PARTIALLY_COMPLETED` / `DISPUTED` / `COMPLETION_SUBMITTED` do **not** enqueue |
| C-17 | Committed settle: `COMPLETED` status and outbox row appear together |
| C-18 | Rolled-back settle: neither `COMPLETED` nor outbox row remains |
| C-19 | Handler dispatches `booking.completed` notification once per event |
| C-20 | Outbox `completed_at` equals `BookingStatusHistory.created_at` for the `COMPLETED` transition |
| C-21 | (C2) Outbox retry cannot insert duplicate `CustomerCompletion` — `(customer_id, source_type, source_id)` unique |
| C-22 | (C2) Coin unlock runs only when `get_or_create` returns `created=True` |
| C-23 | Payload includes `event_version: 1` |

---

## 10. Decisions log & remaining questions

### Resolved (owner, 2026-09-01)

| ID | Decision |
| --- | --- |
| **OQ-02** | Referral **signup only**; unique code + share link; `?ref=` auto-fills signup form |
| **OQ-03** | Refund restores **wallet + Razorpay**; **does not** restore burned coins |
| **OQ-04** | Wallet top-up **min/max configurable** in Operations |
| **OQ-06** | Referral **volume tiers** — unlimited admin-configured thresholds; change rewards via **new program version**; `terms_snapshot` + immutable `ReferralReward`; **`UNIQUE(referee_id)`** |
| **OQ-07** | Coin **earn tiers** — `CoinEarnTier` by order value or booking sequence; **customer eligibility** audience on each rule |
| **OQ-08** | Wallet **available ≥ 0** and coin **spendable ≥ reserved+burned** — mandatory C5 concurrency tests |

### Still open — need your call

| ID | Plain English | Options |
| --- | --- | --- |
| **OQ-01** | **When a customer spends coins at checkout, how many rupees is each coin worth?** | **A)** One platform-wide rate in Operations (e.g. 1 coin = ₹0.10 everywhere). **B)** Each campaign sets its own rate when coins are granted (Diwali coins worth more than signup coins). *Planning default: A — simpler; pick B only if you need different coin “brands”.* |
| **OQ-05** | **Do you want automatic “cashback” (e.g. “5% back on every booking”) in M3?** | `milestones.md` lists **Wallet, V Coins, Referral** — not cashback. An old design doc mentioned cashback separately. **Defer** = skip for M3; **Include** = add cashback rules engine (extra scope). *Planning default: defer unless you add it to the commercial milestone.* |

---

## 11. Testing note

Per `AGENTS.md`, agents **write** tests; owner **runs** them. Every wave above lists test files in
`task.md` when implementation starts.
