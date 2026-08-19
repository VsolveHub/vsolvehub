# Wave A2R smoke script — the A3 rate-card front door, end to end

**Owner-run. No test runner is involved and none is required.** This is the exact
sequence of clicks that proves the published rate, the crew cascade, the booking
fee and the two day-one outcomes work against a real backend — plus the two
places you have to reach past the browser, which are the same two as Wave A2.

The A2 script (`features/access/SMOKE.md`) still applies unchanged: the teaser
and unlock surface is the **thin-supply fallback** now, not the primary door, and
§9 below is where you check that it still works.

Django on `:8000`, the customer app on `:3000`. Start the servers yourself — this
script never does.

---

## 0. What has to be true before you start

Every value on this path is an open owner decision and **the whole path fails
closed**, so an unseeded database shows you refusal states rather than the flow.
That is correct behaviour and §8 is where you look at it on purpose. For the
happy path:

```
cd backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only
```

| Needed | Written by | Symptom when missing |
|---|---|---|
| A published `RateCard` for the area + skill | `_seed_rate_card`, through `publish_rate_card` so the wage floor is checked | `is_available: false`, `unavailable_code: m2_rate_card_unavailable`; the screen offers the quote flow and **prints no number** |
| `M2VariantConfiguration.a3_preset_question_schema` + the nine cascade / booking-fee knobs | `_seed_a3_configuration` | `409 m2_policy_unavailable` on **every** book; the preview always reports unavailable |
| A `ServiceArea.state_code` on the address's area | the seed | `m2_rate_card_unavailable` — the wage-floor check cannot run without one, and a guard that silently skips is indistinguishable from one that passed |
| An approved-A3 Partner with a **verified roster ≥ the headcount you ask for** | the seed's three vendors | No offer is ever accepted; you sit in the holding state and eventually see the fallback |
| `PAYMENT_PROVIDER = fake` | settings | §7 cannot be completed |

**The seed publishes ₹900 per worker per day** (wage 700 + supervision 150 +
booking fee 50). Every one of those is a placeholder for an owner decision.
**If the screen ever shows a number you did not configure, that is the bug this
wave exists to prevent** — nothing in the customer app computes, defaults or
guesses a price.

Verify in one request, as the Customer, against a draft A3 requirement:

```
GET /api/v1/requirements/{id}/rate-card/
    -> preview.is_available must be true
    -> preview.total_customer_paise, lead_receipt_paise, booking_fee_paise all non-null
```

---

## 1. The front door is on the service page

1. Sign in as a Customer. Open the catalog and go to a **workforce** service —
   one whose `request_archetypes` contains `A3_TIME_BLOCK` (the seed's helpers /
   day-labour service).
2. The primary action must read **Book a crew**, with **Get quotes instead**
   beside it as the outline button.
   - On an **A5** service there must be exactly one action, **Tell us what you
     need**. If "Book a crew" appears on a project service, the archetype gate is
     wrong.
   - On an ordinary **A1** service, **Check price and availability**, unchanged.
3. Press **Book a crew** → **`/requests/book/{service-slug}`**.

---

## 2. The preset — `M2-FE-425`

1. The screen is **one screen**, not the four-screen flow. If you see a progress
   stepper across the top, you are on the A5 shape and something routed you
   wrong.
2. **The layout is two columns from `lg` up**: the form on the left, the price
   rail on the right, and the rail sticky as the form scrolls. Narrow the window
   below `lg` and the rail must move **below** the form and stop being sticky. A
   rail that follows you down a phone screen is the defect.
3. **The questions are the server's, and so is their order.** They come from the
   variant's own published question list, rendered by `display_order`. **Nothing
   here is hardcoded**, so the check worth making is the negative one: remove a
   question from the variant in Django, reload, and confirm the field is gone.
4. **The control is chosen from the data, not from the question's code.** A
   `NUMBER` question renders as a stepper, a short choice list with no option
   descriptions renders as chips, and a choice list *with* descriptions keeps
   stacked cards. Add a description to an option in Django and the chips must
   become cards — losing the server's own words to save space is not a trade
   this form makes.
5. Fill it in. Choose an address (the M1 picker, with the same serviceability
   check the cart runs) and a **Start from** date.
6. **Book this crew** is disabled until every required question, the address and
   the start date are present.

