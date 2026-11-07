# 0030. Rides V1: rider, captain and Operations API

- Status: Proposed. Two captain endpoints are Published at contract 1.99.0; the rest is proposed.
- Date: 2026-11-07
- Brief: `docs/rapido/README.md` §5.10 · ADR: `docs/adr/0013-rides-v1.md`
- Numbering: the brief calls this proposal 0029; that number is already
  `0029-operations-partner-import.md`.

## How to read this proposal

Every endpoint carries one of two marks.

| Mark | Meaning |
| --- | --- |
| ✅ **Implemented** | Built in `backend/apps/rides`, tested in `backend/tests/rides`, published in `contracts/openapi/v1.yaml` 1.99.0. The examples are real responses captured from the server. |
| 📝 **Proposed** | Not built. The path, shapes, codes and messages are what this proposal asks for. They may change when the endpoint is implemented, and this file is updated when they do. |

Implemented today: `GET partner/rides/me/` and `PUT partner/rides/vehicle/`. Everything else is
proposed.

## Consuming applications

| Surface | App and route | Role |
| --- | --- | --- |
| Rider | Customer mobile, `app/(tabs)/rides/*` (Android and iOS) | `customer` |
| Captain | Captain mobile, `com.vsolvehub.captain` (Android) | `partner`, application track `RIDE_CAPTAIN` |
| Operations | Admin web, `/operations/rides/*` | `operations` |

## Conventions

**Base path** `/api/v1/`. Rider endpoints are under `rides/`, captain endpoints under `partner/rides/`,
Operations endpoints under `operations/rides/`.

**Authentication.** The same session the existing apps use for the role. A request without a session,
or with a session for the wrong role, is refused before any Rides rule runs (see *Access errors*).

**Money** is integer paise. **Times** are ISO 8601 UTC. **Every countdown** is an `expires_at` from the
server; the apps draw it with `useServerCountdown` (ADR-0005) and never compute a deadline.

**No placeholder data.** A field the server cannot fill truthfully is `null` or absent, and the app
shows an honest empty or error state. There is no straight-line ETA and no fallback fare.

**The error envelope** is the shared one from `common/errors/handler.py`. A real response:

```json
{
  "error": {
    "code": "registration_already_used",
    "message": "This registration number is already registered to another captain.",
    "details": {
      "message": "This registration number is already registered to another captain.",
      "code": "registration_already_used"
    },
    "retryable": false,
    "request_id": "5eae8112-163d-482e-99a2-81514d53d6ba"
  }
}
```

Apps branch on `error.code`, show `error.message` to the user, and use `error.retryable` to decide
whether to offer "Try again". `request_id` goes in support reports.

