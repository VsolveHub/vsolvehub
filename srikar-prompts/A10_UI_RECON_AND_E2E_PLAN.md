# A10 Career/Jobs — UI reconnaissance + end-to-end implementation plan

Temporary working notes. Do not commit this folder. Written after running the live stack
on `main` @ `4a08ad3` (2026-09-13).

> **Status update 2026-09-13 ~03:55 IST:** Wave D3 code is on branch `feature/m3-a10-listings`
> (uncommitted). Backend + FE + OpenAPI ported. **Not** E2E-accepted yet — migrate / seed /
> `pytest … --no-cov` / smoke still owed. Resume from
> [`A10_CONTINUE_HERE.md`](A10_CONTINUE_HERE.md) and
> [`A10_IMPLEMENTATION_PLAN.md`](A10_IMPLEMENTATION_PLAN.md). Gaps closed since this recon:
> `public_state`, premium → `activate_premium_feature`. Gaps still open: dedicated Leads/Billing
> tabs (modal/inbox compromise), listing outbox notification templates, local migrate.

Yes: looking at the live apps first is the right order. A10 must copy the *existing*
catalog / workspace / Operations patterns, not invent a fourth product.

---

## 1. What we actually ran

| Surface | URL | State on this machine |
|---|---|---|
| Django API | http://localhost:8000 | 200 `/api/v1/health/ready/` |
| Customer | http://localhost:3000 | Seeded M1 + M2 catalog visible |
| Partner | http://localhost:3001 | Signed in as `+919900000099` |
| Operations | http://localhost:3002 | Signed in as `+918019013032` |
| Postgres | `127.0.0.1:15432` | healthy |
| Redis | `127.0.0.1:56379` | healthy |

Setup notes (local only, not repo changes):

- System Python was 3.12. Installed **user-space 3.13.15 via `uv`** into `backend/.venv`.
- `reportlab` is in `requirements/base.in` but **missing from the hashed lock**. Installed
  `reportlab>=4,<6` into the venv so migrate could boot. Do **not** regenerate lock files
  to “fix” this as part of A10.
- Copied `backend/.env.example` → `backend/.env` (gitignored).
- Seeds ran in CONTRIBUTING order: `seed_console_demo_data` → `seed_task_catalog` →
  `seed_trade_partners` → `seed_m2_demo --i-understand-this-is-dev-only`.
- There is **no** Career/Jobs category, **no** `/listings` route, **no** A10 workspace.

How to start again (Linux): see `srikar-prompts/LOCAL_STACK.md`.

---

## 2. Live UI — what A10 must match

### Customer (`:3000`)

Observed on `/` and `/catalog`:

- Categories come from the API, not a hardcoded list. Home “Curated Services” showed:
  Technician, Electrician, Plumber, AC Services, Beautician, Home Services, Pet Services,
  Construction, Events.
- **No Career/Jobs, Rentals, or Stays tile.** That is correct for this `main`.
- `/catalog` is a subcategory tile grid (Carpenter, Fans, Hire by the day, Interior
  fit-outs, …). Construction labour / Interior fit-outs sit *inside* existing categories
  as M2 archetypes, not as a separate app chrome.
- A1 services have **Add +** (cart). A3/A5 skip the cart: `serviceHref` sends A3 to
  `/requests/book/{slug}` and A5 to `/requests/new/{slug}`.
- `/requests/book/construction-helpers` immediately asked for OTP. Authenticated work
  (apply, my-applications) will do the same: login, then return. No guest apply.

**A10 customer implication**

- Seed a catalog category (plan slug `career-jobs`) so a tile appears on `/` and `/catalog`
  the same way Construction appeared after `seed_m2_demo`.
- Extend `frontend/apps/customer/features/catalog/service-href.ts` with the `m3-changes`
  rule: `A10_LISTING` / `career-jobs` → `/listings?service={slug}`. Do **not** send
  applicants into cart, `/book/`, or `/requests/`.
- Browse/detail can be public. Apply and “My applications” require OTP, then return.
- No Pay button. No basket on the listing flow.

### Partner (`:3001`) as all-trades `+919900000099`

Observed after OTP login (`Development delivery is on. Code: …` on the form):

- Shell: **Home / Work / Money / Alerts / Me**. Route `/home`.
- Home is A1 availability: go online, choose Hyderabad 500032, “You will not be offered
  any jobs until you go online.”
- Work (`/work/all`) is **task-visit work**: All / Offers / Enquiries / In progress /
  Waiting / Done. Honest empty: “Nothing here yet.”
- No Listings, Leads, or Billing tab. Unknown workspace keys already render nothing.

**A10 partner implication**

- A1 **Work** = visit jobs. A10 must never reuse `/jobs` or `/work/*` or fall back to
  that tab. Product nav for an employer is **Home / Listings / Leads / Billing / You**.
- Add `A10_LISTING` to `frontend/apps/partner/features/workspace/registry.ts` the same
  way `A3_TIME_BLOCK` and `A5_CUSTOM_PROJECT` are registered. Grant-driven. No grant →
  no tabs.
- `+919900000099` is the A1 all-trades tester. After `seed_listing_catalog`, the A10
  employer is `+919900000088`. Do not expect Listings on the A1 partner.

