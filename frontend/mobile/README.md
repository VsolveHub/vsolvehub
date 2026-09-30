# Vsolve Hub mobile apps — start here

This folder is where the **V Solve Hub** (Customer) and **V Solve Hub Partner** mobile apps are
built. This README is the only document you need to open first. Everything else is linked from it.

You do not need to know React Native, Expo or Django. Your AI assistant (Cursor or Antigravity)
writes the code. You copy one prompt at a time, paste it into the assistant, wait, check that it
worked, and then move to the next prompt. You never design a screen, choose a library or decide how
something should work: every decision has already been made and is written in these files.

---

## 1. What you are building

| | Customer app | Partner app |
|---|---|---|
| Store name | V Solve Hub | V Solve Hub Partner |
| Who uses it | People booking home services | Professionals doing the work |
| Android package / iOS bundle id | `com.vsolvehub.customer` | `com.vsolvehub.partner` |
| Built from web app | `frontend/apps/customer` | `frontend/apps/partner` |
| Screen list | [guide/07-screens-customer.md](guide/07-screens-customer.md) | [guide/06-screens-partner.md](guide/06-screens-partner.md) |

**Rule number one:** each mobile screen is a copy of a web screen that already exists: same layout,
colours, text and steps, and the same API calls. The web app is the specification. If the web
does it, the app does it the same way. If the web does not do it, the app does not do it, unless
this guide says so. The only additions are the mobile-only items in section 4.

---

## 2. The order of work

Do the phases **in order**. Do not start a phase until the previous one is done, meaning every
box in its "Done when" list is ticked.

| # | Phase | Prompt file | Check in |
|---|---|---|---|
| 0 | Mobile setup (EAS, emulator, phone ↔ backend) | [guide/01-machine-setup.md](guide/01-machine-setup.md) | — |
| 1 | Create the mobile workspace | [prompts/01-workspace.md](prompts/01-workspace.md) | Browser |
| 2 | Connect Expo EAS and **queue the first phone builds** | [prompts/02-eas-and-first-builds.md](prompts/02-eas-and-first-builds.md) | Expo website |
| 3 | Backend: mobile sign-in | [prompts/03-backend-mobile-auth.md](prompts/03-backend-mobile-auth.md) | Terminal |
| 4 | Backend: push devices, push delivery, app version | [prompts/04-backend-push-and-version.md](prompts/04-backend-push-and-version.md) | Terminal |
| 5 | API contract + shared client | [prompts/05-contract-and-client.md](prompts/05-contract-and-client.md) | Terminal |
| 6 | Mobile core (API, sign-in, data, push, uploads) | [prompts/06-mobile-core.md](prompts/06-mobile-core.md) | Browser |
| 7 | Mobile UI kit (all shared components) | [prompts/07-mobile-ui.md](prompts/07-mobile-ui.md) | Browser |
| 8 | Partner: app shell, login, tabs | [prompts/08-partner-shell.md](prompts/08-partner-shell.md) | Browser + phone |
| 9 | Partner: application / KYC (`/apply`) | [prompts/09-partner-apply.md](prompts/09-partner-apply.md) | Browser + phone |
| 10 | Partner: Home and presence | [prompts/10-partner-home.md](prompts/10-partner-home.md) | Phone |
| 11 | Partner: Work and offers | [prompts/11-partner-work-offers.md](prompts/11-partner-work-offers.md) | Browser + phone |
| 12 | Partner: enquiries, visits, estimates | [prompts/12-partner-enquiries.md](prompts/12-partner-enquiries.md) | Browser + phone |
| 13 | Partner: jobs, days, stages | [prompts/13-partner-jobs.md](prompts/13-partner-jobs.md) | Browser + phone |
| 14 | Partner: Money, Me, Alerts | [prompts/14-partner-money-me-alerts.md](prompts/14-partner-money-me-alerts.md) | Browser |
| 15 | Partner: push, deep links, full QA, test release | [prompts/15-partner-push-qa-release.md](prompts/15-partner-push-qa-release.md) | Phone |
| 16 | Customer: app shell, login, tabs | [prompts/16-customer-shell.md](prompts/16-customer-shell.md) | Browser |
| 17 | Customer: Home and catalog | [prompts/17-customer-home-catalog.md](prompts/17-customer-home-catalog.md) | Browser |
| 18 | Customer: book, cart, checkout | [prompts/18-customer-booking.md](prompts/18-customer-booking.md) | Browser |
| 19 | Customer: payment, receipts, bookings | [prompts/19-customer-payment-bookings.md](prompts/19-customer-payment-bookings.md) | Phone |
| 20 | Customer: requests and visits | [prompts/20-customer-requests.md](prompts/20-customer-requests.md) | Browser |
| 21 | Customer: quotes and crew booking | [prompts/21-customer-quotes-crew.md](prompts/21-customer-quotes-crew.md) | Browser |
| 22 | Customer: jobs, stages, activity | [prompts/22-customer-jobs-activity.md](prompts/22-customer-jobs-activity.md) | Browser |
| 23 | Customer: account and notifications | [prompts/23-customer-account.md](prompts/23-customer-account.md) | Browser + phone |
| 24 | Customer: push, deep links, full QA, test release | [prompts/24-customer-push-qa-release.md](prompts/24-customer-push-qa-release.md) | Phone |
| 25 | Store listings and public release of both apps | [prompts/25-store-release.md](prompts/25-store-release.md) | Stores |

