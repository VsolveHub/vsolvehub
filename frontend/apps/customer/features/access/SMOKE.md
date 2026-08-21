# Wave A2 smoke script — A3 unlock and A5 visit plan, end to end

**Owner-run. No test runner is involved and none is required.** This is the exact
sequence of clicks that proves the two money doors work against a real backend,
plus the two places you have to reach past the browser because the server does
not publish a route for them yet.

Everything below assumes the dev stack the repo already runs: Django on
`:8000`, the customer app on `:3000`, and the admin login documented in the
project memory. Start the servers yourself — this script never does.

---

## 0. What has to be true before you start (Operations setup)

Both doors **fail closed** by design, so an unconfigured environment shows you
the refusal states rather than the flow. That is correct behaviour and it is
worth seeing once, but for the happy path you need:

| Needed | Why | Symptom when missing |
|---|---|---|
| An effective `M2AccessPrice` row for the unlock | `pricing.unlock_price()` fails closed | `price_paise: null`; the panel says "We cannot offer this yet"; `POST` refuses `m2_access_price_unavailable` |
| An effective `M2AccessPrice` row per visit tier | `pricing.available_visit_plan_tiers()` returns none | `available_tiers: []`; the review chooser says we cannot offer visits here yet |
| A non-responsive rejection cap | Owner decision | The reject dialog offers no replacement and says so; `POST .../reject/` refuses `m2_policy_unavailable` |
| `PAYMENT_PROVIDER = fake` | Nothing else can be captured by hand | See §5 — the capture step |
| An A3 and an A5 `M2VariantConfiguration`, each on a serviceable area | `m2_lifecycle_not_supported` otherwise | The four-screen flow refuses at screen 1 |

Verify the first two in one request each, as the Customer:

```
GET /api/v1/requirements/{id}/unlock/       -> price_paise must not be null
GET /api/v1/requirements/{id}/visit-plan/   -> available_tiers must not be []
```

---

## 1. A3 — teasers and the unlock

1. Sign in as a Customer. Go to **`/requests/new`** and pick a service whose
   variant is configured A3 (workforce: helpers, housekeeping, support staff).
2. Walk the four screens. On **Review**, confirm there is **no visit-plan
   chooser** — it must not render for A3. Press **Send this request**.
3. You land on the sent panel. Follow **your request** to
   **`/requests/{id}`**.
4. State should read **Finding professionals**, and the quotes panel should say
   *No quotes yet* with the sentence that nothing is charged until one arrives.
   **There must be no price and no unlock button on this screen yet.**
5. As a Partner (second browser profile), accept the enquiry and submit a
   complete A3 quote. Rate, days and headcount; it must clear the minimum-wage
   floor, or you will get `m2_wage_floor_unavailable` / `m2_proposal_below_wage_floor`.
6. Back on **`/requests/{id}`**, refresh. You should now see:
   - a **teaser row**: a price *band*, a vendor type, a Verified badge;
   - **no vendor name, no contact, no scope, no exact total** — check the
     network payload of `GET .../quotes/teasers/`, not just the screen;
   - the unlock control, reading **"Unlock the quotes for ₹X"** where ₹X came
     from the server. If it says a number you did not configure, that is a bug.
7. Press it. `POST /requirements/{id}/unlock/` returns `201`. The panel switches
   to **"We are confirming your payment"** and **offers nothing to press**.
   This is the state to look at hardest: there must be no success, no quotes and
   no second button.
8. **Close the tab.** Reopen `/requests/{id}`. It must come back to the same
   pending state — the recovery path reads the unlock from the requirement id
   alone.
9. Complete the charge (§5). Refresh. The panel reads **"You have unlocked these
   quotes"** and offers **Read the quotes**.
10. Press it → **`/requests/{id}/quotes`**. Every quote is readable in full.
    Confirm there is **no contact detail anywhere**, at any status.

### The refusals worth seeing on purpose

- Press unlock twice quickly: the second call returns the *same* attempt. There
  must never be two `PaymentAttempt` rows for one unlock.
- Delete the effective price row and reload: the panel must say *we cannot offer
  this yet* and must **not** print 149.

---

## 2. A5 — the visit plan, chosen on review

1. `/requests/new` → a service configured **A5** (project work: event
   production, interiors, construction outcome).
