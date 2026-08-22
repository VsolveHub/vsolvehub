# Contributing to VSolveHub

This guide is written for someone joining to work on the **frontend** who has never touched
Django. You do not need to learn Django. You need it running, migrated and seeded, and then you
can forget it exists for the rest of the day.

Follow it top to bottom once. After that, section 5 ("Every day") is the only part you re-read.

---

## 1. The 60 seconds of architecture you actually need

```
  Django (localhost:8000)  ←── the only place business logic lives
        │
        │  contracts/openapi/v1.yaml   ← the contract, generated from Django, committed
        │
        ├── frontend/apps/customer  (localhost:3000)   customers
        ├── frontend/apps/partner   (localhost:3001)   service professionals
        └── frontend/apps/admin     (localhost:3002)   operations console
```

Three rules follow from that picture, and they explain most of the code review comments you will
get:

1. **Django owns pricing, permissions, status and deadlines.** The browser derives none of them.
   If a number, a fee, a status or a permission is not in the API response, it is not rendered.
2. **The three apps are three separate origins on purpose.** It is a security boundary, not a
   routing convenience — a stolen customer session must not be a valid credential against the
   console that approves payouts.
3. **No mock, placeholder or fallback data.** Real server data or an honest empty state. Error
   handling is not fallback data and stays.

The apps are Next.js 16 (App Router) + React 19 + TanStack Query + Tailwind v4, in a pnpm/turbo
monorepo.

---

## 2. Install these (one time)

| Tool | Version | Notes |
| --- | --- | --- |
| **Python** | **3.13 exactly** | Not 3.14. `backend/pyproject.toml` pins `>=3.13,<3.14`, and the bootstrap script asks for `py -3.13`. |
| **Node** | 20+ (24 works) | |
| **pnpm** | 11.2.2 | `corepack enable && corepack prepare pnpm@11.2.2 --activate` |
| **Docker Desktop** | any current | Must actually be running — it hosts PostgreSQL and Redis. |
| **Git** | any current | |

You do **not** need to install PostgreSQL or Redis yourself. Docker provides both.

---

## 3. First-time setup

### 3a. Start the databases

From the repo root:

```powershell
docker compose --env-file infra\.env.example -f infra\compose.yaml up -d
```

```bash
# macOS / Linux
docker compose --env-file infra/.env.example -f infra/compose.yaml up -d
```

That gives you PostgreSQL 17 on `127.0.0.1:15432` and Redis 7.4 on `127.0.0.1:56379`. The odd
ports are deliberate, so they never collide with anything else you have installed.

Check it came up: `docker compose -f infra/compose.yaml ps` — both services should say `healthy`.

### 3b. Set up the backend

**Windows (PowerShell)** — the repo ships scripts for this:

```powershell
cd C:\dev\vsolve\backend
.\scripts\bootstrap.cmd            # creates backend\.venv and installs everything into it
Copy-Item .env.example .env
.\.venv\Scripts\python.exe manage.py migrate
```

**macOS / Linux** — no scripts exist yet, so run the equivalents by hand:

```bash
cd ~/vsolve/backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip pip-tools
pip install --require-hashes -r requirements/dev.txt
cp .env.example .env
python manage.py migrate
```

> If `--require-hashes` refuses a package on macOS/Linux, drop the flag for your local install.
> **Do not** re-run `pip-compile` and commit a changed lock file to fix it — the lock is generated
> on Windows and regenerating it elsewhere churns the whole file.

`bootstrap` only ever writes into `backend/.venv`. It never touches your global Python.

**What `.env` is for.** `backend/.env` is gitignored and machine-local. Almost every value in
`.env.example` is already the default in code, so copying it changes little — but it is the file
you edit when you need to point at a different database or turn a provider on, and every existing
runbook assumes it is there. Copy it.

Locally, payments, payouts and OTP delivery are **deterministic fakes**, and the OTP code is shown
on screen. All three are fail-closed everywhere else — production refuses to boot with them.

### 3c. Seed the data

An empty database renders an empty app: no services, no partners, nothing to book, every console
blank. The seeds are what make the product visible.

**Run these in this order.** Order matters — see the warning below.

