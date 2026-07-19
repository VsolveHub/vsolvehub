# Cart + Multi-Service Checkout — Design

Date: 2026-07-20
Status: Approved (brainstorming) — pending spec review
Scope: Customer app (`web/apps/customer`) + shared engine (`@vsolve/db`)

## Context

Today the customer books exactly one service per flow. `ServiceBookingFlow`
walks service → guidelines → when → details → choose → payment and calls
`POST /api/bookings`, which in one request creates a `DRAFT` booking, authorizes
an `Order`, and auto-assigns a provider.

The money model already supports a cart: an `Order` is a single authorization
covering **N** bookings, each captured or voided independently
(`authorizeOrder({ bookingIds: [...] })`, `orders.ts`, `booking-settlement.ts`).
`DRAFT` bookings are already defined as "in cart, not a real booking yet"
(`booking-scope.ts`: `CART_STATUSES = ["DRAFT"]`, filtered out of every list).

What is missing is entirely the **cart UI + API**: there is no `lib/cart` code,
no cart route, no add-to-cart, no multi-service checkout. `lib/cart/` is an empty
directory.

This design adds the cart layer on top of the existing Order/DRAFT model without
changing the money model.

### Scope of "the 4 services"

Applies to the four archetype-A, direct-assign categories: **Technician,
Beauty, Home, Pet** (`usesPushDispatch(archetype) === "A"`, CAPTAIN partners).
Crew, vehicle/rapido, and accommodation are out of scope for this sub-project.

## Decisions (from brainstorming)

1. **One cart, one payment, each service independently auto-assigned.** Checkout
   authorizes a single `Order` over all cart items; each item is then assigned to
   its own best-available provider by availability + rating/fairness.
2. **Mixed categories, per-item slot and address.** A cart may hold services from
   different categories, each with its own time slot and service address.
3. **Auto-assign only in the cart flow.** No per-item professional picking (the
   "choose your pro" step is dropped from the cart path). Deferred, not removed.
4. **Server-backed cart.** A cart item *is* a `DRAFT` booking in the DB, scoped by
   `userId`. Login is required to add to cart, reusing the existing
   OTP-login-then-resume pattern. Guest/localStorage cart is a future enhancement.

## Architecture

### Cart item = DRAFT booking

Adding to cart creates a fully-configured, server-priced `DRAFT` booking
(`status: "DRAFT"`, `paymentStatus: "PENDING"`, no `orderId`, no assignment). The
existing `createBooking` helper already supports `status: "DRAFT"`. Listing the
cart is `prisma.booking.findMany({ where: { userId, status: "DRAFT" } })`.

This means: no new tables, and the cart automatically inherits the
`ACTIVE_BOOKING_WHERE` exclusion so drafts never leak into booking history,
partner feeds, or counts.

### API surface (new)

All routes require an authenticated session (`getServerSession`) and scope every
query by `session.id`.

- `POST /api/cart` — add item.
  Body: `{ serviceId, addressId, slot, scheduleType, selections?, note?, mediaUrls?, archetypeDetails? }`.
  Validates the service is archetype A (`usesPushDispatch`), the address belongs
  to the user, and the slot is not in the past. Re-prices server-side via
  `priceBooking` (the client estimate is never trusted). Creates a `DRAFT`
  booking. Returns the created cart item.
- `GET /api/cart` — list the user's `DRAFT` bookings with service, per-item
  slot/address, priced line items, and a computed `totalPaise`.
- `PATCH /api/cart/[id]` — update `slot`/`scheduleType`/`addressId`/`selections`
  of one DRAFT item and re-price. Scoped to the owning user; 404 otherwise.
- `DELETE /api/cart/[id]` — remove one DRAFT item (`prisma.booking.deleteMany`
  scoped by `{ id, userId, status: "DRAFT" }`, so only carts can be deleted).
- `POST /api/cart/checkout` — `{ paymentMethod }`. The money-critical endpoint;
  see below.

### Checkout orchestration

New module `apps/customer/lib/cart/checkout.ts`, `checkoutCart(userId, method)`:

1. Load the user's `DRAFT` bookings (with address + service). Empty → return an
   error (`CART_EMPTY`).
2. **Gate each item**: run `findAvailablePartners` per item. (An item with zero
   providers can still be *carted*; the gate result is used to decide per-item
   outcome, not to block the whole cart.)
3. `total = sum(quotedAmount)` over all items.
4. `authorizeOrder({ userId, bookingIds: allItemIds, amountPaise: total, method, idempotencyKey: "cart:<userId>:<sortedIdsHash>" })`.
   This moves every item `DRAFT → AUTHORIZED` and captures/holds per method.
   - On auth failure → return `{ ok: false, error }`; bookings stay DRAFT, cart
     intact, retryable.
