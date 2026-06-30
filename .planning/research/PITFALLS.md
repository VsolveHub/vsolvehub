# Pitfalls Research

**Domain:** Local-services marketplace — auto-dispatch, OTP auth, mobile apps, Indian market integrations
**Researched:** 2026-06-22
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Dispatch Race Condition — Two Workers Accept the Same Job

**What goes wrong:**
Worker A and Worker B both receive a 30-second offer for the same job. Both tap "Accept" within milliseconds of each other. Both requests hit the server, both pass the "offer is active" check, and the job is assigned twice. Customer gets two workers showing up; or the second assignment silently overwrites the first.

**Why it happens:**
Developers check `offer.status == PENDING` and then update it in two separate steps — a classic TOCTOU bug. Django ORM `update()` calls without a database-level lock don't prevent concurrent reads from both seeing `PENDING`.

**How to avoid:**
Use a single atomic `UPDATE ... WHERE status = 'PENDING' RETURNING id` or Django's `select_for_update()` inside a transaction. Only the transaction that gets the row lock proceeds; the other gets 0 rows updated and returns "offer already taken." Never check-then-update in two round-trips.

**Warning signs:**
- Duplicate `ASSIGNED` events in the booking timeline for the same job
- Worker complaints that they accepted but got "already taken" — good, but only if the error surfaces cleanly
- Missing uniqueness constraint on `(booking_id, status='ASSIGNED')` in the DB

**Phase to address:** Phase 1, before dispatch engine goes live

---

### Pitfall 2: Client-Side OTP Trust — Phone Number Spoofed in Booking Request

**What goes wrong:**
The browser sends `{ phone: "+919876543210", otp_verified: true }`. The backend accepts the phone number from the request body, creates a booking under that number. An attacker books under any phone number without owning it.

**Why it happens:**
Developers verify the OTP in a separate step, store `verified=true` in a JS variable or cookie, and then pass the phone number again in the booking payload — trusting the client to repeat the correct number.

**How to avoid:**
The server issues a short-lived signed token (JWT or opaque) after OTP verification that embeds the verified phone number server-side. Booking creation only accepts this token — never a phone number from the request body. The phone number is extracted from the token, not from request data.

**Warning signs:**
- Booking endpoint accepts `phone` as a user-supplied field
- OTP verification and booking are separate API calls with no server-side session linking them
- No uniqueness check that the token-embedded phone matches any booking field

**Phase to address:** Phase 1, OTP gate implementation

---

### Pitfall 3: Celery Task Loss on Redis Restart — 30s Offer Timers Vanish

**What goes wrong:**
Redis restarts (OOM kill, deploy, maintenance). All pending Celery tasks in the broker queue are gone. Active 30-second job-offer timers never fire. Workers' offers never expire. Jobs stay in `OFFER_SENT` forever. Admin can't see why no assignment happened.

**Why it happens:**
Redis defaults to no persistence (`save ""` disabled or RDB snapshots too infrequent). Celery tasks queued but not yet picked up by a worker are ephemeral in-memory data.

**How to avoid:**
Enable Redis AOF persistence (`appendonly yes`) on the broker instance. Alternatively, use a `result_expires` sentinel and have a Celery beat periodic task scan for stale `OFFER_SENT` bookings older than 60 seconds and re-trigger the expiry logic. Both together is safest.

**Warning signs:**
- Redis `config get appendonly` returns `no`
- No periodic "stuck booking" cleanup job in `CELERYBEAT_SCHEDULE`
- Staging deploys occasionally leave ghost `OFFER_SENT` bookings

**Phase to address:** Phase 1, infrastructure setup

---

### Pitfall 4: DLT Registration Delay Blocks OTP at Launch

**What goes wrong:**
DLT (Distributed Ledger Technology) registration for SMS in India requires telecom operator approval of your entity, headers, and message templates. This takes 2–4 weeks minimum, sometimes 6+. If you start this process after coding is done, OTP won't work at launch.

**Why it happens:**
Developers treat it as an ops task to do "before go-live" without realizing it blocks the entire auth flow. MSG91 can't send OTPs without an approved DLT template and registered sender header.

**How to avoid:**
Start DLT registration on Day 1 of Phase 1, not Day 30. Register entity, sender header (e.g., `VSOLVE`), and the OTP template simultaneously. Use MSG91's DLT dashboard. Plan for a 3-week buffer. Have a fallback: WhatsApp OTP delivery via WATI for the first weeks if SMS is blocked.

