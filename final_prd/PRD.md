# V Solve Hub — Product Requirements (Build Spec)

> **One line:** Every local service — technicians, labour, beauty, events, rentals, stays, jobs, rides — in one app, priced fairly and tracked end-to-end, built for Tier 2/3 India.

> **Who this document is for:** the engineer(s) building the platform. It defines *what to build and why* — the users, the booking engines, every service group, the money rules, and how it all maps to the 3 delivery phases. Read this with two companion files: [services.md](services.md) (the full priced catalog, every service tagged with its booking model) and [project_milestones.md](../project_milestones.md) (phases, payments, deliverables). Where this PRD and the milestone doc disagree on scope, **the milestone doc wins**.

---

## 1. Why this exists

Tier 2/3 India books services through phone calls, WhatsApp, and middlemen. It's unreliable for customers, low-paying for workers, and invisible to anyone trying to run it as a business. V Solve Hub puts every service in one place — discoverable, bookable, trackable, and fairly priced.

Think **Urban Company + a contractor marketplace + Rapido + a rental/stay/jobs board**, tuned for smaller Indian cities: verified workers, visual browsing, and the simplicity a first-time smartphone user needs.

**What "done" looks like**

- A customer can find and book *any* of the 11 service groups from one app.
- A worker or contractor gets steady, fair-paid work without a middleman's cut.
- The business never loses a lead, sees every rupee, and can add a service by config, not code.

---

## 2. Who uses it (3 roles, 8 provider faces)

| Role | Who | What they need |
| --- | --- | --- |
| **Customer** — Priya, 34, Warangal | Homemaker, mid-range Android, prefers Telugu | Reliable workers, clear prices, live tracking, nobody ghosting her |
| **Partner / Provider** — Raju, 28 | Budget Android, lives on WhatsApp | Steady jobs, a verified profile, reliable pay, a lower cut than middlemen |
| **Admin / Ops** — Srikanth, Hyderabad | Laptop + phone | All leads in one place, verify partners, settle disputes, watch revenue & system health |

The **Partner app is one app that renders 8 different faces** depending on what the partner supplies. A partner picks one primary face at onboarding (this is also the **supply-pool rule**: a person is in exactly one pool at a time — see §5.2).

| Provider face | Serves booking model | Home screen |
| --- | --- | --- |
| **Technician / Pro** | M1 Instant | Online toggle + 30s job alerts |
| **Beauty / Home pro** | M1 Instant | Online toggle + 30s job alerts |
| **Contractor (Thekedar)** | M2 Crew | Consult inbox + estimate builder + crew roster |
| **Studio / Vendor** | M3 Quote | Portfolio + enquiry inbox + quote builder + calendar |
| **Rental vendor** | M4 Rental | Inventory + availability calendar + inbox |
| **Property host** | M5 Listings | Listings dashboard + enquiry inbox |
| **Employer** | M6 Job Board | Post a job + review applicants |
| **Driver** | M8 Rapido | Online toggle + live ride/goods requests + GPS |

*(M7 Placement/Staffing is served through the Contractor/Vendor face with a "hire staff" inbox — see §7.9.)*

---

## 3. The 11 categories at a glance

Every category maps to one (sometimes two) of **8 booking models** defined in §5. This table is the map of the whole product.

| # | Category | Primary booking model | Phase | Provider face |
| --- | --- | --- | --- | --- |
| 1 | **Technician Services** | M1 Instant (+ M3 for big installs) | 1 | Technician |
| 2 | **Beautician Services** | M1 Instant (+ M3 for Bridal) | 1 | Beauty pro |
| 3 | **Home Services** | M1 Instant (+ M3 for shifting/AMC/borewell) | 1 | Home pro |
| 4 | **Pet Services** | M1 Instant (+ listing for adoption/shop) | 1 | Home pro |
| 5 | **Construction Labour** | M2 Crew (+ M3 for pros/finish work) | 1 | Contractor / Studio |
| 6 | **Man Power & Support Staff** | M7 Placement (+ M2 for daily-wage) | 1 | Contractor |
| 7 | **Event & Media Services** | M3 Quote | 1 | Studio / Vendor |
| 8 | **Rental Services** | M4 Rental | 2 | Rental vendor |
| 9 | **Rooms / PG / Hostel / Hotels** | M5 Listings | 2 | Property host |
| 10 | **Career / Job Opportunities** | M6 Job Board | 2 | Employer |
| 11 | **Vehicle Services (Rapido)** | M8 Real-time | 3 | Driver |

