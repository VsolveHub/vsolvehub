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

> **Revision 3 — visit-first A5 (2026-08-12, ADR-0008).** Two tasks join your column when their
> endpoints publish (Wave C2): `M2-FE-314` — the A5 enquiry response becomes a **one-screen
> visit-slot confirmation** (slot picker on the shared availability grid, same pattern as the A1
> checkout `slots-modal.tsx`) — and `M2-FE-315` — the A5 composer's **on-site mode** (prefilled from
> the requirement and the visit, completed-visit guard `m2_visit_not_completed` surfaced, phone-first
> ergonomics). Nothing you have built changes: the A5 composer itself, the enquiry inbox and
> clarification all stand. The remote A5 quote path is retired at the flow level, so once C2 lands,
> a proposal submit without a completed visit will be refused for A5 — the composer's mode, not its
> fields, is what changes. Task detail in `03-frontend-tasks.md` §"A5 visit response".
>
> **Both are built as of 2026-08-13 against contract 1.24.0 — see § Wave B2r3 below.** One thing in
> the paragraph above turned out otherwise: the remote A5 composer is not merely re-moded, it is
> **unmounted**. An A5 estimate must reference a completed visit, so the remote form would be one the
> server declines; `a5-composer.tsx` stays in the tree carrying a note that says so, and
> `onsite-composer.tsx` took its place on the route.

> **Revision 4 — rate-card A3 (2026-08-13, ADR-0009).** A3 becomes **rate-card-first**: dispatch
> goes to leads through the A1 offer cascade, and the primary-path A3 enquiry becomes a **crew
> offer** — one screen, always the lead's own number, accept/decline with a reason, no composer.
> One task joins your column when backend **C2R** publishes the contract: `M2-FE-316` (Wave B2R
> below). Nothing you have built changes: the A3 composer, the enquiry inbox and clarification all
> stand as the **thin-supply fallback** — the quote flow serves a requirement only after the
> cascade's configured threshold passes. Decline reasons gain a duty: crew-offer declines feed the
> rate card's **decline-rate alarm**. The A3 fulfilment tail gains the supervisor's evening "Day
> settled?" tap (`M2-FE-513`, with C4) and published add-on/overtime rates on extras.

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
  **Revision 4: fallback only** (built, kept) — on the primary path the platform publishes the rate
  and nothing is composed; the composer serves quote-flow enquiries.
- [~] `M2-FE-309` A5 composer: deliverables, line items, stages, taxes, exclusions, assumptions,
  dates, warranty, validity. — `proposal/view/a5-composer.tsx`. Stages carry the deliverables, the
  line items and the dates. **Assumptions has no wire field and was not built** — DRF drops unknown
  keys silently, so the control would discard input without an error (plan §7).
- [~] `M2-FE-310` Minimum-wage floor shown inline on the A3 composer; surface the server rejection
  clearly. — `proposal/model/terms.ts`, refusal routed to the rate field. **No floor is published,
  and the server-side guard is inert over HTTP** (plan §7). The rule is stated; no figure invented.
  **Revision 4: fallback only** (built, kept) — and the same floor binds the platform's own rate
  cards, checked server-side at publish.
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

## Wave B2r3 — the A5 visit response and the on-site estimate (`FE-314`, `FE-315`)

**Depends on:** contract **1.24.0** (Wave C2). **Gate:** an A5 vendor confirms a visit slot on one
screen and submits an estimate from the site, and neither is possible without the other.

- [~] `M2-FE-314` built — static gates green, owner manual verification pending.
- [~] `M2-FE-315` built — static gates green, owner manual verification pending.

**Tests deferred per the build-first amendment** (`task.md` §"Build-first amendment"). None written,
none run. The wave gate is the static gates plus the smoke script below.

### Task zero — `apps/partner` was red at head, and every error was a re-point

The client was regenerated at 1.24.0 in `b7c2465`, which left this column knowingly red. Six errors,
all in owned files, all fixed before anything new was built:

| File | What 1.24.0 changed | Fix |
|---|---|---|
| `enquiry/fixtures.ts` | `EnquiryDetail` requires `service_name`, `required_tax_basis`, `proposals`, `server_now`; `SiteVisit` requires six new fields; `Proposal` requires `rejection_reason`, `site_visit`, `revalidation_requested_at` | Fields added. A second fixture, `planVisit()`, was added beside `siteVisit()` — `is_plan_visit` decides how the whole record reads, and one fixture for both would hide the field that decides it. |
| `enquiry/queries.ts` | `reason_code` is `InvitationDeclineReasonEnum` | `DeclineInput.reasonCode` typed against the enum; `decline-dialog.tsx` **narrows** rather than casts, so a select value outside the published set is refused client-side instead of earning a 400. |
| `enquiry/model/decline-reasons.ts` | the vocabulary is published | Rewritten as `Record<DeclineReasonCode, …>` over the generated enum. The retired `crew_too_small` is **gone rather than mapped** — `NO_CAPACITY` is the server's name for the same fact. *(Revision 4: crew-offer declines — `decline_crew_offer` — carry a reason that feeds the rate card's decline-rate alarm; the vocabulary gains that duty when C2R publishes.)* |
| `proposal/model/proposal-state.ts` | `ACCEPTED` and `LAPSED` | Written as three separate stories: `REJECTED` is the *Customer's* refusal, `LAPSED` is this vendor declining or timing out after selection, `ACCEPTED` is them reconfirming. `permissionsFor` refuses supersession from all three. |
| `proposal/model/proposal-draft.ts` | `ProposalStage.amount_paise` is non-null | `toStageRequests` maps onto the generated type and **throws** on a null amount rather than coercing to zero — the one field whose absence would otherwise become a real stage quoted at no money. |

