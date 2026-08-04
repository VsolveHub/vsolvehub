# FE-13 — Partner signed-in shell, login route and home

> Renumbered from FE-11 on 2026-08-04. On [`task.md`](./task.md), **FE-11** means
> *Customer active booking + Partner fulfilment UI* (blocked on BE-09). The Partner
> signed-in shell described here is **FE-13**. Content below is unchanged and correct.

Build the navigation layer the Partner app never got. Every screen it connects
already exists and works; nothing here is blocked by a backend contract.

---

## 1. Read this first: what is ALREADY BUILT — do not rebuild any of it

Verified against a running server on `http://localhost:3001` on 2026-08-04.

| Route | Status | What it is |
| --- | --- | --- |
| `/` | 200 | Marketing site, `app/(marketing)/` route group. No session awareness. |
| `/apply` + 7 steps | 200 | Full onboarding: profile, skills/services/areas, consent, signed document upload, weekly schedule, review/submit. |
| `/offers` | 200 | **The complete offer inbox.** Bounded 5s polling, cursor pagination, Accept, Decline, 120-second no-fault Undo, Commit now, stable-key idempotent replay, typed refusal handling, server-clock countdowns, unit-scope privacy boundary. |
| `/availability` | 200 | Weekly schedule editor + online/heartbeat/offline presence with location-denied states. |

**The Partner offer accept flow is DONE (FE-09, contract 1.13.0).** It is
unreachable, not unbuilt. Open `http://localhost:3001/offers` and it renders.
Do not write a new inbox, offer card, accept mutation, undo timer or polling
policy. If you think you need one, you have misread the task.

Also already built and reusable:

- `@vsolve/query`: `useAuthGuard`, `useOtpFlow`, `useLogout`, `useSwitchRole`,
  `useCurrentSession`, `hasRole`, `evaluateAuthGuard`, `queryKeys.partner.*`
- `@vsolve/ui`: `OtpForm`, `Card`, `ErrorState`, `Spinner`, `Logo`, `Button`, `Badge`
- `apps/partner/features/application/queries.ts`: `usePartnerApplication()`
- `apps/partner/features/application/view/status-banner.tsx`:
  `ApplicationStatusBanner` — full copy table for all seven statuses
- `apps/partner/features/application/model/readiness.ts`: `canSubmit`,
  `isEditable`, `outstandingRequirements`
- **`apps/admin/features/session/operations-shell.tsx` — copy this pattern.**
  It is the reference implementation of exactly what the Partner app needs:
  one `useAuthGuard`, a login branch, a `checking` branch, an `error` branch, a
  `forbidden` branch that distinguishes "holds the grant but acting as another
  role" (offer a one-click switch) from "does not hold the grant", and a header
  with phone number + sign out.

---

## 2. The three defects to fix

### 2.1 There is no way into the app by clicking

`grep -rn 'href="/login"'` in `apps/partner` returns **7 links**; the route does
not exist, so every one is a 404:

- `app/(marketing)/layout.tsx:55` and `:60` — header "Login" and "Become a Partner"
- `components/marketing-mobile-nav.tsx:61` and `:67`
- `app/(marketing)/solutions/page.tsx:92`
- `app/(marketing)/become/[role]/page.tsx:104` and `:165`
- `app/(marketing)/blog/[slug]/page.tsx:147`

`app/error.tsx:38` links to `/dashboard`, which also 404s.

Every `href="/apply"` in the app is *inside* the authenticated tree already
(`apply-shell.tsx:91`, `application-editor.tsx:247`, `documents-step.tsx:185`,
`apply/schedule/page.tsx:23`, `offers-gate.tsx:91`, `presence-gate.tsx:110`).
**There is no path from the marketing site into the product.**

### 2.2 `/apply` asks for a phone number instead of sending you to login

`features/application/view/apply-shell.tsx` renders an inline `ApplyLogin` when
`guard.status === "unauthenticated"`. Login must move to its own `/login` route,
and unauthenticated visits to any protected route must redirect there.

### 2.3 An approved Partner reaches a dead end

`features/application/view/application-overview.tsx:84` gates its only outgoing
link on `isEditable(application)`, which is false for `APPROVED`. The page
collapses to: heading, status banner, readiness checklist, transition history —
**zero outgoing links**. The banner even says "Publish the hours you want to
work" while linking to nothing.

`grep -rn 'href="/offers"'` and `href="/availability"` across the whole app
return **zero results**.

---

## 3. Non-obvious backend facts you must design around

