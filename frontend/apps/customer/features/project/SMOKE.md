# Wave A5P smoke script — the Customer's side of the A5 project

**Owner-run. No test runner is involved and none is required.** This is the exact
sequence of clicks and shell commands that proves `M2-FE-611` (deliverable
acceptance, project completion, warranty retention and the fault route) and
`M2-FE-612` (the vendor-replacement path) work against a real backend, at
contract **1.31.0**.

Everything below happens on **`/engagements/{engagementId}`** — the A5 project
workspace. There is no separate `/projects/{id}` detail route; `/projects` is the
list and the detail has lived on `/engagements/{id}` since Wave A2.

Django on `:8000`, the customer app on `:3000`. Start the servers yourself — this
script never does.

---

## 0. What has to be true before you start

```
cd backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only
```

The seed writes the two owner-blocked warranty values —
`warranty_retention_basis_points` and `warranty_window_days`, **5% held for 90
days**, invented and marked dev-only. Without them an A5 estimate that promises a
warranty is refused at the composer with `m2_policy_unavailable`, which is the
correct fail-closed behaviour and an undemonstrable one.

Then run **`features/access/SMOKE.md` §2 through §4 to completion** to reach an
A5 engagement with milestones on `/engagements/{id}`.

> ### The one step in that script you must not skip for this one
>
> At §4 step 3, when you submit the A5 estimate as the Partner, **fill in the
> warranty terms field**. `retention_paise` is frozen at engagement creation from
> `proposal.warranty_terms` — an estimate that promises nothing funds nothing,
> and the whole warranty half of §1 and §5 below will correctly render as
> "Vsolve is holding nothing back". That is a real state worth seeing once (§1.1),
> but you need the other one too.

---

## 1. The warranty panel before anything is finished — `M2-FE-611`

Open `/engagements/{engagementId}` on a project whose estimate carried warranty
terms. Scroll past the completion section to **Money held back for the warranty**.

1. It reads that you pay **every stage in full**, and that a share of what the
   professional earns is held by Vsolve. **If it ever says money is being
   withheld from your payments, that is the defect this panel exists to
   prevent** — retention is payout-side, and the funding controls further up the
   same screen charge face value.
2. It says the hold **builds up as each stage is approved** and is complete when
   the last one is. **It must never name a milestone it comes out of** — not
   "held back from the final stage", not "taken from stage 4". An amendment can
   append a milestone, which is exactly why the server allocates it cumulatively.
3. **Held so far** and **Held by the end** are two separate numbers. Before any
   stage is approved the first is ₹0 and the second is 5% of the project.
4. It states plainly that **there is no release date yet**, because the warranty
   has not started. No date may appear here.

Now approve a milestone (`features/engagement/SMOKE.md` §4) and reload. **Held so
far** must climb. Cross-check in the shell:

```python
# python manage.py shell
from apps.requirements.models import Engagement
e = Engagement.objects.get(pk="<engagementId>")
print(e.retention_paise, e.retention_withheld_paise)
```

The two numbers on screen are these two fields, formatted. If the screen shows a
third number, something is computing.

### 1.1 The variant with no retention

On a project whose estimate carried **no** warranty terms, the same section reads
**"Vsolve is not holding any money back on this project."** Confirm it goes on to
say that this is *not* the same as saying there is no guarantee — the terms are
the ones on the estimate. **A panel that says "you have no warranty" is wrong**:
this app was never given those terms.

---

## 2. The handover, and the refusal that keeps delivery on the platform — `M2-FE-611`

Nothing is handed over yet, so **no handover section is on the screen at all.**
That is deliberate: most projects are finished by standing somewhere, and
"nothing has been delivered yet" on a bathroom refit is an alarm about something
that was never going to happen.

Submit one as the Partner. The vendor's own surface is `M2-FE-606` and is not
built, so drive the command:

```python
# python manage.py shell
from apps.requirements import projects
from apps.requirements.models import Engagement

e = Engagement.objects.select_related("partner__user").get(pk="<engagementId>")

projects.submit_project_handover(
    engagement_id=e.id,
    actor=e.partner.user,
    note="Final gallery and the raw files.",
    items=[
        projects.DeliverableInput(title="Edited gallery", external_url="https://example.com/gallery"),
        # And a FILE, if you have an evidence row on this engagement:
        # projects.DeliverableInput(title="Invoice PDF", evidence_id=<StageEvidence uuid>),
    ],
)
```

Reload `/engagements/{engagementId}`:

1. **What the professional handed over** appears, badged **Waiting for you**,
   with the vendor's note and each item.
