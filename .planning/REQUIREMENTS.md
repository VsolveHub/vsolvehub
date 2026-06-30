# Requirements: VSolveHub

**Defined:** 2026-06-22
**Core Value:** A customer finds and books any verified local service 24×7; a worker gets auto-assigned a job — no middlemen, no manual ops in the critical path.

---

## v1 Requirements

### Authentication (AUTH)

- [ ] **AUTH-01**: Customer can verify their phone number via server-side OTP before a booking is created
- [ ] **AUTH-02**: OTP is generated server-side (MSG91 primary, Fast2SMS fallback), stored bcrypt-hashed in Redis with a 5-minute TTL, and never returned to the client
- [ ] **AUTH-03**: A booking is only created after `phone_verified = TRUE` is set by the server — the client cannot bypass this gate
- [ ] **AUTH-04**: Worker can register and authenticate using phone + OTP (same OTP mechanic as customer)
- [ ] **AUTH-05**: Authenticated sessions use JWT RS256 — 15-minute access token + 30-day refresh token
- [ ] **AUTH-06**: Admin panel requires 2FA + IP allowlist in production
- [ ] **AUTH-07**: reCAPTCHA v3 score is evaluated on the booking form submission before OTP is sent

### Service Discovery (DISC)

- [ ] **DISC-01**: Customer can browse all active service categories on the web and customer app (Home Services, Construction, Beauty & Wellness, Vehicle Services, Manpower/Event Labour)
- [ ] **DISC-02**: Each service category page uses an SEO-friendly slug URL (e.g., `/warangal/electrician`) — never a numeric ID
- [ ] **DISC-03**: Service category and detail pages are rendered via ISR/SSG and revalidate within 5 minutes of an admin catalog change
- [ ] **DISC-04**: Each service detail page includes: name, description, price range, service area, and a booking CTA
- [ ] **DISC-05**: Service detail pages include JSON-LD Schema.org structured data for SEO
- [ ] **DISC-06**: City landing pages (e.g., `/warangal/electrician`) exist for city × service combinations and are excluded from the sitemap when no active workers serve that combination
- [ ] **DISC-07**: Adding a new service category requires only a config/database change — zero code deployments

### Booking (BOOK)

- [ ] **BOOK-01**: Customer can complete a booking form in under 2 minutes (≤ 7 fields)
- [ ] **BOOK-02**: Booking form collects: service type, customer name, phone, address (with Google Places autocomplete), preferred date/time, and any notes
- [ ] **BOOK-03**: A booking is created only after server-verified OTP; the booking record stores `phone_verified = TRUE`
- [ ] **BOOK-04**: Every booking is assigned a human-readable `VSH-XXXX` reference number (sequential, zero-padded) shown immediately on confirmation
- [ ] **BOOK-05**: The booking reference is stored in `sessionStorage` and displayed on the confirmation screen
- [ ] **BOOK-06**: Booking archetype column (`archetype`) exists on the booking record from Day 1 and is set to `A` or `B` for Phase 1 bookings
- [ ] **BOOK-07**: Booking status timeline (with timestamps for each state transition) is visible to the customer at all times
- [ ] **BOOK-08**: Customer can cancel a booking; the cancellation is recorded in the `cancellations` table with the status-at-cancel and applicable penalty flag
- [ ] **BOOK-09**: Payment amounts (service fee) are recorded on the booking record from Day 1 even though no payment gateway is wired

### Booking Status Flow (FLOW)

- [ ] **FLOW-01**: Archetypes A & B implement the full status sequence: `PENDING_VERIFICATION → SEARCHING → ASSIGNED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED`
- [ ] **FLOW-02**: A booking moves from `PENDING_VERIFICATION` to `SEARCHING` only after `phone_verified = TRUE` — the dispatch engine never fires on an unverified booking
- [ ] **FLOW-03**: When no worker accepts within the configured wave limit, the booking moves to `NO_WORKER_FOUND`; the customer is shown options to retry, schedule, or request a notification when a worker becomes available
- [ ] **FLOW-04**: Booking status polling interval is ≤ 30 seconds on the customer-facing status page (Phase 1; WebSocket in Phase 2)
- [ ] **FLOW-05**: Every status transition is timestamped and appended to the status timeline — no status can be silently overwritten

### Auto-Dispatch Engine (DISP)

