# M2 Frontend Execution Plan — parallel and sequential split

**Owner:** Claude
**Purpose:** run the M2 frontend as **two concurrent sessions without file conflicts**, and make the
sequential spine explicit so nothing is started before the thing it depends on exists.
**Source of tasks:** [03-frontend-tasks.md](03-frontend-tasks.md) — task IDs are not re-issued here.
**Master status:** [task.md](task.md)

| File | Who reads it |
|---|---|
| This file | Both sessions + whoever integrates. Ownership map, conflict rules, sync gates. |
| [frontend-session-a.md](frontend-session-a.md) | **Session A — Customer application** |
| [frontend-session-b.md](frontend-session-b.md) | **Session B — Partner + Operations applications** |

---

## 1. The one thing that is actually sequential

Everything else is a false dependency. The real spine is:

```text
Wave 0  FE0 foundation (M2-FE-001..011)          <- SINGLE SESSION. Blocks everything.
          |
          +---------------------------+
          |                           |
Wave 1-4  Session A (Customer)        Session B (Partner + Operations)
          |                           |
          +---------------------------+
          |
Wave 5   Cross-app release (M2-FE-801, 805, 806, 809, 810, 811)  <- SINGLE SESSION again.
```

**Wave 0 cannot be parallelised.** It writes the shared files — query keys, error table, workspace
grants, shared components, analytics names, the contract proposal. Two sessions editing those at once
is exactly the conflict this plan exists to prevent. It is in flight now; the fan-out starts when its
gate passes (§6).

**Wave 5 cannot be parallelised.** It is cross-app by definition: one permission matrix, one redaction
pass, one flow-weight audit, one CI gate, one feature-flag surface.

Between them, Session A and Session B share **no source file**. The split is by application:

| | Session A | Session B |
|---|---|---|
| Application | `frontend/apps/customer` | `frontend/apps/partner`, `frontend/apps/admin` |
| Task groups | FE2, FE4, FE5A-customer, FE5B-customer, FE6-cases | FE1, FE3, FE5A-partner, FE5B-partner, FE6-queues |
| Task count | 49 | 48 |

---

## 2. Contract reality — partially published since 11 August 2026

> **Superseded premise.** This section used to read "there is no backend HTTP surface". That was
> true until Wave C0 landed. It is no longer. Kept as a heading rather than deleted because the
> two-state tracking rule below is still how every task is marked.

`contracts/openapi/v1.yaml` is at **1.22.0 and carries 33 M2 paths.** Wave C0 published 17 on
11 August — requirement capture, quote teasers, clarification, Partner enquiries, proposals and
`GET /partner/workspaces/`. **Wave C1 published 16 more on 12 August:**

| Newly live at 1.22.0 | Paths | Unblocks |
|---|---|---|
| Attachments | `POST /requirements/{id}/attachments/uploads/`, `POST /requirements/{id}/attachments/`, `DELETE /requirements/{id}/attachments/{attachment_id}/` | `M2-FE-205` upload path; `scanStatus` now really carries `INFECTED` |
| Site visits | `POST /site-visits/{id}/schedule/`, `POST /site-visits/{id}/complete/` | `M2-FE-306` |
| Business identity | `GET` / `PUT /partner/business-profile/` | `M2-FE-103` |
| Capabilities | `GET /partner/capability-options/`, `GET` / `POST /partner/capabilities/`, `POST /partner/capabilities/{id}/withdraw/` | `M2-FE-104`, `M2-FE-109` |
| Insurance | `GET` / `PUT /partner/insurance/` | `M2-FE-106` |
| Gates | `GET /partner/gates/` | `M2-FE-102` |
| Crew | `GET` / `POST /partner/crew/`, `PATCH` and `archive` per membership | `M2-FE-107` |
| Masked demand | `GET /partner/demand-preview/` | `M2-FE-101` |

**Both sessions must run `pnpm contract:generate` before anything else.** The committed
`packages/api-client/src/generated/schema.d.ts` is at 1.21.0, so `contract:check` fails until it is
regenerated — and none of the sixteen new paths exists in the typed client until then.

**Three things Session B must know before re-pointing** (all detailed in
`contracts/openapi/CHANGELOG.md` 1.22.0):

1. **`PartnerCapability.Status` has a sixth value, `REJECTED`.** Operations' refusal now has its own
   state and `WITHDRAWN` means only the Partner's own exit. `capability-status.ts` handles five and
   will not recognise it — a deliberate visible break, because `WITHDRAWN` quietly meaning two things
   was worse. Logged as a frozen-file change request below.
2. **`m2_capability_transition_invalid` was not published.** The live code is
   `m2_capability_transition_not_allowed`, which has existed since 10 August; renaming it to match
   the proposal's guess would have been a breaking change for nothing. The `errors.ts` request row
   below is corrected accordingly.
3. **`POST /partner/crew/` answers `201` for a new membership and `200` for a reinstated one.** The
   status code is how the UI knows to say "we put Ramesh back on your roster".

**What is still unpublished, and therefore still caps its tasks at `[~]`:**

| Surface | Wave | Consequence for the frontend |
|---|---|---|
| Attachment access expiry for non-selected vendors (`M2-BE-310`) | C1 remainder | Upload works; a declined vendor's link is not yet revoked, and no attachment reaches an enquiry. |
| A3: unlock checkout and state, unlocked quotes. A5 (revision 3, ADR-0008): visit-plan chooser, slot hold/confirm, plan checkout, visit tracker, on-site estimate guard. Shared: selection, rejection, re-validation | C2 (BE4) | Session A's Wave A2 (`FE-216`, `FE-401..424`) and Session B's `FE-314`/`FE-315` have no domain layer to integrate against, let alone an endpoint. |
| Engagement and stage spine | C3 | Wave 3 in both columns. |
| Operations queues, cases, assisted capture | C6 | Wave 4 in both columns. |

> **Revision 3 — visit-first A5 (2026-08-12).** The owner adopted ADR-0008: A5 becomes visit-first
> (tiered visit plan charged at the first confirmed slot, on-site estimates, no second paywall); A3
> is unchanged. Every affected task was renamed or added in `03-frontend-tasks.md` (`FE-216`,
> `FE-314`, `FE-315`, `FE-419..424`) and `02-backend-tasks.md` (`BE-215`, `BE-419..428`) — nothing
> already built or wired changes. Visit slots reuse `carts.availability` and the checkout
> slot-picker pattern.

**One caveat that applies to everything already published.** C0 shipped with **no tests**. Wave C1
wrote them — five backend files covering object-level authorization on all 33 paths, the sweeps,
attachments and the registration surface — and **did not run them**, per the verification convention.
They are queued for the owner in [task.md](task.md) §"Owner verification queue". The surface is now
covered by written tests rather than by executed ones: treat integration findings as likely, not
surprising.

The frontend completion standard in `03-frontend-tasks.md` requires the generated client and real
backend states, so a task reaches `[x]` only once it is re-pointed and verified against real server
states — publication alone does not promote it.

Both sessions therefore track two states per task:

| Mark | Means |
|---|---|
| `[~] built` | Screen, states and logic built against the approved contract proposal or the generated client; wired to a typed seam; unit/component tests **written**; lint and typecheck green. |
| `[x] integrated` | Re-pointed at the generated OpenAPI client, verified against real backend states, all seven UI states proved, a11y and responsive checked — **and the owner has run the tests**. |

> **Sessions do not run tests, effective 12 August 2026.** Write them; the owner runs them. Static
> gates (`pnpm lint`, `pnpm typecheck`, `pnpm build`) are still required before reporting a wave.
> A session may never self-promote a task to `[x]` on test grounds. See [task.md](task.md)
> §"Verification convention" for the full rule and the reasoning.

Rules while any part of the backend is still absent:

1. Build against the types in `contracts/proposals/0012-m2-capability-and-requirement-surface.md`
   and `0013-m2-partner-capability-crew-and-gates.md` (and any later M2 proposal). Do not invent
   endpoint shapes privately — add them to the proposal.
2. **No mock or placeholder data anywhere in application code.** Where the endpoint does not exist
   the screen shows its real loading state, then its real error state. Fixtures live in tests only.
3. No query may use a key from `m2-keys.ts` until its endpoint is published — that module says so
   itself. Until then the hooks exist but are not mounted on a route that claims to work. The keys
   for the 17 published paths are now free to mount; everything in the table above is not.
4. When the contract lands, integration is a **re-point, not a rewrite**. If a task cannot be
   re-pointed in a single file change, its seam was drawn wrong — fix the seam, not the screen.

---

## 3. File ownership map — the conflict contract

A session may create, edit or delete **only** the paths it owns. No exceptions without a handoff
note in §7.

### Owned exclusively

| Path | Owner |
|---|---|
| `frontend/apps/customer/**` | **A** |
| `frontend/apps/partner/**` | **B** |
| `frontend/apps/admin/**` | **B** (until Wave 4 — then split by feature folder, below) |
| `frontend/packages/query/src/m2-requirement.ts` | A |
| `frontend/packages/query/src/m2-quotes.ts` | A |
| `frontend/packages/query/src/m2-engagement-customer.ts` | A |
| `frontend/packages/query/src/m2-enquiry.ts` | B |
| `frontend/packages/query/src/m2-proposal.ts` | B |
| `frontend/packages/query/src/m2-engagement-partner.ts` | B |
| `frontend/packages/query/src/m2-ops.ts` | B |
| `frontend/e2e/m2-customer-*.e2e.ts` | A |
| `frontend/e2e/m2-partner-*.e2e.ts`, `m2-ops-*.e2e.ts` | B |
| `Django_Next.js_Plan/M2/frontend-session-a.md` | A |
| `Django_Next.js_Plan/M2/frontend-session-b.md` | B |