**Warning signs:**
- DLT registration hasn't been initiated by Week 2 of Phase 1
- No registered DLT entity ID or template ID in MSG91 dashboard
- Testing OTP in staging using a non-DLT path that won't work in production

**Phase to address:** Phase 1, Week 1 (parallel to coding)

---

### Pitfall 5: WhatsApp Template Not Pre-Approved — Notifications Fail at Launch

**What goes wrong:**
WhatsApp Business API (via WATI) requires all outbound message templates to be pre-approved by Meta. Approval takes 1–7 days per template and can be rejected for policy reasons. If templates aren't submitted early, the notification system is non-functional at launch.

**Why it happens:**
Developers build the notification code assuming template approval is trivial, submit templates late, and discover rejections or delays when testing.

**How to avoid:**
Write all WhatsApp notification templates (booking confirmation, assignment, OTP, status updates) in Week 1. Submit all at once. Build the code against template variable placeholders. Account for rejection: have fallback SMS text for every WhatsApp notification. Never hard-code template content in code — store template IDs in config.

**Warning signs:**
- WATI dashboard has fewer approved templates than notification event types
- Notification code has template body text hard-coded instead of template IDs
- No SMS fallback implemented for any WhatsApp notification path

**Phase to address:** Phase 1, Week 1

---

### Pitfall 6: Worker Location Staleness Breaks Proximity Matching

**What goes wrong:**
A worker last pinged their location 4 hours ago (app backgrounded). The dispatch engine ranks them as "1.2 km away" and offers them the job first. The worker is actually 40 km away on another errand. They accept, then realize it's too far, and decline. This wastes the customer's 30-second wave.

**Why it happens:**
Proximity matching uses `last_known_location` without any staleness check. Location pings from Flutter apps stop when the app is backgrounded, but the worker is still marked ONLINE.

**How to avoid:**
Add a `location_updated_at` field. Exclude workers from the proximity-ranked pool if `location_updated_at < now() - 30 minutes`. Treat a stale-location worker the same as an OFFLINE worker for dispatch purposes. Show the worker a banner in the app when their location is stale.

**Warning signs:**
- Worker model has `last_location` but no `location_updated_at`
- Dispatch query doesn't filter on location freshness
- Workers staying ONLINE after backgrounding the app for hours

**Phase to address:** Phase 1, dispatch engine + Captain app

---

### Pitfall 7: Booking State Machine Has No Transition Enforcement

**What goes wrong:**
A worker's app or a bad API client sends `status=COMPLETED` directly from `ASSIGNED`, skipping `ON_THE_WAY → ARRIVED → IN_PROGRESS`. The booking timeline looks wrong. Earnings records are created without proof of service. Customers dispute charges.

**Why it happens:**
Status is stored as a string field updated by `PATCH /bookings/{id}/status/`. No state machine validation means any status value transitions to any other.

**How to avoid:**
Define the allowed transition graph (`SEARCHING → ASSIGNED`, `ASSIGNED → ON_THE_WAY`, etc.) as a constant in the backend. Every status update request validates `(current_status, requested_status)` against the graph and raises a 400 if invalid. Use a library like `django-fsm` or implement the transition map explicitly.

**Warning signs:**
- Booking status update endpoint accepts any `status` value without checking current status
- No `BookingTransition` log table or timeline events
- Tests only test the happy-path forward transitions

**Phase to address:** Phase 1, booking status API

---

### Pitfall 8: JWT Refresh Token Leakage — 30-Day Window for Account Takeover

**What goes wrong:**
A 30-day refresh token stored in `localStorage` (or an insecure cookie) is extracted by XSS or a malicious third-party script. The attacker silently rotates access tokens for 30 days, acting as the customer.

**Why it happens:**
Storing refresh tokens in `localStorage` is common but wrong. XSS on any page (including third-party analytics scripts) can read `localStorage`.

**How to avoid:**
Store refresh tokens in `HttpOnly; Secure; SameSite=Strict` cookies only — JavaScript cannot read these. Access tokens (15-min) can go in memory (React state or Zustand). On page reload, hit a `/auth/refresh` endpoint that reads the HttpOnly cookie silently. Never put tokens in `localStorage` or `sessionStorage`.

**Warning signs:**
- `localStorage.setItem('refresh_token', ...)` anywhere in the codebase
- Refresh token returned in JSON response body and stored client-side
- No `HttpOnly` flag on the refresh token cookie

**Phase to address:** Phase 1, auth implementation

---

