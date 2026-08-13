# M2 Master Task Board

**Scope:** Workforce and project services (`A3_TIME_BLOCK` and `A5_CUSTOM_PROJECT`)
**Status:** P1–P4 built. **Contract 1.24.0 publishes 62 M2 operations** — 43 through the C1
remainder, plus 19 from Wave C2 (the A3 unlock, the A5 visit plan, selection, reconfirmation and the
engagement). Nine background sweeps are on Celery beat. The typed client is regenerated at 1.24.0.
**P4's whole surface is published; none of it is reachable in a browser yet** — that is Wave A2 and
`FE-314`/`315`, in flight.
HTTP tests **exist for every path and have not been run**, so no phase has passed its gate. Frontend: FE0 foundation built;
Customer Wave A1 built, wired and mounted on 4 routes, **plus requirement attachments and the voice
fast path (`FE-204`/`FE-205`)**; Partner Wave B1 built, wired to the live workspaces endpoint and
mounted on 7 routes, Wave B2 built and mounted on 4 more, and **the registration surface (`FE-105`)
mounted on 4 `/apply` routes with the sixth capability status `REJECTED` handled**.
Operations/admin: nothing started.
**Last audited:** 2026-08-13 (Gate 1 of the build sprint; see the bottom of this file).
**Source flow:** [README.md](README.md)
**Audit applied:** [06-audit-gaps-and-simplification.md](06-audit-gaps-and-simplification.md)

This is the authoritative M2 implementation status board. The backend and frontend task files contain
the detailed work. Update this file in the same change that completes a phase or changes its status.

## Revision 3 summary — visit-first A5 (owner decision, 2026-08-12)

Recorded in [ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md). A3 is untouched.
Everything in this table lands in the **unbuilt** P4 surface, so it is documentation change, not
rework:

| Changed | From (revision 2) | To (revision 3) |
|---|---|---|
| A5 front door | Remote quotes → teasers → INR 149 unlock | **Visit plan**: 1/2/3 vendors at proposed INR 49/99/199, charged only at the first confirmed visit slot |
| A5 quoting | Vendor quotes remotely from the snapshot | Vendor estimates **on site** through the existing A5 composer (price, working days, materials); estimate requires a completed visit |
| A5 quote access | Paywalled behind the unlock | Fully readable; the visit plan is the access fee, no second paywall |
| A5 visit scheduling | Ad-hoc paid site visit, no slot engine | Slots booked on the M1 grid (`carts.availability` + the checkout slot-picker pattern) |
| A5 unfilled promise | n/a | Per-slot share auto-refunds at the visit SLA |
| A5 visit money (updated 2026-08-13) | n/a | Each consumed slot share splits: **vendor visit payout** (paid on completed visit + usable estimate, via M1 payout rails) + **Vsolve platform share**. Undelivered slots refund the Customer. No stage credit — stages fund at face value. |
| Requirement states | One middle path (`QUOTES_READY → UNLOCKED`) | Archetype-split middle: A3 unchanged; A5 `MATCHING → VISITS_BOOKED → QUOTES_READY → SELECTED` |
| New aggregate | — | `VisitPlan` (plan size, price, charge state, per-slot shares); `QuoteUnlock` scoped to A3 |

## Revision 2 summary

The plan was simplified after audit. Anything below that contradicts an older copy of the M2
documents is the current truth **except where the revision 3 table above supersedes it for A5**:

| Changed | From | To |
|---|---|---|
| Fee timing | Pay INR 99/149 before matching | Requirement free; INR 149 unlock charged only after a usable quote exists |
| Packages | Two tiers with a partial-refund tier | One unlock, up to three quotes |
| Commercial mode | Per-variant `LEAD_ONLY` / `MANAGED_PAYMENT_REQUIRED` matrix | Fixed per archetype: A3 lead-only, A5 managed |
| Fulfilment model | Separate workforce and project aggregate families | One `Engagement` + `EngagementStage` spine; amendments reuse the M1 engine |
| Attendance | Per-worker check-in/check-out with offline sync | Supervisor-level daily confirmation; per-worker detail only on dispute |
| Requirement audit | Full requirement versioning | Immutable `RequirementSnapshot` written at invitation |
| Proposals | Seven states including two in-progress states | Append-only supersession, six states |
| Clarification | Full messaging subsystem | Structured question and answer on the timeline |
| Site visits | Free vendor-requested step | Paid scheduled service adjusting against the final price |
| Registration | Full KYC before the first lead | Progressive KYC gated on money |

## Status rules

- `[ ]` means not started or not demonstrated.
- `[~]` means partially implemented or blocked. Add a short note explaining completed work and the
  remaining blocker.
- `[x]` means implemented and verified against the phase exit gate. File existence, UI mockups,
  migrations, or happy-path demos alone are not completion evidence.
- Do not mark a parent phase `[x]` while any required child task or acceptance scenario is incomplete.
- Record verification evidence beside the task: contract diff, migration check, static-gate output,
  screenshots, runbook, or an approved decision record.
- Update the detailed TODO and this master board together. Never update status in only one place.
- Do not mark future phases complete because shared scaffolding was created early.

### Verification convention — owner-run, effective 12 August 2026

**No implementation session runs test cases.** Not the full suite, not a focused module, not a single
test. Tests are written as part of the deliverable and left unexecuted; **the owner runs and verifies
every one manually.** The reasoning is the owner's: an Opus-5-class session following the standards in
these documents should produce correct code without an iterate-until-green loop, and the owner would
rather hold verification than pay for an agent to hunt a passing run.

What this changes:

| | Rule |
|---|---|
| **Sessions may run** | `ruff format --check`, `ruff check`, strict `mypy`, `manage.py makemigrations --check`, `manage.py spectacular --validate`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. These are static gates, not tests, and they are still **required** before a wave is reported. |
| **Sessions must not run** | `pytest` in any form, `vitest`/`jest` in any form, Playwright, or any command whose purpose is executing a test case. |
| **How to mark work** | `[~] built — owner verification pending`. Never write "tests pass", "N/N green" or "verified" for a run that did not happen. |
| **What a session still owes** | The tests themselves, written to the same standard as before. Not running them is not permission to skip writing them — an unwritten test is a gap, and it is recorded as one. |
| **Promotion to `[x]`** | Requires the owner to report the run. A session may never self-promote a task to `[x]` on test grounds. |

Rows in the verification table at the bottom of this file that record runs which genuinely happened
(2026-08-10 and 2026-08-11) stay exactly as written. This convention governs claims made from
12 August onward.

### Build-first amendment — owner-directed, effective 13 August 2026

**For the M2 build sprint, tests are neither run nor written.** The owner's direction: build the
whole product first, get both apps running with the UI visible, then the owner tests manually; test
authoring resumes only after that manual pass, and running them stays owner-only as above.

| | Rule during the build sprint |
|---|---|
| **Sessions must not run** | Any test, unchanged from above. |
| **Sessions do not write** | Test files. Skipped test coverage is recorded per wave as one line ("tests deferred per build-first amendment") — not as individual debt rows. |
| **Still mandatory** | Every static gate: `ruff format --check`, `ruff check`, strict `mypy`, `makemigrations --check`, `spectacular --validate`, `manage.py check`, `pnpm lint --max-warnings 0`, `pnpm typecheck`, `pnpm build`. A wave is not reportable with a red static gate. |
| **How to mark work** | `[~] built — static gates green, owner manual verification pending`. |
| **What replaces tests as the wave gate** | The static gates plus a written smoke script per wave: the exact clicks/requests the owner performs to see the feature work. |
| **When this amendment ends** | After the owner's manual UI pass across both apps, the 12 August convention resumes and the deferred test debt is worked off before M2 acceptance. The completion standards in `02`/`03` still require tests for `[x]` — nothing reaches `[x]` during the sprint. |

## Payment activation boundary

`milestones.md` excludes payments and OTP from commercial M2 and activates them in M3. Money and
arrival flows are therefore **built and proved with provider test callbacks and the non-OTP fallback**
in M2, and activated with live providers in M3. No M2 exit gate may depend on a live provider.

## Ownership and handoff

| Area | Owner | Handoff rule |
|---|---|---|
| Django domain, database, jobs, payments and OpenAPI publication | Codex | Publish validated OpenAPI before frontend integration is considered complete |
| Customer, Partner and Operations Next.js applications | Claude | Submit endpoint needs in `contracts/proposals/**`; do not access PostgreSQL directly |
| Product, commercial, legal and policy decisions | Product owner | Record an explicit decision before implementation relies on it |
| Cross-system acceptance and release | Codex + Claude + Product | All acceptance gates must pass using the same deployed environment |

