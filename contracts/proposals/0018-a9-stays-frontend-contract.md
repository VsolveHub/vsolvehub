# Proposal 0018: A9 Stays Archetype Frontend Contract

**Owner:** Frontend & Archetype Workstream  
**Status:** Published (OpenAPI 1.53.0+)  
**Applies to:** Customer App, Partner App, Operations Workspace  

## 1. Overview & Consuming Applications

The A9 Stays engine models physical properties, unit types, and physical units with calendar exclusion holds, effective-dated pricing and cancellation policies, independent stay extension deposit deltas, host maintenance unit blocks triggering operations recovery, and two-person maker-checker damage settlement.

### Consuming Applications & Primary Routes
1. **Customer App (`customer`)**:
   - Filter metadata authority: `GET /api/v1/stays/filter-definitions/` (derived from canonical `ServiceQuestion` / `ServiceQuestionOption`)
   - Browse properties with availability: `GET /api/v1/stays/properties/`
   - Property details & unit types: `GET /api/v1/stays/properties/<uuid:property_id>/`
   - Create stay hold: `POST /api/v1/stays/holds/`
   - Initiate stay payment (stay tariff + security deposit): `POST /api/v1/stays/holds/<uuid:hold_id>/checkout/`
   - View stay reservation: `GET /api/v1/stays/reservations/<uuid:reservation_id>/`
   - Request stay extension: `POST /api/v1/stays/reservations/<uuid:reservation_id>/extend/`
   - Customer cancellation / Early checkout: `POST /api/v1/stays/reservations/<uuid:reservation_id>/cancel/`

2. **Partner Portal (`partner`)**:
   - Manage properties & policies: `GET|POST|PATCH /api/v1/stays/partner/properties/`
   - Manage unit types & pricing rules: `GET|POST|PATCH /api/v1/stays/partner/unit-types/`
   - Manage physical units: `GET|POST /api/v1/stays/partner/units/`
   - Host block physical unit (maintenance): `POST /api/v1/stays/partner/units/<uuid:unit_id>/block/`
   - Check-in condition recording (with photo evidence & masked ID): `POST /api/v1/stays/partner/reservations/<uuid:reservation_id>/check-in/`
   - Check-out condition & damage reporting: `POST /api/v1/stays/partner/reservations/<uuid:reservation_id>/check-out/`

3. **Operations Workspace (`admin`)**:
   - Recovery required queue (triggered by host unit block or double-booking): `GET /api/v1/stays/operations/recovery/`
   - Operations unit reassignment (preserves room type & commercial terms): `POST /api/v1/stays/operations/reservations/<uuid:reservation_id>/reassign/`
   - Maker-checker damage case settlement: `POST /api/v1/stays/operations/settlements/<uuid:case_id>/approve/`

---

## 2. Authorization & Headers

- **Authentication**: Bearer token session authentication.
- **Partner Role**: Requires an approved and unexpired A9 capability (`A9_STAY`). Room-type creation requires approved capability for the exact A9 variant.
- **Operations Role**: Requires active Operations permission (`can_operate_archetypes` or specific operational permissions).
- **Idempotency**: All mutating endpoints require `X-Idempotency-Key: <uuid-or-unique-string>`.

---

## 3. Example Request & Response Payloads

### 3.1 Stay Filter Definitions
**`GET /api/v1/stays/filter-definitions/`**

Response `200 OK`:
```json
{
  "filters": [
    {
      "key": "sharing_type",
      "label": "Sharing Type",
      "question_type": "SINGLE_SELECT",
      "options": [
        {"value": "PRIVATE", "label": "Private Room / 1-Sharing"},
        {"value": "DOUBLE", "label": "2-Sharing"},
        {"value": "TRIPLE", "label": "3-Sharing"},
        {"value": "FOUR_PLUS", "label": "4+ Sharing / Dormitory"}
      ]
    },
    {
      "key": "amenities",
      "label": "Amenities",
      "question_type": "MULTI_SELECT",
      "options": [
        {"value": "is_ac", "label": "Air Conditioning"},
        {"value": "wifi", "label": "High-Speed WiFi"},
        {"value": "power_backup", "label": "Power Backup"}
      ]
    }
  ]
}
```

### 3.2 Request Stay Extension with Independent Deposit Delta
**`POST /api/v1/stays/reservations/3c9e3e21-0a41-4775-bf7d-93f8e5d629a8/extend/`**
Headers: `X-Idempotency-Key: ext-stay-4491-uuid`

Request:
```json
{
  "additional_months": 1,
  "additional_deposit_paise": 250000
}
```

Response `201 Created`:
```json
{
  "extension_id": "ext_882910fa_bc12",
  "reservation_id": "3c9e3e21-0a41-4775-bf7d-93f8e5d629a8",
  "additional_months": 1,
  "extension_fee_paise": 1500000,
  "additional_deposit_paise": 250000,
  "tax_paise": 270000,
  "total_payable_paise": 2020000,
  "status": "AWAITING_PAYMENT"
}
```

### 3.3 Host Block Unit (Maintenance)
**`POST /api/v1/stays/partner/units/unit_b2a1_9918/block/`**
Headers: `X-Idempotency-Key: blk-unit-8812-uuid`

Request:
```json
{
  "reason": "Plumbing emergency in attached bathroom",
  "expected_available_date": "2026-09-25"
}
```

Response `200 OK`:
```json
{
  "unit_id": "unit_b2a1_9918",
  "current_status": "MAINTENANCE",
  "affected_reservations_count": 1,
  "recovery_initiated": true
}
```

---

## 4. Error Outcomes & User Recovery

| HTTP Status | Error Code | Meaning | User Recovery |
|---|---|---|---|
| `409 Conflict` | `UNIT_UNAVAILABLE` | All units under selected UnitType are locked or held | Display alternative UnitTypes at same property or neighboring properties |
| `409 Conflict` | `RECOVERY_REQUIRED` | Confirmed unit blocked by host or affected by maintenance | Operations team receives immediate alert; Customer sees reassurance card with guaranteed equivalent reassignment |
| `400 Bad Request` | `INVALID_POLICY_WINDOW` | Stay duration violates minimum stay or guest count exceeds capacity | Display clear form feedback with property policy rules |
| `403 Forbidden` | `CROSS_PROPERTY_FORBIDDEN` | Unit created with UnitType belonging to different property | Hard validation error in Partner portal form |

---

## 5. Security & Masking

- Raw identity documents/numbers provided during check-in are strictly write-only: stored records contain only SHA-256 hash and masked strings (e.g. `XXXX-XXXX-1234`).
- Damage claims require matching check-in condition records and timestamped checkout evidence.
