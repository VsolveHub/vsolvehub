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
**Revision:** 4 - rate-card A3 per [ADR-0009](../../docs/adr/0009-m2-rate-card-instant-dispatch-for-a3.md);
revision 3 (visit-first A5, [ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md)) and the
revision 2 simplifications remain in force. Revision 3 changed only the **unbuilt** FE4 wave plus one
review-screen control and two Partner tasks. Revision 4 touches **built** surface for the first time:
the A3 access work (teasers/unlock, Wave A2) is demoted to the thin-supply fallback — nothing shipped
is deleted and no task ID is renumbered — and the primary A3 front door is new, unstarted work: waves
A2R (`M2-FE-425..429`, Customer) and B2R (`M2-FE-316`, Partner), both blocked on backend wave C2R
publishing the rate-card contract, plus the fulfilment additions (`M2-FE-513..515`, with C4's
settlement model) and the Operations rate-card surface (`M2-FE-712..713`).

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
| Customer payments before work starts | A3: one (the booking fee, at vendor accept — revision 4; the unlock only on the fallback). A5: two (the visit plan, the first stage) |
| Confirmation steps before submit | One. The review screen is the confirmation. |
| A3 Partner enquiry response | One screen. Primary path (revision 4): the crew offer — the lead's own number, accept/decline with reason. Fallback: the composer — rate, days, inclusions, accept/decline |
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
  **Revision 4:** the rate-card front door — the catalog `Book a crew` preset entry, the rate and
  inclusion-list display, the booking-fee checkout and the cascade holding/fallback states — is added
  to IA §1 as unbuilt wave-A2R rows, and the teaser/unlock surface is relabelled the A3 fallback.
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
  **Revision 4:** the A3 diagram is redrawn in IA §5 for the rate-card flow — preset → rate shown →
  cascade → lead accepts → booking fee (the only charge) → attendance and the Day-settled taps —
  with a note that the fallback keeps the old shape. The A5 diagram is untouched.

### Shared UI and API behavior

- [x] `M2-FE-006` Submit required endpoint payloads and user-visible errors through
  `contracts/proposals/**`; integrate only after the backend publishes generated OpenAPI.
  Evidence: `contracts/proposals/0012-m2-capability-and-requirement-surface.md`, registered in the
  proposals README. Three sections — capability/workspace, requirement, and the teaser/unlock/selection
  path — with request and response examples, per-endpoint error and recovery tables, cross-cutting
  idempotency/auth/clock/money rules, one open question on how a 202 domain refusal should reach the
  client, and 13 acceptance criteria. Nothing has been integrated, which is the task's own condition.
  **Revision 4:** the teaser/unlock/selection section of 0012 now describes the A3 **fallback**; the
  rate-card surface (rate-card read, book-at-rate, crew offers, booking-fee checkout/state) has no
  proposal yet and is awaited from backend wave C2R — file it as a new numbered proposal, never a
  rewrite of 0012.

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
  **Revision 4** adds four codes to §8 — `m2_rate_card_unavailable`, `m2_roster_insufficient`,
  `m2_booking_fee_not_chargeable` and `m2_booking_fee_payment_pending` (202, the booking fee's own
  pending question) — none yet in the frozen table; a frozen-file request lands them at a wave-A2R
  gate.
- [~] `M2-FE-010` Define query keys, invalidation rules and polling/event refresh behavior for
  requirement, invitation, proposal, unlock, engagement, stage and case states.
  `frontend/packages/query/src/m2-keys.ts`: keys for all seven domains, `M2_FRESHNESS` assigning each
  read an existing M1 tier (deadline-bearing reads are `EXPIRING_STATE`), and `M2_INVALIDATION`
  mapping all 28 commands from §6 to the key prefixes their success makes untrue. Teasers and unlocked
  quotes are separate keys so a teaser response can never carry vendor identity into an unpaid client.
  **Deliberately kept out of `queryKeys`** until the endpoints publish, so the standing rule in
  `keys.ts` stays true. Cases reuse the existing `queryKeys.operations.cases`.
  **Revision 4** adds two read domains with no key yet — the published rate card and the booking-fee
  state — and the §6 commands `book_at_published_rate`, `accept_crew_offer`, `decline_crew_offer`,
  `create_booking_fee_checkout`, `complete_booking_fee`, `forfeit_booking_fee`, `refund_booking_fee`,
  `fall_back_to_quote_flow`, `confirm_day_settled` and `report_cash_demand` to the invalidation map's
  backlog; the frozen factory takes them the way it took the `visits` namespace, at a gate.
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
- [~] `M2-FE-216` built — static gates green, owner manual verification pending. The chooser is a
  control **inside** `review-screen.tsx`, passed in as a node exactly as the four optional-detail
  panels are, so `SCREENS.length === 4` still holds and the stepper is unchanged. Tiers come from
  `available_tiers` and **an empty list renders as "we cannot offer visits here yet"** — the proposed
  49/99/199 appear nowhere in the code. Mounted only when the server's inferred lifecycle is A5, so
  `POST .../visit-plan/` cannot reach an A3 request. Re-choosing works (the size is in the
  idempotency key) and `Send this request` is **disabled with a stated reason** until a plan exists,
  because `_assert_visit_plan_chosen` refuses the submit otherwise and meeting that as a 409 after
  the button is the one refusal a Customer should never see.
  — `access/view/visit-plan-chooser.tsx`, `access/queries.ts › useChooseVisitPlan`,
  `requirement/view/{review-screen,requirement-flow}.tsx`.

### Customer tracking

- [~] `M2-FE-213` Add `My requests` with matching status, quote teaser count (A3 — the fallback
  signal under revision 4; the primary path shows cascade and booking-fee state, wave A2R) /
  visit-plan state (A5, revision 3 — arrives with Wave A2), the delivery deadline, latest activity
  and support action.
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

- [~] `M2-FE-301` built — static gates green, owner manual verification pending. Add an enquiry list
  with type, area, schedule, response deadline and fit summary while
  limiting private Customer data before acceptance.
  **Area and fit summary are not published**; nothing stands in for them. Two workarounds are gone
  at contract 1.26.0/1.23.0: the row titles itself from **`EnquirySummary.service_name`** instead of
  de-slugging `category_slug` (the slug is no longer projected at all), and the inbox **pages** on
  the published `cursor` parameter instead of stating that it is truncated.
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

- [~] `M2-FE-305` built — static gates green, owner manual verification pending. Build **structured
  clarification**: post a question, read the Customer's answer, both
  on the shared timeline. Do not build a chat thread, participant list or read receipts. `SIM-07`
  **Both directions since 1.26.0.** Every row is titled from `RequirementQuestion.asked_by_role`
  (`CUSTOMER` / `VENDOR` / `OPERATIONS`, all three named, an unknown one neutral) rather than
  assumed to be the vendor's, and a customer-asked question carries the answer composer on
  `POST /partner/questions/{id}/answer/`. Still one question, one answer, no thread.
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
  **Revision 4: fallback only.** The composer serves quote-flow enquiries; on the primary path the
  platform publishes the rate and nothing is composed. Built, kept.
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
  **Revision 4: fallback only** — and the same floor now also binds the platform's own rate cards,
  checked server-side at publish.
