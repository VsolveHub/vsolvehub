# Slot Booking Fixes & Duration-Aware Windows — Task Board

**Created:** 2026-08-08
**Branch:** `feat/work-based-slot-booking` (continue on this branch; do not create a new one per agent)
**Related:** `docs/superpowers/specs/2026-08-07-work-based-slot-booking-design.md`,
`docs/superpowers/plans/2026-08-07-work-based-slot-booking.md`

This board covers three things found during manual testing of the slot-booking work: two real
backend bugs, one under-scoped UX gap, and one deliberate feature addition (duration-aware arrival
windows). It is written to be read cold by an agent with no memory of the conversation that produced
it — every claim below was verified against the code on this branch, not recalled from discussion.

---

## 0. Ownership override — read this first

**This supersedes the `## Ownership` section of `AGENTS.md` for the duration of this board.**
`AGENTS.md` assigns `backend/**` to Codex and `frontend/**` to Claude. For this board the assignment
is swapped:

| Owner | Paths |
|---|---|
| **Claude** | `backend/**`, `infra/**`, `contracts/openapi/**`, `docs/adr/**`, `docs/runbooks/**` |
| **Antigravity** | `frontend/apps/**`, `frontend/packages/ui/**`, `frontend/packages/query/**`, `frontend/packages/api-client/**`, `frontend/packages/testing/**`, `contracts/proposals/**` |

Every other rule in `AGENTS.md` — architecture, Python environment, backend commands, quality bars,
git safety — still applies unmodified. This section only swaps *who* holds *which* seat.

**Do not edit the other agent's owned paths.** If a task genuinely requires touching both sides
(none below do), stop and raise it as an explicit integration task rather than crossing the
boundary unilaterally.

---

## 1. Base prompt — Claude (backend seat)

You are implementing backend fixes on `C:\dev\vsolve\backend` (Django 5 + DRF). You own
`backend/**`, `infra/**`, `contracts/openapi/**`, `docs/adr/**`, `docs/runbooks/**`. Do not edit
anything under `frontend/**` except by regenerating `frontend/packages/api-client/src/generated/*`
via `pnpm contract:generate` after you publish a contract change — never hand-edit that output.

Non-negotiable, taken from `AGENTS.md` and this session's own findings:

- Server calculates every price and financial value in integer paise. None of these tasks touch
  pricing — if a change you're making starts to, stop and ask.
- Keep views thin; business invariants live in domain services (`apps/*/services.py`,
  `apps/*/group_services.py`, `apps/*/planning.py`).
- State-changing commands must be authorized, idempotent where retryable, and auditable.
- Database constraints protect invariants in addition to application checks — don't remove or
  weaken the `ExclusionConstraint` on `Reservation` or the uniqueness constraints on `PartnerOffer`
  to make a bug "go away."
- Never add hidden fallback prices, locations, providers, statuses, or success states. A failure
  stays a stated failure with a stated reason.
- Add a regression test with every bug fix — a test that fails on `main` before your fix and passes
  after it.
- Ruff, strict MyPy, `manage.py makemigrations --check`, and `manage.py spectacular --validate` must
  pass before you call a task done. Run `backend\scripts\quality.cmd`.
- Any new backend query path touching the availability/dispatch engines
  (`apps/carts/availability.py`, `apps/assignments/ranking.py`, `apps/carts/planning.py`) must state
  its query count in a comment and must not duplicate the shared predicate
  (`schedule_covers`, `availability_window_contains`). This session shipped a bug precisely because
  two code paths computed "does this schedule cover this range" two different ways — don't repeat
  it.
- New settings constants go in `backend/config/settings/base.py` next to the existing `M1_*` block,
  same naming convention (`M1_SCREAMING_SNAKE_CASE`), with a one-line docstring comment explaining
  the number, not just the name.
- Every task below ends in its own commit, conventional-commit style
  (`fix(scope): summary` / `feat(scope): summary`), matching this branch's existing history. Do not
  squash multiple tasks into one commit and do not push.

---

