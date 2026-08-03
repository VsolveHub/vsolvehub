# Lifecycle and State Machines

## Common customer journey

```text
discover → multi-item cart/scope → address/serviceability → plan alternatives/timing → quote/policy
         → login/resume → all required unit commitments or inventory holds
         → payment policy → authoritative confirmation
         → fulfilment → outcome confirmation/dispute → settlement/documents
```

Stages vary by archetype. A1 has task quantity, A2 has inspection and follow-up, A3 has purchased
time, A4 has recurrence, and A5-A10 use their own engines.

## Checkout lifecycle

```text
CREATED
  → FINDING_PARTNER / HOLDING_INVENTORY
  → PARTNER_COMMITTED / INVENTORY_HELD
  → PAYMENT_PENDING
  → COMPLETED
  → EXPIRED | FAILED | CANCELLED
```

Rules:

- Visit archetypes request informed Partner acceptance before Scheduled/Today payment.
- Partner Accept first enters the no-fault undo window and creates a `TENTATIVE` reservation. Customer
  payment is enabled only after the Partner commits or the undo window expires.
- A committed Partner keeps the `TENTATIVE` reservation while the Customer pays.
- Payment start is disabled before reservation expiry by a safety window.
- Payment success received after expiry attempts one atomic capacity reacquire. If that fails, the
  payment is voided/refunded and an Operations case is created.
- No `Booking` is used as cart or checkout state.

For multi-service visit work, the checkout lifecycle is group-level. Each proposed unit owns its own
matching/offer/reservation substate, while the group derives `PARTIALLY_HELD` or `ALL_UNITS_HELD`.
Payment cannot start until every unit required by the accepted all-or-nothing plan is held. Failure of
one required unit releases the other tentative holds and enters `REPLAN_REQUIRED`; it never silently
changes the confirmed structure.

## Booking fulfilment lifecycle for A1-A4

```text
AWAITING_ASSIGNMENT       only where an approved payment-first mode exists
CONFIRMED                 payment policy satisfied and Partner accepted
EN_ROUTE
ARRIVED
IN_PROGRESS
COMPLETION_SUBMITTED
  → COMPLETED
  → PARTIALLY_COMPLETED
  → DISPUTED

From pre-work states:
  → RECOVERY_REQUIRED → CONFIRMED | CANCELLED
  → CANCELLED

From IN_PROGRESS:
  → ABORTED → PARTIALLY_COMPLETED | DISPUTED
```

Payment, refund and assignment states are not encoded inside this enum. `RECOVERY_REQUIRED` makes the
loss of an accepted Partner explicit; it never pretends that the original assignment remains healthy.

Every transition records actor, source state, target state, reason, server time, idempotency key and
request/trace identity. Invalid transitions return a stable conflict code and current state.

## Partner offer and accidental acceptance

Before acceptance the Partner sees service, scope, approximate area, start/window, estimated occupied
time, required equipment, expected travel and net earning. Exact address and direct contact remain
hidden.

The UI uses an explicit confirmation sheet rather than a single destructive tap. After provisional
acceptance:

- a 120-second no-fault undo remains available and Customer payment has not started;
- the Partner may choose **Commit now** to end the undo window deliberately;
- Scheduled/Today exact address disclosure waits until that window ends;
- Instant may disclose immediately because travel must begin, so address access is audited;
- repeated undo is measured for product/fraud review but does not feed an automatic weighted penalty;
- after the window, release remains possible with reason and recovery.

## Arrival and start

- `EN_ROUTE` is a Partner statement, not GPS proof for home-service archetypes.
- Customer cancellation charges never depend on `EN_ROUTE` alone.
- `ARRIVED` records server time and starts a configured Customer contact/wait workflow.
- Arrival does not start paid work.
- Start OTP is single-use, rate-limited, expires, and atomically creates `WorkSession.started_at`.
- If OTP or SMS is unavailable, an audited Operations-assisted start uses step-up verification and
  records the outage reason. It is never a universal bypass code.

## Work outcomes and completion

The Partner submits an outcome per scope line and required evidence. The Customer then may:

- confirm completion;
- report incomplete/poor/damaged work;
- remain silent until the configured response deadline.

If the Customer confirms, settlement proceeds. If the Customer disputes, payout remains pending and a
typed case opens. If the Customer is silent, required evidence and lack of an open safety/damage case
allow automatic finalization after the response deadline. Silence never finalizes a booking with
missing mandatory evidence.

Partial or aborted work is priced from completed catalog scope lines where possible. The Customer is
refunded for unperformed lines. Unpriced or contested physical work is resolved by Operations; it is
never silently billed or silently written off.

## A1 task visit

- Customer buys task units, not minutes.
- `estimated_minutes` reserves capacity but does not change price.
- Running long is an internal at-risk signal, never an overtime charge.
- Additional work is a scope amendment priced from the active catalog and requires approval.

## A2 inspection first

```text
inspection booking paid and performed
  → inspection outcome: REPAIRABLE | DIFFERENT_SPECIALIST_REQUIRED | NOT_REPAIRABLE | UNSAFE_SITE
  → optional follow-up quote
```

- The inspection fee is earned after a valid inspection outcome/evidence, not merely arrival.
- If the Customer accepts immediately and the Partner has capacity, a paid scope amendment may continue
  in the same visit.
- Otherwise the inspection closes and acceptance creates a new linked A1 follow-up booking. Any
  inspection-fee credit remains valid only for its stated period.
- A 72-hour quote never holds the Partner's calendar open.

## A3 time block

- Customer buys blocks/minutes and sees server-derived remaining time.
- An extension requires capacity, quote, approval and payment before time is added.
- Unapproved overrun is visible and non-billable; the Partner must complete, extend or abort honestly.

## A4 recurring series

- A series owns recurrence, continuity target, billing cycle, pause/end policy and materialization
  horizon.
- Each visit is a booking with its own Partner, OTP, evidence and outcome.
- Skip, pause, series cancellation and individual-visit cancellation are distinct commands.
- Substitution is visible in advance and affects only the relevant visit.

## A5 custom project

```text
request → proposals → accepted agreement → funded milestone
        → work/evidence → customer approval/dispute → release → next milestone
```

Change orders are versioned and require both parties' approval. Funds are not described as escrow
unless the selected regulated payment arrangement legally supports that term.

## A6 staffing

Organizations, named workers, shifts, supervisor approval, attendance events, replacement and wage
settlement form their own domain. A numeric `crew_size` on an individual Partner is not a substitute.
Work that safely requires two people cannot proceed with one.

## A7 rental

Inventory reservation, identity/deposit policy, handover condition, extensions, damage/loss, return
inspection and deposit settlement are required. A rental is not modelled as a long service visit.

## A8 trip

Trip services add driver and vehicle eligibility, route estimate, pickup verification, trip start/end,
emergency support and consented location tracking. Tracking retention is purpose-limited. Home-service
no-tracking rules do not apply to a journey whose live position is part of the product.

## A9 stay

Stay inventory, occupancy, guest policy, check-in/out, cancellation, no-show and deposit/damage rules
are separate from Partner calendars.

## A10 listing

A listing has moderation, publication, expiry, report and lead/application states. It does not create a
service `Booking` merely to reuse tables.

## Concurrent transition rule

Competing commands are resolved by allowed conditional transitions inside a transaction. The first
committed valid transition wins. There is no universal Customer/Partner priority. Financial correction
after the winner is handled through refund, compensation, credit or ledger adjustment rather than
rewriting history.
