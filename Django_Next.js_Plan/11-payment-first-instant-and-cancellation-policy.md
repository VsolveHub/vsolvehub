# Payment-First Instant, Acknowledge-and-Assign, and Cancellation Policy

**Status:** Accepted — build-ready. No open architecture decisions remain.
**Date:** 30 July 2026
**Scope:** Instant dispatch ordering, the acknowledge-and-assign model, the cancellation/refund ladder,
the complete edge-case register, and all configuration values needed to build.
**Precedence:** This document supersedes the sections listed in §1. Where it is silent,
[10-instant-dispatch-and-decision-resolution.md](./10-instant-dispatch-and-decision-resolution.md) and
[09-milestone-1-authoritative-resolution.md](./09-milestone-1-authoritative-resolution.md) still govern —
the ranking formula, Redis lock contract, notification failure classes, concurrent-transition rule and
degraded-mode behaviour are **reused unchanged**, not replaced.

**Decisions locked in this revision:**

1. **Payment precedes assignment** for Instant (ADR-028).
2. **Acknowledge-and-assign, not offer-accept** (ADR-029). A Partner is *assigned* and must
   *acknowledge*; there is no Accept/Decline offer and no customer-facing provider picker.
3. **No live map or moving marker, ever** (ADR-030, reaffirming ADR-013/ADR-023 in full). The customer
   sees a status timeline and an estimated arrival time as text.
4. **Pay Now only** in Milestone 1 (ADR-022 upheld). Pay Later is deferred with a schema seam only.

---

## 0. What changed and why

Doc 10 built Instant as **offer → accept → pay**: a Partner committed before the customer's money was
captured, because Milestone 1 could not verify payment would succeed (doc 10 §3's `PAYMENT_READY` was
explicitly *not* a guarantee).

The accepted model is now **pay → assign → acknowledge**. This is a deliberate exchange of risks:

| | Offer-first (doc 10) | Payment-first + ACK (this doc) |
|---|---|---|
| Worst case | Partner calendar blocked ~5 min, no money moved | Money captured, must be refunded |
| Failure message | "You have not been charged" | "Refunding ₹X — 3–5 business days" |
| `PAYMENT_READY` proxy gate | Needed, still imperfect | **Eliminated.** Real payment replaces the proxy |
| Partner decision | Accept or Decline (free choice, normal path) | **Acknowledge** an assignment (release is an exception with consequences) |
| Address/contact to Partner | Withheld until payment | Released on ACK — payment already succeeded |
| Partner compensation (doc 10 Q10) | Rejected — no travel pre-payment | **Reopened** — a Partner can be genuinely en route on a paid job |

The old model never had to refund. The new model never blocks a Partner's calendar for an unpaid
customer. Both are defensible; this is the one adopted, and §1 keeps the reversal auditable rather than
silent.

**Why acknowledge instead of accept.** An Accept/Decline offer makes declining a free, normal action —
which is correct when nobody has paid, and wrong once money is captured. Under ACK the job is *already
the Partner's*; acknowledgement proves a human saw it, and walking away is an exception that carries a
consequence. This preserves the one thing doc 10's offer model was actually protecting — proof that a
real human is engaged, not just a healthy push channel — without giving a paid booking away to a free
choice.

---

## 1. What this supersedes

| Source | What it said | What changes |
|---|---|---|
| [07-decision-register.md](./07-decision-register.md) ADR-011 | "Capacity hold precedes payment" | **Instant only:** payment precedes the Partner-specific hold. Scheduled unchanged. |
| [07-decision-register.md](./07-decision-register.md) ADR-021 | "Instant uses offer-accept before payment" | Superseded by ADR-028/029. |
| [07-decision-register.md](./07-decision-register.md) ADR-013, ADR-023 | No live-map tracking; arrival is a Partner command | **Upheld in full** and reaffirmed as ADR-030. No position pings, no map, no marker, no location history. An earlier draft of this document proposed narrowing ADR-013 to allow EN_ROUTE pings; that proposal is **rejected**. |
| [09-milestone-1-authoritative-resolution.md](./09-milestone-1-authoritative-resolution.md) §6 Instant steps 1–7 | Offer acceptance before payment | Replaced by §2. |
| [09-milestone-1-authoritative-resolution.md](./09-milestone-1-authoritative-resolution.md) §11 | Cancellation model scaffolded, bands unpopulated | §5 populates all bands. |
| [10-instant-dispatch-and-decision-resolution.md](./10-instant-dispatch-and-decision-resolution.md) §3 (Q1) | `PAYMENT_READY` gate | **Removed.** Real payment capture replaces it; a pre-payment pool existence check replaces its dispatch-gating role (§2). |
| doc 10 §4.1 | offer → accept → pay | **Reversed** (§2). §4.2 timings, §4.3 widening, §4.4 outcomes, §5 ranking and §6 locks are **reused** by §3. |
| doc 10 §4.4 `NO_PARTNER_ACCEPTED` | Pre-payment "not charged" outcome | Renamed `NO_PARTNER_CONFIRMED`; now a **post-payment refund** path (§4). |
| doc 10 §10.1 (Q2) offer states and "never assigned" copy | `JobOffer.OFFERED → ACCEPTED/DECLINED…` | Replaced by `JobAssignment` states (§9). Copy is now **"New job assigned — confirm you're on it"**. The expired-card and pre-payment-disclosure rules still hold. |
| doc 10 §10.4 offer payload | Withheld address/contact | Released **on ACK** (§2 step 9). |
| doc 10 §12.3 (Q10) | No show-up compensation | **Reopened** — capped dispatch fee (§5.2). |
| [README.md](./README.md) rules #4, #13 | Hold before payment; no live-map | #4 reworded per flow; **#13 restored to its original meaning** — no live tracking at all. |
| [tasks.md](./tasks.md) A6 | "require expiring JobOffer acceptance before the payment hold" | Reworded per §3. |

