# VSolveHub — Feature Specifications

> **Version:** 1.0 | **Last Updated:** June 2026  
> Features organized by priority. Each spec includes description, acceptance criteria, edge cases, and API touch-points.
>
> 🚦 **Phase 1 scope (v1.4 — `conventions.md` D-27):** direct booking of workers only —
> the **auto-dispatch engine** (D-20: `job_assignments`, server-authoritative 30s timer,
> ranked waves, `NO_WORKER_FOUND` handling) is the core Phase-1 feature and **replaces the
> admin lead-assignment in F-007** (now a read-only Dispatch Monitor + exception
> force-assign). Features for non-dispatch archetypes (staffing, rental, property, events),
> the Inbox-Pull mechanic, and the Partner Web Portal are **Phase 2**. Where a spec below
> says "admin assigns," read "the dispatch engine offers."

---

## Priority Legend
| Priority | Ship target | Meaning |
|----------|------------|---------|
| **P0** | Phase 1 launch | Blocking — platform cannot go live without this |
| **P1** | Phase 1 release | Important — ships with or shortly after launch |
| **P2** | Phase 2 | Enhancement — post-launch iteration |

---

## P0 — Core Features (Launch Blockers)

---

### F-001: Service Category Browsing
**Priority:** P0 | **Scope:** Web App + Customer App

**Description:**  
The central discovery surface of the platform. Customers browse 8 top-level categories (Construction, Technician, Manpower, Beautician, Events, Equipment Rental, Vehicle, Accommodation). Each category contains sub-categories and individual bookable services.

**Key Capabilities:**
- Category grid on home page: icon, name, tagline, service count
- Category listing page: sub-category filter pills + service cards
- Service card: name, sub-category, price range, description snippet, CTA
- Category pages statically generated (ISR, revalidate: 3600s) for SEO
- Horizontal scrollable chip filters for sub-categories

**Acceptance Criteria:**
- All 8 categories visible on home page
- Category page URL: `/services/[cat]` e.g. `/services/technician`
- Filter by sub-category: instant client-side filtering (no API call)
- Service count per category shown on category card
- Category page has `<h1>` with category name for SEO
- Structured data (Schema.org Service) injected via JSON-LD on service detail pages

**Edge Cases:**
- Category with all services deactivated: hidden from grid
- Category page accessed directly via URL with invalid `[cat]` slug: 404 page with suggestions
- Images fail to load: icon emoji fallback shown

**API Touch-points:**
```
GET /api/v1/services/categories/
GET /api/v1/services/categories/{slug}/
GET /api/v1/services/?category={slug}&sub_category={name}
```

---

### F-002: Service Detail & Booking Form
**Priority:** P0 | **Scope:** Web App + Customer App

**Description:**  
The conversion point of the platform. Each service has a detail page with full description and a booking/enquiry form. The form is the primary lead-capture mechanism.

**Key Capabilities:**
- Service detail: name, description, price range, sub-category badge, category breadcrumb
- Booking form: Name, Phone (10-digit), Service (pre-filled), Preferred Date (date picker), Time Slot (optional), Address (text + optional Google Places autocomplete), Notes
- Form validates client-side and server-side
- reCAPTCHA v3 attached to all public form submissions
- WhatsApp quick-contact always visible alongside the form

**Acceptance Criteria:**
- Service detail page URL: `/services/[cat]/[slug]` (legacy `/[id]` 301-redirects — see `conventions.md` D-09)
- Form submission: `POST /api/v1/bookings/` with validated payload
- Date picker: future dates only; max 90 days ahead (see `conventions.md` D-19)
- Phone validation: 10-digit Indian mobile (starts with 6, 7, 8, or 9)
- On valid submit: navigate to OTP screen (new user) or confirm screen (returning)
- Booking form accessible on mobile without horizontal scroll

**Edge Cases:**
- Form submitted while offline: show 'No internet connection. Please try again.'
- Service is equipment rental type: show additional fields (event type, duration, quantity)
- User navigates away mid-form: show 'Leave page? Your form data will be lost.' browser confirm

