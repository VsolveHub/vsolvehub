# Proposal 0012 — The M2 capability, requirement and quote surface

**Author:** Claude (M2 FE0 foundation, `M2-FE-006`)
**Date:** 10 August 2026
**Verified against:** OpenAPI 1.20.0 — which published **no** M2 path
**Status:** **Partly implemented at contract 1.21.0 (11 August 2026).** The requirement, teaser,
clarification, enquiry, proposal and workspace reads are published — 17 paths. **The unlock,
unlocked-quote, selection and rejection surface is not**, because its domain layer (BE4 / Wave C2)
does not exist yet; it stays a proposal. Attachment upload is deferred to Wave C1. The open question
on `202` refusals is answered below: refusals are always `>=400`, `m2_unlock_payment_pending`
publishes as `409` retryable, and `202` is reserved for genuine acceptance carrying a projection.
**Consuming applications:** Customer (`/requirements/**`, `/requests/**`), Partner (workspace navigation)
**Consuming actions:** Create and submit a free requirement; read matching state; read quote teasers;
buy the unlock; read unlocked quotes; select or reject one. Partner: render authorized navigation.
**Required authorization:** `cookieAuth`. Customer routes require the requirement to belong to the
caller; the workspace read requires `IsPartnerUser`.

**Design authority:** [07-state-machines-and-permissions.md](../../Django_Next.js_Plan/M2/07-state-machines-and-permissions.md)
and [ADR-0007](../../docs/adr/0007-m2-engagement-spine-and-fee-after-value.md). Where this proposal and
that document disagree, the state machine document wins and this file is wrong.

---

## Problem

M2's domain layer exists and is tested — `apps.partners` capabilities (26/26) and `apps.requirements`
(31/31) — but `M2-BE-013` has not published a single HTTP path. `contracts/openapi/v1.yaml` at 1.20.0
contains no `m2` operation and no `m2_*` error.

The frontend foundation is built to meet it: `packages/query/src/m2-keys.ts` declares the key factory,
freshness tiers and the command→invalidation map; `packages/api-client/src/errors.ts` classifies all
29 `m2_*` codes; `packages/query/src/workspace.ts` parses grants. **None of it is mounted**, because
`m2-keys.ts` carries an explicit rule that no query may use a key whose endpoint is unpublished.

This proposal is the read/write surface those modules were built against. It is deliberately narrow:
capability, requirement and the quote/unlock path up to selection. Engagement, stages, attendance and
cases follow in a separate proposal once P5's spine is real — proposing them now would be guessing at
a shape the backend has not built.

Two constraints drive every decision below, and both are commercial rather than technical:

1. **The requirement is free.** Nothing in the requirement surface may accept a payment, quote a
   price, or imply one is coming before a usable quote exists.
2. **A teaser is not a quote.** Before an active unlock, the server must not send vendor identity,
   contact, full scope or line-item totals — not in a field the UI happens not to render. A client
   cannot un-receive a payload, and cached identity survives a refund.

---

## A. Capability and workspace

### A1. `GET /api/v1/partner/workspaces/`

The Partner's approved lifecycle capabilities. Drives navigation and nothing else.

**Response `200`:**

```json
{
  "workspaces": [
    {
      "workspace_key": "workforce",
      "commercial_mode": "LEAD_ONLY",
      "actions": ["view_enquiries", "accept_invitation", "submit_proposal", "assign_crew",
                  "confirm_attendance"]
    },
    {
      "workspace_key": "projects",
      "commercial_mode": "MANAGED_PAYMENT_REQUIRED",
      "actions": ["view_enquiries", "accept_invitation", "submit_proposal", "submit_stage_evidence"]
    }
  ]
}
```

`workspace_key` is **opaque**. The client never parses, splits or substring-matches it, and renders
only keys its build recognises — an unknown key renders nothing rather than a generic tab, because a
tab whose screens are not in the bundle is a 404 the Partner cannot recover from.

`commercial_mode` is read, never derived. ADR-0007 fixes A3 as `LEAD_ONLY` and A5 as
`MANAGED_PAYMENT_REQUIRED`, which makes inferring it from the key tempting — and wrong. This is the
field that decides whether the UI promises Vsolve protection or tells a Partner to collect directly.
A client that computes it keeps promising protection straight through a server-side policy change.

