# Customer-booked visits and Partner estimates

Implementation tracker for the Customer and Partner flow redesign.

## Ownership

- **Codex:** `backend/**`, `contracts/openapi/**`, backend tests and contract publication.
- **Antigravity:** `frontend/**`, frontend tests and UI integration.
- **Claude:** no further implementation work. Its existing `M2-revamp` changes are historical input that Codex and Antigravity must audit rather than blindly preserve.
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
- [x] The reference JPEGs are layout inspiration only, not financial specifications. Their percentage controls and some displayed receivable arithmetic are inconsistent and must not be copied.
- [x] A Partner edits commercial scope only: line names, allowed units, quantities/rates, explicit named charges and installment structure.
- [x] Tax rate/basis/components, V Solve Hub fees, commission treatment, statutory withholding, grand totals and Partner receivable are server-calculated and read-only.
- [x] Remove the separate `Contractor / Vendor Profit %` control. A Partner's margin belongs inside the rate they quote; it is not a second percentage surcharge.
- [x] Tax policy is Operations-owned, versioned and approved by Finance/legal. Neither the Partner nor the first quote on a requirement chooses the tax basis or rate.
- [x] An estimate/PDF is a quotation, not a tax invoice. Payment receipts, tax invoices and credit notes are generated only from verified financial events and the approved supplier-of-record policy.
- [x] Razorpay **test mode** is the payment provider for milestone integration/smoke payments. Automated tests remain deterministic and mock the provider boundary; they never call Razorpay over the network.
- [x] Razorpay credentials and webhook secrets live only in environment/secret storage. Never place their values in this file, `AGENTS.md`, source, fixtures, logs or frontend environment variables.
- [x] Use the existing frontend colors, semantic tokens, typography, components and Lucide icon language. Do not introduce a new visual theme or hardcoded colors.
- [x] Global Partner navigation appears only on top-level destinations. Focused task screens use a back button and page title without the persistent top/bottom navbar.
- [x] On mobile, Customer and Partner journeys must feel like an app: compact app bars, bottom actions, touch-first controls, visual status rails and focused screens instead of marketing-page layouts.
- [x] ~~Customer service discovery lists every published service as **icon + text**. Service-list images are removed.~~ **REVERSED by the owner 2026-08-26:** discovery is image-led (Urban-Company style) — photographic tiles for categories and subcategories, cover photos on service cards, `image_url` fields on Category/Subcategory/ServiceVariant plus `ServiceMedia` COVER rows. Icons remain the fallback for anything without a photo. Search stays optional and never required to discover a service.
- [x] Keep the current fonts. Typography work is limited to the existing scale, weights and spacing.
- [x] Antigravity may add purposeful motion using the existing visual system, with reduced-motion support and no layout-shifting animation.
- [x] For this milestone, Codex and Antigravity are authorized to run their backend and frontend test suites and must report the actual results.

## Estimate money controls — fixed

| Value | Who controls it | UI behavior |
|---|---|---|
| Item/service name, allowed unit, quantity and quoted rate | Partner | Editable |
| Labour role, members, days and rate/day | Partner | Editable |
| Explicit transport/loading/permit/custom charge | Partner, within allowed charge rules | Editable amount with a visible name; never generic `Miscellaneous` |
| Partner profit or markup percentage | Nobody | Removed; margin is already inside the Partner's quoted rates |
| Tax category, basis, rate and amount | Versioned server policy | Read-only breakdown |
| V Solve Hub customer fee and tax on that fee | Versioned server policy | Read-only and separately labelled |
| Partner commission/platform deduction | Versioned server policy | Read-only; never added twice |
| Statutory collection/withholding | Server policy and verified tax profile | Read-only settlement line; never disguised as commission |
| Installment label, deliverable, order and Partner-service amount | Partner | Editable until the estimate is submitted/selected |
| Customer grand total and Partner net receivable | Server | Read-only derived totals |

The image's `Add percentages` block is therefore not implemented literally. There is no editable
tax percentage, platform-fee percentage or profit percentage in the Partner composer.

```text
Partner-priced lines + approved named charges
                    ↓
        Server-resolved taxable value
                    ↓
      + Partner-service tax (if applicable)
                    ↓
          = Partner quote total
                    ↓
      + separate V Solve Hub fee/tax (only if policy says Customer pays it)
                    ↓
          = Customer grand total

Partner quote total
      - Operations-owned commission
      - statutory withholding/collection (when applicable)
      = Partner net receivable
```

### Claude audit corrections — fixed 2026-08-25

- [x] **Keep Claude's removal of the media/details step.** That directly matches the owner decision.
- [x] **Do not keep the two-step flow as the final design.** Deleting Review as well was scope expansion and makes “Where and when” too dense once 1–3 visit-slot pickers arrive. The final third screen is a focused **Choose visits & send** screen, not the old passive Review screen.
- [x] **The Customer never describes anything.** No `additional_details` paragraph, no photos, no voice notes, no textareas anywhere in capture. Category questions collect facts only — choices, numbers, yes/no.
- [x] **"What needs doing?" is infographic.** Choice questions render as icon tiles; booleans are Yes/No tiles; numbers stay on the keypad card. The catalogue must not publish `TEXT` questions for this flow.
- [x] **Remove keyword-guessed service icons as the final source of truth.** A wrong pictogram is worse than a generic one. The backend publishes a controlled `icon_key`; Antigravity maps that key exhaustively to the existing icon family.
- [x] **Estimate count and visit slots live together on “Choose visits & send”.** This screen previews the service/site facts, lets the Customer select 1/2/3 estimates and one slot per estimate, and submits the request.
- [x] **Low text everywhere.** One reassurance line per screen; no paragraphs the Customer must read to proceed.

## Final flow

```text
Customer creates a 3-step brief
  -> reviews the compact service/site facts
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
Step 1 of 3  What needs doing?         (icon tiles + keypad card, zero typing)
Step 2 of 3  Where and when?           (address and dates)
Step 3 of 3  Choose visits & send      (compact facts, estimate count and slots)
```

There is no passive review or media step. The final screen exists to make the
estimate-count and slot decisions without overloading the address/date screen.
The request must remain useful without media or
free-text detail. Category questions should collect only facts needed for
matching or estimating — publish them as choice/number/boolean, never `TEXT`.
Do not add replacement fields merely to fill the removed screens.

## Mobile app experience — Antigravity applies this to every touched screen

