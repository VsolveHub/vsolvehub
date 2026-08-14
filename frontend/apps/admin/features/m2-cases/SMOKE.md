# Smoke script — Operations cases, money and review signals (`M2-FE-706..711`)

Wave A4, contract 1.32.0. The exact clicks. **No automated test exists for any of this and none is
meant to** — `task.md` §"Verification convention" puts verification with the owner, and this file is
what that verification reads.

## 0. Preconditions

```
# Backend, from C:\dev\vsolve\backend, with DEBUG on
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only
.\.venv\Scripts\python.exe manage.py runserver
```

The seed prints a line beginning `Case       :` with a case id. Keep it.

```
# Frontend, from C:\dev\vsolve\frontend
pnpm --filter admin dev      # http://localhost:3002
```

Sign in at `http://localhost:3002` with **+918019013032**. The OTP is printed on screen in dev. You
will land on **Switch to Operations** — press it. That is expected, not a fault.

**What the seed does and does not give you**, because two of the six screens are meant to be empty:

| Seeded | Not seeded, on purpose |
|---|---|
| One `QUALITY` case, subject a **Partner**, severity `NORMAL`, `holds_payout: true` | No refund. A seeded refund no provider ever saw is a row the reconciliation sweep would correctly report as a mismatch |
| `case_response_window_hours: 16`, `case_appeal_window_hours: 56` on both variant configurations | No chargeback, for the same reason — it needs a captured `PaymentAttempt` behind it |
| `operations_touch_budget_per_request: 2` | No cancellation and no cancellation conflict |
| A rate card, an A3 and an A5 variant, three vendors | No evidence and no appeal on the seeded case — both are party actions |

An empty **Review signals** screen and a zeroed **Refunds and holds** screen are therefore the
correct first result. If they show numbers on a fresh seed, something else wrote them.

---

## 1. `M2-FE-706` — the case queue speaks M2

Go to **Cases** in the sidebar (`/operations/cases`).

1. The strip across the top shows five server-counted numbers: past our SLA, oldest breach, mine
   open, mine due soon, holding payout. **Holding payout should read 1** on a fresh seed. Below it,
   one line of per-team depths.
2. Open the **Kind** dropdown. Count the options: **fourteen plus "Every kind"**. Five of them are
   suffixed `(M2)` — conflicting cancellation, disputed attendance, disputed stage or milestone,
   off-platform payment claim, chargeback. If any is missing, the enum widened and the map did not.
3. Filter to **Quality or warranty**. The seeded case appears with a `NORMAL` badge and a
   **Holds payout** badge.
4. Click it. Check, in order:
   - the URL becomes `/operations/cases?case=<id>` — copy it, open it in a second tab, and confirm
     the same case opens. That is the whole reason the selection is a query parameter;
   - **Partner** appears under the subject row with a masked id. Nothing says "Request" — this case
     has no requirement, and a screen that showed one would be inventing it;
   - two clocks, side by side: **Our SLA** with a relative time, and **The parties answer by**
     reading *"No window configured — nobody is being timed out"*. That is correct for this case: a
     partner-subject case has no requirement to read a variant window from, so the seed passes
     `response_due_at=None` deliberately;
   - **This case is holding money** says *no earnings are frozen yet* rather than "0 entries". Also
     correct: `_hold_m2_payouts` returns early for a case with no requirement and no engagement;
   - **History** shows one `Opened` event with the summary as its body.

### The trap this step is really checking

Filter to each of the five M2 kinds in turn. Every one must render a queue (empty is fine) and none
may render a blank badge or the raw enum. A case kind with no copy renders an explicit warning
sentence naming the kind — that path exists so an unknown kind is *loud*, not invisible.

---

## 2. `M2-FE-707` — the consequence before the act

Still on the seeded case.

1. Press **Claim this case**. The claimed-by row changes to an operator id.
2. Press **Escalate to urgent**. A dialog opens **before** anything happens and states that the SLA
   tightens and the case jumps its team's queue. Cancel it. Nothing changed. Press it again and
   confirm — the severity badge becomes `URGENT` and the SLA moves in.
