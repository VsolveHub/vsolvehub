# VSolve Pick up & Drop V1: your build brief

- Owner decides everything in this brief. You build it.
- Branch: **`parcel/v1`**, cut from `rapido/v1` after `main` was merged into it on 22 November 2026.
- Five working days: **Monday 23 to Friday 27 November 2026.** The owner reviews on Saturday 28.
- Ships **together with Rides V1**, in one store version, behind one server off switch.

Pick up & Drop is a parcel service like Uber Parcel or Rapido Parcel. A customer books a captain to
take an item from one place to another. It is **not** a new app and **not** a new engine. It is the
Rides engine you already built, with parcel details, a delivery PIN and return-to-sender added.

---

## Contents

0. Read this first
1. What you build
2. Decisions (all made, do not change them)
3. How it works, end to end
4. Backend
5. Customer app
6. Partner app (captain)
7. Operations console
8. Where you may write
9. Git rules for this branch
10. Day-by-day plan
11. Testing
12. Definition of done

---

## 0. Read this first

1. **Every product decision is already made (§2).** Do not choose a different field, state, price
   rule, label or flow. If something you need is not in this brief, do not decide it yourself:
   write it in the PR description under **Needs owner** and raise it at the 6:30 demo.
2. **The Rides brief still applies.** Its ten rules (`docs/rapido/README.md` §0) are your rules
   here: Django decides everything, money is integer paise on the server, no fake data, never
   hand-edit the contract, every state change is authorized, audited and idempotent, side effects go
   through the outbox and Celery, never log codes, phone numbers or exact locations, and every
   feature ships with tests.
3. **No new native modules, no app version changes, no `eas build`, no `eas update`.** Everything
   here works with what the apps already have: `react-native-maps`, `expo-location`, `Linking` for
   calls and React Native `Share` for sharing codes.
4. **Contract version `1.112.0`. ADR `0015`. Contract proposal `0032`.** Rides is `1.111.0`, ADR
   `0014` and proposal `0031` after the merge of `main`.

---

## 1. What you build

| Area | What ships |
|---|---|
| Vehicles | **Bike** and **Auto** only. No Cab parcels. |
| Customer (Customer app, Android + iOS) | **Pick up & Drop** tile on Home, Send or Receive, pickup and drop, what you are sending, weight, both contacts, the declaration tick, Bike/Auto fare, book, live tracking (the Rides ride screen), pickup code and delivery PIN with **Share**, cancel before pickup, rating, history. |
| Captain (Partner app, Rides workspace, Android) | "Take parcel orders" switch, parcel offer card, call pickup or drop contact, pickup code, "Can't take this item", collect payment at the right end, arrived at drop, delivery PIN, "Receiver not available" after the wait, return to the pickup, return code, payment received or not paid, parcels in history and earnings. |
| Backend | parcel kind on quotes, rides and rate cards, parcel details, delivery PIN, return leg priced by the fare engine, dispatch filter, payment rules, cancel rule, notifications, Operations APIs. |
| Operations console | Kind and Unpaid filters on the Rides list, parcel block on the ride detail, parcel rate cards with a max weight. |
| Legal | A **Pick up & Drop** section on the customer website terms page. |
| Testing | backend tests, app tests, device checklist on three phones, four real deliveries, a written test report. |

Do not build anything that is not in this brief: no goods trucks, no buy-and-deliver, no online
payment, no parcel photos, no SMS to the receiver, no tracking web link, no phone masking.

---

## 2. Decisions (all made, do not change them)

