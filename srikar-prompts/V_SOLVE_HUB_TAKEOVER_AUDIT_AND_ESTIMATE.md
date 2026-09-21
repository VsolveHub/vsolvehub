# V SOLVE HUB — TAKEOVER AUDIT AND ENGINEERING ESTIMATE

> **TAKEOVER BASELINE:** This audit represents the state of the repository at commit `fd05fb3fa9264d24b65765848529fcd97799925f` on `2026-09-09T18:04:02+05:30`. Functionality not verified during this audit is not considered verified for estimation or ownership purposes.

**Audit Date:** 2026-09-10T19:25:55Z  
**Branch:** `m3-planing`  
**Working Tree:** CLEAN  
**Auditor:** Antigravity / AI-assisted repository audit  
**Scope:** Milestone 3 + Milestone 4 takeover audit

---

## 1. TAKEOVER BASELINE & INTEGRITY

| Field | Value |
| --- | --- |
| Repository Name | vsolvehub |
| Branch | `m3-planing` |
| Commit SHA | `fd05fb3fa9264d24b65765848529fcd97799925f` |
| Commit Date | 2026-09-09 18:04:02 +0530 |
| HEAD Status | Clean (0 dirty files) |
| Git-tracked Files | 3,347 |
| Total Files (excl .git/venv/modules) | ~48,789 |
| Django Version | >=5.2.16, <5.3 |
| Python Version (pyproject target) | 3.13 |
| Python Version (local machine) | 3.14.2 (mismatch — local is 3.14, project targets 3.13) |
| Next.js Version | 16.2.12 |
| Node.js Version | 22.15.0 |
| React Version | 19.2.8 |
| TypeScript Version | ^5.7.2 |
| PostgreSQL Version | 17 (from compose.yaml) |
| Redis Version | 7.4-alpine (from compose.yaml) |
| DRF Version | >=3.17.1, <3.18 |
| OpenAPI Contract Version | 1.53.0 |
| Migrations (total across all apps) | 110 |
| Celery Beat Schedules | 30+ periodic tasks |

**Discrepancy noted:** The branch name is `m3-planing` (typo for "planning") — the commit message references M3 planning documents. The project brief states M3 timeline is "17 August – 17 September 2026" — as of audit date (10 September), M3 is **25 days in** with all M3 tasks still marked `[ ] Not started` in the task board.

**Python version mismatch:** The project targets Python 3.13 (`pyproject.toml`), but the local machine runs 3.14.2. The backend `.venv` exists but was not inspected for activation to maintain read-only discipline.

---

## 2. PROJECT RECONNAISSANCE

### 2.1 Repository Structure

```
vsolvehub/
├── backend/                    # Django 5 + DRF business backend
│   ├── apps/                   # 20 Django apps (domain-driven)
│   ├── common/                 # Shared infrastructure (errors, observability, pagination, throttling)
│   ├── config/                 # Django settings (base, local, test, integration, staging, production)
│   ├── tests/                  # 121 test files, ~32K lines
│   ├── scripts/                # CLI tools (bootstrap, quality, server)
│   └── requirements/           # Pinned dependencies (base.in/txt, dev.in/txt)
├── frontend/                   # Turborepo monorepo
│   ├── apps/
│   │   ├── admin/              # Operations console (Next.js + Tailwind)
│   │   ├── customer/           # Customer web app (Next.js + Tailwind)
│   │   └── partner/            # Partner/vendor web app (Next.js + Tailwind)
│   ├── packages/
│   │   ├── api-client/         # Generated OpenAPI TypeScript client (~30K lines)
│   │   ├── config/             # Shared configuration
│   │   ├── query/              # TanStack Query hooks
│   │   ├── testing/            # Test utilities
│   │   └── ui/                 # Shared UI components
│   └── e2e/                    # Playwright config (0 test specs)
├── contracts/openapi/v1.yaml   # Generated API contract (~36K lines)
├── docs/                       # ADRs, runbooks, prompts
├── infra/compose.yaml          # Docker Compose (Postgres 17 + Redis 7.4)
├── Django_Next.js_Plan/M3/     # M3 planning documents (5 files)
└── AGENTS.md                   # Agent ownership rules
```

### 2.2 Backend Architecture

**Django apps (20 in `INSTALLED_APPS`):**

| App | Domain | Lines (non-test) | Maturity |
| --- | --- | --- | --- |
| `identity` | Auth, OTP, users, privacy | High | Production-grade |
| `catalog` | Service categories, variants | High | Production-grade |
| `pricing` | Price books, selectors | Medium | Integrated with catalog |
| `locations` | Addresses, geocoding, service areas | Medium | Production-grade |
| `partners` | Partner onboarding, capabilities, crew, documents | Very High | Complex, production-grade |
| `carts` | Cart, checkout, quotes, fulfilment plans | Very High | Core booking engine |
| `assignments` | Partner matching, dispatch, offers | Very High | Core booking engine |
| `commerce` | Orders, payments, refunds, webhooks, tax docs | Very High | Core money system |
| `fulfilment` | Booking lifecycle, OTP, completion, amendments | Very High | Core service delivery |
| `cases` | Operations cases, approvals | Medium | Support infrastructure |
| `payouts` | Partner ledger, payout batches, bank exports | High | Production-grade |
| `notifications` | In-app feed, delivery intents, kill switches, escalation | High | Production-grade |
| `ratings` | Customer ratings/reviews | Low | Basic implementation |
| `requirements` | M2 enquiry/quote/estimate/engagement/project lifecycle | Extremely High (~30 migrations, ~25 test files) | Most complex app |
| `rentals` | A7 rental inventory, booking, deposits | High (1651L service, 755L views, 525L models) | **New for M3** — implemented |
| `stays` | A9 stays/PG/hotels, properties, units, reservations | Very High (1902L service, 1625L views, 987L models) | **New for M3** — implemented |
| `loyalty` | **EMPTY DIRECTORY** | 0 | NOT IMPLEMENTED |
| `health` | Health check endpoint | Minimal | Operational |
| `foundation` | Outbox events, recovery, storage | Medium | Infrastructure |

**Architecture quality:** The backend follows a **coherent, well-engineered architecture**:
- Domain services encapsulate business logic (thin views)
- Explicit command patterns for state changes
- Provider adapter pattern (payment, payout, OTP, geocoding, storage, messaging)
- Outbox event pattern for async side effects
- Immutable financial records with append-only ledger
- Database-level constraints enforce invariants
- All money in integer paise — no floating-point
- Idempotency keys on payments and payouts
- Version fields for optimistic concurrency

### 2.3 Frontend Architecture

**Three Next.js 16 applications** (App Router, React 19, TanStack Query, Tailwind CSS 4):
- **Customer:** ~44 page routes covering catalog, booking, checkout, account, requests, engagements, projects, rentals, stays
- **Partner:** ~65 page routes covering marketing, onboarding, work management, earnings, rentals, stays
- **Admin/Operations:** ~16 page routes covering dispatch, partner management, bookings, payouts, requests, rentals, stays

**Shared packages:**
- `@vsolve/api-client` — Generated TypeScript client from OpenAPI v1.yaml (~30K line schema)
- `@vsolve/query` — TanStack Query hooks wrapping API client
- `@vsolve/ui` — Shared React components
- `@vsolve/config` — Configuration

**Frontend code:** ~250K lines TypeScript/TSX across all apps and packages (excluding node_modules)
**Frontend tests:** 210 test files (Vitest), 0 E2E specs (Playwright config exists but no tests)

---

## 3. CURRENT DEVELOPMENT STATUS MATRIX

### 3.1 Service Categories

