# Booking Groups and Fulfilment Planning

## Product invariant

A Customer may place multiple compatible service requests in one cart. The server, not the browser,
decides how those requests can be fulfilled. The confirmed customer aggregate is a `BookingGroup`;
its execution children are `FulfilmentUnit` records.

- One `BookingGroup` contains the complete structure, price and confirmation accepted by the
  Customer.
- One `FulfilmentUnit` has exactly one operational window, one lead Partner assignment, one
  reservation chain, one work lifecycle and one settlement allocation.
- A unit may contain multiple service lines only when one eligible Partner can safely perform every
  line sequentially within the occupied range.
- Parallel work is represented by multiple units with coordinated overlapping windows. One Partner
  is never represented as performing two units in parallel.
- Independent visits remain separate units even when one Order and Booking Group collect them.
- Category equality is never proof of compatibility or Partner eligibility.

This model is product-wide for bookable service work. Archetypes retain their own lifecycle engines:
projects, staffing, rentals, trips, stays and listings are not forced through visit planning merely
to appear in a universal cart.

## Durable model

```text
Customer
  └─ Cart(version)
       └─ CartItem[]
            └─ CartItemScope[]

Cart + address + preferences + policy versions
  └─ FulfilmentPlanSet(expires_at, cart_version)
       └─ FulfilmentPlan[]
            └─ PlanUnit[]
                 └─ PlanUnitItem[]

Selected plan
  └─ PriceQuote(status, immutable snapshots)
       ├─ QuoteUnit[]
       └─ QuoteLine[]

Confirmed quote
  └─ CheckoutSession / BookingGroup
       └─ FulfilmentUnit[]
            ├─ FulfilmentUnitLine[]
            ├─ AssignmentAttempt[]
            ├─ PartnerOffer[]
            ├─ PartnerReservation
            └─ Booking

Order / PaymentAttempt
  └─ PaymentAllocation[] → unit and quote lines
```

The implementation may preserve existing table names during an expand/migrate/contract rollout, but
the public and domain relationships above are the target. A `Quote` must no longer depend on one
`CartItem`; assignment and reservation records must no longer depend directly on a group-level
checkout.

### Cart rules

- A Customer/session has one active cart containing many items.
- Each item is an independently scoped request with stable identity and optimistic versioning.
- Add, update and remove are explicit commands. Adding a different service never replaces another
  item and never needs a singleton replacement flag.
- Login merge preserves all non-duplicate items. Exact duplicate items are resolved by a published
  merge rule or an explicit Customer decision; no side silently wins.
- Every mutation increments `Cart.version` and invalidates active plan sets and quotes derived from
  the previous version.
- Historical quotes remain readable with `INVALIDATED`, `EXPIRED` or `CONSUMED` status, but cannot be
  checked out after their cart/plan inputs change.

### Compatibility configuration

Compatibility is effective-dated Operations configuration, reviewed before activation and
snapshotted into the plan. Rules may declare:

- `SAME_PARTNER_SEQUENTIAL_ALLOWED`;
- `PARALLEL_ALLOWED`;
- `MUST_BE_SEPARATE`;
- directional `REQUIRES_BEFORE` / `REQUIRES_AFTER` dependencies;
- shared-site, equipment, certification, safety or maximum-duration conditions.

Missing configuration defaults to separate units, not rejected demand and not guessed combination.
Pairwise permission is necessary but not sufficient: the planner validates the complete candidate
unit, its dependency graph and occupied range.

## Planner inputs and output

The planner consumes only authoritative inputs:

- cart ID, cart version and all current item/scope versions;
- one confirmed address for the Booking Group in the initial visit implementation;
- serviceability and area operating hours;
- archetype, compatibility and dependency rules;
- current rate, tax, fee, cancellation and commission policies;
- Partner eligibility for every exact variant, including skill, equipment and area;
- explicit Partner availability and reservation conflicts;
- Customer timing and structure preference where offered;
- server time and configured planning limits.

It returns a bounded, ranked set of immutable plan alternatives. Each alternative includes:

- opaque plan identifier and expiry;
- `SINGLE_PARTNER_SEQUENTIAL`, `COORDINATED_PARALLEL`, `INDEPENDENT_VISITS` or `MIXED` structure;
- units, included cart lines, dependencies and estimated occupied duration;
- one server-authored window per unit and whether capacity remains preliminary;
- unit price lines, group-level lines, tax, total and cancellation treatment;
- professional count and visit count without disclosing Partner identity;
- explicit reasons when an item must be separate;
- all-or-nothing confirmation policy and safe recovery action.

The Customer sees the recommended plan and materially different alternatives before confirmation.
The ranking starts deterministic: feasibility, explicit Customer preference, fewer visits, earlier
completion, lower total, then a stable recorded tie-break. Price never wins over safety or eligibility.

## Planning algorithm