---

## 2a. The address dialog

Shared with the requirement flow and the checkout, so a defect here is a defect
in four places. Reach it from the accent-bordered **Where** row.

1. **Nothing commits until you confirm.** Highlight a saved address and press
   **Escape**. The row behind the dialog must be **unchanged**. Do it again with
   a backdrop click and with **Cancel** — all three are cancels. Reopen: the
   abandoned row must not still be highlighted.
2. **Use this address** is the only thing that commits.
3. **Focus.** Tab to the Where row and open it with the keyboard. Focus must land
   inside the dialog; Tab must cycle within it and never reach the page behind.
   Close it and focus must return **to the Where row** — not to the top of the
   document.
4. **Add a new address** →
   - the pin block says **Pin the location first**, and **Save and use** does
     nothing until you press **Use my location**. This is not a nicety:
     `AddressRequest` requires coordinates and there is no forward geocoder, so
     a typed-only address genuinely cannot be saved.
   - after locating, the fields fill in and are **editable**. Change the flat
     number. Confirm the *edited* value is what gets saved — the old flow saved
     the geocoder's guess unseen, which is why so many saved addresses have the
     wrong first line.
   - the **Save it as** chips set the label. Pick **Other** and a text field
     appears.
   - type a pincode and the coverage verdict appears **inside the dialog**.
     An uncovered pincode is a warning, never a block — Operations can serve
     areas the lookup has not caught up with.
5. **Errors stay inside.** Force a save failure. The message must render in the
   dialog, must **not** also appear on the page behind it, and the close button
   must stay enabled throughout.
6. A newly saved address is selected outright — no second confirm. Somebody who
   has just typed an address into a dialog headed "Where is the work?" has
   answered the question.

---

## 3. The rate, beside the form — `M2-FE-426`

**There is no "see the rate" step any more.** The rail prices what is on the
form, and it re-prices as the form changes.

1. **Nothing is priced until an address is chosen.** The card is resolved through
   the requirement's service area, so before that the rail shows an em dash and
   the sentence "Choose where the work is…" — **never a zero**. A blank total
   reads as "not known yet"; `₹0` reads as free.
2. **Choosing an address writes the draft.** Watch the network tab: `POST
   /requirements/` then one `PATCH` carrying the address, then a rate read.
3. **Now press the People stepper twice, quickly.** In the network tab you must
   see:
   - **exactly one** further `GET .../rate-card/?headcount=3&days=…` — the
     presses collapse into one read, 400ms after the last one;
   - and **no `PATCH` at all**. Changing the size costs a read, never a write.
     A draft write per press of a stepper is the defect this design removed.
4. While that read is in flight the rail's figures **dim** and carry `aria-busy`.
   They are the *previous* size's real figures — true numbers for a job the
   Customer has stopped asking for — so they must be marked, not blanked and not
   left looking current.