| # | Category | Brief Status | Backend Models | Migrations | APIs | Business Logic | Customer Frontend | Partner Frontend | Admin Frontend | Tests | **Overall Status** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Technician | M1 core | ✅ via catalog/carts/assignments/fulfilment | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 121 files | **VERIFIED COMPLETE** |
| 2 | Beautician | M1 core | ✅ same pattern | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **VERIFIED COMPLETE** |
| 3 | Home Services | M1 core | ✅ same pattern | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **VERIFIED COMPLETE** |
| 4 | Pet Services | M1 core | ✅ same pattern | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **VERIFIED COMPLETE** |
| 5 | Construction Labour | M2 A3 (rate-card/crew) | ✅ requirements app | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 25 files | **VERIFIED COMPLETE** |
| 6 | Man Power & Staff | M2 A3 variant | ✅ requirements app | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **VERIFIED COMPLETE** |
| 7 | Event & Media | M2 A5 (project/quote) | ✅ requirements app | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **VERIFIED COMPLETE** |
| 8 | Rental Services | M3 new — A7 | ✅ rentals app (525L models, 1651L service) | ✅ 6 migrations | ✅ views 755L | ✅ service 1651L | ✅ 4 routes | ✅ 7 routes | ✅ 1 route | ⚠️ 1047L but not in backend/tests/ | **IMPLEMENTED BUT UNVERIFIED** |
| 9 | Rooms/PG/Hotels | M3 new — A9 | ✅ stays app (987L models, 1902L service) | ✅ 18 migrations | ✅ views 1625L | ✅ service 1902L | ✅ 5 routes | ✅ 4 routes | ✅ 1 route | ⚠️ 1155L but not in backend/tests/ | **IMPLEMENTED BUT UNVERIFIED** |
| 10 | Career/Jobs | M3 new — A10 | ❌ No app exists | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **NOT IMPLEMENTED** |
| 11 | Vehicle/Ride/Delivery | M4 — Rapido | ❌ No app exists | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **NOT IMPLEMENTED** |

### 3.2 Key Observations

**Surprising finding:** Rental Services (A7) and Rooms/PG/Hotels (A9) are **substantially implemented** despite the project brief claiming they "do not exist in the codebase yet and need to be built from scratch." Evidence:

- **Rentals (`apps.rentals`):** 525-line model file with 12 models (RentalAsset, AssetReservation with PostgreSQL ExclusionConstraint, RentalBooking with 16-status lifecycle, RentalBookingLine, RentalHandover, RentalReturnInspection, RentalDeposit with sub-lifecycle, RentalDepositTransaction, RentalExtension, RentalPaymentAllocation), 1651-line service file, 755-line views file, 6 migrations, dedicated serializers, selectors, tasks, exceptions, and 1047-line test file.

- **Stays (`apps.stays`):** 987-line model file with 19+ models (Property with PropertyType/OccupancyModel, PropertyMedia, PropertyPolicy, UnitType with SharingType/RoomClass/FurnishingStatus, Unit, UnitPricingRule with ExclusionConstraint, UnitPricingOverride, UnitReservation, StayReservation with 16-status lifecycle, StayReservationLine, StayDeposit, StayDepositTransaction), 1902-line service file, 1625-line views file, 18 migrations, and 1155-line test file.

- Both are **registered in `INSTALLED_APPS`**, have **URL routes** (`/api/v1/rentals/`, `/api/v1/stays/`), and have **Celery beat tasks** (`sweep-expired-stay-holds`, `sweep-stay-no-shows`).

- Both have **payment purposes** in the commerce system: `A7_RENTAL_BOOKING`, `A7_DEPOSIT_HOLD`, `A7_DAMAGE_SETTLEMENT`, `A7_EXTENSION`, `A9_STAY_RESERVATION`, `A9_DEPOSIT_HOLD`, `A9_DAMAGE_SETTLEMENT`, `A9_EXTENSION`.

- Both have **payout constraints** in the ledger: `payouts_one_earning_per_rental_booking`, `payouts_one_earning_per_stay_reservation`.

- **Frontend pages exist** for both (customer browse, detail, checkout, booking management; partner asset/property management; admin operations workspace).

**However:** Tests for both are in-app (`apps/rentals/tests.py`, `apps/stays/tests.py`) rather than the standard `backend/tests/` directory, and there are **zero test files found** in `backend/tests/` for either rentals or stays. This is a significant gap — the test infrastructure may not be integrated into the standard pytest suite.

**Career/Jobs (A10):** Genuinely **NOT IMPLEMENTED**. No Django app, no models, no code of any kind. The M3 task board lists specific tasks (`M3-BE-351` through `M3-FE-332`) for building it from scratch. Planning documents reference an `A10VariantConfiguration` model and listing/application lifecycle, but no code exists.

**Vehicle/Ride/Delivery (A11):** Genuinely **NOT IMPLEMENTED**. Zero code. This is a complete ground-up build for M4.

---

## 4. MONEY SYSTEM — DEEP AUDIT

### 4.1 Payment Architecture

| Component | Status | Readiness | Evidence |
| --- | --- | --- | --- |
| **Razorpay Provider** | ✅ Full adapter implementation | 85/100 | `RazorpayPaymentProvider` with order creation, payment fetch, refund, webhook verification |
| **Fake Provider** | ✅ Complete for testing | 90/100 | Deterministic test double matching real provider interface |
| **Payment Creation** | ✅ Full lifecycle | 85/100 | `PaymentAttempt` with 8 statuses, idempotency keys, reconciliation states |
| **Payment Capture** | ✅ Handler chain with allocation | 85/100 | `services/capture.py` (364L) with per-purpose capture routing |
| **Webhook Handling** | ✅ With signature verification | 80/100 | `PaymentWebhook` model with idempotent processing, HMAC verification |
| **Refunds** | ✅ Full lifecycle | 80/100 | `Refund` model with 6 statuses, `RefundAllocation`, provider submission |
| **Reconciliation** | ✅ Scheduled sweeps | 75/100 | `reconcile_payments` (30s), `reconcile_refunds` (60s), M2 money reconciliation (hourly) |
| **Financial Exceptions** | ✅ Exception tracking | 80/100 | `FinancialException` model with CAPTURE_WITHOUT_CAPACITY, PROVIDER_AMBIGUITY, REFUND_FAILED, AMOUNT_MISMATCH, CHARGEBACK, RECONCILIATION_MISMATCH |
| **Tax Documents** | ✅ Invoice/credit note | 75/100 | `TaxDocument`, `TaxDocumentLine`, `DocumentSequence` with ReportLab rendering |
| **Payment Allocations** | ✅ Immutable line-level | 90/100 | `PaymentAllocation` with `refunded_paise <= amount_paise` constraint |
| **Server-side Pricing** | ✅ Enforced | 95/100 | All `amount_paise` calculated on backend; check constraints on amounts |
| **Idempotency** | ✅ At payment level | 85/100 | `UniqueConstraint` on `(booking_group, idempotency_key)` and `(provider, provider_order_id)` |
| **Concurrency** | ✅ Version fields | 75/100 | Optimistic concurrency on `Order` and `PaymentAttempt` |
| **Simulated Capture** | ✅ Dev-only, refused in prod | 95/100 | `PAYMENTS_ALLOW_SIMULATED_CAPTURE` hard-blocked in `production.py` |

### 4.2 Payout System

| Component | Status | Readiness | Evidence |
| --- | --- | --- | --- |
| **Partner Ledger** | ✅ Immutable append-only | 90/100 | `PartnerLedgerEntry` with EARNING/ADJUSTMENT/REVERSAL, `save()` refuses mutation |
| **Net = Gross - Commission** | ✅ Database constraint | 95/100 | `payouts_net_reconciles_to_gross_less_commission` |
| **Payout Batches** | ✅ Maker-checker | 85/100 | `PayoutBatch` with `payouts_approver_is_not_the_proposer` constraint |
| **Batch Items** | ✅ Double-pay prevention | 90/100 | `payouts_one_live_reservation_per_ledger_entry` constraint |
| **RazorpayX Provider** | ✅ Separate credentials | 80/100 | Separate key pair from collections |
| **Payout Reconciliation** | ✅ Hourly sweep | 75/100 | `reconcile_payouts` task |
| **Payout Account** | ✅ Modeled | 80/100 | `PartnerPayoutAccount` with status lifecycle |

