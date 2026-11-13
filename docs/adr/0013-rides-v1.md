# 13. VSolve Rides V1: bike, auto and cab rides

- Status: Proposed
- Date: 2026-11-07
- Revised: 2026-11-10, for the owner's brief revision 2 (9 November 2026)

## Context

VSolve Hub sells scheduled and instant home services. The owner wants a Rapido-style ride-hailing
product, VSolve Rides V1, delivered between 6 and 14 November 2026: bike, auto and cab rides, a
Rides workspace for drivers (captains) inside the existing VSolve Partner app, ride screens inside
the Customer app, and Operations pages. Revision 2 of the brief removed the separate Captain app
and moved the deadline from 12 to 14 November.

The platform already owns most of the machinery a ride product needs: partner sign-in, onboarding,
document upload with virus scanning, an Operations review queue and suspension (`partners`); an
offer cascade for instant work (`assignments`, ADR-0009); standalone payments through Razorpay
(`commerce`, with `StaySubscription` as the pattern for a time-boxed purchase); outbox-driven
dispatch (ADR-0002) and its recovery sweep (ADR-0006); fail-closed provider selection (ADR-0004);
and an address search and reverse-geocoding adapter (`locations`).

Two facts about the environment shape the design. Production runs threaded gunicorn workers, not
ASGI, so there is no WebSocket tier. And `PartnerLocation` is rounded to about 100 m on purpose, for
privacy, so it cannot answer "which captain is close enough to take this ride". Captains use
Android only in V1; riders use Android and iOS.

The owner's brief (`docs/rapido/README.md`) makes the architectural decisions. This record writes
them down so they are not re-derived, and adds the decisions the brief left to the developer.

**Status of the build (10 November).** Built and tested in `backend/apps/rides`, published in contract
1.99.0: captain onboarding, the routing adapter and fare engine, quotes, rate-card and pass-plan
Operations APIs, the Daily Pass (with queued passes), duty, live location and its sweeps,
availability, booking, dispatch rounds, offers (current, accept, decline) and the recovery sweep.
The rider where-to and choose-ride screens and the Home entry are built in the Customer app. Trip
steps, cancellations, ratings, SOS, history, earnings, notifications, the remaining Operations APIs,
the Partner app Rides workspace and the Operations console are the agreed design, not shipped code.

## Decision

### Decided by the brief

1. **A captain is a partner, in the Partner app.** A captain is a `PartnerProfile` whose application
   track is `RIDE_CAPTAIN`. Sign-in, the partner role, document upload, the Operations review queue
   at `/operations/partners` and suspension are reused. There is no second KYC system and no
   separate Captain app: the Partner app gains a Rides workspace (Home, Rides, Wallet, Alerts, Me),
   shown only to a partner with a captain application, and never on iOS. Onboarding is short, like
   `EMPLOYER`: about you, agreements, identity documents, driving licence, vehicle RC and insurance,
   vehicle details, submit. **One account, one track:** `PartnerApplication` is one-to-one with the
   partner, so an electrician who also drives signs up again with another phone number.
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
5. **Quotes are single-use, short-lived and rate-limited.** A quote lives 5 minutes
   (`RIDES_QUOTE_TTL_SECONDS`) and keeps the rate-card version it was priced on, so editing a rate
   card never changes an existing quote or ride. Each quote request costs a Geocoding call and up to
   two Routes calls, so `POST rides/quotes/` is limited to 20 a minute per user (`rides_quotes`
   throttle, `429` beyond it).
6. **A vehicle type is bookable in an area only while it has an active rate card.** That is the only
   on/off switch. The Customer Home entry comes only from `GET rides/availability/`; no migration
   writes a catalogue category, because a catalogue row would show every customer a Rides tile on the
   first deploy, even where Rides does not run.
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
    every 3 s; OneSignal push wakes a captain whose app is in the background. Every countdown is a
    server `expires_at` drawn with `useServerCountdown` (ADR-0005).
12. **The rider pays the captain directly**, cash or UPI. VSolve holds no rider money in V1. VSolve
    earns from the Captain Daily Pass, bought through Razorpay with
    `PaymentAttempt.Purpose.RIDE_CAPTAIN_PASS`, following `StaySubscription`. A ₹0 plan activates
    without a payment attempt. Without an active pass a captain cannot go on duty
    (`403 pass_required`). **One purchase is in flight at a time:** while a paid purchase can still
    succeed (and is under 30 minutes old), buying the same plan returns it and any other plan is
    `409 pass_purchase_pending`. **A paid pass never shortens a running one:** a payment captured
    while another pass is active makes the new pass `QUEUED`, and the every-minute expiry task starts
    it at the exact moment the active one ends. At most one pass is queued per captain.