**Unchanged and still authoritative in doc 10:** ranking formula and policy versioning (Q3–Q6), Redis
lock contract (Q7/Q9), notification delivery and failure classification (Q8/Q15–Q17), concurrent-transition
resolution (Q18), order composition (Q19), fail-closed degraded mode (Q20), non-dispatch resolutions
(Q21–Q23), and the residual-risk metrics discipline (§17).

---

## 2. Instant flow

```text
INSTANT (payment-first, acknowledge-and-assign)

 1  service + Instant selected
 2  scope questions
 3  duration
 4  serviceable geocoded address           [required — not deferrable, §2.1]
 5  login (account must exist before payment)
 6  eligible-pool existence pre-check      [fails closed before any charge]
 7  quote + cancellation ladder shown      [fees disclosed BEFORE the pay action]
 8  pay  → authoritative capture on webhook
        → Booking(status = PAID_UNASSIGNED)
 9  ASSIGNING: rank → lock → assign → Partner ACK   (§3)
        → on ACK: CapacityHold firm, address + contact released to Partner
10  CONFIRMED — "<Partner> is assigned", estimated arrival shown as text
11  EN_ROUTE → ARRIVED → start-OTP → IN_PROGRESS → COMPLETED
```

### 2.1 Address is mandatory for Instant

Proximity ranking (`eta_minutes`, doc 10 §5.2) and the §2 step 6 pre-check are both computed from the
customer's location. There is nothing to rank or pre-check without it. A geocoded, serviceable address is
therefore required before the quote screen for Instant — not optional, not deferred.

Scheduled may defer address further into its flow if Product wants, since Scheduled availability is not
proximity-driven in the same time-critical way. That is a separate decision, not implied here.

### 2.2 Steps in detail

1. **Steps 1–3** — unchanged from doc 10 §2.1.
2. **Address (step 4)** — must resolve to a serviceable area *and* fall inside
   `ServiceAreaOperatingWindow` for the full `occupied_range`. A 2 AM Instant request in an area that
   closes at 10 PM is refused here with the operating-window message, not by an empty search later.
3. **Login (step 5)** — an account must exist before money is taken. Pending-action resume applies
   (doc 09 §5 / tasks B4): returning from OTP must not lose scope, duration or address.
4. **Pool pre-check (step 6)** — one fast, lock-free existence query using the doc 10 §8.4 eligibility
   gate minus the offer-specific conditions. It reserves nothing and locks nothing. Purpose: never ask a
   customer to pay into a search already known to be empty. Preserves the existing acceptance criterion
   "no availability prevents payment."
5. **Quote + ladder (step 7)** — the full graduated cancellation ladder (§5.1) with **concrete rupee
   amounts for this booking**, shown before the pay action. A fee schedule disclosed only after payment
   is a dark pattern and is not acceptable.
6. **Payment (step 8)** — authoritative on the **webhook**, never on the client redirect (doc 09's
   existing payment-webhook authority rule, unchanged). Client-side success is presentation only.
7. **Booking creation** — on confirmed capture, create `Booking(status=PAID_UNASSIGNED)` inside the
   existing idempotent checkout conversion (tasks A7: "convert checkout exactly once with an idempotency
   key"). This state is visible to Operations from the moment it exists (§6).
8. **Assignment (step 9)** — §3. Ranking is re-run at assignment time; the step-6 pre-check is never
   trusted as still valid.
9. **On ACK** — the `CapacityHold` becomes firm, and the exact address and customer contact channel are
   released to the Partner. Safe here because payment already succeeded; there is no pre-payment leakage
   risk left to guard.
10. **Confirmation (step 10)** — Partner first name, photo, rating, and **estimated arrival as text**.
    No map, no marker, no live position (§7).

---

## 3. Acknowledge-and-assign model

Blind assignment with no acknowledgement is unsafe: presence and push-subscription state can be healthy
while the human is asleep, driving, or has put the phone down (doc 10 §7.2, §8.3, §9.5). Under the old
model a wrong pick cost 15 seconds. Under payment-first it means a **paying** customer is silently
assigned to nobody.

Acknowledgement is the fix. It is not an offer — the job is already assigned; the ACK proves a human is
engaged.

### 3.1 Round structure

Assignment is **strictly sequential**: exactly one Partner holds a live assignment for a booking at any
moment. Two Partners are never assigned the same booking concurrently, and never race to acknowledge.

```text
ASSIGNING  (behind "Finding your professional…")

acquire Redis BOOKING lock          "instant:assign:{booking_id}"   <- §3.6, prevents a
                                                                      second concurrent loop
round N:
  rank eligible Partners            (doc 10 §5 instant-v1, unchanged)
  acquire Redis PARTNER lock        (doc 10 §6, unchanged: SET NX PX + Lua compare-and-delete)
  create JobAssignment(status = ASSIGNED_PENDING_ACK)
  push: "New job assigned — confirm you're on it"
  wait up to ack_window_seconds (20)

  ACK received            -> ACKNOWLEDGED (§3.6 transaction). Hold firm. Address + contact
                             released. DONE.
  explicit RELEASE        -> release partner lock, exclude Partner, record release, next round
  no ACK in window        -> release partner lock, exclude Partner, mark UNACKED, next round
  PERMANENT_INVALID push  -> release partner lock immediately, advance without waiting (doc 10 §7.2)

  rounds 1-3, widening by ETA band each round (doc 10 §4.3, unchanged)
  hard ceiling: assignment_deadline_seconds (75) — server-side, authoritative

release booking lock on any terminal outcome
```

Every Partner already tried in this search is excluded from later rounds. Candidates are re-ranked each
round against the widened pool. Both rules are doc 10 §4.3, unchanged.

**Two locks, two different jobs.** They are not interchangeable and both are required:

| Lock | Key | Prevents |
|---|---|---|
| Partner lock (doc 10 §6) | `instant:lock:{partner_id}` | One Partner being assigned to two different bookings at once |
| Booking lock (§3.6) | `instant:assign:{booking_id}` | One booking running two assignment loops at once |

### 3.2 Why 20 seconds and not 10

An acknowledgement is a **human action** — notification, unlock, open app, tap. A machine reachability
check could be 10s; a human tap cannot reliably be. 20s per round with 3 rounds and a 75s ceiling is
longer than doc 10's 50s dispatch budget, and that is accepted: the customer has already paid and is
watching a definite outcome, not deciding whether to book. The ceiling still exists and is still
server-authoritative — no round is ever unlimited and no timer depends solely on a client (doc 10 §4.2).

### 3.3 ACK is not the same as a healthy channel

A `client_acked_at` from the service worker rendering a notification (doc 10 §7.3) proves the *device*
received it. That is **not** an ACK for this purpose. An ACK here is an **explicit Partner action** in the
app. Both are recorded, and they are separate fields:

| Signal | Proves | Used for |
|---|---|---|
| `provider_accepted_at` | gateway accepted the push | delivery metrics only |
| `client_acked_at` | device rendered the notification | delivery metrics, fairness in doc 10 §10.3 |
| `partner_acked_at` | **a human confirmed the assignment** | assignment validity — this is the load-bearing signal |

### 3.4 Release versus no-ACK

These are different and must not be collapsed:

| | Meaning | Partner consequence |
|---|---|---|
| `UNACKED` | Assignment sent, no human response in window | **None** for the first occurrences — may be a delivery failure, not the Partner's fault (doc 10 §8.3's unverified-first-offer rule). Counted; sustained rate removes them from the Instant pool as a **capability** change (doc 10 §10.3), never a rating or ranking penalty. |
| `RELEASED` | Partner explicitly declined an assigned job | Recorded with reason. Free at low frequency; sustained release rate is a capability consequence, same ladder. Never a ranking manipulation (doc 10 §5.1). |
| `RELEASED_AFTER_ACK` | Partner acknowledged, then backed out | Treated as **Partner cancellation** — doc 09 §11 Partner-cancellation recovery path, Partner policy action recorded. |

