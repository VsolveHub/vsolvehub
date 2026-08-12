# M2 State Machines, Commands, Permissions and Error Codes

**Closes:** `M2-BE-009`, `M2-BE-010`, `M2-BE-011`, `M2-BE-012`
**Architecture:** [ADR-0007](../../docs/adr/0007-m2-engagement-spine-and-fee-after-value.md) ·
[ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md) (revision 3: visit-first A5)
**Flow:** [README.md](README.md)

This is the design contract every M2 backend module implements. A transition not listed here does not
exist. A command not listed here is not a domain command.

## 1. Requirement

The archetype selects the middle of the machine. A3 runs quote-first through the unlock; A5 runs
visit-first through the visit plan. The ends — draft, matching, closure, selection, engagement — are
shared.

```text
A3 (quote-first):

DRAFT ──submit──> MATCHING ──first usable quote──> QUOTES_READY
  │                  │                                  │
  │                  │                          unlock  │
  │                  ▼                                  ▼
  │              CLOSED_NO_SUPPLY                   UNLOCKED ──select──> SELECTED
  │              CLOSED_SLA_BREACH                                          │
  │              CLOSED_EXPIRED                                             ▼
  └──abandon──> CLOSED_ABANDONED                                        ENGAGED
                                                                            │
                                                                    CLOSED_COMPLETE
                                                                    CLOSED_CANCELLED

A5 (visit-first):

DRAFT ──submit──> MATCHING ──first visit slot confirmed──> VISITS_BOOKED
  │  (plan chosen    │        (charges the whole plan)          │
  │   on review)     │                                          │ first usable estimate
  │                  ▼                                          ▼
  │              CLOSED_NO_SUPPLY                           QUOTES_READY ──select──> SELECTED
  │              CLOSED_SLA_BREACH                        (estimates readable            │
  │              CLOSED_EXPIRED                            in full, no unlock)           ▼
  └──abandon──> CLOSED_ABANDONED                                                     ENGAGED
                                                                                         │
                                                                                 CLOSED_COMPLETE
                                                                                 CLOSED_CANCELLED
```

| Transition | Trigger | Guard |
|---|---|---|
| `DRAFT → MATCHING` | Customer submits | Answers valid, `service_by` in the future, lifecycle inferred; A5 additionally has a chosen visit plan |
| `MATCHING → QUOTES_READY` (A3) | First usable proposal | Proposal complete and within budget band |
| `MATCHING → VISITS_BOOKED` (A5) | First confirmed visit slot | Slot booked on the availability grid; verified plan payment charges here |
| `VISITS_BOOKED → QUOTES_READY` (A5) | First usable estimate | Proposal complete, submitted against a completed visit |
| `MATCHING → CLOSED_NO_SUPPLY` | No eligible vendor after final wave | No charge has occurred |
| `MATCHING → CLOSED_SLA_BREACH` | Delivery SLA elapsed | No charge has occurred (A3: no quote; A5: no visit ever confirmed) |
| `* → CLOSED_EXPIRED` | `service_by` passes | Any unlock or unconsumed visit-plan value is refunded in full |
| `QUOTES_READY → UNLOCKED` (A3 only) | Verified unlock payment | At least one usable quote still live |
| `UNLOCKED → SELECTED` (A3) | Customer selects a proposal | Proposal `SUBMITTED`, validity live, no other active selection |
| `QUOTES_READY → SELECTED` (A5) | Customer selects an estimate | Proposal `SUBMITTED`, from a completed visit, validity live, no other active selection |
| `SELECTED → UNLOCKED` (A3) / `SELECTED → QUOTES_READY` (A5) | Vendor declines or reconfirmation expires | Unlock / plan entitlement preserved, no new charge |
| `SELECTED → ENGAGED` | Vendor reconfirms (A3) or first stage funded (A5) | Capability still approved; A5 first stage funds at face value (visit money settles per share, §4a) |