- [~] `M2-FE-311` Show the required tax basis and the commission-treatment statement on every proposal
  so the vendor knows what the Customer will compare. `GAP-016`, `GAP-017`
  **Half closed at 1.24.0.** `required_tax_basis` is published, so the on-site composer names the
  basis a second vendor is compared on and says plainly when a blank one means *this* vendor fixes
  it for everyone. `commission_treatment` still has no vocabulary and no M2 policy, so the field is
  left unsent rather than authored.
  **Revision 4:** applies to A5 and the A3 **fallback** — the rate-card path has no proposal to carry
  either statement.
- [~] `M2-FE-312` Show server-calculated totals and prevent editing the final arithmetic in local state.
  No total input in either composer; after submission the figure shown is Django's echoed
  `total_paise`. **The server does not reconcile an A3 total** — only the A5 stage sum is checked.
  **Revision 4:** the A3 half is fallback-only — the rate-card path has no vendor-entered figure at
  all.
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
  **`SiteVisit.timezone` (1.26.0) is consumed:** a confirmed visit now shows the day and clock time
  in the *site's* zone with the zone named, instead of only "in two days" — and degrades to the
  device's clock, saying so, on a runtime that does not carry the IANA name. `reason_code` on the
  no-show report is the published `VisitNoShowReasonEnum`.
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
  **The gap is closed at 1.26.0 and the workaround is deleted.** Material lines are sent on
  `ProposalCreateRequest.material_lines` as `ProposalMaterialLine` — `{title, quantity, unit,
  amount_paise}` — so a bag of cement is no longer a stage carrying an approval and a release. The
  composer collects quantity and units beside the cost, the on-screen caveat that explained the old
  behaviour is gone, and `proposal-status.tsx` renders materials as their own block. A material
  advance is labelled as one on the engagement too, from `EngagementStage.kind`.

### A3 crew offer (revision 4)