13. **Safety.** Start OTP; SOS (`RideSosEvent`, notifies Operations, shows `RIDES_EMERGENCY_NUMBER`);
    share-trip through the phone share sheet; the rider sees the captain's photo and vehicle number
    before the trip starts.
14. **Live location comes from an `expo-location` foreground service in the Partner app**, for
    approved captains on duty only (brief §5.13). It runs with a "You're on duty" notification, keeps
    pinging every 5 s with the screen off and while Google Maps navigation is open, and needs **no**
    "Allow all the time": `ACCESS_BACKGROUND_LOCATION` stays in the Partner app's
    `blockedPermissions`. The app config adds only `FOREGROUND_SERVICE` and
    `FOREGROUND_SERVICE_LOCATION`. The location task is defined at module top level, reads the token
    before it pings, sends only the newest location, and never restarts itself (Android forbids
    starting the service from the background). iOS hides the captain track and workspace. A partner
    who is not a captain never sees the disclosure or starts the service. The Customer app uses
    foreground location only. The Partner app's existing OneSignal app id carries ride offers on the
    Android channel "Ride requests".
15. **Ping times are in server time.** `GET partner/rides/me/` and the duty start and stop answers
    return `server_now`. The app keeps the offset from the phone clock and sends `captured_at`
    corrected by it, so a phone whose clock is wrong stays on duty, while a backlog of old pings sent
    after a network gap is still refused as stale.

### Decided while building captain onboarding

16. **The vehicle is editable only while the application is in `DRAFT` or `CHANGES_REQUIRED`.** The
    vehicle step comes before submit, so a captain must be able to save it before approval. Once the
    application is submitted the reviewer is looking at documents for that vehicle, and an approved
    captain who could swap it would bypass the review. Operations changes it after that. Outside
    those two statuses, or with no captain application, `PUT partner/rides/vehicle/` answers
    `403 captain_not_approved`.
17. **One place decides which documents a track requires.** `required_document_kinds(track)` in
    `partners/selectors.py` returns the identity documents from
    `settings.PARTNER_REQUIRED_DOCUMENT_KINDS`, plus the driving licence, vehicle RC and vehicle
    insurance for `RIDE_CAPTAIN`. Submission, the approval check and the application serializer all
    call it. Other tracks are unchanged. It is a single `if`, not a registry; a third track with its
    own documents is the point to turn it into a lookup.
18. **`RIDE_CAPTAIN` skips trades, service areas and working hours** on submit, joining `STAY_HOST`,
    `RENTAL_OWNER` and `EMPLOYER` in the short-onboarding rules. The submit error now reads "Upload
    every required document", because a captain's required documents are not all identity documents.
19. **A registration number is normalised and unique.** Stored upper-case with no spaces, so two
    spellings are one plate. The database unique constraint decides a race between captains; the
    service checks first only to answer early with `409 registration_already_used`. No Indian
    plate-format validation: it would reject real plates more often than it would catch mistakes.
20. **Proposal number 0030, contract version 1.99.0.** The brief first named proposal 0029 and
    contract 1.96.0, but `0029-operations-partner-import.md` exists and `main` was already at 1.98.0
    when the first Rides endpoints were published. The contract version moves by one minor for the
    whole branch; later Rides endpoints join the 1.99.0 changelog entry.

### Decided while building pricing, supply, dispatch and the revision 2 rework

21. **A quote's service area is the pickup's.** The pickup is reverse-geocoded to a postal code and
    checked with the existing serviceability rules (which also honour the KillSwitch pause); only the
    pickup must be served. If the place cannot be looked up, the answer is
    `503 routing_unavailable`, never a guessed area.
22. **Availability is open and honest.** `GET rides/availability/` is open to signed-out visitors
    (Home is), uses the existing serviceability rate limit, answers an empty `vehicle_types` list
    where Rides does not run, and `503` when the place cannot be looked up; the app hides the entry
    on any error. The Home entry uses the phone's location only if the customer already allowed it:
    Home never asks for the permission, so it is unchanged for every other customer.
23. **A round is guarded by its number.** Round N runs only while the ride is `SEARCHING`, its
    `dispatch_round` is N − 1, and no offer of the previous round is still live. A late, early or
    repeated task (the scheduled one and the sweep can both fire) therefore changes nothing. A round
    with no eligible captain moves straight to the next, so a ride with nobody near ends
    `NO_CAPTAIN_FOUND` at once instead of after 45 seconds.
24. **Redis down never ends a search.** If the live map cannot be read, the round keeps its progress,
    the ride stays `SEARCHING`, and the 30-second sweep retries it. `NO_CAPTAIN_FOUND` only ever
    means "nobody eligible was found".
25. **Eligible captains are locked while they are offered.** The eligibility query takes
    `select_for_update(skip_locked=True)` on the captains' partner rows, so two rides dispatching at
    the same moment cannot both offer the same captain. A captain is never offered their own ride.
