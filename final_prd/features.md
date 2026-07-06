# V SOLVE HUB — COMPLETE FEATURE LIST

> **Purpose:** A single, complete reference of everything to be built across the platform — web, mobile apps, admin, backend, payments, and AI. Grouped by module so scope is unambiguous. This is the *what-to-build* companion to the milestone/phase plan.

---

## 0. PLATFORM AT A GLANCE


| Surface          | What it is                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Customer Web** | Public marketplace — browse, book, track, pay. **Includes the Rapido real-time ride/vehicle experience as a module (not a separate site).** |
| **Partner Web**  | Vendor/worker onboarding, jobs, earnings. **Dashboard & menu are customized per provider type** (see §7.1).                                 |
| **Admin Panel**  | Operations hub — leads, catalog, users, payments, reports, CMS                                                                              |
| **Customer App** | Android + iOS native app for customers — **the Rapido ride/vehicle experience lives inside this app; there is NO separate Rapido app.**     |
| **Partner App**  | Android + iOS native app for workers/vendors — **role-customized dashboard & menu**; drivers are one of the provider types inside it.       |
| **AI Chatbot**   | Assistant + AI search across the platform                                                                                                   |
| **Backend**      | Production backend, database, REST APIs (single source of truth)                                                                            |


>     ****

**Scale of the catalog:** **11 top-level categories · ~80 sub-categories · ~850 services** (all browsable & searchable). See `[services.md](services.md)` for the exact catalog and each service's **booking model (M1–M8)**; `[PRD.md](PRD.md)` is canonical for the models. (The archetype letters used below map onto those models — A→M1, B→M2, C→M7, D→M4, E→M5, F→M3, G→M8.)

---

## 1. SERVICE CATALOG & DISCOVERY

**Categories (all 11 must be built, browsable, searchable):**

1. 🔧 **Technician Services** — Electrician, Plumbing, Carpenter, AC, RO, CCTV, Locksmith, etc. *(M1 + M3 for big installs)*
2. 💄 **Beautician Services** — Facial, Waxing, Hair, Makeup, Mehendi, Bridal, etc. *(M1 + M3 for Bridal)*
3. 🏠 **Home Services** — Cleaning, Pest, Laundry, Shifting, Borewell, Elder Care, AMC, etc. *(M1 + M3 + M7)*
4. 🐾 **Pet Services** — Grooming, Vet, Boarding, Walking, Training, Adoption, Shop *(M1 + listing)*
5. 🧱 **Construction Labour** — Helper, Mason, Steel, Concrete, Tiling, Painting + design pros *(M2 + M3)*
6. 🧹 **Manpower & Support Staff** — Cleaning, Domestic, Drivers, Security, etc. *(M7 + M2 daily)*
7. 📸 **Events & Media** — Photography, Videography, Decoration, Catering, DJ, etc. *(M3; Photography is dual-mode: M1 instant sessions + M3 event quotes)*
8. 🪑 **Rental Services** — Furniture, Tent, Lighting, Sound, Tools, Appliances, etc. *(M4)*
9. 🏨 **Rooms / PG / Hostel / Hotels** — PG, Hostel, Co-Living, Short Stay, etc. *(M5)*
10. 💼 **Career / Job Opportunities** — post/apply board *(M6)*
11. 🛺 **Vehicle Services (Rapido)** — Ride, Taxi, Goods, Delivery, Wash, Repair, Roadside, Rental, EV *(M8; inside the Customer app — §8)*

> Exact sub-category and service counts live in `[services.md](services.md)` (from the client catalog CSV). Every service there carries its booking model.

**Discovery features required:**

- Category grid on home (icon, name, tagline, service count)
- Category page: sub-category filter pills + service cards
- Service detail page (SEO-friendly URLs `/services/[cat]/[slug]`, Schema.org JSON-LD)
- **Advanced search** — full-text + fuzzy/typo-tolerant (tags per service), debounced, min 2 chars
- Quick chips + popular searches on home & search
- Serviced-city / "near me" area filtering
- Gallery (masonry grid + lightbox, category filters)
- FAQ (searchable accordion)
- Google Maps embed (contact page) + Places autocomplete (address fields)

---

## 2. BOOKING ENGINES (per service type)

