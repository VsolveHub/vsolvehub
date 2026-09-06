# Proposal 0017: A7 Rental Archetype Frontend Contract

**Owner:** Frontend & Archetype Workstream  
**Status:** Published (OpenAPI 1.53.0+)  
**Applies to:** Customer App, Partner App, Operations Workspace  

## 1. Overview & Consuming Applications

The A7 Rental engine powers serialized and pooled item rentals with database-backed inventory overlap/capacity controls, separate booking and deposit payment captures, handover/return verification, extension workflows, and two-person maker-checker settlement.

### Consuming Applications & Primary Routes
1. **Customer App (`customer`)**:
   - Browse catalog / grouped rental listings: `GET /api/v1/rentals/listings/`
   - Create 15-minute reservation hold: `POST /api/v1/rentals/holds/`
   - Initiate split provider checkout (booking fee + security deposit): `POST /api/v1/rentals/holds/<uuid:hold_id>/checkout/`
   - Active booking details & lifecycle: `GET /api/v1/rentals/bookings/<uuid:booking_id>/`
   - Request duration extension: `POST /api/v1/rentals/bookings/<uuid:booking_id>/extend/`
   - Customer cancellation: `POST /api/v1/rentals/bookings/<uuid:booking_id>/cancel/`

2. **Partner Portal (`partner`)**:
   - Manage inventory items (serialized & pooled): `GET|POST /api/v1/rentals/partner/assets/`
   - Serialized inventory listing & status updates: `GET|PATCH /api/v1/rentals/partner/assets/<uuid:asset_id>/`
   - Dispatch / Handover verification with evidence: `POST /api/v1/rentals/partner/bookings/<uuid:booking_id>/handover/`
   - Return check-in & initial condition assessment: `POST /api/v1/rentals/partner/bookings/<uuid:booking_id>/return/`

3. **Operations Workspace (`admin`)**:
   - Equivalent serialized asset reassignment: `POST /api/v1/rentals/operations/bookings/<uuid:booking_id>/reassign/`
   - Settlement case creation: `POST /api/v1/rentals/operations/settlements/`
   - Maker-checker dual-approval: `POST /api/v1/rentals/operations/settlements/<uuid:case_id>/approve/`

---

## 2. Authorization & Headers

- **Authentication**: Bearer token session authentication.
- **Partner Role**: Requires an approved and unexpired A7 capability (`A7_RENTAL`). Asset creation additionally checks variant-level capability.
- **Operations Role**: Requires `is_staff` with active Operations role (`can_operate_archetypes` or specific operational permissions).
- **Idempotency**: All state-mutating endpoints (`POST`, `PATCH`) require `X-Idempotency-Key: <uuid-or-unique-string>`.

---

## 3. Example Request & Response Payloads

### 3.1 Browse Grouped Listings
**`GET /api/v1/rentals/listings/?variant=bike-rental-std&start_date=2026-09-10&end_date=2026-09-15`**

Response `200 OK`:
```json
{
  "items": [
    {
      "group_id": "grp_bike_gear_bangalore",
      "variant_code": "bike-rental-std",
      "title": "Mountain Explorer 21-Speed",
      "deposit_paise": 500000,
      "daily_rate_paise": 75000,
      "available_quantity": 4,
      "delivery_modes": ["PICKUP", "DOORSTEP"],
      "attributes": {
        "frame_size": "M",
        "gear_type": "Shimano 21-speed"
      }
    }
  ],
  "total": 1
}
```

### 3.2 Create Hold
**`POST /api/v1/rentals/holds/`**
Headers: `X-Idempotency-Key: hold-a7-99124-uuid`

Request:
```json
{
  "variant_code": "bike-rental-std",
  "quantity": 1,
  "start_date": "2026-09-10T09:00:00Z",
  "end_date": "2026-09-15T09:00:00Z",
  "delivery_mode": "DOORSTEP",
  "address_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

Response `201 Created`:
```json
{
  "hold_id": "b18a8f10-1e5b-4375-8e7c-a4ec6784d101",
  "status": "HELD",
  "expires_at": "2026-09-05T20:45:00Z",
  "pricing_breakdown": {
    "rental_fee_paise": 375000,
    "deposit_paise": 500000,
    "tax_paise": 67500,
    "total_payable_paise": 942500
  }
}
```

### 3.3 Checkout (Payment Attempt Initiation)
**`POST /api/v1/rentals/holds/b18a8f10-1e5b-4375-8e7c-a4ec6784d101/checkout/`**
Headers: `X-Idempotency-Key: pay-chk-99124-uuid`

Response `200 OK`:
```json
{
  "booking_attempt_id": "att_rent_bkg_12345",
  "deposit_attempt_id": "att_rent_dep_12345",
  "provider": "RAZORPAY",
  "booking_order_id": "order_RzpRentBkg99",
  "deposit_order_id": "order_RzpRentDep99",
  "total_amount_paise": 942500,
  "allocations": [
    {"purpose": "RENTAL_FEE", "amount_paise": 442500, "status": "PENDING"},
    {"purpose": "SECURITY_DEPOSIT", "amount_paise": 500000, "status": "PENDING"}
  ]
}
```

---

## 4. Error Outcomes & User Recovery

| HTTP Status | Error Code | Meaning | User Recovery |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | Dates invalid, duration outside min/max limits, or missing schema fields | Highlight invalid field in form, enforce category JSON-schema constraints |
| `409 Conflict` | `INSUFFICIENT_INVENTORY` | Desired pooled or serialized unit overlap collided | Offer nearest alternative start/end window or alternative grouped listing |
| `409 Conflict` | `HOLD_EXPIRED` | 15-minute reservation hold expired before checkout capture | Prompt customer to renew the hold with updated live availability |
| `409 Conflict` | `PAYMENT_MISMATCH` | Captured payment amount or purpose allocation forged/mismatched | Hard refusal; release hold and trigger automated refund for sibling captured attempt |
| `403 Forbidden` | `CAPABILITY_UNAPPROVED` | Partner lacks approved A7 capability | Direct partner to onboarding and document upload flow |

---

## 5. Operations Reassignment & Maker-Checker Settlement

- **Reassignment**: Operations can reassign a booking to an equivalent active asset within the same variant. Triggers `rental.asset_reassigned` event and notifies the customer via SMS/push.
- **Maker-Checker Settlement**:
  - Maker initiates settlement with condition evidence (`damage_amount_paise`, item photos, inspector notes).
  - Checker (a distinct Operations staff member) approves settlement. Idempotency guarantees prevent single-actor approval.