- [ ] **DISP-01**: When a booking enters `SEARCHING`, the dispatch engine builds an eligible-worker pool filtered by: `status = ACTIVE`, `is_online = TRUE`, skill match to the booked service, and service area overlap with the booking address
- [ ] **DISP-02**: Workers in the eligible pool are ranked by: proximity (closest first), then average rating (highest first), then idle time (longest idle first)
- [ ] **DISP-03**: The dispatch engine sends job offers in 30-second waves; the first worker to accept wins — no worker receives more than one simultaneous live offer
- [ ] **DISP-04**: The 30-second offer timer is enforced server-side via a Celery task scheduled at `expires_at`; the Flutter countdown shown to the worker is cosmetic only
- [ ] **DISP-05**: A partial unique index on `job_assignments` enforces the single-active-offer invariant — a worker cannot hold two live offers simultaneously at the DB level
- [ ] **DISP-06**: If the first wave has no acceptances, the engine advances to the next wave with the next-ranked workers; this continues until no eligible workers remain or the booking is accepted
- [ ] **DISP-07**: On acceptance, the booking transitions to `ASSIGNED`; all other pending offers for that booking are revoked server-side
- [ ] **DISP-08**: Every job offer, acceptance, decline, and expiry is written to the `job_assignments` ledger for audit
- [ ] **DISP-09**: Worker sees only the service area (not the full customer address) until after accepting the job

### Worker App & Onboarding (WORK)

- [ ] **WORK-01**: Worker can register with name, phone, skill(s), and service area via the Captain app
- [ ] **WORK-02**: Worker identity is verified via DigiLocker Aadhaar OAuth (primary); manual document upload is available as fallback
- [ ] **WORK-03**: Worker name and last-4 digits of Aadhaar are auto-populated from DigiLocker; the full Aadhaar number is never stored in plaintext
- [ ] **WORK-04**: Aadhaar and bank account numbers are encrypted at rest using AES-256 via pgcrypto
- [ ] **WORK-05**: A worker's `status` must be `ACTIVE` (admin-approved post-KYC) before they can receive job offers
- [ ] **WORK-06**: Worker can toggle ONLINE/OFFLINE status in the app; only ONLINE workers enter the dispatch pool
- [ ] **WORK-07**: Worker receives a 30-second job alert (FCM HIGH priority, wakes the screen) with service type, area, and price — full address is hidden
- [ ] **WORK-08**: Worker can accept or decline a job offer within 30 seconds; no response is treated as a decline by the server
- [ ] **WORK-09**: Worker can update job status through the sequence: `ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED`
- [ ] **WORK-10**: Worker earnings (amount, booking reference, date) are recorded on `COMPLETED` and visible in the earnings dashboard (Today / Week / Month / All-time views)

### Notifications (NOTF)

- [ ] **NOTF-01**: WhatsApp notification (via WATI pre-approved templates) is sent to the customer at every major booking state change: OTP sent, booking confirmed, worker assigned, worker on the way, worker arrived, job completed
- [ ] **NOTF-02**: WhatsApp click-to-chat link is included in every notification so the customer can reach support instantly
- [ ] **NOTF-03**: SMS OTP is sent via MSG91 with a DLT-registered sender ID and template; Fast2SMS is the fallback
- [ ] **NOTF-04**: Email confirmation (SendGrid) is sent to the customer on booking creation
- [ ] **NOTF-05**: FCM push notification (HIGH priority) is sent to the worker for each new job offer; standard priority FCM is used for other worker updates
- [ ] **NOTF-06**: All notification dispatches are handled asynchronously via Celery tasks — they never block the booking or dispatch flow

### Admin Dashboard (ADMN)

- [ ] **ADMN-01**: Admin can view all bookings in real time (status, reference, customer area, assigned worker) via a dispatch monitor
- [ ] **ADMN-02**: Admin can force-assign a worker to a booking as an exception (no-worker-found or dispute); this is the only manual dispatch path
- [ ] **ADMN-03**: Admin can view and manage the worker verification queue: approve or reject pending KYC submissions
- [ ] **ADMN-04**: Admin can create, edit, and deactivate service categories and sub-categories via a CRUD interface; changes trigger ISR revalidation within 5 minutes
- [ ] **ADMN-05**: Admin dashboard requires 2FA and is IP-allowlisted in production (D-01)
- [ ] **ADMN-06**: Admin can flag bookings with `viewed_at`, `is_spam`, and `closed_at` columns — there is no separate leads table

