# 9. M2 published rate card and instant crew dispatch for A3

- Status: Accepted
- Date: 2026-08-13

## Context

ADR-0007 set A3 (`A3_TIME_BLOCK`) to quote-first: a free requirement, remote one-screen vendor
quotes, teasers, and an INR 149 unlock to read and select. ADR-0008 revised A5 to visit-first and
left A3 untouched. Both revisions defended one property: money is charged only against a real,
accepted commitment.

The owner reviewed the A3 flow on 13 August 2026 against the market it serves. Day labour in India
is supplied by the mestri/thekedar and his gang, not by individual workers — the plan's own
attendance model already assumes the supervisor holds the app and the workers mostly do not carry
smartphones. What that market sells is a commodity priced per worker per day at a street rate every
participant already knows, a rate that moves with wedding season (November–February), harvest
migration, month-end shifting spikes and festival blackouts. A customer asking for four helpers for
two days of shifting does not need three competing essays delivered inside a 72-hour SLA and a
paywall to compare numbers the street already agrees on. The unit of value is not a quote; it is a
confirmed crew that shows up.

Quote-first for that work also leaves the single most common Indian failure untreated: the on-site
renegotiation — "third floor, no lift? Extra, bhaiya." A remote quote against a vague requirement
gives the surprise somewhere to live; the customer has no published number to hold the lead to.

Three facts shaped the decision. First, the platform already owns the machinery an instant product
needs: the A1 offer cascade (small wave, first accept wins, minutes-level timeouts), capacity holds
that consult `carts.availability`, global crew identity with cross-agency conflict checks, and M1
payout, refund and amendment rails. Second, the statutory wage-floor guard is already built and
fails closed per state and skill (`m2_wage_floor_unavailable`), and `M2VariantConfiguration`
already maps each variant to a floor skill — the same key a rate card needs. Third, the A5 visit
money decided on 2026-08-13 established the split shape: a configured vendor share paid through the
M1 payout rails plus a Vsolve platform share, with undelivered value refunding the customer.

## Decision

A3 becomes **rate-card-first**. A5 is unchanged (ADR-0008). The mode-per-archetype rule, the
engagement spine, crew identity, supervisor attendance, scope amendments and vendor standing from
ADR-0007 all remain in force.

**Operations publishes the price.** A rate card exists per city and skill: one all-inclusive
customer price per worker per eight-hour day, built from three configured parts — the worker
day-wage (never below the statutory floor the platform already enforces), the lead's supervision
margin, and the platform booking fee. The card prints its inclusion list: what counts as a day,
when overtime starts and at what published rate, and what the preset's scope includes. Rates are
seeded by an Operations phone survey of ten to fifteen contractors per launch city, cross-checked
against the wage floor. One flat rate per city per skill; no zones and no surge until data forces
them. Rates are reviewed monthly on a calendar, and the decline rate is an Operations alarm rather
than a report: a sustained decline rate above the configured threshold at a rate is the signal to
raise it. If a demand multiplier is ever added it is displayed as one, never applied silently.

**The requirement narrows to a preset.** An A3 requirement asks the skill, headcount, dates and the
three or four price-moving facts for that preset — floor number, lift, carry distance, packing —
so the on-site surprise has nowhere to hide. The published rate and its inclusion list are on the
screen before the customer books. The four-screen requirement flow remains the A5 shape.

**Dispatch goes to the lead, always.** The request is offered to Partners whose approved A3
capability and verified roster cover the requested headcount, through the same offer cascade A1
technicians use. Aggregating strangers from several vendors is forbidden: it produces no
accountable party, no common language and a customer forced to play site supervisor. Accepting the
rate card is part of A3 capability approval; the offer screen always shows the vendor's own number
— what they receive per day for the requested crew, paid directly by the customer at day end — and
accepting a job is accepting that rate for that job. Acceptance takes a soft capacity hold sized
against the roster, and the global crew identity check continues to catch the same worker promised
through two agencies. A one-helper job is a lead with a roster of one.

**The booking fee is the commitment device.** It is charged online at vendor accept — the A3 mirror
of the visit-plan charge, on the same rails: the accepted offer is held while the customer
completes the booking-fee checkout, and only a verified provider callback hardens the booking and
creates the engagement. The fee reuses the 2026-08-13 split shape. If the customer no-shows or the
gate is locked — the crew travelled for nothing, which kills vendor trust faster than anything —
the fee forfeits: a configured share pays the lead as travel compensation through the M1 payout
rails and the remainder is the platform share. If the vendor no-shows, the fee auto-refunds in
full, re-dispatch is free and the vendor's standing is hit. A free-cancel window runs until a
configured number of hours before the slot; inside it the forfeit rule applies. A prank booking now
costs real money, which is the point.

