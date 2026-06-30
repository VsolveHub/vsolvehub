# Feature Research

**Domain:** Local-services marketplace (Tier 2/3 India, on-demand dispatch)
**Researched:** 2026-06-22
**Confidence:** HIGH — derived directly from PRD v1.4, conventions.md, and features.md

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Service category browsing | Any marketplace must let users browse before booking | LOW | ISR/SSG; 8 top-level categories + sub-category filters |
| Service detail page | Users expect full description, price range, CTA before committing | LOW | SEO-critical: slug URLs, JSON-LD Schema.org, ISR revalidation |
| Booking form < 2 min | Users abandon long forms; fast booking is the baseline expectation | LOW | 7 fields max; reCAPTCHA v3; Google Places autocomplete on address |
| OTP phone verification | Every Indian app uses OTP; password-based feels wrong for this market | MEDIUM | Server-authoritative; bcrypt-hashed in Redis; MSG91 + Fast2SMS fallback |
| Booking reference (human-readable) | `VSH-0042` beats a UUID for sharing over WhatsApp/phone | LOW | Sequential, zero-padded; stored in sessionStorage for the confirm screen |
| Booking status tracking | "Bhai kab aoge?" calls are the exact pain VSolveHub replaces | MEDIUM | Polling at 30s (Phase 1); status timeline with timestamps |
| WhatsApp notifications | WhatsApp penetration in Tier 2/3 India is near-universal | MEDIUM | WATI templates (pre-approved); every major status change triggers one |
| FCM push notifications | Users expect real-time alerts from apps | MEDIUM | HIGH priority for worker job alerts (wakes screen); standard for customer status |
| Worker profile (name + skill + rating) | Customers need enough trust signal before a stranger enters their home | LOW | Phone number NOT shown (D-15); proxy contact only |
| Booking cancellation | Any service platform must allow cancellation | MEDIUM | `cancellations` table; penalty policy keyed by status-at-cancel (D-16) |
| Worker verification gate | Trust is the core differentiator; unverified workers destroy brand | HIGH | DigiLocker OAuth (primary) + manual upload fallback; admin approval queue |
| Admin operations dashboard | Without visibility, manual exceptions can't be handled | MEDIUM | Dispatch monitor (read-only); force-assign only on exception (D-20) |

---

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-dispatch engine (Push-Dispatch) | Removes admin from the booking critical path; scales to 100+ bookings/day without headcount | HIGH | Ranked waves (proximity → rating → idle-time); 30s server-authoritative timer; `job_assignments` ledger; Celery + Redis |
| DigiLocker Aadhaar KYC | Faster worker activation; government-verified badge removes document review bottleneck | HIGH | DigiLocker OAuth; name + last-4 auto-populated; full Aadhaar number never stored |
| 30-second server-side job-offer timer | Prevents workers from gaming the timer; handles offline workers and clock skew; no double-assignment | HIGH | Celery task at `expires_at`; partial unique index enforces single-active-job invariant (D-11) |
| Address revealed only post-accept | Privacy protection that also prevents cherry-picking; builds worker accountability | LOW | Enforced server-side; show only area before accept, full address after (D-15) |
| Config-driven service catalog | Adding a new service category needs zero code changes | MEDIUM | `services` table seeded from config; ISR revalidation on admin CMS save |
| City landing pages for local SEO | `/warangal/electrician` outranks generic pages for Tier 2/3 Google searches | MEDIUM | `cities` table; excluded from sitemap if no active workers (D-09) |
| No-worker-found flow (retry / schedule / notify) | Silent failure is catastrophic; this builds trust even when supply is thin | MEDIUM | `NO_WORKER_FOUND` status; customer chooses retry, schedule, or notify-me (D-20 §4) |
| Worker earnings dashboard | The "no middleman" promise needs to be visible and credible to retain workers | LOW | Amounts recorded from Day 1 even without payment gateway (D-08); Today/Week/Month/All-time |
| Booking archetype system (A–G) | One data model for all service types prevents N parallel systems as the platform expands | HIGH | `bookings.archetype` column; archetypes C–F schema designed but not wired in Phase 1 (D-27) |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Manual admin job assignment (normal flow) | Feels like "control" and is familiar from call-center ops | Doesn't scale past ~50 bookings/day; creates a human bottleneck in the critical path; one sick admin = no bookings assigned | Auto-dispatch engine (D-20); admin becomes an exception handler only |
| Real-time GPS worker map tracking (Phase 1) | Customers expect Uber-style "see worker on map" | Requires continuous background GPS, drains battery, needs map billing, and adds infra complexity before product-market fit is validated | Status timeline ("On the Way" → "Arrived") with WhatsApp notifications covers the core anxiety without GPS |
| Worker phone number visible to customer | "How do I contact my plumber?" | Enables off-platform work, exposes worker privacy, kills platform stickiness; Rapido doesn't do this either | Masked proxy number or in-app chat; name + skill + rating is enough to satisfy the customer (D-15) |
| Payment gateway at launch | "We need to take money" | Adds Razorpay/PhonePe integration, refund flows, UPI failures, RBI compliance, and settlement logic before validating the dispatch mechanic; delays launch by 4–6 weeks | Record amounts from Day 1 (D-08); gateway in Phase 3 after dispatch is validated |
| Client-side 30-second offer timer | Simpler to implement in Flutter | Workers can manipulate a client timer; clock skew causes disputes; offline workers create inconsistencies | Server-authoritative Celery task is the only correct approach (D-11); client countdown is purely cosmetic |
| Multi-language UI (Telugu/Hindi) at launch | Tier 2/3 users speak Telugu; English feels alien | Content translation doubles content-management effort, slows every release, and adds `next-intl` complexity before the core mechanic is proven | Design for i18n (string keys, RTL-safe layouts) from Day 1; ship content in Phase 3 when translation is the bottleneck |
| In-platform video calling | "Workers can confirm job scope via video" | Infra cost (TURN/STUN servers), moderation risk, poor experience on 4G budget devices, and marginal use case for most service types | WhatsApp click-to-chat handles this naturally and is already the customer's preferred channel |
| Separate "leads" table | Feels like CRM orthodoxy | Creates a dual-write problem: booking status and lead status diverge; queries become joins; bugs multiply | Admin flags (`viewed_at`, `is_spam`, `closed_at`) are columns on `bookings` (D-01); one record, one state machine |

