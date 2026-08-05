# 1. Booking group over singleton cart

- Status: Accepted
- Date: 2026-08-01

## Context

The original commerce proposal modelled a customer's basket as a singleton cart: one cart holding
a flat list of services, resolving to one booking. That shape assumed the unit a customer buys and
the unit a partner fulfils are the same thing.

They are not. A real visit is several services at one address inside one time window — a plumbing
repair and an electrical check on the same Saturday morning — and those services do not
necessarily share a partner, a price basis, a duration or a completion time. The singleton cart
could express the address and the window exactly once, so it could not represent a visit whose
services are fulfilled by different partners at different moments, nor a visit where one service
is cancelled and the rest proceed.

Forcing that into a singleton cart leaves two options, both bad: one booking per service, which
discards the fact that they share an address and a window and asks the customer to enter both
repeatedly; or one booking for everything, which makes any per-service outcome — a partial refund,
one partner running late, one service rejected — inexpressible without a parallel data path.

## Decision

The basket resolves through an explicit chain rather than a single object:

`Cart` → `CartItem` → `CartItemScope` → `PlanUnit` → `PlanUnitItem` → `Quote` → `QuoteUnit` →
`QuoteLine` → `BookingGroup` → `FulfilmentUnit` → `FulfilmentUnitLine`.

The `BookingGroup` holds what the services genuinely share: the customer, the address, the time
window and the money envelope. The `FulfilmentUnit` is the unit of work — one partner, one
assignment, one lifecycle, one completion.

Every command in the system is therefore scoped to a `FulfilmentUnit`, not to the group. Group
state is **derived** from its units and is never written directly. There is no code path that sets
a group's status; a group is confirmed because its units are, and asking the group for its state
is a read over its units.

## Consequences

Per-service outcomes need no special handling. A partial refund, a single late partner, one
rejected service and one cancelled service are all ordinary unit-level events, because the unit
was the command target from the outset.

Group state can never drift from unit state, because there is no writable group state to drift.
This removes an entire class of reconciliation bug, and it is a rule that must hold: adding a
writable status field to `BookingGroup` reintroduces exactly the inconsistency this structure
exists to prevent.

The cost is depth. Eleven models sit between a customer tapping "add" and a partner being
assigned, and a change to pricing or scoping usually touches several of them. Reading the chain
end-to-end is a prerequisite for changing any part of it.

Assignment, payment and refund all operate at unit granularity. Any later feature that wants to
act on "the whole booking" must fan out across units rather than acquire a group-level shortcut.