`CLOSED_EXPIRED` is reachable from every non-terminal state. A quote or visit delivered after the
customer's work date is worthless, so the clock outranks every other transition. `UNLOCKED` is
unreachable for an A5 requirement, and `VISITS_BOOKED` for an A3 one — the guard is the archetype,
enforced server-side.

## 2. Vendor invitation

```text
INVITED ──accept──> ACCEPTED ──submit──> QUOTED
   │                   │                    │
   ├──decline──> DECLINED                   └──> (proposal owns the rest)
   ├──expire───> EXPIRED
   └──withdraw─> WITHDRAWN (Operations or ineligibility)
```

Accepting takes a **soft capacity hold** for the requested dates and writes an immutable
`RequirementSnapshot`. Declining, expiring or withdrawing releases the hold and the quote slot, and
triggers the next wave. `ACCEPTED → WITHDRAWN` is penalty-free when the requirement changed materially
after acceptance.

**A5:** acceptance is expressed by `confirm_visit_slot` — the vendor commits to a scheduled visit,
which also takes the grid slot hold. Declining, expiring or withdrawing releases the visit slot back
to the plan (share returns to `OPEN`) and triggers the next wave.

## 3. Proposal

Append-only. A revision is a new row superseding its predecessor; no row is ever edited in place.

```text
SUBMITTED ──┬──> SUPERSEDED   (vendor submits a replacement)
            ├──> WITHDRAWN    (vendor withdraws)
            ├──> EXPIRED      (validity elapsed)
            ├──> REJECTED     (customer rejects, incl. non-responsive)
            └──> SELECTED ──> ACCEPTED | LAPSED
```

Only `SUBMITTED` is selectable. `REJECTED` carries a reason; the `NON_RESPONSIVE` reason releases the
slot and invites a replacement at no charge (A3: a new quote slot; A5: a free replacement visit),
subject to the configured cap.

**A5 guard:** an A5 proposal must reference a `SiteVisit` in `COMPLETED`; submission against a
missing, scheduled or cancelled visit is refused with `m2_visit_not_completed`. A3 proposals carry no
visit reference (an ad-hoc paid site visit may exist beside them but is not a submission guard).

## 4. Quote unlock (A3 only)

```text
OFFERED ──pay──> PENDING ──verified──> ACTIVE ──> CONSUMED
                    │                     │
                    └──failed──> FAILED   └──> REFUNDED
```

`ACTIVE → REFUNDED` occurs on `service_by` expiry or when every unlocked vendor falls through before
selection. `ACTIVE → CONSUMED` occurs at engagement creation; the fee is earned from that point.
An unlock is never granted from a client redirect — only a verified provider callback moves
`PENDING → ACTIVE`. An unlock cannot exist on an A5 requirement.

## 4a. Visit plan (A5 only)

```text
CHOSEN ──first slot confirmed──> PENDING ──verified──> ACTIVE ──all shares settled──> SETTLED
  │                                 │
  │                                 └──failed──> FAILED (slot confirmation rolls back)
  └──requirement closes before any confirmation──> VOID   (nothing was charged)
```

Per-slot share states inside an `ACTIVE` plan:

```text
OPEN ──visit confirmed──> COMMITTED ──visit completed + usable estimate──> EARNED
  │                          │
  │                          ├──vendor no-show / no estimate in window──> REFUNDED | REPLACED
  └──visit SLA passes──> REFUNDED                                          (free replacement visit)
```

- `CHOSEN` charges nothing; it bounds the invitation wave. The **whole plan** is charged once at the
  first confirmed slot; shares are `plan price / plan size` in integer paise, remainder on the first
  share.
- A plan is never charged from a client redirect — only a verified provider callback moves
  `PENDING → ACTIVE`, exactly as the unlock.