26. **A decline moves dispatch on at once.** When nobody else in the round is still deciding, the next
    round starts immediately instead of waiting for the timer. Declining twice or after the deadline
    changes nothing.
27. **Accept re-checks duty, and is idempotent.** A captain who went off duty since the offer gets
    `409 not_on_duty`. Accepting an offer the captain already won returns the ride, with or without
    the same `Idempotency-Key`.
28. **Phone numbers and photos.** Each side sees the other's phone number only while the ride is
    `CAPTAIN_ASSIGNED`, `CAPTAIN_ARRIVED` or `IN_TRIP`. The captain's photo uses the existing
    `partner_photo_url`, which publishes only a reviewed photo and is otherwise `null`.
29. **Agreed for the remaining engine work (Day 5).** `RIDES_OTP_SECRET` is required, with no
    default: without it no start code can be derived, so no ride can start (fail-closed at use;
    a startup check would also stop every test run and laptop that lacks it). Rider cancel reasons: `CHANGED_MIND`, `CAPTAIN_DELAYED`, `WRONG_PICKUP`, `OTHER`.
    Captain cancel reasons: `RIDER_NOT_REACHABLE`, `VEHICLE_ISSUE`, `PICKUP_TOO_FAR`, `OTHER`.
    Operations cancels with free text. The rider's pickup ETA uses the same routing adapter, cached
    30 seconds per ride. Notifications are queued through `request_notification` with the right
    audience.
30. **Re-dispatch and the unique offer.** The brief makes (`ride`, `captain`) unique on `RideOffer`.
    After a captain cancels, dispatch restarts at round 1. A captain is offered a ride once per
    *search* (a search starts at booking and at each captain cancel), so other captains from an
    earlier search are offered it again by resetting their existing row to `PENDING`, never by
    inserting a second row. A captain who cancelled is excluded for good, read from the ride's
    `RideTransition` rows; their `ACCEPTED` offer becomes `WITHDRAWN` so the ride's single accepted
    slot is free for the next captain. The rider's view says `searching_again` meanwhile.

31. **After the ride.** A rating is once per side, enforced by the database (`409
    invalid_transition` on a repeat). An SOS is never refused for lack of a place: either side's
    SOS uses the captain's last ping when the phone sends none, and a second press while one is open
    returns it, so a panicked double tap is one alert. Earnings are computed in India time:
    `today` from local midnight, `week` from Monday.

32. **Notifications are queued with the event, in its transaction.** `apps/rides/notify.py` calls
    `request_notification` next to each change, keyed by the event, so a notice exists exactly
    when its change committed and a repeated step never notifies twice; the platform's delivery
    sweep sends it. No extra outbox event is needed for that. Pushes go to the captain (new offer,
    rider or Operations cancel) and the rider (assigned, arrived, no captain, finding another,
    Operations cancel); an SOS goes to every Operations user in the console feed. Contexts hold
    names, amounts and ids only: never an address, a position or a start code. Template context
    keys reuse the shared names the notifications feed test documents (`amount`,
    `partner_name`).

### Decided while building the rider screens and the Operations console

33. **Reopening the app lands on the open ride from Home's Rides card.** The customer app opens on
    Home, and `RidesEntry` is the one Rides line Home may hold (§2), so it asks `GET rides/` once
    per launch and opens the ride still going. The app's root layout stays untouched. A failed
    check is tried again on the next visit to Home, never retried in a loop.
34. **One ride screen for live and past rides.** History opens the same screen as the live ride; it
    already shows the cancelled and "pay your captain" states, and the rating for a ride not yet
    rated. No second detail screen to keep in step.
35. **The captain's rating is worked out on read.** `rating` on the rider's captain card is one
    indexed aggregate over `RideRating`, the same number the Operations captains list shows. No
    stored average to drift or migrate.
36. **The console is one Rides page with tabs** (rides, SOS, captains, rate cards, pass plans),
    the pattern Rentals and Stays use, plus a ride detail page. Live rides and the SOS queue ask
    again every 10 seconds, so an SOS shows within the 10 s the device checklist asks for. Rate
    cards can be added only for areas that already have one: areas come from the seed command in
    V1, so there is no area-list endpoint.

37. **Fixes from the full-feature code review (11 Nov).** A ride keeps its captain tracked to the
    end: pings are accepted off duty while a ride is open, the 2-minute sweep skips a captain on a
    ride, and the app hides Go off duty during one. A failed area lookup keeps the captain's last
    listing. Accept re-checks approval and pass. No pass is sold while one is queued. Wrong start
    codes stay counted on the ride across a captain cancel. A re-sent offer rings again (the app
    keys it by id and `offered_at`). The tunable limits moved to `RIDES_*` settings, and the sweep
    checks all captains in one Redis round trip.

