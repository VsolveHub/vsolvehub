from http import HTTPStatus

import pytest

from apps.identity.models import User
from apps.partners.models import PartnerApplication, PartnerDocument
from tests.helpers import force_role_client
from tests.partners.conftest import (
    PartnerSetup,
    application_payload,
    upload_partner_document,
)

pytestmark = pytest.mark.django_db


def _setup_application(setup: PartnerSetup) -> PartnerApplication:
    setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(setup),
        format="json",
    )
    return PartnerApplication.objects.get(partner__user=setup.user)


def _upload_doc(
    setup: PartnerSetup,
    kind: str = PartnerDocument.Kind.GOVERNMENT_ID,
) -> PartnerDocument:
    app = PartnerApplication.objects.get(partner__user=setup.user)
    response = upload_partner_document(
        setup.client,
        kind=kind,
        expected_version=app.version,
        size_bytes=2048,
        sha256="f" * 64,
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return PartnerDocument.objects.get(id=response.json()["id"])


def test_partner_can_access_own_document_preview(partner_setup: PartnerSetup) -> None:
    _setup_application(partner_setup)
    doc = _upload_doc(partner_setup)

    response = partner_setup.client.get(
        f"/api/v1/partner/application/documents/{doc.id}/access/",
    )
    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["access_url"].startswith("https://")
    assert body["document"]["id"] == str(doc.id)
    assert body["document"]["kind"] == PartnerDocument.Kind.GOVERNMENT_ID
    assert body["document"]["label"] == "Government identity"
    assert body["document"]["status"] == "PENDING"
    assert body["document"]["version"] == 1
    assert "pdf" in body["document"]["file_name"]
    assert body["document"]["file_size"] == 2048


def test_partner_cannot_access_another_partners_document(
    partner_setup: PartnerSetup,
    another_partner_setup: PartnerSetup,
) -> None:
    _setup_application(partner_setup)
    doc = _upload_doc(partner_setup)

    _setup_application(another_partner_setup)
    unauthorized = another_partner_setup.client.get(
        f"/api/v1/partner/application/documents/{doc.id}/access/",
    )
    assert unauthorized.status_code == HTTPStatus.NOT_FOUND


def test_scan_status_does_not_block_partner_access_or_admin_review(
    partner_setup: PartnerSetup,
    operations_user: User,
) -> None:
    app = _setup_application(partner_setup)
    doc = _upload_doc(partner_setup)

    # Explicitly set scan_status back to PENDING to simulate old/unscanned file
    doc.scan_status = PartnerDocument.ScanStatus.PENDING
    doc.save(update_fields=("scan_status",))

    # Partner can still view
    response = partner_setup.client.get(
        f"/api/v1/partner/application/documents/{doc.id}/access/",
    )
    assert response.status_code == HTTPStatus.OK

    # Submit application
    app.refresh_from_db()
    partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": app.version},
        format="json",
    )

    ops_client = force_role_client(user=operations_user, role_code="operations")

    # Ops claim
    app.refresh_from_db()
    ops_client.post(
        f"/api/v1/operations/partner-applications/{app.id}/claim/",
        {"expected_version": app.version},
        format="json",
    )

    # Ops can reveal even if scan_status was PENDING
    reveal = ops_client.post(
        f"/api/v1/operations/partner-documents/{doc.id}/access/",
    )
    assert reveal.status_code == HTTPStatus.OK

    # Ops can review even if scan_status was PENDING
    review = ops_client.post(
        f"/api/v1/operations/partner-documents/{doc.id}/review/",
        {"decision": "APPROVED", "reason": ""},
        format="json",
    )
    assert review.status_code == HTTPStatus.OK
    doc.refresh_from_db()
    assert doc.status == PartnerDocument.Status.APPROVED


