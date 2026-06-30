# VSolveHub — App Specifications: Admin Panel

> **Version:** 1.0 | **Last Updated:** June 2026  
> Django Admin (customized) + Custom React Dashboard

---

## Overview

The admin panel is the operational nerve centre for the VSolveHub team. It runs at `admin.vsolvehub.com` and is IP-restricted in production.

**Access Roles:**
| Role | Permissions |
|------|-------------|
| `SUPER_ADMIN` | Full access — all modules, settings, user management |
| `MANAGER` | Lead management, worker approval, service catalog, reports |
| `SUPPORT` | Lead view/update, worker view, customer communication |

---

## Navigation Structure

```
Admin Panel
├── Dashboard                  ← Landing page with KPI cards
├── Leads                      ← All customer bookings/enquiries
│   ├── All Leads
│   ├── Pending
│   ├── Active Jobs
│   └── Completed
├── Workers
│   ├── Verification Queue     ← PENDING_VERIFICATION workers
│   ├── All Workers
│   └── Suspended
├── Customers                  ← Customer accounts list
├── Services
│   ├── Categories
│   ├── Sub-categories
│   └── Services (CRUD)
├── Content
│   ├── Gallery Images
│   ├── Testimonials
│   └── Banners
├── Notifications              ← Notification logs + templates
├── Reports                    ← Analytics charts + CSV export
└── Settings
    ├── Admin Users
    └── System Config
```

---

## Screen Specifications

### 1. Dashboard

**KPI Cards (top row):**
| Card | Metric | Color |
|------|--------|-------|
| Today's Leads | Count of new bookings today | Blue |
| Pending | Bookings awaiting action | Amber |
| Active Jobs | Bookings with status: ON_THE_WAY or IN_PROGRESS | Purple |
| Completed Today | Bookings completed today | Green |
| Verified Workers | Active worker count | Teal |
| Online Workers | Workers currently ONLINE | Green |

**Recent Leads Table:**
- Columns: Booking Ref, Customer, Service, Area, Scheduled Date, Status, Action
- 'Assign' button in action column for PENDING leads
- Color-coded status badges
- Auto-refresh every 60 seconds

**Quick Stats Chart:**
- Bookings over last 7 days (line chart)
- Category distribution (donut chart)

---

### 2. Lead Detail Page

**Customer Info Section:**
- Name, Phone (click-to-call), WhatsApp button, Email
- Booking reference, Service, Scheduled date, Location, Notes

**Status Management:**
- Current status badge
- Dropdown to manually update status (with confirmation)
- Status history timeline (all changes with actor + timestamp)

**Dispatch Monitor (read-only — no manual assignment):**

> Per `conventions.md` D-20, the platform **auto-dispatches**; admins do NOT assign
> workers. This panel is for **visibility and exception handling only.**

- Live dispatch state for the booking: `SEARCHING` (wave N of M), `ASSIGNED`, or
  `NO_WORKER_FOUND`
- Offer history (read-only): which workers were offered, who declined/expired/accepted,
  timestamps — sourced from `job_assignments`
- Eligible-pool size indicator ("4 workers online & eligible in this area")
- **Force-Assign (exception only):** enabled for MANAGER/SUPER_ADMIN **after** a booking
  hits `NO_WORKER_FOUND` or stays `SEARCHING` past a threshold. Picking a worker here is
  logged as a manual override with reason — a tracked exception, not the default path.
- **Why no auto-dispatch happened** diagnostics (no online workers / skill gap / out of
  area) so ops can fix supply, not micro-assign jobs.

**Communication Section:**
- 'Send WhatsApp' button → opens pre-filled template selector
- Template selector: booking_confirmed, worker_assigned, on_the_way, custom_message
- Message preview before sending
- Communication history log

**Admin Notes:**
- Internal notes field (rich text, not visible to customer)

---

### 3. Worker Verification Queue

**List View:**
- Columns: Worker Name, Phone, Skills, City, Submitted At, Attempt #, **Verification**, Action
- **Verification** column shows:
  - ✅ DigiLocker — identity pre-verified; only selfie + skills review needed
  - ⚠️ Manual — admin must visually review Aadhaar images
- Filter: Pending / All Resubmissions / DigiLocker Only / Manual Upload Only
- Sort: Oldest first (default — process in order); DigiLocker workers are typically faster to review
- Click row → Worker Review page

**Worker Review Page:**

The review page adapts based on how the worker completed Aadhaar verification. Admin always sees a clear indicator of the verification path used.

**Variant A — DigiLocker Verified Worker**

```
[ Worker Profile ]
  Name: Raju Yadav          Phone: +91 9876543210
  DOB: 15 Aug 1996 (28 yrs) Gender: Male
  Primary Skill: Electrician
  Sub-skills: Wiring, MCB, AC Installation
  Experience: 5 years
  Service Area: Warangal, 10km radius
  Languages: Telugu, Hindi

[ Identity Verification ]
  ✅  Aadhaar Verified via DigiLocker
      Name: Raju Yadav  ·  Last 4: XXXX  ·  Verified: 12 Jun 2026 at 10:32 AM
      Source: Government of India / UIDAI  ·  DigiLocker UID: xxxxxxxx
  → No document images to review. Identity is government-verified.

[ Document Review ]
  ┌─────────────────┐  ┌─────────────────┐
  │ Selfie          │  │ Skill Cert      │
  │ [View Full]     │  │ (not uploaded)  │
  └─────────────────┘  └─────────────────┘

[ Bank Details ]
  Account: XXXX XXXX XXXX 4321   IFSC: SBIN0001234
  Account holder: Raju Yadav     Status: Unverified

[ Actions ]
  [✅ Approve]   [❌ Reject with Reason]   [Internal Notes]
```

