from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.locations.models import Address

pytestmark = pytest.mark.django_db


def _payload(*, label: str, postal_code: str = "500032") -> dict[str, object]:
    return {
        "label": label,
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
        "is_default": False,
    }


def test_address_default_switch_and_soft_delete() -> None:
    user = User.objects.create_user(phone_number="+919876543210")
    client = APIClient()
    client.force_authenticate(user)

    first = client.post("/api/v1/addresses/", _payload(label="Home"), format="json")
    second = client.post("/api/v1/addresses/", _payload(label="Office"), format="json")

    assert first.status_code == HTTPStatus.CREATED
    assert first.json()["is_default"] is True
    assert second.status_code == HTTPStatus.CREATED
    assert second.json()["is_default"] is False

    make_default = client.patch(
        f"/api/v1/addresses/{second.json()['id']}/",
        {"is_default": True},
        format="json",
    )
    assert make_default.status_code == HTTPStatus.OK
    assert make_default.json()["is_default"] is True
    assert Address.objects.get(id=first.json()["id"]).is_default is False

    removed = client.delete(f"/api/v1/addresses/{second.json()['id']}/")
    assert removed.status_code == HTTPStatus.NO_CONTENT
    assert Address.objects.get(id=second.json()["id"]).archived_at is not None
    assert Address.objects.get(id=first.json()["id"]).is_default is True


def test_customer_cannot_read_another_customers_address() -> None:
    owner = User.objects.create_user(phone_number="+919876543210")
    stranger = User.objects.create_user(phone_number="+919876543211")
    owner_client = APIClient()
    owner_client.force_authenticate(owner)
    created = owner_client.post("/api/v1/addresses/", _payload(label="Home"), format="json")

    stranger_client = APIClient()
    stranger_client.force_authenticate(stranger)
    response = stranger_client.get(f"/api/v1/addresses/{created.json()['id']}/")

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_invalid_postal_code_uses_validation_envelope() -> None:
    user = User.objects.create_user(phone_number="+919876543210")
    client = APIClient()
    client.force_authenticate(user)

    response = client.post(
        "/api/v1/addresses/",
        _payload(label="Home", postal_code="Hyderabad"),
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["details"]["postal_code"][0]["code"] == "invalid_postal_code"


def test_addresses_require_authentication() -> None:
    response = APIClient().get("/api/v1/addresses/")

    assert response.status_code in {HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN}
