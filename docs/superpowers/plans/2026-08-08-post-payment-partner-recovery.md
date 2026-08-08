# Post-payment partner recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a partner drops a paid booking, re-assign it automatically; if nobody can take it, cancel that one visit and refund it in full — and give the customer working cancel/reschedule controls either way.

**Architecture:** Extend the existing dispatch engine rather than build a second one. `release_booking_partner` and `release_future_work` enqueue an outbox event; `attempt_booking_replacement` drives `_dispatch_unit` (offer for same-day, direct assign for advance); a 60s beat sweep retries until the candidate pool is exhausted or a deadline passes; `settle_unstaffable_booking` cancels and refunds. The customer app wires the already-live `/bookings/{id}/cancel/` and `/reschedule/` endpoints.

**Tech Stack:** Django 5 + DRF + Postgres + Celery/Redis; Next.js 15 + TanStack Query + Tailwind v4.

## Global Constraints

- Money is never computed client-side. Fee and refund amounts come from the server response.
- Every new service is `@transaction.atomic` and idempotent on booking status.
- No new assignment mechanism: reuse `_dispatch_unit`, `_create_offer`, `directly_assign`.
- `M1_REPLACEMENT_DEADLINE_MINUTES = 60`, `M1_REPLACEMENT_URGENT_MINUTES = 180`, `M1_REPLACEMENT_URGENT_OFFER_TTL_SECONDS = 30`.
- Refund reason code for exhaustion: `replacement_unavailable`. Cancellation fee is always zero on that path.
- Run backend tests with `./.venv/Scripts/python.exe -m pytest <path> -q -p no:cacheprovider --no-cov`.
- Do not commit per task. Commit once at the end (user preference).

---

### Task 1: Repair the payment-capture fixture

`tests/commerce/test_payment_capture.py` is 17/19 failing at `assert offers` in
`_payment_ready_group`. `_preferred_start()` returns tomorrow 10:00 IST; `is_same_day_unit`
requires `requested_start <= now + M1_TODAY_LEAD_TIME_MINUTES` (120). So every unit is an
*advance* unit dispatched by `directly_assign`, which writes a `TENTATIVE` reservation and no
`PartnerOffer`. The fixture asserts on a path the branch no longer takes.

The fixture's job is to reach `PARTNER_COMMITTED`, not to produce an offer. Accept both routes.

**Files:**
- Modify: `backend/tests/commerce/test_payment_capture.py:61-100`

**Interfaces:**
- Produces: `_payment_ready_group(*, parallel: bool = False) -> tuple[APIClient, User, CheckoutSession, BookingGroup]` — unchanged signature, now works for advance units.

- [x] **Step 1: Replace the offer-only commitment block**

Replace lines 87-95 (`offers = ...` through `reconcile_group_dispatch(...)`) with:

```python
    # Units reach PARTNER_COMMITTED two ways. A same-day unit gets an offer a Partner
    # accepts; an advance unit is directly assigned and is already held. `_preferred_start`
    # is tomorrow, so these are advance units — but accept either, so the fixture keeps
    # working if the planner's default horizon moves again.
    offers = list(
        PartnerOffer.objects.filter(fulfilment_unit__booking_group=group).select_related("partner")
    )
    for offer in offers:
        accepted = accept_unit_offer(offer_id=offer.id, partner=offer.partner)
        accepted.undo_deadline = timezone.now() - timedelta(seconds=1)
        accepted.save(update_fields=("undo_deadline",))
    reconcile_group_dispatch(group_id=group.id)
    assert Reservation.objects.filter(
        fulfilment_unit__booking_group=group,
        status=Reservation.Status.TENTATIVE,
    ).count() == group.units.count()
```

