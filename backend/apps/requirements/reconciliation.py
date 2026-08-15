"""Chargebacks, and the scheduled proof that every M2 rupee is where the record says it is.

`M2-BE-707`, `708` and `710`.

`M2-AC-712` is the sentence this file exists to make checkable: "booking fee (and its forfeit
split), unlock fee, visit-plan fee (and its per-slot shares), site-visit fee, stage funding,
material advance, refund, commission and payout reconcile **independently**". Independently is the
load-bearing word — a single grand total that balances can hide two errors that cancel — so every
check below is per product, per row, in integer paise, and a mismatch names the row.

**Nothing here moves money.** A reconciliation job that could correct what it found would be a job
that quietly rewrote history when its own arithmetic was wrong, and the first sign of trouble would
be a ledger that always balanced. It opens a `FinancialException` and alerts; a person decides.

**Nothing here reverses a payout either.** `M2-AC-711` — a chargeback after payout — freezes what
is still freezable and reports the rest. The money that has left is gone, and the honest record of
that is an open exception, not a status flip that makes the ledger disagree with the bank.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Q, QuerySet, Sum
from django.utils import timezone

from apps.cases.models import OperationsCase
from apps.commerce.models import FinancialException, PaymentAttempt, Refund
from apps.commerce.services import PAYMENT_FINAL_STATES
from apps.identity.models import User
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.requirements import disputes, pricing
from apps.requirements.exceptions import (
    PolicyUnavailableError,
    RequirementNotFoundError,
    RequirementTransitionError,
)
from apps.requirements.models import (
    BookingFee,
    CustomerRequirement,
    Engagement,
    QuoteUnlock,
    VisitPlan,
    VisitPlanShare,
)

#: The three M2 fee purposes a chargeback can land on. `M2-BE-708` names exactly these — the
#: booking, unlock or visit-plan fee **itself**, as distinct from a chargeback on an A1 cart
#: payment, which the M1 dispute path already owns.
M2_FEE_PURPOSES = (
    PaymentAttempt.Purpose.M2_BOOKING_FEE,
    PaymentAttempt.Purpose.M2_QUOTE_UNLOCK,
    PaymentAttempt.Purpose.M2_VISIT_PLAN,
)


@dataclass(frozen=True, slots=True)
class Mismatch:
    """One row whose two records of the same fact disagree."""

    product: str
    record_id: uuid.UUID
    requirement_id: uuid.UUID | None
    code: str
    detail: dict[str, Any]


# ---------------------------------------------------------------------------
# `M2-BE-708`: a chargeback on the fee itself
# ---------------------------------------------------------------------------


def _requirement_for_attempt(attempt: PaymentAttempt) -> CustomerRequirement | None:
    """Which request a checkout-free M2 charge belongs to.

    Three lookups rather than a `purpose` switch with a shared column, because the three products
    genuinely hang off three different tables and a denormalised `requirement_id` on
    `PaymentAttempt` would be a fourth copy of a fact that already exists three times.
    """
    fee = BookingFee.objects.filter(payment_attempt=attempt).select_related("requirement").first()
    if fee is not None:
        return fee.requirement
    unlock = (
        QuoteUnlock.objects.filter(payment_attempt=attempt).select_related("requirement").first()
    )
    if unlock is not None:
        return unlock.requirement
    plan = VisitPlan.objects.filter(payment_attempt=attempt).select_related("requirement").first()
    if plan is not None:
        return plan.requirement
    return None


@transaction.atomic
def record_fee_chargeback(
    *,
    payment_attempt_id: uuid.UUID,
    amount_paise: int,
    provider_reference: str,
    reason_code: str,
    actor: User | None = None,
) -> OperationsCase:
    """The Customer's bank pulled back a platform fee. Open the standard dispute path.

    Idempotent on the payment attempt: a provider that reports one chargeback twice reaches one
    case and one exception. The case is `CHARGEBACK`, which holds payout — so a visit share or a
    travel compensation funded by the charge being reversed stops being payable the moment this
    runs, which is `M2-AC-711`'s "freezes unsafe settlement".

    The fee row itself is **not** moved. A chargeback is a claim in progress, not a settlement: an
    `EARNED` booking fee whose charge is disputed is still earned until somebody decides, and
    marking it refunded here would tell the vendor and the Customer that a decision had been taken
    that has not been.
    """
    attempt = PaymentAttempt.objects.select_for_update().get(pk=payment_attempt_id)
    if attempt.purpose not in M2_FEE_PURPOSES:
        raise RequirementTransitionError(
            "That payment is not a booking, unlock or visit-plan fee.",
        )
    requirement = _requirement_for_attempt(attempt)
    if requirement is None:
        raise RequirementNotFoundError()

    FinancialException.objects.get_or_create(
        kind=FinancialException.Kind.CHARGEBACK,
        payment_attempt=attempt,
        defaults={
            "code": f"m2_chargeback_{reason_code}"[:80],
            "context": {
                "purpose": attempt.purpose,
                "amount_paise": amount_paise,
                "attempt_amount_paise": attempt.amount_paise,
                "provider_reference": provider_reference,
                "requirement_id": str(requirement.id),
            },
        },
    )
    engagement = Engagement.objects.filter(requirement=requirement).first()
    case = disputes.open_linked_case(
        kind=OperationsCase.Kind.CHARGEBACK,
        summary=f"Chargeback on {attempt.purpose} of {amount_paise} paise",
        source_kind="payment_attempt_chargeback",
        source_id=attempt.id,
        requirement=requirement,
        engagement=engagement,
        severity=OperationsCase.Severity.URGENT,
        detail=f"provider reference {provider_reference}; reason {reason_code}",
        opened_by=actor,
    )
    _alert_on_chargeback_rate(requirement=requirement)
    return case


def chargeback_rate_basis_points(*, variant_id: uuid.UUID, since: datetime) -> tuple[int, int]:
    """`(rate in basis points, charges counted)` for one variant's M2 fees.

    Counted over **charges**, not over requests: a request that never paid cannot be charged back,
    and including it would dilute the rate with the very population the alarm is meant to watch.
    """
    charges = PaymentAttempt.objects.filter(
        purpose__in=M2_FEE_PURPOSES,
        status__in=(
            PaymentAttempt.Status.CAPTURED,
            PaymentAttempt.Status.REFUNDED,
            PaymentAttempt.Status.PARTIALLY_REFUNDED,
        ),
        created_at__gte=since,
    )
    charge_ids = set(charges.values_list("id", flat=True))
    if not charge_ids:
        return 0, 0
    # Narrowed to this variant through the three product tables, for the same reason
    # `_requirement_for_attempt` is three lookups.
    variant_attempts = set(
        BookingFee.objects.filter(
            payment_attempt_id__in=charge_ids, requirement__variant_id=variant_id
        ).values_list("payment_attempt_id", flat=True)
    )
    variant_attempts |= set(
        QuoteUnlock.objects.filter(
            payment_attempt_id__in=charge_ids, requirement__variant_id=variant_id
        ).values_list("payment_attempt_id", flat=True)
    )
    variant_attempts |= set(
        VisitPlan.objects.filter(
            payment_attempt_id__in=charge_ids, requirement__variant_id=variant_id
        ).values_list("payment_attempt_id", flat=True)
    )
    if not variant_attempts:
        return 0, 0
    charged_back = FinancialException.objects.filter(
        kind=FinancialException.Kind.CHARGEBACK,
        payment_attempt_id__in=variant_attempts,
    ).count()
    return charged_back * 10000 // len(variant_attempts), len(variant_attempts)


def _alert_on_chargeback_rate(*, requirement: CustomerRequirement) -> None:
    """Page Operations when the rate crosses the configured threshold. Silent while unset.

    Keyed per variant per day, so a bad afternoon pages once rather than once per chargeback —
    the shape `sweep_rate_card_decline_alarm` already established, and for the same reason: an
    alarm that repeats is an alarm that gets muted.
    """
    try:
        alarm = pricing.chargeback_alarm(requirement)
    except PolicyUnavailableError:
        return
    if alarm is None:
        return
    since = timezone.now() - timedelta(days=30)
    rate, charges = chargeback_rate_basis_points(variant_id=requirement.variant_id, since=since)
    if charges < alarm.min_charges or rate < alarm.basis_points:
        return
    today = timezone.localdate().isoformat()
    for recipient_id in operations_recipient_ids():
        request_notification(
            recipient_id=recipient_id,
            purpose="m2_chargeback_rate_alarm",
            channel=NotificationIntent.Channel.EMAIL,
            template_code="m2_chargeback_rate_alarm",
            context={
                "variant_id": str(requirement.variant_id),
                "rate_basis_points": rate,
                "charges": charges,
                "threshold_basis_points": alarm.basis_points,
                "window_days": 30,
            },
            idempotency_key=(
                f"m2-chargeback-alarm:{requirement.variant_id}:{recipient_id}:{today}"
            ),
        )


def operations_recipient_ids() -> list[uuid.UUID]:
    """Everybody who holds the Operations role. The same lookup the decline alarm uses."""
    return list(
        User.objects.filter(
            userrole__role__code="operations",
            userrole__revoked_at__isnull=True,
            is_active=True,
        )
        .distinct()
        .values_list("id", flat=True)
    )


# ---------------------------------------------------------------------------
# `M2-BE-707`: refund states a provider can actually produce
# ---------------------------------------------------------------------------


def refunds_awaiting_provider(*, older_than: datetime | None = None) -> list[uuid.UUID]:
    """M2 refunds the provider has not settled yet.

    `REQUESTED` and `PROCESSING` both mean "asked for, not confirmed", and both are legitimate for
    minutes and suspicious for hours. `commerce.reconcile_refunds` re-drives them; this selector
    exists so the Operations queue can show the same rows a sweep is working on, which is what
    stops a support agent from asking the provider about a refund the platform is already chasing.
    """
    cutoff = older_than or (timezone.now() - timedelta(hours=6))
    return list(
        Refund.objects.filter(
            payment_attempt__purpose__in=M2_FEE_PURPOSES,
            status__in=(Refund.Status.REQUESTED, Refund.Status.PROCESSING),
            created_at__lt=cutoff,
        ).values_list("id", flat=True)
    )


def failed_m2_refund_ids() -> list[uuid.UUID]:
    """Refunds the provider explicitly refused. Never presented as complete (`M2-AC-709`)."""
    return list(
        Refund.objects.filter(
            payment_attempt__purpose__in=M2_FEE_PURPOSES,
            status__in=(Refund.Status.FAILED, Refund.Status.UNDER_REVIEW),
        ).values_list("id", flat=True)
    )


def _succeeded_refund_paise(attempt_id: uuid.UUID | None) -> int:
    if attempt_id is None:
        return 0
    return int(
        Refund.objects.filter(
            payment_attempt_id=attempt_id, status=Refund.Status.SUCCEEDED
        ).aggregate(total=Sum("amount_paise"))["total"]
        or 0
    )


# ---------------------------------------------------------------------------
# `M2-BE-710`: the scheduled reconciliation
#
# ## The cursor (Wave C7)
#
# Until this wave the sweep read **every settled row of every product on every tick**, hourly,
# forever. That is correct and it does not scale: the work grows with the lifetime size of the books
# rather than with what has changed, so the hour the platform cannot afford to re-read its whole
# history is the hour this sweep stops running — and a reconciliation that has quietly stopped is
# indistinguishable from books that balance.
#
# So each product now walks forward in bounded pages and **wraps**. A keyset cursor on
# `(created_at, id)` is stored per product; a page shorter than the batch means the product is
# exhausted and its cursor resets to the beginning. Over a few ticks the whole book is still read;
# in any one tick a bounded amount is.
#
# Two properties make this safe to do to a money check:
#
# * **It reads only.** A mismatch it has not reached yet is a mismatch reported an hour later, not
#   one that is missed — and `reconcile_m2_money` already deduplicates by `(record, code)`, so a row
#   seen on every wrap produces one open exception, not one per lap.
# * **The cursor lives in the cache, and losing it is harmless.** A cache flush restarts every
#   product at the beginning, which re-reads rows that were already checked and finds the same
#   answers. There is deliberately no cursor *table*: a durable watermark on a reporting job is a
#   migration, a row somebody can edit, and a new way for the sweep to skip work permanently.
# ---------------------------------------------------------------------------

#: Cache key prefix for the per-product keyset cursor. Versioned in the name so a change to the
#: cursor's shape cannot be misread as a valid cursor of the old shape.
_CURSOR_KEY = "m2:reconciliation:cursor:v1:{product}"

#: How long a cursor survives idle. Generous — the sweep runs hourly — and expiry is a wrap, which
#: is the same thing that happens at the end of a pass anyway.
_CURSOR_TTL_SECONDS = 60 * 60 * 24 * 7

#: A stored cursor is `(created_at, id)`. Named so the shape check below is a comparison against a
#: fact rather than against a literal that means nothing to the next reader.
_CURSOR_PARTS = 2


def _read_cursor(product: str) -> tuple[datetime, uuid.UUID] | None:
    try:
        stored = cache.get(_CURSOR_KEY.format(product=product))
    except Exception:
        # A cache outage means "start from the beginning", which is the pre-C7 behaviour and is
        # always correct — only slower. It must never stop the reconciliation from running.
        return None
    if not isinstance(stored, tuple) or len(stored) != _CURSOR_PARTS:
        return None
    moment, record_id = stored
    if not isinstance(moment, datetime) or not isinstance(record_id, uuid.UUID):
        return None
    return moment, record_id


def _write_cursor(product: str, position: tuple[datetime, uuid.UUID] | None) -> None:
    key = _CURSOR_KEY.format(product=product)
    try:
        if position is None:
            cache.delete(key)
        else:
            cache.set(key, position, timeout=_CURSOR_TTL_SECONDS)
    except Exception:
        return


def _page(queryset: QuerySet[Any], *, product: str, batch_size: int) -> list[Any]:
    """One bounded page of a product, ordered by `(created_at, id)`, advancing its cursor.

    Answers the rows; the caller checks them. The cursor is advanced to the last row of the page,
    or cleared when the page is short — a short page is the end of the book, and clearing is how the
    next tick starts the lap again.
    """
    ordered = queryset.order_by("created_at", "id")
    position = _read_cursor(product)
    if position is not None:
        moment, record_id = position
        ordered = ordered.filter(Q(created_at__gt=moment) | Q(created_at=moment, id__gt=record_id))
    rows = list(ordered[:batch_size])
    if len(rows) < batch_size:
        _write_cursor(product, None)
    else:
        last = rows[-1]
        _write_cursor(product, (last.created_at, last.id))
    return rows


def _booking_fee_mismatches(fees: list[Any] | None = None) -> list[Mismatch]:
    """A3 booking fees, per row, in paise."""
    found: list[Mismatch] = []
    rows = (
        fees
        if fees is not None
        else BookingFee.objects.exclude(
            status__in=(BookingFee.Status.OFFER_ACCEPTED, BookingFee.Status.FAILED)
        ).select_related("payment_attempt")
    )
    for fee in rows:
        attempt = fee.payment_attempt
        if fee.status == BookingFee.Status.WAIVED:
            # A free re-dispatch collected nothing, so a payment attempt on it would be the error.
            if attempt is not None and attempt.status in PAYMENT_FINAL_STATES:
                found.append(
                    Mismatch(
                        product="booking_fee",
                        record_id=fee.id,
                        requirement_id=fee.requirement_id,
                        code="waived_fee_has_a_capture",
                        detail={"payment_attempt_id": str(attempt.id)},
                    )
                )
            continue
        if fee.status in BookingFee.CHARGED_STATUSES and (
            attempt is None or attempt.status not in PAYMENT_FINAL_STATES
        ):
            found.append(
                Mismatch(
                    product="booking_fee",
                    record_id=fee.id,
                    requirement_id=fee.requirement_id,
                    code="charged_fee_without_a_capture",
                    detail={"fee_status": fee.status},
                )
            )
        if fee.status == BookingFee.Status.FORFEIT_SPLIT and (
            fee.travel_compensation_paise + fee.platform_share_paise != fee.amount_paise
        ):
            found.append(
                Mismatch(
                    product="booking_fee",
                    record_id=fee.id,
                    requirement_id=fee.requirement_id,
                    code="forfeit_split_does_not_reconcile",
                    detail={
                        "amount_paise": fee.amount_paise,
                        "travel_compensation_paise": fee.travel_compensation_paise,
                        "platform_share_paise": fee.platform_share_paise,
                    },
                )
            )
        if fee.status == BookingFee.Status.REFUNDED and attempt is not None:
            refunded = _succeeded_refund_paise(attempt.id)
            pending = Refund.objects.filter(
                payment_attempt=attempt,
                status__in=(Refund.Status.REQUESTED, Refund.Status.PROCESSING),
            ).exists()
            if refunded != fee.amount_paise and not pending:
                found.append(
                    Mismatch(
                        product="booking_fee",
                        record_id=fee.id,
                        requirement_id=fee.requirement_id,
                        code="refunded_fee_without_a_settled_refund",
                        detail={
                            "amount_paise": fee.amount_paise,
                            "refunded_paise": refunded,
                        },
                    )
                )
    return found


def _unlock_mismatches(unlocks: list[Any] | None = None) -> list[Mismatch]:
    found: list[Mismatch] = []
    rows = (
        unlocks
        if unlocks is not None
        else QuoteUnlock.objects.filter(
            status__in=(
                QuoteUnlock.Status.ACTIVE,
                QuoteUnlock.Status.CONSUMED,
                QuoteUnlock.Status.REFUNDED,
            )
        ).select_related("payment_attempt")
    )
    for unlock in rows:
        attempt = unlock.payment_attempt
        if attempt is None or attempt.status not in PAYMENT_FINAL_STATES:
            found.append(
                Mismatch(
                    product="quote_unlock",
                    record_id=unlock.id,
                    requirement_id=unlock.requirement_id,
                    code="unlock_without_a_capture",
                    detail={"status": unlock.status},
                )
            )
            continue
        if unlock.status == QuoteUnlock.Status.REFUNDED:
            refunded = _succeeded_refund_paise(attempt.id)
            pending = Refund.objects.filter(
                payment_attempt=attempt,
                status__in=(Refund.Status.REQUESTED, Refund.Status.PROCESSING),
            ).exists()
            if refunded != unlock.price_paise and not pending:
                found.append(
                    Mismatch(
                        product="quote_unlock",
                        record_id=unlock.id,
                        requirement_id=unlock.requirement_id,
                        code="refunded_unlock_without_a_settled_refund",
                        detail={
                            "price_paise": unlock.price_paise,
                            "refunded_paise": refunded,
                        },
                    )
                )
    return found


def _visit_plan_mismatches(plans: list[Any] | None = None) -> list[Mismatch]:
    """§4a's reconciliation, checked: `plan = Σ payouts + Σ platform shares + Σ refunds`."""
    found: list[Mismatch] = []
    rows = (
        plans
        if plans is not None
        else VisitPlan.objects.filter(status__in=VisitPlan.CHARGED_STATUSES)
    )
    for plan in rows:
        shares = list(VisitPlanShare.objects.filter(plan=plan))
        settled = [
            share
            for share in shares
            if share.status in (VisitPlanShare.Status.EARNED, VisitPlanShare.Status.REFUNDED)
        ]
        if len(settled) != len(shares):
            # Still in flight. Not a mismatch — a plan with an open share has not finished.
            continue
        payouts = sum(
            share.vendor_payout_paise
            for share in settled
            if share.status == VisitPlanShare.Status.EARNED
        )
        platform = sum(
            share.platform_share_paise
            for share in settled
            if share.status == VisitPlanShare.Status.EARNED
        )
        refunded = sum(
            share.amount_paise
            for share in settled
            if share.status == VisitPlanShare.Status.REFUNDED
        )
        if payouts + platform + refunded != plan.price_paise:
            found.append(
                Mismatch(
                    product="visit_plan",
                    record_id=plan.id,
                    requirement_id=plan.requirement_id,
                    code="visit_plan_does_not_reconcile",
                    detail={
                        "price_paise": plan.price_paise,
                        "vendor_payouts_paise": payouts,
                        "platform_shares_paise": platform,
                        "refunded_paise": refunded,
                    },
                )
            )
    return found


