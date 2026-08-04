# Proposal 0008 — Publish the `cursor` parameter on the Booking Group and Partner offer lists

**Author:** Claude (FE-09 frontend integration)
**Date:** 3 August 2026
**Verified against:** OpenAPI 1.10.0
**Status:** Partial — runtime cursor traversal tests exist and pass; OpenAPI `cursor` publication,
`cursor_invalid` refusal and blank-cursor validation are still missing (reviewed 2026-08-04).
**Consuming applications:** Customer (`/bookings`), Partner (`/offers`)
**Required authorization:** `cookieAuth`; Partner list additionally requires `IsPartnerUser`

## Problem

Both lists paginate at runtime and neither publishes the parameter that drives it.

`PartnerOfferListView` and the Booking Group list view use DRF `CursorPagination`:

```python
class PartnerOfferCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")
```

Their responses carry `next` and `previous` as absolute URIs:

```yaml
OfferPage:
  properties:
    next:     { type: string, format: uri, nullable: true }
    previous: { type: string, format: uri, nullable: true }
    results:  { type: array, items: { $ref: Offer } }
```

But the operations declare **no query parameters at all**:

```yaml
  /api/v1/partner/offers/:
    get:
      operationId: partner_offer_list
      tags: [Partner]
      security: [ { cookieAuth: [] } ]
      responses:
        '200': { $ref: OfferPage }        # no `parameters:` block

  /api/v1/booking-groups/:
    get:
      operationId: booking_group_list
      tags: [Booking Groups]
      security: [ { cookieAuth: [] } ]
      responses:
        '200': { $ref: BookingGroupPage }  # no `parameters:` block
```

So `next` is a URL the client is handed and structurally cannot use. The generated
client types both operations with no `query` object, which makes this a compile error:

```ts
getApiClient().GET("/api/v1/partner/offers/", { params: { query: { cursor } } })
//                                                              ^^^^^^ not assignable
```

The only ways through are ones the frontend rules forbid: raw-fetching the absolute `next` URL
(caught by `contract-pending/boundary.test.ts`, and correctly so), or casting the params object.

### There is already a correct precedent in this contract

`operations_partner_application_queue_list` — the same DRF `CursorPagination`, the same page shape —
**does** publish it:

```yaml
      - in: query
        name: cursor
        schema:
          type: string
          minLength: 1
```

FE-07 consumes that cleanly: it parses the `cursor` value out of `next` and resends it as a typed
query parameter. The difference is that the Operations view declares its query serializer to
drf-spectacular and these two do not. This is therefore an annotation gap with a working in-repo
answer, not a design question.

## Impact on FE-09

FE-09 ships against **page one only**, which is honest but limited:

- **Partner `/offers`** — `page_size` is 50 and the queryset already excludes `DECLINED`, `UNDONE`,
  `EXPIRED` and `REVOKED`, so a live inbox realistically fits. The risk is a Partner with more than
  50 open offers silently never seeing the rest. Nothing warns them, because the client cannot know
  whether it is looking at a complete list — it can read `next !== null`, so it can *say* there is
  more, but it cannot fetch it.
- **Customer `/bookings`** — this one degrades with account age rather than with load. A customer's
  Booking Groups accumulate permanently, so "your bookings" becomes a permanently truncated list.

The frontend does not fake either. Where `next` is non-null the UI says the list is truncated and
why, rather than presenting a partial list as complete.

## Requested contract

Publish the `cursor` query parameter on both operations, matching the Operations queue exactly.

```yaml
  /api/v1/partner/offers/:
    get:
      operationId: partner_offer_list
      parameters:
      - in: query
        name: cursor
        schema:
          type: string
          minLength: 1
      ...

  /api/v1/booking-groups/:
    get:
      operationId: booking_group_list
      parameters:
      - in: query
        name: cursor
        schema:
          type: string
          minLength: 1
      ...
```

No behaviour change is requested. DRF already reads `cursor` from the query string; only the document
omits it.

### Optional, and genuinely useful for the Customer list

A `status` filter on `booking_group_list` would let `/bookings` separate live groups from finished
ones without over-fetching. If added, it should be an enum over `BookingGroupStatusEnum` rather than
a free string, so an unknown value is a compile error rather than a silently empty list. This is a
nice-to-have; the `cursor` parameter is the blocker.

### Example request and response

```http
GET /api/v1/partner/offers/?cursor=cD0yMDI2LTA4LTAzKzA5JTNBMDA HTTP/1.1
```

```json
{
  "next": "https://api.vsolvehub.com/api/v1/partner/offers/?cursor=cD0yMDI2…",
  "previous": null,
  "results": [ { "id": "…", "status": "OFFERED", "…": "…" } ]
}
```

## Idempotency and retry

Not applicable — both are safe reads. They are polled on a bounded interval and must stay cheap;
neither should acquire a required header.

## User-visible errors

| Server outcome | What the user sees |
| --- | --- |
| `200`, `next: null` | The complete list. |
| `200`, `next` non-null | Today: "Showing your most recent — older ones are not listed yet." After this proposal: a "Show more" control that fetches the next page. |
| `403` | The shared session-recovery path. |
| Invalid/expired cursor (`400`) | Reset to page one and re-read, since a cursor only goes stale when the underlying list moved. |

## Acceptance criteria

1. `contracts/openapi/v1.yaml` publishes a `cursor` query parameter on `partner_offer_list` and
   `booking_group_list`.
2. `pnpm contract:check` passes and the generated client types a `query.cursor` on both.
3. `getApiClient().GET("/api/v1/partner/offers/", { params: { query: { cursor } } })` type-checks
   with no cast and no raw `fetch`.
4. `useInfiniteQuery` over either list accumulates pages under one cache entry, exactly as the
   Operations queue already does.
5. Following `next` to exhaustion returns every row once, with no duplicate and no skip while rows
   are inserted concurrently — the property cursor pagination exists to provide.
6. The truncation notice disappears from both UIs once pagination is real.

Until item 1 lands, both lists render page one and say so where `next` is non-null.