5. **Assign each item**: `assignBestPartner(bookingId)`. On per-item failure,
   `failBookingNoProviders(bookingId)` voids/refunds that item's share (the
   existing per-booking settlement) while the rest proceed.
6. Return `{ ok: true, orderRef, items: [{ bookingRef, serviceName, outcome: "assigned" | "no_provider", partner?, refunded? }] }`.

The idempotency key is derived from the user + the set of cart booking ids, so a
double-submitted checkout reuses the same Order (the `Order_one_open_per_user`
partial unique index and `authorizeOrder`'s idempotency both back this).

Pure, unit-testable helpers extracted:
- `cartTotalPaise(items)` — sum of quoted amounts.
- `summarizeCheckout(assignResults)` — maps per-item assign results to the
  response shape. Tested with injected results (the `assign.test.ts` pattern).

### UI

- **`ServiceBookingFlow`**: terminal action changes from *Pay* to **Add to cart**.
  The `choose` and `payment` steps are removed from this flow (auto-assign only;
  payment happens once at the cart). New flow: service → guidelines → when →
  details → *Add to cart* → confirmation affordance (toast/inline) offering
  "View cart" or "Add another service". Adds via `POST /api/cart`. The existing
  `requireLoginThen` gate moves to the Add-to-cart action.
- **`/cart` page** (`app/cart/page.tsx` + client): line items (service · slot ·
  address · price) with edit (slot/address) and remove; a single payment-method
  selector; order summary with `totalPaise`; `Pay ₹total` button; empty state
  with a link back to services.
- **Checkout result screen** — rendered inline on the `/cart` page after a
  successful checkout (the cart list is replaced by the result state, keyed off
  the checkout response). Shows per-item outcome — assigned professional, or "no
  provider available — refunded" — each linking to `/booking/track/[ref]`, plus a
  "Back to services" action. No separate route, so no order re-fetch is needed.
- **Cart badge**: item count in the app header, from `GET /api/cart`, invalidated
  on add/remove via TanStack Query.

### Data flow

```
Service card → ServiceBookingFlow (configure) → POST /api/cart (DRAFT booking)
   → /cart (list DRAFTs, GET /api/cart) → POST /api/cart/checkout
   → authorizeOrder(all ids) → assignBestPartner(each) [failBookingNoProviders on miss]
   → confirmation (per-item outcome) → /booking/track/[ref] per item
```

## Error handling

- Add to cart while logged out → OTP login, then resume the add (existing
  sessionStorage resume mechanism).
- Add to cart: service not archetype A → 400; address not owned → 404; past slot
  → 400.
- Checkout with empty cart → 409 `CART_EMPTY`.
- Payment authorization fails → Order stays `PENDING_PAYMENT`, items stay DRAFT,
  cart preserved, user can retry or change method.
- Per-item no provider at checkout → that item voided/refunded via
  `failBookingNoProviders`; other items still book; the result screen names the
  refunded item(s).
- Concurrent double-checkout → same Order reused (idempotency key + partial unique
  index); no double authorization.

## Testing

- `cartTotalPaise` — sums line items; handles empty.
- `summarizeCheckout` — maps mixed assigned/no-provider results to the response
  shape, including the refunded flag.
- Checkout orchestrator — with injected `assignBestPartner`/gate stubs: all
  assigned, some no-provider (partial), auth failure (nothing assigned, cart
  intact), empty cart.
- Add-to-cart validation — archetype gate, address ownership, past-slot rejection
  (route-level, following existing route test patterns where present).

## Out of scope (later sub-projects)

Maps, provider live tracking, rapido/vehicle fan-out, guest/localStorage cart,
per-item professional picking, cart-level scheduling discounts/coupons.

## Files touched (anticipated)

New:
- `apps/customer/lib/cart/types.ts`, `apps/customer/lib/cart/checkout.ts`,
  `apps/customer/lib/cart/summary.ts` (+ tests)
- `apps/customer/app/api/cart/route.ts`,
  `apps/customer/app/api/cart/[id]/route.ts`,
  `apps/customer/app/api/cart/checkout/route.ts`
- `apps/customer/app/cart/page.tsx` + cart client components
- `apps/customer/lib/query/*` cart query keys + api wrappers

Modified:
- `apps/customer/components/customer/booking/ServiceBookingFlow.tsx` (terminal
  action → Add to cart; drop choose/payment steps)
- App header (cart badge)