## 2. Base prompt — Antigravity (frontend seat)

You are implementing frontend fixes on `C:\dev\vsolve\frontend` (Next.js App Router, TanStack
Query). You own `frontend/apps/**`, `frontend/packages/ui/**`, `frontend/packages/query/**`,
`frontend/packages/api-client/**`, `frontend/packages/testing/**`, `contracts/proposals/**`. Do not
edit anything under `backend/**`, and never hand-edit
`frontend/packages/api-client/src/generated/**` — it is regenerated from the backend's published
OpenAPI contract via `pnpm contract:generate`. If a task needs a field the contract doesn't have
yet, write the need into `contracts/proposals/**` and treat the task as blocked until Claude
publishes it, rather than inventing the field client-side.

Non-negotiable:

- No client-side money. Every rupee rendered comes from a server field.
- Query keys live only in `frontend/packages/query/src/keys.ts`. Inline key literals break
  invalidation.
- No fallback/mock data. An empty or failed state renders an honest empty/error state, never a
  substitute.
- Error copy is written for the reason code the server actually gave, not a generic catch-all —
  see FE-1 and FE-2 below for the specific instance of this rule that's currently broken.
- `pnpm verify` (`contract:check && lint && typecheck && test && build`) must pass before you call
  a task done.
- Every task below ends in its own commit, conventional-commit style, matching this branch's
  existing history. Do not squash multiple tasks into one commit and do not push.

---

## 3. Shared rules (both agents)

1. **Contract is the only interface between you.** Claude publishes `contracts/openapi/v1.yaml`;
   Antigravity consumes it via the generated client. Neither of you agrees on a shape by talking —
   you agree on it by one of you publishing it and the other regenerating against it.
2. **This board, not conversation, is the spec.** If a task's Files/Objective/Acceptance Criteria
   look wrong against the actual code, trust the code and flag the discrepancy in your commit
   message — don't silently force the task description to be right.
3. **One task, one commit, one file list.** If finishing a task requires touching a file not listed
   under it, that's a signal to re-read the task, not a license to expand scope.
4. **TDD, matching how the rest of this branch was built**: write the failing test first, confirm it
   fails for the stated reason, implement the minimal fix, confirm it passes, then run the full
   quality gate before committing.
5. **Git safety**: pull the branch before starting each task (the other agent may have committed
   since you last synced). Never force-push. Never `git reset --hard` without checking
   `git status` first. Neither agent merges to `main` — a human does that after review.