```powershell
cd C:\dev\vsolve\backend
.\.venv\Scripts\python.exe manage.py seed_console_demo_data
.\.venv\Scripts\python.exe manage.py seed_task_catalog
.\.venv\Scripts\python.exe manage.py seed_trade_partners
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only
```

```bash
# macOS / Linux, with the venv activated
python manage.py seed_console_demo_data
python manage.py seed_task_catalog
python manage.py seed_trade_partners
python manage.py seed_m2_demo --i-understand-this-is-dev-only
```

What each one gives you:

| Command | What appears |
| --- | --- |
| `seed_console_demo_data` | The M1 catalog, partner skills and consent documents, an all-trades test partner, partner density — and then it drives real bookings through the real lifecycle (cart → checkout → fake payment → dispatch → completion → disputes → refunds → payouts) so the Operations consoles have rows instead of empty states. It calls `seed_technician_catalog`, `seed_partner_reference_data`, `seed_test_partner` and `seed_m1_density_fixtures` for you. |
| `seed_task_catalog` | The full ~200-service priced catalog across Technician, Beautician, Home and Pet. Without it you have six services. |
| `seed_trade_partners` | One approved partner per trade, so the wider catalog can actually be staffed. A service nobody can do prices and schedules and then fails at dispatch. |
| `seed_m2_demo` | Milestone 2 configuration: the A3 (`/construction-helpers`) and A5 (`/interior-fit-out-project`) services, prices, SLA clocks, a wage floor, and three approved vendors. Every money value it writes is a **placeholder standing in for an owner decision**, marked as such in the database. It refuses to run outside `DEBUG`, which is why the long flag is required. See [`docs/runbooks/m2-demo-seed.md`](docs/runbooks/m2-demo-seed.md). |

> ### ⚠️ The ordering trap
>
> `seed_technician_catalog` ends by **pausing every service it does not know about**. That is
> correct for its purpose, but it means re-running `seed_console_demo_data` (which calls it) will
> pause the task catalog and both M2 services, and your app will suddenly show six services and
> two dead M2 links.
>
> **If you ever re-run `seed_console_demo_data` or `seed_technician_catalog`, re-run the other
> three commands after it, in the order above.**

Every seed command is idempotent — running one twice changes nothing. Run them again freely after
a `migrate`.

### 3d. Set up the frontend

```powershell
cd C:\dev\vsolve\frontend
pnpm install
```

No environment file is required. Every app defaults to `http://localhost:8000` for the API, and
Django's local CORS config already permits ports 3000, 3001 and 3002.

**Optional, and what the owner actually runs.** The customer and partner apps can proxy the API
through their own origin instead, which makes the session cookie first-party — necessary if you
ever test on a real phone through a tunnel. To use that setup, create `.env.local` in
`frontend/apps/customer/` and `frontend/apps/partner/`:

```dotenv
# Empty on purpose: the browser then emits relative URLs (/api/v1/...) and Next's
# dev rewrite forwards them to Django.
NEXT_PUBLIC_API_BASE_URL=

# Server rendering runs in Node, where a relative URL resolves against nothing.
API_BASE_URL=http://localhost:8000

# Where the dev rewrite forwards to.
API_PROXY_TARGET=http://localhost:8000
```

The admin app has no rewrite and needs no file. These are gitignored, so nobody else's copy will
appear in your checkout.

---

## 4. Sign in

Every login is a phone number plus an OTP. Locally, **the OTP code is printed on the login screen
itself** ("Development delivery is on. Code: 123456") — there is no SMS and no inbox to check.

| Who | Phone | Where |
| --- | --- | --- |
| Operations | `+918019013032` | `localhost:3002` |
| Partner, eligible for every trade | `+919900000099` | `localhost:3001` |
| Trade partners (one per trade) | `+9170100…` | `localhost:3001` |
| M2 vendors (A3 + A5 capable) | `+917030000001`, `…02`, `…03` | `localhost:3001` |
| Customer | **register your own** | `localhost:3000` |

There is no seeded customer, deliberately — sign up through the app's own OTP flow. **Your address
must have postal code `500032`**, or nothing is serviceable: `hyderabad-500032` is the only active
service area the seeds create.

Each seed command uses its own reserved phone-number block, so they never collide with each other.

---

## 5. Every day

