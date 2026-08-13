# 8. M2 visit-first estimation and tiered visit plans for A5

- Status: Accepted, with two amendments.
  1. This record's statements that A3 is unchanged (quote-first through the INR 149 unlock) are
     superseded by ADR-0009 — A3 is now rate-card-first with the quote flow as fallback.
  2. **This record's visit-fee-credit statements are superseded by the owner's 2026-08-13 visit-money
     decision.** Where the Decision and Consequences sections below speak of "the visit-fee credit"
     — how much of the plan price adjusts against the first funded stage of the chosen vendor — that
     mechanism does not exist. Each per-slot share instead splits into a **vendor visit payout** (paid
     through the M1 payout rails when that vendor's visit is `COMPLETED` and a usable estimate lands
     in the post-visit window) and a **Vsolve platform share**; undelivered shares refund the Customer
     whole. **Stages fund at face value and there is no stage credit** — the plan money is spent on
     the visits themselves.
     [`07-state-machines-and-permissions.md`](../../Django_Next.js_Plan/M2/07-state-machines-and-permissions.md)
     §4a is authoritative for the visit money.
  The visit-first decision itself — free requirement, tiered plan, charge at the first confirmed
  slot, on-site estimates, no second paywall — is unchanged. The body below is left as written; an
  ADR is a record of a decision at a date, not a living document.
- Date: 2026-08-12
- Amended: 2026-08-13 (visit money), 2026-08-13 (ADR-0009 supersedes the A3 statements)

## Context

ADR-0007 set the M2 commercial model to fee-after-value: a free requirement, remote vendor
quotations, and a single INR 149 unlock charged only once a usable quote exists. That model assumes a
vendor can produce a usable quote remotely, from structured answers, attachments and clarification.

The owner reviewed the flow on 12 August 2026 against the customers M2 actually serves. An A5
customer — "wire my 1 BHK" — does not know how many switches they need, how many working days the job
takes, or what the material list looks like. Every question schema in the world cannot extract scope
the customer does not possess. For that work a remote quote is either a guess wide enough to be
useless or a placeholder that wastes a quote slot, and the honest unit of value is a professional
standing in the room producing an estimate: price, working days, materials.

Three further facts shaped the decision:

1. The platform already owns the machinery a visit-first flow needs. `SiteVisit` exists as a paid,
   scheduled visit whose fee adjusts against the final price (`SIM-08`); the A5 proposal composer
   exists; and M1 already ships a slot-booking engine — `carts.availability` resolves a whole
   capacity grid for an area and skill set, and the customer checkout has a working per-visit slot
   picker (`features/checkout/view/slots-modal.tsx`, `preferred_starts` since contract 1.18.0).
2. P4 — teasers, unlock, selection — has no domain layer and no published path. The front door can
   change now at documentation cost, not rework cost.
3. The original pay-before-matching model was rejected by audit for a reason that still holds:
   charging against hope creates paid-but-nothing-happened states, partial-fulfilment refunds and a
   preflight gate. Any visit-first model must keep the one property revision 2 bought — money is
   charged only against a real, accepted commitment.

## Decision

A5 (`A5_CUSTOM_PROJECT`) becomes **visit-first**. The A3 flow is unchanged: remote one-screen quotes,
teasers, and the INR 149 unlock exactly as ADR-0007 defined. The mode-per-archetype rule and the
engagement spine from ADR-0007 remain in force untouched.

For an A5 requirement:

The requirement stays free to submit. On the review screen, an A5 customer chooses a **visit plan** —
how many verified professionals will visit and estimate on site: one, two or three vendors, at
tiered prices (proposed INR 49 / 99 / 199; final values are an owner configuration). Choosing a plan
charges nothing; it bounds the invitation wave.

Matching invites vendors as built. A vendor who accepts commits to a **visit slot**, booked against
the same availability grid the A1 technician flow uses (`carts.availability`), through the same slot
picker pattern the checkout already ships. **The plan is charged once, when the first vendor confirms
a visit slot** — never at request time. Each plan slot that is never filled within the visit SLA
auto-refunds its per-slot share through the M1 `Refund` lifecycle. If no vendor ever confirms,
nothing was charged.

On the visit day, arrival is confirmed through the non-OTP fallback in M2 and the start OTP when M3
activates it — the same activation boundary every other arrival flow already honours. The vendor then
submits the estimate **on site through the existing A5 proposal composer**, prefilled from the
requirement and the visit: price, working days as the schedule, material line items. An estimate is a
`Proposal` in the existing append-only state machine; an A5 proposal requires a completed visit.

Estimates from visited vendors are **fully readable without any further charge**. The visit plan is
the access fee; there is no second paywall and no teaser state for A5. Selection, vendor
reconfirmation, engagement creation and staged funding proceed exactly as ADR-0007 defined, and the
visit-fee credit — how much of the plan price adjusts against the first funded stage of the chosen
vendor — is an owner configuration read fail-closed, reusing the `SiteVisit.adjusts_against_final_price`
semantics.

`QuoteUnlock` remains the A3 aggregate. A new `VisitPlan` aggregate carries the A5 plan: size, price,
charge state, per-slot shares and refund state, with each `SiteVisit` under it occupying one slot.

## Consequences

The customer pays against a confirmed visit, not against hope — the revision 2 property survives with
the noun changed. "Paid but nobody came" cannot occur at plan level because the charge fires on the
first confirmed slot, and cannot silently occur at slot level because unfilled shares auto-refund on
the visit SLA. The refund matrix gains visit rows (vendor no-show, customer no-show, unfilled slots,
estimate never submitted) and loses nothing from A3.

The platform buys physical vendor visits at INR 49–199 for up to three vendors. The per-visit revenue
is below any plausible travel cost, so vendor compensation for losing visits is an explicit owner
decision: either the fee is platform revenue and the vendor's incentive is the win probability plus
the fee credit, or a share passes through per visit. This is the `GAP-033` unit-economics question
with new numbers and it blocks A5 launch pricing, not the build.

Identity disclosure moves earlier for A5: a person entering a customer's home must be nameable, so
vendor name, photo and verification are disclosed at visit confirmation, and the exact address is
released to the vendor at the same moment — which the leakage-control ladder already permits
("operationally required, disclosed to the Customer"). Contact stays masked until the engagement.
This widens the leakage surface: customer and vendor meet in person before any platform payment
beyond the plan. The controls are the ones the plan already carries — mode clarity, staged funding,
two-party cancellation evidence — plus the fee credit, which gives the customer a priced reason to
engage on-platform.

Slot-squatting translates from quotes to visits: a vendor who confirms visits and never submits
estimates burns customer money and calendar. The non-responsive machinery translates with it — an
estimate not submitted within the post-visit window refunds or replaces that slot and hits vendor
standing.

A5 categories whose estimates do not need premises access (parts of Event and Media) still run a
physical visit under this model — a venue walkthrough is a legitimate consultation, but the owner
must confirm per launch category that a visit is the right consult shape when freezing the A3/A5
category list.

The A3 and A5 P4 surfaces are now different products — one unlock checkout, one visit-plan checkout —
where revision 2 had one. That is more front-door code than revision 2, paid for by deleting the A5
teaser/unlock/comparison-paywall surface and by reusing the built slot engine. Both checkouts land in
the still-unbuilt BE4/Wave C2, so nothing shipped is reworked.
