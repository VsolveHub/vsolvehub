# V Solve Hub — Service Catalog (annotated)

> The complete catalog from *V Solve Hub — Categories & Sub Categories*, cleaned up and **tagged with the booking model** each service uses. This is the build reference: every service here maps to one of the 8 booking models defined in [PRD.md §5](PRD.md). Prices are the client's ranges (₹); `Unit` is how the line is priced.

**Booking-model legend** (full definitions in [PRD.md](PRD.md)):

| Tag | Model | Meaning |
| --- | --- | --- |
| **M1** | Instant Fixed-Price | Catalog price, book now, visit charge, push-dispatch |
| **M2** | Consult-First → Crew | Consult fee → survey → workers×days estimate → day-wise work |
| **M3** | Consult-First → Quote | Consult fee → assess → lump-sum quote → advance + milestones |
| **M4** | Rental / Inventory | Pick item → dates → rent + deposit |
| **M5** | Listings / Enquiry | Browse → enquire → viewing → token → book |
| **M6** | Job Board | Post → apply → shortlist → hire |
| **M7** | Placement / Staffing | Request → shortlist → trial → engage |
| **M8** | Rapido / Real-time | Live GPS, fare engine, real-time dispatch |

**Phase legend:** P1 = Phase 1 · P2 = Phase 2 · P3 = Phase 3.

---

## 1. Construction Labour — *P1*
**Purpose:** supply skilled/unskilled construction manpower and construction professionals for building work. **The customer is the builder.**
**Model:** day-trades → **M2 Crew** (priced *Per Day*, count & duration set by a contractor survey); professionals & finish work → **M3 Quote** (no catalog price — sold as a designed/priced outcome).

### Helper — M2 · ₹700–900/day
Site Cleaning · Material Shifting (Sand/Cement/Bricks) · Loading & Unloading · Water Curing · Concrete Mixing Support · Debris Removal · Tools Handling · General Work Support
*Unskilled site support — the "extra hands" a job needs.*

### Mason — M2 · ₹900–1,800/day
Brick Work · Block Work · Plastering · Tile Fixing · Stone Work (₹1,000–1,800) · Concrete Work · Repair Work · Compound Wall Construction (₹1,000–1,800) · Drain Construction (₹1,000–1,800) · PCC Work
*Core masonry — the skilled backbone of any construction site.*

### Shuttering Carpenter — M2 · ₹900–1,500/day
Footing / Column / Beam / Staircase / Retaining-Wall Shuttering · Slab Centering · Formwork Dismantling · Scaffolding Support
*Formwork for concrete pours.*

### Bar Bending (Steel Work) — M2 · ₹900–1,400/day
Steel Cutting / Bending / Binding · Footing / Column / Beam / Slab / Staircase Reinforcement
*Reinforcement steel — the skeleton before concrete.*

### Concrete Labour — M2 · ₹600–900/day
Concrete Mixing / Pouring · Vibrator Support · Surface Levelling · Concrete Finishing · Water Curing
*The pour-day crew.*

### Tile Worker — M2 · ₹700–1,800/day
Floor / Wall / Bathroom / Kitchen Tile Fixing · Granite & Marble Fixing (₹1,000–1,800) · Tile Repair · Grouting (₹700–1,200)
*Finish tiling and stone.*

### Painter — M2 · ₹700–1,800/day
Interior / Exterior Painting · Wall Putty · Primer · Texture Painting (₹900–1,800) · Polish · Waterproof Coating (₹900–1,800) · Enamel
*Day-rate painting labour (a whole-home repaint contract is M3).*

### Demolition Labour — M2 · ₹600–1,200/day
Wall / Concrete / Floor / Roof Breaking · Debris & Waste Removal · Site Cleaning
*Controlled teardown and clearing.*

