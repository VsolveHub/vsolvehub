from datetime import time
from http import HTTPStatus

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.catalog.models import ServiceVariant
from apps.identity.models import ConsentReceipt, Role, User, UserRole
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db


def seed_available_partner(*, slug: str = "switch-socket-repair") -> PartnerProfile:
    """One approved Partner who can actually serve the window these tests book.

    The booking-windows grid publishes real capacity, so a world with no Partners
    has no bookable slots — correctly. Checkout tests are about quoting and
    idempotency, not about staffing, so they seed the one Partner that makes a
    window exist rather than asserting against an empty pool.
    """

    area = ServiceArea.objects.get(slug="hyderabad-500032")
    user = User.objects.create_user(phone_number="+919000000001")
    partner = PartnerProfile.objects.create(user=user, display_name="Checkout Partner")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    for variant in ServiceVariant.objects.filter(service__slug=slug):
        PartnerService.objects.create(partner=partner, variant=variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    for weekday in range(7):
        PartnerAvailabilityRule.objects.create(
            partner=partner,
            service_area=area,
            weekday=weekday,
            starts_at=time(8),
            ends_at=time(20),
        )
    return partner


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
    windows = client.post(
        "/api/v1/booking/windows/",
        {"address_id": address.json()["id"]},
        format="json",
    )
    assert windows.status_code == HTTPStatus.OK
    available_window = next(
        window
        for day in windows.json()["days"]
        for window in day["windows"]
        if window["is_available"]
    )
    quote = client.post(
        "/api/v1/quotes/",
        {"address_id": address.json()["id"], "window_id": available_window["id"]},
        format="json",
    )
    assert quote.status_code == HTTPStatus.CREATED
    return client, str(quote.json()["id"])


def test_checkout_is_server_quoted_and_idempotent() -> None:
    call_command("seed_technician_catalog")
    seed_available_partner()
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
    seed_available_partner()
    customer = User.objects.create_user(phone_number="+919876543210")
    _, quote_id = _customer_quote(customer=customer)
    operations = User.objects.create_user(phone_number="+919876543211", is_staff=True)
    operations_role = Role.objects.create(code="operations", name="Operations", is_system=True)
    UserRole.objects.create(user=operations, role=operations_role)
    client = force_role_client(user=operations, role_code="operations")
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
