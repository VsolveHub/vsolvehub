# A7 Rental — Self Pickup, Partner-Arranged Delivery, Item Options

**Status:** Planned — audit complete, not built
**Effective date:** 2026-10-08
**Base:** `main` @ `4d4b105`
**Ownership (per `AGENTS.md`):** backend + `contracts/openapi/**` → Codex; `frontend/**` +
`contracts/proposals/**` → Claude. Any session doing both needs the owner's explicit go-ahead.

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
| Payment purposes | `A7_RENTAL_BOOKING`, `A7_RENTAL_DEPOSIT` | Need `A7_RENTAL_TRANSPORT` and its capture/expiry/refund hooks |
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
- **Gap 1, coverage:** a dropdown only appears when the category's `asset_schema` *has* a `color`
  / `material` property. In `seed_rental_demo.py` only one schema (line 226) declares them, and
  nothing in Operations edits `asset_schema` (no admin UI references it). Most rental categories
  therefore show no colour or material field at all.
- **Gap 2, customer side:** the customer item page never renders `structured_fields`, so a colour
  or material the partner picked is invisible. There is no filter by colour or material either.
- **Gap 3, a choosable variant:** one ad holds one value. "Available in Red, Blue and Black" isn't
  expressible, and stock is per ad, not per colour.

### 2.4 Defects found during the audit (pre-existing, outside this feature)

1. **`backend/apps/rental/pickup_hours.py` imports `RentalPickupHours`**, which migration `0016`
   deleted (commit `d76309b`). Importing the module raises `ImportError`, so
   `tests/rental/test_pickup_times.py` fails at collection, and with it the whole rental suite run.
   The frontend's `customer/features/rentals/pickup-time.ts`, `partner/.../pickup-time.ts` and
   `partner/.../rental-home.tsx` still carry the removed pickup-hours UI. **Fix first:** delete the
   dead module, its test and the frontend leftovers, or restore the model. Owner decision R-0.
2. **`RentalBooking.handover_pin_hash` holds the plaintext PIN.** `create_booking` writes the raw
   4-digit PIN and `RentalBookingSerializer.get_handover_pin` returns the field as is. The name
   says hash and the content isn't one. Not in scope here, but delivery adds a second handover, so
   flag it before reusing the PIN for delivery.

## 3. Owner decisions needed

| ID | Question | Recommendation |
| --- | --- | --- |
| R-0 | Pickup hours: delete the leftovers or restore the feature? | Delete. Bookings are date-based since `0016` |
| R-1 | When is the rental paid on a delivery booking: before the quote, or with it? | **Before.** Rental + deposit are paid at booking, as today, so stock is held. Transport is a second, separate payment |
| R-2 | If the partner declines delivery or the customer rejects the quote? | Customer may **switch to Self Pickup** or **cancel with a full refund** (rental + fee + deposit). No cancellation charge, since delivery was never agreed |
| R-3 | Can the customer counter-offer? | No. Partner quotes, customer **accepts** or **rejects with a note**. The partner may re-quote, at most 3 quotes per booking |
| R-4 | Does the quote cover the return trip? | One quote with a required choice: **one-way (drop only)** or **round trip (drop + collect)**. The partner states which |
| R-5 | Platform fee on transport? | **0%** for now. Transport goes to the partner in full. Store a `transport_fee_percent` snapshot (0) so it can change later without a migration |
| R-6 | Quote deadline? | The partner must quote within **24 h** of the request. The customer must accept and pay **before the rental start date**. Either miss → auto-expire to R-2 |
| R-7 | Does every partner offer delivery? | No. A per-ad **"Delivery available on request"** toggle (default off). Self Pickup is always available |
| R-8 | Show the full pickup address before payment? | Area + city on cards and the item page. The **full address and the Maps link appear when the customer selects Self Pickup**, as the client asked. It's public, so no house or flat numbers are required |
| R-9 | Colour / material: describe only, or let the customer choose? | **Phase A: describe only.** Always offer colour and material as dropdowns to the partner, show them on the item page, filter by them. **Phase B (only if asked): selectable variants with per-option stock** |

