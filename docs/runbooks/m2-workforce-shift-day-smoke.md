# M2 Wave C4 smoke script — the A3 shift-day

**What this proves.** The week after a booking fee hardens: shift-days that know which calendar day
they are, named crew assigned **per day** with a cross-agency conflict that actually bites, non-OTP
arrival, one supervisor tap for "n of m present", the Customer's confirm-or-dispute, settlement at
the present workers' rate with a UPI deep link the platform does not sit inside, overtime and
add-ons priced only from the published card, a safety incident that is not a cancellation, and a
cash-demand report that hits standing without being treated as proof.

**What it replaces.** `M2-BE-534` and `M2-BE-535`, which are test rows. The build-first amendment in
`Django_Next.js_Plan/M2/task.md` (2026-08-13) suspends test authoring for the sprint and asks each
wave to ship the exact requests the owner runs instead. This is Wave C4's.

> **This is a development runbook.** It depends on `PAYMENTS_ALLOW_SIMULATED_CAPTURE` and on
> `seed_m2_demo`, both of which `config/settings/production.py` refuses to boot with. Do not run it
> against production.

---

## 0. Before you start

```powershell
cd C:\dev\vsolve\backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only
.\scripts\server.cmd
```

The seed is not optional here. Wave C4 reads four owner-blocked values off the variant's active
`M2VariantConfiguration` — the retroactive overtime window and the three standing numbers — and
without them §F answers `409 m2_policy_unavailable` and §H changes nothing. The seed writes all
four, marked `DEV SEED — not an owner decision`, and it also gives every demo vendor a
`m2demoN@vsolvedemo.test` UPI ID so §E can render the deep link.

Three cookie jars, because the session cookie is per host:

| Jar | Who | How to sign in |
|---|---|---|
| `cust.txt` | The Customer who booked | the customer app's OTP flow |
| `vend.txt` | The lead who accepted the crew offer | the partner app's OTP flow |
| `ops.txt` | Operations | `+918019013032`, dev OTP shown on screen |

```bash
API=http://localhost:8000/api/v1
CUST="curl -s -b cust.txt -c cust.txt -H 'Content-Type: application/json'"
VEND="curl -s -b vend.txt -c vend.txt -H 'Content-Type: application/json'"
OPS="curl -s -b ops.txt  -c ops.txt  -H 'Content-Type: application/json'"
IDEM() { echo "-H 'Idempotency-Key: $(uuidgen)'"; }
```

### 0.1 The A3 rate-card walk, to an engagement

Everything below needs an **engaged** A3 booking, and this is the walk that produces one. It is
written out here rather than cross-referenced because `m2-demo-seed.md`'s A3 section is the
*quote-first* door, which predates revision 4 and ends at a quote rather than at a crew.

```bash
# 1. The preset. `worker_count` and `duration_days` are what the rate card is priced against.
$CUST -X POST $API/requirements/ -d '{"variant_id":"<the A3 variant>","answers":{"worker_count":4,"duration_days":3,"floor_number":3,"has_lift":false,"carry_distance_m":30,"needs_packing":true}}'
REQUIREMENT=<id>

# 2. Where and when. `requested_start` is load-bearing for Wave C4 — it is what dates the
#    shift-days, and `submit_requirement` already requires it.
$CUST -X PATCH $API/requirements/$REQUIREMENT/ -d '{"address_id":"<an address in PIN 500032>","requested_start":"<tomorrow, ISO 8601>","service_by":"<a few weeks out>"}'

# 3. The published rate, BEFORE anything is committed.
$CUST $API/requirements/$REQUIREMENT/rate-card/ | jq '.preview | {is_available, day_rate_paise, total_customer_paise, lead_receipt_paise, booking_fee_paise, standard_day_hours, inclusions, unavailable_code}'
```

`is_available: false` with `unavailable_code` set is the fail-closed answer, and the code says
which gap: `m2_rate_card_unavailable` means no card for this city and skill (or the area carries no
`state_code`, so the wage-floor check cannot run), `m2_policy_unavailable` means the preset schema
or the cascade policy is unset. All of them are the seed's job.

