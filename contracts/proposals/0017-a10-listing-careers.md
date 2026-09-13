# Proposal 0017 — A10 Career/Jobs listing surface

**Author:** Claude (A10 Career/Jobs, Wave D3)
**Date:** 13 September 2026
**Verified against:** OpenAPI on `main` @ `4a08ad3` — which published **no** listing path
**Status:** **Proposed.** Backend port of `apps.listings` from `3fa3016` is the implementation
source. Spectacular publication and generated-client refresh follow; this file is not a contract.
**Consuming applications:** Customer (`/listings/**`), Partner (`A10_LISTING` workspace:
Listings / Leads / Billing), Operations (`/operations/listings`)
**Consuming actions:** Browse published listings; apply and withdraw; poster CRUD / submit /
publish / close / republish; shortlist / reject / reveal; purchase subscription or premium;
Operations moderate / remove / reinstate; report abuse.
**Required authorization:** Public browse and detail are unauthenticated. Apply, withdraw, report,
and every partner/ops command require `cookieAuth`. Partner routes require `IsPartnerUser` plus an
approved `A10_LISTING` capability. Ops routes require `IsOperationsUser`.

**Design authority:** [03-rental-stay-jobs-categories.md](../../Django_Next.js_Plan/M3/03-rental-stay-jobs-categories.md)
§6 / §7.4–7.5 / §8.3 and [ADR-0012](../../docs/adr/0012-a10-listing-engine.md). Where this
proposal and ADR-0012 disagree, the ADR wins.

**Product law.** Listing ≠ Booking. Application ≠ Booking. Applicant never pays. Fail closed
without an ACTIVE `A10VariantConfiguration` and without an approved `A10_LISTING` capability.

---

## Problem

`main` has no Career/Jobs category, no `/listings` route, and no A10 workspace. Phase D Wave D3
(`M3-BE-351`…`361`, `M3-FE-331`/`332`) needs a contract-first surface the three apps can consume
after spectacular publishes it.

The ported engine already encodes the happy path and `M3-A10-01`…`16`. This proposal records the
HTTP shape those commands must publish, including the public listing state the frontend is allowed
to render.

Two constraints drive every decision below:

1. **The applicant never pays.** Nothing on the customer listing surface may start a
   `PaymentAttempt`, open Checkout, or imply a fee to apply.
2. **The UI does not invent statuses.** Stored fields are `status` and `moderation_status`.
   Serializers also emit derived `public_state` (ADR-0012). Plan names
   `SUBMITTED_FOR_MODERATION` and `MODERATION_APPROVED` are not stored and must not appear unless
   a serializer later emits them.

---

## Public listing state

| `public_state` | Stored `status` | Stored `moderation_status` | Who sees it |
| --- | --- | --- | --- |
| `DRAFT` | `DRAFT` | `DRAFT` | Poster, Operations |
| `PENDING_REVIEW` | `DRAFT` | `PENDING` | Poster, Operations |
| `REJECTED` | `DRAFT` | `REJECTED` | Poster, Operations |
| `PUBLISHED` | `PUBLISHED` | `APPROVED` | Public, poster, Operations |
| `CLOSED` | `CLOSED` | any | Poster, Operations |
| `EXPIRED` | `EXPIRED` | any | Poster, Operations |
| `REMOVED` | `REMOVED` | any | Poster, Operations |
| `ARCHIVED` | `ARCHIVED` | any | Poster, Operations |

`GET /api/v1/listings` and `GET /api/v1/listings/{id}` return only `PUBLISHED` + `APPROVED` rows.
A draft, pending, rejected, removed, or archived listing is `404` to the public, not an empty
fake.

---

## Typed errors

| Code | HTTP | When | User-visible recovery |
| --- | --- | --- | --- |
| `listing_config_unavailable` | `400` | No ACTIVE `A10VariantConfiguration` | "This category is not open yet." |
| `listing_capability_required` | `403` | Poster lacks approved `A10_LISTING` | Workspace hidden; no generic Jobs fallback |
| `listing_state_conflict` | `409` | Command illegal for current status | Show current `public_state` |
| `application_duplicate` | `409` | Active application already exists for this listing | Open the existing application |
| `application_rate_limited` | `429` | Applicant exceeded the apply window | Wait; do not invent a second row |
| `contact_reveal_rate_limited` | `429` | Poster exceeded daily reveal cap | Show remaining cap / retry after window |
| `listing_plan_cap` | `409` | Publish would exceed `max_active_listings` | Offer Billing / upgrade, do not publish |
| `listing_not_found` | `404` | Missing, not public, or another actor's row | Honest empty / back to list |
| `moderation_reason_required` | `400` | Ops approve/reject/remove/reinstate without reason | Require the reason field |

