# A10 Career/Jobs — owner smoke path

Branch: `feature/m3-a10-listings` (M3 integration trunk). **Do not merge to `main`.**

Built — owner verification pending. Do not treat this runbook as a substitute for pytest.

## Prerequisites

```bash
# Postgres + Redis (local compose)
docker compose --env-file infra/.env.example -f infra/compose.yaml up -d postgres redis

cd backend
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py seed_listing_catalog
```

Use `http://localhost:3000` (not `127.0.0.1`) so CORS matches `CORS_ALLOWED_ORIGINS`.

OTP is printed on screen in local/dev for these phones.

## Demo logins after seed

| Role | Phone | App | Entry |
|------|-------|-----|-------|
| Customer applicant | `9900000077` | `:3000` | `/listings`, `/listings/my-applications` |
| Partner employer (Apex) | `9900000088` | `:3001` | `/listings` (role code `partner` + APPROVED application) |
| Operations | `8019013032` | `:3002` | `/operations/listings` |

Seed includes:

- ACTIVE `A10VariantConfiguration` rows + Career taxonomy (`career-jobs`)
- Employer partner with APPROVED `A10_LISTING` capability + Enterprise subscription
- PUBLISHED+APPROVED listings (including Featured/premium demos)
- Ops-queue listing: **Office Coordinator — Pending Ops Review**
- Sample applications (SUBMITTED + SHORTLISTED) for customer My Applications and partner leads

## Click path

1. **Customer** `:3000` — Careers / `career-jobs` → `/listings` (not `/book/`, cart, or `/requests/`). Open a live listing → apply → `/listings/my-applications` → withdraw if offered. Drafts must not appear in public browse. Seeded apps for `9900000077` should already show.
2. **Partner** `:3001` as `9900000088` — A10-only shell chrome: dock/desktop nav shows **Listings** (`/listings`), not Work (`/work/all`) or Jobs. `public_state` badges: LIVE / PENDING_REVIEW / etc. Create and submit a listing; it stays `PENDING_REVIEW`, not live. Open a published listing → applications inbox → shortlist / reveal contact as implemented. Mixed A3/A5 + A10 partners still keep the Work tab.
3. **Operations** `:3002` — `/operations/listings` → filter Pending → open **Office Coordinator — Pending Ops Review** → approve or reject **with a required reason** → listing public state updates. Remove/reinstate with reason if exercised.
4. Partner shortlist + reveal contact. A second reveal past the daily cap shows the server error (not a fake success).
5. Subscription / premium purchase paths: use **fake** Razorpay locally only. Publish beyond plan max is blocked server-side. Premium capture sets `is_premium`; replay must not double-activate.

## Owner test commands

Focused A10 slice (repo default `fail_under=85` covers all of `apps` — use `--no-cov`):

```bash
cd backend
./.venv/bin/python -m pytest tests/listings/ -q --no-cov
```

Optional single-file focus:

```bash
./.venv/bin/python -m pytest tests/listings/test_a10_flow.py -q --no-cov
```

Frontend routing/registry/shell regressions (owner may run):

```bash
cd frontend
pnpm exec vitest run \
  apps/customer/features/catalog/service-href.test.ts \
  apps/customer/lib/routes.test.ts \
  apps/partner/features/workspace/registry.test.ts \
  apps/partner/features/session/partner-shell-nav.test.tsx
```

## Product law reminders

- Listing ≠ Booking; Application ≠ Booking; applicant never pays.
- Fail-closed without ACTIVE `A10VariantConfiguration` + approved `A10_LISTING`.
- FE uses `public_state` / `moderation_status` — never invent `SUBMITTED_FOR_MODERATION`.
- Never `git add -A`; leave `srikar-prompts/` untracked; do not merge `origin/m3-changes` or cherry-pick `3fa3016`.