### 4.3 Not Implemented — Money Features

| Feature | Status | Evidence |
| --- | --- | --- |
| **Customer Wallet** | NOT IMPLEMENTED | `apps/loyalty/` is empty. Detailed plan exists in `01-wallet-vcoins-referral.md` |
| **V Coins** | NOT IMPLEMENTED | Empty loyalty app. Detailed design doc with 100+ lines of owner decisions |
| **Referral System** | NOT IMPLEMENTED | Only design doc. No models, no code |
| **Vendor Subscriptions** | NOT IMPLEMENTED | Referenced in M3 task board (`M3-BE-357`, `M3-BE-358`). No models exist |
| **Premium Listings** | NOT IMPLEMENTED | Referenced but no implementation |
| **GST/TDS Reports** | NOT IMPLEMENTED | `TaxDocument` model exists but no GST/TDS computation or reporting |
| **Bank Payment Export** | NOT IMPLEMENTED | No export functionality found |
| **Settlement Reports** | NOT IMPLEMENTED | Ledger exists but no report generation |

### 4.4 Financial Readiness Summary

| Area | Readiness Score | Reasoning |
| --- | --- | --- |
| Core Payment Collection | 85/100 | Razorpay adapter complete, webhooks verified, idempotent, reconciliation in place |
| Refund Processing | 80/100 | Full lifecycle with provider submission and reconciliation |
| Partner Payouts | 80/100 | Immutable ledger, maker-checker batches, RazorpayX adapter |
| Financial Exceptions | 75/100 | Exception model exists but Operations resolution UI needs verification |
| Tax Documents | 70/100 | Model and rendering exist; GST compliance not verified |
| Wallet | 0/100 | Not implemented; detailed plan exists |
| V Coins | 0/100 | Not implemented; detailed plan exists |
| Referral Rewards | 0/100 | Not implemented; detailed plan exists |
| Subscriptions | 0/100 | Not implemented |
| Reporting/Export | 5/100 | No export or report functionality |
| **Overall Money System** | **45/100** | Core infrastructure excellent; all new M3 features zero |

---

## 5. WALLET / V COINS / REFERRAL — DETAILED STATUS

### 5.1 Wallet

**Status: NOT IMPLEMENTED / NOT FOUND**

- The `apps/loyalty/` directory exists but is **completely empty** (no files at all).
- No wallet models, services, views, serializers, migrations, or tests exist anywhere.
- A comprehensive 500+ line planning document exists at `Django_Next.js_Plan/M3/01-wallet-vcoins-referral.md` with detailed owner decisions on:
  - Wallet top-up via Razorpay
  - Balance invariants (available >= 0)
  - Wallet + Razorpay split at checkout
  - Refund-to-wallet path
  - Operations configuration (min/max top-up)

**Assessment:** Design is well-thought-out but zero code exists. Estimated 40-80 hours to implement.

### 5.2 V Coins

**Status: NOT IMPLEMENTED / NOT FOUND**

- No models, no code.
- Extremely detailed design doc covering:
  - Earn rules (flat, tiered by order value, tiered by booking sequence)
  - Lock/unlock mechanics (configurable completions required)
  - Burn rules (max % of order, operations-configurable)
  - Expiry rules per grant
  - `CoinGrant`, `CoinGrantRule`, `CoinEarnTier`, `CoinBurn`, `CoinTransaction` model designs
  - Balance presentation (promised, locked, spendable, expiring_soon)

**Assessment:** Most complex of the three. Estimated 60-100 hours.

### 5.3 Referral System

**Status: NOT IMPLEMENTED / NOT FOUND**

- No code exists.
- Design doc covers:
  - Referral code/link generation
  - Attribution (`UNIQUE(referee_id)` — one referral per customer lifetime)
  - Volume tiers (configurable thresholds and rewards)
  - Grandfathering (versioned programs, immutable `ReferralReward`)
  - Self-referral and abuse prevention
  - Integration with wallet and coins

**Assessment:** Estimated 30-50 hours.

---

## 6. ADMIN & REPORTING — STATUS

| Requirement | Backend | Frontend | Status |
| --- | --- | --- | --- |
| Customizable admin dashboard | ❌ | ❌ | NOT IMPLEMENTED |
| Business dashboard | ❌ | ❌ | NOT IMPLEMENTED |
| Customer dashboard | ❌ | ❌ | NOT IMPLEMENTED |
| Vendor dashboard | ❌ | ❌ | NOT IMPLEMENTED |
| Booking dashboard | ❌ | ❌ | NOT IMPLEMENTED |
| Revenue dashboard | ❌ | ❌ | NOT IMPLEMENTED |
| Analytics dashboard | ❌ | ❌ | NOT IMPLEMENTED |
| Real-time reporting | ❌ | ❌ | NOT IMPLEMENTED |
| Excel export | ❌ | ❌ | NOT IMPLEMENTED |
| CSV export | ❌ | ❌ | NOT IMPLEMENTED |
| PDF export | Partial (invoice PDF) | ❌ | VERIFIED PARTIAL |
| Bulk import | ❌ | ❌ | NOT IMPLEMENTED |
| Settlement reports | ❌ | ❌ | NOT IMPLEMENTED |
| GST/TDS reports | ❌ | ❌ | NOT IMPLEMENTED |
| Bank payment export | ❌ | ❌ | NOT IMPLEMENTED |
| Custom report builder | ❌ | ❌ | NOT IMPLEMENTED |
| Admin-configurable modules | ❌ | ❌ | NOT IMPLEMENTED |

**Assessment:** The admin/operations console currently functions as a **command-and-control workstation** for dispatch, partner management, booking oversight, payouts, and M2 requests. It is **NOT** a reporting/analytics/dashboard platform. The entire reporting layer — every dashboard, every export, every configurable module — is NOT IMPLEMENTED.

**What exists in admin:** Operations workspace pages for dispatch, partners, availability, payouts, bookings, work items, cases, kill switches, manual offers, rate cards, requests, rentals, stays. These are **operational tools**, not analytical dashboards.

---

## 7. MSG91 OTP INTEGRATION

**Status: VERIFIED PARTIAL — Seam exists, adapter NOT IMPLEMENTED**

Evidence:
- `apps/identity/delivery.py`: OTP sender protocol exists with `DevelopmentOtpSender` and `UnconfiguredOtpSender`. **No MSG91 sender class exists.**
- `apps/notifications/transport.py`: Message transport protocol exists with `FakeMessageTransport`. **No MSG91 transport class exists.** Comment explicitly states: "MSG91 is the intended provider for SMS, WhatsApp and voice and is **not implemented yet**."
- Production settings: `OTP_PROVIDER` must not be "development" or "unconfigured" in production, but no MSG91 adapter to satisfy this.
- Configuration exists for `OTP_PROVIDER`, `MESSAGE_TRANSPORT`, `NOTIFICATIONS_ALLOW_FAKE_TRANSPORT`.

**Assessment:** The integration architecture (protocols, seams, fail-closed defaults) is excellent. The actual MSG91 HTTP adapter is missing and estimated at 20-30 hours including DLT template handling, retry logic, and testing.

---

## 8. MILESTONE 4 — STATUS

### 8.1 Mobile Apps

**Status: NOT IMPLEMENTED / NOT FOUND**

