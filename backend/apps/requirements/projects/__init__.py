"""The A5 project: milestones, delays, handover, and what happens when a vendor walks away.

**A5 is the same spine as A3, and this module adds no second one** (`M2-BE-541`). A milestone is
an `EngagementStage`; funding, evidence, review, approval, correction, dispute and release are the
Wave C3 commands in `apps.requirements.stages`, unchanged and uncopied. The archetype is a field on
the record. What lives here is only the four facts a project has and a shift-day does not:

* **A milestone delivers something** — a name and a deliverable rather than a date on a calendar.
  That is `EngagementStage.deliverable`, written by `engagements._a5_stages` from the selected
  estimate, and the read below is what publishes it beside the original it was agreed at.
* **A schedule can move without any money moving** (`ProjectDelayClaim`, `M2-BE-544`). The M1
  amendment engine deliberately cannot express this: `requirements_engagement_amendment_moves_money`
  refuses a zero delta at the database, because an amendment a Customer has to decide on that
  changes no money is a decision about nothing. A locked gate on Tuesday is a schedule fact. If it
  costs money it is extra work, and extra work is an amendment both parties accept — keeping the
  two apart is what stops "the site was not ready" from quietly becoming a bill.
* **A vendor can change** (`ProjectTransfer`, `M2-BE-545`). This is the one term an engagement
  freezes that no amendment was ever designed to move, and it is where the delta lives.
* **A deliverable can be a file** (`ProjectDeliverable`, `M2-BE-547`), because Event and Media work
  is finished by handing something over rather than by standing somewhere.

## The money rules, stated once

**Stages fund at face value and there is no stage credit** (07 §4a). Nothing here discounts a
stage: the visit-plan money was spent on the visits and settles per share, and a project that
funded its first milestone short by the price of a visit would be paying for those visits twice
out of the vendor's work.

**A funded material advance is never clawed back** (`M2-BE-543`). `README.md`: material money is
spent rather than earned. Wave C3.5 built the discriminator — `EngagementStage.kind`, its own
payment purpose — and `route_suspended_capability_engagements` was the first rule that could read
it. These are the other two rules it exists for: on a **transfer** the advance is left with the
abandoning vendor and recorded as outstanding, and on an **early termination** it is not returned.
Both are the same refusal: refunding it automatically would be Vsolve settling a goods dispute
with a background job, and handing it to a replacement would buy the same cement twice.

**Retention is payout-side money.** `M2-BE-546` lives in `stages` rather than here, because it is
withheld at approval and released at warranty close — both spine moments — and the only thing this
module does with it is publish it.

## Two guards worth naming

Every command below refuses on an **A3** engagement. A shift-day has no deliverable, no handover
and no schedule to extend, and a delay claim against one would be a vendor asking for a day back
that was already settled in cash that evening.

Every command that changes what a Customer owes needs the **Customer's own acceptance**. Operations
proposes a transfer; the Customer accepts it. An operator repointing a project at a new vendor at a
new price without asking would be a third party changing somebody's agreement, which is exactly
what `07-state-machines-and-permissions.md` §7 forbids Operations from doing.

## Where each part lives

* `base` — shared plumbing: the archetype constant, the engagement lock, the A3 refusal, the
  open-project guard and the milestone lookup; imports no sibling.
* `delays` — Customer-caused delay and the schedule extension (`M2-BE-544`): raising, deciding and
  expiring a claim, and the shift it applies to this milestone and every later one.
* `handover` — digital deliverable handover (`M2-BE-547`): the vendor's submission and the
  Customer's acceptance, both referencing the stage evidence rail rather than receiving bytes.
* `recovery` — vendor abandonment (`M2-BE-545`, and the half of `M2-BE-543` Wave C3.5 left open):
  the transfer to a replacement, the early termination, and the settlement both share.
* `reads` — the read (`M2-BE-541`, `549`): the one project payload, the milestone list published
  twice over, and the participant-scoped lookups. Writes nothing.
"""

from .base import (
    A5,
    _assert_engagement_open,
    _locked_engagement,
    _project_stage,
    assert_project_engagement,
)
from .delays import (
    MAXIMUM_EXTENSION_DAYS,
    _shift_schedule_from,
    decide_delay_claim,
    expire_delay_claim,
    expired_delay_claim_ids,
    raise_delay_claim,
)
from .handover import (
    MAXIMUM_DELIVERABLES_PER_HANDOVER,
    DeliverableInput,
    accept_project_handover,
    submit_project_handover,
)
from .reads import (
    delay_claim_for_participant,
    live_delay_claim,
    milestone_rows,
    project_payload,
    transfer_for_customer,
)
from .recovery import (
    CANCELLED_BY_TERMINATION,
    CANCELLED_MATERIAL_OUTSTANDING,
    TransferQuote,
    _cancel_stage,
    _return_unearned_funding,
    decide_project_transfer,
    expire_project_transfer,
    expired_project_transfer_ids,
    outstanding_material_advances,
    propose_project_transfer,
    terminate_project_early,
    transferable_stages,
)

__all__ = [
    "A5",
    "CANCELLED_BY_TERMINATION",
    "CANCELLED_MATERIAL_OUTSTANDING",
    "MAXIMUM_DELIVERABLES_PER_HANDOVER",
    "MAXIMUM_EXTENSION_DAYS",
    "DeliverableInput",
    "TransferQuote",
    "_assert_engagement_open",
    "_cancel_stage",
    "_locked_engagement",
    "_project_stage",
    "_return_unearned_funding",
    "_shift_schedule_from",
    "accept_project_handover",
    "assert_project_engagement",
    "decide_delay_claim",
    "decide_project_transfer",
    "delay_claim_for_participant",
    "expire_delay_claim",
    "expire_project_transfer",
    "expired_delay_claim_ids",
    "expired_project_transfer_ids",
    "live_delay_claim",
    "milestone_rows",
    "outstanding_material_advances",
    "project_payload",
    "propose_project_transfer",
    "raise_delay_claim",
    "submit_project_handover",
    "terminate_project_early",
    "transfer_for_customer",
    "transferable_stages",
]
