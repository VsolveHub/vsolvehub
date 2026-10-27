"""Two things that stopped Operations approving a real Partner application.

1. **No scanner.** Every upload starts at ``scan_status=PENDING`` and nothing ever moved it, so no
   document could be opened or approved, and so no application either. The development scanner
   lets onboarding run end to end outside production; production refuses it.
2. **Approve with an empty reason was a 500.** The admin screen leaves ``reason`` out when the box
   is empty, the serializer accepted that, and the service then received no ``reason`` at all.
"""

from http import HTTPStatus

import pytest

from apps.identity.models import User
from apps.partners.models import PartnerApplication, PartnerDocument
from apps.partners.scanning import ScanVerdict
from apps.partners.services import (
    record_partner_document_scan_result,
    scan_partner_document,
)
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup, application_payload, upload_partner_document
from tests.test_server_clock_calibration import production_settings  # noqa: F401

pytestmark = pytest.mark.django_db


def _uploaded_document(setup: PartnerSetup) -> PartnerDocument:
    created = setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(setup),
        format="json",
    ).json()
    response = upload_partner_document(
        setup.client,
        expected_version=created["version"],
        size_bytes=1000,
        sha256="d" * 64,
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return PartnerDocument.objects.get(id=response.json()["id"])


# --------------------------------------------------------------------------------------------
# Scanning
# --------------------------------------------------------------------------------------------


def test_all_uploads_are_immediately_clean(
    partner_setup: PartnerSetup,
) -> None:
    document = _uploaded_document(partner_setup)
    assert document.scan_status == PartnerDocument.ScanStatus.CLEAN


def test_a_recorded_verdict_is_never_overwritten(
    partner_setup: PartnerSetup,
) -> None:
    document = _uploaded_document(partner_setup)
    record_partner_document_scan_result(
        document_id=document.id, is_clean=False, failure_code="malware_found"
    )

    class AlwaysClean:
        def scan(self, document: PartnerDocument) -> ScanVerdict | None:
            del document
            return ScanVerdict(is_clean=True)

    rescanned = scan_partner_document(document.id, scanner=AlwaysClean())

    assert rescanned.scan_status == PartnerDocument.ScanStatus.REJECTED
    assert rescanned.scan_failure_code == "malware_found"


# --------------------------------------------------------------------------------------------
# Approve with no reason
# --------------------------------------------------------------------------------------------


def test_approve_with_the_reason_left_out_is_recorded_not_a_server_error(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    document = _uploaded_document(partner_setup)
    record_partner_document_scan_result(document_id=document.id, is_clean=True)
    application = PartnerApplication.objects.get(partner__user=partner_setup.user)
    submit = partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": application.version},
        format="json",
    )
    assert submit.status_code == HTTPStatus.OK
    client = force_role_client(user=operations_user, role_code="operations")
    transition = f"/api/v1/operations/partner-applications/{application.id}/transition/"

    application.refresh_from_db()
    # Exactly what the admin screen used to send: no `reason` key at all.
    started = client.post(
        transition,
        {"expected_version": application.version, "target_status": "UNDER_REVIEW"},
        format="json",
    )
    assert started.status_code == HTTPStatus.OK, started.json()
    reviewed = client.post(
        f"/api/v1/operations/partner-documents/{document.id}/review/",
        {"decision": "APPROVED", "reason": "Identity verified."},
        format="json",
    )
    assert reviewed.status_code == HTTPStatus.OK, reviewed.json()
    application.refresh_from_db()

    approved = client.post(
        transition,
        {"expected_version": application.version, "target_status": "APPROVED"},
        format="json",
    )

    assert approved.status_code == HTTPStatus.OK, approved.json()
    application.refresh_from_db()
    assert application.status == PartnerApplication.Status.APPROVED


def test_a_decision_that_needs_a_reason_still_refuses_an_empty_one(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    document = _uploaded_document(partner_setup)
    record_partner_document_scan_result(document_id=document.id, is_clean=True)
    application = PartnerApplication.objects.get(partner__user=partner_setup.user)
    partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": application.version},
        format="json",
    )
    client = force_role_client(user=operations_user, role_code="operations")
    transition = f"/api/v1/operations/partner-applications/{application.id}/transition/"
    application.refresh_from_db()
    client.post(
        transition,
        {"expected_version": application.version, "target_status": "UNDER_REVIEW"},
        format="json",
    )
    application.refresh_from_db()

    refused = client.post(
        transition,
        {"expected_version": application.version, "target_status": "CHANGES_REQUIRED"},
        format="json",
    )

    assert refused.status_code == HTTPStatus.CONFLICT
    assert refused.json()["error"]["code"] == "partner_transition_not_allowed"
