from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.identity.models import UserRole
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerConsent,
    PartnerDocument,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
)
from tests.partners.conftest import PartnerSetup, application_payload

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
    application = PartnerApplication.objects.get(partner__user=setup.user)
    response = setup.client.post(
        "/api/v1/partner/application/documents/",
        {
            "expected_version": version,
            "kind": "GOVERNMENT_ID",
            "object_key": f"partners/{application.partner_id}/government-id.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 1024,
            "sha256": "a" * 64,
        },
        format="json",
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
    second_response = partner_setup.client.post(
        "/api/v1/partner/application/documents/",
        {
            "expected_version": application.version,
            "kind": "GOVERNMENT_ID",
            "object_key": f"partners/{application.partner_id}/government-id-v2.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 2048,
            "sha256": "b" * 64,
        },
        format="json",
    )

    assert first["version"] == 1
    assert second_response.status_code == HTTPStatus.CREATED
    assert second_response.json()["version"] == SECOND_DOCUMENT_VERSION
    second = PartnerDocument.objects.get(id=second_response.json()["id"])
    assert str(second.replaces_id) == first["id"]
    assert PartnerDocument.objects.get(id=first["id"]).status == PartnerDocument.Status.PENDING


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
    submitted = partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": application.version},
        format="json",
    )

    assert submitted.status_code == HTTPStatus.OK
    assert submitted.json()["status"] == PartnerApplication.Status.SUBMITTED
    assert submitted.json()["submitted_at"]


def test_partner_endpoints_require_authentication() -> None:
    response = APIClient().get("/api/v1/partner/application/")
    assert response.status_code in {HTTPStatus.FORBIDDEN, HTTPStatus.UNAUTHORIZED}
