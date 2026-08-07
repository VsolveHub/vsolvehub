# Work-Based Slot Booking & Availability — Design

**Date:** 2026-08-07
**Status:** Approved, not yet implemented
**Supersedes for Archetype A1:** `docs/superpowers/plans/2026-07-19-availability-gated-dispatch.md`
(that plan targets the retired Prisma stack — `packages/db`, `POST /api/bookings`, `isOnline`,
25 km radius — none of which exist in the Django backend this spec applies to).

---

## 1. Problem

Work-based (task-priced) services like Switch / Socket Repair have no fixed duration. The customer
sees an hourly grid — `7–8`, `8–9`, `9–10` — which reads as "this job will eat an hour of my day."
It does not. The audit that preceded this spec found the confusion is **display-layer only**: the
domain model already separates price from duration correctly.

Three distinct problems, in order of customer impact:

1. **The grid lies about capacity.** `create_booking_windows()` never consults partner availability,
   so a slot can look bookable and then fail at plan-set creation with `no_eligible_capacity`.
2. **The grid lies about duration.** `ends_at` is `starts_at + 60`, which is the *arrival window*,
   not the job length. The real estimate is computed, serialised, parsed by the frontend, and then
   never rendered.
3. **The grid is blind to multi-visit carts.** One window list is computed from the *first* cart
   item and reused for every visit.

---

## 2. What is already true (do not rebuild)

Implementers must read this section before writing code. Substantially more is built than a
surface reading suggests.

### Price is already not time-based

`backend/apps/carts/services.py:686`:

```python
duration = task_rate.base_duration_minutes + task_rate.marginal_duration_minutes * item.quantity
```

`duration` feeds scheduling only. Price is `TaskRate.unit_price_paise × quantity`. Switch repair is
₹129 flat regardless of how long the visit runs. **The "same charge even if it overruns" rule is
already enforced.** The overrun risk sits with the partner.

### Duration is already per-task and variable

| Service | base | marginal | qty 1 | qty 2 |
|---|---|---|---|---|
| Switch / Socket Repair | 10 | 30 | **40 min** | 70 min |
| Fan Installation | 20 | 60 | **80 min** | 140 min |
| Tap Repair | 15 | 45 | **60 min** | 105 min |

Seeded in `backend/apps/catalog/management/commands/seed_technician_catalog.py`.
`ServiceVariant` already carries `BookingArchetype.A1_TASK_VISIT` and
`PricingStrategy.FIXED`.

### Per-visit operational identity is already modelled

`commerce.Booking` is `OneToOneField(FulfilmentUnit)` — *"One operational Fulfilment Unit after
confirmation"* (`backend/apps/commerce/models.py:61`). Everything per-visit hangs off `Booking`,
not `BookingGroup`:

| Concern | Model | Location |
|---|---|---|
| Per-visit partner / reservation / start | `Booking.partner`, `.reservation`, `.scheduled_start` | `commerce/models.py:61-107` |
| Per-visit start OTP | `BookingOtp` FK → `Booking` | `fulfilment/models.py:57` |
| Per-visit work session | `WorkSession` OneToOne → `Booking` | `fulfilment/models.py:92` |
| Per-visit cancellation | `cancel_booking(booking_id=…)` | `fulfilment/cancellation.py:245` |
| Group-wide cancellation | `cancel_booked_group(…)` | `fulfilment/cancellation.py:625` |
| Per-visit money | `PaymentAllocation` FK → `FulfilmentUnit` | `commerce/models.py:235` |
| Per-visit completion + dispute | `CompletionSubmission` / `CompletionResponse` | `fulfilment/models.py:345-405` |

### Post-completion recourse is already built

`CompletionResponse.Decision` is `CONFIRMED` / `DISPUTED` / `AUTO_FINALIZED`. The customer has
`M1_COMPLETION_RESPONSE_HOURS = 24` after the partner submits completion to dispute, with a
`dispute_reason` and a M2M to the specific `WorkOutcome` rows being disputed. Silence
auto-finalises (`fulfilment/tasks.py:66`).

### Partner presence is already built

`PartnerOnlineSession` supports go-online, heartbeat, `PRESENCE_EXPIRED`, `PARTNER_OFFLINE`,
`REPLACED`, and auto-end on suspend/offboard (`partners/services.py:1297-1505`).

### Partner weekly availability is already built

