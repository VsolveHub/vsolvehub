from datetime import date, datetime, timedelta
from typing import Any

from django.db.models import Count, QuerySet, Sum
from django.db.models.functions import TruncDate, TruncWeek
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.cases.models import OperationsCase
from apps.commerce.models import Booking, PaymentAttempt
from apps.identity.models import User
from apps.listings.models import Listing, VendorSubscription
from apps.loyalty.models import CoinTransaction
from apps.notifications.models import KillSwitch
from apps.partners.models import PartnerApplication
from apps.wallet.models import WalletAccount

#: ``YYYY-MM-DD``, a date with no time part.
ISO_DATE_LENGTH = 10


def _parse_bound(value: object, *, end: bool) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValidationError({"date_end" if end else "date_start": ["Use YYYY-MM-DD."]}) from error
    if end and len(value) == ISO_DATE_LENGTH:
        # A bare date means "through the end of that day", so the bound is the next midnight.
        parsed += timedelta(days=1)
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def get_date_filters(filters: dict) -> tuple[datetime | None, datetime | None]:
    """The selected range as ``[start, end)``; either side may be open."""
    return (
        _parse_bound(filters.get("date_start"), end=False),
        _parse_bound(filters.get("date_end"), end=True),
    )


#: With no range picked, the trend shows the last 30 days.
SERIES_DEFAULT_DAYS = 30
#: Up to this many days a point is one day; beyond it, one week.
SERIES_DAILY_MAX_DAYS = 62
#: A trend never reaches back further than this, so a wide range stays one cheap query.
SERIES_MAX_DAYS = 366


def series_window(start: datetime | None, end: datetime | None) -> tuple[datetime, datetime, str]:
    """The trend's ``[start, end)`` window and its bucket size, ``"day"`` or ``"week"``."""
    stop = end or timezone.localtime().replace(
        hour=0, minute=0, second=0, microsecond=0
    ) + timedelta(days=1)
    begin = start or stop - timedelta(days=SERIES_DEFAULT_DAYS)
    if stop - begin > timedelta(days=SERIES_MAX_DAYS):
        begin = stop - timedelta(days=SERIES_MAX_DAYS)
    granularity = "day" if stop - begin <= timedelta(days=SERIES_DAILY_MAX_DAYS) else "week"
    return begin, stop, granularity


def _bucket_starts(begin: datetime, stop: datetime, granularity: str) -> list[date]:
    first = timezone.localtime(begin).date()
    last = timezone.localtime(stop - timedelta(microseconds=1)).date()
    if granularity == "week":
        first -= timedelta(days=first.weekday())
    step = timedelta(days=7 if granularity == "week" else 1)
    buckets: list[date] = []
    cursor = first
    while cursor <= last:
        buckets.append(cursor)
        cursor += step
    return buckets


def bucketed(
    queryset: QuerySet[Any],
    field: str,
    begin: datetime,
    stop: datetime,
    granularity: str,
    *,
    total: str | None = None,
) -> dict[date, int]:
    """Count (or sum ``total``) per bucket of ``field``. Buckets with nothing are absent."""
    trunc = TruncWeek if granularity == "week" else TruncDate
    rows = (
        queryset.filter(**{f"{field}__gte": begin, f"{field}__lt": stop})
        .annotate(bucket=trunc(field, tzinfo=timezone.get_current_timezone()))
        .values("bucket")
        .annotate(value=Sum(total) if total else Count("id"))
    )
    result: dict[date, int] = {}
    for row in rows:
        key = row["bucket"]
        if isinstance(key, datetime):
            key = key.date()
        result[key] = int(row["value"] or 0)
    return result


def build_series(
    begin: datetime, stop: datetime, granularity: str, **columns: dict[date, int]
) -> list[dict[str, Any]]:
    """One point per bucket, oldest first, zero where nothing happened."""
    return [
        {"date": bucket.isoformat(), **{name: col.get(bucket, 0) for name, col in columns.items()}}
        for bucket in _bucket_starts(begin, stop, granularity)
    ]


