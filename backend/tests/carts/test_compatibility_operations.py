from datetime import timedelta
from http import HTTPStatus

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.carts.models import ServiceCompatibilityRule
from apps.catalog.models import ServiceVariant
from apps.identity.models import AccessAuditEvent, Role, User, UserRole
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db


def _operations_user(*, phone: str) -> User:
    role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    user = User.objects.create_user(phone_number=phone)
    UserRole.objects.create(user=user, role=role)
    return user


def _pair() -> tuple[ServiceVariant, ServiceVariant]:
    call_command("seed_technician_catalog")
    return (
        ServiceVariant.objects.get(service__slug="switch-socket-repair"),
        ServiceVariant.objects.get(service__slug="fan-installation"),
    )


def _draft_payload(
    left: ServiceVariant,
    right: ServiceVariant,
    *,
    conditions: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "left_variant_id": str(left.id),
        "right_variant_id": str(right.id),
        "mode": ServiceCompatibilityRule.Mode.MUST_BE_SEPARATE,
        "dependency": ServiceCompatibilityRule.Dependency.NONE,
        "conditions": conditions or {},
        "effective_from": (timezone.now() + timedelta(days=1)).isoformat(),
        "effective_to": None,
        "change_reason": "Separate these variants after the reviewed safety assessment.",
    }


def test_compatibility_lifecycle_requires_operations_and_independent_review() -> None:
    left, right = _pair()
    maker = _operations_user(phone="+919876540001")
    checker = _operations_user(phone="+919876540002")
    ordinary_user = User.objects.create_user(phone_number="+919876540003")

    forbidden = APIClient()
    forbidden.force_authenticate(ordinary_user)
    denied = forbidden.post(
        "/api/v1/operations/compatibility-rules/",
        _draft_payload(left, right),
        format="json",
    )
    assert denied.status_code == HTTPStatus.FORBIDDEN

    maker_client = force_role_client(user=maker, role_code="operations")
    created = maker_client.post(
        "/api/v1/operations/compatibility-rules/",
        _draft_payload(right, left),
        format="json",
    )
    assert created.status_code == HTTPStatus.CREATED, created.json()
    draft = created.json()
    assert draft["lifecycle_status"] == ServiceCompatibilityRule.LifecycleStatus.DRAFT
    assert draft["left_variant_id"] < draft["right_variant_id"]

    self_review = maker_client.post(
        f"/api/v1/operations/compatibility-rules/{draft['id']}/activate/",
        {
            "expected_version": draft["version"],
            "review_reason": "I should not be permitted to approve my own change.",
        },
        format="json",
    )
    assert self_review.status_code == HTTPStatus.CONFLICT
    assert self_review.json()["error"]["details"]["reason"] == "maker_checker_required"

    checker_client = force_role_client(user=checker, role_code="operations")
    activated = checker_client.post(
        f"/api/v1/operations/compatibility-rules/{draft['id']}/activate/",
        {
            "expected_version": draft["version"],
            "review_reason": "Independent safety review completed with supporting evidence.",
        },
        format="json",
    )
    assert activated.status_code == HTTPStatus.OK, activated.json()
    assert activated.json()["lifecycle_status"] == (ServiceCompatibilityRule.LifecycleStatus.ACTIVE)
    assert activated.json()["reviewed_by_id"] == str(checker.id)
    previous = ServiceCompatibilityRule.objects.get(
        left_variant_id=activated.json()["left_variant_id"],
        right_variant_id=activated.json()["right_variant_id"],
        version=1,
    )
    assert previous.effective_to is not None
    assert AccessAuditEvent.objects.filter(
        actor=maker,
        action="operations.compatibility_rule.create_draft",
        object_id=draft["id"],
    ).exists()
    assert AccessAuditEvent.objects.filter(
        actor=checker,
        action="operations.compatibility_rule.activate",
        object_id=draft["id"],
    ).exists()


def test_activation_fails_closed_for_unevaluated_conditions() -> None:
    left, right = _pair()
    maker = _operations_user(phone="+919876540011")
    checker = _operations_user(phone="+919876540012")
    maker_client = force_role_client(user=maker, role_code="operations")
    created = maker_client.post(
        "/api/v1/operations/compatibility-rules/",
        _draft_payload(left, right, conditions={"requires_certification": "electrical"}),
        format="json",
    ).json()

    response = force_role_client(user=checker, role_code="operations").post(
        f"/api/v1/operations/compatibility-rules/{created['id']}/activate/",
        {
            "expected_version": created["version"],
            "review_reason": "The condition evaluator must exist before this can be active.",
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["details"]["reason"] == "conditions_not_supported"
    assert ServiceCompatibilityRule.objects.get(id=created["id"]).lifecycle_status == (
        ServiceCompatibilityRule.LifecycleStatus.DRAFT
    )


def test_reject_and_retire_preserve_audited_history() -> None:
    left, right = _pair()
    maker = _operations_user(phone="+919876540021")
    checker = _operations_user(phone="+919876540022")
    maker_client = force_role_client(user=maker, role_code="operations")
    checker_client = force_role_client(user=checker, role_code="operations")
    rejected_draft = maker_client.post(
        "/api/v1/operations/compatibility-rules/",
        _draft_payload(left, right),
        format="json",
    ).json()
    rejected = checker_client.post(
        f"/api/v1/operations/compatibility-rules/{rejected_draft['id']}/reject/",
        {
            "expected_version": rejected_draft["version"],
            "review_reason": "Evidence does not support the requested compatibility change.",
        },
        format="json",
    )
    assert rejected.status_code == HTTPStatus.OK
    assert rejected.json()["lifecycle_status"] == (
        ServiceCompatibilityRule.LifecycleStatus.REJECTED
    )

    current = ServiceCompatibilityRule.objects.get(
        left_variant_id__in=(left.id, right.id),
        right_variant_id__in=(left.id, right.id),
        version=1,
    )
    retired = checker_client.post(
        f"/api/v1/operations/compatibility-rules/{current.id}/retire/",
        {
            "expected_version": current.version,
            "reason": "Retired after a new safety policy invalidated this reviewed rule.",
        },
        format="json",
    )
    assert retired.status_code == HTTPStatus.OK, retired.json()
    assert retired.json()["lifecycle_status"] == (ServiceCompatibilityRule.LifecycleStatus.RETIRED)
    history = checker_client.get(
        "/api/v1/operations/compatibility-rules/",
        {"variant_id": str(left.id)},
    )
    assert history.status_code == HTTPStatus.OK
    assert {entry["id"] for entry in history.json()["results"]} >= {
        str(current.id),
        rejected_draft["id"],
    }
    assert AccessAuditEvent.objects.filter(
        action="operations.compatibility_rule.reject",
        object_id=rejected_draft["id"],
    ).exists()
    assert AccessAuditEvent.objects.filter(
        action="operations.compatibility_rule.retire",
        object_id=current.id,
    ).exists()
