# M1 Scope and Flow

## Catalog scope

Choose a small set of common, one-person, task-priced Technician variants whose scope can be described
and priced before arrival. Each activated variant requires:

- skill and equipment prerequisites;
- task codes, unit prices and marginal duration estimates;
- base duration and minimum visit charge;
- scope questions and unsafe/out-of-scope rules;
- evidence policy;
- service areas/hours;
- tax/fee/commission configuration;
- cancellation and support copy.

Diagnostic, unknown-fault, heavy-installation and two-person variants remain inactive until their
owning milestone.

## Customer journey

```text
service detail
  → confirmed address and serviceability
  → task scope/quantity
  → estimated duration (display only)
  → Today or Scheduled window
  → itemized quote and cancellation policy
  → OTP login/resume
  → Finding a professional
  → Partner accepts and the no-fault undo window closes
  → Customer pays within reservation expiry
  → webhook confirms Booking
  → status, Partner and appointment details
  → En route / Arrived / start OTP
  → work and any approved amendment
  → completion submission
  → confirm or dispute
  → invoice/refund and closure
```

No stage auto-selects timing or claims availability before the server response. Back/login/refresh
preserve safe intent. The Customer may cancel Partner search without charge.

## Partner journey

```text
OTP → application/KYC/skills/area/availability → Operations approval
    → offer with scope, area, time and net earning
    → Accept/Decline confirmation
    → 120-second undo
    → exact address after disclosure gate
    → En route → Arrived → start OTP
    → tasks/evidence/amendment
    → completion or abort
    → pending earnings → Operations-reviewed payout
```

Declining an offer has no automatic consequence. Accepted-job release remains available with reason.
M1 records late release/stall/no-show for manual Operations review only.

## Operations journey

- Review and approve/return/suspend Partner applications.
- Configure approved variants/rates/areas/hours and see validation failures.
- Create an assisted Customer booking and send payment link using the ordinary domain flow.
- View Partner search, offers, reservations, booking timeline and notification delivery.
- Offer/reoffer a Partner through the same explicit acceptance path.
- Resolve delay, release, Customer unavailable, partial work and quality cases.
- Reconcile ambiguous payment/refund/payout.
- Run and approve a scheduled payout batch.
- Disable a service/area/provider without losing recovery access.

## M1 state path

```text
Checkout: CREATED → FINDING_PARTNER → PARTNER_COMMITTED
                   → PAYMENT_PENDING → COMPLETED

Offer:    OFFERED → ACCEPTED_PENDING_UNDO → COMMITTED | UNDONE
                  → DECLINED | EXPIRED | REVOKED

Reservation: TENTATIVE → CONFIRMED → RELEASED

Booking:  CONFIRMED → EN_ROUTE → ARRIVED → IN_PROGRESS
                   → COMPLETION_SUBMITTED
                   → COMPLETED | PARTIALLY_COMPLETED | DISPUTED

Recovery: CONFIRMED/EN_ROUTE → RECOVERY_REQUIRED → CONFIRMED | CANCELLED
Abort:    IN_PROGRESS → ABORTED → PARTIALLY_COMPLETED | DISPUTED
```

## Cancellation baseline

- Before successful payment: no charge.
- More than 24 hours before start: full refund.
- 24 to 2 hours: disclosed fixed booking fee at most.
- Less than 2 hours before arrival-window start and before verified arrival: capped fixed cancellation
  fee, never full task value.
- Verified arrival plus wait/contact evidence: visit fee.
- Partner/platform failure or material Partner delay: full refund and no Customer fee.
- After work starts: completed-line settlement and incomplete-line refund.

The exact M1 amounts and deadlines are frozen in
[Initial configuration](./05-initial-configuration.md). They appear in rupees before search/payment
and are snapshotted on the quote and booking so a later configuration change cannot rewrite history.

## Failure outcomes

| Failure | Required result |
|---|---|
| No eligible/accepting Partner | Alternatives; Customer not charged |
| Partner accepts, Customer does not pay | Tentative reservation expires; Partner not penalized |
| Payment succeeds, booking conversion fails | Retry to convergence or refund plus Finance case |
| Partner releases before start | Recovery, reschedule or full refund |
| Partner is late | Honest delay plus fee-free Customer cancel/reschedule |
| Customer unavailable | Wait/contact/evidence, then visit-fee quote/dispute |
| OTP/message outage | Alternate channel or audited assisted start; no universal bypass |
| Additional work declined | Original work if safe; otherwise partial/abort resolution |
| Partner stops mid-job | Abort, site safety, completed-line settlement and recovery |
| Customer disputes completion | Payout hold and Quality case |
| Customer does not respond | Evidence-gated automatic finalization after deadline |
| Refund/payout ambiguous | Reconciliation case; never guessed success |