- Use existing semantic color tokens and fonts; no rebranding, new typeface or hardcoded palette.
- At mobile widths, use a compact app bar, one clear primary action and bottom-safe-area padding.
- Prefer icon tiles, pictograms, progress rails, status timelines, amount cards and concise fact rows over explanatory paragraphs.
- Use bottom sheets for short mobile decisions; do not squeeze desktop dialogs into a phone viewport.
- Keep tap targets at least 44×44 px, visible focus, semantic labels and non-color status cues.
- Motion must explain state: press feedback, sheet transitions, selection movement, matching progress and success confirmation.
- Keep motion around 150–300 ms, animate transform/opacity, avoid layout shift, and honor `prefers-reduced-motion`.
- Focused task routes must not inherit marketing headers, footers or persistent navigation.
- Desktop remains functional and responsive, but the mobile app experience is the primary acceptance surface.

---

# Codex — backend and contract

## BE-1 — Remove requirement-capture friction

**Objective:** Make the three-step brief the only Customer requirement path.

- [x] Stop requiring or processing requirement-level photos, files, voice notes, language, additional instructions, callback preferences and access restrictions for new requests.
- [x] Remove these values from matching decisions and Partner enquiry projections.
- [x] Keep old stored values readable only where needed for historical/audit compatibility; do not destructively erase existing customer data in this change.
- [x] Retire requirement-upload endpoints only after confirming they are not shared with stage evidence, disputes or Operations evidence.
- [x] Keep stage-evidence uploads and their malware/checksum/access controls unchanged.
- [x] Make old-client fields optional during rollout so a deployed client does not break while Antigravity moves to the new contract.
- [x] Add regression tests proving a requirement can be created, updated, reviewed and submitted with only service facts, site and dates.

**Done when:** a new project request has no media/details dependency and still produces a complete matchable snapshot.

## BE-2 — Customer-owned visit slots

**Objective:** Move initial visit-time selection from the Partner to the Customer.

- [x] Publish candidate visit windows for the Customer using the existing availability engine, service-area rules, duration and turnaround buffer.
- [x] Accept signed slot tokens only; never accept a free-form date/time.
- [x] Require exactly the number of requested slots represented by the selected 1/2/3 estimate plan.
- [x] Reject duplicate or overlapping slots unless the product explicitly supports simultaneous visits.
- [x] Store each requested slot independently so partial matching is visible and recoverable.
- [x] Allow the Customer to replace an unmatched requested slot without changing already held or booked visits.
- [x] Remove the Partner candidate-slot picker contract after Antigravity no longer consumes it.
- [x] Preserve the existing reschedule flow for already booked visits.

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

- [x] Match by approved capability, service area, operational standing and availability for the entire visit plus turnaround.
- [x] Exclude Partners already holding another estimate slot for the same requirement.
- [x] Create a fixed-time offer containing service, approximate area, visit start/end, duration, visit earning and response deadline.
- [x] Notify matching available Partners through the existing notification/outbox infrastructure.
- [x] Make acceptance atomic: first valid acceptance wins; later accepts receive an explicit `slot_taken` conflict.
- [x] Decline or expiry must release only that Partner offer and continue matching while candidates remain.
- [x] When every eligible candidate is exhausted, write `NO_PROFESSIONAL_FOUND`; do not leave the Customer polling forever.
- [x] Do not expose the exact Customer address before payment confirms the visit.
- [x] Add concurrency, expiry, no-capacity, partial-plan and idempotency regression tests.

**Done when:** every offer is for one immutable Customer-selected time and the exhausted state is explicit.

## BE-4 — Visit-plan payment and recovery

**Objective:** Keep payment behind real supply.

- [x] First Partner acceptance opens the existing visit-plan checkout and creates a temporary hold.
- [x] A Customer with zero accepted slots cannot be charged.
- [x] Provider-verified payment turns all currently held slots into booked visits.
- [x] Later accepted slots on an already-paid plan become booked without another plan charge.
- [x] Expired unpaid holds return to matching without penalising the Partner.
- [x] Preserve per-slot automatic refund/replacement behavior for visits that never happen or never produce a usable estimate.
- [x] Keep all amounts in integer paise and all payment state changes idempotent and auditable.
- [x] Add tests for callback replay, hold expiry, partial fulfilment, refund shares and payment/matching races.

**Done when:** no Customer pays before at least one Partner commits and no held Partner is stranded by payment state.

## BE-5 — Two estimate types

**Objective:** Give every submitted estimate one unambiguous pricing method.

- [x] Add a published estimate type enum: `ITEM_WISE` or `LABOUR_WISE`.
- [x] Add item-wise lines with category, title, unit, quantity, rate and server-calculated amount.
- [x] Add labour-wise lines with role/team, member count, day count, rate per day and server-calculated amount.
- [x] Enforce exactly one line family per estimate. Do not support `item subtotal + labour subtotal` in this version.
- [x] Publish only the selected mode's subtotal. Do not preserve the image's misleading `A + B` presentation when one side must always be zero.
- [x] Keep materials/consumables as separately identified material-advance lines where applicable.
- [x] Keep other charges as explicit named lines; no hidden transport, packing or miscellaneous fallback.
- [x] Server calculates line amounts, subtotal, authorized charges, tax, platform-fee treatment, Customer grand total and Partner receivable.
- [x] Do not add a separate Partner-profit/markup field or percentage; the Partner's sell rate already contains its margin.
- [x] The platform fee is policy-owned and cannot be edited by the Partner.
- [x] Preserve inclusions, exclusions, warranty, validity, start date, stages, revisions, supersession, withdrawal and visit-completion guard.
- [x] Preserve append-only estimate history.
- [x] Add shape, arithmetic, authorization, idempotency and revision regression tests.

**Done when:** the API can represent the seven reference categories without category-specific proposal tables or mixed estimate modes.

## BE-5A — Tax, fees and financial truth

**Objective:** Make one server-owned calculation explain every rupee shown, collected, refunded, documented and paid out.

### Policy gate

- [ ] Record a Finance/legal-approved decision for each money purpose: who is supplier/merchant of record for the Partner service, materials, visit-plan fee and any V Solve Hub customer fee.
- [ ] Decide whether each V Solve Hub charge is customer-paid, deducted from Partner proceeds, or not applicable. Never model one fee as both a customer surcharge and a Partner deduction without two explicitly named supplies.
- [ ] Decide the commission basis: which amounts are included/excluded, whether tax and material advances participate, caps/floors, rounding and effective date.
- [ ] Record statutory e-commerce collection/withholding obligations separately from commission and customer tax. Do not implement a guessed TCS/TDS rule.
- [x] Keep paid tax collection fail-closed while any required policy decision is missing; never fall back to 0% tax or a default fee.

### Canonical tax inputs

