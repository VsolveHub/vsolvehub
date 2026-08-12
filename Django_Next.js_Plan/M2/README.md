# M2 - Workforce and Project Services Flow

**Status:** Commercial M2 flow - revision 3 (visit-first A5)
**Scope:** Construction Labour, Manpower and Support Staff, Event and Media
**Purpose:** Extend the M1 platform with workforce requests, on-site estimation, vendor quotations,
crew fulfilment and custom project agreements.

Revision 2 applied the findings in [06-audit-gaps-and-simplification.md](06-audit-gaps-and-simplification.md):
the matching fee is charged after quotes exist, one commercial mode is fixed per archetype, workforce
and project fulfilment share one engagement spine, and the customer and Partner flows are shortened.

**Revision 3 — owner decision, 2026-08-12, recorded in
[ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md).** A5 becomes **visit-first**: an
A5 customer does not know their own scope ("wire my 1 BHK" — which switches, how many days), so the
honest unit of value is a professional on site producing an estimate, not a remote quote. The
customer picks a tiered **visit plan** — 1, 2 or 3 vendors at proposed INR 49/99/199 — and is charged
only when the **first vendor confirms a visit slot**, never at request time. The vendor estimates on
site through the existing A5 composer; estimates are fully readable with no second paywall; selection
and staged funding continue unchanged. **A3 is untouched** — remote one-screen quotes, teasers and
the INR 149 unlock stay exactly as revision 2 defined them. The engagement spine, the fixed mode per
archetype and every revision 2 recovery guarantee remain in force. Visit slots are booked through the
**already-built M1 slot engine** (`carts.availability` and the checkout slot-picker pattern), so
revision 3 lands in the unbuilt P4 rather than reworking anything shipped.

## Documents

**Status and execution**

- [Master task board](task.md) - phase status, ownership, dependencies and completion gates.
  **Start here.** It is the only authoritative status document.
- [Build-sprint orchestration](09-build-sprint-orchestration.md) - the multi-agent build-first
  sprint: dependency order, agent rules, and the single kickoff prompt.
- [Frontend execution plan](frontend-execution-plan.md) - the three-column split, file ownership map,
  frozen modules, sync gates and the cross-session handoff log.
- [Session C — backend](backend-session.md) · [Session A — Customer](frontend-session-a.md) ·
  [Session B — Partner + Operations](frontend-session-b.md) - the per-column working files.

**Task detail**

- [Backend tasks](02-backend-tasks.md) - Django, data, domain, payment and Operations TODOs.
- [Frontend tasks](03-frontend-tasks.md) - Customer, Partner and Operations application TODOs.
- [Acceptance and cutover](04-acceptance-and-cutover.md) - worst cases, evidence and rollout gates.

**Design authority**

- [State machines and permissions](07-state-machines-and-permissions.md) - states, commands, actor
  permissions and error codes. Where any other document disagrees, this one wins.
- [Frontend information architecture](08-frontend-information-architecture.md) - routes and navigation
  states. Its Partner half is implemented as code in
  `frontend/apps/partner/features/workspace/registry.ts`, which is the truth where the two differ.

**Reasoning records — history, not status**

- [Roadmap and base prompts](05-roadmap-and-prompts.md) - the original phase-by-phase execution order
  and the reusable session prompts. The **non-negotiable rules** in it (updated to revision 3) are live; its
  execution-order table has been superseded by the three-column split above.
- [Audit: gaps and simplification](06-audit-gaps-and-simplification.md) - the review this revision
  implements, plus the open decisions it could not resolve.

## Branch policy

M2 code is never pushed to `main`. All M2 implementation happens on a dedicated M2 branch and merges
into `main` only on the owner's explicit instruction. `main` remains the M1 acceptance build, because
M1 and M2 are separately accepted and separately paid milestones running in parallel.

## Planning boundary

This folder describes the commercial M2 named in `milestones.md`. The product delivery roadmap
currently uses M2 for `A2_INSPECTION_FIRST`, M3 for `A3_TIME_BLOCK`, and M5 for
`A5_CUSTOM_PROJECT`. Before this commercial M2 becomes authoritative delivery scope, the roadmap and
decision register must explicitly approve bringing the required A3 and A5 slices forward.

M2 reuses M1 identity, Partner review, service areas, money, refunds, evidence, payouts, scope
amendments and Operations cases. It does not force workforce or project work through the A1
task-visit lifecycle, and it does not build a second refund, amendment or case system.

### Payment activation boundary

`milestones.md` states that commercial M2 is a web build with **no payments and no OTP**, and that all
payment integration lands in M3. This plan therefore separates building from activating:

| Concern | Commercial M2 | M3 |
|---|---|---|
| Requirement, matching, visit, estimate, proposal, selection, engagement and fulfilment flows | Built and demonstrable | Unchanged |
| Quote-unlock fee (A3), visit-plan fee (A5), service payment, milestone funding, refunds, payouts | Built behind a flag against the M1 payment abstractions, demonstrated with provider test callbacks | Activated with live providers |
| Visit arrival and crew arrival confirmation | Built with the non-OTP fallback as the default path | Start-OTP path enabled |

No M2 acceptance scenario may depend on a live payment provider or live OTP. Every money scenario is
proved with test callbacks, and every arrival scenario is proved with the fallback confirmation.

## M1 compared with M2