**Validation errors** use `code: "validation_error"` with per-field `details`. A real response:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": {
      "vehicle_type": [{ "message": "\"TRUCK\" is not a valid choice.", "code": "invalid_choice" }]
    },
    "retryable": false,
    "request_id": "f0215148-09a9-44f4-b607-ed9d5d6999ca"
  }
}
```

### Idempotency

Commands a phone may send twice (a retry after a timeout, a double tap) take an `Idempotency-Key`
header. They use the existing `execute_idempotent` in `apps/foundation/services.py`, so the rules are
the platform's, not new ones.

| Situation | Response |
| --- | --- |
| Header missing | `400 validation_error`, with `details["Idempotency-Key"]` coded `idempotency_key_required` |
| Same key, same body, first call finished | The first call's status and body, replayed. Nothing happens twice. |
| Same key, same body, first call still running | `409 idempotency_in_progress`, `retryable: true`. Retry after a short wait. |
| Same key, different body | `409 idempotency_key_reused`, `retryable: false`. A new action needs a new key. |

The app makes one key per user action (a UUID), keeps it across retries of that action, and makes a
new key for the next action.

**A refusal that changes state is stored, not raised.** `execute_idempotent` stores the command's
result only when the command *returns* it; if the command *raises*, the whole transaction rolls back,
including any counter it changed. So a command whose refusal must persist (a wrong OTP increments
`otp_attempts`) returns the refusal as its result. The failed attempt and the stored response commit
together, and a retry with the same key replays the stored refusal without counting again. See
*Start OTP* under the captain trip steps.

Endpoints that are idempotent by nature (a `PUT`, a cancel of an already cancelled ride, a decline)
need no header: repeating them returns the settled state.

### Access errors (every endpoint)

Verified against the backend on 7 November 2026. **The API never answers 401.** Authentication is
`apps.identity.authentication.RevocableSessionAuthentication`, a DRF `SessionAuthentication`, which
sends no `WWW-Authenticate` challenge, so DRF turns every authentication failure into **403**. Apps
must branch on `error.code`, not on the status, to tell "sign in again" from "not allowed".

| HTTP | `code` | When | Source | Message shown |
| --- | --- | --- | --- | --- |
| 403 | `not_authenticated` | No session cookie or bearer token | DRF `NotAuthenticated` (captured: `GET partner/rides/me/` with no session) | "Please sign in again." The server text is technical; the app shows its own and goes to sign-in. |
| 403 | `not_authenticated` | A mobile `Authorization: Bearer` key the server does not know | `apps/mobile/middleware.py`, before the view runs; `details` is `null` | Same as above |
| 403 | `session_expired` | The session was revoked or has expired | `RevocableSessionAuthentication` | "Your session has ended. Please sign in again." |
| 403 | `permission_denied` | Signed in, but not in the required role | `IsPartnerUser` and the other role permissions (captured: a customer calling `partner/rides/me/`) | "This account can't do that." |
| 403 | `csrf_failed` | Web only: a cookie session sending a write without the CSRF token | `common/errors/handler.py`. Bearer requests are exempt. | (not shown; the web client refreshes the token and retries once) |
| 404 | `not_found` | The ride, offer or SOS does not exist **or is not yours** | DRF `NotFound` from `get_object_or_404` | "We couldn't find that ride." |

Another user's ride is a 404, not a 403, so ids cannot be probed.

## Error codes

Codes are stable; the apps branch on them. Messages are what the user sees.

| Code | HTTP | Retryable | Status | Message shown |
| --- | --- | --- | --- | --- |
| `captain_not_approved` | 403 | no | ✅ | "Your captain application can't be changed right now." |
| `registration_already_used` | 409 | no | ✅ | "This registration number is already registered to another captain." |
| `area_not_served` | 422 | no | 📝 | "VSolve Rides isn't available here yet." |
| `vehicle_unavailable` | 409 | no | 📝 | "This vehicle type isn't available here right now." |
| `quote_expired` | 410 | no | 📝 | "This price has expired. Check the fare again." |
| `quote_used` | 409 | no | 📝 | "This fare has already been booked." |
| `ride_already_open` | 409 | no | 📝 | "You already have a ride in progress." |
| `ride_no_longer_available` | 409 | no | 📝 | "Another captain took this ride." |
| `invalid_transition` | 409 | no | 📝 | "That isn't possible at this stage of the ride." |
| `not_at_pickup` | 409 | no | 📝 | "Move closer to the pickup point to mark yourself arrived." |
| `otp_invalid` | 400 | no | 📝 | "That code is wrong. Ask the rider for the 4-digit code." |
| `otp_locked` | 423 | no | 📝 | "Too many wrong codes. The rider can cancel, or contact support." |
| `pass_required` | 403 | no | 📝 | "Buy a Daily Pass to go on duty." |
| `location_stale` | 409 | no | 📝 | "We can't see your location. Check GPS and try again." |
| `location_invalid` | 400 | no | 📝 | (not shown; the app drops the ping and keeps sending) |
| `routing_unavailable` | 503 | yes | 📝 | "We can't calculate a fare right now. Please try again in a moment." |
| `rate_card_version_conflict` | 409 | no | 📝 | Operations: "Someone else changed this rate card. Reload it and make your change again." |
| `rate_card_already_active` | 409 | no | 📝 | Operations: "This area already has an active card for this vehicle. Edit that card instead." |

**`retryable` means "safe to send the same request again, unchanged".** That matches the shared
handler: it is `true` for 408, 425, 429, 502, 503 and 504, and for an exception that says so (such as
`idempotency_in_progress`). A refusal that only clears after the user does something is
`retryable: false`, even though the user may try again later; *Retry rules* says what the app asks
the user to do.

`captain_not_approved` covers three cases for the vehicle endpoint today: no captain application, an
application past `CHANGES_REQUIRED` (submitted or later), and a declined, suspended or offboarded
captain. It will also refuse duty and offers for a captain who is not `APPROVED`.

`location_invalid` and `ride_already_open` are additions to the brief's list: the first is the brief's
ping validation given a code, the second is the brief's "one open ride" rule given a code.

## Retry rules

There are three kinds of failure, and only the first is ever retried automatically.

**1. Automatic retry: the same request, unchanged.** Only for failures where nothing about the request
was wrong.

| Response | What the app does |
| --- | --- |
| Network failure or timeout, no response | Retry with the **same** `Idempotency-Key`, backing off 1 s, 2 s, 4 s, then stop and show "Check your connection". The server replays the first result if the request got there. |
| `409 idempotency_in_progress` | The first attempt is still running. Retry the same request after 1 s, at most 3 times. |
| `503 routing_unavailable` | Back off 1 s, 2 s, 4 s, then stop and show the message with **Try again**. |
| `429` | Wait `details.retry_after_seconds`, then retry once. |

**2. Corrective action first: never retried automatically.** The same request would fail the same
way. The app stops, says what to fix, and sends a **new** request only after the user acts.

| Code | What the user must do first | What the app sends next |
| --- | --- | --- |
| `otp_invalid` | Ask the rider again and type the code | A new `start` request with the new code and a **new** `Idempotency-Key` |
| `not_at_pickup` | Move to the pickup point | **Arrived** stays enabled; a new tap sends a new request, using the latest ping |
| `location_stale` | Turn on GPS or step outside until the app has a fix under 30 s old | A new request once the app holds a fresh fix; the app never resends the old coordinates |

**3. Final: no retry.** Every other `retryable: false` code. Show the message and the next step (a new
quote, back to Home, contact support).

`5xx` other than 502, 503 and 504 show "Something went wrong" with the `request_id`, and are not
retried in a loop.

Polling is not retried; it simply runs again at its next tick. Polling pauses while the app is in the
background, as `@vsolve/mobile-core` already does.

| Who | Endpoint | Every |
| --- | --- | --- |
| Captain on duty, app open | `GET partner/rides/offers/current/` | 2 s |
| Captain on a ride | `GET partner/rides/current/` | 5 s |
| Captain on duty | `POST partner/rides/location/` | 5 s (background task) |
| Rider on a live ride | `GET rides/{ride_id}/` | 3 s |

---

## Captain endpoints (`partner` role)

### ✅ `GET partner/rides/me/`: captain status

Where the signed-in partner stands as a ride captain. Any partner may call it; it never refuses for
lack of a captain application.

Response `200` (`CaptainStatus`), captured from the server:

```json
{
  "approval": "DRAFT",
  "is_approved": false,
  "vehicle": {
    "vehicle_type": "BIKE",
    "registration_number": "TS09AB1234",
    "make_model": "Honda Shine",
    "colour": "Black"
  },
  "blocked_reasons": ["not_approved"]
}
```

| Field | Meaning |
| --- | --- |
| `approval` | The captain application's status (`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUIRED`, `APPROVED`, `DECLINED`, `SUSPENDED`, `OFFBOARDED`), or `NOT_STARTED` when the partner has no `RIDE_CAPTAIN` application |
| `is_approved` | `true` only when `approval` is `APPROVED` |
| `vehicle` | The saved vehicle, or `null` |
| `blocked_reasons` | Why the captain cannot drive yet: `not_approved`, `vehicle_missing`. Empty when nothing blocks. |

A partner who has not applied gets
`{"approval": "NOT_STARTED", "is_approved": false, "vehicle": null, "blocked_reasons": ["not_approved", "vehicle_missing"]}`.

📝 Proposed additions (added when built, additively): `pass` (status, `ends_at`), `duty` (`on_duty`),
`open_ride_id`, and the blocked reasons `pass_required` and `location_permission_missing`.

Errors: access errors only.

### ✅ `PUT partner/rides/vehicle/`: save the vehicle

Creates or replaces the captain's one vehicle. Allowed only while the captain application is `DRAFT`
or `CHANGES_REQUIRED` (ADR-0013, decision 15).

Request (`CaptainVehicleWriteRequest`):

```json
{
  "vehicle_type": "BIKE",
  "registration_number": "ts 09 ab 1234",
  "make_model": "Honda Shine",
  "colour": "Black"
}
```

Response `200` (`CaptainVehicle`), captured from the server:

```json
{ "vehicle_type": "BIKE", "registration_number": "TS09AB1234", "make_model": "Honda Shine", "colour": "Black" }
```

| Rule | Behaviour |
| --- | --- |
| `vehicle_type` | `BIKE`, `AUTO` or `CAB` |
| `registration_number` | 1–16 characters, not blank. Stored upper-case without spaces. No plate-format check. |
| `make_model`, `colour` | Required, 1–120 and 1–40 characters |
| Repeat | Idempotent by nature: the same body returns the same vehicle and changes nothing. No `Idempotency-Key`. |

| Error | When |
| --- | --- |
| `400 validation_error` | A field is missing, blank, too long or not a valid choice |
| `403 captain_not_approved` | No captain application, or the application is not `DRAFT` / `CHANGES_REQUIRED` |
| `409 registration_already_used` | Another captain holds the plate, however it was typed |

Known gap: `v1.yaml` 1.99.0 declares only the `200` response for both implemented endpoints. The
errors above are real and tested (`tests/rides/test_captain_vehicle.py`) but not yet declared in the
OpenAPI document. They are declared when the next Rides endpoints are published.

### 📝 `GET partner/rides/pass-plans/`

```json
{ "plans": [ { "code": "daily", "name": "1 day", "price_paise": 4900, "duration_hours": 24 },
             { "code": "launch", "name": "Launch day", "price_paise": 0, "duration_hours": 24 } ] }
