# Customer-booked visits and Partner estimates

Implementation tracker for the Customer and Partner flow redesign.

## Ownership

- **Codex:** `backend/**`, `contracts/openapi/**`, backend tests and contract publication.
- **Antigravity:** `frontend/**`, frontend tests and UI integration.
- **Claude:** not involved in this work.
- Do not hand-edit generated API clients or the generated OpenAPI document.
- Codex publishes the backend contract first; Antigravity consumes the generated client.

## Product decisions — fixed

- [x] The Customer chooses the visit time. A Partner never proposes a time during matching.
- [x] A Partner receives a fixed-time offer and can only accept or decline it.
- [x] The first eligible Partner to accept wins that visit slot.
- [x] If matching exhausts without an acceptance, show **No professional is available for this slot** and charge nothing.
- [x] Keep the existing 1, 2 or 3 estimate plan. The Customer chooses one visit slot per requested estimate.
- [x] Remove the entire “Show us the space” step from requirement capture.
- [x] Remove requirement photos, files, voice notes, language, additional instructions, callback preferences and access restrictions from this flow.
- [x] Keep the address landmark field. It is part of the site address, not a separate requirement-details step.
- [x] Do not remove stage-completion evidence uploads. Those are proof of completed work after a project starts and are unrelated to requirement capture.
- [x] A Partner chooses exactly one estimate type: **Item-wise** or **Labour-wise**.
- [x] A Partner defines the payment installments inside the estimate.
- [x] Installments reuse the existing ordered project-stage funding system. Do not create a second payment or wallet system.
- [x] Use the existing frontend colors, semantic tokens, typography, components and Lucide icon language. Do not introduce a new visual theme or hardcoded colors.
- [x] Global Partner navigation appears only on top-level destinations. Focused task screens use a back button and page title without the persistent top/bottom navbar.

## Final flow

```text
Customer creates a 3-step brief
  -> chooses 1/2/3 estimates
  -> chooses one visit slot for each estimate
  -> platform dispatches fixed-time offers to eligible available Partners
  -> first acceptance per slot holds that slot
  -> Customer pays the visit plan
  -> accepted slots become booked and exact addresses are released
  -> Partner attends using the arrival-code flow
  -> Partner completes the visit
  -> Partner sends an Item-wise OR Labour-wise estimate with installments
  -> Customer reads, compares and selects an estimate
  -> Customer funds the Partner-defined installments one at a time
```

## Customer brief after removing friction

```text
Step 1 of 3  What needs doing?
Step 2 of 3  Where and when?
Step 3 of 3  Review, choose estimate count and choose visit slot(s)
```

The request must remain useful without media or free-text detail. Category questions should collect only facts needed for matching or estimating. Do not add replacement fields merely to fill the removed screen.

---

# Codex — backend and contract

## BE-1 — Remove requirement-capture friction

**Objective:** Make the three-step brief the only Customer requirement path.

- [ ] Stop requiring or processing requirement-level photos, files, voice notes, language, additional instructions, callback preferences and access restrictions for new requests.
- [ ] Remove these values from matching decisions and Partner enquiry projections.
- [ ] Keep old stored values readable only where needed for historical/audit compatibility; do not destructively erase existing customer data in this change.
- [ ] Retire requirement-upload endpoints only after confirming they are not shared with stage evidence, disputes or Operations evidence.
- [ ] Keep stage-evidence uploads and their malware/checksum/access controls unchanged.
- [ ] Make old-client fields optional during rollout so a deployed client does not break while Antigravity moves to the new contract.
- [ ] Add regression tests proving a requirement can be created, updated, reviewed and submitted with only service facts, site and dates.

**Done when:** a new project request has no media/details dependency and still produces a complete matchable snapshot.

## BE-2 — Customer-owned visit slots

**Objective:** Move initial visit-time selection from the Partner to the Customer.

