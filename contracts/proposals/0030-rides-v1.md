# 0030. Rides V1: rider, captain and Operations API

- Status: Proposed. The endpoints marked ✅ are Published at contract 1.99.0; the rest is proposed.
- Date: 2026-11-07 · Revised: 2026-11-10 (brief revision 2, and the endpoints built since)
- Brief: `docs/rapido/README.md` §5.10 · ADR: `docs/adr/0013-rides-v1.md`
- Numbering: the brief first called this proposal 0029; that number is already
  `0029-operations-partner-import.md`.

## How to read this proposal

Every endpoint carries one of two marks.

| Mark | Meaning |
| --- | --- |
| ✅ **Implemented** | Built in `backend/apps/rides`, tested in `backend/tests/rides`, published in `contracts/openapi/v1.yaml` 1.99.0. The shapes are the serializers' real fields. |
| 📝 **Proposed** | Not built. The path, shapes, codes and messages are what this proposal asks for. They may change when the endpoint is implemented, and this file is updated when they do. |

## Consuming applications

| Surface | App and route | Role |
| --- | --- | --- |
| Rider | Customer mobile, `app/(tabs)/rides/*` and the `<RidesEntry />` card on Home (Android and iOS) | `customer` (availability is open to signed-out visitors) |
| Captain | **Partner mobile, Rides workspace** (`com.vsolvehub.partner`, Android only). There is no separate Captain app. | `partner`, application track `RIDE_CAPTAIN` |
| Operations | Admin web, `/operations/rides/*` | `operations` |

## Conventions

**Base path** `/api/v1/`. Rider endpoints are under `rides/`, captain endpoints under `partner/rides/`,
Operations endpoints under `operations/rides/`.

**Authentication.** The same session the existing apps use for the role. A request without a session,
or with a session for the wrong role, is refused before any Rides rule runs (see *Access errors*).

**Money** is integer paise. **Times** are ISO 8601. **Every countdown** is an `expires_at` from the
server; the apps draw it with `useServerCountdown` (ADR-0005) and never compute a deadline.
**Places** are `{ "latitude", "longitude", "address" }`, six decimal places.

**Server clock.** `GET partner/rides/me/`, the duty answers and the current offer carry `server_now`.
The Partner app keeps the offset between `server_now` and the phone clock, and sends location
`captured_at` in server time (brief §5.6).

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
header: buy a pass, book a ride, accept an offer, start with the OTP. They use the existing
`execute_idempotent` in `apps/foundation/services.py`, so the rules are the platform's, not new ones.

| Situation | Response |
| --- | --- |
| Header missing | `400 validation_error`, with `details["Idempotency-Key"]` coded `idempotency_key_required` |
| Same key, same body, first call finished | The first call's status and body, replayed, with the header `Idempotent-Replay: true`. Nothing happens twice. |
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

Endpoints that are idempotent by nature (a `PUT`, a decline, duty start and stop, a cancel of an
already cancelled ride) need no header: repeating them returns the settled state.

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
| 403 | `permission_denied` | Signed in, but not in the required role | `IsPartnerUser`, `IsOperationsUser` (captured: a customer calling `partner/rides/me/`) | "This account can't do that." |
| 403 | `csrf_failed` | Web only: a cookie session sending a write without the CSRF token | `common/errors/handler.py`. Bearer requests are exempt. | (not shown; the web client refreshes the token and retries once) |
| 404 | `not_found` | The quote, ride, offer or SOS does not exist **or is not yours** | DRF `NotFound` | "We couldn't find that ride." |

Another user's quote, ride or offer is a 404, not a 403, so ids cannot be probed.

## Error codes

Codes are stable; the apps branch on them. Messages are the server's, shown to the user as they are.