---

## Feature Dependencies

```
[F-003: OTP Verification]
    └──required-by──> [F-002: Booking Form] (booking created only after verify, D-04)
    └──required-by──> [F-008: Worker Onboarding] (phone-based auth for workers too)

[F-008: Worker Verification Gate]
    └──required-by──> [F-009: 30s Job Alert] (worker must be ACTIVE before receiving offers)
    └──required-by──> [Dispatch Engine] (eligible-worker pool = ACTIVE + is_online + skill-match)

[Dispatch Engine (auto-dispatch, D-20)]
    └──requires──> [F-008: Worker Verification Gate] (ACTIVE workers only)
    └──requires──> [F-003: OTP Verification] (booking.phone_verified = TRUE triggers dispatch)
    └──requires──> [D-18: Skill ↔ Service Taxonomy] (dispatch pool filtered by skill match)
    └──requires──> [Redis + Celery] (30s timer, wave scheduling)
    └──enables──> [F-009: Job Alert & 30s Timer]
    └──enables──> [F-010: Worker Job Status Updates]
    └──enables──> [F-005: Booking Status Tracking]

[F-006: WhatsApp Notifications]
    └──enhances──> [F-004: Booking Confirmation] (template: booking_confirmed)
    └──enhances──> [F-005: Status Tracking] (every milestone fires a template)
    └──enhances──> [F-009: Job Alert] (customer notified on acceptance)

[F-014: Rating & Review]
    └──requires──> [F-010: Worker Status Updates] (rating prompt appears on COMPLETED)
    └──enhances──> [Dispatch Engine] (worker rating is a ranking signal in the eligible-worker pool)

[F-016: Admin Service Catalog CRUD]
    └──enhances──> [F-001: Category Browsing] (ISR revalidation on save; catalog changes live in < 5 min)

[F-015: Worker Earnings Dashboard]
    └──requires──> [D-08: Money model] (amounts recorded from Day 1; `job_earnings` table)
    └──requires──> [F-010: Worker Status Updates] (earnings created on COMPLETED)

[Booking Archetype System (D-21)]
    └──required-by──> [Phase 2: Staffing, Rental, Property, Events] (schema designed now; not wired)

[City Landing Pages (D-09)]
    └──requires──> [`cities` table + active worker/service data]
    └──enhances──> [F-001: Category Browsing] (local-SEO entry points drive organic discovery)
```

### Dependency Notes

