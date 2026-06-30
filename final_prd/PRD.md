# VSolve — Product Requirements

> **One line:** All local services at your doorstep — trusted, fast, fair — built for Tier 2/3 Indian cities.

---

## 1. Why this exists

Tier 2/3 India books services through phone calls, WhatsApp, and middlemen. It's unreliable for customers, low-paying for workers, and invisible to anyone trying to run it as a business. VSolve puts every service in one place — discoverable, bookable, and trackable.

Think of it as **Urban Company for smaller Indian cities**: verified-worker trust, easy visual browsing, and the simplicity first-time smartphone users need.

**What "done" looks like**

- A customer can find and book any service 24×7 — even at 2am.
- A worker gets steady, fair-paid jobs without a middleman's cut.
- The business never loses a lead, and adds a new service category by config, not code.

---

## 2. Who uses it (3 people)


| Person                              | Who they are                                 | What they need                                                               |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| **Customer** — Priya, 34, Warangal  | Homemaker, mid-range Android, prefers Telugu | Reliable workers, fixed prices, live tracking, no one ghosting her           |
| **Worker** — Raju, 28, electrician  | Budget Android, lives on WhatsApp            | Steady jobs, a verified profile, reliable pay, lower cut than middlemen      |
| **Admin/Ops** — Srikanth, Hyderabad | Laptop + phone                               | All leads in one place, verify workers, settle disputes, watch system health |


---

## 3. The one big idea: services aren't all booked the same way

This is the heart of the product. Every service maps to **one of 7 booking types ("archetypes")**. The type decides everything downstream: the booking flow, the statuses, who picks the provider, and whether the system auto-dispatches.


| Type  | Name                        | Who picks the provider               | How the lead travels                                          |
| ----- | --------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| **A** | Instant / Scheduled job     | **System picks** (auto-dispatch)     | Push — offered to nearby workers, first to accept wins        |
| **B** | Crew / daily-wage job       | **System picks** (needs a headcount) | Push — same as A, but for a crew                              |
| **C** | Staffing / placement        | Customer browses & applies           | Pull — request sits in provider's inbox                       |
| **D** | Rental / inventory          | **Customer picks the item**          | Pull — request to that vendor's inbox                         |
| **E** | Property / accommodation    | **Customer picks the listing**       | Pull — enquiry to that host's inbox                           |
| **F** | Quote / project             | **Customer picks the studio/vendor** | Pull — enquiry → quote in inbox                               |
| **G** | Job board (listing + apply) | **Seeker applies to a posting**      | Board — employer posts a job, seekers apply, employer reviews |


### The three lead mechanics (everything reduces to these)

**Push-Dispatch** (types A, B) — the customer doesn't choose a worker; the system does.

1. Build a pool: workers who are active + online + skill-matched + in the area + not on another job.
2. Rank them: nearest → best rated → idle longest.
3. Offer the job in waves with a **server-side 30-second accept/decline timer**. First to accept wins.
4. If all waves run out → "No worker found" → customer can retry, schedule, or get notified.

