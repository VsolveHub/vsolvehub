# srikar-prompts — untracked handoff pack

**Do not commit this folder.** Pass this directory to the next agent platform when handing off.

## Start here

| File | Purpose |
|---|---|
| [`M3_STATE_2026-09-23.md`](M3_STATE_2026-09-23.md) | **Master platform state** — 23 Sep (Day 3), verified A7, A9, A10, curls, browser tests |
| [`A10_CONTINUE_HERE.md`](A10_CONTINUE_HERE.md) | **Resume point** — 60s status, rules, next steps |
| [`A10_IMPLEMENTATION_PLAN.md`](A10_IMPLEMENTATION_PLAN.md) | Living checklist; update after every completed slice |
| [`CLIENT_DEMO.md`](CLIENT_DEMO.md) | Client progress demo script (local stack) |
| [`GROK_REVIEW_ASK.md`](GROK_REVIEW_ASK.md) | Paste into `vsolvehubmanager` for PASS/BLOCK/HOLD |
| [`review-packet/`](review-packet/) | Commit stats, patch, smoke evidence, push script (org write blocked) |
| [`A10_UI_RECON_AND_E2E_PLAN.md`](A10_UI_RECON_AND_E2E_PLAN.md) | Pre-port live UI recon |
| [`LOCAL_STACK.md`](LOCAL_STACK.md) | Boot Docker + API + Next apps |
| [`GROK_BOT_FIRST_MESSAGE.md`](GROK_BOT_FIRST_MESSAGE.md) / [`GROK_BOT_OVERSIGHT_PROMPTS.md`](GROK_BOT_OVERSIGHT_PROMPTS.md) | Auditor bot setup (review only) |
| [`snapshots/2026-09-13-a10-port/`](snapshots/2026-09-13-a10-port/) | Copies of tracked MDs changed during the A10 port |

## Other audits (context)

- `V_SOLVE_HUB_TAKEOVER_AUDIT_AND_ESTIMATE.md`
- `V_SOLVE_HUB_GIT_DEVELOPMENT_PACE.md` (+ CSV / forensics prompt)
- `a10-session-handoff.zip` — original locked plan archive

## Maintenance rule

After completing work: update `A10_IMPLEMENTATION_PLAN.md`, bump `A10_CONTINUE_HERE.md`, and copy newly changed tracked `*.md` into a new dated `snapshots/` folder.
