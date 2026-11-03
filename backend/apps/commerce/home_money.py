"""The Home services "Money" tab: fixed-price visits and their approved scope changes.

The customer pays the whole visit price up front. The partner's share becomes an earning when the
visit completes, and the platform keeps the commission on it. So the tab reports what was
collected (net of refunds) by capture time, and the commission and partner earnings by the time
each earning was written. Nothing here reads another service's money.
"""

from typing import Any

from django.db import models
from django.db.models.functions import Coalesce

from apps.carts.models import FulfilmentUnitLine, QuoteLine
from apps.commerce.models import Booking, PaymentAttempt, Refund
from apps.commerce.ops_money import (
    Period,
    annotated,
    counts,
    money_views,
    refunded_paise,
    summary,
    total,
)
from apps.payouts.models import PartnerLedgerEntry

MODEL = (
    "Customers pay the visit price up front. The platform keeps a commission when the visit "
    "is completed; the rest is the partner's earning."
)
#: The visit itself and an approved scope change on it. Nothing else is a home-service charge.
PURPOSES = (
    PaymentAttempt.Purpose.BOOKING_GROUP,
    PaymentAttempt.Purpose.SCOPE_AMENDMENT_REVISION,
)


def _paid_attempts(period: Period) -> models.QuerySet[PaymentAttempt]:
    return PaymentAttempt.objects.filter(purpose__in=PURPOSES).filter(period.filter("captured_at"))


def _earnings(period: Period) -> models.QuerySet[PartnerLedgerEntry]:
    entries = PartnerLedgerEntry.objects.filter(
        kind=PartnerLedgerEntry.Kind.EARNING, booking__isnull=False
    )
    if period.start is not None:
        entries = entries.filter(created_at__gte=period.start)
    if period.end is not None:
        entries = entries.filter(created_at__lt=period.end)
    return entries


def home_money_summary(period: Period) -> dict[str, Any]:
    attempts = _paid_attempts(period)
    paid = attempts.aggregate(
        n=models.Count("id"),
        collected=Coalesce(models.Sum("amount_paise"), 0),
    )
    paid["refunded_total"] = Refund.objects.filter(
        payment_attempt__in=attempts, status=Refund.Status.SUCCEEDED
    ).aggregate(t=Coalesce(models.Sum("amount_paise"), 0))["t"]
    earned = _earnings(period).aggregate(
        commission=Coalesce(models.Sum("commission_paise"), 0),
        partners=Coalesce(models.Sum("net_paise"), 0),
    )
    bookings = Booking.objects.all()
    status = Booking.Status
    visit_counts = counts(
        [
            ("total", "All visits", bookings.count()),
            (
                "upcoming",
                "Upcoming",
                bookings.filter(status__in=(status.CONFIRMED, status.EN_ROUTE)).count(),
            ),
            (
                "in_progress",
                "In progress",
                bookings.filter(
                    status__in=(status.ARRIVED, status.IN_PROGRESS, status.COMPLETION_SUBMITTED)
                ).count(),
            ),
            (
                "needs_help",
                "Disputed or needs a new partner",
                bookings.filter(status__in=(status.DISPUTED, status.RECOVERY_REQUIRED)).count(),
            ),
            (
                "completed",
                "Completed",
                bookings.filter(status__in=(status.COMPLETED, status.PARTIALLY_COMPLETED)).count(),
            ),
            (
                "cancelled",
                "Cancelled",
                bookings.filter(status__in=(status.CANCELLED, status.ABORTED)).count(),
            ),
        ]
    )
    collected = int(paid["collected"]) - int(paid["refunded_total"])
    return summary(
        period,
        model=MODEL,
        totals=[
            total(
                "collected",
                "Collected from customers",
                "money",
                collected,
                "Captured payments, less refunds.",
            ),
            total("payments", "Paid bookings", "count", paid["n"], "Including scope changes."),
            total(
                "refunded",
                "Refunded",
                "money",
                paid["refunded_total"],
                "On payments in this period.",
            ),
            total(
                "revenue",
                "Commission earned",
                "money",
                earned["commission"],
                "On visits completed in this period.",
            ),
            total(
                "partner_share",
                "Partner earnings",
                "money",
                earned["partners"],
                "The partners' money, not platform revenue.",
            ),
        ],
        listing_counts=visit_counts,
    )


def _commission_by_group(group_ids: list[Any]) -> dict[Any, int]:
    rows = (
        PartnerLedgerEntry.objects.filter(
            kind=PartnerLedgerEntry.Kind.EARNING,
            booking__fulfilment_unit__booking_group_id__in=group_ids,
        )
        .order_by()
        .values("booking__fulfilment_unit__booking_group_id")
        .annotate(total=models.Sum("commission_paise"))
    )
    return {
        row["booking__fulfilment_unit__booking_group_id"]: int(row["total"] or 0) for row in rows
    }


def _services_by_group(group_ids: list[Any]) -> dict[Any, list[str]]:
    labels: dict[Any, list[str]] = {}
    lines = (
        FulfilmentUnitLine.objects.filter(
            unit__booking_group_id__in=group_ids, kind=QuoteLine.Kind.SERVICE
        )
        .order_by("unit__position", "position")
        .values_list("unit__booking_group_id", "label")
    )
    for group_id, label in lines:
        labels.setdefault(group_id, []).append(label)
    return labels


def home_money_payments(period: Period, *, limit: int, offset: int) -> list[dict[str, Any]]:
    """Captured home-service payments in the period, newest first."""
    attempts = list(
        _paid_attempts(period)
        .annotate(refunded=refunded_paise("pk"))
        .select_related("checkout__customer", "booking_group__customer")
        .order_by("-captured_at", "-id")[offset : offset + limit]
    )
    group_ids = [attempt.booking_group_id for attempt in attempts if attempt.booking_group_id]
    commission = _commission_by_group(group_ids)
    services = _services_by_group(group_ids)
    result = []
    for attempt in attempts:
        group = attempt.booking_group
        customer = (
            attempt.checkout.customer
            if attempt.checkout is not None
            else (group.customer if group is not None else None)
        )
        item = ", ".join(services.get(attempt.booking_group_id, [])) or "Home service visit"
        if attempt.purpose == PaymentAttempt.Purpose.SCOPE_AMENDMENT_REVISION:
            item = f"Scope change: {item}"
        result.append(
            {
                "id": attempt.id,
                "paid_at": attempt.captured_at,
                "payer_name": (customer.full_name or "").strip() if customer else "",
                "payer_phone": customer.phone_number if customer else "",
                "item": item,
                "amount_paise": attempt.amount_paise,
                "refunded_paise": annotated(attempt, "refunded"),
                "platform_paise": commission.get(attempt.booking_group_id, 0),
                "status": attempt.status,
            }
        )
    return result


#: `GET /ops/home-services/money` and `GET /ops/home-services/money/payments`.
MoneySummaryView, MoneyPaymentsView = money_views(
    name="HomeServices",
    build_summary=home_money_summary,
    build_payments=home_money_payments,
)