`PartnerAvailabilityRule` = `(service_area, weekday, starts_at, ends_at, ends_next_day)`, plus
`PartnerAvailabilityException` for dated leave. The partner app has a working editor with overlap
validation (`frontend/apps/partner/features/application/`). ADR-010: availability is explicit;
nothing defaults a partner to available.

### Double-booking is already prevented at the database

`assignments.Reservation` carries a Postgres `ExclusionConstraint` on
`(partner, occupied_range)` for active statuses (`assignments/models.py:104-111`). This is the
real concurrency guard — application logic must not duplicate it.

### Dead code that this spec activates

| Thing | Declared at | Emitted / used? |
|---|---|---|
| `UnavailableReasonEnum.NO_CAPACITY` | `carts/serializers.py:547`, `windows.ts:104` | **Never** |
| `M1_QUALITY_DISPUTE_WINDOW_HOURS = 72` | `config/settings/base.py:186` | **Never** |
| `BookingWindows.estimated_duration_minutes` | serialised + parsed into `WindowsView` | **Never rendered** |

---

## 3. Decisions

| # | Decision | Rejected alternatives |
|---|---|---|
| D1 | A slot is an **arrival window**: "your pro arrives between 8 and 9." Job runs as long as it runs; price unchanged. | Exact start time (requires punctuality guarantee); time-of-day band (customer loses control of their day). |
| D2 | The grid carries a **live eligible-partner count per slot**, computed at request time. Zero → disabled with a reason. | Two-tier day/slot check (day strip can still lie); keep preliminary (the post-submit failure stays). |
| D3 | The flat 120-minute lead time is **replaced by a per-slot reachability check**. | Shrink the constant (still blocks a free partner); separate express lane (two products to maintain). |
| D4 | **Partner availability is unchanged.** The hour-period editor stays exactly as built. | Day-tick simplification — considered and **rejected 2026-08-07**: two shifts with a lunch gap are a real pattern, and live capacity handles the gap correctly (`NO_CAPACITY` at 13:00) where the flat grid did not. |
| D5 | Dispatch **eligibility** is two-gated: same-day requires an online session, advance requires only a schedule rule. | Online-only (kills advance booking entirely). |
| D6 | Post-completion recourse extends the **existing dispute flow**. `cancel_booking` is not opened to `COMPLETED`. | Allowing cancel-after-complete (refunds delivered work with no `WorkOutcome`, breaks partner settlement). |
| D7 | A **single global turnaround constant** is added to reservation occupancy. | Per-partner travel buffer (new field + new UI for marginal gain). |
| D8 | Dispatch **commitment** is two-mechanism: same-day keeps offer/accept; advance is **direct assignment** — the reservation is written `CONFIRMED` with no offer round-trip. | Long-lived advance offers (customer leaves checkout unstaffed); deferred advance dispatch (breaks the money model — see §11.2). |

---

## 4. The three durations

The core of this design is refusing to let one number do three jobs.

| Number | Source | Purpose | Customer sees |
|---|---|---|---|
| **Arrival window** — 60 min | `M1_ARRIVAL_WINDOW_MINUTES` | Grid step + the arrival promise | "Arrives 8:00 – 9:00 am" |
| **Estimated duration** — e.g. 40 min | `TaskRate.base + marginal × qty` | Blocks the partner calendar; fit-before-close check | "about 40 min" |
| **Actual duration** | measured at the job | Corrects the estimate over time | never |

Price is a function of none of them.

---

## 5. Bookability predicate

A slot starting at `S` for a visit of `duration` minutes is **bookable** when at least one partner
`p` satisfies every clause:

```
approved(p)
∧ serves_area(p, area)
∧ has_every_skill(p, visit.variants)
∧ weekly_rule_covers(p, S, S + duration)
∧ no_exception_blocks(p, S)
∧ no_active_reservation_overlaps(p, S, S + duration + TURNAROUND)
∧ now + COMMIT_WINDOW + travel_estimate(p, address) ≤ S
∧ S + duration ≤ area_close
```

### Reason precedence when it fails

Evaluated in this order; the first match wins:

1. `PAST` — `S ≤ now`
2. `NO_CAPACITY` — no eligible partner is scheduled, or every one is reserved
3. `TOO_SOON` — partners are scheduled and free, but none can physically reach `S` in time
4. `OUTSIDE_OPERATING_WINDOW` — the job would not finish before the area closes

