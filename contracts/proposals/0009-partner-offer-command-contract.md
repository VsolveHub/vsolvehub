# Proposal 0009 — Make the Partner offer commands idempotent, typed and honest about refusal

**Author:** Claude (FE-09 frontend integration)
**Date:** 3 August 2026
**Verified against:** OpenAPI 1.10.0
**Status:** Partial — idempotent typed commands implemented and present in OpenAPI 1.13.0; one
fixture failure, missing changelog entry for 0009, and full `quality.cmd` not yet green
(reviewed 2026-08-04).
**Consuming application:** Partner (`/offers`)
**Consuming action:** Accept, Decline, Undo, Commit now on a Fulfilment Unit offer
**Required authorization:** `cookieAuth` + `IsPartnerUser`, and the offer must belong to the caller

## Problem

`POST /api/v1/partner/offers/{offer_id}/{action}/` is the only command a Partner uses to take work,
and it is the least specified command in the contract:

```yaml
  /api/v1/partner/offers/{offer_id}/{action}/:
    post:
      operationId: partner_offers_create
      parameters:
      - in: path
        name: action
        schema:
          type: string        # (1) no enum
        required: true
      - in: path
        name: offer_id
        schema: { type: string, format: uuid }
        required: true
      tags: [Partner]
      security: [ { cookieAuth: [] } ]
      responses:
        '200': { $ref: Offer }   # (2) the only declared response
```

Four separate gaps, in descending order of how much they matter.

### 1. The command is not idempotent, and a retry reports a false loss

This is the important one. `accept_unit_offer` is **state-guarded**, not idempotent:

```python
if (
    group.status in GROUP_TERMINAL_STATUSES
    or offer.status != PartnerOffer.Status.OFFERED
    or offer.expires_at <= now
):
    raise ValueError("This offer is no longer available to accept.")
```

Consider the ordinary case this is guaranteed to hit — a Partner on a phone, on mobile data, in
someone's stairwell:

1. Partner taps **Accept**. The request reaches Django, the `Reservation` is created, the offer moves
   to `ACCEPTED_PENDING_UNDO`.
2. The response is lost — the radio drops between cell and lift.
3. The Partner taps Accept again, because from where they are sitting nothing happened.
4. Django sees `status != OFFERED` and answers `400 offer_invalid`, *"This offer is no longer
   available to accept."*

The Partner is told they lost a job **they actually won**. The reservation exists, the undo clock is
already running, and the one screen that would show them this is the screen that just told them they
were too late. If they walk away, the undo window lapses into a commitment they do not know about;
if they refresh hard enough to see the truth, they have burned part of a 120-second window.

Every other state-changing command in this contract already avoids this. Plan-set creation, quote
creation, checkout and Booking Group cancellation all require `Idempotency-Key`:

```yaml
      - in: header
        name: Idempotency-Key
        schema: { type: string }
        description: Stable opaque key for this logical command. Reuse it only when
          retrying the identical request; using it with a different payload returns 409.
        required: true
```

`PartnerOfferCommandView` has no such handling — `apps/assignments/views.py` reads no
`Idempotency-Key` and the infrastructure in `apps/carts/views.py` is not applied to it. Accepting a
job is at least as consequential as pricing one.

### 2. `action` is an unconstrained string

The view accepts exactly `accept`, `commit`, `decline` and `undo`, and answers anything else with a
`ValidationError`. The contract says `type: string`, so the generated client will happily send
`"acccept"` and the mistake surfaces as a runtime 400 in front of a Partner rather than as a compile
error in CI. An enum makes the closed set the type system's problem.

### 3. Only `200` is declared

`400` (`offer_invalid`), `403`, `404` and the reservation race — *"That appointment was just reserved
by another Customer"* — are all reachable and none is in the document. The frontend needs each one to
say something different, and today it can only classify them by guessing from status codes.

The reservation race deserves its own code. Losing an appointment to a concurrent booking is not the
same event as an offer expiring, and telling a Partner "this offer expired" when someone else took
the slot is a wrong explanation of a real loss.

### 4. `Offer` carries no `server_now`

`expires_at` and `undo_deadline` drive two countdowns, one of which is a 120-second window on a
commitment. `BookingGroup` publishes `server_now` for exactly this reason; `Offer` does not.