Every service belongs to a **booking archetype**. Each archetype is a distinct flow that must be fully built.

### Archetype A — On-Demand Dispatch (fixed price)

*Technician, Beautician, Cleaning, Vehicle service/wash/repair/roadside/delivery.*

- Fast booking form → **auto-dispatch engine** matches nearest online worker
- **Server-authoritative 30-second accept timer**, ranked worker waves
- `NO_WORKER_FOUND` handling / retry / fallback to admin
- Live status timeline: Pending → Confirmed → Assigned → On the Way → Arrived → In Progress → Completed
- Worker info revealed post-assignment; full address only after acceptance
- Rating prompt on completion

### Archetype B — Crew / Lead-Settlement Dispatch

*Construction Labour.*

- Book a crew (multiple workers) via a crew lead
- Lead-settlement / attendance-based model
- Same live tracking backbone as A, extended for teams

### Archetype C — Staffing / Placement Enquiry

*Domestic staff, drivers, security, catering staff, office/industrial support.*

- Enquiry → admin/vendor review → shortlist → placement
- Temp vs permanent staffing flows

### Archetype D — Rental (inventory + availability)

*Equipment Rental, Vehicle Rental/EV.*

- Browse items with per-day price + **deposit**
- **Availability calendar**, date-range selection, quantity
- Rental enquiry → quote → confirmation

### Archetype E — Property / Accommodation

*Rooms / PG / Hostel / Hotels.*

- Listing browse by sharing/gender/budget
- **Enquiry inbox** backbone; instant-book flag for hotels
- Viewing/booking enquiry flow

### Archetype F — Quote / Estimation (project work)

*Events & Media, and complex jobs.*

- Enquiry → **Smart Inspection Booking** → **Digital Estimation Engine** → **Vendor Quote System**
- **Additional Work Approval** flow, **Customer Feedback**, **Warranty System**
- Milestone-based payment for large projects

### Archetype G — Real-time Vehicle (Rapido) → *booking model M8*

*See Section 8. A real-time engine (live GPS + fare) that lives **inside the Customer app/web** (rider side) and the **Partner app** (driver side) — **not a separate app.***

**Cross-cutting booking features:**

- Unique human-readable booking reference (`VSH-0042`)
- Idempotent booking creation (no double-submit duplicates)
- Booking confirmation screen + notifications
- Booking status tracking (public track URL by ref)
- Re-booking from history (one tap)
- Cancellation with reason + timestamp

---

## 2B. PER-SERVICE FLOWS — CUSTOMER SIDE & PARTNER SIDE

> For every category: **what the customer does** and **what the partner's dashboard lets them do**. These are the intended flows in general — refine against the screenshots in `[flows/](../flows/)` and `[PRD.md](PRD.md)` as you build. The provider dashboard for each type is role-customized (see §7.1).

---

### 🔧 1. Technician Services — *M1 Instant*

**Customer:** browse Technician → sub-category (e.g. Electrician) → pick one or more services (e.g. *Fan Installation ₹199–349*) → choose **ASAP or a time slot** → confirm address → **OTP verify** → booking created (visit charge ₹99 shown) → **system auto-assigns the nearest online technician** (30s waves) → see name/photo/rating → **live-track** (On the way → Arrived → In progress) → technician may add extra line items → **customer approves any extra** → done → **pay** (visit + job + approved extras) → rate.

**Partner (Technician face):** onboard + **DigiLocker KYC** → pick trades/skills + **service area** → go **Online** → get a **30s job alert** (service + area, not full address) → **Accept** → full address + customer contact revealed → navigate → update status → **add extra work for approval** → **Complete** → earnings recorded → payout. Dashboard: online toggle, today/week/all-time earnings, job history, ratings, availability.

---

### 💄 2. Beautician Services — *M1 Instant*

**Customer:** browse Beautician → sub-category (Facial, Waxing, Hair…) → pick services → **date/time slot** → address → optional **beautician-gender preference** → OTP → booking → auto-assigned beautician → live-track → service at home → pay → rate.

**Partner (Beauty pro):** onboard + KYC → set **services offered + prices** (within the catalog band) → upload **portfolio photos** → set **availability/working hours + area** → go Online → accept 30s alerts → service checklist → complete → earnings. Dashboard: services & prices editor, portfolio, availability, earnings, ratings.

