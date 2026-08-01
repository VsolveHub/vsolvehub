from datetime import timedelta
from decimal import Decimal
from http import HTTPStatus
from unittest.mock import patch
from urllib.parse import urlsplit

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.identity.models import AccessAuditEvent, Role, User, UserRole
from apps.partners.models import (
    PartnerApplication,
    PartnerDocument,
    PartnerLocation,
    PartnerOnlineSession,
    PartnerProfile,
)
from apps.partners.selectors import (
    instant_matching_presence,
    partner_presence_state,
    presence_cache_key,
)
from apps.partners.services import (
    expire_missing_presence_sessions,
    record_partner_document_scan_result,
)
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup, application_payload, upload_partner_document

pytestmark = pytest.mark.django_db

APPROVAL_TRANSITION_COUNT = 4
OPERATIONS_QUEUE_PAGE_SIZE = 25
DENIED_REVEAL_COUNT = 2


def _submitted_application(setup: PartnerSetup) -> tuple[PartnerApplication, PartnerDocument]:
    created = setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(setup),
        format="json",
    ).json()
    application = PartnerApplication.objects.get(partner__user=setup.user)
    document_response = upload_partner_document(
        setup.client,
        expected_version=created["version"],
        size_bytes=1000,
        sha256="c" * 64,
    )
    record_partner_document_scan_result(
        document_id=document_response.json()["id"],
        is_clean=True,
    )
    application.refresh_from_db()
    submit = setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": application.version},
        format="json",
    )
    assert submit.status_code == HTTPStatus.OK
    application.refresh_from_db()
    return application, PartnerDocument.objects.get(id=document_response.json()["id"])


def _approve_application(
    setup: PartnerSetup,
    operations_user: object,
) -> PartnerApplication:
    application, document = _submitted_application(setup)
    client = force_role_client(user=operations_user, role_code="operations")
    review_started = client.post(
        f"/api/v1/operations/partner-applications/{application.id}/transition/",
        {
            "expected_version": application.version,
            "target_status": "UNDER_REVIEW",
            "reason": "",
        },
        format="json",
    )
    assert review_started.status_code == HTTPStatus.OK
    document_review = client.post(
        f"/api/v1/operations/partner-documents/{document.id}/review/",
        {"decision": "APPROVED", "reason": "Identity verified."},
        format="json",
    )
    assert document_review.status_code == HTTPStatus.OK
    application.refresh_from_db()
    approved = client.post(
        f"/api/v1/operations/partner-applications/{application.id}/transition/",
        {
            "expected_version": application.version,
            "target_status": "APPROVED",
            "reason": "",
        },
        format="json",
    )
    assert approved.status_code == HTTPStatus.OK
    application.refresh_from_db()
    return application


def test_operations_review_approval_and_permission_boundary(
    partner_setup: PartnerSetup,
    operations_user: object,
) -> None:
    application, document = _submitted_application(partner_setup)
    forbidden = partner_setup.client.post(
        f"/api/v1/operations/partner-applications/{application.id}/transition/",
        {
            "expected_version": application.version,
            "target_status": "UNDER_REVIEW",
        },
        format="json",
    )
    assert forbidden.status_code == HTTPStatus.FORBIDDEN

    operations_client = force_role_client(user=operations_user, role_code="operations")
    review_started = operations_client.post(
        f"/api/v1/operations/partner-applications/{application.id}/transition/",
        {
            "expected_version": application.version,
            "target_status": "UNDER_REVIEW",
            "reason": "",
        },
        format="json",
    )
    assert review_started.status_code == HTTPStatus.OK
    document_review = operations_client.post(
        f"/api/v1/operations/partner-documents/{document.id}/review/",
        {"decision": "APPROVED", "reason": "Identity verified."},
        format="json",
    )
    assert document_review.status_code == HTTPStatus.OK
    application.refresh_from_db()
    approved_response = operations_client.post(
        f"/api/v1/operations/partner-applications/{application.id}/transition/",
        {
            "expected_version": application.version,
            "target_status": "APPROVED",
            "reason": "",
        },
        format="json",
    )

    assert approved_response.status_code == HTTPStatus.OK
    application.refresh_from_db()
    assert application.status == PartnerApplication.Status.APPROVED
    assert application.reviewed_by == operations_user
    assert application.transitions.count() == APPROVAL_TRANSITION_COUNT


