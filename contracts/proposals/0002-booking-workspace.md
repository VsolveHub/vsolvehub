# Proposal 0002 — Booking workspace endpoints

**Status:** Proposed
**Raised by:** Claude (frontend)
**Affects:** new operations; no change to anything published in `contracts/openapi/v1.yaml` (v1.2.0)
**Blocks:** B3 integration. B3 is built and tested against these shapes via MSW, per tasks.md §3 rule 7.
**Consuming screen:** `/book/[service]` — the customer booking workspace (tasks.md B3)

## Problem

v1.2.0 publishes everything the workspace needs for its first four stages — variant configuration
with scope questions and duration bounds, serviceability, addresses, session. It publishes nothing
for the five stages after that.

Missing, in the order the workspace reaches them:

| Stage | Needs | Sequence |
|---|---|---|
| Slot | Scheduled availability for the next seven days | Scheduled |
| Provider | Eligible Partners, top four plus Auto Assign | Scheduled |
| Hold | Provider-specific capacity hold before payment | Scheduled |
| Pre-check | Eligible-pool existence check that fails closed | Instant |
| Quote | Itemized price and the cancellation ladder in rupees | Both |
| Cart | `Cart` / `CartItem` / `CartItemScope` persistence | Both |

B3's acceptance criteria include *"UI never fabricates availability or price"*. Every shape below
exists so the frontend can render a server answer instead of computing one.

## What the frontend commits to in the meantime

These shapes live in exactly one quarantined directory,
`web/apps/customer/features/booking/contract-pending/`, and reach components only through an adapter
into view models. A test fails the build if anything under `features/booking/view/` imports from it.
When Codex publishes the real operations, the integration is: regenerate the client, rewrite the
adapters, delete the quarantine. No component or component test changes.

Query keys for these endpoints deliberately do **not** go in `@vsolve/query`'s `keys.ts`, whose own
header states that keys exist only for published endpoints. They live in the quarantine too.

Names and field shapes below are a request, not an assumption. Where Codex's domain model differs,
the adapter absorbs it — the frontend is not asking Codex to match this document, only to publish
something that answers the same questions.

---

## 1. Scheduled availability

```text
POST /api/v1/booking/availability/
```

Doc 03 §2: the next seven days, windows shown only after a date is selected, nothing preselected,
availability considering the full duration plus existing extensions and reservations.

**Request**

```yaml
value:
  service_variant_id: 8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83
  address_id: 77777777-7777-4777-8777-777777777777
  duration_minutes: 90
```

**Response 200**

```yaml
value:
  server_now: 2026-07-30T09:00:00Z
  days:
    - date: 2026-07-30
      has_availability: true
      slots:
        - id: slot_01J8ZQ2K3M4N5P6Q7R8S9T
          start_at: 2026-07-30T11:00:00Z
          end_at: 2026-07-30T12:30:00Z
          is_available: true
        - id: slot_01J8ZQ2K3M4N5P6Q7R8SA0
          start_at: 2026-07-30T12:30:00Z
          end_at: 2026-07-30T14:00:00Z
          is_available: false
          unavailable_reason: FULLY_BOOKED
    - date: 2026-07-31
      has_availability: false
      slots: []
```

Notes:

- `id` is opaque to the frontend and is what `POST /capacity-holds/` receives. The frontend never
  constructs a slot from a date and a time.
- Unavailable slots are **returned, not omitted**, so the UI can show a disabled window rather than a
  gap. `is_available: false` must block progression; that is an explicit B3 acceptance criterion.
- `has_availability: false` with `slots: []` is a legitimate answer and renders an empty state. It is
  distinct from the endpoint being unreachable, which renders an error. Please do not collapse a
  supply failure into an empty list — that difference is the one that tells a customer Vsolve Hub has
  no availability when in fact the service was down.
- `server_now` on every response, per the existing server-clock utility.

**Errors**

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Duration outside the variant's configured bounds |
| 404 | `ADDRESS_NOT_FOUND` | Address id does not belong to this customer |
| 409 | `AREA_NOT_SERVICEABLE` | Address is outside the service area for this variant |

---