## 4. Design — Delivery

### 4.1 Model

`RentalBooking`:
- `pickup_or_delivery_mode` → `choices=("PICKUP", "DELIVERY")` + `CheckConstraint`.
- `delivery_address` (`JSONField`, default `{}`): `line`, `area`, `city`, `pincode`,
  `contact_phone`. Required when mode is `DELIVERY`, enforced in the service and by a DB check
  that it isn't `{}`.

New `RentalTransportRequest` (one per booking, `OneToOne`):

| Field | Notes |
| --- | --- |
| `booking` | `OneToOneField(RentalBooking, PROTECT)` |
| `status` | `REQUESTED → QUOTED → ACCEPTED → PAID → OUT_FOR_DELIVERY → DELIVERED`; terminal `DECLINED`, `REJECTED`, `EXPIRED`, `CANCELLED` |
| `trip` | `ONE_WAY` / `ROUND_TRIP` (set with the quote) |
| `customer_note` | Free text when requesting (floor, lift, access) |
| `quote_paise` | `PositiveIntegerField(null=True)`. Integer paise, server-stored, never computed |
| `quote_note` | Partner's vehicle/arrangement note |
| `quote_count` | ≤ 3 (DB check) |
| `quote_expires_at`, `requested_at`, `quoted_at`, `accepted_at`, `delivered_at` | Timestamps |
| `transport_fee_percent`, `transport_fee_paise` | Snapshot at accept (0 by R-5) |
| `payment_attempt` | `FK(commerce.PaymentAttempt, null=True, PROTECT)` |

Constraints: `quote_paise > 0` when status ∈ {QUOTED, ACCEPTED, PAID, OUT_FOR_DELIVERY, DELIVERED};
`payment_attempt` not null when status ∈ {PAID, OUT_FOR_DELIVERY, DELIVERED}.

`RentalAsset.delivery_available = BooleanField(default=False)` (R-7).

### 4.2 Booking state interplay

Booking status is unchanged (`PENDING_PAYMENT → CONFIRMED → HANDOVER → RETURNED`). For `DELIVERY`:
- `handover_booking` is refused until the transport request is `PAID`. The partner hands over on
  delivery with the same customer PIN, which also sets the transport request to `DELIVERED`.
- `create_booking` refuses `DELIVERY` when `asset.delivery_available` is false
  (`delivery_not_offered`) or when the address is incomplete (`delivery_address_invalid`).
- R-2 switch: `switch_to_pickup(booking)` sets mode to `PICKUP` and the transport request to
  `CANCELLED`. Allowed only before the transport is `PAID`.

### 4.3 Commands (domain services in `apps/rental/transport.py`)

All are `@transaction.atomic`, lock the transport row with `select_for_update`, check the actor,
and are idempotent on replay.

| Command | Actor | From → To |
| --- | --- | --- |
| `request_delivery` (inside `create_booking`) | customer | — → `REQUESTED` |
| `quote_transport(amount_paise, trip, note)` | partner | `REQUESTED`/`REJECTED` → `QUOTED` |
| `decline_transport(reason)` | partner | `REQUESTED` → `DECLINED` |
| `accept_quote()` → creates the `A7_RENTAL_TRANSPORT` PaymentAttempt | customer | `QUOTED` → `ACCEPTED` |
| `reject_quote(note)` | customer | `QUOTED` → `REJECTED` |
| capture callback `mark_transport_paid` | system | `ACCEPTED` → `PAID` |
| payment expiry | system | `ACCEPTED` → `QUOTED` (quote stays, can be accepted again until R-6) |
| `mark_out_for_delivery()` | partner | `PAID` → `OUT_FOR_DELIVERY` |
| `handover_booking(pin)` | partner | `PAID`/`OUT_FOR_DELIVERY` → `DELIVERED` |
| Celery beat `expire_transport_requests` | system | `REQUESTED`/`QUOTED` past R-6 → `EXPIRED` |
| `cancel_booking` (existing, extended) | either | Any non-terminal → `CANCELLED`, refunds a captured transport payment |

