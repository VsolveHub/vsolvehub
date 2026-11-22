# VSolve Pick up & Drop V1: your build brief

- Owner decides everything in this brief. You build it.
- Branch: **`parcel/v1`**, cut from `rapido/v1` after `main` was merged into it on 22 November 2026.
- Three days, testing and review included: **Monday 23 to Wednesday 25 November 2026.** Day 3 is the
  owner's review.
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
   write it in the PR description under **Needs owner** and tell the owner the same day.
2. **The Rides brief still applies.** Its ten rules (`docs/rapido/README.md` §0) are your rules
   here: Django decides everything, money is integer paise on the server, no fake data, never
   hand-edit the contract, every state change is authorized, audited and idempotent, side effects go
   through the outbox and Celery, never log codes, phone numbers or exact locations, and every
   feature ships with tests.
3. **No new native modules, no app version changes, no `eas build`, no `eas update`.** Everything
   here works with what the apps already have: `react-native-maps`, `expo-location`, `Linking` for
   calls and React Native `Share` for sharing codes.
4. **Contract version `1.112.0`. ADR `0015`.** Rides is `1.111.0` and ADR `0014` after the merge
   of `main`. There is no separate contract proposal for Pick up & Drop: §4.2 is the API.
5. **The screens follow Uber Parcel's layout** (the owner's screenshots are described in §5.1), and
   the start of the flow follows Rapido: the destination is asked first.

---

## 1. What you build

| Area | What ships |
|---|---|
| Vehicles | **Bike** and **Auto** only. No Cab parcels. |
| Customer (Customer app, Android + iOS) | **Pick up & Drop** tile on Home → where should it go (pickup is the current location) → Bike or Auto with the fare → **Review**: I'm sending / I'm receiving, pickup and drop details, Who pays, PIN confirmation, package guidelines → **Confirm · ₹fare**. Then live tracking (the Rides ride screen), codes with **Share**, cancel before pickup, rating, history. |
| Captain (Partner app, Rides workspace, Android) | "Take parcel orders" switch, parcel offer card, both ends' details and tap-to-call, pickup code, "Can't take this item", collect payment at the right end, arrived at drop, delivery PIN (when on) or Delivered, "Receiver not available" after the wait, return to the pickup, return code, payment received or not paid, parcels in history and earnings. |
| Backend | parcel kind on quotes, rides and rate cards, parcel details, optional delivery PIN, return leg priced by the fare engine, dispatch filter, payment rules, cancel rule, notifications, Operations APIs. |
| Operations console | Kind and Unpaid filters on the Rides list, parcel block on the ride detail, parcel rate cards with max weight and size. |
| Legal | A **Pick up & Drop** section on the customer website terms page. |
| Testing | backend tests, app tests, device checklist on three phones, two real deliveries, a written test report. |

Do not build anything that is not in this brief: no goods trucks, no buy-and-deliver, no online
payment, no tips, no parcel photos, no weight or item questions, no contact picker, no SMS to the
receiver, no tracking web link, no phone masking.

---

## 2. Decisions (all made, do not change them)