Four terminals. Start Docker first; the rest can start in any order.

```powershell
# 1. Databases (only if not already running)
docker compose --env-file infra\.env.example -f infra\compose.yaml up -d

# 2. Django API
cd C:\dev\vsolve\backend
.\scripts\server.cmd                      # http://localhost:8000

# 3. Background jobs
cd C:\dev\vsolve\backend
.\scripts\worker.cmd                      # Celery worker
.\scripts\beat.cmd                        # Celery scheduler — exactly one, ever

# 4. The app you are working on
cd C:\dev\vsolve\frontend
pnpm dev:customer                         # or dev:partner / dev:admin
```

macOS/Linux equivalents, with the venv activated:

```bash
python manage.py runserver 0.0.0.0:8000
python -m celery -A config worker --loglevel=info
python -m celery -A config beat --loglevel=info
```

**Do you need the worker and beat?** For pure UI work — layout, styling, a screen that only reads
data — no. Start them the moment you touch anything that *happens*: dispatch, offers,
notifications, payments, payouts, SLA deadlines, auto-completion. The API server itself runs no
background work, so without a worker those events are simply written to an outbox and never
delivered, and the UI sits waiting for something that will never arrive. That failure looks
exactly like a frontend bug and is not one.

Run **exactly one beat process**. It is a scheduler, not a worker: a second one fires every
periodic task twice. Workers are the opposite — run as many as you like.

Useful URLs while you work:

- **Swagger UI — `http://localhost:8000/api/v1/docs/`** ← the one to bookmark. Every endpoint,
  every field, every error, browsable and callable.
- Raw OpenAPI: `http://localhost:8000/api/v1/schema/`
- Readiness: `http://localhost:8000/api/v1/health/ready/`
- Django admin: `http://localhost:8000/admin/` (needs `manage.py createsuperuser`; the "username"
  it asks for is a phone number in `+91…` form)

---

## 6. Where the frontend code lives

```
frontend/
├── apps/
│   ├── customer/          app/       ← routes (Next App Router)
│   ├── partner/           features/  ← the actual screens, grouped by domain
│   └── admin/             lib/api/   ← this app's API client wiring
└── packages/
    ├── ui/                shared primitives — Button, Card, OtpForm, EmptyState…
    ├── query/             TanStack Query hooks, auth guards, the OTP flow
    ├── api-client/        the generated client — DO NOT HAND-EDIT src/generated/
    ├── config/            shared config and timing constants
    └── testing/           test setup and helpers
```

Product context, if you want to know *why* a screen exists, is in
[`Django_Next.js_Plan/`](Django_Next.js_Plan/) — start at its README. Architecture decisions are in
[`docs/adr/`](docs/adr/), operational procedures in [`docs/runbooks/`](docs/runbooks/).

---

## 7. The contract is the boundary

`contracts/openapi/v1.yaml` is generated from Django, committed, and gated on both sides. The
TypeScript client in `packages/api-client/src/generated/schema.d.ts` is generated from it.

- **Never hand-edit** `v1.yaml` or `generated/schema.d.ts`. Both are generated artifacts and both
  are checked.
- If `pnpm contract:check` fails, the committed client no longer matches the contract. Regenerate
  it: `pnpm contract:generate`, then commit the result.
- **You cannot call a path or read a field Django does not publish** — the generated types make it
  a compile error, which is the point.
- Need an endpoint that does not exist? Write it up in [`contracts/proposals/`](contracts/proposals/)
  — the endpoint, an example payload, and the user-visible error — and raise it with the owner.
  Do not work around a missing endpoint by computing the answer in the browser.

---

## 8. Before you push

```powershell
cd C:\dev\vsolve\frontend
pnpm contract:check
pnpm lint
pnpm typecheck
pnpm test
```

Two things that have burned this repo before:

- **Turbo caches results.** `pnpm typecheck` will cheerfully replay a cached pass over code that
  no longer compiles. When a gate is deciding something, force a cold run:
  `pnpm exec turbo run typecheck --force`.
- **Leave the Playwright end-to-end suite alone** unless you are asked to run it. It is heavy, and
  the owner runs it at task gates. `pnpm test` (Vitest unit tests) is the one you run.