**API Touch-points:**
```
POST /api/v1/bookings/
POST /api/v1/auth/otp/send/
```

---

### F-003: OTP Phone Verification
**Priority:** P0 | **Scope:** Web App + Customer App + Worker App

**Description:**  
Phone-based OTP authentication is the only auth method. Used for new customer registration during booking, and for worker app registration. No password.

**Key Capabilities:**
- 6-digit OTP sent via SMS (MSG91 primary, Fast2SMS fallback)
- 10-minute OTP validity
- Max 3 verification attempts per OTP
- 60-second resend cooldown
- Auto-submit on 6th digit entry
- OTP hashed + stored server-side; compared on verification

**Acceptance Criteria:**
- OTP input: 6 individual digit boxes with auto-advance
- Countdown timer shown for resend: `Resend in 00:54`
- Error messages: 'Wrong OTP. 2 attempts remaining.' / 'OTP expired. Request a new one.'
- After 3 wrong attempts: OTP invalidated; request a new one (fresh send after 60s cooldown — see `conventions.md` D-03)
- Correct OTP: account created / confirmed; JWT issued; navigate to confirm
- OTP screen shows masked phone number: `+91 98765 X****`

**Edge Cases:**
- User enters OTP from earlier (before clicking resend): show 'OTP expired'
- Auto-read via Android SMS Retriever: auto-fill OTP boxes
- iOS: suggest OTP from SMS (standard iOS behavior via one-time-code input)
- Network error during verification: show retry; do not consume attempt

**API Touch-points:**
```
POST /api/v1/auth/otp/send/     { phone }
POST /api/v1/auth/otp/verify/   { phone, otp }
POST /api/v1/auth/token/refresh/
```

---

### F-004: Booking Confirmation
**Priority:** P0 | **Scope:** Web App + Customer App

**Description:**  
After successful OTP verification, the customer lands on a booking confirmation screen. A unique booking reference is generated, and the customer receives a WhatsApp message confirming their booking.

**Key Capabilities:**
- Booking reference generation: `VSH-` + zero-padded sequential number (e.g. VSH-0042)
- Confirm screen: booking ref (large, copyable), service name, date, status (Pending)
- WhatsApp message sent to customer within 60 seconds
- Admin email alert sent for new booking
- 'Track Booking' and 'Book another service' CTAs

**Acceptance Criteria:**
- Booking ref unique and human-readable (not UUID)
- Booking ref stored in sessionStorage + returned in API response
- WhatsApp template 'booking_confirmed' dispatched within 60 seconds
- Confirm screen accessible via `/booking/confirm?ref=VSH-0042`
- Confirm screen shows booking summary (service, date, area)

**Edge Cases:**
- WhatsApp delivery fails: still confirm booking; fallback SMS sent
- Customer opens confirm URL on different device: shows booking details if ref is valid
- Accidental double-submit (browser back + resubmit): idempotency key in API prevents duplicate booking

**API Touch-points:**
```
POST /api/v1/bookings/          (creates booking, returns ref)
GET  /api/v1/bookings/{ref}/    (fetch booking details for confirm screen)
```

---

### F-005: Booking Status Tracking
**Priority:** P0 | **Scope:** Web App + Customer App

**Description:**  
After booking, customers can track the status of their booking through a visual timeline. Status updates are triggered by worker app actions and admin updates, with WhatsApp notifications at each milestone.

**Key Capabilities:**
- Status timeline: Pending → Confirmed → Assigned → On the Way → Arrived → In Progress → Completed
- Current status highlighted; past statuses timestamped
- Worker info shown after assignment (name, skill; NOT full contact details pre-job)
- Polling every 30 seconds for status updates (WebSocket in Phase 2)
- WhatsApp notifications at each major status change

**Acceptance Criteria:**
- Track URL: `/booking/track?ref=VSH-0042`
- Status shows timestamp: 'In Progress since 2:35 PM'
- Cancelled booking shows: reason + timestamp
- If booking > 2 hours in same status: 'Need help?' WhatsApp contact shown
- Rating prompt appears inline when status = COMPLETED