2. Walk to **Review**. The **visit-plan chooser is on this screen** — 1 / 2 / 3
   professionals at server prices. Confirm:
   - it is a control on review and **not a fifth screen** (the stepper still
     shows four);
   - **Send this request is disabled** with the sentence *"Choose how many
     professionals should visit before you send this. It costs nothing now."*
3. Choose **2**. Nothing is charged. The row marks as **Chosen** and the screen
   says you can change it until the first professional confirms.
4. Change it to **3**, then back to **2**. Re-choosing must succeed — this is
   the case a shared idempotency key would break.
5. **Send this request.** Go to `/requests/{id}`.
6. The visit panel reads *"You asked for 2 professionals to visit… **Nothing has
   been charged.** You pay ₹X once, when the first one confirms a time."* Two
   rows, both **Waiting for a professional**, each showing its share of the plan
   and that it comes back if nobody takes it.

---

## 3. A5 — the first confirmation opens the checkout

1. As a Partner with an A5 capability, open the enquiry and **confirm a visit
   slot** (`POST /partner/enquiries/{id}/visit-slots/`). The response carries
   `opens_plan_checkout: true` and the visit reads `REQUESTED`.
2. Back on `/requests/{id}`, refresh. You should see:
   - a banner: **"A professional has confirmed a time"**, with **Book your
     visits**;
   - slot 1 badged **Holding a time for you** — *not* Confirmed. This is the
     distinction the whole flow turns on: a held slot is not a booking.
3. Press **Pay ₹X and lock the visits** on `/requests/{id}`.
   - The payment breakdown opens on the request page; the URL does not change.
   - It states the professional and the time.
   - It says **one payment for the whole plan**, and that unfilled visits refund
     themselves.
   - The amount is `chargeable_paise`, not the tier price, if any credit exists.
4. Press **Pay ₹X for the plan**. `POST .../visit-plan/checkout/` returns `201`.
   The screen switches to *"We are confirming your payment"* with **nothing to
   press**.
5. **Close the tab and reopen `/requests/{id}`.** Same pending state.
6. Complete the charge (§5). Reload `/requests/{id}`:
   - the plan reads **charged**;
   - slot 1 is **Confirmed** with its time in the checkout picker's own format;
   - slot 2 is still **Waiting for a professional** with its refundable share.

---

## 4. A5 — visit day, estimate, selection, engagement

1. On a **Confirmed** slot, issue the arrival code on the Customer visit page.
   As the Partner, enter it into **Arrival code** and press **I've arrived**.
   `POST /partner/site-visits/{id}/arrival/` moves the row to **On site**. There
   is no tap-only arrival or completion bypass.
2. To see the no-show branch instead, use a second slot: press **They did not
   come**, read the consequence, confirm. `POST /site-visits/{id}/no-show/` is
   sent with `party: "VENDOR"`. **There is deliberately no control that can send
   `CUSTOMER`** — the server refuses a party reporting its own absence with a
   `403`, and this app never offers it.
3. As the Partner: complete the visit, then submit the A5 estimate **against
   that completed visit** (`site_visit_id` on `POST /proposals/`). Submitting
   without one must refuse `m2_visit_not_completed`.
4. Back on `/requests/{id}`: the slot reads **Visited**, the professional is now
   **named**, and its money line reads *"₹A of your ₹B goes to the professional
   who came and wrote your estimate."*
5. Press **Read the estimates** → `/requests/{id}/quotes`. **Confirm there is no
   paywall anywhere**: scope, stages, inclusions, exclusions, warranty, tax and
   total are all readable, and nothing asks for money. If you find a gate, the
   wave is wrong.
6. With two estimates present, check the **Side by side** table:
   - *What you pay* is normalised — an `EXCLUSIVE` quote shows total + tax;
   - the assumptions block is separate, captioned, and **not ranked**.
7. Press **Choose this one**. The selection panel reads **"has not confirmed
   yet"** with **"This is not a booking yet"** and a countdown. The other cards
   lose their Choose control.
8. As the Partner: **decline** the selection. Refresh — the panel must say the
   entitlement survives and **choosing another costs nothing more**, and the
   Choose controls come back.
9. Select again; as the Partner, **reconfirm**. The panel goes to **Confirmed**
   with **See what happens next** → `/engagements/{id}`.
10. On the engagement:
    - **A3** must read *"You pay the professional directly"*, badged **Not a
      Vsolve booking**. If it ever reads as a protected booking, that is the
      defect `M2-FE-415` exists to prevent.
    - **A5** reads *"You pay through Vsolve, one stage at a time"*, lists the
      stages, and offers **Fund this stage — ₹X** on the **first** one only.
      Confirm the stage amount is the **face value** and that nothing subtracts
      the visit-plan money from it.