- [x] **Step 2: Run the suite to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/commerce/test_payment_capture.py -q -p no:cacheprovider --no-cov`
Expected: 19 passed. If `test_group_payment_allocates_every_line_...` still fails on
`len(allocations) == group.units.first().lines.count()`, that assertion assumed one unit —
change it to compare against the sum across units.

---

### Task 2: Keep the recovery state alive through an offer round-trip

`_is_post_booking_recovery` is `unit.status == RECOVERY_REQUIRED`, but `accept_unit_offer`,
`decline_or_undo_unit_offer` and `directly_assign` all call `_set_unit_status(...)` and
overwrite it. The guard then refuses the commit that would finish the recovery.

Key the predicate on the durable fact instead: this unit has a `Booking` awaiting recovery.

**Files:**
- Modify: `backend/apps/assignments/group_services.py:43-59`
- Test: `backend/tests/assignments/test_post_booking_recovery.py` (create)

**Interfaces:**
- Produces: `_is_post_booking_recovery(group: BookingGroup, unit: FulfilmentUnit) -> bool` — same signature, now reads `Booking`.

- [x] **Step 1: Write the failing test**

```python
def test_recovery_guard_survives_a_replacement_accepting_the_offer() -> None:
    group, unit, booking = _released_booking()
    # An accepting Partner sets the unit to HELD; the unit is no longer literally
    # RECOVERY_REQUIRED, but the Booking still is, and that is what makes it a recovery.
    unit.status = FulfilmentUnit.Status.HELD
    unit.save(update_fields=("status",))

    assert _is_post_booking_recovery(group, unit) is True
    assert _blocks_offer_action(group, unit) is False
```

- [x] **Step 2: Run it and watch it fail**

Run: `./.venv/Scripts/python.exe -m pytest tests/assignments/test_post_booking_recovery.py -q -p no:cacheprovider --no-cov`
Expected: FAIL — `assert False is True`.

- [x] **Step 3: Rewrite the predicate**

```python
def _is_post_booking_recovery(group: BookingGroup, unit: FulfilmentUnit) -> bool:
    """A `BOOKED` group is terminal for the pre-payment sweep, but not for replacing a
    Partner who released after payment.

    Keyed on the Booking, not on `unit.status`. The unit's status is a *projection* of the
    Booking's (`UNIT_STATUS_BY_BOOKING_STATUS`), and the offer engine overwrites it directly
    — `accept_unit_offer` writes `HELD`, `decline_or_undo_unit_offer` writes `MATCHING`,
    `directly_assign` writes `HELD`. Reading the projection meant the recovery stopped
    looking like one the instant a replacement accepted, and the commit that would have
    finished it was refused.
    """

    return (
        group.status == BookingGroup.Status.BOOKED
        and Booking.objects.filter(
            fulfilment_unit=unit,
            status=Booking.Status.RECOVERY_REQUIRED,
        ).exists()
    )
