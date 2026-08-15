"""The A3 shift-day: crew, arrival, attendance, the evening settlement, safety and cash demands.

Wave C4 (`M2-BE-521..539`). `07-state-machines-and-permissions.md` §5 maps an A3 stage to a
shift-day and says funding is not required because A3 is `LEAD_ONLY`, so this module is a **thin
tail on the C3 spine** rather than a second lifecycle. Every state change a shift-day makes is one
of the C3 stage commands, called from here with the shift-day's own facts attached:

| The shift-day's act | The spine command it is |
|---|---|
| The crew arrived | `stages.start_stage` (plus the booking fee earning on day one) |
| The supervisor recorded "n of m" | `stages.submit_stage_evidence` — the count *is* the evidence |
| The Customer confirmed the count | `stages.approve_stage`, which for `LEAD_ONLY` also releases |
| The Customer disputed the count | `stages.dispute_stage`, carrying the per-worker detail |

That mapping is the whole design, and it is what keeps the review timeout, the audit trail, the
dispute path and the Operations decision working on A3 without a line of new lifecycle code. Two
things are genuinely new because the spine has no equivalent: the assignment of named people to a
day, and the evening settlement of money **this platform never touches**.

**Nothing here moves wage money.** ADR-0009: wages are direct, daily, peer-to-peer at day end. The
settlement below records an amount and two taps; there is no `PaymentAttempt`, no ledger entry and
no payout in this file, and adding one would make the platform a party to a payment it has always
said it is not. The only online charge on this path is the booking fee, in `booking_fees.py`.

**Owner-blocked values fail closed, and each one fails in the direction that does least damage.**
The retroactive overtime window refuses a retroactive request (`m2_policy_unavailable`) because it
decides whether work already done is paid for. The standing thresholds do *not* refuse anything:
they gate a background consequence, so an unset one means no demotion and no removal fires while
the events accumulate — the same asymmetry `rate_cards.decline_alarm_policy` draws, for the same
reason.

The package is split by what each slice acts on, in one direction only:

* `base` — the frozen terms and the guards every command opens with. No sibling imports.
* `crew` — who is named for one day, and who else has already promised them.
* `attendance` — arrival, the supervisor's count, the Customer's answer, the shortfall choice.
* `settlement` — what the day is worth, the UPI convenience link, the two "day settled?" taps.
* `extras` — overtime and add-ons, priced from the frozen card through the M1 amendment engine.
* `safety` — safety incidents and cash-demand reports, neither of which touches the work.
"""

from .attendance import (
    ATTENDANCE_CONFIRM,
    ATTENDANCE_DISPUTE,
    ATTENDANCE_RESPONSES,
    MAXIMUM_DISPUTED_WORKERS,
    _apply_shortfall_choice,
    _dispute_attendance,
    _earn_booking_fee_on_first_day,
    confirm_attendance,
    confirm_shift_arrival,
    respond_attendance,
)
from .base import (
    ShiftTerms,
    _assert_workforce_stage,
    _locked_stage,
    ensure_attendance,
    shift_date_of,
    shift_terms,
)
from .crew import (
    _busy_crew_member_ids,
    assign_crew,
    assigned_crew,
    future_assignment_dates,
)
from .extras import (
    EXTRA_ADD_ON,
    EXTRA_KINDS,
    EXTRA_OVERTIME,
    ShiftExtra,
    _assert_overtime_is_timely,
    propose_shift_extra,
)
from .safety import (
    _suspend_on_cash_demand_pattern,
    decide_safety_incident,
    report_cash_demand,
    report_safety_incident,
)
from .settlement import (
    _refresh_settlement,
    _stage_extras_paise,
    confirm_day_settled,
    unproven_settlement_ids,
    upi_payment_link,
)

__all__ = [
    "ATTENDANCE_CONFIRM",
    "ATTENDANCE_DISPUTE",
    "ATTENDANCE_RESPONSES",
    "EXTRA_ADD_ON",
    "EXTRA_KINDS",
    "EXTRA_OVERTIME",
    "MAXIMUM_DISPUTED_WORKERS",
    "ShiftExtra",
    "ShiftTerms",
    "_apply_shortfall_choice",
    "_assert_overtime_is_timely",
    "_assert_workforce_stage",
    "_busy_crew_member_ids",
    "_dispute_attendance",
    "_earn_booking_fee_on_first_day",
    "_locked_stage",
    "_refresh_settlement",
    "_stage_extras_paise",
    "_suspend_on_cash_demand_pattern",
    "assign_crew",
    "assigned_crew",
    "confirm_attendance",
    "confirm_day_settled",
    "confirm_shift_arrival",
    "decide_safety_incident",
    "ensure_attendance",
    "future_assignment_dates",
    "propose_shift_extra",
    "report_cash_demand",
    "report_safety_incident",
    "respond_attendance",
    "shift_date_of",
    "shift_terms",
    "unproven_settlement_ids",
    "upi_payment_link",
]
