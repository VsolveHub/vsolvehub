# Session A — Customer application

**Application:** `frontend/apps/customer` (+ `frontend/apps/admin/features/m2-cases` from Wave 4)
**Rules of engagement:** [frontend-execution-plan.md](frontend-execution-plan.md) — read §2, §3, §4 before touching a file.
**Task detail:** [03-frontend-tasks.md](03-frontend-tasks.md) · **Master board:** [task.md](task.md)
**Paired session:** [frontend-session-b.md](frontend-session-b.md) — Partner + Operations. Do not edit their files.

## Kickoff prompt for this session

> You are Session A on the M2 frontend — the **Customer application**, `frontend/apps/customer`.
> Read `Django_Next.js_Plan/M2/frontend-execution-plan.md` first: §2 (what is and is not published,
> and what that caps), §3 (the file-ownership map and the frozen list) and §4 (repo setup). Then
> read `task.md` §"Verification convention" — you do not run tests. Then read this file,
> `frontend-session-a.md`, and work it wave by wave.
>
> **Where you are.** Wave A1 is 14 of 15 built. `features/requirement/` holds the full
> `contract-pending/ → model/ → adapters/ → view/` stack: the four screens, the reducer with its
> invalidation cascade, save-and-resume, the duplicate notice, the four optional-extra panels,
> `My requests`, the request timeline and the honest closure states. `pnpm lint` is clean at
> `--max-warnings 0`, `pnpm --filter customer typecheck` is green, and **592/592 customer tests pass**
> — 87 of them in `features/requirement/`, including a `SCREENS.length === 4` assertion that makes the
> flow-weight budget a build failure rather than a Markdown promise. Read the two "Wave A1 progress"
> sections below before writing anything: they record why each decision was made, and re-deriving them
> differently is how the flow drifts.
>
> **What is next, in this order — reordered after the 2026-08-12 audit.** Integration comes first,
> because everything you have built is currently unreachable by a user: `features/requirement/`
> contains **zero** `useQuery`, `app/(flow)/requirements/` does not exist, and the boundary guard
> still lists all three published paths. Building `FE-211` on top of that adds a fifteenth dark
> feature to a column that already has a whole flow in the dark.
>
> 1. Drop the stale entries from `features/booking/contract-pending/boundary.test.ts` — all three:
>    `/api/v1/requirements/` and `/api/v1/proposals/` are published, and `/api/v1/partner/workspaces/`
>    is not the Customer app's to call either way, so the entry is simply wrong now. A guard that is
>    wrong teaches people to ignore guards.
> 2. Write `packages/query/src/m2-requirement.ts` and the feature's query hooks against the generated
>    client. Copy the decisions in `apps/partner/features/workspace/queries.ts` rather than
>    re-deriving them: an unread answer is `null` and never `[]`, and a 401/403 is not retried.
> 3. Re-point the adapters. Three field shapes differ and all three are one-liners at the seam:
>    `flexibility_days` (int, the source of truth) beside `is_date_flexible`, `IMAGE` where you wrote
>    `PHOTO`, and `VERIFIED` where you wrote `CLEAN` — there is no `INFECTED` until the C1 upload
>    command lands.
> 4. Mount `app/(flow)/requirements/` and the `My requests` route, `force-dynamic` and
>    `robots: noindex`, exactly as Session B mounted its seven.
> 5. Then `FE-211`, which is now readable from server state.
>
> **Do not start Wave A2.** `FE-401..418` needs unlock, selection and reconfirmation, and those have
> no domain layer on the server at all — that is Wave C2, not a missing serializer. Finish Wave 1.
>
> **The constraint has changed.** Contract **1.21.0** now publishes the requirement surface — list,
> create, read, patch, submit, duplicate-check, timeline and quote teasers — and the generated client
> is in sync. Attachment upload, unlock, selection and everything in proposal 0013 are still
> unpublished; build those against the proposals and mount no query for them. **No mock or placeholder
> data anywhere in application code** still stands, permanently: fixtures live in tests only. Do not
> mount a route that cannot work — a reachable page that cannot function is the dead link `FE-810`
> forbids. A task reaches `[x]` only with integration evidence against real backend states; until
> then it is `[~] built`.
>
> **Boundaries.** Own `apps/customer/**`, `packages/query/src/m2-{requirement,quotes,engagement-customer}.ts`,
> `e2e/m2-customer-*.e2e.ts`, this file, and your own task ID lines in `03-frontend-tasks.md`. Never
> touch `apps/partner`, `apps/admin` before Wave 4, or anything on the frozen list — need a frozen
> file changed? Log it in execution plan §7 and keep building against the current shape. Do not add
> to `packages/ui` mid-wave; build it under `features/<area>/view/` and request promotion at a gate.
> Never `git add -A`.
>
> Every screen ships loading, empty, validation, pending, offline/retry, forbidden and server-error
> states — a screen without its exception states is not `[~] built`.
>
> **Do not run tests. Any tests. Ever.** Not `vitest`, not a single file, not Playwright. You still
> **write** them to the same standard — an unwritten test is a gap and you record it as one — but the
> owner runs every one. Your gates are `pnpm lint --max-warnings 0`, `pnpm --filter customer
> typecheck` and, at a wave gate, `pnpm build --filter=customer`. Report `[~] built — owner
> verification pending` and end each report with the test files you wrote and the exact command to
> run them. Never write "N/N pass" for a run that did not happen. See [task.md](task.md)
> §"Verification convention". Commit at the wave gate, not per task. Never push to `main`.