### `FE-314` — the visit response

`GET`/`POST /api/v1/partner/enquiries/{id}/visit-slots/`, on the A5 enquiry detail, replacing
Accept/Decline. There is no separate accept: `confirm_visit_slot` takes the quote slot, the soft
capacity hold and a hard reservation on the shared grid in one command.

**The five rules the screen is built on, and where each one lives:**

- **The browser never computes availability.** `model/slot-grid.ts` maps the payload and nothing
  else — no slot is filtered, re-derived or judged bookable. `capacity` is absent from this grid
  (unlike the A1 one) because on a single-vendor grid it would be a readout of that vendor's own
  diary depth.
- **`id` is a signed token and is treated as opaque.** Posted back unchanged, never parsed, never
  reconstructed into a time — the label comes from `starts_at`/`ends_at` beside it. Nothing is
  persisted: a selection restored from storage would be a token the server refuses, presented as a
  choice the vendor already made.
- **Tokens expire, so the picker re-reads.** `EXPIRING_STATE`, refetch on focus and reconnect, an
  explicit "Refresh times" that clears the selection with the grid, and
  `m2_visit_slot_unavailable` → drop the selection, refetch, pick again. **The same id is never
  resent**, and the mutation does not retry, because a retry would spend a round trip earning the
  same refusal.
- **An ineligible vendor gets a grid, not an error.** `gridShape` distinguishes four cases; when
  *every* slot reads `NO_CAPACITY` the grid renders with "your service, your area or your calendar
  does not cover this work — nothing is wrong with your account". A 403 in its place would tell a
  vendor their account is broken. `closed` (mixed past / too soon / outside hours) is a different
  sentence over the same grid, and `empty` is the one case with nothing to draw.
- **`opens_plan_checkout` is held, not confirmed.** `describeConfirmation` returns two different
  outcomes: the first vendor's slot is *held* while the Customer pays, reads `REQUESTED`, and
  **lapses harmlessly if they never pay** — with "do not travel yet" said in those words. Showing it
  as confirmed would promise a vendor a job nobody has bought.

Decline is on the same screen, from the published vocabulary. `visit-day-panel.tsx` carries arrival,
completion and the customer no-show report — completion is what stamps `estimate_due_at`, so without
it `FE-315`'s guard would have no way to be satisfied and the estimate would be unreachable.

### `FE-315` — the on-site estimate

Its own route, `/projects/enquiries/[invitationId]/estimate`, because it is opened at a different
moment and in a different place: standing at the customer's address after the visit, not at a desk
deciding whether to travel. Sharing a scroll with the requirement summary, the clarification thread
and the disclosure notice would put four screens of reading above the first field.

- **Working days are the schedule.** The vendor types days; the screen derives the end date and
  **states the arithmetic** — every day counted from the start, weekends included. A working-week
  rule would need a holiday calendar this client does not have and the server does not publish for
  `ends_on`, and a silently skipped Sunday is a date the vendor did not agree to. `ends_on` is
  optional on the wire, so leaving days blank sends no date.
- **Material lines are their own rows**, entered and totalled separately from labour.
- **`site_visit_id` is sent**, which is the field that made this path submittable at all.
- **The guard is explained, never a dead button.** The submit stays enabled even when this screen
  believes the visit is open, because that belief can be a minute old — the vendor may have closed
  the visit in another tab. The state is explained above the form with the one action that fixes it,
  and the server's `m2_visit_not_completed` routes to the same explanation.
- **Phone-first:** `inputMode="numeric"` for days, `"decimal"` for rupees, 44–48px targets, and
  save-on-blur to `localStorage` scoped per invitation, cleared on a successful submit. A stored
  draft is **narrowed before it is trusted** — it survives a deploy, so it can have been written by
  an older bundle.
- **Prefill, not placeholder.** Every prefilled value is a field the server sent: `duration_days`,
  `requested_start`, and `required_tax_basis` *only when non-blank* — a blank basis means this
  vendor sets it for everyone, which is a decision rather than a default.

### Four §7 rows closed by reading one field each

- **`GET /proposals/?requirement=`** — mounted as `useMyProposals` on `m2QueryKeys.proposals.mine`,
  the key the frozen factory has held since Wave 0. A Partner reads their own quote back after a
  reload, on a second device, in a new session; withdraw and the supersession trace are wired to it,
  and `proposal-status.tsx` renders the replaced revisions beneath the live row. This was §7's
  "largest hole in Wave B2".
- **`required_tax_basis`** — the composer names the basis a second vendor is compared on, and says
  plainly when a blank one means this vendor fixes it.
- **`server_now`** — `unwrap` feeds it into `serverClock` at millisecond precision, so the
  `responds_by` countdown is calibrated by the act of reading the enquiry. `enquiry-deadline.tsx`
  reads nothing new on purpose: threading it through props would give that component a second,
  staler clock than the one the app shares.
- **`service_name`** — the detail titles itself from the catalogue's own name. The **inbox list
  still de-slugs `category_slug`**, because 1.24.0 put the field on `EnquiryDetail` and not on
  `EnquirySummary`. Logged.

### Routes

