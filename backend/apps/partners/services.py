"""Transactional Partner commands and Redis-first presence coordination."""

import re
import uuid
from collections.abc import Iterable, Sequence
from datetime import date, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from itertools import pairwise
from typing import NotRequired, TypedDict, cast

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Service, ServiceVariant
from apps.identity.hashing import keyed_hash
from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.exceptions import (
    PartnerApplicationIncompleteError,
    PartnerApplicationNotFoundError,
    PartnerEligibilityError,
    PartnerPresenceError,
    PartnerScheduleError,
    PartnerTransitionError,
    PartnerVersionConflictError,
)
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerConsent,
    PartnerDocument,
    PartnerLocation,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)
from apps.partners.selectors import presence_cache_key

SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
COORDINATE_QUANTUM = Decimal("0.001")
MINUTES_PER_DAY = 24 * 60


class ScheduleRuleInput(TypedDict):
    service_area_id: uuid.UUID
    weekday: int
    starts_at: time
    ends_at: time
    ends_next_day: NotRequired[bool]


class ScheduleExceptionInput(TypedDict):
    service_area_id: uuid.UUID
    date: date
    is_available: bool
    starts_at: NotRequired[time | None]
    ends_at: NotRequired[time | None]
    ends_next_day: NotRequired[bool]
    reason: NotRequired[str]


def _application_for_update(user: User) -> PartnerApplication:
    application = (
        PartnerApplication.objects.select_for_update()
        .select_related("partner")
        .filter(partner__user=user)
        .first()
    )
    if application is None:
        raise PartnerApplicationNotFoundError
    return application


def _assert_version(application: PartnerApplication, expected_version: int) -> None:
    if application.version != expected_version:
        raise PartnerVersionConflictError


def _ensure_partner_role(user: User) -> None:
    role, _created = Role.objects.get_or_create(
        code="partner",
        defaults={"name": "Partner", "is_system": True},
    )
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)


def _record_transition(
    *,
    application: PartnerApplication,
    from_status: str,
    actor: User,
    reason_code: str,
    reason: str = "",
) -> None:
    PartnerApplicationTransition.objects.create(
        application=application,
        from_status=from_status,
        to_status=application.status,
        actor=actor,
        reason_code=reason_code,
        reason=reason,
        application_version=application.version,
    )


def _set_active_skills(*, partner: PartnerProfile, skills: Iterable[Skill]) -> None:
    selected = list(skills)
    PartnerSkill.objects.filter(partner=partner).exclude(
        skill_id__in=[skill.id for skill in selected],
    ).update(is_active=False)
    for skill in selected:
        PartnerSkill.objects.update_or_create(
            partner=partner,
            skill=skill,
            defaults={"is_active": True},
        )


def _set_active_services(
    *,
    partner: PartnerProfile,
    variants: Iterable[ServiceVariant],
) -> None:
    selected = list(variants)
    PartnerService.objects.filter(partner=partner).exclude(
        variant_id__in=[variant.id for variant in selected],
    ).update(is_active=False)
    for variant in selected:
        PartnerService.objects.update_or_create(
            partner=partner,
            variant=variant,
            defaults={"is_active": True},
        )


def _set_active_service_areas(
    *,
    partner: PartnerProfile,
    service_areas: Iterable[ServiceArea],
) -> None:
    selected = list(service_areas)
    PartnerServiceArea.objects.filter(partner=partner).exclude(
        service_area_id__in=[area.id for area in selected],
    ).update(is_active=False)
    for area in selected:
        PartnerServiceArea.objects.update_or_create(
            partner=partner,
            service_area=area,
            defaults={"is_active": True},
        )


