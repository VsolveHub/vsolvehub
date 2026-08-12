# M2 Acceptance and Cutover

**Purpose:** Joint backend/frontend proof required before an M2 launch category is enabled
**Status:** Not started
**Revision:** 3 - visit-first A5 per [ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md);
section D is split by archetype and section D5 (visits) is new. Revision 2 simplifications remain.

These are business outcomes, not only UI tests. Execute them against the same integrated environment
with real database constraints, asynchronous workers and payment-provider **test** callbacks.

## Acceptance evidence rules

- [ ] Record scenario date, environment, build/commit IDs, actors, result and evidence link.
- [ ] Verify Customer, Partner and Operations views agree after refresh and a new login session.
- [ ] Verify audit event, notification, ledger effect and background recovery where relevant.
- [ ] Repeat retry/concurrency scenarios rather than simulating the expected final state manually.
- [ ] A scenario is failed if Operations must edit the database to recover it.
- [ ] Redact phone, address, crew identity, KYC, clarification content and payment details from stored
  evidence.
- [ ] No scenario may depend on a live payment provider or live OTP. Money is proved with provider test
  callbacks and arrival is proved with the non-OTP fallback, per the M2/M3 activation boundary.

## A - Registration and capability

- [ ] `M2-AC-001` An individual task Partner logs in and sees the existing M1 workflow, not M2 leads.
- [ ] `M2-AC-002` A brand-new Partner reaches masked live requirement summaries after phone, name, one
  service and one city, without completing KYC.
- [ ] `M2-AC-003` That Partner is blocked from accepting an enquiry until KYC is complete, from a payout
  until bank details exist, and from a crew assignment until the roster exists - each with an in-context
  explanation.
- [ ] `M2-AC-004` A workforce agency completes registration including the insurance and liability
  declaration, adds crew and receives A3 approval.
- [ ] `M2-AC-005` A project vendor receives A5 approval and sees project quote/work modules only.
- [ ] `M2-AC-006` A multi-capability Partner uses an explicit workspace switcher and sees separated task,
  workforce and project states with correctly labelled global summaries.
- [ ] `M2-AC-007` Missing/expired documents block only the affected capability with a clear recovery path.
- [ ] `M2-AC-008` Suspension during an active session blocks new actions but preserves readable history.
- [ ] `M2-AC-009` Suspending a capability that has a funded engagement routes that engagement to
  replacement or refund instead of stranding the money.
- [ ] `M2-AC-010` A Partner cannot read another Partner's crew, invitation, proposal or money record by ID.
- [ ] `M2-AC-011` Selecting a skill without an approved lifecycle capability does not add navigation or
  permit a protected action.
- [ ] `M2-AC-012` An unknown workspace key renders nothing and never falls back to generic Jobs.
- [ ] `M2-AC-013` The same physical crew member registered under two agencies cannot be assigned to both
  on the same day.
- [ ] `M2-AC-014` Two Partner accounts sharing a phone, PAN or bank account are treated as one cluster
  for quote-slot purposes.

## B - Requirement (free) and matching entry

- [ ] `M2-AC-101` Customer submits a structured A3 request with shifts, roles, location and media in four
  screens and is charged nothing.
- [ ] `M2-AC-102` Customer submits an A5 request with deliverables, budget, dates and a voice note and is
  charged nothing.
- [ ] `M2-AC-103` The requirement's lifecycle is inferred from the answers, shown in plain language, and
  is not derived from the category name.
- [ ] `M2-AC-104` Operations reclassifies an ambiguous A3/A5 requirement; invitations are voided, any
  unlock or visit-plan value is preserved (unfilled shares refunded or converted) and matching
  restarts with no second charge.
- [ ] `M2-AC-105` Unsafe type, oversized upload and malware-scan failure do not submit the requirement.
- [ ] `M2-AC-106` Draft survives refresh/login and a failed upload can resume without duplicate media.
- [ ] `M2-AC-107` A second requirement matching an open one on Customer, address, date and category is
  flagged as a probable duplicate and offers a merge.
- [ ] `M2-AC-108` A voice note in a language the vendor pool does not cover is routed rather than
  silently failing to match.
- [ ] `M2-AC-109` The `service_by` date passes while matching runs; matching closes, the Customer is told
  why, and any unlock or unconsumed visit-plan value is refunded in full.
- [ ] `M2-AC-110` The quote-delivery SLA is breached with nothing charged; the requirement closes with an
  explanation and a support path.
