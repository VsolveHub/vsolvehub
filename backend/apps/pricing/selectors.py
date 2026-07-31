"""Read-only pricing selectors used by public catalog presentation."""

from datetime import datetime

from django.db import models
from django.db.models import OuterRef, QuerySet, Subquery
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.pricing.models import PricingPolicy, ServiceRate, TaskRate


def variants_with_current_rate() -> QuerySet[ServiceVariant]:
    now = timezone.now()
    rate = (
        ServiceRate.objects.filter(
            variant_id=OuterRef("pk"),
            is_active=True,
            effective_from__lte=now,
        )
        .filter(effective_to_predicate(now))
        .order_by("-effective_from", "-created_at")
    )
    return ServiceVariant.objects.annotate(
        current_rate_amount_paise=Subquery(rate.values("amount_paise")[:1]),
        current_rate_currency=Subquery(rate.values("currency")[:1]),
    )


def effective_to_predicate(now: datetime) -> models.Q:
    """Return the active upper-bound predicate without duplicating it at call sites."""
    return models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now)


def current_task_rate(
    *, variant: ServiceVariant, task_code: str, at: datetime | None = None
) -> TaskRate | None:
    now = at or timezone.now()
    return (
        TaskRate.objects.filter(
            variant=variant,
            task_code=task_code,
            is_active=True,
            effective_from__lte=now,
        )
        .filter(effective_to_predicate(now))
        .order_by("-effective_from", "-created_at")
        .first()
    )


def current_pricing_policy(*, code: str, at: datetime | None = None) -> PricingPolicy | None:
    now = at or timezone.now()
    return (
        PricingPolicy.objects.filter(code=code, is_active=True, effective_from__lte=now)
        .filter(effective_to_predicate(now))
        .order_by("-effective_from", "-created_at")
        .first()
    )