### Welding Worker — M2 · ₹1,000–1,800/day
Gate / Steel-Structure / Railing / Grill / Fabrication Welding
### Fabrication Worker — M2 · ₹1,000–2,200/day
Steel / Shed / Structural / Industrial Fabrication
### Scaffolding Worker — M2 · ₹800–1,300/day
Erection / Dismantling / Maintenance
### Road & Civil Worker — M2 · ₹900–1,800/day
Paver Block · Drainage · Road Repair · Culvert Work
### Waterproofing Worker — M2 · ₹1,000–2,200/day
Terrace / Bathroom / Wall / Basement Waterproofing
*(As day-labour → M2. As a whole-area "waterproof my terrace for a price" job → M3 Quote.)*

### Professionals & finish work → **M3 Quote** (no catalog price)
- **Interior Designer** — Home / Office / Modular Kitchen / Wardrobe / False Ceiling / 3D design · Consultation
- **Architect** — House Plan · Building Plan Approval · 2D Floor Plan · 3D Elevation · Structural Drawing
- **Civil Engineer** — Site Inspection · Estimation & Costing · Project Planning
- **Quantity Surveyor** — BOQ Preparation · Quantity Estimation · Billing Support
- **Site Supervisor** — Daily Site Supervision · **Project Manager** — Turnkey Project Management
- **False Ceiling** — Gypsum / POP / PVC · **Glass & Aluminium** — Toughened Glass / Partition / ACP Cladding
- **UPVC** — Doors / Windows · **Flooring** — Wooden / Vinyl / Epoxy
*Sold as designed, priced outcomes with advance + milestones.*

---

## 2. Technician Services — *P1*
**Purpose:** at-home break-fix & installation for electrical, plumbing, appliances and electronics.
**Model:** **M1 Instant** — a *Basic Visit Charge* (₹99–149) + per-job catalog prices. **Big installations flagged *Project* → M3 Quote** (Full CCTV Setup, Smart Home Setup, Solar, Lift, Network Setup, Fire Alarm/Sprinkler).

### Electrician — M1 · Visit ₹99
Repairs (switch/socket/board/fan ₹99–349) · Installations (fan, lights, chandelier ₹499–2,999, DB board, MCB, inverter/UPS/generator) · Wiring (new/old/concealed *per sqft* ₹40–100; conduit/cable *per rft*) · Motor & pump connections · Fault fixing (short-circuit, voltage, trip). **New/old wiring is measured per sqft — quote on measure.**

### Plumbing — M1 · Visit ₹99
Repairs (tap/pipe/shower/flush/drain ₹149–999) · Installations (tap/WC/basin/sink/geyser ₹149–1,500) · Pipeline work *per rft* (₹40–300) · Tank/bore connections · **Full Bathroom Plumbing / Fitting Setup ₹999–5,000 (survey → M3 if large).**

### Carpenter — M1 · Visit ₹99
Door/window/cupboard repair · Installations (door, window, shelf, TV unit, cabinet) · Assembly (bed/table/chair) · Polishing/laminate *per sqft*. **Modular Kitchen Installation ₹2,000–15,000 → M3 Quote.**

### AC Technician — M1 · Visit ₹149
Split/Window install (₹999–2,999) · Service / Deep clean / Jet wash · Gas filling · Cooling & leakage repair · **AC Shifting ₹1,999–4,999.**

