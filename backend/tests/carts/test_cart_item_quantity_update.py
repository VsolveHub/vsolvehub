"""The quantity stepper's round-trip.

`GET /cart/` publishes the scope Django itself persisted, and for every seeded A1
variant that scope carries the derived `quantity` answer.  A Customer raising the
quantity re-sends that published scope alongside the new canonical `quantity`, so
the derived mirror has to follow the canonical field instead of vetoing it.  These
regressions cover that round-trip and the sibling answers it must not disturb.
"""

from http import HTTPStatus
from typing import Any, cast

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.catalog.models import ServiceVariant
from apps.identity.models import User

pytestmark = pytest.mark.django_db

SLUG = "switch-socket-repair"
RAISED_QUANTITY = 3


def _customer_client() -> APIClient:
    customer = User.objects.create_user(phone_number="+919876543210")
    client = APIClient()
    client.force_authenticate(customer)
    return client


def _cart_with_one_item(client: APIClient) -> dict[str, Any]:
    cart = client.get("/api/v1/cart/")
    assert cart.status_code == HTTPStatus.OK
    variant = ServiceVariant.objects.get(service__slug=SLUG)
    response = client.post(
        "/api/v1/cart/items/",
        {
            "expected_cart_version": cart.json()["version"],
            "variant_id": str(variant.id),
            "quantity": 1,
            "scope": {"quantity": 1},
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED
    return cast(dict[str, Any], response.json())


def test_raising_quantity_accepts_the_scope_django_published() -> None:
    call_command("seed_technician_catalog")
    client = _customer_client()
    cart = _cart_with_one_item(client)
    item = cart["items"][0]
    # Exactly what a client holds: the scope as Django published it, whose
    # `quantity` is still the pre-edit value because only the canonical field moved.
    assert item["scope"]["quantity"] == 1

    response = client.patch(
        f"/api/v1/cart/items/{item['id']}/",
        {
            "expected_cart_version": cart["version"],
            "expected_item_version": item["version"],
            "quantity": RAISED_QUANTITY,
            "scope": item["scope"],
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    updated = response.json()["items"][0]
    assert updated["quantity"] == RAISED_QUANTITY
    assert updated["scope"]["quantity"] == RAISED_QUANTITY


def test_raising_quantity_keeps_the_other_scope_answers() -> None:
    """The derived mirror follows the canonical field without touching its siblings."""
    call_command("seed_technician_catalog")
    client = _customer_client()
    cart = _cart_with_one_item(client)
    item = cart["items"][0]

    response = client.patch(
        f"/api/v1/cart/items/{item['id']}/",
        {
            "expected_cart_version": cart["version"],
            "expected_item_version": item["version"],
            "quantity": RAISED_QUANTITY,
            "scope": item["scope"],
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    updated = response.json()["items"][0]
    published_answers = set(item["scope"]).difference({"quantity"})
    assert all(updated["scope"][code] == item["scope"][code] for code in published_answers)