def _validate_service_configuration(
    *,
    skills: Sequence[Skill],
    variants: Sequence[ServiceVariant],
    service_areas: Sequence[ServiceArea],
) -> None:
    skill_codes = {skill.code for skill in skills}
    missing_skills = sorted(
        {variant.required_skill_code for variant in variants} - skill_codes,
    )
    if missing_skills:
        raise PartnerApplicationIncompleteError(
            f"Select the required skills for: {', '.join(missing_skills)}.",
        )

    area_ids = {area.id for area in service_areas}
    for variant in variants:
        if not ServiceAreaService.objects.filter(
            variant=variant,
            service_area_id__in=area_ids,
            is_active=True,
            service_area__is_active=True,
        ).exists():
            raise PartnerApplicationIncompleteError(
                f"{variant.name} is not enabled in any selected service area.",
            )


@transaction.atomic
def update_partner_application(
    *,
    user: User,
    expected_version: int | None,
    display_name: str,
    biography: str,
    experience_years: int,
    skill_codes: Sequence[str],
    service_variant_ids: Sequence[uuid.UUID],
    service_area_ids: Sequence[uuid.UUID],
    consents: Sequence[dict[str, str]],
    request_ip: str,
    device_identifier: str,
) -> PartnerApplication:
    partner = PartnerProfile.objects.select_for_update().filter(user=user).first()
    if partner is None:
        if expected_version is not None:
            raise PartnerVersionConflictError
        partner = PartnerProfile.objects.create(
            user=user,
            display_name=display_name,
            biography=biography,
            experience_years=experience_years,
        )
        application = PartnerApplication.objects.create(partner=partner)
        _ensure_partner_role(user)
        _record_transition(
            application=application,
            from_status="",
            actor=user,
            reason_code="application_created",
        )
    else:
        application = PartnerApplication.objects.select_for_update().get(partner=partner)
        if expected_version is None:
            raise PartnerVersionConflictError
        _assert_version(application, expected_version)
        if application.status not in {
            PartnerApplication.Status.DRAFT,
            PartnerApplication.Status.CHANGES_REQUIRED,
        }:
            raise PartnerTransitionError("This application cannot be edited in its current state.")

    skills = list(Skill.objects.filter(code__in=skill_codes, is_active=True).order_by("code"))
    if len(skills) != len(set(skill_codes)):
        raise PartnerApplicationIncompleteError("One or more selected skills are unavailable.")
    variants = list(
        ServiceVariant.objects.filter(
            id__in=service_variant_ids,
            is_active=True,
            service__status=Service.Status.ACTIVE,
        ).select_related("service"),
    )
    if len(variants) != len(set(service_variant_ids)):
        raise PartnerApplicationIncompleteError("One or more selected services are unavailable.")
    service_areas = list(
        ServiceArea.objects.filter(id__in=service_area_ids, is_active=True),
    )
    if len(service_areas) != len(set(service_area_ids)):
        raise PartnerApplicationIncompleteError(
            "One or more selected service areas are unavailable."
        )
    _validate_service_configuration(
        skills=skills,
        variants=variants,
        service_areas=service_areas,
    )

    partner.display_name = display_name
    partner.biography = biography
    partner.experience_years = experience_years
    partner.save(
        update_fields=("display_name", "biography", "experience_years", "updated_at"),
    )
    _set_active_skills(partner=partner, skills=skills)
    _set_active_services(partner=partner, variants=variants)
    _set_active_service_areas(partner=partner, service_areas=service_areas)

    request_ip_hash = keyed_hash(request_ip)
    device_hash = keyed_hash(device_identifier) if device_identifier else ""
    for consent in consents:
        PartnerConsent.objects.get_or_create(
            partner=partner,
            purpose=consent["purpose"],
            document_version=consent["document_version"],
            defaults={
                "request_ip_hash": request_ip_hash,
                "device_hash": device_hash,
            },
        )

    if application.pk:
        application.version += 1
        application.save(update_fields=("version", "updated_at"))
    return application


