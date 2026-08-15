"""Customer cancel / reschedule / address-change, unit-scoped and group-wide, fee-ladder aware.

Money never gets a second path: refunds are the existing `commerce.Refund` /
`commerce.RefundAllocation` / `commerce.PaymentAllocation` tables, sized against the frozen
`QuoteUnit.cancellation_policy_snapshot` fee ladder — never live config. The group-wide command
at the bottom of `cancel` is deliberately not a second implementation of any of that: it
loops the identical `_cancel_locked_unit` the unit-scoped command uses, which is why it lives
there rather than in a module of its own.

Where to look:

* `base` — reason/idempotency-key limits and their guards, plus the inner-join-safe helpers that
  map locked `Booking` rows onto their Fulfilment Units. Imports no sibling.
* `cancel` — the fee ladder and its waivers, `preview_cancellation`, `cancel_booking`, and the
  group-wide `cancel_booked_group` with its per-unit outcomes and audit-trail replay.
* `reschedule` — the notice rule and the refusal copy, the arrival-window grid,
  `preview_reschedule`, `reschedule_booking`, `reschedule_booked_group`, and the group's
  `change_booking_group_address`.
"""

from .base import (
    _UNIT_KEY_SUFFIX_CHARS,
    MAX_CANCELLATION_REASON_CHARS,
    MAX_GROUP_IDEMPOTENCY_KEY_CHARS,
    _by_unit_id,
    _guard_cancellation_reason,
    _guard_group_idempotency_key,
    _locked_group_bookings,
)
from .cancel import (
    _MORE_THAN_2H_HOURS,
    _MORE_THAN_24H_HOURS,
    _SETTLED_GROUP_STATUSES,
    CUSTOMER_CANCELLABLE_STATUSES,
    FEE_WAIVER_PARTNER_LATE,
    FEE_WAIVER_PARTNER_RELEASED,
    REFUND_REASON_CUSTOMER_CANCELLATION,
    CancellationPreview,
    GroupCancellationResult,
    UnitCancellationOutcome,
    _apply_fee_and_refund,
    _cancel_locked_unit,
    _cancellation_fee,
    _group_already_cancelled,
    _recorded_cancellation,
    _release_booking_reservation,
    _replayed_unit_outcome,
    _settled_group_result,
    _uncancellable_reason,
    _ungroupcancellable_reason,
    cancel_booked_group,
    cancel_booking,
    customer_can_cancel,
    preview_cancellation,
    select_cancellation_band,
)
from .reschedule import (
    RESCHEDULABLE_BOOKING_STATUSES,
    RESCHEDULE_BLOCKED_RECOVERY,
    RESCHEDULE_BLOCKED_SETTLED,
    RESCHEDULE_BLOCKED_STARTED,
    RESCHEDULE_BLOCKED_TOO_CLOSE_TEMPLATE,
    GroupRescheduleResult,
    ReschedulePreview,
    UnitRescheduleOutcome,
    _earliest_reschedule_start,
    _guard_unit_reschedulable,
    _partner_has_other_reservation,
    _reschedule_blocked_reason,
    _reschedule_locked_unit,
    _reschedule_notice_ok,
    _resolve_reschedule_partner,
    _too_close_reason,
    change_booking_group_address,
    preview_reschedule,
    reschedule_booked_group,
    reschedule_booking,
    reschedule_windows,
)

__all__ = [
    "CUSTOMER_CANCELLABLE_STATUSES",
    "FEE_WAIVER_PARTNER_LATE",
    "FEE_WAIVER_PARTNER_RELEASED",
    "MAX_CANCELLATION_REASON_CHARS",
    "MAX_GROUP_IDEMPOTENCY_KEY_CHARS",
    "REFUND_REASON_CUSTOMER_CANCELLATION",
    "RESCHEDULABLE_BOOKING_STATUSES",
    "RESCHEDULE_BLOCKED_RECOVERY",
    "RESCHEDULE_BLOCKED_SETTLED",
    "RESCHEDULE_BLOCKED_STARTED",
    "RESCHEDULE_BLOCKED_TOO_CLOSE_TEMPLATE",
    "_MORE_THAN_2H_HOURS",
    "_MORE_THAN_24H_HOURS",
    "_SETTLED_GROUP_STATUSES",
    "_UNIT_KEY_SUFFIX_CHARS",
    "CancellationPreview",
    "GroupCancellationResult",
    "GroupRescheduleResult",
    "ReschedulePreview",
    "UnitCancellationOutcome",
    "UnitRescheduleOutcome",
    "_apply_fee_and_refund",
    "_by_unit_id",
    "_cancel_locked_unit",
    "_cancellation_fee",
    "_earliest_reschedule_start",
    "_group_already_cancelled",
    "_guard_cancellation_reason",
    "_guard_group_idempotency_key",
    "_guard_unit_reschedulable",
    "_locked_group_bookings",
    "_partner_has_other_reservation",
    "_recorded_cancellation",
    "_release_booking_reservation",
    "_replayed_unit_outcome",
    "_reschedule_blocked_reason",
    "_reschedule_locked_unit",
    "_reschedule_notice_ok",
    "_resolve_reschedule_partner",
    "_settled_group_result",
    "_too_close_reason",
    "_uncancellable_reason",
    "_ungroupcancellable_reason",
    "cancel_booked_group",
    "cancel_booking",
    "change_booking_group_address",
    "customer_can_cancel",
    "preview_cancellation",
    "preview_reschedule",
    "reschedule_booked_group",
    "reschedule_booking",
    "reschedule_windows",
    "select_cancellation_band",
]
