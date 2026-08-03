# Fulfilment, Safety, Quality and Disputes

## Work execution principles

- Both parties can stop unsafe work without being financially trapped.
- Start, scope changes, outcomes and evidence are server-authoritative.
- Completion is submitted, then confirmed/finalized; it is not a single Partner-controlled settlement
  button.
- Payment outcome follows physical outcome rather than forcing physical reality into a binary status.
- Every exceptional path creates an owned case with a deadline and allowed recovery commands.

## Before departure

Partner job detail includes only that Partner's confirmed Fulfilment Unit scope, exact address when disclosure is allowed, access notes,
Customer contact relay, timing, equipment/safety requirements and earnings. The Partner may report:

- address or access information appears inconsistent;
- required equipment/skill is missing;
- the task appears unsafe or illegal;
- they cannot attend.

Operations may correct non-financial notes, arrange replacement, reschedule or cancel. A material
address/scope change uses the formal amendment process.

## En route and late arrival

`EN_ROUTE` is explicit and idempotent. Home-service archetypes do not claim GPS proof. The customer sees
an approximate ETA and contact/support actions.

If the arrival SLA passes:

- mark the booking delayed;
- notify both parties and Operations where threshold requires;
- give the Customer fee-free cancel/reschedule;
- do not silently manufacture a new ETA;
- retain Partner explanation and notification evidence for review.

Parking, toll, gate, floor/lift and access costs are chargeable only when disclosed by policy or
approved as a revision. They cannot be demanded in cash at the door.

## Arrival and Customer unavailable

Partner records arrival, then the configured wait begins. The system attempts masked contact and
records delivery/call outcomes. The Partner may claim Customer unavailable only after the wait, with
required evidence or an Operations-verified call record.

The visit fee is fixed/capped and disclosed before booking. No evidence means no visit fee. A customer
who disputes arrival receives the ordinary dispute path. Repeated confirmed no-shows are reviewed for
account restrictions; ambiguous notification or address failures are not attributed to the Customer.

## Start OTP

- OTP becomes available only after arrival.
- It is hashed, short-lived, single-use and attempt-limited.
- Sharing it authorizes start for the booked scope, not arbitrary additional work.
- Customer refusal, missing Customer and messaging outage are distinct causes.
- Operations-assisted start requires step-up checks and an outage/access reason; all parties are
  notified afterward.

## Wrong scope, impossible work and specialist change

On arrival or after inspection, the Partner may record:

- `WRONG_SERVICE_SELECTED`
- `DIFFERENT_SPECIALIST_REQUIRED`
- `UNSAFE_SITE`
- `NOT_REPAIRABLE`
- `PART_OR_TOOL_UNAVAILABLE`
- `CUSTOMER_REQUEST_OUTSIDE_SCOPE`

The system then chooses from: no-fee reschedule to the correct variant, inspection-fee settlement,
partial completion, new quote/booking, or cancellation/refund. It never pressures the Partner to work
outside eligibility and never charges an unapproved amount.

## Additional work and materials

Amendment sequence:

1. Partner selects catalog task/material lines and reason.
2. Required evidence uploads successfully.
3. Server prices and recalculates estimated finish/capacity risk.
4. Customer sees price, scope, time effect and Decline.
5. Approval creates immutable revision.
6. Required payment succeeds.
7. Only then does the work become authorized.

If required additional work is declined, the Partner records whether the original scope can be safely
completed. If it cannot, the booking enters partial/aborted resolution; “complete the original scope”
is not assumed to be physically possible.

Partner-procured material also requires receipt validation and unused/returned-material outcome. A
Customer-approved purchase that is later returned produces a revision/refund and corresponding Partner
ledger reversal rather than an off-ledger cash adjustment.

## Partner emergency or unsafe stop during work

`ABORT_WORK` is always available after start. It requires immediate reason and, when safe, evidence.

- Safety/emergency: stop work, surface emergency contacts, create high-severity case; no automatic
  Partner fault.