@transaction.atomic
def register_partner_document(
    *,
    user: User,
    expected_version: int,
    kind: str,
    object_key: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
) -> PartnerDocument:
    application = _application_for_update(user)
    _assert_version(application, expected_version)
    if application.status not in {
        PartnerApplication.Status.DRAFT,
        PartnerApplication.Status.CHANGES_REQUIRED,
    }:
        raise PartnerTransitionError(
            "Documents cannot be changed in the current application state."
        )
    expected_prefix = f"partners/{application.partner_id}/"
    if not object_key.startswith(expected_prefix):
        raise PartnerApplicationIncompleteError(
            "The uploaded document does not belong to this Partner."
        )
    if not SHA256_PATTERN.fullmatch(sha256):
        raise PartnerApplicationIncompleteError("The document checksum is invalid.")

    previous = (
        PartnerDocument.objects.select_for_update()
        .filter(application=application, kind=kind)
        .order_by("-version")
        .first()
    )
    next_version = (previous.version if previous else 0) + 1
    document = PartnerDocument.objects.create(
        application=application,
        kind=kind,
        version=next_version,
        object_key=object_key,
        content_type=content_type,
        size_bytes=size_bytes,
        sha256=sha256,
        replaces=previous,
    )
    application.version += 1
    application.save(update_fields=("version", "updated_at"))
    return document


def _latest_required_documents_are_approved(application: PartnerApplication) -> bool:
    required_kinds = tuple(settings.PARTNER_REQUIRED_DOCUMENT_KINDS)
    for kind in required_kinds:
        latest = (
            PartnerDocument.objects.filter(application=application, kind=kind)
            .order_by("-version")
            .first()
        )
        if latest is None or latest.status != PartnerDocument.Status.APPROVED:
            return False
    return True


def _required_consents_exist(partner: PartnerProfile) -> bool:
    active_purposes = set(
        PartnerConsent.objects.filter(partner=partner, withdrawn_at__isnull=True).values_list(
            "purpose",
            flat=True,
        ),
    )
    return set(settings.PARTNER_REQUIRED_CONSENT_PURPOSES).issubset(active_purposes)


def _base_application_is_complete(application: PartnerApplication) -> bool:
    partner = application.partner
    return all(
        (
            bool(partner.display_name.strip()),
            PartnerSkill.objects.filter(partner=partner, is_active=True).exists(),
            PartnerService.objects.filter(partner=partner, is_active=True).exists(),
            PartnerServiceArea.objects.filter(partner=partner, is_active=True).exists(),
            _required_consents_exist(partner),
        ),
    )


@transaction.atomic
def submit_partner_application(
    *,
    user: User,
    expected_version: int,
) -> PartnerApplication:
    application = _application_for_update(user)
    _assert_version(application, expected_version)
    if application.status not in {
        PartnerApplication.Status.DRAFT,
        PartnerApplication.Status.CHANGES_REQUIRED,
    }:
        raise PartnerTransitionError("This application cannot be submitted in its current state.")
    if not _base_application_is_complete(application):
        raise PartnerApplicationIncompleteError(
            "Complete your profile, services, areas, skills, and required consents "
            "before submitting.",
        )
    required_kinds = tuple(settings.PARTNER_REQUIRED_DOCUMENT_KINDS)
    if any(
        not PartnerDocument.objects.filter(application=application, kind=kind).exists()
        for kind in required_kinds
    ):
        raise PartnerApplicationIncompleteError(
            "Upload every required identity document before submitting.",
        )

    previous_status = application.status
    application.status = PartnerApplication.Status.SUBMITTED
    application.submitted_at = timezone.now()
    application.change_request_message = ""
    application.version += 1
    application.save(
        update_fields=(
            "status",
            "submitted_at",
            "change_request_message",
            "version",
            "updated_at",
        ),
    )
    _record_transition(
        application=application,
        from_status=previous_status,
        actor=user,
        reason_code="application_submitted",
    )
    return application


