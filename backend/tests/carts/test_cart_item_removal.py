"""Proposal 0007 — the typed, versioned cart-item removal command.

Removal already worked in Django but was unreachable from a generated client,
because drf-spectacular drops a DELETE request body.  These regressions cover the
published `POST /cart/items/{item_id}/remove/` sibling, the retained DELETE route
that must run the identical command, and the properties the Customer cart depends
on: exactly one row leaves, siblings are untouched, and both optimistic guards
refuse rather than guess.
"""

from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from threading import Barrier
from typing import Any, cast

import pytest
from django.core.management import call_command
from django.db import close_old_connections, connections
from rest_framework.test import APIClient

from apps.carts.exceptions import CartItemNotFoundApiError, CartVersionConflictApiError
from apps.carts.models import Cart, CartItem
from apps.carts.services import remove_cart_item, update_cart_item
from apps.catalog.models import ServiceVariant
from apps.identity.models import User

pytestmark = pytest.mark.django_db

TWO_ITEMS = 2
FIRST_SLUG = "switch-socket-repair"
SECOND_SLUG = "fan-installation"
REMOVED_ITEM_VERSION = 2
UPDATED_QUANTITY = 3


def _add_item(client: APIClient, *, slug: str, cart_version: int) -> dict[str, Any]:
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
    assert response.status_code == HTTPStatus.CREATED
    return cast(dict[str, Any], response.json())


def _two_item_cart(client: APIClient) -> dict[str, Any]:
    cart = client.get("/api/v1/cart/")
    assert cart.status_code == HTTPStatus.OK
    _add_item(client, slug=FIRST_SLUG, cart_version=cart.json()["version"])
    return _add_item(client, slug=SECOND_SLUG, cart_version=cart.json()["version"] + 1)


def _customer_client(*, phone_number: str = "+919876543210") -> tuple[APIClient, User]:
    customer = User.objects.create_user(phone_number=phone_number)
    client = APIClient()
    client.force_authenticate(customer)
    return client, customer


def _comparable(error: dict[str, Any]) -> dict[str, Any]:
    """Everything an intruder can read, minus the per-request correlation id."""
    return {key: value for key, value in error.items() if key != "request_id"}


def _item(cart: dict[str, Any], slug: str) -> dict[str, Any]:
    return next(item for item in cart["items"] if item["service_slug"] == slug)


def _remove(
    client: APIClient,
    *,
    item_id: str,
    cart_version: int,
    item_version: int,
) -> Any:
    return client.post(
        f"/api/v1/cart/items/{item_id}/remove/",
        {
            "expected_cart_version": cart_version,
            "expected_item_version": item_version,
        },
        format="json",
    )


def test_removing_one_of_two_items_returns_the_complete_updated_cart() -> None:
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    cart = _two_item_cart(client)
    removed = _item(cart, FIRST_SLUG)
    kept = _item(cart, SECOND_SLUG)

    response = _remove(
        client,
        item_id=removed["id"],
        cart_version=cart["version"],
        item_version=removed["version"],
    )

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["id"] == cart["id"]
    assert body["version"] == cart["version"] + 1
    assert [item["id"] for item in body["items"]] == [kept["id"]]
    assert CartItem.objects.get(id=removed["id"]).removed_at is not None
    assert CartItem.objects.get(id=removed["id"]).version == REMOVED_ITEM_VERSION


def test_removal_does_not_touch_any_sibling_row() -> None:
    """Acceptance criterion 5 — the surviving row must be byte-for-byte the same."""
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    cart = _two_item_cart(client)
    removed = _item(cart, FIRST_SLUG)
    kept = _item(cart, SECOND_SLUG)

    response = _remove(
        client,
        item_id=removed["id"],
        cart_version=cart["version"],
        item_version=removed["version"],
    )

    assert response.status_code == HTTPStatus.OK
    survivor = response.json()["items"][0]
    assert survivor["id"] == kept["id"]
    assert survivor["version"] == kept["version"]
    assert survivor["quantity"] == kept["quantity"]
    assert survivor["scope"] == kept["scope"]
    assert survivor["variant_id"] == kept["variant_id"]
    stored = CartItem.objects.get(id=kept["id"])
    assert stored.removed_at is None
    assert stored.version == kept["version"]
    assert stored.quantity == kept["quantity"]


