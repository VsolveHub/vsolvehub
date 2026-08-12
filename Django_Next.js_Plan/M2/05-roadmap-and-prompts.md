# M2 Roadmap and Execution Prompts

**Purpose:** Reusable prompts for implementing M2 phase by phase without losing quality or task status
**Status source:** [task.md](task.md)
**Revision:** 3 - visit-first A5 per [ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md);
revision 2 simplifications per [06-audit-gaps-and-simplification.md](06-audit-gaps-and-simplification.md)

> **Partly superseded, 11 August 2026.** The execution-order table below describes one backend column
> and one frontend column advancing in lockstep. The programme now runs **three concurrent columns**
> — see [frontend-execution-plan.md](frontend-execution-plan.md) for the split and
> [backend-session.md](backend-session.md), [frontend-session-a.md](frontend-session-a.md) and
> [frontend-session-b.md](frontend-session-b.md) for the live per-column task lists and kickoff
> prompts. Read the table below as the **dependency order between phases**, which is still correct,
> not as the scheduling plan, which is not. The **non-negotiable rules** (updated to revision 3) and
> the base prompt further down remain live and binding.

## Recommended execution order

| Order | Backend | Frontend | Integration gate |
|---|---|---|---|
| 1 | BE0 decisions, states and OpenAPI | FE0 routes, UX states and contract proposals | Approved state map, resolved blocking decisions and published initial contract |
| 2 | BE1 capability foundation | FE1 progressive registration and workspace registry | Partner reaches masked demand fast; approved Partner sees only authorized workspaces/actions |
| 3 | BE2 free requirement and matching entry | FE2 four-screen requirement and tracking | A free requirement enters matching exactly once with a hard expiry |
| 4 | BE3 matching, clarification and proposals | FE3 enquiries and the two composers | Usable quotes delivered inside SLA, nothing charged |
| 5 | BE4 access: A3 unlock · A5 visit plan, selection and engagement | FE4 A3 teasers/unlock · A5 visits/estimates, comparison and selection | Money collected only against a real accepted commitment; one truthful engagement |
| 6 | BE5 engagement spine | Shared stage/amendment UI | Both archetypes run on one spine with one command set |
| 7A | BE5A workforce stages | FE5A workforce | A3 acceptance scenarios pass |
| 7B | BE5B project stages | FE5B projects | A5 acceptance scenarios pass |
| 8 | BE6 recovery and money | FE6 Operations/recovery | Worst cases recover without DB edits |
| 9 | BE7 hardening/release | FE7 hardening/release | Controlled rollout sign-off |

Build the spine at step 6 before either tail. Do not start payment UI from an unapproved payload, and
do not treat a published API schema as proof that its business behavior is complete. 7A and 7B can run
in parallel after the step 6 gate.

## Non-negotiable rules (revision 3)

Every M2 session must honour these. They are the output of the audit plus the owner's 2026-08-12
visit-first decision ([ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md)), and
reversing one silently is a regression:

1. The requirement is **free**. Money is charged only against a real accepted commitment: for A3 the
   INR 149 unlock only after a usable quote exists; for A5 the tiered **visit plan** only when the
   first vendor confirms a visit slot — never at request time.
2. **A5 is visit-first.** An A5 estimate is submitted on site against a `COMPLETED` visit through the
   full composer; estimates are fully readable with **no second paywall**; unfilled plan shares
   auto-refund at the visit SLA; each consumed share splits into a **vendor visit payout** (paid on
   completed visit + usable estimate, through the M1 payout rails) and a **Vsolve platform share** —
   no stage credit. A3 keeps teasers and the unlock unchanged.
3. Commercial mode is **fixed by archetype**: A3 is `LEAD_ONLY`, A5 is `MANAGED_PAYMENT_REQUIRED`.
   There is no per-variant mode configuration.
4. Workforce and project fulfilment share **one** `Engagement` + `EngagementStage` spine. Scope changes
   reuse the **M1 amendment engine**.
5. Attendance is confirmed at **supervisor level**; per-worker detail exists only inside a dispute.
6. Requirement audit is an immutable **snapshot written at invitation**, not full requirement versioning.
7. Proposals are **append-only** with six states. Clarification is **structured question and answer**,
   not a chat subsystem.
