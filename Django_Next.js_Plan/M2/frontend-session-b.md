# Session B — Partner and Operations applications

**Applications:** `frontend/apps/partner`, `frontend/apps/admin`
**Rules of engagement:** [frontend-execution-plan.md](frontend-execution-plan.md) — read §2, §3, §4 before touching a file.
**Task detail:** [03-frontend-tasks.md](03-frontend-tasks.md) · **Master board:** [task.md](task.md)
**Paired session:** [frontend-session-a.md](frontend-session-a.md) — Customer. Do not edit their files.

## Kickoff prompt for this session

> You are Session B on the M2 frontend — the **Partner application** (`frontend/apps/partner`) and
> the **Operations application** (`frontend/apps/admin`; its physical name is `admin`, its product
> label is Operations, and you must not create `apps/operations`). Read
> `Django_Next.js_Plan/M2/frontend-execution-plan.md` first: §2 (what is and is not published, and
> what that caps), §3 (the file-ownership map and the frozen list) and §4 (repo setup). Then read
> `task.md` §"Verification convention" — you do not run tests. Then read this file,
> `frontend-session-b.md`, and work it wave by wave.
>
> **Where you are — updated 2026-08-12.** Wave B1 is **14 of 15 built and wired**, which makes yours
> the only M2 column with a live endpoint behind it. `features/{capability,crew,workspace}/` holds
> the four-step express path to masked demand, the three progressive gates, business type, the
> capability picker, the insurance declaration, the crew roster, six review states, and the
> capability-driven shell — registry, switcher and mid-session guard — wired into `partner-shell.tsx`.
> That shell reads `GET /api/v1/partner/workspaces/` at contract 1.21.0 through
> `features/workspace/queries.ts`, and all **7 registry destinations are mounted** as `force-dynamic`,
> `robots: noindex` routes. `/workforce` and `/projects` render real grant-driven homes; the other
> five render an honest not-built-yet state. The registry is yours but **frozen in shape** — extend it
> only through its typed entries, never by adding lifecycle inference.
>
> Three decisions in `queries.ts` are load-bearing and Session A has been told to copy them, so do not
> quietly change them: an unread grant list is `null` and never `[]` (collapsing them fails *open* — a
> dropped connection would read as a suspension nobody applied); a 401/403 is not resent; and
> freshness is `SESSION_STATE`, so an Operations suspension lands on window focus rather than at next
> login.
>
> **Still open in B1:** `FE-105`, and the `capability/` and `crew/` views are route-less — necessarily,
> since every endpoint they need is proposal 0013 and unpublished.
>
> **Start Wave B2 (`FE-301..313`). It is not blocked.**
>
> **The rule your whole column turns on.** The UI must never infer a lifecycle from a role,
> profession, skill or category name. Navigation comes from `{workspace_key, actions[]}` — the
> backend authorizes keys and actions; the frontend owns routes, labels and icons. An unknown
> workspace key renders **nothing**, not a generic Jobs fallback. And A1 stays backward compatible:
> M1 task-service Partners keep Home/Offers/Jobs untouched, and lifecycle records are never renamed
> to a generic "job" or "work item".
>
> **The hard constraint — half of it lifted.** Contract **1.21.0** publishes what Wave B2 needs:
> enquiry list and detail, `accept`, `decline` with reason, the Partner `ask` for structured
> clarification, `request_site_visit`, and proposal `submit`, read and `withdraw`. Integrate against
> the generated client, not against proposal 0012's types, for those.
>
> Two holes to design around rather than discover:
> **`schedule_site_visit` and `complete_site_visit` have no route** — C0 published the request only,
> so a paid site visit can be asked for and never scheduled or closed; build the request path and
> leave the rest behind an honest state. And **nothing in proposal 0013 is published** — business
> profile, capability options and request, capability review state, insurance, crew CRUD, gate status
> and demand preview are all Wave C1, so `capability/` and `crew/` stay route-less.
>
> One caveat on everything that *is* published: **Wave C0 shipped with no tests.** No object-level
> authorization test exists for any of the 17 paths. They compile and generate; none is proven against
> a real request. Treat integration findings as likely, not surprising, and log them in execution
> plan §7 rather than working around them in the client.
>
> **No mock or placeholder data anywhere in application code** — where an endpoint does not exist a
> screen shows its real loading state, then its real error state; fixtures live in tests only. Mount
> no query whose endpoint is unpublished and no route that cannot work. Mark every task `[~] built`,
> never `[x]`. Anything the backend must expose that no proposal covers goes in execution plan §7 —
> do not build around a gap silently.
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
> states — a screen without its exception states is not `[~] built`.
>
> **Do not run tests. Any tests. Ever.** Not `vitest`, not a single file, not Playwright. You still
> **write** them to the same standard — an unwritten test is a gap and you record it as one — but the
> owner runs every one. Your gates are `pnpm lint --max-warnings 0`, `pnpm --filter partner typecheck`
> (and `--filter admin` from Wave 4) and, at a wave gate, `pnpm build --filter=partner`. Report
> `[~] built — owner verification pending` and end each report with the test files you wrote and the
> exact command to run them. Never write "N/N pass" for a run that did not happen. See
> [task.md](task.md) §"Verification convention". Commit at the wave gate, not per task. Never push
> to `main`.

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
  `workspace/registry.ts` resolved in `session/partner-shell.tsx`, reading **`GET
  /api/v1/partner/workspaces/` for real** through `workspace/queries.ts` (contract 1.21.0). Asked for
  only once the session holds the Partner role, so `/apply` does not spend a guaranteed 403. All
  seven registry destinations are mounted as routes — see the routing note below.
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

