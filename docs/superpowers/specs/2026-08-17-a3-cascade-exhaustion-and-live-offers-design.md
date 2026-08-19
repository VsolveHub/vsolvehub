# A3: cascade exhaustion, customer recovery, and live crew offers

Date: 2026-08-17
Status: approved, in build
Depends on: [ADR-0009](../../adr/0009-m2-rate-card-instant-dispatch-for-a3.md)

## Problem

Three separate complaints, one flow.

1. When no lead accepts a rate-card job, the customer is moved to the quote flow **automatically**
   and told so after the fact. They are given no choice: no way to search again, no way to cancel,
   no way to change anything.
2. Offers that are dead — expired, withdrawn, or belonging to a cancelled job — can still appear in
   a lead's inbox, because the list filters on `status=INVITED` and an expired invitation keeps that
   status until the Celery sweep runs.
3. A crew offer dies in 120 seconds but is only visible on the offers page. A lead reading anything
   else misses it, which costs them income and costs them a decline-rate signal they did not earn.

A fourth defect blocked all of it and is fixed first, separately: `matching.accept_invitation`
counted `INVITED` against a ceiling of one on the rate-card path, so **no** crew offer could ever be
accepted and every A3 booking exhausted its cascade. See `tests/requirements/test_crew_offer_slots.py`.

## Decisions

**Recovery widens the search; it never changes the price.** A3 is an ops-published rate card whose
customer rate decomposes into `worker_day_wage_paise + supervision_margin_paise +
booking_fee_paise`, sits above a statutory wage floor, and is paid to the crew *directly in cash,
daily* — the platform never holds it. A customer-added "+₹100" would therefore be a promise the
platform advertises and cannot enforce, and `07-state-machines-and-permissions.md` §7 already
forbids a partner charging above the card. Thin supply is treated as a reach problem, which is what
it usually is.

**Exhaustion parks and waits.** `fall_back_to_quote_flow` stops being automatic and becomes one of
three things the customer may choose. Their request does not change product without them saying so.

**An offer interrupts wherever the lead is.** A 120-second window is too short for a bell badge.

## Design

### Exhaustion

New `RateCardBooking.Status.EXHAUSTED`, with `exhausted_at`, `exhaustion_reason_code` and
`retry_count`. `advance_cascade` calls a new `exhaust_cascade()` where it used to fall back, for both
of its current reasons (`cascade_exhausted`, `no_eligible_leads`). Exhaustion **withdraws every
outstanding `INVITED` invitation**, so a job nobody took stops appearing to anybody.

`EXHAUSTED` is not in `DISPATCHABLE_STATUSES`, which means slot accounting reverts to quote-flow
semantics the moment the cascade stops — the same boundary `FELL_BACK` already relies on.

### The three customer commands

| Action | Endpoint | Effect |
|---|---|---|
| Search wider | `POST /requirements/{id}/rate-card/retry/` | `retry_count += 1`, status → `MATCHING`. The wave counter is **not** reset, so the next wave is wider than the last one tried. Bounded by `(retry_count + 1) * policy.max_waves`. |
| Get quotes instead | `POST /requirements/{id}/rate-card/quotes/` | The existing `fall_back_to_quote_flow`, now chosen. |
| Cancel | `POST /requirements/{id}/rate-card/cancel/` | Status → `CANCELLED`, requirement closed, invitations withdrawn. Nothing was charged; there is no money on this path before `OFFER_HELD`. |

All three are customer-only, refuse from any status other than `EXHAUSTED`, and run through
`execute_idempotent` like every other rate-card command.

### Notification

`m2.rate_card.exhausted` → `Audience.CUSTOMER`, template `m2_rate_card_exhausted`:

> **No crew accepted yet**
> Nothing has been charged. You can search wider, switch to quotes, or cancel — your request is
> exactly as you left it.

### Dead offers

- The partner list filters `responds_by__gt=now` as well as `status=INVITED`, so a lapsed offer is
  invisible before the sweep rather than after it.
- The client drops past-deadline offers too, because a poll can land a second late.
- Exhaust and cancel withdraw outstanding invitations rather than leaving them to lapse.
- Only `CONFIRMED` bookings reach the partner's jobs list.

### Live offer sheet

`features/crew-offer/view/live-offer-sheet.tsx`, mounted in the partner shell, driven by the
**existing** polled `crewOffers.inbox()` query — offers are already dynamic; they were merely
confined to one route. Shows the top answerable offer on any route with accept/decline and a live
countdown, suppresses itself on the offers page, and dismisses on answer or expiry.

## Testing

Written, not run, per the owner's standing rule. Slot accounting (done), exhaustion transitions,
retry widening and its cap, cancel withdrawing invitations, notification routing, and the list
excluding lapsed offers.

## Not doing

Customer-set pricing, surge, and ops-approved bumps — all rejected above. If supply genuinely
cannot be met at the published rate, that is a signal for Operations to re-publish the card for the
city and skill, which is a decision with a wage floor behind it rather than a button in a customer
app.