> **Ownership — resolved 11 August 2026, recorded in `AGENTS.md` 12 August.** The owner directed
> that **Claude runs every session for M2**, including `backend/**` and `contracts/openapi/**`, to be
> revisited when M2 closes. The table above is an M1 record. `AGENTS.md` §"Commercial M2 exception"
> now carries the same note and points at `frontend-execution-plan.md` §3 and `backend-session.md`
> as the live column ownership for M2.

## Delivery sequence

```text
P0 Scope and contract alignment
  -> P1 Partner registration and capability foundation
  -> P2 Customer requirement (free) and matching entry
  -> P3 Vendor matching, clarification and proposals
  -> P4 Access (A3 unlock · A5 visit plan), selection, reconfirmation and engagement
  -> P5 Engagement spine and stage fulfilment
  -> P5A Workforce stages (A3)
  -> P5B Project stages (A5)
  -> P6 Recovery, refunds, disputes and Operations
  -> P7 Production hardening and controlled rollout
```

P5 delivers the shared spine once. P5A and P5B are thin archetype tails and may be developed in
parallel only after P5 is stable. A service category cannot launch until its own tail and the P6
recovery paths are complete.

## The critical path — cleared 11 August 2026, extended 12 August

`M2-BE-013` was the one task gating every other column, and it is now `[~]`: **contract 1.22.0
publishes 33 M2 paths.** The frontend cap is lifted — both columns can integrate.

What changed: `apps/requirements` gained `selectors.py`, `serializers.py`, `views.py` and `urls.py`,
and `config/urls.py` now includes them. No domain module was edited; every state change delegates to
a command that already existed behind the 91 passing tests. Details and the residual gaps are in
[backend-session.md](backend-session.md) §"C0 outcome".

**Wave C1 added 16 paths on 12 August**: attachment presign/finalize/remove, site-visit scheduling
and completion, and all thirteen paths of proposal 0013 — Partner business profile, capability
options/request/list/withdraw, insurance, progressive gates, crew CRUD and the masked demand preview.
Both of 0013's open design questions are answered in that file: a capability rejection is now its own
`REJECTED` status, and document validity lives on a nullable `PartnerDocument.expires_on`. Details in
[backend-session.md](backend-session.md) §"C1 outcome".

**It is still `[~]`, not `[x]`, and the reason has changed.** C1 closed both things that held it open
in substance: **object-level authorization tests now exist for all 33 paths**, and the CI question was
**raised with the owner and deliberately deferred** — the repository has no pipeline of any kind, so
standing one up is M1 platform work serving every column rather than an M2 deliverable. What keeps
`M2-BE-013` at `[~]` is the verification convention itself: the tests are written and **the owner has
not run them**, and a session may never self-promote on test grounds.

**Wave C1 remainder added 4 paths on 13 August at contract 1.23.0** and corrected two declared
shapes. Attachment access expiry (`M2-BE-310`) is published; the wage-floor defect (`M2-BE-317`) is
closed — `POST /proposals/` can now return `m2_proposal_below_wage_floor`, and refuses with
`m2_wage_floor_unavailable` rather than skipping when Operations has not mapped the variant or the
area. Both list operations now declare the page envelope they always returned. Details in
[backend-session.md](backend-session.md) §"C1 remainder outcome".

Still unpublished, and named so nobody builds against them by mistake: the whole unlock/selection path
(BE4 — no domain layer to wrap) and the engagement spine (C3).

## Session map — three columns

| Session | Column | File | Depends on |
|---|---|---|---|
| **C** | `backend/**`, `contracts/openapi/**` | [backend-session.md](backend-session.md) | Nothing. **Start here.** |
| **A** | `frontend/apps/customer` (+ `admin/features/m2-cases` from Wave 4) | [frontend-session-a.md](frontend-session-a.md) | Gate 0 (passed for build purposes); Session C for integration |
| **B** | `frontend/apps/partner`, `frontend/apps/admin` | [frontend-session-b.md](frontend-session-b.md) | Gate 0; Session C for integration |

All three run concurrently. A and B keep building at `[~]` while C publishes — integration is a
re-point, not a rewrite, by design. The three columns share no source file;
[frontend-execution-plan.md](frontend-execution-plan.md) holds the ownership map, the frozen-module
list, the append-only barrel rule and the four sync gates. FE0 and the cross-app release pass are the
only sequential stretches on the frontend side.

## Phase board

### P0 - Scope, policy and contract alignment

**Status `[~]`** — the engineering design is complete; the product, legal and commercial decisions are
open and owned by the Product owner. Implementation reads every blocked value from configuration and
fails closed when unset, so no decision is hidden behind a default in code.

Engineering design — done:

- [x] Approve the roadmap decision that brings the required A3/A5 capability slices into commercial M2.
  Evidence: [ADR-0007](../../docs/adr/0007-m2-engagement-spine-and-fee-after-value.md).
- [x] Define state machines, commands, permissions, audit events and API errors.
  Evidence: [07-state-machines-and-permissions.md](07-state-machines-and-permissions.md).
- [x] Map every Customer, Partner and Operations route, the seven navigation states and the two
  responsive archetype flows.
  Evidence: [08-frontend-information-architecture.md](08-frontend-information-architecture.md); the
  Partner half is implemented as code in `frontend/apps/partner/features/workspace/registry.ts`.
- [~] Publish the first validated M2 contract.
  **Published 2026-08-11 at 1.21.0 (17 paths) and extended 2026-08-12 to 1.22.0 (33 paths).**
  Proposals 0012 and 0013 are both reviewed, answered and implemented; 0012's open question on `202`
  refusals and both of 0013's design questions are answered in those files. Still open before `[x]`:
  **the owner has not run the authorization tests**, which now exist for every path; and **contract
  validation is not in CI by owner decision** — there is no `.github/` and no pipeline of any kind, so
  it is logged as M1 platform work rather than built inside an M2 wave. See the file-history note in
  `03-frontend-tasks.md` under `M2-FE-006` — proposal 0012 was written twice on 2026-08-10 and the
  earlier version was overwritten unrecoverably.

Owner decisions:

- [x] Approve the commercial model **shape**. **Decided 2026-08-12** (ADR-0008): free requirement for
  both archetypes; A3 keeps the INR 149 unlock after a usable quote exists; A5 is visit-first with a
  tiered visit plan charged only at the first confirmed visit slot, estimates readable in full.
- [x] Approve one commercial mode per archetype (A3 lead-only, A5 managed) and reject per-variant
  modes. Reaffirmed by ADR-0008.

Owner decisions — **blocking, not started**:

- [ ] Approve the final A5 visit-plan tier prices (proposed INR 49/99/199) and the exact per-slot
  split percentages: vendor visit payout versus Vsolve platform share. (The split **shape** is
  decided 2026-08-13: pass-through to the visiting vendor on completed visit + usable estimate; no
  stage credit.)
- [ ] Approve the quote-delivery SLA (A3), the visit-delivery SLA and post-visit estimate window
  (A5), and vendor reconfirmation deadlines per category.
- [ ] Approve the customer no-show policy for a confirmed visit: the vendor payout pays; decide the
  platform-share disposition.
- [ ] Approve the definition of a usable quote/estimate, the out-of-budget rule and the
  non-responsive rejection cap.
- [ ] Approve commission visibility on A5 proposals and the single tax basis for competing quotes.
- [ ] Approve GST, invoicing and principal-versus-agent treatment per mode, including the unlock fee
  and the visit-plan fee.
- [ ] Approve the worker insurance, injury liability and safety-incident position.
- [ ] Approve the minimum-wage floor source and enforcement per state and skill.
- [ ] Resolve the wallet contradiction between this plan and `milestones.md` M3.
- [ ] Confirm the M2/M3 milestone boundary given that `milestones.md` excludes payments and OTP from M2.
- [ ] Approve the unit economics model: Operations touches per request against INR 149 (A3) and per
  visit against the plan tiers (A5).
- [ ] Freeze which launch categories are A3 and which are A5, confirming per A5 category that a
  physical visit is the right consult shape.