- **Each share carries a configured split** (decided 2026-08-13): a vendor visit payout and a Vsolve
  platform share, both in integer paise. An `EARNED` share makes the vendor payout **payout-eligible
  through the M1 payout and ledger rails** (payout details required first, per the progressive
  gate); the platform share is Vsolve revenue. A `REFUNDED` share returns whole to the Customer —
  neither party earns from an undelivered visit. There is no stage credit.
- `SETTLED` means every share is `EARNED` or `REFUNDED` and reconciles in paise:
  `plan price = Σ vendor payouts + Σ platform shares + Σ refunds`.
- `service_by` expiry refunds every share not already `EARNED`. On a Customer no-show of a
  `COMMITTED` share, the vendor payout is still paid (the vendor travelled); the platform-share
  disposition follows the owner's policy and is recorded per share.

## 4b. Site visit

Shared by both archetypes; under A5 a visit occupies one plan share, under A3 it is the ad-hoc paid
visit with a vendor-priced fee.

```text
REQUESTED ──slot booked──> SCHEDULED ──arrival confirmed──> IN_PROGRESS ──report──> COMPLETED
   │                          │                                  │
   │                          ├──vendor no-show──> VENDOR_NO_SHOW│
   │                          ├──customer no-show> CUSTOMER_NO_SHOW
   └──cancel──> CANCELLED     └──cancel──> CANCELLED
```

Slot booking writes against the M1 availability grid (`carts.availability`) so a visit and an A1
booking cannot double-book the same capacity. Arrival confirmation uses the non-OTP fallback in M2
and the start OTP when M3 activates it. `COMPLETED` opens the post-visit estimate window.

## 5. Engagement and stage

One spine, both archetypes.

```text
Engagement:  PENDING_START ──> ACTIVE ──> COMPLETING ──> COMPLETED
                   │              │                          │
                   └──> CANCELLED └──> DISPUTED              └──> WARRANTY ──> CLOSED

EngagementStage: PENDING ──fund/start──> IN_PROGRESS ──evidence──> AWAITING_REVIEW
                                                                        │
                    ┌───────────────────────────────────────────────────┤
                    ▼                    ▼                              ▼
                 APPROVED          CORRECTION_REQUESTED             DISPUTED
                    │                    │                              │
                    ▼                    └──> IN_PROGRESS               ▼
                 RELEASED                                          case-resolved
```

A3 maps a stage to a shift-day; funding is not required because A3 is `LEAD_ONLY`. A5 maps a stage to
a milestone; `PENDING → IN_PROGRESS` requires verified stage funding at face value — visit money is
settled per share in §4a and never discounts a stage. `AWAITING_REVIEW → APPROVED` may occur on
review timeout **except** while the stage is `DISPUTED`.

## 6. Commands and idempotency

Every retryable write takes an `Idempotency-Key`. Repeating a command with the same key returns the
original result rather than performing the action twice.

**This is not built for M2.** `apps.foundation.services.execute_idempotent` already provides it:
uniqueness on actor + operation + key, a request fingerprint that rejects key reuse with different
arguments, an in-progress state for concurrent retries, and replay of the persisted response. Every
command in the table below wraps that helper. `enqueue_outbox_event` and `apps.foundation.recovery`
likewise own at-least-once delivery and re-drive.

