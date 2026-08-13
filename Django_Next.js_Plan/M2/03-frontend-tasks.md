# M2 Frontend Tasks

**Owner:** Claude
**Applications:** Customer, Partner and existing `admin` application labelled Operations
**Architecture:** Next.js App Router, generated API clients and TanStack Query
**Master status:** [task.md](task.md)
**Execution:** [frontend-execution-plan.md](frontend-execution-plan.md) — ownership map, frozen
modules and sync gates. Session columns: [A — Customer](frontend-session-a.md) and
[B — Partner + Operations](frontend-session-b.md). The backend column runs concurrently as
[backend-session.md](backend-session.md). **Wave C0 published on 11 August 2026: contract 1.21.0
carries 17 M2 paths**, so tasks covering those paths may now be integrated. Every other M2 task is
still capped at `[~] built` — see [frontend-execution-plan.md](frontend-execution-plan.md) §2 for the
table of what is and is not published, and for the caveat that C0 shipped with no tests.
**Revision:** 3 - visit-first A5 per [ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md);
revision 2 simplifications remain in force. Revision 3 changes only the **unbuilt** FE4 wave plus one
review-screen control and two Partner tasks; everything built and wired is untouched.

Continue using the same Partner application and authenticated shell. The backend returns
`{workspace_key, actions[]}` after login; a typed frontend registry maps known keys to owned routes,
labels and icons and ignores unknown keys. The UI must not infer a lifecycle from a role, profession,
skill or category name. M1 task-service Partners keep Offers/Jobs while M2 workforce and project
workspaces appear only for eligible Partners.

Task IDs were re-issued in revision 2. `GAP-nnn`, `SIM-nn` and `FLOW-nn` references point at the audit
finding a task closes.

## Frontend completion standard

A frontend checkbox may be marked `[x]` only when:

- the flow uses the generated OpenAPI client and real backend states, not fixtures or direct DB access;
- loading, empty, validation, pending, offline/retry, forbidden and server-error states are handled;
- desktop and mobile layouts are verified, including long Indian names, addresses and currency values;
- keyboard navigation, visible focus, labels, errors and screen-reader announcements are tested;
- irreversible and financial actions require explicit confirmation and show truthful pending states;
- component, integration and critical Playwright tests exist against the documented API behavior;
- the detailed TODO and [task.md](task.md) are updated with evidence in the same change.

> **Who runs those tests — owner-run since 12 August 2026.** The session **writes** the component,
> integration and Playwright tests and **does not run them**. See [task.md](task.md) §"Verification
> convention". A session runs `pnpm lint`, `pnpm typecheck` and, where it matters, `pnpm build` —
> never `vitest` or Playwright — reports `[~] built — owner verification pending`, and the owner
> promotes to `[x]` after running them. Screen-reader, keyboard and responsive checks in the list
> above are likewise **described precisely enough for the owner to reproduce**, not claimed as done.

## Flow-weight budget

Revision 2 fixed the following limits. Exceeding one is a design regression, not a detail:

| Flow | Budget |
|---|---|
| Customer requirement submission | 4 screens: What, Where/When, Details, Review. The A5 visit-plan chooser is a control on Review, never a fifth screen. |
| Customer payments before work starts | A3: one (the unlock). A5: two (the visit plan, the first stage) |
| Confirmation steps before submit | One. The review screen is the confirmation. |
| A3 Partner enquiry response | One screen: rate, days, inclusions, accept/decline |
| A5 Partner enquiry response | One screen: the visit-slot confirmation (slot picker + accept/decline) |
| Partner steps before seeing a real lead | Phone, name, one service, one city |

## FE0 - Information architecture, contracts and shared patterns

**Phase status `[~]`** — every deliverable is built on `feat/m2-workforce-projects`.
**Verified 2026-08-10:** `pnpm lint` passes with `--max-warnings 0`, and the full `pnpm typecheck`
is green across **all 9 workspace packages** — `@vsolve/api-client`, `@vsolve/config`, `@vsolve/query`,
`@vsolve/testing`, `@vsolve/ui`, `admin`, `customer`, `partner`, plus the `contract:check` freshness
gate reporting *"Generated types are up to date (contract 1.20.0)"*.

Reaching that took two fixes, both pre-existing and neither M2's doing:

1. `packages/api-client/scripts/generate.mjs` reported the generated types stale on every Windows
   checkout. It hashed and compared the contract with its on-disk line endings, so a CRLF checkout
   never matched an LF-generated banner. The types were never stale. Both the checksum input and the
   staleness comparison now normalize line endings. This matters beyond convenience: the check backs
   `M2-FE-809`, and the natural response to a red freshness gate — regenerate and commit — would have
   flipped it red for every non-Windows contributor instead.
2. `apps/admin/features/finance/view/step-up-gate.tsx` omitted the now-required `intended_role` on the
   OTP request. It was invisible because turbo cancels dependents when `contract:check` fails, so
   `admin:typecheck` had not run to completion here.

**Sequencing for the parallel build:** [frontend-execution-plan.md](frontend-execution-plan.md) splits
FE1–FE7 into two conflict-free session columns ([A: Customer](frontend-session-a.md),
[B: Partner + Operations](frontend-session-b.md)) with file ownership, frozen-file rules and wave
gates. FE0 is the sequential foundation that blocks both.

Two standing caveats apply to every `[~]` below and are not repeated per task:

1. **No tests were written.** The owner directed that this build proceed without them and verify
   manually (2026-08-10). The frontend completion standard requires component and integration tests,
   so no task here can reach `[x]` on evidence alone until they exist.
2. **Nothing calls an endpoint.** No M2 path is published (`M2-BE-013` unstarted), so every module is
   unproven against a real response. This is the gap `contracts/proposals/0012-m2-capability-and-requirement-surface.md`
   exists to close.

### Product and route design

- [x] `M2-FE-001` Map Customer routes for requirement creation, request tracking, quote teasers, unlock,
  quote comparison, A3 booking tracking and A5 project tracking.
  Evidence: [08-frontend-information-architecture.md](08-frontend-information-architecture.md) §1 —
  13 routes under the existing `(flow)` group. A3 files under `/bookings`, A5 under `/projects`,
  because the two make different promises about who holds the money.
- [x] `M2-FE-002` Map Partner routes inside the existing app as contextual workspace families, not one
  universal menu. Preserve A1 Offers/Jobs and define M2 Workforce Enquiries/Shifts/Crew and Project
  Enquiries/Projects routes.
  Evidence: implemented as code in `frontend/apps/partner/features/workspace/registry.ts`, not prose.
  Base M1 navigation is unconditional and unchanged; M2 workspaces are additive and grant-driven.
  Reproduced in IA §2 for review.
- [x] `M2-FE-003` Map Operations routes inside the existing `frontend/apps/admin` application; retain
  the product label Operations and do not create a separate app.
  Evidence: IA §3. Six routes; M2 case kinds join the existing `/operations/cases` rather than forking
  a second case system.
- [~] `M2-FE-004` Define navigation behavior for one workspace, multiple workspace families, pending
  review, partial suspension, no active capability and an unknown workspace key.
  All seven states specified in IA §4. **Four are implemented** — no capability, one, two, and unknown
  key. **Three are not**: pending review, suspended, and suspended-mid-session are indistinguishable
  from "no capability" because `workspace_grants()` returns approved capabilities only. Blocked on the
  capability-status read requested in proposal 0012. Inferring them from an empty grant list would put
  a review banner in front of every existing A1 Partner.
- [x] `M2-FE-005` Define responsive flow diagrams for A3 workforce and A5 project before page
  implementation. There is no per-variant commercial-mode branch to diagram: A3 is lead-only and A5 is
  managed. `SIM-03`
  Evidence: IA §5 — one diagram per archetype, three columns (Customer, Partner, Money), with the
  payment count visible. No commercial-mode branch appears in either.

### Shared UI and API behavior

- [x] `M2-FE-006` Submit required endpoint payloads and user-visible errors through
  `contracts/proposals/**`; integrate only after the backend publishes generated OpenAPI.
  Evidence: `contracts/proposals/0012-m2-capability-and-requirement-surface.md`, registered in the
  proposals README. Three sections — capability/workspace, requirement, and the teaser/unlock/selection
  path — with request and response examples, per-endpoint error and recovery tables, cross-cutting
  idempotency/auth/clock/money rules, one open question on how a 202 domain refusal should reach the
  client, and 13 acceptance criteria. Nothing has been integrated, which is the task's own condition.

  **File-history note (2026-08-10).** This file was written twice. A second session, told the task was
  still open, wrote a full replacement at 13:53 without re-checking that the 13:49 version existed —
  the file was untracked, so git holds no copy of the first and it is not recoverable. The version on
  disk is the second. The open question on the `202` refusal was carried across deliberately because
  `M2-FE-009`'s evidence below cites it; anything else the first version raised is lost and should be
  re-filed as proposal 0013 rather than merged into this one. Cause: a directory listing taken early in
  a session was trusted as current at write time. The ownership rules in
  [frontend-execution-plan.md](frontend-execution-plan.md) §3 exist to prevent exactly this, and did
  not yet apply because both sessions were inside FE0.
- [~] `M2-FE-007` Add a typed Partner workspace registry that renders known keys and ignores unknown
  ones, plus an accessible workspace switcher. Keep it small; do not build per-archetype scaffolding
  for workspaces that do not exist. `SIM-09`
  Built: `parseWorkspaceGrants` in `@vsolve/query` (total, defensive, merges duplicate keys);
  `features/workspace/registry.ts` mapping the two keys in `partners.capabilities.WORKSPACE_ACTIONS`;
  `WorkspaceSwitcher` as labelled `nav` links with `aria-current`, hidden below two entries; wired
  into `PartnerShell`, which now derives its tab bar from grants instead of a module constant.
  Unknown keys render nothing. **Grants arrive as a prop defaulting to empty** because
  `GET /partner/workspaces/` does not exist, so no Partner has yet seen an M2 tab — the path is
  unproven end to end.
- [~] `M2-FE-008` Extend shared status, timeline, money, attachment, address, schedule, person-count,
  confirmation and error components without duplicating business rules in the UI.
  Built in `@vsolve/ui`: `Timeline`/`TimelineEvent`, `AttachmentList`, `AddressSummary`,
  `ScheduleSummary`, `PersonCount`, `FactList`, `ConfirmAction`. Status is the existing `Badge`, money
  the existing `Readout`/`formatMoney`, errors the existing `ErrorState` — extended, not duplicated.
  Every one takes pre-formatted, pre-authorized values and decides no policy: `AddressSummary` does not
  mask, `PersonCount` does not settle, `ConfirmAction` requires a stated consequence. **Not yet
  consumed by any screen**, so "without duplicating business rules" is proven by construction rather
  than in use.