```

Only active plans. Errors: `403 captain_not_approved`.

### 📝 `POST partner/rides/passes/` (Idempotency-Key)

```json
{ "plan_code": "daily" }
```

| Plan | Response |
| --- | --- |
| ₹0 | `201`, the pass already `ACTIVE`: `{ "pass": { "id": "…", "status": "ACTIVE", "starts_at": "…", "ends_at": "…" }, "payment": null }` |
| Paid | `201`, the pass `PENDING_ACTIVATION` with the Razorpay handoff: `{ "pass": { "id": "…", "status": "PENDING_ACTIVATION" }, "payment": { "payment_attempt_id": "…", "checkout": { … } } }`. The pass becomes `ACTIVE` when the payment is captured. |

Errors: `403 captain_not_approved`; `409 invalid_transition` when an active pass already exists;
`400 validation_error` for an unknown or inactive plan. Retry: same key replays the same pass and
payment attempt, so a retry never charges twice.

### 📝 `GET partner/rides/passes/`

Pass history, newest first, with each pass's plan, status, window and receipt. Paginated with the
standard `cursor`.

### 📝 `POST partner/rides/duty/start/`

```json
{ "latitude": 17.385, "longitude": 78.4867, "accuracy_m": 12, "captured_at": "2026-11-07T10:00:00Z" }
```

Response `200 { "on_duty": true, "started_at": "…" }`. Idempotent: already on duty returns the open
session. Errors: `403 captain_not_approved`, `403 pass_required`, `409 location_stale` (the fix is
older than 30 s), `400 location_invalid`.

### 📝 `POST partner/rides/duty/stop/`

No body. Response `200 { "on_duty": false }`. Idempotent: already off duty returns the same.
Error: `409 invalid_transition` while the captain has an open ride.

### 📝 `POST partner/rides/location/`

```json
{ "latitude": 17.385, "longitude": 78.4867, "accuracy_m": 12, "heading": 90, "captured_at": "2026-11-07T10:00:05Z" }
```

Response `204`. Valid when latitude and longitude are in range, `accuracy_m > 0`, and `captured_at` is
at most 30 s old and at most 5 s in the future; otherwise `400 location_invalid`. A ping with accuracy
worse than 100 m is accepted but ignored for matching. From `CAPTAIN_ASSIGNED` to `IN_TRIP` the ping
also records a track point. Duplicates are harmless, so there is no `Idempotency-Key`. Positions are
never logged.

### 📝 `GET partner/rides/offers/current/`

```json
{ "offer": { "offer_id": "…", "ride_id": "…", "vehicle_type": "BIKE", "pickup_distance_m": 640,
             "pickup_area": "Gachibowli", "drop_area": "Hitec City", "fare_paise": 6200,
             "expires_at": "2026-11-07T10:00:15Z" } }