**Edge Cases:**
- Status moves backwards (system error): show last-valid status; don't confuse customer
- Customer shares tracking URL: URL is public (no auth required) for this booking ref
- Booking from > 30 days ago: show 'Completed' with full timeline archived

**API Touch-points:**
```
GET /api/v1/bookings/{ref}/
GET /api/v1/bookings/{ref}/status-log/
```

---

### F-006: WhatsApp Integration (Click-to-Chat + Notifications)
**Priority:** P0 | **Scope:** All

**Description:**  
WhatsApp is the primary communication channel. Two modes: (1) Click-to-chat FAB on every page for instant customer-to-admin messaging, and (2) automated template messages sent by the platform at booking milestones.

**Key Capabilities:**
- Floating WhatsApp button (FAB): fixed bottom-right on all pages, 56×56px
- Click-to-chat URL with pre-filled context message
- Automated templates: booking_confirmed, worker_assigned, worker_on_the_way, job_completed, worker_approved, worker_rejected
- Template messages via WATI API (pre-approved WhatsApp Business templates)
- Delivery receipt webhook stored in notification_logs

**Acceptance Criteria:**
- FAB visible on every page including booking and profile pages
- On mobile: opens WhatsApp app; on desktop: opens WhatsApp Web
- Automated messages delivered within 60 seconds of trigger event
- All template variables correctly substituted (customer name, booking ref, service name)
- Failed delivery logged in notification_logs with error reason

**Edge Cases:**
- Customer number not on WhatsApp: template message fails; fallback SMS triggered
- WATI API rate limit hit: queue messages with exponential backoff retry
- Customer blocks the business WhatsApp: delivery receipt 'blocked'; no retry

**API Touch-points:**
```
POST /api/v1/notifications/whatsapp/ (internal trigger)
POST {WATI_URL}/api/v1/sendTemplateMessage (external)
```

---

### F-007: Admin Lead Dashboard
**Priority:** P0 | **Scope:** Admin Panel

**Description:**  
Central operations hub for the VSolveHub team. All customer bookings and enquiries appear here as leads. Admin manages the full lifecycle from new lead to completed job.

**Key Capabilities:**
- Summary stats: Today's leads, Pending, Active jobs, Completed today
- Leads table: sortable, filterable by status/category/date/area
- Lead detail panel: full customer info, service, notes, booking timeline
- One-click worker assignment with real-time availability filter
- Status update buttons (admin can manually update status)
- Export to CSV

**Acceptance Criteria:**
- Dashboard loads in < 2 seconds
- New leads appear within 60 seconds of booking submission
- Filter combinations work correctly and persist in URL
- Worker assignment sends FCM push within 5 seconds
- Admin can see lead history for the past 90 days

**Edge Cases:**
- Admin panel accessed from mobile: basic responsive layout; full features on desktop
- 500+ leads in database: pagination ensures performance is not affected
- Two admins assign the same worker to different leads simultaneously: conflict detection

**API Touch-points:**
```
GET  /api/v1/admin/leads/
GET  /api/v1/admin/leads/{id}/
POST /api/v1/admin/leads/{id}/assign/  { worker_id }
PATCH /api/v1/admin/leads/{id}/status/ { status }
```

---

### F-008: Worker Verification Gate (Rapido-Style)
**Priority:** P0 | **Scope:** Worker App + Admin Panel