- [~] `M2-FE-009` Define one API error mapping layer for field errors, stale state, payment pending,
  expired action, conflict, forbidden and retryable outage.
  All 29 codes from `07-state-machines-and-permissions.md` §8 mapped to recovery intents in
  `@vsolve/api-client`; `categorizeError` in `@vsolve/query` classifies into the seven categories plus
  `unexpected`, code first and status second. One layer — `describeError` says what, `categorizeError`
  says where. **Unverified against real responses**, and the 202 carrying
  `m2_unlock_payment_pending` may never reach the layer at all depending on how the contract declares
  it; raised as the open question in proposal 0012.
- [~] `M2-FE-010` Define query keys, invalidation rules and polling/event refresh behavior for
  requirement, invitation, proposal, unlock, engagement, stage and case states.
  `frontend/packages/query/src/m2-keys.ts`: keys for all seven domains, `M2_FRESHNESS` assigning each
  read an existing M1 tier (deadline-bearing reads are `EXPIRING_STATE`), and `M2_INVALIDATION`
  mapping all 28 commands from §6 to the key prefixes their success makes untrue. Teasers and unlocked
  quotes are separate keys so a teaser response can never carry vendor identity into an unpaid client.
  **Deliberately kept out of `queryKeys`** until the endpoints publish, so the standing rule in
  `keys.ts` stays true. Cases reuse the existing `queryKeys.operations.cases`.
- [~] `M2-FE-011` Add analytics naming that excludes clarification bodies, KYC data, precise personal
  details and payment payloads, and that captures the success measures in `README.md`. `PLN-05`
  `frontend/packages/config/src/analytics.ts`: 38 event names covering all eight success measures, and
  `sanitizeProperties` enforcing an allow-list of 27 keys — scalars only, so a permitted key cannot
  smuggle a serialized requirement. Amounts other than the published unlock list price, and location
  finer than city/pin code, are absent by design. **No emitter is wired**, so nothing is being
  measured yet.

**FE0 gate:** Routes, navigation, contracts, shared states and responsive prototypes are approved for
all three applications and both lifecycle branches.

**Gate not passed.** The deliverables exist and are clean, but the gate turns on *approved* — the
Product owner has not reviewed the IA, and Codex has not answered proposal 0012. Neither is
engineering's to sign.

## FE1 - Partner registration and capability-driven workspace

### Progressive registration

- [~] `M2-FE-101` Build the short entry path: phone, name, business type, one service, one city, then
  straight into masked live requirement summaries. `FLOW-06`
- [~] `M2-FE-102` Gate KYC on the first enquiry accept, payout details on the first payout and the crew
  roster on the first crew assignment, each with a clear in-context explanation of why it is needed now.
  `FLOW-06`, `FLOW-07`
- [~] `M2-FE-103` Add business-type selection for individual, workforce agency and project vendor with
  plain-language consequences.
- [~] `M2-FE-104` Build skill, service and capability selection using backend-provided options and
  lifecycle explanations; make clear that a skill does not itself activate a workspace.
- [ ] `M2-FE-105` Build guided business, service-area, capacity, skills, experience, availability and
  category-specific document steps, requested at the point they become necessary.
- [~] `M2-FE-106` Build the worker insurance and liability declaration step for workforce capabilities.
  `GAP-022`
- [~] `M2-FE-107` Build crew roster management for eligible workforce Partners, including add, edit,
  archive, skills, documents and availability, entered at first assignment rather than registration.
  `FLOW-07`
- [~] `M2-FE-108` Provide draft persistence, resumable upload, review summary and explicit declarations
  before submission.
- [~] `M2-FE-109` Show review, correction-required, approved, rejected, expired-document and suspended
  states with the exact next permitted action.

### Capability-driven workspace

- [~] `M2-FE-110` Render contextual navigation from authenticated workspace keys through the typed
  registry. The backend authorizes keys/actions; the frontend owns routes, labels and icons.
- [~] `M2-FE-111` Preserve M1 Home/Offers/Jobs for A1 Partners while adding A3 Workforce and A5 Project
  workspaces only when authorized. Do not rename every lifecycle record to a generic job or work item.
- [~] `M2-FE-112` Add a workspace switcher for Partners with materially different capabilities and keep
  invitation, job, shift, project and money records in their native lifecycle views. Global Home may
  aggregate only safe, clearly labelled summaries.
- [~] `M2-FE-113` Handle capability suspension, expiry or an unknown workspace key during a session by
  disabling invalid actions, refreshing server state and failing closed with recovery guidance rather
  than falling back to Jobs.

### Verification

- [~] `M2-FE-114` Test progressive-gate behaviour: browse before KYC, blocked accept without KYC,
  blocked payout without bank details, blocked assignment without crew, resume after failure,
  correction/resubmit, multiple capabilities, no capability and unauthorized deep links.
- [~] `M2-FE-115` Verify implemented navigation for A1, A3 and A5, and prove that an unknown workspace
  key renders nothing rather than a generic Jobs fallback.

**FE1 gate:** A Partner reaches real demand in under a minute, and after approval sees contextual
navigation and actions only for approved lifecycle capabilities. Skill names never select navigation
and A1 remains backward compatible.