### RO Technician — M1 · Visit ₹149 · Install/Service/Filter/Repair (₹299–1,500)
### Internet & WiFi Technician — M1 · Visit ₹99 · Router/WiFi/LAN/Network/Range/AP (₹199–2,999)
### Gas Stove Technician — M1 · Visit ₹99 · Repair/Leak/Pipeline/Regulator/Burner/Ignition (₹149–1,999)
### Computer & Laptop Technician — M1 · Visit ₹149 · OS/Software/Virus/Format/RAM/SSD/Screen/Board/Data-recovery (₹199–10,000)
### Mobile Technician — M1 · Visit ₹149 · Screen/Battery/Charging/Speaker/Camera/Water/Flashing (₹199–5,000)
### CCTV & Security Technician — M1/**M3** · Visit ₹149 · Camera install (₹899–1,500), DVR/NVR, wiring, biometric, video door phone. **Full CCTV Setup ₹3,000–25,000 → M3 Quote.**
### Locksmith — M1 · Visit ₹149 · Lock repair/install, key duplication, unlock, digital/smart lock (₹99–7,999)
### Home Automation & Sound — M1/**M3** · Visit ₹149 · Smart switch, home theatre, speaker, Alexa, smart curtain. **Smart Home Setup ₹1,999–25,000 → M3 Quote.**
### Fire Safety Technician — M1/**M3** · Visit ₹149 · Extinguisher, alarm, sprinkler, inspection, refilling. **Alarm/Sprinkler systems → M3 Quote.**
### Solar Technician — **M3** · Panel Installation / Maintenance / Cleaning
### Lift Technician — **M3** · Elevator Installation / Repair
### Watch Repair — M1 · Battery/Strap/Dial/Glass/Crown/Servicing/Smart-watch repair

---

## 3. Beautician Services — *P1*
**Purpose:** at-home salon & wellness.
**Model:** **M1 Instant** — *Basic Visit Charge* (₹99–299) + fixed service prices. **Bridal Packages → M3 Quote.**

- **Face Care (Facial & Cleanup)** — M1 · Visit ₹99 · Cleanup/Facials (basic→diamond), treatments, skin polishing (₹299–3,999)
- **Bleach & Detan** — M1 · Visit ₹99 · Face/Neck/Full-body bleach & detan (₹149–2,999)
- **Waxing** — M1 · Visit ₹99 · Arms/Legs/Underarms/Full-body/Bikini/Face; Normal/Rica/Chocolate wax (₹149–1,999)
- **Threading** — M1 · Visit ₹99 · Eyebrow/Lip/Forehead/Chin/Full-face (₹49–399)
- **Hair Services (Full Range)** — M1 · Visit ₹99 · Cut/Trim/Style/Blow-dry; Color/Highlights/Balayage/Ombre; Spa/Treatments; Smoothening/Straightening/Keratin/Botox/Rebonding/Extensions (₹149–50,000)
- **Manicure & Pedicure** — M1 · Visit ₹99 · Basic/Spa mani-pedi, foot spa, gel polish, nail art (₹199–1,499)
- **Makeup (Full Range)** — M1 · Visit ₹199 · Light/Party/Engagement/Bridal/HD/Airbrush/Reception (₹999–40,000)
- **Mehendi (Henna)** — M1 · Visit ₹199 · Simple/Arabic/Full-hand/Bridal/Leg (₹199–10,000)
- **Body Care** — M1 · Visit ₹99 · Polishing/Scrub/Massage/Detan (₹999–3,999)
- **Advanced Skin Care** — M1 · Visit ₹199 · Acne/Pigmentation/Glow/Anti-aging/Hydra-facial/Chemical-peel (₹999–10,000)
- **Bridal Packages** — **M3** · Consultation ₹299 · Pre-Bridal (₹5k–15k) · Bridal Full (₹10k–40k) · Engagement (₹5k–15k) · Bridesmaid (₹2k–10k) — curated multi-service packages, priced after consult.

---

## 4. Event & Media Services — *P1*
**Purpose:** everything for events & content — shot, edited, decorated, catered, sounded, planned, performed.
**Model:** **M3 Quote** across the board. Vendor chosen by portfolio; the catalog already carries consult line items (*Site Visit ₹499–999*, *Event Consultation ₹999–2,999*). Priced by package/scope with advance + milestones.