**Description:**  
No unverified worker can receive jobs. Worker goes through a multi-stage registration and identity verification flow, gated by an admin approval step before they can go ONLINE. Aadhaar identity is verified via DigiLocker (India's official government document platform) rather than manual document photo uploads. This removes document quality issues from the admin review queue and speeds up worker activation.

**Key Capabilities:**
- Multi-step onboarding wizard (7 stages: Register → Profile → Skills → Documents → Submit → Admin Review → Activation)
- **Aadhaar identity verification via DigiLocker OAuth** (primary path): worker authorises DigiLocker to share their e-Aadhaar with VSolveHub; no document images uploaded or reviewed
- Manual Aadhaar upload (fallback path): front + back photo upload, used only when DigiLocker is unavailable or skipped
- Additional documents: selfie (live in-app camera), optional skill certificate, bank details or UPI — these remain manual uploads
- Non-Aadhaar documents stored in private S3 bucket; pre-signed URLs for admin review
- Admin verification queue: DigiLocker-verified workers show a government-verified badge; manual upload workers show document images for visual review
- Approve → push + WhatsApp to worker; app unlocked
- Reject → reason set; push + WhatsApp to worker; resubmission allowed (up to 3 times)
- Worker status state machine: UNVERIFIED → PENDING_VERIFICATION → ACTIVE | REJECTED → SUSPENDED

**Acceptance Criteria:**
- Worker cannot go ONLINE or see job features until status = ACTIVE
- DigiLocker path: worker name and Aadhaar last-4 auto-populated from verified e-Aadhaar XML; worker cannot edit these fields
- DigiLocker path: full Aadhaar number is never stored; only last-4 digits and verification status retained
- Fallback manual path: MIME type validation + max 5MB per file; admin must visually review document images
- Workers who complete DigiLocker verification are clearly labeled `Verified via DigiLocker` in the admin queue
- Workers who used manual fallback are labeled `Manual Upload — Review Required` in the admin queue
- Selfie / liveness capture remains required for all workers regardless of verification path
- Workers under 18 (detected from DigiLocker Aadhaar DOB) are blocked from onboarding with a clear message
- Admin sees resubmissions labeled 'Attempt 2', 'Attempt 3'
- 3rd rejection: 'Contact support to proceed' shown to worker
- Onboarding progress auto-saved; worker can resume on next app open

**Edge Cases:**
- Worker denies DigiLocker consent: app returns to document step with option to upload manually
- DigiLocker API unreachable: silent fallback to manual upload; no error shown to worker unless they explicitly tried to use DigiLocker
- Worker's Aadhaar-linked mobile number differs from their VSolveHub registered number: DigiLocker still works (uses UIDAI's own OTP, not VSolveHub's)
- Worker's phone number changed after registration: requires admin support intervention
- App crash during upload: partial upload cleaned up; worker can re-upload

**API Touch-points:**
```
POST /api/v1/workers/register/
POST /api/v1/workers/profile/
GET  /api/v1/workers/digilocker/auth-url/       (initiate DigiLocker OAuth)
GET  /api/v1/workers/digilocker/callback/       (handle DigiLocker OAuth callback)
GET  /api/v1/workers/digilocker/status/         (check DigiLocker verification status)
POST /api/v1/workers/documents/                 (multipart — selfie, skill cert only)
POST /api/v1/workers/documents/aadhaar/         (multipart — manual fallback only)
POST /api/v1/workers/submit-verification/
GET  /api/v1/admin/workers/pending/
POST /api/v1/admin/workers/{id}/approve/
POST /api/v1/admin/workers/{id}/reject/  { reason }
```

---

### F-009: Worker Job Notification & 30-Second Accept Timer
**Priority:** P0 | **Scope:** Worker App + Admin Panel

**Description:**  
When admin assigns a job, the worker receives a high-priority push notification (FCM). In-app, a job card appears with a 30-second countdown timer. Worker must accept or decline before the timer expires.

**Key Capabilities:**
- FCM HIGH priority push (bypasses doze mode on Android, wakes screen)
- In-app: full-screen job alert card with animated countdown ring
- Job card: service type, location area (not full address), estimated earnings, distance
- Accept / Decline buttons with timer display
- Decline: reason selection (busy / too far / can't do service / other)
- Timer expires: auto-decline; job returned to admin queue
- Customer notified via WhatsApp on acceptance

**Acceptance Criteria:**
- Push notification arrives within 5 seconds of admin assignment
- Timer starts counting when job card appears (not when notification received)
- Acceptance recorded with precise timestamp
- Full customer address shown ONLY after acceptance
- Auto-decline on timer expiry is logged in booking_status_logs
- Admin notified of decline/expiry immediately

**Edge Cases:**
- Worker offline when notification sent: notification queued; delivered when worker comes online (FCM handles)
- Multiple job notifications in quick succession: queue them; show one at a time
- Worker app crashes during 30-second window: treat as auto-decline; job back to admin

**API Touch-points:**
```
POST /api/v1/admin/bookings/{id}/assign/ { worker_id }   → triggers FCM
POST /api/v1/jobs/{id}/accept/
POST /api/v1/jobs/{id}/decline/  { reason }
```

---

### F-010: Worker Job Status Updates
**Priority:** P0 | **Scope:** Worker App

**Description:**  
After accepting a job, the worker progresses through defined status steps. Each update triggers a customer WhatsApp notification. The status flow is: Accepted → On the Way → Arrived → In Progress → Completed.

**Key Capabilities:**
- Active job screen: customer area, service type, scheduled time, step-by-step status buttons
- Each status change: confirmation dialog ('Confirm: Mark as On the Way?')
- WhatsApp message sent to customer at each milestone
- Job timer starts when 'In Progress' is tapped
- 'Mark Complete': triggers rating prompt for customer
- Issues/disputes: 'Raise an issue' button visible during In Progress

**Acceptance Criteria:**
- Status buttons shown in correct order; cannot skip steps
- Each status logged in booking_status_logs with timestamp and actor
- WhatsApp delivery initiated within 10 seconds of status update
- Completed status: customer-facing rating prompt appears within 5 minutes
- If worker marks complete but job is still running: admin can override status

**Edge Cases:**
- Worker offline during job: status updates queued locally; synced when connectivity restored
- Worker marks 'In Progress' accidentally: cannot undo; admin can manually correct
- Customer and worker disagree on completion: dispute flow initiated

**API Touch-points:**
```
PATCH /api/v1/jobs/{id}/status/ { status: ON_THE_WAY | ARRIVED | IN_PROGRESS | COMPLETED }
POST  /api/v1/jobs/{id}/dispute/
```

---

### F-011: Email + WhatsApp Notification System
**Priority:** P0 | **Scope:** Backend + All

**Description:**  
Automated notification system that triggers WhatsApp messages, SMS, and emails at key platform events. Ensures all stakeholders are always informed without manual admin intervention.

**Key Capabilities:**
- WhatsApp templates (WATI): booking_confirmed, worker_assigned, on_the_way, job_completed, worker_approved, worker_rejected, new_lead_alert
- Email (SendGrid): Booking confirmation HTML email to customer; new lead alert to admin
- SMS OTP: delivery via MSG91
- Notification log: every notification stored in notification_logs with delivery status
- Retry logic: failed notifications retried 3 times with exponential backoff

**Acceptance Criteria:**
- All WhatsApp templates pre-approved in WhatsApp Business Manager
- Template variables validated before dispatch (no empty substitutions)
- Email templates are HTML + plain text (fallback for email clients)
- Failed notifications alerted to admin after 3 retries
- Notification log queryable in admin panel

**Edge Cases:**
- WhatsApp API rate limit: queue messages; process with delay
- Invalid phone number (WhatsApp not registered): log as FAILED; try SMS as fallback
- Email bounced: log bounce; mark email as invalid in user record

---

## P1 — Important Features

---

### F-012: Advanced Search & Filtering
**Priority:** P1 | **Scope:** Web App + Customer App

**Description:** Full-text search across services (name, description, tags) with real-time results. Supports Telugu/Hindi characters in future. Implemented with PostgreSQL `pg_trgm` for fuzzy matching.

**Key Capabilities:**
- Search bar: debounced (300ms), min 2 characters to trigger
- Results: service name, category breadcrumb, price range
- Filter on results page: category, price range, rating (future)
- Empty results: show popular services as suggestions
- Search analytics tracked in GA4

**API Touch-points:**
```
GET /api/v1/services/search/?q={query}&category={slug}
```

---

### F-013: Customer Profile & History
**Priority:** P1 | **Scope:** Web App + Customer App

**Description:** Customer profile with editable details, booking history (active + past), saved services, addresses, and payment methods. Auth-gated (requires phone verification).

**Key Capabilities:**
- Profile: name, email (optional), phone (read-only), profile photo
- Booking history: all bookings with status, service name, date, booking ref
- Address book: add/edit/set default/delete addresses
- Saved services: wishlist of saved service cards
- Settings: notification preferences (push, email, SMS)

**API Touch-points:**
```
GET  /api/v1/profile/
PATCH /api/v1/profile/
GET  /api/v1/profile/bookings/
GET  /api/v1/profile/saved/
POST /api/v1/profile/addresses/
```

---

### F-014: Rating & Review System
**Priority:** P1 | **Scope:** Web App + Customer App + Worker App

**Description:** After job completion, customers rate the worker (1–5 stars) and leave an optional comment. Ratings aggregate to worker's average rating visible on their profile.

**Key Capabilities:**
- Rating prompt: appears post-completion in booking track screen
- 1–5 star input (required) + text comment (optional, max 300 chars)
- One rating per booking (immutable after submission)
- Worker avg rating recalculated on every new rating
- Ratings visible to admin; used for worker quality monitoring

**API Touch-points:**
```
POST /api/v1/bookings/{id}/rating/ { score, comment }
GET  /api/v1/workers/{id}/ratings/
```

---

### F-015: Worker Earnings Dashboard
**Priority:** P1 | **Scope:** Worker App

**Description:** Workers see their earnings breakdown: today, this week, this month, all-time. Includes completed job history with per-job earnings.

**Key Capabilities:**
- Summary cards: Today ₹XXX, This Week ₹XXXX, This Month ₹XXXXX
- Completed jobs list: service name, customer area, date, earnings amount, payment status
- Average rating displayed prominently
- Total jobs completed counter

**API Touch-points:**
```
GET /api/v1/workers/me/earnings/
GET /api/v1/workers/me/jobs/?status=COMPLETED
```

---

### F-016: Admin Service Catalog Management
**Priority:** P1 | **Scope:** Admin Panel

**Description:** Admin can add, edit, reorder, and deactivate services, sub-categories, and categories without developer involvement. Changes take effect within 5 minutes via ISR revalidation.

**Key Capabilities:**
- CRUD: Categories, Sub-categories, Services
- Service fields: name, description, category, sub-category, price_min, price_max, unit, icon, tags, display_order, is_active
- Bulk deactivate services
- Drag-and-drop display order
- ISR revalidation triggered on save: `next.revalidate('/services/[cat]')`

**API Touch-points:**
```
GET/POST /api/v1/admin/categories/
GET/PUT/DELETE /api/v1/admin/categories/{id}/
GET/POST /api/v1/admin/services/
GET/PUT/DELETE /api/v1/admin/services/{id}/
POST /api/v1/admin/revalidate/ { path }
```

---

### F-017: Firebase Push Notifications (FCM)
**Priority:** P1 | **Scope:** Customer App + Worker App

**Description:** Push notifications keep users informed in real-time. Customer notifications for booking status; Worker notifications for new jobs (HIGH priority) and status updates.

**Key Capabilities:**
- FCM token stored per device per user in DB
- Customer notifications: booking confirmed, worker assigned, on-the-way, job completed
- Worker notifications: new job alert (HIGH priority, wakes screen), acceptance confirmation, daily earnings summary (optional)
- Token refresh handled: FCM sends new token; app updates on backend
- Invalid token cleanup: remove on FCM error INVALID_REGISTRATION

**API Touch-points:**
```
POST /api/v1/devices/fcm/register/ { fcm_token, device_type }
```

---

### F-018: Gallery with Category Filter
**Priority:** P1 | **Scope:** Web App

**Description:** Visual portfolio of completed work and events. Masonry grid with category filters and lightbox for full-screen viewing.

**Key Capabilities:**
- Masonry grid layout
- Category filter pills: All, Construction, Events, Beautician, etc.
- Lightbox: full-screen image with left/right swipe navigation
- Lazy loading with skeleton placeholders
- Gallery images managed in admin CMS

---

### F-019: FAQ with Search
**Priority:** P1 | **Scope:** Web App

**Description:** Searchable accordion FAQ organized by topic. Reduces support volume by helping customers self-serve.

**Key Capabilities:**
- Search input filters questions in real-time
- Topics: Booking, Payment, Worker, Cancellation, Technical, General
- Accordion expand/collapse with smooth animation
- 'Didn't find your answer? WhatsApp us' CTA at bottom
- Schema.org FAQPage JSON-LD for SEO rich results

---

### F-020: Google Maps Location
**Priority:** P1 | **Scope:** Web App

**Description:** Google Maps embed on Contact page showing office location. Google Places Autocomplete in booking form address field.

**Key Capabilities:**
- Maps Embed API on `/contact` page
- Places Autocomplete on booking form address field (filters to India)
- Geocoding to store lat/lng with address for worker proximity matching

---

## P2 — Enhancement Features

---

### F-021: Wallet & Referral System
**Priority:** P2 | **Scope:** Web App + Customer App

**Description:** Customer wallet for storing referral credits. Referral code per user; ₹100 credit to both referrer and referee on first completed booking. Wallet usable at checkout (requires payment gateway, Phase 3).

---

### F-022: Membership / Subscription Plans
**Priority:** P2 | **Scope:** Web App + Customer App

**Description:** 'VSolveHub Plus' annual membership with benefits: priority booking, discounted service rates, dedicated support. ₹799/year initial price point.

---

### F-023: Admin Analytics Dashboard
**Priority:** P2 | **Scope:** Admin Panel

**Description:** Charts and KPI cards for platform health: bookings over time, category distribution, worker performance ranking, lead conversion funnel, revenue trends.

---

### F-024: Multi-language Support (Telugu / Hindi)
**Priority:** P2 | **Scope:** Web App + Apps

**Description:** UI translated to Telugu and Hindi. Language selector in header. Service descriptions in all three languages (content provided by client). Implemented via `next-intl` or `i18next`.

---

### F-025: Re-booking from History
**Priority:** P2 | **Scope:** Web App + Customer App

**Description:** Customers can re-book a past service with one tap from booking history. Form pre-filled with same service, area, and preferences. New booking ref generated.

---

## Feature Summary Table

| ID | Feature | Priority | Scope | Phase |
|----|---------|----------|-------|-------|
| F-001 | Service Category Browsing | P0 | Web + App | 1 |
| F-002 | Service Detail & Booking Form | P0 | Web + App | 1 |
| F-003 | OTP Phone Verification | P0 | All | 1 |
| F-004 | Booking Confirmation | P0 | Web + App | 1 |
| F-005 | Booking Status Tracking | P0 | Web + App | 1 |
| F-006 | WhatsApp Integration | P0 | All | 1 |
| F-007 | Admin Lead Dashboard | P0 | Admin | 1 |
| F-008 | Worker Verification Gate (DigiLocker) | P0 | Worker App + Admin | 1 |
| F-009 | Job Notification & 30s Timer | P0 | Worker App | 1 |
| F-010 | Worker Job Status Updates | P0 | Worker App | 1 |
| F-011 | Notification System | P0 | Backend | 1 |
| F-012 | Advanced Search | P1 | Web + App | 1 |
| F-013 | Customer Profile & History | P1 | Web + App | 1 |
| F-014 | Rating & Review | P1 | Web + App | 1 |
| F-015 | Worker Earnings Dashboard | P1 | Worker App | 1 |
| F-016 | Admin Service Catalog CRUD | P1 | Admin | 1 |
| F-017 | FCM Push Notifications | P1 | Apps | 1 |
| F-018 | Gallery | P1 | Web | 1 |
| F-019 | FAQ with Search | P1 | Web | 1 |
| F-020 | Google Maps | P1 | Web | 1 |
| F-021 | Wallet & Referral | P2 | Web + App | 2 |
| F-022 | Membership Plans | P2 | Web + App | 2 |
| F-023 | Admin Analytics | P2 | Admin | 2 |
| F-024 | Multi-language | P2 | All | 2 |
| F-025 | Re-booking | P2 | Web + App | 2 |
