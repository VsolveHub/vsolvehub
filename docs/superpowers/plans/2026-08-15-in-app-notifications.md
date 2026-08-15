# In-app notifications implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Give every M2 actor an in-app notification feed, fed by the outbox events that currently
dead-letter, so no deadline in A3 or A5 depends on a customer or vendor happening to be staring at
the right screen.

**Architecture:** `IN_APP` becomes rung zero of the escalation ladder `M2-BE-807` already built.
An in-app notification is a `NotificationIntent` row with `channel="IN_APP"` and a nullable
`read_at`; the feed is a single indexed table read. Copy is rendered at read time from a template
registry, never stored, because the model deliberately stores template context rather than rendered
bodies. M2 domain events reach it through outbox consumers — the mechanism whose absence is the
root cause of the silence.

**Tech Stack:** Django 5.2 / DRF / drf-spectacular / Celery outbox; Next.js App Router, TanStack
Query, Tailwind v4, `@vsolve/ui`.

**Spec:** This plan's spec is the conversation decision of 2026-08-15 plus
`Django_Next.js_Plan/M2/02-backend-tasks.md` §`M2-BE-807` and
`Django_Next.js_Plan/M2/07-state-machines-and-permissions.md`.

## Global constraints

- **Agents never run tests.** Write them; run `backend\scripts\quality-static.cmd`, `pnpm lint`,
  `pnpm typecheck`, `pnpm build` only. Report "built — owner verification pending" (`AGENTS.md:97`).
- Never push M2 to `main`. Work stays on `feat/m2-workforce-projects`.
- Preserve unrelated uncommitted work — `backend/apps/requirements/handlers.py`, `matching.py` and
  `pyproject.toml` carry an in-progress module-package refactor. Append, never rewrite.
- Server computes all money in integer paise. No hidden fallback values, statuses or success states.
- Ruff (line length 100, double quotes, py313) + strict mypy over `apps common config`.
- Contract is generated, never hand-edited. Bump `SPECTACULAR_SETTINGS["VERSION"]` 1.33.0 → 1.34.0,
  regenerate `contracts/openapi/v1.yaml`, prepend a `CHANGELOG.md` entry with path/operation/
  component counts and "Removed: none".
- A frontend query key may exist only for an endpoint the contract publishes.
- `frontend/packages/query/src/m2-keys.ts`, `packages/api-client/src/errors.ts` and `generated/**`
  are frozen files — changed only in one deliberate integration commit.

---

## File structure

**Backend — new**
| File | Responsibility |
|---|---|
| `backend/apps/notifications/templates_registry.py` | `template_code` → title/body renderer. The only place copy lives. |
| `backend/apps/notifications/feed.py` | Feed domain: selector scoped to the recipient, unread count, mark-read/mark-all-read commands. |
| `backend/apps/notifications/migrations/0004_m2_notification_feed.py` | `IN_APP` channel value + `read_at` + constraint + index. |
| `backend/apps/requirements/notifications.py` | M2 event → (purpose, template, audience) routing table and recipient resolution. |
| `backend/tests/notifications/test_notification_feed.py` | Feed read/mark-read/scoping. |
| `backend/tests/notifications/test_in_app_channel.py` | Channel, constraint, render-at-read. |
| `backend/tests/requirements/test_notification_handlers.py` | Each wired event produces the right intent for the right recipient. |

**Backend — modified**
| File | Change |
|---|---|
| `apps/notifications/models.py` | `Channel.IN_APP`, `NotificationIntent.read_at`, constraint, index. |
| `apps/notifications/services.py` | `request_notification` records an immediate in-app delivery; `TRANSACTIONAL_PURPOSES` gains the M2 money purposes. |
| `apps/notifications/serializers.py` | Feed row + page + unread-count + mark-read serializers. |
| `apps/notifications/views.py` | Three new views. |
| `apps/notifications/urls.py` | Three new routes. |
| `apps/requirements/handlers.py` | Register one consumer per wired event (append only). |
| `config/settings/base.py` | `VERSION` → 1.34.0; `m2_notification_read` throttle rate. |
| `contracts/openapi/v1.yaml`, `contracts/openapi/CHANGELOG.md` | Regenerated + entry. |