**The 3-phase split (from [project_milestones.md](../project_milestones.md)):**

- **Phase 1** — Backend + DB + REST APIs + Website (Customer / Partner / Admin web) + booking engines for the **7 groups** in rows 1–7. No payments, no OTP, no apps, not public.
- **Phase 2** — The **3 remaining groups** (rows 8–10) + Razorpay + MSG91 OTP + Wallet + V Coins + Referral + full Admin dashboards. Whole web platform complete on staging, still not public.
- **Phase 3** — Customer App + Partner App + **Rapido** (row 11, real-time) + AI Chatbot + **single combined go-live of all 11 categories** + handover.

Everything below is **designed now** so Phase-2/3 data models are forward-compatible even where they aren't wired in Phase 1.

---

## 4. The single most important idea: not everything can be priced up front

Two situations, and the whole product hinges on telling them apart:

1. **The price is knowable from the catalog.** "Ceiling fan installation ₹199–349." "Tap repair ₹149–299." "Basic facial ₹499." → the customer **books instantly** and pays a small **visit charge**. This is **M1 Instant**.
2. **The price is NOT knowable without someone assessing the job.** "How many masons to build my compound wall?" "What will waterproofing my terrace cost?" "How much for wedding decoration?" → the customer **pays a small consultation fee**, a pro assesses the job, and returns a real estimate. This is **Consult-First** (**M2 Crew** or **M3 Quote**).

**Your own price sheet proves this split.** In [services.md](services.md): technicians carry a *"Basic Visit Charge ₹99–149"*; decoration and DJ carry *"Site Visit & Consultation ₹499–999"*; event management carries *"Event Consultation ₹999–2999"*; and architects, interior designers and civil engineers carry **no price at all** — because you can't quote them without a conversation. The catalog already knows which services are instant and which need a consult.

> **The rule to carry into every build decision:**
> **If the price is in the catalog → book it (M1 Instant). If it isn't, a pro must assess it first (Consult-First), and the estimate comes back either as *workers-for-days* (M2 Crew) or *a lump sum* (M3 Quote).**

---

## 5. The 8 booking models

Each model defines its own **flow, statuses, who picks the provider, and money rhythm**. A service's model is stored on the catalog record, so the app renders the right flow automatically.

### 5.1 M1 — Instant Fixed-Price *(push-dispatch)*

**For:** Technician, Beautician, Home (simple), Pet (simple). The price is in the catalog.

**Flow**

```
Browse → open service → pick items → fill form → verify phone (OTP)
  → booking created (VSH- ref) → SYSTEM auto-assigns nearest matched partner
  → partner travels → status timeline → service done → pay → rate
```

**Dispatch (push):** the customer does **not** pick the worker; the system does.
1. Build a pool: partners who are active + online + skill-matched + in the area + not on another job.
2. Rank: nearest → best rated → idle longest.
3. Offer in waves with a **server-side 30-second accept/decline timer**. First to accept wins.
4. If all waves run out → "No worker found" → customer can retry, schedule, or be notified.

**Money:** catalog line-item price + a **visit charge** (₹99–149; waived/credited when the job is booked). Payment via Razorpay (Phase 2); money is *recorded* from day one even before the gateway is wired.

**Statuses:** `SEARCHING → ASSIGNED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED` (+ `CANCELLED`).

---

### 5.2 M2 — Consult-First: CREW *(labour by the day)* — Phase 1 core

**For:** Construction Labour day-trades (Helper, Mason, Shuttering, Bar-Bending, Concrete, Tile, Painter, Demolition, Welding, Fabrication, Scaffolding, Road & Civil, Waterproofing-worker) and daily-wage Man Power teams.

**The idea:** the customer is the builder; they need **N workers with the right skills for M days**. Nobody can price that from a catalog, so a **contractor (thekedar)** surveys the job and returns a **crew estimate**.

**Flow (the realistic Indian sequence)**