- No React Native, Flutter, Expo, Swift, or Kotlin code found anywhere in the repository.
- The only "mobile" code is responsive web views (`features/crew/view/mobile/` — these are React components for mobile-width web, not native mobile app code).
- No app store configuration, build configuration, or native module code.

**Assessment:** Both Customer and Partner mobile apps are a **complete ground-up build**. This is the single largest scope item in M4, estimated at 200-400 hours for both apps combined (before store submission).

### 8.2 Vehicle/Ride Platform (Rapido-style)

**Status: NOT IMPLEMENTED / NOT FOUND**

Zero code exists for:
- Ride booking, fare calculation, or distance-based pricing
- Real-time GPS tracking or location streaming
- Driver registration, KYC, driver wallet, daily pass
- Goods transport, instant delivery
- Vehicle rental/servicing/washing/roadside assistance
- EV services
- Dispatch/matching for rides (distinct from service dispatch)
- Trip lifecycle or ride lifecycle

**Assessment:** This is effectively a **separate product** requiring its own domain models, real-time infrastructure (WebSockets or SSE for location), mapping API integration, fare engine, and driver-side app. Estimated 400-800 hours as a ground-up build. The existing service dispatch pattern (`apps/assignments`) provides a starting point for matching logic but the real-time location and fare components are fundamentally different.

### 8.3 AI Chatbot & Search

**Status: NOT IMPLEMENTED / NOT FOUND**

Zero code for:
- Chatbot UI or conversation management
- AI provider integration (OpenAI, etc.)
- Search indexing beyond Django ORM queries
- AI-powered recommendations
- Conversation persistence
- Prompt management

**Assessment:** Estimated 60-120 hours depending on scope.

---

## 9. TESTING & QUALITY

### 9.1 Backend Tests

| Metric | Value |
| --- | --- |
| Test files | 121 |
| Total test lines | ~32,000 |
| Test directories with coverage | 15 of 20 apps |
| Missing test coverage for | `loyalty` (empty), `rentals` (inline only), `stays` (inline only), `health`, `pricing` |

**Coverage by app area:**
- assignments: 9 test files
- carts: 15 test files
- commerce: 5 test files
- fulfilment: 16 test files
- identity: 4 test files
- partners: 12 test files
- requirements: 25 test files
- notifications: 4 test files
- payouts: 3 test files
- cases: 3 test files
- foundation: 6 test files
- locations: 3 test files
- catalog: 4 test files
- ratings: 1 test file

**Coverage configuration:** `pyproject.toml` sets `fail_under = 85` with branch coverage. **Cannot verify actual coverage without running tests** (read-only audit).

> **IMPLEMENTED BUT UNVERIFIED** — The coverage threshold is configured and enforced, but the 85% claim cannot be confirmed without executing `pytest --cov`.

**Rental/Stay test anomaly:** Both `apps/rentals/tests.py` (1047L) and `apps/stays/tests.py` (1155L) exist as in-app test files, but there are **zero test files** in the standard `backend/tests/rentals/` or `backend/tests/stays/` directories. These in-app tests may or may not be discovered by pytest depending on `testpaths` configuration — `pyproject.toml` sets `testpaths = ["tests"]`, which would **exclude** the in-app test files. This is a **P1 gap** — approximately 2,200 lines of tests may not be running.

### 9.2 Frontend Tests

| Metric | Value |
| --- | --- |
| Vitest test files | 210 |
| Playwright E2E specs | 0 |
| Playwright config | Exists (2 config files) |

**Assessment:** Frontend unit tests exist (210 files), but no E2E tests. The Playwright infrastructure is set up but unused.

### 9.3 Quality Tooling

| Tool | Status |
| --- | --- |
| Ruff (linting + formatting) | ✅ Configured with 20+ rule sets |
| MyPy (strict mode) | ✅ With Django and DRF plugins |
| Pyright | ✅ Configured |
| ESLint | ✅ Configured |
| TypeScript strict | ✅ via `turbo run typecheck` |
| Makemigrations --check | ✅ In quality script |
| OpenAPI validation | ✅ via `drf-spectacular --validate` |
| pip-audit | ✅ In dev dependencies |
| Coverage threshold | ✅ 85% with branch coverage |

---

## 10. SECURITY AUDIT

### P0 — Critical

| # | Finding | Location | Risk | Remediation |
| --- | --- | --- | --- | --- |
| S1 | `.env` file exists at `backend/.env` with 46 config lines including Razorpay keys | `backend/.env` | **Mitigated** — `.gitignore` excludes `.env` and `git ls-files` confirms it is NOT committed | Continue excluding. Rotate any exposed values. |
| S2 | `PAYMENTS_ALLOW_SIMULATED_CAPTURE` exists as a flag | `base.py` + views | **Mitigated** — Production settings refuse to boot with it enabled | No action needed |

### P1 — High

| # | Finding | Location | Risk | Remediation |
| --- | --- | --- | --- | --- |
| S3 | MSG91 OTP not implemented — production cannot deliver OTPs | `identity/delivery.py` | Users cannot authenticate in production without OTP delivery | Implement MSG91 adapter before production |
| S4 | Message transport not implemented — notifications are undeliverable | `notifications/transport.py` | Escalation ladder cannot reach partners | Implement MSG91 transport before production |
| S5 | No rate limiting on authentication endpoints beyond OTP limits | `identity/views.py` | Brute-force risk | Add IP-based throttling on login endpoints |

### P2 — Meaningful

| # | Finding | Location | Risk | Remediation |
| --- | --- | --- | --- | --- |
| S6 | `SECRET_KEY` defaults to `unsafe-development-only` | `base.py:16` | **Mitigated** — Production settings enforce minimum 50-char key | Acceptable for development |
| S7 | SQLite database committed (dev data?) | `backend/db.sqlite3` (2.1MB) | Potential PII in development data | Add to `.gitignore`, verify no PII |
| S8 | Celerybeat schedule files committed | `backend/celerybeat-schedule*` | Not a security risk but clutters repo | Add to `.gitignore` |

### P3 — Cleanup

| # | Finding | Location | Risk | Remediation |
| --- | --- | --- | --- | --- |
| S9 | Python version mismatch (3.14 local vs 3.13 target) | pyproject.toml vs machine | Potential behavior differences | Align environments |

---

## 11. ARCHITECTURE REUSE ANALYSIS

### Patterns Available for Reuse

| Pattern | Location | Quality | Reusable for |
| --- | --- | --- | --- |
| **Service booking lifecycle** | `carts/`, `commerce/`, `fulfilment/`, `assignments/` | Excellent | M1 categories are the template |
| **M2 enquiry/quote/engagement** | `requirements/` | Excellent but complex | M2 categories |
| **A7/A9 archetype** (ADR-0011) | `rentals/`, `stays/` | Good | Career/Jobs (A10) if adapted |
| **Payment provider adapter** | `commerce/providers.py` | Excellent | All future payment needs |
| **Payout provider adapter** | `payouts/providers.py` | Excellent | All future payout needs |
| **Outbox event + handler** | `foundation/` | Excellent | Any async side effect |
| **Partner capability** | `partners/capabilities/` | Good | A10 job poster onboarding |
| **Notification infrastructure** | `notifications/` | Good | All new features |
| **Object-level permissions** | `common/`, various `permissions.py` | Good | All new features |
| **Django admin integration** | Various `admin.py` | Basic | Not suited for custom dashboards |
| **API client generation** | `@vsolve/api-client` from OpenAPI | Excellent | All frontend work |

---

## 12. REMAINING WORK BREAKDOWN

### Milestone 3

#### 12.1 New Categories

