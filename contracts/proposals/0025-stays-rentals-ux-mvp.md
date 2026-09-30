# Proposal 0025 — Stays & Rentals UX MVP

**Author:** Cursor (Stays/Rentals UX MVP)  
**Date:** 29 September 2026  
**Status:** **Published** (backend + OpenAPI aligned)  
**Consuming applications:** Partner stays/rentals workspaces, Customer stays/rentals, Operations moderation  

> Numbering note: Earlier drafts used colliding filenames `0021-stays-rentals-ux-mvp.md` and
> `0022-stays-rentals-ux-mvp.md`. Those IDs already belong to Customer Coins (`0021`) and Customer
> Referral (`0022`). This proposal is the single non-colliding stays/rentals UX contract at **0025**.

## 1. Product Law

1. **Stays are property-first:** Partners register a `Property`, then attach zero-or-more `Unit`s.
2. **Min stay + availability window:** Live on `Property` (`min_stay_nights`, `available_from`,
   `available_until`) and are enforced on quote, enquire, and reserve with stable error codes.
3. **Rentals stock (sum of quantity):** `RentalAsset.quantity_available` caps concurrent overlapping
   reservations by the **sum of booking-line quantities** (`RentalBookingLine.quantity`), not by
   the count of reservation rows.
4. **Rapido-style handover PIN:** One 4-digit PIN per customer stored solely in
   `User.rental_handover_pin_hash` (no separate plaintext column — MVP stores the 4-digit PIN string
   in that field for local-dev simplicity; column name retains `*_hash` for forward-compatible
   cryptographic hashing). Partner collects it verbally at pickup and submits it via the handover
   action; customer sees it on their booking card when in `CONFIRMED` or `HANDOVER` status. Partner
   responses never disclose the customer's PIN.
5. **Unified action path architecture:** State transitions on partner rental bookings are executed via
   the action path template `POST /api/v1/partner/rentals/bookings/{booking_id}/{action}` with request schema
   `PartnerBookingActionRequest` (`pin`, `reason`, `consume_paise`). Valid actions are `handover`, `return`,
   `release-deposit`, and `dispute-deposit`.
6. **Deposit dispute:** After `RETURNED`, partner may invoke `dispute-deposit` (partial, full, or zero
   consume) instead of full release; booking status transitions to `DISPUTED`. An omitted or blank
   `consume_paise` defaults to `0` (dispute recorded for Ops without immediate withhold), never a silent full consume.
7. **Partner address prefill:** `PartnerProfile.default_location_text` is exposed on `/api/v1/partner/me`
   (GET and PATCH) and used as fallback when creating a rental asset or stay property without `location_text`.
8. **Enquiry confirm holds calendar:** Host `confirm_enquiry` creates a `CONFIRMED` `UnitReservation`;
   enquiry cancellation (`cancel_enquiry`) releases the reservation hold (`RELEASED`).

## 2. New / Changed Fields

| Model | Field | Type / Default | Notes |
| --- | --- | --- | --- |
| `stay.Property` | `min_stay_nights` | `int` (default `1`) | Minimum required nights for stay quotes and bookings |
| `stay.Property` | `available_from` | `date` (nullable) | Earliest permitted check-in date |
| `stay.Property` | `available_until` | `date` (nullable) | Latest permitted check-out date |
| `stay.StayEnquiry` | `unit_reservation` | `OneToOneField` (nullable) | Set on host confirm to hold unit calendar; released on cancel |
| `partners.PartnerProfile` | `default_location_text` | `CharField` (default `""`) | Default pickup/property location prefill for partner listings |
| `identity.User` | `rental_handover_pin_hash` | `CharField(255)` (default `""`) | **Sole** PIN store; MVP stores 4-digit plaintext digits; `*_hash` retained for forward compat |
| `rental.RentalAsset` | `quantity_available` | `PositiveIntegerField` (min `1`) | Total inventory available; `0` blocked by DB constraint (`fail-closed`) |
| `rental.RentalBookingLine` | `quantity` | `PositiveIntegerField` (default `1`) | Units reserved in booking; aggregated when checking stock limits |

## 3. Endpoints

### Rental Endpoints

