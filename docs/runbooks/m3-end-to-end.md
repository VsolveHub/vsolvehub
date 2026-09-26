# M3 end to end — start and test

See [m3-browser-evidence.md](m3-browser-evidence.md) for the STE browser UI test results and screenshots.

Checked in the browser on 24 September 2026 against `feature/m3-a10-listings`. This is the start guide. Longer notes stay in [m3-a10-listing-smoke.md](m3-a10-listing-smoke.md), [m3-part-a-smoke.md](m3-part-a-smoke.md), and [m3-wallet-coins-referral-smoke.md](m3-wallet-coins-referral-smoke.md).

Use `http://localhost` (not `127.0.0.1`). The session cookie is shared across ports, so sign out before opening the next app.

## Start

Postgres and Redis were already up from `infra/compose.yaml` (`vsolve-platform-postgres-1`, `vsolve-platform-redis-1`). The API was already listening on port 8000. A request to `http://localhost:8000/api/v1/` returns 404; that is the API root, not a failed server.

```bash
docker compose --env-file infra/.env.example -f infra/compose.yaml up -d postgres redis

cd backend
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py seed_listing_catalog
./.venv/bin/python manage.py seed_rental_demo
./.venv/bin/python manage.py seed_stay_demo
./.venv/bin/python manage.py runserver 0.0.0.0:8000
```

Run one Next app at a time, from `frontend`, with webpack:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 pnpm --filter customer exec next dev --webpack --port 3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 pnpm --filter partner exec next dev --webpack --port 3001
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 pnpm --filter admin exec next dev --webpack --port 3002
```

Stop the previous Next process before starting the next one.

Dev OTP is printed on the login screen as “Development delivery is on.” Ask for a code once. A second request for the same number in the same minute is refused with “Too many code requests.”

## Demo phones

| Seed | Phone | App | Path |
| --- | --- | --- | --- |
| `seed_listing_catalog` | `9900000077` | Customer `:3000` | `/listings`, `/listings/my-applications`, `/account/wallet`, `/account/coins`, `/account/referral` |
| `seed_listing_catalog` | `9900000088` | Partner `:3001` | `/listings` |
| `seed_rental_demo` | `9900000055` | Customer `:3000` | `/rentals`, `/rentals/mine` |
| `seed_rental_demo` | `9900000066` | Partner `:3001` | `/rentals` |
| `seed_stay_demo` | `9900000033` | Customer `:3000` | `/stays` |
| `seed_stay_demo` | `9900000044` | Partner `:3001` | `/stays` |
| all three | `8019013032` | Operations `:3002` | `/operations/listings`, `/operations/rentals`, `/operations/stays`, `/operations/loyalty` |

Partner navigation is the grant shell. The career partner sees Listings. The rental partner sees Rentals. The stay partner sees Stays. There is no customer header on the partner app.

## What the browser did

### Customer careers, wallet, coins, referral — `9900000077`

Worked:

- `/listings` showed 6 jobs in Hyderabad, including Lead QA Engineer — Featured and Experienced Full Stack Developer.
- `/listings/my-applications` showed a submitted application for Senior React Developer Hyderabad and a shortlisted Lead QA Engineer — Featured, with Withdraw on the shortlisted row.
- `/account/wallet` showed ₹0, top-up bounds Min ₹100 and Max ₹10,000, and an empty history before the top-up attempt.
- `/account/coins` showed 0 spendable, 0 locked, and 0 expiring, with the 30% checkout note.
- `/account/referral` showed a personal code, Give ₹50 / Get up to ₹200, and tiers of ₹100 at 1 friend and ₹200 at 5 friends. Friends joined was 0.

Blocked:

- Public browse included **Smoke Draft Electrician**. A draft should not be in the public list.
- The customer header throws a React hydration error in `frontend/apps/customer/features/session/view/site-header.tsx` (line 72). The Next.js dev overlay covers the page until it is closed.
- Top up of ₹500 opened “Simulate Instant Payment (Dev)”. After that click the history row stayed `RESERVED` for +₹500 and the available balance stayed ₹0. Capture did not credit the wallet.
- `/rentals/mine` for this phone showed All Rentals (0). The rental customer is `9900000055`.

### Customer rentals — `9900000055`

The catalog was visible while another customer was signed in: Stanley Pro Carpentry Tool Kit at ₹299/day with a ₹1,200 deposit, and Bosch Drill — Demo at ₹499/day with a ₹2,000 deposit.

Signing in as `9900000055` was blocked. The first code appeared, a second send was refused with “Too many code requests,” and My Rentals plus a new booking for that phone were not completed. Deposit capture was not exercised. There is no live Razorpay step in this pass.

### Customer stays

Logged out, `/stays` showed Cyber Towers Executive Single Room at ₹1,600/night and Lakeview Double Sharing — Demo at ₹850/night. The Lakeview detail page opened with check-in `2026-10-01`, check-out `2026-10-04`, a night quote, and Send Stay Enquiry. Sending while signed out returned to the same button and did not show a success state.

`9900000033` was not signed in during this pass, so a guest enquiry was not submitted.

### Partner listings — `9900000088`

`/listings` loaded the hiring workspace: Enterprise Plan, Post New Opening, 6 active listings, 1 pending review, 3 applicant leads. The shell links were Home, Listings, Money, Alerts, Me.

### Partner rentals — `9900000066`

`/rentals` loaded an empty create form, a variant from the partner’s approved capability (Drill Machine), assets with server states `PUBLISHED` and `PENDING_REVIEW`, and a `CONFIRMED` Bosch booking with Handover.

Create asset failed. The page said “Could not create asset.” The API log for `POST /api/v1/partner/rentals/assets` was 403. Submit for review was not reached for a new asset. The seeded Angle Grinder row was already `PENDING_REVIEW`.

### Partner stays — `9900000044`

`/stays` loaded an empty add-property form, a stay variant from capabilities, and properties with `PUBLISHED` and `PENDING_REVIEW`. The Lakeview enquiry was `SUBMITTED` with an empty response box. Respond stayed disabled until text was typed. After “Yes, those dates are open.” the row became `RESPONDED` and showed that text.

Reseed `seed_stay_demo` if you need that enquiry back in `SUBMITTED`.

### Operations — `8019013032`

One sidebar. A leftover customer or partner cookie shows “You do not have access” until you sign out and sign in with this phone.

Worked:

- `/operations/listings` — Job & Career Listings, 7 postings, pending queue includes Office Coordinator — Pending Ops Review.
- `/operations/rentals` — one sidebar, “1 pending”, Angle Grinder — Pending Ops · `PENDING_REVIEW`, partner name Hyderabad Tool Rentals. Approve and Reject were disabled while Reason was empty, and both enabled after a reason was typed. They were not submitted.
- `/operations/stays` — “1 pending”, Pending Ops Hostel Bed · `PENDING_REVIEW`, host Lakeview PG, with the same reason field and Approve / Reject.
- `/operations/loyalty` — liability read succeeded: “0 paise across 2 wallets”. Burn and top-up inputs were filled from the active policy (`30`, `10`, `10000`, `1000000`), matching the policy lines on the page. Referral version `v1` was active.

## Known gaps from this pass

- Draft job “Smoke Draft Electrician” is in the public careers list.
- Customer header hydration error on `:3000`.
- Wallet simulate-payment leaves the top-up `RESERVED` and does not increase the balance.
- Partner create-asset returns 403, so the rental submit path was not completed in the UI.
- Customer rental login for `9900000055` and customer stay enquiry for `9900000033` were not completed. Wait before requesting another code for a number that was just used.
- Rental deposit capture is still the demo hold, not live Razorpay.

## Cursor-browser sequential E2E — 25 September 2026

Live UI only (`http://localhost`), one Next app at a time: Customer `:3000` → kill → Partner `:3001` → kill → Operations `:3002`. Evidence: `/tmp/m3-e2e-evidence/results.tsv`. Branch not merged.