3. Under **The deadline the parties answer by**, pick a date in the *past* and watch the field say so
   against the server's own clock, with the button still disabled. Pick a future date, type a reason,
   press **Move the deadline**. The dialog states the parties get until that moment and that it
   cannot be moved back. Confirm. The "parties answer by" row now carries the date, and a
   **Response deadline set** event appears in the history with its context pairs — *not* a blank row.
4. Try to move it **backwards** now. The field refuses it before the request; if you defeat that,
   the server refuses it too. It is never clamped.
5. Under **Close this case**, choose an outcome. The dropdown holds exactly the outcomes the server
   published for `QUALITY` — callback booked, denied with reason, settled — and a sentence appears
   under the choice saying what it means. Type what happened and press **Close case**.
6. The confirmation says three things: what is recorded, that the **payout hold is released**, and
   that an overturned appeal would bring the hold back but not the money. Confirm.
7. The case now shows **Closed … as …** and the command panels are replaced by **Override the
   outcome by hand**.
8. Open the override panel. The current outcome is excluded from the dropdown. Choose another, type a
   reason, press the button — the dialog requires you to type the word **override** before it
   unlocks. Do it. The history now carries an **Outcome overridden by hand** event, in red, and both
   results are readable.

---

## 3. `M2-FE-708` — money, read and never computed

Go to **Refunds and holds** (`/operations/cases/money`).

1. **What Finance is carrying** shows a server timestamp and two counts, both `0` on a fresh seed,
   with the sentence "Nothing outstanding. This is a real zero from the server, not an empty panel."
2. **Payout held behind an open claim** shows `1` before you close the seeded case and `0` after.
   Re-run step 2 above in reverse order if you want to watch it move.
3. **Record a chargeback.** Fill it with a made-up payment attempt id and press **Record it**. Read
   the dialog first: it says a chargeback case opens, that it **freezes the vendor earnings funded
   from that payment**, and that the fee row is left as it is. Confirm. The server answers `404` —
   there is no such payment — and the screen says nothing changed. That is the honest end of this
   step without a captured payment to work from; with a real one, the panel prints the new case id
   and links straight to it.
4. Leave the amount blank, or the bank reference blank, and confirm the button will not arm. The
   bank reference is required because a chargeback with no reference cannot be reconciled.

### The `WAIVED` check — the one that matters most

**The money on one request** takes a request id (there is no Operations search over requests in the
contract, so it takes the id from the case you are working). Paste a requirement id from an A3
walkthrough that reached a booking fee.

- A fee that was **paid** prints as a bold amount.
- A fee that was **waived** — the free re-dispatch after a vendor no-show — prints the badge
  *"Replacement crew — no charge"* and the line **"Published amount ₹X — not collected."** It must
  never print as a bare amount, because that is money the Customer did not pay.
- The same applies to `OFFER_ACCEPTED`, `PENDING` and `FAILED`: an amount exists on the record and
  nothing was collected.
- A `FORFEIT_SPLIT` fee prints its travel-compensation and platform shares underneath, both
  server-sent. Nothing on the screen adds them up.
- Under the money events, "N other events on this request are not money and are not shown here"
  links to the full history. That sentence is load-bearing: it is how a new event type that this
  screen has never heard of stays visible instead of being silently swallowed.

---

## 4. `M2-FE-709` — the cancellation conflict

Needs a disputed cancellation, which the seed does not create. To force one:

1. As a Customer, request a cancellation on a live A3 booking after contact has been disclosed
   (`POST /requirements/{id}/cancellation/`). It answers `AWAITING_CONFIRMATION` with a deadline.
2. As the Partner, dispute it (`POST /cancellations/{id}/decision/` with `confirm: false` and a
   reason).
3. Back in Operations, filter the queue to **Conflicting cancellation**. The case is there, `HIGH`
   severity, holding payout.
4. Open it. A warning-toned panel says nothing was executed, that the vendor's unpaid earnings are
   frozen by the case rather than by a timer, and that a lapsed confirmation window arrives the same
   way a dispute does. The disputing party's account is the case detail; their evidence is below.
