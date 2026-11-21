"""Operations' manual review of an employer: the checklist, the approval guard and the hints."""

from http import HTTPStatus
from typing import Any

import pytest
from django.utils import timezone

from apps.identity.models import Role, User, UserRole
from apps.partners.models import (
    EmployerReviewCheck,
    PartnerApplication,
    PartnerBusinessProfile,
    PartnerDocument,
    PartnerProfile,
)
from apps.partners.selectors import employer_hints
from tests.helpers import force_role_client
from tests.partners.test_employer_onboarding import (
    VALID_GSTIN,
    _business,
    _documents,
    _individual,
    _start,
)
from tests.partners.test_review_decline_release_notices import _transition

pytestmark = pytest.mark.django_db

Kind = PartnerDocument.Kind
Code = EmployerReviewCheck.Code

INDIVIDUAL_CODES = [Code.NAME_MATCHES_ID, Code.SELFIE_MATCHES_ID]
BUSINESS_CODES = [Code.PROOF_MATCHES_BUSINESS, Code.POSTER_ID_MATCHES, Code.AUTHORITY_CONFIRMED]
GST = {
    "gst_registered": True,
    "gstin": VALID_GSTIN,
    "business_proof_type": "GST_CERTIFICATE",
    "state": "Maharashtra",
}


@pytest.fixture
def applicant(db):  # noqa: ARG001
    return User.objects.create_user(phone_number="+919977770141", full_name="Priya Sharma")


def _individual_application(applicant):
    application = _start(applicant)
    _individual(application)
    _documents(application, Kind.GOVERNMENT_ID, Kind.SELFIE)
    return application, INDIVIDUAL_CODES


def _business_application(applicant):
    application = _start(applicant)
    _business(application)
    _documents(application, Kind.GOVERNMENT_ID, Kind.BUSINESS_PROOF)
    return application, BUSINESS_CODES


def _business_gst_application(applicant):
    application = _start(applicant)
    _business(application, **GST)
    _documents(application, Kind.GOVERNMENT_ID, Kind.BUSINESS_PROOF)
    return application, [Code.GST_ACTIVE_ON_PORTAL, *BUSINESS_CODES]


BUILDERS = [
    pytest.param(_individual_application, id="individual"),
    pytest.param(_business_application, id="business-without-gst"),
    pytest.param(_business_gst_application, id="business-with-gst"),
]


def _ops(user: User) -> Any:
    return force_role_client(user=user, role_code="operations")


def _other_reviewer() -> User:
    user = User.objects.create_user(phone_number="+919900000777", full_name="Second Reviewer")
    role, _ = Role.objects.get_or_create(
        code="operations", defaults={"name": "Operations", "is_system": True}
    )
    UserRole.objects.get_or_create(user=user, role=role)
    return user


def _claimed(application: PartnerApplication, reviewer: User) -> Any:
    """The application, submitted and held by `reviewer`; returns their client."""
    PartnerDocument.objects.filter(application=application).update(
        status=PartnerDocument.Status.APPROVED
    )
    PartnerApplication.objects.filter(pk=application.pk).update(
        status=PartnerApplication.Status.SUBMITTED, submitted_at=timezone.now()
    )
    client = _ops(reviewer)
    assert _transition(client, application, "UNDER_REVIEW").status_code == HTTPStatus.OK
    return client


def _check(client: Any, application: PartnerApplication, code: str, result: str, note: str = ""):
    return client.put(
        f"/api/v1/operations/partner-applications/{application.id}/employer-checks/{code}/",
        {"result": result, "note": note},
        format="json",
    )


def _error(response: Any) -> dict[str, Any]:
    return response.json()["error"]


# --- approval needs every check --------------------------------------------------------------


@pytest.mark.parametrize("build", BUILDERS)
def test_approval_is_blocked_until_every_check_passes(build, applicant, operations_user):
    application, codes = build(applicant)
    client = _claimed(application, operations_user)

    refused = _transition(client, application, "APPROVED")
    assert refused.status_code == HTTPStatus.CONFLICT
    assert _error(refused)["code"] == "employer_checks_incomplete"
    assert _error(refused)["details"]["missing_codes"] == codes

    for code in codes[:-1]:
        assert _check(client, application, code, "PASS").status_code == HTTPStatus.OK
    refused = _transition(client, application, "APPROVED")
    assert _error(refused)["details"]["missing_codes"] == [codes[-1]]

    assert _check(client, application, codes[-1], "PASS").status_code == HTTPStatus.OK
    approved = _transition(client, application, "APPROVED")
    assert approved.status_code == HTTPStatus.OK, approved.json()
    application.refresh_from_db()
    assert application.status == PartnerApplication.Status.APPROVED