| Code | HTTP | Retryable | Status | Message |
| --- | --- | --- | --- | --- |
| `captain_not_approved` | 403 | no | ✅ | Depends on the reason: "Your captain application can't be changed right now." (vehicle), "You can go on duty once your captain application is approved.", "Your captain account is suspended. Contact support.", "Add your vehicle details before going on duty." |
| `registration_already_used` | 409 | no | ✅ | "This registration number is already registered to another captain." |
| `pass_required` | 403 | no | ✅ | "Buy a pass to go on duty." |
| `pass_already_active` | 409 | no | ✅ | "You already have an active pass. Buy the next one when it ends." |
| `pass_purchase_pending` | 409 | no | ✅ | "Your last pass payment is still going through." |
| `not_on_duty` | 409 | no | ✅ | "You're off duty. Go on duty to get rides." |
| `location_stale` | 422 | no | ✅ | "This location is too old to use." or, for a time ahead of the server, "Your phone's clock looks wrong. Set it to automatic time." |
| `location_unavailable` | 503 | yes | ✅ | "We couldn't save your location right now. It will retry." |
| `area_not_served` | 422 | no | ✅ | "Rides aren't available here yet." |
| `routing_unavailable` | 503 | yes | ✅ | "We couldn't work out this trip right now. Please try again." |
| `throttled` | 429 | yes | ✅ | Quotes only. The app shows its own: "Too many price checks. Try again in a minute." |
| `quote_expired` | 422 | no | ✅ | "This price has expired. Check the fares again." |
| `quote_used` | 409 | no | ✅ | "This price was already used. Check the fares again." |
| `vehicle_unavailable` | 422 | no | ✅ | "This vehicle type can't be booked here right now." |
| `ride_already_open` | 409 | no | ✅ | "You already have a ride in progress." |
| `ride_no_longer_available` | 409 | no | ✅ | "This ride is no longer available." |
| `rate_card_exists` | 409 | no | ✅ | Operations: "This area already has an active card for this vehicle. Edit that card." |
| `rate_card_inactive` | 409 | no | ✅ | Operations: "Only the active card can be changed. Create a new card instead." |
| `invalid_transition` | 409 | no | ✅ | "That isn't possible at this stage of the ride." |
| `not_at_pickup` | 409 | no | ✅ | "You are not at the pickup yet." |
| `otp_invalid` | 400 | no | ✅ | "That code is wrong. Ask the rider for the 4-digit code." |
| `otp_locked` | 423 | no | ✅ | "Too many wrong codes. The rider can cancel, or contact support." |

**`retryable` means "safe to send the same request again, unchanged".** That matches the shared
handler: it is `true` for 408, 425, 429, 502, 503 and 504, and for an exception that says so (such as
`idempotency_in_progress`). A refusal that only clears after the user does something is
`retryable: false`, even though the user may try again later; *Retry rules* says what the app asks
the user to do.

Additions to the brief's list: `pass_already_active`, `not_on_duty`, `location_unavailable`,
`rate_card_exists`, `rate_card_inactive` and `registration_already_used` give codes to rules the brief
states in prose. Ping validation failures are plain `400 validation_error`.

## Retry rules

There are three kinds of failure, and only the first is ever retried automatically.

**1. Automatic retry: the same request, unchanged.** Only for failures where nothing about the request
was wrong.

| Response | What the app does |
| --- | --- |
| Network failure or timeout, no response | Retry with the **same** `Idempotency-Key`, backing off 1 s, 2 s, 4 s, then stop and show "Check your connection". The server replays the first result if the request got there. |
| `409 idempotency_in_progress` | The first attempt is still running. Retry the same request after 1 s, at most 3 times. |
| `503 routing_unavailable` | Back off 1 s, 2 s, 4 s, then stop and show the message with **Try again**. |
| `429 throttled` | Wait `details.retry_after_seconds`, then retry once. |

**2. Corrective action first: never retried automatically.** The same request would fail the same
way. The app stops, says what to fix, and sends a **new** request only after the user acts.

| Code | What the user must do first | What the app sends next |
| --- | --- | --- |
| `otp_invalid` | Ask the rider again and type the code | A new `start` request with the new code and a **new** `Idempotency-Key` |
| `not_at_pickup` | Move to the pickup point | **Arrived** stays enabled; a new tap sends a new request, using the latest ping |
| `quote_expired`, `quote_used` | Nothing: the app fetches new quotes | A new `POST rides/quotes/`, then a new booking with a new key |

**3. Final: no retry.** Every other `retryable: false` code. Show the message and the next step (a new
quote, back to Home, contact support).

**The location task follows its own table** (brief §5.13), because it runs without a screen: `204`
do nothing; `409 not_on_duty` stop the task; `422 location_stale` refresh the clock offset from
`GET partner/rides/me/`, at most once a minute; `503 location_unavailable` or a network error drop the
ping (the next comes in 5 s); a real sign-out stops the task. There is no queue and no retry.

`5xx` other than 502, 503 and 504 show "Something went wrong" with the `request_id`, and are not
retried in a loop.

Polling is not retried; it simply runs again at its next tick. Polling pauses while the app is in the
background, as `@vsolve/mobile-core` already does.

| Who | Endpoint | Every |
| --- | --- | --- |
| Captain on duty, app open | `GET partner/rides/offers/current/` | 2 s |
| Captain on a ride | `GET partner/rides/current/` | 5 s |
| Captain on duty | `POST partner/rides/location/` | 5 s (the foreground-service location task) |
| Rider on a live ride | `GET rides/{ride_id}/` | 3 s |