- [ ] Publish candidate visit windows for the Customer using the existing availability engine, service-area rules, duration and turnaround buffer.
- [ ] Accept signed slot tokens only; never accept a free-form date/time.
- [ ] Require exactly the number of requested slots represented by the selected 1/2/3 estimate plan.
- [ ] Reject duplicate or overlapping slots unless the product explicitly supports simultaneous visits.
- [ ] Store each requested slot independently so partial matching is visible and recoverable.
- [ ] Allow the Customer to replace an unmatched requested slot without changing already held or booked visits.
- [ ] Remove the Partner candidate-slot picker contract after Antigravity no longer consumes it.
- [ ] Preserve the existing reschedule flow for already booked visits.

**Server-owned slot states:**

```text
SEARCHING -> HELD -> BOOKED -> VISITED -> ESTIMATE_RECEIVED
     |         |        |
     |         |        +-> CANCELLED / NO_SHOW / RECOVERY
     |         +-> hold expires -> SEARCHING
     +-> matching exhausted -> NO_PROFESSIONAL_FOUND
```

**Done when:** the Customer chooses the time and no Partner endpoint can replace it during initial acceptance.

## BE-3 — Fixed-time Partner dispatch

**Objective:** Notify only Partners who can attend the Customer’s selected slot.

- [ ] Match by approved capability, service area, operational standing and availability for the entire visit plus turnaround.
- [ ] Exclude Partners already holding another estimate slot for the same requirement.
- [ ] Create a fixed-time offer containing service, approximate area, visit start/end, duration, visit earning and response deadline.
- [ ] Notify matching available Partners through the existing notification/outbox infrastructure.
- [ ] Make acceptance atomic: first valid acceptance wins; later accepts receive an explicit `slot_taken` conflict.
- [ ] Decline or expiry must release only that Partner offer and continue matching while candidates remain.
- [ ] When every eligible candidate is exhausted, write `NO_PROFESSIONAL_FOUND`; do not leave the Customer polling forever.
- [ ] Do not expose the exact Customer address before payment confirms the visit.
- [ ] Add concurrency, expiry, no-capacity, partial-plan and idempotency regression tests.

**Done when:** every offer is for one immutable Customer-selected time and the exhausted state is explicit.

## BE-4 — Visit-plan payment and recovery

**Objective:** Keep payment behind real supply.

- [ ] First Partner acceptance opens the existing visit-plan checkout and creates a temporary hold.
- [ ] A Customer with zero accepted slots cannot be charged.
- [ ] Provider-verified payment turns all currently held slots into booked visits.
- [ ] Later accepted slots on an already-paid plan become booked without another plan charge.
- [ ] Expired unpaid holds return to matching without penalising the Partner.
- [ ] Preserve per-slot automatic refund/replacement behavior for visits that never happen or never produce a usable estimate.
- [ ] Keep all amounts in integer paise and all payment state changes idempotent and auditable.
- [ ] Add tests for callback replay, hold expiry, partial fulfilment, refund shares and payment/matching races.

**Done when:** no Customer pays before at least one Partner commits and no held Partner is stranded by payment state.

## BE-5 — Two estimate types

**Objective:** Give every submitted estimate one unambiguous pricing method.

- [ ] Add a published estimate type enum: `ITEM_WISE` or `LABOUR_WISE`.
- [ ] Add item-wise lines with category, title, unit, quantity, rate and server-calculated amount.
- [ ] Add labour-wise lines with role/team, member count, day count, rate per day and server-calculated amount.
- [ ] Enforce exactly one line family per estimate. Do not support `item subtotal + labour subtotal` in this version.
- [ ] Keep materials/consumables as separately identified material-advance lines where applicable.
- [ ] Keep other charges as explicit named lines; no hidden transport, packing or miscellaneous fallback.
- [ ] Server calculates subtotal, tax, permitted markup, platform fee treatment, Customer grand total and Partner receivable.
- [ ] The platform fee is policy-owned and cannot be edited by the Partner.
- [ ] Preserve inclusions, exclusions, warranty, validity, start date, stages, revisions, supersession, withdrawal and visit-completion guard.
- [ ] Preserve append-only estimate history.
- [ ] Add shape, arithmetic, authorization, idempotency and revision regression tests.

