# A7 Rental — Self Pickup, Partner-Arranged Delivery, Item Options

**Status:** Built — owner verification pending (`task.md` D1a, `[~]`). Owner decisions R-0, R-1,
R-5 and R-9 taken 8 Oct 2026; the other recommendations below were built as written.
**Effective date:** 2026-10-08
**Base:** `main` @ `4d4b105`; plan commits `4b9c6cb`, `b833f46`, `d0d2e52`
**Ownership:** the owner directed one session to build backend and frontend together ("build it",
8 Oct 2026), overriding the Codex/Claude split in `AGENTS.md` for this change.

### What changed from the plan while building

- **Root cause of the colour/material text box.** The partner page that is actually routed,
  `/rentals` → `rentals-workspace.tsx`, had its own form that turned only `enum` fields into a
  dropdown and ignored the `examples` lists migration `0014` added. `RentalFieldInput` (dropdown +
  Other…) was only used by `rental-ad-editor.tsx`, which no route renders. The routed form now uses
  `RentalFieldInput`. The serve-time and name-matching fix in §6 also shipped.
- **The pickup address is on the item, not the partner profile.** A new item is prefilled from the
  partner's latest item, or from `default_location_text` for their first. No `partners` migration.
- **An abandoned delivery payment cancels the booking**, the same as pickup, instead of returning to
  `QUOTED` (§4.2). It keeps one expiry path and one idempotency rule. The customer books again.
- **Delivery can't start today** (`delivery_too_soon`): the owner needs time to quote.
- **A declined or expired request the customer never acts on is cancelled on its start day** by
  the same sweep. Nothing was charged.
- The transport commission is a server constant (`apps/rental/transport.TRANSPORT_FEE_PERCENT = 0`),
  snapshotted per booking and published on `GET /rentals/platform-fee`. Making it
  Operations-editable is a later change.
- Contract `1.68.0`; see `contracts/openapi/CHANGELOG.md`. No separate proposal file was written
  because the same session published the contract.

## 1. Client requirement

When booking a rental, the customer chooses **how to receive the item**:

| | Self Pickup | Request Delivery |
| --- | --- | --- |
| Who moves the item | Customer goes to the partner | Partner arranges a vehicle |
| Transport charge | None | Quoted by the partner, agreed by the customer |
| Price source | — | **Partner's manual quote.** No automatic delivery pricing |
| Payment | — | Customer pays the agreed amount through V Solve Hub |
| Rental starts | At handover at the partner's location | At delivery to the customer |

For **Self Pickup**, show the partner's pickup address and a **View Location** link that opens
Google Maps. The partner enters the address as text (address, area, city, pincode). No map picker,
lat/lng, Places API or API key in this phase.

Separately, the client wants **colour and material shown as dropdowns** on rentals.

## 2. Audit of what exists on `main`

### 2.1 Pickup / delivery

| Area | Today | Gap |
| --- | --- | --- |
| `RentalBooking.pickup_or_delivery_mode` | `CharField(max_length=32, default="PICKUP")`, no `choices`, no DB constraint | Needs `PICKUP` / `DELIVERY` choices and a check constraint |
| `services.create_booking` | Line 621: `mode = "PICKUP"`, so any client value is overwritten | Must accept `DELIVERY` |
| `CreateBookingSerializer` | `validate_pickup_or_delivery_mode` always returns `"PICKUP"` | Must become a `ChoiceField` |
| `tests/rental/test_a7_flow.py:225` | Asserts that `DELIVERY` is coerced to `PICKUP` | The rule changes. Rewrite this test, don't delete it |
| Transport request / quote | Doesn't exist | New model + state machine (§4) |
| Payment amount | `A7_RENTAL_BOOKING` charges rent + platform fee + deposit at booking | A delivery booking must not charge until the quote is accepted, then charge one amount that includes transport (§4.4) |
| Partner earning | `settle_rental_earning` writes **one** EARNING per booking (`payouts_one_earning_per_rental_booking`): `price - platform_fee` | The transport amount must reach the partner (§4.5) |
| Customer book panel | `rental-book-panel.tsx:224` fixed "Self pickup … Doorstep delivery is not offered." and sends `"PICKUP"` | Needs the two-option chooser |
| Customer item page | `rentals/[slug]/page.tsx:106` shows `location_text` as one line | Needs the structured address + View Location link |
| Partner ad editor | `rental-ad-editor.tsx:540` hint says "There is no delivery." | Copy changes. Partner chooses whether to offer delivery |