## Standing constraints

- **Owned paths only:** `apps/customer/**`, `packages/query/src/m2-{requirement,quotes,engagement-customer}.ts`,
  `e2e/m2-customer-*.e2e.ts`, this file, and your own task ID lines in `03-frontend-tasks.md`.
- **Frozen:** `m2-keys.ts`, `freshness.ts`, `errors.ts`, `error-presentation.ts`, `packages/ui/**`,
  `packages/api-client/src/generated/**`. Need a change? Log it in the execution plan §7 and keep going.
- **Barrel:** append exports only inside `// --- M2 customer surface (session A) ---`.
- **No mock or placeholder data in application code.** Real loading state, then real error state.
- **Flow-weight budget is a hard constraint, not a target:** requirement submission is 4 screens; the
  review screen *is* the confirmation; A3 has one payment before work, A5 has two.
- Every screen ships loading, empty, validation, pending, offline/retry, forbidden and server-error
  states. A screen without its exception states is not `[~] built`.

---

## Wave A1 — Customer requirement (free) and tracking

**Depends on:** Gate 0. **Blocks:** nothing in Session B.
**Gate:** a Customer submits a rich mobile requirement in four screens, pays nothing, and understands
exactly when and whether they will be asked to pay.

### Four-screen guided requirement

- [~] `M2-FE-201` Category-first entry that says in plain language whether they are hiring workers for
  a period or commissioning a defined outcome — without asking them to pick an archetype.
- [~] `M2-FE-202` Screen 1 `What`: service, scale, and the answers the backend infers lifecycle from.
- [~] `M2-FE-203` Screen 2 `Where/When`: location, dates, flexibility, hard `service_by` date.
- [~] `M2-FE-204` Screen 3 `Details`: photos, short video, documents, voice note — preview, upload
  progress, retry, remove, privacy guidance, failure handling.