The customer/partner engagement split is deliberate. Both roles read the same `Engagement` and
`EngagementStage` spine, but through role-scoped endpoints with different permitted actions. Two thin
hook files that share one key factory and one generated type beat one shared file two sessions fight
over. If real duplication appears at the Wave 4 sync, the integrator folds it — that is a ten-minute
job then, and a week of merge conflicts now.

### Wave 4 admin split (`frontend/apps/admin`)

Predefined so the two sessions never open the same folder:

| Folder | Owner | Tasks |
|---|---|---|
| `features/m2-requests/**` | B | `M2-FE-701..705` — queues, unified timeline, transition audit, privileged actions, assisted quote capture |
| `features/m2-cases/**` | A | `M2-FE-706..711` — case intake, remedies, refund/payout states, dual-confirmation cancellation, leakage signals, ops-touches measure |
| `app/operations/**` route files | **B only.** A hands route stubs to B at the Wave 4 sync. | — |

### Frozen after Wave 0 — read-only for both sessions

| Path | Why |
|---|---|
| `frontend/packages/query/src/m2-keys.ts` | The key factory and freshness tiers. A private edit desynchronises every invalidation. |
| `frontend/packages/query/src/freshness.ts` | Tier definitions. |
| `frontend/packages/api-client/src/errors.ts` | The 29 M2 codes + category layer. |
| `frontend/packages/query/src/error-presentation.ts` | The one error mapping layer. |
| `frontend/packages/api-client/src/generated/**` | Generated. Never hand-edited. |
| `frontend/packages/ui/src/**` | Shared components. See the promotion rule below. |
| `contracts/proposals/**` | Append a new numbered proposal; never rewrite another session's. |

Need a change to a frozen file? **Do not edit it.** Log the request in §7, keep building against the
current shape, and the integrator lands it at the next sync gate. A frozen file changing under a
running session is how both sessions end up wrong at once.

### Shared barrels — append-only, in your own marked block

`frontend/packages/query/src/index.ts` and `frontend/packages/ui/src/index.ts` must carry these
markers before fan-out (Wave 0 closing task). Each session appends only inside its own block:

```ts
// --- M2 customer surface (session A) ---
// --- M2 partner + operations surface (session B) ---
```

One export line per module, appended at the end of your block. Textual conflicts become impossible
because the two blocks never touch.

### New shared component rule

Do **not** add to `packages/ui` mid-wave. Build it inside your own app under
`features/<area>/view/`. If the other session needs the same thing, log it in §7 and the integrator
promotes it to `packages/ui` at a sync gate. Two sessions inventing the same `<Timeline>` in the same
package on the same day is the single most likely way this plan fails.

---

## 4. Repository setup — pick one

### Option 1 (recommended): two worktrees, two branches

Full isolation: separate `node_modules` state, separate `.next` build locks, separate git index, no
turbo cache contention. Both branch from the M2 branch and merge back into it — **never into `main`**.

```bash
git -C C:/dev/vsolve worktree add ../vsolve-fe-customer -b feat/m2-fe-customer feat/m2-workforce-projects
```

```bash
git -C C:/dev/vsolve worktree add ../vsolve-fe-partner -b feat/m2-fe-partner feat/m2-workforce-projects
```

Cost: each worktree needs its own `pnpm install`, and the dev server runs from whichever tree is being
looked at. Merge both back into `feat/m2-workforce-projects` at each sync gate.

### Option 2: one tree, one branch, strict ownership

Simpler for running a single dev server. The ownership map above already makes file conflicts
impossible; what remains is process contention. Then:

- **Never `git add -A` or `git add .`** — stage only paths you own, by explicit path.
- Do not run `pnpm build` or `pnpm dev` in both sessions at once; `.next` and turbo caches collide.
- `pnpm lint` and `pnpm typecheck` are safe concurrently but slow; prefer filtered runs
  (`pnpm --filter @vsolve/customer typecheck`).

Commits stay rare either way — build the wave, commit at the wave gate, not per task.

---

## 5. Wave-by-wave schedule

| Wave | Session A (Customer) | Session B (Partner + Ops) | Parallel? |
|---|---|---|---|
| **0** | — | — | **No.** Foundation session only. `M2-FE-001..011`. |
| **1** | A1 · Requirement + tracking — `FE-201..215` | B1 · Registration + workspace — `FE-101..115` | Yes |
| **2** | A2 · Access (A3 teasers/unlock · A5 visits/estimates), selection, engagement — `FE-216`, `FE-401..424` | B2 · Enquiries, clarification, proposals — `FE-301..313`; revision 3 adds `FE-314`/`FE-315` once C2 publishes | Yes |
| **3** | A3 · Customer fulfilment — `FE-509..512`, `FE-608..613` | B3 · Partner fulfilment — `FE-501..508`, `FE-601..607` | Yes |
| **4** | A4 · Ops cases and money — `FE-706..711` | B4 · Ops queues and actions — `FE-701..705` | Yes, split by feature folder |
| **5** | — | — | **No.** `FE-801, 805, 806, 809, 810, 811` + all gates. |

Waves are a **sync cadence, not a race**. Neither session waits for the other to start its next wave;
they only re-converge at the gates. If one session runs ahead it takes the next wave in its own
column, never a task from the other column.

### Why these pairings are safe

- **Wave 1** touches disjoint apps and disjoint query modules. The only shared thing is the workspace
  registry, and that is B's file already (`apps/partner/features/workspace/`), consumed by nobody in A.
- **Wave 2** looks coupled — A's quote comparison renders B's proposals — but they meet only through
  the contract, not through code. A reads a proposal; B writes one. Different apps, different
  endpoints, different files.
- **Wave 3** is the one to watch. Both build against the same `Engagement`/`EngagementStage` spine, so
  a misread of the state machine shows up twice. Both sessions read
  [07-state-machines-and-permissions.md](07-state-machines-and-permissions.md) as the authority, and
  the Wave 3 gate diffs the two implementations for state-name drift.
- **Wave 4** is folder-split inside one app. B owns the route files; A works entirely inside
  `features/m2-cases/**` and hands its route needs to B at the gate.

---

## 6. Gates — the only points where the sessions synchronise

Each gate is run by whoever is integrating. Nothing crosses a gate on a claim; it crosses on evidence.

### Gate 0 — fan-out gate (blocks Waves 1+)

- [ ] `M2-FE-001..005` route and navigation IA document exists and is approved.
- [ ] `M2-FE-006` contract proposal `0012-m2-capability-and-requirement-surface.md` written and filed.
- [ ] `M2-FE-007` workspace registry + switcher; unknown key renders nothing.
- [ ] `M2-FE-008` shared components landed in `packages/ui`.
- [ ] `M2-FE-009` 29 error codes + category layer.
- [ ] `M2-FE-010` keys, freshness tiers, command→invalidation map.
- [ ] `M2-FE-011` analytics naming + redaction rules.
- [ ] Barrel marker comments added to both shared `index.ts` files (§3).
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] `task.md` and `03-frontend-tasks.md` updated with evidence.
- [ ] `03-frontend-tasks.md` header links this plan and both session files; `task.md` links this plan
      from its delivery-sequence section. **Deliberately left to the foundation session** — those two
      files were being written while this plan was drafted, and a concurrent edit would have been the
      first conflict this plan is supposed to prevent.

### Gate 1 / 2 / 3 — wave sync

- [ ] Both columns at `[~] built` for the wave, with per-task evidence in the session file.
- [ ] Branches merged into `feat/m2-workforce-projects` (Option 1) or both columns committed (Option 2).
- [ ] `pnpm lint` + `pnpm typecheck` pass **on the merged tree**, not just per session.
- [ ] Handoff log (§7) drained: frozen-file changes landed, shared components promoted.
- [ ] Gate 3 only: state names, stage transitions and permitted actions diffed across the two
      implementations against `07-state-machines-and-permissions.md`.

### Gate 4 — Operations gate

- [ ] `features/m2-requests` and `features/m2-cases` compose in one admin shell without duplicate
      timeline or money components.

### Gate 5 — release gate

The FE7 gate in `03-frontend-tasks.md`, unchanged.

---

## 7. Cross-session logs

Both sessions append here. This is the only file both sessions write, and only ever by appending a
row — keep edits to one line so a merge stays trivial.

### Frozen-file change requests