### 2.2 Pickup address

| Field | Where | Notes |
| --- | --- | --- |
| `PartnerProfile.default_location_text` | `partners/models/onboarding.py:75`, `CharField(240)` | One free-text line, used to autofill each ad |
| `RentalAsset.location_text` | `CharField(180)` | Per-ad free text. `auto_publish_asset` requires it to be non-empty |

There is no area, city or pincode field, and no Maps link anywhere. Browsing filters on
`location_text__icontains`.

### 2.3 Colour / material

- `rental/field_options.py` defines `SUGGESTIONS` for `color`, `material`, `fuel_type`,
  `vehicle_type`, `condition`. `with_suggestions()` adds them as JSON-schema `examples`, and
  migration `0014` applied that to existing `A7VariantConfiguration.asset_schema` rows.
- **Partner side already works:** `partner/features/rentals/view/rental-field-input.tsx` renders
  any field that has `enum`/`examples` as a `<Select>` with an "Other…" box.
- **Gap — the dropdown can silently fall back to a text box.** The list is added once by
  migration `0014` and only to keys spelled exactly `color` / `material`. A category created or
  edited later, or a key like `colour` / `Color`, gets a plain text box. Causes and fix in §6.
- Customer screens don't show colour or material. The client hasn't asked for that, so it's out
  of scope.

### 2.4 Defects found during the audit (pre-existing, outside this feature)

1. **`backend/apps/rental/pickup_hours.py` imports `RentalPickupHours`**, which migration `0016`
   deleted (commit `d76309b`). Importing the module raises `ImportError`, so
   `tests/rental/test_pickup_times.py` fails at collection, and with it the whole rental suite run.
   The frontend's `customer/features/rentals/pickup-time.ts`, `partner/.../pickup-time.ts` and
   `partner/.../rental-home.tsx` still carry the removed pickup-hours UI. **Fix first.** By R-0
   (decided), pickup hours come back in a simpler per-day form (§5.4). The old module, test and
   frontend helpers are replaced by it, not kept alongside.

   *In plain terms:* "pickup hours" was an earlier feature where the partner set opening days and
   times and the customer picked an exact pickup time slot. Commit `d76309b` removed it from the
   database, so bookings now use dates only. Some code from that feature was never deleted (the
   "leftovers"). It does nothing for users, but it crashes the rental test run.
2. **`RentalBooking.handover_pin_hash` holds the plaintext PIN.** `create_booking` writes the raw
   4-digit PIN and `RentalBookingSerializer.get_handover_pin` returns the field as is. The name
   says hash and the content isn't one. Not in scope here, but delivery adds a second handover, so
   flag it before reusing the PIN for delivery.

## 3. Owner decisions

### Decided — 8 October 2026

| ID | Decision |
| --- | --- |
| R-1 | **On a delivery booking nothing is paid until the transport fee is agreed.** The customer then pays **one** amount: rent + platform fee + deposit + transport |
| R-5 | **Commission on transport is 0%.** The partner portal shows this wherever the partner sees a transport amount (§4.6) |
| R-0 | **Partners set pickup hours. No time slots.** Each partner sets which days they are open and the hours for each day, e.g. Sat 9 AM–9 PM, Sun 9 AM–6 PM. Customers come any time inside those hours on the day they chose (§5.4) |
| R-9 | **Colour / material are not added to every product.** Where a product already has a colour or material field, the partner picks from a dropdown with an **Other** option that opens a box for a custom value (§6) |

### Still open — recommendations stand unless the owner says otherwise