If you did touch `backend/`, its gate is `backend\scripts\quality.cmd` (ruff, strict mypy, pytest,
migration drift, contract freshness). Run the backend suite against your own database if anyone
else might be running it at the same time — `DATABASE_URL=…/vsolve_lane1`. Two pytest processes
sharing `test_vsolve` fail at setup with `DuplicateDatabase`, and the failure looks nothing like
its cause.

**Branches.** Work happens on feature branches. `feat/m2-workforce-projects` is Milestone 2, and it
is **never pushed to `main`** without the owner's explicit instruction.

---

## 9. Django, only as much as you need

You will not write Django. You will occasionally need these. Prefix each with
`.\.venv\Scripts\python.exe` on Windows, or `python` with the venv activated.

| Command | When |
| --- | --- |
| `manage.py migrate` | **After every `git pull` that touched `backend/**/migrations/`.** This is the single most common cause of "it broke and I changed nothing" — the code expects a column the database does not have. |
| `manage.py showmigrations` | To see what is applied and what is pending. |
| `manage.py seed_*` | See section 3c. Idempotent; re-run after a migrate. |
| `manage.py createsuperuser` | Once, if you want the Django admin at `/admin/`. |
| `manage.py shell` | A Python REPL with the models loaded, for when you need to look at a row. |

**Nuclear reset**, when the database is in a state you cannot explain:

```powershell
docker compose --env-file infra\.env.example -f infra\compose.yaml down -v
docker compose --env-file infra\.env.example -f infra\compose.yaml up -d
cd backend
.\.venv\Scripts\python.exe manage.py migrate
# then all four seed commands from section 3c, in order
```

`-v` deletes the volumes, which is the whole point — it throws away every row. Nothing local is
precious; the seeds rebuild all of it.

---

## 10. When it breaks

| Symptom | Cause and fix |
| --- | --- |
| `py -3.13` not found, or the venv builds on 3.14 | The backend pins `>=3.13,<3.14`. Install Python 3.13 specifically; 3.14 will not do. |
| `connection refused` on port 15432 | Docker Desktop is not running, or the containers are not up. `docker compose -f infra/compose.yaml ps`. |
| Port 15432 or 56379 already taken | Change `POSTGRES_PORT`/`REDIS_PORT` in your infra env file **and** `DATABASE_URL`/`REDIS_URL` in `backend/.env` to match. |
| Django starts, but the app shows almost no services | Seeds not run — or you re-ran `seed_console_demo_data` and it paused everything else. Re-run section 3c in order. |
| "Not serviceable" at checkout | Your address postal code is not `500032`. That is the only seeded service area. |
| Partner gets 403 on going online | That partner is not fully approved — approval needs documents and consents, not just a status. Use a seeded partner (`+919900000099`). |
| A booking never dispatches; no notifications; deadlines never fire | The Celery worker is not running. Start `worker.cmd` (and `beat.cmd` for anything on a clock). |
| Column does not exist / `ProgrammingError` after a pull | Run `manage.py migrate`. |
| `pnpm typecheck` passes over code you know is broken | Turbo cache. `pnpm exec turbo run typecheck --force`. |
| `contract:check` fails | The generated client is stale against `v1.yaml`. `pnpm contract:generate` and commit. Never hand-edit either file. |
| 403 CSRF or the session does not stick | You changed the API base URL, or you are on a port Django's CORS/CSRF list does not include (3000, 3001, 3002). |
| `DuplicateDatabase` during backend tests | Someone else is running pytest against the same database. Use your own: `DATABASE_URL=…/vsolve_lane1`. |

---

## 11. House rules

- **No fake data.** No mocks, no placeholders, no fallback content in a production path. Real
  server data or an honest empty state. Legitimate error handling stays.
- **Don't derive server truth in the browser.** Price, fee, status, deadline, permission — render
  what the API returned, or render nothing.
- **Don't hand-edit generated files** (`contracts/openapi/v1.yaml`,
  `packages/api-client/src/generated/`).
- **Don't merge M2 into `main`** without being told to.
- **Match the surrounding code.** Comment density, naming and idiom in this repo are deliberate;
  a lot of the "why" is written down next to the code that needs it.

Stuck for more than twenty minutes on setup? Ask. Something in this file being wrong is far more
likely than you having broken it.