---

### 🏠 3. Home Services — *M1 + M3 + M7*

**Customer:**

- *Cleaning / Pest / Laundry / Gardening (M1):* pick service → slot → address → OTP → auto-assigned pro → track → pay → rate.
- *Shifting / AMC / Borewell / Septic / Inspection (M3):* describe job + photos → **pay small consult/survey fee** → pro surveys → **quote** → accept → advance → work → balance.
- *Maid / Elder-care long-term (M7):* request → shortlist candidates → interview/trial → engage.

**Partner (Home pro / agency):** set services + area → **M1**: online toggle + 30s alerts; **M3**: **consult inbox** → survey → **quote builder**; **M7**: candidate profiles + placement inbox. Dashboard adapts to which home services they offer.

---

### 🐾 4. Pet Services — *M1 + listing*

**Customer:**

- *Grooming / Vet-visit / Walking / Training (M1):* pick → slot → address → OTP → assigned → track → pay → rate.
- *Boarding:* pick **date range** → check availability → pay per-day → drop-off.
- *Adoption / Pet Shop:* browse **listings / products** → enquire / order.

**Partner:** groomer/vet/trainer sets **services + availability**; **boarding host** lists facility, photos, **per-day price, capacity calendar**; **pet shop** lists products with stock & price. Dashboard: services/availability OR listing & inventory manager.

---

### 🧱 5. Construction Labour — *M2 Crew (+ M3 for pros/finish)*

**Customer:** describe the job (photos, area, **start date, duration**) → **pay a survey fee** → request **broadcast to nearby contractors** (up to 3 respond) → contractor surveys (call/site visit) → receives **crew estimate(s)** — *roles × count × day-rate × days + materials list (who buys)* → **compare & accept one** (consult fee credited) → **day-wise work** with attendance → pay by days/attendance → rate. *(Design/finish jobs → M3 quote instead.)*

**Partner (Contractor / Thekedar):** **consult inbox** → accept & survey → **crew estimate builder** (set roles, day-rates, days; add materials with **who-supplies** toggle) → send/revise (1–2 rounds) → on accept: manage **crew roster**, **assign members** to the job, **track daily attendance**, **mark days done**, raise **additional-work approval** if scope grows → settle → earnings. Dashboard: consult inbox, estimates, crew roster, active jobs, attendance, earnings.

---

### 🧹 6. Manpower & Support Staff — *M7 Placement (+ M2 daily)*

**Customer:** choose role (maid, driver, security, catering staff…) → **intent toggle: Permanent or Daily-wage** → *Permanent (M7):* submit need → shortlist of candidates → interview/trial → **engage**. *Daily-wage (M2):* survey fee → crew-style estimate → book team for the days.

**Partner (Agency / Contractor):** **staffing inbox** → shortlist & propose candidates (profiles, experience, rate) → schedule interview/trial → confirm placement; daily-wage uses the crew estimate builder. Dashboard: candidate pool, staffing requests, placements, earnings.

---

### 📸 7. Events & Media — *M3 Quote (+ M1 for instant photography)*

**Customer:**

- *Event / project (M3):* browse **studios & portfolios** → pick a vendor → **enquiry + consult fee** → vendor sends a **package quote** → accept → **advance** → milestone updates → delivery of photos/video → rate.
- *Instant session (M1):* for listed-price sessions (Baby/Portfolio/Product shoot) → **book a slot directly** like a fixed-price service. The booking form offers **"Book instantly / Get a quote for an event."**

**Partner (Studio / Vendor):** manage **portfolio & packages** → **enquiry inbox** → **quote builder** (line items / package + advance %) → **booking calendar** → milestone updates → deliver files → **warranty** window → earnings. Dashboard: portfolio, enquiries, quotes, calendar, milestones, deliverables.

---

### 🪑 8. Rental Services — *M4 Rental*

**Customer:** browse items (chairs, tent, lighting, sound, tools…) → pick **quantity + date range** → system checks **availability** → pay **rent + refundable deposit** → delivery/pickup → in use → **return** → deposit settled (minus any damage).