| ID | Question | Recommendation |
| --- | --- | --- |
| R-10 | Must the pickup **and** return days both be open days? | Yes. The booking is refused if either date falls on a day the partner is closed. The date picker greys those days out |
| R-11 | Ads published before pickup hours exist? | They stay live and show "Pickup hours not set — contact the owner". New ads can't be published until the partner saves their hours. The form starts pre-filled at **Mon–Sun, 9 AM–9 PM** for the partner to adjust |
| R-12 | Holidays / one-off closures? | Out of scope for now. The partner can pause an ad. Add a "closed on these dates" list later if asked |
| R-2 | If the partner declines delivery, or the quote isn't agreed in time? | Nothing has been paid (R-1), so the customer either **switches to Self Pickup** and pays the rent as a normal pickup booking, or **cancels** at no cost |
| R-3 | Can the customer counter-offer? | No. The partner quotes, and the customer **accepts** or **rejects with a note**. The partner may re-quote, at most 3 quotes per booking |
| R-4 | Does the quote cover the return trip? | Yes, as a choice: the partner states **one-way (drop only)** or **round trip (drop + collect)** with the quote |
| R-6 | How long is the item held while the quote is agreed? | Dates are **held tentatively**. The partner must quote within **24 h**. The customer must accept and pay within **24 h of the quote** and before the start date. A missed deadline releases the dates (R-2) |
| R-7 | Does every partner offer delivery? | No. A per-ad **"Delivery available on request"** toggle, default off. Self Pickup is always available |
| R-8 | Show the full pickup address before payment? | Area + city on cards. The **full address and View Location appear when the customer selects Self Pickup**, as the client asked |

## 4. Design — Delivery

### 4.1 Model

`RentalBooking`:
- `pickup_or_delivery_mode` → `choices=("PICKUP", "DELIVERY")` + `CheckConstraint`.
- New status **`AWAITING_TRANSPORT_QUOTE`**, used only by delivery bookings before payment.
- `transport_paise` (`PositiveIntegerField`, default 0) and `transport_fee_percent` /
  `transport_fee_paise` (snapshot, 0 by R-5), set when the quote is accepted. They're snapshots
  on the booking, like `platform_fee_*`.
- `delivery_address` (`JSONField`, default `{}`): `line`, `area`, `city`, `pincode`,
  `contact_phone`. Required when mode is `DELIVERY`.
- DB checks: `transport_paise = 0` when mode is `PICKUP`. `delivery_address <> {}` when mode is
  `DELIVERY`.

New `RentalTransportRequest` (`OneToOne` to the booking):

| Field | Notes |
| --- | --- |
| `status` | `REQUESTED → QUOTED → ACCEPTED → OUT_FOR_DELIVERY → DELIVERED`; terminal `DECLINED`, `EXPIRED`, `CANCELLED`. A rejected quote returns to `REQUESTED` with the customer's note |
| `trip` | `ONE_WAY` / `ROUND_TRIP`, set with the quote |
| `customer_note`, `reject_note` | Free text |
| `quote_paise` | `PositiveIntegerField(null=True)`: the partner's figure in integer paise, never computed |
| `quote_note` | Partner's vehicle/arrangement note |
| `quote_count` | ≤ 3 (DB check) |
| `respond_by` | The partner's quote deadline, then the customer's payment deadline (R-6) |
| `requested_at`, `quoted_at`, `accepted_at`, `delivered_at` | Timestamps |

`RentalAsset.delivery_available = BooleanField(default=False)` (R-7).

### 4.2 Booking lifecycle

```
PICKUP:    create → PENDING_PAYMENT → CONFIRMED → HANDOVER → RETURNED       (unchanged)

DELIVERY:  create → AWAITING_TRANSPORT_QUOTE        reservation TENTATIVE, nothing charged
                     │ partner quotes ₹X, customer accepts
                     ▼
                   PENDING_PAYMENT                  one payment: rent + fee + deposit + ₹X
                     │ captured
                     ▼
                   CONFIRMED  (transport ACCEPTED)  reservation CONFIRMED
                     │ partner: out for delivery → hands over with customer PIN
                     ▼
                   HANDOVER   (transport DELIVERED) → RETURNED
```

- `overlapping_reserved_quantity` already counts `TENTATIVE` reservations, so stock is held
  while the quote is open.
- The existing payment expiry (`release_booking_for_expired_payment`) returns an unpaid accepted
  quote to `QUOTED` until `respond_by`, then `EXPIRED`.
- `handover_booking` for a delivery booking also sets the transport to `DELIVERED`.
- `switch_to_pickup(booking)` (R-2): allowed only in `AWAITING_TRANSPORT_QUOTE`. Mode becomes
  `PICKUP`, transport becomes `CANCELLED`, and the booking moves to `PENDING_PAYMENT` with the
  normal pickup amount.
- `create_booking` refuses `DELIVERY` when `asset.delivery_available` is false
  (`delivery_not_offered`) or when the address is incomplete (`delivery_address_invalid`).

### 4.3 Commands (domain services in `apps/rental/transport.py`)

All are `@transaction.atomic`, lock the booking and the transport row, check the actor, and are
idempotent on replay.