| Method | Path | Auth | Request Body | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/rentals` | Public | — | Browse published rental assets (filters `quantity_available >= 1` and stock availability) |
| `GET` | `/api/v1/rentals/taxonomy` | Public | — | Subcategories and variants for rental search |
| `GET` | `/api/v1/rentals/{asset_id}` | Public | — | Rental asset detail |
| `POST` | `/api/v1/rentals/book` | Customer | `CreateBookingRequest` | Book rental with requested `quantity` |
| `GET` | `/api/v1/me/rentals` | Customer | — | Customer rental bookings; includes `handover_pin` when `CONFIRMED` or `HANDOVER` |
| `POST` | `/api/v1/me/rentals/{booking_id}/cancel` | Customer | — | Cancel booking before handover (`PENDING_PAYMENT` or `CONFIRMED`) |
| `POST` | `/api/v1/partner/rentals/photos` | Partner | `multipart/form-data` | Upload rental asset photo |
| `GET` | `/api/v1/partner/rentals/assets` | Partner | — | List partner rental assets |
| `POST` | `/api/v1/partner/rentals/assets` | Partner | `CreateAssetRequest` | Create rental asset (accepts `quantity_available`) |
| `POST` | `/api/v1/partner/rentals/assets/{asset_id}/{action}` | Partner | — | Asset actions: `submit` for moderation |
| `GET` | `/api/v1/partner/rentals/bookings` | Partner | Query: `status` | List partner bookings (filtered by status; `handover_pin` is null) |
| `POST` | `/api/v1/partner/rentals/bookings/{booking_id}/{action}` | Partner | `PartnerBookingActionRequest` | Action path: `handover`, `return`, `release-deposit`, `dispute-deposit` |
| `GET` | `/api/v1/ops/rentals` | Operations | — | List rental assets for ops moderation |
| `POST` | `/api/v1/ops/rentals/{asset_id}/moderate` | Operations | `RentalModerationSerializer` | Moderate asset (`APPROVE`, `REJECT`, `REMOVE`, `REINSTATE`) |

### Stay Endpoints

| Method | Path | Auth | Request Body | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/stays` | Public | — | Browse stay properties |
| `GET` | `/api/v1/stays/taxonomy` | Public | — | Subcategories and variants for stay search |
| `POST` | `/api/v1/stays/quote` | Public | `StayQuoteRequest` | Calculate quote; enforces min stay and availability dates |
| `POST` | `/api/v1/stays/enquire` | Customer | `StayEnquireRequest` | Submit booking enquiry |
| `POST` | `/api/v1/stays/reserve` | Customer | `StayReserveRequest` | Direct reservation request |
| `GET` | `/api/v1/stays/{property_id}` | Public | — | Stay property detail |
| `GET` | `/api/v1/me/stay-enquiries` | Customer | — | List customer stay enquiries |
| `POST` | `/api/v1/me/stay-enquiries/{enquiry_id}/cancel` | Customer | — | Cancel customer stay enquiry |
| `GET` | `/api/v1/me/stay-reservations` | Customer | — | List customer stay reservations |
| `POST` | `/api/v1/me/stay-reservations/{reservation_id}/cancel` | Customer | — | Cancel customer stay reservation |
| `POST` | `/api/v1/partner/stays/photos` | Partner | `multipart/form-data` | Upload stay property photo |
| `GET` | `/api/v1/partner/stays/properties` | Partner | — | List partner properties (includes `min_stay_nights`, dates) |
| `POST` | `/api/v1/partner/stays/properties` | Partner | `CreatePropertyRequest` | Create property (`min_stay_nights`, `available_from`, `available_until`) |
| `GET` | `/api/v1/partner/stays/properties/{property_id}` | Partner | — | Property detail |
| `PATCH` | `/api/v1/partner/stays/properties/{property_id}` | Partner | Partial `Property` | Update property |
| `POST` | `/api/v1/partner/stays/properties/{property_id}/{action}` | Partner | — | Property actions: `submit` for moderation |
| `GET` | `/api/v1/partner/stays/properties/{property_id}/units` | Partner | — | List units for property |
| `POST` | `/api/v1/partner/stays/properties/{property_id}/units` | Partner | `CreateUnitRequest` | Add unit to property (`name`, `nightly_rate_paise`, `sharing_count`) |
| `PATCH` | `/api/v1/partner/stays/units/{unit_id}` | Partner | Partial `Unit` | Update unit details |
| `GET` | `/api/v1/partner/stays/enquiries` | Partner | — | List stay enquiries |
| `POST` | `/api/v1/partner/stays/enquiries/{enquiry_id}/confirm` | Partner | — | Host confirms enquiry and holds unit reservation |
| `POST` | `/api/v1/partner/stays/enquiries/{enquiry_id}/cancel` | Partner | — | Host declines/cancels enquiry (releases reservation hold) |
| `POST` | `/api/v1/partner/stays/enquiries/{enquiry_id}/respond` | Partner | `StayEnquiryResponse` | Host sends response message to guest |
| `GET` | `/api/v1/partner/stays/reservations` | Partner | — | List stay reservations |
| `POST` | `/api/v1/partner/stays/reservations/{reservation_id}/{action}` | Partner | — | Reservation actions: `accept`, `decline`, `check-in`, `check-out`, `cancel` |
| `GET` | `/api/v1/ops/stays` | Operations | — | Ops property list for moderation |
| `POST` | `/api/v1/ops/stays/{property_id}/moderate` | Operations | `StayModerationSerializer` | Moderate property (`APPROVE`, `REJECT`, etc.) |

### Partner Profile Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/partner/me` | Partner | Returns profile including `default_location_text` |
| `PATCH` | `/api/v1/partner/me` | Partner | Updates profile fields including `default_location_text` |

## 4. Error Codes (envelope `error.code`)

