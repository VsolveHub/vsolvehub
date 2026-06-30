# VSolveHub — User Stories

> **Version:** 1.4 | **Last Updated:** 2026-06-17
> **Phase 1 scope:** direct booking of workers (dispatch / Captain mode, Archetypes A & B).
> **No admin assignment** — the platform auto-dispatches (`conventions.md` D-20/D-27).
> Phase-2 archetypes (Staffing, Rental, Property, Events) + Partner Web Portal are a
> backlog at the end.
> Format: ID · Priority · Story · Acceptance Criteria · Edge Cases.

## Priority legend
| Priority | Meaning |
|----------|---------|
| **P0** | Blocking — platform cannot go live without it |
| **P1** | Ships with or shortly after launch |
| **P2** | Post-launch enhancement |

---

# Section 1 — Customer Stories (Phase 1)

### US-C001 — Browse Service Categories · P0
**As a** customer **I want** to see all Phase-1 service categories on the home page **so that** I can find what I need.
**AC:** Phase-1 categories shown in a visual grid (icon + name + count); tappable to listing; loads < 2.5s on 4G; 2 cols mobile / 4 desktop.
**Edge:** category with 0 active services hidden; icon fallback if CDN fails.

### US-C002 — Browse Services Within a Category · P0
**As a** customer **I want** to see sub-categories and services in a category **so that** I can find the specific service.
**AC:** sub-category filter pills (horizontal scroll); service cards show name, sub-category, price range, snippet; instant client-side filter; empty state if none.
**Edge:** smooth scroll with 15+ pills; back restores scroll position.

### US-C003 — View Service Detail · P0
**As a** customer **I want** detailed info about a service **so that** I can decide before booking.
**AC:** name (`<h1>`), full description, price range, breadcrumb, prominent **Book** CTA, always-visible WhatsApp, related services. URL `/services/[cat]/[slug]` (D-09).
**Edge:** inactive service → 404 with suggestions; direct-URL SSR works.

### US-C004 — Search for a Service · P1
**As a** customer **I want** to search by name/keyword **so that** I skip browsing.
**AC:** debounced 300ms, min 2 chars; covers name/sub-category/tags; result shows name, category, price; "no results" → popular suggestions.
**Edge:** Telugu/Hindi chars; special chars don't break; 1 char no API call.

### US-C005 — Book a Service Directly · P0
**As a** customer **I want** to book a service for now or a chosen slot **so that** a verified worker comes — **without any callback or admin in between**.
**AC:** form = Name (req), Phone (req, 10-digit 6–9), Service (pre-filled), When (**Now** or date+slot, future ≤ 90 days, D-19), Address (req + optional Places), Notes (opt); reCAPTCHA v3; price shown/estimated and **snapshotted** (D-08); on submit → OTP (new) or direct (returning, D-04) → booking `SEARCHING` → auto-dispatch begins.
**Edge:** offline → "no internet, try again", no double-submit (Idempotency-Key); urgent < 2h note; keyboard-accessible.

### US-C006 — Verify Phone with OTP (New User) · P0
**As a** new customer **I want** to verify my phone with an OTP **so that** my booking is confirmed and my account created.
**AC:** 6-digit OTP < 30s; 6 boxes auto-advance/auto-submit; wrong → "X attempts remaining"; **after 3 wrong, OTP invalidated → request a new one (60s cooldown, D-03)**; resend disabled 60s; correct → JWT issued, booking proceeds; masked phone `+91 98765 X****`.
**Edge:** expired OTP → resend prompt; Android SMS-Retriever autofill (separate DLT template, D-19); restore from sessionStorage on reopen; network error doesn't consume attempt.

### US-C007 — Skip OTP as Returning User · P0
**As a** returning customer **I want** to skip OTP **so that** I book faster.
**AC:** if the device holds a **valid server-issued refresh token** for this phone (D-04), OTP is skipped and booking proceeds. (The legacy `localStorage` check is prototype-only and must NOT be the trust boundary.)
**Edge:** new device / cleared data → treated as new (OTP); incognito separate.