- **Photography** — Event/Birthday/Wedding/Pre-Wedding/Engagement/Reception; Baby/Kids/Maternity/Family/Portfolio; Product/Food/Real-Estate/Corporate; Candid/Traditional (₹1,500–80,000)
- **Videography** — Event/Wedding/Pre-Wedding/Engagement; Drone; Corporate/YouTube/Reels/Short-film/Documentary/Promo/Real-estate/Product/Cinematic (₹1,000–100,000)
- **Video Editing** — Basic/Advanced/Wedding-highlight/Full-film/Reels/YouTube/Color-grade/Motion-graphics/Subtitle/Promo (₹500–50,000)
- **Photo Editing** — Basic/Advanced/Album/Retouch/Color/Background/Enhance/AI-restoration (₹50–15,000)
- **Album & Printing** — Wedding/Birthday/Premium/Digital album; Photo/Frame/Canvas printing; Photo-book (₹10–30,000)
- **Decoration** — Consultation ₹499–999 · Birthday/Balloon/Wedding/Engagement/Reception/Haldi/Sangeet/Stage/Flower/Theme/Baby-shower/Corporate (₹1,000–200,000)
- **Catering** — Veg/Non-veg/Buffet/Snacks/Full-meal/Live-counter/Outdoor/Corporate (*per plate* ₹100–1,200; counters ₹5k–20k)
- **DJ & Sound** — Consultation ₹499–999 · DJ/Sound/Stage-sound/Lighting/Smoke/Live-band/LED-wall/Laser (₹2,000–100,000)
- **Event Management** — Consultation ₹999–2,999 · Full/Wedding/Birthday/Corporate/Coordination/Anchor/Celebrity/Destination (₹5,000–1,000,000)
- **Entertainment** — Magician/Dance/Singer/MC/Kids/Fireworks/Games/Mimicry/Stand-up (₹3,000–50,000)

---

## 5. Man Power & Support Staff — *P1*
**Purpose:** bulk & temporary staffing.
**Model:** **intent toggle decides** — *permanent placement → M7*, *daily-wage → M2 Crew*. Default per row below.

| Sub-category | Default | Roles |
| --- | --- | --- |
| Cleaning & Maintenance Staff | **M2 daily** (M7 permanent) | Housekeeping, Office cleaning, Janitors, Deep-clean teams, Maintenance, Pest helpers |
| Logistics & Handling | **M2 daily** | Loading, Unloading, Packers/Movers, Delivery helpers, Warehouse, Material handling |
| Event & Catering Staff | **M2 daily** | Catering boys/girls, Waiters, Kitchen helpers, Setup, Serving, Decoration helpers |
| Drivers & Transport Staff | **M7 permanent** (M2 temp) | Car/Truck/Tempo/Bus, Temporary, Permanent drivers |
| Office Support Staff | **M7 permanent** | Office boys/assistants, Data entry, Receptionists, File mgmt, Front office |
| Domestic Staff | **M7 permanent** | Maids, Cooks, Babysitters, Elder care, House helpers, Patient attendants |
| Security Staff | **M7 permanent** (M2 event) | Guards, Bouncers, Watchmen, Gate, Event security |
| Retail Support Staff | **M7 permanent** | Sales boys/girls, Store helpers, Cash counter |
| Industrial Support Staff | **M2 daily** | Factory helpers, Packing, Assembly-line, Production helpers |

---

## 6. Home Services — *P1*
**Purpose:** the widest home-care group — cleaning to care.
**Model:** **M1 Instant** for standard jobs; **M3 Quote** for survey jobs; **M7 Placement** for long-term care/maid.