```

Add `from apps.commerce.models import Booking` — check for an import cycle first; if
`apps.commerce` imports `apps.assignments` at module scope, do the import inside the function.

- [x] **Step 4: Run the test and the dispatch suites**

Run: `./.venv/Scripts/python.exe -m pytest tests/assignments/ tests/commerce/ -q -p no:cacheprovider --no-cov`
Expected: all pass.

---

### Task 3: Hand a direct-assigned replacement back to the Booking

`recover_booking_partner(booking_id, offer_id, ...)` only understands the offer path. An
*advance* unit is recovered by `directly_assign`, which returns a `Reservation` and no offer,
so there is nothing to hand to it.

Extract the rewrite so both paths share it.

**Files:**
- Modify: `backend/apps/fulfilment/recovery_services.py:84-130`
- Test: `backend/tests/assignments/test_post_booking_recovery.py`

**Interfaces:**
- Produces: `adopt_replacement_reservation(*, booking_id: UUID, reservation_id: UUID, actor: User | None = None) -> Booking` — confirms the reservation and rewrites the booking's partner/reservation/schedule, returning it in `CONFIRMED`.
- `recover_booking_partner` keeps its signature and delegates to it after validating the offer.

- [x] **Step 1: Write the failing test**

```python
def test_a_directly_assigned_replacement_becomes_the_booking_partner() -> None:
    group, unit, booking = _released_booking()
    replacement = _partner(suffix="93", variant_slugs=("switch-socket-repair",))
    reservation = Reservation.objects.create(
        fulfilment_unit=unit,
        partner=replacement,
        occupied_range=Range(unit.requested_start, unit.requested_start + timedelta(hours=2), "[)"),
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    recovered = adopt_replacement_reservation(booking_id=booking.id, reservation_id=reservation.id)

    assert recovered.status == Booking.Status.CONFIRMED
    assert recovered.partner_id == replacement.id
    assert recovered.reservation_id == reservation.id
    reservation.refresh_from_db()
    assert reservation.status == Reservation.Status.CONFIRMED
```

- [x] **Step 2: Run it and watch it fail** — `ImportError: cannot import name 'adopt_replacement_reservation'`.

- [x] **Step 3: Implement**

```python
@transaction.atomic
def adopt_replacement_reservation(
    *, booking_id: UUID, reservation_id: UUID, actor: User | None = None
) -> Booking:
    """Point a `RECOVERY_REQUIRED` Booking at the replacement Partner's reservation.

    Shared by both recovery routes: an offer a same-day replacement committed, and the
    reservation `directly_assign` wrote for an advance one. The reservation is `CONFIRMED`
    here rather than left `TENTATIVE` — the money was captured at the original checkout, so
    there is no payment window left to hold it through.
    """

    group, unit, booking = locked_booking_context(booking_id)
    reservation = Reservation.objects.select_for_update().get(id=reservation_id)
    if reservation.fulfilment_unit_id != unit.id:
        raise BookingCommandInvalidApiError(
            reason="This reservation is not for this Booking's Fulfilment Unit."
        )
    if booking.status == Booking.Status.CONFIRMED and booking.reservation_id == reservation.id:
        return booking
    if booking.status != Booking.Status.RECOVERY_REQUIRED:
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {booking.status} is not awaiting Partner recovery."
        )
    if reservation.status != Reservation.Status.CONFIRMED:
        reservation.status = Reservation.Status.CONFIRMED
        reservation.released_at = None
        reservation.save(update_fields=("status", "released_at"))
    return apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.CONFIRMED,
        command=BookingCommand.RECOVER_PARTNER,
        actor=actor,
        reason="Replacement Partner assigned.",
        extra_booking_fields={
            "partner": reservation.partner,
            "reservation": reservation,
            "scheduled_start": unit.requested_start,
            "estimated_duration_minutes": unit.estimated_duration_minutes,
        },
    )
```

Then reduce `recover_booking_partner`'s tail to `return adopt_replacement_reservation(booking_id=booking.id, reservation_id=offer.reservation_id, actor=operator)`, keeping its existing offer validation above.

- [x] **Step 4: Run the tests** — Expected: pass, and `tests/fulfilment/` still green.

---

### Task 4: Finish a recovery when a same-day replacement commits

`_commit_locked_unit_offer` sets the reservation to a payment-window expiry and calls
`_sync_group_state`, which no-ops on a `BOOKED` group. Nothing reaches the `Booking`.

**Files:**
- Modify: `backend/apps/assignments/group_services.py:533-547`

**Interfaces:**
- Consumes: `adopt_replacement_reservation` from Task 3.

- [x] **Step 1: Write the failing test**

```python
def test_a_committed_replacement_offer_confirms_the_booking() -> None:
    group, unit, booking = _released_booking()
    replacement = _partner(suffix="94", variant_slugs=("switch-socket-repair",))
    offer = create_manual_unit_offer(unit_id=unit.id, partner_id=replacement.id)
    accept_unit_offer(offer_id=offer.id, partner=replacement)
    commit_unit_offer(offer_id=offer.id, partner=replacement)

    booking.refresh_from_db()
    assert booking.status == Booking.Status.CONFIRMED
    assert booking.partner_id == replacement.id
