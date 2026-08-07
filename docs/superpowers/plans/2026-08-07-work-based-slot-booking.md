# Work-Based Slot Booking & Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the customer's slot grid tell the truth — real partner capacity per slot, the real work estimate alongside the arrival window, per-visit grids in multi-service carts — and open same-day inventory that a flat 120-minute lead time currently blocks.

**Architecture:** One bulk availability snapshot (**four** queries for the whole 7-day horizon, independent of slot count) becomes the single source of truth for slot capacity, shared by the window grid and plan-set creation so the two can never disagree. Slot bookability is a pure predicate over that snapshot; the `NO_CAPACITY` reason code and the `estimated_duration_minutes` field that already exist end-to-end are finally emitted and rendered.

> **Critical constraint discovered during plan review (2026-08-07):** `partner_available_during()`
> issues **two queries per call** (`selectors.py:169` exception lookup keyed on `date=`,
> `selectors.py:184` rules lookup keyed on `weekday=`). Both vary per slot and neither is
> prefetchable. **The snapshot must not call it.** Instead prefetch `availability_rules` and
> `availability_exceptions` once and evaluate them in memory using the existing pure helper
> `_availability_window_contains()` (`selectors.py:200`), which already takes only
> `(local_start, local_end, starts_at, ends_at, ends_next_day)`. This is reuse, not duplication —
> the shared predicate lives in that helper.

