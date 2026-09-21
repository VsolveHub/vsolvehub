# V Solve Hub — 30-Day Agentic Delivery Plan (M3 → M4)

**Date:** 2026-09-15  
**Mode:** Agentic only — prompt → Cursor/Composer → tests → PR → Vsolve Hub Manager review → fix → owner accept  
**Constraint:** ~30 calendar days to deliver **M3 + M4**  
**Out of scope:** AI chatbot / AI search (unless owner re-includes)  
**In scope:** Rapido / vehicle mobility (MVP defined below if full PDF list slips)  
**Velocity baseline:** A10 Career engine landed in ≤1 agentic day on `feature/m3-a10-listings` (unmerged as of plan start; tip moves — re-pin SHA in daily standup)

**Do not** `git add -A`. Keep `srikar-prompts/` untracked. Never merge `origin/m3-changes` / cherry-pick `3fa3016`.

---

## 1. North star

By Day 30 on **staging** (public go-live window = end of M4):

| Track | Must be true |
| --- | --- |
| **M3-A** | Rental + Rooms/Stay + Career working E2E (Career already PARTIAL on branch) |
| **M3-B** | Razorpay + MSG91 activated on staging across existing + new flows; Wallet + V Coins + Referral usable; vendor subscription/premium for listings live via real test providers |
| **M3-C** | Admin **MVP** reporting (not the entire PDF report-builder megaset) — see deferrals |
| **M4** | Customer + Partner **mobile apps** store-ready *or* TestFlight/Internal track; **Rapido MVP** live on staging; **no AI**; single go-live checklist ready |

If calendar slips: **cut M3-C depth and Rapido depth first**, not Part A categories. PDF contingency already allows Rapido-last; we keep Rapido **in** by shipping **MVP Rapido**, not every PDF bullet.

---

## 2. Operating rules (agentic)

1. **One vertical slice per Cursor session** — exit gate in the prompt; no scope expansion.  
2. **Reuse before invent** — catalog, partners, `PaymentAttempt`, ops cases, outbox, generated OpenAPI.  
3. **A7/A9 ≠ Booking** — follow `Django_Next.js_Plan/M3/03-rental-stay-jobs-categories.md` (assets/units/deposits; no fake OTPs).  
4. **Money = HIGH ALERT** — idempotency, webhooks, no client-side price, no silent fallbacks.  
5. **Manager reviews every PR** with APPROVE / CHANGES REQUIRED / BLOCK MERGE.  
6. **Owner** accepts staging gates; only owner marks task boards `[x]`.  
7. Parallelize only **independent** tracks (e.g. FE shell vs BE models) with explicit file ownership in prompts.

---

## 3. Merge strategy (follow M1/M2 — do NOT merge A10 to `main` early)

### What M1/M2 actually did

| Milestone | Pattern | Evidence |
| --- | --- | --- |
| **M1** | Lived as the `main` acceptance build while M2 ran in parallel | `AGENTS.md`: pre-M2 `main` tip `d1f443a` is the M1-only cut point |
| **M2** | Long-lived **integration branch** (`feat/m2-workforce-projects` / `M2-revamp`). Side branches (Rohith, Rajesh, UI slices) **merged into M2-revamp continuously**. **`main` received M2 only once**, on owner instruction: `4a08ad3 merge: integrate M2-revamp into main` (23 Aug 2026) | `Django_Next.js_Plan/M2/README.md` Branch policy; `CONTRIBUTING.md` |
| Why | M1 and M2 were **separately accepted / separately paid**. Keeping M2 off `main` preserved an M1 acceptance tree until the owner chose to combine them | M2 README |

Merging to `main` ≠ accepting the milestone. M2 tasks stayed `built — owner verification pending` after integrate.

### M3 / M4 policy (same pattern)

**Do not merge PR #1 into `main` when only Career is ready.** That would break the M2-style “milestone integration branch” model and pollute the M1+M2 `main` baseline mid-M3.

1. **M3 integration branch (long-lived)**  
   - Prefer rename/continue: `feature/m3` or `M3-revamp` (or keep `feature/m3-a10-listings` as the integration trunk and stop treating it as “A10-only”).  
   - All M3 Part A/B/C work lands here first.

2. **Slice branches → integration (continuous)**  
   - `feature/m3-a7-rental`, `feature/m3-a9-stay`, `feature/m3-wallet`, `feature/m3-payments-activate`, etc.  
   - Open PRs **into the M3 integration branch**, not into `main`.  
   - Manager reviews each slice PR; owner can smoke on the integration deploy.