**Partner (Rental vendor):** **inventory dashboard** — add items with **photos, per-day/month price, deposit amount, quantity/stock, availability calendar, delivery option** → receive rental requests → confirm → mark **out-for-delivery / in-use / returned** → apply damage deductions → earnings. Dashboard: inventory, availability calendar, requests, deposits/returns.

---

### 🏨 9. Rooms / PG / Hostel / Hotels — *M5 Listings*  *(your example)*

**Customer:** browse listings with **filters** (sharing type, AC/non-AC, food, gender, budget, area) → open a listing (**photos, amenities, rules, rent, map, advance amount**) → **enquire / schedule a viewing** → **pay an advance/token to reserve the room** → **booked / move-in**. Contact-unlock and instant-book variants per `[flows/](../flows/)` (images 01–11). → review after stay.

**Partner (Property host):** **dashboard to add a property & rooms** — enter details, **upload images**, set **amenities, house rules, sharing types**, set **rent + advance/token price**, set **vacancy/availability**, and **settings** (instant-book on/off, contact-unlock, food included, gender) → receive **enquiries inbox** → respond, schedule viewing, **confirm booking**, mark **occupied/vacant** → manage occupancy. Dashboard: listings & rooms, images, pricing & advance, availability/vacancy, enquiries, settings.

---

### 💼 10. Career / Job Opportunities — *M6 Job Board*

**Customer (Job seeker):** browse jobs by **category/location/type** → open a posting → **apply** (profile / resume) → **track application** (Applied → Shortlisted → Hired).

**Partner (Employer):** **post a job** (role, description, salary, location, requirements, type) → receive **applications** → **shortlist** → contact / **hire** → close. Dashboard: my job posts, applicants per post, shortlist/hire actions.

---

### 🛺 11. Vehicle Services (Rapido) — *M8 Real-time · inside the Customer app*

**Customer (rider — in the Customer app/web):** pick **ride type** (bike/auto/cab/goods/delivery) → enter **pickup & drop** → see **fare estimate** → request → **driver matched** → **live GPS track on Google Maps** → ride → **pay** (wallet/Razorpay) → rate. Trip appears in booking history.

**Partner (Driver face in Partner app):** **KYC** → online/offline toggle → receive **real-time request** (pickup + fare) → **accept** → navigate to pickup → **start trip** → navigate to drop → **end trip** → fare collected → earnings, **daily pass**, trip history. Dashboard: online toggle, live requests, navigation, earnings, daily pass.

---

## 3. AUTHENTICATION & OTP

- **Phone-based OTP is the primary auth** (no password)
- 6-digit OTP via **MSG91** (SMS), with fallback provider
- 10-min validity · max 3 attempts · 60s resend cooldown · auto-submit
- OTP hashed server-side; JWT issued on success; refresh tokens
- Android SMS auto-read / iOS one-time-code autofill
- Worker registration also OTP-gated
- **Worker verification gate (Rapido-style):** multi-step onboarding, **DigiLocker Aadhaar verification** (primary) + manual upload fallback, selfie/liveness, admin approve/reject, state machine (UNVERIFIED → PENDING → ACTIVE | REJECTED | SUSPENDED)

---

## 4. PAYMENTS (Razorpay)

- **Razorpay integration across every service** (checkout, capture, refund)
- Pay for bookings, deposits (rentals), milestone payments (projects), subscriptions
- Payment status reconciliation + webhooks
- Refund / partial-refund flows
- Invoices / receipts
- Settlement to vendors/workers; GST/TDS handling
- Bank payment export (admin)

---

## 5. WALLET · V COINS · REFERRAL

- **Customer Wallet** — store credits, use at checkout
- **V Coins** — platform reward currency (earn + redeem rules)
- **Referral system** — unique referral code per user; credit to referrer + referee on first completed booking
- Wallet transaction history/ledger
- **Vendor Subscription Plans / Premium Listings**
- **Membership ("VSolveHub Plus")** — priority booking, discounted rates, dedicated support

---

## 6. NOTIFICATIONS

- **WhatsApp** — click-to-chat FAB on every page + automated templates (booking_confirmed, worker_assigned, on_the_way, job_completed, worker_approved/rejected, new_lead_alert)
- **FCM Push** — customer (status updates) + worker (HIGH-priority new-job alerts that wake the screen)
- **Email** — booking confirmation, admin new-lead alerts
- **SMS** — OTP + fallback for failed WhatsApp
- Notification log with delivery status + retry (3× exponential backoff)