`NO_CAPACITY` now covers both "all booked" and "nobody works then", so its customer-facing label
changes from *"Fully booked"* to *"No pros available"*.

---

## 6. Bulk capacity algorithm

Naively this is `days × slots × partners` queries. It must not be. **Four queries for the entire
7-day grid**, then pure in-memory computation:

1. **Eligible partner set** — one query, with `select_related("latest_location")`. `PartnerLocation`
   is a `OneToOneField` primary-key relation, so the location data §7 needs is free. Filters already
   exist in `planning._eligible_partner_ids()`: approved application, active service-area link,
   active service link per required variant.
2. **Availability rules** — one prefetch (`availability_rules`).
3. **Availability exceptions** — one prefetch (`availability_exceptions`).
4. **All active reservations** for those partners overlapping the 7-day horizon — one range query.

Slot count then stops mattering.

**`partner_available_during()` must not be called from the snapshot.** It issues two queries per
call — an exception lookup keyed on `date=` and a rules lookup keyed on `weekday=`
(`partners/selectors.py:169,184`) — both varying per slot and neither prefetchable. Evaluating 100
slots through it costs hundreds of queries and destroys the guarantee above.

The shared predicate is instead `_availability_window_contains()`
(`partners/selectors.py:200`), already a pure function of
`(local_start, local_end, starts_at, ends_at, ends_next_day)`. The snapshot evaluates prefetched
rules and exceptions through it, mirroring `partner_available_during`'s branch order — exception
wins over rules, no matching window means unavailable. Promote it to a public name when the
snapshot starts importing it across app boundaries.

The grid and plan-set creation must both go through the snapshot so they can never disagree.

**Caching:** the response is `VOLATILE_STATE` on the frontend and must stay so. A short server-side
cache (≤30 s) keyed on `(area, variant-set, duration, address)` is permitted; anything longer
re-introduces the lie this spec exists to remove.

---

## 7. Dynamic lead time

Replaces `M1_TODAY_LEAD_TIME_MINUTES = 120`.

```
earliest_reachable(p) = now + COMMIT_WINDOW + travel_estimate(p → address)
```

- `COMMIT_WINDOW` — new setting, ~15 min. Covers `M1_PARTNER_SEARCH_TIMEOUT_SECONDS = 180` plus
  accept-and-prepare grace.
- `travel_estimate(p → address)` — derived from `PartnerLocation` when the partner has a live
  online session with a fresh fix; otherwise a conservative per-area default (~30 min).

Only affects **today's early slots**. Every slot from tomorrow onward is unaffected, because
`earliest_reachable` is always far below a next-day start.

`M1_TODAY_LEAD_TIME_MINUTES` is retained **only** as the fallback ceiling when no partner in the
pool has a usable location fix — so an empty or fully-offline area behaves exactly as it does today.

---

## 8. Worked example

Switch / Socket Repair × 1 → duration **40 min**, price **₹129 flat**.
Service area open 07:00–21:00. Clock reads **06:50**.

Partner pool:

- **P1** — electrician, works today, **online**, GPS 4 km out (~12 min travel)
- **P2** — electrician, works today but schedule ends 15:00, **offline**, reserved 09:00–09:50
- **P3** — plumber → wrong skill, never enters the pool

| Slot | P1 | P2 | Capacity | Result | Change vs today |
|---|---|---|---|---|---|
| 07:00 | not yet on shift | free, reachable 07:35 | 0 | `TOO_SOON` | same |
| 08:00 | reachable 07:17 ✓ | reachable 07:35 ✓ | **2** | **Bookable** | today: blocked (06:50 + 120 = 08:50) |
| 09:00 | ✓ | reserved | **1** | **Bookable**, "Only 1 pro left" | bookable, count invisible |
| 10:00–14:00 | ✓ | ✓ | 2 | Bookable | same |
| 15:00–17:00 | ✓ | shift ended | 1 | Bookable | same |
| 18:00 | shift ended | shift ended | 0 | `NO_CAPACITY` | today: **shown bookable, fails at submit** |
| 21:00 | — | — | — | `OUTSIDE_OPERATING_WINDOW` | same |

Two measurable outcomes: **one hour of same-day inventory recovered** at 08:00, and **the 18:00 lie
eliminated**.

Rendered:

```
○  Arrives 8:00 – 9:00 am        about 40 min
●  Arrives 9:00 – 10:00 am       about 40 min · Only 1 pro left
○  Arrives 10:00 – 11:00 am      about 40 min
✕  Arrives 6:00 – 7:00 pm        No pros available
```