- [ ] `M2-AC-111` A material requirement edit after vendor acceptance notifies vendors, resets their
  deadlines, pauses the delivery clock and permits penalty-free withdrawal.
- [ ] `M2-AC-112` Deadlines computed across a night, a weekend and a public holiday expire at the correct
  business-hours moment, not at 2am.

## C - Matching, clarification and quotes

- [ ] `M2-AC-201` Only vendors matching lifecycle, capability, area, travel feasibility, language,
  schedule, capacity and recent responsiveness are invited.
- [ ] `M2-AC-202` A vendor dormant for the configured period is not invited.
- [ ] `M2-AC-203` Accepting an invitation takes a soft capacity hold; a vendor cannot accept more
  same-date work than it can staff.
- [ ] `M2-AC-204` Concurrent vendor acceptance cannot exceed the available quote slots or vendor capacity.
- [ ] `M2-AC-205` Each invitation stores an immutable snapshot of exactly what that vendor saw.
- [ ] `M2-AC-206` Vendor decline or deadline expiry releases the slot and invites a replacement.
- [ ] `M2-AC-207` Vendor suspension after invite prevents proposal submission and triggers replacement.
- [ ] `M2-AC-208` Customer and vendor clarify through structured question and answer without premature
  phone exposure, and both entries appear on the shared timeline.
- [ ] `M2-AC-209` A paid site visit is scheduled, rescheduled and cancelled with both sides informed and
  the fee correctly adjusted against the final price.
- [ ] `M2-AC-210` A Customer who goes silent after a paid site visit leaves the vendor compensated.
- [ ] `M2-AC-211` A heuristic contact-sharing signal opens review but does not auto-ban either party.
- [ ] `M2-AC-212` A vendor supersedes a quote; both remain visible and only the latest is selectable.
- [ ] `M2-AC-213` One Partner - and one identity cluster - cannot fill more than one slot for the same
  requirement.
- [ ] `M2-AC-214` An A3 rate below the applicable minimum-wage floor is rejected at submission with a
  clear reason.
- [ ] `M2-AC-215` Competing proposals are quoted on a single tax basis and each displays its commission
  treatment.
- [ ] `M2-AC-216` Quotes clustered abnormally tightly, or far outside the reference band, raise a review
  signal without an automatic penalty.
- [ ] `M2-AC-217` A non-selected vendor loses access to the Customer's site attachments when the
  invitation closes.
- [ ] `M2-AC-218` Operations captures an assisted A3 quote by phone; it is attributed to the Partner, the
  Partner confirms it, and only then is it visible to the Customer.

## D - Access and selection (D1–D4 A3 unlock · D5 A5 visits)

A3 unlock scenarios (unchanged from revision 2):

- [ ] `M2-AC-301` Before unlocking, the Customer sees only verification, rating, vendor type and a price
  band - no scope, identity or contact.
- [ ] `M2-AC-302` The unlock is not offered while no usable quote exists.
- [ ] `M2-AC-303` INR 149 payment grants exactly one unlock covering up to three delivered quotes.
- [ ] `M2-AC-304` UPI pending remains pending after browser return; only verified success grants the unlock.
- [ ] `M2-AC-305` Duplicate click, callback and refresh create one payment and one unlock.
- [ ] `M2-AC-306` Late payment success after browser close completes the unlock and notifies the Customer.
- [ ] `M2-AC-307` An out-of-budget quote or estimate is labelled as such rather than presented as an
  ordinary option.
- [ ] `M2-AC-308` The Customer rejects a quote or estimate as non-responsive; the slot is released and a
  replacement (A3: quote slot; A5: free replacement visit) is invited at no extra charge, and the
  configured cap is enforced.
- [ ] `M2-AC-309` Customer selects quote A and the vendor reconfirms; the exact proposal is locked.
- [ ] `M2-AC-310` The selected vendor rejects or expires; the unlock or plan entitlement stays valid and
  the Customer can use another quote/estimate or a free replacement.
- [ ] `M2-AC-311` Every vendor is exhausted; the Customer receives a free rematch or a refund of the
  unlock / unconsumed plan value.
- [ ] `M2-AC-312` A quote or estimate whose validity expired offers one-tap re-validation reusing the
  existing unlock or plan, never a second purchase.
- [ ] `M2-AC-313` Two browser sessions attempt different selections; only one active selection succeeds.
- [ ] `M2-AC-314` Vendor availability changes before reconfirmation; the engagement is not falsely confirmed.
- [ ] `M2-AC-315` Capability suspension one minute after a successful payment routes the engagement to
  replacement or refund.