- **Dispatch engine requires OTP verification:** A booking moves from `PENDING_VERIFICATION` to `SEARCHING` only after `phone_verified = TRUE`. The dispatch engine never fires on an unverified booking.
- **Rating enhances dispatch:** Worker average rating is a first-class ranking signal. Build ratings (F-014) before worker pool grows large enough for ranking to matter — ideally at launch, not as a Phase 2 afterthought.
- **Archetype system designed now, wired incrementally:** The `bookings.archetype` column and schema for C–F must be in the DB schema from Day 1 even though only A & B are wired (D-27). Retrofitting this later is expensive.
- **City pages conflict with thin-page SEO:** A city landing page with no active workers or services creates a thin page that harms SEO. Exclude from sitemap if supply is absent (D-09).

---

## MVP Definition

### Launch With (v1 — Phase 1)

Minimum viable product — what's needed to validate the auto-dispatch concept.

- [x] **F-001: Service Category Browsing** — discovery surface; without it, nothing else matters
- [x] **F-002: Service Detail & Booking Form** — the conversion point; < 2 min to complete
- [x] **F-003: OTP Phone Verification** — trust gate; the only auth method on this platform
- [x] **F-004: Booking Confirmation** — customer must get `VSH-XXXX` reference immediately
- [x] **F-005: Booking Status Tracking** — the "bhai kab aoge" killer; validates the core promise
- [x] **F-006: WhatsApp Click-to-Chat + Notifications** — primary communication channel for the target market
- [x] **F-007: Admin Dispatch Monitor** — read-only with exception force-assign; admin can't be blind
- [x] **F-008: Worker Verification Gate (DigiLocker)** — no unverified worker reaches a customer; non-negotiable
- [x] **F-009: 30s Job Alert (server-side timer)** — the dispatch mechanic; this is the product
- [x] **F-010: Worker Job Status Updates** — completes the loop; customer tracking only works if worker pushes updates
- [x] **F-011: Notification System** (WhatsApp/SMS/FCM/Email) — infrastructure that everything else depends on
- [x] **F-015: Worker Earnings Dashboard** — amounts recorded from Day 1 (D-08); workers need to see their income to trust the platform
- [x] **F-016: Admin Service Catalog CRUD** — must be able to add/edit services without a deploy
- [x] **F-017: FCM Push Notifications** — HIGH priority alerts for worker job offers; standard for customer

### Add After Validation (v1.x — Phase 1 Release)

Features to add once dispatch mechanic is working.

- [ ] **F-012: Advanced Search** — add when category browsing alone is insufficient (trigger: users searching for services not found via browse)
- [ ] **F-013: Customer Profile & History** — add when repeat bookings appear (trigger: > 20% repeat rate)
- [ ] **F-014: Rating & Review** — add before worker pool grows large enough for ranking to matter; ideally Month 1–2
- [ ] **F-018: Gallery** — social proof for new visitors; add when first 20+ jobs complete and photos exist
- [ ] **F-019: FAQ with Search** — add when support WhatsApp volume shows repeated questions
- [ ] **F-020: Google Maps (Places Autocomplete)** — improves address quality and geocoding for dispatch proximity; add early

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **F-021: Wallet & Referral** — meaningful only after repeat-booking rate > 30% and payment gateway live
- [ ] **F-022: Membership Plans** — defer until GMV is sufficient to make annual plans credible to customers
- [ ] **F-023: Admin Analytics Dashboard** — defer until there are enough data points (200+ bookings) to make trends meaningful
- [ ] **F-024: Multi-language (Telugu/Hindi)** — highest-impact growth lever for Tier 2/3; but content overhead is high; Phase 3
- [ ] **F-025: Re-booking from History** — pure convenience; adds no new users; Phase 2
- [ ] **Inbox-Pull Archetypes (C–F)** — Staffing, Rental, Property, Events; different mechanic; Phase 2
- [ ] **Partner Web Portal** — vendor-heavy types need web CRUD; Phase 2
- [ ] **Real-time GPS worker map** — significant infra and UX work; validate dispatch first
- [ ] **Payment gateway (Razorpay/PhonePe)** — Phase 3; amounts already recorded

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Service Category Browsing (F-001) | HIGH | LOW | P1 |
| Booking Form (F-002) | HIGH | LOW | P1 |
| OTP Verification (F-003) | HIGH | MEDIUM | P1 |
| Booking Confirmation (F-004) | HIGH | LOW | P1 |
| Booking Status Tracking (F-005) | HIGH | MEDIUM | P1 |
| WhatsApp Notifications (F-006) | HIGH | MEDIUM | P1 |
| Auto-Dispatch Engine (D-20) | HIGH | HIGH | P1 |
| Worker Verification Gate (F-008) | HIGH | HIGH | P1 |
| 30s Job Alert (F-009) | HIGH | HIGH | P1 |
| Worker Job Status Updates (F-010) | HIGH | MEDIUM | P1 |
| Admin Dispatch Monitor (F-007) | HIGH | MEDIUM | P1 |
| Notification System (F-011) | HIGH | MEDIUM | P1 |
| FCM Push Notifications (F-017) | HIGH | MEDIUM | P1 |
| Worker Earnings Dashboard (F-015) | HIGH | LOW | P1 |
| Admin Service Catalog CRUD (F-016) | MEDIUM | MEDIUM | P1 |
| Rating & Review (F-014) | HIGH | LOW | P2 |
| Google Maps / Places (F-020) | MEDIUM | LOW | P2 |
| Customer Profile & History (F-013) | MEDIUM | MEDIUM | P2 |
| Advanced Search (F-012) | MEDIUM | MEDIUM | P2 |
| Gallery (F-018) | LOW | LOW | P2 |
| FAQ with Search (F-019) | LOW | LOW | P2 |
| City SEO Landing Pages (D-09) | HIGH | MEDIUM | P2 |
| Wallet & Referral (F-021) | MEDIUM | HIGH | P3 |
| Membership Plans (F-022) | MEDIUM | HIGH | P3 |
| Admin Analytics (F-023) | MEDIUM | MEDIUM | P3 |
| Multi-language / Telugu (F-024) | HIGH | HIGH | P3 |
| Re-booking (F-025) | LOW | LOW | P3 |
| Payment Gateway | HIGH | HIGH | P3 |
| Inbox-Pull Archetypes (C–F) | HIGH | HIGH | P3 |

