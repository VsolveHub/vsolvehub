"""Bounded Partner read services."""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Prefetch, Q, QuerySet
from django.utils import timezone

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerLocation,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)


@dataclass(frozen=True, slots=True)
class PartnerPresenceState:
    is_online: bool
    session_id: uuid.UUID | None


@dataclass(frozen=True, slots=True)
class InstantMatchingPresence:
    session_id: uuid.UUID
    service_area_id: uuid.UUID
    latitude: Decimal
    longitude: Decimal
    accuracy_m: int
    captured_at: datetime
    age_seconds: int


def applicant_service_areas() -> QuerySet[ServiceArea]:
    return ServiceArea.objects.filter(
        is_active=True,
        is_accepting_partners=True,
    ).only("id", "slug", "name", "timezone", "is_accepting_partners")


def applicant_skills() -> QuerySet[Skill]:
    return Skill.objects.filter(is_active=True).only("code", "name", "description")


def required_partner_consent_documents() -> QuerySet[PartnerConsentDocument]:
    return PartnerConsentDocument.objects.filter(
        is_current=True,
        is_required_for_submission=True,
        published_at__lte=timezone.now(),
        retired_at__isnull=True,
    ).only(
        "purpose",
        "title",
        "document_version",
        "document_url",
        "is_required_for_submission",
        "published_at",
    )


def partner_application_for_user(user: User) -> PartnerApplication | None:
    return (
        PartnerApplication.objects.filter(partner__user=user)
        .select_related("partner", "reviewed_by")
        .prefetch_related(
            "partner__skill_links__skill",
            "partner__service_links__variant",
            "partner__service_area_links__service_area",
            "partner__consents",
            Prefetch(
                "documents",
                queryset=PartnerDocument.objects.order_by("kind", "-version"),
            ),
            "transitions",
        )
        .first()
    )


def partner_profile_for_user(user: User) -> PartnerProfile | None:
    return PartnerProfile.objects.filter(user=user).select_related("application").first()


def operations_partner_application_queue(
    *,
    actor: User,
    status: str | None,
    assigned_to_me: bool,
    unassigned: bool,
) -> QuerySet[PartnerApplication]:
    queryset = PartnerApplication.objects.select_related(
        "partner",
        "review_assigned_to",
    )
    if status is None:
        queryset = queryset.filter(
            status__in=(
                PartnerApplication.Status.SUBMITTED,
                PartnerApplication.Status.UNDER_REVIEW,
                PartnerApplication.Status.CHANGES_REQUIRED,
            ),
        )
    else:
        queryset = queryset.filter(status=status)
    if assigned_to_me:
        queryset = queryset.filter(review_assigned_to=actor)
    if unassigned:
        queryset = queryset.filter(review_assigned_to__isnull=True)
    return queryset.order_by("submitted_at", "id")


def operations_partner_directory(
    *,
    status: str | None = None,
    skill_codes: Sequence[str] = (),
) -> QuerySet[PartnerProfile]:
    """Every Partner on the platform, filtered the way a manager browses them.

    Distinct from `operations_partner_application_queue`, which is a *worklist*: it shows the
    handful of applications awaiting a decision, defaults to the three in-review statuses and is
    ordered by how long somebody has been waiting. This is a *directory* — it shows approved,
    suspended and offboarded Partners too, because "who works for us" is a different question
    from "what needs reviewing today", and answering it from the review queue would hide every
    Partner already approved.

    Skills filter as a union rather than an intersection: picking Electrical and Plumbing in a
    directory means "show me either", which is how a person reads a multi-select. The
    intersection reading belongs to dispatch, where a visit genuinely needs every skill at once
    (`carts.availability._eligible_partners`), and the two must not be confused — this one is
    browsing, that one is staffing.

    Two queries regardless of page size: the page itself, and one prefetch for the skill chips.
    Counts are annotated rather than prefetched, so a Partner serving forty areas costs the same
    as one serving one.
    """

    queryset = (
        PartnerProfile.objects.select_related("application", "user")
        .prefetch_related(
            Prefetch(
                "skill_links",
                queryset=PartnerSkill.objects.filter(is_active=True).select_related("skill"),
            ),
        )
        .annotate(
            service_count=Count(
                "service_links", filter=Q(service_links__is_active=True), distinct=True
            ),
            service_area_count=Count(
                "service_area_links", filter=Q(service_area_links__is_active=True), distinct=True
            ),
        )
    )
    if status is not None:
        queryset = queryset.filter(application__status=status)
    if skill_codes:
        queryset = queryset.filter(
            skill_links__skill__code__in=list(skill_codes),
            skill_links__is_active=True,
        )
    # `distinct` because the skill join multiplies rows for a Partner holding several of the
    # filtered skills — without it the directory lists the same person once per matching skill.
    return queryset.distinct().order_by("display_name", "id")


