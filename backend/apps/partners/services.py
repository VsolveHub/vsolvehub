"""Transactional Partner commands and Redis-first presence coordination."""

import re
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from itertools import pairwise
from typing import NotRequired, TypedDict, cast

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.catalog.models import Service, ServiceVariant
from apps.identity.hashing import keyed_hash
from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.exceptions import (
    PartnerApplicationIncompleteError,
    PartnerApplicationNotFoundError,
    PartnerDocumentUploadError,
    PartnerEligibilityError,
    PartnerPresenceError,
    PartnerReviewOwnershipError,
    PartnerScheduleError,
    PartnerSelfReviewError,
    PartnerTransitionError,
    PartnerVersionConflictError,
)
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerDocumentUpload,
    PartnerLocation,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerScheduleChangeAudit,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)
from apps.partners.selectors import presence_cache_key
from apps.partners.storage import (
    DocumentStorage,
    DocumentStorageError,
    SignedReview,
    SignedUpload,
    get_document_storage,
)

SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
COORDINATE_QUANTUM = Decimal("0.001")
MINUTES_PER_DAY = 24 * 60
MAX_PARTNER_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024
DOCUMENT_CONTENT_TYPE_SUFFIXES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}


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


@dataclass(frozen=True, slots=True)
class PartnerDocumentUploadGrant:
    upload: PartnerDocumentUpload
    signed: SignedUpload


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
    require_complete: bool = False,
) -> None:
    if require_complete and (
        not skills
        or not variants
        or not service_areas
        or any(not skill.is_active for skill in skills)
        or any(
            not variant.is_active or variant.service.status != Service.Status.ACTIVE
            for variant in variants
        )
        or any(not area.is_active for area in service_areas)
    ):
        raise PartnerApplicationIncompleteError(
            "Select active skills, services, and service areas before submitting.",
        )

    skill_codes = {skill.code for skill in skills}
    missing_skills = sorted(
        {variant.required_skill_code for variant in variants} - skill_codes,
    )
    if missing_skills and (skills or require_complete):
        raise PartnerApplicationIncompleteError(
            f"Select the required skills for: {', '.join(missing_skills)}.",
        )

    area_ids = {area.id for area in service_areas}
    for variant in variants if service_areas or require_complete else ():
        if not ServiceAreaService.objects.filter(
            variant=variant,
            service_area_id__in=area_ids,
            is_active=True,
            service_area__is_active=True,
        ).exists():
            raise PartnerApplicationIncompleteError(
                f"{variant.name} is not enabled in any selected service area.",
            )


def _draft_application_for_update(
    *,
    user: User,
    expected_version: int | None,
    display_name: str | None,
    biography: str | None,
    experience_years: int | None,
) -> tuple[PartnerProfile, PartnerApplication]:
    partner = PartnerProfile.objects.select_for_update().filter(user=user).first()
    if partner is None:
        if expected_version is not None:
            raise PartnerVersionConflictError
        partner = PartnerProfile.objects.create(
            user=user,
            display_name=display_name or "",
            biography=biography or "",
            experience_years=experience_years if experience_years is not None else 0,
        )
        application = PartnerApplication.objects.create(partner=partner)
        _ensure_partner_role(user)
        _record_transition(
            application=application,
            from_status="",
            actor=user,
            reason_code="application_created",
        )
        return partner, application

    application = PartnerApplication.objects.select_for_update().get(partner=partner)
    if expected_version is None:
        raise PartnerVersionConflictError
    _assert_version(application, expected_version)
    if application.status not in {
        PartnerApplication.Status.DRAFT,
        PartnerApplication.Status.CHANGES_REQUIRED,
    }:
        raise PartnerTransitionError("This application cannot be edited in its current state.")
    return partner, application


def _resolve_application_skills(
    *, partner: PartnerProfile, skill_codes: Sequence[str] | None
) -> list[Skill]:
    if skill_codes is None:
        return list(
            Skill.objects.filter(
                partner_links__partner=partner,
                partner_links__is_active=True,
            ).order_by("code"),
        )
    skills = list(Skill.objects.filter(code__in=skill_codes, is_active=True).order_by("code"))
    if len(skills) != len(set(skill_codes)):
        raise PartnerApplicationIncompleteError("One or more selected skills are unavailable.")
    return skills


