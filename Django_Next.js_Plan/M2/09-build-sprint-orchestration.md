# M2 Build Sprint — Multi-Agent Orchestration

**Purpose:** finish the entire M2 build (revision 4 flow: rate-card A3 · visit-first A5) with
parallel agents, build-first: no tests written or run, static gates only, owner tests manually once
the UI is visible.
**Convention:** `task.md` §"Verification convention" → "Build-first amendment (2026-08-13)".
**Branch:** this sprint ran on `feat/m2-workforce-projects`, which was merged into `main` on
23 August 2026. The "never `main`" rule this line used to carry is spent.

## The dependency truth (what can actually run in parallel)

```text
C1 remainder (backend gaps, M2-BE-317 first)          ── solo, short
        │
C2  BE4: A3 unlock (the A3 fallback surface since revision 4) + A5 visit plan, selection,
        │  engagement entry — the gate for everything; publishes contract paths
        ├──────────────┬──────────────────────┐
        A2 (customer:  B: FE-314/315          C3 engagement spine (backend, solo —
        FE-216,        (visit-slot confirm,   both frontends build against it)
        FE-401..424)   on-site composer)              │
        └──────────────┴──────────┬───────────────────┤
                                  │            C4 (A3 stages) ∥ C5 (A5 stages)
                        A3+B3 fulfilment UI (parallel, after C3 publishes)
                                  │
                        C6 Operations APIs ──► A4 ∥ B4 (admin, folder-split)
                                  │
                        Wave 5 cross-app pass (solo) + smoke scripts
```

Revision 4 (ADR-0009, 2026-08-13) adds three unstarted waves. The shipped C2/A2 unlock surface
stays and is relabelled the A3 fallback; every piece of rate-card work is new build:

```text
C2 (landed) + apps.assignments ──► C2R backend: RateCard (publish/read, wage-floor-guarded,
                                   fail-closed) + book_at_published_rate preset capture + the
                                   cascade caller (accept/decline_crew_offer, roster-sized hold)
                                   + BookingFee (checkout, webhook, forfeit split, refund)
                                   + fall_back_to_quote_flow — publishes contract paths
                                        ├──► A2R customer: the A3 preset front door — rate +
                                        │    inclusion list before booking, booking-fee checkout,
                                        │    honest holding state, fallback handoff to the built
                                        │    unlock surface
                                        └──► B2R partner: the one-screen crew offer — the lead's
                                             own number, accept / decline with reason
```

C2R is a backend wave (one agent in `backend/**`, as ever) and can start any time after C2 —
sequenced against C3–C6 by the orchestrator. A2R and B2R fan out only after C2R publishes, and
obey the same A/B file-ownership map as every other frontend wave.

Frontend columns A and B share **no source file** (ownership map:
`frontend-execution-plan.md` §3). Backend is one column — never run two agents inside
`backend/**` at once. So the widest safe fan-out at any moment is **3 agents**: backend wave +
Session A wave + Session B wave.

## THE PROMPT — paste this into a fresh Claude Code session at C:\dev\vsolve