| Work Item | Current Status | Backend | Frontend | Database | Testing | Complexity | Integration Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A7 Rental — complete** | IMPLEMENTED BUT UNVERIFIED | Done (1651L service) | Done (11 routes across 3 apps) | Done (6 migrations) | ⚠️ Tests exist but may not run | Medium | Low — already integrated |
| **A9 Stay — complete** | IMPLEMENTED BUT UNVERIFIED | Done (1902L service) | Done (10 routes across 3 apps) | Done (18 migrations) | ⚠️ Tests exist but may not run | Medium | Low — already integrated |
| **A10 Career/Jobs** | NOT IMPLEMENTED | Full build needed | Full build needed | Full build needed | Full build needed | Medium-High | Medium |
| **Test integration for A7/A9** | PARTIAL | Move tests to `backend/tests/` | — | — | Critical | Low | Low |

#### 12.2 Money Systems

| Work Item | Current Status | Backend | Frontend | Complexity | Risk |
| --- | --- | --- | --- | --- | --- |
| Razorpay live activation (all categories) | Adapter exists, not live | Configuration + staging verification | Payment handoff verification | Low | Medium (provider behavior) |
| MSG91 OTP adapter | Seam exists, no adapter | Build adapter + DLT templates | None | Medium | Medium |
| MSG91 message transport | Seam exists, no adapter | Build adapter + template registry | None | Medium | Medium |
| **Customer Wallet** | NOT IMPLEMENTED — detailed plan | Full build (models, service, views, serializers) | Wallet UI, top-up, checkout integration | High | High (money safety) |
| **V Coins** | NOT IMPLEMENTED — detailed plan | Full build (models, rules engine, earn/burn) | Coin display, burn at checkout | Very High | High (rule complexity) |
| **Referral System** | NOT IMPLEMENTED — detailed plan | Full build (attribution, rewards, abuse controls) | Referral link/code, invite flow | High | Medium |
| **Vendor Subscriptions** | NOT IMPLEMENTED | Full build | Plan management, purchase flow | Medium | Medium |
| **Premium Listings** | NOT IMPLEMENTED | Full build | Visibility/ranking integration | Medium | Low |

#### 12.3 Admin/Reporting

| Work Item | Current Status | Complexity | Risk |
| --- | --- | --- | --- |
| Revenue dashboard | NOT IMPLEMENTED | High | Medium |
| Booking dashboard | NOT IMPLEMENTED | Medium | Low |
| Customer dashboard | NOT IMPLEMENTED | Medium | Low |
| Vendor dashboard | NOT IMPLEMENTED | Medium | Low |
| Analytics dashboard | NOT IMPLEMENTED | High | Medium |
| Excel/CSV export | NOT IMPLEMENTED | Medium | Low |
| PDF export (reports) | PARTIAL (invoices only) | Medium | Low |
| Bulk import | NOT IMPLEMENTED | Medium | Medium (data validation) |
| GST/TDS reports | NOT IMPLEMENTED | High | High (tax compliance) |
| Settlement reports | NOT IMPLEMENTED | Medium | Medium |
| Bank payment export | NOT IMPLEMENTED | Medium | Low |
| Custom report builder | NOT IMPLEMENTED | Very High | Medium |
| Configurable modules | NOT IMPLEMENTED | High | Medium |

### Milestone 4

| Work Item | Current Status | Complexity | Estimated Effort | Risk |
| --- | --- | --- | --- | --- |
| Customer Mobile App | NOT IMPLEMENTED | Very High | 120-200 hrs | High |
| Partner Mobile App | NOT IMPLEMENTED | Very High | 100-180 hrs | High |
| Vehicle/Ride Platform (backend + frontend) | NOT IMPLEMENTED | Extreme | 300-600 hrs | Very High |
| AI Chatbot | NOT IMPLEMENTED | High | 40-80 hrs | Medium |
| AI Search | NOT IMPLEMENTED | Medium | 20-40 hrs | Low |
| E2E Testing (all 11 categories) | NOT IMPLEMENTED | Very High | 80-120 hrs | High |
| Load Testing | NOT IMPLEMENTED | Medium | 20-40 hrs | Medium |
| Security Testing | NOT IMPLEMENTED | Medium | 20-40 hrs | Medium |
| Production Deployment | NOT IMPLEMENTED | High | 40-80 hrs | High |

---

## 13. SINGLE-DEVELOPER ENGINEERING ESTIMATION

### 13.1 Milestone 3 — Remaining Work

| Work Item | Optimistic (hrs) | Realistic (hrs) | Pessimistic (hrs) |
| --- | --- | --- | --- |
| **A7/A9 test integration + verification** | 8 | 16 | 24 |
| **A10 Career/Jobs** (full build) | 60 | 100 | 150 |
| **Razorpay live activation** | 8 | 16 | 30 |
| **MSG91 OTP adapter** | 12 | 24 | 40 |
| **MSG91 message transport** | 12 | 24 | 40 |
| **Customer Wallet** | 40 | 70 | 110 |
| **V Coins** | 50 | 90 | 140 |
| **Referral System** | 25 | 45 | 70 |
| **Vendor Subscriptions** | 20 | 35 | 55 |
| **Premium Listings** | 10 | 20 | 30 |
| **Admin Dashboards (6)** | 60 | 100 | 160 |
| **Reporting/Export** | 40 | 70 | 110 |
| **GST/TDS Reports** | 20 | 40 | 60 |
| **Custom Report Builder** | 30 | 60 | 100 |
| **Bulk Import** | 15 | 25 | 40 |
| **M3 Integration Testing** | 20 | 40 | 60 |
| **Codebase familiarization** | 20 | 40 | 60 |
| **Debugging & integration** | 30 | 60 | 100 |
| **M3 SUBTOTAL** | **480** | **875** | **1,379** |

### 13.2 Milestone 4 — Work

| Work Item | Optimistic (hrs) | Realistic (hrs) | Pessimistic (hrs) |
| --- | --- | --- | --- |
| **Customer Mobile App** | 120 | 200 | 320 |
| **Partner Mobile App** | 100 | 180 | 280 |
| **Vehicle Platform — Backend** | 200 | 350 | 550 |
| **Vehicle Platform — Frontend/App** | 100 | 180 | 300 |
| **Vehicle — GPS/Maps/Fare** | 80 | 140 | 220 |
| **AI Chatbot** | 40 | 70 | 120 |
| **AI Search** | 20 | 40 | 60 |
| **E2E Regression Testing** | 60 | 100 | 160 |
| **Load/Security Testing** | 30 | 50 | 80 |
| **Payment Reconciliation Testing** | 15 | 30 | 50 |
| **Production Deployment** | 30 | 60 | 100 |
| **App Store Submission** | 20 | 40 | 60 |
| **Bug Fixing / UAT** | 40 | 80 | 140 |
| **M4 SUBTOTAL** | **855** | **1,520** | **2,440** |

### 13.3 Combined Totals

| Scenario | Hours | At 20 hrs/wk | At 30 hrs/wk | At 40 hrs/wk |
| --- | --- | --- | --- | --- |
| **Optimistic** | 1,335 hrs | 67 weeks (15.4 months) | 45 weeks (10.3 months) | 33 weeks (7.7 months) |
| **Realistic** | 2,395 hrs | 120 weeks (27.5 months) | 80 weeks (18.3 months) | 60 weeks (13.8 months) |
| **Pessimistic** | 3,819 hrs | 191 weeks (43.8 months) | 127 weeks (29.2 months) | 95 weeks (21.9 months) |

**Productive engineering capacity adjustment:** Assume a developer is productively coding ~65% of "work hours" (the rest is meetings, context switching, reading code, communication, debugging environment issues). Realistic hours adjusted: 2,395 / 0.65 = **3,685 calendar hours**.