- [ ] Approve contact disclosure, cancellation, dispute, payout, tax and compliance policies.
- [ ] Approve the M2 OpenAPI proposal and publish the first validated contract.

**Exit gate:** Decisions have owners and dates; no unresolved policy is hidden in code or UI. The
blocking decisions in `README.md` are all resolved. **Gate not passed** — the model shape is decided
(ADR-0008); its values and the remaining policy decisions are open.

### P1 - Partner registration and capability foundation

**Status `[~]`** — backend domain layer built and **verified: 26/26 tests pass** (2026-08-10).
`GET /api/v1/partner/workspaces/` published at 1.21.0 and **consumed by the Partner shell**; the rest
of the registration surface is proposal 0013 and unpublished. Frontend Wave B1 built (14/15) with all
7 workspace routes mounted; the `capability/` and `crew/` registration views remain route-less.

- [~] Backend partner business, crew, skill, service-area and availability records are production-ready.
  Business profile, crew and capability models built. **Service-area scoping on the capability and
  crew availability landed 13 August** — `PartnerCapability.service_areas` (empty means every area
  the Partner serves; it can only subtract from `PartnerServiceArea`) and `CrewAvailabilityException`
  (dated, per membership, upserted). `[~] built — static gates green, owner manual verification
  pending`.
- [~] Backend capability review and lifecycle eligibility rules are enforced server-side.
  `transition_capability` and `assert_capability_active` implemented; since 13 August the guard also
  checks **service area and the Partner's published calendar** when the caller supplies them, which
  the enquiry-accept and proposal-submit paths now do. **Insurance is still not checked** — owner
  decision 6. `[~] built — static gates green, owner manual verification pending`.
- [~] Progressive registration works: browse masked demand before KYC; KYC before first enquiry accept;
  payout details before first payout; crew roster before first crew assignment.
  All three gates implemented as domain guards. No HTTP surface, so browse-before-KYC is unproven.
- [~] Worker insurance and liability declaration is captured and reviewed for workforce capabilities.
  Model built; approval-time enforcement blocked on owner decision 6.
- [~] Crew members have a global identity so one person cannot be double-booked through two agencies.
  `CrewMember.identity_hash` unique globally; `assert_crew_available` rejects cross-agency conflicts.
- [~] Identity clustering links Partner accounts sharing a phone, PAN, bank account or device.
  Model and `clustered_partner_ids` built; consumed by matching in P3.
- [~] Backend publishes approved capabilities as `{workspace_key, actions[]}` without treating
  profession/skill names as lifecycle or route identifiers.
  `workspace_grants` built, returns no routes or labels, and is **published as
  `GET /api/v1/partner/workspaces/`** at contract 1.21.0. Unproven by any authorization test.
- [~] The same Partner app renders contextual A1, A3 and A5 workspace navigation; existing A1 Partners
  retain Offers/Jobs while M2 Partners receive Workforce and/or Projects.
  Built and wired: `partner-shell.tsx` reads the live endpoint through `features/workspace/queries.ts`;
  A1 navigation is asserted to be exactly `BASE_NAV`. `[~]` because no real approved-A3/A5 Partner has
  been exercised end to end against a seeded backend.
- [~] Multi-capability Partners can switch workspace families without mixing lifecycle records.
  `workspace-switcher.tsx` built and unit-tested; backend returns separated action lists per workspace.
  Not proven against a real multi-capability account.
- [x] Unknown workspace keys render nothing in the frontend registry.
  `registry.test.ts` asserts an unknown key resolves to nothing and no workspace resolves to `/jobs`;
  backend omits unknown archetypes from the grant list.
- [~] Operations can review, request corrections, approve, suspend and audit capabilities, and
  suspension routes funded engagements to replacement or refund.
  Review and audit built. **Suspension does not yet route funded engagements** — `M2-BE-113` needs the
  P5 engagement aggregate.

**Exit gate:** A new Partner can register progressively, see masked demand before KYC, pass review and
then see only the authorized workspace/actions for their approved lifecycle capability; skill names
alone never change navigation. **Gate not passed** — the workspace read is published and consumed,
but the whole registration surface (proposal 0013) is unpublished, so "register progressively and see
masked demand before KYC" cannot be demonstrated at all; and no authorization test exists for the one
path that is live.

### P2 - Customer requirement and matching entry

**Status `[~]`** — backend domain layer built and **verified: 31/31 tests pass** (2026-08-10).
7 requirement paths published at 1.21.0 with **no tests**. Frontend Wave A1 built (14/15) but
**mounts no route and calls no endpoint** — `features/requirement/` contains zero `useQuery`.

- [~] Backend stores guided answers, attachments, language and consent safely on a free requirement.
  Answers, language and attachment metadata modelled. **Upload command and malware scan not built.**
- [~] Requirement carries a hard `service_by` date that auto-closes matching when it passes.
  Field, selector and idempotent close command built. **No schedule wired.**
- [~] Lifecycle is inferred from answers, shown in plain language, and reclassifiable by Operations
  without a second charge.
  Inference and reclassification built. **Plain-language summary not built**; invitation voiding is P3.
- [~] Probable duplicate requirements are detected and offered a merge.
  Detection and an explicit override built. **Merge not built.**
- [ ] Customer can create, review, edit and submit a four-screen requirement on mobile and desktop.
  Frontend not started.
- [ ] An A5 requirement carries a chosen visit plan from the review screen (`choose_visit_plan`,
  charges nothing, bounds the wave); an A3 requirement never renders the chooser. **Revision 3 — not
  started.**
- [~] Voice capture is a first-class fast path with language recorded for routing.
  Language and transcript fields carried. **No transcription adapter, no capture UI.**
- [~] Requirement submission emits matching work with no payment precondition.
  `m2.requirement.submitted` emitted through the M1 outbox, keyed so a replay cannot double-match.
- [ ] Customer request timeline shows matching status, teasers, the SLA deadline and recovery states.
  Frontend not started.

**Exit gate:** A submitted requirement is free, complete, correctly classified and enters matching
exactly once, with an honest delivery promise and a hard expiry. **Gate not passed.**

### P3 - Matching, clarification and proposals

**Status `[~]`** — backend domain layer built and **verified: 34/34 tests pass** (2026-08-10).
Enquiry, proposal, clarification and teaser paths published at 1.21.0 with **no tests**. No frontend —
Session B Wave B2 (`FE-301..313`) is not started.

- [~] Eligible vendors are ranked, invited and slot-reserved without duplicate or excessive exposure.
  Waves bounded by size and free slots; one account per beneficial owner. **Real ranking signals
  landed 13 August** — prior relationship with this Customer, a coarse 5 km distance band,
  least-recent invitation, then Partner id as the stable tie-break; `MATCHING_POLICY_VERSION` is 2
  and the per-candidate signals are recorded on the invitation but published on no read. A Partner
  with no fresh location fix is scored at the pool's median band, never last.
  `[~] built — static gates green, owner manual verification pending`.
- [~] Eligibility includes travel feasibility for the date, language and recent responsiveness.
  Responsiveness done (21-day presence window). **Travel feasibility and language landed 13 August**
  — vendor language is captured as `PartnerLanguage` with `GET`/`PUT /partner/languages/` and
  compared on the primary subtag; a vendor who declared nothing is never excluded, because absence of
  a declaration is not a mismatch. Travel feasibility reuses the M1 commit window and travel estimate
  against the requested start. `[~] built — static gates green, owner manual verification pending`.
- [~] Accepting an invitation takes a soft capacity hold for the requested dates.
  Done, and fed back into eligibility. **It consults `carts.availability` since 13 August** — both at
  wave time and again at acceptance, where it raises `m2_capacity_unavailable`, so an A1 booking and
  an M2 hold can no longer overlap on the same day. Hard hold at selection is still P4.
  `[~] built — static gates green, owner manual verification pending`.
- [x] An immutable `RequirementSnapshot` is written at each invitation.
  Content-hashed; vendors seeing unchanged content share one row.
- [x] Deadlines are computed in business hours against a holiday calendar.
  Invitation `responds_by` runs through `requirements.sla`, reusing the M1 operating windows.
- [~] Invitation expiry, decline reasons, replacement and no-response recovery are automatic.
  Expire, decline-with-reason and withdraw commands exist. **Nothing is automatic** — the sweeps are
  selectors with no schedule, so an unanswered wave stalls.