6. **If you hit a genuine blocker** (a dependency task from the other agent hasn't landed yet, the
   contract doesn't have a field you need), stop and report it rather than working around it with a
   local hack that will be thrown away at integration.

---

## 4. Dependency graph

```
Parallel, no dependencies — start immediately:
  BE-1  (Claude)   Duration-aware arrival windows
  BE-2  (Claude)   Fix undo cascading to whole group
  BE-3  (Claude)   Fix cross-visit conflict turnaround mismatch
  BE-4  (Claude)   Defensive expiry filter on partner offers list
  FE-1  (Antigravity) Route plan-set failures through the existing reason-code table
  FE-2  (Antigravity) Idempotency-reuse copy on the quote step

Sequential, backend only:
  BE-5 (Claude) → BE-6 (Claude)
  Fire offer-created notifications  →  SSE stream backed by those notifications

Cross-team, contract-first:
  BE-5 publishes the event contract  →  FE-3 (Antigravity) can start against the documented
  shape immediately; final integration/testing is blocked on BE-6 actually being live.
```

Six of nine tasks (BE-1–4, FE-1–2) have zero dependencies on anything else in this board and can
start on both seats simultaneously today. Only FE-3 has a real cross-team wait, and only for its
last mile (integration testing against a live stream) — the UI itself can be built the moment BE-5
documents the event shape.

---

## Backend tasks (Claude)

### BE-1: Duration-aware arrival windows

**Objective:** Stop offering an identical 60-minute grid for every service regardless of how long
the work actually takes. A 40-minute switch repair should get a tighter arrival window (more,
closer-together slots); a 180-minute deep-clean should get a wider one (fewer, honestly-sized
slots). This is a refinement of the already-approved arrival-window model, not a reversal of it —
see `docs/superpowers/specs/2026-08-07-work-based-slot-booking-design.md` §4 for why arrival window
(not exact-start, not work-window) is the correct model for this catalog.

**Files:**
- Modify: `backend/config/settings/base.py` (new tier constants, next to the existing `M1_*` block)
- Modify: `backend/apps/carts/services.py:743-821` (`create_booking_windows` grid loop), `:935`
  (legacy single-item `Quote.arrival_window_minutes` write)
- Modify: `backend/apps/carts/planning.py:922`, `:1031` (`PlanUnit`/`Quote` `arrival_window_minutes`
  writes on the multi-visit path)
- Test: `backend/tests/carts/test_booking_windows_capacity.py` (extend), or a new
  `backend/tests/carts/test_duration_aware_windows.py`

**Interfaces:**
- Produces: `def arrival_window_for_duration(duration_minutes: int) -> int` in
  `backend/apps/carts/availability.py` — a small, pure, three-tier function. Both `services.py` and
  `planning.py` call this instead of reading `settings.M1_ARRIVAL_WINDOW_MINUTES` directly.

**Do not touch:** `FulfilmentUnit.arrival_window_minutes` and the other three model fields at
`backend/apps/carts/models.py:291,384,426,560` — they already exist as real per-unit columns.
This task changes what gets *written* into them, not the schema.

**Approach:**

```python
# apps/carts/availability.py
M1_ARRIVAL_WINDOW_SHORT_THRESHOLD_MINUTES = 45   # duration at/under this gets a 30-min window
M1_ARRIVAL_WINDOW_LONG_THRESHOLD_MINUTES = 120    # duration at/under this gets a 60-min window;
                                                    # above it gets 120-min. Add these to base.py,
                                                    # not availability.py, matching the M1_* home.

def arrival_window_for_duration(duration_minutes: int) -> int:
    """The arrival window a visit of this duration should be offered in.

    Bucketed into three tiers rather than a continuous function of duration, so
    the grid stays predictable — a 41-minute job and a 44-minute job should not
    render visibly different grids for a difference nobody asked about.
    """
    if duration_minutes <= settings.M1_ARRIVAL_WINDOW_SHORT_THRESHOLD_MINUTES:
        return settings.M1_ARRIVAL_WINDOW_SHORT_MINUTES        # 30
    if duration_minutes <= settings.M1_ARRIVAL_WINDOW_LONG_THRESHOLD_MINUTES:
        return settings.M1_ARRIVAL_WINDOW_STANDARD_MINUTES     # 60, today's default, unchanged
    return settings.M1_ARRIVAL_WINDOW_LONG_MINUTES              # 120
```

Then in `create_booking_windows`, replace every direct use of
`settings.M1_ARRIVAL_WINDOW_MINUTES` in the grid loop with
`arrival_window_for_duration(duration)`, where `duration` is the group's own
`estimated_duration_minutes` (already resolved earlier in that function this session — see
`group.estimated_duration_minutes` at the top of `create_booking_windows`). The loop step, the
`ends_at` on each `BookingWindow`, and the fit-before-closing check all use the *same* derived
value — don't let the step and the window width drift apart from each other.

Mirror the same call at `planning.py:922` and `:1031` so the value locked onto the actual
`PlanUnit`/`Quote`/`FulfilmentUnit` at booking time matches what the grid promised — a customer
who picked a 30-minute window must not end up with `arrival_window_minutes=60` on their actual
booking.

**Acceptance criteria:**
- A cart containing only a 40-minute service produces a grid with 30-minute-wide windows.
- A cart containing a 180-minute service produces a grid with 120-minute-wide windows.
- A cart containing a 70-minute service still produces today's 60-minute windows (regression: the
  standard tier must not have shrunk).
- The `arrival_window_minutes` written onto the resulting `FulfilmentUnit` matches what the grid
  displayed for the chosen slot, not the old flat constant.
