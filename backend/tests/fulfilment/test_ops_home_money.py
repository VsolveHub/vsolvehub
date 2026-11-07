"""`GET /ops/home-services/money`: home-service money was not reported anywhere before."""

import uuid
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.commerce.models import PaymentAttempt
from apps.identity.models import Role, User, UserRole
from tests.fulfilment.conftest import create_booked_group
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)


def _operations_client() -> APIClient:
    user = User.objects.create_user(phone_number=f"+9197{uuid.uuid4().int % 10**8:08d}")
    role, _created = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="operations")


def _total(body: dict, key: str) -> int:
    return next(row["value"] for row in body["totals"] if row["key"] == key)


# --- Home services money ----------------------------------------------------------------------


def test_home_money_counts_a_captured_visit_payment_once() -> None:
    booked = create_booked_group(key_prefix="ops-home-money")
    client = _operations_client()

    body = client.get("/api/v1/ops/home-services/money", {"period": "this_month"}).json()
    payments = client.get("/api/v1/ops/home-services/money/payments").json()

    assert _total(body, "payments") >= 1
    assert _total(body, "collected") >= booked.unit.total_paise
    row = next(p for p in payments if p["payer_phone"] == booked.customer.phone_number)
    assert row["item"], "the paid row names the services"
    assert row["refunded_paise"] == 0


def test_home_money_never_counts_another_services_payment() -> None:
    client = _operations_client()
    before = _total(client.get("/api/v1/ops/home-services/money").json(), "collected")
    PaymentAttempt.objects.create(
        purpose=PaymentAttempt.Purpose.WALLET_TOP_UP,
        provider="fake",
        amount_paise=50_000,
        currency="INR",
        status=PaymentAttempt.Status.CAPTURED,
        captured_at=timezone.now(),
    )

    after = _total(client.get("/api/v1/ops/home-services/money").json(), "collected")

    assert after == before


def test_home_money_refuses_an_unknown_period() -> None:
    response = _operations_client().get("/api/v1/ops/home-services/money", {"period": "forever"})

    assert response.status_code == HTTPStatus.BAD_REQUEST
