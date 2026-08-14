# Smoke script — recovery, refunds, disputes and the Operations workspace (Wave C6, contract 1.32.0)

**No test was written and none was run**, per the build-first amendment in
`Django_Next.js_Plan/M2/task.md`. This document is what replaces `M2-BE-716` and `M2-BE-717` for
the sprint: the exact requests to make, in order, to see the money's other half work by hand.

Every section names **what to check** and — more usefully — **what must be absent**. A step that
produces the right screen for the wrong reason is the failure this format exists to catch.

Related walks: `m2-demo-seed.md` (loading the configuration), `m2-workforce-shift-day-smoke.md`
(the A3 shift-day), `m2-project-stage-smoke.md` (the A5 project), `m2-engagement-spine-smoke.md`
(the stage commands themselves).

---

## 0. Before you start

```bash
cd C:\dev\vsolve\backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only --vendors 3
```

The owner runs the servers. This script assumes the API at `http://localhost:8000/api/v1`, a
signed-in session cookie per actor, and `Idempotency-Key: <fresh uuid>` on every `POST`.

Operations is `+918019013032` and always lands on "Switch to Operations".

**Five configuration columns are new this wave and every one of them fails closed.** Check them
once, here, rather than discovering them as a refusal in section 3:

```bash
.\.venv\Scripts\python.exe manage.py shell -c "
from apps.catalog.models import M2VariantConfiguration
for c in M2VariantConfiguration.objects.filter(status='ACTIVE'):
    print(c.variant.service.slug,
          c.case_response_window_hours,
          c.case_appeal_window_hours,
          c.chargeback_alarm_basis_points,
          c.chargeback_alarm_min_charges,
          c.operations_touch_budget_per_request)
"
```

Expect `16 56 200 20 2` on **both** variants. A `None` in the second column means an appeal
against a resolved case will refuse with `m2_policy_unavailable` — which is correct behaviour and
an undemonstrable one.

| Unset | What stops working |
|---|---|
| `case_response_window_hours` | Cases still open; they simply carry **no party deadline**. Nothing refuses. |
| `case_appeal_window_hours` | Section 5's appeal against a **resolved** case refuses. An appeal against an open case is unaffected. |
| `chargeback_alarm_*` | Section 6 still records the chargeback and opens the case; **no alarm fires**. |
| `operations_touch_budget_per_request` | Section 8 still counts touches; `within_budget` comes back `null`. |

---

## 1. The vendor-no-show free re-dispatch — the half that could not complete

**This is the scheduled item.** Before this wave the refund landed and the promise stopped there:
the refunded fee still occupied the one live-fee slot, so a replacement lead's acceptance had
nowhere to write a fee row, `create_booking_fee_checkout` answered "this booking fee is already
settled", and `complete_booking_fee` — the only path that opened an engagement — never ran.

Walk an A3 rate-card booking to a confirmed crew first (`m2-workforce-shift-day-smoke.md` §1–3),
then:

```bash
# Customer or Operations reports that the crew did not arrive.
POST /requirements/{requirement_id}/crew-no-show/   {"party": "VENDOR"}
```

**Check, in this order:**

1. `GET /requirements/{id}/` → the booking fee is `REFUNDED`, `settlement_reason_code` is
   `vendor_no_show`, and `travel_compensation_paise` is **0**. Neither party earns from an
   undelivered crew.
2. The requirement is back in `MATCHING` and the cascade has gone out again.
3. In the shell: `RateCardBooking.free_redispatch_entitled_at` is a timestamp,
   `free_redispatch_consumed_at` is `None`, `redispatch_count` is 1.
4. `GET /operations/cases/?kind=LATE_NO_SHOW` → an `URGENT` case exists.

Now accept the re-offered job as a **different** lead:

```bash
POST /partner/crew-offers/{invitation_id}/accept/
```

**Check:**

- `GET /requirements/{id}/` → status `ENGAGED` again, **with no second payment anywhere**.
- The booking fee is now `WAIVED`, `settlement_reason_code` is `free_redispatch`, and
  `amount_paise` still shows the published fee. It is **not** in `CHARGED_STATUSES`, so no
  reconciliation counts it as revenue.
- The engagement is the **same** engagement re-pointed at the new lead —
  `terms_snapshot["redispatches"]` has one entry naming both partner ids.
- The previous lead's `StageCrewAssignment` rows are `RELEASED` with reason
  `vendor_no_show_redispatch`.

**What must be absent:**

- Any new `PaymentAttempt`. The re-dispatch is free; Vsolve earns nothing on a booking whose first
  crew did not turn up, and that is the money decision this wave took explicitly.
- A second `Engagement` row. `Engagement.requirement` is a `OneToOneField`; the re-point is why
  there is a second engagement-opening path rather than a second engagement.
- `POST /requirements/{id}/booking-fee/checkout/` succeeding. It must refuse with
  `m2_booking_fee_not_chargeable` and the message "Your replacement crew is free".

---

## 2. Cancellation: evaluate, confirm, execute

