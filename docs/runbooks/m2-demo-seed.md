# M2 demo seed — placeholder configuration for a platform that otherwise cannot be used

**What this is.** One management command, `seed_m2_demo`, that loads the configuration both M2
walkthroughs need in order to run at all: the A3 quote-unlock price, the three A5 visit-plan tiers,
a minimum-wage floor, every SLA clock and cap, an A3 and an A5 service to request, an area to
request them in, and approved vendors to match against.

**Every money value, clock and cap it writes is a placeholder standing in for an owner decision
that has not been made.** They are listed in full below, each against the decision it is standing in
for, and every effective-dated row it writes carries the words `DEV SEED — not an owner decision` in
its `source_reference`. Nothing here has been approved by anybody. Do not quote a number from this
page to a customer, a vendor, an investor or a spreadsheet.

> **Development only.** The command refuses to run unless `settings.DEBUG` is true *and* you pass
> `--i-understand-this-is-dev-only`. `config/settings/production.py` never sets `DEBUG`, and the
> precedent for this shape of door is `PAYMENTS_ALLOW_SIMULATED_CAPTURE`, which production refuses
> to boot with.

---

## Why it exists

`Django_Next.js_Plan/M2/07-state-machines-and-permissions.md` §9 requires every owner-blocked value
to be read from configuration and to **fail closed when unset** — no default baked into code. That
rule is implemented exactly, in one module (`apps/requirements/pricing.py`), and it has a
consequence nobody had lived with until three columns finished building against it:

| Unset value | What the owner sees today |
|---|---|
| `M2AccessPrice` for `A3_QUOTE_UNLOCK` | `m2_access_price_unavailable` on the A3 unlock |
| `M2AccessPrice` for `A5_VISIT_PLAN` | the visit-plan chooser offers **no tiers at all** |
| `M2VariantConfiguration.wage_floor_skill`, `ServiceArea.state_code`, `MinimumWageFloor` | `m2_wage_floor_unavailable` on **every** A3 quote |
| `visit_duration_minutes` | `m2_policy_unavailable` on the visit-slot grid |
| `amendment_response_hours` | proposing a scope amendment is refused **entirely** |
| `stage_review_window_hours` | no stage ever auto-approves |
| `stage_payout_hold_hours` | no stage payout releases on a clock |
| `non_responsive_rejection_cap` | the free-replacement mechanism is unavailable |
| `commission_basis_points` / `commission_treatment` | an A5 engagement cannot open |
| no `ServiceAreaOperatingWindow` rows | every business-hours deadline computes to `None` and silently vanishes |

The platform is correct and unusable. This command is how a demo gets values **as data, in the
database, behind a dev-only door** — never as a fallback in application code. If making a demo work
ever seems to require editing `pricing.py`, that is the change this command exists to avoid.

---

## Running it

```powershell
cd C:\dev\vsolve\backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only
```

Optional: `--vendors N` (default 3, which is both the A3 quote ceiling and the largest A5 visit
plan, so either walkthrough can fill every slot).

It is **idempotent**. Every write is an upsert on a natural key and every effective-dated row uses
one fixed `effective_from` (2026-01-01), so running it twice changes nothing. Run it again freely
after a `migrate`.

It calls `seed_partner_reference_data` first, because a Partner application cannot be completed
without published consent documents and skills. That command never clobbers a published consent.

### What it will not do

- **It will not run outside `DEBUG`.** `CommandError`, immediately.
- **It will not run without the acknowledgement flag**, even under `DEBUG`, because a shared
  development database can already hold prices somebody loaded on purpose.
- **It will not overwrite a real value.** Before writing an `M2AccessPrice` or a `MinimumWageFloor`
  it reads the existing row's `source_reference`; a row without the `DEV SEED` marker is somebody's
  decision and is left exactly as it is, with a warning naming it. The summary line reports how
  many rows were left alone.

---

## Every placeholder it writes

**All of these are inventions of `apps/requirements/management/commands/seed_m2_demo.py`.** The
"stands in for" column points at `Django_Next.js_Plan/M2/task.md` §P0 and the blocking list in
`Django_Next.js_Plan/M2/README.md` §"Decisions required before M2 acceptance".

### Money