1. Validate every cart item independently and report item-specific failures.
2. Build the approved compatibility/dependency graph.
3. Enumerate a bounded set of feasible partitions; reject cycles and unsafe combinations.
4. For each proposed sequential unit, intersect the eligible-Partner sets for every exact variant.
5. Calculate combined occupied duration, operating-window fit and reservation feasibility.
6. For parallel units, prove independence and separate eligible capacity for the coordinated range.
7. Price every unit and the group from effective policies; apply minimum-visit rules per unit.
8. Rank and sign the alternatives against the cart version and input fingerprint.

Availability shown before Partner acceptance is honest preliminary capacity. The planner never claims
that a named Partner is held. Checkout revalidates the plan, and reservations are created only by
valid Partner acceptance.

## Group assignment and atomic customer intent

The default confirmation policy is `ALL_OR_NOTHING`:

```text
PLANNED → CONFIRMED → MATCHING → PARTIALLY_HELD → ALL_UNITS_HELD
        → PAYMENT_PENDING → BOOKED
        → REPLAN_REQUIRED | CANCELLED | EXPIRED | FAILED
```

- Matching runs independently per unit against Partners eligible for every line in that unit.
- A group coordinator owns deadlines and derives aggregate state; browsers only observe.
- Partner acceptance creates a tentative reservation for that unit.
- Customer payment is enabled only after every required unit is committed and tentatively reserved.
- If any required unit exhausts its candidate pool or loses capacity before payment, the coordinator
  releases every other tentative group reservation and returns a new plan/reconfirmation choice.
- The system never silently change visit count, professional count, windows or total after Customer
  confirmation.
- A future `ALLOW_PARTIAL` policy requires explicit Customer opt-in, independent unit totals and
  clearly stated partial-success handling; it is not an implicit fallback.

Because Partner decisions are asynchronous, group coordination is a retry-safe saga with durable
steps and compensations, not a distributed database transaction.

## Money, cancellation and documents

- Minimum-service subtotal applies per Fulfilment Unit because each unit is an operational visit.
- Group-level fees appear once when their effective policy says once; unit-level fees are attached to
  the affected unit. Allocation and rounding rules are snapshotted.
- One group payment may collect the total only after every required unit is held.
- `PaymentAllocation` assigns captured money, tax, discount, refund and chargeback exposure to exact
  units/lines.
- Partner earnings, commission, cancellation compensation and ledger entries are unit-specific.
- Customer cancellation may target the whole group or eligible individual units. The server returns
  the resulting unit and group totals before confirmation.
- One unit's failure never makes another unit appear completed or refunded. Documents retain
  unit/line traceability even when one legal invoice covers the Order.

## Customer, Partner and Operations projections

- Customer reads the Booking Group and all Customer-safe units, Partners, deadlines, money and
  recovery choices.
- A Partner offer/job contains only the assigned unit's service lines, occupied range, requirements,
  disclosure-safe address data and earnings. It excludes other units and Partner identities.
- Operations sees the group/unit dependency graph, assignment and reservation timelines, financial
  allocations, current owner/SLA and only the commands valid for the affected scope.

## Concurrency and database invariants

- Optimistic `Cart.version` prevents a plan from being confirmed after a concurrent edit.
- Every item appears exactly once in each complete plan alternative.
- Every confirmed plan line maps to exactly one Fulfilment Unit.
- A unit has at most one live offer and one active lead assignment.
- PostgreSQL exclusion constraints prevent Partner reservation overlap across all groups.
- One quote can create at most one checkout/group; one idempotency key cannot confirm two plans.
- Group payment cannot start until all required unit reservations are valid.
- A unit cannot be booked twice by duplicate webhook or saga redelivery.
- Compensation is idempotent and cannot release a reservation already converted to an unrelated
  valid booking.

## Milestone evolution without replacement architecture

- M1 implements multi-item A1 carts, planning, sequential/parallel/separate units, group quote,
  coordinated assignment, unit bookings and allocated money for a conservative launch catalog.
- M2 adds inspection/material/warranty rules as new planner inputs and unit types; it does not replace
  the group model.
- M3 adds time-block and recurring-series units. A series remains its own aggregate and may create
  linked visits in a group where product policy permits.
- M4 adds Instant unit timing and payment ordering without changing cart/group/unit cardinality.
- M5-M7 add project, staffing, rental, trip, stay and listing aggregates. Only compatible purchasable
  outputs link to an Order/Booking Group; their native lifecycle is never flattened into A1.

## Required acceptance families

- two compatible services become one unit and one Partner receives both lines;
- same-category services with no common eligible Partner do not combine;
- independent services become coordinated parallel units only when distinct capacity exists;
- dependency or window conflict produces separate visits with an explanation;
- changing the cart invalidates the plan/quote without deleting history;
- one unit losing capacity releases group holds and requires visible replanning before payment;
- duplicate confirmation, offer acceptance, payment and webhook delivery create one group/unit set;
- unit cancellation/refund/partial completion reconciles group totals and unaffected units;
- Partner payloads cannot expose another unit or Partner;
- Operations can recover every partially held, paid-ambiguous and partially fulfilled group state.