@transaction.atomic
def review_partner_document(
    *,
    reviewer: User,
    document_id: uuid.UUID,
    decision: str,
    reason: str,
) -> PartnerDocument:
    document = (
        PartnerDocument.objects.select_for_update()
        .select_related("application")
        .filter(id=document_id)
        .first()
    )
    if document is None:
        raise PartnerApplicationNotFoundError
    if document.status != PartnerDocument.Status.PENDING:
        raise PartnerTransitionError("This document has already been reviewed.")
    if decision not in {PartnerDocument.Status.APPROVED, PartnerDocument.Status.REJECTED}:
        raise PartnerTransitionError("Choose an approved or rejected document decision.")
    if decision == PartnerDocument.Status.REJECTED and not reason.strip():
        raise PartnerTransitionError("A rejection reason is required.")

    if decision == PartnerDocument.Status.APPROVED:
        PartnerDocument.objects.filter(
            application=document.application,
            kind=document.kind,
            status=PartnerDocument.Status.APPROVED,
        ).exclude(pk=document.pk).update(status=PartnerDocument.Status.SUPERSEDED)
    document.status = decision
    document.reviewed_by = reviewer
    document.reviewed_at = timezone.now()
    document.review_reason = reason
    document.save(
        update_fields=("status", "reviewed_by", "reviewed_at", "review_reason"),
    )
    PartnerApplication.objects.filter(pk=document.application_id).update(
        version=document.application.version + 1,
        updated_at=timezone.now(),
    )
    return document


@transaction.atomic
def transition_partner_application(
    *,
    reviewer: User,
    application_id: uuid.UUID,
    expected_version: int,
    target_status: str,
    reason: str,
) -> PartnerApplication:
    application = (
        PartnerApplication.objects.select_for_update()
        .select_related("partner")
        .filter(id=application_id)
        .first()
    )
    if application is None:
        raise PartnerApplicationNotFoundError
    _assert_version(application, expected_version)
    allowed: dict[str, set[str]] = {
        PartnerApplication.Status.SUBMITTED: {PartnerApplication.Status.UNDER_REVIEW},
        PartnerApplication.Status.UNDER_REVIEW: {
            PartnerApplication.Status.CHANGES_REQUIRED,
            PartnerApplication.Status.APPROVED,
        },
        PartnerApplication.Status.APPROVED: {
            PartnerApplication.Status.SUSPENDED,
            PartnerApplication.Status.OFFBOARDED,
        },
        PartnerApplication.Status.SUSPENDED: {
            PartnerApplication.Status.APPROVED,
            PartnerApplication.Status.OFFBOARDED,
        },
    }
    if target_status not in allowed.get(application.status, set()):
        raise PartnerTransitionError(
            f"Cannot move an application from {application.status} to {target_status}.",
        )
    if target_status == PartnerApplication.Status.CHANGES_REQUIRED and not reason.strip():
        raise PartnerTransitionError("Explain which changes the Partner must make.")
    if (
        target_status
        in {
            PartnerApplication.Status.SUSPENDED,
            PartnerApplication.Status.OFFBOARDED,
        }
        and not reason.strip()
    ):
        raise PartnerTransitionError("A reason is required for this action.")
    if target_status == PartnerApplication.Status.APPROVED:
        if not _base_application_is_complete(application):
            raise PartnerApplicationIncompleteError("The application is not complete.")
        if not _latest_required_documents_are_approved(application):
            raise PartnerApplicationIncompleteError(
                "Approve the latest required documents before approving this application.",
            )

    previous_status = application.status
    application.status = target_status
    application.reviewed_by = reviewer
    application.reviewed_at = timezone.now()
    application.change_request_message = (
        reason if target_status == PartnerApplication.Status.CHANGES_REQUIRED else ""
    )
    application.version += 1
    application.save(
        update_fields=(
            "status",
            "reviewed_by",
            "reviewed_at",
            "change_request_message",
            "version",
            "updated_at",
        ),
    )
    _record_transition(
        application=application,
        from_status=previous_status,
        actor=reviewer,
        reason_code=f"application_{target_status.lower()}",
        reason=reason,
    )
    if target_status in {
        PartnerApplication.Status.SUSPENDED,
        PartnerApplication.Status.OFFBOARDED,
    }:
        end_reason = (
            PartnerOnlineSession.EndReason.SUSPENDED
            if target_status == PartnerApplication.Status.SUSPENDED
            else PartnerOnlineSession.EndReason.OFFBOARDED
        )
        PartnerOnlineSession.objects.filter(
            partner=application.partner,
            ended_at__isnull=True,
        ).update(ended_at=timezone.now(), end_reason=end_reason)
        cache.delete(presence_cache_key(application.partner_id))
    return application


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _validate_schedule_rules(rules: Sequence[ScheduleRuleInput]) -> None:
    by_area: dict[uuid.UUID, list[tuple[int, int]]] = {}
    for rule in rules:
        weekday = rule["weekday"]
        starts_at = rule["starts_at"]
        ends_at = rule["ends_at"]
        if not isinstance(starts_at, time) or not isinstance(ends_at, time):
            raise PartnerScheduleError("Availability times are invalid.")
        start = weekday * MINUTES_PER_DAY + _minutes(starts_at)
        end = weekday * MINUTES_PER_DAY + _minutes(ends_at)
        if bool(rule.get("ends_next_day")):
            end += MINUTES_PER_DAY
        elif end <= start:
            raise PartnerScheduleError(
                "An availability window ending the next day must be marked explicitly.",
            )
        area_id = rule["service_area_id"]
        intervals = by_area.setdefault(area_id, [])
        intervals.append((start, end))

    week = 7 * MINUTES_PER_DAY
    for intervals in by_area.values():
        expanded = intervals + [
            (start + week, end + week) for start, end in intervals if start < MINUTES_PER_DAY
        ]
        expanded.sort()
        for previous, current in pairwise(expanded):
            if current[0] < previous[1]:
                raise PartnerScheduleError("Availability windows cannot overlap.")