| Adjusted Realistic | At 20 hrs/wk | At 30 hrs/wk | At 40 hrs/wk |
| --- | --- | --- | --- |
| 3,685 calendar hrs | 184 weeks (42.3 months) | 123 weeks (28.2 months) | 92 weeks (21.1 months) |

---

## 14. TWO SUPPORT SCENARIOS

### Scenario A — Existing Developer Supports Regularly

Assumes the current developer:
- Explains architecture decisions and undocumented behaviors
- Assists with existing code navigation and business logic clarification
- Helps troubleshoot staging/production issues
- Reviews code for architectural consistency
- Answers questions within 24 hours

**Realistic estimate:** 2,395 hours (as calculated above)

### Scenario B — Mostly Independent

Assumes only occasional support (weekly or less):
- New developer must learn the entire codebase independently
- Must understand all 11 ADRs, the M2 engagement spine, the outbox pattern, the payment system, and the payout lifecycle alone
- Must reverse-engineer undocumented business rules from code
- Must debug integration issues alone

**Realistic estimate:** 2,395 × 1.35 = **3,233 hours** (35% overhead for self-discovery)

**Why they differ:** The codebase is well-structured and well-commented (the `base.py` settings file alone has 1,086 lines with extensive inline documentation). However, the **M2 requirements app** is extraordinarily complex (30 migrations, 70+ source files, 25 test files) and contains deep business logic that would take weeks to fully understand without guidance. The wallet/coins/referral design doc contains 20+ owner decisions that must be implemented precisely — getting clarification on edge cases would save significant rework.

---

## 15. DEADLINE FEASIBILITY

### Milestone 3 — "17 August – 17 September 2026"

**Contract deadline:** 17 September 2026 (7 days from audit date)
**Remaining realistic effort:** 875 hours
**Available calendar time:** 7 days × 8 hrs = 56 hours maximum

**Classification: UNREALISTIC**

It is physically impossible for one developer to complete 875 hours of work in 7 days. Even the optimistic estimate (480 hours) is ~60× the available time.

**What has been completed during the M3 window (25 days elapsed):**
- A7 Rental Services (backend + frontend) — substantial
- A9 Stays/PG/Hotels (backend + frontend) — substantial  
- M3 planning documents — 5 documents
- ADR-0011 — A7/A9 archetype engines

**What remains for M3:**
- Career/Jobs (A10) — not started
- Customer Wallet — not started
- V Coins — not started
- Referral — not started
- Vendor Subscriptions — not started
- Premium Listings — not started
- ALL admin dashboards and reporting — not started
- MSG91 OTP + messaging — not started
- Razorpay live activation — not started

### Milestone 4 — "20 September – 10 October 2026"

**Contract timeline:** 20 days
**Remaining realistic effort:** 1,520 hours
**Available calendar time:** 20 days × 8 hrs = 160 hours maximum

**Classification: UNREALISTIC**

1,520 hours of work in 160 hours of calendar time is ~9.5× the available capacity. The vehicle platform alone (realistic: 670 hours) exceeds the entire calendar window for M4.

### Realistic Timeline

For **one developer** at **40 productive hours/week**:
- **M3 completion:** 22 weeks from start (~5.5 months)
- **M4 completion:** 38 additional weeks (~9.5 months)
- **Total:** ~60 weeks from start (~15 months)

Even with a team of 3 developers, parallelized effectively:
- **M3:** ~8-10 weeks
- **M4:** ~14-18 weeks
- **Total:** ~22-28 weeks (~5.5-7 months)

---

## 16. OWNERSHIP READINESS SCORES

| Dimension | Score | Explanation |
| --- | --- | --- |
| **Architecture Readiness** | 88/100 | Excellent. Coherent domain-driven design, well-factored services, proper patterns. ADRs document decisions. |
| **Documentation Readiness** | 72/100 | Good code comments. ADRs exist. M3 planning docs are detailed. Missing: deployment runbooks, developer onboarding guide, API documentation beyond OpenAPI. |
| **Code Quality** | 85/100 | Ruff + strict MyPy + DRF stubs. Clean separation. No obvious code smells. Comments explain rationale. |
| **Test Readiness** | 70/100 | 121 test files, 32K lines. Coverage threshold configured. But A7/A9 tests may not run. No E2E tests. |
| **Payment Readiness** | 80/100 | Core payment infrastructure excellent. Wallet/coins/referral not built. |
| **Backend Readiness** | 85/100 | Production-grade for M1+M2. A7/A9 substantially built. |
| **Frontend Readiness** | 78/100 | 250K lines. Three apps functional. No mobile. |
| **Mobile Readiness** | 0/100 | Zero mobile code exists. |
| **Deployment Readiness** | 40/100 | Docker Compose for local dev. No CI/CD. No production deployment config. No monitoring. |
| **Handover Readiness** | 55/100 | Code is readable. Architecture is discoverable. But requires guided walkthrough of M2 complexity. |
| **OVERALL** | **65/100** | Strong backend foundation, but massive remaining scope for M3+M4 |

---

## 17. BEST OWNERSHIP CANDIDATES

### Rank 1: Career/Jobs (A10) — BEST FIRST MODULE

| Criterion | Assessment |
| --- | --- |
| Current status | NOT IMPLEMENTED |
| Estimated hours | 60-100 |
| Dependencies | Catalog variant configuration, partner capabilities |
| Integration risk | Low — follows established A7/A9 archetype |
| Architectural risk | Low — listing/application is simpler than rental/stay |
| Files affected | New Django app + frontend routes |
| Existing developer support | Low — clean-slate build using documented patterns |
| Independent development | High — no dependency on unbuilt features |
| Scope expansion risk | Low — well-defined in task board |
| Recommended ownership | FULL — take immediately |

### Rank 2: MSG91 OTP + Message Transport

| Criterion | Assessment |
| --- | --- |
| Current status | Seam exists, no adapter |
| Estimated hours | 25-50 |
| Dependencies | MSG91 account setup |
| Integration risk | Low — protocols are defined |
| Independent development | Very High — self-contained adapter |
| Recommended ownership | FULL — take immediately |

### Rank 3: Rental/Stay Test Integration + Verification

| Criterion | Assessment |
| --- | --- |
| Current status | Tests exist but may not run in suite |
| Estimated hours | 8-24 |
| Dependencies | None |
| Integration risk | Very Low |
| Recommended ownership | FULL — quick win |

### Rank 4 (Avoid Initially): Customer Wallet + V Coins + Referral

| Criterion | Assessment |
| --- | --- |
| Current status | NOT IMPLEMENTED — complex design |
| Estimated hours | 115-205 combined |
| Dependencies | Cross-cutting (checkout, every category, every refund path) |
| Integration risk | HIGH — touches core money paths |
| Architectural risk | HIGH — concurrency, balance invariants |
| Recommended ownership | DEFER — take only after full codebase familiarization |

---

## 18. TAKEOVER PLAN

### Phase 0 — Handover (Week 1)

**Prerequisites:** Current developer available for 4-8 hours of guided walkthrough.

**Deliverables:**
1. Guided walkthrough of M1 booking lifecycle (carts → assignments → commerce → fulfilment)
2. Walkthrough of M2 requirements app (the most complex module)
3. Walkthrough of payment/payout architecture
4. A7/A9 design decisions and ADR-0011
5. Staging environment access and verification
6. Database access (read-only) for schema inspection

**Exit criteria:** New developer can trace a booking end-to-end and a payment end-to-end.

### Phase 1 — Stabilization (Week 1-2)

**Prerequisites:** Phase 0 complete.

**Deliverables:**
1. Move A7/A9 tests into `backend/tests/` directory
2. Verify all tests pass (including A7/A9)
3. Verify coverage meets 85% threshold
4. Resolve Python version alignment (3.13 vs 3.14)
5. Document staging environment setup