def _resolve_application_variants(
    *, partner: PartnerProfile, variant_ids: Sequence[uuid.UUID] | None
) -> list[ServiceVariant]:
    if variant_ids is None:
        return list(
            ServiceVariant.objects.filter(
                partner_links__partner=partner,
                partner_links__is_active=True,
            ).select_related("service"),
        )
    variants = list(
        ServiceVariant.objects.filter(
            id__in=variant_ids,
            is_active=True,
            service__status=Service.Status.ACTIVE,
        ).select_related("service"),
    )
    if len(variants) != len(set(variant_ids)):
        raise PartnerApplicationIncompleteError("One or more selected services are unavailable.")
    return variants


def _resolve_application_service_areas(
    *, partner: PartnerProfile, service_area_ids: Sequence[uuid.UUID] | None
) -> list[ServiceArea]:
    if service_area_ids is None:
        return list(
            ServiceArea.objects.filter(
                partner_links__partner=partner,
                partner_links__is_active=True,
            ),
        )
    service_areas = list(
        ServiceArea.objects.filter(
            id__in=service_area_ids,
            is_active=True,
            is_accepting_partners=True,
        ),
    )
    if len(service_areas) != len(set(service_area_ids)):
        raise PartnerApplicationIncompleteError(
            "One or more selected service areas are unavailable.",
        )
    return service_areas


def _update_partner_profile(
    *,
    partner: PartnerProfile,
    display_name: str | None,
    biography: str | None,
    experience_years: int | None,
) -> None:
    updated_fields: list[str] = []
    for field, value in (
        ("display_name", display_name),
        ("biography", biography),
        ("experience_years", experience_years),
    ):
        if value is not None:
            setattr(partner, field, value)
            updated_fields.append(field)
    if updated_fields:
        partner.save(update_fields=(*updated_fields, "updated_at"))


def _record_partner_consents(
    *,
    partner: PartnerProfile,
    consents: Sequence[dict[str, str]] | None,
    request_ip: str,
    device_identifier: str,
) -> None:
    request_ip_hash = keyed_hash(request_ip)
    device_hash = keyed_hash(device_identifier) if device_identifier else ""
    for consent in consents or ():
        document = PartnerConsentDocument.objects.filter(
            purpose=consent["purpose"],
            document_version=consent["document_version"],
            is_current=True,
            published_at__lte=timezone.now(),
            retired_at__isnull=True,
        ).first()
        if document is None:
            raise PartnerApplicationIncompleteError(
                "One or more consent documents are unavailable or out of date.",
            )
        receipt, _created = PartnerConsent.objects.get_or_create(
            partner=partner,
            purpose=consent["purpose"],
            document_version=consent["document_version"],
            defaults={
                "document": document,
                "request_ip_hash": request_ip_hash,
                "device_hash": device_hash,
            },
        )
        if receipt.document_id is None:
            receipt.document = document
            receipt.save(update_fields=("document",))


@transaction.atomic
def update_partner_application(
    *,
    user: User,
    expected_version: int | None,
    display_name: str | None,
    biography: str | None,
    experience_years: int | None,
    skill_codes: Sequence[str] | None,
    service_variant_ids: Sequence[uuid.UUID] | None,
    service_area_ids: Sequence[uuid.UUID] | None,
    consents: Sequence[dict[str, str]] | None,
    request_ip: str,
    device_identifier: str,
) -> PartnerApplication:
    partner, application = _draft_application_for_update(
        user=user,
        expected_version=expected_version,
        display_name=display_name,
        biography=biography,
        experience_years=experience_years,
    )
    skills = _resolve_application_skills(partner=partner, skill_codes=skill_codes)
    variants = _resolve_application_variants(
        partner=partner,
        variant_ids=service_variant_ids,
    )
    service_areas = _resolve_application_service_areas(
        partner=partner,
        service_area_ids=service_area_ids,
    )
    _validate_service_configuration(
        skills=skills,
        variants=variants,
        service_areas=service_areas,
    )

    _update_partner_profile(
        partner=partner,
        display_name=display_name,
        biography=biography,
        experience_years=experience_years,
    )
    if skill_codes is not None:
        _set_active_skills(partner=partner, skills=skills)
    if service_variant_ids is not None:
        _set_active_services(partner=partner, variants=variants)
    if service_area_ids is not None:
        _set_active_service_areas(partner=partner, service_areas=service_areas)

    _record_partner_consents(
        partner=partner,
        consents=consents,
        request_ip=request_ip,
        device_identifier=device_identifier,
    )

    application.version += 1
    application.save(update_fields=("version", "updated_at"))
    return application


