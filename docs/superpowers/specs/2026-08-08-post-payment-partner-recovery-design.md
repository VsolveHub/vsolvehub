# Post-payment partner recovery

Date: 2026-08-08
Status: approved, not yet implemented

## The problem

A partner released a paid booking (`417eb86d…`, the 09 Aug cleaning visit). Two days later
the customer still sees "Finding a replacement professional" and their money is still held.

`release_booking_partner` moves the booking to `RECOVERY_REQUIRED`, releases the reservation,
and stops. Verified against the dev database:

- the unit has **zero `PartnerOffer` rows** — no search was ever run
- `reconcile_group_dispatch` returns at its first line because `BOOKED` is in
  `GROUP_TERMINAL_STATUSES`, so the Operations "recover unit" button is a **no-op** that still
  writes a `RECOVER_UNIT` audit row claiming a human intervened
- neither `sweep_late_bookings` (filters `CONFIRMED`/`EN_ROUTE`) nor
  `sweep_unacknowledged_assignments` (filters `CONFIRMED`) touches it
- `release_booking_partner` sends no notification and opens no case
- `evaluate_unit_candidates` returns 0 eligible partners for that unit anyway — every partner
  in the area is excluded, almost all `VARIANT_NOT_OFFERED`

Post-payment recovery was designed as a manual Operations action. The only entry point,
`start_partner_recovery_offer`, is dead code — never referenced by any view, URL or contract.
The live equivalent is the `/operations/manual-offers` page, a blank form needing a pasted
unit UUID and partner UUID. Nothing tells an operator the booking exists.

Meanwhile the customer cannot act either. The visit panel says "Cancellation and rescheduling
are on the booking below" and the booking has neither. `POST /bookings/{id}/cancel/`,
`/reschedule/`, `/booking-groups/{id}/cancel-booked/`, `/reschedule/` and `/address/` are all
live in the backend and **entirely unwired in the customer app**, which only calls the
pre-payment group cancel whose own copy reads "Nothing has been charged, so there is nothing
to refund."

## What we are building

When a partner releases a paid booking, the platform re-assigns it automatically. If nobody
can take it, the customer is refunded in full for that service, automatically. And a customer
who does not want to wait can cancel or reschedule the visit themselves.

## Decisions

| Decision | Choice |
|---|---|
| Retry policy | Retry until the candidate pool is exhausted, or a deadline before the visit start, whichever comes first |
| Exhaustion outcome | Auto-refund that service in full, immediately, and cancel only that visit |
| Frontend scope | Per-visit cancel and reschedule |
| Engine | Extend the shared dispatch engine rather than build a second one |
| Broken tests | Repair `test_payment_capture.py` first, before touching the dispatch engine |

## Backend design

### The blocker: the recovery guard does not survive an offer round-trip

`_is_post_booking_recovery(group, unit)` is defined as
`group.status == BOOKED and unit.status == RECOVERY_REQUIRED`. But `accept_unit_offer` calls
`_set_unit_status(unit, HELD)`, and `decline_or_undo_unit_offer` calls
`_set_unit_status(unit, MATCHING)`. So the moment a replacement partner accepts, the unit stops
looking like a recovery, `_blocks_offer_action` starts refusing, and the commit fails.

`UNIT_STATUS_BY_BOOKING_STATUS` shows unit status is meant to be a *projection of the booking
status*. The offer engine writing unit status directly is what breaks the derivation.

**Fix:** redefine the predicate on the durable fact — this unit has a `Booking` in
`RECOVERY_REQUIRED` — rather than on the unit's transient projection.

### Components

**1. `_is_post_booking_recovery` keyed off the Booking.** One predicate change in
`apps/assignments/group_services.py`. The guard then survives accept → commit.

**2. Both release paths enqueue `booking.replacement_requested`.** Via `enqueue_outbox_event`,
inside the existing transaction, so it cannot fire on a rolled-back release.

There are **two** ways a booking reaches `RECOVERY_REQUIRED`, and both currently orphan it:
- `fulfilment.recovery_services.release_booking_partner` — the partner declines the job
- `assignments.suspension.release_future_work` — the partner is suspended or offboarded, and
  every future booking of theirs is bulk-released