@transaction.atomic
def replace_partner_schedule(
    *,
    user: User,
    rules: Sequence[ScheduleRuleInput],
    exceptions: Sequence[ScheduleExceptionInput],
) -> tuple[list[PartnerAvailabilityRule], list[PartnerAvailabilityException]]:
    application = _application_for_update(user)
    if application.status == PartnerApplication.Status.OFFBOARDED:
        raise PartnerTransitionError("An offboarded Partner cannot publish availability.")
    _validate_schedule_rules(rules)
    allowed_area_ids = set(
        PartnerServiceArea.objects.filter(
            partner=application.partner,
            is_active=True,
        ).values_list("service_area_id", flat=True),
    )
    requested_area_ids = {item["service_area_id"] for item in (*rules, *exceptions)}
    if not requested_area_ids.issubset(allowed_area_ids):
        raise PartnerScheduleError("Availability can use only approved application service areas.")

    PartnerAvailabilityRule.objects.filter(partner=application.partner).delete()
    PartnerAvailabilityException.objects.filter(partner=application.partner).delete()
    created_rules = PartnerAvailabilityRule.objects.bulk_create(
        [
            PartnerAvailabilityRule(
                partner=application.partner,
                service_area_id=item["service_area_id"],
                weekday=item["weekday"],
                starts_at=item["starts_at"],
                ends_at=item["ends_at"],
                ends_next_day=item.get("ends_next_day", False),
            )
            for item in rules
        ],
    )
    created_exceptions = PartnerAvailabilityException.objects.bulk_create(
        [
            PartnerAvailabilityException(
                partner=application.partner,
                service_area_id=item["service_area_id"],
                date=item["date"],
                is_available=item["is_available"],
                starts_at=item.get("starts_at"),
                ends_at=item.get("ends_at"),
                ends_next_day=item.get("ends_next_day", False),
                reason=item.get("reason", ""),
            )
            for item in exceptions
        ],
    )
    return created_rules, created_exceptions