def _assert_application_editable(application: PartnerApplication) -> None:
    if application.status not in {
        PartnerApplication.Status.DRAFT,
        PartnerApplication.Status.CHANGES_REQUIRED,
    }:
        raise PartnerTransitionError(
            "Documents cannot be changed in the current application state."
        )


@transaction.atomic
def _create_document_upload_intent(
    *,
    user: User,
    expected_version: int,
    kind: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
) -> PartnerDocumentUpload:
    application = _application_for_update(user)
    _assert_version(application, expected_version)
    _assert_application_editable(application)
    normalized_content_type = content_type.lower()
    suffix = DOCUMENT_CONTENT_TYPE_SUFFIXES.get(normalized_content_type)
    if suffix is None:
        raise PartnerDocumentUploadError("Choose a supported document file type.")
    if size_bytes > MAX_PARTNER_DOCUMENT_SIZE_BYTES:
        raise PartnerDocumentUploadError("The document exceeds the allowed size.")
    if not SHA256_PATTERN.fullmatch(sha256):
        raise PartnerDocumentUploadError("The document checksum is invalid.")
    object_key = f"partners/{application.partner_id}/{kind.lower()}/{uuid.uuid4().hex}{suffix}"
    return PartnerDocumentUpload.objects.create(
        application=application,
        kind=kind,
        object_key=object_key,
        content_type=normalized_content_type,
        size_bytes=size_bytes,
        sha256=sha256,
        expires_at=timezone.now() + timedelta(hours=2),
    )


def issue_partner_document_upload(
    *,
    user: User,
    expected_version: int,
    kind: str,
    content_type: str,
    size_bytes: int,
    sha256: str,
    storage: DocumentStorage | None = None,
) -> PartnerDocumentUploadGrant:
    upload = _create_document_upload_intent(
        user=user,
        expected_version=expected_version,
        kind=kind,
        content_type=content_type,
        size_bytes=size_bytes,
        sha256=sha256,
    )
    provider = storage or get_document_storage()
    try:
        signed = provider.create_signed_upload(object_key=upload.object_key)
    except DocumentStorageError as exc:
        PartnerDocumentUpload.objects.filter(id=upload.id).update(
            status=PartnerDocumentUpload.Status.FAILED,
            failure_code="provider_unavailable",
        )
        raise PartnerDocumentUploadError(
            "Document upload is temporarily unavailable. Try again.",
            retryable=True,
        ) from exc
    upload.expires_at = signed.expires_at
    upload.save(update_fields=("expires_at", "updated_at"))
    return PartnerDocumentUploadGrant(upload=upload, signed=signed)


def _document_upload_for_finalization(
    *,
    user: User,
    upload_id: uuid.UUID,
    expected_version: int,
) -> PartnerDocumentUpload:
    upload = (
        PartnerDocumentUpload.objects.select_related("application__partner")
        .filter(id=upload_id, application__partner__user=user)
        .first()
    )
    if upload is None:
        raise PartnerApplicationNotFoundError
    if upload.status != PartnerDocumentUpload.Status.ISSUED:
        raise PartnerDocumentUploadError("This upload cannot be finalized again.")
    if upload.expires_at <= timezone.now():
        PartnerDocumentUpload.objects.filter(id=upload.id).update(
            status=PartnerDocumentUpload.Status.EXPIRED,
            failure_code="upload_expired",
        )
        raise PartnerDocumentUploadError("The upload expired. Start a new upload.")
    _assert_version(upload.application, expected_version)
    return upload