### Customer Trust & Privacy (TRST)

- [ ] **TRST-01**: Customer sees worker's name, skill, and average rating before and during a job — worker's phone number is never shown
- [ ] **TRST-02**: Worker sees only the booking area (not the full address) until after accepting the job
- [ ] **TRST-03**: Customer can view a rating and review prompt after a job transitions to `COMPLETED`
- [ ] **TRST-04**: Worker average rating is persisted and used as a ranking signal in the dispatch engine

### Error Handling & Resilience (ERR)

- [ ] **ERR-01**: If MSG91 OTP delivery fails, the system automatically retries via the Fast2SMS fallback within 10 seconds
- [ ] **ERR-02**: If the dispatch engine finds no eligible workers, the booking moves to `NO_WORKER_FOUND` and the customer is notified via WhatsApp and shown in-app options (retry / schedule / notify-me)
- [ ] **ERR-03**: If a Celery worker task fails (e.g., 30s timer expiry), the task is retried with exponential backoff; expired offers are cleaned up on the next booking-status read if the Celery task was permanently lost
- [ ] **ERR-04**: All unhandled exceptions in the Django backend are reported to Sentry with full stack traces and booking/worker context tags
- [ ] **ERR-05**: API errors return structured JSON with a machine-readable `code` field and a human-readable `message` field; 4xx errors never leak stack traces

### Logging & Observability (LOG)

- [ ] **LOG-01**: Every booking state transition is written to an append-only `booking_status_history` table with actor (customer / worker / system / admin) and timestamp
- [ ] **LOG-02**: Every job offer event (sent, accepted, declined, expired) is written to `job_assignments` with a timestamp
- [ ] **LOG-03**: Application-level structured logs (JSON) are emitted for: OTP requests, booking creation, dispatch wave events, worker status changes, and notification sends
- [ ] **LOG-04**: Sentry is wired to the Django backend and Flutter apps for crash and error reporting

### Security (SEC)

- [ ] **SEC-01**: OTP is generated server-side; the client never receives the raw OTP value in any API response
- [ ] **SEC-02**: JWT RS256 tokens are validated on every authenticated request; access tokens expire in 15 minutes; refresh tokens expire in 30 days
- [ ] **SEC-03**: Aadhaar numbers and bank account numbers are encrypted at rest with AES-256 via pgcrypto; application code never handles the plaintext value outside of the KYC write path
- [ ] **SEC-04**: All public booking forms include reCAPTCHA v3 evaluation; requests below the score threshold are rejected before OTP is sent
- [ ] **SEC-05**: Admin panel is restricted by 2FA and IP allowlist in production
- [ ] **SEC-06**: Customer phone number is masked in all worker-facing API responses before job acceptance
- [ ] **SEC-07**: SQL queries use parameterised statements (Django ORM enforces this); no raw string interpolation in queries

### Performance & SEO (PERF)

- [ ] **PERF-01**: Service category and detail pages load under 2 seconds on a 4G connection (measured by Lighthouse)
- [ ] **PERF-02**: All public service/category/city pages use ISR or SSG; auth-gated pages (booking, profile) use CSR
- [ ] **PERF-03**: ISR revalidation is triggered by admin catalog saves and completes within 5 minutes
- [ ] **PERF-04**: All public URLs use SEO-friendly slugs — numeric IDs must not appear in public-facing routes
- [ ] **PERF-05**: A `sitemap.xml` is generated and excludes city landing pages with no active workers

### Data Model Integrity (DATA)

- [ ] **DATA-01**: The `bookings` table schema includes `archetype`, `phone_verified`, `amount`, `admin_viewed_at`, `is_spam`, `closed_at` columns from Day 1 — no schema migration needed when Phase 2 archetypes are wired
- [ ] **DATA-02**: A partial unique index on `job_assignments` prevents a worker from holding more than one live (non-expired, non-declined) offer simultaneously
- [ ] **DATA-03**: The `cities` table exists and is linked to service areas; worker and service records reference `city_id`
- [ ] **DATA-04**: The `cancellations` table records booking reference, status-at-cancel, customer reason, and penalty flag for every cancellation

---

## v2 Requirements

Features deferred to Phase 2. Tracked but not in current roadmap.

### Rating & Review