def operations_partner_detail(partner_id: uuid.UUID) -> PartnerProfile | None:
    """One Partner, with everything the management screen shows and nothing it does not.

    Document *rows* are prefetched for their kind and status; their contents are not, and this
    projection deliberately publishes no URL for them. Revealing a document stays behind
    `OperationsPartnerDocumentAccessView`, which mints a short-lived link and records who looked
    — a management screen that rendered them inline would route around that audit entirely.
    """

    return (
        PartnerProfile.objects.filter(id=partner_id)
        .select_related("application", "application__reviewed_by", "user")
        .prefetch_related(
            Prefetch(
                "skill_links",
                queryset=PartnerSkill.objects.filter(is_active=True).select_related("skill"),
            ),
            Prefetch(
                "service_links",
                queryset=PartnerService.objects.filter(is_active=True).select_related(
                    "variant__service"
                ),
            ),
            Prefetch(
                "service_area_links",
                queryset=PartnerServiceArea.objects.filter(is_active=True).select_related(
                    "service_area"
                ),
            ),
            "application__documents",
            "application__transitions",
        )
        .first()
    )


def operations_partner_application_detail(
    application_id: uuid.UUID,
) -> PartnerApplication | None:
    return (
        PartnerApplication.objects.filter(id=application_id)
        .select_related("partner", "reviewed_by", "review_assigned_to")
        .prefetch_related(
            "partner__skill_links__skill",
            "partner__service_links__variant",
            "partner__service_area_links__service_area",
            "partner__consents",
            Prefetch(
                "documents",
                queryset=PartnerDocument.objects.order_by("kind", "-version"),
            ),
            "transitions",
        )
        .first()
    )


def partner_schedule(
    partner: PartnerProfile,
) -> tuple[
    QuerySet[PartnerAvailabilityRule],
    QuerySet[PartnerAvailabilityException],
]:
    rules = PartnerAvailabilityRule.objects.filter(partner=partner).select_related("service_area")
    exceptions = PartnerAvailabilityException.objects.filter(partner=partner).select_related(
        "service_area",
    )
    return rules, exceptions


def partner_available_during(
    *,
    partner: PartnerProfile,
    service_area: ServiceArea,
    starts_at: datetime,
    duration_minutes: int,
) -> bool:
    """Return explicit schedule availability for one occupied range; empty means unavailable."""

    zone = ZoneInfo(service_area.timezone)
    local_start = starts_at.astimezone(zone)
    local_end = local_start + timedelta(minutes=duration_minutes)
    exception = PartnerAvailabilityException.objects.filter(
        partner=partner,
        service_area=service_area,
        date=local_start.date(),
    ).first()
    if exception is not None:
        if not exception.is_available or exception.starts_at is None or exception.ends_at is None:
            return False
        return availability_window_contains(
            local_start,
            local_end,
            starts_at=exception.starts_at,
            ends_at=exception.ends_at,
            ends_next_day=exception.ends_next_day,
        )
    rules = PartnerAvailabilityRule.objects.filter(
        partner=partner,
        service_area=service_area,
        weekday=local_start.weekday(),
        is_active=True,
    )
    return any(
        availability_window_contains(
            local_start,
            local_end,
            starts_at=rule.starts_at,
            ends_at=rule.ends_at,
            ends_next_day=rule.ends_next_day,
        )
        for rule in rules
    )


def availability_window_contains(
    local_start: datetime,
    local_end: datetime,
    *,
    starts_at: time,
    ends_at: time,
    ends_next_day: bool,
) -> bool:
    opens = datetime.combine(local_start.date(), starts_at, tzinfo=local_start.tzinfo)
    closes_date = local_start.date() + timedelta(days=1) if ends_next_day else local_start.date()
    closes = datetime.combine(closes_date, ends_at, tzinfo=local_start.tzinfo)
    return opens <= local_start and local_end <= closes


def presence_cache_key(partner_id: uuid.UUID) -> str:
    return f"partner:presence:{partner_id}"


def partner_presence_state(partner: PartnerProfile) -> PartnerPresenceState:
    try:
        payload = cache.get(presence_cache_key(partner.id))
    except Exception:
        return PartnerPresenceState(False, None)
    if not isinstance(payload, dict):
        return PartnerPresenceState(False, None)
    raw_session_id = payload.get("session_id")
    try:
        session_id = uuid.UUID(str(raw_session_id))
    except (TypeError, ValueError):
        return PartnerPresenceState(False, None)
    return PartnerPresenceState(True, session_id)


def instant_matching_presence(
    partner: PartnerProfile,
    *,
    at: datetime | None = None,
) -> InstantMatchingPresence | None:
    """Return dispatch-safe presence or fail closed without using persisted presence fallback."""

    try:
        payload = cache.get(presence_cache_key(partner.id))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    try:
        session_id = uuid.UUID(str(payload["session_id"]))
        service_area_id = uuid.UUID(str(payload["service_area_id"]))
    except (KeyError, TypeError, ValueError):
        return None

    location = PartnerLocation.objects.filter(partner=partner).first()
    if (
        location is None
        or location.service_area_id != service_area_id
        or location.accuracy_m > settings.PARTNER_LOCATION_MAX_ACCURACY_METERS
    ):
        return None
    now = at or timezone.now()
    age = now - location.captured_at
    if age < timedelta(0) or age > timedelta(seconds=settings.PARTNER_LOCATION_STALE_SECONDS):
        return None
    return InstantMatchingPresence(
        session_id=session_id,
        service_area_id=service_area_id,
        latitude=location.latitude,
        longitude=location.longitude,
        accuracy_m=location.accuracy_m,
        captured_at=location.captured_at,
        age_seconds=int(age.total_seconds()),
    )
