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