### Operations (`:3002`) as `+918019013032`

Observed:

- This is a **command-and-control workstation**, not an analytics product. Home shows
  assigned cases, unclaimed queue (Dispatch / Quality / Safety / …), kill-switch state.
- Sidebar today: Home, Partners, Crew documents, Service feedback, Partner reviews,
  Requests, Rate cards, Cases, Payouts, Refunds, Dispatch, Manual offers, Assisted
  checkout, Compatibility rules, Availability, Kill switches, Profile.
- **No Listings item.** A10 adds `/operations/listings` here (moderate / remove /
  reinstate), next to Cases — not a new dashboard product.
- Fail-closed: a non-staff session saw “You do not have access” and Sign out. Copy that
  for listing moderate commands.

---

## 3. Patterns we must copy (from this tree, not from scratch)

| Pattern | Where it lives | A10 use |
|---|---|---|
| Catalog tile → archetype route | `service-href.ts` | `A10_LISTING` → `/listings` |
| Partner workspace registry | `features/workspace/registry.ts` | New `A10_LISTING` block; unknown keys render nothing |
| Honest empty / no mocks | CONTRIBUTING + every EmptyState | “No live listings”, “You have not applied yet” |
| Server owns status | Django commands + generated client | FE never invents `SUBMITTED_FOR_MODERATION` unless serializer emits it |
| OTP on authenticated work | Customer login modal, partner/ops OTP | Apply / manage / moderate |
| Ops sidebar + cases | `sidebar-nav.tsx` / `operations-shell.tsx` | One Listings queue, abuse cases `LISTING_ABUSE` / `APPLICATION_ABUSE` |
| Checkout-free money | `CHECKOUT_FREE_PURPOSES` | Poster subscription / premium only |
| Contract-first | `contracts/proposals/` → spectacular → `pnpm generate` | Proposal **0017** (0016 is taken) |
| Tests in `backend/tests/` | not in-app `tests.py` | Keep `tests/listings/test_a10_flow.py` |
| Explicit git paths | AGENTS.md | Never `git add -A`; leave `srikar-prompts/` untracked |

Hard product law (unchanged): **Listing ≠ Booking. Application ≠ Booking. Applicant never pays.**

---

## 4. End-to-end A10 flow we will implement

```text
Customer catalog tile (career-jobs)
  → /listings (published only)
  → /listings/[id] apply (OTP if needed)
  → /listings/my-applications (withdraw)

Employer (+919900000088, capability A10_LISTING)
  → /listings create/submit
  → plan cap blocks extra publish
  → Billing: Starter/Growth/Enterprise via fake Razorpay
  → Leads: shortlist / reject / reveal (rate-limited)

Operations
  → /operations/listings approve (reason) → listing goes live
  → remove / reinstate with reason (poster cannot self-reinstate)
```

Port source: `origin/m3-changes` `3fa3016` **A10-only paths**. Do not cherry-pick or merge.
Renumber migrations after `main` tips. ADR-0012. Proposal 0017.

Known gaps after port (do not ship `m3-changes` as-is):

1. Partner badges invent `SUBMITTED_FOR_MODERATION` / `MODERATION_APPROVED`. Backend has
   `status` + `moderation_status`. Expose one public state for the FE.
2. `A10_PREMIUM_LISTING` capture currently calls `complete_subscription_payment`. Implement
   premium activation or drop the purpose until it works.
3. Partner nav on `m3-changes` is only Home / Job Listings / Me. Add Leads + Billing.
4. Confirm outbox notifications; add templates if events only enqueue.

Out of scope: wallet, A7/A9, MSG91, mobile, vehicle, analytics dashboards.

---

## 5. Implementation sequence (still locked)

1. `git checkout -b feature/m3-a10-listings` from this `main` (do not pull unless asked).
2. Design docs + ADR-0012 + proposal **0017**.
3. Port `apps/listings` + tests + `seed_listing_catalog`.
4. Merge A10 slices into current `main` catalog/commerce/partners/cases/settings/urls.
   Rewrite migrations: catalog `0020`, commerce `0012`, partners `0017` (rewrite, not copy),
   cases `0003`. Keep listings `0001`+`0002`.
5. Close status / premium / notification gaps.
6. `spectacular --validate` then `pnpm generate`. Never hand-edit `v1.yaml` / `schema.d.ts`.
7. Port customer/partner/ops UI; wire `service-href` + registry + ops sidebar.
8. Static quality only. Owner runs pytest.

Owner verify later:

```bash
cd backend
./.venv/bin/python -m pytest tests/listings/test_a10_flow.py -q
# then seed_listing_catalog and click the path in §4
```

---

## 6. Live-stack observations that are *not* A10 work

- Next.js hydration warning on `/catalog` (`catalogue-header.tsx`) — pre-existing.
- Browser-tool screenshots mangle webfonts; the accessibility tree is the source of truth.
- `reportlab` lock drift — mention to the existing developer; do not churn the lock in A10.

---

## 7. Recommendation

Start implementation from this recon, not from a second greenfield design. The live apps
already show where the Career tile, employer workspace, and ops queue must land.
