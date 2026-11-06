"""`GET /operations/requests/` and `/ops/workforce/money`: the Workforce page showed only stuck
requests and no money before."""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.commerce.models import PaymentAttempt
from apps.identity.models import Role, User, UserRole
from apps.requirements.models import CustomerRequirement
from apps.requirements.operations import STUCK_QUEUE_CODES, stuck_queues
from tests.helpers import force_role_client
from tests.requirements.conftest import M2World, draft_requirement, submitted_requirement

pytestmark = pytest.mark.django_db(transaction=True)


def _operations_client() -> APIClient:
    user = User.objects.create_user(phone_number=f"+9197{uuid.uuid4().int % 10**8:08d}")
    role, _created = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="operations")


def _total(body: dict, key: str) -> int:
    return next(row["value"] for row in body["totals"] if row["key"] == key)


# --- Workforce & projects ---------------------------------------------------------------------


def test_requests_list_shows_every_request_not_only_stuck_ones(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    client = _operations_client()

    response = client.get("/api/v1/operations/requests/")
    by_phone = client.get(
        "/api/v1/operations/requests/", {"q": requirement.customer.phone_number}
    ).json()["results"]

    assert response.status_code == HTTPStatus.OK
    row = next(r for r in response.json()["results"] if r["id"] == str(requirement.id))
    assert row["customer_phone"] == requirement.customer.phone_number
    assert row["service_name"]
    assert row["engagement_id"] is None
    assert [r["id"] for r in by_phone] == [str(requirement.id)]


def test_requests_list_filters_open_and_refuses_an_unknown_archetype(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    client = _operations_client()

    open_ids = {
        r["id"]
        for r in client.get("/api/v1/operations/requests/", {"open": "true"}).json()["results"]
    }
    refused = client.get("/api/v1/operations/requests/", {"archetype": "A1_FIXED"})

    assert str(requirement.id) in open_ids
    assert refused.status_code == HTTPStatus.BAD_REQUEST


def test_workforce_money_keeps_vendor_money_out_of_vsolve_fees() -> None:
    client = _operations_client()
    before = client.get("/api/v1/ops/workforce/money").json()
    for purpose in (
        PaymentAttempt.Purpose.M2_SITE_VISIT_FEE,
        PaymentAttempt.Purpose.M2_STAGE_FUNDING,
    ):
        PaymentAttempt.objects.create(
            purpose=purpose,
            provider="fake",
            amount_paise=10_000,
            currency="INR",
            status=PaymentAttempt.Status.CAPTURED,
            captured_at=timezone.now(),
        )

    after = client.get("/api/v1/ops/workforce/money").json()
    payments = client.get("/api/v1/ops/workforce/money/payments").json()

    assert _total(after, "visits") - _total(before, "visits") == 10_000
    assert _total(after, "project") - _total(before, "project") == 10_000
    assert _total(after, "fees") == _total(before, "fees")
    stage = next(p for p in payments if p["item"].startswith("Project stage"))
    assert stage["platform_paise"] == 0


# --- Stuck queues as a filter on the requests list --------------------------------------------


def test_stuck_filter_lists_the_requests_in_one_queue(world: M2World) -> None:
    """The Stuck tab showed only how deep each queue was; the list now shows who is in it."""
    # A draft has invited nobody; moving it to MATCHING puts it in the "unmatched" queue.
    requirement = draft_requirement(world=world)
    requirement.status = CustomerRequirement.Status.MATCHING
    requirement.service_by = None
    requirement.save(update_fields=("status", "service_by"))
    client = _operations_client()

    def ids(code: str) -> set[str]:
        response = client.get("/api/v1/operations/requests/", {"stuck": code})
        assert response.status_code == HTTPStatus.OK
        return {row["id"] for row in response.json()["results"]}

    assert str(requirement.id) in ids("unmatched")
    assert str(requirement.id) not in ids("sla_breached")

    requirement.service_by = timezone.localdate() - timedelta(days=1)
    requirement.save(update_fields=("service_by",))
    assert str(requirement.id) in ids("sla_breached")


def test_stuck_filter_refuses_an_unknown_queue() -> None:
    response = _operations_client().get("/api/v1/operations/requests/", {"stuck": "lost"})

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_every_stuck_queue_can_be_listed() -> None:
    """The filter's allowed codes and the published queues are the same eight, in the same order."""
    assert tuple(queue.code for queue in stuck_queues()) == STUCK_QUEUE_CODES
