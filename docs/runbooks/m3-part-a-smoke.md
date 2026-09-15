# M3 Part A smoke — Career + Rental + Stay

Branch: `feature/m3-a10-listings` (M3 integration trunk). **Do not merge to `main`.**

Built — owner verification pending.

## Prerequisites

```bash
docker compose --env-file infra/.env.example -f infra/compose.yaml up -d postgres redis

cd backend
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py seed_listing_catalog
./.venv/bin/python manage.py seed_rental_demo
./.venv/bin/python manage.py seed_stay_demo
```

Use `http://localhost:3000` (not `127.0.0.1`) for CORS.

## Demo phones

| Surface | Phone | Path |
| --- | --- | --- |
| Customer Career | `9900000077` | `:3000/listings` |
| Partner Career | `9900000088` | `:3001/listings` (Listings tab, not Work) |
| Customer Rental | `9900000055` | `:3000/rentals` |
| Partner Rental | `9900000066` | `:3001/rentals` |
| Customer Stay | `9900000033` | `:3000/stays` |
| Partner Stay | `9900000044` | `:3001/stays` |
| Operations | `8019013032` | `:3002/operations/listings`, `/rentals`, `/stays` |

OTP prints on screen in local/dev.

## Click paths

1. **Career (A10)** — browse → apply → my-applications; partner listings chrome without Work; ops moderate with reason. See `m3-a10-listing-smoke.md`.
2. **Rental (A7)** — customer book seeded Bosch Drill; partner sees booking; ops approve pending Angle Grinder with reason. Deposit may show PARTIAL demo hold note.
3. **Stay (A9 enquiry-first)** — customer enquire on Lakeview PG; partner respond; ops approve pending hostel with reason.

## Tests

```bash
cd backend
./.venv/bin/python -m pytest tests/listings/ tests/rental/ tests/stay/ -q --no-cov

cd ../frontend
pnpm exec vitest run \
  apps/customer/features/catalog/service-href.test.ts \
  apps/partner/features/workspace/registry.test.ts \
  apps/partner/features/session/partner-shell-nav.test.tsx
```

## PARTIAL

- Deposit money uses demo/test HELD path (no live Razorpay) — Part B.
- A9 has no full UnitReservation locking matrix (enquiry-first MVP only).
- AssetReservation overlap is application-level (day-granular), not Postgres ExclusionConstraint yet.
- FE rental/stay pages use fetch until OpenAPI client regen is consumed everywhere.
