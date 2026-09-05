# M3 Master Task Board

**Scope:** Milestone 3 — Listings & Marketplace + full web money platform  
**Status:** **Planning only** — no phase started  
**Commercial terms:** see `milestones.md`

**Start here for Phase C detail:** [01-wallet-vcoins-referral.md](01-wallet-vcoins-referral.md)

---

## Phase overview

| Phase | Name | Status | Depends on |
| --- | --- | --- | --- |
| **A** | Procurement & staging | `[ ]` Not started | — |
| **B** | Real Razorpay + MSG91 on M1/M2 | `[ ]` Not started | A |
| **C** | Wallet, V Coins, Referral | `[ ]` Not started | B (checkout); schema can parallel B |
| **D** | Rental, Stay, Jobs categories | `[ ]` Not started | B |
| **E** | Operations analytics & exports | `[ ]` Not started | C, D partial |
| **F** | M3 staging acceptance | `[ ]` Not started | A–E |

---

## Phase A — Procurement & staging

- [ ] `M3-OPS-001` Razorpay test account + webhook secret on staging
- [ ] `M3-OPS-002` MSG91 account + DLT template submission
- [ ] `M3-OPS-003` Staging env vars documented in runbook (no secrets in repo)
- [ ] `M3-OPS-004` CA/legal sign-off checklist for live collections (track blocker)

---

## Phase B — Real payments & OTP

*Plan doc `02-real-payments-and-otp.md` not written yet.*

- [ ] `M3-BE-101` Enable `PAYMENT_PROVIDER=razorpay` on staging; provider drill
- [ ] `M3-BE-102` MSG91 OTP adapter (`OTP_PROVIDER=msg91`) + fallback policy
- [ ] `M3-BE-103` End-to-end payment reconciliation on staging (existing runbook)
- [ ] `M3-FE-101` Customer payment handoff verified against Razorpay test Checkout
- [ ] `M3-FE-102` Remove reliance on simulated capture for staging demos

**Exit gate:** A1 booking group can be paid on staging with Razorpay test mode; OTP delivered via MSG91 or documented fallback.

---

## Phase C — Wallet, V Coins, Referral

**Design authority:** [01-wallet-vcoins-referral.md](01-wallet-vcoins-referral.md)

### C0 — Foundation

- [ ] `M3-BE-201` ADR-0010 customer wallet & loyalty scope (`docs/adr/`)
- [ ] `M3-BE-202` Contract proposals: wallet, coins, referral, operations loyalty
- [ ] `M3-BE-203` Models: `WalletAccount`, `WalletTransaction`
- [ ] `M3-BE-204` Models: `CoinGrantRule`, `CoinEarnTier`, `CoinGrant`, `CoinTransaction`, `CoinBurnPolicy`
- [ ] `M3-BE-205` Models: `ReferralProgramVersion`, `ReferralProgramRewardTier`, `ReferralCode`, `ReferralAttribution`, `ReferralReward`
- [ ] `M3-BE-206` `apps/loyalty/` module scaffold — **folded into M3-BE-207** (minimal C0b tree only)

### C0b — M1 completion outbox hook (`M3-BE-207` — next implementation; planning locked)

Single task; do not jump to wallet/coin models.

- [ ] **207.1** Emit `customer.fulfilment.completed` from `_settle_submission()` — `COMPLETED` only, same transaction
- [ ] **207.2** Idempotency key `customer-fulfilment-completed:{booking_id}` (unique constraint)
- [ ] **207.3** `apps/loyalty/handlers.py` orchestrator → `services/completion.py`, `referral.py` (stub), `notifications.py` (real)
- [ ] **207.4** `record_completion_for_customer` boundary (stub); `evaluate_referral_qualification` stub until C4
- [ ] **207.5** Tests T1–T10 — transactional invariant; T9/T10 lock `completed_at` and `event_version`

**Out of scope for 207:** wallet/coin/referral models, checkout, M2 `customer.engagement.completed`, HTTP, Operations CRUD.

~~M3-BE-208~~ / ~~M3-BE-209~~ — merged into `M3-BE-207` per owner scope lock.

### C1 — Customer wallet