- [~] Customer and vendor clarify scope through structured questions, callback requests and paid site visits.
  Structured Q&A and paid site visits built. **Callbacks not started**; visit fee is not charged yet.
- [x] Vendors submit append-only proposals; A3 uses the one-screen composer and A5 the full composer.
  Supersession preserves the original offer; A3 and A5 shapes validated separately.
- [~] A3 rates are validated against the applicable minimum-wage floor.
  **Closed 13 August.** State and skill are derived from the requirement — `ServiceArea.state_code`
  and `M2VariantConfiguration.wage_floor_skill`, both Operations-owned — and never accepted from the
  vendor. Unmapped either way refuses with `m2_wage_floor_unavailable`, so the guard **fails closed
  and blocks A3 quoting** until Operations loads the mapping and a floor (owner decision 7).
  `[~] built — static gates green, owner manual verification pending`.
- [x] Competing proposals for one requirement use a single tax basis and display commission treatment.
- [x] Identity clustering prevents one beneficial owner filling more than one slot.
- [ ] Price-band outliers raise a review signal without automatic penalty.
  Not started: needs a reference price per variant.
- [~] Attachment access expires with the invitation for non-selected vendors.
  Built 13 August: `GET /partner/enquiries/{id}/attachments/` mints short-lived signed links only
  while the invitation holds a quote slot, and reports lapsed access as `has_access: false` on a
  `200` rather than an error. **`RequirementSnapshot` deliberately does not copy attachments** — a
  frozen copy would be a second grant that outlives the invitation it came from, and resolving live
  is also what decides what a vendor sees when a file is scanned after their invitation.
  `[~] built — static gates green, owner manual verification pending`.
- [~] Contact disclosure and clarification events are consented, limited and auditable.
  Contact-sharing heuristic flags for review without auto-banning. **Disclosure itself is not built.**

**Exit gate:** Usable quotes are delivered inside the declared SLA or the documented replacement and
closure path executes automatically. Nothing has been charged. (Revision 3: this gate demonstrates
end to end on A3; the A5 estimate path additionally needs P4's visit surface, since an A5 estimate
requires a completed visit.) **Gate not passed** — the "nothing charged" half holds; automatic
replacement does not exist.

### P4 - Access (A3 unlock · A5 visit plan), selection, reconfirmation and engagement

**Status `[~]`** — the whole backend surface is built and published at contract 1.24.0 (Wave C2,
13 August). Revision 3 split this phase into the two archetype front doors, and nothing in it was
built before the split, so no rework exists. **The frontend halves are in flight** (Wave A2 and
`FE-314`/`315`), which is why every row below is `[~]` and not `[x]`: a published path nobody can
reach has not demonstrated anything.

A3 — quote unlock (unchanged from revision 2):

- [~] Quote teasers expose verification, rating, vendor type and a price band only. Published at
  1.21.0; the full-quote read behind the unlock is `GET /requirements/{id}/quotes/` at 1.24.0.
- [~] The INR 149 unlock is server-priced, payment-backed and offered only when a usable quote
  exists. **The price is not INR 149 in code** — it is an effective-dated `M2AccessPrice` row, and
  while none is loaded nothing can be sold (`m2_access_price_unavailable`). Owner decision 1.
- [~] One successful payment grants exactly one unlock under duplicate webhooks and retries.
  `requirements_one_live_unlock_per_requirement` makes it a database fact rather than a convention.
- [~] Non-responsive rejection releases a slot and triggers replacement within the configured cap.
  The cap fails closed — it refuses the *free replacement*, never the rejection itself.

A5 — visit plan (revision 3):

- [~] `VisitPlan` is server-priced in paise per tier; choosing a plan charges nothing.
- [~] A vendor confirms a visit slot booked against `carts.availability`; the first held slot opens
  the plan checkout, and only a verified provider callback charges the plan and hardens the booking.
  The slot is an `assignments.Reservation`, so a visit and an A1 booking cannot double-book **by
  exclusion constraint**, without either flow knowing about the other.
- [~] One successful payment charges exactly one plan under duplicate webhooks and retries; later
  slots book without further payment.
- [~] Unfilled plan shares auto-refund at the visit SLA; vendor no-show and estimate-not-submitted
  refund or replace the share and hit vendor standing. Four sweeps, all idempotent by state.
- [~] Visit arrival is confirmed through the non-OTP fallback (start OTP is M3).
- [~] The A5 composer submits on site against a completed visit (`m2_visit_not_completed` otherwise)
  and its estimates are fully readable with no second paywall. **The guard was unreachable until
  1.24.0** — `ProposalCreateRequest` carried no `site_visit_id`, so an A5 estimate could not be
  submitted over HTTP at all.

Shared:

- [~] Customer selection creates a time-limited vendor reconfirmation request. One live selection per
  requirement is a unique constraint; the withdrawn "multiple lots" allowance stays withdrawn.
- [~] Validity expiry offers a one-tap re-validation request that reuses the existing unlock or plan.
- [~] Rejection, expiry or changed availability preserves the unlock/plan entitlement and offers the
  next quote, estimate or a replacement visit free. The proposal is `LAPSED`, never `REJECTED`.
- [~] A3 completes as a connection with released contact; A5 opens stage funding at face value while
  consumed visit shares pay out (vendor payout + platform share) through the M1 rails.
- [~] Managed stage payment is collected before protected A5 work starts. Stages fund in order and
  one at a time; `contact_released_at` and `work_may_start_at` stay null until the first is funded.
- [~] Both parties receive the final scope, commercial terms, cancellation policy and receipt.
  Receipts allocate from `DocumentSequence` under an `M2A-` series; the **GST and invoicing basis of
  the unlock and visit-plan fees is owner decision 5 and open.**

**Exit gate:** Money is collected only against a real accepted commitment — a usable quote (A3) or a
confirmed visit (A5); selection is not treated as a booking until vendor reconfirmation and the
archetype's own confirmation condition both succeed. **Gate not passed** — the backend half holds
end to end, and neither front door is reachable in a browser until Wave A2 and `FE-314`/`315` land.

### P5 - Engagement spine

- [ ] One `Engagement` aggregate is created from a selected proposal for both archetypes.
- [ ] `EngagementStage` models a shift-day or a milestone with the same evidence, approval and money
  release semantics.
- [ ] Scope amendments reuse the M1 amendment engine for both A3 time extensions and A5 change orders.
- [ ] Stage approval, correction, dispute and timeout behave identically across archetypes.
- [ ] No scope or money change is possible through clarification or a unilateral UI action.

**Exit gate:** Both archetypes run on one spine with one set of stage commands, and no duplicate
agreement, amendment or approval subsystem exists.

### P5A - Workforce stages (A3)

- [ ] Vendor assigns eligible named crew per shift-day without silently changing the engagement.
- [ ] Customer can review crew details appropriate to the service and privacy policy.
- [ ] Supervisor-level daily attendance confirmation with one-tap Customer confirm or dispute.
- [ ] Per-worker discrepancy detail is captured only when the Customer disputes.
- [ ] Missing check-out settles at the agreed shift length, flagged, and is disputed only on Customer dispute.
- [ ] Unapproved overtime is unpaid unless confirmed inside the retroactive window; terms state this up front.
- [ ] No-show, partial crew, late arrival, Customer unavailable and unsafe site are auditable.
- [ ] Safety incidents are first-class records with their own report flow, not cancellation reasons.
- [ ] Customer and vendor confirm completion; exceptions enter a case instead of auto-settlement.

**Exit gate:** A multi-worker, multi-day engagement can complete, partially complete or fail safely,
with correct settlement and no per-worker device dependency.

### P5B - Project stages (A5)

- [ ] Selected proposal becomes an engagement with funded stages whose totals reconcile to the agreement.
- [ ] Vendor submits stage evidence and Customer can approve, request correction or dispute it.
- [ ] Material advances use a distinct money purpose with their own recovery rule.
- [ ] Customer-caused delay claims produce evidence-backed schedule extension.
- [ ] Vendor abandonment can transfer remaining stages to a replacement vendor with the delta settled.
- [ ] Warranty retention is held back from the final stage and released at warranty close.
- [ ] Digital deliverable handover and Customer acceptance happen on the platform.
- [ ] Completion, warranty window, refund and payout rules are enforceable.
- [ ] Event/media and construction-project variants pass their category acceptance scenarios.

**Exit gate:** No scope, stage amount or payout can change through clarification or unilateral UI
action, and an abandoned project has a path to being finished.

