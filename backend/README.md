# Vsolve Hub Backend

The backend is the sole business and database authority for Customer, Partner and Operations
clients.

## Prerequisites

- Python 3.13
- Docker Desktop with the Docker daemon running
- PowerShell 7 or Windows PowerShell

## First setup

From `C:\dev\vsolve\backend`:

```powershell
.\scripts\bootstrap.cmd
Copy-Item .env.example .env
docker compose --env-file ..\infra\.env.example -f ..\infra\compose.yaml up -d
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_technician_catalog
.\.venv\Scripts\python.exe manage.py seed_partner_reference_data
.\scripts\server.cmd
```

The bootstrap script always installs into `backend\.venv`; it never changes global Python
packages.

The seed commands are idempotent. The M1 Technician seed activates only the six reviewed one-person,
task-priced variants and the `hyderabad-500032` service area for PIN `500032`. Legacy catalog rows
are retained but paused/inactive; the development-only West Hyderabad fixture is never activated as a
fallback.

## Location lookup

Reverse geocoding uses the Google Geocoding API (`GEOCODING_PROVIDER=google`) with a three-second
timeout and a seven-day rounded-coordinate cache, inside Google's 30-day limit on cached
coordinates. Set `GOOGLE_MAPS_SERVER_KEY` to a server key restricted to the Geocoding API and the
servers' IPs; it is never the browser key the frontends load the map with. Production refuses to
start without it. Provider failure returns a recoverable manual-entry response and never invents an
address. There is no second provider and no fallback between providers.

## Asynchronous topology

The web server, the Celery worker and the Celery beat scheduler are three separate processes. The
server alone runs no background work; starting it without a worker leaves every outbox event
undelivered.

```powershell
.\scripts\worker.cmd
.\scripts\beat.cmd
```

Run **exactly one beat process per deployment**. Beat is a scheduler, not a worker: a second one
does not share the schedule, so every periodic task fires twice. Workers are the opposite — run as
many as the load needs, because the outbox lease and `select_for_update(skip_locked=True)` keep two
workers from delivering one event concurrently.

`OutboxEvent.available_at` is a visibility deadline rather than a creation stamp. Claiming an event
pushes the deadline out by `OUTBOX_LEASE_SECONDS`; a worker that dies before publishing lets the
deadline lapse, and the `recover-outbox-events` sweep re-drives the event every 30 seconds. This
makes one setting load-bearing:

> `OUTBOX_LEASE_SECONDS` must stay greater than `CELERY_TASK_TIME_LIMIT`.

If the lease is shorter, the sweep re-queues work that is still legitimately running and the
handler executes twice. The defaults (120s lease against a 60s task time limit) satisfy this;
raising `CELERY_TASK_TIME_LIMIT_SECONDS` without raising the lease breaks it.

Events that exhaust `OUTBOX_MAX_ATTEMPTS` stop being swept and become dead letters. Inspect them
with `manage.py outbox_report` and return exactly one to the sweep with
`manage.py outbox_replay --event-id <uuid>`. The procedures are in `docs/runbooks/queue-outage.md`,
`docs/runbooks/outbox-replay.md` and `docs/runbooks/stuck-command.md`.

## Integration tests

The default `pytest` run needs no Redis: it excludes the `integration` marker and runs Celery
eagerly. Eager mode proves nothing about ordering, retries or crash recovery, so the opt-in suite
runs against the real broker with a worker in a real subprocess that the tests kill.

```powershell
docker compose --env-file ..\infra\.env.example -f ..\infra\compose.yaml up -d
.\scripts\integration-tests.cmd
```

The suite fails loudly rather than skipping when `infra/compose.yaml` is not up. It uses
`config.settings.integration`, which is deliberately not derived from `config.settings.test`.

## API endpoints

- API: `http://localhost:8000/api/v1/`
- Liveness: `http://localhost:8000/api/v1/health/live/`
- Readiness: `http://localhost:8000/api/v1/health/ready/`
- Local OpenAPI: `http://localhost:8000/api/v1/schema/`
- Local Swagger UI: `http://localhost:8000/api/v1/docs/`

## Quality

```powershell
.\scripts\quality.cmd
```

Individual commands:

```powershell
.\.venv\Scripts\python.exe -m ruff format .
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m mypy apps common config
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m pip_audit -r requirements\base.txt
```

## Dependency changes

Edit `requirements\base.in` or `requirements\dev.in`, then run:

```powershell
.\.venv\Scripts\pip-compile.exe --generate-hashes --strip-extras --output-file=requirements\base.txt requirements\base.in
.\.venv\Scripts\pip-compile.exe --generate-hashes --strip-extras --output-file=requirements\dev.txt requirements\dev.in
.\.venv\Scripts\python.exe -m pip install --require-hashes -r requirements\dev.txt
```

Commit both `.in` and generated `.txt` files. Never hand-edit generated lock files.
