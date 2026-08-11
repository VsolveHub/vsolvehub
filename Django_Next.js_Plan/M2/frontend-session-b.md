# Session B — Partner and Operations applications

**Applications:** `frontend/apps/partner`, `frontend/apps/admin`
**Rules of engagement:** [frontend-execution-plan.md](frontend-execution-plan.md) — read §2, §3, §4 before touching a file.
**Task detail:** [03-frontend-tasks.md](03-frontend-tasks.md) · **Master board:** [task.md](task.md)
**Paired session:** [frontend-session-a.md](frontend-session-a.md) — Customer. Do not edit their files.

## Kickoff prompt for this session

> You are Session B on the M2 frontend — the **Partner application** (`frontend/apps/partner`) and
> the **Operations application** (`frontend/apps/admin`; its physical name is `admin`, its product
> label is Operations, and you must not create `apps/operations`). Read
> `Django_Next.js_Plan/M2/frontend-execution-plan.md` first: §2 (why nothing can reach `[x]` yet),
> §3 (the file-ownership map and the frozen list) and §4 (repo setup). Then read this file,
> `frontend-session-b.md`, and work it wave by wave.
>
> **Where you are.** Nothing in your column is built yet. Wave 0 left you two files:
> `apps/partner/features/workspace/registry.ts` and `workspace-switcher.tsx`. The registry is yours
> but **frozen in shape** — extend it only through its typed entries, never by adding lifecycle
> inference. Start at `M2-FE-101`.
>
> **The rule your whole column turns on.** The UI must never infer a lifecycle from a role,
> profession, skill or category name. Navigation comes from `{workspace_key, actions[]}` — the
> backend authorizes keys and actions; the frontend owns routes, labels and icons. An unknown
> workspace key renders **nothing**, not a generic Jobs fallback. And A1 stays backward compatible:
> M1 task-service Partners keep Home/Offers/Jobs untouched, and lifecycle records are never renamed
> to a generic "job" or "work item".
>
> **The hard constraint.** There is still no M2 backend endpoint — `M2-BE-013` is unstarted and
> `contracts/openapi/v1.yaml` publishes no M2 path, so Session C is running that now. Build against
> the types in `contracts/proposals/0012-m2-capability-and-requirement-surface.md`; its §A covers
> `GET /api/v1/partner/workspaces/`, which is your Wave B1 dependency. **No mock or placeholder data
> anywhere in application code** — with no backend a screen shows its real loading state, then its
> real error state; fixtures live in tests only. Mount no query whose endpoint is unpublished and no
> route that cannot work. Mark every task `[~] built`, never `[x]`. Anything the backend must expose
> that no proposal covers goes in execution plan §7 — do not build around a gap silently.
>
> **Boundaries.** Own `apps/partner/**`, `apps/admin/**`,
> `packages/query/src/m2-{enquiry,proposal,engagement-partner,ops}.ts`,
> `e2e/m2-{partner,ops}-*.e2e.ts`, this file, and your own task ID lines in `03-frontend-tasks.md`.
> Never touch `apps/customer` or anything on the frozen list — need a frozen file changed? Log it in
> execution plan §7 and keep building against the current shape. Do not add to `packages/ui`
> mid-wave; build it under `features/<area>/view/` and request promotion at a gate. From Wave 4 you
> own `apps/admin/features/m2-requests/**` and the `app/operations/**` route files; Session A owns
> `features/m2-cases/**` and hands you its route needs at Gate 4. Never `git add -A`.
>
> **Flow-weight budget, a hard constraint not a target:** a Partner reaches a real lead after phone,
> name, one service, one city. An A3 enquiry response is **one screen**. The A3 proposal composer is
> one screen on a small phone viewport — rate per worker per day, minimum days, what is included,
> nothing else.
>
> Every screen ships loading, empty, validation, pending, offline/retry, forbidden and server-error
> states — a screen without its exception states is not `[~] built`. Focused tests plus typecheck and
> lint during the wave; the browser suite runs once at the wave gate, not per task. Commit at the
> wave gate, not per task. Never push to `main`.

## Standing constraints