| Area | Current M1 | After commercial M2 |
|---|---|---|
| Partner | Individual task-service professional | Individual, workforce agency, crew supplier or project vendor |
| Customer intent | Select configured tasks and quantities | Submit a guided requirement with media or voice |
| Price | Server calculates catalog task price | Vendor submits a structured proposal (A3: remote; A5: estimated on site) |
| Assignment | Backend offers one priced unit to eligible Partners | Backend invites eligible vendors to compete for quote slots (A3) or visit slots (A5) |
| Customer fee | No quote package | A3: INR 149 to unlock delivered quotes, charged only after quotes exist. A5: a tiered visit plan (1/2/3 vendors), charged only when the first visit slot is confirmed |
| Confirmation | Partner commits before Customer payment | Customer selects proposal, vendor reconfirms, then the engagement opens |
| Fulfilment | One lead Partner performs task lines | Vendor supplies a crew or delivers a milestone-based project |
| Changes | Scope amendment and price revision | Proposal supersession before agreement; scope amendment after agreement |
| Partner workspace | One fixed `Home`, `Jobs`, `Money`, `You` shell for approved A1 Partners | One shared app shell with contextual workspaces derived from approved lifecycle capabilities |
| Operations | Partner review, dispatch, cases and refunds | Requirement clarification, vendor matching, quote recovery, crew/project disputes |

## Service classification

Every activated M2 service variant must choose one lifecycle.

| Service shape | Archetype | Commercial mode | Example |
|---|---|---|---|
| Workers hired for a defined number of hours, shifts or days | `A3_TIME_BLOCK` | `LEAD_ONLY` | Helpers, housekeeping staff, temporary support staff |
| A vendor is responsible for an agreed outcome | `A5_CUSTOM_PROJECT` | `MANAGED_PAYMENT_REQUIRED` | Event production, photography package, interior or construction project |

Construction Labour may contain both shapes. Hiring four helpers for three days is A3. Asking one
contractor to complete a defined construction outcome is A5. Category name alone never selects the
lifecycle.

Commercial mode is **fixed by archetype, not configured per variant**. Day-labour is a cash-per-day
market where platform-enforced escrow cannot be made to hold, so A3 earns the unlock fee honestly and
promises only matching support. Project work is exactly where staged funding is the product, so A5
requires managed payment. Operations cannot set a different mode for an individual variant, Partner or
Customer. Changing this rule is a product decision, not a configuration change.

### Lifecycle classification and reclassification

The Customer never chooses an archetype. The guided requirement infers it from the answers, shows the
Customer a plain-language summary of what they are asking for, and records the inferred lifecycle on
the requirement.

Ambiguous requirements are real: "four helpers to renovate my bathroom" is both shapes. Operations
therefore owns a `reclassify_requirement` command that voids open invitations, preserves any unlock
or visit-plan value the Customer already paid for, records the reason, and restarts matching against
the correct pool without a second charge.

## Partner registration flow

Registration is progressive. KYC is gated on money, not on browsing, because supply is the scarce side
of this marketplace and a twenty-minute form before the first visible lead loses vendors.

```text
OTP and session
  -> name, business type, one service, one city
  -> browse masked live requirement summaries immediately
  -> identity, business profile and documents required before accepting a first enquiry
  -> bank, tax and payout details required before a first payout
  -> crew roster required before a first crew assignment, not at registration
  -> Operations review of the submitted capability
  -> approved capabilities become active
```

M1 Partner application, profile, skills, services, areas, documents, consents and availability remain
the shared registration foundation. A Partner may browse and understand demand before completing KYC,
but may not accept an enquiry, submit a proposal or receive contact details until the capability is
approved.

Workforce registration additionally records crew capacity by skill, supervisor capability, shift
capacity, tools/equipment, operating areas and a **worker insurance and liability declaration**.
Project registration records portfolio, project-size limits, site-inspection capability,
equipment/material capability, proposed warranty terms and milestone capability.

Approval is per capability. A Partner may be approved for workforce supply but not custom projects.
Document expiry blocks new matching for the affected capability without hiding accepted work.

## Partner capability and navigation rule

Partner navigation is not selected directly from a profession or skill. These concepts have different
responsibilities:

```text
Skill
  -> supports eligibility for a Service Variant
  -> Service Variant declares one Fulfilment Archetype
  -> Operations approves a Partner Capability with limits
  -> capability enables an archetype workspace and authorized actions
```

- A skill describes what the Partner can do, such as electrical work, driving or photography.
- A service variant describes what the Customer can request or buy.
- The fulfilment archetype selects the lifecycle, state machine and required workspace.
- An approved Partner capability combines the service/archetype with area, status, capacity,
  commercial mode and any required resources such as crew, property, asset or vehicle.
- The backend remains the authorization authority. The frontend owns route labels and presentation
  through a versioned workspace registry; it does not construct routes from profession names.

The product currently defines eight named archetypes: A1, A2, A3, A5, A7, A8, A9 and A10. A4 and A6
are not defined and must not be invented as placeholders. Commercial M2 implements only the A3 and A5
workspaces.

The contract is deliberately small: the backend returns a list of `{workspace_key, actions[]}`, and the
frontend renders only the keys its typed registry knows. An unknown key renders nothing. That is
fail-closed behaviour in a few lines, and it needs no per-archetype design document for workspaces
that do not exist yet.

| Approved capability | Partner operating model | Contextual navigation example | Owning scope |
|---|---|---|---|
| `A1_TASK_VISIT` | Technician/task provider | Home, Offers, Jobs, Money, You | Existing M1 |
| `A2_INSPECTION_FIRST` | Inspection/diagnosis provider | Home, Inspections, Follow-ups, Money, You | Product M2 roadmap, outside commercial M2 |
| `A3_TIME_BLOCK` | Individual or workforce supplier | Home, Enquiries, Shifts/Crew, Money, You | Commercial M2 |
| `A5_CUSTOM_PROJECT` | Project vendor | Home, Enquiries, Projects, Money, You | Commercial M2 |
| `A7_RENTAL` | Asset owner/operator | Home, Assets, Bookings, Money, You | Future milestone |
| `A8_TRIP` | Driver/fleet operator | Online, Requests, Trips, Earnings, You | Future milestone |
| `A9_STAY` | Accommodation provider | Home, Properties, Reservations, Money, You | Future milestone |
| `A10_LISTING` | Listing publisher | Home, Listings, Leads, Billing, You | Future milestone |

Labels are product-language examples, not backend authorization values. A listing is never shown as a
job, a reservation is never forced into Work, and a trip is not treated as a home-service offer.