---

## Captain endpoints (`partner` role)

### ✅ `GET partner/rides/me/`: captain status

Where the signed-in partner stands as a ride captain. Any partner may call it; it never refuses for
lack of a captain application. The Partner app also uses it to decide whether to show the Rides
workspace.

Response `200` (`CaptainStatus`):

```json
{
  "approval": "APPROVED",
  "is_approved": true,
  "vehicle": { "vehicle_type": "BIKE", "registration_number": "TS09AB1234", "make_model": "Honda Shine", "colour": "Black" },
  "active_pass": { "id": "…", "plan": { "id": "…", "code": "launch-pass", "name": "Launch pass", "price_paise": 0, "duration_hours": 24 },
                   "status": "ACTIVE", "starts_at": "…", "ends_at": "…", "payment_attempt_id": null, "created_at": "…" },
  "queued_pass": null,
  "on_duty": true,
  "duty_started_at": "…",
  "blocked_reasons": [],
  "server_now": "2026-11-10T10:00:00+05:30"
}
```

| Field | Meaning |
| --- | --- |
| `approval` | The captain application's status, or `NOT_STARTED` when the partner has no `RIDE_CAPTAIN` application |
| `is_approved` | `true` only when `approval` is `APPROVED` |
| `vehicle` | The saved vehicle, or `null` |
| `active_pass`, `queued_pass` | The running pass and a paid pass waiting for it to end, each or `null` |
| `on_duty`, `duty_started_at` | The open duty session |
| `blocked_reasons` | Why duty cannot start, in display order: `suspended` or `not_approved`, `vehicle_missing`, `pass_required`. Empty when nothing blocks. |
| `server_now` | The server clock (see *Conventions*) |

📝 Proposed addition: `open_ride_id`, when the current-ride endpoint is built.

### ✅ `PUT partner/rides/vehicle/`: save the vehicle

Creates or replaces the captain's one vehicle. Allowed only while the captain application is `DRAFT`
or `CHANGES_REQUIRED` (ADR-0013, decision 16).

Request (`CaptainVehicleWriteRequest`) and response `200` (`CaptainVehicle`):

```json
{ "vehicle_type": "BIKE", "registration_number": "ts 09 ab 1234", "make_model": "Honda Shine", "colour": "Black" }
{ "vehicle_type": "BIKE", "registration_number": "TS09AB1234", "make_model": "Honda Shine", "colour": "Black" }
```

| Rule | Behaviour |
| --- | --- |
| `vehicle_type` | `BIKE`, `AUTO` or `CAB` |
| `registration_number` | 1–16 characters, not blank. Stored upper-case without spaces. No plate-format check. |
| `make_model`, `colour` | Required, 1–120 and 1–40 characters |
| Repeat | Idempotent by nature: the same body returns the same vehicle and changes nothing. |

Errors: `400 validation_error`; `403 captain_not_approved` (no captain application, or not `DRAFT` /
`CHANGES_REQUIRED`); `409 registration_already_used`.

### ✅ `GET partner/rides/pass-plans/`

The plans on sale, cheapest first: a list of `{ "id", "code", "name", "price_paise", "duration_hours" }`.

### ✅ `POST partner/rides/passes/` (Idempotency-Key) and `GET partner/rides/passes/`

Request `{ "plan_id": "…" }`. Response `201` (`CaptainPass`, the shape in `me` above).

| Plan | Result |
| --- | --- |
| ₹0 | `status: "ACTIVE"` at once, for `duration_hours`; `payment_attempt_id: null` |
| Paid | `status: "PENDING_ACTIVATION"` with a `payment_attempt_id`. The app reads `GET /payment-attempts/{id}/` for the Razorpay order and pays it. The pass becomes `ACTIVE` when the payment is captured, or `QUEUED` if another pass is still running (it then starts the moment that one ends). |

| Rule | Behaviour |
| --- | --- |
| An active pass, or a paid pass queued behind one | `409 pass_already_active` (only one pass can wait in line) |
| A paid purchase still going through (under 30 minutes old) | The same plan returns that pending pass, never a second charge; any other plan, paid or ₹0, is `409 pass_purchase_pending` |
| Not an approved captain | `403 captain_not_approved` |
| Unknown or switched-off plan | `404` |
| Retry | The same key replays the same pass and payment attempt |

`GET` lists the captain's passes, newest first. `status` is a string: `PENDING_ACTIVATION`, `QUEUED`,
`ACTIVE`, `EXPIRED` or `CANCELLED`. An every-minute task expires lapsed passes, starts queued ones,
and takes captains with no pass off duty (after their ride, if they are on one).