**Frontend — new**
| File | Responsibility |
|---|---|
| `frontend/apps/customer/features/notifications/{queries.ts,model/feed.ts,view/notification-bell.tsx,view/notification-panel.tsx}` | Customer bell. |
| `frontend/apps/partner/features/notifications/{queries.ts,view/notification-bell.tsx,view/notification-panel.tsx}` | Partner bell. |
| plus colocated `*.test.ts(x)` | Written, not run. |

**Frontend — modified**: `customer/features/session/view/site-header.tsx` (bell in the
authenticated cluster), `partner/features/session/partner-shell.tsx` (bell beside Sign Out),
`packages/query/src/m2-keys.ts` (keys + freshness), `packages/api-client/src/generated/schema.d.ts`
(regenerated).

---

## Interfaces

Backend domain, consumed by views and by `apps.requirements`:

```python
# apps/notifications/templates_registry.py
class RenderedNotification(NamedTuple):
    title: str
    body: str

def render_notification(*, template_code: str, context: dict[str, Any]) -> RenderedNotification: ...
def assert_template_registered(template_code: str) -> None: ...   # raises UnknownTemplateError

# apps/notifications/feed.py
def notification_feed(recipient: User) -> QuerySet[NotificationIntent]: ...
def unread_count(recipient: User) -> int: ...
def mark_read(*, recipient: User, notification_id: UUID) -> NotificationIntent: ...
def mark_all_read(*, recipient: User) -> int: ...

# apps/requirements/notifications.py
def notify_for_outbox_event(event: OutboxEvent) -> list[NotificationIntent]: ...
```

REST surface (contract 1.34.0):

| Method | Path | operationId |
|---|---|---|
| GET | `/api/v1/notifications/` | `notification_feed_list` |
| GET | `/api/v1/notifications/unread-count/` | `notification_unread_count` |
| POST | `/api/v1/notifications/read/` | `notification_mark_read` |

`POST /read/` body: `{"notification_id": "<uuid>"}` or `{"all": true}`. Response: `{"unread": <int>}`.

---

## Task 1: The `IN_APP` channel and read state

**Files:** modify `apps/notifications/models.py`; create migration.

Add to `NotificationIntent.Channel`, above `PUSH` so the ladder reads in escalation order:

```python
        #: Rung zero. Costs nothing, reaches nobody who is not already looking — which is exactly
        #: why it is the base of the ladder and never the whole of it.
        IN_APP = "IN_APP", "In-app"
```

Add to `NotificationIntent`:

```python
    #: When the recipient opened it. Only an in-app notice can be read — an SMS has no such fact,
    #: and a nullable column that means nothing on four of five channels is a column that will be
    #: filled in wrongly, so the constraint below forbids it rather than trusting the caller.
    read_at = models.DateTimeField(null=True, blank=True)
```

Meta gains the feed index and the constraint:

```python
            models.Index(fields=("recipient", "channel", "read_at")),
...
            models.CheckConstraint(
                condition=models.Q(read_at__isnull=True) | models.Q(channel="IN_APP"),
                name="notifications_only_in_app_is_read",
            ),
```

- [ ] **Step 1:** Write `backend/tests/notifications/test_in_app_channel.py` asserting (a) an
  `IN_APP` intent accepts `read_at`, (b) a `PUSH` intent with `read_at` raises `IntegrityError`,
  (c) the feed index exists by querying without error.
- [ ] **Step 2:** Apply the model edits above.
- [ ] **Step 3:** `.\.venv\Scripts\python.exe manage.py makemigrations notifications --name m2_notification_feed`
- [ ] **Step 4:** `.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --noinput` → "No changes detected".

## Task 2: The template registry

