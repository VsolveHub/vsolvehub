# VSolveHub — Master Service Catalog

> **Version:** 1.2 | **Last Updated:** 2026-06-17
> Complete taxonomy: **11 categories → sub-categories → services**, each tagged with its
> **booking archetype** (see `conventions.md` D-21). The platform is an "everything local
> services" super-app for Tier 2/3 India — home services, skilled trades, beauty,
> construction, staffing, vehicles, events, rentals, accommodation, agriculture, and
> tutoring.
>
> **Booking model is per category, not global.** A customer books an electrician the way
> they book a Rapido captain (auto-dispatch, 30s accept); they book a PG room or a
> generator a completely different way. The archetype column tells you which flow applies.

---

## Archetype legend (`conventions.md` D-21)

| Code | Archetype | Customer experience |
|---|---|---|
| **A** | Instant / Scheduled Dispatch | "Book a captain" — auto-dispatched to nearest verified worker, 30s accept |
| **B** | Crew / Daily-wage Dispatch | Pick date + headcount → auto-offered to available labour |
| **C** | Staffing / Placement | Browse/request → trial → monthly engagement |
| **D** | Rental / Inventory | Pick item + date range → availability + deposit + delivery |
| **E** | Property / Accommodation | Browse listings → viewing / token → booking |
| **F** | Quote / Project | Describe → site visit / quote → advance |

---

## Summary

| ID range | # | Category | Archetype | Phase (D-27) |
|---|---|---|---|---|
| 1000–1999 | 1 | Home Repair & Appliances | A | **Phase 1** |
| 2000–2999 | 2 | Home Cleaning & Pest Control | A | **Phase 1** |
| 3000–3999 | 3 | Beauty & Salon at Home | A | **Phase 1** |
| 4000–4999 | 4 | Construction & Labour | B | **Phase 1** |
| 5000–5999 | 5 | Domestic Help & Staffing | C | Phase 2 |
| 6000–6999 | 6 | Vehicle & Goods Transport | A / D | **Phase 1** (transport/wash) · Phase 2 (rental) |
| 7000–7999 | 7 | Events & Media | F | Phase 2 |
| 8000–8999 | 8 | Equipment & Furniture Rental | D | Phase 2 |
| 9000–9999 | 9 | Rooms, PG & Rentals | E | Phase 2 |
| 10000–10999 | 10 | Agriculture & Farm | B | **Phase 1** |
| 11000–11999 | 11 | Tutors & Classes | A | Phase 2 |

> **Phase 1 = direct booking of workers** (dispatch / Captain mode): categories 1, 2, 3,
> 4, 6 (transport/wash), 10. Everything else (staffing, rental, events, PG, tutors) +
> the Partner Web Portal is **Phase 2** (D-27).

> Reserved: 12000+ for future expansion verticals (Health-at-Home, Professional
> Services, Mobility/Rides) — explicitly deferred (see `overview.md` Out of Scope).

---

## 1. Home Repair & Appliances — `1000–1999` · Archetype A

**Tagline:** Electrician, plumber, AC, appliance repair at your door.
**Booking:** instant or scheduled slot; auto-dispatched to nearest verified technician.

| Sub-category | Representative services |
|---|---|
| **Electrician** | Wiring, switchboard install, fan/light fitting, MCB/fuse, inverter/UPS install, earthing, doorbell, power point, fault diagnosis |
| **Plumber** | Tap repair/replace, leak fixing, drainage/blockage, toilet/flush, washbasin, motor install, overhead/sump connection, geyser fitting |
| **Carpenter** | Furniture repair, door/window/lock, hinges, modular fitting, curtain rod, bed/sofa repair, drilling/hanging |
| **Painter (touch-up)** | Single-room painting, patch/touch-up, wall putty, waterproof patch *(full-home → Cat 7 / Archetype F)* |
| **AC Service** | Service/clean, install/uninstall, gas refill, repair, PCB, window/split |
| **Appliance Repair** | Refrigerator, washing machine, microwave, chimney, gas stove, geyser, RO/water purifier, mixer/grinder |
| **Electronics & Security** | TV repair, laptop/PC repair, CCTV install, biometric/access control, intercom |

**Pricing:** visit charge + parts (quoted after diagnosis); express/same-day surcharge.

---

## 2. Home Cleaning & Pest Control — `2000–2999` · Archetype A

**Tagline:** Deep cleaning & pest control, on demand.
**Booking:** slot-based dispatch (cleaning crews of 1–3).

| Sub-category | Representative services |
|---|---|
| **Home Deep Cleaning** | Full-home deep clean, 1/2/3 BHK packages, move-in/move-out, post-construction |
| **Room Cleaning** | Bathroom, kitchen, balcony, single-room |
| **Upholstery** | Sofa, carpet, mattress, curtain cleaning |
| **Tank & Exterior** | Water tank/sump cleaning, glass/façade, terrace |
| **Pest Control** | General pest, cockroach, termite, bed bug, mosquito, rodent |
| **Sanitization** | Home/office disinfection, deep sanitization |

**Pricing:** per package / per sq-ft / per unit.

---

