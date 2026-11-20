"""Employer onboarding ("I want to hire staff"): saving who is hiring, and the business logo.

`update_employer_details` is the only write path for the employer screens. It lives apart from
`application` because it writes three tables (the person, the employer profile and the business
profile) and has its own rules about what each type may carry.
"""

from functools import partial
from typing import Any

from django.db import transaction

from apps.identity.models import User
from apps.partners.exceptions import (
    EmployerDetailError,
    EmployerTrackRequiredError,
    PartnerTransitionError,
)
from apps.partners.models import (
    EmployerProfile,
    PartnerApplication,
    PartnerBusinessProfile,
)

from .base import _application_for_update, _assert_version

HiringAs = EmployerProfile.HiringAs

EMPLOYER_LOGO_MAX_BYTES = 2 * 1024 * 1024
EMPLOYER_LOGO_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
_WEBP_TAG_END = 12

#: Person fields the employer sets about themselves, by the type that may carry them.
_ANY_TYPE_PERSON_FIELDS = ("id_document_type", "email")
_INDIVIDUAL_ONLY_FIELDS = ("area", "city", "pin_code")
_BUSINESS_ONLY_PERSON_FIELDS = ("poster_role",)


def _editable_employer_application(user: User, expected_version: int | None) -> PartnerApplication:
    application = _application_for_update(user)
    if expected_version is not None:
        _assert_version(application, expected_version)
    if application.track != PartnerApplication.Track.EMPLOYER:
        raise EmployerTrackRequiredError
    if not application.is_editable:
        raise PartnerTransitionError("This application cannot be edited in its current state.")
    return application


def _delete_file_after_commit(field_file: Any) -> None:
    """Remove a stored file only once the change that dropped it has committed."""
    if not field_file:
        return
    transaction.on_commit(partial(field_file.storage.delete, field_file.name))


def _assert_fields_fit_type(data: dict[str, Any], hiring_as: str) -> None:
    business_fields = data.get("business")
    if hiring_as != HiringAs.BUSINESS:
        if business_fields:
            raise EmployerDetailError(
                "Business details are only for someone hiring for a business.",
                field="business",
                code="employer_field_not_for_type",
            )
        for name in _BUSINESS_ONLY_PERSON_FIELDS:
            if data.get(name):
                raise EmployerDetailError(
                    "Your role is only asked of someone hiring for a business.",
                    field=name,
                    code="employer_field_not_for_type",
                )
    if hiring_as == HiringAs.BUSINESS:
        for name in _INDIVIDUAL_ONLY_FIELDS:
            if data.get(name):
                raise EmployerDetailError(
                    "Home location is only asked of someone hiring for themselves.",
                    field=name,
                    code="employer_field_not_for_type",
                )


def _switch_type(*, employer: EmployerProfile, new_type: str) -> None:
    """Clear what the other type carried, so a switch never leaves half of each behind."""
    if new_type == HiringAs.INDIVIDUAL:
        business = PartnerBusinessProfile.objects.filter(
            partner=employer.partner,
            business_type=PartnerBusinessProfile.BusinessType.EMPLOYER,
        ).first()
        if business is not None:
            _delete_file_after_commit(business.logo)
            business.delete()
        employer.poster_role = ""
    else:
        employer.area = ""
        employer.city = ""
        employer.pin_code = ""


def _write_business(*, business: PartnerBusinessProfile, values: dict[str, Any]) -> None:
    gst_registered = values.get("gst_registered", business.gst_registered)
    gstin = values.get("gstin", business.gstin)
    proof = values.get("business_proof_type", business.business_proof_type)
    if gstin and not gst_registered:
        raise EmployerDetailError(
            "Say that you have GST before adding a GSTIN.",
            field="business.gstin",
            code="gstin_needs_gst_registered",
        )
    gst_certificate = PartnerBusinessProfile.BusinessProofType.GST_CERTIFICATE
    if proof and (proof == gst_certificate) != gst_registered:
        raise EmployerDetailError(
            "The business proof does not fit your GST answer.",
            field="business.business_proof_type",
            code="business_proof_mismatch",
        )
    for name, value in values.items():
        setattr(business, name, value)
    business.save()


