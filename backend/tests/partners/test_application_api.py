from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import UserRole
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)
from tests.partners.conftest import (
    PartnerSetup,
    application_payload,
    set_partner_schedule,
    upload_partner_document,
)

pytestmark = pytest.mark.django_db

INITIAL_APPLICATION_VERSION = 2
REQUIRED_CONSENT_COUNT = 2
SECOND_DOCUMENT_VERSION = 2


def _create_application(setup: PartnerSetup) -> dict:
    response = setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(setup),
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED
    return response.json()


def _add_identity_document(setup: PartnerSetup, version: int) -> dict:
    response = upload_partner_document(
        setup.client,
        expected_version=version,
    )
    assert response.status_code == HTTPStatus.CREATED
    return response.json()


def test_application_creation_normalizes_eligibility_and_audits_transition(
    partner_setup: PartnerSetup,
) -> None:
    payload = _create_application(partner_setup)

    assert payload["status"] == PartnerApplication.Status.DRAFT
    assert payload["version"] == INITIAL_APPLICATION_VERSION
    assert payload["skill_codes"] == ["electrician"]
    assert payload["service_variant_ids"] == [str(partner_setup.variant.id)]
    assert payload["service_area_ids"] == [str(partner_setup.service_area.id)]
    assert UserRole.objects.filter(
        user=partner_setup.user,
        role__code="partner",
        revoked_at__isnull=True,
    ).exists()
    assert (
        PartnerSkill.objects.filter(partner__user=partner_setup.user, is_active=True).count() == 1
    )
    assert (
        PartnerService.objects.filter(
            partner__user=partner_setup.user,
            is_active=True,
        ).count()
        == 1
    )
    assert (
        PartnerServiceArea.objects.filter(
            partner__user=partner_setup.user,
            is_active=True,
        ).count()
        == 1
    )
    assert (
        PartnerConsent.objects.filter(partner__user=partner_setup.user).count()
        == REQUIRED_CONSENT_COUNT
    )
    transition = PartnerApplicationTransition.objects.get(
        application__partner__user=partner_setup.user,
    )
    assert transition.from_status == ""
    assert transition.to_status == PartnerApplication.Status.DRAFT
    assert transition.reason_code == "application_created"


def test_applicant_reference_data_is_bounded_and_publishes_canonical_values(
    partner_setup: PartnerSetup,
) -> None:
    Skill.objects.create(code="inactive-skill", name="Inactive", is_active=False)
    closed_area = ServiceArea.objects.create(
        slug="closed-to-applicants",
        name="Closed to applicants",
        is_accepting_partners=False,
    )

    areas = partner_setup.client.get("/api/v1/service-areas/")
    skills = partner_setup.client.get("/api/v1/partner/skills/")
    consents = partner_setup.client.get("/api/v1/partner/required-consents/")

    assert areas.status_code == HTTPStatus.OK
    assert areas.json() == [
        {
            "id": str(partner_setup.service_area.id),
            "slug": "west-hyderabad",
            "name": "West Hyderabad",
            "timezone": "Asia/Kolkata",
            "is_accepting_partners": True,
        },
    ]
    assert skills.status_code == HTTPStatus.OK
    assert skills.json() == [
        {"id": str(partner_setup.skill.id), "code": "electrician", "name": "Electrician", "description": ""},
    ]
    assert consents.status_code == HTTPStatus.OK
    assert [item["purpose"] for item in consents.json()] == [
        "partner_terms",
        "privacy_notice",
    ]
    assert all(item["document_url"].startswith("https://") for item in consents.json())

    closed_selection = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"service_area_ids": [str(closed_area.id)]},
        format="json",
    )
    assert closed_selection.status_code == HTTPStatus.CONFLICT
    assert PartnerApplication.objects.count() == 0


def test_application_patch_saves_independent_steps_and_preserves_omitted_fields(
    partner_setup: PartnerSetup,
) -> None:
    about = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"display_name": "Ravi K.", "biography": "Residential specialist."},
        format="json",
    )
    assert about.status_code == HTTPStatus.CREATED
    assert about.json()["service_variant_ids"] == []

    work = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "expected_version": about.json()["version"],
            "skill_codes": [partner_setup.skill.code],
            "service_variant_ids": [str(partner_setup.variant.id)],
        },
        format="json",
    )
    assert work.status_code == HTTPStatus.OK
    assert work.json()["display_name"] == "Ravi K."
    assert work.json()["service_area_ids"] == []

    areas = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "expected_version": work.json()["version"],
            "service_area_ids": [str(partner_setup.service_area.id)],
        },
        format="json",
    )
    assert areas.status_code == HTTPStatus.OK

    consents = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "expected_version": areas.json()["version"],
            "consents": application_payload(partner_setup)["consents"],
        },
        format="json",
    )
    assert consents.status_code == HTTPStatus.OK
    assert consents.json()["display_name"] == "Ravi K."
    assert len(consents.json()["consents"]) == REQUIRED_CONSENT_COUNT

    no_op = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"expected_version": consents.json()["version"]},
        format="json",
    )
    assert no_op.status_code == HTTPStatus.BAD_REQUEST

    _add_identity_document(partner_setup, consents.json()["version"])
    set_partner_schedule(partner_setup)
    application = PartnerApplication.objects.get(partner__user=partner_setup.user)
    submitted = partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": application.version},
        format="json",
    )
    assert submitted.status_code == HTTPStatus.OK
    assert submitted.json()["status"] == PartnerApplication.Status.SUBMITTED


