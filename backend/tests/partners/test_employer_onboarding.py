"""Employer onboarding, applicant side: documents per type, completeness and submit.

An employer says who is hiring (an individual or a business); what they must give and upload
follows from that. Saving the details through the API is covered with the endpoint tests.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.identity.models import User
from apps.partners.capabilities import expired_required_document_kinds
from apps.partners.exceptions import PartnerApplicationIncompleteError, PartnerDocumentUploadError
from apps.partners.models import (
    EmployerProfile,
    EmployerReviewCheck,
    PartnerApplication,
    PartnerBusinessProfile,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerProfile,
)
from apps.partners.selectors import (
    employer_missing_fields,
    offered_document_kinds,
    required_document_kinds,
)
from apps.partners.serializers import PartnerApplicationSerializer
from apps.partners.services import (
    issue_partner_document_upload,
    submit_partner_application,
    update_partner_application,
)

Kind = PartnerDocument.Kind
VALID_GSTIN = "27AAPFU0939F1ZV"


@pytest.fixture
def user(db):  # noqa: ARG001
    return User.objects.create_user(phone_number="+919977770121", full_name="Priya Sharma")


def _start(user: User, *, track: str = PartnerApplication.Track.EMPLOYER) -> PartnerApplication:
    PartnerConsentDocument.objects.create(
        purpose="partner_terms",
        title="Partner terms",
        document_version="2026-07",
        document_url="https://legal.vsolvehub.test/partner-terms/2026-07",
    )
    return update_partner_application(
        user=user,
        expected_version=None,
        display_name="Priya Sharma",
        biography=None,
        experience_years=None,
        skill_codes=None,
        service_variant_ids=None,
        service_area_ids=None,
        consents=[{"purpose": "partner_terms", "document_version": "2026-07"}],
        request_ip="127.0.0.1",
        device_identifier="",
        track=track,
    )


def _individual(application: PartnerApplication, **overrides: str) -> None:
    values = {
        "hiring_as": EmployerProfile.HiringAs.INDIVIDUAL,
        "area": "Kondapur",
        "city": "Hyderabad",
        "pin_code": "500084",
        "id_document_type": EmployerProfile.IdDocumentType.PAN,
    }
    values.update(overrides)
    EmployerProfile.objects.update_or_create(partner=application.partner, defaults=values)


def _business(application: PartnerApplication, *, role: str = "OWNER", **overrides: object) -> None:
    EmployerProfile.objects.update_or_create(
        partner=application.partner,
        defaults={
            "hiring_as": EmployerProfile.HiringAs.BUSINESS,
            "poster_role": role,
            "id_document_type": EmployerProfile.IdDocumentType.PAN,
        },
    )
    values: dict[str, object] = {
        "business_type": PartnerBusinessProfile.BusinessType.EMPLOYER,
        "legal_name": "Sri Sai Mobiles Pvt Ltd",
        "legal_structure": "COMPANY",
        "business_category": "SHOP",
        "company_size": "SIZE_1_10",
        "business_proof_type": "SHOP_ESTABLISHMENT",
        "address": "12 Main Road",
        "area": "Kondapur",
        "city": "Hyderabad",
        "state": "Telangana",
        "pin_code": "500084",
        "latitude": Decimal("17.469000"),
        "longitude": Decimal("78.358000"),
    }
    values.update(overrides)
    PartnerBusinessProfile.objects.update_or_create(partner=application.partner, defaults=values)


def _documents(application: PartnerApplication, *kinds: str) -> None:
    for index, kind in enumerate(kinds):
        PartnerDocument.objects.create(
            application=application,
            kind=kind,
            version=1,
            object_key=f"partner-documents/test/{index}.pdf",
            content_type="application/pdf",
            size_bytes=1024,
            sha256="0" * 64,
        )


def _fresh(application: PartnerApplication) -> PartnerApplication:
    return PartnerApplication.objects.select_related("partner").get(pk=application.pk)


def _missing(application: PartnerApplication) -> list[str]:
    return employer_missing_fields(PartnerProfile.objects.get(pk=application.partner_id))


def _submit(user: User, application: PartnerApplication) -> PartnerApplication:
    return submit_partner_application(user=user, expected_version=_fresh(application).version)


# --- required and offered documents -------------------------------------------------------------


def test_employer_who_has_not_chosen_needs_only_an_id(user):
    application = _start(user)

    assert required_document_kinds(_fresh(application)) == (Kind.GOVERNMENT_ID,)


def test_individual_needs_an_id_and_a_selfie(user):
    application = _start(user)
    _individual(application)

    assert required_document_kinds(_fresh(application)) == (Kind.GOVERNMENT_ID, Kind.SELFIE)


def test_business_owner_needs_an_id_and_business_proof(user):
    application = _start(user)
    _business(application, role="OWNER")

    assert required_document_kinds(_fresh(application)) == (
        Kind.GOVERNMENT_ID,
        Kind.BUSINESS_PROOF,
    )


@pytest.mark.parametrize("role", ["HR", "MANAGER", "OTHER"])
def test_business_poster_who_is_not_the_owner_also_needs_the_owners_letter(user, role):
    application = _start(user)
    _business(application, role=role)

    assert required_document_kinds(_fresh(application)) == (
        Kind.GOVERNMENT_ID,
        Kind.BUSINESS_PROOF,
        Kind.AUTHORIZATION_LETTER,
    )


def test_an_employer_is_offered_exactly_what_it_must_upload(user):
    application = _start(user)
    _individual(application)
    current = _fresh(application)

    assert offered_document_kinds(current) == required_document_kinds(current)


def test_other_tracks_keep_their_documents(user, settings):
    application = _start(user, track=PartnerApplication.Track.STAY_HOST)
    current = _fresh(application)

    assert required_document_kinds(current) == tuple(settings.PARTNER_REQUIRED_DOCUMENT_KINDS)
    assert offered_document_kinds(current) == (Kind.GOVERNMENT_ID, Kind.ADDRESS_PROOF)


def test_the_application_lists_the_documents_its_type_requires(user):
    application = _start(user)
    _individual(application)

    data = PartnerApplicationSerializer(_fresh(application)).data

    assert data["required_document_kinds"] == [Kind.GOVERNMENT_ID, Kind.SELFIE]


def test_an_individuals_expired_selfie_counts_as_an_expired_required_document(user):
    application = _start(user)
    _individual(application)
    _documents(application, Kind.SELFIE)
    PartnerDocument.objects.filter(application=application).update(
        expires_on=timezone.localdate() - timedelta(days=1)
    )

    assert expired_required_document_kinds(_fresh(application).partner) == [Kind.SELFIE]


# --- the selfie must be a photo ----------------------------------------------------------------


def test_a_selfie_cannot_be_a_pdf(user):
    application = _start(user)
    _individual(application)

    with pytest.raises(PartnerDocumentUploadError) as refused:
        issue_partner_document_upload(
            user=user,
            expected_version=_fresh(application).version,
            kind=Kind.SELFIE,
            content_type="application/pdf",
            size_bytes=1024,
            sha256="0" * 64,
        )

    assert refused.value.code == "document_selfie_image_only"


# --- what an employer still has to give --------------------------------------------------------


def test_an_employer_who_has_not_chosen_is_asked_to_choose(user):
    application = _start(user)

    assert _missing(application) == ["hiring_as"]


def test_a_complete_individual_has_nothing_missing(user):
    application = _start(user)
    _individual(application)

    assert _missing(application) == []


@pytest.mark.parametrize("field", ["area", "city", "pin_code", "id_document_type"])
def test_an_individual_is_missing_what_they_leave_blank(user, field):
    application = _start(user)
    _individual(application, **{field: ""})

    assert _missing(application) == [field]


def test_a_complete_business_has_nothing_missing(user):
    application = _start(user)
    _business(application)

    assert _missing(application) == []


def test_a_business_with_no_details_is_missing_everything_in_screen_order(user):
    application = _start(user)
    EmployerProfile.objects.create(
        partner=application.partner, hiring_as=EmployerProfile.HiringAs.BUSINESS
    )

    assert _missing(application) == [
        "legal_name",
        "legal_structure",
        "business_category",
        "company_size",
        "business_proof_type",
        "address",
        "area",
        "city",
        "state",
        "pin_code",
        "latitude",
        "longitude",
        "poster_role",
        "id_document_type",
    ]


def test_a_business_with_gst_needs_a_valid_gstin(user):
    application = _start(user)
    _business(
        application,
        gst_registered=True,
        gstin="27AAPFU0939F1ZW",
        business_proof_type="GST_CERTIFICATE",
        state="Maharashtra",
    )
    assert _missing(application) == ["gstin"]

    PartnerBusinessProfile.objects.filter(partner=application.partner).update(gstin=VALID_GSTIN)
    assert _missing(application) == []


def test_a_business_without_gst_is_not_asked_for_a_gstin(user):
    application = _start(user)
    _business(application, gst_registered=False, gstin="")

    assert "gstin" not in _missing(application)


def test_the_name_must_have_two_characters(user):
    application = _start(user)
    _individual(application)
    PartnerProfile.objects.filter(pk=application.partner_id).update(display_name="A")

    assert _missing(application) == ["display_name"]


def test_the_application_says_whether_employer_details_are_complete(user):
    application = _start(user)
    assert PartnerApplicationSerializer(_fresh(application)).data["business_details_complete"] is (
        False
    )

    _individual(application)
    assert PartnerApplicationSerializer(_fresh(application)).data["business_details_complete"] is (
        True
    )


# --- submit ------------------------------------------------------------------------------------


def test_an_individual_submits_without_any_business_details(user):
    application = _start(user)
    _individual(application)
    _documents(application, Kind.GOVERNMENT_ID, Kind.SELFIE)

    submitted = _submit(user, application)

    assert submitted.status == PartnerApplication.Status.SUBMITTED
    assert not PartnerBusinessProfile.objects.filter(partner=application.partner).exists()


def test_a_business_submits_when_complete(user):
    application = _start(user)
    _business(application)
    _documents(application, Kind.GOVERNMENT_ID, Kind.BUSINESS_PROOF)

    assert _submit(user, application).status == PartnerApplication.Status.SUBMITTED


def test_submit_is_refused_until_the_employer_has_chosen(user):
    application = _start(user)
    _documents(application, Kind.GOVERNMENT_ID)

    with pytest.raises(PartnerApplicationIncompleteError, match="who is hiring"):
        _submit(user, application)


def test_submit_names_the_first_thing_an_individual_is_missing(user):
    application = _start(user)
    _individual(application, pin_code="")
    _documents(application, Kind.GOVERNMENT_ID, Kind.SELFIE)

    with pytest.raises(PartnerApplicationIncompleteError, match="pin code"):
        _submit(user, application)


def test_submit_names_the_first_thing_a_business_is_missing(user):
    application = _start(user)
    _business(application, address="")
    _documents(application, Kind.GOVERNMENT_ID, Kind.BUSINESS_PROOF)

    with pytest.raises(PartnerApplicationIncompleteError, match="business address"):
        _submit(user, application)


def test_an_individual_cannot_submit_without_the_selfie(user):
    application = _start(user)
    _individual(application)
    _documents(application, Kind.GOVERNMENT_ID)

    with pytest.raises(PartnerApplicationIncompleteError, match="document"):
        _submit(user, application)


def test_a_non_owner_cannot_submit_without_the_owners_letter(user):
    application = _start(user)
    _business(application, role="HR")
    _documents(application, Kind.GOVERNMENT_ID, Kind.BUSINESS_PROOF)

    with pytest.raises(PartnerApplicationIncompleteError, match="document"):
        _submit(user, application)

    _documents(application, Kind.AUTHORIZATION_LETTER)
    assert _submit(user, application).status == PartnerApplication.Status.SUBMITTED


def test_resubmitting_after_changes_clears_the_review_checks(user):
    application = _start(user)
    _individual(application)
    _documents(application, Kind.GOVERNMENT_ID, Kind.SELFIE)
    reviewer = User.objects.create_user(phone_number="+919977770122", full_name="Ops Reviewer")
    EmployerReviewCheck.objects.create(
        application=application,
        code=EmployerReviewCheck.Code.NAME_MATCHES_ID,
        result=EmployerReviewCheck.Result.PASS,
        checked_by=reviewer,
    )
    PartnerApplication.objects.filter(pk=application.pk).update(
        status=PartnerApplication.Status.CHANGES_REQUIRED
    )

    _submit(user, application)

    assert not EmployerReviewCheck.objects.filter(application=application).exists()