```bash
# 4. Book at that rate. This submits the requirement and starts the cascade in one step.
eval $CUST $(IDEM) -X POST $API/requirements/$REQUIREMENT/rate-card/book/ -d '{}'

# 5. As a demo vendor: the offer, carrying THEIR number and not the Customer's.
$VEND $API/partner/crew-offers/ | jq '.offers[] | {invitation_id, status, headcount, days, lead_day_receipt_paise, lead_total_receipt_paise, verified_roster_size, responds_by}'
```

**Check what is absent.** There is no `total_customer_paise` and no `booking_fee_paise` on that
payload at any status, and since 1.30.0 there is none on the accept response either — a lead shown
the Customer's all-inclusive number would reasonably expect to receive it.

```bash
INVITATION=<invitation_id>
eval $VEND $(IDEM) -X POST $API/partner/crew-offers/$INVITATION/accept/ | jq '{booking_id, status, lead_day_receipt_paise, lead_receipt_paise, hold_expires_at}'

# 6. The held fee. NEW at 1.30.0 and the reason this section exists.
$CUST $API/requirements/$REQUIREMENT/rate-card/ | jq '{booking: .booking.status, fee: .booking_fee.status, checkout_available}'
# booking: OFFER_HELD, fee: OFFER_ACCEPTED, checkout_available: true
```

Before 1.30.0 `booking_fee` was **`null`** here: `OFFER_ACCEPTED` was a published state that no
path wrote, and a screen that gated its pay button on it could never offer it. `checkout_available`
was — and still is — computed from `booking.status == OFFER_HELD` and explicitly tolerates a
missing fee row, so the charge always worked; what did not work was
`POST /requirements/{id}/booking-fee/cancel/` in this exact window, which refused with *"There is
no booking fee on this request"*. Try it on a throwaway requirement to see it work now.

```bash
# 7. Pay. The fee moves OFFER_ACCEPTED -> PENDING here and only a verified callback moves it on.
eval $CUST $(IDEM) -X POST $API/requirements/$REQUIREMENT/booking-fee/checkout/ | jq '{fee: .booking_fee.status, payment_attempt_id}'
ATTEMPT=<payment_attempt_id>
$CUST -X POST $API/payment-attempts/$ATTEMPT/simulate-capture/ -d '{}'

# 8. The engagement exists because the callback created it — not because the client came back.
$CUST $API/requirements/$REQUIREMENT/rate-card/ | jq '{booking: .booking.status, fee: .booking_fee.status, confirmed_partner_name}'
# booking: CONFIRMED, fee: ACTIVE
$CUST $API/engagements/ | jq '.results[0] | {id, commercial_mode, status}'
ENGAGEMENT=<that id>
$CUST $API/engagements/$ENGAGEMENT/ | jq '{commercial_mode, stages: [.stages[] | {id, position, label, scheduled_on, amount_paise, status}]}'
```

**Check `scheduled_on` on every stage before going further.** It must be a real date, one per
consecutive day from the Customer's requested start. If it is `null`, this engagement predates the
C4 fix and every crew call below will correctly refuse with *"This shift-day has no date on it
yet"* — book a fresh requirement rather than working around it.

```bash
DAY1=<the id of the stage at position 1>
```

---

## A. The shift-day read, and the disclosure line (`M2-BE-521`, `523`)

```bash
$VEND $API/engagement-stages/$DAY1/shift/ | jq '{scheduled_on, day_label, per_worker_paise, standard_day_hours, overtime_hourly_paise, add_on_rates, crew, attendance, settlement}'
$CUST $API/engagement-stages/$DAY1/shift/ | jq '{crew, attendance, settlement}'
```

**Expect.** `attendance` and `settlement` are `null` — nothing has happened yet, and reading has
created nothing. `per_worker_paise` is the wage component **plus** the supervision margin, not the
Customer's all-in day rate: the booking fee was collected online and is owed to nobody tonight.
`standard_day_hours` is 8 and `overtime_hourly_paise` is the card's.

The field is `day_label`, not `label`. `label` is DRF's own `Serializer` attribute.

Come back to both of these after §C. **The Customer's `crew[]` rows must carry
`membership_id: null`** while the vendor's carry a real id, and neither must ever contain
`crew_member_id`. That is `M2-BE-523`: crew identity is global, and handing a Customer the global id
would let two bookings be correlated into a fact about a worker nobody is entitled to learn from us.

---

## B. Arrival is refused before anybody is named (`M2-BE-522`)