- **Owned paths only:** `apps/partner/**`, `apps/admin/**`,
  `packages/query/src/m2-{enquiry,proposal,engagement-partner,ops}.ts`,
  `e2e/m2-{partner,ops}-*.e2e.ts`, this file, and your own task ID lines in `03-frontend-tasks.md`.
- **Frozen:** `m2-keys.ts`, `freshness.ts`, `errors.ts`, `error-presentation.ts`, `packages/ui/**`,
  `packages/api-client/src/generated/**`. Need a change? Log it in the execution plan §7 and keep going.
  This includes `apps/partner/features/workspace/registry.ts` — it is your app, but Wave 0 wrote it;
  extend it only through its typed registry entries, never by adding lifecycle inference.
- **Barrel:** append exports only inside `// --- M2 partner + operations surface (session B) ---`.
- **No mock or placeholder data in application code.** Real loading state, then real error state.
- **The UI must never infer a lifecycle from a role, profession, skill or category name.** Navigation
  comes from `{workspace_key, actions[]}` through the typed registry. An unknown key renders nothing —
  not a generic Jobs fallback.
- **A1 stays backward compatible.** M1 task-service Partners keep Home/Offers/Jobs untouched.
- **Flow-weight budget:** a Partner reaches a real lead after phone, name, one service, one city. An
  A3 enquiry response is **one screen**.

---

## Wave B1 — Partner registration and capability-driven workspace

**Depends on:** Gate 0. **Blocks:** nothing in Session A.
**Gate:** a Partner reaches real demand in under a minute and, after approval, sees contextual
navigation and actions only for approved lifecycle capabilities.

### Progressive registration

- [~] `M2-FE-101` Short entry path: phone, name, business type, one service, one city — then straight
  into masked live requirement summaries. — `capability/adapters/{express-path,demand}.ts`,
  `capability/view/{express-progress,demand-list}.tsx`. Four steps, asserted rather than described.
- [~] `M2-FE-102` Gate KYC on first enquiry accept, payout details on first payout, crew roster on
  first crew assignment — each with an in-context explanation of why it is needed *now*. —
  `capability/adapters/gates.ts`, `capability/view/gate-notice.tsx`. The server's sentence verbatim,
  attached to the control rather than the page.
- [~] `M2-FE-103` Business-type selection (individual, workforce agency, project vendor) with
  plain-language consequences. — `capability/adapters/business-type.ts`,
  `capability/view/business-type-choice.tsx`.
- [~] `M2-FE-104` Skill, service and capability selection from backend-provided options, making clear
  that a skill does not itself activate a workspace. — `capability/adapters/capability-options.ts`,
  `capability/view/capability-picker.tsx`.
- [ ] `M2-FE-105` Guided business, service-area, capacity, skills, experience, availability and
  category-specific document steps — requested at the point they become necessary.
  **Not started.** The M1 `/apply` tree covers business, areas, availability and documents; the
  capacity, skills-per-capability and category-specific document steps are unbuilt, and none of the
  M2 views above are composed into a route yet.
- [~] `M2-FE-106` Worker insurance and liability declaration for workforce capabilities. —
  `capability/adapters/insurance.ts`, `capability/view/insurance-form.tsx`.
- [~] `M2-FE-107` Crew roster management: add, edit, archive, skills, documents, availability —
  entered at first assignment, not registration. — `crew/adapters/roster.ts`,
  `crew/view/{crew-roster,crew-member-form}.tsx`.
- [~] `M2-FE-108` Draft persistence, resumable upload, review summary, explicit declarations before
  submit. — resumption is `nextExpressStep`, which reads the server record and so survives a dropped
  connection or a second device without local progress. Review summary, declarations and resumable
  upload are the existing `application/` flow (`draft.ts`, `upload.ts`, `review-step`,
  `consent-step`), unchanged.
- [~] `M2-FE-109` Review, correction-required, approved, rejected, expired-document and suspended
  states, each with the exact next permitted action. — `capability/adapters/capability-status.ts`,
  `capability/view/capability-status-list.tsx`. Expiry is derived presentation, never a sixth status.

### Capability-driven workspace

