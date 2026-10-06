from typing import Any

from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from apps.listings.models import Listing


def public_listings(  # noqa: PLR0912
    filters: dict[str, Any] | None = None,
) -> QuerySet[Listing]:

    filters = filters or {}
    qs = (
        Listing.objects.select_related("poster", "variant", "variant__service")
        .prefetch_related("variant__a10_configurations")
        .annotate(
            application_count=Count(
                "applications",
                filter=~Q(applications__status__in=("WITHDRAWN", "EXPIRED")),
            )
        )
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
    for key in ("employment_type", "work_mode", "experience"):
        value = str(filters.get(key) or "").strip()
        if value:
            qs = qs.filter(**{f"structured_fields__{key}__icontains": value})
    # Jobs posted with the quick form carry these as their own fields.
    for key in ("job_type", "experience_band", "job_category", "city"):
        value = str(filters.get(key) or "").strip()
        if value:
            qs = qs.filter(**{f"{key}__iexact": value})
    min_salary = filters.get("min_salary")
    if min_salary and str(min_salary).isdigit():
        qs = qs.filter(
            Q(salary_max_paise__gte=int(min_salary)) | Q(salary_min_paise__gte=int(min_salary))
        )
    max_salary = filters.get("max_salary")
    if max_salary and str(max_salary).isdigit():
        qs = qs.filter(salary_min_paise__lte=int(max_salary))
    salary_band = str(filters.get("salary_band") or "").strip()
    if salary_band:
        qs = qs.filter(
            Q(structured_fields__salary_band=salary_band)
            | Q(structured_fields__salary_range=salary_band)
        )
    sort = str(filters.get("sort") or "latest")
    if sort == "salary_high":
        qs = qs.order_by("-is_premium", "-salary_max_paise", "-published_at", "-created_at")
    elif sort == "salary_low":
        qs = qs.order_by("-is_premium", "salary_min_paise", "-published_at", "-created_at")
    else:
        qs = qs.order_by("-is_premium", "-published_at", "-created_at")
    return qs