```text
You are the M2 build-sprint orchestrator for C:\dev\vsolve, on branch feat/m2-workforce-projects.
Use multi-agent orchestration: run parallel subagents for independent columns, sequential where
the dependency order below requires it. I explicitly opt in to workflows/subagents.

GOAL: complete the entire commercial M2 build per the revision 4 flow, build-first. I will test
manually at the end. Do not stop until every phase P1–P6 is built and both apps run, or you hit a
blocker only I can resolve.

READ FIRST (and have every subagent read its own column's files):
1. Django_Next.js_Plan/M2/README.md            — the revision 4 flow (rate-card A3, visit-first
   A5, split money) plus docs/adr/0009-m2-rate-card-instant-dispatch-for-a3.md
2. Django_Next.js_Plan/M2/07-state-machines-and-permissions.md — THE design authority
3. Django_Next.js_Plan/M2/task.md              — status board + "Build-first amendment (2026-08-13)"
4. Django_Next.js_Plan/M2/09-build-sprint-orchestration.md — this plan, dependency order, agent rules
5. Per column: backend-session.md / frontend-session-a.md / frontend-session-b.md,
   02-backend-tasks.md / 03-frontend-tasks.md, frontend-execution-plan.md §3 (file ownership)
6. AGENTS.md and the M1 code the reuse tables point at.

NON-NEGOTIABLE RULES FOR EVERY AGENT:
- NO TESTS. Do not run any test (pytest, vitest, Playwright — nothing). Do not WRITE test files
  either — build-first amendment in task.md. Instead, each wave ships a smoke script: the exact
  clicks/curl requests I run to see it work.
- STATIC GATES ARE MANDATORY before a wave is reported: backend `.\scripts\quality-static.cmd`
  (ruff, strict mypy, makemigrations --check, spectacular --validate, contract drift); frontend
  `pnpm lint --max-warnings 0`, `pnpm typecheck`, `pnpm build --filter=<app>`. Red gate = not done.
- Revision 4 flow rules (05-roadmap-and-prompts.md §Non-negotiable): requirement free; A3 = the
  published rate card per city+skill (effective-dated, fails closed), offer cascade to leads via
  apps.assignments (first accept wins, roster >= headcount), booking fee charged at vendor accept
  on the split rails (forfeit = lead travel compensation + platform share; vendor no-show refunds
  in full + free re-dispatch), wages direct/daily/P2P never held, ₹149 unlock demoted to the
  thin-supply fallback; A5 = visit plan (49/99/199 config placeholders) charged at first
  confirmed visit slot; per-slot split = vendor visit payout + Vsolve platform share, payout on
  completed visit + usable estimate via M1 payout rails; NO stage credit; estimates need a
  COMPLETED visit; visit slots book against carts.availability; no per-worker attendance; one
  engagement spine; M1 amendment engine for scope changes; provider TEST callbacks + non-OTP
  fallback only (no live payments/OTP — that is M3).
- Owner-blocked values (tier prices, splits, SLAs, wage floors, no-show policy; the booking-fee
  value, forfeit split and free-cancel T; seed rate-card values and the decline-alarm threshold;
  cascade wave size, per-offer timeout, widening steps and fallback threshold) are read from
  configuration and FAIL CLOSED when unset. For the demo, seed sensible dev-only config values in
  a clearly-marked dev seed (never a code default) so I can click through.
- File ownership is law: backend agent owns backend/** + contracts/openapi/**; agent A owns
  apps/customer/** + its query files; agent B owns apps/partner/** + apps/admin/** + its query
  files. Frozen files (m2-keys.ts, errors.ts, freshness.ts, error-presentation.ts, generated/**)
  may be changed ONLY by the orchestrator between waves, in one integration commit. Never
  `git add -A`; stage owned paths only. Commit per wave gate with clear messages. Pushing to `main`
  is the owner's call — the blanket M2 embargo ended with the 23 August 2026 merge.
- No mock/placeholder data in application code. Real endpoints, real states, honest empty states.
- Do not launch dev servers and leave them running; I run the servers myself. Build must pass.

EXECUTION ORDER (fan out where marked ∥, never two agents in backend/** at once):
0. Orchestrator: sweep 33 published paths for the two known schema defects (list envelope vs
   declared array; wage-floor guard inert M2-BE-317 — the same guard also gates publish_rate_card:
   a card whose wage component sits below the floor cannot publish) — fix in C1 remainder.
1. Backend agent — C1 remainder (backend-session.md list, M2-BE-317 first).
2. Backend agent — C2 (BE-215, BE-401..428): A3 unlock + A5 VisitPlan/slot-hold/checkout/split
   payouts + selection/reconfirmation/engagement entry. Publish contract (bump version, CHANGELOG,
   pnpm contract:generate). This is the critical path — start it immediately after C1.
3. ∥ after C2 publishes: Agent A — Wave A2 (FE-216, FE-401..424) ∥ Agent B — FE-314/315.
3R. Backend agent — C2R (revision 4, new build): RateCard + publish_rate_card,
    book_at_published_rate preset capture, the cascade caller into apps.assignments
    (accept/decline_crew_offer, roster-sized hold, m2_roster_insufficient), BookingFee
    (checkout/webhook/forfeit split/refund; engagement only on the verified callback) and
    fall_back_to_quote_flow — per 07 §1, §2, §4c, §6. Publish contract. Sequence this backend
    wave against C3–C6 (one backend agent, always).
4R. ∥ after C2R publishes: Agent A — Wave A2R (customer A3 front door: preset, rate + inclusion
    list before booking, booking-fee checkout, honest holding state, fallback handoff to the
    built unlock surface) ∥ Agent B — Wave B2R (partner one-screen crew offer: the lead's own
    number, accept/decline with reason; the fallback composer stays).
4. Backend agent — C3 engagement spine (BE-501..509), then ∥ C4 (BE-521..535) and C5 (BE-541..550)
   sequentially in one agent (same column), publishing contract paths as they land.
5. ∥ after C3 publishes: Agent A — Wave A3 (FE-509..512, FE-608..613) ∥ Agent B — Wave B3
   (FE-501..508, FE-601..607).
6. Backend agent — C6 Operations APIs (BE-701..718). Then ∥ Agent A — A4 (features/m2-cases) ∥
   Agent B — B4 (features/m2-requests + app/operations routes).
7. Orchestrator solo — cross-app pass: frozen-file change requests from §7 logs, barrel exports,
   full static gates on the merged tree, dev seed so one demo walk-through exists for A3 (rate
   card), the A3 fallback and A5 end to end, and a final SMOKE.md at Django_Next.js_Plan/M2/
   listing exactly what I click to
   verify each phase (both apps + admin).
AFTER EVERY WAVE: update the column session file, 02/03 checkboxes to
"[~] built — static gates green, owner manual verification pending", and task.md in the same
change. Log every contract gap or blocker in frontend-execution-plan.md §7 instead of silently
working around it. If truly blocked on an owner decision, note it, pick the fail-closed path, and
keep moving on parallel work.

Report at each wave gate: what got built, static-gate output summary, the smoke steps, blockers.
```

## How to run it

- **Option 1 — one session, parallel subagents (simplest, recommended):** paste the prompt above
  into a fresh session. The orchestrator spawns up to 3 concurrent agents (backend / customer /
  partner+ops) per the order above and integrates at wave gates. Best when you want one place to
  watch and one commit stream.
- **Option 2 — three terminals, three worktrees:** the repo already defines this
  (`frontend-execution-plan.md` §4, Option 1): one session pasted the backend kickoff
  (`backend-session.md`), one Session A, one Session B kickoff — each prefixed with: *"Build-first
  amendment applies (task.md 2026-08-13): write no tests, run no tests, ship smoke scripts;
  static gates mandatory."* More parallel wall-clock, but you merge worktrees at each gate
  yourself.
- Do not run more than one agent in `backend/**`, ever. The frontend columns are conflict-free by
  the ownership map.

## What "done" means for this sprint

Both apps + admin build clean; a seeded dev walk-through exists for: A3 (preset → rate shown →
book → lead accepts → booking fee → engagement → attendance → day settled), the shorter A3
fallback (request → quotes → unlock → select) and A5 (request + plan → slot confirm → plan
checkout → visit → on-site estimate → select → stage funding → evidence → approval → payout
eligibility with the visit split); `SMOKE.md` tells the owner exactly what to click. Tests come after that manual
pass, per the amendment.