| Command | Actor | Idempotent | Notes |
|---|---|---|---|
| `submit_requirement` | Customer | Key | Emits matching outbox event |
| `reclassify_requirement` | Operations | Key | Voids invitations, preserves unlock |
| `merge_duplicate_requirement` | Customer, Operations | Key | — |
| `invite_wave` | System | Natural | Bounded by wave size and exposure cap |
| `accept_invitation` | Partner | Natural | Takes capacity hold; fails closed if slots exhausted |
| `decline_invitation` | Partner | Natural | Reason required |
| `expire_invitation` | System | Natural | Business-hours clock |
| `submit_proposal` | Partner, Operations-assisted | Key | Validates shape, wage floor, tax basis |
| `supersede_proposal` | Partner | Key | Writes a new row |
| `withdraw_proposal` | Partner | Natural | — |
| `ask_question` / `answer_question` | Partner / Customer | Key | Structured, not chat |
| `request_site_visit` / `schedule_site_visit` / `complete_site_visit` | Both / Both / Partner | Key | Paid; A5 plan visits book grid slots |
| `choose_visit_plan` | Customer | Key | A5 only, on review; charges nothing, bounds the wave |
| `confirm_visit_slot` | Partner | Key | Holds a slot on the availability grid; the first hold opens the plan checkout |
| `create_visit_plan_checkout` | Customer | Key | Rejects if no held visit slot (`m2_visit_plan_not_chargeable`) |
| `complete_visit_plan` | System (webhook) | Natural | One charge per plan; finalizes the held slot to `SCHEDULED` |
| `confirm_visit_arrival` | Both | Key | Non-OTP fallback in M2; start OTP in M3 |
| `refund_unfilled_visit_shares` | System | Natural | Visit-SLA sweep; share-level, idempotent |
| `create_unlock_checkout` | Customer | Key | A3 only; rejects if no usable quote |
| `complete_unlock` | System (webhook) | Natural | One unlock per successful payment |
| `reject_proposal` | Customer | Key | `NON_RESPONSIVE` releases the slot |
| `select_proposal` | Customer | Key | Atomic requirement lock |
| `reconfirm_selection` | Partner | Key | Rechecks capability, schedule, capacity |
| `fund_stage` | Customer | Key | A5 only |
| `assign_crew` | Partner | Key | Per stage; global crew conflict check |
| `confirm_attendance` | Partner (supervisor) | Key | `n of m` for the day |
| `respond_attendance` | Customer | Key | Confirm or dispute |
| `submit_stage_evidence` | Partner | Key | — |
| `approve_stage` / `request_correction` / `dispute_stage` | Customer | Key | — |
| `propose_amendment` / `accept_amendment` | Both | Key | Delegates to the M1 amendment engine |
| `report_safety_incident` | Both, Operations | Key | Never a cancellation reason |
| `request_cancellation` | Partner | Key | Dual confirmation after contact disclosure |
| `approve_capability` / `suspend_capability` | Operations | Key | Suspension routes funded engagements |

Webhook-driven commands are naturally idempotent on the provider event ID. Every command that changes
money or a commercial term writes an audit event carrying actor, reason code and correlation ID.

## 7. Permissions

| Actor | May | May never |
|---|---|---|
| Customer | Own requirement, unlock (A3), visit plan and visit confirmations (A5), selection, stage approval, dispute, amendment acceptance | See vendor identity before unlock (A3) or visit confirmation (A5); edit a submitted proposal; set a price |
| Partner owner | Own capability, crew, invitations, proposals, stages, attendance, amendments | Read another Partner's records; accept on a customer's behalf; change mode |
| Partner staff | Operate assigned engagements and attendance | KYC, bank details, capability changes, payout actions |
| Operations | Reclassify, rematch, extend deadlines, assisted capture, case resolution, refund review, payout hold | Accept an invitation for a vendor; author a proposal without vendor confirmation; edit rows directly |
| System jobs | Waves, expiries, SLA closure, reconciliation, outbox | Any action requiring consent or human judgement |

Object-level authorization is enforced per record, not per route. Every M2 endpoint carries a
regression test proving a foreign actor receives `404` rather than `403` where existence itself is
private.

## 8. Error codes

Codes follow the M1 `PartnerDomainError` shape: stable `code`, user-safe `message`, `status_code` and
`retryable`.

