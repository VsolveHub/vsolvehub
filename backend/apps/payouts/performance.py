"""How a Partner is doing — the numbers their home screen is built from.

Performance is broader than the payout balance. Money collected by Vsolve is
recorded in :class:`PartnerLedgerEntry`; A3 crew wages are paid directly by the
Customer and are recorded in :class:`DaySettlement` instead. Both are real
Partner earnings, but only the former is money Vsolve still owes.

Job counts use durable completion records rather than mutable ``updated_at``
timestamps. A1 bookings and A5 site visits are identified by their earning
ledger rows, while an A3/A5 engagement is counted once from ``completed_at`` —
never once per stage or once per worker-day.
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
from apps.requirements.models import DaySettlement, Engagement

TREND_DAYS = 7


def _zone() -> ZoneInfo:
    """The Partner's working timezone."""
    return ZoneInfo(settings.TIME_ZONE)


def _day_bounds(local_day: date, zone: ZoneInfo) -> tuple[datetime, datetime]:
    start = datetime.combine(local_day, datetime.min.time(), tzinfo=zone)
    return start, start + timedelta(days=1)


def _ledger_job_entries(
    entries: models.QuerySet[PartnerLedgerEntry],
) -> models.QuerySet[PartnerLedgerEntry]:
    """Ledger rows that represent one completed job rather than one money event.

    A booking earning is one A1 job. An earned visit-plan share is one A5 site
    visit. Stage earnings, retention releases, travel compensation, adjustments
    and reversals move money but must not inflate "jobs done".
    """
    return (
        entries.filter(kind=PartnerLedgerEntry.Kind.EARNING)
        .filter(models.Q(booking_id__isnull=False) | models.Q(m2_visit_plan_shares__isnull=False))
        .distinct()
    )


def partner_performance(partner: PartnerProfile) -> dict[str, object]:
    """Today, this month, and the trend behind them."""
    zone = _zone()
    now = timezone.now()
    today = now.astimezone(zone).date()

    entries = PartnerLedgerEntry.objects.filter(partner=partner)
    direct_settlements = DaySettlement.objects.filter(
        engagement__partner=partner,
        status=DaySettlement.Status.SETTLED,
        settled_at__isnull=False,
    )
    completed_engagements = Engagement.objects.filter(
        partner=partner,
        completed_at__isnull=False,
    )

    def window(start: datetime, end: datetime) -> tuple[int, int, int]:
        """Net earned and jobs completed between two instants."""
        scoped_entries = entries.filter(created_at__gte=start, created_at__lt=end)
        ledger_net = scoped_entries.aggregate(total=models.Sum("net_paise"))["total"] or 0
        direct_net = (
            direct_settlements.filter(
                settled_at__gte=start,
                settled_at__lt=end,
            ).aggregate(total=models.Sum("amount_paise"))["total"]
            or 0
        )
        jobs = _ledger_job_entries(scoped_entries).count()
        jobs += completed_engagements.filter(
            completed_at__gte=start,
            completed_at__lt=end,
        ).count()
        return int(ledger_net) + int(direct_net), int(direct_net), int(jobs)

    today_start, today_end = _day_bounds(today, zone)
    today_net, today_direct, today_jobs = window(today_start, today_end)

    month_start = datetime.combine(today.replace(day=1), datetime.min.time(), tzinfo=zone)
    month_net, month_direct, month_jobs = window(month_start, today_end)

    ledger_lifetime_net = entries.aggregate(total=models.Sum("net_paise"))["total"] or 0
    direct_lifetime_net = (
        direct_settlements.aggregate(total=models.Sum("amount_paise"))["total"] or 0
    )
    lifetime_net = int(ledger_lifetime_net) + int(direct_lifetime_net)
    lifetime_jobs = _ledger_job_entries(entries).count() + completed_engagements.count()

    return {
        "today_net_paise": today_net,
        "today_direct_paise": today_direct,
        "today_jobs": today_jobs,
        "month_net_paise": month_net,
        "month_direct_paise": month_direct,
        "month_jobs": month_jobs,
        "average_monthly_net_paise": _average_monthly_net_paise(
            entries,
            direct_settlements,
            lifetime_net,
            zone,
        ),
        "lifetime_net_paise": lifetime_net,
        "lifetime_direct_paise": int(direct_lifetime_net),
        "lifetime_jobs": lifetime_jobs,
        "daily": _daily_trend(
            entries,
            direct_settlements,
            completed_engagements,
            today=today,
            zone=zone,
        ),
        "currency": "INR",
        "server_now": now,
    }


def _average_monthly_net_paise(
    entries: models.QuerySet[PartnerLedgerEntry],
    direct_settlements: models.QuerySet[DaySettlement],
    lifetime_net: int,
    zone: ZoneInfo,
) -> int:
    """Average over the union of months in which the Partner earned money."""
    ledger_months = set(
        entries.annotate(month=TruncMonth("created_at", tzinfo=zone)).values_list(
            "month", flat=True
        )
    )
    direct_months = set(
        direct_settlements.annotate(month=TruncMonth("settled_at", tzinfo=zone)).values_list(
            "month", flat=True
        )
    )
    active_months = len(ledger_months | direct_months)
    return 0 if active_months == 0 else lifetime_net // active_months


def _daily_trend(
    entries: models.QuerySet[PartnerLedgerEntry],
    direct_settlements: models.QuerySet[DaySettlement],
    completed_engagements: models.QuerySet[Engagement],
    *,
    today: date,
    zone: ZoneInfo,
) -> list[dict[str, object]]:
    """One row per local day, combining platform and direct-paid earnings."""
    first_day = today - timedelta(days=TREND_DAYS - 1)
    window_start, _ = _day_bounds(first_day, zone)
    _, window_end = _day_bounds(today, zone)

    scoped_entries = entries.filter(
        created_at__gte=window_start,
        created_at__lt=window_end,
    )
    ledger_job_ids = set(_ledger_job_entries(scoped_entries).values_list("id", flat=True))

    buckets: dict[date, dict[str, int]] = {}
    for entry in scoped_entries.only("id", "created_at", "net_paise"):
        day = entry.created_at.astimezone(zone).date()
        bucket = buckets.setdefault(day, {"net_paise": 0, "jobs": 0})
        bucket["net_paise"] += entry.net_paise
        if entry.id in ledger_job_ids:
            bucket["jobs"] += 1

    for settlement in direct_settlements.filter(
        settled_at__gte=window_start,
        settled_at__lt=window_end,
    ).only("settled_at", "amount_paise"):
        settled_at = settlement.settled_at
        if settled_at is None:  # Defensive against an inconsistent custom queryset.
            continue
        day = settled_at.astimezone(zone).date()
        bucket = buckets.setdefault(day, {"net_paise": 0, "jobs": 0})
        bucket["net_paise"] += settlement.amount_paise

    for engagement in completed_engagements.filter(
        completed_at__gte=window_start,
        completed_at__lt=window_end,
    ).only("completed_at"):
        completed_at = engagement.completed_at
        if completed_at is None:  # Defensive against an inconsistent custom queryset.
            continue
        day = completed_at.astimezone(zone).date()
        bucket = buckets.setdefault(day, {"net_paise": 0, "jobs": 0})
        bucket["jobs"] += 1

    return [
        {
            "date": day,
            "net_paise": buckets.get(day, {}).get("net_paise", 0),
            "jobs": buckets.get(day, {}).get("jobs", 0),
        }
        for day in (first_day + timedelta(days=offset) for offset in range(TREND_DAYS))
    ]