- `tests/carts/` full suite still green (this touches shared grid-generation code).

---

### BE-2: Fix undo cascading to the whole booking group

**Objective:** Undoing acceptance of one visit in a multi-visit booking currently destroys every
other visit in the same group, including ones already successfully held. Fix it so only the
undone visit fails to re-match; siblings stay intact.

**Files:**
- Modify: `backend/apps/assignments/group_services.py:113-133` (`_create_offer`)
- Test: `backend/tests/assignments/test_undo_does_not_cascade.py` (new)

**Root cause (verified this session):** `decline_or_undo_unit_offer`
(`group_services.py:499-515`) correctly scopes the undo to one unit and calls `_create_offer` to
redispatch just that unit. `_create_offer` calls `evaluate_unit_candidates(unit)`, which excludes
any partner already carrying an `AssignmentAttempt` row for *this unit* (`ALREADY_ATTEMPTED`). With
only one qualified partner in a service area — a normal early-stage-marketplace condition, not an
edge case — the redispatch finds zero candidates and falls into:

```python
if not candidates:
    if not post_booking_recovery:
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)
    return None
```

`_compensate_group` (`group_services.py:84-111`) is **group-wide**: it releases every reservation,
revokes every offer, and cancels/fails every unit in the `BookingGroup` — including a sibling unit
that already has a held or confirmed reservation from before the undo.

**Interfaces:**
- Produces: no new public function signature — the fix is a conditional inside `_create_offer`'s
  zero-candidates branch.

**Approach:** Group-wide compensation is correct when the *group itself* has never successfully
staffed anything yet (initial dispatch, every unit still `MATCHING`) — that's a real "this booking
cannot be fulfilled at all" case. It is not correct when a sibling unit already holds a live
reservation (`HELD`, `CONFIRMED` `FulfilmentUnit.Status`, or an active `PartnerOffer` in
`ACCEPTED_PENDING_UNDO`/`COMMITTED`). In that case, the correct outcome is: this one unit moves to a
state that says "could not be restaffed" (reuse `FulfilmentUnit.Status.FAILED` — check whether that
status already has a customer-facing meaning distinct from group-level failure before reusing it,
and check what `BookingGroup.Status.PARTIALLY_HELD` already means, since it may already be the
correct group-level status for "some units fine, one unit stuck"), and the group stays at whatever
status correctly reflects "some units fine, one unit stuck" — do not force it to `REPLAN_REQUIRED`
if siblings are intact.

Write the condition explicitly:

```python
if not candidates:
    siblings_already_secured = FulfilmentUnit.objects.filter(
        booking_group=group,
    ).exclude(id=unit.id).filter(
        status__in=(FulfilmentUnit.Status.HELD, FulfilmentUnit.Status.CONFIRMED),
        # confirm the exact status names against apps/carts/models.py before writing this —
        # do not assume without checking.
    ).exists()
    if not post_booking_recovery and not siblings_already_secured:
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)
        return None
    # sibling-safe path: fail only this unit, leave the group and its other units alone.
    _set_unit_status(unit, FulfilmentUnit.Status.FAILED)
    _sync_group_state(group)
    return None
```

Read `_sync_group_state` before writing this — confirm it already derives a sensible group status
(`PARTIALLY_HELD` or similar) from a mix of `FAILED` and `HELD` sibling units, rather than assuming.
If it doesn't handle a `FAILED` unit correctly today, that's part of this task to fix, not a
separate one.

**Acceptance criteria (write these as the regression test, in this order):**
1. Two-visit group, both units accepted and held by the same sole-qualified partner. Undo one.
   Assert: the undone unit is redispatched-and-fails (zero other candidates exist), **and** the
   sibling unit's reservation and offer are untouched — still `HELD`/`ACCEPTED_PENDING_UNDO`.
2. Same setup, but a *second* qualified partner exists. Undo one. Assert: the undone unit
   successfully redispatches to the second partner (this is the non-buggy path today — must not
   regress it).
