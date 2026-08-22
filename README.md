# VSolveHub

A multi-category local-services marketplace for Tier 2/3 Indian cities. Django REST backend,
Next.js frontends, one versioned OpenAPI contract between them.

> The previous contents of this file described a Flutter monorepo (`apps/customer_app`,
> `apps/worker_app`) that no longer exists. It predates the platform rebuild.

## Layout

| Path | What it is |
| --- | --- |
| `backend/` | Django 5 + DRF + Celery. PostgreSQL 17, Redis 7.4. 16 apps. |
| `frontend/` | pnpm + turbo monorepo: three Next.js 16 App Router apps and five shared packages. |
| `contracts/openapi/v1.yaml` | **The contract.** Generated from Django, committed, and gated — the backend suite fails if it drifts. |
| `Django_Next.js_Plan/` | The authoritative product and delivery plan. Start at its [README](./Django_Next.js_Plan/README.md). |
| `docs/adr/`, `docs/runbooks/` | Nine architecture decisions, thirteen operational runbooks. |

### The three frontends

They deploy to three separate origins, which is a security boundary rather than a routing
convenience:

| App | Origin | Audience |
| --- | --- | --- |
| `frontend/apps/customer` | `vsolvehub.com` | Customers |
| `frontend/apps/partner` | `partner.vsolvehub.com` | Service professionals |
| `frontend/apps/admin` | `consolve.vsolvehub.com` | Operations |

Session cookies are scoped to the issuing host and **production refuses to start otherwise**. A
shared `.vsolvehub.com` cookie would make a stolen Customer session a valid credential against the
console that approves payouts.

## Getting started

**New here? Read [CONTRIBUTING.md](./CONTRIBUTING.md)** — full setup, the seed order, sign-in
accounts and the failure modes, written for someone who has not used Django.

Requires Docker, Python 3.13 (not 3.14 — `backend/pyproject.toml` pins `>=3.13,<3.14`) and Node
with pnpm.

```powershell
docker compose --env-file infra\.env.example -f infra\compose.yaml up -d   # PostgreSQL 17 + Redis 7.4

cd backend
.\scripts\bootstrap.cmd                   # creates backend\.venv, installs requirements\dev.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_console_demo_data   # catalog, partners, populated consoles
.\scripts\server.cmd

cd ..\frontend
pnpm install
pnpm dev
```

`seed_console_demo_data` is the first of four seed commands and the order between them matters —
see [CONTRIBUTING.md §3c](./CONTRIBUTING.md).

Local development uses deterministic fake payment and payout providers and an on-screen OTP. All
three are **fail-closed everywhere else** — an unconfigured provider raises rather than guessing.

## Working on it

```bash
cd backend  && scripts/quality.cmd    # ruff, strict mypy, pytest+coverage, migration drift, OpenAPI freshness
cd frontend && pnpm typecheck && pnpm lint && pnpm test
```

Two things that have burned us and are worth knowing before you start:

- **Run the backend suite against your own database** when anyone else might be running it —
  `DATABASE_URL=…/vsolve_lane1`. Two pytest processes sharing `test_vsolve` fail at setup with
  `DuplicateDatabase`, and the failure looks nothing like its cause.
- **Force a cold run when a gate decides something.** `pnpm typecheck` will happily replay a cached
  pass from turbo over code that no longer compiles.

## The contract is the boundary

Django owns pricing, authorization, assignment, payment and workflow. The browser derives none of
them: if a number, deadline, fee, status or permission is not in the response, it is not rendered.
The TypeScript client is generated from `v1.yaml` and `generate:check` gates typecheck, so a
frontend cannot call a path or read a field that Django does not publish.

No mock, placeholder or fallback data in production paths — real server data or an honest empty
state. Error handling is not fallback data and stays.

## Status

Two milestones are separately accepted and separately paid. Both now live on `main`.

**Milestone 1 — the Scheduled A1 Technician slice.** Built through S7; S8 acceptance is the remaining
stage. Live board: [`Django_Next.js_Plan/M1/task.md`](./Django_Next.js_Plan/M1/task.md).

**Milestone 2 — workforce and project services** (`A3_TIME_BLOCK` + `A5_CUSTOM_PROJECT`). Merged
into `main` on 23 August 2026 on the owner's explicit instruction, from
`feat/m2-workforce-projects`. Every planned wave is built — backend C0–C7, both customer and partner
frontend columns, and the Operations surfaces — and every task is recorded as **built, owner
verification pending**: no phase has passed its gate, because the gate is the owner's manual pass.
Live board: [`Django_Next.js_Plan/M2/task.md`](./Django_Next.js_Plan/M2/task.md); the walkthroughs
are in [`docs/runbooks/`](./docs/runbooks/) (`m2-*-smoke.md`).

Accepting M1 on its own no longer means shipping `main`. The last M1-only commit is `d1f443a`; an
M1 acceptance build has to be cut from there.

The contract is at **1.39.0**. `contracts/openapi/v1.yaml` is the truth, not this paragraph.
