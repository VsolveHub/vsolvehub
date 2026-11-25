# 15. VSolve Pick up & Drop V1: parcels on the Rides engine

- Status: Proposed
- Date: 2026-11-22

## Context

The owner wants a parcel service like Uber Parcel or Rapido Parcel: a customer books a captain to
take an item from one place to another. It ships together with Rides V1, in one store version,
behind one server off switch.

It is not a new app and not a new engine. It reuses the Rides engine (ADR-0014): quotes, the fare
engine, dispatch, offers, the trip screens, history and earnings. Parcels add parcel details at both
ends, an optional delivery PIN and a return to the sender.

## Decision

See `docs/parcel/README.md` §2 (D1–D24). In short:

- A parcel is a `Ride` with `kind = PARCEL`, one-to-one with `ParcelDetails`. Bike and Auto only.
- A parcel rate card is a `RideRateCard` with `kind = PARCEL`, with a max weight and a size label.
  There is one active card per area, vehicle and kind.
- `RideState` gains `RETURNING` and `RETURNED`; the payment status gains `UNPAID`.
- The pickup code is the Rides start code. The delivery PIN is an HMAC like it, never stored and
  never logged, and exists only when PIN confirmation is on.
- The return leg is priced by the same fare engine, with the same rate card version.
- Contract `1.112.0`; the API is `docs/parcel/README.md` §4.2.

## Consequences

- No new service, app, native module or payment path. The Rides code carries the load, so a change to
  the fare engine or dispatch now affects parcels too, and its tests must cover both kinds.
- The Rides card on Home now shows only where a ride rate card is active. This reverses ADR-0014
  decision 38 (the card was always shown).
- A parcel is not insured and carries no photos. Proof is the pickup code, the delivery PIN when it
  is on, the GPS track and the timestamps.
- When a receiver does not pay or is not there, the item goes back and the money is collected at the
  pickup. A sender who does not pay leaves an `UNPAID` parcel for Operations to follow up. V1 has no
  collection or refund path.
- Online payment, tips, parcel photos and SMS to the receiver are not in V1.