**Done when:** the API can represent the seven reference categories without category-specific proposal tables or mixed estimate modes.

## BE-6 — Partner-defined installments using stages

**Objective:** Let the Partner propose a simple payment schedule without creating a new payment rail.

- [ ] Treat proposal stages as the installment schedule presented to the Customer.
- [ ] Each installment contains: title, deliverable/payment purpose, fixed amount in paise, position and optional expected completion date.
- [ ] Require at least one installment for a managed project estimate.
- [ ] Require installment amounts plus material advances to reconcile exactly with the agreed payable project amount.
- [ ] Accept fixed rupee amounts as authoritative. Percentages may be displayed by the frontend but are not stored as the source of truth.
- [ ] Customer funds installments one at a time and in order through the existing stage-funding checkout.
- [ ] Work on an installment cannot begin until its verified payment is funded.
- [ ] Once the estimate is selected, the Partner cannot silently change installment amount/order; changes use the existing Customer-approved amendment flow.
- [ ] Preserve stage evidence, Customer approval/correction/dispute, payout hold, refund, retention and warranty behavior.
- [ ] Add tests proving installment totals reconcile and later installments cannot be funded early.

**Done when:** the Partner controls a clear payment schedule and the Customer never has to fund the whole project upfront.

## BE-7 — Publish the contract for Antigravity

**Objective:** Give the frontend one stable generated contract.

- [ ] Publish Customer slot-window, requested-slot, matching-status and replacement-slot operations.
- [ ] Publish fixed-time Partner offer and accept/decline operations.
- [ ] Publish estimate type, item lines, labour lines, material lines and installment/stage fields.
- [ ] Publish explicit errors for `slot_taken`, `slot_expired`, `no_professional_found`, invalid estimate shape and installment mismatch.
- [ ] Regenerate and validate `contracts/openapi/v1.yaml`; do not hand-edit it.
- [ ] Record breaking/removal notes in `contracts/openapi/CHANGELOG.md`.
- [ ] Tell Antigravity the contract version and changed operations before frontend integration starts.

**Static verification Codex may run:**

```powershell
cd backend
.\scripts\quality-static.cmd
```

**Owner-run backend tests:**

```powershell
cd backend
.\scripts\quality.cmd
```

---

# Antigravity — frontend

## FE-1 — Convert the Customer brief to three steps

**Objective:** Remove the unnecessary screen and shorten the request flow.

- [ ] Delete the “Show us the space” step from the project-request state machine and progress meter.
- [ ] Remove requirement photo/file upload, voice recorder, language, additional instructions, callback/access controls and review summaries from this flow.
- [ ] Do not remove shared stage-evidence UI used after a project starts.
- [ ] Renumber the remaining flow to 1 of 3, 2 of 3 and 3 of 3.
- [ ] Keep draft resume, back navigation, validation and edit-from-review behavior for the remaining fields.
- [ ] Do not add replacement text areas or optional drawers.

**Done when:** a Customer reaches Review after service facts and site/date selection with no media step or empty placeholder.

## FE-2 — Customer slot selection and matching

**Depends on:** BE-2, BE-3 and BE-7.

**Objective:** Make the Customer visibly own every visit time.

- [ ] On Review, keep the 1/2/3 estimate selector and render one slot picker per requested estimate.
- [ ] Reuse the existing available-window components and signed tokens.
- [ ] Show requested slots before submission and allow each to be changed.
- [ ] After submission, show each slot independently as Searching, Held, Booked or No professional found.
- [ ] Provide `Choose another time` only for the unmatched slot.
- [ ] Preserve already held/booked sibling slots when one slot fails.
- [ ] Use clear loading, timeout, stale-slot and retry states.
- [ ] Never label Requested or Held as Booked.
- [ ] Empty-state copy: **No professional is available for this slot. Nothing has been charged.**