def get_business_dashboard(filters: dict) -> dict:
    start, end = get_date_filters(filters)

    b_qs = Booking.objects.filter(status="COMPLETED")
    if start:
        b_qs = b_qs.filter(created_at__gte=start)
    if end:
        b_qs = b_qs.filter(created_at__lt=end)
    completed_bookings = b_qs.count()

    p_qs = PaymentAttempt.objects.filter(status="CAPTURED")
    if start:
        p_qs = p_qs.filter(created_at__gte=start)
    if end:
        p_qs = p_qs.filter(created_at__lt=end)
    gmv_paise = p_qs.aggregate(t=Sum("amount_paise"))["t"] or 0

    r_qs = PaymentAttempt.objects.filter(status="REFUNDED")
    if start:
        r_qs = r_qs.filter(created_at__gte=start)
    if end:
        r_qs = r_qs.filter(created_at__lt=end)
    refunds_paise = r_qs.aggregate(t=Sum("amount_paise"))["t"] or 0

    active_partners = (
        PartnerApplication.objects.filter(status="APPROVED").values("partner_id").distinct().count()
    )

    open_cases = OperationsCase.objects.filter(status="OPEN").count()

    kill_switches_active = KillSwitch.objects.filter(is_engaged=True).count()

    from apps.wallet.services import calculate_platform_wallet_liability_paise

    wallet_liability_paise = calculate_platform_wallet_liability_paise()

    begin, stop, granularity = series_window(start, end)
    series = build_series(
        begin,
        stop,
        granularity,
        completed_bookings=bucketed(
            Booking.objects.filter(status="COMPLETED"), "created_at", begin, stop, granularity
        ),
        collected_gmv_paise=bucketed(
            PaymentAttempt.objects.filter(status="CAPTURED"),
            "created_at",
            begin,
            stop,
            granularity,
            total="amount_paise",
        ),
        refunds_paise=bucketed(
            PaymentAttempt.objects.filter(status="REFUNDED"),
            "created_at",
            begin,
            stop,
            granularity,
            total="amount_paise",
        ),
    )

    return {
        "completed_bookings": completed_bookings,
        "collected_gmv_paise": gmv_paise,
        "refunds_paise": refunds_paise,
        "active_partners": active_partners,
        "wallet_liability_paise": wallet_liability_paise,
        "open_cases": open_cases,
        "kill_switches_active": kill_switches_active,
        "series_granularity": granularity,
        "series": series,
    }


def get_customer_dashboard(filters: dict) -> dict:
    start, end = get_date_filters(filters)

    u_qs = User.objects.all()
    if start:
        u_qs = u_qs.filter(date_joined__gte=start)
    if end:
        u_qs = u_qs.filter(date_joined__lt=end)
    new_signups = u_qs.count()

    active_wallets = WalletAccount.objects.count()

    ct_qs = CoinTransaction.objects.filter(kind="BURN")
    if start:
        ct_qs = ct_qs.filter(created_at__gte=start)
    if end:
        ct_qs = ct_qs.filter(created_at__lt=end)
    coin_burns = ct_qs.aggregate(t=Sum("amount"))["t"] or 0

    from apps.loyalty.models import ReferralAttribution

    ref_qs = ReferralAttribution.objects.all()
    if start:
        ref_qs = ref_qs.filter(attributed_at__gte=start)
    if end:
        ref_qs = ref_qs.filter(attributed_at__lt=end)
    referral_attributions = ref_qs.count()

    begin, stop, granularity = series_window(start, end)
    series = build_series(
        begin,
        stop,
        granularity,
        new_signups=bucketed(User.objects.all(), "date_joined", begin, stop, granularity),
    )

    return {
        "new_signups": new_signups,
        "active_wallets": active_wallets,
        "coin_burns": coin_burns,
        "referral_attributions": referral_attributions,
        "series_granularity": granularity,
        "series": series,
    }


def get_vendor_dashboard(filters: dict) -> dict:
    start, end = get_date_filters(filters)

    partners = PartnerApplication.objects.values("status").annotate(count=Count("id"))
    partner_stats = {str(item["status"]): item["count"] for item in partners}

    kyc_pending = partner_stats.get("PENDING", 0) + partner_stats.get("UNDER_REVIEW", 0)

    sub_qs = VendorSubscription.objects.filter(status="ACTIVE")
    if start:
        sub_qs = sub_qs.filter(created_at__gte=start)
    if end:
        sub_qs = sub_qs.filter(created_at__lt=end)
    active_subscriptions = sub_qs.count()

    live_listings = Listing.objects.filter(status="PUBLISHED").count()
    pending_listings = Listing.objects.filter(moderation_status="PENDING").count()

    return {
        "partner_review_stats": partner_stats,
        "kyc_pending": kyc_pending,
        "active_subscriptions": active_subscriptions,
        "live_listings": live_listings,
        "pending_listings": pending_listings,
    }