```bash
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/arrival/
```

**Expect `409`** — *"Name the workers coming to this shift before confirming they arrived."*

---

## C. Assign crew, per day, and prove the conflict bites (`M2-BE-522`, `528`)

```bash
$VEND $API/partner/crew/ | jq '[.crew[] | {membership_id, display_name, is_supervisor, documents_verified_at}]'
```

Pick as many **verified** memberships as the booking's headcount — one of them a supervisor.

```bash
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/crew/ \
  -d '{"membership_ids":["<m1>","<m2>","<m3>"]}'
```

**Expect `200`** and the whole crew back. Then run the same command again: it is a **no-op**, not a
duplicate — the command takes the intended set and reconciles the day to it.

Four refusals worth seeing, each a different failure:

```bash
# 1. An unverified worker.
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/crew/ -d '{"membership_ids":["<unverified>"]}'
# 409 m2_crew_conflict — "... is not verified yet, so they cannot be put on a shift."

# 2. More workers than were booked.
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/crew/ -d '{"membership_ids":["<m1>","<m2>","<m3>","<m4>"]}'
# 409 — "This day was booked for 3 workers. Extra workers need a change request..."

# 3. THE CROSS-AGENCY ONE. Add the same human to a second vendor's roster, using the
#    same phone number, then assign them to another engagement's shift-day on the SAME DATE.
eval $VEND2 $(IDEM) -X POST $API/engagement-stages/$OTHER_DAY/crew/ -d '{"membership_ids":["<m-other-agency>"]}'
# 409 m2_crew_conflict — "... is already booked on <date>, including through another agency."

# 4. Substitution. Send the set with one name swapped.
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/crew/ \
  -d '{"membership_ids":["<m1>","<m2>","<m4>"],"reason_code":"illness"}'
# 200. `m3` is released with reason `illness`; `m4` is assigned. One call, not a delete-then-add.
```

Refusal 3 is the one to take seriously — it is the whole point of global crew identity, and a
partial unique index holds it as well as this check, so two supervisors tapping at the same instant
cannot both win.

**And the archive guard** (`M2-BE-111`, criterion 9), which had nowhere to read from until now:

```bash
eval $VEND $(IDEM) -X POST $API/partner/crew/<m1>/archive/
# 409 m2_crew_conflict — "... is booked on <date>. Replace them on those shifts first."
```

---

## D. Arrival, then "n of m present" (`M2-BE-524`, `525`, `527`)

```bash
eval $CUST $(IDEM) -X POST $API/engagement-stages/$DAY1/arrival/
$CUST $API/requirements/$REQUIREMENT/rate-card/ | jq '.booking_fee | {status, earned_at}'
```

**Expect `200`**, and — because this is **position 1** — the booking fee has moved `ACTIVE →
EARNED`. Either party may confirm arrival; this is the non-OTP path and in M2 it is the default,
not a degraded mode. The stage is now `IN_PROGRESS`.

```bash
# Three of four turned up, and nobody recorded an end time.
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/attendance/ -d '{"present_count":3}'
```

**Expect `200`** with `checkout_missing: true`, `flagged_for_review: true`,
`flag_reason_code: "checkout_missing"`, and the stage now `AWAITING_REVIEW` with a `review_due_at`.
The count *is* the evidence — there is no second review mechanism for A3.

`M2-BE-527` in one line: the missing check-out is **flagged, not disputed**. A supervisor whose crew
left at six and who closed the day at nine has done nothing wrong, and the amount never depended on
the end time.

```bash
# Above the booked crew is refused, because an extra worker is an amendment, not a bigger number.
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/attendance/ -d '{"present_count":9}'   # 409
```

---

## E. The Customer answers, and the day settles at three workers (`M2-BE-537`, `536`)

```bash
# A shortfall with no choice is refused.
eval $CUST $(IDEM) -X POST $API/engagement-stages/$DAY1/attendance/response/ -d '{"response":"CONFIRM"}'
# 409 — "1 of the workers you booked did not come. Tell us whether to carry on short, ask for
#        an extra day, or cancel the missing workers."

eval $CUST $(IDEM) -X POST $API/engagement-stages/$DAY1/attendance/response/ \
  -d '{"response":"CONFIRM","shortfall_choice":"CONTINUE_SHORT"}'

$CUST $API/engagement-stages/$DAY1/shift/ | jq '.settlement'
```