- [~] `M2-FE-110` Contextual navigation rendered from authenticated workspace keys through the typed
  registry. Backend authorizes keys/actions; frontend owns routes, labels and icons. —
  `workspace/registry.ts` resolved in `session/partner-shell.tsx`. Grants arrive as a prop defaulting
  to none, so no unpublished query is mounted; see the wiring note below.
- [~] `M2-FE-111` Preserve M1 Home/Offers/Jobs for A1 while adding A3 Workforce and A5 Project
  workspaces only when authorized. Do not rename lifecycle records to a generic "job" or "work item".
- [~] `M2-FE-112` Workspace switcher for Partners with materially different capabilities; invitation,
  job, shift, project and money records stay in their native lifecycle views. Global Home aggregates
  only safe, clearly labelled summaries. — `workspace/workspace-switcher.tsx`,
  `workspace/model/home-summary.ts`, `workspace/view/workspace-summaries.tsx`.
- [~] `M2-FE-113` Capability suspension, expiry or an unknown key **mid-session**: disable invalid
  actions, refresh server state, fail closed with recovery guidance. No fallback to Jobs. —
  `workspace/model/session-guard.ts`, `workspace/view/capability-notice.tsx`.

### Verification

- [~] `M2-FE-114` Progressive-gate tests: browse before KYC, blocked accept without KYC, blocked payout
  without bank details, blocked assignment without crew, resume after failure, correction/resubmit,
  multiple capabilities, no capability, unauthorized deep links. — `gates.test.ts` (18),
  `progressive-gates.test.tsx` (14), `session-guard.test.ts` (22), `capability-status.test.ts` (14),
  `roster.test.ts`, `express-path.test.ts`, `business-type.test.ts`.
- [~] `M2-FE-115` Navigation verified for A1, A3 and A5; prove an unknown workspace key renders
  nothing rather than a generic Jobs fallback. — `registry.test.ts` (17).

**Evidence recorded 2026-08-11:**

- **Steps to first masked lead: four** — phone, name, one service, one city. Asserted against
  `MAX_STEPS_TO_DEMAND` in `express-path.test.ts`, so a fifth screen fails a test rather than passing
  a review.
- **Unknown key renders nothing** — `registry.test.ts` › "unknown workspace keys": an unrecognised key
  resolves to `[]`, contributes no tab, and no workspace resolves to `/jobs`. A known key alongside an
  unknown one still renders.
- **A1 regression check** — `resolveWorkspaces([])` is `[]` and `navigationFor(null)` is exactly
  `BASE_NAV` (`/dashboard`, `/jobs`, `/earnings`, `/profile`, named literally rather than counted).
  `WorkspaceSummaries` renders nothing for an A1 Partner, and the M1 offer inbox suite
  (`offers.test.tsx`, 31 tests) passes untouched.
- **Deep links** — `session-guard.test.ts` › "a deep link nobody navigated to": a destination the
  grant never authorized offers no command and does not eject the reader; a workspace held by someone
  else resolves to no active workspace and recovers to `/dashboard`; an unknown key is the only case
  that must leave the route.
- **Gates** — verified 2026-08-11 on the full frontend workspace: `vitest run` **1379 tests / 101
  files green**, `eslint . --max-warnings 0` clean, `turbo run typecheck` **9 of 9 packages** with
  `contract:check` reporting contract 1.21.0 up to date. The `apps/partner` typecheck failure recorded
  against `express-path.ts` in `task.md` (2026-08-11, Wave C0 row) is fixed and no longer reproduces.
- **Two pre-existing failures fixed to get a green gate**, neither M2's doing and both on `main`:
  `offers.test.tsx` rendered `OfferInbox` without a `ToastProvider`, so every one of its 26 rendering
  tests threw once `ca7b1c7` put `useToast` in the live-event hook; and
  `admin/features/session/operations-shell.test.tsx` asserts the workspace list exactly, and `ca9d9b7`
  added `/operations/partners` to the nav without updating it. The exact-list assertion did its job —
  it was updated, not loosened.