State-changing commands that are retryable require `Idempotency-Key`. Replay returns the first
response. Webhook replay of `A10_VENDOR_SUBSCRIPTION` / `A10_PREMIUM_LISTING` must not
double-extend.

---

## A. Customer / applicant

### A1. `GET /api/v1/listings`

Unauthenticated. ORM filters only.

**Query:** `q`, `location`, `service` (catalog service slug, e.g. the Career/Jobs tile).

**Response `200`:**

```json
[
  {
    "id": "7c1a…",
    "poster_name": "Demo Employer",
    "service_name": "Career / Jobs",
    "variant_name": "IT & Software Jobs",
    "title": "Junior electrician — Hyderabad",
    "description": "Day shift. Two years site experience.",
    "structured_fields": {
      "role": "electrician",
      "employment_type": "FULL_TIME",
      "location": "Hyderabad"
    },
    "status": "PUBLISHED",
    "moderation_status": "APPROVED",
    "public_state": "PUBLISHED",
    "location_text": "Hyderabad 500032",
    "is_premium": false,
    "published_at": "2026-09-13T06:10:00Z",
    "expires_at": "2026-10-13T06:10:00Z",
    "application_count": 0
  }
]
```

Honest empty is `[]`. Never include `DRAFT` / `PENDING_REVIEW` / `REMOVED`.

| Concern | Contract |
|---|---|
| Freshness | Public catalog. Safe to poll. |
| Idempotency | Read. |
| Retry | Safe. |

### A2. `GET /api/v1/listings/{listingId}`

Unauthenticated. Same projection plus `contact_masked` (`phone` / `email` redacted). Raw poster
phone/email are never sent. `404 listing_not_found` if the row is not public.

### A3. `POST /api/v1/listings/{listingId}/applications`

Authenticated customer. `Idempotency-Key` required.

**Request:**

```json
{
  "name": "Asha Rao",
  "phone": "+9198XXXXXXXX",
  "email": "asha@example.com",
  "experience": "2 years",
  "cover_note": "Available from Monday.",
  "resume_url": "https://files.example/asha-cv.pdf"
}
```

**Response `201`:** application projection. Snapshot stores contact; list/detail hide phone/email
until the poster reveal command succeeds.

**Errors:** `409 application_duplicate` (unique active `(listing, applicant)`); `429
application_rate_limited`; `400 listing_config_unavailable`; `409 listing_state_conflict` when the
listing is not `PUBLISHED`.

### A4. `GET /api/v1/my/listing-applications`

Authenticated. The caller's applications only. Another applicant's row is not in the queryset
(`M3-A10-14`).

### A5. `POST /api/v1/my/listing-applications/{applicationId}/withdraw`

Authenticated owner. Allowed while the application is `SUBMITTED` / `UNDER_REVIEW` /
`SHORTLISTED`. Sets `WITHDRAWN` + `withdrawn_at`. `Idempotency-Key` required.

### A6. `POST /api/v1/listings/{listingId}/reports`

Authenticated. Opens `ListingReport` and an `OperationsCase` of kind `LISTING_ABUSE`.

### A7. `POST /api/v1/applications/{applicationId}/reports`

Authenticated. Opens `ApplicationReport` + `APPLICATION_ABUSE`.

No customer checkout, cart, or Pay button on this surface.

---

## B. Partner / poster

Workspace key `A10_LISTING` is grant-driven. No grant → no tabs. Never fall back to A1 `/work` or
`/jobs`.

### B1. `GET /api/v1/partner/listings/home`

Counts: active vs plan `max_active_listings`, pending moderation, new applications. Current
`VendorSubscription` if any.

### B2. `GET /api/v1/partner/listings/roles`

Role/variant catalog for the Career/Jobs category. Used by the create form. Empty if no ACTIVE
`A10VariantConfiguration` rows exist.

### B3. `GET|POST /api/v1/partner/listings`

List the poster's listings (all `public_state` values). Create a `DRAFT` (`201`). Create fails
closed without capability + ACTIVE configuration.