def _assert_operational_eligibility(application: PartnerApplication) -> None:
    if application.status != PartnerApplication.Status.APPROVED:
        raise PartnerEligibilityError("Only an approved Partner can go online.")
    if not _base_application_is_complete(application):
        raise PartnerEligibilityError("Your Partner eligibility configuration is incomplete.")
    if not _latest_required_documents_are_approved(application):
        raise PartnerEligibilityError("Your required identity documents are not approved.")


def _presence_payload(session: PartnerOnlineSession) -> dict[str, str]:
    return {
        "session_id": str(session.id),
        "partner_id": str(session.partner_id),
        "service_area_id": str(session.service_area_id),
        "heartbeat_at": timezone.now().isoformat(),
    }


def _publish_presence(session: PartnerOnlineSession) -> None:
    try:
        cache.set(
            presence_cache_key(session.partner_id),
            _presence_payload(session),
            timeout=settings.PARTNER_PRESENCE_TTL_SECONDS,
        )
    except Exception as exc:
        raise PartnerPresenceError(
            "Instant availability is temporarily unavailable. Try again.",
            retryable=True,
        ) from exc


def go_online(
    *,
    user: User,
    service_area_id: uuid.UUID,
    latitude: Decimal,
    longitude: Decimal,
    accuracy_m: int,
    consent_version: str,
) -> PartnerOnlineSession:
    if accuracy_m > settings.PARTNER_LOCATION_MAX_ACCURACY_METERS:
        raise PartnerPresenceError("Location accuracy is too low. Move outside and try again.")
    now = timezone.now()
    with transaction.atomic():
        application = _application_for_update(user)
        _assert_operational_eligibility(application)
        area_link = (
            PartnerServiceArea.objects.select_related("service_area")
            .filter(
                partner=application.partner,
                service_area_id=service_area_id,
                is_active=True,
                service_area__is_active=True,
            )
            .first()
        )
        if area_link is None:
            raise PartnerPresenceError("Select one of your approved service areas.")

        current = (
            PartnerOnlineSession.objects.select_for_update()
            .filter(partner=application.partner, ended_at__isnull=True)
            .first()
        )
        if current is not None:
            current.ended_at = now
            current.end_reason = PartnerOnlineSession.EndReason.REPLACED
            current.save(update_fields=("ended_at", "end_reason"))

        PartnerLocation.objects.update_or_create(
            partner=application.partner,
            defaults={
                "service_area": area_link.service_area,
                "latitude": latitude.quantize(COORDINATE_QUANTUM, rounding=ROUND_HALF_UP),
                "longitude": longitude.quantize(COORDINATE_QUANTUM, rounding=ROUND_HALF_UP),
                "accuracy_m": accuracy_m,
                "purpose": PartnerLocation.Purpose.INSTANT_MATCHING,
                "consent_version": consent_version,
                "captured_at": now,
            },
        )
        session = PartnerOnlineSession.objects.create(
            partner=application.partner,
            service_area=area_link.service_area,
            started_at=now,
            last_persisted_heartbeat_at=now,
        )

    try:
        _publish_presence(session)
    except PartnerPresenceError:
        PartnerOnlineSession.objects.filter(pk=session.pk, ended_at__isnull=True).update(
            ended_at=timezone.now(),
            end_reason=PartnerOnlineSession.EndReason.PRESENCE_EXPIRED,
        )
        raise
    return session


