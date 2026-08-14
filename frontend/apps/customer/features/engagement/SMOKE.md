# Wave A3 smoke script — the stage spine, from the Customer's side

**Owner-run. No test runner is involved and none is required.** This is the
exact sequence of clicks that proves the shared engagement spine works against a
real backend: the two lists, the stage review, amendments, the agreement history
and the one chronological record.

It **starts where `features/access/SMOKE.md` finishes** — that script gets you an
engagement. Run it first, or reuse the engagement it left behind.

Everything below assumes the dev stack the repo already runs: Django on `:8000`,
the customer app on `:3000`. Start the servers yourself — this script never does.

---

## 0. What has to be true before you start

| Needed | Why | Symptom when missing |
|---|---|---|
| One A3 engagement (`LEAD_ONLY`) | `/bookings/workforce` and every A3 sentence | The list is empty and says so |
| One A5 engagement (`MANAGED_PAYMENT_REQUIRED`) with a funded stage | `/projects`, the stage review, the money numbers | The list is empty; a stage cannot be submitted against |
| A **review window** configured | Otherwise `review_due_at` is null on every stage | Every stage says "No deadline is set" — see §3, and check that state on purpose |
| A **payout-hold window** configured | `payout_release_due_at` | The approval panel omits the hold sentence, correctly |
| An **amendment response window** configured | `ScopeAmendment.expires_at` is not nullable | The Partner's change request refuses with `409 m2_policy_unavailable` and no amendment ever reaches this app |
| `PAYMENT_PROVIDER = fake` | Stage funding and a managed positive amendment both need a captured charge | See §7 |

Two of those are owner-blocked policy values. **Seeing the fail-closed states is
part of the pass**, not an obstacle to it — §3 and §5 say which screen each one
produces.

---

## 1. The two lists — `M2-FE-509`, `M2-FE-608`

1. Sign in as the Customer. The header now carries **My requests** and **My
   projects**. Both are new; if you do not see them, you are signed out.
2. Go to **`/projects`**. For each A5 engagement, check the row shows:
   - `n of m stages done` — **counted in stages, not money**. A finished A3 job
     shows its real count; if you ever see a percentage derived from rupees,
     that is the bug this was written to avoid.
   - **Agreed** and **Funded**, both straight off the engagement's published
     running totals.
   - **exactly one** next action. Two is a bug.
3. Go to **`/bookings`** → follow *"Those bookings are here"* → **`/bookings/workforce`**.
   Check:
   - the **direct-payment reminder is above the list**, not inside a row;
   - there is **no Funded column** — Vsolve holds nothing on A3, and a "Funded
     ₹0" beside a live job reads as a failure;
   - nothing anywhere calls it a protected or guaranteed booking.
4. Confirm an A5 engagement appears on `/projects` and **not** on
   `/bookings/workforce`, and vice versa.

---

## 2. The workspace — `M2-FE-608`, and the Wave A2 panels still standing

1. Open a project from the list → **`/engagements/{id}`**.
2. Check the money block reads **three published numbers**, not a subtraction:
   *Originally agreed*, *Changes added/took off* (only when there are any), and
   *Agreed now*. `Agreed now` must equal `Originally agreed + changes` — it is a
   database constraint, so a mismatch is a server bug and worth reporting as one.
3. Check **Who is doing this**: the professional's name (or the sentence saying
   it is shared before they arrive), and on A3 the agreed crew composition —
   *n people for m days at ₹X per person per day*. If the quote read is refused
   the panel degrades to one sentence and a link; that is correct, and it must
   **never** show a red error box.
4. Confirm **no phone number appears anywhere.** Nothing publishes one at 1.25.0.

---

## 3. The review clock — the state that moves money on its own

Open a stage that is `AWAITING_REVIEW`: **`/engagements/{id}/stages/{stageId}`**.

**With a review window configured**, the top of the screen must say the stage is
approved automatically on a named date *and* that raising a problem is the only
thing that stops it. Check the countdown is measured against the **server**
clock: change your machine's clock by ten minutes and reload — the deadline must
not move.