- [ ] `M2-AC-316` An A3 engagement clearly records direct vendor payment and limited platform protection,
  and is never presented as a protected booking.
- [ ] `M2-AC-317` An A5 engagement cannot start before its first stage is verifiably funded.
- [ ] `M2-AC-318` Client amount tampering is rejected and server totals remain authoritative.
- [ ] `M2-AC-319` A late stage-payment success produces one engagement payment and one receipt.
- [ ] `M2-AC-320` A Customer completes an A3 journey having made exactly one platform payment (the
  unlock), and an A5 journey having made exactly two before work starts (the visit plan, the first
  stage).

D5 — A5 visit plan (revision 3):

- [ ] `M2-AC-321` An A5 requirement cannot submit without a chosen visit plan, and the plan chooser
  never renders on an A3 requirement.
- [ ] `M2-AC-322` Choosing a plan charges nothing; the charge fires only on the verified provider
  callback after the first vendor holds a visit slot, and the booking hardens to `SCHEDULED` only then.
- [ ] `M2-AC-323` Duplicate webhooks, browser retries and late success charge exactly one plan; later
  vendors book slots with no further payment.
- [ ] `M2-AC-324` A visit slot books against the shared availability grid: a vendor with an A1 booking
  in that slot cannot confirm it, and a confirmed visit blocks a conflicting A1 booking.
- [ ] `M2-AC-325` The slot hold expires when the Customer never completes the plan checkout, releasing
  the vendor's calendar with nothing charged and nothing owed.
- [ ] `M2-AC-326` Vendor identity (name, photo, verification) is disclosed at slot confirmation and not
  before; contact stays masked until the engagement.
- [ ] `M2-AC-327` A plan bought for three vendors where only two ever confirm refunds the third share
  automatically at the visit SLA, in exact paise, without a support ticket.
- [ ] `M2-AC-328` A vendor no-show refunds or replaces that share, records against vendor standing, and
  never blocks the other visits.
- [ ] `M2-AC-329` A customer no-show disposes of the committed share per the configured policy and both
  parties see the same recorded outcome.
- [ ] `M2-AC-330` Visit arrival is confirmed through the non-OTP fallback and is auditable; no scenario
  depends on a live OTP.
- [ ] `M2-AC-331` An estimate cannot be submitted against a missing, scheduled or cancelled visit
  (`m2_visit_not_completed`); one submitted against a completed visit is readable by the Customer in
  full with no paywall state anywhere in the A5 journey.
- [ ] `M2-AC-332` A completed visit with no estimate inside the post-visit window refunds or replaces
  the share and hits vendor standing.
- [ ] `M2-AC-333` Visit money reconciles exactly: plan charge = Σ vendor visit payouts + Σ platform
  shares + Σ refunds, in integer paise. A vendor payout becomes eligible only after a completed
  visit with a usable estimate, moves through the M1 payout rails with test callbacks, and is gated
  on the vendor's payout details. A refunded share pays neither party.
- [ ] `M2-AC-334` Reclassifying a requirement with a charged plan preserves the money: unfilled shares
  refund or convert, completed-visit shares stay earned, and no second charge occurs.
- [ ] `M2-AC-335` The plan checkout, visit tracker and estimate list agree after refresh and a new
  login session, and the Partner's slot confirmation screen shows the same slot the Customer sees.

## E - Engagement spine

- [ ] `M2-AC-401` An A3 shift-day and an A5 milestone run through the same stage commands with the same
  evidence, approval, dispute and release semantics.
- [ ] `M2-AC-402` An A3 time extension and an A5 change order both execute through the M1 scope-amendment
  engine, with no second amendment subsystem present.
- [ ] `M2-AC-403` Stage amounts always reconcile to the engagement total; funded, approved, paid and
  refunded amounts cannot exceed their legal bounds.
- [ ] `M2-AC-404` No scope, amount or completion state can be changed through clarification, a callback
  or a unilateral UI action.

## F - Workforce fulfilment

- [ ] `M2-AC-501` Vendor assigns the agreed number of eligible, non-conflicting crew members per shift-day.
- [ ] `M2-AC-502` A multi-day engagement legitimately rotates crew across days without amending the
  agreement.
- [ ] `M2-AC-503` Last-minute crew replacement follows Customer notification/approval policy.
- [ ] `M2-AC-504` Arrival is confirmed through the non-OTP fallback path and is auditable.
- [ ] `M2-AC-505` The supervisor confirms "n of m present" and the Customer confirms in one tap; full
  attendance across all shift-days releases the correct payout after the window.
