# Proposal 0007 — Publish the cart-item removal request body

**Author:** Claude (FE-08G frontend integration)
**Date:** 3 August 2026
**Verified against:** OpenAPI 1.9.0 and 1.10.0 — unchanged in both
**Status:** Implemented in the backend — published in OpenAPI 1.13.0 as the `POST … /remove/`
sibling. Frontend regeneration, the Remove control and browser acceptance (§Acceptance criteria 2–4
and 8) remain outstanding.
**Consuming application:** Customer
**Consuming route / action:** `/cart` — "Remove" on a cart item row
**Required authorization:** Same as the rest of the Cart surface — `cookieAuth` or an anonymous
session cart (`security: [{cookieAuth: []}, {}]`)

## Problem

`DELETE /api/v1/cart/items/{item_id}/` is published **without a `requestBody`**. This was true in
OpenAPI 1.9.0 and is still true in 1.10.0, which was published while this proposal was being
written and changed the operation not at all:

```yaml
  /api/v1/cart/items/{item_id}/:
    delete:
      operationId: cart_items_destroy
      parameters:
      - in: path
        name: item_id
        schema: { type: string, format: uuid }
        required: true
      tags: [Cart]
      security:
      - cookieAuth: []
      - {}
      responses:
        '200': { $ref: Cart }
        '409': { $ref: ApiError }
```

Django requires one. `CartItemDeleteView.delete` runs `CartItemRemoveSerializer(data=request.data)`
with `raise_exception=True`, and that serializer declares two required integers:

```python
class CartItemRemoveSerializer(serializers.Serializer[dict[str, object]]):
    expected_cart_version = serializers.IntegerField(min_value=1)
    expected_item_version = serializers.IntegerField(min_value=1)
```

The view *is* annotated `@extend_schema(request=CartItemRemoveSerializer, ...)`, so this is not a
missing annotation — drf-spectacular does not emit a `requestBody` for `DELETE`, and the declared
request is dropped from the published document.

The consequence for the frontend is total, not cosmetic. `openapi-typescript` generates
`cart_items_destroy` with `requestBody?: never`, so the generated client cannot express a request the
server would accept. Every workaround available is one the frontend rules forbid:

| Workaround | Why it is refused |
| --- | --- |
| `client.DELETE(path, { body } as unknown as …)` | Casting through `unknown` defeats the only mechanism that keeps request shapes honest. |
| Raw `fetch` beside the generated client | `contract-pending/boundary.test.ts` fails the build for exactly this, and it should. |
| Hand-written removal DTO | A locally authored request body is an invented contract. |
| Send no body | Django answers `400` with `{"expected_cart_version": ["This field is required."]}`. A button that always fails is worse than an absent one. |

So removal is **visibly and honestly unavailable** in FE-08G: the row renders no Remove control and
explains why, and the customer is pointed at the quantity control and at starting a new booking. This
is the one FE-08G capability blocked on a contract.

## Requested contract

Publish the request body that Django already reads. No behaviour change is requested — only that the
document describe the implementation.

### Endpoint and method

`DELETE /api/v1/cart/items/{item_id}/`

### Request body (required)

```yaml
requestBody:
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/CartItemRemoveRequest'
  required: true
```

```yaml
CartItemRemoveRequest:
  type: object
  properties:
    expected_cart_version:
      type: integer
      minimum: 1
    expected_item_version:
      type: integer
      minimum: 1
  required:
  - expected_cart_version
  - expected_item_version
```

Example request:

```http
DELETE /api/v1/cart/items/6f1c2b8e-6d61-4f6a-9a0e-1a4c1f0b7a21/ HTTP/1.1
Content-Type: application/json

{ "expected_cart_version": 4, "expected_item_version": 2 }
```

If a body on `DELETE` is judged undesirable, the equally acceptable alternative is a `POST`
sibling — `POST /api/v1/cart/items/{item_id}/remove/` with the same body and the same responses.
Either publishes a request the generated client can build; the frontend has no preference beyond
that. What it cannot integrate is the current state, where the body exists in Django and not in the
document.

### Success response

`200` with the complete updated `Cart`, exactly as `PATCH` and `POST /cart/items/` already return.
This matters: the response *is* the new truth, so the frontend applies it with a targeted
`setQueryData` rather than refetching, and the returned `version` is what the next command carries.

```json
{
  "id": "…",
  "version": 5,
  "items": [ { "id": "…", "version": 1, "quantity": 2, "…": "…" } ],
  "updated_at": "2026-08-03T09:14:22Z"
}
```

The removed item is absent from `items` (Django soft-deletes with `removed_at`; the projection
already filters it). Both `cart.version` and the removed item's `version` increment, matching
`remove_cart_item`.

### Version-conflict behaviour

`409` with `ApiError`, and the two guards must stay distinguishable in `details` because they have
different recoveries:

| Condition | Code | `details` | Frontend recovery |
| --- | --- | --- | --- |
| `expected_cart_version` ≠ current | `cart_version_conflict` | `{ "current_version": 9 }` | Refetch `GET /cart/`, re-render, let the customer decide again against real state. |
| `expected_item_version` ≠ current | `cart_version_conflict` | `{ "current_version": 9 }` | Same. |
| Item absent or already removed | `cart_item_not_found` | — | Refetch the cart and show it as already gone. Not an error state. |

Note that `remove_cart_item` currently raises `CartVersionConflictApiError` for *both* version
mismatches. That is acceptable — the recovery is identical — but a distinct code or a
`conflicting_field` in `details` would let the UI say which version moved, and is welcome if cheap.

