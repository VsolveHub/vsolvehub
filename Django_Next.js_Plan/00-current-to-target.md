# Current State → Target State

## Current flow

```text
/services
  → /services/technician
  → login
  → /booking scope page
  → requirements
  → /cart
  → /checkout address/slot/provider/payment
  → pay
  → assign
  → track
```

For a logged-out customer booking one service, this requires roughly three pages, two modal interactions and many avoidable decisions.

## Current architectural status

The current system contains useful work, but business ownership is distributed across the frontend, Next.js route handlers, Prisma models and browser polling.

Observed characteristics:

- Customer, Partner and Admin are Next.js applications.
- Prisma is used against Supabase PostgreSQL.
- Customer authentication uses custom database sessions and OTP.
- Admin uses Supabase Auth.
- A cart item is represented by a `Booking` row in `DRAFT`.
- Checkout authorizes one order and assigns bookings sequentially.
- Provider matching supports skill, distance, availability and overlap checks.
- Some dispatch/reassignment work can be initiated by customer polling.
- Root/customer routes frequently resolve sessions and query the remote database.
- Development navigation includes on-demand route compilation.
- The current Prisma schema mixes unrelated domains in one large schema file.
- The API surface is embedded in the customer Next.js application.

## Product and correctness gaps

| Current | Risk | Target |
|---|---|---|
| Catalog price and booking configuration can diverge | Misleading price and consumer complaints | Versioned service rate is the single source for cards, quotes and invoices |
| Generic service overrides cover only part of the catalog | Different services can book at identical incorrect prices | Every sellable variant has explicit rate and duration configuration |
| Availability can be checked at different stages with different inputs | Payment-stage rejection or false capacity | One availability service using address, duration, skill and reservation overlap |
| Browser displays a placeholder/default slot | Customer did not explicitly consent | No slot exists until customer selects Instant or Scheduled |
| `DRAFT Booking` acts as cart | Operational and shopping concepts are mixed | `Cart`/`CartItem` hold selections; `CheckoutSession` holds checkout state; `Booking` represents a confirmed operational visit |
| Quantity can create duplicate bookings | Multiple partners/OTPs/timers for one job | Scope line quantity within one booking |
| Provider assignment is direct and request-driven | Race conditions and weak recovery | Transactional reservation plus worker-driven dispatch/recovery |
| One failed item can create ambiguous order messaging | Customer cannot tell what was charged/booked | Explicit per-booking result with pre-payment all-capacity gate |
| Fees differ between cart and checkout messaging | Loss of trust | Quote snapshot shared by booking, checkout, payment and invoice |
| Location fallback can invent an address | Wrong service location | Customer-confirmed geocoded address, no hidden fallback |
| Multiple authentication approaches | Security and maintenance inconsistency | One Django-owned identity and role model |
| Next route handlers own domain rules | Hard to share with apps/workers | Django application services own all domain mutations |
| Browser polling can drive reassignment | Work stops if browser closes | Celery drives retries and expiry |
| Live map for fixed home services | Unnecessary complexity and privacy risk | Status timeline only; live map reserved for mobility categories |

## What remains valuable

The rebuild should preserve:

- Brand identity and official logo.
- Approved information architecture for categories and services.
- Existing responsive shell components that pass accessibility review.
- Existing icon library if it is used consistently.
- TanStack Query packages and query-key conventions.
- Working geocoding normalization logic after it is moved behind Django.
- Provider matching weights only after product review and tests.
- Duration, extension and timer concepts.
- Invoice presentation and print assets after data ownership moves to Django.

## What changes for each application

### Customer

Current:

- Public and transactional work are interleaved.
- Multiple route transitions are used for one booking.
- Customer state is frequently derived from server routes.

Target:

- Next.js owns public rendering and the application shell.
- Django owns session, catalog, price, booking and payment truth.
- The booking journey is one client-side React workspace.
- TanStack Query caches server state.
- A local booking draft survives login and refresh.
- No direct database or Prisma dependency.

### Partner

Current:

- Next.js application with Supabase-related functionality.

Target:

- React SPA consuming Django APIs.
- Partner availability is an explicit commitment.
- Assignments, acknowledgements, OTP confirmation, timers and job actions use auditable APIs.
- Real-time updates are transport only; PostgreSQL/Django remains authoritative.

### Operations/Admin

Current:

- Next.js and Supabase Auth.

Target:

- React SPA for operational dashboards.
- Django Admin for emergency/internal data operations.
- Custom operations UI for booking, dispatch, payment and partner workflows.
- Strong roles, MFA, immutable financial audit and action logging.

## Expected result

The goal is not merely fewer pages. It is a clearer state model:

```text
Cart
  → Checkout session
  → Quote accepted
  → Capacity held
  → Payment pending/authorized
  → Booking created and confirmed
  → Partner arriving
  → OTP verified / work started
  → Completed
  → Settled
```

Every screen must correspond to a real backend state, with a clear recovery path when a dependency fails.