| Value | Placeholder | Stands in for |
|---|---|---|
| A3 quote unlock | INR 149 (14 900 paise) | Decision 1. `README.md` **proposes** this figure. Its tax treatment is decision 5. |
| A5 visit plan, 1 visit | INR 49 | Decision 1, proposed |
| A5 visit plan, 2 visits | INR 99 | Decision 1, proposed |
| A5 visit plan, 3 visits | INR 199 | Decision 1, proposed |
| Vendor share of a consumed visit slot | 6 000 basis points (60%) | Decision 1. **Not proposed anywhere — invented here.** The remaining 40% is the Vsolve platform share. |
| Minimum wage floor, `TG` / `construction-helper` | INR 600 per day | Decision 7. Plausible, not a gazette citation. A real row's `source_reference` is where the citation belongs. |
| A5 commission | 1 000 basis points (10%), `INSIDE_QUOTED_PRICE` | Decision 4, both halves — the rate and whether it is shown inside the vendor's price. |

### Clocks and caps

| Value | Placeholder | Stands in for |
|---|---|---|
| First quote (A3) | 24 business hours | Decision 2 |
| Full quote set (A3) | 72 business hours | Decision 2 |
| First confirmed visit (A5) | 24 business hours | Decision 2 |
| Plan filled (A5) | 72 business hours | Decision 2 |
| Post-visit estimate window (A5) | 48 business hours | Decision 2 |
| Vendor reconfirmation | reuses the first-quote clock | Decision 2 |
| Visit duration | 60 minutes | No decision names it; there is simply no defensible default |
| Customer no-show refunds the platform share | `False` — the platform keeps it | Decision 3 (the vendor payout always pays) |
| Non-responsive rejection cap | 2 | Pre-phase decision list |
| Maximum quotes | 3 | Fixed at "up to three" by revision 2 |
| Stage review window | 48 business hours | Pre-phase decision list |
| Stage payout hold | 24 business hours | Pre-phase decision list |
| Amendment response window | 48 business hours | Pre-phase decision list |

### Catalog, area and vendors

Ordinary non-production fixtures, in the shape the existing `seed_*` commands already use.

| What | Value |
|---|---|
| Category | `workforce-and-projects` → `construction-labour` |
| A3 service | `/construction-helpers`, variant archetype `A3_TIME_BLOCK` |
| A5 service | `/interior-fit-out-project`, variant archetype `A5_CUSTOM_PROJECT` |
| Service area | `hyderabad-500032`, PIN 500032, **`state_code = TG`**, open 08:00–20:00 every day |
| Wage-floor skill | `construction-helper` — deliberately **not** the variant's dispatch trade slug |
| Vendors | `+917030000001` … , approved, both capabilities, six crew each, one supervisor |

---

## What it deliberately does not seed

- **A Customer.** Register through the app's own OTP flow. You will need an address whose postal
  code is **500032**, or nothing is serviceable.
- **A `PartnerLocation`.** A GPS fix goes stale in 30 minutes, so a seeded one would show a distance
  band on the first invitation and `null` an hour later — flaky demo behaviour that looks like a
  bug. `distance_band_km` on a vendor card is therefore `null` until a vendor's app reports a
  position, which is what the field honestly means.
- **Real prices.** Obviously. When the owner decides, load a `M2AccessPrice` row with a **later**
  `effective_from` and a real `source_reference`; it supersedes the seed on the same ordering
  `pricing._effective_price` already uses, and nothing needs deleting.

---

## Two questions this command answers that are easy to get wrong

**Why is the wage-floor skill its own row and not the variant's `required_skill_code`?** Because
`required_skill_code` is the *dispatch trade slug* — it decides who can be sent — and reusing it as
the statutory wage classification would tie a legal floor to a merchandising decision. Re-slugging a
service in the catalogue would silently move a minimum wage. `M2VariantConfiguration.wage_floor_skill`
exists for exactly this separation, and the seed honours it.

**Why does the seed write both `catalog.ServiceQuestion` rows and
`M2VariantConfiguration.question_schema`?** Because the Customer's screen 1 renders the first and
`services.submit_requirement` validates against the second, and their vocabularies differ
(`NUMBER`/`SINGLE_CHOICE` against `INTEGER`/`SELECT`). A seed that wrote one and not the other would
produce a four-screen flow whose last screen refuses what its first screen collected — invisible
until somebody pressed Send. Both are derived from one authored table in the command, and the
mapping between the two vocabularies is written down there.

---

## Smoke: proving both walkthroughs run

After seeding, these are the exact requests that prove the platform is usable. `API` and the cookie
jars are set up as in [`m2-engagement-spine-smoke.md`](m2-engagement-spine-smoke.md) §0.

### A3 — the quote-first door

1. `POST $API/requirements/` with the A3 variant and
   `answers: {"worker_count": 4, "duration_days": 3}`.
2. `PATCH $API/requirements/{id}/` with an address in PIN 500032, a `requested_start` at least a day
   out and a `service_by` a few weeks out.
