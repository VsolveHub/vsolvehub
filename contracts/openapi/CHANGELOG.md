# API Contract Changelog

> Entries for 1.19.0 and 1.20.0 were never written. This file therefore jumps 1.18.0 → 1.21.0.
> The gap is recorded rather than backfilled, because inventing a description of a change nobody
> documented is worse than an honest hole.

## 1.31.0 - The project: what was agreed, what changed, and who finishes it

**Wave C5 ([ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md), with the two
amendments in its status block).** Eight new paths on the A5 half of the engagement spine — the
mirror of 1.30.0's shift-day block, for the other archetype. Additive: no path, operation or
schema component published before is removed, renamed or reshaped, verified by diffing every
component name, path and `operationId` against the committed contract before publishing. Exactly
**two** existing components changed at all: `EngagementStageStatusEnum` gained a value, which is
the trap below, and `DaySettlement.shortfall_choice` widened to admit the value it has always
actually carried, which is under "three shift-day defects" at the end.

### Why

1.25.0 built one stage spine for both archetypes and 1.30.0 spent it on A3's shift-days. This is
the A5 half: a stage is a **milestone** rather than a day, so it has a deliverable, a date that can
legitimately move, and a vendor who might walk away from it halfway through.

Three things a project has that a shift-day does not, and each is a new record because the spine
genuinely has no room for it:

- a **schedule can move with no money moving**. The M1 amendment engine cannot express that —
  `requirements_engagement_amendment_moves_money` refuses a zero delta at the database, on purpose
  — so a Customer-caused delay is its own record with **no amount field anywhere on it**;
- a **vendor can change**, which is the one term an engagement freezes that no amendment was
  designed to move;
- a **deliverable can be a file**, because Event and Media work is finished by handing something
  over rather than by standing somewhere.

### The trap

**`EngagementStageStatusEnum` gains `CANCELLED`.** A cancelled milestone is one a recovery took out of the live agreement — a
vendor transfer or an early termination — and it **keeps its `amount_paise` and its whole funding
history**, because the agreement was that big and the money was collected. Two consequences for a
client:

- a `switch` over stage status that was exhaustive at 1.30.0 is not exhaustive now, on **both**
  archetypes: the enum is shared, even though only A5 can currently produce the value;
- a cancelled milestone carrying `cancellation_reason_code: material_advance_left_with_vendor` is
  **not going to be refunded**, ever, by any command. Render it as an open question for support.
  Showing it as a pending refund promises something nothing in this system will do.

### The second trap, which is a field name

**`milestone_label`, not `label`.** `label` is DRF's own `Serializer` attribute and a field of that
name shadows it — mypy refuses the assignment and DRF resolves it at random. Wave C4 hit exactly
this with `ShiftDay.day_label` and it is recorded again because `label` is the obvious guess. Its
frozen twin is `original_milestone_label`, so the pairing stays mechanical: every "as agreed"
reading is `original_` plus the current field's own name.

### New paths

| Path | operationId |
|---|---|
| `GET /engagements/{engagement_id}/project/` | `m2_project_read` |
| `POST /engagement-stages/{stage_id}/delay-claim/` | `m2_project_delay_claim_raise` |
| `POST /project-delay-claims/{delay_claim_id}/decision/` | `m2_project_delay_claim_decide` |
| `POST /engagements/{engagement_id}/handover/` | `m2_project_handover_submit` |
| `POST /engagements/{engagement_id}/handover/acceptance/` | `m2_project_handover_accept` |
| `POST /engagements/{engagement_id}/transfer/` | `m2_project_transfer_propose` |
| `POST /project-transfers/{project_transfer_id}/decision/` | `m2_project_transfer_decide` |
| `POST /engagements/{engagement_id}/termination/` | `m2_project_terminate` |

### One read, not five

`m2_project_read` returns the milestone list, the money, the warranty retention, the handover and
whatever recovery is in flight, together — the same reasoning `m2_shift_day_read` gives on the
other archetype. They are one screen at five moments of one project, and a client assembling them
from five endpoints renders four of them against a state the fifth has already left.

It refuses with `m2_stage_transition_not_allowed` on an A3 engagement, exactly as the shift-day
read refuses on an A5 one. The archetype is the guard, server-side, in both directions.

**Every milestone carries two readings** (`M2-BE-549`). The `original_*` fields are what was agreed
when the estimate was selected; the plain fields are what stands now; `schedule_shift_days` is the
difference in days, computed server-side because a date difference computed in a browser is a date
difference in whatever timezone that browser is in. A project screen that can only say what is due
now is useless in the argument it exists for.

`ProjectMilestone.status`, `.kind` and `.funding_state` are `ChoiceField`s over the components
published since 1.24.0, not bare strings — the same gap 1.30.0 closed on `CrewOffer.status`. They
reuse `EngagementStageStatusEnum`, `EngagementStageKindEnum` and `EngagementStageFundingStateEnum`
rather than splitting new ones.

### The delay claim carries no money, and cannot

`DelayClaimCreateRequest` has a `reason_code`, a `description`, `extension_days` and evidence ids.
There is no amount on it, and none on `ProjectDelayClaim` either. A delay that costs money is extra
work, and extra work is a scope amendment at `POST /engagements/{id}/amendments/` which the
Customer accepts and pays for. One record that could do both would let "the site was locked on
Tuesday" arrive as a bill.

Evidence is the stage's **own** `StageEvidence` rows, uploaded through the rail that already exists
(`POST /engagement-stages/{id}/evidence/uploads/`, then the finalize call). That endpoint now
accepts uploads on a `PENDING` stage as well — a customer-caused delay is a claim about work that
never started, and refusing evidence until it starts would make the one claim that most needs a
photograph the one claim that cannot carry one.

Accepting shifts **this milestone and every one after it**, because a project is a sequence. A
milestone with no date is left without one rather than given one. **Silence expires the claim
rather than granting it** — `sweep_delay_claims`, every 15 minutes.

### The transfer settles its delta structurally, and has no checkout

`m2_project_transfer_propose` is Operations; `m2_project_transfer_decide` is the **Customer**, and
that split is the point — their remaining cost changes, and
[07 §7](../../Django_Next.js_Plan/M2/07-state-machines-and-permissions.md) does not let Operations
change somebody's agreement for them.

The replacement prices **every unfinished milestone individually**. A vendor who names one number
for "the rest of it" has not said which of the agreed milestones they are doing. Read the list to
price from `m2_project_read`: every milestone whose status is `PENDING`, `IN_PROGRESS`,
`AWAITING_REVIEW` or `CORRECTION_REQUESTED`, **excluding** a `MATERIAL_ADVANCE` that has been
funded.

On acceptance, in one transaction: every transferable milestone refunds what the Customer funded
and the abandoning vendor never earned, drops back to `REQUIRED`, and is repriced to the
replacement's number; `amendment_delta_paise` moves by exactly the difference so
`staged_total = total + amendment_delta` still holds by constraint. **So there is no transfer
checkout and no new payment purpose.** The money asked for afterwards is the ordinary stage funding
that was always going to be asked for, at a price the Customer accepted before any of it moved.
That is what stops anybody paying twice.

Two things a client must handle:

- **the engagement returns to `PENDING_START` and `work_may_start_at` is cleared.** The replacement
  has nothing funded and no clearance. Fund the first milestone at
  `POST /engagement-stages/{id}/funding/` exactly as at the start of the project;
- **a disputed milestone blocks the whole transfer** with `m2_stage_disputed`, at proposal **and**
  again at acceptance. Decide it at `POST /engagement-stages/{id}/dispute/decision/` first.
  Transferring around a dispute would close the objection by moving it out of the agreement.

### Warranty retention, and why `COMPLETED` is not always what you get back

`m2_engagement_completion_accept` is unchanged in shape and has three new refusals — an open stage,
a disputed stage, and a **submitted handover the Customer has not accepted**. That last refusal is
the entire mechanism keeping Event and Media delivery on the platform: a vendor who hands over
privately has an engagement that will not close and a retention that will not release.

**Read `status` from the response rather than assuming the transition you asked for.** An A5
engagement that withheld retention moves straight to `WARRANTY`, not `COMPLETED`, and
`warranty_ends_at` on the project read says when the hold-back releases and the engagement becomes
`CLOSED`. An engagement with no warranty is terminal at `COMPLETED` and never reaches `CLOSED` —
that status means "the warranty period is over", and a status meaning two different things
depending on the variant would be worse than one fewer status.

Retention is **payout-side money**. The Customer still funds every milestone at face value; what it
changes is how much of an approved milestone the vendor may draw before the warranty is over. It
is allocated against the cumulative approved total, the way commission has been since 1.25.0,
because "hold it back from the final milestone" stops being computable the moment an amendment
appends one.

### Two owner-blocked values, both failing closed

`warranty_retention_basis_points` and `warranty_window_days`, per variant. Unset, **an A5 estimate
that carries `warranty_terms` is refused at submission** with `m2_policy_unavailable` — this is a
new refusal on the existing `m2_proposal_create`, and it is `M2-BE-546`'s rule stated where it can
still be acted on: a variant either funds retention or does not advertise warranty. An estimate
with no warranty terms is unaffected and always has been; this refuses a claim, not a quote.

`manage.py seed_m2_demo` writes both (5% held for 90 days, invented, marked as dev-only), so the
walkthrough runs.

### Also in this release

`m2_project_terminate` ends a project with milestones outstanding and no replacement. It carries
**no remedy** — no penalty, no forfeit, no compensation — because who owes whom what when a project
ends early is the cancellation policy engine in Wave C6. What it does is return money nobody
earned, which is the absence of a remedy rather than one. A funded material advance is not returned
and not clawed back: the vendor spent it on goods.

### Three shift-day defects closed with it, reported by the frontend columns against 1.30.0

All three are on A3's surface rather than this wave's, and all three are one file deep. Leaving
them would have made the workarounds permanent.

**`DaySettlement.upi_payment_link` had no writer on the read path — and this is the fourth
reader-with-no-writer in four waves.** `DaySettlement` has no such column; the value is computed by
`workforce.upi_payment_link`, and the only thing that ever populated it was a manual injection into
the settlement *command's* response body. So the deep link was **absent before the tap and gone
after a reload**, never appearing on `m2_shift_day_read` — the screen a Customer actually opens in
the evening — even though that response declared the field. DRF made it invisible rather than loud,
answering `null` for the missing attribute instead of raising, so nothing failed and the one
convenience `M2-BE-536` exists to offer simply was not there. It is now a `SerializerMethodField`
on the serializer itself, so both surfaces get it and there is no second place to forget.
**The wire shape is unchanged** — `string`, `nullable`, `readOnly`, exactly as at 1.30.0. The shape
was always right; only the value was missing. No client change is needed, and a client that
special-cased the absence can stop.

**`DaySettlement.shortfall_choice` excluded its own resting value.** The column is `blank=True` and
rests at `""` — no shortfall, nothing chosen — but the response rendered it from
`ShortfallChoice.choices`, which does not contain the empty string. Every settlement that never had
a shortfall therefore carried a value the schema called impossible. It is now
`oneOf: [ShortfallChoiceEnum, BlankEnum]`, which is a **widening of an existing property** and the
third thing on this page a client should look at: a field typed as the bare enum now types as a
union, and `BlankEnum` is already in the schema so no component is added. The **request** shape has
had `allow_blank=True` since 1.30.0; only the response was wrong.

**`MAXIMUM_DISPUTED_WORKERS` was enforced and published nowhere.** `worker_details` on
`ShiftAttendanceResponseRequest` is capped at 40 server-side and the bound existed only as a `400`
a client discovered by hitting it. It is now published — as a `description` rather than `maxItems`,
because `max_length` on a DRF `ListSerializer` is enforced at runtime and drf-spectacular emits no
`maxItems` for it. The number is imported from the domain rather than retyped, so the published
bound and the enforced one cannot drift.

## 1.30.0 - The shift-day: who came, what it is worth, and who says it was paid

**Wave C4 ([ADR-0009](../../docs/adr/0009-m2-rate-card-instant-dispatch-for-a3.md)).** Ten new
paths on the far side of 1.29.0's booking fee. Entirely additive — nothing published before is
removed, renamed or reshaped, verified by diffing every component name and path against the
committed contract before publishing.

### Why

1.29.0 got a crew confirmed at a published price. This is the week that follows: the days
themselves, the named people on each one, the supervisor's count at seven in the evening, the
Customer's one tap on it, and the amount the two of them settle between themselves.

### New paths

| Path | operationId |
|---|---|
| `GET /engagement-stages/{stage_id}/shift/` | `m2_shift_day_read` |
| `POST /engagement-stages/{stage_id}/crew/` | `m2_shift_crew_assign` |
| `POST /engagement-stages/{stage_id}/arrival/` | `m2_shift_arrival_confirm` |
| `POST /engagement-stages/{stage_id}/attendance/` | `m2_shift_attendance_confirm` |
| `POST /engagement-stages/{stage_id}/attendance/response/` | `m2_shift_attendance_respond` |
| `POST /engagement-stages/{stage_id}/settlement/` | `m2_shift_day_settled_confirm` |
| `POST /engagement-stages/{stage_id}/extras/` | `m2_shift_extra_propose` |
| `GET`/`POST /engagements/{id}/safety-incidents/` | `m2_safety_incident_list` / `m2_safety_incident_report` |
| `POST /engagements/{id}/cash-demand/` | `m2_cash_demand_report` |
| `POST /operations/safety-incidents/{id}/decision/` | `m2_safety_incident_decide` |

New components: `ShiftDay`, `StageCrewMember`, `StageCrewList`, `CrewAssignRequest`,
`ShiftAttendance`, `ShiftAttendanceRecordRequest`, `ShiftAttendanceResponseRequest`,
`DisputedWorkerRequest`, `DaySettlement`, `ShiftExtraRequest`, `SafetyIncident`,
`SafetyIncidentList`, `SafetyIncidentReportRequest`, `SafetyIncidentDecisionRequest`,
`CashDemandReport`, `CashDemandRequest`, plus eight named enums.

`PartnerBusinessProfile` gains **`upi_vpa`**, readable and writable on the existing
`m2_partner_business_profile_read` / `_replace` pair. It is the lead's own UPI ID and it is
deliberately not on the payout account: that table is where Vsolve pays somebody, this is where
somebody else pays them, and a collection handle in the payout table is the first step to a
settlement job finding it.

### Everything hangs off a **stage**, not the engagement

An A3 stage **is a shift-day**. Assignment is per stage because a four-day job legitimately has a
different gang on day three, and a per-engagement roster would either forbid that or record a lie
about who was there. `ShiftDay.scheduled_on` is the day, and it is now written when the engagement
opens — until this wave it was null on every A3 engagement, which made the whole crew surface
unreachable.

### The two traps a client would otherwise step in

- **`ShiftDay.attendance` and `ShiftDay.settlement` are `null` until a command touches the day**,
  and that is a real state rather than a missing one. Reading a shift-day creates nothing. Render
  "nothing recorded yet" rather than treating `null` as a load failure.
- **`ShiftDay.day_label`, not `label`.** `label` is DRF's own `Serializer` attribute and a field of
  that name shadows it. The shift-day's name ("Day 3") is therefore `day_label`.