### P6 - Recovery, refunds, disputes and Operations

- [ ] Operations has one request workspace spanning matching, unlock, proposals, engagement and cases.
- [ ] Assisted clarification and assisted quote capture act on behalf of a named Partner with audit logs,
  and assisted A3 quote capture is treated as a primary path.
- [ ] Requirement reclassification preserves any unlock and restarts matching without a second charge.
- [ ] Cancellations after contact disclosure require dual confirmation or Operations review.
- [ ] Refunds are idempotent, ledger-backed, reconciled and communicated without false guarantees.
- [ ] Off-platform leakage signals trigger proportionate review, not unsupported automatic punishment.
- [ ] Every stuck state has a timeout, owner, next action and Customer-facing explanation.
- [ ] Operations touches per request are measured against the approved unit economics model.

**Exit gate:** The worst-case matrix in `04-acceptance-and-cutover.md` passes end to end.

### P7 - Hardening, rollout and operations readiness

- [ ] Authorization, privacy, upload security, abuse controls and financial concurrency are tested.
- [ ] Accessibility, responsive layouts and low-bandwidth/retry behavior meet release criteria.
- [ ] Queues, webhooks and external providers have retry, idempotency and reconciliation runbooks.
- [ ] The notification escalation ladder is defined and tested; no deadline depends on an unread in-app notice.
- [ ] Dashboards and alerts cover the success measures in `README.md` plus cancellations, refunds and
  leakage signals.
- [ ] Feature flags gate new purchases only; in-flight requirements and funded stages survive a flag-off.
- [ ] Migration, backfill, rollback, support training and controlled rollout plans are approved.
- [ ] Backend and frontend quality commands pass from clean checkouts.

**Exit gate:** Product, Engineering and Operations sign off a limited rollout with rollback available.

## Overall completion gate

M2 is complete only when:

- [ ] Every required phase above is `[x]` with evidence.
- [ ] Both launch archetypes pass role-based end-to-end acceptance in the same environment.
- [ ] The generated OpenAPI contract and frontend clients are synchronized.
- [ ] Payments, refunds, ledger entries and payouts reconcile under retries and duplicate test callbacks.
- [ ] No critical or high security, privacy, accessibility or data-integrity issue remains open.
- [ ] Operations can recover all documented worst cases without database edits.
- [ ] Production dashboards, alerts, runbooks and accountable owners are active.
- [ ] Declared success measures have baselines and targets.

## Owner verification queue

Every session appends here when it writes tests it did not run, per the verification convention
above. The owner runs them, records the result, and clears the row. **A row is not evidence — it is
an outstanding debt.** If this table grows faster than it drains, the `[~]` marks below are resting
on unexecuted code and the board is quietly drifting toward the thing it exists to prevent.

| Date | Session | Test files written | Command to run | Result |
|---|---|---|---|---|
| — | — | *(empty at the time the convention was adopted)* | — | — |
| 2026-08-12 | B (Wave B2, `FE-301..313`) | **12 unit/component files.** Node: `apps/partner/features/enquiry/model/{enquiry-state,decline-reasons,requirement-facts,wire}.test.ts`, `apps/partner/features/enquiry/{queries,contact-boundary}.test.ts`, `apps/partner/features/proposal/model/{proposal-draft,proposal-state}.test.ts`. jsdom: `apps/partner/features/enquiry/view/{enquiry-list,enquiry-detail}.test.tsx`, `apps/partner/features/proposal/view/{a3-composer,a5-composer}.test.tsx` | `cd frontend && pnpm vitest run apps/partner/features/enquiry apps/partner/features/proposal` | |
| 2026-08-12 | B (Wave B2, `FE-301..313`) | **1 Playwright file:** `frontend/e2e/m2-partner-enquiry.e2e.ts`. Needs the new `partner-m2` project added to `playwright.config.ts` in the same change, and a built + started `apps/partner` on :3001 | `cd frontend && pnpm build --filter=partner && pnpm exec playwright test --project=partner-m2` | |
| 2026-08-12 | A (Wave A1 wiring, `FE-201..215`) | **9 unit/component files.** Node: `packages/query/src/m2-requirement.test.ts`, `apps/customer/features/requirement/model/state.test.ts`, `apps/customer/features/requirement/adapters/{draft,tracking}.test.ts`, `apps/customer/features/requirement/boundary.test.ts`, `apps/customer/features/booking/contract-pending/boundary.test.ts` (guard entries changed). jsdom: `apps/customer/features/requirement/queries.test.tsx`, `apps/customer/features/requirement/view/{material-edit-notice,duplicate-notice,requirement-sent}.test.tsx` | `cd frontend && pnpm vitest run packages/query/src/m2-requirement.test.ts apps/customer/features/requirement apps/customer/features/booking/contract-pending` | |
| 2026-08-12 | A (Wave A1 wiring, `FE-201..215`) | **1 Playwright file:** `frontend/e2e/m2-customer-requirement.e2e.ts` with `frontend/e2e/support/requirement-api.ts`. The `customer-m2` project is added to `playwright.config.ts` in the same change; needs a built + started `apps/customer` on :3000. **Covers `/requests` and `/requests/{id}` only** — the four-screen flow reads the catalog during a server render, where `page.route` cannot reach | `cd frontend && pnpm build --filter=customer && pnpm exec playwright test --project=customer-m2` | |
| 2026-08-12 | A (Wave A1 wiring) | **Regression risk, not a new file.** The whole existing customer suite should be re-run: `contract-pending/` was deleted, `DraftAttachment.kind` renamed `PHOTO`→`IMAGE`, `failure` renamed `INFECTED`→`SCAN_FAILED`, `DuplicateNotice` changed from `onMerge` to `hrefFor`, `RequirementWorkspace` gained `onAdvance`/`isAdvancing`, and `toRequestRow` now returns `null` for an unknown status | `cd frontend && pnpm vitest run apps/customer` | |
| 2026-08-12 | C (Wave C1) | `backend/tests/requirements/conftest.py` — shared M2 HTTP fixtures: two Customers, two vendors, an Operations reviewer, a Partner-role account with **no** `PartnerProfile`, and a fake signed-upload provider. Every record is built through a real domain command, so no test can pass against a state the commands refuse | *fixtures only — exercised by the five files below* | |
| 2026-08-12 | C (Wave C1) | `backend/tests/requirements/test_m2_http_authorization.py` — **object-level authorization for all 33 published paths.** A 38-row anonymous route table; a parametrised foreign-Customer sweep over 7 requirement routes; a parametrised foreign-vendor sweep over 5 enquiry routes; the Customer-session refusal over all 24 `partner/**` operations; and **exhaustive-key snapshots** of the teaser, demand preview and crew roster so a field added later fails rather than leaks | `cd backend; .\.venv\Scripts\python.exe -m pytest tests/requirements/test_m2_http_authorization.py -q` | |
| 2026-08-12 | C (Wave C1) | `backend/tests/requirements/test_m2_sweeps.py` — the four sweeps plus attachment housekeeping, each run twice; the **no-double-invite** replay case; `CELERY_BEAT_SCHEDULE` asserted as configuration so renaming a sweep fails a test instead of silently unwiring a watchdog | `cd backend; .\.venv\Scripts\python.exe -m pytest tests/requirements/test_m2_sweeps.py -q` | |
| 2026-08-12 | C (Wave C1) | `backend/tests/requirements/test_m2_attachments.py` — presign, finalize, checksum/size/media-type mismatch, per-kind ceilings, expired intent, replayed finalize under one key and under a new one, `INFECTED` vs `FAILED`, contradictory scan verdicts, removal, and the storage-deletion-failure fallback | `cd backend; .\.venv\Scripts\python.exe -m pytest tests/requirements/test_m2_attachments.py -q` | |
| 2026-08-12 | C (Wave C1) | `backend/tests/requirements/test_m2_registration_surface.py` — the HTTP half of proposal 0013: business profile field errors, capability options copy and `asks_for`, request/duplicate/withdraw, insurance, gates (including **read-and-refusal copy parity**), crew add `201` vs reinstate `200` | `cd backend; .\.venv\Scripts\python.exe -m pytest tests/requirements/test_m2_registration_surface.py -q` | |
| 2026-08-12 | C (Wave C1) | `backend/tests/partners/test_m2_capability_lifecycle.py` — the domain half of proposal 0013: `REJECTED` vs `WITHDRAWN`, mandatory review notes in **both** the command and the check constraint, document expiry, business-type constraints, insurance re-declaration clearing `verified_at`, gate copy parity, crew reinstatement and the masked phone | `cd backend; .\.venv\Scripts\python.exe -m pytest tests/partners/test_m2_capability_lifecycle.py -q` | |
| 2026-08-12 | C (Wave C1) | **All six at once, plus the existing 91 domain tests.** This is the run that decides whether `M2-BE-013`, BE1, BE2 and BE3 can be promoted — nothing in Wave C1 is proven until it is green | `cd backend; .\scripts\quality.cmd` | |