**Create request:**

```json
{
  "service_slug": "it-software-jobs",
  "title": "Junior electrician — Hyderabad",
  "description": "Day shift. Two years site experience.",
  "location_text": "Hyderabad 500032",
  "contact_phone": "+9199XXXXXXXX",
  "contact_email": "jobs@employer.example",
  "structured_fields": {
    "role": "electrician",
    "employment_type": "FULL_TIME"
  },
  "is_premium": false
}
```

`is_premium: true` is accepted only when the poster's active subscription includes the premium
capability **and** a captured `A10_PREMIUM_LISTING` attempt has activated it. Otherwise `409
listing_state_conflict` — not a silent ignore.

### B4. `GET|PATCH /api/v1/partner/listings/{listingId}`

Poster-owned only (`404 listing_not_found` for another poster's row — `M3-A10-15`). Edit is
allowed in `DRAFT` and `REJECTED` only. A material edit of a live listing re-enters moderation.

### B5. `POST /api/v1/partner/listings/{listingId}/{action}`

`action` is one of `submit` | `publish` | `close` | `republish`. `Idempotency-Key` required.

| Action | From | To | Notes |
| --- | --- | --- | --- |
| `submit` | `DRAFT` / `REJECTED` | `PENDING_REVIEW` | Operations queue |
| `publish` | `PENDING_REVIEW` after ops approve, or approved draft | `PUBLISHED` | Blocked by `listing_plan_cap` |
| `close` | `PUBLISHED` | `CLOSED` | In-flight applications remain visible to the poster |
| `republish` | `CLOSED` / `EXPIRED` | `PENDING_REVIEW` | New moderation cycle |

Poster cannot `remove` or `reinstate`.

### B6. `GET /api/v1/partner/listings/{listingId}/applications`

Application inbox for that listing. Contact fields empty until reveal.

### B7. `POST /api/v1/partner/listing-applications/{applicationId}/{action}`

`action` is `shortlist` | `reject` | `reveal`. `Idempotency-Key` required. `reject` may carry
`{"reason": "…"}`. `reveal` writes `CONTACT_REVEALED`, sets `contact_revealed_at`, and only then
returns phone/email. `429 contact_reveal_rate_limited` when the daily cap is hit.

### B8. `GET /api/v1/partner/listing-subscription-plans`

Starter / Growth / Enterprise (seeded). Prices in integer paise.

### B9. `POST /api/v1/partner/listing-subscription-plans/{planId}/purchase`

Starts a checkout-free `PaymentAttempt` with purpose `A10_VENDOR_SUBSCRIPTION` (or
`A10_PREMIUM_LISTING` when purchasing premium placement). Returns the existing payment handoff
projection. Capture activates once; replay is a no-op.

No applicant charge. No second billing product.

---

## C. Operations

### C1. `GET /api/v1/ops/listings`

Pending-review queue plus removed rows that still need a case. Staff only.

### C2. `POST /api/v1/ops/listings/{listingId}/moderate`

```json
{ "approved": true, "reason": "Meets Career/Jobs policy." }
```

Reject requires a non-empty reason (`400 moderation_reason_required`). Approve enables poster
`publish`; it does not silently go live without the publish command unless the documented command
does both in one transaction — the serializer must say which `public_state` resulted.

### C3. `POST /api/v1/ops/listings/{listingId}/remove`

Reason required. `public_state=REMOVED`. Poster notified via outbox `listing.removed`.

### C4. `POST /api/v1/ops/listings/{listingId}/reinstate`

Reason required. Poster cannot call this.

---

## D. Frontend recovery

| Surface | Empty | Error |
| --- | --- | --- |
| Customer `/listings` | "No live listings" | Retry; never show drafts |
| Customer apply | — | Duplicate → existing application; OTP if anonymous |
| Customer `/listings/my-applications` | "You have not applied yet" | — |
| Partner Listings | "No listings yet" | Plan cap → Billing, not a fake publish |
| Partner Leads | "No applications yet" | Reveal cap → server message |
| Operations queue | "Nothing to moderate" | Missing reason stays on the form |

Unknown `A10_LISTING` grant must not render A1 Jobs tabs.

---

## Out of scope

Wallet/V Coins spend on listing purposes (`M3-BE-371`), A7 rentals, A9 stays, MSG91, mobile,
vehicle, Elasticsearch, and Phase E analytics dashboards.