- [x] Establish one verified Partner/business tax profile with legal name, registration status, GSTIN verification state and effective dates. Do not let a Partner type or change these values inside an estimate.
- [x] Audit the existing capability-level `gst_registered`/`gstin` fields and migrate or project them into the canonical profile without losing historical values.
- [x] Resolve tax from the service/line tax category, verified supplier status, transaction date and place-of-supply facts. Reuse `ServiceVariant.tax_category_code`; do not hardcode tax rates in React or proposal serializers.
- [x] Snapshot service address state, supplier state, tax category/SAC where approved, policy version, tax basis, taxable value, rate and CGST/SGST/IGST/cess components used for the calculation.
- [x] Support different tax treatment across service, material and authorized-charge lines. A single unchecked proposal-level `tax_paise` input is insufficient for mixed estimates.
- [ ] If business customers are supported, collect optional billing legal name/GSTIN/address once at checkout/account level and snapshot it onto the financial document. Do not add these fields to the frictionless requirement brief.

### Calculation and immutability

- [x] Replace `required_tax_basis()` choosing the first submitted quote's basis with an Operations-owned basis snapshotted before vendors quote, so every Partner is compared on the same server rule.
- [x] Remove `tax_basis`, `tax_paise` and `commission_treatment` from writable Partner/Operations-assisted proposal input. Publish them only as derived read fields.
- [ ] Use one pure money calculator for proposal submission, comparison, engagement opening, installment checkout, payout, refund and documents. Use integer paise/basis points only and one documented rounding/allocation rule.
- [x] Persist both components and totals: Partner line subtotal, authorized charges, taxable value, Partner-service tax, Partner quote total, V Solve Hub customer fee/tax if applicable, Customer grand total, commission, statutory withholding and Partner net receivable.
- [x] Snapshot the calculation and policy version on every submitted revision. Later policy or Partner tax-profile changes never rewrite an old proposal or funded installment.
- [ ] Give every amendment its own calculation snapshot; refunds and credit notes reverse the original stored allocations rather than recalculating at today's rate.
- [x] Add database reconciliation constraints where row-local and transaction-locked reconciliation for cross-row totals.

### Charges and documents

- [x] Replace generic `Miscellaneous` with controlled charge codes such as transport, loading/unloading, disposal, permit and equipment delivery plus an explicit custom label when allowed.
- [ ] Prevent blank labels, zero/negative amounts, duplicate charges and a charge already included in a quoted line. Tax treatment is resolved from the charge code, not entered as a percentage.
- [ ] Render proposal PDFs as `Estimate`/`Quotation` with revision, validity and tax/fee breakdown; never assign an invoice number before a taxable financial event.
- [ ] Generate the correct receipt, tax invoice/bill of supply and credit/debit note from the approved supplier-of-record model, including the required supplier/recipient/place-of-supply/tax-component fields.
- [ ] Keep V Solve Hub's own fee document separate from the Partner-service document when they are legally separate supplies.
- [ ] Add regression/property tests for inclusive/exclusive policy, registered/unregistered Partner, intra/inter-state components, mixed line categories, rounding boundaries, revisions, installments, partial refunds, amendments, fee treatment and payout reconciliation.

**Done when:** the client cannot choose a tax or platform percentage, every displayed total is reproducible from one immutable server snapshot, and payment/refund/payout documents reconcile to that snapshot.

## BE-6 — Partner-defined installments using stages

**Objective:** Let the Partner propose a simple payment schedule without creating a new payment rail.

- [x] Treat proposal stages as the installment schedule presented to the Customer.
- [x] Each installment contains: title, deliverable/payment purpose, fixed Partner-service amount in paise, position and optional expected completion date.
- [x] Require at least one installment for a managed project estimate.
- [x] Require installment amounts plus material advances to reconcile exactly with the server-calculated Partner quote total. A separately charged V Solve Hub fee is never allocated or edited by the Partner.
- [x] Accept fixed rupee amounts as authoritative. Percentages may be displayed by the frontend but are not stored as the source of truth.
- [x] Allocate taxable value and tax components deterministically across installments/material advances so the sum of installment checkouts matches the displayed payable total exactly, including paise remainders.
- [x] At each checkout, disclose the installment's Partner-service amount, tax and any separately applicable V Solve Hub charge before showing the final amount due.
- [x] Customer funds installments one at a time and in order through the existing stage-funding checkout.
- [x] Work on an installment cannot begin until its verified payment is funded.
- [x] Once the estimate is selected, the Partner cannot silently change installment amount/order; changes use the existing Customer-approved amendment flow.
- [x] Preserve stage evidence, Customer approval/correction/dispute, payout hold, refund, retention and warranty behavior.
- [x] Add tests proving installment/tax/fee allocations reconcile, rounding remainders are assigned once, refunds reverse the original allocation and later installments cannot be funded early.

**Done when:** the Partner controls a clear payment schedule and the Customer never has to fund the whole project upfront.

## BE-7 — Publish the contract for Antigravity

**Objective:** Give the frontend one stable generated contract.

- [x] Publish Customer slot-window, requested-slot, matching-status and replacement-slot operations.
- [x] Publish fixed-time Partner offer and accept/decline operations.
- [x] Publish estimate type, item lines, labour lines, material lines and installment/stage fields.
- [x] Publish the read-only financial calculation: tax policy snapshot/components, authorized charges, Partner quote total, separate V Solve Hub charge, Customer grand total, commission/withholding and Partner net receivable.
- [x] Remove Partner-writable `tax_basis`, `tax_paise` and `commission_treatment` from the proposal-create contract.
- [x] Publish the compact all-services catalogue operation and backend-owned `icon_key` described in BE-8.
- [x] Publish explicit errors for `slot_taken`, `slot_expired`, `no_professional_found`, invalid estimate shape, unsupported charge, financial policy unavailable and installment mismatch.
- [x] Regenerate and validate `contracts/openapi/v1.yaml`; do not hand-edit it.
- [x] Record breaking/removal notes in `contracts/openapi/CHANGELOG.md`.
- [x] Tell Antigravity the contract version and changed operations before frontend integration starts.

## BE-8 — Publish an icon-first all-services catalogue

**Objective:** Let the Customer discover every service without image downloads, mandatory search or frontend icon guessing.

