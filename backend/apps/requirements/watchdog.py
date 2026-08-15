"""The watchdog that notices asynchronous M2 work nobody is going to finish (`M2-BE-808`).

## What this is not

It is not a recovery job. Every one of the twenty-odd M2 sweeps already recovers something: an
expired offer widens the cascade, an unfilled share refunds, a stalled booking advances, a lapsed
confirmation opens a case. This one **finds the work those sweeps did not, and says so out loud**.

The distinction matters because the failures worth alerting on are precisely the ones a recovery
sweep cannot fix — an outbox event that has spent its whole retry budget, a payment attempt the
provider never resolved, a booking whose cascade stopped advancing while the sweep meant to advance
it was not running. In each case something *else* is broken, and the correct response is a person,
not another retry.

## Why it reports rather than acts

The same reason `reconciliation.reconcile_m2_money` reports rather than corrects: a watchdog that
could fix what it found would quietly rewrite history whenever its own judgement was wrong, and the
first sign of trouble would be a system that always looked healthy. This emits counters and returns
them. `docs/runbooks/m2-adapter-reliability.md` holds the alert thresholds and the response.

## Why every threshold is a setting and none is an `M2VariantConfiguration` column

None of these is an owner decision. "How long may an outbox event sit before somebody should look"
is an operational judgement about this deployment's queue, not a term of the commercial model, and
it changes when the infrastructure changes rather than when a category launches. Putting it in the
variant configuration would mean one more column that fails closed while unset, one more row for
`seed_m2_demo` to write, and a per-service answer to a per-cluster question.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from apps.commerce.models import PaymentAttempt, Refund
from apps.commerce.services import PAYMENT_FINAL_STATES
from apps.foundation.models import OutboxEvent
from apps.notifications.models import NotificationIntent
from apps.requirements.models import (
    BookingFee,
    QuoteUnlock,
    RateCardBooking,
    VisitPlan,
)
from apps.requirements.reconciliation import M2_FEE_PURPOSES
from common.observability.metrics import M2Metric, emit

#: Payment statuses that are neither final nor terminal — the provider has not told us what
#: happened. **Derived** from `PAYMENT_FINAL_STATES` and the two terminal failures rather than
#: hand-listed, so a new status added to `PaymentAttempt` is treated as unresolved until somebody
#: classifies it. That direction is the safe one for a watchdog: a status nobody has thought about
#: shows up in a count, rather than silently never being watched.
UNRESOLVED_PAYMENT_STATUSES: tuple[str, ...] = tuple(
    status
    for status in PaymentAttempt.Status.values
    if status not in PAYMENT_FINAL_STATES
    and status not in (PaymentAttempt.Status.FAILED, PaymentAttempt.Status.EXPIRED)
)


@dataclass(frozen=True, slots=True)
class StuckWork:
    """One class of work that has stopped moving, and how much of it there is."""

    #: A stable name an alert rule can be written against. Never a sentence.
    kind: str
    count: int
    #: The oldest offender's age in seconds, or `None` when there are none. A count of one that is
    #: three days old and a count of one that is eleven minutes old need different reactions.
    oldest_age_seconds: int | None


def _age_seconds(oldest: datetime | None) -> int | None:
    if oldest is None:
        return None
    return int((timezone.now() - oldest).total_seconds())


def _outbox_dead_lettered() -> StuckWork:
    """Events that spent the whole retry budget. Nothing will pick these up again."""
    rows = OutboxEvent.objects.filter(
        published_at__isnull=True,
        attempts__gte=settings.OUTBOX_MAX_ATTEMPTS,
    )
    return StuckWork(
        kind="outbox_dead_lettered",
        count=rows.count(),
        oldest_age_seconds=_age_seconds(
            rows.order_by("created_at").values_list("created_at", flat=True).first()
        ),
    )


def _outbox_overdue() -> StuckWork:
    """Events due for delivery well past their visibility deadline.

    Distinct from dead-lettering: these still have retries left, which means the recovery sweep
    should have taken them. A non-zero count here says the **worker or the beat** is the problem,
    not the event.
    """
    cutoff = timezone.now() - timedelta(seconds=settings.M2_STUCK_OUTBOX_SECONDS)
    rows = OutboxEvent.objects.filter(
        published_at__isnull=True,
        available_at__lt=cutoff,
        attempts__lt=settings.OUTBOX_MAX_ATTEMPTS,
    )
    return StuckWork(
        kind="outbox_overdue",
        count=rows.count(),
        oldest_age_seconds=_age_seconds(
            rows.order_by("available_at").values_list("available_at", flat=True).first()
        ),
    )


def _payments_unresolved() -> StuckWork:
    """M2 fee charges the provider has neither captured nor failed, long past the window.

    The Customer's money may or may not have left. This is the state `commerce.reconcile_payments`
    exists to drive out of, so a standing count means the reconciliation itself is not running or
    the provider is not answering — and it is the one on this list a Customer can feel.
    """
    cutoff = timezone.now() - timedelta(seconds=settings.M2_STUCK_PAYMENT_SECONDS)
    rows = PaymentAttempt.objects.filter(
        purpose__in=M2_FEE_PURPOSES,
        status__in=UNRESOLVED_PAYMENT_STATUSES,
        created_at__lt=cutoff,
    )
    return StuckWork(
        kind="m2_payment_unresolved",
        count=rows.count(),
        oldest_age_seconds=_age_seconds(
            rows.order_by("created_at").values_list("created_at", flat=True).first()
        ),
    )


def _refunds_unsettled() -> StuckWork:
    """Refunds asked for and never confirmed. Money the platform has promised back."""
    cutoff = timezone.now() - timedelta(seconds=settings.M2_STUCK_REFUND_SECONDS)
    rows = Refund.objects.filter(
        payment_attempt__purpose__in=M2_FEE_PURPOSES,
        status__in=(Refund.Status.REQUESTED, Refund.Status.PROCESSING),
        created_at__lt=cutoff,
    )
    return StuckWork(
        kind="m2_refund_unsettled",
        count=rows.count(),
        oldest_age_seconds=_age_seconds(
            rows.order_by("created_at").values_list("created_at", flat=True).first()
        ),
    )


def _cascades_stalled() -> StuckWork:
    """A3 bookings still looking for a crew long after the cascade should have resolved.

    `sweep_stalled_rate_card_bookings` is the watchdog that advances these. This is the watchdog on
    that watchdog, and its count should be zero at all times: a booking sitting in `MATCHING` for an
    hour on an *instant* product is the single most visible failure M2 has, because the Customer is
    watching a holding state that promised minutes.
    """
    cutoff = timezone.now() - timedelta(seconds=settings.M2_STUCK_CASCADE_SECONDS)
    rows = RateCardBooking.objects.filter(
        status__in=RateCardBooking.DISPATCHABLE_STATUSES,
        created_at__lt=cutoff,
    )
    return StuckWork(
        kind="m2_cascade_stalled",
        count=rows.count(),
        oldest_age_seconds=_age_seconds(
            rows.order_by("created_at").values_list("created_at", flat=True).first()
        ),
    )


def _purchases_pending() -> StuckWork:
    """Unlocks, plans and booking fees left `PENDING` by a callback that never arrived.

    All three products in one count on purpose. The state is identical in each — the Customer
    believes they have paid and the entitlement was never granted — and an operator woken at
    2 a.m. needs "eleven purchases are stranded", not three counters to add up.
    """
    cutoff = timezone.now() - timedelta(seconds=settings.M2_STUCK_PAYMENT_SECONDS)
    unlocks = QuoteUnlock.objects.filter(status=QuoteUnlock.Status.PENDING, created_at__lt=cutoff)
    plans = VisitPlan.objects.filter(status=VisitPlan.Status.PENDING, created_at__lt=cutoff)
    fees = BookingFee.objects.filter(status=BookingFee.Status.PENDING, created_at__lt=cutoff)
    ages = [
        age
        for age in (
            _age_seconds(
                unlocks.order_by("created_at").values_list("created_at", flat=True).first()
            ),
            _age_seconds(plans.order_by("created_at").values_list("created_at", flat=True).first()),
            _age_seconds(fees.order_by("created_at").values_list("created_at", flat=True).first()),
        )
        if age is not None
    ]
    return StuckWork(
        kind="m2_purchase_pending",
        count=unlocks.count() + plans.count() + fees.count(),
        # The **largest** age, because `oldest_age_seconds` means "how long has the worst one been
        # waiting". Taking the minimum here would report the youngest of the three products and
        # make a two-day-old stranded unlock look like a fresh one.
        oldest_age_seconds=max(ages, default=None),
    )


def _notifications_failed() -> StuckWork:
    """Messages whose delivery budget is spent. A deadline nobody was told about.

    On this platform a notification is not decoration: `M2-BE-807`'s escalation ladder is what stops
    a vendor losing an offer to silence, so a failed intent on an M2 purpose is a party who was not
    warned before a clock ran out on them.
    """
    cutoff = timezone.now() - timedelta(seconds=settings.M2_STUCK_NOTIFICATION_SECONDS)
    rows = NotificationIntent.objects.filter(
        Q(purpose__startswith="m2_") | Q(purpose__startswith="m2."),
        status=NotificationIntent.Status.FAILED,
        created_at__lt=cutoff,
    )
    return StuckWork(
        kind="m2_notification_failed",
        count=rows.count(),
        oldest_age_seconds=_age_seconds(
            rows.order_by("created_at").values_list("created_at", flat=True).first()
        ),
    )


def stuck_async_work() -> list[StuckWork]:
    """Every class of stalled asynchronous work, counted. Reads only."""
    return [
        _outbox_dead_lettered(),
        _outbox_overdue(),
        _payments_unresolved(),
        _refunds_unsettled(),
        _cascades_stalled(),
        _purchases_pending(),
        _notifications_failed(),
    ]


def report_stuck_async_work() -> dict[str, int]:
    """Emit one counter per class and answer the counts. The scheduled entry point.

    A zero is emitted as well as a non-zero, deliberately. An alert written on the *absence* of a
    metric fires when the sweep itself stops running, which is the failure most likely to hide all
    the others — and a series that only appears when something is wrong cannot be graphed.
    """
    found = stuck_async_work()
    for item in found:
        emit(
            M2Metric.ASYNC_WORK_STUCK,
            value=item.count,
            kind=item.kind,
            oldest_age_seconds=item.oldest_age_seconds,
        )
    return {item.kind: item.count for item in found}
