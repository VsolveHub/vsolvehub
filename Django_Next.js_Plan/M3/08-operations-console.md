# 08 — Operations console (admin panel): audit and build

Status: **built — owner verification pending.** Contract 1.70.0.

The owner asked for an end-to-end audit of the admin panel (`frontend/apps/admin`, product label
Operations): every action an admin has to take must exist, work, and be easy to find. No
customer- or partner-facing behaviour changes.

## 1. How the audit was done

Every `operations/*` and `ops/*` endpoint in `contracts/openapi/v1.yaml` was listed and matched
against the admin app's API calls. Anything published but unreachable from the console is a gap;
anything an admin needs that has no endpoint is a backend gap. Then each area was walked as an
operator would ("a rental delivery is stuck", "pay the partners") to check it can be found.

## 2. What was missing

| Area | Gap found | Now |
|---|---|---|
| Navigation | Five generic groups ("Work", "People"…), M1/M2 names mixed, five dashboard links | Grouped by area: Today, Home services, Workforce & projects, Marketplace, Partners, Customers, Money, Insights, System. One "Dashboards" link with tabs |
| Home | Case dashboard only; nothing about listings, disputes, applications | "Waiting on you" strip (applications, crew documents, custom work items, rental listings, deposit disputes, deliveries without an owner price, stay properties) + "Where to find things" directory |
| Rentals | No list of bookings at all — deliveries, payments, cancellations invisible. Ops cancel endpoint unused | Tabs: **Bookings** (customer + owner contact, pickup vs delivery, delivery status and price, amount, cancel-and-refund), Listings to review, Deposit disputes, Fees (shows delivery commission). New `GET /ops/rentals/bookings` |
| Stays | Reservations read-only; cancel unused; host subscription plans had no screen | Tabs: Reservations (search, filter, cancel with reason), Properties to review, Guest enquiries, **Host plans** (create, edit, turn off) |
| Payouts | No way to **create** a payout run (hook existed, unused); no identity check on the page although approve/pay require it; ledger corrections unused | Propose a run (warns about partners with no bank account), identity check on the page, **Balance corrections** tab |
| Customers | Wallet adjustment endpoint unused | Credit/debit the wallet from the customer lookup (idempotent, step-up) |
| Partners | GST/business details invisible; tax-profile verify unused | Partner record shows business type, legal name, GSTIN; "Mark GSTIN verified". `OperationsPartnerDetail.business_profile` |
| Cases | A disputed milestone or safety report opened a case, but the case screen could not decide it | "Step 1" panel on STAGE and SAFETY cases drives the stage decision / safety report; `OperationsCase.source_kind/source_id` |
| Home-service visits | Booking detail, recover and assisted start unused; no way to open a booking from a case | **Visit lookup** (`/operations/visits?id=`), linked from a case's booking. Confirm a committed replacement partner (`OperationsBooking.replacement_offer_id`), assisted start during an OTP outage (step-up) |
| Commission and tax | Activate endpoint unused, nothing to read the active policy | **Commission and tax** page: active policy in plain words, new version prefilled from the latest, confirm before activating. New `GET /operations/commercial-policies/` |
| A5 projects | Transfer and termination unused; Operations could not read a project | Project panel on A5 requests: milestones, move to another vendor (per-milestone prices, customer accepts), end the project. New `GET /operations/engagements/{id}/project/`, `RequestTimeline.engagement_id` |

Left as is, on purpose:

- **Catalog** (categories, services, variants) stays in Django admin — it is configuration, not
  daily operations, and Django admin already edits it safely.
- **Report preset edit/delete** — presets are created and run today; editing one is rare and
  deleting and re-creating covers it.
- No new money-moving powers were invented. Every action calls an existing domain command.

## 3. Things the owner should know

- `cancel_reservation_ops` (stays) does not refuse a checked-in or checked-out reservation and
  refunds in full. The console only offers Cancel before check-in. Decide whether the backend
  should refuse too.
- Ops rental cancel takes no reason (recorded as "Ops force-cancel"). The console says so in the
  confirmation. A reason field would need a contract change.
- Rental and stay booking lists are capped (rentals: newest 200; stays: whatever the existing
  endpoint returns). Search/filter is in the browser.

## 4. Contract changes (1.70.0, additive)

- `GET /ops/rentals/bookings` (`?status=`) → `OpsRentalBooking[]`
- `OperationsCase.source_kind`, `source_id`
- `OperationsPartnerDetail.business_profile`
- `OperationsBooking.replacement_offer_id`
- `GET /operations/commercial-policies/`
- `GET /operations/engagements/{engagement_id}/project/`
- `RequestTimeline.engagement_id`

## 5. Tests written (not run — owner verification pending)

Backend:

- `backend/tests/rental/test_ops_booking_list.py`
- `backend/tests/cases/test_case_source.py`
- `backend/tests/partners/test_partner_directory.py::test_the_detail_carries_the_business_profile_for_tax_verification`
- `backend/tests/fulfilment/test_recovery_services.py::test_ops_booking_names_the_committed_replacement_offer_only_while_recovery_is_needed`
- `backend/tests/requirements/test_estimate_financials.py::test_operations_reads_the_policy_history_newest_first`, `::test_only_operations_reads_the_policy_history`
- `backend/tests/requirements/test_operations_project_read.py`

Frontend (`frontend/apps/admin`):

- `features/moderation/model/bookings.test.ts`, `features/moderation/stay-plans.test.ts`
- `features/loyalty/queries.test.ts`
- `features/payouts/view/ledger-adjustment.test.ts`
- `features/partners/view/tax-profile.test.ts`
- `features/m2-cases/view/source-decision.test.ts`
- `features/visits/queries.test.ts`
- `features/commercial-policy/model.test.ts`
- `features/m2-requests/model/project-recovery.test.ts`
- `features/session/nav-groups.test.ts`
- `features/dashboard/attention.test.ts`

Commands:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/rental/test_ops_booking_list.py tests/cases/test_case_source.py tests/partners/test_partner_directory.py tests/fulfilment/test_recovery_services.py tests/requirements/test_estimate_financials.py tests/requirements/test_operations_project_read.py

cd ..\frontend
pnpm test -- apps/admin
```

Checks run by the agent: admin `pnpm typecheck`, `pnpm lint`, `pnpm build` pass;
`pnpm contract:check` up to date; `makemigrations --check` no changes; `manage.py check` clean;
`spectacular --validate` and full ruff/mypy totals identical to the commit before this work
(pre-existing findings only).

## 6. Manual smoke list

1. Sidebar: every link opens; only one entry is highlighted on `/operations/partners/import`.
2. Home: "Waiting on you" shows only non-zero tiles and each opens the right tab.
3. Rentals → Bookings: a delivery booking shows the address, delivery status and price; Cancel
   on a confirmed booking refunds and the row turns Cancelled; no Cancel after handover.
4. Stays → Reservations: Cancel asks for a reason; Host plans: create, edit price, turn off.
5. Payouts: verify identity, propose a run for a week, a colleague approves, pay. Balance
   corrections: add ₹100 to a partner; it appears in the next run.
6. Customers → Wallet and rewards: look up by phone, credit ₹50, then debit more than available
   is refused.
7. Partners → All partners: a vendor with a GSTIN shows "Mark GSTIN verified".
8. A disputed-milestone case shows "Step 1 · Decide the disputed milestone"; approve it, then
   resolve the case.
9. A case about a booking links to Visit lookup.
10. Commission and tax: the active version reads correctly; activate version N+1 with a new
    approval reference.
11. An A5 request with a booked vendor shows the Project panel; End the project asks to confirm.

## 7. Follow-up (contract 1.71.0): cancellation rules and pagination

Status: **built — owner verification pending.**

### Cancellations (owner decisions)

- Operations can no longer cancel a stay that is checked in, checked out or a no-show. Only
  held, awaiting-payment or confirmed reservations get the full-refund cancel. Already-cancelled
  stays come back unchanged.
- An Operations rental cancel requires a reason. Every rental cancel now stores `cancelled_at`
  and `cancellation_reason` (migration `rental 0018`). The admin dialog asks for the reason and
  the booking row shows it. Refunds from an Operations cancel use `ops_cancelled_rental`.

### Pagination

Lists that grow with use load one page at a time ("Load more"); see the contract CHANGELOG for
the endpoint table.

- **Shared pieces:** `common/pagination.py` (`NewestFirstPagination`, `paginated`,
  `page_serializer`, `filter_statuses`, `browse_window`); `@vsolve/query` `usePagedList`,
  `useBrowseList`, `fetchAllPages`; `@vsolve/ui` `LoadMore`.
- **Page sizes:** 20 for customers and partners, 50 for Operations, 24 for public browse
  (60 max).
- **Tabs filter on the server,** so a tab never hides rows that are on a page not yet loaded:
  My Rentals, My Job Applications, partner stay enquiries and visits, partner rental bookings,
  job applicants, Operations job listings, rental bookings and stay reservations (including
  search).
- **Home screens** (partner rentals, stays, jobs) ask only for *active* states and read all of
  their pages. Those sets are small; history lives on the paged screens.
- **"You applied"** on a job page asks for that job only (`?listing=`), so it can't miss an
  application that sits on a later page.
- **Speed:** `created_at` indexes on rental bookings, stay reservations, stay enquiries and job
  applications (`rental 0019`, `stay 0023`, `listings 0017`).
- **Fixed along the way:** wallet transactions were already paged at runtime while the contract
  said "array", and stays search returned every row when no limit was sent.
- **Left unpaged on purpose:** categories, taxonomies, settings and policy lists, addresses,
  sessions, a partner's own properties/assets/listings, saved jobs, "jobs for you" (capped at
  30), report presets.

### Tests written (not run)

Backend:

- `backend/tests/test_list_pagination.py` (new)
- `backend/tests/rental/test_cancel_booking.py::test_ops_cancel_requires_a_reason`,
  `::test_customer_cancel_stamps_the_time_without_a_reason`, updated `::test_ops_force_cancel_booking`
- `backend/tests/stay/test_stay_fixes.py::test_ops_cannot_cancel_and_refund_once_the_guest_has_arrived`
- Updated for the page envelope: `tests/rental/test_ops_booking_list.py`,
  `tests/rental/test_quantity_pin_dispute.py`, `tests/stay/test_enquiry_call_flow.py`,
  `tests/stay/test_rooms_visits_owner_contact.py`, `tests/listings/test_a10_flow.py`,
  `tests/wallet/test_wallet_core.py`

Frontend:

- `packages/query/src/paged-list.test.ts`
- `apps/partner/features/stays/view/stay-tab-statuses.test.ts`
- `apps/customer/features/listings/application-tabs.test.ts`
- `apps/customer/features/rentals/model.test.ts` (tab mapping case added)
- `apps/admin/features/listings/queries.test.ts`
- `apps/admin/features/moderation/moderation-queue.test.tsx` (updated)

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_list_pagination.py tests/rental tests/stay tests/listings tests/wallet tests/loyalty

cd ..\frontend
pnpm test
```