```

- [x] **Step 2: Run it and watch it fail** — booking stays `RECOVERY_REQUIRED`.

- [x] **Step 3: Branch the commit**

In `_commit_locked_unit_offer`, after `offer.save(...)`:

```python
    if _is_post_booking_recovery(group, unit):
        # The money is already captured; there is no payment window to hold through, so the
        # reservation is confirmed outright and the Booking adopts it.
        from apps.fulfilment.recovery_services import adopt_replacement_reservation

        adopt_replacement_reservation(booking_id=_recovering_booking_id(unit), reservation_id=offer.reservation_id)
        return offer
```

with `_recovering_booking_id(unit)` a small helper returning the id of the unit's
`RECOVERY_REQUIRED` booking. Import inside the function — `apps.fulfilment` imports
`apps.assignments.group_services` at module scope, so a top-level import is a cycle.

- [x] **Step 4: Run `tests/assignments/` and `tests/fulfilment/`** — Expected: pass.

---

### Task 5: Settings and the unstaffable settlement

**Files:**
- Modify: `backend/config/settings/base.py` (beside the other `M1_` fulfilment settings)
- Create: `backend/apps/fulfilment/replacement.py`
- Test: `backend/tests/fulfilment/test_replacement.py` (create)

**Interfaces:**
- Produces: `settle_unstaffable_booking(*, booking_id: UUID) -> tuple[Booking, list[Refund]]`

- [x] **Step 1: Add the settings**

```python
# Post-payment Partner recovery. Searching stops this long before the visit so a Customer
# who is going to be refunded finds out with time to make other plans, rather than at the door.
M1_REPLACEMENT_DEADLINE_MINUTES = env.int("M1_REPLACEMENT_DEADLINE_MINUTES", default=60)
# Inside this window the search cycles candidates faster: a silent Partner burns half a minute
# instead of the full offer TTL. Eligibility is never relaxed — a Partner who does not offer
# the variant still cannot do the job.
M1_REPLACEMENT_URGENT_MINUTES = env.int("M1_REPLACEMENT_URGENT_MINUTES", default=180)
M1_REPLACEMENT_URGENT_OFFER_TTL_SECONDS = env.int(
    "M1_REPLACEMENT_URGENT_OFFER_TTL_SECONDS", default=30
)
```

- [x] **Step 2: Write the failing test**

```python
def test_an_unstaffable_booking_is_cancelled_and_fully_refunded() -> None:
    group, unit, booking = _released_paid_booking()
    paid = sum(a.amount_paise for a in PaymentAllocation.objects.filter(fulfilment_unit=unit))

    settled, refunds = settle_unstaffable_booking(booking_id=booking.id)

    assert settled.status == Booking.Status.CANCELLED
    assert sum(refund.amount_paise for refund in refunds) == paid
    assert all(refund.reason_code == "replacement_unavailable" for refund in refunds)


def test_settling_twice_refunds_once() -> None:
    group, unit, booking = _released_paid_booking()
    settle_unstaffable_booking(booking_id=booking.id)
    _settled, second = settle_unstaffable_booking(booking_id=booking.id)
    assert second == []
```

- [x] **Step 3: Run and watch both fail.**

- [x] **Step 4: Implement**

```python
REPLACEMENT_UNAVAILABLE = "replacement_unavailable"


@transaction.atomic
def settle_unstaffable_booking(*, booking_id: UUID) -> tuple[Booking, list[Refund]]:
    """Nobody can take this visit. Cancel it and return the Customer's money in full.

    Only this visit: the rest of the order is other work by other Partners and is untouched.
    No cancellation fee — the Customer did not change their mind, the platform failed to
    staff what it sold.
    """

    group, unit, booking = locked_booking_context(booking_id)
    if booking.status != Booking.Status.RECOVERY_REQUIRED:
        return booking, []
    refunds = create_partial_refunds(
        booking=booking,
        unit=unit,
        refund_amount_paise=sum(
            amount for _allocation, amount in refundable_unit_allocations(unit=unit)
        ),
        reason_code=REPLACEMENT_UNAVAILABLE,
        requested_by_id=booking.customer_id,
        idempotency_key=f"unstaffable:{booking.id}",
    )
    booking = apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.CANCELLED,
        command=BookingCommand.CANCEL,
        actor=None,
        reason="No replacement Partner was available.",
        context={"trigger": REPLACEMENT_UNAVAILABLE, "refund_ids": [str(r.id) for r in refunds]},
    )
    _release_reservation(booking)
    request_notification(
        recipient_id=booking.customer_id,
        purpose="customer.booking_unstaffable",
        channel="PUSH",
        template_code="customer_booking_unstaffable",
        context={"booking_id": str(booking.id), "fulfilment_unit_id": str(unit.id)},
        idempotency_key=f"unstaffable-notice:{booking.id}",
    )
    return booking, refunds
