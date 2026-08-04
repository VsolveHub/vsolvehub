# Proposal 0011 — Publish the Booking Group's payment entry point

**Author:** Claude (FE-10 customer payment integration)
**Date:** 4 August 2026
**Verified against:** OpenAPI 1.13.0
**Status:** Proposed
**Consuming application:** Customer
**Consuming route / action:** `/bookings/[groupId]` → "Continue to payment", and the receipt view
**Required authorization:** Unchanged — `cookieAuth`, Customer owning the group

## Problem

`GET /api/v1/booking-groups/{group_id}/` tells the Customer that payment is required and then gives
them no way to pay.

The group projection publishes `recovery_action`, and `BookingGroupSerializer.get_recovery_action`
returns the literal string `PAYMENT_REQUIRED` when the group reaches `PAYMENT_PENDING`:

```python
if group.status == BookingGroup.Status.PAYMENT_PENDING:
    return "PAYMENT_REQUIRED"
```

But the command that acts on that instruction is:

```yaml
PaymentAttemptCreateRequest:
  checkout_id: string(uuid)          # required
  expected_checkout_version: integer # required
```

Neither field is reachable from anything the Customer can read:

- `BookingGroup` publishes `id`, `status`, `version`, `confirmation_policy`, `expires_at`,
  `server_now`, `recovery_action`, `next_transition_at`, `units`, `created_at`, `updated_at`.
  **There is no `checkout_id` and no checkout version.**
- **There is no `GET /api/v1/checkouts/{checkout_id}/`.** The published checkout routes are
  `POST /checkouts/`, `GET /checkouts/{id}/payment/`, `POST /checkouts/{id}/search/` and
  `POST /checkouts/{id}/search/advance/`. The only way a client ever holds a `Checkout` is the
  `201` body of the `POST /checkouts/` that created it.

So a Customer can pay **only inside the browser tab that confirmed the group**, and only until that
tab's client state is lost. Reload the page, close the tab, follow a link from a notification, or
open `/bookings` on a second device, and `recovery_action: PAYMENT_REQUIRED` becomes an instruction
with no executable command behind it. The reservation then expires, the holds are released, and the
Customer replans work they had already committed to — because the client could not name a UUID the
server was holding all along.

The same break happens after capture. `Order` carries `booking_group_id`, but retrieval is
`GET /api/v1/orders/{order_id}/` only — there is no list, no filter and no reverse pointer. A
Customer who has paid cannot reach their own order, allocations, invoice or credit note.

This is not a missing feature. Both relations already exist in Django and are already loaded:

```python
# apps/carts/models.py
class CheckoutSession(models.Model):
    booking_group = models.OneToOneField(BookingGroup, null=True, related_name="checkout", ...)

# apps/commerce/models.py
class Order(models.Model):
    booking_group = models.OneToOneField(BookingGroup, null=True, related_name="order", ...)
```

`group.checkout` and `group.order` are one attribute access away. Only the projection withholds them.

## Proposed change

Add three additive, read-only, nullable fields to `BookingGroup`. No new endpoint, no new command,
no change to any existing field, no migration.

```yaml
BookingGroup:
  # ... existing fields unchanged ...
  checkout_id:
    type: string
    format: uuid
    nullable: true
    readOnly: true
    description: >
      The CheckoutSession this group belongs to. Pass with checkout_version to
      POST /api/v1/payment-attempts/. Null only for a group with no checkout.
  checkout_version:
    type: integer
    nullable: true
    readOnly: true
    description: >
      Send as expected_checkout_version. A stale value fails the payment command
      closed rather than paying against a checkout that moved.
  order_id:
    type: string
    format: uuid
    nullable: true
    readOnly: true
    description: >
      The Order created when payment captured. Null before capture. Pass to
      GET /api/v1/orders/{order_id}/ for allocations, invoice and credit note.
```

### Why these three and not a checkout detail endpoint

A `GET /checkouts/{id}/` would also close the first gap, but it would be a second read on the
critical path for the same fact, and the Customer would need the checkout id in order to ask for the
checkout. It cannot bootstrap itself. Three fields on a projection the client is already polling
costs one join it is already making, and keeps the payment entry point in the same response as the
status that demands payment.

### Why the version travels with the id

`expected_checkout_version` exists so a payment cannot be raised against a checkout that has moved
since the client last looked. Publishing the id without the version would force clients to guess a
version or send a fixed `1`, which defeats the guard. They are one fact and ship together.

### Why nullable rather than required

`CheckoutSession.booking_group` and `Order.booking_group` are both `null=True`. An assisted or
partially built group can exist without either. `null` is the honest answer, and the client renders
no payment affordance when it sees one — rather than a broken button built on a guessed id.

## Non-goals

- No change to `PaymentAttemptCreateRequest`, its `202`, its `409`, or its idempotency semantics.
- No new authorization. `BookingGroupDetailView` already scopes to `customer=request.user`; these
  fields inherit that scope exactly and disclose nothing the owner cannot already reach.
- No group→order *contents*. `order_id` is a pointer; `GET /orders/{id}/` remains the read, and it
  keeps its own ownership check.

## Acceptance

- `GET /booking-groups/{id}/` and the list projection both carry the three fields.
- A group whose status is `PAYMENT_PENDING` always carries a non-null `checkout_id` and
  `checkout_version`; a test asserts the pair is never null in that state, so
  `recovery_action: PAYMENT_REQUIRED` can never again be unexecutable.
- `order_id` is null before capture and non-null after, proven across the capture boundary.
- Another Customer's group id still answers `404`, unchanged.
- Serialising a list of groups issues no per-row query for the new fields (`select_related`).
- OpenAPI is regenerated from Django and the schema-drift gate passes.

## Version

Additive and backward compatible. Published as **1.14.0**.