| Code | Status | Retryable | Meaning |
|---|---|---|---|
| `m2_requirement_not_found` | 404 | no | Unknown or not the caller's requirement |
| `m2_requirement_expired` | 409 | no | `service_by` has passed |
| `m2_requirement_locked` | 409 | no | Edit attempted after selection |
| `m2_requirement_duplicate` | 409 | no | Probable duplicate; merge offered |
| `m2_lifecycle_not_supported` | 400 | no | Variant has no active A3/A5 configuration |
| `m2_invitation_expired` | 409 | no | Response deadline passed |
| `m2_invitation_slots_exhausted` | 409 | no | Another vendor took the last slot |
| `m2_capacity_unavailable` | 409 | no | Vendor already committed for those dates |
| `m2_capability_not_approved` | 403 | no | No approved capability for this lifecycle |
| `m2_capability_suspended` | 403 | no | Capability suspended |
| `m2_kyc_required` | 403 | no | Progressive gate: verify before accepting |
| `m2_payout_details_required` | 403 | no | Progressive gate: bank details before payout |
| `m2_crew_roster_required` | 403 | no | Progressive gate: roster before assignment |
| `m2_crew_conflict` | 409 | no | Crew member already assigned that day |
| `m2_proposal_below_wage_floor` | 400 | no | A3 rate below the statutory floor |
| `m2_proposal_invalid_shape` | 400 | no | Wrong composer shape for the lifecycle |
| `m2_proposal_not_selectable` | 409 | no | Superseded, withdrawn or expired |
| `m2_proposal_slot_conflict` | 409 | no | Identity cluster already holds a slot |
| `m2_unlock_not_available` | 409 | no | A3: no usable quote yet |
| `m2_unlock_required` | 403 | no | A3: action needs an active unlock |
| `m2_unlock_payment_pending` | 202 | yes | Awaiting provider confirmation |
| `m2_visit_plan_required` | 409 | no | A5 submit without a chosen visit plan |
| `m2_visit_plan_not_chargeable` | 409 | no | Plan checkout attempted with no held visit slot |
| `m2_visit_plan_payment_pending` | 409 | yes | Awaiting provider confirmation of the plan charge |
| `m2_visit_slot_unavailable` | 409 | no | Requested grid slot no longer has capacity |
| `m2_visit_not_completed` | 409 | no | A5 estimate submitted without a completed visit |
| `m2_rejection_cap_reached` | 409 | no | Non-responsive rejections exhausted |
| `m2_selection_conflict` | 409 | yes | Another session selected first |
| `m2_reconfirmation_expired` | 409 | no | Vendor did not reconfirm in time |
| `m2_stage_not_funded` | 409 | no | A5 stage requires funding first |
| `m2_stage_disputed` | 409 | no | Cannot auto-approve a disputed stage |
| `m2_amendment_required` | 409 | no | Scope change needs an accepted amendment |
| `m2_cancellation_needs_confirmation` | 409 | no | Counterparty confirmation required |
| `m2_provider_unavailable` | 503 | yes | Payment, storage or scan adapter timeout |

Every rejection returns the code, a user-safe message stating the next action, and the correlation ID.

## 9. Blocked on owner decisions

These are designed but cannot be given final values until the owner decides. Implementations read
them from configuration and fail closed when unset — no default is baked into code.

| Config | Blocked decision |
|---|---|
| Unlock price, tax treatment | Decision 5 and the decided model in `README.md` |
| Visit-plan tier prices; the per-slot split (vendor visit payout % vs platform share %) | Decision 1 |
| Quote-delivery SLA (A3); visit-delivery SLA and post-visit estimate window (A5), per category | Decision 2 |
| Customer no-show: platform-share disposition (vendor payout always pays) | Decision 3 |
| Non-responsive rejection cap | Pre-phase decision list |
| Commission treatment and display | Decision 4 |
| Minimum-wage floor values | Decision 7 |
| Retention percentage, warranty window | Pre-phase decision list |
| Insurance requirement per capability | Decision 6 |

Decision numbers refer to the revision 3 blocking list in `README.md` §"Decisions required before M2
acceptance".