Most Partners use one workspace family. A Partner with materially different capabilities uses an
explicit workspace switcher. The selected workspace controls the contextual mobile tabs while global
Home can summarize urgent actions across workspaces. Similar lifecycles such as A1 and A2 may share a
Home Services family, but their records and state machines remain distinct.

## Customer requirement flow

The requirement is free to submit. Nothing is charged until quotes exist.

```text
What        - service, scale, and the answers that infer the lifecycle
Where/When  - location, dates, flexibility and the hard service-by date
Details     - photos, video, documents or a voice note; optional free text
Review      - the summary IS the confirmation; submit from here
```

Four screens. Everything else - callback preference, site visit, access constraints, preferred
communication - is optional and reachable **from** the review screen rather than blocking the path to
it. There is no separate "confirm an immutable version" step; a second confirmation only teaches
Customers to click through confirmations.

For a requirement the server infers as A5, the review screen additionally carries the **visit plan
chooser** — how many verified professionals will visit and estimate on site (1, 2 or 3). Choosing a
plan charges nothing; it bounds the invitation wave. It is a control on the review screen, not a
fifth screen, and it never renders for A3.

Voice is a first-class fast path, not a fallback: "record 30 seconds instead of answering questions"
sits beside the structured questions, and the requirement records its language so matching and
Operations can route it. A voice note in a language the assigned vendor cannot understand is a silent
matching failure, so language is an eligibility input.

Every question permits an honest `Not sure` outcome where Operations or a vendor must clarify it.

### Requirement lifetime and edits

- A requirement carries a hard `service_by` date. When it passes, matching auto-closes, any unlock
  (A3) or unconsumed visit-plan value (A5) is refunded in full, and the Customer is told why. A quote
  or visit delivered after the work date is worthless.
- Before any vendor accepts, the Customer edits the requirement freely. No version is created.
- At each invitation the backend writes an immutable `RequirementSnapshot`: exactly what this vendor
  saw when they quoted. That is the only versioning the audit and the dispute process actually need.
- After a vendor has accepted, a material edit requires explicit confirmation, notifies accepted
  vendors, resets their deadlines, pauses the quote-delivery clock and permits penalty-free withdrawal.
- A new requirement that matches an open one on Customer, address, date and category is flagged as a
  probable duplicate and offered a merge before it burns the same vendor pool twice.

## Matching and the two front doors

The Customer pays only against a real, accepted commitment — never against an attempt. What that
commitment is differs by archetype, because the two archetypes sell different things:

| Archetype | What the Customer buys | Price | When it is charged |
|---|---|---|---|
| A3 workforce | Full scope, price and terms of up to three **delivered remote quotes**, plus clarification and selection rights | INR 149 | Only once at least one confirmed quote is available to unlock |
| A5 projects | A **visit plan**: 1, 2 or 3 verified professionals visit the site, and each produces an on-site estimate the Customer can read in full and select from | Proposed INR 49 / 99 / 199 (owner configuration) | Only when the **first vendor confirms a visit slot** |

**A3 — quote-first (unchanged from revision 2).** Before unlocking, the Customer sees **quote
teasers**: vendor verification badge, rating, vendor type and a headline price band. No full scope,
no vendor identity, no contact details.