### ✅ `POST partner/rides/duty/start/` and `POST partner/rides/duty/stop/`

No body. Response `200` (`DutyStatus`): `{ "on_duty": true, "started_at": "…", "server_now": "…" }`.

Start refuses with the first blocking reason: `403 captain_not_approved` (not approved, suspended or
no vehicle; the message says which) or `403 pass_required`. Starting while on duty returns the open
session. Stopping is always allowed, also during a ride (the ride goes on; no new requests arrive),
and stopping while off duty changes nothing.

### ✅ `POST partner/rides/location/`

```json
{ "latitude": 17.385, "longitude": 78.4867, "accuracy_m": 12, "heading": 90, "captured_at": "2026-11-10T10:00:05+05:30" }
```

Response `204`. `latitude` and `longitude` in range, `accuracy_m` above 0, `heading` optional (0–360),
otherwise `400 validation_error`. `captured_at` (in server time, see *Conventions*) at most 30 s old
and at most 5 s ahead, otherwise `422 location_stale`. `409 not_on_duty` once the server has ended
duty and the captain has no open ride: a ride in progress keeps its captain's pings coming even off
duty, for the pickup check and the rider's map. `503 location_unavailable` when Redis is down. A
ping with accuracy worse than 100 m is stored but ignored for matching. If the area lookup fails,
the captain keeps the listing they had. From `CAPTAIN_ASSIGNED` to `IN_TRIP` each ping also writes a
track point. After 2 minutes without a ping, duty ends (`LOCATION_STALE`), except for a captain on
an open ride, who stays on duty until it ends. Positions are never logged. The 30 s, 100 m and
30-minute limits are the settings `RIDES_PING_MAX_AGE_SECONDS`, `RIDES_MATCHING_MAX_ACCURACY_M` and
`RIDES_PASS_PURCHASE_WINDOW_MINUTES`.

### ✅ `GET partner/rides/offers/current/`

```json
{ "offer": { "id": "…", "ride_id": "…", "vehicle_type": "BIKE",
             "pickup": { "latitude": "17.440000", "longitude": "78.350000", "address": "Gachibowli" },
             "drop": { "latitude": "17.450000", "longitude": "78.380000", "address": "Hitec City" },
             "pickup_distance_m": 640, "fare_paise": 5100, "trip_distance_m": 4200, "trip_duration_s": 900,
             "offered_at": "…", "expires_at": "…" },
  "server_now": "…" }
```

Or `{ "offer": null, "server_now": "…" }`: an offer shows only while it is unanswered, before its
deadline, on a ride still searching.

### ✅ `POST partner/rides/offers/{offer_id}/accept/` (Idempotency-Key)

No body. Response `200` (`CaptainRide`): the ride as below, now `CAPTAIN_ASSIGNED`. The first accept
wins; the other offers become `WITHDRAWN`. Accepting an offer this captain already won returns the
ride. Errors: `409 ride_no_longer_available` (another captain won, the offer expired, or the ride
ended); `409 not_on_duty`; `403 captain_not_approved` or `403 pass_required` when the captain was
suspended or their pass ended while the offer was open (the same gate as going on duty); `404` for
someone else's offer.

```json
{ "id": "…", "state": "CAPTAIN_ASSIGNED", "vehicle_type": "BIKE",
  "pickup": { … }, "drop": { … }, "route_polyline": "…",
  "fare_paise": 5100, "waiting_paise": 0, "final_fare_paise": null,
  "payment_method": "CASH_OR_UPI", "payment_status": "DUE", "created_at": "…",
  "rider": { "name": "Priya", "phone_number": "+91…" } }
```

`rider.phone_number` is `null` outside `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED` and `IN_TRIP`.

### ✅ `POST partner/rides/offers/{offer_id}/decline/`

No body. Response `204`. When nobody else in the round is still deciding, the ride goes to the next
captains at once. Declining twice, or after the deadline, changes nothing. `404` for someone else's
offer.

### ✅ `GET partner/rides/current/`

`{ "ride": … }`: the captain's open ride (`CaptainRide`, as above), else a completed ride not yet
marked paid (so the Collect screen survives an app restart), else `null`. Every ride view also
carries `captain_assigned_at`, `captain_arrived_at`, `started_at`, `completed_at`, `cancelled_by`,
`cancel_reason` and `emergency_number`.

### Trip steps

All take no body unless shown, return `200` with the ride as in `partner/rides/current/`, and refuse
with `409 invalid_transition` from the wrong state. A step already done returns the ride unchanged.
Another captain's ride is `404`. ✅ All built.

