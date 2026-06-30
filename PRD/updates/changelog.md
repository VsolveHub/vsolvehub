# VSolveHub — PRD Changelog

> All notable changes to the PRD are documented here.  
> Format: `[Version] — Date — Author — Summary`

---

## [1.4.0] — June 17, 2026 — Phase 1 Scope Lock: Direct Worker Booking Only

**Scope lock.** Phase 1 ships **only the direct booking of workers** (dispatch / Captain
mode, Archetypes A & B). Everything needing the Partner Web Portal or Inbox-Pull
(staffing, rental, property, events) is **Phase 2**.

**New decision:** **D-27 — Phasing.** Phase 1 = Archetypes A/B, CAPTAIN provider only,
Push-Dispatch, categories 1/2/3/4/6(transport·wash)/10. Phase 2 = C/D/E/F + Provider App
modes 2–5 + Partner Web Portal + Inbox-Pull. Phase-2 schema is *designed* now but not
built.

**Full rewrites (as requested):**
- `user_flow.md` — rewritten end-to-end around Phase-1 direct booking: Dispatch Engine
  (F-DE), Customer Direct Booking (F-01) + Crew (F-01b), Captain Onboarding (F-02) &
  30s Acceptance (F-03), Tracking (F-04), Web Onboarding (F-05), Admin Operations
  **without assignment** (F-06). Phase-2 archetypes summarised, not detailed.
- `user_stories.md` — rewritten: Customer (direct booking), Captain/Provider (dispatch),
  Admin (monitoring/verification/disputes). **Old admin-assignment story US-A003 removed**;
  new US-A002 Dispatch Monitor. Phase-2 stories moved to a clearly-marked backlog.

**Phasing propagated to:** `conventions.md` D-22 table, `service_catalog.md` summary,
`overview.md` Phase 1/2 roadmap, `apps/provider_app.md` (Captain = Phase 1, rest Phase 2),
`features.md` (dispatch engine = core P0; archetype/portal features Phase 2).

**Still mechanical (not design):** the React Native → Flutter sweep across `base.md` /
`apps/customer_app.md` / `integrations.md` code samples.

---

## [1.3.0] — June 17, 2026 — Provider Model (Adaptive Provider App)

**Supply-side redesign.** "Worker App" generalised to one **adaptive Provider App** with
five modes, because a captain, a maid, a rental business, a PG host, and an event studio
supply in fundamentally different ways.

**New canonical decisions (`conventions.md`):**
- **D-24 — Provider Model.** One app, five `provider_type`s (CAPTAIN, PROFESSIONAL,
  RENTAL_VENDOR, PROPERTY_HOST, EVENT_VENDOR); shared spine, different home/mode.
- **D-25 — Lead Routing.** Two mechanics: **Push-Dispatch** (30s, system-picks — A/B) vs
  **Inbox-Pull** (hours SLA, customer-picks *their* item/listing/studio — D/E/F + picked C).
  New `provider_requests` inbox model (analog of `job_assignments`).
- **D-26 — Partner Web Portal** (`partner.vsolvehub.com`) for inventory/listing-heavy
  vendors, plus per-type verification / availability / earnings.

**New / updated docs:**
- `apps/provider_app.md` — **new** adaptive Provider App spec (5 modes + web portal).
- `apps/worker_app.md` — banner: now "Captain mode"; Flutter.
- `data_models.md` §25–30 — `providers`, `vendor_profiles`, `rental_items`,
  `property_listings`, `provider_requests`, `provider_blackout_dates`; `bookings` gains
  `archetype`, `provider_id`, item/listing FKs, `headcount`; `enquiry_details` →
  `archetype_details`.

**Answer to the open question:** providers *do* log in and get leads — but Captains get
**auto-dispatched 30s offers**, while Rental/Property/Event providers get an **inbox of
requests for the specific product the customer picked**, managed against their
inventory/listing/calendar (the "portal to track their products").

---

## [1.2.0] — June 17, 2026 — Direct-Booking Pivot + Catalog Expansion

**Architecture pivot + scope expansion.** Removed the admin from the assignment loop
(Rapido-style direct booking with auto-dispatch) and expanded the catalog to an
11-category super-app.