2. The **LINK** row shows the https address as a real link, opening in a new tab,
   and says underneath that it **opens somewhere outside Vsolve** and that we do
   not hold the files. If it ever presents a link as a hosted file, that is
   wrong — the row records a location, it does not store one.
3. The **FILE** row (if you added one) says it is **held by Vsolve** and that
   **opening files from this screen is not available yet**, and tells you not to
   accept a delivery you have not seen. No control opens it — there is no
   download route for the evidence rail (plan §7). A file whose evidence id is
   not on this engagement reads **"we cannot find the record for this file"** and
   tells you not to accept on the strength of its name.
4. The copy states the project **cannot be closed** until you answer this.

**Now prove that refusal.** Do not accept yet. Get the project to `COMPLETING`
(approve and release every milestone) and press **Confirm it is finished** — or
rather, confirm that the button is **not offered**: the completion section
instead reads *"The professional has handed over what they made for you and you
have not answered it yet."* If a button appears there, the panel is offering a
control that answers `409`.

Then press **Accept what was delivered**. The confirmation must say that if this
was the only thing outstanding it **also closes the project**. Confirm it.

---

## 3. Completion, and the blockers it names instead of guessing — `M2-FE-611`

The completion section is now the interesting one. Force each blocker and read
what it says. **In none of these cases may a "Confirm it is finished" button
appear.**

| Force it by | The section must read |
|---|---|
| A milestone in `AWAITING_REVIEW` / `PENDING` while the engagement is `COMPLETING` (accept an additive amendment after completion — it appends a stage) | *"There is still a stage outstanding… the new work keeps its own check, and confirming here would not sweep it through."* |
| Disputing a milestone (`features/engagement/SMOKE.md` §5) | *"A problem you raised on one stage is still open… it will not be closed around it."* |
| A submitted, unaccepted handover (§2 above) | *"…you have not answered it yet. Accept it below first."* |
| Nothing outstanding | The button, and a confirmation naming the retention that will be held |

The last one is the one to read carefully: when a retention exists, the
confirmation dialog says **a warranty period starts from today and ₹X of what
the professional earned stays held by Vsolve until it ends.** That is the
consequence of the press and it belongs before it.

Press it.

---

## 4. `WARRANTY`, not `COMPLETED` — read the status, never assume it

A project that withheld a retention moves straight to **`WARRANTY`**.

1. The header badge reads **Finished — warranty running**, never "Finished".
2. The completion section reads *"You confirmed this is finished"* and points at
   the warranty period **running**.
3. The warranty section is now **Your warranty is running**, with the held amount
   badged, and **until `<date>`** from the server's `warranty_ends_at`.
4. **If something goes wrong** appears: it says reporting a fault is not
   something you can do from this screen, to contact support, and to do it
   **before** the warranty ends because the money is released after that. There
   is no control, and there must not be one — no endpoint at 1.31.0 can carry a
   warranty claim (plan §7).

To see the null-date branch, clear `warranty_ends_at` in the shell. The panel
must say **"we do not have an end date for this warranty on file"** and that the
money stays held. **It must never invent a date.**

A project with **no** retention is terminal at `COMPLETED` and never reaches
`CLOSED`. Confirm its badge reads **Finished**, plainly.

## 4.1 The release

```python
# python manage.py shell
from django.utils import timezone
from apps.requirements.models import Engagement
from apps.requirements import stages

Engagement.objects.filter(pk="<engagementId>").update(warranty_ends_at=timezone.now())
stages.close_warranty_window(engagement_id="<engagementId>")   # or run sweep_warranty_windows
```

Reload. The status is **`CLOSED`**, and the warranty section reads **The warranty
period is over** — the held amount **has been released to the professional** —
and says this closes the platform's side and gives up no legal right.

---

## 5. The vendor-replacement path — `M2-FE-612`

**Operations proposes; the Customer accepts.** There is deliberately **no
Customer control that starts a transfer** anywhere in this app — their remaining
cost changes, and 07 §7 does not let either party change the other's agreement.
If you find one, the wave is wrong.

First, on a live A5 project with unfinished milestones, **dispute one milestone**
and confirm the proposal below refuses with `m2_stage_disputed`. Resolve it, then
propose:

```python
# python manage.py shell
from apps.requirements import projects
from apps.requirements.models import Engagement
from apps.partners.models import PartnerProfile
from apps.accounts.models import User        # any Operations user

e = Engagement.objects.get(pk="<engagementId>")
remaining = projects.transferable_stages(e)
print([(s.position, s.label, s.amount_paise) for s in remaining])

replacement = PartnerProfile.objects.exclude(pk=e.partner_id).first()
ops = User.objects.filter(is_staff=True).first()

projects.propose_project_transfer(
    engagement_id=e.id,
    actor=ops,
    to_partner_id=replacement.id,
    reason_code="vendor_abandoned",
    note="They have stopped answering. This is the earliest anybody else can start.",
    # Every unfinished milestone exactly once, and no others. Price them higher
    # on the first run so you see the "costs you more" wording.
    quotes=[projects.TransferQuote(stage_id=s.id, amount_paise=s.amount_paise + 50_000)
            for s in remaining],
)
```

