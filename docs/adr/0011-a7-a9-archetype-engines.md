# ADR-0011: A7 rental and A9 stay archetype engines

Status: Accepted

## Context

A rental is custody of an asset and a stay is occupancy of a property unit. Neither is a service
visit, so forcing either through Booking Group, Fulfilment Unit, work-session OTP, or partner
availability would create false lifecycle semantics. Both nevertheless need the platform's existing
provider-payment, allocation, refund, ledger, outbox, notification, and reconciliation controls.

## Decision

- A7 uses `RentalBooking` plus an asset-scoped `AssetReservation`; A9 uses `StayReservation` plus a
  unit-scoped `UnitReservation`. PostgreSQL overlap constraints protect serialized inventory and
  physical units. Pooled rental inventory is protected by an asset row lock and quantity sum.
- A7 and A9 payments use real checkout-free `PaymentAttempt` purposes. Booking price and deposit are
  separate attempts. Immutable `RentalPaymentAllocation` and `StayPaymentAllocation` rows bind each
  charge and refund to a domain line; provider capture is the only route to confirmation.
- Holds and payment starts are idempotent. A provider failure releases only the linked hold and asks
  for an idempotent refund of a captured sibling charge. Provider reconciliation re-enters the same
  capture reducer, so confirmation converges after ambiguous webhooks.
- Deposit is a separate sub-lifecycle. Clean return/check-out refunds it; damage records evidence and
  can consume it; excess damage creates a new provider-backed recovery attempt. Manual Operations
  settlement requires the same immutable proposal to be approved by a second staff user.
- Extensions are immutable revisions. Capacity is checked before the payment starts, but inventory
  dates change only after the extension payment is captured.
- A7 cards group equivalent inventory by vendor, variant, price, and condition. A9 cards represent a
  `UnitType`; a physical unit is assigned behind the card. Customer reassignment preserves the
  commercial terms and always creates an in-app notification.
- Category policy is configuration, not a fallback hidden in code. Missing active pricing or variant
  policy fails closed.

## Consequences

The two archetypes reuse financial and operational infrastructure without pretending to be visits.
They add parallel allocation tables because the existing allocation foreign keys require Fulfilment
Units. Historical line items, evidence, extensions, allocations, and deposit transactions remain
append-only. Staging acceptance must include overlap contention, provider replay/failure, refund,
reassignment, and maker-checker scenarios.