*(No admin sits in this path — it's automatic.)*

**Inbox-Pull** (types C, D, E, F) — the customer already chose *this* vendor / listing / studio, so the request lands in **that provider's inbox** with an hours-scale response window (not 30s) — they accept, confirm, or send a quote.

**Job-Board (Listing + Apply)** (type G) — there is no "booking" and no dispatch. An employer posts a job listing; seekers apply; the employer reviews and hires. It reuses the verified-profile and notification spine but runs on its own simple listing → apply → hire flow.

### Status flows per type

```
A & B  SEARCHING → ASSIGNED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED
C      REQUESTED → SHORTLISTED → TRIAL → ENGAGED → CLOSED
D      REQUESTED → CONFIRMED → OUT_FOR_DELIVERY → IN_USE → RETURNED → CLOSED
E      ENQUIRY → VIEWING_SCHEDULED → TOKEN_PAID → BOOKED → CLOSED
F      ENQUIRY → QUOTED → ADVANCE_PAID → IN_PROGRESS → COMPLETED
G      POSTED → APPLIED → SHORTLISTED → HIRED → CLOSED
```

### One provider app, 6 faces

The supply side mirrors the archetypes — the same provider app simply renders differently:


| Provider type     | Handles | Home screen                             |
| ----------------- | ------- | --------------------------------------- |
| **Captain**       | A, B    | Online toggle + 30s job alerts          |
| **Professional**  | C       | Profile + availability + requests inbox |
| **Rental vendor** | D       | Inventory dashboard + inbox             |
| **Property host** | E       | Listings dashboard + inbox              |
| **Event vendor**  | F       | Portfolio/packages + calendar + inbox   |
| **Employer**      | G       | Post a job + review applicants          |


---

## 4. Service catalog (10 categories — every sub-service tagged)

Each sub-service carries an explicit booking type. Where a sub-service can run two ways, the rule for choosing is stated — there is no ambiguity left to interpret at build time.

### 1. Home Services

*Default: Type A (Push).*


| Sub-service         | Type                                                       |
| ------------------- | ---------------------------------------------------------- |
| Electrical Services | A                                                          |
| Plumbing Services   | A                                                          |
| Carpentry Services  | A                                                          |
| AC & RO Services    | A                                                          |
| Cleaning Services   | A                                                          |
| Painting Services   | A for single-room / touch-up · **F** for full-home repaint |
| Appliance Repair    | A                                                          |
| Home Automation     | **F** (site visit → quote → install)                       |


### 2. Construction Services

*Default: Type B (Crew Push) for labour supply; Type F for priced whole-jobs.*


| Sub-service             | Type                             |
| ----------------------- | -------------------------------- |
| General Labour          | B                                |
| Mason Work              | B                                |
| Welding & Fabrication   | B                                |
| Tile & Flooring Work    | B                                |
| Waterproofing           | **F** (whole-area project quote) |
| Shuttering & Steel Work | B                                |
| Demolition Work         | **F** (project quote)            |
| Civil & Road Work       | **F** (project quote)            |


### 3. Beauty & Wellness

*Default: Type A (Push).*


| Sub-service         | Type                  |
| ------------------- | --------------------- |
| Facial & Skin Care  | A                     |
| Hair Services       | A                     |
| Waxing & Threading  | A                     |
| Makeup Services     | A                     |
| Mehendi Services    | A                     |
| Manicure & Pedicure | A                     |
| Bridal Packages     | **F** (package quote) |
| Body Care           | A                     |


### 4. Event & Media Services

*All Type F (Quote / Inbox).*


| Sub-service              | Type |
| ------------------------ | ---- |
| Photography              | F    |
| Videography              | F    |
| Decoration               | F    |
| Catering                 | F    |
| DJ & Sound               | F    |
| Event Planning           | F    |
| Entertainment Services   | F    |
| Editing & Album Services | F    |


### 5. Rental Services

*All Type D (Inventory / Inbox).*


| Sub-service                   | Type |
| ----------------------------- | ---- |
| Furniture Rental              | D    |
| Event Equipment Rental        | D    |
| Construction Equipment Rental | D    |
| Vehicle Rental                | D    |
| Home Appliance Rental         | D    |
| Camera Equipment Rental       | D    |
| Tools & Machinery Rental      | D    |
| Cooling & Heating Rental      | D    |


### 6. Vehicle Services

*Default: Type A (Push).*


| Sub-service                   | Type                                 |
| ----------------------------- | ------------------------------------ |
| Ride Booking                  | A                                    |
| Taxi Services                 | A                                    |
| Goods Transport               | A                                    |
| Vehicle Repair                | A                                    |
| Vehicle Washing               | A                                    |
| Roadside Assistance           | A (emergency push)                   |
| EV Services                   | A                                    |
| Vehicle Documents & Insurance | **F** (quote / paperwork processing) |


### 7. Accommodation Services

*All Type E (Listings / Inbox).*


| Sub-service           | Type |
| --------------------- | ---- |
| Rooms                 | E    |
| PG Accommodation      | E    |
| Hostels               | E    |
| Apartments            | E    |
| Rental Properties     | E    |
| Short Stay            | E    |
| Student Accommodation | E    |
| Worker Accommodation  | E    |


### 8. Job Opportunities

*All Type G (Listing + Apply).* A job board, not a service booking: employer posts → seeker applies → employer reviews and hires. It does **not** use the dispatch engine.


| Sub-service         | Type |
| ------------------- | ---- |
| Skilled Jobs        | G    |
| Unskilled Jobs      | G    |
| Technician Jobs     | G    |
| Driver Jobs         | G    |
| Office Jobs         | G    |
| IT & Software Jobs  | G    |
| Healthcare Jobs     | G    |
| Work From Home Jobs | G    |


### 9. Manpower & Support Staff

*Split by intent captured at booking time: **permanent placement → C (inbox)**, **daily-wage → B (push crew)**.* The intent toggle is a required field on the booking form for this category; the value below is the default the form pre-selects.


| Sub-service                | Default type  | Other intent      |
| -------------------------- | ------------- | ----------------- |
| Cleaning Staff             | C (permanent) | B (daily)         |
| Logistics Staff            | C (permanent) | B (daily)         |
| Event Staff                | B (daily)     | C (permanent)     |
| Drivers                    | C (permanent) | B (daily)         |
| Domestic Staff             | C (permanent) | —                 |
| Security Staff             | C (permanent) | B (event / daily) |
| Construction Support Staff | B (daily)     | C (permanent)     |
| Office Support Staff       | C (permanent) | B (daily)         |


---

## 5. Booking type cheat-sheet (the whole catalog in one glance)


| Category           | Type              | Lead mechanic     | Provider                |
| ------------------ | ----------------- | ----------------- | ----------------------- |
| Home Services      | A                 | Push (30s)        | Captain                 |
| Construction       | B                 | Push (crew)       | Captain                 |
| Beauty & Wellness  | A                 | Push (30s)        | Captain                 |
| Event & Media      | F                 | Inbox (quote)     | Event vendor            |
| Rental             | D                 | Inbox (inventory) | Rental vendor           |
| Vehicle            | A (+D for rental) | Push (+inbox)     | Captain / Rental vendor |
| Accommodation      | E                 | Inbox (listings)  | Property host           |
| Job Opportunities  | G                 | Listing + apply   | Employer                |
| Manpower & Support | C / B             | Inbox / Push      | Professional / Captain  |
| Custom / Other     | A or F            | Depends           | Triaged                 |


---

## 6. What ships when


|                    | Phase 1 — Launch    | Phase 2                                                                  | Phase 3                                                   |
| ------------------ | ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| **Booking types**  | A, B (dispatch)     | C, D, E, F, + G                                                          | —                                                         |
| **Provider types** | Captain only        | + the other 4 + employers                                                | —                                                         |
| **Lead mechanic**  | Push-Dispatch (30s) | + Inbox-Pull + job board                                                 | —                                                         |
| **Big features**   | Auto-dispatch core  | Staffing, rental, property, events, job board, search, wallet, analytics | Multi-language, payment gateway, auto-payouts, multi-city |


Phase-2 data is **designed now** (forward-compatible) but not wired in Phase 1.

---

## 7. Features

**P0 — launch blockers**

- Browse service categories (web + app)
- Service detail + booking form
- OTP phone verification (booking only after verify)
- Booking confirmation with a `VSH-` reference
- Booking status timeline tracking
- WhatsApp click-to-chat + notifications
- Admin dashboard (monitor leads, not assign them)
- Worker verification gate (Aadhaar via DigiLocker)
- Job notification + 30s accept timer (worker app)
- Worker job status updates
- Email + WhatsApp notifications

**P1 — important**
Advanced search · Customer profile & history · Ratings & reviews · Worker earnings dashboard · Admin catalog CRUD · Push notifications · Gallery · FAQ · Maps

**P2 — phase 2**
Wallet & referral · Membership · Admin analytics · Multi-language · Re-booking · Job board

---

## 8. The flow, end to end

**Customer side**

```
Browse category → open service → fill booking form → verify phone (OTP)
  → booking created (VSH- ref) → track status on a live timeline → rate when done
```

**Push services (A/B):** after booking, the system finds and assigns a worker automatically.
**Pull services (C/D/E/F):** the customer picked the vendor, so it goes to that vendor's inbox.

**Worker side (Captain)**

```
Sign up → verify Aadhaar (gate) → go online → get 30s job alert → accept
  → see full address → travel → update status → complete → earnings recorded
```

**Admin side**

```
Watch all leads live → verify new workers → step in only on disputes / no-worker-found
```

---

## 9. Rules that must hold (carry these into any build)

- **A lead *is* a booking.** One status vocabulary, no separate "leads" table. Admin states (new/viewed/spam/closed) are just flags, not statuses.
- **Booking only after OTP verify.** Server decides — never trust a phone number from the browser.
- **The 30s timer lives on the server.** The countdown a worker sees is just cosmetic.
- **A worker holds at most one live job offer at a time.**
- **Record money from day one**, even though the payment gateway is Phase 3.
- **SEO-friendly slugs in URLs**, not numeric IDs.
- **Privacy:** customer sees worker name + skill + rating (not phone); worker sees the full address only *after* accepting.

---

## 10. Tech, kept light (just the shape)

We don't need the app-by-app stack here — only how the pieces talk:

```
   Customers & Workers & Admin (web + mobile)
                  │
          One REST API  (/api/v1/)
                  │
   ┌──────────────┼───────────────┐
 Database      Cache/Realtime   File storage
 (the source   (OTP store,      (images,
  of truth)     30s timers,      documents)
                live updates)
                  │
        External services
   (SMS OTP · WhatsApp · Push · Maps · Email)
```

**What each layer does**

- **API** — every action goes through one versioned REST API.
- **Database** — the single source of truth: users, workers, services, bookings, status logs, the 30s offer ledger, earnings, ratings.
- **Cache/realtime** — holds OTPs, runs the server-side 30s timers, powers the live admin monitor.
- **File storage** — worker documents, gallery images.
- **External services** — SMS for OTP, WhatsApp for chat/alerts, push, maps, email.

*(Specific frameworks/vendors are an implementation choice, deliberately left out so the flow stays the focus.)*

---