## 2. Eligible Partners

```text
POST /api/v1/booking/eligible-partners/
```

Doc 03 §5: Auto Assign plus up to four eligible providers, with only decision-useful information.
**Scheduled only.** Instant has no provider-selection step at any point (doc 10 §2.1, doc 11 §2), and
the frontend enforces that structurally — the Instant sequence does not contain the stage.

**Request**

```yaml
value:
  service_variant_id: 8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83
  address_id: 77777777-7777-4777-8777-777777777777
  slot_id: slot_01J8ZQ2K3M4N5P6Q7R8S9T
  duration_minutes: 90
```

**Response 200**

```yaml
value:
  server_now: 2026-07-30T09:00:00Z
  auto_assign_available: true
  partners:
    - id: 9c4e1b70-5a2f-4d38-8e19-3b6c0f7a2d54
      display_name: Ramesh K.
      photo_url: null
      rating: '4.7'
      rating_count: 213
      completed_jobs: 240
      skill_badge: Electrical
      previously_booked: false
      price_difference: null
      availability_text: Available at 11:00 am
```

Notes:

- `rating` is a decimal string, matching how `Address.latitude` is already published — it avoids
  float formatting drift between Django and JavaScript.
- `price_difference` is `Money` or `null`. Null means this Partner costs the same; the UI then shows
  no price text at all rather than "₹0 extra", which reads as a fee.
- `availability_text` is server-authored. The frontend does not compose arrival language from a
  timestamp, because the phrasing differs between Scheduled and Instant and the rules live in the
  backend.
- An empty `partners: []` with `auto_assign_available: true` is valid and shows Auto Assign alone.
  Both false and empty means no eligible supply for that slot — a real state, not an error.
- Doc 03 §5: selection never bypasses skill, service area, KYC, schedule or overlap rules. The
  frontend treats this list as authoritative and offers no way to pick anyone outside it.

---

## 3. Capacity hold

```text
POST   /api/v1/booking/capacity-holds/
DELETE /api/v1/booking/capacity-holds/{hold_id}/
```

Scheduled only. ADR-011 as it still applies to Scheduled: the hold precedes payment. For Instant the
ordering is reversed and no hold exists at payment time (doc 11 §2) — the workspace must not create
one, and must not imply one exists.

**Request**

```yaml
value:
  cart_item_id: 5e8d2a14-9c37-4f60-b2a8-7d1e4c9f0b63
  slot_id: slot_01J8ZQ2K3M4N5P6Q7R8S9T
  partner_id: null        # null means Auto Assign
```

**Response 201**

```yaml
value:
  id: hold_01J8ZQ2K3M4N5P6Q7R8SB1
  cart_item_id: 5e8d2a14-9c37-4f60-b2a8-7d1e4c9f0b63
  partner_id: 9c4e1b70-5a2f-4d38-8e19-3b6c0f7a2d54
  slot_id: slot_01J8ZQ2K3M4N5P6Q7R8S9T
  expires_at: 2026-07-30T09:08:00Z
  server_now: 2026-07-30T09:00:00Z
```

`partner_id` is populated on the response even when the request sent null, so the review screen can
name the auto-assigned Partner instead of saying "someone".

**Errors** — these three need distinct codes because each has a different recovery:

| Status | Code | Recovery |
|---|---|---|
| 409 | `SLOT_NO_LONGER_AVAILABLE` | Return to the slot stage. Doc 03's example copy applies verbatim. |
| 409 | `PARTNER_NO_LONGER_ELIGIBLE` | Return to the provider stage; the slot survives. |
| 409 | `HOLD_ALREADY_EXISTS` | Idempotent replay of the same request; return the existing hold. |

`SLOT_NO_LONGER_AVAILABLE` should carry `retryable: true` — booking again after choosing another slot
works — while remaining a 409 so the client's transport layer does not silently resend it. Proposal
0001 covers that distinction.

---

## 4. Instant eligible-pool pre-check

```text
POST /api/v1/booking/instant/pre-check/
```

Doc 11 §2 step 6: one fast, lock-free existence query. Reserves nothing, locks nothing. Its only
purpose is to never ask a customer to pay into a search already known to be empty.