### Wiring and routes — 2026-08-12

The prop is gone. `partner-shell.tsx` reads `GET /api/v1/partner/workspaces/` through
`features/workspace/queries.ts`, and all seven registry destinations are mounted:

| Route | What renders | Why |
|---|---|---|
| `/workforce`, `/projects` | `WorkspaceHome` — label, description, the payment sentence for the mode Django sent, and the destinations this grant authorizes | Real, grant-driven. No counts: nothing publishes them, and a `0` that means "unread" is worse than no number |
| `/workforce/crew` | `WorkspacePending` | Proposal 0013's crew endpoints are unpublished. `CrewRoster` is built and tested but takes `onAdd`/`onArchive` with nothing to call — an "Add someone" button that silently does nothing is worse than saying the screen is not built |
| `/workforce/shifts`, `/projects/stages` | `WorkspacePending` | No endpoint (`FE-501..508`, `FE-601..607`) |
| `/workforce/enquiries`, `/projects/enquiries` | `WorkspacePending` | The **endpoint is published**; the screen is `FE-301..304` next wave. The client is behind the server here, and the copy says so rather than claiming the feature is switched off |

**Why the pending routes exist at all.** Django grants `enquiry.view` and `attendance.confirm` today,
so the registry renders those tabs today. Without a route the tab 404s inside a Partner's own
workspace, which reads as the app being broken. `WorkspacePending` holds no data, promises no date,
and does not claim nothing is waiting — an enquiry may well be. Each wave replaces a route file;
nothing has to be removed from the registry.

**Decisions worth keeping:**

- **An unread grant list is `null`, never `[]`.** They render the same tab bar and mean opposite
  things: `[]` is Django saying "approved for nothing" (the ordinary state of a Partner who
  registered this morning), `null` is no answer at all, which `session-guard.ts` turns into
  `UNVERIFIED` and refuses every command against. Collapsing them would fail *open* — a dropped
  connection would read as a suspension nobody applied.
- **A refused read does not retry.** 401/403 means the session does not hold the Partner role;
  asking twice walks into the same refusal and delays the honest screen.
- **`SESSION_STATE` freshness**, so an Operations suspension lands on the next window focus rather
  than at the next login. That is the mechanism `M2-FE-113` was written against, now real.
- **Route files stayed server components.** `export const dynamic` and `metadata` are ignored in a
  `"use client"` module, and the first cut of these pages was prerendered as static, indexable HTML.
  They are `force-dynamic` + `robots: noindex` like the rest of the authenticated tree, verified in
  the build output (`ƒ` on all seven).
- **`boundary.test.ts` caught the wiring**, as designed: `/api/v1/partner/workspaces/` was on its
  unpublished-paths list, and the entry was retired under the file's own rule now that the generated
  client carries the operation.

**Verified 2026-08-12:** `vitest run` **1399 tests / 103 files green** (partner: 314, up from 294),
`eslint . --max-warnings 0` clean, `turbo run typecheck` 9 of 9, and `turbo run build --filter=partner`
succeeds with all seven routes dynamic.

**Still not `[x]`:** `FE-105` is unstarted, the registration views (`capability/`, `crew/`) are still
composed into no route, and four of the seven destinations render their pending state rather than
their feature. Those are Waves B2 and B3.

---

## Wave B2 — Enquiries, clarification and proposals