| Code | When | Resolution / User Message |
| --- | --- | --- |
| `min_stay_not_met` | Requested duration in nights < `Property.min_stay_nights` | Show minimum stay policy message; user extends date range |
| `dates_unavailable` | Requested dates fall outside `available_from` / `available_until` or unit is already booked/held | User selects dates within property availability window |
| `out_of_stock` | Overlapping reserved quantity equals or exceeds `RentalAsset.quantity_available`, or stock `< 1` | User picks an alternative date window or different asset |
| `insufficient_quantity` | Requested `quantity` exceeds remaining unreserved stock for the selected date window | User reduces quantity to match remaining available stock |
| `handover_pin_invalid` | Partner provided PIN does not match `User.rental_handover_pin_hash` (constant-time check) | Partner re-enters the 4-digit code provided by customer |
| `stay_state_invalid` | Invalid lifecycle transition on stay enquiry, property, or reservation | Generic domain error envelope with specific refusal reason |
| `rental_state_invalid` | Invalid lifecycle transition on rental booking or asset | Generic domain error envelope with specific refusal reason |

## 5. Example Payloads

### Create Stay Property (without initial unit)

```json
{
  "variant_id": "0191c78e-0123-7abc-8def-0123456789ab",
  "title": "Sunrise PG & Co-Living",
  "location_text": "Madhapur, Hyderabad",
  "min_stay_nights": 15,
  "available_from": "2026-10-01",
  "available_until": "2027-03-31",
  "image_urls": ["https://assets.vsolvehub.com/stay-photos/abc-123.jpg"]
}
```

### Add Unit to Property

```json
{
  "name": "Deluxe Twin Room",
  "nightly_rate_paise": 120000,
  "sharing_count": 2
}
```

### Create Rental Asset with Stock

```json
{
  "variant_id": "0191c78e-4567-7abc-8def-0123456789ab",
  "title": "Sony Alpha A7 IV Camera Kit",
  "description": "Full frame mirrorless camera with 24-70mm GM lens",
  "daily_rate_paise": 250000,
  "deposit_paise": 500000,
  "quantity_available": 5,
  "location_text": "Hitech City pickup bay"
}
```

### Partner Rental Booking Actions (`PartnerBookingActionRequest`)

**Handover:**
```json
{
  "pin": "4821",
  "reason": "",
  "consume_paise": 0
}
```

**Dispute Deposit (Partial Withhold):**
```json
{
  "pin": "",
  "reason": "Scratched front lens element",
  "consume_paise": 30000
}
```

**Dispute Deposit (Zero Withhold / Ops Review Only):**
```json
{
  "pin": "",
  "reason": "Returned without accessories pouch; partner flagged for ops review",
  "consume_paise": 0
}
```

**Release Deposit / Return:**
```json
{
  "pin": "",
  "reason": "",
  "consume_paise": 0
}
```

### Customer Rental Booking Readout (with PIN)

```json
{
  "id": "0192305a-8b1e-7f41-a5d2-0690184e5512",
  "status": "CONFIRMED",
  "start_date": "2026-10-05",
  "end_date": "2026-10-08",
  "quantity": 2,
  "price_paise": 1500000,
  "pickup_or_delivery_mode": "PICKUP",
  "handover_pin": "4821",
  "asset": {
    "id": "0192305a-5e04-7622-a5d2-0690184e5512",
    "title": "Sony Alpha A7 IV Camera Kit",
    "daily_rate_paise": 250000,
    "deposit_paise": 500000,
    "quantity_available": 5,
    "location_text": "Hitech City pickup bay"
  },
  "deposit": {
    "status": "HELD",
    "amount_paise": 1000000,
    "consumed_paise": 0
  }
}
```

## 6. Stock, Hold, and Payment Invariants

- **Stock summation:** Overlap uses `sum(RentalBookingLine.quantity)` across all active holds
  (`AssetReservation.Status` in `TENTATIVE`, `CONFIRMED`) excluding `CANCELLED` and `RETURNED` bookings.
- **Fail-closed minimum stock:** `quantity_available < 1` is non-bookable (`out_of_stock`). Database
  constraint `rental_rentalasset_quantity_available_gte_1` ensures zero-stock rows cannot be saved.
- **Browse visibility:** `public_assets(start, end)` filters `quantity_available >= 1` and excludes
  assets where overlapping reserved quantity meets or exceeds `quantity_available`.
- **Payment initiation amount:** Multi-quantity rentals multiply both rental fee and security deposit
  by line quantity: `(daily_rate_paise * days * quantity) + (deposit_paise * quantity)`.
- **Hold release on cancellation & expiry:** `cancel_booking` and background payment-expiry sweepers
  transition `AssetReservation` to `RELEASED`, restoring available stock.
- **Ghost hold reconciliation:** `repair_ghost_asset_holds()` and the `repair_rental_ghost_holds`
  management command identify and release any lingering `CONFIRMED` or `TENTATIVE` holds under
  `CANCELLED` or `RETURNED` bookings.

## 7. Operations & Monitoring

- **Ops dashboard navigation:** Operations Kind dashboard metric tiles link directly to corresponding consoles
  (cases, rentals, stays, partners, and reports).
- **Listing moderation:** Ops moderation commands for stays and rentals inspect partner profile, uploaded media,
  rates, and minimum stay rules before approving to `PUBLISHED` state.
