# Partner offer events

**Status:** proposed
**Board:** `tasks.md` BE-5 (event), BE-6 (transport), FE-3 (consumer)
**Owner:** backend seat. The Partner app builds against this document; it does not
guess the shape from the code.

A Partner learns about a new offer today by polling `GET /api/v1/partner/offers/`.
Polling is the floor, not the ceiling: an offer's whole life is
`M1_PARTNER_OFFER_TIMEOUT_SECONDS` (45 seconds), so a poll tick can burn a third of
the window before the Partner is even told there is something to accept.

This document is the written contract between the event (BE-5), the transport that
carries it (BE-6) and the Partner app that renders it (FE-3), so all three can be
built in parallel instead of in series.

---

## 1. The event

Every offer created through `apps.assignments.group_services._create_offer` — the
ordinary same-day offer path — records a `NotificationIntent`:

| Field | Value |
|---|---|
| `purpose` | `partner.offer_created` |
| `template_code` | `partner_offer_created` |
| `channel` | `PUSH` |
| `recipient` | the offered Partner's `User` |
| `idempotency_key` | `offer-created:{offer_id}` |

`context` — **this is the payload FE-3 reads.** Keys are stable; adding a key is
additive, renaming or removing one is a contract change.

```json
{
  "offer_id": "0f8d…",
  "fulfilment_unit_id": "3b21…",
  "requested_start": "2026-08-10T17:00:00+05:30",
  "expires_at": "2026-08-10T14:32:45.120000+00:00"
}
```

* `offer_id` — the `PartnerOffer`. Command endpoints are keyed on it.
* `fulfilment_unit_id` — the visit being offered.
* `requested_start` — ISO 8601, offset-aware, in the service area's timezone.
* `expires_at` — ISO 8601, UTC. When the Partner's accept window closes. It is
  already `min(group.expires_at, now + M1_PARTNER_OFFER_TIMEOUT_SECONDS)`, so the
  client counts down against this and does not recompute the deadline itself.

**No money is in this payload, by design.** The offer's earnings projection lives on
the offer row and reaches the app through `GET /api/v1/partner/offers/`, which is
where every rupee the Partner sees is already computed server-side. An event is a
signal to go read the authoritative row, not a second source of truth for it.

`partner.offer_created` is in `TRANSACTIONAL_PURPOSES`: a Partner who is online
cannot mute the only signal that work arrived. Going offline is the control for not
being offered work.

### Not fired for

* **Advance bookings.** Those go through `directly_assign`, which has always fired
  `partner.job_assigned` — a different purpose, because the Partner is being told the
  job *is theirs*, not that they may claim it. FE-3 should not treat the two as one.
* **Manual Operations offers** are created through `_create_offer` and therefore *do*
  fire this event. That is intended: from the Partner's side it is an offer either way.

---

## 2. The transport (BE-6)

```
GET /api/v1/partner/offers/stream/
```

Authenticated as a Partner, same auth and permission style as
`GET /api/v1/partner/offers/`. `Content-Type: text/event-stream`.

Frames:

```
event: offer_created
data: {"offer_id":"…","fulfilment_unit_id":"…","requested_start":"…","expires_at":"…"}

```

`data` is exactly the `context` object above, serialised as one line of JSON.

Keepalives, so intermediate proxies do not judge an idle connection dead:

```
: keepalive

```

A comment frame carries no event and the client ignores it. `EventSource` does this
natively.

**Connection lifetime is capped** (see BE-6 for the number). The server closes; the
browser's `EventSource` reconnects on its own. Clients must not treat a close as an
error, and must not implement their own reconnect loop on top of `EventSource`'s.

**Only events addressed to the authenticated Partner are ever sent.**

### Scope limit — read this before building against it

This is foreground delivery: it works while the Partner has the app open. It is
**not** OS-level push, and it will not wake a closed or backgrounded app. That needs
a service worker, a browser push-permission prompt, VAPID/FCM registration and
device-token storage — a separate initiative, deliberately out of scope here.

---

## 3. What the consumer must not do

The stream is **additive**. `usePartnerOffers`' polling is the reliable path and stays
exactly as it is; the stream only shortens the delay in the good case. If the stream
is unavailable, refused, or drops, the Partner app must behave precisely as it does
today. An offer must never be visible only because the stream delivered it.
