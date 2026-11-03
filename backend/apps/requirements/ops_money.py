"""The Workforce & projects "Money" tab: every charge on a crew (A3) or project (A5) request.

These are post-cart charges, one purpose each: the crew booking fee and quote unlock (Vsolve's
fees), the A5 visit plan and site-visit fee, and project money (stage funding, material advances,
scope changes), which is held for the vendor rather than earned by the platform. The tab counts a
charge in the period its capture falls in and shows refunds separately, so nothing is presented
as platform revenue that is really the vendor's.
"""

from typing import Any

from django.db import models
from django.db.models.functions import Coalesce

from apps.commerce.models import PaymentAttempt, Refund
from apps.commerce.ops_money import (
    Period,
    annotated,
    counts,
    money_views,
    refunded_paise,
    summary,
    total,
)
from apps.requirements.models import (
    BookingFee,
    CustomerRequirement,
    EngagementAmendment,
    EngagementStage,
    QuoteUnlock,
    VisitPlan,
)

MODEL = (
    "Crew requests pay a booking fee or quote unlock to Vsolve. Projects pay a visit plan, then "
    "fund each stage; stage money is held for the vendor until the work is accepted."
)
Purpose = PaymentAttempt.Purpose
FEES = (Purpose.M2_BOOKING_FEE, Purpose.M2_QUOTE_UNLOCK)
VISITS = (Purpose.M2_VISIT_PLAN, Purpose.M2_SITE_VISIT_FEE)
PROJECT = (Purpose.M2_STAGE_FUNDING, Purpose.M2_MATERIAL_ADVANCE, Purpose.M2_SCOPE_AMENDMENT)
PURPOSES = (*FEES, *VISITS, *PROJECT)

ITEM_LABELS: dict[str, str] = {
    Purpose.M2_BOOKING_FEE: "Crew booking fee",
    Purpose.M2_QUOTE_UNLOCK: "Quote unlock",
    Purpose.M2_VISIT_PLAN: "Visit plan",
    Purpose.M2_SITE_VISIT_FEE: "Site visit fee",
    Purpose.M2_STAGE_FUNDING: "Project stage",
    Purpose.M2_MATERIAL_ADVANCE: "Material advance",
    Purpose.M2_SCOPE_AMENDMENT: "Scope change",
}


def _paid(period: Period) -> models.QuerySet[PaymentAttempt]:
    return PaymentAttempt.objects.filter(purpose__in=PURPOSES).filter(period.filter("captured_at"))


def _sum(rows: models.QuerySet[PaymentAttempt]) -> tuple[int, int]:
    agg = rows.aggregate(n=models.Count("id"), t=Coalesce(models.Sum("amount_paise"), 0))
    return int(agg["n"]), int(agg["t"])


def workforce_money_summary(period: Period) -> dict[str, Any]:
    paid = _paid(period)
    payments, collected = _sum(paid)
    fee_n, fees = _sum(paid.filter(purpose__in=FEES))
    visit_n, visits = _sum(paid.filter(purpose__in=VISITS))
    project_n, project = _sum(paid.filter(purpose__in=PROJECT))
    refunded = Refund.objects.filter(
        payment_attempt__in=paid, status=Refund.Status.SUCCEEDED
    ).aggregate(t=Coalesce(models.Sum("amount_paise"), 0))["t"]

    requests = CustomerRequirement.objects.filter(
        archetype__in=("A3_TIME_BLOCK", "A5_CUSTOM_PROJECT")
    )
    status = CustomerRequirement.Status
    request_counts = counts(
        [
            ("total", "All requests", requests.count()),
            (
                "open",
                "Open",
                requests.exclude(status__startswith="CLOSED_").count(),
            ),
            ("engaged", "Engaged", requests.filter(status=status.ENGAGED).count()),
            ("completed", "Completed", requests.filter(status=status.CLOSED_COMPLETE).count()),
            (
                "closed_other",
                "Closed without work",
                requests.filter(status__startswith="CLOSED_")
                .exclude(status=status.CLOSED_COMPLETE)
                .count(),
            ),
        ]
    )
    return summary(
        period,
        model=MODEL,
        totals=[
            total(
                "collected",
                "Collected from customers",
                "money",
                collected - int(refunded),
                "All crew and project charges, less refunds.",
            ),
            total("payments", "Payments", "count", payments, ""),
            total(
                "fees",
                "Booking fees and quote unlocks",
                "money",
                fees,
                f"{fee_n} paid. Vsolve's fees, before any refund.",
            ),
            total(
                "visits",
                "Visit plans and site visits",
                "money",
                visits,
                f"{visit_n} paid.",
            ),
            total(
                "project",
                "Project money held for vendors",
                "money",
                project,
                f"{project_n} paid. Stage funding, materials and scope changes.",
            ),
            total("refunded", "Refunded", "money", int(refunded), "On payments in this period."),
        ],
        listing_counts=request_counts,
    )