**Required:** a Partner with no approved capability receives `200` with `{"workspaces": []}`, not
`403`. An empty list is a real and common state (registered, not yet reviewed) and must not render as
an error.

**Errors:** `403 permission_denied` for a non-Partner session. Suspension is expressed by omitting the
workspace or returning it with a reduced `actions` array — **not** by an error — so the navigation
degrades in place rather than blanking mid-session.

| Concern | Contract |
|---|---|
| Freshness | `SESSION_STATE`. Changes only when Operations acts. |
| Idempotency | Read. |
| Retry | Safe. |

---

## B. Requirement — free, four screens, one submit

### B1. `POST /api/v1/requirements/` — create a draft

**Request:**

```json
{
  "category_slug": "housekeeping-staff",
  "answers": { "workers_needed": 4, "duration_days": 12, "shift": "DAY" },
  "language": "te"
}
```

**Response `201`:**

```json
{
  "id": "b7f1…",
  "status": "DRAFT",
  "inferred_lifecycle": "A3_TIME_BLOCK",
  "lifecycle_explanation": "You are hiring people for a period of time.",
  "answers": { "workers_needed": 4, "duration_days": 12, "shift": "DAY" },
  "missing_required_answers": ["site_access"],
  "language": "te",
  "server_now": "2026-08-10T09:14:22Z"
}
```

`inferred_lifecycle` is returned but **never shown as an archetype name**. `lifecycle_explanation` is
the plain-language string the Customer sees — server-authored, because it is the sentence that decides
whether they understand what they are buying, and a client-side translation table would drift from the
inference that produced it.

`missing_required_answers` is what makes a four-screen flow possible without the client owning the
question schema. The client renders the questions the server sent and asks the server what is still
missing; it does not carry its own copy of the validity rules.

**Errors:** `400 m2_lifecycle_not_supported` when the variant has no active A3/A5 configuration.
The Customer sees "we don't cover this yet" and a route back to the catalog — not a validation error
on a field they cannot see.

### B2. `PATCH /api/v1/requirements/{id}/` — save a step

Partial update, one screen at a time, for save-and-resume. Re-runs inference and returns the full
record so a changed answer can move `inferred_lifecycle` and the client never holds a stale lifecycle.

**Errors:** `409 m2_requirement_locked` once the requirement has left `DRAFT`/`MATCHING` into
`SELECTED`. `404 m2_requirement_not_found` for another Customer's requirement — 404, not 403, because
existence is itself private.

### B3. `GET /api/v1/requirements/duplicate-check/`

Query parameters `address_id`, `service_by`, `category_slug` — a GET so the answer is cacheable under
`m2QueryKeys.requirements.duplicates({...})`, whose key carries exactly these three inputs.

**Response `200`:**

```json
{
  "probable_duplicates": [
    { "id": "a41…", "created_at": "2026-08-08T11:02:00Z", "summary": "4 housekeeping staff, 12 days",
      "status": "MATCHING", "mergeable": true }
  ]
}
```

Empty array is the normal answer. `summary` is server-authored; the client must not reconstruct one
from another Customer's answers.

### B4. `POST /api/v1/requirements/{id}/attachments/`

Photos, documents, short video and the voice note. Returns an upload intent rather than accepting
bytes, reusing the M1 storage adapter (`M2-BE-203`).

**Request:** `{ "kind": "VOICE_NOTE", "content_type": "audio/webm", "byte_size": 184320, "language": "te" }`

**Response `201`:**

```json
{
  "id": "att_9f…",
  "upload_url": "https://…",
  "upload_expires_at": "2026-08-10T09:29:22Z",
  "scan_status": "PENDING"
}
```

`scan_status` (`PENDING` → `CLEAN` | `INFECTED` | `FAILED`) is readable on the requirement detail. The
client shows an attachment as attached only at `CLEAN`, and `INFECTED` removes it with an honest
message. An attachment stuck at `PENDING` must not block submission — the server decides that, and the
UI states which attachments are still being checked.

**Errors:** `413` over the configured size, `415` for an unsupported type, `503 m2_provider_unavailable`
when the storage or scan adapter times out — retryable, and the only retryable error in this section.

### B5. `POST /api/v1/requirements/{id}/submit/`

