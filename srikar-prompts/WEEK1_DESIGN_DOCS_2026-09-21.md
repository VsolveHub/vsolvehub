# Week 1 Design Docs — Milestone 3 (21–27 Sep 2026)

**Audience:** Srikar + agents (Internal). Pair with client Review Copy for demos only.  
**Authority:** Client PDF (Week 1 = all M3) · Internal plan Notion · `Django_Next.js_Plan/M3/` · `AGENTS.md` · ADRs  
**Trunk tip at writing:** `feature/m3-a10-listings` @ `4209d16` · base `main` @ `4a08ad3`  
**Hard bans:** never merge `origin/m3-changes` · never cherry-pick `3fa3016` · never `git add -A` · no secrets in chat/repo  

---

## 0. Design principles (non-negotiable)

1. **Django owns money, permissions, status, pricing.** Integer **paise**. No client-trusted amounts.  
2. **ADR-0003** allocation model; **ADR-0004** fail-closed providers (`PAYMENT_PROVIDER` / `OTP_PROVIDER` stay `unconfigured` until staging secrets exist).  
3. **Contract-first:** proposal → Django → spectacular `contracts/openapi/v1.yaml` → regenerate `frontend/packages/api-client`. No hand-edits of generated client.  
4. **Listing ≠ Booking; A7/A9 ≠ Booking/FulfilmentUnit/visit OTP** (`03-rental-stay-jobs-categories.md`).  
5. **Done** = works on **staging**, tested, merged (trunk continuous; **`main` Sat 26** only when exit checklist green).  
6. **Ownership:** Codex-shaped `backend/**` + OpenAPI; Claude-shaped `frontend/**` + proposals. Admin = `frontend/apps/admin` only.

---

## 1. System context (Week 1 surface)

```
Customer (:3000) ─┐
Partner  (:3001) ─┼─► Django/DRF API ─► Postgres
Ops/Admin(:3002) ─┘         │
                            ├─ Razorpay (test → live later)
                            ├─ MSG91 OTP/SMS
                            ├─ Redis + Celery (outbox ADR-0002)
                            └─ Staging host (Lane A)
```

**Week 1 does not invent** mobile apps, Rapido, or AI (those are W2–W3). It **does** finish web M3: Part A verified, real pay/OTP, wallet/loyalty, admin exports, staging→main.

---

## 2. Lane designs

### 2.A Platform / Staging (Lane A)

| Topic | Decision |
| --- | --- |
| Target | Staging URL serving customer/partner/admin against one API |
| Compose | New `infra/compose.staging.yaml` (+ `Dockerfile.api`, `Dockerfile.web`, nginx, 3 origins) |
| Process | gunicorn API + Celery worker + one beat |
| Deploy | GH Action or script: push trunk → staging; **after Sat merge**, staging tracks **`main`** |
| Secrets | Host/env manager only — documented in runbook; never committed |
| Data | `migrate` + seed commands (task, m2 demo, listing, rental, stay) |
| Health | Explicit health endpoint 200 |

**Exit:** staging live; auto-deploy green; runbook `docs/runbooks/staging-deploy.md`.

---

### 2.B Part A harden — Rental / Stay / Jobs (Lane B)

| Topic | Decision |
| --- | --- |
| Career A10 | Keep `apps/listings`; fail-closed config+capability; public_state FE; A10-only chrome |
| Rental A7 | Keep `apps/rental`; remove **demo HELD** deposit — see §2.C money bridge |
| Stay A9 | Enquiry-first MVP stays; **add** Hotels filters + **date pricing** (PDF gap) |
| Smoke | `docs/runbooks/m3-part-a-smoke.md` + `m3-a10-listing-smoke.md` |
| Seeds | `seed_listing_catalog`, `seed_rental_demo`, `seed_stay_demo` |

**Stay date pricing (design choice for W1):**  
- Publish `nightly_rate_paise` (and optional weekend/seasonal override later) on Property/Unit.  
- Customer enquiry (or quote preview) shows `nights × rate` in **paise**, server-computed.  
- Full `StayReservation` + UnitReservation lock matrix remains **post-W1** unless PDF “booked and paid” forces a thin paid reservation — **default W1:** enquiry + displayed quote; paid stay booking only if client insists in handover Qs (see §5).

**Hotels filters:** location, price band, sharing/AC flags already on models where present; expose query params on `GET /api/v1/stays`.

---

### 2.C Payments — Razorpay (Lane C)

| Topic | Decision |
| --- | --- |
| Provider | `PAYMENT_PROVIDER=razorpay` on staging only after keys |
| Existing code | `backend/apps/commerce` already implements provider path — **activate + prove**, don’t rewrite |
| Purposes | All legacy booking purposes + `A10_VENDOR_SUBSCRIPTION` + `A10_PREMIUM_LISTING` + **new** `A7_RENTAL_DEPOSIT` (+ `WALLET_TOP_UP` with Lane E) |
| Webhooks | Verify signature; **idempotent** capture; replay-safe |
| Matrix | Success / failure / retry / **refund** for each purpose (PDF) |
| Refunds | Provider refund for Razorpay portion; wallet restore rules with Lane E (coins **never** restored — M3 task law) |