**Files:** create `apps/notifications/templates_registry.py`; test
`backend/tests/notifications/test_in_app_channel.py` (same file, second class).

The model refuses to store rendered bodies. Rendering therefore happens on read, from a frozen
registry. An unregistered `template_code` raises at **write** time so the feed can always render.

```python
_TEMPLATES: dict[str, tuple[str, str]] = {
    "m2_crew_offer_accepted": (
        "A crew is holding your dates",
        "{partner_name} can send {headcount} for {days}. Pay the booking fee to confirm them.",
    ),
    ...
}
```

- [ ] **Step 1:** Test that every registered template renders with its documented context keys, and
  that `render_notification` on an unknown code raises `UnknownTemplateError`.
- [ ] **Step 2:** Implement `render_notification` / `assert_template_registered`. Missing context key
  raises rather than rendering `{headcount}` literally.
- [ ] **Step 3:** Call `assert_template_registered` from `request_notification` when
  `channel == IN_APP`.

## Task 3: The feed domain and REST surface

**Files:** create `apps/notifications/feed.py`; modify `serializers.py`, `views.py`, `urls.py`,
`config/settings/base.py`; test `backend/tests/notifications/test_notification_feed.py`.

Scoping rule, non-negotiable: the recipient comes from `request.user`, never from a parameter.

- [ ] **Step 1:** Write the feed tests — another user's notice is invisible; a non-`IN_APP` intent
  never appears; `mark_read` on somebody else's id is a 404, not a 403; `unread_count` matches.
- [ ] **Step 2:** Implement `feed.py`.
- [ ] **Step 3:** Serializers — `NotificationSerializer` (id, title, body rendered, purpose,
  `created_at`, `read_at`, `target`), `NotificationPageSerializer` (next/previous/results — the
  envelope must be declared or the published contract lies), `UnreadCountSerializer`,
  `MarkNotificationReadRequestSerializer`.
- [ ] **Step 4:** Views on `APIView` + `IsAuthenticated`, `NotificationCursorPagination(page_size=20,
  ordering=("-created_at", "id"))`, `reject_invalid_cursor_query` first, `@extend_schema` with
  `operation_id` and `ApiErrorSerializer` responses. `ThrottledWriteMixin` +
  `throttle_scope = "m2_notification_read"` on the write only (reads are exempt, which matters
  because the feed is polled).
- [ ] **Step 5:** Routes in `urls.py`, section-commented. Rate in `DEFAULT_THROTTLE_RATES`.

## Task 4: M2 events reach the feed

**Files:** create `apps/requirements/notifications.py`; append to `apps/requirements/handlers.py`;
test `backend/tests/requirements/test_notification_handlers.py`.

Wired in this pass — chosen because each one is a moment where money or a deadline moves and the
actor currently learns nothing:

| Event | Audience | Why it cannot stay silent |
|---|---|---|
| `m2.crew_offer.accepted` | Customer | The booking-fee hold is running. |
| `m2.booking_fee.charged` | Both | The crew is committed to a date. |
| `m2.crew.vendor_no_show` | Customer | Money came back and re-dispatch started. |
| `m2.rate_card.fell_back` | Customer | The instant product just became a quote wait. |
| `m2.visit_plan.charged` | Customer | Visits are now scheduled against their home. |
| `m2.proposal.selected` | Partner | Reconfirmation is on a clock. |
| `m2.proposal.rejected` | Partner | The slot is free again. |
| `m2.engagement.opened` | Both | The job is real. |
| `m2.stage.awaiting_review` | Customer | A review timeout auto-approves and releases money. |
| `m2.stage.disputed` | Partner | Their money stopped. |
| `m2.amendment.authorized` | Both | Scope and price changed. |
| `m2.cancellation.evaluated` | Counterparty | They must confirm or dispute. |
| `m2.requirement.closed` | Customer | The request ended. |