3. **Single integrate to `main` when M3 exit gate passes**  
   - One commit style: `merge: integrate M3 into main` (mirror M2).  
   - Owner explicit instruction required (same as M2).  
   - Until then: `main` stays M1+M2 @ `4a08ad3` class baseline (plus any unrelated owner-approved hotfixes only).

4. **M4**  
   - After M3→`main` (or in parallel only if owner accepts dual integration risk): long-lived `feature/m4` / `M4-revamp`.  
   - Mobile + Rapido MVP slices merge into M4 integration.  
   - Single `merge: integrate M4 into main` at M4 gate (apps + Rapido MVP + go-live checklist; **no AI**).

5. **Draft PR #1 today**  
   - **Retarget** to the M3 integration strategy: either (a) close “merge to main” intent and treat the branch as the M3 trunk, or (b) change base from `main` to `feature/m3` once that trunk exists.  
   - Career stays reviewable; it is **not** a `main` ship by itself.

6. **Never** merge `origin/m3-changes` / cherry-pick `3fa3016` into the M3 trunk (existing hard ban).

### How this changes the 30-day calendar

| Old plan wording | Corrected |
| --- | --- |
| Week 1: “merge Career to `main`” | Week 1: **stabilize Career on M3 integration branch**; staging/UI pass on that branch |
| Slice PRs to `main` | Slice PRs → **M3 integration** |
| End of M3 | **One** integrate M3 → `main` |
| M4 | Build on **M4 integration** (from post-M3 `main`); one integrate at end |

Staging deploys should track the **integration branch**, not `main`, until the milestone integrate.


## 4. Work units (A10 ≈ 1 day)

| Unit | Est. agentic days | Notes |
| --- | --- | --- |
| A10 land (merge + staging + UI pass) | 0.5–1 | Mostly verification |
| Razorpay staging activation (existing A1/M2) | 1–2 | Provider already in repo; wire + reconcile |
| MSG91 OTP activation | 1 | Same |
| Wallet core (account, credit/reserve/capture, top-up) | 1.5–2 | After fulfilment-completed hook if required |
| V Coins thin (earn on complete + burn at checkout) | 1.5–2 | Defer fancy ops UI |
| Referral thin (signup attrib + first-complete reward) | 1 | |
| A7 Rental engine MVP | 2–3 | Heavier than A10 |
| A9 Stay engine MVP | 2–3 | |
| Admin reporting MVP | 1.5–2 | Dashboards + CSV/Excel export; defer custom builder |
| Customer mobile app (API-backed) | 2–3 | Reuse OpenAPI; auth + core flows |
| Partner mobile app | 2–3 | |
| Rapido MVP | 3–5 | Trip lifecycle + fare + maps stub/live; not full PDF laundry list |
| Integration / regression / go-live dry-run | 2–3 | Buffer |

**Sum ≈ 22–33 agentic days** — fits 30 calendar days only with **parallel Cursor sessions**, **MVP cuts**, and **no AI**.

---

## 5. Calendar (4 weeks)

### Week 1 — Stabilize money rails + land Career  
**Goal:** A10 on `main`/staging accepted; payments+OTP no longer `unconfigured` on staging.

| Day | Focus | Exit gate |
| --- | --- | --- |
| D1 | A10 owner UI pass + staging pytest/smoke on **M3 integration branch**; fix PR gaps; **do not merge to `main`** | Career **DONE** on M3 trunk/staging; ADR-0012 still Proposed until owner accepts |
| D2–D3 | Phase A/B: Razorpay test keys, webhook, A1 paid booking on staging | `PAYMENT_PROVIDER=razorpay` staging drill pass |
| D3–D4 | MSG91 OTP end-to-end (or documented fail-closed fallback policy) | Login/OTP path on staging |
| D4–D5 | `M3-BE-207` fulfilment-completed outbox (locked C0b) | Event idempotent; tests T1–T10 |
| D5–D7 | Wallet core + `WALLET_TOP_UP` | No negative balance; idempotent credit; FE wallet page real API |

**Parallel (second agent):** Admin shell inventory — list what dashboard already exists; draft M3-C MVP cut list.

### Week 2 — Part A remaining categories  
**Goal:** A7 + A9 MVP on staging (browse → book/reserve → pay deposit/fee → ops visibility).

| Day | Focus | Exit gate |
| --- | --- | --- |
| D8–D10 | **A7 Rental MVP** — assets, availability, booking, deposit hold | Customer rent + partner inventory + ops case path |
| D11–D13 | **A9 Stay MVP** — property/units, enquiry or book path per design | Customer stay flow + partner property mgmt |
| D14 | Contract publish + FE client regen + smoke both | OpenAPI + clients in sync |