- [ ] `M2-AC-506` One worker is absent; the Customer disputes in one tap, per-worker detail is captured
  only inside the dispute, and remedy and settlement are correct.
- [ ] `M2-AC-507` The entire crew no-shows; the Customer receives support and a policy-based remedy.
- [ ] `M2-AC-508` Crew never checks out; settlement defaults to the agreed shift length, flagged, and is
  disputed only if the Customer disputes.
- [ ] `M2-AC-509` Overtime worked without prior approval is unpaid unless confirmed inside the retroactive
  window, and the vendor terms stated this before the shift.
- [ ] `M2-AC-510` Approved overtime executes as a scope amendment.
- [ ] `M2-AC-511` The Customer is unavailable or the site is unsafe; evidence prevents an automatic blame
  decision.
- [ ] `M2-AC-512` A worker injury on site creates a safety-incident record with evidence and escalation,
  not a cancellation reason.
- [ ] `M2-AC-513` Conflicting attendance claims open a case and hold settlement.

## G - Project fulfilment

- [ ] `M2-AC-601` A funded stage starts and the vendor submits evidence for review.
- [ ] `M2-AC-602` Customer approval releases only the approved stage amount after the dispute window.
- [ ] `M2-AC-603` Customer disputes evidence; payout holds and both parties receive deadlines.
- [ ] `M2-AC-604` Review timeout follows approved policy but never overrides an active dispute.
- [ ] `M2-AC-605` Added scope is proposed as a scope amendment, accepted and funded before work proceeds.
- [ ] `M2-AC-606` Customer rejects an amendment; the original agreement remains unchanged.
- [ ] `M2-AC-607` Reduced scope creates the correct refund adjustment and immutable agreement history.
- [ ] `M2-AC-608` A material advance is recovered under its own rule when the project ends early, not as
  an unearned work stage.
- [ ] `M2-AC-609` A vendor abandons mid-project; remaining stages transfer to a replacement vendor at the
  replacement's price and the difference is funded or refunded.
- [ ] `M2-AC-610` A vendor blocked by an unvacated site raises a delay claim and receives a schedule
  extension rather than a penalty.
- [ ] `M2-AC-611` Warranty retention is held back from the final stage and released at warranty close; a
  variant without funded retention does not advertise warranty.
- [ ] `M2-AC-612` An Event and Media deliverable is handed over and accepted on the platform.
- [ ] `M2-AC-613` A warranty issue submitted within the window routes to the correct workflow.

## H - Cancellation, offline leakage and money

- [ ] `M2-AC-701` Cancellation before vendor contact follows the low-risk policy and notifications.
- [ ] `M2-AC-702` Partner marks cancelled after talking to the Customer; the Customer must confirm or
  dispute it.
- [ ] `M2-AC-703` Customer reports that work and cash payment occurred while the Partner claims
  cancellation; payout/refund does not auto-resolve and Operations receives evidence review.
- [ ] `M2-AC-704` In an A3 connection both parties transact directly; Vsolve retains only the earned
  unlock fee and does not promise managed protection.
- [ ] `M2-AC-705` An A5 Partner requests off-platform payment; the Customer can report it and Operations
  can review without exposing the reporter unnecessarily.
- [ ] `M2-AC-706` Partner claims the Customer forced offline payment; the same neutral evidence process
  applies.
- [ ] `M2-AC-707` Customer falsely claims non-delivery after verified fulfilment; payout holds only under
  the approved case policy and both parties can respond.
- [ ] `M2-AC-708` Duplicate refund test callbacks do not duplicate ledger credit.
- [ ] `M2-AC-709` Refund provider failure stays pending/retryable and does not display completed.
- [ ] `M2-AC-710` A chargeback on the unlock or visit-plan fee itself is handled through the standard
  dispute path and raises the rate alert.
- [ ] `M2-AC-711` A chargeback or reversed payment after payout freezes unsafe settlement and reaches
  reconciliation.
- [ ] `M2-AC-712` Unlock fee, visit-plan fee (and its per-slot shares), site-visit fee, stage funding,
  material advance, refund, commission and payout reconcile independently.

## I - Operations and resilience

- [ ] `M2-AC-801` Operations finds any request by safe identifiers and sees one chronological timeline.
- [ ] `M2-AC-802` Assisted clarification and assisted quote capture record consent and the named
  Customer/Partner actor.
- [ ] `M2-AC-803` Unauthorized Operations roles cannot refund, disclose contact, reclassify or release
  payout.