Two further shapes worth reading before building against them. `StageCrewMember.membership_id` is
**`null` for the Customer** and populated for the Partner — crew identity is global, and the global
`crew_member_id` is published to nobody. And `ShiftExtraRequest` has **no amount field**: the vendor
says what and how much of it, the server prices it from the card frozen at booking.

### Money, said plainly, again

**No path in this release moves money.** `DaySettlement.amount_paise` is the published figure the
two parties exchange peer-to-peer — present workers at the day rate plus extras both sides accepted
through the amendment engine — and `upi_payment_link` is a deep link into the Customer's own UPI
app at that amount. A convenience, not a rail; `null` whenever the lead has published no VPA, which
is an ordinary state. There is no checkout, no funding call and no payout release on the A3
shift-day path, and none may be added.

`m2_shift_day_settled_confirm` records **who tapped** and nothing else. One tap leaves the row at
`SUPERVISOR_CLAIMED` or `CUSTOMER_CLAIMED`, which is what Operations reads as *unproven* — a
different sentence from either "they were paid" or "they were not". Only both taps make `SETTLED`,
and the amount freezes there.

### Error codes reachable for the first time

- `m2_crew_conflict` — the cross-agency one. The same **person**, promised through two agencies on
  one date, is refused here and by a partial unique index, so two supervisors tapping at the same
  instant cannot both win. Also raised for an unverified worker and for a declared day off.
- `m2_crew_roster_required` — the progressive gate, at the first assignment rather than at
  registration.
- `m2_amendment_required` on a shift extra — this booking publishes no overtime or add-on rate (the
  quote-flow fallback never published one), or the retroactive overtime window has closed. Overtime
  outside the window is **unpaid**, which is the rule and not a failure.
- `m2_policy_unavailable` on a **retroactive** overtime request while the owner has set no window.
  Overtime proposed while the shift is still running is unaffected. This is the only owner-blocked
  value in the wave that refuses a command; the standing thresholds refuse nothing and simply mean
  no demotion and no removal fires while the events accumulate.

`m2_booking_fee_payment_pending` is **still declared and raised by no path** — unchanged from
1.29.0 and recorded again rather than quietly removed.

### Five corrections to the 1.29.0 A3 surface

Four were logged against C2R by the Partner column and one was found here. They ship in this
release because they are all one file deep and leaving them would make the frontend build its
workarounds permanent.

**1. `BookingFee.OFFER_ACCEPTED` now has a writer.** §4c draws the fee starting at
`OFFER_ACCEPTED`, and no path persisted it: `accept_crew_offer` wrote no row and the checkout built
one straight into `PENDING`. So `RateCardState.booking_fee` was **`null`** between a lead taking the
job and the Customer paying, and a client gating its pay button on that status could never offer
it. The charge itself was never blocked — `checkout_available` keys on `booking.status ==
OFFER_HELD` and tolerates a missing fee row — but **`m2_booking_fee_cancel` was**, refusing with
"There is no booking fee on this request" in exactly the window it was written for. Accepting now
opens the fee in `OFFER_ACCEPTED`; a lapsed hold releases it as `FAILED` with
`failure_code: "offer_hold_released"`, so it never blocks the next lead. **Clients should now
expect `booking_fee` to be non-null from acceptance onward, and should still gate the pay button on
`checkout_available` rather than on the status.**

**2. `m2_crew_offer_accept` no longer returns the Customer's money to the lead.** It returned
`RateCardBooking`, which carries `total_customer_paise`, `booking_fee_paise` and `day_rate_paise` —
the three numbers the crew-offer *list* is scrupulous about withholding. The discipline was resting
on the client choosing not to render them. The response is now **`CrewOfferAccepted`**: the same
job at the lead's own disclosure — headcount, days, `lead_day_receipt_paise`,
`lead_receipt_paise`, the day length, the overtime and add-on rates, the inclusions and
`hold_expires_at`.

> **This is the one response-shape change in 1.30.0 and it needs a client regeneration.**
> `RateCardBooking` is **not** removed or renamed — `m2_rate_card_read` still returns it to the
> Customer, whose booking it is. Only which schema the *accept* operation answers with has changed.

**3. `CrewOffer.status` is published as `VendorInvitationStatusEnum`** instead of a bare string. The
enum has been in the schema since 1.21.0; the field simply failed to say which vocabulary it spoke.

**4. `CrewOffer.decline_reason_code` — new.** A decline confirmation could only show what the client
sent, not what the server recorded. Empty on a live offer.

**5. `crew_offer.view` / `.accept` / `.decline` join the A3 workspace actions.** The partner crew-offer
screen was mounted behind `enquiry.accept`, which is correct today and wrong the day Operations
wants to stop offering instant crew without also stopping quote enquiries.

## 1.29.0 - The A3 front door: a published rate, a crew offer, a booking fee

**Wave C2R, revision 4 ([ADR-0009](../../docs/adr/0009-m2-rate-card-instant-dispatch-for-a3.md)).**
Ten new paths and the aggregates behind them. Entirely additive — the A3 unlock surface published
at 1.24.0 is untouched and keeps working, demoted to the thin-supply fallback rather than removed.

### Why

Day labour is a commodity at a street rate the whole market already knows. Quote-first made a
customer wait 72 hours and pay a paywall to compare numbers the street agrees on, and it left the
on-site renegotiation — "third floor, no lift? Extra, bhaiya" — nowhere to be caught. The unit of
value is a confirmed crew at a published price, so Operations publishes the price and the platform
sells the booking.

### New paths

| Path | operationId |
|---|---|
| `GET /requirements/{id}/rate-card/` | `m2_rate_card_read` |
| `POST /requirements/{id}/rate-card/book/` | `m2_rate_card_book` |
| `POST /requirements/{id}/booking-fee/checkout/` | `m2_booking_fee_checkout_create` |
| `POST /requirements/{id}/booking-fee/cancel/` | `m2_booking_fee_cancel` |
| `POST /requirements/{id}/crew/arrival/` | `m2_crew_arrival_confirm` |
| `POST /requirements/{id}/crew/no-show/` | `m2_crew_no_show_report` |
| `GET /partner/crew-offers/` | `m2_crew_offer_list` |
| `POST /partner/crew-offers/{invitation_id}/accept/` | `m2_crew_offer_accept` |
| `POST /partner/crew-offers/{invitation_id}/decline/` | `m2_crew_offer_decline` |
| `GET`/`POST /operations/rate-cards/` | `m2_rate_card_list` / `m2_rate_card_publish` |

New components: `RateCard`, `RateCardList`, `RateCardPublishRequest`, `RateCardState`,
`RateCardBooking`, `RateCardBookingStatusEnum`, `RateCardBookRequest`, `RatePreview`, `BookingFee`,
`BookingFeeStatusEnum`, `CrewOffer`, `CrewOfferList`, `CrewOfferDeclineRequest`,
`CrewOfferDeclineReasonCodeEnum`.

Crew no-show deliberately **reuses** `VisitNoShowPartyEnum` rather than naming a fifth enum: the
party that failed to appear is the same question with the same two answers, and a second
vocabulary for it is how two names for one fact start disagreeing.

### Error codes reachable for the first time

- `m2_rate_card_unavailable` — no live card for this city and skill. **Fail-closed**: no card means
  no instant booking, never a guessed price. Also raised when the area carries no `state_code`,
  because the wage-floor check cannot run without one and a guard that silently skips is
  indistinguishable from one that passed.
- `m2_roster_insufficient` — the lead's verified roster is smaller than the requested headcount.
- `m2_booking_fee_not_chargeable` — no accepted offer is being held, so there is nothing to pay for.

`m2_booking_fee_payment_pending` is **declared and not yet raised by any path**. Its description
claims it is the refusal returned while a charge is unresolved; nothing returns it today. Recorded
here rather than quietly removed, because the client contract already mentions it — see the C2R
entry in `frontend-execution-plan.md` §7.

### Money, said plainly

The booking fee is the **only** money Vsolve collects on the A3 rate-card path. Wages are paid
direct, daily, peer-to-peer at day end and the platform never holds them — no endpoint here moves
wage money, and none should be added. `RateCard` publishes the three components separately
(worker day-wage, supervision margin, platform booking fee) precisely so both disclosure screens
can show what the customer is paying for without either side inferring it.

## 1.28.0 - The requirement flow can find the variant it needs

**One new field on `ServiceDetail`, and it is the other half of 1.27.0's fix.**

1.27.0 got M2 services into the catalog and onto their own pages. Opening one still landed on
**"We do not take requests for this yet"** over a service that was fully configured to take them.

### Why

`ServiceDetail.variants` is built from `_public_variants`, which filters
`booking_archetype=A1_TASK_VISIT` — it is the **A1 task list**, and the booking workspace turns
each row into a priced task line. `/requests/new/[service]` resolved its variant by searching that
list for an A3 or A5 archetype, which it could never contain. So the flow found nothing, and its
honest empty state fired on a service that was not empty.

### `ServiceDetail.requirement_variants` — new, required

`RequirementVariant[]`: `{id, code, name, description, fulfilment_archetype, questions}`. Empty for
ordinary A1 work.

**Deliberately not `ServiceVariantConfiguration`.** That shape carries `starting_price`,
`minimum_service_subtotal` and `task_lines`, all read from annotations only the priced selector
adds — serializing an M2 variant through it raises `AttributeError`, and it would be the wrong
shape if it worked, because a variant priced by vendor quote has no money fields to publish.

`questions` is the load-bearing part. Screen 1 of the four-screen flow renders exactly those rows
and `submit_requirement` validates the answers against the same authored schema, so a variant
published without them is a first screen with nothing to ask.

The client's `RequirementVariant` type was aliased to `ServiceVariantConfiguration` and typechecked
only because the flow was never handed a real M2 variant. Both halves are corrected together.

## 1.27.0 - The catalog can offer a service it cannot price

**No new path. One field added, one field made nullable — and it fixes a defect that made every M2
service invisible and every M2 service page a `404`.**

### The defect

`public_services_for_category` gated on `has_current_rate`. That is the M1 rule and it is correct
for A1: a task nobody has priced must not appear bookable. **An A3 or A5 service has no
`ServiceRate` by design** — its price is the vendor's quote — so the gate excluded every M2 service
from the catalog. `public_service_by_slug` carried the same rule as `if not public_variants: raise
NotFound`, so the service *pages* answered `404` too.

Nothing was wrong in the data. With the demo seed loaded, `workforce-and-projects` was an active
category containing two `ACTIVE` services, with active variants and `ACTIVE` M2 configurations, and
`public_services_for_category("workforce-and-projects")` returned `[]`.

The rule is now **"a service is offerable when it can be priced *or* when it can be asked about"**,
in one shared `_offerable_services()` that all three listing selectors use. `README.md` §"Customer,
Partner and Operations surfaces" is explicit that this is one catalog and the archetype chooses the
action, so the fix belongs in the gate rather than in a second M2-only listing.

### `ServiceCard.request_archetypes` — new, required

`string[]`. The guided-requirement lifecycles this service accepts: `["A3_TIME_BLOCK"]`,
`["A5_CUSTOM_PROJECT"]`, both, or **`[]` for ordinary A1 work**.

This is the field `M2-FE-201` has been asking for since 12 August. A client could not tell an M2
service from an A1 one: `bookable_variant_id` is the A1 path and there was nothing for the other, so
the category picker offered every service and the next screen told the Customer we do not cover this
one. Non-empty means render "Tell us what you need"; empty means "Check price and availability".

### `ServiceCard.starting_price` — now nullable

**This is a breaking read-shape change and clients must handle `null`.**

`null` is the honest answer for an M2 service, not a missing value: there is no rate, so there is no
number, and "starts at ₹X" would be one this platform invented. `bookable_variant_id` is already
`null` for the same services, so the A1 add-to-cart path stays closed by construction.

The guard is also a crash fix. `get_starting_price` called `min()` over the priced variants
unconditionally, which raises `ValueError` on an empty sequence. It could not fire while the gate
required a rate; widening the gate is what made an unpriced service reachable.

## 1.26.0 - M2 Wave C3.5: the defects Wave I found, and a demo that can actually be walked

**Three new paths and three new operations (78 M2 operations → 81), plus eight additive fields and
one breaking request-shape change, named below. No path was removed, no operation changed its
method or route, and no published schema component was renamed** — checked by diffing generated
component names against the committed contract, which is the standing check the 1.24.0 and 1.25.0
notes both ask for. 402 components → 410; nothing left the set.

This release closes defects rather than opening a phase. Three frontend agents built against 1.25.0
and logged thirty-four findings in `Django_Next.js_Plan/M2/frontend-execution-plan.md` §7; roughly a
dozen of them were the backend's, and they are answered here.

### The three new paths

| Path | Method | Operation |
|---|---|---|
| `/api/v1/requirements/{requirement_id}/vendor-cards/` | `GET` | `m2_vendor_card_list` |
| `/api/v1/requirements/{requirement_id}/quotes/{proposal_id}/questions/` | `POST` | `m2_customer_question_create` |
| `/api/v1/partner/questions/{question_id}/answer/` | `POST` | `m2_partner_question_answer` |

**`VendorCardSerializer` existed on no path.** The shape was built in Wave C2 and never wired, so
`M2-FE-419` — the A5 responding pool, before any visit is confirmed — had no data source and
rendered an honest empty state. The read is now published, on the disclosure ladder `README.md`
defines: verification badge, vendor type and a **distance band** for every responding vendor; the
vendor's **name once they hold a confirmed visit slot**, because somebody entering a home has to be
nameable; and **no contact details at any status**, which the engagement releases and the plan fee
does not. A3 answers `400 m2_lifecycle_not_supported` — its pre-unlock surface is the quote teaser,
and a second one would be a way around the unlock.

`distance_band_km` is the 5 km band the matcher ranked on, read back out of the invitation's own
`ranking_provenance` rather than recomputed. That is deliberate: a band recomputed on each read
would move as the vendor drives around, and a Customer would watch "12 km away" become "4 km away"
with nothing having happened. It is `null` when no fresh position exists for that vendor — the
ordinary case for an agency that never runs the technician app — and it is published as `null`
rather than filled with the pool median, because the median is a *ranking* device and printing it
on a card would state a distance nobody measured.

**No rating is published, and that is a decision rather than an omission.** `README.md` lists a
rating among the four pre-confirmation signals and this platform has no review model: `carts`'
professional card already refuses to publish one for exactly this reason. A star count invented in
a serializer would be the API deciding what a vendor's reputation is. The field arrives when a
review aggregate does; `M2-FE-401` and `M2-FE-419` should keep rendering the three signals that
exist.

**Clarification now runs both ways.** `M2-FE-409` asked for Customer-initiated clarification and
only the vendor could open a question. A Customer may now ask the professional behind one quote,
and the vendor answers on the mirror route. Two shape decisions:

- the question hangs off a **proposal**, not the requirement, so it reaches the vendor who wrote
  that quote — a question aimed at the pool is a broadcast nobody owns, and it reuses the existing
  non-nullable `RequirementQuestion.invitation` rather than making it nullable;
