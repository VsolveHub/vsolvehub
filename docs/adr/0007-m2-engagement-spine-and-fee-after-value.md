# 7. M2 engagement spine and fee after value

- Status: Accepted; the A5 fee model is superseded by ADR-0008 (visit-first estimation), and the
  A3 front door (teasers and the INR 149 unlock as the primary path) is superseded by ADR-0009
  (rate-card instant dispatch; the unlock machinery remains as the thin-supply fallback). The
  engagement spine and mode-per-archetype remain in force.
- Date: 2026-08-10

## Context

Commercial M2 adds workforce supply (`A3_TIME_BLOCK`) and project delivery (`A5_CUSTOM_PROJECT`) to
a platform whose only production lifecycle is the A1 task visit. Both new lifecycles replace a
server-calculated catalog price with a vendor-authored quotation, which forces three questions that
A1 never had to answer: when the platform collects money, who holds the service money, and how
fulfilment is modelled once the unit of work is no longer a single priced visit.

The first M2 plan answered them by charging a matching fee of INR 99 or INR 149 before any vendor had
been invited, by making the commercial mode a per-variant configuration that Operations could set, and
by modelling workforce and project fulfilment as two parallel aggregate families
(`WorkforceAgreement` / `CrewAssignment` / `Attendance` / `TimeExtension` beside `ProjectAgreement` /
`Milestone` / `ChangeOrder`).

An audit of that plan found each of the three costly:

Charging before matching creates states the platform then has to unwind — paid but nobody quoted,
paid but only one of two promised quotes arrived, paid but supply disappeared between the preflight
check and the payment. Roughly half the refund matrix, the supply-preflight gate, and the entire
entitlement-restore machinery existed only to recover from those states. It also asks a customer to
pay an unknown brand before seeing a single price, which is the hardest ask in the product.

A per-variant commercial mode doubles every downstream path: two agreement shapes, two cancellation
policies, two refund matrices, two disclosure policies and two Operations runbooks, multiplied across
every service variant. The two modes are not, in practice, independent of the lifecycle. Day-labour is
a cash-per-day market where platform-enforced escrow cannot be made to hold and where attempting it
produces commission the platform cannot collect. Project work is the case where staged funding is the
product the customer is actually buying.

The two fulfilment families are the same shape wearing different names. Both are an agreement with
ordered stages; each stage carries evidence, an approval decision and a money consequence. A shift-day
and a milestone differ in duration and in what counts as evidence, not in lifecycle. Building them
twice doubles the approval, dispute, timeout and release logic — the code most expensive to get wrong
— and M1 already owns a scope-amendment engine that both `TimeExtension` and `ChangeOrder` restate.

## Decision

The platform collects the matching fee only after a usable quote exists. A requirement is free to
submit and free to match. Once at least one confirmed, complete, in-budget quote is available, the
customer sees a teaser for each — verification badge, rating, vendor type and headline price band —
and pays a single INR 149 unlock to read the full scope and price of up to three quotes, to clarify
them and to select one. There is no tier, no promised exact quote count and therefore no
partial-fulfilment refund.

Commercial mode is a property of the fulfilment archetype, not of the service variant.
`A3_TIME_BLOCK` is always `LEAD_ONLY`: contact is released on confirmation and the customer pays the
vendor directly. `A5_CUSTOM_PROJECT` is always `MANAGED_PAYMENT_REQUIRED`: the customer funds one
stage at a time through the platform. Operations cannot vary this for a variant, a Partner or a
customer.

Workforce and project fulfilment share one aggregate. An `Engagement` is created from a selected
proposal and carries the archetype and the immutable commercial terms. An `EngagementStage` is one
ordered stage of that engagement — a shift-day under A3, a milestone under A5 — and both use the same
start, submit-evidence, approve, request-correction, dispute, timeout and release commands. Every
post-agreement scope or money change, whether an A3 time extension or an A5 change order, executes
through the existing M1 scope-amendment engine in `apps.fulfilment.amendments`.

## Consequences

Vendors now quote before the customer has paid anything, so the platform spends supply-side goodwill
to earn demand-side conversion. This is the deliberate direction of the trade: quote volume per paying
customer becomes a metric that must be watched, and a category where vendors quote repeatedly without
unlocks must be repriced or closed rather than left to erode vendor trust.

Revenue in A3 is the unlock fee and nothing else. The platform never sees the service money for
labour supply, cannot take commission on it, and must not present an A3 connection as a protected
booking. This makes the unit economics of A3 explicit and unforgiving: every Operations minute spent
recovering an A3 request is charged against INR 149, which constrains how much human recovery the
Operations workspace may assume.

Fixing mode to archetype removes a configuration surface the business may later want. A category that
turns out to need the other mode cannot be reconfigured; it must be reclassified to the other
archetype, which changes its lifecycle, its vendor pool and its fulfilment shape. That is a heavier
operation than flipping a flag, and it is intended to be.

The single spine means A3 and A5 share the approval, dispute and release code paths, so a defect in
stage settlement is a defect in both archetypes at once. The shared paths therefore carry a single
test suite exercised under both archetypes, and archetype-specific behaviour is confined to
configuration and to evidence policy rather than to parallel command implementations.

Supervisor-level attendance follows from the spine rather than from a separate attendance system: a
shift-day stage is approved as a unit. Per-worker records are captured only when a customer disputes a
day, which means the platform does not hold per-worker attendance data for the overwhelming majority
of engagements. That is a deliberate reduction in both build cost and personal-data exposure, and it
accepts that routine per-worker analytics are not available.
