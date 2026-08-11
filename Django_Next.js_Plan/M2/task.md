# M2 Master Task Board

**Scope:** Workforce and project services (`A3_TIME_BLOCK` and `A5_CUSTOM_PROJECT`)
**Status:** P1–P3 domain layers built and verified (91 tests); **no HTTP surface published**, so no
phase has passed its gate. Frontend foundation built; Customer Wave A1 partly built.
**Source flow:** [README.md](README.md)
**Audit applied:** [06-audit-gaps-and-simplification.md](06-audit-gaps-and-simplification.md)

This is the authoritative M2 implementation status board. The backend and frontend task files contain
the detailed work. Update this file in the same change that completes a phase or changes its status.

## Revision 2 summary

The plan was simplified after audit. Anything below that contradicts an older copy of the M2
documents is the current truth:

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
- Record verification evidence beside the task: tests, contract diff, migration check, screenshots,
  runbook, or an approved decision record.
- Update the detailed TODO and this master board together. Never update status in only one place.
- Do not mark future phases complete because shared scaffolding was created early.

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

> **Ownership — resolved 11 August 2026.** The owner directed that **Claude runs every session for
> M2**, including `backend/**` and `contracts/openapi/**`, to be revisited later. The table above and
> `AGENTS.md` still say Codex; both are stale for M2 and `AGENTS.md` has not yet been amended. Until
> it is, the ownership split in that file should be read as an M1 record, not a live rule.

## Delivery sequence

```text
P0 Scope and contract alignment
  -> P1 Partner registration and capability foundation
  -> P2 Customer requirement (free) and matching entry
  -> P3 Vendor matching, clarification and proposals
  -> P4 Quote unlock, selection, reconfirmation and engagement
  -> P5 Engagement spine and stage fulfilment
  -> P5A Workforce stages (A3)
  -> P5B Project stages (A5)
  -> P6 Recovery, refunds, disputes and Operations
  -> P7 Production hardening and controlled rollout
```

P5 delivers the shared spine once. P5A and P5B are thin archetype tails and may be developed in
parallel only after P5 is stable. A service category cannot launch until its own tail and the P6
recovery paths are complete.

## The critical path — cleared 11 August 2026

`M2-BE-013` was the one task gating every other column, and it is now `[~]`: **contract 1.21.0
publishes 17 M2 paths.** The frontend cap is lifted — both columns can integrate.

What changed: `apps/requirements` gained `selectors.py`, `serializers.py`, `views.py` and `urls.py`,
and `config/urls.py` now includes them. No domain module was edited; every state change delegates to
a command that already existed behind the 91 passing tests. Details and the residual gaps are in
[backend-session.md](backend-session.md) §"C0 outcome".

**It is `[~]`, not `[x]`, and the distinction matters.** C0 shipped with lint, strict types, a
migration check and schema validation — and **no tests**. The completion standard requires an
object-level authorization test per endpoint and role; none exists, so the surface compiles and
generates but is unproven against a real request. Contract validation is also not yet in CI. Both
are the first C1 items.

Still unpublished, and named so nobody builds against them by mistake: attachment upload, the whole
unlock/selection path (BE4 — no domain layer to wrap), and all of proposal 0013 (Partner capability,
crew and progressive gates), which Session B filed on 11 August and which is now C1 work.

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
  Frontend side done: `contracts/proposals/0012-m2-capability-and-requirement-surface.md` requests the
  workspace-grant, requirement, attachment and teaser/unlock/selection surfaces, and raises one open
  question on 202 refusals. **Awaiting Codex review**; no M2 endpoint is published, so `M2-BE-013`
  remains the blocker. See the file-history note in `03-frontend-tasks.md` under `M2-FE-006` — this
  proposal was written twice on 2026-08-10 and the earlier version was overwritten unrecoverably.

Owner decisions — **blocking, not started**:

- [ ] Approve the revised commercial model: free requirement, INR 149 unlock after a usable quote exists.
- [ ] Approve the quote-delivery SLA and vendor reconfirmation deadlines per category.
- [ ] Approve one commercial mode per archetype (A3 lead-only, A5 managed) and reject per-variant modes.
- [ ] Approve the definition of a usable quote, the out-of-budget rule and the non-responsive rejection cap.
- [ ] Approve commission visibility on A5 proposals and the single tax basis for competing quotes.
- [ ] Approve GST, invoicing and principal-versus-agent treatment per mode, including the unlock fee.
- [ ] Approve the worker insurance, injury liability and safety-incident position.
- [ ] Approve the minimum-wage floor source and enforcement per state and skill.
- [ ] Resolve the wallet contradiction between this plan and `milestones.md` M3.
- [ ] Confirm the M2/M3 milestone boundary given that `milestones.md` excludes payments and OTP from M2.
- [ ] Approve the unit economics model: Operations touches per request against INR 149.
- [ ] Freeze which launch categories are A3 and which are A5.
- [ ] Approve contact disclosure, cancellation, dispute, payout, tax and compliance policies.
- [ ] Approve the M2 OpenAPI proposal and publish the first validated contract.

