# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

VSolveHub is a local-services marketplace: a Django REST backend, three Next.js web apps, two Expo
mobile apps, and one generated OpenAPI contract between backend and clients.

## Read before editing

- `AGENTS.md`: path ownership between agents, quality rules, and **who may run tests**. By default
  agents do not run tests; feature briefs grant exceptions.
- `frontend/mobile/AGENTS.md`: rules for the Expo apps (fixed stack, porting rules, UI pitfalls).
- Feature briefs override both for their own work. Current: `docs/taxi/README.md` (finish Rides,
  then Taxi, branch `taxi/v1`, which now holds Rides V1, Pick up & Drop and Taxi). Earlier briefs,
  kept for reference: `docs/rapido/README.md` (Rides), `docs/parcel/README.md` (Pick up & Drop). A
  brief lists the only files that may be written; anything it does not cover goes to the owner,
  not into code.
- `CONTRIBUTING.md`: first-time setup, seed order, sign-in accounts, troubleshooting.

Some numbers in `README.md` are out of date (contract version, app count). Trust the code.

## Commands

Windows, PowerShell. Python 3.13 (not 3.14), pnpm 11.2.2, Docker for PostgreSQL 17 and Redis 7.4.

```powershell
.\start-dev.cmd                              # whole stack: Docker, API, worker, beat, web apps in 4 windows
                                             # close those windows before re-running (beat must never run twice)
docker compose --env-file infra\.env.example -f infra\compose.yaml up -d   # just PostgreSQL + Redis

# backend\
.\scripts\bootstrap.cmd                      # create .venv
.\.venv\Scripts\python.exe manage.py migrate
# seed in this order (CONTRIBUTING.md §3c): seed_console_demo_data, seed_task_catalog,
# seed_trade_partners, seed_m2_demo --i-understand-this-is-dev-only
.\scripts\server.cmd                         # API on :8000 (docs at /api/v1/docs/)
.\scripts\worker.cmd                         # Celery worker
.\scripts\beat.cmd                           # Celery scheduler: only ever one
.\scripts\quality-static.cmd                 # ruff, strict mypy, migration drift, contract drift
.\scripts\quality.cmd                        # the same plus pytest and coverage
.\.venv\Scripts\python.exe -m pytest tests/<app> -q
.\.venv\Scripts\python.exe -m pytest tests/<app>/<file>.py::<test_name> -q

# contract: after any API change, in this order
.\.venv\Scripts\python.exe manage.py spectacular --file ..\contracts\openapi\v1.yaml --validate
# frontend\
pnpm contract:generate
pnpm contract:check

# frontend\
pnpm dev                                     # customer :3000, partner :3001, admin :3002
pnpm --filter <app> lint                     # <app>: admin, customer, partner
pnpm --filter <app> typecheck
pnpm test                                    # Vitest for web apps and packages
pnpm exec vitest run apps/admin/<path>       # one folder or file; web apps have no "test" script
pnpm --filter customer-mobile test           # Jest; also partner-mobile
pnpm --filter customer-mobile exec jest src/features/<path>
pnpm --filter customer-mobile exec expo start --lan
```

- Agents run only `quality-static.cmd`, lint, typecheck and build. pytest, Vitest and Jest run only
  where a feature brief authorizes them (e.g. `docs/taxi/README.md` §11). Otherwise report work as
  "built — owner verification pending" with the exact test commands.
- `pnpm typecheck` can replay a cached turbo pass. Use `pnpm exec turbo run typecheck --force` when
  the result matters.
- Run Vitest from a path with an uppercase drive letter (`D:\...`). From `d:\...` React loads twice
  and components fail with `Cannot read properties of null (reading 'useState')`.
- Parallel pytest runs on one database fail with `DuplicateDatabase`; set a separate `DATABASE_URL`.
- Rides screens use `react-native-maps`, so they need a current EAS development build on the phone.
- The repository is LF. Windows Python and `makemigrations` write CRLF; check `git diff --stat`.

## Architecture

**Django is the only place business logic lives.** It owns prices (integer paise), states,
permissions and deadlines. Clients render what the API returns: no derived values, no fallback or
placeholder data, an honest empty or error state instead.

**Backend** (`backend/`): a modular monolith with one app per domain in `apps/`, shared HTTP plumbing
in `common/`, settings in `config/`. Layers in an app:

- `views.py` does HTTP only, `services.py` owns state changes and invariants, `selectors.py` reads,
  and database constraints back the invariants.
- One error envelope for every API: services raise the app's domain exceptions (`exceptions.py`)
  and `common/errors/handler.py` renders them.
- Side effects go through the transactional outbox (`foundation.OutboxEvent`) to Celery. Without the
  worker and beat, dispatch, notifications and deadlines silently never happen.
- PostgreSQL is the record; Redis is disposable (cache, queues, live positions).
- Payment, payout, OTP and similar providers sit behind adapters: deterministic fakes locally, and
  fail closed elsewhere when unconfigured.

**Contract**: Django → `contracts/openapi/v1.yaml` → `frontend/packages/api-client/src/generated/`.
Both outputs are generated, committed and never hand-edited. A client cannot call a path or read a
field Django does not publish.

**Web** (`frontend/apps/`): Next.js App Router. `app/` holds routes, `features/<domain>/` holds the
screens (`model` for pure rules, `view`, `queries`), data goes through TanStack Query. `admin` is the
Operations console. The three apps are separate origins as a security boundary, with host-scoped
session cookies. `vitest.config.ts` resolves `@/` per app, based on the importing file.

**Mobile** (`frontend/mobile/`): `apps/customer` and `apps/partner` (Expo Router, NativeWind) with
`packages/core` (API client in bearer mode, auth, location, push) and `packages/ui`. Screens are
ports of the web screens, except where a feature brief says there is no web original. Captains use
the Partner app; there is no separate captain app.

`web/` is legacy code. Do not extend it.

## Git

Stage explicit paths only (never `git add -A` or `git add .`); several people and agents share the
tree. Work on a feature branch, never commit to `main` directly.