**New canonical decisions (`conventions.md`):**
- **D-20 — Direct Booking, No Admin Assignment.** Customers book directly; the platform
  **auto-dispatches** to eligible verified workers via the `job_assignments` 30s engine.
  New dispatch status flow `PENDING_VERIFICATION → SEARCHING → ASSIGNED → … → COMPLETED`
  (+`NO_WORKER_FOUND`). Admin role redefined to monitoring/verification/disputes/finance.
- **D-21 — Booking Archetypes (A–F).** 6 booking models (Dispatch, Crew, Staffing,
  Rental, Property, Quote); each category maps to one; non-dispatch archetypes have their
  own status sets. Supersedes the binary D-12 split.
- **D-22 — Master Catalog Scope.** 10 core categories (phased internally) + Tutors &
  Classes (Phase 2). New 1,000-ID-block ranges.
- **D-23 — Mobile Stack = Flutter** (supersedes React Native/Expo).

**Rewritten / updated docs:**
- `business_docs/service_catalog.md` — full rewrite to 11 categories with archetype tags,
  sub-categories, representative services, ID ranges, and a catalog→archetype→flow map.
- `user_flow.md` — new authoritative "Direct Booking & Archetype Flows" section
  (dispatch engine + 6 archetype flows); F-04 marked **superseded**, F-03 trigger updated.
- `apps/admin_panel.md` — assignment panel replaced with a read-only **Dispatch Monitor**
  + exception-only force-assign.
- `overview.md` — scope updated to 11 categories + direct booking; auto-matching moved
  from out-of-scope to **core**; mobility/health/professional verticals deferred.

**Still to propagate (next):** `user_stories.md` (replace admin-assignment stories US-A003
with auto-dispatch + add archetype C/D/E/F stories), `features.md` (dispatch engine
feature; archetype features), `data_models.md` (`bookings.archetype`, new
`rental_items`/`property_listings`/`staffing_engagements` models, dispatch statuses),
and the RN→Flutter reconciliation across `base.md` / `apps/customer_app.md` /
`apps/worker_app.md` / `integrations.md`.

---

## [1.1.0] — June 17, 2026 — PRD Hardening Audit

**Production-readiness audit.** Resolved load-bearing contradictions and filled missing
data models found across the v1.0 documents. **No implementation yet — PRD-only.**

**New documents:**

| File | Summary |
|------|---------|
| `conventions.md` | **Authoritative** Canonical Decisions & Reconciliation Register (D-00–D-19). Supersedes any conflicting doc. Resolves brand/domain, status vocabularies, OTP, auth, money, URLs, real-time, enquiry-vs-dispatch, KYC, privacy, and more. |

**Key decisions locked (see `conventions.md`):**
- **Brand/domain canon:** VSolveHub / `vsolvehub.com` (was split with "Quick Service Hub", `quick-service-hub.com`, `vsolvehub.in`). Reconciled across all docs.
- **One booking status vocabulary** (lead = booking); the job-offer lifecycle moved to a new `job_assignments` ledger (D-01/D-02).
- **OTP single spec** — Redis live store + `otp_logs` audit, bcrypt cost 12, one lockout policy (was 4 conflicting specs) (D-03).
- **Auth fixed** — booking created *after* OTP; returning-user fast path via refresh token, not `localStorage` (closed an auth-bypass) (D-04).
- **Money model added** — price snapshot + `job_earnings`/commission (was entirely absent) (D-08).
- **SEO URLs** — `services.slug` + city landing pages + `cities` table (D-09).
- **Server-authoritative 30s timer** + single-active-job invariant (D-11).
- **Enquiry vs dispatch** fulfilment split for rental/events/accommodation (D-12).

**Schema additions (`data_models.md` §15–24):** `job_assignments`, `fcm_devices`,
`skills`/`skill_sub_categories`, `job_earnings`, `disputes`, `cancellations`,
`worker_applicants`, `contact_enquiries`, `cities`, `worker_kyc`, `platform_config`;
plus field corrections (`services.slug`, booking amount/verification/enquiry fields,
`workers.last_heartbeat`, `PENDING_VERIFICATION`/`PARTIAL_REVIEW` states).