**Variant B — Manual Upload Worker**

```
[ Worker Profile ]
  Name: Raju Yadav          Phone: +91 9876543210
  DOB: 15 Aug 1996 (28 yrs) Gender: Male
  Primary Skill: Electrician
  ...

[ Identity Verification ]
  ⚠️  Aadhaar uploaded manually — visual review required
      Admin must inspect the Aadhaar images below before approving.

[ Document Review ]
  ┌─────────────────┐  ┌─────────────────┐
  │ Aadhaar Front   │  │ Aadhaar Back    │
  │ [View Full]     │  │ [View Full]     │
  └─────────────────┘  └─────────────────┘
  ┌─────────────────┐  ┌─────────────────┐
  │ Selfie          │  │ Skill Cert      │
  │ [View Full]     │  │ (not uploaded)  │
  └─────────────────┘  └─────────────────┘

[ Bank Details ]
  Account: XXXX XXXX XXXX 4321   IFSC: SBIN0001234
  Account holder: Raju Yadav     Status: Unverified

[ Actions ]
  [✅ Approve]   [❌ Reject with Reason]   [Internal Notes]
```

**Approve Flow:**
- Confirmation modal: 'Approve Raju Yadav as Electrician?' + YES
- Worker status → ACTIVE
- Push notification + WhatsApp sent to worker
- Admin sees success toast

**Reject Flow:**
- Rejection reason dropdown (context-aware based on verification path):

  *Available for all workers:*
  - 'Selfie is unclear or does not match identity'
  - 'Incomplete profile information'
  - 'Service area not currently supported'
  - 'Custom reason...'

  *Additional options — shown only for manual upload workers:*
  - 'Aadhaar photo is unclear — please re-upload or use DigiLocker'
  - 'Aadhaar appears invalid or expired'
  - 'Documents could not be verified — please use DigiLocker instead'

- Optional additional notes (internal, not shown to worker)
- On submit: worker status → REJECTED; push + WhatsApp sent with reason

---

### 4. Worker Management

**All Workers List:**
- Columns: Photo, Name, Skills, City, Status badge, Rating, Online status (green dot), Total Jobs, Actions
- Actions: View Profile, Suspend, Message via WhatsApp
- Filters: Status (All/Active/Suspended), Skill, City, Online Now
- Search by name or phone

**Worker Profile View:**
- All profile details + documents
- Booking history (jobs assigned to this worker)
- Ratings history
- Suspension log (if any)
- 'Suspend' button (MANAGER/SUPER_ADMIN only) with reason

---

### 5. Service Catalog Management

**Categories List:**
- CRUD table: ID, Name, Slug, Display Order, Status, Actions
- Drag-and-drop reorder
- Toggle active/inactive

**Services List:**
- Filterable by Category + Sub-category + Status
- Bulk actions: Activate / Deactivate selected
- Add Service form: all fields
- Edit Service: inline or modal
- Deactivating service with active bookings: warning shown

---

### 6. Content Management

**Gallery Images:**
- Upload images with category tag
- Set display order
- Preview grid
- Delete image

**Banners:**
- Upload hero banner image
- Set link URL (optional)
- Set display order
- Preview on desktop + mobile breakpoints

**Testimonials:**
- Add: customer name, review text, rating, service category, photo (optional)
- Edit / delete
- Toggle visible/hidden

---

### 7. Notification Logs

**Log Table:**
- Columns: Recipient, Channel, Template, Status, Sent At, Error (if failed)
- Filter: Channel (WhatsApp/SMS/Email/Push), Status (Sent/Failed/Pending), Date range
- Failed notifications: 'Retry' button

---

### 8. Reports

**Metrics available:**
- Bookings: daily/weekly/monthly count + trend
- Revenue/GMV: per period
- Top categories: pie chart
- Worker performance: rank by jobs completed + rating
- Lead conversion funnel: Submitted → Confirmed → Assigned → Completed

**CSV Export:**
- Apply current filters → 'Export CSV'
- CSV fields: Booking Ref, Customer Name, Phone, Service, Category, Scheduled Date, Status, Worker Assigned, Earnings, Created At

---

## Admin Panel Technical Specs

**Frontend:**
- Django Admin (base) with custom templates and TailwindCSS (admin-only, not public-facing)
- Or: custom React dashboard with Vite (separate from customer Next.js app)
- Charts: Chart.js or Recharts
- Real-time: WebSocket (Django Channels) or polling (60s interval) for lead updates

**Authentication:**
- Django admin login (`/admin/login/`)
- 2FA: TOTP via `django-otp` + `qrcode`
- Session-based (not JWT) for admin panel
- IP allowlist: configurable in `ADMIN_ALLOWED_IPS` environment variable

**API Endpoints Used:**
```
GET  /api/v1/admin/dashboard/stats/
GET  /api/v1/admin/leads/
GET  /api/v1/admin/leads/{id}/
PATCH /api/v1/admin/leads/{id}/status/
POST /api/v1/admin/leads/{id}/assign/   { worker_id }
GET  /api/v1/admin/workers/pending/
GET  /api/v1/admin/workers/
POST /api/v1/admin/workers/{id}/approve/
POST /api/v1/admin/workers/{id}/reject/ { reason }
POST /api/v1/admin/workers/{id}/suspend/ { reason }
GET/POST/PUT/DELETE /api/v1/admin/services/
GET/POST/PUT/DELETE /api/v1/admin/categories/
GET  /api/v1/admin/notification-logs/
GET  /api/v1/admin/reports/bookings/
GET  /api/v1/admin/reports/workers/
```