- it is **gated on the archetype's paywall** (`403 m2_unlock_required` on A3,
  `409 m2_visit_plan_required` on A5). Before the fee the vendors are deliberately not addressable
   — that is the whole teaser rule — so an ungated question would be a channel around it.

`RequirementQuestion` gains **`asked_by_role`** (`CUSTOMER` | `VENDOR` | `OPERATIONS`), because a
client with no direction field renders both halves of a two-way conversation as though the other
side started it. Derived by identity comparison against two non-null foreign keys, so each of the
three answers is a fact rather than an inference. Each answer route refuses a question its own side
asked: answering your own question is a monologue that closes the row before the counterparty sees
it.

### The material line — a product defect, not a missing field

`M2-FE-315` reported that material lines had no row shape and were being sent as **stages**, because
the wire carried exactly one money-carrying row type. A stage is a unit of evidence, approval and
release, so a bag of cement arrived as a fundable milestone somebody had to approve as work. That is
the thing `M2-BE-543` exists to prevent: *material money is spent, not earned, so it cannot be
recovered like an unearned work stage when a project ends early.*

- **`ProposalMaterialLine`** is published — `{title, quantity, unit, amount_paise}` — and
  `Proposal.material_lines` carries it on every proposal read. `quantity` and `unit` are there
  because "cement, 1,20,000 paise" and "cement, 40 bags at 3,000" are the difference between two
  quotes a Customer can compare and two they cannot; `unit` is free text because bags, cubic metres
  and running feet are all real and a closed vocabulary would refuse whichever trade nobody thought
  of. **Refused on an A3 quote** (`400 m2_proposal_invalid_shape`).
- **Reconciliation moved with it.** `_assert_a5_shape` now requires
  `Σ stages + Σ material lines == total_paise`. A material-only estimate is still refused: "we will
  buy materials and do no work" is not a project, and it is exactly the shape an advance-harvesting
  vendor sends.
- **`EngagementStage.kind`** is published — `WORK` | `MATERIAL_ADVANCE`. There is still one money
  spine (a second table for materials would be the duplication this plan forbids), and
  `staged_total_paise = total_paise` still holds by database constraint; what the column buys is the
  three places the two rows now genuinely differ:
  - material stages fund through **`PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE`**, which already
    existed and had no writer, instead of `M2_STAGE_FUNDING`;
  - they are laid out **after** every work milestone, because funding runs in position order and a
    project whose first collection is a materials advance is the prepay-then-vanish shape staged
    funding exists to prevent;
  - **`route_suspended_capability_engagements` no longer claws them back.** A funded, unstarted
    *work* stage still refunds when a capability is suspended; a funded material advance is flagged
    for replacement instead, because the vendor has bought the cement and refunding it automatically
    would be a cron job deciding a goods dispute.

  `kind` is immutable after creation, enforced in `save()` beside the existing `amount_paise` guard.
  There is no legitimate write: which recovery rule a row lives under is decided by the estimate the
  Customer selected.

### Small reads that were load-bearing

| Field | On | Why it was missing mattered |
|---|---|---|
| `service_name` | `EnquirySummary` | It landed on `EnquiryDetail` at 1.24.0 and not on the list, so the **Partner inbox** went on de-slugging `category_slug` into a title. |
| `timezone` | `SiteVisit` | A visit is booked against the same `carts.availability` grid `BookingWindows` publishes a zone for, and carried only an instant — so `formatVisitSlot` fell back to a deprecated Hyderabad-only constant. |
| `access_receipt` | `Engagement` | `M2-FE-418` asks the agreement screen for a receipt and there was nothing to link to. Carries the durable `M2A-` number already allocated for the A3 unlock or the A5 visit plan, in the `series-sequence` shape `TaxDocumentSerializer` publishes. **Not an invoice** — GST treatment of both access fees is blocking owner decision 5. `null` when no fee was charged, which is real: a plan covered entirely by a reclassification credit takes no payment. |
| `is_verified` | `QuoteTeaser`, `VendorCard` | **It was hardcoded `true`.** It now reads an Operations-approved `PartnerApplication`, which is what `assert_kyc_complete` gates the first accept on. A badge that is always on is not a badge, and it is one of four signals a Customer weighs before paying. |

**A funded total on `Engagement` was already closed** — `funded_total_paise` and its five siblings
shipped at 1.25.0. `M2-FE-608`'s note was written against 1.24.0; `packages/query`'s
`fundedTotalPaise` helper can be deleted in favour of the server's own column, which is a
constraint-checked number rather than a client sum.

### One breaking request-shape change

**`VisitNoShowRequest.reason_code` is now a required `VisitNoShowReasonEnum`.** It was an
unconstrained slug declared required with an empty default, so the Partner app sent it blank rather
than invent a vocabulary Operations would then have to report on (`M2-FE-314`). Six codes:
`NOBODY_ON_SITE`, `SITE_INACCESSIBLE`, `ADDRESS_WRONG`, `VENDOR_DID_NOT_ARRIVE`,
`CANCELLED_ON_THE_DAY`, `OTHER`.

They are about the **fact**, not the settlement. The settlement is decided by `party` and is not
something either side may nominate: a vendor no-show replaces the slot at no charge to the Customer,
and a Customer no-show still pays the vendor's visit payout because they travelled. A reason code
that could move money would be a refund button labelled as a dropdown. The model column stays an
unconstrained slug, because it also carries the platform's own writes from the sweeps.

**A caller sending `reason_code: ""` now gets a `400`.** Regenerate the client before calling this
route.

### Two defects found while wiring it, both live

**`select_for_update()` beside `select_related()` over a nullable foreign key is a `500` on
PostgreSQL** — `FOR UPDATE cannot be applied to the nullable side of an outer join`. Twenty-four
sites had it, covering most of the C2 and C3 money surface: `submit_proposal`, `create_unlock_checkout`,
`choose_visit_plan`, `complete_visit_plan`, `complete_plan_visit`, `report_visit_no_show`,
`select_proposal`, `reconfirm_selection`, `complete_stage_funding`, every amendment command, and
**two M1 commands in `fulfilment/amendments.py`** that Wave C3 broke by making `ScopeAmendment.booking`
nullable — an inner join became an outer one and the lock became illegal. Every site now locks
`of=("self",)`, which is what each of them intended: they lock the row they fetched and re-read
related state without needing it locked. Found by running the new seed and driving a walkthrough,
not by reading.

**An A5 plan visit could be rescheduled off its own grid reservation.** `schedule_site_visit` moved
`scheduled_for` and left the `assignments.Reservation` where it was, so the vendor's diary stayed
blocked at a time nobody was coming and open at the time they were — and the A1 checkout could
double-book the new slot that same afternoon without the exclusion constraint ever seeing it. A plan
visit now reschedules through the same grid it was booked on: check, release, re-take, in that
order, at the same width and preserving tentative-or-confirmed state so a reschedule cannot harden
a hold the Customer has not paid for. `409 m2_visit_slot_unavailable` when the new time is not free.
An ad-hoc A3 visit holds no reservation and keeps the simple move.

### Enum names

Three new components, all named in `ENUM_NAME_OVERRIDES` on arrival rather than after a rename
breaks a client: **`EngagementStageKindEnum`** — `kind` is now the most contested field name in the
schema at twelve choice sets — plus **`VisitNoShowReasonEnum`** and **`QuestionAskerRoleEnum`**,
both serializer-layer vocabularies published for the reason `InvitationDeclineReasonEnum` is: the
model column also carries the platform's own writes and constraining it would refuse them.

### Not in this release

- **The frontend client is not regenerated.** `frontend/packages/api-client/src/generated/**` is
  frozen and only the orchestrator regenerates it. **1.26.0 needs regeneration** before either
  frontend column can consume any of this — and the no-show change means an un-regenerated client
  will start receiving `400`s on that one route.
- **No rating**, for the reason above.
- **Contact disclosure and the callback flow** remain untouched, deliberately: both need an owner
  decision, and publishing a disclosure surface before that decision would be the product making it.

## 1.25.0 - M2 Wave C3: the engagement spine, one set of stage commands for both archetypes

**Fifteen new paths and sixteen new operations (62 M2 operations → 78). Additive only: no path was
removed, no operation changed its method or route, and no published schema component was renamed.**

Wave C2 created the `Engagement` and froze its terms; it deliberately left the **stage command
spine** absent rather than half-built. This is that spine, and it is built once. A stage is a
shift-day on A3 and a milestone on A5, and every command below is the same command for both. The
archetype changes only what those commands *refuse* and what money they move — never the route, the
shape or the state machine.

### The stage spine

| Path | Method | Operation |
|---|---|---|
| `/api/v1/engagement-stages/{stage_id}/` | `GET` | `m2_stage_read` |
| `/api/v1/engagement-stages/{stage_id}/start/` | `POST` | `m2_stage_start` |
| `/api/v1/engagement-stages/{stage_id}/evidence/uploads/` | `POST` | `m2_stage_evidence_upload_create` |
| `/api/v1/engagement-stages/{stage_id}/evidence/` | `POST` | `m2_stage_evidence_finalize` |
| `/api/v1/engagement-stages/{stage_id}/submit/` | `POST` | `m2_stage_evidence_submit` |
| `/api/v1/engagement-stages/{stage_id}/approve/` | `POST` | `m2_stage_approve` |
| `/api/v1/engagement-stages/{stage_id}/correction/` | `POST` | `m2_stage_request_correction` |
| `/api/v1/engagement-stages/{stage_id}/dispute/` | `POST` | `m2_stage_dispute` |
| `/api/v1/engagement-stages/{stage_id}/dispute/decision/` | `POST` | `m2_stage_dispute_resolve` |

`EngagementStage` gains the four money numbers and the two clocks the spine turns on:
`funded_paise`, `approved_amount_paise`, `released_amount_paise`, `refunded_amount_paise`,
`review_due_at`, `payout_release_due_at`, plus `correction_note`, `dispute_reason_code`, an
`evidence[]` array and five timestamps. **Both `*_due_at` fields are nullable and their nulls are
real policy states, not missing data**: no review window is configured, so this stage will never
auto-approve; no payout hold is configured, so its payout does not release on a clock. Render
nothing there rather than a countdown to a deadline nobody set.

**Starting.** `PENDING → IN_PROGRESS`, and `CORRECTION_REQUESTED → IN_PROGRESS` after the Customer
sends work back. A5 requires **verified funding at face value** (`409 m2_stage_not_funded`) — the
visit-plan money settles per share and never discounts a stage — so a funded A5 stage is already
`IN_PROGRESS` and `m2_stage_start` is an idempotent no-op on it.

**Evidence.** Presign, upload direct to storage, finalize. The server names the object key and
records the size, media type and SHA-256 it expects; finalization fetches the object back and
compares. `object_key` is never published — a storage path is an enumeration surface — and
`processing_status` lands `PENDING`, because "matches the checksum" and "is safe" are different
questions. `m2_stage_evidence_submit` then moves `IN_PROGRESS → AWAITING_REVIEW` and starts the
review clock. Its `note` is **required** and is stored as its own append-only evidence row, so a
correction cycle leaves both accounts readable: what the vendor said the first time, and what they
said after the Customer pushed back. Resubmitting restarts the review window from zero, because the
Customer is looking at different evidence.

**Approval and release.** `AWAITING_REVIEW → APPROVED`. On a managed (A5) engagement this writes
the vendor's earning **held** on the M1 payout rails and stamps `payout_release_due_at` — the
dispute window — and the money becomes payable when that window closes and the vendor's payout
account is verified. On `LEAD_ONLY` (A3) nothing is held because nothing was collected, so the
stage goes straight to `RELEASED`.

**Correction is not an amendment.** It asks for the agreed work to be done properly; it does not
change what the agreed work is, and it moves no money. A Customer who wants something different is
asking for a change order, which needs the vendor's agreement.

**Dispute stops only the disputed allocation.** Every other stage carries on and any payout already
released stays released. The engagement shows `DISPUTED` alongside and returns to `ACTIVE` when the
last disputed stage is resolved. `m2_stage_dispute_resolve` is Operations-only and offers two
outcomes, not three: a partial outcome is a scope amendment both sides accept, never an operator
quietly repricing a stage.

**The review timeout.** `AWAITING_REVIEW → APPROVED` on timeout, **except while the stage is
`DISPUTED`** — `409 m2_stage_disputed`. Enforced twice on purpose: a disputed stage has its
`review_due_at` cleared so the sweep cannot see it, and the command re-checks under the row lock,
because a Customer can dispute in the window between the sweep reading a list and the task acting
on one entry.

### Scope amendments — through the M1 engine, not beside it

| Path | Method | Operation |
|---|---|---|
| `/api/v1/engagements/{engagement_id}/amendments/` | `GET` | `m2_engagement_amendment_list` |
| `/api/v1/engagements/{engagement_id}/amendments/` | `POST` | `m2_engagement_amendment_create` |
| `/api/v1/engagement-amendments/{engagement_amendment_id}/accept/` | `POST` | `m2_engagement_amendment_decide` |
| `/api/v1/engagement-amendments/{engagement_amendment_id}/decline/` | `POST` | `m2_engagement_amendment_decline` |

A3 time extensions and A5 change orders are both scope amendments and both run on
`fulfilment.ScopeAmendment` — the same status machine, the same lines, the same expiry rule. M2 adds
two line kinds because an engagement has no catalog task to price from, which is the documented M1
boundary stated as an extension rather than worked around. **`ScopeAmendmentLineKindEnum` gains
`LABOUR_DAY` and `PROJECT_WORK`** (additive; existing values unchanged).

**The archetype fixes the shape and the pricing authority.** An A3 engagement takes a
`TIME_EXTENSION`, priced by the **server** from the worker-day rate frozen at reconfirmation: the
vendor names days, never money, because a vendor who could name the money could re-price a job the
Customer already committed to. An A5 engagement takes a `CHANGE_ORDER`, priced by the vendor line by
line, because a bespoke outcome has no catalog rate — and the server still sums the lines and
rejects any client-supplied total. Line `amount_paise` is **signed** on the wire: negative removes
scope. One live change request per engagement.

**Money before scope.** Accepting does not change the agreed work until the money has moved. The
response carries `checkout`, and its three states are the three routes:

- `null` on `LEAD_ONLY` (A3) — no platform money exists to move, so the amendment authorizes on
  acceptance and the extra shift-days appear immediately.
- `null` on a managed negative delta — the refund is issued against the stage's own funding payment
  **before** the scope shrinks, so there is no instant in which the Customer owns less work than
  they have paid for.
- A `PaymentAttempt` on a managed positive delta — and **nothing changes until a verified provider
  callback**. Repeating the acceptance while that payment is pending returns the same attempt
  rather than starting a second charge.

`PaymentAttempt.Purpose` gains **`M2_SCOPE_AMENDMENT`** (additive). Deliberately not
`SCOPE_AMENDMENT_REVISION`: that purpose's capture handler resolves a `PriceRevision` by `Booking`,
which an M2 engagement does not have, so reusing it would route an M2 payment into a lookup that
cannot succeed.

### The engagement, read back