- Partner health/equipment failure: record completed lines, secure the site, arrange replacement or
  reschedule, settle/refund actual outcome.
- Customer misconduct/access withdrawal: stop work, safety case if appropriate, settle verified work.
- Platform outage: preserve local evidence drafts, provide support channel, reconcile commands when
  connectivity returns.

The UI must not instruct either party to remain in danger to preserve payment eligibility.

## Offline and dependency failure

- Partner work screens keep a read-only cached job summary and unsent evidence drafts where safe.
- State-changing offline actions are queued only when idempotency and current-state revalidation make
  replay safe; arrival/start/completion always reconcile with the server before success is shown.
- Uploads are resumable and expose processing/failure states.
- SMS failure offers configured alternate transactional channel or Operations assistance.
- Payment failure during an amendment leaves original authorized scope unchanged.
- A service outage cannot auto-complete physical work.

## Completion and partial work

Partner completion submission includes:

- line-level quantities and outcomes;
- before/after or policy-required evidence;
- parts/material outcomes;
- safety/damage declaration;
- notes visible to the Customer;
- server-recorded end time.

Customer options are Confirm, Report a problem, or no response. A dispute captures affected lines,
reason and evidence. Payout does not become available while a qualifying dispute or damage case is open.

For partial/aborted work:

- price catalog-completed quantities;
- retain earned inspection fee only after a valid inspection outcome;
- refund unperformed prepaid lines;
- separately account platform-funded recovery credit;
- send unpriced/contested work to maker-checker Operations resolution.

In a Booking Group these results are unit-specific. A failed, partial or disputed unit cannot rewrite
another unit's work state. The group projection derives Customer-facing progress and financial totals
from unit facts and exposes group-wide recovery only through an explicit domain command.

## Quality, review and warranty

Only completed or partially completed work may receive a service review. Cancelled/no-show experiences
use structured incident feedback so service quality and fulfilment reliability are not mixed.

The Customer may submit one review with a bounded edit window. Partner response is moderated. Partners
may record structured Customer safety/no-show/access feedback; a public Customer star-rating system is
not required.

Warranty/rework is a product capability, not an unused schema field:

- eligible variants declare warranty policy when the warranty milestone launches;
- claims apply to original scope lines within the policy period;
- Operations classifies valid callback, new fault, customer damage or unresolved dispute;
- callback creates a linked zero-customer-charge booking with normal safety/evidence controls;
- Partner compensation and platform warranty reserve are explicit;
- repeat callback metrics are quality signals with review and appeal, not hidden rank manipulation.

Before this capability launches, the product must not advertise a warranty. M1 still provides a linked
quality-support case so a repeat failure is not treated as an unrelated complaint.

## Damage and safety incidents

Both parties can report injury, harassment, theft, property damage, dangerous equipment or illegal
requests. The workflow includes:

- emergency guidance and contact;
- immediate mutual block where appropriate;
- evidence preservation and restricted access;
- severity and response SLA;
- payout/refund hold without destructive edits;
- insurer/legal escalation where configured;
- documented outcome and appeal/review.

Operations access is least-privilege and audited. Ordinary support agents do not automatically receive
KYC, full address history or sensitive media.

## Case ownership and SLAs

Every `OperationsCase` has type, severity, owner/team, due time, current status and resolution command.
At minimum:

| Case | Initial owner | Required terminal result |
|---|---|---|
| Assignment/recovery | Dispatch Operations | replacement, reschedule or refund |
| Late/no-show | Booking support | performed, cancelled or visit-fee decision |
| Partial/aborted work | Quality support | line settlement and refund |
| Safety/damage | Restricted safety team | protective action and documented disposition |
| Payment/refund ambiguity | Finance Operations | reconciled provider/domain state |
| Payout ambiguity | Finance Operations | paid once or reservation released |
| Warranty/quality | Quality support | callback, deny with reason, or settlement |

Cases may escalate, but they may not close merely because a notification was sent.