```
1. Customer describes the job (photos, area, rough scope, start date)
   + pays a CONSULTATION / SURVEY FEE (₹99–999)        ← held, not full payment
2. Request BROADCAST to nearby contractors (up to 3 may respond)
3. Contractor(s) ACCEPT and assess — by call or a site visit
4. DISCUSS: how many workers, which skills, how many days,
   what MATERIALS are needed and WHO BUYS them
5. Contractor submits a CREW ESTIMATE (see §6.2) — customer can hold 2–3 to compare
6. Customer ACCEPTS one / NEGOTIATES (1–2 rounds) / DECLINES
   → on Accept, the consult fee is CREDITED to the bill
7. Crew scheduled → day-wise work → daily attendance → pay by days/attendance
8. Complete → rate
```

**Supply-pool rule (critical):** a person is in **exactly one pool at a time** — solo provider *or* contractor *or* crew member. **Crew members are roster data owned by the contractor, not independent partners**, so they can never receive solo jobs. This is enforced by the data model, not a flag, and it's what prevents double-booking. A contractor is the single accountable partner: he carries the rating, brings his own people + equipment, and **pays his own crew off-platform** (the platform runs no payroll — only the contractor needs KYC + payout).

**Money:** consult fee upfront (held) → on acceptance, pay per the estimate (by day / by milestone / advance+balance). **Attendance is proof-of-presence and the basis for pro-rating** — a booked worker who doesn't show reduces the bill. Platform takes commission on the settled amount.

**Statuses:** `CONSULT_REQUESTED → CONSULT_ACCEPTED → SURVEYED → ESTIMATE_SENT → BOOKED → IN_PROGRESS → COMPLETED` (+ `NEGOTIATING`, `DECLINED`, `CANCELLED`).

---

### 5.3 M3 — Consult-First: QUOTE *(the whole job for a price)* — Phase 1 core

**For:** Construction professionals & finish work (Architect, Interior Designer, Civil Engineer, Quantity Surveyor, Project Manager, Site Supervisor, False Ceiling, Glass/Aluminium, UPVC, Flooring, Waterproofing, Compound wall, Modular kitchen); all **Event & Media**; big Technician projects (Full CCTV, Smart Home, Solar, Lift, Network Setup); Beautician **Bridal Packages**; big Home jobs (Shifting, AMC, Borewell, Septic, Home Inspection); Vehicle Documents & Insurance.

**The idea:** the customer wants an **outcome**, and the vendor owns the labour + materials + result for a **lump sum**. Here the customer is buying *taste and trust*, so they **choose the specific vendor** by portfolio (inbox-pull), not by lowest day-rate.

**Flow**

```
1. Customer browses vendors/studios/packages → picks THIS vendor
   → sends an enquiry (requirement + photos + date + budget hint)
   + pays a CONSULTATION FEE (₹99–2999 by tier)         ← held
2. Enquiry lands in that vendor's INBOX; vendor accepts
3. Vendor reviews / asks questions / does a site visit
4. Vendor submits a QUOTE (see §6.3): lump sum, materials in/out, timeline, milestones
5. Customer ACCEPTS / NEGOTIATES / DECLINES
   → on Accept, consult fee CREDITED
6. ADVANCE (20–30%) → stage payments → balance on completion
7. Complete → optional WARRANTY period → rate
```

**Money:** consult fee → advance → milestones → balance, all via Razorpay (Phase 2). Optional **Warranty** tracked (built Phase 1, activated later).

**Statuses:** `ENQUIRY → QUOTED → ADVANCE_PAID → IN_PROGRESS → COMPLETED → [WARRANTY]` (+ `NEGOTIATING`, `DECLINED`, `CANCELLED`).

---

### 5.4 M4 — Rental / Inventory — Phase 2

**For:** all Rental Services (event furniture, tent/shamiana, lighting, sound, décor, catering equipment, construction equipment, home appliances, furniture, camera, tools, cooling/heating).

**Flow**

```
Pick item(s) → choose dates → system checks AVAILABILITY calendar
  → pay RENT + refundable DEPOSIT → deliver/pickup → in use → return → deposit settled
```

**Money:** rent (per unit/day or /month per the catalog) + refundable deposit; damage deductions on return.

**Statuses:** `REQUESTED → CONFIRMED → OUT_FOR_DELIVERY → IN_USE → RETURNED → CLOSED` (+ `CANCELLED`).