**Phase status `[~]` — 14 of 15, verified 2026-08-11 (Session B).** Evidence, file map and the
exception states per task are in [frontend-session-b.md](frontend-session-b.md) § Wave B1. In short:
the four-step path to masked demand is asserted against a constant rather than described; an unknown
workspace key resolves to nothing and no workspace resolves to `/jobs`; and A1 navigation is byte-for-
byte `BASE_NAV` with the M1 offer inbox suite passing untouched. `pnpm test` **1379/1379**, `pnpm lint`
clean at `--max-warnings 0`, `pnpm typecheck` **9 of 9** with `contract:check` at contract 1.21.0 —
which also clears the `apps/partner` typecheck failure recorded in [task.md](task.md) against
`express-path.ts`.

`M2-FE-105` is not started.

**Updated 2026-08-12 — the workspaces read is wired.** `partner-shell.tsx` reads `GET
/api/v1/partner/workspaces/` (contract 1.21.0) and all seven registry destinations are mounted as
`force-dynamic`, `robots: noindex` routes, so no authorized tab can 404. `/workforce` and `/projects`
render real grant-driven homes; the other five render an honest not-built-yet state, because their
screens are Waves B2 and B3 (`/workforce/enquiries` and `/projects/enquiries` have a published
endpoint and an unwritten screen — the copy says exactly that). 1399/1399 tests, lint clean, 9/9
typecheck, partner build green. Nothing here exceeds `[~]`: the registration views built for
`FE-101..109` are still composed into no route.

## FE2 - Customer requirement (free)

### Four-screen guided requirement

- [~] `M2-FE-201` Build a category-first entry that explains in plain language whether the Customer is
  hiring workers for a period or commissioning a defined outcome, without asking them to choose an
  archetype. `GAP-006`
- [~] `M2-FE-202` Build screen 1 `What`: service, scale and the answers that infer the lifecycle.
- [~] `M2-FE-203` Build screen 2 `Where/When`: location, dates, flexibility and the hard service-by
  date. `GAP-001`
- [~] `M2-FE-204` Build screen 3 `Details`: photos, short video, documents and voice note with preview,
  upload progress, retry, remove, privacy guidance and failure handling.
- [~] `M2-FE-205` Make voice a first-class fast path - "record 30 seconds instead of answering
  questions" - beside the structured questions, and capture the language. `FLOW-04`, `GAP-007`
- [~] `M2-FE-206` Build screen 4 `Review` as the single confirmation; submitting happens here. Do not
  add a separate immutable-version confirmation step. `FLOW-03`
- [~] `M2-FE-207` Move callback preference, site-visit interest, access constraints and preferred
  communication to optional entry points reachable **from** the review screen. `FLOW-02`
- [~] `M2-FE-208` Keep an optional additional-details text field while making structured answers and
  voice the primary requirement.
- [~] `M2-FE-209` Provide save-and-resume, step validation and back navigation.
- [~] `M2-FE-210` Show the probable-duplicate warning with a merge option before creating a second
  requirement. `GAP-004`
- [~] `M2-FE-211` Explain when an edit after vendor acceptance notifies vendors and resets their
  deadlines; require explicit confirmation for material edits. `GAP-015`
- [~] `M2-FE-212` State clearly on submission that the requirement is free and that nothing is charged
  until quotes arrive (A3) or a professional confirms a visit (A5). `FLOW-01`
- [ ] `M2-FE-216` **(Revision 3)** Build the A5 visit-plan chooser as a control on the review screen:
  1/2/3 professionals at the server-published tier prices, plain-language statement that choosing
  charges nothing and the plan is charged only when the first professional confirms a visit slot.
  Never renders for A3; never a fifth screen (`SCREENS.length === 4` stands).

### Customer tracking

- [~] `M2-FE-213` Add `My requests` with matching status, quote teaser count (A3) / visit-plan state
  (A5, revision 3 — arrives with Wave A2), the delivery deadline, latest activity and support action.
- [~] `M2-FE-214` Add a request detail timeline covering the requirement, matching, invitations at an
  aggregate level, questions, site visits, quote delivery and recovery.
- [~] `M2-FE-215` Add honest empty, no-supply, delayed-match, SLA-breached and service-by-expired states
  with a truthful next step and no fabricated progress. `GAP-001`, `GAP-002`

**FE2 gate:** A Customer submits a rich mobile-friendly requirement in four screens, pays nothing, and
understands exactly when and whether they will be asked to pay.

> **Wired 2026-08-12 (Session A).** All fifteen at `[~] built — owner verification pending`. Four
> routes under `app/(flow)/requests/`, `features/requirement/queries.ts` and
> `packages/query/src/m2-requirement.ts` against contract 1.21.0; the three stale M2 entries removed
> from the Customer boundary guard and `contract-pending/` deleted, its rule re-stated as
> `features/requirement/boundary.test.ts`. Lint clean at `--max-warnings 0`, typecheck 9/9,
> `build --filter=customer` green. **No tests run** — see [task.md](task.md) §"Verification
> convention" and its owner queue.
>
> Three of the fifteen are capped below `[x]` by the contract rather than by the screen, and each
> says so on the screen instead of pretending: **`FE-204`/`FE-205`** have no upload command
> (`M2-BE-202`, Wave C1), so screen 3 offers no file or voice control at all; **`FE-210`** has no
> merge endpoint, so the duplicate notice links to the existing request rather than claiming to
> join them; **`FE-211`** has no amend command, so the consequence and the confirmation are built
> and the confirmation is not supplied. Eleven contract gaps logged in
> [frontend-execution-plan.md](frontend-execution-plan.md) §7.