| # | Decision |
|---|---|
| D1 | **Name:** "Pick up & Drop" everywhere the customer or captain sees it. Code names use `parcel`. |
| D2 | **Vehicles:** Bike and Auto. A parcel rate card can only exist for `BIKE` or `AUTO`. |
| D3 | **Max weight per vehicle is on the parcel rate card**, editable by Operations. Defaults: **Bike 10 kg, Auto 50 kg.** |
| D4 | **Weight bands** the customer picks from: Up to 1 kg, 1–5 kg, 5–10 kg, 10–20 kg, 20–50 kg. A vehicle is offered only if the chosen band fits its max weight. Weight does not change the price. |
| D5 | **What are you sending:** Documents, Food, Clothes, Electronics, Medicines, Keys, Other. Chips only. No free-text description. |
| D6 | **Declaration (required tick):** "My item is worth ₹5,000 or less, is packed, and is not on the prohibited list." Items are **not insured**. The value cap (₹5,000) and the prohibited list come from the server. |
| D7 | **Send or Receive.** Send: the customer is at the pickup and sends the item. Receive: the customer is at the drop and gets an item picked up from someone else. The customer's own end is prefilled with their account name and phone (editable); the other end is typed in. |
| D8 | **Who pays: the customer who booked (the booker).** Cash or UPI to the captain, the same as Rides. Payment is collected at the **booker's end**: at the pickup when sending, at the drop when receiving. |
| D9 | **Two codes, both shown only in the booker's app.** The **pickup code** is the Rides start code, given to the captain at the pickup. The **delivery PIN** is new, given to the captain at the drop. The booker taps **Share** to send a code to whoever is at the other end. |
| D10 | **Fare:** the Rides fare engine with a **parcel rate card** per area and vehicle (same fields as a ride card). Waiting at the pickup is charged exactly as in Rides. **No waiting charge at the drop.** |
| D11 | **Receiver not available:** after the captain marks "Arrived at drop", the card's free waiting minutes run. When they are over (or the PIN is locked after five wrong tries), the captain may press **Receiver not available**. The parcel then goes back to the pickup. |
| D12 | **Return leg:** priced by the same fare engine, from the drop back to the pickup, with the same parcel rate card version. It is added to the booker's fare. The person at the pickup gives the **pickup code** again to take the item back. |
| D13 | **Payment after a return.** Send: the booker paid the fare at pickup and pays the return leg when the item comes back. Receive: fare and return leg are both due when the item comes back to the pickup; the captain marks **Payment received** if the person there pays, otherwise **Not paid**. Not paid parcels show in Operations as **Unpaid** for follow-up. |
| D14 | **Cancelling:** the booker can cancel for free until the pickup code is entered. After pickup, the booker and the captain cannot cancel; only a return (D11) or an Operations cancel ends it. |
| D15 | **Captain refusal at pickup:** "Can't take this item" (prohibited, over the weight, or not packed). Allowed only at the pickup, before the code. The parcel ends cancelled with reason `ITEM_NOT_ALLOWED`, no charge to anyone, and it is **not** offered to another captain. |
| D16 | **Captain opt-in:** "Take parcel orders" switch on the captain's Rides Home, **on by default**, Bike and Auto captains only. Parcels are offered only to captains with it on. |
| D17 | **Daily Pass:** the captain's existing Daily Pass covers parcels. No new pass, no pass change. |
| D18 | **Proof:** pickup code, delivery PIN, the GPS track and the timestamps. **No photos.** |
| D19 | **Contacts:** the captain sees both contacts' names and phones (tap to call) only while the parcel is open. History never shows them. Operations always can. |
| D20 | **One off switch:** the server's `GET /rides/availability/` decides. The Pick up & Drop tile shows only where a parcel rate card is active, and the Rides card shows only where a ride rate card is active. Operations switches either off per area by deactivating its rate cards. |
| D21 | **Legal:** a "Pick up & Drop" section on the customer terms page: not insured, ₹5,000 value cap, the prohibited list, the booker pays including any return leg, the captain may refuse an item. |
| D22 | **Prohibited items (server list):** weapons and ammunition; fireworks and explosives; gas cylinders, fuel and other flammable or hazardous chemicals; drugs and narcotics; alcohol; cash, currency, cheques and securities; gold, silver, jewellery and precious stones; live animals; anything illegal. |