- **One defect found by the new tests**: `WorkspaceSummaries` composed its accessible name from a
  count and a noun in adjacent elements with no separator, which engines disagree about — announced as
  "3shifts today" wherever they decide no space belongs. The link now carries an explicit `aria-label`.

**Wiring still open (not a gap — sequencing).** `partner-shell.tsx` takes `workspaceGrants` as a prop
defaulting to empty, because `GET /partner/workspaces/` was unpublished when the shell was written.
Contract **1.21.0 now publishes it**, so mounting the read in `packages/query/src/workspace.ts` and
composing the registration views into routes is the first work of the next wave. Until then no A3/A5
route exists and the M2 views are unmounted — which is why FE-101..109 read `[~]` and not `[x]`.

---

## Wave B2 — Enquiries, clarification and proposals

**Depends on:** B1. **Gate:** an A3 vendor responds to a lead on one phone screen; an A5 vendor
submits a comparable proposal — with no unsupported contact or pricing shortcuts.

### Partner enquiries

- [ ] `M2-FE-301` Enquiry list: type, area, schedule, response deadline, fit summary — with private
  Customer data limited before acceptance.
- [ ] `M2-FE-302` Enquiry detail: structured requirement, attachment viewer, capacity check, clear
  accept/decline consequences including the capacity hold taken on acceptance.
- [ ] `M2-FE-303` Accept and decline with reason capture, stale-state handling, duplicate-click protection.
- [ ] `M2-FE-304` Countdowns as guidance only — backend status owns expiry and slot ownership.
  Business-hours deadlines presented truthfully.

### Safe clarification

- [ ] `M2-FE-305` **Structured clarification**: post a question, read the Customer's answer, both on
  the shared timeline. No chat thread, no participant list, no read receipts.
- [ ] `M2-FE-306` Callback request/scheduling and **paid** site-visit request, showing the fee and how
  it adjusts against the final price — without exposing personal numbers before server-authorized disclosure.
- [ ] `M2-FE-307` Consent and safety guidance before contact disclosure; record the server outcome and
  never reveal contact data from cached client state after revocation.

### Two proposal composers

- [ ] `M2-FE-308` **A3 one-screen composer**: rate per worker per day, minimum days, what is included.
  Nothing else.
- [ ] `M2-FE-309` A5 composer: deliverables, line items, stages, taxes, exclusions, assumptions, dates,
  warranty, validity.
- [ ] `M2-FE-310` Minimum-wage floor shown inline on the A3 composer; surface the server rejection
  clearly when a rate falls below it.
- [ ] `M2-FE-311` Required tax basis and commission-treatment statement on every proposal, so the
  vendor knows what the Customer will compare.
- [ ] `M2-FE-312` Server-calculated totals; final arithmetic is not editable in local state.
- [ ] `M2-FE-313` Draft, preview, submit, supersede — never overwrite a submitted proposal. Show
  withdrawn, expired, selected and superseded states with permitted next actions.

**Evidence to record:** the A3 composer rendered on a small phone viewport in one screen, the
append-only supersession trace, and a rejected below-floor rate.

---

## Wave B3 — Partner fulfilment (workforce and projects)

**Depends on:** B2. **Watch:** Session A builds the customer half of the same spine this wave. Read
[07-state-machines-and-permissions.md](07-state-machines-and-permissions.md) as the authority for
state names and permitted actions.

### Workforce workspace (A3)

- [ ] `M2-FE-501` Workforce engagement lists grouped by crew-needed, upcoming, in-progress, exception, completed.
- [ ] `M2-FE-502` **Per-stage** crew assignment with eligibility, conflict and worker-count feedback
  from the backend, supporting legitimate day-to-day rotation.
- [ ] `M2-FE-503` Replacement request/notification flows with Customer approval where required.
- [ ] `M2-FE-504` Arrival confirmation on the **non-OTP fallback path**, retry-safe, never claiming
  success until the backend acknowledges.
- [ ] `M2-FE-505` **Supervisor daily attendance**: "n of m present today" in one action. Do not build
  per-worker check-in/check-out.
- [ ] `M2-FE-506` Overtime request as a scope amendment: additional amount, approval state, and the
  plain statement that unapproved overtime is unpaid.