Reload `/engagements/{engagementId}`. Above the completion section:

1. **"We have found somebody to finish this project"**, badged **Proposed — not
   agreed**. The badge must never read "agreed", "updated" or "new professional".
2. **The replacement is never named.** `to_partner` is a bare id on the wire and
   this screen shows no vendor card. If a name appears, the disclosure ladder has
   been widened by a client.
3. The three totals: what the current professional was owed for the unfinished
   stages, what the replacement wants for the same work, and **It costs you ₹X
   more**. Cross-check against `ProjectTransfer.delta_paise` — the screen prints
   that field and does **not** subtract the other two.
4. **The per-milestone table.** Every unfinished stage, at the agreed price and
   the replacement's price. This is the point of the screen: a replacement who
   names one number for "the rest of it" has not said which milestones they are
   doing. Confirm the rows match `remaining` above exactly — same count, same
   labels, agreement order.
5. **What happens to your money** — four bullets. The one to read is *"There is
   nothing to pay for the change itself."* **If this screen ever grows a Pay
   button, that is the failure `M2-BE-545` is shaped to prevent**: the settlement
   is structural and the money asked for afterwards is the ordinary stage funding
   that was always coming.
6. The deadline line: *"The replacement is holding these dates until `<date>`."*

### 5.1 The materials that are not coming back

Give the project a **funded material advance** before proposing (fund a
`MATERIAL_ADVANCE` milestone). The proposal now carries a warning block:

> **₹X you paid for materials stays with the current professional**

Confirm it says the money is **not refunded and not handed to the replacement**,
that buying the same materials twice would cost you more, and that where the
goods went is a question for a person. **It must never render as a pending
refund, and it must never appear under a "refunded" heading.** A cancelled *work*
stage is the opposite sentence and is not made here.

### 5.2 Declining

Press **No, keep looking**. The confirmation says nothing changes. Confirm it,
reload: **"You kept the current professional"**, with the professional, the
stages and the prices all as they were.

### 5.3 Accepting

Propose again and press **Accept this replacement**. The confirmation names the
delta in words — *"will cost ₹X more than it would have"* — and says anything you
funded and nobody earned comes back **first**, that there is nothing to pay right
now, and that it cannot be undone.

After it lands:

1. The section reads **This project moved to a new professional**, badged
   **Replacement in place**.
2. **₹X went back to you** from `refunded_paise` — everything funded and
   unearned. If nothing was funded, it says so rather than showing ₹0 under a
   refund heading.
3. The engagement status is **Not started** and the copy says work restarts when
   you fund the first stage — *at the price you just accepted, and there is
   nothing extra to pay for the change itself.*
4. Scroll up: the milestone list now shows the **new** amounts, and
   `staged_total_paise = total_paise + amendment_delta_paise` still holds in the
   "What was agreed" panel — the delta moved by exactly the difference.
5. A funded material advance is now **Cancelled**, and its row says the materials
   are no longer part of the project and what was spent is shown above. It does
   **not** say the money is coming back.

Fund the first milestone. Work restarts.

---

## 6. Exception states worth forcing

| Force it by | Expect |
|---|---|
| Opening an **A3** engagement (`/engagements/{a3-id}`) | **No project sections at all.** The read refuses `m2_stage_transition_not_allowed` and it renders as nothing — a workforce booking has shift-days, not milestones. If an error appears there, the A5 gate is not being applied. |
| Blocking `GET /engagements/{id}/project/` in devtools | The stages, the money and the funding controls **still render** — they are on the engagement's own read. One sentence says the delivery and warranty detail could not be read. The warranty section renders **nothing**, deliberately: silence is not a claim about cover, and two error messages for one failed request read as a bigger fault than there is. |
| Editing `stage_prices` to hold a non-integer, or a stage id from another project | The per-milestone table is **replaced by a sentence**, not shortened. It must say the breakdown is unavailable and point at support — a table missing a row restates less work than the two totals are sums over. |
| Answering an **expired** transfer (set `expires_at` into the past) | *"This replacement is no longer on the table"* with **Refresh**. Never a retry of the same command. |
| Disputing a milestone between the proposal and the acceptance | *"A problem you raised has to be settled first"* — and the transfer does **not** go through. Transferring around a dispute would close the objection by deleting it. |
| Approving a milestone between the proposal and the acceptance | `m2_amendment_not_actionable` — *"the work left on this project changed after it was priced"*. The prices were for a list of work that no longer exists. |
| A `ProjectTransfer.status` this build has never seen | *"We cannot describe this"*, with **no controls**. The optimistic fallback here would be "a live proposal you can accept", and accepting moves a whole project. |
| Accepting a handover while a milestone is disputed | The acceptance is **rolled back with the completion** — the server runs both in one transaction. The screen says a problem you raised is still open, not "we could not save your acceptance". |