Verified in `backend/apps/`. Getting any of these wrong produces a screen whose
every request 403s.

1. **`/apply` is `IsAuthenticated` only — no role required.** Deliberate: an
   applicant is not a Partner yet. See the docstring in `apply-shell.tsx:20-23`.
   Do not put a role requirement on the onboarding tree.

2. **`/offers`, `/availability` and presence are `IsPartnerUser`**, which is
   `has_active_session_role(role_code="partner")`
   (`backend/apps/partners/permissions.py:61-71`). It checks the **active**
   session role, not the grant.

3. **The `partner` role is granted when the application is CREATED, not when it
   is approved** (`backend/apps/partners/services.py:250` calls
   `_ensure_partner_role`). So holding the grant proves nothing about approval.
   **Approval is `application.status === "APPROVED"` and only that.**

4. **On login the active role is the alphabetically first grant**
   (`backend/apps/identity/services.py:199-205`, `order_by("role__code")`).
   A user holding both `customer` and `partner` logs in as **`customer`**, and
   every offers request 403s. You must handle this with
   `useSwitchRole("partner")` exactly as `OperationsShell` does — this is not
   hypothetical, it is the default for any Partner who is also a Customer.

5. **No jobs, work-session, ledger or payout endpoints exist.** The entire
   published Partner surface is: `application`, `application/documents`,
   `application/documents/uploads`, `application/submit`, `availability`, `me`,
   `offers`, `offers/{offer_id}/{action}`, `presence/online`,
   `presence/heartbeat`, `presence/offline`, `required-consents`, `skills`.
   `GET /api/v1/partner/me/` returns a `PartnerApplication`, same shape as
   `/application/`. Do not invent an endpoint or a fallback for anything else.

---

## 4. What to build

### 4.1 `app/login/page.tsx` — one login route

`force-dynamic`, `robots: noindex`. Reuse `useOtpFlow` + `OtpForm`. This becomes
the single OTP surface for the whole Partner app.

Support a `?next=` return path so a deep link survives login. **Accept only
same-origin relative paths beginning with a single `/` and not `//`** — reject
anything else and fall back to the status-based target in 4.3. An open redirect
on a login route is a real vulnerability, not a nicety.

If a session already exists, `/login` must redirect straight to the 4.3 target
rather than showing the form again.

### 4.2 `features/session/partner-shell.tsx` — one shell, three duplicates deleted

Model it on `apps/admin/features/session/operations-shell.tsx`.

It owns: `checking` / `unauthenticated` (→ redirect to `/login?next=…`) /
`error` / `forbidden` (→ switch-to-partner vs no-access) / `authenticated`,
plus a persistent header (logo, phone number, sign out) and a nav that links
**Home · Offers · Availability · Application**.

**This is the anti-duplication core of the task.** There are currently three
near-identical OTP login screens and three near-identical checking/error
branches:

- `features/application/view/apply-shell.tsx` → `ApplyLogin` (lines 26-54) and
  the guard branches (60-86)
- `features/offers/view/offers-gate.tsx` → lines 26-63
- `features/presence/view/presence-gate.tsx` → lines 33-67

All three must lose their session handling to the shell. `apply-shell.tsx`
keeps only the `ApplySteps` strip. Net line count should go **down**.

There are also two identical "You are not approved to take work yet" cards
(`offers-gate.tsx:83-97`, `presence-gate.tsx:101-115`). Extract one
`ApprovalRequired` component and use it in both. Keep the distinct second
sentence each one has — the wording differs on purpose and both are correct.

Note the shell must **not** require the `partner` role on `/apply/*` (fact 3.1).
Give it a prop or split the layout so the onboarding tree is session-only.

### 4.3 `app/dashboard/page.tsx` — the signed-in home

Branches on `usePartnerApplication()`:

| Application state | What the home shows |
| --- | --- |
| 404 / absent | "Start your application" + Begin → `/apply/about` |
| `DRAFT`, `CHANGES_REQUIRED` | `ApplicationStatusBanner` + `ReadinessChecklist` + continue → `/apply/review` |
| `SUBMITTED`, `UNDER_REVIEW` | `ApplicationStatusBanner`. State plainly that offers start after approval and nothing is waiting on them. |
| `APPROVED` | **The live `<OfferInbox />`**, the presence online/offline control, and a link to `/availability`. This is the screen the whole task exists for. |
| `SUSPENDED`, `OFFBOARDED` | `ApplicationStatusBanner` only. No offers, no presence control. |

