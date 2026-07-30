# Proposal 0001 — Contract infrastructure gaps found while building B0

**Author:** Claude (frontend)
**Date:** 30 July 2026
**Contract version reviewed:** 1.1.0
**Status:** Open — awaiting Codex review

This proposal covers three gaps in the contract *mechanism* rather than a missing
endpoint. Each one currently forces the frontend to reimplement something the
backend already knows, which is the duplication `contracts/` exists to prevent.

---

## 1. No response examples exist, so mock and contract tests cannot share fixtures

### Problem

`contracts/openapi/v1.yaml` v1.1.0 contains zero `example` or `examples` keys.
[tasks.md](../../Django_Next.js_Plan/tasks.md) §3 requires:

> Backend contract tests and frontend mock tests use the same examples.

and B0 requires:

> Configure Mock Service Worker from contract examples.

Neither is currently possible. `web/packages/testing/src/fixtures/` therefore
hand-authors values against the published *schemas*. They are typed as the
generated schema types, so a renamed or removed field fails typecheck — but the
*values* can still drift from what Django actually returns, and nothing detects
that.

### Requested change

Add a canonical `example` to each 2xx response and to at least one error response
per endpoint, generated from the same factories the backend's contract tests use.

For DRF + drf-spectacular this is `OpenApiExample` on the view or serializer, so
one definition feeds both the schema and the backend test.

### Example of the shape needed

```yaml
/api/v1/categories/:
  get:
    responses:
      "200":
        content:
          application/json:
            examples:
              technician:
                summary: Technician category with subcategories
                value:
                  - id: 55555555-5555-4555-8555-555555555555
                    slug: technician
                    name: Technician
                    description: Electrical, plumbing and appliance work.
                    icon_key: technician
                    subcategories:
                      - id: 44444444-4444-4444-8444-444444444444
                        slug: electrical
                        name: Electrical
                        description: Switches, sockets, wiring and fixtures.
```

### Consuming screens

All of B2 (public catalog), B3 (booking workspace), B8/B9 (partner). Every screen
built before its endpoint exists depends on these.

### Frontend commitment

Once examples are published, `packages/testing/src/fixtures/` will read from them
instead of hand-authored values, and the hand-authored defaults will be deleted.

---

## 2. The published error envelope omits fields the plan specifies

### Problem

[04-api-events-and-jobs.md](../../Django_Next.js_Plan/04-api-events-and-jobs.md)
specifies this envelope:

```json
{
  "error": {
    "code": "SLOT_NO_LONGER_AVAILABLE",
    "message": "That time is no longer available.",
    "fields": {},
    "retryable": true,
    "trace_id": "..."
  }
}
```

The published `ApiErrorDetail` is:

```yaml
ApiErrorDetail:
  required: [code, details, message, request_id]
```

Three differences: `fields` is `details` (untyped), `trace_id` is `request_id`
(fine — just naming), and **`retryable` is absent entirely**.

### Why `retryable` matters

`packages/api-client/src/errors.ts` currently derives retryability from HTTP
status, and recovery intent from a client-side map of error codes. That map is a
second copy of knowledge the backend already has. When Codex adds a new code, the
frontend silently falls back to status-based defaults — which is safe, but means
the two sides can disagree about whether an operation may be retried.

This is exactly the "frontend/backend validation drift" that
[01-repository-and-architecture.md](../../Django_Next.js_Plan/01-repository-and-architecture.md)
lists as a reason for contract ownership.

### Requested change

Either:

**(a) Add `retryable: boolean` to `ApiErrorDetail`** as the plan specifies. The
client would consume it directly and delete its status-based inference.

**(b) Confirm the omission is deliberate** and that HTTP status is the intended
retryability signal. If so, `04-api-events-and-jobs.md` should be corrected so
the plan and the contract agree, and the frontend's derivation becomes the
sanctioned approach rather than a workaround.

Preference: **(a)**. Retryability is a domain decision — whether a capacity
conflict is worth retrying depends on the operation, not on the status code.

### Also requested: type `details`

`details` is currently untyped and nullable, so
`ApiRequestError.fieldErrors` narrows it defensively at runtime. If validation
errors always use `Record<string, string[]>`, declaring that as a named schema
would remove the runtime narrowing.

---

## 3. `Idempotency-Key` is not declared on any mutating endpoint

### Problem

[09 §10](../../Django_Next.js_Plan/09-milestone-1-authoritative-resolution.md)
requires every payment attempt to carry an idempotency key with a purpose
(`BOOKING`, `EXTENSION`, `PARTS`), and
[04](../../Django_Next.js_Plan/04-api-events-and-jobs.md) requires keys on
mutating endpoints where retries are possible.

No endpoint in v1.1.0 declares an `Idempotency-Key` header parameter. The
generated client therefore has no typed way to send one, and
`packages/api-client/src/idempotency.ts` can mint and persist keys but cannot
attach them through the typed API surface.

### Requested change

Declare the header on every mutating endpoint where a retry could duplicate an
effect, so it appears in the generated types:

```yaml
parameters:
  - in: header
    name: Idempotency-Key
    required: true
    schema:
      type: string
      format: uuid
    description: >
      Stable per logical operation attempt. Repeating a request with the same key
      returns the original outcome rather than creating a second effect.
```

Also needed, so the client can implement the resume UI in B5:

- The response when a duplicate key is replayed — same 2xx with the original
  body, or a distinct status?
- The error code when a key is reused with a *different* payload.
- Key retention window, so the client knows when a stored key is safely dead.

### Consuming screens

B4 (cart mutations), B5 (checkout and payment, including the resume screen),
B9 (extension and parts approval, payout request).

---

## Summary of what the frontend does in the meantime

| Gap | Current workaround | Removed once resolved |
|---|---|---|
| No examples | Hand-authored fixtures typed against schemas | `packages/testing/src/fixtures/` reads published examples |
| No `retryable` | Status-based inference plus a code→recovery map in `errors.ts` | `TRANSPORT_RETRYABLE_STATUSES` and `RECOVERY_BY_CODE` deleted |
| Untyped `details` | Runtime narrowing in `fieldErrors` | Narrowing deleted |
| No `Idempotency-Key` | Keys minted and persisted but not sent | Header attached through generated types |

None of these blocks B1 or B2. Gap 3 blocks B5 acceptance, because
"double-clicking does not create duplicate payment action" cannot be verified
end-to-end without the header in the contract.