---

## 7. CUSTOMER & PARTNER APPS (Android + iOS)

**Customer App:**

- Full browse → book → OTP → pay → track flow (all booking models)
- **Rapido ride/vehicle experience built in** — book a ride/goods/delivery, live-track the driver, fare & payment — all inside this same app (no separate Rapido app)
- Profile & history, address book, saved services/wishlist
- Wallet, V Coins, referral, membership
- Ratings & reviews
- Push notifications
- **Stories feed** (Section 10)
- Published to **Google Play + Apple App Store**

**Partner App (worker/vendor) — role-customized (see §7.1):**

- Onboarding + DigiLocker verification gate
- **The dashboard, menu, and home screen change based on the partner's provider type** — a technician does not see the same app as a contractor, an event studio, a rental vendor, a property host, or a driver
- Common spine: earnings/payouts, wallet, ratings received, job/enquiry history, notifications
- Published to **Google Play + Apple App Store**

### 7.1 Partner dashboards are customized per provider type (NOT one-size-fits-all)

Every partner logs into the **same app**, but the **dashboard, menu, and primary actions are rendered for their supply type**. The provider type is chosen at onboarding and is a first-class field (it also enforces the supply-pool rule — a person is exactly one type at a time). The 8 provider faces:


| Provider type             | Serves                                | Home screen & menu                                                                                        |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Technician / Pro**      | M1 (Technician)                       | Online/offline toggle · **30s job alerts** · active job status · earnings · availability                  |
| **Beauty / Home pro**     | M1 (Beautician, Home, Pet)            | Online/offline toggle · 30s job alerts · service checklist · earnings                                     |
| **Contractor (Thekedar)** | M2 (Construction Labour, daily staff) | **Consult inbox** · site-survey list · **crew estimate builder** · crew roster · attendance · active jobs |
| **Studio / Vendor**       | M3 (Events & Media, projects)         | **Portfolio** · **enquiry inbox** · **quote builder** · booking calendar · milestones · warranty          |
| **Rental vendor**         | M4 (Rental)                           | **Inventory** · **availability calendar** · rental requests inbox · deposits/returns                      |
| **Property host**         | M5 (Rooms/PG/Hostel/Hotels)           | **Listings** dashboard · **enquiry inbox** · viewings · occupancy                                         |
| **Employer**              | M6 (Jobs)                             | **Post a job** · applicant review · shortlist · hire                                                      |
| **Driver**                | M8 (Rapido)                           | Online/offline toggle · **live ride/goods requests** · GPS navigation · daily pass · trip history         |


- The menu items, empty states, notification types, and earnings breakdown all differ per type.
- Placement/staffing (M7) is served through the **Contractor/Studio** face with a "hire staff" inbox.
- Same rule applies to **Partner Web** — the web dashboard is role-customized identically.
- Full definitions of each face and its flows: `[PRD.md §2](PRD.md)` and `[PRD.md §7](PRD.md)`.

---

## 8. RAPIDO / REAL-TIME VEHICLE (inside the Customer app — NOT a separate app)

> This is a **module inside the Customer app & web** (rider side) plus a **Driver dashboard inside the Partner app** (driver side). It shares the one backend, one auth, and one wallet with the rest of the platform. There is **no standalone Rapido app.**

- **Rider side (in Customer app/web):** pick ride type → live driver matching → **live GPS tracking on Google Maps** → fare → pay (wallet/Razorpay) → rate. Trip history in the customer's booking history.
- **Driver side (Driver face in Partner app):** online/offline toggle → real-time ride/goods requests → accept → navigate → complete → earnings.
- Ride types: **Bike Taxi, Auto, Cab, Ride booking, Goods Transport, Instant Delivery, Vehicle Rental/Service/Washing, Roadside Assistance, EV Services**
- **Driver Registration & Verification (KYC)** · Driver Wallet · Daily Pass
- **Fare engine** (distance/time-based pricing) · real-time matching / dispatch
- Ratings & reviews both ways

---

