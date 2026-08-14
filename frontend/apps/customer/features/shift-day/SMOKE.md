# Wave A3F smoke script — the Customer's side of the A3 shift-day

**Owner-run. No test runner is involved and none is required.** This is the exact
sequence of clicks that proves `M2-FE-510` (confirm or dispute the day's
attendance in one tap), `M2-FE-514` (the evening "Day settled?" tap, the UPI
deep link and the per-worker-day settlement view) and `M2-FE-515` (the one-tap
cash-demand report) work against a real backend.

It starts where `features/crew/SMOKE.md` finishes: a **confirmed** A3 booking
with an engagement behind it. Everything below happens on
**`/engagements/{engagementId}/stages/{stageId}`** — on a workforce booking the
stage *is* the day, so there is no separate shift-day route and looking for one
means something routed you wrong.

Django on `:8000`, the customer app on `:3000`. Start the servers yourself — this
script never does.

---

## 0. What has to be true before you start

```
cd backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only
```

Then run **`features/crew/SMOKE.md` §1 through §7 to completion**, including §10
(the provider callback). You need to reach the state that script's §7.5
describes: the fee `ACTIVE`, the booking `CONFIRMED`, and an `Engagement` created
**by the callback**.

That callback is also what creates the shift-days: one `EngagementStage` per
booked day, labelled `Day 1`, `Day 2`, … each with its own `scheduled_on`. If you
have no stages, the engagement was not opened by a verified callback and nothing
below will work.

| Needed | Written by | Symptom when missing |
|---|---|---|
| A confirmed A3 booking with an engagement | the booking-fee callback | No stages; `/engagements/{id}` has an empty day list |
| A Partner with a **verified** crew roster | the seed's `_seed_crew`, whose `documents_verified_at` writer landed at 1.31.0 | Crew assignment refuses `m2_crew_roster_required`; no attendance is possible |
| `business_profile.upi_vpa` on that Partner | the seed (`m2demo{n}@vsolvedemo.test`) | The UPI link is absent. **§5 is where you check that this is stated honestly** |

**The seed publishes ₹900 per worker per day.** Every number on these screens
should trace to that or to an amendment you approved. **If a figure appears that
you did not configure, that is the bug this wave exists to prevent** — nothing in
the customer app computes, sums or guesses a settlement.

---

## 1. Getting to the day

1. Sign in as the Customer. Open **`/bookings/workforce`** and press into the
   booking → `/engagements/{engagementId}`.
2. The days are listed under **The days you agreed**, one row per booked day.
3. Press into **Day 1** → `/engagements/{id}/stages/{stageId}`.
4. Scroll past the stage review. Below it there is a horizontal rule and then
   **Who is coming**. That block is the whole of this script.

**On an A5 project stage this block must not appear at all** — not as an error,
not as an empty panel, not as a spinner. Open a project stage
(`/engagements/{a5-id}/stages/{stageId}`) and confirm the screen is exactly as it
was before this wave. The read is refused with
`409 m2_stage_transition_not_allowed` on a milestone and that refusal renders as
absence, and the panel is additionally never enabled off a `MANAGED_PAYMENT_REQUIRED`
engagement — so the request should not even be in the network tab.

---

## 2. Before anybody arrives

With no crew assigned yet, **Who is coming** must say nobody is named on this day
and explain that the supervisor names the crew before they arrive and that it can
be different people on different days. That is a **real state**, not an empty
list to apologise for.

