from datetime import datetime, time, timedelta
from http import HTTPStatus
from zoneinfo import ZoneInfo

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import ServiceVariant
from apps.identity.models import ConsentReceipt, User

pytestmark = pytest.mark.django_db


def _address_payload() -> dict[str, object]:
    return {
        "label": "Home",
        "line1": "1 Vsolve Street",
        "line2": "",
        "landmark": "Near the park",
        "locality": "Khajaguda",
        "city": "Hyderabad",
        "state": "Telangana",
        "postal_code": "500032",
        "country_code": "IN",
        "latitude": "17.414053",
        "longitude": "78.353554",
        "source": "MANUAL",
        "is_default": True,
    }


def _requested_start() -> datetime:
    local_date = timezone.now().astimezone(ZoneInfo("Asia/Kolkata")).date() + timedelta(days=1)
    return datetime.combine(local_date, time(10, 0), tzinfo=ZoneInfo("Asia/Kolkata"))


def _customer_quote(*, customer: User) -> tuple[APIClient, str]:
    client = APIClient()
    client.force_authenticate(customer)
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    cart = client.put(
        "/api/v1/cart/",
        {"variant_id": str(variant.id), "quantity": 1, "scope": {"quantity": 1}},
        format="json",
    )
    assert cart.status_code == HTTPStatus.OK
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    quote = client.post(
        "/api/v1/quotes/",
        {"address_id": address.json()["id"], "requested_start": _requested_start().isoformat()},
        format="json",
    )
    assert quote.status_code == HTTPStatus.CREATED
    return client, str(quote.json()["id"])


def test_checkout_is_server_quoted_and_idempotent() -> None:
    call_command("seed_technician_catalog")
    customer = User.objects.create_user(phone_number="+919876543210")
    client, quote_id = _customer_quote(customer=customer)

    first = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_id, "total_paise": 1},
        format="json",
        HTTP_IDEMPOTENCY_KEY="checkout-1",
    )
    replay = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_id, "total_paise": 1},
        format="json",
        HTTP_IDEMPOTENCY_KEY="checkout-1",
    )

    assert first.status_code == HTTPStatus.CREATED
    assert replay.status_code == HTTPStatus.CREATED
    assert replay["Idempotent-Replay"] == "true"
    assert replay.json()["id"] == first.json()["id"]
    assert first.json()["status"] == "CREATED"

    duplicate = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="checkout-2",
    )
    assert duplicate.status_code == HTTPStatus.BAD_REQUEST


def test_assisted_checkout_requires_customer_consent_and_uses_same_quote() -> None:
    call_command("seed_technician_catalog")
    customer = User.objects.create_user(phone_number="+919876543210")
    _, quote_id = _customer_quote(customer=customer)
    operations = User.objects.create_user(phone_number="+919876543211", is_staff=True)
    client = APIClient()
    client.force_authenticate(operations)
    payload = {
        "customer_id": str(customer.id),
        "quote_id": quote_id,
        "consent_purpose": "assisted-booking",
        "consent_version": "v1",
    }

    denied = client.post(
        "/api/v1/operations/assisted-checkouts/",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="assisted-1",
    )
    ConsentReceipt.objects.create(
        user=customer, purpose="assisted-booking", policy_version="v1", source="test"
    )
    created = client.post(
        "/api/v1/operations/assisted-checkouts/",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="assisted-2",
    )

    assert denied.status_code == HTTPStatus.FORBIDDEN
    assert created.status_code == HTTPStatus.CREATED