### US-C008 — See Booking Confirmed & Worker Assigned · P0
**As a** customer **I want** to see my booking confirmed and the assigned worker **so that** I know who's coming.
**AC:** confirm screen shows ref `VSH-XXXX`, service, when, status; while `SEARCHING` shows "finding a worker…"; on `ASSIGNED` shows captain **name + skill + rating** (masked contact, D-15); WhatsApp confirmation < 60s; if `NO_WORKER_FOUND` → Retry / Schedule / Notify-me.
**Edge:** refresh re-fetches (no re-submit); ref large + copyable.

### US-C009 — Track Booking Status · P0
**As a** customer **I want** real-time status **so that** I know what's happening.
**AC:** timeline `SEARCHING → ASSIGNED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED`; current highlighted + timestamped; captain name+skill (not full contact); WhatsApp button; shareable URL (ref in query).
**Edge:** cancelled → reason+time; no change 2h → "Need help?"; offline → cached + "Reconnecting…".

### US-C010 — Cancel a Booking · P0
**As a** customer **I want** to cancel **so that** I'm not charged for what I don't need.
**AC:** cancel allowed while `SEARCHING`/`ASSIGNED`; reason captured; penalty per status (D-16); refund to wallet if applicable; status → `CANCELLED`.
**Edge:** cancel during `IN_PROGRESS` → not self-serve, route to support/dispute.

### US-C011 — Rate a Completed Service · P1
**As a** customer **I want** to rate the captain **so that** I give feedback and help others.
**AC:** prompt on `COMPLETED`; 1–5 stars (req) + comment ≤ 300 (opt); one rating/booking; updates captain avg.
**Edge:** skippable; shown once.

### US-C012 — View Booking History · P1
**As a** customer **I want** my past/current bookings **so that** I can track and re-book.
**AC:** reverse-chronological; card shows service, date, status badge, ref; tap → detail+timeline; colour-coded badges; empty state CTA.
**Edge:** 50+ items paginate/lazy-load.

### US-C013 — Re-book in One Tap · P1
**As a** customer **I want** to re-book a past service **so that** I save time.
**AC:** "Book again" on a past booking pre-fills service+address; new ref; goes through normal dispatch.

### US-C014 — Save a Service (Wishlist) · P1
**AC:** heart on cards/detail; saved to profile; toggle off; persists (localStorage cache + server sync).
**Edge:** deactivated service shows "currently unavailable".

### US-C015 — Contact via WhatsApp · P0
**AC:** WhatsApp FAB on every page; pre-filled context message; mobile opens app, desktop opens web; `wa.me` fallback; doesn't cover CTAs.

### US-C016 — Manage Profile · P1
**AC:** edit name, email, photo; phone read-only (identifier); address book (add/edit/default/delete); notification prefs.
**Edge:** photo type/size validated; name required.

### US-C017 — FAQ / Gallery / Contact / About · P1
**AC:** searchable accordion FAQ (FAQPage JSON-LD); masonry gallery with filters + lightbox; contact form (Name/Phone/Email/Message + reCAPTCHA → `contact_enquiries`) + map embed; about page.
**Edge:** no FAQ results → "try different keywords" + WhatsApp; gallery skeletons.

### US-C018 — Wallet & Referral · P2
**AC:** wallet balance + transactions; referral code share; ₹ credit on referee's first completed booking; self-referral rejected. *(UI in Phase 1; gateway Phase 3.)*

---

# Section 2 — Captain / Provider Stories (Phase 1)

> Phase 1 provider = **Captain** mode of the Provider App (Flutter, D-23). Other provider
> types are Phase 2.

### US-P001 — Register on Provider App · P0
**AC:** Play Store/App Store; "Join as a Worker"; 10-digit phone; OTP < 30s; account `UNVERIFIED`.
**Edge:** already registered → "login instead"; resend after 60s.

### US-P002 — Set Up Profile · P0
**AC:** name (3–50), DOB (18+), gender, **live selfie** (camera only, not gallery); progress saved per step.
**Edge:** < 18 blocked; poor lighting prompt.