| Command | Actor | Effect |
| --- | --- | --- |
| `create_booking(mode="DELIVERY", address, note)` | customer | Booking `AWAITING_TRANSPORT_QUOTE`, transport `REQUESTED`, `respond_by = now + 24h` |
| `quote_transport(amount_paise, trip, note)` | partner | `REQUESTED → QUOTED`, `quote_count += 1`, `respond_by = now + 24h` (capped at the start date) |
| `decline_transport(reason)` | partner | `REQUESTED → DECLINED`. The customer is offered switch / cancel |
| `accept_quote()` | customer | `QUOTED → ACCEPTED`. Snapshots `transport_paise` + fee (0) on the booking, booking → `PENDING_PAYMENT`, starts the one `A7_RENTAL_BOOKING` payment |
| `reject_quote(note)` | customer | `QUOTED → REQUESTED` (partner may re-quote) or `DECLINED` once the cap is hit |
| `mark_out_for_delivery()` | partner | `ACCEPTED → OUT_FOR_DELIVERY`, booking must be `CONFIRMED` |
| `handover_booking(pin)` (existing) | partner | Also sets transport `DELIVERED` |
| Celery beat `expire_transport_requests` | system | `REQUESTED`/`QUOTED` past `respond_by` → `EXPIRED`, reservation `RELEASED` |
| `cancel_booking` (existing, extended) | either | Before payment: nothing to refund. After payment: refunds rent + fee + deposit + transport through the existing path, until `DELIVERED` |

### 4.4 Payments (`apps/commerce`)

**No new payment purpose.** R-1 makes it one charge, so the existing `A7_RENTAL_BOOKING` attempt
carries `price + platform_fee + deposit + transport_paise`. Changes:
- The amount computation moves into one helper `booking_amount_due(booking)`, used by both
  `create_booking` (pickup) and `accept_quote` (delivery), so the two can't drift.
- Idempotency key stays `a7-booking:{booking.id}`. A re-quote can't create a second attempt
  because the payment starts only on accept, and accept is allowed once per quote.
- Refunds use the existing booking refund. The refunded amount now includes `transport_paise`.
  The regression test pins it.
- Reuse the Razorpay adapter and Checkout handoff. Tests use the provider fake.

### 4.5 Partner earning (`apps/payouts`)

Still one EARNING per booking. `settle_rental_earning` becomes
`gross = price_paise + transport_paise`, `commission = platform_fee_paise + transport_fee_paise`
(0). The snapshot adds `transport_paise`, `transport_fee_percent`, `transport_fee_paise` and
`trip`. Pickup bookings settle exactly as today.

### 4.6 Showing the 0% transport commission to the partner (R-5)

| Partner portal place | What it shows |
| --- | --- |
| Quote form (booking sheet) | Under the amount box: **"Transport commission: 0% — you receive the full ₹X."** The figure updates as they type |
| Booking sheet, after quote/payment | A line breakdown: Rent ₹A · Platform fee −₹B · **Transport ₹X (0% commission)** · **You receive ₹A−B+X** |
| Earnings / ledger row for the booking | "Includes transport ₹X, no commission", read from the earning snapshot |
| Ad editor, "Delivery available on request" toggle | Hint: *"You set the transport price for each request. V Solve Hub takes no commission on transport."* |

The 0% shown comes from the server (`transport_fee_percent` on the booking, and a
`transport_fee_percent` field on `GET /rentals/platform-fee`). The frontend doesn't hard-code it,
so a later change needs no frontend release.

### 4.7 API (proposal → `contracts/proposals/a7-rental-delivery.md`)

| Method + path | Body / result |
| --- | --- |
| `POST /rentals/book` | Adds `pickup_or_delivery_mode: "PICKUP" \| "DELIVERY"`, `delivery_address{}`, `delivery_note`. A delivery booking returns no payment |
| `GET /rentals/platform-fee` | Adds `transport_fee_percent` |
| `GET /me/rentals`, `GET /partner/rentals/bookings` | Booking adds `transport` (nullable), `transport_paise`, `transport_fee_percent`, `transport_fee_paise`, `pickup_address` (§5) |
| `POST /me/rentals/{id}/transport/accept` | → `{payment: …}`, same shape as booking payment init |
| `POST /me/rentals/{id}/transport/reject` | `{note}` |
| `POST /me/rentals/{id}/switch-to-pickup` | → `{payment: …}` |
| `POST /partner/rentals/bookings/{id}/transport/quote` | `{amount_paise, trip, note}` |
| `POST /partner/rentals/bookings/{id}/transport/decline` | `{reason}` |
| `POST /partner/rentals/bookings/{id}/transport/out-for-delivery` | — |

