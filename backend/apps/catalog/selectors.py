"""Optimized public catalog reads."""

from collections.abc import Iterable
from typing import Protocol, cast
from uuid import UUID

from django.db import models
from django.db.models import Count, Exists, OuterRef, Prefetch, Q, QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.catalog.models import (
    A10VariantConfiguration,
    Category,
    M2VariantConfiguration,
    PromoBanner,
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
    listing_variants: list[ServiceVariant]


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


def _listing_apply_variants() -> QuerySet[ServiceVariant]:
    """A10 hiring-partner apply row(s) — not the full Career role taxonomy.

    Partner onboarding "Your trades" needs at least one selectable service under
    Career/Jobs. Those variants are not A1-priced and not M2-askable, so they
    were invisible to `_offerable_services`. Only the apply-facing skill code
    `career-jobs` is published here; the hundreds of role taxonomy listings stay
    out of the public catalog.
    """
    return ServiceVariant.objects.filter(
        is_active=True,
        booking_archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        required_skill_code="career-jobs",
        a10_configurations__status=A10VariantConfiguration.Status.ACTIVE,
    ).distinct()


def _offerable_service_base() -> QuerySet[Service]:
    """Every service a Customer may be shown, under one rule for both lifecycles.

    **A service is offerable when it can be priced *or* when it can be asked about
    *or* when it is the A10 hiring-partner apply row.** Until M2, the only gate was
    `has_current_rate`. M2 added `accepts_requirements`. A10 Career/Jobs has neither
    a rate nor an M2 configuration — without `accepts_listings`, Partner apply showed
    Career with "No bookable job types" despite an ACTIVE hiring variant.
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
    listing_variant = ServiceVariant.objects.filter(
        service_id=OuterRef("pk"),
        is_active=True,
        booking_archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        required_skill_code="career-jobs",
        a10_configurations__status=A10VariantConfiguration.Status.ACTIVE,
    )
    return (
        Service.objects.annotate(
            has_current_rate=Exists(current_rate),
            accepts_requirements=Exists(requirement_variant),
            accepts_listings=Exists(listing_variant),
        )
        .filter(
            models.Q(has_current_rate=True)
            | models.Q(accepts_requirements=True)
            | models.Q(accepts_listings=True),
            status=Service.Status.ACTIVE,
            subcategory__is_active=True,
            subcategory__category__is_active=True,
        )
        .select_related("subcategory", "subcategory__category")
        .distinct()
    )


def _offerable_services() -> QuerySet[Service]:
    """Offerable services hydrated for the existing rich card/detail serializers."""

    return (
        _offerable_service_base()
        .prefetch_related(
            Prefetch("variants", queryset=_public_variants(), to_attr="public_variants"),
            Prefetch(
                "variants",
                queryset=_requirement_variants(),
                to_attr="requirement_variants",
            ),
            Prefetch(
                "variants",
                queryset=_listing_apply_variants(),
                to_attr="listing_variants",
            ),
            Prefetch("media", queryset=ServiceMedia.objects.filter(is_active=True)),
        )
        .order_by("display_order", "name")
    )


def public_categories() -> QuerySet[Category]:
    return Category.objects.filter(is_active=True).prefetch_related(
        Prefetch(
            "subcategories",
            # `service_count` feeds the tile grid. ACTIVE services, not the stricter
            # offerability gate — a tile count is merchandising, and the offerable
            # check would drag per-variant rate joins into the cheapest read we have.
            queryset=Subcategory.objects.filter(is_active=True)
            .annotate(
                service_count=Count(
                    "services",
                    filter=Q(services__status=Service.Status.ACTIVE),
                )
            )
            .order_by("display_order", "name"),
        ),
    )


def active_promo_banners(category_slug: str | None) -> QuerySet[PromoBanner]:
    """Banners live right now: switched on, inside their window, under an active category.

    Without a category slug only the site-wide banners (no category) are returned; with one,
    the site-wide banners plus that category's own.
    """

    now = timezone.now()
    banners = PromoBanner.objects.filter(is_active=True).filter(
        Q(starts_at__isnull=True) | Q(starts_at__lte=now),
        Q(ends_at__isnull=True) | Q(ends_at__gt=now),
    )
    in_scope = Q(category__isnull=True)
    if category_slug:
        in_scope |= Q(category__slug=category_slug, category__is_active=True)
    return banners.filter(in_scope).select_related("category")


def public_services_for_category(category_slug: str) -> QuerySet[Service]:
    """Every offerable service in one category — priced A1 work and askable M2 work alike."""
    return _offerable_services().filter(subcategory__category__slug=category_slug)


def public_service_index() -> QuerySet[Service]:
    """Every offerable service in deterministic catalog order, without card-only payload work.

    This is the icon catalogue's one-request read. It deliberately skips variant rates, questions
    and media: none are rendered in an icon-and-name tile, and prefetching them would turn a small
    discovery response back into the rich category-card endpoint it replaces.
    """

    return _offerable_service_base().order_by(
        "subcategory__category__display_order",
        "subcategory__category__name",
        "subcategory__category__slug",
        "subcategory__display_order",
        "subcategory__name",
        "subcategory__slug",
        "display_order",
        "name",
        "slug",
    )


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
            Prefetch(
                "variants",
                queryset=_listing_apply_variants(),
                to_attr="listing_variants",
            ),
            Prefetch("policies", queryset=ServicePolicy.objects.filter(is_active=True)),
            Prefetch("media", queryset=ServiceMedia.objects.filter(is_active=True)),
        )
    )
    service = get_object_or_404(services, slug=service_slug)
    public = cast(_PublicService, cast(object, service))
    if (
        not public.public_variants
        and not public.requirement_variants
        and not getattr(public, "listing_variants", None)
    ):
        # Neither priceable, askable, nor A10 hiring-apply. The original rule was
        # `not public_variants` alone; M2 added requirement_variants; A10 hiring apply
        # needs listing_variants or Partner "Your trades" stays empty under Career.
        raise NotFound("Service is not currently bookable.")
    return service