## FE3 - Partner enquiries, clarification and proposals

### Partner enquiries

> **Wave B2 built 2026-08-12 — owner verification pending.** All thirteen below are `[~]`: built
> against the generated client for contract 1.21.0, wired to four `force-dynamic` routes, lint clean,
> typecheck 9 of 9, `pnpm build --filter=partner` green. **No test was run.** Twelve unit/component
> files and one Playwright spec were written; the queue rows are in [task.md](task.md)
> §"Owner verification queue". Twenty-three gaps are
> logged in [frontend-execution-plan.md](frontend-execution-plan.md) §7 — per-task notes below name
> the ones that changed what could be built. Per-task evidence in
> [frontend-session-b.md](frontend-session-b.md) § Wave B2.

- [~] `M2-FE-301` Add an enquiry list with type, area, schedule, response deadline and fit summary while
  limiting private Customer data before acceptance.
  **Area and fit summary are not published**; nothing stands in for them, and the list states when the
  server is holding pages the unpublished `cursor` parameter cannot reach.
- [~] `M2-FE-302` Build enquiry detail with the structured requirement, attachment viewer, capacity
  check and clear accept/decline consequences, including the capacity hold taken on acceptance.
  `GAP-012`
  The hold is stated from the snapshot's own dates. **No attachments and no capacity read exist.**
- [~] `M2-FE-303` Implement accept and decline with reason capture, stale-state handling and
  duplicate-click protection.
  Three layers of duplicate protection: a disabled control, a stable `Idempotency-Key`, `retry: false`.
  **The decline vocabulary is the server's now** — `InvitationDeclineReasonEnum` at 1.24.0, rendered
  from the generated type, so a code renamed on the server fails a type check rather than a request.
- [~] `M2-FE-304` Show countdowns as guidance but rely on backend status for expiry and slot ownership;
  present business-hours deadlines truthfully. `GAP-014`
  A passed deadline stops offering an accept and never announces an expiry. "No deadline" is a real
  state, not a zero. The countdown is calibrated against **`EnquiryDetail.server_now`** (1.24.0),
  which `unwrap` feeds into `serverClock` at millisecond precision — no device clock is involved.

### Safe clarification

- [~] `M2-FE-305` Build **structured clarification**: post a question, read the Customer's answer, both
  on the shared timeline. Do not build a chat thread, participant list or read receipts. `SIM-07`
- [~] `M2-FE-306` Add callback request/scheduling and **paid** site-visit request flows, showing the fee
  and how it adjusts against the final price, without exposing personal numbers before server-authorized
  disclosure. `SIM-08`
  The visit request is built. **`POST /site-visits/{id}/schedule/` is published (1.22.0) and this
  app still does not call it for an ad-hoc visit** — scheduling takes both parties, and a one-sided
  date picker would offer a time nobody agreed to. **No callback endpoint exists at all.** Both
  stated on screen rather than faked. The A5 *plan* visit has neither problem: `confirm_visit_slot`
  books it on the shared grid in one command (`M2-FE-314`), and the panel no longer lists it —
  `is_plan_visit` separates the two.
- [~] `M2-FE-307` Display consent and safety guidance before contact disclosure; record the server
  outcome and never reveal contact data from cached client state after revocation.
  **No disclosure surface exists**, so there is no consent to record and no cached contact to revoke.
  The negative is enforced by `contact-boundary.test.ts` rather than asserted in prose.

### Two proposal composers

- [~] `M2-FE-308` Build the **A3 one-screen composer**: rate per worker per day, minimum days, what is
  included. Nothing else. `SIM-11`, `FLOW-08`
  Five controls, fixed by `A3_COMPOSER_FIELDS` and asserted against the DOM — a sixth fails a test.
- [~] `M2-FE-309` Build the A5 composer for deliverables, line items, stages, taxes, exclusions,
  assumptions, dates, warranty and validity.
  Stages carry the deliverables, line items and dates, and the shape is **published now**
  (`ProposalStage` at 1.24.0), so `toStageRequests` maps onto the generated type instead of a
  private one. **Assumptions has no wire field and was not built** — DRF drops unknown keys
  silently, so the control would discard input without an error. The remote composer is
  **unmounted** under revision 3 — an A5 estimate needs a completed visit — and kept in the tree
  with a note saying why; `M2-FE-315` replaced it on the route.
- [~] `M2-FE-310` Show the minimum-wage floor inline on the A3 composer and surface the server rejection
  clearly when a rate falls below it. `GAP-023`
  **No floor is published and the server guard is inert over HTTP.** The rule is stated with no figure
  invented; the refusal is routed to the rate field.
- [~] `M2-FE-311` Show the required tax basis and the commission-treatment statement on every proposal
  so the vendor knows what the Customer will compare. `GAP-016`, `GAP-017`
  **Half closed at 1.24.0.** `required_tax_basis` is published, so the on-site composer names the
  basis a second vendor is compared on and says plainly when a blank one means *this* vendor fixes
  it for everyone. `commission_treatment` still has no vocabulary and no M2 policy, so the field is
  left unsent rather than authored.
- [~] `M2-FE-312` Show server-calculated totals and prevent editing the final arithmetic in local state.
  No total input in either composer; after submission the figure shown is Django's echoed
  `total_paise`. **The server does not reconcile an A3 total** — only the A5 stage sum is checked.