| # | Decision |
|---|---|
| D1 | **Name:** "Pick up & Drop" everywhere the customer or captain sees it. Code names use `parcel`. |
| D2 | **Vehicles:** Bike and Auto. A parcel rate card can only exist for `BIKE` or `AUTO`. |
| D3 | **Flow, destination first (as in Rapido):** Home tile → **Where should it go?** (drop search is focused; the pickup is prefilled with the current location and can be changed) → **Choose vehicle** (Bike, Auto, each with its fare and limits) → **Review** (§5) → **Confirm · ₹fare**. No other screens before booking. |
| D4 | **No weight or item questions.** The customer never enters a weight, size or item type. Instead the Review screen shows **Package guidelines** from the server: each vehicle's max weight and size, ₹5,000 or less in value, securely sealed and ready, and a "See prohibited items" link. The captain checks the item at the pickup (D16). |
| D5 | **Limits live on the parcel rate card**, editable by Operations: a max weight and a size label per vehicle. Defaults: **Bike 10 kg, 40 × 30 × 20 cm. Auto 50 kg, 1.3 × 3.5 × 3.3 ft.** |
| D6 | **No tick box.** Confirming is agreeing. Above the button: "By confirming, you agree your package follows these guidelines and is not on the prohibited list. Items are not insured." |
| D7 | **I'm sending / I'm receiving** toggle at the top of Review, **I'm sending** by default. Sending: the booker is at the pickup. Receiving: the booker is at the drop and gets an item picked up from someone else. The booker's own end is prefilled with their account name and phone (editable); the other end must be added. |
| D8 | **Details for each end** (Pickup details / Dropoff details screen, opened by **Add** on Review): name, phone (+91), store or building name, unit/floor, **Meet at curb** or **Meet at door**, and optional instructions for the captain (up to 120 characters). Both ends need a name and phone before Confirm works. |
| D9 | **Who pays is a toggle: Sender or Receiver**, as in Rapido, on Review. **Sender** pays at the pickup; **Receiver** pays at the drop. It follows D7 (sending → Sender, receiving → Receiver) until the booker switches it. Cash or UPI to the captain, the same as Rides. When the Receiver pays, the captain collects **before** handing the item over; a receiver who will not pay does not get the item, and after the free waiting minutes the captain uses Receiver not available (D12). |
| D10 | **Codes, shown only in the booker's app, each with Share.** The **pickup code** is always used: it is the Rides start code, given to the captain at the pickup. The **delivery PIN** is a "Add peace of mind? **PIN confirmation**" toggle on Review, **on by default** for security; the booker may turn it off. When it is on, the captain needs the PIN to finish; when it is off, the captain taps **Delivered** at the drop. |
| D11 | **Fare:** the Rides fare engine with a **parcel rate card** per area and vehicle (same price fields as a ride card). Waiting at the pickup is charged exactly as in Rides. **No waiting charge at the drop.** The fare is on the Confirm button. |
| D12 | **Receiver not available:** after the captain marks "Arrived at drop", the card's free waiting minutes run. When they are over (or the PIN is locked after five wrong tries), the captain may press **Receiver not available**. The parcel then goes back to the pickup. |
| D13 | **Return leg:** priced by the same fare engine, from the drop back to the pickup, with the same parcel rate card version. The person at the pickup gives the **pickup code** again to take the item back. |
| D14 | **Payment after a return.** The item comes back to the pickup, so everything still due is collected there from the sender: the return leg, plus the fare when the Receiver was to pay. The captain marks **Payment received** if the sender pays, otherwise **Not paid**. Not paid parcels show in Operations as **Unpaid** for follow-up. |
| D15 | **Cancelling:** the booker can cancel for free until the pickup code is entered. After pickup, the booker and the captain cannot cancel; only a return (D12) or an Operations cancel ends it. |
| D16 | **Captain refusal at pickup:** "Can't take this item" when it does not follow the guidelines (too heavy or too big for the vehicle, not sealed, or prohibited). Allowed only at the pickup, before the code. The parcel ends cancelled with reason `ITEM_NOT_ALLOWED`, no charge to anyone, and it is **not** offered to another captain. |
| D17 | **Captain opt-in:** "Take parcel orders" switch on the captain's Rides Home, **on by default**, Bike and Auto captains only. Parcels are offered only to captains with it on. |
| D18 | **Daily Pass:** the captain's existing Daily Pass covers parcels. No new pass, no pass change. |
| D19 | **Proof:** the pickup code, the delivery PIN when it is on, the GPS track and the timestamps. **No photos.** |
| D20 | **Contacts:** the captain sees both ends' details and phones (tap to call) only while the parcel is open. History never shows them. Operations always can. |
| D21 | **One off switch:** the server's `GET /rides/availability/` decides. The Pick up & Drop tile shows only where a parcel rate card is active, and the Rides card shows only where a ride rate card is active. Operations switches either off per area by deactivating its rate cards. |
| D22 | **Legal:** a "Pick up & Drop" section on the customer terms page: not insured, ₹5,000 value cap, the package guidelines, the prohibited list, the sender or the receiver pays as chosen at booking, any return leg is paid at the pickup, the captain may refuse an item. |
| D23 | **Prohibited items (server list):** weapons and ammunition; fireworks and explosives; gas cylinders, fuel and other flammable or hazardous chemicals; drugs and narcotics; alcohol; cash, currency, cheques and securities; gold, silver, jewellery and precious stones; live animals; anything illegal. |
| D24 | **Not taken from Uber's screens:** "Add Extra" tips, "Leave in lobby" (someone must be there for the code and the payment), the phone-contacts picker (it needs a new native module), and the SMS-permission line (we send no SMS to the receiver). |

