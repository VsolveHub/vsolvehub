"""The Rentals "Money" tab: the platform fee on each paid booking.

The customer pays rent, platform fee, deposit and any transport in one payment. Only the
platform fee (and a transport fee, 0 today) is the platform's: rent and transport are the
owner's, and the deposit goes back. So refunds are not subtracted from the fee, because a
returned deposit is a refund too. A booking cancelled after payment earns nothing.
"""

from typing import Any

from django.db import models
from django.db.models.functions import Coalesce

from apps.commerce.ops_money import (
    Period,
    annotated,
    counts,
    money_views,
    refunded_paise,
    summary,
    total,
)
from apps.rental.models import RentalAsset, RentalBooking
from apps.rental.services import current_platform_fee_percent

MODEL = "Each booking pays a platform fee on top of the rent. Deposits are refundable."
PAID_AT = "deposit__payment_attempt__captured_at"


def _paid_bookings(period: Period) -> models.QuerySet[RentalBooking]:
    """Bookings whose one payment was captured in the period, not cancelled since."""
    return (
        RentalBooking.objects.filter(period.filter(PAID_AT))
        .exclude(status=RentalBooking.Status.CANCELLED)
        .annotate(
            platform=models.F("platform_fee_paise") + models.F("transport_fee_paise"),
            owner_share=models.F("price_paise")
            + models.F("transport_paise")
            - models.F("transport_fee_paise"),
        )
    )


def rental_money_summary(period: Period) -> dict[str, Any]:
    paid = _paid_bookings(period).aggregate(
        n=models.Count("id"),
        platform_total=Coalesce(models.Sum("platform"), 0),
        owners_total=Coalesce(models.Sum("owner_share"), 0),
    )
    percent = current_platform_fee_percent()
    assets = RentalAsset.objects.all()
    moderation = RentalAsset.ModerationStatus
    listing_counts = counts(
        [
            ("total", "All items", assets.count()),
            (
                "live",
                "Live",
                assets.filter(
                    moderation_status=moderation.APPROVED,
                    current_status=RentalAsset.Status.ACTIVE,
                ).count(),
            ),
            (
                "pending",
                "Pending decision",
                assets.filter(moderation_status=moderation.PENDING).count(),
            ),
            ("paused", "Paused", assets.filter(moderation_status=moderation.PAUSED).count()),
            ("removed", "Taken down", assets.filter(moderation_status=moderation.REMOVED).count()),
        ]
    )
    return summary(
        period,
        model=MODEL,
        totals=[
            total(
                "revenue",
                "Platform fee earned",
                "money",
                paid["platform_total"],
                "From paid bookings.",
            ),
            total("bookings", "Paid bookings", "count", paid["n"], "Cancelled ones excluded."),
            total(
                "owner_share",
                "Rent collected for owners",
                "money",
                paid["owners_total"],
                "Rent and transport. The owners' money, not platform revenue.",
            ),
            total("fee_percent", "Platform fee now", "percent", percent, "Set in Fee setting."),
        ],
        listing_counts=listing_counts,
    )


def rental_money_payments(period: Period, *, limit: int, offset: int) -> list[dict[str, Any]]:
    """Paid bookings in the period, newest first: who paid, for what, and the platform's share."""
    rows = (
        _paid_bookings(period)
        .annotate(refunded=refunded_paise("deposit__payment_attempt"))
        .select_related("customer", "asset", "deposit__payment_attempt")
        .order_by(f"-{PAID_AT}", "-id")[offset : offset + limit]
    )
    result = []
    for booking in rows:
        attempt = booking.deposit.payment_attempt
        if attempt is None:
            continue
        customer = booking.customer
        result.append(
            {
                "id": booking.id,
                "paid_at": attempt.captured_at,
                "payer_name": (customer.full_name or "").strip(),
                "payer_phone": customer.phone_number,
                "item": booking.asset.title,
                "amount_paise": attempt.amount_paise,
                # Shown for the record (usually the returned deposit); not taken off the fee.
                "refunded_paise": annotated(booking, "refunded"),
                "platform_paise": annotated(booking, "platform"),
                "status": booking.status,
            }
        )
    return result


#: `GET /ops/rentals/money` and `GET /ops/rentals/money/payments`.
MoneySummaryView, MoneyPaymentsView = money_views(
    name="Rental",
    build_summary=rental_money_summary,
    build_payments=rental_money_payments,
)