The second is the more damaging one: suspending a single partner silently strands every future
booking they held. The sweep in component 5 is the backstop that catches both regardless, but
both should also fire the event directly so recovery starts in seconds rather than at the next
tick.

**3. `attempt_booking_replacement(booking_id)` — new `apps/fulfilment/replacement.py`.**
- returns early if the booking is no longer `RECOVERY_REQUIRED` (idempotent under retry)
- returns early if a **live offer** (`OFFERED` or `ACCEPTED_PENDING_UNDO`) already exists for the
  unit — a search is already in flight and must not be duplicated
- past `M1_REPLACEMENT_DEADLINE_MINUTES` before `unit.requested_start`: revoke any outstanding
  offer (`status = REVOKED`, release its reservation if it holds one), then
  `settle_unstaffable_booking`
- otherwise `_dispatch_unit(group=group, unit=unit)` — same-day gets a timed offer, advance gets
  direct assignment, identical to first-time dispatch
- `_dispatch_unit` returns `None` (no eligible candidate) → `settle_unstaffable_booking`.
  `directly_assign` already skips `_compensate_group` when `_is_post_booking_recovery` is true,
  so an exhausted advance unit will not drag the whole group to `REPLAN_REQUIRED`.

**4. `_commit_locked_unit_offer` finishes a recovery.** When it is a post-booking recovery:
confirm the reservation rather than setting a payment-window expiry — the money is already
captured — and call the existing `recover_booking_partner` to rewrite the booking's
partner / reservation / schedule in place. `RECOVERY_REQUIRED → CONFIRMED` is already in
`ALLOWED_TRANSITIONS`.

**5. `sweep_bookings_awaiting_replacement` — new beat task, 60s.** Re-runs
`attempt_booking_replacement` for every `RECOVERY_REQUIRED` booking that has no live offer
(`OFFERED`, `ACCEPTED_PENDING_UNDO`) and no live reservation (`TENTATIVE`, `CONFIRMED`) on its
unit. This covers expired offers and silent partners; `decline_or_undo_unit_offer`
already chains to the next candidate on an explicit decline. `evaluate_unit_candidates` excludes
already-attempted partners via `AssignmentAttempt`, so successive passes walk down the ranking
until the pool is exhausted — no second retry loop to keep in sync with the first.

**6. `settle_unstaffable_booking(booking_id)`.**
- `RECOVERY_REQUIRED → CANCELLED`, `command=REPLACEMENT_EXHAUSTED`, `actor=None`
- full refund through `create_partial_refunds`, zero fee, `reason_code="replacement_unavailable"`
- releases the reservation
- notifies the customer
- touches only that visit; the rest of the order is untouched

**7. `M1_REPLACEMENT_DEADLINE_MINUTES = 60`.** Stop searching an hour before the visit starts,
so a customer who is going to be refunded finds out with time to make other plans.

**8. Escalating offer cadence.** The standard marketplace behaviour when a job is at risk is to
cycle candidates faster as the slot approaches, not to keep a leisurely TTL. A replacement offer
inside `M1_REPLACEMENT_URGENT_MINUTES` (default 180) of the visit uses
`M1_REPLACEMENT_URGENT_OFFER_TTL_SECONDS` (default 30) instead of the standard offer TTL, so a
silent partner burns half a minute rather than the full window before the next candidate is
tried. Eligibility filters are **not** relaxed under time pressure — a partner who does not
offer the variant still cannot do the job, and widening that would send someone unqualified.

## What this borrows from how the category usually works

Judged from observable marketplace behaviour, not anyone's internals:

- **Recovery is automatic and the default.** A customer is not asked to re-book because a
  supplier dropped out; the platform absorbs it. That is the core of this change.
- **Don't alarm the customer during a fast recovery.** If a replacement commits in seconds, the
  customer never needed to know. The status copy therefore distinguishes *reassigning* (search
  live, calm wording) from *could not staff* (settled, refunded) rather than leading with "your
  professional cancelled".