---

### 5.5 M5 — Listings / Enquiry — Phase 2

**For:** all Rooms / PG / Hostel / Hotels / Apartments / Rental Properties / Short Stay / Student & Worker Accommodation.

**Flow**

```
Browse listings (filters: sharing, AC, food, budget, gender, area)
  → shortlist → send ENQUIRY to host inbox → schedule viewing
  → pay TOKEN → BOOKED / move-in → close
```

**Statuses:** `ENQUIRY → VIEWING_SCHEDULED → TOKEN_PAID → BOOKED → CLOSED` (+ `CANCELLED`).

---

### 5.6 M6 — Job Board *(post & apply)* — Phase 2

**For:** all Career / Job Opportunities. **This is not a service booking and uses no dispatch engine** — it reuses only the verified-profile + notification spine.

**Flow**

```
Employer POSTS a job → seekers APPLY → employer SHORTLISTS → HIRES → close
```

**Statuses:** `POSTED → APPLIED → SHORTLISTED → HIRED → CLOSED`.

---

### 5.7 M7 — Placement / Staffing *(permanent hire, inbox)* — Phase 1

**For:** Man Power & Support Staff booked as **permanent** (maids, cooks, drivers, security, office & domestic staff). *(The same category booked as **daily-wage** runs on M2 Crew — the intent toggle on the booking form decides.)*

**Flow**

```
Customer requests staff (role, skills, timing, budget)
  → agency/contractor shortlists candidates → interview / trial
  → ENGAGED (placement) → close
```

**Statuses:** `REQUESTED → SHORTLISTED → TRIAL → ENGAGED → CLOSED`.

---

### 5.8 M8 — Rapido / Real-Time Vehicle — Phase 3

**For:** all Vehicle Services — Ride Booking, Taxi, Goods & Transport, Instant Delivery, Washing, Servicing, Repair, Roadside Assistance, Rental, EV, Documents & Insurance.

This is a **real-time GPS product** (its own app track in Phase 3): live driver matching, **Google Maps integration, live tracking, a fare engine**, trip history, driver wallet & daily pass, KYC-verified drivers, ratings. Some sub-services fall back to other models — **Vehicle Rental → M4-style**, **Documents & Insurance → M3 Quote** — but the ride/goods/delivery core is real-time dispatch.

**Statuses (ride):** `REQUESTED → DRIVER_ASSIGNED → ARRIVING → TRIP_STARTED → TRIP_ENDED → PAID → RATED`.

---

## 6. The Consult-First engine in detail *(M2 + M3 share this)*

This is the deepest, most valuable engine and the one the milestone doc names explicitly. The milestone's named deliverables map onto it exactly:

| Milestone deliverable | What it is here |
| --- | --- |
| **Smart Inspection Booking** | Stages 1–3: request + consult fee + provider accepts + surveys |
| **Digital Estimation Engine** | Stage 4–5: the structured estimate builder (crew form + quote form) |
| **Vendor Quote System** | Vendor submits/revises; customer compares up to 3 |
| **Additional Work Approval** | Mid-job scope-creep → revised estimate → customer approves the delta |
| **Customer Feedback** | Ratings & reviews after completion |
| **Vendor Dashboard** | The contractor/studio partner portal |
| **Warranty System** | Post-completion warranty tracking (built Phase 1, activated later) |

### 6.1 The shared flow (recap)

`Triage → Request + Consult Fee → Match → Assess → Estimate → Decide → Book → Fulfil → Rate.` The **only** difference between M2 and M3 is the shape of the estimate (§6.2 vs §6.3) and the dispatch (broadcast for labour, inbox-pull for projects).

### 6.2 The CREW estimate form (M2)

```
Roles × count × day-rate × days:
  Masons     × 6  @ ₹1,200/day × 5 = ₹36,000
  Helpers    × 2  @ ₹  800/day × 5 = ₹ 8,000
                        Labour total = ₹44,000

Materials (each line has a WHO-SUPPLIES toggle):
  Cement 40 bags   → Customer   (~₹16,000)
  Sand   2 units   → Customer   (~₹ 9,000)
  Mixer / tools    → Contractor (in labour)

Consult fee ₹500 → credited → Net labour payable ₹43,500
```