**Depends on:** B1. **Gate:** an A3 vendor responds to a lead on one phone screen; an A5 vendor
submits a comparable proposal — with no unsupported contact or pricing shortcuts.

### Partner enquiries

- [~] `M2-FE-301` Enquiry list: type, area, schedule, response deadline, fit summary — with private
  Customer data limited before acceptance. — `enquiry/view/{enquiry-list,enquiry-card}.tsx`, reading
  `GET /api/v1/partner/enquiries/` through `enquiry/queries.ts`. Four buckets, seven states.
  **Area and fit summary are not published** and nothing stands in for them (plan §7).
- [~] `M2-FE-302` Enquiry detail: structured requirement, attachment viewer, capacity check, clear
  accept/decline consequences including the capacity hold taken on acceptance. —
  `enquiry/view/{enquiry-detail,requirement-summary}.tsx`, `model/requirement-facts.ts`. The hold is
  stated from the snapshot's own dates. **No attachments and no capacity read exist** (plan §7).
- [~] `M2-FE-303` Accept and decline with reason capture, stale-state handling, duplicate-click
  protection. — `enquiry/view/{respond-actions,decline-dialog}.tsx`,
  `model/decline-reasons.ts`. Three layers of duplicate protection; the KYC gate routes to
  verification rather than to a locked-out screen.
- [~] `M2-FE-304` Countdowns as guidance only — backend status owns expiry and slot ownership.
  Business-hours deadlines presented truthfully. — `enquiry/view/enquiry-deadline.tsx`,
  `model/enquiry-state.ts › deadlineStateFor`. A passed deadline stops offering an accept and never
  announces an expiry. "No deadline" is a first-class state.

### Safe clarification

- [~] `M2-FE-305` **Structured clarification**: post a question, read the Customer's answer, both on
  the shared timeline. No chat thread, no participant list, no read receipts. —
  `enquiry/view/clarification-panel.tsx`. One question, one answer, on a `Timeline`.
- [~] `M2-FE-306` Callback request/scheduling and **paid** site-visit request, showing the fee and how
  it adjusts against the final price. — `enquiry/view/site-visit-panel.tsx`. The visit request is
  built; **scheduling has no route and no callback endpoint exists at all**, both stated on screen
  rather than faked (plan §7).
- [~] `M2-FE-307` Consent and safety guidance before contact disclosure; never reveal contact data
  from cached client state after revocation. — `enquiry/view/disclosure-notice.tsx`, guidance on the
  question composer, and `enquiry/contact-boundary.test.ts` asserting the negative directly. **No
  disclosure surface exists**, so there is no consent to record and no cached contact to revoke.

### Two proposal composers

- [~] `M2-FE-308` **A3 one-screen composer**: rate per worker per day, minimum days, what is included.
  Nothing else. — `proposal/view/a3-composer.tsx`. Five controls, fixed by `A3_COMPOSER_FIELDS` and
  asserted in `a3-composer.test.tsx`. Headcount is prefilled from the customer's own answer.
- [~] `M2-FE-309` A5 composer: deliverables, line items, stages, taxes, exclusions, assumptions,
  dates, warranty, validity. — `proposal/view/a5-composer.tsx`. Stages carry the deliverables, the
  line items and the dates. **Assumptions has no wire field and was not built** — DRF drops unknown
  keys silently, so the control would discard input without an error (plan §7).
- [~] `M2-FE-310` Minimum-wage floor shown inline on the A3 composer; surface the server rejection
  clearly. — `proposal/model/terms.ts`, refusal routed to the rate field. **No floor is published,
  and the server-side guard is inert over HTTP** (plan §7). The rule is stated; no figure invented.
- [~] `M2-FE-311` Required tax basis and commission-treatment statement on every proposal. —
  `proposal/view/proposal-terms.tsx`. **Neither is readable**: the required basis is another vendor's
  and unpublished, and `commission_treatment` is a 24-character field with no vocabulary and no M2
  policy. The field is left unsent rather than authored (plan §7).
- [~] `M2-FE-312` Server-calculated totals; final arithmetic is not editable in local state. —
  `proposal/view/proposal-total.tsx`. No total input in either composer; after submission the figure
  shown is Django's echoed `total_paise`. **The server does not reconcile an A3 total** (plan §7).
- [~] `M2-FE-313` Draft, preview, submit, supersede — never overwrite a submitted proposal. —
  `proposal/view/proposal-status.tsx`, `model/proposal-state.ts`. **No read finds a Partner's own
  quote**, so the record survives only the tab that submitted it; `resolveProposalView` renders that
  as an honest third state instead of persisting an id locally (plan §7).