def test_admin_reject_requires_reason(
    partner_setup: PartnerSetup,
    operations_user: User,
) -> None:
    app = _setup_application(partner_setup)
    doc = _upload_doc(partner_setup)

    app.refresh_from_db()
    partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": app.version},
        format="json",
    )

    ops_client = force_role_client(user=operations_user, role_code="operations")
    app.refresh_from_db()
    ops_client.post(
        f"/api/v1/operations/partner-applications/{app.id}/claim/",
        {"expected_version": app.version},
        format="json",
    )

    # Reject without reason fails
    refused = ops_client.post(
        f"/api/v1/operations/partner-documents/{doc.id}/review/",
        {"decision": "REJECTED", "reason": ""},
        format="json",
    )
    assert refused.status_code == HTTPStatus.CONFLICT

    # Reject with reason succeeds
    accepted = ops_client.post(
        f"/api/v1/operations/partner-documents/{doc.id}/review/",
        {"decision": "REJECTED", "reason": "Image is blurry"},
        format="json",
    )
    assert accepted.status_code == HTTPStatus.OK
    doc.refresh_from_db()
    assert doc.status == PartnerDocument.Status.REJECTED
    assert doc.review_reason == "Image is blurry"


def test_cannot_approve_already_approved_document(
    partner_setup: PartnerSetup,
    operations_user: User,
) -> None:
    app = _setup_application(partner_setup)
    doc = _upload_doc(partner_setup)

    app.refresh_from_db()
    partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": app.version},
        format="json",
    )

    ops_client = force_role_client(user=operations_user, role_code="operations")
    app.refresh_from_db()
    ops_client.post(
        f"/api/v1/operations/partner-applications/{app.id}/claim/",
        {"expected_version": app.version},
        format="json",
    )

    ops_client.post(
        f"/api/v1/operations/partner-documents/{doc.id}/review/",
        {"decision": "APPROVED", "reason": ""},
        format="json",
    )

    second_review = ops_client.post(
        f"/api/v1/operations/partner-documents/{doc.id}/review/",
        {"decision": "APPROVED", "reason": ""},
        format="json",
    )
    assert second_review.status_code == HTTPStatus.CONFLICT


def test_application_approval_blocked_until_all_required_documents_approved(
    partner_setup: PartnerSetup,
    operations_user: User,
) -> None:
    app = _setup_application(partner_setup)
    doc1 = _upload_doc(partner_setup, kind=PartnerDocument.Kind.GOVERNMENT_ID)
    doc2 = _upload_doc(partner_setup, kind=PartnerDocument.Kind.ADDRESS_PROOF)

    app.refresh_from_db()
    partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": app.version},
        format="json",
    )

    ops_client = force_role_client(user=operations_user, role_code="operations")
    app.refresh_from_db()
    ops_client.post(
        f"/api/v1/operations/partner-applications/{app.id}/claim/",
        {"expected_version": app.version},
        format="json",
    )

    # Approve only document 1
    ops_client.post(
        f"/api/v1/operations/partner-documents/{doc1.id}/review/",
        {"decision": "APPROVED", "reason": ""},
        format="json",
    )

    # Attempt to approve application while document 2 is PENDING -> fails
    app.refresh_from_db()
    attempt = ops_client.post(
        f"/api/v1/operations/partner-applications/{app.id}/transition/",
        {"expected_version": app.version, "target_status": "APPROVED"},
        format="json",
    )
    assert attempt.status_code == HTTPStatus.CONFLICT
    assert "Approve the latest required documents" in attempt.json()["error"]["message"]

    # Approve document 2
    ops_client.post(
        f"/api/v1/operations/partner-documents/{doc2.id}/review/",
        {"decision": "APPROVED", "reason": ""},
        format="json",
    )

    # Now approve application succeeds
    app.refresh_from_db()
    approved = ops_client.post(
        f"/api/v1/operations/partner-applications/{app.id}/transition/",
        {"expected_version": app.version, "target_status": "APPROVED"},
        format="json",
    )
    assert approved.status_code == HTTPStatus.OK
    app.refresh_from_db()
    assert app.status == PartnerApplication.Status.APPROVED