| Route | What renders |
|---|---|
| `/projects/enquiries/[invitationId]` | Visit-slot confirmation, the visit-day panel, the quote record and the way into the estimate — replacing accept/decline for A5 |
| `/projects/enquiries/[invitationId]/estimate` | **New.** The on-site composer, `ƒ` and `robots: noindex`, behind `WorkspaceRoute` with `actions: ["enquiry.view"]` |
| `/workforce/enquiries/[invitationId]` | Unchanged — A3 keeps accept, decline and the one-screen composer. **Revision 4:** on the primary path this inbox's A3 rows become **crew offers** — one screen, always the lead's own number ("You receive ₹X/day for N helpers; the customer pays you directly at day end"), accept/decline with reason only, no composer (`M2-FE-316`, Wave B2R, blocked on C2R); the composer remains for fallback quote-flow enquiries |

### Smoke script — the exact clicks

**Confirm a visit slot.** Sign in as a Partner approved for `A5_CUSTOM_PROJECT` → `/projects` →
**Enquiries** → open a project enquiry in `INVITED`. Expect: the service's real name in the heading,
the requirement summary, then **Confirm a visit slot** with a day row and a time grid. Check the
grid says which timezone it is in and how long the visit takes. Tap a time → the button reads
*Confirm 9:00 am – 9:45 am* → tap it → the dialog states the commitment (travel there, estimate
there, no estimate pays nothing) → **Confirm the visit**. Expect one of two panels: *Your time is
held* with "do not travel yet" (you are the first vendor and the customer is paying now), or *Visit
confirmed*. Leave the screen open five minutes, tap **Refresh times**, and confirm the selection
clears. To see the stale-token path, confirm the same slot from a second browser first — expect
*That time has gone* and a refreshed grid, never a retry of the same time. To see the ineligible
grid, open an enquiry outside your service area — expect a full grid with every slot struck through
and "no slot on this request is open to you", not an error page.

**Submit an on-site estimate.** On that enquiry, after the slot is `SCHEDULED`: **I am on site** →
**Close the visit** → confirm. Expect the *Estimate due in* readout to appear. Tap **Write the
estimate** → `/projects/enquiries/{id}/estimate`. Expect the start date prefilled from the
customer's own answer and the first part's working days prefilled from `duration_days`. Fill Part 1
(name, days, price), **Add another part**, **Add a material** (description, cost), set the tax
basis, tap **Send the estimate**. Expect Django's own total echoed on the confirmation. To see the
guard: open `/estimate` *before* closing the visit — expect the amber "Close the visit before you
send this" block with a link back, and an enabled submit that earns the same explanation from the
server. To see the autosave: type into two fields, blur, reload the page — the values are still
there.

### Static gates — 2026-08-13

- `npx eslint apps/partner apps/admin packages/query --max-warnings 0` — **clean**.
- `turbo run typecheck --filter=partner --filter=admin --filter=@vsolve/query` — **3 of 3**.
- `turbo run build --filter=partner` — **succeeds**; all M2 routes `ƒ`, including the new
  `/projects/enquiries/[invitationId]/estimate`.
- **No test was run and none was written** — build-first amendment.

One gate note worth keeping: `pnpm lint` across the whole workspace is red on two unused imports in
`apps/customer` (`quotes-screen.tsx`, `review-screen.tsx`), which is Session A's live column. Not
touched, and not in this column's scope to fix.

---

## Wave B2R — the A3 crew offer (revision 4)

**Depends on:** backend **C2R** publishing the crew-offer contract — nothing exists to build against
until it does. **Gate:** an A3 lead reads the offer, their own number and the consequence on one
phone screen, and accepting is accepting the published rate for that job.