This one is **not blocking**: the shared client calibrates `serverClock` from the HTTP `Date` header
on every response, which is second-precise and sufficient for a 120-second window. FE-09 uses that
and never subtracts a deadline from a raw `Date.now()`. Adding `server_now` would remove the ±1s
granularity, and is worth doing when the serializer is next touched.

## Requested contract

### Endpoint and method

`POST /api/v1/partner/offers/{offer_id}/{action}/` — unchanged.

### Required header

```yaml
      - in: header
        name: Idempotency-Key
        schema: { type: string }
        description: Stable opaque key for this logical command. Reuse it only when
          retrying the identical request; using it with a different payload returns 409.
        required: true
```

### Typed action

```yaml
      - in: path
        name: action
        schema:
          $ref: '#/components/schemas/OfferActionEnum'
        required: true
```

```yaml
OfferActionEnum:
  enum: [accept, decline, undo, commit]
  type: string
```

### Replay semantics

Replaying a key with the **identical** `offer_id` and `action` must return `200` with the offer's
current projection — the same answer the first call produced — rather than the state-guard refusal.
That single change is what turns step 4 above from "you lost the job" into "you already have it".

Replaying a key with a *different* `offer_id` or `action` returns `409 idempotency_key_reused`, as
elsewhere. A command still running returns `409 idempotency_in_progress`.

### Declared responses

| Status | Code | Meaning | Frontend recovery |
| --- | --- | --- | --- |
| `200` | — | `Offer` in its new state | Render it; it is the truth. |
| `400` | `offer_invalid` | The offer genuinely moved on — expired, revoked, already declined | Re-read the inbox and show the real state. |
| `409` | `offer_reservation_conflict` | Another Customer took the appointment first | "Someone else booked that slot" — a loss, but not the Partner's fault and not an expiry. |
| `409` | `idempotency_in_progress` | The original command is still running | Wait and re-read. Never resend under a new key. |
| `409` | `idempotency_key_reused` | Key sent with a different command | Surface as a client bug. |
| `403` | `permission_denied` | The offer belongs to another Partner | Shared session/permission path. |
| `404` | — | No such offer for this Partner | Re-read the inbox. |

A dedicated `offer_reservation_conflict` is the one genuinely new code requested; the rest already
exist and only need publishing.

### Optional: `server_now` on `Offer`

```yaml
        server_now:
          type: string
          format: date-time
          readOnly: true
```

Same field and meaning as on `BookingGroup`.

## What FE-09 does in the meantime

The frontend does not simulate any of this, and does not pretend the command is safe:

- **No automatic retry on any offer command**, ever. The contract defines no safe replay, so retrying
  is the frontend inventing one.
- **The control is disabled for the whole in-flight window**, so double submission needs a lost
  response rather than a fast thumb.
- **An ambiguous failure re-reads the inbox instead of asserting failure.** Where a command fails and
  the outcome cannot be known, the UI says the result is unconfirmed and shows the offer's server
  status — because `offer.status` is the truth and the error message is not. It never renders
  "you lost this offer" on the strength of a `400` alone.
- **Countdowns run off `serverClock`**, never the device clock.

That mitigation makes the failure recoverable. It does not make it correct: the Partner still sees a
scary intermediate state for one round trip, and the fix belongs on the server.

## Acceptance criteria

1. `partner_offers_create` publishes a required `Idempotency-Key` header and a typed
   `OfferActionEnum` path parameter.
2. Replaying the same key with the identical `offer_id` and `action` returns `200` with the current
   offer, not `400 offer_invalid`.
3. A key replayed with a different offer or action returns `409 idempotency_key_reused`.
4. `400 offer_invalid`, `403`, `404` and `409` are declared with `ApiError`.
5. A concurrent reservation loss returns `409 offer_reservation_conflict`, distinguishable from
   expiry.
6. `pnpm contract:check` passes and the generated client accepts the header and the enum with no cast.
7. Backend test: accept the same offer twice under one key; assert exactly one `Reservation` exists
   and both responses are `200` with `ACCEPTED_PENDING_UNDO`.
8. Backend test: two Partners accept offers for the same slot concurrently; the loser receives
   `offer_reservation_conflict`, not `offer_invalid`.
9. Frontend acceptance, added once published: simulate a lost response on Accept, resend under the
   same key, and assert the Partner sees the accepted offer with its undo countdown — never a loss.

Until item 1 lands, `/offers` ships with the mitigation above and states plainly that a failed
command's outcome is unconfirmed rather than guessing at it.