- [~] `M2-FE-316` built — static gates green, owner manual verification pending. **Revision 4 — wave
  B2R, against contract 1.29.0.** `/workforce/offers`, `features/crew-offer/**`. The A3 primary-path
  enquiry is a
  **crew offer** on one phone screen: it always shows the lead's own number — "You receive ₹X/day for
  N helpers; the customer pays you directly at day end" — with accept or decline and a decline reason
  (declines feed the rate card's decline-rate alarm). Accepting the job is accepting the published
  rate for that job; accept takes a roster-sized capacity hold (`m2_roster_insufficient` when the
  roster is short) and holds the win while the Customer pays the booking fee — a held win is not a
  confirmed job, and the copy says "do not travel yet" exactly as the A5 held slot does. Minutes-level
  timeouts on the M1 dispatch clock, not business-hours deadlines. There is no composer on this path;
  the one-screen composer above remains for fallback quote-flow enquiries.

**FE3 Partner gate:** An eligible A3 vendor can respond to a lead on one phone screen; an A5 vendor
can confirm a visit slot on one screen and submit a comparable estimate from the site; neither has
unsupported contact or pricing shortcuts.

## FE4 - Access (A3 teasers + unlock · A5 visits + estimates), selection and engagement

Revision 3 splits this wave by archetype. The A3 tasks are unchanged from revision 2. The A5 tasks
replace the A5 use of teasers/unlock with the visit journey. All of FE4 was unbuilt at the split.

Revision 4 (ADR-0009) then demoted the A3 half after it shipped: the teasers and the unlock are the
**thin-supply fallback**, kept in full — nothing below is deleted or renumbered — and the primary A3
front door is the new, unstarted wave-A2R subsection below.

### A3 teasers and unlock (the A3 fallback since revision 4 — built, kept)

- [~] `M2-FE-401` built — static gates green, owner manual verification pending. Teaser rows carry the
  three fields the wire has: verification, vendor type and the price **band**. **A rating is not
  published** and none is invented — logged in `frontend-execution-plan.md` §7.
  — `access/adapters › toTeaserView`, `access/view/unlock-panel.tsx`.
- [~] `M2-FE-402` built — static gates green, owner manual verification pending. **The number 149
  appears nowhere in the code.** `price_paise` is nullable because the price is blocking owner
  decision 1 and `apps.requirements.pricing` fails closed; a null renders as "we cannot offer this
  yet". The charge is offered only beneath the teasers it buys, and the copy states it is once per
  request rather than per quote.
- [~] `M2-FE-403` built — static gates green, owner manual verification pending.
  `POST /requirements/{id}/unlock/` under a **requirement-scoped stable idempotency key**, which the
  domain reinforces by resuming a `PENDING` attempt rather than starting a second charge. Pending,
  failed and refunded are three distinct screens. Browser-close recovery works from the requirement
  id alone — there is nothing in `sessionStorage` the path depends on.
- [~] `M2-FE-404` built — static gates green, owner manual verification pending. **No screen reads a
  redirect.** `unlockPhase` and `visitPlanPhase` derive solely from the `unlock`/`plan` object on the
  state read, which polls (`boundedPoll`) only while a charge is `PENDING`. The pending panel offers
  **no control at all**, because every control that could exist there is a way to pay twice; the
  retry appears only on a server-confirmed `FAILED`, and clears the stored key first so it is a new
  command rather than a replay of the failed one.
  — `packages/query/src/m2-quotes.ts`, `access/view/{unlock-panel,book-visits-screen}.tsx`.
- [~] `M2-FE-405` built — static gates green, owner manual verification pending. `OUT_OF_BUDGET` is a
  server verdict and is **labelled, kept and explained** on both the teaser row and the full quote —
  never hidden, never presented as an ordinary option. The comparison table badges it in the column
  header too, so a cheapest-total marker cannot be read past it.
- [~] `M2-FE-406` built — static gates green, owner manual verification pending. Two reasons as two
  distinct choices rather than a dropdown, each with its consequence written next to it.
  **`non_responsive_rejections_remaining` is nullable and null suppresses the replacement path
  entirely** — offering a free replacement on a cap the owner has not set would be the client
  inventing policy, and `POST .../reject/` answers `m2_policy_unavailable` to prove it. Zero reads
  differently from null. The replacement is named per archetype: another quote slot on A3, a free
  replacement visit on A5.
  — `quotes/view/reject-quote-dialog.tsx`, `quotes/queries.ts › useRejectQuote`.

### A3 rate-card front door (wave A2R — revision 4)

All of this subsection is **new, unstarted work** — not a rework of the fallback files above — and
all of it is blocked on backend wave C2R publishing the rate-card contract (rate-card read,
book-at-rate, crew offers, booking-fee checkout/state; the machine, commands and codes are
[07-state-machines-and-permissions.md](07-state-machines-and-permissions.md) §1, §2, §4c, §6, §8).

- [~] `M2-FE-425` built — static gates green, owner manual verification pending.
  `/requests/book/[service]`, opened by the catalog's new **Book a crew** action, offered on
  `A3_TIME_BLOCK` alone with **Get quotes instead** beside it. One screen, deliberately not the four
  — and **the questions are rendered from the variant's published list**, never a hardcoded "floor /
  lift / carry / packing", so a field Operations stops asking for stops appearing. Address through
  the M1 picker, dates as two fields, and any edit takes the price back down. **The schema the
  server validates against (`a3_preset_question_schema`) is still unpublished** — logged in
  `frontend-execution-plan.md` §7.
- [~] `M2-FE-426` built — static gates green, owner manual verification pending. The day rate, the
  total, what goes to the crew, the booking fee, the standard day, the overtime rate, the inclusion
  list and the published add-ons — **all four money figures are separate server fields and nothing
  is computed, summed or filled in**. The supervision margin is absent because the Customer's read
  omits it, and it is not reconstructed by subtraction. `is_available: false` renders the server's
  own reason and offers the quote flow, with **no book control and no number at all**.
- [~] `M2-FE-427` built — static gates green, owner manual verification pending. The holding state
  shows the server's own wave ("Asking nearby supervisors" / "Search widened"), says nothing has
  been charged, **offers nothing to press**, and re-reads itself while the cascade is live. No
  countdown: the wave timeout and widening steps are on no read, and a timer would be a number this
  client invented. `FELL_BACK` renders the handoff **and the Wave A2 unlock surface beneath it** —
  the thin-supply fallback, kept.
- [~] `M2-FE-428` built — static gates green, owner manual verification pending.
  `/requests/[id]/book-crew`, mirrored from the visit-plan checkout: a route rather than a modal,
  pending with nothing to press, and the outcome resolved from the aggregate's own state read —
  never a redirect, never a payment-attempt read. **The pay control is gated on
  `checkout_available`, not on a fee status**: `BookingFee.OFFER_ACCEPTED` is unreachable today, and
  a screen built on it could never offer the button. **No branch waits for
  `m2_booking_fee_payment_pending`**, which no path raises.
- [~] `M2-FE-429` built — static gates green, owner manual verification pending. Arrival (non-OTP,
  the default path), vendor no-show with `party` **hard-coded to `VENDOR`** so no control can
  forfeit the Customer's own fee, and cancel stating **both** money outcomes because T is server
  configuration on no read. The forfeit split prints its two halves only once the server has settled
  them, from the record's own paise, and never as a percentage.

### A5 visits and estimates (revision 3)

- [~] `M2-FE-419` built as far as the contract allows — **and the honest answer is that it cannot be
  finished.** `VendorCardSerializer` exists in `apps/requirements/serializers.py` with exactly the
  right disclosure shape and **is published on no path**; `SiteVisit` carries no partner either, and
  no rating or distance band exists anywhere. So no card list is faked: the tracker names a
  professional only where a delivered estimate carries one (`CustomerProposal.vendor` joined on
  `site_visit.id`), every other slot says the name is given before they arrive, and the panel states
  the disclosure rule in plain words so a Customer knows it is policy rather than a fault. **No
  identity and no contact appears anywhere before that.** Logged in
  `frontend-execution-plan.md` §7.
- [~] `M2-FE-420` built — static gates green, owner manual verification pending. `/requests/[id]/
  book-visits`, a real route so a lost UPI redirect resumes from a URL. Opened by
  `checkout_available` and by the held slot appearing on the tracker with the professional's own
  confirmed time. **One payment for the whole plan**, quoted from `chargeable_paise` so a
  reclassification credit is honoured, and the screen says in as many words that unfilled visits
  refund themselves. Pending, failed and void are separate screens; the pending one offers nothing
  to press.
  — `access/view/book-visits-screen.tsx`, `access/queries.ts › useStartVisitPlanCheckout`.
- [~] `M2-FE-421` built — static gates green, owner manual verification pending. The tracker is driven
  by the plan's **shares**, not its visits, so an unfilled slot is a row that shows the refund it is
  owed rather than a row that does not exist. Per-slot states: awaiting, **held** (a `REQUESTED`
  visit on an unpaid plan — the distinction the whole flow turns on), scheduled, on site, visited,
  cancelled, vendor no-show, customer no-show. Times render through `formatVisitSlot`, which is the
  checkout picker's own `en-IN` weekday/day/month + lowercased 12-hour format, because both book
  against the same `carts.availability` grid. Since Wave J the zone is **`SiteVisit.timezone`**
  (1.26.0) rather than the deprecated single-city constant, memoised per zone and falling back to the
  booking zone — never the device's — for a slot no vendor has taken yet.
  — `access/adapters › toVisitTrackerView`, `access/view/visit-tracker.tsx`.
- [~] `M2-FE-422` built — static gates green, owner manual verification pending. Arrival is the
  **non-OTP fallback as the default path**, offered on a scheduled slot only, so a held slot on an
  unpaid plan cannot be marked arrived. No-show is a confirmation with the consequence stated first,
  and **the party is hard-coded to `VENDOR`** — you report the other party's absence, never your
  own, and the server answers `403` to the reverse, so no control exists that could send `CUSTOMER`.
  Reschedule is **not** built: `POST /site-visits/{id}/schedule/` exists but nothing published lets a
  Customer see candidate starts for a specific vendor (`visit-slots/` is Partner-scoped), so the
  screen offers no time picker rather than one over times we cannot confirm.
- [~] `M2-FE-423` built — static gates green, owner manual verification pending. **There is no paywall
  state in `quote-card.tsx` and there must never be one.** Scope, stages, material rows, inclusions,
  exclusions, warranty, tax basis, commission treatment, validity and total all render whole. The
  entitlement is checked once by the server before the payload is constructed; nothing downstream
  re-decides it, and each estimate carries its completed visit.
- [~] `M2-FE-424` (Customer half) built — static gates green, owner manual verification pending. Each
  slot's money reads from the share's own `amount_paise`, `vendor_payout_paise` and
  `platform_share_paise`; **nothing is summed or derived**. Five sentences for five share states:
  set aside, committed, paid to the professional who came and wrote your estimate, refunded whole
  because nobody earns from an undelivered visit, or owed a free replacement. The Partner half is
  Session B's.

### Comparison and selection

- [~] `M2-FE-407` built — static gates green, owner manual verification pending. One card per quote or
  estimate at `/requests/[id]/quotes`, carrying verification, validity, scope, the A3 rate/days/
  headcount or the A5 stages, tax basis, commission treatment, total, inclusions, exclusions and
  warranty. **Contact appears nowhere at any status** — it is absent from the response, not merely
  unrendered, because it is released by the engagement and not by the fee.
  **Revision 4:** the A3 rate/days/headcount cards arise on the **fallback** only — the rate-card
  path has no quotes to render.
  — `quotes/adapters › toQuoteCard`, `quotes/view/quote-card.tsx`.
- [~] `M2-FE-408` built — static gates green, owner manual verification pending. A real `<table>` with
  a row header per field, so a screen reader announces the vendor and the field rather than reading
  unlabelled cells; wide content scrolls inside its own container. Equivalent rows are normalised on
  **what you actually pay** (`comparableTotalPaise` adds tax to an `EXCLUSIVE` total) and may be
  ranked — `cheapestIndex` returns null on a tie rather than picking arbitrarily. Non-equivalent
  rows sit under their own captioned group with a per-row caveat and **no ranking**: a shorter
  exclusion list is not a better offer. Possible for the first time at 1.24.0 because
  `required_tax_basis` forces one basis and `ProposalStage` is a published shape.
  — `quotes/adapters › toComparisonRows`, `quotes/view/quote-comparison.tsx`.
- [~] `M2-FE-409` built as far as the contract allows. Clarification runs one way at 1.24.0 — a vendor
  asks, the Customer answers on the request timeline — and there is **no Customer-asks endpoint**;
  the only revision request that exists is `M2-FE-413`'s re-validation, limited to an expired quote.
  So the screen offers that, states where a professional's questions live, and says plainly that
  neither the Customer nor Vsolve can change a price. **No control edits a vendor price or an
  agreement field**, which is the invariant the task exists for. Logged in
  `frontend-execution-plan.md` §7.
- [~] `M2-FE-410` built — static gates green, owner manual verification pending. Choosing posts a
  specific `proposal_id`, from the card that carries the full scope and total the Customer is
  looking at — the summary *is* the card, which is why there is no separate confirmation screen.
  **Revision 4:** selection exists for A5 and the A3 fallback only — the rate-card path has no
  selection step; the first accepting lead is the crew and the verified booking fee is the
  confirmation.
- [~] `M2-FE-411` built — static gates green, owner manual verification pending. **The pending panel
  says "This is not a booking yet" in bold, is toned warning, and has no green on it anywhere.** It
  carries the vendor's `reconfirm_by` as a server countdown, and states that a null deadline is an
  unset clock rather than an unlimited one.
  — `quotes/view/selection-status.tsx`.
- [~] `M2-FE-412` built — static gates green, owner manual verification pending. Decline and timeout
  are one state for the Customer because the next step and the guarantee are identical, and the
  panel says the entitlement survives and **choosing another costs nothing more**. Every other quote
  stays on screen and regains its Choose control; nothing is removed from the list.
- [~] `M2-FE-413` built — static gates green, owner manual verification pending. Offered only on a
  server-set `EXPIRED` status, never derived from `valid_until` against a browser clock — a device an
  hour fast would otherwise hide a live quote's Choose control. The button says **"Ask for a fresh
  price — free"** and the copy states it reuses what has already been paid, because a Customer who
  suspects a second charge simply will not press it. `revalidation_requested_at` turns it into a
  statement afterwards: only a vendor can state a price.
- [~] `M2-FE-414` built — static gates green, owner manual verification pending. A live selection
  **withholds** every Choose and Not-this-one control rather than disabling them, so a stale render
  cannot start a second selection. `m2_selection_conflict` is handled as what the contract says it
  is — retryable because the answer changes on its own — so it re-reads the selection and says
  "Somebody chose first" **without resending the choice**. `m2_proposal_not_selectable` falls through
  to the shared refusal path and the card's own non-selectable state.

### Engagement

- [~] `M2-FE-415` built — static gates green, owner manual verification pending. Read from
  `engagement.commercial_mode`, never inferred from the archetype — that is the field that decides
  whether the UI promises protection, and a client that computes it keeps promising protection
  through a policy change. `LEAD_ONLY` renders badged **"Not a Vsolve booking"** and says payment,
  refunds and any guarantee on the work are between the Customer and the vendor. **A third mode
  renders "we cannot describe this agreement"**, because on this surface the optimistic fallback is
  "protected booking".
  **Revision 4** extends the `LEAD_ONLY` copy with the day-end sentence: the Customer pays the lead
  directly at day end — the evening dual "Day settled?" taps, with a UPI link at the exact published
  amount as a convenience.
  — `packages/query/src/m2-engagement-customer.ts`, `engagement/view/engagement-screen.tsx`.
- [~] `M2-FE-416` built — static gates green, owner manual verification pending. Stages, amounts,
  schedule, commission treatment and tax all render before the first funding control. Funding is
  **at face value** and the screen states that the visit-plan money is already spent on the visits
  and does not come off a stage — there is no stage credit and nothing here subtracts anything.
  Cancellation terms are **not** rendered: `Engagement` publishes no cancellation-terms field, and
  quoting one from a proposal the engagement froze would be this client authoring the agreement.
- [~] `M2-FE-417` built — static gates green, owner manual verification pending. Exactly one stage
  can carry a funding button — the first unsettled one, because the server refuses a later stage
  while an earlier one is unfunded. A stage whose charge is `PENDING` shows the waiting state and
  **no control**, and `m2_stage_not_funded` re-reads and states what it found rather than offering a
  retry. The engagement read polls only while a stage funding charge is unresolved.
- [~] `M2-FE-418` built — static gates green, owner manual verification pending. The agreement and
  its stages are durable at `/engagements/[id]`, keyed by the engagement rather than by the request
  so a notification opened months later resolves, and the full timeline is one link away on the
  request the record names. **The receipt is now on the screen** (1.26.0, Wave J):
  `Engagement.access_receipt` carries the gapless `M2A-` number for the A3 unlock or the A5 visit
  plan, and it is rendered as a **reference, not a link** — `AccessReceipt` publishes no document id
  because `TaxDocument.order` is not nullable and an access fee has no `Order`. The word *invoice* is
  deliberately not used: GST treatment of both access fees is an open owner decision. `null` says
  there is no number rather than claiming nothing was paid, because the field cannot distinguish
  "no fee" from "covered by a reclassification credit" from "predates numbering".

**FE4 gate:** Money is only ever requested against a real accepted commitment — an accepted crew
offer (A3, revision 4), visible delivered quotes (A3 fallback) or a confirmed visit (A5) — and
Customer and Partner see the same immutable proposal, engagement state and commercial protections.

## FE5A - Workforce fulfilment experience

### Partner workforce workspace

- [~] `M2-FE-501` built — static gates green, owner manual verification pending. Five buckets on
  `GET /engagements/`, split by `commercial_mode`. **The crew-needed bucket renders and cannot be
  filled**: nothing on the wire says which shift-days still need names (Wave C4), so the group keeps
  its heading and says so rather than being dropped or guessed at. An engagement whose status this
  build cannot place is shown under "Not recognised" rather than hidden.
- [~] `M2-FE-502` built — static gates green, owner manual verification pending. Per-stage
  assignment at `/workforce/shifts/[engagementId]/days/[stageId]`, sending the **whole intended
  crew** every time because the server reconciles the day to it. Eligibility is split rather than
  filtered — unverified and archived people are shown disabled with the real reason, because
  `assign_crew` refuses an unverified membership as `m2_crew_conflict` with the worker's name, which
  on a screen about double bookings reads as a double booking. The **cross-agency conflict is not
  previewed**: it is a fact about every other agency's bookings, held as a database index, and a
  picker that guessed would tell a supervisor somebody is free when they are not — the refusal
  renders the server's own sentence, which names the person and the date. **The booked headcount is
  not on `ShiftDay`** (it lives on `attendance`, which is null until a command touches the day), so
  the ceiling is stated only once the server has stated it (plan §7). **No longer blocked:**
  `documents_verified_at` had no writer anywhere including the seed, so no seeded worker could be
  assigned in any environment; contract 1.31.0's `seed_m2_demo` stamps it, so the precondition is
  real and the shell workaround is out of the smoke script. The **production** writer is still
  unbuilt on purpose — an Operations verify command belongs with the rest of the Operations APIs
  (plan §7). `GAP-024`
- [~] `M2-FE-503` built — static gates green, owner manual verification pending. A substitution is
  the same one call: untick, tick, send, with a release reason recorded against the person coming
  off. There is **no Customer approval gate in the contract** for a like-for-like swap and none is
  invented — the customer reads the day's crew on their own shift-day read, and the screen says so.
  What *does* need their approval is more workers than were booked, and that is routed to the
  published-rate change request rather than allowed as a longer list.
- [~] `M2-FE-504` built — static gates green, owner manual verification pending. **Non-OTP is
  rendered as the default path, not a fallback**, per the contract's own correction of the task
  wording — no banner apologises for it and nothing calls it unverified. Retry-safe on a
  stage-scoped key (the command carries no payload, so a retry cannot become a different request),
  and it claims nothing until the server answers: arrival stamps the time, starts the stage and, on
  day one, earns the booking fee, and an optimistic tick would assert all three. With nobody named
  the panel states the order instead of drawing a button that can only be refused.
- [~] `M2-FE-505` built — static gates green, owner manual verification pending. One number, one
  action. **No per-worker check-in/check-out anywhere**, and the module comment says why it must not
  be added later. The count is bounded by the booked crew where the server has published it —
  "an extra worker is a scope amendment at the published rate, not a bigger number in an attendance
  box" — and by nothing where it has not. A **missing check-out is rendered as the neutral flag it
  is**: settled at the agreed shift length, marked for review, not a dispute and nothing held back,
  because a supervisor who reads the flag as an accusation starts inventing end times. `SIM-02`
- [~] `M2-FE-506` built — static gates green, owner manual verification pending. **There is no
  amount field**: the vendor names what and how much of it, the server names the money from the
  frozen card, and no total is multiplied out on the client either. The published overtime rate,
  shift length and add-on table are shown, and `null` on any of them is stated rather than filled in
  — an assumed shift length decides when overtime *starts*. Approval state is read off the ordinary
  amendment list, filtered to this stage, because this is a caller into the one amendment engine
  rather than a second one. `m2_policy_unavailable` (the owner has not set the retroactive window)
  and `m2_amendment_required` (no published rate, or the window closed) get different sentences, and
  neither is retried. "Overtime the customer has not approved is not paid" is on the screen.
  `GAP-026`
- [~] `M2-FE-507` built — static gates green, owner manual verification pending. A **router, not a
  form**: five situations sent to the command that actually records each. Partial crew and nobody-came
  are the attendance count; customer-unavailable and gate-locked on day one are
  `POST /requirements/{id}/crew/no-show/` behind a confirmation that states what it costs the
  customer; unsafe site is the safety report. **Late arrival has no endpoint and none is invented**
  (plan §7) — the stamped arrival time is the record and the paid consequence is an overtime
  request. Evidence routes to the one stage-evidence composer on the booking rather than growing a
  second upload path. `m2_policy_unavailable` on the no-show is rendered as Vsolve's own unset
  policy, with support, not as a retry.
- [~] `M2-FE-508` built — static gates green, owner manual verification pending. Severity from the
  published enum, **worst first** so the first tap is not the mildest; category from this app's own
  vocabulary because the field is an unconstrained slug (plan §7); `occurred_at` left blank by
  default rather than pre-filled with a time this app would be inventing. **It is never offered as a
  cancellation** — the dialog states what filing does and the two things it does not do — and the
  frozen-once-filed rule is said on the form, because it changes how carefully the description is
  written. Both parties' reports are listed with Operations' status and resolution.
- [~] `M2-FE-513` built — static gates green, owner manual verification pending. The supervisor's
  half of the dual tap. The figure is **`amount_paise`, read and never computed** — the breakdown
  beside it is four separate server-sent numbers, because multiplying rate by headcount gives the
  same answer until an approved overtime amendment lands and then is quietly short. Settlement is
  **per worker-day present**: a three-of-four day settles at three workers' rate and the panel says
  so beside the `M2-FE-505` count. `SUPERVISOR_CLAIMED` is worded as **unproven**, which is neither
  paid nor unpaid. `WAGES_ARE_DIRECT` sits with the number, because this is the only large figure a
  lead sees at day end and a number on a platform screen reads as one the platform is holding. The
  UPI convenience ships as a **deep link with a copy control, not a QR** (no rendering dependency is
  added mid-wave, plan §7), and it is offered as something to send to the customer rather than a
  button to press — the vendor is the payee. At contract 1.31.0 the link is a `SerializerMethodField`
  on the shift-day read rather than an injection into the settlement command's response, so it is
  there before the tap and **survives a reload**; the panel read it off the day all along and had
  nothing to compensate for, and `null` now means exactly *no VPA published*.

### Customer booking

- [~] `M2-FE-509` built — static gates green, owner manual verification pending. `/bookings/workforce`, filtered from
  `GET /engagements/` on `commercial_mode` — one endpoint, two lists, two sets of words. The
  direct-payment reminder sits **above** the list, not in a row, and there is deliberately no
  Funded column on A3. **The engagement projection carries no crew composition and no vendor
  identity**, so both are read back off the accepted quote (`CONSUMED` unlocks stay readable) and
  degrade to a link rather than an error when that read is refused. No phone number exists on the
  wire; the panel states the contact rule and never implies one is here (plan §7).
  **Revision 4:** a rate-card engagement has no accepted quote — its crew composition and terms read
  off the **booking record** (the published rate and its inclusion list) instead; the `CONSUMED`
  unlock read remains the fallback engagement's path.
- [~] `M2-FE-510` built — static gates green, owner manual verification pending. On the stage review,
  because on a workforce booking **the stage is the day**. A full day is **one control and no dialog**;
  a shortfall becomes three one-tap choices because the server *requires* one, and the sentence above
  them says the day settles at the present workers' rate whichever is chosen. Per-worker detail is
  behind the dispute disclosure and nowhere else — C4 has no per-worker check-in or check-out, so a
  routine form asking who was there would be inventing a record. **The generic Approve / Correct /
  Dispute controls stand down while the attendance answer is open**: `approve_stage` and
  `respond_attendance` are not two ways to do one thing, and only the second creates the settlement
  and takes the shortfall choice.
- [~] `M2-FE-511` built — static gates green, owner manual verification pending. The amendment and completion halves.
  A3 time extensions run through the same panel as A5 change orders, because they are the same
  object; completion is `POST /engagements/{id}/completion/`, offered only in `COMPLETING` because
  it answers `409` before that. **Crew-change acknowledgement is not built** — it needs C4's
  attendance model — and "open an issue" is routed to the per-stage dispute, which is the only
  issue command that exists.
  **Revision 4:** A3 time extensions and extras price at the card's **published add-on rates**;
  overtime counts only at the card's published rate after Customer one-tap approval.
- [~] `M2-FE-512` built — static gates green, owner manual verification pending. One feed, `GET /engagements/{id}/events/`,
  and **nothing on it is synthesised**. `actor_is_system` is rendered as the difference between a
  person deciding and a clock deciding; actor identity is never published and none is guessed. Titles
  come from the server's own `reason`, with a de-slugged `reason_code` as fallback rather than a
  client-authored copy table over an unpublished vocabulary (plan §7). Since Wave J the read is keyed
  on the factory's own `m2QueryKeys.engagements.events(id)` and `M2_FRESHNESS.engagementEvents`; the
  locally-composed key is gone. Still nested under `engagements.detail`, so the existing engagement
  invalidations clear it by prefix — checked rather than assumed.
- [~] `M2-FE-514` built — static gates green, owner manual verification pending. The Customer's half
  of the dual tap; Session B builds the supervisor's (`M2-FE-513`). **Every figure is a published
  field, formatted** — `amount_paise` beside `per_worker_paise`, `workers_present` and
  `extras_paise`, read out and never multiplied, because the three reconcile by a database check
  constraint and a client that redoes that arithmetic keeps paying the old formula through a change
  to the real one. A one-sided tap renders as *claimed and unanswered*, never as settled. **The
  screen says in as many words that Vsolve is not holding this money**, and no settlement row means
  no amount rather than ₹0. **The UPI deep link is read, never assembled** — and
  `GET .../shift/` currently answers `null` for it on every request (plan §7: a serializer field
  over a model attribute that does not exist), so the panel prefers the command response's own link
  and the absent case never claims the professional has no UPI address.
- [~] `M2-FE-515` built — static gates green, owner manual verification pending. One button, one
  confirmation, and **the send works with everything blank** — a required amount turns "they
  demanded extra" into a form, and the form is what stops it being reported. Offered in two places
  (the shift-day, and the booking as a whole with no day attached) because a report needing a live
  shift-day is one nobody could file the next morning. It promises **only what the server commits
  to**: recorded, counted towards a pattern, and while the owner's threshold is unset nothing
  happens to the vendor at all — so no removal, warning or contact is implied. The idempotency key
  is scoped to engagement + day, so a double tap cannot count one complaint twice towards a
  threshold that can end somebody's trade. Genuine extras are signposted to the amendment panel by
  name.

**FE5A gate:** Customer and Partner can run a multi-worker, multi-day engagement from mobile devices,
including partial attendance and no-show recovery, without a per-worker device dependency.

## FE5B - Project fulfilment experience

### Partner project workspace

- [~] `M2-FE-601` built — static gates green, owner manual verification pending. Six buckets, same
  component as `M2-FE-501` with the project vocabulary. `CORRECTION_REQUESTED` is filed under "Your
  move", never under "Disputed" — a correction is not a dispute and the row says it was sent back.
- [~] `M2-FE-602` built — static gates green, owner manual verification pending. "Agreed then /
  changed since / owed now" are read straight from `total_paise`, `amendment_delta_paise` and
  `staged_total_paise` — a database constraint ties them, so nothing is summed client-side.
  **Deliverable text, retention and warranty terms are not published on the engagement** and none is
  invented: the panel says where the fuller wording lives and that no retention is recorded (plan
  §7).
- [~] `M2-FE-603` built — static gates green, owner manual verification pending. Presign → PUT →
  finalize with `XMLHttpRequest` progress, per-kind size and media-type pre-checks, and three
  distinct failure recoveries. **`NOTE` is not an upload kind** — the note is the required `note` on
  `submit/`, stored as its own append-only evidence row — and **`object_key` is never published**, so
  the history renders kind, size and scan status with no preview.
- [~] `M2-FE-604` built — static gates green, owner manual verification pending. One composer, two
  pricing rules, and it says which applies: A3 collects **days only** and the server prices them from
  the frozen rate; A5 prices each line with a signed amount and the server sums them. **A reduction
  that would empty a stage is refused before it is sent** — that is a cancellation, and `M2-BE-545` is
  Wave C5. `m2_policy_unavailable` renders as the honest owner-blocked refusal.
  **Revision 4** makes the A3 rule the product: the frozen rate is the published card's, and the
  add-on/overtime figures the server prices from are the card's published rates.
- [ ] `M2-FE-605` Build the Customer-caused delay claim with evidence and a schedule-extension request.
  `GAP-030`
- [ ] `M2-FE-606` Build digital deliverable handover for Event and Media, with Customer acceptance.
  `GAP-032`
- [~] `M2-FE-607` built — static gates green, owner manual verification pending. A null
  `payout_release_due_at` renders **"no release date is set"**, never a date. A vendor with no bank
  details is told the money is earned and recorded and cannot be paid yet — read from `GET
  /partner/payout-account/`, whose `404` is an answer rather than a fault. `LEAD_ONLY` says plainly
  that Vsolve holds none of it.

### Customer project workspace

- [~] `M2-FE-608` built — static gates green, owner manual verification pending. `/projects`, plus the workspace header on
  `/engagements/{id}`. Progress is counted in **stages, not rupees** — a money ratio reads 0% for a
  finished `LEAD_ONLY` job — and every money figure is a published running total. The 1.24.0
  `fundedTotalPaise` summing helper is deleted, not deprecated. Exactly one next action per row, and
  since Wave J that action names the right money: a `MATERIAL_ADVANCE` row reads "pay for the
  materials so the professional can buy them", never "fund the next stage to start it".
- [~] `M2-FE-609` built — static gates green, owner manual verification pending. `/engagements/{id}/stages/{stageId}`, its
  own route because it is reached from a notification and because approval releases money. What each
  of the three controls does to money is stated **before** it is pressed and again in the
  confirmation, and the sentence is derived from `commercial_mode`: the same approve command releases
  a held earning on A5 and moves nothing on A3. A null `review_due_at` renders **"no deadline is
  set"**, never time in hand. Disputing is presented as the action that stops the clock, because it
  is. **Evidence cannot be opened**: `object_key` is unpublished and no download route exists, so the
  viewer says so rather than offering a control that 404s (plan §7). Since Wave J the screen also
  reads **`EngagementStage.kind`** (1.26.0): on a `MATERIAL_ADVANCE` the evidence, approval and
  correction headings change — there is nothing to inspect for workmanship and nothing to approve the
  *quality* of — and the money panel states that material money is spent rather than earned, so it is
  not returned the way unfinished work is. **No control is removed**, because the server permits all
  three commands on a materials row and hiding the dispute would take away the Customer's only
  objection to a delivery that never arrived. An unrecognised kind offers **no funding control at
  all** and says why.
- [~] `M2-FE-610` built — static gates green, owner manual verification pending. A proposed amendment is drawn in its own
  block with a **"Requested — not agreed"** badge, is absent from the agreement totals and absent
  from the version history until the server stamps `applied_at`. The comparison is explicit — agreed
  now / this change / **if you accept** — with the third labelled as a projection, because nothing
  publishes a would-be total. A managed positive delta renders as **waiting with nothing to press**
  until the provider callback lands; an unrecognised status offers no action at all. Since Wave J the
  amendment list reads `m2QueryKeys.engagements.amendments(id)` on the `EXPIRING_STATE` tier the
  factory wrote for it, and no longer borrows `engagements.agreement(id)` — a live change request
  with a deadline and a money delta may not be served from a session-long cache, which is how a
  Customer approves a delta that expired an hour ago. `agreement` keeps `SESSION_STATE` for the
  immutable terms and nothing in this app reads amendments off it.
- [~] `M2-FE-611` built — static gates green, owner manual verification pending. Deliverable
  acceptance is its own act on `/engagements/{id}`, because "the files are fine" and "the project is
  finished" are two facts on two days — and the panel says out loud that the project **cannot close**
  while a delivery is unanswered, since that refusal is the whole mechanism keeping Event and Media
  delivery on the platform. A `FILE` deliverable **cannot be opened** (no download route for the
  evidence rail, plan §7) and the row is joined to the engagement's evidence to report what the
  record knows — checked, still scanning, rejected, or not found — because the Customer is being
  asked to *accept* it; a `LINK` says out loud that it is recorded rather than hosted. Completion
  now **names its blocker instead of offering a control that refuses**: an open stage, a disputed
  stage and an unaccepted handover are the server's three refusals and none of them is skippable
  from here — an accepted amendment can append work after `COMPLETING` and that stage keeps its own
  review. The status is **read from the response**, so `WARRANTY` is worded as "finished, warranty
  running" and never as closed. Retention is stated as **payout-side money** — every stage is funded
  at face value and what is held is how much of it the professional may draw — and as **building up
  cumulatively as stages are approved**, never "held back from the last one", because an amendment
  can append one. No retention renders as "Vsolve is holding nothing back", explicitly **not** as
  "you have no cover": the terms are the estimate's and this app was never given them. A null
  `warranty_ends_at` renders **"we do not have an end date on file"**, never a date. **Warranty
  issue reporting has no endpoint at 1.31.0** — `m2_stage_dispute` takes only `AWAITING_REVIEW` and
  by then every stage is settled — so the panel names the support route and what is still held,
  rather than a control that 404s (plan §7). `GAP-031`, `GAP-032`
- [~] `M2-FE-612` built — static gates green, owner manual verification pending. **Operations
  proposes and the Customer accepts** — there is no Customer-side initiation, because 07 §7 does not
  let either party change the other's agreement, so the built surface is the accept/decline of a
  proposed transfer and a plain explainer (no control) on a stalled project. **It is not a checkout
  and the screen says so**: accepting refunds what was funded and unearned, drops each unfinished
  milestone back to unfunded and reprices it, and the money asked for afterwards is the ordinary
  stage funding that was always coming — a screen that presented a transfer payment would be
  inventing a charge. Priced **per milestone, never as a lump**: the per-milestone table is joined
  from `stage_prices`, whose keys are the authoritative list of what transfers, and it **fails closed
  to the two published totals** rather than showing a shorter list of work. `delta_paise` is
  rendered, never subtracted — it is held equal by database constraint. A **cancelled material
  advance is not refunded and a cancelled work stage's unearned funding is**; the panel reads the
  kind and the published `cancellation_reason_code` and says the right one, rendering
  `material_advance_outstanding_paise` as an open question for support and **never as a pending
  refund**. Acceptance returning the engagement to `PENDING_START` with `work_may_start_at` cleared
  is stated as what it is: work restarts when the first milestone is funded again. `GAP-029`
- [~] `M2-FE-613` built — static gates green, owner manual verification pending. Version 0 is `total_paise`, which never
  moves; each applied amendment is a version, and the walked running total reconciles to the
  published `staged_total_paise` by database constraint. **The scope of each version is not
  published** — `Engagement` carries the proposal as a bare id with no snapshot — so each version
  carries its money and its change lines and the panel links to the quote rather than paraphrasing
  terms it was never given (plan §7).
- [~] `M2-FE-614` **built — static gates green, owner manual verification pending.** *(New row. This
  task did not exist: Wave A5P logged it in plan §7 as a plan gap rather than a contract gap —
  `m2_project_delay_claim_decide` is published as the **Customer's** command and
  `ProjectPlan.delay_claims` is published for them to read, and no wave owned the surface.)* Answer a
  professional's request for more time on a milestone. **Silence is a refusal by design** —
  `sweep_delay_claims` expires an unanswered claim and the agreed dates stand, so a vendor cannot
  move somebody's schedule by filing on a Friday afternoon — which only works as a protection if the
  Customer was actually asked. **Accepting moves this milestone and every one after it**, and the
  panel says so before the tap rather than after; a milestone with no date is left without one, and
  `original_terms` is untouched either way so the agreed date and the due date stay both readable.
  **No money on either answer, and none may be added:** the record has no amount by design, because a
  delay that costs money is extra work and extra work is an amendment the Customer accepts and pays
  for. Turning it down is stated as a real answer that cancels nothing and penalises nobody, because
  a Customer who reads "no" as a complaint will pick "yes" to avoid making one. Evidence is joined
  off the stage rail and worded exactly as the handover panel words it; an id with no record on this
  engagement is reported, never dropped.

**FE5B gate:** Neither party can mistake clarification, evidence upload or a proposed amendment for
approved scope, payment or stage completion, and an abandoned project shows a route to completion.

## FE6 - Operations, recovery and money visibility

### Unified Operations workspace

- [~] `M2-FE-701` **built — static gates green, owner manual verification pending.** `/operations/requests` renders C6’s eight published queues — depth, oldest member and the published `recovery_action`, with the empty string rendered as *a person decides this one* rather than a missing button — filtered by a free-text search over label, code and action, ordered deepest-then-oldest. **No queue is re-derived and no threshold is invented.** The contract enumerates no queue members, so the way into one request is a pasted requirement id, as on the manual-offer and assisted-checkout screens; logged in plan §7. Add searchable queues for unmatched, under-quoted, under-visited (plan slots
  unfilled, visit no-shows, estimates overdue), SLA-breached, vendor-unconfirmed,
  fulfilment-exception, safety-incident, disputed, refund-pending and payout-held requests.
- [~] `M2-FE-702` **built — static gates green, owner manual verification pending.** `/operations/requests/[requirementId]` renders all fifteen published event kinds from `m2_operations_request_timeline` in one feed, filterable by source. A **`WAIVED` booking fee renders as “replacement crew, no charge” with no amount beside it** (1.32.0 trap 3), and an unrecognised event kind renders loudly — raw type, warning tone, whole `detail` — rather than as a blank row. Build a unified request detail timeline spanning the requirement, snapshots, matching,
  questions, proposals, unlock, engagement, stages, cases and money.
- [~] `M2-FE-703` **built — static gates green, owner manual verification pending.** Only `REQUIREMENT_TRANSITION` and `OPERATIONS_TOUCH` publish an actor, and as a bare uuid. Every accountable row therefore shows the masked id **or the words “actor not published for this record” in the same place** — never an actor inferred from the event’s shape. “Source” is the aggregate the event came from. The per-request touch metric renders `within_budget: null` as **“no budget set”**, never as a pass or a breach (trap 4). Display actor, source, timestamp and reason for every privileged or commercial state
  transition.
- [~] `M2-FE-704` **built — static gates green, owner manual verification pending.** Rematch, deadline extension (**forward only**, 1–720 hours), reclassification (behind a consequence dialog) and refund review — each with a required reason, each writing the refreshed timeline back into the cache rather than racing a refetch, and each refusal rendered as a refusal. **Refund review has no amount field and will not get one.** Gated on the server’s published session projection via `OperationsShell` plus per-command server checks; no per-button permission map is invented, because the contract publishes a per-action grant list for Partners and none for Operations. Contact review, payout hold and escalation are Session A’s case surface. Build permission-gated actions for clarification, rematch, **reclassification**,
  deadline extension, contact review, payout hold and escalation. `GAP-006`
- [~] `M2-FE-705` **built — static gates green, owner manual verification pending.** `/operations/requests/[requirementId]/assisted-quote`: a six-step call script, a vendor picker built from the timeline’s own `VENDOR_INVITED` events (**not** filtered by status — that is `submit_proposal`’s rule), both composers (A3 rate×workers×days, A5 milestones against a completed site visit), and clarification capture. A captured quote renders as **“captured — awaiting the vendor’s own confirmation”** from the published `vendor_confirmed_at: null`, and a captured question as Operations-assisted from the published `asked_by_role: OPERATIONS` — never as an ordinary vendor question. Consent gates both buttons. Build assisted quote capture as a **primary A3 path** with a call script, visibly
  attributing the quote to the Partner and recording consent; Operations must not become the vendor.
  `SIM-10` **Revision 4:** primary for the quote-flow **fallback** only — on the rate-card path
  there is nothing to compose; the platform published the price.

### Cases, refunds and leakage review

- [~] `M2-FE-706` **built — static gates green, owner manual verification pending.** Build case intake
  and review for cancellation conflict, no-show, attendance, safety incident, stage, quality, payment
  and off-platform claims. `/operations/cases` re-mounted onto the M2 workspace (IA §3: the kinds join
  the existing route rather than forking a second case system); all fourteen kinds and all fourteen
  event kinds carry copy, keyed on the generated enums so the next widening is a `tsc` failure rather
  than a blank row; the subject is read from all five nullable fields. Evidence renders as a reference
  to an already-scanned rail — there is no uploader and no minted link.
- [~] `M2-FE-707` **built — static gates green, owner manual verification pending.** Every high-impact
  action states its consequence before it happens, through `ConfirmAction`: resolving names what the
  payout hold does, overturning an appeal says the case reopens and the hold returns, an override is
  typed-phrase confirmed and permanent. The *server's calculated remedy* is the one half that cannot
  be shown — Operations has no read of it (§7).
- [~] `M2-FE-708` **built — static gates green, owner manual verification pending.** Show refund and
  payout states from ledger-backed APIs. Read, never computed: the reconciliation aggregate, the
  payout-hold count from the case summary, and the money on one request from the timeline — where
  `WAIVED` renders as "replacement crew, no charge" and never as an amount paid. Recording a
  chargeback is the one money write 1.32.0 publishes.
- [~] `M2-FE-709` **built (Operations half) — static gates green, owner manual verification pending.**
  Dual-confirmation cancellation and its routing to review. The confirm-or-dispute itself is the
  parties' surface; what lands in Operations is the `CANCELLATION_CONFLICT` case, which freezes the
  vendor's unpaid earnings and settles nothing on silence. The cancellation record is unreadable by
  Operations at 1.32.0, so the panel names that gap rather than inferring it (§7).
- [~] `M2-FE-710` **built — static gates green, owner manual verification pending.** Off-platform
  claims and chargebacks as review signals with their evidence and history, ending in a documented
  finding and never an accusation. Slot squatting (`GAP-009`) and price-band clustering (`GAP-010`)
  have no published read at all and are rendered as named absences rather than approximated (§7).
- [~] `M2-FE-711` **built — static gates green, owner manual verification pending.** The
  touches-per-request measure, platform-wide and per request. `within_budget: null` renders as "no
  budget set" — neither a pass nor a breach — which is the whole point of the screen. `GAP-033`

### Rate cards (revision 4)

- [~] `M2-FE-712` **Revision 4.** **built — static gates green, owner manual verification pending.** `/operations/rate-cards`: the three components published and rendered **separately and never summed**, beside the two server-computed totals labelled as shown-not-added; effective-dated with an **empty-by-default** date field; grouped per city+skill with the live card named against the response’s own `server_now`. The floor refusal **names why** — which component, against which rule, and that raising the other two will not help — with `m2_wage_floor_unavailable` and the backdated-under-a-live-booking 409 given their own copy. The city is named from `/service-areas/`; **the skill cannot be, because no published read maps a skill to its uuid** (plan §7). **Revision 4.** Build rate-card publish and revise per city and skill: the three
  components (worker day-wage — never below the statutory floor, checked at publish; the lead's
  supervision margin; the platform booking fee), the printed inclusion list and the published add-on
  and overtime rates — effective-dated like `M2AccessPrice`, never backdated under a live booking.
- [~] `M2-FE-713` **Revision 4.** **built — static gates green, owner manual verification pending** — and it is the honest build rather than the asked-for one, because 1.32.0 publishes no read of the alarm at all** — no rate, no threshold, no window, no per-card reasons (plan §7). The panel states in those words that this console cannot tell you whether the alarm is armed, and `DeclineAlarmStatement.armed` is typed `false` so no later edit can render a green state over an unset owner threshold that means **no alarm can fire**. The backstop the task also names — the monthly review calendar — is real: cards ranked by how many days each price has stood, from published effective dates against the server’s clock. **Revision 4.** Build the decline-rate **alarm** view: a sustained decline rate
  above the configured threshold at a rate **pages Operations** to raise it — an alarm, not a report
  — with the per-card decline reasons behind it and the monthly review calendar as the backstop.

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

- [ ] `M2-FE-807` Add critical Playwright journeys for the A3 rate-card path (preset → cascade →
  lead accept → booking fee → engagement → attendance → day settled — revision 4), the A3 fallback
  (teaser to unlock, unlock payment pending), A5, vendor rejection/replacement, plan chooser to
  visit-plan checkout, visit no-show and unfilled-slot refund, on-site estimate to selection,
  non-responsive rejection, cancellation conflict, refund and Operations recovery. During the build
  sprint e2e is neither written nor run (build-first amendment); this lands at release.
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