@transaction.atomic
def update_employer_details(
    *,
    user: User,
    expected_version: int,
    data: dict[str, Any],
) -> PartnerApplication:
    application = _editable_employer_application(user, expected_version)
    partner = application.partner
    employer, _ = EmployerProfile.objects.get_or_create(partner=partner)

    hiring_as = data.get("hiring_as", employer.hiring_as)
    _assert_fields_fit_type(data, hiring_as)
    if hiring_as != employer.hiring_as and hiring_as:
        _switch_type(employer=employer, new_type=hiring_as)

    if "display_name" in data:
        partner.display_name = data["display_name"]
        partner.save(update_fields=("display_name", "updated_at"))

    person_fields = (
        "hiring_as",
        *_ANY_TYPE_PERSON_FIELDS,
        *_BUSINESS_ONLY_PERSON_FIELDS,
        *_INDIVIDUAL_ONLY_FIELDS,
    )
    for name in person_fields:
        if name in data:
            setattr(employer, name, data[name])
    employer.save()

    if hiring_as == HiringAs.BUSINESS:
        business, _ = PartnerBusinessProfile.objects.get_or_create(
            partner=partner,
            defaults={"business_type": PartnerBusinessProfile.BusinessType.EMPLOYER},
        )
        _write_business(business=business, values=data.get("business", {}))

    application.version += 1
    application.save(update_fields=("version", "updated_at"))
    return application


def _check_logo_image(upload: Any) -> None:
    """The file's first bytes, not its claimed type: a renamed document is not a logo."""
    content_type = (getattr(upload, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type not in EMPLOYER_LOGO_TYPES:
        raise EmployerDetailError(
            "The logo must be a JPEG, PNG or WebP image.", field="file", code="employer_logo_type"
        )
    size = int(getattr(upload, "size", 0) or 0)
    if size <= 0:
        raise EmployerDetailError(
            "The logo file is empty.", field="file", code="employer_logo_empty"
        )
    if size > EMPLOYER_LOGO_MAX_BYTES:
        raise EmployerDetailError(
            "The logo must be 2 MB or smaller.", field="file", code="employer_logo_too_large"
        )
    upload.seek(0)
    head = upload.read(_WEBP_TAG_END)
    upload.seek(0)
    is_image = head.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")) or (
        head[:4] == b"RIFF" and head[8:_WEBP_TAG_END] == b"WEBP"
    )
    if not is_image:
        raise EmployerDetailError(
            "The logo must be a JPEG, PNG or WebP image.", field="file", code="employer_logo_type"
        )


def _business_for_logo(application: PartnerApplication) -> PartnerBusinessProfile:
    employer: EmployerProfile | None = getattr(application.partner, "employer_profile", None)
    business: PartnerBusinessProfile | None = getattr(application.partner, "business_profile", None)
    if employer is None or employer.hiring_as != HiringAs.BUSINESS or business is None:
        raise EmployerDetailError(
            "A logo is only for someone hiring for a business.",
            field="file",
            code="employer_field_not_for_type",
        )
    return business


@transaction.atomic
def set_employer_logo(*, user: User, upload: Any) -> PartnerApplication:
    application = _editable_employer_application(user, None)
    business = _business_for_logo(application)
    _check_logo_image(upload)
    _delete_file_after_commit(business.logo)
    business.logo = upload
    business.save(update_fields=("logo", "updated_at"))
    return application


@transaction.atomic
def remove_employer_logo(*, user: User) -> PartnerApplication:
    application = _editable_employer_application(user, None)
    business = _business_for_logo(application)
    _delete_file_after_commit(business.logo)
    business.logo = ""
    business.save(update_fields=("logo", "updated_at"))
    return application
