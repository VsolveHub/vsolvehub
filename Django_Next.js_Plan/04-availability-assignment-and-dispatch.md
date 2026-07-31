# Availability, Assignment and Dispatch

## Principles

- Eligibility answers whether a Partner *may* do the work.
- Availability answers whether they explicitly offered the time.
- An offer asks whether they *will* do this booking.
- A reservation protects accepted time.
- Assignment becomes firm only after the Partner accepts and the booking's payment policy succeeds.

These facts must not be collapsed. Presence, push delivery, a default schedule or an algorithm cannot
give consent on a Partner's behalf.

## Eligibility gates

For visit work, every candidate must satisfy:

- approved and not suspended/offboarded;
- required service, skill, equipment and any background-check policy;
- service area and maximum travel boundary;
- full occupied range inside explicit availability and area operating hours;
- no overlapping active reservation;
- pairwise travel feasibility from the preceding job and to the following job;
- no Customer/Partner block and no self-assignment;
- archetype-specific gender/safety rules where legally and product-appropriate;
- for Instant: fresh online presence, delivery-capable device and fresh consented location.

The occupied range includes the service estimate and minimum travel/setup buffers. Pairwise travel may
increase required gaps. A routing adapter may replace the initial conservative estimator without
changing the domain rule.

## Publishing availability

- Partners declare working periods during onboarding and can edit future periods.
- Date exceptions express leave, special hours and breaks.
- Operations may assist with explicit Partner consent; every change is audited and visible to the
  Partner.
- Confirmed reservations are shown on the Partner calendar.
- An availability reduction overlapping accepted work does not silently move it. The Partner must
  keep the work, release it, or contact Operations.
- `BUSY` is derived from reservations and active work.

## Availability search

Availability is a query across eligible Partner calendars for the requested occupied range. Display
results may be cached briefly, but checkout-time offer/reservation creation is authoritative. A stale
display result returns `WINDOW_NO_LONGER_AVAILABLE` and refreshed alternatives.

PostgreSQL protects active reservation overlap using an exclusion constraint on Partner and
`occupied_range`. Candidate retries handle normal contention. No pool-capacity counter is maintained.

## Scheduled and Today assignment

```text
1. Customer selects a window and accepts the quote/policy.
2. Backend ranks eligible Partners.
3. Send one bounded PartnerOffer with scope, area, time and net earning.
4. ACCEPT → create TENTATIVE PartnerReservation and enter the 120-second no-fault undo window.
   DECLINE/EXPIRE/DELIVERY_FAILURE → next eligible Partner.
5. Undo → release and try the next Partner. Commit/undo expiry → enable Customer payment.
6. Customer pays within the reservation deadline.
7. Verified capture → Booking(CONFIRMED), reservation CONFIRMED, assignment active.
8. Payment fail/expiry → release reservation; no booking and no Partner penalty.
```

The customer sees a bounded finding state before payment and can cancel at any time. If the full pool
is exhausted, alternatives are returned without charging the Customer.

At pilot density, Operations may assign using the same offer/accept command. Operations cannot force an
accepted state.

## Partner decision UX

An offer includes enough information for informed consent without unnecessarily exposing Customer PII:

- service and scope;
- approximate area;
- Scheduled start/window or Instant ETA expectation;
- estimated occupied duration;
- special access/equipment/safety notes that affect acceptance;
- estimated travel and Partner net earning;
- response deadline.

The primary actions are **Accept** and **Decline**. Decline has no automatic penalty. Acceptance uses a
confirmation sheet, then a 120-second no-fault undo. The Customer cannot start payment and Scheduled
exact address disclosure does not occur until the Partner commits or that window expires.

## Ranking

Initial deterministic order:

1. eligibility and safety gates;
2. travel feasibility;
3. customer-requested prior Partner, if fully eligible;
4. shortest estimated travel;
5. least recently assigned among near-equal candidates;
6. stable random tie-break recorded for audit.

Rating is used only after a minimum evidence threshold and never overrides material travel or safety.
Declines and cancellations are not hidden ranking penalties. Every attempt records the policy version,
candidate IDs, decisive factors and outcome, with privacy-limited retention.

Statistical optimization, exploration bonuses, tiers and personalized incentives require production
data, an approved experiment and an appeal/explanation policy before adoption.

## Instant dispatch

Instant is a later product capability, not an M1 feature flag. It may activate only when:

- eligible pool size and acceptance latency meet the area launch gate;
- the Partner application proves reliable background notification delivery;
- current Partner location is explicit, consented and fresh;
- refund and assignment-recovery Operations capacity exists;
- load, failure and concurrency acceptance pass.

Preferred payment ordering:

```text
payment authorization → bounded Partner offers → first valid acceptance → capture → confirm
```

If the chosen Indian payment method cannot support a reliable authorization/capture sequence, the
approved alternative is:

```text
capture → bounded Partner offers → accept and confirm
                         └→ no acceptance: immediate full refund + honest timeline
```

The payment provider decision must be made from its official capabilities; the domain supports both
strategies. It never replaces Partner Accept with coercive Acknowledge.

Initial dispatch is sequential and bounded. Parallel/broadcast waves are introduced only when measured
latency requires them, because they increase revoked-offer and concurrency load. A database conditional
transition plus one-active-assignment constraint ensures a single winner.

## Partner cancellation and release

Before work begins, release is always allowed:

- inside the no-fault undo: release, no count, no Customer notification unless identity was already
  disclosed;
- accepted but not en route: immediate replacement search, reason recorded;
- en route/arrived: urgent recovery, Customer informed, Operations case opened;
- after start: use `ABORT_WORK`, not release.

Release events keep timing, reason, delivery evidence and attribution. During pilot, repeated late
release/stall/no-show is reviewed manually. Automated capability restriction requires a later approved
risk policy with minimum sample, exclusions, Partner explanation, dispute and recovery. It must never
quietly manipulate rating or rank.

## Loss of an accepted Partner

The booking enters `RECOVERY_REQUIRED` and the active assignment closes. Recovery order:

1. ask the Customer whether the original window remains acceptable when material delay is expected;
2. search for a replacement with a strict deadline;
3. offer concrete reschedule choices;
4. provide full refund if no acceptable replacement exists.

If a replacement is found before the original Partner identity was disclosed, normal confirmation copy
may proceed. Once identity was disclosed, the Customer is told that the professional changed. A changed
name must never appear without explanation.

## Stall and lateness

- No `EN_ROUTE` by the configured departure deadline: one nudge, then recovery.
- ETA/arrival SLA exceeded: Customer sees delay and gets a fee-free cancel/reschedule option.
- No arrival after the late threshold: urgent Operations case and recovery.
- ETA is text and updated only from a fresh routing calculation triggered by an explicit Partner action
  or Operations correction. Home-service UIs do not animate fabricated movement.

## Coordination failure

- New Instant searches fail closed when required coordination/presence infrastructure is unhealthy.
- Scheduled offers may continue through PostgreSQL and durable messaging if safe.
- An existing paid booking is never silently abandoned. It remains visible, enters recovery and either
  confirms, reschedules or refunds.
- Browser closure does not stop offer expiry, reservation expiry, recovery or notifications.

## Metrics

Measure without prematurely automating policy:

- eligible candidates per area/service/window;
- time to first offer delivery and acceptance;
- decline, expiry, delivery-failure and accidental-undo rates;
- payment abandonment after Partner acceptance;
- accepted-Partner release by time band and attributed cause;
- late arrival, no-show, recovery and refund rates;
- availability-search latency and constraint conflicts;
- Customer conversion and Partner retention.