- [ ] `M3-BE-211` Commands: credit, reserve, capture, release wallet
- [ ] `M3-BE-212` `WALLET_TOP_UP` payment purpose + Razorpay capture → credit
- [ ] `M3-BE-213` `GET /customer/wallet/` + transaction history (paginated)
- [ ] `M3-BE-214` `POST /customer/wallet/top-up/` (enforces configurable min/max)
- [ ] `M3-BE-215` Operations `WalletTopUpPolicy` CRUD
- [ ] `M3-FE-211` Account → Wallet page (balance, history, top-up)
- [ ] `M3-OPS-211` Wallet liability read-only report

### C2 — V Coins engine

- [ ] `M3-BE-221` Operations CRUD: `CoinGrantRule` + `CoinEarnTier` (earn_mode, eligibility, unlock N, expiry, trigger)
- [ ] `M3-BE-222` Operations CRUD: `CoinBurnPolicy` (max %, coin value paise, effective dates)
- [ ] `M3-BE-223` Grant on signup — promised + locked buckets; eligibility filters (§2.2.2)
- [ ] `M3-BE-227` Earn on booking complete — tier selection by order value or booking sequence (§2.2.1)
- [ ] `M3-BE-224` `CustomerCompletion` ledger — `UNIQUE(customer_id, source_type, source_id)`; unlock only on `get_or_create(created=True)` (§3.4)
- [ ] `M3-BE-225` Celery: coin expiry sweep (FIFO burn order documented)
- [ ] `M3-BE-226` `GET /customer/coins/` — promised / locked / spendable / expiring_soon
- [ ] `M3-FE-221` Signup/onboarding promised-coins disclosure
- [ ] `M3-FE-222` Account → Coins page
- [ ] `M3-OPS-221` Coin grant rules admin UI
- [ ] `M3-OPS-222` Burn policy admin UI + preview

### C3 — Checkout integration

- [ ] `M3-BE-231` Extend `POST /payment-attempts/` — `wallet_amount_paise`, `coin_burn_amount`
- [ ] `M3-BE-232` Checkout preview: max burn from active policy (server-only math)
- [ ] `M3-BE-233` Refund: wallet portion → wallet; Razorpay portion → provider; coins not restored
- [ ] `M3-BE-235` Coin `RESERVE` / `RELEASE` on payment attempt (concurrency-safe burn path)
- [ ] `M3-FE-231` Payment workspace — wallet toggle + coin toggle + server caps
- [ ] `M3-FE-232` Split display: wallet + coins + Razorpay remainder
- [ ] `M3-BE-234` Regression tests: ADR-0003 allocation sum invariant with splits

### C4 — Referral

- [ ] `M3-BE-241` Operations: `ReferralProgramVersion` + `ReferralProgramRewardTier` CRUD (volume tiers §2.4.1)
- [ ] `M3-BE-242` Referral attribution at **signup only** — `?ref=` param, auto-fill, snapshot `program_version_id` + **`terms_snapshot`**
- [ ] `M3-BE-243` Qualifying hook: default **first completed booking**
- [ ] `M3-BE-244` Tier selection at payout; immutable `ReferralReward` (version, tier, `payout_sequence_n`); never rewrite paid rows
- [ ] `M3-BE-245` Self-referral + basic fraud guards + **`UNIQUE(referee_id)`** on attribution (§2.6.1)
- [ ] `M3-BE-246` Publish referral changes as **new program version only**; version history read-only in Operations
- [ ] `M3-FE-240` Signup page: read `?ref=` from URL, auto-fill referral field
- [ ] `M3-FE-241` Account → Referral (code, copy link, **tier schedule**, pending/earned — no late code entry)
- [ ] `M3-OPS-241` Referral program versions + **tier editor** + attribution queue

### C5 — Phase C acceptance

- [ ] `M3-DOC-251` Runbook `docs/runbooks/m3-wallet-coins-referral-smoke.md`
- [ ] `M3-QA-251` Acceptance scenarios C-01 … C-23+ (owner manual pass)
- [ ] `M3-BE-252` Object-level auth tests (owner runs)
- [ ] `M3-BE-253` **Wallet concurrency** — parallel checkout cannot drive balance below zero (§2.7.1, C-09a)
- [ ] `M3-BE-254` **Coin concurrency** — parallel checkout cannot burn more than spendable (§2.3.1, C-09b)

**Phase C exit gate:** All scenarios in `01-wallet-vcoins-referral.md` §9 pass on staging.