Errors visible to the user: `delivery_not_offered`, `delivery_address_invalid`,
`transport_state_invalid`, `quote_limit_reached`, `quote_expired`.

### 4.8 Notifications

Use the existing `_notify_rental` intents: delivery requested (→ partner, with the 24 h deadline),
quote sent (→ customer), quote accepted and paid (→ partner), quote rejected (→ partner),
declined/expired (→ customer, with the switch-or-cancel choice), out for delivery (→ customer).

## 5. Design — Self Pickup address and Maps link

### 5.1 Data

`PartnerProfile` gets `pickup_address_line`, `pickup_area`, `pickup_city`, `pickup_pincode` (6
digits, `^[1-9][0-9]{5}$` check). `default_location_text` stays for other uses.

`RentalAsset` gets the same four fields. A new ad copies them from the profile, as
`location_text` does today, and the partner can override them per ad. `location_text` is kept and
derived as `"{area}, {city}"` so search, slugs and the `auto_publish_asset` check keep working.
The data migration copies existing `location_text` into `pickup_address_line` and leaves area,
city and pincode blank. `auto_publish_asset` then requires address line + city + pincode for
**new** publishes only. Live ads aren't unpublished.

No `latitude`/`longitude` yet. Leave room: a later nullable pair on the asset, with the link
preferring coordinates when present.

### 5.2 Serializer

`RentalAssetSerializer` adds:

```json
"pickup_address": {
  "partner_name": "Sai Events Rental Services",
  "line": "Plot 12, Road 3, KPHB Colony",
  "area": "Kukatpally",
  "city": "Hyderabad",
  "pincode": "500072",
  "maps_url": "https://www.google.com/maps/search/?api=1&query=Sai%20Events%20Rental%20Services%2C%20Plot%2012..."
}
```

The server builds `maps_url` with `urllib.parse.quote` (the Google Maps URLs API, which needs no
key). The frontend never assembles the URL itself.

### 5.3 UI

Customer book panel, a radio pair titled **"How do you want to receive it?"**:
- **Self Pickup** — Free. On select, shows 📍 Pickup Location: partner name, line, area/city,
  pincode, then **📍 View Location**, an `<a target="_blank" rel="noopener noreferrer">` to
  `maps_url`.
- **Request Delivery** — only when `delivery_available`. Shows an address form (line, area, city,
  pincode, phone) and a note, plus the line *"The partner will check your requirement and send a
  transport price. You pay nothing now. You pay the rent and transport together once you accept the
  price."* The button reads **Send delivery request**, not Pay. Price summary: "Transport: the
  partner will quote".

Customer booking card: a transport status strip (Waiting for quote → Quote ₹X, one-way/round trip
[Accept & pay ₹total] [Reject] → Paid → Out for delivery → Delivered). The total breaks down rent,
platform fee, deposit and transport, plus a "Switch to self pickup"
action on decline/expiry. Self-pickup bookings show the same address block and View Location.

Partner booking sheet: delivery address, customer note, a quote form (₹ amount, trip, note),
Decline, Out for delivery, and the 0% commission lines in §4.6. The ad editor gets structured address fields and a "Delivery available
on request" toggle. The hint "There is no delivery." is removed.

### 5.4 Pickup hours (R-0)

**What changes from the removed feature:** no time slots and no pickup/return clock time on the
booking. Bookings stay date-only. Hours are now **per weekday** instead of one opening time for
all open days. Notice period and "book up to N days ahead" are dropped.

**Model** (`apps/rental/models.py`): `RentalPickupDay`

| Field | Notes |
| --- | --- |
| `partner` | `FK(partners.PartnerProfile, CASCADE, related_name="rental_pickup_days")` |
| `weekday` | `0`–`6`, Monday = 0 |
| `opens_at`, `closes_at` | `TimeField`, whole or half hours |

Constraints: unique (`partner`, `weekday`); `closes_at > opens_at`; `weekday` between 0 and 6.
**No row for a weekday means closed that day.** A partner with no rows has not set hours yet. That
is distinct from "closed every day", which the service refuses (at least one open day).