**Evidence recorded 2026-08-12 — owner verification pending:**

- **The A3 composer is five controls**, fixed by `A3_COMPOSER_FIELDS` in
  `proposal/model/proposal-draft.ts` and asserted against the rendered DOM in
  `a3-composer.test.tsx` › "renders no more inputs than the budget allows". A sixth field fails a
  test rather than passing a review. Three are the budget's own — rate, minimum days, inclusions —
  and two are forced by the wire: `_assert_a3_shape` requires `worker_count`, and
  `ProposalCreateSerializer` requires `tax_basis`. Headcount is prefilled from the customer's
  `worker_count` answer, which turns it from a question into a confirmation.
  `m2-partner-enquiry.e2e.ts` measures the composer on a 360x640 viewport.
- **The supersession trace is append-only and the client does not simulate it.** A revision is
  another `POST /proposals/`; the idempotency key is scoped to the invitation *and* the revision it
  replaces, so a retry replays and a deliberate revision does not. `submit_proposal` marks the
  previous row `SUPERSEDED` and the response carries the new `revision`, which is what the screen
  renders.
- **A below-floor rate is surfaced under the rate field**, not as a banner — `errors.ts` routes
  `m2_proposal_below_wage_floor` to `fix_input`. Covered in `a3-composer.test.tsx` and the e2e spec.
  **It cannot currently be produced by a real request**: `PartnerProposalCollectionView` passes
  neither `wage_floor_skill` nor `wage_floor_state_code`, so `assert_rate_meets_wage_floor` never
  runs. Logged in plan §7 as a backend defect.
- **Routes:** `/workforce/enquiries`, `/workforce/enquiries/[invitationId]`, `/projects/enquiries`,
  `/projects/enquiries/[invitationId]` — all four `ƒ` in the build output, `robots: noindex`, behind
  `WorkspaceRoute` with `actions: ["enquiry.view"]`.
- **Static gates:** `pnpm lint --max-warnings 0` clean, `turbo run typecheck` 9 of 9 with
  `contract:check` reporting contract 1.21.0 up to date, `pnpm build --filter=partner` succeeds.
  **No test was run** — see `task.md` §"Verification convention".

**Two decisions worth keeping:**

- **The queries live in `apps/partner/features/*/queries.ts`, not in
  `packages/query/src/m2-{enquiry,proposal}.ts`.** The ownership map reserved those two module names
  for this column, and they turned out to be the wrong home: a hook in `packages/query` cannot reach
  the app's `getApiClient()`, which is per-app and carries the Partner's own `onUnauthorized`
  behaviour. Wave B1 hit the same wall and put `usePartnerWorkspaceGrants` in
  `features/workspace/queries.ts`; this follows that precedent rather than inventing a second one.
  The two reserved filenames stay unused and free for the integrator to delete or repurpose.
- **The enquiry list filters by archetype in the client.** One endpoint returns both lifecycles and
  takes no filter, and the two workspaces are separate places with separate composers. The filter
  compares `EnquirySummary.archetype` against the workspace key from the grant — two server values,
  not an inference from a category or profession — and an archetype this build has no workspace for
  is dropped, exactly as an unknown workspace key renders nothing.

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
| B1 | `FE-101..115` | `[~]` 14 of 15 | `[ ]` | 2026-08-12 — 1399/1399 frontend tests, lint clean, 9/9 typecheck, partner build green. `GET /partner/workspaces/` wired and all 7 registry routes mounted. `FE-105` not started; the registration views are still route-less, so nothing exceeds `[~]`. |
| B2 | `FE-301..313` | `[~]` 13 of 13 | `[ ]` | 2026-08-12 — built and wired against contract 1.21.0 on 4 routes. Lint clean, 9/9 typecheck, partner build green, all 4 routes dynamic. **12 unit/component test files and 1 Playwright spec written and not run** — see the owner verification queue in `task.md`. 23 gaps logged in plan §7, of which 3 are backend defects (declared list shape vs. the page envelope Django sends, the inert wage-floor guard, the unreconciled A3 total) and 1 is structural (a Partner cannot read their own quote back). |
| B3 | `FE-501..508`, `FE-601..607` | `[ ]` | `[ ]` | |
| B4 | `FE-701..705` | `[ ]` | `[ ]` | |
| B5 | quality share | `[ ]` | `[ ]` | |

### Blocked / handed off

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| | | | |