## 3. Beauty & Salon at Home — `3000–3999` · Archetype A

**Tagline:** Salon-grade beauty & grooming at home.
**Booking:** slot-based dispatch to a verified beautician *(bridal packages → Archetype F)*.

| Sub-category | Representative services |
|---|---|
| **Women's Salon** | Haircut, hair colour, hair spa, blow-dry, threading, waxing (full/half), facial, cleanup, mani/pedi, de-tan |
| **Men's Salon & Grooming** | Haircut, beard styling, head/face massage, hair colour, de-tan |
| **Makeup** | Party makeup, reception/engagement, birthday, basic event glam |
| **Bridal (package)** | Bridal HD/airbrush, pre-bridal, mehendi, hair setting *(quote/package — F)* |
| **Spa & Massage** | Body massage, head massage, foot reflexology at home |

**Pricing:** per service; package pricing for bridal.

---

## 4. Construction & Labour — `4000–4999` · Archetype B (Crew / Daily-wage)

**Tagline:** Masons, helpers & site labour by the day.
**Booking:** pick date + headcount + shift → auto-offered to available labour pool.

| Sub-category | Representative services |
|---|---|
| **Helper / Mazdoor** | Site cleaning, material shifting, loading/unloading, mixing support, curing, debris removal |
| **Mason** | Brick/block work, plastering, tile fixing, concrete, repair, compound wall, PCC |
| **Tile & Stone** | Floor/wall tile, granite/marble, bathroom/kitchen tile, grouting |
| **Shuttering Carpenter** | Footing/column/beam/slab shuttering, centering, formwork |
| **Bar Bending (Steel)** | Cutting, bending, binding, reinforcement |
| **Welder & Fabricator** | Gate/grill/railing welding, steel/shed/structural fabrication |
| **Painter (construction)** | Interior/exterior, putty, primer, texture, polish |
| **Waterproofing** | Terrace, bathroom, wall, basement |
| **Demolition** | Wall/concrete/floor breaking, debris removal |
| **Specialised** | POP/false ceiling, borewell, JCB/earthwork operator, scaffolding |

**Pricing:** per day (8-hour shift) per head; project quotes for larger jobs.

---

## 5. Domestic Help & Staffing — `5000–5999` · Archetype C (Placement)

**Tagline:** Verified maids, cooks, drivers & staff — daily or live-in.
**Booking:** browse profiles / submit requirement → trial → monthly engagement (not 30s dispatch).

| Sub-category | Representative services |
|---|---|
| **Housekeeping / Maid** | Part-time maid, full-time maid, live-in maid, deep-clean help |
| **Cook** | Veg/non-veg cook, party cook, North/South Indian, monthly cook |
| **Child & Elder Care** | Nanny/babysitter, Japa maid, elderly attendant, patient care |
| **Drivers** | Temporary driver, permanent driver, outstation, night-duty, heavy-vehicle |
| **Security & Watchman** | Day/night guard, watchman, event security, bouncer |
| **Office Support** | Office boy/peon, file runner, gardener/mali, tea/pantry boy |

**Pricing:** monthly salary or per-day; placement fee model.

---

## 6. Vehicle & Goods Transport — `6000–6999` · Archetype A + D

**Tagline:** Goods transport, tractors, at-home vehicle care.
**Booking:** transport & at-home service = dispatch (A); vehicle rental = inventory (D).

| Sub-category | Archetype | Representative services |
|---|---|---|
| **Goods Transport** | A | Mini truck, tempo, pickup, local shifting (within city) |
| **Packers & Movers** | F | Home/office relocation (survey → quote) |
| **At-home Vehicle Care** | A | Car wash, bike wash, car/bike service pickup, battery jumpstart, roadside assistance |
| **Tractor Services** | B | Tilling, levelling, sand/material transport, construction-site tractor |
| **Vehicle Rental** | D | Self-drive car, tempo/truck on rent, tractor/JCB/crane on rent |

> **Mobility/rides (auto + bike taxi) are explicitly out of launch scope** (see `overview.md`).

**Pricing:** per trip / per km / per day; rental = per-day + deposit.

---

## 7. Events & Media — `7000–7999` · Archetype F (Quote / Project)

**Tagline:** Photography, decor, catering & full event management.
**Booking:** enquiry → site visit / quote → advance. Multi-day, custom.

| Sub-category | Representative services |
|---|---|
| **Photography** | Wedding, engagement, birthday, corporate, product, passport/ID |
| **Videography** | Cinematic wedding film, event coverage, drone, livestream, corporate |
| **DJ, Sound & Lighting** | DJ, PA system, stage lighting, fog/effects |
| **Decoration** | Balloon, flower, mandap, theme, baby-shower, reception, stage |
| **Catering** | Veg/non-veg catering, live counters, tiffin/bulk, serving staff |
| **Event Management** | Full coordination, MC/anchor, guest management, invitation/printing |
| **Function Setup** | Birthday, anniversary, housewarming, naming ceremony |

**Pricing:** package + custom quote.

---

## 8. Equipment & Furniture Rental — `8000–8999` · Archetype D (Inventory)