**Done when:** the Customer never waits for a Partner to suggest a time.

## FE-3 — Visit checkout and tracker

**Depends on:** BE-4 and BE-7.

**Objective:** Preserve the existing visit protections around the corrected ordering.

- [ ] Open checkout when the first Partner holds a Customer-selected slot.
- [ ] Show hold expiry, visit-plan price, credits, amount due and supported payment methods.
- [ ] Keep “visit fee is not the project price” disclosure.
- [ ] Preserve per-slot automatic refund copy.
- [ ] Preserve professional identity disclosure, exact address timing, arrival code, visit progress, reschedule, cancellation preview, no-show, recovery, completion and rating.
- [ ] Handle partially matched 2/3-visit plans without hiding successful slots.

**Done when:** the payment and tracker screens describe the server state exactly and retain every existing visit-day protection.

## FE-4 — Fixed-time Partner offers

**Depends on:** BE-3 and BE-7.

**Objective:** Replace Partner time picking with one fast decision.

- [ ] Offer card/detail shows service, approximate area, fixed date/time, duration, visit earning and response deadline.
- [ ] Primary action is `Accept this visit`; secondary action is `Decline`.
- [ ] Remove “Choose a visit time”, visit-day tabs and the Partner slot picker from initial matching.
- [ ] Show `This visit was taken by another professional` for an acceptance race.
- [ ] After acceptance, show Held while Customer payment is pending and explicitly say `Do not travel yet`.
- [ ] After payment, show Booked and reveal the exact site address.
- [ ] Preserve notifications, foreground live-offer behavior and polling fallback.

**Done when:** accepting an offer requires no Partner scheduling decision.

## FE-5 — Partner navigation only where it helps

**Objective:** Stop rendering the full Partner navbar on every page.

- [ ] Split session/auth responsibilities from visual app chrome; hiding navigation must not weaken route authorization.
- [ ] Keep the full top bar and bottom tabs only on `/home`, `/work/all`, `/money` and `/me`.
- [ ] Use a focused header with Back + page title on offer details, enquiry details, visit workspaces, estimate creation, jobs, shift/day details and stage details.
- [ ] On onboarding `/apply/**`, show only onboarding progress/navigation, not the signed-in Partner navbar.
- [ ] Marketing pages keep their existing marketing header/footer.
- [ ] Login and error/loading routes remain chrome-free.
- [ ] Keep live-offer notifications available from the authenticated session layer even when the visible navbar is hidden.
- [ ] Keep logout reachable from `/me`; do not repeat it on every focused screen.
- [ ] Remove fixed-navbar padding from focused pages so content does not leave empty top/bottom gaps.
- [ ] Verify browser Back, deep links, keyboard focus and screen-reader route announcements.

**Done when:** top-level pages provide orientation and task pages provide focus without losing auth, notifications or recovery.

## FE-6 — Item-wise and Labour-wise estimate composer

**Depends on:** BE-5 and BE-7.

**Objective:** Build one mobile-first composer with two simple modes.

- [ ] First control selects `Item-wise` OR `Labour-wise`; switching with entered data requires confirmation.
- [ ] Item-wise rows: category/item, unit, rate, quantity and calculated amount.
- [ ] Labour-wise rows: role/team, members, days and rate/day.
- [ ] Provide category-aware quick-add labels for electrician, plumbing, painting, beauty/home care, catering, equipment rental and event/media.
- [ ] Quick-add presets provide names/units only; never inject an unpublished price.
- [ ] Keep custom rows and named other charges.
- [ ] Keep materials separate where they are paid as an advance.
- [ ] Show one sticky summary: subtotal, tax/markup, platform fee treatment, grand total and Partner receivable.
- [ ] Keep draft autosave, Save Draft, guarded Clear All, validation, PDF preview and Send Estimate.
- [ ] Keep inclusions, exclusions, warranty, validity, revisions and earlier-version history.
- [ ] Use existing semantic colors and components; no new palette or desktop-only copy of the JPEG layouts.