- **Home Cleaning** — M1 · Basic/Deep/Move-in-out/Villa/Apartment/Office; Kitchen/Bathroom/Balcony/Terrace/Window/Glass/Fan/Wall deep-clean; Floor scrub, Marble polish, Tile clean *(large villa deep-clean → M3)*
- **Sofa & Carpet Cleaning** — M1 · Sofa shampoo, Carpet, Curtain, Mattress, Upholstery
- **Pest Control** — M1 · Cockroach/Termite/Bed-bug/Mosquito/Ant/Rat/Lizard/General
- **Water Tank Cleaning** — M1 · Overhead/Underground/Sump
- **Borewell Services** — **M3** · Cleaning/Repair/Motor installation *(needs survey)*
- **Septic Tank Services** — **M3** · Septic/Drain/Sewer-line cleaning *(needs survey)*
- **Laundry Services** — M1 · Washing/Ironing/Dry-clean/Steam/Shoe/Bag
- **Home Shifting** — **M3** · House/Packing/Unpacking/Loading/Furniture/Office shifting *(survey → quote)*
- **Storage Services** — M4-style · Household/Office/Warehouse storage
- **Gardening** — M1 · Garden clean/Lawn/Plant/Tree/Landscape
- **Swimming Pool Services** — M1/M3 · Cleaning/Maintenance/Water-treatment
- **Chimney & Exhaust** — M1 · Chimney/Kitchen-exhaust cleaning
- **Home Organization** — M1 · Wardrobe/Kitchen/Store-room/Declutter
- **Elder Care** — **M7** · Attendant/Companion/Bedridden/Babysitter/Newborn/Nanny
- **Maid Services** — **M7** · Full/Part-time maid, Cook, Housekeeping, Live-in
- **Home Inspection** — **M3** · Property/Pre-purchase/Rental inspection
- **Home Maintenance** — **M3** · AMC / Emergency service / Handyman

---

## 7. Pet Services — *P1*
**Purpose:** full pet care & commerce.
**Model:** **M1 Instant** for services; **listing/e-commerce** for adoption & shop; boarding is day-rate.

- **Pet Grooming** — M1 · Dog/Cat grooming, Bath & spa, Trim, Nails, Ears, Teeth
- **Veterinary** — M1 · Check-up, Vaccination, Emergency, Surgery consult, Deworming
- **Pet Boarding** — M4-style · Dog/Cat boarding, Day care *(per day)*
- **Pet Walking / Sitting / Training** — M1 · Dog walking, Home sitting, Dog/Puppy training
- **Pet Taxi** — M1/M8 · Pickup & drop
- **Pet Adoption** — Listing · Dog/Cat adoption
- **Pet Shop** — E-commerce · Food/Accessories/Toys/Medicines
- **Pet Photography** — M3 · Photoshoot · **Pet Insurance** — M3 · Insurance assistance

---

## 8. Rental Services — *P2*
**Purpose:** rent equipment & goods with availability & deposits.
**Model:** **M4 Rental** — pick item → dates → rent + refundable deposit → deliver → return.

- **Event Furniture** — Chairs/Sofas/Tables/Stage-sofa/Bar-counter (*unit or set / day*, ₹10–10,000)
- **Tent / Shamiana** — 10×10→100×50 ft tents, Dome, Pagoda (*per day*, ₹1,000–100,000)
- **Lighting** — LED/Focus/Decorative/Serial/Flood/Stage/Moving-head/Laser/LED-wall (*per day*)
- **Sound System** — Speakers/Line-array/Sub/Mic/Amp/DJ/Mixer (*per day*)
- **Décor Items** — Balloon/Props/Photo-booth/Cutouts/Panels/Gate/Selfie-point/LED-board/Red-carpet
- **Catering Equipment** — Vessels/Dishes/Buffet-tables/Plates/Dispenser/Stove/Freezer/Counter
- **Construction Equipment** — Mixer/Vibrator/Scaffolding/Centering/JCB/Drill/Trowel/Generator (*day/hour*)
- **Home Appliance** — Fridge/Washer/TV/AC/Cooler/Purifier/Microwave (*per month*)
- **Furniture (Home/Office)** — Sofa/Bed/Mattress/Wardrobe/Chairs/Tables/Workstation (*per month*)
- **Camera & Media** — DSLR/Lens/Video-cam/Tripod/Gimbal/Drone/Action-cam/Light (*per day*)
- **Tools & Machinery** — Drill/Cutter/Grinder/Welding/Power-tools/Compressor/Washer/Ladder (*per day*)
- **Cooling / Heating** — Cooler/AC/Industrial-fan/Heater/Blower/Mist-fan (*per day*)