**Tagline:** Sound, stage, furniture, generators & tools on rent.
**Booking:** pick item + quantity + date range → availability check → deposit → delivery.

| Sub-category | Representative services |
|---|---|
| **Sound & AV** | PA/DJ system, wired/wireless mic, LED video wall, projector & screen |
| **Stage & Tent** | Shamiana, stage platform, tent/canopy, mandap |
| **Furniture** | Chairs (plastic/cushion/VIP), tables, sofas, dining sets |
| **Lighting** | Decorative LED, flood, spot, fairy lights |
| **Power** | Generator (5–100 KVA), UPS, extension boards |
| **Construction Tools** | Drill, angle grinder, concrete mixer, scaffolding, ladder, vibrator |
| **Catering Equipment** | Serving vessels, gas burners, ice box/cooler, crockery |
| **Camera Gear** | Camera/lens rental, lighting kit, gimbal |

**Pricing:** per-day rental + delivery + refundable security deposit.

---

## 9. Rooms, PG & Rentals — `9000–9999` · Archetype E (Property)

**Tagline:** PG, hostels, rooms & flats near you.
**Booking:** browse listings → schedule viewing / pay token → booking. Not worker dispatch.

| Sub-category | Representative services |
|---|---|
| **PG Accommodation** | Boys PG, Girls PG, Co-ed PG, working-professional PG |
| **Hostels** | Student hostel, workers hostel, ladies hostel |
| **Single Rooms** | Bachelor rooms, furnished/unfurnished, AC rooms |
| **Flats for Rent** | 1BHK, 2BHK, 3BHK, fully-furnished, semi-furnished |
| **Co-living & Short-stay** | Shared co-living, short-term furnished, daily-rent lodge |
| **Commercial** | Shop/office space for rent |
| **Roommate Finder** | Find-a-roommate / shared-room listing |

**Pricing:** monthly rent + advance/deposit; token to reserve a viewing/booking.

---

## 10. Agriculture & Farm — `10000–10999` · Archetype B (Crew / Equipment)

**Tagline:** Tractors, farm labour & crop services for the agri belt.
**Booking:** date + acreage/headcount → dispatch of operator/crew/equipment.

| Sub-category | Representative services |
|---|---|
| **Tractor & Implements** | Tilling/ploughing, levelling, rotavator, cultivator, trolley transport |
| **Borewell & Water** | Borewell drilling, water tanker supply, pump install |
| **Farm Labour** | Sowing, weeding, harvesting, loading produce |
| **Crop Care** | Manual/machine spraying, drone spraying, fertiliser application |
| **Harvest Support** | Harvester booking, threshing, crop transport to market |

**Pricing:** per acre / per hour / per day.

> Deliberately included: launch cities (Warangal, Karimnagar, Khammam) are an agri belt;
> demand is real and under-served, and it reuses the crew-dispatch engine of Cat 4.

---

## 11. Tutors & Classes — `11000–11999` · Archetype A · **Phase 2**

**Tagline:** Home tutors & skill classes near you.
**Booking:** scheduled dispatch / recurring slots with a verified tutor.

| Sub-category | Representative services |
|---|---|
| **Academic Tuition** | School subjects (1–10), 11–12 / Intermediate, exam prep |
| **Languages** | Spoken English, Hindi, regional languages |
| **Music & Arts** | Keyboard, guitar, vocals, dance, drawing/painting |
| **Skills & Computer** | Computer basics, MS Office, typing, coding for kids |
| **Fitness & Hobby** | Yoga instructor, personal trainer, abacus |

**Pricing:** per session / monthly package.

---

## Service ID Assignment Rules

| Rule | Detail |
|---|---|
| ID range | Each category owns a 1,000-ID block (D-22). Sub-categories take contiguous sub-blocks. |
| Slug | Every service has a unique `slug` (D-09); URLs are `/services/[cat]/[slug]`. |
| Archetype | Every service inherits its category's archetype (D-21); a few may override (e.g. bridal package = F inside Cat 3). Store `archetype` per service where it overrides the category default. |
| Adding a service | Insert into the correct ID block; set category, sub-category, archetype, price, `is_active`; seed into Postgres `services` (D-19 source-of-truth). |
| Deactivating | `is_active = false` (soft); hidden from UI, preserved in DB. |
| New category | Allocate the next free 1,000 block; never reuse a retired block. |
| SEO | Never change a slug after go-live; 301-redirect if you must. |

---

## Catalog → Archetype → Flow quick map

| Categories | Archetype | Flow doc |
|---|---|---|
| 1, 2, 3, 6 (transport/wash), 11 | **A** Dispatch | `user_flow.md` F-01 (Direct Booking) |
| 4, 6 (tractor), 10 | **B** Crew dispatch | `user_flow.md` F-01b (Crew) |
| 5 | **C** Staffing | `user_flow.md` F-08 (Placement) |
| 6 (rental), 8 | **D** Rental | `user_flow.md` F-09 (Rental) |
| 9 | **E** Property | `user_flow.md` F-10 (Accommodation) |
| 7, packers, bridal | **F** Quote | `user_flow.md` F-06 (Quote/Enquiry) |
