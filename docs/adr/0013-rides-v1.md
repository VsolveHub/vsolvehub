# 13. VSolve Rides V1: bike, auto and cab rides

- Status: Proposed
- Date: 2026-11-07

## Context

VSolve Hub sells scheduled and instant home services. The owner wants a Rapido-style ride-hailing
product, VSolve Rides V1, delivered between 6 and 12 November 2026: bike, auto and cab rides, a new
driver app (VSolve Captain), ride screens inside the Customer app, and Operations pages.

The platform already owns most of the machinery a ride product needs: partner sign-in, onboarding,
document upload with virus scanning, an Operations review queue and suspension (`partners`); an
offer cascade for instant work (`assignments`, ADR-0009); standalone payments through Razorpay
(`commerce`, with `StaySubscription` as the pattern for a time-boxed purchase); outbox-driven
dispatch (ADR-0002) and its recovery sweep (ADR-0006); fail-closed provider selection (ADR-0004);
and an address search and reverse-geocoding adapter (`locations`).

Two facts about the environment shape the design. Production runs threaded gunicorn workers, not
ASGI, so there is no WebSocket tier. And `PartnerLocation` is rounded to about 100 m on purpose, for
privacy, so it cannot answer "which captain is close enough to take this ride". The Captain app
targets Android only in V1.

The owner's brief (`docs/rapido/README.md`) makes the architectural decisions. This record writes
them down so they are not re-derived, and adds the decisions the brief left to the developer.

**Status of the build.** This record describes the whole of V1. At the time of writing only captain
onboarding is built (the `RIDE_CAPTAIN` application track, `CaptainVehicle` and the captain `me` and
`vehicle` endpoints, contract 1.99.0). Everything else below is the agreed design, not shipped code.

## Decision

### Decided by the brief

1. **A captain is a partner.** A captain is a `PartnerProfile` whose application track is
   `RIDE_CAPTAIN`. Sign-in, the partner role, document upload, the Operations review queue at
   `/operations/partners` and suspension are reused. There is no second KYC system. Onboarding is
   short, like `EMPLOYER`: about you, agreements, identity documents, driving licence, vehicle RC and
   insurance, vehicle details, submit.
2. **Rides keeps its own duty and location state.** `CaptainDutySession` records duty, because
   `PartnerOnlineSession` drives home-service dispatch. Live positions are in Redis GEO
   (`rides:geo:{service_area_id}:{vehicle_type}` and `rides:pos:{partner_id}`). Trip breadcrumbs are
   `RideTrackPoint`, written only from `CAPTAIN_ASSIGNED` to `IN_TRIP` and pruned after 90 days.
   PostgreSQL stays the truth for who is on duty; Redis only answers "who is near?".
3. **The server is the only source of price.** Money is integer paise. The fare is the larger of the
   minimum fare and base fare plus distance beyond the included distance plus time, rounded once to
   the nearest rupee, half up. Waiting time is added at the end of the trip. The fare is upfront: V1
   never re-prices by GPS distance.
4. **Distance and time come from Google Routes `computeRoutes`**, called by the server behind an
   adapter with a 3-second timeout and one retry. Bike uses `TWO_WHEELER`; auto and cab use `DRIVE`.
   `RIDES_ROUTING_PROVIDER` is `"google"` or `"fake"`; the default `"unconfigured"` refuses every call
   and production refuses to boot with `"fake"` (ADR-0004). If Google fails the API answers
   `503 routing_unavailable`. There is no straight-line fallback and no fallback fare.
5. **Quotes are single-use and short-lived.** A quote lives 5 minutes (`RIDES_QUOTE_TTL_SECONDS`) and
   keeps the rate-card version it was priced on, so editing a rate card never changes an existing
   quote or ride.
6. **A vehicle type is bookable in an area only while it has an active rate card.** That is the only
   on/off switch.