### 4.4 Payments (`apps/commerce`)

- Add `A7_RENTAL_TRANSPORT` to `PaymentAttempt.Purpose`, the purpose tuple at `models.py:140`, and
  the checkout/purpose check constraint (migration). Follow how `4d4b105` added
  `A9_STAY_SUBSCRIPTION`.
- `capture.py`: dispatch the new purpose to `rental.transport.mark_transport_paid`.
- `refunds.py`: full refund of the transport attempt on cancel before `DELIVERED`. After
  `DELIVERED`, transport isn't refundable through the customer cancel path. That goes to
  Operations.
- Idempotency key `a7-transport:{transport_request.id}:{quote_count}`, so a re-quote gets a fresh
  attempt and a replayed accept doesn't charge twice.
- Reuse the existing Razorpay adapter and Checkout handoff. No SDK. Tests use the provider fake.

### 4.5 Partner earning (`apps/payouts`)

Keep one EARNING per booking. `settle_rental_earning` adds the paid transport:
`gross = price_paise + transport_quote_paise`,
`commission = platform_fee_paise + transport_fee_paise`. The snapshot records `transport_paise`,
`transport_fee_paise` and `trip`. Unpaid or cancelled transport adds 0. The regression test pins
both the PICKUP (unchanged) and DELIVERY totals.

### 4.6 API (proposal → `contracts/proposals/a7-rental-delivery.md`)

| Method + path | Body / result |
| --- | --- |
| `POST /rentals/book` | Adds `pickup_or_delivery_mode: "PICKUP" \| "DELIVERY"`, `delivery_address{}`, `delivery_note` |
| `GET /me/rentals`, `GET /partner/rentals/bookings` | Booking adds `transport` (nullable object above) and `pickup_address` (§5) |
| `POST /me/rentals/{id}/transport/accept` | → `{payment: …}` same shape as booking payment init |
| `POST /me/rentals/{id}/transport/reject` | `{note}` |
| `POST /me/rentals/{id}/switch-to-pickup` | — |
| `POST /partner/rentals/bookings/{id}/transport/quote` | `{amount_paise, trip, note}` |
| `POST /partner/rentals/bookings/{id}/transport/decline` | `{reason}` |
| `POST /partner/rentals/bookings/{id}/transport/out-for-delivery` | — |

Errors visible to the user: `delivery_not_offered`, `delivery_address_invalid`,
`transport_state_invalid`, `quote_limit_reached`, `quote_expired`.

### 4.7 Notifications

Use the existing `_notify_rental` intents: delivery requested (→ partner), quote sent (→ customer),
quote accepted/paid (→ partner), quote rejected (→ partner), declined/expired (→ customer, with the
switch-or-cancel choice), out for delivery (→ customer).

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
  transport price. You pay it only if you accept."* Price summary: "Transport: quoted after
  booking".

Customer booking card: a transport status strip (Waiting for quote → Quote ₹X, one-way/round trip
[Accept & pay] [Reject] → Paid → Out for delivery → Delivered), plus a "Switch to self pickup"
action on decline/expiry. Self-pickup bookings show the same address block and View Location.

Partner booking sheet: delivery address, customer note, a quote form (₹ amount, trip, note),
Decline, Out for delivery. The ad editor gets structured address fields and a "Delivery available
on request" toggle. The hint "There is no delivery." is removed.

## 6. Design — Colour / material dropdowns

### Phase A (recommended now, R-9)

1. **Always offer the fields.** Define `COMMON_RENTAL_FIELDS = {"color", "material"}` in
   `field_options.py`. `get_rental_taxonomy()` merges them into every variant's `asset_schema`
   (with `examples`) when the schema lacks them, as optional properties. They're added at the
   serve layer, so there's no data migration and Operations-authored schemas still win.
   `create_asset`/`update_asset` validate against the same merged schema.