---

## 3. How it works, end to end

### 3.1 States

Parcels reuse the ride states and add two.

| Ride state | Meaning for a parcel | Next |
|---|---|---|
| `SEARCHING` | finding a captain | `CAPTAIN_ASSIGNED`, `NO_CAPTAIN_FOUND`, `CANCELLED` |
| `CAPTAIN_ASSIGNED` | captain on the way to the pickup | `CAPTAIN_ARRIVED`, `SEARCHING` (captain cancel), `CANCELLED` |
| `CAPTAIN_ARRIVED` | captain at the pickup | `IN_TRIP` (pickup code), `CANCELLED` (booker, or captain `ITEM_NOT_ALLOWED`) |
| `IN_TRIP` | **picked up**, on the way to the drop. `arrived_at_drop_at` is set when the captain reaches the drop; it is a timestamp, not a state. | `COMPLETED` (delivery PIN), `RETURNING`, `CANCELLED` (Operations only) |
| `COMPLETED` | **delivered** | — |
| `RETURNING` (new) | receiver not available, going back to the pickup | `RETURNED`, `CANCELLED` (Operations only) |
| `RETURNED` (new) | handed back at the pickup | — |
| `NO_CAPTAIN_FOUND`, `CANCELLED` | as in Rides | — |

### 3.2 Codes

| Code | How it is made | Shown to the booker | Entered by the captain |
|---|---|---|---|
| Pickup code | the existing `ride_otp(ride_id)` | `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED`, and again while `RETURNING` | at the pickup (`start`), and at the return (`returned`) |
| Delivery PIN | new `parcel_delivery_pin(ride_id)`: an HMAC like `ride_otp` with its own message prefix. Never stored, never logged. | from `CAPTAIN_ASSIGNED` until `COMPLETED` or `RETURNING` | at the drop (`deliver`) |

Wrong codes count, as with the start code: `400` with `attempts_left`, the fifth wrong try `423`.
The delivery PIN has its own counter (`pin_attempts`, at most 5).

### 3.3 Money

| Mode | Delivered | Returned |
|---|---|---|
| **Send** | fare + pickup waiting, collected **at the pickup** right after the pickup code | the return leg, collected at the pickup when the item comes back, or **Not paid** |
| **Receive** | fare + pickup waiting, collected **at the drop** after the delivery PIN | fare + pickup waiting + return leg, at the pickup: **Payment received** or **Not paid** |

`final_fare_paise` is fixed at pickup (fare + pickup waiting) and grows by `return_fare_paise` when a
return starts. Not paid sets the due amounts to the new payment status `UNPAID`.

---

## 4. Backend

All of it lives in `backend/apps/rides/` and `backend/tests/rides/`. One new migration,
`rides/0007_pickup_drop`. No partners or commerce migration.

### 4.1 Data

- `RideKind` choices: `RIDE`, `PARCEL`.
- `RideRateCard.kind` (default `RIDE`) and `RideRateCard.max_parcel_weight_grams` (null for ride cards,
  required and above 0 for parcel cards). Check constraint: a `PARCEL` card is `BIKE` or `AUTO`.
  The "one active card per area and vehicle" constraint becomes per area, vehicle **and kind**.