---

## 3. How it works, end to end

### 3.1 States

Parcels reuse the ride states and add two.

| Ride state | Meaning for a parcel | Next |
|---|---|---|
| `SEARCHING` | finding a captain | `CAPTAIN_ASSIGNED`, `NO_CAPTAIN_FOUND`, `CANCELLED` |
| `CAPTAIN_ASSIGNED` | captain on the way to the pickup | `CAPTAIN_ARRIVED`, `SEARCHING` (captain cancel), `CANCELLED` |
| `CAPTAIN_ARRIVED` | captain at the pickup | `IN_TRIP` (pickup code), `CANCELLED` (booker, or captain `ITEM_NOT_ALLOWED`) |
| `IN_TRIP` | **picked up**, on the way to the drop. `arrived_at_drop_at` is set when the captain reaches the drop; it is a timestamp, not a state. | `COMPLETED` (PIN or Delivered), `RETURNING`, `CANCELLED` (Operations only) |
| `COMPLETED` | **delivered** | — |
| `RETURNING` (new) | receiver not available, going back to the pickup | `RETURNED`, `CANCELLED` (Operations only) |
| `RETURNED` (new) | handed back at the pickup | — |
| `NO_CAPTAIN_FOUND`, `CANCELLED` | as in Rides | — |

### 3.2 Codes

| Code | How it is made | Shown to the booker | Entered by the captain |
|---|---|---|---|
| Pickup code (always) | the existing `ride_otp(ride_id)` | `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED`, and again while `RETURNING` | at the pickup (`start`), and at the return (`returned`) |
| Delivery PIN (only when PIN confirmation is on) | new `parcel_delivery_pin(ride_id)`: an HMAC like `ride_otp` with its own message prefix. Never stored, never logged. | from `CAPTAIN_ASSIGNED` until `COMPLETED` or `RETURNING` | at the drop (`deliver`) |

Wrong codes count, as with the start code: `400` with `attempts_left`, the fifth wrong try `423`.
The delivery PIN has its own counter (`pin_attempts`, at most 5).

### 3.3 Money

Who pays is the D9 toggle (`payer`), not I'm sending or I'm receiving.

| Payer | Delivered | Returned |
|---|---|---|
| **Sender** | fare + pickup waiting, collected **at the pickup** right after the pickup code | the return leg, collected at the pickup when the item comes back: **Payment received** or **Not paid** |
| **Receiver** | fare + pickup waiting, collected **at the drop before the item is handed over** | fare + pickup waiting + return leg, all at the pickup from the sender: **Payment received** or **Not paid** |

`final_fare_paise` is fixed at pickup (fare + pickup waiting) and grows by `return_fare_paise` when a
return starts. Not paid sets the due amounts to the new payment status `UNPAID`.

---

## 4. Backend

All of it lives in `backend/apps/rides/` and `backend/tests/rides/`. One new migration,
`rides/0007_pickup_drop`. No partners or commerce migration.

### 4.1 Data