**Done when:** the composer is fast on a phone and cannot produce a mixed-mode estimate.

## FE-7 — Partner installment editor

**Depends on:** BE-6 and BE-7.

**Objective:** Let the Partner create an understandable payment plan inside the estimate.

- [ ] Label proposal stages as `Payment installments` in the composer.
- [ ] Start with one installment and allow simple add/remove/reorder controls.
- [ ] Each row asks for title, what the Customer receives, amount and optional expected completion date.
- [ ] Show a calculated percentage beside each amount for clarity; submit the fixed paise amount.
- [ ] Show `Allocated` and `Still to allocate` against the estimate total.
- [ ] Disable submission until the schedule reconciles exactly, with the error beside the installment section.
- [ ] Explain that the Customer pays installments one at a time and that later changes require approval.
- [ ] In Customer estimate detail/comparison, show the installment schedule before selection.
- [ ] In the engagement, keep one `Fund this installment` action for the next eligible installment only.

**Done when:** both Partner and Customer understand how much is due, for what, and in what order.

## FE-8 — Customer estimate reading and selection

**Depends on:** FE-6 and FE-7.

**Objective:** Compare different estimate types without hiding their differences.

- [ ] Show an Item-wise or Labour-wise badge on every estimate.
- [ ] Compare common facts first: grand total, start, duration, warranty, validity, exclusions and installment count.
- [ ] Expand mode-specific detail: item rows for Item-wise; team/day rows for Labour-wise.
- [ ] Preserve materials, stages/installments, inclusions, tax, commission treatment and visit provenance.
- [ ] Preserve Not chosen, Non-responsive replacement, free price refresh, expired state, append-only revisions and one final selection action.
- [ ] Preserve immediate engagement opening after a valid selection.

**Done when:** a Customer can compare unlike estimate types without reducing either to only a total price.

**Antigravity static checks:**

```powershell
cd frontend
pnpm lint
pnpm typecheck
pnpm build
```

**Owner-run frontend tests:** run the relevant Vitest and Playwright commands for the test files Antigravity adds. Agents must not execute tests.

---

# Integration order

1. [ ] Codex completes BE-1 through BE-4 and publishes the visit contract.
2. [ ] Antigravity builds FE-1 through FE-5 against that contract.
3. [ ] Codex completes BE-5 through BE-7 and publishes the estimate/installment contract.
4. [ ] Antigravity builds FE-6 through FE-8.
5. [ ] Codex runs backend static checks; Antigravity runs frontend lint, typecheck and build.
6. [ ] Owner runs backend and frontend tests and manually verifies the complete Customer/Partner journey.

## Manual acceptance journey

- [ ] Customer completes the three-step brief without seeing media/audio/details controls.
- [ ] Customer selects two estimates and two visit times.
- [ ] Available Partners receive fixed-time offers; no Partner sees a slot picker.
- [ ] First acceptance wins; another Partner receives the taken-state response.
- [ ] One slot succeeds and one exhausts; the Customer changes only the failed slot.
- [ ] Customer pays after a real acceptance and the held visit becomes booked.
- [ ] Exact address appears to the accepted Partner only after payment.
- [ ] Arrival code, visit completion and no-show/recovery paths still work.
- [ ] Partner sends one Item-wise estimate and another sends one Labour-wise estimate.
- [ ] Both Partners define installments whose amounts reconcile with their totals.
- [ ] Customer compares both, selects one and funds only the first installment.
- [ ] Focused Partner pages have no persistent navbar; top-level Partner pages still do.

## Out of scope

- Mixed Item-wise + Labour-wise estimates.
- Customer-defined or Customer-edited installment schedules.
- Paying several installments in one checkout.
- Credit, EMI/BNPL or lending products; “installments” here means staged project payments.
- New microservices, WebSocket infrastructure or a second payment ledger.
- A new frontend color palette or redesign of unrelated screens.
- Deleting historical requirement attachments or shared stage/dispute evidence infrastructure.