### 3.5 Idempotency and late signals

- Duplicate ACKs are idempotent; the first commits, subsequent ones return the same state.
- A **late ACK** — arriving after the round expired and the assignment moved on — never revives the
  assignment. It is recorded for metrics and the Partner sees "This job was reassigned." Resolved by the
  conditional-update rule: `UPDATE ... WHERE status = 'ASSIGNED_PENDING_ACK'` affects zero rows
  (doc 10 §13/Q18, unchanged).
- `PartnerReservation` overlap protection in PostgreSQL remains the final capacity guard if every lock
  above fails.

### 3.6 One booking, one Partner — the double-assignment guard

Sequential rounds mean two Partners are never *deliberately* assigned one booking. But sequentiality is a
property of the loop, and the loop can be entered more than once:

- Celery delivers at-least-once, so the assignment task can be redelivered.
- `assignment/retry` ("keep searching", §4.1) is customer-triggered and could fire while a round is live.
- The stall watchdog (§10) re-enters assignment.

Two concurrent loops would assign two different Partners, each creating its own `JobAssignment` row —
and each would pass its *own* row-level `WHERE status = 'ASSIGNED_PENDING_ACK'` check. The result is two
committed Partners and two capacity holds on one paid booking: two people arrive. Row-level conditional
updates alone do **not** prevent this, because they guard different rows.

Two mechanisms close it, and both are required:

**1. Booking-scoped assignment lock.** The loop acquires `instant:assign:{booking_id}` before round 1
and holds it until a terminal outcome. A second loop for the same booking fails to acquire and exits
immediately without assigning. Same primitive as doc 10 §6 — `SET NX PX` with a random token and Lua
compare-and-delete — with a TTL of `assignment_deadline_seconds` + grace.

**2. Booking-level conditional transition on ACK.** This is the correctness backstop and does not depend
on the lock behaving. The ACK transaction updates **both** rows conditionally, and the booking update is
what decides the winner:

```sql
BEGIN;
  -- guards this specific assignment row
  UPDATE job_assignment SET status = 'ACKNOWLEDGED', partner_acked_at = now()
   WHERE id = %s AND status = 'ASSIGNED_PENDING_ACK';
  -- guards the BOOKING: only one assignment can ever win this
  UPDATE booking SET status = 'ASSIGNED'
   WHERE id = %s AND status = 'PAID_UNASSIGNED';
  -- proceed only if BOTH affected exactly one row; otherwise roll back
COMMIT;
```

If the booking update affects zero rows, another assignment already won: roll back, leave that
assignment `SUPERSEDED`, release the Partner lock, and tell the Partner "This job was reassigned."
Exactly one Partner can ever transition a booking out of `PAID_UNASSIGNED`, which is the invariant that
actually matters — one paid booking, one committed Partner.

This is doc 10 §13/Q18's first-committed-valid-transition rule applied at the booking level rather than
only the assignment level. No actor priority, no ordering assumption, no new primitive.

---

## 4. Terminal outcomes

Doc 10 §4.4's codes keep their meanings; only the consequence changes, because money has moved.

| Outcome | Fires | Customer message | Charge state |
|---|---|---|---|
| `ELIGIBLE_POOL_EXHAUSTED` | §2 step 6, **pre-payment** | "No professional is available near you right now." | Never charged |
| `INSTANT_UNAVAILABLE` | §2 step 6, **pre-payment** (doc 10 §15) | "Instant booking is temporarily unavailable." | Never charged |
| `OUTSIDE_OPERATING_WINDOW` | §2 step 4, **pre-payment** | "Instant service in your area runs <hours>. Book a slot instead." | Never charged |
| `NO_PARTNER_CONFIRMED` | §3 ceiling reached, **post-payment** | "No professional confirmed in time." → recovery (§4.1) | **Charged; refund path** |