Reuse `ApplicationStatusBanner` — do not write a second status copy table.
Embedding `<OfferInbox />` here is correct; it is a self-contained client
component. `/offers` stays as its own route.

**Post-login redirect target:** `/apply` when the application is absent, `DRAFT`
or `CHANGES_REQUIRED` (there is work for them there); `/dashboard` otherwise.
`?next=` wins over both when present and valid.

### 4.4 Wire up the dead ends

- The 7 `/login` links and the `error.tsx` `/dashboard` link start working once
  the routes exist — verify each, do not leave one behind.
- `application-overview.tsx`: when the status is `APPROVED`, render links to
  `/dashboard` and `/availability`. The current `isEditable` gate hides the only
  outgoing link precisely when the Partner most needs one.
- Optional, flag it rather than guessing: the marketing header could swap
  "Login" for "Go to your dashboard" when a session exists. That needs a client
  component in a currently-static tree — get sign-off before doing it.

---

## 5. Tests you must update, not delete

`e2e/django.e2e.ts` — the real-Django project, which **does** run here (Django is
up on :8000 with `CORS_EXPOSE_HEADERS=Date`):

- line ~107: `page.goto("/apply")` then expects `getByLabel(/mobile number/i)`.
  Must become `/login`.
- line ~138: after verify, expects `getByRole("link", { name: /your application/i })`.
  Update to whatever the post-login target actually renders.

`e2e/apply.e2e.ts` stubs an authenticated session, so its 12 tests should be
unaffected — confirm rather than assume.

`e2e/partner.e2e.ts` only touches `/` and a 404 page — unaffected.

`e2e/offers.e2e.ts` and `e2e/support/responsive.ts` stub the session via
`installDispatchApi` — unaffected, but if `/offers` gains the shell header, the
responsive checks ("one main landmark and one level-one heading") will catch a
duplicate `<h1>` or `<main>`. Fix by nesting correctly, not by loosening the test.

**Add new coverage for:**

- `/login` redirects an already-authenticated visitor to the status-based target
- `?next=/offers` returns there after login; `?next=https://evil.example` and
  `?next=//evil.example` are both rejected
- each application status lands on the right home branch
- an approved Partner can reach the offer inbox **by clicking only**, starting
  from `/` — this is the acceptance test for the whole task
- a Partner whose active role is `customer` is offered the switch, not a dead 403

---

## 6. Constraints

- Generated client only (`@vsolve/api-client`, contract **1.13.0**). No new
  endpoint, no handwritten DTO, no client-side authorization the server does not
  also enforce.
- No mock or placeholder data anywhere. Real data or an honest empty state.
  Keep genuine error handling.
- Mobile-first. Every protected route stays `force-dynamic` + `noindex`.
- Accessibility: exactly one `<h1>` and one `<main>` per route; nav uses
  `aria-current="page"`; focus must move on route change.
- Match the surrounding comment style — these files explain *why*, not *what*.
  Read `operations-shell.tsx` and `offers/queries.ts` before writing.

---

## 7. Verification gate — run all of it and report real output

```bash
cd frontend && pnpm verify
```

```bash
cd frontend && pnpm exec playwright test --reporter=line
```

`pnpm verify` = `contract:check && lint && typecheck && test && build`. Baseline
before you start: **709 unit tests / 46 files green, 173 e2e green with zero
skips, `git diff --check` clean.** Do not report done on anything less.

Two environment notes that cost the last session hours:

- Keep an eye on free disk space on `C:`. It hit zero during the last run and
  `pnpm verify` then aborts at a *different* step each time with
  `Zone Allocation failed - process out of memory`, and Playwright dies with
  `ENOSPC`. Neither is a code defect. `frontend/.turbo` regrows to ~10 GB.
- A test Partner is seeded and approved: **`+919900000099`** — all 6 active
  service variants including Switch / Socket Repair, area `hyderabad-500032`,
  available all 7 days. Dev OTP is on, so the code appears in the form. Re-seed
  with `cd backend && .venv/Scripts/python.exe manage.py seed_test_partner`.

---

## 8. Out of scope — do not start these

- Partner job execution: En route, Arrived, Customer unavailable, start OTP,
  tasks, evidence, scope amendment, abort, line-level completion.
- Earnings ledger, payout account and status.
- Release-with-reason.

All of the above are blocked on BE-09/BE-10; no endpoint exists. See F5 in
`Django_Next.js_Plan/M1/03-frontend-tasks.md`.

Also out of scope: FE-10 Customer payment integration, which is the next
*product* task and is independent of this one.