**Exit gate:** Decisions have owners and dates; no unresolved policy is hidden in code or UI. The ten
blocking decisions in `README.md` are all resolved. **Gate not passed** — design half only.

### P1 - Partner registration and capability foundation

**Status `[~]`** — backend domain layer built and **verified: 26/26 tests pass** (2026-08-10).
Frontend not started.

- [~] Backend partner business, crew, skill, service-area and availability records are production-ready.
  Business profile, crew and capability models built. Service-area scoping on the capability and crew
  availability are not.
- [~] Backend capability review and lifecycle eligibility rules are enforced server-side.
  `transition_capability` and `assert_capability_active` implemented; the guard does not yet check
  availability, service area or insurance.
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
  `workspace_grants` built and returns no routes or labels; not yet exposed via an endpoint.
- [ ] The same Partner app renders contextual A1, A3 and A5 workspace navigation; existing A1 Partners
  retain Offers/Jobs while M2 Partners receive Workforce and/or Projects.
  Frontend not started.
- [ ] Multi-capability Partners can switch workspace families without mixing lifecycle records.
  Frontend not started; backend returns separated action lists per workspace.
- [ ] Unknown workspace keys render nothing in the frontend registry.
  Frontend not started; backend already omits unknown archetypes from the grant list.
- [~] Operations can review, request corrections, approve, suspend and audit capabilities, and
  suspension routes funded engagements to replacement or refund.
  Review and audit built. **Suspension does not yet route funded engagements** — `M2-BE-113` needs the
  P5 engagement aggregate.

**Exit gate:** A new Partner can register progressively, see masked demand before KYC, pass review and
then see only the authorized workspace/actions for their approved lifecycle capability; skill names
alone never change navigation. **Gate not passed** — no test run, no HTTP surface, no frontend.

### P2 - Customer requirement and matching entry

**Status `[~]`** — backend domain layer built and **verified: 31/31 tests pass** (2026-08-10).
No HTTP surface, no frontend.

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
No HTTP surface, no frontend.

- [~] Eligible vendors are ranked, invited and slot-reserved without duplicate or excessive exposure.
  Waves bounded by size and free slots; one account per beneficial owner. **No business ranking
  signals** — ordering is a stable sort, as A1 does.
- [~] Eligibility includes travel feasibility for the date, language and recent responsiveness.
  Responsiveness done (21-day presence window). **Travel feasibility and language are not built** —
  vendor language is not captured in P1.
- [~] Accepting an invitation takes a soft capacity hold for the requested dates.
  Done, and fed back into eligibility. **Does not yet consult `carts.availability`**, so an A1 booking
  and an M2 hold can overlap. Hard hold at selection is P4.
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
  Guard works, but state and skill are caller-supplied rather than derived from the requirement.
- [x] Competing proposals for one requirement use a single tax basis and display commission treatment.
- [x] Identity clustering prevents one beneficial owner filling more than one slot.
- [ ] Price-band outliers raise a review signal without automatic penalty.
  Not started: needs a reference price per variant.
- [ ] Attachment access expires with the invitation for non-selected vendors.
  Not started: depends on the attachment upload command.
- [~] Contact disclosure and clarification events are consented, limited and auditable.
  Contact-sharing heuristic flags for review without auto-banning. **Disclosure itself is not built.**

**Exit gate:** Usable quotes are delivered inside the declared SLA or the documented replacement and
closure path executes automatically. Nothing has been charged. **Gate not passed** — the
"nothing charged" half holds; automatic replacement does not exist.

### P4 - Unlock, selection, reconfirmation and engagement

- [ ] Quote teasers expose verification, rating, vendor type and a price band only.
- [ ] The INR 149 unlock is server-priced, payment-backed and offered only when a usable quote exists.
- [ ] One successful payment grants exactly one unlock under duplicate webhooks and retries.
- [ ] Non-responsive rejection releases a slot and triggers replacement within the configured cap.
- [ ] Customer selection creates a time-limited vendor reconfirmation request.
- [ ] Quote-validity expiry offers a one-tap re-validation request that reuses the existing unlock.
- [ ] Rejection, expiry or changed availability preserves the unlock and offers the next quote free.
- [ ] A3 completes as a connection with released contact; A5 opens stage funding.
- [ ] Managed stage payment is collected before protected A5 work starts.
- [ ] Both parties receive the final scope, commercial terms, cancellation policy and receipt.

**Exit gate:** Money is collected only against delivered value; selection is not treated as a booking
until vendor reconfirmation and the archetype's own confirmation condition both succeed.

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
