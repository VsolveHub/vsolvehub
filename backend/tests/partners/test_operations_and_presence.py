from datetime import timedelta
from decimal import Decimal
from http import HTTPStatus
from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.partners.models import (
    PartnerApplication,
    PartnerDocument,
    PartnerLocation,
    PartnerOnlineSession,
)
from apps.partners.selectors import (
    instant_matching_presence,
    partner_presence_state,
    presence_cache_key,
)
from apps.partners.services import expire_missing_presence_sessions
from tests.partners.conftest import PartnerSetup, application_payload

pytestmark = pytest.mark.django_db

APPROVAL_TRANSITION_COUNT = 4


def _submitted_application(setup: PartnerSetup) -> tuple[PartnerApplication, PartnerDocument]:
    created = setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(setup),
        format="json",
    ).json()
    application = PartnerApplication.objects.get(partner__user=setup.user)
    document_response = setup.client.post(
        "/api/v1/partner/application/documents/",
        {
            "expected_version": created["version"],
            "kind": "GOVERNMENT_ID",
            "object_key": f"partners/{application.partner_id}/identity.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 1000,
            "sha256": "c" * 64,
        },
        format="json",
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
    client = APIClient()
    client.force_authenticate(user=operations_user)
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

    operations_client = APIClient()
    operations_client.force_authenticate(user=operations_user)
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


def test_document_replacement_supersedes_only_after_new_approval(
    partner_setup: PartnerSetup,
    operations_user: object,
) -> None:
    approved = _approve_application(partner_setup, operations_user)
    first = PartnerDocument.objects.get(application=approved, version=1)
    approved.status = PartnerApplication.Status.CHANGES_REQUIRED
    approved.save(update_fields=("status",))
    replacement_response = partner_setup.client.post(
        "/api/v1/partner/application/documents/",
        {
            "expected_version": approved.version,
            "kind": "GOVERNMENT_ID",
            "object_key": f"partners/{approved.partner_id}/identity-v2.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 2000,
            "sha256": "d" * 64,
        },
        format="json",
    )
    assert replacement_response.status_code == HTTPStatus.CREATED
    first.refresh_from_db()
    assert first.status == PartnerDocument.Status.APPROVED

    operations_client = APIClient()
    operations_client.force_authenticate(user=operations_user)
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