- [x] Add a controlled `icon_key` vocabulary to `Service`; keep `Category.icon_key` for category identity rather than using it as an unreliable substitute for every service.
- [x] Assign a valid icon key to every active published service through data migration/seed updates. Reject publication when the key is missing or unsupported.
- [x] Publish `icon_key` on service-card and service-detail representations.
- [x] Publish one compact ordered catalogue operation containing every active service with only the fields the icon grid needs: id/slug, name, category/subcategory identity, display order and `icon_key`.
- [x] Do not include cover-image payloads in the compact icon catalogue. Existing images may remain on detail or marketing surfaces outside the service listing.
- [x] Avoid the current one-request-per-category fan-out; the Customer must be able to load the grouped catalogue from one cacheable request.
- [x] Preserve Operations-managed category/service ordering and deterministic grouping.
- [x] Add validation and regression tests proving every published service has a supported icon key, unpublished services are excluded and ordering is stable.
- [x] Publish the operation and enum through the generated OpenAPI contract; Antigravity must not infer icons from service-name keywords.

**Done when:** one small response can render the complete category-grouped icon catalogue with an authoritative icon for every published service.

## BE-9 — Razorpay test-mode readiness

**Objective:** Exercise visit-plan and installment payments through Razorpay sandbox without weakening the server-owned payment state machine.

