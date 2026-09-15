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
| Partner employer (Apex) | `9900000088` | `:3001` | `/listings` (role code `partner` + APPROVED application); A10-only chrome — see below |
| Operations | `8019013032` | `:3002` | `/operations/listings` |

Seed includes:

- ACTIVE `A10VariantConfiguration` rows + Career taxonomy (`career-jobs`)
- Employer partner with APPROVED `A10_LISTING` capability + Enterprise subscription
- PUBLISHED+APPROVED listings (including Featured/premium demos)
- Ops-queue listing: **Office Coordinator — Pending Ops Review**
- Sample applications (SUBMITTED + SHORTLISTED) for customer My Applications and partner leads

## Expected Partner dock chrome — `9900000088` (A10-only employer)

The employer holds exactly one workspace grant, `A10_LISTING`. `specialtyShellHome`
returns `"listings"`, so `primaryShellNavFor` hands the shell `LISTING_TAP_FIRST_NAV`.
**The dock must say Listings, not Work.** Check both, because they are two
components reading one array and only one is on screen at a time:

| Viewport | Surface | Second destination | Never shown |
|----------|---------|--------------------|-------------|
| Phone (`< lg`) | bottom dock (`BottomTabBar`) | **Listings** → `/listings` | `/work/all`, `/jobs` |
| Desktop (`≥ lg`) | header nav (`DesktopPrimaryNav`) | **Listings** → `/listings` | `/work/all`, `/jobs` |

Both docks keep the shared shape around that slot:

```text
Home (/home) · Listings (/listings) · Money (/money) · Alerts (#notifications) · Me (/me)
```

`getPartnerChromeMode`: `/listings` is **full** (dock visible); `/listings/{id}` is
**focused** (back header, no dock) so the applications inbox is not covered by a
tab bar.

Contrast cases the same seeding must keep honest — walk them if the account is
re-granted:

- **Empty grants** (a legacy M1/A1 Partner) → Work dock, `/work/all`, never Listings.
- **A10 mixed with A3/A5** (a Partner who also does workforce or projects) → the
  Work dock wins; Listings is not in the primary dock.
- **Two specialty grants together** (e.g. A10 + A7) → neither specialty dock is
  shown; the shell falls back to Work.

## Click path

1. **Customer** `:3000` — Careers / `career-jobs` → `/listings` (not `/book/`, cart, or `/requests/`). Open a live listing → apply → `/listings/my-applications` → withdraw if offered. Drafts must not appear in public browse. Seeded apps for `9900000077` should already show.
2. **Partner** `:3001` as `9900000088` — A10-only shell chrome: dock/desktop nav shows **Listings** (`/listings`), not Work (`/work/all`) or Jobs. `public_state` badges: LIVE / PENDING_REVIEW / etc. Create and submit a listing; it stays `PENDING_REVIEW`, not live. Open a published listing → applications inbox → shortlist / reveal contact as implemented. Mixed A3/A5 + A10 partners still keep the Work tab.
3. **Operations** `:3002` — `/operations/listings` → filter Pending → open **Office Coordinator — Pending Ops Review** → approve or reject **with a required reason** → listing public state updates. Remove/reinstate with reason if exercised.
4. Partner shortlist + reveal contact. A second reveal past the daily cap shows the server error (not a fake success).
5. Subscription / premium purchase paths: use **fake** Razorpay locally only. Publish beyond plan max is blocked server-side. Premium capture sets `is_premium`; replay must not double-activate.

## Owner test commands

Backend A10 slice (the repo default `fail_under=85` covers all of `apps/`, so pass
`--no-cov` for a focused run):

```bash
cd backend
./.venv/bin/python -m pytest tests/listings/ -q --no-cov
```

Single test — the cross-poster API scope case added for M3-A10-17:

```bash
./.venv/bin/python -m pytest tests/listings/test_a10_flow.py -q --no-cov \
  -k test_m3_a10_17_cross_poster_partner_api_is_not_found
```

Frontend routing/registry/shell regressions:

```bash
cd frontend
pnpm exec vitest run \
  apps/customer/features/catalog/service-href.test.ts \
  apps/customer/lib/routes.test.ts \
  apps/partner/features/workspace/registry.test.ts \
  apps/partner/features/session/partner-shell-nav.test.tsx
```

What that frontend pack asserts (node project for the `.ts` files, jsdom for the
`.tsx` one):

- **`serviceHref`** — A10 wins over the A7/A9 branches, a fixed price and a
  `bookable_variant_id`; the `career-jobs` category slug routes a service that
  publishes no listing archetype; an A10 archetype survives a non-Career
  category. A listing never resolves to `/catalog/…`, `/requests/…` or `/book/…`.
- **`catalogCategoryHref` / `listingsBrowseHref`** — Career, Rental and Stay
  taxonomy land on their own surfaces; the listing service hint is URL-encoded.
- **`primaryShellNavFor`** — A10-only → `LISTING_TAP_FIRST_NAV` (exact labels and
  hrefs); empty grants → `TAP_FIRST_NAV` (Work); A10 mixed with A3 or A5 → Work;
  two specialty grants → Work; plus `specialtyShellHome` / `isListingOnlyShell`.
- **`BottomTabBar` / `DesktopPrimaryNav` / `getPartnerChromeMode`** — the rendered
  A10 dock carries Listings + Money + Alerts + Me and never `/work/all` or
  `/jobs`; `/listings` is full chrome and `/listings/{id}` focused.

These tests are written for the owner to run. Report work as **built — owner
verification pending**, and never report a run as passing until the command above
has actually been executed.

## Product law reminders

- Listing ≠ Booking; Application ≠ Booking; applicant never pays.
- Fail-closed without ACTIVE `A10VariantConfiguration` + approved `A10_LISTING`.
- FE uses `public_state` / `moderation_status` — never invent `SUBMITTED_FOR_MODERATION`.
- Never `git add -A`; leave `srikar-prompts/` untracked; do not merge `origin/m3-changes` or cherry-pick `3fa3016`.
