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
| `docs/adr/`, `docs/runbooks/` | Six architecture decisions, five operational runbooks. |

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

Requires Docker, Python 3.12+ and Node with pnpm.

```bash
docker compose up -d                 # PostgreSQL 17 + Redis 7.4

cd backend
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements/local.txt
python manage.py migrate
python manage.py seed_console_demo_data   # optional: fills every Operations console
python manage.py runserver

cd ../frontend
pnpm install
pnpm dev
```

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

Two milestones run in parallel, on separate branches, and are separately accepted.

**Milestone 1 — the Scheduled A1 Technician slice.** Built through S7; S8 acceptance is the remaining
stage. `main` is the M1 acceptance build. Live board:
[`Django_Next.js_Plan/M1/task.md`](./Django_Next.js_Plan/M1/task.md).

**Milestone 2 — workforce and project services** (`A3_TIME_BLOCK` + `A5_CUSTOM_PROJECT`). On
`feat/m2-workforce-projects`, and **never pushed to `main`** without the owner's explicit
instruction. Backend domain layers for capabilities, requirements, matching and proposals are built
and tested; contract **1.21.0** publishes 17 M2 paths; the Partner workspace shell is wired to them.
No phase has passed its gate. Live board:
[`Django_Next.js_Plan/M2/task.md`](./Django_Next.js_Plan/M2/task.md).

The contract version above moves with the branch — `contracts/openapi/v1.yaml` is the truth, not this
paragraph.