def test_stale_expected_cart_version_removes_nothing() -> None:
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    cart = _two_item_cart(client)
    removed = _item(cart, FIRST_SLUG)

    response = _remove(
        client,
        item_id=removed["id"],
        cart_version=cart["version"] - 1,
        item_version=removed["version"],
    )

    assert response.status_code == HTTPStatus.CONFLICT
    error = response.json()["error"]
    assert error["code"] == "cart_version_conflict"
    assert error["details"]["current_version"] == cart["version"]
    assert error["details"]["conflicting_field"] == "expected_cart_version"
    assert CartItem.objects.filter(cart_id=cart["id"], removed_at__isnull=True).count() == TWO_ITEMS
    assert Cart.objects.get(id=cart["id"]).version == cart["version"]


def test_stale_expected_item_version_removes_nothing() -> None:
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    cart = _two_item_cart(client)
    removed = _item(cart, FIRST_SLUG)

    response = _remove(
        client,
        item_id=removed["id"],
        cart_version=cart["version"],
        item_version=removed["version"] + 1,
    )

    assert response.status_code == HTTPStatus.CONFLICT
    error = response.json()["error"]
    assert error["code"] == "cart_version_conflict"
    assert error["details"]["current_version"] == cart["version"]
    assert error["details"]["conflicting_field"] == "expected_item_version"
    assert CartItem.objects.filter(cart_id=cart["id"], removed_at__isnull=True).count() == TWO_ITEMS
    assert Cart.objects.get(id=cart["id"]).version == cart["version"]


def test_removing_an_already_removed_item_is_not_found_rather_than_success() -> None:
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    cart = _two_item_cart(client)
    removed = _item(cart, FIRST_SLUG)
    first = _remove(
        client,
        item_id=removed["id"],
        cart_version=cart["version"],
        item_version=removed["version"],
    )
    assert first.status_code == HTTPStatus.OK

    second = _remove(
        client,
        item_id=removed["id"],
        cart_version=first.json()["version"],
        item_version=removed["version"],
    )

    assert second.status_code == HTTPStatus.CONFLICT
    assert second.json()["error"]["code"] == "cart_item_not_found"
    assert Cart.objects.get(id=cart["id"]).version == first.json()["version"]


def test_replaying_an_accepted_removal_never_removes_a_second_item() -> None:
    """The version pair, not an Idempotency-Key, is the replay protection."""
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    cart = _two_item_cart(client)
    removed = _item(cart, FIRST_SLUG)
    kept = _item(cart, SECOND_SLUG)
    accepted = _remove(
        client,
        item_id=removed["id"],
        cart_version=cart["version"],
        item_version=removed["version"],
    )
    assert accepted.status_code == HTTPStatus.OK

    replay = _remove(
        client,
        item_id=removed["id"],
        cart_version=cart["version"],
        item_version=removed["version"],
    )

    assert replay.status_code == HTTPStatus.CONFLICT
    assert replay.json()["error"]["code"] == "cart_item_not_found"
    assert CartItem.objects.get(id=kept["id"]).removed_at is None
    assert Cart.objects.filter(id=cart["id"], version=accepted.json()["version"]).exists()


