# VSolve Rides: finish V1, then Taxi (Rental, Outstation, Book for later). Your build brief

- Owner decides everything in this brief. You build it.
- Branch: **`taxi/v1`**, cut from `parcel/v1` (`95cebc50`). From now on this is
  your only branch: it holds Rides V1, Pick up & Drop and Taxi.
- **Two parts, in this order.** Part A finishes and fixes what is already built. Part B adds Taxi.
  Then the owner reviews.
- **Rides, Pick up & Drop and Taxi ship together, in one app update.** Nothing launches before all
  three are done.

Taxi is **not** a new app, tile or engine. It is the Rides screen you already built, with three tabs
(**Ride · Rental · Outstation**), a **Now / Later** choice, and five more vehicle types.

---

## Contents

0. Read this first
- **Part A: finish Rides and Pick up & Drop**
  - A1. Merge `main` and renumber
  - A2. Captain GPS with the screen off
  - A3. Rides push notifications on the Expo path
  - A4. Daily Pass per vehicle, and the launch offer
  - A5. Release preparation
  - A6. Rides and Pick up & Drop test report
- **Part B: Taxi**
  1. What you build
  2. Decisions (all made, do not change them)
  3. How it works, end to end
  4. Backend
  5. Customer app
  6. Partner app (captain)
  7. Operations console
- 8. Where you may write
- 9. Git rules for this branch
- 10. Order of work
- 11. Testing
- 12. Definition of done

---

## 0. Read this first

1. **Every product decision is already made (§2 and Part A).** Do not choose a different field,
   state, price rule, label or flow. If something you need is not here, do not decide it yourself:
   write it in the PR description under **Needs owner** and tell the owner.
2. **The Rides and Pick up & Drop briefs still apply** (`docs/rapido/README.md`,
   `docs/parcel/README.md`). Their rules are your rules: Django decides everything, money is integer
   paise on the server, no fake data, never hand-edit the contract or the generated client, every
   state change is authorized, audited and idempotent, side effects go through the outbox and
   Celery, never log codes, phone numbers or exact locations, and every feature ships with tests.
3. **No new native modules in Part B.** Everything in Part B is JavaScript and backend, so it needs
   no new store build after Part A's. In particular: **no native date picker** (build the Later
   picker in JavaScript, §5.2), no new maps or location library.
4. **You never run `eas build` or `eas update`.** The owner builds. You prepare the build (A5).
5. **Numbers.** After the merge of `main`: Rides V1 is contract **`1.118.0`**, Pick up & Drop
   **`1.119.0`**, Taxi **`1.120.0`**. ADRs: Rides `0014`, Pick up & Drop `0015`, Taxi **`0016`**.
   Migrations: Part A adds `rides/0008_pass_plan_vehicle`, Part B adds `rides/0009_taxi`. If `main`
   moves past `1.117.0` before the owner merges, renumber again in the same way.
6. **The source sheet** (`V Solve Hub-Categories & Sub Categories (2).xlsx`, Vehicle Services) lists
   only names. Every price, rule and screen below was decided by the owner.

---

# Part A: finish Rides and Pick up & Drop

Do Part A first. Part B starts only when Part A's checks are green.

### A1. Merge `main` and renumber

`taxi/v1` is 30 commits behind `main` (`28e39022`, contract `1.117.0`).

1. `git merge origin/main` (merge, never rebase). Resolve conflicts keeping both sides' intent.
   `main` removed Firebase sign-in (contract `1.117.0`): keep that removal, so
   `@react-native-firebase/auth` and every Firebase sign-in screen stay deleted.
2. Renumber in `contracts/openapi/CHANGELOG.md`: `## 1.111.0 - Rides V1` becomes
   `## 1.118.0 - Rides V1`, `## 1.112.0 - Pick up & Drop V1` becomes `## 1.119.0 - Pick up & Drop V1`.
   `SPECTACULAR_SETTINGS["VERSION"]` = `1.119.0`. Fix the numbers in ADR 0014 and 0015 and in
   `docs/rapido/README.md` §0 and `docs/parcel/README.md` §0.
3. Regenerate the contract and client (`pnpm contract:generate`), then all of:
   `manage.py check`, `makemigrations --check --dry-run`, `pnpm contract:check`, typecheck and lint
   for `partner-mobile`, `customer-mobile`, `admin`, `customer`, and `pytest tests/rides
   tests/partners tests/notifications tests/mobile`. Paste the results in the PR.

### A2. Captain GPS with the screen off

**Bug.** `frontend/mobile/apps/partner/app.config.ts` turns on the location foreground service
(`expo-location` → `isAndroidForegroundServiceEnabled: true`) but also lists
`FOREGROUND_SERVICE_LOCATION` in `android.blockedPermissions`. On Android 14 and later a location
foreground service without that permission fails, so "on duty" stops sending pings when the screen
turns off.