**A5 — visit-first (revision 3).** There are no teasers and no second paywall. Before any visit is
confirmed the Customer sees **vendor cards** for the responding pool — verification badge, rating,
vendor type and a distance band; no contact details. When a vendor confirms a visit slot, their name,
photo and verification are disclosed (someone is entering the Customer's home and must be nameable)
and the exact address is released to that vendor — both already permitted by the disclosure ladder as
operationally required. The estimates the visits produce are fully readable at no further charge: the
visit plan **is** the access fee.

Both orderings remove the same class of failure. There is no supply preflight to get wrong, because
matching is itself the preflight. There is no "paid but nothing happened" branch: an A3 unlock cannot
exist without a usable quote, and an A5 plan cannot be charged without a confirmed visit. There is no
partial-entitlement dispute, because the A3 promise is "up to three" and every unfilled A5 visit slot
**auto-refunds its per-slot share** when the visit SLA passes.

The remaining refund rules are small and are listed under
[Cancellation and refunds](#cancellation-and-refunds).

### The A5 visit plan mechanics

```text
A5 requirement submitted (free) with a chosen plan of N visits
  -> invite bounded candidate wave (plan size bounds the wave)
  -> vendor accepts and confirms a visit slot
       - slot booked against the M1 availability grid (carts.availability),
         through the same slot-picker pattern the A1 checkout ships
       - first confirmed slot charges the whole plan; later slots charge nothing
  -> visit day: arrival confirmed (non-OTP fallback in M2; start OTP in M3)
  -> vendor submits the estimate ON SITE through the A5 composer,
     prefilled from the requirement and the visit:
     price, working days, material line items
  -> estimate lands as an append-only Proposal; Customer reads it in full
  -> unfilled plan slots auto-refund their share at the visit SLA
```

Rules the mechanics stand on:

- **One payment event.** The plan is charged once, at the first confirmed slot. Per-slot shares exist
  for refund arithmetic (`plan price / plan size`, in integer paise with the remainder on the first
  slot), not as separate charges.
- **The charge is a Customer checkout, gated on a real commitment.** The first vendor's slot is held
  while the Customer completes the plan checkout ("Vendor X confirmed Tuesday 10am — book your
  visits"); the hold expires harmlessly if they never pay, and the booking hardens to `SCHEDULED`
  only on the verified provider callback. Later vendors book without any further payment.
- **A visit slot is vendor capacity.** Booking one takes the same capacity the A1 technician flow
  reads, so a visit cannot be double-booked against a task job. This also closes the known
  `carts.availability`-vs-`CapacityHold` overlap for visits by construction.
- **An A5 estimate requires a completed visit.** The composer refuses to submit against a visit that
  never happened; `m2_visit_not_completed` is the refusal. An A5 vendor who believes they can price
  remotely still visits — the visit is what the Customer bought.
- **Estimate-or-refund.** A vendor who completes a visit and submits no estimate within the post-visit
  window refunds or replaces that slot and loses standing — the visit-side analogue of non-responsive
  rejection.
- **The visit fee pays the visitors — decided 2026-08-13.** Each per-slot share splits into a
  **vendor visit payout** and a **Vsolve platform share** (configured percentages, read fail-closed).
  The vendor payout becomes payable when that vendor's visit is `COMPLETED` **and** a usable estimate
  lands inside the post-visit window — the estimate is what the Customer bought, so a visit that
  produces no estimate pays the vendor nothing and refunds the Customer that share. Payouts run
  through the existing M1 payout and ledger rails (payout details required first, per the
  progressive gate). There is **no stage credit**: the plan money is spent on the visits themselves.
- **Everyone earns.** The Customer pays only for delivered estimates (everything undelivered
  refunds); the visiting vendor is paid for every completed, estimate-producing visit whether or not
  they win the job; Vsolve keeps the platform share of every consumed slot plus the A5 commission on
  the engagement.
- **Reclassification preserves money.** `reclassify_requirement` A5→A3 voids unfilled visit slots and
  refunds their shares (or converts to the unlock where the owner configures it); A3→A5 preserves any
  unlock as visit-plan credit. No second charge, mirroring the revision 2 rule.

### Delivery service levels

Every launch category declares a delivery SLA. For A3 it is quote delivery — for example a first
quote within 24 hours and the full set within 72. For A5 it is **visit delivery** — a first confirmed
visit slot within X business hours and the plan filled within Y (owner configuration), plus a
**post-visit estimate window** within which a completed visit must produce an estimate. The SLA is a
Customer-facing promise and an internal alarm. Breaching it closes the requirement with an
explanation (nothing charged if no quote/visit ever arrived) or auto-refunds the unfilled visit
shares, rather than leaving anything open forever.

Deadlines are computed in business hours against a holiday calendar. A vendor must not lose a slot to a
clock that ran at 2am or through a festival.

### Matching

Matching first applies hard eligibility: active approval, exact service capability, area, travel
feasibility for the requested date, language, availability or capacity, documents, equipment, safety
rules, recent responsiveness, no block and no conflict. A vendor who has not opened the app in weeks is
not eligible, because every wave sent to a dead account burns the SLA clock.

Eligible candidates are then ordered using distance, explicit prior-Partner preference where supported,
least-recent assignment and a stable recorded tie-break. During low supply, Operations may choose the
candidate but must still send an invitation; Operations cannot accept for the vendor.

```text
A3: Requirement submitted (free)
      -> invite bounded candidate wave
      -> vendor accepts enquiry, taking a soft capacity hold for the requested dates
      -> vendor clarifies requirement through structured Q&A
      -> vendor submits the one-screen proposal before deadline
      -> Customer sees a teaser for each confirmed quote
      -> Customer unlocks (INR 149) to read, compare and select

A5: Requirement submitted (free) with a visit plan of N
      -> invite bounded candidate wave
      -> vendor accepts by confirming a visit slot (hard slot on the availability grid;
         first confirmation charges the plan)
      -> vendor visits, arrival confirmed, estimates on site through the full composer
      -> Customer reads, compares and selects among the delivered estimates
```

For A3, capacity is held softly at acceptance and hard at selection. Checking capacity only at
reconfirmation lets one agency accept six enquiries for the same Saturday, win four and staff one.
For A5, the visit slot is itself a hard booking on the shared grid; the engagement-period capacity
check still happens at selection/reconfirmation as for A3.

### What counts as a usable quote (A3) or a usable estimate (A5)

An A3 quote is unlockable only if it is a complete proposal against the current snapshot and
falls within the requirement's declared budget band, where the Customer declared one. Quotes outside
the band are shown to the Customer as out-of-budget rather than silently counted.

An A5 estimate is usable only if it is a complete proposal submitted against a **completed visit**
under the same snapshot discipline. Budget-band labelling applies the same way.

After unlocking (A3) or after a visit (A5), the Customer may reject a proposal as
**non-responsive** - it ignores the stated scope, or it is a placeholder. A non-responsive rejection
releases the slot and invites a replacement at no extra charge (A3: a new quote slot; A5: a free
replacement visit), capped at a configured number of rejections so the mechanism cannot be farmed.
The A5 analogue of the squatter is the vendor who visits and never estimates: the estimate-or-refund
window is the direct control.

Slot squatting is a real vendor behaviour: a deliberately junk-but-complete quote both looks responsive
and blocks a competitor. Non-responsive rejection is the direct control, and repeated offenders lose
matching priority.

### Supply integrity controls

- **Identity clustering.** One Partner cannot hold two slots for the same requirement, and neither can
  two Partner accounts sharing a phone, PAN, bank account or device. A cluster counts as one Partner.
- **Price-band review.** Quotes clustered abnormally tightly, or sitting far above the reference band
  for the variant, raise a review signal. A signal is never proof and never an automatic penalty.
- **Attachment access expires with the invitation.** A vendor who was not selected loses access to the
  Customer's site photos. Only the selected vendor retains access for the life of the engagement.

## Clarification, site visits and revision

Vendors need to ask questions. That does not require a messaging product.

Clarification is **structured**: a vendor posts a question against the requirement, the Customer
answers, and both appear on the shared timeline. There are no free-form threads, no read receipts and
no moderation queue. Contact-sharing detection stays trivial because the surface is two text fields.
Real chat can be added later if the question flow measurably fails.

A **site visit is a paid, scheduled service** whose fee adjusts against the final price, reusing the
M1 inspection-visit pattern. A free site visit is refused by vendors, who will not travel unpaid, and
abused by Customers as free consulting. Paying for it also compensates the vendor when a Customer goes
silent after the visit.

Under revision 3 the visit takes two forms with one model. For **A5 the plan visit is the primary
path**: it occupies a `VisitPlan` slot, its fee is the per-slot share of the plan the Customer already
paid, and its scheduled slot is booked against the M1 availability grid. For **A3** (and for a second
look on A5) the ad-hoc paid visit remains available exactly as revision 2 defined it, with a
vendor-priced fee. Both adjust against the final price through the same flag.

Telephone or WhatsApp notifications may bring a party back to Vsolve, but a phone conversation does not
change scope or price by itself.

Proposals are **append-only**. A revision is a new proposal that supersedes its predecessor; prior
proposals remain readable for audit but cannot be selected.

```text
SUBMITTED -> SUPERSEDED | WITHDRAWN | EXPIRED | SELECTED | REJECTED
```

Each proposal records scope, crew, schedule, labour, material, equipment, travel, tax, total, validity,
exclusions, cancellation terms, warranty and the platform commission treatment. All competing proposals
for one requirement are quoted on a **single tax basis** so the comparison is honest between a
GST-registered vendor and an unregistered one.

Operations may prepare an assisted draft after a recorded vendor call. The vendor must explicitly
confirm that draft before it is shown to the Customer. For A3 this assisted path is a **primary** path,
not a recovery tool: a labour contractor filling in line items on a five-inch phone is the exception,
not the norm.

### Two composers, not one

- **A3 proposal**: rate per worker per day, minimum days, what is included. One screen.
- **A5 proposal**: deliverables, line items, milestones, taxes, exclusions, assumptions, dates,
  warranty and validity. Under revision 3 this composer is **submitted on site** during the plan
  visit, prefilled from the requirement and the visit, with working days as the schedule and material
  line items as first-class rows. It refuses to submit without a completed visit.

An A3 rate is validated server-side against the applicable state and skill **minimum-wage floor**.
Brokering labour below the statutory floor is a violation carried by the platform, not only by the
vendor.

## Selection and confirmation

Customer selection is not yet a booking.

```text
Customer selects a proposal
  -> vendor receives a confirmation request
  -> vendor reconfirms price, date and capacity within the deadline
  -> A3: the connection completes and contact is released
  -> A5: the milestone funding step opens
  -> the engagement becomes confirmed
```

If the vendor rejects or times out, the proposal is closed, the Customer's unlock (A3) or visit-plan
entitlement (A5) remains valid, and the next quote/estimate or a replacement vendor — for A5, a free
replacement visit — is offered without another charge. If every vendor is exhausted, Vsolve offers a
free rematch or refunds the unlock (A3) / the unconsumed plan value (A5).

If a quote's or estimate's validity expires before selection, the Customer gets a one-tap "ask this
vendor to re-validate the price" action that reuses the existing unlock or plan. Expiry must not be a
dead end that forces a second purchase.

A capability suspended after selection is not only a Partner problem: the backend must find funded or
committed engagements belonging to that capability and route them to replacement or refund rather than
leaving authorized money against unauthorized work.

Multiple simultaneous selections for one requirement are not supported. The previous "multiple lots"
allowance is withdrawn - it was an undefined branch in the most safety-critical command in the system.

## Fulfilment: one engagement spine

Workforce and project fulfilment are the same shape - an agreement with ordered stages, where each
stage carries evidence, an approval and a money consequence. They are modelled once.

```text
Engagement                      (from the selected proposal; A3 or A5)
  -> EngagementStage            (A3: one shift-day. A5: one milestone.)
       -> evidence
       -> approval, correction or dispute
       -> money release for the approved amount
  -> ScopeAmendment             (reuses the M1 amendment engine)
```

`TimeExtension` and `ChangeOrder` are both scope amendments and both reuse
`backend/apps/fulfilment/amendments.py`. No scope or money change may occur through clarification, a
phone call or a unilateral UI action.

### Workforce stages (A3)

```text
Selected A3 proposal
  -> Engagement (LEAD_ONLY: contact released, Customer pays the vendor directly)
  -> vendor assigns crew per shift-day
  -> Customer sees disclosure-safe crew details
  -> crew arrival confirmed
  -> supervisor confirms the day's attendance
  -> Customer confirms or disputes in one tap
  -> approved scope amendment for extra time or headcount
  -> stage completes
```

Attendance is confirmed **at supervisor level**: "four of four present today", which the Customer
confirms or disputes with one tap. Per-worker detail is captured only when the Customer disputes.
Building per-worker check-in and check-out with offline sync is a large build against a field reality
where the workers do not carry the app and the supervisor does. Settlement is per shift-day either way,
so the money stays correct.

Crew is assigned **per stage**, not per engagement, because multi-day labour genuinely rotates faces.
Named crew still cannot be replaced by unverified workers, and a crew member has a global identity so
the same person cannot be double-booked through two agencies on one day.

Two field defaults must be explicit rather than discovered in production:

- A missing check-out settles at the agreed shift length, flagged for review, and is disputed only if
  the Customer disputes it.
- Overtime worked before approval is unpaid unless the Customer confirms it inside a short retroactive
  window. This is stated in the vendor terms up front, not argued after the fact.

A **safety incident** on site - injury, damage or an unsafe condition - is a first-class record with its
own report flow, not a cancellation reason. Construction labour supply carries real liability, and the
platform must be able to show what was reported, when and by whom.

### Project stages (A5)

```text
Selected A5 proposal
  -> Engagement (MANAGED_PAYMENT_REQUIRED)
  -> stages and amounts frozen
  -> Customer funds the required stage
  -> vendor performs work and submits evidence
  -> Customer approves, requests correction or disputes
  -> approved amount becomes payout eligible
  -> next stage
  -> final completion, deliverable handover and warranty period
```

Additional rules that the stage spine alone does not cover:

- **Material advances are a distinct money purpose.** Material money is spent, not earned, so it cannot
  be recovered like an unearned work stage when a project ends early.
- **Vendor replacement mid-project.** When a vendor abandons a half-built project, the Customer's
  problem is an unfinished building, not a ledger entry. Remaining stages transfer to a replacement
  vendor at the replacement's price, with the difference funded or refunded.
- **Customer-caused delay.** A vendor blocked by an unvacated site or missing power raises a delay claim
  with evidence and a schedule-extension request, rather than absorbing a schedule penalty.
- **Warranty needs money behind it.** A configured retention is held back from the final stage and
  released at the close of the warranty window. An unfunded warranty promise is unenforceable the moment
  payout completes, so a variant either funds retention or the UI stops promising warranty.
- **Digital deliverables are handed over on the platform.** For Event and Media the deliverable is the
  files. A handover step with Customer acceptance keeps the actual delivery from happening off-platform.

## Cancellation and refunds

The unlock fee (A3), the visit-plan fee (A5) and any service payment are separate financial purposes.

| Situation | Outcome |
|---|---|
| No quote is ever delivered (A3) / no visit is ever confirmed (A5) | Nothing was charged; the requirement closes with an explanation |
| Quote-delivery (A3) or visit-delivery (A5) SLA is breached | A3: nothing was charged; closes with a support path. A5: unfilled visit shares auto-refund; completed visits stay earned |
| `service_by` date passes while matching runs | Matching closes; any unlock or unconsumed visit-plan value is refunded in full |
| Plan slots never fill (A5: paid for 3, only 2 vendors ever confirm) | The unfilled slot's share auto-refunds at the visit SLA |
| Vendor no-shows a confirmed visit (A5) | That slot's share refunds or a free replacement visit is offered; vendor standing is hit |
| Customer no-shows a confirmed visit (A5) | The vendor's visit payout is still paid — they travelled; the platform-share disposition is an owner decision |
| Visit completed but no estimate arrives inside the post-visit window (A5) | That slot's share refunds or a free replacement visit; vendor standing is hit |
| Every unlocked vendor / every visited vendor withdraws, expires or is suspended before selection | Free rematch or replacement visit, or refund the unlock / unconsumed plan value |
| A quote or estimate is rejected as non-responsive | Slot released and replaced at no charge (A3: quote slot; A5: replacement visit), up to the configured cap |
| Customer unlocked valid quotes (A3) or received completed visit estimates (A5) and changed their mind | The fee is earned and not refunded |
| A3 vendor cancels a confirmed connection | Replacement offered; no platform service money is involved |
| A5 vendor cancels confirmed project work | Replace or refund the unperformed, unearned stage value |
| Crew is short or work is partial | Correct fulfilment or refund the unperformed allocation |
| Project stage is disputed | Hold the disputed payout; release only undisputed eligible value |
| Duplicate or ambiguous payment | Reconcile through the existing payment/refund lifecycle |

Every refund continues through the M1 `Refund` and `RefundAllocation` lifecycle. M2 does not create a
second refund system. Every terminal financial outcome must reconcile to unlock, visit-plan,
engagement, stage or amendment allocations in integer paise.

Feature flags gate **new** purchases only. A Customer with an in-flight requirement or a funded stage
always retains access and refundability when a flag is turned off.

## Payment mode and off-platform leakage

Once a Customer and vendor can communicate directly, Vsolve cannot reliably prove that a vendor who
reported cancellation did not collect cash or personal UPI payment. M2 therefore does not attempt to
solve leakage with a cancellation reason alone. Mode is fixed by archetype:

| Mode | Applies to | Service payment | Vsolve revenue | Vsolve protection |
|---|---|---|---|---|
| `LEAD_ONLY` | A3 workforce | Customer pays vendor directly | Unlock fee only | Matching, quote support and replacement |
| `MANAGED_PAYMENT_REQUIRED` | A5 projects | Customer pays through the approved platform payment flow | Platform share of every consumed visit slot, plus earned commission; the vendor share of each slot is paid out to the vendor who visited and estimated | Scheduled visits, on-site estimates, replacement, refund, staged funding, dispute and configured warranty support |

The vendor cannot change the mode. The Customer sees the mode before paying anything — before the
unlock on A3, before choosing a visit plan on A5.

For A3 the UI must say plainly that service payment, service refunds and warranty remain between the
Customer and the vendor. Vsolve must not describe an A3 connection as a protected booking, and must not
record the vendor's direct collection as platform revenue.

For A5, platform commission treatment is a **displayed, immutable field on every proposal**. Whether
commission sits inside the vendor's quoted price or is added on top decides whether vendors inflate
quotes and whether the comparison view is honest, so it is stated rather than implied.

### Managed-payment flow (A5)

```text
Customer selects an on-site estimate
  -> vendor reconfirms
  -> Customer funds the first stage through Vsolve
  -> engagement becomes confirmed
  -> work starts with auditable arrival confirmation
  -> later stages use separate platform payment requests
  -> approved work makes vendor payout and Vsolve commission eligible
```

Projects collect one stage at a time and never collect the full project value merely because a proposal
was accepted. Vendor transfers use an approved marketplace settlement or reconciled payout provider
flow; Vsolve does not create an unregulated internal wallet or treat vendor-payable money as company
revenue.

> **Open contradiction.** `milestones.md` M3 promises "Wallet, V Coins, Referral System" while this plan
> forbids an unregulated internal wallet. Both cannot be true. See the decision list below.

### Cancellation after contact disclosure

After Customer contact or exact site information is disclosed, a vendor cannot directly set the work to
`CANCELLED`.

```text
Vendor requests cancellation
  -> selects reason and supplies required evidence
  -> Customer is asked what happened
  -> matching states produce cancellation/replacement
  -> conflicting states open an Operations case
```

The Customer answers one of:

- Work did not happen.
- Work happened partially.
- Work was completed.
- I paid the vendor directly.
- I need help.

| Work stage | Vendor action |
|---|---|
| Before accepting enquiry | Decline invitation |
| After accepting, before proposal | Withdraw enquiry |
| After proposal, before Customer selection | Withdraw proposal |
| After Customer selection | Request cancellation |
| After platform payment | Request cancellation and replacement |
| After crew arrival or work start | Abort work; cancellation is no longer valid |
| After stage evidence submission | Completion, correction or dispute flow |

### Leakage controls and limits

- Keep direct contact masked until vendor interest or a required site visit.
- Share exact address only when operationally required and disclosed to the Customer.
- Keep proposal scope, price, supersession and acceptance inside Vsolve.
- Provide platform UPI links or QR payment for Customers and vendors who do not use cards.
- Require a platform stage payment before managed work becomes `CONFIRMED`.
- Require a Customer arrival confirmation record for crew arrival and work start.
- Ask the Customer to verify every vendor cancellation after contact disclosure.
- Record cancellation timing, proposal history, questions, callbacks, site visits and attendance.
- Review repeated accept-contact-cancel patterns and direct-payment reports manually.
- Restrict or suspend quoting only after evidence and an appealable Operations decision.
- Never claim that location, silence or a risk score proves that offline work occurred.

### Leakage and payment worst cases

| Situation | Required outcome |
|---|---|
| Vendor asks Customer to cancel for an offline discount | Warn Customer, require dual confirmation and review vendor |
| Vendor reports cancellation but Customer says work occurred | Block automatic closure and open Operations case |
| Customer and vendor both hide an offline transaction | Usually unprovable; Vsolve retains only unlock-fee economics |
| Customer pays cash and requests a platform refund | Refund only money collected by Vsolve; assist with complaint evidence |
| Vendor repeatedly cancels after receiving contact | Limit disclosure, review pattern and suspend capability after evidence |
| Vendor starts managed work without a funded stage | No managed confirmation; record policy incident and prevent payout claim |
| Customer falsely denies completed work | Review arrival record, attendance, evidence, questions and Partner response |
| Vendor falsely claims completion | Require Customer response or configured evidence/review window |
| Chargeback arrives after vendor payout | Open financial case; use vendor ledger recovery or Vsolve risk reserve |
| Chargeback on the unlock or visit-plan fee itself | Handle through the standard dispute path and alert on the rate |
| Customer rejects a large advance | Fund one stage at a time; never force full-project prepayment |
| Marketplace split settlement is unavailable | Use an approved collection and reconciled payout model after legal/provider review |
| Direct transactions dominate a category | Reclassify it to A3/`LEAD_ONLY` instead of pretending commission is collectible |

The platform cannot eliminate collusion after contact exchange. M2 controls what it can through
mode clarity, bounded disclosure, staged funding, two-party cancellation evidence, delayed payout and
useful protection. A3 deliberately earns unlock revenue rather than relying on commission that Vsolve
cannot enforce.

## Customer, Partner and Operations surfaces

### Customer

The catalog service page uses the variant archetype to choose its primary action:

- A1: `Check price and availability` opens the existing booking flow.
- A3/A5: `Tell us what you need` opens the four-screen requirement flow.

`My requests` shows requirement status, matching progress, quote teasers and unlock state (A3),
the visit plan, confirmed visit slots and delivered estimates (A5), questions, site visits and refund
status. Confirmed A3 connections appear in `My bookings`. A5 projects remain in `My projects`, linked
back to the original request, its visits and the proposal history.

### Partner

The same Partner application and authenticated shell are retained, but the operational navigation is
not universal. The backend publishes approved capabilities as `{workspace_key, actions[]}`; the
frontend maps known workspace keys to owned routes, labels and icons and ignores unknown keys.

For commercial M2, A3 Partners receive workforce enquiries, crew and shifts; A5 Partners receive
enquiries, **visit slots to confirm, an on-site estimate composer**, and projects. A Partner approved
for both can switch between `Workforce` and `Projects`, while global Home and Money may aggregate
safe summaries. Existing A1 Partners keep Offers and Jobs unchanged.

An A3 enquiry response fits on one phone screen: rate, days, inclusions, accept or decline.

### Operations

Operations adds a Requests workspace for clarification, matching, slot recovery, assisted proposals,
visit scheduling recovery (no-show, reschedule, replacement visits), reclassification, no-response
follow-up and unlock/visit-plan refunds. Existing Partner Review, Cases, Refunds and Payouts remain
the authoritative recovery surfaces.

Operations load must be modelled before the workspace is designed. The unlock fee is the platform's
entire A3 revenue, the visit plan is the A5 front-door revenue, and a design that assumes a human
touch on every request or every visit cannot be funded by either.

## Data model change from M1

### Reused

- `User`, role/session and Customer identity.
- `PartnerProfile`, `PartnerApplication`, skill, service, area, document, consent and availability.
- `Order`, `PaymentAttempt`, `PaymentAllocation`, `Refund` and `RefundAllocation`.
- Partner ledger, payout, evidence, notifications and `OperationsCase`.
- **The M1 scope-amendment engine**, for both A3 time extensions and A5 change orders.
- **The M1 slot engine** — `carts.availability` (whole-grid capacity, `earliest_reachable`) and the
  customer checkout slot-picker pattern (`features/checkout/view/slots-modal.tsx`,
  `preferred_starts`) — for A5 visit-slot booking. M2 adds a caller, not a second availability
  notion.

### Extended

| Existing area | Required M2 extension |
|---|---|
| `ServiceVariant` | Activate A3 and A5 configurations and question schemas |
| `PartnerService` | Requested/approved archetype capabilities, operating limits, required resources and capability status |
| Partner session/profile projection | Approved capability IDs, archetypes, workspace keys and action permissions; no server-authored frontend routes |
| Payment purpose | Quote unlock (A3), visit plan (A5), stage funding, material advance and amendment |
| Financial allocation | Link exact unlock, visit plan, engagement, stage or amendment |
| Operations cases | No quote, vendor withdrawal, crew failure, safety incident, stage and project dispute types |
| Scope amendments | Accept A3 time extension and A5 change-order shapes |

### New M2 aggregates

```text
PartnerBusinessProfile
PartnerCapability
CrewMember / CrewSkill                (global crew identity, per-Partner membership)

CustomerRequirement
RequirementSnapshot                   (immutable, written at invitation)
RequirementAttachment
RequirementQuestion / RequirementAnswer
VendorInvitation
Proposal / ProposalLine               (append-only, supersession chain;
                                       an A5 proposal links to its completed SiteVisit)
SiteVisit                             (paid; under A5 it occupies one VisitPlan slot,
                                       booked on the M1 availability grid)
VisitPlan                             (A5: plan size, price, charge state,
                                       per-slot shares, refund state)
QuoteUnlock                           (A3 only)

Engagement                            (A3 or A5)
EngagementStage                       (shift-day or milestone)
StageEvidence / StageApproval
CrewAssignment                        (per stage)
StageDiscrepancy                      (per-worker detail, only on dispute)
SafetyIncident
```

The durable relationship is:

```text
A3: Requirement
      -> Vendor Invitations (each with a Requirement Snapshot)
      -> Proposals
      -> Quote Unlock
      -> Selected Proposal
      -> Engagement
      -> Stages, Payments, Refunds and Payouts

A5: Requirement (+ Visit Plan)
      -> Vendor Invitations (each with a Requirement Snapshot)
      -> Site Visits (one per confirmed plan slot)
      -> Proposals (on-site estimates, each against a completed visit)
      -> Selected Proposal
      -> Engagement
      -> Stages, Payments, Refunds and Payouts
         (each consumed visit share pays out: vendor visit payout + Vsolve platform share)
```

Projects remain project aggregates. Neither lifecycle is flattened into an A1 `BookingGroup` merely to
reuse an existing screen.

## Mandatory recovery rules

- Nothing is charged before a usable quote exists (A3) or a vendor confirms a visit slot (A5).
- A question or a callback without a complete proposal does not produce a quote teaser.
- A visit that never happened cannot carry an estimate, and an unfilled visit slot always refunds its
  share at the visit SLA without a support ticket.
- Candidate, slot, visit and proposal deadlines continue while browsers are closed, in business hours.
- A selected vendor timeout preserves the unlock or visit-plan entitlement automatically.
- Requirement edits after acceptance reset vendor deadlines and pause the delivery clock.
- Snapshots preserve exactly what each vendor quoted against.
- Capability suspension blocks new enquiries, preserves active work, money and disputes, and routes
  funded engagements to replacement or refund.
- Unknown archetypes render nothing in an older Partner frontend.
- Crew shortage, no-show, unsafe site, safety incident and partial attendance enter typed Operations
  cases.
- Stage disagreement blocks only the disputed allocation where safe.
- Customer, vendor and platform failures are attributed separately.
- Operations uses auditable domain commands and never edits database rows to force a result.

## Success measures

Stop conditions are defined in [04-acceptance-and-cutover.md](04-acceptance-and-cutover.md). A launch
category also declares its target for:

- quote fill rate (A3) - share of requirements receiving at least one usable quote;
- visit fill rate (A5) - share of chosen plan slots that reach a confirmed visit;
- time to first quote (A3) / time to first confirmed visit (A5), against the declared SLA;
- unlock conversion (A3) - share of teaser views that unlock;
- plan conversion (A5) - share of submitted A5 requirements that choose and charge a plan;
- visit-to-estimate rate (A5) - share of completed visits that produce a usable estimate in the window;
- unlock and visit-plan refund rates;
- vendor invitation response rate;
- selection-to-confirmation rate;
- dispute rate per completed engagement;
- Operations touches per request, against the unit economics model.

## Decisions required before M2 acceptance

Decided:

1. **The commercial model shape — decided 2026-08-12 ([ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md)).**
   Free requirement for both archetypes. A3: INR 149 unlock after a usable quote exists. A5:
   visit-first — a tiered visit plan (1/2/3 vendors), charged only at the first confirmed visit slot,
   with on-site estimates readable at no further charge.
2. **The visit money is a pass-through split — decided 2026-08-13.** Each consumed slot share splits
   into a vendor visit payout (paid on a completed visit with a usable estimate, through the M1
   payout rails) and a Vsolve platform share. No stage credit. Undelivered slots refund the Customer.

Blocking:

1. Final A5 visit-plan tier prices (proposed INR 49/99/199) and the exact split percentages: vendor
   visit payout versus Vsolve platform share per slot.
2. Quote-delivery SLA (A3), visit-delivery SLA and post-visit estimate window (A5), and vendor
   reconfirmation deadlines, by category.
3. Customer no-show policy for a confirmed visit: the vendor payout is paid; decide the
   platform-share disposition (kept or refunded).
4. Commission visibility on A5 proposals: inside the quoted price or added on top.
5. GST and invoicing basis, including principal-versus-agent treatment per mode, and the tax
   treatment of the unlock fee and the visit-plan fee themselves (the vendor visit payout is the
   vendor's income — invoicing treatment needed).
6. Worker insurance, injury liability and safety-incident position. Blocking for Construction Labour.
7. Minimum-wage floor source and enforcement per state and skill.
8. Resolve the wallet contradiction between this plan and `milestones.md` M3.
9. Confirm the milestone boundary: which of this scope is commercial M2 and which is M3, given that
   `milestones.md` excludes payments and OTP from M2.
10. Unit economics: Operations touches per request against INR 149 (A3), and per visit against the
    **platform share** of the plan tiers (A5) — the vendor payout is not Vsolve revenue.
11. Per launch category frozen as A5: confirm a physical visit is the right consult shape (Event and
    Media venues walkthrough versus premises-free estimation).

Before the relevant phase:

- Ad-hoc site-visit pricing (A3 / second-look A5 visits).
- Non-responsive rejection cap — and the estimate-or-refund window's effect on vendor standing.
- Workforce cancellation, overtime and crew-replacement rules.
- Project stage funding, payout hold, retention percentage and warranty rules.
- Material-advance recovery policy.
- Exact legal, tax, worker-document and business-verification requirements.
- Alignment of the commercial milestone numbering with the authoritative product roadmap.
