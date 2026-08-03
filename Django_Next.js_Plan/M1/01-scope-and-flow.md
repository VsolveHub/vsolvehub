# M1 Scope and Flow

## Catalog scope

Choose a small set of common, one-person, task-priced Technician variants whose scope can be described
and priced before arrival. Each activated variant requires:

- skill and equipment prerequisites;
- task codes, unit prices and marginal duration estimates;
- base duration and minimum visit charge;
- scope questions and unsafe/out-of-scope rules;
- evidence policy;
- service areas/hours;
- tax/fee/commission configuration;
- cancellation and support copy.

Diagnostic, unknown-fault, heavy-installation and two-person variants remain inactive until their
owning milestone.

## Customer journey

```text
service detail
  → OTP login/resume
  → add one or more independently scoped services to Cart
  → confirmed address and serviceability
  → server-authored fulfilment alternatives
  → Customer reviews grouping, visits, professional count, windows and itemized policy
  → select immutable plan/quote
  → Finding professionals for every Fulfilment Unit
  → all required Partners accept and their no-fault undo windows close
  → Customer pays within reservation expiry
  → webhook confirms Booking Group and unit Bookings
  → group status plus Partner and appointment details per unit
  → En route / Arrived / start OTP
  → work and any approved amendment
  → completion submission
  → confirm or dispute
  → invoice/refund and closure
```

M1 is login-first at the address boundary: Django does not persist anonymous address PII. The login
remains a resumable interrupt, so catalog intent survives. No stage auto-selects timing or claims
availability before the server response. Back/login/refresh preserve safe intent. The Customer may
cancel Partner search without charge.

The Cart is a real Customer surface and continuity aggregate. Adding another service creates another
item; it never replaces existing intent. Every edit increments the cart version and invalidates older
plans/quotes visibly. Login merge preserves non-duplicate items and requires an explicit Customer
decision for an exact duplicate or incompatible draft; no side silently wins.

The planner evaluates each item independently, then returns bounded alternatives:

- one Partner performing compatible lines sequentially in one unit;
- multiple Partners performing independent units in coordinated parallel windows;
- independent units in separate visits when compatibility, eligibility, dependencies or capacity
  require separation.

The Customer sees the final unit membership, visit/professional count, price difference and reason for
separation before confirmation. Same category alone never proves combination. M1 uses all-or-nothing
group confirmation: if one required unit cannot be held, every tentative group hold is released and
the Customer reviews a new plan before payment.

## Partner journey

```text
OTP → application/KYC/skills/area/availability → Operations approval
    → unit-scoped offer with only that Partner's service lines, area, time and net earning
    → Accept/Decline confirmation
    → 120-second undo
    → exact address after disclosure gate
    → En route → Arrived → start OTP
    → tasks/evidence/amendment
    → completion or abort
    → pending earnings → Operations-reviewed payout
```

Declining an offer has no automatic consequence. Accepted-job release remains available with reason.
M1 records late release/stall/no-show for manual Operations review only.

The M1 Partner inbox uses bounded short polling against a replayable server projection. Polling only
observes offers; Celery owns candidate advance, offer/undo/payment expiry and every state transition,
so closing or backgrounding a browser cannot stop dispatch.

## Operations journey

- Review and approve/return/suspend Partner applications.
- Configure approved variants/rates/areas/hours and see validation failures.
- Create an assisted Customer booking and send payment link using the ordinary domain flow.
- View Partner search, offers, reservations, booking timeline and notification delivery.
- View Booking Group structure, unit dependencies, unit Partner searches/holds and allocated money.
- Offer/reoffer a Partner through the same explicit acceptance path.
- Resolve delay, release, Customer unavailable, partial work and quality cases.
- Reconcile ambiguous payment/refund/payout.
- Run and approve a scheduled payout batch.
- Disable a service/area/provider without losing recovery access.

## M1 state path

```text
Plan:     ACTIVE → QUOTED → CONFIRMED | INVALIDATED | EXPIRED

Group:    CREATED → MATCHING → PARTIALLY_HELD → ALL_UNITS_HELD
                  → PAYMENT_PENDING → COMPLETED
                  → REPLAN_REQUIRED | EXPIRED | CANCELLED | FAILED

Unit:     PLANNED → MATCHING → HELD → BOOKED
                  → RELEASED | RECOVERY_REQUIRED | CANCELLED

Offer:    OFFERED → ACCEPTED_PENDING_UNDO → COMMITTED | UNDONE
                  → DECLINED | EXPIRED | REVOKED

Reservation: TENTATIVE → CONFIRMED → RELEASED

Booking:  CONFIRMED → EN_ROUTE → ARRIVED → IN_PROGRESS
                   → COMPLETION_SUBMITTED
                   → COMPLETED | PARTIALLY_COMPLETED | DISPUTED

Recovery: CONFIRMED/EN_ROUTE → RECOVERY_REQUIRED → CONFIRMED | CANCELLED
Abort:    IN_PROGRESS → ABORTED → PARTIALLY_COMPLETED | DISPUTED
```

## Cancellation baseline

- Before successful payment: no charge.
- More than 24 hours before start: full refund.
- 24 to 2 hours: disclosed fixed booking fee at most.
- Less than 2 hours before arrival-window start and before verified arrival: capped fixed cancellation
  fee, never full task value.
- Verified arrival plus wait/contact evidence: visit fee.
- Partner/platform failure or material Partner delay: full refund and no Customer fee.
- After work starts: completed-line settlement and incomplete-line refund.

The exact M1 amounts and deadlines are frozen in
[Initial configuration](./05-initial-configuration.md). They appear in rupees before search/payment
and are snapshotted on the quote and booking so a later configuration change cannot rewrite history.

## Failure outcomes

| Failure | Required result |
|---|---|
| No eligible/accepting Partner | Alternatives; Customer not charged |
| One required unit cannot be held | Release every tentative group hold; replan before payment |
| Cart changes after planning | Invalidate plan/quote; retain readable history and requote |
| Parallel plan loses one Partner | Do not silently continue partially; release/replan or follow an explicitly accepted partial policy |
| Partner accepts, Customer does not pay | Tentative reservation expires; Partner not penalized |
| Payment succeeds, booking conversion fails | Retry to convergence or refund plus Finance case |
| Partner releases before start | Recovery, reschedule or full refund |
| Partner is late | Honest delay plus fee-free Customer cancel/reschedule |
| Customer unavailable | Wait/contact/evidence, then visit-fee quote/dispute |
| OTP/message outage | Alternate channel or audited assisted start; no universal bypass |
| Additional work declined | Original work if safe; otherwise partial/abort resolution |
| Partner stops mid-job | Abort, site safety, completed-line settlement and recovery |
| Customer disputes completion | Payout hold and Quality case |
| Customer does not respond | Evidence-gated automatic finalization after deadline |
| Refund/payout ambiguous | Reconciliation case; never guessed success |