| Date | From | File | Change needed | Why | Landed at gate |
|---|---|---|---|---|---|
| 2026-08-11 | B | `packages/api-client/src/errors.ts` | Add `m2_business_type_invalid` (`fix_input`), `m2_capability_already_requested` (`choose_again`), `m2_capability_transition_invalid` (`contact_support`) | Proposal 0013 introduces three codes outside the frozen 29. Until they land they fall through to the generic refusal path. | **Landed `bea0130`** — as corrected by the row below, so `m2_capability_transition_not_allowed` is the code that shipped. |
| 2026-08-12 | C | `packages/api-client/src/errors.ts` | **Correction to the row above.** Published at 1.22.0: `m2_business_type_invalid` (`fix_input`), `m2_capability_already_requested` (`choose_again`), `m2_attachment_invalid` (`fix_input`), `m2_attachment_unavailable` (`retry`, retryable). `m2_capability_transition_invalid` was **not** published — the live code is `m2_capability_transition_not_allowed` (`contact_support`). | Renaming a code that has existed since 10 August to match a proposal's guess at its name is a breaking change bought for nothing. | **Landed `bea0130`** — all four codes present in `errors.ts`. |
| 2026-08-12 | C | `apps/partner/features/capability/**` (`capability-status.ts`) | Handle a sixth `PartnerCapability.Status`: `REJECTED` | 1.22.0 splits Operations' refusal out of `WITHDRAWN`, which now means only the Partner's own exit. `REJECTED` carries a mandatory `review_notes` and needs a support path; `WITHDRAWN` needs an obvious way to ask again. Both are terminal and neither blocks a fresh request. An unhandled status should render as "we cannot describe this" rather than fall back to either. | **Landed (Session B, Gate 1)** — `capability-status.ts` handles all six; `REJECTED` ranks above `SUSPENDED` and renders the reviewer's own words. |
| 2026-08-12 | A | `packages/query/src/m2-keys.ts` | `requirements.duplicates` should take `{addressId, requestedStart, variantId}`, not `{addressId, serviceBy, categorySlug}` | The published `GET /requirements/duplicate-check/` matches on `address_id`, `requested_start` (a date-*time*) and `variant_id`. The key's three slots are still the three inputs that decide the answer, so the cache is correct; only the labels are wrong. `features/requirement/queries.ts` passes the right values under the stale names with a comment. | **Landed (Gate 1)** — renamed to `{addressId, requestedStart, variantId}`. |
| 2026-08-12 | A | `e2e/support/responsive.ts` | `RouteUnderTest` needs an optional `setup(page)` hook | Every authenticated route has to install its API before `goto`, or the session gate redirects to `/login` and the readiness check passes against that page instead. Worked around with a `test.describe` + `beforeEach` wrapper, copied from `bookings.e2e.ts` — three specs now carry the same wrapper. | **Deferred at Gate 1.** `e2e/**` is test code and the build-first amendment neither writes nor runs it during the sprint; the `test.describe` wrapper keeps the three specs correct meanwhile. Land when test authoring resumes. |
| 2026-08-12 | B | `packages/api-client/src/errors.ts` | Add `m2_wage_floor_unavailable` (`fix_input`) | Contract 1.21.0 documents it on `POST /proposals/` — "no floor is loaded for the state and skill; this fails closed rather than guessing" — and it is not in the frozen 29, so it falls through to the generic refusal path instead of landing under the rate field beside `m2_proposal_below_wage_floor`. A vendor is told "we could not complete this" for something they can fix. | **Landed `bea0130`**, under Session C's correction below: `contact_support`, not `fix_input`. |
| 2026-08-13 | C | `packages/api-client/src/errors.ts` | **Answering B's row above, and one correction.** `m2_wage_floor_unavailable` is live at 1.23.0 and is a **`409`, not a `400`** — the operation's description said `400` and the code has always raised `409`; the schema now agrees with the code. Suggested handling is `contact_support`, not `fix_input`: the vendor cannot fix it by editing the rate, because it means Operations has not mapped a wage floor for this variant or area. Also add `m2_capacity_unavailable` (`choose_again`) — new on `POST /partner/enquiries/{id}/accept/`. | **Landed `bea0130`** — both codes present, `m2_wage_floor_unavailable` mapped to `contact_support`. |
| 2026-08-13 | C | `packages/query/src/m2-requirement.ts` (Session A) and `apps/partner/features/enquiry/queries.ts` (Session B) | **The two compensating narrowings can be deleted.** `readRequirementList` and `readEnquiryPage` accept both a bare array and a page envelope because the contract declared the first and Django sent the second. At 1.23.0 both operations declare `RequirementSummaryPage` / `EnquirySummaryPage` — `{next, previous, results}` — so the generated type is now the truth. Do not delete before regenerating the client. | **Landed (Gate 1, orchestrator).** Client regenerated at 1.23.0 first, then both narrowings deleted: `readRequirementList` takes `RequirementSummaryPage` and `readEnquiryPage` takes `EnquirySummaryPage`. The test cases covering the deleted bare-array/unreadable-payload branches were deleted with them — the surviving cases assert the projection, not the shape. |

| 2026-08-13 | B | `packages/query/src/m2-keys.ts` | Add a `visits` key namespace, and add `confirm_visit_slot`, `confirm_visit_arrival`, `complete_site_visit`, `report_visit_no_show` and `refund_unfilled_visit_shares` to `M2Command` + `M2_INVALIDATION` | The union predates revision 3, so none of the four A5 visit commands can go through `invalidateForM2Command` — the one table §"Invalidation" exists to keep reviewable. Built against the current shape rather than edited: the slot grid hangs off `invitations.detail(id)` with a `visit-slots` tail, which is correct by construction (a grid is a projection of one invitation, and every existing invitation invalidation already clears it), and the four commands invalidate explicitly at their call sites in `apps/partner/features/visit/queries.ts`. `07-state-machines-and-permissions.md` §6 names all five, so the table can be diffed against it. | not yet |
| 2026-08-13 | B | `packages/api-client/src/errors.ts` | Add `m2_access_price_unavailable` (`contact_support`) and `m2_policy_unavailable` (`contact_support`) | Both are reachable for the first time at 1.24.0 and both are **fail-closed configuration states, not faults the user can clear**: the first means no effective price is loaded and nothing can be sold; the second means a clock, cap, visit duration or disposition rule was never decided. Falling through to the generic path gives them `retry`, which is the one recovery that is guaranteed not to work. They are two codes rather than one because an alert on the first means "we cannot sell anything". Handled explicitly at the call site in `apps/partner/features/visit/view/visit-response.tsx` meanwhile. | not yet |

### Shared component promotion requests

| Date | From | Component (current path) | Also needed by | Promoted |
|---|---|---|---|---|
| | | | | |

### Contract gaps found while building

Anything the backend must expose that no proposal covers. Do not build around it silently.

