# VSolveHub — Demo Service Catalog

> **What this is:** the exact set of services the demo website ships with, organized for
> **seamless discovery**. This is the source of truth that `prisma/seed.ts` loads into the
> database.
>
> **Companion doc:** [`plan.md`](plan.md) — architecture & folder structure.

---

## 1. At a glance

**8 categories · 51 sub-categories · 849 services.** Every service is browsable and
searchable. Whether it can be *booked end-to-end* depends on its **booking type** (below).

| # | Category | Sub-cats | Services | ID range | Booking type | Demo status |
|---|---|---|---|---|---|---|
| 1 | **Technician Services** ⚡ | 13 | 176 | 2001–2999 | Dispatch (A) | ✅ **Full booking + live tracking** |
| 2 | **Beautician & Wedding** 💄 | 11 | 98 | 3001–3999 | Dispatch (A) | ✅ **Full booking + live tracking** |
| 3 | **Construction Labour** 🧱 | 13 | 85 | 1001–1999 | Crew dispatch (B) | ✅ **Full booking (crew)** |
| 4 | **Manpower & Support** 🧹 | 10 | 54 | 9001–9999 | Mixed (A cleaning / C staffing) | ◑ Cleaning bookable · staffing = enquiry |
| 5 | **Vehicle Services** 🛺 | 11 | 133 | 6001–6999 | Mixed (A service/wash / D rental) | ◑ Service/wash bookable · rental = enquiry |
| 6 | **Events & Media** 📸 | 10 | 109 | 4001–4999 | Quote (F) | ◐ Browse + enquiry form |
| 7 | **Equipment Rental** 🪑 | 12 | 101 | 5001–5999 | Rental (D) | ◐ Browse + enquiry form |
| 8 | **Rooms / PG / Hostel** 🏠 | 11 | 93 | 7001–7999 | Property (E) | ◐ Browse + enquiry form |

**Legend:**
- ✅ **Dispatch (A/B)** — full Phase-1 flow: fast booking → auto-match an online captain →
  30s accept → live status tracking. *These are the stars of the demo.*
- ◑ **Mixed** — within the category, hands-on tasks dispatch; placement/rental items are enquiry.
- ◐ **Enquiry (C/D/E/F)** — browse the catalog, submit a lead/enquiry form; no live
  dispatch in Phase 1 (these flows are *designed in the schema, built in Phase 2*).

> **Why keep all 8 even though only 1–3 are "fully live"?** Discovery is the headline UX.
> A rich, real-looking catalog makes search, categories, and browsing feel like a real
> super-app. The enquiry categories still capture leads — nothing is a dead end.

---

## 2. Discovery aids (what makes finding a service instant)

**Quick chips (home + search):** one tap to the most-wanted services.
`AC Service · Electrician · Plumber · House Cleaning · Bridal Makeup · Car Wash · House Shifting · CCTV Installation`

**Popular searches (seeded):**
`electrician`, `plumber`, `ac service`, `house cleaning`, `bridal makeup`, `haircut`,
`car wash`, `bike service`, `house shifting`, `cctv`, `ro service`, `pest control`,
`carpenter`, `mehendi`, `generator rental`, `pg near me`.

**Search tags (per service, for fuzzy/typo-tolerant matching):** each service carries
tags (e.g. *AC Service* → `ac, air conditioner, cooling, service, repair`) so a customer
who types "ac repair" or "cooling not working" still lands on it.

**Browse path (≤ 3 taps):** Home → Category → Sub-category pill → Service card → Book.

---

## 3. Category breakdown

> Each sub-category lists representative services. Full lists are seeded from the catalog;
> counts are exact.

### 1. Technician Services ⚡ — *primary demo category* (176 services)

| Sub-category | Representative services |
|---|---|
| Electrician | Switch/Socket Repair, Fan Installation, House Wiring, MCB/DB Board, Inverter Setup, Short Circuit Fix |
| Plumbing | Tap Repair, Pipe Leakage Fix, Drain Block Removal, WC/Basin Installation, Motor Repair |
| Carpenter | Door/Window Repair, Lock Fitting, Furniture Assembly, Modular Kitchen, Wood Polishing |
| AC Technician | Split/Window AC Install, AC Service, Deep Cleaning, Gas Filling, Cooling Repair |
| RO Technician | RO Install, RO Service, Filter Replacement, RO Repair |
| Internet & WiFi | Router Setup, WiFi Config, LAN Wiring, Range Extender |
| Gas Stove | Stove Repair, Leak Fix, Pipeline Install, Burner Service |
| Computer & Laptop | OS/Software Install, Virus Removal, RAM/SSD Upgrade, Screen Replacement |
| Mobile Technician | Screen/Battery Replacement, Charging Repair, Water Damage |
| CCTV & Security | CCTV Install, DVR/NVR Setup, Mobile Viewing, Biometric, Video Door Phone |
| Locksmith | Lock Repair/Install, Key Duplication, Digital/Smart Lock |
| Home Automation & Sound | Smart Switch, Home Theatre, Alexa Integration, Smart Curtain |
| Fire Safety | Extinguisher Install, Fire Alarm, Sprinkler, Safety Inspection |

### 2. Beautician & Wedding 💄 (98 services)