**The trust rule.** "You have not been charged" is true only for the three pre-payment codes and must
never appear on `NO_PARTNER_CONFIRMED`. That path states what is actually true — the amount, that it is
being refunded, and the real timeline — and is never softened into sounding like a no-charge failure.

### 4.1 Recovery order on `NO_PARTNER_CONFIRMED`

1. **Reschedule** — offer concrete Scheduled slots. Payment carries forward; no new charge, no fee.
2. **Keep searching** — a *new bounded* assignment run (§3 again, pool re-widened, everyone already
   tried excluded). Maximum `keep_searching_max_retries` (2). Never an open-ended wait: an unlimited
   search would violate doc 10 §4.2's own rule that no round is ever unlimited.
3. **Refund** — full, no fee, supply-side attribution (never customer-caused, doc 10 §12.1).

After retries are exhausted the UI stops offering "keep searching" and presents reschedule-or-refund
only.

---

## 5. Cancellation and refund policy

Doc 09 §11 already provides `CancellationPolicy` / `CancellationPolicyTier` (customer refund, fee,
Partner compensation, platform adjustment, versioned, snapshotted at quote time). This section populates
it. The quote is snapshotted at cancellation time — a refund is never recomputed from today's policy for
an old booking (doc 09 §11, unchanged).

### 5.1 Instant ladder

| Band | Condition | Customer refund | Fee | Partner compensation |
|---|---|---|---|---|
| A | Within `free_cancellation_minutes` (10) of payment, and not yet EN_ROUTE | 100% | 0 | none |
| B | `PAID_UNASSIGNED` — no Partner assigned yet, any time | 100% | 0 | none |
| C | After band A, ACK received, not yet EN_ROUTE | 50% | 50% | capped dispatch fee |
| D | EN_ROUTE or later | 0% | 100% | capped dispatch fee |
| E | Customer unavailable at arrival (§5.5) | 100% − visit fee | visit fee | capped dispatch fee |

Band B is unconditional: if no human has been assigned, there is nothing to compensate and no reason to
charge. It overrides band A's time limit.

### 5.2 Partner compensation is a capped dispatch fee

Compensation is `min(cancellation_fee, partner_compensation_cap)` — **not** a percentage of job value.

Reasoning: paying 100% of job value for a five-minute drive overpays on large jobs and creates a direct
incentive for Partners to prefer cancellations over completions on high-ticket work. Compensation pays
for the cost actually incurred — a wasted trip — consistent with doc 10 §5.1's principle that ranking and
compensation are never used as hidden currencies.

Hard constraints, enforced in configuration and in code:

