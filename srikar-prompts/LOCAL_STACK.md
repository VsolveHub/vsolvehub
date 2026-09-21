# Local stack (this Linux machine)

Temporary. Do not commit. Matches CONTRIBUTING.md, Linux equivalents.

## One-time (already done 2026-09-13)

```bash
# Python 3.13 (system was 3.12)
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.13

# Docker DBs
docker compose --env-file infra/.env.example -f infra/compose.yaml up -d

# Backend
cd backend
"$HOME/.local/share/uv/python/cpython-3.13-linux-x86_64-gnu/bin/python3.13" -m venv .venv
.venv/bin/pip install --upgrade pip pip-tools
.venv/bin/pip install --require-hashes -r requirements/dev.txt || .venv/bin/pip install -r requirements/dev.txt
.venv/bin/pip install 'reportlab>=4,<6'   # missing from hashed lock; do not pip-compile
cp -n .env.example .env
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py seed_console_demo_data
.venv/bin/python manage.py seed_task_catalog
.venv/bin/python manage.py seed_trade_partners
.venv/bin/python manage.py seed_m2_demo --i-understand-this-is-dev-only

# Frontend
cd ../frontend
pnpm install   # corepack will fetch pnpm 11.2.2
```

## Every day

Four terminals from repo root:

```bash
docker compose --env-file infra/.env.example -f infra/compose.yaml up -d

cd backend && .venv/bin/python manage.py runserver 0.0.0.0:8000

cd frontend && pnpm dev:customer   # :3000
cd frontend && pnpm dev:partner    # :3001
cd frontend && pnpm dev:admin      # :3002
```

Worker/beat only when testing expiry, notifications, dispatch.

## Seeded phones (OTP printed on screen)

| Who | Phone | App |
|---|---|---|
| Operations | `8019013032` | :3002 |
| All-trades partner (A1) | `9900000099` | :3001 |
| A10 employer (after `seed_listing_catalog`) | `9900000088` | :3001 |
| Customer | register yourself, PIN `500032` | :3000 |

## After A10 lands

```bash
cd backend
.venv/bin/python manage.py seed_listing_catalog
```

If you re-run `seed_console_demo_data`, re-run the later seeds in order — it pauses unknown services.
