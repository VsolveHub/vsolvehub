# Historical detail — response examples for Proposal 0001

**Status:** Folded into `0001-contract-infrastructure-gaps.md`; retained for history
**Raised by:** Claude (frontend)
**Affects:** every operation currently in `contracts/openapi/v1.yaml` (v1.1.0)
**Blocks:** nothing today; increasing drift risk as B2–B10 build out

## Problem

The published contract contains no `example` or `examples` anywhere:

```
$ grep -c "example" contracts/openapi/v1.yaml
0
```

tasks.md §3 requires:

> 6. Every endpoint defines success, validation, authorization, conflict, expiry and retry responses.
> 7. Until an endpoint is implemented, Claude uses contract-derived fixtures and Mock Service Worker.
> 8. **Backend contract tests and frontend mock tests use the same examples.**

Rule 8 cannot hold right now. `@vsolve/testing` therefore hand-authors fixtures against the
*schemas* — typed as `Schemas["ServiceCard"]` and so on, which means a renamed or removed field
fails frontend typecheck. That catches structural drift but not **semantic** drift: nothing stops a
fixture from carrying `starting_price: 19900` while Django actually returns `0` for a variant with
no active rate, or from assuming `cover` is usually populated when in practice it is usually null.

Those are precisely the cases that produce a UI which demos perfectly and breaks on real data.

## Requested change

Add `examples` to each operation's responses in the generated OpenAPI document, sourced from the same
fixtures the backend contract tests assert against.

For every operation, at minimum:

- one success example reflecting a **realistic** payload, not an idealised one
- one example per error the frontend must handle distinctly (validation, authorization, conflict,
  expiry)

Where DRF Spectacular is already in use, `@extend_schema(examples=[OpenApiExample(...)])` on the view
emits these without a separate source of truth.

### Success example — realistic, not idealised

`GET /api/v1/categories/{category_slug}/services/`

```yaml
examples:
  typical:
    summary: Technician services in a serviced area
    value:
      - id: 3f5a9c1e-2b7d-4e88-9a10-6c2f8d4b1e07
        slug: switch-socket-repair
        name: Switch / Socket Repair
        short_description: A verified electrician repairs or replaces faulty switches and sockets.
        category_slug: technician
        subcategory_slug: electrical
        starting_price: { amount_paise: 19900, currency: INR }
        recommended_duration_minutes: 60
        cover: null          # most catalogue rows have no cover art yet
```

The `cover: null` is the point. If examples only ever show a populated cover, every service card gets
built assuming an image and the real catalogue breaks the layout.

### Error examples — one per distinct recovery path

The frontend routes recovery off `error.code` (`@vsolve/api-client/errors.ts`), so each code the
backend can emit needs an example. Currently the client infers recovery from HTTP status for unknown
codes, which works but is a guess.

```yaml
'409':
  content:
    application/json:
      examples:
        slot_taken:
          value:
            error:
              code: SLOT_NO_LONGER_AVAILABLE
              message: That time is no longer available.
              details: null
              request_id: req_01J8ZQ2K3M4N5P6Q7R8S9T
```

## Secondary request: publish the error-code catalogue

The client maps ~20 error codes to recovery intents. That map is currently the frontend's best guess
at the backend's vocabulary. Please publish the authoritative list — either as an enum in the
contract or as a table in `contracts/openapi/README.md` — with, for each code: the HTTP status, when
it is emitted, and whether retrying the identical request can ever succeed.

The last column is the one that matters. It is the difference between an automatic retry and an
error that tells the customer to choose another slot, and the frontend cannot derive it from a status
code alone.

## Note on the error envelope — resolved in v1.2.0

`retryable` landed in v1.2.0. The client now consumes it, and keeps two distinct notions rather than
collapsing them:

| Property | Meaning | Source |
|---|---|---|
| `ApiRequestError.retryable` | Could retrying this *operation* ever succeed? | The server's flag, verbatim |
| `ApiRequestError.isTransportRetryable` | May the query layer silently resend the *identical* request? | `retryable && status ∈ {408,425,429,5xx}` |

The distinction is load-bearing. `SLOT_NO_LONGER_AVAILABLE` is correctly `retryable: true` — booking
again after choosing another slot works — but resending that exact request never will. Treating the
server's semantic hint as permission to auto-retry would resend a payment on a 409. The server can
also veto: `retryable: false` on a 503 suppresses the automatic retry.

Remaining envelope difference, for the plan document rather than the contract:
[07-api-events-and-operations.md](../../Django_Next.js_Plan/07-api-events-and-operations.md) still specifies
`fields` and `trace_id` where the contract publishes `details` and `request_id`. The contract is
authoritative and its shape is better — `details` is more flexible than a fixed field map. Suggest
correcting the plan text.

## What the frontend does in the meantime

`@vsolve/testing` fixtures stay hand-authored against the schemas, with a comment pointing at this
proposal. When examples land, the fixture builders should read from them so both sides share one
source of truth.

No runtime code depends on this proposal. It is a test-fidelity and drift-prevention request.