| Path | Method | Operation |
|---|---|---|
| `/api/v1/engagements/` | `GET` | `m2_engagement_list` |
| `/api/v1/engagements/{engagement_id}/events/` | `GET` | `m2_engagement_event_list` |
| `/api/v1/engagements/{engagement_id}/completion/` | `POST` | `m2_engagement_completion_accept` |

`m2_engagement_list` is a cursor page over the caller's engagements. A `role` query parameter picks
Customer or Partner and defaults to whichever the caller can be, so one route serves both apps.

`m2_engagement_event_list` is the agreement's own history. `actor_is_system` separates a decision
somebody made from one a clock made — "approved by you" and "approved because the review window
closed" are different sentences, and a timeline that renders them identically is lying about who
decided. Actor identity itself is never published: the counterparty's user id is not the caller's
business.

`m2_engagement_completion_accept` is `COMPLETING → COMPLETED`, and it closes the requirement as
`CLOSED_COMPLETE` — the last transition in `07-state-machines-and-permissions.md` §1, which until
now had nothing to drive it. An engagement reaches `COMPLETING` on its own when every stage is
released; this is the separate fact that the Customer agrees it is done.

**`Engagement` gains six money fields**: `staged_total_paise`, `amendment_delta_paise`,
`funded_total_paise`, `approved_total_paise`, `released_total_paise`, `refunded_total_paise`, plus
`disputed_at` and `completed_at`. `staged_total_paise` always equals `total_paise +
amendment_delta_paise` **by database constraint**, so a client can render "agreed, then changed by,
now owed" without doing arithmetic the server has not already checked. `total_paise` never moves:
an accepted amendment moves the delta, so the number both parties originally agreed to stays
readable beside the number they now owe.

### New error codes

| Code | Status | Retryable | Meaning |
|---|---|---|---|
| `m2_stage_transition_not_allowed` | 409 | no | The stage is not in a status this command can move it from |
| `m2_stage_disputed` | 409 | no | A disputed stage does not move on a clock or on a Customer approval |
| `m2_amendment_required` | 409 | no | The change needs an accepted amendment (or the engagement carries no agreed rate to price one from) |
| `m2_amendment_not_actionable` | 409 | no | The change request expired, already has a decision, or one is already open |

`m2_stage_disputed` and `m2_amendment_required` are §8 codes.
`m2_stage_transition_not_allowed` and `m2_amendment_not_actionable` are new here, and follow the
rule the two Wave C2 additions established: a refusal whose recovery is genuinely different from
every published code gets its own, and the reason is written down rather than discovered later. The
first is distinct from `m2_requirement_transition_not_allowed` because a Partner reading "this
request cannot do that" about a shift-day is told about the wrong object entirely; the second is
distinct from `m2_amendment_required`, which says the opposite thing.

`m2_policy_unavailable` reaches two new places, and both are fail-closed by design:
`m2_engagement_amendment_create` refuses when the amendment response window is unset — an amendment
with no deadline is an open-ended claim on somebody's money, and `ScopeAmendment.expires_at` is not
nullable — and `m2_stage_approve` still succeeds when the payout-hold window is unset, but the
earning it writes then has no automatic release.

### One changed refusal on an existing operation

**`m2_proposal_submit` now checks that an A3 total reconciles.** `total_paise` must equal
`rate_paise_per_worker_day x worker_count x minimum_days`, refused with `400
m2_proposal_invalid_shape`. This was a real defect rather than a tidiness gap: an A3 engagement lays
out one stage per shift-day at `rate x workers`, so a vendor who quoted a total unrelated to their
own rate produced an agreement whose stages could never add up to it — and this release makes that
reconciliation a database constraint, which would have turned a bad quote into a 500 at
reconfirmation. Refused rather than silently derived, because a composer whose displayed total
quietly becomes a different number is worse than one that says which number is wrong, and the
wage-floor guard beside it only ever measured the *rate*.

### Enum naming: one rename prevented, four new sets named

Read this before adding a field over an existing choice set. The 1.24.0 note about `ReasonEnum`
happened again and was caught the same way.

**`ProcessingStatusEnum` is pinned in `ENUM_NAME_OVERRIDES`.** `WorkEvidence.ProcessingStatus` was
the only `processing_status` choice set in the schema, so it published as the bare
`ProcessingStatusEnum` — which M1 clients import. Adding a second `processing_status` field in this
wave made the generator disambiguate both and rename it to `WorkEvidenceProcessingStatusEnum`, a
break for an app that had not changed. Pinned, so the published name is unchanged.

**`StageEvidence.ProcessingStatus` is an alias of `RequirementAttachment.ProcessingStatus`, not a
copy.** One scan pipeline produces one vocabulary, and a second identical `TextChoices` would have
published a second identical component — which the generator resolves by renaming *both*, taking
`ScanStatusEnum` with it. Aliasing avoids the collision at the source instead of papering over it.

Four new sets named on arrival: `StageEvidenceKindEnum`, `EngagementAmendmentKindEnum`,
`StageDisputeReasonEnum`, `StageDisputeOutcomeEnum`. `kind`, `reason_code` and `outcome` are all
names another app will reuse.

### Also in this release, and not cosmetic

**`payment_attempt_simulate_capture` now works for checkout-free purposes.** Ownership used to be
resolved through the `CheckoutSession` alone, so every M2 charge — unlock, visit plan, stage
funding, and now amendments — was **impossible to capture through it at all**. That made the entire
M2 commercial flow undrivable by hand in development, which matters because `milestones.md` proves
every M2 money path with a provider test callback and this is the door those callbacks come through.
Ownership is now resolved against the M2 aggregate that actually records a customer; a purpose with
no resolvable owner is still refused, because a permissive default on a money endpoint is the wrong
direction to guess in.

## 1.24.0 - M2 Wave C2: the A3 unlock, the A5 visit plan, selection, reconfirmation and the engagement

**Fourteen new paths and nineteen new operations (43 M2 operations → 62). Additive only: no path
was removed, no operation changed its method or route, and one existing operation gained a `GET`.**

This is the commercially load-bearing wave. Every money path in it obeys one rule, and the whole
model rests on it: **only a verified provider callback grants anything.** A client redirect saying
"payment succeeded" is a claim made by the party that benefits from it, and no endpoint here reads
one. The checkout responses below tell you an attempt exists; whether the Customer *has* an unlock
or a charged plan is the `unlock` / `plan` object on the state read beside it.

### The A3 quote unlock

| Path | Method | Operation |
|---|---|---|
| `/api/v1/requirements/{requirement_id}/unlock/` | `GET` | `m2_unlock_read` |
| `/api/v1/requirements/{requirement_id}/unlock/` | `POST` | `m2_unlock_checkout_create` |

`GET` publishes `UnlockState`: the unlock in any state (or `null`), `is_available`, `price_paise`,
`usable_quote_count`, `can_read_full_quotes` and `server_now`.

**`price_paise` is nullable and that is a real state, not a placeholder.** The unlock price is
blocking owner decision 1, so `apps.requirements.pricing` reads it from an effective-dated
`M2AccessPrice` row and **fails closed** when none is loaded. The screen must say we cannot offer
this yet; it must not render INR 149. `POST` refuses the same case with `409
m2_access_price_unavailable`.

`POST` refuses unless at least one **usable** quote is live at that instant
(`409 m2_unlock_not_available`), and `400 m2_lifecycle_not_supported` on an A5 request. Repeating
it while a previous attempt is pending returns that attempt rather than starting a second charge.

### The A5 visit plan

| Path | Method | Operation |
|---|---|---|
| `/api/v1/requirements/{requirement_id}/visit-plan/` | `GET` | `m2_visit_plan_read` |
| `/api/v1/requirements/{requirement_id}/visit-plan/` | `POST` | `m2_visit_plan_choose` |
| `/api/v1/requirements/{requirement_id}/visit-plan/checkout/` | `POST` | `m2_visit_plan_checkout_create` |

One read serves both halves of the A5 flow. Before a plan exists it carries `available_tiers` — the
priced options for the review screen's chooser, and **an empty list is the honest answer** while the
owner has priced no tier. After one exists it carries the plan, its per-slot `shares` (each with
`amount_paise`, `vendor_payout_paise` and `platform_share_paise`) and the confirmed `visits` with
their scheduled times. Two endpoints would have let the chooser and the tracker disagree about which
plan the Customer has.

**Choosing charges nothing.** It bounds the invitation wave and snapshots the price the Customer was
shown, so a price loaded between choosing and the first vendor confirming cannot silently become
what they pay. Re-choosing is allowed until a vendor commits, and refused after
(`409 m2_requirement_transition_not_allowed`).

**The plan is charged once, at the first confirmed visit slot.** The checkout refuses with
`409 m2_visit_plan_not_chargeable` when no vendor holds a slot, when the plan is already paid for,
or when a reclassification credit covers it. The held slot hardens to `SCHEDULED` only on the
verified callback; if the Customer never pays, the hold lapses and **nothing was charged**.

### Candidate visit starts — the read the Partner slot picker depends on

| Path | Method | Operation |
|---|---|---|
| `/api/v1/partner/enquiries/{invitation_id}/visit-slots/` | `GET` | `m2_visit_slot_list` |
| `/api/v1/partner/enquiries/{invitation_id}/visit-slots/` | `POST` | `m2_visit_slot_confirm` |

`GET` returns `VisitSlotGrid` — `server_now`, `visit_duration_minutes`,
`availability_is_preliminary`, `timezone`, `days[{date, is_today, slots[{id, starts_at, ends_at,
is_available, unavailable_reason}]}]`. **The same shape as `POST /api/v1/booking/windows/` minus
`capacity`**, drawn from the same `carts.availability` snapshot and the same window loop, and
narrowed to the one invited vendor. `capacity` is dropped because on a single-vendor grid it is a
readout of that vendor's own diary depth.

Each `id` is a **signed token** bound to this invitation and this start, and it is the only thing
`POST` accepts — a vendor cannot book a time the grid never offered or a slot drawn for a
competitor. Tokens expire, so a picker left open must re-read rather than post a stale one. An
ineligible vendor gets a grid where every slot reads `NO_CAPACITY` rather than an error: that is the
truth and it is renderable.

`POST` **is A5 acceptance.** It takes the quote slot and the soft capacity hold, then a hard
reservation on the shared grid — so a visit and an A1 booking cannot double-book the same vendor, by
database constraint rather than by convention. `opens_plan_checkout: true` marks the confirmation
that opens the Customer's checkout; that visit reads `REQUESTED`, not `SCHEDULED`, until the payment
is verified. Refusals: `409 m2_visit_slot_unavailable` (gone, stale token, or a start in the past),
`409 m2_visit_plan_required`, `409 m2_capacity_unavailable`, `409 m2_invitation_slots_exhausted`,
`400 m2_lifecycle_not_supported`, `403 m2_kyc_required`.

### Visit arrival and no-show

| Path | Method | Operation |
|---|---|---|
| `/api/v1/site-visits/{site_visit_id}/arrival/` | `POST` | `m2_site_visit_arrival_confirm` |
| `/api/v1/site-visits/{site_visit_id}/no-show/` | `POST` | `m2_site_visit_no_show_report` |

Arrival uses the **non-OTP fallback as the default path**, not as a degraded one — the start OTP is
M3 activation — and `arrival_method` is stored so every historical arrival still says truthfully how
it was proved once OTP is switched on. Either party may confirm.

No-show: **you report the other party's absence, never your own.** A Customer reports `VENDOR`, a
vendor reports `CUSTOMER`; the reverse is refused. The two settle differently — a vendor no-show
costs the Customer nothing and the slot goes back to owing a free replacement visit; a customer
no-show still pays the vendor their visit payout, because they travelled, and only the platform
share is in question (`409 m2_policy_unavailable` while that owner decision is open).

`POST /site-visits/{id}/complete/` is unchanged on the wire and now dispatches internally: a plan
visit stamps `estimate_due_at`, the post-visit window an estimate must land inside.

### Reading, rejecting and re-validating quotes

| Path | Method | Operation |
|---|---|---|
| `/api/v1/requirements/{requirement_id}/quotes/` | `GET` | `m2_quote_list` |
| `/api/v1/requirements/{requirement_id}/quotes/{proposal_id}/reject/` | `POST` | `m2_quote_reject` |
| `/api/v1/requirements/{requirement_id}/quotes/{proposal_id}/revalidate/` | `POST` | `m2_quote_revalidate` |

`m2_quote_list` returns full quotes and estimates — scope, line items, stages, taxes, validity and
vendor identity — and **enforces entitlement rather than shortening the payload**: `403
m2_unlock_required` on A3, `409 m2_visit_plan_required` on A5. Contact details are absent at every
status; they are released by the engagement, not by the fee. `non_responsive_rejections_remaining`
is nullable, because the cap is an owner decision and a screen must not offer a replacement on a
rule that does not exist.

Rejection takes `reason` from `RejectionReasonEnum`. `NOT_CHOSEN` is bookkeeping. `NON_RESPONSIVE`
releases the vendor's slot and buys a replacement **at no extra charge** — a new quote slot on A3, a
free replacement visit on A5 — up to the configured cap (`409 m2_rejection_cap_reached`, or `409
m2_policy_unavailable` when the cap is unset).

Re-validation charges nothing and reuses the unlock or plan already paid for: **expiry must not be a
dead end that forces a second purchase.** The vendor answers by superseding; the expired revision
stays readable and stays unselectable, because only a vendor can state a price.

### Selection, reconfirmation and the engagement

| Path | Method | Operation |
|---|---|---|
| `/api/v1/requirements/{requirement_id}/selection/` | `GET` | `m2_selection_read` |
| `/api/v1/requirements/{requirement_id}/selection/` | `POST` | `m2_selection_create` |
| `/api/v1/selections/{selection_id}/reconfirm/` | `POST` | `m2_selection_reconfirm` |
| `/api/v1/selections/{selection_id}/decline/` | `POST` | `m2_selection_decline` |
| `/api/v1/engagements/{engagement_id}/` | `GET` | `m2_engagement_read` |
| `/api/v1/engagement-stages/{stage_id}/funding/` | `POST` | `m2_stage_funding_checkout_create` |

**Selection is not a booking.** It starts the vendor's reconfirmation clock (`reconfirm_by`), and the
engagement opens only when they commit. Multiple simultaneous selections are refused with `409
m2_selection_conflict` (retryable — the answer changes on its own).

Reconfirmation **re-checks everything**: the capability against this request's own area and start
date, the vendor's diary on the shared grid, and the quote's validity. `409
m2_reconfirmation_expired` also expires the selection in the same call, so the Customer is not left
waiting on a vendor who arrived a minute late.

If the vendor declines or the clock runs out, **the Customer's entitlement survives untouched** and
the next quote costs nothing more. The quote is marked `LAPSED`, never `REJECTED` — a rejection is
the Customer's refusal, and a vendor reading it against their own timeout would be told the wrong
story about their own standing.

`Engagement.commercial_mode` is the field the UI must read before it promises anything. `LEAD_ONLY`
(A3) means the Customer pays the vendor directly and Vsolve's protection is matching and
replacement — **not a protected booking**. `MANAGED_PAYMENT_REQUIRED` (A5) funds one stage at a
time, **at face value**: there is no stage credit, because the visit-plan money was spent on the
visits themselves and discounting a stage by it would pay for them twice out of the vendor's work.

