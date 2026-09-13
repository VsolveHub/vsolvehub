# A10 Career/Jobs — owner smoke path

Branch: `feature/m3-a10-listings`. Built — owner verification pending.

Do not run this as a substitute for pytest. After migrate + seed, click the live apps.

## Seed

```bash
cd backend
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py seed_listing_catalog
```

A10 employer phone after seed: `+919900000088` (must have role code **`partner`**, not
`PARTNER`, plus an **APPROVED** `PartnerApplication` — seed_listing_catalog was fixed for both).
Operations: `+918019013032`.
Customer: register yourself; pin `500032`.

Browse the customer app at `http://localhost:3000` (not `127.0.0.1`) so CORS matches
`CORS_ALLOWED_ORIGINS`.

## Click path

1. Customer `:3000` — Career/Jobs tile (`career-jobs`) → `/listings` → open a live listing → apply → `/listings/my-applications` → withdraw. Drafts must not appear in browse.
2. Partner `:3001` as `+919900000088` — Listings workspace only. Create and submit a listing. It stays `PENDING_REVIEW`, not live. A1 Jobs/Work tabs stay absent for this grant.
3. Operations `:3002` — `/operations/listings` → approve with a reason → listing goes live.
4. Partner shortlist + reveal contact. A second reveal past the daily cap shows the server error.
5. Purchase Starter/Growth with **fake** Razorpay locally. Publish beyond the plan max is blocked.
6. Premium: purchase premium on a listing whose plan includes `FEATURED_PLACEMENT`. Capture sets `is_premium`. Replay does not double-activate.

## Owner test command

Focused A10 slice (repo default `fail_under=85` covers all of `apps` — use `--no-cov`):

```bash
cd backend
./.venv/bin/python -m pytest tests/listings/test_a10_flow.py -q --no-cov
```

Full-suite coverage gate (optional, not required to accept this slice):

```bash
./.venv/bin/python -m pytest -q
```