| Method and path | Body | Moves | Extra errors |
| --- | --- | --- | --- |
| `POST partner/rides/{ride_id}/arrived/` | — | `CAPTAIN_ASSIGNED` → `CAPTAIN_ARRIVED` | `409 not_at_pickup` unless the last ping is at most 30 s old and within 200 m of the pickup; `503 location_unavailable` when Redis is down |
| `POST partner/rides/{ride_id}/start/` (Idempotency-Key) | `{ "otp": "4821" }` | `CAPTAIN_ARRIVED` → `IN_TRIP` | `400 otp_invalid`; `423 otp_locked` after 5 wrong tries. See *Start OTP* below. |
| `POST partner/rides/{ride_id}/complete/` | — | `IN_TRIP` → `COMPLETED`, with `final_fare_paise` = fare + `waiting_paise` (fixed at start) and `payment_status: "DUE"` | — |
| `POST partner/rides/{ride_id}/payment-received/` | — | `payment_status` `DUE` → `COLLECTED` | — |
| `POST partner/rides/{ride_id}/cancel/` | `{ "reason": "RIDER_NOT_REACHABLE" }` | `CAPTAIN_ASSIGNED` / `CAPTAIN_ARRIVED` → `SEARCHING` from round 1, never offered back to this captain (other captains may be offered it again); response `204` | `400 validation_error` without a listed reason; `409 invalid_transition` from `IN_TRIP` (the captain ends the trip instead) |
| `POST partner/rides/{ride_id}/rating/` | `{ "stars": 5 }` | rates the rider, once; response `201 { "stars": 5 }`. `my_rating` on the ride shows it. | `409 invalid_transition` if already rated or not `COMPLETED`; `400` outside 1–5 |
| `POST partner/rides/{ride_id}/sos/` | `{ "latitude": 17.39, "longitude": 78.49 }`, optional | raises an SOS on an open ride; response `201 { "sos_id": "…", "emergency_number": "112" }`. Without a place, the captain's last ping is used. A second press while it is open returns the same SOS. See *Emergency number* below. | `409 invalid_transition` on a closed ride |

Captain cancel reasons: `RIDER_NOT_REACHABLE`, `VEHICLE_ISSUE`, `PICKUP_TOO_FAR`, `OTHER`. A captain
cancel counts against the captain in Operations.

#### Start OTP: a network retry never costs an attempt

`start` takes an `Idempotency-Key`, and the app makes a new key for each code the captain types.

1. The view runs the command through `execute_idempotent`, keyed on the captain and the ride.
2. Inside that transaction the command locks the ride (`select_for_update`), then:
   - **locked** (`otp_attempts` is already 5): returns `423 otp_locked`. Nothing is counted.
     The count belongs to the ride, like the code: a captain cancel does not reset it, so a new
     captain never gets five fresh guesses at the same code. The code is ASCII digits `0-9` only.
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
- `RIDES_OTP_SECRET` has no default. Without it no code can be derived, so no ride can start
  (fail-closed at use, ADR-0004); every deployment must set it, and tests set their own.
- The code is never logged and never stored as text. The stored response for a wrong code holds
  `otp_invalid` and `attempts_left`, never the code.

#### Emergency number

`emergency_number` always comes from the server setting `RIDES_EMERGENCY_NUMBER` (ADR-0013,
decision 13). `"112"` in the examples is the default, not a constant. The apps never hard-code a
number. The value also appears on the live ride (`GET rides/{ride_id}/` and
`GET partner/rides/current/`), so the **Call** button works before the SOS request is sent and even
if that request fails. A change to the setting reaches every app on its next poll, with no app
release.

### ✅ `GET partner/rides/history/` and `GET partner/rides/earnings/?period=today|week`

History is the captain's rides, newest first, cursor-paged, with the same rows as `GET rides/`.
Earnings are computed from completed rides, not stored, in India time (`today` from local
midnight, `week` from Monday):

```json
{ "period": "today", "since": "2026-11-10T00:00:00+05:30", "rides": 7, "earned_paise": 154000, "cash_collected_paise": 120000 }
```

`earned_paise` is what riders owed for those rides; `cash_collected_paise` is the part marked
received. `400 validation_error` for any other `period`.

---

## Rider endpoints (`customer` role)

### ✅ `GET rides/availability/?latitude=17.440000&longitude=78.348900`

Open to signed-out visitors (Home is), with the existing serviceability rate limit. The Customer
app no longer calls it for the Home card (ADR-0013, decision 38); it is kept for other clients.

```json
{ "vehicle_types": ["BIKE", "AUTO", "CAB"] }
```