### Eight §7 gaps closed in the same publish

1. **A Partner can read their own quotes back.** `GET /api/v1/proposals/` (`m2_proposal_list`), a
   cursor page scoped to the caller, with an optional `requirement` filter. Until now a vendor could
   submit a quote and reach it only by remembering its id, so withdraw, the six proposal states and
   the whole supersession trace ended when the tab closed.
2. **`quote_delivery_deadline_at`, `teaser_count` and `closure_reason` are now on `RequirementDraft`**
   as well as the list row, so `/requests/{id}` renders a countdown instead of a bare state.
3. **`service_name` on both requirement projections and on `EnquiryDetail`.** `My requests` was
   titling rows by formatting `category_slug`.
4. **`is_free` on `RequirementDraft`**, so the promise can be stated before the Send button rather
   than only on the submit response.
5. **`server_now` on `EnquiryDetail`** — the one read carrying a hard `responds_by`, previously
   counted down against a browser clock with no server reference beside it.
6. **`reason_code` on decline is a published vocabulary**: `InvitationDeclineReasonEnum`
   (`TOO_FAR`, `NO_CAPACITY`, `OUT_OF_SCOPE`, `BUDGET_TOO_LOW`, `UNCLEAR_SCOPE`, `OTHER`). It is
   constrained on the **serializer**, not the column: the same column also carries system reasons
   (`requirement_changed`, `non_responsive_quote`), so constraining the model would refuse the
   platform's own writes.
7. **`required_tax_basis` on `EnquiryDetail`.** Every quote on one requirement is forced onto the
   basis the first vendor used, and the second vendor could not see which.
8. **`ProposalStage` is a published shape** — `{title, deliverable, amount_paise, ends_on}` — on both
   `ProposalCreateRequest.stages` and every proposal read, replacing `unknown[]`. Reads are
   defensive (`label` accepted as a `title` alias) so a stage stored before this shape existed
   degrades to a blank title rather than a 500.

**`ProposalCreateRequest` also gains `site_visit_id`**, and this closed a defect rather than adding a
feature: `submit_proposal` has always taken one and no serializer published it, so **an A5 on-site
estimate could not be submitted over HTTP at all**. The A5 guard `409 m2_visit_not_completed` is
now reachable.

### New and renamed enums

Named on arrival, per the C1 rule that an unnamed choice set publishes positionally and its digits
move when an unrelated app adds a field with the same name: `QuoteUnlockStatusEnum`,
`VisitPlanStatusEnum`, `VisitPlanShareStatusEnum`, `ProposalSelectionStatusEnum`,
`EngagementStatusEnum`, `EngagementStageStatusEnum`, `EngagementCommercialModeEnum`,
`EngagementStageFundingStateEnum`, `VisitArrivalMethodEnum`, `InvitationDeclineReasonEnum`,
`VisitNoShowPartyEnum`.

`RejectionReasonEnum` is **pinned, not renamed**. Wave C2 added a second field over the same choice
set (`ProposalRejectRequest.reason`), and the generator resolved the collision positionally to
`Reason9ecEnum`. The override keeps the name published at 1.22.0 and gives both fields one
component.

**`ReasonEnum` is pinned for a sharper reason: without it, 1.24.0 silently renamed a published
component and broke an app that had not changed.** At 1.23.0 `assignments.DispatchCommandAudit.Reason`
was the only `reason` choice set in the schema, so it published as the bare `ReasonEnum` — which
`apps/admin/features/dispatch-recovery/model/commands.ts` imports by that name. Adding two more
`reason` fields made the generator disambiguate all three and rename it to
`DispatchCommandRequestReasonEnum`. It is now pinned to its original name. **Caught by
`pnpm typecheck` on regeneration**, which is the check that exists for exactly this.

### Two fields to know about when you regenerate

`RequirementSummary.service_name` and the four new `RequirementDraft` tracking fields are **required,
not optional**, so any hand-written fixture typed as those shapes needs them. Three existing fixtures
were corrected in the same change (`packages/query/src/m2-requirement.test.ts`,
`apps/customer/features/requirement/adapters/{draft,tracking}.test.ts`). `apps/partner` needs the same
treatment plus copy for the two new proposal states, `ACCEPTED` and `LAPSED` — that is Session B's
re-point, logged in `frontend-execution-plan.md` §7.

### Error codes reachable for the first time

`m2_unlock_not_available`, `m2_unlock_required`, `m2_visit_plan_required`,
`m2_visit_plan_not_chargeable`, `m2_visit_slot_unavailable`, `m2_visit_not_completed`,
`m2_rejection_cap_reached`, `m2_selection_conflict`, `m2_reconfirmation_expired`,
`m2_stage_not_funded`, and the two fail-closed codes this plan requires but §8 does not name:
`m2_access_price_unavailable` (no effective price is loaded — nothing can be sold) and
`m2_policy_unavailable` (a clock, cap or disposition rule was never decided). They are two codes
rather than one because the recoveries differ, and because an alert on the first means "we cannot
sell anything".

### Not in this publish

Contact disclosure and the callback flow are **deliberately absent**. Both need an owner decision,
and publishing a disclosure surface before that decision would be the product deciding it.

## 1.23.0 - M2 Wave C1 remainder: two schema corrections, a wage floor that can fire, and matching completeness

**Two corrections to declared shapes, four new paths, and several additive fields. No path was
removed and no operation changed its method or route.**

### The two list operations now declare the envelope they always sent

`m2_requirement_list` and `m2_partner_enquiry_list` declared `RequirementSummary[]` and
`EnquirySummary[]` and returned a DRF cursor-page envelope. **A client generated from the contract
threw on its first real request**, which is why both frontend columns carry hand-written narrowing
(`packages/query/src/m2-requirement.ts › readRequirementList`,
`apps/partner/features/enquiry/queries.ts › readEnquiryPage`). They now declare
`RequirementSummaryPage` and `EnquirySummaryPage` — `next`/`previous`/`results`, the shape
`BookingGroupPage` already established — so **the declared type finally matches what Django has
always put on the wire**. Those two compensating narrowings can be deleted.

Both also publish the `cursor` query parameter and refuse a malformed one with `cursor_invalid`,
through `common.pagination.StrictCursorPagination`. That closes a second gap: no cursor parameter
was published at all, so **a Partner with more than twenty enquiries saw a silently truncated inbox
with no way to page past it**.

### `POST /proposals/` can now return the refusal it documents

`m2_proposal_below_wage_floor` was documented and unreachable. The guard only ran when the caller
handed it a skill and a state code, and no HTTP caller did — **a below-floor A3 rate was accepted**.

Both inputs are now **derived from the requirement and never accepted from the caller**, so a vendor
cannot pick the classification with the lowest floor:

| Input | Source | Unmapped behaviour |
|---|---|---|
| Skill | `M2VariantConfiguration.wage_floor_skill` (new, nullable) | `409 m2_wage_floor_unavailable` |
| State | `ServiceArea.state_code` (new, blank) | `409 m2_wage_floor_unavailable` |

**This fails closed, and that is a live behaviour change**: until Operations maps a wage-floor skill
on the variant, sets a state code on the service area, and loads a `MinimumWageFloor` row for that
pair, every A3 quote is refused. Skipping the check silently is the defect being closed. A5
estimates are unaffected — an outcome price has no statutory daily floor.

`m2_wage_floor_unavailable` was previously documented under `400` on this operation; it has always
been a `409` in code, and the schema now says so.

### Accepting an enquiry consults the A1 booking grid

`m2_partner_enquiry_accept` gains `m2_capacity_unavailable` on its `409`. M2's own `CapacityHold`
and the M1 `assignments.Reservation` grid are two records of the same fact, and only the first was
read: **an agency could hold a Saturday A1 visit and accept a Saturday workforce enquiry**, with
neither record aware of the other. Both are now checked, at wave time and again at acceptance.

Acceptance and proposal submission also now pass the requirement's service area — and, for
acceptance, its start date — to `assert_capability_active`, so coverage and the vendor's own
published calendar are checked at the moment a slot is taken rather than only when the wave was
built.

### New paths

| Path | What it is |
|---|---|
| `POST /partner/capabilities/{id}/submit/` | The Partner's own submit and resubmit (`M2-BE-110`). `CHANGES_REQUIRED → UNDER_REVIEW` had no route, so a Partner who fixed exactly what was asked had no way to say so. Idempotent: already `UNDER_REVIEW` returns `200` unchanged. |
| `GET` / `PUT /partner/languages/` | The languages a vendor can work in (`M2-BE-301`). Matching excludes on a declaration that contradicts the requirement's language; **declaring nothing is never a mismatch**, so no existing Partner is dropped from a pool for never filling this in. |
| `PUT /partner/crew/{membership_id}/availability/` | A dated "this worker is off on the 14th". Exception-shaped, because the default for a day labourer is available and a weekly grid would demand a calendar nobody maintains. |
| `GET /partner/enquiries/{id}/attachments/` | The Customer's checked site photographs as short-lived signed links (`M2-BE-310`). |

### Attachment access expires with the invitation, and the snapshot does not copy attachments

`M2-BE-310`'s coupled decision, settled: **`RequirementSnapshot` freezes the answers and never the
attachments.** Access is resolved live from the invitation's state, so a vendor sees the
requirement's currently-`VERIFIED` files — a photograph that finished its malware scan after they
were invited becomes visible, and one that came back `INFECTED` never does. Freezing the list would
have shown a vendor a `PENDING` file that later turned out to be malware, or hidden a clean file
from the only person who needed it. Attachments cannot be added after `DRAFT` anyway, so the live
list can only gain scan verdicts on files the frozen answers already described.

Access holds while the invitation holds a quote slot and ends when it is declined, expired or
withdrawn; only the selected vendor keeps it. **Expiry is `has_access: false` on a `200`, not an
error** — the vendor still owns their enquiry record, and an empty list without that flag would read
as "the Customer attached nothing". No signed link is minted once access lapses, because a signed URL
is a bearer credential and hiding a button is not revocation.

### Additive fields

- `CapabilityOption.registration_questions` — the vendor-facing questions for a variant
  (`M2-BE-106`), from the **same versioned `M2VariantConfiguration`** the Customer's answers are
  validated against rather than a second question subsystem. Empty is the ordinary state.
- `CapabilityRequest.service_area_ids` and `.registration_answers`; `PartnerCapability.service_area_ids`
  and `.registration_answers`. An empty area set means "every area this Partner serves"; a non-empty
  one is an Operations narrowing and can only subtract from `PartnerServiceArea`, never add.
- `m2_partner_capability_request` gains `m2_business_type_invalid` on `400` for a failed registration
  answer set or an area the Partner does not serve.

### Ranking is no longer a stable sort on Partner id

`M2-BE-303`. Invitations are ordered on recorded signals: a vendor this Customer has engaged before,
then a coarse 5 km distance band, then least-recent invitation, then Partner id as the tie-break.
`MATCHING_POLICY_VERSION` is `2`, and the per-candidate signals are written into
`VendorInvitation.ranking_provenance` — which is **not published on any read**, because a vendor
must not learn their own ranking inputs. A Partner with no fresh location fix is scored at the
pool's *median* band, not last: sorting unknowns to the back would hand every enquiry to whoever
happens to run the technician app.

Two new exclusion reasons appear in provenance: `calendar_unavailable` and `travel_not_feasible`.

## 1.22.0 - M2 Wave C1: attachments, site visits, and the Partner registration surface

**Additive. 16 new paths, no existing operation changed. One new status value on an existing enum.**

Wave C0 opened the M2 door and left three rooms locked: a Customer could describe a job but not
attach a photograph of it, a paid site visit could be requested and never scheduled or closed, and
the entire Partner registration surface — every model migrated, every command tested since 10 August
— was unreachable over HTTP. This release is those three, plus the four background sweeps that were
selectors with nothing calling them.

### What is published

| Area | Paths |
|---|---|
| Attachments | `POST /requirements/{id}/attachments/uploads/`, `POST /requirements/{id}/attachments/`, `DELETE /requirements/{id}/attachments/{attachment_id}/` |
| Site visits | `POST /site-visits/{id}/schedule/`, `POST /site-visits/{id}/complete/` |
| Business identity | `GET` / `PUT /partner/business-profile/` |
| Capabilities | `GET /partner/capability-options/`, `GET` / `POST /partner/capabilities/`, `POST /partner/capabilities/{id}/withdraw/` |
| Insurance | `GET` / `PUT /partner/insurance/` |
| Progressive gates | `GET /partner/gates/` |
| Crew roster | `GET` / `POST /partner/crew/`, `PATCH /partner/crew/{membership_id}/`, `POST /partner/crew/{membership_id}/archive/` |
| Masked demand | `GET /partner/demand-preview/` |

### A rejection is now distinguishable from a withdrawal

**`PartnerCapability.Status` gains `REJECTED`.** Until now `_ALLOWED_TRANSITIONS` sent both
Operations' refusal and the Partner's own exit to `WITHDRAWN`, so the Partner app could not tell "we
said no" from "you closed this" and honestly said neither. `REJECTED` is Operations' refusal and is
reachable only from `UNDER_REVIEW` or `CHANGES_REQUIRED`; `WITHDRAWN` is the Partner's exit and
nothing else. Neither blocks a fresh request for the same variant — a terminal state that did would
be a permanent ban dressed as a status.

**This is a visible break for a client that switches on the status**, and deliberately so: an
unknown status should render as "we cannot describe this" and prompt an update, which is strictly
better than `WITHDRAWN` quietly meaning two things. The proposal preferred a computed
`last_transition.actor_kind` instead, and that option was rejected because
`PartnerCapabilityTransition.actor` is null both for a Partner's own action and for a system job — an
`actor_kind` derived from it would confidently mislabel the exact case the client needs right.
`last_transition` is published anyway, without `actor_kind`, because it dates the decision.

`review_notes` is now guaranteed non-empty for `CHANGES_REQUIRED` and `REJECTED`, by both a domain
guard and `partners_capability_review_state_needs_notes`. "We need a correction" without saying what
is the copy that sends somebody back to re-upload the document that was already right.

### Documents can expire, and absence of an expiry is not staleness

`PartnerDocument` gains a nullable `expires_on`, and the capability record publishes
`expired_document_kinds` and `documents_expiring_on`. Nullable is the answer rather than an omission:
a photograph of a government ID has no platform-tracked expiry and a police verification does, and a
non-null default would have been a policy guess about which kinds expire.

`assert_capability_active` now refuses when a document of a kind in
`PARTNER_REQUIRED_DOCUMENT_KINDS` has expired, reusing the existing `m2_capability_not_approved`
rather than inventing a code `07-state-machines-and-permissions.md` §8 does not list. **Nothing
changes for any existing Partner** — `expires_on` is null everywhere until somebody sets one.

### `INFECTED` is not `FAILED`

`RequirementAttachment.ProcessingStatus` gains `INFECTED`, which the frontend has modelled since
Wave B1 and the model lacked. A checksum mismatch is an upload going wrong and the recovery is "try
again"; malware is not, and the recovery is that the file is gone and no vendor ever saw it. One
status for both would have offered a retry button for the second case. `scan_failure_reason` is
published alongside so the Customer is told which.