def test_submission_requires_the_current_published_consent_version(
    partner_setup: PartnerSetup,
) -> None:
    created = _create_application(partner_setup)
    current = PartnerConsentDocument.objects.get(purpose="partner_terms")
    current.is_current = False
    current.retired_at = timezone.now()
    current.save(update_fields=("is_current", "retired_at", "updated_at"))
    PartnerConsentDocument.objects.create(
        purpose="partner_terms",
        title="Partner terms",
        document_version="2026-08",
        document_url="https://legal.vsolvehub.test/partner-terms/2026-08",
    )
    _add_identity_document(partner_setup, created["version"])
    set_partner_schedule(partner_setup)
    application = PartnerApplication.objects.get(partner__user=partner_setup.user)

    submitted = partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": application.version},
        format="json",
    )

    assert submitted.status_code == HTTPStatus.CONFLICT
    assert submitted.json()["error"]["code"] == "partner_application_incomplete"


def test_application_requires_current_version_and_no_duplicate_selections(
    partner_setup: PartnerSetup,
) -> None:
    created = _create_application(partner_setup)
    missing_version = partner_setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(partner_setup),
        format="json",
    )
    stale_version = partner_setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(partner_setup, expected_version=created["version"] - 1),
        format="json",
    )
    duplicate_payload = application_payload(
        partner_setup,
        expected_version=created["version"],
    )
    duplicate_payload["skill_codes"] = ["electrician", "electrician"]
    duplicate = partner_setup.client.patch(
        "/api/v1/partner/application/",
        duplicate_payload,
        format="json",
    )

    assert missing_version.status_code == HTTPStatus.CONFLICT
    assert missing_version.json()["error"]["code"] == "partner_application_version_conflict"
    assert missing_version.json()["error"]["retryable"] is True
    assert stale_version.status_code == HTTPStatus.CONFLICT
    assert duplicate.status_code == HTTPStatus.BAD_REQUEST


def test_required_skill_and_service_area_configuration_are_enforced(
    partner_setup: PartnerSetup,
) -> None:
    wrong_skill = application_payload(partner_setup)
    wrong_skill["skill_codes"] = ["plumber"]
    skill_response = partner_setup.client.patch(
        "/api/v1/partner/application/",
        wrong_skill,
        format="json",
    )
    wrong_area = application_payload(partner_setup)
    wrong_area["service_area_ids"] = ["00000000-0000-4000-8000-000000000001"]
    area_response = partner_setup.client.patch(
        "/api/v1/partner/application/",
        wrong_area,
        format="json",
    )

    assert skill_response.status_code == HTTPStatus.CONFLICT
    assert area_response.status_code == HTTPStatus.CONFLICT
    assert PartnerApplication.objects.count() == 0


def test_document_versions_preserve_review_history(partner_setup: PartnerSetup) -> None:
    created = _create_application(partner_setup)
    first = _add_identity_document(partner_setup, created["version"])
    application = PartnerApplication.objects.get(partner__user=partner_setup.user)
    second_response = upload_partner_document(
        partner_setup.client,
        expected_version=application.version,
        size_bytes=2048,
        sha256="b" * 64,
    )

    assert first["version"] == 1
    assert second_response.status_code == HTTPStatus.CREATED
    assert second_response.json()["version"] == SECOND_DOCUMENT_VERSION
    second = PartnerDocument.objects.get(id=second_response.json()["id"])
    assert str(second.replaces_id) == first["id"]
    assert PartnerDocument.objects.get(id=first["id"]).status == PartnerDocument.Status.SUPERSEDED


def test_application_submission_requires_document_and_complete_profile(
    partner_setup: PartnerSetup,
) -> None:
    created = _create_application(partner_setup)
    without_document = partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": created["version"]},
        format="json",
    )
    assert without_document.status_code == HTTPStatus.CONFLICT

    _add_identity_document(partner_setup, created["version"])
    application = PartnerApplication.objects.get(partner__user=partner_setup.user)

    # Missing working hours blocks submission
    blocked = partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": application.version},
        format="json",
    )
    assert blocked.status_code == HTTPStatus.CONFLICT
    assert blocked.json()["error"]["code"] == "partner_application_incomplete"
    assert "Set your weekly working hours" in blocked.json()["error"]["message"]

    # Setting working hours allows submission to succeed
    set_partner_schedule(partner_setup)
    application.refresh_from_db()
    submitted = partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": application.version},
        format="json",
    )

    assert submitted.status_code == HTTPStatus.OK
    assert submitted.json()["status"] == PartnerApplication.Status.SUBMITTED
    assert submitted.json()["submitted_at"]


@pytest.mark.parametrize(
    "path",
    (
        "/api/v1/partner/application/",
        "/api/v1/service-areas/",
        "/api/v1/partner/skills/",
        "/api/v1/partner/required-consents/",
    ),
)
def test_partner_endpoints_require_authentication(path: str) -> None:
    response = APIClient().get(path)
    assert response.status_code in {HTTPStatus.FORBIDDEN, HTTPStatus.UNAUTHORIZED}
