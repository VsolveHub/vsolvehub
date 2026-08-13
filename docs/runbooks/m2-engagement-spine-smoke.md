# M2 Wave C3 smoke script — the engagement spine

**What this proves.** One stage command spine serving both archetypes: an A3 shift-day and an A5
milestone move through the same start → evidence → review → approval → release commands, an
accepted scope amendment is the only thing that can change an agreed amount, and no payment-gated
state moves without a verified provider callback.

**What it replaces.** Nothing was tested. The build-first amendment in
`Django_Next.js_Plan/M2/task.md` (2026-08-13) suspends test authoring for the sprint and asks each
wave to ship the exact requests the owner runs instead. This is Wave C3's.

> **This is a development runbook.** It depends on `PAYMENTS_ALLOW_SIMULATED_CAPTURE`, which
> `config/settings/production.py` refuses to boot with. Do not run it against production.

---

## 0. Before you start

```powershell
cd C:\dev\vsolve\backend
.\.venv\Scripts\python.exe manage.py migrate
.\scripts\server.cmd
```

You need three sessions, and the cookie is per host, so use three cookie jars:

| Jar | Who | How to sign in |
|---|---|---|
| `cust.txt` | The Customer who owns the requirement | the customer app's OTP flow |
| `vend.txt` | The vendor whose proposal was selected | the partner app's OTP flow |
| `ops.txt` | Operations | `+918019013032`, dev OTP shown on screen |

Every `curl` below assumes:

```bash
API=http://localhost:8000/api/v1
CUST="curl -s -b cust.txt -c cust.txt -H 'Content-Type: application/json'"
VEND="curl -s -b vend.txt -c vend.txt -H 'Content-Type: application/json'"
OPS="curl -s -b ops.txt  -c ops.txt  -H 'Content-Type: application/json'"
```

**You need an engagement to start from.** C3 begins where C2 ended, so run the C2 flow first —
requirement → matching → proposal → unlock (A3) or visit plan (A5) → selection → vendor
reconfirmation — until `GET $API/requirements/{id}/selection/` returns an `engagement_id`. Then:

```bash
ENGAGEMENT=<that id>
$CUST $API/engagements/$ENGAGEMENT/ | jq '{commercial_mode, status, total_paise, staged_total_paise, amendment_delta_paise, stages: [.stages[] | {id, position, label, amount_paise, status, funding_state}]}'
```

**Read `commercial_mode` first.** `LEAD_ONLY` is the A3 path (§A). `MANAGED_PAYMENT_REQUIRED` is
the A5 path (§B). The stage commands are identical; the money is not.

> **Owner-blocked configuration.** Three new values fail closed. Until Operations sets them on the
> variant's active `M2VariantConfiguration`, you will see the honest consequences rather than a
> guess: `review_due_at` is `null` and no stage ever auto-approves; `payout_release_due_at` is
> `null` and no payout releases on a clock; proposing an amendment returns
> `409 m2_policy_unavailable`. To exercise §C and §D, set them first:
>
> ```powershell
> .\.venv\Scripts\python.exe manage.py shell -c "from apps.catalog.models import M2VariantConfiguration as C; C.objects.filter(status='ACTIVE').update(stage_review_window_hours=24, stage_payout_hold_hours=48, amendment_response_hours=24)"
> ```
>
> These are **dev values for the demo**, not an owner decision. Nothing in application code carries
> a default.

---

## A. A3 — a shift-day, start to release

`LEAD_ONLY` needs no funding: Vsolve collects nothing, so the stage releases the moment it is
approved and no ledger entry is written.

