# Smoke script — the A5 project, end to end (Wave C5, contract 1.31.0)

**No test was written and none was run**, per the build-first amendment in
`Django_Next.js_Plan/M2/task.md`. This document is what replaces `M2-BE-550` for the sprint: the
exact requests to make, in order, to see the A5 half of the engagement spine work by hand.

Every section names **what to check** and — more usefully — **what must be absent**. A step that
produces the right screen for the wrong reason is the failure this format exists to catch.

Related walks: `m2-demo-seed.md` (loading the configuration), `m2-engagement-spine-smoke.md` (the
stage commands themselves), `m2-workforce-shift-day-smoke.md` (the A3 half).

---

## 0. Before you start

```bash
cd C:\dev\vsolve\backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only --vendors 3
```

The owner runs the servers. This script assumes the API at `http://localhost:8000/api/v1` and a
signed-in session cookie per actor; `Idempotency-Key` is required on every `POST` below and can be
any fresh UUID.

**Three things the seed now writes that it did not before, and each one unblocks a step further
down.** Check them once, here, rather than discovering them as a refusal in section 6:

| Check | Why it is here |
|---|---|
| `M2VariantConfiguration.warranty_retention_basis_points` = 500 and `warranty_window_days` = 90 on the A5 variant | Unset, an estimate carrying warranty terms is refused at section 4 with `m2_policy_unavailable` |
| Every `PartnerCrewMembership.documents_verified_at` is a real timestamp | Unset — as it was in every environment until this wave — a lead's verified roster is zero, the cascade excludes them, and the **A3** walk cannot reach its third step |
| Every demo vendor has a `PartnerPayoutAccount` in `VERIFIED` with `effective_from` in the past | Unset, every M2 earning stops at `PENDING` and section 8 has nothing to show |

```bash
.\.venv\Scripts\python.exe manage.py shell -c "
from apps.catalog.models import M2VariantConfiguration
from apps.partners.models import PartnerCrewMembership, PartnerPayoutAccount
c = M2VariantConfiguration.objects.filter(variant__service__slug='interior-fit-out-project').first()
print('retention bp / window days:', c.warranty_retention_basis_points, c.warranty_window_days)
print('unverified crew (must be 0):', PartnerCrewMembership.objects.filter(documents_verified_at__isnull=True).count())
print('verified payout accounts:', PartnerPayoutAccount.objects.filter(status='VERIFIED').count())
"
```

---

## 1. Requirement, visit plan, slot, charge

This half is Wave C2's and is unchanged; it is here because nothing in C5 is reachable without it.

1. **Create and submit an A5 requirement** on `interior-fit-out-project`.
   `POST /requirements/` then `POST /requirements/{id}/submit/`.
   - Check: `status` is `MATCHING`.
   - **Must be absent:** any price. Requirement capture is free.
2. **Choose a visit plan.** `POST /requirements/{id}/visit-plan/` with `plan_size: 2`.
   - Check: the plan is `CHOSEN` and `price_paise` is 9 900 (the seeded 2-visit tier).
   - **Must be absent:** any `PaymentAttempt`. `CHOSEN` charges nothing; it bounds the wave.
3. **As a vendor, confirm a visit slot.** Read the grid at
   `GET /partner/enquiries/{invitation_id}/visit-slots/`, then `POST` a slot id back to it.
   - Check: the requirement is `VISITS_BOOKED` and the plan is `PENDING`.
4. **Pay the plan.** `POST /requirements/{id}/visit-plan/checkout/`, then capture with the
   provider **TEST** callback (`POST /payments/{attempt_id}/simulate-capture/`).
   - Check: plan `ACTIVE`, two `VisitPlanShare` rows, `9900 = 4950 + 4950`.
   - **Must be absent:** an `ACTIVE` plan before the callback. A client redirect never grants it.

## 2. The visit, and the estimate that needs it

5. **Confirm arrival** (`POST /site-visits/{id}/arrival/`) and **complete** the visit
   (`POST /site-visits/{id}/complete/`).
   - Check: visit `COMPLETED`.
6. **Try to submit an estimate against a visit that is not completed** — use the *other* vendor's
   scheduled visit id.
   - Check: `m2_visit_not_completed`. This is the guard the whole visit-first model rests on.

## 3. The estimate, with milestones that carry deliverables

7. **Submit the estimate.** `POST /proposals/` with `site_visit_id`, `stages` and `material_lines`:

```json
{
  "invitation_id": "<invitation>",
  "site_visit_id": "<completed visit>",
  "total_paise": 500000,
  "tax_basis": "INCLUSIVE",
  "warranty_terms": "Twelve months on workmanship.",
  "stages": [
    {"title": "First fix", "deliverable": "Conduits, boxes and wiring pulled", "amount_paise": 200000, "ends_on": "2026-09-10"},
    {"title": "Second fix", "deliverable": "Switches, sockets and fittings live", "amount_paise": 200000, "ends_on": "2026-09-24"}
  ],
  "material_lines": [
    {"title": "Cable and conduit", "quantity": 40, "unit": "coils", "amount_paise": 100000}
  ]
}
```