def _requirement_for(attempt: PaymentAttempt) -> CustomerRequirement | None:
    """The request a charge belongs to, from the aggregate that sold it."""
    related = "requirement__customer", "requirement__variant__service"
    if attempt.purpose == Purpose.M2_BOOKING_FEE:
        fee = BookingFee.objects.filter(payment_attempt=attempt).select_related(*related).first()
        return fee.requirement if fee else None
    if attempt.purpose == Purpose.M2_QUOTE_UNLOCK:
        unlock = (
            QuoteUnlock.objects.filter(payment_attempt=attempt).select_related(*related).first()
        )
        return unlock.requirement if unlock else None
    if attempt.purpose == Purpose.M2_VISIT_PLAN:
        plan = VisitPlan.objects.filter(payment_attempt=attempt).select_related(*related).first()
        return plan.requirement if plan else None
    engagement_related = (
        "engagement__requirement__customer",
        "engagement__requirement__variant__service",
    )
    if attempt.purpose in (Purpose.M2_STAGE_FUNDING, Purpose.M2_MATERIAL_ADVANCE):
        stage = (
            EngagementStage.objects.filter(payment_attempt=attempt)
            .select_related(*engagement_related)
            .first()
        )
        return stage.engagement.requirement if stage else None
    if attempt.purpose == Purpose.M2_SCOPE_AMENDMENT:
        amendment = (
            EngagementAmendment.objects.filter(payment_attempt=attempt)
            .select_related(*engagement_related)
            .first()
        )
        return amendment.engagement.requirement if amendment else None
    return None


def workforce_money_payments(period: Period, *, limit: int, offset: int) -> list[dict[str, Any]]:
    """Captured crew and project charges in the period, newest first.

    The payer is resolved per row from the charge's own aggregate (a page is at most 60 rows).
    `platform_paise` is the whole charge for a Vsolve fee and 0 for money held for a vendor.
    """
    attempts = list(
        _paid(period)
        .annotate(refunded=refunded_paise("pk"))
        .order_by("-captured_at", "-id")[offset : offset + limit]
    )
    result = []
    for attempt in attempts:
        requirement = _requirement_for(attempt)
        customer = requirement.customer if requirement is not None else None
        label = ITEM_LABELS.get(attempt.purpose, attempt.purpose)
        if requirement is not None:
            label = f"{label}: {requirement.variant.service.name}"
        result.append(
            {
                "id": attempt.id,
                "paid_at": attempt.captured_at,
                "payer_name": (customer.full_name or "").strip() if customer else "",
                "payer_phone": customer.phone_number if customer else "",
                "item": label,
                "amount_paise": attempt.amount_paise,
                "refunded_paise": annotated(attempt, "refunded"),
                "platform_paise": attempt.amount_paise if attempt.purpose in FEES else 0,
                "status": attempt.status,
            }
        )
    return result


#: `GET /ops/workforce/money` and `GET /ops/workforce/money/payments`.
MoneySummaryView, MoneyPaymentsView = money_views(
    name="Workforce",
    build_summary=workforce_money_summary,
    build_payments=workforce_money_payments,
)