- `FareQuote.kind` and `Ride.kind` (default `RIDE`).
- `CaptainVehicle.takes_parcels` (default `True`).
- `Ride.PaymentStatus` gains `UNPAID`.
- `RideState` gains `RETURNING` and `RETURNED`.
- New `ParcelDetails`, one-to-one with `Ride` (primary key):
  - `mode`: `SEND` or `RECEIVE`
  - `item_category`: `DOCUMENTS`, `FOOD`, `CLOTHES`, `ELECTRONICS`, `MEDICINES`, `KEYS`, `OTHER`
  - `weight_band`: `UP_TO_1_KG`, `KG_1_TO_5`, `KG_5_TO_10`, `KG_10_TO_20`, `KG_20_TO_50`
  - `pickup_contact_name`, `pickup_contact_phone`, `pickup_instructions` (flat, floor, landmark; up to 120 characters)
  - `drop_contact_name`, `drop_contact_phone`, `drop_instructions`
  - `declared_at` (the moment the booker ticked D6)
  - `arrived_at_drop_at`, `delivered_at`, `receiver_unavailable_at`, `returned_at`
  - `return_fare_paise` (null until a return starts), `return_payment_status` (null, `DUE`, `COLLECTED`, `UNPAID`)
  - `pin_attempts` (0–5, check constraint)
- Settings, inside the one `RIDES_*` block: `RIDES_PARCEL_VALUE_CAP_PAISE = 500000` and
  `RIDES_PARCEL_PROHIBITED_ITEMS` (the D22 list, as labels).

### 4.2 API (contract `1.112.0`)

Customer:

| Endpoint | Change |
|---|---|
| `GET /rides/availability/` | adds `parcel`: a list of `{vehicle_type, max_weight_grams}` with an active parcel card at that place (empty when Pick up & Drop does not run there), and `parcel_rules`: `{value_cap_paise, prohibited_items}`. |
| `POST /rides/quotes/` | optional `kind` (default `RIDE`). With `PARCEL`: one quote per vehicle with an active parcel card, each with `max_weight_grams`. |
| `POST /rides/` | when the quote is a parcel quote, `parcel` is required: `mode`, `item_category`, `weight_band`, `pickup_contact` and `drop_contact` (each `name`, `phone`, `instructions`), `declared: true`. Errors: `422 parcel_details_required`, `422 weight_over_limit`, `422 declaration_required`, `400` for a phone that is not a 10-digit Indian mobile. |
| `GET /rides/{id}/` and history | add `kind` and, for parcels, `parcel`: the details above, `payment_point` (`PICKUP` or `DROP`), `delivery_pin` (only to the booker, only in the D9 window), `return_fare_paise`, `return_payment_status`. |
| `POST /rides/{id}/cancel/` | for a parcel, allowed only in `SEARCHING`, `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED`; otherwise `409 invalid_transition`. |

Captain:

| Endpoint | Behaviour |
|---|---|
| `PUT /partner/rides/parcel-preference/` | `{takes_parcels}`. Bike and Auto captains only (`409 vehicle_not_eligible` for Cab). `CaptainStatus` adds `takes_parcels`. |
| offers | a parcel offer adds `kind`, `item_category`, `weight_band`, the drop address and `payment_point`. Dispatch offers a parcel only to on-duty captains with the same vehicle type and `takes_parcels`. |
| `POST /partner/rides/{id}/start/` | for a parcel this is **picked up** (`IN_TRIP`). Sets `final_fare_paise`. In Send mode `payment_status` becomes `DUE` here. |
| `POST /partner/rides/{id}/cancel/` | adds reason `ITEM_NOT_ALLOWED`: parcels only, only from `CAPTAIN_ARRIVED`; ends `CANCELLED`, no re-dispatch (D15). |
| `POST /partner/rides/{id}/arrived-at-drop/` | new. `IN_TRIP` only. Same rule as `arrived`: last ping under 30 s old and within 200 m of the drop (`409 not_at_drop`). Sets `arrived_at_drop_at`. Repeating it returns the ride. |
| `POST /partner/rides/{id}/deliver/` | new. `{pin}`, required `Idempotency-Key`. Needs `arrived_at_drop_at` (`409 not_at_drop`). Wrong PIN `400 pin_invalid` with `attempts_left`, the fifth `423 pin_locked`. Success: `COMPLETED`, `delivered_at`; in Receive mode `payment_status` becomes `DUE`. |
| `POST /partner/rides/{id}/receiver-unavailable/` | new. Allowed when the free waiting minutes after `arrived_at_drop_at` are over, or the PIN is locked; else `409 wait_not_over`. Prices the return leg (drop to pickup) with the fare engine; `503 routing_unavailable` (retryable) if the route cannot be worked out, and nothing changes. Sets `RETURNING`, `return_fare_paise`, `return_payment_status = DUE`. `CaptainRide` carries `receiver_unavailable_allowed_at` (server time) for the countdown. |
| `POST /partner/rides/{id}/returned/` | new. `{otp}` (the pickup code), required `Idempotency-Key`, within 200 m of the pickup (`409 not_at_pickup`). Sets `RETURNED`, `returned_at`. In Receive mode `payment_status` becomes `DUE`. Wrong codes count on the existing `otp_attempts`. |
| `POST /partner/rides/{id}/payment-received/` | for a parcel, marks every amount that is `DUE` as `COLLECTED`. |
| `POST /partner/rides/{id}/payment-not-received/` | new. `RETURNED` parcels only. Marks every amount that is `DUE` as `UNPAID`. |
| `GET /partner/rides/current/` | also returns a `RETURNING` parcel, and a delivered or returned parcel with an amount still `DUE`. |
| history and earnings | include parcels with `kind`. Earnings count collected amounts only. |

