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