```

Note: the second call returns `[]` because `refundable_unit_allocations` already subtracts
in-flight refunds — and the status guard returns before that anyway.

- [x] **Step 5: Run `tests/fulfilment/test_replacement.py`** — Expected: pass.

---

### Task 6: `attempt_booking_replacement`

**Files:**
- Modify: `backend/apps/fulfilment/replacement.py`
- Test: `backend/tests/fulfilment/test_replacement.py`

**Interfaces:**
- Produces: `attempt_booking_replacement(*, booking_id: UUID) -> Booking`

- [x] **Step 1: Write the failing tests**

```python
def test_a_released_booking_gets_a_replacement_offer() -> None:
    group, unit, booking = _released_paid_booking(same_day=True)
    _partner(suffix="95", variant_slugs=("switch-socket-repair",))

    attempt_booking_replacement(booking_id=booking.id)

    assert PartnerOffer.objects.filter(
        fulfilment_unit=unit, status=PartnerOffer.Status.OFFERED
    ).exists()


def test_no_candidate_settles_immediately() -> None:
    group, unit, booking = _released_paid_booking()  # no other eligible Partner seeded

    attempt_booking_replacement(booking_id=booking.id)

    booking.refresh_from_db()
    assert booking.status == Booking.Status.CANCELLED


def test_a_live_offer_is_not_duplicated() -> None:
    group, unit, booking = _released_paid_booking(same_day=True)
    _partner(suffix="96", variant_slugs=("switch-socket-repair",))
    attempt_booking_replacement(booking_id=booking.id)
    attempt_booking_replacement(booking_id=booking.id)

    assert PartnerOffer.objects.filter(fulfilment_unit=unit).count() == 1
```

- [x] **Step 2: Run and watch them fail.**

- [x] **Step 3: Implement**

```python
@transaction.atomic
def attempt_booking_replacement(*, booking_id: UUID) -> Booking:
    """One pass at finding a replacement. Safe to call repeatedly."""

    group, unit, booking = locked_booking_context(booking_id)
    if booking.status != Booking.Status.RECOVERY_REQUIRED:
        return booking
    if PartnerOffer.objects.filter(
        fulfilment_unit=unit,
        status__in=(PartnerOffer.Status.OFFERED, PartnerOffer.Status.ACCEPTED_PENDING_UNDO),
    ).exists():
        return booking
    deadline = unit.requested_start - timedelta(minutes=settings.M1_REPLACEMENT_DEADLINE_MINUTES)
    if timezone.now() >= deadline:
        settled, _refunds = settle_unstaffable_booking(booking_id=booking.id)
        return settled
    outcome = _dispatch_unit(group=group, unit=unit)
    if outcome is None:
        settled, _refunds = settle_unstaffable_booking(booking_id=booking.id)
        return settled
    if isinstance(outcome, Reservation):
        # Advance unit: `directly_assign` already locked the Partner in, so the Booking
        # adopts the reservation now. There is no offer round-trip to wait for.
        return adopt_replacement_reservation(booking_id=booking.id, reservation_id=outcome.id)
    return booking