5. **Read the last paragraph of that panel.** It says whether contact was disclosed, whether work was
   reported started, and the calculated remedy are on the cancellation record — which only the two
   parties may read at 1.32.0 — and that this console does not have them and does not guess them.
   That sentence is the honest state of the feature and is logged as a contract gap in plan §7. If a
   later contract publishes those fields, this paragraph is what should be deleted.
6. The outcomes offered are `CANCELLATION_UPHELD`, `CANCELLATION_REVERSED` and `SETTLED` — a
   documented finding either way, never "reviewed" or "closed".

---

## 5. `M2-FE-710` — signals, not verdicts

Go to **Review signals** (`/operations/cases/signals`).

1. The first card says what a signal is here: something worth a person's attention, with its
   evidence, never an accusation and never an automatic consequence.
2. **Off-platform payment claim** and **Chargeback** are live queues over the case list, filtered by
   kind. On a fresh seed both are empty with an honest sentence — *"This is a real zero from the case
   queue, not an unchecked one."* Toggle **Open only** → **All** to include closed ones.
3. Each row links into the case, where the evidence and history are.
4. **Quote-slot squatting** and **Price-band clustering** are marked `GAP-009` and `GAP-010` and say
   plainly that no read exists at contract 1.32.0 — including *why* (the control for squatting is the
   Customer's own non-responsive rejection, which has no staff read; the price band is a
   Customer-facing teaser field with no reference band per variant). **Neither panel shows a number.**
   If either ever shows one without a contract change behind it, that number was invented.

---

## 6. `M2-FE-711` — what it costs to work a request

Go to **Touches** (`/operations/cases/touches`).

1. **Across the platform** shows the window, the requests touched, the total touches and the mean per
   *touched* request — plus a by-action breakdown. On a fresh seed these are zeroes and an explicit
   "A real zero, not a missing read."
2. **One request** takes a requirement id. Paste one that Operations has acted on (any rematch,
   deadline extension, reclassification or refund review writes a touch).
3. The verdict block is the point of the screen. With `seed_m2_demo` run, the budget is **2**, so you
   will see either **Within budget** (green) or **Over budget** (red) with the count against it.
4. **Now force the third state.** Clear the budget:

   ```
   .\.venv\Scripts\python.exe manage.py shell -c "from apps.catalog.models import M2VariantConfiguration as C; [c.extra.pop('operations_touch_budget_per_request', None) or c.save(update_fields=['extra']) for c in C.objects.all()]"
   ```

   Reload. The block must now read **No budget set**, grey, with: *"the owner has not set a
   touches-per-request budget, so there is nothing to judge this against… This is not a pass and it
   is not a breach."*

   **This is the fourth trap of contract 1.32.0 and the single most important assertion in this
   file.** `within_budget: null` rendering as green would report a design as inside an economics
   envelope nobody has drawn; rendering as red would page somebody about every request on the
   platform. It must render as neither.

   Re-run `seed_m2_demo` to put the budget back.
5. **Platform revenue on this request** is server-sent and carries the sentence about wages: on a
   workforce booking they are paid directly to the lead and never pass through the platform, so none
   of that money is in the figure. Nothing on this screen adds anything to anything.
6. **Every touch, with its reason** lists each one. A touch with no reason recorded says so in italics
   rather than rendering an empty line.

---

## 7. What must never happen

Worth one deliberate pass, because each of these is a specific failure this wave was built to avoid.

- No screen offers an **upload** control for case evidence. Evidence points at a file that already
  came through a scanned rail, and there is no third uploader and no minted link to the bytes.
- No screen offers an **amount field for a refund**. `refund-review` records a decision and moves no
  money on purpose; an Operations refund path with an amount box would be a second refund path with
  none of the first's reconciliation.
- No screen offers a **"New case"** button. Cases open from facts. The only case Operations opens by
  hand is a chargeback, through the payment it is about.
- No screen shows a **total it worked out itself**. Every figure is a server integer formatted once.
- No **event row is blank**. Fourteen event kinds have copy; an unknown fifteenth renders its own
  code and its context, never nothing.