38. **The Rides card on Home is always shown to a signed-in customer (12 Nov).** It no longer waits
    for `GET rides/availability/` or for location permission, which hid Rides from anyone whose
    phone had no fix yet or sat outside a served area, with no hint why. The Where-to screen asks
    for the location (and says why), and a pickup where Rides does not run is told so on the
    Choose-ride screen: "Rides isn't available here yet." The availability endpoint stays; the
    Customer app just does not call it. This departs from brief §5.11 (owner to confirm).

## Consequences

- Rides reuses the partner review queue, so Operations needs no new approval screen. The cost is that
  a `RIDE_CAPTAIN` application shares the queue with every other track. The review screen names the
  three new document types (`partner-review/view/document-reveal.tsx`, a three-line change outside
  §2 that the admin type check required).
- Licence and insurance expire, but the existing expiry tracking
  (`capabilities/eligibility.py`) reads only the global identity-document list, so captain documents
  are not covered by it yet.
- No money moves between rider and VSolve, so V1 has no refund, dispute or settlement path. A cash
  dispute is a support matter. Online payment, surge pricing and captain withdrawals are V2.
- **Two late pass payments for one captain need Operations.** Only one pass may be queued. If a second
  hung payment is captured while a pass is active and another is queued, it stays
  `PENDING_ACTIVATION` and logs `ride_pass_payment_needs_review` at error level, so the money is never
  silently dropped. One purchase in flight makes this very rare.
- Polling puts steady load on gunicorn threads: a captain on duty is about 30 requests a minute for
  the offer poll, plus 12 for the location ping. Those reads must stay cheap (indexed, no per-request
  routing call). The pickup ETA is cached for 30 seconds per ride for the same reason.
- Redis GEO members do not expire. Correctness depends on the `rides:pos:` TTL check and the 60-second
  stale sweeper. If Redis is flushed, no captain is matchable until the next ping, and the app must
  say so rather than show a stale list.
- Live GPS needs a development build (foreground services do not run in Expo Go). Phone makers that
  kill apps (Xiaomi, Oppo, Vivo, Realme, OnePlus, Samsung) can stop the service; the battery help
  screen guides the captain, and the 2-minute stale sweep is the backstop, so a silent phone is never
  shown as on duty. Google Play asks for a foreground-service (location) declaration with a video;
  there is no background-location declaration.
- One account, one track means an existing partner who wants to drive needs a second phone number.
- The partial unique constraints behind "one open ride per rider and per captain" turn a race into an
  `IntegrityError`; the services translate it into `409 ride_already_open` or
  `409 ride_no_longer_available`, not a 500.
- Locking the vehicle after submit means a captain who bought a new vehicle needs Operations. That is
  deliberate for V1 and costs support time.
- Seeded rate cards are placeholders. Nothing in the repository makes a placeholder safe to ship; the
  owner must replace the numbers before any real ride.

## Dependencies

| Package | App | Why |
| --- | --- | --- |
| `react-native-maps` | Customer (Partner already has it) | Map, route polyline and the moving captain marker. Google provider on Android, Apple Maps on iOS. |
| `expo-task-manager` | Partner | Required by `startLocationUpdatesAsync`; defines the `rides-location` task that pings while on duty. |
| `expo-intent-launcher` | Partner | Opens the Android battery-optimisation settings list from the battery help screen. |

Installed with `npx expo install`. `expo-location` is already in the Partner app; its config plugin
gains `isAndroidForegroundServiceEnabled` and `androidForegroundServiceIcon`. No new Python package:
Redis GEO uses the existing Redis client and the OTP HMAC uses the standard library.

## References

- `docs/rapido/README.md`: the owner's brief, revision 2.
- ADR-0002 (outbox and Celery), ADR-0004 (fail-closed provider), ADR-0005 (server clock),
  ADR-0006 (outbox recovery sweep), ADR-0009 (rate-card instant dispatch, the closest design).
- `backend/apps/stay/models.py` and `services.py` (`StaySubscription`): the Daily Pass pattern.
- `backend/apps/partners/models/onboarding.py` and `services/`: the `EMPLOYER` track, copied for
  `RIDE_CAPTAIN`.
- `backend/apps/mobile/`: the layout copied for `apps/rides`.
- `backend/apps/locations/geocoding.py`: address search and reverse geocoding, reused as is.
- `common/throttling.py`: `ThrottledWriteMixin`, used for the quote limit.
- `contracts/proposals/0030-rides-v1.md`: the API surface.
- Android location permissions and foreground service types, Expo TaskManager and Location, Don't
  Kill My App, Redis `GEOSEARCH`, Google Routes `computeRoutes`: the sources listed in brief §10.