- `RideKind` choices: `RIDE`, `PARCEL`.
- `RideRateCard.kind` (default `RIDE`), `RideRateCard.max_parcel_weight_grams` and
  `RideRateCard.parcel_size_label` (up to 40 characters, e.g. "40 × 30 × 20 cm"). Both are null or
  blank for ride cards and required for parcel cards. Check constraint: a `PARCEL` card is `BIKE` or
  `AUTO`. The "one active card per area and vehicle" constraint becomes per area, vehicle **and kind**.
- `FareQuote.kind` and `Ride.kind` (default `RIDE`).
- `CaptainVehicle.takes_parcels` (default `True`).
- `Ride.PaymentStatus` gains `UNPAID`.
- `RideState` gains `RETURNING` and `RETURNED`.
- New `ParcelDetails`, one-to-one with `Ride` (primary key):
  - `mode`: `SEND` or `RECEIVE` (D7)
  - `payer`: `SENDER` or `RECEIVER` (D9)
  - `pin_required`: boolean (D10)
  - for the pickup and for the drop (`pickup_*`, `drop_*`): `name`, `phone`, `building`, `unit`,
    `meet_at` (`CURB` or `DOOR`), `instructions` (optional, up to 120 characters)
  - `arrived_at_drop_at`, `delivered_at`, `receiver_unavailable_at`, `returned_at`
  - `return_fare_paise` (null until a return starts), `return_payment_status` (null, `DUE`, `COLLECTED`, `UNPAID`)
  - `pin_attempts` (0–5, check constraint)
- Settings, inside the one `RIDES_*` block: `RIDES_PARCEL_VALUE_CAP_PAISE = 500000` and
  `RIDES_PARCEL_PROHIBITED_ITEMS` (the D23 list, as labels).

### 4.2 API (contract `1.112.0`)

Customer:

| Endpoint | Change |
|---|---|
| `GET /rides/availability/` | adds `parcel`: a list of `{vehicle_type, max_weight_grams, size_label}` with an active parcel card at that place (empty when Pick up & Drop does not run there), and `parcel_rules`: `{value_cap_paise, prohibited_items}`. |
| `POST /rides/quotes/` | optional `kind` (default `RIDE`). With `PARCEL`: one quote per vehicle with an active parcel card, each with `max_weight_grams` and `size_label`. |
| `POST /rides/` | when the quote is a parcel quote, `parcel` is required: `mode`, `payer`, `pin_required`, `pickup` and `drop` (each `name`, `phone`, `building`, `unit`, `meet_at`, `instructions`). Errors: `422 parcel_details_required` (a name or phone missing at either end), `400` for a phone that is not a 10-digit Indian mobile. |
| `GET /rides/{id}/` and history | add `kind` and, for parcels, `parcel`: the details above, `payment_point` (`PICKUP` when the Sender pays, `DROP` when the Receiver pays), `delivery_pin` (only to the booker, only when `pin_required`, only in the §3.2 window), `return_fare_paise`, `return_payment_status`. |
| `POST /rides/{id}/cancel/` | for a parcel, allowed only in `SEARCHING`, `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED`; otherwise `409 invalid_transition`. |

Captain:

| Endpoint | Behaviour |
|---|---|
| `PUT /partner/rides/parcel-preference/` | `{takes_parcels}`. Bike and Auto captains only (`409 vehicle_not_eligible` for Cab). `CaptainStatus` adds `takes_parcels`. |
| offers | a parcel offer adds `kind`, the drop address, both ends' `meet_at`, and `payment_point`. Dispatch offers a parcel only to on-duty captains with the same vehicle type and `takes_parcels`. |
| `POST /partner/rides/{id}/start/` | for a parcel this is **picked up** (`IN_TRIP`). Sets `final_fare_paise`. When the Sender pays, `payment_status` becomes `DUE` here. |
| `POST /partner/rides/{id}/cancel/` | adds reason `ITEM_NOT_ALLOWED`: parcels only, only from `CAPTAIN_ARRIVED`; ends `CANCELLED`, no re-dispatch (D16). |
| `POST /partner/rides/{id}/arrived-at-drop/` | new. `IN_TRIP` only. Same rule as `arrived`: last ping under 30 s old and within 200 m of the drop (`409 not_at_drop`). Sets `arrived_at_drop_at`. When the Receiver pays, `payment_status` becomes `DUE` here. Repeating it returns the ride. |
| `POST /partner/rides/{id}/deliver/` | new. Required `Idempotency-Key`. Needs `arrived_at_drop_at` (`409 not_at_drop`) and, when the Receiver pays, the payment collected first (`409 payment_not_collected`). When `pin_required`: `{pin}` is required; wrong PIN `400 pin_invalid` with `attempts_left`, the fifth `423 pin_locked`. When not: no body. Success: `COMPLETED`, `delivered_at`. |
| `POST /partner/rides/{id}/receiver-unavailable/` | new. Allowed when the free waiting minutes after `arrived_at_drop_at` are over, or the PIN is locked; else `409 wait_not_over`. Prices the return leg (drop to pickup) with the fare engine; `503 routing_unavailable` (retryable) if the route cannot be worked out, and nothing changes. Sets `RETURNING`, `return_fare_paise`, `return_payment_status = DUE`. `CaptainRide` carries `receiver_unavailable_allowed_at` (server time) for the countdown. |
| `POST /partner/rides/{id}/returned/` | new. `{otp}` (the pickup code), required `Idempotency-Key`, within 200 m of the pickup (`409 not_at_pickup`). Sets `RETURNED`, `returned_at`. A fare still `DUE` (the Receiver was to pay) is collected here with the return leg. Wrong codes count on the existing `otp_attempts`. |
| `POST /partner/rides/{id}/payment-received/` | for a parcel, marks every amount that is `DUE` as `COLLECTED`. |
| `POST /partner/rides/{id}/payment-not-received/` | new. `RETURNED` parcels only. Marks every amount that is `DUE` as `UNPAID`. |
| `GET /partner/rides/current/` | also returns a `RETURNING` parcel, and a delivered or returned parcel with an amount still `DUE`. |
| history and earnings | include parcels with `kind`. Earnings count collected amounts only. |

Operations:

| Endpoint | Change |
|---|---|
| `GET /operations/rides/` | filters `kind` and `payment_status` (including `UNPAID`). |
| `GET /operations/rides/{id}/` | adds the full `parcel` block with both ends' details. |
| rate cards | `kind` on create and list; `max_parcel_weight_grams` and `parcel_size_label` on parcel cards; `409 rate_card_exists` per area, vehicle and kind. |
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
| `parcel_delivered` | booker | delivered |
| `parcel_returning` | booker | receiver not available |
| `parcel_returned` | booker | handed back |
| `parcel_item_not_allowed` | booker | captain refused the item |

Captain cancels and Operations cancels reuse the Rides codes.

### 4.4 Design records (Day 1)

- `docs/adr/0015-pickup-drop-v1.md`, short: status, two lines of context, "Decision: see
  `docs/parcel/README.md` §2 (D1–D24)", and the consequences.
- One `contracts/openapi/CHANGELOG.md` entry, `## 1.112.0 - Pick up & Drop V1`, listing every
  endpoint change in §4.2 with its error codes.

---

## 5. Customer app

Routes under `app/(tabs)/rides/parcel/`, screens under `src/features/rides/parcel/`. Reuse the
Rides search, map and ride screen components.

### 5.1 The owner's Uber reference (22 November)

Three Uber Parcel screens, described here because screenshots are not committed:

- **Review delivery:** "I'm sending | I'm receiving" segmented toggle; Trip details with a pickup row
  (box icon, name, address, "Meet at curb · Add instructions", **Add**) and a drop row (square icon,
  "Add recipient details", address, "Meet at door · Add instructions", **Add**), joined by a line;
  "Add peace of mind? PIN confirmation" with a switch; "Add Extra" tip chips; "Review package
  guidelines" (Courier Bike 40 × 30 × 20 cm, 20 kg; Mini 3W 1.3 × 3.5 × 3.3 ft, 100 kg; INR 5000
  or less; securely sealed and ready for pick-up); a full-width **Confirm delivery · ₹109.11**.
