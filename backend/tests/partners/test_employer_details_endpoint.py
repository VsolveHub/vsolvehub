"""Saving an employer's details and logo: `PATCH/POST/DELETE /partner/application/employer/...`.

The applicant runs on a customer session (they have not been approved yet), so the tests sign in
the same way the apply screens do.
"""

from http import HTTPStatus

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.identity.models import Role, User, UserRole
from apps.partners.models import (
    EmployerProfile,
    PartnerApplication,
    PartnerBusinessProfile,
    PartnerConsentDocument,
)
from apps.partners.services import update_partner_application
from tests.helpers import force_role_client

URL = "/api/v1/partner/application/employer/"
LOGO_URL = "/api/v1/partner/application/employer/logo/"
APPLICATION_URL = "/api/v1/partner/application/"
VALID_GSTIN = "27AAPFU0939F1ZV"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32

BUSINESS = {
    "trade_name": "Sai Mobiles",
    "legal_name": "Sri Sai Mobiles Pvt Ltd",
    "legal_structure": "COMPANY",
    "business_category": "SHOP",
    "company_size": "SIZE_1_10",
    "gst_registered": False,
    "business_proof_type": "SHOP_ESTABLISHMENT",
    "address": "12 Main Road",
    "area": "Kondapur",
    "city": "Hyderabad",
    "state": "Telangana",
    "pin_code": "500084",
    "latitude": "17.469000",
    "longitude": "78.358000",
}


def _start(user: User, *, track: str = PartnerApplication.Track.EMPLOYER) -> PartnerApplication:
    PartnerConsentDocument.objects.get_or_create(
        purpose="partner_terms",
        document_version="2026-07",
        defaults={
            "title": "Partner terms",
            "document_url": "https://legal.vsolvehub.test/partner-terms/2026-07",
        },
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


def _client(user: User):
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="customer")


@pytest.fixture
def user(db):  # noqa: ARG001
    return User.objects.create_user(phone_number="+919977770131", full_name="Priya Sharma")


@pytest.fixture
def application(user) -> PartnerApplication:
    return _start(user)


def _version(application: PartnerApplication) -> int:
    return PartnerApplication.objects.get(pk=application.pk).version


def _patch(client, application, **body):
    return client.patch(URL, {"expected_version": _version(application), **body}, format="json")


def _details(response) -> dict:
    return response.json()["error"]["details"]


def _codes(response, *path: str) -> list[str]:
    node = _details(response)
    for part in path:
        node = node[part]
    return [item["code"] for item in node]


def _png(name: str = "logo.png", content_type: str = "image/png", data: bytes = PNG):
    return SimpleUploadedFile(name, data, content_type=content_type)


# --- who may save, and when -------------------------------------------------------------------


def test_a_non_employer_application_is_refused(user):
    application = _start(user, track=PartnerApplication.Track.STAY_HOST)

    response = _patch(_client(user), application, hiring_as="INDIVIDUAL")

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "employer_track_required"


def test_a_submitted_application_cannot_be_edited(user, application):
    PartnerApplication.objects.filter(pk=application.pk).update(
        status=PartnerApplication.Status.SUBMITTED
    )

    response = _patch(_client(user), application, hiring_as="INDIVIDUAL")

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "partner_transition_not_allowed"