def heartbeat_presence(
    *,
    user: User,
    session_id: uuid.UUID,
    latitude: Decimal | None = None,
    longitude: Decimal | None = None,
    accuracy_m: int | None = None,
    consent_version: str | None = None,
) -> PartnerOnlineSession:
    application = _application_for_update(user)
    _assert_operational_eligibility(application)
    session = (
        PartnerOnlineSession.objects.filter(
            id=session_id,
            partner=application.partner,
            ended_at__isnull=True,
        )
        .select_related("partner", "service_area")
        .first()
    )
    if session is None:
        raise PartnerPresenceError("This online session has expired. Go online again.")
    location_values = (latitude, longitude, accuracy_m, consent_version)
    if any(value is not None for value in location_values):
        if any(value is None for value in location_values):
            raise PartnerPresenceError("A location refresh is incomplete.")
        current_latitude = cast(Decimal, latitude)
        current_longitude = cast(Decimal, longitude)
        current_accuracy_m = cast(int, accuracy_m)
        current_consent_version = cast(str, consent_version)
        if current_accuracy_m > settings.PARTNER_LOCATION_MAX_ACCURACY_METERS:
            raise PartnerPresenceError("Location accuracy is too low. Move outside and try again.")
        now = timezone.now()
        PartnerLocation.objects.update_or_create(
            partner=application.partner,
            defaults={
                "service_area": session.service_area,
                "latitude": current_latitude.quantize(
                    COORDINATE_QUANTUM,
                    rounding=ROUND_HALF_UP,
                ),
                "longitude": current_longitude.quantize(
                    COORDINATE_QUANTUM,
                    rounding=ROUND_HALF_UP,
                ),
                "accuracy_m": current_accuracy_m,
                "purpose": PartnerLocation.Purpose.INSTANT_MATCHING,
                "consent_version": current_consent_version,
                "captured_at": now,
            },
        )
    _publish_presence(session)

    persistence_cutoff = timezone.now() - timedelta(
        seconds=settings.PARTNER_PRESENCE_DB_TOUCH_SECONDS,
    )
    if session.last_persisted_heartbeat_at <= persistence_cutoff:
        now = timezone.now()
        PartnerOnlineSession.objects.filter(
            pk=session.pk,
            ended_at__isnull=True,
            last_persisted_heartbeat_at__lte=persistence_cutoff,
        ).update(last_persisted_heartbeat_at=now)
        session.last_persisted_heartbeat_at = now
    return session


@transaction.atomic
def go_offline(*, user: User, session_id: uuid.UUID) -> None:
    application = _application_for_update(user)
    session = (
        PartnerOnlineSession.objects.select_for_update()
        .filter(id=session_id, partner=application.partner)
        .first()
    )
    if session is not None and session.ended_at is None:
        session.ended_at = timezone.now()
        session.end_reason = PartnerOnlineSession.EndReason.PARTNER_OFFLINE
        session.save(update_fields=("ended_at", "end_reason"))
    try:
        cache.delete(presence_cache_key(application.partner_id))
    except Exception as exc:
        raise PartnerPresenceError(
            "Offline status is saved, but presence cleanup is still retrying.",
            retryable=True,
        ) from exc


def expire_missing_presence_sessions(*, batch_size: int = 500) -> int:
    sessions = list(
        PartnerOnlineSession.objects.filter(ended_at__isnull=True)
        .order_by("started_at")
        .only("id", "partner_id")[:batch_size],
    )
    expired_ids: list[uuid.UUID] = []
    try:
        for session in sessions:
            payload = cache.get(presence_cache_key(session.partner_id))
            if not isinstance(payload, dict) or str(payload.get("session_id")) != str(session.id):
                expired_ids.append(session.id)
    except Exception as exc:
        raise PartnerPresenceError(
            "Presence reconciliation is temporarily unavailable.",
            retryable=True,
        ) from exc
    if not expired_ids:
        return 0
    return PartnerOnlineSession.objects.filter(
        id__in=expired_ids,
        ended_at__isnull=True,
    ).update(
        ended_at=timezone.now(),
        end_reason=PartnerOnlineSession.EndReason.PRESENCE_EXPIRED,
    )