- **Dropoff details:** "Who's receiving the package?" name and +91 phone; the address; "Store or
  building name" and "Unit/floor" side by side; Dropoff options chips (Meet at curb, Leave in lobby,
  Meet at door); "Instructions for driver"; **Save and continue**.
- In "I'm receiving", the account holder moves to the drop row and the pickup row asks for sender
  details.

Copy that layout. Leave out what D24 lists. Use our words from this brief.

### 5.2 Screens

1. **Home tile** `<PickupDropEntry />`, next to the Rides card: "Pick up & Drop", "Send or get a
   parcel · Bike or Auto". Shown only when `availability.parcel` is not empty at the customer's
   location (D21). Also change `<RidesEntry />` to show only when `availability.vehicle_types` is not
   empty (this reverses ADR-0014 decision 38).
2. **Where should it go?** (`parcel/index`): the drop search is focused, as in Rapido. The pickup
   row above it shows the current location; tapping it changes the pickup.
3. **Choose vehicle** (`parcel/choose`): Bike and Auto cards, each with the fare and "Up to {kg} kg ·
   {size}". Tapping one opens Review.
4. **Review** (`parcel/review`), top to bottom:
   - "I'm sending | I'm receiving" (D7)
   - **Trip details**: the pickup row and the drop row, each with the name (or "Add sender details" /
     "Add recipient details"), the address, the meet option and instructions, and **Add** or
     **Edit**; the chosen vehicle with **Change**
   - **Who pays?** **Sender | Receiver** (D9), with "Sender pays ₹{fare} in cash or UPI to the
     captain at the pickup" or "Receiver pays ₹{fare} in cash or UPI to the captain at the drop"
   - "Add peace of mind? **PIN confirmation** · Turn on to confirm delivery with a 4-digit PIN",
     **on** by default (D10)
   - **Package guidelines** from the server: each vehicle's limits, ₹5,000 or less, securely sealed
     and ready for pickup, "See prohibited items" (a sheet from `parcel_rules`)
   - the D6 line, then **Confirm Pick up & Drop · ₹{fare}** (disabled until both ends have a name
     and phone)
5. **Pickup details / Dropoff details** (`parcel/contact`), opened by **Add**: "Who's sending the
   package?" or "Who's receiving the package?", name, +91 phone, store or building name, unit/floor,
   **Meet at curb | Meet at door**, instructions for the captain (optional), **Save and continue**.
6. **Tracking**: the Rides ride screen, with parcel stage labels (Finding a captain, Captain on the
   way, At pickup, Picked up, At drop, Delivered, Returning, Returned) and a **codes card**: the
   pickup code and, when PIN confirmation is on, the delivery PIN, each with who it is for and a
   **Share** button. Share text: "V Solve Hub Pick up & Drop: {captain name}, {vehicle} {plate}.
   Pickup code {code}" or "Delivery PIN {pin}". When the Receiver pays, the text for the drop end
   adds "Please pay ₹{fare} in cash or UPI to the captain before you take the item."
7. **History**: parcels in the Rides history with a parcel icon and Delivered or Returned.

## 6. Partner app (captain)

All inside `src/features/rides/` and the existing rides routes.

1. **Rides Home**: a "Take parcel orders" switch for Bike and Auto captains.
2. **Offer screen**: a "Pick up & Drop" badge, pickup and drop, fare, "Collect at pickup" or
   "Collect at drop".