Now assign crew as the Partner (Session B's screen, or straight at the API):

```
POST /api/v1/partner/crew/                      -> note a verified membership id
POST /api/v1/engagement-stages/{stage_id}/crew/
     { "membership_ids": ["<id>", ...], "reason_code": "" }
```

Reload the Customer's screen. Each worker shows:

- a **name**;
- **four masked digits** of phone;
- **Documents checked** only where we have actually checked them.

Check three negatives hardest:

1. **No worker id appears anywhere** — not in the DOM, not in the network
   response. The Customer's projection carries no `membership_id` and no
   `crew_member_id`; if you can find one, the disclosure rule has been broken.
2. **No whole phone number.** Ever.
3. **An unverified worker is not badged "unverified".** Verified is stated;
   unverified is left blank. A red flag against somebody's name for a check we
   have not run is a claim about them we cannot stand behind.

---

## 3. Arrival, and the wait — `M2-FE-510` preconditions

```
POST /api/v1/engagement-stages/{stage_id}/arrival/
```

The Customer's screen must move to **They are here**, badged **Working**, naming
the arrival time from the server, and saying the supervisor records the count at
the end of the day. **There must be nothing to press.** The Customer cannot make
a supervisor record a day, and any control here would be one.

---

## 4. The one tap — `M2-FE-510`

### 4a. A full day: one tap and one tap only

As the Partner, record everybody present:

```
POST /api/v1/engagement-stages/{stage_id}/attendance/   { "present_count": 4 }
```

Reload the Customer. **Count the taps.** There must be exactly one control on the
happy path:

1. The heading reads **Is this right?**
2. It states **4 of 4 present** on the day's date, from the two published fields.
3. There is a single primary button, **Yes — that is right**.
4. **No confirmation dialog.** A full day agreed with the supervisor is not an
   irreversible financial decision needing a second gate — one tap is the
   requirement (`SIM-02`), and a dialog here is a regression.
5. **No per-worker list, no check-in times, no check-out times.** If the routine
   path ever asks the Customer who was present individually, the whole `SIM-02`
   position has been reversed: there is no per-worker attendance record on the
   server and a form asking for one would be inventing data.

**Look at the stage review above it.** While this decision is open, the generic
**Approve / Ask for a correction / Raise a problem** controls must be **gone**,
replaced by one sentence saying the day is decided by confirming who turned up.
This is not tidiness: `approve_stage` would approve the day and leave the
attendance unanswered with **no settlement row and no amount**. If those three
buttons are on screen beside the attendance confirm, press Approve and you will
reach exactly that dead end.

Press **Yes — that is right**. The panel becomes **You confirmed this day**,
badged **Agreed**, and §5's settlement appears.

### 4b. A short day: still one tap, but the choice is required

Do this on **Day 2**. Assign 4, arrive, then:

```
POST /api/v1/engagement-stages/{stage_id}/attendance/   { "present_count": 3 }
```

The Customer's screen must now:

1. Say **3 of 4 present** and that one of the workers booked did not come.
2. State, **before** any button, that today settles at the day rate for the
   people who **did** come whichever choice is made — the choice is about the
   missing days, not about their money.
3. Offer **three** controls, each one tap: **Carry on short**, **Ask for an extra
   day**, **Cancel the missing workers**.
4. Each carries its own consequence sentence. Read **Ask for an extra day**
   carefully: it must say the extra day is the professional's to offer, at the
   published rate, and that they have to agree — **it is a request, not a
   booking.** If this screen ever implies an extra day is now scheduled, it is
   committing a vendor's labour on their behalf.

Press one. A confirmation appears (this one *does* confirm — it also confirms the
count, which cannot be undone). Confirm it.

**Then check the money in §5: the day must settle at 3 × ₹900, not 4 × ₹900 and
not "the job price".** That is the whole of `M2-BE-537` and the single most
important number in this wave.

### 4c. The dispute — the only place per-worker detail exists

On **Day 3**, get to the same "awaiting you" state, then press **Dispute this
count** under *That is not what happened*.

1. The dispute is behind a disclosure and **not** beside the confirm. If a
   per-worker form is on screen for every ordinary evening, the shape is wrong.
2. **What actually happened** is required. Try to submit with everything blank —
   the button must stay disabled and say a dispute with nothing in it tells us
   only what the status already says.
3. **Add somebody** adds a name + what you say happened. Add two. Remove one.
4. Submit. The confirmation must say the day will not be approved automatically,
   the amount stays unconfirmed, and — the sentence that matters —
   **Vsolve is not holding your wage money, so nothing is held back**. What stops
   is the record agreeing, not a payment.
5. After it lands: **You disputed this day**, badged **With us**, your own words
   echoed back.
6. **§5 must show no amount** on this day, and must say so in words rather than
   showing ₹0. A count nobody agrees on is not an amount either.

---

## 5. The evening — `M2-FE-514`

Back on Day 1 (or Day 2 for the short day).

1. **The figure.** *Today comes to* is the server's `amount_paise`, formatted.
   Beside it, read out separately:
   - `N workers at ₹900 each` with `Everybody you booked` or `3 of 4 came`;
   - **Extras you both agreed**, only when there are any.
2. **Check the arithmetic against the server, not against the screen.**
   `GET /api/v1/engagement-stages/{stage_id}/shift/` and confirm
   `settlement.amount_paise == per_worker_paise * workers_present + extras_paise`.
   That equality is a **database check constraint**; the screen displays the
   total and does not reproduce the multiplication. If the screen ever disagrees
   with `amount_paise`, the screen is computing something and that is the defect.
3. **The direct-payment sentence must be present and unmissable:** you pay the
   professional directly, today, and **Vsolve is not holding this money and never
   has**. If this panel ever reads like a Vsolve payment, that is the defect
   `M2-FE-514` exists to prevent.
4. **The UPI link.** See the known gap below before judging this one.
5. **The tap.** *Did you settle up today?* → **Yes — we settled today**. It must
   say plainly that it moves no money, that it records that *you say* today was
   settled, and that the professional taps the same thing on their side.
6. After tapping: **You said today was settled — they have not answered**, badged
   **Waiting on them**. Read it carefully. It must say this is *not* the same as
   saying it was not paid. A one-sided claim rendered as "settled" would make the
   whole tap trail worthless in the one argument it exists for.
7. Now tap the **supervisor's** half (Session B's `M2-FE-513`, or
   `POST /api/v1/engagement-stages/{stage_id}/settlement/` as the Partner). The
   Customer's panel becomes **You both said today was settled**, badged
   **Settled**, with the date and *the amount is fixed and will not change*.
