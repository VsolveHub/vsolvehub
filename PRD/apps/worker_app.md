# VSolveHub — App Specifications: Worker / Rider App

> **Version:** 1.0 | **Last Updated:** June 2026  
> Flutter 3.x (Dart 3) — Android + iOS  
> **Inspired by:** Rapido Captain App · Uber Driver App · UrbanClap Partner App
>
> 🔄 **v1.2 — This is now "Captain mode" of the adaptive Provider App** (`apps/provider_app.md`,
> `conventions.md` D-24). It covers `CAPTAIN` providers (archetypes A/B, push-dispatch). The
> other provider types (Professional, Rental Vendor, Property Host, Event Vendor) use
> different modes + the Partner Web Portal — see `provider_app.md`. Stack is **Flutter** (D-23),
> not React Native; "React Native/Expo" references below are superseded.

---

## Overview

The Worker App is the supply-side application. It is fundamentally different from the Customer App:
- Workers go through a **strict verification gate** before the full app unlocks
- A **30-second job accept timer** is the core UX mechanic
- **ONLINE/OFFLINE toggle** controls job receiving (like Rapido's go-online toggle)
- **Real-time status updates** give the admin and customer full visibility

**App Store Listing:**
- App Name: QSH Worker — VSolveHub
- Bundle ID: `com.quickservicehub.worker`
- Target: Android 9+ (API 28), iOS 14+

---

## Navigation Structure

```
Worker App
│
├── Pre-Activation Flow (locked until ACTIVE)
│   ├── Splash
│   ├── Enter Phone + OTP
│   ├── Stage 2: Personal Details
│   ├── Stage 3: Skill Selection
│   ├── Stage 4: Document Upload
│   ├── Stage 5: Review & Submit
│   └── Waiting Screen (PENDING_VERIFICATION)
│
├── Activation (REJECTED path)
│   └── Rejection Screen + Fix & Resubmit
│
├── Post-Activation Onboarding (first time ACTIVE)
│   ├── Tutorial Slide 1: How to go ONLINE
│   ├── Tutorial Slide 2: How to accept jobs
│   └── Tutorial Slide 3: How to complete jobs
│
└── Main App (Bottom Tab — only after ACTIVE)
    ├── Home / Dashboard (tab 1)
    ├── My Jobs (tab 2)
    ├── Earnings (tab 3)
    └── Profile (tab 4)
```

---

## Screen Specifications

### Pre-Activation Flow

#### Splash Screen
- QSH Worker logo + 'For Service Professionals'
- Dark accent background
- Auto-navigate:
  - → Enter Phone (no session)
  - → Resume onboarding (incomplete profile)
  - → Waiting screen (PENDING_VERIFICATION)
  - → Home (ACTIVE)

---

#### Enter Phone + OTP (same as Customer App)
- Phone entry → OTP → Account created (status: UNVERIFIED)
- If already registered: 'Welcome back! Continue where you left off.'

---

#### Stage 2: Personal Details
**Progress:** Step 1 of 4 (profile, skills, documents, review)

Fields:
- Full Name * (min 3 chars)
- Date of Birth * (must be 18+; date picker)
- Gender * (Male / Female / Other)
- Profile Photo * — **live selfie capture only** (not from gallery)

**Selfie capture UX:**
- Camera screen with face oval guide overlay
- 'Position your face within the circle'
- Capture button
- Preview + 'Retake' / 'Use this photo'
- Tip: 'Find good lighting. Remove sunglasses or hat.'

---

#### Stage 3: Skill Selection
**Progress:** Step 2 of 4

Fields:
- Primary Skill * (single select with search):
  - Electrician | Plumber | Mason | AC Technician | RO Technician | CCTV Technician | PC/Laptop Technician | Painter | Carpenter | Welder | Driver | Security Guard | Cook/Catering | Beautician | Photographer | Videographer | Event Decorator | Equipment Operator
- Sub-skills * (multi-select, filtered by primary skill)
- Experience * (dropdown: < 1yr / 1–3yr / 3–5yr / 5–10yr / 10+ yr)
- Service Area City * (searchable: Hyderabad, Warangal, Karimnagar, Khammam, etc.)
- Pincode * (auto-populated from city, editable)
- Service Radius * (toggle: 5km / 10km / 20km)
- Languages * (multi-select: Telugu / Hindi / English)

---

#### Stage 4: Document Upload
**Progress:** Step 3 of 4

**Sub-sections:**

**4a. Aadhaar Verification (via DigiLocker — Primary)**

DigiLocker is the primary and recommended method. It eliminates document upload errors and speeds up admin approval because the Aadhaar is pre-verified by the government.

- Instruction card: 'Verify your identity securely using DigiLocker — India's official government document platform.'
- **'Verify Aadhaar via DigiLocker'** primary CTA button (prominent, blue)
- On tap: opens DigiLocker login in an in-app browser (WebView)
  - Worker enters their Aadhaar-linked mobile number on DigiLocker
  - DigiLocker sends a separate OTP to that number (not VSolveHub's OTP)
  - Worker grants consent to share e-Aadhaar with VSolveHub
  - WebView closes automatically on success
- On success: ✅ 'Aadhaar Verified' card shown
  - Name auto-populated from Aadhaar XML (read-only)
  - Aadhaar last-4 digits displayed for confirmation (e.g. XXXX XXXX XXXX 4321)
  - 'Not you? Re-verify' option

**4a (Fallback) — Manual Aadhaar Upload**

Shown only when DigiLocker is unavailable or if the worker taps 'Upload manually instead':

- Small secondary link below the DigiLocker button: 'DigiLocker not working? Upload manually'
- 'Upload Aadhaar Front' — camera or gallery
- Preview thumbnail with ✅ on upload
- 'Upload Aadhaar Back' — camera or gallery
- Tip: 'Ensure all 4 corners of Aadhaar are visible. No blur or glare.'
- ⚠️ Note shown: 'Manual uploads require additional review time (24–48 hours). DigiLocker verification is instant.'

> **Admin impact:** Workers who use the fallback manual path are flagged in the admin verification queue for visual document review. Workers who use DigiLocker skip document image review entirely.

---

**4b. Skill Certificate (Optional)**
- 'Upload Certificate' — gallery (PDF or image)
- Examples: ITI certificate, trade certificate, diploma

**4c. Payment Details (one of two):**

*Option A — Bank Account:*
- Account Number (numeric, masked on type)
- Confirm Account Number (must match)
- IFSC Code (auto-format: 4 letters + 7 digits)
- Account Holder Name
- 'Verify Bank Details' → bank name auto-populated from IFSC

*Option B — UPI:*
- UPI ID (e.g. raju@upi, 9876543210@paytm)
- 'Verify UPI' → check validity

---

#### Stage 5: Review & Submit
**Progress:** Step 4 of 4

**Preview of all data:**
```
[ Personal Details ]
Name: Raju Yadav        DOB: 15 Aug 1996
Gender: Male            Photo: [thumbnail]

[ Skills ]
Primary: Electrician
Sub-skills: Wiring, MCB, AC Installation
Experience: 5 years
Area: Warangal, 10km radius
Languages: Telugu, Hindi

[ Identity Verification ]
✅ Aadhaar Verified via DigiLocker
   Name: Raju Yadav  ·  Last 4: XXXX
   (OR if manual fallback was used:)
⚠️ Aadhaar uploaded manually — pending admin review
   ✅ Aadhaar Front      ✅ Aadhaar Back

[ Documents ]
⬜ Skill Certificate (not uploaded)
✅ Bank Account: XXXX4321

[ Edit ] buttons on each section → navigate back to that step
```

**Submit button:** 'Submit for Verification'
- Confirmation alert: 'Once submitted, we will review your profile within 24–48 hours.'
- On submit: status → PENDING_VERIFICATION
- WhatsApp confirmation sent to worker

---

#### Waiting Screen (PENDING_VERIFICATION)
- ⏳ Hourglass illustration
- 'Profile under review'
- 'Our team is verifying your profile. We'll notify you within 24–48 hours.'
- WhatsApp button: 'Questions? Chat with us'
- Progress tracker: 'Submitted ✅ → Under Review ⏳ → Decision'
- Auto-refresh on app open to check status

---

#### Rejection Screen (REJECTED)
- ❌ Clear rejection notification
- 'Your profile was not approved'
- Reason displayed clearly:
  - e.g. 'Aadhaar photo is blurry. Please re-upload a clear photo.'
- 'Fix and Resubmit' button → navigates to specific failed section
- 'Contact Support' WhatsApp button

---

### Post-Activation Onboarding (3 Tutorial Slides)

**Slide 1: Go ONLINE to receive jobs**
- Illustration: phone with green ONLINE toggle
- 'Tap the ONLINE button when you're ready to work. Toggle OFFLINE when you need a break.'

**Slide 2: Accept jobs within 30 seconds**
- Illustration: phone with countdown timer
- 'When a job arrives, you'll have 30 seconds to accept. Fast acceptance = more jobs!'

**Slide 3: Update your status as you work**
- Illustration: status flow diagram
- 'Keep your status updated: On the Way → Arrived → In Progress → Completed. Your customer is watching!'

**Bottom:** 'Got it! Let's start' → Home Screen

---

### Main App: Home / Dashboard (Tab 1)

**Top Section:**
```
[ QSH Worker ]              [ Notification bell ]
                                       |
  Good morning, Raju 👷‍♂️              |
  Electrician | ⭐ 4.8                |

  ┌─────────────────────────────────────┐
  │                                     │
  │   ⚡  OFFLINE                   ⭕  │  ← Toggle switch
  │   Tap to go ONLINE                  │
  │                                     │
  └─────────────────────────────────────┘
```

**ONLINE state:**
```
  ┌─────────────────────────────────────┐
  │                                     │
  │   ✅  ONLINE                    🟢  │
  │   Waiting for jobs...               │
  │   📍 Warangal · 10km radius         │
  │                                     │
  └─────────────────────────────────────┘
```

**Stats Cards:**
- Today's jobs: X
- This month: X jobs | ₹XXXX earned
- Average rating: ⭐ X.X

**Active Job Banner** (if job in progress):
- Job type, customer area, current status
- 'Update Status' CTA → Job Detail screen

---

### Job Alert Screen (HIGH PRIORITY — Full Screen Overlay)

This screen appears OVER any other screen when a new job notification arrives.

```
╔═══════════════════════════════════╗
║                                   ║
║      🔔 NEW JOB ALERT             ║
║                                   ║
║   ┌───────────────────────────┐   ║
║   │  ⚡ Electrician Service   │   ║
║   │                           │   ║
║   │  📍 Hanamkonda area       │   ║
║   │  📅 Today, 3:00 PM        │   ║
║   │  💰 Est. ₹350–₹500        │   ║
║   │  🚗 ~2.3 km from you      │   ║
║   └───────────────────────────┘   ║
║                                   ║
║         ╔═══════════╗             ║
║         ║    24     ║  ← Countdown║
║         ╚═══════════╝             ║
║      ████████████░░░░░  ← Ring    ║
║                                   ║
║  ┌─────────────┐ ┌─────────────┐  ║
║  │  ✅ ACCEPT  │ │  ❌ DECLINE │  ║
║  └─────────────┘ └─────────────┘  ║
║                                   ║
╚═══════════════════════════════════╝
```

**Behavior:**
- Screen wakes device (FCM HIGH priority)
- Sound alert (respect device mute: show vibration)
- 30-second countdown ring animation
- ACCEPT → Job detail screen; customer WhatsApp sent
- DECLINE → Reason selection modal → job back to admin
- Timer expires → auto-decline; 'Job expired. Stay online for more jobs.'

**Decline Reasons Modal:**
```
Why are you declining?
○ I'm busy with another job
○ Too far from my location
○ I don't have this skill
○ Personal reason
○ Other (specify)
         [Confirm Decline]
```

---

### Active Job Screen

After accepting a job:

```
[ Active Job — VSH-0042 ]

  ⚡ Electrician — Wiring
  📅 Today, 3:00 PM
  📍 Hanamkonda, Warangal

  ┌──────────────────────────────────┐
  │                                  │
  │  Customer will be notified       │
  │  at each step you complete       │
  │                                  │
  └──────────────────────────────────┘

Status Steps:
● Accepted ✅ (3:15 PM)
○ On the Way       [Tap to update]
○ Arrived
○ In Progress
○ Completed
```

**Each status tap:**
1. Confirmation dialog: 'Confirm: Mark as On the Way?' [Cancel] [Confirm]
2. On confirm: API call → status updated → customer WhatsApp sent
3. Next step button becomes active

**'Raise an Issue' button (visible during In Progress):**
- Issue types: 'Customer not reachable', 'Wrong address', 'Additional work needed', 'Safety concern', 'Other'
- Admin notified immediately

---

### Job Completion Screen

After tapping 'Mark as Completed':

```
  ✅ Job Completed!

  ⚡ Electrician — Wiring
  📅 Today, 3:15 PM – 5:30 PM  (2h 15m)

  💰 Earnings: ₹450 (pending payment)

  ───────────────────────────────
  Your customer has been asked
  to rate your service.

  [View Earnings]    [Go Back to Home]
```

---

### My Jobs (Tab 2)

**Tabs:** Active | History

**Active jobs:** (should be max 1 at a time)
- Job card: ref, service, customer area, status

**History:**
- List of completed/cancelled jobs
- Each card: service, date, earning, rating received
- Tap → Job detail

---

### Earnings (Tab 3)

```
Earnings Dashboard

Today          ₹450
This Week      ₹2,100
This Month     ₹8,750

⭐ Avg Rating  4.8    ✅ Jobs Done  23

─────────────────────────────────────
Recent Jobs

[⚡ Electrician Wiring] [Today] [₹450] [⭐4.8]
[🔧 AC Service]        [Yesterday] [₹600] [⭐5.0]
[⚡ Switch Repair]     [2 days ago] [₹200] [⭐4.5]
...
```

**Payment Status per job:** `PENDING | PROCESSING | PAID`

---

### Profile (Tab 4)

**Header:**
- Profile photo (tap to change)
- Name + Primary Skill
- Rating badge + Jobs count

**Sections:**
- Edit Profile (name, skills, service area, languages)
- Documents (view submitted documents; can't re-upload unless rejected)
- Earnings & Payments (bank account / UPI)
- Availability Schedule (day/time slots)
- Help & Support (WhatsApp link)
- About QSH Worker App
- Logout

---

## Critical UX Rules

| Rule | Reason |
|------|--------|
| Worker CANNOT access job features until status = ACTIVE | Trust and safety gate |
| Selfie must be live-captured (not from gallery) | Liveness check, prevents proxy registration |
| Full customer address revealed ONLY after job acceptance | Customer privacy |
| 30-second timer is non-negotiable | Prevents job hoarding; forces quick decision |
| ONLINE toggle requires location permission | Worker proximity matters for admin assignment |
| Status updates are sequential; cannot skip | Maintains accurate timeline for customer + audit |

---

## Technical Notes

**FCM HIGH Priority (Android):**
```json
{
  "message": {
    "token": "worker_fcm_token",
    "android": {
      "priority": "high",
      "notification": {
        "title": "🔔 New Job Alert!",
        "body": "Electrician service near Hanamkonda",
        "sound": "job_alert"
      },
      "data": {
        "type": "NEW_JOB",
        "job_id": "...",
        "service_type": "Electrician",
        "area": "Hanamkonda"
      }
    }
  }
}
```

**Location Update Interval (when ONLINE):**
- Update worker lat/lng every 5 minutes while ONLINE
- Pause updates when OFFLINE
- Battery-aware: use `geolocator` package with `LocationAccuracy.balanced`

**App Store Privacy Labels (Worker App):**
- Data collected: Phone Number, Name, Location, Financial info (bank/UPI), Selfie photo
- Identity verification: Aadhaar identity is verified via DigiLocker (government platform). VSolveHub receives only the worker's name, date of birth, and Aadhaar last-4 digits — not the full Aadhaar number or document image (primary path).
- All data used for: App functionality, Security verification, Worker onboarding
- No data sold to third parties