def test_a_stale_version_is_refused(user, application):
    response = _client(user).patch(
        URL,
        {"expected_version": _version(application) + 5, "hiring_as": "INDIVIDUAL"},
        format="json",
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "partner_application_version_conflict"


def test_someone_without_an_application_cannot_save(db):  # noqa: ARG001
    stranger = User.objects.create_user(phone_number="+919977770132", full_name="Just A Customer")

    response = _client(stranger).patch(
        URL, {"expected_version": 1, "hiring_as": "INDIVIDUAL"}, format="json"
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


# --- saving ------------------------------------------------------------------------------------


def test_choosing_individual_saves_the_person_and_bumps_the_version(user, application):
    before = _version(application)

    response = _patch(
        _client(user),
        application,
        hiring_as="INDIVIDUAL",
        display_name="Priya Sharma",
        area="Kondapur",
        city="Hyderabad",
        pin_code="500084",
        email="priya@example.com",
    )

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["version"] == before + 1
    assert body["employer"]["hiring_as"] == "INDIVIDUAL"
    assert body["employer"]["business"] is None
    assert body["employer"]["missing_fields"] == ["id_document_type"]
    assert body["offered_document_kinds"] == ["GOVERNMENT_ID", "SELFIE"]
    assert not PartnerBusinessProfile.objects.filter(partner=application.partner).exists()


def test_choosing_business_creates_the_employer_business_profile(user, application):
    response = _patch(
        _client(user),
        application,
        hiring_as="BUSINESS",
        poster_role="OWNER",
        id_document_type="PAN",
        business=BUSINESS,
    )

    assert response.status_code == HTTPStatus.OK
    body = response.json()["employer"]
    assert body["business"]["legal_name"] == "Sri Sai Mobiles Pvt Ltd"
    assert body["business"]["logo_url"] == ""
    assert body["missing_fields"] == []
    saved = PartnerBusinessProfile.objects.get(partner=application.partner)
    assert saved.business_type == PartnerBusinessProfile.BusinessType.EMPLOYER


def test_a_business_with_gst_saves_a_normalised_gstin(user, application):
    response = _patch(
        _client(user),
        application,
        hiring_as="BUSINESS",
        business={
            **BUSINESS,
            "gst_registered": True,
            "gstin": " 27aapfu0939f1zv ",
            "business_proof_type": "GST_CERTIFICATE",
            "state": "Maharashtra",
        },
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["employer"]["business"]["gstin"] == VALID_GSTIN


def test_other_tracks_see_no_employer_object(user):
    application = _start(user, track=PartnerApplication.Track.STAY_HOST)

    body = _client(user).get(APPLICATION_URL).json()

    assert body["employer"] is None
    assert application.track == PartnerApplication.Track.STAY_HOST


# --- switching type ----------------------------------------------------------------------------


def test_switching_to_individual_removes_the_business_and_the_role(user, application):
    client = _client(user)
    _patch(
        client,
        application,
        hiring_as="BUSINESS",
        poster_role="HR",
        business=BUSINESS,
    )

    response = _patch(client, application, hiring_as="INDIVIDUAL")

    assert response.status_code == HTTPStatus.OK
    assert not PartnerBusinessProfile.objects.filter(partner=application.partner).exists()
    employer = EmployerProfile.objects.get(partner=application.partner)
    assert employer.hiring_as == "INDIVIDUAL"
    assert employer.poster_role == ""


def test_switching_to_business_clears_the_home_location(user, application):
    client = _client(user)
    _patch(
        client,
        application,
        hiring_as="INDIVIDUAL",
        area="Kondapur",
        city="Hyderabad",
        pin_code="500084",
    )

    response = _patch(client, application, hiring_as="BUSINESS")

    assert response.status_code == HTTPStatus.OK
    employer = EmployerProfile.objects.get(partner=application.partner)
    assert (employer.area, employer.city, employer.pin_code) == ("", "", "")
    assert PartnerBusinessProfile.objects.filter(partner=application.partner).exists()


# --- validation --------------------------------------------------------------------------------


def test_a_bad_home_pin_code_is_refused(user, application):
    response = _patch(_client(user), application, hiring_as="INDIVIDUAL", pin_code="012345")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "pin_code") == ["pin_code_invalid"]


def test_a_bad_business_pin_code_is_refused(user, application):
    response = _patch(
        _client(user), application, hiring_as="BUSINESS", business={"pin_code": "50008"}
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "business", "pin_code") == ["pin_code_invalid"]


@pytest.mark.parametrize(
    ("gstin", "code"),
    [
        ("27AAPFU0939F1ZW", "gstin_checksum"),
        ("27AAPFU0939F1", "gstin_format"),
        ("00AAPFU0939F1ZV", "gstin_state"),
        ("2711111111111ZV", "gstin_pan"),
    ],
)
def test_an_invalid_gstin_is_refused_with_its_reason(user, application, gstin, code):
    response = _patch(
        _client(user),
        application,
        hiring_as="BUSINESS",
        business={"gst_registered": True, "gstin": gstin},
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "business", "gstin") == [code]


def test_a_gstin_needs_gst_registered(user, application):
    response = _patch(
        _client(user),
        application,
        hiring_as="BUSINESS",
        business={"gst_registered": False, "gstin": VALID_GSTIN},
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "business", "gstin") == ["gstin_needs_gst_registered"]


@pytest.mark.parametrize(
    ("gst_registered", "proof"),
    [(False, "GST_CERTIFICATE"), (True, "UDYAM")],
)
def test_the_business_proof_must_fit_the_gst_answer(user, application, gst_registered, proof):
    gstin = VALID_GSTIN if gst_registered else ""
    response = _patch(
        _client(user),
        application,
        hiring_as="BUSINESS",
        business={"gst_registered": gst_registered, "gstin": gstin, "business_proof_type": proof},
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "business", "business_proof_type") == ["business_proof_mismatch"]


def test_a_map_pin_needs_both_coordinates(user, application):
    response = _patch(
        _client(user), application, hiring_as="BUSINESS", business={"latitude": "17.469000"}
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "business", "latitude") == ["pin_incomplete"]


def test_a_website_must_be_a_url(user, application):
    response = _patch(
        _client(user), application, hiring_as="BUSINESS", business={"website_url": "not a url"}
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "website_url" in _details(response)["business"]


def test_business_details_are_refused_for_an_individual(user, application):
    response = _patch(_client(user), application, hiring_as="INDIVIDUAL", business=BUSINESS)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "business") == ["employer_field_not_for_type"]


def test_a_role_is_refused_for_an_individual(user, application):
    response = _patch(_client(user), application, hiring_as="INDIVIDUAL", poster_role="OWNER")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "poster_role") == ["employer_field_not_for_type"]


def test_a_home_location_is_refused_for_a_business(user, application):
    response = _patch(_client(user), application, hiring_as="BUSINESS", city="Hyderabad")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "city") == ["employer_field_not_for_type"]


