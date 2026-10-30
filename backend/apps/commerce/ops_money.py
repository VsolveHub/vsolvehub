"""What one marketplace service earned, for its Operations "Money" tab.

Rentals, stays and jobs each have a summary and a "who paid" list built on these pieces, so the
three tabs count money the same way:

- A purchase counts once its payment was **captured**, in the period its capture falls in.
  Created, pending, failed and expired attempts never count.
- The amount is what was paid then (the attempt or booking snapshot), never today's plan price.
- Successful refunds on that payment are subtracted.

Each service only ever reads its own records, so a tab never shows another service's money.
"""

from collections import defaultdict
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from django.db import models
from django.db.models.functions import Coalesce
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from rest_framework import serializers
from rest_framework.request import Request

from apps.commerce.models import Refund
from common.pagination import browse_window

if TYPE_CHECKING:
    from rest_framework.views import APIView

PERIODS = ("this_month", "last_month", "all")
DEFAULT_PERIOD = "this_month"

MONEY_PARAMETERS = [
    OpenApiParameter(
        "period",
        OpenApiTypes.STR,
        OpenApiParameter.QUERY,
        enum=list(PERIODS),
        description="Captured in this calendar month (default), last month, or ever.",
    ),
]
PAYMENT_PAGE_PARAMETERS = [
    *MONEY_PARAMETERS,
    OpenApiParameter("limit", OpenApiTypes.INT, OpenApiParameter.QUERY),
    OpenApiParameter("offset", OpenApiTypes.INT, OpenApiParameter.QUERY),
]


class Period:
    """A capture-time window. ``start``/``end`` are ``None`` for all time."""

    def __init__(self, code: str, start: datetime | None, end: datetime | None) -> None:
        self.code = code
        self.start = start
        self.end = end

    def filter(self, field: str) -> models.Q:
        """Captured (``field`` set) and inside the window."""
        q = models.Q(**{f"{field}__isnull": False})
        if self.start is not None:
            q &= models.Q(**{f"{field}__gte": self.start})
        if self.end is not None:
            q &= models.Q(**{f"{field}__lt": self.end})
        return q


def _month_start(moment: datetime) -> datetime:
    return moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def period_from(request: Request, *, now: datetime | None = None) -> Period:
    """`?period=` as a window in local time. An unknown value is refused, not ignored."""
    code = (request.query_params.get("period") or DEFAULT_PERIOD).strip()
    if code not in PERIODS:
        raise serializers.ValidationError(
            {"period": [f"Choose one of: {', '.join(PERIODS)}."]}, code="invalid_period"
        )
    local_now = timezone.localtime(now)
    this_month = _month_start(local_now)
    if code == "all":
        return Period(code, None, None)
    if code == "this_month":
        next_month = _month_start(this_month.replace(day=28) + timedelta(days=4))
        return Period(code, this_month, next_month)
    last_month = _month_start(this_month - timedelta(days=1))
    return Period(code, last_month, this_month)


def refunded_paise(attempt_ref: str) -> Coalesce:
    """Successful refunds on the payment at ``attempt_ref`` (an ``OuterRef`` path), in paise."""
    total = (
        Refund.objects.filter(
            payment_attempt=models.OuterRef(attempt_ref), status=Refund.Status.SUCCEEDED
        )
        .order_by()
        .values("payment_attempt")
        .annotate(total=models.Sum("amount_paise"))
        .values("total")
    )
    return Coalesce(
        models.Subquery(total, output_field=models.BigIntegerField()),
        models.Value(0),
        output_field=models.BigIntegerField(),
    )


def annotated(row: Any, name: str) -> int:
    """An integer annotation on ``row`` (the type checker cannot see annotations)."""
    return int(getattr(row, name) or 0)


def payment_window(request: Request) -> tuple[int, int]:
    """`(limit, offset)` for the "who paid" list: the same clamp as the public browse pages."""
    return browse_window(request)


# --- response shapes, shared by the three services -------------------------------------------


class MoneyTotalSerializer(serializers.Serializer[dict[str, Any]]):
    key = serializers.CharField()
    #: Shadows `Field.label` (the DRF field title); harmless for a read-only response shape.
    label = serializers.CharField()  # type: ignore[assignment]
    kind = serializers.ChoiceField(choices=("money", "count", "percent"))
    #: Paise for `money`, a whole number for `count` and `percent`.
    value = serializers.IntegerField()
    note = serializers.CharField(allow_blank=True)


class MoneyPlanSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    price_paise = serializers.IntegerField()
    duration_days = serializers.IntegerField()
    is_active = serializers.BooleanField()
    #: Paid purchases in the period.
    purchases = serializers.IntegerField()
    #: Partners on the plan right now, whatever the period.
    active_now = serializers.IntegerField()
    #: Net of refunds, in the period.
    revenue_paise = serializers.IntegerField()


class ListingCountSerializer(serializers.Serializer[dict[str, Any]]):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    count = serializers.IntegerField()


