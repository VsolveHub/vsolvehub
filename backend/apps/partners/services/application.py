"""The Partner-authored application aggregate.

Everything the applying Partner drives themselves: creating and editing the draft, resolving the
skill/service/area selection, recording consent receipts, and the submission command that closes
the draft. Reviewer-side decisions on the same row live in `review`; document handling lives in
`documents`.
"""

import uuid
from collections.abc import Iterable, Sequence

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Service, ServiceVariant
from apps.identity.hashing import keyed_hash
from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.exceptions import (
    PartnerApplicationIncompleteError,
    PartnerTransitionError,
    PartnerVersionConflictError,
)
from apps.partners.models import (
    PartnerApplication,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)

from .base import (
    _application_for_update,
    _assert_version,
    _base_application_is_complete,
    _record_transition,
)


def _ensure_partner_role(user: User) -> None:
    role, _created = Role.objects.get_or_create(
        code="partner",
        defaults={"name": "Partner", "is_system": True},
    )
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)


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
