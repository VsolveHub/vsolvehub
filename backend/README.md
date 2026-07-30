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
.\.venv\Scripts\python.exe manage.py seed_technician_catalog --with-development-area
.\scripts\server.cmd
```

The bootstrap script always installs into `backend\.venv`; it never changes global Python
packages.

The seed command is idempotent. It creates 19 explicitly priced Technician services and a
development-only West Hyderabad service area for PIN `500032`; it is configuration, never a hidden
location fallback.

## Location lookup

Local settings use the Nominatim reverse-geocoding adapter with a three-second timeout and
seven-day rounded-coordinate cache. Set the production contact in `GEOCODING_USER_AGENT` and review
the selected provider's production usage terms/capacity before launch. Provider failure returns a
recoverable manual-entry response and never invents an address.

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