The vehicle types bookable at that place, cheapest first: a type is listed only while the pickup's
area has an active rate card for it. **Empty where Rides does not run**, and the Home entry hides.
`400 validation_error` for a missing or out-of-range place; `503 routing_unavailable` when the place
cannot be looked up (the app hides the entry on any error).

### ✅ `POST rides/quotes/`

```json
{ "pickup": { "latitude": "17.440000", "longitude": "78.348900", "address": "Gachibowli Stadium" },
  "drop":   { "latitude": "17.450000", "longitude": "78.380000", "address": "Hitec City" } }
```

Response `201`, one quote per bookable vehicle type, ordered bike, auto, cab:

```json
{ "quotes": [
  { "id": "5b1c…", "vehicle_type": "BIKE", "fare_paise": 5100, "distance_m": 4200,
    "duration_s": 900, "route_polyline": "…", "expires_at": "…" } ] }
```

Only the pickup must be in a service area. If any route cannot be had, no quote is saved. Errors:
`422 area_not_served`, `503 routing_unavailable`, `400` when pickup and drop are the same,
`429 throttled` beyond 20 a minute per user. No `Idempotency-Key`: a repeated request makes new
quotes, and unused quotes simply expire after 5 minutes.

### ✅ `POST rides/` (Idempotency-Key)

Request `{ "quote_id": "5b1c…" }`, one of the rider's own quotes. Response `201` with the ride
`SEARCHING` (shape below); the server then offers it to nearby captains in rounds and ends it
`NO_CAPTAIN_FOUND` if nobody accepts. Errors: `404` for an unknown quote or someone else's,
`422 quote_expired`, `409 quote_used`, `422 vehicle_unavailable` (the vehicle was switched off in
the area after quoting), `409 ride_already_open`. Retry with the same key returns the same ride; it
never books twice.

### ✅ `GET rides/{ride_id}/`: the live ride

The rider's own ride only. Built today:

```json
{ "id": "…", "state": "CAPTAIN_ASSIGNED", "vehicle_type": "BIKE",
  "pickup": { "latitude": "17.440000", "longitude": "78.350000", "address": "Gachibowli" },
  "drop": { "latitude": "17.450000", "longitude": "78.380000", "address": "Hitec City" },
  "route_polyline": "…", "fare_paise": 5100, "waiting_paise": 0, "final_fare_paise": null,
  "payment_method": "CASH_OR_UPI", "payment_status": "DUE", "created_at": "…",
  "captain": { "name": "Ravi", "photo_url": null, "phone_number": "+91…",
               "vehicle": { "vehicle_type": "BIKE", "registration_number": "TS09AB1234", "make_model": "Honda Shine", "colour": "Black" } } }
```

| Field | Present when |
| --- | --- |
| `captain` | From `CAPTAIN_ASSIGNED`; `null` while `SEARCHING` |
| `captain.phone_number` | `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED`, `IN_TRIP` only; `null` otherwise |
| `captain.photo_url` | A reviewed photo only; `null` otherwise |

Also ✅: `captain.rating` (average stars from riders to one decimal, `null` for a new captain),
`my_rating` (the rider's stars, `null` until rated), `otp` (while `CAPTAIN_ASSIGNED` or
`CAPTAIN_ARRIVED`, else `null`), `captain.position`
(`latitude`, `longitude`, `heading`, `captured_at`; the last ping while fresh, else `null`),
`captain.eta_s` (seconds to the pickup while `CAPTAIN_ASSIGNED`, from the routing adapter cached
30 s per ride; `null` if Routes or Redis is down, and the app says the ETA is unavailable), the
step times, `cancelled_by`, `cancel_reason` and `emergency_number`.

### ✅ `GET rides/`

The rider's rides, newest first, paginated with the standard `cursor` (`next`, `previous`,
`results`). Each row: `id`, `state`, `vehicle_type`, `pickup_address`, `drop_address`,
`fare_paise`, `final_fare_paise`, `payment_status`, `created_at`, `completed_at`, `cancelled_by`.

### ✅ `POST rides/{ride_id}/cancel/`

```json
{ "reason": "CHANGED_MIND" }
```

Response `200` with the ride `CANCELLED`. From `SEARCHING`, `CAPTAIN_ASSIGNED` or `CAPTAIN_ARRIVED`;
free in V1. Pending offers are withdrawn and an assigned captain is freed. Idempotent: cancelling
a cancelled ride returns it unchanged. Errors: `409 invalid_transition` (for example from
`IN_TRIP`), `400 validation_error` without a listed reason, `404` for someone else's ride. While a
captain's cancel has the ride searching again, `GET rides/{ride_id}/` says `searching_again: true`.
Reasons: `CHANGED_MIND`, `CAPTAIN_DELAYED`, `WRONG_PICKUP`, `OTHER`.

