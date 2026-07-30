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
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerDocument,
    PartnerLocation,
    PartnerProfile,
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