| Result | Count |
| --- | --- |
| PASS | 34 |
| N/A | 1 (`C5.1` — no payable booking group after seeds) |
| FAIL | 0 |
| BLOCKED | 0 (live Razorpay / MSG91 left out of scope; local simulate + on-screen OTP used) |

### Phase 1 — Customer (`9900000077` → `0055` → `0033`)

All `C0`–`C4` PASS. Wallet top-up ₹500 Captured with local simulate toast. Rental book for Stanley completed after backend `mark_deposit_held` FOR UPDATE / outer-join fix; deposit HELD. Stay enquiry Oct 20–23 SUBMITTED. `C5.1` N/A.

### Phase 2 — Partner (`0088` → `0066` → `0044`)

Listings: create DRAFT “M3 E2E Frontend Engineer”, leads Shortlist on Senior React applicant. Rentals: create DRAFT + submit PENDING; Stanley Handover → Return → Release deposit RELEASED. Stays: respond to Cyber Towers SUBMITTED enquiry → RESPONDED.

### Phase 3 — Operations (`8019013032`)

Sidebar access granted. Moderated Office Coordinator (listings), M3 E2E Angle Grinder (rentals), Pending Ops Hostel Bed (stays) with typed reasons. Loyalty: liability loaded; published burn 25%, top-up max 999000 paise, referral `m3-e2e-2026-09-25`. Excel download `GET /api/v1/ops/wallet/liability.xlsx` → 200, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, ZIP magic `PK`, 1826 bytes.

### Gaps closed vs prior pass notes above

Public draft listing, wallet simulate capture, partner create-asset 403, and customer rental/stay phones were exercised successfully in this pass. Live Razorpay Checkout and MSG91 SMS remain out of scope.