```bash
# Customer, on a request where no contact has been disclosed and no work reported.
POST /requirements/{requirement_id}/cancellation/
     {"reason_code": "changed_my_mind", "reason": "Moving next month instead."}
```

**Check:** the response comes back `EXECUTED` immediately, with `remedy` carrying one entry per
money product. On an A3 rate-card booking inside the free-cancel window T you should see
`booking_fee.remedy_code = booking_fee_refunded`; past T, `booking_fee_forfeit_split` with
`travel_compensation_paise + platform_share_paise == booking_fee_paise` **exactly**.

Now the same on a request where the crew is confirmed (contact disclosed):

**Check:** it comes back `AWAITING_CONFIRMATION` with a `confirmation_due_at`, and **nothing has
moved** — the fee is still `ACTIVE`, the engagement still live. Then, as the **vendor**:

```bash
POST /cancellations/{cancellation_id}/decision/   {"confirm": true}
```

**Check:** the remedy executes on the terms it was evaluated at, and `executed_at` is stamped.

**What must be absent:**

- Any `service_payment` entry with a paise figure. A3 wages are peer-to-peer; that product's
  remedy is always `no_platform_money` with a sentence saying so.
- A second live cancellation. A second `POST` to the same request must refuse with
  `m2_requirement_transition_not_allowed`.

---

## 3. The disputed cancellation — `M2-AC-703`

Repeat section 2 to `AWAITING_CONFIRMATION`, then as the counterparty:

```bash
POST /cancellations/{cancellation_id}/decision/
     {"confirm": false, "reason": "They cancelled after we had already worked the morning."}
```

**Check:**

1. The cancellation is `DISPUTED` and carries an `operations_case_id`.
2. `GET /operations/cases/{case_id}/` → kind `CANCELLATION_CONFLICT`, `holds_payout: true`,
   `held_ledger_entry_ids` naming the entries it froze.
3. In the shell, every `PartnerLedgerEntry` in that list has moved from `AVAILABLE` to `PENDING`.

**What must be absent:** any refund, any forfeit, any payout. `M2-AC-703` requires that
payout and refund do **not** auto-resolve. Nothing executed.

Now close it and watch the money thaw:

```bash
POST /operations/cases/{case_id}/resolve/
     {"expected_version": 1, "resolution": "SETTLED", "note": "Both sides agreed a half day."}
```

**Check:** the frozen entries are `AVAILABLE` again — **and only those**. A stage payout still
inside its own dispute window must stay `PENDING`, which is why the case records the ids it froze
rather than releasing everything it finds.

---

## 4. Evidence, the response deadline and the appeal

```bash
# Either party, on a case they are a party to.
POST /cases/{case_id}/evidence/
     {"statement": "The gate was locked when we arrived.",
      "requirement_attachment_id": "<an attachment on this request>"}
```

**Check:** `201`, and `GET /operations/cases/{case_id}/` shows the row under `evidence` plus an
`EVIDENCE` event. The case status has **not** moved — submitting evidence is not progress.

**What must be absent:** a file upload field. Evidence points at bytes that already came through
the requirement-attachment or stage-evidence rail. Try an attachment id from a **different**
request: it must answer `404`, not `403`.

```bash
POST /operations/cases/{case_id}/response-deadline/
     {"expected_version": 2, "response_due_at": "<later than the current one>",
      "reason": "Customer is travelling."}
```

**Check:** accepted. Now send one **earlier** than the current deadline — it must refuse. A
deadline extension that could pull a date in would be a way to time somebody out of a window they
were still inside.

Resolve the case, then as the losing party:

```bash
POST /cases/{case_id}/appeal/   {"reason": "The photographs were not looked at."}
POST /operations/cases/{case_id}/appeal-decision/
     {"expected_version": 4, "outcome": "OVERTURNED", "note": "Reopening to review the evidence."}
```

**Check:** the case is back to `IN_PROGRESS`, the resolution is cleared, `holds_payout` is `true`
again and the ledger entries are re-frozen. An overturned appeal **reopens**; it does not
re-decide.

---

## 5. The warranty claim — the surface `M2-BE-546` was missing

Walk an A5 project to `WARRANTY` (`m2-project-stage-smoke.md` §7), then as the **Customer**:

```bash
POST /engagements/{engagement_id}/warranty-claim/
     {"summary": "The kitchen shutters have dropped", "detail": "Two of six, since last week."}
```

**Check:**

1. `201` with a `QUALITY` case.
2. The engagement's `retention_ledger_entry` is `PENDING`, not `AVAILABLE`.
3. Run the warranty sweep with the window already past —
   `.\.venv\Scripts\python.exe manage.py shell -c "from apps.requirements.tasks import sweep_warranty_windows; print(sweep_warranty_windows())"`
   — and the retention **stays held**. A retention released while somebody is disputing the work
   it was held against is the one failure retention exists to prevent.

Resolve the case; the next sweep releases it.

**What must be absent:** the claim succeeding on an engagement whose variant advertised no
warranty. It must refuse — there is nothing held to claim against.

---

## 6. Chargeback and reconciliation

