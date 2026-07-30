# Decision Register and Implementation Gates

## Accepted decisions

| ID | Decision | Reason |
|---|---|---|
| ADR-001 | Customer remains Next.js | SEO/public catalog plus React application capability |
| ADR-002 | Booking is a React client workspace within Next.js | Fast stage transitions without framework migration |
| ADR-003 | Django/DRF owns business APIs | One durable domain and security boundary |
| ADR-004 | Modular monolith before microservices | Strong boundaries with lower operational cost |
| ADR-005 | Celery + Redis for durable work | Dispatch/retries must survive browser/request closure |
| ADR-006 | Django ORM is sole migration authority | Prevent schema and transaction drift |
| ADR-007 | Local PostgreSQL for development | Fast, isolated and reproducible |
| ADR-008 | Supabase PostgreSQL for staging/production | Managed PostgreSQL and operational convenience |
| ADR-009 | Technician is the first vertical slice | Proves the fixed-service engine before expansion |
| ADR-010 | One visit equals one booking | Correct partner, slot, OTP and timer semantics |
| ADR-011 | Capacity hold precedes payment | Avoid pay-then-refund for known unavailability — **Scheduled only; superseded for Instant by ADR-028** |
| ADR-012 | Browser polling never drives dispatch | Backend reliability independent of customer session |
| ADR-013 | Fixed services have no live-map tracking | Lower privacy/complexity; status timeline is sufficient — **reaffirmed in full by ADR-030** |
| ADR-014 | Current app remains reference until acceptance | Safer controlled cutover |
| ADR-015 | Cart, CheckoutSession and Booking are separate tables/domains | Draft shopping state must not leak into operational booking state |
| ADR-016 | Partner fixed-service work loop ships with Technician | Customer booking is incomplete without a real fulfilment path |
| ADR-017 | Instant partner presence uses heartbeat and expiry | A stale Boolean must not create false capacity |
| ADR-018 | Partner offers show estimated net earning | Customer gross total is not partner compensation |
| ADR-019 | Customer, Partner and Admin/Operations remain Next.js in Milestone 1 | Avoid a framework rewrite; use React/TanStack Query workspaces for fast interaction |
| ADR-020 | `web/apps/admin` remains the physical Operations app | Avoid a duplicate greenfield application and unnecessary rename churn |
| ADR-021 | ~~Scheduled work uses commitment holds; Instant work uses offer-accept before payment~~ | **Superseded by ADR-028.** Scheduled part still stands |
| ADR-022 | Online payment capture is the only Milestone 1 collection mode | Keep booking, extension and parts settlement deterministic; COD is deferred |
| ADR-023 | Arrival is an explicit Partner command, not location tracking | Notify the Customer without collecting or exposing continuous GPS |
| ADR-024 | Start-OTP confirmation atomically starts the server work session | One authoritative countdown across all clients |
| ADR-025 | Tax and compliance behaviour is configuration reviewed by qualified advisers | Avoid hardcoded/outdated tax assumptions |
| ADR-026 | Public booking/order references are high-entropy identifiers | Prevent enumeration and IDOR risk |
| ADR-027 | No Prisma is used in the new system | Django ORM and migrations remain the single authority |
| ADR-028 | **Instant captures payment before Partner assignment**; Scheduled keeps hold-before-payment | Removes the unpaid-customer risk to Partner calendars and eliminates `PAYMENT_READY` as a proxy for payment. Accepts refund exposure in exchange — see ADR-029 |
| ADR-029 | **Acknowledge-and-assign, not offer-accept.** A Partner is assigned and must acknowledge; there is no Accept/Decline offer and no customer-facing provider picker | Declining must not be a free, normal action once money is captured. Acknowledgement still proves a real human is engaged — the thing the offer model was actually protecting — without giving a paid booking away to a free choice |
| ADR-030 | **No live tracking of any kind.** Customer sees a status timeline and an estimated arrival time as text; no map, marker, position ping or location history | Without native background location the platform does not know the Partner's position; rendering an unverifiable one is the same fabrication defect as the hardcoded-city fallback. Reaffirms ADR-013/ADR-023 in full |
| ADR-031 | Cancellation is a graduated refund ladder; Partner compensation is a capped dispatch fee, never a percentage of job value | Pays for the cost actually incurred (a wasted trip) and avoids incentivising Partners to prefer cancellations on high-value jobs |

ADR-028 through ADR-031 are specified in
[11-payment-first-instant-and-cancellation-policy.md](./11-payment-first-instant-and-cancellation-policy.md),
which lists exactly what it supersedes in docs 09 and 10.