**A7 deposit bridge (critical):**  
Today: `RentalDeposit` created `HELD` with `provider_note` PARTIAL.  
W1: create `PaymentAttempt(purpose=A7_RENTAL_DEPOSIT)` → authorize/capture per Razorpay test capabilities → only then `HELD`; release/consume via existing partner commands + commerce refund/release paths. If Razorpay cannot pure-authorize, document **capture-then-refund-as-release** and keep integer paise ledger honest.

**Cross-archetype (D4 / `M3-BE-371`):** wallet+coin split on A10 (and A7/A9 if paying) lands Thu–Fri after wallet exists.

---

### 2.D OTP / SMS — MSG91 (Lane D)

| Topic | Decision |
| --- | --- |
| Setting | `OTP_PROVIDER=msg91` when account+template ready; else remain fail-closed |
| Scope | Login OTP + transactional SMS hooks already abstracted in identity/notifications |
| DLT | Templates submitted Day 1; Indian DLT approval may lag — escalate same day |
| Fallback | Dev/print OTP **forbidden on staging** once MSG91 enabled; if blocked, written exception with date (still chase) |

---

### 2.E Wallet / V Coins / Referral (Lane E)

**Design authority:** `Django_Next.js_Plan/M3/01-wallet-vcoins-referral.md` + task Phase C + **ADR-0010 (to write Proposed in W1)**.

| Entity | Notes |
| --- | --- |
| `WalletAccount` / `WalletTransaction` | Customer liability; available ≥ 0; concurrency tests `M3-BE-253` |
| Coins | Earn tiers, burn policy; spendable invariant `M3-BE-254`; **refunds never restore burned coins** |
| Referral | Versioned program; attribution at signup (`?ref=`); reward on first-complete |
| Checkout split | Wallet + coins + Razorpay remainder displayed server-side |
| Top-up | `WALLET_TOP_UP` purpose; Ops min/max policy |

**Module layout:** `backend/apps/wallet/`, `backend/apps/loyalty/` (or single loyalty app per task fold) — follow task C0/C1 IDs; don’t invent parallel money tables outside ADR-0003 allocations.

---

### 2.F A10 money (Lane F)

| Topic | Decision |
| --- | --- |
| Drop | FE simulated capture |
| Use | Real Razorpay Checkout for subscription + premium (`M3-FE-101/102`, `M3-BE-358`) |
| Keep | Free publish when capability + ACTIVE config (ADR-0012); plan caps with ACTIVE VendorSubscription |

---

### 2.G Admin reports + exports (Lane G)

| Topic | Decision |
| --- | --- |
| App | Extend `frontend/apps/admin` — never create `apps/operations` |
| Backend | New `backend/apps/reporting/` (or ops reporting module) reading existing commerce/partner ledgers |
| W1 MVP set | Revenue / bookings / customers dashboards (`M3-OPS-401`) + **Excel + CSV + PDF** export (`M3-OPS-402`) + settlement/GST-TDS stub or real if CA rules arrive (`M3-OPS-403`) |
| Library | e.g. openpyxl (+ PDF lib agreed in session) via `backend/requirements/base.in` → hashed lock regen |

---

### 2.H Legacy 7 categories (Lane H)

Technician, Beauty, Home, Pet, Construction, Manpower, Event — already on M1/M2 spine.  
W1: **P0/P1 book+pay breakages only** on staging after Razorpay on; event rate-card gap if it blocks pay. No redesign.

---

## 3. Week 1 data / API change summary

| Change | Contract impact |
| --- | --- |
| `A7_RENTAL_DEPOSIT`, `WALLET_TOP_UP` purposes | OpenAPI + client regen |
| Wallet/loyalty endpoints | New proposal(s) → Django → spectacular |
| Stay filters + rate fields | Proposal patch + serializers |
| MSG91 settings | Env only; no public API |
| Reporting endpoints | Ops-auth only |

---

## 4. Test & evidence plan

| Area | Evidence |
| --- | --- |
| Part A | Smoke runbook signed; pytest listings/rental/stay |
| Pay matrix | Purpose × success/fail/retry/refund screenshots + Razorpay dashboard |
| OTP | SMS on real test handset |
| Wallet | Top-up, split checkout, concurrency tests |
| Admin | Downloaded xlsx/csv/pdf from staging |
| Deploy | Action log: push → staging; Sat: `main` SHA deployed |

Owner command pack (from Internal plan): migrate + all seeds + pytest commerce/identity/rental/stay/listings/wallet/loyalty + `pnpm verify`.

---

## 5. Questions for the **previous development team** (handover)

### Git / process
1. Exact relationship of `m3-planing` / `origin/m3-changes` / tip `3fa3016` to current `main` — what was abandoned and why?  
2. Any unmerged PRs, private forks, or agent worktrees we must **not** touch?  
3. Who has GitHub org admin / branch protection / secret access today?