Day-rates come pre-filled from the catalog ranges in [services.md](services.md) and are editable by the contractor within a sane band.

### 6.3 The QUOTE estimate form (M3)

```
Terrace waterproofing — 1,200 sqft
  Labour + application        ₹52,000
  Materials (membrane etc.)   ₹31,000   ← vendor supplies
  Warranty                    5 years
                   Lump sum = ₹83,000
  Advance 25% ₹20,750 → stage payments → balance on completion
  Consult fee ₹500 → credited
```

### 6.4 Materials handling (three ways, on every estimate)

Each material line is one of: **Customer buys** · **Contractor buys** (billed at cost or inside the lump sum) · **Platform-procured** (future — order via the Rental/supplier network). This ledger is the record of truth for any materials dispute.

### 6.5 Consultation-fee tiers & policy

| Tier | Fee | Used for | On booking | If customer walks | If provider no-shows |
| --- | --- | --- | --- | --- | --- |
| **Micro** | ₹99–149 | Technician visit | Credited | Kept by provider | Refunded |
| **Survey** | ₹499–999 | Site visit (decoration, waterproofing, masonry, shifting) | Credited | Kept by provider | Refunded |
| **Design** | ₹999–2999 | Architect, interior, event management | Partly credited | Kept by provider | Refunded |

**Decisions (locked defaults):** consult fee is **credited to the final bill on booking**, **forfeited to the provider if the customer walks away** (protects his time), and **refunded if the provider no-shows**. For labour, the fee buys the assessment and **up to 3 contractors may return competing estimates** so the customer can compare.

### 6.6 Estimate edge cases (must be handled)

- **Negotiation:** 1–2 revise rounds, then the estimate locks.
- **Additional Work Approval:** mid-job scope increase → provider raises a **revised estimate for the delta only** → customer approves before work continues.
- **Partial engage:** customer books 3 of 5 quoted days → crew estimate re-totals.
- **Multi-vendor compare:** hold 2–3 estimates side-by-side before choosing (labour).
- **No-show / abandonment:** provider no-show → consult fee refunded + auto re-broadcast; if none pick it up → customer cancels for full refund.
- **Warranty:** on M3 completion, start a warranty window; re-visits inside it are free.

---

## 7. Service groups in detail

Purpose, who it's for, booking model, and the special cases per group. Full priced sub-lists live in [services.md](services.md).

### 7.1 Technician Services *(M1 + M3)* — Phase 1
Break-fix and installation for the home. Electrician, Plumbing, Carpenter, AC, RO, Internet/WiFi, Gas Stove, Computer/Laptop, Mobile, CCTV, Locksmith, Home Automation, Fire Safety, Solar, Lift, Watch. **Default M1 Instant** with a ₹99–149 visit charge and per-job catalog prices. **Escalate to M3 Quote** when a job is a *Project* in the catalog: Full CCTV Setup, Smart Home Setup, Solar Panel Installation, Lift Installation, Network Setup, Fire Alarm/Sprinkler systems.

### 7.2 Beautician Services *(M1 + M3)* — Phase 1
At-home salon: Face care, Bleach/Detan, Waxing, Threading, Hair (cut/color/spa/treatments), Mani-Pedi, Makeup, Mehendi, Body care, Advanced skin care. **M1 Instant** with a ₹99–299 visit charge and fixed service prices. **Bridal Packages → M3 Quote** (consultation ₹299 + a curated multi-service package).

### 7.3 Home Services *(M1 + M3)* — Phase 1
The widest group: Home/Sofa/Carpet Cleaning, Pest Control, Water Tank, Borewell, Septic, Laundry, Home Shifting, Storage, Gardening, Pool, Chimney, Home Organization, Elder Care, Maid Services, Home Inspection, Home Maintenance/AMC. **M1 Instant** for standard cleaning/pest/laundry/gardening. **M3 Quote** for jobs that need a survey: Home Shifting, AMC, Borewell, Septic, Home Inspection, whole-villa deep cleaning. Maid/Elder-care booked long-term routes to **M7 Placement**.