- **RATE-01**: Customer can submit a 1–5 star rating and optional text review after job completion
- **RATE-02**: Worker average rating is recalculated and stored after each new rating
- **RATE-03**: Customer can view a worker's rating and recent review snippets on the worker profile card

### Customer Profile & History

- **PROF-01**: Authenticated customer can view their booking history with status and reference
- **PROF-02**: Customer can re-book a past service with one tap
- **PROF-03**: Customer can manage their saved addresses

### Advanced Search

- **SRCH-01**: Customer can search for a service by keyword across all categories
- **SRCH-02**: Search results are filtered by the customer's city

### Gallery

- **GALL-01**: Completed jobs can have before/after photos attached by the worker
- **GALL-02**: Photos appear on the relevant service category page as social proof

### FAQ

- **FAQ-01**: A searchable FAQ is available to customers covering common booking, payment, and cancellation questions

### Inbox-Pull Archetypes (C–F)

- **ARCH-01**: Archetype C (Staffing Placement) flow is wired — lead form → worker pool → placement
- **ARCH-02**: Archetypes D/E/F (Rental, Property, Event) flows are wired with their respective status vocabularies

### Partner Web Portal

- **PART-01**: Non-Captain provider types (Professional, Rental Vendor, Property Host, Event Vendor, Employer) can register and manage listings via `partner.vsolvehub.com`

### Wallet & Referral

- **WALL-01**: Customer wallet can hold credits earned via referrals
- **WALL-02**: Customer referral code generates wallet credit on first successful booking by the referred user

### Membership Plans

- **MEMB-01**: Customer can purchase an annual membership plan that reduces booking fees
- **MEMB-02**: Admin can configure membership plan tiers and benefits

---

## v3 Requirements

Features deferred to Phase 3. Not in scope until dispatch is validated at scale.

### Payment Gateway

- **PAY-01**: Customer can pay via UPI, card, or wallet at booking confirmation (Razorpay / PhonePe)
- **PAY-02**: Payment failures are handled with a retry UI; booking is held for 10 minutes pending payment
- **PAY-03**: Worker earnings are auto-disbursed on a T+2 cycle after job completion

### Multi-language (Telugu / Hindi)

- **I18N-01**: All UI strings are externalised to translation keys from Day 1 (already a Phase 1 design requirement)
- **I18N-02**: Telugu translation of all customer-facing copy is available and toggled by city/locale
- **I18N-03**: Hindi translation is available for non-Telugu markets

### Admin Analytics

- **ANLT-01**: Admin can view booking volume, completion rate, and average dispatch time on a dashboard
- **ANLT-02**: Admin can export booking data to CSV for a selected date range

### Real-time GPS Tracking

- **GPS-01**: Customer can view worker location on a map in real time after `ASSIGNED`
- **GPS-02**: Worker app sends background GPS pings at ≤ 15-second intervals when a job is active

---

## Out of Scope