Bytes never pass through Django. `POST .../attachments/uploads/` records what the client says it is
sending and returns a signed URL; `POST .../attachments/` streams the stored object back and refuses
anything whose size, media type or SHA-256 disagrees. Without the intent row, "verify the upload"
would mean "believe the client", and the client is the party whose file we are suspicious of.
Attachments are refused once the requirement leaves `DRAFT`: a photograph appearing after a vendor
quoted is a scope change arriving through the back door.

### The masked demand preview carries a preview id, not a requirement id

`GET /partner/demand-preview/` is sent to an account that has completed no KYC, and it applies the
teaser rules in the other direction: no customer name, phone, street address or exact budget, and
`area_label` is a locality. `id` is a keyed hash and is **not a `Requirement` primary key** — an
unapproved account holding real requirement ids is one lookup away from the record the moment any
endpoint accepts one, and "no endpoint accepts one today" is not a property that survives the next
endpoint. It is not even a UUID, so the path converters refuse it before a view runs.

Ineligible demand is returned with `is_eligible: false` and a hint rather than hidden. Hiding it
would make an empty screen the first thing most new Partners see; showing it as actionable would be
a lie. An empty list is a real answer and never a `404`.

### The crew roster publishes no global identity

`GET /partner/crew/` returns `membership_id` and never `crew_member_id`. Identity is global, and
handing the global id to one agency would let two agencies compare rosters and discover that a worker
is on both. `CrewMember` gains a four-digit `phone_suffix` and `phone_masked` publishes
`•••••• 4821` — the number itself is still never stored, so this is not a redaction of something we
hold but the whole of what exists, and four digits are what let a Partner tell two people called
Ramesh apart.

`POST /partner/crew/` answers **`201` for a new membership and `200` for a reinstated one**, so the
UI can say "we put Ramesh back on your roster" instead of silently succeeding on a name the Partner
thought was gone. `display_name` is read-only through the roster: one agency renaming a shared person
would rename them on every other roster.

### Gates explain themselves once, on the server

`GET /partner/gates/` publishes `KYC`, `PAYOUT_DETAILS` and `CREW_ROSTER` with the reason each is
asked for and the one action that clears it. The same strings arrive in the `403` from the refused
command, read from one table — two copies of that sentence drift the first time the rule changes.
The read is **advisory**: the commands enforce these at the moment they run, and a client treating it
as authoritative would block somebody whose KYC completed thirty seconds ago.

Four reads answer an account that holds the Partner role but has no `PartnerProfile` yet — a real
state lasting the thirty seconds between the two. `/partner/workspaces/`, `/partner/capabilities/`,
`/partner/crew/` and `/partner/gates/` all return empty rather than `404`, because a `404` on the
registration flow's own reads is a gate, and proposal 0013's first constraint is that no gate stands
before browsing demand.

### Site visits have two participants and both can move one

`POST /site-visits/{id}/schedule/` resolves by participation rather than by role: the vendor proposes
a slot they can travel in, the Customer confirms a time somebody will be on site. `complete/` is
Partner-only — completion is a report of what happened, and the party that travelled is the one who
can make it. A Customer who disagrees has the clarification timeline, not a competing completion.

### New error codes

| Code | Status | Retryable |
|---|---|---|
| `m2_business_type_invalid` | `400` | no |
| `m2_capability_already_requested` | `409` | no |
| `m2_attachment_invalid` | `400` | no |
| `m2_attachment_unavailable` | `503` | **yes** |

`m2_capability_transition_invalid`, which proposal 0013 proposed, is **not** published:
`CapabilityTransitionError` has emitted `m2_capability_transition_not_allowed` since 10 August, and
renaming a live code to match a proposal's guess at its name is a breaking change bought for nothing.

Three new named enums — `PartnerBusinessTypeEnum`, `ProgressiveGateEnum`, `GateNextActionEnum`.
`business_type` is the collision waiting to happen, being a name any future model will reuse.

### Behind the contract: four sweeps now have a schedule

Not an API change, and the largest correctness change in this release.
`expired_requirement_ids`, `sla_breached_requirement_ids`, `expired_invitation_ids` and
`expired_proposal_ids` existed as selectors with **no `CELERY_BEAT_SCHEDULE` entry**, so an
unanswered invitation wave stalled forever and a requirement whose needed-by date had passed was
never closed by anything. `apps/requirements/tasks.py` and five beat entries close that. Every sweep
is idempotent by state, and expiring an invitation invites its replacement inside the same
transaction and requirement lock — so a Celery re-drive cannot expire once and invite twice.

### Not in this release

The unlock checkout and state, the unlocked-quote read, selection, rejection and re-validation — all
of BE4, which has no domain layer to wrap yet. Attachment access still does not expire with a
non-selected vendor's invitation (`M2-BE-310`), and archiving a crew member does not refuse on a
future assignment (`M2-BE-522` has no stage model yet). Named here so their absence is documented
rather than discovered.

## 1.21.0 - M2 opens: the requirement, enquiry and proposal surface

**Additive. 17 new paths, no existing operation changed.**

The M2 domain layer had been built and tested for three phases — capabilities, requirements,
matching and proposals, 91 passing tests — behind no HTTP route at all. `apps/requirements` had
models, services and commands but no `views.py`, and `config/urls.py` did not include it. Every one
of the 108 M2 frontend tasks was capped at "built, not integrated" because of that one gap. This
release is the door on the room.

### What is published

| Area | Paths |
|---|---|
| Customer requirement | `POST/GET /requirements/`, `GET/PATCH /requirements/{id}/`, `POST /requirements/{id}/submit/`, `GET /requirements/duplicate-check/`, `GET /requirements/{id}/timeline/` |
| Quote teasers | `GET /requirements/{id}/quotes/teasers/` |
| Clarification | `POST /requirements/questions/{id}/answer/`, `POST /partner/enquiries/{id}/questions/` |
| Partner enquiries | `GET /partner/enquiries/`, `GET /partner/enquiries/{id}/`, `POST .../accept/`, `POST .../decline/`, `POST .../site-visits/` |
| Proposals | `POST /proposals/`, `GET /proposals/{id}/`, `POST /proposals/{id}/withdraw/` |
| Workspaces | `GET /partner/workspaces/` |

### The requirement is free, and the contract says so

Nothing in the requirement surface accepts a payment, quotes a price or implies one is coming.
`POST /requirements/{id}/submit/` answers `202` with `is_free: true` — read from the server that
enforces the rule rather than hardcoded in a screen, because a literal `true` in a component is a
promise that outlives the policy it describes. The unlock is a separate surface and arrives later.

### A teaser is not a quote

`GET /requirements/{id}/quotes/teasers/` is sent to a Customer who has paid nothing. Vendor name,
contact, scope, line items and the exact total are **absent from the response**, not merely
unrendered — a client cannot un-receive a payload, and cached identity survives a refund. The
serializer is an explicit field list rather than a `ModelSerializer` for exactly that reason: the
two are one `fields` edit apart, and only one of them fails safe.

The price *band* is what is published, plus `usable_quote_count` and `unlock_available`. The last
mirrors the server's own guard so the control can be disabled; the unlock command re-checks
independently, because a stale `true` is the state a duplicate purchase lives in.

### Workspaces authorise, they do not navigate

`GET /partner/workspaces/` returns `{workspace_key, commercial_mode, actions[]}`. No routes, no
labels, no icons — the backend authorises, the frontend owns presentation, and a key the client
does not recognise renders nothing rather than a generic tab. A Partner with no approved capability
receives `200 {"workspaces": []}`, never `403`: registered-but-not-yet-reviewed is a real and
common state and must not render as an error. Suspension is expressed by omitting a workspace or
reducing its `actions`, so navigation degrades in place instead of blanking mid-session.

`commercial_mode` is published rather than derived. ADR-0007 fixes A3 as `LEAD_ONLY` and A5 as
`MANAGED_PAYMENT_REQUIRED`, which makes inferring it from the key tempting and wrong: it is the
field that decides whether the UI promises Vsolve protection or tells a Partner to collect
directly, and a client that computes it keeps promising protection through a policy change.

### 404, not 403, wherever existence is private

Object-level authorization is per record. Another Customer's requirement answers `404` — a `403`
confirms there is a record there to find. The same holds for another Partner's enquiry or proposal.

### Progressive registration is enforced at the accept, not the browse

`POST /partner/enquiries/{id}/accept/` is where `m2_kyc_required` fires. A Partner browses masked
demand freely; proving identity is the price of taking a slot away from another vendor, not the
price of looking.

### Errors

The 29 `m2_*` codes now reach clients through the standard envelope with `code`, user-safe
`message`, `retryable` and a correlation id. `packages/api-client/src/errors.ts` already classifies
every one of them, so publishing changes no frontend code.

`m2_unlock_payment_pending` is settled as **`409`, retryable** — see proposal 0012's answered open
question. A `202` carrying an error body arrives at `openapi-fetch` as `data`, and the unlock screen
is the one place in M2 where reading a refusal as a success would show quotes nobody paid for.
`202` stays reserved for genuine acceptance and always carries a projection, never an error.

### Named enums

Eight M2 choice sets are named in `ENUM_NAME_OVERRIDES`, not only the two that collided on arrival.
An unnamed `status` is published as a positional `StatusD6aEnum` whose digits shift when an
unrelated app adds its own `status` — a silent rename of a component the frontend has imported.

### Not in this release

Attachment upload (`POST /requirements/{id}/attachments/`), the unlock checkout and state, the
unlocked-quote read, selection, rejection and re-validation. The attachment models exist but the
upload command does not; the unlock path is BE4 and has no domain layer yet. They are named here so
their absence is a documented gap rather than something a reader has to discover by 404.

## 1.18.0 - One start time per visit

**Breaking.** `POST /fulfilment-plan-sets/` replaces `preferred_start: datetime` with
`preferred_starts: [{group_key, starts_at}]`.

One time for the whole cart made "electrician on Monday, salon on Friday" inexpressible. The
planner derived every unit by cascading a single clock forward, so a Customer with two unrelated
services could only ask for them back-to-back on one day. Every group the server publishes must
now carry a start, and no group may carry two — a missing one is refused rather than defaulted,
because defaulting picks a time on the Customer's behalf for work they never scheduled.

### The grouping is published before the times

`POST /cart/scheduling-groups/` answers *how many* start times to pick, which the plan-set command
structurally cannot: it takes the times as input. The response is a projection over the grouping
the planner already computes from `ServiceCompatibilityRule`.

It deliberately **ignores Partner availability**. Merging asks two questions — "is this the kind of
work one Partner does in one visit?" and "is someone free at this exact time?" — and only the first
belongs to a slot picker. Including the second would split "Electrician" into two rows because
somebody called in sick, and merge them again an hour later, with nothing on screen to explain the
change. Staffing is still resolved at plan time, where a group no single Partner can cover falls
back to independent visits at the chosen start.

`scheduling_groups_changed` (409) is the refusal when the submitted keys are not the visits the
cart currently makes. Group keys are derived from membership, so editing the cart invalidates them
by construction. Not repaired: re-deriving and reassigning would move a visit to a slot nobody
agreed to.

### Cart suggestions

`POST /cart/suggestions/` returns catalog `ServiceCard`s for variants carrying an active
`SAME_PARTNER_SEQUENTIAL` rule against something already in the cart — the same rule the planner
uses to merge work into one unit, which is what entitles the cart to say "the same professional can
do this in the same visit". `PARALLEL_ALLOWED` is excluded: it means a *second* Partner, and
therefore a second visit and a second minimum-visit floor.

Empty stays empty. There is no popular-services fallback, because the heading is a claim about
compatibility and padding it would make that claim false.

## 1.17.0 - Cases, ledger, payouts and kill switches

18 new paths. `apps/cases`, `apps/payouts` and `apps/notifications` were domain layers behind no
door — the same shape B8 was in before 1.16.0 — and this publishes all three at once for the same
reason: an Operations console cannot be built against half a case lifecycle.

### Operations cases

`GET|POST /operations/cases/`, `GET /operations/cases/{id}/`, and `claim` / `escalate` /
`resolve` / `notes`. Cursor-paginated with `status`, `owner_team`, `kind` and `overdue` filters.

The detail projection publishes **`allowed_resolutions`** — the terminal results this case kind
may close on. That set is a domain rule that differs per kind, and a console carrying its own
copy would offer a button the server refuses the first time the two drift. Same reasoning as
`recovery_action` on Booking Groups: publish the decision, do not make the client infer it.

There is **one** case projection, not three. Unlike a Booking, a case has exactly one audience —
a case can quote a Customer's complaint verbatim and name a Partner in a safety report, so no
Customer-facing or Partner-facing shape exists to publish.

### Partner earnings

`GET /partner/earnings/`, `GET /partner/ledger/`, `GET /partner/payout-account/`. All three
resolve the Partner from the session and take no `partner_id` — the safest filter is the one a
caller cannot supply, which is the same reasoning that keeps `booking_group_id` off the Partner
booking projection.

The balance is **four numbers, not one**. "You have ₹4,200" is not true in any useful sense when
₹1,800 of it is held behind an open quality case, and a Partner planning their week needs to know
which part is actually coming. There is deliberately **no withdraw affordance**: M1 pays through
a reviewed batch, and a button implying otherwise would promise something the platform does not
do.

`PartnerLedgerEntry.calculation_snapshot` is published on purpose. A Partner is entitled to see
why they were paid what they were paid; hiding it turns every payment question into a support
ticket.

### Payout batches

`GET|POST /operations/payout-batches/`, detail, and `approve` / `pay` / `cancel`. Plus
`GET /operations/unpayable-partners/` and `POST /operations/ledger-adjustments/`.

**`approve` and `pay` require `HasRecentOperationsStepUp`** — a fresh OTP on the session.
Maker-checker already means two different people are involved; the step-up means neither of them
can be a stolen session on an unlocked laptop. Approving a payout run is the largest money-moving
action in the platform. `401 step_up_required` when the re-verification is missing or stale.

**`cancel` deliberately does not.** Cancelling only returns money to the pool, and making the
safe direction as heavy as the dangerous one trains people to leave bad batches sitting approved.

`unpayable-partners` exists so a Partner owed money with no verified account is *reported* rather
than silently skipped — a Partner left out of a run with no explanation is a support ticket
waiting to happen.

### Kill switches

`GET|POST /operations/kill-switches/` and `POST /operations/kill-switches/release/`.

Rows rather than settings: an environment variable needs a deploy, and the moment you need to
stop sending is the moment you cannot wait for a release. No step-up on either direction — a
control that is hard to reach during an incident is a control nobody uses. The reason is required
by a check constraint as well as the serializer, because an outage nobody can explain afterwards
is worse than the outage.

### Enum names

Fourteen new choice sets are named explicitly in `ENUM_NAME_OVERRIDES`. Left alone the generator
resolved `status` and `kind` collisions by hashing — `Status112Enum`, `Kind106Enum` — and those
reach the generated TypeScript client, where they mean nothing and change whenever an unrelated
model adds a choice. `status` and `kind` are the two most reused field names in this schema, so
every new one is named on arrival.

### Removed