---

## 5. Completing a charge — the step that is not in the browser

**`POST /api/v1/payment-attempts/{id}/simulate-capture/` does not work for any
M2 charge, and neither does `GET /api/v1/payment-attempts/{id}/`.** Both resolve
ownership through `checkout__customer`, and every M2 access attempt is created by
`commerce.services.initiate_standalone_payment_attempt` with `checkout=None`. The
first answers `403`, the second `404`. This is logged in
`Django_Next.js_Plan/M2/frontend-execution-plan.md` §7.

So the capture is driven from the Django shell. From `backend/`:

```python
# python manage.py shell
from django.db import transaction

from apps.commerce.models import PaymentAttempt
from apps.commerce.providers import FakePaymentProvider
from apps.commerce.services import apply_provider_payment

attempt = PaymentAttempt.objects.filter(
    purpose__startswith="M2_",          # M2_QUOTE_UNLOCK, M2_VISIT_PLAN, M2_STAGE_FUNDING
).order_by("-created_at").first()
assert attempt.provider_order_id, "the outbox consumer has not created the order yet — run the worker"

payment = FakePaymentProvider.record_payment(
    provider_payment_id=f"fake_pay_{attempt.id.hex}",
    provider_order_id=attempt.provider_order_id,
    amount_paise=attempt.amount_paise,
    currency=attempt.currency,
)

# `apply_provider_payment` takes a row lock, so it needs a transaction around it.
with transaction.atomic():
    apply_provider_payment(payment=payment, provider_code=FakePaymentProvider.code)
```

Then reload the customer screen. **Do not shortcut this by setting
`attempt.status = CAPTURED`** — the webhook path is what grants the unlock and
hardens the held visit slot, and setting a status skips all of it, which is
precisely the divergence between dev and production that this flow must not
have.

---

## 6. The refusals that arrive on a well-formed request

Worth reaching once each, because both are states the screens are built for and
neither is retryable:

| Do this | Expect |
|---|---|
| Remove the effective unlock price, then press unlock | `409 m2_access_price_unavailable`; panel says *"We cannot offer this yet"*, **no Try again button** |
| Remove the visit tiers, then open Review on an A5 draft | `available_tiers: []`; chooser says we cannot offer visits here yet |
| Leave the rejection cap unset, then reject a quote as non-responsive | The dialog does not offer the replacement path at all; if you force the call, `409 m2_policy_unavailable` |
| Select from two tabs at once | One gets `409 m2_selection_conflict`; that tab says *"Somebody chose first"* and re-reads. **It must not retry the selection.** |

---

# Wave J addendum — contract 1.28.0 consumption (2026-08-14)

## J4. Visit times are in the service area's own zone — `SiteVisit.timezone`

`SiteVisit.timezone` landed at 1.26.0 and the tracker was formatting every slot
in the deprecated single-city constant until this pass. That was correct while
the platform was Hyderabad-only and silently wrong the day it was not.

1. Book a visit plan and get one slot confirmed (§3–§5 above).
2. On `/requests/{id}`, read the slot time on the visit tracker. It must match
   the time the **Partner** sees for the same reservation, to the minute.
3. **Change your machine's timezone** to something far away — US Pacific will do
   — and reload. The slot time must **not move**. A Customer travelling must not
   watch their visit shift; that is the whole reason the zone is read rather than
   defaulted to the device.
4. Set the service area's `timezone` to a different real zone in Django, reload,
   and confirm the displayed time moves **with the area**. That is the check that
   the value is genuinely being read and not just pinned to Asia/Kolkata.
5. The estimate-due line on a completed visit and the held-slot sentence on
   `/requests/{id}` use the same formatter — check both moved too.

## J5. The no-show vocabulary — `VisitNoShowReasonEnum`

Fixed at the 1.26.0 regeneration; verify it rather than assume it.

1. On a scheduled slot where nobody arrived, press **They did not come**.
2. It must succeed. A `400` here means the client is sending the retired
   lowercase slug `vendor_did_not_arrive` instead of the published
   `VENDOR_DID_NOT_ARRIVE`, which is now a required enum.
3. Check the slot moves to owing a **free replacement visit** and that nothing is
   charged. `party` decides the money, never the reason code.