3. **Trip screen**, parcel stages. Each end shows its name, building, unit/floor, meet option,
   instructions and a call button.
   to pickup → at pickup: **Enter pickup code**, or **Can't take this item**
   → Sender pays: **Collect ₹{amount}** → to drop (Navigate) → **Arrived at drop**
   → Receiver pays: **Collect ₹{amount}** first → **Enter delivery PIN** (PIN on) or **Delivered**
   (PIN off) → done.
   After the wait (server countdown from `receiver_unavailable_allowed_at`): **Receiver not
   available** → returning (Navigate to the pickup) → **Enter pickup code** → **Collect
   ₹{amount}**, with **Payment received** or **Not paid**.
4. **History and Wallet**: parcels listed with `kind`; contacts never shown there (D20).

## 7. Operations console

Under `features/rides/` and the existing Rides routes.

1. Rides list: a Kind filter (All, Rides, Pick up & Drop) and an Unpaid filter.
2. Ride detail: a parcel block: sending or receiving, payer, PIN on or off, both ends' details,
   arrived at drop, delivered, receiver not available, returned, PIN attempts, return fare and
   return payment.
3. Rate cards: a Ride / Pick up & Drop choice when creating, and for parcel cards "Max weight (kg)"
   and "Size" (defaults in D5).
4. Extend `seed_rides_demo` with one Bike and one Auto parcel card per demo area (D5 defaults) for
   local testing.

---

## 8. Where you may write

You own the same folders as in Rides (`docs/rapido/README.md` §2) plus:

| Path | What |
|---|---|
| `frontend/mobile/apps/customer/app/(tabs)/rides/parcel/**` | parcel routes |
| `frontend/mobile/apps/customer/src/features/rides/parcel/**` | parcel screens, models, queries |
| `docs/parcel/**`, `docs/adr/0015-pickup-drop-v1.md` | your documents |

Registration points, these exact changes only:

| File | Allowed change |
|---|---|
| `backend/config/settings/base.py` | the two `RIDES_PARCEL_*` settings inside the `RIDES_*` block; `SPECTACULAR_SETTINGS["VERSION"]` to `1.112.0` |
| `backend/apps/notifications/templates_registry.py` | the nine `parcel_*` templates |
| `contracts/openapi/v1.yaml`, `frontend/packages/api-client/src/generated/schema.d.ts` | regenerate only |
| `contracts/openapi/CHANGELOG.md` | one `1.112.0` entry |
| `frontend/mobile/apps/customer/src/features/catalog/view/home-screen.tsx` | one import and one `<PickupDropEntry />` line |
| `frontend/apps/customer/app/terms/page.tsx` | one "Pick up & Drop" section (D22, D23) |

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
  to Ready for review at the end of Day 2, after §12 is met. The owner merges after the Day 3 review.

---

## 10. The three days

The owner puts a partner-app build with Rides on the test phones before Day 2's testing: captains
cannot go on duty in Expo Go.

### Day 1: Monday 23 November. Check Rides, then the backend

- First, run the Rides tests on `parcel/v1` (`pytest tests/rides` and `tests/partners`). `main` was
  merged into Rides on 22 November and nothing has been tested since. If anything fails, tell the
  owner before you write parcel code.
- Open Uber Parcel once on your phone and go up to Confirm delivery. **Do not book.** Compare it with
  §5.1. No write-up.
- Draft PR (§9) and ADR 0015 (§4.4).
- The whole backend (§4): the migration, availability and quotes, booking, the dispatch filter and
  `parcel-preference`, pickup, arrived at drop, deliver with and without the PIN, receiver not
  available with the return price, returned, payment received and not received, `ITEM_NOT_ALLOWED`,
  the cancel rule, notifications, Operations APIs, the seed. Contract `1.112.0` and its changelog
  entry.
- The backend tests in §11.1, written and green.

### Day 2: Tuesday 24 November. Apps, then testing

- Build the captain app (§6), the customer app (§5), the Operations console (§7) and the terms
  section.
- Test: the app tests and every command in §11.1, the device checklist (§11.2), the two road
  deliveries (§11.3), the test report (§11.4).
- Move the PR to Ready for review.

### Day 3: Wednesday 25 November. Owner review

- The owner reviews the PR and tries it on the phones.
- You fix what the review finds the same day, on `parcel/v1`. The owner merges when it passes.