**Expect** `amount_paise == per_worker_paise * 3` exactly — **three** workers' published rate, not
four. That is `M2-BE-537`: settlement per worker-day present, never per job. Billing the fourth
would be charging for somebody who was not there; discounting the three would be repricing a rate
both sides accepted. A database constraint refuses any row where the arithmetic does not close.

The stage is now `APPROVED` and immediately `RELEASED` — nothing is held because Vsolve collected
nothing.

Now the evening tap, from each side in turn:

```bash
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/settlement/ | jq '{status, amount_paise, upi_payment_link}'
# status: SUPERVISOR_CLAIMED  <- one-sided. This is what Operations reads as UNPROVEN.

eval $CUST $(IDEM) -X POST $API/engagement-stages/$DAY1/settlement/ | jq '{status, amount_paise, upi_payment_link, settled_at}'
# status: SETTLED, upi_payment_link: upi://pay?pa=m2demo1@vsolvedemo.test&pn=...&am=2550.00&cu=INR
```

**The thing to check here is what is absent.** No `PaymentAttempt` was created, no ledger entry
moved, no refund and no payout. The link is a deep link into the Customer's own UPI app at the exact
published amount; the money is peer-to-peer and Vsolve never holds it. Clear the vendor's
`upi_vpa` through `PUT /partner/business-profile/` and the link becomes `null` while the amount
stays — an ordinary state, not an error.

The **dispute** branch, on day 2 (`M2-BE-526`) — the only place per-worker detail is ever collected:

```bash
eval $CUST $(IDEM) -X POST $API/engagement-stages/$DAY2/attendance/response/ \
  -d '{"response":"DISPUTE","note":"Only two people were here all afternoon.",
       "worker_details":[{"name":"Ramesh","was_present":false,"note":"Left after lunch"}]}'
```

**Expect** the stage `DISPUTED`, the review clock cleared, and the settlement left unconfirmed — a
count nobody agrees on is not an amount either. Nothing derives a third number from
`worker_details`: it is the Customer's objection, and Operations decides between them through the
existing `POST /engagement-stages/{id}/dispute/decision/`.

---

## F. Overtime and add-ons, at published rates only (`M2-BE-531`, `538`)

```bash
# An add-on that is on the card.
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/extras/ \
  -d '{"kind":"ADD_ON","add_on_code":"no_lift_per_worker_day","worker_days":3,"reason":"Lift out of service"}'
```

**Expect `201`** with `delta_paise == 7500 * 3`. The vendor named *what* and *how much of it*; the
server named the money, from the card frozen on the engagement at booking. There is no amount field
on this request and there never will be.

```bash
# An add-on that is not on the card.
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/extras/ \
  -d '{"kind":"ADD_ON","add_on_code":"invented_extra","worker_days":1,"reason":"Third floor"}'
# 409 m2_amendment_required — "That extra is not on the published rate card for this booking."
```

That refusal is the mechanism. "Third floor, no lift? Extra, bhaiya" with a number the vendor chose
is exactly what the published card exists to leave nowhere to live.

Accept it as the Customer, and watch the settlement move:

```bash
AMENDMENT=<id from the 201>
eval $CUST $(IDEM) -X POST $API/engagement-amendments/$AMENDMENT/accept/
$CUST $API/engagement-stages/$DAY1/shift/ | jq '.settlement | {per_worker_paise, workers_present, extras_paise, amount_paise}'
# amount_paise == per_worker_paise * workers_present + extras_paise
```

**Overtime, and the window** (`M2-BE-531`):

```bash
# While the shift is still running: no window needed, nothing has been worked unapproved.
eval $VEND $(IDEM) -X POST $API/engagement-stages/$DAY1/extras/ \
  -d '{"kind":"OVERTIME","hours":2,"reason":"Loading ran late"}'   # 201

# Now clear the seeded window and try a retroactive one on a shift that has ended:
#   M2VariantConfiguration.overtime_retroactive_window_minutes = None
# 409 m2_policy_unavailable — "We have not set how long overtime can be approved for after a
#                              shift ends."
```

That is the only owner-blocked value in this wave that refuses a command, and the direction is
deliberate: the window decides whether work already done gets paid for, and there is no safe
number to guess. Past the window, the request is refused and the overtime is **unpaid** — the rule,
not a failure.