### ✅ `POST rides/{ride_id}/rating/`

`{ "stars": 5 }`, 1–5. Response `201 { "stars": 5 }`. Only on a `COMPLETED` ride, once; a repeat
is `409 invalid_transition`. `my_rating` on `GET rides/{ride_id}/` is `null` until the rider rates.

### ✅ `POST rides/{ride_id}/sos/`

`{ "latitude": 17.39, "longitude": 78.49 }`, both optional but sent together (`400` for one
without the other). Response `201 { "sos_id": "…", "emergency_number": "112" }`, where
`emergency_number` is `RIDES_EMERGENCY_NUMBER` (see *Emergency number* under the captain trip
steps). Works in any open state (`409 invalid_transition` otherwise); a second press while it is
open returns the same SOS. Without a place, the captain's last ping is used: rider and captain are
together from pickup on, and a rider with location off still gives Operations somewhere to look.
Notifies Operations immediately.

---

## Operations endpoints (`operations` role)

| Status | Method and path | Request | Response and rules |
| --- | --- | --- | --- |
| ✅ | `GET operations/rides/rate-cards/` | `?service_area_id=&vehicle_type=&active=true` (all optional) | Every card version, by area, vehicle type and newest version: `service_area_id`, `service_area_name`, the seven price fields, `version`, `is_active`, `created_at`. `400` for a malformed `service_area_id`. |
| ✅ | `POST operations/rides/rate-cards/` | `{ "service_area_id": "…", "vehicle_type": "BIKE", "base_fare_paise": 1500, "included_distance_m": 1000, "per_km_paise": 600, "per_minute_paise": 100, "minimum_fare_paise": 2500, "free_waiting_minutes": 3, "waiting_per_minute_paise": 100 }` | `201`, the next version, active. Every value a whole number ≥ 0, all required. `404` unknown area; `409 rate_card_exists` while the area has an active card for that vehicle. |
| ✅ | `PATCH operations/rides/rate-cards/{id}/` | any of the seven price fields; or `{ "is_active": false }` alone | Prices: `200` with a **new version**, unchanged fields copied, the old version inactive. `is_active: false` switches the vehicle off with no new version. `409 rate_card_inactive` for a retired card; `400` for an empty body or prices mixed with `is_active: false`. See *Rate-card versions*. |
| ✅ | `GET operations/rides/pass-plans/` | — | All plans, active first |
| ✅ | `POST operations/rides/pass-plans/` | `{ "code": "week-pass", "name": "Week pass", "price_paise": 24900, "duration_hours": 168 }` | `201`. `code` a unique slug; `duration_hours` ≥ 1; `price_paise` ≥ 0. |
| ✅ | `PATCH operations/rides/pass-plans/{id}/` | `name`, `price_paise`, `duration_hours`, `is_active` | `200`. `code` cannot change (`400`). A change never alters a pass already bought; a switched-off plan leaves the captains' list. |
| ✅ | `GET operations/rides/?state=` | — | Rides, newest first, cursor-paged; `state` is one or more states, comma-separated; `400` for an unknown one |
| ✅ | `GET operations/rides/{ride_id}/` | — | The ride with `rider` and `captain` (name, phone), `vehicle`, `otp_attempts`, `dispatch_round`, `ratings` by side, its `transitions` (who, from, to, when, why) and `offers` |
| ✅ | `POST operations/rides/{ride_id}/cancel/` | `{ "reason": "Rider reported safety issue" }` | `204`, ride `CANCELLED` with `cancelled_by: "OPERATIONS"`, from any open state. The only way to cancel an `IN_TRIP` ride. `400` without a reason or over 64 characters; `409 invalid_transition` on a closed ride; a cancelled ride is left as it is. |
| ✅ | `GET operations/rides/captains/` | — | Captains, newest first: `approval`, `vehicle`, `pass_ends_at`, `on_duty`, `rides_completed`, `rating` (average from riders, `null` before any), `cancels` (rides accepted then cancelled) |
| ✅ | `GET operations/rides/sos/?status=OPEN` | — | The SOS queue, oldest open first |
| ✅ | `POST operations/rides/sos/{sos_id}/resolve/` | `{ "resolution_note": "Called rider, all fine" }` | `200`; idempotent. A note is required. |

Captain approval is not here: it uses the existing partner review at `/operations/partners`.

### Rate-card versions

A rate card is never edited in place. Each change is a new row, so a quote always points at the
exact numbers it was priced on.