Operations:

| Endpoint | Change |
|---|---|
| `GET /operations/rides/` | filters `kind` and `payment_status` (including `UNPAID`). |
| `GET /operations/rides/{id}/` | adds the full `parcel` block with both contacts. |
| rate cards | `kind` on create and list; `max_parcel_weight_grams` on parcel cards; `409 rate_card_exists` per area, vehicle and kind. |
| cancel | the existing Operations cancel works on `IN_TRIP` and `RETURNING` parcels too. |

### 4.3 Notifications

Through `apps/rides/notify.py`, the same way as Rides, with templates in
`apps/notifications/templates_registry.py`:

| Code | To | When |
|---|---|---|
| `parcel_offer_new` | captain | a parcel offer ("New parcel request · {amount}") |
| `parcel_captain_assigned` | booker | captain assigned |
| `parcel_captain_arrived` | booker | captain at the pickup |
| `parcel_no_captain_found` | booker | no captain |
| `parcel_picked_up` | booker | pickup code accepted |
| `parcel_delivered` | booker | delivery PIN accepted |
| `parcel_returning` | booker | receiver not available |
| `parcel_returned` | booker | handed back |
| `parcel_item_not_allowed` | booker | captain refused the item |

Captain cancels and Operations cancels reuse the Rides codes.

### 4.4 Design documents (Day 1)

- `docs/adr/0015-pickup-drop-v1.md`: the D1–D22 table and the reasons, in the ADR format.
- `contracts/proposals/0032-pickup-drop-v1.md`: every endpoint in §4.2 with an example request and
  response and every error code.
- One `contracts/openapi/CHANGELOG.md` entry, `## 1.112.0 - Pick up & Drop V1`.

---

## 5. Customer app

Routes under `app/(tabs)/rides/parcel/`, screens under `src/features/rides/parcel/`. Reuse the
Rides search, map and ride screen components.

1. **Home tile** `<PickupDropEntry />`, next to the Rides card: "Pick up & Drop", "Send or get a
   parcel · Bike or Auto". Shown only when `availability.parcel` is not empty at the customer's
   location (D20). Also change `<RidesEntry />` to show only when `availability.vehicle_types` is
   not empty (this reverses ADR-0014 decision 38).
