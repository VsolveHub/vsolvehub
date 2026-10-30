"""The Jobs "Money" tab: posters' subscription plans and premium upgrades on single jobs."""

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
from apps.listings.models import Listing, VendorSubscription, VendorSubscriptionPlan

MODEL = (
    "Employers pay for a subscription plan to post jobs, and can pay once to make one job premium."
)
ACTIVE = (VendorSubscription.Status.ACTIVE,)


def _paid_premiums(period: Period) -> models.QuerySet[Listing]:
    return Listing.objects.filter(period.filter("payment_attempt__captured_at")).annotate(
        refunded=refunded_paise("payment_attempt")
    )


def listing_money_summary(period: Period) -> dict[str, Any]:
    plans = plan_rows(
        VendorSubscriptionPlan.objects.order_by("price_paise", "id"),
        VendorSubscription.objects.all(),
        period,
        partner_field="poster",
        active_statuses=ACTIVE,
    )
    subscription_revenue = sum(row["revenue_paise"] for row in plans)
    premiums = [
        (int(job.payment_attempt.amount_paise), annotated(job, "refunded"))
        for job in _paid_premiums(period).select_related("payment_attempt")
        if job.payment_attempt is not None
    ]
    premium_revenue = sum(amount - refunded for amount, refunded in premiums)
    now = timezone.now()
    active_posters = (
        VendorSubscription.objects.filter(status__in=ACTIVE)
        .filter(models.Q(ends_at__isnull=True) | models.Q(ends_at__gt=now))
        .values("poster")
        .distinct()
        .count()
    )

    jobs = Listing.objects.all()
    moderation = Listing.ModerationStatus
    listing_counts = counts(
        [
            ("total", "All jobs", jobs.count()),
            (
                "live",
                "Live",
                jobs.filter(
                    moderation_status=moderation.APPROVED, status=Listing.Status.PUBLISHED
                ).count(),
            ),
            (
                "pending",
                "Pending review",
                jobs.filter(moderation_status=moderation.PENDING).count(),
            ),
            (
                "closed",
                "Closed or expired",
                jobs.filter(status__in=(Listing.Status.CLOSED, Listing.Status.EXPIRED)).count(),
            ),
            (
                "removed",
                "Removed",
                jobs.filter(
                    models.Q(moderation_status=moderation.REMOVED)
                    | models.Q(status=Listing.Status.REMOVED)
                ).count(),
            ),
        ]
    )
    return summary(
        period,
        model=MODEL,
        totals=[
            total(
                "revenue",
                "Total revenue",
                "money",
                subscription_revenue + premium_revenue,
                "Plans and premium upgrades, net of refunds.",
            ),
            total("subscription_revenue", "Subscription revenue", "money", subscription_revenue),
            total(
                "premium_revenue",
                "Premium upgrade revenue",
                "money",
                premium_revenue,
                f"{len(premiums)} premium upgrades.",
            ),
            total("purchases", "Plans bought", "count", sum(row["purchases"] for row in plans)),
            total("active", "Employers on a plan now", "count", active_posters),
        ],
        plans=plans,
        listing_counts=listing_counts,
    )


def listing_money_payments(period: Period, *, limit: int, offset: int) -> list[dict[str, Any]]:
    """Plan purchases and premium upgrades in the period, newest first.

    Two sources, merged: each is read only as far as this page reaches, so a deep page costs
    `offset + limit` rows from each, never the whole history.
    """
    reach = offset + limit
    subscriptions = (
        VendorSubscription.objects.filter(period.filter("payment_attempt__captured_at"))
        .annotate(refunded=refunded_paise("payment_attempt"))
        .select_related("poster__user", "plan", "payment_attempt")
        .order_by("-payment_attempt__captured_at", "-id")[:reach]
    )
    premiums = (
        _paid_premiums(period)
        .select_related("poster__user", "payment_attempt")
        .order_by("-payment_attempt__captured_at", "-id")[:reach]
    )
    rows: list[dict[str, Any]] = []
    for sub in subscriptions:
        attempt = sub.payment_attempt
        if attempt is None:
            continue
        rows.append(
            _row(sub.id, attempt, sub.poster, sub.plan.name, annotated(sub, "refunded"), sub.status)
        )
    for job in premiums:
        attempt = job.payment_attempt
        if attempt is None:
            continue
        rows.append(
            _row(
                job.id,
                attempt,
                job.poster,
                f"Premium upgrade: {job.title}",
                annotated(job, "refunded"),
                "PAID",
            )
        )
    rows.sort(key=lambda row: (row["paid_at"], str(row["id"])), reverse=True)
    return rows[offset:reach]


def _row(  # noqa: PLR0917 - one flat row of six values
    row_id: Any, attempt: Any, partner: Any, item: str, refunded: int, status: str
) -> dict[str, Any]:
    return {
        "id": row_id,
        "paid_at": attempt.captured_at,
        "payer_name": partner.display_name,
        "payer_phone": partner.user.phone_number,
        "item": item,
        "amount_paise": attempt.amount_paise,
        "refunded_paise": refunded,
        "platform_paise": attempt.amount_paise - refunded,
        "status": status,
    }


#: `GET /ops/listings/money` and `GET /ops/listings/money/payments`.
MoneySummaryView, MoneyPaymentsView = money_views(
    name="Listing",
    build_summary=listing_money_summary,
    build_payments=listing_money_payments,
)