7. **The ride is a state machine with an audit row per move.** States: `SEARCHING`,
   `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED`, `IN_TRIP`, `COMPLETED`, `CANCELLED`, `NO_CAPTAIN_FOUND`.
   Every transition writes an append-only `RideTransition`. A captain cancel sends the ride back to
   `SEARCHING` with that captain excluded. Only Operations can cancel an `IN_TRIP` ride.
8. **First accept wins.** Accepting locks the ride with `select_for_update`; every other offer becomes
   `WITHDRAWN` and the loser receives `409 ride_no_longer_available`.
9. **The start OTP is derived, never stored:** `HMAC(RIDES_OTP_SECRET, ride.id)` reduced to four
   digits. Only the rider sees it, only before `IN_TRIP`. Five wrong tries give `423 otp_locked`.
10. **Dispatch runs from the outbox and Celery** (ADR-0002). Creating a ride writes
    `rides.ride_requested`, whose handler starts round 1. Rounds use `RIDES_DISPATCH_RADII_M =
    [2000, 4000, 6000]`, up to `RIDES_OFFERS_PER_ROUND = 3` captains per round, each offer lasting
    `RIDES_OFFER_SECONDS = 15`. Every task re-reads the ride first because delivery is at least once.
    A 30-second sweep re-drives stuck `SEARCHING` rides (ADR-0006).
11. **Real time is push plus polling.** No Django Channels, Firebase Realtime Database or Socket.IO.
    Captains poll the current offer every 2 s and the current ride every 5 s; riders poll the ride
    every 3 s; OneSignal push wakes a backgrounded captain. Every countdown is a server `expires_at`
    drawn with `useServerCountdown` (ADR-0005).
12. **The rider pays the captain directly**, cash or UPI. VSolve holds no rider money in V1. VSolve
    earns from the Captain Daily Pass, bought through Razorpay with
    `PaymentAttempt.Purpose.RIDE_CAPTAIN_PASS`, following `StaySubscription`. A ₹0 plan activates
    without a payment attempt. Without an active pass a captain cannot go on duty
    (`403 pass_required`).
13. **Safety.** Start OTP; SOS (`RideSosEvent`, notifies Operations, shows `RIDES_EMERGENCY_NUMBER`);
    share-trip through the phone share sheet; the rider sees the captain's photo and vehicle number
    before the trip starts.
14. **Mobile.** Background location lives in the Captain app only (Android, `expo-location` with
    `expo-task-manager`, only while on duty, with a foreground-service notification). The Customer
    app uses foreground location only. The Captain app uses the partner OneSignal app id.

### Decided while building captain onboarding

15. **The vehicle is editable only while the application is in `DRAFT` or `CHANGES_REQUIRED`.** The
    vehicle step comes before submit, so a captain must be able to save it before approval. Once the
    application is submitted the reviewer is looking at documents for that vehicle, and an approved
    captain who could swap it would bypass the review. Operations changes it after that. Outside
    those two statuses, or with no captain application, `PUT partner/rides/vehicle/` answers
    `403 captain_not_approved`.
16. **One place decides which documents a track requires.** `required_document_kinds(track)` in
    `partners/selectors.py` returns the identity documents from
    `settings.PARTNER_REQUIRED_DOCUMENT_KINDS`, plus the driving licence, vehicle RC and vehicle
    insurance for `RIDE_CAPTAIN`. Submission, the approval check and the application serializer all
    call it. Other tracks are unchanged. It is a single `if`, not a registry; a third track with its
    own documents is the point to turn it into a lookup.
17. **`RIDE_CAPTAIN` skips trades, service areas and working hours** on submit, joining `STAY_HOST`,
    `RENTAL_OWNER` and `EMPLOYER` in the short-onboarding rules. The submit error now reads "Upload
    every required document", because a captain's required documents are not all identity documents.