### US-P003 — Select Skills & Service Area · P0
**AC:** primary skill (single) + sub-skills (multi) **mapped to service sub-categories** (D-18); experience; service-area city + pincode + radius (5/10/20 km); languages.
**Edge:** changing primary resets sub-skills; "Other" with text.

### US-P004 — Upload Documents (KYC) · P0
**AC:** Aadhaar front/back (JPEG/PNG ≤ 5MB), optional skill cert, bank (acct+IFSC+holder) or UPI; **Aadhaar number captured + AES-256-GCM encrypted, last-4 shown** (D-14); per-file progress + re-upload.
**Edge:** > 5MB → compress; wrong type → message; slow upload retry.

### US-P005 — Submit for Verification · P0
**AC:** review screen; per-section edit; submit → `PENDING_VERIFICATION`; WhatsApp "under review 24–48h"; locked until `ACTIVE`.
**Edge:** resume on reopen; submit fail → retry, no duplicate.

### US-P006 — Approval / Rejection / Resubmit · P0
**AC:** approve → `ACTIVE`, push+WhatsApp, tutorial; reject → reason shown, "Fix & Resubmit" to the failed step, up to 3× then contact support.
**Edge:** vague reason → WhatsApp support; admin can un-reject.

### US-P007 — Go ONLINE / OFFLINE · P0
**As a** captain **I want** an online toggle **so that** I only get dispatched when available.
**AC:** prominent toggle; going ONLINE requests location permission (required); ONLINE → green "waiting for jobs"; state persists; warning if going offline with an active job.
**Edge:** network drop → "connection lost" banner; phone dies → auto-OFFLINE after 30-min stale heartbeat (D-26/H3).

### US-P008 — Receive a Dispatched Job · P0
**As a** captain **I want** a real-time job alert **so that** I can accept fast.
**AC:** HIGH-priority FCM wakes device; full-screen alert with **30s countdown ring**; shows service, **area (not full address)**, est. earnings, distance; sound (respects mute → vibrate). **Triggered by the dispatch engine, not an admin** (D-20).
**Edge:** offline → not offered; multiple offers queued one at a time.

### US-P009 — Accept Within 30 Seconds · P0
**AC:** Accept → `ASSIGNED`, full address revealed, customer notified, timestamp logged.
**Edge:** accept ~0s → server validates `expires_at`; lag → "Accepting…" spinner.