def finalize_partner_document_upload(
    *,
    user: User,
    expected_version: int,
    upload_id: uuid.UUID,
    storage: DocumentStorage | None = None,
) -> PartnerDocument:
    upload = _document_upload_for_finalization(
        user=user,
        upload_id=upload_id,
        expected_version=expected_version,
    )
    provider = storage or get_document_storage()
    try:
        verified = provider.verify_object(
            object_key=upload.object_key,
            maximum_size_bytes=MAX_PARTNER_DOCUMENT_SIZE_BYTES,
        )
    except DocumentStorageError as exc:
        raise PartnerDocumentUploadError(
            "The uploaded document could not be verified. Try again.",
            retryable=True,
        ) from exc

    mismatch = (
        verified.size_bytes != upload.size_bytes
        or verified.content_type != upload.content_type
        or verified.sha256 != upload.sha256
    )
    failure_message: str | None = None
    document: PartnerDocument | None = None
    with transaction.atomic():
        locked_upload = PartnerDocumentUpload.objects.select_for_update().get(id=upload.id)
        application = PartnerApplication.objects.select_for_update().get(
            id=locked_upload.application_id,
        )
        _assert_version(application, expected_version)
        _assert_application_editable(application)
        if locked_upload.status != PartnerDocumentUpload.Status.ISSUED:
            raise PartnerDocumentUploadError("This upload cannot be finalized again.")
        if locked_upload.expires_at <= timezone.now():
            locked_upload.status = PartnerDocumentUpload.Status.EXPIRED
            locked_upload.failure_code = "upload_expired"
            locked_upload.save(update_fields=("status", "failure_code", "updated_at"))
            failure_message = "The upload expired. Start a new upload."
        elif mismatch:
            locked_upload.status = PartnerDocumentUpload.Status.FAILED
            locked_upload.failure_code = "metadata_mismatch"
            locked_upload.save(update_fields=("status", "failure_code", "updated_at"))
            failure_message = (
                "The uploaded document did not match the selected file. Start a new upload."
            )
        else:
            previous = (
                PartnerDocument.objects.select_for_update()
                .filter(application=application, kind=locked_upload.kind)
                .order_by("-version")
                .first()
            )
            next_version = (previous.version if previous else 0) + 1
            document = PartnerDocument.objects.create(
                application=application,
                kind=locked_upload.kind,
                version=next_version,
                object_key=locked_upload.object_key,
                content_type=locked_upload.content_type,
                size_bytes=locked_upload.size_bytes,
                sha256=locked_upload.sha256,
                replaces=previous,
            )
            if previous is not None and previous.status != PartnerDocument.Status.APPROVED:
                previous.status = PartnerDocument.Status.SUPERSEDED
                previous.save(update_fields=("status",))
            locked_upload.status = PartnerDocumentUpload.Status.VERIFIED
            locked_upload.finalized_at = timezone.now()
            locked_upload.failure_code = ""
            locked_upload.save(
                update_fields=("status", "finalized_at", "failure_code", "updated_at"),
            )
            application.version += 1
            application.save(update_fields=("version", "updated_at"))
    if failure_message is not None:
        raise PartnerDocumentUploadError(failure_message)
    if document is None:
        raise PartnerDocumentUploadError("The uploaded document could not be finalized.")
    return document


@transaction.atomic
def record_partner_document_scan_result(
    *,
    document_id: uuid.UUID,
    is_clean: bool,
    failure_code: str = "",
) -> PartnerDocument:
    document = PartnerDocument.objects.select_for_update().get(id=document_id)
    document.scan_status = (
        PartnerDocument.ScanStatus.CLEAN if is_clean else PartnerDocument.ScanStatus.REJECTED
    )
    document.scanned_at = timezone.now()
    document.scan_failure_code = "" if is_clean else failure_code[:64]
    document.save(
        update_fields=("scan_status", "scanned_at", "scan_failure_code"),
    )
    return document