### Pitfall 9: N+1 Queries in Worker Pool Ranking Kill Dispatch Latency

**What goes wrong:**
Building the worker candidate pool iterates over workers and for each one fetches their recent ratings, active jobs, and location — in a Python loop. For 100 workers in a radius, that's 300+ database queries per booking request. At 20 concurrent bookings, the DB is under 6,000 queries/second from dispatch alone.

**Why it happens:**
The ranking logic reads naturally in Python ("for each worker, get their average rating"), and Django's lazy queryset evaluation makes the N+1 invisible until production load.

**How to avoid:**
Write the entire worker pool query, ranking, and scoring as a single annotated queryset with `select_related`, `prefetch_related`, and `annotate(avg_rating=Avg(...))`. The entire sorted candidate list must come from one SQL statement. Verify with Django Debug Toolbar in development — zero queries inside the dispatch loop.

**Warning signs:**
- Dispatch logic has a `for worker in candidates:` loop that touches `worker.ratings` or `worker.jobs`
- Django Debug Toolbar shows 50+ queries on a booking acceptance in development
- No DB indexes on `(worker.status, worker.is_online, worker.last_location)` columns

**Phase to address:** Phase 1, dispatch engine

---

### Pitfall 10: FCM Push Token Staleness — Notifications Silently Drop

**What goes wrong:**
A worker reinstalls the app or clears data. Their FCM token changes. The backend still has the old token. All push notifications to that worker fail silently — FCM returns `messaging/registration-token-not-registered` but the backend ignores the error. The worker never sees job offers.

**Why it happens:**
FCM token registration is treated as a one-time event on install. Error handling on notification send is "fire and forget."

**How to avoid:**
On every FCM send, check the response for `messaging/registration-token-not-registered` and immediately delete or deactivate that token in the DB. Prompt the Flutter app to re-register its FCM token on every cold start and send it to the backend. Store tokens with `updated_at` and discard tokens older than 60 days.

**Warning signs:**
- FCM send is wrapped in a bare `try/except` with no error inspection
- Worker profile has one FCM token field, not a table of tokens with timestamps
- No retry logic or error logging for failed push sends

**Phase to address:** Phase 1, Captain app + notification service

---

### Pitfall 11: DigiLocker / Aadhaar KYC Flow Has No Webhook Retry — Verification Stuck

**What goes wrong:**
DigiLocker sends a webhook callback when KYC completes. The callback hits the server during a brief downtime or deploy. The webhook is missed. The worker's KYC is complete on DigiLocker's side but their status stays `PENDING_KYC` forever. They can't go online. They churn.

**Why it happens:**
Webhook-based flows assume 100% delivery. Developers implement the happy path (receive webhook → update status) but not the recovery path.

**How to avoid:**
Store the DigiLocker session/request ID. Implement a Celery beat task that polls DigiLocker's status endpoint every 10 minutes for any workers stuck in `PENDING_KYC` for more than 30 minutes. Expose an admin action to manually trigger a status recheck. Log all incoming webhooks before processing.

**Warning signs:**
- No idempotency key on the webhook handler (double-delivery would create duplicate verification records)
- No periodic task scanning for stuck `PENDING_KYC` workers
- No way for admin to manually trigger a KYC status recheck

**Phase to address:** Phase 1, worker onboarding + admin dashboard

---

### Pitfall 12: SEO Slug Collision After Category Rename

**What goes wrong:**
Category "Home Cleaning" gets slug `home-cleaning`. Admin renames it to "Home Services." New slug `home-services` is generated. The old URL `/services/home-cleaning` now 404s — breaking Google rankings and any bookmarked links.

**Why it happens:**
Slugs are regenerated from the current name on every save. No redirect is created for the old slug.

**How to avoid:**
Never auto-regenerate slugs on name change after the first creation. Store the slug as an independently editable field that defaults to the slugified name on creation only. If a slug must change, create a `ServiceCategoryRedirect` record mapping old → new slug and serve 301 redirects. Add a unique constraint on slugs.

**Warning signs:**
- `slug = slugify(self.name)` in the model's `save()` method (regenerates on every save)
- No redirect table for old slugs
- No unique constraint on slug columns

**Phase to address:** Phase 1, category/service data model

---

### Pitfall 13: Phone Number Format Inconsistency Breaks OTP Matching

**What goes wrong:**
Customer enters `9876543210`. The system stores `+919876543210`. Later, the same customer enters `09876543210` or `+91 98765 43210`. A new account is created. They can't find their booking history. OTP rate-limiting doesn't work because the same person has multiple phone records.