- [~] `M2-FE-205` Voice as a first-class fast path ("record 30 seconds instead of answering
  questions") beside the structured questions; capture the language.
- [~] `M2-FE-206` Screen 4 `Review` as the single confirmation. Submit happens here. No second
  immutable-version confirmation step.
- [~] `M2-FE-207` Callback preference, site-visit interest, access constraints and preferred
  communication as optional entry points reachable **from** review — not extra steps.
- [~] `M2-FE-208` Optional additional-details text field, secondary to structured answers and voice.
- [~] `M2-FE-209` Save-and-resume, step validation, back navigation.
- [~] `M2-FE-210` Probable-duplicate warning with a merge option before a second requirement is created.
- [ ] `M2-FE-211` Explain when an edit after vendor acceptance notifies vendors and resets deadlines;
  explicit confirmation for material edits.
- [~] `M2-FE-212` State on submission that the requirement is free and nothing is charged until quotes arrive.

### Customer tracking

- [~] `M2-FE-213` `My requests`: matching status, quote teaser count, delivery deadline, latest
  activity, support action.
- [~] `M2-FE-214` Request detail timeline: requirement, matching, invitations **at aggregate level**,
  questions, site visits, quote delivery, recovery.
- [~] `M2-FE-215` Honest empty, no-supply, delayed-match, SLA-breached and service-by-expired states.
  A truthful next step and no fabricated progress.

**Evidence to record:** screen count proof for the 4-screen budget, upload failure/retry behaviour,
duplicate-merge path, expired-requirement state.

---

## Wave A2 — Teasers, unlock, selection and engagement

**Depends on:** A1. **Gate:** money is only ever requested against visible delivered value.

### Teasers and unlock

- [ ] `M2-FE-401` Quote **teasers**: verification badge, rating, vendor type, headline price band.
  No full scope, no vendor identity, no contact.
- [ ] `M2-FE-402` The INR 149 unlock presented against visible delivered value — what it unlocks, and
  that it is charged once.
- [ ] `M2-FE-403` Checkout on the server-created payment order; UPI pending, failed, cancelled, late
  success and browser-close recovery all handled truthfully.
- [ ] `M2-FE-404` Never show success from the payment redirect alone. Resolve final status from the
  backend; safe retry with no duplicate purchase.
- [ ] `M2-FE-405` Out-of-budget quotes marked as such, not presented as ordinary options.
- [ ] `M2-FE-406` Non-responsive rejection: reason, remaining rejection allowance, the replacement it triggers.

### Comparison and selection

- [ ] `M2-FE-407` Each unlocked quote: verification summary, validity, scope, schedule, taxes,
  commission treatment, total, exclusions.
- [ ] `M2-FE-408` Accessible comparison view normalising equivalent fields on the single tax basis,
  while clearly showing non-equivalent assumptions.
- [ ] `M2-FE-409` Clarification and revision requests that cannot edit vendor prices or agreement fields.
- [ ] `M2-FE-410` Selection references a specific proposal; final scope/cost summary before confirmation.
- [ ] `M2-FE-411` Vendor reconfirmation shown as a **pending state, not a confirmed booking**.
- [ ] `M2-FE-412` Vendor decline or timeout guides to another unlocked quote or a free replacement —
  no lost history, no second charge.
- [ ] `M2-FE-413` One-tap re-validation when a quote's validity expires, reusing the existing unlock.
- [ ] `M2-FE-414` Prevent double selection; recover from stale-proposal and concurrent-action errors.

### Engagement entry

- [ ] `M2-FE-415` A3: direct-payment responsibility and limited Vsolve protection shown before
  connection completes. Never presented as a protected booking.
- [ ] `M2-FE-416` A5: stages, funding schedule, commission/tax presentation, cancellation terms and
  protection shown before the first stage checkout.
- [ ] `M2-FE-417` Stage-payment pending, failed, retry and late success without creating a false
  confirmed engagement.
- [ ] `M2-FE-418` Durable agreement, receipt/invoice and timeline access for both parties.

**Evidence to record:** payment-pending and late-success traces, duplicate-unlock prevention, the
teaser field list proving no identity leaks pre-unlock.

---

## Wave A3 — Customer fulfilment (A3 bookings and A5 projects)

**Depends on:** A2. **Watch:** Session B builds the partner half of the same spine this wave. Read
[07-state-machines-and-permissions.md](07-state-machines-and-permissions.md) as the authority for
state names and permitted actions — do not name a state from what your screen calls it.

### Workforce booking (A3)

- [ ] `M2-FE-509` `My bookings`: schedule, agreed crew composition, permitted identity summary,
  contact rules, direct-payment reminder, next action.
- [ ] `M2-FE-510` Confirm or dispute the day's attendance in **one tap**. Per-worker detail captured
  only inside the dispute flow.
- [ ] `M2-FE-511` Acknowledge crew changes, approve/reject time extensions, confirm completion or open
  an issue inside the documented window.
- [ ] `M2-FE-512` Partial service, replacement, refund, dispute and closure in one chronological timeline.

### Project workspace (A5)

- [ ] `M2-FE-608` `My projects`: overall progress, active stage, funded amount, next action, issue status.
- [ ] `M2-FE-609` Stage review: evidence viewer, approve, request clarification, dispute.
- [ ] `M2-FE-610` Amendment comparison against the current agreement; explicit acceptance plus
  additional payment or refund handling.
- [ ] `M2-FE-611` Deliverable acceptance, project completion, warranty issue reporting — with clear
  deadlines and the retention release date.
- [ ] `M2-FE-612` Vendor-replacement path if a project is abandoned: what is funded, what transfers,
  what the price difference is.
- [ ] `M2-FE-613` Original and amended agreement versions preserved in a readable history.

**Evidence to record:** the one-tap attendance path (count the taps), that clarification and evidence
upload can never read as approved scope or completed stage.

---

## Wave A4 — Operations: cases, refunds and leakage review

**Depends on:** A3 and Gate 3. **Folder:** `frontend/apps/admin/features/m2-cases/**` — yours alone.
Route files under `app/operations/**` belong to Session B; hand them your route needs at Gate 4.

- [ ] `M2-FE-706` Case intake and review: cancellation conflict, no-show, attendance, safety incident,
  stage, quality, payment, off-platform claims.
- [ ] `M2-FE-707` Reason, evidence and confirmation before high-impact actions; show the server's
  calculated remedy before authorized confirmation.
- [ ] `M2-FE-708` Refund and payout states from ledger-backed APIs: pending, failed, reversed, reconciled.
- [ ] `M2-FE-709` Dual-confirmation cancellation after contact disclosure; disagreement routes to review.
- [ ] `M2-FE-710` Leakage, slot-squatting and price-band indicators as **review signals with evidence
  and history** — never an automatic guilt label.
- [ ] `M2-FE-711` Surface the Operations-touches-per-request measure so the design can be checked
  against the approved unit economics.

---

## Wave A5 — Customer-app quality (runs alongside Wave 5)

- [ ] `M2-FE-802` (customer share) WCAG 2.2 AA across the requirement form, uploader, timeline, quote
  comparison and payment state announcements.
- [ ] `M2-FE-803` (customer share) Small mobile, large mobile, tablet, desktop.
- [ ] `M2-FE-804` (customer share) Slow network, offline transition, timeout, duplicate click, refresh
  and back navigation for every financial or state-changing flow.
- [ ] `M2-FE-807` (customer journeys) A3 and A5 happy paths, teaser→unlock, unlock payment pending,
  non-responsive rejection, cancellation conflict, refund.
- [ ] `M2-FE-808` (customer share) Long content, empty and exception state coverage.

Per the standing preference: no routine full-matrix Playwright runs. Focused specs plus typecheck and
lint during the waves; the browser suite runs once at the wave gate.

---

## Session A tracker

| Wave | Scope | Built `[~]` | Integrated `[x]` | Evidence |
|---|---|---|---|---|
| A1 | `FE-201..215` | `[~]` 15 of 15 | `[ ]` | Four screens, duplicate notice, the four optional panels, `My requests`, the timeline, the honest closure states and `FE-211`. **Wired and reachable** — 4 routes, queries against the generated client, guard retired. Owner verification pending; see the 2026-08-12 wiring section. |
| A2 | `FE-401..418` | `[ ]` | `[ ]` | |
| A3 | `FE-509..512`, `FE-608..613` | `[ ]` | `[ ]` | |
| A4 | `FE-706..711` | `[ ]` | `[ ]` | |
| A5 | quality share | `[ ]` | `[ ]` | |

### Wave A1 progress — 2026-08-10

**Built (model and type layers, no screens yet).** `features/requirement/` follows the existing
`features/booking/` layering exactly — `contract-pending/` → `model/` → `adapters/` → `view/` — rather
than inventing a second convention for the same problem:

- `contract-pending/README.md` + `types.ts` — the proposal-0012 requirement surface as wire-shaped
  types: draft, attachment + scan status, duplicate, submitted, summary, timeline. Quarantined; the
  view layer may never import them.
- `model/screens.ts` — the four-screen sequence as a closed constant with `SCREEN_BUDGET = 4`, so a
  fifth screen has to be an argument somebody makes rather than a file somebody adds. `OPTIONAL_DETAILS`
  models the four `FLOW-02` extras as data reachable from review, never as steps.
- `model/state.ts` — the draft reducer state and every guard: required answers (server-owned, never
  recomputed), address, `service_by` in the future, in-flight and failed attachments, unresolved
  duplicate, and the re-asserted submit guard on review. Back navigation to any visited screen is
  lossless; forward jumps are refused.
- The app-wide boundary guard in `features/booking/contract-pending/boundary.test.ts` now registers
  `/api/v1/requirements/`, `/api/v1/partner/workspaces/` and `/api/v1/proposals/` as unpublished, so a
  request to any of them fails the build today. **7/7 boundary tests pass.**

**Built (screens).** `model/machine.ts`, `adapters/index.ts` and the `view/` layer:

- `machine.ts` — the reducer. Its load-bearing rule is the invalidation cascade: **changing an answer
  clears the verdict it produced.** The server's lifecycle sentence and its `missingRequiredAnswers`
  are both derived from the exact answer set that was sent, and `missingRequiredAnswers` is what the
  "Next" guard reads — so keeping it across an edit would gate the Customer on a question set that may
  no longer apply. Same discipline as the M1 booking machine.
- `requirement-context.tsx` — one reducer for all four screens, so back is a *screen change* rather
  than a navigation and nothing is lost or refetched. Save-and-resume through `sessionStorage`, Customer
  intent only: no verdict (a stale server reading), no requirement id (a restored tab could patch a
  draft submitted elsewhere), no attachment (a dead `File` handle). `FE-209`.
- `what-screen.tsx` — `FE-201`, `FE-202`. Questions come from the server; the archetype is never
  rendered, only the server's plain-language sentence, in a polite live region.
- `where-when-screen.tsx` — `FE-203`. The `service_by` consequence is written into the field's own
  description, because a Customer who reads it as a preference will have their request closed on that
  date. Flexibility is a separate control so it cannot extend the expiry.
- `details-screen.tsx` — `FE-204`, `FE-205`, `FE-208`. Voice leads the screen as an equal option.
- `review-screen.tsx` — `FE-206`, `FE-212`. Review *is* the confirmation; the workspace deliberately
  renders no "Next" on the final screen so a second confirm cannot appear beside it. `isFree` is read
  from the server, and until it can answer the screen says nothing about price at all.
- `duplicate-notice.tsx` — `FE-210`. Offers a merge, does not block; the override is explicit.
- `requirement-workspace.tsx` — Stepper, back, and one forward control. The button is disabled **and**
  the block reason is stated; a disabled control with no explanation is how a form dead-ends someone.

**Verified:** `pnpm lint` clean at `--max-warnings 0`; `pnpm typecheck` green across all 9 packages;
**11/11 boundary tests pass** (4 new + 7 existing). The new suite includes a `SCREENS.length === 4`
assertion, so the flow-weight budget is enforced by the build rather than by a Markdown table.

**Not built yet:**

- `FE-211` — material-edit-after-acceptance confirmation. Needs the requirement's server state to know
  whether a vendor has accepted. **Unblocked as of contract 1.21.0** — see the note below.
- **No route is mounted.** `app/(flow)/requirements/` does not exist. The feature is complete enough to
  mount, and the contract has now landed; mounting is the first integration step, not a build one.

**Standing:** no query is mounted and no fixture exists in application code. Nothing here exceeds
`[~] built`, per the execution plan §2.

### Wave A1 progress — 2026-08-11 · `FE-207` and `FE-213..215`

`pnpm lint` clean at `--max-warnings 0`; `pnpm --filter customer typecheck` green; **592/592 customer
tests pass**, of which 87 are in `features/requirement/` (44 new this pass). Still `[~] built`: no
query is mounted and every fixture lives in a `.test` file.

**`FE-207` — the four optional extras now have forms behind them.** The entry points existed; the
panels did not, and an entry point to an empty room is not an option a Customer has.

- `model/optional-details.ts` — the value shapes, defaults, normalisers and one validation rule.
  Every read is normalised because the bag round-trips through `sessionStorage`, so what comes back is
  whatever was in storage; an unnormalised cast puts `undefined` into a control's `value` and turns it
  uncontrolled on the first keystroke. Falls back **field by field**, so one bad key does not lose a
  page of typed access notes.
- `isOptionalDetailSet` is stricter than "the key exists". Three of the four panels open on a default,
  and reporting that default back on the review row would be the screen telling the Customer they
  asked for a call they never asked for.
- **One validation rule, and it earns its place.** "Entry is restricted to certain hours" without
  *which* hours is worse than silence: a vendor prices a constraint they cannot plan around, then
  arrives outside it. It is the only optional field that can block submit, and only for someone who
  opened the panel — leaving all four alone can never reach it.
- `view/block-copy.ts` is new because review has no "Next" for the workspace to explain, so the
  disabled-*and*-explained pairing had to be repeated on the submit control. Review was the one screen
  where a Customer could dead-end with nothing to read.
- Optional details now persist through save-and-resume (`RESTORE_INTENT`, `PersistedIntent`), with the
  key optional on the way *in* so a draft written by an older build still restores.

**`FE-213..215` — tracking.** Presentational, taking what a query would give them, so integration is a
call site rather than a rewrite:

- `model/request-state.ts` — `MATCHING_DELAYED`, the only derived state and the reason the module
  exists. When the quote-delivery deadline passes and the requirement is still `MATCHING`, "Finding
  professionals" is the fabricated progress `FE-215` forbids, and "SLA breached" asserts a server
  transition with a refund attached that nobody authorised. The third thing is the honest one.
- `model/timeline.ts` — the event kinds this build has copy for, re-declared so the server's list can
  grow without this one changing.
- `adapters/` — `toRequestRow` now carries the status as a **code**; the old version mapped it to a
  sentence, which put customer copy in the adapter and flattened away the status-plus-deadline pair
  `FE-215` turns on. `toTimelineEvents` sorts oldest-first rather than trusting wire order.
- **`DETAIL_ALLOWLIST` is the privacy rule, enforced rather than trusted.** `MATCHING_WAVE_SENT`
  permits exactly one key and it is a count. The serializer is supposed to withhold identities too;
  the allowlist is what happens when it stops. An unrecognised event type carries **no** detail at all.
- `view/request-state.tsx` — one copy table read by the list row and the detail, so a Customer never
  sees two explanations of one request. Five closures read differently on purpose.
- `view/requests-list.tsx`, `view/request-timeline.tsx`, `view/request-detail.tsx` — loading, empty,
  offline/retry, forbidden and server-error all arrive through `categorizeError` + `describeError`.
  Forbidden fails closed. A failed read with rows already on screen keeps them and says they are stale.
  On the detail the header and the timeline fail **separately**, so a timeline that will not load
  cannot hide that the request closed and a refund is owed.

**Evidence recorded:** four-screen budget still asserted by the build (`SCREENS.length === 4`, plus a
component test that the four panels add no screen); the delayed-match state proved to claim neither a
breach nor a refund; the allowlist proved to drop `vendor_names`, `vendor_ids` and `vendor_phone` from
a `MATCHING_WAVE_SENT` event; unknown event types proved to render as a dated row with empty detail.

### The contract published mid-wave — 2026-08-11

Verified independently, not taken from the log: `contracts/openapi/v1.yaml` is at **1.21.0** and
publishes `/api/v1/requirements/` (list, create, read, patch), `/submit/`, `/duplicate-check/`,
`/timeline/`, `/quotes/teasers/`, `/questions/{id}/answer/`, plus `/partner/workspaces/` and the
proposal paths. `packages/api-client/src/generated/schema.d.ts` is in sync.

Everything above was built against proposal 0012 and that was still the right call — the seam holds,
and integration is the re-point §2 describes. What changes now:

- `FE-211` is **no longer blocked**. The requirement's server state is readable.
- `apps/customer/features/booking/contract-pending/boundary.test.ts` lines 71–73 are stale. They are
  deliberately left in place until the route is mounted: removing the guard first would lower the bar
  without raising anything.
- Three field shapes differ from `contract-pending/types.ts` (`flexibility_days`, `IMAGE` for `PHOTO`,
  `VERIFIED` for `CLEAN` with no `INFECTED` yet). All adapter one-liners.
- Attachment upload is **not** published (deferred to Wave C1), so `FE-204`'s uploader integrates
  later than the rest of the flow.

### Blocked / handed off

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| 2026-08-10 | `FE-201..206` | Resolved — screens built. | n/a |
| 2026-08-11 | `FE-207` | Nothing. Built against client-owned shapes; no wire field exists for the four extras. | yes — contract gap |
| 2026-08-11 | `FE-211` | Unblocked by contract 1.21.0. Not started. | n/a |
| 2026-08-11 | `FE-204` uploader | `POST /requirements/{id}/attachments/` deferred to Wave C1. Built; integrates later than the rest. | n/a |

### Audit note — 2026-08-12

Re-checked against the codebase. Nothing above is overstated; the caveat is that **none of it is
reachable**. `features/requirement/` contains 17 source files and zero `useQuery`;
`grep -rn "useQuery" features/requirement/` returns nothing outside tests, `app/(flow)/requirements/`
does not exist, and the boundary guard still lists all three published paths.

Session B faced the same situation on 11 August and closed it in one pass — endpoint wired, guard
entry retired under its own rule, routes mounted. **This column's next task is the same move, and it
is blocked on nothing:**

1. Drop `/api/v1/requirements/` and `/api/v1/proposals/` from `UNPUBLISHED_PATHS` in
   `features/booking/contract-pending/boundary.test.ts`. Leave `/api/v1/checkout-sessions/`, and drop
   `/api/v1/partner/workspaces/` too — the Customer app has no business calling it either way, but
   the entry is now factually wrong and a wrong guard teaches people to ignore guards.
2. Add `features/requirement/queries.ts` against the generated client, following
   `apps/partner/features/workspace/queries.ts` — in particular its `null`-not-`[]` rule for an
   unread answer, and its decision not to retry a 401/403.
3. Mount `app/(flow)/requirements/` and `app/(flow)/requests/`, `force-dynamic` and
   `robots: noindex`, as Session B did for its seven.
4. Apply the three adapter one-liners (`flexibility_days`, `IMAGE`, `VERIFIED`) at the seam.
5. `FE-211` — now readable from server state, still not started.

Until step 3 lands, Wave A2 should not be started: `FE-401..418` has no domain layer on the server
(Wave C2), so starting it would add more dark code to a column that already has a flow's worth.

> **Closed 2026-08-12.** All five steps done. The audit note is left in place because it is the
> record of how a whole wave came to be finished and invisible, and the answer — mount it before
> building the fifteenth thing — is the part worth keeping.

### Wave A1 wiring — 2026-08-12 · the flow is reachable

`pnpm lint` clean at `--max-warnings 0`; `pnpm typecheck` **9 of 9 green** at contract 1.21.0;
`pnpm build --filter=customer` green with **four new dynamic routes**. **No tests were run** — per
[task.md](task.md) §"Verification convention" they are written and the owner runs them. The files
and the command are in the report and in that file's owner-verification queue.

**Four routes, and the flow is no longer dark.**

| Route | What it is | Rendering |
|---|---|---|
| `/requests` | `My requests` — `FE-213`, `FE-215` | `force-dynamic`, `robots: noindex`, `loading.tsx` + `error.tsx` |
| `/requests/[requirementId]` | The request, its timeline and `FE-211` | `force-dynamic`, `robots: noindex` |
| `/requests/new` | Category-first entry — `FE-201`, `?category=` as its second state | `force-dynamic`, `robots: noindex` |
| `/requests/new/[service]` | The four screens — `FE-202..212` | `force-dynamic`, `robots: noindex` |

`app/(flow)/requests/layout.tsx` gates the whole tree with `CustomerShell`, including `/requests/new`
— unlike `/cart`, deliberately. The anonymous cart is a product decision; a requirement is filed
against a Customer and goes out to named professionals, and `POST /requirements/` is
`IsAuthenticated`. Letting somebody fill in four screens and discover that at the end is worse than
asking first.

**The guard was retired under its own rule.** `features/booking/contract-pending/boundary.test.ts`
lost all three M2 entries. `/api/v1/requirements/` and `/api/v1/proposals/` are published and the
first is now reached through the generated client, which is exactly the condition the file's own note
sets for deleting an entry; `/api/v1/partner/workspaces/` was never this app's to call and had
stopped being a rule. Attachment upload is genuinely still absent and is deliberately **not** listed
in its place — the raw-fetch rule and the generated client's own types already cover it, and a bare
`/attachments/` entry would fail the build on any comment that named the path, which is how a guard
starts being worked around.

**`contract-pending/` is gone, and its rule is not.** The README's own deletion instructions ended
with "delete this directory", and the adapters no longer import it. What replaced it is
`features/requirement/boundary.test.ts`: `view/` and `model/` may not name the generated client,
through either `@vsolve/api-client` or the aliases `@vsolve/query` now re-exports. That was always
the real rule — the quarantine was about the wire shape reaching a component, not about the endpoint
being unpublished — and it is easier to break now that the types are two imports away in every file
rather than behind a directory named after a warning. The `SCREENS.length === 4` assertion moved
across unchanged.

**The seam held.** Not one component under `view/` changed to make the queries work, except where a
*contract fact* forced it (below). `requirement-flow.tsx` is the whole integration and it holds no
copy, no layout and no validation rule — only when to write and what to do with the answer. Four
writes for four screens, each on the way forward and each *before* the screen changes, so a failed
save leaves the Customer looking at the field it was about.

**Three field shapes re-pointed, as the handover said, plus two it did not mention.**

| Was | Is | Where |
|---|---|---|
| `is_date_flexible: boolean` | `flexibility_days: number` | Read via the server's own derived boolean; written through `flexibilityDaysFor` |
| `PHOTO` | `IMAGE` | The model's union renamed — those values are *bound for* the wire enum |
| `CLEAN` / `INFECTED` | `VERIFIED`, and no `INFECTED` | `toServerAttachmentItems`; anything unrecognised fails **closed** |
| — | `answers` and `detail` arrive as `unknown` | Narrowed in the adapter; a non-object reads as empty rather than reaching the reducer |
| — | `size_bytes`, and **no `file_name` at all** | A stored attachment is named by what it is. Inventing `document-3.pdf` would be worse than "Document" |

`FLEXIBLE_WINDOW_DAYS = 3` is the one value in this feature that is neither the Customer's nor the
server's: the wire wants an integer and screen 2 asks a yes/no question, deliberately, because "how
many days" is not answerable about an unscoped job. Three is what "a few days" means in the copy the
Customer reads, and it is named in the adapter so that if either the copy or the contract changes,
the other is visible in the same file.

**One field was missing from a screen, and it would have been invisible until a real submit.**
`_assert_submittable` refuses a requirement with no `requested_start` ("when it should start") and
`find_probable_duplicate` matches within ±3 days of it — so `GAP-004` could not work either.
`M2-FE-203` always said "dates", plural; the built screen had one of them. Screen 2 now asks for a
start **day**, encoded to the start of the Customer's local day at the seam, with a guard for a
needed-by date that precedes it. Four new `BlockReason` codes, one shared `blockedDates` helper read
by both the screen-2 guard and the submit guard on review.

**`FE-211` — built, and half of it is deliberately unmounted.** `update_draft` raises
`RequirementLockedError` for anything that is not `DRAFT` and no route amends a submitted
requirement, so the *action* does not exist. `view/material-edit-notice.tsx` states the consequence
before anything is offered — everyone who was asked is told, and their reply deadline restarts — and
separates a material edit from a correction so the warning stays credible. `onConfirmEdit` is the
seam and the request detail does not supply it, so a vendor-visible request shows the explanation and
the route to support rather than collecting a confirmation that would reach a 409. A confirmation
wired to a command that refuses is worse than none: it teaches a Customer that confirming does
nothing. When the amend command publishes, the route passes one prop.

**Two things the flow cannot do, said out loud rather than faked.**

- **Attachments and the voice note.** `onAttachFiles` is now nullable like `onRecordVoice`, and both
  are null. Screen 3 says attaching is not available yet and points at the text field that works. A
  greyed-out "Add files" would leave the Customer guessing whether it was them or us; a control that
  opens a picker and drops the file would be worse.
- **The merge.** No merge endpoint exists in 1.21.0 or in 0012, though `merge_duplicate_requirement`
  is in the invalidation table. The duplicate notice links to the request that already exists — which
  is where the Customer would go to decide anyway — instead of a button labelled "Add to this one"
  over an action nothing performs. They would otherwise believe the two were joined and stop watching
  one of them.

**`M2-FE-212` lands one moment later than the task wants, and the reason is on the screen.**
`is_free` exists only on the submit *response*, so before the Customer presses Send the server has
not said it. Review therefore says nothing about price — its documented honest state — and
`view/requirement-sent.tsx` makes the promise from the server's own field. That panel is not a fifth
screen: `SCREENS` is four and the budget is on the form, and this is the outcome of a command. It
also refuses to invent a delivery window when the server carries no deadline, which is a real answer
— an area with no open hours carries no promise.

**The list read does not match its own schema, and that is absorbed in one named function.**
`m2_requirement_list` declares `RequirementSummary[]`; `RequirementCollectionView.get` returns a
cursor envelope. Found from the view, and Session B logged the identical defect on the enquiry list
the same day from the opposite end — two columns, one bug, no type check on either side.
`readRequirementList` accepts both shapes; its envelope branch is marked for deletion when the schema
is corrected. It is the one place in this wave where a server defect is compensated in the client,
and it was taken because the alternative was mounting `My requests` in a state that provably cannot
work.

**Eleven rows added to the execution plan §7.** The two worth reading first: **no merge endpoint**,
and **the two question schemas** — screen 1 renders `catalog.ServiceQuestion` (the same source the A1
booking workspace uses) while `submit_requirement` validates against `M2VariantConfiguration.
question_schema`, which nothing publishes. Their kind vocabularies differ, `validate_scope` refuses
an unknown code, and a mismatch is invisible until the Customer presses Send on screen 4. The same
split exists in A1, so it is a pre-existing convention rather than a new defect — it is materially
worse here because this flow is four screens long. `MULTIPLE_CHOICE` cannot be answered at all under
that validator, so `toQuestionSet` reports it and screen 1 says the service is not fully set up
rather than rendering a dead end.

**Tests written, not run.** `packages/query/src/m2-requirement.test.ts`,
`features/requirement/queries.test.tsx`, `features/requirement/model/state.test.ts`,
`features/requirement/adapters/draft.test.ts`, `features/requirement/adapters/tracking.test.ts`
(rewritten), `features/requirement/boundary.test.ts` (replaces the quarantine's),
`features/requirement/view/material-edit-notice.test.tsx`,
`view/duplicate-notice.test.tsx`, `view/requirement-sent.test.tsx`, and
`e2e/m2-customer-requirement.e2e.ts` with `e2e/support/requirement-api.ts`.

The e2e spec covers `/requests` and `/requests/{id}` and **not the four-screen flow**: its catalog
reads happen during a server render, where `page.route` cannot reach. Faking them would need a second
stand-in that proves nothing about either half. That belongs in `django.e2e.ts` against a real
backend and is an open gap, stated in the spec's own header rather than left as a silent absence.