Deliberately **not** wired here, and reported as remaining gaps: the other 23 unconsumed events,
and the two moments that emit no event at all — A5 visit-slot confirmation (the 30-minute plan-
payment fuse) and A3 day-start. Both need a new emit, which is its own change.

- [ ] **Step 1:** Write `test_notification_handlers.py` — one test per wired event asserting
  recipient, purpose, template and that a re-driven event creates no second row.
- [ ] **Step 2:** Implement the routing table and recipient resolution in `notifications.py`.
  Idempotency key is derived from the outbox event's own key, so a re-drive is a no-op.
- [ ] **Step 3:** Append handlers to `handlers.py` in the established shape — validate the payload,
  raise `ValueError` naming the event, delegate. Each docstring states its idempotency mechanism.

## Task 5: Publish the contract

- [ ] **Step 1:** `VERSION` → `"1.34.0"` in `config/settings/base.py`.
- [ ] **Step 2:** `.\.venv\Scripts\python.exe manage.py spectacular --file ..\contracts\openapi\v1.yaml --validate`
- [ ] **Step 3:** Prepend the `## 1.34.0` CHANGELOG entry with counts and "Removed: none".
- [ ] **Step 4:** `.\scripts\quality-static.cmd` — all six gates.

## Task 6: Customer bell

**Files:** `frontend/apps/customer/features/notifications/**`; modify `site-header.tsx`,
`packages/query/src/m2-keys.ts`.

- [ ] `pnpm --filter @vsolve/api-client generate` first — no key before the contract.
- [ ] Keys + a `M2_FRESHNESS.notifications` tier (`VOLATILE_STATE` shaped). The **unread count** is
  the polled read; the list is fetched when the panel opens. `boundedPoll` needs an `isSettled`
  and a feed is never settled — so the count uses a plain `refetchInterval` with a comment
  defending why, in the register `polling.ts` uses.
- [ ] Bell inside the `isAuthenticated` cluster only; nothing while `isResolving`. Inline
  `aria-hidden` SVG (the customer app has no icon library), `h-11 w-11`, `sr-only` name carrying
  the count — never a bare coloured dot.
- [ ] Panel via `Sheet` from `@vsolve/ui`. There is no popover primitive and `dialog.tsx` argues
  against rolling one.
- [ ] Three render branches, never two: `Skeleton` + `aria-busy`; `ErrorState` from
  `describeError(err, "read")`; `EmptyState`. A failed read is never an empty list.
- [ ] Mark-read: `getStableIdempotencyKey`, `retry: false`, `setQueryData` from the response.

## Task 7: Partner bell

**Files:** `frontend/apps/partner/features/notifications/**`; modify `partner-shell.tsx`.

Same contract, same three branches. Differences that matter:
- Mount in the header's right-hand cell beside Sign Out. **Not** a seventh tab — `MAX_TAB_ITEMS`
  is 6 and already saturated.
- `lucide-react` is available here; use `Bell`.
- Do **not** open a second `EventSource`. Each stream holds a WSGI worker thread for up to five
  minutes; if live delivery is wanted later, add an event type to the existing offer stream.
- Panel `z-index` must clear the sticky header (30) and sit under the tab bar (40) and toasts (50),
  or use `Sheet`, which renders in the top layer and ends the question.

---

## Self-review

- **Spec coverage.** `M2-BE-807`'s missing rung (in-app) is Task 1–2; "no deadline depends on an
  unread in-app notice" is honoured by leaving the ladder intact and adding rung zero beneath it,
  not by replacing it. The dead-letter defect is Task 4. The two UIs are Tasks 6–7.
- **Placeholders.** None. Every task names exact files and the assertions its tests must make.
- **Type consistency.** `render_notification` returns `RenderedNotification` everywhere;
  `notify_for_outbox_event` is the single entry point `handlers.py` calls; the REST shapes in
  Interfaces match the serializers named in Task 3.
- **Known scope limit, stated rather than hidden:** 23 outbox events remain unconsumed after this
  plan and two critical moments emit no event at all. Both are reported, not silently left.