**Tech Stack:** Django 5 + DRF + drf-spectacular (backend), Next.js App Router + TanStack Query + Tailwind v4 (frontend), pytest, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-07-work-based-slot-booking-design.md`

## Global Constraints

- **Price never depends on duration.** `TaskRate.unit_price_paise × quantity` is the price. No task in this plan may make any money value a function of minutes.
- **Three durations stay distinct** (spec §4): arrival window (`M1_ARRIVAL_WINDOW_MINUTES = 60`, the grid step and the promise), estimated duration (`TaskRate.base_duration_minutes + marginal_duration_minutes × quantity`, what blocks the calendar), actual duration (not built here — B7).
- **One predicate, two callers.** The grid and `create_fulfilment_plan_set` must call the same bookability function. A second copy of the rules is a defect.
- **Partner availability is read-only to this plan** (spec §10). No change to `PartnerAvailabilityRule`, `PartnerAvailabilityException`, `partner_available_during()`, or the partner-app availability editor.
- **Dispatch has two gates and two commitment mechanisms** (spec §11). Same-day: online session required, offer/accept. Advance: schedule rule only, direct assignment. `M1_PARTNER_OFFER_TIMEOUT_SECONDS` and `M1_PARTNER_SEARCH_TIMEOUT_SECONDS` become same-day-only — scoped, never deleted.
- **`CUSTOMER_CANCELLABLE_STATUSES` is not extended** (spec §12). Post-completion recourse goes through the dispute path, never `cancel_booking`.
- **No client-side money.** Every rupee rendered comes from a server field.
- **No fallback/mock data.** Empty capacity renders an honest empty state, never a substitute list.
- **Contract is generated, never hand-edited:** `python manage.py spectacular --file ../contracts/openapi/v1.yaml --validate`, then `pnpm contract:generate` from `frontend/`.
- **Query keys live only in `frontend/packages/query/src/keys.ts`.** Inline key literals break invalidation.
- Backend gate: `backend\scripts\quality.cmd` (ruff format, ruff check, mypy, pytest, makemigrations --check, spectacular diff).
- Frontend gate: `pnpm verify` from `frontend/` (contract:check, lint, typecheck, test, build).
- Browser suite runs **once at the end**, not per task (project policy).
- Commit at the end of each task; do not push.

## File Structure

| File | Responsibility |
|---|---|
| `backend/apps/carts/availability.py` *(new)* | Bulk snapshot loader + pure bookability predicate. The only place slot rules live. |
| `backend/apps/carts/services.py` | `create_booking_windows` becomes group-aware and delegates capacity to `availability.py`. |
| `backend/apps/carts/planning.py` | `_eligible_partner_ids` re-expressed over the snapshot; cross-visit conflict check. |
| `backend/apps/carts/serializers.py` | `group_key` request field; `capacity` response field. |
| `backend/apps/assignments/services.py` | Turnaround in reservation occupancy; online gate for same-day dispatch. |
| `backend/apps/fulfilment/quality_dispute.py` *(new)* | 72-hour post-finalisation dispute path. |
| `frontend/apps/customer/features/booking/adapters/windows.ts` | Duration + scarcity in the view model; `NO_CAPACITY` relabel. |
| `frontend/apps/customer/features/checkout/queries.ts` | Per-group window fetch. |

**Not touched by this plan:** `frontend/apps/partner/features/application/**` — partner availability
editing is unchanged (spec §10). The capacity engine reads `PartnerAvailabilityRule`; it does not
reshape it.

---

## Task 1: Bulk availability snapshot

Build the three-query loader and the pure predicate. No endpoint changes yet — this task is the engine and its tests only.

**Files:**
- Create: `backend/apps/carts/availability.py`
- Test: `backend/tests/carts/test_availability_snapshot.py`

**Interfaces:**
- Consumes: `PartnerProfile`, `PartnerApplication` (`apps.partners.models`), `partner_available_during` (`apps.partners.selectors:157`), `Reservation` (`apps.assignments.models`), `ServiceArea` (`apps.locations.models`).
- Produces:
  ```python
  @dataclass(frozen=True, slots=True)
  class AvailabilitySnapshot:
      partner_ids: tuple[UUID, ...]
      area: ServiceArea
      _partners: dict[UUID, PartnerProfile]
      _reserved: dict[UUID, tuple[tuple[datetime, datetime], ...]]

      def free_partner_ids(self, *, starts_at: datetime, duration_minutes: int) -> tuple[UUID, ...]
      def capacity(self, *, starts_at: datetime, duration_minutes: int) -> int

  def load_snapshot(
      *, variant_ids: Collection[UUID], area: ServiceArea, horizon_start: datetime, horizon_end: datetime
  ) -> AvailabilitySnapshot
  ```

- [ ] **Step 1: Read the existing eligibility logic**

Read `backend/apps/carts/planning.py:154-193` (`_eligible_partner_ids`) in full before writing anything. The new module must reproduce its filters exactly — approved application, active `service_area_links`, an active `service_links` filter per required variant — differing only in that it loads once for a horizon instead of once per candidate start.

Also read `backend/apps/partners/selectors.py:157-213` (`partner_available_during`) so the snapshot calls it with the same keyword-only signature.

- [ ] **Step 2: Write the failing test**

Create `backend/tests/carts/test_availability_snapshot.py`. Read `backend/tests/carts/test_fulfilment_planning.py` first and reuse its partner/variant/area fixtures rather than inventing new ones.

```python
import pytest
from datetime import timedelta
from django.utils import timezone

from apps.carts.availability import load_snapshot


@pytest.mark.django_db
def test_snapshot_counts_only_skill_matched_partners(area, electrician, plumber, switch_variant):
    start = timezone.now() + timedelta(days=1)
    snapshot = load_snapshot(
        variant_ids=[switch_variant.id],
        area=area,
        horizon_start=start,
        horizon_end=start + timedelta(days=7),
    )
    assert electrician.id in snapshot.partner_ids
    assert plumber.id not in snapshot.partner_ids


@pytest.mark.django_db
def test_reserved_partner_is_not_free(area, electrician, switch_variant, reservation_factory):
    start = timezone.now() + timedelta(days=1)
    reservation_factory(partner=electrician, starts_at=start, duration_minutes=40)
    snapshot = load_snapshot(
        variant_ids=[switch_variant.id],
        area=area,
        horizon_start=start,
        horizon_end=start + timedelta(days=7),
    )
    assert snapshot.capacity(starts_at=start, duration_minutes=40) == 0
    assert snapshot.capacity(starts_at=start + timedelta(hours=3), duration_minutes=40) == 1
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd backend && python -m pytest tests/carts/test_availability_snapshot.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'apps.carts.availability'`.

- [ ] **Step 4: Implement the module**

Create `backend/apps/carts/availability.py`. Three queries, then pure in-memory work:

```python
def load_snapshot(*, variant_ids, area, horizon_start, horizon_end):
    candidates = PartnerProfile.objects.filter(
        application__status=PartnerApplication.Status.APPROVED,
        service_area_links__service_area=area,
        service_area_links__is_active=True,
    )
    for variant_id in variant_ids:
        candidates = candidates.filter(
            service_links__variant_id=variant_id,
            service_links__is_active=True,
        )
    partners = {p.id: p for p in candidates.distinct().order_by("id")}

    reserved: dict[UUID, list[tuple[datetime, datetime]]] = defaultdict(list)
    rows = Reservation.objects.filter(
        partner_id__in=partners,
        status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
        occupied_range__overlap=Range(horizon_start, horizon_end, "[)"),
    ).values_list("partner_id", "occupied_range")
    for partner_id, occupied in rows:
        reserved[partner_id].append((occupied.lower, occupied.upper))

    return AvailabilitySnapshot(
        partner_ids=tuple(partners),
        area=area,
        _partners=partners,
        _reserved={pid: tuple(spans) for pid, spans in reserved.items()},
    )
```

`free_partner_ids` filters `partner_ids` by no-overlap against `_reserved[pid]`, then by in-memory schedule evaluation. `capacity` returns its length.

**Do not call `partner_available_during()` here** — see the architecture note at the top of this plan. It costs two queries per call and would turn this into ~400 queries. Prefetch instead (related names verified against `partners/models.py:417-497`):

```python
candidates = candidates.select_related("latest_location").prefetch_related(
    "availability_rules",       # PartnerAvailabilityRule.partner related_name
    "availability_exceptions",  # PartnerAvailabilityException.partner related_name
)
```

`latest_location` is a `OneToOneField` primary-key relation (`partners/models.py:534-539`), so `select_related` costs **zero** extra queries — Task 2 gets its location data free.

Then reuse the existing pure helper rather than reimplementing the window rule:

```python
from apps.partners.selectors import _availability_window_contains

def _schedule_allows(self, partner, *, starts_at, duration_minutes) -> bool:
    zone = ZoneInfo(self.area.timezone)
    local_start = starts_at.astimezone(zone)
    local_end = local_start + timedelta(minutes=duration_minutes)
    exception = next(
        (e for e in partner.availability_exceptions.all()
         if e.service_area_id == self.area.id and e.date == local_start.date()),
        None,
    )
    if exception is not None:
        if not exception.is_available or exception.starts_at is None or exception.ends_at is None:
            return False
        return _availability_window_contains(
            local_start, local_end,
            starts_at=exception.starts_at, ends_at=exception.ends_at,
            ends_next_day=exception.ends_next_day,
        )
    return any(
        _availability_window_contains(
            local_start, local_end,
            starts_at=rule.starts_at, ends_at=rule.ends_at, ends_next_day=rule.ends_next_day,
        )
        for rule in partner.availability_rules.all()
        if rule.service_area_id == self.area.id
        and rule.weekday == local_start.weekday()
        and rule.is_active
    )
```

This mirrors `partner_available_during` branch for branch — exception wins over rules, missing window means unavailable — so the two can never disagree. Promote `_availability_window_contains` to a public name (`availability_window_contains`) as part of this step rather than importing an underscore-private symbol across apps.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd backend && python -m pytest tests/carts/test_availability_snapshot.py -v
```

Expected: PASS.

- [ ] **Step 6: Assert the query count**

Add to the same test file — this is the guarantee the whole design rests on:

```python
@pytest.mark.django_db
def test_snapshot_query_count_is_independent_of_slot_count(
    django_assert_num_queries, area, electrician, switch_variant
):
    start = timezone.now() + timedelta(days=1)
    # 4 = candidates (+select_related latest_location) | availability_rules
    #     | availability_exceptions | reservations
    with django_assert_num_queries(4):
        snapshot = load_snapshot(
            variant_ids=[switch_variant.id],
            area=area,
            horizon_start=start,
            horizon_end=start + timedelta(days=7),
        )
        for hour in range(100):
            snapshot.capacity(starts_at=start + timedelta(hours=hour), duration_minutes=40)
```

The number that matters is that it does not grow with the 100 iterations. If it reports more than 4, a lazy relation is leaking — **fix the prefetch, do not raise the number.** The most likely cause is a surviving `partner_available_during()` call.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/carts/availability.py backend/tests/carts/test_availability_snapshot.py
git commit -m "feat(carts): bulk partner availability snapshot for slot capacity"
```

---

## Task 2: Reachability replaces the flat lead time

**Files:**
- Modify: `backend/apps/carts/availability.py`
- Modify: `backend/config/settings/base.py:162-177`
- Test: `backend/tests/carts/test_reachability.py`

**Interfaces:**
- Consumes: `AvailabilitySnapshot` (Task 1), `PartnerLocation` / `PartnerOnlineSession` (`apps.partners.models`).
- Produces:
  ```python
  def earliest_reachable(
      *, snapshot: AvailabilitySnapshot, partner_id: UUID, now: datetime
  ) -> datetime
  ```

- [ ] **Step 1: Add the settings**

In `backend/config/settings/base.py`, beside the existing `M1_` block (line 162 onward):

```python
M1_COMMIT_WINDOW_MINUTES = 15
M1_DEFAULT_TRAVEL_MINUTES = 30
M1_TURNAROUND_MINUTES = 20
```

Leave `M1_TODAY_LEAD_TIME_MINUTES = 120` in place — spec §7 keeps it as the fallback ceiling when no partner has a usable location fix.

- [ ] **Step 2: Write the failing test**

Create `backend/tests/carts/test_reachability.py`:

```python
@pytest.mark.django_db
def test_online_partner_with_fresh_fix_is_reachable_sooner(area, electrician, switch_variant):
    now = timezone.now()
    go_online(partner=electrician, latitude=17.44, longitude=78.34)  # ~4 km from the address
    snapshot = load_snapshot(
        variant_ids=[switch_variant.id], area=area,
        horizon_start=now, horizon_end=now + timedelta(days=7),
    )
    reachable = earliest_reachable(snapshot=snapshot, partner_id=electrician.id, now=now)
    assert reachable < now + timedelta(minutes=settings.M1_TODAY_LEAD_TIME_MINUTES)


@pytest.mark.django_db
def test_offline_partner_falls_back_to_conservative_default(area, electrician, switch_variant):
    now = timezone.now()
    snapshot = load_snapshot(
        variant_ids=[switch_variant.id], area=area,
        horizon_start=now, horizon_end=now + timedelta(days=7),
    )
    reachable = earliest_reachable(snapshot=snapshot, partner_id=electrician.id, now=now)
    expected = now + timedelta(
        minutes=settings.M1_COMMIT_WINDOW_MINUTES + settings.M1_DEFAULT_TRAVEL_MINUTES
    )
    assert reachable == pytest.approx(expected, abs=timedelta(seconds=1))
```

Read `backend/tests/partners/test_operations_and_presence.py` for how presence is set up in tests, and use that helper rather than the `go_online(...)` sketch above if the real one differs.

- [ ] **Step 3: Run to verify failure**

```bash
cd backend && python -m pytest tests/carts/test_reachability.py -v
```

Expected: FAIL with `ImportError: cannot import name 'earliest_reachable'`.

- [ ] **Step 4: Implement**

```python
def earliest_reachable(*, snapshot, partner_id, now):
    commit = timedelta(minutes=settings.M1_COMMIT_WINDOW_MINUTES)
    fix = snapshot.location_fix(partner_id)
    if fix is None:
        return now + commit + timedelta(minutes=settings.M1_DEFAULT_TRAVEL_MINUTES)
    return now + commit + timedelta(minutes=travel_minutes(fix, snapshot.destination))
```

`travel_minutes` is haversine distance at a fixed urban average speed — keep it a single small function in this module and do not add a routing dependency. Load the newest `PartnerLocation` per partner as part of Task 1's partner query (a `Prefetch` with a sliced queryset), so the query-count test still passes at 3.

- [ ] **Step 5: Run to verify pass, then re-run Task 1's query-count test**

```bash
cd backend && python -m pytest tests/carts/test_reachability.py tests/carts/test_availability_snapshot.py -v
```

Expected: all PASS, including `test_snapshot_query_count_is_independent_of_slot_count`.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/carts/availability.py backend/config/settings/base.py backend/tests/carts/test_reachability.py
git commit -m "feat(carts): per-slot reachability replaces the flat today lead time"
```

---

## Task 3: Group-aware, capacity-aware window generation

**Files:**
- Modify: `backend/apps/carts/services.py:753-826`
- Test: `backend/tests/carts/test_booking_windows_capacity.py`

**Interfaces:**
- Consumes: `load_snapshot`, `earliest_reachable` (Tasks 1–2), `scheduling_groups` (`apps.carts.planning:400`), `operating_ranges_for_date` (`apps.locations.services:148`).
- Produces: `create_booking_windows(*, customer, cart, address, group_key: str | None = None) -> BookingWindows`, with `BookingWindow` gaining `capacity: int`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/carts/test_booking_windows_capacity.py`. Cover the four reason codes and the group split — this is the table from spec §8:

```python
@pytest.mark.django_db
def test_slot_with_no_scheduled_partner_is_no_capacity(...):
    windows = create_booking_windows(customer=customer, cart=cart, address=address)
    evening = _window_at(windows, hour=18)
    assert evening.is_available is False
    assert evening.unavailable_reason == "NO_CAPACITY"


@pytest.mark.django_db
def test_slot_a_scheduled_partner_cannot_reach_is_too_soon(...):
    ...
    assert _window_at(windows, hour=7).unavailable_reason == "TOO_SOON"


@pytest.mark.django_db
def test_capacity_reflects_reservations(...):
    # one of two electricians reserved 09:00-09:50
    assert _window_at(windows, hour=9).capacity == 1
    assert _window_at(windows, hour=10).capacity == 2


@pytest.mark.django_db
def test_each_group_gets_its_own_duration(...):
    # cart = switch repair (40 min) + tap repair (60 min), two groups
    groups = scheduling_groups(cart=cart, area=area, at=timezone.now())
    first = create_booking_windows(..., group_key=groups[0].key)
    second = create_booking_windows(..., group_key=groups[1].key)
    assert first.estimated_duration_minutes != second.estimated_duration_minutes
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/carts/test_booking_windows_capacity.py -v
```

Expected: FAIL — `create_booking_windows()` got an unexpected keyword argument `group_key`.

- [ ] **Step 3: Replace the item lookup with group resolution**

The bug being fixed is at `services.py:762-770` — `CartItem.objects.filter(cart=cart).first()`. Replace it: resolve `group_key` against `scheduling_groups(...)`, take that group's `cart_item_ids`, and sum their durations via `_current_item_inputs`. When `group_key` is `None` and there is exactly one group, use it; when `None` and there are several, raise a typed refusal rather than silently picking the first.

- [ ] **Step 4: Replace the reason ladder with the snapshot**

Keep the `operating_ranges_for_date` loop and the 60-minute step. Replace the three-branch `unavailable_reason` ladder with the spec §5 precedence:

```python
snapshot = load_snapshot(
    variant_ids=variant_ids, area=area,
    horizon_start=now, horizon_end=now + timedelta(days=settings.M1_SCHEDULED_MAX_DAYS + 1),
)
...
free = snapshot.free_partner_ids(starts_at=starts_at, duration_minutes=duration)
if starts_at <= now:
    reason = "PAST"
elif not free:
    reason = "NO_CAPACITY"
elif not any(earliest_reachable(snapshot=snapshot, partner_id=p, now=now) <= starts_at for p in free):
    reason = "TOO_SOON"
elif starts_at + timedelta(minutes=duration) > closes_at:
    reason = "OUTSIDE_OPERATING_WINDOW"
else:
    reason = None
```

`capacity` on the window is `len(free)` when `reason is None`, else `0`.

`load_snapshot` is called **once**, outside both loops. If it ends up inside the day loop the query-count guarantee is gone.

- [ ] **Step 5: Run to verify pass**

```bash
cd backend && python -m pytest tests/carts/ -v
```

Expected: PASS, including the pre-existing `test_per_group_starts.py` and `test_scheduling_groups.py`.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/carts/services.py backend/tests/carts/test_booking_windows_capacity.py
git commit -m "feat(carts): per-group, capacity-aware booking windows"
```

---

## Task 4: Publish `group_key` and `capacity` on the contract

**Files:**
- Modify: `backend/apps/carts/serializers.py:547-569`
- Modify: `backend/apps/carts/views.py:581-618`
- Modify: `contracts/openapi/v1.yaml` *(generated)*
- Modify: `frontend/packages/api-client/src/generated/schema.d.ts` *(generated)*
- Test: `backend/tests/carts/test_booking_windows_api.py`

**Interfaces:**
- Produces: `POST /api/v1/booking/windows/` request gains optional `group_key: string`; `BookingWindow` response gains `capacity: integer`.

- [ ] **Step 1: Write the failing API test**

```python
@pytest.mark.django_db
def test_windows_endpoint_accepts_group_key(api_client, customer, cart, address, groups):
    response = api_client.post(
        "/api/v1/booking/windows/",
        {"address_id": str(address.id), "group_key": groups[0].key},
        format="json",
    )
    assert response.status_code == 200
    assert "capacity" in response.data["days"][0]["windows"][0]
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/carts/test_booking_windows_api.py -v
```

Expected: FAIL — `capacity` absent from the serialised window.

- [ ] **Step 3: Add the fields**

Add `group_key = serializers.CharField(required=False, allow_blank=False)` to the request serializer and `capacity = serializers.IntegerField(read_only=True)` to `BookingWindowSerializer`. Pass `group_key` through the view to `create_booking_windows`.

`UnavailableReasonEnum` already contains `NO_CAPACITY` — no enum change is needed, and none should be made.

- [ ] **Step 4: Regenerate the contract**

```bash
cd backend && python manage.py spectacular --file ../contracts/openapi/v1.yaml --validate
```

```bash
cd frontend && pnpm contract:generate
```

- [ ] **Step 5: Run both gates**

```bash
cd backend && scripts\quality.cmd
```

Expected: PASS, including the spectacular diff check.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/carts/serializers.py backend/apps/carts/views.py backend/tests/carts/test_booking_windows_api.py contracts/openapi/v1.yaml frontend/packages/api-client/src/generated/schema.d.ts
git commit -m "feat(contract): group_key request and per-slot capacity on booking windows"
```

---

## Task 5: Turnaround in reservation occupancy

Spec §5 / D7. One constant, enforced by the existing exclusion constraint.

**Files:**
- Modify: `backend/apps/assignments/services.py:192-200`
- Modify: `backend/apps/carts/availability.py`
- Test: `backend/tests/assignments/test_turnaround.py`

**Interfaces:**
- Consumes: `settings.M1_TURNAROUND_MINUTES` (Task 2).

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.django_db
def test_back_to_back_booking_collides_within_turnaround(partner, checkout_factory):
    first = accept_offer(...)   # 07:00-07:40
    with pytest.raises(OfferReservationConflictApiError):
        accept_offer(...)       # 07:45 start — inside the 20-minute turnaround
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/assignments/test_turnaround.py -v
```

Expected: FAIL — the second acceptance succeeds.

- [ ] **Step 3: Widen the occupied range**

At `assignments/services.py:192-197` the range is built from `quote.requested_start` and `quote.estimated_duration_minutes`. Add the turnaround to the upper bound only:

```python
occupied = Range(
    quote.requested_start,
    quote.requested_start
    + timedelta(minutes=quote.estimated_duration_minutes + settings.M1_TURNAROUND_MINUTES),
    "[)",
)
```

Mirror the same `+ M1_TURNAROUND_MINUTES` in `AvailabilitySnapshot.free_partner_ids` so the grid and the reservation agree.

**There are exactly four `Range(` construction sites and all four must change together.** A partial rollout means the grid and dispatch disagree, which the global constraints forbid:

| Site | What it builds |
|---|---|
| `backend/apps/assignments/services.py:193` | reservation on offer accept (legacy checkout path) |
| `backend/apps/assignments/group_services.py:312` | reservation on offer accept (group path) |
| `backend/apps/carts/planning.py:171` | the eligibility probe in `_eligible_partner_ids` |
| `backend/apps/fulfilment/cancellation.py:346` | **the reschedule write path** — easy to miss, and missing it is worse than skipping the task entirely: a reschedule would *narrow* an existing occupied range and silently delete the turnaround buffer for that booking |

Add a regression test for the fourth specifically:

```python
@pytest.mark.django_db
def test_reschedule_preserves_the_turnaround_buffer(confirmed_booking):
    new_start = confirmed_booking.scheduled_start + timedelta(days=1)
    reschedule_booking(
        booking_id=confirmed_booking.id, customer_id=confirmed_booking.customer_id,
        expected_version=confirmed_booking.version, new_requested_start=new_start,
    )
    reservation = Reservation.objects.get(id=confirmed_booking.reservation_id)
    occupied_minutes = (reservation.occupied_range.upper - reservation.occupied_range.lower).seconds / 60
    assert occupied_minutes == unit.estimated_duration_minutes + settings.M1_TURNAROUND_MINUTES
```

- [ ] **Step 4: Run to verify pass**

```bash
cd backend && python -m pytest tests/assignments/ tests/carts/ -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/assignments/services.py backend/apps/assignments/group_services.py backend/apps/carts/availability.py backend/tests/assignments/test_turnaround.py
git commit -m "feat(assignments): reserve turnaround time between consecutive visits"
```

---

## Task 6: Cross-visit conflict check

Spec §9. Two visits in one cart must not resolve to the same partner at overlapping times.

**Files:**
- Modify: `backend/apps/carts/planning.py:755-945`
- Test: `backend/tests/carts/test_cross_visit_conflict.py`

**Interfaces:**
- Consumes: `AvailabilitySnapshot` (Task 1), `settings.M1_CONCURRENT_PARTNER_LIMIT`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.django_db
def test_two_visits_cannot_claim_the_only_partner_at_the_same_time(
    customer, cart_with_two_groups, address, sole_electrician
):
    start = timezone.now() + timedelta(days=1, hours=9)
    with pytest.raises(FulfilmentPlanUnavailableApiError) as exc:
        create_fulfilment_plan_set(
            customer=customer, cart=cart_with_two_groups, address=address,
            preferred_starts=[
                {"group_key": groups[0].key, "starts_at": start},
                {"group_key": groups[1].key, "starts_at": start},
            ],
        )
    assert "no_eligible_capacity" in str(exc.value)
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/carts/test_cross_visit_conflict.py -v
```

Expected: FAIL — both visits plan successfully against the same partner.

- [ ] **Step 3: Implement the check**

After per-unit eligibility is computed in `create_fulfilment_plan_set`, verify a **system of distinct representatives** exists across units whose time ranges overlap: for every overlapping subset of size *k*, the union of their eligible partner sets must have at least *k* members (Hall's condition). With `M1_FULFILMENT_UNIT_LIMIT = 5` the brute-force subset check is trivially cheap — do not reach for a matching library.

Raise the existing `FulfilmentPlanUnavailableApiError` with the existing `no_eligible_capacity` reason code. No new error type.

- [ ] **Step 4: Run to verify pass**

```bash
cd backend && python -m pytest tests/carts/ -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/carts/planning.py backend/tests/carts/test_cross_visit_conflict.py
git commit -m "fix(carts): refuse plan sets whose visits cannot be staffed simultaneously"
```

---

## Task 7: Customer slot card tells the truth

**Files:**
- Modify: `frontend/apps/customer/features/booking/adapters/windows.ts:32-124`
- Modify: `frontend/apps/customer/features/checkout/view/preferred-start-picker.tsx:76-96`
- Test: `frontend/apps/customer/features/booking/adapters/windows.test.ts`

**Interfaces:**
- Consumes: `Schemas["BookingWindow"]` with `capacity` (Task 4).
- Produces: `WindowView` gains `durationLabel: string` and `scarcityLabel: string | null`.

- [ ] **Step 1: Write the failing test**

```ts
it("labels the arrival window, not the job length", () => {
  const view = toWindowView({
    id: "w1", starts_at: "2026-08-07T02:30:00Z", ends_at: "2026-08-07T03:30:00Z",
    is_available: true, unavailable_reason: null, capacity: 3,
  }, 40);
  expect(view.label).toBe("8:00 am – 9:00 am");
  expect(view.durationLabel).toBe("about 40 min");
  expect(view.scarcityLabel).toBeNull();
});

it("warns only when one professional is left", () => {
  expect(toWindowView({ ...base, capacity: 1 }, 40).scarcityLabel).toBe("Only 1 pro left");
  expect(toWindowView({ ...base, capacity: 2 }, 40).scarcityLabel).toBeNull();
});

it("says no pros available rather than fully booked", () => {
  const view = toWindowView(
    { ...base, is_available: false, unavailable_reason: "NO_CAPACITY", capacity: 0 }, 40,
  );
  expect(view.unavailableLabel).toBe("No pros available");
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && pnpm vitest run apps/customer/features/booking/adapters/windows.test.ts
```

Expected: FAIL — `durationLabel` undefined.

- [ ] **Step 3: Extend the adapter**

`toWindowView` takes the duration as a second parameter (threaded from `toWindowsView`, which already reads `response.estimated_duration_minutes`). Change `UNAVAILABLE_LABELS.NO_CAPACITY` from `"Fully booked"` to `"No pros available"` — the reason now covers "nobody works then" as well as "all booked", and the comment above the map should say so.

- [ ] **Step 4: Render it**

In `preferred-start-picker.tsx`, the `ChoiceCard` `description` currently carries only the unavailable reason. Make it carry `durationLabel` joined with `scarcityLabel` when available, and the unavailable reason when not:

```tsx
description={
  window.isAvailable
    ? [window.durationLabel, window.scarcityLabel].filter(Boolean).join(" · ")
    : (window.unavailableLabel ?? "Not available")
}
```

- [ ] **Step 5: Run to verify pass**

```bash
cd frontend && pnpm vitest run apps/customer/features/booking apps/customer/features/checkout
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/customer/features/booking/adapters/windows.ts frontend/apps/customer/features/booking/adapters/windows.test.ts frontend/apps/customer/features/checkout/view/preferred-start-picker.tsx
git commit -m "feat(customer): show work estimate and scarcity on the arrival window card"
```

---

## Task 8: Per-visit window fetching

**Files:**
- Modify: `frontend/apps/customer/features/checkout/queries.ts:294-311`
- Modify: `frontend/packages/query/src/keys.ts`
- Modify: `frontend/apps/customer/features/checkout/view/slots-modal.tsx:112-128`
- Test: `frontend/apps/customer/features/checkout/view/slots-modal.test.tsx`

**Interfaces:**
- Consumes: `group_key` request field (Task 4).
- Produces: `useCandidateStarts(addressId: string, groupKey: string)`.

- [ ] **Step 1: Write the failing test**

```tsx
it("fetches a separate window list per visit", async () => {
  render(<SlotsModal groups={[switchGroup, tapGroup]} {...props} />);
  await screen.findByText("Select Electrical");
  expect(fetchSpy).toHaveBeenCalledWith(
    expect.objectContaining({ body: expect.stringContaining(switchGroup.key) }),
  );
  expect(fetchSpy).toHaveBeenCalledWith(
    expect.objectContaining({ body: expect.stringContaining(tapGroup.key) }),
  );
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && pnpm vitest run apps/customer/features/checkout/view/slots-modal.test.tsx
```

Expected: FAIL — only `address_id` is sent.

- [ ] **Step 3: Thread the group key**

Add `groupKey` to the `useCandidateStarts` signature and to its POST body. Add it to the query key in `frontend/packages/query/src/keys.ts` — without it, TanStack Query serves visit 1's cached windows for visit 2, which is the original bug in a new costume.

Keep `VOLATILE_STATE` semantics exactly as they are; do not add `staleTime`.

- [ ] **Step 4: Run to verify pass**

```bash
cd frontend && pnpm vitest run apps/customer/features/checkout
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/customer/features/checkout/queries.ts frontend/packages/query/src/keys.ts frontend/apps/customer/features/checkout/view/slots-modal.tsx frontend/apps/customer/features/checkout/view/slots-modal.test.tsx
git commit -m "fix(customer): fetch a separate slot grid per visit"
```

---

## Task 9: *(removed)*

A day-tick availability editor was planned here and **cut on 2026-08-07**. The hour-period editor
stays exactly as built — see spec §10 for why. **No file under
`frontend/apps/partner/features/application/` is touched by this plan.** If a task appears to want
`DraftPeriod`, `periodProblem`, `scheduleProblems`, or `weeklyHours` changed or deleted, that is a
mistake — stop and re-read spec §10.

Task numbering is left as-is so task references in commits and reviews stay stable.

---

## Task 10: Two-gated dispatch

Spec §11 / D5. **This is the task that breaks advance booking if rushed.**

**Files:**
- Modify: `backend/apps/assignments/ranking.py:30-36` (`ExclusionReason`), `:102-129` (`_exclusions_for`)
- Test: `backend/tests/assignments/test_dispatch_gating.py`

**Interfaces:**
- Consumes: `PartnerOnlineSession` (`apps.partners.models`), `evaluate_unit_candidates(unit) -> UnitRanking` and `ExclusionReason` (both existing in `ranking.py`), `settings.M1_TODAY_LEAD_TIME_MINUTES`.
- Produces: `ExclusionReason.OFFLINE_FOR_SAME_DAY`.

- [ ] **Step 1: Read the ranking module**

Read `backend/apps/assignments/ranking.py` in full, plus `backend/tests/assignments/test_dispatch_explainability.py`. Exclusions in this codebase are **recorded with a reason**, not silently filtered out of a queryset — the explainability tests assert on those reasons. The online gate must follow that pattern or it will pass its own test while breaking dispatch explainability.

- [ ] **Step 2: Write both failing tests — the gate and its inverse**

```python
@pytest.mark.django_db
def test_same_day_unit_excludes_offline_partner_with_a_reason(
    offline_electrician, online_electrician, unit_today
):
    ranking = evaluate_unit_candidates(unit_today)
    included = {c.partner_id for c in ranking.candidates}
    assert online_electrician.id in included
    assert offline_electrician.id not in included
    assert any(
        e.partner_id == offline_electrician.id
        and e.reason == ExclusionReason.OFFLINE_FOR_SAME_DAY
        for e in ranking.exclusions
    )


@pytest.mark.django_db
def test_advance_unit_still_reaches_an_offline_partner(offline_electrician, unit_next_tuesday):
    # Nobody is toggled online on Sunday for a Tuesday 15:00 job.
    ranking = evaluate_unit_candidates(unit_next_tuesday)
    assert offline_electrician.id in {c.partner_id for c in ranking.candidates}
```

The second test is the point of the task. Do not write the first without it.

Confirm the `UnitRanking` attribute names (`candidates` / `exclusions`) and the `CandidateEvaluation` field names against `ranking.py:38-90` before running — adjust the test to the real ones rather than renaming the dataclasses.

- [ ] **Step 3: Run to verify failure**

```bash
cd backend && python -m pytest tests/assignments/test_dispatch_gating.py -v
```

Expected: the first test FAILS (offline partners are currently ranked for everything); the second PASSES already and must keep passing.

- [ ] **Step 4: Implement the two gates**

`apps/assignments` currently references `PartnerOnlineSession` zero times — this is net-new. Add the reason to the existing enum:

```python
class ExclusionReason(models.TextChoices):
    ...
    OFFLINE_FOR_SAME_DAY = "OFFLINE_FOR_SAME_DAY", "Offline for a same-day visit"
```

Then in `_exclusions_for`, apply it **only** to same-day units — the boundary is the same horizon as Task 2, a unit is *same-day* when `requested_start <= now + M1_TODAY_LEAD_TIME_MINUTES`:

```python
if unit.requested_start <= now + timedelta(minutes=settings.M1_TODAY_LEAD_TIME_MINUTES):
    if not PartnerOnlineSession.objects.filter(
        partner=partner, ended_at__isnull=True
    ).exists():
        reasons.append(ExclusionReason.OFFLINE_FOR_SAME_DAY)
```

Advance units are gated only by `partner_available_during`, exactly as today. Load the online-session set once for the candidate pool rather than per partner inside the loop.

- [ ] **Step 5: Run to verify both pass, plus explainability**

```bash
cd backend && python -m pytest tests/assignments/ -v
```

Expected: PASS, including the pre-existing `test_dispatch_explainability.py`. If the advance test now fails, the gate has been applied unconditionally — revert and re-read spec §11.

Note: `ExclusionReason` is a `TextChoices` on a model field, so adding a member needs a migration.

```bash
cd backend && python manage.py makemigrations assignments
```

- [ ] **Step 6: Commit**

```bash
git add backend/apps/assignments/ranking.py backend/apps/assignments/migrations/ backend/tests/assignments/test_dispatch_gating.py
git commit -m "feat(assignments): require an online session for same-day dispatch only"
```

---

## Task 10b: Direct assignment for advance bookings

Spec §11.2 / D8. **Task 10 is incomplete without this one — do not ship them separately.** Making
an offline partner *eligible* while every offer still expires in 45 seconds produces a passing test
and a broken feature.

**Files:**
- Modify: `backend/apps/assignments/group_services.py:140-160`
- Modify: `backend/apps/assignments/services.py:90-100`
- Test: `backend/tests/assignments/test_direct_assignment.py`

**Interfaces:**
- Consumes: `evaluate_unit_candidates` (existing), `Reservation.Status.CONFIRMED`, `settings.M1_TODAY_LEAD_TIME_MINUTES`.
- Produces: `directly_assign(*, unit: FulfilmentUnit) -> Reservation`.

- [ ] **Step 1: Read the offer path end to end**

Read `backend/apps/assignments/group_services.py:140-260` and `services.py:90-215` before writing
anything. Direct assignment must reach the **same terminal state** the offer path reaches
(`PartnerOffer.Status.COMMITTED` equivalent → unit `PAYMENT_PENDING` → group
`PARTNER_COMMITTED`), or checkout will hang waiting for a commitment that never arrives.

Note precisely how `group_services.py:230-248` decides a group is fully committed — direct
assignment has to satisfy that same condition without creating `PartnerOffer` rows, or that check
must learn about directly-assigned units.

- [ ] **Step 2: Write the failing tests**

```python
@pytest.mark.django_db
def test_advance_unit_is_assigned_without_an_offer(offline_electrician, unit_next_tuesday):
    reservation = directly_assign(unit=unit_next_tuesday)
    assert reservation.partner_id == offline_electrician.id
    assert reservation.status == Reservation.Status.CONFIRMED
    assert not PartnerOffer.objects.filter(fulfilment_unit=unit_next_tuesday).exists()


@pytest.mark.django_db
def test_same_day_unit_still_uses_the_offer_path(online_electrician, unit_today):
    dispatch(unit=unit_today)
    offer = PartnerOffer.objects.get(fulfilment_unit=unit_today)
    assert offer.status == PartnerOffer.Status.OFFERED
    assert offer.expires_at <= timezone.now() + timedelta(
        seconds=settings.M1_PARTNER_OFFER_TIMEOUT_SECONDS
    )


@pytest.mark.django_db
def test_direct_assignment_reaches_payment_pending(offline_electrician, group_next_tuesday):
    dispatch_group(group=group_next_tuesday)
    group_next_tuesday.refresh_from_db()
    assert group_next_tuesday.status == BookingGroup.Status.PAYMENT_PENDING


@pytest.mark.django_db
def test_direct_assignment_cannot_double_book(sole_electrician, two_overlapping_advance_units):
    directly_assign(unit=two_overlapping_advance_units[0])
    with pytest.raises(IntegrityError):
        directly_assign(unit=two_overlapping_advance_units[1])
```

The last test is the safety property: the `ExclusionConstraint` — not the accept step — is what
prevents double-booking. Prove it still holds when the accept step is gone.

- [ ] **Step 3: Run to verify failure**

```bash
cd backend && python -m pytest tests/assignments/test_direct_assignment.py -v
```

Expected: FAIL — `directly_assign` does not exist.

- [ ] **Step 4: Implement the branch**

At the dispatch entry point, branch on the same horizon Task 10 uses:

```python
if unit.requested_start <= now + timedelta(minutes=settings.M1_TODAY_LEAD_TIME_MINUTES):
    return _dispatch_via_offer(unit=unit)      # existing path, unchanged
return _dispatch_directly(unit=unit)
```

`_dispatch_directly` takes the top-ranked candidate from `evaluate_unit_candidates(unit)` and
creates the `Reservation` with `status=CONFIRMED` and no `expires_at`, then advances the unit to
the same status the offer path sets on commit. Wrap the create in the same
`except IntegrityError -> OfferReservationConflictApiError` handling used at `services.py:198-204`
and fall through to the next-ranked candidate rather than failing the unit outright.

Do **not** delete `M1_PARTNER_OFFER_TIMEOUT_SECONDS` or `M1_PARTNER_SEARCH_TIMEOUT_SECONDS`. They
remain correct for the same-day branch.

- [ ] **Step 5: Run the full assignments suite**

```bash
cd backend && python -m pytest tests/assignments/ tests/carts/ -v
```

Expected: PASS. `test_dispatch_concurrency.py` and `test_group_dispatch.py` exercise the offer path
and must be unaffected — if either changes behaviour, the branch is catching same-day units.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/assignments/ backend/tests/assignments/test_direct_assignment.py
git commit -m "feat(assignments): direct-assign advance bookings instead of offering them"
```

---

## Task 10c: Safeguards for directly-assigned jobs

Spec §11.3. Without these a partner can be assigned a job they never see.

**Files:**
- Modify: `backend/apps/commerce/models.py` (new field + migration)
- Modify: `backend/apps/notifications/services.py`
- Modify: `backend/apps/fulfilment/tasks.py`
- Test: `backend/tests/assignments/test_direct_assignment_safeguards.py`

**Interfaces:**
- Consumes: `directly_assign` (Task 10b), `recovery_services.RELEASABLE_BOOKING_STATUSES` (existing).
- Produces: `Booking.assignment_acknowledged_at: datetime | None`, `Booking.needs_redispatch: bool`.

> **`needs_redispatch` and `assignment_acknowledged_at` do not exist yet.** Both are new fields on
> `commerce.Booking` and need a migration before the tests below will run. Add them in Step 0.

- [ ] **Step 0: Add the fields and migration**

```python
# commerce/models.py, on Booking
assignment_acknowledged_at = models.DateTimeField(null=True, blank=True)
needs_redispatch = models.BooleanField(default=False)
```

```bash
cd backend && python manage.py makemigrations commerce
```

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.django_db
def test_direct_assignment_notifies_the_partner(offline_electrician, unit_next_tuesday, outbox):
    directly_assign(unit=unit_next_tuesday)
    assert any(
        m.recipient_id == offline_electrician.user_id and m.kind == "JOB_ASSIGNED"
        for m in outbox
    )


@pytest.mark.django_db
def test_partner_may_release_a_directly_assigned_job_without_penalty(directly_assigned_booking):
    released = release_booking(booking=directly_assigned_booking, partner=...)
    assert released.status == Booking.Status.RECOVERY_REQUIRED


@pytest.mark.django_db
def test_unacknowledged_job_is_flagged_for_redispatch_24h_out(directly_assigned_booking, freezer):
    freezer.move_to(directly_assigned_booking.scheduled_start - timedelta(hours=24))
    sweep_unacknowledged_assignments()
    directly_assigned_booking.refresh_from_db()
    assert directly_assigned_booking.needs_redispatch is True
```

Read `backend/apps/notifications/services.py` for the real notification kinds and the outbox test
helper before finalising the first test — use the existing vocabulary rather than inventing
`"JOB_ASSIGNED"` if a suitable kind already exists.

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/assignments/test_direct_assignment_safeguards.py -v
```

Expected: FAIL on all three.

- [ ] **Step 3: Implement**

Notification on assignment; confirm `RELEASABLE_BOOKING_STATUSES` already admits a directly-assigned
`CONFIRMED` booking (it should — release is status-based, not offer-based) and extend only if it
does not; add the 24-hour acknowledgement sweep to `fulfilment/tasks.py` beside the existing
completion-deadline sweep at `tasks.py:66`.

The sweep **flags** for re-dispatch; it does not silently reassign. Re-dispatch is a separate
operations-visible action.

- [ ] **Step 4: Run to verify pass**

```bash
cd backend && python -m pytest tests/assignments/ tests/fulfilment/ -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/ backend/apps/fulfilment/tasks.py backend/tests/assignments/test_direct_assignment_safeguards.py
git commit -m "feat(assignments): notify, release and re-dispatch safeguards for direct assignment"
```

---

## Task 11: 72-hour quality dispute window

Spec §12. Activates `M1_QUALITY_DISPUTE_WINDOW_HOURS = 72`, which has been declared and unused.

**Files:**
- Create: `backend/apps/fulfilment/quality_dispute.py`
- Modify: `backend/apps/fulfilment/urls.py`, `backend/apps/fulfilment/views.py`
- Test: `backend/tests/fulfilment/test_quality_dispute.py`

**Interfaces:**
- Consumes: `CompletionSubmission`, `CompletionResponse` (`fulfilment/models.py:345-405`), `Booking.Status.DISPUTED`.
- Produces:
  ```python
  def open_quality_dispute(
      *, booking_id: UUID, customer_id: UUID, reason: str
  ) -> Booking
  ```

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.django_db
def test_dispute_within_72h_of_finalisation_opens_and_holds_payout(auto_finalised_booking, customer):
    booking = open_quality_dispute(
        booking_id=auto_finalised_booking.id, customer_id=customer.id, reason="Switch still sparking",
    )
    assert booking.status == Booking.Status.DISPUTED


@pytest.mark.django_db
def test_dispute_after_72h_is_refused(stale_finalised_booking, customer):
    with pytest.raises(BookingCommandInvalidApiError):
        open_quality_dispute(
            booking_id=stale_finalised_booking.id, customer_id=customer.id, reason="too late",
        )


@pytest.mark.django_db
def test_disputing_one_visit_leaves_the_sibling_settled(group_with_two_completed_visits, customer):
    open_quality_dispute(booking_id=second_visit.id, customer_id=customer.id, reason="leak returned")
    first_visit.refresh_from_db()
    assert first_visit.status == Booking.Status.COMPLETED
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/fulfilment/test_quality_dispute.py -v
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Read `backend/apps/fulfilment/completion.py` first — it already runs the 24-hour `CompletionResponse` path and the `PaymentAllocation` machinery this must reuse. The new path is the *second* window, opening only once a `CompletionResponse` exists with `decision=AUTO_FINALIZED`.

Set `Booking.Status.DISPUTED` and write the payout-hold field documented at `commerce/models.py:109-111`. Do **not** move money here — the ledger reads the hold before releasing a payout; refunds are an operations decision.

`cancel_booking` is not touched. `CUSTOMER_CANCELLABLE_STATUSES` is not extended. If a test seems to want either, re-read spec §12.

- [ ] **Step 4: Expose the endpoint and regenerate the contract**

```bash
cd backend && python manage.py spectacular --file ../contracts/openapi/v1.yaml --validate
```

```bash
cd frontend && pnpm contract:generate
```

- [ ] **Step 5: Run to verify pass**

```bash
cd backend && python -m pytest tests/fulfilment/ -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/fulfilment/ backend/tests/fulfilment/test_quality_dispute.py contracts/openapi/v1.yaml frontend/packages/api-client/src/generated/schema.d.ts
git commit -m "feat(fulfilment): 72-hour quality dispute window after auto-finalisation"
```

---

## Task 11b: Serve the service-area timezone

Spec §16. Removes the last hardcoded timezone from the customer app.

**Files:**
- Modify: `backend/apps/carts/serializers.py` (`BookingWindowsSerializer`)
- Modify: `backend/apps/carts/services.py` (`BookingWindows` dataclass)
- Modify: `frontend/apps/customer/features/booking/adapters/windows.ts:30,79-96,144-152`
- Test: `frontend/apps/customer/features/booking/adapters/windows.test.ts`

**Interfaces:**
- Produces: `BookingWindows.timezone: string` (IANA), consumed by `toWindowsView`.

**Best practice being applied:** the server owns the timezone because the server owns the
`ServiceArea`. A client that hardcodes a zone is correct only by coincidence, and the failure is
silent — every time shifts, nothing errors.

- [ ] **Step 1: Write the failing test**

```ts
it("formats in the area timezone the server sent, not a compiled-in one", () => {
  const view = toWindowsView({
    server_now: "2026-08-07T02:00:00Z",
    estimated_duration_minutes: 40,
    availability_is_preliminary: false,
    timezone: "Asia/Dubai",
    days: [{ date: "2026-08-07", is_today: true, windows: [
      { id: "w1", starts_at: "2026-08-07T02:30:00Z", ends_at: "2026-08-07T03:30:00Z",
        is_available: true, unavailable_reason: null, capacity: 2 },
    ]}],
  });
  // 02:30Z is 06:30 in Dubai, 08:00 in Kolkata. A hardcoded zone gets this wrong.
  expect(view.days[0].windows[0].label).toBe("6:30 am – 7:30 am");
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && pnpm vitest run apps/customer/features/booking/adapters/windows.test.ts
```

Expected: FAIL — renders `8:00 am – 9:00 am`, the Kolkata formatting.

- [ ] **Step 3: Add the field server-side**

`BookingWindows` already resolves `zone = ZoneInfo(area.timezone)` in `create_booking_windows`
(`services.py:781`). Carry that string onto the dataclass and serialise it. No new query.

- [ ] **Step 4: Make the formatters take a zone**

The three module-level `Intl.DateTimeFormat` singletons in `windows.ts:79-96` and the one inside
`isoDateIn` (`:144-152`) all close over `BOOKING_TIME_ZONE`. Replace them with a small factory
built once per `toWindowsView` call from `response.timezone`, and thread it into `toDayView` /
`toWindowView`.

`isoDateIn` matters as much as the visible labels — it decides which calendar day a window belongs
to, so a wrong zone there mislabels "Today"/"Tomorrow", not just clock times.

Keep the `BOOKING_TIME_ZONE` export as the fallback for any caller that has no response yet, and
mark it deprecated in the comment rather than deleting it — `adapters/index.ts:1` re-exports it.

- [ ] **Step 5: Regenerate the contract and run both gates**

```bash
cd backend && python manage.py spectacular --file ../contracts/openapi/v1.yaml --validate
```

```bash
cd frontend && pnpm contract:generate && pnpm vitest run apps/customer
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/carts/ contracts/openapi/v1.yaml frontend/packages/api-client/src/generated/schema.d.ts frontend/apps/customer/features/booking/adapters/
git commit -m "feat(customer): format booking windows in the service area timezone"
```

---

## Task 11c: Reschedule offers a genuine re-match

Spec §17. Live capacity makes the M1 "same partner only" boundary unnecessary.

**Files:**
- Modify: `backend/apps/fulfilment/cancellation.py:277-334` (`_reschedule_notice_ok`, `_guard_unit_reschedulable`), `:335-378` (`_reschedule_locked_unit`)
- Test: `backend/tests/fulfilment/test_reschedule_rematch.py`

**Interfaces:**
- Consumes: `load_snapshot` (Task 1), `evaluate_unit_candidates` (existing).

**Best practice being applied:** a reschedule is a re-booking, not an edit of one partner's
calendar. Pinning it to the original partner turns a capacity question into an availability
question about one person, which is why it currently has to refuse rather than re-match.

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.django_db
def test_reschedule_keeps_the_same_partner_when_they_are_free(confirmed_booking, new_start):
    booking = reschedule_booking(
        booking_id=confirmed_booking.id, customer_id=confirmed_booking.customer_id,
        expected_version=confirmed_booking.version, new_requested_start=new_start,
    )
    assert booking.partner_id == confirmed_booking.partner_id


@pytest.mark.django_db
def test_reschedule_rematches_when_the_original_partner_is_busy(
    confirmed_booking, other_electrician, new_start_when_original_is_booked
):
    booking = reschedule_booking(
        booking_id=confirmed_booking.id, customer_id=confirmed_booking.customer_id,
        expected_version=confirmed_booking.version,
        new_requested_start=new_start_when_original_is_booked,
    )
    assert booking.partner_id == other_electrician.id


@pytest.mark.django_db
def test_reschedule_still_refused_when_nobody_is_available(confirmed_booking, dead_slot):
    with pytest.raises(PartnerUnavailableApiError):
        reschedule_booking(..., new_requested_start=dead_slot)
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/fulfilment/test_reschedule_rematch.py -v
```

Expected: the second test FAILS with `PartnerUnavailableApiError` — today the original partner
being busy ends the reschedule.

- [ ] **Step 3: Implement prefer-then-rematch**

In `_guard_unit_reschedulable`, replace the single `partner_available_during(partner=booking.partner, ...)`
check with: try the original partner first; if unavailable, take the top-ranked alternative from
the capacity snapshot for the new start. Refuse only when **nobody** is available.

In `_reschedule_locked_unit`, when the partner changes: release the old `Reservation`, create a new
one for the new partner (turnaround included — see Task 5), repoint `booking.partner`, and record
the partner change in the existing `record_transition` `context` dict so the audit row shows it.

**Do not change the fee policy.** `_reschedule_notice_ok` and the late-partner waiver stay exactly
as they are — this task changes *who can serve* the new time, not *what a reschedule costs*.

A partner change must also re-issue the visit's start OTP: `BookingOtp` is per `Booking` and the
original partner must not retain a usable code.

- [ ] **Step 4: Run the full fulfilment suite**

```bash
cd backend && python -m pytest tests/fulfilment/ tests/assignments/ -v
```

Expected: PASS. The existing reschedule tests assert the same-partner path and must still pass
unchanged — if any now fail, the prefer-original ordering is wrong.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/fulfilment/cancellation.py backend/tests/fulfilment/test_reschedule_rematch.py
git commit -m "feat(fulfilment): re-match a reschedule when the original partner is busy"
```

---

## Task 11d: Suspension releases future work

Spec §18. **Safety-severity. Run this task first if the plan is split across releases.**

**Files:**
- Modify: `backend/apps/partners/services.py:1093-1107`
- Create: `backend/apps/assignments/suspension.py`
- Test: `backend/tests/assignments/test_suspension_release.py`

**Interfaces:**
- Consumes: `Reservation`, `Booking.Status.RECOVERY_REQUIRED`, `BookingOtp`, `recovery_services.RELEASABLE_BOOKING_STATUSES`.
- Produces: `release_future_work(*, partner: PartnerProfile, reason: str) -> tuple[Booking, ...]`.

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.django_db
def test_offboarding_releases_a_future_booking(approved_partner, future_confirmed_booking):
    set_application_status(
        application=approved_partner.application,
        target_status=PartnerApplication.Status.OFFBOARDED,
        reason="fraud",
    )
    future_confirmed_booking.refresh_from_db()
    assert future_confirmed_booking.status == Booking.Status.RECOVERY_REQUIRED
    reservation = Reservation.objects.get(id=future_confirmed_booking.reservation_id)
    assert reservation.status == Reservation.Status.RELEASED


@pytest.mark.django_db
def test_offboarding_invalidates_the_start_otp(approved_partner, future_confirmed_booking):
    set_application_status(..., target_status=PartnerApplication.Status.OFFBOARDED, reason="fraud")
    assert not BookingOtp.objects.filter(
        booking=future_confirmed_booking, consumed_at__isnull=True
    ).exists()


@pytest.mark.django_db
def test_released_slot_returns_to_capacity(approved_partner, other_partner, future_confirmed_booking):
    before = load_snapshot(...).capacity(starts_at=slot, duration_minutes=40)
    set_application_status(..., target_status=PartnerApplication.Status.SUSPENDED, reason="review")
    after = load_snapshot(...).capacity(starts_at=slot, duration_minutes=40)
    assert after == before  # the suspended partner's held slot is freed, not leaked


@pytest.mark.django_db
def test_in_flight_visit_is_not_auto_released(approved_partner, arrived_booking):
    set_application_status(..., target_status=PartnerApplication.Status.SUSPENDED, reason="review")
    arrived_booking.refresh_from_db()
    assert arrived_booking.status == Booking.Status.ARRIVED
```

The fourth test is the guard rail: sweeping a visit where the partner is already on site would
strand a half-finished job with no completion record.

Confirm the real `BookingOtp` consumed/expiry field name against `fulfilment/models.py:57-90`
before finalising the second test.

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/assignments/test_suspension_release.py -v
```

Expected: the first three FAIL (nothing is released today); the fourth PASSES already and must
keep passing.

- [ ] **Step 3: Implement the sweep**

Create `backend/apps/assignments/suspension.py`. Select this partner's `Booking` rows whose
`scheduled_start` is in the future and whose status is in `RELEASABLE_BOOKING_STATUSES`; for each,
release the reservation, transition to `RECOVERY_REQUIRED` via the existing `record_transition`,
and invalidate outstanding OTPs.

Reuse the release path in `assignments/recovery_services.py` rather than writing a second one —
read it first. Call the new function from the suspend/offboard branch in
`partners/services.py:1093-1107`, inside the same transaction as the status change.

Notification and operations surfacing ride the existing recovery tooling; `RECOVERY_REQUIRED` is
already what the admin dispatch-recovery screen consumes.

- [ ] **Step 4: Run the full suites**

```bash
cd backend && python -m pytest tests/assignments/ tests/partners/ tests/fulfilment/ -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/assignments/suspension.py backend/apps/partners/services.py backend/tests/assignments/test_suspension_release.py
git commit -m "fix(partners): release future bookings when a partner is suspended or offboarded"
```

---

## Task 12: Full gates and browser suite

Project policy runs the browser suite once, here.

- [ ] **Step 1: Backend gate**

```bash
cd backend && scripts\quality.cmd
```

- [ ] **Step 2: Frontend gate**

```bash
cd frontend && pnpm verify
```

- [ ] **Step 3: Browser suite**

```bash
cd frontend && pnpm e2e
```

`frontend/e2e/cart.e2e.ts` and `frontend/e2e/support/cart-api.ts` both reference the windows endpoint and will need their fixtures updated for `group_key` and `capacity`.

- [ ] **Step 4: Commit any fixture updates**

```bash
git add frontend/e2e/
git commit -m "test(e2e): update cart fixtures for per-group windows and slot capacity"
```

---

## Deferred (not in this plan)

- **B7 — actual-duration learning loop.** Capture start/end from `WorkSession`, block the calendar on observed p75, show the customer p50. Needs its own spec.
- **B8 — overrun policy.** What happens when a visit runs past its window into the partner's next booking. Needs a product decision before a spec.
- Per-area travel calibration (spec §15.3).