def _engagement_mismatches(engagements: list[Any] | None = None) -> list[Mismatch]:
    """`M2-BE-504`'s envelope, checked from outside the constraint that enforces it.

    Deliberately redundant with the database check. The constraint fires on a *write*; this fires
    on a row that is already wrong — which is the only kind that reaches production, because the
    ways a maintained column goes wrong are a migration, a data fix and a bug in an `F()`
    expression, and none of those is a write the constraint saw.
    """
    found: list[Mismatch] = []
    rows = (
        engagements
        if engagements is not None
        else Engagement.objects.exclude(status=Engagement.Status.CANCELLED)
    )
    for engagement in rows:
        if (
            engagement.staged_total_paise
            != engagement.total_paise + engagement.amendment_delta_paise
        ):
            found.append(
                Mismatch(
                    product="engagement",
                    record_id=engagement.id,
                    requirement_id=engagement.requirement_id,
                    code="staged_total_does_not_reconcile",
                    detail={
                        "staged_total_paise": engagement.staged_total_paise,
                        "total_paise": engagement.total_paise,
                        "amendment_delta_paise": engagement.amendment_delta_paise,
                    },
                )
            )
        if engagement.refunded_total_paise > engagement.funded_total_paise:
            found.append(
                Mismatch(
                    product="engagement",
                    record_id=engagement.id,
                    requirement_id=engagement.requirement_id,
                    code="refunded_more_than_funded",
                    detail={
                        "funded_total_paise": engagement.funded_total_paise,
                        "refunded_total_paise": engagement.refunded_total_paise,
                    },
                )
            )
    return found