- **Escalate urgency as the slot nears** — component 8.
- **A hard, honest fallback.** When nobody can be found, cancel and refund in full rather than
  leaving the booking open. The refund notification carries a link back into booking, so the
  customer's next step is one tap rather than starting over.

**Deliberately not adopted:** partner reliability scoring. `grep` finds no acceptance-rate,
cancellation-rate or reliability signal anywhere in `ranking.py` or `partners/models.py`, so
there is nothing to feed a release into. Penalising a partner who drops jobs is standard in this
category and worth building — but it is its own feature with its own fairness questions, not a
rider on this one.

### Data flow

```
partner release
  -> booking RECOVERY_REQUIRED, reservation released
  -> outbox: booking.replacement_requested
  -> attempt_booking_replacement
       |- candidate found -> offer (same-day) or direct assign (advance)
       |     |- accepted + committed -> recover_booking_partner -> booking CONFIRMED
       |     |- declined             -> next candidate immediately
       |     '- expired / silent     -> beat sweep -> attempt_booking_replacement
       '- no candidate, or past deadline -> settle_unstaffable_booking
             -> booking CANCELLED, full refund, customer notified
```

## Frontend design

Per-visit scope. Every endpoint already exists; none is wired.

**`useCancelBooking` / `useRescheduleBooking`** in `apps/customer/features/visit/queries.ts`,
following the stable-idempotency-key pattern `features/payment/queries.ts` already establishes.
No auto-retry: a 409 means the booking moved under the customer.

**Cancel sheet on the visit panel.** Replaces the dead "Cancellation and rescheduling are on the
booking below" pointer at `visit-panel.tsx:234` with real controls. Shows the applicable fee band
and the refund amount **as returned by the server** — no money is computed client-side, matching
the rule the payment feature already holds.

**Reschedule sheet.** Slot picker against the existing availability endpoint.

**Honest `RECOVERY_REQUIRED` copy** in `visit-status.tsx` and `group-status.tsx`: "Your
professional stepped back — we're assigning someone else" while a search is live, and the
cancelled-and-refunded outcome once settled, instead of a permanent "Finding a replacement".

## Error handling

- Every new service is `@transaction.atomic` and idempotent on booking status, so an outbox
  redelivery or a duplicated beat tick cannot double-offer or double-refund.
- `create_partial_refunds` is already double-refund-proof: `refundable_unit_allocations`
  subtracts in-flight refunds, so a replayed settlement finds nothing refundable and returns `[]`.
- A refund that the provider rejects surfaces through the existing `FinancialException` path;
  the booking is still cancelled, because the customer is not getting the visit either way.
- `attempt_booking_replacement` failing must not roll back the release itself — the release is
  already committed and the sweep will retry.

## Testing

1. **Repair `tests/commerce/test_payment_capture.py` first.** 17 of 19 tests fail at
   `assert offers` in `_payment_ready_group`. This is regression cover over the dispatch engine
   the design modifies, and it re-arms the two-unit capture test that would have caught the
   invoice-tax bug.
2. Partner releases → a replacement offer exists within one sweep.
3. Replacement accepts and commits → same `Booking` row, new partner, status `CONFIRMED`,
   one booking per unit still.
4. Every candidate declines → booking `CANCELLED`, one full refund, no cancellation fee.
5. Zero eligible candidates at release → settled immediately, not after a wait.
6. Past the deadline with a live offer outstanding → settled, offer revoked.
7. Replay: the sweep running twice over the same booking produces one offer and one refund.
8. Frontend: cancel and reschedule mutations, fee/refund read from the server, recovery copy.

## Out of scope

- Group-level cancel-booked / reschedule / address-change UI (endpoints exist; deliberately
  deferred).
- An Operations queue listing `RECOVERY_REQUIRED` bookings. Auto-recovery removes the urgency;
  worth doing separately.
- The `reconcile_group_dispatch` no-op on a `BOOKED` group, and its misleading `RECOVER_UNIT`
  audit row.
- Moving `_issue_document` behind the outbox so a rejected invoice cannot void a capture
  (separate finding from the same session).
- `start_partner_recovery_offer` dead-code removal.
