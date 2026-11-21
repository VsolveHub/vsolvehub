from typing import Any

from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from apps.listings.models import Listing
from apps.partners.models import EmployerProfile, PartnerApplication, PartnerBusinessProfile

#: What `employer_public_identity` reads. Add these to a listing query's `select_related` (with a
#: `listing__` prefix from an application) to keep a page of jobs at one query.
EMPLOYER_IDENTITY_RELATED = (
    "poster__business_profile",
    "poster__employer_profile",
    "poster__application",
)


def _locality(area: str, city: str) -> str:
    return ", ".join(part.strip() for part in (area, city) if part.strip())


def _short_person_name(display_name: str) -> str:
    """ "Priya Sharma" becomes "Priya S.": a candidate never sees an individual's full name."""
    parts = display_name.split()
    if len(parts) < 2:  # noqa: PLR2004
        return display_name.strip()
    return f"{parts[0]} {parts[-1][0].upper()}."


def employer_public_identity(poster: Any) -> dict[str, Any]:
    """Who a job is shown as hiring: the name, kind, place and whether Operations verified them.

    Never returns an individual's full name or any street address. `logo_url` is what storage
    gives (absolute in production); the serializer makes it absolute from the request in
    development. Read with `EMPLOYER_IDENTITY_RELATED` to stay at one query per page.
    """
    employer: EmployerProfile | None = getattr(poster, "employer_profile", None)
    business: PartnerBusinessProfile | None = getattr(poster, "business_profile", None)
    application = getattr(poster, "application", None)
    identity: dict[str, Any] = {
        "name": poster.display_name,
        "kind": "",
        "locality": "",
        "is_verified": (
            application is not None and application.status == PartnerApplication.Status.APPROVED
        ),
        "logo_url": "",
        "industry_label": "",
        "size_label": "",
    }
    hiring_as = employer.hiring_as if employer else ""
    business_name = (business.trade_name.strip() or business.legal_name.strip()) if business else ""

    if business is not None and business_name and hiring_as == EmployerProfile.HiringAs.BUSINESS:
        identity.update(
            name=business_name,
            kind="BUSINESS",
            locality=_locality(business.area, business.city),
            logo_url=business.logo.url if business.logo else "",
            industry_label=business.get_business_category_display(),
            size_label=business.get_company_size_display(),
        )
    elif employer is not None and hiring_as == EmployerProfile.HiringAs.INDIVIDUAL:
        identity.update(
            name=_short_person_name(poster.display_name),
            kind="INDIVIDUAL",
            locality=_locality(employer.area, employer.city),
        )
    elif business is not None and business_name and not hiring_as:
        identity.update(
            name=business_name,
            kind="BUSINESS",
            locality=_locality("", business.city),
            industry_label=business.get_business_category_display(),
        )
    return identity


def employer_name(poster: Any) -> str:
    """The name a job is shown under (see `employer_public_identity`)."""
    return str(employer_public_identity(poster)["name"])


def public_listings(  # noqa: PLR0912
    filters: dict[str, Any] | None = None,
) -> QuerySet[Listing]:

    filters = filters or {}
    qs = (
        Listing.objects.select_related(
            "poster", *EMPLOYER_IDENTITY_RELATED, "variant", "variant__service"
        )
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
            # Only while the employer's account is active: a suspension hides every post at once.
            poster__application__status=PartnerApplication.Status.APPROVED,
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