```

- [x] **Step 4: Run the tests** — Expected: pass.

- [x] **Step 5: Escalate the cadence near the visit**

`_create_offer` derives its TTL from `settings.M1_OFFER_TTL_SECONDS`. Give it an override so a
replacement search inside `M1_REPLACEMENT_URGENT_MINUTES` of the visit cycles candidates faster:

```python
def _replacement_offer_ttl_seconds(unit: FulfilmentUnit) -> int | None:
    """A shorter offer near the visit. Eligibility is never widened — only the clock."""

    urgent_from = unit.requested_start - timedelta(minutes=settings.M1_REPLACEMENT_URGENT_MINUTES)
    if timezone.now() < urgent_from:
        return None
    return settings.M1_REPLACEMENT_URGENT_OFFER_TTL_SECONDS
```

Thread it through `_dispatch_unit(group=..., unit=..., offer_ttl_seconds=...)` as a keyword-only
argument defaulting to `None`, so first-time dispatch is unchanged.

Test:

```python
def test_a_replacement_near_the_visit_gets_a_short_offer() -> None:
    group, unit, booking = _released_paid_booking(same_day=True)
    _partner(suffix="99", variant_slugs=("switch-socket-repair",))

    attempt_booking_replacement(booking_id=booking.id)

    offer = PartnerOffer.objects.get(fulfilment_unit=unit)
    window = (offer.expires_at - timezone.now()).total_seconds()
    assert window <= settings.M1_REPLACEMENT_URGENT_OFFER_TTL_SECONDS
```

---

### Task 7: Fire recovery from both release paths

**Files:**
- Modify: `backend/apps/fulfilment/recovery_services.py:61-74`
- Modify: `backend/apps/assignments/suspension.py:48-62`
- Modify: `backend/apps/fulfilment/handlers.py` (or wherever outbox handlers register)
- Test: `backend/tests/fulfilment/test_replacement.py`

- [x] **Step 1: Write the failing test**

```python
def test_partner_release_starts_a_search_without_anyone_asking() -> None:
    group, unit, booking = _paid_booking(same_day=True)
    _partner(suffix="97", variant_slugs=("switch-socket-repair",))

    release_booking_partner(
        booking_id=booking.id,
        partner_id=booking.partner_id,
        reason="Cannot make it",
        expected_version=booking.version,
    )

    assert OutboxEvent.objects.filter(
        event_type="booking.replacement_requested", aggregate_id=booking.id
    ).exists()
```

- [x] **Step 2: Run and watch it fail.**

- [x] **Step 3: Enqueue from both paths**

In `release_booking_partner`, after the reservation release:

```python
    enqueue_outbox_event(
        aggregate_type="booking",
        aggregate_id=booking.id,
        event_type="booking.replacement_requested",
        idempotency_key=f"replacement:{booking.id}:{booking.version}",
        payload={"booking_id": str(booking.id)},
    )
```

Add the identical block to `release_future_work`'s per-booking loop — a suspended Partner's
future bookings are the more damaging orphan, because one suspension strands all of them.
The `booking.version` in the key means a booking released, recovered and released again gets a
fresh event rather than being de-duplicated against the first.

Register a handler that calls `attempt_booking_replacement(booking_id=...)`, following the
pattern of the existing `payment_attempt.order_requested` handler in `apps/commerce/handlers.py`.

- [x] **Step 4: Run `tests/fulfilment/` and `tests/assignments/`** — Expected: pass.

---

### Task 8: The retry sweep

**Files:**
- Modify: `backend/apps/fulfilment/tasks.py`
- Modify: `backend/config/settings/base.py:456` (beat schedule)
- Test: `backend/tests/fulfilment/test_replacement.py`

- [x] **Step 1: Write the failing test**

```python
def test_the_sweep_retries_a_booking_whose_offer_expired() -> None:
    group, unit, booking = _released_paid_booking(same_day=True)
    _partner(suffix="98", variant_slugs=("switch-socket-repair",))
    attempt_booking_replacement(booking_id=booking.id)
    PartnerOffer.objects.filter(fulfilment_unit=unit).update(
        status=PartnerOffer.Status.EXPIRED, responded_at=timezone.now()
    )

    assert sweep_bookings_awaiting_replacement() == 1