```

Or `{ "offer": null }`. Areas only: the exact pickup appears after the captain accepts.

### 📝 `POST partner/rides/offers/{offer_id}/accept/` (Idempotency-Key)

No body. Response `200` with the ride (the captain view of `partner/rides/current/`). First accept wins.
Errors: `409 ride_no_longer_available` (another captain won, the offer expired or the rider
cancelled); `404 not_found`. Retry with the same key after a timeout returns the same ride if this
captain won.

### 📝 `POST partner/rides/offers/{offer_id}/decline/`

No body. Response `204`. Idempotent; declining an expired or withdrawn offer is also `204`.

### 📝 `GET partner/rides/current/`

The captain's open ride, or `{ "ride": null }`:

```json
{ "ride": { "id": "…", "state": "CAPTAIN_ASSIGNED", "vehicle_type": "BIKE",
            "pickup": { "latitude": 17.385, "longitude": 78.4867, "label": "Gachibowli" },
            "drop": { "latitude": 17.44, "longitude": 78.348, "label": "Hitec City" },
            "rider": { "first_name": "Asha", "phone": "+91…", "rating": 4.9 },
            "fare_paise": 6200, "waiting_paise": 0, "final_fare_paise": null,
            "payment_status": "DUE", "arrived_at": null, "started_at": null,
            "emergency_number": "112" } }