- [~] `M2-FE-313` Support draft, preview, submit and supersede; never overwrite a submitted proposal.
  Show withdrawn, expired, selected and superseded states with permitted next actions. `SIM-06`
  **Closed at 1.24.0.** `GET /proposals/?requirement=` mounts on `m2QueryKeys.proposals.mine`, so a
  Partner reads their own quote back after a reload, on a second device and in a new session, and
  the supersession trace is rendered beneath the live row. Eight states now, not six: `ACCEPTED` and
  `LAPSED` are written as the vendor's own reconfirmation and the vendor's own lapse — never as the
  Customer's rejection, which would misreport their standing back to them.

### A5 visit response (revision 3)

- [~] `M2-FE-314` built — static gates green, owner manual verification pending. The A5 enquiry
  response is a **visit-slot confirmation on one screen**: requirement summary, a slot picker over
  `GET /partner/enquiries/{id}/visit-slots/`, and decline with a **published** reason
  (`InvitationDeclineReasonEnum`). There is no separate Accept — `confirm_visit_slot` *is* A5
  acceptance — and the commitment is stated before the tap: travel at that slot, estimate there.
  The browser never computes availability; each slot `id` is a signed token posted back unchanged,
  never parsed, never cached across a reload. `m2_visit_slot_unavailable` recovers by refreshing the
  grid, never by resending the id. An ineligible vendor's grid — every slot `NO_CAPACITY` — renders
  as a grid with the reason, not as an error and not as an empty screen. `opens_plan_checkout` is
  rendered as **held, not scheduled**, with the lapse stated.
  — `visit/model/{slot-grid,visit-state}.ts`, `visit/queries.ts`,
  `visit/view/{visit-slot-picker,visit-response,visit-day-panel}.tsx`.
- [~] `M2-FE-315` built — static gates green, owner manual verification pending. The A5 composer's
  **on-site mode** on its own route: prefilled from the requirement (`duration_days`,
  `requested_start`, `required_tax_basis`) and the visit, **working days as the schedule** with the
  derived end date and its arithmetic stated, **material line items as first-class rows**, numeric
  keyboards, 44px targets and save-on-blur to this device. `site_visit_id` is sent, which is what
  made the path reachable at all. The completed-visit guard is explained above the form and the
  server's `m2_visit_not_completed` routes to the same explanation — **the submit is never
  disabled on this screen's own copy of the visit state**, because that copy can be a minute old and
  a button that refuses on a stale read is the dead submit this task forbids.
  — `proposal/model/onsite-draft.ts`, `proposal/view/{onsite-composer,onsite-screen}.tsx`,
  `app/projects/enquiries/[invitationId]/estimate/page.tsx`.
  **One gap:** material lines are sent as `ProposalStage` rows because the wire has one
  money-carrying row type — logged in `frontend-execution-plan.md` §7 as a `kind` request.

**FE3 Partner gate:** An eligible A3 vendor can respond to a lead on one phone screen; an A5 vendor
can confirm a visit slot on one screen and submit a comparable estimate from the site; neither has
unsupported contact or pricing shortcuts.

## FE4 - Access (A3 teasers + unlock · A5 visits + estimates), selection and engagement

Revision 3 splits this wave by archetype. The A3 tasks are unchanged from revision 2. The A5 tasks
replace the A5 use of teasers/unlock with the visit journey. All of FE4 was unbuilt at the split.

### A3 teasers and unlock

- [ ] `M2-FE-401` Show quote **teasers**: vendor verification badge, rating, vendor type and headline
  price band. No full scope, no vendor identity, no contact. `FLOW-01`
- [ ] `M2-FE-402` Present the INR 149 unlock against visible delivered value, stating exactly what it
  unlocks and that it is charged once. `FLOW-01`, `SIM-04`
- [ ] `M2-FE-403` Build checkout using the server-created payment order; handle UPI pending, failed,
  cancelled, late success and browser-close recovery truthfully.
- [ ] `M2-FE-404` Never show success from the payment redirect alone; resolve final status from the
  backend and provide a safe retry without duplicate purchase.
- [ ] `M2-FE-405` Mark out-of-budget quotes and estimates as such rather than presenting them as
  ordinary options. `GAP-003`
- [ ] `M2-FE-406` Build non-responsive rejection with its reason, the remaining rejection allowance and
  the replacement it triggers (A3: a quote slot; A5: a free replacement visit). `GAP-009`

### A5 visits and estimates (revision 3)

- [ ] `M2-FE-419` Show **vendor cards** for the responding A5 pool before any visit is confirmed:
  verification badge, rating, vendor type, distance band. No identity, no contact. Identity (name,
  photo, verification) appears only once that vendor confirms a visit slot.
- [ ] `M2-FE-420` Build the **visit-plan checkout**, opened when the first vendor holds a slot
  ("Vendor confirmed Tuesday 10am — book your visits"): server-created payment order, UPI pending,
  failed, cancelled, late success and browser-close recovery, never success from the redirect alone.
  States plainly that one payment covers the whole plan and unfilled visits refund themselves.
- [ ] `M2-FE-421` Build the **visit tracker** on the request detail: each plan slot with its state
  (awaiting a professional, slot held, scheduled with date/time and the professional's disclosed
  identity, completed, refunded/replaced), reusing the checkout slot-picker presentation for times.
