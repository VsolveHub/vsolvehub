# 3. Allocation-based money model

- Status: Accepted
- Date: 2026-08-01

## Context

A booking group is paid for once, but it is fulfilled as several independent units (ADR-0001).
That creates an immediate question: what does a payment attach to?

Holding a single total on the group is the obvious answer and the wrong one. The moment one unit
is cancelled, one partner does not arrive, or one service is completed and another is not, the
system has to answer "how much of this payment belongs to that unit" — and a group total cannot.
Every implementation that starts with a group total ends up deriving per-unit shares at refund
time, by re-running pricing or by apportioning after the fact. Both recompute a number that was
already known when the customer paid, and both drift from it: pricing changes, promotions expire,
and a refund computed months later no longer matches the money actually taken.

The alternative of tracking money only per unit fails differently, because a customer makes one
payment against one provider order and that fact has to be recorded somewhere.

## Decision

Money is recorded as **allocations across immutable unit lines**. `Payment` and `Refund` record
the provider-facing transaction; `PaymentAllocation` and `RefundAllocation` record how each amount
distributes across the units it covers.

The allocation is written when the money moves, from the amounts that were actually charged. It is
never recomputed, and the lines it references are immutable — a repriced service produces new
lines, it does not mutate the ones a payment already points at.

A refund is therefore a lookup, not a calculation. Refunding a unit reads what was allocated to
that unit and returns it.

## Consequences

Partial refunds and per-unit outcomes need no second money path. Cancelling one unit of a
five-unit group, refunding a service the partner could not complete, and refunding the whole group
are the same operation over different sets of allocations.

Reconciliation has a single source of truth. The sum of allocations must equal the transaction
amount, which makes an inconsistency a detectable invariant violation rather than a discrepancy
someone notices in a support ticket.

**BE-09 must not add a parallel money path.** Any feature that introduces a group-level amount, a
recomputed refund, or a per-unit share derived at refund time reintroduces exactly the drift this
model exists to prevent. New money behaviour extends the allocation set; it does not bypass it.

The cost is write-time complexity. Taking a payment means deciding the split immediately, even
when the customer experience is a single amount, and rounding across units has to be resolved at
that moment rather than deferred. A group of three units is three allocation rows, not one number.