---

## 9. Rooms / PG / Hostel / Hotels — *P2*
**Purpose:** accommodation discovery & booking.
**Model:** **M5 Listings** — browse (filters: sharing, AC, food, gender, budget, area) → enquire → viewing → token → book.

Rooms (single→family, furnished/AC variants) · PG (gents/ladies/students/professionals, food & sharing variants) · Hostels · Bed Space · Co-Living · Apartments (1RK→4BHK, furnished variants) · Rental Properties (house/villa/farm/commercial/office/shop/godown) · Short Stay (daily/weekly/monthly/hourly/guest-house) · Student Accommodation · Worker Accommodation · Property Listing (for-rent posts) · Premium Stays (luxury/executive/corporate).

---

## 10. Career / Job Opportunities — *P2*
**Purpose:** a job board connecting seekers & employers. **No dispatch — reuses profile + notifications only.**
**Model:** **M6 Job Board** — post → apply → shortlist → hire.

Retail & Shop · Health Care · Hotels & Restaurant · Office & Admin · Delivery & Logistics · Factory & Industrial · Construction · Technician · Vehicle & Transport · Security · Domestic · Driver · Sales & Marketing · Customer Support · Event & Promotion · Event & Media · Education · Cleaning & Maintenance · IT & Software · Finance & Accounts · Beauty & Wellness · Business Services · Banking & Insurance · Legal · HR & Recruitment · Real Estate · BPO & Call Center · Work From Home · Freelance · Internship.

---

## 11. Vehicle Services (Rapido) — *P3*
**Purpose:** the real-time mobility & logistics product.
**Model:** **M8 Real-time** (live GPS, Google Maps, fare engine, driver KYC/wallet/daily-pass, trip history, ratings). Rental → M4-style; Documents & Insurance → M3 Quote.

- **Ride Booking** — M8 · Bike/Auto/Taxi/Premium/EV
- **Taxi Services** — M8 · Local/Airport/Outstation/Hourly/Full-day/SUV/Innova/Tempo/Corporate/Wedding
- **Goods & Transportation** — M8 · Tata-Ace/Pickup/Mini-truck/Truck/Tempo/Bus/Water-tanker/House & office shifting/Material/Furniture/Machinery
- **Instant Delivery** — M8 · Parcel/Document/Medicine/Grocery/Food/Flower/Fruits/Veg/Water/Milk/Small-package
- **Vehicle Washing** — M1/M8 · Bike/Car wash, Foam, Interior/Exterior, Vacuum, Polish, Detailing, Coating
- **Vehicle Servicing** — M1/M8 · Inspection/Service/Oil/Filter/AC/Battery/Alignment/Balancing/Checkup
- **Vehicle Repair** — M1/M3 · Engine/Clutch/Brake/Suspension/Electrical/Radiator/AC/Gearbox/Denting-painting *(big repairs → M3 Quote)*
- **Roadside Assistance** — M8 · Breakdown/Emergency/Battery/Puncture/Tyre/Fuel/Key/Towing/Accident recovery
- **Vehicle Rental** — M4 · Bike→Bus/Truck, Self-drive/With-driver, Luxury/Wedding/EV
- **EV Services** — M1/M8 · Battery/Charging/Motor/Controller/Mobile-charging/Towing/Charger-install
- **Vehicle Documents & Insurance** — **M3** · New/Renewal insurance, Claim, RC transfer, Fitness/Pollution/Permit, Loan closure, Challan

---

> **Note on scope (from the client's catalog):** categories, sub-categories and services here are the current project scope. The architecture must stay flexible so new categories, services, fields, forms or workflows can be added later by config without breaking the core.