The single confirmation. The review screen **is** the confirmation step; there is no second
immutable-version acknowledgement.

**Headers:** `Idempotency-Key` required.

**Response `202`:**

```json
{
  "id": "b7f1…",
  "status": "MATCHING",
  "service_by": "2026-08-24",
  "quote_delivery_deadline_at": "2026-08-12T18:00:00Z",
  "is_free": true,
  "server_now": "2026-08-10T09:31:02Z"
}
```

`is_free: true` is not decoration. `M2-FE-212` requires the submit screen to state that nothing is
charged until quotes arrive, and that promise should come from the server that enforces it rather than
from a hardcoded string that survives a pricing change.

`quote_delivery_deadline_at` is computed in **business hours against a holiday calendar**
(`M2-BE-302`). The client renders it as a countdown off `serverClock` (proposal 0010) and never off
`Date.now()`, and treats the server's status as authoritative when the two disagree.

**Errors:**

| Status | Code | Frontend recovery |
|---|---|---|
| `400` | field errors on `answers` | Return to the owning screen with the field marked. |
| `409` | `m2_requirement_expired` | `service_by` already passed. Offer a new requirement with the answers pre-filled. |
| `409` | `m2_requirement_duplicate` | Show the duplicate with a merge option (B3's payload shape) before allowing an override. |
| `409` | `idempotency_in_progress` | Wait and re-read. Never resend under a new key. |

Replaying the same key returns the original `202` — a Customer who lost the response on mobile data
must not create a second requirement by tapping again.

### B6. `GET /api/v1/requirements/` and `GET /api/v1/requirements/{id}/`

`My requests` and one request's state. Detail carries `status`, `service_by`,
`quote_delivery_deadline_at`, `teaser_count`, `unlock` (see C3) and `closure_reason` — one of
`NO_SUPPLY`, `SLA_BREACH`, `EXPIRED`, `ABANDONED`, `COMPLETE`, `CANCELLED` — when closed.

`closure_reason` must be distinct per the state machine's four closed-while-matching states.
`M2-FE-215` requires no-supply, delayed-match, SLA-breached and expired to read differently, because
"we couldn't find anyone" and "we ran out of time" call for different next actions, and collapsing
them into "closed" is the fabricated-progress failure that requirement forbids.

### B7. `GET /api/v1/requirements/{id}/timeline/`

Append-only events for the request detail. Matching is aggregate-only — a count of invited vendors,
never their identities, before unlock.

```json
{
  "events": [
    { "id": "e1", "at": "2026-08-10T09:31:02Z", "type": "REQUIREMENT_SUBMITTED" },
    { "id": "e2", "at": "2026-08-10T09:33:40Z", "type": "MATCHING_WAVE_SENT",
      "detail": { "vendors_invited": 5 } },
    { "id": "e3", "at": "2026-08-10T14:02:11Z", "type": "QUESTION_ASKED",
      "detail": { "question_id": "q7", "body": "Is there a lift to the 4th floor?" } }
  ],
  "server_now": "2026-08-10T15:00:00Z"
}
```

`type` is a closed enum; the client owns the copy and the icon. A new event type the build does not
recognise renders as a neutral dated row rather than being dropped — an unexplained gap in a timeline
is worse than an unstyled entry, which is the opposite of the workspace-key rule and deliberately so:
here the record is the point, there the navigation target is.

---

## C. Teasers, unlock and selection

This is the section where a mistake costs money or leaks identity.

### C1. `GET /api/v1/requirements/{id}/quotes/teasers/`

Available from `QUOTES_READY`. **This payload is sent to a Customer who has paid nothing.**

```json
{
  "teasers": [
    {
      "proposal_id": "p_3a…",
      "vendor_verification": "VERIFIED",
      "vendor_type": "AGENCY",
      "vendor_rating": 4.6,
      "price_band": { "low": 24000, "high": 27000, "currency": "INR" },
      "is_out_of_budget": false,
      "validity_ends_at": "2026-08-13T18:00:00Z"
    }
  ],
  "usable_quote_count": 3,
  "unlock_available": true,
  "server_now": "2026-08-10T16:12:00Z"
}
```

**Required to be absent:** vendor name, business name, phone, email, address, logo, scope text, line
items, exact total, crew names. Not "absent from the UI" — absent from the response.

`is_out_of_budget` closes `GAP-003`: an over-budget quote is shown *labelled*, not silently mixed in
with the others and not hidden. Hiding it would misrepresent supply; presenting it as an ordinary
option wastes the unlock.

`unlock_available` mirrors the server's own guard. The client disables the unlock control when it is
false; the server refuses regardless, because a stale `true` is exactly the state a duplicate purchase
lives in.

### C2. `POST /api/v1/requirements/{id}/unlock/checkout/`

**Headers:** `Idempotency-Key` required.

Creates the payment order. **Server-priced** — the client sends no amount. A client-supplied price is
how INR 149 becomes INR 1.49, and the fact that today's UI would never do that is not a control.

**Response `201`:** `{ "unlock_id": "u_11…", "amount": 14900, "currency": "INR", "payment": { … } }`
— the existing M1 payment-order envelope, unchanged.

**Errors:** `409 m2_unlock_not_available` when no usable quote exists (the fee-after-value rule, in one
guard); `409 m2_requirement_expired`; `503 m2_provider_unavailable`, retryable.

### C3. `GET /api/v1/requirements/{id}/unlock/`

The authoritative unlock state, keyed by **requirement** rather than by unlock id — after a lost
payment redirect the client holds no unlock id at all, only the requirement it came from, and keying
by an id the recovery path cannot produce is how a paying Customer loses what they bought.

```json
{ "state": "PENDING", "unlock_id": "u_11…", "quotes_unlocked": 0,
  "rejections_remaining": 2, "refunded_at": null }
```

`state` follows §4 of the state machine: `OFFERED` → `PENDING` → `ACTIVE` → `CONSUMED`, with `FAILED`
and `REFUNDED`.

**The rule this endpoint exists to enforce:** only a verified provider callback moves `PENDING` →
`ACTIVE`. The client **never** treats a payment redirect as success — `M2-FE-404`. It resolves final
status here, and while `state` is `PENDING` it says the payment is confirming, offering a safe re-read
rather than a second checkout. `202 m2_unlock_payment_pending` carries the same meaning if it arrives
from a command.

`rejections_remaining` is required by `M2-FE-406`: a Customer rejecting a non-responsive vendor must
be told how many rejections remain before the cap. The cap is configuration
(`07-state-machines…` §9), so the count must come from the server.

### C4. `GET /api/v1/requirements/{id}/quotes/`

The unlocked quotes. Requires `state: ACTIVE` or `CONSUMED`; otherwise `403 m2_unlock_required`.

Full scope, line items, schedule, exclusions, assumptions, warranty, validity, vendor identity, and:

```json
{
  "tax_basis": "GST_18_INCLUSIVE",
  "commission_treatment": "PLATFORM_FEE_INCLUDED_IN_TOTAL",
  "total": { "amount": 2650000, "currency": "INR" }
}
```

`tax_basis` must be **identical across every quote for one requirement** (`GAP-017`). Comparison is the
entire point of buying the unlock, and quotes on different tax bases are not comparable — normalising
them client-side would mean the frontend inventing tax law. If the server cannot state one basis, the
comparison view cannot be built.

`total` is server-calculated and read-only. The comparison view never re-derives arithmetic locally.

**On refund or expiry, this endpoint must start refusing.** `m2-keys.ts` keeps teasers and unlocked
quotes under separate keys precisely so the unlocked cache can be dropped without touching the teaser
list; the server refusing is what makes that correct rather than cosmetic.

### C5. `POST /api/v1/proposals/{proposal_id}/select/`

**Headers:** `Idempotency-Key` required.

**Response `200`:** `{ "requirement_status": "SELECTED", "reconfirmation_deadline_at": "…" }`

Selection is **not** a booking. It creates a time-limited vendor reconfirmation request, and the UI
shows a pending state — `M2-FE-411`. `ENGAGED` arrives only on vendor reconfirmation (A3) or first
stage funding (A5).

| Status | Code | Frontend recovery |
|---|---|---|
| `409` | `m2_proposal_not_selectable` | Superseded, withdrawn or expired. Re-read the list; offer re-validation (C7). |
| `409` | `m2_selection_conflict` | Retryable. Another session selected first; re-read and show the real state. |
| `403` | `m2_unlock_required` | The unlock lapsed. Never a silent second charge. |

### C6. `POST /api/v1/proposals/{proposal_id}/reject/`

Body `{ "reason": "NON_RESPONSIVE" }`. `NON_RESPONSIVE` releases the slot and invites a replacement at
no charge, subject to the cap. Returns the updated `rejections_remaining`.

**Errors:** `409 m2_rejection_cap_reached` — and the message must say what happens next, since the
Customer has paid and has no remaining rejections.

### C7. `POST /api/v1/proposals/{proposal_id}/revalidate/`

One tap when a quote's validity has elapsed (`GAP-019`, `M2-FE-413`). Reuses the existing unlock and
charges nothing. Returns `202` with the vendor's response deadline.

**This must not create a new unlock.** The Customer already paid to see this quote; a lapsed validity
is the vendor's clock running out, not the Customer's purchase expiring.

---

## Cross-cutting requirements

| Concern | Contract |
|---|---|
| Idempotency | Every command above takes `Idempotency-Key`. Replay with identical arguments returns the original response; a different payload returns `409 idempotency_key_reused`; a running command returns `409 idempotency_in_progress`. Wraps `apps.foundation.services.execute_idempotent` — no new mechanism. |
| Object-level auth | Per record, not per route. A foreign actor receives `404`, never `403`, wherever existence is private. Every endpoint carries that regression test. |
| Errors | The `PartnerDomainError` shape: `code`, user-safe `message`, `status_code`, `retryable`, correlation ID. All 29 `m2_*` codes are already classified in `packages/api-client/src/errors.ts`; publishing them changes no frontend code. |
| Clocks | Deadlines are absolute UTC instants. The client calibrates from the HTTP `Date` header (proposal 0010) and never subtracts from the device clock. Business-hours arithmetic is server-side only. |
| Money | Integer minor units plus an explicit `currency`. No float ever crosses the wire. |
| Retryable | Only `m2_provider_unavailable` (503), `m2_selection_conflict` (409) and `m2_unlock_payment_pending` (202). Nothing else may be auto-retried by the client. |

---

## Open question — how does a `202` domain refusal reach the client?

`07-state-machines-and-permissions.md` §8 declares `m2_unlock_payment_pending` with status **`202`**
and `retryable: yes`. Every other code in that table is `4xx` or `503`. This one needs a decision
before it is published, because a `202` is not an error to any HTTP client:

`openapi-fetch` resolves `2xx` into `data` and only `>=400` into `error`. A `202` carrying an
`ApiError` body therefore arrives as a **successful response whose payload happens to be an error
shape**. `request()` returns it as data, `categorizeError` never sees it, and the unlock screen reads
a refusal as a success — the single worst place in M2 for that to happen, since the next thing it
would do is show quotes the Customer has not paid for.

Three ways out, in the order the frontend prefers them:

1. **Make it `409 m2_unlock_payment_pending`, `retryable: true`.** "Your payment is still confirming"
   is a refusal of *this* attempt; the client already knows how to poll `GET /unlock/` and how to
   render a retryable conflict. No new mechanism, and `errors.ts` already classifies the code as
   `await_confirmation`. **This is the recommendation.**
2. **Keep `202` and return the unlock projection, not an error.** Legitimate — `202 Accepted` with
   `{"state": "PENDING"}` is honest REST, and the client reads `state` rather than a code. Then
   `m2_unlock_payment_pending` should be **removed** from the error table, because it is not an error.
3. **Keep `202` with an error body.** Then `@vsolve/api-client` needs a documented rule that a `2xx`
   response containing `code` is routed to the error path. That is a special case in the one layer that
   must never have special cases, and it would apply to every future endpoint.

Options 1 and 2 are both fine and mutually exclusive; option 3 is the one to avoid. The frontend
cannot pick — whichever is chosen, `errors.ts` and `error-presentation.ts` follow it in a one-line
change, but they must be told which.

The same question applies to any other command that would answer `202` while refusing.

### Answered — option 1, with one amendment (backend, 11 August 2026)

**`m2_unlock_payment_pending` is published as `409`, `retryable: true`.** The frontend's reasoning
holds and the analysis of `openapi-fetch` is correct: a `202` carrying an error body is a refusal
that arrives as `data`, and the unlock screen is the one place in M2 where reading a refusal as a
success would show quotes nobody paid for. Option 3 is rejected for the reason given — a `2xx`-is-
sometimes-an-error rule in `@vsolve/api-client` would apply to every endpoint forever to fix one.

The amendment: **`202` is not banned, it is reserved for acceptance.** The distinction is whether
the server took the work, not whether the work has finished.

- A command that **accepted** the request and will finish it asynchronously answers `202` with a
  projection, never an error body. `POST /requirements/{id}/submit/` does exactly this — it returns
  `202` with the requirement, because matching genuinely has been started and has not finished.
- A command that **refused** answers `4xx` with the error envelope, whatever the reason. "Your
  payment is still confirming" is a refusal of this attempt.

So option 1 governs refusals and option 2's shape governs acceptances, and the rule that separates
them is one a client can act on without knowing which endpoint it called: `>=400` is the error path,
and nothing below it ever carries an error body.

Follow-ups this creates, both small and both owned by the frontend:

1. `packages/api-client/src/errors.ts` classifies `m2_unlock_payment_pending` as
   `await_confirmation` already — no change, but its status expectation should be `409`.
2. `07-state-machines-and-permissions.md` §8 lists the code at `202`. That table is the authority
   and is now wrong; it is corrected to `409` in the same change that publishes the unlock surface
   in **Wave C2**, not now — the code has no endpoint yet, and editing the state machine ahead of
   the endpoint would leave the document describing something that does not exist.

---

## What the frontend does until this is published

Stated plainly so nobody reads a built screen as a working one:

- **No M2 query is mounted.** `m2-keys.ts` forbids using a key whose endpoint is unpublished, and that
  rule holds until this proposal reaches `Published`.
- **No fixtures, no mocks, no placeholder data in application code.** With no backend the screen shows
  its real loading state and then its real error state. Fixtures exist in tests only.
- **Every M2 frontend task stops at `[~] built`.** Integration — re-pointing at the generated client
  and proving real backend states — is a separate mark, and no M2 frontend task reaches `[x]` before
  it. See `Django_Next.js_Plan/M2/frontend-execution-plan.md` §2.
- **Screens are built against these shapes.** If the published contract differs, integration is a
  re-point at the seam. If any screen cannot be re-pointed in a single file change, the seam was drawn
  wrong and that is a frontend bug, not a contract problem.

---

## Acceptance criteria

1. `GET /api/v1/partner/workspaces/` publishes `{workspace_key, commercial_mode, actions[]}`, returns
   `200` with an empty list for an unapproved Partner, and expresses suspension by reduced grants
   rather than an error.
2. The requirement create/patch/submit path publishes `inferred_lifecycle`,
   `lifecycle_explanation`, `missing_required_answers` and `is_free`, and never accepts a payment.
3. `POST /api/v1/requirements/{id}/submit/` requires `Idempotency-Key`; replaying one key creates
   exactly one requirement and emits exactly one matching event. Backend test asserts both counts.
4. Teasers contain no vendor identity, contact, scope text, line item or exact total. Backend test
   asserts the serialized teaser field set **by exhaustive comparison**, so a field added later fails
   the test rather than leaking.
5. `unlock_available` is false whenever `create_unlock_checkout` would refuse, and the checkout accepts
   no client-supplied amount.
6. `PENDING → ACTIVE` is reachable only from a verified provider callback. Backend test: a client
   posting the redirect payload directly does not obtain an unlock.
7. One successful payment grants exactly one unlock under duplicate webhooks and retries.
8. `GET /quotes/` returns `403 m2_unlock_required` without an active unlock, and starts refusing again
   after a refund.
9. Every quote for one requirement carries an identical `tax_basis`. Backend test asserts it across a
   mixed-vendor set.
10. Selection returns a reconfirmation deadline and leaves the requirement in `SELECTED`, never
    `ENGAGED`.
11. `revalidate` consumes no unlock and creates no payment.
12. All 29 `m2_*` codes are declared with the `ApiError` shape; `pnpm contract:check` passes and the
    generated client needs no cast.
13. A foreign Customer receives `404` on every requirement route. Regression test per endpoint.

Items 4, 5, 6 and 8 are the ones worth a reviewer's full attention. The rest are correctness; those
four are the difference between a fee charged against delivered value and a fee charged against a
promise.