```

`rider.phone` appears only in `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED` and `IN_TRIP`.

### 📝 Trip steps

All take no body unless shown, return `200` with the ride as in `partner/rides/current/`, and refuse
with `409 invalid_transition` from the wrong state. A step already done returns the ride unchanged.

| Method and path | Body | Moves | Extra errors |
| --- | --- | --- | --- |
| `POST partner/rides/{ride_id}/arrived/` | — | `CAPTAIN_ASSIGNED` → `CAPTAIN_ARRIVED` | `409 not_at_pickup` unless the last ping is at most 30 s old and within 200 m of the pickup |
| `POST partner/rides/{ride_id}/start/` (Idempotency-Key) | `{ "otp": "4821" }` | `CAPTAIN_ARRIVED` → `IN_TRIP` | `400 otp_invalid`; `423 otp_locked` after 5 wrong tries. See *Start OTP* below. |
| `POST partner/rides/{ride_id}/complete/` | — | `IN_TRIP` → `COMPLETED`, with `final_fare_paise` and `payment_status: "DUE"` | — |
| `POST partner/rides/{ride_id}/payment-received/` | — | `payment_status` `DUE` → `COLLECTED` | — |
| `POST partner/rides/{ride_id}/cancel/` | `{ "reason": "RIDER_NOT_REACHABLE" }` | `CAPTAIN_ASSIGNED` / `CAPTAIN_ARRIVED` → `SEARCHING` without this captain; response `204` | `400 validation_error` without a reason |
| `POST partner/rides/{ride_id}/rating/` | `{ "stars": 5 }` | rates the rider, once; response `201` | `409 invalid_transition` if already rated or not `COMPLETED` |
| `POST partner/rides/{ride_id}/sos/` | `{ "latitude": 17.39, "longitude": 78.49 }` | raises an SOS; response `201 { "sos_id": "…", "emergency_number": "112" }`. See *Emergency number* below. | — |

#### Start OTP: a network retry never costs an attempt

`start` takes an `Idempotency-Key`, and the app makes a new key for each code the captain types.

1. The view runs the command through `execute_idempotent`, keyed on the captain and the ride.
2. Inside that transaction the command locks the ride (`select_for_update`), then:
   - **locked** (`otp_attempts` is already 5): returns `423 otp_locked`. Nothing is counted.
   - **right code**: moves the ride to `IN_TRIP`, writes the `RideTransition`, and returns `200`.
   - **wrong code**: adds 1 to `otp_attempts` and returns `400 otp_invalid`, or `423 otp_locked`
     when that was the fifth wrong try. It **returns** the refusal rather than raising it, so the
     increment and the stored response commit together (see *Idempotency*).
3. A retry with the same key (the phone timed out and sent it again) replays the stored response.
   It runs nothing, so it cannot add a second failed attempt or start the trip twice.
4. The same key with a different code is `409 idempotency_key_reused`: a new code is a new attempt
   and needs a new key.

`otp_attempts` therefore counts codes the captain typed, never network retries. The response for a
wrong code carries `details.attempts_left`, so the app can say "2 tries left".

**The fingerprint is an HMAC, never a plain hash of the code.** `execute_idempotent` stores a SHA-256
of whatever payload it is given (`request_fingerprint` in `apps/foundation/services.py`). A 4-digit
code has only 10,000 values, so a plain hash of `{"otp": "4821"}` could be reversed by anyone who can
read the idempotency table. The `start` view therefore never passes the code. It passes

```text
{"otp_mac": HMAC-SHA256(key = RIDES_OTP_SECRET,
                        message = "rides.start-otp.v1:" + ride_id + ":" + otp)}