- Check: accepted. `200000 + 200000 + 100000 = 500000`.
- Check: **a material-only estimate is refused.** Retry with `stages: []` — "A project quote needs
  at least one stage." That shape is exactly what an advance-harvesting vendor sends.

8. **The warranty guard (`M2-BE-546`).** Temporarily blank the variant's retention configuration
   and resubmit an estimate carrying `warranty_terms`:

```bash
.\.venv\Scripts\python.exe manage.py shell -c "
from apps.catalog.models import M2VariantConfiguration
M2VariantConfiguration.objects.filter(variant__service__slug='interior-fit-out-project').update(warranty_window_days=None)
"
```

- Check: `m2_policy_unavailable`, naming the missing decision. **A variant either funds retention
  or does not advertise warranty**, refused at the composer rather than discovered at handover.
- Check: an estimate with `warranty_terms: ""` is still accepted — this refuses a *claim*, not a
  quote.
- Put the value back (`warranty_window_days=90`) before continuing.

## 4. Selection, and the milestones the engagement freezes

9. **Select the estimate** (`POST /requirements/{id}/selection/`) and **reconfirm** as the vendor
   (`POST /selections/{id}/reconfirm/`).
10. **Read the project.** `GET /engagements/{id}/project/`.
    - Check: three milestones. Two `WORK` then one `MATERIAL_ADVANCE`, **in that order** —
      materials are laid out last on purpose, because funding runs in position order and a project
      whose first collection is a materials advance is the prepay-then-vanish shape staged funding
      exists to prevent.
    - Check: `deliverable` on each milestone is the text from the estimate, not blank.
    - Check: `original_milestone_label`, `original_amount_paise` and `original_scheduled_on` match
      the current values, and `schedule_shift_days` is `0`. Nothing has changed yet.
    - Check: `retention_paise` is 25 000 (5% of 500 000) and `retention_withheld_paise` is `0`.
    - **Must be absent:** `warranty_ends_at`. There is no warranty period until the work is done.
    - **Must be absent:** a `label` field. It is `milestone_label` — `label` is DRF's own
      `Serializer` attribute and a field of that name would be resolved at random.
11. **Try the project read on an A3 engagement.**
    - Check: `m2_stage_transition_not_allowed`. The archetype is the guard, in both directions.

## 5. Funding at face value — there is no stage credit

12. **Fund milestone 1.** `POST /engagement-stages/{stage_1}/funding/`, then the TEST capture.
    - Check: the attempt is for **200 000 paise, the full milestone**. The Customer paid 9 900 for
      visits and **none of it discounts this**: that money was spent on the visits themselves and
      settles per share (07 §4a). A stage credit would pay for those visits twice out of the
      vendor's work.
    - Check: the stage is `IN_PROGRESS` and `funding_state` is `FUNDED`; the engagement moved
      `PENDING_START → ACTIVE` and `work_may_start_at` is stamped.
13. **Try to fund milestone 2 before milestone 1.** (Do this before step 12 if you want to see it,
    or on a second requirement.)
    - Check: "Fund the earlier stages of this project first."
14. **Check the material advance's purpose.** Fund it later, at step 20, and confirm its
    `PaymentAttempt.purpose` is `M2_MATERIAL_ADVANCE` and **not** `M2_STAGE_FUNDING`. That
    discriminator is what every recovery rule in section 9 reads.

## 6. A delay claim moves the schedule and no money (`M2-BE-544`)

15. **Attach evidence to milestone 2 while it is still `PENDING`.**
    `POST /engagement-stages/{stage_2}/evidence/uploads/`, then finalize.
    - Check: accepted. This is new in 1.31.0 — a customer-caused delay is a claim about work that
      has **not** started, so refusing evidence until it starts would make the one claim that most
      needs a photograph the one claim that cannot carry one.
16. **Raise the claim as the vendor.** `POST /engagement-stages/{stage_2}/delay-claim/`:

```json
{"reason_code": "site_not_ready", "description": "Site was occupied on the 12th and 13th.", "extension_days": 7, "evidence_ids": ["<evidence>"]}
```

- **Must be absent:** any amount field, on the request or the response. A delay that costs money is
  extra work and goes through `POST /engagements/{id}/amendments/`, which the Customer pays for.
- Check: `expires_at` is set. With `amendment_response_hours` unset it would be
  `m2_policy_unavailable` instead — the same clock the amendment engine runs on, reused rather than
  given its own unset knob.