```bash
POST /operations/payments/{payment_attempt_id}/chargeback/
     {"amount_paise": 15000, "provider_reference": "cb_test_0001", "reason_code": "fraud"}
```

**Check:**

1. A `CHARGEBACK` case, `URGENT`, `holds_payout: true`.
2. `GET /operations/reconciliation/` → `open_by_kind` includes `CHARGEBACK`.
3. The fee row itself has **not** moved. An `EARNED` booking fee whose charge is disputed is still
   `EARNED` until somebody decides.

Then the sweep:

```bash
.\.venv\Scripts\python.exe manage.py shell -c "from apps.requirements.tasks import reconcile_m2_money; print(reconcile_m2_money())"
```

**Check:** on a clean demo database it prints `0`. Break something deliberately — set a
`FORFEIT_SPLIT` fee's `platform_share_paise` to a wrong number in the shell — re-run, and it prints
`1` with a `RECONCILIATION_MISMATCH` exception naming the row and the code
`forfeit_split_does_not_reconcile`.

**What must be absent:** the sweep *correcting* anything. It opens exceptions; a person decides. A
reconciliation job that could fix what it found would quietly rewrite history when its own
arithmetic was wrong, and the first sign of trouble would be a ledger that always balanced.

---

## 7. The crew-document verification — the writer that did not exist

**This is the second scheduled item.** `PartnerCrewMembership.documents_verified_at` had four
readers and no writer in any environment: `verified_roster_size` counts only verified memberships,
so every vendor's verified roster was zero, the A3 cascade excluded every lead, and
`accept_crew_offer` answered `m2_roster_insufficient`.

```bash
GET  /operations/crew-memberships/
POST /operations/crew-memberships/{membership_id}/verification/   {"verified": true}
```

**Check:** the membership leaves the queue and `documents_verified_at` is stamped. Post the same
body again — it is a **no-op**, not a re-stamp, so the date keeps meaning when the documents were
actually checked.

Now remove it:

```bash
POST /operations/crew-memberships/{membership_id}/verification/   {"verified": false}
```

**Check:** it **refuses** — removing verification takes a named person off jobs they may already be
assigned to, so a reason is required. Send one and it succeeds.

To see why the column matters at all: un-verify a lead's whole roster, then try
`POST /partner/crew-offers/{invitation_id}/accept/`. It answers `m2_roster_insufficient`.

---

## 8. The Operations workspace

```bash
GET /operations/requests/{requirement_id}/timeline/
```

**Check:** one chronological list containing transitions, snapshots, invitations **with the vendor
named**, questions, proposals, the booking fee, the engagement, its stages, every case, every
cancellation and every Operations touch.

**What must be absent:** vendor identities on the *Customer's* timeline
(`GET /requirements/{id}/timeline/`). That one publishes a wave as a count. Compare the two side by
side — they are deliberately separate functions so a later edit cannot leak one into the other.

```bash
POST /operations/requests/{requirement_id}/rematch/       {"reason": "Vendor unreachable."}
POST /operations/requests/{requirement_id}/deadline/      {"extra_hours": 24, "reason": "Customer asked."}
POST /operations/requests/{requirement_id}/refund-review/ {"decision": "APPROVED", "reason": "Fee refunded already."}
GET  /operations/requests/{requirement_id}/touch-metric/
```

**Check:** the metric shows `touches: 3`, `budget: 2`, `within_budget: false`, and
`platform_revenue_paise` counting only **settled** money. Clear the seed budget to `None` and it
comes back `within_budget: null` — not `false`, which would read as a breach.

```bash
GET /operations/queues/
```

**Check:** eight queues, each with `queue_label` (not `label`), a depth, an oldest member and a
`recovery_action`. Leave an accepted crew offer unpaid past its hold and `unconfirmed` gains a row.

```bash
POST /operations/enquiries/{invitation_id}/assisted-clarification/
     {"question": "Is there a lift?", "answer": "No, third floor walk-up.", "consent_recorded": true}
```

**Check:** `201`, and the question renders with `asked_by_role: "OPERATIONS"`. Send
`consent_recorded: false` — it must **refuse**. Consent is a refusal, not a checkbox.

```bash
POST /operations/assisted-proposals/   { ...ProposalCreateSerializer body... }
```

**Check:** the proposal exists with `vendor_confirmed_at: null` and is **invisible to the
Customer** until the vendor confirms it themselves. That is the whole guard: a platform where
staff can publish a vendor's price is a platform where a vendor's price means nothing.

---

## 9. What this script does not cover

- **A live payment provider.** Every charge above is a provider **test** callback, per the M2/M3
  activation boundary.
- **The chargeback rate alarm firing.** It needs twenty captured M2 fee charges on one variant
  before the rate means anything, which is more than a hand-walk produces. The threshold is seeded
  and the code path is one `if`; it is listed here as uncovered rather than quietly assumed.
- **A demo refund or chargeback row from the seed.** Both would need a captured `PaymentAttempt`
  behind them, and a seeded payment no provider ever saw is a row section 6's sweep would
  immediately and correctly report as a mismatch. Walk sections 1 and 6 instead.