One schedule per partner, used by all their rental ads. Pickup and return happen at the same
address.

**Service** (`apps/rental/pickup_hours.py`, rewritten):
- `save_pickup_hours(partner, days: list[{weekday, opens_at, closes_at}])` replaces the
  partner's rows atomically, after validating them.
- `check_open_days(partner, start_date, end_date)`: raises `pickup_day_closed` /
  `return_day_closed`, naming the day and the open days. Called from `create_booking` for both
  modes. For delivery, the partner arranges the time with the customer, but the return still
  needs an open day.
- `pickup_hours_payload(partner)`: `{is_set, days: [{weekday, label, opens_at, closes_at}], summary}`.
  The summary groups equal days, e.g. "Mon–Sat 9 AM–9 PM · Sun 9 AM–6 PM".
- `auto_publish_asset` adds "Set your pickup hours." to its errors when `is_set` is false (R-11).

**API**
- `GET/PUT /partner/rentals/pickup-hours`: the partner's schedule.
- `RentalAssetSerializer` adds `pickup_hours` (the payload above), next to `pickup_address`.

**UI**
- Partner rental home: a **Pickup hours** card with seven rows. Each row has an Open/Closed switch
  and, when open, "from" and "to" time selects in 30-minute steps from 6 AM to 11 PM. The rows
  start pre-filled at 9 AM–9 PM and a "Copy to all days" action fills the rest from one row.
  Saving shows the summary line.
- Customer item page and the Self Pickup block (§5.3): under the address, **🕘 Pickup hours**
  with one line per day, or "Closed". Today's line is highlighted.
- Customer date picker: closed weekdays are disabled for both pickup and return. The server
  check (R-10) is the authority. The picker only helps.
- Booking card after booking: "Pick up on Sat 12 Oct, any time 9 AM–9 PM", from the payload.

**Leftovers replaced:** the old `pickup_hours.py` contents (slots, notice, advance window),
`tests/rental/test_pickup_times.py`, `customer/features/rentals/pickup-time.ts`,
`partner/features/rentals/pickup-time.ts`, and the slot code in `rental-home.tsx`. The rewrite
reuses the names where they fit and deletes the slot logic.

## 6. Design — Colour / material dropdowns (R-9)

**Scope:** only products whose category already has a colour or material field. Nothing is added
to other categories, and customers' screens don't change.

**What already works:** `RentalFieldInput` (partner ad editor) renders any field that has
`examples` as a dropdown + **Other…**, and choosing Other opens a text box whose value saves as
is. Migration `0014` gave the existing colour/material fields their `examples`.

**Why the client still sees a text box.** I can't see staging data from here, but the code
allows three causes:
1. **The category was created or edited after migration `0014`.** The migration ran once. A
   category added later through Django admin, or a re-seeded one, has a plain
   `{"type": "string"}` field with no list, so the form falls back to a text box.
2. **The field key doesn't match exactly.** `SUGGESTIONS` matches only `color` and `material`. A
   field named `colour`, `Color`, `frame_colour` or `Material type` gets no list.
3. **Typed values.** Before `0014` the partner typed the value. An old ad whose value isn't in
   the list opens on "Other…" with the text shown. That's correct, but it can look like typing.

**Fix:**
- Apply the suggestions **when the schema is served**, not only once in a migration:
  `get_rental_taxonomy()` (and the partner asset detail) runs `with_suggestions()` on each
  variant's `asset_schema`. New and edited categories get the dropdown with no further migration.
- `with_suggestions()` matches keys by a normalised name, lower-cased, `colour` → `color`, with a
  title fallback. So `colour`, `Color`, `body_colour` and a field titled "Colour" all get the colour
  list, and likewise for material. It still adds a list only to fields that already exist and
  never to other categories.
- A schema author's own `enum`/`examples` still win.
- The server keeps accepting any string, so an "Other" value always saves (`examples` don't
  restrict).
- Partner UI check: the dropdown's first option reads "Select colour"; "Other…" is last; choosing
  Other focuses a box labelled "Your colour". All three behave the same on create and on edit.

**Out of scope unless asked:** customers choosing a colour when booking, with stock per colour.

## 7. Work breakdown