- `partner_compensation_cap <= cancellation_fee`
- `cancellation_fee <= booking_total` — a fee larger than the job price is not defensible
- The remainder of the fee after compensation is a platform adjustment (doc 09 §11's existing field)

### 5.3 Scheduled ladder

| Band | Customer refund | Fee | Partner compensation |
|---|---|---|---|
| >24h before slot | 100% | 0 | none |
| 24h–2h before slot | 70% | 30% | capped dispatch/reservation fee |
| <2h before slot | 0% | 100% | capped dispatch/reservation fee |

### 5.4 Reschedule, and closing the fee-dodge loophole

Reschedule is free, per the accepted direction — but "free reschedule" plus a time-based fee ladder is a
loophole: a customer can reschedule 5 minutes before the slot to escape the <2h band, then cancel from
the new slot's >24h band at 100% refund.

Rules that close it:

- `free_reschedule_limit` (2) per booking. Beyond that, reschedule is refused and the customer must
  cancel under the applicable band.
- A reschedule requested **inside the no-refund band** (Instant: EN_ROUTE or later; Scheduled: <2h) is
  treated as **cancellation + rebook**, and the band's fee applies. It is not free.
- A rescheduled booking's cancellation band is computed from the **new** slot time. Combined with the two
  rules above, the ladder cannot be reset indefinitely.
- Reschedule uses doc 09 §11's existing new-hold-first process: hold the new interval, quote any delta,
  settle, then atomically swap and release the old reservation. Failure leaves the original intact.

### 5.5 Customer unavailable at arrival

Not previously covered anywhere, and common in practice: the Partner arrives and nobody answers.

- Partner taps **Arrived** (doc 09 §8, unchanged), then a **Customer unavailable** action becomes
  available after `customer_unavailable_wait_minutes` (10).
- The platform attempts contact (call/SMS via the masked channel) during that window; the attempt is
  recorded.
- On confirmation: band E applies — a **visit fee** is charged, the remainder is refunded, and the
  Partner receives the capped dispatch fee.
- Evidence requirement: the Partner must submit at least the arrival timestamp and one geotag-free
  arrival photo or note, consistent with the existing `WorkEvidence` model (tasks A8). A visit fee is
  never charged on an unevidenced claim.
- Repeated customer-unavailable events attach to doc 10 §12.2's cooldown ladder as a customer-caused
  cause code.

### 5.6 Cancellation edge cases

| Case | Resolution |
|---|---|
| Customer cancels at the same instant the Partner ACKs or goes EN_ROUTE | doc 10 §13/Q18 unchanged: single conditional `UPDATE ... WHERE status = X`, first committed transition wins, no actor priority. Cancel is never optimistic in the UI. |
| Cancellation after `IN_PROGRESS` | **Not a cancellation.** Work has begun; the ladder does not apply. Routes to the incident/support flow (doc 09 §12). Partial-work billing is out of scope for Milestone 1 — the UI must not offer a self-service cancel once `IN_PROGRESS` is reached. |
| Refund fails at the gateway | Never silently dropped. Enters the Operations maker-checker queue (doc 09 §10). Customer sees "Refund in progress", never a false "Refunded". |
| Customer disputes a fee (claims Partner never left) | Fee stands provisionally; disputable via support within `fee_dispute_window_days` (7). Operations can reverse it. No automatic reversal. EN_ROUTE evidence is a Partner tap — see §14 challenge 7. |
| Partner cancels after ACK | doc 09 §11 Partner-cancellation path unchanged: release, attempt recovery within the deadline, full refund if none commits, Partner policy action, optional service-recovery credit. |
| Fee exceeds booking total on a low-ticket job | Blocked by the §5.2 constraint `cancellation_fee <= booking_total`. |
| Refund on a booking whose payment was carried forward by reschedule | Refund the original captured amount against the current booking; the carried-forward payment is one payment throughout, never duplicated. |
| Cancellation of one booking in a grouped Scheduled order | Per-booking cancellation result, existing behaviour (doc 09 §4, roadmap Phase 7). Instant is single-item and never grouped. |
| Paise rounding on a 50% or 70% refund | Apply the documented per-line paise rounding and explicit rounding adjustment (tasks A7). Refund + fee must reconcile exactly to the captured amount; no rupee may be created or lost. |

---

## 6. `PAID_UNASSIGNED` — every exit path

A `Booking` can now exist with money captured and no Partner. Every path out is enumerated; **silent
expiry is not one of them.**

| Exit | Trigger | Result |
|---|---|---|
| → `ASSIGNED` | ACK received (§3) | Normal path |
| → rescheduled | Customer accepts a slot from §4.1 | Payment carries forward, no new charge, no fee |
| → `CANCELLED` + refund | §3 ceiling and retries exhausted, no reschedule chosen | `NO_PARTNER_CONFIRMED`, 100% refund, no fee, supply attribution |
| → `CANCELLED` + refund | Customer cancels while `PAID_UNASSIGNED` | Band B: 100% refund, no fee |
| → `CANCELLED` + refund + incident | Payment later reversed/charged back | §6.1 |
| → held, retrying | Redis/coordination unhealthy mid-assignment | §6.2 |

### 6.1 Chargeback or reversal after assignment

A capture can be reversed after a Partner is already assigned or en route. Money that funded the booking
no longer exists, but real work may be underway.

- The booking is **not** auto-cancelled. Cancelling a job a Partner is physically attending creates a
  worse failure than the chargeback.
- An Operations incident is raised immediately with the booking, Partner, and current state.
- If work has not started: cancel, notify the Partner, pay the capped dispatch fee from platform funds,
  and apply the customer-abuse cause code (doc 10 §12.2 cooldown ladder).
- If work is in progress or complete: the Partner is paid in full from platform funds. The receivable is
  pursued against the customer account, and the account is placed on hold (§8.1's account-hold pattern,
  not a blacklist).
- Metric: any occurrence is reviewed individually (§13).

### 6.2 Coordination failure after payment

Doc 10 §20 fails closed on Redis loss — correct **pre-payment**, but a captured payment cannot simply be
refused. This is the one case where fail-closed is not the answer.

- New Instant searches are still refused pre-payment with `INSTANT_UNAVAILABLE` (doc 10 §15, unchanged).
- A booking already in `PAID_UNASSIGNED` when coordination fails is **held, not refunded**. It retries
  assignment for `coordination_retry_window_minutes` (10).
- The customer sees an honest holding state: "We're still finding your professional — this is taking
  longer than usual." Never a fake progress bar.
- On recovery within the window: assignment proceeds normally.
- On window expiry: reschedule offer first, then full refund (§4.1). No fee, platform attribution.
- Operations receives a critical alert listing every held booking.
- PostgreSQL remains booking and capacity truth throughout; `PartnerOnlineSession` is never used as a
  matching source (doc 10 §15.1, unchanged).

---

## 7. Status and arrival-time presentation (no live tracking)

**ADR-013 and ADR-023 stand in full, reaffirmed as ADR-030.** There is no map, no marker, no continuous
position stream, no position history, and no `PartnerPositionPing` model. An earlier draft of this
document proposed a narrowed EN_ROUTE position ping; that proposal is **rejected** and nothing in the
build collects Partner location for fulfilment.

What the customer sees:

```text
CONFIRMED          Ravi is assigned · estimated arrival 9:32 AM (about 18 min)
PARTNER_EN_ROUTE   Ravi is on the way · estimated arrival 9:32 AM
PARTNER_ARRIVED    Ravi has arrived
IN_PROGRESS        Work started 9:34 AM · 60 min booked
```

Rules:

- The estimate is computed **once at assignment** from the ranking engine's `eta_minutes` and is
  presented as an approximate clock time plus a coarse range ("about 18 min"), never a
  second-by-second countdown.
- It may be updated **only** by an explicit Partner status transition (EN_ROUTE, ARRIVED) or an
  Operations correction. It is never inferred, extrapolated, or animated.
- If the estimate goes stale — EN_ROUTE with the estimate passed and no ARRIVED — the UI degrades to
  "Running late — we're checking with Ravi" and the §10 watchdog fires. It must never keep counting or
  silently re-project a new time, which would be fabricating progress.
- `PARTNER_ARRIVED` comes only from the Partner's explicit Arrived command (doc 09 §8, ADR-023).
- Customer contact with the Partner uses the masked channel; no raw phone number is exposed.

This is deliberately less than competitors show. It is also the only honest option: without native
background location the platform does not know where the Partner is, and rendering a position it cannot
verify is the same fabrication defect as the hardcoded-city fallback caught in
[08-partner-audit-and-rebuild.md §3](./08-partner-audit-and-rebuild.md).

---

## 8. Pay Later — deferred, seam only

Pay Now is the only Milestone 1 collection mode (ADR-022, unchanged). Not built now: the Pay Later
toggle, the pending-charge ledger, and next-booking fee collection.

Seams reserved so Phase 2 is not a schema rewrite:

- `Booking.payment_mode` enum — only `PAY_NOW` populated; `PAY_LATER` reserved.
- Fee recovery reuses `CancellationPolicyTier`'s existing platform-adjustment concept rather than
  inventing a parallel ledger.

**No Pay Later UI ships.** A visible toggle that does nothing is worse than no toggle.

### 8.1 When Pay Later is built: account hold, not blacklist

The originally sketched enforcement — "account blocked, phone number blacklisted" — is a consumer-protection
exposure as written: no dispute path, no expiry, and a permanent block keyed on a number that may later
belong to someone else. When Pay Later is specced properly it must use an **account hold**: new bookings
blocked until the balance is paid *or waived by Operations*, visible in-account, audited and reversible —
the same pattern doc 10 §12.2 already uses for the abandonment cooldown. Noted here so the constraint is
not lost; not a build item now.

---

## 9. Data model

```python
class Booking(models.Model):
    ...
    status = models.CharField(choices=[
        "PAID_UNASSIGNED",    # Instant only: captured, no Partner. Every exit enumerated in §6
        "ASSIGNED",           # Partner acknowledged (§3)
        "PARTNER_EN_ROUTE",
        "PARTNER_ARRIVED",
        "IN_PROGRESS",
        "OVERTIME", "EXTENDED",
        "COMPLETED",
        "CANCELLED",
    ])
    payment_mode      = models.CharField(choices=["PAY_NOW", "PAY_LATER"])  # PAY_LATER reserved, §8
    estimated_arrival = models.DateTimeField(null=True)   # set once at assignment, §7


class JobAssignment(models.Model):
    """Replaces doc 10's JobOffer. An assignment, not an offer."""
    booking        = models.ForeignKey(...)
    partner        = models.ForeignKey(...)
    round_index    = models.IntegerField()
    status         = models.CharField(choices=[
        "ASSIGNED_PENDING_ACK",
        "ACKNOWLEDGED",
        "UNACKED",              # no human response in window — not penalized by default (§3.4)
        "RELEASED",             # explicit Partner decline before ACK
        "RELEASED_AFTER_ACK",   # Partner cancellation path, doc 09 §11
        "SUPERSEDED",           # reassigned away (stall recovery, §10)
    ])
    expires_at            = models.DateTimeField()
    provider_accepted_at  = models.DateTimeField(null=True)   # push accepted by gateway
    client_acked_at       = models.DateTimeField(null=True)   # device rendered notification
    partner_acked_at      = models.DateTimeField(null=True)   # HUMAN confirmed — load-bearing (§3.3)
    release_reason        = models.CharField(null=True)
    created_at            = models.DateTimeField(auto_now_add=True)


class CancellationPolicyTier(models.Model):        # doc 09 §11, populated per §5
    service, actor, band = ...
    customer_refund_pct            = models.DecimalField()
    cancellation_fee_pct           = models.DecimalField()
    partner_compensation_cap_paise = models.IntegerField()   # capped, never a pct of job value (§5.2)
    visit_fee_paise                = models.IntegerField(null=True)   # band E, §5.5
```

`RankingPolicy`, `DispatchAttempt`, `PartnerDevice` and the Redis lock contract are reused **unchanged**
from doc 10. `JobOffer` is renamed to `JobAssignment` with the state mapping above; no `JobOffer` table
ships. **No `PartnerPositionPing` model exists** (§7).

---

## 10. Post-assignment stall and no-show recovery

The ACK model narrows this risk but does not eliminate it: a Partner can acknowledge and then not go.
This fails **silently** — every state looks correct — so it must be detected by the server, never by a
customer complaint.

### 10.1 Detection

```text
ASSIGNED (acknowledged)
  no EN_ROUTE within departure_grace_seconds (180)          -> escalate
EN_ROUTE
  no ARRIVED by estimated_arrival + arrival_grace_minutes (15)  -> escalate
```

Both timers are Celery-owned and server-time-compared on every read (doc 10 §4.2's rule). No browser or
Partner-app timer is ever the detector.

### 10.2 Escalation ladder

| Step | Action |
|---|---|
| 1 | One bounded nudge to the Partner: "Are you on the way? Confirm or release this job." Not repeated spam. |
| 2 | No response within `nudge_window_seconds` (90) → treat as a **Partner-side release**. Release capacity, mark the assignment `SUPERSEDED`, record a Partner policy action. |
| 3 | Re-enter §3 assignment excluding that Partner. Tell the customer honestly: "We're assigning another professional." Never dress the delay up as normal progress. |
| 4 | No replacement acknowledges → doc 09 §11 Partner-cancellation recovery: full refund, no customer fee, optional service-recovery credit. |

### 10.3 Attribution

The customer is never charged and never given a penalizable cause code for any outcome in this section —
it is a Partner or platform failure (doc 10 §12.1's attribution rule, unchanged).

Repeated stalls are a **capability** consequence: the Partner drops out of the Instant pool while
remaining eligible for Scheduled work. Never a rating penalty, never a ranking manipulation (doc 10
§5.1, §10.3).

---

## 11. Complete edge-case register

Every case below has a defined behaviour. Cases already resolved in docs 09/10 are marked with their
source rather than restated.

### 11.1 Pre-payment

| # | Case | Behaviour |
|---|---|---|
| 1 | Address not serviceable | Blocked at §2 step 4 with the serviceability message |
| 2 | Outside operating window | `OUTSIDE_OPERATING_WINDOW` (§4), Scheduled offered |
| 3 | Pool empty | `ELIGIBLE_POOL_EXHAUSTED` pre-payment, no charge |
| 4 | Redis unhealthy | `INSTANT_UNAVAILABLE` pre-payment, Scheduled unaffected (doc 10 §15) |
| 5 | Session expires between quote and pay | Re-authenticate and resume the exact pending action; quote revalidated server-side |
| 6 | Quote expired at pay time | Reprice on the server, show the difference explicitly, require re-confirmation. A stale client total is never accepted (tasks A5) |
| 7 | Customer opens two Instant flows in two tabs | `max_concurrent_instant_per_customer` (1). The second is refused with "You already have an instant booking in progress." Prevents one customer consuming multiple Partners' locks |
| 8 | Double-click on Pay | Idempotency key; one payment attempt (tasks A7) |
| 9 | Pool passes pre-check, empties during payment | Payment proceeds; §3 runs and may terminate `NO_PARTNER_CONFIRMED` → §4.1 recovery. This is the accepted residual race — the pre-check is an existence check, not a reservation |

### 11.2 Payment

| # | Case | Behaviour |
|---|---|---|
| 10 | Client redirect lost / tab closed after pay | Webhook is authority. Booking is created regardless; customer sees it on return (tasks A7 resume) |
| 11 | Webhook arrives before client returns | Normal; booking already created, client reconciles to server state |
| 12 | Webhook never arrives | Reconciliation job polls the provider. Until resolved the customer sees "Confirming your payment", never a booking |
| 13 | Payment succeeds, booking creation fails | Idempotent conversion retries. If it cannot converge, auto-void/refund and raise an Operations incident (doc 09 §6.1's existing reconciliation pattern) |
| 14 | Out-of-order webhooks | Monotonic handling (tasks A7, existing) |
| 15 | Payment fails | No booking, no dispatch, no fee. Retry or switch to Scheduled |
| 16 | Duplicate webhook | Persisted-and-verified event dedupe (tasks A7, existing) |

### 11.3 Assignment

| # | Case | Behaviour |
|---|---|---|
| 17 | No Partner ACKs in any round | `NO_PARTNER_CONFIRMED` → §4.1 |
| 18 | Late ACK after reassignment | Rejected, recorded; "This job was reassigned" (§3.5) |
| 19 | Duplicate ACK | Idempotent (§3.5) |
| 20 | Partner releases immediately | Excluded, next round (§3.4) |
| 21 | Push permanently invalid (410) | Lock released, round advances immediately (doc 10 §7.2) |
| 22 | Push transient failure | One bounded retry, then advance, keep the token (doc 10 §7.2) |
| 23 | Partner goes offline between ranking and push | No ACK → `UNACKED` → next round |
| 24 | Partner's capacity taken by a Scheduled booking mid-assignment | `PartnerReservation` overlap protection rejects the hold; treated as a failed round, next round (doc 09 §7) |
| 25 | Redis dies mid-assignment, post-payment | §6.2 — held and retried, not refunded immediately |
| 26 | Celery worker dies mid-assignment | Booking remains `PAID_UNASSIGNED`; the §10.1 watchdog and the Operations queue (§6) both surface it. No booking is ever dependent on one worker's liveness |
| 27 | Customer cancels during ASSIGNING | Band B, 100% refund; live lock released, assignment `SUPERSEDED` |
| 28 | Assignment loop runs twice for one booking (Celery redelivery, retry re-entry, watchdog re-entry) | Booking-scoped lock makes the second loop exit without assigning; the booking-level conditional update on ACK is the backstop, so only one assignment can leave `PAID_UNASSIGNED` (§3.6) |
| 28a | Two Partners both `ASSIGNED_PENDING_ACK` for one booking | Cannot occur via the normal sequential loop; if it does (case 28), exactly one ACK commits and the other is `SUPERSEDED`. Asserted as an invariant test, not a supported state |

### 11.4 Post-assignment

| # | Case | Behaviour |
|---|---|---|
| 29 | ACK then never departs | §10 watchdog → nudge → reassign |
| 30 | EN_ROUTE, never arrives | §10 watchdog → nudge → reassign |
| 31 | Partner cancels after ACK | doc 09 §11 Partner-cancellation recovery |
| 32 | Customer unavailable at arrival | §5.5 band E, visit fee, evidence required |
| 33 | Customer refuses to share start OTP | Not a start. Partner cannot begin; treated as customer-unavailable (§5.5) after the same wait window |
| 34 | False Arrived tap | Arrival does not start paid work (doc 09 §8). OTP is required to start the timer, so a false arrival cannot bill anything. Pattern abuse is a Partner policy action |
| 35 | Cancel during IN_PROGRESS | Incident/support flow; no self-service cancel (§5.6) |
| 36 | Extension payment fails mid-job | doc 10 §16.1 unchanged: deadline does not move, no unpaid work, no unapproved billing |
| 37 | Operating window closes mid-job | Work continues to completion; the window gates booking creation, not work already started (doc 09 §7) |
| 38 | Estimate passes with no arrival | UI degrades to "Running late" (§7); never re-projects silently |
| 39 | Refund fails at gateway | Operations maker-checker queue; honest "Refund in progress" (§5.6) |
| 40 | Chargeback after assignment/completion | §6.1 |

---

## 12. Configuration

All values are configuration, never literals in code (doc 10 §4.2, §5.1). Initial values are set so
build can proceed; every one is Product-tunable without a code change.

```text
INSTANT_DISPATCH v2 (acknowledge-and-assign)
  ack_window_seconds                  20
  rounds                              3
  assignment_deadline_seconds         75
  keep_searching_max_retries          2
  max_concurrent_instant_per_customer 1

STALL WATCHDOG
  departure_grace_seconds             180
  arrival_grace_minutes               15
  nudge_window_seconds                90

CANCELLATION
  free_cancellation_minutes           10
  free_reschedule_limit               2
  fee_dispute_window_days             7
  partner_compensation_cap_paise      10000        # ₹100 initial; must be <= fee and <= booking_total
  visit_fee_paise                     10000        # ₹100 initial, band E
  customer_unavailable_wait_minutes   10

LOCKS
  partner lock TTL                    round_ttl + 3s grace  (doc 10 §6, unchanged)
  booking assign lock TTL             assignment_deadline_seconds + 5s grace   (§3.6)

DEGRADED
  coordination_retry_window_minutes   10

REUSED UNCHANGED FROM DOC 10
  ranking policy instant-v1, eta bands per service area, fairness_cap,
  exploration decay, location staleness bands, lock grace 3s
```

---

## 13. Residual risks and metrics

Extending doc 10 §17 — an unmeasured trade-off is a defect, not a decision.

| Risk | Source | Metric | Alert threshold |
|---|---|---|---|
| Customers paying for searches that fail | §4, §6 | `instant.paid_unassigned_refund_rate` | > 2% of paid Instant bookings |
| Money held unassigned too long | §6 | `instant.paid_unassigned_duration_seconds` p95 | > 90s |
| Assignments going to unreachable Partners | §3 | `instant.unacked_assignment_rate` | > 15% of assignments |
| Partners acknowledging then not going | §10 | `instant.post_ack_stall_rate` | > 3% of acknowledged assignments |
| Reassignment becoming routine | §10 | `instant.reassignment_rate` | > 5% of bookings |
| Refunds failing or stalling | §5.6, §6 | `instant.refund_failure_count`, age of oldest unresolved | any unresolved > 24h |
| Cancellation fees becoming a revenue line | §5 | fee revenue as share of booking revenue | > 1% — a symptom, never a target |
| Compensation drifting above cost | §5.2 | mean compensation per cancelled job vs. cap | any payout above cap |
| Chargebacks on assigned/completed work | §6.1 | `instant.post_assignment_chargeback_count` | any occurrence, reviewed individually |
| Customer-unavailable disputes | §5.5 | visit-fee dispute rate | > 20% of visit fees disputed |
| Supply thinness (doc 10 §9.5) | doc 10 §9.5 | `instant.eligible_pool_size` p50 by area/hour | p50 < 3 in an active area |

The cancellation-revenue row is deliberately inverted: rising fee income means assignments are being made
that should not be, or the bands are mis-set. It is never something to grow.

---

## 14. Known challenges

These are **not** blockers and require no decision before build. They are the honest, open-eyed list of
what this design makes harder, so nobody is surprised in production.

1. **Refund latency is now customer-facing.** Payment-first means every failed search ends in a real
   refund with a 3–5 business day gateway timeline. Doc 10's model never had to say that sentence. Expect
   support volume proportional to `paid_unassigned_refund_rate`; the mitigation is keeping that rate near
   zero via the §2 step 6 pre-check, not better wording.

2. **Gateway fees are not always refunded.** Many Indian gateways retain the MDR (~2%) on a refunded
   transaction. Every 100% customer refund may therefore cost the platform real money, including on
   supply-side failures that are nobody's fault. This is a unit-economics consequence of payment-first
   and needs to be modelled in pricing, not engineered away.

3. **Supply thinness is the biggest business risk, unchanged from doc 10 §9.5.** Web-only Partners age
   out of the Instant pool when backgrounded. `eligible_pool_size` p50 could sit under 3 from launch, in
   which case Instant will not fail loudly — it will just quietly never fill. Watch this metric before
   any launch marketing. The structural fix is a native Partner app.

4. **iOS Partners require Home Screen install** (doc 10 §8.1). A regular Safari tab receives no push at
   all, so those Partners cannot be Instant-eligible. This is a hard onboarding gate, not a nudge, and it
   will cost some supply.

5. **The first assignment to a newly subscribed device is unverifiable** (doc 10 §8.3). Under ACK this
   matters more than before, because ACK is now the load-bearing signal. Mitigated by never penalizing
   `UNACKED` by default (§3.4) — but it does consume a round and ~20s of a paying customer's wait.

6. **Time-to-recovery after a stall is long.** 180s departure grace + 90s nudge + a fresh 75s assignment
   run is roughly 5–6 minutes before a replacement is even found — for a customer who paid at minute
   zero. The grace values are configurable and should be tuned down once real data exists, but shortening
   them trades against nudging Partners who were legitimately 2 minutes from leaving.

7. **EN_ROUTE evidence is weak.** Band D charges 100% based on a Partner tapping "En route" — with no
   position data (§7), that tap is the only evidence. A Partner could tap it early, deliberately or from
   habit, and a customer cancelling right after would be charged in full. Mitigations in place: the
   dispute window (§5.6), the visit-fee evidence requirement (§5.5), and Operations reversal. This is a
   genuine consequence of choosing no location tracking, and it is accepted knowingly. If disputes climb,
   the options are to soften band D or revisit §7 — not to quietly start collecting location.

8. **Operations load is real and needs staffing.** Payment-first creates queues that did not exist:
   `PAID_UNASSIGNED` monitoring, refund failures, fee disputes, chargeback incidents, visit-fee reviews.
   None can be left to auto-resolve. Budget human capacity, not just code.

9. **Concurrency testing is the hardest engineering surface.** Lock expiry versus ACK commit, late ACK
   versus reassignment, cancel versus EN_ROUTE, hold versus Scheduled overlap, webhook versus booking
   creation. Every one is a real race with money attached. These need explicit PostgreSQL concurrency
   tests (tasks A11), not unit tests with mocks.

10. **No live tracking will be compared unfavourably** to competitors who show a moving marker.
    Accepted: the platform genuinely does not know the Partner's position, and showing an unverifiable
    one is fabrication. The counter-move is a tighter, more accurate ETA and reliable status transitions,
    not a fake dot.

11. **Partial-work billing is unresolved.** Cancellation after `IN_PROGRESS` routes to support (§5.6)
    with no self-service path and no pro-rata rule. Fine for Milestone 1 volume; it will need a proper
    resolution before it becomes common.

12. **Two-sided fairness has no appeal flow yet.** Capability consequences (Instant-pool removal for
    sustained `UNACKED`/stall rates) are correct in shape but have no Partner-facing appeal or
    explanation surface. Partners will ask "why did the jobs stop?" — `DispatchAttempt` (doc 10 §5.5) has
    the data to answer, but nothing surfaces it. Worth building before it generates churn.