def test_operations_user_cannot_review_own_partner_application(
    partner_setup: PartnerSetup,
) -> None:
    application, document = _submitted_application(partner_setup)
    operations_role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    UserRole.objects.create(user=partner_setup.user, role=operations_role)
    client = force_role_client(user=partner_setup.user, role_code="operations")

    document_response = client.post(
        f"/api/v1/operations/partner-documents/{document.id}/review/",
        {"decision": "APPROVED", "reason": "Self review must fail."},
        format="json",
    )

    response = client.post(
        f"/api/v1/operations/partner-applications/{application.id}/transition/",
        {
            "expected_version": application.version,
            "target_status": "UNDER_REVIEW",
            "reason": "",
        },
        format="json",
    )
    detail_response = client.get(
        f"/api/v1/operations/partner-applications/{application.id}/",
    )

    assert document_response.status_code == HTTPStatus.FORBIDDEN
    assert document_response.json()["error"]["code"] == "partner_self_review_forbidden"
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "partner_self_review_forbidden"
    assert detail_response.status_code == HTTPStatus.FORBIDDEN
    application.refresh_from_db()
    assert application.status == PartnerApplication.Status.SUBMITTED
    assert AccessAuditEvent.objects.filter(
        actor=partner_setup.user,
        subject_user=partner_setup.user,
        action="operations.partner_self_review",
        object_type="partner_application",
        object_id=application.id,
        decision=AccessAuditEvent.Decision.DENIED,
    ).exists()
    assert AccessAuditEvent.objects.filter(
        actor=partner_setup.user,
        subject_user=partner_setup.user,
        action="operations.partner_self_review",
        object_type="partner_document",
        object_id=document.id,
        decision=AccessAuditEvent.Decision.DENIED,
    ).exists()


def test_operations_queue_claim_detail_and_masked_document_access(
    partner_setup: PartnerSetup,
    operations_user: User,
) -> None:
    application, document = _submitted_application(partner_setup)
    document.scan_status = PartnerDocument.ScanStatus.PENDING
    document.scanned_at = None
    document.save(update_fields=("scan_status", "scanned_at"))
    operations_client = force_role_client(user=operations_user, role_code="operations")

    queue = operations_client.get(
        "/api/v1/operations/partner-applications/",
        {"unassigned": "true"},
    )
    detail = operations_client.get(
        f"/api/v1/operations/partner-applications/{application.id}/",
    )
    before_claim = operations_client.post(
        f"/api/v1/operations/partner-documents/{document.id}/access/",
        format="json",
    )
    claimed = operations_client.post(
        f"/api/v1/operations/partner-applications/{application.id}/claim/",
        {"expected_version": application.version},
        format="json",
    )
    pending_scan = operations_client.post(
        f"/api/v1/operations/partner-documents/{document.id}/access/",
        format="json",
    )
    record_partner_document_scan_result(document_id=document.id, is_clean=True)
    access = operations_client.post(
        f"/api/v1/operations/partner-documents/{document.id}/access/",
        format="json",
    )
    assigned = operations_client.get(
        "/api/v1/operations/partner-applications/",
        {"assigned_to_me": "true"},
    )

    assert queue.status_code == HTTPStatus.OK
    assert [item["id"] for item in queue.json()["results"]] == [str(application.id)]
    assert detail.status_code == HTTPStatus.OK
    assert "object_key" not in detail.content.decode()
    assert before_claim.status_code == HTTPStatus.CONFLICT
    assert claimed.status_code == HTTPStatus.OK
    assert claimed.json()["status"] == PartnerApplication.Status.UNDER_REVIEW
    assert claimed.json()["review_assigned_to_id"] == str(operations_user.id)
    assert pending_scan.status_code == HTTPStatus.CONFLICT
    assert access.status_code == HTTPStatus.OK
    assert access.json()["review_url"].startswith("https://storage.test/review/")
    assert assigned.status_code == HTTPStatus.OK
    assert [item["id"] for item in assigned.json()["results"]] == [str(application.id)]
    assert AccessAuditEvent.objects.filter(
        actor=operations_user,
        action="operations.partner_application.read",
        object_id=application.id,
        decision=AccessAuditEvent.Decision.ALLOWED,
    ).exists()
    assert AccessAuditEvent.objects.filter(
        actor=operations_user,
        action="operations.partner_document.reveal",
        object_id=document.id,
        decision=AccessAuditEvent.Decision.ALLOWED,
    ).exists()
    denied_reveals = AccessAuditEvent.objects.filter(
        actor=operations_user,
        action="operations.partner_document.reveal",
        object_id=document.id,
        decision=AccessAuditEvent.Decision.DENIED,
    )
    assert denied_reveals.count() == DENIED_REVEAL_COUNT
    assert {event.metadata["error_code"] for event in denied_reveals} == {
        "partner_review_ownership_conflict",
        "partner_transition_not_allowed",
    }