Explicitly excluded from Phase 1. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Manual admin job assignment (normal flow) | Doesn't scale past ~50 bookings/day; creates a human bottleneck. Admin dispatches only on exception (D-20). |
| Payment gateway (Razorpay / PhonePe) | Adds 4–6 weeks of integration, refund flows, and RBI compliance before dispatch mechanic is validated. Amounts are recorded from Day 1. |
| Real-time GPS worker map (Phase 1) | Continuous background GPS drains battery, requires map billing, and adds infra complexity before PMF. Status timeline + WhatsApp covers the customer anxiety. |
| Worker phone number visible to customer | Enables off-platform work and exposes worker privacy. Masked proxy or in-app chat handles legitimate contact needs. |
| Multi-language UI (Telugu / Hindi) content | Doubles content-management overhead and adds i18n complexity before dispatch is proven. Strings are externalised from Day 1. |
| In-platform video calling | TURN/STUN infra cost, moderation risk, poor UX on 4G budget devices. WhatsApp handles this naturally. |
| Separate "leads" table | Creates dual-write bugs and state-machine divergence. Admin flags are columns on `bookings` (D-01). |
| Client-side 30-second offer timer (as authority) | Workers can manipulate client timers; clock skew causes disputes. Server Celery task is the arbiter; client countdown is cosmetic only. |
| Job Board (Archetype G) | Different mechanic (listing → apply → hire); no dispatch or booking. Phase 2. |
| Inbox-Pull Archetypes (C–F) | Different lead mechanic; schema designed forward-compatible but not wired. Phase 2. |
| B2B bulk contracts / franchise portal | Out of scope for the SMB/consumer Phase 1 focus. |
| Wallet, referral, membership plans | Meaningful only after repeat-booking rate > 30% and payment gateway is live. Phase 2. |
| Push notification campaigns | No broadcast tooling needed before product-market fit. Phase 2. |
| Live auto-booking (ride-hailing / auto-rickshaw) | Requires GPS metering and real-time pricing; different product. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| AUTH-07 | Phase 1 | Pending |
| DISC-01 | Phase 1 | Pending |
| DISC-02 | Phase 1 | Pending |
| DISC-03 | Phase 1 | Pending |
| DISC-04 | Phase 1 | Pending |
| DISC-05 | Phase 1 | Pending |
| DISC-06 | Phase 1 | Pending |
| DISC-07 | Phase 1 | Pending |
| BOOK-01 | Phase 1 | Pending |
| BOOK-02 | Phase 1 | Pending |
| BOOK-03 | Phase 1 | Pending |
| BOOK-04 | Phase 1 | Pending |
| BOOK-05 | Phase 1 | Pending |
| BOOK-06 | Phase 1 | Pending |
| BOOK-07 | Phase 1 | Pending |
| BOOK-08 | Phase 1 | Pending |
| BOOK-09 | Phase 1 | Pending |
| FLOW-01 | Phase 1 | Pending |
| FLOW-02 | Phase 1 | Pending |
| FLOW-03 | Phase 1 | Pending |
| FLOW-04 | Phase 1 | Pending |
| FLOW-05 | Phase 1 | Pending |
| DISP-01 | Phase 1 | Pending |
| DISP-02 | Phase 1 | Pending |
| DISP-03 | Phase 1 | Pending |
| DISP-04 | Phase 1 | Pending |
| DISP-05 | Phase 1 | Pending |
| DISP-06 | Phase 1 | Pending |
| DISP-07 | Phase 1 | Pending |
| DISP-08 | Phase 1 | Pending |
| DISP-09 | Phase 1 | Pending |
| WORK-01 | Phase 1 | Pending |
| WORK-02 | Phase 1 | Pending |
| WORK-03 | Phase 1 | Pending |
| WORK-04 | Phase 1 | Pending |
| WORK-05 | Phase 1 | Pending |
| WORK-06 | Phase 1 | Pending |
| WORK-07 | Phase 1 | Pending |
| WORK-08 | Phase 1 | Pending |
| WORK-09 | Phase 1 | Pending |
| WORK-10 | Phase 1 | Pending |
| NOTF-01 | Phase 1 | Pending |
| NOTF-02 | Phase 1 | Pending |
| NOTF-03 | Phase 1 | Pending |
| NOTF-04 | Phase 1 | Pending |
| NOTF-05 | Phase 1 | Pending |
| NOTF-06 | Phase 1 | Pending |
| ADMN-01 | Phase 1 | Pending |
| ADMN-02 | Phase 1 | Pending |
| ADMN-03 | Phase 1 | Pending |
| ADMN-04 | Phase 1 | Pending |
| ADMN-05 | Phase 1 | Pending |
| ADMN-06 | Phase 1 | Pending |
| TRST-01 | Phase 1 | Pending |
| TRST-02 | Phase 1 | Pending |
| TRST-03 | Phase 1 | Pending |
| TRST-04 | Phase 1 | Pending |
| ERR-01 | Phase 1 | Pending |
| ERR-02 | Phase 1 | Pending |
| ERR-03 | Phase 1 | Pending |
| ERR-04 | Phase 1 | Pending |
| ERR-05 | Phase 1 | Pending |
| LOG-01 | Phase 1 | Pending |
| LOG-02 | Phase 1 | Pending |
| LOG-03 | Phase 1 | Pending |
| LOG-04 | Phase 1 | Pending |
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 1 | Pending |
| SEC-05 | Phase 1 | Pending |
| SEC-06 | Phase 1 | Pending |
| SEC-07 | Phase 1 | Pending |
| PERF-01 | Phase 1 | Pending |
| PERF-02 | Phase 1 | Pending |
| PERF-03 | Phase 1 | Pending |
| PERF-04 | Phase 1 | Pending |
| PERF-05 | Phase 1 | Pending |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 87 total
- Mapped to phases: 87
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-22*
*Last updated: 2026-06-22 — initial definition from PROJECT.md, features research, and PRD conventions*