`HasRecentFinanceStepUp` and `FINANCE_STEP_UP_TTL_SECONDS` are deleted. Refunds moved to the
Operations step-up, payouts use the same, and nothing held the finance role. The control that
mattered — a fresh OTP before money moves — is unchanged and now has one implementation instead
of two. `POST /auth/finance/step-up/` is untouched: it stamps `UserSession.stepped_up_at`, which
is the field both permissions always read.

## 1.16.0 - Booking fulfilment (B8) is published: the door on a room that was already built

26 new paths. `apps/fulfilment` has been a complete, tested domain layer since 1.15.1 with no
`views.py`, `urls.py` or `serializers.py` and no entry in `config/urls.py` — every command
reachable only from Python. This release publishes all of it at once.

### Why all at once

A fulfilment surface is a sequence, not a set. En route without arrived is not a smaller feature,
it is a client that strands a Partner halfway through a visit. Publishing one command per release
would have handed clients a contract they could not build a screen on, so the whole lifecycle
lands together: arrival, start OTP, work, evidence, amendment, abort, completion, dispute,
release and recovery.

### Three actor prefixes, three projections, one Booking

- `/bookings/{id}/…` — the Customer's visit.
- `/partner/bookings/{id}/…` — the same visit as work.
- `/operations/bookings/{id}/…` — both sides plus the audit trail.

They are separate URL families on purpose. The same `Booking` is reachable from all three, and
role-branching inside one view is one wrong `if` away from serving a Partner the Customer's
address. **`booking_group_id` and `order_id` appear only on the Operations projection** — G7
requires that a Partner cannot reach a sibling unit's scope or earnings, and the cheapest way to
guarantee that is to never publish the identifier that would let them ask.

The Customer projection names the Partner by `partner_display_name` and carries nothing else
about them: no id, no phone number, no earnings.

### The start OTP is deliberately split across two actors

`POST /bookings/{id}/start-otp/` is the **Customer's** — they receive the code.
`POST /partner/bookings/{id}/start-otp/verify/` is the **Partner's** — they type it in.

That split is the whole mechanism: the OTP proves the Partner is standing in front of the
Customer. A single endpoint, or a code published on the Partner's projection, would prove
nothing. The response carries `code_length`, never the code.

### Operations-assisted start now enforces the step-up it always described

`POST /operations/bookings/{id}/assisted-start/` is the audited channel-outage workaround for a
Customer who cannot receive an SMS. It requires `HasRecentOperationsStepUp` — a permission class
that already existed, already documented as gating exactly this, and had never been enforced
anywhere because until now there was no view to enforce it in. It is not a general-purpose OTP
bypass: it starts work without the Customer's code and says so in the audit trail. `401`
`step_up_required` when the re-verification is missing or stale.

### Post-payment group commands are new paths, not new meanings for old ones

`POST /booking-groups/{id}/cancel/` (`booking_group_cancel`) is **unchanged** and remains the
pre-payment command, still answering `409` `booking_group_conflict` for a `BOOKED` group. The
post-payment equivalents are:

- `POST /booking-groups/{id}/cancel-booked/` — runs the fee ladder per unit, skips finished
  units and names them, refuses the whole command if one unit is mid-work.
- `POST /booking-groups/{id}/reschedule/` — moves every visit by one offset. The Customer names
  a new start for the earliest visit and the rest shift with it, which preserves the planner's
  sequential ordering, parallel overlap and dependency gaps. Per-unit starts are deliberately
  not offered: they would let a client dissolve a server-authored grouping without any of the
  planning inputs that made it legal.
- `POST /booking-groups/{id}/address/` — group address change.

Two commands rather than one endpoint whose meaning depends on state: one collects nothing, the
other moves money.

### `FulfilmentUnit.booking_id` — without it, none of the above is reachable

One read-only nullable field on the Customer's `FulfilmentUnit` projection. No migration, no new
endpoint: `FulfilmentUnit.booking` is an existing reverse one-to-one that the projection simply
withheld.

Every Customer command in this release is keyed by `booking_id`, and `GET /booking-groups/{id}/`
is the only projection that lists a Customer's units — so without this a group detail could
describe three visits and offer no way to open any of them. That is precisely the break proposal
0011 fixed for payment, where `recovery_action` returned `PAYMENT_REQUIRED` while the group
published neither `checkout_id` nor `checkout_version` to act on it with. Publishing a command
and withholding its key is the same defect twice, so it is called out rather than slipped in.

Null before capture, deliberately: a unit still being matched has no Booking, and a fabricated id
would send a Customer to a `403` on a visit that does not exist.

### Conventions every state-changing operation follows

- **Required `Idempotency-Key`.** Same `execute_idempotent` helper proposal 0009 proved and
  1.15.0 reused. A replay answers with *current* truth and an `Idempotent-Replay: true` header,
  not the frozen body — every projection here carries `server_now` and live deadlines, and
  republishing a stored body would hand a device a stale clock.
- **Required `expected_version`.** Never defaulted. `409` `booking_version_conflict` carries
  `current_version` so the client refetches rather than retrying blindly.
- **`403` for both "not yours" and "does not exist".** Distinct codes would make these an
  existence oracle — a caller could enumerate Booking ids from the status alone. Same decision
  cart-item removal took in 1.13.0.
- **Evidence uploads never stream through Django.** Request a short-lived grant, PUT to the
  private bucket, finalize by object key with a client-computed `sha256` that Django recomputes
  from the bytes and compares. The same three-step shape FE-07 established for KYC.

### Enum names

Six choice sets are now explicitly named in `ENUM_NAME_OVERRIDES`: `ScopeAmendmentStatusEnum`,
`ScopeAmendmentLineKindEnum`, `WorkTaskKindEnum`, `WorkEvidenceKindEnum`, `WorkOutcomeEnum` and
`BookingStatusEnum`. Left alone the generator resolves `status`/`kind` collisions by hashing —
`Status7a2Enum`, `Kind0bfEnum` — and those names reach the generated TypeScript client, where
they mean nothing and change whenever an unrelated model adds a choice.

### Breaking: `DecisionEnum` is now `OperationsDocumentReviewDecisionEnum`

The Operations document-review decision was published as `DecisionEnum` only because nothing else
in the contract had a `decision` field. `CompletionResponse.decision` now does, and the generator
disambiguates both — so a component an existing consumer imports has been renamed.

Called out rather than absorbed, because a rename is a breaking change even when the values are
identical. The new name is the better one and is kept; the single consumer
(`apps/admin/features/partner-review/queries.ts`) is updated in the same commit. Any client
generated from an earlier contract must update the type reference. Values are unchanged:
`APPROVED` / `REJECTED`.

### Method fields publish real types

Nine `SerializerMethodField`s on the new projections are annotated with `@extend_schema_field`.
Unannotated they emit `{}`, which a generated TypeScript client renders as `unknown` — handing
every consumer the least useful type for the most useful data (`work_tasks`, `evidence`,
`active_amendment`, `completion`, `status_history`). A schema test now asserts they stay typed.

### Still not published

Partner ledger, payout and `OperationsCase` remain BE-10. A dispute sets `Booking.payout_hold`
and stops there; the Quality case the failure-outcomes table calls for does not exist yet.

## 1.15.1 - Booking fulfilment (B8): group outcome truth, no new surface

No schema change, no new path and no new operation id. B8 lands as domain commands only, and this
entry exists to record two things a client can observe anyway: one changed value on an existing
published field, and one capability that deliberately has no endpoint yet.

### `BookingGroup.status` can now settle on `CANCELLED` after booking

- The enum is unchanged — `CANCELLED` has always been a published value — but a **booked** group
  can now reach it. Previously a group whose every visit ended up cancelled derived `COMPLETED`,
  because the derivation only asked whether every Fulfilment Unit had finished, not whether any of
  them had actually delivered anything. A Customer who cancelled everything was shown a completed
  booking. That is exactly the hidden success state the quality rules forbid, and it is fixed.
- The rule now: a booked group settles once every unit is terminal, to `COMPLETED` if at least one
  unit was delivered (`COMPLETED`, `PARTIALLY_COMPLETED` or `DISPUTED`) and to `CANCELLED` if none
  were. One delivered visit is enough — a cancelled sibling does not erase the visit that happened,
  and an open dispute still lives underneath a settled group rather than holding it open.
- Clients that treat `COMPLETED` as "there is an invoice to show" were previously wrong for
  fully-cancelled groups and are now correct without changing.

### Group-wide post-payment cancellation exists, but not as an endpoint

- `POST /api/v1/booking-groups/{group_id}/cancel/` (`booking_group_cancel`) is **unchanged**: it
  still answers `409` `booking_group_conflict` with `reason: status_not_cancellable` for a group in
  `BOOKED`. It remains the pre-payment command it always was.
- The post-payment equivalent is implemented as the domain command
  `apps.fulfilment.cancellation.cancel_booked_group` and is not yet reachable over HTTP. The whole
  of B8 is service-layer at this release — start OTP, en route/arrived, completion, dispute and
  Partner release have no published paths either — so publishing one B8 command alone would be a
  contract clients could not build a fulfilment surface on. The API surface for B8 is tracked as an
  open gap in `Django_Next.js_Plan/M1/02-backend-tasks.md`; when it lands it lands as one release.
### Money and safety behaviour fixed before it could be published

Three defects found by the security review of this work, all fixed here rather than shipped
behind a future endpoint:

- **A refund is now raised per `PaymentAttempt`.** A Fulfilment Unit can hold allocations on two
  attempts — the checkout capture and an authorized scope amendment's revision payment. The
  refund split previously wrote one `Refund` against the first attempt with `RefundAllocation`
  rows spanning both, which either asks a provider to return more than that payment was worth or
  marks money returned that never moved. Cancellation and partial-work settlement now return a
  list of refunds, one per attempt, oldest attempt first.
- **A reschedule must name a future time.** Partner availability is evaluated by weekday and
  time of day, so a start one whole week in the past passed it. A backdated visit makes the
  lateness watchdog declare an on-time Partner late, and that flag never clears — it would have
  handed the Customer a permanent full-refund switch, usable even after the Partner arrived.
- **A mid-job Partner release is settled, not cancelled.** A Partner may release before the
  visit, on the way, on site or mid-job, and all four land in the same status. A Customer may
  walk away from the first three for a full refund; once work has started the visit settles line
  by line through the completion report instead, so a cancellation can never refund work that
  was actually performed.
- **Work evidence now checks who is uploading.** Minting a signed upload URL and recording
  evidence both verify the actor is the Booking's Customer or its Partner, and a recorded object
  key must belong to the Booking it is filed against. Evidence gates automatic completion, so
  neither could be left to a view that does not exist yet.

### Error codes reserved, not yet returned

B8's commands raise typed failures already, but no published endpoint can return them yet. They are
recorded here so the codes are fixed before a client ever sees one, not renamed underneath it:

- `booking_command_invalid` (`400`, `retryable: false`) — the command cannot apply to the Booking
  state it found: already en route, already cancelled, an amendment already answered, or a
  group-wide cancel that found one visit mid-work.
- `booking_version_conflict` (`409`, `retryable: true`, `details.current_version`) — the Booking
  changed since the caller read it.
- `partner_unavailable_for_window` (`409`), `outside_serviceable_area` (`409`), `otp_invalid`
  (`400`) and `step_up_required` (`401`) — reschedule, address change, start OTP and the
  Operations-assisted outage start respectively.
- A group-wide cancel refused for a mid-work visit names that visit in the message and changes
  nothing. It is never a partial application, so there is no "which units succeeded" shape to
  publish for a failure.

## 1.15.0 - Operations dispatch override and explainability

Additive and backward compatible. Closes the remaining BE-07 hardening gaps: revoke/release/
manual-recovery are now typed, idempotent, authorized commands rather than an internal-only status
value, and dispatch ordering is now explainable to Operations rather than opaque.

### Dispatch explanation (read)

- Added `GET /api/v1/operations/fulfilment-units/{unit_id}/dispatch-explanation/`
  (`operations_fulfilment_unit_dispatch_explanation`), scoped to `IsOperationsUser`. Returns
  `DispatchExplanation`: the unit's current `status`/`version`, the ranking `policy` and
  `policy_version` that ran, and one `DispatchAttempt` per candidate the unit has been offered to,
  each carrying the full `ranked`/`excluded` provenance (`RankedCandidate`, `ExcludedCandidate`)
  for that attempt.
- The pool is bounded to the Fulfilment Unit's service area and the document names every Partner
  considered and a closed-set reason for every one excluded
  (`application_not_approved` | `variant_not_offered` | `already_attempted` |
  `unavailable_at_start`). There is no business ranking published — `factors` names the one input
  (`tiebreak_partner_id`) that actually decided the order today, not a score no code computes.
- This endpoint discloses Partner ids that are never published to the Partner or Customer
  surfaces, so it is Operations-only; a Partner or Customer session receives `403`.

### Dispatch override commands (write)

- Added `POST /api/v1/operations/offers/{offer_id}/revoke/` (`operations_offer_revoke`) →
  `Offer`. Withdraws a live offer from a Partner and immediately hands the unit to the next
  eligible candidate.
- Added `POST /api/v1/operations/reservations/{reservation_id}/release/`
  (`operations_reservation_release`) → `DispatchReservation`. Frees a Partner's held slot. If the
  Booking Group is still `PAYMENT_PENDING`, releasing one unit's hold compensates the **whole**
  group to `REPLAN_REQUIRED` instead of producing a partial hold the Customer can no longer pay
  for as quoted; otherwise the unit returns to `MATCHING` and dispatch re-offers it.
- Added `POST /api/v1/operations/fulfilment-units/{unit_id}/recover/`
  (`operations_fulfilment_unit_recover`) → `FulfilmentUnitDispatch`. Runs the identical dispatch
  reconciliation Celery beat runs, under an actor, a version guard and a durable audit record,
  rather than a second divergent recovery path.
- All three require the `Idempotency-Key` header and a `DispatchCommandRequest` body of
  `expected_unit_version`, a closed-set `reason`, and an optional `note`. Replaying the identical
  request under the same key answers `200` with the **current** projection (live deadlines,
  `server_now`), not the frozen first response, and writes exactly one audit row regardless of
  how many times it is replayed.
- `note` is operator-authored free text; it is never echoed into any Partner- or Customer-facing
  projection.

### New error codes

- `dispatch_command_invalid` (`400`, `retryable: false`) — the command cannot apply to the
  dispatch state it found: the offer is no longer live, the reservation is already released, or
  the Booking Group has already reached a terminal state.
- `dispatch_version_conflict` (`409`, `retryable: true`, `details.current_version`) — the
  Fulfilment Unit changed since the caller read it. A refused command of this shape burns no
  idempotency key, so the same key can be retried once the console has refetched.

### Ranking provenance (persisted, not newly published as a standalone resource)

- `AssignmentAttempt` now records `ranking_snapshot` internally: the policy, the service-area pool
  considered, and a named reason for every Partner passed over. It is not merged into
  `PartnerOffer.partner_projection_snapshot` and is not published on any Partner or Customer
  surface — only through the Operations explanation endpoint above.

## 1.14.0 - Booking Group payment entry point