def test_another_customer_cannot_remove_an_item_and_learns_nothing_about_it() -> None:
    call_command("seed_technician_catalog")
    owner_client, _owner = _customer_client(phone_number="+919876543210")
    cart = _two_item_cart(owner_client)
    target = _item(cart, FIRST_SLUG)
    intruder_client, _intruder = _customer_client(phone_number="+919876543211")
    intruder_cart = intruder_client.get("/api/v1/cart/").json()

    response = _remove(
        intruder_client,
        item_id=target["id"],
        cart_version=intruder_cart["version"],
        item_version=target["version"],
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "cart_item_not_found"
    # The refusal is identical to a genuinely unknown id, so it is not an oracle
    # for what lives in someone else's cart.
    unknown = _remove(
        intruder_client,
        item_id="6f1c2b8e-6d61-4f6a-9a0e-1a4c1f0b7a21",
        cart_version=intruder_cart["version"],
        item_version=1,
    )
    assert unknown.status_code == response.status_code
    assert _comparable(unknown.json()["error"]) == _comparable(response.json()["error"])
    stored = CartItem.objects.get(id=target["id"])
    assert stored.removed_at is None
    assert stored.version == target["version"]
    assert Cart.objects.get(id=cart["id"]).version == cart["version"]


def test_an_anonymous_session_cart_can_remove_its_own_item() -> None:
    call_command("seed_technician_catalog")
    client = APIClient()
    cart = _two_item_cart(client)
    removed = _item(cart, FIRST_SLUG)

    response = _remove(
        client,
        item_id=removed["id"],
        cart_version=cart["version"],
        item_version=removed["version"],
    )

    assert response.status_code == HTTPStatus.OK
    assert len(response.json()["items"]) == 1


def test_the_removal_command_requires_both_expected_versions() -> None:
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    cart = _two_item_cart(client)
    removed = _item(cart, FIRST_SLUG)

    response = client.post(
        f"/api/v1/cart/items/{removed['id']}/remove/",
        {"expected_cart_version": cart["version"]},
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert CartItem.objects.get(id=removed["id"]).removed_at is None


def test_the_legacy_delete_route_runs_the_same_command() -> None:
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    cart = _two_item_cart(client)
    removed = _item(cart, FIRST_SLUG)
    kept = _item(cart, SECOND_SLUG)

    response = client.delete(
        f"/api/v1/cart/items/{removed['id']}/",
        {
            "expected_cart_version": cart["version"],
            "expected_item_version": removed["version"],
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert [item["id"] for item in response.json()["items"]] == [kept["id"]]
    assert response.json()["version"] == cart["version"] + 1

    stale = client.delete(
        f"/api/v1/cart/items/{removed['id']}/",
        {
            "expected_cart_version": cart["version"],
            "expected_item_version": removed["version"],
        },
        format="json",
    )
    assert stale.status_code == HTTPStatus.CONFLICT
    assert stale.json()["error"]["code"] == "cart_item_not_found"


def test_the_service_refuses_both_stale_guards_without_going_through_http() -> None:
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    payload = _two_item_cart(client)
    cart = Cart.objects.get(id=payload["id"])
    target = CartItem.objects.get(id=_item(payload, FIRST_SLUG)["id"])

    with pytest.raises(CartVersionConflictApiError):
        remove_cart_item(
            cart=cart,
            item_id=target.id,
            expected_cart_version=cart.version - 1,
            expected_item_version=target.version,
        )
    with pytest.raises(CartVersionConflictApiError):
        remove_cart_item(
            cart=cart,
            item_id=target.id,
            expected_cart_version=cart.version,
            expected_item_version=target.version + 1,
        )
    assert CartItem.objects.filter(cart=cart, removed_at__isnull=True).count() == TWO_ITEMS

    removed = remove_cart_item(
        cart=cart,
        item_id=target.id,
        expected_cart_version=cart.version,
        expected_item_version=target.version,
    )

    assert removed.version == cart.version + 1
    with pytest.raises(CartItemNotFoundApiError):
        remove_cart_item(
            cart=cart,
            item_id=target.id,
            expected_cart_version=removed.version,
            expected_item_version=target.version + 1,
        )


@pytest.mark.django_db(transaction=True)
def test_concurrent_edit_and_removal_have_one_serialized_winner() -> None:
    """A real PostgreSQL race: both commands claim the same cart version."""
    call_command("seed_technician_catalog")
    client, _customer = _customer_client()
    payload = _two_item_cart(client)
    cart = Cart.objects.get(id=payload["id"])
    edited = CartItem.objects.get(id=_item(payload, SECOND_SLUG)["id"])
    removed = CartItem.objects.get(id=_item(payload, FIRST_SLUG)["id"])
    cart_version = cart.version
    barrier = Barrier(2)

    def edit_worker() -> str:
        close_old_connections()
        try:
            barrier.wait()
            try:
                update_cart_item(
                    cart=cart,
                    item_id=edited.id,
                    expected_cart_version=cart_version,
                    expected_item_version=edited.version,
                    quantity=UPDATED_QUANTITY,
                    scope={"quantity": UPDATED_QUANTITY},
                )
            except CartVersionConflictApiError:
                return "EDIT_REFUSED"
            return "EDIT_COMMITTED"
        finally:
            connections.close_all()

    def remove_worker() -> str:
        close_old_connections()
        try:
            barrier.wait()
            try:
                remove_cart_item(
                    cart=cart,
                    item_id=removed.id,
                    expected_cart_version=cart_version,
                    expected_item_version=removed.version,
                )
            except CartVersionConflictApiError:
                return "REMOVE_REFUSED"
            return "REMOVE_COMMITTED"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        edit_future = pool.submit(edit_worker)
        remove_future = pool.submit(remove_worker)
        edit_outcome = edit_future.result(timeout=15)
        remove_outcome = remove_future.result(timeout=15)

    cart.refresh_from_db()
    edited.refresh_from_db()
    removed.refresh_from_db()
    assert cart.version == cart_version + 1
    assert {edit_outcome, remove_outcome} in (
        {"EDIT_COMMITTED", "REMOVE_REFUSED"},
        {"EDIT_REFUSED", "REMOVE_COMMITTED"},
    )
    if remove_outcome == "REMOVE_COMMITTED":
        assert removed.removed_at is not None
        assert edited.quantity == 1
        assert edited.version == 1
    else:
        assert removed.removed_at is None
        assert removed.version == 1
        assert edited.quantity == UPDATED_QUANTITY