**With no review window configured** (delete or expire the policy row), the same
screen must read **"No deadline is set for this — nothing is approved
automatically."** It must never render as time in hand and never show a
countdown. This is the single most important negative check in the wave.

**After disputing** (§5), it must read **"The clock is stopped."**

---

## 4. Approve — `M2-FE-609`, the button that releases money

1. On a **project** (A5) stage, read the *This is done properly* panel. It must
   say the stage amount is set aside for the professional and becomes theirs when
   the hold ends.
2. Press **Approve**. The confirmation must repeat the money sentence — a
   confirmation that cannot state what happens is a speed bump, not a
   confirmation. Confirm.
3. The stage moves to **Approved**, and the engagement's *Approved* running total
   moves by the stage amount. **Check the engagement totals, not the stage**:
   this is the wave's whole argument for reading published totals.
4. Now do the same on a **workforce** (A3) stage. The panel must say the opposite
   thing: this records that the day was done, **no payment is sent**, and the
   Customer still owes the professional directly. Same button, two different
   sentences, decided by `commercial_mode`.
5. Try to approve a stage that is **not** `AWAITING_REVIEW` by pasting its URL.
   No buttons are offered at all, and the screen says there is nothing to decide.

---

## 5. Correction and dispute — the two that are not approval

1. On an `AWAITING_REVIEW` stage, use **Ask for it to be corrected**. Check:
   - the panel says **no money moves** and that this does not change what was
     agreed;
   - it explicitly points at a change order for anybody wanting something
     *different*;
   - the button is disabled with an explanation until you type a note.
2. Submit it. The stage reads **Sent back to be corrected** and your note is
   shown back to you under *What you asked for*. **No money number changes.**
3. Have the Partner resubmit. Confirm the review window **restarts from zero** —
   you are looking at different evidence.
4. Now **Raise a problem**. Check before pressing:
   - it says it stops **only this stage** and that the rest of the job carries on;
   - it says anything already paid out stays paid out;
   - "Something else" refuses to submit without words.
5. Confirm. The stage reads **You raised a problem**, the clock panel says
   **stopped**, and — the load-bearing check — **the engagement is still ACTIVE
   and its other stages still move.** A disputed stage must never render as a
   frozen job.
6. From a second tab still showing the old state, press **Approve**. The server
   answers `409 m2_stage_disputed` and the screen must say the work is already
   disputed and offer **Refresh**, never the same button again.

---

## 6. Amendments — `M2-FE-610`, `M2-FE-511`

This is the screen whose single failure mode is a proposed change reading as
agreed scope. Check it in that order.

1. As the Partner, propose a change: a `TIME_EXTENSION` on the A3 engagement
   (days only — the server prices it) and a `CHANGE_ORDER` on the A5 one (lines,
   at least one of them **negative**).
2. Back on `/engagements/{id}`, the request appears in its own bordered block
   with a **"Requested — not agreed"** badge. Now check the thing that matters:
   - the money block **above** it still reads the old *Agreed now*;
   - the agreement history below shows **no new version**;
   - the comparison reads *Agreed now* / *This change adds/takes off* / *If you
     accept, it becomes* — and the third is labelled as a projection.
3. **Decline** one. Nothing changes; it moves to *Earlier requests* reading "You
   said no. Nothing changed."
4. **Accept** the A3 extension. `checkout` is `null`, so it applies immediately:
   the *Agreed now* total moves, a new version appears in the history, and the
   extra shift-days appear in the stage list.
5. **Accept** the A5 change order with a **positive** delta. The panel must
   switch to **"Waiting for your payment to clear"**, with **nothing to press**,
   and the agreement total must **not** move. Complete the charge (§7), refresh,
   and only then does the total move and a version appear.
6. **Accept** an A5 change order with a **negative** delta. `checkout` is `null`
   — the refund is issued before the scope shrinks. Check the copy says so.
