"""Optimized public catalog reads."""

from collections.abc import Iterable
from typing import Protocol, cast
from uuid import UUID

from django.db import models
from django.db.models import Exists, OuterRef, Prefetch, QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.catalog.models import (
    Category,
    M2VariantConfiguration,
    Service,
    ServiceMedia,
    ServicePolicy,
    ServiceQuestion,
    ServiceQuestionOption,
    ServiceVariant,
    Subcategory,
)
from apps.pricing.models import PricingPolicy, ServiceRate, TaskRate
from apps.pricing.selectors import variants_with_current_rate


class _PublicService(Protocol):
    public_variants: list[ServiceVariant]
    requirement_variants: list[ServiceVariant]


def _public_variants() -> QuerySet[ServiceVariant]:
    now = timezone.now()
    questions = ServiceQuestion.objects.filter(is_active=True).prefetch_related(
        Prefetch("options", queryset=ServiceQuestionOption.objects.filter(is_active=True)),
    )
    task_rates = (
        TaskRate.objects.filter(is_active=True, effective_from__lte=now)
        .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now))
        .order_by("task_code", "-effective_from", "-created_at")
        .distinct("task_code")
    )
    pricing_policy = (
        PricingPolicy.objects.filter(
            code="m1-technician",
            is_active=True,
            effective_from__lte=now,
        )
        .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now))
        .order_by("-effective_from", "-created_at")
    )
    return (
        variants_with_current_rate()
        .select_related("service")
        .annotate(
            minimum_service_subtotal_paise=models.Subquery(
                pricing_policy.values("minimum_service_subtotal_paise")[:1],
            ),
        )
        .filter(  # type: ignore[misc]  # Dynamic Subquery annotation.
            is_active=True,
            booking_archetype=ServiceVariant.BookingArchetype.A1_TASK_VISIT,
            current_rate_amount_paise__isnull=False,
            minimum_service_subtotal_paise__isnull=False,
        )
        .prefetch_related(
            Prefetch("questions", queryset=questions),
            Prefetch("task_rates", queryset=task_rates, to_attr="current_task_rates"),
        )
        .order_by("display_order", "name")
    )


def _requirement_variants() -> QuerySet[ServiceVariant]:
    """Active variants that accept a guided requirement instead of a priced booking.

    The A3/A5 half of the catalog. These deliberately have **no `ServiceRate`** — an M2 price is
    the vendor's quote, and a rate row on one would both invent a number and make it look
    addable to a cart through the A1 flow.
    """
    questions = ServiceQuestion.objects.filter(is_active=True).prefetch_related(
        Prefetch("options", queryset=ServiceQuestionOption.objects.filter(is_active=True)),
    )
    return (
        ServiceVariant.objects.filter(
            is_active=True,
            m2_configurations__status=M2VariantConfiguration.Status.ACTIVE,
        )
        # Screen 1 of the requirement flow renders these, and `submit_requirement` validates the
        # answers against the same authored schema. A variant published without them is a first
        # screen with nothing to ask and a fourth screen that refuses what it collected.
        .prefetch_related(Prefetch("questions", queryset=questions))
        .distinct()
    )


def _offerable_services() -> QuerySet[Service]:
    """Every service a Customer may be shown, under one rule for both lifecycles.

    **A service is offerable when it can be priced *or* when it can be asked about.** Until this
    existed the only gate was `has_current_rate`, which is the M1 rule — an A1 task cannot be
    booked without a price — and it silently excluded every M2 service from the catalog, because
    an A3 or A5 service has no rate by design. The seeded `workforce-and-projects` category
    listed zero services and its two service pages answered `404`, with nothing wrong in the data:
    both services were `ACTIVE`, both variants active, both configurations `ACTIVE`.

    `README.md` §"Customer, Partner and Operations surfaces" is explicit that this is one catalog
    and the *archetype* chooses the action — "Check price and availability" against "Tell us what
    you need" — so the fix belongs here rather than in a second M2-only listing.

    Both annotations are published downstream: `has_current_rate` still decides whether a
    `starting_price` exists, and `accepts_requirements` is what tells a client which action to
    render. Neither is inferred from the other, because a service may genuinely have both.
    """
    now = timezone.now()
    current_rate = ServiceRate.objects.filter(
        variant__service_id=OuterRef("pk"),
        variant__is_active=True,
        is_active=True,
        effective_from__lte=now,
    ).filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now))
    requirement_variant = ServiceVariant.objects.filter(
        service_id=OuterRef("pk"),
        is_active=True,
        m2_configurations__status=M2VariantConfiguration.Status.ACTIVE,
    )
    return (
        Service.objects.annotate(
            has_current_rate=Exists(current_rate),
            accepts_requirements=Exists(requirement_variant),
        )
        .filter(
            models.Q(has_current_rate=True) | models.Q(accepts_requirements=True),
            status=Service.Status.ACTIVE,
            subcategory__is_active=True,
            subcategory__category__is_active=True,
        )
        .select_related("subcategory", "subcategory__category")
        .prefetch_related(
            Prefetch("variants", queryset=_public_variants(), to_attr="public_variants"),
            Prefetch(
                "variants",
                queryset=_requirement_variants(),
                to_attr="requirement_variants",
            ),
            Prefetch("media", queryset=ServiceMedia.objects.filter(is_active=True)),
        )
        .distinct()
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
    """Every offerable service in one category — priced A1 work and askable M2 work alike."""
    return _offerable_services().filter(subcategory__category__slug=category_slug)


def public_services_by_id(service_ids: Iterable[UUID]) -> QuerySet[Service]:
    """Publishable cards for an explicit set of services — **priced ones only**.

    Its one caller is cart suggestions, and a suggestion is not a listing: it is an *add this to
    your visit* affordance. An M2 service cannot be added to a cart — no bookable variant, no
    price, and its action is a four-screen requirement flow rather than a quantity — so offering
    one here would put a card in front of a Customer that nothing can act on.

    So this deliberately keeps the rate gate that `_offerable_services` widened. The floor is the
    same as the catalog's — active service, active subcategory and category — and the ceiling is
    narrower on purpose: a service that is not fit to appear in the catalog is not fit to appear as
    a suggestion, but the reverse does not follow.
    """
    ids = list(service_ids)
    if not ids:
        return Service.objects.none()
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
            id__in=ids,
            status=Service.Status.ACTIVE,
            subcategory__is_active=True,
            subcategory__category__is_active=True,
            has_current_rate=True,
        )
        .select_related("subcategory", "subcategory__category")
        .prefetch_related(
            Prefetch("variants", queryset=_public_variants(), to_attr="public_variants"),
            Prefetch(
                "variants",
                queryset=_requirement_variants(),
                to_attr="requirement_variants",
            ),
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
            Prefetch(
                "variants",
                queryset=_requirement_variants(),
                to_attr="requirement_variants",
            ),
            Prefetch("policies", queryset=ServicePolicy.objects.filter(is_active=True)),
            Prefetch("media", queryset=ServiceMedia.objects.filter(is_active=True)),
        )
    )
    service = get_object_or_404(services, slug=service_slug)
    public = cast(_PublicService, cast(object, service))
    if not public.public_variants and not public.requirement_variants:
        # Neither priceable nor askable. The original rule was `not public_variants` alone, which
        # is right for A1 — an active service without an effective rate must not appear bookable —
        # and made every M2 service page a `404`, because an A3 or A5 service has no rate at all.
        raise NotFound("Service is not currently bookable.")
    return service