The detailed, precedence-setting specification is
[09-milestone-1-authoritative-resolution.md](./09-milestone-1-authoritative-resolution.md), as amended by
[10-instant-dispatch-and-decision-resolution.md](./10-instant-dispatch-and-decision-resolution.md) and
[11-payment-first-instant-and-cancellation-policy.md](./11-payment-first-instant-and-cancellation-policy.md).

## Resolved implementation decisions

### 1. Repository transition

Recommended:

- Add `backend/` and `infra/` beside the existing `web/`.
- Keep current frontend paths during the vertical slice.
- Remove legacy APIs only after cutover.

### 2. Partner and Operations build framework

Accepted:

- Keep `customer`, `partner` and `admin` on Next.js App Router for Milestone 1.
- Build persistent client-side React workspaces with TanStack Query for click-heavy authenticated UI.
- Product-label `admin` as Operations; do not create `web/apps/operations`.
- Reconsider a framework migration only after production-like profiling and an approved ADR.

### 3. Authentication ownership

Recommended:

- Django owns identity, sessions, roles and OTP policy.
- MSG91 or another approved SMS provider delivers customer OTP.
- Supabase Auth is removed from core business identity after migration.
- Supabase Storage can remain independent of auth ownership.

### 4. Payment behaviour in Milestone 1

Accepted:

- Implement the full payment adapter contract and sandbox/fake provider.
- Integrate live Razorpay in the milestone allocated for payments.
- Never bypass order/payment states even in development demos.
- Capture the booking payment after a valid capacity commitment.
- Collect approved extension/parts revisions through a separate idempotent online payment.
- Do not display Cash/Pay after service in Milestone 1.

### 5. Provider commitment model

Scheduled:

- Partner-published availability permits provisional reservation.
- Capacity is held before payment.
- Booking becomes confirmed after authoritative payment.
- Partner cancellation triggers backend recovery and operations alert.

Instant (revised per ADR-028/029 —
[doc 11](./11-payment-first-instant-and-cancellation-policy.md)):

- Pre-check that at least one eligible, reachable Partner exists; a known-empty pool blocks checkout
  before any charge.
- Capture payment first.
- Assign a ranked Partner who must **acknowledge**; on no acknowledgement, reassign to the next Partner.
  The customer never sees a Partner picker and the Partner never sees an Accept/Decline decision.
- Show “Finding your professional” while assigning and do not call the job confirmed until a Partner is
  actually committed.
- If no Partner confirms, offer reschedule slots first, then a bounded retry, then a full refund with a
  real timeline. Never claim the customer was not charged.

### 6. Multi-service checkout

Recommended:

- Single service is the default path.
- Same-visit quantity remains one booking.
- Multiple independent services use multiple bookings grouped by one order.
- All capacity holds must be valid before grouped payment starts.

### 7. Development database reset

Recommended:

- Do not reset first.
- Build migrations, seeds and Technician E2E first.
- Export the existing database.
- Request explicit authorization immediately before reset.

## Deliberately deferred

Not part of the Technician Milestone 1 vertical slice:

- Microservices
- Kubernetes
- Native mobile applications
- Vehicle live GPS
- AI chatbot/search
- Wallet/V Coins/referrals
- Complex workforce/crew engine
- Accommodation/rental/job-board domains
- Custom analytics/report builder
- Multi-region active-active deployment
- Vite migration
- Cash/pay-after-service and Partner cash collection
- Coupons, wallet credits and promotional discounts
- Dynamic/surge pricing
- Provider organizations/crews with capacity greater than one
- Native background location or continuous Customer-visible Partner tracking

These can be supported later without changing the core booking boundaries.

## Final approval checklist

Accepted:

- [x] Use Django + DRF backend
- [x] Use Next.js for Customer, Partner and Admin/Operations
- [x] Use React/TanStack Query workspaces within Next.js
- [x] Use local PostgreSQL/Redis for development
- [x] Use separately managed PostgreSQL for staging/production
- [x] Django owns schema and migrations; do not use Prisma
- [x] Start with Technician vertical slice
- [x] Scheduled hold precedes payment; Instant payment precedes automated assignment (ADR-028)
- [x] Use one booking per visit
- [x] Keep legacy system only as reference until vertical-slice acceptance
- [x] No Customer live Partner tracking
- [x] Arrived notification precedes start OTP; OTP starts the countdown
- [x] Reset development data only at a controlled cutover

Production remains gated on live-provider credentials and reviewed tax/privacy configuration.