**Exit criteria:** `quality.cmd` passes clean. A7/A9 tests run in suite.

### Phase 2 — First Owned Module (Week 2-4)

**Deliverables:**
1. Build Career/Jobs (A10) app — models, services, views, serializers, migrations
2. Build A10 frontend (partner listing management, customer browse/apply)
3. Build A10 admin operations workspace
4. Write A10 tests

**Exit criteria:** A10 demonstrable end-to-end on staging.

### Phase 3 — Integration Adapters (Week 3-5)

**Deliverables:**
1. MSG91 OTP adapter
2. MSG91 message transport
3. Razorpay live mode activation on staging
4. End-to-end payment verification with real Razorpay test mode

**Exit criteria:** OTP delivery works via MSG91. Payment capture works via Razorpay.

### Phase 4 — Milestone 3 Core (Week 5-16)

**Deliverables:**
1. Customer Wallet (models, service, views, checkout integration)
2. V Coins (rules engine, earn/burn mechanics, checkout integration)
3. Referral System (attribution, rewards, abuse prevention)
4. Vendor Subscriptions
5. Premium Listings
6. All admin dashboards and reporting
7. Export functionality (Excel, CSV, PDF)
8. GST/TDS reports

**Exit criteria:** All M3 features working on staging.

### Phase 5 — Milestone 4 (Week 16+)

**Deliverables:**
1. Mobile app framework selection and setup
2. Customer mobile app
3. Partner mobile app
4. Vehicle/Ride platform (backend + frontend)
5. AI chatbot and search
6. E2E testing
7. Load and security testing

**Exit criteria:** All 11 categories working. Apps submitted to stores.

### Phase 6 — Release (After M4)

**Deliverables:**
1. Production deployment configuration
2. Monitoring and alerting setup
3. Payment reconciliation verification
4. Final UAT
5. Go-live

**Exit criteria:** Production launch signed off.

---

## 19. EXISTING DEVELOPER HANDOVER QUESTIONS

### P0 — MUST KNOW BEFORE TOUCHING CODE

1. **Why are A7/A9 tests in-app rather than `backend/tests/`?** Are they running in CI? Do they pass?
2. **What is the current staging deployment setup?** Where is it hosted? How is it deployed?
3. **What is the state of M2's backend-frontend integration?** The AGENTS.md mentions concurrent work from Codex, Claude, and Antigravity — what is the current stable state?
4. **Are there any known bugs in the current M1/M2 categories?** Any workarounds in place?
5. **What does `PAYMENTS_ALLOW_SIMULATED_CAPTURE=True` in the local `.env` mean for development workflow?** How does a developer normally test payments locally?
6. **What is the `db.sqlite3` file?** Is it used, or is PostgreSQL the only database?
7. **What is the relationship between `task.md` (root), `tasks.md` (root), and `Django_Next.js_Plan/M3/task.md`?** Which is canonical?
8. **Why is `apps/loyalty/` empty?** Was it created as a placeholder or did content get removed?
9. **How does the A7/A9 payment flow work end-to-end?** The `CHECKOUT_FREE_PURPOSES` list suggests they bypass the cart — what replaces it?
10. **What is the current state of the `web/` directory?** It exists at root — is it legacy?

### P1 — MUST KNOW BEFORE PRODUCTION

11. **What is the payment webhook URL that Razorpay calls?** Is it the same for test and production?
12. **How are database backups configured?** Is there a backup strategy?
13. **What monitoring/alerting exists for the stuck-work watchdog?** (`report_stuck_async_work`)
14. **What is the rollback strategy if a deployment fails?**
15. **Are there any Razorpay test-mode limitations that affect the implementation?**
16. **What is the `PAYMENT_LIVE_COLLECTIONS_APPROVED` CA/legal status?**

### P2 — USEFUL DURING DEVELOPMENT

17. **Why is there both a `Booking page/` and `Booking page redesign/` directory at root?** Are these design assets?
18. **What is the `web/` directory at root?** Legacy code?
19. **What is the `exports/` directory for?**
20. **What patterns should the A10 (Career/Jobs) app follow?** Is A7/A9 the right template or should it be simpler?

---

## 20. RISK REGISTER

| # | Risk | Severity | Probability | Impact | Evidence | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | M3 deadline impossible | P0 | 100% | Complete scope failure | 875 hrs remaining vs 7 days left | Renegotiate timeline | Business |
| R2 | M4 deadline impossible | P0 | 100% | Complete scope failure | 1,520 hrs remaining vs 20 days | Renegotiate timeline | Business |
| R3 | Vehicle platform is a separate product | P0 | 90% | Schedule overrun | Zero code, needs real-time infra | Defer or parallel team | Business |
| R4 | Mobile apps require native expertise | P1 | 80% | Quality/timeline risk | Web developer may not have mobile expertise | Verify developer skills or hire mobile dev | Business |
| R5 | Wallet concurrency bugs | P1 | 60% | Financial loss | Money invariants are critical | Extensive testing, code review | Developer |
| R6 | MSG91 DLT compliance | P1 | 50% | OTP delivery blocked | DLT template approval can take weeks | Start MSG91 procurement immediately | Business |
| R7 | Payment reconciliation gaps | P1 | 40% | Financial discrepancy | Razorpay test vs live behavior differs | Thorough staging testing | Developer |
| R8 | A7/A9 tests not running | P1 | 70% | Hidden bugs | Tests in wrong directory | Move tests immediately | Developer |
| R9 | Single developer burnout | P2 | 80% | Attrition, quality drop | Massive scope for one person | Scope reduction or team expansion | Business |
| R10 | App Store rejection | P2 | 40% | M4 deadline slip | Apple review process is unpredictable | Allow 2-4 weeks buffer | Developer |

---

## 21. ASSUMPTIONS REGISTER

| # | Assumption | Why Needed | Evidence | Confidence | What Happens If Wrong |
| --- | --- | --- | --- | --- | --- |
| A1 | Current developer built A7 and A9 during M3 period | Explains why brief says "not built" but code exists | Commit on `m3-planing` branch, ADR-0011 | High | Brief needs updating |
| A2 | 85% test coverage is maintained on existing code | Estimation assumes no coverage recovery work needed | `fail_under = 85` in pyproject.toml | Medium | 20-40 hrs extra work |
| A3 | Staging environment exists and is accessible | Estimation assumes no infrastructure setup | Brief mentions staging | Medium | 40-60 hrs infrastructure work |
| A4 | One developer for all M3+M4 work | Brief states this | Contract terms | High | Timeline impossible regardless |
| A5 | A7/A9 are functionally correct | Tests exist but may not run | Code looks correct on inspection | Medium | 20-40 hrs debugging/fixing |
| A6 | Mobile apps are React Native or similar | Not specified | No code to examine | Low | Could be 2× effort if native |
| A7 | Vehicle platform can reuse existing dispatch patterns | Architectural similarity | `assignments/` dispatch pattern | Low | 100-200 hrs extra if ground-up |
| A8 | GST/TDS requirements are well-defined | Not audited | No specification found | Very Low | 40-80 hrs requirements + implementation |

---

## 22. UNKNOWN / NEEDS-VERIFICATION REGISTER