**Priority key:**
- P1: Must have for Phase 1 launch
- P2: Should have; add in Phase 1 release cycle or Phase 2
- P3: Phase 2+ or Phase 3; defer until core dispatch is validated

---

## Competitor Feature Analysis

| Feature | Urban Company | Sulekha / UrbanClap clones | Our Approach |
|---------|--------------|---------------------------|--------------|
| Service discovery | Curated, metro-focused; polished category pages | Aggregator/marketplace with form-based leads; low trust | Config-driven catalog; ISR/SEO-first; scales to Tier 2/3 city density |
| Worker verification | Thorough; background checks + in-person training | Minimal; self-reported; photos optional | DigiLocker Aadhaar OAuth (government-grade) + admin approval; no unverified worker touches a customer |
| Booking dispatch | Automated; worker pool + instant matching | Manual: lead goes to several providers who call back; customer picks | Auto-dispatch with 30s server-side timer; first-accept-wins; no worker calling the customer to negotiate |
| Communication | In-app chat + push; no WhatsApp integration | WhatsApp-heavy but unstructured | WhatsApp-native; automated templates at every milestone; replaces the chaos of raw WhatsApp group bookings |
| Payment | Full in-app UPI/card/wallet | Mixed; cash or in-app | Cash-first at launch; amounts recorded from Day 1; gateway in Phase 3 once volumes justify the overhead |
| Multi-language | English + regional in metro | English-default; limited regional | Designed for i18n; Telugu/Hindi content in Phase 3 when it's the growth bottleneck |
| Worker app | Polished; iOS + Android native | None or basic; web forms | Flutter (single codebase, cost-efficient); ONLINE toggle, 30s alert, job flow, earnings |
| Target market | Tier 1 metros (Mumbai, Bangalore, Delhi) | Pan-India but metro-centric | Tier 2/3 Telangana (Warangal, Karimnagar); local SEO; WhatsApp-first UX |

---

## Sources

- `PRD/features.md` — canonical feature specs (F-001 through F-025)
- `PRD/overview.md` — personas, business objectives, phase scope
- `PRD/conventions.md` — decisions D-01 through D-27 (authoritative; overrides all other docs)
- `PRD/data_models.md` — data model constraints that affect feature feasibility
- `PRD/integrations.md` — external integrations (WATI, MSG91, FCM, DigiLocker, Maps)
- Urban Company, Sulekha, Rapido — competitive feature benchmarks (field knowledge)

---
*Feature research for: VSolveHub local-services marketplace (Phase 1 auto-dispatch core)*
*Researched: 2026-06-22*
