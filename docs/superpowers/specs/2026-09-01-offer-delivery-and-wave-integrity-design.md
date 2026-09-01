# Offer delivery, wave integrity, and the visit-day contact ladder

Date: 2026-09-01
Status: approved in conversation (owner, 2026-09-01), in build
Depends on: ADR-0008, ADR-0009, `2026-08-17-a3-cascade-exhaustion-and-live-offers-design.md`,
`2026-08-15-in-app-notifications.md`

## Problems

1. **The fixed-visit offer is silent.** `m2.fixed_visit_offer.received` (matching.py:794) has no
   notification consumer and is not in `PARTNER_IN_APP_STREAM_PURPOSES`. The one offer type built
   around a customer-chosen time is the only one a partner is never told about — it sits in the
   Work list until the partner happens to walk in.
2. **The fixed-visit deadline is borrowed from the wrong clock.** `responds_by =
   min(first_quote_sla_hours as business hours, starts_at − 15min)` gives a yes/no question a
   two-day timer. A 48-hour countdown on a first-accept-wins broadcast teaches partners that
   offers can wait, and holds the customer in `SEARCHING` for days before `NO_PROFESSIONAL_FOUND`.
3. **A declined quote slot is never refilled.** Expiry replaces one-for-one; customer rejection
   and vendor withdrawal replace one-for-one; a vendor **decline** — the exit with buttons in the
   UI — releases the slot and nothing ever refills it. A customer promised `max_quotes` quotes
   silently receives fewer.
4. **A paid visit reveals the address but not the person.** After the visit fee, the partner gets
   the full street address (visit `SCHEDULED`) but no name to give a watchman and no number to
   call from the gate. Full contact stays engagement-gated, correctly — but the visit is itself a
   paid physical meeting.

## Decisions

**One clock family for instant dispatch.** Fixed-visit offers get
`fixed_visit_offer_timeout_seconds` on `M2VariantConfiguration` (seeded 300s), wall-clock, applied
as `min(existing deadline, now + timeout)`. Crew dispatch already chose wall-clock over business
hours for exactly this shape of decision (crew_dispatch.py:270).

**Search keeps searching.** A `SEARCHING` share whose invitations all die is **re-dispatched** by a
sweep (newly eligible partners only — the one-invitation-per-share exclusion already exists) until
`starts_at − 15min`, then settles `NO_PROFESSIONAL_FOUND`. The quote wave becomes self-healing:
decline triggers a one-slot refill exactly as rejection already does, and a top-up sweep refills
any live quote-flow requirement sitting below `max_slots` — reaching partners who became eligible
after the opening wave. Supply exhaustion is reported honestly, never spun through.

**Offers interrupt; the ladder stays for reach-out.** `m2.fixed_visit_offer.received` joins the
notification routing table (partner audience, `FIXED_VISIT_OFFER` target → the enquiry screen) and
`PARTNER_IN_APP_STREAM_PURPOSES`, alongside `m2.crew_offer.invited`. The partner app grows one
offer-interrupt surface (`features/offer-deck/`) that owns every pending interrupt, sorted
soonest-deadline-first, one card at a time with the rest peeking, outcome outliving the row.

**The visit-day contact rung.** On the enquiry read: `customer_name` (first name) from visit
`SCHEDULED`; `customer_phone` only while `now >= visit start − 2h` and the visit is not yet
completed (same 2h the arrival-code window uses). Full contact both ways stays on the engagement's
`contact_released_at`, unchanged.

## Not doing

- No push/SMS/WhatsApp sending — MSG91 remains unwired; the escalation ladder is untouched.
- No customer-set pricing or wave-size changes; `DEFAULT_WAVE_SIZE` and `max_quotes` stand.
- No masked-number proxy (needs a telephony provider); the 2-hour window bounds the exposure.
- The A1 dialog and its alarm remain the same-day path; consolidation into the deck covers the M2
  invitation surfaces first.

## Testing

Focused runs only (owner re-allowed test execution 2026-09-01): the new handler/sweep/serializer
tests plus the touched suites; static gates (`quality-static`) before handoff. Browser pass only
if the owner's dev server is running.