def test_operations_queue_has_bounded_cursor_pagination_oldest_first(
    operations_user: User,
) -> None:
    expected_ids: list[str] = []
    now = timezone.now()
    application_count = 26
    for index in range(application_count):
        user = User.objects.create_user(
            phone_number=f"+91810000{index:04d}",
            full_name=f"Applicant {index:02d}",
        )
        partner = PartnerProfile.objects.create(
            user=user,
            display_name=f"Applicant {index:02d}",
        )
        application = PartnerApplication.objects.create(
            partner=partner,
            status=PartnerApplication.Status.SUBMITTED,
            submitted_at=now - timedelta(minutes=application_count - index),
        )
        expected_ids.append(str(application.id))
    client = force_role_client(user=operations_user, role_code="operations")

    first_page = client.get("/api/v1/operations/partner-applications/")
    next_url = first_page.json()["next"]
    second_page = client.get(urlsplit(next_url).path + "?" + urlsplit(next_url).query)
    actual_ids = [item["id"] for item in first_page.json()["results"]]
    actual_ids.extend(item["id"] for item in second_page.json()["results"])

    assert first_page.status_code == HTTPStatus.OK
    assert len(first_page.json()["results"]) == OPERATIONS_QUEUE_PAGE_SIZE
    assert second_page.status_code == HTTPStatus.OK
    assert actual_ids == expected_ids


def test_document_replacement_supersedes_only_after_new_approval(
    partner_setup: PartnerSetup,
    operations_user: object,
) -> None:
    approved = _approve_application(partner_setup, operations_user)
    first = PartnerDocument.objects.get(application=approved, version=1)
    approved.status = PartnerApplication.Status.CHANGES_REQUIRED
    approved.save(update_fields=("status",))
    replacement_response = upload_partner_document(
        partner_setup.client,
        expected_version=approved.version,
        size_bytes=2000,
        sha256="d" * 64,
    )
    assert replacement_response.status_code == HTTPStatus.CREATED
    record_partner_document_scan_result(
        document_id=replacement_response.json()["id"],
        is_clean=True,
    )
    first.refresh_from_db()
    assert first.status == PartnerDocument.Status.APPROVED

    operations_client = force_role_client(user=operations_user, role_code="operations")
    reviewed = operations_client.post(
        f"/api/v1/operations/partner-documents/{replacement_response.json()['id']}/review/",
        {"decision": "APPROVED", "reason": "Replacement verified."},
        format="json",
    )
    assert reviewed.status_code == HTTPStatus.OK
    first.refresh_from_db()
    assert first.status == PartnerDocument.Status.SUPERSEDED