8. Site visits are **paid** and adjust against the final price. A5 visit slots book against the **M1
   slot engine** (`carts.availability` + the checkout slot-picker pattern) — never a second
   availability notion.
9. Partner KYC is **progressive**, gated on money rather than on browsing.
10. The customer requirement is **four screens** (the A5 plan chooser is a control on Review); the A3
    enquiry response and the A5 visit-slot confirmation are each **one screen**.
11. Money and OTP are **built and proved with test callbacks and the non-OTP fallback** in M2; live
    activation is M3.

## BASE PROMPT - Use for every M2 implementation session

Replace `<ROLE>`, `<PHASE>`, `<TASK_IDS>` and `<EXPECTED_GATE>` before use.

```text
You are implementing Vsolve commercial M2 in C:\dev\vsolve.

ROLE: <ROLE: Backend/Codex or Frontend/Claude>
PHASE: <PHASE>
TASKS: <TASK_IDS>
REQUIRED EXIT GATE: <EXPECTED_GATE>

Read and obey these sources before changing code:
1. C:\dev\vsolve\AGENTS.md and any nested AGENTS.md files.
2. C:\dev\vsolve\Django_Next.js_Plan\M2\README.md.
3. C:\dev\vsolve\Django_Next.js_Plan\M2\task.md.
4. The role task file: 02-backend-tasks.md or 03-frontend-tasks.md.
5. C:\dev\vsolve\Django_Next.js_Plan\M2\04-acceptance-and-cutover.md.
6. C:\dev\vsolve\Django_Next.js_Plan\M2\06-audit-gaps-and-simplification.md for the reasoning behind
   the simplified model.
7. Existing M1 code, tests, contracts and current git status.

Branch rule: M2 code is never committed or pushed to `main`. Confirm you are on the dedicated M2
branch before changing code, and never merge M2 work into `main` without explicit owner instruction.

Work only on the listed phase/tasks. First inspect the current implementation and uncommitted work;
preserve all unrelated changes. Resolve existing patterns before introducing new abstractions. If a
product, policy, legal or contract decision is missing, do not hide it behind a default. Mark the task
partial and report the exact blocking decision.

Revision 3 rules that must not be silently reversed:
- The requirement is free. A3: the INR 149 unlock is charged only after a usable quote exists.
  A5: the tiered visit plan is charged only when the first vendor confirms a visit slot.
- A5 is visit-first (ADR-0008): estimates are submitted on site against a COMPLETED visit, are fully
  readable with no second paywall, unfilled plan shares auto-refund at the visit SLA, and each
  consumed share splits into a vendor visit payout (completed visit + usable estimate, M1 payout
  rails) and a Vsolve platform share — no stage credit. A5 visit slots book against
  carts.availability through the checkout slot-picker pattern — never a second availability notion.
- Commercial mode is fixed by archetype: A3 lead-only, A5 managed. No per-variant mode config.
- Workforce and project fulfilment share one Engagement + EngagementStage spine, and scope changes
  reuse the M1 amendment engine in backend/apps/fulfilment/amendments.py.
- Attendance is supervisor-level; per-worker detail only inside a dispute.
- Requirement audit is an immutable snapshot written at invitation, not full versioning.
- Proposals are append-only; clarification is structured question and answer, not chat.
- Site visits are paid. Partner KYC is progressive. The requirement is four screens (the A5 plan
  chooser is a control on Review).
- Money and OTP are built and proved with test callbacks and the non-OTP fallback; live activation is
  M3 per milestones.md.

Reuse before building. M1 already owns scope amendments, refunds and allocations, payment attempts and
webhooks, cases, payouts and ledger holds, evidence capture, cancellation policy and partner
suspension. A new aggregate is justified only when the M1 shape genuinely cannot carry the M2
invariant; record that reason in the task evidence.

Industry-ready requirements:
- Django/DRF is the only business backend and database migration authority.
- PostgreSQL is the system of record; Redis is ephemeral only. Do not introduce Prisma or direct
  frontend database access. Keep the backend a modular monolith.
- Use the generated OpenAPI contract. Frontend endpoint needs go through contracts/proposals; backend
  publishes the validated contract. Never hand-edit generated clients or generated OpenAPI.
- Keep business state changes in explicit authorized domain commands. Make retryable commands
  idempotent, protect persisted invariants with database constraints, and audit commercial or
  privileged transitions.
- The server owns lifecycle eligibility, price and all financial calculations in integer paise. Never
  add fallback prices, vendors, locations, statuses or success states.
- Treat skill, service variant, fulfilment archetype and approved Partner capability as distinct. A
  skill supports eligibility; only an approved lifecycle capability can authorize a workspace/action.
  The backend publishes {workspace_key, actions[]}; the frontend renders known keys through a typed
  registry and ignores unknown ones.
- Handle concurrency, duplicate requests, stale versions, delayed callbacks, browser close, worker
  retry, partial failure and reconciliation. External services require adapters, timeouts, retries and
  recovery behavior.
- Protect Customer, Partner, crew, KYC, location, clarification and payment data. Apply least
  privilege, safe logging, upload validation, retention rules, attachment-access expiry, rate limits
  and abuse controls.
- Frontend work must use the existing Next.js apps, generated clients and TanStack Query. Include
  loading, empty, pending, error, forbidden, stale, retry and offline behavior. Verify responsive and
  accessible interaction; do not create a separate Partner or Operations app.
- Respect the flow-weight budget in 03-frontend-tasks.md. Exceeding it is a design regression.
- Testing follows `task.md` §"Verification convention" **including its build-first amendment
  (2026-08-13)**: during the build sprint, write no tests and run no tests; ship a per-wave smoke
  script instead, and keep every static gate green. Do not stop at models, routes, static UI or
  mocks — the feature must actually work end to end against the running servers.
- Keep M1 behavior backward compatible unless the approved task explicitly changes it.

Execution process:
1. Inspect current code, contracts, tests and TODO status. State a concise implementation plan.
2. Implement the selected tasks end to end within ownership boundaries.
3. Run the relevant quality, migration, contract, build and end-to-end checks.
4. Compare the result to the phase exit gate and applicable acceptance scenarios.
5. Update the role TODO file and M2/task.md in the same change:
   - use [x] only for behavior implemented and verified with evidence;
   - use [~] for partial work and add the exact remaining work/blocker;
   - leave unstarted and future tasks [ ];
   - add the verification evidence and date to task.md.
6. Summarize user-visible behavior, files/contract changed, tests run, evidence, risks and remaining
   unchecked tasks. Never claim the phase is complete if its exit gate did not pass.

Do not expand scope silently. If an unexpected change conflicts with the task, stop and ask for a
decision; otherwise continue through implementation and verification.
```