If you fall behind, tell the owner the same day. Do not cut anything on your own.

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

- `test_parcel_quotes.py`: availability `parcel` and `parcel_rules`, parcel quotes per vehicle with limits, Cab never offered.
- `test_parcel_booking.py`: name and phone required at both ends, phone format, `meet_at`, instructions length, `payer` and `pin_required` stored.
- `test_parcel_dispatch.py`: only `takes_parcels` captains of the same vehicle; Cab cannot opt in.
- `test_parcel_trip.py`: pickup, arrived at drop (200 m, stale ping), deliver with PIN (wrong PIN counted once per key, lock at five) and without PIN.
- `test_parcel_return.py`: wait not over, wait over, PIN locked, return price from the fare engine, routing down changes nothing, returned with the pickup code.
- `test_parcel_payment.py`: Sender pays and Receiver pays, each with sending and receiving; `deliver` refused with `409 payment_not_collected` until a Receiver-pays parcel is collected; delivered and returned; payment received, not paid, `UNPAID`.
- `test_parcel_cancel.py`: booker before and after pickup, `ITEM_NOT_ALLOWED` only at pickup and never re-dispatched, Operations cancel in `IN_TRIP` and `RETURNING`.
- `test_parcel_codes.py`: code windows (§3.2), no delivery PIN when PIN confirmation is off, PIN never in captain payloads, never logged.
- `test_parcel_operations.py`: filters, detail block, parcel rate cards with weight and size.
- `test_parcel_notifications.py`: each `parcel_*` notice once, to the right person.

App tests: the customer Review model (Confirm disabled until both ends are complete, the payer line
for each choice, the codes card with PIN on and off) and the captain parcel trip-stage model.

### 11.2 Device checklist

Phone A: partner app, Bike captain. Phone B: partner app, Auto captain. Phone C: customer app.

- [ ] The Pick up & Drop tile shows only where a parcel card is active, and switching the card off in Operations hides it. The Rides card follows the same rule.
- [ ] Tapping the tile opens the drop search with the pickup set to the current location.
- [ ] Package guidelines show the limits set in Operations; Confirm stays disabled until both ends have a name and phone.
- [ ] I'm sending, Bike, Sender pays, PIN off: pickup code, collect at pickup, arrived at drop, Delivered.
- [ ] I'm receiving, Receiver pays, PIN on: the codes are shared from phone C on WhatsApp; at the drop, delivery is refused until payment is received, then the PIN.
- [ ] An Auto parcel goes only to captain B; with "Take parcel orders" off, captain A gets no parcels but still gets rides.
- [ ] Five wrong PINs lock it, and "Receiver not available" then works.
- [ ] Return: the wait countdown, the return fare on both phones, returned with the pickup code; Not paid shows as Unpaid in Operations.
- [ ] "Can't take this item": the booker is told, nothing is charged, no other captain gets it; the booker cannot cancel after pickup.
- [ ] Every notice in §4.3 reaches the right phone; both ends' details are on the captain's screen during the parcel and gone from history.

### 11.3 Road test (Day 2)

Two real deliveries: a Bike parcel, I'm receiving, Receiver pays, PIN on, delivered; and an Auto
parcel that is returned to the sender.

### 11.4 Test report

Paste into the PR: the automated output, the ticked checklist, the two deliveries (time, distance,
fare, anything odd), and known issues left open.

---

## 12. Definition of done

- [ ] Everything in §1 works on the phones; every decision in §2 is followed exactly.
- [ ] ADR 0015 and the `1.112.0` changelog entry are written and current.
- [ ] Contract regenerated, `pnpm contract:check` green.
- [ ] All tests in §11.1 written and green; coverage output pasted.
- [ ] Device checklist ticked; two road deliveries done; test report in the PR.
- [ ] No new native modules, no app version change, no file written outside §8.
- [ ] Anything unclear is listed under **Needs owner** in the PR, not decided in code.