- [ ] `M2-FE-422` Build visit-day states: arrival confirmation through the non-OTP fallback (start
  OTP arrives in M3), reschedule, vendor no-show and customer no-show reporting with honest
  consequences on screen.
- [ ] `M2-FE-423` Show delivered **estimates in full** — scope, working days, material lines, taxes,
  commission treatment, total, exclusions, validity — with no paywall state anywhere in the A5
  journey, each linked to its completed visit.
- [ ] `M2-FE-424` Show the **visit money** truthfully on both sides, server-calculated and never
  client-derived: the Customer sees where each slot's money went (paid to the professional who
  visited and estimated, or refunded); the Partner sees the visit payout land in Money once the
  estimate is in, and sees plainly that a visit without an estimate pays nothing.

### Comparison and selection

- [ ] `M2-FE-407` Display each unlocked quote (A3) or delivered estimate (A5) with vendor
  verification summary, validity, scope, schedule, taxes, commission treatment, total and exclusions.
- [ ] `M2-FE-408` Build an accessible comparison view that normalizes equivalent fields on the single
  tax basis while clearly showing non-equivalent assumptions. `GAP-017`
- [ ] `M2-FE-409` Allow Customer clarification and revision requests without editing vendor prices or
  agreement fields.
- [ ] `M2-FE-410` Make selection reference a specific proposal and show a final scope/cost summary
  before confirmation.
- [ ] `M2-FE-411` Show vendor reconfirmation as a pending state, not a confirmed booking.
- [ ] `M2-FE-412` When a vendor declines or times out, guide the Customer to another unlocked quote,
  another estimate or a free replacement (visit) without losing history and without a second charge.
  `FLOW-01`
- [ ] `M2-FE-413` Offer one-tap re-validation when a quote's or estimate's validity has expired,
  reusing the existing unlock or plan. `GAP-019`
- [ ] `M2-FE-414` Prevent double selection and recover gracefully from stale proposal or concurrent
  action errors.

### Engagement

- [ ] `M2-FE-415` For A3, show direct-payment responsibility and limited Vsolve protection before
  contact/connection completion. Never present it as a protected booking. `SIM-03`
- [ ] `M2-FE-416` For A5, show stages, funding schedule, commission/tax presentation, cancellation
  terms and protection before the first stage checkout.
- [ ] `M2-FE-417` Handle stage-payment pending, failed, retry and late success without creating a false
  confirmed engagement.
- [ ] `M2-FE-418` Provide durable agreement, receipt/invoice and timeline access to both parties.

**FE4 gate:** Money is only ever requested against a real accepted commitment — visible delivered
quotes (A3) or a confirmed visit (A5) — and Customer and Partner see the same immutable proposal,
engagement state and commercial protections.

## FE5A - Workforce fulfilment experience

### Partner workforce workspace

- [ ] `M2-FE-501` Add workforce engagement lists grouped by crew-needed, upcoming, in-progress,
  exception and completed states.
- [ ] `M2-FE-502` Build **per-stage** crew assignment with eligibility, conflict and worker-count
  feedback from the backend, supporting legitimate day-to-day rotation. `GAP-024`
- [ ] `M2-FE-503` Build replacement request/notification flows with Customer approval where required.
- [ ] `M2-FE-504` Build arrival confirmation using the non-OTP fallback path, retry-safe, never claiming
  success until acknowledged by the backend.
- [ ] `M2-FE-505` Build **supervisor daily attendance**: "n of m present today" in one action. Do not
  build per-worker check-in/check-out. `SIM-02`
- [ ] `M2-FE-506` Build overtime request as a scope amendment with the additional amount, approval state
  and the plain statement that unapproved overtime is unpaid. `GAP-026`
- [ ] `M2-FE-507` Build no-show, partial crew, late arrival, unsafe site and Customer-unavailable
  reporting with evidence and support escalation.
- [ ] `M2-FE-508` Build the **safety incident** report flow with severity, evidence and immediate
  escalation, separate from cancellation. `GAP-022`

### Customer booking

- [ ] `M2-FE-509` Add `My bookings` with schedule, agreed crew composition, permitted identity summary,
  contact rules, direct-payment reminder and next action.
- [ ] `M2-FE-510` Let the Customer confirm or dispute the day's attendance in **one tap**, and capture
  per-worker detail only inside the dispute flow. `SIM-02`
- [ ] `M2-FE-511` Let the Customer acknowledge crew changes, approve/reject time extensions and confirm
  completion or open an issue during the documented window.
- [ ] `M2-FE-512` Show partial service, replacement, refund, dispute and closure outcomes in one
  chronological timeline.

**FE5A gate:** Customer and Partner can run a multi-worker, multi-day engagement from mobile devices,
including partial attendance and no-show recovery, without a per-worker device dependency.

## FE5B - Project fulfilment experience

### Partner project workspace

- [ ] `M2-FE-601` Add project lists grouped by funding-needed, active stage, Customer review, disputed,
  warranty and completed states.
- [ ] `M2-FE-602` Show immutable agreement deliverables, stages, funded amounts, dates, retention and
  payout state. `GAP-031`
- [ ] `M2-FE-603` Build stage evidence submission with upload progress, retry, declaration and history.
- [ ] `M2-FE-604` Build the scope-amendment (change-order) proposal with scope, schedule and
  server-calculated money difference, using the shared amendment UI rather than a project-only one.
  `SIM-01`