**Request**

```yaml
value:
  service_variant_id: 8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83
  address_id: 77777777-7777-4777-8777-777777777777
  duration_minutes: 90
```

**Response 200 — can dispatch**

```yaml
value:
  server_now: 2026-07-30T09:00:00Z
  can_dispatch: true
  reason_code: null
  estimated_arrival_text: Usually 25–40 minutes
```

**Response 200 — cannot dispatch**

```yaml
value:
  server_now: 2026-07-30T09:00:00Z
  can_dispatch: false
  reason_code: OUTSIDE_OPERATING_WINDOW
  estimated_arrival_text: null
  message: Instant service in your area runs 8:00 am to 10:00 pm. Book a slot instead.
```

Notes:

- **A refusal is a 200, not an error status.** "No professional is available right now" is a correct
  answer to a well-formed question, and modelling it as an error would route it through generic error
  handling instead of the specific recovery each code deserves.
- `reason_code` values are doc 11 §4's pre-payment codes, and they must stay distinct:
  `ELIGIBLE_POOL_EXHAUSTED`, `INSTANT_UNAVAILABLE`, `OUTSIDE_OPERATING_WINDOW`,
  `AREA_NOT_SERVICEABLE`. Doc 11 §2.2 is explicit that a 2 AM request in an area closing at 10 PM is
  refused with the operating-window message and not by an empty search — so the frontend needs to
  tell those two apart, and offers a different next action for each.
- `message` is server-authored because the operating hours are in it. The frontend does not know the
  window.
- `estimated_arrival_text` is text, per ADR-013/ADR-030 and doc 11 §7. No coordinates, no ETA
  timestamp the UI could turn into a countdown or a moving marker.
- All three refusal codes are pre-payment, so the workspace may state "You have not been charged"
  here. That sentence is forbidden after payment (doc 11 §4) and the frontend enforces the split.

---

## 5. Quote

```text
POST /api/v1/booking/quote/
```

The single source of every number the customer sees after the catalog's "starts at". Doc 03 §7.

**Request**

```yaml
value:
  cart_id: 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d
```

**Response 200**

```yaml
value:
  id: quote_01J8ZQ2K3M4N5P6Q7R8SC2
  version: 3
  expires_at: 2026-07-30T09:15:00Z
  server_now: 2026-07-30T09:00:00Z
  fulfilment_type: SCHEDULED
  lines:
    - code: service
      label: Switch / Socket Repair — 90 minutes
      amount: { amount_paise: 29900, currency: INR }
    - code: scope_extra
      label: Additional socket point (×2)
      amount: { amount_paise: 8000, currency: INR }
  subtotal: { amount_paise: 37900, currency: INR }
  platform_fee:
    label: Platform fee
    amount: { amount_paise: 2900, currency: INR }
  tax:
    label: GST 18%
    amount: { amount_paise: 7344, currency: INR }
  total: { amount_paise: 48144, currency: INR }
  cancellation_ladder:
    policy_version: scheduled-v1
    bands:
      - code: A
        condition_text: More than 24 hours before your slot
        refund_amount: { amount_paise: 48144, currency: INR }
        fee_amount: { amount_paise: 0, currency: INR }
      - code: B
        condition_text: Between 24 and 2 hours before your slot
        refund_amount: { amount_paise: 33701, currency: INR }
        fee_amount: { amount_paise: 14443, currency: INR }
      - code: C
        condition_text: Less than 2 hours before your slot
        refund_amount: { amount_paise: 0, currency: INR }
        fee_amount: { amount_paise: 48144, currency: INR }
```

Notes:

- **The ladder belongs on the quote.** Doc 11 §5.1/§5.3 requires the graduated ladder with concrete
  rupee amounts for *this* booking, shown before the pay action. Percentages published separately
  would force the frontend to multiply them by the total, which is computing a price — precisely what
  B3 forbids. So the bands arrive pre-computed in rupees, with server-authored `condition_text`,
  and the UI only formats them.