**Wages are direct, daily, at day end.** That is the iron norm of this market — a thekedar unpaid
before the crew leaves on day one does not come on day two — and the platform encodes the norm
instead of fighting it. Each evening both sides get a one-tap "Day settled?" prompt carrying a UPI
deep-link or QR to the lead's VPA at the exact published amount, as a convenience; the money is
peer-to-peer and the platform never holds wages. The gang's internal split is the mestri's business
and his margin is his livelihood. The platform enforces exactly two things at that layer: the
published wage component clears the statutory floor, and roster identities are verified. Settlement
is per worker-day present, never per job: the supervisor marks the day's count, the customer
confirms in one tap, and the day settles at the present workers' published rate; on a shortfall the
customer chooses to continue short, add a day, or cancel the shortfall free. Multi-day engagements
settle daily by default; end-settlement exists only where the lead's own terms allow it.

**Extras go through the amendment engine at published rates.** Any genuine extra is a one-tap scope
amendment at the card's published add-on rates, in-app, before it counts — executed through the M1
amendment engine as every A3 scope change already is. Overtime at the published rate counts only
after customer one-tap approval, with the retroactive window unchanged. "Extra demanded in cash" is
a one-tap customer report that hits standing and removes the vendor on a pattern.

**Thin supply degrades honestly.** If no lead accepts, the cascade widens and the customer sees an
honest holding state; past a configured threshold the requirement falls back to the quote flow.
Instant is never shown where it cannot be delivered — a confirmed-then-ghosted crew is worse than a
wait. The quote path, its teasers and the unlock machinery stay built and become that fallback;
whether the fallback still charges the INR 149 unlock or delivers its quotes readable free is an
owner decision.

The new machinery is deliberately small: a `RateCard` aggregate (effective-dated, keyed by city and
skill, carrying the three components, overtime and add-on rates and the inclusion list), a
`BookingFee` charge with its forfeit split, the preset shape on the existing variant configuration,
and a caller into the existing offer cascade. Attendance, amendments, crew identity, payout rails
and disputes are all unchanged.

## Consequences

The platform now sets prices, and inherits the obligations of a price-setter: the seeding surveys,
the monthly review calendar, seasonal awareness, and the wage-floor cross-check. This market
reprices weekly in season, so the rate card must be cheap to change and effective-dated rather than
edited. The decline-rate alarm is load-bearing: a rate below the street rate that week makes leads
silently decline everything and the instant product dies quietly, so a sustained high decline rate
must page Operations, not appear in a monthly report.

Revenue in A3 is the booking fee and nothing else — the unlock-fee sentence of ADR-0007 transfers
to the new fee word for word. The platform still never sees the wage money, cannot take commission
on it, and must not present an A3 booking as wage-protected. The GST, invoicing and
principal-versus-agent decision now covers the booking fee for A3, and the unit-economics decision
is restated against it: Operations minutes per A3 request are charged against the booking fee's
platform share.

Unlike revision 3, this revision touches built surface. The A3 unlock path is built on both halves
— teasers at 1.21.0, the unlock and full-quote read published in Wave C2, and the Customer access
surface built in Wave A2 against 1.24.0. That work is demoted to the fallback path, not deleted;
the primary A3 front door becomes a preset, a displayed rate and a booking-fee checkout, which is
new build rather than rework of those files. The rate card itself reuses two built patterns: the
effective-dated, fail-closed Operations price (`M2AccessPrice`) and the per-state-per-skill
`MinimumWageFloor` the proposal guard already enforces. The four-screen requirement flow built in
Wave A1 remains the A5 shape and gains a shorter A3 preset entry.

The platform never guaranteed wage recovery and must now say so upfront, because daily direct
settlement makes non-payment a live failure: the attendance record plus the published rate form an
evidence pack, the customer account is blocked pending resolution, and an Operations case opens —
but a cash dispute where both sides lie is unadjudicable, which the plan already accepted for
LEAD_ONLY. The dual "Day settled?" taps are the mitigation, and a one-sided claim without the tap
trail goes to Operations as unproven, not as fact.

Off-platform undercutting — "next time call me directly" — is unpreventable in a LEAD_ONLY market
and is deliberately not fought with detection. It is fought by making rebooking faster than a phone
call and by the customer's protection — replacement, the attendance record, dispute help — being
worth the margin.

The fallback path preserves optionality at the cost of a second front door: the quote flow must
keep working for the categories and moments the rate card cannot serve, so the unlock surface
cannot be deleted even though it is no longer the product. Its fee status in the fallback is an
open owner decision, and until decided, the fallback inherits the built behaviour.