```

- **Without the secret**, the 10,000 candidates cannot be checked against the stored value, so the
  table alone reveals nothing. **With the secret**, an attacker could derive the ride's OTP directly
  (`HMAC(RIDES_OTP_SECRET, ride.id)`), so the fingerprint adds no exposure the secret did not already
  give.
- The `rides.start-otp.v1:` prefix keeps this MAC separate from the OTP derivation itself, although
  both use `RIDES_OTP_SECRET`. The ride id in the message stops one fingerprint matching across rides.
- Different codes give different MACs, so reusing a key with another code is still caught as
  `409 idempotency_key_reused`. The same code gives the same MAC, so a network retry still replays.
- The MAC is compared only by `execute_idempotent`, never shown.
- `RIDES_OTP_SECRET` has no default. Production refuses to start without it, as with the other
  fail-closed settings (ADR-0004); tests set their own.
- The code is never logged and never stored as text. The stored response for a wrong code holds
  `otp_invalid` and `attempts_left`, never the code.

#### Emergency number

`emergency_number` always comes from the server setting `RIDES_EMERGENCY_NUMBER` (ADR-0013,
decision 13). `"112"` in the examples is the default, not a constant. The apps never hard-code a
number. The value also appears on the live ride (`GET rides/{ride_id}/` and
`GET partner/rides/current/`), so the **Call** button works before the SOS request is sent and even
if that request fails. A change to the setting reaches every app on its next poll, with no app
release.

Captain cancel reasons: `RIDER_NOT_REACHABLE`, `RIDER_ASKED_TO_CANCEL`, `VEHICLE_PROBLEM`,
`WRONG_PICKUP`, `OTHER`. A captain cancel counts against the captain in Operations.

### 📝 `GET partner/rides/history/` and `GET partner/rides/earnings/?period=today|week`

History is the captain's rides, newest first, paginated. Earnings are computed from completed rides,
not stored:

```json
{ "period": "today", "rides": 7, "earned_paise": 154000, "cash_collected_paise": 154000 }
```

`400 validation_error` for any other `period`.

---

## Rider endpoints (`customer` role)

### 📝 `GET rides/availability/?latitude=17.385&longitude=78.4867`

```json
{ "service_area": "hyderabad-500032", "vehicle_types": ["BIKE", "AUTO", "CAB"] }
```

A vehicle type is listed only when the area has an active rate card for it. Errors:
`422 area_not_served` (the home entry card is hidden), `400 validation_error` for a missing or out of
range coordinate.

### 📝 `POST rides/quotes/`

```json
{ "pickup": { "latitude": 17.385, "longitude": 78.4867, "label": "Gachibowli" },
  "drop":   { "latitude": 17.44,  "longitude": 78.348,  "label": "Hitec City" } }
```

Response `201`, one quote per available vehicle type:

```json
{ "quotes": [
  { "quote_id": "5b1c…", "vehicle_type": "BIKE", "fare_paise": 6200, "distance_m": 8100,
    "duration_s": 1380, "route_polyline": "…", "expires_at": "2026-11-07T10:05:00Z" } ] }
```

Errors: `422 area_not_served`, `503 routing_unavailable`. No `Idempotency-Key`: a repeated request
makes new quotes, and unused quotes simply expire after 5 minutes.

### 📝 `POST rides/` (Idempotency-Key)

```json
{ "quote_id": "5b1c…" }
```

Response `201` with the ride in `SEARCHING` (shape below). Errors: `410 quote_expired`,
`409 quote_used`, `409 ride_already_open`, `409 vehicle_unavailable` (the rate card was switched off
after quoting), `404 not_found` for another rider's quote. Retry with the same key returns the same
ride; it never books twice.

### 📝 `GET rides/{ride_id}/`: the live ride

```json
{ "id": "…", "state": "CAPTAIN_ASSIGNED", "vehicle_type": "BIKE",
  "pickup": { "latitude": 17.385, "longitude": 78.4867, "label": "Gachibowli" },
  "drop": { "latitude": 17.44, "longitude": 78.348, "label": "Hitec City" },
  "fare_paise": 6200, "waiting_paise": 0, "final_fare_paise": null, "payment_status": "DUE",
  "otp": "4821",
  "captain": { "first_name": "Ravi", "photo_url": "…", "rating": 4.8, "phone": "+91…",
               "vehicle": { "registration_number": "TS09AB1234", "make_model": "Honda Shine", "colour": "Black" },
               "position": { "latitude": 17.39, "longitude": 78.49, "captured_at": "…" },
               "eta_s": 240 },
  "cancelled_by": null, "cancel_reason": null, "emergency_number": "112" }
