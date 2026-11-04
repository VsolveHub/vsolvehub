# VSolve Rides V1 (Rapido): your build brief

| | |
|---|---|
| **You own** | VSolve Rides: bike, auto and cab rides, end to end |
| **Branch** | `rapido/v1` only. Never `main`. |
| **Start** | Friday 6 November 2026 |
| **Deadline** | Thursday 12 November 2026 (7 days, build **and** testing) |
| **Written** | 5 November 2026, by the owner |
| **Daily demo** | 6:30 pm, 15 minutes, with the owner |

You build all of Rides: the Django backend, the API contract, the new **VSolve Captain** app for
drivers, the **Rides** screens inside the existing Customer app, the Operations console pages,
and every test. This file is your spec. Where it decides something, follow it. Where it is
silent, **you decide**. Write the decision in your ADR (§4.3) and tell the owner at the 6:30
demo. You own the result, not your AI assistant: read every diff before you commit it.

---

## Contents

0. [The ten rules](#0-the-ten-rules)
1. [What V1 is, and is not](#1-what-v1-is-and-is-not)
2. [Where you may write](#2-where-you-may-write)
3. [Git rules](#3-git-rules)
4. [The design you must follow](#4-the-design-you-must-follow)
5. [Rides V1 architecture: decisions already made](#5-rides-v1-architecture-decisions-already-made)
6. [Day-by-day plan](#6-day-by-day-plan)
7. [Testing](#7-testing)
8. [Definition of done](#8-definition-of-done)
9. [What the owner gives you on Day 1](#9-what-the-owner-gives-you-on-day-1)
10. [Sources: read, learn, explore](#10-sources-read-learn-explore)
11. [When you are stuck](#11-when-you-are-stuck)
- [Appendix A: AGENTS.md pointer](#appendix-a-agentsmd-pointer)
- [Appendix B: PR description template](#appendix-b-pr-description-template)

---

## 0. The ten rules

1. **Work only on `rapido/v1`.** Never push to `main`, never merge into `main`, never force-push.
2. **Stay inside your folders (§2).** Outside them, change only the registration lines listed there.
3. **Django decides everything:** prices, states, permissions, deadlines. The apps only show
   what the API returns.
4. **Money is integer paise, calculated on the server.** Never calculate a price in an app.
5. **No fake data.** No mock captains, no straight-line ETA, no fallback fare, no stock photos.
   Show real data or an honest empty or error state.
6. **Never hand-edit** `contracts/openapi/v1.yaml` or `frontend/packages/api-client/src/generated/`.
   Regenerate them.
7. **Every state change is authorized and audited**, and **idempotent** if a phone can retry it.
8. **Side effects go through the outbox and Celery** (ADR-0002): dispatch, offers, push. Never
   run them inline inside a request.
9. **Never log** OTPs, session tokens, payment payloads, exact locations or KYC data.
10. **Every feature ships with tests, and you run them (§7).** Every bug fix gets a regression
    test.

---

## 1. What V1 is, and is not

### In V1 (all of it ships by Day 7)

| Area | What ships |
|---|---|
| Vehicle types | Bike, Auto, Cab |
| Rider (Customer app, Android + iOS) | pickup and drop search, map, fare per vehicle, book, searching, captain card with the captain moving live on the map, start OTP, in trip, pay cash/UPI to the captain, rating, cancel, ride history, SOS, share trip |
| Captain (new Captain app, Android) | sign-in, onboarding and KYC (driving licence, RC, insurance, vehicle), Daily Pass purchase, go on duty with background GPS, ride alert with sound, accept or decline, navigate, arrived, OTP start, end trip, payment received, rate the rider, wallet (pass and earnings), ride history, cancel |
| Backend | rate cards and fare engine, live location (Redis GEO), matching and offers, ride state machine, Daily Pass, ratings, SOS, notifications, Operations APIs |
| Operations console (web) | live rides and force cancel, SOS queue, rate cards, pass plans, captains list. Captain approval uses the **existing** partner review. |
| Testing | backend tests, app tests, a device test checklist on three phones, five real road rides, a written test report |

### Not in V1 (do not build)

- Goods transport and instant delivery. These come in V2, on the same engine plus parcel details.
- Vehicle rental, washing, roadside assistance and EV services. These are normal service
  categories in the existing catalogue, not Rides.
- Online payment for rides, surge pricing, scheduled rides, shared rides.
- Phone-number masking, a live-tracking web link, captain wallet top-up or stored balance,
  captain withdrawals.
- An iOS Captain app, and WebSockets.

---

## 2. Where you may write

### You create and own

| Path | What |
|---|---|
| `backend/apps/rides/**` | the Django app |
| `backend/tests/rides/**` | its tests |
| `frontend/mobile/apps/captain/**` | the Captain app. Package `captain-mobile`, Android id `com.vsolvehub.captain`, store name **VSolve Captain** |
| `frontend/mobile/apps/customer/app/(tabs)/rides/**` | rider routes |
| `frontend/mobile/apps/customer/src/features/rides/**` | rider screens, models, queries |
| `frontend/apps/admin/app/(operations)/operations/rides/**` | Operations routes |
| `frontend/apps/admin/features/rides/**` | Operations screens |
| `docs/adr/0013-rides-v1.md`, `contracts/proposals/0029-rides-v1.md`, `docs/rapido/**` | your design documents |

### Registration points: these exact lines, nothing else in these files

| File | Allowed change | Copy the pattern of |
|---|---|---|
| `backend/config/settings/base.py` | `"apps.rides"` in `INSTALLED_APPS`; one `RIDES_*` settings block; rides entries in `CELERY_BEAT_SCHEDULE`; one minor bump of `SPECTACULAR_SETTINGS["VERSION"]` | the `apps.mobile` lines |
| `backend/config/urls.py` | one `path("api/v1/", include("apps.rides.urls"))` line | the `apps.mobile` line |
| `backend/apps/partners/models/onboarding.py` + one new partners migration (and the partner onboarding services that branch on track) | `PartnerApplication.Track.RIDE_CAPTAIN`; `PartnerDocument.Kind` values `DRIVING_LICENCE`, `VEHICLE_RC`, `VEHICLE_INSURANCE` | the `EMPLOYER` track. Run `git log -S "EMPLOYER" --oneline -- backend/apps/partners` and copy only the partners-side changes |
| `backend/apps/commerce/models.py`, `backend/apps/commerce/services/capture.py`, `backend/apps/commerce/services/simulation.py` + one commerce migration, `backend/apps/ops_reports/reports.py` | `PaymentAttempt.Purpose.RIDE_CAPTAIN_PASS`, plus its capture, simulation and report-label lines | `A9_STAY_SUBSCRIPTION`. Grep it and add one sibling line at every hit |
| `backend/apps/notifications/templates_registry.py` | the rides notification templates | the existing entries |
| `contracts/openapi/v1.yaml`, `frontend/packages/api-client/src/generated/schema.d.ts` | regenerate only | `pnpm contract:generate` |
| `contracts/openapi/CHANGELOG.md` | one entry for Rides | the 1.95.0 entry |
| `frontend/mobile/apps/customer/src/features/catalog/view/home-screen.tsx` | one import and one `<RidesEntry />` line | — |
| `frontend/apps/admin/features/session/nav-groups.ts` | one **Rides** navigation entry | the other entries |
| `frontend/pnpm-lock.yaml` | only as changed by `pnpm install` or `npx expo install` | — |
| root `AGENTS.md` | the pointer section in Appendix A, added once on Day 1 | — |

Everything else is **read-only** for you. If you believe a file outside this list must change,
do not change it. Write it in the PR description under **Needs owner** and raise it at the 6:30
demo.

---

## 3. Git rules

```powershell
git fetch origin
git switch rapido/v1          # this file is the branch's first commit
```

- **Commit small and often. Push every evening at the latest:** `git push origin rapido/v1`.
- **Stage explicit paths only:** `git add backend/apps/rides backend/tests/rides …`. Never
  `git add -A`, never `git add .`. Other people work in this repository at the same time.
- **Never commit:** `.env` files, API keys, `google-services.json`, keystores (`*.jks`,
  `*.keystore`), `android/`, `ios/`, `db.sqlite3`, media.
- **Commit messages:** `feat(rides): …`, `test(rides): …`, `fix(rides): …`, `docs(rides): …`.
- **Keep up with `main` once a day:** `git fetch origin; git merge origin/main`. Merge, do not
  rebase, because a rebase needs a force-push and force-push is forbidden. Resolve conflicts
  in your own files. If a conflict is in someone else's file, stop and ask.
- **Migrations:** if `main` gains a new partners or commerce migration after you made yours,
  delete yours and run `makemigrations` again so it comes after theirs. Never edit someone
  else's migration.
- **Contract version:** take the next free minor version when you regenerate (today that is
  `1.96.0`). If `main` takes it first, take the next one when you merge `main`.
- **Day 1: open a Draft pull request** `rapido/v1 → main` titled **Rides V1**. Paste Appendix B
  into it and tick it every day. You never merge it. You move it to **Ready for review** only
  on Day 7, after the definition of done (§8) is met. The owner reviews and merges.

---

## 4. The design you must follow

Rides is new, but the house rules are not. The rest of VSolve Hub follows them, and Rides
must too.

### 4.1 Read these before you write code (Day 1 morning)

| File | Why |
|---|---|
| `AGENTS.md` (root) | architecture and quality rules for the whole repository |
| `CONTRIBUTING.md` | setup, seed data, logins, the daily commands |
| `frontend/mobile/README.md`, `frontend/mobile/AGENTS.md` | how the mobile apps are built (§5.12 lists the exceptions Rides gets) |
| `frontend/mobile/guide/02-architecture.md`, `03-design-system.md`, `05-backend.md`, `10-commands.md` | mobile sign-in, design tokens, the bearer client, commands |
| `docs/adr/0002-outbox-and-celery-own-dispatch.md` | dispatch runs from the outbox, and handlers must be idempotent |
| `docs/adr/0004-fail-closed-provider-selection.md` | how a provider such as Google Routes is selected and refused |
| `docs/adr/0005-server-clock-calibration.md` | countdowns use the server clock |
| `docs/adr/0006-outbox-visibility-deadline-recovery.md` | the recovery sweep pattern |
| `docs/adr/0009-m2-rate-card-instant-dispatch-for-a3.md` | the closest existing rate-card and offer-cascade design |
| `backend/apps/stay/services.py`: `start_stay_subscription_purchase`, `complete_stay_subscription_payment` | the exact pattern for the Daily Pass |
| `backend/apps/partners/models/onboarding.py`, `backend/apps/partners/models/availability.py` | partner application, documents, presence and location rules |
| `backend/apps/assignments/` (`partner/offers/` endpoints) | how offers work today |
| `backend/apps/mobile/` | a small, recent, clean Django app. Copy its layout. |
| `backend/apps/locations/geocoding.py`, `backend/apps/locations/urls.py` | the adapter pattern, and the address search and reverse geocoding you must **reuse** |
| `backend/apps/notifications/services.py`: `request_notification` | how to send a notification (the `audience` argument is required) |
| `frontend/apps/admin/features/m2-rate-cards/`, `frontend/apps/admin/features/vendor-plans/` | the Operations page patterns |
| `frontend/mobile/apps/partner/` | the app shell, login and apply flow that the Captain app copies |

### 4.2 House rules in practice

**Backend**
- Keep views thin. Business rules live in `services.py`; reads live in `selectors.py`. When a
  module grows past about 400 lines, turn it into a package that re-exports with `__all__`
  (strict mypy requires `__all__`).
- Every model has database constraints (`CheckConstraint`, `UniqueConstraint`, partial
  unique) as well as serializer validation.
- Every command a phone may retry takes an `Idempotency-Key` header: create ride, accept offer,
  buy pass.
- Every ride state change writes a `RideTransition` row: who, from, to, when and why.
- Google Routes sits behind an adapter with a 3-second timeout and one retry. Provider
  selection is explicit (ADR-0004): `RIDES_ROUTING_PROVIDER` is `"google"` or `"fake"`, the
  default `"unconfigured"` refuses every call, and production refuses to boot with `"fake"`.
  If Google fails, the API answers `503 routing_unavailable` and the app says so honestly.
  There is no straight-line fallback.
- Every countdown is sent as an `expires_at` from the server. The apps show it with
  `useServerCountdown`.
- Errors use the existing error envelope with stable codes (§5.10).

**Apps**
- Every request goes through `getApiClient()` from `@vsolve/mobile-core`. Types come only from
  the generated `Schemas[...]`.
- Use `@vsolve/mobile-ui` components and the token classes in `guide/03-design-system.md`.
  Never invent a colour.
- Every screen has loading, empty, error and offline states.
- Put server data in TanStack Query. Polling pauses in the background, as `@vsolve/mobile-core`
  already does.

### 4.3 Your two design documents (Day 1)

1. **`docs/adr/0013-rides-v1.md`.** Use the format in `docs/adr/README.md`. Record every
   decision in §5, every decision you make yourself, a **Dependencies** section (each new
   package and why), and a **References** section (what you used from §10). Set it to
   `Status: Proposed`. The owner changes it to Accepted.
2. **`contracts/proposals/0029-rides-v1.md`.** Use the format in `contracts/proposals/README.md`.
   Cover every endpoint in §5.10: an example request and response, every error code with the
   message the user sees, and the idempotency and retry behaviour.

The owner reviews both at the Day 1 demo. Keep both up to date whenever you change something.

---

## 5. Rides V1 architecture: decisions already made

### 5.1 The pieces

```
 Customer app (Android + iOS)      Captain app (Android)              Operations console (web)
 app/(tabs)/rides/*                frontend/mobile/apps/captain       /operations/rides/*
   poll every 3 s on a live ride     GPS ping every 5 s on duty
          │                                │                                  │
          └──────────────── REST  /api/v1/ ┴──────────────────────────────────┘
                                   Django: apps/rides
               PostgreSQL = the truth             Redis GEO = live positions only
                                   │
                     outbox → Celery: dispatch rounds, offer expiry, sweeps, push
                                   │
             OneSignal push: partner app id for captains, customer app id for riders
```

### 5.2 A captain is a partner

A captain is a `PartnerProfile` whose application track is **`RIDE_CAPTAIN`**. That reuses
sign-in, the partner role, document upload and virus scanning, the existing Operations review
queue at `/operations/partners`, and suspension. There is no second KYC system.

- **Onboarding** is short, like `EMPLOYER`: about you → agreements → identity documents
  (existing kinds) → driving licence, vehicle RC and insurance (the new kinds) → vehicle
  details (`CaptainVehicle` in the rides app) → submit. Operations approves in the existing
  review screen.
- **Duty is not `PartnerOnlineSession`.** That table drives home-service dispatch. Rides keeps
  its own `CaptainDutySession`.
- **Location is not `PartnerLocation`.** That table is rounded to about 100 m on purpose, for
  privacy. Rides keeps live positions in Redis and trip points in `RideTrackPoint`.

### 5.3 Data model (`backend/apps/rides/models.py`)

| Model | Key fields | Constraints |
|---|---|---|
| `RideRateCard` | `service_area` (FK `locations.ServiceArea`), `vehicle_type` (`BIKE` / `AUTO` / `CAB`), `base_fare_paise`, `included_distance_m`, `per_km_paise`, `per_minute_paise`, `minimum_fare_paise`, `free_waiting_minutes`, `waiting_per_minute_paise`, `is_active`, `version`, `created_by`, timestamps | one active card per (area, vehicle type), as a partial unique constraint; every paise value ≥ 0. **A vehicle type is bookable in an area only when it has an active card. That is the only on/off switch.** |
| `CaptainVehicle` | `partner` (one-to-one), `vehicle_type`, `registration_number` (stored upper-case, no spaces), `make_model`, `colour` | `registration_number` unique |
| `CaptainPassPlan` | `code` (slug), `name`, `price_paise`, `duration_hours`, `is_active` | `code` unique; price ≥ 0 |
| `CaptainPass` | `partner`, `plan`, `payment_attempt` (FK `commerce.PaymentAttempt`, null for ₹0 plans), `status` (`PENDING_ACTIVATION`, `ACTIVE`, `EXPIRED`, `CANCELLED`), `starts_at`, `ends_at` | one `ACTIVE` pass per partner. Copy `StaySubscription`. |
| `CaptainDutySession` | `partner`, `started_at`, `ended_at`, `end_reason` (`CAPTAIN_OFF`, `LOCATION_STALE`, `PASS_EXPIRED`, `SUSPENDED`, `OPERATIONS`) | one open session per partner |
| `FareQuote` | `rider`, `service_area`, `vehicle_type`, `rate_card`, `rate_card_version`, pickup and drop (latitude, longitude, label), `distance_m`, `duration_s`, `route_polyline`, `fare_paise`, `expires_at`, `consumed_at` | used at most once |
| `Ride` | `rider`, `quote` (one-to-one), `service_area`, `vehicle_type`, pickup and drop (copied from the quote), `state`, `captain` (FK partner, null), `fare_paise`, `waiting_paise`, `final_fare_paise`, `payment_method` (`CASH_OR_UPI`), `payment_status` (`DUE`, `COLLECTED`), `otp_attempts`, `dispatch_round`, a timestamp per state, `cancelled_by` (`RIDER`, `CAPTAIN`, `OPERATIONS`, `SYSTEM`), `cancel_reason` | one open ride per rider; one open ride per captain (both partial unique) |
| `RideTransition` | `ride`, `from_state`, `to_state`, `actor`, `actor_kind`, `reason`, `at` | append-only |
| `RideOffer` | `ride`, `captain`, `round`, `status` (`PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `WITHDRAWN`), `pickup_distance_m`, `offered_at`, `expires_at`, `responded_at` | unique (`ride`, `captain`) |
| `RideTrackPoint` | `ride`, `latitude`, `longitude`, `accuracy_m`, `captured_at` | written only from `CAPTAIN_ASSIGNED` to `IN_TRIP`; a beat task deletes points older than 90 days |
| `RideRating` | `ride`, `rater_kind` (`RIDER`, `CAPTAIN`), `stars` (1–5) | unique (`ride`, `rater_kind`). Not `ratings.ServiceRating`, which needs a booking or an engagement. |
| `RideSosEvent` | `ride`, `raised_by`, `latitude`, `longitude`, `status` (`OPEN`, `RESOLVED`), `resolved_by`, `resolution_note`, timestamps | — |

Earnings have no table. They are calculated from completed rides in `selectors.py`.

### 5.4 Ride states

```
SEARCHING ──accept──▶ CAPTAIN_ASSIGNED ──arrived──▶ CAPTAIN_ARRIVED ──start (OTP)──▶ IN_TRIP ──complete──▶ COMPLETED
   │                       │       ▲                      │
   │                       │       └── captain cancels ───┤   (goes back to SEARCHING, that captain excluded)
   ├── no captain ─▶ NO_CAPTAIN_FOUND                     │
   └── rider or Operations cancels ─▶ CANCELLED ◀─────────┘
```

| Transition | Who | Rule |
|---|---|---|
| create → `SEARCHING` | rider | the quote is valid, unexpired and unused; the rider has no other open ride; the area and vehicle type are active |
| `SEARCHING` → `CAPTAIN_ASSIGNED` | captain accepts an offer | the first accept wins (`select_for_update` on the ride); every other offer becomes `WITHDRAWN`; the loser gets `409 ride_no_longer_available` |
| `SEARCHING` → `NO_CAPTAIN_FOUND` | system | the last round expired with no accept |
| `CAPTAIN_ASSIGNED` → `CAPTAIN_ARRIVED` | captain | the last ping is at most 30 s old and within `RIDES_ARRIVAL_RADIUS_M` (200 m) of the pickup; otherwise `409 not_at_pickup` |
| `CAPTAIN_ARRIVED` → `IN_TRIP` | captain enters the OTP | 4 digits; after 5 wrong tries, `423 otp_locked` (the rider can cancel, and Operations can cancel) |
| `IN_TRIP` → `COMPLETED` | captain | `final_fare = fare + waiting`; `payment_status = DUE` |
| `COMPLETED`: `DUE` → `COLLECTED` | captain taps "Payment received" | — |
| `SEARCHING` / `CAPTAIN_ASSIGNED` / `CAPTAIN_ARRIVED` → `CANCELLED` | rider | free in V1; a reason code is required |
| `CAPTAIN_ASSIGNED` / `CAPTAIN_ARRIVED` → `SEARCHING` | captain cancels | a reason code is required; dispatch restarts at round 1 without that captain; the cancel counts against the captain in Operations |
| any open state → `CANCELLED` | Operations | a reason is required |
| `IN_TRIP` → cancel | nobody except Operations | V1 rule. The captain ends the trip instead. |

- **OTP** is derived, never stored: `HMAC(RIDES_OTP_SECRET, ride.id)` reduced to 4 digits. Only
  the rider sees it, and only before `IN_TRIP`. Never log it.
- **Phone numbers:** the rider sees the captain's number and the captain sees the rider's, only
  while the ride is `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED` or `IN_TRIP`. In every other state the
  API leaves them out.

### 5.5 Fare engine (server only, integer paise)

```
extra_m      = max(0, distance_m − included_distance_m)
distance_fee = per_km_paise × extra_m / 1000
time_fee     = per_minute_paise × duration_s / 60
fare         = max(minimum_fare_paise, base_fare_paise + distance_fee + time_fee)
fare         → rounded once to the nearest whole rupee (100 paise), half up
waiting      = waiting_per_minute_paise × ceil(max(0, started_at − arrived_at − free_waiting_minutes × 60 s) / 60 s)
final_fare   = fare + waiting
```

- Calculate in `Decimal` or integer arithmetic, never `float`. Store integer paise.
- `distance_m`, `duration_s` and the route polyline come from the Google Routes API
  `computeRoutes`, called on the server. **Bike uses `TWO_WHEELER`** (India is supported; it
  bills at a higher rate). **Auto and cab use `DRIVE`.**
- **The fare is upfront.** The quoted price is the price. V1 never re-prices by GPS distance;
  only waiting time is added.
- A quote lives for 5 minutes (`RIDES_QUOTE_TTL_SECONDS = 300`) and can be used once.
- Changing a rate card never changes an existing quote or ride, because the quote keeps
  `rate_card_version`.
- Operations sets the numbers. Your seed command writes placeholder values and marks them as
  placeholders, the way `seed_m2_demo` does.

### 5.6 Live location and matching

**Location**
- The Captain app sends `POST /partner/rides/location/` every 5 seconds while on duty, including
  during a ride.
- The server validates each ping: latitude and longitude in range, `accuracy_m` > 0,
  `captured_at` no more than 30 s old and no more than 5 s in the future. Matching ignores
  positions with accuracy worse than 100 m.
- Redis (ephemeral): `GEOADD rides:geo:{service_area_id}:{vehicle_type}` with the partner id,
  **only while** the captain is on duty, has an active pass, is approved and has no open ride.
  Also `rides:pos:{partner_id}`, a hash of latitude, longitude, accuracy, heading and
  `captured_at`, with a 30-second TTL.
- Redis GEO members do not expire on their own. Matching skips any member whose `rides:pos:`
  key has gone. A beat task every 60 s removes stale members, and ends the duty session with
  `LOCATION_STALE` after 2 minutes without a ping.
- From `CAPTAIN_ASSIGNED` to `IN_TRIP`, each ping also writes a `RideTrackPoint`.
- PostgreSQL stays the truth for who is on duty (`CaptainDutySession`). Redis only answers the
  question "who is near?".

**Dispatch (Celery, through the outbox)**
- Creating a ride writes the outbox event `rides.ride_requested`, and its handler starts round 1.
- Each round runs `GEOSEARCH` around the pickup within `RIDES_DISPATCH_RADII_M = [2000, 4000, 6000]`
  (one radius per round), nearest first. A captain is eligible when their position is fresh,
  they are on duty with an active pass, approved and not suspended, the vehicle type matches,
  they have no open ride, no pending offer elsewhere, and no offer for this ride yet.
- Each round offers to up to `RIDES_OFFERS_PER_ROUND = 3` captains, with
  `expires_at = now + RIDES_OFFER_SECONDS (15)`.
- The next round is scheduled for the expiry time. Every task re-reads the ride state first,
  because delivery is at least once (ADR-0002). A round with no eligible captain moves straight
  to the next round.
- After the last round: `NO_CAPTAIN_FOUND`, about 45 seconds in total.
- A beat sweep every 30 s re-drives any ride stuck in `SEARCHING` whose round has expired
  (the ADR-0006 recovery pattern).
- Every number above is a `RIDES_*` setting, so it can be tuned later without code changes.

### 5.7 Real time without WebSockets

Production runs threaded gunicorn workers, not ASGI. V1 uses push plus short polling. Do not
add Django Channels, Firebase Realtime Database or Socket.IO.

| Who | What | How often |
|---|---|---|
| Captain on duty, app open | `GET /partner/rides/offers/current/` | every 2 s |
| Captain on duty, app in background or screen off | OneSignal push "New ride request": high priority, with sound, on the Android channel **Ride requests**; tapping it opens the offer | instant |
| Captain on a ride | `GET /partner/rides/current/` | every 5 s |
| Rider on a live ride | `GET /rides/{ride_id}/` (state, captain position, ETA) | every 3 s |
| Rider's pickup ETA | calculated on the server with the Routes API, cached in Redis for 30 s per ride | — |

Push goes through `request_notification(...)` with the right `audience`: `partner` for
captains, `customer` for riders, `operations` for SOS. Notification handlers deduplicate on
the outbox event id.

### 5.8 Money

- **The rider pays the captain directly**, in cash or by UPI to the captain's QR code. VSolve
  holds no rider money in V1. The rider app says "Pay ₹X to your captain", and the captain taps
  **Payment received**.
- **VSolve earns from the Daily Pass.** The captain buys a pass (for example 1 day or 7 days,
  priced by Operations) through Razorpay, in test mode locally, using
  `initiate_standalone_payment_attempt(purpose=RIDE_CAPTAIN_PASS, …)`. This is the stay
  subscription pattern, line for line.
- A **₹0 plan** (for launch) activates at once, with no payment attempt. Test both paths.
- With no active pass, the captain cannot go on duty (`403 pass_required`). If the pass expires
  during a ride, the ride continues and the captain goes off duty when it ends.
- **The Captain wallet in V1** shows the pass status (time left), the pass history and receipts,
  and earnings for today and this week (rides and cash collected). There is no stored balance
  and no withdrawal in V1.

### 5.9 Safety

- **Start OTP** (see §5.4).
- **SOS** on the live-ride screen, for both rider and captain. It creates a `RideSosEvent` with
  the last known position, notifies Operations at once, and shows a **Call** button for the
  emergency number from the server setting `RIDES_EMERGENCY_NUMBER` (112).
- **Share trip** opens the phone's share sheet with the captain's first name, the vehicle number,
  make and colour, and the pickup and drop. A live-tracking link comes in V2.
- **The rider always sees** the captain's photo and vehicle number before the trip starts.

### 5.10 API surface

The base is `/api/v1/`. Rider endpoints are under `rides/`, captain endpoints under
`partner/rides/` and Operations endpoints under `operations/rides/`, the same style as the
existing `partner/offers/` and `operations/cases/`.

**Rider (customer role)**

| Method and path | Purpose |
|---|---|
| `GET rides/availability/?latitude=&longitude=` | which vehicle types can be booked here (drives the home entry) |
| `POST rides/quotes/` | pickup and drop in, one quote per available vehicle type out |
| `POST rides/` (Idempotency-Key) | book with a `quote_id` |
| `GET rides/` | my ride history (paginated) |
| `GET rides/{ride_id}/` | live state, captain card and position, ETA, OTP (before `IN_TRIP`), fare |
| `POST rides/{ride_id}/cancel/` | cancel with a reason code |
| `POST rides/{ride_id}/rating/` | 1–5 stars |
| `POST rides/{ride_id}/sos/` | raise an SOS |

**Captain (partner role, `RIDE_CAPTAIN` track)**

| Method and path | Purpose |
|---|---|
| `GET partner/rides/me/` | approval state, vehicle, pass, duty, open ride, and the reasons anything is blocked |
| `PUT partner/rides/vehicle/` | vehicle details |
| `GET partner/rides/pass-plans/` | the plans on sale |
| `POST partner/rides/passes/` (Idempotency-Key) | buy a pass, returning the payment handoff |
| `GET partner/rides/passes/` | pass history |
| `POST partner/rides/duty/start/`, `POST partner/rides/duty/stop/` | go on or off duty |
| `POST partner/rides/location/` | GPS ping |
| `GET partner/rides/offers/current/` | the offer to show now, or none |
| `POST partner/rides/offers/{offer_id}/accept/` (Idempotency-Key), `…/decline/` | respond to an offer |
| `GET partner/rides/current/` | my open ride |
| `POST partner/rides/{ride_id}/arrived/`, `…/start/` (with `otp`), `…/complete/`, `…/payment-received/`, `…/cancel/`, `…/rating/`, `…/sos/` | trip steps |
| `GET partner/rides/history/`, `GET partner/rides/earnings/?period=today\|week` | history and earnings |

**Operations (operations role)**

| Method and path | Purpose |
|---|---|
| `GET operations/rides/?state=`, `GET operations/rides/{ride_id}/` | live and past rides, with transitions and offers |
| `POST operations/rides/{ride_id}/cancel/` | force cancel with a reason |
| `GET / POST / PATCH operations/rides/rate-cards/` | rate cards (an edit creates a new version) |
| `GET / POST / PATCH operations/rides/pass-plans/` | pass plans |
| `GET operations/rides/captains/` | captains, with vehicle, pass, duty, rating and cancel count |
| `GET operations/rides/sos/`, `POST operations/rides/sos/{sos_id}/resolve/` | the SOS queue |

**Stable error codes** (each one needs a user message in proposal 0029): `area_not_served`,
`vehicle_unavailable`, `quote_expired`, `quote_used`, `ride_already_open`,
`ride_no_longer_available`, `invalid_transition`, `not_at_pickup`, `otp_invalid`,
`otp_locked`, `pass_required`, `captain_not_approved`, `location_stale`,
`routing_unavailable`.

### 5.11 Screens

No web version of these screens exists, so **this list is the spec**. Use the usual layout of a
ride app: map on top, bottom sheet below. Look at Rapido, Uber and Namma Yatri for layout
ideas, never for colours or artwork. Use only `@vsolve/mobile-ui` and our tokens. Keep the copy
short and plain, for example "Finding your captain…".

**Captain app (Android).** Tabs: Home, Rides, Wallet, Me.

1. **Sign in.** Port it from partner-mobile.
2. **Onboarding:** about you → agreements → identity documents → licence, RC, insurance →
   vehicle → submitted, changes required or approved. Port the shared steps from partner-mobile
   `src/features/application/`, with the `// Ported from …` header line on each file.
3. **Location disclosure.** Google Play requires a prominent in-app disclosure before you ask.
   Then the permission requests: while using the app, then "Allow all the time". Then help on
   turning off battery optimisation.
4. **Home:** duty switch, pass status, today's earnings. When duty is blocked, say why: not
   approved, no pass, or permission missing.
5. **Ride request:** full screen, with sound and a 15-second countdown from the server. Shows
   the pickup distance, pickup area, drop area and fare. Accept or Decline.
6. **To pickup:** map, the rider's first name, Call, Navigate (opens Google Maps with
   `google.navigation:q=lat,lng`), Arrived, Cancel (with a reason).
7. **Enter OTP**, then **In trip:** the drop, Navigate, End trip.
8. **Collect:** the final fare, **Payment received**, then rate the rider.
9. **Wallet:** pass status, buy a pass (Razorpay in a WebView, as in customer checkout), pass
   history, earnings for today and this week.
10. **Rides history. Me:** profile, vehicle, document status, support, sign out.

**Customer app: Rides**

1. **Home entry card**, shown only when `rides/availability/` returns vehicle types for the
   chosen location.
2. **Where to:** the current location as pickup (editable), drop search (existing
   `geocoding/search/`), and a pin on the map (existing `geocoding/reverse/`).
3. **Choose ride:** the route on the map, and one row per vehicle with its fare and trip time,
   then **Book**.
4. **Searching:** an animation and **Cancel**.
5. **Captain on the way:** photo, name, rating, vehicle number and model, the captain moving on
   the map, ETA, the OTP, Call, Share, SOS, Cancel.
6. **In trip:** live map, SOS, Share.
7. **Done:** "Pay ₹X to your captain (cash or UPI)", then the rating.
8. **Honest states:** "Finding another captain" (the captain cancelled), "No captain nearby"
   (`NO_CAPTAIN_FOUND`), cancelled.
9. **Ride history and ride detail.** Reopening the app lands on the open ride.

**Operations console (web):** Rides (live list, detail, force cancel), SOS queue, Rate cards,
Pass plans, Captains.

### 5.12 Mobile exceptions, approved by the owner for Rides only

These override `frontend/mobile/AGENTS.md` for Rides work, and nothing else.

- **No web original.** Rides screens are not ports. This brief is their spec.
- **Background location in the Captain app only.** Use `expo-location` with `expo-task-manager`,
  on Android only, only while on duty, with a foreground-service notification "You're on duty".
  Permissions: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_LOCATION`. Define the task at module top level. Stop updates on duty stop
  and on sign out. It needs a development build; it does not work in Expo Go.
- **Customer app rides use foreground location only.** Its permissions do not change.
- **New packages allowed:** `react-native-maps` (Customer and Captain apps; Google provider on
  Android, Apple Maps on iOS), `expo-task-manager` (Captain), `expo-intent-launcher` (Captain,
  to open the battery-optimisation settings). Install them with `npx expo install`. If you need
  anything else, add it and justify it in the ADR's Dependencies section; the owner reviews it
  in the PR.
- **Push:** the Captain app uses the **partner** OneSignal app id, because captains are
  partners. Ride offers use the Android channel **Ride requests**, with sound. The owner creates
  the channel and gives you its id.
- **Platforms:** the Captain app V1 is Android only. Customer rides work on Android and iOS.

---

## 6. Day-by-day plan

Every day runs **Build → Test → Gate → Push → 6:30 pm demo**. A day is not done until its gate
is green. If you fall behind, cut polish, never tests, and tell the owner the same day.

### Day 1: Friday 6 November. Setup, design, skeleton

**Build**
- Set up your machine with `CONTRIBUTING.md` and `frontend/mobile/guide/01-machine-setup.md`:
  Docker, backend, seed data, and customer-mobile running on your phone.
- `git switch rapido/v1`. Add the Appendix A pointer to `AGENTS.md`. Open the Draft PR.
- Write ADR-0013 and proposal 0029 (§4.3).
- Create the `apps/rides` skeleton (`apps.py`, `models.py`, `admin.py`, `urls.py`, `services.py`,
  `selectors.py`), every model with its constraints, and the migrations. Add the partners
  `Track` and `Kind` values with their migration, and the commerce `Purpose` with its migration.
- Scaffold `frontend/mobile/apps/captain`: copy partner-mobile's `app.config.ts`, `eas.json`,
  `metro.config.js`, `babel.config.js`, `tailwind.config.js`, `jest.config.js`, `tsconfig.json`
  and `global.css`, with the new name and id. Add `react-native-maps`, `expo-task-manager` and
  `expo-intent-launcher`. Add `react-native-maps` to customer-mobile.
- **Queue the Android development builds for both apps today**
  (`eas build --profile development --platform android --no-wait`). Builds take hours in the
  queue.

**Test:** model constraint tests (one active rate card per area and type, one open ride per
rider and per captain, one active pass, stars 1–5, unique registration number).

**Gate:** `quality-static.cmd` green · `pytest tests/rides` green · ADR and proposal sent to the
owner.

### Day 2: Saturday 7 November. Backend: pricing and supply

**Build**
- Routing adapter (Google and fake) and the fare engine.
- `rides/availability/` and `rides/quotes/`.
- Operations rate-card and pass-plan APIs.
- Captain `me`, vehicle, and the `RIDE_CAPTAIN` onboarding wiring.
- Pass purchase and activation through commerce, plus a beat task that expires passes.
- Duty start and stop, with every gate.
- Location ping into Redis, and the stale sweeper.
- Seed command `seed_rides_demo --i-understand-this-is-dev-only` (DEBUG only): rate cards for
  `hyderabad-500032` (Bike, Auto, Cab) marked as placeholders, two pass plans (one ₹0), and
  three approved test captains with vehicles on their own reserved phone-number block.

**Test**
- Fare table, at least 15 cases: minimum fare, included distance, half-up rounding, waiting
  edge cases.
- Quote expiry and single use; rate-card versioning.
- Pass purchase: idempotent retry, activation, expiry, the ₹0 plan.
- Duty gates: not approved, no pass, suspended.
- Ping validation: out of range, stale, in the future.
- Redis add, remove and stale cleanup.
- The routing provider fails closed.

**Gate:** `pytest tests/rides tests/partners tests/commerce -q` green · `quality-static.cmd`
green · contract regenerated, CHANGELOG entry written, `pnpm contract:generate` and
`pnpm contract:check` green.

### Day 3: Sunday 8 November. Backend: the rides engine

**Build**
- Create ride, the outbox handler, dispatch rounds, offer expiry and the recovery sweep.
- Current offer, accept and decline.
- Arrived, start, complete, payment received.
- Cancellations and re-dispatch, and `NO_CAPTAIN_FOUND`.
- Ratings, SOS, history and earnings.
- Notifications (templates and audience) and every Operations endpoint.

**Test**
- The state-machine matrix: every allowed transition, and every forbidden one returning
  `409 invalid_transition`.
- Dispatch eligibility, one test per exclusion rule; radius widening; a round with no
  candidates.
- The accept race: two captains accept at once in a `TransactionTestCase`, one wins and the
  other gets a 409.
- Idempotent create, accept and buy.
- The authorization matrix: anonymous, another rider, another captain, a customer on a captain
  URL, a captain on an Operations URL.
- OTP: five wrong tries locks it. Arrival geofence. Waiting charge.
- Notifications are queued once per event, with the right audience.

**Gate:** all rides backend tests green · `apps/rides` branch coverage ≥ 85% · focused
`tests/partners tests/commerce tests/notifications` green · `quality-static.cmd` green ·
contract and client regenerated.

### Day 4: Monday 9 November. Captain app, part 1

**Build**
- Shell and tabs, sign-in.
- Onboarding with KYC uploads, and the waiting, approved and changes-required states.
- Location disclosure, permissions, and battery-optimisation help.
- Duty switch with the background task and its foreground notification.
- Pass purchase (Razorpay WebView).
- Ride request screen with sound and the server countdown; accept and decline.
- OneSignal wiring with the partner app id and the Ride requests channel.

**Test:** Jest model tests (the reasons duty is blocked, the offer countdown, the permission
states) · a component test per screen (loading, error, main) · a unit test for the background
task (it posts the ping, and handles 401 and 409).

**On the phone:** install the Captain development build on phone A and go on duty. Turn the
screen off for 10 minutes and confirm the pings keep arriving (Operations captains page or
Redis). Create a ride from Swagger and receive the alert.

**Gate:** `pnpm --filter captain-mobile lint`, `typecheck` and `test` green · the phone checks
above pass.

### Day 5: Tuesday 10 November. Captain app part 2, Rider part 1

**Build, Captain:** to pickup, navigate, arrived, OTP, in trip, end trip, payment received, rate
the rider, cancel with a reason, wallet (pass and earnings), history, Me.

**Build, Rider:** home entry, where to (search, pin, current location), choose ride (route and
fares), book, searching with cancel.

**Test:** Jest tests for every new screen and model file. The fare shown is always the API
value. The idempotency key stays the same across retries.

**On the phones:** the first full ride on two phones on the same Wi-Fi: book → accept → arrive
→ OTP → end → payment received. Record a screen video.

**Gate:** lint, typecheck and test green for `captain-mobile` and `customer-mobile` · the first
full ride is recorded.

### Day 6: Wednesday 11 November. Rider part 2, Operations console

**Build, Rider:** captain card, the captain moving on the map (3 s), ETA, OTP, Call, Share, SOS,
in trip, done with the pay prompt and rating, "finding another captain", "no captain nearby",
history and detail, reopening the app lands on the open ride.

**Build, Operations:** Rides list and detail (transitions and offers), force cancel, SOS queue
and resolve, rate cards, pass plans, captains, and the navigation entry.

**Test:** Jest tests for the rider screens · Vitest tests for `features/rides` in the admin app ·
device scenarios 1–20 from §7.3.

**Gate:** lint, typecheck and test green for `captain-mobile`, `customer-mobile` and `admin` ·
scenarios 1–20 pass.

### Day 7: Thursday 12 November. Test, fix, hand over

- Run the **whole** device checklist (§7.3) with three phones.
- **Road test:** five real rides around the 500032 area, covering bike, auto and cab, through
  the tunnel or staging URL the owner gives you (§7.4).
- Fix every bug you find, each with a regression test.
- Record the Google Play background-location video: disclosure → permission → on duty → an
  offer arriving. The owner needs it for the Play declaration.
- Merge `origin/main`, regenerate the contract if needed, and run every gate again.
- Write the test report (§7.5) into the PR, then move the PR from Draft to **Ready for review**.
  **Do not merge.**

**Gate:** every box in §8 ticked.

---

## 7. Testing

### 7.1 What you are authorized to run (owner directive, 5 November 2026, Rides only)

Root `AGENTS.md` says agents do not run tests. **For Rides, the owner overrides that:** you and
your AI assistant run the commands below and paste the real output into the PR.

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/rides -q
.\.venv\Scripts\python.exe -m pytest tests/rides --cov=apps/rides --cov-branch --cov-report=term-missing
.\.venv\Scripts\python.exe -m pytest tests/partners tests/commerce tests/notifications -q   # the apps whose registration lines you touched
.\scripts\quality-static.cmd
```

From `frontend/`:

```powershell
pnpm --filter captain-mobile lint;  pnpm --filter captain-mobile typecheck;  pnpm --filter captain-mobile test
pnpm --filter customer-mobile lint; pnpm --filter customer-mobile typecheck; pnpm --filter customer-mobile test
pnpm --filter admin lint;           pnpm --filter admin typecheck;           pnpm --filter admin test
pnpm contract:check
```

**Not yours to run:** the full `quality.cmd`, the whole backend suite, and Playwright. The owner
runs those at review. If someone else runs pytest on the same machine, use your own database
(`DATABASE_URL=…/vsolve_rides`).

**Rules:** paste the real command and the real output. Never write "tests pass" for a run that
did not happen. Never skip, delete or weaken a test to make it green. Turbo caches results, so
force a cold run when a gate decides something: `pnpm exec turbo run typecheck --force`.

### 7.2 Automated tests you must write

**Backend, `backend/tests/rides/`:** `test_constraints.py`, `test_fares.py`, `test_quotes.py`,
`test_rate_cards.py`, `test_passes.py`, `test_duty_and_location.py`, `test_dispatch.py`,
`test_offers_race.py`, `test_ride_lifecycle.py`, `test_cancellations.py`, `test_otp.py`,
`test_ratings_sos.py`, `test_notifications.py`, `test_authorization.py`,
`test_operations_api.py`, `test_routing_adapter.py`.
- Use `factory-boy` and `freezegun` (already in the dev requirements), the fake routing provider
  and the existing deterministic payment fakes. Tests never call the network.
- Every endpoint is tested for: success, unauthorized, invalid input, wrong state, and
  idempotent retry.
- `apps/rides` branch coverage is at least 85%.

**Apps:** every `model/` file has unit tests. Every screen has a component test (loading, error
and main states, with mocked query data). The background location task has a unit test. The
Operations `features/rides` model files have Vitest tests.

### 7.3 Device checklist (phones: A and B are captains, C is the rider; an iPhone is optional for the rider)

| # | Scenario | Expected |
|---|---|---|
| 1 | Bike ride end to end, paid in cash | every state appears on both phones within 3–5 s; final fare = quote |
| 2 | Auto ride end to end | same as 1 |
| 3 | Cab ride end to end | same as 1 |
| 4 | Book with no captain on duty | "No captain nearby" after about 45 s |
| 5 | Captain A declines | captain B gets the offer |
| 6 | Captain A lets the offer time out | the next captain or round gets it after 15 s |
| 7 | A and B tap Accept at the same moment | exactly one wins; the other sees "Ride taken" |
| 8 | Captain with no active pass taps on duty | blocked with an honest message |
| 9 | Captain not yet approved | cannot go on duty; sees the application state |
| 10 | Captain more than 6 km away | never receives the offer |
| 11 | Rider cancels while searching | the offer disappears on the captain's phone |
| 12 | Rider cancels after a captain is assigned | the captain is told and becomes available again |
| 13 | Captain cancels after accepting | the rider sees "Finding another captain"; the other captain gets the offer |
| 14 | Wrong OTP five times | locked; the rider can cancel; Operations can cancel |
| 15 | Arrived tapped 1 km from the pickup | refused: "You are not at the pickup yet" |
| 16 | Captain screen off for 10 minutes on duty | pings continue; an offer still arrives as a push with sound |
| 17 | Captain app swiped away | after 2 minutes without pings, duty ends; reopening shows "You went off duty" |
| 18 | Airplane mode for 60 s during a trip | both apps recover to the correct state |
| 19 | Rider app killed during a trip | reopening lands on the live ride |
| 20 | Location permission denied | an honest blocking screen, with a way to open settings |
| 21 | Pass bought in Razorpay test mode | active at once; time left is shown |
| 22 | Pass payment fails, then a retry | no double charge; the retry activates it |
| 23 | Pass expires | the captain cannot go on duty; a ride already in progress finishes |
| 24 | Captain waits past the free minutes before the start | the waiting charge appears in the final fare |
| 25 | Rider taps SOS | the Operations SOS queue shows it within 10 s; Resolve works |
| 26 | Rider taps Share | the share sheet shows the right captain and vehicle |
| 27 | Phone numbers after the ride ends | neither side can see the other's number any more |
| 28 | Operations changes a rate card | new quotes use it; existing rides keep their fare |
| 29 | Operations force-cancels a ride | both apps update within 5 s |
| 30 | Both sides rate | each can rate once only |
| 31 | History | both apps show the same fares as Operations |
| 32 | A low-end Android phone (2 GB RAM) | the whole flow works without crashes |

### 7.4 Road test (Day 7)

Do five real rides in the 500032 area. For each ride, record the vehicle type, quoted fare,
distance, trip time, the pickup ETA shown against the real one, any GPS gap longer than 15 s,
the captain phone's battery use per hour, and any problem.

### 7.5 Test report (paste into the PR)

```markdown
## Test report: Rides V1

### Automated
| Command | Result (paste the summary line) |
|---|---|
| pytest tests/rides -q | |
| pytest tests/rides --cov=apps/rides --cov-branch | coverage: __% |
| pytest tests/partners tests/commerce tests/notifications -q | |
| quality-static.cmd | |
| captain-mobile lint / typecheck / test | |
| customer-mobile lint / typecheck / test | |
| admin lint / typecheck / test | |
| pnpm contract:check | |

### Device checklist (§7.3)
| # | Result (pass/fail) | Evidence (screenshot/video) | Bug / fix commit |
|---|---|---|---|

### Road test (§7.4)
| Ride | Vehicle | Quote | Distance | Time | ETA shown vs real | GPS gaps | Battery/h | Notes |
|---|---|---|---|---|---|---|---|---|

### Known issues left open
-
```

---

## 8. Definition of done

- [ ] Every item in the §1 "In V1" table works on real phones.
- [ ] ADR-0013 and proposal 0029 are written, current and reviewed.
- [ ] The contract is regenerated, with a CHANGELOG entry, and `pnpm contract:check` is green.
- [ ] `quality-static.cmd` is green.
- [ ] Every rides backend test is green, and `apps/rides` branch coverage is ≥ 85%.
- [ ] The focused partners, commerce and notifications suites are green.
- [ ] Lint, typecheck and test are green for `captain-mobile`, `customer-mobile` and `admin`.
- [ ] All 32 device scenarios pass, with evidence.
- [ ] Five road rides are done and recorded.
- [ ] The Play background-location video is recorded.
- [ ] No file outside §2 changed (check with `git diff --stat origin/main...rapido/v1`).
- [ ] No secrets, `.env` files, keystores or `android/` / `ios/` folders are committed.
- [ ] The PR has the test report, is marked **Ready for review**, and is **not merged**.

---

## 9. What the owner gives you on Day 1

| Item | Why |
|---|---|
| GitHub write access (push to `rapido/v1`; `main` is protected) | your branch |
| Expo / EAS access, and a new EAS project for the Captain app | development builds |
| Google Cloud: an Android Maps SDK key restricted to `com.vsolvehub.captain` and `com.vsolvehub.customer`; Routes API enabled for the server key | maps and fares |
| The partner OneSignal app id and the **Ride requests** Android channel id | ride alerts |
| Razorpay test keys (local `.env` only, never committed) | pass purchase |
| Three Android phones, one of them low-end | the device checklist |
| A tunnel or staging backend URL the phones can reach on the road | the road test |
| 15 minutes at 6:30 pm every day | review and decisions |

---

## 10. Sources: read, learn, explore

These references help you move fast. **Take ideas from all of them. Take code only where the
licence allows, and always rewrite it to our patterns.**

| Source | What to learn from it | Licence and rule |
|---|---|---|
| [asif-khan-2k19/QuickRide](https://github.com/asif-khan-2k19/QuickRide) | the closest to Rapido logic: rider and captain roles, Bike/Auto/Car, real-time location, accept or reject, timeout cancel. Small enough to read in an hour. | MIT. Ideas and small snippets are fine (it uses Node and Socket.IO, so mostly ideas). |
| [adrianhajdin/uber](https://github.com/adrianhajdin/uber) and its YouTube walkthrough | rider screens in **our** stack: Expo, Google Maps, place search, ride selection | No licence: learn only, copy nothing. Its drivers are fake, which is forbidden here. |
| [testdriven.io: Real-time Taxi App with Django Channels and React](https://testdriven.io/courses/taxi-react/) | the rider/driver trip lifecycle on **our** backend (Django, DRF, Postgres, Redis) | Paid course (about $45, about 12 h). Ask the owner before buying. We use REST polling, not Channels. |
| [erkandem/tdd-react-django-taxi](https://github.com/erkandem/tdd-react-django-taxi) | a community build of that course: trip models and driver groups in Django | No licence: learn only, copy nothing. |
| [nammayatri/nammayatri](https://github.com/nammayatri/nammayatri) | India's open ride platform: auto fares, driver daily plans, dispatch rules, open-data dashboard | **AGPL-3.0: read only, never copy code.** Copying AGPL code into VSolve Hub could force us to publish our whole source. |
| [SaiKrishnaMulukutla/uber](https://github.com/SaiKrishnaMulukutla/uber) | Redis GEO matching, the trip state machine, WebSocket tracking (we poll instead) | Go. An architecture reference. |
| [kevinmichaelchen/api-dispatch](https://github.com/kevinmichaelchen/api-dispatch) | H3 cells and a distance matrix for "drivers near a rider" | Go, a proof of concept. Ideas only. |
| [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/) | background updates, `foregroundService` options, permissions | Official documentation |
| [Expo TaskManager](https://docs.expo.dev/versions/latest/sdk/task-manager/) | define the background task at module scope | Official documentation |
| [Expo blog: a resilient activity tracker](https://expo.dev/blog/how-to-build-a-resilient-activity-tracker-with-expo) | keeping location alive across app kills | Official blog |
| [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) | the `location` type, `FOREGROUND_SERVICE_LOCATION`, the Android 14 rules, the Play declaration | Official documentation |
| [Google Play: background location policy](https://support.google.com/googleplay/android-developer/answer/9799150) | what the disclosure screen and the review video must show | Official policy |
| [react-native-maps](https://github.com/react-native-maps/react-native-maps) | MapView, Marker, Polyline, the Google provider on Android | MIT |
| [Google Routes API: computeRoutes](https://developers.google.com/maps/documentation/routes/compute_route_directions) and [two-wheeler routes](https://developers.google.com/maps/documentation/routes/route_two_wheel) | distance, duration and polyline; the field mask; `TWO_WHEELER` for bikes | Official documentation. Always send a field mask; never `*` in production. |
| [Redis GEOSEARCH](https://redis.io/docs/latest/commands/geosearch/) | nearest captains within a radius | Official documentation |

**Looked at and rejected (do not spend time on these):**
- [noahlevenson/passerby](https://github.com/noahlevenson/passerby): a peer-to-peer location
  protocol with no central server, not a ride app.
- [Autofleet/locomotion](https://github.com/Autofleet/locomotion): a rider app that needs
  Autofleet's paid dispatch engine.
- CodeCanyon kits (Ridy, Tagxi, BetterTaxi): paid, and built on Flutter and Laravel, not our
  stack.

**Explore freely.** You may look at any other repository, article or video. The rules: ideas are
always fine; code only from MIT, Apache-2.0 or BSD sources, rewritten to our patterns, with a
comment naming the source; never copy from GPL, AGPL or unlicensed code; never buy a kit. Add
anything useful to the ADR's References section.

---

## 11. When you are stuck

- **Stuck on setup for more than 20 minutes:** ask. `CONTRIBUTING.md` is more likely to be wrong
  than you are.
- **This brief and the existing code disagree:** follow the existing code's pattern, note it in
  the ADR, and raise it at the 6:30 demo.
- **You need a file outside §2:** do not touch it. Write it under **Needs owner** in the PR.
- **Working with an AI assistant:** at the start of every session, give it this file, the root
  `AGENTS.md` and `frontend/mobile/AGENTS.md`, and tell it: *"The Rides owner directive in
  docs/rapido/README.md applies, including §5.12 and §7.1."* Review every diff yourself before
  committing.

---

## Appendix A: AGENTS.md pointer

Add this section to the root `AGENTS.md`, just before `## Python environment`, in your first
commit on Day 1:

```markdown
### Rides V1 (Rapido) — owner directive, 5 November 2026

The owner assigned VSolve Rides V1 (bike, auto and cab rides) to the **Rides developer**,
backend and frontend, on branch `rapido/v1` only — never `main`. The complete brief, ownership
list, registration points, mobile exceptions and test authorization are in
`docs/rapido/README.md`. Any agent working on Rides reads it before its first edit; for Rides
work it overrides the conflicting lines in this file and in `frontend/mobile/AGENTS.md`
(screens with no web original, background location in the Captain app only, and the Rides test
commands the developer is authorized to run). Outside Rides, this file is unchanged.
```

## Appendix B: PR description template

```markdown
# Rides V1

Brief: docs/rapido/README.md · ADR: docs/adr/0013-rides-v1.md · Contract: contracts/proposals/0029-rides-v1.md

## Daily progress
- [ ] Day 1: setup, ADR + proposal, models + migrations, Captain scaffold, dev builds queued
- [ ] Day 2: fares, quotes, rate cards, passes, duty, location, seed command
- [ ] Day 3: rides engine, dispatch, offers, lifecycle, cancels, ratings, SOS, Operations API
- [ ] Day 4: Captain app part 1 (sign-in, onboarding, duty + background GPS, pass, offers)
- [ ] Day 5: Captain app part 2 + Rider part 1; first two-phone ride
- [ ] Day 6: Rider part 2 + Operations console; scenarios 1–20
- [ ] Day 7: full checklist, 5 road rides, fixes, Play video, test report

## Definition of done
(paste §8 here and tick it)

## Needs owner
-

## Test report
(paste §7.5 here on Day 7)
```