---

## Phase D — Rental, Stay, Jobs

*Plan doc `03-rental-stay-jobs-categories.md` not written yet.*

- [ ] `M3-BE-301` Rental engine (inventory, calendar, deposits)
- [ ] `M3-BE-302` Stay engine (listings, enquiry inbox)
- [ ] `M3-BE-303` Careers engine (post/apply board)
- [ ] `M3-FE-301` Customer + Partner + Operations surfaces for each
- [ ] `M3-BE-304` Coins/wallet/referral work on new category checkouts

---

## Phase E — Operations analytics

*Plan doc `04-operations-analytics.md` not written yet.*

- [ ] `M3-OPS-401` Revenue / booking / customer dashboards
- [ ] `M3-OPS-402` Export Excel/CSV/PDF
- [ ] `M3-OPS-403` Settlement & GST/TDS reports
- [ ] `M3-OPS-404` Vendor subscription & premium listing configuration

---

## Phase F — M3 acceptance

- [ ] `M3-QA-501` All 11 web categories demonstrable on staging
- [ ] `M3-QA-502` Razorpay + MSG91 + wallet + coins + referral E2E
- [ ] `M3-QA-503` Written client sign-off (`milestones.md` acceptance process)

---

## Task marking rules

| Mark | Meaning |
| --- | --- |
| `[ ]` | Not started |
| `[~]` | Built — owner verification pending |
| `[x]` | Accepted with evidence |

Do not mark `[x]` until owner manual pass. Agents do not run pytest; owner runs verification commands listed in `AGENTS.md`.

---

## Owner decisions log

| Date | Decision |
| --- | --- |
| 2026-09-01 | Customer wallet = prepaid INR only; not vendor/A3 wage wallet (PLN-01 resolved) |
| 2026-09-01 | V Coins: burn-only at checkout; max burn % configurable (e.g. 20–30%) |
| 2026-09-01 | Coins visible on signup as promised; spendable after N completions (configurable) |
| 2026-09-01 | Coin expiry per rule (festival TTL or none) |
| 2026-09-01 | Referral: configurable referrer/referee rewards; qualify on first completed booking |
| 2026-09-01 | Referral **volume tiers** — admin configures each threshold and reward; **successful referral** = qualifying event met + paid |
| 2026-09-01 | Referral reward changes via **new program version only** — pending/paid attributions untouched; `terms_snapshot` + immutable `ReferralReward` for clear audit |
| 2026-09-01 | Unlimited tier rows per version — e.g. higher pay after 10, 25, 50 successful referrals without code changes |
| 2026-09-01 | Coin **earn tiers** (`CoinEarnTier`) — order-value bands and booking-sequence bands; **customer eligibility** (`NEW` / `EXISTING` / `REACTIVATED` / `ALL`) |
| 2026-09-01 | Wallet **available ≥ 0** + coin spendable invariant — mandatory C5 concurrency tests (`M3-BE-253`, `M3-BE-254`) |
| 2026-09-01 | Referral **`UNIQUE(referee_id)`** — one attribution per customer lifetime; first valid signup wins |
| 2026-09-01 | Referral program changes grandfathered — snapshot version at attribution |
| 2026-09-01 | Referral signup-only; unique link + code; `?ref=` auto-fill on signup |
| 2026-09-01 | Refund: restore wallet + Razorpay; never restore burned coins |
| 2026-09-01 | Wallet top-up min/max Operations-configurable |
| 2026-09-01 | M1 completion hook: `customer.fulfilment.completed` outbox from `_settle_submission()` when `COMPLETED`; single handler fans out to coins, referral, notification |
| 2026-09-01 | **M3-BE-207** locked: narrow C0b scope — emit + loyalty orchestrator + service stubs + T1–T8 tests; no wallet/coin models; transactional commit/rollback invariant required |
| 2026-09-01 | `completed_at` = `BookingStatusHistory.created_at` for `COMPLETED` transition; never partner submit time or `timezone.now()` |
| 2026-09-01 | `customer.fulfilment.completed` payload includes `event_version: 1`; bump on breaking schema changes |
| 2026-09-01 | C2 `CustomerCompletion` ledger with `UNIQUE(customer_id, source_type, source_id)` — `get_or_create`; unlock only on `created=True`; M1/M2 stay separate event types |