**Defer inside A7/A9 if needed:** advanced maintenance calendars, ML duplicate detection, multi-vendor complex extensions.

### Week 3 — Loyalty finish + admin MVP + mobile start  
**Goal:** M3-B loyalty closed enough; M3-C MVP; mobile apps bootstrapped.

| Day | Focus | Exit gate |
| --- | --- | --- |
| D15–D16 | V Coins thin + checkout burn | Server-side caps; concurrency tests |
| D16–D17 | Referral thin | Signup `?ref=` + reward on first complete |
| D17–D18 | Vendor sub/premium on **live test** Razorpay (A10 purposes) | Webhook replay safe |
| D18–D19 | Admin MVP: revenue/booking basics + CSV/Excel export | No fake rows; authz on ops |
| D19–D21 | Customer mobile app — auth, catalog, book/list core | Internal build installs |
| D21 | Partner mobile — jobs/listings/home core | Internal build installs |

**DEFER (M3-C):** custom report builder, bulk import, full GST/TDS suite, bank payment export polish — ship stubs or “PHASE 2” labels only if client insists; prefer honest MISSING over fake UI.

### Week 4 — Rapido MVP + harden + go-live readiness  
**Goal:** Rapido in scope as MVP; regression; go-live checklist (still may wait for store approval).

| Day | Focus | Exit gate |
| --- | --- | --- |
| D22–D26 | **Rapido MVP** (see §5) | Customer request → driver accept → trip states → fare → pay on staging |
| D26–D28 | Cross-category regression + payment reconciliation + security pass | Written defect list; P0s fixed |
| D29–D30 | Store submissions / internal tracks; go-live runbook; owner UAT | Single-launch checklist signed |

---

## 6. Rapido — IN SCOPE via MVP (not full PDF Day-1)

### MVP (must ship in 30 days)
- Customer: request ride (bike/auto/cab **one** mode first), track trip, pay, history  
- Driver: online/offline, accept/reject, trip lifecycle, basic earnings  
- Fare engine: server-side estimate + final (paise); no client trust  
- Maps: Google Maps (or chosen provider) pickup/drop + live location polling or websocket  
- KYC: **minimal** driver onboarding (status machine); full KYC vendor can be PARTIAL  
- States: requested → accepted → arrived → started → completed / cancelled  

### Explicitly DEFER inside Rapido (still “Rapido in scope”)
- Goods / instant delivery / roadside / EV / wash / rental-vehicle product lines  
- Daily pass complexity, advanced surge, multi-stop, chat  
- Perfect realtime at Uber scale — prioritize correct state machine + money  

Document deferred Rapido lines as **SCOPE PHASE 4.1** so client PDF is not silently discarded.

---

## 7. M3 PDF mapping

| PDF block | Plan treatment |
| --- | --- |
| **A** three categories | Week 1 Career land + Week 2 A7/A9 |
| **B** payments + wallet + coins + referral + subs | Week 1–3 |
| **C** full admin megaset | **MVP only** Week 3; rest DEFER |
| M4 apps | Week 3–4 |
| M4 Rapido | Week 4 MVP |
| M4 AI | **OUT OF SCOPE** |

---

## 8. Daily cadence

1. Manager `/status` (or lightweight delta)  
2. `/next` → paste Cursor prompt  
3. Agent implements + tests  
4. PR → Manager `/review`  
5. Owner smoke only on money and category exit gates  

**Stop-the-line:** any BLOCK MERGE money/security issue pauses net-new features.

---

## 9. Success metrics (Day 30)

- [ ] Career + Rental + Stay demonstrable on staging  
- [ ] Razorpay + MSG91 used in real staging flows (not only simulation)  
- [ ] Wallet + coins + referral happy paths + concurrency tests for money  
- [ ] Admin MVP exports real data  
- [ ] Customer + Partner apps installable (store or internal)  
- [ ] Rapido MVP trip E2E on staging  
- [ ] No AI chatbot shipped  
- [ ] Written list of DEFERred Rapido/PDF-C items signed by owner  

---

## 10. Immediate next action (today)

1. Decide M3 trunk name (`feature/m3` / `M3-revamp` / keep current branch as trunk). Retarget PR #1 away from “merge to `main` now”.  
2. Pin tip SHA; owner A10 staging + UI pass **on the trunk**.  
3. Start Razorpay staging activation **as a slice PR into the trunk**.  
4. Integrate M3 → `main` only when Part A+B(+C MVP) exit gates pass (M2-style).  

Use `/next` for the Cursor prompt for the next **trunk slice** (not a `main` merge).