3. Single-visit group (no siblings to protect), zero remaining candidates after undo. Assert:
   group-wide compensation still fires — this is the case that was correct before and must stay
   correct.

---

### BE-3: Fix cross-visit conflict check ignoring the turnaround buffer

**Objective:** The multi-visit conflict check that's supposed to catch "these two visits can't both
be staffed by the available partner pool" computes time overlap without the turnaround buffer that
the actual reservation system uses — so it passes bookings that later collide at accept time with a
misleading "another professional has accepted" error.

**Files:**
- Modify: `backend/apps/carts/planning.py:333-364` (`_has_cross_visit_conflict`)
- Test: `backend/tests/carts/test_cross_visit_conflict.py` (extend, or confirm this file's existing
  coverage — Task 6 of the original slot-booking plan should have created it; check before assuming
  it needs to be created fresh)

**Root cause (verified this session):**

```python
ranges = [
    (starts_at, starts_at + timedelta(minutes=duration))   # ← no turnaround
    for _, starts_at, duration, *_ in unit_inputs
]
```

`_eligible_partner_ids` (`planning.py:154-193`), the function that actually decides whether a
partner is free for a unit, widens the occupied window by `M1_TURNAROUND_MINUTES`
(`planning.py:177`). Reservation creation does the same. So two visits that are exactly
back-to-back with zero gap (e.g. 5:00–5:40 and 5:40–6:40) are judged **not overlapping** by this
check — but the *actual* reservations, widened by the 20-minute turnaround, occupy 5:00–6:00 and
5:40–7:00, which **do** overlap. The check passes a booking that the reservation system then
rejects.

**Interfaces:** No signature change — the fix is inside the existing function.

**Approach:**

```python
ranges = [
    (starts_at, starts_at + timedelta(minutes=duration + settings.M1_TURNAROUND_MINUTES))
    for _, starts_at, duration, *_ in unit_inputs
]
```

Confirm `settings` is already imported in `planning.py` (it almost certainly is, given
`_eligible_partner_ids` in the same file already uses `settings.M1_TURNAROUND_MINUTES`) before
adding the import.

**Acceptance criteria:**
- A new or extended test: two units for the same single-qualified-partner pool, requested
  back-to-back with zero gap (unit B starts exactly when unit A's *duration* ends, before
  turnaround). Assert `_has_cross_visit_conflict` now returns `True` for this pair when only one
  partner is eligible for both.