Removing an item that is already removed is idempotent in effect but is expected to answer
`cart_item_not_found` rather than `200`, since the caller's `expected_item_version` cannot match a
row that is gone.

### Idempotency

No `Idempotency-Key` header is requested, and none should be required. The optimistic-concurrency
pair is already the safety property: a retry of the identical request either finds the versions
unchanged and removes the item once, or finds them moved and is refused. A second press after a
success is refused by `expected_cart_version`, so double submission cannot remove a second item.

This is deliberately unlike checkout, where an idempotency key is required because the command mints
a new record and has no version to check against.

### User-visible errors

| Server outcome | What the customer sees |
| --- | --- |
| `200` | The row disappears; the cart summary updates to the returned version. |
| `409 cart_version_conflict` | "Your booking changed somewhere else, so that item was not removed. We have reloaded it — try again." Cart is refetched before the customer decides again. |
| `409 cart_item_not_found` | "That service is no longer in your booking." Cart is refetched; no error styling, because the outcome the customer wanted has happened. |
| `403` / session lost | The existing shared session-recovery path; nothing removal-specific. |
| Network failure | "We could not remove that. Nothing was changed." with a retry. No automatic retry: the command is a state change and the contract defines no safe replay. |

## Acceptance criteria

1. `contracts/openapi/v1.yaml` publishes `cart_items_destroy` (or a `POST … /remove/` sibling) with a
   required request body containing `expected_cart_version` and `expected_item_version`.
2. `pnpm --filter @vsolve/api-client generate` produces a `cart_items_destroy` operation whose
   `requestBody` is required and typed, and `pnpm contract:check` passes.
3. `getApiClient().DELETE("/api/v1/cart/items/{item_id}/", { params, body })` type-checks with no
   cast, no `unknown`, no raw `fetch` and no locally authored DTO.
4. A successful removal returns the complete `Cart`; the frontend applies it with `setQueryData` and
   invalidates only plan sets and quotes.
5. Removing one item of several leaves every other item's `id`, `version`, `quantity` and `scope`
   untouched in the returned cart.
6. A stale `expected_cart_version` and a stale `expected_item_version` each return `409` with a code
   the frontend can key on, and neither removes anything.
7. Removing an already-removed item returns `409 cart_item_not_found`, not `200` and not `500`.
8. Frontend acceptance, added once this is published: two services in the cart, remove the first,
   assert the second is unchanged and that the version note shows the returned version; then a
   stale-version removal shows the conflict copy and refetches.

Until item 1 lands, the Customer cart keeps removal absent with the stated explanation rather than
shipping a control that cannot work.

## Backend resolution — published in OpenAPI 1.13.0

The `POST` sibling was chosen over describing a DELETE body. The generator's omission is not a bug
we can annotate around — `@extend_schema(request=…)` was already present and still produced
`requestBody?: never` — so a DELETE body would have remained undescribable no matter what the
document claimed.

`POST /api/v1/cart/items/{item_id}/remove/` → `cart_items_remove`, `security: [{cookieAuth: []}, {}]`,
required `CartItemRemoveRequest` body, `200` with the complete `Cart`. `DELETE
/api/v1/cart/items/{item_id}/` is retained for callers already sending a body; both methods call
`_remove_cart_item_response`, which validates one serializer and calls one `remove_cart_item`. There
is no second removal implementation to drift.

### What the guards answer

| Condition | Status | Code | `details` |
| --- | --- | --- | --- |
| `expected_cart_version` ≠ current | 409 | `cart_version_conflict` | `{current_version, conflicting_field: "expected_cart_version"}` |
| `expected_item_version` ≠ current | 409 | `cart_version_conflict` | `{current_version, conflicting_field: "expected_item_version"}` |
| Item removed, unknown, or another Customer's | 409 | `cart_item_not_found` | — |

`conflicting_field` is the cheap distinction the proposal invited. Both guards keep one code because
both recover by refetching, so a client that only keys on the code stays correct.

The item is located before either version is compared, which is a deliberate refinement of what the
proposal predicted. A removal replayed after it already succeeded therefore answers
`cart_item_not_found` — what actually happened — rather than `cart_version_conflict`, which would
send the customer to reload a cart that is already what they wanted. The command is still refused in
either ordering, so acceptance criterion 7 holds and a double submission still cannot remove a
second item.

### Unauthorized cart access

There is no separate code for it, and that is the intended answer rather than an omission. Every
cart command resolves the caller's own cart first, so another Customer's item id is not a row this
request can reach. It answers `cart_item_not_found`, byte-identical to a random UUID, asserted as
such in `test_another_customer_cannot_remove_an_item_and_learns_nothing_about_it`. A distinguishable
`403` would confirm that the id exists in someone else's cart. Session loss keeps answering through
the shared `403` path, exactly as the proposal's user-visible error table describes.

### Regressions

`backend/tests/carts/test_cart_item_removal.py` — one of two removed with the complete cart
returned; no sibling `id`, `version`, `quantity`, `scope` or `variant_id` mutated; both stale-version
paths refusing and mutating nothing; already-removed; accepted-removal replay; cross-customer denial
with no existence oracle; anonymous session cart; missing-field rejection; DELETE/POST parity; a
service-level pass with no HTTP; and a `transaction=True` PostgreSQL race where a concurrent
`update_cart_item` and `remove_cart_item` claim the same cart version and exactly one commits.
`backend/tests/test_schema.py` asserts the published operation id, required body, `minimum: 1` on
both integers, `Cart`/`ApiError` responses, the anonymous-or-cookie security pair and the absence of
an `Idempotency-Key` parameter.
