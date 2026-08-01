from http import HTTPStatus

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.identity.models import AccessAuditEvent, Role, User, UserRole, UserSession
from apps.identity.services import grant_role

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


def _authenticated_client() -> tuple[APIClient, User]:
    client = APIClient()
    issued = client.post(
        "/api/v1/auth/otp/request/",
        {"phone_number": "9876543210"},
        format="json",
    ).json()
    verified = client.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": issued["challenge_id"],
            "phone_number": "9876543210",
            "code": issued["development_code"],
        },
        format="json",
    )
    assert verified.status_code == HTTPStatus.OK
    return client, User.objects.get(phone_number="+919876543210")


def test_session_role_switch_requires_an_existing_grant() -> None:
    client, user = _authenticated_client()
    partner_role = Role.objects.create(code="partner", name="Partner", is_system=True)
    UserRole.objects.create(user=user, role=partner_role)

    switched = client.post("/api/v1/auth/roles/switch/", {"role": "partner"}, format="json")

    assert switched.status_code == HTTPStatus.OK
    assert switched.json() == {"active_role": "partner"}
    assert UserSession.objects.get(user=user).active_role == partner_role
    assert AccessAuditEvent.objects.filter(action="identity.role_switched", actor=user).exists()

    unavailable = client.post("/api/v1/auth/roles/switch/", {"role": "finance"}, format="json")
    assert unavailable.status_code == HTTPStatus.FORBIDDEN


def test_operations_api_requires_selected_unrevoked_role_and_audits_decisions() -> None:
    client, user = _authenticated_client()
    operations_role = Role.objects.create(code="operations", name="Operations", is_system=True)
    grant = UserRole.objects.create(user=user, role=operations_role)

    inactive_role = client.post(
        "/api/v1/operations/assisted-checkouts/",
        {},
        format="json",
    )
    assert inactive_role.status_code == HTTPStatus.FORBIDDEN

    switched = client.post(
        "/api/v1/auth/roles/switch/",
        {"role": "operations"},
        format="json",
    )
    assert switched.status_code == HTTPStatus.OK
    authorized_boundary = client.post(
        "/api/v1/operations/assisted-checkouts/",
        {},
        format="json",
    )
    assert authorized_boundary.status_code == HTTPStatus.BAD_REQUEST

    grant.revoked_at = grant.granted_at
    grant.save(update_fields=("revoked_at",))
    revoked_grant = client.post(
        "/api/v1/operations/assisted-checkouts/",
        {},
        format="json",
    )
    assert revoked_grant.status_code == HTTPStatus.FORBIDDEN

    decisions = list(
        AccessAuditEvent.objects.filter(action="authorization.operations_api")
        .order_by("created_at")
        .values_list("decision", flat=True)
    )
    assert decisions == [
        AccessAuditEvent.Decision.DENIED,
        AccessAuditEvent.Decision.ALLOWED,
        AccessAuditEvent.Decision.DENIED,
    ]


def test_role_grant_rejects_self_assignment() -> None:
    user = User.objects.create_user(phone_number="9876543210")
    role = Role.objects.create(code="operations", name="Operations", is_system=True)

    with pytest.raises(PermissionError):
        grant_role(actor=user, user=user, role=role)


def test_customer_can_record_consent_preferences_and_privacy_request() -> None:
    client, user = _authenticated_client()

    consent = client.post(
        "/api/v1/auth/privacy/consents/",
        {"purpose": "privacy-notice", "policy_version": "2026-07-31"},
        format="json",
    )
    preference = client.put(
        "/api/v1/auth/privacy/preferences/",
        {"channel": "SMS", "purpose": "marketing", "is_enabled": False},
        format="json",
    )
    privacy_request = client.post(
        "/api/v1/auth/privacy/requests/",
        {"kind": "ACCESS"},
        format="json",
    )

    assert consent.status_code == HTTPStatus.CREATED
    assert consent.json()["purpose"] == "privacy-notice"
    assert preference.status_code == HTTPStatus.OK
    assert preference.json()["is_enabled"] is False
    assert privacy_request.status_code == HTTPStatus.CREATED
    assert privacy_request.json()["status"] == "RECEIVED"
    assert AccessAuditEvent.objects.filter(
        actor=user,
        action="identity.privacy_request_created",
    ).exists()