| Date | From | Task | Missing endpoint / field | Proposal filed |
|---|---|---|---|---|
| 2026-08-11 | B | `M2-FE-101` | Masked live requirement summaries — `GET /api/v1/partner/demand-preview/`. Nothing in 0012 lets an unapproved Partner see demand. | `0013` §D2 |
| 2026-08-11 | B | `M2-FE-102` | Progressive-gate status read — `GET /api/v1/partner/gates/`. The three `assert_*` guards exist in `capabilities.py` but have no read projection, so the client would have to author the "why now" copy. | `0013` §D1 |
| 2026-08-11 | B | `M2-FE-103` | Business type — `GET`/`PUT /api/v1/partner/business-profile/`. `PartnerBusinessProfile` is migrated; `PartnerApplication` carries no `business_type`. | `0013` §A |
| 2026-08-11 | B | `M2-FE-104` | Capability options and request — `GET /api/v1/partner/capability-options/`, `POST /api/v1/partner/capabilities/`. Needs server-authored `lifecycle_explanation` and `asks_for` so the client holds no archetype branch. | `0013` §B1–B2 |
| 2026-08-11 | B | `M2-FE-106` | Worker insurance — `GET`/`PUT /api/v1/partner/insurance/`. `PartnerInsuranceDeclaration` is migrated and unreachable. | `0013` §C |
| 2026-08-11 | B | `M2-FE-107` | Crew roster CRUD — `GET`/`POST /api/v1/partner/crew/`, `PATCH` and `archive` per membership. Must publish `membership_id` and a masked phone, never the global `crew_member_id`. | `0013` §E |
| 2026-08-11 | B | `M2-FE-109` | Capability review state — `GET /api/v1/partner/capabilities/`. This is what separates "not applied" / "under review" / "suspended", which `08-frontend-information-architecture.md` §4 lists as not implementable from grants alone. | `0013` §B3 |
| 2026-08-11 | B | `M2-FE-110` | `GET /api/v1/partner/workspaces/` is specified in 0012 §A1 but unpublished, so the grants query stays unmounted and `PartnerShell` keeps its `workspaceGrants` prop seam. Not a gap — a dependency. | `0012` §A1 |
| 2026-08-11 | B | `M2-FE-109` | **A rejection is indistinguishable from a withdrawal.** `_ALLOWED_TRANSITIONS` in `capabilities.py` sends both Operations' refusal and the Partner's own exit to `WITHDRAWN`, and 0013 §B3 publishes no actor. "We said no" and "you closed this" need different copy and different next actions. Needs either a `REJECTED` status or an actor/reason on the record. | **Answered and published at 1.22.0** — a `REJECTED` status, not `actor_kind`: `PartnerCapabilityTransition.actor` is null both for a Partner action and for a system job, so a derived actor would mislabel the case that matters. `last_transition` is published without it. See proposal 0013 §Answered. |
| 2026-08-11 | B | `M2-FE-109` | **No document expiry exists.** `PartnerDocument` (contract 1.20.0) has `status`, `review_reason`, `reviewed_at` and no expiry field, so the expired-document state the task requires has nothing to read. Needs `expires_at` on the document, or a document-validity projection. | **Answered and published at 1.22.0** — `PartnerDocument.expires_on` (nullable), plus `expired_document_kinds` and `documents_expiring_on` on the capability record. Raw fields, not a computed `EXPIRED` status, as Session B preferred. See proposal 0013 §Answered. |
| 2026-08-11 | A | `M2-FE-207` | **The four optional extras have no wire field.** Proposal 0012 §B and contract 1.21.0 both carry `answers`, `additional_details` and nothing for `callback_preference`, `site_visit_interest`, `access_constraints` or `preferred_communication`. They are not catalogue configuration — the same four for every category — so there is no question schema to render them from either. Built as client-owned shapes in `features/requirement/model/optional-details.ts`, held in the draft, mapped in `adapters/` when a shape lands. Requesting one nullable object per key on `PATCH /requirements/{requirement_id}/`. | not filed — needs a 0012 amendment |
| 2026-08-12 | B | `M2-FE-301` | **The declared list shape is not the shape Django sends.** `m2_partner_enquiry_list` is declared `EnquirySummary[]`; `PartnerEnquiryCollectionView.get` returns `EnquiryCursorPagination.get_paginated_response(...)`, i.e. `{next, previous, results}`. Code written against the generated type — `data.map(...)` — throws on the first real request and fails no type check. Narrowed at the seam in `features/enquiry/queries.ts › readEnquiryPage`, which accepts both. **`m2_requirement_list` has the same defect** (`RequirementCursorPagination`), so Session A's `My requests` is exposed to it too. | not filed — a schema correction, not a new endpoint |
| 2026-08-12 | B | `M2-FE-301` | **The enquiry list cannot be paged.** `EnquiryCursorPagination` returns twenty rows, and the operation publishes no `cursor` query parameter, so the typed client has nothing to send. A Partner with more than twenty enquiries sees a truncated inbox. The screen states the truncation rather than hiding it; the parameter is what would remove the notice. | not filed |
| 2026-08-12 | B | `M2-FE-301` | **Three fields are declared non-null and are nullable in the database.** `requested_start` and `service_by` come from `RequirementSnapshot` (`null=True`); `responds_by` comes from `VendorInvitation` (`null=True`) and is null for every service area with no operating windows or configuration with no SLA hours — `matching._invitation_deadline` returns `None`. None is an edge case. Formatting them as declared prints `Invalid Date` into a live enquiry. Compensated in one adapter, `features/enquiry/model/wire.ts`. | not filed — a schema correction |
| 2026-08-12 | B | `M2-FE-304` | **No `server_now` on the enquiry reads.** Every other M2 read publishes one — `RequirementDraftSerializer`, `RequirementTimelineSerializer`, `QuoteTeaserListSerializer` — and the enquiry, which is the one read carrying a hard `responds_by` deadline, does not. Countdowns fall back to `Date`-header calibration at RFC 7231's one-second granularity. Adequate for a business-hours deadline, and the wrong place to be the only endpoint without the precise source. | not filed |
| 2026-08-12 | B | `M2-FE-301` | **No area on an enquiry, at any status.** `EnquirySummary` carries the snapshot's schedule, language and budget; the requirement's address is withheld by design and the *service area* is not published at all. "Where is this" is the biggest decision input on a list row and a vendor cannot see it. A masked area name or pin-code prefix would not disclose the customer. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-301` | **No fit summary.** `VendorInvitation.ranking_provenance` records why this vendor was invited and is never serialised. Needs a server-authored sentence — the client asserting "good fit" from a category slug would be claiming a matching decision it did not make. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-303` | **No decline-reason vocabulary.** `EnquiryDeclineRequest.reason_code` is an unconstrained `SlugField(max_length=80)`; Django stores whatever arrives and only checks it is non-empty. Free text would give Operations four spellings of one fact and teach the matcher nothing. Five codes are authored client-side in `features/enquiry/model/decline-reasons.ts`, marked as client-owned. Needs a published list, ideally aligned to `matching.ExclusionReason`. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-302` | **No capacity read.** `accept_invitation` writes an ACTIVE `CapacityHold` over the requested days and nothing publishes it, nor whether the vendor is already committed on those dates. The consequence of accepting is stated from the snapshot's own dates; the conflict warning the task asks for has nothing to read. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-302` | **No attachments on an enquiry.** `RequirementSnapshot` does not copy them and `EnquiryDetail` publishes none, so the attachment viewer has nothing to view. Downstream of `M2-BE-202` (Wave C1), but the snapshot copy is a separate decision from the upload. | tracked with `M2-BE-202` |
| 2026-08-12 | B | `M2-FE-302` | **The Partner receives answers with no schema.** `EnquiryDetail.answers` is a raw `JSONField` keyed by question codes; the variant's `question_schema` is published to the Customer's flow and not to the vendor pricing against it. The client de-slugs codes into labels, which is presentation of a server value and not a substitute for the schema. A nested answer value cannot be rendered at all and is counted rather than paraphrased. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-313` | **A Partner cannot read their own quote back.** 1.21.0 publishes `POST /proposals/`, `GET /proposals/{id}/` and withdraw — and nothing that answers "which proposal did I send for this enquiry". `EnquiryDetail` carries `questions` and `site_visits` and no proposal. Once the id leaves the tab, the only readable truth is `status == "QUOTED"`; withdraw, the status states and the supersession trace all become unreachable. `m2QueryKeys.proposals.mine` already exists for this and stays unmounted. **Needs `GET /api/v1/proposals/?requirement=` or a `proposals` field on `EnquiryDetail`.** | `0012` amendment — the largest hole in Wave B2 |
| 2026-08-12 | B | `M2-FE-310` | **No wage-floor read.** Nothing publishes the statutory floor for a state and skill, so the composer states the rule and shows no figure. `M2-FE-310` asks for it inline; any number on that screen would be this client inventing statutory pay. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-310` | **The wage-floor guard is inert over HTTP.** `proposals.submit_proposal` runs `assert_rate_meets_wage_floor` only when handed `wage_floor_skill` and `wage_floor_state_code`; `ProposalCreateSerializer` carries neither and `PartnerProposalCollectionView` passes neither. So `m2_proposal_below_wage_floor` is documented on the endpoint and **cannot currently be returned by it** — a below-floor A3 rate is accepted. The client surfaces the refusal correctly if it ever arrives. This is a backend defect, not a contract gap. | not filed — needs a backend fix |
| 2026-08-12 | C | `M2-FE-310` | **Confirmed by the backend, and not fixed in Wave C1.** The fix is `M2-BE-317` — derive the state and skill from the requirement's address and variant rather than taking them from the caller — and it needs a variant-to-skill mapping that does not exist yet. Recorded in `02-backend-tasks.md` and `backend-session.md` §C1 as the highest-priority remaining C1 item, because the endpoint documents a refusal it cannot make. | not filed — backend, `M2-BE-317` |
| 2026-08-12 | C | `M2-FE-205` | **The published scan vocabulary, stated exactly, because two renames have already happened around it.** `RequirementAttachment.ProcessingStatus` at 1.22.0 is `PENDING | VERIFIED | INFECTED | FAILED`, published on the attachment as `scan_status` with a companion `scan_failure_reason`. It is **not** `CLEAN` — `VERIFIED` is the model's own value and renaming a stored enum for a client label is the wrong direction (the C0 outcome table says so). `INFECTED` and `FAILED` are separate on purpose: `FAILED` is a checksum or size mismatch and the recovery is a retry; `INFECTED` is malware and the recovery is removal, which the `DELETE` route allows **in any requirement status** precisely so an infected file is never stuck on a live requirement. Session A's local `SCAN_FAILED` needs to map to one of the two, and which one decides whether a retry button appears. | not a gap — a mapping note |
| 2026-08-12 | C | `M2-FE-302` | **Attachments now exist, and reaching an enquiry is the only remaining half.** 1.22.0 publishes the upload, so `RequirementAttachment` rows are real — but `RequirementSnapshot` does not copy them and `EnquiryDetail` publishes none. Deliberately a separate decision: the snapshot copy has to settle what a vendor sees when an attachment is added or scanned *after* their invitation, which is `M2-BE-310` territory. | tracked with `M2-BE-310` |
| 2026-08-12 | B | `M2-FE-311` | **The required tax basis is unreadable.** `_required_tax_basis` forces every quote on a requirement onto whichever basis the first vendor used and refuses a mismatch — against a vendor the second one cannot see. Nothing publishes the required basis, so the composer can only warn before and show Django's sentence after. Needs `required_tax_basis` on `EnquiryDetail`. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-311` | **No commission treatment exists to state.** `Proposal.commission_treatment` is `CharField(max_length=24)` with no choices, no default and no published vocabulary, and there is no M2 commission policy — `ServicePricingPolicy.commission_basis_points` belongs to the A1 task lifecycle and is unreachable from a proposal. The field is deliberately left unsent: a 24-character code authored here would be the vocabulary Operations and Finance report on, invented by a client. The composer says the customer compares the total as entered. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-312` | **An A3 total is not reconciled server-side.** `_assert_a5_shape` checks that stage amounts sum to `total_paise`; `_assert_a3_shape` checks only that rate, days and headcount are present. A workforce quote of ₹900/worker/day x 6 x 4 can carry `total_paise: 1` and be stored. The client computes the total and never lets it be typed, which is as far as a client can go. | not filed — needs a backend fix |
| 2026-08-12 | B | `M2-FE-309` | **No published stage shape.** `ProposalCreateRequest.stages` is `unknown[]` and the domain reads one key, `amount_paise`. Everything a customer needs to read a stage — what it delivers, when it ends — is client-authored, so two vendors can send two incomparable structures and the comparison view has nothing stable to render. Shape used: `{title, deliverable, amount_paise, ends_on}`. Needs a published `ProposalStage`. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-309` | **No field for assumptions.** The task names deliverables, line items, stages, taxes, exclusions, **assumptions**, dates, warranty and validity; the wire carries no assumptions field, and DRF drops unknown keys silently — a control here would discard a vendor's caveats without an error. Not built. Exclusions were not relabelled to stand in: "not included" and "assumed true" are different promises in a dispute. | `0012` amendment |
| 2026-08-12 | B | `M2-FE-306` | **A paid site visit can be requested and never scheduled or closed.** `schedule_site_visit` and `complete_site_visit` exist in `apps/requirements/proposals.py` and are published on no route, in either app. A requested visit sits at `REQUESTED` permanently. The panel says so rather than rendering a transition nobody can make. | not filed — C0 published the request only |
| 2026-08-12 | B | `M2-FE-306` | **No callback flow of any kind.** The task pairs callback request and scheduling with the site visit; nothing in 1.21.0, 0012 or 0013 publishes a callback, and a callback is by definition a phone number crossing between two parties who have not been authorized to exchange one. No control was built. | `0012` amendment — or an explicit product decision that there is no callback |
| 2026-08-12 | B | `M2-FE-307` | **No contact-disclosure surface, so no consent and no revocation.** Nothing in the Partner surface carries customer identity at any status, which makes two of the task's three clauses vacuously true — and the third, "record the server outcome", has no command whose outcome it would be. `features/enquiry/contact-boundary.test.ts` asserts the negative directly so it cannot rot. If disclosure is ever published, that test is what forces a deliberate decision. | not filed — needs a product decision on whether M2 discloses at all |
| 2026-08-12 | B | `M2-FE-303` | **Two commands take no idempotency key.** `POST .../questions/` and `POST .../site-visits/` declare no `Idempotency-Key`, unlike accept, decline, submit and withdraw. Duplicate protection on both is the client's in-flight guard alone, so a double tap that beats it posts a second question or a second visit request. | not filed |
| 2026-08-12 | A | `M2-FE-213` | **Confirming Session B's finding independently: `m2_requirement_list` declares `RequirementSummary[]` and `RequirementCollectionView.get` returns `RequirementCursorPagination.get_paginated_response(...)`.** Found from the view rather than from B's row, which is worth recording — two columns reached the same defect from opposite ends and neither type check caught it. Absorbed in one named function, `packages/query/src/m2-requirement.ts › readRequirementList`, which accepts both shapes and whose envelope branch is to be **deleted** when the schema is corrected. `My requests` therefore also has no `cursor` parameter to send and shows at most twenty rows. | not filed — a schema correction, same one as B's |
| 2026-08-12 | A | `M2-FE-210` | **No merge endpoint exists.** `GAP-004` and `M2-FE-210` both ask for a merge option before a second requirement is created; `merge_duplicate_requirement` is a named command in `m2-keys.ts`'s invalidation table and **no route implements it**, in 1.21.0 or in 0012. The notice offers the honest alternative — open the request that already exists — rather than a button labelled "Add to this one" over an action nothing performs. Needs `POST /api/v1/requirements/{id}/merge/` taking the id being merged in. | `0012` amendment |
| 2026-08-12 | A | `M2-FE-202` | **The schema the client renders and the schema the server validates are different objects.** Screen 1's questions come from `ServiceVariantConfiguration.questions` (`catalog.ServiceQuestion` rows, the same source the A1 booking workspace reads); `submit_requirement` validates against `M2VariantConfiguration.question_schema`, a JSONField nothing publishes. Their vocabularies differ too — `SINGLE_CHOICE/NUMBER` against `SELECT/INTEGER` — and `validate_scope` refuses an unknown code. A mismatch is invisible until the Customer presses Send on screen 4. The same latent split exists in A1, so this is a pre-existing convention rather than a new defect; it is materially worse here because the M2 flow is four screens long. Needs either the M2 schema published, or an assertion that the two are authored together. | not filed — needs a backend decision on which is canonical |
| 2026-08-12 | A | `M2-FE-202` | **`MULTIPLE_CHOICE` cannot be answered.** `validate_scope` accepts `INTEGER`, `TEXT`, `BOOLEAN` and `SELECT` only, so a multiple-choice catalogue question on an A3/A5 variant produces an answer the submit command refuses whatever control is rendered. `toQuestionSet` reports it as unsupported and screen 1 says the service is not fully set up rather than rendering a dead end. | not filed |
| 2026-08-12 | A | `M2-FE-213` | **No display name on a requirement, anywhere.** `RequirementSummary` and `RequirementDraft` both publish `category_slug` — which is `variant.service.slug`, a slug, and misnamed besides — and no service name. `My requests` titles a row by formatting the slug. Needs `service_name` on both projections. | `0012` amendment |
| 2026-08-12 | A | `M2-FE-215` | **Resolving the 11 August flag: `quote_delivery_deadline_at` *is* on the list projection**, so the delayed-match state works. It is **not** on the detail. `GET /requirements/{id}/` answers with `RequirementDraft`, which carries no deadline, no `teaser_count` and no `closure_reason` — so a direct navigation to `/requests/{id}` shows the state and no countdown and no quote count. Filling them from the list cache would render a deadline read at some earlier moment as though it had just been confirmed, on the one screen whose job is to be truthful about a promise with a clock on it. Needs the three tracking fields on the detail projection, or a `GET /requirements/{id}/summary/`. | `0012` amendment |
| 2026-08-12 | A | `M2-FE-212` | **`is_free` exists only on the submit *response*.** `M2-FE-212` asks the Customer to be told the requirement is free; the only published field saying so is on `RequirementSubmitted`, i.e. after they have already sent it. Review therefore says nothing about price — the designed honest state — and the promise is made on the outcome panel from the server's own field. Needs `is_free` on `RequirementDraft` so it can be stated before the button rather than after. | `0012` amendment |
| 2026-08-12 | A | `M2-FE-211` | **There is no edit-after-submission command.** `update_draft` raises `RequirementLockedError` for anything that is not `DRAFT` and no other route amends a requirement, so the *action* half of `M2-FE-211` has nothing behind it. The explanation and the confirmation are built (`view/material-edit-notice.tsx`); `onConfirmEdit` is deliberately not supplied, so the notice states the consequence and routes to support rather than collecting a confirmation that would reach a 409. Needs an amend command that notifies invited vendors and resets `responds_by`. | `0012` amendment |
| 2026-08-12 | A | `M2-FE-201` | **Nothing says which services accept an M2 request.** `ServiceCard` carries `bookable_variant_id` for the A1 path and no archetype; only `GET /services/{slug}/configuration/` reveals whether an A3/A5 variant exists, and only `M2VariantConfiguration` says whether it is configured. So the category-first picker offers every service and the next screen tells the Customer we do not cover this one. Needs an `accepts_requirements` flag or an archetype list on `ServiceCard`. | `0012` amendment |
| 2026-08-12 | A | `M2-FE-203` | **`requested_start` is required for submit and was on no screen.** `_assert_submittable` refuses a requirement without "when it should start", and `find_probable_duplicate` matches within ±3 days of it — so `GAP-004` cannot work without one either. Added to screen 2 as a date, encoded to the start of the Customer's local day at the adapter seam, because the wire's field is a date-time and asking someone to name a minute for an unscoped job would be inventing precision. Not a gap in the contract — a gap in the built screen, recorded because the same omission would be invisible until a real submit. | n/a — screen corrected |
| 2026-08-12 | A | `M2-FE-201` | **The IA's four sub-routes are mounted as one.** `08-frontend-information-architecture.md` §1 lists `/requests/new/what`, `/where-when`, `/details` and `/review`. They are mounted as a single `/requests/new/[service]`, on the `/book/[service]` and `/checkout` precedent: the flow is one reducer, back is a screen change rather than a navigation, and `canNavigateTo` refuses a forward jump — so four URLs would either skip every guard on a pasted `/review` or bounce. The four-screen budget is enforced by `SCREENS.length === 4`, not by a folder count. The IA table should be corrected at a gate. | **Corrected at Gate 1** — `08-frontend-information-architecture.md` §1 now lists `/requests/new/[service]` as one route and carries the reasoning as a note. |
| 2026-08-11 | A | `M2-FE-215` | **`MATCHING` cannot be distinguished from "we are late" without the deadline.** `M2-FE-215` needs a delayed-match state that is neither "on track" nor "SLA breached"; it is derived client-side from `status` plus `quote_delivery_deadline_at` against `serverClock` (`features/requirement/model/request-state.ts`). That only works while the field is on the list projection as well as the detail — if `GET /requirements/` drops it, every row silently reads as on track. Flagged rather than filed: 1.21.0 may already carry it, and the integration pass will confirm. | verify at integration |
| 2026-08-13 | A | `M2-FE-403`/`404`/`420`/`417` | **A Customer cannot read back any M2 payment attempt, and cannot capture one in dev.** `GET /api/v1/payment-attempts/{id}/`, `POST .../reconcile/` and `POST .../simulate-capture/` all resolve ownership through `checkout__customer`; every M2 access charge is created by `commerce.services.initiate_standalone_payment_attempt` with `checkout=None`. So the read answers `404`, and `simulate_capture` raises `PermissionError` → `403`, for the unlock, the visit plan and every stage funding. Two consequences, both absorbed: (a) the screens resolve outcome **only** from the `unlock`/`plan`/stage object on the state read, which is what the contract asks for anyway, so this cost nothing to build around; (b) **the flow is not completable from a browser in any environment**, so the Wave A2 smoke script drives capture from the Django shell (`features/access/SMOKE.md` §5). Needs the three payment views to resolve a checkout-free attempt by its own aggregate's customer. | not filed — backend |
| 2026-08-13 | A | `M2-FE-419` | **The A5 vendor cards have no endpoint.** `apps/requirements/serializers.py` defines `VendorCardSerializer` — `{partner_id, vendor_type, is_verified, display_name}`, with `display_name` null until slot confirmation, which is exactly the disclosure ladder `M2-FE-419` describes — and **no view constructs it and no path publishes it**. `SiteVisit` also carries no partner, so a *confirmed* visit cannot be attributed either. Built honestly rather than faked: the tracker names a professional only where a delivered estimate carries one (`CustomerProposal.vendor` joined on `site_visit.id`), and every other slot says the name will be given before they arrive. Needs `GET /requirements/{id}/vendor-cards/`, or a `partner` on `SiteVisit`. Neither leaks contact. | not filed — the serializer exists, the route does not |
| 2026-08-13 | A | `M2-FE-401` | **A teaser has no rating.** `QuoteTeaser` publishes `{proposal_id, vendor_type, is_verified, price_band_low_paise, price_band_high_paise, is_out_of_budget}`. `M2-FE-401` and the README both list a **rating** among the four things a pre-unlock Customer sees, and there is no field for it. The teaser row shows the three that exist; no star count is invented. The same absence hits `M2-FE-419`, which additionally wants a **distance band** that nothing publishes either. | `0012` amendment |
| 2026-08-13 | A | frozen `errors.ts` | **`m2_access_price_unavailable` and `m2_policy_unavailable` are not in the frozen error table**, so `ApiRequestError.recovery` falls back to `defaultRecoveryForStatus(409)` and `describeError` offers **"Choose another option"** — the one piece of advice that is wrong here, because there is no other option and nothing the Customer presses changes the answer. Both should map to `contact_support`. `m2_requirement_transition_not_allowed` is missing too and is reachable on three Wave A2 commands (re-choosing a plan after a vendor commits, arrival on a held slot, no-show on an unscheduled visit) — also `contact_support`. Worked around in `features/access/view/access-refusal.tsx`, which every refusal in the wave routes through so the wrong affordance cannot appear. | frozen-file request — land at the gate |
| 2026-08-13 | A | frozen `m2-keys.ts` | **Four 1.24.0 reads have no key in the frozen factory**: the visit plan, the selection, and (by name) the customer quote list and teasers. `m2-keys.ts` was written against proposal 0012, which had no visit plan and no selection. Composed instead in `packages/query/src/m2-quotes.ts › m2AccessKeys`, **nested under `m2QueryKeys.requirements.detail(id)`** so `M2_INVALIDATION`'s existing `requirementScope` still clears them by prefix — a sibling namespace would have needed rows edited in the file nobody may edit. `M2_FRESHNESS` likewise has no visit-plan tier; the plan read borrows `M2_FRESHNESS.unlock`, which is the tier that module argues for. Promote both at the gate. | frozen-file request — land at the gate |
| 2026-08-13 | A | `M2-FE-215` (Wave A1 defect) | **`VISITS_BOOKED` was missing from the client's status union, and it silently deleted requests.** `RequirementStatusEnum` has carried it since 1.21.0 and revision 3 made it the state most A5 requests sit in — a vendor has confirmed a visit and no estimate exists yet. `toRequestRow` drops a row whose status it cannot name, by design, so an A5 Customer whose first professional confirmed watched their request **vanish from `My requests`** until an estimate landed. Nothing errored; a filter did its job. Fixed in `model/request-state.ts`, `adapters/index.ts` and the copy table. Recorded because it is the exact failure mode that list's own comment warns about, found only by reading the enum. | n/a — client corrected |
| 2026-08-13 | A | `M2-FE-409` | **A Customer cannot ask a vendor a question, and cannot request a revision.** 1.24.0 publishes `POST /partner/enquiries/{id}/questions/` (vendor asks) and `POST /requirements/questions/{id}/answer/` (Customer answers) — clarification runs one way only. `M2-FE-409` asks for Customer clarification and revision requests; the only revision request that exists is `M2-FE-413`'s re-validation, which is limited to an **expired** quote. Built as what exists: the quotes screen offers re-validation and states that questions arrive from the professional and are answered on the request timeline, and that nobody but the vendor can change a price. Needs a Customer-asks endpoint if the task is to be closable. | `0012` amendment |
| 2026-08-13 | A | `M2-FE-418` | **No receipt or invoice is reachable from an engagement.** `Engagement` publishes no `order_id` and no tax-document id, and `GET /tax-documents/{document_id}/` needs one. `M2-FE-418` asks for durable agreement, receipt/invoice **and** timeline access; two of the three are built (the agreement reads from `GET /engagements/{id}/`, the timeline from the request it names) and the receipt has nothing to link to. The screen says where the record lives rather than linking to a document it cannot name. Needs the order or tax-document id on the engagement projection. | `0012` amendment |
| 2026-08-13 | A | `M2-FE-608` (Wave A3) | **No funded total on an engagement.** `Engagement` publishes `total_paise`, `tax_paise` and per-stage `funding_state`, and nothing carrying "how much has actually been funded". Derived in `packages/query/src/m2-engagement-customer.ts › fundedTotalPaise` by summing `FUNDED` stage amounts — arithmetic over server-stamped states, which is the most a client may do, and still a number that can disagree with a statement. Flagged now because `M2-FE-608` will want it on a dashboard. | `0012` amendment |
| 2026-08-13 | A | `M2-FE-421` | **A `SiteVisit` publishes no timezone.** `BookingWindows` carries one so the A1 picker can render a service area's own hours; a visit slot is booked against the *same* `carts.availability` grid and carries only an instant. `formatVisitSlot` therefore falls back to the deprecated `BOOKING_TIME_ZONE` constant, as every other caller without a response does — correct while the platform is Hyderabad-only and wrong the day it is not. Needs `timezone` on `SiteVisit`, or on `VisitPlanState`. | `0012` amendment |
| 2026-08-13 | B | `M2-FE-313` | **Closed by 1.24.0 — `GET /api/v1/proposals/?requirement=` is published.** The largest hole in Wave B2 is gone: `useMyProposals` mounts it on `m2QueryKeys.proposals.mine`, the key the frozen factory has held since Wave 0, so a Partner reads their own quote back after a reload, on a second device and in a new session. Withdraw, the eight states and the supersession trace are all reachable again, and `resolveProposalView`'s `unreadable` branch now means only "that read failed", not "no such read exists". | **Answered and published at 1.24.0** |
| 2026-08-13 | B | `M2-FE-303` | **Closed by 1.24.0 — `InvitationDeclineReasonEnum` is published.** `model/decline-reasons.ts` is now derived from the generated type (`Record<DeclineReasonCode, …>`), so a code added or renamed on the server fails `pnpm typecheck` instead of being posted into a 400. The client-authored `crew_too_small` is gone rather than mapped — `NO_CAPACITY` is the server's name for the same fact. The constraint is on the serializer, not the column, so system reasons (`requirement_changed`, `non_responsive_quote`) still arrive on reads and `describeDeclineReason` de-slugs them. | **Answered and published at 1.24.0** |
| 2026-08-13 | B | `M2-FE-304` | **Closed by 1.24.0 — `server_now` on `EnquiryDetail`.** `@vsolve/api-client`'s `unwrap` feeds it into `serverClock` at millisecond precision, which outranks the `Date` header sample by the rule already in `server-clock.ts`. The `responds_by` countdown is therefore calibrated by the act of reading the enquiry. `enquiry-deadline.tsx` reads nothing new — threading it through props would give that component a second, staler clock than the app's. | **Answered and published at 1.24.0** |
| 2026-08-13 | B | `M2-FE-311` | **Closed by 1.24.0 — `required_tax_basis` on `EnquiryDetail`.** The composer can finally say which basis a second vendor is being compared on, instead of warning before and quoting Django's sentence after. Blank is a real state and is stated as one: nobody has quoted yet and *this* vendor fixes it for everyone. Prefilled into the on-site draft only when non-blank, because a blank basis is a decision rather than a default. | **Answered and published at 1.24.0** |
| 2026-08-13 | B | `M2-FE-309` | **Closed by 1.24.0 — `ProposalStage` is published.** `{title, deliverable, amount_paise, ends_on}` replaces the client-authored shape; `toStageRequests` maps onto the generated type and throws on a null amount rather than sending a stage worth nothing. `proposal-status.tsx` renders the breakdown defensively (a blank `title` degrades to "Part n") because a stage stored before the shape existed can carry `label`. | **Answered and published at 1.24.0** |
| 2026-08-13 | B | `M2-FE-315` | **Closed by 1.24.0 — `ProposalCreateRequest.site_visit_id`.** This was a defect, not a missing feature: `submit_proposal` always took one and no serializer published it, so an A5 on-site estimate could not be submitted over HTTP at all and `m2_visit_not_completed` was unreachable. `toOnsiteRequest` sends it as a required field on that path. | **Answered and published at 1.24.0** |
| 2026-08-13 | B | `M2-FE-301` | **`service_name` landed on `EnquiryDetail` and not on `EnquirySummary`.** The detail screen now titles itself from the catalogue's own name; the **inbox list still de-slugs `category_slug`**, because the list row does not carry it. The same gap the customer's `My requests` had, half closed. Needs `service_name` on `EnquirySummary` too. | `0012` amendment |
| 2026-08-13 | B | `M2-FE-314` | **No visit keys and no visit commands in the frozen query layer.** `m2-keys.ts` has no `visits` namespace, and `M2Command` names none of `confirm_visit_slot`, `confirm_visit_arrival`, `complete_site_visit` or `refund_unfilled_visit_shares` — the union predates revision 3, so `invalidateForM2Command` cannot be called for any of them. Built against the current shape: the slot grid hangs off `invitations.detail(id)` with a `visit-slots` tail (correct by construction — a grid *is* a projection of one invitation, and every existing invitation invalidation already clears it) and the four commands invalidate explicitly at their call sites. Requesting a `visits` namespace and the four command names at the next gate. | frozen-file change request — `packages/query/src/m2-keys.ts` |
| 2026-08-13 | B | `M2-FE-315` | **Material line items have no row shape of their own.** `M2-FE-315` requires them as first-class rows and the wire has exactly one money-carrying row type, `ProposalStage`. There is no `ProposalLine` and no `kind` discriminator, so a material line is sent as a stage with the vendor's own title — never an auto-generated prefix, because a magic string invented here would become a vocabulary the Customer's comparison view then has to parse. The consequence is stated to the vendor on screen. This matters commercially: the plan treats a material advance as a **distinct money purpose** ("material money is spent, not earned") and a stage carries an approval and a release, so a bag of cement currently arrives as a fundable milestone. Needs `kind` on `ProposalStage`, or a `ProposalLine`. | `0012` amendment |
| 2026-08-13 | B | `M2-FE-314` | **`VisitNoShowRequest.reason_code` is a free string with no vocabulary**, declared required with an empty default — the same shape as `commission_treatment` and the same decision: sent blank rather than authored, so a slug invented by this client does not become the value Operations reports on. Needs a published enum, ideally paired with the settlement rules (a vendor no-show refunds or replaces; a customer no-show still pays the vendor). | `0012` amendment |
| 2026-08-13 | B | `M2-FE-306` | **Correction to the 12 August row: `POST /site-visits/{id}/schedule/` *is* published (1.22.0).** The remaining gap is narrower and different in kind — scheduling takes **both** parties, and no screen in this app calls it for an ad-hoc visit because a one-sided date picker would offer a time nobody agreed to. An ad-hoc visit therefore still sits at `REQUESTED` until Operations moves it, and the panel says so. The A5 *plan* visit has no such gap: `confirm_visit_slot` books it on the shared grid in one command. | partially answered at 1.22.0 |
| 2026-08-13 | B | `M2-FE-314` | **`m2_access_price_unavailable` and `m2_policy_unavailable` are not in `errors.ts`.** Both are reachable for the first time at 1.24.0 and both are fail-closed states rather than faults — `m2_policy_unavailable` is what a visit grid returns when nobody has set how long a visit takes for the service, and no retry fixes it. They fall through to the generic refusal path, so the recovery intent is wrong (`retry` where it should be `contact_support`). Handled explicitly at the call site in `features/visit/view/visit-response.tsx`; the table entry is the real fix. | frozen-file change request — `packages/api-client/src/errors.ts` |
| 2026-08-13 | B | `M2-FE-313` | **Test debt created by the 1.24.0 re-point, recorded rather than fixed** (build-first amendment: sessions write no tests). Three existing partner suites now assert vocabularies the contract replaced: `features/enquiry/model/decline-reasons.test.ts` asserts the retired client slugs (`rate_too_low`, `no_capacity`, `crew_too_small`); `features/enquiry/view/enquiry-detail.test.tsx` uses `decline_reason_code: "no_capacity"` as a *label* lookup; and `features/proposal/model/proposal-state.test.ts` predates `ACCEPTED` and `LAPSED`. They will fail on the owner's next run and the failures are correct — the assertions are stale, the code is not. | not filed — owner-run test debt |

### From Session C — the contract is published (11 August 2026)

**`contracts/openapi/v1.yaml` is at 1.21.0 and carries 17 M2 paths.** `M2-BE-013` Wave C0 is done.
Types are already regenerated and in sync on this branch; run `pnpm contract:generate` if you rebase.
Both columns can start integrating.

**This answers exactly one row above: `M2-FE-110`.** `GET /api/v1/partner/workspaces/` is live, so
the grants query can mount and `PartnerShell` can drop its `workspaceGrants` prop seam.
**Everything else Session B logged is proposal 0013, and none of it is published yet** — business
profile, capability options and request, capability review state, insurance, crew CRUD, gate status
and demand preview are all Wave C1. Keep building against 0013's shapes; do not treat 1.21.0 as
covering them.

**Session A — do this first.** `apps/customer/features/booking/contract-pending/boundary.test.ts`
lines 71–73 list `/api/v1/requirements/`, `/api/v1/partner/workspaces/` and `/api/v1/proposals/` as
**unpublished**, and the guard fails the build on any request to them. All three are now live, so
that guard is stale and is the one thing standing between the built requirement flow and a mounted
route. Remove those three entries, then mount `app/(flow)/requirements/`.

> **Still open at the 2026-08-12 audit.** Session B did its half — the Partner guard retired
> `/partner/workspaces/` and the shell consumes the endpoint. The Customer guard is **unchanged**:
> all three entries are still listed, `features/requirement/` contains **zero** `useQuery`, and
> `app/(flow)/requirements/` does not exist. This is the single largest piece of finished-but-dark
> frontend work in M2 — four screens, `My requests`, the timeline and the closure states, all
> unreachable by a user. It is Session A's next task and it is not blocked on anything.

**Session B — a typecheck failure is waiting for you, and it is not the contract's.**
`apps/partner/features/capability/adapters/express-path.ts` fails at lines 137, 147 and 200:
`isStepComplete` takes an `ExpressStepKey` but is handed a whole `ExpressStep` — `step` should be
`step.key`. `ExpressStepKey` is a local literal union, so the regenerated client did not cause it.
Session C did not touch the file, per the ownership map. `pnpm typecheck` is red for `apps/partner`
alone until it is fixed; the other 7 packages are green.

> **Closed 2026-08-12.** Fixed during Wave B1 — all three call sites now pass `step.key`, and
> `pnpm typecheck` is **9 of 9 green**. Left in place so the handoff log stays append-only.

**Published now:** requirement list/create/read/patch/submit/duplicate-check/timeline · quote
teasers · Customer answer + Partner ask · enquiry list/read/accept/decline/site-visit · proposal
submit/read/withdraw · `GET /partner/workspaces/`.

**Not published, do not build against it yet:** attachment upload (`M2-BE-202`, deferred to C1),
unlock checkout and state, unlocked quotes, selection, rejection, re-validation (all BE4/Wave C2 —
no domain layer exists to wrap), and all of proposal 0013.

**Three field shapes differ from `contract-pending/types.ts`.** All are adapter-layer one-liners and
the seam is where they belong — this is the re-point §2 describes, not a rewrite:

| Your type | The wire | Note |
|---|---|---|
| `is_date_flexible: boolean` | `flexibility_days: number`, plus `is_date_flexible` | Both published. The integer is the source of truth. |
| `AttachmentKind: "PHOTO"` | `"IMAGE"` | Map in the adapter. |
| `ScanStatus` includes `CLEAN`/`INFECTED` | `PENDING \| VERIFIED \| FAILED` | `VERIFIED` is `CLEAN`. There is no `INFECTED` yet — it arrives with the C1 upload command. |

**One answered question.** Proposal 0012's `202` open question is resolved: refusals are always
`>=400`, so `m2_unlock_payment_pending` will publish as **`409` retryable**, and `202` is reserved
for genuine acceptance carrying a projection. `errors.ts` already classifies the code correctly;
only its expected status changes, and not until Wave C2 publishes the unlock.

**One caveat on all of the above.** C0 shipped with **no tests** — lint, strict types, migration
check and schema validation only. The endpoints compile and generate; none is proven against a real
request yet. Treat integration findings as likely, not surprising.

---

## 8. Status tracking

Three places, each with one writer — that is what keeps them from fighting:

| Where | Written by | When |
|---|---|---|
| `frontend-session-a.md` / `frontend-session-b.md` | That session only | Per task, as it completes |
| `03-frontend-tasks.md` checkboxes | Either session, **only on its own task IDs** | Per task |
| `task.md` phase board + verification table | The integrator only | At gates |

Never mark a task from the other session's column, even if you can see it is done. Never mark `[x]`
without integration evidence (§2). Never mark a wave complete because its files exist.

### Live tracker

Last reconciled against the codebase on **2026-08-12**.

| Wave | A status (Customer) | B status (Partner + Ops) | Gate |
|---|---|---|---|
| 0 | — | — | `[~]` built; gate turns on Product/owner approval, not engineering |
| 1 | `[~]` 15/15 built **and wired** — 4 routes mounted, guard retired, `FE-211` built. Owner verification pending | `[~]` 14/15 built **and wired** — workspaces endpoint consumed, 7 routes mounted. `FE-105` open | `[ ]` |
| 2 | `[ ]` — blocked on C2/BE4, which has no domain layer. Revision 3 rescopes A2 to `FE-216`, `FE-401..424` | `[~]` 13/13 built **and wired** — enquiry inbox, detail, accept/decline, clarification, site-visit request and both composers on 4 routes. Owner verification pending. Revision 3 adds `FE-314`/`FE-315`, blocked on C2 | `[ ]` |
| 3 | `[ ]` blocked on C3 | `[ ]` blocked on C3 | `[ ]` |
| 4 | `[ ]` blocked on C6 | `[ ]` blocked on C6 | `[ ]` |
| 5 | — | — | `[ ]` |

**Read the asymmetry in Wave 2.** Session B built `FE-301..313` against the published enquiry,
clarification and proposal paths on 12 August. Session A cannot start `FE-216`/`FE-401..424`
(revision 3 scope), because the unlock, visit-plan and selection domain layer does not exist yet —
that is Wave C2, not a missing serializer.

**Wave A1 wiring closed, 12 August 2026.** The Customer requirement flow is reachable: four routes
under `app/(flow)/requests/`, `features/requirement/queries.ts` against the generated client,
`packages/query/src/m2-requirement.ts`, and the three stale entries gone from the Customer boundary
guard. Eleven rows were added to the gap table above in the process; the two the integrator should
read first are **no merge endpoint** (`M2-FE-210` asks for one and none exists) and **the two
question schemas** (`M2-FE-202` — the client renders one and the server validates against another,
and a mismatch surfaces only when the Customer presses Send on screen 4). Session A's next task is
`M2-FE-802..808`'s customer share, since Wave A2 remains blocked on C2.

| 2026-08-13 | C | `M2-FE-301` / `M2-FE-213` | **Answered and corrected at 1.23.0.** Both `m2_requirement_list` and `m2_partner_enquiry_list` now declare a page envelope and publish a `cursor` query parameter, through `common.pagination.StrictCursorPagination` — the same mechanism `booking_group_list` uses. This was a schema correction: Django's response never changed, only what the contract claimed about it. The missing `cursor` was the second half of the same defect — a Partner with more than twenty enquiries had a silently truncated inbox. | n/a — published |
| 2026-08-13 | C | `M2-FE-310` | **Answered at 1.23.0: the wage-floor guard fires.** `POST /proposals/` derives the state from `ServiceArea.state_code` and the skill from `M2VariantConfiguration.wage_floor_skill`, both new and both Operations-owned, and refuses with `409 m2_wage_floor_unavailable` when either is unmapped. **The composer must expect this refusal on a well-formed quote** — it is not a field error and the vendor cannot clear it by changing the rate; the honest copy is that we cannot check the minimum wage for this work yet and support can help. Nothing in the request body changed. | n/a — published |
| 2026-08-13 | C | Partner enquiry detail | **New: `GET /api/v1/partner/enquiries/{id}/attachments/`** returns the Customer's checked files as signed links that expire in minutes, with `has_access: false` once the invitation is declined, expired or withdrawn and this vendor was not selected. Render the lapsed state explicitly — an empty list without the flag reads as "the Customer attached nothing". Do not cache the URLs. | n/a — published |
| 2026-08-13 | C | `M2-FE-105` / capability views | **New: `POST /api/v1/partner/capabilities/{id}/submit/`** — the Partner's own submit and resubmit. This is the button `CHANGES_REQUIRED` never had: until now only Operations could move that row, so a Partner who fixed what was asked had no way to say so. Already `UNDER_REVIEW` returns `200` unchanged, so the control can be optimistic. | n/a — published |
| 2026-08-13 | C | Partner registration | **New: `GET`/`PUT /api/v1/partner/languages/`** and `PUT /api/v1/partner/crew/{membership_id}/availability/`. Languages are an eligibility input, not profile decoration — but **declaring none is never a mismatch**, so the UI must not present the empty state as a problem to fix. Crew availability is exception-shaped: one dated statement per worker, default available. | n/a — published |
| 2026-08-13 | C | `M2-FE-104` | `GET /partner/capability-options/` gains `registration_questions` (`M2-BE-106`) and `POST /partner/capabilities/` accepts `registration_answers` and `service_area_ids`. The questions come from the same versioned schema the server validates against, so **render them, never a hand-written copy** — a client-side question list is how the two drift and the mismatch surfaces on submit. An empty `service_area_ids` means every area the Partner works in; the field can only narrow. | n/a — published |

| 2026-08-13 | C | Wave C2 / `M2-FE-401..424` | **Wave C2 is published at contract 1.24.0 — 14 new paths, 19 new operations. `pnpm contract:generate` has NOT been run; the generated client is frozen and the orchestrator regenerates it.** Nothing in Wave A2 or the revision-3 Partner scope can be built until it is. The A3 door is `GET`/`POST /requirements/{id}/unlock/`; the A5 door is `GET`/`POST /requirements/{id}/visit-plan/` plus `POST .../visit-plan/checkout/`. Full path list and every error code in `contracts/openapi/CHANGELOG.md` §1.24.0. | n/a — published |
| 2026-08-13 | C | `M2-FE-314` / `M2-FE-421` | **The candidate-visit-starts read exists: `GET /api/v1/partner/enquiries/{invitation_id}/visit-slots/`.** Same payload shape as `POST /booking/windows/` — `{server_now, visit_duration_minutes, availability_is_preliminary, timezone, days[{date, is_today, slots[{id, starts_at, ends_at, is_available, unavailable_reason}]}]}` — **minus `capacity`**, so `slots-modal.tsx` can be reused nearly verbatim. Each `id` is a signed token bound to that invitation; **post it back unchanged** to `POST` on the same path. Tokens expire, so a picker left open must re-read rather than post a stale one, and `m2_visit_slot_unavailable` is what a stale one returns. An ineligible vendor gets a grid where every slot reads `NO_CAPACITY` — render it, do not treat it as an error. | n/a — published |
| 2026-08-13 | C | `M2-FE-314` | **`opens_plan_checkout` on the confirm response is the state the Partner copy has to carry.** The first vendor to confirm on an unpaid plan gets a **held** slot, not a scheduled one: the visit reads `REQUESTED` until the Customer's plan payment is verified, and the hold lapses harmlessly if they never pay. Showing it as confirmed would promise a vendor a job that has not been bought. Later vendors on a paid plan confirm outright. | n/a — published |
| 2026-08-13 | C | `M2-FE-311` / `M2-FE-309` | **Three composer gaps closed at once.** `EnquiryDetail` now publishes `required_tax_basis` (blank means this vendor sets it) and `server_now` beside `responds_by`. `stages` is a published `ProposalStage` — `{title, deliverable, amount_paise, ends_on}` — on both the request and every read, replacing `unknown[]`. **`ProposalCreateRequest` also gained `site_visit_id`, and without it an A5 estimate could not be submitted at all**: the domain has always required a completed visit and no serializer published the field. `assumptions` is still not on the wire and is still not built. | n/a — published |
| 2026-08-13 | C | `M2-FE-301` | **`GET /api/v1/proposals/` exists** — a cursor page of the caller's own quotes, with an optional `?requirement=` filter. This is the "largest hole in Wave B2" row above: withdraw, the six proposal states and the supersession trace are now reachable after a reload. `decline`'s `reason_code` is also a published vocabulary now (`InvitationDeclineReasonEnum`), so the reason control renders from the contract rather than from a hand-written list. | n/a — published |
| 2026-08-13 | C | `M2-FE-213` / `M2-FE-215` / `M2-FE-212` | **The four Customer projection gaps are closed.** `RequirementDraft` gains `service_name`, `quote_delivery_deadline_at`, `teaser_count`, `closure_reason` and `is_free`, so `/requests/{id}` renders a countdown and a quote count from its own read rather than from the list cache, and the free-to-submit promise can be stated **before** the Send button. `RequirementSummary` gains `service_name` too — stop formatting `category_slug` into a title. | n/a — published |
| 2026-08-13 | C | `M2-FE-401..424` | **Two refusals the Customer screens must expect on a well-formed request, and neither is a field error.** `m2_access_price_unavailable` (409) means Operations has loaded no price — while owner decision 1 is open, **no unlock and no visit plan can be sold at all**, `price_paise` reads `null` and `available_tiers` is `[]`. `m2_policy_unavailable` (409) means a clock, cap or disposition rule was never decided. Both **fail closed by design**; the honest copy is that we cannot offer this yet and support can help, never a retry. | n/a — published |
| 2026-08-13 | C | Contact disclosure / callback | **Still deliberately absent at 1.24.0.** Nothing in Wave C2 discloses Customer contact, and there is no callback endpoint. `Engagement.contact_released_at` records *when* disclosure becomes permitted — A3 at engagement creation, A5 at first stage funding — but no endpoint returns a phone number. Both need an owner decision; `features/enquiry/contact-boundary.test.ts` should stay as it is. | not filed — owner decision |

**What Wave B2 found, and what the integrator should read first.** Twenty-three rows were added to
the gap table above on 12 August. Three of them are not contract gaps but defects that a test would
have caught and Wave C0 has none:

1. `m2_partner_enquiry_list` and `m2_requirement_list` **declare a bare array and return a DRF page
   envelope.** Any client written against the generated type throws on its first real request. This
   hits both columns.
2. The **wage-floor guard never runs over HTTP** — `ProposalCreateSerializer` carries neither
   argument `assert_rate_meets_wage_floor` needs, so a below-floor A3 rate is accepted and
   `m2_proposal_below_wage_floor` cannot be returned by the endpoint that documents it.
3. **An A3 total is whatever the client sends.** Only the A5 path reconciles.

And one structural hole worth deciding on before Wave 3: **a Partner cannot read their own quote
back**, so withdraw, the six proposal states and the supersession trace all end when the tab closes.