## 9. AI CHATBOT & AI SEARCH

- **AI Chatbot** — conversational assistant for discovery, booking help, support, FAQs
- **AI Search** — natural-language service search across the catalog
- Handoff to WhatsApp/human support when needed

---

## 10. STORIES (NEW — Instagram-style)

> A stories module, similar to Instagram stories, published by the admin and viewed by users across web + apps.

**Admin (create/manage):**

- Admin **posts stories** (image/video + optional caption/link)
- Admin sets an **expiry date/time** — the story auto-hides once expired (only the admin can set the expiry)
- Admin can **edit** a story (content, caption, expiry)
- Admin can **delete** a story at any time
- Stories appear in an Instagram-style tray/ring at the top of the home feed; tap to view full-screen with auto-advance

**User interactions:**

- **Like button** — available to **authenticated users only** (one like per user per story; toggle on/off)
- **Share** — available to **authenticated users only** (share a story out / to others)
- **View tracking** — every view is tracked (count of views; ideally which authenticated user viewed)
- Expired stories are no longer shown to users but remain in admin history/analytics

**Data to track per story:**

- Views count (and viewer list for authenticated users)
- Likes count (+ who liked)
- Shares count
- Created / edited / expiry timestamps, active vs expired state

**Admin analytics for stories:**

- Per-story views / likes / shares
- Active vs expired stories list

---

## 11. ADMIN PANEL

- **Lead/booking dashboard** — all bookings & enquiries as leads; filter by status/category/date/area; lead detail; assign/override; export CSV
- **Dispatch monitor** — real-time view of auto-dispatch; exception force-assign
- **Service catalog CRUD** — categories, sub-categories, services (fields, pricing, tags, order, active/inactive); ISR revalidation
- **User management** — customers, workers, vendors, KYC review queue (DigiLocker + manual)
- **Payments & settlements** — transactions, refunds, GST/TDS, bank export
- **Stories management** (Section 10)
- **CMS** — gallery, FAQ, banners, content
- **Dashboards & reports** — Business/Customer/Vendor/Booking/Revenue/Analytics; real-time reports; export Excel/CSV/PDF; bulk import; custom report builder; admin-configurable modules
- **Analytics** — bookings over time, category distribution, worker performance, conversion funnel, revenue trends

---

## 12. NON-FUNCTIONAL / PLATFORM REQUIREMENTS

- Production backend + relational database (SQL) + documented **REST APIs**
- Staging environment for the full build phase (nothing public until single go-live)
- SEO (SSR/ISR, structured data, sitemaps) for the customer web
- Performance (dashboards < 2s, paginated large lists)
- Security (auth, private file storage/pre-signed URLs, reCAPTCHA on public forms, payment reconciliation)
- Multi-language support (Telugu / Hindi) — selector + translated UI
- Logging, notification logs, error handling & retries
- Full source code, API docs, DB backup, credentials handed over at the end

---

## FEATURE CHECKLIST (quick scan)

- 11 categories · ~850 services — browse, search, detail pages
- Booking engine A/M1 — on-demand dispatch + 30s timer + live tracking
- Booking engine B/M2 — crew (Consult-First estimate, day-wise work)
- Booking engine C/M7 — staffing enquiry / placement
- Booking engine D/M4 — rental (availability + deposit)
- Booking engine E/M5 — property/accommodation enquiry inbox
- Booking engine F/M3 — quote/estimation (inspection → estimate → quote → warranty)
- OTP auth (MSG91) + worker DigiLocker verification gate
- Razorpay payments (across all services, refunds, settlements, GST/TDS)
- Wallet · V Coins · Referral · Subscriptions · Membership
- WhatsApp + FCM + Email + SMS notifications
- Customer App (Play Store + App Store) — **Rapido ride/vehicle built in**
- Partner App (Play Store + App Store) — **role-customized dashboard per provider type**
- Rapido real-time vehicle (live GPS, fare engine, KYC) — **module in Customer app, not a separate app**
- AI Chatbot + AI Search
- **Stories** (admin post/edit/delete + expiry; authenticated like & share; view tracking)
- Admin panel (leads, catalog, users, payments, reports, CMS, stories)
- Ratings & reviews, profiles, gallery, FAQ, maps, multi-language