**Why it happens:**
Phone numbers are stored as-entered without normalization. Different entry points (web form, Flutter app, admin panel) apply different transformations.

**How to avoid:**
Normalize to E.164 (`+91XXXXXXXXXX`) at the point of entry — in the backend, not the frontend. Use a library like `phonenumbers` (Python). Store only normalized form. Add a unique constraint on the normalized phone field. Reject non-Indian numbers in Phase 1 (country code validation).

**Warning signs:**
- Phone stored as a `CharField` without any `clean()` or validation logic
- Multiple user records visible in admin with similar phone numbers in different formats
- OTP endpoint accepts raw phone input without server-side normalization

**Phase to address:** Phase 1, auth + user model

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Polling for dispatch status instead of WebSocket | Simpler to build | Extra DB load; 2–5s lag in status updates visible to customer | Never for admin monitor; acceptable for customer status page at launch if WebSocket deferred |
| Skipping `select_for_update()` on offer acceptance | Faster development | Race condition under load (Pitfall 1) | Never |
| Hard-coding WhatsApp template body in code | Faster first send | Template changes require deploy; can't A/B test messages | Never — always use template IDs |
| Storing Aadhaar number plaintext in a log | Easier debugging | Compliance violation; PII in logs | Never |
| `print()` / `console.log()` debugging in dispatch engine | Quick dev feedback | Pollutes production logs; masks real errors | Development only, removed before merge |
| `DEBUG=True` in production Django | Detailed error pages | Exposes source code, env vars, SQL to anyone who triggers a 500 | Never |
| Single Redis instance for both OTP cache and Celery broker | One less thing to manage | A Redis flush (during debugging) wipes both OTP sessions and pending tasks | Acceptable at launch; split by Phase 2 |
| Skipping ISR revalidation on admin content changes | Simpler caching | Stale service pages in Google; customers see old prices/categories | Acceptable only if revalidation path is planned for Week 2 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MSG91 OTP | Using the basic OTP API without DLT-registered templates | Register DLT entity + template ID first; pass `dlt_template_id` in every API call |
| MSG91 OTP | Trusting client-side "verified" flag | Server issues a signed token post-verification; client never retransmits the phone number |
| WATI WhatsApp | Sending free-form messages outside 24-hour customer-initiated window | Use only pre-approved HSM (template) messages for outbound; never free-form outbound |
| WATI WhatsApp | One template for all notification types | Each status change (ASSIGNED, ON_THE_WAY, COMPLETED) needs its own approved template |
| FCM | Sending to a single token and ignoring errors | Inspect FCM response; handle `NotRegistered` and `InvalidRegistration` by deleting the token |
| FCM | Flutter app registers FCM token once on install | Re-register on every cold start; send updated token to backend if it changed |
| DigiLocker | Expecting synchronous KYC verification | DigiLocker is async; design for webhook + polling fallback from day one |
| Google Maps | Loading Maps JS SDK on every page including SSG pages | Load Maps SDK only on pages that need it (booking form, worker location); use dynamic import |
| reCAPTCHA v3 | Using a single global score threshold (0.5) | Tune per-action (OTP request, booking submit) — OTP can be strict (0.7+), browsing can be lenient |
| SendGrid | Not verifying domain sender | Emails land in spam; verify domain DNS (SPF, DKIM, DMARC) before first send |
| Sentry | Logging raw Aadhaar/phone numbers in error context | Scrub PII in Sentry's `before_send` hook; never send raw KYC data to external error trackers |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unindexed worker geo query | Dispatch takes 3–8 seconds; DB CPU spikes on each booking | Add PostGIS `GIST` index on `last_location`; use `ST_DWithin` not bounding-box hacks | ~50 concurrent bookings |
| Celery all tasks in one queue | Slow PDF/report tasks block urgent 30-second dispatch timers | Separate queues: `dispatch` (high priority), `notifications`, `reports` (low priority) | ~20 concurrent bookings |
| Django admin list loading all booking records | Admin page hangs for 30+ seconds | Add `list_per_page = 25`, `list_select_related`, proper DB indexes on filter fields | ~10k bookings |
| ISR without on-demand revalidation | Category page shows stale service list minutes after admin edit | Implement `revalidatePath()` call from Django webhook on content change | From day one — visible immediately |
| WebSocket per-connection DB query | Admin monitor page opens 50 WebSocket connections; 50 queries/second baseline | Cache booking state in Redis; WS handler reads Redis, not DB | ~10 admin users |
| Flutter app rebuilds entire widget tree on location ping | App becomes sluggish on older Android phones common in Tier 2/3 cities | Use `ValueNotifier` or `Riverpod` for location state; don't rebuild the job-offer screen on ping | Low-end devices (2GB RAM) |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Aadhaar number in plaintext in `worker.aadhaar_number` column | PII/compliance breach; Indian IT Act liability | Encrypt at rest with AES-256 via pgcrypto; store only encrypted ciphertext; decrypt only in the KYC verification service |
| Admin panel accessible from public internet without IP allowlist | Credential stuffing attacks on admin; one compromised admin = all bookings/PII exposed | Nginx IP allowlist for `/admin/` in production; 2FA via TOTP mandatory |
| Customer phone numbers in API responses to workers | Privacy violation; worker can contact customers outside the platform | Never return customer phone in worker-facing APIs; return only name, service address (after accept), and in-app chat |
| Booking ID (`VSH-XXXXXX`) guessable/sequential | Attacker enumerates all booking IDs, scrapes customer data | Use UUIDs internally; `VSH-` reference is a separate human-readable ID generated from a random pool, not sequential |
| No rate limiting on OTP endpoint | Attacker floods OTP requests, runs up SMS costs, or brute-forces OTPs | Rate limit: max 3 OTP requests per phone per 10 minutes; max 5 OTP attempts before 30-minute lockout |
| Worker sees customer address in `SEARCHING` state | Enables cherry-picking; privacy policy violation | Address field null until `status=ASSIGNED`; DB-level: computed field or row-level security that returns null pre-assignment |
| reCAPTCHA v3 token not verified server-side | Bot can skip reCAPTCHA entirely by omitting the token | Server rejects any OTP/booking request with missing or low-score reCAPTCHA token |
| Django `SECRET_KEY` committed to git | Anyone with repo access can forge sessions | Use environment variables; rotate immediately if ever committed; scan with `git-secrets` or `trufflehog` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 30-second countdown with no visual urgency | Workers in Tier 2/3 cities on slow 4G don't notice the offer until it expires | Large countdown ring, vibration, sound alert; screen auto-wakes on offer push if Android allows |
| Booking form longer than 2 minutes | Drop-off; customers (like Priya in Warangal) open WhatsApp instead | Max 4 fields: service type (pre-selected from category), location (maps autocomplete), date/time, notes (optional). OTP gate comes after, not before |
| "No workers found" with just an error screen | Customer leaves and calls a competitor | Offer 3 options: retry now, schedule for later, get notified when a worker is available. Never a dead end |
| Worker app asks for all permissions upfront | Workers decline location/notification on first launch, then dispatch doesn't work | Request location only when they tap "Go Online"; request notifications only when they first receive a job offer |
| Booking status as a raw status string (`ON_THE_WAY`) | Confusing to non-English users in Telangana | Show human-readable labels ("Worker is on the way") + icon + ETA estimate; avoid raw status codes in customer UI |
| Earnings screen shows only total, no breakdown | Workers can't verify individual job payouts | Show per-booking earnings with date, service type, and amount; exportable for GST self-filing |