### 7.4 Pet Services *(M1 + listing)* — Phase 1
Grooming, Veterinary, Boarding, Walking, Sitting, Training, Taxi, Photography, Insurance, plus Adoption & Pet Shop. **M1 Instant** for grooming/vet-visit/walking/sitting/training. **Boarding** is day-rate (M4-style). **Adoption & Pet Shop** are catalog/listing (browse & enquire / e-commerce).

### 7.5 Construction Labour *(M2 Crew + M3 Quote)* — Phase 1
The flagship consult-first group. **Day-trades → M2 Crew:** Helper, Mason, Shuttering Carpenter, Bar-Bending, Concrete, Tile Worker, Painter, Demolition, Welding, Fabrication, Scaffolding, Road & Civil, Waterproofing worker — all priced *Per Day* (₹600–2,200), count and duration set by survey. **Professionals & finish work → M3 Quote:** Interior Designer, Architect, Civil Engineer, Quantity Surveyor, Site Supervisor, Project Manager, False Ceiling, Glass/Aluminium, UPVC, Flooring — no catalog price, sold as a designed/priced outcome.

### 7.6 Man Power & Support Staff *(M7 Placement + M2 Crew)* — Phase 1
Bulk/temp staffing: Cleaning & Maintenance, Logistics & Handling, Event & Catering, Drivers & Transport, Office Support, Domestic, Security, Retail Support, Industrial Support. **Intent toggle on the form decides the model:** *permanent placement → M7*, *daily-wage → M2 Crew*. Default per sub-type is in [services.md](services.md).

### 7.7 Event & Media Services *(M3 Quote)* — Phase 1
Entirely consult-first: Photography, Videography, Video/Photo Editing, Album & Printing, Decoration, Catering, DJ & Sound, Event Management, Entertainment. The catalog already carries the consult line items (*Site Visit ₹499–999*, *Event Consultation ₹999–2999*). Vendor chosen by portfolio; priced by package/scope with advance + milestones.

### 7.8 Rental Services *(M4)* — Phase 2
Inventory with an availability calendar and deposits: Event Furniture, Tent/Shamiana, Lighting, Sound, Décor, Catering Equipment, Construction Equipment, Home Appliances, Furniture, Camera, Tools & Machinery, Cooling/Heating. Rent per unit/day or /month per the catalog.

### 7.9 Rooms / PG / Hostel / Hotels *(M5)* — Phase 2
Accommodation listings with rich filters (sharing, AC, food, gender, budget, area): Rooms, PG, Hostels, Bed Space, Co-Living, Apartments, Rental Properties, Short Stay, Student & Worker Accommodation, Property Listing, Premium Stays. Browse → enquire → viewing → token → book.

### 7.10 Career / Job Opportunities *(M6)* — Phase 2
A job board across Retail, Healthcare, Hospitality, Office, Delivery, Factory, Construction, Technician, Transport, Security, Domestic, Driver, Sales, Support, Event, Education, IT, Finance, Beauty, Legal, HR, Real Estate, BPO, WFH, Freelance, Internship roles. Post → apply → shortlist → hire.

### 7.11 Vehicle Services (Rapido) *(M8)* — Phase 3
The real-time track: Ride Booking, Taxi, Goods & Transport, Instant Delivery, Washing, Servicing, Repair, Roadside Assistance, Rental, EV, Documents & Insurance. Live GPS matching, Google Maps, fare engine, trip history, driver wallet/daily-pass, KYC, ratings. Rental → M4-style; Documents & Insurance → M3 Quote.

---

## 8. Cross-cutting features

### 8.1 Money & payments
- **Razorpay** across every paid flow (Phase 2). **MSG91 OTP** for phone verification (Phase 2).
- **Record money from day one** — every booking, consult fee, estimate, milestone and payout is ledgered even before the gateway is live.
- **Consult fee** (M2/M3), **visit charge** (M1), **advance + milestones** (M3), **day/attendance settlement** (M2), **rent + deposit** (M4), **token** (M5), **fare** (M8).
- **Platform commission** on the settled amount; contractors settle their own crew off-platform.

### 8.2 Wallet · V Coins · Referral *(Phase 2)*
- **Wallet** — top-up, refunds, payouts.
- **V Coins** — loyalty/reward points earned on bookings, redeemable against future bookings.
- **Referral** — invite → both sides rewarded (coins/wallet credit).