**Fix.** Remove `"FOREGROUND_SERVICE_LOCATION"` from `blockedPermissions`. Keep
`ACCESS_BACKGROUND_LOCATION`, `RECORD_AUDIO` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` blocked. Rewrite
the comment above the list: location is used while the app is open and, for on-duty captains, by the
"You're on duty" foreground service (Rides brief §5.13). This is a native change: it reaches phones
with the owner's build (A5).

### A3. Rides push notifications on the Expo path

**Bug.** When `MOBILE_PUSH_PROVIDER` is unset or `expo`, `_deliver_by_expo`
(`backend/apps/mobile/services.py`) asks `push_templates.py` for copy. The `rides_*` and `parcel_*`
codes have none, so `UnknownPushTemplateError` is raised and `sweep_pending_push_intents` stops on
the first one, every run, which blocks every later push for everyone. (Production uses OneSignal,
which skips them; local and staging break.)

**Fix.** A push intent whose code has no template is marked **failed** with reason
`unknown_template`, logged once with the code only, and the sweep goes on to the next intent. Do
**not** add rides copy to `push_templates.py` (OneSignal would then send twice). Regression test in
`backend/tests/mobile/test_push_unknown_template.py`.

### A4. Daily Pass per vehicle, and the launch offer

Today any captain can buy any active pass plan. The sheet's Rides tab asks for a price per vehicle
and a launch offer, editable by Operations without code changes.

- `CaptainPassPlan.vehicle_type`: nullable; empty means every vehicle type.
- `CaptainPassPlan.max_trips`: nullable; empty means no trip limit. A pass with a limit ends after
  the trip that reaches it (completed rides and delivered or returned parcels count). It never ends
  an open trip.
- A captain sees and can buy only plans for their own vehicle type plus plans for every vehicle
  (`409 plan_not_for_vehicle` otherwise).
- Operations › Rides › Pass plans: vehicle type (or All) and Max trips (or none) on create and edit.
- `seed_rides_demo`, as **PLACEHOLDER** plans: Launch offer ₹0, 720 hours, 100 trips, every vehicle;
  Day pass Bike ₹19, Auto ₹29, Cab ₹49, 24 hours. (Part B adds the new vehicles' day passes.)
- Migration `rides/0008_pass_plan_vehicle`. Test file `tests/rides/test_pass_plan_vehicle.py`.

### A5. Release preparation

1. App versions: partner `1.2.0` → **`1.3.0`**, customer `1.0.0` → **`1.1.0`** (both use
   `runtimeVersion: appVersion`, so this keeps an `eas update` from `main` off phones that have the
   Rides native modules).
2. Write in the PR, under **Owner actions**: add the EAS secret `GOOGLE_MAPS_ANDROID_API_KEY` to the
   customer EAS project; make development builds of both apps from `taxi/v1` for testing.
3. Google Play needs a **foreground service declaration (location)** for the partner app. Record a
   short screen video on a test phone: sign in as a captain → go on duty → lock the screen → an offer
   arrives with sound. Write the declaration text (what the service does, why it cannot wait until
   the app is open). Put both in the PR for the owner to submit.

### A6. Rides and Pick up & Drop test report

When the owner's test builds are on the phones: run the device checklists and road tests
of both earlier briefs (Rides §7.3–7.5, Pick up & Drop §11.2–11.4) and paste the results, with the
captain-GPS-screen-off check from A2, into the PR. Anything that fails is fixed before Part B.

---

# Part B: Taxi

## 1. What you build

| Area | What ships |
|---|---|
| Vehicles | Five more: **EV Cab, Premium, SUV, Innova, Tempo Traveller**, next to Bike, Auto and Cab. |
| Customer (Customer app, Android + iOS) | The Ride screen gets three tabs, **Ride · Rental · Outstation**, and a **Now / Later** pill. Ride: the V1 flow with more vehicles. Rental: 2, 4 or 8 hours, no destination. Outstation: one way or round trip at a fixed price. Booked trips show at the top of Your rides. Rentals show time and km used, and extras on the bill. |
| Captain (Partner app, Rides, Android) | The new vehicle types in the Vehicle step; one extra line on the offer card; "Pickup at {time}" on a booked trip; rental time and km on the trip screen; extras on the end screen. |
| Backend | the five vehicle types, kinds `RENTAL` and `OUTSTATION` with their rate cards, booked trips (`BOOKED` state and the scheduler), rental extras from the GPS track, outstation fixed fares, availability and Operations APIs. |
| Operations console | rate cards for Rental and Outstation, a Booked filter on the Rides list, the new fields on the ride detail, day passes for the new vehicles. |
| Testing | backend tests, app tests, device checklist, three road trips, a written test report. |

Do not build anything that is not in this brief: no goods transport, no self-drive rental, no bike or
auto rentals, no booking several vehicles at once, no corporate billing, no online payment, no
cancellation fees, no night charges, no odometer photos, no special airport rules, no booking
Pick up & Drop for later, no stops on the Ride tab, no toll calculation.

## 2. Decisions (all made, do not change them)

| # | Decision |
|---|---|
| D1 | **One Ride screen, three tabs:** Ride · Rental · Outstation, Ride selected first. The Home card (Pick up & Drop → Ride) is unchanged. Code names: `RideKind.RENTAL`, `RideKind.OUTSTATION`. |
| D2 | **Vehicle types** (`VehicleType`, codes at most 8 characters): `EV_CAB` "EV Cab", `PREMIUM` "Premium", `SUV` "SUV", `INNOVA` "Innova", `TEMPO` "Tempo Traveller". |
| D3 | **Which vehicle on which tab:** Ride: Bike, Auto, Cab, EV Cab, Premium, SUV, Innova. Rental: Cab, EV Cab, Premium, SUV, Innova, Tempo Traveller. Outstation: Cab, Premium, SUV, Innova, Tempo Traveller. Pick up & Drop unchanged (Bike, Auto). A database check constraint on the rate card enforces this. |
| D4 | **What each vehicle type means**, checked by Operations at captain approval (the existing review): EV Cab = an electric car; Premium = a sedan Operations accepts as premium; SUV = 6 or more seats; **Innova = a Toyota Innova, Innova Crysta or Innova Hycross only**; Tempo Traveller = 12 or more seats. The captain picks the type in the Vehicle step; Operations may change it before approving. |
| D5 | **Matching is by exact vehicle type.** A Premium captain gets Premium trips only, an EV Cab captain EV Cab trips only. |
| D6 | **Now / Later** on all three tabs (not on Pick up & Drop). Later: from 60 minutes after now to 7 days ahead, in 15-minute steps. A rider may have at most **3** booked trips at a time. |
| D7 | **A booked trip** is state `BOOKED`. It does not count as an open ride, so the rider can still ride now. At **pickup time − 60 minutes** it starts searching with the normal dispatch. With no captain, the search starts again every **3 minutes** until **15 minutes before pickup**; then it ends `NO_CAPTAIN_FOUND` and the rider is told, as in Rides. |
| D8 | **A captain who accepts a booked trip** is assigned at once (`CAPTAIN_ASSIGNED`); their current-trip card says "Pickup at {time}". **Free waiting at the pickup starts at the booked pickup time**, not at arrival, so arriving early costs the rider nothing. |
| D9 | **Cancelling:** free while `BOOKED` or `SEARCHING`. After a captain is assigned, the Rides V1 rules. No fees anywhere. |
| D10 | **Rental packages:** **2 h / 20 km, 4 h / 40 km, 8 h / 80 km** (10 km per hour). No destination: the rider stops wherever they like and the trip ends where they say. |
| D11 | **Rental price** = the package price on the rental card. After the package: **extra km × the card's extra-km rate** and **extra minutes × the extra-minute rate** (per started minute). Time runs from the start code to End trip. Km come from the ride's GPS track (`RideTrackPoint` between start and end; points with accuracy over 50 m are skipped; whole km, rounded down). Waiting at the pickup as in Rides. No odometer photos. |
| D12 | **Outstation** needs a drop at least **40 km by road** from the pickup (`422 outstation_too_short`: "For trips under 40 km, use Ride."). **One way** or **Round trip**. |
| D13 | **Outstation price, fixed upfront, never re-priced by GPS:** one way = max(card minimum, road km × one-way rate). Round trip = max(2 × road km, 250 × days) × round-trip rate, where days = calendar days from the leaving date to the return date, both counted (Asia/Kolkata). The **driver allowance is inside the rates**. Plus waiting at the pickup as in Rides. |
| D14 | **Round trip return time:** required, after the pickup time, at most 7 days after it. |
| D15 | **Tolls, parking, state permits and airport entry** are never in our fare: the rider pays them on the way. Every Ride and Outstation price list shows: "Tolls, parking and airport entry are paid by you." |
| D16 | **Airport has no special rule.** It is a normal destination on the Ride tab, Now or Later. |
| D17 | **Payment:** cash or UPI to the captain, as in Rides. **Revenue:** the captain's Daily Pass only. A pass that expires during an open trip never stops it (already true in V1). |
| D18 | **Day pass prices for the new vehicles** (PLACEHOLDER in the seed; Operations sets the real ones): EV Cab ₹49, Premium ₹69, SUV ₹69, Innova ₹79, Tempo Traveller ₹99. |
| D19 | **The tabs follow availability:** Rental shows only where the area has an active rental card, Outstation only where it has an active outstation card. Ride shows as in V1. |
| D20 | **Corporate Taxi and Wedding Guest Transportation have no screen of their own:** they are any tab booked Later, and Rental with an Innova or Tempo Traveller. |

**Sheet coverage, for your reference:**

| Sheet row (Vehicle Services) | Where it lives |
|---|---|
| Ride Booking: Bike Ride, Auto Ride, Taxi Ride, Premium Cab Ride, EV Ride | Ride tab: Bike, Auto, Cab, Premium, EV Cab |
| Taxi Services: Local Taxi | Ride tab, Cab |
| Airport Pickup Taxi, Airport Drop Taxi | Ride tab, Now or Later |
| Hourly Taxi Booking, Full Day Taxi Booking | Rental tab: 2 h, 4 h / 8 h |
| Outstation One Way Taxi, Outstation Round Trip Taxi | Outstation tab |
| Premium Taxi, SUV Taxi, Innova Taxi, Tempo Traveller Taxi | the vehicle types |
| Corporate Taxi, Wedding Guest Transportation | D20 |
| Vehicle Rental: Car Rental (With Driver), Wedding Car Rental, Tempo Traveller Rental | Rental tab |

**Starting prices** (PLACEHOLDER rate cards in `seed_rides_demo`; Operations sets the real ones):

| Vehicle | Rental 2 h / 4 h / 8 h | Rental extra | Outstation one way / round trip (per km) |
|---|---|---|---|
| Cab, EV Cab | ₹449 / ₹849 / ₹1,599 | ₹12/km · ₹2/min | ₹15 / ₹12 |
| Premium | ₹549 / ₹999 / ₹1,899 | ₹14/km · ₹2/min | ₹17 / ₹14 |
| SUV | ₹599 / ₹1,099 / ₹1,999 | ₹15/km · ₹3/min | ₹20 / ₹16 |
| Innova | ₹799 / ₹1,399 / ₹2,499 | ₹18/km · ₹3/min | ₹23 / ₹19 |
| Tempo Traveller | not offered / ₹2,299 / ₹3,999 | ₹25/km · ₹4/min | ₹30 / ₹25 |

Outstation one-way minimum = 40 km × the one-way rate. Round trip: at least 250 km a day. Ride-tab
cards for the new vehicles: EV Cab copies the Cab card; Premium, SUV and Innova are the Cab card's
prices × 1.15, × 1.30 and × 1.50, rounded to the rupee.

## 3. How it works, end to end

### 3.1 States

| Ride state | Meaning | Next |
|---|---|---|
| `BOOKED` (new) | booked for later, no search yet. Not an open ride, not tracked. | `SEARCHING` (at pickup − 60 min), `CANCELLED` (rider or Operations) |
| `SEARCHING` … `CANCELLED` | as in Rides and Pick up & Drop | as today |

A booked trip starts searching only when the rider has no other open ride; while they do, the
scheduler checks again every minute until 15 minutes before pickup, then ends it `NO_CAPTAIN_FOUND`
with reason `rider_busy`.

### 3.2 Money

| Kind | Quote | Final fare |
|---|---|---|
| `RIDE` | V1 fare engine, any Ride-tab vehicle | quote + pickup waiting (V1) |
| `RENTAL` | the package price | package + extra km + extra minutes + pickup waiting (D11) |
| `OUTSTATION` | D13 | quote + pickup waiting |

The ride keeps the lines for the bill: `fare_paise` (the quote), `waiting_paise`, and for rentals
`extra_km`, `extra_minutes`, `extras_paise`. `final_fare_paise` = fare + waiting + extras.

## 4. Backend

All of it in `backend/apps/rides/` and `backend/tests/rides/`. One migration, `rides/0009_taxi`.

### 4.1 Data

- `VehicleType` gains `EV_CAB`, `PREMIUM`, `SUV`, `INNOVA`, `TEMPO` (D2). `CaptainVehicle` uses the
  same choices.
- `RideKind` gains `RENTAL`, `OUTSTATION`.
- `RideState` gains `BOOKED`. It is **not** in `OPEN_RIDE_STATES` or `TRACKED_RIDE_STATES`.
- `RideRateCard`, new nullable fields: `rental_2h_paise`, `rental_4h_paise`, `rental_8h_paise`,
  `round_trip_per_km_paise`, `round_trip_min_km_per_day`. What each price field means, per kind:

  | Field | `RIDE` | `RENTAL` | `OUTSTATION` |
  |---|---|---|---|
  | `base_fare_paise`, `included_distance_m` | as V1 | 0 | 0 |
  | `per_km_paise` | as V1 | **extra km** rate | **one-way** rate |
  | `per_minute_paise` | as V1 | **extra minute** rate | 0 |
  | `minimum_fare_paise` | as V1 | 0 | one-way minimum |
  | `free_waiting_minutes`, `waiting_per_minute_paise` | as V1 | pickup waiting | pickup waiting |
  | `rental_2h/4h/8h_paise` | empty | at least one set; empty = package not offered | empty |
  | `round_trip_per_km_paise`, `round_trip_min_km_per_day` | empty | empty | required |

  Check constraints: the D3 vehicle/kind pairs; the fields above per kind; rewrite the two parcel
  constraints so they still hold with four kinds. "One active card per area, vehicle and kind" stays.
- `FareQuote` and `Ride`, new fields: `pickup_at` (nullable; empty = now), `rental_hours`
  (nullable; 2, 4 or 8), `round_trip` (default false), `return_at` (nullable). `drop_*` become
  nullable, **empty only for `RENTAL`** (check constraint). A rental quote stores `distance_m` =
  included km × 1000, `duration_s` = hours × 3600, an empty polyline.
- `Ride`: `extra_km`, `extra_minutes`, `extras_paise` (nullable; rentals only, set at End trip).
  Check: `BOOKED` needs `pickup_at`.
- Settings, inside the one `RIDES_*` block: `RIDES_BOOKED_LEAD_MINUTES = 60`,
  `RIDES_BOOKED_RETRY_SECONDS = 180`, `RIDES_BOOKED_SEARCH_UNTIL_MINUTES = 15`,
  `RIDES_BOOK_AHEAD_MAX_DAYS = 7`, `RIDES_BOOK_AHEAD_STEP_MINUTES = 15`,
  `RIDES_MAX_BOOKED_PER_RIDER = 3`, `RIDES_RENTAL_HOURS = [2, 4, 8]`,
  `RIDES_RENTAL_KM_PER_HOUR = 10`, `RIDES_OUTSTATION_MIN_KM = 40`,
  `RIDES_OUTSTATION_MAX_TRIP_DAYS = 7`, `RIDES_TRACK_MAX_ACCURACY_M = 50`.

### 4.2 Fares (`fares.py`)

- `rental_fare_paise(card, hours)`: the package price; `rental_extras(card, *, hours, used_seconds,
  used_metres)` returns `(extra_km, extra_minutes, extras_paise)`.
- `outstation_fare_paise(card, *, road_metres, round_trip, days)`: D13, rounded half up to the
  rupee like `trip_fare_paise`.
- `track_metres(ride)`: sum of distances between consecutive `RideTrackPoint`s from `started_at` to
  `completed_at`, skipping points with accuracy over `RIDES_TRACK_MAX_ACCURACY_M`.
- Waiting: for a booked trip, waited time counts from `max(captain_arrived_at, pickup_at)` (D8).

### 4.3 Booked trips (`engine.py`, `tasks.py`)

- New Celery beat task `start_booked_rides`, every 60 s: each `BOOKED` ride with
  `pickup_at − RIDES_BOOKED_LEAD_MINUTES ≤ now` moves to `SEARCHING` (a `RideTransition`, actor
  `SYSTEM`) and its round 1 is scheduled, unless the rider has another open ride (§3.1).
- When the last dispatch round of a ride with `pickup_at` finds no captain and
  `now < pickup_at − RIDES_BOOKED_SEARCH_UNTIL_MINUTES`, reset `dispatch_round` and schedule round 1
  again after `RIDES_BOOKED_RETRY_SECONDS`; otherwise `NO_CAPTAIN_FOUND` as in V1.
- `complete_trip` for `RENTAL`: computes the extras (§4.2), sets the three fields and
  `final_fare_paise`. `OUTSTATION` ends exactly like `RIDE`.

### 4.4 API (contract `1.120.0`)

Customer:

| Endpoint | Change |
|---|---|
| `GET /rides/availability/` | adds `rental`: `[{vehicle_type, packages: [{hours, km, price_paise}]}]`, `outstation`: `[vehicle_type]`, and `book_ahead`: `{min_minutes, max_days, step_minutes}`. |
| `POST /rides/quotes/` | `kind` may be `RENTAL` (needs `rental_hours`, no drop) or `OUTSTATION` (needs a drop, `round_trip`, and `return_at` when round trip). Optional `pickup_at` for `RIDE`, `RENTAL`, `OUTSTATION`. Errors: `422 book_ahead_not_allowed` (parcel), `422 invalid_pickup_time` (D6), `422 invalid_return_time` (D14), `422 outstation_too_short` (D12), `422 rental_package_unavailable`. A rental quote adds `included_km`, `extra_km_paise`, `extra_minute_paise`; an outstation quote adds `billed_km` and `days`. |
| `POST /rides/` | a quote with `pickup_at` creates a `BOOKED` ride; `409 too_many_booked` over D6's limit. |
| `GET /rides/booked/` | new. The rider's `BOOKED` trips, soonest first. |
| `GET /rides/{id}/` and history | add `kind`, `pickup_at`, `rental_hours`, `round_trip`, `return_at`, `search_starts_at` (booked only), a `rental` block `{hours, included_km, used_minutes, used_km}` while a rental is in trip, and `fare_lines`: fare or package, waiting, extra km, extra time. |
| `POST /rides/{id}/cancel/` | allowed in `BOOKED` (free). |

Captain:

| Endpoint | Change |
|---|---|
| offers, `GET /partner/rides/current/` | add `kind`, `pickup_at`, `rental_hours`, `round_trip`, `return_at`; the drop is empty for a rental; the `rental` block and `fare_lines` as above. |
| `POST /partner/rides/{id}/complete/` | for a rental, computes the extras (§4.3). |
| Vehicle step and `CaptainStatus` | the new vehicle types. |
| pass plans | only plans for the captain's vehicle type or for every vehicle (A4). |

Operations:

| Endpoint | Change |
|---|---|
| `GET /operations/rides/` | `kind` filter adds `RENTAL`, `OUTSTATION`; `booked=true` (state `BOOKED`, or `SEARCHING` with `pickup_at`). |
| `GET /operations/rides/{id}/` | adds the new ride fields, the rental usage and `fare_lines`. |
| rate cards | kinds `RENTAL` and `OUTSTATION` with their fields; the D3 pairs (`409 vehicle_not_allowed_for_kind`). |
| captains | Operations can change a captain's vehicle type before approval. |

### 4.5 Notifications

No new codes. Booked trips use the existing `rides_*` notices from the moment they start searching.

### 4.6 Design records

- `docs/adr/0016-taxi.md`, short: status, two lines of context, "Decision: see
  `docs/taxi/README.md` §2 (D1–D20)", consequences.
- One `contracts/openapi/CHANGELOG.md` entry, `## 1.120.0 - Taxi: Rental, Outstation, Book for
  later`, listing every change in §4.4 with its error codes.

## 5. Customer app

Routes under `app/(tabs)/rides/`, screens under `src/features/rides/`. Reuse the Rides search, map
and ride screen. New vehicle icons go in `vehicle-icons.tsx` with `react-native-svg`, like the
others: EV Cab and Premium use the Cab icon, SUV and Innova a new SUV icon, Tempo Traveller a new van
icon. Names in `vehicles.ts`.

### 5.1 Ride screen with the tabs

```
┌──────────────────────────────────────┐
│ ←  Ride                              │
│                                      │
│  [ Ride ]   Rental   Outstation      │  ◄ tabs (D1, D19)
│                                      │
│  ┌─────────────┐                     │
│  │ ◷ Now   ▾   │                     │  ◄ Now / Later (D6)
│  └─────────────┘                     │
│  ● Your location                     │
│  ┌────────────────────────────────┐  │
│  │ ■  Where to?                   │  │
│  └────────────────────────────────┘  │
│  RECENT                              │
│  ⌖ Rajiv Gandhi Intl Airport         │
└──────────────────────────────────────┘
```

### 5.2 Later picker (a sheet, JavaScript only)

Day chips for today and the next 7 days, then a list of times in 15-minute steps, limited by
`availability.book_ahead`.

```
┌──────────────────────────────────────┐
│  When?        ( Now )  [ Later ]     │
│   Today  Tomorrow  Sat 28  Sun 29  › │
│          ════════                    │
│          ▲   05:45 AM   ▼            │
│  We assign your captain 1 hour       │
│  before. Free to cancel until then.  │
│  [            Done                ]  │
└──────────────────────────────────────┘
```

### 5.3 Ride tab: choose vehicle (the V1 screen)

```
┌──────────────────────────────────────┐
│ ←  Gachibowli → RGI Airport          │
│    Later · Sun 29 · 5:45 AM      ✎   │
│ ┌──────────── map · route ─────────┐ │
│ └──────────────────────────────────┘ │
│  ○ Bike                       ₹289   │
│  ○ Auto                       ₹449   │
│  ● Cab                        ₹649   │
│  ○ EV Cab                     ₹649   │
│  ○ Premium                    ₹749   │
│  ○ SUV                        ₹849   │
│  ○ Innova                     ₹999   │
│  Tolls, parking and airport entry    │
│  are paid by you.                    │
│  Pay the captain · Cash or UPI       │
│  [       Book Cab · ₹649          ]  │
└──────────────────────────────────────┘
```

### 5.4 Rental tab

```
┌──────────────────────────────────────┐
│     Ride   [ Rental ]   Outstation   │
│  ◷ Now ▾      Pickup  Gachibowli ✎   │
│   [ 2 h ]    ( 4 h )    [ 8 h ]      │
│    20 km      40 km      80 km       │
│  ● Cab                      ₹849     │
│  ○ EV Cab                   ₹849     │
│  ○ Premium                  ₹999     │
│  ○ SUV                    ₹1,099     │
│  ○ Innova                 ₹1,399     │
│  ○ Tempo Traveller        ₹2,299     │
│  After 4 h / 40 km: ₹12/km, ₹2/min   │
│  Stop as many times as you like.     │
│  [       Book Cab · ₹849          ]  │
└──────────────────────────────────────┘
```

A vehicle whose card does not offer the chosen package is not listed.

### 5.5 Outstation tab

```
┌──────────────────────────────────────┐
│     Ride    Rental   [ Outstation ]  │
│  From  Gachibowli                ✎   │
│  To    Warangal                  ✎   │
│   [ One way ]   ( Round trip )       │
│  Leave  Sat 28 · 6:00 AM         ✎   │
│  ● Cab                    ₹2,175     │
│  ○ Premium                ₹2,465     │
│  ○ SUV                    ₹2,900     │
│  ○ Innova                 ₹3,335     │
│  ○ Tempo Traveller        ₹4,350     │
│  Fixed price. Driver allowance       │
│  included. Tolls, parking and permit │
│  paid by you on the way.             │
│  [      Book Cab · ₹2,175         ]  │
└──────────────────────────────────────┘
```

Round trip adds a **Return** row (D14) and the line "At least 250 km a day."

### 5.6 After booking

- **Booked for later:** the ride screen shows "Booked · {day} · {time}", "We'll find your captain at
  {search_starts_at}", and **Cancel**. It becomes the normal ride screen once a captain accepts.
- **Your rides** (`RideHistoryScreen`): a **Booked** section on top from `GET /rides/booked/`.
- **Rental in trip:** one more line on the ride screen: "{used} of {hours} h · {used_km} of
  {included_km} km".
- **Trip complete:** the bill shows `fare_lines` (package, extra km, extra time, waiting) and the
  total to pay the captain.

```
┌──────────────────────────────────────┐
│            Trip complete             │
│  Rental · Cab · 4 h 35 m · 47 km     │
│  Package 4 h / 40 km          ₹849   │
│  Extra 7 km                    ₹84   │
│  Extra 35 min                  ₹70   │
│  ──────────────────────────────────  │
│  Pay the captain            ₹1,003   │
└──────────────────────────────────────┘
```

## 6. Partner app (captain)

All inside `src/features/rides/` and the existing rides routes.

1. **Vehicle step** (`model/vehicle.ts`, `model/shell.ts`): the five new types, each with a one-line
   hint from D4 ("Innova: Toyota Innova, Innova Crysta or Innova Hycross only").
2. **Offer card**: one line under the title: `RIDE`, `RENTAL {hours} h`, `OUTSTATION · ONE WAY` or
   `OUTSTATION · ROUND TRIP`, plus "· {day} {time}" for a booked trip. A rental shows "Pickup only ·
   {hours} h / {km} km" instead of a drop.
3. **Current trip card**: "Pickup at {time}" for a booked trip.
4. **Trip screen**: for a rental, "{used} of {hours} h · {used_km} of {included_km} km"; End trip
   shows `fare_lines` and the total to collect.
5. **Wallet**: only the pass plans for the captain's vehicle (A4).

```
┌──────────────────────────────────────┐
│  NEW TRIP                   ⏱ 0:15   │
│  OUTSTATION · ONE WAY · Sat 6:00 AM  │
│  Gachibowli → Warangal · 145 km      │
│  You get                    ₹2,175   │
│  [  Decline  ]      [   Accept   ]   │
└──────────────────────────────────────┘
```

## 7. Operations console

Under `frontend/apps/admin/features/rides/` and the existing Rides routes.

1. **Rate cards** (`view/rate-cards.tsx`): the list grouped by vehicle; the create form offers
   Ride, Rental, Outstation and Pick up & Drop, and shows only that kind's fields (§4.1). Labels:
   "2 h package", "4 h package", "8 h package", "Extra per km", "Extra per minute", "One way per km",
   "Round trip per km", "Round trip minimum km a day".
2. **Rides list** (`view/ride-list.tsx`): Kind adds Rental and Outstation; a **Booked** filter
   showing pickup time and whether a captain is assigned.
3. **Ride detail** (`view/ride-detail.tsx`): pickup time, package, round trip and return, rental
   usage, `fare_lines`.
4. **Captains**: change the vehicle type before approval.
5. **Pass plans** (`view/pass-plans.tsx`): vehicle type and max trips (A4).
6. **`seed_rides_demo`**: the §2 PLACEHOLDER cards for every vehicle and kind in `hyderabad-500032`,
   the D18 day passes, and one demo captain for each new vehicle type.

---

## 8. Where you may write

The same folders as in Rides (`docs/rapido/README.md` §2) and Pick up & Drop (`docs/parcel/README.md`
§8), plus:

| Path | What |
|---|---|
| `docs/taxi/**`, `docs/adr/0016-taxi.md` | your documents |
| the CHANGELOG lines, ADR 0014/0015 and brief §0 numbers in A1 | renumbering only |

Registration points, these exact changes only:

| File | Allowed change |
|---|---|
| `backend/config/settings/base.py` | the §4.1 `RIDES_*` settings; the `start_booked_rides` entry in `CELERY_BEAT_SCHEDULE`; `SPECTACULAR_SETTINGS["VERSION"]` |
| `backend/apps/mobile/services.py` and `backend/tests/mobile/test_push_unknown_template.py` | A3 only |
| `frontend/mobile/apps/partner/app.config.ts` | A2 (one line out of `blockedPermissions`, the comment) and A5 (version) |
| `frontend/mobile/apps/customer/app.config.ts` | A5 (version) |
| `contracts/openapi/v1.yaml`, `frontend/packages/api-client/src/generated/schema.d.ts` | regenerate only |
| `contracts/openapi/CHANGELOG.md` | A1 renumbering and one `1.120.0` entry |
| the merge of `main` (A1) | conflict resolution only |

Everything else is read-only. If you think another file must change, write it under **Needs owner**.

## 9. Git rules for this branch

```powershell
git fetch origin
git switch taxi/v1
```

- Work only on `taxi/v1`. Never push to `main`, `rapido/v1` or `parcel/v1`. Never force-push.
- You merge `main` once, in A1. After that, merge `main` again only when the owner asks.
- Merge, never rebase. Stage explicit paths only; never `git add -A` or `git add .`.
- Never commit `.env`, keys, `google-services.json`, keystores, `android/`, `ios/`, databases,
  media or screenshots (the A5 video goes in the PR, not in git).
- Commit messages: `fix(rides): …`, `feat(taxi): …`, `test(taxi): …`, `docs(taxi): …`.
- Push your work regularly: `git push origin taxi/v1`.
- **Before you start:** open a Draft pull request `taxi/v1 → main` titled **Rides: rides, Pick up &
  Drop and Taxi**. Move it to Ready for review when §12 is met. The owner merges after the review.

## 10. Order of work

Do the steps in this order. Each step starts only when the one before it is green.

| Step | Work |
|---|---|
| 1 | A1 merge and renumber, all checks green. Draft PR. |
| 2 | A2, A3 (with its test), A4 (with its tests), A5. |
| 3 | Owner puts development builds of both apps from `taxi/v1` on the phones. A6 device checklists and road tests for Rides and Pick up & Drop; fix what fails. |
| 4 | ADR 0016. Migration `0009_taxi`: vehicle types, kinds, rate card fields and constraints, ride and quote fields, `BOOKED`. Settings. |
| 5 | Fares (§4.2), quotes and availability for Rental and Outstation, the §11.1 tests for them. |
| 6 | Booked trips: create, limits, `start_booked_rides`, retries, rider-busy rule, cancel, waiting from the booked time; their tests. Rental extras at End trip. |
| 7 | Captain and Operations APIs, `GET /rides/booked/`, seed, contract `1.120.0` and changelog. All backend tests green. |
| 8 | Customer app: tabs, Later picker, Rental and Outstation tabs, new vehicles and icons. |
| 9 | Customer app: booked state, Booked in Your rides, rental line, bill lines. Partner app (§6). |
| 10 | Operations console (§7). App tests. Every §11.1 command green. |
| 11 | Device checklist (§11.2), road trips (§11.3), test report (§11.4). PR to Ready for review. |
| 12 | Owner review on the phones. You fix what it finds. |

If something blocks you, tell the owner. Do not cut anything on your own.

## 11. Testing

### 11.1 Automated (you run these)

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/rides tests/mobile tests/notifications -q
.\.venv\Scripts\python.exe -m pytest tests/rides --cov=apps/rides --cov-branch --cov-report=term-missing
.\scripts\quality-static.cmd
```

From `frontend/`:

```powershell
pnpm --filter partner-mobile lint;  pnpm --filter partner-mobile typecheck;  pnpm --filter partner-mobile test
pnpm --filter customer-mobile lint; pnpm --filter customer-mobile typecheck; pnpm --filter customer-mobile test
pnpm --filter admin lint;           pnpm --filter admin typecheck;           pnpm --filter admin test
pnpm contract:check
```

Tests you must write (in `backend/tests/rides/`, one file each, plus A3's and A4's):

- `test_taxi_vehicle_types.py`: the D3 pairs on rate cards, the fields per kind, exact-type matching, vehicle type set and changed before approval.
- `test_taxi_availability.py`: `rental`, `outstation` and `book_ahead`; tabs empty where no card is active.
- `test_taxi_rental.py`: quotes per package, a package a card does not offer, no drop; extras from the track (accuracy filter, rounding), per started minute, waiting; `fare_lines`.
- `test_taxi_outstation.py`: 40 km minimum, one-way minimum fare, round trip days and the 250 km a day rule, return time limits, never re-priced at the end.
- `test_taxi_booked.py`: pickup time limits and steps, three booked at most, `BOOKED` does not block riding now, search at pickup − 60 min, retry every 3 minutes, `NO_CAPTAIN_FOUND` 15 minutes before, the rider-busy rule, free cancel while `BOOKED`, waiting counted from the booked time.
- `test_taxi_operations.py`: the kind and booked filters, the detail fields, rental and outstation rate cards, `409 vehicle_not_allowed_for_kind`.

App tests: the Later picker model (limits, 15-minute steps), the tabs' visibility from availability,
the rental usage line and the bill lines; the captain offer line for each kind.

### 11.2 Device checklist

Phone A: partner app, Cab captain. Phone B: partner app, SUV captain. Phone C: customer app.

- [ ] Rental and Outstation tabs show only where their cards are active; switching a card off in Operations hides the tab.
- [ ] Ride tab lists the seven vehicles with prices; a Cab trip goes only to A, an SUV trip only to B.
- [ ] Later: you cannot pick a time under 60 minutes away or over 7 days; a fourth booked trip is refused.
- [ ] A booked trip appears under Booked in Your rides; while it waits, C can still take a ride now.
- [ ] At pickup − 60 min the booked trip is offered; with both captains off duty it retries and ends "No captain found" 15 minutes before pickup.
- [ ] A captain who arrives early is not charging waiting until the booked time.
- [ ] Rental 2 h: the time and km line moves on both phones; ending past the package adds extra km and minutes on both bills.
- [ ] Outstation: under 40 km is refused; one way and round trip prices match §2 for the seeded cards; the fare does not change at the end.
- [ ] Cancel is free while booked; after assignment, the V1 rules.
- [ ] A captain sees only their vehicle's day passes; the launch offer ends after its 100th trip (set it to 2 trips in Operations to test).

### 11.3 Road trips

Three real trips in the 500032 area: a **2 h Cab rental** that goes past the package, a **Ride booked
for later** (at least 2 hours ahead), and an **Outstation one way** of at least 40 km. Record for each:
the quoted fare, the final fare, the time and km, and anything odd.

### 11.4 Test report

Paste into the PR: the automated output, the A6 results, the ticked §11.2 checklist, the three road
trips, and known issues left open.

## 12. Definition of done

- [ ] Part A: `main` merged, numbers `1.118.0` / `1.119.0`, A2–A5 done, A6 report in the PR.
- [ ] Part B: everything in §1 works on the phones; every decision in §2 is followed exactly.
- [ ] ADR 0016 and the `1.120.0` changelog entry are written and current.
- [ ] Contract regenerated, `pnpm contract:check` green.
- [ ] All tests in §11.1 written and green; coverage output pasted.
- [ ] Device checklist ticked; three road trips done; test report in the PR.
- [ ] No new native modules in Part B, no file written outside §8.
- [ ] Owner actions listed in the PR: the customer EAS Maps secret, the development builds, the Play
      foreground service declaration and video.
- [ ] Anything unclear is listed under **Needs owner** in the PR, not decided in code.