def test_a_failed_check_does_not_let_the_application_through(applicant, operations_user):
    application, codes = _individual_application(applicant)
    client = _claimed(application, operations_user)
    _check(client, application, codes[0], "PASS")
    _check(client, application, codes[1], "FAIL", "The photo is of someone else.")

    refused = _transition(client, application, "APPROVED")

    assert refused.status_code == HTTPStatus.CONFLICT
    assert _error(refused)["details"]["missing_codes"] == [codes[1]]


def test_other_tracks_are_approved_without_checks(applicant, operations_user):
    application = _start(applicant, track=PartnerApplication.Track.STAY_HOST)
    _documents(application, Kind.GOVERNMENT_ID)
    client = _claimed(application, operations_user)

    assert _transition(client, application, "APPROVED").status_code == HTTPStatus.OK


# --- who may set a check, and which ----------------------------------------------------------


def test_a_reviewer_who_has_not_claimed_it_cannot_set_a_check(applicant, operations_user):
    application, codes = _individual_application(applicant)
    _claimed(application, operations_user)

    response = _check(_ops(_other_reviewer()), application, codes[0], "PASS")

    assert response.status_code == HTTPStatus.CONFLICT
    assert _error(response)["code"] == "partner_review_ownership_conflict"
    assert not EmployerReviewCheck.objects.filter(application=application).exists()


def test_a_check_cannot_be_set_before_the_application_is_claimed(applicant, operations_user):
    application, codes = _individual_application(applicant)
    PartnerApplication.objects.filter(pk=application.pk).update(
        status=PartnerApplication.Status.SUBMITTED
    )

    response = _check(_ops(operations_user), application, codes[0], "PASS")

    assert response.status_code == HTTPStatus.CONFLICT


def test_a_failed_check_needs_a_note(applicant, operations_user):
    application, codes = _individual_application(applicant)
    client = _claimed(application, operations_user)

    response = _check(client, application, codes[0], "FAIL")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _error(response)["code"] == "employer_check_note_required"


@pytest.mark.parametrize(
    ("build", "code"),
    [
        pytest.param(_individual_application, Code.GST_ACTIVE_ON_PORTAL, id="gst-on-individual"),
        pytest.param(_individual_application, Code.POSTER_ID_MATCHES, id="business-on-individual"),
        pytest.param(_business_application, Code.NAME_MATCHES_ID, id="individual-on-business"),
        pytest.param(_business_application, Code.GST_ACTIVE_ON_PORTAL, id="gst-without-gst"),
        pytest.param(_business_application, "NOT_A_CHECK", id="unknown"),
    ],
)
def test_a_check_for_the_other_type_is_refused(build, code, applicant, operations_user):
    application, _codes = build(applicant)
    client = _claimed(application, operations_user)

    response = _check(client, application, code, "PASS")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _error(response)["code"] == "employer_check_not_applicable"


def test_checks_do_not_apply_to_other_tracks(applicant, operations_user):
    application = _start(applicant, track=PartnerApplication.Track.STAY_HOST)
    _documents(application, Kind.GOVERNMENT_ID)
    client = _claimed(application, operations_user)

    response = _check(client, application, Code.NAME_MATCHES_ID, "PASS")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert _error(response)["code"] == "employer_check_not_applicable"


def test_setting_a_check_again_replaces_it(applicant, operations_user):
    application, codes = _individual_application(applicant)
    client = _claimed(application, operations_user)
    _check(client, application, codes[0], "PASS")

    response = _check(client, application, codes[0], "FAIL", "On second look the name differs.")

    assert response.status_code == HTTPStatus.OK
    row = EmployerReviewCheck.objects.get(application=application, code=codes[0])
    assert row.result == EmployerReviewCheck.Result.FAIL
    assert row.method == EmployerReviewCheck.Method.MANUAL
    assert row.checked_by == operations_user
    assert EmployerReviewCheck.objects.filter(application=application).count() == 1


def test_setting_a_check_returns_every_required_check(applicant, operations_user):
    application, codes = _individual_application(applicant)
    client = _claimed(application, operations_user)

    body = _check(client, application, codes[0], "PASS").json()

    assert [row["code"] for row in body] == codes
    assert body[0]["result"] == "PASS"
    assert body[0]["checked_by_name"] == "Operations Reviewer"
    assert body[1]["result"] is None


# --- what each side reads --------------------------------------------------------------------