**Why it starts empty, which is worth stating plainly.** Every test written for M2 before 12 August
was also executed at the time — the 91 domain tests on 10 August, and the frontend suite on 11 and
12 August. Those runs happened and their rows in the verification table below stand. The queue is a
forward-looking ledger, not a backlog.

**What was not in this queue on 12 August because it did not exist** — no test file for any
published HTTP path — is now the last seven rows above: roughly 160 test functions across five files,
written and unexecuted.

**Two gaps the queue cannot cover, because those tests are unwritten rather than unrun.** Rate limits
(`M2-BE-803`) and true two-transaction concurrency on quote slots and capacity holds
(`M2-BE-323`/`M2-BE-804`) have no tests at all. The guards are written under `select_for_update`; that
is unproven. Both are recorded in `02-backend-tasks.md` rather than counted here, because a row in this
table promises the owner something to run.

## Latest verification

| Date | Phase | Status | Evidence | Verified by |
|---|---|---|---|---|
| 2026-08-10 | Planning | Revision 2 applied | Audit `06-audit-gaps-and-simplification.md` folded into all M2 documents | Claude |
| 2026-08-10 | P0 | `[~]` design done, decisions open | ADR-0007 accepted; `07-state-machines-and-permissions.md` covers 5 state machines, 30 commands, 5 actor roles, 29 error codes | Claude |
| 2026-08-10 | P1 | `[~]` domain verified | 10 models + 2 migrations (`catalog.0005`, `partners.0006`); `apps/partners/capabilities.py`. **26/26 tests pass.** Ruff, strict MyPy and `makemigrations --check` clean. Gate still open: no HTTP surface, `M2-BE-113` needs P5. | Claude |
| 2026-08-10 | M1 reuse audit | Complete | 20 reusable modules verified against source; 3 would have been rebuilt in P2 (business-hours calendar, versioned question schema, storage adapter). Reuse table in `02-backend-tasks.md` rewritten; `M2-BE-202/203/212` reworded. | Claude |
| 2026-08-10 | P2 | `[~]` domain verified | `apps.requirements` (3 models, `sla.py`, `services.py`, `exceptions.py`) + `catalog.M2VariantConfiguration`; migrations `catalog.0006`, `requirements.0001`. **31/31 tests pass.** Ruff, strict MyPy and `makemigrations --check` clean. Gate still open: no HTTP surface, upload/transcription/merge unbuilt, sweeps unscheduled. | Claude |
| 2026-08-10 | P3 | `[~]` domain verified | `requirements/matching.py` + `proposals.py`; 6 new models (snapshot, invitation, capacity hold, proposal, question, site visit) in migrations `requirements.0002`/`0003`. **34/34 tests pass.** Ruff, strict MyPy, `makemigrations --check` clean. Two bugs found by the suite: cluster constraint spanned `INVITED` (a single wave with two sibling accounts would have raised `IntegrityError`), and the wave did not de-duplicate clusters. Both fixed. | Claude |
| 2026-08-10 | FE0 (frontend foundation) | `[~]` quality gates green, gate not passed | IA doc (13 Customer + Partner + 6 Operations routes, 7 nav states, 2 archetype flows); proposal 0012; workspace registry + switcher; 7 shared `@vsolve/ui` primitives; 29 error codes + 8-category layer; `m2-keys.ts` (7 domains, freshness tiers, 28-command invalidation map); `analytics.ts` (38 events, 27-key allow-list). **`pnpm lint` clean at `--max-warnings 0`; full `pnpm typecheck` green across all 9 packages including `contract:check` at contract 1.20.0.** Two pre-existing bugs fixed to get there: CRLF-vs-LF false staleness in `generate.mjs`, and a missing `intended_role` in the admin step-up gate. **No tests written** (owner-directed) and **no endpoint called**, so nothing exceeds `[~]`. Gate turns on Product/Codex approval, not engineering. | Claude |
| 2026-08-10 | Frontend parallelisation | Planned | `frontend-execution-plan.md` + two session files: FE1–FE7 split into Customer (49 tasks) and Partner/Operations (48 tasks) columns sharing no source file; ownership map, frozen modules, append-only barrels, 4 sync gates. Two sequential stretches only: FE0 and the cross-app release pass. | Claude |
| 2026-08-10 | Notifications (`M2-BE-807`) | `[~]` verified | WhatsApp + voice channels and kill switches; `notifications/escalation.py` ladder; `notifications/transport.py` fail-closed seam for MSG91; production refuses the fake. Migration `notifications.0002`. **13/13 tests pass.** Sending still unwired — MSG91 pending. | Claude |
| 2026-08-10 | Wave A1 (Customer requirement) | `[~]` 11 of 15 built | `features/requirement/` full `contract-pending → model → adapters → view` stack: 4 screens, reducer with answer→verdict invalidation cascade, save-and-resume, duplicate notice. `pnpm lint` clean at `--max-warnings 0`; `pnpm typecheck` green across 9 packages; **11/11 boundary tests pass** including `SCREENS.length === 4`. No route mounted, no query mounted, no fixture in app code. `FE-207` partial, `FE-211` blocked on server state, `FE-213..215` open. | Claude |
| 2026-08-11 | P0 / `M2-BE-013` (Wave C0) | `[~]` published, gate open | **Contract 1.21.0 publishes 17 M2 paths** — requirement capture, teasers, clarification, Partner enquiries, proposals and `GET /partner/workspaces/`. `apps/requirements/{selectors,serializers,views,urls}.py` + `config/urls.py`; no domain module edited. Proposal 0012 reviewed and its `202` question answered. Ruff, **strict MyPy across 13 files**, `makemigrations --check` and `spectacular --validate` all clean, **zero schema warnings** after naming 8 M2 enums; `pnpm contract:generate` + `contract:check` in sync; **7 of 8 frontend packages typecheck** (`apps/partner` red on a pre-existing local bug in Session B's `express-path.ts`, not contract-related). **No tests written — this is why the gate stays open.** Attachments deferred to C1; BE4 unlock path and proposal 0013 unpublished. | Claude |
| 2026-08-11 | Programme sequencing | Corrected | Codebase re-audited against the board. Confirmed `config/urls.py` routes no M2 app and `apps/requirements/` has no HTTP layer, so `M2-BE-013` is the single critical-path item gating all 108 frontend tasks. Backend column split into [backend-session.md](backend-session.md) (waves C0–C7) as a third concurrent session; C0 scoped as a thin layer over the ~45 existing tested commands plus the one real gap, `M2-BE-202` attachment upload. Ownership drift between `AGENTS.md` (Codex owns `backend/**`) and observed practice (Claude wrote P1–P3) flagged for an owner decision. | Claude |
| 2026-08-11 | Wave B1 (Partner registration + workspace) | `[~]` 14 of 15 built | `features/{capability,crew,workspace}/` full `adapters → view` stack: four-step express path to masked demand, three progressive gates, business type, capability picker, insurance, crew roster, six review states, and the capability-driven shell (registry + switcher + mid-session guard) wired into `partner-shell.tsx`. **Tests written this time: 1379/1379 frontend tests green across 101 files**, `pnpm lint` clean at `--max-warnings 0`, `pnpm typecheck` **9 of 9** at contract 1.21.0 — which clears the `apps/partner` red recorded in the Wave C0 row above. Unknown workspace key resolves to nothing and no workspace resolves to `/jobs`; A1 navigation is exactly `BASE_NAV` with the M1 offer inbox suite passing untouched. Two pre-existing `main` failures fixed to get a green gate (`offers.test.tsx` missing `ToastProvider` since `ca7b1c7`; stale exact-list nav assertion in `operations-shell.test.tsx` since `ca9d9b7`) and one real defect the new tests found (`WorkspaceSummaries` announced "3shifts today"). `FE-105` not started; nothing mounted to a route, so nothing exceeds `[~]`. | Claude |
| 2026-08-12 | Wave B1 wiring (Session B) | `[~]` endpoint live, routes mounted | **First M2 endpoint consumed by any app.** `partner-shell.tsx` reads `GET /api/v1/partner/workspaces/` at contract 1.21.0 through `features/workspace/queries.ts`, gated on the session already holding the Partner role so `/apply` does not spend a guaranteed 403. All **7 registry destinations mounted** as `force-dynamic`, `robots: noindex` routes — `/workforce` and `/projects` render real grant-driven homes (label, description, the payment sentence for the mode Django sent, authorized destinations; **no counts**, since nothing publishes them); the other five render an honest not-built-yet state. Three decisions worth carrying: an unread grant list is `null` and never `[]` (collapsing them would fail *open* — a dropped connection reading as a suspension nobody applied); a 401/403 is not resent; `SESSION_STATE` freshness so an Operations suspension lands on window focus rather than at next login. `boundary.test.ts` caught the wiring as designed and its `/partner/workspaces/` entry was retired under its own rule. **1399/1399 frontend tests** (partner 314), lint clean at `--max-warnings 0`, 9/9 typecheck, `build --filter=partner` green. Still `[~]`: `FE-105` unstarted and the `capability/`+`crew/` registration views remain route-less. | Claude |
| 2026-08-12 | P0 / P1 / P2 / P3 (Wave C1) | `[~]` built — owner verification pending | **Contract 1.22.0 publishes 33 M2 paths**, 16 new: three attachment paths, two site-visit paths, and all thirteen of proposal 0013. New modules `apps/requirements/{attachments,storage,tasks}.py` and `apps/partners/{gates,capability_options}.py`; migrations `partners.0007`, `partners.0008`, `requirements.0004`. **The four dead sweeps are on Celery beat** — `expired_requirement_ids`, `sla_breached_requirement_ids`, `expired_invitation_ids`, `expired_proposal_ids` — plus attachment housekeeping, five entries in total; `expire_proposal` and `expire_invitation_and_replace` were genuinely missing commands and are new. **A replay cannot double-invite**: the replacement is taken inside the same transaction and requirement lock as the expiry, because a system job has no actor and `execute_idempotent` does not apply. **Both of proposal 0013's design questions answered** — `PartnerCapability.Status` gains `REJECTED` (an `actor_kind` was rejected because `PartnerCapabilityTransition.actor` is null for both a Partner action and a system job, so a derived actor would mislabel the case that matters), and `PartnerDocument` gains a nullable `expires_on` enforced through the existing `PARTNER_REQUIRED_DOCUMENT_KINDS` rather than a new policy knob. `RequirementAttachment.ProcessingStatus` gains `INFECTED`, kept separate from `FAILED` because one recovery offers a retry and the other must not. **Static gates: ruff format and check clean across 338 files, strict MyPy clean across 218 source files, `makemigrations --check` no changes, `spectacular --validate` zero warnings after naming three more enums, `manage.py check` clean.** **Six test files written and NOT RUN** — see §"Owner verification queue"; nothing here is proven against a real request until the owner runs them. **CI raised with the owner and deferred to M1 platform work**: no `.github/`, no pipeline of any kind, and the real scope is a Postgres service, two toolchains and a POSIX rewrite of `quality.ps1`. Remaining in C1: capability and matching completeness, `M2-BE-317` first — `POST /proposals/` documents `m2_proposal_below_wage_floor` and cannot currently return it. | Claude |
| 2026-08-12 | Programme-wide audit | Docs resynchronised | Full codebase-vs-plan sweep. **Confirmed in code:** contract at 1.21.0 with 17 M2 paths routed through `config/urls.py`; `pnpm typecheck` **9/9 green**; the `express-path.ts` typecheck failure logged on 11 August is **fixed** (`step.key` at lines 137/147/200); the Partner boundary guard has correctly retired `/partner/workspaces/`. **Three gaps the plan understated:** (1) **the repository has no CI at all** — there is no `.github/`, so "add contract validation to CI" has no pipeline to add to; (2) **`CELERY_BEAT_SCHEDULE` in `config/settings/base.py` contains no M2 sweep**, so all four selectors (`expired_requirement_ids`, `sla_breached_requirement_ids`, `expired_invitation_ids`, `expired_proposal_ids`) are dead code and an unanswered wave stalls forever; (3) **zero HTTP tests** — no file under `backend/tests/` names any M2 path. **Customer app is the laggard:** `features/requirement/` is fully built but contains no `useQuery`, mounts no route, and its boundary guard still lists `/api/v1/requirements/` and `/api/v1/proposals/` as unpublished. Stale text corrected in `task.md`, `frontend-execution-plan.md`, `03-frontend-tasks.md`, `backend-session.md`, `AGENTS.md`, `contracts/proposals/README.md` and proposals 0012/0013. | Claude |
| 2026-08-13 | Revision 3 money + build-first sprint | Docs revised | **Visit money is a pass-through split (owner decision):** each consumed slot share = vendor visit payout (paid on completed visit + usable estimate, through M1 payout rails, gated on payout details) + Vsolve platform share; undelivered slots refund the Customer; the stage-credit concept is deleted — stages fund at face value. Reconciliation rule: `plan = Σ payouts + Σ platform shares + Σ refunds`. Three-way profitability stated in `README.md` §"The A5 visit plan mechanics". **Verification convention amended (build-first):** during the sprint tests are neither run nor written; static gates + a per-wave smoke script gate each wave; convention resumes after the owner's manual UI pass. Orchestration prompt for the multi-agent sprint added as [09-build-sprint-orchestration.md](09-build-sprint-orchestration.md). | Claude |
| 2026-08-12 | Revision 3 — visit-first A5 | Docs revised | **Owner decision applied across the plan set.** ADR-0008 written and indexed; ADR-0007 status annotated. A5 becomes visit-first: tiered visit plan (proposed 49/99/199 for 1/2/3 vendors) charged only at the first confirmed visit slot; on-site estimates through the existing A5 composer against a completed visit; estimates readable with no second paywall; unfilled shares auto-refund at the visit SLA; visit-fee credit applied at first stage funding. A3 unchanged. Visit slots reuse the built M1 slot engine (`carts.availability`, checkout `slots-modal.tsx`, `preferred_starts`). New `VisitPlan` aggregate; `QuoteUnlock` scoped to A3; requirement machine gains `VISITS_BOOKED`; five new error codes; new commands (`choose_visit_plan`, `confirm_visit_slot`, `create_visit_plan_checkout`, `complete_visit_plan`, `confirm_visit_arrival`, `refund_unfilled_visit_shares`). Updated: `README.md`, `07`, `task.md`, `02`, `03`, `04`, `05`, `08`, all three session files, `frontend-execution-plan.md`. **All revision 3 build work lands in the unbuilt P4/Wave C2/Wave A2 — nothing shipped is reworked.** New blocking owner decisions: tier prices + vendor split, credit policy, visit SLA + estimate window, customer no-show policy. | Claude |
| 2026-08-13 | Wave C1 remainder (Session C) | `[~]` built — static gates green, owner manual verification pending | **Contract 1.23.0.** Two schema corrections and four new paths. **`M2-BE-317` closed — the wage-floor guard can now fire**: `submit_proposal` no longer takes `wage_floor_skill`/`wage_floor_state_code` from its caller and derives both from the requirement (`catalog.M2VariantConfiguration.wage_floor_skill`, `locations.ServiceArea.state_code`, both new and both nullable), failing closed with `m2_wage_floor_unavailable` rather than skipping — so `POST /proposals/` can finally return the refusal it documented, and A3 quoting is blocked per variant/area until Operations loads a floor. `ServiceVariant.required_skill_code` was rejected as the mapping because it is the dispatch trade slug and reusing it would tie a statutory floor to a merchandising decision. **Both list operations now declare the envelope Django always sent** — `m2_requirement_list` and `m2_partner_enquiry_list` declared bare arrays and returned DRF pages, so a generated client threw on its first request; both now use `StrictCursorPagination`, publish a `cursor` parameter (closing Session B's silently-truncated-inbox gap) and return a page envelope, and the frontend's two compensating narrowings can be deleted by their own columns. Also: `M2-BE-306` the capacity hold consults `carts.availability` at wave time and at acceptance (`m2_capacity_unavailable`); `M2-BE-115` the guard checks coverage and the Partner's calendar; `M2-BE-102/107` capability service-area scoping and `CrewAvailabilityException`; `M2-BE-301` `PartnerLanguage` capture plus travel feasibility, with an undeclared language never a mismatch; `M2-BE-303` real ranking signals at policy version 2, unknown distance scored at the pool median rather than last; `M2-BE-110` `POST /partner/capabilities/{id}/submit/`, the resubmit-after-correction path that had no route; `M2-BE-310` attachment access expiring with the invitation, with **`RequirementSnapshot` deliberately not copying attachments**; `M2-BE-106` registration answers on the versioned schema M1 already has. Migrations `catalog.0007`, `locations.0003`, `partners.0009`. **Static gates: ruff format and check clean across 338 files, strict MyPy clean across 218 source files, `makemigrations --check` no changes, `spectacular --validate` zero warnings with no new enum overrides needed, contract-drift check clean, `manage.py check` clean.** **No test was written or run** (build-first amendment); two existing fixtures in `tests/requirements/{conftest,test_matching_and_proposals}.py` were corrected for the fail-closed wage floor, so the owner's eventual run does not read the change as a regression. Still blocked and confirmed so: `M2-BE-113` (C3), crew archive on a future assignment (C4), per-variant `requires_insurance` and insurance enforcement (owner decision 6), `M2-BE-321` (no reference price), CI (owner-deferred to M1). | Claude |
| 2026-08-13 | P4 (Wave C2, Session C) | `[~]` built — static gates green, owner manual verification pending | **Contract 1.24.0: 14 new paths, 19 new operations (43 M2 operations → 62).** Resumed from a deliberately-red WIP commit that had landed the C2 domain layer with no migration, no HTTP layer and its gates failing on purpose. **The five ruff `ARG001`s were an audit-trail hole, not a lint nit**: five commands took an `actor` and recorded nothing with it, so the money-moving half of M2 had no trail — `services._record_transition` was private, which is why nobody had used it. It is now public and the five write through it, with six system-side transitions recorded `actor=None` because a provider callback moved those. **The candidate-visit-starts read is published** at `GET /partner/enquiries/{id}/visit-slots/`: the same `carts.availability` snapshot and window loop the A1 checkout draws, narrowed to the one invited vendor and minus `capacity`; without it `confirm_visit_slot` was a write with nothing to write against. **Four latent defects found while wiring it** — `submit_proposal` numbered revisions from the live row so re-validating an `EXPIRED` quote hit a unique constraint; `settle_share_for_estimate` was defined and called by nothing; `_promote_requirement_when_quoted` never left `VISITS_BOOKED`, so an A5 Customer could never select; `payouts.release_payout_hold` resolves by Booking, which a visit payout has none of, so the visit payout hold had no release at all. **All eight `frontend-execution-plan.md` §7 gaps folded into the same publish**, including the one that was a defect rather than a gap: `ProposalCreateRequest` had no `site_visit_id`, so an A5 on-site estimate was unsubmittable over HTTP and `m2_visit_not_completed` unreachable. Migrations `requirements.0005`, `catalog.0008`, `commerce.0007`, `assignments.0008`; the commerce check constraint tying `checkout__isnull` to `PaymentAttempt.Purpose` extended in the same migration as the enum; five new beat entries. **Static gates: ruff across 342 files, strict MyPy across 222 source files, `makemigrations --check` no changes, `spectacular --validate` zero warnings after 11 named enums, drift check clean.** No test written or run (build-first amendment); `BE-417`/`418`/`428` are the wave's test debt. | Claude |
| 2026-08-13 | Client regeneration at 1.24.0 (integrator) | `[~]` green on 4 of 5 packages, `apps/partner` handed to Session B | **The regeneration earned its keep immediately.** Wave C2 added two `reason` choice fields, which made drf-spectacular disambiguate all three and **rename the bare `ReasonEnum` to `DispatchCommandRequestReasonEnum`** — a published component `apps/admin/features/dispatch-recovery/model/commands.ts` imports by name, in an app that had not changed. Pinned back in `ENUM_NAME_OVERRIDES` rather than absorbed in the client, because the rename was the defect; `pnpm typecheck` is the check that exists for exactly this and it is what caught it. Three fixtures corrected for fields that are **required rather than optional** (`RequirementSummary.service_name` and the four `RequirementDraft` tracking fields). `apps/partner` left knowingly red and handed to Session B as item zero of its wave — its enquiry fixtures need the same treatment and `proposal-state.ts` needs copy for `ACCEPTED` and `LAPSED`, the two proposal states C2 published, which are **not** the same as `REJECTED`. Doing it as integrator would have been reaching into another column's files. | Claude |
| 2026-08-12 | Wave A1 wiring (Session A) | `[~]` 15 of 15 built and wired, owner verification pending | **The Customer requirement flow is reachable.** Four routes under `app/(flow)/requests/` — `My requests`, one request's page, the category-first entry and the four screens — all `force-dynamic`, `robots: noindex`, behind one `CustomerShell` gate. `features/requirement/queries.ts` + `packages/query/src/m2-requirement.ts` consume requirement list/create/read/patch/submit/duplicate-check/timeline at 1.21.0. The three stale M2 entries removed from the Customer boundary guard; `contract-pending/` deleted per its own README and its rule re-stated as `features/requirement/boundary.test.ts` (view/model may not name the generated client, through either package), carrying the `SCREENS.length === 4` assertion across. Adapters re-pointed: `flexibility_days` written through one named constant, `PHOTO`→`IMAGE`, `CLEAN`→`VERIFIED` with an unknown scan state failing **closed**, plus two the handover note missed (`answers`/`detail` arrive as `unknown`; no `file_name` at all). `FE-211` built — the consequence and the confirmation — with `onConfirmEdit` deliberately unsupplied, because no amend command exists and a confirmation that reaches a 409 teaches a Customer that confirming does nothing. **One field was missing from a screen**: `requested_start` is required by `_assert_submittable` and matched on by the duplicate check, and screen 2 did not ask for it — it would have been invisible until a real submit. **Eleven contract gaps logged**, the two largest being no merge endpoint for `GAP-004` and two separately-authored question schemas whose mismatch surfaces only when the Customer presses Send. `pnpm lint` clean at `--max-warnings 0`, `pnpm typecheck` **9 of 9**, `pnpm build --filter=customer` green. **No tests were run** — 10 files written and queued above. | Claude |
| 2026-08-13 | Build sprint — GATE 1 (Sessions A + B merged) | `[~]` built — static gates green, owner manual verification pending | **Two in-flight frontend waves reconciled, finished and merged into one commit.** Session A shipped requirement **attachments** (`FE-205`: presign → PUT → finalize → delete as one mutation, resumable from a held presign, finalize under a key derived from the upload id so a retried finalize replays Django's `201` instead of creating a second attachment) and the **voice fast path** (`FE-204`: `voice-note-recorder.tsx` + `model/language.ts`, language recorded for routing). Session B **mounted the built-but-dark registration surface** on four `/apply` routes — business profile, capabilities, insurance, masked demand preview — plus `features/capability/queries.ts`, `crew/queries.ts` and `session/use-partner-role.ts`, and handled the sixth capability status **`REJECTED`** (ranked above `SUSPENDED`, renders the reviewer's own words, terminal but never blocking a fresh request). `features/capability/contract-pending/` deleted per its own README, its rule carried across as `features/capability/boundary.test.ts`. **§7 drained by the orchestrator:** the four `errors.ts` codes and the `m2-keys.ts` `duplicates` rename confirmed landed; **both compensating list narrowings deleted** now that 1.23.0 declares `RequirementSummaryPage`/`EnquirySummaryPage` — `readRequirementList` and `readEnquiryPage` take the generated page types, and the test cases covering the deleted bare-array branches went with them (the `e2e/support/responsive.ts` hook is deferred: `e2e/**` is test code the amendment does not touch during the sprint). **Static gates on the merged tree: backend `quality-static.cmd` green** (ruff format + check across 338 files, strict MyPy across 218 source files, `makemigrations --check` no changes); **frontend `pnpm lint` clean at `--max-warnings 0`, `pnpm typecheck` 9 of 9 including `generate:check` at contract 1.23.0, `pnpm build --filter=customer` and `--filter=partner` both green.** No test written or run (build-first amendment). | Claude |
