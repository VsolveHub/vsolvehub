from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from typing import Any, cast

import pytest
from django.core.management import call_command
from django.db import close_old_connections, connections
from django.utils import timezone
from rest_framework.test import APIClient

from apps.carts.exceptions import CartItemLimitReachedApiError
from apps.carts.models import Cart, CartItem, Quote
from apps.carts.services import replace_cart_item
from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.locations.models import ServiceAreaOperatingWindow
from tests.carts.test_checkout import seed_available_partner

pytestmark = pytest.mark.django_db
EXPECTED_BOOKING_DAY_COUNT = 8
SWITCH_VISIT_DURATION_MINUTES = 40


def _address_payload(*, label: str = "Home") -> dict[str, object]:
    return {
        "label": label,
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


def _booking_context() -> tuple[APIClient, User, dict[str, Any], dict[str, Any]]:
    call_command("seed_technician_catalog")
    # The grid publishes real capacity now, so a world with no Partners has no
    # bookable window to pick. These tests are about window signing, staleness and
    # quote completeness, not staffing.
    seed_available_partner()
    customer = User.objects.create_user(phone_number="+919876543210")
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
    return client, customer, address.json(), windows.json()


def _first_available_window(windows: dict[str, Any]) -> dict[str, Any]:
    return next(
        window for day in windows["days"] for window in day["windows"] if window["is_available"]
    )


def _create_quote(
    client: APIClient,
    address: dict[str, Any],
    windows: dict[str, Any],
) -> dict[str, Any]:
    response = client.post(
        "/api/v1/quotes/",
        {
            "address_id": address["id"],
            "window_id": _first_available_window(windows)["id"],
            "requested_start": "2000-01-01T00:00:00Z",
            "total_paise": 1,
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED
    return cast(dict[str, Any], response.json())


def test_booking_windows_are_server_authored_and_quote_is_complete() -> None:
    client, _customer, address, windows = _booking_context()

    assert windows["availability_is_preliminary"] is True
    assert windows["estimated_duration_minutes"] == SWITCH_VISIT_DURATION_MINUTES
    assert len(windows["days"]) == EXPECTED_BOOKING_DAY_COUNT
    assert all(window["id"] for day in windows["days"] for window in day["windows"])

    quote = _create_quote(client, address, windows)

    assert quote["version"] == 1
    assert quote["estimated_duration_minutes"] == SWITCH_VISIT_DURATION_MINUTES
    assert quote["arrival_window"]["id"] == _first_available_window(windows)["id"]
    assert quote["lines"] == [
        {
            "code": "task.switch-socket-repair",
            "label": "Switch / Socket Repair x 1",
            "amount": {"amount_paise": 12_900, "currency": "INR"},
        },
        {
            "code": "minimum_visit_topup",
            "label": "Minimum visit charge top-up",
            "amount": {"amount_paise": 7_000, "currency": "INR"},
        },
    ]
    assert quote["subtotal"] == {"amount_paise": 19_900, "currency": "INR"}
    assert quote["platform_fee"]["amount"] == {
        "amount_paise": 2_900,
        "currency": "INR",
    }
    assert quote["tax"] == {
        "code": "tax.gst",
        "label": "GST (included in total)",
        "amount": {"amount_paise": 3_478, "currency": "INR"},
        "included_in_total": True,
    }
    assert quote["total"] == {"amount_paise": 22_800, "currency": "INR"}
    assert [band["fee"]["amount_paise"] for band in quote["cancellation_policy"]["bands"]] == [
        0,
        4_900,
        9_900,
        14_900,
    ]
    assert quote["expires_at"] > quote["server_now"]


def test_tampered_or_stale_window_is_rejected_with_stable_conflict() -> None:
    client, _customer, address, windows = _booking_context()
    window_id = _first_available_window(windows)["id"]

    response = client.post(
        "/api/v1/quotes/",
        {"address_id": address["id"], "window_id": f"{window_id}tampered"},
        format="json",
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "window_no_longer_available"


def test_cart_requires_explicit_confirmation_before_replacing_a_service() -> None:
    client, _customer, address, windows = _booking_context()
    quote = _create_quote(client, address, windows)
    replacement = ServiceVariant.objects.get(service__slug="fan-installation")
    payload = {
        "variant_id": str(replacement.id),
        "quantity": 1,
        "scope": {"quantity": 1},
    }

    conflict = client.put("/api/v1/cart/", payload, format="json")

    assert conflict.status_code == HTTPStatus.CONFLICT
    assert conflict.json()["error"]["code"] == "cart_item_limit_reached"
    assert conflict.json()["error"]["details"]["existing_item"]["service_slug"] == (
        "switch-socket-repair"
    )
    assert conflict.json()["error"]["details"]["confirmation_required"] == "replace_existing"

    replacement_response = client.put(
        "/api/v1/cart/",
        {**payload, "replace_existing": True},
        format="json",
    )
    assert replacement_response.status_code == HTTPStatus.OK
    assert replacement_response.json()["variant_id"] == str(replacement.id)
    assert Quote.objects.filter(id=quote["id"]).exists()


def test_expired_quote_is_rejected_at_checkout() -> None:
    client, _customer, address, windows = _booking_context()
    quote = _create_quote(client, address, windows)
    Quote.objects.filter(id=quote["id"]).update(expires_at=timezone.now())

    response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="expired-quote",
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "quote_expired"


def test_checkout_revalidates_operating_hours_after_quote() -> None:
    client, _customer, address, windows = _booking_context()
    quote = _create_quote(client, address, windows)
    requested_start = Quote.objects.get(id=quote["id"]).requested_start
    ServiceAreaOperatingWindow.objects.filter(weekday=requested_start.weekday()).delete()

    response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="closed-window",
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "window_no_longer_available"


@pytest.mark.django_db(transaction=True)
def test_concurrent_cart_writes_cannot_create_two_items() -> None:
    call_command("seed_technician_catalog")
    customer = User.objects.create_user(phone_number="+919876543210")
    Cart.objects.create(customer=customer)
    variants = list(
        ServiceVariant.objects.filter(
            service__slug__in=("switch-socket-repair", "fan-installation")
        ).order_by("service__slug")
    )

    def write(variant: ServiceVariant) -> str:
        close_old_connections()
        try:
            replace_cart_item(
                user=customer,
                session_key="unused-authenticated-session",
                variant_id=variant.id,
                quantity=1,
                scope={"quantity": 1},
            )
        except CartItemLimitReachedApiError:
            return "conflict"
        finally:
            connections.close_all()
        return "created"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(write, variants))

    assert sorted(results) == ["conflict", "created"]
    assert CartItem.objects.filter(cart__customer=customer).count() == 1
