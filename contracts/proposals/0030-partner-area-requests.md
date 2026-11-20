# 0030 — Partner area requests and Step 3 flow

Status: **Draft** (accompanies `docs/onboarding-step3-flow/FLOW.md` and `IMPLEMENTATION_PLAN.md`).

## Why

During onboarding Step 3 ("Where you work"), a partner who works in an area we do not cover yet,
or an area currently closed to new partners, has no path forward. Today:
1. `GET /api/v1/service-areas/` returns only open areas without postal code mapping.
2. If no open areas exist, the applicant encounters a dead end.
3. If an area closes between loading and saving, the whole save fails with a generic 409 error.
4. Partners cannot register interest in unserved PINs, leaving Operations blind to local demand.
5. Applicants with 0 service areas are blocked from submitting, even if Operations could later open their area.

## The idea in one line

Partners can tick open areas and/or submit up to 5 6-digit Indian PINs where they want to work.
Applications can be submitted with 0 areas as long as at least 1 PIN is requested; their state
is evaluated live (`Waiting`, `Area full`, `Ready`, `Done`, `Not valid`).

---

## 1. Partner API changes

### 1.1 `GET /api/v1/service-areas/`
Each service area item gains `postal_codes`:

```json
{
  "id": "c1f7a184-7a3b-488d-bb57-9db9b9f5cf21",
  "slug": "hyderabad-central",
  "name": "Hyderabad Central",
  "timezone": "Asia/Kolkata",
  "is_accepting_partners": true,
  "postal_codes": ["500001", "500002", "500004", "500029"]
}
```

### 1.2 `PATCH /api/v1/partner/application/`
Accepts `requested_postal_codes` (only valid for `track: "SERVICES"`):

```json
{
  "expected_version": 2,
  "service_area_ids": ["c1f7a184-7a3b-488d-bb57-9db9b9f5cf21"],
  "requested_postal_codes": ["509216", "509001"]
}
```

Rules:
- 6 digits, first digit 1–9 (`^[1-9][0-9]{5}$`).
- Max 5 PINs per application. Duplicates are deduplicated.
- If omitted or `null`, existing requests are untouched. If provided as a list, it replaces the set.
- A non-`SERVICES` track sending this field receives 400.

### 1.3 `GET /api/v1/partner/application/`
Reads include `requested_postal_codes` and `area_requests`:

```json
{
  "id": "84820d91-6277-4b19-9407-16474f76269b",
  "status": "DRAFT",
  "track": "SERVICES",
  "service_area_ids": ["c1f7a184-7a3b-488d-bb57-9db9b9f5cf21"],
  "requested_postal_codes": ["509216"],
  "area_requests": [
    {
      "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
      "postal_code": "509216",
      "place": "Shadnagar",
      "status": "WAITING",
      "covering_area_id": null,
      "covering_area_name": null,
      "created_at": "2026-11-19T10:00:00Z"
    }
  ]
}
```

### 1.4 Save conflict error: unavailable service areas
When an applicant attempts to save service areas that closed since the screen opened:

**Status:** `409 Conflict`
**Payload:**
```json
{
  "error": {
    "code": "partner_service_areas_unavailable",
    "message": "One or more selected service areas are unavailable.",
    "details": {
      "unavailable_service_area_ids": [
        "c1f7a184-7a3b-488d-bb57-9db9b9f5cf21"
      ]
    },
    "retryable": false,
    "request_id": "req-12345"
  }
}
```

The client drops only the unavailable IDs, displays an alert, and re-submits the remaining choices.

---

## 2. Operations API changes

### 2.1 Queue filter: `area_pending`
`GET /api/v1/operations/partner-applications/?area_pending=true`
Filters for applications that are `SUBMITTED` or `UNDER_REVIEW`, have 0 active area links, and
have at least 1 non-dismissed area request.

### 2.2 Review read model
`GET /api/v1/operations/partner-applications/{id}/` includes:
- `area_requests`: list of `AreaRequest` objects with live status.
- `service_areas`: enriched list of objects:
  - `id`: uuid
  - `name`: string
  - `zone`: string or null
  - `hours_set`: boolean (whether active working hours exist for this area)
  - `offers_partner_trades`: boolean (false indicates trade/area mismatch)

### 2.3 Command: remove area during review
`POST /api/v1/operations/partner-applications/{id}/remove-area/`

```json
{
  "expected_version": 3,
  "service_area_id": "c1f7a184-7a3b-488d-bb57-9db9b9f5cf21",
  "reason": "Approve without Miyapur"
}
```

Deactivates the `PartnerServiceArea` link and deactivates any `PartnerAvailabilityRule` rows
belonging to that area for this partner. Returns 400 if removing this area leaves 0 areas and
the partner has no area requests.

---

## 3. Live Request Status Evaluation

Statuses are evaluated dynamically and never stored statically:
- `NOT_VALID`: `dismissed_at` is set.
- `DONE`: Partner holds an active link to an area covering this PIN.
- `READY`: An active area accepting partners covers this PIN.
- `AREA_FULL`: An active area covers this PIN but is not accepting partners (`is_accepting_partners=False`).
- `WAITING`: No active area covers this PIN.
