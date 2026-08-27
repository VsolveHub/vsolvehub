# Partner active shelf hides work that has already started

**Owner:** backend (`apps/fulfilment/views/partner.py`)
**Found:** 26 August 2026, by running the view's own queryset against the seeded
development database.
**Frontend status:** worked around in the Partner app (the work stack now reads
the unfiltered list). The server-side shelf is still wrong for any other
consumer, and the workaround costs a larger payload than the shelf should need.

## What happens

`GET /api/v1/partner/bookings/?bucket=active` filters:

```python
window_start = midnight today (settings.TIME_ZONE)
window_end   = window_start + timedelta(days=_ACTIVE_HORIZON_DAYS)  # 2

queryset
  .exclude(status__in=_PARTNER_TERMINAL_STATUSES)
  .filter(scheduled_start__gte=window_start, scheduled_start__lt=window_end)
```

The **upper** bound is right and well argued in the docstring: a booking three
weeks out is real but it is not a task.

The **lower** bound is the defect. A booking whose `scheduled_start` is before
midnight today and which has *not* reached a terminal status sorts below the
window and disappears from the shelf. Nothing else lists it: `completed` is
terminal-only, `cancelled` is terminal-only, and those three are the only named
buckets.

## Why it matters

The statuses that survive past their scheduled start are exactly the ones where
a Partner is physically doing the work — `EN_ROUTE`, `ARRIVED`, `IN_PROGRESS`,
`ABORTED`, `COMPLETION_SUBMITTED`. Those are also the statuses whose next
transition only the Partner can make.

Measured against the seeded database on 26 August 2026, four of ten bookings
were in neither `active` nor `completed`:

| Partner | Status | Scheduled | Consequence |
|---|---|---|---|
| Demo Partner 3 | `ARRIVED` | 30 Aug | On site; cannot start work or file completion |
| Demo Partner 4 | `IN_PROGRESS` | 24 Aug | Started two days ago; cannot file completion |
| Demo Partner 1 | `CONFIRMED` | 30 Aug | Confirmed work invisible until the 29th |
| Demo Partner 10 | `CANCELLED` | 27 Aug | Only in `cancelled`, which no client reads |

The first two are the serious ones. The Customer app shows those same bookings
as `ARRIVED` / `IN_PROGRESS` with the Partner named and, for `IN_PROGRESS`, a
live work session — while the Partner's own app cannot show the job at all. The
two portals disagree about work that is happening right now.

The everyday version of this does not need stale seed data: any visit that runs
past midnight leaves the shelf at 00:00 while the Partner is still in the
customer's home.

## Proposed change

Drop the lower bound for work that has already begun. The horizon is about
*planning* — it should not be able to hide *doing*.

```python
queryset = queryset.exclude(status__in=_PARTNER_TERMINAL_STATUSES).filter(
    Q(scheduled_start__lt=window_end)          # today and tomorrow, as now
    | Q(status__in=_PARTNER_STARTED_STATUSES)  # …plus anything already underway
)
```

with

```python
_PARTNER_STARTED_STATUSES = (
    Booking.Status.EN_ROUTE,
    Booking.Status.ARRIVED,
    Booking.Status.IN_PROGRESS,
    Booking.Status.ABORTED,
    Booking.Status.COMPLETION_SUBMITTED,
)
```

The simpler `scheduled_start__lt=window_end` alone (removing `__gte` entirely)
also fixes it and is one character shorter, but it drags every stale
never-started `CONFIRMED` booking back onto the shelf — which is what the
existing `late_declared_at` exclusion was added to prevent. Keeping the lower
bound for unstarted work and lifting it for started work preserves both
intentions.

## Suggested regression tests

1. A booking `IN_PROGRESS` with `scheduled_start` yesterday appears in `active`.
2. A booking `ARRIVED` with `scheduled_start` three days from now appears in
   `active` (it is underway regardless of when it was booked for).
3. A `CONFIRMED` booking with `scheduled_start` three days from now still does
   **not** appear — the planning horizon is unchanged.
4. A `CONFIRMED` booking with `late_declared_at` set still does not appear.

## Frontend workaround, for removal later

`features/work/queries.ts` gained a `JobBucket` value of `"all"` that omits the
`bucket` parameter, and `features/work-stack/queries.ts` reads that instead of
`active`, deduplicating against the `completed` read by booking id. Once the
shelf is fixed, the stack should go back to `active` + `completed` and `"all"`
can be deleted.
