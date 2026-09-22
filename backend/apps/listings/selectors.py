from typing import Any

from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from apps.listings.models import Listing


def public_listings(filters: dict[str, Any] | None = None) -> QuerySet[Listing]:
    filters = filters or {}
    qs = (
        Listing.objects.select_related("poster", "variant", "variant__service")
        .prefetch_related("variant__a10_configurations")
        .annotate(application_count=Count("applications"))
        .filter(
            status=Listing.Status.PUBLISHED,
            moderation_status=Listing.ModerationStatus.APPROVED,
            expires_at__gt=timezone.now(),
        )
    )
    query = str(filters.get("q") or "").strip()
    if query:
        qs = qs.filter(
            Q(title__icontains=query)
            | Q(description__icontains=query)
            | Q(location_text__icontains=query)
        )
    location = str(filters.get("location") or "").strip()
    if location:
        qs = qs.filter(location_text__icontains=location)
    service = str(filters.get("service") or "").strip()
    if service:
        qs = qs.filter(
            Q(variant__service__slug__icontains=service)
            | Q(variant__service__subcategory__slug__icontains=service)
            | Q(variant__service__subcategory__name__icontains=service)
        )
    for key, value in (filters.get("structured_fields") or {}).items():
        if value not in (None, ""):
            qs = qs.filter(**{f"structured_fields__{key}": value})
    return qs
