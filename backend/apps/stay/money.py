"""The Stays "Money" tab: host subscription plans, and guest payments kept apart.

Stays earn from hosts' subscription plans. A guest's reservation payment is the host's money
(the stay itself), so it is shown on its own line and never counted as platform revenue.
"""

from typing import Any

from django.db import models
from django.utils import timezone

from apps.commerce.ops_money import (
    Period,
    annotated,
    counts,
    money_views,
    plan_rows,
    refunded_paise,
    summary,
    total,
)
from apps.stay.models import Property, StayReservation, StaySubscription, StaySubscriptionPlan

MODEL = "Hosts pay for a subscription plan to list their properties."
ACTIVE = (StaySubscription.Status.ACTIVE, StaySubscription.Status.GRACE)


def _paid_subscriptions(period: Period) -> models.QuerySet[StaySubscription]:
    return StaySubscription.objects.filter(period.filter("payment_attempt__captured_at")).annotate(
        refunded=refunded_paise("payment_attempt")
    )


def stay_money_summary(period: Period) -> dict[str, Any]:
    plans = plan_rows(
        StaySubscriptionPlan.objects.order_by("price_paise", "id"),
        StaySubscription.objects.all(),
        period,
        partner_field="host",
        active_statuses=ACTIVE,
    )
    revenue = sum(row["revenue_paise"] for row in plans)
    purchases = sum(row["purchases"] for row in plans)
    now = timezone.now()
    active_hosts = (
        StaySubscription.objects.filter(status__in=ACTIVE)
        .filter(models.Q(ends_at__isnull=True) | models.Q(ends_at__gt=now))
        .values("host")
        .distinct()
        .count()
    )
    guest = StayReservation.objects.filter(period.filter("payment_attempt__captured_at")).aggregate(
        n=models.Count("id"), paise=models.Sum("total_paise")
    )

    props = Property.objects.all()
    status = Property.ModerationStatus
    listing_counts = counts(
        [
            ("total", "All properties", props.count()),
            (
                "live",
                "Live",
                props.filter(
                    moderation_status=status.APPROVED, listing_status=Property.ListingStatus.LIVE
                ).count(),
            ),
            ("pending", "Pending approval", props.filter(moderation_status=status.PENDING).count()),
            (
                "paused",
                "Paused by host",
                props.filter(
                    moderation_status=status.APPROVED, listing_status=Property.ListingStatus.PAUSED
                ).count(),
            ),
            ("removed", "Turned off", props.filter(moderation_status=status.REMOVED).count()),
        ]
    )
    return summary(
        period,
        model=MODEL,
        totals=[
            total("revenue", "Subscription revenue", "money", revenue, "Net of refunds."),
            total("purchases", "Plans bought", "count", purchases),
            total("active", "Hosts on a plan now", "count", active_hosts),
            total(
                "guest_payments",
                "Guest reservation payments",
                "money",
                guest["paise"] or 0,
                f"{guest['n']} paid reservations. The host's money, not platform revenue.",
            ),
        ],
        plans=plans,
        listing_counts=listing_counts,
    )


def stay_money_payments(period: Period, *, limit: int, offset: int) -> list[dict[str, Any]]:
    """Who paid for a host plan in the period, newest first."""
    rows = (
        _paid_subscriptions(period)
        .select_related("host__user", "plan", "payment_attempt")
        .order_by("-payment_attempt__captured_at", "-id")[offset : offset + limit]
    )
    return [
        {
            "id": sub.id,
            "paid_at": sub.payment_attempt.captured_at,
            "payer_name": sub.host.display_name,
            "payer_phone": sub.host.user.phone_number,
            "item": sub.plan.name,
            "amount_paise": sub.payment_attempt.amount_paise,
            "refunded_paise": annotated(sub, "refunded"),
            "platform_paise": sub.payment_attempt.amount_paise - annotated(sub, "refunded"),
            "status": sub.status,
        }
        for sub in rows
        if sub.payment_attempt is not None
    ]


#: `GET /ops/stays/money` and `GET /ops/stays/money/payments`.
MoneySummaryView, MoneyPaymentsView = money_views(
    name="Stay",
    build_summary=stay_money_summary,
    build_payments=stay_money_payments,
)