3. `POST $API/requirements/{id}/submit/` → status `MATCHING`, and `quote_delivery_deadline_at` is
   **not null**. A null deadline means the area lost its operating windows.
4. As a vendor: `GET $API/partner/enquiries/` → the enquiry, with `service_name` set (not a slug).
   `POST .../accept/`.
5. `POST $API/proposals/` with `rate_paise_per_worker_day: 50000` → **`400
   m2_proposal_below_wage_floor`**. This is the proof the wage floor is live; INR 500 is under the
   seeded INR 600 floor.
6. `POST $API/proposals/` with `rate_paise_per_worker_day: 70000`, `worker_count: 4`,
   `minimum_days: 3`, `total_paise: 840000` → accepted. Requirement moves to `QUOTES_READY`.
7. As the Customer: `GET $API/requirements/{id}/quotes/teasers/` → a teaser with
   `is_verified: true` **read from the vendor's approved application**, a vendor type and a price
   band. No name, no exact total.
8. `GET $API/requirements/{id}/unlock/` → `price_paise: 14900`, `is_available: true`.
9. `POST $API/requirements/{id}/unlock/` → a `PaymentAttempt` with purpose `M2_QUOTE_UNLOCK`.
   Capture it with `POST $API/payment-attempts/{id}/simulate-capture/`.
10. `GET $API/requirements/{id}/quotes/` → the full quote, with the vendor named.
11. `POST $API/requirements/{id}/quotes/{proposal_id}/questions/` → the Customer's question, with
    `asked_by_role: "CUSTOMER"`. As the vendor, `POST $API/partner/questions/{qid}/answer/`.

### A5 — the visit-first door

1. `POST $API/requirements/` with the A5 variant and `answers: {"deliverable": "..."}`.
2. `PATCH` as above, then `GET $API/requirements/{id}/visit-plan/` → **three priced tiers**. An
   empty list means no price is loaded.
3. `POST $API/requirements/{id}/visit-plan/` with `plan_size: 2` → a `CHOSEN` plan, two shares of
   4 950 paise each. Nothing is charged.
4. `POST $API/requirements/{id}/submit/`.
5. As a vendor: `GET $API/partner/enquiries/{id}/visit-slots/` → a grid with available slots and a
   `timezone`. An empty grid or all-`NO_CAPACITY` means the vendor has no availability rules for
   this area.
6. `POST $API/partner/enquiries/{id}/visit-slots/` with a slot id → `opens_plan_checkout: true`, and
   the visit is `REQUESTED` (held, not scheduled — the Customer has not paid).
7. As the Customer: `GET $API/requirements/{id}/vendor-cards/` → **one card**, for the vendor who
   responded, with `display_name` now set because they hold a slot, `is_verified: true`, a vendor
   type and `distance_band_km: null`. A vendor still at `INVITED` does not appear.
8. `POST $API/requirements/{id}/visit-plan/checkout/`, then `simulate-capture`. The held slot
   hardens to `SCHEDULED`.
9. `POST $API/site-visits/{id}/schedule/` with a **different** slot time → the visit moves *and its
   grid reservation moves with it*. Confirm in the shell:
   `Reservation.objects.filter(site_visit_id=..., status__in=("TENTATIVE","CONFIRMED")).values("occupied_range")`
   — the range must be the new time, not the old one.
10. `POST .../arrival/`, then `POST $API/site-visits/{id}/complete/`.
11. `POST $API/proposals/` with `site_visit_id`, `stages` **and** `material_lines`. A total that does
    not equal `Σ stages + Σ materials` is refused with `m2_proposal_invalid_shape`.
12. Select and reconfirm. `GET $API/engagements/{id}/` → the stages, with the material line last and
    `kind: "MATERIAL_ADVANCE"`. Funding it produces a `PaymentAttempt` with purpose
    `M2_MATERIAL_ADVANCE`; funding a work stage produces `M2_STAGE_FUNDING`.
13. `POST $API/engagements/{id}/amendments/` → **works**, because `amendment_response_hours` is now
    set. Before the seed this was refused outright.

---

## Removing it

There is no `--unseed`. The rows are ordinary configuration and the honest way to retire a
placeholder price is the way Operations retires any price: load a newer effective-dated row. For a
local database, drop and re-`migrate`.

To find every invented row in a database:

```sql
SELECT 'access_price' AS table, kind, plan_size, amount_paise, source_reference
  FROM requirements_m2accessprice WHERE source_reference LIKE 'DEV SEED%'
UNION ALL
SELECT 'wage_floor', state_code, NULL, floor_paise_per_day, source_reference
  FROM partners_minimumwagefloor WHERE source_reference LIKE 'DEV SEED%';
```