def cleanup_stale_partner_document_uploads(
    *,
    storage: DocumentStorage | None = None,
    batch_size: int = 100,
) -> int:
    """Delete only unaccepted upload objects after the configured recovery window.

    Verified uploads are intentionally excluded because the legal retention policy for accepted
    KYC records must be approved separately. Missing objects are treated as already deleted by the
    storage adapter, making retries safe after a worker crash.
    """

    now = timezone.now()
    cutoff = now - timedelta(hours=settings.PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS)
    candidate_ids = list(
        PartnerDocumentUpload.objects.filter(object_deleted_at__isnull=True)
        .filter(
            Q(
                status__in=(
                    PartnerDocumentUpload.Status.ISSUED,
                    PartnerDocumentUpload.Status.EXPIRED,
                ),
                expires_at__lte=cutoff,
            )
            | Q(
                status=PartnerDocumentUpload.Status.FAILED,
                updated_at__lte=cutoff,
            ),
        )
        .order_by("expires_at", "id")
        .values_list("id", flat=True)[:batch_size]
    )
    provider = storage or get_document_storage()
    deleted_count = 0
    for upload_id in candidate_ids:
        upload = PartnerDocumentUpload.objects.get(id=upload_id)
        if upload.status == PartnerDocumentUpload.Status.ISSUED:
            PartnerDocumentUpload.objects.filter(
                id=upload.id,
                status=PartnerDocumentUpload.Status.ISSUED,
            ).update(
                status=PartnerDocumentUpload.Status.EXPIRED,
                failure_code="upload_expired",
            )
        provider.delete_object(object_key=upload.object_key)
        updated = (
            PartnerDocumentUpload.objects.filter(
                id=upload.id,
                object_deleted_at__isnull=True,
            )
            .exclude(status=PartnerDocumentUpload.Status.VERIFIED)
            .update(
                object_deleted_at=timezone.now(),
            )
        )
        deleted_count += updated
    return deleted_count


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
    required_document_ids = set(
        PartnerConsentDocument.objects.filter(
            is_current=True,
            is_required_for_submission=True,
            published_at__lte=timezone.now(),
            retired_at__isnull=True,
        ).values_list("id", flat=True),
    )
    if not required_document_ids:
        return False
    accepted_document_ids = set(
        PartnerConsent.objects.filter(
            partner=partner,
            document_id__in=required_document_ids,
            withdrawn_at__isnull=True,
        ).values_list("document_id", flat=True),
    )
    return required_document_ids.issubset(accepted_document_ids)


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
    partner = application.partner
    skills = list(
        Skill.objects.filter(
            partner_links__partner=partner,
            partner_links__is_active=True,
        ),
    )
    variants = list(
        ServiceVariant.objects.filter(
            partner_links__partner=partner,
            partner_links__is_active=True,
        ).select_related("service"),
    )
    service_areas = list(
        ServiceArea.objects.filter(
            partner_links__partner=partner,
            partner_links__is_active=True,
        ),
    )
    _validate_service_configuration(
        skills=skills,
        variants=variants,
        service_areas=service_areas,
        require_complete=True,
    )
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
def claim_partner_application(
    *,
    reviewer: User,
    application_id: uuid.UUID,
    expected_version: int,
) -> PartnerApplication:
    application = (
        PartnerApplication.objects.select_for_update(of=("self",))
        .select_related("partner", "review_assigned_to")
        .filter(id=application_id)
        .first()
    )
    if application is None:
        raise PartnerApplicationNotFoundError
    if application.partner.user_id == reviewer.id:
        raise PartnerSelfReviewError(
            object_type="partner_application",
            object_id=application.id,
        )
    _assert_version(application, expected_version)
    if application.status not in {
        PartnerApplication.Status.SUBMITTED,
        PartnerApplication.Status.UNDER_REVIEW,
    }:
        raise PartnerTransitionError("This application is not available for review.")
    if application.review_assigned_to_id not in {None, reviewer.id}:
        raise PartnerReviewOwnershipError(
            "This application is already assigned to another reviewer.",
        )
    if (
        application.review_assigned_to_id == reviewer.id
        and application.status == PartnerApplication.Status.UNDER_REVIEW
    ):
        return application

    previous_status = application.status
    application.review_assigned_to = reviewer
    application.review_assigned_at = timezone.now()
    application.status = PartnerApplication.Status.UNDER_REVIEW
    application.version += 1
    application.save(
        update_fields=(
            "review_assigned_to",
            "review_assigned_at",
            "status",
            "version",
            "updated_at",
        ),
    )
    _record_transition(
        application=application,
        from_status=previous_status,
        actor=reviewer,
        reason_code="application_review_claimed",
    )
    return application


def create_partner_document_review_access(
    *,
    reviewer: User,
    document_id: uuid.UUID,
    storage: DocumentStorage | None = None,
) -> SignedReview:
    document = (
        PartnerDocument.objects.select_related(
            "application__partner",
            "application__review_assigned_to",
        )
        .filter(id=document_id)
        .first()
    )
    if document is None:
        raise PartnerApplicationNotFoundError
    if document.application.partner.user_id == reviewer.id:
        raise PartnerSelfReviewError(object_type="partner_document", object_id=document.id)
    if document.application.review_assigned_to_id != reviewer.id:
        raise PartnerReviewOwnershipError(
            "Claim this Partner application before reviewing its documents.",
        )
    if document.status != PartnerDocument.Status.PENDING:
        raise PartnerTransitionError("This document is not pending review.")
    if document.scan_status != PartnerDocument.ScanStatus.CLEAN:
        raise PartnerTransitionError("This document is not available until safety scanning passes.")
    provider = storage or get_document_storage()
    try:
        return provider.create_signed_review(
            object_key=document.object_key,
            expires_in_seconds=settings.PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS,
        )
    except DocumentStorageError as exc:
        raise PartnerDocumentUploadError(
            "Document review access is temporarily unavailable. Try again.",
            retryable=True,
        ) from exc