**The guarantee.** The database holds a partial unique constraint on `RideRateCard`: one row per
(`service_area`, `vehicle_type`) where `is_active` is true. Whatever any service does, PostgreSQL
refuses a second active card. The service rules below keep requests from ever reaching that
refusal; the constraint is the backstop, and a create that loses a race to it answers
`409 rate_card_exists`.

**A price change** (`PATCH` with new numbers) runs in one transaction:

1. Lock the card named by `{id}` with `select_for_update`.
2. If it is not active, refuse with `409 rate_card_inactive`: history is read-only.
3. Set the locked card `is_active = false`. **This comes first**, because PostgreSQL checks the
   partial unique index row by row and cannot defer it; inserting the new active card before
   deactivating the old one would be refused.
4. Insert the new card: `version` = old + 1, `is_active = true`, the changed fields, the other
   fields copied, `created_by` the operator.
5. Commit. Both rows change together or neither does.

Two operators editing the same card at once: the lock makes the second wait, and when it runs, the
card it named is no longer active, so step 2 refuses it with `409 rate_card_inactive`. One wins; the
other reloads and sees the new version. This replaces the `expected_version` field first proposed
here: because every edit retires the card it names, the card id itself is the version check.

**Switching a vehicle type off** (`PATCH` with `is_active: false` alone) locks the card, sets it
inactive and creates no new version. From that moment the vehicle type disappears from
`rides/availability/` and no new quote is made for it. Switching it back on is a `POST` of a new
card, which takes the next version number.

**What a change never touches.** A quote keeps its `rate_card` and `rate_card_version`, so a quote
made before the change keeps its price for its 5 minutes, and a ride keeps the fare of its quote.
Booking a quote whose vehicle was switched off afterwards is `422 vehicle_unavailable`.

---

## Required tests

An endpoint is not Implemented until its tests pass, in `backend/tests/rides/`.

**Passing today:** fares and routing (`test_fares.py`, `test_routing.py`); quotes, the quote limit,
availability and "no catalogue category" (`test_quotes.py`); passes, one purchase in flight and
queued passes (`test_passes.py`); duty and `server_now` (`test_duty.py`, `test_captain_me.py`);
location, the live map and the sweeps (`test_duty_and_location.py`); rate cards and pass plans
(`test_rides_operations.py`); booking and dispatch, one test per eligibility rule, radius widening,
an empty round, `NO_CAPTAIN_FOUND`, Redis down and the recovery sweep (`test_ride_dispatch.py`);
offers (`test_ride_offers.py`); the accept race, two captains at once in real transactions
(`test_offers_race.py`); model constraints (`test_constraints.py`).
`test_idempotency_guarantees.py` proves the platform behaviour the OTP design relies on: a command
which *returns* a refusal keeps its write and replays it without running again, a command which
*raises* rolls its write back and stores nothing, and a reused key with a different payload is
refused.

**Start OTP** (`test_otp.py`, passing):

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

Notifications queued once per event with the right audience, and the Operations APIs, are in
`test_notifications_and_ops.py`. `test_matrices.py` holds the two matrices: every ride step
from every state (each allowed move, and every other answering `409 invalid_transition`, or `404`
where the captain is not on the ride), and who may call what (anonymous, another rider, another
captain, a customer on a captain or Operations URL, a captain on an Operations URL, a partner who
is not a captain on a captain URL). `apps/rides` branch coverage: 98%. The trip steps, the arrival geofence and the waiting charge are in `test_trip_steps.py`;
cancellations and re-dispatch in `test_cancellations.py`; ratings, SOS, history and earnings in
`test_after_ride.py`.

## What the user sees when things go wrong

| Situation | Rider app | Captain (Partner app) |
| --- | --- | --- |
| Nobody near, or no captain accepts after the last round (`NO_CAPTAIN_FOUND`) | "No captain nearby", with **Try again** (a new quote) | — |
| The captain cancels | "Finding another captain…"; the ride is `SEARCHING` again | Back to Home |
| Another captain accepts first | — | "This ride is no longer available" |
| Routes is down | "We couldn't work out this trip right now", with **Try again** | ETA hidden, Navigate still works |
| Too many price checks | "Too many price checks. Try again in a minute." | — |
| Offline | An offline banner; polling resumes when back online. No invented position. | The same; pings resume by themselves when back online |
| The server took the captain off duty (pass ended, no pings for 2 minutes) | — | The location task stops; on next open: "You went off duty: …" with the reason |
| The app is reopened mid-ride | Lands on the open ride | Lands on the open ride |
| Wrong OTP five times | "Too many wrong codes…" | Cancel or contact support |
