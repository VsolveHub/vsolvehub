"""How a Partner is doing — the numbers their home screen is built from.

Every figure here is an aggregate over `PartnerLedgerEntry`, and that choice is
load-bearing. Exactly one `EARNING` entry is written per completed booking, at
settlement, with its own `created_at` — so "jobs done today" is a count of those
entries rather than a scan of `Booking.updated_at`, which moves for any reason at
all and would report a job as re-completed every time somebody touched it.

Revenue sums `net_paise` across **every** kind, so an adjustment or a reversal
lands in the total the same day it is written. A "revenue" figure that quietly
excluded reversals would drift away from the balance on the same screen.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import models
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.partners.models import PartnerProfile
from apps.payouts.models import PartnerLedgerEntry

#: Days of history the home screen's trend shows.
TREND_DAYS = 7


def _zone() -> ZoneInfo:
    """The Partner's working timezone.

    Local days, not UTC days: a job finished at 11pm in Hyderabad belongs to that
    Partner's today, and a UTC boundary would move it to tomorrow.
    """
    return ZoneInfo(settings.TIME_ZONE)


def _day_bounds(local_day: date, zone: ZoneInfo) -> tuple[datetime, datetime]:
    start = datetime.combine(local_day, datetime.min.time(), tzinfo=zone)
    return start, start + timedelta(days=1)


def partner_performance(partner: PartnerProfile) -> dict[str, object]:
    """Today, this month, and the trend behind them."""
    zone = _zone()
    now = timezone.now()
    today = now.astimezone(zone).date()

    entries = PartnerLedgerEntry.objects.filter(partner=partner)

    def window(start: datetime, end: datetime) -> tuple[int, int]:
        """Net earned and jobs done between two instants."""
        scoped = entries.filter(created_at__gte=start, created_at__lt=end)
        net = scoped.aggregate(total=models.Sum("net_paise"))["total"] or 0
        jobs = scoped.filter(kind=PartnerLedgerEntry.Kind.EARNING).count()
        return int(net), int(jobs)

    today_start, today_end = _day_bounds(today, zone)
    today_net, today_jobs = window(today_start, today_end)

    month_start = datetime.combine(today.replace(day=1), datetime.min.time(), tzinfo=zone)
    month_net, month_jobs = window(month_start, today_end)

    lifetime_net = int(entries.aggregate(total=models.Sum("net_paise"))["total"] or 0)
    lifetime_jobs = int(entries.filter(kind=PartnerLedgerEntry.Kind.EARNING).count())

    return {
        "today_net_paise": today_net,
        "today_jobs": today_jobs,
        "month_net_paise": month_net,
        "month_jobs": month_jobs,
        "average_monthly_net_paise": _average_monthly_net_paise(entries, lifetime_net),
        "lifetime_net_paise": lifetime_net,
        "lifetime_jobs": lifetime_jobs,
        "daily": _daily_trend(entries, today=today, zone=zone),
        "currency": "INR",
        "server_now": now,
    }


def _average_monthly_net_paise(
    entries: models.QuerySet[PartnerLedgerEntry],
    lifetime_net: int,
) -> int:
    """Average over the months a Partner actually worked, not over the calendar.

    Dividing by elapsed months would punish someone for joining mid-year, and
    dividing by 12 would invent eleven months of zero for a Partner who started
    last week. Counting the months with at least one entry answers the question a
    Partner is really asking — "in a normal working month, what do I make?"

    Returns 0 rather than dividing by zero for a Partner who has earned nothing.
    """
    active_months = (
        entries.annotate(month=TruncMonth("created_at")).values("month").distinct().count()
    )
    return 0 if active_months == 0 else lifetime_net // active_months


def _daily_trend(
    entries: models.QuerySet[PartnerLedgerEntry],
    *,
    today: date,
    zone: ZoneInfo,
) -> list[dict[str, object]]:
    """One row per local day, including the empty ones.

    Days with nothing are kept at zero rather than omitted: a gap that closed up
    would make a day off look like it never happened, and "I did not work Tuesday"
    is exactly what the reader is checking for.

    Computed here rather than in the browser because the client only ever holds
    one page of the ledger — grouping there silently under-reports the moment a
    Partner has more entries than fit in a page.
    """
    first_day = today - timedelta(days=TREND_DAYS - 1)
    window_start, _ = _day_bounds(first_day, zone)
    _, window_end = _day_bounds(today, zone)

    buckets: dict[date, dict[str, int]] = {}
    for entry in entries.filter(
        created_at__gte=window_start,
        created_at__lt=window_end,
    ).only("created_at", "net_paise", "kind"):
        day = entry.created_at.astimezone(zone).date()
        bucket = buckets.setdefault(day, {"net_paise": 0, "jobs": 0})
        bucket["net_paise"] += entry.net_paise
        if entry.kind == PartnerLedgerEntry.Kind.EARNING:
            bucket["jobs"] += 1

    return [
        {
            "date": day,
            "net_paise": buckets.get(day, {}).get("net_paise", 0),
            "jobs": buckets.get(day, {}).get("jobs", 0),
        }
        for day in (first_day + timedelta(days=offset) for offset in range(TREND_DAYS))
    ]