**In-place fixes:** worker column `approval_status='APPROVED'` → `status='ACTIVE'`
(`non_functional.md`); Celery + Channels added to the stack and RS256 keypair to env
(`base.md`); booking max-date 30→90 days (`features.md`); home revalidate 3600→1800
(`base.md`); booking-before-OTP and localStorage skip-OTP flagged (`user_flow.md`).

---

## [1.0.0] — June 16, 2026 — VSolveHub Product Team

### Initial PRD Release

**First complete production-ready PRD** for the VSolveHub platform. All documents written based on BRD v1.9 and the existing Next.js 15 implementation audit.

**Documents created:**

| File | Summary |
|------|---------|
| `overview.md` | Vision, mission, principles, 3 personas, business objectives, KPIs, phase roadmap |
| `base.md` | Tech stack, system architecture diagram, repo structure, environments, API design, security baseline, rendering strategy, CI/CD pipeline |
| `user_stories.md` | 46 user stories — Customer (US-C001–020), Worker (US-W001–016), Admin (US-A001–011) — each with acceptance criteria and edge cases |
| `user_flow.md` | 7 complete flows with Mermaid diagrams — Customer Booking, Worker Onboarding (Rapido-style), Worker Job Acceptance (30s timer), Admin Lead Management, New Customer Onboarding, Equipment Rental, Worker Web Registration |
| `features.md` | 25 feature specs (F-001–025) with P0/P1/P2 priority, acceptance criteria, edge cases, API touch-points |
| `data_models.md` | 14 PostgreSQL table schemas with ER diagram, indexes, Django model notes, encryption strategy |
| `integrations.md` | 8 integrations (WhatsApp WATI, SMS OTP, Firebase FCM, Google Maps, GA4, SendGrid, reCAPTCHA, AWS S3) with code samples, error handling, cost estimates |
| `non_functional.md` | 8 NFR categories (Performance, Security, Scalability, SEO, Accessibility, Compatibility, Privacy, Monitoring) with measurable targets |
| `apps/web_app.md` | All 11 web app pages with screen specs, PWA config, metadata strategy |
| `apps/admin_panel.md` | Admin panel navigation, all module specs including worker verification queue and lead assignment |
| `apps/customer_app.md` | Customer Flutter app — all screens, navigation, push handling, performance targets |
| `apps/worker_app.md` | Worker Flutter app — 7-stage onboarding, 30s job alert screen, active job flow, earnings |
| `business_docs/brd_summary.md` | Condensed BRD reference — scope, packages, pricing, client responsibilities |
| `business_docs/service_catalog.md` | Full 8-category taxonomy with sub-categories and 849+ service examples |

**Key design decisions documented:**
- Worker onboarding follows Rapido/Uber captain model: strict verification gate, admin approval required before app activation
- 30-second job accept timer is a hard requirement (not configurable per worker)
- ONLINE/OFFLINE toggle is worker-controlled; only ONLINE workers appear in admin's assignment pool
- OTP-only authentication (no password) for both customers and workers
- Equipment rental is enquiry-based (not instant booking) due to manual inventory confirmation requirement
- Service ID ranges allocated per category (construction 1001+, technician 2001+, etc.) to support future additions

---

## Upcoming / Planned Updates

| Planned Document | Priority | Target |
|-----------------|----------|--------|
| API contracts spec (endpoint-by-endpoint) | P1 | Week 2 |
| Figma design spec cross-reference | P1 | Week 2 |
| Error code registry | P1 | Week 3 |
| Test scenarios & QA checklist | P1 | Week 4 |
| Go-live checklist | P0 | Week 12 |

---

## How to Contribute to the PRD

1. **For new features:** Add to `features.md` with P0/P1/P2 tag; add corresponding story to `user_stories.md`
2. **For flow changes:** Update `user_flow.md` Mermaid diagram; add entry to this changelog
3. **For schema changes:** Update `data_models.md`; document migration impact
4. **For integration changes:** Update `integrations.md`; check if env vars or template names change
5. **Always:** Add changelog entry with version bump, date, author, and summary of change
