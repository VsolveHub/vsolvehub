# M2 Audit — Missing Edge Cases, Over-Design and Flow Weight

**Date:** 2026-08-10
**Reviewed:** `README.md`, `task.md`, `02-backend-tasks.md`, `03-frontend-tasks.md`,
`04-acceptance-and-cutover.md`, `05-roadmap-and-prompts.md`, against the M1 code in `backend/apps/**`
and `frontend/apps/**`.
**Status:** **Adopted 2026-08-10.** The owner accepted these recommendations and they were folded into
`README.md`, `task.md`, `02-backend-tasks.md`, `03-frontend-tasks.md`, `04-acceptance-and-cutover.md`
and `05-roadmap-and-prompts.md` as revision 2. This document is retained as the reasoning record.
See [Adoption record](#adoption-record) for what landed where and what is still an open decision.

> **Partly superseded, 2026-08-12 and again 2026-08-13.** Revision 3
> ([ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md)) replaces `FLOW-01`'s
> application to **A5** with a visit-first model: a tiered visit plan charged at the first confirmed
> visit slot, on-site estimates, no unlock paywall. Revision 4
> ([ADR-0009](../../docs/adr/0009-m2-rate-card-instant-dispatch-for-a3.md), 2026-08-13) supersedes
> `FLOW-01`'s **A3** half as well: the free→teaser→unlock inversion now governs only the A3
> **thin-supply fallback**, and the primary A3 path is an Operations-published **rate card** with a
> booking fee charged at vendor accept — see ADR-0009 and the revision 4 sections of `README.md`.
> Every other finding in this document stands. Nothing below was edited — this is history; revision 4
> is recorded only in this banner and the dated addenda at the end.

---

## Verdict

The plan is unusually strong on **failure semantics, money integrity and authorization**. Its
weaknesses are in three different places:

1. **Supply-side and real-world edge cases** — the plan protects against *system* failure (webhooks,
   races, retries) far better than against *human* failure (vendor gaming a quote slot, a wedding date
   passing while matching runs, a worker getting injured on a construction site).
2. **Over-design** — roughly 40% of the new data model and two whole Operations surfaces can be
   deleted without weakening a single guarantee in the acceptance matrix.
3. **Flow weight** — the customer pays money before seeing a single price, across ~12 screens and two
   payment events. That is the highest-risk product decision in the document and it is not called out
   as a risk anywhere.

There is also one **commercial hole**: the plan defines a refund trigger ("produces no confirmed
usable quote") with no clock and no definition of "usable". Both are load-bearing and both are
undefined.

---

## Part A — Missing edge cases

Verified absent from all six M2 documents (keyword-checked: no occurrence of insurance, injury,
minimum wage, transcription, SLA/service level, GST, requirement expiry, duplicate requirement).

### A1. Requirement and entitlement

| ID | Gap | Why it bites | Suggested rule |
|---|---|---|---|
| `GAP-001` | **Requirement date passes during matching.** No state for "the event/work date is now in the past." | Wedding on the 20th, second quote lands on the 22nd. Entitlement technically fulfilled, customer got nothing. Fatal for Event & Media. | Requirement carries a hard `service_by` deadline. Matching auto-closes and refunds in full when it is breached, regardless of quote count. |
| `GAP-002` | **No quote-delivery SLA.** `README` refunds when the package "produces no confirmed usable quote" but never says by when. | The refund trigger has no clock, so the request can sit open forever and the customer has no promise to hold you to. | Per-category SLA (e.g. first quote in 24h, full entitlement in 72h). Breach = auto-refund without a support ticket. **Highest-priority missing decision.** |
| `GAP-003` | **"Usable" quote is undefined.** | Three vendors quote ₹4L against a stated ₹1L budget. Entitlement is "fulfilled"; customer feels robbed and charges back. | Define usable: within the requirement's declared budget band, or the customer may reject as non-responsive and the slot is restored (capped at N rejections). |
| `GAP-004` | **Duplicate requirements from the same customer** (same address/date/category). | Charges twice, burns the same small vendor pool twice, and vendors learn to ignore the platform. | Detect on submit; offer merge or block with an explanation. |
| `GAP-005` | **Customer abandons after a vendor invested effort** (site visit done, proposal drafted, then customer goes silent or cancels mid-matching). | Vendor bears the cost. Repeated, this destroys supply — and supply is the scarce side. | Site visits become chargeable (see `SIM-08`); dead requirements get an auto-close reason that does not count against vendor stats. |
| `GAP-006` | **A3-vs-A5 misclassification and reclassification.** The plan insists category never picks the lifecycle, but never says *who* picks it or how to change it. | "4 helpers to renovate my bathroom" is genuinely ambiguous. If it is classified wrong after payment, the wrong vendor pool was invited. | An Operations `reclassify_requirement` command that voids invitations, preserves the entitlement, and restarts matching without a second charge. |
| `GAP-007` | **Voice notes in a language the vendor or Operations does not read.** Plan makes voice a primary input; India makes it multilingual. | Telugu voice note, Hindi-speaking agency. Silent matching failure that looks like vendor apathy. | Transcription/translation step, or route by language on the requirement. |
| `GAP-008` | **Losing vendors keep access to site media forever.** Retention is mentioned generically; nothing revokes a rejected vendor's view of the customer's home photos. | Privacy incident waiting to happen; also a competitive-intel leak. | Attachment access expires with the invitation; only the selected vendor retains access for the engagement's life. |

### A2. Matching, slots and vendor behaviour

| ID | Gap | Why it bites | Suggested rule |
|---|---|---|---|
| `GAP-009` | **Quote-slot squatting.** A "valid submitted proposal" consumes a paid slot. A vendor can submit a deliberately junk-but-valid quote to block a competitor or just to look responsive. | Customer paid for two quotes and got one real one. | Pairs with `GAP-003`: customer-initiated non-responsive rejection restores the slot; repeated offenders lose matching priority. |
| `GAP-010` | **Bid rigging in a small pool.** With 3–5 eligible vendors in one city who know each other, coordinated pricing is trivial. | The core promise ("compare real quotes") quietly stops being true. | Reference price band per variant; flag quotes clustered abnormally tightly or abnormally high for review. Not automatic punishment — a review signal, consistent with the plan's own stance. |
| `GAP-011` | **Same owner, two Partner accounts.** `M2-BE-314` blocks one *Partner* holding both slots, not one *person* holding two Partner accounts. | Both "competing" quotes come from the same business. | Identity clustering on phone / PAN / bank account / device; treat a cluster as one Partner for slot purposes. |
| `GAP-012` | **Vendor capacity is only checked at reconfirmation, not at invitation.** | An event agency accepts 6 enquiries for the same Saturday, wins 4, staffs 1. Mass failure on a peak weekend. | Soft capacity hold at invitation-accept; hard hold at selection. Calendar-aware eligibility, not just service-area eligibility. |
| `GAP-013` | **Vendor responsiveness never gates invitations.** Ranking uses distance and least-recent assignment; a vendor who has not opened the app in 3 weeks still gets invited. | Every wave sent to dead accounts burns the SLA clock in `GAP-002`. | Freshness/response-rate factor in eligibility, not just ranking. |
| `GAP-014` | **Deadlines expire at 2am and over festivals.** | Vendor loses a slot to a clock that ran while nobody was awake. Diwali/Sankranti will produce a wave of these. | Business-hours-aware deadline arithmetic and a holiday calendar. |
| `GAP-015` | **Requirement version change mid-invitation.** Plan says proposals become `REVISION_REQUIRED`; it does not say what happens to the vendor's deadline, the entitlement clock, or whether the vendor may exit penalty-free. | Vendor did a site visit against v1 and is now bound to v2. | Version change resets vendor deadlines, pauses the SLA clock, and permits penalty-free withdrawal. |

### A3. Selection, tax and agreement

| ID | Gap | Why it bites | Suggested rule |
|---|---|---|---|
| `GAP-016` | **Commission visibility is undefined.** In `MANAGED_PAYMENT_REQUIRED`, nothing states whether the vendor's quoted price includes platform commission or whether it is added on top for the customer. | Decides whether vendors inflate quotes, and whether the comparison view is honest. **This is a missing decision, not a missing feature.** | Decide and make it a displayed, immutable field on every proposal. |
| `GAP-017` | **Mixed GST bases across competing quotes.** A GST-registered vendor quotes +18%; an unregistered one does not. | The comparison view "normalizes equivalent fields" — normalizing a tax-inclusive against a tax-exclusive total is a real trap. | Force one quoting basis per requirement and show the GST status badge per vendor. |
| `GAP-018` | **Principal vs agent for invoicing.** Who invoices the customer in `LEAD_ONLY` versus `MANAGED`? | Straight tax exposure. `M2-BE-005` gestures at it; it needs a resolved answer before any managed money moves. | Legal decision required in P0. |
| `GAP-019` | **Quote validity expires between submission and selection.** `EXPIRED` exists; a re-validation path does not. | Customer selects on day 8 of a 7-day validity and hits a dead end back to a new ₹149. | One-tap "ask vendor to re-validate this price" that reuses the existing entitlement. |
| `GAP-020` | **Capability suspended immediately after the customer pays.** `M2-BE-411` covers vendor *expiry* at payment time, not Operations *suspension* one minute after payment. | Money is in and the work is now unauthorized. | Suspension must check for funded, unstarted agreements and route them to replacement-or-refund. |
| `GAP-021` | **"Multiple lots" is a half-idea.** `M2-BE-404` allows multiple selections "if the requirement explicitly permits multiple lots" — no lot concept is defined anywhere else. | An undefined branch in the most safety-critical command in the system. | Either design lots properly or delete the clause. Recommend delete for launch. |

### A4. Workforce (A3)

| ID | Gap | Why it bites | Suggested rule |
|---|---|---|---|
| `GAP-022` | **Worker injury / site liability is entirely absent.** No incident model, no insurance field, no workmen's-compensation position. | Construction labour supply in India. This is the single largest *legal* exposure in M2 and it is not mentioned once. | Incident report flow, insurance declaration at capability approval, and a stated liability position in the vendor terms. Blocking for construction labour launch. |
| `GAP-023` | **No minimum-wage floor on A3 proposals.** | Platform-brokered labour below the state minimum wage is a statutory violation with the platform's name on it. | Per-state, per-skill floor rate validated server-side on proposal submission. |
| `GAP-024` | **Mid-shift and day-to-day crew rotation is not modelled.** Plan covers pre-start substitution only; `CrewAssignment` appears to be per-agreement. | Multi-day labour genuinely has different faces each day. The model will fight reality on day two. | Assignment is per shift-day, not per agreement. |
| `GAP-025` | **Missing check-out.** Attendance = check-in + check-out; nothing defines what is owed when the crew never checks out. | Every field system produces these constantly. | Default policy: missing check-out settles at the agreed shift length, flagged; disputed only if the customer disputes. |
| `GAP-026` | **Unapproved overtime already worked.** Rule says no chargeable time without approved revision — so who absorbs work already done at 9pm? | Guaranteed vendor grievance in month one. | Retroactive customer confirmation window; if unconfirmed, unpaid and stated plainly in the vendor terms up front. |
| `GAP-027` | **Crew identity is unique per Partner, not globally.** | The same physical person on two agencies' rosters, double-booked on the same day. | Global crew identity key with per-Partner membership. |

### A5. Projects (A5)

| ID | Gap | Why it bites | Suggested rule |
|---|---|---|---|
| `GAP-028` | **Material advances are modelled as work milestones.** | Material money is *spent*, not *earned*. If the project dies after a material advance, the milestone refund maths is wrong in both directions. | A distinct money purpose for material advance, with its own recovery rule. |
| `GAP-029` | **No replacement vendor for a half-built project.** `M2-AC-508` says abandoned money enters "recovery"; the actual need is finishing the building. | The customer's problem is an unfinished bathroom, not a ledger entry. | "Transfer remaining milestones to a new vendor at their price" flow, with the delta funded or refunded. |
| `GAP-030` | **Customer-caused delay.** Site not vacated, no power, no access. | Vendor is penalised on schedule for the customer's failure. | Vendor-raised delay claim with evidence and a schedule-extension request. |
| `GAP-031` | **Unfunded warranty.** Warranty appears in proposals; nothing holds money behind it. Vendor is fully paid out before the warranty claim arrives. | The warranty promise is unenforceable the moment payout completes. | Retention hold-back (e.g. 5%) released at warranty-window close, or drop warranty claims from the UI language. |
| `GAP-032` | **Digital deliverables are not modelled.** For Event & Media the deliverable *is* the files — photos, edits, album. | "Milestone evidence" becomes photos of photos; the actual handover happens over WeTransfer, off-platform. | A deliverable-handover step with file delivery and customer acceptance. |

### A6. Money and platform

| ID | Gap | Why it bites | Suggested rule |
|---|---|---|---|
| `GAP-033` | **₹99/₹149 unit economics are never tested against cost to serve.** In `LEAD_ONLY`, this fee is the platform's *entire* M2 revenue. | One 15-minute Operations touch plus a 30% refund rate makes every request loss-making. P6's Operations-heavy recovery design assumes a margin that ₹99 does not provide. | Model it before P0 closes. If it does not clear, the fee model — not the code — is what needs changing. |
| `GAP-034` | **GST treatment of the ₹99/₹149 itself.** Flagged in `M2-BE-003` as "tax treatment" but never resolved; the README prices imply inclusive. | Small number, real compliance. | Decide and display. |
| `GAP-035` | **Chargeback on the matching fee.** Covered for service payments and post-payout; not for the ₹99 itself. | Small amounts, high volume, and a gateway-relationship risk if the rate climbs. | Explicit handling and a rate alert. |
| `GAP-036` | **Rollback with in-flight M2 records.** Cutover tests that M1 is unaffected when M2 flags are off — not what happens to a customer mid-requirement when the flag flips. | Someone paid ₹149 and the feature vanished. | Flags gate *new* purchases only; in-flight records always remain reachable and refundable. |

---

## Part B — Over-design: what to cut

Each item states what it deletes. None of them weakens a guarantee in
`04-acceptance-and-cutover.md`.

### `SIM-01` — One engagement spine, not two parallel fulfilment families

The plan builds `WorkforceAgreement`/`CrewAssignment`/`Attendance`/`TimeExtension` alongside
`ProjectAgreement`/`Milestone`/`ChangeOrder`. These are the same shape: an agreement with ordered
stages, each stage having evidence, an approval and a money release.

Build one `Engagement` + `EngagementStage`, where a stage is a shift-day (A3) or a milestone (A5).
`TimeExtension` and `ChangeOrder` are both scope amendments — and M1 **already has an amendment
engine** at `backend/apps/fulfilment/amendments.py`.

**Deletes:** ~6 model families, one full set of Operations screens, and the duplicated
approve/dispute/release logic in BE5A and BE5B.

### `SIM-02` — Supervisor-level attendance, not per-worker

`M2-BE-504/505/511` and most of FE5A build per-worker check-in/out with offline retry, consent,
per-worker discrepancy reporting and duplicate-attendance protection. Field reality: the workers do
not have the app; the supervisor does.

Replace with: supervisor marks "4 of 4 present today", customer confirms or disputes in one tap,
dispute opens a case. Per-worker granularity is captured **only when disputed**. Named crew stays —
for identity display and verification, not for daily roll-call.

**Deletes:** per-worker offline sync, duplicate-attendance races, and most of `FE5A`. Money stays
correct because settlement is per shift-day either way.

### `SIM-03` — One commercial mode per archetype, not a per-variant matrix

Running `LEAD_ONLY` and `MANAGED_PAYMENT_REQUIRED` as a per-variant toggle doubles everything
downstream: two agreement types, two cancellation policies, two refund matrices, two disclosure
policies, two Operations runbooks. Sections D and G of the acceptance matrix are visibly bloated by it.

Recommend: **A3 workforce = `LEAD_ONLY`. A5 projects = `MANAGED_PAYMENT_REQUIRED`.** One mode per
archetype, chosen because each matches its market — day-labour is a cash-per-day business where
escrow is unwinnable, and project work is exactly where escrow is the product.

**Deletes:** the mode-selection matrix, mode-switching UI, and roughly half of P4 and P6's branching.

### `SIM-04` — One quote package, not two tiers

The ₹99/₹149 split creates: two entitlement shapes, a partial-fulfilment refund tier (₹50), two
supply-preflight thresholds (3 vendors vs 5), the "one Partner cannot hold both slots" rule, and
comparison UI as a hard launch gate.

Replace with one price and a stronger promise: **"₹149 — up to 3 quotes. No quotes, full refund."**

**Deletes:** the ₹50 partial-refund decision entirely, one preflight threshold, and the partial-
entitlement state family. Also a better marketing line. This is the highest-leverage cut in the
document.

### `SIM-05` — Snapshot at invitation, not full requirement versioning

`RequirementVersion` + `RequirementAnswer` + `RequirementMedia` exists to answer one question: *what
did this vendor see when they quoted?* Answer it directly — write an immutable `RequirementSnapshot`
at invitation time. Before any vendor accepts, the customer edits freely with no version at all.

**Deletes:** two tables and the `REVISION_REQUIRED` cascade, with the same audit guarantee.

### `SIM-06` — Append-only proposals, five states not seven

`PROPOSAL_DRAFT → SUBMITTED → CUSTOMER_REQUESTED_REVISION → REVISION_IN_PROGRESS →
REVISED_PROPOSAL_SUBMITTED` — the middle three are UI states, not domain states. A revision is simply
a new proposal row that supersedes its predecessor.

Domain states collapse to: `SUBMITTED`, `SUPERSEDED`, `WITHDRAWN`, `EXPIRED`, `SELECTED`, `REJECTED`.

### `SIM-07` — Structured clarification, not a chat subsystem

`M2-BE-307/310` and `M2-FE-305` build participants, moderation metadata, rate limits, retention,
attachment safety and contact-sharing detection — a messaging product — to solve "the vendor needs to
ask a question".

Replace with: vendor posts a **question**, customer answers, both land on the timeline. No threads,
no read receipts, no moderation queue. Contact-sharing detection becomes trivial because the surface
is two text fields. Add real chat later if the question flow measurably fails.

**Deletes:** the largest single item in BE3.

### `SIM-08` — Site visits are a paid service, not a free step

A free site visit will be refused by vendors (unpaid travel) and abused by customers (free
consulting). Make it a small paid visit that adjusts against the final price — which is exactly what
`A2_INSPECTION_FIRST` already is. It also fixes `GAP-005`.

### `SIM-09` — Trim the workspace registry ceremony

The capability→workspace design is **correct and should stay** — it is the best-designed part of the
plan. But "document the mapping for all eight named archetypes" (`M2-FE-112`) is paperwork for six
workspaces that do not exist. Backend returns `{workspace_key, actions[]}`; the frontend renders keys
it knows and ignores the rest. That is fail-closed in ~30 lines, and no per-archetype documentation
task is needed.

### `SIM-10` — Assisted quote capture is the primary A3 path, not a recovery tool

`M2-FE-705` treats Operations-drafted, vendor-confirmed quotes as an Operations fallback. For a
construction labour contractor filling in line items, taxes, exclusions, validity and warranty on a
5-inch phone, it is the **main** path. Design it first-class with a call script — and note that this
directly worsens `GAP-033`, which is why `SIM-11` matters.

### `SIM-11` — Two composers, not one

For A3 the proposal is three fields: **rate per worker per day, minimum days, what is included.** The
full composer (taxes, exclusions, assumptions, validity, warranty, milestones) belongs to A5 only.

---

## Part C — Is the customer flow heavy? Yes.

### Current path to one confirmed booking

```text
category -> guided questions (N) -> location -> dates/flexibility -> headcount or outcome
  -> media/voice -> callback/site-visit -> summary -> confirm immutable version
  -> choose package -> PAY (#1) -> wait for matching -> read quotes -> compare
  -> select -> wait for vendor reconfirm -> PAY (#2) -> agreement
```

~12 screens, **two payments, two open-ended waits, and the first payment happens before the customer
has seen a single price.** M1's booking flow reaches a confirmed job in about 5 steps. For a new brand
in India, paying ₹149 to an unknown platform before seeing any price is the hardest ask in the
product, and no document flags it as a risk.

### `FLOW-01` — Invert the fee: free to request, pay to unlock (top recommendation)

```text
requirement (free) -> matching runs -> customer sees quote TEASERS
  (verified badge, rating, headline price band, vendor type)
  -> pay ₹149 to unlock full quotes + selection -> select -> reconfirm -> agreement
```

The customer now pays **against something visible**. Consequences, all good:

- Supply preflight becomes unnecessary — you cannot sell what does not exist yet.
- The "no quotes → refund" branch disappears; so does most of the README refund table.
- The entitlement-restore machinery (`GAP-009`, `M2-BE-306`, `M2-BE-403`) largely disappears.
- Conversion should rise sharply, because price risk moves off the customer.

The honest counter-argument: vendors quote without a guaranteed paying customer. Mitigate by showing
vendors the customer's intent signals, and by keeping the unlock cheap enough to be a reflex. On
balance this deletes more risk than it adds, and it is more honest to the customer.

### `FLOW-02` — Four screens, not twelve

`What` (service + scale) → `Where + When` → `Details + media` → `Review`. Everything else becomes
optional and reachable **from** the review screen rather than blocking the path to it.

### `FLOW-03` — Delete the separate "confirm immutable version" step

The review screen *is* the confirmation. A second confirm teaches customers to click through
confirmations.

### `FLOW-04` — Make voice the fast path, not the fallback

"Record 30 seconds instead of answering questions", with structured fields as the alternative. This
matches the plan's own stated intent ("free text is optional; the primary inputs are choices,
counters, media and voice") and the actual typing reality of the market. Requires `GAP-007`.

### `FLOW-05` — One payment before work starts

Selection → reconfirm → pay should be one continuous flow, not two separated by a wait. Combined with
`SIM-03` (A3 is lead-only), most customers then encounter exactly **one** platform payment ever.

---

## Part D — Is the partner flow heavy? Also yes.

### `FLOW-06` — Progressive KYC gated on money, not on browsing

Registration currently runs: identity → business profile → bank → tax → documents → services → areas
→ capability info → crew roster → review. That is a ~20-minute form standing between a contractor and
his first look at a single lead. Vendors will abandon.

Instead: **phone + name + service + city → immediately see masked live requirement summaries.**
Complete KYC only when accepting a first enquiry; complete bank/payout details only before a first
payout. Supply is the scarce side of this marketplace — the funnel should be shaped accordingly.

### `FLOW-07` — Crew roster at first assignment, not at registration

`M2-FE-104` demands a full crew roster during registration. Require it before the first crew
assignment instead. An agency does not know which four people they will send three weeks from now.

### `FLOW-08` — Single-screen A3 enquiry response

See `SIM-11`. An A3 vendor's entire response should fit on one phone screen: rate, days, inclusions,
accept/decline.

---

## Part E — Cross-document contradictions and plan-process gaps

| ID | Finding |
|---|---|
| `PLN-01` | **Wallet contradiction.** `milestones.md` M3 promises "Wallet, V Coins, Referral System". `M2/README.md` states Vsolve "does not create an unregulated internal wallet". Both cannot be true. Resolve before either milestone builds money movement. |
| `PLN-02` | **"M2" means two different things.** This folder's README acknowledges the collision with `09-delivery-roadmap.md` (where M2 = `A2_INSPECTION_FIRST`) but does not resolve it. Rename this folder to `Commercial-M2-Workforce-Projects/` so no agent or human resolves "M2" wrongly. |
| `PLN-03` | **P0 is the real critical path and nothing in it is owned or dated.** ~15 product/legal/commercial decisions gate every later phase. `milestones.md` already shows M2 "In Progress", which cannot be true while P0 is empty. |
| `PLN-04` | **Scope versus commercial reality.** ~200 tracked tasks, each requiring tests plus concurrency plus accessibility evidence, for a ₹75,000 milestone running in parallel with M1. As written this is several months of two-agent work. Either the simplifications in Part B are adopted or the milestone boundary moves. Worth saying plainly to the client rather than discovering it in month two. |
| `PLN-05` | **Stop conditions exist; success conditions do not.** `04` defines when to halt rollout but never what "M2 works" means numerically — quote fill rate, time to first quote, refund rate, vendor response rate. Define the target alongside the alarm. |
| `PLN-06` | **No notification escalation ladder.** Every deadline, wave and expiry in M2 assumes vendors see notifications. There is no WhatsApp/SMS/IVR ladder and no in-app-freshness rule (`GAP-013`). The entire clock rests on an undefined dependency. |
| `PLN-07` | **Operations volume is unmodelled.** P6 assumes human recovery on every stuck request; `GAP-033` says the fee cannot fund it. Estimate touches-per-request before designing the Operations workspace, not after. |
| `PLN-08` | **The contract excludes what the plan is built on.** `milestones.md` M2 states plainly: *"NOT in this milestone: Payments, OTP, AI, live deployment, mobile apps"* — yet the entire M2 plan rests on paid quote packages, payment webhooks, refunds, milestone escrow and crew check-in OTP. Found after the first audit pass. Revision 2 resolves it by **building** money and arrival flows against provider test callbacks and the non-OTP fallback in M2, and **activating** them with live providers in M3. No M2 exit gate may depend on a live provider. The underlying question — how much of this scope is contractually M2 versus M3 — is still an owner decision. |

---

## Part F — Decisions needed, ranked

Blocking, in order:

1. **Fee model** — inverted unlock (`FLOW-01`) or pay-upfront? Everything in P2 and most of P6 depends on this.
2. **Quote-delivery SLA** (`GAP-002`) and the definition of a **usable quote** (`GAP-003`).
3. **One commercial mode per archetype** (`SIM-03`) or the per-variant matrix?
4. **One package or two tiers** (`SIM-04`).
5. **Commission visibility** (`GAP-016`) and **GST/invoicing basis** (`GAP-017`, `GAP-018`).
6. **Worker liability and insurance position** (`GAP-022`) — blocking for construction labour specifically.
7. **Minimum-wage floor** (`GAP-023`).
8. **Wallet contradiction** (`PLN-01`).
9. **Milestone scope versus commercial boundary** (`PLN-04`).

Non-blocking but decide before the relevant phase: `GAP-001`, `GAP-005`, `GAP-006`, `GAP-012`,
`GAP-029`, `GAP-031`, `GAP-032`.

---

## Adoption record

Adopted 2026-08-10. Every finding above is now carried by a task, a gate or an acceptance scenario in
the revision 2 documents.

### Structural changes that landed

| Change | Where it now lives |
|---|---|
| Free requirement; INR 149 unlock only after a usable quote exists (`FLOW-01`, `SIM-04`) | `README.md` matching section; `M2-BE-201`, `M2-BE-402`, `M2-FE-401`, `M2-FE-402`; `M2-AC-301` to `M2-AC-303` |
| Fixed mode per archetype - A3 lead-only, A5 managed (`SIM-03`) | `README.md` service classification; `M2-BE-003`; `M2-FE-005`; `M2-AC-316`, `M2-AC-317` |
| One `Engagement` + `EngagementStage` spine; amendments reuse the M1 engine (`SIM-01`) | New phase P5; `M2-BE-501` to `M2-BE-509`; `M2-AC-401` to `M2-AC-404` |
| Supervisor-level attendance (`SIM-02`) | `M2-BE-525`, `M2-BE-526`; `M2-FE-505`, `M2-FE-510`; `M2-AC-505`, `M2-AC-506` |
| Snapshot at invitation instead of requirement versioning (`SIM-05`) | `M2-BE-305`; `M2-AC-205` |
| Append-only proposals, six states (`SIM-06`) | `M2-BE-315`; `M2-FE-313` |
| Structured clarification instead of chat (`SIM-07`) | `M2-BE-311`; `M2-FE-305`; `M2-AC-208` |
| Paid site visits (`SIM-08`) | `M2-BE-313`; `M2-FE-306`; `M2-AC-209`, `M2-AC-210` |
| Trimmed workspace registry (`SIM-09`) | `M2-BE-114`; `M2-FE-007`; `M2-AC-012` |
| Assisted A3 quote capture as a primary path (`SIM-10`) | `M2-BE-322`; `M2-FE-705`; `M2-AC-218` |
| Two composers (`SIM-11`, `FLOW-08`) | `M2-BE-316`; `M2-FE-308`, `M2-FE-309` |
| Four-screen requirement, one confirmation, voice fast path (`FLOW-02` to `FLOW-04`) | Flow-weight budget in `03-frontend-tasks.md`; `M2-FE-202` to `M2-FE-207`; `M2-AC-902` |
| One payment before work for A3, two for A5 (`FLOW-05`) | Flow-weight budget; `M2-AC-320` |
| Progressive KYC and late crew roster (`FLOW-06`, `FLOW-07`) | `M2-BE-109`; `M2-FE-101`, `M2-FE-102`, `M2-FE-107`; `M2-AC-002`, `M2-AC-003` |

### Revision 4 addendum — 2026-08-13, ADR-0009

Recorded here without editing the rows above, which stay true as the history of revision 2. The
owner's rate-card decision changes their standing as follows:

| Adopted finding above | Standing after revision 4 (2026-08-13) |
|---|---|
| Free requirement; INR 149 unlock after a usable quote (`FLOW-01`, `SIM-04`) | The A3 half is demoted to the **thin-supply fallback**. The primary A3 path is a published rate card with a **booking fee charged at vendor accept**; the built unlock surface (backend Wave C2 at contract 1.24.0, Customer Wave A2) stays built as that fallback and nothing is deleted. Whether the fallback keeps charging the unlock is new owner decision 14. |
| Fixed mode per archetype (`SIM-03`) | Reaffirmed: A3 remains `LEAD_ONLY`; the booking fee replaces the unlock as the only platform money on the primary path, and wages are direct, daily, P2P — never held. |
| Assisted A3 quote capture as a primary path (`SIM-10`) | Primary on the fallback only. On the rate-card path nothing is composed — accepting the published rate is the whole vendor response. |
| Two composers; single-screen A3 response (`SIM-11`, `FLOW-08`) | The fallback composer stays one screen; the primary A3 response is a one-screen crew offer showing the lead's own number. |
| One payment before work for A3 (`FLOW-05`) | Still exactly one platform payment — now the booking fee at vendor accept instead of the unlock. |
| `GAP-033` A3 unit economics | The rate-card model is revision 4's answer to `GAP-033`'s A3 question, restated against the **booking fee's platform share** (README decision 10). |
| New owner decisions | 12 (booking-fee value, forfeit split percentages, free-cancel window T), 13 (seed rate-card values, decline-alarm threshold, review calendar owner) and 14 (the fallback unlock question) join the README blocking list. |

### Edge cases now carried by tasks

All 36 `GAP` findings are referenced inline by the task that closes them. Spot checks: `GAP-022`
(safety incidents) at `M2-BE-104`/`M2-BE-530`/`M2-FE-508`/`M2-AC-512`; `GAP-023` (minimum wage) at
`M2-BE-108`/`M2-BE-317`/`M2-AC-214`; `GAP-002` (SLA) at `M2-BE-212`/`M2-AC-110`; `GAP-029` (abandoned
project) at `M2-BE-545`/`M2-FE-612`/`M2-AC-609`.

### Still open - owner decisions, not engineering

These could not be resolved by a plan rewrite and remain in the blocking list in `README.md`:

- Commission visibility on A5 proposals (`GAP-016`).
- GST, invoicing and principal-versus-agent treatment per mode (`GAP-017`, `GAP-018`, `GAP-034`) —
  since 2026-08-13 (revision 4) also covering the A3 booking fee and its forfeit travel
  compensation (README decision 5).
- Worker insurance and injury liability position (`GAP-022`) - blocking for Construction Labour.
- Minimum-wage floor source per state and skill (`GAP-023`).
- Unit economics: Operations touches per request (`GAP-033`, `PLN-07`) — originally against
  INR 149; since revision 4 (2026-08-13) restated against the A3 booking fee's platform share
  (README decision 10), the rate-card model being revision 4's answer to `GAP-033`'s A3 question.
- Added 2026-08-13 (revision 4): the A3 booking-fee value, forfeit split percentages and
  free-cancel window T (README decision 12); the seed rate-card values per launch city+skill, the
  decline-alarm threshold and the review calendar owner (README decision 13); and whether the A3
  fallback keeps charging the INR 149 unlock or delivers its quotes readable free (README
  decision 14).
- The wallet contradiction with `milestones.md` M3 (`PLN-01`).
- The M2/M3 milestone boundary given that `milestones.md` excludes payments and OTP (`PLN-08`,
  `PLN-04`).
- Whether to rename this folder to end the "M2" name collision (`PLN-02`). Not done: the folder path is
  referenced externally, so renaming is an owner call.