def test_a_refused_save_changes_nothing(user, application):
    before = _version(application)

    _patch(_client(user), application, hiring_as="BUSINESS", business={"pin_code": "50008"})
    _patch(
        _client(user),
        application,
        hiring_as="BUSINESS",
        business={"gst_registered": False, "gstin": VALID_GSTIN},
    )

    assert _version(application) == before
    assert not PartnerBusinessProfile.objects.filter(partner=application.partner).exists()


# --- logo --------------------------------------------------------------------------------------


@pytest.fixture
def business_application(user, application):
    response = _patch(_client(user), application, hiring_as="BUSINESS", business=BUSINESS)
    assert response.status_code == HTTPStatus.OK
    return application


def _upload(client, upload):
    return client.post(LOGO_URL, {"file": upload}, format="multipart")


def test_a_logo_is_saved_and_shown_as_an_absolute_url(user, business_application):
    response = _upload(_client(user), _png())

    assert response.status_code == HTTPStatus.OK
    logo_url = response.json()["employer"]["business"]["logo_url"]
    assert logo_url.startswith("http")
    assert logo_url.endswith(".png")
    saved = PartnerBusinessProfile.objects.get(partner=business_application.partner)
    assert saved.logo.name.startswith("images/employer-logos/")
    saved.logo.delete(save=False)


def test_a_logo_can_be_removed(user, business_application, django_capture_on_commit_callbacks):
    client = _client(user)
    _upload(client, _png())

    with django_capture_on_commit_callbacks(execute=True):
        response = client.delete(LOGO_URL)

    assert response.status_code == HTTPStatus.OK
    assert response.json()["employer"]["business"]["logo_url"] == ""
    saved = PartnerBusinessProfile.objects.get(partner=business_application.partner)
    assert not saved.logo


@pytest.mark.usefixtures("business_application")
def test_a_renamed_pdf_is_not_a_logo(user):
    response = _upload(_client(user), _png(name="logo.png", data=b"%PDF-1.4 not an image at all"))

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "file") == ["employer_logo_type"]


@pytest.mark.usefixtures("business_application")
def test_a_logo_of_the_wrong_type_is_refused(user):
    response = _upload(_client(user), _png(name="logo.gif", content_type="image/gif"))

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "file") == ["employer_logo_type"]


@pytest.mark.usefixtures("business_application")
def test_a_logo_over_two_megabytes_is_refused(user):
    response = _upload(_client(user), _png(data=PNG + b"\x00" * (2 * 1024 * 1024)))

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "file") == ["employer_logo_too_large"]


@pytest.mark.usefixtures("business_application")
def test_an_empty_logo_is_refused(user):
    response = _upload(_client(user), _png(data=b""))

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "file") == ["employer_logo_empty"]


@pytest.mark.usefixtures("business_application")
def test_a_logo_is_required_in_the_request(user):
    response = _client(user).post(LOGO_URL, {}, format="multipart")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "file") == ["file_required"]


def test_an_individual_cannot_add_a_logo(user, application):
    client = _client(user)
    _patch(client, application, hiring_as="INDIVIDUAL")

    response = _upload(client, _png())

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _codes(response, "file") == ["employer_field_not_for_type"]


def test_a_logo_cannot_change_after_submission(user, business_application):
    PartnerApplication.objects.filter(pk=business_application.pk).update(
        status=PartnerApplication.Status.SUBMITTED
    )

    response = _upload(_client(user), _png())

    assert response.status_code == HTTPStatus.CONFLICT


def test_switching_to_individual_removes_the_logo_file(
    user, business_application, django_capture_on_commit_callbacks
):
    client = _client(user)
    _upload(client, _png())
    logo = PartnerBusinessProfile.objects.get(partner=business_application.partner).logo
    storage, name = logo.storage, logo.name
    assert storage.exists(name)

    with django_capture_on_commit_callbacks(execute=True):
        response = _patch(client, business_application, hiring_as="INDIVIDUAL")

    assert response.status_code == HTTPStatus.OK
    assert not storage.exists(name)