2. **Partner side:** no new component. `RentalFieldInput` already renders the dropdown and
   "Other…". Check that the editor renders the merged fields.
3. **Customer item page:** an "Item details" list rendering `structured_fields` with the schema
   titles, with Colour shown as a swatch chip for the known names.
4. **Customer browse:** Colour and Material `<select>` filters in `rental-filters.tsx`, options
   from `SUGGESTIONS`. `public_assets` adds `color` / `material` query params filtering
   `structured_fields__color__iexact`.

### Phase B (only if the client confirms a choosable variant)

`RentalAssetOption(asset, color, material, quantity_available)`. The book panel shows a required
dropdown per dimension, `RentalBookingLine.option` is snapshotted, and the availability sweep runs
per option. This changes stock accounting, so it gets its own plan before any build.

## 7. Work breakdown

| # | Task | Owner | Depends |
| --- | --- | --- | --- |
| T0 | Remove pickup-hours leftovers (R-0): `pickup_hours.py`, `test_pickup_times.py`, both `pickup-time.ts`, `rental-home.tsx` usage | Codex + Claude | — |
| T1 | Contract proposal `contracts/proposals/a7-rental-delivery.md` (§4.6, §5.2, §6 params) | Claude | R-1…R-9 |
| T2 | Structured pickup address: fields, data migration, serializer `pickup_address` + `maps_url`, publish check | Codex | T1 |
| T3 | Delivery domain: model, constraints, `transport.py` commands, `create_booking` change, beat expiry | Codex | T1 |
| T4 | `A7_RENTAL_TRANSPORT` payment purpose: capture, expiry, refund | Codex | T3 |
| T5 | Earning includes transport | Codex | T4 |
| T6 | Colour/material Phase A backend: merged schema + browse filter | Codex | T1 |
| T7 | Publish `contracts/openapi/v1.yaml`, regenerate `schema.d.ts` | Codex → Claude | T2–T6 |
| T8 | Customer: receive-method chooser, pickup address + View Location, delivery form | Claude | T7 |
| T9 | Customer: transport strip on the booking card (accept/pay, reject, switch) | Claude | T7 |
| T10 | Partner: structured address + delivery toggle in the editor, quote/decline/out-for-delivery in the booking sheet | Claude | T7 |
| T11 | Customer: item details list + colour/material filters | Claude | T7 |

## 8. Tests to write

Backend (`backend/tests/rental/`):
- `test_transport_flow.py`: each transition in §4.3, every illegal transition refused, quote cap,
  replayed accept charges once, payment expiry returns to QUOTED, R-6 expiry, switch-to-pickup,
  cancel refunds rental + deposit + transport, handover blocked until PAID.
- `test_a7_flow.py`: rewrite the coercion test so `DELIVERY` is kept when offered and refused with
  `delivery_not_offered` otherwise.
- `test_pickup_address.py`: profile → asset copy, override, pincode check, `maps_url` encoding
  (commas, `&`, `#`, non-ASCII), legacy `location_text` migration.
- `test_rental_payout.py`: earning with and without paid transport.
- `test_field_options.py`: merged schema adds colour/material, keeps an Ops-authored property,
  browse filter.

Frontend (Vitest): `rental-book-panel.test.tsx` (chooser, address block, link `href`/`target`/
`rel`, delivery form validation), `rental-booking-card.test.tsx` (each transport state),
partner booking-sheet quote form, item details list.

## 9. Acceptance

- Self Pickup: the customer sees the full address and View Location opens Google Maps searching
  for that address. No transport line in the price.
- Delivery: booking → partner quote → customer accepts and pays through Razorpay test mode →
  partner delivers with the PIN → rental starts. The partner's earning includes the transport.
- Decline, reject or expiry always leaves the customer a working choice: switch to pickup or a full
  refund.
- No transport price is ever computed by the platform. Every amount is the partner's quote, stored
  in paise.
- Every rental ad offers colour and material dropdowns, and customers see and filter by them.