---

## "Looks Done But Isn't" Checklist

- [ ] **OTP auth:** Verify the OTP-verified phone token is bound to the session — not just that OTP was sent and a success response was returned
- [ ] **Dispatch engine:** Test the "no workers found" path — not just the happy path where a worker accepts immediately
- [ ] **30-second timer:** Verify the Celery timer fires even when the worker's app is closed (no WebSocket open)
- [ ] **Worker online toggle:** Verify going OFFLINE while holding an active job offer cancels the offer and triggers re-dispatch
- [ ] **Address privacy:** Confirm worker-facing booking detail API returns `null` for address when status is not `ASSIGNED`+
- [ ] **WhatsApp notifications:** Verify all 6+ status transitions fire the correct approved template — not just `ASSIGNED`
- [ ] **ISR pages:** Verify a new service category created in admin appears on the public site within the revalidation window — not just in the DB
- [ ] **Aadhaar encryption:** Confirm `SELECT aadhaar_number FROM workers` returns ciphertext, not plaintext
- [ ] **Admin real-time monitor:** Confirm the WebSocket updates booking status without a page refresh — not just on page load
- [ ] **FCM:** Verify push notifications arrive on a physical low-end Android device, not just the emulator
- [ ] **Rating/idle-time ranking:** Verify the dispatch query actually sorts by the combined score, not just proximity
- [ ] **SEO slugs:** Confirm `/services/[slug]` pages return 200 in SSG and include correct meta tags — not just that the route exists
- [ ] **Booking reference:** Confirm `VSH-` references are unique and human-readable in customer confirmation — not just UUID in the DB

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Dispatch race condition found in production | MEDIUM | Add `select_for_update()` to offer acceptance; run a migration to add unique constraint `(booking_id, status='ASSIGNED')`; manually close any duplicate assignments |
| DLT registration delayed past launch | HIGH | Enable WhatsApp OTP via WATI as fallback; contact MSG91 support for expedited review; delay launch by 2–4 weeks if OTP is blocked |
| Redis lost all pending Celery tasks | MEDIUM | Run a one-off management command: scan all `OFFER_SENT` bookings older than 60 seconds, fire expiry tasks for each; enable AOF persistence immediately |
| Stale slugs causing 404s after rename | LOW | Add a `ServiceCategoryRedirect` table; add a management command to create redirects for all renamed slugs from git history; deploy 301 middleware |
| JWT refresh token leaked | HIGH | Implement refresh token rotation (each use issues a new token, invalidates the old); force re-login for all sessions; rotate `SECRET_KEY` if session cookies are affected |
| Aadhaar numbers found in Sentry logs | CRITICAL | Scrub the Sentry event immediately; add PII scrubbing to `before_send`; audit all logging statements for PII; notify DPO per DPDP Act requirements |
| FCM tokens all stale after a major app update | LOW | Force-push a notification via FCM to all tokens; capture which ones fail as `NotRegistered`; purge them; require app update prompt to re-register |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Dispatch race condition | Phase 1 — dispatch engine | Load test: 50 concurrent accept requests for the same offer; confirm only one succeeds |
| Client-side OTP trust | Phase 1 — auth | Penetration test: POST booking with arbitrary phone number, no valid OTP token; should 401 |
| Celery task loss | Phase 1 — infrastructure | Kill Redis mid-test; confirm stuck bookings are recovered by the cleanup beat task |
| DLT registration delay | Phase 1 — Week 1 (parallel) | Receive a real SMS OTP on a production SIM before any other Phase 1 work is "done" |
| WhatsApp template approval | Phase 1 — Week 1 (parallel) | All 6+ templates show "Approved" status in WATI dashboard before notification code is written |
| Worker location staleness | Phase 1 — dispatch engine | Manually set `location_updated_at` to 2 hours ago; confirm worker is excluded from dispatch pool |
| Missing state machine enforcement | Phase 1 — booking API | Attempt invalid status transitions via API; all should return 400 with reason |
| JWT refresh token in localStorage | Phase 1 — auth | Browser DevTools: confirm no token in `localStorage` or `sessionStorage`; confirm HttpOnly cookie present |
| N+1 in dispatch | Phase 1 — dispatch engine | Enable Django Debug Toolbar in staging; confirm dispatch endpoint triggers ≤ 3 DB queries |
| FCM token staleness | Phase 1 — Captain app | Reinstall the Captain app; confirm backend receives new token within 60 seconds of launch |
| DigiLocker webhook miss | Phase 1 — worker onboarding | Disable webhook endpoint; complete DigiLocker flow; confirm Celery beat poll recovers the status within 10 minutes |
| SEO slug collision | Phase 1 — data model | Rename a category in admin; confirm old URL returns 301 to new URL |
| Phone normalization | Phase 1 — auth | Submit OTP with `9876543210`, then with `+919876543210`; confirm single user record, not two |
| Aadhaar in plaintext | Phase 1 — worker model | `SELECT aadhaar_number FROM workers LIMIT 1` in production; result must be ciphertext |

---

## Sources

- Indian telecom DLT regulations: TRAI guidelines 2018, MSG91 DLT onboarding docs
- Django race condition patterns: Django docs on `select_for_update()`, F-expressions
- FCM token lifecycle: Firebase documentation on token refresh and `NotRegistered` handling
- Celery reliability: Celery docs on task acknowledgement, Redis broker persistence
- WhatsApp Business API policy: Meta Business Messaging Policy, WATI documentation
- OTP security: OWASP Authentication Cheat Sheet, phone-based auth post-mortems
- Indian data protection: DPDP Act 2023 requirements for PII handling and Aadhaar
- Flutter background execution: Android Doze mode, background location restrictions

---
*Pitfalls research for: local-services marketplace (VSolve — auto-dispatch, OTP auth, Indian market)*
*Researched: 2026-06-22*