## 7. The request for more time — `M2-FE-614`

Added after Wave A4, because the gap Wave A5P logged in plan §7 turned out to be the one worth
closing: the command and the record were both published to the Customer, no wave owned the screen,
and **an unanswered claim expires**. Silence is a refusal by design — otherwise a professional could
move somebody's schedule by filing on a Friday afternoon — but that is only a protection if the
Customer was asked.

Precondition: a live A5 project with at least two milestones, both `PENDING` or later, and a vendor
who can act. Raise a claim as the vendor:

```
# python manage.py shell
from apps.requirements.models import Engagement, EngagementStage
from apps.requirements import projects
e = Engagement.objects.filter(commercial_mode="managed").latest("created_at")
first = EngagementStage.objects.filter(engagement=e).order_by("position").first()
projects.raise_delay_claim(
    stage_id=first.id,
    actor=e.partner.user,
    reason_code="site-not-ready",
    description="The site was still occupied on both days we were booked in.",
    extension_days=5,
)
```

Open `/engagements/{id}` as the Customer.

1. The panel is **above** the transfer and the handover. That placement is deliberate: it is the only
   one of the three the Customer loses by not scrolling.
2. Read the heading — *"The professional has asked for more time"* — and the badge, which says
   **Asked for — not agreed**. Never "extended" and never "agreed".
3. The first sentence under it says answering **costs nothing either way**, and that if the delay
   means extra work that comes separately as a change to agree and pay for. **There must be no
   amount anywhere on this panel.** The record has no amount column, deliberately: one record that
   could carry both would let "the site was locked" arrive as a bill.
4. **What each answer does** lists three things, and the first is the one to check:
   *this milestone and **every milestone after it** move by 5 days.* If it says only this milestone,
   the copy has drifted from `_shift_schedule_from`.
5. The clock line says who is waiting and what happens on silence: the request lapses and the agreed
   dates stand, and the professional can ask again.
6. Press **Give them 5 days**. Read the dialog before confirming — it names the milestone, says every
   later one moves, says nothing is charged, says the originally agreed dates stay on record, and
   says it cannot be undone. There is an optional note box.
7. Confirm. The claim moves into the history below as *"You gave 5 days, and the stages from … onwards
   moved by that much."* Check the milestone dates on the engagement actually moved.

### The three things that must be true, and the way to force each

| Force it by | Expect |
|---|---|
| Pressing **Keep the dates we agreed** on a fresh claim | The dialog says nothing changes, that it cancels nothing, penalises nobody and moves no money. That wording is load-bearing: a Customer who reads "no" as a complaint will pick "yes" to avoid making one. |
| Letting a claim expire (`ProjectDelayClaim.objects.filter(...).update(expires_at=<past>)`, then run `sweep_delay_claims`) | It renders in the history as *"Nobody answered in time, so the dates you agreed stood. Nothing moved."* — never as granted. |
| Answering a claim that expired while the page was open | *"This request has already been settled"* with **Refresh**, and the explicit sentence that nothing moved. Never a retry of the same command. |
| A `ProjectDelayClaim.status` this build has never seen | The live card renders *"We cannot describe this request"* with **no controls**, and a settled one says the app does not recognise how it ended. The optimistic fallback would be "a live request you can accept", and accepting moves every remaining date. |
| Raising two claims on two different milestones | **Both** appear, each with its own answer. One live claim per *milestone* is a database constraint, so a project with three milestones can genuinely have three — and answering two of three while the screen implies the project is settled would be lying about a clock that is still running. |
| Attaching evidence to the claim (`claim.evidence.set(...)` with stage evidence ids) | Each row reads with the **same wording the handover panel uses** for the same scan states. A file that is checked says it is held by Vsolve and that opening it from this screen is not available yet — the evidence rail still has no download route (§7). |
| Putting an evidence id on the claim that is not on this engagement | *"One file was attached that we cannot find a record of on this project."* Counted and reported, never silently dropped. |
| A claim raised with no description | *"The professional gave no explanation with this request. It is reasonable to ask for one before you answer."* Not a blank card. |