def test_unapproved_partner_cannot_go_online(partner_setup: PartnerSetup) -> None:
    created = partner_setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(partner_setup),
        format="json",
    )
    assert created.status_code == HTTPStatus.CREATED
    response = partner_setup.client.post(
        "/api/v1/partner/presence/online/",
        {
            "service_area_id": str(partner_setup.service_area.id),
            "latitude": "17.414053",
            "longitude": "78.353554",
            "accuracy_m": 25,
            "consent_version": "location-v1",
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.FORBIDDEN


def test_online_heartbeat_offline_uses_redis_truth_and_coarse_location(
    partner_setup: PartnerSetup,
    operations_user: object,
) -> None:
    application = _approve_application(partner_setup, operations_user)
    online = partner_setup.client.post(
        "/api/v1/partner/presence/online/",
        {
            "service_area_id": str(partner_setup.service_area.id),
            "latitude": "17.414053",
            "longitude": "78.353554",
            "accuracy_m": 25,
            "consent_version": "location-v1",
        },
        format="json",
    )
    assert online.status_code == HTTPStatus.CREATED
    session_id = online.json()["id"]
    session = PartnerOnlineSession.objects.get(id=session_id)
    location = PartnerLocation.objects.get(partner=application.partner)
    assert location.latitude == Decimal("17.414")
    assert location.longitude == Decimal("78.354")
    assert partner_presence_state(application.partner).is_online is True
    assert instant_matching_presence(application.partner) is not None

    heartbeat = partner_setup.client.post(
        "/api/v1/partner/presence/heartbeat/",
        {
            "session_id": session_id,
            "latitude": "17.415100",
            "longitude": "78.355100",
            "accuracy_m": 20,
            "consent_version": "location-v1",
        },
        format="json",
    )
    assert heartbeat.status_code == HTTPStatus.OK
    assert heartbeat.json()["server_now"]
    location.refresh_from_db()
    assert location.latitude == Decimal("17.415")
    assert location.longitude == Decimal("78.355")

    offline = partner_setup.client.post(
        "/api/v1/partner/presence/offline/",
        {"session_id": session_id},
        format="json",
    )
    assert offline.status_code == HTTPStatus.NO_CONTENT
    session.refresh_from_db()
    assert session.end_reason == PartnerOnlineSession.EndReason.PARTNER_OFFLINE
    assert partner_presence_state(application.partner).is_online is False


def test_instant_matching_presence_fails_closed_for_missing_or_stale_location(
    partner_setup: PartnerSetup,
    operations_user: object,
) -> None:
    application = _approve_application(partner_setup, operations_user)
    online = partner_setup.client.post(
        "/api/v1/partner/presence/online/",
        {
            "service_area_id": str(partner_setup.service_area.id),
            "latitude": "17.414",
            "longitude": "78.354",
            "accuracy_m": 20,
            "consent_version": "location-v1",
        },
        format="json",
    )
    assert online.status_code == HTTPStatus.CREATED
    location = PartnerLocation.objects.get(partner=application.partner)
    location.captured_at = location.captured_at - timedelta(minutes=31)
    location.save(update_fields=("captured_at",))

    assert partner_presence_state(application.partner).is_online is True
    assert instant_matching_presence(application.partner) is None

    location.delete()
    assert instant_matching_presence(application.partner) is None


def test_presence_fails_closed_and_compensates_when_cache_is_unavailable(
    partner_setup: PartnerSetup,
    operations_user: object,
) -> None:
    application = _approve_application(partner_setup, operations_user)
    with patch("apps.partners.services.cache.set", side_effect=OSError("redis unavailable")):
        response = partner_setup.client.post(
            "/api/v1/partner/presence/online/",
            {
                "service_area_id": str(partner_setup.service_area.id),
                "latitude": "17.414",
                "longitude": "78.354",
                "accuracy_m": 20,
                "consent_version": "location-v1",
            },
            format="json",
        )

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["retryable"] is True
    session = PartnerOnlineSession.objects.get(partner=application.partner)
    assert session.end_reason == PartnerOnlineSession.EndReason.PRESENCE_EXPIRED


def test_presence_reconciliation_closes_sessions_missing_from_redis(
    partner_setup: PartnerSetup,
    operations_user: object,
) -> None:
    application = _approve_application(partner_setup, operations_user)
    online = partner_setup.client.post(
        "/api/v1/partner/presence/online/",
        {
            "service_area_id": str(partner_setup.service_area.id),
            "latitude": "17.414",
            "longitude": "78.354",
            "accuracy_m": 20,
            "consent_version": "location-v1",
        },
        format="json",
    )
    session = PartnerOnlineSession.objects.get(id=online.json()["id"])
    cache.delete(presence_cache_key(application.partner_id))

    assert expire_missing_presence_sessions() == 1
    session.refresh_from_db()
    assert session.end_reason == PartnerOnlineSession.EndReason.PRESENCE_EXPIRED