7. Paste the same acceptance again while it is pending. It must return the same
   attempt and **never** start a second charge.

---

## 7. Capturing a charge by hand

Stage funding and a managed positive amendment are both real charges, and
`POST /api/v1/payment-attempts/{id}/simulate-capture/` now works for M2 purposes
(it answered `403` until 1.25.0). From the Django shell or that endpoint:

```
POST /api/v1/payment-attempts/{payment_attempt_id}/simulate-capture/
```

Then refresh the engagement. **Never** conclude anything from the redirect: the
screens resolve outcome only from the engagement and amendment reads.

---

## 8. The record and the history — `M2-FE-512`, `M2-FE-613`

1. Scroll to **Everything that has happened**. Every event you produced above
   should be there, oldest first, and each row says either *"Automatic — no one
   had to do anything"* or *"Somebody decided this"*.
2. Let a review window **lapse** on a stage you have not touched. The
   auto-approval must appear in the timeline as an **automatic** row. If it
   reads the same as your own approval, the timeline is lying about who decided
   and that is a release blocker.
3. **What was agreed, and how it changed** must list version 0 (the original
   total) plus one row per **applied** amendment, and its last total must equal
   *Agreed now* above. A proposed or declined amendment must appear **nowhere**
   in this list.

---

## 9. Completion — `M2-FE-511`

1. Approve every stage. The engagement moves to `COMPLETING` on its own.
2. **Is this finished?** appears. Confirm it. The engagement reads *Finished* and
   the request it came from closes as complete — check `/requests/{id}`.
3. Try `POST /engagements/{id}/completion/` while a stage is still open. It
   answers `409` and the screen says something is still open, with **Refresh**.

---

## 10. The three not-built blocks are gone — all three tasks have landed

This section used to list three dashed, clearly-labelled blocks that offered
nothing to press. **All three are now built and the `NotBuiltYet` component is
deleted from this app**, so the check has inverted: if you ever see a dashed
"not available yet" block on a Customer engagement screen, something has been
reverted.

| Where | What stands there now | Task | Script |
|---|---|---|---|
| A3 stage review | One-tap attendance confirm/dispute, the evening settlement | `M2-FE-510`, `514` | `features/shift-day/SMOKE.md` |
| Completion panel | Deliverable acceptance, the named completion blockers, warranty retention and the fault route | `M2-FE-611` | `features/project/SMOKE.md` §1–§4 |
| A cancelled or disputed A5 project | The vendor-replacement decision, or the explainer when none is proposed | `M2-FE-612` | `features/project/SMOKE.md` §5 |

Two things from the old check still hold and are worth re-reading there: the
warranty panel must never invent a release date, and the replacement panel must
never grow a Pay button.

---

## 11. Exception states worth forcing

| Force it by | Expect |
|---|---|
| Signing out mid-session, then reloading `/projects` | The shell's login prompt, not an empty list |
| Blocking `GET /engagements/` in devtools | "We could not show your projects" with **Try again** — never "No projects yet" |
| Blocking `GET /engagements/{id}/amendments/` only | The agreement and stages still render; the change panel fails **on its own** and says it does not know whether one is waiting |
| Blocking `GET /engagements/{id}/events/` only | The timeline fails alone and says the record itself is safe |
| Pasting another Customer's engagement id | `404`, rendered as gone-or-not-yours, with no retry loop |
| An engagement whose `commercial_mode` is neither published value | It appears on **neither** list, and both lists say a record exists that they will not describe |

---

# Wave J addendum — contract 1.28.0 consumption (2026-08-14)

Three things the generated client now carries that this screen did not consume.
Run these **after** §1–§11 above; they need the same engagements.

## J1. A material advance stops reading as a work milestone — `EngagementStage.kind`

You need an A5 estimate with **at least one material line**. Have the Partner
submit one (`ProposalMaterialLine` — title, quantity, unit, amount) alongside its
work stages, and select it. The engagement opens with the material lines laid
out **after** every milestone; that ordering is the server's, and if a materials
row is ever first, report it as a backend bug rather than a display one.