8. **Do it in the other order too** on another day: supervisor first. The
   Customer must see **The professional says today was settled**, badged **Needs
   your answer**, and — the sentence worth checking — *if you did not pay them,
   do not confirm it*. A screen that nudges a Customer to agree they paid
   somebody they did not is the failure mode here.

### The UPI link — a gap that was open at 1.30.0 and is closed at 1.31.0

The shift-day read used to answer `upi_payment_link: null` on **every** request,
even when the professional had a VPA: `DaySettlementSerializer` declared the
field over a model attribute that did not exist, and only the settlement
command's own view injected a real link. The backend closed it with a
`SerializerMethodField`, wire shape unchanged, and this column deleted its
compensating fallback rather than leaving it beside the fix.

**So the check is now the plain one, and the reload is the point:**

| When | Expect |
|---|---|
| Before you tap | **Open your UPI app for ₹X** — the link is on the read now |
| After you tap | Unchanged; the link is still there |
| **After a page reload** | **Still there.** This is the regression check — if it vanishes, the read has stopped carrying the field again |

Check the link itself: `upi://pay?pa=m2demo1@vsolvedemo.test&…&am=900.00&cu=INR`.
The amount in it must equal `amount_paise` to the paise. **Nothing in the client
assembles this string** — grep the customer app for `upi://` and you should find
it only in comments.

Then reach the genuinely absent case on purpose: clear `upi_vpa` on the
professional's business profile and reload. The panel must say **we do not have a
UPI link to open for this one**, still show the amount, and **never** say the
professional has no UPI address — the amount is what a Customer standing in their
hallway needs, not a remark about somebody else's payment setup.

---

## 6. The cash demand — `M2-FE-515`

It is in **two** places, deliberately: on the shift-day (with the day attached)
and on `/engagements/{engagementId}` as a whole (with no day). A report that
needed a live shift-day to attach to would be one nobody could file the next
morning.

1. Read the two paragraphs above the button. The second must point at **change
   requests** by name and say that overtime and add-ons are priced by us at the
   published rates and come as something to agree or refuse — **never as cash on
   the day**. The link must land on the amendment panel.
2. Press **They asked me for extra in cash**.
3. **The confirm button must be live with everything blank.** Both fields are
   optional and marked so. This is the whole design: a required amount turns
   "they demanded extra" into a form, and the form is what stops it being
   reported. If you cannot send it empty, the task has been missed.
4. Read the consequence. It must say the report is **not proof on its own**, that
   one report changes nothing, that a **pattern** is what matters, and that
   nothing happens to the booking and no money moves. **It must not promise that
   anybody will be removed, warned, fined or contacted** — while the owner's
   threshold is unset, nothing at all happens to the vendor, and this screen
   cannot know whether it is set.
5. Send it empty. The panel becomes **Thank you — that is recorded**, repeating
   that a single report decides nothing, and telling the Customer they still owe
   the published rate for work actually done and should not pay the extra to keep
   the peace.
6. Confirm at the API that a `CashDemandReport` row exists with a null amount.
7. **Press it again on the same day.** The idempotency key is scoped to
   engagement + day, so the second send must **replay** rather than create a
   second row — one complaint must not count twice towards a threshold that can
   end somebody's trade. Check the row count.
8. Send one **with** an amount, from a different day. Type `2000`; the row must
   carry `amount_claimed_paise: 200000`. Type `20.5` and it must send **without**
   an amount and say so beforehand — whole rupees only, and an unusable input is
   dropped rather than guessed at.

---

## 7. The refusals worth reaching on purpose

| Do this | Expect |
|---|---|
| Confirm the attendance from a stale tab after the supervisor changed the count | `409 m2_stage_transition_not_allowed` → **This day has moved on**, with **Refresh** and no resend |
| Confirm a short day without choosing (only reachable at the API) | `409` — the screen never offers a bare confirm on a shortfall, which is the point of the three buttons |
| Tap **Yes — we settled today** before anybody recorded the day | `409` → **There is nothing to settle yet**. The screen normally hides the tap in this state; reach it from a stale tab |
| Answer a day you already answered | The server returns the existing record; the panel shows the answered state rather than a second decision |
| Open a shift-day on an engagement that is not yours | `404`, rendered by the shared refusal path — never a `403`, because existence is private |

---

## 8. What is deliberately **not** here

- **The supervisor's half of the dual tap** (`M2-FE-513`) is Session B's, in the
  partner app. This script taps it at the API in §5.7 only to prove the
  Customer's side renders `SETTLED`.
- **Confirming crew arrival from the Customer's side on days 2..n.** Day one's
  arrival is `M2-FE-429` and lives on the booking screen. Either party may record
  a later day's arrival, and this wave does not add a second Customer control
  for it — the panel states the waiting honestly and offers nothing.
- **Proposing overtime or an add-on.** That is the vendor's, through the
  amendment engine, and the Customer approves it in the existing amendment panel
  at the card's published rates. §6.1 checks the signpost, not a new control.