- Check: a **second** claim on the same milestone is refused with `m2_amendment_not_actionable`.

17. **Accept it as the Customer.** `POST /project-delay-claims/{id}/decision/` with
    `{"accept": true}`.
    - Check on `GET /engagements/{id}/project/`: milestone 2's `scheduled_on` moved by 7 days
      **and so did every later milestone**. A project is a sequence; moving only the delayed
      milestone would say the vendor can make it up by working two at once.
    - Check: `original_scheduled_on` is **unchanged** and `schedule_shift_days` is now `7`. Both
      readings survive, which is the whole of `M2-BE-549`.
    - **Must be absent:** any change to `amount_paise`, `staged_total_paise` or
      `amendment_delta_paise`. Nothing moved but dates.
18. **Let one expire.** Raise another claim, then:

```bash
.\.venv\Scripts\python.exe manage.py shell -c "
from apps.requirements.models import ProjectDelayClaim
from django.utils import timezone
from datetime import timedelta
ProjectDelayClaim.objects.filter(status='SUBMITTED').update(expires_at=timezone.now()-timedelta(hours=1))
from apps.requirements.tasks import sweep_delay_claims; print(sweep_delay_claims())
"
```

- Check: the claim is `EXPIRED` and **the dates did not move**. Silence is a refusal, not consent.

## 7. Evidence, review, approval — the C3 spine, unchanged

19. `POST /engagement-stages/{stage_1}/submit/` (vendor) → `AWAITING_REVIEW`, then
    `POST /engagement-stages/{stage_1}/approve/` (Customer).
    - Check: an `EngagementEvent` per transition, with `actor_is_system: false`.
    - Check: `retention_withheld_paise` on the project read is **still 0**. Retention bites at the
      end, not the beginning: `max(0, retention − (staged − approved))` is zero while there is
      plenty of work left to hold it out of.

## 8. Payout eligibility, with the visit split

20. Fund, submit and approve milestone 2 and the material advance.
21. **Check the vendor's ledger.**

```bash
.\.venv\Scripts\python.exe manage.py shell -c "
from apps.payouts.models import PartnerLedgerEntry
for e in PartnerLedgerEntry.objects.filter(calculation_snapshot__source__in=['m2_engagement_stage','m2_visit_share','m2_warranty_retention']).order_by('created_at'):
    print(e.calculation_snapshot.get('source'), e.status, 'gross', e.gross_paise, 'commission', e.commission_paise, 'net', e.net_paise)
"
```

- Check: **the visit share** is there, at 60% of a consumed share (2 970 of 4 950) with the
  remaining 40% as the platform share — the seeded split, invented and marked as such.
- Check: the last milestone's entry has `gross_paise` **reduced by the retention** and its snapshot
  carries `warranty_retention_withheld_paise`. Σ gross across every entry plus the retention still
  equals the staged total.
- Check: entries reach `AVAILABLE` after `sweep_stage_payout_holds`, because the seed now writes a
  verified payout account. Before this wave they stayed `PENDING` for ever and this line of the
  script had nothing to show.
- **Must be absent:** any ledger entry on the A3 walk. `LEAD_ONLY` collects nothing, so it books
  nothing.

## 9. Handover, completion, warranty (`M2-BE-547`, `548`, `546`)

22. **Submit the handover** as the vendor. `POST /engagements/{id}/handover/`:

```json
{"note": "Final drawings and certificates.", "items": [
  {"title": "As-built drawings", "evidence_id": "<a verified StageEvidence>"},
  {"title": "Test certificates", "external_url": "https://example.test/certs"}
]}
```

- Check: a `FILE` item is refused unless the evidence belongs to **this** engagement, and an
  `http://` link is refused. Sending both `evidence_id` and `external_url` on one item is a `400`
  from the serializer rather than a 500 from the check constraint.
23. **Try to complete before accepting the handover.**
    `POST /engagements/{id}/completion/`.
    - Check: refused. **This refusal is the entire mechanism** that keeps Event and Media delivery
      on the platform — a vendor who delivers privately has an engagement that will not close and a
      retention that will not release.
24. **Try to complete with an open milestone.** Propose and accept an additive amendment (which
    appends a stage), then try again.
    - Check: refused, naming the stage position. Completion **never** approves an unreviewed stage.
25. **Accept the handover.** `POST /engagements/{id}/handover/acceptance/`.
    - Check: because the engagement was `COMPLETING`, this finished it in one call.
    - Check: `status` on the response is **`WARRANTY`, not `COMPLETED`**. Read the status rather
      than assuming the transition you asked for.
    - Check: `warranty_ends_at` is 90 days out, and `retention_withheld_paise` now equals
      `retention_paise` (25 000).
26. **Close the warranty.**