- The Instant ladder has different bands (doc 11 §5.1: five, including the unconditional
  `PAID_UNASSIGNED` band and the customer-unavailable visit fee). Same envelope, different contents,
  selected by `fulfilment_type`. The frontend renders whatever bands arrive and hardcodes none.
- `version` and `expires_at` support the revalidation doc 03 §7 requires before payment starts.
- `platform_fee` and `tax` carry their own labels because GST applicability varies and the frontend
  must not assert a rate.
- Every amount is `Money` in paise. No frontend arithmetic on money anywhere, including the total.

**Errors**

| Status | Code | Recovery |
|---|---|---|
| 409 | `QUOTE_EXPIRED` | Refetch; show the new total before allowing payment |
| 409 | `CART_ITEM_INCOMPLETE` | Return to the first stage with a missing answer |
| 409 | `HOLD_EXPIRED` | Return to the slot stage |

---

## 6. Cart

```text
GET    /api/v1/cart/
POST   /api/v1/cart/items/
PATCH  /api/v1/cart/items/{item_id}/
DELETE /api/v1/cart/items/{item_id}/
```

Doc 03 "Cart policy": real `Cart`, `CartItem` and `CartItemScope` tables; same-visit quantity is one
cart item and later one booking; a separate-visit choice is a separate cart item.

**CartItem**

```yaml
value:
  id: 5e8d2a14-9c37-4f60-b2a8-7d1e4c9f0b63
  service_variant_id: 8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83
  service_slug: switch-socket-repair
  fulfilment_type: SCHEDULED
  quantity: 2
  duration_minutes: 90
  address_id: 77777777-7777-4777-8777-777777777777
  slot_id: slot_01J8ZQ2K3M4N5P6Q7R8S9T
  partner_id: null
  capacity_hold_id: hold_01J8ZQ2K3M4N5P6Q7R8SB1
  scope:
    - question_code: socket-count
      value: 2
    - question_code: wiring-accessible
      value: true
  notes: Second bedroom, switch sparks intermittently.
```

Notes:

- `fulfilment_type` is `INSTANT | SCHEDULED` and is per item, not per cart, because doc 10 §14
  forbids mixing them in one checkout while explicitly keeping the customer's other items in the
  cart. The frontend enforces one Instant item per checkout and shows
  "Book this now — your other items stay in your cart."
- `quantity` is same-visit scope quantity (doc 03 §3), never a multiplier for separate bookings.
- `scope[].value` is heterogeneous by question kind — number, boolean, string, or an array of option
  codes for `MULTIPLE_CHOICE`. Please publish it as an untyped/`any` schema member rather than
  stringifying, so the frontend can round-trip the answer without parsing.
- Doc 03 §3: notes and photos survive a quantity change. Photo upload is not proposed here; B3 does
  not build it and it should be its own proposal when the upload endpoint is designed.

**Errors**

| Status | Code | Recovery |
|---|---|---|
| 401 | `AUTHENTICATION_REQUIRED` | "Log in to add items" — the pending-action resume path (B4) |
| 409 | `CART_EXPIRED` | Rebuild from local intent; never silently drop the customer's work |
| 409 | `INSTANT_ITEM_CONFLICT` | An Instant item cannot join a cart being checked out with others |

---

## Open questions for Codex

1. **Slot identity.** Opaque token, or a `(partner_id, start_at)` pair? The frontend prefers opaque —
   it makes fabricating a slot impossible — but that only works if the backend can resolve it at hold
   time without the client echoing anything else back.
2. **Where the ladder is computed.** This proposal puts it on the quote response. If the policy
   snapshot lives on the checkout session instead, say so and the frontend will read it from there;
   the requirement is only that concrete amounts arrive before the pay action.
3. **Pre-check freshness.** Doc 11 §2.2 point 8 says ranking is re-run at assignment and the
   pre-check is never trusted as still valid. Should the response carry a short TTL so the workspace
   knows when to re-run it, or is re-running on every entry to the quote stage acceptable?
4. **Auto Assign identity on hold.** Returning the resolved `partner_id` lets review name the
   Partner. If Auto Assign genuinely defers identity until later, the frontend needs to know so it
   does not promise a name it cannot produce.
