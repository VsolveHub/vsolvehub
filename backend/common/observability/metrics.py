"""Operational counters, emitted as structured log events.

## Why log events rather than a metrics client

The platform already ships JSON logs with a request id on every line, and every deployment
target can scrape them. Adding a Prometheus client would mean a second transport, a second
failure mode and an exporter endpoint to secure — for numbers that are already being written
down. When a metrics backend is chosen, `emit` is the one function that changes.

What matters more than the transport is that the *names* are fixed here. A metric invented at
its call site is a metric nobody can alert on, because the alert and the emitter disagree about
what it is called the first time someone renames a variable.

## The list is the plan's list

`08-security-quality-and-production.md` names what has to be watched: conversion, assignment,
lateness/no-show, partial/dispute, money ambiguity, case SLA, outbox depth and worker queues.
Each one below maps to a row of it, so a reader can check the coverage rather than guess at it.
"""

import logging
from contextlib import suppress
from typing import Any

logger = logging.getLogger("vsolve.metrics")


class Metric:
    """Every counter this platform emits, named once."""

    # Conversion
    CART_CONFIRMED = "booking.group_confirmed"
    PAYMENT_CAPTURED = "payment.captured"
    PAYMENT_FAILED = "payment.failed"

    # Assignment
    OFFER_SENT = "dispatch.offer_sent"
    OFFER_ACCEPTED = "dispatch.offer_accepted"
    OFFER_EXPIRED = "dispatch.offer_expired"
    GROUP_REPLAN_REQUIRED = "dispatch.replan_required"

    # Lateness and no-show
    PARTNER_LATE = "fulfilment.partner_late"
    CUSTOMER_UNAVAILABLE = "fulfilment.customer_unavailable"

    # Partial and dispute
    WORK_ABORTED = "fulfilment.work_aborted"
    COMPLETION_DISPUTED = "fulfilment.completion_disputed"
    PARTIAL_COMPLETION = "fulfilment.partial_completion"

    # Money ambiguity — the ones that mean a human has to look
    REFUND_AMBIGUOUS = "money.refund_ambiguous"
    PAYOUT_AMBIGUOUS = "money.payout_ambiguous"
    FINANCIAL_EXCEPTION_OPENED = "money.financial_exception_opened"

    # Case SLA
    CASE_OPENED = "case.opened"
    CASE_BREACHED_SLA = "case.breached_sla"
    CASE_RESOLVED = "case.resolved"

    # Async health
    OUTBOX_DEPTH = "outbox.pending_depth"
    OUTBOX_DEAD_LETTERED = "outbox.dead_lettered"
    NOTIFICATION_FAILED = "notification.failed"


class M2Metric:
    """M2's own counters (`M2-BE-806`), named once, for `README.md`'s success measures.

    ## Why so few names for so many measures

    `Django_Next.js_Plan/M2/README.md` §"Success measures" lists fifteen things a launch category
    declares a target for, and almost all of them are **ratios of two counts on the same funnel**:
    crew fill rate is accepted-and-confirmed over booked, fallback rate is fallen-back over booked,
    unlock conversion is unlocked over quoted, plan conversion is charged over chosen. A separate
    metric per ratio would mean fifteen emitters that can each drift from the transition they claim
    to count.

    So the funnel is emitted **once**, from `apps.requirements.services.record_transition` — the
    single audited spine every M2 command already writes to — carrying the `reason_code` as a
    label. `booked_at_published_rate`, `crew_offer_accepted`, `booking_fee_verified`,
    `fell_back_to_quote_flow`, `first_visit_slot_confirmed`, `estimate_delivered`,
    `proposal_selected`, `day_settled_confirmed` and `cash_demand_reported` are all already written
    there, so every rate above is two `label` filters apart downstream. The task says *emit them,
    do not compute a dashboard*, and this is what that distinction buys: a counter that cannot
    disagree with the audit trail, because it is emitted from inside it.

    What a funnel counter genuinely cannot give is **elapsed time**. "Time to confirmed crew" and
    "time to first confirmed visit, against the declared promise" need the clock read at the moment
    of confirmation and compared with the SLA that was in force, so those two get their own metric
    with a duration and a `within_sla` label on it.
    """

    #: One row of the requirement audit trail, as a counter. Labels: `archetype`, `from_status`,
    #: `to_status`, `reason_code`. The denominator and the numerator of nearly every published rate.
    REQUIREMENT_TRANSITION = "m2.requirement.transition"

    #: `M2-BE-806`'s two clocks, both against the SLA that was in force at the time. Labels carry
    #: `elapsed_seconds`, `within_sla` (`true` / `false` / `no_promise`) and `variant_id`.
    #: `no_promise` is a real third answer, not a missing value: an unset `first_visit_sla_hours`
    #: means the owner promised nothing, and scoring that as a breach would invent a target.
    CREW_CONFIRMED = "m2.crew.time_to_confirmed"
    FIRST_VISIT_CONFIRMED = "m2.visit.time_to_first_confirmed"

    #: A new purchase refused because Operations paused the product (`M2-BE-810`). Emitted so a
    #: pause is visible as demand that was turned away rather than only as a switch somebody flipped
    #: — the two numbers together are what says whether the pause cost anything.
    PURCHASE_PAUSED = "m2.purchase.paused"

    #: An Operations touch on one request (`M2-BE-715`), against the configured budget. Labels
    #: carry `action`, `touch_count` and `budget` — where `budget` may be `unset`, because
    #: measurement never waits on the owner and only the judgement does.
    OPERATIONS_TOUCH = "m2.operations.touch"

    #: Abuse controls (`M2-BE-803`). A throttled request, and the one case that must never be
    #: silent: the rate limiter could not reach its cache and therefore allowed a request it may
    #: have been supposed to refuse.
    REQUEST_THROTTLED = "m2.abuse.request_throttled"
    THROTTLE_CACHE_UNAVAILABLE = "m2.abuse.throttle_cache_unavailable"

    #: Retention and redaction (`M2-BE-805`). A redaction that ran, and a deletion request that a
    #: financial or legal hold outranked.
    SUBJECT_REDACTED = "m2.retention.subject_redacted"
    DELETION_BLOCKED_BY_HOLD = "m2.retention.deletion_blocked_by_hold"
    ATTACHMENT_ACCESS_EXPIRED = "m2.retention.attachment_access_expired"

    #: Stuck asynchronous work (`M2-BE-808`). Emitted by the watchdog sweep, one per class of stuck
    #: work found, so an alert can fire on the number rather than on a log line's wording.
    ASYNC_WORK_STUCK = "m2.async.work_stuck"


def emit(metric: str, value: int = 1, **labels: Any) -> None:
    """Record one observation.

    Deliberately never raises. A metric that can break the command it measures is worse than no
    metric — the whole point is to observe a system, not to add a way for it to fail.
    """

    # Swallowed on purpose. A metric that can break the command it measures is worse than no
    # metric: the point is to observe a system, not to add a way for it to fail. There is nowhere
    # useful to report a failure *to* here either — the logger is the thing that just failed.
    with suppress(Exception):
        logger.info(
            "metric",
            extra={"metric": metric, "metric_value": value, "metric_labels": labels},
        )