def find_mismatches() -> list[Mismatch]:
    """Every M2 product, independently, in integer paise. **Unbounded — reads the whole book.**

    Kept as the exhaustive read for an operator who needs one now: a release cutover, an incident,
    an audit. The scheduled path is `reconcile_m2_money`, which pages through the same checks.
    """
    return [
        *_booking_fee_mismatches(),
        *_unlock_mismatches(),
        *_visit_plan_mismatches(),
        *_engagement_mismatches(),
    ]


def find_mismatches_page(*, batch_size: int) -> list[Mismatch]:
    """One bounded page of each product, advancing that product's cursor. See the section note.

    Four independent cursors rather than one, because the products have wildly different row
    counts: a single shared cursor would spend most of its laps in whichever table is largest and
    leave the smallest one checked once a day by accident.
    """
    return [
        *_booking_fee_mismatches(
            _page(
                BookingFee.objects.exclude(
                    status__in=(BookingFee.Status.OFFER_ACCEPTED, BookingFee.Status.FAILED)
                ).select_related("payment_attempt"),
                product="booking_fee",
                batch_size=batch_size,
            )
        ),
        *_unlock_mismatches(
            _page(
                QuoteUnlock.objects.filter(
                    status__in=(
                        QuoteUnlock.Status.ACTIVE,
                        QuoteUnlock.Status.CONSUMED,
                        QuoteUnlock.Status.REFUNDED,
                    )
                ).select_related("payment_attempt"),
                product="quote_unlock",
                batch_size=batch_size,
            )
        ),
        *_visit_plan_mismatches(
            _page(
                VisitPlan.objects.filter(status__in=VisitPlan.CHARGED_STATUSES),
                product="visit_plan",
                batch_size=batch_size,
            )
        ),
        *_engagement_mismatches(
            _page(
                Engagement.objects.exclude(status=Engagement.Status.CANCELLED),
                product="engagement",
                batch_size=batch_size,
            )
        ),
    ]