- [ ] `M2-FE-316` The crew offer screen: always the lead's own number — "You receive ₹X/day for N
  helpers; the customer pays you directly at day end" — with accept or decline and a published
  decline reason (declines feed the rate card's decline-rate alarm). Accept takes a roster-sized
  capacity hold (`m2_roster_insufficient` when the roster is short) and **holds the win while the
  Customer pays the booking fee** — held is not confirmed, "do not travel yet", exactly the
  `opens_plan_checkout` discipline `FE-314` already renders. Minutes-level timeouts on the M1
  dispatch clock, not business-hours deadlines. No composer on this path; the one-screen composer
  stays for fallback quote-flow enquiries.

**Not started.** The A3 composer, teasers and unlock stay built as the thin-supply fallback; nothing
in Wave B2 is deleted or reworked.

---

## Wave B3 — Partner fulfilment (workforce and projects)

**Depends on:** B2. **Watch:** Session A builds the customer half of the same spine this wave. Read
[07-state-machines-and-permissions.md](07-state-machines-and-permissions.md) as the authority for
state names and permitted actions.

**Built 2026-08-13 against contract 1.25.0 — the shared spine half only.** Both archetypes run on
one `Engagement` + `EngagementStage`, so the spine was built **once**; the archetype-specific tails
are Wave III and were deliberately not started, each rendering a named not-built-yet block where it
would sit. Tests deferred per the build-first amendment.

### Workforce workspace (A3)

- [~] `M2-FE-501` built — static gates green, owner manual verification pending.
- [ ] `M2-FE-502` **Wave III, needs C4.** Per-stage crew assignment with eligibility, conflict and
  worker-count feedback. Not started; `NotBuiltYet` block on the booking screen.
- [ ] `M2-FE-503` **Wave III, needs C4.** Replacement request/notification with Customer approval.
- [ ] `M2-FE-504` **Wave III, needs C4.** Arrival confirmation on the non-OTP fallback path.
- [ ] `M2-FE-505` **Wave III, needs C4.** Supervisor daily attendance, "n of m present today".
- [ ] `M2-FE-506` **Wave III, needs C4.** Overtime as a scope amendment. Revision 4: at the card's
  **published overtime rate**, and only after Customer one-tap approval.
- [ ] `M2-FE-507` **Wave III, needs C4.** No-show, partial crew, unsafe site reporting.
- [ ] `M2-FE-508` **Wave III, needs C4.** Safety incident report, separate from cancellation.
- [ ] `M2-FE-513` **Revision 4 — Wave III, needs C4.** The supervisor's evening "Day settled?"
  one-tap with the UPI QR/deep-link at the exact published amount — the wage money is P2P at day
  end and never platform-held; settlement is per worker-day present, beside the `FE-505` attendance
  count.

### Project workspace (A5)

- [~] `M2-FE-601` built — static gates green, owner manual verification pending.
- [~] `M2-FE-602` built — static gates green, owner manual verification pending.
- [~] `M2-FE-603` built — static gates green, owner manual verification pending.
- [~] `M2-FE-604` built — static gates green, owner manual verification pending.
- [ ] `M2-FE-605` **Wave III, needs C5.** Customer-caused delay claim. `NotBuiltYet` block.
- [ ] `M2-FE-606` **Wave III, needs C5.** Digital deliverable handover. `NotBuiltYet` block.
- [~] `M2-FE-607` built — static gates green, owner manual verification pending.

### Task zero — the barrel collided, and the fix was to delete rather than rename

Session A grew `packages/query/src/m2-engagement-customer.ts` in the same wave, and by the time this
column reached the barrel it exported seventeen names this module had also written: the type aliases
(`StageEvidence`, `EngagementAmendment`, `EngagementEvent`, `AmendmentLine`, `StageDisputeReason`,
`EngagementPage`, …), `orderedStages`, `disputedStages`, `isAmendmentApplied`, and the five shared
refusal predicates including `isStageTransitionNotAllowed`.

Renaming this column's copies would have compiled and been wrong. Two `isStageTransitionNotAllowed`
implementations are two places for one rule to drift, and the failure mode is the quiet one — the two
agree until somebody edits one. **They were deleted instead**, and `m2-engagement-partner.ts` now
imports the shared vocabulary from `@vsolve/query` by name and keeps only what is uniquely the
vendor's: what a vendor may *do*, what they are *owed*, and what a composer must refuse to compose.
Its own type aliases are private, so the collision cannot come back.

### The three rules the screens turn on

- **A correction is not an amendment, and the screen says so in those words.** A sent-back stage
  renders the customer's note in a warning block that states, immediately under it, that the price,
  the scope and this stage's own amount are unchanged and no money has moved. `describeStageStatus`
  gives `CORRECTION_REQUESTED` a label ("Sent back") that is not a dispute word, and
  `projectBucketFor` files it under **Your move**, never under **Disputed**. Getting this wrong is
  how a vendor concludes they have been paid less than they agreed.
- **A dispute stops only the allocation.** `DISPUTED` on an engagement renders "one stage is being
  argued about; everything else carries on, and anything already paid out stays paid" — and the
  per-stage payout rows are the proof, because a disputed stage's siblings keep their own states.
  `vendorStageCommands` deliberately still offers **attach evidence** on a disputed stage: a dispute
  process where only one side may file is not one, and the server agrees
  (`_assert_evidence_may_be_added` includes `DISPUTED`).
- **A null `*_due_at` is a policy state.** `reviewClock` has four answers and each is a different
  sentence; `stagePayoutState` distinguishes `held_until_date` from `held_no_date`. Where no payout
  hold is configured the screen says **"no release date is set"** and explains that our team moves it
  — never a date, never a countdown, never a guessed default.

### `M2-FE-501` / `M2-FE-601` — one list, two vocabularies

One `EngagementList` mounted twice. What the mount supplies is the bucket set, the noun and which
`commercial_mode` belongs in this workspace — three server-derived values.

**The split is on `commercial_mode`, not `archetype`.** `Engagement.archetype` is an unconstrained
string with no published vocabulary; `commercial_mode` is a published enum and is the field the
server itself branches on. Two server values being compared, not a lifecycle inferred from a category
or a profession.

**Two honest states this list has and the enquiry inbox does not.** A bucket nothing can fill —
crew-needed — keeps its heading and states why, carried in the data as
`EngagementBucket.derivable: false` rather than special-cased in the view. And an engagement whose
status this build cannot name is rendered under "Not recognised" rather than dropped: a filter
silently removing a live commitment is the exact failure `VISITS_BOOKED` produced on the Customer's
`My requests` list on 13 August, and this list was written knowing it.

### `M2-FE-602` — the immutable agreement

"Agreed then / changed since / owed now" are read straight from `total_paise`,
`amendment_delta_paise` and `staged_total_paise`. The relationship between them is a **database
constraint**, so the client renders all three and adds nothing — a second implementation of arithmetic
the server has already checked can only ever disagree with it. `total_paise` never moves, which is
what lets a vendor tell whether a change order landed.

Three things the task asks for and nothing publishes: **deliverable text** (on the proposal, not
copied to the engagement; `terms_snapshot` is not serialised), **retention** (no field anywhere, and
the percentage is owner-blocked) and **warranty terms** (proposal only). All three are stated as
absences — "no retention is recorded on this agreement" — rather than filled with a zero that would
read as a decision. Logged.

### `M2-FE-603` — evidence

Presign → PUT → finalize, one mutation rather than three, on the KYC uploader's precedent: an upload
presigned and never finalized is an orphan Django has to clean up. `XMLHttpRequest` for the transfer,
because no shipping browser reports progress for a `fetch` request body and an 80 MB video on a
site's mobile connection is exactly where a progress bar decides whether somebody waits or re-taps.

- **`NOTE` is not an upload kind.** It is in `StageEvidenceKindEnum` and not in the server's
  media-type table, so presigning one is refused. The note reaches the record as the **required**
  `note` on `submit/`, stored as its own append-only `NOTE` row — which is why the declaration sits
  above the submit button and not beside the file picker. The vendor never picks a kind at all: it is
  derived from the file's own media type, which is what the server checks anyway.
- **`object_key` is never published**, so there is no preview and no thumbnail. A row shows kind,
  size, media type and scan status. Rendering a preview from the local blob would show the vendor
  their own file rather than the stored object, which is the one thing a verification screen must not
  do. The missing download endpoint is logged.
- **`processing_status` is a state, not a spinner.** `PENDING` means the checksum matched and the
  safety question has not been answered; the badge says "being checked" and anything unrecognised
  falls there, closed.
- **Three failure recoveries, because they are three different problems.** Storage down is retryable
  and nothing was lost; an expired grant needs a fresh one, which choosing the file again does; a
  rejection is not retryable with the same bytes, because Django fetched the stored object back and
  compared it.

### `M2-FE-604` — one composer, two pricing rules, and it says which

- **A3 (`LEAD_ONLY`) collects days and no money.** There is no amount field — not a disabled one, and
  not one whose value is discarded — because a vendor who could name the money could re-price a job
  the customer already committed to. The screen says the server prices it at the rate frozen when the
  booking was confirmed.
- **A5 (`MANAGED_PAYMENT_REQUIRED`) prices each line**, signed, negative removing scope. The running
  figure is labelled as *the vendor's own arithmetic*; no total is sent, and the server sums the lines
  itself.

**A reduction that would empty a stage is refused before it is sent.** `validateAmendmentDraft`
mirrors `_assert_reduction_is_possible` and will not compose one: removing a stage entirely is a
cancellation, vendor abandonment is `M2-BE-545` in Wave C5 and does not exist, and submitting it to
find out would teach a vendor that a cancellation is a change request that happened to fail.

**A proposal cannot read as approved scope.** Every live change request carries the sentence "not
agreed scope — nothing changes until the customer decides", and `CUSTOMER_APPROVED` is badged
"Accepted, not applied" rather than "Approved", because on a positive delta the money has not moved
and the scope has not changed until the provider callback lands. The vendor accepts nothing here: the
decision routes are the Customer's.

### `M2-FE-607` — money, without a promise

The panel is written around one sentence: **a vendor with no bank details has still earned the
money.** Approving a stage writes a `PENDING` ledger entry; release needs the hold window to close
*and* the payout account to be verified, and those two failures are said separately because they have
different fixes and only one of them is the vendor's. `GET /partner/payout-account/` is read beside
it, and its `404` is treated as an answer rather than a fault — the copy never implies the earning is
at risk, because it is not.

`LEAD_ONLY` gets its own panel saying Vsolve holds and releases none of it. Earned / held / released
are the engagement's own running totals, differenced once, and labelled as such.

### Two defects found in this column's own wiring, and fixed

- **The stage cache key needed an id the stage routes do not carry.** `m2QueryKeys.engagements.stage()`
  takes `(engagementId, stageId)`; `GET /engagement-stages/{id}/` carries only the stage. The first
  cut passed `""` for the engagement, which produced a key under `detail("")` that no invalidation
  could ever reach. `usePartnerStage` was **deleted** rather than patched — the engagement read
  already embeds its ordered `stages[]` and nothing here opens a bare stage id, so a second read of
  the same rows would only have been a second copy able to disagree with the first.
- **The amendment idempotency key was an attempt counter, and that is a trap.**
  `execute_idempotent` rejects a key reused with *different arguments*, so a vendor whose first
  proposal is refused, who edits a line and sends again, would have earned a fingerprint conflict
  instead of a fresh proposal. The key is now derived from the draft's own content: an identical
  resend replays, an edited one is a new command, and the second-proposal case the counter was
  guarding is already refused server-side by the one-live-amendment rule.

### Routes

| Route | What renders |
|---|---|
| `/workforce/shifts` | **Replaced.** The workforce engagement list — five buckets, crew-needed rendered as unfillable |
| `/workforce/shifts/[engagementId]` | **New.** One booking: shift-days, evidence, agreement, change requests, money, and the C4 tails as named not-built-yet blocks |
| `/projects/stages` | **Replaced.** The project engagement list — six buckets |
| `/projects/stages/[engagementId]` | **New.** One project: the same spine in the project vocabulary, with the C5 tails named |

All four `ƒ` in the build output and `robots: noindex`, behind `WorkspaceRoute` with the actions the
registry already gates those tabs on — `attendance.confirm` for Shifts, `stage.submit_evidence` for
Stages. **No new action was invented**, because inventing one would be this client authorising itself.

### Both Wave I frozen-file grants are consumed

`features/visit/queries.ts` now keys the slot grid on `m2QueryKeys.visits.slots(invitationId)` — the
local `invitations.detail(id) + "visit-slots"` composition is gone — moved to
`M2_FRESHNESS.visitSlots`, the tier written for a read that hands back a credential, and routes all
four visit commands through `invalidateForM2Command`. Where a call site still invalidates explicitly
it now invalidates *more* than the command's rows, and says why: confirming a slot takes a capacity
hold, which changes which other enquiries this vendor can accept. `errors.ts`'s new classifications
are consumed by `amendment-panel.tsx`, where `m2_policy_unavailable` renders as an owner-blocked
refusal with no retry offered.

### Smoke script — the exact clicks

**Read a project and start a stage.** Sign in as a Partner approved for `A5_CUSTOM_PROJECT` →
`/projects` → **Stages**. Expect six group headings, populated ones only, with the money and the
stage count on each row. Open one → expect the stage list first, then **What you agreed to** with
*Agreed then / Changed since / Owed now*, then **Ask to change the work**, then **Your money**, then
the history. On an unfunded stage expect the sentence *"The customer has not paid for this stage yet.
Do not start it."* and **no** start button. On a funded one, tap **Start this stage**.

**Attach evidence and send it.** On the started stage: **Attach a file** → choose a photo → watch the
bar move through *Checking the file · Asking Vsolve for a slot · Uploading · Confirming it arrived* →
the row lands with a **Being checked** badge, not a thumbnail. Try an 80 MB PDF: expect refusal in the
picker with the real ceiling in the message, before any bytes move. Write **What was done**, tap
**Send for review**. Expect the badge to become *With the customer*. Leave the note blank first —
expect the field error, not a request.

**See a correction read as a correction.** Have the Customer send the stage back. Expect an amber
block titled *What the customer asked for*, with their note, and immediately under it *"This is a
correction, not a change to what you agreed."* Expect the button to read **Back to work on this**,
the amount beside the stage to be unchanged, and the project to sit under **Your move** — not under
**Disputed**.

**Compose a change order and hit the two refusals.** **Propose a change** → fill the reason → add a
line with a positive amount → expect *"Your lines come to +₹X … this is a preview of your own
arithmetic."* Send it. In an unseeded environment expect **"Vsolve cannot take change requests yet"**
— that is `m2_policy_unavailable` and it is correct, not a bug. Then the client-side refusal: pick a
stage, enter a negative amount **equal to or larger than that stage's own amount**, and expect
*"Removing a stage entirely is a cancellation, not a change request"* under the amount field, with
nothing sent.

**Read the money without a promise.** Have the Customer approve a stage. On **Your money** expect
*Earned / Still held / Released*, and against that stage either *"Earned and held until ⟨date⟩"* or —
with no hold window configured, which is the current state — *"Earned. No release date is set for
this."* With no bank account on file, expect the block saying the earnings are recorded and are yours
and cannot be paid out yet. **Never a date where none is configured.**

**Run the workforce side.** Sign in as a Partner approved for `A3_TIME_BLOCK` → `/workforce` →
**Shifts**. Expect the same spine in shift-day words, **Crew still to be named** rendered as a dashed
card explaining that crew assignment is not published, and under the shift-days three not-built-yet
blocks naming attendance, arrival and safety reporting. Open a booking → **Your money** should say
the customer pays you directly and Vsolve holds none of it.

### Static gates — 2026-08-13

- `npx eslint apps/partner apps/admin packages/query --max-warnings 0` — **clean**.
- `turbo run typecheck --filter=partner --filter=admin --filter=@vsolve/query` — **3 of 3**.
- `turbo run build --filter=partner` — **succeeds**; all four engagement routes `ƒ`.
- **No test was run and none was written** — build-first amendment.

### What Wave III must pick up

`M2-FE-502..508` on Wave C4 — joined by `M2-FE-513` (revision 4: the supervisor's Day-settled tap) —
and `M2-FE-605`/`606` on Wave C5. Each has a `NotBuiltYet` block on the screen where it belongs,
naming the capability, saying what to do meanwhile and citing its task id. Replacing one is
replacing a block, not restructuring a screen.

---

## Wave B-C3.5 — the 1.26.0 consumption pass (2026-08-14)

**Depends on:** the orchestrator's regeneration of the typed client, now at **1.28.0**.
**Gate:** nothing in this column is still working around something the contract publishes, and
every workaround removed took its on-screen explanation with it.

Not a new wave of screens. Five things were published between 1.23.0 and 1.28.0 that this column
was still compensating for, and each fix is a re-point plus a deletion — the deletion is the part
that matters, because a caveat left beside a fixed field is how a screen starts lying slowly.

### `service_name` on the enquiry inbox (`M2-FE-301`)

The detail screen was fixed at 1.24.0 and the list row was not, because the field was on
`EnquiryDetail` only. It is on `EnquirySummary` at 1.26.0, declared **non-null** on both — checked
in the generated type before consuming it, so there was no nullable case to design for. A blank name
is still said (`Service not named`) rather than rendered as an empty heading, which costs one
ternary and cannot happen on a published service.

`category_slug` is **no longer projected onto `EnquiryRow` at all.** Deleting the de-slugging line
would have left the slug sitting there for the next screen to format; deleting the field makes it
impossible. The `capitalize` class went too — it was there to rescue a slug, and it mangles a real
name ("Interior fit-out project" → "Interior Fit-Out Project").

### Material lines are their own rows (`M2-FE-315`)

The §7 row this closes recorded *why* the old shape was wrong commercially: a stage is a unit of
evidence, approval and release, so a bag of cement arrived as a fundable milestone somebody had to
approve **as work** — against the plan's own rule that material money is spent rather than earned.

1.26.0 publishes `ProposalMaterialLine` (`{title, quantity, unit, amount_paise}`) on
`ProposalCreateRequest.material_lines`, and `EngagementStage.kind` (`WORK` | `MATERIAL_ADVANCE`)
carries the distinction through to the engagement. So:

- `toOnsiteRequest` sends work in `stages` and materials in `material_lines`. The
  `deliverable: "Materials supplied for this job"` string — the one place this client wrote a fixed
  word into a row so a customer could tell cement from labour — is gone, because the row type now
  says it.
- The composer collects **quantity and units** beside the cost. They are not decoration:
  "cement, ₹1,20,000" against "cement, 40 bags at ₹3,000" is the difference between two quotes a
  Customer can compare and two they cannot. Both are optional to the vendor and default exactly as
  the serializer does — `quantity` to 1, `unit` to blank — rather than to a word ("each") nobody
  typed. `unit` is capped at the wire's 32 characters client-side, because a refusal earned on a
  finished estimate costs more than a keystroke.
- The on-screen caveat that existed only to explain the workaround is **deleted**, and what replaces
  it is a true sentence rather than a shorter version of the same warning: materials are paid as an
  advance rather than signed off like a piece of work.
- `proposal-status.tsx` renders materials as their own block under the stage breakdown, with
  quantity and unit shown only where they say something — a line of one with no unit is noise beside
  the name the vendor wrote.
- On the engagement side a `MATERIAL_ADVANCE` stage is badged and explained on the vendor's stage
  panel. It is **not** given its own list: one spine, one set of commands, and a second money
  surface invented here would be exactly the duplication the plan forbids.

**One live migration hazard, handled.** A vendor who half-wrote an estimate before this deploy has
`{description, amountPaise}` material rows in `localStorage`, and the composer now reads
`unit.trim()`. `loadOnsiteDraft` fills the two new keys with the serializer's own defaults rather
than dropping the draft — throwing away twenty minutes of a vendor's typing to avoid a crash is the
wrong half of that trade.

The composer's existing discipline is untouched: it still sends `site_visit_id`, still refuses to be
a dead button on a stale visit read, and still routes `m2_visit_not_completed` to the same
explanation.

### Three more workarounds the sweep found

- **The enquiry inbox pages** (`M2-FE-301`). `cursor` has been published since **1.23.0** and this
  column was still rendering "Vsolve is holding older enquiries that this screen cannot ask for" —
  an honest notice over a truncated inbox. `usePartnerEnquiries` is an `useInfiniteQuery` on the
  admin partner-directory precedent, `cursorFromNextUrl` reads the opaque cursor out of the server's
  own `next` link, and **Load older enquiries** replaces the notice. Called inside `queryFn` as well
  as in `getNextPageParam`, deliberately: a `next` link this client cannot follow fails the read
  rather than presenting a partial inbox as a complete one. Not an infinite scroll — a vendor on a
  metered connection decides when another request happens. `useApplyEnquiryResult` maps every page
  rather than hunting for the one holding the row.
- **Clarification runs both ways** (`M2-FE-305`). 1.26.0 gave the Customer a question route and
  published `RequirementQuestion.asked_by_role`, so every row on this timeline was titled "You
  asked" over questions the vendor had not asked. Rows are titled from the field; all three
  published roles are named and an unknown one degrades to a neutral title. A `CUSTOMER` row carries
  an answer composer on `POST /partner/questions/{id}/answer/` — without it a customer's question is
  a dead row, and the loop Session A built the other half of does not close. An `OPERATIONS` row
  offers no control, because the route refuses the side that asked and Vsolve's question is not the
  customer's.
- **A visit has a clock time again** (`M2-FE-314`, `M2-FE-306`). `SiteVisit.timezone` (1.26.0) is
  the *service area's* zone, which is the clock a travelling vendor is on. The visit panel read "in
  two days"; it now reads the day and time, names the zone, and degrades to the device's clock
  **saying so** where the runtime does not carry the IANA name — reusing the slot grid's own
  `supportsTimeZone` probe rather than a second one. The relative phrase is kept beside the absolute
  one, because it is what answers "is this today".

### What was checked and deliberately not changed

- **`VisitNoShowRequest.reason_code`** was already re-pointed to `VisitNoShowReasonEnum` at the
  regeneration commit; `NOBODY_ON_SITE` remains the only member this control can honestly send.
- **`ServiceCard.starting_price` is nullable at 1.27.0** and `request_archetypes` is new. Neither is
  read by this app: `features/catalog/queries.ts` projects variants for the capability picker and
  touches no money field, so the M2 services that 1.27.0 made visible add requests and nothing else.
- **The A3 one-screen composer stays**, per ADR-0009: it is the thin-supply fallback, not dead code.

### Smoke script — the exact clicks

**See the real service name, and page the inbox.** Sign in as a Partner approved for
`A3_TIME_BLOCK` → `/workforce` → **Enquiries**. Expect each row's heading to be the catalogue's own
name ("Construction helpers"), in the catalogue's own casing — **not** "construction helpers" or
"Construction Helpers", which is what the de-slugged slug looked like. With more than twenty
enquiries on the account, expect a **Load older enquiries** card at the bottom instead of the old
"this screen cannot ask for" notice; tap it and expect the older rows to append below, the button to
disappear on the last page, and no duplicate rows. On an account with none in this workspace, expect
the empty state *with* that button under it if other-archetype enquiries exist beyond page one.

**Answer a question the customer asked.** Have the Customer ask a question against your quote
(`POST /requirements/{id}/quotes/{proposal_id}/questions/` — the A5 route needs a paid visit plan,
the A3 one an unlock). Open the enquiry → **Questions**. Expect the row titled **The customer
asked**, not "You asked", and an answer box under it. Send an answer → expect the row to become
*You answered ⟨time⟩* with your text, and the box to disappear. Your own questions still read **You
asked** with "waiting for the customer" under them.

**Write an estimate with materials.** `/projects` → **Enquiries** → an enquiry whose visit you have
closed → **Write the estimate**. Fill Part 1 (name, days, price) → **Add a material** → expect four
fields: what it is, **how many**, **units**, and cost of the whole line. Enter "2.5mm copper cable /
90 / metres / 12000". Add a second part, set the tax basis, **Send the estimate**. Expect Django's
own total echoed, and on the quote record expect a **Materials (paid as an advance)** block listing
"2.5mm copper cable · 90 metres · ₹12,000" *below* the parts — not mixed in with them, and not
carrying a "Materials supplied for this job" line. Leave a material row named with no cost and
expect *"Put a price on every material, or remove the row."* before anything is sent. Type 40
characters into **Units** and expect the length refusal client-side.

**Prove the old draft still opens.** With a half-written estimate saved (type into two fields, blur,
do not send), reload — the values are still there, the material rows have empty quantity and unit
boxes rather than a crash, and the form is the one you left.

**See a material advance on the engagement.** On a project whose accepted estimate carried
materials: `/projects/stages/{engagementId}` → expect the materials row **after** every work stage,
badged **Materials advance**, with the sentence saying it is the materials money and is kept
separate from the work you are paid for. Work stages carry no such badge.

**See a visit's actual time.** On an A5 enquiry with a `SCHEDULED` plan visit, expect **When** to
read e.g. *"Tue 18 Aug, 10:00 am (in 2 days)"* with a line underneath naming the timezone as the
site's. Never a bare relative phrase.

### Static gates — 2026-08-14

- `npx eslint apps/partner apps/admin packages/query --max-warnings 0` — **clean**.
- `npx turbo run typecheck --filter=partner --filter=admin --filter=@vsolve/query` — **3 of 3**.
- `npx turbo run build --filter=partner` — **succeeds**; all M2 routes `ƒ`.
- **No test was run and none was written** — build-first amendment. One assertion in
  `enquiry-list.test.tsx` is now stale by design and is recorded in plan §7 beside the three suites
  already logged on 13 August.

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
| B2r3 | `FE-314..315` | `[~]` 2 of 2 | `[ ]` | 2026-08-13 — the A5 visit response and the on-site estimate, against contract 1.24.0. `apps/partner` was red at head from the regeneration and is green. Lint clean on owned paths, typecheck 3/3, partner build green with the new `/estimate` route dynamic. **Tests deferred per the build-first amendment.** 12 §7 rows appended, 6 of them closures. |
| B2 | `FE-301..313` | `[~]` 13 of 13 | `[ ]` | 2026-08-12 — built and wired against contract 1.21.0 on 4 routes. Lint clean, 9/9 typecheck, partner build green, all 4 routes dynamic. **12 unit/component test files and 1 Playwright spec written and not run** — see the owner verification queue in `task.md`. 23 gaps logged in plan §7, of which 3 are backend defects (declared list shape vs. the page envelope Django sends, the inert wage-floor guard, the unreconciled A3 total) and 1 is structural (a Partner cannot read their own quote back). **Revision 4 (ADR-0009): the A3 composer half is the thin-supply fallback — kept as built.** |
| B2R | `FE-316` (revision 4: crew offer screen) | `[ ]` | `[ ]` | Not started — blocked on backend C2R publishing the crew-offer contract. The A3 composer stays as the fallback response. |
| B3 | `FE-501..508`, `FE-601..607` (+ `FE-513`, revision 4 — Day-settled tap, with C4) | `[~]` 6 of 15 | `[ ]` | 2026-08-13 — the **shared spine half only**, against contract 1.25.0: `FE-501`, `FE-601`, `FE-602`, `FE-603`, `FE-604`, `FE-607` on 4 routes (2 replaced, 2 new), all `ƒ`. The nine archetype tails are Wave III and each renders a named not-built-yet block rather than a half-built control. Lint clean on owned paths, typecheck 3/3, partner build green. **Tests deferred per the build-first amendment.** 13 §7 rows appended, of which 1 closes both Wave I frozen-file grants and 2 are schema corrections (an undeclared `role` parameter, two enums published as bare strings). Two defects found in this column's own wiring and fixed before the gate. |
| B-C3.5 | 1.26.0 consumption pass — `FE-301`, `FE-305`, `FE-314`, `FE-315` | `[~]` 4 of 4 | `[ ]` | 2026-08-14 — five workarounds removed against contract 1.28.0: `service_name` on the inbox row (and `category_slug` unprojected), `ProposalMaterialLine` as first-class rows with the stage-shaped workaround and its on-screen caveat deleted, `EngagementStage.kind` badged on the vendor's stage panel, two-way clarification with the Partner's answer route, cursor paging on the inbox, and `SiteVisit.timezone` on the visit panel. Lint clean on owned paths, typecheck 3/3, partner build green. **Tests deferred per the build-first amendment**; one stale assertion recorded. 6 §7 rows appended — 5 closures and 1 frozen-file request (`M2_INVALIDATION.answer_question` targets a key this app does not mount). |
| B4 | `FE-701..705` | `[ ]` | `[ ]` | |
| B5 | quality share | `[ ]` | `[ ]` | |

### Blocked / handed off

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| | | | |