class MoneySummarySerializer(serializers.Serializer[dict[str, Any]]):
    period = serializers.ChoiceField(choices=PERIODS)
    starts_at = serializers.DateTimeField(allow_null=True)
    ends_at = serializers.DateTimeField(allow_null=True)
    #: How this service earns, in one sentence, so the tab says it.
    model = serializers.CharField()
    totals = MoneyTotalSerializer(many=True)
    #: Subscription plans; empty for a service with none.
    plans = MoneyPlanSerializer(many=True)
    #: Every listing of this service by state: true totals, not one loaded page.
    listing_counts = ListingCountSerializer(many=True)


class MoneyPaymentSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    paid_at = serializers.DateTimeField()
    payer_name = serializers.CharField(allow_blank=True)
    payer_phone = serializers.CharField(allow_blank=True)
    #: What was bought: a plan name, "Premium upgrade: …", or the rented item.
    item = serializers.CharField()
    #: What was charged.
    amount_paise = serializers.IntegerField()
    refunded_paise = serializers.IntegerField()
    #: The platform's share of it.
    platform_paise = serializers.IntegerField()
    status = serializers.CharField()


def summary(
    period: Period,
    *,
    model: str,
    totals: list[dict[str, Any]],
    plans: list[dict[str, Any]] | None = None,
    listing_counts: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "period": period.code,
        "starts_at": period.start,
        "ends_at": period.end,
        "model": model,
        "totals": totals,
        "plans": plans or [],
        "listing_counts": listing_counts,
    }


def total(key: str, label: str, kind: str, value: int, note: str = "") -> dict[str, Any]:
    return {"key": key, "label": label, "kind": kind, "value": int(value or 0), "note": note}


def plan_rows(
    plans: Any,
    subscriptions: models.QuerySet[Any],
    period: Period,
    *,
    partner_field: str,
    active_statuses: tuple[str, ...],
) -> list[dict[str, Any]]:
    """One row per plan: paid purchases and net revenue in the period, partners on it now.

    ``subscriptions`` is the service's subscription queryset (with ``plan`` and
    ``payment_attempt``), unfiltered. Summed in Python: a plan has few purchases a month, and
    grouping a refund subquery in SQL would split the groups.
    """
    paid = (
        subscriptions.filter(period.filter("payment_attempt__captured_at"))
        .annotate(refunded=refunded_paise("payment_attempt"))
        .values_list("plan_id", "payment_attempt__amount_paise", "refunded")
    )
    purchases: dict[Any, int] = defaultdict(int)
    revenue: dict[Any, int] = defaultdict(int)
    for plan_id, amount, refunded in paid:
        purchases[plan_id] += 1
        revenue[plan_id] += int(amount) - int(refunded)
    now = timezone.now()
    active = dict(
        subscriptions.filter(status__in=active_statuses)
        .filter(models.Q(ends_at__isnull=True) | models.Q(ends_at__gt=now))
        .order_by()
        .values("plan_id")
        .annotate(n=models.Count(partner_field, distinct=True))
        .values_list("plan_id", "n")
    )
    return [
        {
            "id": plan.id,
            "name": plan.name,
            "price_paise": plan.price_paise,
            "duration_days": plan.duration_days,
            "is_active": plan.is_active,
            "purchases": purchases[plan.id],
            "active_now": active.get(plan.id, 0),
            "revenue_paise": revenue[plan.id],
        }
        for plan in plans
    ]


def counts(rows: list[tuple[str, str, int]]) -> list[dict[str, Any]]:
    return [{"key": key, "label": label, "count": int(n)} for key, label, n in rows]


def money_views(
    *, name: str, build_summary: Any, build_payments: Any
) -> "tuple[type[APIView], type[APIView]]":
    """The summary and "who paid" views for one service. Operations only."""
    from drf_spectacular.utils import extend_schema  # noqa: PLC0415
    from rest_framework.response import Response  # noqa: PLC0415
    from rest_framework.views import APIView  # noqa: PLC0415

    from apps.partners.permissions import IsOperationsUser  # noqa: PLC0415

    class SummaryView(APIView):
        permission_classes = (IsOperationsUser,)

        @extend_schema(
            parameters=MONEY_PARAMETERS,
            responses=MoneySummarySerializer,
        )
        def get(self, request: Request) -> Response:
            return Response(MoneySummarySerializer(build_summary(period_from(request))).data)

    class PaymentsView(APIView):
        permission_classes = (IsOperationsUser,)

        @extend_schema(
            parameters=PAYMENT_PAGE_PARAMETERS,
            responses=MoneyPaymentSerializer(many=True),
        )
        def get(self, request: Request) -> Response:
            limit, offset = payment_window(request)
            rows = build_payments(period_from(request), limit=limit, offset=offset)
            return Response(MoneyPaymentSerializer(rows, many=True).data)

    SummaryView.__name__ = SummaryView.__qualname__ = f"Ops{name}MoneySummaryView"
    PaymentsView.__name__ = PaymentsView.__qualname__ = f"Ops{name}MoneyPaymentsView"
    return SummaryView, PaymentsView