def test_operations_reads_the_hints_and_checks(applicant, operations_user):
    application, codes = _business_gst_application(applicant)
    client = _claimed(application, operations_user)

    body = client.get(f"/api/v1/operations/partner-applications/{application.id}/").json()

    assert [row["code"] for row in body["employer_checks"]] == [
        Code.GST_ACTIVE_ON_PORTAL,
        *BUSINESS_CODES,
    ]
    assert all(row["result"] is None for row in body["employer_checks"])
    assert {hint["code"] for hint in body["employer_hints"]} >= {"GSTIN_STATE_MISMATCH"}
    assert body["employer"]["hiring_as"] == "BUSINESS"
    assert codes


def test_other_tracks_have_no_hints_or_checks_for_operations(applicant, operations_user):
    application = _start(applicant, track=PartnerApplication.Track.STAY_HOST)
    _documents(application, Kind.GOVERNMENT_ID)
    client = _claimed(application, operations_user)

    body = client.get(f"/api/v1/operations/partner-applications/{application.id}/").json()

    assert body["employer_hints"] == []
    assert body["employer_checks"] == []


def test_the_applicants_own_read_never_shows_hints_or_checks(applicant, operations_user):
    application, codes = _business_gst_application(applicant)
    client = _claimed(application, operations_user)
    _check(client, application, BUSINESS_CODES[0], "PASS")
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=applicant, role=role, revoked_at=None)
    applicant_client = force_role_client(user=applicant, role_code="customer")

    body = applicant_client.get("/api/v1/partner/application/").json()

    assert "employer_hints" not in body
    assert "employer_checks" not in body
    assert body["review_assigned_to_id"] is None
    assert codes


def test_a_reviewer_cannot_check_their_own_application(operations_user):
    application = _start(operations_user)
    _individual(application)
    _documents(application, Kind.GOVERNMENT_ID, Kind.SELFIE)

    response = _check(_ops(operations_user), application, Code.NAME_MATCHES_ID, "PASS")

    assert response.status_code == HTTPStatus.FORBIDDEN


# --- hints -----------------------------------------------------------------------------------


def _hints(application: PartnerApplication) -> dict[str, dict[str, str]]:
    partner = PartnerProfile.objects.get(pk=application.partner_id)
    return {hint["code"]: hint for hint in employer_hints(partner)}


def test_a_matching_gst_business_gets_only_ok_hints(applicant):
    application = _start(applicant)
    _business(application, legal_structure="PARTNERSHIP_LLP", **GST)

    hints = _hints(application)

    assert {code: hint["level"] for code, hint in hints.items()} == {
        "GSTIN_STATE_MISMATCH": "OK",
        "PAN_TYPE_MISMATCH": "OK",
        "DUPLICATE_GSTIN": "OK",
    }


def test_a_gstin_for_another_state_is_flagged(applicant):
    application = _start(applicant)
    _business(application, legal_structure="PARTNERSHIP_LLP", **{**GST, "state": "Telangana"})

    hint = _hints(application)["GSTIN_STATE_MISMATCH"]

    assert hint["level"] == "WARN"
    assert "Maharashtra" in hint["message"]


def test_a_pan_that_does_not_fit_the_legal_structure_is_flagged(applicant):
    application = _start(applicant)
    _business(application, legal_structure="COMPANY", **GST)

    hint = _hints(application)["PAN_TYPE_MISMATCH"]

    assert hint["level"] == "WARN"
    assert "F" in hint["message"]


def test_a_gstin_used_by_another_business_is_flagged_by_name(applicant):
    other_user = User.objects.create_user(phone_number="+919977770142", full_name="Other Owner")
    other = PartnerProfile.objects.create(user=other_user, display_name="Other Owner")
    PartnerBusinessProfile.objects.create(
        partner=other,
        business_type=PartnerBusinessProfile.BusinessType.EMPLOYER,
        legal_name="Other Traders",
        gst_registered=True,
        gstin=VALID_GSTIN,
    )
    application = _start(applicant)
    _business(application, **GST)

    hint = _hints(application)["DUPLICATE_GSTIN"]

    assert hint["level"] == "WARN"
    assert "Other Traders" in hint["message"]


def test_a_business_without_gst_is_told_to_check_the_proof(applicant):
    application = _start(applicant)
    _business(application)

    hints = _hints(application)

    assert list(hints) == ["NO_GST"]
    assert hints["NO_GST"]["level"] == "WARN"


def test_a_udyam_proof_is_flagged(applicant):
    application = _start(applicant)
    _business(application, business_proof_type="UDYAM")

    hints = _hints(application)

    assert set(hints) == {"NO_GST", "UDYAM_PROOF"}
    assert "self-declared" in hints["UDYAM_PROOF"]["message"]


def test_an_individual_has_no_hints(applicant):
    application = _start(applicant)
    _individual(application)

    assert _hints(application) == {}