```bash
STAGE=<stages[0].id>

# 1. The vendor starts the day.
$VEND -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/start/ | jq '{status, started_at}'
#    expect: status IN_PROGRESS

# 2. Evidence. Presign, upload, finalize. `sha256` and `size_bytes` must match the bytes you send
#    or finalization refuses with m2_attachment_invalid — that is the check, not a formality.
SHA=$(sha256sum ./day1.jpg | cut -d' ' -f1)
SIZE=$(stat -c%s ./day1.jpg)
GRANT=$($VEND -X POST $API/engagement-stages/$STAGE/evidence/uploads/ \
  -d "{\"kind\":\"PHOTO\",\"content_type\":\"image/jpeg\",\"size_bytes\":$SIZE,\"sha256\":\"$SHA\"}")
echo $GRANT | jq
curl -s -X PUT -H 'Content-Type: image/jpeg' --data-binary @./day1.jpg "$(echo $GRANT | jq -r .upload_url)"
$VEND -X POST $API/engagement-stages/$STAGE/evidence/ \
  -d "{\"upload_id\":\"$(echo $GRANT | jq -r .upload_id)\"}" | jq '{kind, processing_status}'
#    expect: processing_status PENDING — the bytes matched; whether they are safe is the scanner's
#    question, and conflating the two is how a scanner becomes decoration.

# 3. Hand it over. The note is required.
$VEND -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/submit/ \
  -d '{"note":"4 of 4 present, footings poured on the east side."}' | jq '{status, evidence_submitted_at, review_due_at}'
#    expect: status AWAITING_REVIEW; review_due_at set if the window is configured, null otherwise

# 4. The Customer sends it back once — a correction is not an amendment and moves no money.
$CUST -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/correction/ \
  -d '{"note":"The east side is not level. Please redo before I sign off."}' | jq '{status, correction_note, review_due_at}'
#    expect: status CORRECTION_REQUESTED, review_due_at null (the clock stopped)

# 5. The vendor goes back to work and resubmits. The review window restarts from zero.
$VEND -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/start/ | jq .status
$VEND -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/submit/ \
  -d '{"note":"Levelled and re-poured."}' | jq '{status, review_due_at}'

# 6. The Customer approves.
$CUST -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/approve/ \
  | jq '{status, approved_amount_paise, released_amount_paise, approved_at, released_at}'
#    expect: status RELEASED immediately, approved == released == amount_paise
#    A3 holds nothing because A3 collected nothing.

$CUST $API/engagements/$ENGAGEMENT/ | jq '{status, staged_total_paise, approved_total_paise, released_total_paise}'
```

Repeat 1–6 for each remaining shift-day. When the last one releases, the engagement moves to
`COMPLETING` on its own; §E closes it.

---

## B. A5 — a milestone, funded at face value

The only two differences from §A, and both are money.

```bash
STAGE=<stages[0].id>

# 1. Fund it. THE MONEY PATH — read §B.2 before running this.
CHECKOUT=$($CUST -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/funding/)
echo $CHECKOUT | jq
ATTEMPT=$(echo $CHECKOUT | jq -r .payment_attempt_id)

# The stage is NOT funded yet. Prove it:
$CUST $API/engagement-stages/$STAGE/ | jq '{status, funding_state, funded_paise}'
#    expect: funding_state PENDING, funded_paise 0, status PENDING
```

### B.2 The verified-callback step

**No payment-gated state moves on a client redirect.** The checkout response above tells you an
attempt exists and nothing more. Two doors move it, and both are the provider saying so:

**The development door — a simulated capture.** It runs the *real* capture path, so everything
capture triggers actually happens; it is fail-closed three ways (a settings flag off by default, a
production start-up guard, and a check that the attempt's own provider is `fake`).

```bash
# The provider order is created by the outbox consumer, so give it a moment after the checkout.
$CUST $API/payment-attempts/$ATTEMPT/ | jq '{status, provider, provider_order_id}'
#    wait for provider_order_id to be non-empty, then:
$CUST -X POST $API/payment-attempts/$ATTEMPT/simulate-capture/ | jq '{status, captured_at}'
```

> Before this wave that call answered `403` for **every** M2 charge, because ownership was resolved
> through a `CheckoutSession` an M2 attempt does not have. It now resolves through the M2 aggregate
> that bought the charge. If it 403s, the attempt is not one of the four M2 purposes.

**The provider door — a signed test webhook.** Use this when you want to prove the HMAC path rather
than the local shortcut. The signature is `HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, raw_body)` over the
**exact bytes** you send — re-serializing the JSON after signing invalidates it.

```bash
SECRET=$PAYMENT_WEBHOOK_SECRET          # from backend\.env
ORDER=$($CUST $API/payment-attempts/$ATTEMPT/ | jq -r .provider_order_id)
AMOUNT=$(echo $CHECKOUT | jq -r .amount_paise)

BODY=$(printf '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_smoke_%s","order_id":"%s","amount":%s,"currency":"INR","status":"captured"}}}}' "$(date +%s)" "$ORDER" "$AMOUNT")
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)

curl -s -X POST "$API/payment-webhooks/razorpay/" \
  -H 'Content-Type: application/json' \
  -H "X-Razorpay-Signature: $SIG" \
  -H "X-Razorpay-Event-Id: evt_smoke_$(date +%s)" \
  --data-raw "$BODY"
#    expect: 202 {"accepted":true,"duplicate":false}
#    A wrong signature is 400 webhook_signature_invalid. That refusal is the point of the step.
```

The webhook is recorded, then processed through the outbox, so the state moves a beat later.

> **The attempt's provider must match the webhook's.** `apply_provider_payment` filters attempts by
> provider, so a `fake`-provider attempt cannot be captured through the `razorpay` webhook route.
> With `PAYMENT_PROVIDER=fake` in local settings, use the simulated capture; run the HMAC step
> against an environment configured with `PAYMENT_PROVIDER=razorpay`.

```bash
# 2. Now the stage is funded, at face value, and work has started.
$CUST $API/engagement-stages/$STAGE/ | jq '{status, funding_state, funded_paise, amount_paise}'
#    expect: funding_state FUNDED, funded_paise == amount_paise, status IN_PROGRESS
$CUST $API/engagements/$ENGAGEMENT/ | jq '{status, work_may_start_at, contact_released_at, funded_total_paise}'
#    expect: engagement ACTIVE, both timestamps set — an A5 releases contact only once funded

# 3. Try to start an UNFUNDED later stage. This is the guard, not a formality.
$VEND -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/<stages[1].id>/start/
#    expect: 409 m2_stage_not_funded

# 4. Evidence and submission are identical to §A steps 2–3.

# 5. The Customer approves. THIS is where A5 differs.
$CUST -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/approve/ \
  | jq '{status, approved_amount_paise, released_amount_paise, payout_release_due_at}'
#    expect: status APPROVED (not RELEASED), released_amount_paise 0,
#            payout_release_due_at set if the hold window is configured
```

The earning exists and is held. Check it:

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from apps.payouts.models import PartnerLedgerEntry as E; print(list(E.objects.filter(reason__startswith='m2 stage').values('status','gross_paise','commission_paise','net_paise')))"
```

Expect one `PENDING` row whose `gross - commission == net` and whose commission is this stage's
cumulative share of the engagement's commission. `PENDING` is the dispute window; it becomes
`AVAILABLE` when the window closes **and** the vendor has a verified payout account.

```bash
# 6. Release the hold. In production the beat sweep does this hourly; drive it by hand here.
```

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from apps.requirements.tasks import sweep_stage_payout_holds; print(sweep_stage_payout_holds())"
```

Nothing releases before `payout_release_due_at`. To see the release, move the clock back:

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from django.utils import timezone; from datetime import timedelta; from apps.requirements.models import EngagementStage as S; S.objects.filter(status='APPROVED').update(payout_release_due_at=timezone.now()-timedelta(hours=1))"
.\.venv\Scripts\python.exe manage.py shell -c "from apps.requirements.stages import stage_payout_release_due_ids, release_stage_payout; [release_stage_payout(stage_id=i) for i in stage_payout_release_due_ids()]"
```

```bash
$CUST $API/engagement-stages/$STAGE/ | jq '{status, released_amount_paise, released_at}'
#    expect: RELEASED. The ledger entry is AVAILABLE if the vendor has a verified payout account,
#    and still PENDING if not — the progressive gate holds the money, it does not cancel it.
```

---

## C. The review timeout, and the one state it cannot reach

```bash
# Submit a stage, then dispute it instead of approving.
$CUST -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/dispute/ \
  -d '{"reason_code":"PARTIALLY_DONE","note":"Only two of the four rooms were wired."}' \
  | jq '{status, dispute_reason_code, review_due_at}'
#    expect: status DISPUTED, review_due_at null

$CUST $API/engagements/$ENGAGEMENT/ | jq '{status, disputed_at}'
#    expect: engagement DISPUTED — visible to both parties and to Operations

# The Customer cannot then approve it either.
$CUST -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/approve/
#    expect: 409 m2_stage_disputed
```

Now prove the timeout cannot touch it:

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from apps.requirements.stages import stage_review_due_ids; print(stage_review_due_ids())"
```

The disputed stage is absent. Force it anyway to see the second guard:

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from apps.requirements.stages import expire_stage_review; expire_stage_review(stage_id='<STAGE>')"
```

Expect `StageDisputedError` / `m2_stage_disputed`. Both guards exist because a Customer can dispute
in the window between the sweep reading a list and the task acting on one entry.

```bash
# Operations decides. Two outcomes, never a quiet repricing.
$OPS -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-stages/$STAGE/dispute/decision/ \
  -d '{"outcome":"REQUEST_CORRECTION","note":"Site photos support the Customer. Vendor to complete rooms 3 and 4."}' \
  | jq '{status, correction_note}'
$CUST $API/engagements/$ENGAGEMENT/ | jq .status
#    expect: engagement back to ACTIVE once no stage is disputed
```

To see the timeout actually approve a stage, submit a fresh one and pull its clock back:

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from django.utils import timezone; from datetime import timedelta; from apps.requirements.models import EngagementStage as S; S.objects.filter(status='AWAITING_REVIEW').update(review_due_at=timezone.now()-timedelta(hours=1))"
.\.venv\Scripts\python.exe manage.py shell -c "from apps.requirements.tasks import sweep_stage_reviews; print(sweep_stage_reviews())"
```

Then read the timeline and confirm the system said so, not the Customer:

```bash
$CUST $API/engagements/$ENGAGEMENT/events/ | jq '[.events[] | {reason_code, from_status, to_status, actor_is_system}]'
#    expect a row: reason_code "stage_review_timed_out", actor_is_system true
```

---

## D. A scope amendment — the only thing that can change an agreed amount

### D.1 A3, a time extension: the server prices it

```bash
$VEND -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagements/$ENGAGEMENT/amendments/ \
  -d '{"kind":"TIME_EXTENSION","reason":"Rain stopped work on Tuesday","lines":[{"title":"One extra day","quantity":1}]}' \
  | jq '{kind, status, delta_paise, expires_at, lines}'
#    expect: delta_paise == the frozen rate x headcount, computed by the server.
#    Note that no amount was sent. Send one and it is ignored on an A3 extension.

AMD=<that id>
$CUST -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-amendments/$AMD/accept/ \
  | jq '{status: .amendment.status, applied_at: .amendment.applied_at, checkout}'
#    expect: status AUTHORIZED, applied_at set, checkout null — LEAD_ONLY moves no platform money

$CUST $API/engagements/$ENGAGEMENT/ | jq '{total_paise, amendment_delta_paise, staged_total_paise, stage_count: (.stages | length)}'
#    expect: total_paise UNCHANGED (the agreement is frozen),
#            amendment_delta_paise == the extension, staged == total + delta,
#            one new stage at the end.
```

### D.2 A5, a change order: the vendor prices it, and the money moves first

```bash
$VEND -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagements/$ENGAGEMENT/amendments/ \
  -d '{"kind":"CHANGE_ORDER","reason":"Customer added a second bathroom","lines":[{"title":"Second bathroom rough-in","quantity":1,"amount_paise":4500000}]}' \
  | jq '{status, delta_paise}'

AMD=<that id>
DECISION=$($CUST -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagement-amendments/$AMD/accept/)
echo $DECISION | jq '{status: .amendment.status, checkout}'
#    expect: status PAYMENT_PENDING and a checkout object. NOTHING has changed yet:
$CUST $API/engagements/$ENGAGEMENT/ | jq '{amendment_delta_paise, staged_total_paise, stage_count: (.stages | length)}'
#    expect: unchanged. Money before scope.

# Capture it through §B.2. Then:
$CUST $API/engagements/$ENGAGEMENT/ | jq '{total_paise, amendment_delta_paise, staged_total_paise, funded_total_paise, stage_count: (.stages | length)}'
#    expect: one new stage, already FUNDED at face value (the amendment payment IS its funding),
#            staged == total + delta, and the constraint behind that is a database CHECK.
```

### D.3 The refusals worth seeing

```bash
# One live change request per engagement.
$VEND -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagements/$ENGAGEMENT/amendments/ -d '{...}'
#    expect: 409 m2_amendment_not_actionable while one is open

# The wrong shape for the archetype.
$VEND -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagements/$ENGAGEMENT/amendments/ \
  -d '{"kind":"CHANGE_ORDER","reason":"x","lines":[{"title":"y","quantity":1,"amount_paise":100}]}'
#    on an A3 engagement: 409 m2_stage_transition_not_allowed

# A stage amount cannot be written any other way. There is no endpoint that takes one, and the
# model refuses it:
```

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from apps.requirements.models import EngagementStage as S; s=S.objects.first(); s.amount_paise=1; s.save(update_fields=('amount_paise','updated_at'))"
```

Expect `ValueError: A stage amount changes only through an authorized scope amendment.` The same
guard on `Engagement` refuses any write to the eight frozen commercial terms. That is `M2-BE-508`
held where no caller can route around it.

---

## E. Completion

```bash
# When every stage is RELEASED the engagement moves itself:
$CUST $API/engagements/$ENGAGEMENT/ | jq .status
#    expect: COMPLETING

$CUST -X POST -H "Idempotency-Key: $(uuidgen)" $API/engagements/$ENGAGEMENT/completion/ \
  | jq '{status, completed_at}'
#    expect: COMPLETED

$CUST $API/requirements/<REQUIREMENT>/ | jq '{status, closed_reason_code}'
#    expect: CLOSED_COMPLETE — the last transition in §1 of the state-machine document, which
#    until this wave had nothing driving it.
```

---

## F. Capability suspension routes committed work (`M2-BE-113`)

Blocked since 10 August on an aggregate that did not exist. It exists now.

**There is no Operations HTTP route for a capability review decision yet** — that surface is Wave
C6, and publishing a suspension endpoint before the case machinery behind it would be a button with
no process. Drive the command directly:

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from apps.partners.capabilities import transition_capability; from apps.identity.models import User; transition_capability(capability_id='<CAPABILITY>', to_status='SUSPENDED', actor=User.objects.get(phone_number='+918019013032'), reason_code='document_expired', reason='Insurance lapsed.')"
```

The routing runs through the outbox, so give the worker a moment (or drive it by hand):

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from apps.foundation.models import OutboxEvent as O; from apps.foundation.tasks import dispatch_outbox_event; [dispatch_outbox_event(str(e.id)) for e in O.objects.filter(event_type='m2.capability.suspended')]"
```

```bash
$CUST $API/engagements/$ENGAGEMENT/events/ | jq '[.events[] | select(.reason_code=="capability_suspended")]'
$CUST $API/engagements/$ENGAGEMENT/ | jq '{status, funded_total_paise, refunded_total_paise}'
```

Expect: the engagement is **not cancelled** — cancelling it would take the Customer's dispute rights
and their evidence with it. A funded stage nobody had started is refunded; a stage in progress or
awaiting review is flagged for replacement and left for Operations to judge; work already approved
or released stays settled, because it happened.

---

## What a failure here means

| Symptom | Where to look |
|---|---|
| `409 m2_policy_unavailable` on an amendment | `M2VariantConfiguration.amendment_response_hours` is unset. Fail-closed, by design. |
| `review_due_at` / `payout_release_due_at` always `null` | The corresponding window is unset. No stage auto-approves and no payout releases on a clock. By design. |
| `403` on `simulate-capture` | The attempt is not one of the four resolvable M2 purposes, or the session is not the aggregate's Customer. |
| The webhook returns `400 webhook_signature_invalid` | The body was re-serialized after signing. Sign the exact bytes you send. |
| Capture succeeds but the stage stays `PENDING` | The outbox consumer has not run, or the amount did not match. A short payment leaves the stage unfunded **on purpose** and visible in reconciliation. |
| A stage amount will not save | Correct. Only `apply_amendment_amount`, from an authorized amendment, may move it. |