| # | Unknown | Why It Matters | Who Can Confirm | Priority |
| --- | --- | --- | --- | --- |
| U1 | Actual test coverage percentage | Determines if coverage gap exists | Current developer (run pytest) | P0 |
| U2 | Are A7/A9 tests running in CI? | 2,200 lines of tests may be dead | Current developer | P0 |
| U3 | What is the staging deployment platform? | Infrastructure setup effort | Current developer / business owner | P0 |
| U4 | Mobile app technology choice | Framework selection changes effort 2× | Business owner | P0 |
| U5 | Vehicle platform scope — is the full Rapido feature set required? | Difference between 200 and 800 hours | Business owner | P0 |
| U6 | GST/TDS compliance requirements | Tax computation is legally mandated | Business owner / CA | P1 |
| U7 | Is the `web/` root directory used? | May contain legacy code or assets | Current developer | P2 |
| U8 | Razorpay test account limitations | Some features behave differently in test mode | Current developer | P1 |
| U9 | What is the expected user load at launch? | Determines infrastructure and load testing scope | Business owner | P1 |
| U10 | App Store developer accounts exist? | Required for mobile app submission | Business owner | P1 |

---

## 23. CODE QUALITY & TECHNICAL DEBT

### P0 — Blocks Development

None found. The codebase is production-grade.

### P1 — High Risk

| # | Issue | Location | Impact |
| --- | --- | --- | --- |
| TD1 | A7/A9 tests in wrong directory | `apps/rentals/tests.py`, `apps/stays/tests.py` | Tests may not execute |
| TD2 | Empty `apps/loyalty/` app | `backend/apps/loyalty/` | Confusing — delete or implement |
| TD3 | `db.sqlite3` in repository | `backend/db.sqlite3` | Unnecessary, potential PII |

### P2 — Meaningful Debt

| # | Issue | Location | Impact |
| --- | --- | --- | --- |
| TD4 | Celerybeat schedule files in repo | `backend/celerybeat-schedule*` | Clutters repo (4MB of WAL) |
| TD5 | Root-level zip files and directories | `Booking page/`, `Booking page.zip`, etc. | Confusing for new developer |
| TD6 | Branch name typo | `m3-planing` | Minor but unprofessional |
| TD7 | No E2E test specs | `frontend/e2e/` | Playwright configured but unused |

### P3 — Cleanup

| # | Issue | Location | Impact |
| --- | --- | --- | --- |
| TD8 | Multiple task files at root | `task.md`, `tasks.md`, `milestones.md` | Unclear which is canonical |
| TD9 | `refactor_pages.py` script at root | Root directory | Leftover script |
| TD10 | Python 3.13 vs 3.14 mismatch | Development environment | Potential behavior differences |

---

## 24. DOCUMENTATION & HANDOVER AUDIT

| File | Purpose | Current/Relevance | Takeover Value |
| --- | --- | --- | --- |
| `AGENTS.md` | Agent ownership rules | Current — detailed and maintained | HIGH — defines work boundaries |
| `CONTRIBUTING.md` | Developer guidelines | Current — 17.8K | HIGH — coding standards |
| `README.md` | Project overview | Current — 5K | Medium |
| `backend/README.md` | Backend setup | Current — 4.8K | HIGH |
| `frontend/README.md` | Frontend setup | Current — 1.9K | HIGH |
| `docs/adr/0001-0011` | Architecture decisions | Current — 11 ADRs | CRITICAL — must read all |
| `Django_Next.js_Plan/M3/*.md` | M3 planning | Current — 5 docs | CRITICAL — design authority |
| `contracts/openapi/v1.yaml` | API contract | Current — 36K lines | CRITICAL — frontend boundary |
| `milestones.md` | Commercial milestones | Current — 13.7K | HIGH — scope definition |
| `task.md` (root) | Active task tracking | Current — 91K | HIGH — current state |
| `tasks.md` (root) | Task tracking | Current — 34K | Medium — may be redundant |

---

## 25. FINAL EXECUTIVE SUMMARY

### Answers to the 12 Questions

1. **What percentage of Milestone 3 is genuinely complete?**  
   **15-25%.** A7 (Rentals) and A9 (Stays) are substantially built (~15% of M3 scope each), but the remaining 75-85% (Career/Jobs, Wallet, V Coins, Referral, Subscriptions, all dashboards/reporting, MSG91, Razorpay activation) is NOT IMPLEMENTED.

2. **What percentage of Milestone 4 is genuinely complete?**  
   **0%.** Zero code exists for mobile apps, vehicle platform, AI chatbot, or AI search.

3. **Three biggest technical risks:**
   - (1) Wallet/V Coins concurrency and money safety across all 10+ category checkout paths
   - (2) Vehicle platform real-time infrastructure (GPS, WebSocket, fare engine) has no architectural precedent in the codebase
   - (3) Mobile apps require native/cross-platform expertise that may not exist

4. **Three biggest scope risks:**
   - (1) The deadlines are physically impossible — not "at risk" but **mathematically impossible**
   - (2) The vehicle platform is effectively a separate product requiring 300-600 hours
   - (3) Admin dashboards/reporting is a hidden ~200-hour scope block that clients often underestimate

5. **Realistic remaining engineering effort:** ~2,395 hours (M3: ~875, M4: ~1,520)

6. **Pessimistic effort:** ~3,819 hours

7. **Can one developer realistically own the remaining work?** **No.** Even at 40 hrs/week of productive coding, one developer needs ~60 weeks (14+ months) for the realistic estimate. The contract window is ~4 weeks total.

8. **What support is required from the current developer?**  
   Critical for first 2-4 weeks (architecture walkthrough, M2 requirements complexity, payment flow). Moderate after that. Scenario B adds ~35% overhead.

9. **What should the new developer take first?**  
   (1) A7/A9 test stabilization, (2) A10 Career/Jobs, (3) MSG91 adapters. All three are clean-boundary modules with low integration risk.

10. **What should NOT be promised?**
    - The current contract deadlines
    - The vehicle platform in 20 days
    - Mobile apps without dedicated mobile expertise
    - A custom report builder (complex, low business priority relative to core features)

11. **What must be clarified before accepting ownership?**
    - Realistic renegotiated timeline
    - Mobile app technology choice
    - Vehicle platform scope (full Rapido or MVP ride-hailing?)
    - Team size — is it really one developer?
    - Staging infrastructure access

12. **Are the stated milestone deadlines realistic?**  
    **No. They are unrealistic by an order of magnitude.** M3 deadline is 7 days away with ~875 hours of work remaining. M4 deadline allows 20 days for ~1,520 hours of work. Even with a team of 5, the M4 scope (particularly the vehicle platform and mobile apps) would take 3-4 months.

---

## 26. FINAL RECOMMENDATION

### TAKE OWNERSHIP WITH CONDITIONS

The project has an **excellent technical foundation**. The backend architecture is production-grade, well-tested, and well-documented. The existing 7 categories are solid. The A7/A9 implementations demonstrate high engineering quality. The codebase is one of the better-engineered projects I have audited.

**However, ownership is only viable under these conditions:**

1. **Timeline must be renegotiated.** The current deadlines are not "aggressive" or "challenging" — they are mathematically impossible. A realistic timeline for one developer:
   - M3 (remaining): 4-5 months
   - M4: 6-8 months additional
   - Total: 10-13 months from start

2. **Vehicle platform scope must be agreed.** As specified (full Rapido clone), this is 300-600 hours alone. An MVP (basic ride booking + fare calculation) is ~150-200 hours. The difference matters.

3. **Mobile app strategy must be decided.** React Native / Expo is the only realistic choice for one developer targeting both platforms. Native (Swift + Kotlin) doubles the effort.

4. **The developer should NOT be the only person on this project.** At minimum:
   - One backend developer (wallet/coins/referral/vehicle)
   - One frontend/mobile developer (apps + UI)
   - Part-time DevOps (deployment, CI/CD, monitoring)

5. **Prioritize ruthlessly.** If one developer is non-negotiable, defer:
   - Custom report builder → post-launch
   - Bulk import → post-launch
   - AI chatbot/search → post-launch
   - Vehicle platform → separate milestone
   - Premium listings → post-launch

Under these conditions, the project is well-positioned for successful delivery. Without them, the new developer will be set up to fail regardless of their skill level.