2. **Where** (`parcel/index`): Send | Receive toggle at the top, then pickup and drop search.
3. **Parcel details** (`parcel/details`): what you are sending (D5 chips), weight (D4 chips, only
   bands that fit the largest max weight on offer), the two contacts (the booker's end prefilled),
   flat/floor/landmark for each end, the D6 tick, "See prohibited items" (a sheet from
   `parcel_rules`), and "Items are not insured."
4. **Choose vehicle** (`parcel/choose`): Bike and Auto cards with the fare and max weight. A vehicle
   whose max weight is below the chosen band is shown disabled with "Up to {n} kg". Under the button:
   "Pay ₹{fare} in cash or UPI to the captain at the pickup" (Send) or "at the drop" (Receive).
   Button: **Book Pick up & Drop**.
5. **Tracking**: the Rides ride screen, with parcel stage labels (Finding a captain, Captain on the
   way, At pickup, Picked up, At drop, Delivered, Returning, Returned) and a **codes card**: the
   pickup code and delivery PIN, each with who it is for and a **Share** button. Share text:
   "V Solve Hub Pick up & Drop: {captain name}, {vehicle} {plate}. Pickup code {code}" or "Delivery
   PIN {pin}".
6. **History**: parcels in the Rides history with a parcel icon and Delivered or Returned.

## 6. Partner app (captain)

All inside `src/features/rides/` and the existing rides routes.

1. **Rides Home**: a "Take parcel orders" switch for Bike and Auto captains.
2. **Offer screen**: a "Pick up & Drop" badge, item category, weight band, pickup and drop, fare,
   "Collect at pickup" or "Collect at drop".
3. **Trip screen**, parcel stages:
   to pickup (call the pickup contact) → at pickup: **Enter pickup code**, or **Can't take this item**
   → Send: **Collect ₹{amount}** → to drop (Navigate, call the drop contact) → **Arrived at drop**
   → **Enter delivery PIN** → Receive: **Collect ₹{amount}** → done.
   After the wait (server countdown from `receiver_unavailable_allowed_at`): **Receiver not
   available** → returning (Navigate to the pickup) → **Enter pickup code** → **Collect
   ₹{amount}**, with **Payment received** or **Not paid**.
4. **History and Wallet**: parcels listed with `kind`; contacts never shown there (D19).

## 7. Operations console

Under `features/rides/` and the existing Rides routes.

1. Rides list: a Kind filter (All, Rides, Pick up & Drop) and an Unpaid filter.
2. Ride detail: a parcel block: mode, item, weight, both contacts, arrived at drop, delivered,
   receiver not available, returned, PIN attempts, return fare and return payment.
3. Rate cards: a Ride / Pick up & Drop choice when creating, and "Max weight (kg)" for parcel cards
   (Bike default 10, Auto default 50).
4. Extend `seed_rides_demo` with one Bike and one Auto parcel card per demo area (10 kg and 50 kg)
   for local testing.

---

## 8. Where you may write

You own the same folders as in Rides (`docs/rapido/README.md` §2) plus:

| Path | What |
|---|---|
| `frontend/mobile/apps/customer/app/(tabs)/rides/parcel/**` | parcel routes |
| `frontend/mobile/apps/customer/src/features/rides/parcel/**` | parcel screens, models, queries |
| `docs/parcel/**`, `docs/adr/0015-pickup-drop-v1.md`, `contracts/proposals/0032-pickup-drop-v1.md` | your documents |

Registration points, these exact changes only:

| File | Allowed change |
|---|---|
| `backend/config/settings/base.py` | the two `RIDES_PARCEL_*` settings inside the `RIDES_*` block; `SPECTACULAR_SETTINGS["VERSION"]` to `1.112.0` |
| `backend/apps/notifications/templates_registry.py` | the nine `parcel_*` templates |
| `contracts/openapi/v1.yaml`, `frontend/packages/api-client/src/generated/schema.d.ts` | regenerate only |
| `contracts/openapi/CHANGELOG.md` | one `1.112.0` entry |
| `frontend/mobile/apps/customer/src/features/catalog/view/home-screen.tsx` | one import and one `<PickupDropEntry />` line |
| `frontend/apps/customer/app/terms/page.tsx` | one "Pick up & Drop" section (D21, D22) |

Everything else is read-only. If you think another file must change, write it under **Needs owner**.

## 9. Git rules for this branch

```powershell
git fetch origin
git switch parcel/v1
```

- Work only on `parcel/v1`. Never push to `main` or `rapido/v1`. Never force-push.
- **Do not merge `main`.** The owner merges `main` into `rapido/v1`. When `rapido/v1` changes, bring
  it in with `git merge origin/rapido/v1`. Merge, never rebase.
- Stage explicit paths only. Never `git add -A` or `git add .`.
- Never commit `.env`, keys, `google-services.json`, keystores, `android/`, `ios/`, databases,
  media or screenshots.
- Commit messages: `feat(parcel): …`, `test(parcel): …`, `fix(parcel): …`, `docs(parcel): …`.
- Push every evening: `git push origin parcel/v1`.
- **Day 1:** open a Draft pull request `parcel/v1 → rapido/v1` titled **Pick up & Drop V1**. Move it
  to Ready for review on Day 5, after §12 is met. The owner merges.

---

## 10. Day-by-day plan

### Day 1: Monday 23 November. Explore Uber, design, data

**Morning (two hours, no more): explore the Uber app.**

- Open the Uber app on your phone. Look at how Uber organises its categories: the Home screen
  tiles, the Services tab, where Parcel sits and what it is called.
- Go through the Parcel flow screen by screen: Send or Receive, addresses, item details, contacts,
  vehicle and price options, payment, and the last screen before booking.
- **Stop before the request or booking button. Do not create a booking.**
- Write `docs/parcel/uber-walkthrough.md` (text only, no screenshots in the repo): for each screen,
  what it shows, what it asks, the order of fields, how price and limits are explained, and the
  wording. Then one short section: which layout and wording ideas you will use in our screens (§5,
  §6). Our fields, rules and flow stay exactly as this brief says.

**Afternoon:**

- Draft PR (§9). ADR 0015 and proposal 0032 (§4.4).
- `rides/0007_pickup_drop` migration: every model change in §4.1.
- Availability and quotes with `kind` (§4.2), with tests.
- 6:30 demo: the walkthrough, the ADR, the proposal, the migration.

### Day 2: Tuesday 24 November. Backend, all of it

Booking with parcel details, dispatch filter and `parcel-preference`, pickup, arrived at drop,
deliver, receiver not available with the return price, returned, payment received and not
received, `ITEM_NOT_ALLOWED`, cancel rule, notifications, Operations APIs, seed. Regenerate the
contract as `1.112.0`. Tests for every endpoint and transition. Demo: the whole flow through the API.

### Day 3: Wednesday 25 November. Captain app

§6 complete: switch, offer, trip stages, codes, calls, collect, wait countdown, return, not paid,
history. Demo on a phone.

### Day 4: Thursday 26 November. Customer app, Operations, legal

§5 complete, including the availability gate on both Home cards. §7 complete. The terms section.
Demo: book on one phone, deliver on another.

### Day 5: Friday 27 November. Test, fix, hand over

Automated tests (§11.1), the device checklist (§11.2), four real deliveries (§11.3), the test report
(§11.4). Move the PR to Ready for review.

If you fall behind, tell the owner at the demo the same day. Do not cut anything on your own.

---

## 11. Testing

### 11.1 Automated (you run these, as in the Rides brief §7.1)

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/rides -q
.\.venv\Scripts\python.exe -m pytest tests/rides --cov=apps/rides --cov-branch --cov-report=term-missing
.\.venv\Scripts\python.exe -m pytest tests/notifications -q
.\scripts\quality-static.cmd
```

From `frontend/`:

```powershell
pnpm --filter partner-mobile lint;  pnpm --filter partner-mobile typecheck;  pnpm --filter partner-mobile test
pnpm --filter customer-mobile lint; pnpm --filter customer-mobile typecheck; pnpm --filter customer-mobile test
pnpm --filter admin lint;           pnpm --filter admin typecheck;           pnpm --filter admin test
pnpm --filter customer lint;        pnpm --filter customer typecheck
pnpm contract:check
```

Tests you must write (in `backend/tests/rides/`, one file each):

- `test_parcel_quotes.py`: availability `parcel`, parcel quotes per vehicle, Cab never offered, max weight.
- `test_parcel_booking.py`: required details, weight over limit, declaration, phone format, Send and Receive prefill rules.
- `test_parcel_dispatch.py`: only `takes_parcels` captains of the same vehicle; Cab cannot opt in.
- `test_parcel_trip.py`: pickup, arrived at drop (200 m, stale ping), deliver, wrong PIN counted once per key, lock at five.
- `test_parcel_return.py`: wait not over, wait over, PIN locked, return price from the fare engine, routing down changes nothing, returned with the pickup code.
- `test_parcel_payment.py`: Send and Receive, delivered and returned, payment received, not paid, `UNPAID`.
- `test_parcel_cancel.py`: booker before and after pickup, `ITEM_NOT_ALLOWED` only at pickup and never re-dispatched, Operations cancel in `IN_TRIP` and `RETURNING`.
- `test_parcel_codes.py`: code windows (D9), PIN never in captain payloads, never logged.
- `test_parcel_operations.py`: filters, detail block, parcel rate cards.
- `test_parcel_notifications.py`: each `parcel_*` notice once, to the right person.

App tests: the customer parcel models (which bands and vehicles are allowed, the codes card text for
Send and Receive) and the captain parcel trip-stage model.

### 11.2 Device checklist

Phone A: partner app, Bike captain. Phone B: partner app, Auto captain. Phone C: customer app.

- [ ] The Pick up & Drop tile shows only in an area with a parcel card; switching the card off in Operations hides it.
- [ ] The Rides card follows the same rule for ride cards.
- [ ] Send, Bike: book, captain A accepts, pickup code, collect at pickup, arrived at drop, delivery PIN, delivered.
- [ ] Receive, Bike: the code is shared from phone C to someone else's WhatsApp, collect at the drop.
- [ ] Auto: a 20–50 kg parcel is offered only to Auto; Bike shows "Up to 10 kg".
- [ ] "Take parcel orders" off: captain A gets no parcel offers but still gets rides.
- [ ] Wrong delivery PIN five times locks it; "Receiver not available" then works.
- [ ] Return: the wait countdown, Receiver not available, the return fare shown on both phones, returned with the pickup code, Payment received.
- [ ] Return in Receive mode with Not paid: the parcel shows as Unpaid in Operations.
- [ ] "Can't take this item" at the pickup: the booker is told, nothing is charged, no other captain gets it.
- [ ] The booker cannot cancel after pickup.
- [ ] Contacts are callable during the parcel and absent from history.
- [ ] Notifications arrive on the right phone for every step in §4.3.
- [ ] The terms page shows the Pick up & Drop section.

### 11.3 Road test (Day 5)

Four real deliveries: Bike Send, Bike Receive, Auto Send, and one Bike parcel that is returned.

### 11.4 Test report

Paste into the PR: the automated output, the ticked checklist, the four deliveries (time, distance,
fare, anything odd), and known issues left open.

---

## 12. Definition of done

- [ ] Everything in §1 works on the phones; every decision in §2 is followed exactly.
- [ ] ADR 0015, proposal 0032 and the `1.112.0` changelog entry are written and current.
- [ ] Contract regenerated, `pnpm contract:check` green.
- [ ] All tests in §11.1 written and green; coverage output pasted.
- [ ] Device checklist ticked; four road deliveries done; test report in the PR.
- [ ] No new native modules, no app version change, no file written outside §8.
- [ ] Anything unclear is listed under **Needs owner** in the PR, not decided in code.