The quote-flow fallback publishes no overtime rate at all, so overtime against a fallback
engagement is refused rather than multiplied by an invented factor.

---

## G. A safety incident is a record, never a cancellation (`M2-BE-530`)

```bash
eval $CUST $(IDEM) -X POST $API/engagements/$ENGAGEMENT/safety-incidents/ \
  -d '{"severity":"SERIOUS","category_code":"fall","description":"A worker fell from the second step of the stair.","stage_id":"'$DAY1'"}'

$CUST $API/engagements/$ENGAGEMENT/ | jq '.status'
```

**Expect `201`, and the engagement still `ACTIVE`.** Nothing cancelled, nothing suspended, nothing
refunded. A job that must end because a site is unsafe ends through cancellation *with* a report
beside it, so both facts exist separately.

```bash
INCIDENT=<id>
eval $OPS $(IDEM) -X POST $API/operations/safety-incidents/$INCIDENT/decision/ -d '{"decision":"UNDER_REVIEW"}'
eval $OPS $(IDEM) -X POST $API/operations/safety-incidents/$INCIDENT/decision/ -d '{"decision":"RESOLVED"}'
# 409 — closing a safety report needs an account of what was done.
eval $OPS $(IDEM) -X POST $API/operations/safety-incidents/$INCIDENT/decision/ \
  -d '{"decision":"RESOLVED","resolution_note":"Stair edge taped, toolbox talk held, no lost time."}'
```

The report body is frozen by the model, so an operator can only ever add a status and a resolution.
Try it in the shell to see the refusal:

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from apps.requirements.models import SafetyIncident; i=SafetyIncident.objects.first(); i.description='something else'; i.save()"
# ValueError: A safety report is frozen once filed.
```

---

## H. A cash demand hits standing, and one report changes nothing (`M2-BE-539`)

```bash
eval $CUST $(IDEM) -X POST $API/engagements/$ENGAGEMENT/cash-demand/ \
  -d '{"amount_claimed_paise":50000,"note":"Asked for 500 rupees extra to carry to the third floor.","stage_id":"'$DAY1'"}'
```

**Expect `201`,** and then check that **nothing happened to the vendor**:

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from apps.partners.models import PartnerCapability, PartnerStandingEvent; print(list(PartnerStandingEvent.objects.values_list('kind','reason'))); print(list(PartnerCapability.objects.values_list('archetype','status')))"
```

One `CASH_DEMAND_REPORTED` event exists; the capability is still `APPROVED`. A report is one party's
account and is never proof on its own. The seed sets the removal threshold to 3 inside 90 days —
file two more reports on two more engagements and the third suspends the vendor's A3 capability
through the same command Operations uses, which routes their live engagements exactly as a human
suspension does. Clear `cash_demand_removal_threshold` and no removal ever fires while the reports
keep accumulating, which is the fail-closed direction.

Same shape for a short day: §E already wrote a `CREW_SHORTFALL` event when the Customer confirmed
3-of-4, without anything else happening.

---

## I. Vendor no-show, on day one (`M2-BE-529`)

On a **fresh** booking, before any arrival:

```bash
eval $CUST $(IDEM) -X POST $API/requirements/$REQUIREMENT2/crew/no-show/ \
  -d '{"party":"VENDOR","reason_code":"vendor_no_show"}'
```

**Expect** the booking fee refunded in **full** with no travel compensation — neither party earns
from an undelivered crew — the requirement back in `MATCHING` for a free re-dispatch, and now, new
in C4, a `VENDOR_NO_SHOW` standing event against the lead. Until this wave that last sentence was
in a docstring and nowhere else.

---

## What this script deliberately does not do

- **It never moves wage money, and there is no endpoint that could.** If a future change adds a
  checkout, a funding call or a payout release to the A3 shift-day path, it has contradicted
  ADR-0009 and this runbook is the place it will show.
- **It does not check in or check out individual workers.** There is no such endpoint. `SIM-02`
  refuses per-worker attendance with offline sync outright, and building it later would be a device
  dependency this market cannot meet.
- **It does not settle a day on one person's tap.** Nothing can. The hourly
  `sweep_unproven_day_settlements` raises a one-sided claim to Operations after 24 hours and stops
  there, because only a human can resolve it.
