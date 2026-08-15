"""The one gate that decides whether M2 may take a **new** commercial commitment.

`M2-BE-810`, stated as a rule rather than a switch: *a feature flag gates new purchases only.
In-flight requirements and funded stages remain reachable and refundable when a flag is turned
off.* A flag that stranded a funded stage would be worse than no flag at all — the Customer's money
is already in, the vendor's diary is already blocked, and the only thing a pause could achieve
there is to make both parties wait with no route forward.

## Why this reuses `notifications.KillSwitch` rather than adding a flag table

`KillSwitch` is already the platform's answer to "stop a capability now": a row, not a setting, so
it changes without a deploy; an actor and a reason on both engage and release, enforced by a check
constraint; one published Operations endpoint pair that writes it
(`POST /api/v1/operations/kill-switches/` and `.../release/`); and one read, `is_engaged`, that
treats a blank `target` as global. A second flag subsystem would have meant a second audit trail
and a second screen to find under pressure.

## The audit that motivated this module

Wave C7's reader/writer sweep found the mirror of the defect the earlier waves kept finding. Five
`KillSwitch.Scope` values — `PAYMENTS`, `PAYOUTS`, `DISPATCH`, `SERVICE_AREA`, `SERVICE` — are
published enum members with an audited, reachable **writer** and **no reader anywhere in the
codebase**. `seed_console_demo_data` engages `SERVICE_AREA` with the reason "flooding reported in
the service area", and nothing at all happens: dispatch continues into the flood. This module closes
`PAYMENTS` and the new `M2_PURCHASES` for the M2 purchase paths. The other three stay unread and are
named in `docs/runbooks/m2-threat-model.md` rather than quietly wired here, because each one belongs
to a subsystem this wave does not own.

**`SERVICE_AREA` is deliberately not consulted.** `seed_console_demo_data` leaves it engaged on
`hyderabad-500032`, which is the same area `seed_m2_demo` seeds — so wiring it would refuse every M2
purchase in a developer's only seeded city for a reason nobody could see from the refusal. That is
precisely the shape of the Wave C2R defect, and reproducing it in the wave that exists to prevent it
would be a poor joke. "Flooding stops work here" is a dispatch-side rule and belongs on the offer
cascade, where it can also stop offers that are already out.

## What is gated, and what is not

The line is drawn in one place and it is worth stating as a sentence, because three of the four
"not gated" entries below follow from it rather than from a separate judgement: **gate the door
that starts burning supply; never gate the payment that resolves a hold a vendor is already sitting
on.**

Gated — each one *creates* a commitment that does not exist yet, and each runs before any vendor
has been asked for anything:

* `crew_dispatch.book_at_published_rate` — the A3 instant front door. Refused before the cascade
  goes out, so no lead's phone rings for a job that is about to be refused.
* `access.create_unlock_checkout` — the A3 unlock (the thin-supply fallback's paywall).
* `access.choose_visit_plan` — the A5 tier choice, which creates the plan and its shares and bounds
  the invitation wave.

Not gated, and this list is the point of the task:

* `booking_fees.create_booking_fee_checkout`. A lead has accepted and is holding their days; the
  Customer paying is what *releases* that hold one way or the other. Pausing here would freeze a
  vendor's diary behind a switch.
* `access.create_visit_plan_checkout`, for exactly the same reason one paragraph along the A5
  spine: a vendor has confirmed a slot and is holding it, and the charge is what settles it. The
  A5 door that *is* gated is the tier choice, which happens before anybody is invited.
* Every `complete_*` provider callback. The money has already left the Customer's account; refusing
  to record it would produce a charge with no entitlement, which is the single worst outcome in
  this system.
* Stage and amendment funding on an existing engagement. This is the "funded stages must continue"
  half, and it is the reason the gate is a function called at four sites rather than a check inside
  `commerce.initiate_standalone_payment_attempt`.
* Every refund, forfeit, payout, cancellation, dispute and case path. A pause must never make money
  harder to give back than it was to take.
"""

import uuid

from apps.notifications.models import KillSwitch
from apps.notifications.services import is_engaged
from apps.requirements import metrics
from apps.requirements.exceptions import PurchasesPausedError
from apps.requirements.models import CustomerRequirement

#: Checked in order, and the order is the message the operator gets: the M2-specific pause first,
#: because it is the one an Operations lead engages on purpose, and the provider-wide one second.
#:
#: Held as a tuple so `assert_new_purchase_allowed` cannot drift from `new_purchase_pause_reason`
#: — the same rule the constraint tuples in `catalog.models` follow, one subsystem along.
GATED_SCOPES: tuple[str, ...] = (
    KillSwitch.Scope.M2_PURCHASES,
    KillSwitch.Scope.PAYMENTS,
)


def new_purchase_pause_reason(*, variant_id: uuid.UUID | None = None) -> str | None:
    """The scope that is currently pausing new purchases, or `None` when nothing is.

    `variant_id` narrows to a per-product pause. `is_engaged` already treats a blank `target` as
    global, so passing a variant checks "all of M2" and "this product" together rather than making
    the caller ask twice.

    Answers the *scope name*, not the operator's free-text reason. The reason is an internal note
    written under pressure ("razorpay 5xx, ~10 min") and shows up in the Operations board and the
    audit row; putting it in a Customer-facing refusal would leak an incident note to the public.
    """
    target = "" if variant_id is None else str(variant_id)
    for scope in GATED_SCOPES:
        if is_engaged(scope, target):
            return str(scope)
    return None


def new_purchases_allowed(*, variant_id: uuid.UUID | None = None) -> bool:
    """Whether a new commitment may be taken right now. The read behind the honest empty state.

    Exists so a screen can say "we have paused new bookings" *before* the Customer fills in a
    preset and taps, rather than after. A refusal at the tap is correct and a refusal at the door
    is kind, and the availability reads that already exist (`unlock_availability`,
    `visit_plan_checkout_availability`) are the precedent for answering a boolean here.
    """
    return new_purchase_pause_reason(variant_id=variant_id) is None


def assert_new_purchase_allowed(requirement: CustomerRequirement, *, door: str) -> None:
    """Refuse a new commitment while a pause is engaged. The three gated commands call this.

    Takes the requirement rather than a variant id because every call site has one and because the
    variant is what a per-product pause targets — an Operations lead pausing "helpers by the day"
    after a rate-card error should not also stop A5 fit-out projects being sold.

    `door` names the caller. It is required rather than defaulted so that a fourth gated command
    added later cannot be counted as one of the three that already exist — the metric is how anyone
    finds out what a pause actually cost, and an unlabelled refusal is a number with no subject.
    """
    scope = new_purchase_pause_reason(variant_id=requirement.variant_id)
    if scope is None:
        return
    metrics.record_purchase_paused(variant_id=requirement.variant_id, scope=scope, door=door)
    raise PurchasesPausedError()
