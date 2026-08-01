"""Bounded Partner read services."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db.models import Prefetch, QuerySet
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