```

- [x] **Step 2: Run and watch it fail.**

- [x] **Step 3: Implement**

```python
@shared_task
def sweep_bookings_awaiting_replacement() -> int:
    """Retry every Booking still waiting for a replacement Partner.

    Covers offers that expired and Partners who never answered; an explicit decline already
    chains to the next candidate inside `decline_or_undo_unit_offer`. Because
    `evaluate_unit_candidates` excludes Partners already in `AssignmentAttempt`, successive
    passes walk down the ranking on their own — there is no second retry loop to keep in
    step with the first.
    """

    live_offer = PartnerOffer.objects.filter(
        fulfilment_unit_id=OuterRef("fulfilment_unit_id"),
        status__in=(PartnerOffer.Status.OFFERED, PartnerOffer.Status.ACCEPTED_PENDING_UNDO),
    )
    live_reservation = Reservation.objects.filter(
        fulfilment_unit_id=OuterRef("fulfilment_unit_id"),
        status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
    )
    candidates = (
        Booking.objects.filter(
            status=Booking.Status.RECOVERY_REQUIRED,
            fulfilment_unit__isnull=False,
        )
        .annotate(has_offer=Exists(live_offer), has_reservation=Exists(live_reservation))
        .filter(has_offer=False, has_reservation=False)
    )
    swept = 0
    for booking_id in candidates.values_list("id", flat=True).iterator(chunk_size=100):
        attempt_one_booking_replacement.delay(str(booking_id))
        swept += 1
    return swept
```

plus an `attempt_one_booking_replacement` task wrapper matching the `declare_one_booking_late`
retry pattern, and the beat entry:

```python
    "sweep-bookings-awaiting-replacement": {
        "task": "apps.fulfilment.tasks.sweep_bookings_awaiting_replacement",
        "schedule": 60.0,
    },
```

- [x] **Step 4: Run `tests/fulfilment/`** — Expected: pass.

---

### Task 9: Customer cancel and reschedule mutations

**Files:**
- Modify: `frontend/apps/customer/features/visit/queries.ts`
- Test: `frontend/apps/customer/features/visit/queries.test.ts`

**Interfaces:**
- Produces: `useCancelBooking()`, `useRescheduleBooking()`, `describeCancelFailure(error)`.

- [x] **Step 1: Write the failing test** asserting the mutation posts to
`/api/v1/bookings/{booking_id}/cancel/` with an `Idempotency-Key` header and
`{ expected_version, reason }`, and does not retry on 409.

- [x] **Step 2: Run `pnpm --filter customer test queries` and watch it fail.**

- [x] **Step 3: Implement**, following `features/payment/queries.ts`'s
`getStableIdempotencyKey(...)` + `request(...)` + `retry: false` shape. Key format:
`booking-cancel:${bookingId}:${expectedVersion}`.

- [x] **Step 4: Run the test** — Expected: pass.

---

### Task 10: Cancel sheet and honest recovery copy

**Files:**
- Modify: `frontend/apps/customer/features/visit/view/visit-panel.tsx:232-236`
- Modify: `frontend/apps/customer/features/visit/view/visit-status.tsx:39,60`
- Modify: `frontend/apps/customer/features/bookings/view/group-status.tsx:91`
- Create: `frontend/apps/customer/features/visit/view/cancel-visit-sheet.tsx`

- [x] **Step 1: Replace the dead pointer.** Delete the "Cancellation and rescheduling are on
the booking below" paragraph; render a Cancel this visit control gated on `canCancel(data)`.

- [x] **Step 2: Build the sheet.** Reason picker, then a confirm step showing the fee band and
refund amount **from the server**. On success, invalidate the visit and booking-group queries.

- [x] **Step 3: Rewrite the recovery copy.**

```ts
  RECOVERY_REQUIRED: "Assigning a new professional",
```
and the detail line:
```ts
  RECOVERY_REQUIRED:
    "Your professional had to step back. We are assigning someone else now — if we cannot, this visit is cancelled and refunded in full automatically.",
