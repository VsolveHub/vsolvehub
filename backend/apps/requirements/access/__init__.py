"""The two M2 front doors: the A3 quote unlock and the A5 visit plan.

One rule runs through every command here and it is the rule the whole commercial model rests on:
**money is collected only against a real, accepted commitment, and only a verified provider
callback moves a purchase from `PENDING` to `ACTIVE`.** An unlock cannot exist without a usable
quote; a visit plan cannot be charged without a vendor who has confirmed a slot; and neither can be
granted from a client redirect, because a client redirect is a claim made by the party that
benefits from it.

The second rule is that nothing here invents a price. Tier prices and the per-slot split are
blocking owner decision 1, so every amount comes from `apps.requirements.pricing`, which refuses
with `m2_access_price_unavailable` while no row is loaded. A guessed price is indistinguishable
from an approved one once it has been charged to somebody.

Reuse, not a second money system:

* `commerce.PaymentAttempt` with new purposes, its provider orders, its webhooks, its
  reconciliation and its `FinancialException` machinery.
* `commerce.Refund` for every share that does not earn.
* `payouts.PartnerLedgerEntry` for the vendor visit payout, gated on the progressive payout rule.
* `assignments.Reservation` — the A1 booking grid — for visit slots.

The package map, door by door:

* `base` — the archetype constants, the receipt series and the reads both doors share. Imports no
  sibling.
* `unlock` — A3's door: the quote unlock from checkout to refund (`M2-BE-401`..`405`).
* `visit_plans` — A5's door: tier choice, the vendor's slot confirmation on the shared grid, the
  plan charge, and rescheduling a booked visit (`M2-BE-215`, `419`..`427`).
* `settlement` — what a booked visit becomes: arrival, completion, the two no-shows, the share each
  outcome earns or refunds (`M2-BE-423`, `425`, `426`), and the sweep selectors `tasks.py` reads.
* `arrival` — the code the Customer reads out and the vendor enters, which is what turns "somebody
  tapped arrived" into proof the two of them were in the same place.
  `settlement.confirm_visit_arrival` remains the audited fallback for a dead phone or no signal.
* `reclassification` — money carried across an A3↔A5 archetype change, and never charged twice
  (`M2-BE-427`).
"""

from .arrival import (
    ArrivalCode,
    ArrivalCodeInvalidError,
    ArrivalCodeRateLimitError,
    confirm_visit_arrival_with_code,
    issue_visit_arrival_code,
    live_visit_arrival_code,
)
from .base import (
    A3,
    A5,
    ACCESS_RECEIPT_KIND,
    active_unlock,
    assert_customer_may_read_full_quotes,
    charged_visit_plan,
    customer_may_read_full_quotes,
    latest_unlock,
    usable_proposals,
)
from .reclassification import carry_money_across_reclassification
from .settlement import (
    _earn_share,
    _mark_share_replaced,
    _refundable_attempt_id,
    _release_grid_slot,
    _settle_plan_if_complete,
    complete_plan_visit,
    confirm_visit_arrival,
    expired_visit_hold_ids,
    held_visit_payout_share_ids,
    missed_estimate_visit_ids,
    refund_share,
    release_expired_visit_hold,
    release_visit_payout_hold,
    report_visit_no_show,
    settle_missed_estimate,
    settle_share_for_estimate,
    unfilled_share_ids,
)
from .unlock import (
    complete_unlock,
    consume_unlock,
    create_unlock_checkout,
    refund_unlock,
    unlock_availability,
)
from .visit_plans import (
    VisitSlotConfirmation,
    _activate_free_plan,
    _create_shares,
    _hold_grid_slot,
    _mark_visits_booked,
    _next_open_share,
    assert_visit_plan_chosen,
    choose_visit_plan,
    complete_visit_plan,
    confirm_visit_slot,
    create_visit_plan_checkout,
    reschedule_plan_visit,
    visit_plan_checkout_availability,
)

__all__ = [
    "A3",
    "A5",
    "ACCESS_RECEIPT_KIND",
    "ArrivalCode",
    "ArrivalCodeInvalidError",
    "ArrivalCodeRateLimitError",
    "VisitSlotConfirmation",
    "_activate_free_plan",
    "_create_shares",
    "_earn_share",
    "_hold_grid_slot",
    "_mark_share_replaced",
    "_mark_visits_booked",
    "_next_open_share",
    "_refundable_attempt_id",
    "_release_grid_slot",
    "_settle_plan_if_complete",
    "active_unlock",
    "assert_customer_may_read_full_quotes",
    "assert_visit_plan_chosen",
    "carry_money_across_reclassification",
    "charged_visit_plan",
    "choose_visit_plan",
    "complete_plan_visit",
    "complete_unlock",
    "complete_visit_plan",
    "confirm_visit_arrival",
    "confirm_visit_arrival_with_code",
    "confirm_visit_slot",
    "consume_unlock",
    "create_unlock_checkout",
    "create_visit_plan_checkout",
    "customer_may_read_full_quotes",
    "expired_visit_hold_ids",
    "held_visit_payout_share_ids",
    "issue_visit_arrival_code",
    "latest_unlock",
    "live_visit_arrival_code",
    "missed_estimate_visit_ids",
    "refund_share",
    "refund_unlock",
    "release_expired_visit_hold",
    "release_visit_payout_hold",
    "report_visit_no_show",
    "reschedule_plan_visit",
    "settle_missed_estimate",
    "settle_share_for_estimate",
    "unfilled_share_ids",
    "unlock_availability",
    "usable_proposals",
    "visit_plan_checkout_availability",
]