Additive and backward compatible. Implements proposal 0011. No new endpoint, no new command, no
migration — three read-only nullable fields on an existing projection.

### Booking Group (proposal 0011)

- `BookingGroup` now carries `checkout_id`, `checkout_version` and `order_id`. They appear on both
  `GET /api/v1/booking-groups/{group_id}/` and the `booking_group_list` page.
- This closes an unexecutable instruction. `recovery_action` has returned `PAYMENT_REQUIRED` since
  1.9.0, but `POST /api/v1/payment-attempts/` requires `checkout_id` and
  `expected_checkout_version`; the group published neither, and there is no
  `GET /api/v1/checkouts/{checkout_id}/` to resolve one. A Customer could therefore pay only from
  inside the browser tab that created the checkout. A reload, a second device or a notification
  link all reached a dead end, and the reservation expired holding capacity the Customer had
  already committed to.
- `checkout_version` is published alongside `checkout_id` on purpose. Sent back as
  `expected_checkout_version`, it is the guard that stops a payment being raised against a checkout
  that has moved. Publishing the id alone would force clients to guess a version and defeat it.
  A stale value still answers `409`, unchanged.
- `order_id` is `null` before capture and names the `Order` after it. `Order` is retrievable by id
  alone — there is no list and no filter — so without this pointer a Customer who had paid could
  not reach their own allocations, invoice or credit note. `GET /api/v1/orders/{order_id}/` remains
  the read and keeps its own ownership check; this field discloses only the identifier.
- All three are `null` when the relation is absent, matching `CheckoutSession.booking_group` and
  `Order.booking_group`, which are both nullable. Clients render no payment affordance on `null`
  rather than building one on a guessed id.
- Authorization is unchanged. `BookingGroupDetailView` already scopes to `customer=request.user`,
  and another Customer's group id still answers `404`. Both list and detail `select_related` the
  two reverse one-to-ones, so the fields cost no query per row.

## 1.13.0 - Cart removal, typed offer commands and bounded list cursors

This is the coherent WIP integration release for proposals 0007, 0008 and 0009. It has not been
consumed as an immutable published client pin; finishing the three contract gaps in one version
avoids an unnecessary 1.14.0 bump.

### Cart-item removal (proposal 0007)

- Added `POST /api/v1/cart/items/{item_id}/remove/` (`cart_items_remove`) with a required
  `CartItemRemoveRequest` body carrying `expected_cart_version` and `expected_item_version`, and a
  `200` response returning the complete updated `Cart`. Authorization is unchanged from the rest of
  the Cart surface: `cookieAuth` or an anonymous session cart.
- No `Idempotency-Key` is required or accepted. The optimistic-version pair is the replay
  protection — a repeat of an accepted removal can no longer match a live row, so a double
  submission cannot remove a second item. This is deliberately unlike checkout, which mints a new
  record and has no version to check against.
- `DELETE /api/v1/cart/items/{item_id}/` is retained for callers already sending a DELETE body and
  runs the identical domain command. Its request shape is still absent from this document, because
  the schema generator does not emit a `requestBody` for DELETE — that omission is the reason the
  POST sibling exists, and generated clients must use the POST.
- Added `cart_item_not_found` as a `409`. A removed, unknown or another Customer's item id all
  answer with it, identically, so the command cannot be used to discover whether an id exists in
  someone else's cart. It replaces the previous `400 validation_error` on the DELETE route; no
  published client called that path, since the request body it required was never publishable.
- `cart_version_conflict` details now carry `conflicting_field`, naming which expectation moved
  (`expected_cart_version` or `expected_item_version`). Both guards keep the same code because both
  recover by refetching the cart. This is an additive key on `add`, `update` and `remove`; existing
  `current_version` handling is unchanged.

### Partner offer commands (proposal 0009)

- `POST /api/v1/partner/offers/{offer_id}/{action}/` now requires `Idempotency-Key`. The key scopes
  to the authenticated Partner, offer id and action. Identical replay returns HTTP `200` with the
  offer's current authoritative projection and performs the transition once.
- `action` is the closed `OfferActionEnum`: `accept`, `decline`, `undo`, `commit`.
- Declared responses are `200` (`Offer`), plus `400`, `403`, `404` and `409` (`ApiError`).
- Reusing a key with a different command returns `409 idempotency_key_reused`. An unfinished
  command returns `409 idempotency_in_progress` (`retryable: true`).
- A genuine reservation race returns `409 offer_reservation_conflict` rather than an expiry-shaped
  refusal. A Partner cannot command another Partner's offer (`404`).

### Bounded list cursors (proposal 0008)

- `GET /api/v1/booking-groups/` and `GET /api/v1/partner/offers/` publish an optional `cursor` query
  parameter (`string`, `minLength: 1`), matching the Operations review-queue precedent.
- Omitting `cursor` returns the first page. An explicitly blank, whitespace-only, malformed or
  poison-position cursor returns `400 cursor_invalid` (`retryable: false`) in the standard error
  envelope. Clients should reset to page one.
- Page size remains server-bounded; clients cannot widen pages through unpublished parameters.

Migration note: regenerate clients at 1.13.0. Cart removal becomes callable through the generated
client for the first time. Offer commands require a stable Idempotency-Key per logical action.
Booking Group and Partner offer lists can traverse with typed `cursor` values parsed from `next`.

## 1.11.0 - Browser-readable server clock

- Added `server_now` to the Partner `Offer` projection and to the Partner offer page envelope.
  A Partner session that opens straight to the offer inbox previously touched no endpoint
  publishing a server instant, so the 45-second offer expiry and the 120-second undo window were
  the only deadlines in the product with no calibration source of their own. The page-level field
  covers an empty inbox, which carries no offer to read a timestamp from.
- No request shape, authorization rule, status code or money field changed. Every added field is
  read-only and server-authored.

Operational change published alongside this version, with no schema effect: `Date` is now named in
`Access-Control-Expose-Headers` for allowed credentialed origins, and production start-up fails if a
deployment removes it. `Date` is not CORS-safelisted, so browser clients previously read `null` from
`response.headers.get("date")` and every countdown silently fell back to the device clock. Clients
should keep the header as their primary calibration source — it refreshes on every response and
tracks drift — and treat `server_now` as the more precise reading where an endpoint publishes it.

Migration note: regenerate clients at 1.11.0. No existing call site requires changes.


## 1.10.0 - Booking Group payments, unit refunds and financial documents

- Added idempotent Customer payment-attempt creation after all required Fulfilment Units have live
  Partner holds, plus Customer-owned attempt and checkout-payment recovery projections.
- Added immutable Payment Allocations for every Fulfilment Unit line. Provider capture, unit refund,
  invoice and credit-note totals reconcile to the selected group quote in integer paise.
- Added raw-body signed Razorpay webhook ingestion using provider event IDs, monotonic payment-state
  reduction and explicit reconciliation for duplicate, out-of-order and browser-redirect-loss cases.
- Added Finance-step-up unit refund creation/reconciliation and Customer-authorized refund reads.
  Failed or ambiguous provider commands remain visible as financial exceptions instead of becoming
  false success states.
- Added Customer-authorized group Order, per-unit Booking, invoice and credit-note retrieval. Live
  collections remain fail-closed until Razorpay credentials, webhook secret and CA/legal approval are
  explicitly configured.

## 1.9.0 - Booking Group recovery and unit-scoped dispatch

- Added Customer-authorized, cursor-paginated Booking Group list/detail projections and a versioned,
  idempotent pre-booking cancellation command with explicit server recovery actions.
- Re-keyed assignment attempts, Partner offers and PostgreSQL range reservations to individual
  Fulfilment Units while retaining nullable legacy Checkout references during migration.
- Partner offer polling is bounded and unit-scoped; each offer exposes only that unit's service
  lines, window and duration and never exposes sibling units or Customer data.
- Booking Group dispatch starts from a transactional outbox event and is reconciled by Celery. Offer,
  undo, group-search and payment-hold deadlines progress without an open browser; partial holds are
  released when any all-or-nothing unit cannot be fulfilled.
- Added Operations manual-offer recovery at Fulfilment Unit scope.

## 1.8.0 - Reviewed compatibility-rule lifecycle

- Added Operations-only compatibility-rule list/detail and draft, independent activation,
  rejection and retirement commands.
- Compatibility responses publish canonical exact-variant pairs, immutable configuration versions,
  effective windows, lifecycle state, maker/checker references and non-secret review reasons.
- Activation fails closed for inactive variants, overlapping windows, self-review, unsupported
  conditions and ordering dependencies on parallel rules.

## 1.7.0 - Multi-item fulfilment planning and Booking Groups

- Replaced the singleton Cart integration target with an optimistic-versioned Cart containing up to
  five independently scoped items. Explicit add/update/remove commands preserve stable item identity;
  a stale cart version fails without applying a partial mutation.
- Added immutable, expiring fulfilment Plan Sets with server-authored sequential, coordinated-parallel,
  independent-visit or mixed alternatives. Each alternative partitions every active Cart Item exactly
  once and exposes visit/professional counts, unit windows, reasons and server-calculated Money.
- Added selected-plan quotes with immutable Quote Units and Lines. Minimum-visit pricing applies per
  unit, the platform fee is charged once per group and allocated deterministically in paise.
- Checkout confirmation now materializes one Booking Group and one Fulfilment Unit per selected Plan
  Unit under the `ALL_OR_NOTHING` policy. Historical invalidated/expired/consumed quotes remain readable.
- Added effective-dated exact-variant compatibility rules. Missing rules fail safely to separate visits;
  same-category membership never proves grouping, and parallel plans require distinct eligible capacity.

Migration note: Customer clients must move from singleton `PUT /cart/`, `/booking/windows/` and
`POST /quotes/` integration to `/cart/items/`, `/fulfilment-plan-sets/` and `/plan-quotes/`. The old
paths remain an expand-phase compatibility surface only. Generate clients from 1.7.0 and do not infer
grouping, schedules, Partner counts, prices or allocations in the frontend.

## 1.6.0 - A1 catalog, arrival windows and complete quotes

- Replaced legacy public duration-picker metadata with the A1 fulfilment archetype, current task
  lines and the effective minimum service subtotal. Displayed starting prices now include the
  minimum-visit floor.
- Added authenticated, server-authored Today/Scheduled arrival windows. Window IDs are signed,
  short-lived and bound to the current cart item and address; availability is explicitly marked as
  preliminary until checkout revalidation.
- Quote creation now accepts only an address and opaque window ID. Responses include server time,
  expiry, immutable task/minimum/platform-fee lines, tax included in the total, the arrival window
  and versioned cancellation-policy bands.
- Singleton-cart replacement now returns `409 cart_item_limit_reached` with safe existing-item
  context and requires an explicit `replace_existing` confirmation.
- Checkout creation now rejects expired quotes and revalidates address, service area, operating
  hours, duration and arrival-window timing before creating the checkout.

Migration note: Customer clients must fetch `POST /booking/windows/` before creating a quote and
must stop sending `requested_start`, price, duration or total fields. Handle cart replacement as an
explicit confirmation flow, refresh windows on `window_no_longer_available`, and refresh the quote
on `quote_expired`.

## 1.5.0 — Private Partner documents and Operations review queue

- Replaced client-supplied document object metadata with a two-step private upload contract:
  Django issues a server-owned random object key and short-lived Supabase upload grant, then accepts
  only an upload ID plus the current application version for finalization.
- Finalization now verifies authoritative byte count, content type and SHA-256 before publishing a
  document. Documents expose fail-closed scan state and cannot be revealed or reviewed until clean.
- Added the bounded, cursor-paginated Operations Partner-application queue and masked detail read,
  including status/assignment filters and optimistic-concurrency claim ownership.
- Added assigned-reviewer-only, short-lived document review access. Application reads, document
  reveals and self-review denials are audited; permanent storage paths are not exposed by detail.
- Added explicit retryable storage failures and stable invalid/expired/replayed upload behavior.

Migration note: Partner clients must first call `POST /partner/application/documents/uploads/`,
upload directly with the returned signed grant, and finalize with
`POST /partner/application/documents/`. Remove any client-authored `object_key` request. Operations
clients must claim an application before revealing or reviewing documents and must treat review URLs
as ephemeral secrets.

## 1.4.0 — Step-wise Partner onboarding

- Added authenticated applicant reference endpoints for accepting service areas, active canonical
  Partner skills and current required consent documents.
- Added explicit Partner-area intake control and skill descriptions without exposing capacity or
  ranking inputs.
- Changed Partner application `PATCH` into a genuine partial optimistic-concurrency command:
  omitted fields are preserved, supplied selection sets are validated together and the complete
  updated application is returned.
- Linked new consent receipts to canonical versioned HTTPS legal-document records. Submission now
  fails closed when required consent configuration is missing, withdrawn or superseded.

Migration note: Partner onboarding clients should replace catalog-derived skill labels and any
locally supplied area/consent identifiers with the three reference endpoints. Existing application
updates must continue sending `expected_version`; only initial draft creation omits it.

## 1.3.0 — Browser session security and role-aware Operations

- Added a typed JSON CSRF bootstrap token for credentialed browser clients while retaining HttpOnly,
  Secure production cookies and explicit origin allowlists.
- Added OTP `code_length` and machine-readable throttle wait details.
- Changed `GET /auth/session/` to an anonymous-safe session projection containing nullable `user`,
  `active_role` and `session_expires_at` fields.
- Added `active_role` to OTP verification responses and kept backend-authored error/role codes in
  lowercase `snake_case`.
- Added representative OTP/session/conflict examples and typed required `Idempotency-Key` headers to
  the Customer and Operations-assisted checkout commands.
- Made customer-safe API exception messages authoritative and added the stable `csrf_failed` recovery
  code.
- Operations APIs now require the session's active Operations role as well as an unrevoked grant;
  authorization decisions are audited and Partner application/document self-review is forbidden.
- Backend quality now fails on migration drift, invalid OpenAPI or Django-to-committed-schema drift.

Migration note: consumers of the old current-session response must read user fields from `user` and
treat `user: null` as the ordinary signed-out state. Browser clients must retain the CSRF response
token in memory and refresh it after login or a `csrf_failed` response.

## 1.2.0 — Partner onboarding, eligibility and presence

- Added Partner application create/update/read and optimistic-version submission endpoints.
- Added versioned KYC document upload metadata and Operations review/state-transition commands.
- Added normalized Partner skill, service and service-area eligibility.
- Added weekly schedules, date exceptions and Redis-first online/heartbeat/offline presence.
- Added `retryable` to the standard API error envelope.

## 1.1.0 — Catalog and locations

- Added public Category, Service list/detail and booking-configuration endpoints.
- Added effective-dated authoritative “starts at” pricing.
- Added authenticated Customer address list/create/read/update/archive endpoints.
- Added reverse-geocoding with normalized response and recoverable provider failure.
- Added serviceability checks for PIN, service variant, full duration and operating hours.

## 1.0.0 — Foundation

- Added liveness endpoint.
- Added database/cache readiness endpoint.
- Added stable request-correlation header.
- Added standard API error-envelope policy.
- Added CSRF bootstrap endpoint.
- Added OTP request and verification endpoints.
- Added current-session and logout endpoints.
- Documented revocable cookie-session authentication.
