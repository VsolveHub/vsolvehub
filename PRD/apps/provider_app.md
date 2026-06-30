# VSolveHub — App Specifications: Provider App (adaptive) + Partner Web Portal

> **Version:** 1.0 | **Last Updated:** 2026-06-17
> Flutter (mobile) + responsive web portal. **Authoritative for the supply side.**
> See `conventions.md` D-24 (provider model), D-25 (lead routing), D-26 (portal & per-type).
>
> 🚦 **Phasing (D-27):** **Phase 1 ships only Mode 1 (Captain).** Modes 2–5
> (Professional, Vendor, Host, Studio), the Inbox-Pull mechanic, and the Partner Web
> Portal are **Phase 2**. They are specified here so the design/schema stay
> forward-compatible, but they are not built in Phase 1.

---

## Overview

There is **one Provider App**, not five. After login it detects the provider's
`provider_type` and renders the matching **mode**. The shared spine — OTP auth, the KYC
verification gate, ratings, notifications, earnings/payouts — is identical across modes;
only the home experience, the lead mechanic, and the management surface differ.

| `provider_type` | Mode | Serves | Lead mechanic | Primary surface |
|---|---|---|---|---|
| `CAPTAIN` | Captain | A, B | Push-Dispatch (30s) | App |
| `PROFESSIONAL` | Professional | C | Inbox (hours SLA) | App |
| `RENTAL_VENDOR` | Vendor | D | Inbox | **Web portal** + app |
| `PROPERTY_HOST` | Host | E | Inbox | **Web portal** + app |
| `EVENT_VENDOR` | Studio | F | Inbox | **Web portal** + app |

---

## Shared spine (all modes)

- **Onboarding & KYC gate** — same gate as `worker_app.md` F-02; the **document set
  differs by type** (D-26). No provider receives leads until `status = ACTIVE`.
- **Auth** — OTP (D-03), Flutter secure storage (D-23).
- **Notifications** — FCM; `app_type = "provider"`.
- **Ratings** — customers rate after completion; shown on profile/listing.
- **Earnings & Payouts** — one Earnings tab; computation differs by type (D-26).
- **Profile & Support** — edit profile, documents, help/WhatsApp, logout.

---

## Mode 1 — Captain (`CAPTAIN`, archetypes A/B)

Unchanged from `apps/worker_app.md` (now "Captain mode"):
- ONLINE/OFFLINE toggle + location ping
- Full-screen **30-second job alert** (push-dispatch, D-25); accept/decline
- Active job: On the Way → Arrived → In Progress → Completed
- Crew jobs (B): the alert shows the role; the booking tracks `filled / required`
- Earnings = per-job net

---

## Mode 2 — Professional (`PROFESSIONAL`, archetype C — staffing)

**Home:** profile completeness, this-month engagements, requests inbox badge.

- **Profile** customers browse: photo, skills, experience, expected salary, languages,
  area, ratings. (This is the "product" a professional sells — themselves.)
- **Availability schedule** (weekly days/hours) — not a real-time toggle.
- **Requests Inbox** (Inbox-Pull, D-25): a placement request arrives (customer picked
  this profile, or a requirement was broadcast). Card: service, area, timing, pay.
  Actions: **Accept / Decline / Propose trial slot.** Respond within the SLA (hours).
- **Engagements:** active monthly engagements; mark attendance / report issues; end
  engagement. Status: `REQUESTED → SHORTLISTED → TRIAL → ENGAGED → CLOSED`.
- **Earnings:** monthly salary view + platform fee.

---

## Mode 3 — Vendor (`RENTAL_VENDOR`, archetype D — rental)

> Inventory-heavy → **Partner Web Portal is primary**; app is for on-the-go actions.

**Inventory Manager (web):**
- Add/edit items: name, category, photos, per-day price, **stock quantity**, security
  deposit, delivery radius, condition notes.
- **Availability calendar** per item: stock auto-decremented by overlapping confirmed
  rentals; manual blackout for maintenance.
- Bulk import (CSV) for large catalogs (chairs, plates).

**Requests Inbox (web + app):** a rental request for *this vendor's item* arrives
(Inbox-Pull). Card: item, qty, date range, customer area. Actions: **Confirm (check
stock) / Decline / Adjust quote.** On confirm → arrange delivery.
Status: `REQUESTED → CONFIRMED → OUT_FOR_DELIVERY → IN_USE → RETURNED → CLOSED`.

**Logistics (app):** mark Out-for-Delivery / Delivered / Picked-up / Returned; log
damage → deposit adjustment.

**Earnings:** rent − commission, plus deposit held/settled per booking.

---

## Mode 4 — Host (`PROPERTY_HOST`, archetype E — accommodation)

> Listing-heavy → **Partner Web Portal is primary**.

**Listing Manager (web):**
- Add/edit listings: type (PG/room/flat/hostel), title, rent, deposit, **sharing**
  (single/double/triple), **gender** policy, amenities, photos, rules, address/map.
- **Occupancy:** total beds/units, **free beds**, available-from date. Mark a bed
  occupied/vacated → availability updates live.

**Requests Inbox (web + app):** a **viewing** or **booking** request for this listing
(Inbox-Pull). Actions: **Confirm viewing slot / Accept booking / Decline.**
Status: `ENQUIRY → VIEWING_SCHEDULED → TOKEN_PAID → BOOKED → CLOSED`.

**Bookings:** current tenants, move-in/out, token/deposit collected.
**Earnings:** token + platform commission.

---

## Mode 5 — Studio (`EVENT_VENDOR`, archetype F — events)

> Portfolio + quotes → **Partner Web Portal is primary**.

**Catalog Manager (web):** packages (name, inclusions, price-from), portfolio albums
(photos/videos), service areas, **booked-date calendar / blackout dates**.

**Enquiry Inbox (web + app):** an event enquiry arrives (date, venue, scale).
Actions: **Send Quote / Decline / Ask a question.** On accept → advance → execute.
Status: `ENQUIRY → QUOTED → ADVANCE_PAID → IN_PROGRESS → COMPLETED`.

**Calendar:** booked dates blocked automatically; prevents double-booking a date.
**Earnings:** advance + final − commission.

---

## Partner Web Portal (`partner.vsolvehub.com`)

Responsive console for Vendor / Host / Studio types. Modules: Dashboard (requests,
earnings, occupancy/stock), Inventory/Listings/Catalog manager, Requests/Bookings,
Calendar/Availability, Earnings & Payouts, Profile & KYC, Support. Same backend API
(`/api/v1/provider/...`), session or JWT per `conventions.md` D-04/D-06.

---

## Lead routing recap (D-25)

| Mode | Routing | Response window |
|---|---|---|
| Captain | Push-Dispatch (system picks) | **30 seconds** |
| Professional | Inbox (picked) / Push (requirement) | hours SLA |
| Vendor / Host / Studio | Inbox (customer picked their product) | hours SLA |

---

## Per-type verification (D-26)

| Mode | Documents |
|---|---|
| Captain / Professional | Aadhaar + live selfie + optional skill cert |
| Vendor / Studio | Owner Aadhaar + business proof + inventory/portfolio photos |
| Host | Owner Aadhaar + property ownership/authorisation proof + property photos |

---

## Cross-references

- Captain mode detail: `apps/worker_app.md`
- Customer-side flows per archetype: `user_flow.md` → "Direct Booking & Archetype Flows"
- Data models: `data_models.md` → `providers`, `vendor_profiles`, `rental_items`,
  `property_listings`, `provider_requests`, `provider_blackout_dates`
- Admin verification of all provider types: `apps/admin_panel.md`