@transaction.atomic
def review_partner_document(
    *,
    reviewer: User,
    document_id: uuid.UUID,
    decision: str,
    reason: str,
) -> PartnerDocument:
    document = (
        PartnerDocument.objects.select_for_update(of=("self",))
        .select_related("application__partner", "application__review_assigned_to")
        .filter(id=document_id)
        .first()
    )
    if document is None:
        raise PartnerApplicationNotFoundError
    if document.application.partner.user_id == reviewer.id:
        raise PartnerSelfReviewError(object_type="partner_document", object_id=document.id)
    if document.application.review_assigned_to_id != reviewer.id:
        raise PartnerReviewOwnershipError(
            "Claim this Partner application before reviewing its documents.",
        )
    if document.scan_status != PartnerDocument.ScanStatus.CLEAN:
        raise PartnerTransitionError("This document is not available until safety scanning passes.")
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
    if application.partner.user_id == reviewer.id:
        raise PartnerSelfReviewError(
            object_type="partner_application",
            object_id=application.id,
        )
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
    if application.status == PartnerApplication.Status.SUBMITTED:
        if application.review_assigned_to_id not in {None, reviewer.id}:
            raise PartnerReviewOwnershipError(
                "This application is already assigned to another reviewer.",
            )
        application.review_assigned_to = reviewer
        application.review_assigned_at = timezone.now()
    elif (
        application.status == PartnerApplication.Status.UNDER_REVIEW
        and application.review_assigned_to_id != reviewer.id
    ):
        raise PartnerReviewOwnershipError(
            "Claim this Partner application before completing its review.",
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
            "review_assigned_to",
            "review_assigned_at",
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
    return _replace_schedule_for_application(
        application=application,
        rules=rules,
        exceptions=exceptions,
    )


def _replace_schedule_for_application(
    *,
    application: PartnerApplication,
    rules: Sequence[ScheduleRuleInput],
    exceptions: Sequence[ScheduleExceptionInput],
) -> tuple[list[PartnerAvailabilityRule], list[PartnerAvailabilityException]]:
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


def _schedule_snapshot(*, partner: PartnerProfile) -> dict[str, list[dict[str, object]]]:
    rules: list[dict[str, object]] = [
        {
            "service_area_id": str(rule.service_area_id),
            "weekday": rule.weekday,
            "starts_at": rule.starts_at.isoformat(),
            "ends_at": rule.ends_at.isoformat(),
            "ends_next_day": rule.ends_next_day,
        }
        for rule in PartnerAvailabilityRule.objects.filter(partner=partner).order_by(
            "service_area_id",
            "weekday",
            "starts_at",
        )
    ]
    exceptions: list[dict[str, object]] = [
        {
            "service_area_id": str(exception.service_area_id),
            "date": exception.date.isoformat(),
            "is_available": exception.is_available,
            "starts_at": exception.starts_at.isoformat() if exception.starts_at else None,
            "ends_at": exception.ends_at.isoformat() if exception.ends_at else None,
            "ends_next_day": exception.ends_next_day,
            "reason": exception.reason,
        }
        for exception in PartnerAvailabilityException.objects.filter(partner=partner).order_by(
            "service_area_id",
            "date",
        )
    ]
    return {"rules": rules, "exceptions": exceptions}


@transaction.atomic
def replace_partner_schedule_for_operations(
    *,
    actor: User,
    partner_id: uuid.UUID,
    consent_purpose: str,
    consent_document_version: str,
    rules: Sequence[ScheduleRuleInput],
    exceptions: Sequence[ScheduleExceptionInput],
) -> tuple[list[PartnerAvailabilityRule], list[PartnerAvailabilityException]]:
    """Change a Partner schedule only with a persisted, active Partner consent receipt."""
    application = (
        PartnerApplication.objects.select_for_update()
        .select_related("partner")
        .filter(partner_id=partner_id)
        .first()
    )
    if application is None:
        raise PartnerApplicationNotFoundError
    consent = PartnerConsent.objects.filter(
        partner=application.partner,
        purpose=consent_purpose,
        document_version=consent_document_version,
        withdrawn_at__isnull=True,
    ).first()
    if consent is None:
        raise PartnerScheduleError("An active Partner consent receipt is required.")
    previous_schedule = _schedule_snapshot(partner=application.partner)
    created_rules, created_exceptions = _replace_schedule_for_application(
        application=application,
        rules=rules,
        exceptions=exceptions,
    )
    PartnerScheduleChangeAudit.objects.create(
        partner=application.partner,
        actor=actor,
        consent=consent,
        previous_schedule=previous_schedule,
        updated_schedule=_schedule_snapshot(partner=application.partner),
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