- [ ] `M2-FE-605` Build the Customer-caused delay claim with evidence and a schedule-extension request.
  `GAP-030`
- [ ] `M2-FE-606` Build digital deliverable handover for Event and Media, with Customer acceptance.
  `GAP-032`
- [ ] `M2-FE-607` Show payout holds, retention and dispute actions without promising an unverified
  release date.

### Customer project workspace

- [ ] `M2-FE-608` Add `My projects` with overall progress, active stage, funded amount, next action and
  issue status.
- [ ] `M2-FE-609` Build stage review with evidence viewer, approve, request clarification and dispute
  choices.
- [ ] `M2-FE-610` Build amendment comparison against the current agreement and require explicit
  acceptance plus additional payment/refund handling.
- [ ] `M2-FE-611` Build deliverable acceptance, project completion and warranty issue reporting with
  clear deadlines and the retention release date. `GAP-031`, `GAP-032`
- [ ] `M2-FE-612` Show the vendor-replacement path if a project is abandoned, including what is funded,
  what transfers and what the price difference is. `GAP-029`
- [ ] `M2-FE-613` Preserve original and amended agreement versions in a readable history.

**FE5B gate:** Neither party can mistake clarification, evidence upload or a proposed amendment for
approved scope, payment or stage completion, and an abandoned project shows a route to completion.

## FE6 - Operations, recovery and money visibility

### Unified Operations workspace

- [ ] `M2-FE-701` Add searchable queues for unmatched, under-quoted, under-visited (plan slots
  unfilled, visit no-shows, estimates overdue), SLA-breached, vendor-unconfirmed,
  fulfilment-exception, safety-incident, disputed, refund-pending and payout-held requests.
- [ ] `M2-FE-702` Build a unified request detail timeline spanning the requirement, snapshots, matching,
  questions, proposals, unlock, engagement, stages, cases and money.
- [ ] `M2-FE-703` Display actor, source, timestamp and reason for every privileged or commercial state
  transition.
- [ ] `M2-FE-704` Build permission-gated actions for clarification, rematch, **reclassification**,
  deadline extension, contact review, payout hold and escalation. `GAP-006`
- [ ] `M2-FE-705` Build assisted quote capture as a **primary A3 path** with a call script, visibly
  attributing the quote to the Partner and recording consent; Operations must not become the vendor.
  `SIM-10`

### Cases, refunds and leakage review

- [ ] `M2-FE-706` Build case intake and review for cancellation conflict, no-show, attendance, safety
  incident, stage, quality, payment and off-platform claims.
- [ ] `M2-FE-707` Require reason, evidence and confirmation before high-impact actions; show the
  server's calculated remedy before authorized confirmation.
- [ ] `M2-FE-708` Show refund and payout states from ledger-backed APIs, including pending, failed,
  reversed and reconciled.
- [ ] `M2-FE-709` Build dual-confirmation cancellation after contact disclosure and route disagreement
  to review.
- [ ] `M2-FE-710` Present leakage, slot-squatting and price-band indicators as review signals with
  evidence and history, never as an automatic guilt label. `GAP-009`, `GAP-010`
- [ ] `M2-FE-711` Surface the Operations-touches-per-request measure in the workspace so the design can
  be checked against the approved unit economics. `GAP-033`

**FE6 gate:** Operations can identify and recover every documented stuck state through authorized UI
actions without requesting database edits.

## FE7 - Accessibility, resilience and release

### Quality and safety

- [ ] `M2-FE-801` Add route and component permission tests for Customer, Partner staff, Partner owner,
  Operations role variants and suspended users.
- [ ] `M2-FE-802` Verify WCAG 2.2 AA fundamentals across forms, dialogs, uploaders, timelines, quote
  comparison, tables and payment state announcements.
- [ ] `M2-FE-803` Verify responsive layouts at small mobile, large mobile, tablet and desktop sizes;
  avoid desktop-only Operations actions where urgent mobile support is expected.
- [ ] `M2-FE-804` Verify slow network, offline transition, request timeout, duplicate click, browser
  refresh and back navigation for every financial or state-changing flow.
- [ ] `M2-FE-805` Ensure telemetry, errors and session replay redact contact, KYC, clarification,
  location, crew and payment-sensitive data.
- [ ] `M2-FE-806` Verify the flow-weight budget above still holds at release; a regression past it fails
  this gate.

### Release readiness

- [ ] `M2-FE-807` Add critical Playwright journeys for A3, A5, vendor rejection/replacement, teaser to
  unlock, unlock payment pending, plan chooser to visit-plan checkout, visit no-show and unfilled-slot
  refund, on-site estimate to selection, non-responsive rejection, cancellation conflict, refund and
  Operations recovery.
- [ ] `M2-FE-808` Add visual/regression coverage for capability combinations, long content, empty and
  exception states.
- [ ] `M2-FE-809` Validate generated client synchronization and fail CI on stale generated API usage.
- [ ] `M2-FE-810` Add feature-flag and rollout behavior that hides incomplete categories without
  creating dead links or misleading payment paths, and that keeps in-flight requirements reachable when
  a flag is turned off. `GAP-036`
- [ ] `M2-FE-811` Run lint, type-check, unit/integration tests, production builds and end-to-end tests;
  attach results to the master board.

**FE7 gate:** All three applications pass accessibility, responsive, permission, resilience, flow-weight
and end-to-end release checks against the production-candidate backend contract.
