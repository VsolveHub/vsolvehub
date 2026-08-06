"""`POST /api/v1/cart/scheduling-groups/` — the read the slot picker is built from."""

from http import HTTPStatus

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.catalog.models import ServiceVariant
from apps.identity.models import User

pytestmark = pytest.mark.django_db

TWO_GROUPS = 2


def _address_payload(postal_code: str = "500032") -> dict[str, object]:
    return {
        "label": "Home",
        "line1": "1 Vsolve Street",
        "line2": "",
        "landmark": "Near the park",
        "locality": "Khajaguda",
        "city": "Hyderabad",
        "state": "Telangana",
        "postal_code": postal_code,
        "country_code": "IN",
        "latitude": "17.414053",
        "longitude": "78.353554",
        "source": "MANUAL",
        "is_default": True,
    }


def _customer_context(phone: str = "+919876543210") -> tuple[APIClient, User, str, int]:
    call_command("seed_technician_catalog")
    customer = User.objects.create_user(phone_number=phone)
    client = APIClient()
    client.force_authenticate(customer)
    cart = client.get("/api/v1/cart/")
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    return client, customer, address.json()["id"], cart.json()["version"]


def _add_item(client: APIClient, *, slug: str, cart_version: int) -> dict[str, object]:
    variant = ServiceVariant.objects.get(service__slug=slug)
    response = client.post(
        "/api/v1/cart/items/",
        {
            "expected_cart_version": cart_version,
            "variant_id": str(variant.id),
            "quantity": 1,
            "scope": {"quantity": 1},
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return response.json()


def _groups(client: APIClient, *, address_id: str, cart_version: int) -> dict[str, object]:
    return client.post(
        "/api/v1/cart/scheduling-groups/",
        {"address_id": address_id, "expected_cart_version": cart_version},
        format="json",
    )


def test_incompatible_services_produce_one_visit_each() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="tap-repair", cart_version=int(first["version"]))

    response = _groups(client, address_id=address_id, cart_version=int(second["version"]))

    assert response.status_code == HTTPStatus.OK, response.json()
    body = response.json()
    assert body["cart_version"] == int(second["version"])
    assert len(body["groups"]) == TWO_GROUPS
    assert all(group["key"] for group in body["groups"])
    assert all(group["label"] for group in body["groups"])
    assert all(group["estimated_duration_minutes"] > 0 for group in body["groups"])
    assert all(len(group["cart_item_ids"]) == 1 for group in body["groups"])


def test_sequential_compatible_services_produce_one_visit() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="fan-installation", cart_version=int(first["version"]))

    response = _groups(client, address_id=address_id, cart_version=int(second["version"]))

    assert response.status_code == HTTPStatus.OK
    groups = response.json()["groups"]
    assert len(groups) == 1
    assert len(groups[0]["cart_item_ids"]) == TWO_GROUPS


def test_stale_cart_version_is_refused() -> None:
    """The grouping is only meaningful for the cart the Customer is looking at."""
    client, _customer, address_id, version = _customer_context()
    item = _add_item(client, slug="switch-socket-repair", cart_version=version)

    response = _groups(
        client,
        address_id=address_id,
        cart_version=int(item["version"]) + 5,
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "cart_version_conflict"


def test_another_customers_address_is_not_found() -> None:
    client, _customer, _address_id, version = _customer_context()
    item = _add_item(client, slug="switch-socket-repair", cart_version=version)

    other = User.objects.create_user(phone_number="+919876500011")
    other_client = APIClient()
    other_client.force_authenticate(other)
    other_client.get("/api/v1/cart/")
    other_address = other_client.post("/api/v1/addresses/", _address_payload(), format="json")

    response = _groups(
        client,
        address_id=other_address.json()["id"],
        cart_version=int(item["version"]),
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_an_empty_cart_cannot_be_grouped() -> None:
    client, _customer, address_id, version = _customer_context()

    response = _groups(client, address_id=address_id, cart_version=version)

    assert response.status_code in {HTTPStatus.BAD_REQUEST, HTTPStatus.CONFLICT}


def test_anonymous_callers_are_refused() -> None:
    call_command("seed_technician_catalog")
    client = APIClient()

    response = client.post(
        "/api/v1/cart/scheduling-groups/",
        {"address_id": "00000000-0000-0000-0000-000000000000", "expected_cart_version": 1},
        format="json",
    )

    assert response.status_code in {HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN}