- [x] Reuse the existing `RazorpayPaymentProvider`, order/payment/refund adapter, signed webhook route, reconciliation tasks and payment runbook.
- [x] No new Razorpay Python or npm SDK is required. The backend already uses the locked `requests` dependency and the Customer app loads Razorpay Checkout at the browser boundary.
- [ ] Rotate the test key secret disclosed in chat and configure only the replacement through local/staging secret storage. Never commit or print it.
- [ ] Configure `PAYMENT_PROVIDER=razorpay`, test-mode `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, the existing API base URL and a separate high-entropy `PAYMENT_WEBHOOK_SECRET`.
- [ ] Keep `PAYMENTS_ALLOW_SIMULATED_CAPTURE=false` while running Razorpay sandbox smoke payments so a fake success path cannot mask integration failure.
- [ ] Configure the Razorpay dashboard webhook to the public HTTPS `/api/v1/payment-webhooks/razorpay/` endpoint and enable only events the adapter handles.
- [x] Keep the key secret and webhook secret server-only. The browser receives only the publishable test key id and provider order data from Django's checkout response.
- [x] Keep automated unit/component/Playwright suites at the provider boundary with deterministic fakes; do not make CI depend on Razorpay, internet availability or a reusable payment credential.
- [ ] Run a separate staging sandbox smoke for visit-plan payment, first installment, duplicate/out-of-order callback, Checkout dismissal/retry, amount mismatch, refund and reconciliation.
- [x] Confirm provider amount/currency/order references match the immutable server attempt before capture changes any visit or stage state.
- [x] Keep Razorpay collections credentials separate from RazorpayX payout credentials and permissions.
- [ ] Record exact sandbox smoke references without logging full payloads, secrets or customer payment data.

**Done when:** real Razorpay test Checkout and signed webhooks drive the same idempotent server states already covered by deterministic tests, with no credential in source control.

**Backend verification Codex is authorized to run for this milestone:**

```powershell
cd backend
.\scripts\quality-static.cmd
```

Run focused tests while implementing each task, then the complete backend quality command before handoff:

```powershell
cd backend
.\scripts\quality.cmd
```

---

# Antigravity — frontend

## FE-1 — Finish the frictionless three-step Customer brief

**Objective:** Preserve Claude's useful friction removal, then separate visit choices into one focused final action screen.

- [x] Delete the “Show us the space” step from the project-request state machine and progress meter.
- [x] Claude deleted the old passive Review step and temporarily moved estimate count onto Where and when.
- [x] Remove requirement photo/file upload, voice recorder, language, additional instructions, callback/access controls and review summaries from this flow.
- [x] Do not remove shared stage-evidence UI used after a project starts (`model/upload.ts`, server-attachment adapters and post-submit attachment views kept).
- [x] Claude temporarily renumbered the flow to 1 of 2 and 2 of 2 (`SCREEN_BUDGET = 2`, enforced by `boundary.test.ts`).
- [x] Keep draft resume, back navigation and validation; the submit guard on Where and when re-asserts step 1’s rule.
- [x] Do not add replacement text areas or optional drawers.
- [x] Rebuild “What needs doing?” as icon tiles (`option-tiles.tsx` + `option-icons.ts`, lucide-react added to the customer app).
- [x] Antigravity adds **Choose visits & send** as Step 3 of 3; it is a decision screen, not a passive Review screen.
- [x] Move estimate count and all visit-slot controls from Where and when to Step 3. Keep only a compact read-only service/site fact recap there.
- [x] Update progress, state transitions, draft resume, Back behavior, validation and boundary tests from the temporary two-step shape to the final three-step shape.
- [x] Use `Step 1 of 3`, `Step 2 of 3`, `Step 3 of 3` consistently on phone and desktop.
- [x] Follow-up: strip the dormant draft-attachment reducer machinery and upload mutations once BE-1 retires the requirement-upload endpoints.
- [x] Antigravity runs the Vitest suites for `features/requirement` and `features/project-request`, then walks the phone + desktop brief manually and records results.

**Done when:** a Customer reaches Send through three focused steps with no media/details step, no passive review screen and no overloaded address/date screen.

## FE-2 — Customer slot selection and matching

**Depends on:** BE-2, BE-3 and BE-7.

**Objective:** Make the Customer visibly own every visit time.

- [ ] On Choose visits & send, render the 1/2/3 estimate selector and one slot picker per requested estimate.
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

- [x] Offer card/detail shows service, approximate area, fixed date/time, duration, visit earning and response deadline.
- [x] Primary action is `Accept this visit`; secondary action is `Decline`.
- [ ] Remove “Choose a visit time”, visit-day tabs and the Partner slot picker from initial matching.
  - **Deferred on purpose (Claude).** BE-3's replacement is unpublished, and BE-2 says to retire the
    picker contract only after the frontend stops consuming it. Deleting the only working commitment
    path with nothing behind it would break the live partner flow. Do this the day BE-3 lands.
- [ ] Show `This visit was taken by another professional` for an acceptance race.
- [x] After acceptance, show Held while Customer payment is pending and explicitly say `Do not travel yet`.
- [ ] After payment, show Booked and reveal the exact site address.
- [ ] Preserve notifications, foreground live-offer behavior and polling fallback.

**Done when:** accepting an offer requires no Partner scheduling decision.

## FE-5 — Partner navigation only where it helps

**Objective:** Stop rendering the full Partner navbar on every page.

- [x] Split session/auth responsibilities from visual app chrome; hiding navigation must not weaken route authorization.
- [x] Keep the full top bar and bottom tabs only on `/home`, `/work/all`, `/money` and `/me`.
- [x] Use a focused header with Back + page title on offer details, enquiry details, visit workspaces, estimate creation, jobs, shift/day details and stage details.
- [x] On onboarding `/apply/**`, show only onboarding progress/navigation, not the signed-in Partner navbar.
- [x] Marketing pages keep their existing marketing header/footer.
- [x] Login and error/loading routes remain chrome-free.
- [x] Keep live-offer notifications available from the authenticated session layer even when the visible navbar is hidden.
- [x] Keep logout reachable from `/me`; do not repeat it on every focused screen.
- [x] Remove fixed-navbar padding from focused pages so content does not leave empty top/bottom gaps.
- [x] Verify browser Back, deep links, keyboard focus and screen-reader route announcements.

**Done when:** top-level pages provide orientation and task pages provide focus without losing auth, notifications or recovery.

## FE-6 — Item-wise and Labour-wise estimate composer

**Depends on:** BE-5, BE-5A and BE-7.

**Objective:** Build one mobile-first composer with two simple modes.

- [ ] First control selects `Item-wise` OR `Labour-wise`; switching with entered data requires confirmation.
- [ ] Item-wise rows: category/item, unit, rate, quantity and calculated amount.
- [ ] Labour-wise rows: role/team, members, days and rate/day.
- [ ] Provide category-aware quick-add labels for electrician, plumbing, painting, beauty/home care, catering, equipment rental and event/media.
- [ ] Quick-add presets provide names/units only; never inject an unpublished price.
- [ ] Keep custom rows and named other charges, but replace generic `Miscellaneous` with an explicit label and the backend's allowed charge codes.
- [ ] Keep materials separate where they are paid as an advance.
- [ ] Do not render editable Partner-profit, tax, V Solve Hub fee or commission percentages from the JPEGs.
- [ ] Show one sticky read-only server summary: selected-mode subtotal, authorized charges, tax, separately applicable platform charge, Customer grand total and Partner net receivable.
- [ ] Visually distinguish editable inputs from derived read-only amounts; do not style calculated values like disabled text boxes.
- [ ] Recalculate from a debounced server preview after financial inputs change. Show a local row multiplication only as provisional and never enable Send until the server calculation is current.
- [ ] Place cause-and-recovery errors beside the affected line/charge/installment and focus the first invalid field after submit.
- [ ] Keep draft autosave, Save Draft, guarded Clear All, validation, PDF preview and Send Estimate.
- [ ] Label PDF output `Estimate` or `Quotation`, never `Tax invoice`.
- [ ] Keep inclusions, exclusions, warranty, validity, revisions and earlier-version history.
- [ ] Use existing semantic colors and components; no new palette or desktop-only copy of the JPEG layouts.

**Done when:** the composer is fast on a phone and cannot produce a mixed-mode estimate.

## FE-7 — Partner installment editor

**Depends on:** BE-5A, BE-6 and BE-7.

**Objective:** Let the Partner create an understandable payment plan inside the estimate.

- [ ] Label proposal stages as `Payment installments` in the composer.
- [ ] Start with one installment and allow simple add/remove/reorder controls.
- [ ] Each row asks for title, what the Customer receives, Partner-service amount and optional expected completion date.
- [ ] Show a calculated percentage beside each amount for clarity; submit the fixed paise amount.
- [ ] Show `Allocated` and `Still to allocate` against the server-published Partner quote total; never ask the Partner to allocate a separate V Solve Hub charge.
- [ ] Disable submission until the schedule reconciles exactly, with the error beside the installment section.
- [ ] Explain that the Customer pays installments one at a time and that later changes require approval.
- [ ] In Customer estimate detail/comparison, show the installment schedule before selection.
- [ ] In the engagement, keep one `Fund this installment` action for the next eligible installment only.
- [ ] Before funding, show the server's compact breakdown for that installment: service/material amount, tax, separate platform charge if applicable and total due.

**Done when:** both Partner and Customer understand how much is due, for what, and in what order.

## FE-8 — Customer estimate reading and selection

**Depends on:** BE-5A, FE-6 and FE-7.

**Objective:** Compare different estimate types without hiding their differences.

- [ ] Show an Item-wise or Labour-wise badge on every estimate.
- [ ] Compare common facts first: grand total, start, duration, warranty, validity, exclusions and installment count.
- [ ] Expand mode-specific detail: item rows for Item-wise; team/day rows for Labour-wise.
- [ ] Preserve materials, stages/installments, inclusions, tax, fee/commission treatment and visit provenance.
- [ ] Show the same named financial ladder on every estimate: Partner subtotal → authorized charges → tax → separate V Solve Hub fee if applicable → Customer total.
- [ ] Do not expose Partner settlement deductions in Customer comparison unless the approved commercial policy makes them a Customer charge; show Partner net receivable only in the Partner workspace.
- [ ] Clearly distinguish `Estimate/Quotation`, payment receipt, tax invoice/bill of supply and credit note; never use these labels interchangeably.
- [ ] Preserve Not chosen, Non-responsive replacement, free price refresh, expired state, append-only revisions and one final selection action.
- [ ] Preserve immediate engagement opening after a valid selection.

**Done when:** a Customer can compare unlike estimate types without reducing either to only a total price.

## FE-9 — All-services icon catalogue

**Depends on:** BE-7 and BE-8.

**Objective:** Make the complete service catalogue immediately scannable without turning discovery into search or an image gallery.

- [x] Show every published service grouped under its category, using the backend display order.
- [x] A service tile contains an icon and its service name only. Remove service-list photos, image placeholders, descriptions, price copy and decorative badges from this listing.
- [x] Use a compact responsive grid with touch-first spacing. Labels may wrap to two lines; preserve the full accessible name and a minimum 44×44 px target.
- [x] Make categories easy to jump between with an app-like category rail/chips or an equally compact index; all services remain reachable by scrolling without entering a query.
- [x] Keep search as an optional accelerator, not the default empty state or a prerequisite for discovery.
- [x] Consume the backend `icon_key` with an exhaustive mapping to the existing Lucide/icon system. Never guess from service-name keywords; use a visible generic fail-safe only for forward-compatible unknown keys and report the mismatch.
- [ ] In the Operations service editor, expose the same controlled icon choices with a preview; do not ask an operator to type a library icon name. New services cannot be published without a supported choice.
  - **Blocked: there is no Operations service editor (Claude).** `apps/admin` has no service route and no
    catalogue feature — services are managed through Django admin and seeds. This item presupposes an editor
    that was never built, so it needs its own scoped task before it can be done.
- [x] Remove Unsplash/list-image constants and list-level image requests from the Customer catalogue/home service listing. Do not remove an unrelated marketing hero or a service-detail image merely because listings changed.
- [x] Avoid hydrating every static tile when a server-rendered grouped section is sufficient; do not regress focus order, deep links or back navigation.
- [x] Use the existing colors and fonts. Antigravity may add subtle 150–250 ms press, category-change and section-entry motion with `prefers-reduced-motion` support.
- [x] Add tests for full catalogue rendering, category order, optional search, keyboard/touch activation, unknown-icon fallback and absence of list-image requests.

**Done when:** a Customer can browse and open every service from a fast icon-and-name catalogue without searching or downloading service-card images.

### Owner revision — 2026-08-25 (Claude, on direct owner instruction)

The icon catalogue is now **the** services listing, not a side page. Owner verification pending.

- `/catalog` renders the M2 "Catalogue" artboard: "All services" app bar with search behind an icon, category chip rail, one uppercase-heading section per trade, flat 3-column icon-tile grid. The merchandised bento cards, their Unsplash images and their placeholder price copy are deleted from this route.
- Subcategories no longer print headings or require a drill-down; `CategoryGroup.services` pre-flattens each trade's run in backend display order. Category/service pages remain for deep links.
- Tiles route on the server's `request_archetypes` via the existing `serviceHref` (guided/quote services open the brief directly; A3 opens the crew form). The tiny index contract is unchanged — hrefs come from the already-cached per-category `ServiceCard` fan-out (`icon-catalogue/service-links.ts`).
- `/catalog/all` permanently redirects to `/catalog`.
- Note for Codex/Operations: whether a specific service (e.g. `plumber-full-bathroom-plumbing`, seeded A1 at ₹999) is quote-based is catalog data — give it an A5 variant to flip it; the frontend follows the server either way.

Second pass, same day:

- `seed_m2_demo` now publishes **six A5 projects**, not one: interior fit-out (unchanged slug), full-bathroom-renovation (its questions are the artboard's "What needs doing?" screen verbatim), full-home-painting, modular-kitchen-fit-out, full-home-rewiring, event-catering — each with its own subcategory, controlled icon key, area activation, ACTIVE M2 configuration and vendor capabilities. All questions are choice/number/boolean; no `TEXT` on any A5 variant. Data-only change; no migration.
- `/catalog/[category]` is a **variant rate card** now: every service in the trade with every variant under it — A1 rows print their starting price and open the service page, A3 rows print "Day rate" and open the crew form, A5 rows print "Priced on site" and open the brief (`features/catalog/variant-rows.ts` owns the mapping, with tests). The old hero band, trust pillars, `?trade=` chip filter and `WorkforceCatalog` component are deleted.
- Variants come from the existing `ServiceDetail` read fanned out per service (`getCategoryServiceDetails`), same cache tags as the service pages — no contract change. If a category grows past ~40 services, a bulk variants endpoint would be the next step.

## FE-10 — Razorpay sandbox checkout behavior

**Depends on:** BE-4, BE-7 and BE-9.

**Objective:** Make every milestone payment feel native on mobile while Django/webhooks remain authoritative.

- [ ] Reuse the existing provider handoff and dynamically loaded Razorpay Checkout; do not add a second payment SDK or place a secret in frontend `.env.local`.
- [ ] Open Checkout only from a fresh Django checkout attempt containing the provider order, exact amount/currency and publishable test key id.
- [ ] Disable repeat taps while creating/opening an attempt and reuse the same idempotency path after refresh or uncertain network failure.
- [ ] Treat the Razorpay browser success handler as `Processing payment`, never as paid. Show success only after Django observes and verifies the provider event/reconciliation result.
- [ ] Handle Checkout dismissal, script-load failure, payment failure, delayed webhook and already-processed callback with clear retry/recovery actions.
- [ ] Show a visible `Test payment` marker only in non-production sandbox environments so nobody mistakes sandbox money for a real collection.
- [ ] Apply the same flow to visit-plan checkout and every eligible installment checkout.
- [ ] Keep automated Playwright tests stubbed at the provider boundary; run the real Razorpay test-mode smoke separately in staging and record its result.

**Done when:** closing, retrying, refreshing or receiving duplicate callbacks cannot create a false paid state or a second charge, and the mobile checkout returns to the correct visit/installment status.

**Frontend verification Antigravity is authorized to run for this milestone:**

```powershell
cd frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

Run the relevant Vitest and Playwright suites for every changed Customer/Partner journey, then record the exact commands and results. Use the workspace's existing scripts; do not silently replace skipped browser coverage with unit tests.

---

# Integration order

1. [ ] Codex completes BE-1 through BE-4, BE-8 and BE-9, then publishes the visit, catalogue and checkout contract through BE-7.
2. [ ] Antigravity completes FE-1 through FE-5 and FE-9 against that contract.
3. [ ] Finance/legal records the BE-5A supplier/tax/fee decisions; Codex completes BE-5, BE-5A and BE-6, then publishes the estimate/installment contract through BE-7.
4. [ ] Antigravity completes FE-6 through FE-8 and FE-10.
5. [ ] Codex runs focused backend tests and `quality.cmd`; Antigravity runs focused frontend tests, relevant Playwright coverage, lint, typecheck and build.
6. [ ] Owner manually verifies the complete Customer/Partner journey using the recorded test results as evidence, not as a replacement for product acceptance.

## Manual acceptance journey

- [ ] Customer completes the three-step brief without seeing media/audio/details controls or a passive review screen.
- [ ] Customer can browse every published service as icon + name without searching or loading service-list images.
- [ ] Mobile screens use focused app bars, bottom-safe actions, touch-sized controls and concise infographic states; existing colors and fonts remain intact.
- [ ] Motion communicates selection/progress, works without hover and respects reduced-motion preferences.
- [ ] Customer selects two estimates and two visit times.
- [ ] Available Partners receive fixed-time offers; no Partner sees a slot picker.
- [ ] First acceptance wins; another Partner receives the taken-state response.
- [ ] One slot succeeds and one exhausts; the Customer changes only the failed slot.
- [ ] Customer pays after a real acceptance and the held visit becomes booked.
- [ ] Exact address appears to the accepted Partner only after payment.
- [ ] Arrival code, visit completion and no-show/recovery paths still work.
- [ ] Partner sends one Item-wise estimate and another sends one Labour-wise estimate.
- [ ] Partner can edit rates/quantities/named charges but cannot edit profit %, tax %, tax basis, V Solve Hub fee %, commission or receivable.
- [ ] Item-wise shows no zero Labour-wise subtotal and Labour-wise shows no zero Item-wise subtotal.
- [ ] Server preview, submitted estimate, Customer comparison, installment checkout, PDF and Partner receivable show identical named financial values.
- [ ] A registered and an unregistered Partner follow the approved tax policy; intra/inter-state and mixed line tax components reconcile exactly without a client-supplied rate.
- [ ] Both Partners define installments whose amounts reconcile with their totals.
- [ ] Customer compares both, selects one and funds only the first installment.
- [ ] Razorpay test Checkout dismissal changes no payment state; a signed sandbox capture books/funds once; duplicate callbacks remain idempotent.
- [ ] A partial refund reverses the original tax/fee allocation and produces the correct financial document without changing the old estimate snapshot.
- [ ] Focused Partner pages have no persistent navbar; top-level Partner pages still do.

## Revamp progress log — `M2-revamp` branch

**2026-08-25 — FE-1 + revamp decisions implemented (Claude).**

- Brief collapsed 4 screens → 2: `screens.ts` now `["what", "where_when"]`; `where_when`’s guard is the submit guard and re-asserts step 1.
- Deleted both skins of the details and review screens, the optional-detail panels/model, the voice recorder, the draft-attachment capture hook, and the orphaned A5 post-submit mocks (`visits/book-visits/estimates` screens, `estimate-card`, `slot-row`).
- New `OptionTiles` + `iconForOption` render every short choice and boolean as icon tiles; `lucide-react@^0.469.0` added to the customer app (same pin as partner/admin).
- Estimate-count chooser mounts on Where and when (phone slot + desktop section), defaults to the 2-pro tier when published; CTA reads “Send to N professionals”.
- `additional_details`, `language` capture and the optional extras removed from the draft state, reducer, sessionStorage shape and submit chain; the save/create query layer is untouched (A3 crew flow shares it, contract unchanged until BE-1).
- Boundary fix: `requirement-flow.tsx` no longer imports the generated client.
- Static gates run: `tsc --noEmit`, `eslint --max-warnings 0`, `next build` — all green. Test suites updated but NOT run (owner runs them).

**2026-08-25 — Codex audit of Claude's update.**

- Accepted the complete removal of requirement media/details and the infographic choice controls.
- Classified the current two-step flow and Review deletion as an interim implementation, because visit count plus up to three slots overloads Where and when.
- Restored a focused **Choose visits & send** decision screen as Step 3 without restoring the old passive Review.
- Added backend ownership of service icon metadata and a compact all-services operation so Antigravity does not maintain fragile name-based icon guesses or make one request per category.
- Narrowed service-image removal to listing surfaces, preserved existing fonts/colors and made mobile app behavior plus reduced-motion acceptance explicit.
- Recorded the owner's milestone-specific authorization for Codex and Antigravity to run backend and frontend tests.

**2026-08-25 — Codex tax, fee and Razorpay blind-spot audit.**

- The reference estimate images expose editable-looking Partner profit and V Solve Hub fee percentages, omit tax, and contain inconsistent `You will receive` arithmetic across categories. They remain visual references only.
- The current proposal input accepts caller-supplied `tax_basis`, `tax_paise` and `commission_treatment`; the first submitted proposal can also determine the comparison basis. BE-5A removes that authority from clients and the first Partner.
- Added line-level, versioned tax resolution; immutable calculation snapshots; explicit fee/commission/withholding separation; controlled other charges; financial documents; amendment/refund allocation; and installment reconciliation.
- The existing Razorpay Orders/Payments/Refunds adapter, webhook, Checkout handoff, reconciliation and `requests` dependency are sufficient. BE-9/FE-10 add secure sandbox configuration and smoke coverage rather than another SDK.
- The Razorpay test credential disclosed in chat must be rotated before use. No credential value was copied into repository files.

**2026-08-25 — Codex BE-8 catalogue backend and Antigravity contract handoff.**

- Added the backend-owned `Service.icon_key` vocabulary, database constraint, data migration and explicit Technician/Beautician/Home/Pet/M2 seed mappings. Unknown future service types use the visible `service` generic key; arbitrary or null values cannot be stored.
- Published `GET /api/v1/services/` as `catalog_service_index`: one public cacheable response ordered by Operations-managed category/subcategory/service order with deterministic tie-breakers. Compact rows contain identity/order/icon fields only and no image, price, question or policy payload.
- Added `icon_key` to existing service cards/details without removing their media or commercial fields.
- Published and validated OpenAPI **1.43.0**. Antigravity consumes `catalog_service_index` and maps `IconKeyEnum` exhaustively; it does not derive icons from service-name keywords and does not hand-edit generated client files.
- Changed-surface regression command: **6 passed in 111.23s**. Static quality: Ruff format/lint, strict MyPy (380 source files), migration check, schema validation and contract-drift check all passed.
- Full `backend\\scripts\\quality.cmd`: **972 passed, 173 failed, 1 error, 3 deselected in 2257.98s**; coverage stopped at 66%. The catalogue tests passed. The existing red baseline spans booking-window fixtures, unavailable storage/presence test providers, stale response expectations, a missing `world` fixture and unrelated workflow/money-format tests; do not report the full backend suite as green.

**2026-08-25 — Codex customer-slot, estimate and installment backend.**

- Customer-signed visit windows now store one immutable requested time per plan share. Fixed-time
  offers broadcast only to Partners available for the complete visit and turnaround; first accept
  wins atomically, later accepts receive `slot_taken`, and exhausted slots become
  `NO_PROFESSIONAL_FOUND` without creating a payment attempt.
- Unpaid hold expiry now releases the shared reservation and capacity hold and opens a new dispatch
  wave. Requirement capture upload routes and the initial Partner slot-picker route were removed
  from the published contract; historical attachments and stage evidence remain stored/readable.
- Added Operations-activated commercial policies with approval references, canonical Partner tax
  verification, Item-wise/Labour-wise estimates, controlled charges, mixed tax categories,
  deterministic installment allocations and immutable financial snapshots.
- Published OpenAPI **1.44.0**, including Customer visit-slot operations, fixed Partner offer fields,
  estimate preview/submit shapes, Operations policy/tax-profile operations and named domain errors.
- Final combined backend regression command: **82 passed in 53.22s**, covering Customer slots,
  matching/proposals, estimate money, payment capture/refund behavior and schema. Static gates
  passed for 383 source files. The full historical suite remains a separate red-baseline cleanup;
  obsolete pre-revamp A5 fixtures still create project requests without Customer-selected slots.
- External gates remain intentionally open: Finance/legal must approve the supplier/fee/commission/
  withholding policy and document model; the disclosed Razorpay test secret must be rotated, the
  replacement credentials/webhook configured in staging, and the real sandbox smoke recorded.

**2026-08-26 — Claude (owner-directed): category re-file + item/labour estimate wiring. Owner verification pending.**

- **"Workforce and projects" is retired as a customer-facing category.** Every M2 service is
  re-filed under a trade category the customer understands; placement is merchandising only —
  archetypes, dispatch skills and the brief flow are untouched. Mapping:
  `full-bathroom-renovation` → Plumber, `full-home-rewiring` → Electrician,
  `modular-kitchen-fit-out` → Technician, `full-home-painting` → Home Services,
  `construction-helpers` + `interior-fit-out-project` → new **Construction** category,
  `event-catering` → new **Events** category. `seed_m2_demo` now files services this way
  (`M2_CATEGORY_SEEDS`), and data migration `catalog.0015_refile_workforce_projects_services`
  re-points existing rows and deactivates the legacy category (never deletes).
- **Partner: the item-wise/labour-wise composer is mounted.** The estimate route now offers
  "Quick tap estimate" (default, unchanged) or "Detailed line items", which mounts the previously
  unmounted `CommercialEstimateComposer` via a new `CommercialEstimateFlow` wrapper carrying the
  same guards as the tap flow (completed-visit refusal, closed-window dialog, idempotent
  supersession) plus autosave clearing on success.
- **Customer: the quote card now shows the full breakdown.** `item_lines`, `labour_lines` and
  `other_charges` (on the wire since 1.44.0, previously dropped by the adapter) render inside
  "Read the full scope", and the comparison table gains a "How it is priced" row derived from the
  arrays, never the defaulted flag.
- Hygiene: `/catalog/workforce-and-projects` fallback link now points at `/catalog`; site-header
  gets its missing React import; `/cart`,`/checkout`,`/book` are owned by the Services nav target;
  `site-nav.test.ts` updated to the 2-target reality; stale step-count docblocks corrected.
- Gates: backend `quality-static` (ruff format/lint, strict mypy, migration check, schema +
  contract-drift) **passed**. Frontend typecheck/lint per below. **No tests were executed** per
  the verification convention — new/updated tests are written for the owner to run:
  `comparison.test.ts`, `quote-card.test.tsx`, `site-nav.test.ts`.
- Owner verification steps: run `python manage.py migrate` and re-run
  `seed_m2_demo --i-understand-this-is-dev-only`; browse `/catalog` (no Workforce & Projects
  section, projects under trades); submit a detailed item-wise and a labour-wise estimate as a
  partner; read both on the customer quotes screen; run the frontend and backend test suites.

**2026-08-26 — Claude (owner-directed): UC-style tile catalog, image fields, A1+A3+A5 in every category. Owner verification pending.**

- **DB (catalog 0016):** `Category.image_url`, `Subcategory.icon_key` + `image_url`,
  `ServiceVariant.image_url`; services keep `ServiceMedia` COVER as their photo channel.
  Contract bumped to **1.45.0** (subcategory tiles now publish icon/image/`service_count`;
  variant serializers publish `image_url`); OpenAPI + TS client regenerated.
- **Tiles are subcategories.** `seed_task_catalog` splits the flat trades into browse tiles —
  electrician → 7 (Switch & socket, Fans, Lights, MCB fuse & inverter, Motors & pumps,
  Doorbell & security, Power problems), plumber → 5, AC → 3 — with `TradeSeed.skill_code`
  keeping dispatch on the TRADE (`required_skill_code` unchanged), cart same-partner pairing
  regrouped by skill (was subcategory — would have broken cross-tile merges), and the six M1
  services re-filed through the shared `TILE_FOR_M1_SERVICE` map both commands read.
- **Every category now sells all three models.** `seed_m2_demo` adds A5 quote services across
  the catalogue (consultations for electrician/plumber, custom furniture, central AC & ducting,
  bridal & event makeup, demolition, tiling & flooring, waterproofing, event lighting & decor)
  and A3 day-hire (`electrician/plumber/painter/event-staff-by-the-day`) — each A3 with its own
  skill row, wage floor, rate card (all dev-seed-marked inventions) and configuration; demo
  vendors hold every capability.
- **Images are real and verified.** `apps/catalog/seed_images.py` is the one pool both seed
  commands read: every URL extracted from live Unsplash search pages by alt text, all 155
  HEAD-checked, sample visually confirmed; premium (watermarking) URLs excluded. Never invent a
  photo id — the module docstring carries the rule.
- **Customer UI:** `/catalog/[category]` is the "Select a service" photo-tile grid;
  `?tile=<slug>` shows that tile's services as image cards with honest price lines ("Starts at
  ₹X" / "Free quote after a site visit" / "Booked by the day"); a one-service tile (Book a
  consultation) taps straight into its flow. Hybrid services (fixed price + quote) now route to
  the service page, which offers both CTAs — previously the fixed price was unreachable. Home
  page category tiles (desktop + mobile) are API-driven with `image_url`; the 3-slug hardcode
  is gone.
- Gates: backend quality-static (ruff/mypy strict/migration check/schema + contract drift)
  and frontend typecheck + eslint all green. **No tests executed** per the verification
  convention.
- Owner verification: `python manage.py migrate`, then re-run `seed_technician_catalog`,
  `seed_task_catalog`, `seed_m2_demo --i-understand-this-is-dev-only`; browse home → category →
  tile → service on mobile width; book a fixed task, a consultation, and a day-hire; check the
  partner side still receives dispatch for re-tiled A1 services (skill codes unchanged).
- Known follow-ups: per-variant photos are seeded blank (field exists; UI falls back to the
  service cover); `CategoryVariantList` is unmounted but kept; `/catalog` flat index still
  icon-based by design.

## Out of scope

- Mixed Item-wise + Labour-wise estimates.
- Customer-defined or Customer-edited installment schedules.
- Paying several installments in one checkout.
- Credit, EMI/BNPL or lending products; “installments” here means staged project payments.
- Partner-editable tax rates/basis, platform-fee percentages, commission treatment or a separate profit/markup percentage.
- Hidden discounts, tips, arbitrary round-off rows or negative `Other charge` lines; a future discount feature needs an explicit audited money line.
- Guessing GST/TCS/TDS, supplier-of-record or invoice policy in code before Finance/legal approval.
- Using Razorpay test collections credentials for RazorpayX payouts.
- New microservices, WebSocket infrastructure or a second payment ledger.
- A new frontend color palette or redesign of unrelated screens.
- A new font family or typography rebrand.
- Image-heavy service-card listings or search-only service discovery.
- Deleting historical requirement attachments or shared stage/dispute evidence infrastructure.