- [ ] `M2-AC-804` A privileged action requires a reason and creates an immutable audit event.
- [ ] `M2-AC-805` Notification outage retries without rolling back a committed business command, and the
  escalation ladder reaches the vendor by another channel before a deadline lapses.
- [ ] `M2-AC-806` Payment, storage, calling, transcription or scanning timeout enters an explicit
  recoverable state.
- [ ] `M2-AC-807` Worker restart reprocesses outbox work without duplicate invitations, refunds or payouts.
- [ ] `M2-AC-808` Every dashboard queue has an owner, threshold and alert for breached deadlines.
- [ ] `M2-AC-809` Turning a category flag off blocks new unlocks and new visit-plan charges while
  leaving in-flight requirements, booked visits and funded stages reachable and refundable.
- [ ] `M2-AC-810` Operations touches per request are measured and fall within the approved unit economics
  model.

## J - Experience and accessibility

- [ ] `M2-AC-901` Critical Customer and Partner journeys work at 360px width without hidden actions.
- [ ] `M2-AC-902` The Customer requirement completes in four screens and the A3 enquiry response in one.
- [ ] `M2-AC-903` Every form and dialog completes using keyboard only with visible focus.
- [ ] `M2-AC-904` Upload, validation, payment pending and state-change results are announced accessibly.
- [ ] `M2-AC-905` Quote comparison remains understandable with long descriptions and two distinct scopes.
- [ ] `M2-AC-906` Slow network and duplicate taps do not produce duplicate commercial actions.
- [ ] `M2-AC-907` Customer-facing language distinguishes request, quote, unlock (A3), visit plan,
  visit, estimate (A5), selection, booking and completion, and never calls an A3 connection a
  protected booking.
- [ ] `M2-AC-908` Currency, dates, time zone, phone and address presentation are appropriate for India.

## Controlled cutover

### Before rollout

- [ ] Freeze launch category, city/service areas, lifecycle, quote-delivery SLA (A3), visit-delivery
  SLA and post-visit estimate window (A5).
- [ ] Freeze the visit-plan tier prices and the per-slot split: vendor visit payout versus Vsolve
  platform share.
- [ ] Verify enough approved supply exists before exposing the category.
- [ ] Confirm the minimum-wage floor table is populated for the launch states and skills.
- [ ] Confirm the insurance and liability position is published in the Partner terms.
- [ ] Run migrations, backfills and reconciliation in staging using production-like volume.
- [ ] Test rollback and confirm M1 flows remain unaffected when M2 flags are off.
- [ ] Train Operations on request recovery, reclassification, refund, payout hold, safety incidents and
  leakage review.
- [ ] Publish Customer and Partner terms, unlock-fee explanation, cancellation policy and support path.
- [ ] Activate dashboards, alerts, on-call ownership and external-adapter runbooks.
- [ ] Record baselines and targets for every success measure in `README.md`.

### Rollout stages

- [ ] Internal actors only: validate end-to-end data, money and support operations.
- [ ] Selected Partners and invited Customers in one service area with hard volume limits.
- [ ] One A3 category limited rollout after BE5A/FE5A acceptance passes.
- [ ] One A5 category limited rollout after BE5B/FE5B acceptance passes.
- [ ] Expand only when quote fill rate, unlock conversion, cancellation, dispute and refund thresholds
  remain healthy and Operations touches per request stay within the unit economics model.

### Stop conditions

Pause new M2 unlocks and visit-plan charges while preserving existing work when any approved
threshold is breached for:

- payment, refund, ledger or payout reconciliation mismatch;
- quote-delivery (A3) or visit-delivery (A5) SLA breach rate;
- unlock or visit-plan refund rate;
- vendor visit no-show rate or visit-to-estimate conversion;
- unauthorized data exposure or unsafe contact disclosure;
- repeated vendor no-show, Customer harm or any unhandled safety incident;
- Operations backlog beyond the promised response window, or touches per request beyond the model;
- a critical dependency outage without a tested recovery path.

## Launch sign-off

| Area | Owner | Result | Evidence | Date |
|---|---|---|---|---|
| Product policy | Product | Pending | - | - |
| Backend | Codex | Pending | - | - |
| Customer frontend | Claude | Pending | - | - |
| Partner frontend | Claude | Pending | - | - |
| Operations frontend | Claude | Pending | - | - |
| Finance reconciliation | Product/Operations | Pending | - | - |
| Legal: labour, insurance, tax | Product/Legal | Pending | - | - |
| Security and privacy | Engineering/Product | Pending | - | - |
| Release decision | Product/Engineering/Operations | Pending | - | - |