- A test confirming units separated by *more* than the turnaround gap still correctly return
  `False` (not overly conservative — don't turn this into "any two same-day visits conflict").
- Full `tests/carts/` suite still green.

---

### BE-4: Defensive expiry filter on the partner offers list

**Objective:** Belt-and-suspenders correctness. Today, an offer whose `expires_at` has passed but
hasn't yet been swept by the periodic `reconcile_group_dispatch` task still displays as `OFFERED` in
the partner's list, because the list endpoint reads the stored `status` field only. The accept path
already independently checks `expires_at` and correctly refuses a stale accept — this task makes
the *list* agree with that, so a partner never sees something as acceptable that the accept
endpoint would reject.

**Files:**
- Modify: `backend/apps/assignments/views.py:95-121` (the `GET` on the partner offers list)
- Test: `backend/tests/assignments/test_offer_list_expiry.py` (new)

**Interfaces:** No signature change.

**Approach:** The current query:

```python
offers = (
    PartnerOffer.objects.filter(partner=profile)
    .exclude(status__in=(DECLINED, UNDONE, EXPIRED, REVOKED))
    ...
)
```

Add a second exclusion for offers whose clock has run out even though nothing has swept them yet:

```python
.exclude(status=PartnerOffer.Status.OFFERED, expires_at__lte=timezone.now())
```

This does **not** replace the periodic sweep (`reconcile_group_dispatch` must keep running — it's
what actually frees the reservation and lets redispatch happen) — it only stops the read side from
showing a stale row in the meantime. Say this explicitly in the commit message so nobody later
"simplifies" the sweep task away thinking this filter replaced it.

**Acceptance criteria:**
- An offer with `status=OFFERED` and `expires_at` in the past does not appear in the partner's
  offer list.
- An offer with `status=OFFERED` and `expires_at` in the future still appears (don't over-filter).
- Existing `tests/assignments/` offer-list tests still pass.

---

### BE-5: Fire offer-created notifications for the ordinary offer path

**Objective:** Today, `request_notification(channel="PUSH", ...)` is only called from
`directly_assign` (advance bookings). The ordinary same-day offer path (`_create_offer`) creates no
notification at all. This task gives every new offer a `NotificationIntent` row, and — just as
importantly — **publishes the event contract that BE-6 and FE-3 build against**, so Antigravity can
start FE-3 immediately rather than waiting for BE-6 to be fully built.

**Files:**
- Modify: `backend/apps/assignments/group_services.py:113-133` (`_create_offer`)
- Test: `backend/tests/assignments/test_offer_creation_notifies.py` (new)

**Interfaces:**
- Produces (**this is the contract FE-3 depends on — get it right and document it clearly**):
  a `NotificationIntent` row with `purpose="partner.offer_created"`,
  `template_code="partner_offer_created"`, `channel=PUSH`, and `context` containing at minimum:
  ```json
  {
    "offer_id": "<uuid>",
    "fulfilment_unit_id": "<uuid>",
    "requested_start": "<iso8601>",
    "expires_at": "<iso8601>"
  }
  ```
  Publish this exact shape as a code comment at the call site **and** as a short note in
  `contracts/proposals/partner-offer-events.md` (new file, your side to write) so Antigravity has a
  written contract to build FE-3 against without waiting for BE-6.

**Approach:** Mirror the existing call in `directly_assign` (`group_services.py:356-365`) —
same function, same channel, different `purpose`/`template_code`, idempotency key
`f"offer-created:{offer.id}"` (not `unit.id` — a redispatched unit gets a new offer and should
notify again).

**Acceptance criteria:**
- Creating an offer via `_create_offer` produces exactly one `NotificationIntent` row with the
  documented context shape.
- Idempotency key prevents a duplicate notification if `_create_offer` is somehow called twice for
  the same offer (shouldn't happen, but the key should make it harmless if it does).
- `contracts/proposals/partner-offer-events.md` exists and documents the context shape above.

---

### BE-6: Near-real-time SSE stream for partner offer events

**Depends on BE-5.**

**Objective:** Give the partner app something better than polling to learn about a new offer.
There is no Channels/ASGI/WebSocket infrastructure in this codebase (verified: `config/asgi.py`
exists but is unused boilerplate, no `channels`/`daphne` dependency) — don't add one for this.
Build a Server-Sent-Events endpoint using a plain Django `StreamingHttpResponse` that polls
`NotificationIntent` server-side every 1–2 seconds for the authenticated partner and streams new
rows down a single open connection. This is genuinely push-like from the browser's perspective (one
connection, server decides when to send) without a new runtime dependency.

**Explicitly out of scope — do not attempt this in this task:** true OS-level push (notifications
that arrive while the app is closed or backgrounded). That needs a service worker, browser
push-permission flow, VAPID/FCM registration, and device-token storage — a separate infrastructure
initiative. This task only covers "the partner has the app open in a tab."

**Files:**
- Create: `backend/apps/notifications/streaming.py`
- Modify: `backend/apps/notifications/urls.py` (or wherever partner-scoped notification routes
  live — check `apps/assignments/urls.py` for the existing `/api/v1/partner/offers/` pattern and
  match its URL and auth style)
- Test: `backend/tests/notifications/test_offer_event_stream.py` (new)

**Interfaces:**
- Produces: `GET /api/v1/partner/offers/stream/` — an SSE endpoint. Each event is
  `event: offer_created\ndata: <the BE-5 context JSON>\n\n`. Publish this exact event name and
  format in `contracts/proposals/partner-offer-events.md` alongside BE-5's note — one document,
  both halves of the contract.

**Approach:** A `StreamingHttpResponse` with `content_type="text/event-stream"`, whose generator
loop polls `NotificationIntent.objects.filter(recipient=partner.user, purpose="partner.offer_created", channel="PUSH", created_at__gt=last_seen)`
every 1–2 seconds, yields any new rows as SSE frames, and sends a comment/keepalive line on empty
polls so the connection doesn't look dead to intermediate proxies. Cap the connection lifetime
(e.g. reconnect every few minutes) rather than holding it open forever — match whatever pattern
this codebase already uses for long-lived request handling, if any; if none exists, a documented
5-minute cap with client-side auto-reconnect (which `EventSource` does natively) is reasonable.

**Acceptance criteria:**
- A test that creates a `NotificationIntent` via the BE-5 path and asserts the stream endpoint
  yields a correctly-shaped SSE frame for it within the poll interval.
- A test confirming a partner only receives events addressed to them, not another partner's offers.
- The event format documented in `contracts/proposals/partner-offer-events.md` matches exactly what
  the endpoint emits — this is the thing FE-3 is trusting.

---

## Frontend tasks (Antigravity)

### FE-1: Route plan-set failures through the existing reason-code table

**Objective:** `checkout-workspace.tsx` shows a generic "These options are no longer current" for
*any* reason a plan set became unusable, even though a real, specific reason-code table already
exists and is already used correctly one screen over (the confirm step). Wire this screen to it too.

**Files:**
- Modify: `frontend/apps/customer/features/checkout/view/checkout-workspace.tsx:439-448`
- Read (do not modify): `frontend/apps/customer/features/checkout/reasons.ts` — the mapping table
  already exists (`ITEM_FAILURE_REASONS`, `describePlanReason`, `readReasonCodes`)
- Test: `frontend/apps/customer/features/checkout/view/checkout-workspace.test.tsx` (extend)

**Interfaces:**
- Consumes: `describePlanReason`, `readReasonCodes`, `ITEM_FAILURE_REASONS` — all already exported
  from `reasons.ts`. Nothing new to build here; this is a wiring task, not a new-copy task.

**Approach:** The block at `checkout-workspace.tsx:439-448` currently branches only on
`quote !== null && !isPlanSetUsable` and shows one hardcoded message. Read `planSet`'s actual shape
(`decisive_reasons`, `item_failures` — confirm exact field names against the generated
`Schemas["FulfilmentPlanSet"]` or whatever the actual type is called, don't assume) and route
through `readReasonCodes` + `describePlanReason`/`ITEM_FAILURE_REASONS` the same way the reason
table's own doc comment describes, falling back to the current generic copy only when the plan set
carries no reason at all (an honestly-empty case, not the common case).

**Acceptance criteria:**
- A plan set that failed with `no_eligible_capacity` shows "No professional is available for this
  job at the time you asked for." — not the generic message.
- A plan set that failed with an unmapped/future reason code falls back to the humanised version of
  the code (per `reasons.ts`'s own documented fallback behavior), not a blank or broken screen.
- A plan set with genuinely no reason attached still shows today's generic copy — this is the one
  case where the old message is correct.

---

### FE-2: Idempotency-reuse copy on the quote-creation step

**Objective:** `describeQuoteFailure` (used for the quote-creation mutation) has no branch for
`idempotency_key_reused`, so it falls through to a generic formatter that surfaces the raw backend
string ("This idempotency key was already used with a different request.") verbatim to the
customer. The confirm-step handler two functions below, `describeConfirmFailure`, already handles
this well. Copy the pattern.

**Files:**
- Modify: `frontend/apps/customer/features/checkout/reasons.ts:157-165` (`describeQuoteFailure`)
- Test: `frontend/apps/customer/features/checkout/reasons.test.ts` (extend)

**Interfaces:**
- Consumes: `isIdempotencyKeyReused` from `./conflicts` — already imported in this file for
  `describeConfirmFailure`'s use; reuse the same import.

**Approach:**

```ts
export function describeQuoteFailure(error: unknown): string {
  if (isPlanStale(error)) {
    return (
      "Those options were worked out before your booking changed, so we could not price " +
      "them. We have taken you back to pick a time again — nothing has been booked or charged."
    );
  }
  if (isIdempotencyKeyReused(error)) {
    return (
      "Your booking changed after this quote was started, so we did not reuse it. " +
      "Go back and start again — nothing has been booked or charged."
    );
  }
  return describeError(error, "mutation").message;
}
```

Adapt the exact copy to sit consistently alongside the existing `isPlanStale` and
`describeConfirmFailure` messages — read both before finalizing wording, don't invent a third tone.

**Acceptance criteria:**
- A quote-creation failure with `error.code === "idempotency_key_reused"` shows the new,
  human-readable copy — the raw backend string must never reach the DOM.
- Existing `isPlanStale` and fallback-path tests in `reasons.test.ts` still pass unchanged.

---

### FE-3: Live "new offer" toast in the partner app

**Depends on BE-5 for the contract (can start immediately once BE-5's proposal doc exists); depends
on BE-6 for live integration testing.**

**Objective:** Give the partner app an actual pop-up-style notification when a new offer arrives
while the app is open — the "Uber/Rapido" ask. This is explicitly scoped to **foreground, app-open**
delivery only; background/closed-app push is out of scope for this board (see BE-6's note).

**Files:**
- Create: `frontend/apps/partner/features/offers/live-events.ts` (SSE client wrapper)
- Modify: `frontend/apps/partner/features/offers/view/offer-inbox.tsx` (mount the toast)
- Test: `frontend/apps/partner/features/offers/live-events.test.ts` (new)

**Interfaces:**
- Consumes: the SSE contract documented in `contracts/proposals/partner-offer-events.md` (written
  by BE-5, finalized by BE-6) — `GET /api/v1/partner/offers/stream/`, event name `offer_created`,
  payload shape as documented there. **Read that file before writing this task's code; do not
  guess the shape.**
- Produces: on receiving an `offer_created` event, show a toast/banner (reuse whatever toast
  primitive already exists in `frontend/packages/ui` — check before adding a new one) and invalidate
  the `queryKeys.partner.offers()` query so the existing, already-well-built polling list
  (`usePartnerOffers`, `frontend/apps/partner/features/offers/queries.ts`) picks up the new row
  immediately rather than waiting for its next poll tick.

**Approach:** Use the browser's native `EventSource` — it auto-reconnects on drop, which matches
BE-6's capped-connection-lifetime design without any client-side reconnect logic needed. Do not
build a WebSocket client; the backend isn't offering one. Mount the `EventSource` connection at the
same level `usePartnerOffers` is used (likely the offer-inbox screen or a layout above it) so it's
live whenever a partner is on a screen where a new offer matters, and tear it down on unmount.

**Acceptance criteria:**
- With BE-6 live: accepting a fresh offer in a test environment causes a toast to appear within the
  SSE poll interval, without the customer having to refresh or wait for the next list poll.
- Losing the SSE connection (simulate a dropped `EventSource`) does not break the existing polling
  fallback — `usePartnerOffers` must keep working exactly as it does today if the live stream is
  unavailable. This is a genuine graceful-degradation requirement, not a nice-to-have: the polling
  implementation is well-built and battle-tested; the SSE layer is additive, not a replacement.
- No change to `usePartnerOffers`'s own polling/settlement logic — this task adds a second signal,
  it does not touch the first.

---

## Definition of done (per task)

1. Regression test written first, confirmed failing for the stated reason, then passing.
2. Full quality gate green: `backend\scripts\quality.cmd` (Claude tasks) or `pnpm verify`
   (Antigravity tasks).
3. One commit, conventional-commit message, referencing the task id (`BE-2`, `FE-1`, etc.) in the
   body so the history stays traceable back to this board.
4. If the task touched a contract (BE-5, BE-6, or any task that turned out to need a field change),
   confirm `contracts/openapi/v1.yaml` is regenerated and `pnpm contract:check` passes on the
   frontend side before calling it done.
5. Nothing pushed. A human reviews and merges.