18. **A registration number is normalised and unique.** Stored upper-case with no spaces, so two
    spellings are one plate. The database unique constraint decides a race between captains; the
    service checks first only to answer early with `409 registration_already_used`. No Indian
    plate-format validation: it would reject real plates more often than it would catch mistakes.
19. **Proposal number 0030, contract version 1.99.0.** The brief names proposal 0029 and contract
    1.96.0, but `0029-operations-partner-import.md` exists and `main` was already at 1.98.0 when the
    first Rides endpoints were published. The contract version moves by one minor for the whole branch;
    later Rides endpoints join the 1.99.0 changelog entry.
20. **Re-dispatch and the unique offer (to confirm when dispatch is built).** The brief makes
    (`ride`, `captain`) unique on `RideOffer`. After a captain cancels, dispatch restarts at round 1
    without that captain. Other captains whose earlier offers expired would be re-offered by resetting
    their existing row to `PENDING` for the new round, not by inserting a second row. The cancelling
    captain keeps their row and so stays excluded.

## Consequences

- Rides reuses the partner review queue, so Operations needs no new approval screen. The cost is that
  a `RIDE_CAPTAIN` application shares the queue with every other track, and the review screen must
  show the three new document types. That has not been checked yet.
- Licence and insurance expire, but the existing expiry tracking
  (`capabilities/eligibility.py`) reads only the global identity-document list, so captain documents
  are not covered by it yet.
- No money moves between rider and VSolve, so V1 has no refund, dispute or settlement path. A cash
  dispute is a support matter. Online payment, surge pricing and captain withdrawals are V2.
- Polling puts steady load on gunicorn threads: a captain on duty is about 30 requests a minute for
  the offer poll, plus 12 for the location ping. Those reads must stay cheap (indexed, no per-request
  routing call). The pickup ETA is cached for 30 seconds per ride for the same reason.
- Redis GEO members do not expire. Correctness depends on the `rides:pos:` TTL check and the 60-second
  stale sweeper. If Redis is flushed, no captain is matchable until the next ping, and the app must
  say so rather than show a stale list.
- Background GPS needs a development build and Android foreground-service permissions, and Google
  Play requires a prominent location disclosure. Play review may take longer than the build week.
- The partial unique constraints behind "one open ride per rider and per captain" turn a race into an
  `IntegrityError`; the services must translate it into `409 ride_already_open`, not a 500.
- Locking the vehicle after submit means a captain who bought a new vehicle needs Operations. That is
  deliberate for V1 and costs support time.
- Seeded rate cards will be placeholders. Nothing in the repository makes a placeholder safe to ship;
  the owner must replace the numbers before any real ride.

## Dependencies

| Package | App | Why |
| --- | --- | --- |
| `react-native-maps` | Customer, Captain | Map, route polyline and the moving captain marker. Google provider on Android, Apple Maps on iOS. The Partner app already uses it. |
| `expo-task-manager` | Captain | Defines the background location task that keeps pinging while on duty. |
| `expo-intent-launcher` | Captain | Opens the Android battery-optimisation settings so duty is not killed. |

Installed with `npx expo install`. No new Python package: Redis GEO uses the existing Redis client and
the OTP HMAC uses the standard library.

## References

- `docs/rapido/README.md`: the owner's brief.
- ADR-0002 (outbox and Celery), ADR-0004 (fail-closed provider), ADR-0005 (server clock),
  ADR-0006 (outbox recovery sweep), ADR-0009 (rate-card instant dispatch, the closest design).
- `backend/apps/stay/models.py` and `services.py` (`StaySubscription`): the Daily Pass pattern.
- `backend/apps/partners/models/onboarding.py` and `services/`: the `EMPLOYER` track, copied for
  `RIDE_CAPTAIN`.
- `backend/apps/mobile/`: the layout copied for `apps/rides`.
- `backend/apps/locations/geocoding.py`: address search and reverse geocoding, reused as is.
- `contracts/proposals/0030-rides-v1.md`: the API surface (to be written).