### Staging / infra
4. Has **any** staging or cloud host ever existed (URL, provider, SSH, DNS)?  
5. Where do production-intent secrets live today (1Password, dotenv on laptop only, etc.)?  
6. Celery/Redis/Postgres backup practice — any scripts outside `infra/`?

### Payments
7. Which Razorpay **mode** (test/live) was last used; webhook URL history; any captured live traffic?  
8. Confirm the test key that leaked in chat — is it revoked? Who rotates?  
9. Is refund API path already exercised in tests or only coded?  
10. Any parallel money paths outside `PaymentAttempt` / ADR-0003 we should know about?

### OTP / MSG91
11. Was MSG91 ever provisioned (account ID, entity ID, templates, DLT status)?  
12. Which SMS templates were drafted; approved or rejected?  
13. Any WhatsApp/voice providers partially wired?

### Wallet / loyalty / reports
14. Any spike branches or Notion specs beyond `01-wallet-vcoins-referral.md`?  
15. CA-agreed commission / GST / TDS formulas already written down?  
16. Any existing Metabase/Excel pipelines for ops?

### Product gaps
17. Hotels **date pricing** expected model (nightly only vs seasonal)?  
18. Stay: is **enquiry-only** acceptable for M3 sign-off, or must guests **pay** on web in W1?  
19. Event category rate-card — known broken paths?  
20. Partner shell / tap-first nav — any unfinished redesign docs?

### Apps / Rapido / AI (for W2–W3, ask now)
21. Any Expo/RN or Flutter spike? Repo location?  
22. Rapido fare rules / city geo / vehicle classes from client?  
23. Preferred LLM vendor for AI chatbot (if still in PDF)?

### Access checklist
24. Transfer: GitHub, hosting, DNS, Razorpay, MSG91, Google Maps, Firebase (if any), Play/App Store, email OTP logs, error tracking (Sentry?).  
25. Known P0 bugs list and “do not reopen” decisions.

---

## 6. Questions for the **client** (V Solve Hub)

### Commercial / sign-off
1. Who attends **Sun 27 Sep** demo and who has authority to **sign Milestone 3** in writing?  
2. Confirm PDF Week 1 exit checklist is the acceptance bar (all 8 boxes).  
3. Confirm Weeks 2–3 still include **apps + Rapido + AI** as in the Review Copy (or list carve-outs now).

### Access (needed Mon–Tue)
4. Razorpay login + **new** key/secret + permission to set webhooks (old test key must be rotated).  
5. MSG91 account + DLT template approval contact / timeline.  
6. Hosting + domain + SSL for **staging (Mon 21)** and production (Week 2).  
7. Google Maps billing account (Rapido W2; any W1 map use?).  
8. Play Console + Apple Developer accounts (Week 2).  

### Money rules
9. Platform commission % by category (A1–A10 / A7 / A9)?  
10. GST/TDS treatment for collections and vendor payouts?  
11. Wallet: min/max top-up; can wallet pay 100% of cart?  
12. V Coins: earn/burn rates; expiry; max % of order?  
13. Referral: reward for referrer vs referee; when paid (signup vs first completed job)?  
14. Vendor subscription plans and premium listing prices (INR) for Careers?  
15. Rental deposit: hold vs immediate capture preference; damage dispute SLA?

### Product
16. Stay/Hotels: is **enquiry without online pay** OK for M3, or must booking+pay ship Week 1?  
17. Which **admin reports** are mandatory for M3 sign-off (list top 5)?  
18. OTP: SMS only, or WhatsApp too in M3?  
19. Multi-city / service area restrictions for staging demo?  
20. Brand assets / legal pages needed on staging before demo?

### Ops
21. Support phone/email shown in apps later — decide now for SMS sender ID.  
22. Who receives staging URLs and test phone numbers (NDA)?  
23. Preferred language(s) for customer SMS copy?

---

## 7. Decision log (fill in 20 Sep meeting)

| # | Decision | Owner | Date |
| --- | --- | --- | --- |
| D1 | Sat 26 trunk→`main` only if checklist green | Srikar | |
| D2 | Stay W1 = enquiry+quote vs paid reservation | Client | |
| D3 | AI in Week 3 yes/no | Client | |
| D4 | Mobile stack Expo/RN confirmed | Srikar | |
| D5 | A7 deposit = auth-hold vs capture-refund | Eng | |

---

## 8. References

- Internal: [M3 + M4 Full Delivery Plan](https://app.notion.com/p/3e0de648d339817fba9bc2f3d2f208d8)  
- Review Copy: [M3 and 4 Completion Plan](https://app.notion.com/p/3e0de648d339814bb97cc44e1f209f59)  
- Week 1 ops plan: `srikar-prompts/WEEK1_PLAN_2026-09-21.md`  
- Design: `Django_Next.js_Plan/M3/01-wallet-vcoins-referral.md`, `03-rental-stay-jobs-categories.md`, `task.md`  
- ADRs: `0003`, `0004`, `0012` (+ write `0010` Proposed in W1)  
- Runbooks: `docs/runbooks/m3-part-a-smoke.md`, `m3-a10-listing-smoke.md`

---

*Keep this file untracked under `srikar-prompts/`.*