5. The rail must carry, all from the server:
   - the published **day rate** as the rail's one hero number, on the dark plate,
     with the city from the chosen address beside it;
   - what counts as a day, and the **overtime hourly rate**;
   - the total for *this* headcount × *these* days;
   - **cash to the crew**, with the **per-day** figure underneath it;
   - **booking fee, to us** — the only money we collect;
   - three collapsed rows: what the rate includes, what can change the price
     (the card's add-on rates), and the cancellation rules.
6. **The two customer-facing components must add to the total.** Cash to the crew
   + booking fee = total, to the paise. They are separate server fields and
   nothing on the screen adds them up — this check is on the *server's*
   arithmetic, and if it fails, the client is right and the card is wrong.
7. **The per-day cash is a server field, not a division.** It is
   `lead_day_receipt_paise`. Set a card where the total does not divide evenly by
   the day count and confirm the per-day figure is still the server's number
   rather than a rounded quotient.
8. **The supervision margin must appear nowhere.** It is deliberately not
   published to the Customer, and it must not be reconstructible by subtraction
   from anything on the screen.
9. **The "You pay the crew directly" block is open on the page, never behind a
   chevron.** It must say in as many words that we do not hold the wage money and
   that payment for the work, refunds on it and any guarantee about it are
   between the Customer and the vendor. The three disclosures above it are
   explanation and may collapse; this one is a disclosure in the legal sense and
   may not. If this screen ever reads as a protected booking, that is the defect
   `M2-FE-415` exists to prevent.
10. **Unprice it.** Point the address at a city with no published card. There
    must be **no booking control at all**, the server's own `unavailable_reason`
    on screen, a link to the quote flow — and **not one rupee figure anywhere**.

---

## 4. Booking charges nothing — `M2-FE-425`

1. Press **Book this crew**. The line under it must name the booking fee and say
   it is paid **only when a supervisor accepts**.
2. **Watch the order of calls.** There must be a `PATCH` carrying the answers
   *immediately before* `POST .../rate-card/book/`. This is the load-bearing one:
   the rail has been pricing by query string, which writes nothing, so the draft
   still holds whatever size was last saved — and the book command prices the
   **draft**. Skip that `PATCH` and the Customer is booked at a size they never
   saw priced.
   - The test worth running by hand: set People to 5, wait for the rail to show
     five people's total, press Book, and confirm the created booking's headcount
     is **5**. If it is 1, the sync is broken.
3. `POST /requirements/{id}/rate-card/book/` returns `201`. You land on
   **`/requests/{id}`**.
4. Confirm in the database or the admin that **no `PaymentAttempt` exists**. This
   call charges nothing; the fee is charged at vendor accept.

### The duplicate override — the branch most likely to be broken

1. Book once. Without changing anything, start a second identical booking from
   `/requests/book/{slug}` at the same address and dates.
2. The book must refuse `m2_requirement_duplicate` and the screen must offer
   **These are different jobs** and **See my requests**.
3. Press **These are different jobs**, then **Book this crew** again. **It must
   succeed.** If it refuses again — with a duplicate or with an idempotency-key
   complaint — the stored key was not spent at the decision, and the override is a
   dead end. This is the exact regression `clearBookAtRateKey` exists to stop.

---

## 5. The holding state — `M2-FE-427`

1. On `/requests/{id}`: **"Finding your crew"**, "Usually within 2 hours", and a
   **wave strip** beside a summary rail.
2. **The strip is the server's, column for column.**
   - One column per configured wave — four with the seeded
     `crew_cascade_max_waves`, not the three the mock drew.
   - The **current** wave names how many supervisors are holding the offer. Kill
     one invitation in the admin and the count must drop.
   - Only the **next** wave shows a time, counted down off `next_wave_at`. Waves
     after it say **If needed** and carry no time at all — their timing depends
     on offers that have not been sent, and a projected schedule here would be a
     promise nobody can keep.
   - On the **final** wave, no column shows a countdown. There is no next wave to
     count down to.
3. **There is still nothing required to press.** A Customer cannot make a
   supervisor accept. The two **While you wait** actions are optional and the
   heading says so — they exist so Cancel is not the only button on the page.
4. The rail must say **Nothing charged yet** and name the fee they *would* pay.
5. It re-reads on its own. The A3 cascade runs on the M1 dispatch clock in
   **minutes**, so leave the tab open and confirm the strip advances without a
   manual refresh.
6. **Unconfigure the cascade** (clear `crew_cascade_max_waves`). The strip must
   disappear entirely rather than render a guessed wave count — the whole
   `cascade` object goes null, fail-closed like every other reader of that
   configuration.

---

## 6. A lead accepts — the offer hold

1. As an approved-A3 Partner (second browser profile, or straight at the API):
   `POST /api/v1/partner/crew-offers/{invitation_id}/accept/`.
   - The offer screen shows the **lead's own number** — what they receive per day
     — and no customer total and no booking fee at any status.
   - Accepting with a verified roster **smaller than the headcount** must refuse
     `m2_roster_insufficient`. Worth reaching once: the Customer sees nothing
     change, which is correct — the cascade simply moves on.
2. Back on `/requests/{id}`: **A supervisor has accepted your job**, badged
   **Holding it for you**, with a live countdown off `hold_expires_at` and the
   server's own clock. Confirm the countdown ticks and is not computed from the
   device clock.
3. **There is still no vendor name.** Identity is released by the confirmation,
   not by the hold.
4. Press **Confirm this crew — ₹Fee** → **`/requests/{id}/book-crew`**.

### The confirmation screen

1. The countdown is in the **top bar**, not the body. The fee is the rail's hero
   number and the only large figure on the page — the timer must not compete
   with it.
2. **The supervisor is still unnamed here**, and the screen says the name comes
   with the confirmation. If a name appears before payment, the identity rule has
   been broken somewhere on the server.
3. Press **Pay ₹Fee and confirm**. A dialog opens and **nothing is charged yet** —
   check the network tab. Press **Not now**, then Escape, then the backdrop: all
   three are cancels, no `POST` is sent, and the hold survives every one.
4. The dialog names UPI/card/netbanking as the *next* step rather than listing
   saved methods. There is no stored-instrument endpoint, and rows here would be
   a saved-card list this product does not have.
5. **Refunded in full if nobody arrives** is open in the dialog, not behind the
   disclosure beside it. It is a promise, not an explanation.

---

## 7. The booking fee — `M2-FE-428`

1. The checkout states: the crew and days at the day rate, what is paid direct at
   day end, and **Booking fee to pay now**. It repeats that the fee is the only
   money Vsolve collects.
2. Press **Pay ₹Fee and confirm the crew**. `POST .../booking-fee/checkout/`
   returns `201`.
3. The screen switches to **"We are confirming your payment"** and **offers
   nothing to press**. Look at this hardest. There must be no success, no crew
   name, no engagement and no second button. Every control that could exist here
   is a way to pay twice.
4. **Close the tab. Reopen `/requests/{id}/book-crew`.** It must come back to the
   same pending state — the recovery reads the fee from the requirement id alone,
   which is all a Customer on another device has.
5. **Complete the charge (§10).** Reload:
   - the fee is `ACTIVE`, the booking is `CONFIRMED`;
   - `/requests/{id}` reads **Your crew is confirmed** and **now names the
     supervisor**;
   - an **Engagement** exists, created by that same callback and not before;
   - **Open this booking** goes to `/bookings/workforce`.

### The refusal this screen is built for

Let a hold **lapse** without paying, then press the pay button from a stale tab.
`409 m2_booking_fee_not_chargeable` must render as **"Nobody is holding this job
any more"** — nothing charged, we are still looking, **no Try again button**.
If you get "That option is no longer available" instead, the explicit branch was
lost and the code is falling through the frozen `errors.ts`.

---

## 7a. The confirmed booking, as a receipt

Land on `/engagements/{id}` the moment the fee verifies.

1. It opens with **"Your crew is confirmed"**, the supervisor's name — the server
   publishes it *now* and not before — and **one card per day**, side by side
   from `sm` up.
2. **The day cards are the engagement's own stages.** A3 writes one
   `EngagementStage` per shift-day at confirmation, each with `scheduled_on` and
   the whole crew's cash for that day. Book **three** days and confirm three
   cards appear with three dates. If a card shows a divided figure rather than
   the stage's own `amount_paise`, something is computing money.
3. The rail's hero is **cash for day one**, not the booking total. It is the only
   figure somebody has to act on before tomorrow morning.
4. The **booking fee receipt** and its `M2A-` reference appear once the server has
   issued one, and not before.
5. **The day controls appear exactly once.** They used to be mounted twice on this
   screen — two copies of the same two buttons, either of which could be pressed.
   Search the page for "They have arrived": one match.
6. No start time is printed anywhere. The frozen terms carry a shift *length* and
   no start time, and nobody ever asked the Customer for one.

---

## 8. Day one, and the money — `M2-FE-429`

On a confirmed booking, **On the first day** offers exactly two controls.

1. **They have arrived** → `POST .../crew/arrival/`. Non-OTP, and this is the
   **default** path in M2 rather than a degraded one. The fee moves to `EARNED`
   and the panel reads *"Your crew arrived — the ₹X booking fee is settled.
   Everything else is between you and the supervisor."* **Nothing is paid out
   here.**
2. **Nobody came** → read the consequence, confirm. `POST .../crew/no-show/` is
   sent with `party: "VENDOR"` and `reason_code: "vendor_no_show"`.
   **There is deliberately no control anywhere in this app that can send
   `CUSTOMER`** — `party` decides the money, and offering the Customer a button
   that forfeits their own fee would be indefensible. Expect:
   - the fee **refunded in full**, badged **Refunded**, saying nobody earns from
     a crew that did not deliver;
   - the request back in **matching** for a **free re-dispatch**;
   - the vendor's standing carrying the record.
3. **The forfeit branch** is reached from the other side — a lead reporting
   `customer_no_show` or `gate_locked`, or a late cancel. The Customer's screen
   must then read **"Your ₹X booking fee was not returned"**, badged
   **Forfeited**, with **both halves named and priced from the server**: to the
   supervisor for the journey his team made, and kept by Vsolve. They must
   reconcile to the fee in paise. **No percentage is ever shown** — the split
   ratio is owner configuration this client has no copy of.
4. **Cancel this booking** appears on a paid, unsettled booking. The confirmation
   states **both** outcomes because the client does not know which applies: inside
   the free window the fee comes back whole, outside it the fee forfeits and
   splits. **T is server configuration and is not published on any read**, so no
   number and no deadline may appear in that dialog. With T unset the command
   refuses `m2_policy_unavailable`, which renders as a support path and not a
   retry.

---

## 9. The fallback is still there, and it is still the fallback

1. **Thin supply.** Suspend or unapprove every A3 Partner so nobody can accept,
   then book. Let the cascade run past its configured threshold. The booking
   moves to `FELL_BACK` and `/requests/{id}` must show:
   - **No supervisor took this at our published rate**, badged **Now collecting
     quotes**;
   - **nothing has been charged**, said plainly;
   - **the Wave A2 teaser / unlock surface beneath it**, working exactly as
     `features/access/SMOKE.md` §1 describes. If the unlock door is gone, the
     wave is wrong — it is the thin-supply fallback and it stays.
2. **No published card.** Delete the effective `RateCard` for the area and skill,
   then open `/requests/book/{slug}` and price a preset. The screen must say **we
   do not have a published day rate for this yet**, in the server's own
   `unavailable_reason`, offer **Get quotes instead**, and **print no number
   anywhere**. There must be no book control at all.
3. A request that never used the instant path must show **only** the quote
   surface — never an empty crew panel above it, which would imply a crew is
   coming.

---

## 10. Completing a charge — the step that is not in the browser

Unchanged from `features/access/SMOKE.md` §5, and for the same reason: **no M2
payment attempt is readable or capturable by its own Customer.** Both
`GET /payment-attempts/{id}/` and `simulate-capture/` resolve ownership through
`checkout__customer`, and an M2 charge is created with `checkout=None`. Logged in
`Django_Next.js_Plan/M2/frontend-execution-plan.md` §7.

From `backend/`, `python manage.py shell`:

```python
from django.db import transaction

from apps.commerce.models import PaymentAttempt
from apps.commerce.providers import FakePaymentProvider
from apps.commerce.services import apply_provider_payment

attempt = PaymentAttempt.objects.filter(
    purpose="M2_BOOKING_FEE",
).order_by("-created_at").first()
assert attempt.provider_order_id, "the outbox consumer has not created the order yet — run the worker"

payment = FakePaymentProvider.record_payment(
    provider_payment_id=f"fake_pay_{attempt.id.hex}",
    provider_order_id=attempt.provider_order_id,
    amount_paise=attempt.amount_paise,
    currency=attempt.currency,
)

with transaction.atomic():
    apply_provider_payment(payment=payment, provider_code=FakePaymentProvider.code)
```

**Do not shortcut this by setting `attempt.status = CAPTURED`.** The webhook path
is what moves the fee to `ACTIVE` **and creates the engagement**; setting a status
skips both, which is precisely the divergence between dev and production this
flow must not have.

---

## 11. The refusals worth reaching on purpose

| Do this | Expect |
|---|---|
| Book with `a3_preset_question_schema` unset | `409 m2_policy_unavailable`; the screen says so and offers the quote flow. **No price appears.** |
| Book with no published card | `409 m2_rate_card_unavailable`; same, and no retry button — nothing the Customer presses publishes a rate |
| Pay the fee twice from two tabs | The second returns the *same* attempt. There must never be two `PaymentAttempt` rows for one booking |
| Pay after the hold lapsed | `409 m2_booking_fee_not_chargeable`, rendered as §7's named branch |
| Cancel with the free-window T unset | `409 m2_policy_unavailable`, rendered as a support path. **Never a guessed refund** |
| Open `/requests/{id}/book-crew` on an A5 request | An honest state, not a 404 — the screen renders whatever the server says |