## Backend role add-on

Append this when `<ROLE>` is Backend/Codex:

```text
Follow backend ownership and commands from AGENTS.md. Keep DRF views thin and implement invariants in
domain services/commands plus database constraints. Reuse M1 identity, payment, refund, ledger,
amendment, cases, notifications and outbox patterns rather than creating duplicate subsystems. Build
the Engagement/EngagementStage spine once and treat A3 and A5 as thin configuration over it. Add
migrations safely; do not edit frontend-owned paths. Generate and validate contracts only through the
documented Django command. Prove money behaviour with provider test callbacks, never a live provider.
Run Ruff, strict MyPy, tests with branch-aware coverage, migration check and OpenAPI validation before
marking tasks complete.
```

## Frontend role add-on

Append this when `<ROLE>` is Frontend/Claude:

```text
Follow frontend ownership from AGENTS.md. Preserve the existing design system and App Router patterns.
Use the same Partner app and authenticated shell, but do not force every capability into one generic
menu. Map server-authorized workspace keys through a typed frontend registry; preserve A1 Offers/Jobs,
add only A3 Workforce and A5 Projects in commercial M2, use an explicit workspace switcher for
materially different capabilities, and render nothing for unknown keys. Keep frontend/apps/admin as the
physical Operations app. Respect the flow-weight budget: four screens for the customer requirement, one
screen for the A3 enquiry response, one confirmation step, and no payment before delivered value is
visible. Build the shared stage and amendment UI once for both archetypes. Do not duplicate backend
state machines or calculate authoritative prices in the browser. Propose missing contracts in
contracts/proposals and wait for the published generated client before claiming integration complete.
Test Customer, Partner and Operations role behavior, mobile/desktop responsiveness, keyboard/screen-reader
access, slow network and stale state. Run lint, type-check, unit/integration tests, production builds
and critical Playwright journeys before marking tasks complete.
```