```

- [x] **Step 4: Run `pnpm --filter customer test` and `pnpm --filter customer typecheck`.**

---

### Task 11: Reschedule sheet

**Files:**
- Create: `frontend/apps/customer/features/visit/view/reschedule-visit-sheet.tsx`
- Modify: `frontend/apps/customer/features/visit/view/visit-panel.tsx`

- [x] **Step 1: Build the sheet** against the existing availability endpoint the checkout slot
picker already uses, posting to `useRescheduleBooking`.

- [x] **Step 2: Handle the refusals** — a booking too close to its start, or one whose new slot
cannot be staffed, returns a typed error; render its message rather than a generic failure.

- [x] **Step 3: Run `pnpm --filter customer test` and `typecheck`.**

---

### Task 12: Full verification and commit

- [x] **Step 1:** `./.venv/Scripts/python.exe -m pytest tests/ -q -p no:cacheprovider --no-cov`
- [x] **Step 2:** `./.venv/Scripts/python.exe -m ruff check . && ruff format --check . && mypy apps/`
- [x] **Step 3:** `pnpm --filter customer test && pnpm --filter customer typecheck && pnpm lint`
- [x] **Step 4:** Regenerate the OpenAPI contract if any serializer changed; re-run the frontend
schema codegen so `schema.d.ts` matches.
- [x] **Step 5:** One commit for the whole change.


---

## Build record — 2026-08-08

Tasks 1-11 are built. Task 12's verification is partial by request: the user asked for the
feature ahead of a client meeting and is testing it by hand, so **no new tests were written for
tasks 5-11 and no backend suite was run.** Everything else in the gate did run and is green:
`ruff check`, `ruff format`, `mypy apps/` (172 files), `manage.py check`,
`makemigrations --check`, `spectacular --validate`, `pnpm lint`, `pnpm --filter customer
typecheck`, and the existing `features/visit` + `features/bookings` vitest suites (53 passed).

### Where the build differs from the plan, and why

**Task 6 — `_dispatch_unit` is now public.** The replacement search has to call it from another
app, so it is `dispatch_unit(*, group, unit, offer_ttl_seconds=None)`. `_create_offer` gained
the same keyword. Nothing else about dispatch moved.

**Task 7 — the notification purpose is `booking.replacement_unavailable`, not
`customer.booking_unstaffable`.** Every other customer-facing purpose in
`notifications.services.TRANSACTIONAL_PURPOSES` is `booking.*`, and being in that set is what
makes the message unmutable — which this one has to be. The template code is still
`customer_booking_unstaffable`.

**Task 9-10 — the mutations already existed.** `useCancelVisit` and `useRescheduleVisit` were
already built to the plan's shape (stable key carrying the version, `retry: false`, refetch on
error). What was missing was the failure copy, so `features/visit/reasons.ts` is new and carries
`describeCancelFailure` / `describeRescheduleFailure`.

**Task 10 — the fee preview needed a contract change.** The plan asks the confirm step to show
the fee and refund "from the server", and no endpoint published either. `CustomerBooking` now
carries `cancellation_preview` (`band_code`, `fee_paise`, `fee_waiver`, `refund_paise`,
`currency`, or `null` when the visit is not the customer's to cancel), computed by
`cancellation.preview_cancellation`. `refundable_unit_allocations` gained `for_update=False` so a
read does not try to take a row lock in autocommit. Contract is now 1.20.0 and the frontend
client is regenerated.

**Task 11 — the reschedule sheet picks a time, not a slot.** `POST /booking/windows/` prices a
*cart* against an address; a booked visit has a partner, a held reservation and a frozen quote,
so that endpoint cannot answer for it. The sheet asks for a datetime, floors it at the new
server-published `reschedule_earliest_start`, and renders Django's own refusal
(`partner_unavailable_for_window`) rather than a generic failure. A per-visit availability grid
is a real follow-up, not something this sheet fakes.

### Known gap

The stuck booking from manual testing still has zero eligible partners for its unit — every
partner in the area fails `VARIANT_NOT_OFFERED` for `home-basic-cleaning`. Under this flow it
now goes straight to cancelled-and-fully-refunded rather than sitting there. Seeing a
*successful* reassignment needs a second partner offering the same variant.