```bash
.\.venv\Scripts\python.exe manage.py shell -c "
from apps.requirements.models import Engagement
from django.utils import timezone
from datetime import timedelta
Engagement.objects.filter(status='WARRANTY').update(warranty_ends_at=timezone.now()-timedelta(minutes=1))
from apps.requirements.tasks import sweep_warranty_windows; print(sweep_warranty_windows())
"
```

- Check: engagement `CLOSED`, and one new ledger entry `m2_warranty_retention` for 25 000 with
  **commission 0** — the commission on that money was booked when the milestones it came out of
  were approved, and charging it again would take Vsolve's share twice on the same rupee.

## 10. Vendor abandonment: the transfer, and the delta (`M2-BE-545`)

Run this on a **second** A5 requirement, taken to step 12 (milestone 1 funded and in progress).

27. **Propose the transfer as Operations.** `POST /engagements/{id}/transfer/`:

```json
{"to_partner_id": "<demo vendor 2>", "reason_code": "vendor_abandoned", "note": "No contact for eleven days.",
 "quotes": [{"stage_id": "<stage_1>", "amount_paise": 240000}, {"stage_id": "<stage_2>", "amount_paise": 200000}]}
```

- Check: the material advance is **not** in `quotes` and is refused if you include it — a funded
  advance is not transferable.
- Check: omitting a milestone, or pricing one twice, is refused. The two numbers the Customer
  decides on must be sums over the same list of work.
- Check: `previous_remaining_paise` 400 000, `replacement_remaining_paise` 440 000,
  `delta_paise` **+40 000**, `material_advance_outstanding_paise` reported.
- Check: **dispute a milestone first and the whole transfer is refused** with `m2_stage_disputed`.
  Transferring around a dispute would close the objection by moving it out of the agreement.
28. **Accept as the Customer.** `POST /project-transfers/{id}/decision/` with `{"accept": true}`.
    - Check: a `Refund` exists for milestone 1's 200 000 — funding the abandoning vendor held
      against work they never did.
    - Check: milestone 1 is `240000` and `funding_state` is back to `REQUIRED`.
    - Check: `amendment_delta_paise` moved by **+40 000** and
      `staged_total_paise == total_paise + amendment_delta_paise` still holds.
    - Check: `original_amount_paise` on milestone 1 is **still 200 000**. Both readings survive.
    - Check: the engagement's partner is vendor 2, its status is **`PENDING_START`** and
      `work_may_start_at` is **null** — the replacement has nothing funded and no clearance.
    - Check: the funded material advance is `CANCELLED` with
      `cancellation_reason_code: material_advance_left_with_vendor`, and its `funded_paise` is
      **unchanged**. That money is not coming back; it bought goods.
    - **Must be absent:** any `PaymentAttempt` created by the transfer. There is no transfer
      checkout — the delta is settled by refunding what was unearned and repricing what is left,
      and the Customer funds the replacement's milestones at the price they just accepted. That is
      what stops anybody paying twice.
    - Check: a `PartnerStandingEvent` of kind `PROJECT_ABANDONED` against the **old** vendor.

## 11. Early termination, and the two recovery rules (`M2-BE-543`)

Run on a third A5 requirement with milestone 1 funded and the material advance funded.

29. `POST /engagements/{id}/termination/` with
    `{"reason_code": "vendor_abandoned", "note": "No replacement available."}`.
    - Check: the funded **work** milestone is refunded and `CANCELLED`.
    - Check: the funded **material advance** is `CANCELLED` and **not** refunded, with
      `cancellation_reason_code: material_advance_left_with_vendor`. Material money is spent, not
      earned; refunding it automatically would be Vsolve settling a goods dispute with a
      background job.
    - Check: every cancelled milestone keeps its `amount_paise` and its funding history, and
      `staged_total_paise` **does not move**. The agreement was that big and the money was
      collected; shrinking the totals to make a cancelled project look tidy would erase what a
      dispute reads.
    - Check: engagement `CANCELLED`, requirement `CLOSED_CANCELLED`.
    - **Must be absent:** any penalty, forfeit or compensation. This command decides **no remedy** —
      that is the cancellation policy engine in Wave C6. Returning money nobody earned is the
      absence of a remedy rather than one.

---

## What this script does not cover, and why

- **`M2-BE-550`** — the test task. Neither written nor run, per the build-first amendment. This
  document replaces it for the sprint.
- **The Operations "verify crew documents" command.** `PartnerCrewMembership.documents_verified_at`
  is stamped by the seed here; the reviewed surface with an actor and an audit trail behind it is
  Wave C6, logged in `frontend-execution-plan.md` §7.
- **Cancellation remedies.** Who owes whom what when a project ends early is `M2-BE-701`/`706`.
- **A case behind a dispute.** `m2_stage_dispute_resolve` is drivable; the case machinery is C6.