1. On `/engagements/{id}`, find the materials row in **The stages**. It must
   carry a **`Materials`** badge beside its status badge. A milestone must carry
   no kind badge at all — the ordinary case is untagged on purpose.
2. Its funding line must read **"This pays for materials the professional buys
   for your job — it is not work being done. Once it is spent on goods it is not
   returned the way unfinished work is…"**, and its button must read **"Pay for
   these materials"**, never "Fund this stage". This is the whole point: what a
   Customer consents to here is not what they consent to on a milestone.
3. Check the amount on that line is the **face value** with nothing subtracted.
   No visit money comes off it, exactly as for a work stage.
4. Open the materials row → the stage review. Check **all four** of:
   - the heading over the evidence list reads **"What the professional bought"**,
     not "What the professional showed";
   - the approve panel reads **"The materials are what we agreed"**, not "This is
     done properly";
   - the correction panel reads **"The materials are not right"** and its field
     asks *what is wrong with them*;
   - the money panel carries the sentence that this money is **not returned the
     way unfinished work is**.
5. **Nothing is removed.** Approve, correction and dispute must all still be
   offered on a materials row — the server permits all three, and hiding the
   dispute would take away the only objection to a delivery that never arrived.
   If any control has vanished, that is the bug.
6. Open the same project on `/projects`. When the materials row is the next thing
   to pay for, the row's one sentence must read **"Pay for the materials so the
   professional can buy them"** and never "Fund the next stage to start it".
7. **The negative check.** Do the same walk on an A5 project with no material
   lines. Every row must be untagged and every sentence must be the work wording
   from §4 — the kind copy must be invisible when there are no materials.

## J2. The receipt number — `M2-FE-418`, `Engagement.access_receipt`

1. On `/engagements/{id}`, scroll to **The record**. The sentence *"A receipt or
   invoice is not available from here yet"* must be **gone**.
2. On an A5 project whose visit plan was charged, a **Your receipt number** block
   appears with an `M2A-…-n` number, *Your site visits*, and the amount.
3. On an A3 booking that went through the ₹149 unlock, the same block appears
   reading *Seeing your quotes in full*.
4. Check what it does **not** say. There is no download link and there must never
   be one — `AccessReceipt` carries a number, not a document — and it must not
   use the word *invoice*: GST treatment of both access fees is still an open
   owner decision, so it is a receipt reference and says so.
5. **The null case is a pass, not a gap.** On an engagement reached without an
   access fee — an A5 plan covered entirely by a reclassification credit is the
   clean way to produce one — the block is replaced by *"There is no access-fee
   receipt number on this agreement."* It must **not** claim nothing was ever
   paid: the field cannot tell "no fee" from "credit-covered" from "predates
   numbering".

## J3. The two cache keys — invisible unless you look for them

Nothing on screen changes. What changes is which cache entry the reads live in,
so this is checked by behaviour rather than by appearance.

1. Open `/engagements/{id}` and leave it for a few minutes. Have the Partner
   **propose an amendment**. Switch back to the tab (focus it) — the change
   request must appear without a hard reload.

   > This step passed before this pass as well, and saying otherwise would be
   > false: the amendment list borrowed the agreement *key* but never its
   > `SESSION_STATE` tier, and all three tiers refetch on focus anyway. What the
   > move buys is separability and an honest tier name, which steps 2 and 3
   > actually test — this step only proves nothing regressed.
2. Approve a stage. The engagement totals, the stage, **the event timeline and
   the amendment panel** must all refresh from the one invalidation, with no
   manual reload. Both keys are still nested under the engagement detail, so this
   is the check that the nesting survived the move.
3. In devtools, block `GET /engagements/{id}/amendments/` only. The agreement and
   the stages must still render and the change panel must fail on its own — same
   as §11, and worth re-running because the key moved.
