# VSolveHub — Delivery Milestones & Timeline

**Goal:** Take all 11 service categories (from `V Solve Hub-Categories & Sub Categories.csv`) from prototype to production-live in **~4 months: July 1 → Oct 30, 2026**.

**Approach:** The 11 categories collapse into a handful of shared *fulfillment engines*. We build an engine once, then categories that share it ship together in the same milestone. Grouping related categories per milestone means the client reviews **one pattern once** instead of re-opening the same change requests on every category — fewer demos, fewer rebuild loops.

---

## Status so far

- **Prototype built (Days 1–15):** platform core flow, partner dashboard (full flow), and booking flow (individual + team) for Electrician — **prototype only**, no production backend or payment integration yet.
- **Milestone 0 (core platform)** was demoed to the client as a prototype and signed off conceptually.
- Remaining for these: convert to production + enhance UI (folded into M1).

> The prototype already proves the two hardest, most-reused engines: **on-demand fixed-price booking** and **team/crew booking**. Everything downstream reuses them.

---

## 🟢 Milestone 1 — Production Core + On-Demand Fixed-Price Services
**Jul 1 → Jul 28, 2026**

> First real production app. Everything downstream reuses this foundation — the make-or-break milestone.

**Build:**
- Convert prototype → production application
- Payment + escrow integration
- Real backend, wallet, refunds
- Updated/enhanced UI

**Categories live** *(all share one engine: single provider, fixed price, instant book)*:
- 🔧 **Technician** — Electrician, Plumber, Carpenter, AC, RO, Gas Stove, Mobile, CCTV/Security, Computer/Laptop, Locksmith, Internet/WiFi, Home Automation, Fire Safety, Solar, Lift, Watch Repair
- 💄 **Beautician** — Facial, Bleach/Detan, Waxing, Threading, Hair, Mani/Pedi, Makeup, Mehendi, Body Care, Skin Care, Bridal Packages
- 🏠 **Home Services** — Cleaning, Sofa/Carpet, Pest Control, Tank/Septic, Laundry, Shifting, Gardening, Maid, Elder Care, AMC
- 🐾 **Pet Services** — Grooming, Veterinary, Boarding, Walking, Sitting, Training, Taxi, Shop

**Client checkpoint:** Full production demo + 4 live categories → sign-off on the core pattern.

**Coverage: 4 / 11**

---

## 🟠 Milestone 2 — Workforce & Project Services
**Aug 1 → Aug 30, 2026**

> Grouped because all three need **multi-person / crew / quote-negotiation**, not instant fixed-price. Reuses the team-booking engine + a generic enquiry→quote→milestone-pay engine.

**Categories live:**
- 👷 **Construction Labour** — Helper, Mason, Shuttering Carpenter, Bar Bending, Concrete, Tile, Painter, Demolition, Welding, Fabrication, Scaffolding, Road/Civil, Waterproofing, plus design/engineering roles (Interior Designer, Architect, Civil Engineer, etc.) — crew / lead-settlement model
- 🧰 **Man Power & Support Staff** — Cleaning, Logistics, Event/Catering, Drivers, Office, Domestic, Security, Retail, Industrial support staff — bulk/temp staffing (same crew engine)
- 🎥 **Event & Media** — Photography, Videography, Video/Photo Editing, Album/Printing, Decoration, Catering, DJ & Sound, Event Management, Entertainment — enquiry → quote → milestone pay

**Coverage: 7 / 11**

---

## 🔵 Milestone 3 — Listings, Inventory & Marketplace
**Sep 1 → Sep 30, 2026**

> Grouped because all three are **catalog/listing + availability/enquiry**, not "dispatch a worker." Assets, properties, and jobs share the same listing + enquiry-inbox engine.

**Categories live:**
- 📦 **Rental Services** — Event Furniture, Tent/Shamiana, Lighting, Sound, Décor, Catering Equipment, Construction Equipment, Home Appliances, Furniture, Camera/Media, Tools/Machinery, Cooling/Heating — inventory + availability calendar + deposits
- 🏨 **Rooms / PG / Hostel / Hotels** — Rooms, PG, Hostels, Bed Space, Co-Living, Apartments, Rental Properties, Short Stay, Student/Worker Accommodation, Property Listing, Premium Stays — listing + enquiry inbox
- 💼 **Career / Job Opportunities** — all job families (Retail, Healthcare, Hotels, Office, Delivery, Factory, Construction, Technician, Transport, Security, Domestic, Driver, Sales, IT, Finance, etc.) — post/apply board

**Coverage: 10 / 11**

---

## 🔴 Milestone 4 — Vehicle & Mobility Services
**Oct 1 → Oct 30, 2026**

> Standalone — heaviest, fully distinct engine (fleet, KYC, live tracking, fare). Kept alone so its complexity can't stall the other 10 categories.

**Categories live:**
- 🚗 **Vehicle Services** — Ride Booking, Taxi, Goods & Transportation, Instant Delivery (live tracking + fare engine); Vehicle Washing, Servicing, Repair, Roadside Assistance, Vehicle Rental, EV Services, Documents & Insurance

**Coverage: 11 / 11** ✅

---

## 📅 Summary

| Milestone | Window | Theme | Categories | Cumulative |
|---|---|---|---|---|
| **M1** | Jul 1–28 | Production core + fixed-price on-demand | Technician, Beautician, Home, Pet | 4/11 |
| **M2** | Aug 1–30 | Workforce & projects | Construction, Man Power, Event & Media | 7/11 |
| **M3** | Sep 1–30 | Listings, inventory & marketplace | Rentals, Accommodation, Jobs | 10/11 |
| **M4** | Oct 1–30 | Vehicle & mobility | Vehicle Services | **11/11** |

**Total ≈ 4 months (Jul 1 → Oct 30, 2026). 4 milestones, 4 client sign-offs, all 11 categories live.**

---

## ⚠️ Risk flags

- **M1 is the risk concentration** — it's the first production build *and* payment integration *and* 4 categories at once. If anything slips, it slips here. Protect this window.
- **M4 mobility** (real-time ride-hailing) is the one piece that may need a short November fast-follow if live tracking proves heavy. The non-ride parts (servicing, repair, rental, docs/insurance) are safe inside October.
- **Pace depends on engine reuse.** Each milestone groups categories on a shared engine; if scope creep forces a bespoke engine per category, the timeline expands. Hold the line on reuse.