Checks run by the agent: admin, customer and partner typecheck, lint and production build pass;
shared packages typecheck; `pnpm contract:check` is up to date; `makemigrations --check` shows
no changes; `manage.py check` is clean. Full ruff (173) and mypy (147) totals are no higher than
before this work, and every remaining finding is pre-existing.

### Manual smoke list

1. Customer → Wallet, V Coins, Referrals: with more than 20 entries, "Show older…" loads the
   rest with no duplicates.
2. Customer → My Rentals: each tab shows only its bookings, including ones older than the first
   page.
3. Customer → Jobs: scroll the list and "Show more jobs"; changing a filter starts again.
4. A job you applied to says so even if you have more than 20 applications.
5. Partner → Stays → Visits: badges show counts; "Closed" shows past visits; "Load more" works.
6. Partner → Job → Applicants: switch tabs; shortlisting updates the card at once.
7. Admin → Rentals → Bookings: searching a phone number finds a booking that is not on page one.
8. Admin → Rentals → Bookings → Cancel: the dialog needs a reason, and the reason shows on the
   row afterwards.
9. Admin → Stays → Reservations: a checked-in reservation has no Cancel, and the API refuses it.

## 8. Follow-up: charts on the dashboards

Charts only where there is a trend or a breakdown to read. Queues, consoles, reports, finance,
payouts and settings stay as lists and forms.

| Screen | Chart | Data |
|---|---|---|
| Dashboards → Overview | Money collected (GMV and refunds, area) and Completed bookings (bars), side by side — two units, so two charts, never a dual axis | new `series` |
| Dashboards → Customers | New signups (bars) | new `series` |
| Dashboards → Categories | Revenue by category, ranked bars with the booking count beside each | existing |
| Dashboards → Bookings | How bookings ended up (donut: completed / in progress / disputed or in recovery / cancelled or aborted), plus bookings by status as ranked bars | existing |
| Dashboards → Partners | Partner applications by stage, bars in pipeline order | existing |
| Home → Unclaimed queue | Thin bar per team | existing |

Every breakdown keeps its table under "View as table". Wallet liability now prints in rupees
instead of raw paise.

**Backend** (`apps/ops_reports/dashboards.py`). The overview and customer kinds add `series`
(oldest first, zero-filled, bucketed in IST) and `series_granularity`: one point per day up to 62
days, per week (Monday) beyond, never more than 366 days; the last 30 days when no range is
picked. A bare `date_end` now includes that whole day — it used to stop at its midnight. A
malformed date is a 400, not a 500. The response stays an untyped object; the two query
parameters are declared on the view but the contract is **not regenerated** in this change,
because `main` currently drifts from `v1.yaml` after `4ad77c4` and regenerating would publish
that revert.

**Frontend.** Recharts 3.2.1 in the admin app only (`features/charts/`); `react-is` pinned to
19.2.0 so it matches React 19. Ranked bars are HTML so labels never collide. Colours are
`signal-600` and `navy-500` (validated for colour-blind separation and 3:1 contrast); outcomes use
the status colours and always carry a label.

**Tests written (not run — owner verification pending)**

- `backend/tests/ops_reports/test_dashboard_series.py`
- `frontend/apps/admin/features/charts/charts.test.tsx`
- `frontend/apps/admin/features/dashboard/dashboard.test.tsx` (chart cases added)

```
cd backend && .venv/Scripts/python.exe -m pytest tests/ops_reports -q
cd frontend && pnpm --filter admin exec vitest run features/charts features/dashboard
```