The Partner app comes first. Partners have to be online and accepting work before a customer
can be served, and the Partner app is where push notifications matter most.

---

## 3. How to run one phase (the loop)

Every phase file has a **Prompt**, a **Done when** checklist and a **Commit** command (most also
have **Before you start** and **TODO**). For each phase:

1. Open a **new chat** in Cursor or Antigravity. Starting fresh for each phase keeps the assistant
   focused.
2. Choose the strongest model your tool offers, in agent mode, with file editing and terminal
   allowed.
3. Copy the whole **Prompt** block (everything inside the grey box) and paste it into the chat.
4. Let it work. When it asks for permission to run a command, read the command and allow it if
   it is one of the commands listed in [guide/10-commands.md](guide/10-commands.md).
5. When it says it is finished, paste the **Verify prompt**. This makes the assistant re-check
   its own work against the TODO list and fix anything missing.
6. Tick every box in **Done when** yourself: open the browser or phone and look.
7. If something is broken, go to [guide/09-troubleshooting.md](guide/09-troubleshooting.md) and use
   the matching fix prompt. Do not describe the fix in your own words. Use the prompt.
8. Commit using the exact commit command in the phase file.

**The Verify prompt** (the same for every phase; paste it after the assistant says "done"):

```text
Verify this phase before I accept it.
1. Re-read the phase file I gave you and frontend/mobile/AGENTS.md.
2. Go through every TODO item and every numbered step of the prompt. For each, say DONE (with
   the file path) or MISSING.
3. Fix every MISSING item now.
4. Run the phase's checks exactly as listed in "Done when" (lint, typecheck, tests) and paste
   the real output. Fix any failure and run again until everything passes.
5. For every screen in this phase, compare against the web source files listed for it. List any
   text, colour, spacing, state (loading / empty / error) or step that differs, then fix it.
6. Finish with a short table: item, status, evidence.
Do not start the next phase.
```

---

## 4. What the apps include (v1 scope)

v1 is **the whole signed-in product in both apps**: every screen in the two screen lists, with
the same flows as the web. On top of the web, both apps get these mobile-only items:

- Push notifications: new offer, job updates, booking and payment updates.
- Tapping a notification or a web link opens the right screen inside the app.
- The login is kept in the phone's secure storage and revoked on logout.
- Camera and photo library for documents and work photos.
- **Delete my account** inside the app (Apple requires it).
- A "please update" screen when the server needs a newer app version.
- App icon, splash screen and store listings.

These are **not** rebuilt in the app. They open the website in the phone's browser:

- the Partner marketing site (about, blog, pricing, services, trades, become-a…)
- the Customer `contact` and `join-pro` pages
- terms and privacy
- every `design/…` page (those are internal design galleries, not real screens)

---

## 5. Values you need from the owner

The assistant will stop and ask if one of these is missing. Collect them before Phase 2:

| Value | Used in | Example |
|---|---|---|
| Expo account (owner's organisation), and your invite to it | Phase 2 | `vsolvehub` |
| Staging API URL | Phase 2, `eas.json` | `https://api-staging.vsolvehub.com` |
| Production API URL | Phase 2, `eas.json` | `https://api.vsolvehub.com` |
| Customer website URL | Deep links, legal links | `https://vsolvehub.com` |
| Partner website URL | Deep links, legal links | `https://partner.vsolvehub.com` |
| Apple Developer team (owner enrolls, invites you as Admin) | Phase 2 + 15 | — |
| Google Play Console (owner enrolls, invites you as Admin) | Phase 15 | — |
| Firebase project (owner creates, adds you) | Phase 4 + 15 | `vsolvehub-mobile` |
| Expo access token for push (owner creates at expo.dev → Access tokens) | Phase 4, backend `.env` | stored only in `.env` |

Never paste a secret into a prompt, a file under `frontend/`, or a commit. Secrets go only into
`backend/.env` (local) or the server's secret settings (staging/production), per the root
`AGENTS.md`.

---

## 6. Everything in this folder

```
frontend/mobile/
  README.md                ← this file
  AGENTS.md                ← rules the AI assistant must follow (it reads this every phase)
  guide/
    01-machine-setup.md    ← EAS, emulator, phone ↔ local backend
    02-architecture.md     ← the fixed stack, folders, and how data/sign-in/push work
    03-design-system.md    ← exact colours, fonts, sizes; web component → mobile component
    04-porting-rules.md    ← how a web screen is translated to a mobile screen, line by line
    05-backend.md          ← the backend changes, specified exactly
    06-screens-partner.md  ← every Partner screen: route, web source files, API, notes
    07-screens-customer.md ← every Customer screen
    08-release.md          ← Play Store and App Store checklist
    09-troubleshooting.md  ← problem → exact fix prompt
    10-commands.md         ← every command you will run, and what it does
  prompts/                 ← one file per phase (01 … 25)
  apps/partner/            ← created in Phase 1
  apps/customer/           ← created in Phase 1
  packages/core/           ← created in Phase 1
  packages/ui/             ← created in Phase 1
```