```

| Field | Present when |
| --- | --- |
| `otp` | Before `IN_TRIP` only |
| `captain` | From `CAPTAIN_ASSIGNED`; `null` while `SEARCHING` |
| `captain.phone` | `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED`, `IN_TRIP` only |
| `captain.position` | While the captain's position is fresh; `null` otherwise |
| `captain.eta_s` | When routing answers; `null` if Routes is down (the app says the ETA is unavailable) |

### 📝 `GET rides/`

The rider's rides, newest first, paginated with the standard `cursor`. Each row: `id`, `state`,
`vehicle_type`, pickup and drop labels, `final_fare_paise` (or `fare_paise`), `requested_at`.

### 📝 `POST rides/{ride_id}/cancel/`

```json
{ "reason": "CHANGED_MIND" }
```

Response `200` with the ride `CANCELLED`. From `SEARCHING`, `CAPTAIN_ASSIGNED` or `CAPTAIN_ARRIVED`;
free in V1. Idempotent: cancelling a cancelled ride returns it unchanged. Errors:
`409 invalid_transition` (for example from `IN_TRIP`), `400 validation_error` without a reason.
Reasons: `CHANGED_MIND`, `CAPTAIN_TOO_FAR`, `CAPTAIN_ASKED_TO_CANCEL`, `BOOKED_BY_MISTAKE`, `OTHER`.

### 📝 `POST rides/{ride_id}/rating/`

`{ "stars": 5 }`, 1–5. Response `201`. Only on a `COMPLETED` ride, once; a repeat is
`409 invalid_transition`.

### 📝 `POST rides/{ride_id}/sos/`

`{ "latitude": 17.39, "longitude": 78.49 }`, both optional but sent together. Response
`201 { "sos_id": "…", "emergency_number": "112" }`, where `emergency_number` is
`RIDES_EMERGENCY_NUMBER` (see *Emergency number* under the captain trip steps). Notifies Operations
immediately. Works in any open state.

---

## Operations endpoints (`operations` role)

Every Operations write is audited. Lists are paginated with the standard `cursor`.

| Status | Method and path | Request | Response and rules |
| --- | --- | --- | --- |
| 📝 | `GET operations/rides/?state=` | — | Rides, newest first; `state` filters (repeatable) |
| 📝 | `GET operations/rides/{ride_id}/` | — | The ride with its `transitions` (who, from, to, when, why) and `offers` |
| 📝 | `POST operations/rides/{ride_id}/cancel/` | `{ "reason": "Rider reported safety issue" }` | `200`, ride `CANCELLED` with `cancelled_by: "OPERATIONS"`. The only way to cancel an `IN_TRIP` ride. `400` without a reason; `409 invalid_transition` on a closed ride. |
| 📝 | `GET operations/rides/rate-cards/` | — | Cards per area and vehicle type, with `version`, `is_active`, `is_placeholder` |
| 📝 | `POST operations/rides/rate-cards/` | `{ "service_area": "hyderabad-500032", "vehicle_type": "BIKE", "base_fare_paise": 2000, "included_distance_m": 1000, "per_km_paise": 800, "per_minute_paise": 100, "minimum_fare_paise": 3000, "free_waiting_minutes": 3, "waiting_per_minute_paise": 100 }` | `201`, version 1, active. Every paise value ≥ 0. `409 rate_card_already_active` if the area already has an active card for that vehicle type. |
| 📝 | `PATCH operations/rides/rate-cards/{id}/` | `expected_version` plus any of the fields above; or `{ "expected_version": 3, "is_active": false }` | A price change returns `201` with a **new version**, and the old version becomes inactive. `is_active: false` switches the vehicle type off without a new version. See *Rate-card versions*. |
| 📝 | `GET operations/rides/pass-plans/` | — | All plans |
| 📝 | `POST operations/rides/pass-plans/` | `{ "code": "daily", "name": "1 day", "price_paise": 4900, "duration_hours": 24 }` | `201`; `code` unique |
| 📝 | `PATCH operations/rides/pass-plans/{id}/` | `name`, `price_paise`, `duration_hours`, `is_active` | `200`. Changing a price never changes a pass already bought. |
| 📝 | `GET operations/rides/captains/` | — | Captains with vehicle, approval, pass, duty, rating and cancel count |
| 📝 | `GET operations/rides/sos/?status=OPEN` | — | The SOS queue, oldest open first |
| 📝 | `POST operations/rides/sos/{sos_id}/resolve/` | `{ "resolution_note": "Called rider, all fine" }` | `200`; idempotent. A note is required. |

Captain approval is not here: it uses the existing partner review at `/operations/partners`.

### Rate-card versions

A rate card is never edited in place. Each change is a new row, so a quote always points at the
exact numbers it was priced on.

**The guarantee.** The database holds a partial unique constraint on `RideRateCard`: one row per
(`service_area`, `vehicle_type`) where `is_active` is true. Whatever any service does, PostgreSQL
refuses a second active card. The service rules below keep requests from ever reaching that
refusal; the constraint is the backstop.

**A price change** (`PATCH` with new numbers) runs in one transaction:

1. Lock the card named by `{id}` with `select_for_update`.
2. If it is not the active card for its area and vehicle type, refuse with
   `409 rate_card_version_conflict`: history is read-only.
3. If `expected_version` is not its `version`, refuse with `409 rate_card_version_conflict`: someone
   changed it since this screen loaded.
4. Set the locked card `is_active = false`. **This comes first**, because PostgreSQL checks the
   partial unique index row by row and cannot defer it; inserting the new active card before
   deactivating the old one would be refused.
5. Insert the new card: `version` = old + 1, `is_active = true`, the changed fields, `created_by`
   the operator.
6. Commit. Both rows change together or neither does.

Two operators editing the same card at once: the lock makes the second wait, and when it runs,
step 2 or 3 refuses it, because the card it loaded is no longer the active one. One wins; the other
sees "Someone else changed this rate card" and reloads.

**Switching a vehicle type off** (`PATCH` with `is_active: false`) locks the card, checks
`expected_version`, sets it inactive and creates no new version. From that moment the vehicle type
disappears from `rides/availability/` and no new quote is made for it. Switching it back on is a
`POST` of a new card.

**What a change never touches.** A quote keeps its `rate_card` and `rate_card_version`, so a quote
made before the change keeps its price for its 5 minutes, and a ride keeps the fare of its quote.
Booking a quote whose card was switched off afterwards is `409 vehicle_unavailable`.

---

## Required tests

An endpoint is not Implemented until these pass. Each is written with the endpoint, in
`backend/tests/rides/`.

**Already passing** (the platform behaviour the OTP design relies on):
`tests/rides/test_idempotency_guarantees.py` proves that a command which *returns* a refusal keeps its
write and replays it without running again, that a command which *raises* rolls its write back and
stores nothing, and that a reused key with a different payload is refused.
`tests/foundation/test_services.py` already covers replay and key reuse for successful commands.

**Start OTP** (`test_otp.py`, with `POST partner/rides/{ride_id}/start/`):

1. A wrong code adds exactly 1 to `otp_attempts`.
2. The `400 otp_invalid` response and the new `otp_attempts` are committed together: after the call,
   the database holds both the stored response and the incremented counter.
3. The same key and the same code again replays the `400`, and `otp_attempts` does not change.
4. The same key with a different code is `409 idempotency_key_reused`, and `otp_attempts` does not
   change.
5. The fifth wrong code answers `423 otp_locked`; every later attempt (right or wrong code, any key)
   answers `423` and `otp_attempts` stays at 5.
6. The right code moves the ride to `IN_TRIP` once; a replay does not write a second `RideTransition`.
7. The idempotency record holds an HMAC, not the code: the stored fingerprint differs from a plain
   SHA-256 of `{"otp": code}` for every code, and changes when `RIDES_OTP_SECRET` changes.

**Rate cards** (`test_rate_cards.py`, with the Operations rate-card endpoints):

1. The database refuses a second active card for one area and vehicle type (`IntegrityError` from
   the partial unique constraint), and allows any number of inactive ones.
2. A price change deactivates the old version and creates version + 1, in one transaction.
3. A stale `expected_version`, or editing an inactive version, is `409 rate_card_version_conflict`
   and changes nothing.
4. Two concurrent edits of one card: exactly one succeeds, the other is
   `409 rate_card_version_conflict`, and exactly one card is active afterwards
   (a `transaction=True` test with two threads).
5. A `POST` while a card is active is `409 rate_card_already_active`.
6. A quote made before a price change keeps its price and version.

## What the user sees when things go wrong

| Situation | Rider app | Captain app |
| --- | --- | --- |
| No captain accepts in about 45 s (`NO_CAPTAIN_FOUND`) | "No captain nearby", with **Try again** (a new quote) | — |
| The captain cancels | "Finding another captain…"; the ride is `SEARCHING` again | Back to Home |
| Another captain accepts first | — | "Another captain took this ride" |
| Routes is down | "We can't calculate a fare right now", with **Try again** | ETA hidden, Navigate still works |
| Offline | An offline banner; polling resumes when back online. No invented position. | The same; pings resume when back online |
| The app is reopened mid-ride | Lands on the open ride | Lands on the open ride |
| Wrong OTP five times | "Too many wrong codes…" | Cancel or contact support |