def get_booking_dashboard(filters: dict) -> dict:
    start, end = get_date_filters(filters)

    b_qs = Booking.objects.all()
    if start:
        b_qs = b_qs.filter(created_at__gte=start)
    if end:
        b_qs = b_qs.filter(created_at__lt=end)

    statuses = b_qs.values("status").annotate(count=Count("id"))
    status_counts = {item["status"]: item["count"] for item in statuses}

    cancelled = status_counts.get("CANCELLED", 0)
    completed = status_counts.get("COMPLETED", 0)

    overdue_qs = Booking.objects.filter(
        status__in=["CONFIRMED", "EN_ROUTE"], scheduled_start__lt=timezone.now()
    )
    if start:
        overdue_qs = overdue_qs.filter(created_at__gte=start)
    if end:
        overdue_qs = overdue_qs.filter(created_at__lt=end)
    overdue = overdue_qs.count()

    return {
        "status_breakdown": status_counts,
        "cancelled_bookings": cancelled,
        "completed_bookings": completed,
        "overdue_bookings": overdue,
    }


def get_categories_dashboard(filters: dict) -> dict:
    start, end = get_date_filters(filters)

    from apps.carts.models import FulfilmentUnit, FulfilmentUnitLine
    from apps.commerce.models import Booking
    from apps.rental.models import RentalBooking
    from apps.stay.models import StayEnquiry, StayReservation

    # Confirmed/active GMV only — exclude pending payment and cancelled units/bookings.
    lines = (
        FulfilmentUnitLine.objects.filter(unit__booking__isnull=False)
        .exclude(
            unit__status__in=(
                FulfilmentUnit.Status.PAYMENT_PENDING,
                FulfilmentUnit.Status.CANCELLED,
                FulfilmentUnit.Status.FAILED,
            )
        )
        .exclude(
            unit__booking__status__in=(
                Booking.Status.CANCELLED,
                Booking.Status.ABORTED,
            )
        )
    )
    if start:
        lines = lines.filter(unit__booking__created_at__gte=start)
    if end:
        lines = lines.filter(unit__booking__created_at__lt=end)

    qs = lines.values("cart_item__variant__service__subcategory__category__name").annotate(
        bookings_count=Count("unit__booking", distinct=True),
        revenue_paise=Sum("amount_paise"),
    )

    categories_data: dict[str, dict[str, int]] = {}
    for item in qs:
        cat_name = (
            item["cart_item__variant__service__subcategory__category__name"] or "Uncategorized"
        )
        categories_data[cat_name] = {
            "bookings": item["bookings_count"],
            "revenue_paise": item["revenue_paise"] or 0,
        }

    rental_qs = RentalBooking.objects.exclude(
        status__in=(
            RentalBooking.Status.PENDING_PAYMENT,
            RentalBooking.Status.CANCELLED,
        )
    )
    if start:
        rental_qs = rental_qs.filter(created_at__gte=start)
    if end:
        rental_qs = rental_qs.filter(created_at__lt=end)
    categories_data["Equipment Rentals"] = {
        "bookings": rental_qs.count(),
        "revenue_paise": rental_qs.aggregate(t=Sum("price_paise"))["t"] or 0,
    }

    stay_res_qs = StayReservation.objects.exclude(
        status__in=(
            StayReservation.Status.HELD,
            StayReservation.Status.PAYMENT_PENDING,
            StayReservation.Status.CANCELLED,
        )
    )
    stay_enq_qs = StayEnquiry.objects.exclude(
        status__in=(
            StayEnquiry.Status.CANCELLED,
            StayEnquiry.Status.DECLINED,
            StayEnquiry.Status.WITHDRAWN,
            StayEnquiry.Status.EXPIRED,
        )
    )
    if start:
        stay_res_qs = stay_res_qs.filter(created_at__gte=start)
        stay_enq_qs = stay_enq_qs.filter(created_at__gte=start)
    if end:
        stay_res_qs = stay_res_qs.filter(created_at__lt=end)
        stay_enq_qs = stay_enq_qs.filter(created_at__lt=end)
    categories_data["Rooms / PG / Hotels"] = {
        "bookings": stay_res_qs.count() + stay_enq_qs.count(),
        "revenue_paise": stay_res_qs.aggregate(t=Sum("total_paise"))["t"] or 0,
    }

    return {"categories": categories_data}


DASHBOARDS = {
    "overview": get_business_dashboard,
    "business": get_business_dashboard,
    "categories": get_categories_dashboard,
    "customer": get_customer_dashboard,
    "vendor": get_vendor_dashboard,
    "booking": get_booking_dashboard,
}
