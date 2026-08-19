"""Selection and the engagement both archetypes run on.

**Selection is not a booking.** A Customer choosing a proposal starts a clock, not a job: the
vendor has to reconfirm price, date and capacity, and the checks that ran when they quoted are run
again at the moment they commit. A capability suspended in between, a diary that filled, a quote
whose validity elapsed — all of them have to bite here, because this is the last point at which
either party can walk away cheaply.

When a vendor declines or the clock runs out, **the Customer's entitlement survives**. The unlock
(A3) or the visit plan (A5) is not consumed by a selection that failed, and the next quote,
estimate or replacement visit costs nothing more. That single rule is what stops a timeout from
becoming a second purchase.

One spine, two archetypes:

* **A3 is `LEAD_ONLY`.** The engagement *is* the connection: contact is released, work may start,
  and Vsolve's revenue was the unlock fee. No commission is recorded, because Vsolve does not
  collect the service payment and booking a commission against money it never touches would be
  fiction.
* **A5 is `MANAGED_PAYMENT_REQUIRED`.** The engagement opens, stages are frozen at their quoted
  amounts, and nothing starts until the first stage is funded **at face value** — the visit money
  settled per share and never discounts a stage.

Wave C2 creates this aggregate and freezes its terms. The stage command spine — evidence,
approval, correction, dispute, release — is Wave C3 and is deliberately absent here rather than
half-built.

Where each part lives. Every name below is re-exported here, so `apps.requirements.engagements.X`
still resolves:

* `base` — the two archetype aliases and `shift_dates`, the writer for `scheduled_on` on the
  workforce path. Imports no sibling, so it is the bottom of the package's dependency arrow.
* `selection` — the Customer's choice, which now opens the engagement in the same command.
  The reconfirmation clock, decline and expiry survive only for selections written before
  that; see the module's own note for what replaced them and where the checks went.
* `opening` — what an accepted quote becomes: frozen terms and the stage ledger.
* `rate_card` — the A3 engagement a verified booking fee opens, and its free re-dispatch.
* `funding` — A5 stage checkouts and the verified callback that starts the project.
* `suspension` — routing funded or committed work when a capability is suspended.
"""

from .base import A3, A5, shift_dates
from .funding import complete_stage_funding, create_stage_funding_checkout
from .opening import _a3_stages, _a5_stages, _open_engagement, _proposal_terms
from .rate_card import open_rate_card_engagement, reopen_rate_card_engagement
from .selection import (
    _assert_customer_may_select,
    _hold_belongs_to_this_requirement,
    _lapse_proposal,
    _restore_after_failed_selection,
    decline_selection,
    expire_selection,
    expired_selection_ids,
    reconfirm_selection,
    select_proposal,
)
from .suspension import (
    SuspensionRouting,
    capability_engagements,
    route_suspended_capability_engagements,
)

__all__ = [
    "A3",
    "A5",
    "SuspensionRouting",
    "_a3_stages",
    "_a5_stages",
    "_assert_customer_may_select",
    "_hold_belongs_to_this_requirement",
    "_lapse_proposal",
    "_open_engagement",
    "_proposal_terms",
    "_restore_after_failed_selection",
    "capability_engagements",
    "complete_stage_funding",
    "create_stage_funding_checkout",
    "decline_selection",
    "expire_selection",
    "expired_selection_ids",
    "open_rate_card_engagement",
    "reconfirm_selection",
    "reopen_rate_card_engagement",
    "route_suspended_capability_engagements",
    "select_proposal",
    "shift_dates",
]