### US-P010 — Decline a Job · P0
**AC:** Decline → reason (busy/too far/can't do/other) → job returns to engine (next wave); "stay online for more".
**Edge:** 5 declines in a row → admin reliability review; can't un-decline.

### US-P011 — Update Job Status · P0
**AC:** sequential buttons On the Way → Arrived → Start → Complete; each needs confirm; each → customer WhatsApp/push; Complete → earnings recorded + customer rating prompt; "Raise an issue" during In Progress.
**Edge:** offline → queued, synced; accidental tap → admin can correct; can't skip steps.

### US-P012 — View Earnings · P1
**AC:** today / week / month; completed-jobs list with per-job earning + payment status (PENDING/PAID); avg rating; total jobs.
**Edge:** new captain empty state; stale data shows sync time.

### US-P013 — Manage Profile & Availability · P1
**AC:** edit photo/skills/area/languages; cannot edit phone/Aadhaar (re-KYC); identity-significant edit → `PARTIAL_REVIEW` (D-13); optional availability schedule.
**Edge:** unsupported city → warning; edit during active job → applies after completion.

### US-P014 — View My Ratings · P1
**AC:** avg + count + individual reviews; "based on X reviews" if < 5; 0 → encouraging empty state.

---

# Section 3 — Admin Stories (Phase 1) — Monitoring, NOT Assignment

> Per D-20, admins do **not** assign captains. These stories replace the v1.0
> admin-assignment stories (the old US-A003 is removed).

### US-A001 — Operations Dashboard · P0
**AC:** KPI cards (today's bookings, SEARCHING now, ASSIGNED/active, completed today, online captains, NO_WORKER_FOUND today); live booking list with auto-dispatch status; auto-refresh/WebSocket.
**Edge:** 100+/day paginate; midnight booking next day.

### US-A002 — Dispatch Monitor (read-only + exception override) · P0
**As an** admin **I want** to see auto-dispatch live and intervene only on failure **so that** ops fixes supply, not every job.
**AC:** per booking: SEARCHING wave N/M, ASSIGNED, or NO_WORKER_FOUND; read-only offer history from `job_assignments`; eligible-pool size; **Force-Assign enabled only after NO_WORKER_FOUND / long SEARCHING** (MANAGER/SUPER_ADMIN, logged with reason); "why no dispatch" diagnostics.
**Edge:** force-assign is a tracked exception, not the default path.

### US-A003 — Filter & Search Bookings · P0
**AC:** filter by status, category, date range, area; persist in URL; count badge.
**Edge:** 0 results state; combos work.

### US-A004 — Verify a Captain · P0
**AC:** verification queue (oldest first, resubmissions flagged "Attempt N"); profile + documents (tap to enlarge, pre-signed URLs); Approve → `ACTIVE` + notify; Reject → reason form + notify.
**Edge:** blurry Aadhaar → reject reason; accidental approve → suspend & re-review.

### US-A005 — Reject / Suspend a Captain · P0
**AC:** reject reasons (dropdown + custom); suspend (reason, internal) → `SUSPENDED`, can't go online; reinstate → `ACTIVE`; audit log.
**Edge:** suspend with active job → reassign/cancel first; WhatsApp fail → push only.

### US-A006 — Resolve Disputes · P1
**AC:** DISPUTED bookings queue; see issue type + notes (`disputes`, D-16); mediate; resolve → COMPLETED or CANCELLED (+refund); audit trail.

### US-A007 — Manage Service Catalog · P1
**AC:** CRUD categories/sub-categories/services (name, desc, price, unit, slug, archetype, tags, order, is_active); deactivate = soft; ISR revalidation on save.
**Edge:** deactivate with active bookings → warning, doesn't affect them; duplicate name warns but allows.

### US-A008 — Manage Content · P1
**AC:** hero banners, gallery images per category, testimonials; preview; live ≤ 5 min.

### US-A009 — Notification Logs · P1
**AC:** log table (recipient, channel, provider, template, status, delivered_at, error); filter; retry failed.

### US-A010 — Reports & CSV Export · P2
**AC:** bookings trend, category mix, captain performance, conversion funnel (Booked→Assigned→Completed), NO_WORKER_FOUND rate (supply gaps); CSV with current filters; large sets → emailed link.

### US-A011 — Admin Access & Security · P0
**AC:** roles SUPER_ADMIN/MANAGER/SUPPORT; 2FA (TOTP); IP allowlist; 30-min idle timeout; every action audit-logged.

---

# Section 4 — Phase 2 Backlog (not built in Phase 1)

> Designed (`conventions.md` D-21/D-24/D-25/D-26) but deferred (D-27). Listed so the
> schema/UX stay forward-compatible. Full AC to be written when Phase 2 begins.

| ID | Story | Provider type | Archetype |
|---|---|---|---|
| US-2-STAFF | Customer browses & engages a maid/cook/driver (trial → monthly) | PROFESSIONAL | C |
| US-2-RENT | Customer rents an item for a date range (availability + deposit + delivery) | RENTAL_VENDOR | D |
| US-2-PROP | Customer browses PG/rooms, schedules a viewing, pays token | PROPERTY_HOST | E |
| US-2-EVENT | Customer enquires for an event, receives a quote | EVENT_VENDOR | F |
| US-2-INBOX | Provider receives & responds to inbox requests (hours SLA) | all non-captain | C/D/E/F |
| US-2-INV | Vendor manages inventory/stock/availability on Partner Web Portal | RENTAL_VENDOR | D |
| US-2-LIST | Host manages listings/occupancy on Partner Web Portal | PROPERTY_HOST | E |
| US-2-CAT | Studio manages portfolio/packages/calendar on Partner Web Portal | EVENT_VENDOR | F |
| US-2-PORTAL | Provider logs into `partner.vsolvehub.com` | vendor/host/studio | — |

All Phase-2 leads use **Inbox-Pull** (`provider_requests`), never the 30s dispatch engine.