## Phase prompt values

Use the base prompt with one row at a time.

| Phase | Backend task range | Frontend task range | Expected gate |
|---|---|---|---|
| P0 | `M2-BE-001` to `M2-BE-013` | `M2-FE-001` to `M2-FE-011` | Blocking decisions resolved; states, routes and initial contract approved |
| P1 | `M2-BE-101` to `M2-BE-117` | `M2-FE-101` to `M2-FE-115` | Progressive registration and capability-correct contextual workspaces |
| P2 | `M2-BE-201` to `M2-BE-214` | `M2-FE-201` to `M2-FE-215` | A free requirement enters matching exactly once with a hard expiry |
| P3 | `M2-BE-301` to `M2-BE-324` | `M2-FE-301` to `M2-FE-313` | Usable quotes delivered inside SLA with nothing charged |
| P4 | `M2-BE-401` to `M2-BE-428` | `M2-FE-401` to `M2-FE-424` | Access (A3 unlock · A5 visit plan), selection, reconfirmation and engagement are truthful |
| P5 | `M2-BE-501` to `M2-BE-509` | Shared stage/amendment UI in FE5A/FE5B | One spine, one command set, no duplicate subsystem |
| P5A | `M2-BE-521` to `M2-BE-535` | `M2-FE-501` to `M2-FE-512` | Multi-worker, multi-day A3 work passes acceptance |
| P5B | `M2-BE-541` to `M2-BE-550` | `M2-FE-601` to `M2-FE-613` | Stage and amendment A5 work passes acceptance |
| P6 | `M2-BE-701` to `M2-BE-717` | `M2-FE-701` to `M2-FE-711` | Recovery/refunds work without direct database intervention |
| P7 | `M2-BE-801` to `M2-BE-812` | `M2-FE-801` to `M2-FE-811` | Security, quality, runbooks and rollout sign-off pass |

## Review-only prompt

Use this after backend and frontend work for a phase are both reported complete.

```text
Review M2 <PHASE> as an independent production-readiness reviewer. Do not implement unrelated future
phases. Read the M2 flow, both role task files, acceptance matrix, the audit document, contracts and
current code. Verify each checked task from behavior and tests; do not trust checkbox status. Confirm
the revision 3 rules have not been silently reversed - particularly the free requirement, the
archetype-split front door (A3 unlock, A5 visit-first), the fixed mode per archetype, the single
engagement spine, supervisor-level attendance and the flow-weight budget. Focus findings on security, authorization, data integrity, state transitions, money
reconciliation, concurrency, privacy, accessibility, failure recovery and M1 regression risk. Run the
relevant checks and exercise applicable end-to-end worst cases. If evidence is missing or behavior is
partial, change [x] to [~] in both the detailed file and task.md with a concise reason. Keep [x] only
where the exit gate is demonstrated. Report findings first, ordered by severity with file references,
then the verified gate result.
```

## Task update example

Use concrete evidence rather than broad completion claims:

```markdown
- [x] `M2-BE-404` Guarantee one unlock for one successful payment under retries.
  Evidence: payment domain tests for duplicate test webhook, duplicate checkout and late success;
  migration constraint verified; OpenAPI unlock response published. Verified 2026-MM-DD.

- [~] `M2-FE-403` Handle UPI pending, failure and late success.
  Partial: pending and failure UI integrated and tested. Late-success refresh is waiting for the
  published payment-status event contract; Playwright journey remains unchecked.
```

Do not add evidence text that contains secrets, private Customer/Partner data or payment payloads.