- [ ] `M2-FE-507` No-show, partial crew, late arrival, unsafe site and Customer-unavailable reporting
  with evidence and support escalation.
- [ ] `M2-FE-508` **Safety incident** report flow with severity, evidence and immediate escalation —
  separate from cancellation.

### Project workspace (A5)

- [ ] `M2-FE-601` Project lists grouped by funding-needed, active stage, Customer review, disputed,
  warranty, completed.
- [ ] `M2-FE-602` Immutable agreement deliverables, stages, funded amounts, dates, retention, payout state.
- [ ] `M2-FE-603` Stage evidence submission: upload progress, retry, declaration, history.
- [ ] `M2-FE-604` Scope amendment (change order) with scope, schedule and server-calculated money
  difference, using the shared amendment UI rather than a project-only one.
- [ ] `M2-FE-605` Customer-caused delay claim with evidence and a schedule-extension request.
- [ ] `M2-FE-606` Digital deliverable handover for Event and Media, with Customer acceptance.
- [ ] `M2-FE-607` Payout holds, retention and dispute actions — without promising an unverified release date.

**Evidence to record:** the attendance action count, that no per-worker device is required, and that
an amendment proposal cannot read as approved scope.

---

## Wave B4 — Operations: queues, timeline and privileged actions

**Depends on:** B3 and Gate 3. **Folder:** `frontend/apps/admin/features/m2-requests/**` plus the
`app/operations/**` route files — you own the routes; Session A composes
`features/m2-cases/**` into them at Gate 4.

- [ ] `M2-FE-701` Searchable queues: unmatched, under-quoted, SLA-breached, vendor-unconfirmed,
  fulfilment-exception, safety-incident, disputed, refund-pending, payout-held.
- [ ] `M2-FE-702` Unified request detail timeline spanning requirement, snapshots, matching, questions,
  proposals, unlock, engagement, stages, cases and money.
- [ ] `M2-FE-703` Actor, source, timestamp and reason for every privileged or commercial transition.
- [ ] `M2-FE-704` Permission-gated actions: clarification, rematch, **reclassification**, deadline
  extension, contact review, payout hold, escalation.
- [ ] `M2-FE-705` Assisted quote capture as a **primary A3 path** with a call script, visibly
  attributing the quote to the Partner and recording consent. Operations must not become the vendor.

---

## Wave B5 — Partner and Operations quality (runs alongside Wave 5)

- [ ] `M2-FE-802` (partner/ops share) WCAG 2.2 AA across registration forms, dialogs, uploaders,
  timelines, proposal composers, queue tables.
- [ ] `M2-FE-803` (partner/ops share) Small mobile, large mobile, tablet, desktop — and **no
  desktop-only Operations action where urgent mobile support is expected**.
- [ ] `M2-FE-804` (partner/ops share) Slow network, offline transition, timeout, duplicate click,
  refresh and back navigation for every state-changing flow.
- [ ] `M2-FE-807` (partner/ops journeys) Vendor rejection/replacement, proposal supersession,
  attendance dispute, Operations recovery.
- [ ] `M2-FE-808` (partner/ops share) Capability combinations, long content, empty and exception states.

Per the standing preference: no routine full-matrix Playwright runs. Focused specs plus typecheck and
lint during the waves; the browser suite runs once at the wave gate.

---

## Session B tracker

| Wave | Scope | Built `[~]` | Integrated `[x]` | Evidence |
|---|---|---|---|---|
| B1 | `FE-101..115` | `[~]` 14 of 15 | `[ ]` | 2026-08-11 — 1379/1379 frontend tests, lint clean, 9/9 typecheck at contract 1.21.0. `FE-105` not started; nothing mounted to a route, so nothing exceeds `[~]`. |
| B2 | `FE-301..313` | `[ ]` | `[ ]` | |
| B3 | `FE-501..508`, `FE-601..607` | `[ ]` | `[ ]` | |
| B4 | `FE-701..705` | `[ ]` | `[ ]` | |
| B5 | quality share | `[ ]` | `[ ]` | |

### Blocked / handed off

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| | | | |