@transaction.atomic
def reconcile_m2_money(*, batch_size: int | None = None) -> int:
    """Check one bounded page of each product and open an exception per mismatch found.

    Returns how many mismatches **this pass** found, which is deliberately not the same number as
    "how many exist" — that is `open_exception_summary`, read from the exceptions themselves. A
    sweep that returned a total would have to read the whole book to compute it, which is the thing
    the cursor exists to stop.

    One `FinancialException` per `(record, code)`, so a mismatch that persists for a week is one row
    somebody is working on rather than a hundred and sixty-eight — and, now that the sweep wraps,
    one row rather than one per lap.
    """
    mismatches = find_mismatches_page(
        batch_size=batch_size or settings.M2_RECONCILIATION_BATCH_SIZE
    )
    for mismatch in mismatches:
        already_open = FinancialException.objects.filter(
            kind=FinancialException.Kind.RECONCILIATION_MISMATCH,
            status=FinancialException.Status.OPEN,
            code=mismatch.code[:80],
            context__record_id=str(mismatch.record_id),
        ).exists()
        if already_open:
            # `get_or_create` cannot express this: `context__record_id` is a lookup, not a field,
            # so it would be passed to `create()` and fail. Explicit filter-then-create instead.
            continue
        FinancialException.objects.create(
            kind=FinancialException.Kind.RECONCILIATION_MISMATCH,
            code=mismatch.code[:80],
            context={
                "product": mismatch.product,
                "record_id": str(mismatch.record_id),
                "requirement_id": (
                    str(mismatch.requirement_id) if mismatch.requirement_id is not None else None
                ),
                **mismatch.detail,
            },
        )
    return len(mismatches)


def open_exception_summary() -> dict[str, Any]:
    """What Finance is currently carrying, for the dashboard `M2-AC-808` requires."""
    rows = (
        FinancialException.objects.filter(status=FinancialException.Status.OPEN)
        .values("kind")
        .annotate(count=Count("id"))
    )
    return {
        "server_now": timezone.now(),
        "open_by_kind": [{"kind": row["kind"], "count": int(row["count"])} for row in rows],
        "refunds_awaiting_provider": len(refunds_awaiting_provider()),
        "failed_refunds": len(failed_m2_refund_ids()),
    }
