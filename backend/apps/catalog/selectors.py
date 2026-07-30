"""Optimized public catalog reads."""

from typing import Protocol, cast

from django.db import models
from django.db.models import Exists, OuterRef, Prefetch, QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.catalog.models import (
    Category,
    Service,
    ServiceMedia,
    ServicePolicy,
    ServiceQuestion,
    ServiceQuestionOption,
    ServiceVariant,
    Subcategory,
)
from apps.pricing.models import ServiceRate
from apps.pricing.selectors import variants_with_current_rate


class _PublicService(Protocol):
    public_variants: list[ServiceVariant]


def _public_variants() -> QuerySet[ServiceVariant]:
    questions = ServiceQuestion.objects.filter(is_active=True).prefetch_related(
        Prefetch("options", queryset=ServiceQuestionOption.objects.filter(is_active=True)),
    )
    return (
        variants_with_current_rate()
        .filter(  # type: ignore[misc]  # Dynamic Subquery annotation.
            is_active=True,
            current_rate_amount_paise__isnull=False,
        )
        .prefetch_related(Prefetch("questions", queryset=questions))
        .order_by("display_order", "name")
    )


def public_categories() -> QuerySet[Category]:
    return Category.objects.filter(is_active=True).prefetch_related(
        Prefetch(
            "subcategories",
            queryset=Subcategory.objects.filter(is_active=True),
        ),
    )


def public_services_for_category(category_slug: str) -> QuerySet[Service]:
    now = timezone.now()
    current_rate = ServiceRate.objects.filter(
        variant__service_id=OuterRef("pk"),
        variant__is_active=True,
        is_active=True,
        effective_from__lte=now,
    ).filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now))
    return (
        Service.objects.annotate(has_current_rate=Exists(current_rate))
        .filter(
            status=Service.Status.ACTIVE,
            subcategory__is_active=True,
            subcategory__category__is_active=True,
            subcategory__category__slug=category_slug,
            has_current_rate=True,
        )
        .select_related("subcategory", "subcategory__category")
        .prefetch_related(
            Prefetch("variants", queryset=_public_variants(), to_attr="public_variants"),
            Prefetch("media", queryset=ServiceMedia.objects.filter(is_active=True)),
        )
        .distinct()
        .order_by("display_order", "name")
    )


def public_service_by_slug(service_slug: str) -> Service:
    services = (
        Service.objects.filter(
            status=Service.Status.ACTIVE,
            subcategory__is_active=True,
            subcategory__category__is_active=True,
        )
        .select_related("subcategory", "subcategory__category")
        .prefetch_related(
            Prefetch("variants", queryset=_public_variants(), to_attr="public_variants"),
            Prefetch("policies", queryset=ServicePolicy.objects.filter(is_active=True)),
            Prefetch("media", queryset=ServiceMedia.objects.filter(is_active=True)),
        )
    )
    service = get_object_or_404(services, slug=service_slug)
    public = cast(_PublicService, cast(object, service))
    if not public.public_variants:
        # An active service without an effective rate must not appear bookable.
        raise NotFound("Service is not currently bookable.")
    return service