Scarcity is surfaced **only when capacity is exactly 1**. Silent otherwise — a count on every row
is pressure, not information.

---

## 9. Multi-visit carts

### What already works

A cart containing Switch Repair + Tap Repair splits into two `SchedulingGroup`s via
`ServiceCompatibilityRule`. After checkout each becomes its own `FulfilmentUnit` → `Booking`, with
its own partner, its own start OTP, its own `WorkSession`, its own `PaymentAllocation`, and its own
cancellation path. **This is correct today and needs no change.**

### What is broken

`carts/services.py:762-770`:

```python
item = (
    CartItem.objects.select_related(...)
    .filter(cart=cart)
    .first()          # ← one item's duration, reused for every visit
)
```

and `useCandidateStarts` posts only `{ address_id }` — no group key. Both visits therefore render
an identical grid sized to whichever item was added first.

### Required change

`POST /api/v1/booking/windows/` accepts a `group_key`. Duration and the required-skill set are
computed from **that group's** cart items. The frontend passes the group key it is already tracking
in `slots-modal.tsx` (keyed by the server's opaque `group.key`, never array index).

### Cross-visit conflict

Two visits in one cart may not resolve to the same partner at overlapping times. Each visit's
capacity check is independent today, so with a single eligible partner both visits can select
09:00. Plan-set creation must reject a selection set whose visits cannot be simultaneously staffed
— reusing `M1_CONCURRENT_PARTNER_LIMIT = 2`, which already exists for exactly this concern.

---

## 10. Partner availability (D4) — no change

The hour-period editor stays as built: `PartnerAvailabilityRule` rows of
`(service_area, weekday, starts_at, ends_at, ends_next_day)`, overlap-validated, with
`PartnerAvailabilityException` for dated leave, and the ADR-010 rule that nothing defaults a
partner to available.

A day-tick simplification was designed and **rejected**. Two reasons:

1. Split shifts ("Wednesday 09:00–13:00 and 14:00–18:00") are a real pattern, and collapsing to
   full days would silently publish partners as available through their lunch break.
2. Live capacity (§5) makes the richer model *more* valuable, not less. Under the flat grid a
   13:00 slot looked bookable and failed at submit; under this design it correctly reports
   `NO_CAPACITY`. The hour-level data was always right — only the grid was ignoring it.

**Nothing in this spec modifies `PartnerAvailabilityRule`, `PartnerAvailabilityException`, or
`partner_available_during()`.** The capacity engine reads them; it does not reshape them.

---

## 11. Dispatch: two gates and two commitment mechanisms

### 11.1 Eligibility gate (D5)

| Booking type | Gate | Rationale |
|---|---|---|
| Same-day / near-term | Active `PartnerOnlineSession` **and** a schedule rule covering the slot | Only a partner actually working right now can take a job in the next few hours |
| Advance (tomorrow onward) | Schedule rule covering the slot | Nobody is toggled online on Sunday for a Tuesday 15:00 job |

The boundary is `requested_start <= now + M1_TODAY_LEAD_TIME_MINUTES` — the same horizon §7 uses.

`apps/assignments` currently references `PartnerOnlineSession` zero times, so this is net-new work
in the dispatcher, not a config flip. It must be recorded as an `ExclusionReason`, not a silent
queryset filter — `tests/assignments/test_dispatch_explainability.py` asserts on those reasons.

### 11.2 Commitment mechanism (D8)

Eligibility alone is not enough. Every offer today expires in
`M1_PARTNER_OFFER_TIMEOUT_SECONDS = 45` (`assignments/services.py:95`,
`assignments/group_services.py:145`), inside a customer wait of
`M1_PARTNER_SEARCH_TIMEOUT_SECONDS = 180`. An offline partner ranked in for a Tuesday job would be
offered it and the offer would die 45 seconds later, unseen. **Making an offline partner eligible
without changing how they commit produces a passing test and a broken feature.**

| Booking type | Mechanism |
|---|---|
| Same-day | Offer → accept → `TENTATIVE` reservation → undo window. Unchanged. |
| Advance | **Direct assignment.** Best-ranked eligible partner; `Reservation` written `CONFIRMED` immediately; no `PartnerOffer` row, no timeout. |

Why direct assignment rather than deferring dispatch to nearer the date:

- Payment happens only after `PARTNER_COMMITTED`. Deferring dispatch means a **confirmed booking
  sitting unpaid for days**, a `CheckoutSession` state that does not exist, and a locked price
  whose `M1_QUOTE_TTL_SECONDS = 15 min` expired long before charging.
- Its failure mode is the worst in the system: dispatch runs the night before, finds nobody, and
  the customer has believed for 48 hours that they were booked.
- Direct assignment reaches `PARTNER_COMMITTED` synchronously, so **the entire existing payment
  flow is untouched**.

Consent is not bypassed. ADR-010 makes availability explicit — a partner who published Tuesday
09:00–18:00 has already consented to Tuesday work. Direct assignment honours that published
choice; it does not substitute for one.

`M1_PARTNER_OFFER_TIMEOUT_SECONDS` and `M1_PARTNER_SEARCH_TIMEOUT_SECONDS` become **same-day-only**
constants. They are scoped, never deleted.

### 11.3 Required safeguards for direct assignment

1. **Notification on assignment** — the partner learns without opening the app.
2. **No-penalty release window** for a directly-assigned advance job. The seam exists:
   `recovery_services.RELEASABLE_BOOKING_STATUSES`.
3. **Acknowledgement ping ~24h before the visit**, with re-dispatch if unacknowledged. Days of
   slack make this recoverable, unlike same-day.
4. **Ranking becomes authoritative.** With offer/accept a bad match self-corrects via decline;
   directly assigned it becomes a bad visit. `evaluate_unit_candidates` moves from advisory to
   load-bearing.
5. **Schedule change vs. existing reservation** — an existing reservation wins. Removing a weekday
   affects unbooked future slots only; shedding a booked job requires explicit release.

---

## 12. Post-completion recourse (D6)

`cancel_booking` is **not** opened to `COMPLETED`. `CUSTOMER_CANCELLABLE_STATUSES` stays
`(CONFIRMED, EN_ROUTE, ARRIVED, RECOVERY_REQUIRED)`. The existing reasoning at
`cancellation.py:144-151` is correct: cancelling completed work would refund it with no
`WorkOutcome` to show, and `cancel_booking` runs the fee ladder, which has no meaning after
delivery.

What the customer gets instead, per visit:

1. **0–24 h after completion submitted** — already built. `CompletionResponse` with
   `DISPUTED`, a reason, and the specific `WorkOutcome` rows contested.
2. **24–72 h after auto-finalisation** — **to build.** A quality-dispute path that opens
   `Booking.Status.DISPUTED` and sets the payout-hold field already documented at
   `commerce/models.py:109-111` (*"Read (never written) by the future B9/BE-10 Partner ledger
   before releasing a payout"*). `M1_QUALITY_DISPUTE_WINDOW_HOURS = 72` exists and is currently
   unused — this is what it was reserved for.
3. **After 72 h** — closed. Support-only.

Scope is per `Booking`, so disputing visit 2 leaves visit 1 settled and its partner paid.

---

## 13. Blind spots and accepted risks

| # | Risk | Disposition |
|---|---|---|
| B1 | Multi-visit grid is item-blind | **Fixed** — §9 |
| B2 | Two visits in one cart can claim the same partner | **Fixed** — §9 |
| B3 | Online-only dispatch would kill advance booking | **Fixed** — §11.1 |
| B4 | A 45-second offer TTL makes an eligible offline partner unreachable anyway | **Fixed** — §11.2, direct assignment for advance. This is the blind spot that made B3's fix insufficient on its own. |
| B9 | Directly-assigned partner never sees the job | **Fixed** — §11.3 safeguards 1–3 |
| B10 | Ranking quality becomes load-bearing under direct assignment | **Accepted** — §11.3.4. Mitigated by the release window; worth revisiting if decline-equivalent rates rise. |
| B5 | No travel buffer between consecutive jobs | **Mitigated** — §5, global `TURNAROUND` in reservation occupancy. The arrival-window model (D1) absorbs the remainder: arriving 08:25 still honours an 08:00–09:00 promise. |
| B6 | Capacity is counted, not held — N customers see the same "1 pro free" | **Resolved, not blocking.** `TENTATIVE` reservations are created at *partner-accept* time (`assignments/services.py:199`) with `expires_at = M1_PARTNER_UNDO_TIMEOUT_SECONDS`, and the `ExclusionConstraint` turns a collision into `OfferReservationConflictApiError` rather than a double-booking. Correctness is guaranteed at the database; the residual is UX only, and no money has moved (assign-then-pay). D2 narrows the window further. No pre-checkout hold is required. |
| B7 | Estimates never self-correct; a 40-min estimate that really runs 70 breaks the whole day | **Deferred, tracked.** Capture actual start/end from `WorkSession`; block calendar on observed p75, show customer p50. Not in this spec's scope. |
| B8 | Overrun collides with the partner's next booking | **Deferred, tracked.** Needs a policy: notify next customer / dispatch reassigns / partner declines. Not in this spec's scope. |

Nothing here blocks shipping. B7 and B8 need their own specs.

---

## 16. Timezone ownership

`ServiceArea.timezone` is a validated IANA field and `create_booking_windows` already resolves it
(`services.py:781`). The customer app nonetheless hardcodes `BOOKING_TIME_ZONE = "Asia/Kolkata"`
(`windows.ts:30`), with a comment acknowledging the debt.

`BookingWindows` gains a `timezone` field and the client formats with what it receives. This is
correctness, not internationalisation: a hardcoded zone fails **silently** — every label shifts,
nothing throws — and `isoDateIn` uses the same constant to decide which calendar day a window
belongs to, so a wrong zone mislabels "Today" and "Tomorrow" as well as clock times.

`BOOKING_TIME_ZONE` stays exported and deprecated rather than deleted; `adapters/index.ts:1`
re-exports it.

## 17. Reschedule re-matching

`reschedule_booking` keeps the original partner and refuses when that one person is busy — a
documented M1 boundary taken when no capacity engine existed. With §5 and §6 in place the
constraint is no longer necessary.

New behaviour: **prefer the original partner, re-match when they are busy, refuse only when nobody
is available.** A reschedule is a re-booking, not an edit of one person's calendar.

Unchanged: the fee ladder, `_reschedule_notice_ok`, the late-partner waiver, and
`M1_RESCHEDULE_MIN_NOTICE_MINUTES`. This changes *who can serve the new time*, never *what a
reschedule costs*.

Consequence: a partner change must release the old `Reservation`, take a new one (turnaround
included), and **re-issue the visit's start OTP** — `BookingOtp` is per `Booking`, and the original
partner must not keep a usable code.

## 18. Partner suspension must release future work

**Severity: safety. This is not a scheduling refinement.**

Suspending or offboarding a partner (`partners/services.py:1093-1107`) ends their
`PartnerOnlineSession` and clears the presence cache. It does nothing else.

`apps/partners/services.py` references `Reservation` **zero times**, and neither `apps/assignments`
nor `apps/fulfilment` references `SUSPENDED` or `OFFBOARDED` anywhere. The consequence:

> A partner offboarded for cause on Monday is still assigned to enter a customer's home on
> Thursday. They keep the booking, they keep a valid start OTP, their reservation keeps holding
> capacity, and nobody — customer, operations, or the partner — is told otherwise.

Eligibility filtering (`_eligible_partner_ids` requires `application__status=APPROVED`) correctly
stops them receiving *new* work. It has no effect on work already assigned.

Required behaviour on suspend/offboard, per future `Booking` in a pre-start status:

1. Release the `Reservation` — returns the slot to real capacity.
2. Move the `Booking` to `RECOVERY_REQUIRED`, the status the existing recovery tooling already
   handles (`recovery_services.RELEASABLE_BOOKING_STATUSES`).
3. Invalidate outstanding `BookingOtp` rows for those bookings.
4. Notify the customer and raise it in operations dispatch-recovery.

In-flight visits (`ARRIVED`, work started) are **not** auto-released — they settle through the
completion path like any other interrupted job. Only future, unstarted work is swept.

## 14. Out of scope

- Time-based or surge pricing. Price stays a pure function of task and quantity.
- Reworking `ServiceCompatibilityRule` or how visits are split.
- The `booking/window-stage.tsx` flow — it stays contract-pending and unpublished.
- Partner-side calendar/route optimisation.
- Actual-duration learning loop (B7) and overrun policy (B8).

---

## 15. Open questions

1. `COMMIT_WINDOW` — 15 min is an estimate. Should be tuned against observed accept latency once
   dispatch telemetry exists.
2. `TURNAROUND` — 20 min proposed. Same tuning caveat.
3. Per-area travel defaults — a single ~30 min constant ships first; per-area calibration is a
   follow-up once `PartnerLocation` history accumulates.