### 8.3 Vendor Subscription Plans & Premium Listings *(Phase 2)*
Partners can subscribe for higher visibility; listings (rentals, stays, jobs) can be promoted to premium slots.

### 8.4 Ratings & reviews (Customer Feedback)
Two-way after completion. Ratings feed the M1 dispatch ranking and M2/M3 vendor sorting.

### 8.5 Notifications
Email + WhatsApp (click-to-chat) + Push (apps, Phase 3). The 30s dispatch alert, consult accept/decline, estimate ready, milestone due, and status changes all notify.

### 8.6 AI Chatbot & AI Search *(Phase 3)*
Conversational help + smart service search across the catalog.

### 8.7 Admin dashboards *(Phase 2)*
Customizable admin; Business / Customer / Vendor / Booking / Revenue / Analytics dashboards; real-time reports; export (Excel/CSV/PDF); bulk import; settlement + GST/TDS reports; bank payment export; custom report builder; admin-configurable modules and catalog CRUD. **Admin monitors leads, it does not sit in the dispatch path.**

---

## 9. Rules that must always hold

- **A lead *is* a booking.** One status vocabulary per model, no separate "leads" table. Admin states (new/viewed/spam/closed) are flags, not statuses.
- **Booking only after OTP verify.** The server decides — never trust a phone number from the browser.
- **The 30s dispatch timer lives on the server.** The countdown the worker sees is cosmetic.
- **A worker holds at most one live offer at a time.**
- **Supply-pool rule:** a person is in exactly one pool (solo / contractor / crew-member / driver). Crew members are the contractor's roster data, not independent partners.
- **Consult fee ≠ full payment.** It's a small held commitment that's credited on booking, forfeited to the provider on customer walk-away, refunded on provider no-show.
- **The estimate is the contract.** Work follows the accepted estimate; extra scope needs Additional Work Approval.
- **Record money from day one.** Gateway is Phase 2; the ledger is not.
- **SEO-friendly slugs in URLs**, not numeric IDs.
- **Privacy:** customer sees worker name + skill + rating (not phone); worker sees the full address only *after* accepting.
- **Catalog-driven:** a new service is added by config (category → sub-category → service + unit + price + booking model), not code.

---

## 10. Tech shape (the pieces, not the vendors)

```
   Customer · Partner · Admin   (Phase 1–2 web · Phase 3 apps)
                    │
            One versioned REST API   (/api/v1/)
                    │
   ┌────────────────┼─────────────────┐
 Database        Cache / Realtime    File storage
 (source of      (OTP store, 30s     (worker docs,
  truth)          timers, live        gallery, listings)
                  tracking, fare)
                    │
          External services
   (MSG91 OTP · Razorpay · WhatsApp · Push · Google Maps · Email)
```

- **API** — every action through one versioned REST API.
- **Database (SQL)** — single source of truth: users, partners, catalog, bookings, consults, estimates, status logs, the 30s offer ledger, wallet/coins, earnings, ratings.
- **Cache / realtime** — OTP store, server-side 30s timers, live admin monitor, Rapido GPS + fare (Phase 3).
- **File storage** — worker documents, galleries, listing photos.
- **External** — MSG91 (OTP), Razorpay (payments), WhatsApp, Push, Google Maps (Rapido), Email.

*(Specific frameworks are an implementation choice, deliberately left open.)*

---

## 11. Definition of done, per phase

- **Phase 1 —** Backend + SQL schema + REST APIs + Customer/Partner/Admin **web**, with working booking engines for **M1, M2, M3, M7** across the 7 groups (Technician, Beautician, Home, Pet, Construction Labour, Man Power, Event & Media). Consult-first engine (Smart Inspection, Digital Estimation, Vendor Quote, Additional Work Approval, Vendor Dashboard, Warranty) built. No payments/OTP/apps; not public.
- **Phase 2 —** M4, M5, M6 built; Razorpay + MSG91 OTP + Wallet + V Coins + Referral + Subscriptions/Premium + full Admin. Whole web platform integrated on staging; still not public.
- **Phase 3 —** Customer App + Partner App + **Rapido (M8)** + AI Chatbot; single combined go-live of all 11 categories, web + apps; full handover.

See [project_milestones.md](../project_milestones.md) for payments, acceptance criteria, and handover deliverables.