| Sub-category | Representative services |
|---|---|
| Face Care (Facial & Cleanup) | Cleanup, Gold/Diamond/Pearl Facial, Anti-Aging, Whitening |
| Bleach & Detan | Face/Neck/Full-Body Bleach & Detan |
| Waxing | Arms/Legs/Underarms/Full Body, Rica & Chocolate Wax |
| Threading | Eyebrow, Upper Lip, Full Face |
| Hair Services | Cut, Color, Highlights, Spa, Smoothening, Keratin, Rebonding |
| Manicure & Pedicure | Basic/Spa Mani-Pedi, Foot Spa, Gel Polish, Nail Art |
| Makeup | Party, Engagement, Bridal, HD, Airbrush |
| Mehendi (Henna) | Simple, Arabic, Bridal, Leg Mehendi |
| Body Care | Polishing, Scrub, Massage, Full-Body Detan |
| Advanced Skin Care | Acne/Pigmentation Treatment, Hydra Facial, Chemical Peel |
| Bridal Packages | Pre-Bridal, Bridal Full, Engagement, Bridesmaid |

### 3. Construction Labour 🧱 — *crew dispatch* (85 services)

| Sub-category | Representative services |
|---|---|
| Helper | Site Cleaning, Material Shifting, Loading/Unloading, Curing |
| Mason | Brick/Block Work, Plastering, Tile Fixing, Compound Wall |
| Shuttering Carpenter | Column/Beam/Slab Shuttering, Formwork |
| Bar Bending (Steel) | Steel Cutting/Bending/Binding, Reinforcement |
| Concrete Labour | Mixing, Pouring, Finishing, Curing |
| Tile / Painter / Demolition | Floor/Wall Tiling; Interior/Exterior Painting; Wall/Concrete Breaking |
| Welding / Fabrication / Scaffolding | Gate/Grill Welding; Steel Fabrication; Scaffolding Erection |
| Road & Civil / Waterproofing | Paver Blocks, Drainage; Terrace/Bathroom Waterproofing |

### 4. Manpower & Support 🧹 (54 services) — *cleaning bookable, staffing = enquiry*

| Sub-category | Type | Representative services |
|---|---|---|
| Cleaning & Maintenance | ✅ dispatch | Housekeeping, Office Cleaning, Deep Cleaning, Pest Control Help |
| Domestic Staff | ◐ enquiry | Maids, Cooks, Babysitters, Elder Care, Patient Care |
| Drivers & Transport Staff | ◐ enquiry | Car/Truck/Tempo/Bus Drivers, Temp/Permanent |
| Security Staff | ◐ enquiry | Guards, Bouncers, Watchmen, Event Security |
| Event & Catering Staff | ◐ enquiry | Waiters, Kitchen Helpers, Serving Staff |
| Logistics / Office / Retail / Industrial Support | ◐ enquiry | Loaders, Office Boys, Sales Staff, Factory Helpers |

### 5. Vehicle Services 🛺 (133 services) — *service/wash bookable, rental = enquiry*

| Sub-category | Type | Representative services |
|---|---|---|
| Vehicle Washing & Cleaning | ✅ dispatch | Bike/Car Wash, Foam Wash, Interior Cleaning, Detailing, Coating |
| Vehicle Servicing | ✅ dispatch | Bike/Car Service, Oil Change, AC Service, Wheel Alignment |
| Vehicle Repair | ✅ dispatch | Engine/Brake/Clutch/Battery/AC Repair, Denting & Painting |
| Roadside Assistance | ✅ dispatch | Breakdown, Jump Start, Puncture, Towing, Fuel Delivery |
| Instant Delivery | ✅ dispatch | Parcel, Documents, Medicine, Grocery |
| Ride / Taxi / Goods Transport | ◑ | Bike/Auto/Taxi Ride, Outstation, House/Office Shifting |
| Vehicle Rental / EV / Documents | ◐ enquiry | Self-drive & With-driver Car, Bike Rental; EV Services; Insurance/RC |

### 6. Events & Media 📸 (109 services) — *quote / enquiry*

Photography · Videography · Video Editing · Photo Editing · Album & Printing · Decoration ·
Catering · DJ & Sound · Event Management · Entertainment. *(Wedding/Pre-wedding shoots,
decor, catering, DJ, full event management — browse portfolio, submit enquiry for a quote.)*

### 7. Equipment Rental 🪑 (101 services) — *rental / enquiry*

Event Furniture · Tent/Shamiana · Lighting · Sound System · Décor Items · Catering
Equipment · Construction Equipment · Home Appliances · Furniture (Home/Office) · Camera &
Media Gear · Tools & Machinery · Cooling/Heating. *(Browse items with per-day price &
deposit; submit a rental enquiry with date range.)*

### 8. Rooms / PG / Hostel 🏠 (93 services) — *property / enquiry*

Rooms · PG Accommodation · Hostels · Bed Space · Co-Living · Apartments · Rental
Properties · Short Stay · Student Accommodation · Worker Accommodation · Property Listing ·
Premium Stays. *(Browse listings by sharing/gender/budget; submit a viewing/booking enquiry.)*

---

## 4. What each service record stores

For seeding consistency, every service has:

| Field | Example | Notes |
|---|---|---|
| `id` | `2004` | Stable numeric ID inside the category range |
| `slug` | `ac-general-service` | SEO URL: `/services/technician/ac-general-service` |
| `name` | `AC General Service` | Display name |
| `category` | `technician` | Links to `service_categories` |
| `sub_category` | `AC Technician` | Links to `service_sub_categories` |
| `price_display` | `From ₹499/visit` | Human-readable |
| `price_min` / `price_max` | `49900` / `null` | Integer **paise** |
| `unit` | `per_visit` | per_visit · per_day · per_hour · on_request |
| `archetype` | `A` | A/B = dispatch · C–F = enquiry |
| `tags` | `ac, cooling, service, repair` | Powers fuzzy search |
| `icon` | `ac` | From the inline SVG set |

---

## 5. Serviced cities (for local discovery)

Seeded so search/area filtering and "near me" feel real:
**Hyderabad, Warangal, Karimnagar, Khammam, Nizamabad, Vijayawada, Guntur, Nalgonda.**
(Captains are seeded across these cities with skills + service areas so dispatch matching works.)