| # | Task | Owner | Depends |
| --- | --- | --- | --- |
| T0 | Pickup hours backend (§5.4): `RentalPickupDay` + migration, rewritten `pickup_hours.py`, booking day check, publish check, `GET/PUT /partner/rentals/pickup-hours`, `pickup_hours` on the asset. Replaces the broken leftovers | Codex | — |
| T0b | Pickup hours frontend (§5.4): partner hours card, customer hours display, closed days disabled in the date picker. Replaces both `pickup-time.ts` | Claude | T0, T7 |
| T1 | Contract proposal `contracts/proposals/a7-rental-delivery.md` (§4.7, §5.2) | Claude | — |
| T2 | Structured pickup address: fields, data migration, serializer `pickup_address` + `maps_url`, publish check | Codex | T1 |
| T3 | Delivery domain: status, fields, `RentalTransportRequest`, `transport.py` commands, `create_booking` change, beat expiry | Codex | T1 |
| T4 | One payment: `booking_amount_due` helper, accept → payment, expiry back to QUOTED, refund includes transport | Codex | T3 |
| T5 | Earning includes transport at 0% commission, `transport_fee_percent` on platform-fee GET | Codex | T4 |
| T6 | Colour/material: serve-time suggestions + key normalisation (§6) | Codex | — |
| T7 | Publish `contracts/openapi/v1.yaml`, regenerate `schema.d.ts` | Codex → Claude | T2–T5 |
| T8 | Customer book panel: receive-method chooser, pickup address + View Location, delivery form | Claude | T7 |
| T9 | Customer booking card: transport status, accept & pay, reject, switch to pickup | Claude | T7 |
| T10 | Partner: structured address + delivery toggle in the editor, quote/decline/out-for-delivery, 0% commission display (§4.6) | Claude | T7 |
| T11 | Partner: verify the colour/material dropdown + Other on create and edit against T6 | Claude | T6 |

## 8. Tests to write

Backend (`backend/tests/rental/`):
- `test_transport_flow.py`: every transition in §4.3, illegal transitions refused, the quote cap,
  replayed accept starts one payment, payment expiry → QUOTED, `respond_by` expiry releases the
  dates, switch-to-pickup charges the pickup amount, cancel before payment charges nothing, cancel
  after payment refunds transport too, `out-for-delivery` refused before payment.
- `test_a7_flow.py`: rewrite the coercion test. `DELIVERY` is kept when offered and refused with
  `delivery_not_offered` otherwise.
- `test_pickup_address.py`: profile → asset copy, override, pincode check, `maps_url` encoding
  (commas, `&`, `#`, non-ASCII), legacy `location_text` migration.
- `test_rental_payout.py`: earning with and without transport, commission 0 on transport.
- `test_pickup_hours.py` (replaces `test_pickup_times.py`): save/replace the schedule, `closes_at`
  after `opens_at`, at least one open day, duplicate weekday refused, summary grouping
  ("Mon–Sat 9 AM–9 PM · Sun 9 AM–6 PM"), booking refused on a closed pickup day and on a closed
  return day, publish refused until hours are set, ads published earlier stay live.
- `test_field_options.py`: `colour` / `Color` / title "Colour" get the list, a category without
  the field gets nothing, an author's `enum` is kept, a custom "Other" value saves.

Frontend (Vitest): `rental-book-panel.test.tsx` (chooser, address block, link
`href`/`target`/`rel`, delivery form validation, no payment on a delivery request),
`rental-booking-card.test.tsx` (each transport state), partner quote form ("0% — you receive the
full ₹X" updates as the partner types), `rental-field-input` (dropdown, Other opens the box,
custom value kept on edit).

## 9. Acceptance

- Self Pickup: the customer sees the full address, and View Location opens Google Maps searching
  for that address. No transport line in the price.
- Delivery: request → partner quotes → customer accepts → **one payment** of rent + fee + deposit
  + transport through Razorpay test mode → partner delivers with the PIN → rental starts.
- The partner sees "0% commission" on the quote and the booking, and the earning includes the
  full transport amount.
- A declined or expired delivery request has charged the customer nothing and leaves them a
  choice: switch to pickup or cancel.
- No transport price is ever computed by the platform. Every amount is the partner's quote, in
  paise.
- The partner sets different hours per day (e.g. Sat 9 AM–9 PM, Sun 9 AM–6 PM). The customer
  sees them on the item page and the Self Pickup block, can't pick a closed day, and the server
  refuses one if sent anyway.
- Every product with a colour or material field shows a dropdown with Other. Products without
  those fields are unchanged.
